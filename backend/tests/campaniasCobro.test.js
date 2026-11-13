const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../config/secrets', () => ({ getJwtVerificationSecrets: () => ['qa-campanias-secret'] }));
jest.mock('../config/tenantBusinessConnection', () => ({
  getTenantBusinessConnection: jest.fn(async (tenant) => ({ tenantId: tenant.tenantId }))
}));
jest.mock('../services/tenantModelService', () => ({ getTenantModel: jest.fn() }));

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
const token = (rol, tenantId = 'alfa', permisos = []) => jwt.sign({ rol, tenantId, permisos }, 'qa-campanias-secret');
let consulta;
const tokenPublicacion = (rol = 'admin', tenantId = 'alfa') => jwt.sign({ rol, tenantId, id: 'admin-qa' }, 'qa-campanias-secret');

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
});