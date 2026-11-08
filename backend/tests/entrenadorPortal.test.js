const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
jest.mock('../config/secrets', () => ({ getJwtVerificationSecrets: () => ['qa-portal'] }));
jest.mock('../config/tenantBusinessConnection', () => ({ getTenantBusinessConnection: jest.fn(async tenant => tenant) }));
const mockModels = {};
jest.mock('../services/tenantModelService', () => ({ getTenantModel: jest.fn((connection, name) => mockModels[name]) }));
const router = require('../routes/entrenadorPortal');
const app = express();
app.use(express.json());
app.use((req, res, next) => { req.tenantId = req.get('x-tenant') || 'alfa'; req.tenant = { tenantId: req.tenantId }; next(); });
app.use('/portal', router);
const trainerId = '507f1f77bcf86cd799439017';
const userId = '507f1f77bcf86cd799439018';
const groupId = '507f1f77bcf86cd799439012';
const sedeId = '507f1f77bcf86cd799439011';
const query = value => {
  const result = { lean: jest.fn(async () => value) };
  for (const method of ['select', 'sort']) result[method] = jest.fn(() => result);
  return result;
};
const auth = (role = 'entrenador', tenantId = 'alfa') => `Bearer ${jwt.sign({ id: userId, rol: role, roles: ['entrenador', 'usuario'], tenantId }, 'qa-portal')}`;
beforeEach(() => {
  jest.clearAllMocks();
  mockModels.Entrenador = { findOne: jest.fn(() => query({ _id: trainerId, usuario: userId, nombre: 'Ana', estado: 'activo', password: 'secreto', pagos_nomina: [{ monto_total_usd: 40 }] })) };
  mockModels.GrupoEntrenamiento = { find: jest.fn(() => query([{ _id: groupId, sede: sedeId, nombre: 'U13' }])) };
  mockModels.Sede = { find: jest.fn(() => query([{ _id: sedeId, nombre: 'Centro' }])) };
  mockModels.TenantConfig = { findOne: jest.fn(() => query({ constancias: { personalizados: [
    { id: 'personalizado_laboral', nombre: 'Laboral', template: { cuerpo: '{{entrenador_nombre_completo}}', para_entrenadores: true } },
    { id: 'personalizado_mixto', nombre: 'Mixto', template: { cuerpo: '{{entrenador_nombre}} {{alumno_nombre}}', para_entrenadores: true } },
    { id: 'personalizado_sin_marca', nombre: 'Sin marca', template: { cuerpo: '{{entrenador_nombre}}' } }
  ] } })) };
});

test('consulta solo su entrenador y sus grupos sin devolver credenciales ni otros usuarios', async () => {
  const response = await request(app).get('/portal?entrenadorId=otro').set('Authorization', auth());
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('no-store');
  expect(mockModels.Entrenador.findOne).toHaveBeenCalledWith({ usuario: userId });
  expect(mockModels.GrupoEntrenamiento.find).toHaveBeenCalledWith({ entrenadores_ids: trainerId, activo: true });
  expect(response.body.entrenador).toMatchObject({ nombre: 'Ana', pagos_nomina: [{ monto_total_usd: 40 }] });
  expect(response.body.entrenador.password).toBeUndefined();
  expect(response.body.entrenador.usuario).toBeUndefined();
  expect(response.body.formatos).toEqual([{ value: 'personalizado_laboral', label: 'Laboral', requisitos: { entrenador: true, alumno: false, asistencia: false, horario: false } }]);
});
test('solo ofrece formatos marcados y retira los apagados incluyendo formatos predeterminados', async () => {
  mockModels.TenantConfig.findOne.mockReturnValue(query({ constancias: { templates: { asistencia: { para_entrenadores: true } }, personalizados: [
    { id: 'personalizado_apagado', nombre: 'Apagado', template: { cuerpo: '{{entrenador_nombre}}', para_entrenadores: false } }
  ] } }));
  const result = await request(app).get('/portal').set('Authorization', auth());
  expect(result.status).toBe(200);
  expect(result.body.formatos).toMatchObject([{ value: 'asistencia', requisitos: { asistencia: true } }]);
  mockModels.TenantConfig.findOne.mockReturnValue(query({ constancias: { templates: { asistencia: { para_entrenadores: false } } } }));
  expect((await request(app).get('/portal').set('Authorization', auth())).body.formatos).toEqual([]);
});
test.each(['usuario', 'admin', 'staff'])('el perfil activo %s no puede entrar en el portal de entrenador', async role => {
  const response = await request(app).get('/portal').set('Authorization', auth(role));
  expect(response.status).toBe(403);
  expect(mockModels.Entrenador.findOne).not.toHaveBeenCalled();
});
test('exige sesion y rechaza un token de otra academia', async () => {
  expect((await request(app).get('/portal')).status).toBe(401);
  expect((await request(app).get('/portal').set('x-tenant', 'beta').set('Authorization', auth())).status).toBe(403);
});
test.each([null, { _id: trainerId, estado: 'inactivo' }])('rechaza un entrenador ausente o inactivo', async own => {
  mockModels.Entrenador.findOne.mockReturnValue(query(own));
  const response = await request(app).get('/portal').set('Authorization', auth());
  expect(response.status).toBe(own ? 403 : 404);
  expect(mockModels.GrupoEntrenamiento.find).not.toHaveBeenCalled();
});