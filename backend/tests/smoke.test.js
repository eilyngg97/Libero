process.env.JWT_SECRET_CURRENT = 'test-secret';

jest.mock('../models/User', () => {
  const UserMock = jest.fn().mockImplementation((data = {}) => ({
    ...data,
    _id: data._id || 'u-new',
    save: jest.fn().mockResolvedValue({ ...data, _id: data._id || 'u-new' })
  }));

  UserMock.findOne = jest.fn();
  UserMock.findByIdAndDelete = jest.fn();

  return UserMock;
});

jest.mock('../models/Alumno', () => {
  const AlumnoMock = jest.fn().mockImplementation((data = {}) => ({
    ...data,
    save: jest.fn().mockResolvedValue({ ...data, _id: data._id || 'a-new' })
  }));

  AlumnoMock.find = jest.fn();
  AlumnoMock.findById = jest.fn();
  AlumnoMock.findOne = jest.fn();
  AlumnoMock.findByIdAndUpdate = jest.fn();
  AlumnoMock.findByIdAndDelete = jest.fn();

  return AlumnoMock;
});

jest.mock('../models/Representante', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  findOne: jest.fn(),
  findByIdAndDelete: jest.fn()
}));

jest.mock('../models/Mensualidad', () => ({
  findById: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  create: jest.fn()
}));

jest.mock('../models/PagoDetalle', () => ({
  find: jest.fn(),
  findById: jest.fn(),
  findByIdAndDelete: jest.fn(),
  create: jest.fn()
}));

jest.mock('../models/Reposo', () => ({
  find: jest.fn(),
  findOne: jest.fn()
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
const Representante = require('../models/Representante');
const Mensualidad = require('../models/Mensualidad');
const PagoDetalle = require('../models/PagoDetalle');
const Reposo = require('../models/Reposo');
const { app } = require('../app');

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET_CURRENT, { expiresIn: '1h' });
}

describe('Backend smoke tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Reposo.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([])
      })
    });
    Reposo.findOne.mockReturnValue({
      sort: jest.fn().mockResolvedValue(null)
    });
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

    const lean = jest.fn().mockResolvedValue(alumnos);
    const populateSede = jest.fn(() => ({ lean }));
    const populateRepresentante = jest.fn(() => ({ populate: populateSede }));
    Alumno.find.mockReturnValue({ populate: populateRepresentante });

    const response = await request(app)
      .get('/api/alumnos')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(1);
  });

  test('GET /api/representantes/por-usuario/:userId returns 200 null cuando usuario no tiene representante', async () => {
    const token = makeToken({ id: 'u1', rol: 'usuario', nombre: 'Usuario Final' });
    Representante.findOne.mockResolvedValue(null);

    const response = await request(app)
      .get('/api/representantes/por-usuario/u1')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
  });

  test('GET /api/alumnos/por-representante/null no rompe para usuario final sin representante', async () => {
    const token = makeToken({ id: 'u1', rol: 'usuario', nombre: 'Usuario Final' });

    Representante.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([])
    });

    const populateSede = jest.fn().mockResolvedValue([]);
    Alumno.find.mockReturnValue({ populate: populateSede });

    const response = await request(app)
      .get('/api/alumnos/por-representante/null?usuarioId=u1&populateSede=1')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  test('POST /api/pagos registers payment', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const mensualidadDoc = {
      _id: 'm1',
      monto_esperado: 100,
      id_alumno: { habilitar_pago_cuotas: true },
      estatus: 'Pendiente',
      save: jest.fn().mockResolvedValue(true)
    };

    Mensualidad.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mensualidadDoc)
    });
    PagoDetalle.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ _id: 'p1', monto_pagado: 100 }]);
    PagoDetalle.create.mockResolvedValue({ _id: 'p1' });

    const response = await request(app)
      .post('/api/pagos')
      .set('Authorization', `Bearer ${token}`)
      .field('id_mensualidad', 'm1')
      .field('monto_pagado', '100.18')
      .field('monto_pagado_bs', '7075')
      .field('monto_esperado_usd', '100')
      .field('monto_esperado_bs', '7075')
      .field('fecha_pago', '2026-03-06')
      .field('metodo_pago', 'Pago movil')
      .field('referencia', 'ABC123');

    expect(response.status).toBe(200);
    expect(response.body.estatus).toBe('Pagado');
    expect(PagoDetalle.create).toHaveBeenCalledWith(expect.objectContaining({
      monto_pagado: 100.18,
      monto_pagado_bs: 7075,
      monto_esperado_usd: 100,
      monto_esperado_bs: 7075
    }));
  });

  test('POST /api/conciliacion/previsualizar incluye monto esperado del sistema', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const mensualidadDoc = {
      _id: 'm1',
      monto_esperado: 100,
      estatus: 'En revision',
      id_alumno: {
        nombres: 'Ana',
        apellidos: 'Lopez'
      }
    };

    Mensualidad.find.mockReturnValue({
      populate: jest.fn().mockReturnValue({
        select: jest.fn().mockResolvedValue([mensualidadDoc])
      })
    });

    PagoDetalle.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([
        {
          _id: 'p1',
          id_mensualidad: 'm1',
          referencia: '123456',
          monto_pagado_bs: 7075,
          monto_esperado_bs: 7075,
          monto_esperado_usd: 100,
          fecha_pago: '2026-03-06'
        }
      ])
    });

    const archivoTxt = Buffer.from('Referencia;Monto;Fecha\n123456;7075;06/03/2026\n');

    const response = await request(app)
      .post('/api/conciliacion/previsualizar')
      .set('Authorization', `Bearer ${token}`)
      .attach('archivo', archivoTxt, {
        filename: 'conciliacion.txt',
        contentType: 'text/plain'
      });

    expect(response.status).toBe(200);
    expect(response.body.match_total).toHaveLength(1);
    expect(response.body.match_total[0].sistema).toEqual(expect.objectContaining({
      monto_esperado_bs: 7075,
      monto_esperado_usd: 100,
      monto_bs: 7075,
      alumno: 'Ana Lopez'
    }));
  });

  test('POST /api/pagos allows admin overpayment and generates saldo a favor', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const alumnoDoc = {
      _id: 'a1',
      saldo_a_favor_mensualidades: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadDoc = {
      _id: 'm1',
      monto_esperado: 100,
      id_alumno: { _id: 'a1', habilitar_pago_cuotas: false },
      saldo_a_favor_generado: 0,
      estatus: 'Pendiente',
      save: jest.fn().mockResolvedValue(true)
    };

    Mensualidad.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mensualidadDoc)
    });
    Alumno.findById.mockResolvedValue(alumnoDoc);
    PagoDetalle.find
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ _id: 'p1', monto_pagado: 150 }]);
    PagoDetalle.create.mockResolvedValue({ _id: 'p1' });

    const response = await request(app)
      .post('/api/pagos')
      .set('Authorization', `Bearer ${token}`)
      .field('id_mensualidad', 'm1')
      .field('monto_pagado', '150')
      .field('fecha_pago', '2026-03-06')
      .field('metodo_pago', 'Pago movil')
      .field('referencia', 'ABC123');

    expect(response.status).toBe(200);
    expect(response.body.estatus).toBe('Pagado');
    expect(alumnoDoc.saldo_a_favor_mensualidades).toBe(50);
    expect(mensualidadDoc.saldo_a_favor_generado).toBe(50);
  });

  test('PATCH /api/pagos/:id_pago updates payment', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const pagoDoc = {
      _id: 'p1',
      id_mensualidad: 'm1',
      monto_pagado: 50,
      comprobante_url: null,
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadDoc = {
      _id: 'm1',
      monto_esperado: 100,
      id_alumno: { habilitar_pago_cuotas: true },
      estatus: 'Abono',
      save: jest.fn().mockResolvedValue(true)
    };

    PagoDetalle.findById.mockResolvedValue(pagoDoc);
    Mensualidad.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mensualidadDoc)
    });
    PagoDetalle.find
      .mockResolvedValueOnce([{ _id: 'p1', monto_pagado: 50 }])
      .mockResolvedValueOnce([{ _id: 'p1', monto_pagado: 100 }]);

    const response = await request(app)
      .patch('/api/pagos/p1')
      .set('Authorization', `Bearer ${token}`)
      .field('monto_pagado', '100')
      .field('fecha_pago', '2026-03-06')
      .field('metodo_pago', 'Transferencia')
      .field('referencia', '123456');

    expect(response.status).toBe(200);
    expect(response.body.estatus).toBe('Pagado');
  });

  test('GET /api/pagos/:id_mensualidad completa monto esperado usd para pagos historicos sin inferir bs', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    PagoDetalle.find.mockResolvedValue([
      {
        _id: 'p1',
        id_mensualidad: 'm1',
        monto_pagado: 100,
        monto_pagado_bs: 7075,
        fecha_pago: '2026-03-06',
        metodo_pago: 'Pago movil',
        referencia: '123456'
      }
    ]);

    Mensualidad.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: 'm1',
        monto_esperado: 100
      })
    });

    const response = await request(app)
      .get('/api/pagos/m1')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toEqual(expect.objectContaining({
      monto_esperado_usd: 100,
      monto_pagado: 100,
      monto_pagado_bs: 7075
    }));
    expect(response.body[0].monto_esperado_bs).toBeUndefined();
  });

  test('DELETE /api/pagos/:id_pago deletes payment', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const pagoDoc = {
      _id: 'p1',
      id_mensualidad: 'm1',
      comprobante_url: null,
      deleteOne: jest.fn().mockResolvedValue(true)
    };

    const mensualidadDoc = {
      _id: 'm1',
      monto_esperado: 100,
      id_alumno: { habilitar_pago_cuotas: true },
      estatus: 'Pagado',
      save: jest.fn().mockResolvedValue(true)
    };

    PagoDetalle.findById.mockResolvedValue(pagoDoc);
    Mensualidad.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(mensualidadDoc)
    });
    PagoDetalle.find.mockResolvedValue([]);

    const response = await request(app)
      .delete('/api/pagos/p1')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.estatus).toBe('Pendiente');
  });

  test('DELETE /api/alumnos/:id elimina representante y usuario huerfanos solo en borrado fisico', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    Alumno.findByIdAndDelete.mockResolvedValue({
      _id: 'a1',
      representante: 'r1',
      usuario: null
    });
    Alumno.findOne
      .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(null) })
      .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(null) });
    Representante.findByIdAndDelete.mockResolvedValue({ _id: 'r1', usuario: 'u1' });
    Representante.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
    User.findByIdAndDelete.mockResolvedValue({ _id: 'u1' });

    const response = await request(app)
      .delete('/api/alumnos/a1')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Representante.findByIdAndDelete).toHaveBeenCalledWith('r1');
    expect(User.findByIdAndDelete).toHaveBeenCalledWith('u1');
  });

  test('PATCH /api/alumnos/:id/baja mantiene representante y usuario', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    Alumno.findByIdAndUpdate.mockResolvedValue({
      _id: 'a1',
      activo: false,
      dado_de_baja: true,
      representante: 'r1',
      usuario: 'u1'
    });

    const response = await request(app)
      .patch('/api/alumnos/a1/baja')
      .set('Authorization', `Bearer ${token}`)
      .send({ motivo_baja: 'Prueba' });

    expect(response.status).toBe(200);
    expect(Representante.findByIdAndDelete).not.toHaveBeenCalled();
    expect(User.findByIdAndDelete).not.toHaveBeenCalled();
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
    Mensualidad.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([])
    });

    const response = await request(app)
      .post('/api/constancias')
      .set('Authorization', `Bearer ${token}`)
      .send({ alumnoId: 'a1', tipo: 'simple', fechaEmision: '2026-03-06' });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
  });

  test('POST /api/alumnos allows create without numero_franela', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const response = await request(app)
      .post('/api/alumnos')
      .set('Authorization', `Bearer ${token}`)
      .field('fecha_inscripcion', '2026-03-06')
      .field('fecha_inicio_cobro', '2026-03-06')
      .field('nombres', 'Carlos')
      .field('apellidos', 'Perez')
      .field('sede', 's1');

    expect(response.status).toBe(201);
    expect(Alumno).toHaveBeenCalled();
    const payloadCreado = Alumno.mock.calls[0][0] || {};
    expect(payloadCreado).not.toHaveProperty('numero_franela');
  });

  test('PUT /api/alumnos/:id creates usuario when alumno sin representante agrega cedula', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    Alumno.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: 'a1',
        categoria: 'SUB10',
        numero_franela: null,
        nombres: 'Diego',
        apellidos: 'Rojas',
        cedula: '',
        usuario: null,
        representante: null
      })
    });
    User.findOne.mockResolvedValue(null);
    bcrypt.hash.mockResolvedValue('hashed-cedula');
    Alumno.findByIdAndUpdate.mockResolvedValue({ _id: 'a1', usuario: 'u-new', cedula: '12345678' });

    const response = await request(app)
      .put('/api/alumnos/a1')
      .set('Authorization', `Bearer ${token}`)
      .send({ cedula: '12345678' });

    expect(response.status).toBe(200);
    expect(User).toHaveBeenCalledWith(
      expect.objectContaining({
        email: '12345678',
        rol: 'usuario'
      })
    );
    expect(Alumno.findByIdAndUpdate).toHaveBeenCalledWith(
      'a1',
      expect.objectContaining({ usuario: 'u-new', cedula: '12345678' }),
      { new: true }
    );
  });

  test('POST /api/mensualidades/primera pagado crea pago detalle automatico', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const alumnoDoc = {
      _id: 'a1',
      saldo_a_favor_mensualidades: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadCreada = {
      _id: 'm1',
      id_alumno: 'a1',
      estatus: 'Pagado',
      monto_esperado: 100
    };

    Alumno.findById.mockResolvedValue(alumnoDoc);
    Mensualidad.findOne.mockResolvedValue(null);
    Mensualidad.create.mockResolvedValue(mensualidadCreada);
    PagoDetalle.create.mockResolvedValue({ _id: 'p1' });

    const response = await request(app)
      .post('/api/mensualidades/primera')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id_alumno: 'a1',
        monto_esperado: 100,
        estatus: 'Pagado'
      });

    expect(response.status).toBe(200);
    expect(PagoDetalle.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id_mensualidad: 'm1',
        monto_pagado: 100,
        metodo_pago: 'Registro inicial admin',
        referencia: 'primera-mensualidad'
      })
    );
  });

  test('POST /api/mensualidades/ajuste-sede generates saldo a favor', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const alumnoDoc = {
      _id: 'a1',
      saldo_a_favor_mensualidades: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadDoc = {
      _id: 'm1',
      id_alumno: 'a1',
      monto_base: 100,
      credito_aplicado: 0,
      ajuste_extraordinario: 0,
      monto_esperado: 100,
      saldo_a_favor_generado: 0,
      estatus: 'Pagado',
      save: jest.fn().mockResolvedValue(true)
    };

    Alumno.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([alumnoDoc])
    });
    Alumno.findById.mockResolvedValue(alumnoDoc);
    Mensualidad.find.mockResolvedValue([mensualidadDoc]);
    PagoDetalle.find.mockResolvedValue([{ monto_pagado: 100 }]);

    const response = await request(app)
      .post('/api/mensualidades/ajuste-sede')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id_sede: 's1',
        mes: 3,
        anio: 2026,
        nuevo_monto: 75,
        descripcion: 'Semana reconocida'
      });

    expect(response.status).toBe(200);
    expect(response.body.mensualidades_actualizadas).toBe(1);
    expect(response.body.alumnos_con_saldo_a_favor).toBe(1);
    expect(mensualidadDoc.monto_esperado).toBe(75);
    expect(mensualidadDoc.ajuste_extraordinario).toBe(25);
    expect(mensualidadDoc.saldo_a_favor_generado).toBe(25);
    expect(alumnoDoc.saldo_a_favor_mensualidades).toBe(25);
  });

  test('POST /api/mensualidades/ajuste-sede omite exonerados y reposo', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const alumnoDoc = {
      _id: 'a1',
      saldo_a_favor_mensualidades: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadExonerada = {
      _id: 'm1',
      id_alumno: 'a1',
      monto_base: 100,
      credito_aplicado: 0,
      ajuste_extraordinario: 0,
      monto_esperado: 100,
      saldo_a_favor_generado: 0,
      estatus: 'Exonerado',
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadReposo = {
      _id: 'm2',
      id_alumno: 'a1',
      monto_base: 100,
      credito_aplicado: 0,
      ajuste_extraordinario: 0,
      monto_esperado: 0,
      saldo_a_favor_generado: 0,
      estatus: 'Exento por reposo',
      save: jest.fn().mockResolvedValue(true)
    };

    Alumno.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([alumnoDoc])
    });
    Mensualidad.find.mockResolvedValue([mensualidadExonerada, mensualidadReposo]);

    const response = await request(app)
      .post('/api/mensualidades/ajuste-sede')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id_sede: 's1',
        mes: 3,
        anio: 2026,
        nuevo_monto: 75,
        descripcion: 'Semana reconocida'
      });

    expect(response.status).toBe(200);
    expect(response.body.mensualidades_actualizadas).toBe(0);
    expect(response.body.mensualidades_omitidas).toBe(2);
    expect(mensualidadExonerada.ajuste_extraordinario).toBe(0);
    expect(mensualidadReposo.ajuste_extraordinario).toBe(0);
  });

  test('POST /api/mensualidades/ajuste-sede conserva estado insolvente para data legacy retrasado', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const alumnoDoc = {
      _id: 'a1',
      saldo_a_favor_mensualidades: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadRetrasada = {
      _id: 'm1',
      id_alumno: 'a1',
      monto_base: 100,
      credito_aplicado: 0,
      ajuste_extraordinario: 0,
      monto_esperado: 100,
      saldo_a_favor_generado: 0,
      estatus: 'Retrasado',
      fecha_vencimiento: '2026-03-05T23:59:59.000Z',
      save: jest.fn().mockResolvedValue(true)
    };

    Alumno.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([alumnoDoc])
    });
    Mensualidad.find.mockResolvedValue([mensualidadRetrasada]);
    PagoDetalle.find.mockResolvedValue([]);

    const response = await request(app)
      .post('/api/mensualidades/ajuste-sede')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id_sede: 's1',
        mes: 3,
        anio: 2026,
        nuevo_monto: 80,
        descripcion: 'Ajuste de prueba'
      });

    expect(response.status).toBe(200);
    expect(response.body.mensualidades_actualizadas).toBe(1);
    expect(mensualidadRetrasada.estatus).toBe('Insolvente');
  });

  test('POST /api/mensualidades/ajuste-sede no convierte a pagado un insolvente sin pagos cuando monto esperado queda en 0', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const alumnoDoc = {
      _id: 'a1',
      saldo_a_favor_mensualidades: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadInsolvente = {
      _id: 'm1',
      id_alumno: 'a1',
      monto_base: 100,
      credito_aplicado: 0,
      ajuste_extraordinario: 0,
      monto_esperado: 100,
      saldo_a_favor_generado: 0,
      estatus: 'Insolvente',
      fecha_vencimiento: '2026-03-05T23:59:59.000Z',
      save: jest.fn().mockResolvedValue(true)
    };

    Alumno.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([alumnoDoc])
    });
    Mensualidad.find.mockResolvedValue([mensualidadInsolvente]);
    PagoDetalle.find.mockResolvedValue([]);

    const response = await request(app)
      .post('/api/mensualidades/ajuste-sede')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id_sede: 's1',
        mes: 3,
        anio: 2026,
        nuevo_monto: 0,
        descripcion: 'Ajuste de prueba a cero'
      });

    expect(response.status).toBe(200);
    expect(response.body.mensualidades_actualizadas).toBe(1);
    expect(mensualidadInsolvente.monto_esperado).toBe(0);
    expect(mensualidadInsolvente.estatus).toBe('Insolvente');
  });

  test('POST /api/mensualidades/ajuste-sede preserva pagado manual sin pagos', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const alumnoDoc = {
      _id: 'a1',
      saldo_a_favor_mensualidades: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadPagadaManual = {
      _id: 'm1',
      id_alumno: 'a1',
      monto_base: 100,
      credito_aplicado: 0,
      ajuste_extraordinario: 0,
      monto_esperado: 100,
      saldo_a_favor_generado: 0,
      estatus: 'Pagado',
      fecha_vencimiento: '2026-03-05T23:59:59.000Z',
      save: jest.fn().mockResolvedValue(true)
    };

    Alumno.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([alumnoDoc])
    });
    Mensualidad.find.mockResolvedValue([mensualidadPagadaManual]);
    PagoDetalle.find.mockResolvedValue([]);

    const response = await request(app)
      .post('/api/mensualidades/ajuste-sede')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id_sede: 's1',
        mes: 3,
        anio: 2026,
        nuevo_monto: 80,
        descripcion: 'Ajuste de prueba'
      });

    expect(response.status).toBe(200);
    expect(response.body.mensualidades_actualizadas).toBe(1);
    expect(mensualidadPagadaManual.estatus).toBe('Pagado');
  });

  test('POST /api/mensualidades/ajuste-sede/preview returns estimados', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const alumnoDoc = {
      _id: 'a1',
      saldo_a_favor_mensualidades: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadPendiente = {
      _id: 'm1',
      id_alumno: 'a1',
      monto_base: 100,
      credito_aplicado: 0,
      ajuste_extraordinario: 0,
      monto_esperado: 100,
      saldo_a_favor_generado: 0,
      estatus: 'Pendiente',
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadExonerada = {
      _id: 'm2',
      id_alumno: 'a1',
      monto_base: 100,
      credito_aplicado: 0,
      ajuste_extraordinario: 0,
      monto_esperado: 100,
      saldo_a_favor_generado: 0,
      estatus: 'Exonerado',
      save: jest.fn().mockResolvedValue(true)
    };

    Alumno.find.mockReturnValue({
      select: jest.fn().mockResolvedValue([alumnoDoc])
    });
    Mensualidad.find.mockResolvedValue([mensualidadPendiente, mensualidadExonerada]);

    const response = await request(app)
      .post('/api/mensualidades/ajuste-sede/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id_sede: 's1',
        mes: 3,
        anio: 2026,
        nuevo_monto: 75
      });

    expect(response.status).toBe(200);
    expect(response.body.mensualidades_actualizables).toBe(1);
    expect(response.body.mensualidades_omitidas).toBe(1);
    expect(response.body.mensualidades_no_compatibles).toBe(0);
  });

  test('PATCH /api/alumnos/:id/reposos/:reposoId al acortar un reposo total libera los meses fuera del nuevo rango', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin', nombre: 'Admin' });

    const alumnoBasico = { _id: 'a1' };
    const alumnoConfiguracion = {
      _id: 'a1',
      sede: 's1',
      tipo_mensualidad: 'monto_personalizado',
      monto_personalizado_valor: 100
    };

    const reposoDoc = {
      _id: 'r1',
      id_alumno: 'a1',
      tipo: 'Total',
      fecha_inicio: new Date('2026-03-01T12:00:00.000Z'),
      fecha_fin: new Date('2026-04-30T12:00:00.000Z'),
      estado: 'Activo',
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadMarzo = {
      _id: 'm-mar',
      id_alumno: 'a1',
      mes: 3,
      anio: 2026,
      monto_base: 100,
      credito_aplicado: 0,
      ajuste_extraordinario: 0,
      monto_esperado: 0,
      saldo_a_favor_generado: 0,
      estatus: 'Exento por reposo',
      save: jest.fn().mockResolvedValue(true)
    };

    const mensualidadAbril = {
      _id: 'm-abr',
      id_alumno: 'a1',
      mes: 4,
      anio: 2026,
      monto_base: 100,
      credito_aplicado: 0,
      ajuste_extraordinario: 0,
      monto_esperado: 0,
      saldo_a_favor_generado: 0,
      estatus: 'Exento por reposo',
      fecha_vencimiento: new Date('2026-04-05T23:59:59.000Z'),
      save: jest.fn().mockResolvedValue(true)
    };

    Alumno.findById
      .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(alumnoBasico) })
      .mockReturnValueOnce({ select: jest.fn().mockResolvedValue(alumnoConfiguracion) });

    Reposo.findOne
      .mockResolvedValueOnce(reposoDoc)
      .mockReturnValueOnce({ sort: jest.fn().mockResolvedValue(null) })
      .mockReturnValueOnce({ sort: jest.fn().mockResolvedValue({ _id: 'r1' }) })
      .mockReturnValueOnce({ sort: jest.fn().mockResolvedValue(null) })
      .mockReturnValueOnce({ sort: jest.fn().mockResolvedValue(null) });

    Mensualidad.findOne
      .mockResolvedValueOnce(mensualidadMarzo)
      .mockResolvedValueOnce(mensualidadAbril);

    Mensualidad.findOneAndUpdate.mockResolvedValue(mensualidadMarzo);
    PagoDetalle.find.mockResolvedValue([]);

    const response = await request(app)
      .patch('/api/alumnos/a1/reposos/r1')
      .set('Authorization', `Bearer ${token}`)
      .send({ fecha_fin: '2026-03-31' });

    expect(response.status).toBe(200);
    expect(reposoDoc.fecha_fin.toISOString()).toBe('2026-03-31T12:00:00.000Z');
    expect(mensualidadAbril.monto_esperado).toBe(100);
    expect(mensualidadAbril.estatus).toBe('Pendiente');
    expect(mensualidadAbril.save).toHaveBeenCalled();
  });
});
