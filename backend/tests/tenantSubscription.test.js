const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
jest.mock('../config/secrets', () => ({ getJwtVerificationSecrets: () => ['qa-subscription-secret'] }));
jest.mock('../config/tenantBusinessConnection', () => ({
  getTenantBusinessConnection: jest.fn(async (tenant) => ({ tenantId: tenant.tenantId || tenant.nombre.toLowerCase() }))
}));
jest.mock('../services/tenantModelService', () => ({
  getTenantModel: jest.fn((connection) => ({
    countDocuments: jest.fn(async () => connection.tenantId === 'alfa' ? 212 : 50)
  }))
}));
const router = require('../routes/tenantSubscription');
const { buildTenantSubscription, publicTenantContext, resolveSubscriptionPlan } = require('../services/tenantSubscriptionService');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const { getTenantCoreModel } = require('../models/TenantCore');
const mongoose = require('mongoose');

const tenants = {
  alfa: { nombre: 'Alfa', suscripcion: { plan: 'Pro', costo_mensual_usd: 25, recordatorio_pago_activo: true, datos_pago: { banco: 'Banco Alfa' } } },
  beta: { nombre: 'Beta', suscripcion: { plan: 'Base', costo_mensual_usd: 0, recordatorio_pago_activo: false } },
  cantevista: { tenantId: 'cantevista', nombre: 'Cantevista', suscripcion: { recordatorio_pago_activo: true } },
  fenix: { tenantId: 'fenix', nombre: 'Fenix', suscripcion: { recordatorio_pago_activo: false } },
  esporta: { tenantId: 'esporta', nombre: 'Esporta', suscripcion: { recordatorio_pago_activo: true } }
};
const app = express();
app.use((req, res, next) => { req.tenantId = req.get('x-tenant') || 'alfa'; req.tenant = tenants[req.tenantId]; next(); });
app.use('/suscripcion', router);
const token = (rol, tenantId = 'alfa') => jwt.sign({ rol, tenantId }, 'qa-subscription-secret');

test.each(['admin', 'super_admin'])('permite consultar a %s y no mezcla academias', async (rol) => {
  const response = await request(app).get('/suscripcion').set('Authorization', `Bearer ${token(rol)}`);
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(response.body).toMatchObject({ tenantId: 'alfa', plan: 'Plan Elite', costo_mensual_usd: 70, total_alumnos_activos: 212, recordatorio_pago_activo: true, datos_pago: { banco: 'Banco Alfa' } });
  const beta = await request(app).get('/suscripcion').set('x-tenant', 'beta').set('Authorization', `Bearer ${token(rol, 'beta')}`);
  expect(beta.body).toMatchObject({ tenantId: 'beta', plan: 'Plan Inicial', costo_mensual_usd: 20, total_alumnos_activos: 50, recordatorio_pago_activo: false });
});

test.each([
  [0, 'Plan Inicial', 20], [50, 'Plan Inicial', 20],
  [51, 'Plan Crecimiento', 35], [100, 'Plan Crecimiento', 35],
  [101, 'Plan Profesional', 50], [200, 'Plan Profesional', 50],
  [201, 'Plan Elite', 70], [10000, 'Plan Elite', 70]
])('asigna automaticamente el plan para %i alumnos activos', (total, plan, costo) => {
  expect(resolveSubscriptionPlan(total)).toEqual({ plan, costo_mensual_usd: costo });
});

test('cuenta activos en la base de la academia sin limitar por sede', async () => {
  const response = await request(app).get('/suscripcion').set('Authorization', `Bearer ${token('admin')}`);
  expect(response.status).toBe(200);
  expect(getTenantBusinessConnection).toHaveBeenLastCalledWith(tenants.alfa);
  expect(getTenantModel).toHaveBeenLastCalledWith({ tenantId: 'alfa' }, 'Alumno');
  const model = getTenantModel.mock.results[getTenantModel.mock.results.length - 1].value;
  expect(model.countDocuments).toHaveBeenCalledWith({ activo: { $ne: false }, dado_de_baja: { $ne: true } });
});

test('recalcula al cambiar el conteo y conserva la configuracion del recordatorio', async () => {
  getTenantModel.mockReturnValueOnce({ countDocuments: jest.fn().mockResolvedValue(100) });
  const response = await request(app).get('/suscripcion').set('Authorization', `Bearer ${token('admin')}`);
  expect(response.body).toMatchObject({ plan: 'Plan Crecimiento', costo_mensual_usd: 35, recordatorio_pago_activo: true });
  expect(tenants.alfa.suscripcion.plan).toBe('Pro');
});

test('un fallo de conteo no devuelve un plan guardado ni una tarifa inventada', async () => {
  getTenantModel.mockReturnValueOnce({ countDocuments: jest.fn().mockRejectedValue(new Error('sin conexion')) });
  const response = await request(app).get('/suscripcion').set('Authorization', `Bearer ${token('admin')}`);
  expect(response.status).toBe(500);
  expect(response.body.plan).toBeUndefined();
});

test.each([-1, NaN, 1.5, '50'])('rechaza conteos invalidos: %s', (total) => {
  expect(() => resolveSubscriptionPlan(total)).toThrow('Conteo de alumnos activos invalido');
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

describe.each(['cantevista', 'fenix', 'esporta'])('matriz antigua de %s', (tenantId) => {
  test.each([
    [0, 'Plan Inicial', 15], [50, 'Plan Inicial', 15],
    [51, 'Plan Crecimiento', 25], [100, 'Plan Crecimiento', 25],
    [101, 'Plan Profesional', 40], [200, 'Plan Profesional', 40],
    [201, 'Plan Elite', 50], [10000, 'Plan Elite', 50]
  ])('conserva la tarifa antigua para %i alumnos activos', (total, plan, costo) => {
    expect(resolveSubscriptionPlan(total, tenantId)).toEqual({ plan, costo_mensual_usd: costo });
  });

  test('la API usa su matriz y conserva el interruptor al cambiar de plan', async () => {
    for (const [total, plan, cost] of [[50, 'Plan Inicial', 15], [201, 'Plan Elite', 50]]) {
      getTenantModel.mockReturnValueOnce({ countDocuments: jest.fn().mockResolvedValue(total) });
      const response = await request(app).get('/suscripcion').set('x-tenant', tenantId)
        .set('Authorization', `Bearer ${token('admin', tenantId)}`);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ tenantId, plan, costo_mensual_usd: cost,
        total_alumnos_activos: total, recordatorio_pago_activo: tenants[tenantId].suscripcion.recordatorio_pago_activo });
    }
  });
});

test.each(['villasport', 'fenix-nueva', 'otra-esporta', ''])('no aplica la matriz antigua a %s', (tenantId) => {
  expect(resolveSubscriptionPlan(201, tenantId)).toEqual({ plan: 'Plan Elite', costo_mensual_usd: 70 });
});

test('normaliza el identificador sin usar el nombre comercial ni precios guardados', () => {
  expect(resolveSubscriptionPlan(101, ' FENIX ')).toEqual({ plan: 'Plan Profesional', costo_mensual_usd: 40 });
  expect(buildTenantSubscription({ nombre: 'fenix', suscripcion: { costo_mensual_usd: 40 } }, 'otra', 101))
    .toMatchObject({ plan: 'Plan Profesional', costo_mensual_usd: 50 });
});