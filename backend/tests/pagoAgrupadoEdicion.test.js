jest.mock('../config/tenantBusinessConnection', () => ({ getTenantBusinessConnection: jest.fn().mockResolvedValue({}) }));
jest.mock('../services/tenantModelService', () => ({ getTenantModel: jest.fn() }));
jest.mock('../models/PagoDetalle', () => ({}));
jest.mock('../models/Mensualidad', () => ({}));
jest.mock('../models/Alumno', () => ({}));
jest.mock('../models/PagoAgrupado', () => ({}));
jest.mock('../models/UniformePedido', () => ({}));
jest.mock('../services/operacionService', () => ({ registrarOperacion: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../middleware/auth', () => ({ hasRequestPermission: jest.fn().mockReturnValue(true) }));
jest.mock('../services/paymentExchangeRate', () => ({ obtenerTasaPagoPorFecha: jest.fn() }));
jest.mock('../controllers/mensualidadController', () => ({
  aplicarRecargoMensualidadSegunConfig: jest.fn().mockResolvedValue(undefined),
  prepararRetiroRecargoAgrupado: (...args) => jest.requireActual('../controllers/mensualidadController').prepararRetiroRecargoAgrupado(...args)
}));

const { getTenantModel } = require('../services/tenantModelService');
const controller = require('../controllers/pagoDetalleController');
const conciliacion = require('../controllers/conciliacionController');
const { ejecutarConTransaccion } = require('../services/financeTransaction');
const { obtenerTasaPagoPorFecha } = require('../services/paymentExchangeRate');

const copiar = (value) => JSON.parse(JSON.stringify(value));
const fechaOriginal = '2026-10-06T12:00:00.000Z';
let datos;
let models;
let falloGuardado;
let antesDeTransaccion;

function documentar(modelo, value) {
  if (!value) return null;
  const documento = copiar(value);
  Object.defineProperties(documento, {
    increment: { value: () => { documento.__v = (documento.__v || 0) + 1; } },
    save: { value: jest.fn(async ({ session } = {}) => {
      if (falloGuardado === documento._id) throw new Error('Fallo simulado');
      documento.updatedAt = '2026-10-07T12:00:00.000Z';
      (session?.datos || datos)[modelo][documento._id] = copiar(documento);
      return documento;
    }) }
  });
  return documento;
}

function consulta(modelo, resolver) {
  let session;
  const query = {
    sort: () => query,
    select: () => query,
    lean: () => query,
    populate: () => query,
    session: (value) => { session = value; return query; },
    then: (resolve, reject) => Promise.resolve().then(() => {
      const value = resolver((session?.datos || datos)[modelo]);
      return Array.isArray(value) ? value.map((item) => documentar(modelo, item)) : documentar(modelo, value);
    }).then(resolve, reject)
  };
  return query;
}

beforeEach(() => {
  jest.clearAllMocks();
  obtenerTasaPagoPorFecha.mockReset().mockResolvedValue({ tasa: 872.39, fecha_tasa: '2026-10-07', moneda: 'USD' });
  falloGuardado = null;
  antesDeTransaccion = null;
  const alumno = (id) => ({ _id: id, nombres: id, apellidos: 'Atleta', representante: 'r1', saldo_a_favor_mensualidades: 0 });
  datos = {
    PagoAgrupado: { g1: { _id: 'g1', codigo: 'PA-1', representante: 'r1', estado: 'En revision', cantidad_atletas: 2,
      monto_total: 28, monto_total_bs: 24427, tasa_aplicada: 872.39, fecha_pago: fechaOriginal,
      metodo_pago: 'Pago movil', referencia: '111111', updatedAt: fechaOriginal, __v: 0 } },
    PagoDetalle: {
      p1: { _id: 'p1', id_pago_agrupado: 'g1', id_mensualidad: 'm1', monto_pagado: 14, monto_pagado_bs: 12213.5 },
      p2: { _id: 'p2', id_pago_agrupado: 'g1', id_mensualidad: 'm2', monto_pagado: 14, monto_pagado_bs: 12213.5 }
    },
    Mensualidad: {
      m1: { _id: 'm1', id_alumno: alumno('a1'), monto_esperado: 14, estatus: 'En revision', saldo_a_favor_generado: 0, updatedAt: fechaOriginal },
      m2: { _id: 'm2', id_alumno: alumno('a2'), monto_esperado: 14, estatus: 'En revision', saldo_a_favor_generado: 0, updatedAt: fechaOriginal }
    },
    Alumno: { a1: alumno('a1'), a2: alumno('a2') },
    Representante: {}, TenantConfig: {}, UniformePedido: {}
  };
  models = Object.fromEntries(Object.keys(datos).map((nombre) => [nombre, {
    findById: jest.fn((id) => consulta(nombre, (store) => store[id])),
    findOne: jest.fn((filter) => consulta(nombre, (store) => Object.values(store).find((value) =>
      Object.entries(filter).every(([key, expected]) => String(value[key]) === String(expected))))),
    find: jest.fn((filter) => consulta(nombre, (store) => Object.values(store).filter((value) =>
      Object.entries(filter).every(([key, expected]) => expected?.$in
        ? expected.$in.map(String).includes(String(value[key]?._id || value[key]))
        : (expected === null ? value[key] == null : String(value[key]?._id || value[key]) === String(expected)))))),
    create: jest.fn(async (value, { session } = {}) => {
      const store = (session?.datos || datos)[nombre];
      const crear = (item) => {
        const id = item._id || `${nombre}-${Object.keys(store).length + 1}`;
        store[id] = copiar({ ...item, _id: id });
        return documentar(nombre, store[id]);
      };
      return Array.isArray(value) ? value.map(crear) : crear(value);
    }),
    deleteMany: jest.fn((filter) => consulta(nombre, (store) => {
      for (const [id, value] of Object.entries(store)) {
        if (Object.entries(filter).every(([key, expected]) => String(value[key]) === String(expected))) delete store[id];
      }
      return null;
    }))
  }]));
  models.PagoAgrupado.db = { startSession: jest.fn(async () => {
    if (antesDeTransaccion) antesDeTransaccion();
    const session = {
      datos: copiar(datos),
      withTransaction: jest.fn(async (operacion) => { await operacion(); datos = session.datos; }),
      endSession: jest.fn().mockResolvedValue(undefined)
    };
    return session;
  }), db: { admin: () => ({ command: jest.fn().mockResolvedValue({ setName: 'test' }) }) } };
  getTenantModel.mockImplementation((connection, nombre) => models[nombre]);
});

function solicitud(overrides = {}) {
  return {
    params: { id: 'g1' }, tenantId: 'test', user: { id: 'admin', rol: 'admin' },
    body: { version: `0:${fechaOriginal}`, monto_total: 28, monto_total_bs: 24427.01,
      fecha_pago: '2026-10-07', metodo_pago: 'Pago movil', referencia: '262626', telefono_pago: '04125505924',
      cedula_titular: 'V-14750046', nota: 'Corregido',
      asignaciones: [{ id_pago: 'p1', monto_pagado: 14 }, { id_pago: 'p2', monto_pagado: 14 }], ...overrides }
  };
}

function prepararOctubreConCredito() {
  datos.Representante.r1 = { _id: 'r1', usuario: 'u1' };
  datos.Alumno.a1.saldo_a_favor_mensualidades = 1.03;
  datos.Alumno.a2.saldo_a_favor_mensualidades = 1.02;
  for (const [id, alumno] of [['oct1', 'a1'], ['oct2', 'a2']]) {
    datos.Mensualidad[id] = { _id: id, id_alumno: copiar(datos.Alumno[alumno]), mes: 10, anio: 2026,
      monto_base: 15, monto_esperado: 19, monto_sin_recargo_usd: 15, recargo_aplicado_usd: 4,
      saldo_a_favor_generado: 0, estatus: 'Insolvente', updatedAt: fechaOriginal };
  }
}

async function registrarConCredito(agrupado = false, credito = 1.03) {
  const req = solicitud();
  req.user = { id: 'u1', rol: 'usuario' };
  req.body = agrupado ? { monto_total: 35.95, monto_total_bs: 31415.52, fecha_pago: '2026-10-07', metodo_pago: 'Pago movil', referencia: '262626',
    asignaciones: [{ id_mensualidad: 'oct1', credito_a_aplicar: credito }, { id_mensualidad: 'oct2', credito_a_aplicar: 1.02 }] }
    : { id_mensualidad: 'oct1', credito_a_aplicar: credito, monto_pagado: 17.97, monto_pagado_bs: 15703.39, fecha_pago: '2026-10-07', metodo_pago: 'Pago movil', referencia: '262626' };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await controller[agrupado ? 'registrarPagoAgrupado' : 'registrarPago'](req, res);
  return res;
}

test('pago de octubre consume 1.03 de credito y registra solo 17.97 de transferencia', async () => {
  prepararOctubreConCredito();
  const res = await registrarConCredito();
  expect(res.status).not.toHaveBeenCalled();
  expect(datos.Alumno.a1.saldo_a_favor_mensualidades).toBe(0);
  expect(datos.Mensualidad.oct1).toMatchObject({ credito_aplicado: 1.03, monto_esperado: 17.97, estatus: 'En revision', saldo_a_favor_generado: 0 });
  const pagos = Object.values(datos.PagoDetalle).filter((item) => item.id_mensualidad === 'oct1');
  expect(pagos).toHaveLength(1);
  expect(pagos[0].monto_pagado).toBe(17.97);
  expect(datos.Alumno.a2.saldo_a_favor_mensualidades).toBe(1.02);
});

test('pago agrupado consume el credito de cada atleta y conserva transferencia neta', async () => {
  prepararOctubreConCredito();
  expect((await registrarConCredito(true)).status).toHaveBeenCalledWith(201);
  expect(datos.Alumno.a1.saldo_a_favor_mensualidades).toBe(0);
  expect(datos.Alumno.a2.saldo_a_favor_mensualidades).toBe(0);
  expect(datos.Mensualidad.oct1.credito_aplicado).toBe(1.03);
  expect(datos.Mensualidad.oct2.credito_aplicado).toBe(1.02);
  const grupo = Object.values(datos.PagoAgrupado).find((item) => item._id !== 'g1');
  expect(grupo.monto_total).toBe(35.95);
  const pagos = Object.values(datos.PagoDetalle).filter((item) => item.id_pago_agrupado === grupo._id);
  expect(pagos.map((item) => item.monto_pagado)).toEqual([17.97, 17.98]);
});

test.each([false, true])('un fallo guardando octubre revierte credito y transferencia (agrupado=%s)', async (agrupado) => {
  prepararOctubreConCredito();
  const originales = copiar(datos);
  falloGuardado = agrupado ? 'oct2' : 'oct1';
  expect((await registrarConCredito(agrupado)).status).toHaveBeenCalledWith(500);
  expect(datos).toEqual(originales);
});

test('un credito desactualizado rechaza el pago sin consumir ni registrar dinero', async () => {
  prepararOctubreConCredito();
  const originales = copiar(datos);
  expect((await registrarConCredito(false, 2)).status).toHaveBeenCalledWith(409);
  expect(datos).toEqual(originales);
});

test('dos solicitudes con el mismo credito no lo gastan dos veces', async () => {
  prepararOctubreConCredito();
  await registrarConCredito();
  const guardados = copiar(datos);
  expect((await registrarConCredito()).status).toHaveBeenCalledWith(409);
  expect(datos).toEqual(guardados);
});

test('una cuota cubierta totalmente por credito no crea una transferencia bancaria', async () => {
  prepararOctubreConCredito();
  datos.Alumno.a1.saldo_a_favor_mensualidades = 20;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await controller.aplicarCreditoSinTransferencia({ ...solicitud(), body: { id_mensualidad: 'oct1', credito_a_aplicar: 19 } }, res);
  expect(res.status).not.toHaveBeenCalled();
  expect(datos.Alumno.a1.saldo_a_favor_mensualidades).toBe(1);
  expect(datos.Mensualidad.oct1).toMatchObject({ credito_aplicado: 19, monto_esperado: 0, estatus: 'Pagado' });
  expect(Object.keys(datos.PagoDetalle)).toHaveLength(2);
});

async function editar(req = solicitud()) {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await controller.editarPagoAgrupado(req, res);
  return res;
}

test('actualiza cabecera, todos los detalles y mensualidades, con reparto exacto de centavos e historial', async () => {
  const res = await editar();
  expect(res.status).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ mensualidades_actualizadas: 2 }));
  const grupo = datos.PagoAgrupado.g1;
  expect(grupo.ediciones).toHaveLength(1);
  expect(grupo.ediciones[0].antes.referencia).toBe('111111');
  expect(grupo.__v).toBe(1);
  const detalles = Object.values(datos.PagoDetalle);
  expect(Math.round(detalles.reduce((total, detalle) => total + detalle.monto_pagado_bs, 0) * 100)).toBe(2442701);
  for (const detalle of detalles) {
    expect(detalle).toMatchObject({ referencia: '262626', telefono_pago: '4125505924', cedula_titular: 'V-14750046', nota: 'Corregido' });
    expect(detalle.monto_original_bs).toBe(detalle.monto_pagado_bs);
    expect(detalle.monto_aplicado_bs).toBe(detalle.monto_pagado_bs);
  }
  expect(datos.Mensualidad.m1.estatus).toBe('En revision');
  expect(datos.Mensualidad.m2.estatus).toBe('En revision');
});

test('no permite cambiar arbitrariamente la proporcion original aunque cubra los saldos', async () => {
  datos.Mensualidad.m1.monto_esperado = 15;
  datos.Mensualidad.m2.monto_esperado = 13;
  const originales = copiar(datos);
  const res = await editar(solicitud({ asignaciones: [{ id_pago: 'p1', monto_pagado: 15 }, { id_pago: 'p2', monto_pagado: 13 }] }));
  expect(res.status).toHaveBeenCalledWith(409);
  expect(datos).toEqual(originales);
});

test('50000 Bs se convierten con tasa de fecha, crean excedente propio y conservan todos los centavos', async () => {
  obtenerTasaPagoPorFecha.mockResolvedValue({ tasa: 873.867, fecha_tasa: '2026-10-07', moneda: 'USD' });
  for (const mensualidad of Object.values(datos.Mensualidad)) mensualidad.monto_esperado = 19;
  const res = await editar(solicitud({ monto_total: 57.22, monto_total_bs: 50000,
    asignaciones: [{ id_pago: 'p1', monto_pagado: 28.61 }, { id_pago: 'p2', monto_pagado: 28.61 }] }));
  expect(res.status).not.toHaveBeenCalled();
  expect(datos.PagoAgrupado.g1).toMatchObject({ monto_total: 57.22, monto_total_bs: 50000, tasa_aplicada: 873.867 });
  for (const detalle of Object.values(datos.PagoDetalle)) expect(detalle).toMatchObject({ monto_pagado: 28.61, monto_pagado_bs: 25000, monto_esperado_bs: 16603.47 });
  for (const alumno of Object.values(datos.Alumno)) expect(alumno.saldo_a_favor_mensualidades).toBe(9.61);
  expect(datos.PagoAgrupado.g1.ediciones[0].despues.fecha_tasa).toBe('2026-10-07');
});

test('rechaza 50000 Bs declarados como 38 USD sin alterar registros', async () => {
  obtenerTasaPagoPorFecha.mockResolvedValue({ tasa: 873.87, fecha_tasa: '2026-10-07', moneda: 'USD' });
  const originales = copiar(datos);
  const res = await editar(solicitud({ monto_total: 38, monto_total_bs: 50000,
    asignaciones: [{ id_pago: 'p1', monto_pagado: 19 }, { id_pago: 'p2', monto_pagado: 19 }], tasa_aplicada: 1315.79 }));
  expect(res.status).toHaveBeenCalledWith(400);
  expect(datos).toEqual(originales);
});

test('conserva proporciones desiguales y centavos en moneda y Bs', async () => {
  obtenerTasaPagoPorFecha.mockResolvedValue({ tasa: 873.87, fecha_tasa: '2026-10-07', moneda: 'USD' });
  datos.PagoDetalle.p1.monto_pagado = 15;
  datos.PagoDetalle.p2.monto_pagado = 13;
  const res = await editar(solicitud({ monto_total: 57.22, monto_total_bs: 50000,
    asignaciones: [{ id_pago: 'p1', monto_pagado: 30.65 }, { id_pago: 'p2', monto_pagado: 26.57 }] }));
  expect(res.status).not.toHaveBeenCalled();
  expect(datos.PagoDetalle.p1).toMatchObject({ monto_pagado: 30.65, monto_pagado_bs: 26785.71 });
  expect(datos.PagoDetalle.p2).toMatchObject({ monto_pagado: 26.57, monto_pagado_bs: 23214.29 });
});

test('un fallo en la segunda atleta revierte la conversion y todos los excedentes', async () => {
  obtenerTasaPagoPorFecha.mockResolvedValue({ tasa: 873.87, fecha_tasa: '2026-10-07', moneda: 'USD' });
  const originales = copiar(datos);
  falloGuardado = 'm2';
  expect((await editar(solicitud({ monto_total: 57.22, monto_total_bs: 50000,
    asignaciones: [{ id_pago: 'p1', monto_pagado: 28.61 }, { id_pago: 'p2', monto_pagado: 28.61 }] }))).status).toHaveBeenCalledWith(500);
  expect(datos).toEqual(originales);
});

test('consulta la tasa segun la fecha seleccionada y la moneda del tenant', async () => {
  datos.TenantConfig.config = { _id: 'config', key: 'default', cobro: { moneda: 'EUR' } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await controller.getTasaPagoAgrupado({ ...solicitud(), query: { fecha: '2026-10-06' } }, res);
  expect(res.status).not.toHaveBeenCalled();
  expect(obtenerTasaPagoPorFecha).toHaveBeenCalledWith('2026-10-06', 'EUR');
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ fecha_pago: '2026-10-06', tasa: 872.39 }));
});

test('no modifica registros si no se puede verificar la tasa historica', async () => {
  obtenerTasaPagoPorFecha.mockRejectedValue(Object.assign(new Error('Sin tasa'), { status: 503 }));
  const originales = copiar(datos);
  expect((await editar()).status).toHaveBeenCalledWith(503);
  expect(datos).toEqual(originales);
});

test('el usuario propietario consulta el total real y edita todas las asignaciones', async () => {
  datos.Representante.r1 = { _id: 'r1', usuario: 'u1' };
  const req = { ...solicitud(), user: { id: 'u1', rol: 'usuario' } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await controller.getPagoAgrupado(req, res);
  expect(res.status).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    pago: expect.objectContaining({ monto_total: 28, monto_total_bs: 24427 }),
    asignaciones: expect.arrayContaining([expect.objectContaining({ id_pago: 'p1' }), expect.objectContaining({ id_pago: 'p2' })])
  }));
  expect((await editar(req)).status).not.toHaveBeenCalled();
  expect(datos.PagoAgrupado.g1.ediciones[0].usuario).toBe('u1');
  expect(datos.PagoDetalle.p2.referencia).toBe('262626');
});

test('el usuario no puede consultar ni editar un grupo ajeno', async () => {
  datos.Representante.r1 = { _id: 'r1', usuario: 'otro' };
  const originales = copiar(datos);
  const req = { ...solicitud(), user: { id: 'u1', rol: 'usuario' } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await controller.getPagoAgrupado(req, res);
  expect(res.status).toHaveBeenCalledWith(403);
  expect((await editar(req)).status).toHaveBeenCalledWith(403);
  expect(datos).toEqual(originales);
});

test('no acepta como propietario un token y representante sin usuario vinculado', async () => {
  datos.Representante.r1 = { _id: 'r1' };
  const originales = copiar(datos);
  const req = { ...solicitud(), user: { rol: 'usuario' } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await controller.getPagoAgrupado(req, res);
  expect(res.status).toHaveBeenCalledWith(403);
  expect((await editar(req)).status).toHaveBeenCalledWith(403);
  expect(datos).toEqual(originales);
});

test('revalida la propiedad dentro de la transaccion antes de modificar el grupo', async () => {
  datos.Representante.r1 = { _id: 'r1', usuario: 'u1' };
  antesDeTransaccion = () => { datos.Representante.r1.usuario = 'otro'; };
  const grupoOriginal = copiar(datos.PagoAgrupado);
  const detallesOriginales = copiar(datos.PagoDetalle);
  expect((await editar({ ...solicitud(), user: { id: 'u1', rol: 'usuario' } })).status).toHaveBeenCalledWith(403);
  expect(datos.PagoAgrupado).toEqual(grupoOriginal);
  expect(datos.PagoDetalle).toEqual(detallesOriginales);
});

test('el usuario no recibe el desglose si una mensualidad pertenece a otra familia', async () => {
  datos.Representante.r1 = { _id: 'r1', usuario: 'u1' };
  datos.Representante.r2 = { _id: 'r2', usuario: 'otro' };
  datos.Mensualidad.m2.id_alumno.representante = 'r2';
  const originales = copiar(datos);
  const req = { ...solicitud(), user: { id: 'u1', rol: 'usuario' } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await controller.getPagoAgrupado(req, res);
  expect(res.status).toHaveBeenCalledWith(403);
  expect((await editar(req)).status).toHaveBeenCalledWith(409);
  expect(datos).toEqual(originales);
});

test('el propietario no puede editar un grupo conciliado', async () => {
  datos.Representante.r1 = { _id: 'r1', usuario: 'u1' };
  datos.PagoAgrupado.g1.estado = 'Conciliado';
  const originales = copiar(datos);
  expect((await editar({ ...solicitud(), user: { id: 'u1', rol: 'usuario' } })).status).toHaveBeenCalledWith(409);
  expect(datos).toEqual(originales);
});

test('conserva la transferencia y el credito al editar un grupo con recargo retirado', async () => {
  datos.Mensualidad.m1.monto_esperado = 10;
  datos.Mensualidad.m1.saldo_a_favor_generado = 4;
  datos.Alumno.a1.saldo_a_favor_mensualidades = 4;
  const res = await editar();
  expect(res.status).not.toHaveBeenCalled();
  expect(datos.PagoAgrupado.g1.monto_total).toBe(28);
  expect(datos.PagoDetalle.p1.monto_pagado).toBe(14);
  expect(datos.PagoDetalle.p1.monto_esperado_usd).toBe(10);
  expect(datos.Mensualidad.m1.saldo_a_favor_generado).toBe(4);
  expect(datos.Alumno.a1.saldo_a_favor_mensualidades).toBe(4);
});

test.each([
  [{ monto_total: 29 }, 400],
  [{ monto_total: Infinity }, 400],
  [{ monto_total_bs: NaN }, 400],
  [{ monto_total_bs: 1.001 }, 400],
  [{ fecha_pago: '2026-02-30' }, 400],
  [{ referencia: 'abc123' }, 400],
  [{ version: 'vieja' }, 409],
  [{ asignaciones: [{ id_pago: 'p1', monto_pagado: 14 }, { id_pago: 'ajeno', monto_pagado: 14 }] }, 409],
  [{ asignaciones: [{ id_pago: 'p1', monto_pagado: 14 }, { id_pago: 'p1', monto_pagado: 14 }] }, 400],
  [{ asignaciones: [{ id_pago: 'p1', monto_pagado: 13 }, { id_pago: 'p2', monto_pagado: 15 }] }, 409]
])('rechaza datos inconsistentes sin cambiar registros: %j', async (body, status) => {
  const originales = copiar(datos);
  const res = await editar(solicitud(body));
  expect(res.status).toHaveBeenCalledWith(status);
  expect(datos).toEqual(originales);
});

test.each(['Conciliado', 'Rechazado', 'Anulado'])('no modifica un grupo %s', async (estado) => {
  datos.PagoAgrupado.g1.estado = estado;
  const originales = copiar(datos);
  expect((await editar()).status).toHaveBeenCalledWith(409);
  expect(datos).toEqual(originales);
});

test('no encuentra ni modifica un grupo de otro tenant', async () => {
  delete datos.PagoAgrupado.g1;
  const originales = copiar(datos);
  expect((await editar()).status).toHaveBeenCalledWith(404);
  expect(datos).toEqual(originales);
});

test('rollback si falla el segundo detalle despues de guardar la cabecera y el primero', async () => {
  const originales = copiar(datos);
  falloGuardado = 'p2';
  expect((await editar()).status).toHaveBeenCalledWith(500);
  expect(datos).toEqual(originales);
});

test('rollback si falla la ultima mensualidad despues de guardar los detalles', async () => {
  const originales = copiar(datos);
  falloGuardado = 'm2';
  expect((await editar()).status).toHaveBeenCalledWith(500);
  expect(datos).toEqual(originales);
});

test('rollback si el saldo a favor previo ya se consumio', async () => {
  datos.Mensualidad.m1.saldo_a_favor_generado = 1;
  const originales = copiar(datos);
  const res = await editar();
  expect(res.status).toHaveBeenCalledWith(500);
  expect(res.json.mock.calls[0][0].error).toMatch(/consumido/);
  expect(datos).toEqual(originales);
});

test('sin soporte de sesiones no hace ningun cambio', async () => {
  delete models.PagoAgrupado.db;
  const originales = copiar(datos);
  expect((await editar()).status).toHaveBeenCalledWith(503);
  expect(datos).toEqual(originales);
});

test('Mongo standalone no activa el fallback de una operacion obligatoria', async () => {
  const operacion = jest.fn();
  const session = { withTransaction: jest.fn().mockRejectedValue(new Error('Transaction numbers are only allowed on a replica set member or mongos')),
    endSession: jest.fn().mockResolvedValue(undefined) };
  const Model = { db: { startSession: jest.fn().mockResolvedValue(session) } };
  await expect(ejecutarConTransaccion(Model, operacion, { obligatoria: true })).rejects.toMatchObject({ status: 503 });
  expect(operacion).not.toHaveBeenCalled();
  expect(session.endSession).toHaveBeenCalledTimes(1);
});

test('un error de limpieza de sesion no enmascara un commit confirmado', async () => {
  const session = { withTransaction: jest.fn(async (operacion) => operacion()),
    endSession: jest.fn().mockRejectedValue(new Error('Fallo al cerrar sesion')) };
  const Model = { db: { startSession: jest.fn().mockResolvedValue(session) } };
  await expect(ejecutarConTransaccion(Model, async () => 'guardado', { obligatoria: true })).resolves.toBe('guardado');
  expect(session.endSession).toHaveBeenCalledTimes(1);
});

test('consulta todas las asignaciones, la version y la capacidad transaccional', async () => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await controller.getPagoAgrupado(solicitud(), res);
  expect(res.status).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    version: `0:${fechaOriginal}`, transacciones_disponibles: true,
    asignaciones: expect.arrayContaining([expect.objectContaining({ id_pago: 'p1', monto_pendiente: 14 })])
  }));
});

test('una segunda edicion con la version anterior no sobrescribe la primera', async () => {
  await editar();
  const guardados = copiar(datos);
  expect((await editar(solicitud({ referencia: '999999' }))).status).toHaveBeenCalledWith(409);
  expect(datos).toEqual(guardados);
});

async function confirmar() {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await conciliacion.confirmarMatchTotal({ ...solicitud(), body: { pago_ids: ['g1'], tipo_conciliacion: 'mensualidades' } }, res);
  return res;
}

test('confirmacion atomica del grupo y todas sus mensualidades', async () => {
  expect((await confirmar()).status).not.toHaveBeenCalled();
  expect(datos.PagoAgrupado.g1.estado).toBe('Conciliado');
  expect(datos.Mensualidad.m1.estatus).toBe('Pagado');
  expect(datos.Mensualidad.m2.estatus).toBe('Pagado');
});

test('confirmacion revierte cabecera y primera mensualidad si falla la segunda', async () => {
  const originales = copiar(datos);
  falloGuardado = 'm2';
  expect((await confirmar()).status).toHaveBeenCalledWith(500);
  expect(datos).toEqual(originales);
});

test('confirmacion detecta una edicion entre la lectura del grupo y la transaccion', async () => {
  antesDeTransaccion = () => { datos.PagoAgrupado.g1.__v = 1; };
  expect((await confirmar()).status).toHaveBeenCalledWith(409);
  expect(datos.PagoAgrupado.g1.estado).toBe('En revision');
  expect(datos.Mensualidad.m1.estatus).toBe('En revision');
});

test('rechazo revierte eliminacion de asignaciones y estado del grupo si falla una mensualidad', async () => {
  const originales = copiar(datos);
  falloGuardado = 'm2';
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await conciliacion.rechazarPagoAgrupado(solicitud(), res);
  expect(res.status).toHaveBeenCalledWith(500);
  expect(datos).toEqual(originales);
});

function prepararRecargo(id = 'm1') {
  Object.assign(datos.Mensualidad[id], { monto_base: 10, monto_sin_recargo_usd: 10,
    recargo_aplicado_usd: 4, monto_con_recargo_usd: 14, aplica_recargo: true });
}

async function retirar(overrides = {}, idMensualidad = 'm1') {
  const req = solicitud({ mensualidades: [
    { id_mensualidad: 'm1', version: `0:${fechaOriginal}` },
    { id_mensualidad: 'm2', version: `0:${fechaOriginal}` }
  ], ...overrides });
  if (idMensualidad) req.params.id_mensualidad = idMensualidad;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await controller.retirarRecargoPagoAgrupado(req, res);
  return res;
}

test.each(['En revision', 'Conciliado'])('retira recargo en grupo %s sin cambiar transferencia ni asignaciones', async (estado) => {
  prepararRecargo();
  datos.PagoAgrupado.g1.estado = estado;
  datos.Mensualidad.m1.estatus = estado === 'Conciliado' ? 'Pagado' : 'En revision';
  const res = await retirar();
  expect(res.status).not.toHaveBeenCalled();
  expect(datos.PagoAgrupado.g1).toMatchObject({ monto_total: 28, monto_total_bs: 24427, estado, __v: 1 });
  expect(datos.PagoDetalle.p1).toMatchObject({ monto_pagado: 14, monto_pagado_bs: 12213.5, monto_esperado_usd: 10 });
  expect(datos.PagoDetalle.p2.monto_pagado).toBe(14);
  expect(datos.Mensualidad.m1).toMatchObject({ monto_esperado: 10, recargo_aplicado_usd: 0,
    bloqueo_recargo_automatico: true, saldo_a_favor_generado: 4 });
  expect(datos.Alumno.a1.saldo_a_favor_mensualidades).toBe(4);
  expect(datos.Alumno.a2.saldo_a_favor_mensualidades).toBe(0);
  expect(datos.Mensualidad.m1.historial_ediciones[0].accion).toBe('retiro_manual_recargo');
  expect(datos.PagoAgrupado.g1.ediciones).toHaveLength(1);
});

test.each(['En revision', 'Conciliado'])('retira los recargos de todas las atletas del grupo %s', async (estado) => {
  prepararRecargo('m1');
  prepararRecargo('m2');
  datos.PagoAgrupado.g1.estado = estado;
  const estatus = estado === 'Conciliado' ? 'Pagado' : 'En revision';
  datos.Mensualidad.m1.estatus = estatus;
  datos.Mensualidad.m2.estatus = estatus;
  const res = await retirar();
  expect(res.status).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ mensualidades_actualizadas: 2,
    atletas_actualizadas: 2, recargo_retirado: 8, saldo_a_favor_incrementado: 8 }));
  for (const [idMensualidad, idAlumno, idPago] of [['m1', 'a1', 'p1'], ['m2', 'a2', 'p2']]) {
    expect(datos.Mensualidad[idMensualidad]).toMatchObject({ monto_esperado: 10, recargo_aplicado_usd: 0,
      bloqueo_recargo_automatico: true, saldo_a_favor_generado: 4, estatus });
    expect(datos.Mensualidad[idMensualidad].historial_ediciones).toHaveLength(1);
    expect(datos.Alumno[idAlumno].saldo_a_favor_mensualidades).toBe(4);
    expect(datos.PagoDetalle[idPago]).toMatchObject({ monto_pagado: 14, monto_pagado_bs: 12213.5, monto_esperado_usd: 10 });
  }
  expect(datos.PagoAgrupado.g1).toMatchObject({ monto_total: 28, monto_total_bs: 24427, estado });
  expect(datos.PagoAgrupado.g1.ediciones).toHaveLength(1);
  expect(datos.PagoAgrupado.g1.ediciones[0].despues.mensualidades).toHaveLength(2);
});

test.each(['a2', 'm2', 'p2', 'g1'])('fallo en %s revierte los recargos y saldos de todas las atletas', async (id) => {
  prepararRecargo('m1');
  prepararRecargo('m2');
  const originales = copiar(datos);
  falloGuardado = id;
  expect((await retirar()).status).toHaveBeenCalledWith(500);
  expect(datos).toEqual(originales);
});

test('cambio concurrente en otra atleta bloquea el retiro completo', async () => {
  prepararRecargo('m1');
  prepararRecargo('m2');
  datos.Mensualidad.m2.updatedAt = '2026-10-07T00:00:00.000Z';
  const originales = copiar(datos);
  expect((await retirar()).status).toHaveBeenCalledWith(409);
  expect(datos).toEqual(originales);
});

test('confirmacion parcial no permite retirar recargos de una sola atleta', async () => {
  prepararRecargo('m1');
  prepararRecargo('m2');
  const originales = copiar(datos);
  expect((await retirar({ mensualidades: [{ id_mensualidad: 'm1', version: `0:${fechaOriginal}` }] })).status).toHaveBeenCalledWith(409);
  expect(datos).toEqual(originales);
});

test('recargo invalido en otra atleta no permite retirar el de la primera', async () => {
  prepararRecargo('m1');
  prepararRecargo('m2');
  datos.Mensualidad.m2.recargo_aplicado_usd = 5;
  const originales = copiar(datos);
  expect((await retirar()).status).toHaveBeenCalledWith(409);
  expect(datos).toEqual(originales);
});

test('las atletas sin recargo permanecen intactas', async () => {
  prepararRecargo('m1');
  const mensualidadOriginal = copiar(datos.Mensualidad.m2);
  const detalleOriginal = copiar(datos.PagoDetalle.p2);
  const alumnoOriginal = copiar(datos.Alumno.a2);
  expect((await retirar()).status).not.toHaveBeenCalled();
  expect(datos.Mensualidad.m2).toEqual(mensualidadOriginal);
  expect(datos.PagoDetalle.p2).toEqual(detalleOriginal);
  expect(datos.Alumno.a2).toEqual(alumnoOriginal);
});

test('la operacion grupal no necesita seleccionar una mensualidad', async () => {
  prepararRecargo('m1');
  prepararRecargo('m2');
  expect((await retirar({}, null)).status).not.toHaveBeenCalled();
  expect(datos.Alumno.a1.saldo_a_favor_mensualidades).toBe(4);
  expect(datos.Alumno.a2.saldo_a_favor_mensualidades).toBe(4);
});

test('repetir el retiro de todo el grupo con versiones actuales no duplica saldos', async () => {
  prepararRecargo('m1');
  prepararRecargo('m2');
  await retirar();
  const guardados = copiar(datos);
  expect((await retirar({ version: `1:${datos.PagoAgrupado.g1.updatedAt}`, mensualidades: [
    { id_mensualidad: 'm1', version: `0:${datos.Mensualidad.m1.updatedAt}` },
    { id_mensualidad: 'm2', version: `0:${datos.Mensualidad.m2.updatedAt}` }
  ] })).status).toHaveBeenCalledWith(409);
  expect(datos).toEqual(guardados);
});

test('repetir el retiro no duplica el saldo ni el historial', async () => {
  prepararRecargo();
  await retirar();
  const guardados = copiar(datos);
  expect((await retirar()).status).toHaveBeenCalledWith(409);
  expect((await retirar({ version: `1:${datos.PagoAgrupado.g1.updatedAt}` })).status).toHaveBeenCalledWith(409);
  expect(datos).toEqual(guardados);
});

test.each(['g1', 'p1', 'm1', 'a1'])('rollback del retiro si falla guardado de %s', async (id) => {
  prepararRecargo();
  const originales = copiar(datos);
  falloGuardado = id;
  expect((await retirar()).status).toHaveBeenCalledWith(500);
  expect(datos).toEqual(originales);
});

test('retiro rechaza mensualidad ajena al grupo sin modificar nada', async () => {
  prepararRecargo();
  delete datos.PagoDetalle.p1;
  const originales = copiar(datos);
  expect((await retirar()).status).toHaveBeenCalledWith(404);
  expect(datos).toEqual(originales);
});

test('retiro sin transacciones no genera credito ni elimina recargo', async () => {
  prepararRecargo();
  delete models.PagoAgrupado.db;
  const originales = copiar(datos);
  expect((await retirar()).status).toHaveBeenCalledWith(503);
  expect(datos).toEqual(originales);
});

test('retiro con mensualidad modificada despues de abrir confirmacion no cambia registros', async () => {
  prepararRecargo();
  datos.Mensualidad.m1.updatedAt = '2026-10-07T00:00:00.000Z';
  const originales = copiar(datos);
  expect((await retirar()).status).toHaveBeenCalledWith(409);
  expect(datos).toEqual(originales);
});

test('editar despues del retiro conserva el credito sin duplicarlo', async () => {
  prepararRecargo();
  await retirar();
  const res = await editar(solicitud({ version: `1:${datos.PagoAgrupado.g1.updatedAt}` }));
  expect(res.status).not.toHaveBeenCalled();
  expect(datos.Alumno.a1.saldo_a_favor_mensualidades).toBe(4);
  expect(datos.PagoAgrupado.g1.monto_total).toBe(28);
});

test('rechazar despues del retiro elimina credito y asignaciones juntos', async () => {
  prepararRecargo();
  await retirar();
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await conciliacion.rechazarPagoAgrupado(solicitud(), res);
  expect(res.status).not.toHaveBeenCalled();
  expect(datos.PagoAgrupado.g1.estado).toBe('Rechazado');
  expect(Object.keys(datos.PagoDetalle)).toHaveLength(0);
  expect(datos.Alumno.a1.saldo_a_favor_mensualidades).toBe(0);
  expect(datos.Mensualidad.m1.saldo_a_favor_generado).toBe(0);
});

test('rechazar un credito consumido revierte todo', async () => {
  prepararRecargo();
  await retirar();
  datos.Alumno.a1.saldo_a_favor_mensualidades = 0;
  const originales = copiar(datos);
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await conciliacion.rechazarPagoAgrupado(solicitud(), res);
  expect(res.status).toHaveBeenCalledWith(409);
  expect(datos).toEqual(originales);
});