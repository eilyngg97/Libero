const mongoose = require('mongoose');

const models = {};

jest.mock('../config/tenantBusinessConnection', () => ({
  getTenantBusinessConnection: jest.fn().mockResolvedValue({ tenantId: 'academiaA' })
}));

jest.mock('../services/tenantModelService', () => ({
  getTenantModel: jest.fn((connection, modelName) => models[modelName])
}));

jest.mock('../services/operacionService', () => ({
  registrarOperacion: jest.fn()
}));

const rosterController = require('../controllers/rosterController');

describe('actualizarJugadoresRoster multi-equipo', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('permite agregar una atleta que ya pertenece a otro roster del torneo', async () => {
    const rosterId = new mongoose.Types.ObjectId();
    const torneoId = new mongoose.Types.ObjectId();
    const atletaId = new mongoose.Types.ObjectId();
    const roster = {
      _id: rosterId,
      torneo: torneoId,
      jugadores: [],
      jugadores_datos: [],
      save: jest.fn().mockResolvedValue(true)
    };
    const torneo = {
      _id: torneoId,
      convocados: [{ alumno: atletaId, categoria_snapshot: 'U19', estado: 'pendiente' }],
      save: jest.fn().mockResolvedValue(true)
    };
    const atleta = { _id: atletaId, categoria: 'U19' };
    const findOne = jest.fn();

    models.Roster = {
      findById: jest.fn().mockResolvedValue(roster),
      findOne,
      find: jest.fn()
    };
    models.Alumno = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([atleta])
        })
      })
    };
    models.Torneo = {
      findById: jest.fn().mockResolvedValue(torneo)
    };
    models.TenantConfig = {};

    const req = {
      params: { id: String(rosterId) },
      body: { jugadores: [String(atletaId)] },
      tenant: { tenantId: 'academiaA' },
      user: { id: new mongoose.Types.ObjectId() }
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };

    await rosterController.actualizarJugadoresRoster(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Atletas del roster actualizados',
      roster
    }));
    expect(findOne).not.toHaveBeenCalled();
    expect(roster.jugadores).toEqual([String(atletaId)]);
    expect(roster.save).toHaveBeenCalledTimes(1);
    expect(torneo.save).toHaveBeenCalledTimes(1);
    expect(torneo.convocados).toHaveLength(1);
  });
});
