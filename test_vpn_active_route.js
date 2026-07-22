const assert = require('assert');
const express = require('express');
const request = require('supertest');

function loadVpnRoutes({ servers, showOnlyCustom = false }) {
  const databasePath = require.resolve('./database');
  const authPath = require.resolve('./middleware/auth');
  const loggerPath = require.resolve('./utils/logger');
  const routePath = require.resolve('./routes/vpnServers');

  delete require.cache[routePath];

  let getFilteredCalls = 0;
  let currentShowOnlyCustom = showOnlyCustom;

  require.cache[databasePath] = {
    exports: {
      models: {
        Admin: {},
        AdminSetting: {
          async getShowOnlyCustomServers() {
            return currentShowOnlyCustom;
          },
          async setShowOnlyCustomServers(value) {
            currentShowOnlyCustom = value;
          },
        },
        VpnServer: {
          async getFilteredServers() {
            getFilteredCalls += 1;
            return servers;
          },
          async findByPk() {
            return null;
          },
        },
      },
    },
  };

  require.cache[authPath] = {
    exports: (req, res, next) => {
      req.user = { id: 1, username: 'test-admin' };
      next();
    },
  };

  require.cache[loggerPath] = {
    exports: {
      info() {},
      warn() {},
      error() {},
      debug() {},
    },
  };

  const routes = require('./routes/vpnServers');
  return {
    routes,
    getFilteredCalls: () => getFilteredCalls,
  };
}

function buildApp(routeState) {
  const app = express();
  app.use(express.json());
  app.use('/api/vpn-servers', routeState.routes);
  return app;
}

function server(overrides) {
  return {
    toFlutterFormat() {
      return {
        HostName: overrides.HostName || 'vpn.example.com',
        IP: overrides.IP || '10.0.0.1',
        Ping: overrides.Ping || '0',
        Speed: overrides.Speed || 0,
        CountryLong: overrides.CountryLong,
        CountryShort: overrides.CountryShort,
        NumVpnSessions: overrides.NumVpnSessions || 0,
        OpenVPN_ConfigData_Base64: overrides.OpenVPN_ConfigData_Base64 || 'Y29uZmln',
        Username: overrides.Username || '',
        Password: overrides.Password || '',
        _isCustomServer: overrides._isCustomServer ?? true,
        _serverId: overrides._serverId,
        _serverName: overrides._serverName,
        _isFeatured: overrides._isFeatured ?? false,
      };
    },
  };
}

async function run() {
  const routeState = loadVpnRoutes({
    servers: [
      server({
        CountryShort: 'RO',
        CountryLong: 'Romania',
        _serverId: 1,
        _serverName: 'Romania Featured',
        _isFeatured: true,
      }),
      server({
        CountryShort: 'DE',
        CountryLong: 'Germany',
        _serverId: 2,
        _serverName: 'Germany Featured',
        _isFeatured: true,
      }),
      server({
        CountryShort: 'RO',
        CountryLong: 'Romania',
        _serverId: 3,
        _serverName: 'Romania Standard',
        _isFeatured: false,
      }),
    ],
  });
  const app = buildApp(routeState);

  let response = await request(app)
    .get('/api/vpn-servers/active?country=ro&featured=true&limit=5')
    .expect(200);

  assert.equal(response.headers['x-vpn-cache'], 'MISS');
  assert.equal(response.body.success, true);
  assert.equal(response.body.count, 1);
  assert.equal(response.body.data[0]._serverName, 'Romania Featured');
  assert.equal(response.body._metadata.totalServers, 3);
  assert.equal(response.body._metadata.returnedServers, 1);
  assert.equal(response.body._metadata.filters.country, 'RO');
  assert.equal(response.body._metadata.filters.featured, true);
  assert.equal(response.body._metadata.countries.length, 2);
  assert.equal(routeState.getFilteredCalls(), 1);

  response = await request(app)
    .get('/api/vpn-servers/active?country=ro&featured=true&limit=5')
    .expect(200);

  assert.equal(response.headers['x-vpn-cache'], 'HIT');
  assert.equal(routeState.getFilteredCalls(), 1);

  await request(app)
    .put('/api/vpn-servers/settings/filter')
    .send({ showOnlyCustomServers: true })
    .expect(200);

  response = await request(app)
    .get('/api/vpn-servers/active?country=ro&featured=true&limit=5')
    .expect(200);

  assert.equal(response.headers['x-vpn-cache'], 'MISS');
  assert.equal(routeState.getFilteredCalls(), 2);
  assert.equal(response.body._metadata.showOnlyCustomServers, true);

  console.log('VPN active route tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
