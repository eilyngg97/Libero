const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
jest.mock('../config/secrets', () => ({ getJwtVerificationSecrets: () => ['qa-subscription-secret'] }));
const router = require('../routes/tenantSubscription');
const { buildTenantSubscription, publicTenantContext } = require('../services/tenantSubscriptionService');
const { getTenantCoreModel } = require('../models/TenantCore');
const mongoose = require('mongoose');

const tenants = {
  alfa: { nombre: 'Alfa', suscripcion: { plan: 'Pro', costo_mensual_usd: 25, recordatorio_pago_activo: true, datos_pago: { banco: 'Banco Alfa' } } },
  beta: { nombre: 'Beta', suscripcion: { plan: 'Base', costo_mensual_usd: 0, recordatorio_pago_activo: false } }
};
const app = express();
app.use((req, res, next) => { req.tenantId = req.get('x-tenant') || 'alfa'; req.tenant = tenants[req.tenantId]; next(); });
app.use('/suscripcion', router);
const token = (rol, tenantId = 'alfa') => jwt.sign({ rol, tenantId }, 'qa-subscription-secret');

test.each(['admin', 'super_admin'])('permite consultar a %s y no mezcla academias', async (rol) => {
  const response = await request(app).get('/suscripcion').set('Authorization', `Bearer ${token(rol)}`);
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body).toMatchObject({ tenantId: 'alfa', plan: 'Pro', costo_mensual_usd: 25, recordatorio_pago_activo: true, datos_pago: { banco: 'Banco Alfa' } });
  const beta = await request(app).get('/suscripcion').set('x-tenant', 'beta').set('Authorization', `Bearer ${token(rol, 'beta')}`);
  expect(beta.body).toMatchObject({ tenantId: 'beta', plan: 'Base', costo_mensual_usd: 0, recordatorio_pago_activo: false });
});

test.each(['usuario', 'entrenador', 'staff'])('rechaza el rol %s', async (rol) => {
  const response = await request(app).get('/suscripcion').set('Authorization', `Bearer ${token(rol)}`);
  expect(response.status).toBe(403);
});

test('rechaza sesiones ausentes y tokens de otro tenant', async () => {
  expect((await request(app).get('/suscripcion')).status).toBe(401);
  expect((await request(app).get('/suscripcion').set('x-tenant', 'beta').set('Authorization', `Bearer ${token('admin')}`)).status).toBe(403);
});

test('sin configuracion no activa el aviso ni inventa un importe', () => {
  expect(buildTenantSubscription()).toMatchObject({ plan: '', costo_mensual_usd: null, recordatorio_pago_activo: false });
  expect(buildTenantSubscription({ suscripcion: { recordatorio_pago_activo: 'false', costo_mensual_usd: '' } }).recordatorio_pago_activo).toBe(false);
  expect(buildTenantSubscription({ suscripcion: { costo_mensual_usd: -1 } }).costo_mensual_usd).toBe(null);
});

test('el contexto publico no expone informacion comercial', () => {
  expect(publicTenantContext({ ...tenants.alfa, tenantId: 'alfa', billing: {}, subscription: {}, plan: 'Privado', costo_plan_usd: 5 })).toEqual({ nombre: 'Alfa', tenantId: 'alfa' });
});

test('el esquema persiste el interruptor por tenant y valida el costo', () => {
  const connection = mongoose.createConnection();
  const Tenant = getTenantCoreModel(connection);
  const item = new Tenant({ tenantId: 'qa', nombre: 'QA', domains: ['qa.localhost'], dbUri: 'mongodb://localhost/qa' });
  expect(item.suscripcion.recordatorio_pago_activo).toBe(false);
  item.suscripcion.recordatorio_pago_activo = true;
  item.suscripcion.costo_mensual_usd = -1;
  expect(item.toObject().suscripcion.recordatorio_pago_activo).toBe(true);
  expect(item.validateSync().errors['suscripcion.costo_mensual_usd']).toBeDefined();
});