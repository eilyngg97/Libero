const express = require('express');
const request = require('supertest');

const mockTournamentModels = {
  academiaA: { find: jest.fn() },
  academiaB: { find: jest.fn() }
};

jest.mock('../middleware/auth', () => ({
  authMiddleware: (req, res, next) => next(),
  rolMiddleware: () => (req, res, next) => next()
}));

jest.mock('../config/tenantBusinessConnection', () => ({
  getTenantBusinessConnection: jest.fn(async (tenant) => ({ tenantId: tenant.tenantId }))
}));

jest.mock('../services/tenantModelService', () => ({
  getTenantModel: jest.fn((connection, modelName) => {
    if (modelName === 'Torneo') return mockTournamentModels[connection.tenantId];
    return {};
  })
}));

const tournamentRouter = require('../routes/torneos');

function tournamentQuery(result) {
  return {
    populate() { return this; },
    sort: jest.fn().mockResolvedValue(result)
  };
}

describe('Aislamiento tenant de torneos', () => {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => {
    req.tenantId = req.headers['x-test-tenant'];
    req.tenant = { tenantId: req.tenantId };
    next();
  });
  app.use('/api/torneos', tournamentRouter);

  beforeEach(() => {
    jest.clearAllMocks();
    mockTournamentModels.academiaA.find.mockReturnValue(tournamentQuery([{ _id: 'a1', nombre: 'Torneo A' }]));
    mockTournamentModels.academiaB.find.mockReturnValue(tournamentQuery([{ _id: 'b1', nombre: 'Torneo B' }]));
  });

  test('cada tenant lista solamente sus torneos', async () => {
    const responseA = await request(app).get('/api/torneos').set('x-test-tenant', 'academiaA');
    const responseB = await request(app).get('/api/torneos').set('x-test-tenant', 'academiaB');

    expect(responseA.status).toBe(200);
    expect(responseA.body).toEqual([{ _id: 'a1', nombre: 'Torneo A' }]);
    expect(responseB.status).toBe(200);
    expect(responseB.body).toEqual([{ _id: 'b1', nombre: 'Torneo B' }]);
    expect(mockTournamentModels.academiaA.find).toHaveBeenCalledTimes(1);
    expect(mockTournamentModels.academiaB.find).toHaveBeenCalledTimes(1);
  });
});