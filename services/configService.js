const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class ConfigService {
  constructor() {
    this.configPath = this.resolveConfigPath();
    this.backupDir = path.resolve(process.env.BACKUP_DIR || './backups');
    logger.info('Remote configuration storage initialized', {
      configPath: this.configPath,
      backupDir: this.backupDir,
    });
    this.ensureBackupDir();
  }

  resolveConfigPath() {
    const configuredPath = process.env.ANUME_CONFIG_PATH;
    if (configuredPath && configuredPath.trim()) {
      return path.resolve(configuredPath.trim());
    }

    return path.resolve(process.cwd(), 'config', 'remote_config.json');
  }

  async ensureBackupDir() {
    try {
      await fs.mkdir(this.backupDir, { recursive: true });
    } catch (error) {
      logger.error('Failed to create backup directory:', error);
    }
  }

  // Default configuration template
  getDefaultConfig() {
    const now = new Date().toISOString();
    return {
      apiUrl: 'http://nuconteaza.mmager.ro:8080',
      username: 'test',
      password: 'test',
      activationApiUrl: 'https://www.xtream.ro/appactivation',
      lastUpdated: now,
      isActive: true,
      additionalSettings: {
        timeout: 30000,
        retryAttempts: 3,
        enableLogging: true
      },
      version: now
    };
  }

  getPublicConfig(config) {
    return {
      apiUrl: config.apiUrl,
      activationApiUrl: config.activationApiUrl,
      lastUpdated: config.lastUpdated,
      version: config.version || config.lastUpdated,
      isActive: config.isActive,
      additionalSettings: config.additionalSettings || {}
    };
  }

  // Validate configuration structure
  validateConfig(config) {
    const errors = [];

    if (!config || typeof config !== 'object') {
      errors.push('Configuration must be an object');
      return { isValid: false, errors };
    }

    // Required fields
    const requiredFields = ['apiUrl', 'username', 'password', 'lastUpdated'];
    for (const field of requiredFields) {
      if (!config[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Validate API URL format
    if (config.apiUrl && typeof config.apiUrl === 'string') {
      try {
        new URL(config.apiUrl);
      } catch (e) {
        errors.push('Invalid API URL format');
      }
    }

    // Validate username and password
    if (config.username && typeof config.username !== 'string') {
      errors.push('Username must be a string');
    }
    if (config.password && typeof config.password !== 'string') {
      errors.push('Password must be a string');
    }

    // Validate lastUpdated
    if (config.lastUpdated && isNaN(Date.parse(config.lastUpdated))) {
      errors.push('Invalid lastUpdated date format');
    }

    // Validate isActive
    if (config.isActive !== undefined && typeof config.isActive !== 'boolean') {
      errors.push('isActive must be a boolean');
    }

    // Validate additionalSettings
    if (config.additionalSettings && typeof config.additionalSettings !== 'object') {
      errors.push('additionalSettings must be an object');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Read current configuration
  async readConfig() {
    try {
      const configExists = await this.configExists();
      if (!configExists) {
        logger.info('Configuration file does not exist, returning default config');
        return this.getDefaultConfig();
      }

      const configData = await fs.readFile(this.configPath, 'utf8');
      const config = JSON.parse(configData);
      
      const validation = this.validateConfig(config);
      if (!validation.isValid) {
        logger.warn('Invalid configuration found, returning default config', validation.errors);
        return this.getDefaultConfig();
      }

      logger.info('Configuration read successfully');
      return config;
    } catch (error) {
      logger.error('Failed to read configuration:', error);
      return this.getDefaultConfig();
    }
  }

  // Write configuration
  async writeConfig(config) {
    try {
      // Validate configuration
      const validation = this.validateConfig(config);
      if (!validation.isValid) {
        throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
      }

      // Create backup before writing
      await this.createBackup();

      // Ensure directory exists
      const configDir = path.dirname(this.configPath);
      await fs.mkdir(configDir, { recursive: true });

      // Update lastUpdated and version so connected apps can detect changes.
      const now = new Date().toISOString();
      config.lastUpdated = now;
      config.version = now;

      // Write configuration atomically to avoid partial or reset-looking files.
      const tempPath = `${this.configPath}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(config, null, 2), 'utf8');
      await fs.rename(tempPath, this.configPath);
      
      logger.info('Configuration written successfully', {
        apiUrl: config.apiUrl,
        username: config.username,
        isActive: config.isActive
      });

      return config;
    } catch (error) {
      logger.error('Failed to write configuration:', error);
      throw error;
    }
  }

  // Check if configuration file exists
  async configExists() {
    try {
      await fs.access(this.configPath);
      return true;
    } catch {
      return false;
    }
  }

  // Create comprehensive backup of all admin panel data
  async createBackup() {
    try {
      // Import database models
      const { models } = require('../database');

      // Generate new backup filename format: full_backup_12am-23min-34sec_07-19-25
      const now = new Date();
      const hours = now.getHours();
      const minutes = now.getMinutes();
      const seconds = now.getSeconds();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const year = String(now.getFullYear()).slice(-2);

      // Convert to 12-hour format with am/pm
      const hour12 = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
      const ampm = hours >= 12 ? 'pm' : 'am';

      const backupFileName = `full_backup_${hour12}${ampm}-${minutes}min-${seconds}sec_${month}-${day}-${year}.json`;
      const backupPath = path.join(this.backupDir, backupFileName);

      // Create comprehensive backup data
      const backupData = {
        metadata: {
          backupType: 'full',
          createdAt: now.toISOString(),
          version: '2.0.0',
          description: 'Complete admin panel backup including all data'
        },
        configuration: {},
        database: {}
      };

      // 1. Backup configuration file
      try {
        const configExists = await this.configExists();
        if (configExists) {
          const configData = await fs.readFile(this.configPath, 'utf8');
          backupData.configuration = JSON.parse(configData);
          logger.info('✅ Configuration data backed up');
        } else {
          logger.warn('⚠️ Configuration file not found, skipping config backup');
          backupData.configuration = null;
        }
      } catch (error) {
        logger.warn('⚠️ Error reading configuration file:', error.message);
        backupData.configuration = null;
      }

      // 2. Backup all database tables
      try {
        // Backup Admins (excluding sensitive data)
        const admins = await models.Admin.findAll({
          attributes: { exclude: ['password'] }, // Exclude passwords for security
          raw: true
        });
        backupData.database.admins = admins;
        logger.info(`✅ Backed up ${admins.length} admin accounts`);

        // Backup Users
        const users = await models.User.findAll({ raw: true });
        backupData.database.users = users;
        logger.info(`✅ Backed up ${users.length} users`);

        // Backup User Sessions
        const userSessions = await models.UserSession.findAll({ raw: true });
        backupData.database.userSessions = userSessions;
        logger.info(`✅ Backed up ${userSessions.length} user sessions`);

        // Backup Admin Sessions (excluding sensitive tokens)
        const adminSessions = await models.AdminSession.findAll({
          attributes: { exclude: ['session_token'] }, // Exclude tokens for security
          raw: true
        });
        backupData.database.adminSessions = adminSessions;
        logger.info(`✅ Backed up ${adminSessions.length} admin sessions`);

        // Backup Chat Conversations
        const chatConversations = await models.ChatConversation.findAll({ raw: true });
        backupData.database.chatConversations = chatConversations;
        logger.info(`✅ Backed up ${chatConversations.length} chat conversations`);

        // Backup Chat Messages
        const chatMessages = await models.ChatMessage.findAll({ raw: true });
        backupData.database.chatMessages = chatMessages;
        logger.info(`✅ Backed up ${chatMessages.length} chat messages`);

        // Backup VPN Servers
        const vpnServers = await models.VpnServer.findAll({ raw: true });
        backupData.database.vpnServers = vpnServers;
        logger.info(`✅ Backed up ${vpnServers.length} VPN servers`);

      } catch (dbError) {
        logger.error('Error backing up database:', dbError);
        backupData.database.error = `Database backup failed: ${dbError.message}`;
      }

      // 3. Add backup statistics
      backupData.statistics = {
        totalAdmins: backupData.database.admins?.length || 0,
        totalUsers: backupData.database.users?.length || 0,
        totalUserSessions: backupData.database.userSessions?.length || 0,
        totalAdminSessions: backupData.database.adminSessions?.length || 0,
        totalChatConversations: backupData.database.chatConversations?.length || 0,
        totalChatMessages: backupData.database.chatMessages?.length || 0,
        totalVpnServers: backupData.database.vpnServers?.length || 0,
        backupSizeBytes: 0 // Will be calculated after writing
      };

      // Write backup to file
      const backupJson = JSON.stringify(backupData, null, 2);
      await fs.writeFile(backupPath, backupJson, 'utf8');

      // Update backup size
      const stats = await fs.stat(backupPath);
      backupData.statistics.backupSizeBytes = stats.size;

      // Rewrite with updated size
      await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2), 'utf8');

      logger.info(`🎉 Complete admin panel backup created: ${backupFileName}`);
      logger.info(`📊 Backup contains: ${backupData.statistics.totalUsers} users, ${backupData.statistics.totalAdmins} admins, ${backupData.statistics.totalChatMessages} messages, ${backupData.statistics.totalVpnServers} VPN servers`);

      return backupFileName;
    } catch (error) {
      logger.error('Failed to create comprehensive backup:', error);
      throw error;
    }
  }

  // List available backups with detailed information
  async listBackups() {
    try {
      const files = await fs.readdir(this.backupDir);
      const backups = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        // Support multiple backup formats
        const isOldConfig = file.startsWith('remote_config_backup_');
        const isOldDatabase = file.startsWith('database_backup_');
        const isNewFull = file.startsWith('full_backup_');
        const isNewConfig = file.startsWith('config_backup_');

        if (!isOldConfig && !isOldDatabase && !isNewFull && !isNewConfig) continue;

        let timestamp;
        let parsedDate;
        let backupType = 'unknown';
        let backupInfo = {};

        try {
          // Parse filename for timestamp
          if (isNewFull) {
            // New format: full_backup_12am-23min-34sec_07-19-25.json
            const match = file.match(/full_backup_(\d+)(am|pm)-(\d+)min-(\d+)sec_(\d+)-(\d+)-(\d+)\.json$/);
            if (match) {
              const [, hour12, ampm, minutes, seconds, month, day, year] = match;
              let hour24 = parseInt(hour12);
              if (ampm === 'pm' && hour24 !== 12) hour24 += 12;
              if (ampm === 'am' && hour24 === 12) hour24 = 0;

              const fullYear = 2000 + parseInt(year);
              parsedDate = new Date(fullYear, parseInt(month) - 1, parseInt(day), hour24, parseInt(minutes), parseInt(seconds));
              timestamp = parsedDate.toISOString();
              backupType = 'full';
            }
          } else if (isOldDatabase) {
            // Old database format: database_backup_12am-23min-34sec_07-19-25.json
            const match = file.match(/database_backup_(\d+)(am|pm)-(\d+)min-(\d+)sec_(\d+)-(\d+)-(\d+)\.json$/);
            if (match) {
              const [, hour12, ampm, minutes, seconds, month, day, year] = match;
              let hour24 = parseInt(hour12);
              if (ampm === 'pm' && hour24 !== 12) hour24 += 12;
              if (ampm === 'am' && hour24 === 12) hour24 = 0;

              const fullYear = 2000 + parseInt(year);
              parsedDate = new Date(fullYear, parseInt(month) - 1, parseInt(day), hour24, parseInt(minutes), parseInt(seconds));
              timestamp = parsedDate.toISOString();
              backupType = 'config-only';
            }
          } else if (isNewConfig) {
            // New config format: config_backup_12am-23min-34sec_07-19-25.json
            const match = file.match(/config_backup_(\d+)(am|pm)-(\d+)min-(\d+)sec_(\d+)-(\d+)-(\d+)\.json$/);
            if (match) {
              const [, hour12, ampm, minutes, seconds, month, day, year] = match;
              let hour24 = parseInt(hour12);
              if (ampm === 'pm' && hour24 !== 12) hour24 += 12;
              if (ampm === 'am' && hour24 === 12) hour24 = 0;

              const fullYear = 2000 + parseInt(year);
              parsedDate = new Date(fullYear, parseInt(month) - 1, parseInt(day), hour24, parseInt(minutes), parseInt(seconds));
              timestamp = parsedDate.toISOString();
              backupType = 'config-only';
            }
          } else if (isOldConfig) {
            // Old config format: remote_config_backup_2025-07-18T19-31-00-922Z.json
            const oldTimestamp = file.replace('remote_config_backup_', '').replace('.json', '');
            timestamp = oldTimestamp.replace(/-/g, ':');
            parsedDate = new Date(timestamp);
            backupType = 'config-only';
          }

          // Read backup file to get detailed information
          const backupPath = path.join(this.backupDir, file);
          const backupContent = await fs.readFile(backupPath, 'utf8');
          const backupData = JSON.parse(backupContent);

          // Extract backup information based on format
          if (backupData.metadata && backupData.statistics) {
            // New full backup format
            backupInfo = {
              type: backupData.metadata.backupType || 'full',
              version: backupData.metadata.version || '2.0.0',
              description: backupData.metadata.description || 'Complete backup',
              statistics: backupData.statistics,
              hasConfiguration: !!backupData.configuration,
              hasDatabase: !!backupData.database && Object.keys(backupData.database).length > 0
            };
          } else if (backupData.backupType === 'config-only' && backupData.backupDate) {
            // New config-only backup format
            backupInfo = {
              type: 'config-only',
              version: backupData.backupVersion || '1.0',
              description: 'Configuration backup only',
              statistics: {
                totalAdmins: 0,
                totalUsers: 0,
                totalChatMessages: 0,
                totalVpnServers: 0,
                backupSizeBytes: Buffer.byteLength(backupContent, 'utf8')
              },
              hasConfiguration: true,
              hasDatabase: false
            };
          } else {
            // Old format - just configuration
            backupInfo = {
              type: 'config-only',
              version: '1.0.0',
              description: 'Configuration backup only',
              statistics: {
                totalAdmins: 0,
                totalUsers: 0,
                totalChatMessages: 0,
                totalVpnServers: 0,
                backupSizeBytes: Buffer.byteLength(backupContent, 'utf8')
              },
              hasConfiguration: true,
              hasDatabase: false
            };
          }

          // Get file size
          const stats = await fs.stat(backupPath);
          backupInfo.fileSizeBytes = stats.size;
          backupInfo.fileSizeFormatted = this.formatFileSize(stats.size);

        } catch (parseError) {
          logger.warn(`Error parsing backup file ${file}:`, parseError.message);
          parsedDate = new Date();
          timestamp = parsedDate.toISOString();
          backupInfo = {
            type: 'corrupted',
            error: parseError.message
          };
        }

        backups.push({
          filename: file,
          timestamp: timestamp,
          parsedDate: parsedDate,
          path: path.join(this.backupDir, file),
          backupType: backupType,
          info: backupInfo
        });
      }

      // Sort by date (newest first)
      return backups.sort((a, b) => b.parsedDate - a.parsedDate);
    } catch (error) {
      logger.error('Failed to list backups:', error);
      throw error;
    }
  }

  // Helper method to format file size
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // Delete backup file
  async deleteBackup(backupFileName) {
    try {
      const backupPath = path.join(this.backupDir, backupFileName);

      // Check if backup exists
      try {
        await fs.access(backupPath);
      } catch {
        logger.warn(`Backup file not found: ${backupFileName}`);
        return false;
      }

      // Delete the backup file
      await fs.unlink(backupPath);

      logger.info(`Backup deleted successfully: ${backupFileName}`);
      return true;
    } catch (error) {
      logger.error('Failed to delete backup:', error);
      throw error;
    }
  }

  // Restore from backup (supports both old config-only and new full backups)
  async restoreFromBackup(backupFileName, options = {}) {
    try {
      const { restoreDatabase = true, restoreConfiguration = true, currentUserId = null } = options;
      const backupPath = path.join(this.backupDir, backupFileName);

      // Check if backup exists
      try {
        await fs.access(backupPath);
      } catch {
        throw new Error('Backup file not found');
      }

      // Read backup
      const backupData = await fs.readFile(backupPath, 'utf8');
      const backupContent = JSON.parse(backupData);

      let restoredItems = [];

      // Determine backup format and restore accordingly
      if (backupContent.metadata && backupContent.metadata.backupType === 'full') {
        // New full backup format
        logger.info(`🔄 Restoring from full backup: ${backupFileName}`);

        // Create backup of current state before restoring
        await this.createBackup();

        // 1. Restore configuration if requested and available
        if (restoreConfiguration && backupContent.configuration) {
          const validation = this.validateConfig(backupContent.configuration);
          if (validation.isValid) {
            await this.writeConfig(backupContent.configuration);
            restoredItems.push('configuration');
            logger.info('✅ Configuration restored successfully');
          } else {
            logger.warn(`⚠️ Skipping invalid configuration: ${validation.errors.join(', ')}`);
          }
        }

        // 2. Restore database if requested and available
        if (restoreDatabase && backupContent.database) {
          const { models, sequelize } = require('../database');

          try {
            // Start transaction for database restore
            const transaction = await sequelize.transaction();

            try {
              // Disable foreign key constraints to avoid constraint violations during restore
              await sequelize.query('PRAGMA foreign_keys = OFF', { transaction });
              logger.info('🔧 Disabled foreign key constraints for restore');

              // Restore Admins (preserving current user's password and session)
              if (backupContent.database.admins && backupContent.database.admins.length > 0) {
                // Get current admin info before clearing (including password)
                let currentAdmin = null;
                if (currentUserId) {
                  currentAdmin = await models.Admin.findByPk(currentUserId, {
                    transaction,
                    attributes: ['id', 'username', 'password', 'role', 'email', 'full_name', 'is_active']
                  });
                }

                // Clear existing admins
                await models.Admin.destroy({ where: {}, transaction });

                // Restore admins
                for (const admin of backupContent.database.admins) {
                  const adminData = {
                    ...admin,
                    createdAt: admin.createdAt || new Date(),
                    updatedAt: new Date()
                  };

                  // If this is the current user (match by username), preserve their current password and use current ID
                  if (currentAdmin && admin.username === currentAdmin.username) {
                    adminData.id = currentAdmin.id; // Use current admin's ID to maintain JWT compatibility
                    adminData.password = currentAdmin.password; // Preserve current password hash
                    adminData.role = currentAdmin.role; // Preserve current role
                    logger.info(`✅ Preserved current admin session for user: ${admin.username} (ID: ${currentAdmin.id})`);
                  } else {
                    // For other admins, set a default password that requires reset
                    adminData.password = '$2a$10$defaultPasswordHashThatRequiresReset'; // Placeholder hash
                  }

                  await models.Admin.create(adminData, { transaction });
                }
                logger.info(`✅ Restored ${backupContent.database.admins.length} admin accounts (preserved current user session)`);
              }

              // Restore Users - ALWAYS clear existing users first, even if backup has 0 users
              await models.User.destroy({ where: {}, transaction });

              if (backupContent.database.users && backupContent.database.users.length > 0) {
                // Process users data to handle any data type issues
                const processedUsers = backupContent.database.users.map(user => ({
                  ...user,
                  // Ensure proper data types
                  is_active: user.is_active ? 1 : 0,
                  is_online: user.is_online ? 1 : 0,
                  max_connections: parseInt(user.max_connections) || 1,
                  current_connections: parseInt(user.current_connections) || 0,
                  total_connections: parseInt(user.total_connections) || 0,
                  // Handle dates properly
                  expiry_date: user.expiry_date ? new Date(user.expiry_date) : null,
                  last_login: user.last_login ? new Date(user.last_login) : null,
                  last_activity: user.last_activity ? new Date(user.last_activity) : null,
                  createdAt: user.createdAt ? new Date(user.createdAt) : new Date(),
                  updatedAt: user.updatedAt ? new Date(user.updatedAt) : new Date()
                }));

                await models.User.bulkCreate(processedUsers, {
                  transaction,
                  ignoreDuplicates: false
                });
                logger.info(`✅ Restored ${processedUsers.length} users`);
              } else {
                logger.info(`✅ Restored 0 users (backup contained no users)`);
              }

              // Restore User Sessions
              if (backupContent.database.userSessions && backupContent.database.userSessions.length > 0) {
                await models.UserSession.destroy({ where: {}, transaction });
                await models.UserSession.bulkCreate(backupContent.database.userSessions, { transaction });
                logger.info(`✅ Restored ${backupContent.database.userSessions.length} user sessions`);
              }

              // Handle Admin Sessions (preserve current session to avoid logout)
              if (backupContent.database.adminSessions && backupContent.database.adminSessions.length > 0) {
                // Get current admin session before clearing
                let currentAdminSession = null;
                if (currentUserId) {
                  currentAdminSession = await models.AdminSession.findOne({
                    where: { admin_id: currentUserId, status: 'active' },
                    order: [['started_at', 'DESC']],
                    transaction
                  });
                }

                // Clear existing admin sessions
                await models.AdminSession.destroy({ where: {}, transaction });

                // Don't restore old admin sessions - they might conflict with current session
                // Instead, just preserve the current admin session if it exists
                if (currentAdminSession) {
                  // Create the current session to ensure the user stays logged in
                  await models.AdminSession.create({
                    ...currentAdminSession.dataValues,
                    id: currentAdminSession.id,
                    admin_id: currentUserId, // Ensure it uses the current admin ID
                    updatedAt: new Date()
                  }, { transaction });
                  logger.info(`✅ Preserved current admin session for user ID: ${currentUserId}`);
                } else {
                  logger.warn(`⚠️ No current admin session found to preserve`);
                }

                logger.info(`✅ Restored ${backupContent.database.adminSessions.length} admin sessions (current session preserved)`);
              }

              // Restore Chat Conversations
              if (backupContent.database.chatConversations && backupContent.database.chatConversations.length > 0) {
                await models.ChatConversation.destroy({ where: {}, transaction });
                await models.ChatConversation.bulkCreate(backupContent.database.chatConversations, { transaction });
                logger.info(`✅ Restored ${backupContent.database.chatConversations.length} chat conversations`);
              }

              // Restore Chat Messages
              if (backupContent.database.chatMessages && backupContent.database.chatMessages.length > 0) {
                await models.ChatMessage.destroy({ where: {}, transaction });
                await models.ChatMessage.bulkCreate(backupContent.database.chatMessages, { transaction });
                logger.info(`✅ Restored ${backupContent.database.chatMessages.length} chat messages`);
              }

              // Restore VPN Servers - ALWAYS clear existing servers first, even if backup has 0 servers
              await models.VpnServer.destroy({ where: {}, transaction });

              if (backupContent.database.vpnServers && backupContent.database.vpnServers.length > 0) {
                // Process VPN servers data
                const processedServers = backupContent.database.vpnServers.map(server => ({
                  ...server,
                  // Ensure proper data types
                  port: parseInt(server.port) || 1194,
                  speed: parseInt(server.speed) || 100,
                  max_connections: parseInt(server.max_connections) || 100,
                  server_load: parseFloat(server.server_load) || 0,
                  is_active: server.is_active ? 1 : 0,
                  is_featured: server.is_featured ? 1 : 0,
                  createdAt: server.createdAt ? new Date(server.createdAt) : new Date(),
                  updatedAt: server.updatedAt ? new Date(server.updatedAt) : new Date()
                }));

                await models.VpnServer.bulkCreate(processedServers, {
                  transaction,
                  ignoreDuplicates: false
                });
                logger.info(`✅ Restored ${processedServers.length} VPN servers`);
              } else {
                logger.info(`✅ Restored 0 VPN servers (backup contained no servers)`);
              }

              // Re-enable foreign key constraints
              await sequelize.query('PRAGMA foreign_keys = ON', { transaction });
              logger.info('🔧 Re-enabled foreign key constraints');

              await transaction.commit();
              restoredItems.push('database');
              logger.info('✅ Database restored successfully');

            } catch (dbError) {
              try {
                // Re-enable foreign key constraints even on error
                await sequelize.query('PRAGMA foreign_keys = ON', { transaction });
                await transaction.rollback();
                logger.error('❌ Database restore failed, transaction rolled back:', dbError);
              } catch (rollbackError) {
                logger.error('❌ Failed to rollback transaction:', rollbackError);
              }
              throw new Error(`Database restore failed: ${dbError.message}`);
            }
          } catch (transactionError) {
            logger.error('❌ Failed to start database transaction:', transactionError);
            throw new Error(`Transaction error: ${transactionError.message}`);
          }
        }

      } else {
        // Old backup format (config only)
        logger.info(`🔄 Restoring from legacy config backup: ${backupFileName}`);

        if (restoreConfiguration) {
          const validation = this.validateConfig(backupContent);
          if (!validation.isValid) {
            throw new Error(`Invalid backup configuration: ${validation.errors.join(', ')}`);
          }

          // Create backup of current config before restoring
          await this.createBackup();

          // Restore configuration
          await this.writeConfig(backupContent);
          restoredItems.push('configuration');
          logger.info('✅ Configuration restored successfully');
        }
      }

      const restoredItemsText = restoredItems.join(' and ');
      logger.info(`🎉 Restore completed successfully: ${restoredItemsText} restored from ${backupFileName}`);

      return {
        success: true,
        restoredItems,
        backupType: backupContent.metadata?.backupType || 'config-only',
        message: `Successfully restored ${restoredItemsText} from backup`
      };

    } catch (error) {
      logger.error('Failed to restore from backup:', error);
      throw error;
    }
  }

  // Get configuration status
  async getConfigStatus() {
    try {
      const configExists = await this.configExists();
      const config = await this.readConfig();
      const backups = await this.listBackups();

      return {
        exists: configExists,
        path: this.configPath,
        lastUpdated: config.lastUpdated,
        isActive: config.isActive,
        apiUrl: config.apiUrl,
        username: config.username,
        version: config.version || '1.0.0',
        backupCount: backups.length,
        latestBackup: backups.length > 0 ? backups[0].filename : null
      };
    } catch (error) {
      logger.error('Failed to get configuration status:', error);
      throw error;
    }
  }
}

module.exports = new ConfigService();
