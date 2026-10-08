process.env.JWT_SECRET_CURRENT = 'test-secret';
process.env.MONGO_URI_CURRENT = process.env.MONGO_URI_CURRENT || 'mongodb://127.0.0.1:27017/libero_test';

jest.mock('../services/paymentExchangeRate', () => ({ obtenerTasaPagoPorFecha: jest.fn(async (fecha, moneda) => ({
  tasa: 872.39, fecha_tasa: fecha, moneda
})) }));

jest.mock('../models/User', () => {
  const UserMock = jest.fn().mockImplementation((data = {}) => ({
    ...data,
    _id: data._id || 'u-new',
    save: jest.fn().mockResolvedValue({ ...data, _id: data._id || 'u-new' })
  }));

  UserMock.findOne = jest.fn();
  UserMock.findByIdAndDelete = jest.fn();

  return UserMock;
});

jest.mock('../models/Alumno', () => {
  const AlumnoMock = jest.fn().mockImplementation((data = {}) => ({
    ...data,
    save: jest.fn().mockResolvedValue({ ...data, _id: data._id || 'a-new' })
  }));

  AlumnoMock.find = jest.fn();
  AlumnoMock.findById = jest.fn();
  AlumnoMock.findOne = jest.fn();
  AlumnoMock.findOneAndUpdate = jest.fn();
  AlumnoMock.findByIdAndUpdate = jest.fn();
  AlumnoMock.findByIdAndDelete = jest.fn();

  return AlumnoMock;
});

jest.mock('../models/Representante', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  findByIdAndDelete: jest.fn()
}));

jest.mock('../models/Mensualidad', () => ({
  findById: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  aggregate: jest.fn(),
  create: jest.fn(),
  deleteMany: jest.fn()
}));

jest.mock('../models/PagoDetalle', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndDelete: jest.fn(),
  create: jest.fn(),
  deleteMany: jest.fn()
}));

jest.mock('../models/PagoAgrupado', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  deleteOne: jest.fn()
}));

jest.mock('../models/UniformePedido', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  deleteMany: jest.fn()
}));

jest.mock('../models/Uniforme', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn()
}));

jest.mock('../models/Reposo', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  deleteMany: jest.fn()
}));

jest.mock('../models/HistorialEstadoAlumno', () => ({
  create: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  deleteMany: jest.fn()
}));

jest.mock('../models/ConstanciaSolicitud', () => ({
  deleteMany: jest.fn()
}));

jest.mock('../models/Partido', () => ({
  updateMany: jest.fn()
}));

jest.mock('../models/Torneo', () => ({
  updateMany: jest.fn()
}));

jest.mock('../models/TenantConfig', () => ({
  findOne: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue({
      key: 'default',
      pagos: {
        por_concepto: {
          mensualidades: { usar_generales: true },
          uniformes: { usar_generales: false }
        }
      },
      cobro: { dia_cobro: 1, dia_vencimiento: 5, dias_gracia: 0, recargo_usd: 0 },
      constancias: {}
    }),
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        key: 'default',
        cobro: { dia_cobro: 1, dia_vencimiento: 5, dias_gracia: 0, recargo_usd: 0 },
        constancias: {}
      })
    })
  })
}));

jest.mock('../config/tenantBusinessConnection', () => ({
  getTenantBusinessConnection: jest.fn().mockResolvedValue({})
}));

jest.mock('../services/tenantModelService', () => ({
  getTenantModel: jest.fn((connection, modelName) => {
    const User = require('../models/User');
    const Alumno = require('../models/Alumno');
    const Representante = require('../models/Representante');
    const Mensualidad = require('../models/Mensualidad');
    const PagoDetalle = require('../models/PagoDetalle');
    const PagoAgrupado = require('../models/PagoAgrupado');
    const UniformePedido = require('../models/UniformePedido');
    const Uniforme = require('../models/Uniforme');
    const Reposo = require('../models/Reposo');
    const HistorialEstadoAlumno = require('../models/HistorialEstadoAlumno');
    const TenantConfig = require('../models/TenantConfig');
    const ConstanciaSolicitud = require('../models/ConstanciaSolicitud');
    const Partido = require('../models/Partido');
    const Torneo = require('../models/Torneo');

    const map = {
      User,
      Alumno,
      Representante,
      Mensualidad,
      PagoDetalle,
      PagoAgrupado,
      Reposo,
      HistorialEstadoAlumno,
      TenantConfig,
      ConstanciaSolicitud,
      Partido,
      Torneo,
      Sede: { findById: jest.fn().mockResolvedValue({ _id: 's1', costo: 100, nombre: 'TRINITARIAS' }) },
      Aspirante: { find: jest.fn(), findOne: jest.fn(), create: jest.fn() },
      Uniforme,
      UniformePedido,
      LandingAtletaFoto: { find: jest.fn() },
      Entrenador: { find: jest.fn(), findById: jest.fn() },
      HistorialEstadoAlumno
    };

    return map[modelName] || {};
  })
}));

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn()
}));

jest.mock('pdfkit', () => {
  return jest.fn().mockImplementation(() => {
    const handlers = {};
    return {
      on: jest.fn((event, handler) => {
        handlers[event] = handler;
      }),
      image: jest.fn().mockReturnThis(),
      fontSize: jest.fn().mockReturnThis(),
      text: jest.fn().mockReturnThis(),
      moveDown: jest.fn().mockReturnThis(),
      end: jest.fn(() => {
        if (handlers.data) handlers.data(Buffer.from('PDF'));
        if (handlers.end) handlers.end();
      })
    };
  });
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const User = require('../models/User');
const Alumno = require('../models/Alumno');
const Representante = require('../models/Representante');
const Mensualidad = require('../models/Mensualidad');
const PagoDetalle = require('../models/PagoDetalle');
const PagoAgrupado = require('../models/PagoAgrupado');
const Uniforme = require('../models/Uniforme');
const UniformePedido = require('../models/UniformePedido');
const Reposo = require('../models/Reposo');
const HistorialEstadoAlumno = require('../models/HistorialEstadoAlumno');
const ConstanciaSolicitud = require('../models/ConstanciaSolicitud');
const Partido = require('../models/Partido');
const Torneo = require('../models/Torneo');
const { app } = require('../app');

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET_CURRENT, { expiresIn: '1h' });
}

afterAll(async () => {
  try {
    await mongoose.disconnect();
  } catch {
    // noop
  }
});

describe('Backend smoke tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    Mensualidad.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      })
    });
    Mensualidad.aggregate.mockResolvedValue([]);
    Mensualidad.deleteMany.mockResolvedValue({ deletedCount: 0 });
    PagoDetalle.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      })
    });
    PagoDetalle.deleteMany.mockResolvedValue({ deletedCount: 0 });
    PagoAgrupado.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([]),
      then: (resolve) => resolve([])
    });
    PagoAgrupado.deleteOne.mockResolvedValue({ deletedCount: 0 });
    UniformePedido.deleteMany.mockResolvedValue({ deletedCount: 0 });
    Reposo.deleteMany.mockResolvedValue({ deletedCount: 0 });
    HistorialEstadoAlumno.deleteMany.mockResolvedValue({ deletedCount: 0 });
    HistorialEstadoAlumno.findOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null)
        })
      })
    });
    ConstanciaSolicitud.deleteMany.mockResolvedValue({ deletedCount: 0 });
    Partido.updateMany.mockResolvedValue({ modifiedCount: 0 });
    Torneo.updateMany.mockResolvedValue({ modifiedCount: 0 });

    Reposo.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      })
    });
    Reposo.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(null)
    });
  });

  test('POST /api/auth/login returns token', async () => {
    User.findOne.mockResolvedValue({
      _id: 'u1',
      nombre: 'Usuario Test',
      email: 'test@example.com',
      password: 'hashed-password',
      rol: 'usuario'
    });
    bcrypt.compare.mockResolvedValue(true);

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: '123456' });

    expect(response.status).toBe(200);
    expect(response.body.token).toBeTruthy();
    expect(response.body.user.email).toBe('test@example.com');
  });

  test('GET /api/alumnos returns list for authenticated user', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });
    const alumnos = [{ _id: 'a1', nombres: 'Ana', apellidos: 'Lopez' }];

    const lean = jest.fn().mockResolvedValue(alumnos);
    const populateSede = jest.fn(() => ({ lean }));
    const populateRepresentante = jest.fn(() => ({ populate: populateSede }));
    Alumno.find.mockReturnValue({ populate: populateRepresentante });
    Mensualidad.aggregate.mockResolvedValue([{ _id: 'a1', cantidad: 2 }]);

    const response = await request(app)
      .get('/api/alumnos')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      solvencia_mensualidades: 'insolvente',
      mensualidades_insolventes: 2
    });
  });

  test('GET /api/representantes/por-usuario/:userId returns 200 null cuando usuario no tiene representante', async () => {
    const token = makeToken({ id: 'u1', rol: 'usuario', nombre: 'Usuario Final' });
    Representante.findOne.mockResolvedValue(null);

    const response = await request(app)
      .get('/api/representantes/por-usuario/u1')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
  });

  test('GET /api/alumnos/por-representante/null no rompe para usuario final sin representante', async () => {
    const token = makeToken({ id: 'u1', rol: 'usuario', nombre: 'Usuario Final' });

    Representante.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([])
    });

    const populateSede = jest.fn().mockResolvedValue([]);
    Alumno.find.mockReturnValue({ populate: populateSede });

    const response = await request(app)
      .get('/api/alumnos/por-representante/null?usuarioId=u1&populateSede=1')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  test('POST /api/pagos registers payment', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const mensualidadDoc = {
      _id: 'm1',
      monto_esperado: 100,
      id_alumno: { habilitar_pago_cuotas: true },
      estatus: 'Pendiente',
      save: jest.fn().mockResolvedValue(true)
    };

    Mensualidad.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mensualidadDoc)
    });
    PagoDetalle.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ _id: 'p1', monto_pagado: 100 }]);
    PagoDetalle.create.mockResolvedValue({ _id: 'p1' });

    const response = await request(app)
      .post('/api/pagos')
      .set('Authorization', `Bearer ${token}`)
      .field('id_mensualidad', 'm1')
      .field('monto_pagado', '100.18')
      .field('monto_pagado_bs', '7075')
      .field('monto_esperado_usd', '100')
      .field('monto_esperado_bs', '7075')
      .field('fecha_pago', '2026-03-06')
      .field('metodo_pago', 'Pago movil')
      .field('referencia', 'ABC123');

    expect(response.status).toBe(200);
    expect(response.body.estatus).toBe('Pagado');
    expect(PagoDetalle.create).toHaveBeenCalledWith(expect.objectContaining({
      monto_pagado: 100.18,
      monto_pagado_bs: 7075,
      monto_esperado_usd: 100,
      monto_esperado_bs: 7075
    }));
  });

  test('POST /api/pagos/agrupado registers one transfer for two athletes', async () => {
    const token = makeToken({ id: 'u1', rol: 'usuario', nombre: 'Representante' });
    const mensualidades = {
      m1: {
        _id: 'm1', mes: 9, anio: 2026, monto_esperado: 40, estatus: 'Pendiente',
        id_alumno: { _id: 'a1', nombres: 'Ana', usuario: 'u1', representante: 'r1' },
        save: jest.fn().mockResolvedValue(true)
      },
      m2: {
        _id: 'm2', mes: 10, anio: 2026, monto_esperado: 60, estatus: 'Pendiente',
        id_alumno: { _id: 'a2', nombres: 'Eva', usuario: 'u1', representante: 'r1' },
        save: jest.fn().mockResolvedValue(true)
      }
    };

    Mensualidad.findById.mockImplementation((id) => ({
      populate: jest.fn().mockResolvedValue(mensualidades[id])
    }));
    Mensualidad.find.mockImplementation((filtro) => ({
      select: jest.fn().mockResolvedValue([mensualidades[String(filtro.id_alumno)]].filter(Boolean))
    }));
    PagoDetalle.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ monto_pagado: 40, monto_pagado_bs: 1600 }])
      .mockResolvedValueOnce([{ monto_pagado: 60, monto_pagado_bs: 2400 }]);
    PagoAgrupado.create.mockImplementation(async ([data]) => [{ ...data, _id: 'pa1' }]);
    PagoDetalle.create
      .mockImplementationOnce(async ([data]) => [{ ...data, _id: 'pd1' }])
      .mockImplementationOnce(async ([data]) => [{ ...data, _id: 'pd2' }]);

    const response = await request(app)
      .post('/api/pagos/agrupado')
      .set('Authorization', `Bearer ${token}`)
      .field('asignaciones', JSON.stringify([{ id_mensualidad: 'm1' }, { id_mensualidad: 'm2' }]))
      .field('monto_total', '100')
      .field('monto_total_bs', '4000')
      .field('fecha_pago', '2026-10-05')
      .field('metodo_pago', 'Pago movil')
      .field('referencia', '123456');

    expect(response.status).toBe(201);
    expect(response.body).toEqual(expect.objectContaining({ monto_total: 100, monto_total_bs: 4000, atletas: 2, asignaciones: 2 }));
    expect(PagoAgrupado.create).toHaveBeenCalledTimes(1);
    expect(PagoDetalle.create).toHaveBeenCalledTimes(2);
    expect(mensualidades.m1.estatus).toBe('En revision');
    expect(mensualidades.m2.estatus).toBe('En revision');
  });

  test('GET mensualidades de octubre refleja credito nuevo sin consumirlo y aun con filtro de mes', async () => {
    const token = makeToken({ id: 'u1', rol: 'usuario' });
    const alumno = { _id: 'a1', usuario: 'u1', saldo_a_favor_mensualidades: 1.03, save: jest.fn() };
    const octubre = { _id: 'oct1', id_alumno: alumno, mes: 10, anio: 2026, monto_base: 15,
      monto_esperado: 19, monto_sin_recargo_usd: 15, recargo_aplicado_usd: 4,
      estatus: 'Insolvente', bloqueo_recargo_automatico: true, save: jest.fn() };
    const noviembre = { ...octubre, _id: 'nov1', mes: 11, estatus: 'Pendiente' };
    Representante.find.mockReturnValue({ select: jest.fn().mockResolvedValue([]) });
    Alumno.find.mockReturnValue({ select: jest.fn().mockResolvedValue([alumno]) });
    Alumno.findById.mockResolvedValue(alumno);
    Mensualidad.find.mockImplementation((filter) => ({ populate: jest.fn().mockResolvedValue(filter.mes ? [octubre] : [octubre, noviembre]) }));
    PagoDetalle.find.mockImplementation((filter) => filter.id_pago_agrupado
      ? { select: jest.fn().mockResolvedValue([]) } : Promise.resolve([]));
    PagoDetalle.aggregate = jest.fn().mockResolvedValue([]);
    const consulta = () => request(app).get('/api/mensualidades?id_alumno=a1&mes=10&anio=2026').set('Authorization', `Bearer ${token}`);
    let res = await consulta();
    expect(res.status).toBe(200);
    expect(res.body[0]).toMatchObject({ saldo_pendiente: 17.97, credito_a_aplicar: 1.03, saldo_a_favor_disponible: 1.03 });
    expect(alumno.saldo_a_favor_mensualidades).toBe(1.03);
    alumno.saldo_a_favor_mensualidades = 4.03;
    res = await consulta();
    expect(res.body[0]).toMatchObject({ saldo_pendiente: 14.97, credito_a_aplicar: 4.03 });
    expect(alumno.save).not.toHaveBeenCalled();
    expect(octubre.monto_esperado).toBe(19);
    expect(PagoDetalle.create).not.toHaveBeenCalled();
  });

  test('roles internos sin permiso de gestion no acceden ni editan pagos agrupados', async () => {
    const token = makeToken({ id: 'u1', rol: 'entrenador', permisos: [], nombre: 'Entrenador' });
    const consulta = await request(app).get('/api/pagos/agrupado/pa1').set('Authorization', `Bearer ${token}`);
    const edicion = await request(app).patch('/api/pagos/agrupado/pa1').set('Authorization', `Bearer ${token}`).send({ referencia: '262626' });
    const retiro = await request(app).patch('/api/pagos/agrupado/pa1/mensualidades/m1/retirar-recargo').set('Authorization', `Bearer ${token}`).send({ version: '0:vieja' });
    const retiroGrupo = await request(app).patch('/api/pagos/agrupado/pa1/retirar-recargos').set('Authorization', `Bearer ${token}`).send({ version: '0:vieja' });
    expect(consulta.status).toBe(403);
    expect(edicion.status).toBe(403);
    expect(retiro.status).toBe(403);
    expect(retiroGrupo.status).toBe(403);
    expect(PagoAgrupado.findById).not.toHaveBeenCalled();
  });

  test('el usuario no puede consultar ni subir archivos a un grupo ajeno', async () => {
    const token = makeToken({ id: 'u1', rol: 'usuario', permisos: [] });
    PagoAgrupado.findById.mockResolvedValue({ _id: 'pa1', representante: 'r1' });
    Representante.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ usuario: 'otro' }) });
    const consulta = await request(app).get('/api/pagos/agrupado/pa1').set('Authorization', `Bearer ${token}`);
    const edicion = await request(app).patch('/api/pagos/agrupado/pa1').set('Authorization', `Bearer ${token}`)
      .attach('comprobante', Buffer.from('test'), 'archivo.txt');
    const tasa = await request(app).get('/api/pagos/agrupado/pa1/tasa?fecha=2026-10-07').set('Authorization', `Bearer ${token}`);
    expect(consulta.status).toBe(403);
    expect(tasa.status).toBe(403);
    expect(edicion.status).toBe(403);
    expect(edicion.body.error).toContain('No tienes permiso');
    expect(Mensualidad.findById).not.toHaveBeenCalled();
  });

  test('HTTP permite al propietario ver el total y editar el grupo sin conceder gestion de recargos', async () => {
    const token = makeToken({ id: 'u1', rol: 'usuario', permisos: [] });
    const fecha = '2026-10-06T00:00:00.000Z';
    const grupo = { _id: 'pa1', representante: 'r1', estado: 'En revision', cantidad_atletas: 2,
      monto_total: 28, monto_total_bs: 24427, updatedAt: fecha, __v: 0, ediciones: [], increment: jest.fn(), save: jest.fn().mockResolvedValue(undefined) };
    const detalles = ['1', '2'].map((numero) => ({ _id: `p${numero}`, id_pago_agrupado: 'pa1', id_mensualidad: `m${numero}`,
      monto_pagado: 14, monto_pagado_bs: 12213.5, save: jest.fn().mockResolvedValue(undefined) }));
    const mensualidades = Object.fromEntries(['1', '2'].map((numero) => [`m${numero}`, { _id: `m${numero}`,
      id_alumno: { _id: `a${numero}`, nombres: `Atleta ${numero}`, representante: 'r1' }, monto_esperado: 14,
      bloquear_recargo_automatico: true, estatus: 'En revision', saldo_a_favor_generado: 0, updatedAt: fecha,
      save: jest.fn().mockResolvedValue(undefined) }]));
    PagoAgrupado.db = { startSession: jest.fn().mockResolvedValue({
      withTransaction: jest.fn(async (operacion) => operacion()), endSession: jest.fn().mockResolvedValue(undefined)
    }), db: { admin: () => ({ command: jest.fn().mockResolvedValue({ setName: 'rs0' }) }) } };
    PagoAgrupado.findById.mockResolvedValue(grupo);
    Representante.findById.mockReturnValue({ select: jest.fn().mockResolvedValue({ usuario: 'u1' }) });
    Mensualidad.findById.mockImplementation((id) => ({ populate: () => Promise.resolve(mensualidades[id]) }));
    PagoDetalle.find.mockImplementation((filter) => filter.id_pago_agrupado
      ? { sort: () => Promise.resolve(detalles) }
      : Promise.resolve(detalles.filter((detalle) => detalle.id_mensualidad === filter.id_mensualidad)));
    const consulta = await request(app).get('/api/pagos/agrupado/pa1').set('Authorization', `Bearer ${token}`);
    expect(consulta.status).toBe(200);
    expect(consulta.body.pago.monto_total).toBe(28);
    expect(consulta.body.asignaciones).toHaveLength(2);
    const tasa = await request(app).get('/api/pagos/agrupado/pa1/tasa?fecha=2026-10-07').set('Authorization', `Bearer ${token}`);
    expect(tasa.status).toBe(200);
    expect(tasa.body).toMatchObject({ tasa: 872.39, fecha_pago: '2026-10-07', moneda: 'USD' });
    const edicion = await request(app).patch('/api/pagos/agrupado/pa1').set('Authorization', `Bearer ${token}`)
      .send({ version: `0:${fecha}`, fecha_pago: '2026-10-07', metodo_pago: 'Pago movil', referencia: '262626',
        monto_total: 28, monto_total_bs: 24427, asignaciones: [{ id_pago: 'p1', monto_pagado: 14 }, { id_pago: 'p2', monto_pagado: 14 }] });
    expect(edicion.status).toBe(200);
    expect(grupo.ediciones[0].usuario).toBe('u1');
    for (const detalle of detalles) expect(detalle.referencia).toBe('262626');
    for (const ruta of ['/api/pagos/agrupado/pa1/retirar-recargos', '/api/pagos/agrupado/pa1/mensualidades/m1/retirar-recargo']) {
      expect((await request(app).patch(ruta).set('Authorization', `Bearer ${token}`).send({})).status).toBe(403);
    }
    expect(grupo.save).toHaveBeenCalledTimes(1);
  });

  test('el retiro de todo el grupo exige las versiones de todas las mensualidades', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });
    PagoAgrupado.db = { startSession: jest.fn().mockResolvedValue({
      withTransaction: jest.fn(async (operacion) => operacion()), endSession: jest.fn().mockResolvedValue(undefined)
    }) };
    PagoAgrupado.findById.mockResolvedValue({ _id: 'pa1', estado: 'En revision', cantidad_atletas: 2,
      monto_total: 28, monto_total_bs: 24427, updatedAt: '2026-10-06T00:00:00.000Z', __v: 0 });
    PagoDetalle.find.mockResolvedValue([
      { _id: 'p1', id_mensualidad: 'm1', monto_pagado: 14, monto_pagado_bs: 12213.5 },
      { _id: 'p2', id_mensualidad: 'm2', monto_pagado: 14, monto_pagado_bs: 12213.5 }
    ]);
    const respuesta = await request(app).patch('/api/pagos/agrupado/pa1/retirar-recargos')
      .set('Authorization', `Bearer ${token}`).send({ version: '0:2026-10-06T00:00:00.000Z',
        mensualidades: [{ id_mensualidad: 'm1', version: '0:2026-10-06T00:00:00.000Z' }] });
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error).toContain('todas las mensualidades');
    expect(Mensualidad.findById).not.toHaveBeenCalled();
  });

  test('no permite retirar recargo agrupado ni cambiar su monto por el endpoint individual', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });
    const mensualidad = { _id: 'm1', monto_esperado: 14, monto_sin_recargo_usd: 10, estatus: 'En revision', save: jest.fn() };
    Mensualidad.findById.mockResolvedValue(mensualidad);
    PagoDetalle.find.mockReturnValue({ select: jest.fn().mockResolvedValue([{ id_pago_agrupado: 'pa1' }]) });
    for (const bloquear of [true, false]) {
      const res = await request(app).patch('/api/mensualidades/m1').set('Authorization', `Bearer ${token}`)
        .send({ monto_esperado: 10, bloquear_recargo_automatico: bloquear, nota: 'Prueba de proteccion agrupada' });
      expect(res.status).toBe(409);
    }
    expect(mensualidad.save).not.toHaveBeenCalled();
    expect(Alumno.findByIdAndUpdate).not.toHaveBeenCalled();
  });

  test('edicion de pago agrupado rechaza comprobantes no permitidos o mayores de 10 MB', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });
    const tipoInvalido = await request(app).patch('/api/pagos/agrupado/pa1')
      .set('Authorization', `Bearer ${token}`).attach('comprobante', Buffer.from('test'), 'archivo.txt');
    const muyGrande = await request(app).patch('/api/pagos/agrupado/pa1')
      .set('Authorization', `Bearer ${token}`).attach('comprobante', Buffer.alloc(10 * 1024 * 1024 + 1), 'archivo.pdf');
    expect(tipoInvalido.status).toBe(400);
    expect(muyGrande.status).toBe(400);
    expect(muyGrande.body.error).toContain('10 MB');
    expect(PagoAgrupado.findById).not.toHaveBeenCalled();
  });

  test('conciliacion matches and confirms all assignments in a grouped payment', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });
    const mensualidades = {
      m1: { _id: 'm1', monto_esperado: 40, estatus: 'En revision', id_alumno: { nombres: 'Ana' }, save: jest.fn().mockResolvedValue(true) },
      m2: { _id: 'm2', monto_esperado: 60, estatus: 'En revision', id_alumno: { nombres: 'Eva' }, save: jest.fn().mockResolvedValue(true) }
    };
    const pagoAgrupado = {
      _id: 'pa1',
      codigo: 'PA-TEST',
      estado: 'En revision',
      referencia: '123456',
      monto_total: 100,
      monto_total_bs: 4000,
      fecha_pago: '2026-10-05',
      cantidad_atletas: 2,
      increment: jest.fn(),
      save: jest.fn().mockResolvedValue(true)
    };

    Mensualidad.find.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue(Object.values(mensualidades))
      })
    });
    PagoDetalle.find.mockReturnValue({ select: jest.fn().mockResolvedValue([]) });
    PagoAgrupado.find.mockReturnValue({ select: jest.fn().mockResolvedValue([pagoAgrupado]) });

    const preview = await request(app)
      .post('/api/conciliacion/previsualizar')
      .set('Authorization', `Bearer ${token}`)
      .attach('archivo', Buffer.from('Referencia;Monto;Fecha\n123456;4000;05/10/2026\n'), 'banco.txt');

    expect(preview.status).toBe(200);
    expect(preview.body.match_total).toHaveLength(1);
    expect(preview.body.match_total[0].sistema).toEqual(expect.objectContaining({
      pago_id: 'pa1',
      pago_agrupado_id: 'pa1',
      monto_bs: 4000
    }));

    PagoAgrupado.db = { startSession: jest.fn().mockResolvedValue({
      withTransaction: jest.fn(async (operacion) => operacion()),
      endSession: jest.fn().mockResolvedValue(undefined)
    }) };
    PagoAgrupado.find.mockResolvedValue([pagoAgrupado]);
    PagoAgrupado.findById.mockResolvedValue(pagoAgrupado);
    Mensualidad.findById.mockImplementation((id) => Promise.resolve(mensualidades[id]));
    PagoDetalle.find.mockImplementation((filtro) => ({
      select: jest.fn().mockResolvedValue(filtro._id ? [] : filtro.id_pago_agrupado
        ? [
            { _id: 'pd1', id_mensualidad: 'm1', id_pago_agrupado: 'pa1' },
            { _id: 'pd2', id_mensualidad: 'm2', id_pago_agrupado: 'pa1' }
          ]
        : [{ monto_pagado: filtro.id_mensualidad === 'm1' ? 40 : 60 }])
    }));

    const confirmacion = await request(app)
      .post('/api/conciliacion/confirmar-match-total')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipo_conciliacion: 'mensualidades', pago_ids: ['pa1'] });

    expect(confirmacion.status).toBe(200);
    expect(confirmacion.body.mensualidades_actualizadas).toBe(2);
    expect(mensualidades.m1.estatus).toBe('Pagado');
    expect(mensualidades.m2.estatus).toBe('Pagado');
    expect(pagoAgrupado.estado).toBe('Conciliado');
  });

  test('POST /api/conciliacion/pagos-agrupados/:id/rechazar removes all assignments', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });
    const pagoAgrupado = {
      _id: 'pa1',
      codigo: 'PA-TEST',
      estado: 'En revision',
      increment: jest.fn(),
      save: jest.fn().mockResolvedValue(true)
    };
    const mensualidades = {
      m1: { _id: 'm1', monto_esperado: 40, fecha_vencimiento: '2027-01-01', estatus: 'En revision', save: jest.fn().mockResolvedValue(true) },
      m2: { _id: 'm2', monto_esperado: 60, fecha_vencimiento: '2027-01-01', estatus: 'En revision', save: jest.fn().mockResolvedValue(true) }
    };

    PagoAgrupado.db = { startSession: jest.fn().mockResolvedValue({
      withTransaction: jest.fn(async (operacion) => operacion()),
      endSession: jest.fn().mockResolvedValue(undefined)
    }) };
    PagoAgrupado.findOne.mockResolvedValue(pagoAgrupado);
    PagoAgrupado.findById.mockResolvedValue(pagoAgrupado);
    PagoDetalle.find
      .mockReturnValueOnce({ select: jest.fn().mockResolvedValue([
        { _id: 'pd1', id_mensualidad: 'm1' },
        { _id: 'pd2', id_mensualidad: 'm2' }
      ]) })
      .mockReturnValue({ select: jest.fn().mockResolvedValue([]) });
    PagoDetalle.deleteMany.mockResolvedValue({ deletedCount: 2 });
    Mensualidad.findById.mockImplementation((id) => Promise.resolve(mensualidades[id]));

    const response = await request(app)
      .post('/api/conciliacion/pagos-agrupados/pa1/rechazar')
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo: 'Transferencia no localizada' });

    expect(response.status).toBe(200);
    expect(response.body.asignaciones_retiradas).toBe(2);
    expect(PagoDetalle.deleteMany).toHaveBeenCalledWith({ id_pago_agrupado: 'pa1' });
    expect(mensualidades.m1.estatus).toBe('Pendiente');
    expect(mensualidades.m2.estatus).toBe('Pendiente');
    expect(pagoAgrupado.estado).toBe('Rechazado');
    expect(pagoAgrupado.motivo_rechazo).toBe('Transferencia no localizada');
  });

  test('POST /api/conciliacion/previsualizar incluye monto esperado del sistema', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const mensualidadDoc = {
      _id: 'm1',
      monto_esperado: 100,
      estatus: 'En revision',
      id_alumno: {
        nombres: 'Ana',
        apellidos: 'Lopez'
      }
    };

    Mensualidad.find.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([mensualidadDoc])
      })
    });

    PagoDetalle.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([
        {
          _id: 'p1',
          id_mensualidad: 'm1',
          referencia: '123456',
          monto_pagado_bs: 7075,
          monto_esperado_bs: 7075,
          monto_esperado_usd: 100,
          fecha_pago: '2026-03-06'
        }
      ])
    });

    const archivoTxt = Buffer.from('Referencia;Monto;Fecha\n123456;7075;06/03/2026\n');

    const response = await request(app)
      .post('/api/conciliacion/previsualizar')
      .set('Authorization', `Bearer ${token}`)
      .attach('archivo', archivoTxt, {
        filename: 'conciliacion.txt',
        contentType: 'text/plain'
      });

    expect(response.status).toBe(200);
    expect(response.body.match_total).toHaveLength(1);
    expect(response.body.match_total[0].sistema).toEqual(expect.objectContaining({
      monto_esperado_bs: 7075,
      monto_esperado_usd: 100,
      monto_bs: 7075,
      alumno: 'Ana Lopez'
    }));
  });

  test('POST /api/conciliacion/previsualizar marca match parcial cuando referencia coincide y monto excel supera tolerancia', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const mensualidadDoc = {
      _id: 'm1',
      monto_esperado: 100,
      estatus: 'En revision',
      id_alumno: {
        nombres: 'Leticia',
        apellidos: 'Garcia'
      }
    };

    Mensualidad.find.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([mensualidadDoc])
      })
    });

    PagoDetalle.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([
        {
          _id: 'p1',
          id_mensualidad: 'm1',
          referencia: '62138367408',
          monto_pagado_bs: 12000,
          monto_esperado_bs: 12000,
          monto_esperado_usd: 100,
          fecha_pago: '2026-03-06'
        }
      ])
    });

    const archivoTxt = Buffer.from('Referencia;Monto;Fecha\n62138367408;12250;06/03/2026\n');

    const response = await request(app)
      .post('/api/conciliacion/previsualizar')
      .set('Authorization', `Bearer ${token}`)
      .attach('archivo', archivoTxt, {
        filename: 'conciliacion.txt',
        contentType: 'text/plain'
      });

    expect(response.status).toBe(200);
    expect(response.body.match_total).toHaveLength(0);
    expect(response.body.match_parcial).toHaveLength(1);
    expect(response.body.match_parcial[0]).toEqual(expect.objectContaining({
      match_por: 'referencia',
      motivo: expect.arrayContaining(['misma referencia con diferencia de monto'])
    }));
  });

  test('POST /api/conciliacion/previsualizar hace match por cedula en descripcion TRAV con bloque largo', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const mensualidadDoc = {
      _id: 'm1',
      monto_esperado: 20,
      estatus: 'En revision',
      id_alumno: {
        nombres: 'Eugenia Valentina',
        apellidos: 'Prado Torres'
      }
    };

    Mensualidad.find.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([mensualidadDoc])
      })
    });

    PagoDetalle.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([
        {
          _id: 'p-eugenia',
          id_mensualidad: 'm1',
          referencia: '17011969',
          telefono_pago: '4262509456',
          cedula_titular: 'V-17011969',
          monto_pagado_bs: 11935.65,
          monto_esperado_bs: 11935.65,
          monto_esperado_usd: 20,
          fecha_pago: '2026-06-17'
        }
      ])
    });

    const archivoTxt = Buffer.from('Fecha;Descripcion;Monto\n17/06/2026;TRAV0017011969000008380;11935,65\n');

    const response = await request(app)
      .post('/api/conciliacion/previsualizar')
      .set('Authorization', `Bearer ${token}`)
      .attach('archivo', archivoTxt, {
        filename: 'conciliacion_provincial.txt',
        contentType: 'text/plain'
      });

    expect(response.status).toBe(200);
    expect(response.body.match_total).toHaveLength(1);
    expect(response.body.match_total[0]).toEqual(expect.objectContaining({
      match_por: 'cedula',
      identificador_banco: '17011969'
    }));
  });

  test('POST /api/conciliacion/previsualizar?banco=0108 prioriza descripcion para Provincial aunque exista referencia no util', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const mensualidadDoc = {
      _id: 'm1',
      monto_esperado: 20,
      estatus: 'En revision',
      id_alumno: {
        nombres: 'Victoria',
        apellidos: 'Alvarado'
      }
    };

    Mensualidad.find.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([mensualidadDoc])
      })
    });

    PagoDetalle.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([
        {
          _id: 'p-victoria',
          id_mensualidad: 'm1',
          referencia: '701278',
          telefono_pago: '04121234567',
          cedula_titular: 'V-17012780',
          monto_pagado_bs: 13050,
          monto_esperado_bs: 13050,
          monto_esperado_usd: 20,
          fecha_pago: '2026-05-08'
        }
      ])
    });

    const archivoTxt = Buffer.from('Fecha;Referencia;Descripcion;Monto\n08/05/2026;1871;TRAV001701278000014442;13.050,00\n');

    const response = await request(app)
      .post('/api/conciliacion/previsualizar?banco=0108')
      .set('Authorization', `Bearer ${token}`)
      .attach('archivo', archivoTxt, {
        filename: 'conciliacion_provincial_con_referencia.txt',
        contentType: 'text/plain'
      });

    expect(response.status).toBe(200);
    expect(response.body.banco_conciliacion).toBe('provincial');
    expect(response.body.match_total).toHaveLength(1);
    expect(response.body.match_total[0]).toEqual(expect.objectContaining({
      match_por: 'cedula',
      identificador_banco: '17012780'
    }));
  });

  test('POST /api/conciliacion/previsualizar hace match por cedula extraida de descripcion ABO.DRV sin columna referencia', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const mensualidadDoc = {
      _id: 'm1',
      monto_esperado: 20,
      estatus: 'En revision',
      id_alumno: {
        nombres: 'Claudia Sophia',
        apellidos: 'Valderrama Moran'
      }
    };

    Mensualidad.find.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([mensualidadDoc])
      })
    });

    PagoDetalle.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([
        {
          _id: 'p-claudia',
          id_mensualidad: 'm1',
          referencia: '18137500',
          telefono_pago: '4129313853',
          cedula_titular: 'V-18137500',
          monto_pagado_bs: 11935.65,
          monto_esperado_bs: 11935.65,
          monto_esperado_usd: 20,
          fecha_pago: '2026-06-17'
        }
      ])
    });

    const archivoTxt = Buffer.from('Fecha;Descripcion;Monto;Saldo\n17/06/2026;ABO.DRV0018137500;11.935,65;111.207,19\n');

    const response = await request(app)
      .post('/api/conciliacion/previsualizar')
      .set('Authorization', `Bearer ${token}`)
      .attach('archivo', archivoTxt, {
        filename: 'conciliacion_abodrv.txt',
        contentType: 'text/plain'
      });

    expect(response.status).toBe(200);
    expect(response.body.match_total).toHaveLength(1);
    expect(response.body.match_total[0]).toEqual(expect.objectContaining({
      match_por: 'cedula',
      identificador_banco: '18137500'
    }));
  });

  test('POST /api/conciliacion/previsualizar evita match cuando identificador en descripcion contradice cedula del sistema', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const mensualidadDoc = {
      _id: 'm1',
      monto_esperado: 20,
      estatus: 'En revision',
      id_alumno: {
        nombres: 'Eugenia Valentina',
        apellidos: 'Prado Torres'
      }
    };

    Mensualidad.find.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([mensualidadDoc])
      })
    });

    PagoDetalle.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([
        {
          _id: 'p-eugenia',
          id_mensualidad: 'm1',
          referencia: '17011969',
          telefono_pago: '4262509456',
          cedula_titular: 'V-17011969',
          monto_pagado_bs: 11935.65,
          monto_esperado_bs: 11935.65,
          monto_esperado_usd: 20,
          fecha_pago: '2026-06-17'
        }
      ])
    });

    // Mismo monto/fecha, pero identificador embebido apunta a otra cedula.
    const archivoTxt = Buffer.from('Fecha;Descripcion;Monto;Saldo\n17/06/2026;ABO.DRV0099999999;11.935,65;111.207,19\n');

    const response = await request(app)
      .post('/api/conciliacion/previsualizar')
      .set('Authorization', `Bearer ${token}`)
      .attach('archivo', archivoTxt, {
        filename: 'conciliacion_identificador_invalido.txt',
        contentType: 'text/plain'
      });

    expect(response.status).toBe(200);
    expect(response.body.match_total).toHaveLength(0);
    expect(response.body.match_parcial).toHaveLength(0);
  });

  test.each([
    ['obligatoria completa', 'obligatoria', 'pago_completo', 'bajo_solicitud', undefined, 20, false],
    ['obligatoria 50/50 solicitada', 'obligatoria', 'dos_partes_50', 'bajo_solicitud', undefined, 10, false],
    ['obligatoria 50/50 libre', 'obligatoria', 'dos_partes_50', 'libre', undefined, 10, true],
    ['flexible elige completa', 'flexible', 'dos_partes_50', 'bajo_solicitud', 'pago_completo', 20, false],
    ['flexible elige 50/50 solicitada', 'flexible', 'pago_completo', 'bajo_solicitud', 'dos_partes_50', 10, false],
    ['flexible elige 50/50 libre', 'flexible', 'pago_completo', 'libre', 'dos_partes_50', 10, true]
  ])('PATCH /api/uniformes/pedidos/:id/pagar procesa %s', async (
    _caso,
    reglaCobranza,
    metodoInicial,
    aperturaSegundaCuota,
    metodoSolicitado,
    montoEsperado,
    segundaParteHabilitada
  ) => {
    const token = makeToken({ id: 'usuario1', rol: 'usuario', nombre: 'Representante' });
    const pedidoDoc = {
      _id: 'pedido1',
      estado: 'esperando_pago',
      solicitado_por: 'usuario1',
      precio: 20,
      monto_pagado: 0,
      monto_pagado_bs: 0,
      monto_ultimo_pago: 0,
      monto_ultimo_pago_bs: 0,
      saldo_pendiente: metodoInicial === 'dos_partes_50' ? 10 : 20,
      metodo_cobranza: metodoInicial,
      regla_cobranza: reglaCobranza,
      apertura_segunda_cuota: aperturaSegundaCuota,
      segunda_parte_habilitada: metodoInicial === 'dos_partes_50' && aperturaSegundaCuota === 'libre',
      monto_primera_parte_objetivo: metodoInicial === 'dos_partes_50' ? 10 : 0,
      pagos_historial: [],
      save: jest.fn().mockResolvedValue(true)
    };
    const populatedQuery = {
      populate: jest.fn().mockReturnThis(),
      then: (resolve) => resolve(pedidoDoc)
    };
    UniformePedido.findById
      .mockResolvedValueOnce(pedidoDoc)
      .mockReturnValueOnce(populatedQuery);

    let pagoRequest = request(app)
      .patch('/api/uniformes/pedidos/pedido1/pagar')
      .set('Authorization', `Bearer ${token}`)
      .field('metodo_pago', 'Pago movil')
      .field('monto_pagado', String(montoEsperado))
      .field('monto_pagado_bs', String(montoEsperado * 800))
      .field('fecha_pago', '2026-09-15');
    if (metodoSolicitado) {
      pagoRequest = pagoRequest.field('metodo_cobranza', metodoSolicitado);
    }

    const response = await pagoRequest;

    expect(response.status).toBe(200);
    expect(pedidoDoc.estado).toBe('pago_en_revision');
    expect(pedidoDoc.metodo_cobranza).toBe(metodoSolicitado || metodoInicial);
    expect(pedidoDoc.monto_ultimo_pago).toBe(montoEsperado);
    expect(pedidoDoc.segunda_parte_habilitada).toBe(segundaParteHabilitada);
    expect(pedidoDoc.pagos_historial).toHaveLength(0);
  });

  test('PATCH /api/uniformes/pedidos/:id/pagar rechaza un monto menor al tramo 50/50', async () => {
    const token = makeToken({ id: 'usuario1', rol: 'usuario', nombre: 'Representante' });
    const pedidoDoc = {
      _id: 'pedido1',
      estado: 'esperando_pago',
      solicitado_por: 'usuario1',
      precio: 20,
      monto_pagado: 0,
      monto_pagado_bs: 0,
      saldo_pendiente: 10,
      metodo_cobranza: 'dos_partes_50',
      regla_cobranza: 'obligatoria',
      apertura_segunda_cuota: 'bajo_solicitud',
      segunda_parte_habilitada: false,
      monto_primera_parte_objetivo: 10,
      pagos_historial: [],
      save: jest.fn().mockResolvedValue(true)
    };
    UniformePedido.findById.mockResolvedValueOnce(pedidoDoc);

    const response = await request(app)
      .patch('/api/uniformes/pedidos/pedido1/pagar')
      .set('Authorization', `Bearer ${token}`)
      .field('metodo_pago', 'Pago movil')
      .field('monto_pagado', '9.98')
      .field('monto_pagado_bs', '7984')
      .field('fecha_pago', '2026-09-15');

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('monto exacto');
    expect(pedidoDoc.save).not.toHaveBeenCalled();
  });

  test('PATCH /api/uniformes/pedidos/:id/pagar impide cambiar una modalidad obligatoria', async () => {
    const token = makeToken({ id: 'usuario1', rol: 'usuario', nombre: 'Representante' });
    const pedidoDoc = {
      _id: 'pedido1',
      estado: 'esperando_pago',
      solicitado_por: 'usuario1',
      precio: 20,
      monto_pagado: 0,
      monto_pagado_bs: 0,
      saldo_pendiente: 20,
      metodo_cobranza: 'pago_completo',
      regla_cobranza: 'obligatoria',
      apertura_segunda_cuota: 'bajo_solicitud',
      segunda_parte_habilitada: false,
      pagos_historial: [],
      save: jest.fn().mockResolvedValue(true)
    };
    UniformePedido.findById.mockResolvedValueOnce(pedidoDoc);

    const response = await request(app)
      .patch('/api/uniformes/pedidos/pedido1/pagar')
      .set('Authorization', `Bearer ${token}`)
      .field('metodo_pago', 'Pago movil')
      .field('metodo_cobranza', 'dos_partes_50')
      .field('monto_pagado', '10')
      .field('monto_pagado_bs', '8000')
      .field('fecha_pago', '2026-09-15');

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('obligatoria');
    expect(pedidoDoc.metodo_cobranza).toBe('pago_completo');
    expect(pedidoDoc.save).not.toHaveBeenCalled();
  });

  test('PATCH /api/uniformes/pedidos/:id permite a administracion cambiar la modalidad de una solicitud', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });
    const pedidoDoc = {
      _id: 'pedido1',
      alumno: 'alumno1',
      uniforme: '507f1f77bcf86cd799439011',
      estado: 'pendiente',
      precio: 20,
      monto_pagado: 0,
      metodo_cobranza: 'pago_completo',
      regla_cobranza: 'obligatoria',
      apertura_segunda_cuota: 'bajo_solicitud',
      segunda_parte_habilitada: false,
      save: jest.fn().mockResolvedValue(true)
    };
    const uniformeDoc = {
      metodo_cobranza: 'pago_completo',
      regla_cobranza: 'obligatoria',
      apertura_segunda_cuota: 'bajo_solicitud'
    };
    UniformePedido.findById
      .mockResolvedValueOnce(pedidoDoc)
      .mockReturnValueOnce({
        populate: jest.fn().mockReturnThis(),
        then: (resolve) => resolve(pedidoDoc)
      });
    Uniforme.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(uniformeDoc)
    });

    const response = await request(app)
      .patch('/api/uniformes/pedidos/pedido1')
      .set('Authorization', `Bearer ${token}`)
      .send({ metodo_cobranza: 'dos_partes_50' });

    expect(response.status).toBe(200);
    expect(pedidoDoc.metodo_cobranza).toBe('dos_partes_50');
    expect(pedidoDoc.monto_primera_parte_objetivo).toBe(10);
    expect(pedidoDoc.segunda_parte_habilitada).toBe(false);
    expect(pedidoDoc.save).toHaveBeenCalled();
  });

  test('PATCH /api/uniformes/pedidos/:id/pagar bloquea segunda cuota bajo solicitud', async () => {
    const token = makeToken({ id: 'usuario1', rol: 'usuario', nombre: 'Representante' });
    const pedidoDoc = {
      _id: 'pedido1',
      estado: 'abono',
      solicitado_por: 'usuario1',
      precio: 20,
      monto_pagado: 10,
      monto_pagado_bs: 8000,
      saldo_pendiente: 10,
      metodo_cobranza: 'dos_partes_50',
      regla_cobranza: 'obligatoria',
      apertura_segunda_cuota: 'bajo_solicitud',
      segunda_parte_habilitada: false,
      monto_primera_parte_objetivo: 10,
      pagos_historial: [{ monto_pagado: 10, monto_pagado_bs: 8000 }],
      save: jest.fn().mockResolvedValue(true)
    };
    UniformePedido.findById.mockResolvedValueOnce(pedidoDoc);

    const response = await request(app)
      .patch('/api/uniformes/pedidos/pedido1/pagar')
      .set('Authorization', `Bearer ${token}`)
      .field('metodo_pago', 'Transferencia')
      .field('monto_pagado', '10')
      .field('monto_pagado_bs', '8000')
      .field('fecha_pago', '2026-09-15');

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('habilite la segunda parte');
    expect(pedidoDoc.save).not.toHaveBeenCalled();
  });

  test('PATCH /api/uniformes/pedidos/:id/pagar permite segunda cuota libre y la envia a revision', async () => {
    const token = makeToken({ id: 'usuario1', rol: 'usuario', nombre: 'Representante' });
    const pedidoDoc = {
      _id: 'pedido1',
      estado: 'abono',
      solicitado_por: 'usuario1',
      precio: 20,
      monto_pagado: 10,
      monto_pagado_bs: 8000,
      monto_ultimo_pago: 0,
      monto_ultimo_pago_bs: 0,
      saldo_pendiente: 10,
      metodo_cobranza: 'dos_partes_50',
      regla_cobranza: 'obligatoria',
      apertura_segunda_cuota: 'libre',
      segunda_parte_habilitada: true,
      monto_primera_parte_objetivo: 10,
      pagos_historial: [{ monto_pagado: 10, monto_pagado_bs: 8000 }],
      save: jest.fn().mockResolvedValue(true)
    };
    const populatedQuery = {
      populate: jest.fn().mockReturnThis(),
      then: (resolve) => resolve(pedidoDoc)
    };
    UniformePedido.findById
      .mockResolvedValueOnce(pedidoDoc)
      .mockReturnValueOnce(populatedQuery);

    const response = await request(app)
      .patch('/api/uniformes/pedidos/pedido1/pagar')
      .set('Authorization', `Bearer ${token}`)
      .field('metodo_pago', 'Transferencia')
      .field('monto_pagado', '10')
      .field('monto_pagado_bs', '8000')
      .field('fecha_pago', '2026-09-15');

    expect(response.status).toBe(200);
    expect(pedidoDoc.estado).toBe('pago_en_revision');
    expect(pedidoDoc.monto_ultimo_pago).toBe(10);
    expect(pedidoDoc.pagos_historial).toHaveLength(1);
  });

  test('PATCH /api/uniformes/pedidos/:id/verificar-pago confirma el total aunque el saldo previo fuera media cuota', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });
    const pedidoDoc = {
      _id: 'pedido1',
      estado: 'pago_en_revision',
      precio: 20,
      monto_pagado: 0,
      monto_pagado_bs: 0,
      monto_ultimo_pago: 20,
      monto_ultimo_pago_bs: 16000,
      saldo_pendiente: 10,
      metodo_cobranza: 'pago_completo',
      pagos_historial: [],
      metodo_pago: 'Pago movil',
      referencia: '123456',
      fecha_pago: new Date('2026-09-15'),
      save: jest.fn().mockResolvedValue(true)
    };
    const queryInicial = {
      populate: jest.fn().mockReturnThis(),
      then: (resolve) => resolve(pedidoDoc)
    };
    const queryResultado = {
      populate: jest.fn().mockReturnThis(),
      then: (resolve) => resolve(pedidoDoc)
    };
    UniformePedido.findById
      .mockReturnValueOnce(queryInicial)
      .mockReturnValueOnce(queryResultado);

    const response = await request(app)
      .patch('/api/uniformes/pedidos/pedido1/verificar-pago')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(pedidoDoc.estado).toBe('verificado');
    expect(pedidoDoc.monto_pagado).toBe(20);
    expect(pedidoDoc.saldo_pendiente).toBe(0);
    expect(pedidoDoc.pagos_historial).toHaveLength(1);
    expect(pedidoDoc.pagos_historial[0].monto_pagado).toBe(20);
    expect(pedidoDoc.monto_ultimo_pago).toBe(0);
  });

  test('GET /api/configuracion oculta pagos de uniformes sin permiso de solicitudes', async () => {
    const token = makeToken({
      id: 'socio1',
      rol: 'socio',
      nombre: 'Socio',
      permisos: ['configuracion.view']
    });

    const response = await request(app)
      .get('/api/configuracion')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.pagos.por_concepto.mensualidades).toBeDefined();
    expect(response.body.pagos.por_concepto.uniformes).toBeUndefined();
  });

  test('PATCH /api/configuracion bloquea cambios de uniformes sin permiso de gestion', async () => {
    const token = makeToken({
      id: 'socio1',
      rol: 'socio',
      nombre: 'Socio',
      permisos: ['configuracion.manage']
    });

    const response = await request(app)
      .patch('/api/configuracion')
      .set('Authorization', `Bearer ${token}`)
      .send({
        pagos: {
          por_concepto: {
            uniformes: { usar_generales: false }
          }
        }
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/permiso/i);
  });

  test('POST /api/conciliacion/previsualizar bloquea uniformes sin permiso de solicitudes', async () => {
    const token = makeToken({
      id: 'socio1',
      rol: 'socio',
      nombre: 'Socio',
      permisos: ['conciliacion.manage']
    });
    const archivoTxt = Buffer.from('Referencia;Monto;Fecha\n123456;7075;06/03/2026\n');

    const response = await request(app)
      .post('/api/conciliacion/previsualizar?tipo_conciliacion=uniformes')
      .set('Authorization', `Bearer ${token}`)
      .attach('archivo', archivoTxt, {
        filename: 'conciliacion_uniformes.txt',
        contentType: 'text/plain'
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/permiso/i);
  });

  test('POST /api/conciliacion/confirmar-match-total bloquea uniformes sin permiso de gestion', async () => {
    const token = makeToken({
      id: 'socio1',
      rol: 'socio',
      nombre: 'Socio',
      permisos: ['conciliacion.manage', 'solicitudes_uniformes.view']
    });

    const response = await request(app)
      .post('/api/conciliacion/confirmar-match-total')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo_conciliacion: 'uniformes',
        pago_ids: ['u1']
      });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/permiso/i);
  });

  test('POST /api/conciliacion/previsualizar?tipo_conciliacion=uniformes retorna match total en pedidos pago_en_revision', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    UniformePedido.find.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([
          {
            _id: 'u1',
            alumno: { nombres: 'Lia', apellidos: 'Mendoza' },
            prenda: 'Franela',
            referencia: '123456',
            telefono_pago: '0412-1234567',
            cedula_titular: 'V-12345678',
            monto_ultimo_pago: 50,
            monto_ultimo_pago_bs: 7075,
            fecha_pago: '2026-03-06'
          }
        ])
      })
    });

    const archivoTxt = Buffer.from('Referencia;Monto;Fecha\n123456;7075;06/03/2026\n');

    const response = await request(app)
      .post('/api/conciliacion/previsualizar?tipo_conciliacion=uniformes')
      .set('Authorization', `Bearer ${token}`)
      .attach('archivo', archivoTxt, {
        filename: 'conciliacion_uniformes.txt',
        contentType: 'text/plain'
      });

    expect(response.status).toBe(200);
    expect(response.body.tipo_conciliacion).toBe('uniformes');
    expect(response.body.match_total).toHaveLength(1);
    expect(response.body.match_total[0].sistema).toEqual(expect.objectContaining({
      registro_tipo: 'uniformes',
      pedido_id: 'u1',
      monto_esperado_bs: 7075,
      monto_esperado_usd: 50,
      monto_bs: 7075,
      alumno: 'Lia Mendoza'
    }));
  });

  test('POST /api/conciliacion/confirmar-match-total confirma pedidos uniformes en pago_en_revision', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const pedidoDoc = {
      _id: 'u1',
      estado: 'pago_en_revision',
      precio: 20,
      monto_pagado: 0,
      monto_pagado_bs: 0,
      monto_ultimo_pago: 20,
      monto_ultimo_pago_bs: 16000,
      saldo_pendiente: 10,
      metodo_pago: 'Pago movil',
      referencia: '123456',
      telefono_pago: '04121234567',
      cedula_titular: '12345678',
      comprobante_url: '/uploads/test/comprobante.png',
      fecha_pago: new Date('2026-03-06'),
      pagos_historial: [],
      save: jest.fn().mockResolvedValue(true)
    };

    UniformePedido.find.mockResolvedValue([pedidoDoc]);

    const response = await request(app)
      .post('/api/conciliacion/confirmar-match-total')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo_conciliacion: 'uniformes',
        pago_ids: ['u1']
      });

    expect(response.status).toBe(200);
    expect(response.body.tipo_conciliacion).toBe('uniformes');
    expect(response.body.pedidos_actualizados).toBe(1);
    expect(pedidoDoc.estado).toBe('verificado');
    expect(pedidoDoc.monto_pagado).toBe(20);
    expect(pedidoDoc.saldo_pendiente).toBe(0);
    expect(Array.isArray(pedidoDoc.pagos_historial)).toBe(true);
    expect(pedidoDoc.pagos_historial).toHaveLength(1);
    expect(pedidoDoc.pagos_historial[0].monto_pagado).toBe(20);
    expect(pedidoDoc.monto_ultimo_pago).toBe(0);
    expect(pedidoDoc.save).toHaveBeenCalled();
  });

  test('POST /api/pagos allows admin overpayment and generates saldo a favor', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const alumnoDoc = {
      _id: 'a1',
      saldo_a_favor_mensualidades: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadDoc = {
      _id: 'm1',
      monto_esperado: 100,
      id_alumno: { _id: 'a1', habilitar_pago_cuotas: false },
      saldo_a_favor_generado: 0,
      estatus: 'Pendiente',
      save: jest.fn().mockResolvedValue(true)
    };

    Mensualidad.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mensualidadDoc)
    });
    Alumno.findById.mockResolvedValue(alumnoDoc);
    PagoDetalle.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ _id: 'p1', monto_pagado: 150 }]);
    PagoDetalle.create.mockResolvedValue({ _id: 'p1' });

    const response = await request(app)
      .post('/api/pagos')
      .set('Authorization', `Bearer ${token}`)
      .field('id_mensualidad', 'm1')
      .field('monto_pagado', '150')
      .field('fecha_pago', '2026-03-06')
      .field('metodo_pago', 'Pago movil')
      .field('referencia', 'ABC123');

    expect(response.status).toBe(200);
    expect(response.body.estatus).toBe('Pagado');
    expect(alumnoDoc.saldo_a_favor_mensualidades).toBe(50);
    expect(mensualidadDoc.saldo_a_favor_generado).toBe(50);
  });

  test('PATCH /api/pagos/:id_pago updates payment', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const pagoDoc = {
      _id: 'p1',
      id_mensualidad: 'm1',
      monto_pagado: 50,
      comprobante_url: null,
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadDoc = {
      _id: 'm1',
      monto_esperado: 100,
      id_alumno: { habilitar_pago_cuotas: true },
      estatus: 'Abono',
      save: jest.fn().mockResolvedValue(true)
    };

    PagoDetalle.findById.mockResolvedValue(pagoDoc);
    Mensualidad.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mensualidadDoc)
    });
    PagoDetalle.find
      .mockResolvedValueOnce([{ _id: 'p1', monto_pagado: 50 }])
      .mockResolvedValueOnce([{ _id: 'p1', monto_pagado: 100 }]);

    const response = await request(app)
      .patch('/api/pagos/p1')
      .set('Authorization', `Bearer ${token}`)
      .field('monto_pagado', '100')
      .field('fecha_pago', '2026-03-06')
      .field('metodo_pago', 'Transferencia')
      .field('referencia', '123456');

    expect(response.status).toBe(200);
    expect(response.body.estatus).toBe('Pagado');
  });

  test('GET /api/pagos/:id_mensualidad completa monto esperado usd para pagos historicos sin inferir bs', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    PagoDetalle.find.mockResolvedValue([
      {
        _id: 'p1',
        id_mensualidad: 'm1',
        monto_pagado: 100,
        monto_pagado_bs: 7075,
        fecha_pago: '2026-03-06',
        metodo_pago: 'Pago movil',
        referencia: '123456'
      }
    ]);

    Mensualidad.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: 'm1',
        monto_esperado: 100
      })
    });

    const response = await request(app)
      .get('/api/pagos/m1')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toEqual(expect.objectContaining({
      monto_esperado_usd: 100,
      monto_pagado: 100,
      monto_pagado_bs: 7075
    }));
    expect(response.body[0].monto_esperado_bs).toBeUndefined();
  });

  test('DELETE /api/pagos/:id_pago deletes payment', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const pagoDoc = {
      _id: 'p1',
      id_mensualidad: 'm1',
      comprobante_url: null,
      deleteOne: jest.fn().mockResolvedValue(true)
    };

    const mensualidadDoc = {
      _id: 'm1',
      monto_esperado: 100,
      id_alumno: { habilitar_pago_cuotas: true },
      estatus: 'Pagado',
      save: jest.fn().mockResolvedValue(true)
    };

    PagoDetalle.findById.mockResolvedValue(pagoDoc);
    Mensualidad.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mensualidadDoc)
    });
    PagoDetalle.find.mockResolvedValue([]);

    const response = await request(app)
      .delete('/api/pagos/p1')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.estatus).toBe('Pendiente');
  });

  test('DELETE /api/alumnos/:id elimina representante y usuario huerfanos solo en borrado fisico', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    Alumno.findByIdAndDelete.mockResolvedValue({
      _id: 'a1',
      representante: 'r1',
      usuario: null
    });
    Alumno.findOne
      .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(null) })
      .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(null) });
    Representante.findByIdAndDelete.mockResolvedValue({ _id: 'r1', usuario: 'u1' });
    Representante.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    User.findByIdAndDelete.mockResolvedValue({ _id: 'u1' });

    const response = await request(app)
      .delete('/api/alumnos/a1')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Representante.findByIdAndDelete).toHaveBeenCalledWith('r1');
    expect(User.findByIdAndDelete).toHaveBeenCalledWith('u1');
  });

  test('DELETE /api/alumnos/:id elimina datos asociados en cascada', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    Alumno.findByIdAndDelete.mockResolvedValue({
      _id: 'a1',
      representante: null,
      usuario: null
    });

    Mensualidad.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ _id: 'm1' }, { _id: 'm2' }])
      })
    });

    const response = await request(app)
      .delete('/api/alumnos/a1')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(PagoDetalle.deleteMany).toHaveBeenCalledWith({ id_mensualidad: { $in: ['m1', 'm2'] } });
    expect(Mensualidad.deleteMany).toHaveBeenCalledWith({ id_alumno: 'a1' });
    expect(Reposo.deleteMany).toHaveBeenCalledWith({ id_alumno: 'a1' });

    expect(HistorialEstadoAlumno.deleteMany).toHaveBeenCalledWith({ id_alumno: 'a1' });
    expect(ConstanciaSolicitud.deleteMany).toHaveBeenCalledWith({
      $or: [
        { alumno: 'a1' },
        { alumno_ids: 'a1' }
      ]
    });
    expect(UniformePedido.deleteMany).toHaveBeenCalledWith({ alumno: 'a1' });
    expect(Partido.updateMany).toHaveBeenCalledWith(
      { 'convocados.alumno': 'a1' },
      { $pull: { convocados: { alumno: 'a1' } } }
    );
    expect(Torneo.updateMany).toHaveBeenCalledWith(
      { 'convocados.alumno': 'a1' },
      { $pull: { convocados: { alumno: 'a1' } } }
    );
  });

  test('PATCH /api/alumnos/:id/baja mantiene representante y usuario', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    Alumno.findOneAndUpdate.mockResolvedValue({
      _id: 'a1',
      activo: false,
      dado_de_baja: true,
      representante: 'r1',
      usuario: 'u1'
    });

    const response = await request(app)
      .patch('/api/alumnos/a1/baja')
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo_baja: 'Prueba', fecha_retiro: '2026-03-03' });

    expect(response.status).toBe(200);
    expect(Representante.findByIdAndDelete).not.toHaveBeenCalled();
    expect(User.findByIdAndDelete).not.toHaveBeenCalled();
  });

  test('PATCH /api/alumnos/:id/baja exige una fecha de retiro valida', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const response = await request(app)
      .patch('/api/alumnos/a1/baja')
      .set('Authorization', `Bearer ${token}`)
      .send({ decision_mes_retiro: 'cobrar' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('fecha_retiro es requerida y debe ser valida.');
    expect(Alumno.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('PATCH /api/alumnos/:id/baja rechaza fechas calendario imposibles', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const response = await request(app)
      .patch('/api/alumnos/a1/baja')
      .set('Authorization', `Bearer ${token}`)
      .send({ fecha_retiro: '2026-02-31', decision_mes_retiro: 'cobrar' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('fecha_retiro es requerida y debe ser valida.');
    expect(Alumno.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test.each([
    ['cobrar', 'Insolvente'],
    ['no_cobrar', 'Exonerado']
  ])('PATCH /api/alumnos/:id/baja con decision %s trata el mes de retiro como %s', async (decision, estatusEsperado) => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });
    const mensualidadRetiro = { _id: 'm-marzo', mes: 3, anio: 2026, estatus: 'Pendiente' };
    const mensualidadPosterior = { _id: 'm-abril', mes: 4, anio: 2026, estatus: 'Pendiente' };

    Alumno.findOneAndUpdate.mockResolvedValue({
      _id: 'a1',
      activo: false,
      dado_de_baja: true
    });
    Mensualidad.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([mensualidadRetiro, mensualidadPosterior])
      })
    });
    Mensualidad.findOneAndUpdate.mockResolvedValue({ ...mensualidadRetiro, estatus: estatusEsperado });

    const response = await request(app)
      .patch('/api/alumnos/a1/baja')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fecha_retiro: '2026-03-03',
        decision_mes_retiro: decision
      });

    expect(response.status).toBe(200);
    expect(Mensualidad.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'm-marzo' },
      { estatus: estatusEsperado }
    );
    expect(PagoDetalle.deleteMany).toHaveBeenCalledWith({ id_mensualidad: { $in: ['m-abril'] } });
    expect(Mensualidad.deleteMany).toHaveBeenCalledWith({ _id: { $in: ['m-abril'] } });
  });

  test('PATCH /api/alumnos/:id/baja no elimina mensualidades posteriores con pagos', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });
    Mensualidad.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { _id: 'm-marzo', mes: 3, anio: 2026, estatus: 'Pendiente' },
          { _id: 'm-abril', mes: 4, anio: 2026, estatus: 'Pagado' }
        ])
      })
    });
    PagoDetalle.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([{ _id: 'p1', id_mensualidad: 'm-abril' }])
      })
    });

    const response = await request(app)
      .patch('/api/alumnos/a1/baja')
      .set('Authorization', `Bearer ${token}`)
      .send({ fecha_retiro: '2026-03-03', decision_mes_retiro: 'cobrar' });

    expect(response.status).toBe(409);
    expect(Alumno.findOneAndUpdate).not.toHaveBeenCalled();
    expect(PagoDetalle.deleteMany).not.toHaveBeenCalled();
    expect(Mensualidad.deleteMany).not.toHaveBeenCalled();
  });

  test('PATCH /api/alumnos/:id/anular-baja restaura el estatus previo del mes', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });
    const periodoActual = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Caracas',
      year: 'numeric',
      month: '2-digit'
    }).formatToParts(new Date());
    const anio = Number(periodoActual.find((part) => part.type === 'year').value);
    const mes = Number(periodoActual.find((part) => part.type === 'month').value);
    const alumnoBaja = {
      _id: 'a1',
      activo: false,
      dado_de_baja: true,
      fecha_baja: new Date(Date.UTC(anio, mes - 1, 3, 12, 0, 0))
    };

    Alumno.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(alumnoBaja)
    });
    Alumno.findOneAndUpdate.mockResolvedValue({ _id: 'a1', activo: true, dado_de_baja: false });
    Mensualidad.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'm-actual', mes, anio, estatus: 'Exonerado' })
    });
    Mensualidad.findOneAndUpdate.mockResolvedValue({ _id: 'm-actual', estatus: 'Pendiente' });
    HistorialEstadoAlumno.findOne.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({
            metadata: {
              estatus_mes_retiro_anterior: 'Pendiente',
              estatus_mes_retiro_resultante: 'Exonerado'
            }
          })
        })
      })
    });

    const response = await request(app)
      .patch('/api/alumnos/a1/anular-baja')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Mensualidad.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: 'm-actual', estatus: 'Exonerado' },
      { estatus: 'Pendiente' }
    );
  });

  test('POST /api/constancias generates pdf', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const alumnoDoc = {
      nombres: 'Ana',
      apellidos: 'Lopez',
      cedula: '12345678',
      sede: { nombre: 'Centro' }
    };

    const populateSede = jest.fn().mockResolvedValue(alumnoDoc);
    const populateRepresentante = jest.fn(() => ({ populate: populateSede }));
    Alumno.findById.mockReturnValue({ populate: populateRepresentante });
    Mensualidad.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([])
    });

    const response = await request(app)
      .post('/api/constancias')
      .set('Authorization', `Bearer ${token}`)
      .send({ alumnoId: 'a1', tipo: 'simple', fechaEmision: '2026-03-06' });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
  });

  test('POST /api/alumnos allows create without numero_franela', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const response = await request(app)
      .post('/api/alumnos')
      .set('Authorization', `Bearer ${token}`)
      .field('fecha_inscripcion', '2026-03-06')
      .field('fecha_inicio_cobro', '2026-03-06')
      .field('nombres', 'Carlos')
      .field('apellidos', 'Perez')
      .field('sede', 's1');

    expect(response.status).toBe(201);
    expect(Alumno).toHaveBeenCalled();
    const payloadCreado = Alumno.mock.calls[0][0] || {};
    expect(payloadCreado).not.toHaveProperty('numero_franela');
  });

  test('POST /api/alumnos recalcula categoria desde fecha de nacimiento', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const response = await request(app)
      .post('/api/alumnos')
      .set('Authorization', `Bearer ${token}`)
      .field('fecha_inscripcion', '2026-03-06')
      .field('fecha_inicio_cobro', '2026-03-06')
      .field('fecha_nacimiento', '2013-10-20')
      .field('nombres', 'Maria')
      .field('apellidos', 'Perez')
      .field('categoria', 'U9/INICIACION')
      .field('sede', 's1');

    expect(response.status).toBe(201);
    expect(Alumno).toHaveBeenCalledWith(expect.objectContaining({
      fecha_nacimiento: expect.any(Date),
      categoria: 'U13/MINI'
    }));
  });

  test('POST /api/alumnos respeta categoria seleccionada manualmente', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const response = await request(app)
      .post('/api/alumnos')
      .set('Authorization', `Bearer ${token}`)
      .field('fecha_inscripcion', '2026-03-06')
      .field('fecha_inicio_cobro', '2026-03-06')
      .field('fecha_nacimiento', '2013-10-20')
      .field('nombres', 'Maria')
      .field('apellidos', 'Perez')
      .field('categoria', 'U15/INFANTIL')
      .field('categoria_ajustada_manualmente', 'true')
      .field('sede', 's1');

    expect(response.status).toBe(201);
    expect(Alumno).toHaveBeenCalledWith(expect.objectContaining({
      fecha_nacimiento: expect.any(Date),
      categoria: 'U15/INFANTIL'
    }));
    expect(Alumno.mock.calls[0][0]).not.toHaveProperty('categoria_ajustada_manualmente');
  });

  test('POST /api/alumnos updates datos no vacios de un representante existente', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });
    const representante = {
      _id: 'rep1',
      nombres: 'Belky',
      apellidos: 'Rodriguez',
      cedula: '7356268',
      telefono: '04120208868',
      correo: '',
      direccion: '',
      fecha_nacimiento: undefined,
      usuario: 'u1',
      save: jest.fn().mockResolvedValue(undefined)
    };
    const usuario = {
      _id: 'u1',
      nombre: 'Belky Rodriguez',
      save: jest.fn().mockResolvedValue(undefined)
    };
    Representante.findOne.mockResolvedValue(representante);
    User.findOne.mockResolvedValue(usuario);

    const response = await request(app)
      .post('/api/alumnos')
      .set('Authorization', `Bearer ${token}`)
      .field('fecha_inscripcion', '2026-03-06')
      .field('fecha_inicio_cobro', '2026-03-06')
      .field('nombres', 'Maria')
      .field('apellidos', 'Perez')
      .field('sede', 's1')
      .field('rep_cedula', '7356268')
      .field('rep_nombres', 'Belky Maria')
      .field('rep_apellidos', 'Rodriguez')
      .field('rep_telefono', '')
      .field('rep_correo', 'belky@example.com')
      .field('rep_direccion', 'Av. Principal')
      .field('rep_fecha_nacimiento', '1985-04-12');

    expect(response.status).toBe(201);
    expect(representante).toEqual(expect.objectContaining({
      nombres: 'Belky Maria',
      telefono: '04120208868',
      correo: 'belky@example.com',
      direccion: 'Av. Principal',
      fecha_nacimiento: expect.any(Date)
    }));
    expect(representante.save).toHaveBeenCalledTimes(1);
    expect(usuario.nombre).toBe('Belky Maria Rodriguez');
    expect(usuario.save).toHaveBeenCalledTimes(1);
  });

  test('PUT /api/alumnos/:id creates usuario when alumno sin representante agrega cedula', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    Alumno.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: 'a1',
        categoria: 'SUB10',
        numero_franela: null,
        nombres: 'Diego',
        apellidos: 'Rojas',
        cedula: '',
        usuario: null,
        representante: null
      })
    });
    User.findOne.mockResolvedValue(null);
    bcrypt.hash.mockResolvedValue('hashed-cedula');
    Alumno.findByIdAndUpdate.mockResolvedValue({ _id: 'a1', usuario: 'u-new', cedula: '12345678' });

    const response = await request(app)
      .put('/api/alumnos/a1')
      .set('Authorization', `Bearer ${token}`)
      .send({ cedula: '12345678' });

    expect(response.status).toBe(200);
    expect(User).toHaveBeenCalledWith(
      expect.objectContaining({
        email: '12345678',
        rol: 'usuario'
      })
    );
    expect(Alumno.findByIdAndUpdate).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({ usuario: 'u-new', cedula: '12345678' }),
      { new: true }
    );
  });

  test('PUT /api/alumnos/:id recalcula categoria cuando cambia fecha de nacimiento', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });
    Alumno.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: 'a1',
        categoria: 'U9/INICIACION',
        sexo: 'Femenino',
        numero_franela: null,
        nombres: 'Ana',
        apellidos: 'Perez',
        fecha_nacimiento: new Date('2017-01-01T12:00:00.000Z'),
        fecha_inicio_cobro: new Date('2026-03-06T12:00:00.000Z'),
        tipo_mensualidad: 'monto_sede',
        usuario: null,
        representante: null
      })
    });
    Alumno.findByIdAndUpdate.mockResolvedValue({
      _id: 'a1',
      fecha_nacimiento: new Date('2013-01-01T12:00:00.000Z'),
      categoria: 'U13/MINI'
    });

    const response = await request(app)
      .put('/api/alumnos/a1')
      .set('Authorization', `Bearer ${token}`)
      .send({ fecha_nacimiento: '2013-01-01', categoria: 'U9/INICIACION' });

    expect(response.status).toBe(200);
    expect(Alumno.findByIdAndUpdate).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({
        fecha_nacimiento: expect.any(Date),
        categoria: 'U13/MINI'
      }),
      { new: true }
    );
  });

  test('PUT /api/alumnos/:id respeta categoria seleccionada manualmente', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });
    Alumno.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: 'a1',
        categoria: 'U9/INICIACION',
        sexo: 'Femenino',
        numero_franela: null,
        nombres: 'Ana',
        apellidos: 'Perez',
        fecha_nacimiento: new Date('2017-01-01T12:00:00.000Z'),
        fecha_inicio_cobro: new Date('2026-03-06T12:00:00.000Z'),
        tipo_mensualidad: 'monto_sede',
        usuario: null,
        representante: null
      })
    });
    Alumno.findByIdAndUpdate.mockResolvedValue({
      _id: 'a1',
      fecha_nacimiento: new Date('2013-01-01T12:00:00.000Z'),
      categoria: 'U15/INFANTIL'
    });

    const response = await request(app)
      .put('/api/alumnos/a1')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fecha_nacimiento: '2013-01-01',
        categoria: 'U15/INFANTIL',
        categoria_ajustada_manualmente: true
      });

    expect(response.status).toBe(200);
    expect(Alumno.findByIdAndUpdate).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({ categoria: 'U15/INFANTIL' }),
      { new: true }
    );
    expect(Alumno.findByIdAndUpdate.mock.calls[0][1]).not.toHaveProperty('categoria_ajustada_manualmente');
  });

  test('PUT /api/alumnos/:id recalcula mensualidades exonerado y becado al cambiar monto personalizado', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    Alumno.findById.mockReturnValueOnce({
      select: jest.fn().mockResolvedValue({
        _id: 'a1',
        categoria: 'SUB10',
        numero_franela: null,
        nombres: 'Diego',
        apellidos: 'Rojas',
        cedula: '12345678',
        usuario: null,
        representante: null
      })
    });

    Alumno.findByIdAndUpdate.mockResolvedValue({
      _id: 'a1',
      tipo_mensualidad: 'monto_personalizado',
      monto_personalizado_valor: 150
    });

    const mensualidadExonerada = {
      _id: 'm-ex',
      id_alumno: { _id: 'a1', tipo_mensualidad: 'monto_personalizado' },
      estatus: 'Exonerado',
      fecha_vencimiento: new Date('2026-05-20T00:00:00.000Z'),
      credito_aplicado: 0,
      ajuste_extraordinario: 0,
      recargo_aplicado_usd: 0,
      monto_esperado: 100,
      saldo_a_favor_generado: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadBecada = {
      _id: 'm-be',
      id_alumno: { _id: 'a1', tipo_mensualidad: 'monto_personalizado' },
      estatus: 'Becado',
      fecha_vencimiento: new Date('2026-05-20T00:00:00.000Z'),
      credito_aplicado: 0,
      ajuste_extraordinario: 0,
      recargo_aplicado_usd: 0,
      monto_esperado: 100,
      saldo_a_favor_generado: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    Mensualidad.find.mockResolvedValue([mensualidadExonerada, mensualidadBecada]);
    PagoDetalle.find.mockResolvedValue([]);

    const response = await request(app)
      .put('/api/alumnos/a1')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tipo_mensualidad: 'monto_personalizado',
        monto_personalizado_valor: 150
      });

    expect(response.status).toBe(200);
    expect(Mensualidad.find).toHaveBeenCalledWith(
      expect.objectContaining({
        id_alumno: 'a1'
      })
    );
    expect(mensualidadExonerada.monto_esperado).toBe(150);
    expect(mensualidadBecada.monto_esperado).toBe(150);
  });

  test('POST /api/mensualidades/primera pagado crea pago detalle automatico', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const alumnoDoc = {
      _id: 'a1',
      saldo_a_favor_mensualidades: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadCreada = {
      _id: 'm1',
      id_alumno: 'a1',
      estatus: 'Pagado',
      monto_esperado: 100
    };

    Alumno.findById.mockResolvedValue(alumnoDoc);
    Mensualidad.findOne.mockResolvedValue(null);
    Mensualidad.create.mockResolvedValue(mensualidadCreada);
    PagoDetalle.create.mockResolvedValue({ _id: 'p1' });

    const response = await request(app)
      .post('/api/mensualidades/primera')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id_alumno: 'a1',
        monto_esperado: 100,
        estatus: 'Pagado'
      });

    expect(response.status).toBe(200);
    expect(PagoDetalle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id_mensualidad: 'm1',
        monto_pagado: 100,
        metodo_pago: 'Registro inicial admin',
        referencia: 'primera-mensualidad'
      })
    );
  });

  test('crear una cuota futura no consume el credito reservado a una deuda anterior', async () => {
    const alumno = { _id: 'a1', saldo_a_favor_mensualidades: 1.03, save: jest.fn().mockResolvedValue(true) };
    Alumno.findById.mockResolvedValue(alumno);
    Mensualidad.findOne.mockImplementation((filter) => Promise.resolve(filter.$or
      ? { _id: 'oct1', mes: 10, anio: 2026, monto_esperado: 19, estatus: 'Insolvente' } : null));
    Mensualidad.create.mockResolvedValue({ _id: 'nov1', id_alumno: 'a1', estatus: 'Pendiente', monto_esperado: 15 });
    const res = await request(app).post('/api/mensualidades/primera')
      .set('Authorization', `Bearer ${makeToken({ id: 'admin1', rol: 'admin' })}`)
      .send({ id_alumno: 'a1', mes: 11, anio: 2026, monto_esperado: 15, estatus: 'Pendiente' });
    expect(res.status).toBe(200);
    expect(Mensualidad.create).toHaveBeenCalledWith(expect.objectContaining({ credito_aplicado: 0, monto_esperado: 15 }));
    expect(alumno.saldo_a_favor_mensualidades).toBe(1.03);
    expect(alumno.save).not.toHaveBeenCalled();
  });

  test('POST /api/mensualidades/ajuste-sede generates saldo a favor', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const alumnoDoc = {
      _id: 'a1',
      saldo_a_favor_mensualidades: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadDoc = {
      _id: 'm1',
      id_alumno: 'a1',
      monto_base: 100,
      credito_aplicado: 0,
      ajuste_extraordinario: 0,
      monto_esperado: 100,
      saldo_a_favor_generado: 0,
      estatus: 'Pagado',
      save: jest.fn().mockResolvedValue(true)
    };

    Alumno.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([alumnoDoc])
    });
    Alumno.findById.mockResolvedValue(alumnoDoc);
    Mensualidad.find.mockResolvedValue([mensualidadDoc]);
    PagoDetalle.find.mockResolvedValue([{ monto_pagado: 100 }]);

    const response = await request(app)
      .post('/api/mensualidades/ajuste-sede')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id_sede: 's1',
        mes: 3,
        anio: 2026,
        nuevo_monto: 75,
        descripcion: 'Semana reconocida'
      });

    expect(response.status).toBe(200);
    expect(response.body.mensualidades_actualizadas).toBe(1);
    expect(response.body.alumnos_con_saldo_a_favor).toBe(1);
    expect(mensualidadDoc.monto_esperado).toBe(75);
    expect(mensualidadDoc.monto_sin_recargo_usd).toBe(75);
    expect(mensualidadDoc.monto_con_recargo_usd).toBe(75);
    expect(mensualidadDoc.ajuste_extraordinario).toBe(25);
    expect(mensualidadDoc.saldo_a_favor_generado).toBe(25);
    expect(alumnoDoc.saldo_a_favor_mensualidades).toBe(25);
  });

  test('POST /api/mensualidades/ajuste-sede permite incrementar el monto', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });
    const alumnoDoc = {
      _id: 'a1',
      saldo_a_favor_mensualidades: 0,
      save: jest.fn().mockResolvedValue(true)
    };
    const mensualidadDoc = {
      _id: 'm1',
      id_alumno: 'a1',
      monto_base: 100,
      credito_aplicado: 0,
      ajuste_extraordinario: 0,
      monto_esperado: 100,
      saldo_a_favor_generado: 0,
      estatus: 'Pagado',
      save: jest.fn().mockResolvedValue(true)
    };

    Alumno.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([alumnoDoc])
    });
    Mensualidad.find.mockResolvedValue([mensualidadDoc]);
    PagoDetalle.find.mockResolvedValue([{ monto_pagado: 100 }]);

    const response = await request(app)
      .post('/api/mensualidades/ajuste-sede')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id_sede: 's1',
        mes: 3,
        anio: 2026,
        nuevo_monto: 120,
        descripcion: 'Incremento extraordinario'
      });

    expect(response.status).toBe(200);
    expect(response.body.mensualidades_actualizadas).toBe(1);
    expect(response.body.resumen_ajuste.con_aumento).toBe(1);
    expect(mensualidadDoc.monto_esperado).toBe(120);
    expect(mensualidadDoc.monto_sin_recargo_usd).toBe(120);
    expect(mensualidadDoc.monto_con_recargo_usd).toBe(120);
    expect(mensualidadDoc.ajuste_extraordinario).toBe(-20);
    expect(mensualidadDoc.estatus).toBe('Abono');
  });

  test('POST /api/mensualidades/ajuste-sede requiere motivo', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const response = await request(app)
      .post('/api/mensualidades/ajuste-sede')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id_sede: 's1',
        mes: 3,
        anio: 2026,
        nuevo_monto: 120
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('El motivo del ajuste es requerido');
  });

  test('POST /api/mensualidades/ajuste-sede omite conflicto de saldo y continua', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const alumnoDoc = {
      _id: 'a1',
      saldo_a_favor_mensualidades: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadDoc = {
      _id: 'm1',
      id_alumno: 'a1',
      monto_base: 100,
      credito_aplicado: 0,
      ajuste_extraordinario: 25,
      monto_esperado: 75,
      saldo_a_favor_generado: 25,
      estatus: 'Pagado',
      save: jest.fn().mockResolvedValue(true)
    };

    Alumno.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([alumnoDoc])
    });
    Alumno.findById.mockResolvedValue(alumnoDoc);
    Mensualidad.find.mockResolvedValue([mensualidadDoc]);
    PagoDetalle.find.mockResolvedValue([{ monto_pagado: 100 }]);

    const response = await request(app)
      .post('/api/mensualidades/ajuste-sede')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id_sede: 's1',
        mes: 3,
        anio: 2026,
        nuevo_monto: 100,
        descripcion: 'Reverso ajuste'
      });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Ajuste extraordinario aplicado parcialmente');
    expect(response.body.mensualidades_actualizadas).toBe(0);
    expect(response.body.mensualidades_omitidas).toBe(1);
    expect(response.body.mensualidades_omitidas_conflicto_saldo).toBe(1);
    expect(response.body.resumen_ajuste).toEqual(
      expect.objectContaining({
        procesadas_total: 1,
        correctas: 0,
        con_aumento: 1,
        omitidas_total: 1,
        omitidas_conflicto_saldo: 1
      })
    );
    expect(Array.isArray(response.body.mensualidades_omitidas_detalle)).toBe(true);
    expect(response.body.mensualidades_omitidas_detalle).toHaveLength(1);
    expect(response.body.mensualidades_omitidas_detalle[0]).toEqual(
      expect.objectContaining({
        alumno_id: 'a1',
        motivo_code: 'SALDO_A_FAVOR_CONSUMIDO'
      })
    );
  });

  test('POST /api/mensualidades/ajuste-sede omite exonerados y reposo', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const alumnoDoc = {
      _id: 'a1',
      saldo_a_favor_mensualidades: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadExonerada = {
      _id: 'm1',
      id_alumno: 'a1',
      monto_base: 100,
      credito_aplicado: 0,
      ajuste_extraordinario: 0,
      monto_esperado: 100,
      saldo_a_favor_generado: 0,
      estatus: 'Exonerado',
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadReposo = {
      _id: 'm2',
      id_alumno: 'a1',
      monto_base: 100,
      credito_aplicado: 0,
      ajuste_extraordinario: 0,
      monto_esperado: 0,
      saldo_a_favor_generado: 0,
      estatus: 'Exento por reposo',
      save: jest.fn().mockResolvedValue(true)
    };

    Alumno.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([alumnoDoc])
    });
    Mensualidad.find.mockResolvedValue([mensualidadExonerada, mensualidadReposo]);

    const response = await request(app)
      .post('/api/mensualidades/ajuste-sede')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id_sede: 's1',
        mes: 3,
        anio: 2026,
        nuevo_monto: 75,
        descripcion: 'Semana reconocida'
      });

    expect(response.status).toBe(200);
    expect(response.body.mensualidades_actualizadas).toBe(0);
    expect(response.body.mensualidades_omitidas).toBe(2);
    expect(mensualidadExonerada.ajuste_extraordinario).toBe(0);
    expect(mensualidadReposo.ajuste_extraordinario).toBe(0);
  });

  test('POST /api/mensualidades/ajuste-sede conserva estado insolvente para data legacy retrasado', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const alumnoDoc = {
      _id: 'a1',
      saldo_a_favor_mensualidades: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadRetrasada = {
      _id: 'm1',
      id_alumno: 'a1',
      monto_base: 100,
      credito_aplicado: 0,
      ajuste_extraordinario: 0,
      monto_esperado: 100,
      saldo_a_favor_generado: 0,
      estatus: 'Retrasado',
      fecha_vencimiento: '2026-03-05T23:59:59.000Z',
      save: jest.fn().mockResolvedValue(true)
    };

    Alumno.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([alumnoDoc])
    });
    Mensualidad.find.mockResolvedValue([mensualidadRetrasada]);
    PagoDetalle.find.mockResolvedValue([]);

    const response = await request(app)
      .post('/api/mensualidades/ajuste-sede')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id_sede: 's1',
        mes: 3,
        anio: 2026,
        nuevo_monto: 80,
        descripcion: 'Ajuste de prueba'
      });

    expect(response.status).toBe(200);
    expect(response.body.mensualidades_actualizadas).toBe(1);
    expect(mensualidadRetrasada.estatus).toBe('Insolvente');
  });

  test('POST /api/mensualidades/ajuste-sede no convierte a pagado un insolvente sin pagos cuando monto esperado queda en 0', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const alumnoDoc = {
      _id: 'a1',
      saldo_a_favor_mensualidades: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadInsolvente = {
      _id: 'm1',
      id_alumno: 'a1',
      monto_base: 100,
      credito_aplicado: 0,
      ajuste_extraordinario: 0,
      monto_esperado: 100,
      saldo_a_favor_generado: 0,
      estatus: 'Insolvente',
      fecha_vencimiento: '2026-03-05T23:59:59.000Z',
      save: jest.fn().mockResolvedValue(true)
    };

    Alumno.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([alumnoDoc])
    });
    Mensualidad.find.mockResolvedValue([mensualidadInsolvente]);
    PagoDetalle.find.mockResolvedValue([]);

    const response = await request(app)
      .post('/api/mensualidades/ajuste-sede')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id_sede: 's1',
        mes: 3,
        anio: 2026,
        nuevo_monto: 0,
        descripcion: 'Ajuste de prueba a cero'
      });

    expect(response.status).toBe(200);
    expect(response.body.mensualidades_actualizadas).toBe(1);
    expect(mensualidadInsolvente.monto_esperado).toBe(0);
    expect(mensualidadInsolvente.estatus).toBe('Insolvente');
  });

  test('POST /api/mensualidades/ajuste-sede preserva pagado manual sin pagos', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const alumnoDoc = {
      _id: 'a1',
      saldo_a_favor_mensualidades: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadPagadaManual = {
      _id: 'm1',
      id_alumno: 'a1',
      monto_base: 100,
      credito_aplicado: 0,
      ajuste_extraordinario: 0,
      monto_esperado: 100,
      saldo_a_favor_generado: 0,
      estatus: 'Pagado',
      fecha_vencimiento: '2026-03-05T23:59:59.000Z',
      save: jest.fn().mockResolvedValue(true)
    };

    Alumno.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([alumnoDoc])
    });
    Mensualidad.find.mockResolvedValue([mensualidadPagadaManual]);
    PagoDetalle.find.mockResolvedValue([]);

    const response = await request(app)
      .post('/api/mensualidades/ajuste-sede')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id_sede: 's1',
        mes: 3,
        anio: 2026,
        nuevo_monto: 80,
        descripcion: 'Ajuste de prueba'
      });

    expect(response.status).toBe(200);
    expect(response.body.mensualidades_actualizadas).toBe(1);
    expect(mensualidadPagadaManual.estatus).toBe('Pagado');
  });

  test('POST /api/mensualidades/ajuste-sede/preview returns estimados', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const alumnoDoc = {
      _id: 'a1',
      saldo_a_favor_mensualidades: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadPendiente = {
      _id: 'm1',
      id_alumno: 'a1',
      monto_base: 100,
      credito_aplicado: 0,
      ajuste_extraordinario: 0,
      monto_esperado: 100,
      saldo_a_favor_generado: 0,
      estatus: 'Pendiente',
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadExonerada = {
      _id: 'm2',
      id_alumno: 'a1',
      monto_base: 100,
      credito_aplicado: 0,
      ajuste_extraordinario: 0,
      monto_esperado: 100,
      saldo_a_favor_generado: 0,
      estatus: 'Exonerado',
      save: jest.fn().mockResolvedValue(true)
    };

    Alumno.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([alumnoDoc])
    });
    Mensualidad.find.mockResolvedValue([mensualidadPendiente, mensualidadExonerada]);

    const response = await request(app)
      .post('/api/mensualidades/ajuste-sede/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id_sede: 's1',
        mes: 3,
        anio: 2026,
        nuevo_monto: 75
      });

    expect(response.status).toBe(200);
    expect(response.body.mensualidades_actualizables).toBe(1);
    expect(response.body.mensualidades_omitidas).toBe(1);
    expect(response.body.mensualidades_no_compatibles).toBe(0);
  });

  test('PATCH /api/alumnos/:id/reposos/:reposoId al acortar un reposo total libera los meses fuera del nuevo rango', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const alumnoBasico = { _id: 'a1' };
    const alumnoConfiguracion = {
      _id: 'a1',
      sede: 's1',
      tipo_mensualidad: 'monto_personalizado',
      monto_personalizado_valor: 100
    };

    const reposoDoc = {
      _id: 'r1',
      id_alumno: 'a1',
      tipo: 'Total',
      fecha_inicio: new Date('2026-03-01T12:00:00.000Z'),
      fecha_fin: new Date('2026-04-30T12:00:00.000Z'),
      estado: 'Activo',
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadMarzo = {
      _id: 'm-mar',
      id_alumno: 'a1',
      mes: 3,
      anio: 2026,
      monto_base: 100,
      credito_aplicado: 0,
      ajuste_extraordinario: 0,
      monto_esperado: 0,
      saldo_a_favor_generado: 0,
      estatus: 'Exento por reposo',
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadAbril = {
      _id: 'm-abr',
      id_alumno: 'a1',
      mes: 4,
      anio: 2026,
      monto_base: 100,
      credito_aplicado: 0,
      ajuste_extraordinario: 0,
      monto_esperado: 0,
      saldo_a_favor_generado: 0,
      estatus: 'Exento por reposo',
      fecha_vencimiento: new Date('2026-04-05T23:59:59.000Z'),
      save: jest.fn().mockResolvedValue(true)
    };

    Alumno.findById
      .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(alumnoBasico) })
      .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(alumnoConfiguracion) });

    Reposo.findOne
      .mockResolvedValueOnce(reposoDoc)
      .mockReturnValueOnce({ sort: jest.fn().mockResolvedValue(null) })
      .mockReturnValueOnce({ sort: jest.fn().mockResolvedValue({ _id: 'r1' }) })
      .mockReturnValueOnce({ sort: jest.fn().mockResolvedValue(null) })
      .mockReturnValueOnce({ sort: jest.fn().mockResolvedValue(null) });

    Mensualidad.findOne
      .mockResolvedValueOnce(mensualidadMarzo)
      .mockResolvedValueOnce(mensualidadAbril);

    Mensualidad.findOneAndUpdate.mockResolvedValue(mensualidadMarzo);
    PagoDetalle.find.mockResolvedValue([]);

    const response = await request(app)
      .patch('/api/alumnos/a1/reposos/r1')
      .set('Authorization', `Bearer ${token}`)
      .send({ fecha_fin: '2026-03-31' });

    expect(response.status).toBe(200);
    expect(reposoDoc.fecha_fin.toISOString()).toBe('2026-03-31T12:00:00.000Z');
    expect(mensualidadAbril.monto_esperado).toBe(100);
    expect(mensualidadAbril.estatus).toBe('Pendiente');
    expect(mensualidadAbril.save).toHaveBeenCalled();
  });
});
