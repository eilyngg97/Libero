jest.mock('../config/tenantBusinessConnection', () => ({
  getTenantBusinessConnection: jest.fn().mockResolvedValue({})
}));

jest.mock('../services/tenantModelService', () => ({
  getTenantModel: jest.fn()
}));

jest.mock('../models/Mensualidad', () => ({}));
jest.mock('../models/Alumno', () => ({}));
jest.mock('../models/Sede', () => ({}));
jest.mock('../models/Reposo', () => ({}));
jest.mock('../models/PagoDetalle', () => ({}));
jest.mock('../models/Representante', () => ({}));

const { getTenantModel } = require('../services/tenantModelService');
const mensualidadController = require('../controllers/mensualidadController');

describe('adelantarMensualidadSiguiente', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('adelanta desde la ultima mensualidad liquidada del alumno', async () => {
    const alumnoDoc = {
      _id: 'a1',
      activo: true,
      dado_de_baja: false,
      tipo_mensualidad: 'monto_sede',
      sede: 's1',
      saldo_a_favor_mensualidades: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadCreada = { _id: 'm-junio' };
    const mensualidadPopulada = {
      _id: 'm-junio',
      id_alumno: alumnoDoc,
      mes: 6,
      anio: 2026,
      monto_esperado: 100,
      estatus: 'Pendiente'
    };

    const TenantAlumno = {
      findById: jest.fn().mockResolvedValue(alumnoDoc)
    };

    const TenantMensualidad = {
      findOne: jest
        .fn()
        .mockReturnValueOnce({
          select: jest.fn().mockReturnValue({
            sort: jest.fn().mockResolvedValue({ mes: 5, anio: 2026 })
          })
        })
        .mockReturnValueOnce({
          populate: jest.fn().mockResolvedValue(null)
        }),
      create: jest.fn().mockResolvedValue(mensualidadCreada),
      findById: jest.fn().mockReturnValue({
        populate: jest.fn().mockResolvedValue(mensualidadPopulada)
      })
    };

    const TenantSede = {
      findById: jest.fn().mockResolvedValue({ _id: 's1', costo: 100 })
    };

    const TenantReposo = {
      findOne: jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue(null)
      }),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          sort: jest.fn().mockResolvedValue([])
        })
      })
    };

    const TenantConfig = {
      findOne: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            cobro: {
              dia_cobro: 1,
              dia_vencimiento: 5,
              dias_gracia: 0,
              recargo_usd: 0
            }
          })
        })
      })
    };

    getTenantModel.mockImplementation((connection, modelName) => {
      const models = {
        Alumno: TenantAlumno,
        Mensualidad: TenantMensualidad,
        PagoDetalle: {},
        Sede: TenantSede,
        Reposo: TenantReposo,
        Representante: {},
        TenantConfig
      };

      return models[modelName];
    });

    const req = {
      body: { id_alumno: 'a1' },
      tenantId: 'pruebas'
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await mensualidadController.adelantarMensualidadSiguiente(req, res);

    expect(TenantMensualidad.findOne).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id_alumno: 'a1',
        estatus: {
          $in: expect.arrayContaining(['Pagado', 'En revision'])
        }
      })
    );

    expect(TenantMensualidad.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id_alumno: 'a1',
        mes: 6,
        anio: 2026
      })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        creada: true,
        mensualidad: expect.objectContaining({ mes: 6, anio: 2026 })
      })
    );
  });
});