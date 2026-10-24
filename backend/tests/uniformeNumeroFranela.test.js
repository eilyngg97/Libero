const express = require('express');
const request = require('supertest');

const mockModels = {};
jest.mock('../config/tenantBusinessConnection', () => ({
  getTenantBusinessConnection: jest.fn(async (tenant) => tenant)
}));
jest.mock('../services/tenantModelService', () => ({
  getTenantModel: jest.fn((connection, name) => mockModels[connection.tenantId]?.[name] || {})
}));
jest.mock('../middleware/auth', () => ({
  authMiddleware: (req, res, next) => { req.user = { id: 'usuario', rol: 'admin' }; next(); },
  permisoMiddleware: (permiso) => (req, res, next) => (
    req.headers['x-permiso'] === permiso ? next() : res.sendStatus(403)
  )
}));

const router = require('../routes/uniformes');
const UniformePedido = require('../models/UniformePedido');
const pedidoId = '507f1f77bcf86cd799439011';
const alumnoId = '507f1f77bcf86cd799439012';
const uniformeId = '507f1f77bcf86cd799439013';

function query(value) {
  return {
    select: jest.fn().mockReturnThis(),
    populate: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(value),
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject)
  };
}

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.tenant = { tenantId: req.headers['x-tenant'] || 'academiaA' };
  next();
});
app.use('/api/uniformes', router);

let alumno;
let uniforme;
beforeEach(() => {
  jest.clearAllMocks();
  alumno = { _id: alumnoId, categoria: 'U13', sexo: 'Femenino', numero_franela: null, save: jest.fn().mockResolvedValue() };
  uniforme = { _id: uniformeId, prenda: 'Juego', precio: 25, lleva_numero_franela: true };
  for (const tenantId of ['academiaA', 'academiaB']) {
    mockModels[tenantId] = {
      Alumno: {
        findById: jest.fn(() => query(alumno)),
        findOne: jest.fn(() => query(null)),
        find: jest.fn(() => query([{ _id: tenantId, nombres: tenantId, numero_franela: 11 }]))
      },
      Uniforme: { findById: jest.fn(() => query(uniforme)) },
      UniformePedido: {
        findById: jest.fn(() => query({ _id: pedidoId, alumno: alumnoId, numero_franela: '11' })),
        create: jest.fn(async (payload) => ({ _id: pedidoId, ...payload }))
      }
    };
  }
});

test.each([
  ['primera eleccion', null, false, true, true],
  ['numero previo', 8, false, true, false],
  ['franela representante', null, true, true, false],
  ['sin numero en prenda', null, false, false, false]
])('%s conserva el origen correcto en el pedido', async (caso, numeroPrevio, representante, llevaNumero, esperado) => {
  alumno.numero_franela = numeroPrevio;
  uniforme.franela_representante = representante;
  uniforme.lleva_numero_franela = llevaNumero;
  const response = await request(app).post('/api/uniformes/pedidos').send({
    alumnoId, uniformeId, talla: 'M', numeroFranela: 11
  });
  expect(response.status).toBe(201);
  expect(mockModels.academiaA.UniformePedido.create).toHaveBeenCalledWith(expect.objectContaining({
    numero_franela_primera_eleccion: esperado,
    numero_franela: llevaNumero ? String(numeroPrevio || 11) : null
  }));
  expect(alumno.save).toHaveBeenCalledTimes(esperado ? 1 : 0);
});

test('no guarda una primera eleccion si el numero esta ocupado', async () => {
  mockModels.academiaA.Alumno.findOne.mockReturnValue(query({ _id: 'ocupado' }));
  const response = await request(app).post('/api/uniformes/pedidos').send({ alumnoId, uniformeId, talla: 'M', numeroFranela: 11 });
  expect(response.status).toBe(409);
  expect(mockModels.academiaA.UniformePedido.create).not.toHaveBeenCalled();
  expect(alumno.save).not.toHaveBeenCalled();
});

test('pedidos historicos no se clasifican retroactivamente', () => {
  expect(new UniformePedido({}).numero_franela_primera_eleccion).toBeNull();
});

test.each([['11', true], ['12', null]])('editar el numero a %s actualiza la validez de la marca', async (numero, marca) => {
  const pedido = { _id: pedidoId, alumno: alumnoId, numero_franela: '11', numero_franela_primera_eleccion: true, estado: 'pendiente', save: jest.fn().mockResolvedValue() };
  mockModels.academiaA.UniformePedido.findById.mockImplementation(() => query(pedido));
  const response = await request(app).patch(`/api/uniformes/pedidos/${pedidoId}`).send({ numeroFranela: numero });
  expect(response.status).toBe(200);
  expect(pedido.numero_franela_primera_eleccion).toBe(marca);
  expect(pedido.save).toHaveBeenCalledTimes(1);
});

test('el resumen busca en toda la academia sin filtrar categoria, sexo, sede ni bajas', async () => {
  for (const tenantId of ['academiaA', 'academiaB']) {
    const response = await request(app).get(`/api/uniformes/pedidos/${pedidoId}/resumen-numero`)
      .set('x-tenant', tenantId).set('x-permiso', 'solicitudes_uniformes.view');
    expect(response.status).toBe(200);
    expect(response.body.coincidencias[0]._id).toBe(tenantId);
    expect(mockModels[tenantId].Alumno.find).toHaveBeenCalledWith({ numero_franela: 11, _id: { $ne: alumnoId } });
  }
});

test('el resumen requiere permiso de solicitudes y no revela pedidos ajenos o inexistentes', async () => {
  const sinPermiso = await request(app).get(`/api/uniformes/pedidos/${pedidoId}/resumen-numero`);
  expect(sinPermiso.status).toBe(403);
  mockModels.academiaB.UniformePedido.findById.mockReturnValue(query(null));
  const ajeno = await request(app).get(`/api/uniformes/pedidos/${pedidoId}/resumen-numero`)
    .set('x-tenant', 'academiaB').set('x-permiso', 'solicitudes_uniformes.view');
  expect(ajeno.status).toBe(404);
  expect(mockModels.academiaB.Alumno.find).not.toHaveBeenCalled();
});