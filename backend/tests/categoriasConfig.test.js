const express = require('express');
const request = require('supertest');

jest.mock('../config/tenantBusinessConnection', () => ({
  getTenantBusinessConnection: jest.fn().mockResolvedValue({})
}));
jest.mock('../services/tenantModelService', () => ({ getTenantModel: jest.fn() }));
jest.mock('../middleware/auth', () => ({ hasRequestPermission: () => false }));

const { getTenantModel } = require('../services/tenantModelService');
const controller = require('../controllers/configuracionController');
const TenantConfig = require('../models/TenantConfig');

const categorias = {
  disciplina: 'voleibol',
  modo_asignacion: 'anio_nacimiento',
  fecha_corte: { mes: 12, dia: 31 },
  reglas: [
    { etiqueta: 'U9/INICIACION', anio_nacimiento_desde: 2017, anio_nacimiento_hasta: null, orden: 1 },
    { etiqueta: 'U11/FORMACION', anio_nacimiento_desde: 2015, anio_nacimiento_hasta: 2016, orden: 2 },
    { etiqueta: 'U13/MINI', anio_nacimiento_desde: 2013, anio_nacimiento_hasta: 2014, orden: 3 },
    { etiqueta: 'U15/INFANTIL', anio_nacimiento_desde: 2011, anio_nacimiento_hasta: 2012, orden: 4 },
    { etiqueta: 'U17/JUVENIL', anio_nacimiento_desde: 2009, anio_nacimiento_hasta: 2010, orden: 5 },
    { etiqueta: 'U19/JUVENIL LIBRE', anio_nacimiento_desde: 2007, anio_nacimiento_hasta: 2008, orden: 6 },
    { etiqueta: 'U21', anio_nacimiento_desde: 2005, anio_nacimiento_hasta: 2006, orden: 7 },
    { etiqueta: 'MAYORES / LIBRE', anio_nacimiento_desde: null, anio_nacimiento_hasta: 2004, orden: 8 }
  ]
};

let saved;
let model;
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.tenantId = 'qa';
  req.user = { id: '507f1f77bcf86cd799439011', rol: 'admin' };
  next();
});
app.patch('/api/configuracion', controller.patchConfiguracionAdmin);
app.get('/api/configuracion', controller.getConfiguracionAdmin);

beforeEach(() => {
  saved = new TenantConfig({ cobro: { recargo_usd: 4 } }).toObject();
  const query = () => {
    const result = { lean: async () => saved };
    result.select = () => result;
    return result;
  };
  model = {
    findOne: jest.fn(query),
    findOneAndUpdate: jest.fn((filter, update) => {
      saved = { ...saved, ...update.$set };
      return query();
    })
  };
  getTenantModel.mockReturnValue(model);
});

test.each(['vacias', 'ausentes', 'invalidas'])('PATCH guarda las ocho reglas sobre reglas anteriores %s y GET las conserva', async (estado) => {
  if (estado === 'ausentes') delete saved.categorias;
  if (estado === 'invalidas') {
    saved.categorias.reglas = [{ etiqueta: 'Anterior', anio_nacimiento_desde: 2020, anio_nacimiento_hasta: 2010 }];
  }
  const res = await request(app).patch('/api/configuracion').send({ categorias });
  expect(res.status).toBe(200);
  expect(model.findOneAndUpdate).toHaveBeenCalledTimes(1);
  expect(saved.categorias).toEqual(categorias);
  expect(saved.cobro.recargo_usd).toBe(4);
  const consulta = await request(app).get('/api/configuracion');
  expect(consulta.status).toBe(200);
  expect(consulta.body.categorias).toEqual(categorias);
});

test('PATCH parcial conserva reglas personalizadas y campos omitidos de la fecha de corte', async () => {
  saved.categorias = {
    ...categorias,
    disciplina: 'baloncesto',
    fecha_corte: { mes: 6, dia: 15 },
    reglas: [{ etiqueta: 'Base', anio_nacimiento_desde: 2010, anio_nacimiento_hasta: null, orden: 1 }]
  };
  const anterior = saved.categorias;
  const res = await request(app).patch('/api/configuracion').send({ categorias: { fecha_corte: { dia: 20 } } });
  expect(res.status).toBe(200);
  expect(saved.categorias).toEqual({ ...anterior, fecha_corte: { mes: 6, dia: 20 } });
});

test('PATCH parcial usa reglas predeterminadas cuando las almacenadas estan vacias', async () => {
  const res = await request(app).patch('/api/configuracion').send({ categorias: { disciplina: 'baloncesto' } });
  expect(res.status).toBe(200);
  expect(saved.categorias).toEqual({ ...categorias, disciplina: 'baloncesto' });
});

test.each([
  [[], 'Debes definir al menos una regla de categoria.'],
  [[{ etiqueta: 'Invalida', anio_nacimiento_desde: 2020, anio_nacimiento_hasta: 2010 }], 'rango invalido'],
  [[
    { etiqueta: 'A', anio_nacimiento_desde: 2010, anio_nacimiento_hasta: 2015 },
    { etiqueta: 'B', anio_nacimiento_desde: 2015, anio_nacimiento_hasta: null }
  ], 'se solapan']
])('PATCH rechaza reglas nuevas invalidas sin escribir: %j', async (reglas, detalle) => {
  const res = await request(app).patch('/api/configuracion').send({ categorias: { ...categorias, reglas } });
  expect(res.status).toBe(400);
  expect(res.body.detalle).toContain(detalle);
  expect(model.findOneAndUpdate).not.toHaveBeenCalled();
});
