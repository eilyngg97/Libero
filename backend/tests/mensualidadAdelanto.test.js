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
jest.mock('../models/HistorialEstadoAlumno', () => ({}));

const mongoose = require('mongoose');
const { getTenantModel } = require('../services/tenantModelService');
const mensualidadController = require('../controllers/mensualidadController');

function querySelectSort(value) {
  return {
    select: jest.fn().mockReturnValue({
      sort: jest.fn().mockResolvedValue(value)
    })
  };
}

function queryPopulate(value) {
  return {
    populate: jest.fn().mockResolvedValue(value)
  };
}

function querySort(value) {
  return {
    sort: jest.fn().mockResolvedValue(value)
  };
}

function querySelectSortArray(value) {
  return {
    select: jest.fn().mockReturnValue({
      sort: jest.fn().mockResolvedValue(value)
    })
  };
}

function querySelect(value) {
  return {
    select: jest.fn().mockResolvedValue(value)
  };
}

function querySortSelect(value) {
  return {
    sort: jest.fn().mockReturnValue({
      select: jest.fn().mockResolvedValue(value)
    })
  };
}

afterAll(async () => {
  try {
    await mongoose.disconnect();
  } catch {
    // noop
  }
});

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
      findOne: jest.fn().mockImplementation((filtro) => {
        if (filtro?.estatus) {
          return querySelectSort({ mes: 5, anio: 2026 });
        }
        return queryPopulate(null);
      }),
      create: jest.fn().mockResolvedValue(mensualidadCreada),
      findById: jest.fn().mockReturnValue(queryPopulate(mensualidadPopulada))
    };

    const TenantSede = {
      findById: jest.fn().mockReturnValue(querySelect({ _id: 's1', costo: 100 }))
    };

    const TenantReposo = {
      findOne: jest.fn().mockReturnValue(querySort(null)),
      find: jest.fn().mockReturnValue(querySelectSortArray([]))
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

    expect(TenantMensualidad.findOne).toHaveBeenCalledWith(
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

describe('registrarPrimeraMensualidad', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-30T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('crea de inmediato la mensualidad del mes de inicio de cobro futuro y prioriza monto de inscripcion+primera mensualidad', async () => {
    const alumnoDoc = {
      _id: 'a2',
      activo: true,
      dado_de_baja: false,
      tipo_mensualidad: 'monto_sede',
      fecha_inscripcion: new Date('2026-08-01T12:00:00.000Z'),
      fecha_inicio_cobro: new Date('2026-08-01T12:00:00.000Z'),
      sede: 's1',
      saldo_a_favor_mensualidades: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadCreada = { _id: 'm-ago' };
    const mensualidadPopulada = {
      _id: 'm-ago',
      id_alumno: alumnoDoc,
      mes: 8,
      anio: 2026,
      estatus: 'Pendiente',
      es_inscripcion: true
    };

    const TenantAlumno = {
      findById: jest.fn().mockResolvedValue(alumnoDoc)
    };

    const TenantMensualidad = {
      findOne: jest.fn().mockReturnValue(queryPopulate(null)),
      create: jest.fn().mockResolvedValue(mensualidadCreada),
      findById: jest.fn().mockReturnValue(queryPopulate(mensualidadPopulada))
    };

    const TenantSede = {
      findById: jest.fn().mockReturnValue(querySelect({ _id: 's1', costo: 100 }))
    };

    const TenantReposo = {
      findOne: jest.fn().mockReturnValue(querySort(null)),
      find: jest.fn().mockReturnValue(querySelectSortArray([]))
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
        PagoDetalle: { create: jest.fn() },
        Sede: TenantSede,
        Reposo: TenantReposo,
        Representante: {},
        TenantConfig
      };
      return models[modelName];
    });

    const req = {
      tenantId: 'pruebas',
      body: {
        es_registro_alumno: 'true',
        id_alumno: 'a2',
        monto_esperado: 20,
        monto_inscripcion: 15,
        monto_primera_mensualidad: 25,
        estatus: 'Pendiente'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await mensualidadController.registrarPrimeraMensualidad(req, res);

    expect(res.status).not.toHaveBeenCalledWith(500);

    expect(TenantMensualidad.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id_alumno: 'a2',
        mes: 8,
        anio: 2026,
        monto_base: 40,
        monto_sin_recargo_usd: 40,
        monto_esperado: 40,
        es_inscripcion: true
      })
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        mensualidad: expect.objectContaining({ mes: 8, anio: 2026 })
      })
    );
  });

  test('cuando inicio de cobro es julio y hoy es agosto, aplica inscripcion/pago en julio y no en agosto', async () => {
    jest.setSystemTime(new Date('2026-08-01T12:00:00.000Z'));

    const alumnoDoc = {
      _id: 'a3',
      activo: true,
      dado_de_baja: false,
      tipo_mensualidad: 'monto_sede',
      fecha_inscripcion: new Date('2026-07-01T12:00:00.000Z'),
      fecha_inicio_cobro: new Date('2026-07-01T12:00:00.000Z'),
      sede: 's1',
      saldo_a_favor_mensualidades: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadesPopuladas = {
      'm-jul': {
        _id: 'm-jul',
        id_alumno: alumnoDoc,
        mes: 7,
        anio: 2026,
        estatus: 'Pagado',
        es_inscripcion: true
      },
      'm-ago': {
        _id: 'm-ago',
        id_alumno: alumnoDoc,
        mes: 8,
        anio: 2026,
        estatus: 'Pendiente',
        es_inscripcion: false
      }
    };

    const TenantAlumno = {
      findById: jest.fn().mockResolvedValue(alumnoDoc)
    };

    const TenantMensualidad = {
      findOne: jest.fn().mockReturnValue(queryPopulate(null)),
      create: jest
        .fn()
        .mockResolvedValueOnce({ _id: 'm-jul' })
        .mockResolvedValueOnce({ _id: 'm-ago' }),
      findById: jest.fn().mockImplementation((id) => queryPopulate(mensualidadesPopuladas[id]))
    };

    const TenantSede = {
      findById: jest.fn().mockReturnValue(querySelect({ _id: 's1', costo: 30 }))
    };

    const TenantReposo = {
      findOne: jest.fn().mockReturnValue(querySort(null)),
      find: jest.fn().mockReturnValue(querySelectSortArray([]))
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

    const PagoDetalleModel = { create: jest.fn() };

    getTenantModel.mockImplementation((connection, modelName) => {
      const models = {
        Alumno: TenantAlumno,
        Mensualidad: TenantMensualidad,
        PagoDetalle: PagoDetalleModel,
        Sede: TenantSede,
        Reposo: TenantReposo,
        Representante: {},
        TenantConfig
      };
      return models[modelName];
    });

    const req = {
      tenantId: 'pruebas',
      body: {
        es_registro_alumno: 'true',
        id_alumno: 'a3',
        monto_esperado: 20,
        monto_inscripcion: 15,
        monto_primera_mensualidad: 25,
        monto_pagado: 40,
        fecha_pago: '2026-07-02',
        metodo_pago: 'Transferencia',
        referencia: '701278',
        estatus: 'Pagado'
      }
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    await mensualidadController.registrarPrimeraMensualidad(req, res);

    expect(res.status).not.toHaveBeenCalledWith(500);

    expect(TenantMensualidad.create).toHaveBeenCalledTimes(2);
    expect(TenantMensualidad.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        id_alumno: 'a3',
        mes: 7,
        anio: 2026,
        monto_base: 40,
        monto_esperado: 40,
        estatus: 'Pagado',
        es_inscripcion: true,
        monto_inscripcion: 15,
        monto_primera_mensualidad: 25,
        referencia: '701278'
      })
    );
    expect(TenantMensualidad.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        id_alumno: 'a3',
        mes: 8,
        anio: 2026,
        monto_base: 0,
        monto_esperado: 0
      })
    );

    expect(PagoDetalleModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        referencia: '701278',
        monto_pagado: 40
      })
    );

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        mensualidad: expect.objectContaining({ mes: 7, anio: 2026 })
      })
    );
  });
});

describe('generarMensualidadesMesCore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-14T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('no genera mensualidades entre baja y reingreso durante catch-up', async () => {
    const alumnoDoc = {
      _id: 'a-reingreso',
      activo: true,
      dado_de_baja: false,
      tipo_mensualidad: 'monto_sede',
      fecha_inicio_cobro: new Date('2026-02-01T12:00:00.000Z'),
      sede: 's1',
      saldo_a_favor_mensualidades: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    const TenantAlumno = {
      find: jest.fn().mockResolvedValue([alumnoDoc])
    };

    const TenantMensualidad = {
      findOne: jest.fn().mockReturnValue(queryPopulate(null)),
      create: jest.fn().mockResolvedValue({ _id: 'm-ago' }),
      findById: jest.fn().mockReturnValue(queryPopulate({
        _id: 'm-ago',
        id_alumno: alumnoDoc,
        mes: 8,
        anio: 2026,
        estatus: 'Pendiente',
        monto_esperado: 100
      }))
    };

    const TenantSede = {
      findById: jest.fn().mockReturnValue(querySelect({ _id: 's1', costo: 100 }))
    };

    const TenantReposo = {
      findOne: jest.fn().mockReturnValue(querySort(null)),
      find: jest.fn().mockReturnValue(querySelectSortArray([]))
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

    const TenantHistorialEstadoAlumno = {
      findOne: jest.fn().mockReturnValue(
        querySortSelect({ fecha_evento: new Date('2026-08-01T12:00:00.000Z') })
      )
    };

    const creadas = await mensualidadController.generarMensualidadesMesCore({
      models: {
        Alumno: TenantAlumno,
        Mensualidad: TenantMensualidad,
        PagoDetalle: {},
        Sede: TenantSede,
        Reposo: TenantReposo,
        TenantConfig,
        HistorialEstadoAlumno: TenantHistorialEstadoAlumno
      }
    });

    expect(creadas).toBe(1);
    expect(TenantMensualidad.create).toHaveBeenCalledTimes(1);
    expect(TenantMensualidad.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id_alumno: 'a-reingreso',
        mes: 8,
        anio: 2026
      })
    );
  });
});