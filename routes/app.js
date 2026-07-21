const express = require('express');
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

const router = express.Router();

const STATUS_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/i;
const MAX_STATUS_ERRORS = 100;

// Store app status updates (in production, use a proper database)
let appStatus = {
  lastSeen: null,
  status: 'unknown',
  version: null,
  configVersion: null,
  activeUsers: 0,
  errors: []
};

function normalizeOptionalString(value, fallback = null, maxLength = 120) {
  if (value === undefined || value === null) {
    return fallback;
  }

  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized.slice(0, maxLength) : fallback;
}

function normalizeActiveUsers(value) {
  if (value === undefined || value === null || value === '') {
    return appStatus.activeUsers;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : appStatus.activeUsers;
}

function normalizeStatusErrors(value) {
  if (value === undefined || value === null) {
    return appStatus.errors;
  }

  const items = Array.isArray(value) ? value : [value];
  return items
    .slice(0, MAX_STATUS_ERRORS)
    .map((item, index) => {
      if (typeof item === 'string') {
        const message = normalizeOptionalString(item, null, 500);
        return message
          ? {
              id: `status-${Date.now()}-${index}`,
              timestamp: new Date().toISOString(),
              message
            }
          : null;
      }

      if (item && typeof item === 'object') {
        const message = normalizeOptionalString(
          item.message || item.error || JSON.stringify(item),
          null,
          500
        );
        return message
          ? {
              id: normalizeOptionalString(item.id, `status-${Date.now()}-${index}`, 80),
              timestamp: normalizeOptionalString(item.timestamp, new Date().toISOString(), 80),
              message,
              stack: normalizeOptionalString(item.stack, null, 4000),
              context: item.context && typeof item.context === 'object'
                ? item.context
                : {}
            }
          : null;
      }

      return null;
    })
    .filter(Boolean);
}

function safeEmitToConfigClients(req, event, payload) {
  if (!req.io || typeof req.io.to !== 'function') {
    return;
  }

  try {
    const room = req.io.to('config-updates');
    if (room && typeof room.emit === 'function') {
      room.emit(event, payload);
    }
  } catch (error) {
    logger.warn(`Skipped ${event} broadcast`, {
      message: error.message,
      stack: error.stack
    });
  }
}

// Health check endpoint for the main app
router.get('/ping', (req, res) => {
  res.json({
    message: 'Admin panel is running',
    timestamp: new Date().toISOString(),
    status: 'healthy'
  });
});

// Receive status updates from the main app
router.post('/status', [
  body('status')
    .isString()
    .trim()
    .matches(STATUS_PATTERN)
    .withMessage('Status must be a safe app status string'),
  body('version').optional({ nullable: true }).isString().isLength({ max: 120 }).withMessage('Version must be a string'),
  body('configVersion').optional({ nullable: true }).isString().isLength({ max: 120 }).withMessage('Config version must be a string'),
  body('activeUsers').optional({ nullable: true }).custom((value) => {
    if (value === '') return true;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0;
  }).withMessage('Active users must be a non-negative integer'),
  body('errors').optional({ nullable: true }).custom((value) => {
    return Array.isArray(value) || typeof value === 'string';
  }).withMessage('Errors must be an array or string')
], (req, res) => {
  try {
    const validationErrors = validationResult(req);
    if (!validationErrors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validationErrors.array()
      });
    }

    const { status, version, configVersion, activeUsers, errors: appErrors } = req.body;
    
    // Update app status
    appStatus = {
      lastSeen: new Date().toISOString(),
      status: normalizeOptionalString(status, appStatus.status, 64),
      version: normalizeOptionalString(version, appStatus.version, 120),
      configVersion: normalizeOptionalString(configVersion, appStatus.configVersion, 120),
      activeUsers: normalizeActiveUsers(activeUsers),
      errors: normalizeStatusErrors(appErrors)
    };

    logger.info(`App status update received: ${appStatus.status}`);
    
    // Broadcast status update to connected clients via WebSocket
    safeEmitToConfigClients(req, 'app-status-update', appStatus);

    res.json({
      success: true,
      message: 'Status update received',
      timestamp: appStatus.lastSeen,
      appStatus
    });
  } catch (error) {
    logger.error('App status update error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process status update'
    });
  }
});

// Get current app status
router.get('/status', (req, res) => {
  res.json({
    appStatus,
    adminPanel: {
      status: 'running',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }
  });
});

// Receive error reports from the main app
router.post('/error', [
  body('error').isString().withMessage('Error message is required'),
  body('stack').optional().isString().withMessage('Stack trace must be a string'),
  body('context').optional().isObject().withMessage('Context must be an object')
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { error: errorMessage, stack, context } = req.body;
    
    const errorReport = {
      timestamp: new Date().toISOString(),
      message: errorMessage,
      stack: stack || null,
      context: context || {},
      id: Date.now().toString()
    };

    // Add to errors array (keep last 100 errors)
    appStatus.errors.unshift(errorReport);
    if (appStatus.errors.length > 100) {
      appStatus.errors = appStatus.errors.slice(0, 100);
    }

    logger.error(`App error reported: ${errorMessage}`, { stack, context });
    
    // Broadcast error to connected clients
    safeEmitToConfigClients(req, 'app-error', errorReport);

    res.json({
      message: 'Error report received',
      errorId: errorReport.id
    });
  } catch (error) {
    logger.error('App error report processing failed:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process error report'
    });
  }
});

// Clear error history
router.delete('/errors', (req, res) => {
  appStatus.errors = [];
  logger.info('App error history cleared');
  
  // Broadcast error clear to connected clients
  safeEmitToConfigClients(req, 'errors-cleared');

  res.json({
    message: 'Error history cleared'
  });
});

// Send command to the main app (for future use)
router.post('/command', [
  body('command').isIn(['restart', 'reload-config', 'clear-cache']).withMessage('Invalid command'),
  body('parameters').optional().isObject().withMessage('Parameters must be an object')
], (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { command, parameters } = req.body;
    
    logger.info(`Command sent to app: ${command}`, parameters);
    
    // Broadcast command to connected app instances
    if (req.io) {
      req.io.emit('app-command', { command, parameters, timestamp: new Date().toISOString() });
    }

    res.json({
      message: 'Command sent',
      command,
      parameters: parameters || {}
    });
  } catch (error) {
    logger.error('App command error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to send command'
    });
  }
});

module.exports = router;
