process.env.JWT_SECRET = 'test-secret';

jest.mock('../models/User', () => ({
  findOne: jest.fn()
}));

jest.mock('../models/Alumno', () => ({
  find: jest.fn(),
  findById: jest.fn()
}));

jest.mock('../models/Representante', () => ({
  find: jest.fn(),
  findById: jest.fn()
}));

jest.mock('../models/Mensualidad', () => ({
  findById: jest.fn()
}));

jest.mock('../models/PagoDetalle', () => ({
  find: jest.fn(),
  create: jest.fn()
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
const User = require('../models/User');
const Alumno = require('../models/Alumno');
const Mensualidad = require('../models/Mensualidad');
const PagoDetalle = require('../models/PagoDetalle');
const { app } = require('../app');

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });
}

describe('Backend smoke tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

    const populateSede = jest.fn().mockResolvedValue(alumnos);
    const populateRepresentante = jest.fn(() => ({ populate: populateSede }));
    Alumno.find.mockReturnValue({ populate: populateRepresentante });

    const response = await request(app)
      .get('/api/alumnos')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(1);
  });

  test('POST /api/pagos registers payment', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const mensualidadDoc = {
      monto_esperado: 100,
      id_alumno: { habilitar_pago_cuotas: true },
      estatus: 'Pendiente',
      save: jest.fn().mockResolvedValue(true)
    };

    Mensualidad.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mensualidadDoc)
    });
    PagoDetalle.find.mockResolvedValue([]);
    PagoDetalle.create.mockResolvedValue({ _id: 'p1' });

    const response = await request(app)
      .post('/api/pagos')
      .set('Authorization', `Bearer ${token}`)
      .field('id_mensualidad', 'm1')
      .field('monto_pagado', '100')
      .field('fecha_pago', '2026-03-06')
      .field('metodo_pago', 'Pago movil')
      .field('referencia', 'ABC123');

    expect(response.status).toBe(200);
    expect(response.body.estatus).toBe('Pagado');
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

    const response = await request(app)
      .post('/api/constancias')
      .set('Authorization', `Bearer ${token}`)
      .send({ alumnoId: 'a1', tipo: 'simple', fechaEmision: '2026-03-06' });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
  });
});
