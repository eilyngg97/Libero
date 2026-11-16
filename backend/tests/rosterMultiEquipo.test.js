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

test('el documento incluye el estado de las atletas inactivas sin excluirlas', async () => {
  const rosterId = new mongoose.Types.ObjectId();
  const jugadora = { _id: new mongoose.Types.ObjectId(), nombres: 'Ana', activo: false, dado_de_baja: true };
  const populate = jest.fn(({ select }) => ({
    lean: async () => ({
      _id: rosterId,
      jugadores: [{
        _id: jugadora._id,
        ...Object.fromEntries(select.split(' ').filter((field) => field in jugadora).map((field) => [field, jugadora[field]]))
      }]
    })
  }));
  models.Roster = { findById: jest.fn(() => ({ populate })) };
  models.TenantConfig = {
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) }))
  };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

  await rosterController.obtenerDocumentoRoster({ params: { id: String(rosterId) } }, res);

  expect(res.status).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    roster: expect.objectContaining({ jugadores: [jugadora] })
  }));
});

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

  test.each([false, true])('permite quitar una inactiva aunque queden otras inactivas: %s', async (quedaInactiva) => {
    const retiradaId = new mongoose.Types.ObjectId();
    const restanteId = new mongoose.Types.ObjectId();
    const roster = {
      _id: new mongoose.Types.ObjectId(),
      torneo: new mongoose.Types.ObjectId(),
      jugadores: [retiradaId, restanteId],
      jugadores_datos: [{ alumno: retiradaId }, { alumno: restanteId }],
      save: jest.fn().mockResolvedValue(true)
    };
    const torneo = {
      convocados: [{ alumno: retiradaId }, { alumno: restanteId }],
      save: jest.fn().mockResolvedValue(true)
    };
    models.Roster = {
      findById: jest.fn().mockResolvedValue(roster),
      find: jest.fn().mockReturnValue({ select: () => ({ lean: async () => [] }) })
    };
    models.Alumno = {
      find: jest.fn().mockReturnValue({
        select: () => ({ lean: async () => quedaInactiva ? [] : [{ _id: restanteId }] })
      })
    };
    models.Torneo = { findById: jest.fn().mockResolvedValue(torneo) };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await rosterController.actualizarJugadoresRoster({
      params: { id: String(roster._id) },
      body: { jugadores: [String(restanteId)] }
    }, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(roster.jugadores).toEqual([String(restanteId)]);
    expect(roster.jugadores_datos).toEqual([{ alumno: restanteId }]);
    expect(torneo.convocados).toEqual([{ alumno: restanteId }]);
    expect(roster.save).toHaveBeenCalledTimes(1);
    expect(torneo.save).toHaveBeenCalledTimes(1);
  });

  test('sigue rechazando convocar una atleta inactiva nueva', async () => {
    const roster = {
      _id: new mongoose.Types.ObjectId(),
      jugadores: [new mongoose.Types.ObjectId()],
      save: jest.fn()
    };
    models.Roster = { findById: jest.fn().mockResolvedValue(roster) };
    models.Alumno = {
      find: jest.fn().mockReturnValue({ select: () => ({ lean: async () => [] }) })
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await rosterController.actualizarJugadoresRoster({
      params: { id: String(roster._id) },
      body: { jugadores: [String(new mongoose.Types.ObjectId())] }
    }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(roster.save).not.toHaveBeenCalled();
  });
});

describe('estudiantes elegibles con inactivos del roster', () => {
  test.each([false, true])('incluye inactivas vinculadas solo si se solicitan: %s', async (incluirInactivos) => {
    const rosterId = new mongoose.Types.ObjectId();
    const atletaId = new mongoose.Types.ObjectId();
    models.Roster = {
      findById: jest.fn().mockReturnValue({
        select: () => ({ lean: async () => ({ jugadores: [atletaId] }) })
      })
    };
    models.Alumno = {
      find: jest.fn().mockReturnValue({
        select: () => ({
          populate: () => ({
            populate: () => ({
              sort: () => ({
                lean: async () => incluirInactivos
                  ? [{ _id: atletaId, nombres: 'Atleta', activo: false }]
                  : []
              })
            })
          })
        })
      })
    };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

    await rosterController.obtenerEstudiantesElegibles({
      query: { rosterId: String(rosterId), incluirInactivosRoster: String(incluirInactivos) }
    }, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(models.Alumno.find).toHaveBeenCalledWith(incluirInactivos ? {
      $or: [
        { activo: { $ne: false }, dado_de_baja: { $ne: true } },
        { _id: { $in: [atletaId] } }
      ]
    } : { activo: { $ne: false }, dado_de_baja: { $ne: true } });
    expect(res.json).toHaveBeenCalledWith(incluirInactivos
      ? [expect.objectContaining({ _id: String(atletaId), activo: false })]
      : []);
  });
});
