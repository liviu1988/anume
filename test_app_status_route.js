const assert = require('assert');
const express = require('express');
const request = require('supertest');
const appRoutes = require('./routes/app');

function buildTestApp({ failBroadcast = false } = {}) {
  const app = express();
  const emissions = [];

  app.use(express.json());
  app.use((req, res, next) => {
    req.io = {
      to() {
        return {
          emit(event, payload) {
            emissions.push({ event, payload });
            if (failBroadcast) {
              throw new Error('simulated broadcast failure');
            }
          }
        };
      }
    };
    next();
  });
  app.use('/api/app', appRoutes);
  app.emissions = emissions;
  return app;
}

async function run() {
  let response = await request(buildTestApp())
    .post('/api/app/status')
    .send({
      status: 'config_fetched',
      originalStatus: 'config fetched from admin panel',
      version: '1.0.0',
      configVersion: '2026-07-15T20:37:32.445Z',
      timestamp: '2026-07-22T03:40:00.000Z',
      activeUsers: 1,
      metadata: {
        platform: 'android',
        device: {
          model: 'firestick'
        }
      },
      errors: []
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.appStatus.status, 'config_fetched');
  assert.equal(response.body.appStatus.clientTimestamp, '2026-07-22T03:40:00.000Z');
  assert.equal(response.body.appStatus.originalStatus, 'config fetched from admin panel');
  assert.equal(response.body.appStatus.metadata.platform, 'android');
  assert.equal(response.body.appStatus.metadata.device, '{"model":"firestick"}');
  assert.equal(response.body.appStatus.health.state, 'healthy');
  assert.equal(response.body.appStatus.health.isStale, false);
  assert.equal(response.body.appStatus.health.hasErrors, false);
  assert.equal(typeof response.body.appStatus.health.lastSeenAgeSeconds, 'number');
  assert(response.body.appStatus.health.staleAfterSeconds >= 30);
  assert.equal(response.body.broadcasted, true);
  assert(response.body.broadcastDedupWindowSeconds >= 1);

  const duplicateApp = buildTestApp();
  response = await request(duplicateApp)
    .post('/api/app/status')
    .send({
      status: 'running',
      version: '1.0.0',
      configVersion: 'dedup-test',
      activeUsers: 1,
      metadata: {
        screen: 'home'
      },
      errors: []
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.broadcasted, true);
  assert.equal(duplicateApp.emissions.length, 1);

  response = await request(duplicateApp)
    .post('/api/app/status')
    .send({
      status: 'running',
      version: '1.0.0',
      configVersion: 'dedup-test',
      activeUsers: 1,
      metadata: {
        screen: 'home'
      },
      errors: []
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.broadcasted, false);
  assert.equal(response.body.appStatus.status, 'running');
  assert.equal(duplicateApp.emissions.length, 1);

  response = await request(buildTestApp({ failBroadcast: true }))
    .post('/api/app/status')
    .send({
      status: 'api_url_changed_logout',
      activeUsers: 0,
      errors: {
        message: 'API URL changed',
        context: {
          source: 'remote_config'
        }
      }
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.appStatus.status, 'api_url_changed_logout');
  assert.equal(response.body.appStatus.errors[0].message, 'API URL changed');
  assert.equal(response.body.appStatus.errors[0].context.source, 'remote_config');
  assert.equal(response.body.appStatus.health.state, 'warning');
  assert.equal(response.body.appStatus.health.hasErrors, true);

  response = await request(buildTestApp())
    .post('/api/app/status')
    .send({
      status: 'running',
      timestamp: 'not a date',
      metadata: Object.fromEntries(
        Array.from({ length: 40 }, (_, index) => [
          `key_${index}`,
          'x'.repeat(700)
        ])
      ),
      errors: {
        message: 'Large context trimmed',
        timestamp: 'bad timestamp',
        context: Object.fromEntries(
          Array.from({ length: 30 }, (_, index) => [`ctx_${index}`, index])
        )
      }
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.appStatus.clientTimestamp, '2026-07-22T03:40:00.000Z');
  assert.equal(Object.keys(response.body.appStatus.metadata).length, 30);
  assert.equal(response.body.appStatus.metadata.key_0.length, 500);
  assert.equal(Object.keys(response.body.appStatus.errors[0].context).length, 20);
  assert.match(response.body.appStatus.errors[0].timestamp, /^\d{4}-\d{2}-\d{2}T/);

  response = await request(buildTestApp())
    .post('/api/app/status')
    .send({ status: '<script>alert(1)</script>' });

  assert.equal(response.status, 400);

  response = await request(buildTestApp()).get('/api/app/status');
  assert.equal(response.status, 200);
  assert.equal(response.body.appStatus.status, 'running');
  assert.equal(response.body.appStatus.health.state, 'warning');
  assert.equal(response.body.appStatus.health.isStale, false);
  assert.equal(response.body.adminPanel.status, 'running');

  console.log('App status route tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
