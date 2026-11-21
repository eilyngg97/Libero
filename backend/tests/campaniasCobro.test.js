const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../config/secrets', () => ({ getJwtVerificationSecrets: () => ['qa-campanias-secret'] }));
jest.mock('../config/tenantBusinessConnection', () => ({
  getTenantBusinessConnection: jest.fn(async (tenant) => ({ tenantId: tenant.tenantId }))
}));
jest.mock('../services/tenantModelService', () => ({ getTenantModel: jest.fn() }));
jest.mock('../services/operacionService', () => ({ registrarOperacion: jest.fn(async () => {}) }));
jest.mock('../services/paymentExchangeRate', () => ({ obtenerTasaPagoPorFecha: jest.fn(async () => ({ tasa: 100, fecha_tasa: '2026-11-10' })) }));

const { getTenantModel } = require('../services/tenantModelService');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const router = require('../routes/campaniasCobro');
const Campania = require('../models/CampaniaCobro');
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.tenantId = req.get('x-tenant') || 'alfa';
  req.tenant = { tenantId: req.tenantId };
  next();
});
app.use('/campanias', router);
app.use('/conciliacion', require('../routes/conciliacion'));
const token = (rol, tenantId = 'alfa', permisos = []) => jwt.sign({ rol, tenantId, permisos }, 'qa-campanias-secret');
let consulta;
const tokenPublicacion = (rol = 'admin', tenantId = 'alfa') => jwt.sign({ rol, tenantId, id: 'admin-qa' }, 'qa-campanias-secret');

describe('tolerancia en Bs de pagos de campania', () => {
  const { validarEquivalenteCampania } = require('../services/campaniaPaymentConfirmation');
  test.each([-100, -99.99, 0, 99.99, 100])('admite diferencia Bs %s conservando el saldo aplicado', (diferencia) => {
    const data = { monto_pagado: 15, monto_pagado_bs: Number((13186.84 + diferencia).toFixed(2)) };
    expect(() => validarEquivalenteCampania(data, 879.1225, 15)).not.toThrow();
    expect(data.monto_pagado_bs).toBe(Number((13186.84 + diferencia).toFixed(2)));
  });
  test.each([-100.01, 100.01])('rechaza diferencia Bs %s incluso a tasas altas', (diferencia) => {
    for (const tasa of [879.1225, 100000]) {
      const bs = Math.round(15 * tasa * 100) / 100;
      expect(() => validarEquivalenteCampania({ monto_pagado: 15,
        monto_pagado_bs: Number((bs + diferencia).toFixed(2)) }, tasa, 15)).toThrow('El equivalente no coincide');
    }
  });
  test('no permite falsear un abono ni eludir reservas usando otro importe esperado', () => {
    expect(() => validarEquivalenteCampania({ monto_pagado: 5, monto_pagado_bs: 500 }, 100, 15)).not.toThrow();
    expect(() => validarEquivalenteCampania({ monto_pagado: 5, monto_pagado_bs: 550 }, 100, 15)).toThrow();
    expect(() => validarEquivalenteCampania({ monto_pagado: 15, monto_pagado_bs: 1400 }, 100, 10)).toThrow();
  });
});

describe('cierre de campanas: saldo exigible', () => {
  const { resumenCierre } = require('../services/campaniaClosure');
  const query = (valor) => ({ select: jest.fn().mockReturnThis(), session: jest.fn().mockReturnThis(), lean: async () => valor });
  test.each([
    ['pagados', [{ alumno: 'ana', modalidad: 'general', monto: 10, saldo_pendiente: 0, estado: 'pagado', moneda: 'USD' }], false, true],
    ['pendientes', [{ alumno: 'ana', modalidad: 'general', monto: 10, saldo_pendiente: 10, estado: 'pendiente', moneda: 'USD' }], false, false],
    ['en revision', [{ alumno: 'ana', modalidad: 'general', monto: 10, saldo_pendiente: 0, estado: 'pagado', moneda: 'USD' }], true, false],
    ['solo no aplica', [{ alumno: 'ana', modalidad: 'no_aplica', monto: 0, saldo_pendiente: 0, estado: 'no_aplica', moneda: 'USD' }], false, false],
    ['pagados y no aplica', [{ alumno: 'ana', modalidad: 'general', monto: 10, saldo_pendiente: 0, estado: 'pagado', moneda: 'USD' },
      { alumno: 'luis', modalidad: 'no_aplica', monto: 0, saldo_pendiente: 0, estado: 'no_aplica', moneda: 'USD' }], false, true]
  ])('cierre automatico con %s: %s', async (nombre, cargos, revision, completa) => {
    const models = { CargoCampania: { find: () => query(cargos) }, PagoCampania: { findOne: () => query(revision ? {} : null) } };
    const campania = { _id: 'campania', moneda: 'USD', publicacion: { participantes: cargos.length,
      total_esperado: cargos.reduce((total, cargo) => total + cargo.monto, 0) } };
    expect(await resumenCierre(models, campania)).toMatchObject({ completa, en_revision: revision });
  });
});

describe('ajustes de cargos publicados: acceso y validacion', () => {
  const ruta = '/campanias/110000000000000000000001/ajustes-cargos';
  test.each(['usuario', 'entrenador', 'asistente', 'finanzas'])('deniega ajustes a %s antes de consultar', async (rol) => {
    expect((await request(app).post(ruta).set('Authorization', `Bearer ${tokenPublicacion(rol)}`).send({})).status).toBe(403);
    expect(getTenantBusinessConnection).not.toHaveBeenCalled();
  });
  test.each([{}, { accion: 'editar', alumno: 'invalido' }])('rechaza ajuste incompleto: %j', async (body) => {
    expect((await request(app).post(ruta).set('Authorization', `Bearer ${tokenPublicacion()}`).send(body)).status).toBe(400);
    expect(getTenantBusinessConnection).not.toHaveBeenCalled();
  });
});

describe('conversion de campanas: acceso y validacion', () => {
  const ruta = '/campanias/110000000000000000000001/conversion-representante';
  test.each(['usuario', 'entrenador', 'asistente', 'finanzas'])('deniega vista previa y conversion a %s', async (rol) => {
    for (const method of ['get', 'post']) {
      expect((await request(app)[method](ruta).set('Authorization', `Bearer ${tokenPublicacion(rol)}`).send({})).status).toBe(403);
    }
    expect(getTenantBusinessConnection).not.toHaveBeenCalled();
  });
  test.each([{}, { version: 0, revision: 'incorrecta', solicitud_id: '22000000-0000-4000-8000-000000000001' },
    { version: 0, revision: 'a'.repeat(64), solicitud_id: '22000000-0000-4000-8000-000000000001', monto: 1 }])
  ('rechaza solicitud invalida sin consultar ni escribir: %j', async (body) => {
    expect((await request(app).post(ruta).set('Authorization', `Bearer ${tokenPublicacion()}`).send(body)).status).toBe(400);
    expect(getTenantBusinessConnection).not.toHaveBeenCalled();
  });
  test('exige actor identificado y transacciones para confirmar', async () => {
    const body = { version: 1, revision: 'a'.repeat(64), solicitud_id: '22000000-0000-4000-8000-000000000001' };
    expect((await request(app).post(ruta).set('Authorization', `Bearer ${token('admin')}`).send(body)).status).toBe(401);
    expect(getTenantBusinessConnection).not.toHaveBeenCalled();
    getTenantModel.mockImplementation((connection, nombre) => nombre === 'CargoCampania' ? { init: jest.fn() } : {});
    expect((await request(app).post(ruta).set('Authorization', `Bearer ${tokenPublicacion()}`).send(body)).status).toBe(503);
  });
});

describe('portal representante campanas', () => {
  const id = '110000000000000000000001';
  const cargoId = '110000000000000000000002';
  const alumnoId = '110000000000000000000003';
  const ruta = `/campanias/${id}/cargos/${cargoId}/pagos`;
  const query = (valor) => ({ select: jest.fn().mockReturnThis(), session: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(), populate: jest.fn().mockReturnThis(), lean: jest.fn(async () => valor) });
  let models;
  beforeEach(() => {
    models = {
      Alumno: { findById: jest.fn(() => query({ usuario: 'admin-qa' })) }, Representante: {},
      CampaniaCobro: { findById: () => query({ _id: id, estado: 'abierta', publicacion: { fecha: new Date() } }) },
      CargoCampania: { findOne: () => query({ _id: cargoId, campania: id, alumno: alumnoId,
        monto: 10, saldo_pendiente: 10, nota_interna: 'Privada' }), find: jest.fn(() => query([])) },
      PagoCampania: { find: () => query([]) }
    };
    getTenantModel.mockImplementation((connection, nombre) => models[nombre]);
  });
  const get = (url) => request(app).get(url).set('Authorization', `Bearer ${tokenPublicacion('usuario')}`);
  test('consulta solo cargos propios y no expone notas internas', async () => {
    const response = await get(ruta);
    expect(response.status).toBe(200);
    expect(response.body.cargo.nota_interna).toBeUndefined();
    expect(response.body.totales.disponible).toBe(10);
    expect(models.Alumno.findById).toHaveBeenCalledWith(alumnoId);
  });
  test('representante asociado puede consultar y otro usuario no', async () => {
    models.Alumno.findById.mockImplementation(() => query({ representante: alumnoId }));
    models.Representante.findById = () => ({ select: async () => ({ usuario: 'admin-qa' }) });
    expect((await get(ruta)).status).toBe(200);
    models.Representante.findById = () => ({ select: async () => ({ usuario: 'otro' }) });
    expect((await get(ruta)).status).toBe(404);
  });
  test('lista vacia propia y no permite listar atletas ajenos ni ids invalidos', async () => {
    expect((await get(`/campanias/mis-cargos?alumnoId=${alumnoId}`)).body).toEqual({ cargos: [] });
    models.Alumno.findById.mockImplementation(() => query({ usuario: 'otro' }));
    expect((await get(`/campanias/mis-cargos?alumnoId=${alumnoId}`)).status).toBe(404);
    expect((await get('/campanias/mis-cargos?alumnoId=invalido')).status).toBe(400);
  });
  test('no admite confirmar o reportar como confirmado y valida las correcciones', async () => {
    const auth = `Bearer ${tokenPublicacion('usuario')}`;
    expect((await request(app).post(ruta).set('Authorization', auth).send({ estado: 'confirmado' })).status).toBe(403);
    expect((await request(app).post(`${ruta}/${cargoId}/confirmar`).set('Authorization', auth)).status).toBe(403);
    expect((await request(app).patch(`${ruta}/${cargoId}`).set('Authorization', auth).send({})).status).toBe(403);
    expect((await request(app).delete(`${ruta}/${cargoId}`).set('Authorization', auth).send({})).status).toBe(400);
  });
  test.each([
    ['usuario', 'admin-qa', 'en_revision', true], ['usuario', 'otro', 'en_revision', false],
    ['admin', 'admin-qa', 'en_revision', false], ['usuario', 'admin-qa', 'confirmado', false]
  ])('expone permiso de correccion sin revelar identidad: %s %s %s', async (rol, actor, estado, permiso) => {
    models.CargoCampania.findOne = () => query({ _id: cargoId, campania: id, alumno: alumnoId,
      monto: 10, saldo_pendiente: estado === 'confirmado' ? 0 : 10 });
    models.PagoCampania.find = () => query([{ _id: cargoId, estado, monto_pagado: 10,
      registrado_por: { id: actor, rol }, modificaciones: ['privado'], huella: 'privado' }]);
    const response = await get(ruta);
    expect(response.status).toBe(200);
    expect(response.body.pagos[0]).toMatchObject({ puede_corregir: permiso, registrado_por: { rol } });
    expect(response.body.pagos[0].registrado_por.id).toBeUndefined();
    expect(response.body.pagos[0].modificaciones).toBeUndefined();
    expect(response.body.pagos[0].huella).toBeUndefined();
  });
});

describe('pagos campania validacion previa', () => {
  const ruta = '/campanias/110000000000000000000001/cargos/110000000000000000000002/pagos';
  const body = { solicitud_id: '22000000-0000-4000-8000-000000000001', version: 0, moneda: 'USD', monto_pagado: 10,
    monto_pagado_bs: 1000, fecha_pago: '2026-11-10', metodo_pago: 'Transferencia', referencia: '123456', estado: 'en_revision' };
  test('rechaza escritura sin actor identificado', async () => {
    expect((await request(app).post(ruta).set('Authorization', `Bearer ${token('admin')}`).send(body)).status).toBe(401);
    expect(getTenantBusinessConnection).not.toHaveBeenCalled();
  });
  test.each(['post', 'patch'])('efectivo campania no permite %s desde el portal usuario ni accede a datos', async (method) => {
    const destino = method === 'post' ? ruta : `${ruta}/110000000000000000000003`;
    const { monto_pagado_bs, ...efectivo } = body;
    expect((await request(app)[method](destino).set('Authorization', `Bearer ${tokenPublicacion('usuario')}`)
      .send({ ...efectivo, metodo_pago: 'Efectivo', referencia: '' })).status).toBe(403);
    expect(getTenantBusinessConnection).not.toHaveBeenCalled();
  });
  test('sin transacciones devuelve 503 y no crea pagos', async () => {
    const crear = jest.fn();
    getTenantModel.mockImplementation((connection, nombre) => nombre === 'PagoCampania' ? { init: jest.fn(), create: crear } : {});
    expect((await request(app).post(ruta).set('Authorization', `Bearer ${tokenPublicacion()}`).send(body)).status).toBe(503);
    expect(crear).not.toHaveBeenCalled();
  });
  test.each([
    { solicitud_id: ['22000000-0000-4000-8000-000000000001'] }, { version: [0] },
    { fecha_pago: ['2026-11-10'] }, { monto_pagado: '10.001' }
  ])('rechaza tipos e importes invalidos: %j', async (cambio) => {
    expect((await request(app).post(ruta).set('Authorization', `Bearer ${tokenPublicacion()}`).send({ ...body, ...cambio })).status).toBe(400);
    expect(getTenantBusinessConnection).not.toHaveBeenCalled();
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  consulta = { select: jest.fn().mockReturnThis(), populate: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([]) };
  getTenantModel.mockImplementation((connection, nombre) => nombre === 'CampaniaCobro'
    ? { find: jest.fn(() => consulta) } : {});
});

test.each(['admin', 'super_admin'])('permite lectura a %s sin generar cargos', async (rol) => {
  const response = await request(app).get('/campanias').set('Authorization', `Bearer ${token(rol)}`);
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body).toEqual({ campanias: [] });
  expect(getTenantBusinessConnection).toHaveBeenCalledWith({ tenantId: 'alfa' });
  expect(getTenantModel.mock.calls.map((call) => call[1])).toEqual(['Sede', 'CampaniaCobro']);
  expect(consulta.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
});

test('consulta exclusivamente la conexion del tenant solicitado', async () => {
  consulta.lean.mockResolvedValue([{ nombre: 'Viaje Beta', estado: 'borrador' }]);
  const response = await request(app).get('/campanias').set('x-tenant', 'beta')
    .set('Authorization', `Bearer ${token('admin', 'beta')}`);
  expect(response.body.campanias[0].nombre).toBe('Viaje Beta');
  expect(getTenantModel).toHaveBeenCalledWith({ tenantId: 'beta' }, 'CampaniaCobro');
});

test.each(['usuario', 'entrenador', 'asistente', 'finanzas'])('deniega %s incluso con permiso de conciliacion', async (rol) => {
  const response = await request(app).get('/campanias')
    .set('Authorization', `Bearer ${token(rol, 'alfa', ['conciliacion.manage'])}`);
  expect(response.status).toBe(403);
  expect(getTenantBusinessConnection).not.toHaveBeenCalled();
});

test('rechaza sesion ausente y token de otra academia antes de consultar', async () => {
  expect((await request(app).get('/campanias')).status).toBe(401);
  expect((await request(app).get('/campanias').set('x-tenant', 'beta')
    .set('Authorization', `Bearer ${token('admin')}`)).status).toBe(403);
  expect(getTenantBusinessConnection).not.toHaveBeenCalled();
});

test('un fallo de consulta no se presenta como lista vacia ni filtra detalles internos', async () => {
  consulta.lean.mockRejectedValue(new Error('mongodb://privado'));
  const response = await request(app).get('/campanias').set('Authorization', `Bearer ${token('admin')}`);
  expect(response.status).toBe(500);
  expect(response.body.campanias).toBeUndefined();
  expect(JSON.stringify(response.body)).not.toContain('mongodb');
});

test('el modelo empieza en borrador y no tiene referencias ni escrituras financieras', () => {
  const campania = new Campania({ nombre: 'Viaje', monto_general: 30, moneda: 'USD' });
  expect(campania.validateSync()).toBeUndefined();
  expect(campania.estado).toBe('borrador');
  expect(campania.permitir_abonos).toBe(false);
  expect(Campania.schema.path('pagos')).toBeUndefined();
});

describe('publicacion de campanas', () => {
  const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const sede = { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', nombre: 'Norte' };
  const ids = ['111111111111111111111111', '222222222222222222222222', '333333333333333333333333'];
  const solicitud = '11000000-0000-4000-8000-000000000002';
  let actual;
  let atletas;
  let models;
  let session;
  const query = (valor) => ({ select: jest.fn().mockReturnThis(), populate: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(), session: jest.fn().mockReturnThis(), lean: async () => valor });
  const publicar = (body, rol = 'admin', tenant = 'alfa', identificador = id) => request(app).post(`/campanias/${identificador}/publicar`)
    .set('x-tenant', tenant).set('Authorization', `Bearer ${tokenPublicacion(rol, tenant)}`).send(body);
  const resumen = async () => (await request(app).get(`/campanias/${id}/resumen`)
    .set('Authorization', `Bearer ${tokenPublicacion()}`)).body;
  const datos = async () => ({ version: 4, solicitud_id: solicitud, revision: (await resumen()).revision });
  beforeEach(() => {
    actual = { _id: id, nombre: 'Viaje', estado: 'borrador', __v: 4, moneda: 'USD', monto_general: 0.1,
      sedes: [sede], participantes: ids, vencimiento: '2026-12-15', permitir_abonos: true,
      condiciones_participantes: [{ alumno: ids[1], modalidad: 'personalizado', monto: 0.2, nota_interna: 'Acuerdo QA' },
        { alumno: ids[2], modalidad: 'no_aplica', nota_interna: 'Exento QA' }] };
    atletas = ids.map((alumno) => ({ _id: alumno, nombres: 'Ana', apellidos: 'QA', sede, activo: true }));
    session = { withTransaction: jest.fn(async (operacion) => operacion()), endSession: jest.fn(async () => {}) };
    models = { Sede: {}, TenantConfig: { findOne: () => query({ cobro: { moneda: 'USD' } }) },
      Alumno: { find: jest.fn(() => query(atletas)) },
      CargoCampania: { init: jest.fn(async () => {}), insertMany: jest.fn(async () => []) },
      CampaniaCobro: { db: { startSession: jest.fn(async () => session) }, findOne: jest.fn(() => query(actual)),
        findOneAndUpdate: jest.fn(async (filtro, cambio) => {
          actual = { ...actual, ...cambio.$set, __v: actual.__v + 1 };
          return actual;
        }) } };
    getTenantModel.mockImplementation((connection, nombre) => models[nombre]);
  });
  test.each(['admin', 'super_admin'])('%s publica con importes congelados y auditoria sin pagos ni credito', async (rol) => {
    const response = await publicar(await datos(), rol);
    expect(response.status).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.publicacion).toMatchObject({ total_esperado: 0.3, participantes: 3, generales: 1, personalizados: 1,
      no_aplica: 1, actor: { id: 'admin-qa', rol }, version_borrador: 4 });
    expect(response.body.campania).toMatchObject({ estado: 'abierta', __v: 5 });
    expect(models.CampaniaCobro.findOneAndUpdate).toHaveBeenCalledWith({ _id: id, estado: 'borrador', __v: 4 },
      expect.objectContaining({ $inc: { __v: 1 } }), expect.objectContaining({ session, runValidators: true }));
    expect(models.CargoCampania.insertMany).toHaveBeenCalledWith([
      expect.objectContaining({ alumno: ids[0], monto: 0.1, saldo_pendiente: 0.1, sede: sede._id, moneda: 'USD', estado: 'pendiente' }),
      expect.objectContaining({ alumno: ids[1], monto: 0.2, modalidad: 'personalizado', nota_interna: 'Acuerdo QA' }),
      expect.objectContaining({ alumno: ids[2], monto: 0, saldo_pendiente: 0, estado: 'no_aplica' })
    ], { session, ordered: true });
    expect(getTenantModel.mock.calls.every(([, nombre]) => !['PagoDetalle', 'Mensualidad', 'PagoAgrupado'].includes(nombre))).toBe(true);
    expect(session.endSession).toHaveBeenCalledTimes(1);
  });
  test('repetir la misma solicitud devuelve la publicacion sin duplicar cargos', async () => {
    const body = await datos();
    expect((await publicar(body)).status).toBe(201);
    expect((await publicar(body)).body.repetida).toBe(true);
    expect(models.CargoCampania.insertMany).toHaveBeenCalledTimes(1);
    expect(models.CampaniaCobro.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect((await publicar({ ...body, solicitud_id: '11000000-0000-4000-8000-000000000003' })).status).toBe(409);
  });
  test.each(['usuario', 'entrenador', 'asistente', 'finanzas'])('deniega publicar a %s antes de consultar', async (rol) => {
    expect((await publicar({ version: 4 }, rol)).status).toBe(403);
    expect(models.CargoCampania.init).not.toHaveBeenCalled();
  });
  test.each([{}, { version: -1 }, { version: '4' }, { version: 4, revision: 'invalida', solicitud_id: solicitud },
    { version: 4, revision: 'a'.repeat(64), solicitud_id: solicitud, monto: 1 }])('rechaza cuerpo invalido: %j', async (body) => {
    expect((await publicar(body)).status).toBe(400);
    expect(models.CargoCampania.insertMany).not.toHaveBeenCalled();
  });
  test.each(['version', 'atleta', 'moneda', 'vacio', 'inactivo', 'sede', 'tarifa', 'huella'])('bloquea cambios o incidencias: %s', async (caso) => {
    const body = await datos();
    if (caso === 'version') actual.__v += 1;
    if (caso === 'atleta') atletas[0].nombres = 'Nombre cambiado';
    if (caso === 'moneda') models.TenantConfig.findOne = () => query({ cobro: { moneda: 'EUR' } });
    if (caso === 'vacio') { actual.participantes = []; actual.condiciones_participantes = []; }
    if (caso === 'inactivo') atletas[0].activo = false;
    if (caso === 'sede') atletas[0].sede = { _id: 'cccccccccccccccccccccccc', nombre: 'Otra' };
    if (caso === 'tarifa') actual.monto_general = null;
    if (caso === 'huella') body.revision = 'a'.repeat(64);
    expect((await publicar(body)).status).toBe(409);
    expect(models.CargoCampania.insertMany).not.toHaveBeenCalled();
    expect(models.CampaniaCobro.findOneAndUpdate).not.toHaveBeenCalled();
  });
  test('campana ausente no revela datos y tenant ajeno no llega a modelos', async () => {
    const body = await datos();
    actual = null;
    expect((await publicar(body)).status).toBe(404);
    expect((await request(app).post(`/campanias/${id}/publicar`).set('x-tenant', 'beta')
      .set('Authorization', `Bearer ${tokenPublicacion()}`).send(body)).status).toBe(403);
  });
  test('sin replica set no ejecuta escrituras', async () => {
    const body = await datos();
    models.CampaniaCobro.db = null;
    expect((await publicar(body)).status).toBe(503);
    expect(models.CampaniaCobro.findOneAndUpdate).not.toHaveBeenCalled();
    expect(models.CargoCampania.insertMany).not.toHaveBeenCalled();
  });
  test('fallo de insercion termina la sesion sin filtrar detalles internos', async () => {
    models.CargoCampania.insertMany.mockRejectedValue(new Error('mongodb://privado'));
    const response = await publicar(await datos());
    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('mongodb');
    expect(session.endSession).toHaveBeenCalled();
  });
});

describe('eliminar campanas', () => {
  const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  let modelo;
  const borrar = (body = { version: 3 }, rol = 'admin', tenantId = 'alfa', identificador = id) => request(app)
    .delete(`/campanias/${identificador}`).set('x-tenant', tenantId)
    .set('Authorization', `Bearer ${token(rol, tenantId)}`).send(body);
  beforeEach(() => {
    modelo = { findOneAndDelete: jest.fn().mockResolvedValue({ _id: id }),
      findOne: jest.fn(() => ({ select: jest.fn().mockReturnThis(), lean: async () => ({ _id: id }) })) };
    getTenantModel.mockReturnValue(modelo);
  });
  test.each(['admin', 'super_admin'])('%s elimina solo el borrador de su academia y version', async (rol) => {
    const response = await borrar({ version: 3 }, rol, 'beta');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ eliminada: id });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(getTenantBusinessConnection).toHaveBeenCalledWith({ tenantId: 'beta' });
    expect(getTenantModel.mock.calls.map((call) => call[1])).toEqual(['CampaniaCobro']);
    expect(modelo.findOneAndDelete).toHaveBeenCalledWith({ _id: id, estado: 'borrador', __v: 3 });
  });
  test.each(['usuario', 'entrenador', 'asistente', 'finanzas'])('deniega eliminar a %s', async (rol) => {
    expect((await borrar({ version: 3 }, rol)).status).toBe(403);
    expect(modelo.findOneAndDelete).not.toHaveBeenCalled();
  });
  test.each([{}, { version: -1 }, { version: '3' }, { version: 1.5 }, { version: 3, estado: 'borrador' }])(
    'rechaza solicitud invalida sin eliminar: %j', async (body) => {
      expect((await borrar(body)).status).toBe(400);
      expect(modelo.findOneAndDelete).not.toHaveBeenCalled();
    });
  test('rechaza identificador invalido sin consultar', async () => {
    expect((await borrar({ version: 3 }, 'admin', 'alfa', 'invalido')).status).toBe(400);
    expect(getTenantBusinessConnection).not.toHaveBeenCalled();
  });
  test('conflicto de estado o version no se presenta como eliminacion correcta', async () => {
    modelo.findOneAndDelete.mockResolvedValue(null);
    expect((await borrar()).status).toBe(409);
  });
  test('campana ausente o de otra academia devuelve 404', async () => {
    modelo.findOneAndDelete.mockResolvedValue(null);
    modelo.findOne.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: async () => null });
    expect((await borrar()).status).toBe(404);
  });
  test('un fallo no filtra informacion interna', async () => {
    modelo.findOneAndDelete.mockRejectedValue(new Error('mongodb://privado'));
    const response = await borrar();
    expect(response.status).toBe(500);
    expect(response.body.error).toContain('No se pudo eliminar');
    expect(JSON.stringify(response.body)).not.toContain('mongodb');
  });
});

describe('resumen de borrador', () => {
  const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const norte = 'bbbbbbbbbbbbbbbbbbbbbbbb';
  const sur = 'cccccccccccccccccccccccc';
  const ids = Array.from({ length: 4 }, (_, indice) => (indice + 1).toString(16).padStart(24, '0'));
  const query = (valor) => ({ select: jest.fn().mockReturnThis(), populate: jest.fn().mockReturnThis(), lean: async () => valor });
  let campania;
  let atletas;
  let models;
  const pedir = (rol = 'admin') => request(app).get(`/campanias/${id}/resumen`).set('Authorization', `Bearer ${token(rol)}`);
  beforeEach(() => {
    campania = { _id: id, nombre: 'Viaje QA', estado: 'borrador', __v: 4, moneda: 'USD', modalidad_monto: 'por_sede',
      sedes: [{ _id: norte, nombre: 'Norte' }, { _id: sur, nombre: 'Sur' }], participantes: ids,
      montos_por_sede: [{ sede: norte, monto: 0.1 }, { sede: sur, monto: 0.2 }],
      condiciones_participantes: [{ alumno: ids[2], modalidad: 'personalizado', monto: 3.45, nota_interna: 'Acuerdo privado' },
        { alumno: ids[3], modalidad: 'no_aplica', nota_interna: '' }] };
    atletas = ids.map((alumno, indice) => ({ _id: alumno, nombres: 'Ana', apellidos: `QA ${indice}`,
      sede: { _id: indice % 2 ? sur : norte, nombre: indice % 2 ? 'Sur' : 'Norte' }, activo: true,
      telefono: 'dato-privado', monto_personalizado_valor: 999 }));
    models = { CampaniaCobro: { findOne: jest.fn(() => query(campania)) }, Alumno: { find: jest.fn(() => query(atletas)) },
      Sede: {}, TenantConfig: {} };
    getTenantModel.mockImplementation((connection, nombre) => models[nombre]);
  });
  test('calcula precios por sede, acuerdos y No aplica sin generar cargos ni exponer datos ajenos', async () => {
    const response = await pedir();
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.totales).toEqual({ participantes: 4, generales: 2, personalizados: 1, no_aplica: 1,
      pendientes: 0, con_observaciones: 0, subtotal_calculado: 3.75, total_esperado: 3.75 });
    expect(response.body.filas.map((fila) => fila.monto)).toEqual([0.1, 0.2, 3.45, 0]);
    expect(response.body.filas[2].nota_interna).toBe('Acuerdo privado');
    expect(response.body.campania).toMatchObject({ __v: 4, estado: 'borrador', participantes: ids });
    expect(response.body.campania.condiciones_participantes).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('dato-privado');
    expect(JSON.stringify(response.body)).not.toContain('monto_personalizado_valor');
    expect(models.Alumno.find).toHaveBeenCalledWith({ _id: { $in: ids } });
    expect(getTenantBusinessConnection).toHaveBeenCalledWith({ tenantId: 'alfa' });
    expect(getTenantModel.mock.calls.every((call) => ['CampaniaCobro', 'Sede', 'TenantConfig', 'Alumno'].includes(call[1]))).toBe(true);
  });
  test('monto unico no sustituye acuerdos personalizados ni exoneraciones', async () => {
    campania.modalidad_monto = 'unico';
    campania.monto_general = 30;
    const response = await pedir('super_admin');
    expect(response.status).toBe(200);
    expect(response.body.totales.total_esperado).toBe(63.45);
  });
  test('tarifa faltante conserva participante y muestra total pendiente, no cero', async () => {
    campania.montos_por_sede.pop();
    const response = await pedir();
    expect(response.status).toBe(200);
    expect(response.body.totales).toMatchObject({ participantes: 4, pendientes: 1, con_observaciones: 1,
      total_esperado: null, subtotal_calculado: 3.55 });
    expect(response.body.filas[1]).toMatchObject({ alumno: ids[1], monto: null });
    expect(response.body.filas[1].incidencias).toHaveLength(1);
  });
  test('atletas inactivos, trasladados y eliminados conservan seleccion y aparecen para revision', async () => {
    atletas[0].activo = false;
    atletas[1].sede = { _id: 'eeeeeeeeeeeeeeeeeeeeeeee', nombre: 'Otra' };
    atletas.pop();
    const response = await pedir();
    expect(response.status).toBe(200);
    expect(response.body.totales).toMatchObject({ participantes: 4, con_observaciones: 3, pendientes: 1, total_esperado: null });
    expect(response.body.filas[3]).toMatchObject({ alumno: ids[3], modalidad: 'no_aplica', monto: 0, nombres: 'Atleta no disponible' });
  });
  test('borrador vacio devuelve ceros reales', async () => {
    campania.participantes = [];
    campania.condiciones_participantes = [];
    atletas = [];
    const response = await pedir();
    expect(response.status).toBe(200);
    expect(response.body.filas).toEqual([]);
    expect(response.body.totales).toMatchObject({ participantes: 0, total_esperado: 0, pendientes: 0 });
  });
  test.each(['usuario', 'entrenador', 'asistente', 'finanzas'])('deniega resumen a %s antes de consultar', async (rol) => {
    expect((await pedir(rol)).status).toBe(403);
    expect(getTenantBusinessConnection).not.toHaveBeenCalled();
  });
  test.each(['abierta', 'cerrada', 'cancelada'])('rechaza resumen de campana %s', async (estado) => {
    campania.estado = estado;
    expect((await pedir()).status).toBe(409);
    expect(models.Alumno.find).not.toHaveBeenCalled();
  });
  test('campana ausente o de otra academia no devuelve resumen', async () => {
    campania = null;
    expect((await pedir()).status).toBe(404);
    expect(models.Alumno.find).not.toHaveBeenCalled();
  });
});

describe('borradores', () => {
  const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const sede = 'bbbbbbbbbbbbbbbbbbbbbbbb';
  const solicitud = '11000000-0000-4000-8000-000000000001';
  const datos = () => ({ nombre: ' Viaje ', descripcion: ' Copa ', monto_general: '30.50', moneda: 'USD',
    sedes: [sede], vencimiento: '2028-02-29', permitir_abonos: true, solicitud_id: solicitud });
  let models;
  let vigente;
  beforeEach(() => {
    vigente = { ...datos(), _id: id, nombre: 'Viaje', descripcion: 'Copa', monto_general: 30.5, estado: 'borrador', __v: 0 };
    const query = (valor) => ({ select: jest.fn().mockReturnThis(), populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(), lean: jest.fn(async () => valor) });
    models = {
      CampaniaCobro: {
        create: jest.fn(async (data) => { vigente = { ...data, _id: id, __v: 0 }; return vigente; }),
        findOne: jest.fn(() => query(vigente)),
        findOneAndUpdate: jest.fn(async (filter, update) => { vigente = { ...vigente, ...update.$set, __v: 1 }; return vigente; })
      },
      Sede: { countDocuments: jest.fn(async () => 1), find: jest.fn(() => query([{ _id: sede, nombre: 'Norte' }])) },
      Alumno: { find: jest.fn(() => query([])) },
      TenantConfig: { findOne: jest.fn(() => query({ cobro: { moneda: 'USD' } })) }
    };
    getTenantModel.mockImplementation((connection, nombre) => models[nombre]);
  });
  const crear = (body, rol = 'admin', tenantId = 'alfa') => request(app).post('/campanias')
    .set('x-tenant', tenantId).set('Authorization', `Bearer ${token(rol, tenantId)}`).send(body);
  const editar = (body) => request(app).patch(`/campanias/${id}`).set('Authorization', `Bearer ${token('admin')}`).send(body);
  const edicion = () => { const { solicitud_id, ...resto } = datos(); return { ...resto, version: 0 }; };

  test('opciones usa la configuracion y sedes del mismo tenant', async () => {
    const response = await request(app).get('/campanias/opciones').set('Authorization', `Bearer ${token('admin')}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ moneda: 'USD', sedes: [{ _id: sede, nombre: 'Norte' }] });
    expect(models.TenantConfig.findOne).toHaveBeenCalledWith({ key: 'default' });
  });

  test.each(['admin', 'super_admin'])('%s crea exclusivamente borrador y normaliza campos', async (rol) => {
    const response = await crear(datos(), rol, 'beta');
    expect(response.status).toBe(201);
    expect(response.body.campania).toMatchObject({ nombre: 'Viaje', descripcion: 'Copa', monto_general: 30.5, estado: 'borrador' });
    expect(models.Sede.countDocuments).toHaveBeenCalledWith({ _id: { $in: [sede] } });
    expect(getTenantBusinessConnection).toHaveBeenCalledWith({ tenantId: 'beta' });
    expect(getTenantModel.mock.calls.every((call) => ['CampaniaCobro', 'Sede', 'TenantConfig', 'Alumno'].includes(call[1]))).toBe(true);
  });

  test.each([
    { nombre: ' ' }, { nombre: 'a'.repeat(151) }, { descripcion: 'a'.repeat(2001) },
    { monto_general: 0 }, { monto_general: -1 }, { monto_general: '30.555' }, { monto_general: '1e2' },
    { monto_general: true }, { sedes: [] }, { sedes: [sede, sede] }, { sedes: ['otra'] },
    { vencimiento: '2026-02-29' }, { vencimiento: '2026-04-31' }, { vencimiento: '2026-11-12T00:00:00Z' },
    { permitir_abonos: 'false' }, { estado: 'abierta' }, { pagos: [] }, { moneda: 'VES' }, { solicitud_id: 'invalida' }
  ])('rechaza datos invalidos sin escribir: %j', async (cambio) => {
    expect((await crear({ ...datos(), ...cambio })).status).toBe(400);
    expect(models.CampaniaCobro.create).not.toHaveBeenCalled();
  });

  test('rechaza sedes ajenas o eliminadas y cambio de moneda sin escribir', async () => {
    models.Sede.countDocuments.mockResolvedValueOnce(0);
    expect((await crear(datos())).status).toBe(400);
    expect((await crear({ ...datos(), moneda: 'EUR' })).status).toBe(409);
    expect(models.CampaniaCobro.create).not.toHaveBeenCalled();
  });

  test('un reintento identico no duplica el borrador', async () => {
    models.CampaniaCobro.create.mockRejectedValue(Object.assign(new Error('duplicado'), { code: 11000 }));
    const response = await crear(datos());
    expect(response.status).toBe(200);
    expect(response.body.campania._id).toBe(id);
    expect(models.CampaniaCobro.findOne).toHaveBeenCalledWith({ solicitud_id: solicitud });
    expect((await crear({ ...datos(), nombre: 'Otro viaje' })).status).toBe(409);
  });

  test('crear incorpora todos los activos actuales de las sedes, no solo una pagina', async () => {
    const atletas = Array.from({ length: 75 }, (_, indice) => ({ _id: (indice + 1).toString(16).padStart(24, '0') }));
    models.Alumno.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: async () => atletas });
    const response = await crear(datos());
    expect(response.status).toBe(201);
    expect(response.body.campania.participantes).toEqual(atletas.map((atleta) => atleta._id));
    expect(models.Alumno.find).toHaveBeenCalledWith({ sede: { $in: [sede] }, activo: { $ne: false }, dado_de_baja: { $ne: true } });
  });

  test('editar sedes nuevas incorpora atletas sin duplicar ni reponer excluidos de sedes anteriores', async () => {
    const otraSede = 'cccccccccccccccccccccccc';
    const anterior = 'dddddddddddddddddddddddd';
    const nuevo = 'eeeeeeeeeeeeeeeeeeeeeeee';
    vigente.participantes = [anterior];
    models.Sede.countDocuments.mockResolvedValue(2);
    models.Alumno.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: async () => [{ _id: anterior }, { _id: nuevo }] });
    const response = await editar({ ...edicion(), sedes: [sede, otraSede] });
    expect(response.status).toBe(200);
    expect(response.body.campania.participantes).toEqual([anterior, nuevo]);
    expect(models.Alumno.find).toHaveBeenCalledWith({ sede: { $in: [otraSede] }, activo: { $ne: false }, dado_de_baja: { $ne: true } });
    expect(models.CampaniaCobro.findOneAndUpdate).toHaveBeenCalledWith({ _id: id, estado: 'borrador', __v: 0 },
      expect.objectContaining({ $set: expect.objectContaining({ participantes: [anterior, nuevo] }), $inc: { __v: 1 } }),
      { new: true, runValidators: true });
  });

  test('editar otros datos no repone excluidos ni incorpora altas posteriores de una sede existente', async () => {
    vigente.participantes = [];
    expect((await editar({ ...edicion(), nombre: 'Nombre nuevo', monto_general: 50 })).status).toBe(200);
    expect(models.Alumno.find).not.toHaveBeenCalled();
    expect(vigente.participantes).toEqual([]);
    expect(models.CampaniaCobro.findOneAndUpdate.mock.calls[0][1].$set.participantes).toBeUndefined();
  });

  test('reintentar la creacion no vuelve a incorporar atletas retirados manualmente', async () => {
    models.Alumno.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: async () => [{ _id: 'dddddddddddddddddddddddd' }] });
    expect((await crear(datos())).status).toBe(201);
    vigente.participantes = [];
    models.CampaniaCobro.create.mockRejectedValue(Object.assign(new Error('duplicado'), { code: 11000 }));
    const reintento = await crear(datos());
    expect(reintento.status).toBe(200);
    expect(reintento.body.campania.participantes).toEqual([]);
  });

  test('no guarda parcialmente si la sede supera el limite de participantes', async () => {
    models.Alumno.find.mockReturnValue({ select: jest.fn().mockReturnThis(), lean: async () => Array.from({ length: 10001 },
      (_, indice) => ({ _id: (indice + 1).toString(16).padStart(24, '0') })) });
    expect((await crear(datos())).status).toBe(400);
    expect(models.CampaniaCobro.create).not.toHaveBeenCalled();
  });

  test('guarda dos montos generales diferentes sin inventar un monto unico', async () => {
    const otraSede = 'cccccccccccccccccccccccc';
    models.Sede.countDocuments.mockResolvedValue(2);
    const response = await crear({ ...datos(), modalidad_monto: 'por_sede', monto_general: null,
      sedes: [sede, otraSede], montos_por_sede: [{ sede, monto: '30.50' }, { sede: otraSede, monto: '25' }] });
    expect(response.status).toBe(201);
    expect(response.body.campania).toMatchObject({ modalidad_monto: 'por_sede', monto_general: null,
      montos_por_sede: [{ sede, monto: 30.5 }, { sede: otraSede, monto: 25 }] });
  });

  test.each([
    { modalidad_monto: 'otra' }, { montos_por_sede: null }, { montos_por_sede: [] },
    { monto_general: 30 }, { montos_por_sede: [{ sede, monto: 0 }] },
    { montos_por_sede: [{ sede, monto: '12.345' }] },
    { montos_por_sede: [{ sede: 'cccccccccccccccccccccccc', monto: 25 }] },
    { montos_por_sede: [{ sede, monto: 25, estado: 'pagado' }] },
    { sedes: [sede, 'cccccccccccccccccccccccc'], montos_por_sede: [{ sede, monto: 25 }, { sede, monto: 30 }] }
  ])('rechaza configuracion por sede incompleta o ambigua: %j', async (cambio) => {
    const response = await crear({ ...datos(), modalidad_monto: 'por_sede', monto_general: null,
      montos_por_sede: [{ sede, monto: 25 }], ...cambio });
    expect(response.status).toBe(400);
    expect(models.CampaniaCobro.create).not.toHaveBeenCalled();
  });

  test('monto unico no acepta importes adicionales por sede', async () => {
    expect((await crear({ ...datos(), modalidad_monto: 'unico', montos_por_sede: [{ sede, monto: 25 }] })).status).toBe(400);
    expect(models.CampaniaCobro.create).not.toHaveBeenCalled();
  });

  test('reintento por sede compara importes aunque cambie el orden', async () => {
    const otraSede = 'cccccccccccccccccccccccc';
    models.Sede.countDocuments.mockResolvedValue(2);
    const body = { ...datos(), modalidad_monto: 'por_sede', monto_general: null, sedes: [sede, otraSede],
      montos_por_sede: [{ sede, monto: 30 }, { sede: otraSede, monto: 25 }] };
    expect((await crear(body)).status).toBe(201);
    models.CampaniaCobro.create.mockRejectedValue(Object.assign(new Error('duplicado'), { code: 11000 }));
    expect((await crear({ ...body, montos_por_sede: [...body.montos_por_sede].reverse() })).status).toBe(200);
    expect((await crear({ ...body, montos_por_sede: [{ sede, monto: 99 }, { sede: otraSede, monto: 25 }] })).status).toBe(409);
  });

  test('edita con control atomico de estado y version', async () => {
    const response = await editar({ ...edicion(), nombre: 'Viaje nuevo', vencimiento: '' });
    expect(response.status).toBe(200);
    expect(response.body.campania).toMatchObject({ nombre: 'Viaje nuevo', __v: 1, vencimiento: '' });
    expect(models.CampaniaCobro.findOneAndUpdate).toHaveBeenCalledWith({ _id: id, estado: 'borrador', __v: 0 },
      expect.objectContaining({ $inc: { __v: 1 } }), { new: true, runValidators: true });
  });

  test.each(['abierta', 'cerrada', 'cancelada'])('no permite editar una campana %s por esta ruta', async (estado) => {
    vigente.estado = estado;
    expect((await editar(edicion())).status).toBe(409);
    expect(models.CampaniaCobro.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test('una version obsoleta no sobrescribe cambios', async () => {
    models.CampaniaCobro.findOneAndUpdate.mockResolvedValue(null);
    expect((await editar(edicion())).status).toBe(409);
  });

  test('un borrador inexistente no se crea al editar', async () => {
    models.CampaniaCobro.findOne.mockReturnValue({ lean: async () => null });
    expect((await editar(edicion())).status).toBe(404);
    expect(models.CampaniaCobro.findOneAndUpdate).not.toHaveBeenCalled();
  });

  test.each(['usuario', 'asistente', 'entrenador'])('deniega escrituras del rol %s antes de consultar', async (rol) => {
    expect((await crear(datos(), rol)).status).toBe(403);
    expect(getTenantBusinessConnection).not.toHaveBeenCalled();
  });
});

describe('seleccion manual de participantes', () => {
  const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const sede = 'bbbbbbbbbbbbbbbbbbbbbbbb';
  const atleta = 'dddddddddddddddddddddddd';
  let campania;
  let models;
  const query = (valor) => ({ select: jest.fn().mockReturnThis(), populate: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(), lean: jest.fn(async () => valor) });
  const pedir = (method = 'get', body, rol = 'admin') => request(app)[method](`/campanias/${id}/participantes`)
    .set('Authorization', `Bearer ${token(rol)}`).send(body);
  beforeEach(() => {
    campania = { _id: id, nombre: 'Viaje', estado: 'borrador', sedes: [{ _id: sede, nombre: 'Norte' }], participantes: [], __v: 0 };
    models = {
      CampaniaCobro: {
        findOne: jest.fn(() => query(campania)),
        findOneAndUpdate: jest.fn(async (filter, update) => { campania = { ...campania, ...update.$set, __v: 1 }; return campania; })
      },
      Alumno: { find: jest.fn(() => query([{ _id: atleta, nombres: 'Ana', apellidos: 'QA', categoria: 'Sub 12',
        sede: { _id: sede, nombre: 'Norte' }, representante: { nombres: 'Maria', apellidos: 'QA' }, activo: true }])),
      countDocuments: jest.fn(async () => 1) }, Sede: {}, TenantConfig: {}, Representante: {}
    };
    getTenantModel.mockImplementation((connection, nombre) => models[nombre]);
  });
  test('el catalogo proyecta solo datos de seleccion de la misma academia', async () => {
    const response = await pedir();
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.atletas[0]).toMatchObject({ _id: atleta, disponible: true, nombres: 'Ana' });
    expect(response.body.atletas[0].activo).toBeUndefined();
    expect(getTenantBusinessConnection).toHaveBeenCalledWith({ tenantId: 'alfa' });
    expect(models.Alumno.find).toHaveBeenCalledWith({ $or: [
      { sede: { $in: [sede] }, activo: { $ne: false }, dado_de_baja: { $ne: true } }, { _id: { $in: [] } }
    ] });
  });
  test.each(['usuario', 'entrenador', 'asistente', 'finanzas'])('deniega catalogo y escritura a %s', async (rol) => {
    expect((await pedir('get', undefined, rol)).status).toBe(403);
    expect((await pedir('put', { participantes: [atleta], version: 0 }, rol)).status).toBe(403);
    expect(getTenantBusinessConnection).not.toHaveBeenCalled();
  });
  test.each(['abierta', 'cerrada', 'cancelada'])('no selecciona ni guarda en campana %s', async (estado) => {
    campania.estado = estado;
    expect((await pedir()).status).toBe(409);
    expect((await pedir('put', { participantes: [], version: 0 })).status).toBe(409);
    expect(models.CampaniaCobro.findOneAndUpdate).not.toHaveBeenCalled();
  });
  test('guardar solo cambia participantes, actor y version, sin modelos financieros', async () => {
    const response = await pedir('put', { participantes: [atleta], version: 0 });
    expect(response.status).toBe(200);
    expect(response.body.campania.participantes).toEqual([atleta]);
    expect(models.CampaniaCobro.findOneAndUpdate).toHaveBeenCalledWith({ _id: id, estado: 'borrador', __v: 0 },
      { $set: { participantes: [atleta], condiciones_participantes: [], actualizado_por: { rol: 'admin' } }, $inc: { __v: 1 } }, { new: true, runValidators: true });
    expect(getTenantModel.mock.calls.every((call) => ['CampaniaCobro', 'Sede', 'TenantConfig', 'Alumno'].includes(call[1]))).toBe(true);
  });
  test.each([
    { participantes: [atleta, atleta], version: 0 }, { participantes: ['otro'], version: 0 },
    { participantes: 'todos', version: 0 }, { participantes: [], version: -1 }, { participantes: [] },
    { participantes: [], version: 0, tenantId: 'beta' }, { participantes: [], version: 0, monto: 20 }
  ])('rechaza entrada invalida %j sin escribir', async (body) => {
    expect((await pedir('put', body)).status).toBe(400);
    expect(models.CampaniaCobro.findOneAndUpdate).not.toHaveBeenCalled();
  });
  test('rechaza atletas nuevos ajenos, inactivos o fuera de sedes', async () => {
    models.Alumno.countDocuments.mockResolvedValue(0);
    expect((await pedir('put', { participantes: [atleta], version: 0 })).status).toBe(400);
    expect(models.CampaniaCobro.findOneAndUpdate).not.toHaveBeenCalled();
  });
  test('conserva seleccion anterior aunque el atleta ya no este disponible y permite retirarlo', async () => {
    campania.participantes = [atleta];
    models.Alumno.find.mockReturnValue(query([]));
    const response = await pedir();
    expect(response.body.atletas[0]).toMatchObject({ _id: atleta, disponible: false, nombres: 'Atleta no disponible' });
    expect((await pedir('put', { participantes: [atleta], version: 0 })).status).toBe(200);
    expect(models.Alumno.countDocuments).not.toHaveBeenCalled();
    campania.__v = 0;
    expect((await pedir('put', { participantes: [], version: 0 })).status).toBe(200);
    expect(campania.participantes).toEqual([]);
  });
  test('version desactualizada o conflicto atomico no sobrescribe la seleccion', async () => {
    expect((await pedir('put', { participantes: [], version: 3 })).status).toBe(409);
    expect(models.CampaniaCobro.findOneAndUpdate).not.toHaveBeenCalled();
    models.CampaniaCobro.findOneAndUpdate.mockResolvedValue(null);
    expect((await pedir('put', { participantes: [], version: 0 })).status).toBe(409);
  });
  test.each(['general', 'personalizado', 'no_aplica'])('guarda condicion %s con nota privada y normaliza importes', async (modalidad) => {
    const condicion = { alumno: atleta, modalidad, nota_interna: ' Acuerdo interno ',
      ...(modalidad === 'personalizado' ? { monto: '12.50' } : {}) };
    const response = await pedir('put', { participantes: [atleta], condiciones_participantes: [condicion], version: 0 });
    expect(response.status).toBe(200);
    expect(response.body.campania.participantes).toEqual([atleta]);
    expect(response.body.campania.condiciones_participantes).toEqual([{ ...condicion, nota_interna: 'Acuerdo interno',
      ...(modalidad === 'personalizado' ? { monto: 12.5 } : {}) }]);
    expect(response.body.campania.__v).toBe(1);
  });
  test.each([
    { modalidad: 'otra' }, { modalidad: 'personalizado' }, { modalidad: 'personalizado', monto: 0 },
    { modalidad: 'personalizado', monto: -1 }, { modalidad: 'personalizado', monto: '1.234' },
    { modalidad: 'personalizado', monto: '1e2' }, { modalidad: 'personalizado', monto: true },
    { modalidad: 'personalizado', monto: 1000000000 }, { modalidad: 'general', monto: 5 },
    { modalidad: 'no_aplica', monto: 0 }, { nota_interna: 'x'.repeat(1001) }, { nota_interna: 5 },
    { alumno: 'eeeeeeeeeeeeeeeeeeeeeeee' }, { pagos: [] }
  ])('rechaza condiciones invalidas sin escribir: %j', async (cambio) => {
    const response = await pedir('put', { participantes: [atleta], version: 0,
      condiciones_participantes: [{ alumno: atleta, modalidad: 'general', nota_interna: '', ...cambio }] });
    expect(response.status).toBe(400);
    expect(models.CampaniaCobro.findOneAndUpdate).not.toHaveBeenCalled();
  });
  test('rechaza condiciones duplicadas y condiciones no expresadas como lista', async () => {
    const condicion = { alumno: atleta, modalidad: 'no_aplica', nota_interna: '' };
    expect((await pedir('put', { participantes: [atleta], version: 0, condiciones_participantes: [condicion, condicion] })).status).toBe(400);
    expect((await pedir('put', { participantes: [atleta], version: 0, condiciones_participantes: {} })).status).toBe(400);
    expect(models.CampaniaCobro.findOneAndUpdate).not.toHaveBeenCalled();
  });
  test('las condiciones por defecto sin nota no se guardan como excepciones', async () => {
    expect((await pedir('put', { participantes: [atleta], version: 0,
      condiciones_participantes: [{ alumno: atleta, modalidad: 'general', nota_interna: '  ' }] })).status).toBe(200);
    expect(campania.condiciones_participantes).toEqual([]);
  });
  test('solicitud anterior conserva condiciones de seleccionados y elimina solo las de retirados', async () => {
    const otro = 'eeeeeeeeeeeeeeeeeeeeeeee';
    campania.participantes = [atleta, otro];
    campania.condiciones_participantes = [{ alumno: atleta, modalidad: 'personalizado', monto: 8, nota_interna: 'Privada' },
      { alumno: otro, modalidad: 'no_aplica', nota_interna: 'Otra' }];
    expect((await pedir('put', { participantes: [atleta], version: 0 })).status).toBe(200);
    expect(campania.condiciones_participantes).toEqual([{ alumno: atleta, modalidad: 'personalizado', monto: 8, nota_interna: 'Privada' }]);
  });
  test('campana ajena o eliminada no se crea ni se filtra', async () => {
    models.CampaniaCobro.findOne.mockReturnValue(query(null));
    expect((await pedir()).status).toBe(404);
    expect((await pedir('put', { participantes: [], version: 0 })).status).toBe(404);
  });
});

const suiteMongo = process.env.RUN_MONGO_CAMPANIA_TESTS === '1' ? describe : describe.skip;

suiteMongo('borradores en Mongo temporal aislado', () => {
  const mongoose = require('mongoose');
  const modeloReal = jest.requireActual('../services/tenantModelService').getTenantModel;
  const conexiones = {};
  const modelosMongo = {};
  const sedesMongo = {};
  jest.setTimeout(30000);

  beforeAll(async () => {
    for (const tenant of ['alfa', 'beta']) {
      const dbName = `libero_qa_campanias_${Date.now()}_${process.pid}_${tenant}`;
      conexiones[tenant] = mongoose.createConnection(`mongodb://127.0.0.1:27017/${dbName}`, { serverSelectionTimeoutMS: 5000 });
      await conexiones[tenant].asPromise();
      modelosMongo[tenant] = Object.fromEntries(['CampaniaCobro', 'Sede', 'TenantConfig']
        .map((nombre) => [nombre, modeloReal(conexiones[tenant], nombre)]));
      await Promise.all(Object.values(modelosMongo[tenant]).map((model) => model.init()));
      sedesMongo[tenant] = await modelosMongo[tenant].Sede.create({ nombre: `Sede ${tenant}`, direccion: 'QA temporal', costo: 20 });
      await modelosMongo[tenant].TenantConfig.create({ key: 'default', cobro: { moneda: tenant === 'alfa' ? 'USD' : 'EUR' } });
    }
  });

  beforeEach(async () => {
    getTenantBusinessConnection.mockImplementation(async (tenant) => conexiones[tenant.tenantId]);
    getTenantModel.mockImplementation(modeloReal);
    await Promise.all(Object.values(modelosMongo).map((models) => models.CampaniaCobro.deleteMany({})));
  });

  afterAll(async () => {
    for (const connection of Object.values(conexiones)) {
      try {
        if (connection.readyState === 1 && connection.name.startsWith('libero_qa_campanias_')) await connection.dropDatabase();
      } finally { await connection.close(); }
    }
  });

  const datosMongo = () => ({ nombre: 'Viaje QA', descripcion: 'Solo base temporal', monto_general: '25.50', moneda: 'USD',
    sedes: [String(sedesMongo.alfa._id)], vencimiento: '2028-02-29', permitir_abonos: true,
    solicitud_id: '11000000-0000-4000-8000-000000000001' });
  const peticion = (method, path, body, tenant = 'alfa') => request(app)[method](path)
    .set('x-tenant', tenant).set('Authorization', `Bearer ${token('admin', tenant)}`).send(body);

  test('persiste y recarga el borrador sin crear colecciones financieras', async () => {
    const creada = await peticion('post', '/campanias', datosMongo());
    expect(creada.status).toBe(201);
    expect(creada.body.campania).toMatchObject({ monto_general: 25.5, estado: 'borrador', __v: 0, vencimiento: '2028-02-29' });
    expect(creada.body.campania.sedes[0].nombre).toBe('Sede alfa');
    const listado = await peticion('get', '/campanias');
    expect(listado.body.campanias).toHaveLength(1);
    expect(listado.body.campanias[0]._id).toBe(creada.body.campania._id);
    const colecciones = await conexiones.alfa.db.listCollections().toArray();
    expect(colecciones.map((item) => item.name)).toEqual(expect.arrayContaining(['campaniacobros', 'sedes', 'tenantconfigs']));
    expect(colecciones.every((item) => ['alumnos', 'campaniacobros', 'sedes', 'tenantconfigs'].includes(item.name))).toBe(true);
  });

  test('dos creaciones concurrentes generan exactamente un borrador', async () => {
    const respuestas = await Promise.all([peticion('post', '/campanias', datosMongo()), peticion('post', '/campanias', datosMongo())]);
    expect(respuestas.map((item) => item.status).sort()).toEqual([200, 201]);
    expect(respuestas[0].body.campania._id).toBe(respuestas[1].body.campania._id);
    expect(await modelosMongo.alfa.CampaniaCobro.countDocuments()).toBe(1);
  });

  test('edicion atomica conserva una sola version y aisla academia y sedes', async () => {
    const creada = await peticion('post', '/campanias', datosMongo());
    const id = creada.body.campania._id;
    const { solicitud_id, ...body } = datosMongo();
    const cambios = { ...body, version: 0, nombre: 'Viaje actualizado' };
    const respuestas = await Promise.all([peticion('patch', `/campanias/${id}`, cambios), peticion('patch', `/campanias/${id}`, cambios)]);
    expect(respuestas.map((item) => item.status).sort()).toEqual([200, 409]);
    const vigente = await modelosMongo.alfa.CampaniaCobro.findById(id).lean();
    expect(vigente).toMatchObject({ nombre: 'Viaje actualizado', __v: 1, estado: 'borrador' });
    expect((await peticion('patch', `/campanias/${id}`, { ...cambios, moneda: 'EUR' }, 'beta')).status).toBe(404);
    expect((await peticion('post', '/campanias', { ...datosMongo(), moneda: 'EUR' }, 'beta')).status).toBe(400);
    expect(await modelosMongo.beta.CampaniaCobro.countDocuments()).toBe(0);
  });

  test('persiste montos por sede, los recarga y permite convertir el borrador a monto unico', async () => {
    const otra = await modelosMongo.alfa.Sede.create({ nombre: 'Segunda sede QA', direccion: 'QA', costo: 20 });
    const body = { ...datosMongo(), modalidad_monto: 'por_sede', monto_general: null,
      sedes: [String(sedesMongo.alfa._id), String(otra._id)], montos_por_sede: [
        { sede: String(sedesMongo.alfa._id), monto: '30.50' }, { sede: String(otra._id), monto: '25' }
      ] };
    const creada = await peticion('post', '/campanias', body);
    expect(creada.status).toBe(201);
    const listado = await peticion('get', '/campanias');
    expect(listado.body.campanias[0]).toMatchObject({ modalidad_monto: 'por_sede', monto_general: null,
      montos_por_sede: [{ monto: 30.5 }, { monto: 25 }] });
    expect((await peticion('post', '/campanias', { ...body, montos_por_sede: [...body.montos_por_sede].reverse() })).status).toBe(200);
    const { solicitud_id, ...cambios } = body;
    const editada = await peticion('patch', `/campanias/${creada.body.campania._id}`, {
      ...cambios, version: 0, modalidad_monto: 'unico', monto_general: 40, montos_por_sede: []
    });
    expect(editada.status).toBe(200);
    expect(editada.body.campania).toMatchObject({ modalidad_monto: 'unico', monto_general: 40, montos_por_sede: [], __v: 1 });
  });

  test('edita un borrador antiguo sin modalidad y lo convierte a montos por sede', async () => {
    const creada = await peticion('post', '/campanias', datosMongo());
    const id = creada.body.campania._id;
    await modelosMongo.alfa.CampaniaCobro.collection.updateOne({ _id: new mongoose.Types.ObjectId(id) },
      { $unset: { modalidad_monto: '', montos_por_sede: '' } });
    const { solicitud_id, ...body } = datosMongo();
    const editada = await peticion('patch', `/campanias/${id}`, { ...body, version: 0, modalidad_monto: 'por_sede',
      monto_general: null, montos_por_sede: [{ sede: body.sedes[0], monto: 18.5 }] });
    expect(editada.status).toBe(200);
    expect(editada.body.campania).toMatchObject({ modalidad_monto: 'por_sede', monto_general: null,
      montos_por_sede: [{ monto: 18.5 }], __v: 1 });
  });

  const crearAtletaMongo = (tenant, extra = {}) => modeloReal(conexiones[tenant], 'Alumno').create({
    nombres: 'Ana', apellidos: 'QA', sede: sedesMongo[tenant]._id, fecha_inicio_cobro: new Date('2026-01-01'), ...extra
  });

  test('guarda y recarga participantes sin exponer datos privados ni crear pagos', async () => {
    const representante = await modeloReal(conexiones.alfa, 'Representante').create({ nombres: 'Maria', apellidos: 'QA',
      cedula: 'QA-TEMPORAL', telefono: 'telefono-privado', direccion: 'direccion-privada' });
    const alumno = await crearAtletaMongo('alfa', { representante: representante._id, categoria: 'Sub 12',
      tipo_mensualidad: 'media_beca', fecha_inscripcion: '2026-01-02' });
    const creada = await peticion('post', '/campanias', datosMongo());
    const ruta = `/campanias/${creada.body.campania._id}/participantes`;
    const guardada = await peticion('put', ruta, { participantes: [String(alumno._id)], version: 0 });
    expect(guardada.status).toBe(200);
    expect(guardada.body.campania).toMatchObject({ participantes: [String(alumno._id)], __v: 1, estado: 'borrador' });
    const catalogo = await peticion('get', ruta);
    expect(catalogo.status).toBe(200);
    expect(catalogo.body.atletas.find((item) => item._id === String(alumno._id))).toMatchObject({ disponible: true,
      categoria: 'Sub 12', tipo_mensualidad: 'media_beca', fecha_inscripcion: '2026-01-02T00:00:00.000Z',
      representante: { nombres: 'Maria', apellidos: 'QA' } });
    expect(JSON.stringify(catalogo.body)).not.toContain('telefono-privado');
    expect(JSON.stringify(catalogo.body)).not.toContain('direccion-privada');
    const colecciones = (await conexiones.alfa.db.listCollections().toArray()).map((item) => item.name);
    expect(colecciones.some((nombre) => /pago|mensualidad|credito|cargo/.test(nombre))).toBe(false);
  });

  test('rechaza seleccion ajena o inactiva y detecta concurrencia con edicion del borrador', async () => {
    const propio = await crearAtletaMongo('alfa');
    const ajeno = await crearAtletaMongo('beta');
    const inactivo = await crearAtletaMongo('alfa', { activo: false });
    const creada = await peticion('post', '/campanias', datosMongo());
    const base = `/campanias/${creada.body.campania._id}`;
    expect((await peticion('put', `${base}/participantes`, { participantes: [String(ajeno._id)], version: 0 })).status).toBe(400);
    expect((await peticion('put', `${base}/participantes`, { participantes: [String(inactivo._id)], version: 0 })).status).toBe(400);
    expect((await peticion('get', `${base}/participantes`, undefined, 'beta')).status).toBe(404);
    const { solicitud_id, ...cambios } = datosMongo();
    const respuestas = await Promise.all([
      peticion('put', `${base}/participantes`, { participantes: [String(propio._id)], version: 0 }),
      peticion('patch', base, { ...cambios, nombre: 'Cambio concurrente', version: 0 })
    ]);
    expect(respuestas.map((item) => item.status).sort()).toEqual([200, 409]);
    expect((await modelosMongo.alfa.CampaniaCobro.findById(creada.body.campania._id).lean()).__v).toBe(1);
  });

  test('no elimina atletas seleccionados al cambiar de sede, darse de baja o desaparecer', async () => {
    const alumno = await crearAtletaMongo('alfa');
    const creada = await peticion('post', '/campanias', datosMongo());
    const ruta = `/campanias/${creada.body.campania._id}/participantes`;
    const participantes = [String(alumno._id)];
    expect((await peticion('put', ruta, { participantes, version: 0 })).status).toBe(200);
    const Alumno = modeloReal(conexiones.alfa, 'Alumno');
    await Alumno.updateOne({ _id: alumno._id }, { $set: { activo: false, dado_de_baja: true, sede: new mongoose.Types.ObjectId() } });
    const catalogo = await peticion('get', ruta);
    expect(catalogo.body.atletas.find((item) => item._id === String(alumno._id)).disponible).toBe(false);
    expect((await peticion('put', ruta, { participantes, version: 1 })).status).toBe(200);
    await Alumno.deleteOne({ _id: alumno._id });
    const eliminado = await peticion('get', ruta);
    expect(eliminado.body.atletas.find((item) => item._id === String(alumno._id))).toMatchObject({ disponible: false, nombres: 'Atleta no disponible' });
    expect((await peticion('put', ruta, { participantes: [], version: 2 })).status).toBe(200);
    expect((await modelosMongo.alfa.CampaniaCobro.findById(creada.body.campania._id).lean()).participantes).toEqual([]);
  });

  test('incorpora 75 atletas de la sede, excluye inactivos y ajenos, y conserva excepciones al editar', async () => {
    const norte = await modelosMongo.alfa.Sede.create({ nombre: 'Sede incorporacion QA', direccion: 'QA', costo: 20 });
    const Alumno = modeloReal(conexiones.alfa, 'Alumno');
    const atletas = await Alumno.insertMany(Array.from({ length: 75 }, (_, indice) => ({ nombres: `Ana ${indice}`,
      apellidos: 'QA', sede: norte._id, fecha_inicio_cobro: new Date('2026-01-01') })));
    await crearAtletaMongo('alfa', { sede: norte._id, activo: false });
    await crearAtletaMongo('alfa', { sede: norte._id, dado_de_baja: true });
    await crearAtletaMongo('alfa');
    await crearAtletaMongo('beta', { sede: norte._id });
    const body = { ...datosMongo(), sedes: [String(norte._id)] };
    const creada = await peticion('post', '/campanias', body);
    expect(creada.status).toBe(201);
    expect(creada.body.campania.participantes.slice().sort()).toEqual(atletas.map((atleta) => String(atleta._id)).sort());
    const ruta = `/campanias/${creada.body.campania._id}`;
    const participantes = creada.body.campania.participantes.filter((id) => id !== String(atletas[0]._id));
    expect((await peticion('put', `${ruta}/participantes`, { participantes, version: 0 })).status).toBe(200);
    const reintento = await peticion('post', '/campanias', body);
    expect(reintento.status).toBe(200);
    expect(reintento.body.campania.participantes).toHaveLength(74);
    expect(reintento.body.campania.participantes).not.toContain(String(atletas[0]._id));
    const altaPosterior = await crearAtletaMongo('alfa', { sede: norte._id });
    const { solicitud_id, ...cambios } = body;
    const editada = await peticion('patch', ruta, { ...cambios, nombre: 'Cambio sin reponer participantes', monto_general: 40, version: 1 });
    expect(editada.status).toBe(200);
    expect(editada.body.campania.participantes).toHaveLength(74);
    expect(editada.body.campania.participantes).not.toContain(String(atletas[0]._id));
    expect(editada.body.campania.participantes).not.toContain(String(altaPosterior._id));
  });

  test('persiste condiciones, mantiene notas privadas y conserva acuerdos al editar monto general', async () => {
    const alumno = await crearAtletaMongo('alfa');
    const otro = await crearAtletaMongo('alfa');
    const creada = await peticion('post', '/campanias', datosMongo());
    const ruta = `/campanias/${creada.body.campania._id}`;
    const participantes = [String(alumno._id), String(otro._id)];
    const condiciones = [{ alumno: participantes[0], modalidad: 'personalizado', monto: 12.5, nota_interna: 'Acuerdo solo administracion QA' },
      { alumno: participantes[1], modalidad: 'no_aplica', nota_interna: 'Exoneracion privada QA' }];
    const guardada = await peticion('put', `${ruta}/participantes`, { participantes, condiciones_participantes: condiciones, version: 0 });
    expect(guardada.status).toBe(200);
    expect(guardada.body.campania.condiciones_participantes).toEqual(condiciones);
    expect((await peticion('get', `${ruta}/participantes`)).body.campania.condiciones_participantes).toEqual(condiciones);
    const listado = await peticion('get', '/campanias');
    expect(JSON.stringify(listado.body)).not.toContain('Acuerdo solo administracion QA');
    expect(listado.body.campanias[0].condiciones_participantes).toBeUndefined();
    expect((await modelosMongo.alfa.CampaniaCobro.findById(creada.body.campania._id).lean()).condiciones_participantes).toBeUndefined();
    const { solicitud_id, ...cambios } = datosMongo();
    const editada = await peticion('patch', ruta, { ...cambios, monto_general: 60, version: 1 });
    expect(editada.status).toBe(200);
    expect(editada.body.campania.condiciones_participantes).toBeUndefined();
    expect((await peticion('get', `${ruta}/participantes`)).body.campania.condiciones_participantes).toEqual(condiciones);
    expect((await peticion('put', `${ruta}/participantes`, { participantes, condiciones_participantes: [], version: 1 })).status).toBe(409);
    expect((await peticion('get', `${ruta}/participantes`, undefined, 'beta')).status).toBe(404);
    const retirada = await peticion('put', `${ruta}/participantes`, { participantes: [participantes[0]], version: 2 });
    expect(retirada.status).toBe(200);
    expect(retirada.body.campania.condiciones_participantes).toEqual([condiciones[0]]);
    const restablecida = await peticion('put', `${ruta}/participantes`, { participantes: [participantes[0]], condiciones_participantes: [], version: 3 });
    expect(restablecida.status).toBe(200);
    expect(restablecida.body.campania.condiciones_participantes).toEqual([]);
    const colecciones = (await conexiones.alfa.db.listCollections().toArray()).map((item) => item.name);
    expect(colecciones.some((nombre) => /pago|mensualidad|credito|cargo/.test(nombre))).toBe(false);
  });

  test('elimina solo el borrador vigente de su academia sin borrar atletas ni otras campanas', async () => {
    const alumno = await crearAtletaMongo('alfa');
    const creada = await peticion('post', '/campanias', datosMongo());
    const ruta = `/campanias/${creada.body.campania._id}`;
    const otra = await peticion('post', '/campanias', { ...datosMongo(), solicitud_id: '11000000-0000-4000-8000-000000000002' });
    expect((await peticion('delete', ruta, { version: 0 }, 'beta')).status).toBe(404);
    const { solicitud_id, ...cambios } = datosMongo();
    expect((await peticion('patch', ruta, { ...cambios, nombre: 'Cambio reciente', version: 0 })).status).toBe(200);
    expect((await peticion('delete', ruta, { version: 0 })).status).toBe(409);
    const eliminada = await peticion('delete', ruta, { version: 1 });
    expect(eliminada.status).toBe(200);
    expect(eliminada.body).toEqual({ eliminada: creada.body.campania._id });
    expect(await modelosMongo.alfa.CampaniaCobro.findById(creada.body.campania._id)).toBeNull();
    expect(await modelosMongo.alfa.CampaniaCobro.findById(otra.body.campania._id)).not.toBeNull();
    expect(await modeloReal(conexiones.alfa, 'Alumno').findById(alumno._id)).not.toBeNull();
    expect((await peticion('delete', ruta, { version: 1 })).status).toBe(404);
    const colecciones = (await conexiones.alfa.db.listCollections().toArray()).map((item) => item.name);
    expect(colecciones.some((nombre) => /pago|mensualidad|credito|cargo/.test(nombre))).toBe(false);
  });

  test.each(['abierta', 'cerrada', 'cancelada'])('impide eliminar campana %s en Mongo', async (estado) => {
    const creada = await peticion('post', '/campanias', datosMongo());
    await modelosMongo.alfa.CampaniaCobro.updateOne({ _id: creada.body.campania._id }, { $set: { estado } });
    expect((await peticion('delete', `/campanias/${creada.body.campania._id}`, { version: 0 })).status).toBe(409);
    expect((await modelosMongo.alfa.CampaniaCobro.findById(creada.body.campania._id).lean()).estado).toBe(estado);
  });

  test('resumen real conserva borrador y acuerdos, aisla academia y no genera documentos financieros', async () => {
    const sede = await modelosMongo.alfa.Sede.create({ nombre: 'Resumen QA', direccion: 'QA', costo: 30 });
    const primero = await crearAtletaMongo('alfa', { sede: sede._id });
    const personalizado = await crearAtletaMongo('alfa', { sede: sede._id });
    const exonerado = await crearAtletaMongo('alfa', { sede: sede._id });
    const creada = await peticion('post', '/campanias', { ...datosMongo(), sedes: [String(sede._id)],
      modalidad_monto: 'por_sede', monto_general: null, montos_por_sede: [{ sede: String(sede._id), monto: 30 }] });
    const base = `/campanias/${creada.body.campania._id}`;
    const participantes = [primero, personalizado, exonerado].map((atleta) => String(atleta._id));
    const condiciones_participantes = [
      { alumno: String(personalizado._id), modalidad: 'personalizado', monto: 12.5, nota_interna: 'Acuerdo privado resumen QA' },
      { alumno: String(exonerado._id), modalidad: 'no_aplica', nota_interna: '' }
    ];
    expect((await peticion('put', `${base}/participantes`, { participantes, condiciones_participantes, version: 0 })).status).toBe(200);
    const antes = await modelosMongo.alfa.CampaniaCobro.findById(creada.body.campania._id).select('+condiciones_participantes').lean();
    const cantidadAtletas = await modeloReal(conexiones.alfa, 'Alumno').countDocuments();
    const resumen = await peticion('get', `${base}/resumen`);
    expect(resumen.status).toBe(200);
    expect(resumen.body.totales).toEqual({ participantes: 3, generales: 1, personalizados: 1, no_aplica: 1,
      pendientes: 0, con_observaciones: 0, subtotal_calculado: 42.5, total_esperado: 42.5 });
    expect(resumen.body.filas.find((fila) => fila.alumno === String(personalizado._id))).toMatchObject({ monto: 12.5, nota_interna: 'Acuerdo privado resumen QA' });
    expect((await peticion('get', `${base}/resumen`, undefined, 'beta')).status).toBe(404);
    const despues = await modelosMongo.alfa.CampaniaCobro.findById(creada.body.campania._id).select('+condiciones_participantes').lean();
    expect(despues).toEqual(antes);
    expect(await modeloReal(conexiones.alfa, 'Alumno').countDocuments()).toBe(cantidadAtletas);
    await modeloReal(conexiones.alfa, 'Alumno').updateOne({ _id: primero._id }, { $set: { sede: new mongoose.Types.ObjectId() } });
    const pendiente = await peticion('get', `${base}/resumen`);
    expect(pendiente.status).toBe(200);
    expect(pendiente.body.totales).toMatchObject({ pendientes: 1, con_observaciones: 1, subtotal_calculado: 12.5, total_esperado: null });
    expect(pendiente.body.filas).toHaveLength(3);
    const colecciones = (await conexiones.alfa.db.listCollections().toArray()).map((item) => item.name);
    expect(colecciones.some((nombre) => /pago|mensualidad|credito|cargo/.test(nombre))).toBe(false);
  });

  test('anadir sede incorpora su grupo completo y conserva las exclusiones de la sede anterior', async () => {
    const norte = await modelosMongo.alfa.Sede.create({ nombre: 'Norte incorporacion QA', direccion: 'QA', costo: 20 });
    const sur = await modelosMongo.alfa.Sede.create({ nombre: 'Sur incorporacion QA', direccion: 'QA', costo: 20 });
    const primero = await crearAtletaMongo('alfa', { sede: norte._id });
    const excluido = await crearAtletaMongo('alfa', { sede: norte._id });
    const nuevo = await crearAtletaMongo('alfa', { sede: sur._id });
    const body = { ...datosMongo(), sedes: [String(norte._id)] };
    const creada = await peticion('post', '/campanias', body);
    const ruta = `/campanias/${creada.body.campania._id}`;
    expect((await peticion('put', `${ruta}/participantes`, { participantes: [String(primero._id)], version: 0 })).status).toBe(200);
    await modeloReal(conexiones.alfa, 'Alumno').updateOne({ _id: primero._id }, { $set: { sede: sur._id } });
    const { solicitud_id, ...cambios } = body;
    const editada = await peticion('patch', ruta, { ...cambios, sedes: [String(norte._id), String(sur._id)], version: 1 });
    expect(editada.status).toBe(200);
    expect(editada.body.campania.participantes.slice().sort()).toEqual([String(primero._id), String(nuevo._id)].sort());
    expect(editada.body.campania.participantes).not.toContain(String(excluido._id));
  });

  let numeroPublicacion = 0;
  const prepararPublicacionMongo = async () => {
    const Cargo = modeloReal(conexiones.alfa, 'CargoCampania');
    await Cargo.init();
    await Cargo.deleteMany({});
    numeroPublicacion += 1;
    const sede = await modelosMongo.alfa.Sede.create({ nombre: `Publicacion QA ${numeroPublicacion}`, direccion: 'QA', costo: 20 });
    const atletas = await Promise.all(Array.from({ length: 3 }, () => crearAtletaMongo('alfa', { sede: sede._id })));
    const creada = await peticion('post', '/campanias', { ...datosMongo(), monto_general: '30', sedes: [String(sede._id)] });
    const base = `/campanias/${creada.body.campania._id}`;
    const seleccion = atletas.map((atleta) => String(atleta._id));
    const guardada = await peticion('put', `${base}/participantes`, { participantes: seleccion, version: 0,
      condiciones_participantes: [{ alumno: seleccion[1], modalidad: 'personalizado', monto: 12.5, nota_interna: 'Acuerdo publicado QA' },
        { alumno: seleccion[2], modalidad: 'no_aplica', nota_interna: '' }] });
    expect(guardada.status).toBe(200);
    const preview = await peticion('get', `${base}/resumen`);
    expect(preview.status).toBe(200);
    return { Cargo, atletas, base, id: creada.body.campania._id, body: { version: 1, revision: preview.body.revision,
      solicitud_id: '11000000-0000-4000-8000-000000000002' } };
  };
  const publicarMongo = (base, body, tenant = 'alfa') => request(app).post(`${base}/publicar`)
    .set('x-tenant', tenant).set('Authorization', `Bearer ${tokenPublicacion('admin', tenant)}`).send(body);

  test('publicacion Mongo confirma cargos congelados, auditoria y aislamiento sin alterar atletas ni pagos', async () => {
    const { Cargo, atletas, base, id, body } = await prepararPublicacionMongo();
    const Alumno = modeloReal(conexiones.alfa, 'Alumno');
    const antes = await Alumno.find({ _id: { $in: atletas.map((atleta) => atleta._id) } }).lean();
    expect((await publicarMongo(base, body, 'beta')).status).toBe(404);
    const response = await publicarMongo(base, body);
    expect(response.status).toBe(201);
    expect(response.body.publicacion).toMatchObject({ participantes: 3, total_esperado: 42.5, actor: { id: 'admin-qa', rol: 'admin' } });
    expect(response.body.campania.condiciones_participantes).toBeUndefined();
    const cargos = await Cargo.find({ campania: id }).select('+nota_interna').lean();
    expect(cargos).toHaveLength(3);
    expect(cargos.map((cargo) => cargo.monto).sort((primero, segundo) => primero - segundo)).toEqual([0, 12.5, 30]);
    expect(cargos.find((cargo) => cargo.modalidad === 'no_aplica')).toMatchObject({ monto: 0, saldo_pendiente: 0, estado: 'no_aplica' });
    expect(await Alumno.find({ _id: { $in: atletas.map((atleta) => atleta._id) } }).lean()).toEqual(antes);
    expect((await peticion('get', `${base}/cargos`, undefined, 'beta')).status).toBe(404);
    await Alumno.updateOne({ _id: atletas[0]._id }, { $set: { sede: new mongoose.Types.ObjectId(), activo: false } });
    const lectura = await peticion('get', `${base}/cargos`);
    expect(lectura.status).toBe(200);
    expect(lectura.body.totales.total_esperado).toBe(42.5);
    expect(lectura.body.filas.find((fila) => fila.alumno === String(atletas[1]._id)).nota_interna).toBe('Acuerdo publicado QA');
    expect(await Cargo.find({ campania: id }).select('+nota_interna').lean()).toEqual(cargos);
    expect((await peticion('delete', base, { version: 2 })).status).toBe(409);
    const colecciones = (await conexiones.alfa.db.listCollections().toArray()).map((item) => item.name);
    expect(colecciones.some((nombre) => /pago|mensualidad|credito/.test(nombre))).toBe(false);
  });

  test('publicacion Mongo revierte estado y primer cargo si falla la insercion', async () => {
    const { Cargo, base, id, body } = await prepararPublicacionMongo();
    const antes = await modelosMongo.alfa.CampaniaCobro.findById(id).select('+condiciones_participantes').lean();
    const fallo = jest.spyOn(Cargo, 'insertMany').mockImplementationOnce(async (documentos, opciones) => {
      await Cargo.collection.insertOne(documentos[0], { session: opciones.session });
      throw new Error('Fallo simulado despues del primer cargo');
    });
    try {
      expect((await publicarMongo(base, body)).status).toBe(500);
    } finally { fallo.mockRestore(); }
    expect(await Cargo.countDocuments({ campania: id })).toBe(0);
    expect(await modelosMongo.alfa.CampaniaCobro.findById(id).select('+condiciones_participantes').lean()).toEqual(antes);
    expect((await publicarMongo(base, body)).status).toBe(201);
    expect(await Cargo.countDocuments({ campania: id })).toBe(3);
  });

  test.each(['misma', 'distinta'])('publicacion Mongo concurrente con solicitud %s nunca duplica cargos', async (tipo) => {
    const { Cargo, base, id, body } = await prepararPublicacionMongo();
    const segunda = tipo === 'misma' ? body : { ...body, solicitud_id: '11000000-0000-4000-8000-000000000003' };
    const respuestas = await Promise.all([publicarMongo(base, body), publicarMongo(base, segunda)]);
    expect(respuestas.map((respuesta) => respuesta.status).sort()).toEqual(tipo === 'misma' ? [200, 201] : [201, 409]);
    expect(await Cargo.countDocuments({ campania: id })).toBe(3);
    const guardada = await modelosMongo.alfa.CampaniaCobro.findById(id).lean();
    expect(guardada).toMatchObject({ estado: 'abierta', __v: 2 });
    const ganadora = respuestas.find((respuesta) => respuesta.status === 201).body.publicacion;
    expect((await publicarMongo(base, { ...body, solicitud_id: ganadora.solicitud_id })).status).toBe(200);
    expect(await Cargo.countDocuments({ campania: id })).toBe(3);
  });

  const prepararPagoMongo = async () => {
    const datos = await prepararPublicacionMongo();
    expect((await publicarMongo(datos.base, datos.body)).status).toBe(201);
    const Pago = modeloReal(conexiones.alfa, 'PagoCampania');
    await Pago.init();
    await Pago.deleteMany({});
    const cargo = await datos.Cargo.findOne({ campania: datos.id, modalidad: 'general' }).lean();
    const ruta = `${datos.base}/cargos/${cargo._id}/pagos`;
    const body = { solicitud_id: '22000000-0000-4000-8000-000000000001', version: 0, moneda: 'USD', monto_pagado: 10,
      monto_pagado_bs: 1000, fecha_pago: '2026-11-10', metodo_pago: 'Transferencia', referencia: '123456', estado: 'en_revision' };
    return { ...datos, Pago, cargo, ruta, pagoBody: body };
  };
  const registrarMongo = (ruta, body, rol = 'admin', tenant = 'alfa') => request(app).post(ruta)
    .set('x-tenant', tenant).set('Authorization', `Bearer ${tokenPublicacion(rol, tenant)}`).send(body);
  const corregirMongo = (method, ruta, body) => request(app)[method](ruta)
    .set('x-tenant', 'alfa').set('Authorization', `Bearer ${tokenPublicacion()}`).send(body);

  const prepararCorreccionPropia = async () => {
    const datos = await prepararPagoMongo();
    const userId = new mongoose.Types.ObjectId();
    await modeloReal(conexiones.alfa, 'Alumno').updateOne({ _id: datos.cargo.alumno }, { $set: { usuario: userId } });
    const auth = `Bearer ${jwt.sign({ rol: 'usuario', id: String(userId), tenantId: 'alfa' }, 'qa-campanias-secret')}`;
    const pedir = (method, url, body) => request(app)[method](url).set('Authorization', auth).send(body);
    const creado = await pedir('post', datos.ruta, datos.pagoBody);
    expect(creado.status).toBe(201);
    return { ...datos, userId, auth, pedir, destino: `${datos.ruta}/${creado.body.pago._id}`, pagoId: creado.body.pago._id };
  };

  const prepararAgrupado = async () => {
    const datos = await prepararPagoMongo();
    const representante = await modeloReal(conexiones.alfa, 'Representante').create({ nombres: 'Maria', apellidos: 'Grupo QA', cedula: `GRUPO-${Date.now()}` });
    await modeloReal(conexiones.alfa, 'Alumno').updateMany({ _id: { $in: datos.atletas.map((alumno) => alumno._id) } }, { $set: { representante: representante._id } });
    const segundo = await datos.Cargo.findOne({ campania: datos.id, modalidad: 'personalizado' }).lean();
    const { version, ...body } = datos.pagoBody;
    return { ...datos, segundo, representante, agrupado: { ...body, alumnoId: String(datos.cargo.alumno),
      monto_pagado: 42.5, monto_pagado_bs: 4250,
      cargos: [datos.cargo, segundo].map((cargo) => ({ cargo: String(cargo._id), version: cargo.__v })) } };
  };

  test.each([['admin', 'USD', 30], ['super_admin', 'EUR', 15]])(
    'efectivo campania Mongo %s registra %s sin referencia ni tasa y permite corregir y eliminar', async (rol, moneda, monto) => {
      const datos = await prepararPagoMongo();
      await modelosMongo.alfa.CampaniaCobro.updateOne({ _id: datos.id }, { $set: { moneda } });
      await datos.Cargo.updateMany({ campania: datos.id }, { $set: { moneda, permitir_abonos: true } });
      const { monto_pagado_bs, ...campos } = datos.pagoBody;
      const body = { ...campos, moneda, monto_pagado: monto, metodo_pago: 'Efectivo', referencia: '', estado: 'confirmado',
        nota: 'Recibido en efectivo' };
      const creada = await registrarMongo(datos.ruta, body, rol);
      expect(creada.status).toBe(201);
      expect(creada.body.pago).toMatchObject({ moneda, monto_pagado: monto, monto_pagado_bs: null,
        metodo_pago: 'Efectivo', referencia: '', tasa: null, fecha_tasa: '', estado: 'confirmado',
        registrado_por: { rol }, confirmado_por: { rol }, nota: 'Recibido en efectivo', comprobante_url: '' });
      expect(creada.body.cargo).toMatchObject({ monto: 30, saldo_pendiente: 30 - monto, estado: monto === 30 ? 'pagado' : 'abono' });
      expect(require('../services/paymentExchangeRate').obtenerTasaPagoPorFecha).not.toHaveBeenCalled();
      expect((await registrarMongo(datos.ruta, body, rol)).body.repetida).toBe(true);
      expect(await datos.Pago.countDocuments({ cargo: datos.cargo._id })).toBe(1);
      const destino = `${datos.ruta}/${creada.body.pago._id}`;
      const editada = await corregirMongo('patch', destino, { ...body, version: 1, monto_pagado: 10,
        solicitud_id: require('crypto').randomUUID(), referencia: '' });
      expect(editada.status).toBe(200);
      expect(editada.body.pago).toMatchObject({ monto_pagado: 10, referencia: '', tasa: null, monto_pagado_bs: null });
      expect(editada.body.cargo.saldo_pendiente).toBe(20);
      expect((await corregirMongo('delete', destino, { version: 2 })).status).toBe(200);
      expect(await datos.Cargo.findById(datos.cargo._id).lean()).toMatchObject({ estado: 'pendiente', saldo_pendiente: 30 });
    });

  test('efectivo campania Mongo rechaza montos en Bs sin registrar pagos', async () => {
    const datos = await prepararPagoMongo();
    const antes = await datos.Cargo.findById(datos.cargo._id).lean();
    const respuesta = await registrarMongo(datos.ruta, { ...datos.pagoBody, metodo_pago: 'Efectivo', referencia: '' });
    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error).toMatch(/sin monto en Bs/);
    expect(await datos.Pago.countDocuments({ cargo: datos.cargo._id })).toBe(0);
    expect(await datos.Cargo.findById(datos.cargo._id).lean()).toEqual(antes);
  });

  test.each([
    ['en_revision', -100], ['en_revision', 100], ['confirmado', -100], ['confirmado', 100]
  ])('tolerancia campania Mongo %s Bs %s conserva Bs, confirma y revierte sin residuos', async (estado, diferencia) => {
    const { Cargo, Pago, cargo, ruta, pagoBody } = await prepararPagoMongo();
    await Cargo.updateOne({ _id: cargo._id }, { $set: { permitir_abonos: false } });
    const body = { ...pagoBody, monto_pagado: 30, monto_pagado_bs: 3000 + diferencia, estado };
    expect((await registrarMongo(ruta, { ...body, monto_pagado_bs: 3100.01 })).status).toBe(409);
    expect((await registrarMongo(ruta, { ...body, monto_pagado_bs: 2899.99 })).status).toBe(409);
    const creado = await registrarMongo(ruta, body);
    expect(creado.status).toBe(201);
    expect(creado.body.pago).toMatchObject({ monto_pagado: 30, monto_pagado_bs: 3000 + diferencia, tasa: 100, estado });
    expect((await registrarMongo(ruta, body)).body.repetida).toBe(true);
    const destino = `${ruta}/${creado.body.pago._id}`;
    const correccion = { ...body, monto_pagado_bs: 3000 - diferencia, version: 1,
      solicitud_id: '33000000-0000-4000-8000-000000000001' };
    const editado = await corregirMongo('patch', destino, correccion);
    expect(editado.status).toBe(200);
    expect(editado.body.pago).toMatchObject({ monto_pagado: 30, monto_pagado_bs: 3000 - diferencia, tasa: 100 });
    expect((await corregirMongo('patch', destino, correccion)).body.repetida).toBe(true);
    expect((await corregirMongo('get', ruta)).status).toBe(200);
    if (estado === 'en_revision') {
      expect((await corregirMongo('post', `${destino}/confirmar`)).status).toBe(200);
    }
    const actualizado = await Cargo.findById(cargo._id).lean();
    expect(actualizado).toMatchObject({ saldo_pendiente: 0, estado: 'pagado' });
    expect((await corregirMongo('get', ruta)).body.totales).toMatchObject({ confirmado: 30, disponible: 0 });
    expect((await corregirMongo('delete', destino, { version: actualizado.__v })).status).toBe(200);
    expect(await Cargo.findById(cargo._id).lean()).toMatchObject({ saldo_pendiente: 30, estado: 'pendiente' });
    expect(await Pago.findById(creado.body.pago._id).lean()).toMatchObject({ estado: 'eliminado', monto_pagado_bs: 3000 - diferencia });
  });

  test.each([-100, 100])('tolerancia agrupada Mongo Bs %s se aplica una sola vez al total', async (diferencia) => {
    const datos = await prepararAgrupado();
    const body = { ...datos.agrupado, monto_pagado_bs: 4250 + diferencia };
    expect((await registrarMongo('/campanias/pagos-agrupados', { ...body, monto_pagado_bs: 4350.01 })).status).toBe(409);
    const creado = await registrarMongo('/campanias/pagos-agrupados', body);
    expect(creado.status).toBe(201);
    expect(creado.body.pagos.reduce((suma, pago) => suma + Math.round(pago.monto_pagado_bs * 100), 0)).toBe(Math.round((4250 + diferencia) * 100));
    const ruta = `/campanias/pagos-agrupados/${body.solicitud_id}`;
    const { alumnoId, ...correccion } = body;
    const editado = await corregirMongo('patch', ruta, { ...correccion, monto_pagado_bs: 4250 - diferencia,
      solicitud_id: '33000000-0000-4000-8000-000000000001',
      cargos: body.cargos.map((cargo) => ({ ...cargo, version: 1 })) });
    expect(editado.status).toBe(200);
    const pagos = (await corregirMongo('get', ruta)).body.pagos;
    expect(pagos.reduce((suma, pago) => suma + Math.round(pago.monto_pagado_bs * 100), 0)).toBe(Math.round((4250 - diferencia) * 100));
    const pago = pagos[0];
    expect((await corregirMongo('post', `/campanias/${pago.campania}/cargos/${pago.cargo}/pagos/${pago._id}/confirmar`)).status).toBe(200);
    expect(await datos.Cargo.findById(datos.cargo._id).lean()).toMatchObject({ saldo_pendiente: 0 });
    expect(await datos.Cargo.findById(datos.segundo._id).lean()).toMatchObject({ saldo_pendiente: 0 });
  });

  test('agrupados campanias Mongo registra dos saldos completos atomicos y conserva reintento', async () => {
    const datos = await prepararAgrupado();
    const respuesta = await registrarMongo('/campanias/pagos-agrupados', datos.agrupado);
    expect(respuesta.status).toBe(201);
    expect(respuesta.body.pagos).toHaveLength(2);
    expect(respuesta.body.pagos.map((pago) => pago.monto_pagado).sort((primero, segundo) => primero - segundo)).toEqual([12.5, 30]);
    expect(respuesta.body.pagos.reduce((suma, pago) => suma + Math.round(pago.monto_pagado_bs * 100), 0)).toBe(425000);
    expect(respuesta.body.pagos.every((pago) => pago.agrupacion.monto_total === 42.5 && pago.estado === 'en_revision')).toBe(true);
    expect((await registrarMongo('/campanias/pagos-agrupados', datos.agrupado)).status).toBe(200);
    expect(await datos.Pago.countDocuments()).toBe(2);
    expect(await datos.Cargo.findById(datos.cargo._id).lean()).toMatchObject({ saldo_pendiente: 30, __v: 1 });
    expect((await registrarMongo('/campanias/pagos-agrupados', { ...datos.agrupado, referencia: '654321' })).status).toBe(409);
  });

  test('agrupados campanias Mongo concilia una transferencia y confirma todos los repartos una sola vez', async () => {
    const datos = await prepararAgrupado();
    expect((await registrarMongo('/campanias/pagos-agrupados', datos.agrupado)).status).toBe(201);
    const preview = await previsualizarCampanias(Buffer.from('Referencia;Monto;Fecha\n123456;4250;10/11/2026\n'));
    expect(preview.status).toBe(200);
    expect(preview.body.match_total).toHaveLength(1);
    expect(preview.body.summary.total_sistema_en_revision).toBe(1);
    const sistema = preview.body.match_total[0].sistema;
    expect(sistema.monto_esperado_bs).toBe(4250);
    expect(sistema.contexto).toContain('Pago agrupado');
    const body = { tipo_conciliacion: 'campanias', pago_ids: [sistema.pago_id],
      revisiones: [{ pago_id: sistema.pago_id, revision: sistema.revision_pago }] };
    expect((await registrarMongo('/conciliacion/confirmar-match-total', body)).body.registros_actualizados).toBe(2);
    expect((await registrarMongo('/conciliacion/confirmar-match-total', body)).body.registros_actualizados).toBe(0);
    expect(await datos.Pago.countDocuments({ estado: 'confirmado' })).toBe(2);
    expect(await datos.Cargo.findById(datos.segundo._id).lean()).toMatchObject({ saldo_pendiente: 0, estado: 'pagado', __v: 2 });
    expect((await modelosMongo.alfa.CampaniaCobro.findById(datos.id)).estado).toBe('cerrada');
  });

  test('cierre Mongo agrupado confirmado liquida dos campanas despues de todos los repartos', async () => {
    const datos = await prepararAgrupado();
    const original = await modelosMongo.alfa.CampaniaCobro.findById(datos.id).lean();
    const otra = await modelosMongo.alfa.CampaniaCobro.create({ ...original, _id: new mongoose.Types.ObjectId(), nombre: 'Segunda agrupada QA',
      solicitud_id: undefined, participantes: [datos.segundo.alumno],
      publicacion: { ...original.publicacion, participantes: 1, generales: 0, personalizados: 1, no_aplica: 0, total_esperado: 12.5 } });
    await modelosMongo.alfa.CampaniaCobro.updateOne({ _id: datos.id }, { $set: {
      participantes: original.participantes.filter((id) => String(id) !== String(datos.segundo.alumno)),
      publicacion: { ...original.publicacion, participantes: 2, personalizados: 0, total_esperado: 30 }
    } });
    await datos.Cargo.updateOne({ _id: datos.segundo._id }, { $set: { campania: otra._id } });
    const respuesta = await registrarMongo('/campanias/pagos-agrupados', { ...datos.agrupado, estado: 'confirmado' });
    expect(respuesta.status).toBe(201);
    expect((await modelosMongo.alfa.CampaniaCobro.find({ _id: { $in: [datos.id, otra._id] } }).lean()).map((item) => item.estado)).toEqual(['cerrada', 'cerrada']);
    expect(await datos.Pago.countDocuments({ estado: 'confirmado' })).toBe(2);
    expect((await registrarMongo('/campanias/pagos-agrupados', { ...datos.agrupado, estado: 'confirmado' })).status).toBe(200);
  });

  test('agrupados campanias Mongo admite varias campanas y reparte cada centimo del importe real en Bs', async () => {
    const datos = await prepararAgrupado();
    const original = await modelosMongo.alfa.CampaniaCobro.findById(datos.id).lean();
    const otra = await modelosMongo.alfa.CampaniaCobro.create({ ...original, _id: new mongoose.Types.ObjectId(), nombre: 'Otra campana agrupada QA', solicitud_id: undefined });
    await datos.Cargo.updateOne({ _id: datos.segundo._id }, { $set: { campania: otra._id } });
    const respuesta = await registrarMongo('/campanias/pagos-agrupados', { ...datos.agrupado, monto_pagado_bs: 4250.01 });
    expect(respuesta.status).toBe(201);
    expect(new Set(respuesta.body.pagos.map((pago) => pago.campania)).size).toBe(2);
    expect(respuesta.body.pagos.reduce((suma, pago) => suma + Math.round(pago.monto_pagado_bs * 100), 0)).toBe(425001);
  });

  test('agrupados campanias Mongo rechaza otro representante, mezcla de monedas, reserva y version vieja sin escrituras', async () => {
    const datos = await prepararAgrupado();
    const otro = new mongoose.Types.ObjectId();
    const Alumno = modeloReal(conexiones.alfa, 'Alumno');
    await Alumno.updateOne({ _id: datos.segundo.alumno }, { $set: { representante: otro } });
    expect((await registrarMongo('/campanias/pagos-agrupados', datos.agrupado)).status).toBe(409);
    await Alumno.updateOne({ _id: datos.segundo.alumno }, { $set: { representante: datos.representante._id } });
    await datos.Cargo.updateOne({ _id: datos.segundo._id }, { $set: { moneda: 'EUR' } });
    expect((await registrarMongo('/campanias/pagos-agrupados', datos.agrupado)).status).toBe(409);
    await datos.Cargo.updateOne({ _id: datos.segundo._id }, { $set: { moneda: 'USD' } });
    expect((await registrarMongo('/campanias/pagos-agrupados', { ...datos.agrupado, cargos: datos.agrupado.cargos.map((item) => ({ ...item, version: 99 })) })).status).toBe(409);
    expect(await datos.Pago.countDocuments()).toBe(0);
    expect((await registrarMongo(datos.ruta, datos.pagoBody)).status).toBe(201);
    const cargos = datos.agrupado.cargos.map((item) => ({ ...item, version: item.cargo === String(datos.cargo._id) ? 1 : 0 }));
    expect((await registrarMongo('/campanias/pagos-agrupados', { ...datos.agrupado, cargos })).status).toBe(409);
    expect(await datos.Pago.countDocuments()).toBe(1);
  });

  test('agrupados campanias Mongo revierte el primer reparto si falla el segundo y requiere replica set', async () => {
    const datos = await prepararAgrupado();
    const crear = datos.Pago.create.bind(datos.Pago);
    let cantidad = 0;
    const fallo = jest.spyOn(datos.Pago, 'create').mockImplementation(async (...argumentos) => {
      cantidad += 1;
      if (cantidad === 2) throw new Error('Fallo QA segundo reparto');
      return crear(...argumentos);
    });
    try { expect((await registrarMongo('/campanias/pagos-agrupados', datos.agrupado)).status).toBe(500); }
    finally { fallo.mockRestore(); }
    expect(await datos.Pago.countDocuments()).toBe(0);
    expect(await datos.Cargo.findById(datos.cargo._id).lean()).toMatchObject({ __v: 0, saldo_pendiente: 30 });
    const sesion = jest.spyOn(datos.Cargo.db, 'startSession').mockResolvedValueOnce({ withTransaction: async () => {
      throw new Error('Transaction numbers are only allowed on a replica set member or mongos');
    }, endSession: jest.fn(async () => {}) });
    try { expect((await registrarMongo('/campanias/pagos-agrupados', datos.agrupado)).status).toBe(503); }
    finally { sesion.mockRestore(); }
    expect(await datos.Pago.countDocuments()).toBe(0);
  });

  test('agrupados campanias Mongo corrige todos los repartos, invalida preview anterior y retira sin borrar historial', async () => {
    const datos = await prepararAgrupado();
    const creado = await registrarMongo('/campanias/pagos-agrupados', datos.agrupado);
    const ruta = `/campanias/pagos-agrupados/${datos.agrupado.solicitud_id}`;
    const preview = await previsualizarCampanias(Buffer.from('Referencia;Monto;Fecha\n123456;4250;10/11/2026\n'));
    const sistema = preview.body.match_total[0].sistema;
    const detalle = await corregirMongo('get', ruta);
    expect(detalle.status).toBe(200);
    expect(detalle.body.puede_corregir).toBe(true);
    const { alumnoId, ...body } = datos.agrupado;
    const correccion = { ...body, solicitud_id: '33000000-0000-4000-8000-000000000001', referencia: '654321',
      cargos: detalle.body.cargos.map((cargo) => ({ cargo: cargo._id, version: cargo.__v })) };
    expect((await corregirMongo('patch', ruta, correccion)).status).toBe(200);
    expect((await corregirMongo('patch', ruta, correccion)).body.repetida).toBe(true);
    expect((await registrarMongo('/conciliacion/confirmar-match-total', { tipo_conciliacion: 'campanias', pago_ids: [sistema.pago_id],
      revisiones: [{ pago_id: sistema.pago_id, revision: sistema.revision_pago }] })).status).toBe(409);
    const pago = creado.body.pagos[0];
    expect((await corregirMongo('delete', `/campanias/${pago.campania}/cargos/${pago.cargo}/pagos/${pago._id}`, { version: 2 })).status).toBe(409);
    const actualizado = await corregirMongo('get', ruta);
    const retiro = { cargos: actualizado.body.cargos.map((cargo) => ({ cargo: cargo._id, version: cargo.__v })) };
    expect((await corregirMongo('delete', ruta, retiro)).status).toBe(200);
    expect((await corregirMongo('delete', ruta, retiro)).body.repetida).toBe(true);
    expect(await datos.Pago.countDocuments({ estado: 'eliminado' })).toBe(2);
    expect(await datos.Pago.findOne({ _id: pago._id }).select('+modificaciones').lean()).toMatchObject({
      eliminado_por: { id: 'admin-qa', rol: 'admin' }, modificaciones: [expect.objectContaining({ anterior: expect.objectContaining({ referencia: '123456' }) })] });
    expect(await datos.Cargo.findById(datos.cargo._id).lean()).toMatchObject({ saldo_pendiente: 30, __v: 3 });
  });

  test('agrupados campanias Mongo confirmacion manual atomica concurrente con conciliacion y rechazo de correccion confirmada', async () => {
    const datos = await prepararAgrupado();
    const creado = await registrarMongo('/campanias/pagos-agrupados', datos.agrupado);
    const pago = creado.body.pagos[0];
    const preview = await previsualizarCampanias(Buffer.from('Referencia;Monto;Fecha\n123456;4250;10/11/2026\n'));
    const sistema = preview.body.match_total[0].sistema;
    const respuestas = await Promise.all([
      registrarMongo(`/campanias/${pago.campania}/cargos/${pago.cargo}/pagos/${pago._id}/confirmar`, {}),
      registrarMongo('/conciliacion/confirmar-match-total', { tipo_conciliacion: 'campanias', pago_ids: [sistema.pago_id],
        revisiones: [{ pago_id: sistema.pago_id, revision: sistema.revision_pago }] })
    ]);
    expect(respuestas.map((respuesta) => respuesta.status)).toEqual([200, 200]);
    expect(await datos.Pago.countDocuments({ estado: 'confirmado' })).toBe(2);
    expect(await datos.Cargo.findById(datos.cargo._id).lean()).toMatchObject({ saldo_pendiente: 0, __v: 2 });
    expect((await corregirMongo('delete', `/campanias/pagos-agrupados/${datos.agrupado.solicitud_id}`, {
      cargos: datos.agrupado.cargos.map((cargo) => ({ ...cargo, version: 2 })) })).status).toBe(409);
  });

  test('agrupados campanias Mongo usuario reporta hermanos propios sin exponer grupos ajenos ni actores privados', async () => {
    const datos = await prepararAgrupado();
    await modeloReal(conexiones.alfa, 'CampaniaCobro').updateOne({ _id: datos.cargo.campania }, { $set: { descripcion: 'Reinscripcion temporada 2027' } });
    const usuarioId = new mongoose.Types.ObjectId();
    await modeloReal(conexiones.alfa, 'Representante').updateOne({ _id: datos.representante._id }, { $set: { usuario: usuarioId } });
    const auth = `Bearer ${jwt.sign({ rol: 'usuario', id: String(usuarioId), tenantId: 'alfa' }, 'qa-campanias-secret')}`;
    const pedir = (method, ruta, body) => request(app)[method](ruta).set('Authorization', auth).send(body);
    const catalogo = await pedir('get', `/campanias/cargos-agrupables?alumnoId=${datos.cargo.alumno}`);
    expect(catalogo.status).toBe(200);
    expect(catalogo.body.cargos).toHaveLength(2);
    expect(catalogo.body.cargos).toEqual(expect.arrayContaining([expect.objectContaining({
      campania: expect.objectContaining({ _id: String(datos.cargo.campania), descripcion: 'Reinscripcion temporada 2027' })
    })]));
    expect((await pedir('post', '/campanias/pagos-agrupados', { ...datos.agrupado, estado: 'confirmado' })).status).toBe(403);
    const creado = await pedir('post', '/campanias/pagos-agrupados', datos.agrupado);
    expect(creado.status).toBe(201);
    expect(JSON.stringify(creado.body)).not.toContain(String(usuarioId));
    expect((await registrarMongo('/campanias/pagos-agrupados', datos.agrupado, 'admin', 'beta')).status).toBe(404);
    const ruta = `/campanias/pagos-agrupados/${datos.agrupado.solicitud_id}`;
    expect((await pedir('get', ruta)).body.puede_corregir).toBe(true);
    const ajeno = `Bearer ${jwt.sign({ rol: 'usuario', id: String(new mongoose.Types.ObjectId()), tenantId: 'alfa' }, 'qa-campanias-secret')}`;
    expect((await request(app).get(ruta).set('Authorization', ajeno)).status).toBe(404);
    expect((await pedir('delete', ruta, { cargos: datos.agrupado.cargos.map((item) => ({ ...item, version: 1 })) })).status).toBe(200);
  });

  test.each(['finanzas', 'asistente', 'entrenador'])('agrupados campanias Mongo deniega %s', async (rol) => {
    expect((await registrarMongo('/campanias/pagos-agrupados', {}, rol)).status).toBe(403);
  });

  test.each(['misma', 'distinta'])('agrupados campanias Mongo solicitudes concurrentes %s no duplican reservas', async (tipo) => {
    const datos = await prepararAgrupado();
    const segunda = tipo === 'misma' ? datos.agrupado : { ...datos.agrupado, solicitud_id: '44000000-0000-4000-8000-000000000001' };
    const respuestas = await Promise.all([registrarMongo('/campanias/pagos-agrupados', datos.agrupado), registrarMongo('/campanias/pagos-agrupados', segunda)]);
    expect(respuestas.map((respuesta) => respuesta.status).sort()).toEqual(tipo === 'misma' ? [200, 201] : [201, 409]);
    expect(await datos.Pago.countDocuments()).toBe(2);
  });

  test('agrupados campanias Mongo UUID unico impide crear dos transferencias concurrentes sobre cargos distintos', async () => {
    const datos = await prepararAgrupado();
    const original = await modelosMongo.alfa.CampaniaCobro.findById(datos.id).lean();
    const otra = await modelosMongo.alfa.CampaniaCobro.create({ ...original, _id: new mongoose.Types.ObjectId(), nombre: 'Otro grupo QA', solicitud_id: undefined });
    const nuevos = await datos.Cargo.create([datos.cargo, datos.segundo].map((cargo) => ({ ...cargo, _id: new mongoose.Types.ObjectId(), campania: otra._id })));
    const otraSolicitud = { ...datos.agrupado, cargos: nuevos.map((cargo) => ({ cargo: String(cargo._id), version: 0 })) };
    const respuestas = await Promise.all([registrarMongo('/campanias/pagos-agrupados', datos.agrupado), registrarMongo('/campanias/pagos-agrupados', otraSolicitud)]);
    expect(respuestas.map((respuesta) => respuesta.status).sort()).toEqual([201, 409]);
    expect(await datos.Pago.countDocuments()).toBe(2);
    expect(await datos.Pago.countDocuments({ es_principal_grupo: true })).toBe(1);
  });

  test('agrupados campanias Mongo no inventa Bs para divisas y conserva comprobante privado compartido', async () => {
    const datos = await prepararAgrupado();
    const configAntes = await modelosMongo.alfa.TenantConfig.findOne({ key: 'default' }).lean();
    await modelosMongo.alfa.TenantConfig.updateOne({ key: 'default' }, { $set: { 'pagos.adicionales': [{ tipo: 'zelle', titular: 'QA', correo: 'qa@example.com' }] } });
    const { monto_pagado_bs, ...body } = datos.agrupado;
    const creado = await request(app).post('/campanias/pagos-agrupados').set('Authorization', `Bearer ${tokenPublicacion()}`)
      .field('cargos', JSON.stringify(body.cargos)).field('alumnoId', body.alumnoId).field('solicitud_id', body.solicitud_id)
      .field('moneda', 'USD').field('monto_pagado', '42.50').field('fecha_pago', body.fecha_pago)
      .field('metodo_pago', 'Zelle').field('referencia', 'ZELLE-GRUPO').field('estado', 'en_revision')
      .attach('comprobante', Buffer.from('%PDF-1.4\nQA agrupado'), { filename: 'grupo.pdf', contentType: 'application/pdf' });
    expect(creado.status).toBe(201);
    const urls = creado.body.pagos.map((pago) => pago.comprobante_url);
    expect(new Set(urls).size).toBe(1);
    expect(creado.body.pagos.every((pago) => pago.monto_pagado_bs === null && pago.agrupacion.monto_total_bs === null && pago.tasa === null)).toBe(true);
    const pago = creado.body.pagos[0];
    try {
      expect((await corregirMongo('get', `/campanias/${pago.campania}/cargos/${pago.cargo}/pagos/${pago._id}/comprobante`)).status).toBe(200);
      expect((await previsualizarCampanias()).body.summary.total_sistema_en_revision).toBe(0);
    } finally {
      await modelosMongo.alfa.TenantConfig.updateOne({ key: 'default' }, configAntes.pagos?.adicionales
        ? { $set: { 'pagos.adicionales': configAntes.pagos.adicionales } } : { $unset: { 'pagos.adicionales': '' } });
      await require('fs/promises').unlink(require('path').join(__dirname, '..', 'private-uploads', 'campanias', 'alfa', require('path').basename(urls[0])));
    }
  });

  const archivoConciliacion = Buffer.from('Referencia;Monto;Fecha\n123456;1000;10/11/2026\n654321;1000;10/11/2026\n');
  const previsualizarCampanias = (archivo = archivoConciliacion, rol = 'admin', tenant = 'alfa', nombre = 'banco.txt') => request(app)
    .post('/conciliacion/previsualizar?tipo_conciliacion=campanias').set('x-tenant', tenant)
    .set('Authorization', `Bearer ${jwt.sign({ rol, id: 'admin-qa', tenantId: tenant, permisos: ['conciliacion.manage'] }, 'qa-campanias-secret')}`)
    .attach('archivo', archivo, nombre);
  const prepararConciliacionCampanias = async () => {
    const datos = await prepararPagoMongo();
    const original = await modelosMongo.alfa.CampaniaCobro.findById(datos.id).lean();
    const otra = await modelosMongo.alfa.CampaniaCobro.create({ ...original, _id: new mongoose.Types.ObjectId(), nombre: 'Segunda campana QA',
      solicitud_id: undefined, participantes: [datos.atletas[1]._id],
      publicacion: { ...original.publicacion, participantes: 1, generales: 1, personalizados: 0, no_aplica: 0, total_esperado: 30 } });
    const segundoCargo = await datos.Cargo.create({ ...datos.cargo, _id: new mongoose.Types.ObjectId(), campania: otra._id,
      alumno: datos.atletas[1]._id, nombres: 'Segundo', apellidos: 'QA' });
    const primero = await registrarMongo(datos.ruta, datos.pagoBody);
    const segundo = await registrarMongo(`/campanias/${otra._id}/cargos/${segundoCargo._id}/pagos`, { ...datos.pagoBody, referencia: '654321' });
    expect(primero.status).toBe(201);
    expect(segundo.status).toBe(201);
    const preview = await previsualizarCampanias();
    expect(preview.status).toBe(200);
    const coincidencias = preview.body.match_total;
    const confirmacion = { tipo_conciliacion: 'campanias', pago_ids: coincidencias.map((fila) => fila.sistema.pago_id),
      revisiones: coincidencias.map((fila) => ({ pago_id: fila.sistema.pago_id, revision: fila.sistema.revision_pago })) };
    return { ...datos, otra, segundoCargo, primero: primero.body.pago, segundo: segundo.body.pago, preview: preview.body, confirmacion };
  };

  test('conciliacion campanias Mongo previsualiza todas las campanas y confirma sin descontar dos veces', async () => {
    const datos = await prepararConciliacionCampanias();
    expect(datos.preview.summary).toMatchObject({ total_sistema_en_revision: 2, match_total: 2 });
    expect(new Set(datos.preview.match_total.map((fila) => fila.sistema.campania_id)).size).toBe(2);
    expect(datos.preview.match_total.map((fila) => fila.sistema.contexto)).toContain('Campaña: Segunda campana QA');
    expect(await datos.Cargo.findById(datos.cargo._id).lean()).toMatchObject({ saldo_pendiente: 30 });
    const ruta = '/conciliacion/confirmar-match-total';
    expect((await registrarMongo(ruta, datos.confirmacion)).body).toMatchObject({ registros_actualizados: 2, tipo_conciliacion: 'campanias' });
    expect((await registrarMongo(ruta, datos.confirmacion)).body.registros_actualizados).toBe(0);
    expect(await datos.Cargo.findById(datos.cargo._id).lean()).toMatchObject({ saldo_pendiente: 20, estado: 'abono', __v: 2 });
    expect(await datos.Cargo.findById(datos.segundoCargo._id).lean()).toMatchObject({ saldo_pendiente: 20, __v: 2 });
    expect(await datos.Pago.findById(datos.primero._id).lean()).toMatchObject({ estado: 'confirmado', registrado_por: { id: 'admin-qa' },
      confirmado_por: { id: 'admin-qa', rol: 'admin' } });
    expect((await previsualizarCampanias()).body.summary.total_sistema_en_revision).toBe(0);
  });

  test('conciliacion campanias Mongo parciales requieren seleccion explicita', async () => {
    const datos = await prepararConciliacionCampanias();
    const parcial = await previsualizarCampanias(Buffer.from('Referencia;Monto;Fecha\n123456;1500;10/11/2026\n'));
    expect(parcial.status).toBe(200);
    expect(parcial.body.pago_ids_confirmables).toHaveLength(0);
    expect(parcial.body.match_parcial).toHaveLength(1);
    const sistema = parcial.body.match_parcial[0].sistema;
    const respuesta = await registrarMongo('/conciliacion/confirmar-match-total', { tipo_conciliacion: 'campanias',
      pago_ids: [sistema.pago_id], revisiones: [{ pago_id: sistema.pago_id, revision: sistema.revision_pago }] });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.registros_actualizados).toBe(1);
    expect(await datos.Pago.countDocuments({ estado: 'en_revision' })).toBe(1);
  });

  test('conciliacion campanias Mongo rechaza cambios posteriores, eliminados, tenant y seleccion invalida', async () => {
    const datos = await prepararConciliacionCampanias();
    const ruta = '/conciliacion/confirmar-match-total';
    expect((await registrarMongo(ruta, datos.confirmacion, 'admin', 'beta')).status).toBe(404);
    expect((await registrarMongo(ruta, { ...datos.confirmacion, revisiones: [] })).status).toBe(400);
    expect((await registrarMongo(ruta, { ...datos.confirmacion, pago_ids: [datos.primero._id, datos.primero._id] })).status).toBe(400);
    await datos.Pago.updateOne({ _id: datos.segundo._id }, { $set: { referencia: '999999' } });
    expect((await registrarMongo(ruta, datos.confirmacion)).status).toBe(409);
    expect(await datos.Pago.countDocuments({ estado: 'confirmado' })).toBe(0);
    expect(await datos.Cargo.findById(datos.cargo._id).lean()).toMatchObject({ saldo_pendiente: 30, __v: 1 });
    await datos.Pago.updateOne({ _id: datos.segundo._id }, { $set: { referencia: '654321', estado: 'eliminado' } });
    expect((await registrarMongo(ruta, datos.confirmacion)).status).toBe(409);
    expect(await datos.Pago.countDocuments({ estado: 'confirmado' })).toBe(0);
  });

  test('conciliacion campanias Mongo revierte lote si falla un cargo y admite reintento', async () => {
    const datos = await prepararConciliacionCampanias();
    const original = datos.Cargo.findOneAndUpdate.bind(datos.Cargo);
    const fallo = jest.spyOn(datos.Cargo, 'findOneAndUpdate').mockImplementationOnce((...args) => original(...args))
      .mockImplementationOnce(() => { throw new Error('Fallo QA segundo cargo'); });
    try { expect((await registrarMongo('/conciliacion/confirmar-match-total', datos.confirmacion)).status).toBe(500); }
    finally { fallo.mockRestore(); }
    expect(await datos.Pago.countDocuments({ estado: 'en_revision' })).toBe(2);
    expect(await datos.Cargo.findById(datos.cargo._id).lean()).toMatchObject({ saldo_pendiente: 30, __v: 1 });
    expect((await registrarMongo('/conciliacion/confirmar-match-total', datos.confirmacion)).body.registros_actualizados).toBe(2);
  });

  test('conciliacion campanias Mongo concurrente con confirmacion manual no duplica descuentos', async () => {
    const datos = await prepararConciliacionCampanias();
    const respuestas = await Promise.all([registrarMongo('/conciliacion/confirmar-match-total', datos.confirmacion),
      registrarMongo(`${datos.ruta}/${datos.primero._id}/confirmar`, {})]);
    expect(respuestas.map((respuesta) => respuesta.status)).toEqual([200, 200]);
    expect(await datos.Cargo.findById(datos.cargo._id).lean()).toMatchObject({ saldo_pendiente: 20, __v: 2 });
    expect(await datos.Pago.countDocuments({ estado: 'confirmado' })).toBe(2);
  });

  test('conciliacion campanias Mongo acepta Excel y conserva la moneda original de cada pago', async () => {
    const datos = await prepararConciliacionCampanias();
    const XLSX = require('xlsx');
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([
      ['Referencia', 'Monto', 'Fecha'], ['123456', 1000, '10/11/2026'], ['654321', 1000, '10/11/2026']
    ]), 'Banco');
    await datos.Pago.updateOne({ _id: datos.segundo._id }, { $set: { moneda: 'EUR' } });
    await datos.Cargo.updateOne({ _id: datos.segundoCargo._id }, { $set: { moneda: 'EUR' } });
    const respuesta = await previsualizarCampanias(XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' }), 'admin', 'alfa', 'banco.xlsx');
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.match_total).toHaveLength(2);
    expect(respuesta.body.match_total.map((fila) => fila.sistema.moneda).sort()).toEqual(['EUR', 'USD']);
  });

  test('conciliacion campanias Mongo excluye confirmados, eliminados, divisas sin Bs y campanas no abiertas', async () => {
    const datos = await prepararConciliacionCampanias();
    for (const estado of ['confirmado', 'eliminado']) {
      await datos.Pago.updateOne({ _id: datos.segundo._id }, { $set: { estado } });
      expect((await previsualizarCampanias()).body.summary.total_sistema_en_revision).toBe(1);
    }
    await datos.Pago.updateOne({ _id: datos.segundo._id }, { $set: { estado: 'en_revision', monto_pagado_bs: null, metodo_pago: 'Zelle' } });
    expect((await previsualizarCampanias()).body.summary.total_sistema_en_revision).toBe(1);
    await datos.Pago.updateOne({ _id: datos.segundo._id }, { $set: { monto_pagado_bs: 1000, metodo_pago: 'Transferencia' } });
    for (const estado of ['cerrada', 'cancelada', 'borrador']) {
      await modelosMongo.alfa.CampaniaCobro.updateOne({ _id: datos.otra._id }, { $set: { estado } });
      expect((await previsualizarCampanias()).body.summary.total_sistema_en_revision).toBe(1);
      expect((await registrarMongo('/conciliacion/confirmar-match-total', datos.confirmacion)).status).toBe(409);
    }
    expect(await datos.Pago.countDocuments({ estado: 'confirmado' })).toBe(0);
  });

  test('conciliacion campanias Mongo sin transacciones rechaza el lote sin guardar cambios', async () => {
    const datos = await prepararConciliacionCampanias();
    const sesion = { withTransaction: jest.fn(async () => { throw new Error('Transaction numbers are only allowed on a replica set member or mongos'); }),
      endSession: jest.fn(async () => {}) };
    const mock = jest.spyOn(datos.Cargo.db, 'startSession').mockResolvedValueOnce(sesion);
    try { expect((await registrarMongo('/conciliacion/confirmar-match-total', datos.confirmacion)).status).toBe(503); }
    finally { mock.mockRestore(); }
    expect(await datos.Pago.countDocuments({ estado: 'en_revision' })).toBe(2);
    expect(await datos.Cargo.findById(datos.cargo._id).lean()).toMatchObject({ saldo_pendiente: 30, __v: 1 });
  });

  test.each(['finanzas', 'asistente', 'entrenador', 'usuario'])('conciliacion campanias Mongo deniega %s aun con permiso de conciliacion', async (rol) => {
    const datos = await prepararConciliacionCampanias();
    expect((await previsualizarCampanias(archivoConciliacion, rol)).status).toBe(403);
    const auth = jwt.sign({ rol, id: 'qa', tenantId: 'alfa', permisos: ['conciliacion.manage'] }, 'qa-campanias-secret');
    expect((await request(app).post('/conciliacion/confirmar-match-total').set('Authorization', `Bearer ${auth}`).send(datos.confirmacion)).status).toBe(403);
    expect(await datos.Pago.countDocuments({ estado: 'confirmado' })).toBe(0);
  });

  const ajusteMongo = (datos, cambios = {}) => ({ accion: 'editar', alumno: String(datos.cargo.alumno),
    modalidad: 'personalizado', monto: 20, nota_interna: 'Acuerdo posterior QA', version: 2, version_cargo: 0,
    solicitud_id: '33000000-0000-4000-8000-000000000001', ...cambios });

  const cierreMongo = (cambios = {}) => ({ version: 2, solicitud_id: '44000000-0000-4000-8000-000000000001',
    motivo: 'Cierre administrativo QA', aceptar_saldo_pendiente: true, ...cambios });

  test('cierre Mongo manual conserva deuda, historial, auditoria privada e idempotencia', async () => {
    const datos = await prepararPagoMongo();
    const antes = await datos.Cargo.find({ campania: datos.id }).lean();
    expect((await registrarMongo(`${datos.base}/cerrar`, cierreMongo(), 'usuario')).status).toBe(403);
    expect((await registrarMongo(`${datos.base}/cerrar`, cierreMongo(), 'admin', 'beta')).status).toBe(404);
    expect((await registrarMongo(`${datos.base}/cerrar`, cierreMongo({ aceptar_saldo_pendiente: false }))).status).toBe(409);
    const cerrada = await registrarMongo(`${datos.base}/cerrar`, cierreMongo());
    expect(cerrada.status).toBe(200);
    expect(cerrada.body.campania.estado).toBe('cerrada');
    expect(cerrada.body.campania.cierre).toBeUndefined();
    expect((await registrarMongo(`${datos.base}/cerrar`, cierreMongo())).body.repetida).toBe(true);
    expect((await registrarMongo(datos.ruta, datos.pagoBody)).status).toBe(409);
    expect(await datos.Cargo.find({ campania: datos.id }).lean()).toEqual(antes);
    const auditada = await modelosMongo.alfa.CampaniaCobro.findById(datos.id).select('+cierre +historial_cierres').lean();
    expect(auditada.cierre).toMatchObject({ tipo: 'manual', saldo_pendiente: 42.5, actor: { id: 'admin-qa', rol: 'admin' } });
    expect(auditada.historial_cierres).toHaveLength(1);
    expect((await peticion('get', datos.ruta)).body.puede_corregir).toBe(false);
  });

  test('cierre Mongo manual bloquea revision y versiones antiguas sin alterar la campana', async () => {
    const datos = await prepararPagoMongo();
    expect((await registrarMongo(datos.ruta, datos.pagoBody)).status).toBe(201);
    expect((await registrarMongo(`${datos.base}/cerrar`, cierreMongo())).status).toBe(409);
    const response = await registrarMongo(`${datos.base}/cerrar`, cierreMongo({ version: 3 }));
    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/revision/);
    expect((await modelosMongo.alfa.CampaniaCobro.findById(datos.id)).estado).toBe('abierta');
  });

  test('cierre Mongo manual simultaneo con reporte no deja pagos en revision en una cerrada', async () => {
    const datos = await prepararPagoMongo();
    const respuestas = await Promise.all([registrarMongo(`${datos.base}/cerrar`, cierreMongo()), registrarMongo(datos.ruta, datos.pagoBody)]);
    expect([[200, 409], [409, 201]]).toContainEqual(respuestas.map((response) => response.status));
    const cerrada = (await modelosMongo.alfa.CampaniaCobro.findById(datos.id)).estado === 'cerrada';
    expect(await datos.Pago.countDocuments({ campania: datos.id, estado: 'en_revision' })).toBe(cerrada ? 0 : 1);
  });

  test.each(['confirmado', 'en_revision'])('cierre Mongo automatico tras ultimo pago %s excluye no aplica y conserva reintentos', async (estado) => {
    const datos = await prepararPagoMongo();
    const cargos = await datos.Cargo.find({ campania: datos.id, monto: { $gt: 0 } }).sort({ _id: 1 }).lean();
    const registros = [];
    for (const [indice, cargo] of cargos.entries()) {
      const ruta = `${datos.base}/cargos/${cargo._id}/pagos`;
      const body = { ...datos.pagoBody, estado, monto_pagado: cargo.monto, monto_pagado_bs: cargo.monto * 100,
        solicitud_id: `22000000-0000-4000-8000-00000000000${indice + 1}` };
      const registro = await registrarMongo(ruta, body);
      expect(registro.status).toBe(201);
      registros.push({ ruta, body, pagoId: registro.body.pago._id });
      if (indice === 0 || estado === 'en_revision') expect((await modelosMongo.alfa.CampaniaCobro.findById(datos.id)).estado).toBe('abierta');
    }
    if (estado === 'en_revision') {
      for (const registro of registros) expect((await registrarMongo(`${registro.ruta}/${registro.pagoId}/confirmar`, {})).status).toBe(200);
    }
    const cerrada = await modelosMongo.alfa.CampaniaCobro.findById(datos.id).select('+cierre').lean();
    expect(cerrada).toMatchObject({ estado: 'cerrada', cierre: { tipo: 'automatico', saldo_pendiente: 0 } });
    expect((await peticion('get', registros[1].ruta)).body.puede_corregir).toBe(true);
    const ultimo = registros.at(-1);
    expect((await registrarMongo(`${ultimo.ruta}/${ultimo.pagoId}/confirmar`, {})).body.repetida).toBe(true);
    expect((await registrarMongo(ultimo.ruta, ultimo.body)).status).toBe(estado === 'confirmado' ? 200 : 409);
    expect((await modelosMongo.alfa.CampaniaCobro.findById(datos.id)).__v).toBe(cerrada.__v);
    const cargo = await datos.Cargo.findById(cargos[1]._id).lean();
    expect((await corregirMongo('delete', `${ultimo.ruta}/${ultimo.pagoId}`, { version: cargo.__v })).status).toBe(200);
    expect((await modelosMongo.alfa.CampaniaCobro.findById(datos.id)).estado).toBe('abierta');
  });

  test('cierre Mongo automatico serializa los dos pagos finales concurrentes', async () => {
    const datos = await prepararPagoMongo();
    const cargos = await datos.Cargo.find({ campania: datos.id, monto: { $gt: 0 } }).lean();
    const respuestas = await Promise.all(cargos.map((cargo, indice) => registrarMongo(`${datos.base}/cargos/${cargo._id}/pagos`, {
      ...datos.pagoBody, estado: 'confirmado', monto_pagado: cargo.monto, monto_pagado_bs: cargo.monto * 100,
      solicitud_id: `22000000-0000-4000-8000-00000000000${indice + 1}`
    })));
    expect(respuestas.map((response) => response.status)).toEqual([201, 201]);
    expect((await modelosMongo.alfa.CampaniaCobro.findById(datos.id)).estado).toBe('cerrada');
    expect(await datos.Pago.countDocuments({ campania: datos.id, estado: 'confirmado' })).toBe(2);
  });

  test('cierre Mongo automatico al pasar la ultima deuda a no aplica respeta los cargos pagados', async () => {
    const datos = await prepararPagoMongo();
    expect((await registrarMongo(datos.ruta, { ...datos.pagoBody, estado: 'confirmado', monto_pagado: 30, monto_pagado_bs: 3000 })).status).toBe(201);
    const restante = await datos.Cargo.findOne({ campania: datos.id, modalidad: 'personalizado' }).lean();
    const ajuste = await registrarMongo(`${datos.base}/ajustes-cargos`, ajusteMongo(datos, {
      version: 3, alumno: String(restante.alumno), modalidad: 'no_aplica', monto: undefined
    }));
    expect(ajuste.status).toBe(200);
    expect((await modelosMongo.alfa.CampaniaCobro.findById(datos.id)).estado).toBe('cerrada');
    expect((await datos.Cargo.findById(datos.cargo._id)).saldo_pendiente).toBe(0);
  });

  test('ajustes cargos Mongo cambia pendiente sin pagos, conserva publicacion y audita sin recalcular otros cargos', async () => {
    const datos = await prepararPagoMongo();
    const { cargo, Cargo, Pago, base, id } = datos;
    const antes = await Cargo.find({ campania: id, _id: { $ne: cargo._id } }).lean();
    const original = await modelosMongo.alfa.CampaniaCobro.findById(id).lean();
    const ruta = `${base}/ajustes-cargos`;
    const body = ajusteMongo(datos);
    expect((await registrarMongo(ruta, body)).status).toBe(200);
    expect((await registrarMongo(ruta, body)).body.repetida).toBe(true);
    expect((await registrarMongo(ruta, { ...body, monto: 21 })).status).toBe(409);
    expect(await Cargo.findById(cargo._id).lean()).toMatchObject({ monto: 20, saldo_pendiente: 20, estado: 'pendiente', modalidad: 'personalizado', __v: 1 });
    expect(await Cargo.find({ campania: id, _id: { $ne: cargo._id } }).lean()).toEqual(antes);
    expect(await Pago.countDocuments()).toBe(0);
    const actual = await modelosMongo.alfa.CampaniaCobro.findById(id).select('+ajustes_cargos').lean();
    expect(actual.publicacion).toEqual(original.publicacion);
    expect(actual.totales_cargos).toMatchObject({ participantes: 3, total_esperado: 32.5 });
    expect(actual.ajustes_cargos).toHaveLength(1);
    expect(actual.ajustes_cargos[0]).toMatchObject({ accion: 'editar', actor: { id: 'admin-qa', rol: 'admin' },
      anterior: { monto: 30 }, nuevo: { monto: 20 } });
    const lectura = await peticion('get', `${base}/cargos`);
    expect(lectura.status).toBe(200);
    expect(lectura.body.totales.total_esperado).toBe(32.5);
    expect(lectura.body.campania.ajustes_cargos).toBeUndefined();
  });

  test.each(['en_revision', 'confirmado'])('ajustes cargos Mongo bloquea edicion y retiro con pago %s', async (estado) => {
    const datos = await prepararPagoMongo();
    expect((await registrarMongo(datos.ruta, { ...datos.pagoBody, estado })).status).toBe(201);
    const antes = await datos.Cargo.findById(datos.cargo._id).lean();
    const campaniaAntes = await modelosMongo.alfa.CampaniaCobro.findById(datos.id).lean();
    expect((await registrarMongo(`${datos.base}/ajustes-cargos`, ajusteMongo(datos, { version_cargo: 1 }))).status).toBe(409);
    expect((await registrarMongo(`${datos.base}/ajustes-cargos`, ajusteMongo(datos, { version_cargo: 1, accion: 'retirar', monto: undefined }))).status).toBe(409);
    expect(await datos.Cargo.findById(datos.cargo._id).lean()).toEqual(antes);
    expect(await modelosMongo.alfa.CampaniaCobro.findById(datos.id).lean()).toEqual(campaniaAntes);
  });

  test('ajustes cargos Mongo retira sin borrar y reincorpora con monto general de sede congelada', async () => {
    const datos = await prepararPagoMongo();
    const { Cargo, cargo, base, id } = datos;
    await modelosMongo.alfa.CampaniaCobro.updateOne({ _id: id }, { $set: { modalidad_monto: 'por_sede', monto_general: null,
      montos_por_sede: [{ sede: cargo.sede, monto: 30 }] } });
    await modeloReal(conexiones.alfa, 'Alumno').updateOne({ _id: cargo.alumno }, { $set: { sede: new mongoose.Types.ObjectId() } });
    expect((await registrarMongo(`${base}/ajustes-cargos`, ajusteMongo(datos, { accion: 'retirar', monto: undefined }))).status).toBe(200);
    expect(await Cargo.findById(cargo._id).lean()).toMatchObject({ retirado: true, monto: 0, saldo_pendiente: 0, modalidad: 'no_aplica', estado: 'no_aplica' });
    expect(await Cargo.countDocuments({ campania: id })).toBe(3);
    expect((await peticion('get', `${base}/cargos`)).body.totales.total_esperado).toBe(12.5);
    expect((await registrarMongo(`${base}/ajustes-cargos`, ajusteMongo(datos, { modalidad: 'general', monto: undefined, nota_interna: '',
      version: 3, version_cargo: 1, solicitud_id: '33000000-0000-4000-8000-000000000002' }))).status).toBe(200);
    expect(await Cargo.findById(cargo._id).lean()).toMatchObject({ retirado: false, monto: 30, saldo_pendiente: 30, modalidad: 'general', estado: 'pendiente', __v: 2 });
    expect((await peticion('get', `${base}/cargos`)).body.totales.total_esperado).toBe(42.5);
  });

  test('ajustes cargos Mongo agrega solo activos elegibles y no duplica con reintento', async () => {
    const datos = await prepararPagoMongo();
    const { Cargo, cargo, base, id } = datos;
    const nuevo = await crearAtletaMongo('alfa', { sede: cargo.sede });
    const inactivo = await crearAtletaMongo('alfa', { sede: cargo.sede, activo: false });
    const ajeno = await crearAtletaMongo('beta', { sede: sedesMongo.beta._id });
    const opciones = await peticion('get', `${base}/candidatos-cargos`);
    expect(opciones.status).toBe(200);
    expect(opciones.body.atletas.map((alumno) => alumno._id)).toContain(String(nuevo._id));
    expect(opciones.body.atletas.map((alumno) => alumno._id)).not.toContain(String(cargo.alumno));
    expect(opciones.body.atletas.map((alumno) => alumno._id)).not.toContain(String(inactivo._id));
    const body = ajusteMongo(datos, { accion: 'agregar', alumno: String(nuevo._id), modalidad: 'general', monto: undefined, nota_interna: '' });
    expect((await registrarMongo(`${base}/ajustes-cargos`, { ...body, alumno: String(inactivo._id) })).status).toBe(409);
    expect((await registrarMongo(`${base}/ajustes-cargos`, { ...body, alumno: String(ajeno._id) })).status).toBe(409);
    expect((await registrarMongo(`${base}/ajustes-cargos`, body)).status).toBe(200);
    expect((await registrarMongo(`${base}/ajustes-cargos`, body)).body.repetida).toBe(true);
    expect(await Cargo.countDocuments({ campania: id })).toBe(4);
    expect((await peticion('get', `${base}/cargos`)).body.totales).toMatchObject({ participantes: 4, total_esperado: 72.5 });
    expect((await registrarMongo(`${base}/ajustes-cargos`, { ...body, version: 3,
      solicitud_id: '33000000-0000-4000-8000-000000000002' })).status).toBe(409);
  });

  test.each(['cerrada', 'cancelada', 'borrador'])('ajustes cargos Mongo bloquea campana %s', async (estado) => {
    const datos = await prepararPagoMongo();
    await modelosMongo.alfa.CampaniaCobro.updateOne({ _id: datos.id }, { $set: { estado } });
    expect((await registrarMongo(`${datos.base}/ajustes-cargos`, ajusteMongo(datos))).status).toBe(409);
    expect((await peticion('get', `${datos.base}/candidatos-cargos`)).status).toBe(409);
    expect(await datos.Cargo.findById(datos.cargo._id).lean()).toMatchObject({ monto: 30, __v: 0 });
  });

  test('ajustes cargos Mongo valida tenant, versiones, importe y rollback de auditoria', async () => {
    const datos = await prepararPagoMongo();
    const ruta = `${datos.base}/ajustes-cargos`;
    const body = ajusteMongo(datos);
    expect((await registrarMongo(ruta, body, 'admin', 'beta')).status).toBe(404);
    expect((await registrarMongo(ruta, { ...body, version: 1 })).status).toBe(409);
    expect((await registrarMongo(ruta, { ...body, version_cargo: 1 })).status).toBe(409);
    for (const monto of [0, -1, '1.001', '1000000000', 'NaN']) {
      expect((await registrarMongo(ruta, { ...body, monto })).status).toBe(400);
    }
    const fallo = jest.spyOn(modelosMongo.alfa.CampaniaCobro, 'findOneAndUpdate').mockImplementationOnce(() => { throw new Error('Fallo QA auditoria'); });
    try { expect((await registrarMongo(ruta, body)).status).toBe(500); }
    finally { fallo.mockRestore(); }
    expect(await datos.Cargo.findById(datos.cargo._id).lean()).toMatchObject({ monto: 30, __v: 0 });
    expect((await registrarMongo(ruta, body)).status).toBe(200);
  });

  test('ajustes cargos Mongo ajuste concurrente con reporte no mezcla monto y reserva', async () => {
    const datos = await prepararPagoMongo();
    const respuestas = await Promise.all([registrarMongo(`${datos.base}/ajustes-cargos`, ajusteMongo(datos)),
      registrarMongo(datos.ruta, datos.pagoBody)]);
    expect([[200, 409], [409, 201]]).toContainEqual(respuestas.map((respuesta) => respuesta.status));
    const vigente = await datos.Cargo.findById(datos.cargo._id).lean();
    expect(vigente).toMatchObject({ monto: respuestas[0].status === 200 ? 20 : 30, __v: 1 });
    expect(await datos.Pago.countDocuments()).toBe(respuestas[1].status === 201 ? 1 : 0);
  });

  test('ajustes cargos Mongo permite cambiar pendiente cuando sus pagos fueron eliminados y conserva historial', async () => {
    const datos = await prepararPagoMongo();
    const registrado = await registrarMongo(datos.ruta, datos.pagoBody);
    expect(registrado.status).toBe(201);
    const pagoId = registrado.body.pago._id;
    expect((await corregirMongo('delete', `${datos.ruta}/${pagoId}`, { version: 1 })).status).toBe(200);
    expect((await registrarMongo(`${datos.base}/ajustes-cargos`, ajusteMongo(datos, { version: 4, version_cargo: 2 }))).status).toBe(200);
    expect(await datos.Cargo.findById(datos.cargo._id).lean()).toMatchObject({ monto: 20, saldo_pendiente: 20, estado: 'pendiente', __v: 3 });
    expect(await datos.Pago.findById(pagoId).lean()).toMatchObject({ estado: 'eliminado', monto_pagado: 10 });
  });

  test.each(['misma', 'distinta'])('ajustes cargos Mongo solicitudes concurrentes %s aplican un solo cambio', async (tipo) => {
    const datos = await prepararPagoMongo();
    const body = ajusteMongo(datos);
    const segunda = tipo === 'misma' ? body : { ...body, monto: 15, solicitud_id: '33000000-0000-4000-8000-000000000002' };
    const respuestas = await Promise.all([registrarMongo(`${datos.base}/ajustes-cargos`, body), registrarMongo(`${datos.base}/ajustes-cargos`, segunda)]);
    expect(respuestas.map((respuesta) => respuesta.status).sort()).toEqual(tipo === 'misma' ? [200, 200] : [200, 409]);
    expect(await datos.Cargo.findById(datos.cargo._id).lean()).toMatchObject({ __v: 1 });
    const vigente = await modelosMongo.alfa.CampaniaCobro.findById(datos.id).select('+ajustes_cargos').lean();
    expect(vigente.ajustes_cargos).toHaveLength(1);
    expect(vigente.ajustes_cargos[0].nuevo.__v).toBe(1);
  });

  test('correccion propia Mongo edita y elimina con reservas, reintentos y auditoria privada', async () => {
    const { cargo, ruta, pagoBody, Cargo, Pago, pedir, destino, pagoId, userId } = await prepararCorreccionPropia();
    const body = { ...pagoBody, version: 1, monto_pagado: 15, monto_pagado_bs: 1500,
      solicitud_id: '33000000-0000-4000-8000-000000000001', referencia: '654321' };
    const editado = await pedir('patch', destino, body);
    expect(editado.status).toBe(200);
    expect(editado.body.cargo).toMatchObject({ saldo_pendiente: 30, __v: 2 });
    expect(editado.body.pago).toMatchObject({ monto_pagado: 15, estado: 'en_revision', puede_corregir: true });
    expect(editado.body.pago.registrado_por.id).toBeUndefined();
    expect(editado.body.pago.modificaciones).toBeUndefined();
    expect(editado.body.pago.huella).toBeUndefined();
    expect((await pedir('patch', destino, body)).body.repetida).toBe(true);
    expect((await pedir('get', ruta)).body.totales).toMatchObject({ en_revision: 15, saldo_pendiente: 30, disponible: 15 });
    const auditado = await Pago.findById(pagoId).select('+modificaciones').lean();
    expect(auditado.modificaciones).toHaveLength(1);
    expect(auditado.modificaciones[0]).toMatchObject({ anterior: { monto_pagado: 10 }, actor: { id: String(userId), rol: 'usuario' } });
    const borrado = await pedir('delete', destino, { version: 2 });
    expect(borrado.status).toBe(200);
    expect(borrado.body.pago).toMatchObject({ estado: 'eliminado', puede_corregir: false });
    expect(borrado.body.pago.eliminado_por).toBeUndefined();
    expect(borrado.body.pago.modificaciones).toBeUndefined();
    expect((await pedir('delete', destino, { version: 2 })).body.repetida).toBe(true);
    expect((await pedir('get', ruta)).body).toMatchObject({ pagos: [], totales: { en_revision: 0, disponible: 30 } });
    expect(await Cargo.findById(cargo._id).lean()).toMatchObject({ saldo_pendiente: 30, __v: 3 });
    expect(await Pago.findById(pagoId).lean()).toMatchObject({ estado: 'eliminado', eliminado_por: { id: String(userId), rol: 'usuario' } });
  });

  test.each(['patch', 'delete'])('correccion propia Mongo %s protege autor, ultimo, version, estado, campana y tenant', async (method) => {
    const { ruta, pagoBody, Cargo, Pago, cargo, destino, pedir, auth, pagoId, id } = await prepararCorreccionPropia();
    const body = method === 'patch' ? { ...pagoBody, version: 1,
      solicitud_id: '33000000-0000-4000-8000-000000000001' } : { version: 1 };
    const otroId = new mongoose.Types.ObjectId();
    const rep = await modeloReal(conexiones.alfa, 'Representante').create({ nombres: 'Otro representante', apellidos: 'QA',
      cedula: `QA-CORRECCION-${method}`, usuario: otroId });
    await modeloReal(conexiones.alfa, 'Alumno').updateOne({ _id: cargo.alumno }, { $set: { representante: rep._id } });
    const otro = `Bearer ${jwt.sign({ rol: 'usuario', id: String(otroId), tenantId: 'alfa' }, 'qa-campanias-secret')}`;
    expect((await request(app)[method](destino).set('Authorization', otro).send(body)).status).toBe(403);
    const ajeno = `Bearer ${jwt.sign({ rol: 'usuario', id: String(new mongoose.Types.ObjectId()), tenantId: 'alfa' }, 'qa-campanias-secret')}`;
    expect((await request(app)[method](destino).set('Authorization', ajeno).send(body)).status).toBe(404);
    expect((await request(app)[method](destino).set('x-tenant', 'beta').set('Authorization', auth).send(body)).status).toBe(403);
    expect((await pedir(method, destino, { ...body, version: 0 })).status).toBe(409);
    expect((await pedir('patch', destino, { ...pagoBody, version: 1, estado: 'confirmado' })).status).toBe(403);
    const segundo = await registrarMongo(ruta, { ...pagoBody, version: 1,
      solicitud_id: '22000000-0000-4000-8000-000000000002' });
    expect(segundo.status).toBe(201);
    expect((await pedir(method, destino, { ...body, version: 2 })).status).toBe(409);
    const adminDestino = `${ruta}/${segundo.body.pago._id}`;
    expect((await pedir(method, adminDestino, { ...body, version: 2 })).status).toBe(403);
    expect((await corregirMongo('delete', adminDestino, { version: 2 })).status).toBe(200);
    await modelosMongo.alfa.CampaniaCobro.updateOne({ _id: id }, { $set: { estado: 'cerrada' } });
    expect((await pedir(method, destino, { ...body, version: 3 })).status).toBe(409);
    await modelosMongo.alfa.CampaniaCobro.updateOne({ _id: id }, { $set: { estado: 'abierta' } });
    expect((await registrarMongo(`${destino}/confirmar`, {})).status).toBe(200);
    expect((await pedir(method, destino, { ...body, version: 4 })).status).toBe(409);
    expect(await Cargo.findById(cargo._id).lean()).toMatchObject({ saldo_pendiente: 20, __v: 4 });
    expect(await Pago.findById(pagoId).lean()).toMatchObject({ estado: 'confirmado', monto_pagado: 10, referencia: pagoBody.referencia });
  });

  test('portal representante Mongo reporta reserva propia y admin confirma sin revelar notas o auditoria', async () => {
    const { cargo, ruta, pagoBody, Cargo, Pago, id } = await prepararPagoMongo();
    const Alumno = modeloReal(conexiones.alfa, 'Alumno');
    const Representante = modeloReal(conexiones.alfa, 'Representante');
    const userId = new mongoose.Types.ObjectId();
    const rep = await Representante.create({ nombres: 'Representante QA', apellidos: 'Temporal', cedula: 'QA-PORTAL-123', usuario: userId });
    await Alumno.updateOne({ _id: cargo.alumno }, { $set: { representante: rep._id }, $unset: { usuario: '' } });
    await Cargo.updateOne({ _id: cargo._id }, { $set: { nota_interna: 'Acuerdo privado' } });
    const auth = `Bearer ${jwt.sign({ rol: 'usuario', id: String(userId), tenantId: 'alfa' }, 'qa-campanias-secret')}`;
    const leer = (url) => request(app).get(url).set('Authorization', auth);
    expect((await leer(`/campanias/mis-cargos?alumnoId=${cargo.alumno}`)).body.cargos).toHaveLength(1);
    const adjuntar = () => {
      let req = request(app).post(ruta).set('Authorization', auth);
      for (const [campo, valor] of Object.entries(pagoBody)) req = req.field(campo, String(valor));
      return req.attach('comprobante', Buffer.from('%PDF-1.4\nQA'), { filename: 'qa.pdf', contentType: 'application/pdf' });
    };
    let archivo;
    try {
      const creado = await adjuntar();
      expect(creado.status).toBe(201);
      archivo = require('path').join(__dirname, '..', 'private-uploads', 'campanias', 'alfa', require('path').basename(creado.body.pago.comprobante_url));
      expect(creado.body.cargo).toMatchObject({ saldo_pendiente: 30, __v: 1 });
      expect(creado.body.cargo.nota_interna).toBeUndefined();
      expect(creado.body.pago).toMatchObject({ estado: 'en_revision', registrado_por: { rol: 'usuario' } });
      expect(creado.body.pago.registrado_por.id).toBeUndefined();
      expect((await Pago.findById(creado.body.pago._id)).registrado_por.id).toBe(String(userId));
      expect((await adjuntar()).status).toBe(200);
      expect(await Pago.countDocuments({ cargo: cargo._id })).toBe(1);
      const listado = await leer(`/campanias/mis-cargos?alumnoId=${cargo.alumno}`);
      expect(listado.body.cargos[0]).toMatchObject({ pago_en_revision: true, disponible: 20 });
      expect(JSON.stringify(listado.body)).not.toMatch(/Acuerdo privado|solicitud_id|actor/);
      const descarga = `${ruta}/${creado.body.pago._id}/comprobante`;
      expect((await leer(descarga)).status).toBe(200);
      expect((await request(app).get(descarga)).status).toBe(401);
      const ajeno = `Bearer ${jwt.sign({ rol: 'usuario', id: String(new mongoose.Types.ObjectId()), tenantId: 'alfa' }, 'qa-campanias-secret')}`;
      expect((await request(app).get(descarga).set('Authorization', ajeno)).status).toBe(404);
      expect((await request(app).post(ruta).set('Authorization', ajeno).send(pagoBody)).status).toBe(404);
      expect((await request(app).post(ruta).set('Authorization', auth).send({ ...pagoBody, estado: 'confirmado' })).status).toBe(403);
      expect((await request(app).get(ruta).set('x-tenant', 'beta').set('Authorization', auth)).status).toBe(403);
      expect((await registrarMongo(`${ruta}/${creado.body.pago._id}/confirmar`, {})).status).toBe(200);
      const historial = await leer(ruta);
      expect(historial.body.totales).toEqual({ confirmado: 10, en_revision: 0, saldo_pendiente: 20, disponible: 20 });
      expect(historial.body.pagos[0].confirmado_por.id).toBeUndefined();
      expect(await Cargo.findById(cargo._id)).toMatchObject({ saldo_pendiente: 20, estado: 'abono' });
      await modelosMongo.alfa.CampaniaCobro.updateOne({ _id: id }, { $set: { estado: 'cerrada' } });
      expect((await leer(ruta)).status).toBe(200);
      expect((await request(app).post(ruta).set('Authorization', auth).send({ ...pagoBody, version: 2 })).status).toBe(409);
    } finally { if (archivo) await require('fs/promises').unlink(archivo).catch(() => {}); }
  });

  test('pagos campania Mongo separa revision de deuda y confirma una sola vez', async () => {
    const { Cargo, Pago, cargo, ruta, pagoBody } = await prepararPagoMongo();
    const respuesta = await registrarMongo(ruta, pagoBody);
    expect(respuesta.status).toBe(201);
    expect(respuesta.body.cargo).toMatchObject({ saldo_pendiente: 30, estado: 'pendiente', __v: 1 });
    expect(respuesta.body.pago).toMatchObject({ monto_pagado: 10, estado: 'en_revision', tasa: 100, registrado_por: { id: 'admin-qa' } });
    expect(respuesta.body.pago.huella).toBeUndefined();
    expect((await registrarMongo(ruta, pagoBody)).status).toBe(200);
    expect((await registrarMongo(ruta, { ...pagoBody, monto_pagado: 9, monto_pagado_bs: 900 })).status).toBe(409);
    const historial = await peticion('get', ruta);
    expect(historial.body.totales).toEqual({ confirmado: 0, en_revision: 10, saldo_pendiente: 30, disponible: 20 });
    const lecturaEnRevision = await peticion('get', `${ruta.split('/cargos/')[0]}/cargos`);
    expect(lecturaEnRevision.status).toBe(200);
    expect(lecturaEnRevision.body.filas.find((fila) => fila._id === String(cargo._id))).toMatchObject({
      pago_en_revision: true, estado: 'pendiente', saldo_pendiente: 30 });
    const confirmar = `${ruta}/${respuesta.body.pago._id}/confirmar`;
    const confirmaciones = await Promise.all([registrarMongo(confirmar, {}), registrarMongo(confirmar, {})]);
    expect(confirmaciones.map((item) => item.status)).toEqual([200, 200]);
    expect(await Cargo.findById(cargo._id).lean()).toMatchObject({ saldo_pendiente: 20, estado: 'abono', __v: 2 });
    const lecturaConfirmada = await peticion('get', `${ruta.split('/cargos/')[0]}/cargos`);
    expect(lecturaConfirmada.body.filas.find((fila) => fila._id === String(cargo._id))).toMatchObject({
      pago_en_revision: false, estado: 'abono', saldo_pendiente: 20 });
    expect(await Pago.countDocuments({ cargo: cargo._id })).toBe(1);
    const completo = await registrarMongo(ruta, { ...pagoBody, version: 2, solicitud_id: '22000000-0000-4000-8000-000000000002',
      monto_pagado: 20, monto_pagado_bs: 2000, estado: 'confirmado' });
    expect(completo.status).toBe(201);
    expect(completo.body.cargo).toMatchObject({ saldo_pendiente: 0, estado: 'pagado', __v: 3 });
    const cargos = await peticion('get', `${ruta.split('/cargos/')[0]}/cargos`);
    expect(cargos.status).toBe(200);
    expect(cargos.body.filas.find((fila) => fila._id === String(cargo._id))).toMatchObject({ version: 3,
      permitir_abonos: true, monto: 30, saldo_pendiente: 0, estado: 'pagado' });
    expect((await peticion('get', ruta)).body.totales).toEqual({ confirmado: 30, en_revision: 0, saldo_pendiente: 0, disponible: 0 });
  });

  test.each(['misma', 'distinta'])('pagos campania Mongo concurrencia %s no duplica ni sobrepaga', async (tipo) => {
    const { Cargo, Pago, cargo, ruta, pagoBody } = await prepararPagoMongo();
    const body = { ...pagoBody, monto_pagado: 30, monto_pagado_bs: 3000, estado: 'confirmado' };
    const segunda = tipo === 'misma' ? body : { ...body, solicitud_id: '22000000-0000-4000-8000-000000000002' };
    const respuestas = await Promise.all([registrarMongo(ruta, body), registrarMongo(ruta, segunda)]);
    expect(respuestas.map((item) => item.status).sort()).toEqual(tipo === 'misma' ? [200, 201] : [201, 409]);
    expect(await Pago.countDocuments()).toBe(1);
    expect(await Cargo.findById(cargo._id).lean()).toMatchObject({ saldo_pendiente: 0, __v: 1 });
  });

  test('pagos campania Mongo valida saldo, tasa, version, abonos, roles y tenant', async () => {
    const { Cargo, cargo, ruta, pagoBody, base } = await prepararPagoMongo();
    for (const rol of ['entrenador', 'asistente', 'finanzas']) expect((await registrarMongo(ruta, pagoBody, rol)).status).toBe(403);
    expect((await registrarMongo(ruta, pagoBody, 'usuario')).status).toBe(404);
    expect((await registrarMongo(ruta, pagoBody, 'admin', 'beta')).status).toBe(404);
    expect((await registrarMongo(ruta, { ...pagoBody, version: 1 })).status).toBe(409);
    expect((await registrarMongo(ruta, { ...pagoBody, monto_pagado: 31, monto_pagado_bs: 3100 })).status).toBe(409);
    expect((await registrarMongo(ruta, { ...pagoBody, monto_pagado_bs: 1100 })).status).toBe(409);
    expect((await registrarMongo(ruta, { ...pagoBody, monto_pagado: 0 })).status).toBe(400);
    expect((await registrarMongo(ruta, { ...pagoBody, fecha_pago: '2026-02-30' })).status).toBe(400);
    expect((await registrarMongo(ruta, { ...pagoBody, saldo_pendiente: 0 })).status).toBe(400);
    const noAplica = await Cargo.findOne({ modalidad: 'no_aplica' }).lean();
    expect((await registrarMongo(`${base}/cargos/${noAplica._id}/pagos`, pagoBody)).status).toBe(409);
    await Cargo.updateOne({ _id: cargo._id }, { $set: { permitir_abonos: false } });
    expect((await registrarMongo(ruta, pagoBody)).status).toBe(409);
    expect((await registrarMongo(ruta, { ...pagoBody, monto_pagado: 30, monto_pagado_bs: 3000, estado: 'confirmado' })).status).toBe(201);
  });

  test('pagos campania Mongo reserva revision y revierte saldo si falla el guardado', async () => {
    const { Cargo, Pago, cargo, ruta, pagoBody } = await prepararPagoMongo();
    const falloGuardado = jest.spyOn(Cargo, 'findOneAndUpdate').mockImplementationOnce(() => { throw new Error('Fallo QA'); });
    try { expect((await registrarMongo(ruta, { ...pagoBody, estado: 'confirmado' })).status).toBe(500); }
    finally { falloGuardado.mockRestore(); }
    expect(await Pago.countDocuments()).toBe(0);
    expect(await Cargo.findById(cargo._id).lean()).toMatchObject({ saldo_pendiente: 30, __v: 0 });
    expect((await registrarMongo(ruta, { ...pagoBody, monto_pagado: 25, monto_pagado_bs: 2500 })).status).toBe(201);
    expect((await registrarMongo(ruta, { ...pagoBody, version: 1, solicitud_id: '22000000-0000-4000-8000-000000000002' })).status).toBe(409);
    expect(await Pago.countDocuments()).toBe(1);
  });

  test('pagos campania Mongo rechaza comprobantes falsos y campos no permitidos', async () => {
    const { ruta, pagoBody, Pago } = await prepararPagoMongo();
    const adjuntar = (archivo, nombre, mime) => {
      let req = request(app).post(ruta).set('Authorization', `Bearer ${tokenPublicacion()}`);
      for (const [campo, valor] of Object.entries(pagoBody)) req = req.field(campo, String(valor));
      return req.attach('comprobante', archivo, { filename: nombre, contentType: mime });
    };
    expect((await adjuntar(Buffer.from('falso'), 'qa.png', 'image/png')).status).toBe(400);
    expect((await adjuntar(Buffer.from('<svg/>'), 'qa.svg', 'image/svg+xml')).status).toBe(400);
    expect(await Pago.countDocuments()).toBe(0);
  });

  test.each(['Zelle', 'PayPal', 'Binance'])('pagos campania Mongo registra %s configurado sin inventar bolivares', async (metodo) => {
    const { ruta, pagoBody, Pago } = await prepararPagoMongo();
    const body = { ...pagoBody, metodo_pago: metodo, referencia: 'TX-CAMPANIA', monto_pagado_bs: undefined, estado: 'confirmado' };
    expect((await registrarMongo(ruta, body)).status).toBe(400);
    await modelosMongo.alfa.TenantConfig.updateOne({ key: 'default' }, { $set: { 'pagos.adicionales': [
      { tipo: metodo.toLowerCase(), titular: 'QA', correo: 'qa@example.com', habilitado: true }
    ] } });
    const response = await registrarMongo(ruta, body);
    expect(response.status).toBe(201);
    expect(response.body.pago).toMatchObject({ metodo_pago: metodo, monto_pagado_bs: null, tasa: null, estado: 'confirmado' });
    expect(await Pago.countDocuments()).toBe(1);
    await modelosMongo.alfa.TenantConfig.updateOne({ key: 'default' }, { $set: { 'pagos.adicionales': [] } });
  });

  test('pagos campania Mongo limpia comprobante si falla y conserva uno solo en reintentos', async () => {
    const { Cargo, ruta, pagoBody, Pago } = await prepararPagoMongo();
    const archivos = require('fs/promises');
    const mkdir = jest.spyOn(archivos, 'mkdir').mockResolvedValue(undefined);
    const escribir = jest.spyOn(archivos, 'writeFile').mockResolvedValue(undefined);
    const borrar = jest.spyOn(archivos, 'unlink').mockResolvedValue(undefined);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jK1sAAAAASUVORK5CYII=', 'base64');
    const adjuntar = () => {
      let req = request(app).post(ruta).set('Authorization', `Bearer ${tokenPublicacion()}`);
      for (const [campo, valor] of Object.entries(pagoBody)) req = req.field(campo, String(valor));
      return req.attach('comprobante', png, { filename: 'qa.png', contentType: 'image/png' });
    };
    const falloCargo = jest.spyOn(Cargo, 'findOneAndUpdate').mockImplementationOnce(() => { throw new Error('Fallo QA'); });
    try {
      expect((await adjuntar()).status).toBe(500);
      expect(borrar).toHaveBeenCalledTimes(1);
      expect(await Pago.countDocuments()).toBe(0);
      falloCargo.mockRestore();
      const primera = await adjuntar();
      expect(primera.status).toBe(201);
      expect(primera.body.pago.comprobante_url).toMatch(/^\/archivos-campania\/alfa\/[a-f0-9-]+\.png$/);
      const repetida = await adjuntar();
      expect(repetida.status).toBe(200);
      expect(repetida.body.pago.comprobante_url).toBe(primera.body.pago.comprobante_url);
      expect(escribir).toHaveBeenCalledTimes(2);
      expect(await Pago.countDocuments()).toBe(1);
    } finally { falloCargo.mockRestore(); mkdir.mockRestore(); escribir.mockRestore(); borrar.mockRestore(); }
  });

  test.each(['en_revision', 'confirmado'])('correccion campania Mongo edita y elimina ultimo pago %s sin perder auditoria', async (estado) => {
    const { Cargo, Pago, cargo, ruta, pagoBody } = await prepararPagoMongo();
    const creado = await registrarMongo(ruta, { ...pagoBody, estado });
    expect(creado.status).toBe(201);
    const destino = `${ruta}/${creado.body.pago._id}`;
    const body = { ...pagoBody, estado, version: 1, solicitud_id: '33000000-0000-4000-8000-000000000001',
      monto_pagado: 15, monto_pagado_bs: 1500, telefono_pago: '4121234567', cedula_titular: 'V-12345678', nota: 'Correccion QA' };
    const editar = () => corregirMongo('patch', destino, body);
    const editado = await editar();
    expect(editado.status).toBe(200);
    expect(editado.body.cargo).toMatchObject({ saldo_pendiente: estado === 'confirmado' ? 15 : 30, __v: 2 });
    expect(editado.body.pago).toMatchObject({ monto_pagado: 15, tasa: 100, nota: 'Correccion QA' });
    expect(editado.body.pago.modificaciones).toBeUndefined();
    expect((await editar()).body.repetida).toBe(true);
    expect((await corregirMongo('patch', destino, { ...body, nota: 'Otra correccion' })).status).toBe(409);
    const auditado = await Pago.findById(creado.body.pago._id).select('+modificaciones').lean();
    expect(auditado.modificaciones).toHaveLength(1);
    expect(auditado.modificaciones[0]).toMatchObject({ anterior: { monto_pagado: 10 }, actor: { id: 'admin-qa' } });
    const borrado = await corregirMongo('delete', destino, { version: 2 });
    expect(borrado.status).toBe(200);
    expect(borrado.body.cargo).toMatchObject({ saldo_pendiente: 30, estado: 'pendiente', __v: 3 });
    expect((await corregirMongo('delete', destino, { version: 2 })).body.repetida).toBe(true);
    expect((await peticion('get', ruta)).body).toMatchObject({ pagos: [], totales: { confirmado: 0, en_revision: 0, disponible: 30 } });
    expect(await Cargo.findById(cargo._id).lean()).toMatchObject({ saldo_pendiente: 30, __v: 3 });
    expect(await Pago.findById(creado.body.pago._id).lean()).toMatchObject({ estado: 'eliminado', eliminado_por: { id: 'admin-qa' } });
    expect((await registrarMongo(`${destino}/confirmar`, {})).status).toBe(409);
    expect((await registrarMongo(ruta, { ...pagoBody, estado })).status).toBe(409);
  });

  test('correccion campania Mongo protege ultimo pago, saldo, version, estado, rol y tenant', async () => {
    const { ruta, pagoBody } = await prepararPagoMongo();
    const primero = await registrarMongo(ruta, { ...pagoBody, estado: 'confirmado' });
    const segundo = await registrarMongo(ruta, { ...pagoBody, version: 1, solicitud_id: '22000000-0000-4000-8000-000000000002' });
    const anterior = `${ruta}/${primero.body.pago._id}`;
    const destino = `${ruta}/${segundo.body.pago._id}`;
    const body = { ...pagoBody, version: 2, solicitud_id: '33000000-0000-4000-8000-000000000001' };
    expect((await corregirMongo('patch', anterior, { ...body, estado: 'confirmado' })).status).toBe(409);
    expect((await corregirMongo('delete', anterior, { version: 2 })).status).toBe(409);
    expect((await corregirMongo('patch', destino, { ...body, version: 1 })).status).toBe(409);
    expect((await corregirMongo('patch', destino, { ...body, monto_pagado: 21, monto_pagado_bs: 2100 })).status).toBe(409);
    expect((await corregirMongo('patch', destino, { ...body, estado: 'confirmado' })).status).toBe(400);
    expect((await corregirMongo('patch', destino, { ...body, monto_pagado_bs: 900 })).status).toBe(409);
    expect((await request(app).delete(destino).set('Authorization', `Bearer ${tokenPublicacion('usuario')}`).send({ version: 2 })).status).toBe(404);
    expect((await request(app).patch(destino).set('x-tenant', 'beta').set('Authorization', `Bearer ${tokenPublicacion('admin', 'beta')}`).send(body)).status).toBe(404);
  });

  test('correccion campania Mongo revierte ambos documentos si falla el pago y serializa eliminaciones', async () => {
    const { Cargo, Pago, cargo, ruta, pagoBody } = await prepararPagoMongo();
    const creado = await registrarMongo(ruta, { ...pagoBody, estado: 'confirmado' });
    const destino = `${ruta}/${creado.body.pago._id}`;
    const falloPago = jest.spyOn(Pago, 'findOneAndUpdate').mockImplementationOnce(() => { throw new Error('Fallo QA'); });
    try { expect((await corregirMongo('delete', destino, { version: 1 })).status).toBe(500); }
    finally { falloPago.mockRestore(); }
    expect(await Cargo.findById(cargo._id).lean()).toMatchObject({ saldo_pendiente: 20, __v: 1 });
    expect(await Pago.findById(creado.body.pago._id).lean()).toMatchObject({ estado: 'confirmado' });
    const respuestas = await Promise.all([corregirMongo('delete', destino, { version: 1 }), corregirMongo('delete', destino, { version: 1 })]);
    expect(respuestas.map((item) => item.status)).toEqual([200, 200]);
    expect(await Cargo.findById(cargo._id).lean()).toMatchObject({ saldo_pendiente: 30, __v: 2 });
  });

  test('correccion campania Mongo respeta pago completo y bloquea campana cerrada', async () => {
    const { Cargo, cargo, ruta, pagoBody, id } = await prepararPagoMongo();
    await Cargo.updateOne({ _id: cargo._id }, { $set: { permitir_abonos: false } });
    const creado = await registrarMongo(ruta, { ...pagoBody, monto_pagado: 30, monto_pagado_bs: 3000, estado: 'confirmado' });
    const destino = `${ruta}/${creado.body.pago._id}`;
    const body = { ...pagoBody, estado: 'confirmado', version: 1, solicitud_id: '33000000-0000-4000-8000-000000000001' };
    expect((await corregirMongo('patch', destino, body)).status).toBe(409);
    expect((await corregirMongo('patch', destino, { ...body, monto_pagado: 30, monto_pagado_bs: 3000, nota: 'Solo metadata' })).status).toBe(200);
    await modelosMongo.alfa.CampaniaCobro.updateOne({ _id: id }, { $set: { estado: 'cerrada' } });
    expect((await corregirMongo('delete', destino, { version: 2 })).status).toBe(409);
    expect((await corregirMongo('patch', destino, { ...body, version: 2, solicitud_id: '33000000-0000-4000-8000-000000000002' })).status).toBe(409);
    expect((await peticion('get', ruta)).status).toBe(200);
    expect(await Cargo.findById(cargo._id).lean()).toMatchObject({ saldo_pendiente: 0, __v: 2 });
  });

  test('correccion campania Mongo dos ediciones concurrentes no aplican importes dos veces', async () => {
    const { Cargo, Pago, cargo, ruta, pagoBody } = await prepararPagoMongo();
    const creado = await registrarMongo(ruta, { ...pagoBody, estado: 'confirmado' });
    const destino = `${ruta}/${creado.body.pago._id}`;
    const body = { ...pagoBody, estado: 'confirmado', version: 1, monto_pagado: 15, monto_pagado_bs: 1500,
      solicitud_id: '33000000-0000-4000-8000-000000000001' };
    const respuestas = await Promise.all([corregirMongo('patch', destino, body), corregirMongo('patch', destino, body)]);
    expect(respuestas.map((item) => item.status)).toEqual([200, 200]);
    expect(respuestas.filter((item) => item.body.repetida)).toHaveLength(1);
    expect(await Cargo.findById(cargo._id).lean()).toMatchObject({ saldo_pendiente: 15, __v: 2 });
    expect((await Pago.findById(creado.body.pago._id).select('+modificaciones').lean()).modificaciones).toHaveLength(1);
  });

  test('correccion campania Mongo reemplaza comprobante y limpia solo archivo nuevo ante rollback', async () => {
    const { Cargo, Pago, cargo, ruta, pagoBody } = await prepararPagoMongo();
    const creado = await registrarMongo(ruta, pagoBody);
    const destino = `${ruta}/${creado.body.pago._id}`;
    const archivos = require('fs/promises');
    const mkdir = jest.spyOn(archivos, 'mkdir').mockResolvedValue(undefined);
    const escribir = jest.spyOn(archivos, 'writeFile').mockResolvedValue(undefined);
    const borrar = jest.spyOn(archivos, 'unlink').mockResolvedValue(undefined);
    const body = { ...pagoBody, version: 1, solicitud_id: '33000000-0000-4000-8000-000000000001' };
    const adjuntar = (buffer, filename, contentType) => {
      let req = request(app).patch(destino).set('Authorization', `Bearer ${tokenPublicacion()}`);
      for (const [campo, valor] of Object.entries(body)) req = req.field(campo, String(valor));
      return req.attach('comprobante', buffer, { filename, contentType });
    };
    const png = Buffer.from('89504e470d0a1a0a', 'hex');
    const falloPago = jest.spyOn(Pago, 'findOneAndUpdate').mockImplementationOnce(() => { throw new Error('Fallo QA'); });
    try {
      expect((await adjuntar(png, 'qa.png', 'image/png')).status).toBe(500);
      expect(borrar).toHaveBeenCalledTimes(1);
      expect(await Cargo.findById(cargo._id).lean()).toMatchObject({ saldo_pendiente: 30, __v: 1 });
      falloPago.mockRestore();
      expect((await adjuntar(Buffer.from('falso'), 'qa.png', 'image/png')).status).toBe(400);
      const editado = await adjuntar(png, 'qa.png', 'image/png');
      expect(editado.status).toBe(200);
      expect(editado.body.pago.comprobante_url).toMatch(/^\/archivos-campania\/alfa\/[a-f0-9-]+\.png$/);
      expect((await adjuntar(png, 'qa.png', 'image/png')).body.repetida).toBe(true);
      expect(escribir).toHaveBeenCalledTimes(2);
      expect(borrar).toHaveBeenCalledTimes(1);
    } finally { falloPago.mockRestore(); mkdir.mockRestore(); escribir.mockRestore(); borrar.mockRestore(); }
  });

  const prepararFamiliaMongo = async ({ unidad = 'representante', distintasSedes = false, monto = 10 } = {}) => {
    const sede = await modelosMongo.alfa.Sede.create({ nombre: `Familia QA ${new mongoose.Types.ObjectId()}`, direccion: 'Temporal', costo: 20 });
    const otraSede = distintasSedes
      ? await modelosMongo.alfa.Sede.create({ nombre: `Familia segunda sede QA ${new mongoose.Types.ObjectId()}`, direccion: 'Temporal', costo: 20 }) : sede;
    const Representante = modeloReal(conexiones.alfa, 'Representante');
    const usuario = new mongoose.Types.ObjectId();
    const representante = await Representante.create({ nombres: 'Maria', apellidos: 'Familia QA',
      cedula: new mongoose.Types.ObjectId().toString(), usuario });
    const atletas = await Promise.all([
      crearAtletaMongo('alfa', { nombres: 'Ana', sede: sede._id, representante: representante._id }),
      crearAtletaMongo('alfa', { nombres: 'Luis', sede: otraSede._id, representante: representante._id }),
      crearAtletaMongo('alfa', { nombres: 'Eva', sede: sede._id }),
      crearAtletaMongo('alfa', { nombres: 'Leo', sede: sede._id })
    ]);
    const creada = await peticion('post', '/campanias', { ...datosMongo(), unidad_cobro: unidad,
      solicitud_id: require('crypto').randomUUID(), monto_general: distintasSedes ? null : monto,
      modalidad_monto: distintasSedes ? 'por_sede' : 'unico',
      sedes: [...new Set([String(sede._id), String(otraSede._id)])],
      montos_por_sede: distintasSedes ? [{ sede: String(sede._id), monto: 10 }, { sede: String(otraSede._id), monto: 20 }] : [] });
    expect(creada.status).toBe(201);
    const base = `/campanias/${creada.body.campania._id}`;
    const resumen = await peticion('get', `${base}/resumen`);
    expect(resumen.status).toBe(200);
    const publicar = async (preview = resumen.body) => {
      const resultado = await publicarMongo(base, { version: preview.campania.__v, revision: preview.revision,
        solicitud_id: require('crypto').randomUUID() });
      return resultado;
    };
    const auth = `Bearer ${jwt.sign({ rol: 'usuario', id: String(usuario), tenantId: 'alfa' }, 'qa-campanias-secret')}`;
    const propio = (method, ruta, body) => request(app)[method](ruta).set('Authorization', auth).send(body);
    return { base, atletas, representante, usuario, propio, publicar, resumen: resumen.body,
      Cargo: modeloReal(conexiones.alfa, 'CargoCampania'), Alumno: modeloReal(conexiones.alfa, 'Alumno'),
      Pago: modeloReal(conexiones.alfa, 'PagoCampania'), Representante };
  };

  test('familias Mongo publica un cobro compartido y dos individuales sin representante, sin duplicar saldos', async () => {
    const datos = await prepararFamiliaMongo();
    expect(datos.resumen.totales).toMatchObject({ participantes: 4, cobros: 3, representantes: 1, individuales: 2, total_esperado: 30 });
    const familia = datos.resumen.filas.find((fila) => fila.tipo_cobro === 'representante');
    expect(familia.atletas_cubiertos.map((atleta) => atleta.nombres).sort()).toEqual(['Ana', 'Luis']);
    expect(familia).toMatchObject({ nombre_representante: 'Maria Familia QA', monto: 10 });
    expect((await datos.publicar()).status).toBe(201);
    const cargos = await peticion('get', `${datos.base}/cargos`);
    expect(cargos.status).toBe(200);
    expect(cargos.body.totales).toMatchObject(datos.resumen.totales);
    const cargo = await datos.Cargo.findOne({ campania: datos.resumen.campania._id, tipo_cobro: 'representante' }).lean();
    await expect(datos.Cargo.create({ ...cargo, _id: new mongoose.Types.ObjectId(),
      alumno: new mongoose.Types.ObjectId() })).rejects.toMatchObject({ code: 11000 });
    expect(await datos.Cargo.countDocuments({ campania: cargo.campania })).toBe(3);
  });

  test('familias Mongo conserva campañas antiguas por atleta, incluso con hermanos', async () => {
    const datos = await prepararFamiliaMongo({ unidad: 'atleta' });
    await modelosMongo.alfa.CampaniaCobro.collection.updateOne({ _id: new mongoose.Types.ObjectId(datos.resumen.campania._id) },
      { $unset: { unidad_cobro: '' } });
    const preview = (await peticion('get', `${datos.base}/resumen`)).body;
    expect(preview.filas).toHaveLength(4);
    expect(preview.totales).toMatchObject({ participantes: 4, total_esperado: 40 });
    expect((await datos.publicar(preview)).status).toBe(201);
    expect((await peticion('get', `${datos.base}/cargos`)).body.filas).toHaveLength(4);
  });

  test('familias Mongo editar datos sin enviar la nueva unidad conserva el cobro familiar', async () => {
    const datos = await prepararFamiliaMongo();
    const { solicitud_id, ...body } = datosMongo();
    const respuesta = await peticion('patch', datos.base, { ...body, version: 0, nombre: 'Familia editada',
      monto_general: 10, sedes: datos.resumen.campania.sedes.map((sede) => sede._id) });
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.campania.unidad_cobro).toBe('representante');
    expect((await peticion('get', `${datos.base}/resumen`)).body.totales).toMatchObject({ participantes: 4, cobros: 3, total_esperado: 30 });
  });

  test('familias Mongo bloquea importes distintos entre sedes y permite unificarlos explícitamente', async () => {
    const datos = await prepararFamiliaMongo({ distintasSedes: true });
    expect(datos.resumen.totales).toMatchObject({ pendientes: 1, con_observaciones: 1, total_esperado: null });
    expect((await datos.publicar()).status).toBe(409);
    expect(await datos.Cargo.countDocuments({ campania: datos.resumen.campania._id })).toBe(0);
    const condiciones = datos.atletas.slice(0, 2).map((atleta) => ({
      alumno: String(atleta._id), modalidad: 'personalizado', monto: 15, nota_interna: 'Acuerdo familiar'
    }));
    expect((await peticion('put', `${datos.base}/participantes`, { version: 0,
      participantes: datos.atletas.map((atleta) => String(atleta._id)), condiciones_participantes: condiciones })).status).toBe(200);
    const preview = (await peticion('get', `${datos.base}/resumen`)).body;
    expect(preview.totales).toMatchObject({ pendientes: 0, con_observaciones: 0, total_esperado: 35, cobros: 3 });
    expect((await datos.publicar(preview)).status).toBe(201);
  });

  test('familias Mongo detecta cambios de representante entre resumen y publicación', async () => {
    const datos = await prepararFamiliaMongo();
    await datos.Alumno.updateOne({ _id: datos.atletas[1]._id }, { $unset: { representante: '' } });
    expect((await datos.publicar()).status).toBe(409);
    expect(await datos.Cargo.countDocuments({ campania: datos.resumen.campania._id })).toBe(0);
    const preview = (await peticion('get', `${datos.base}/resumen`)).body;
    expect(preview.totales).toMatchObject({ cobros: 4, individuales: 3, total_esperado: 40 });
    expect((await datos.publicar(preview)).status).toBe(201);
  });

  test('familias Mongo comparte reserva, confirmación e historial entre hermanos y conserva propietario congelado', async () => {
    const datos = await prepararFamiliaMongo();
    expect((await datos.publicar()).status).toBe(201);
    const listar = (atleta) => datos.propio('get', `/campanias/mis-cargos?alumnoId=${atleta._id}`);
    const primero = await listar(datos.atletas[0]);
    const segundo = await listar(datos.atletas[1]);
    expect(primero.status).toBe(200);
    expect(segundo.body.cargos[0]._id).toBe(primero.body.cargos[0]._id);
    const cargo = primero.body.cargos[0];
    const ruta = `${datos.base}/cargos/${cargo._id}/pagos`;
    const body = { solicitud_id: require('crypto').randomUUID(), version: 0, moneda: 'USD', monto_pagado: 5,
      monto_pagado_bs: 500, fecha_pago: '2026-11-10', metodo_pago: 'Transferencia', referencia: '919191', estado: 'en_revision' };
    const pago = await datos.propio('post', ruta, body);
    expect(pago.status).toBe(201);
    for (const atleta of datos.atletas.slice(0, 2)) {
      expect((await listar(atleta)).body.cargos[0]).toMatchObject({ _id: cargo._id, pago_en_revision: true, disponible: 5, saldo_pendiente: 10 });
    }
    expect((await corregirMongo('post', `${ruta}/${pago.body.pago._id}/confirmar`)).status).toBe(200);
    for (const atleta of datos.atletas.slice(0, 2)) {
      expect((await listar(atleta)).body.cargos[0]).toMatchObject({ estado: 'abono', saldo_pendiente: 5 });
    }
    const otroUsuario = new mongoose.Types.ObjectId();
    const otro = await datos.Representante.create({ nombres: 'Maria', apellidos: 'Familia QA',
      cedula: new mongoose.Types.ObjectId().toString(), usuario: otroUsuario });
    await datos.Alumno.updateMany({ _id: { $in: datos.atletas.slice(0, 2).map((atleta) => atleta._id) } },
      { $set: { representante: otro._id } });
    expect((await datos.propio('get', ruta)).status).toBe(200);
    const otroAuth = jwt.sign({ rol: 'usuario', id: String(otroUsuario), tenantId: 'alfa' }, 'qa-campanias-secret');
    expect((await request(app).get(ruta).set('Authorization', `Bearer ${otroAuth}`)).status).toBe(404);
    expect((await request(app).get(`/campanias/mis-cargos?alumnoId=${datos.atletas[0]._id}`)
      .set('Authorization', `Bearer ${otroAuth}`)).body.cargos).toEqual([]);
    expect((await peticion('get', `${datos.base}/cargos`)).body.filas.find((fila) => fila._id === cargo._id).atletas_cubiertos).toHaveLength(2);
    expect((await corregirMongo('delete', `${ruta}/${pago.body.pago._id}`, { version: 2 })).status).toBe(200);
    expect(await datos.Cargo.findById(cargo._id).lean()).toMatchObject({ saldo_pendiente: 10, estado: 'pendiente' });
  });

  test('familias Mongo agregar un hermano vincula al cargo con pagos sin duplicar deuda y reintenta idempotentemente', async () => {
    const datos = await prepararFamiliaMongo();
    expect((await datos.publicar()).status).toBe(201);
    const cargo = await datos.Cargo.findOne({ campania: datos.resumen.campania._id, tipo_cobro: 'representante' }).lean();
    const ruta = `${datos.base}/cargos/${cargo._id}/pagos`;
    expect((await registrarMongo(ruta, { solicitud_id: require('crypto').randomUUID(), version: 0, moneda: 'USD', monto_pagado: 5,
      monto_pagado_bs: 500, fecha_pago: '2026-11-10', metodo_pago: 'Transferencia', referencia: '929292', estado: 'confirmado' })).status).toBe(201);
    const nuevo = await crearAtletaMongo('alfa', { nombres: 'Hermanito', sede: cargo.sede, representante: datos.representante._id });
    const actual = await modelosMongo.alfa.CampaniaCobro.findById(cargo.campania).lean();
    const body = { accion: 'agregar', alumno: String(nuevo._id), version: actual.__v, modalidad: 'general',
      nota_interna: '', solicitud_id: require('crypto').randomUUID() };
    const respuesta = await corregirMongo('post', `${datos.base}/ajustes-cargos`, body);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ vinculado: true, cargo: { _id: String(cargo._id), monto: 10, saldo_pendiente: 5, estado: 'abono' } });
    expect(respuesta.body.cargo.atletas_cubiertos).toHaveLength(3);
    expect((await corregirMongo('post', `${datos.base}/ajustes-cargos`, body)).body).toMatchObject({ repetida: true, vinculado: true });
    const resumen = await peticion('get', `${datos.base}/cargos`);
    expect(resumen.status).toBe(200);
    expect(resumen.body.totales).toMatchObject({ participantes: 5, cobros: 3, total_esperado: 30 });
    expect(await datos.Pago.countDocuments({ campania: cargo.campania })).toBe(1);
  });

  test('familias Mongo agrupa dos campañas del representante una sola vez por cargo y confirma ambos saldos', async () => {
    const datos = await prepararFamiliaMongo();
    expect((await datos.publicar()).status).toBe(201);
    const segunda = await peticion('post', '/campanias', { ...datosMongo(), unidad_cobro: 'representante',
      monto_general: 10, solicitud_id: require('crypto').randomUUID(), sedes: datos.resumen.campania.sedes.map((sede) => sede._id) });
    const base = `/campanias/${segunda.body.campania._id}`;
    const preview = (await peticion('get', `${base}/resumen`)).body;
    expect((await publicarMongo(base, { version: 0, revision: preview.revision, solicitud_id: require('crypto').randomUUID() })).status).toBe(201);
    const agrupables = await datos.propio('get', `/campanias/cargos-agrupables?alumnoId=${datos.atletas[1]._id}`);
    expect(agrupables.status).toBe(200);
    expect(agrupables.body.cargos).toHaveLength(2);
    expect(agrupables.body.cargos.every((cargo) => cargo.atletas_cubiertos.length === 2)).toBe(true);
    const body = { alumnoId: String(datos.atletas[1]._id), solicitud_id: require('crypto').randomUUID(), moneda: 'USD',
      monto_pagado: 20, monto_pagado_bs: 2000, fecha_pago: '2026-11-10', metodo_pago: 'Transferencia',
      referencia: '939393', estado: 'en_revision',
      cargos: agrupables.body.cargos.map((cargo) => ({ cargo: cargo._id, version: cargo.__v })) };
    const pago = await datos.propio('post', '/campanias/pagos-agrupados', body);
    expect(pago.status).toBe(201);
    expect(pago.body.pagos).toHaveLength(2);
    const historial = await datos.propio('get', `/campanias/pagos-agrupados/${body.solicitud_id}`);
    expect(historial.status).toBe(200);
    expect(historial.body.cargos).toHaveLength(2);
    const primero = pago.body.pagos[0];
    expect((await corregirMongo('post', `/campanias/${primero.campania}/cargos/${primero.cargo}/pagos/${primero._id}/confirmar`)).status).toBe(200);
    expect((await datos.Cargo.find({ _id: { $in: body.cargos.map((item) => item.cargo) } }).lean())
      .every((cargo) => cargo.estado === 'pagado' && cargo.saldo_pendiente === 0)).toBe(true);
  });

  const prepararConversionMongo = async ({ monto = 10 } = {}) => {
    const datos = await prepararFamiliaMongo({ unidad: 'atleta', monto });
    expect((await datos.publicar()).status).toBe(201);
    const rutaConversion = `${datos.base}/conversion-representante`;
    const preview = await peticion('get', rutaConversion);
    expect(preview.status).toBe(200);
    const body = { version: preview.body.campania.__v, revision: preview.body.revision,
      solicitud_id: require('crypto').randomUUID() };
    const originales = await datos.Cargo.find({ campania: datos.resumen.campania._id }).select('+nota_interna').sort({ alumno: 1 }).lean();
    const pagoBody = { solicitud_id: require('crypto').randomUUID(), version: 0, moneda: 'USD', monto_pagado: 5,
      monto_pagado_bs: 500, fecha_pago: '2026-11-10', metodo_pago: 'Transferencia', referencia: '949494', estado: 'en_revision' };
    return { ...datos, rutaConversion, preview: preview.body, body, originales, pagoBody,
      rutaPago: `${datos.base}/cargos/${originales[0]._id}/pagos` };
  };

  test('conversion Mongo muestra el cambio, conserva importes congelados y deja auditoria sin pagos', async () => {
    const datos = await prepararConversionMongo();
    expect(datos.preview).toMatchObject({ antes: { cobros: 4, total_esperado: 40 },
      totales: { participantes: 4, cobros: 3, total_esperado: 30, representantes: 1, individuales: 2 } });
    expect(await datos.Cargo.find({ campania: datos.resumen.campania._id }).select('+nota_interna').sort({ alumno: 1 }).lean()).toEqual(datos.originales);
    const original = await modelosMongo.alfa.CampaniaCobro.findById(datos.resumen.campania._id).lean();
    await modelosMongo.alfa.CampaniaCobro.updateOne({ _id: original._id }, { $set: { monto_general: 99 } });
    const respuesta = await corregirMongo('post', datos.rutaConversion, datos.body);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ repetida: false, campania: { estado: 'abierta', unidad_cobro: 'representante',
      totales_cargos: { participantes: 4, cobros: 3, total_esperado: 30 } } });
    expect(respuesta.body.campania.publicacion).toEqual(JSON.parse(JSON.stringify(original.publicacion)));
    expect(respuesta.body.campania.conversion_representante).toBeUndefined();
    const auditada = await modelosMongo.alfa.CampaniaCobro.findById(original._id).select('+conversion_representante').lean();
    expect(auditada.conversion_representante).toMatchObject({ solicitud_id: datos.body.solicitud_id, version: datos.body.version,
      revision: datos.body.revision, actor: { id: 'admin-qa', rol: 'admin' }, antes: { total_esperado: 40 }, despues: { total_esperado: 30 } });
    expect(auditada.conversion_representante.cargos_anteriores).toEqual(datos.originales);
    const cargos = await peticion('get', `${datos.base}/cargos`);
    expect(cargos.status).toBe(200);
    expect(cargos.body.filas).toHaveLength(3);
    expect(cargos.body.filas.find((fila) => fila.tipo_cobro === 'representante').atletas_cubiertos).toHaveLength(2);
    expect(cargos.body.filas.every((fila) => fila.monto === 10 && fila.saldo_pendiente === 10 && fila.version === 1)).toBe(true);
    expect(await datos.Pago.countDocuments({ campania: original._id })).toBe(0);
    const reintento = await corregirMongo('post', datos.rutaConversion, datos.body);
    expect(reintento.status).toBe(200);
    expect(reintento.body.repetida).toBe(true);
    expect((await corregirMongo('post', datos.rutaConversion, { ...datos.body, solicitud_id: require('crypto').randomUUID() })).status).toBe(409);
    expect((await datos.propio('get', `/campanias/mis-cargos?alumnoId=${datos.atletas[1]._id}`)).body.cargos).toHaveLength(1);
  });

  test.each(['en_revision', 'confirmado', 'eliminado'])('conversion Mongo conserva toda la familia con pago parcial %s y convierte el resto', async (estado) => {
    const datos = await prepararConversionMongo();
    const creado = await registrarMongo(datos.rutaPago, { ...datos.pagoBody, estado: estado === 'confirmado' ? 'confirmado' : 'en_revision' });
    expect(creado.status).toBe(201);
    if (estado === 'eliminado') {
      expect((await corregirMongo('delete', `${datos.rutaPago}/${creado.body.pago._id}`, { version: 1 })).status).toBe(200);
    }
    const familia = datos.atletas.slice(0, 2).map((atleta) => atleta._id);
    const antes = await datos.Cargo.find({ campania: datos.resumen.campania._id, alumno: { $in: familia } })
      .select('+nota_interna').sort({ alumno: 1 }).lean();
    const pagos = await datos.Pago.find({ campania: datos.resumen.campania._id }).select('+modificaciones +huella').lean();
    const versionActual = await modelosMongo.alfa.CampaniaCobro.findById(datos.resumen.campania._id).lean();
    const lectura = await peticion('get', datos.rutaConversion);
    expect(lectura.status).toBe(200);
    expect(lectura.body.totales).toMatchObject({ conservados: 2, cobros: 4, individuales: 2, total_esperado: 40, con_observaciones: 0 });
    expect((await corregirMongo('post', datos.rutaConversion, { ...datos.body, version: versionActual.__v,
      revision: lectura.body.revision })).status).toBe(200);
    expect(await datos.Cargo.find({ campania: versionActual._id, alumno: { $in: familia } })
      .select('+nota_interna').sort({ alumno: 1 }).lean()).toEqual(antes);
    expect(await datos.Pago.find({ campania: versionActual._id }).select('+modificaciones +huella').lean()).toEqual(pagos);
    const cargos = await peticion('get', `${datos.base}/cargos`);
    expect(cargos.status).toBe(200);
    expect(cargos.body.filas.filter((fila) => fila.preservado_conversion)).toHaveLength(2);
    expect(cargos.body.filas.filter((fila) => fila.tipo_cobro === 'individual_sin_representante')).toHaveLength(2);
  });

  test.each([
    ['en_revision', true, 'pagos en revision'],
    ['en_revision', false, 'pagos en revision'],
    ['eliminado', true, 'pagos eliminados en su historial'],
    ['abono', true, 'abonos confirmados'],
    ['pagado', true, 'pagos confirmados']
  ])('conversion Mongo describe cargo individual %s con representante %s sin inventar cobertura familiar', async (estado, conRepresentante, motivo) => {
    const datos = await prepararConversionMongo();
    const fuente = datos.originales.find((cargo) => String(cargo.alumno) === String(datos.atletas[0]._id));
    await datos.Alumno.updateOne({ _id: datos.atletas[conRepresentante ? 1 : 0]._id }, { $unset: { representante: '' } });
    const ruta = `${datos.base}/cargos/${fuente._id}/pagos`;
    const creado = await registrarMongo(ruta, { ...datos.pagoBody, monto_pagado: estado === 'pagado' ? 10 : 5,
      monto_pagado_bs: estado === 'pagado' ? 1000 : 500,
      estado: ['abono', 'pagado'].includes(estado) ? 'confirmado' : 'en_revision' });
    expect(creado.status).toBe(201);
    if (estado === 'eliminado') {
      expect((await corregirMongo('delete', `${ruta}/${creado.body.pago._id}`, { version: 1 })).status).toBe(200);
    }
    const anterior = await datos.Cargo.findById(fuente._id).select('+nota_interna').lean();
    const pagos = await datos.Pago.find({ cargo: fuente._id }).select('+modificaciones +huella').lean();
    const lectura = await peticion('get', datos.rutaConversion);
    expect(lectura.status).toBe(200);
    const fila = lectura.body.filas.find((item) => item._id === String(fuente._id));
    expect(fila.motivo_conservacion).toBe(`Cargo individual conservado sin cambios: tiene ${motivo}. Solo corresponde a este atleta.`);
    expect(fila).toMatchObject({ preservado_conversion: true, monto: 10, saldo_pendiente: anterior.saldo_pendiente });
    expect(lectura.body.filas.some((item) => item.cobertura_familiar)).toBe(false);
    const convertida = await corregirMongo('post', datos.rutaConversion, { ...datos.body,
      version: lectura.body.campania.__v, revision: lectura.body.revision });
    expect(convertida.status).toBe(200);
    expect(await datos.Cargo.findById(fuente._id).select('+nota_interna').lean()).toEqual(anterior);
    expect(await datos.Pago.find({ cargo: fuente._id }).select('+modificaciones +huella').lean()).toEqual(pagos);
    const resumen = await peticion('get', `${datos.base}/cargos`);
    expect(resumen.status).toBe(200);
    expect(resumen.body.filas.find((item) => item._id === String(fuente._id)).motivo_conservacion).toBe(fila.motivo_conservacion);
  });

  test('conversion Mongo permite conservar conflictos o unificar importes antes de convertir', async () => {
    const datos = await prepararConversionMongo();
    const cargoLuis = datos.originales.find((cargo) => String(cargo.alumno) === String(datos.atletas[1]._id));
    const version = datos.body.version;
    expect((await corregirMongo('post', `${datos.base}/ajustes-cargos`, { accion: 'editar', alumno: String(cargoLuis.alumno),
      modalidad: 'personalizado', monto: 20, nota_interna: '', version, version_cargo: 0, solicitud_id: require('crypto').randomUUID() })).status).toBe(200);
    const conflicto = await peticion('get', datos.rutaConversion);
    expect(conflicto.status).toBe(200);
    expect(conflicto.body.totales).toMatchObject({ pendientes: 0, con_observaciones: 0, conservados: 2, total_esperado: 50 });
    expect(conflicto.body.filas.filter((fila) => fila.preservado_conversion)).toHaveLength(2);
    expect((await corregirMongo('post', `${datos.base}/ajustes-cargos`, { accion: 'editar', alumno: String(cargoLuis.alumno),
      modalidad: 'general', nota_interna: '', version: version + 1, version_cargo: 1, solicitud_id: require('crypto').randomUUID() })).status).toBe(200);
    const unificada = (await peticion('get', datos.rutaConversion)).body;
    expect(unificada.totales).toMatchObject({ total_esperado: 30, pendientes: 0 });
    expect((await corregirMongo('post', datos.rutaConversion, { ...datos.body, version: unificada.campania.__v, revision: unificada.revision })).status).toBe(200);
  });

  test.each([1, 2])('conversion Mongo un cargo pagado en %i transacciones cubre al hermano sin tocar origen y protege sus pagos', async (cuotas) => {
    const datos = await prepararConversionMongo();
    const fuente = datos.originales.find((cargo) => String(cargo.alumno) === String(datos.atletas[0]._id));
    const hermano = datos.originales.find((cargo) => String(cargo.alumno) === String(datos.atletas[1]._id));
    const ruta = `${datos.base}/cargos/${fuente._id}/pagos`;
    let pago;
    for (let indice = 0; indice < cuotas; indice += 1) {
      pago = await registrarMongo(ruta, { ...datos.pagoBody, solicitud_id: require('crypto').randomUUID(),
        version: indice, monto_pagado: 10 / cuotas, monto_pagado_bs: 1000 / cuotas, estado: 'confirmado' });
      expect(pago.status).toBe(201);
    }
    const anterior = await datos.Cargo.findById(fuente._id).select('+nota_interna').lean();
    const pagos = await datos.Pago.find({ cargo: fuente._id }).select('+modificaciones +huella').sort({ _id: 1 }).lean();
    const preview = (await peticion('get', datos.rutaConversion)).body;
    expect(preview.totales).toMatchObject({ participantes: 4, cobros: 4, conservados: 1, cubiertos: 1,
      generales: 3, no_aplica: 0, total_esperado: 30 });
    const body = { ...datos.body, version: preview.campania.__v, revision: preview.revision };
    expect((await corregirMongo('post', datos.rutaConversion, body)).status).toBe(200);
    expect((await corregirMongo('post', datos.rutaConversion, body)).body.repetida).toBe(true);
    expect(await datos.Cargo.findById(fuente._id).select('+nota_interna').lean()).toEqual(anterior);
    expect(await datos.Pago.find({ cargo: fuente._id }).select('+modificaciones +huella').sort({ _id: 1 }).lean()).toEqual(pagos);
    expect(await datos.Cargo.findById(hermano._id).lean()).toMatchObject({ tipo_cobro: 'cubierto_por_representante',
      cobertura_familiar: { cargo: fuente._id }, monto: 0, saldo_pendiente: 0, estado: 'no_aplica' });
    const lista = await peticion('get', `${datos.base}/cargos`);
    expect(lista.status).toBe(200);
    expect(lista.body.filas.find((fila) => fila._id === String(hermano._id))).toMatchObject({ puede_ajustar: false,
      cobertura_familiar: { cargo: String(fuente._id) } });
    const portal = await datos.propio('get', `/campanias/mis-cargos?alumnoId=${hermano.alumno}`);
    expect(portal.status).toBe(200);
    expect(portal.body.cargos[0]).toMatchObject({ tipo_cobro: 'cubierto_por_representante', disponible: 0,
      cobertura_familiar: { cargo: String(fuente._id) } });
    expect((await corregirMongo('delete', `${ruta}/${pago.body.pago._id}`, { version: cuotas })).body.error).toMatch(/cubre a otros atletas/);
    const reduccion = await corregirMongo('patch', `${ruta}/${pago.body.pago._id}`, { ...datos.pagoBody,
      version: cuotas, solicitud_id: require('crypto').randomUUID(), estado: 'confirmado', monto_pagado: 1, monto_pagado_bs: 100 });
    expect(reduccion.status).toBe(409);
    expect(reduccion.body.error).toMatch(/cubre a otros atletas/);
    const metadata = await corregirMongo('patch', `${ruta}/${pago.body.pago._id}`, { ...datos.pagoBody,
      version: cuotas, solicitud_id: require('crypto').randomUUID(), estado: 'confirmado',
      monto_pagado: 10 / cuotas, monto_pagado_bs: 1000 / cuotas, referencia: '959595' });
    expect(metadata.status).toBe(200);
    expect(metadata.body.cargo).toMatchObject({ monto: 10, saldo_pendiente: 0, estado: 'pagado' });
    const actual = await modelosMongo.alfa.CampaniaCobro.findById(fuente.campania).lean();
    const ajuste = { accion: 'editar', alumno: String(hermano.alumno), version: actual.__v, version_cargo: 1,
      modalidad: 'general', nota_interna: '', solicitud_id: require('crypto').randomUUID() };
    expect((await corregirMongo('post', `${datos.base}/ajustes-cargos`, ajuste)).status).toBe(409);
    const nuevo = await crearAtletaMongo('alfa', { nombres: 'Otro hermano', sede: fuente.sede, representante: datos.representante._id });
    expect((await corregirMongo('post', `${datos.base}/ajustes-cargos`, { ...ajuste, accion: 'agregar', alumno: String(nuevo._id),
      solicitud_id: require('crypto').randomUUID(), version_cargo: undefined })).status).toBe(409);
    for (const cargo of await datos.Cargo.find({ campania: fuente.campania, saldo_pendiente: { $gt: 0 } }).lean()) {
      const resultado = await registrarMongo(`${datos.base}/cargos/${cargo._id}/pagos`, { ...datos.pagoBody,
        version: cargo.__v, solicitud_id: require('crypto').randomUUID(), estado: 'confirmado', monto_pagado: 10, monto_pagado_bs: 1000 });
      expect(resultado.status).toBe(201);
    }
    expect((await modelosMongo.alfa.CampaniaCobro.findById(fuente.campania).lean()).estado).toBe('cerrada');
  });

  test.each(['varios_pagados', 'importe_distinto'])('conversion Mongo conserva familias ambiguas %s sin eliminar deudas ni pagos', async (caso) => {
    const datos = await prepararConversionMongo();
    const familia = datos.originales.filter((cargo) => datos.atletas.slice(0, 2).some((atleta) => String(atleta._id) === String(cargo.alumno)));
    if (caso === 'importe_distinto') {
      expect((await corregirMongo('post', `${datos.base}/ajustes-cargos`, { accion: 'editar', alumno: String(familia[1].alumno),
        modalidad: 'personalizado', monto: 20, nota_interna: '', version: datos.body.version, version_cargo: 0,
        solicitud_id: require('crypto').randomUUID() })).status).toBe(200);
    }
    for (const cargo of caso === 'varios_pagados' ? familia : familia.slice(0, 1)) {
      expect((await registrarMongo(`${datos.base}/cargos/${cargo._id}/pagos`, { ...datos.pagoBody,
        solicitud_id: require('crypto').randomUUID(), estado: 'confirmado', monto_pagado: 10, monto_pagado_bs: 1000 })).status).toBe(201);
    }
    const antes = await datos.Cargo.find({ _id: { $in: familia.map((cargo) => cargo._id) } }).select('+nota_interna').sort({ alumno: 1 }).lean();
    const pagos = await datos.Pago.find({ campania: datos.resumen.campania._id }).select('+modificaciones +huella').sort({ _id: 1 }).lean();
    const preview = (await peticion('get', datos.rutaConversion)).body;
    expect(preview.totales).toMatchObject({ conservados: 2, individuales: 2, pendientes: 0, con_observaciones: 0 });
    expect((await corregirMongo('post', datos.rutaConversion, { ...datos.body, version: preview.campania.__v, revision: preview.revision })).status).toBe(200);
    expect(await datos.Cargo.find({ _id: { $in: familia.map((cargo) => cargo._id) } }).select('+nota_interna').sort({ alumno: 1 }).lean()).toEqual(antes);
    expect(await datos.Pago.find({ campania: datos.resumen.campania._id }).select('+modificaciones +huella').sort({ _id: 1 }).lean()).toEqual(pagos);
    expect(await datos.Cargo.countDocuments({ campania: datos.resumen.campania._id, tipo_cobro: 'cubierto_por_representante' })).toBe(0);
  });

  test('conversion Mongo rechaza cambios de representante o version posteriores a la vista previa y aisla academia', async () => {
    const datos = await prepararConversionMongo();
    expect((await publicarMongo(datos.base, datos.body, 'beta')).status).toBe(404);
    const ajena = await request(app).post(datos.rutaConversion).set('x-tenant', 'beta')
      .set('Authorization', `Bearer ${tokenPublicacion('admin', 'beta')}`).send(datos.body);
    expect(ajena.status).toBe(404);
    await datos.Alumno.updateOne({ _id: datos.atletas[1]._id }, { $unset: { representante: '' } });
    const obsoleta = await corregirMongo('post', datos.rutaConversion, datos.body);
    expect(obsoleta.status).toBe(409);
    expect(obsoleta.body.error).toMatch(/representantes cambiaron/);
    expect((await corregirMongo('post', datos.rutaConversion, { ...datos.body, version: datos.body.version + 1 })).status).toBe(409);
    expect(await datos.Cargo.countDocuments({ campania: datos.resumen.campania._id })).toBe(4);
  });

  test('conversion Mongo revierte la actualizacion y eliminacion de cargos si falla la transaccion', async () => {
    const datos = await prepararConversionMongo();
    const originalDelete = datos.Cargo.deleteMany.bind(datos.Cargo);
    const simulado = jest.spyOn(datos.Cargo, 'deleteMany').mockImplementationOnce(async (...args) => {
      await originalDelete(...args);
      throw new Error('Fallo QA despues de eliminar cargos absorbidos');
    });
    try { expect((await corregirMongo('post', datos.rutaConversion, datos.body)).status).toBe(500); }
    finally { simulado.mockRestore(); }
    expect(await datos.Cargo.find({ campania: datos.resumen.campania._id }).select('+nota_interna').sort({ alumno: 1 }).lean()).toEqual(datos.originales);
    const actual = await modelosMongo.alfa.CampaniaCobro.findById(datos.resumen.campania._id).select('+conversion_representante').lean();
    expect(actual.unidad_cobro).toBe('atleta');
    expect(actual.conversion_representante).toBeUndefined();
    expect(actual.__v).toBe(datos.body.version);
    expect((await corregirMongo('post', datos.rutaConversion, datos.body)).status).toBe(200);
  });

  test('conversion Mongo solicitudes concurrentes identicas convierten una sola vez', async () => {
    const datos = await prepararConversionMongo();
    const respuestas = await Promise.all([corregirMongo('post', datos.rutaConversion, datos.body), corregirMongo('post', datos.rutaConversion, datos.body)]);
    expect(respuestas.map((item) => item.status)).toEqual([200, 200]);
    expect(respuestas.filter((item) => item.body.repetida)).toHaveLength(1);
    expect(await datos.Cargo.countDocuments({ campania: datos.resumen.campania._id })).toBe(3);
    expect((await modelosMongo.alfa.CampaniaCobro.findById(datos.resumen.campania._id).lean()).__v).toBe(datos.body.version + 1);
  });

  test('conversion Mongo competir con un pago nunca elimina un cargo con historial', async () => {
    const datos = await prepararConversionMongo();
    const luis = datos.originales.find((cargo) => String(cargo.alumno) === String(datos.atletas[1]._id));
    const rutaPago = `${datos.base}/cargos/${luis._id}/pagos`;
    const [convertida, pago] = await Promise.all([
      corregirMongo('post', datos.rutaConversion, datos.body), registrarMongo(rutaPago, datos.pagoBody)
    ]);
    expect([convertida.status === 200, pago.status === 201].filter(Boolean)).toHaveLength(1);
    const actual = await modelosMongo.alfa.CampaniaCobro.findById(datos.resumen.campania._id).lean();
    if (pago.status === 201) {
      expect(convertida.status).toBe(409);
      expect(actual.unidad_cobro).toBe('atleta');
      expect(await datos.Cargo.countDocuments({ campania: actual._id })).toBe(4);
      expect(await datos.Cargo.findById(luis._id).lean()).toMatchObject({ saldo_pendiente: 10 });
    } else {
      expect([404, 409]).toContain(pago.status);
      expect(actual.unidad_cobro).toBe('representante');
      expect(await datos.Pago.countDocuments({ campania: actual._id })).toBe(0);
    }
  });

  const prepararCoberturaMongo = async ({ cuotas = 1, confirmar = true, monto = 10, pagado = monto } = {}) => {
    const datos = await prepararConversionMongo({ monto });
    const fuente = datos.originales.find((cargo) => String(cargo.alumno) === String(datos.atletas[0]._id));
    const hermano = datos.originales.find((cargo) => String(cargo.alumno) === String(datos.atletas[1]._id));
    const ruta = `${datos.base}/cargos/${fuente._id}/pagos`;
    const pagos = [];
    for (let indice = 0; indice < cuotas; indice += 1) {
      const pago = await registrarMongo(ruta, { ...datos.pagoBody, solicitud_id: require('crypto').randomUUID(),
        version: indice, monto_pagado: pagado / cuotas, monto_pagado_bs: pagado * 100 / cuotas, estado: 'en_revision' });
      expect(pago.status).toBe(201);
      pagos.push(pago.body.pago);
    }
    const conversion = (await peticion('get', datos.rutaConversion)).body;
    expect(conversion.totales.conservados).toBe(2);
    expect((await corregirMongo('post', datos.rutaConversion, { ...datos.body, version: conversion.campania.__v,
      revision: conversion.revision })).status).toBe(200);
    if (confirmar) for (const pago of pagos) {
      expect((await corregirMongo('post', `${ruta}/${pago._id}/confirmar`)).status).toBe(200);
    }
    const rutaCobertura = `${datos.base}/cargos/${fuente._id}/cobertura-familiar`;
    const lectura = await peticion('get', rutaCobertura);
    if (confirmar) expect(lectura.status).toBe(200);
    const bodyCobertura = confirmar ? { version: lectura.body.campania.__v, revision: lectura.body.revision,
      solicitud_id: require('crypto').randomUUID() } : null;
    return { ...datos, fuente, hermano, ruta, pagos, rutaCobertura, lectura, bodyCobertura };
  };

  test.each([1, 2])('cobertura manual Mongo comparte %i pagos confirmados y su ciclo de correccion eliminacion y repago', async (cuotas) => {
    const datos = await prepararCoberturaMongo({ cuotas });
    const fuente = await datos.Cargo.findById(datos.fuente._id).select('+nota_interna').lean();
    const pagos = await datos.Pago.find({ campania: fuente.campania }).select('+modificaciones +huella').sort({ _id: 1 }).lean();
    const hermano = await datos.Cargo.findById(datos.hermano._id).select('+nota_interna').lean();
    expect(hermano).toMatchObject({ tipo_cobro: 'atleta', monto: 10, saldo_pendiente: 10 });
    const campaniaAntes = await modelosMongo.alfa.CampaniaCobro.findById(fuente.campania).select('+conversion_representante').lean();
    expect(datos.lectura.body).toMatchObject({ fuente: { _id: String(fuente._id), monto: 10, saldo_pendiente: 0 },
      hermanos: [{ _id: String(hermano._id), monto: 10, saldo_pendiente: 10 }],
      antes: { conservados: 2, total_esperado: 40 }, despues: { cobros: 3, representantes: 1, total_esperado: 30 } });
    expect(datos.lectura.body.anteriores).toBeUndefined();
    const lista = await peticion('get', `${datos.base}/cargos`);
    expect(lista.body.filas.find((cargo) => cargo._id === String(fuente._id)).puede_revisar_cobertura).toBe(true);
    const respuesta = await corregirMongo('post', datos.rutaCobertura, datos.bodyCobertura);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ repetida: false, fuente: String(fuente._id), cubiertos: [String(hermano._id)],
      campania: { __v: campaniaAntes.__v + 1, totales_cargos: { total_esperado: 30, cobros: 3, representantes: 1 } } });
    expect(respuesta.body.campania.coberturas_familiares).toBeUndefined();
    const compartido = await datos.Cargo.findById(fuente._id).select('+nota_interna').lean();
    expect(compartido).toMatchObject({ ...fuente, tipo_cobro: 'representante', __v: fuente.__v + 1, updatedAt: compartido.updatedAt });
    expect(compartido.atletas_cubiertos.map((atleta) => String(atleta.alumno))).toEqual([String(fuente.alumno), String(hermano.alumno)]);
    expect(await datos.Pago.find({ campania: fuente.campania }).select('+modificaciones +huella').sort({ _id: 1 }).lean()).toEqual(pagos);
    expect(await datos.Cargo.findById(hermano._id).lean()).toBeNull();
    const actual = await modelosMongo.alfa.CampaniaCobro.findById(fuente.campania)
      .select('+conversion_representante +coberturas_familiares').lean();
    expect(actual.publicacion).toEqual(campaniaAntes.publicacion);
    expect(actual.conversion_representante).toEqual(campaniaAntes.conversion_representante);
    expect(actual.coberturas_familiares).toHaveLength(1);
    expect(actual.coberturas_familiares[0]).toMatchObject({ actor: { id: 'admin-qa', rol: 'admin' },
      solicitud_id: datos.bodyCobertura.solicitud_id, cargos_anteriores: expect.arrayContaining([fuente, hermano]) });
    const resumen = await peticion('get', `${datos.base}/cargos`);
    expect(resumen.status).toBe(200);
    expect(resumen.body.totales).toMatchObject({ cobros: 3, representantes: 1, no_aplica: 0, total_esperado: 30 });
    expect(resumen.body.filas.find((cargo) => cargo._id === String(hermano._id))).toBeUndefined();
    expect(resumen.body.filas.find((cargo) => cargo._id === String(fuente._id)).puede_revisar_cobertura).toBe(false);
    const ver = async (atleta) => {
      const vista = await datos.propio('get', `/campanias/mis-cargos?alumnoId=${atleta}`);
      expect(vista.status).toBe(200); return vista.body.cargos[0];
    };
    for (const atleta of [fuente.alumno, hermano.alumno]) {
      expect(await ver(atleta)).toMatchObject({ _id: String(fuente._id), tipo_cobro: 'representante', monto: 10, disponible: 0, estado: 'pagado' });
    }
    expect((await corregirMongo('post', datos.rutaCobertura, datos.bodyCobertura)).body.repetida).toBe(true);
    expect(await datos.Cargo.findById(fuente._id).select('+nota_interna').lean()).toEqual(compartido);
    const reduccion = await corregirMongo('patch', `${datos.ruta}/${datos.pagos[cuotas - 1]._id}`, { ...datos.pagoBody,
      estado: 'confirmado', version: compartido.__v, monto_pagado: 1, monto_pagado_bs: 100, solicitud_id: require('crypto').randomUUID() });
    expect(reduccion.status).toBe(200);
    for (const atleta of [fuente.alumno, hermano.alumno]) expect(await ver(atleta))
      .toMatchObject({ saldo_pendiente: 10 / cuotas - 1, estado: 'abono' });
    expect((await corregirMongo('delete', `${datos.ruta}/${datos.pagos[cuotas - 1]._id}`, { version: compartido.__v + 1 })).status).toBe(200);
    for (const atleta of [fuente.alumno, hermano.alumno]) expect(await ver(atleta))
      .toMatchObject({ saldo_pendiente: 10 / cuotas, estado: cuotas === 1 ? 'pendiente' : 'abono' });
    expect((await peticion('get', `${datos.base}/cargos`)).body.totales.total_esperado).toBe(30);
    const agrupables = await datos.propio('get', `/campanias/cargos-agrupables?alumnoId=${hermano.alumno}`);
    expect(agrupables.status).toBe(200);
    expect(agrupables.body.cargos.filter((cargo) => cargo._id === String(fuente._id))).toHaveLength(1);
    expect((await registrarMongo(datos.ruta, { ...datos.pagoBody, version: compartido.__v + 2,
      monto_pagado: 10 / cuotas, monto_pagado_bs: 1000 / cuotas, estado: 'confirmado',
      solicitud_id: require('crypto').randomUUID() })).status).toBe(201);
    for (const atleta of [fuente.alumno, hermano.alumno]) expect(await ver(atleta))
      .toMatchObject({ saldo_pendiente: 0, estado: 'pagado' });
  });

  test.each([1, 2])('cobertura manual Mongo comparte un abono de 15 sobre 20 en %i cuotas y deja una sola deuda de 5', async (cuotas) => {
    const datos = await prepararCoberturaMongo({ monto: 20, pagado: 15, cuotas });
    const fuente = await datos.Cargo.findById(datos.fuente._id).select('+nota_interna').lean();
    const pagos = await datos.Pago.find({ cargo: fuente._id }).select('+modificaciones +huella').sort({ _id: 1 }).lean();
    expect(datos.lectura.body.fuente).toMatchObject({ monto: 20, saldo_pendiente: 5, estado: 'abono' });
    const lista = await peticion('get', `${datos.base}/cargos`);
    expect(lista.body.filas.find((cargo) => cargo._id === String(fuente._id)).puede_revisar_cobertura).toBe(true);
    const aplicada = await corregirMongo('post', datos.rutaCobertura, datos.bodyCobertura);
    expect(aplicada.status).toBe(200);
    expect(aplicada.body.campania).toMatchObject({ estado: 'abierta', totales_cargos: { cobros: 3, total_esperado: 60 } });
    const compartido = await datos.Cargo.findById(fuente._id).select('+nota_interna').lean();
    expect(compartido).toMatchObject({ ...fuente, tipo_cobro: 'representante', __v: fuente.__v + 1, updatedAt: compartido.updatedAt });
    expect(await datos.Pago.find({ cargo: fuente._id }).select('+modificaciones +huella').sort({ _id: 1 }).lean()).toEqual(pagos);
    expect(await datos.Cargo.findById(datos.hermano._id).lean()).toBeNull();
    const ver = async (atleta) => {
      const portal = await datos.propio('get', `/campanias/mis-cargos?alumnoId=${atleta}`);
      expect(portal.status).toBe(200);
      expect(portal.body.cargos).toHaveLength(1);
      return portal.body.cargos[0];
    };
    for (const atleta of [fuente.alumno, datos.hermano.alumno]) {
      expect(await ver(atleta)).toMatchObject({ _id: String(fuente._id), estado: 'abono', monto: 20, saldo_pendiente: 5, disponible: 5 });
      const agrupables = await datos.propio('get', `/campanias/cargos-agrupables?alumnoId=${atleta}`);
      expect(agrupables.status).toBe(200);
      expect(agrupables.body.cargos).toHaveLength(1);
      expect(agrupables.body.cargos[0]).toMatchObject({ _id: String(fuente._id), saldo_pendiente: 5 });
    }
    const repago = await datos.propio('post', datos.ruta, { ...datos.pagoBody, version: compartido.__v,
      monto_pagado: 5, monto_pagado_bs: 500, solicitud_id: require('crypto').randomUUID() });
    expect(repago.status).toBe(201);
    for (const atleta of [fuente.alumno, datos.hermano.alumno]) expect(await ver(atleta))
      .toMatchObject({ saldo_pendiente: 5, disponible: 0, pago_en_revision: true });
    expect((await corregirMongo('post', `${datos.ruta}/${repago.body.pago._id}/confirmar`)).status).toBe(200);
    for (const atleta of [fuente.alumno, datos.hermano.alumno]) expect(await ver(atleta))
      .toMatchObject({ estado: 'pagado', saldo_pendiente: 0 });
    for (const pago of [repago.body.pago, ...[...datos.pagos].reverse()]) {
      const actual = await datos.Cargo.findById(fuente._id).lean();
      expect((await corregirMongo('delete', `${datos.ruta}/${pago._id}`, { version: actual.__v })).status).toBe(200);
    }
    for (const atleta of [fuente.alumno, datos.hermano.alumno]) expect(await ver(atleta))
      .toMatchObject({ estado: 'pendiente', saldo_pendiente: 20, monto: 20 });
    const pendientes = (await peticion('get', `${datos.base}/cargos`)).body;
    expect(pendientes.filas.reduce((total, cargo) => total + cargo.saldo_pendiente, 0)).toBe(60);
    expect(pendientes.filas).toHaveLength(3);
  });

  test('cobertura manual Mongo no une un abono confirmado si aun tiene otro pago en revision', async () => {
    const datos = await prepararCoberturaMongo({ monto: 20, pagado: 15 });
    const fuente = await datos.Cargo.findById(datos.fuente._id).lean();
    expect((await registrarMongo(datos.ruta, { ...datos.pagoBody, version: fuente.__v,
      monto_pagado: 5, monto_pagado_bs: 500, solicitud_id: require('crypto').randomUUID() })).status).toBe(201);
    expect((await peticion('get', datos.rutaCobertura)).status).toBe(409);
    const lista = (await peticion('get', `${datos.base}/cargos`)).body;
    expect(lista.filas.find((cargo) => cargo._id === String(fuente._id)).puede_revisar_cobertura).toBe(false);
    const anteriores = await datos.Cargo.find({ campania: fuente.campania }).sort({ _id: 1 }).lean();
    expect((await corregirMongo('post', datos.rutaCobertura, datos.bodyCobertura)).status).toBe(409);
    expect(await datos.Cargo.find({ campania: fuente.campania }).sort({ _id: 1 }).lean()).toEqual(anteriores);
  });

  test('cobertura manual Mongo admite varios hermanos de distintas sedes sin duplicar importe ni tocar otros grupos', async () => {
    const datos = await prepararConversionMongo();
    const sede = await modelosMongo.alfa.Sede.create({ nombre: 'Otra sede para hermano', direccion: 'QA', costo: 20 });
    await modelosMongo.alfa.CampaniaCobro.updateOne({ _id: datos.resumen.campania._id }, { $addToSet: { sedes: sede._id } });
    const nuevo = await crearAtletaMongo('alfa', { nombres: 'Hermano adicional', sede: sede._id, representante: datos.representante._id });
    expect((await corregirMongo('post', `${datos.base}/ajustes-cargos`, { accion: 'agregar', alumno: String(nuevo._id),
      version: datos.body.version, modalidad: 'general', nota_interna: '', solicitud_id: require('crypto').randomUUID() })).status).toBe(200);
    const fuente = datos.originales.find((cargo) => String(cargo.alumno) === String(datos.atletas[0]._id));
    const ruta = `${datos.base}/cargos/${fuente._id}/pagos`;
    const pago = await registrarMongo(ruta, { ...datos.pagoBody, monto_pagado: 10, monto_pagado_bs: 1000 });
    expect(pago.status).toBe(201);
    const conversion = (await peticion('get', datos.rutaConversion)).body;
    expect((await corregirMongo('post', datos.rutaConversion, { ...datos.body, version: conversion.campania.__v,
      revision: conversion.revision })).status).toBe(200);
    expect((await corregirMongo('post', `${ruta}/${pago.body.pago._id}/confirmar`)).status).toBe(200);
    const otros = await datos.Cargo.find({ campania: fuente.campania, alumno: { $in: datos.atletas.slice(2).map((atleta) => atleta._id) } })
      .select('+nota_interna').sort({ _id: 1 }).lean();
    const rutaCobertura = `${datos.base}/cargos/${fuente._id}/cobertura-familiar`;
    const lectura = await peticion('get', rutaCobertura);
    expect(lectura.status).toBe(200);
    expect(lectura.body.hermanos).toHaveLength(2);
    expect((await corregirMongo('post', rutaCobertura, { version: lectura.body.campania.__v, revision: lectura.body.revision,
      solicitud_id: require('crypto').randomUUID() })).status).toBe(200);
    expect(await datos.Cargo.find({ campania: fuente.campania, alumno: { $in: datos.atletas.slice(2).map((atleta) => atleta._id) } })
      .select('+nota_interna').sort({ _id: 1 }).lean()).toEqual(otros);
    expect((await peticion('get', `${datos.base}/cargos`)).body.totales).toMatchObject({ participantes: 5, cobros: 3,
      representantes: 1, total_esperado: 30 });
  });

  test.each(['en_revision', 'saldo_inconsistente', 'eliminado'])('cobertura manual Mongo rechaza origen %s y no escribe', async (estado) => {
    const datos = await prepararCoberturaMongo({ confirmar: false });
    if (estado === 'saldo_inconsistente') {
      const pago = datos.pagos[0];
      expect((await corregirMongo('patch', `${datos.ruta}/${pago._id}`, { ...datos.pagoBody, version: 1,
        solicitud_id: require('crypto').randomUUID() })).status).toBe(200);
      expect((await corregirMongo('post', `${datos.ruta}/${pago._id}/confirmar`)).status).toBe(200);
      await datos.Cargo.updateOne({ _id: datos.fuente._id }, { $set: { saldo_pendiente: 4 } });
    } else if (estado === 'eliminado') {
      expect((await corregirMongo('delete', `${datos.ruta}/${datos.pagos[0]._id}`, { version: 1 })).status).toBe(200);
    }
    const antes = await datos.Cargo.find({ campania: datos.fuente.campania }).select('+nota_interna').sort({ _id: 1 }).lean();
    expect((await peticion('get', datos.rutaCobertura)).status).toBe(409);
    const actual = await modelosMongo.alfa.CampaniaCobro.findById(datos.fuente.campania).lean();
    expect((await corregirMongo('post', datos.rutaCobertura, { version: actual.__v, revision: 'a'.repeat(64),
      solicitud_id: require('crypto').randomUUID() })).status).toBe(409);
    expect(await datos.Cargo.find({ campania: datos.fuente.campania }).select('+nota_interna').sort({ _id: 1 }).lean()).toEqual(antes);
  });

  test.each(['en_revision', 'abono', 'pagado', 'eliminado', 'importe', 'modalidad', 'retirado', 'representante', 'sin_representante'])
  ('cobertura manual Mongo rechaza hermano %s conservando toda la familia', async (caso) => {
    const datos = await prepararCoberturaMongo();
    const hermano = await datos.Cargo.findById(datos.hermano._id).lean();
    if (['en_revision', 'abono', 'pagado', 'eliminado'].includes(caso)) {
      const ruta = `${datos.base}/cargos/${hermano._id}/pagos`;
      const pago = await registrarMongo(ruta, { ...datos.pagoBody, version: hermano.__v, solicitud_id: require('crypto').randomUUID(),
        monto_pagado: caso === 'pagado' ? 10 : 5, monto_pagado_bs: caso === 'pagado' ? 1000 : 500,
        estado: ['abono', 'pagado'].includes(caso) ? 'confirmado' : 'en_revision' });
      expect(pago.status).toBe(201);
      if (caso === 'eliminado') expect((await corregirMongo('delete', `${ruta}/${pago.body.pago._id}`, { version: hermano.__v + 1 })).status).toBe(200);
    } else if (['representante', 'sin_representante'].includes(caso)) {
      await datos.Alumno.updateOne({ _id: hermano.alumno }, caso === 'representante'
        ? { $set: { representante: new mongoose.Types.ObjectId() } } : { $unset: { representante: '' } });
    } else {
      expect((await corregirMongo('post', `${datos.base}/ajustes-cargos`, { accion: caso === 'retirado' ? 'retirar' : 'editar',
        alumno: String(hermano.alumno), version: datos.bodyCobertura.version, version_cargo: hermano.__v,
        modalidad: 'personalizado', ...(caso !== 'retirado' ? { monto: caso === 'importe' ? 20 : 10 } : {}),
        nota_interna: '', solicitud_id: require('crypto').randomUUID() })).status).toBe(200);
    }
    const antes = await datos.Cargo.find({ campania: hermano.campania }).select('+nota_interna').sort({ _id: 1 }).lean();
    expect((await peticion('get', datos.rutaCobertura)).status).toBe(409);
    expect((await corregirMongo('post', datos.rutaCobertura, datos.bodyCobertura)).status).toBe(409);
    expect(await datos.Cargo.find({ campania: hermano.campania }).select('+nota_interna').sort({ _id: 1 }).lean()).toEqual(antes);
  });

  test('cobertura manual Mongo rechaza origen sin representante, ajeno, campanas no abiertas y datos inconsistentes', async () => {
    const datos = await prepararCoberturaMongo();
    await datos.Alumno.updateOne({ _id: datos.fuente.alumno }, { $unset: { representante: '' } });
    expect((await peticion('get', datos.rutaCobertura)).status).toBe(409);
    await datos.Alumno.updateOne({ _id: datos.fuente.alumno }, { $set: { representante: datos.representante._id } });
    for (const estado of ['cerrada', 'cancelada', 'borrador']) {
      await modelosMongo.alfa.CampaniaCobro.updateOne({ _id: datos.fuente.campania }, { $set: { estado } });
      expect((await peticion('get', datos.rutaCobertura)).status).toBe(409);
      expect((await corregirMongo('post', datos.rutaCobertura, datos.bodyCobertura)).status).toBe(409);
    }
    await modelosMongo.alfa.CampaniaCobro.updateOne({ _id: datos.fuente.campania }, { $set: { estado: 'abierta', unidad_cobro: 'atleta' } });
    expect((await peticion('get', datos.rutaCobertura)).status).toBe(409);
    await modelosMongo.alfa.CampaniaCobro.updateOne({ _id: datos.fuente.campania }, { $set: { unidad_cobro: 'representante', 'totales_cargos.total_esperado': 99 } });
    expect((await peticion('get', datos.rutaCobertura)).status).toBe(409);
    expect((await peticion('get', `${datos.base}/cargos/${new mongoose.Types.ObjectId()}/cobertura-familiar`)).status).toBe(409);
    expect((await peticion('get', `${datos.base}/cargos/invalid/cobertura-familiar`)).status).toBe(400);
  });

  test('cobertura manual Mongo limita permisos, valida cuerpo y aisla academias', async () => {
    const datos = await prepararCoberturaMongo();
    for (const rol of ['usuario', 'entrenador']) {
      for (const method of ['get', 'post']) {
        expect((await request(app)[method](datos.rutaCobertura).set('Authorization', `Bearer ${tokenPublicacion(rol)}`)
          .send(method === 'post' ? datos.bodyCobertura : undefined)).status).toBe(403);
      }
    }
    expect((await request(app).get(datos.rutaCobertura)).status).toBe(401);
    expect((await peticion('get', datos.rutaCobertura, undefined, 'beta')).status).toBe(404);
    expect((await request(app).post(datos.rutaCobertura).set('x-tenant', 'beta')
      .set('Authorization', `Bearer ${tokenPublicacion('admin', 'beta')}`).send(datos.bodyCobertura)).status).toBe(404);
    for (const body of [{ ...datos.bodyCobertura, monto: 0 }, { ...datos.bodyCobertura, revision: 'falsa' },
      { ...datos.bodyCobertura, version: '1' }, { ...datos.bodyCobertura, solicitud_id: 'invalida' }]) {
      expect((await corregirMongo('post', datos.rutaCobertura, body)).status).toBe(400);
    }
    expect((await request(app).post(datos.rutaCobertura).set('Authorization', `Bearer ${tokenPublicacion('super_admin')}`)
      .send(datos.bodyCobertura)).status).toBe(200);
  });

  test.each([5, 10])('cobertura manual Mongo admite origen con %i confirmado e historial eliminado sin cambiar ningun pago', async (pagado) => {
    const datos = await prepararCoberturaMongo({ confirmar: false });
    expect((await corregirMongo('delete', `${datos.ruta}/${datos.pagos[0]._id}`, { version: 1 })).status).toBe(200);
    expect((await registrarMongo(datos.ruta, { ...datos.pagoBody, version: 2, monto_pagado: pagado, monto_pagado_bs: pagado * 100,
      estado: 'confirmado', solicitud_id: require('crypto').randomUUID() })).status).toBe(201);
    const fuente = await datos.Cargo.findById(datos.fuente._id).lean();
    expect(fuente.estado).toBe(pagado === 10 ? 'pagado' : 'abono');
    const preview = await peticion('get', datos.rutaCobertura);
    expect(preview.status).toBe(200);
    const pagos = await datos.Pago.find({ cargo: fuente._id }).select('+modificaciones +huella').sort({ _id: 1 }).lean();
    expect((await corregirMongo('post', datos.rutaCobertura, { version: preview.body.campania.__v, revision: preview.body.revision,
      solicitud_id: require('crypto').randomUUID() })).status).toBe(200);
    expect(await datos.Pago.find({ cargo: fuente._id }).select('+modificaciones +huella').sort({ _id: 1 }).lean()).toEqual(pagos);
    expect(await datos.Cargo.findById(fuente._id).lean()).toMatchObject({
      tipo_cobro: 'representante', estado: fuente.estado, monto: 10, saldo_pendiente: 10 - pagado });
  });

  test('cobertura manual Mongo detecta cambios sin version en pagos o representante desde la vista previa', async () => {
    const datos = await prepararCoberturaMongo();
    await datos.Pago.updateOne({ _id: datos.pagos[0]._id }, { $set: { referencia: '999991' } });
    expect((await corregirMongo('post', datos.rutaCobertura, datos.bodyCobertura)).status).toBe(409);
    const preview = (await peticion('get', datos.rutaCobertura)).body;
    await datos.Representante.updateOne({ _id: datos.representante._id }, { $set: { nombres: 'Representante actualizado' } });
    expect((await corregirMongo('post', datos.rutaCobertura, { ...datos.bodyCobertura,
      revision: preview.revision })).status).toBe(409);
    expect(await datos.Cargo.countDocuments({ campania: datos.fuente.campania, tipo_cobro: 'cubierto_por_representante' })).toBe(0);
  });

  test('cobertura manual Mongo revierte todo si falla despues de actualizar el origen y permite reintentar', async () => {
    const datos = await prepararCoberturaMongo();
    const anteriores = await datos.Cargo.find({ campania: datos.fuente.campania }).select('+nota_interna').sort({ _id: 1 }).lean();
    const campania = await modelosMongo.alfa.CampaniaCobro.findById(datos.fuente.campania).select('+coberturas_familiares').lean();
    const original = datos.Cargo.findOneAndUpdate.bind(datos.Cargo);
    const simulado = jest.spyOn(datos.Cargo, 'findOneAndUpdate').mockImplementationOnce((...args) => ({
      lean: async () => { await original(...args).lean(); throw new Error('Fallo QA despues de actualizar origen'); }
    }));
    try { expect((await corregirMongo('post', datos.rutaCobertura, datos.bodyCobertura)).status).toBe(500); }
    finally { simulado.mockRestore(); }
    expect(await datos.Cargo.find({ campania: datos.fuente.campania }).select('+nota_interna').sort({ _id: 1 }).lean()).toEqual(anteriores);
    expect(await modelosMongo.alfa.CampaniaCobro.findById(datos.fuente.campania).select('+coberturas_familiares').lean()).toEqual(campania);
    expect((await corregirMongo('post', datos.rutaCobertura, datos.bodyCobertura)).status).toBe(200);
  });

  test('cobertura manual Mongo restaura los cargos absorbidos y el origen si falla despues de eliminar hermanos', async () => {
    const datos = await prepararCoberturaMongo();
    const anteriores = await datos.Cargo.find({ campania: datos.fuente.campania }).select('+nota_interna').sort({ _id: 1 }).lean();
    const campania = await modelosMongo.alfa.CampaniaCobro.findById(datos.fuente.campania).select('+coberturas_familiares').lean();
    const pagos = await datos.Pago.find({ campania: datos.fuente.campania }).select('+modificaciones +huella').sort({ _id: 1 }).lean();
    const original = datos.Cargo.deleteMany.bind(datos.Cargo);
    const simulado = jest.spyOn(datos.Cargo, 'deleteMany').mockImplementationOnce(async (...args) => {
      await original(...args);
      throw new Error('Fallo QA despues de absorber hermanos');
    });
    try { expect((await corregirMongo('post', datos.rutaCobertura, datos.bodyCobertura)).status).toBe(500); }
    finally { simulado.mockRestore(); }
    expect(await datos.Cargo.find({ campania: datos.fuente.campania }).select('+nota_interna').sort({ _id: 1 }).lean()).toEqual(anteriores);
    expect(await modelosMongo.alfa.CampaniaCobro.findById(datos.fuente.campania).select('+coberturas_familiares').lean()).toEqual(campania);
    expect(await datos.Pago.find({ campania: datos.fuente.campania }).select('+modificaciones +huella').sort({ _id: 1 }).lean()).toEqual(pagos);
    expect((await corregirMongo('post', datos.rutaCobertura, datos.bodyCobertura)).status).toBe(200);
  });

  test('cobertura manual Mongo serializa solicitudes simultaneas y rechaza reusar UUID con otro cuerpo o actor', async () => {
    const datos = await prepararCoberturaMongo();
    const respuestas = await Promise.all([corregirMongo('post', datos.rutaCobertura, datos.bodyCobertura),
      corregirMongo('post', datos.rutaCobertura, datos.bodyCobertura)]);
    expect(respuestas.map((respuesta) => respuesta.status)).toEqual([200, 200]);
    expect(respuestas.filter((respuesta) => respuesta.body.repetida)).toHaveLength(1);
    expect((await corregirMongo('post', datos.rutaCobertura, { ...datos.bodyCobertura, revision: 'b'.repeat(64) })).status).toBe(409);
    expect((await request(app).post(datos.rutaCobertura).set('Authorization', `Bearer ${tokenPublicacion('super_admin')}`)
      .send(datos.bodyCobertura)).status).toBe(409);
    expect((await corregirMongo('post', datos.rutaCobertura, { ...datos.bodyCobertura,
      solicitud_id: require('crypto').randomUUID() })).status).toBe(409);
    expect((await modelosMongo.alfa.CampaniaCobro.findById(datos.fuente.campania).select('+coberturas_familiares').lean())
      .coberturas_familiares).toHaveLength(1);
  });

  test('cobertura manual Mongo competir con pago del hermano no deja pagos en cargo cubierto', async () => {
    const datos = await prepararCoberturaMongo();
    const [cobertura, pago] = await Promise.all([
      corregirMongo('post', datos.rutaCobertura, datos.bodyCobertura),
      registrarMongo(`${datos.base}/cargos/${datos.hermano._id}/pagos`, { ...datos.pagoBody,
        version: datos.hermano.__v, solicitud_id: require('crypto').randomUUID() })
    ]);
    expect([cobertura.status === 200, pago.status === 201].filter(Boolean)).toHaveLength(1);
    const hermano = await datos.Cargo.findById(datos.hermano._id).lean();
    if (cobertura.status === 200) {
      expect(hermano).toBeNull();
      expect(await datos.Pago.countDocuments({ cargo: datos.hermano._id })).toBe(0);
    } else {
      expect(cobertura.status).toBe(409);
      expect(hermano.tipo_cobro).toBe('atleta');
      expect(hermano.monto).toBe(10);
    }
  });

  test('cobertura manual Mongo cierra, reabre al eliminar el pago familiar y cierra al confirmar repago', async () => {
    const datos = await prepararCoberturaMongo();
    for (const cargo of await datos.Cargo.find({ campania: datos.fuente.campania,
      alumno: { $in: datos.atletas.slice(2).map((atleta) => atleta._id) } }).lean()) {
      expect((await registrarMongo(`${datos.base}/cargos/${cargo._id}/pagos`, { ...datos.pagoBody,
        version: cargo.__v, estado: 'confirmado', monto_pagado: 10, monto_pagado_bs: 1000,
        solicitud_id: require('crypto').randomUUID() })).status).toBe(201);
    }
    const preview = (await peticion('get', datos.rutaCobertura)).body;
    const body = { ...datos.bodyCobertura, version: preview.campania.__v, revision: preview.revision };
    const aplicada = await corregirMongo('post', datos.rutaCobertura, body);
    expect(aplicada.status).toBe(200);
    expect(aplicada.body.campania.estado).toBe('cerrada');
    expect((await corregirMongo('post', datos.rutaCobertura, body)).body.repetida).toBe(true);
    expect((await peticion('get', `${datos.base}/cargos`)).status).toBe(200);
    const fuente = await datos.Cargo.findById(datos.fuente._id).lean();
    expect((await corregirMongo('delete', `${datos.ruta}/${datos.pagos[0]._id}`, { version: fuente.__v })).status).toBe(200);
    expect((await modelosMongo.alfa.CampaniaCobro.findById(fuente.campania).lean()).estado).toBe('abierta');
    const pendiente = (await peticion('get', `${datos.base}/cargos`)).body;
    expect(pendiente.totales).toMatchObject({ cobros: 3, total_esperado: 30 });
    expect(pendiente.filas.reduce((total, cargo) => total + cargo.saldo_pendiente, 0)).toBe(10);
    for (const atleta of [fuente.alumno, datos.hermano.alumno]) {
      const portal = await datos.propio('get', `/campanias/mis-cargos?alumnoId=${atleta}`);
      expect(portal.status).toBe(200);
      expect(portal.body.cargos).toHaveLength(1);
      expect(portal.body.cargos[0]).toMatchObject({ _id: String(fuente._id), estado: 'pendiente', saldo_pendiente: 10 });
    }
    const repago = await registrarMongo(datos.ruta, { ...datos.pagoBody, version: fuente.__v + 1,
      monto_pagado: 10, monto_pagado_bs: 1000, solicitud_id: require('crypto').randomUUID() });
    expect(repago.status).toBe(201);
    expect((await modelosMongo.alfa.CampaniaCobro.findById(fuente.campania).lean()).estado).toBe('abierta');
    expect((await corregirMongo('post', `${datos.ruta}/${repago.body.pago._id}/confirmar`)).status).toBe(200);
    expect((await modelosMongo.alfa.CampaniaCobro.findById(fuente.campania).lean()).estado).toBe('cerrada');
    const saldada = (await peticion('get', `${datos.base}/cargos`)).body;
    expect(saldada.totales.total_esperado).toBe(30);
    expect(saldada.filas.every((cargo) => cargo.estado === 'pagado' && cargo.saldo_pendiente === 0)).toBe(true);
    expect(await datos.Cargo.countDocuments({ campania: fuente.campania })).toBe(3);
  });

  test('cobertura manual Mongo competir con eliminar pago de origen conserva saldo familiar coherente', async () => {
    const datos = await prepararCoberturaMongo();
    const fuente = await datos.Cargo.findById(datos.fuente._id).lean();
    const [cobertura, eliminacion] = await Promise.all([
      corregirMongo('post', datos.rutaCobertura, datos.bodyCobertura),
      corregirMongo('delete', `${datos.ruta}/${datos.pagos[0]._id}`, { version: fuente.__v })
    ]);
    expect([cobertura.status === 200, eliminacion.status === 200].filter(Boolean)).toHaveLength(1);
    const hermano = await datos.Cargo.findById(datos.hermano._id).lean();
    const compartido = await datos.Cargo.findById(datos.fuente._id).lean();
    const pago = await datos.Pago.findById(datos.pagos[0]._id).lean();
    if (cobertura.status === 200) {
      expect(eliminacion.status).toBe(409);
      expect(hermano).toBeNull();
      expect(compartido.tipo_cobro).toBe('representante');
      expect(pago.estado).toBe('confirmado');
    } else {
      expect(cobertura.status).toBe(409);
      expect(hermano.tipo_cobro).toBe('atleta');
      expect(pago.estado).toBe('eliminado');
    }
  });

  test('conversion Mongo conserva No aplica y no admite convertir campanas cerradas', async () => {
    const datos = await prepararConversionMongo();
    const id = datos.resumen.campania._id;
    await datos.Cargo.updateMany({ campania: id, alumno: { $in: datos.atletas.slice(0, 2).map((atleta) => atleta._id) } },
      { $set: { modalidad: 'no_aplica', monto: 0, saldo_pendiente: 0, estado: 'no_aplica' } });
    await modelosMongo.alfa.CampaniaCobro.updateOne({ _id: id }, { $set: {
      totales_cargos: { participantes: 4, generales: 2, personalizados: 0, no_aplica: 2, total_esperado: 20 } }, $inc: { __v: 1 } });
    const preview = (await peticion('get', datos.rutaConversion)).body;
    expect(preview.totales).toMatchObject({ participantes: 4, cobros: 3, no_aplica: 1, total_esperado: 20 });
    await modelosMongo.alfa.CampaniaCobro.updateOne({ _id: id }, { $set: { estado: 'cerrada' } });
    expect((await peticion('get', datos.rutaConversion)).status).toBe(409);
    expect((await corregirMongo('post', datos.rutaConversion, { ...datos.body, version: preview.campania.__v, revision: preview.revision })).status).toBe(409);
    await modelosMongo.alfa.CampaniaCobro.updateOne({ _id: id }, { $set: { estado: 'abierta' } });
    expect((await corregirMongo('post', datos.rutaConversion, { ...datos.body, version: preview.campania.__v, revision: preview.revision })).status).toBe(200);
    const cargos = (await peticion('get', `${datos.base}/cargos`)).body.filas;
    expect(cargos.find((fila) => fila.tipo_cobro === 'representante')).toMatchObject({ modalidad: 'no_aplica', estado: 'no_aplica', monto: 0, saldo_pendiente: 0 });
  });
});