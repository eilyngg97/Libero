process.env.JWT_SECRET_CURRENT = 'notificaciones-test-secret';
jest.mock('../config/tenantBusinessConnection', () => ({
  getTenantBusinessConnection: jest.fn(async (tenant) => ({ tenantId: tenant.tenantId }))
}));
jest.mock('../services/tenantModelService', () => ({ getTenantModel: jest.fn() }));
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { getTenantModel } = require('../services/tenantModelService');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const router = require('../routes/notificaciones');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.tenantId = req.header('X-Test-Tenant') || 'academia-a';
  req.tenant = { tenantId: req.tenantId };
  next();
});
app.use('/api/notificaciones', router);
const auth = (rol = 'admin', tenantId = 'academia-a') => `Bearer ${jwt.sign({
  id: '507f1f77bcf86cd799439011', rol, tenantId
}, process.env.JWT_SECRET_CURRENT)}`;
function query(value) {
  const q = {};
  for (const method of ['select', 'populate', 'sort', 'skip', 'limit']) q[method] = jest.fn(() => q);
  q.lean = jest.fn().mockResolvedValue(value);
  return q;
}
let models;
beforeEach(() => {
  jest.clearAllMocks();
  models = {
    TenantConfig: {
      findOne: jest.fn(() => query(null)),
      findOneAndUpdate: jest.fn().mockResolvedValue({})
    },
    Mensualidad: { find: jest.fn(() => query([])) },
    PagoDetalle: { find: jest.fn(() => query([])) },
    Notificacion: { find: jest.fn(() => query([])), aggregate: jest.fn().mockResolvedValue([]) }
  };
  getTenantModel.mockImplementation((connection, name) => models[name] || {});
});

test.each(['usuario', 'entrenador', 'admin_dos'])('deniega consulta y cambios al rol %s', async (rol) => {
  expect((await request(app).get('/api/notificaciones?periodo=2026-11').set('Authorization', auth(rol))).status).toBe(403);
  expect((await request(app).patch('/api/notificaciones/configuracion').set('Authorization', auth(rol))
    .send({ habilitadas: true })).status).toBe(403);
  expect(getTenantModel).not.toHaveBeenCalled();
});

test('admin consulta, pero no puede activar con una llamada directa', async () => {
  const response = await request(app).get('/api/notificaciones?periodo=2026-11').set('Authorization', auth());
  expect(response.status).toBe(200);
  expect(response.body).toMatchObject({ habilitadas: false, envio_disponible: false,
    resumen: { calculados: 0, enviados: 0, entregados: 0, fallidos: 0 }, avisos: [], historial: [] });
  const denied = await request(app).patch('/api/notificaciones/configuracion').set('Authorization', auth())
    .send({ habilitadas: true });
  expect(denied.status).toBe(403);
  expect(models.TenantConfig.findOneAndUpdate).not.toHaveBeenCalled();
});

test('solo super_admin guarda la preferencia del tenant actual sin habilitar envios', async () => {
  const response = await request(app).patch('/api/notificaciones/configuracion')
    .set('Authorization', auth('super_admin')).send({ habilitadas: true });
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ habilitadas: true, envio_disponible: false, modo: 'vista_previa' });
  expect(models.TenantConfig.findOneAndUpdate).toHaveBeenCalledWith({ key: 'default' }, {
    $set: { 'notificaciones.habilitadas': true,
      'notificaciones.actualizado_por': '507f1f77bcf86cd799439011',
      'notificaciones.actualizado_en': expect.any(Date) }
  }, { upsert: true, runValidators: true });
  expect(getTenantBusinessConnection).toHaveBeenCalledWith({ tenantId: 'academia-a' });
});

test.each([{ habilitadas: 'true' }, { habilitadas: true, tenantId: 'academia-b' }, {}])(
  'rechaza configuracion invalida %j', async (body) => {
    const response = await request(app).patch('/api/notificaciones/configuracion')
      .set('Authorization', auth('super_admin')).send(body);
    expect(response.status).toBe(400);
    expect(models.TenantConfig.findOneAndUpdate).not.toHaveBeenCalled();
  });

test.each(['2026-13', '2026-0', '', 'bad'])('rechaza periodo %s', async (periodo) => {
  const response = await request(app).get(`/api/notificaciones?periodo=${periodo}`).set('Authorization', auth());
  expect(response.status).toBe(400);
  expect(getTenantModel).not.toHaveBeenCalled();
});

test('rechaza tokens de otra academia y solicitudes sin token', async () => {
  expect((await request(app).get('/api/notificaciones?periodo=2026-11')).status).toBe(401);
  expect((await request(app).get('/api/notificaciones?periodo=2026-11')
    .set('Authorization', auth('super_admin', 'academia-b'))).status).toBe(403);
  expect(getTenantModel).not.toHaveBeenCalled();
});

test('resuelve modelos en conexiones separadas por tenant sin aceptar selector ajeno por query', async () => {
  await request(app).get('/api/notificaciones?periodo=2026-11&tenantId=academia-b').set('Authorization', auth());
  expect(getTenantModel.mock.calls.every(([conn]) => conn.tenantId === 'academia-a')).toBe(true);
  getTenantModel.mockClear();
  await request(app).get('/api/notificaciones?periodo=2026-11').set('X-Test-Tenant', 'academia-b')
    .set('Authorization', auth('admin', 'academia-b'));
  expect(getTenantModel.mock.calls.every(([conn]) => conn.tenantId === 'academia-b')).toBe(true);
});

test('historial y totales distinguen aceptacion de entrega con paginacion', async () => {
  const q = query([{ _id: 'n1', estado: 'aceptado' }]);
  models.Notificacion.find.mockReturnValue(q);
  models.Notificacion.aggregate.mockResolvedValue([
    { _id: 'aceptado', cantidad: 20 }, { _id: 'entregado', cantidad: 10 }, { _id: 'fallido', cantidad: 2 }
  ]);
  const response = await request(app).get('/api/notificaciones?periodo=2026-11&pagina=2').set('Authorization', auth());
  expect(response.body.resumen).toMatchObject({ enviados: 30, aceptados: 20, entregados: 10, fallidos: 2 });
  expect(response.body.paginacion).toEqual({ pagina: 2, total: 32, por_pagina: 25 });
  expect(q.skip).toHaveBeenCalledWith(25);
  expect(q.limit).toHaveBeenCalledWith(25);
  expect(models.Notificacion.find).toHaveBeenCalledWith({ periodo: '2026-11' });
});

test('error de consulta no se presenta como cero envios exitoso', async () => {
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  models.TenantConfig.findOne.mockReturnValue({ select: () => ({
    lean: async () => { throw new Error('DB no disponible'); }
  }) });
  const response = await request(app).get('/api/notificaciones?periodo=2026-11').set('Authorization', auth());
  expect(response.status).toBe(500);
  expect(response.body.error).toBeTruthy();
  expect(log).toHaveBeenCalled();
  log.mockRestore();
});

test('calcula avisos con los modelos del tenant sin guardar cambios ni llamar a Meta', async () => {
  const network = jest.spyOn(global, 'fetch').mockRejectedValue(new Error('No llamar a Meta'));
  models.Mensualidad.find.mockReturnValue(query([{
    _id: 'm1', anio: 2026, mes: 11, monto_esperado: 20, estatus: 'Pendiente',
    fecha_vencimiento: '2026-11-11T03:59:59.999Z',
    id_alumno: { _id: 'a1', nombres: 'Andrea', activo: true,
      representante: { _id: 'r1', nombres: 'Maria', telefono: '04141234567' } }
  }]));
  const response = await request(app).get('/api/notificaciones?periodo=2026-11').set('Authorization', auth());
  expect(response.status).toBe(200);
  expect(response.body.avisos).toHaveLength(2);
  expect(response.body.avisos[0]).toMatchObject({ representante: 'Maria', fecha: '2026-11-09' });
  expect(models.PagoDetalle.find).toHaveBeenCalledWith({ id_mensualidad: { $in: ['m1'] } });
  expect(models.TenantConfig.findOneAndUpdate).not.toHaveBeenCalled();
  expect(network).not.toHaveBeenCalled();
  network.mockRestore();
});

test('la preferencia y el historial de otra academia se mantienen separados', async () => {
  const modelsA = models;
  const configB = { findOne: jest.fn(() => query({ notificaciones: { habilitadas: true } })) };
  const historialB = { find: jest.fn(() => query([{ _id: 'b1', representante_nombre: 'Representante B' }])),
    aggregate: jest.fn().mockResolvedValue([{ _id: 'aceptado', cantidad: 1 }]) };
  getTenantModel.mockImplementation((connection, name) => {
    if (connection.tenantId === 'academia-b' && name === 'TenantConfig') return configB;
    if (connection.tenantId === 'academia-b' && name === 'Notificacion') return historialB;
    return modelsA[name] || {};
  });
  const a = await request(app).get('/api/notificaciones?periodo=2026-11').set('Authorization', auth());
  const b = await request(app).get('/api/notificaciones?periodo=2026-11').set('X-Test-Tenant', 'academia-b')
    .set('Authorization', auth('admin', 'academia-b'));
  expect(a.body).toMatchObject({ habilitadas: false, historial: [], resumen: { enviados: 0 } });
  expect(b.body).toMatchObject({ habilitadas: true,
    historial: [{ _id: 'b1', representante_nombre: 'Representante B' }], resumen: { enviados: 1 } });
});
