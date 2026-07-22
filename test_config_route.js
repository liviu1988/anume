const assert = require('assert');
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

function loadConfigRoute() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anume-config-route-'));
  process.env.ANUME_CONFIG_PATH = path.join(tempDir, 'remote_config.json');
  process.env.BACKUP_DIR = path.join(tempDir, 'backups');

  const authPath = require.resolve('./middleware/auth');
  const routePath = require.resolve('./routes/config');
  const servicePath = require.resolve('./services/configService');

  delete require.cache[routePath];
  delete require.cache[servicePath];

  require.cache[authPath] = {
    exports: (req, res, next) => {
      req.user = { id: 1, username: 'test-admin' };
      next();
    },
  };

  const configService = require('./services/configService');
  configService.createBackup = async () => 'test-backup.json';

  const routes = require('./routes/config');
  return { routes, tempDir };
}

function buildApp(routes) {
  const app = express();
  const emissions = [];

  app.use(express.json());
  app.use((req, res, next) => {
    req.io = {
      to() {
        return {
          emit(event, payload) {
            emissions.push({ event, payload });
          },
        };
      },
    };
    next();
  });
  app.use('/api/config', routes);
  app.emissions = emissions;
  return app;
}

async function run() {
  const { routes, tempDir } = loadConfigRoute();
  const app = buildApp(routes);

  const updateResponse = await request(app)
    .put('/api/config')
    .send({
      apiUrl: 'http://portal.example.com:8080',
      activationApiUrl: 'https://activation.example.com/appactivation',
      isActive: true,
      additionalSettings: {
        timeout: 15000,
        retryAttempts: 2,
      },
    })
    .expect(200);

  assert.equal(updateResponse.body.success, true);
  assert.equal(updateResponse.body.config.apiUrl, 'http://portal.example.com:8080');
  assert.equal(updateResponse.body.config.password, '***');
  assert.match(updateResponse.body.version, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(updateResponse.headers['cache-control'], /no-store/);
  assert(app.emissions.some((entry) => entry.event === 'app-config-updated'));

  const appResponse = await request(app)
    .get('/api/config/app')
    .expect(200);

  assert.equal(appResponse.body.success, true);
  assert.equal(appResponse.body.config.apiUrl, 'http://portal.example.com:8080');
  assert.equal(appResponse.body.config.activationApiUrl, 'https://activation.example.com/appactivation');
  assert.equal(appResponse.body.config.version, updateResponse.body.version);
  assert.equal(appResponse.body.config.username, undefined);
  assert.equal(appResponse.body.config.password, undefined);
  assert.match(appResponse.headers['cache-control'], /no-store/);

  const statusResponse = await request(app)
    .get('/api/config/status')
    .expect(200);

  assert.equal(statusResponse.body.success, true);
  assert.equal(statusResponse.body.status.apiUrl, 'http://portal.example.com:8080');
  assert.equal(statusResponse.body.status.path, path.join(tempDir, 'remote_config.json'));
  assert.equal(statusResponse.body.version, updateResponse.body.version);
  assert.match(statusResponse.headers['cache-control'], /no-store/);

  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log('Config route tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
