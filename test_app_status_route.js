const assert = require('assert');
const express = require('express');
const request = require('supertest');
const appRoutes = require('./routes/app');

function buildTestApp({ failBroadcast = false } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.io = {
      to() {
        return {
          emit() {
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
  return app;
}

async function run() {
  let response = await request(buildTestApp())
    .post('/api/app/status')
    .send({
      status: 'config_fetched',
      version: '1.0.0',
      configVersion: '2026-07-15T20:37:32.445Z',
      activeUsers: 1,
      errors: []
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.appStatus.status, 'config_fetched');

  response = await request(buildTestApp({ failBroadcast: true }))
    .post('/api/app/status')
    .send({
      status: 'api_url_changed_logout',
      activeUsers: 0,
      errors: ['API URL changed']
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.appStatus.status, 'api_url_changed_logout');
  assert.equal(response.body.appStatus.errors[0].message, 'API URL changed');

  response = await request(buildTestApp())
    .post('/api/app/status')
    .send({ status: '<script>alert(1)</script>' });

  assert.equal(response.status, 400);

  console.log('App status route tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
