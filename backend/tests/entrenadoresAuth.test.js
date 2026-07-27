process.env.JWT_SECRET_CURRENT = 'test-secret';
process.env.MONGO_URI_CURRENT = process.env.MONGO_URI_CURRENT || 'mongodb://127.0.0.1:27017/libero_test';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn()
}));

const mockUserModel = {
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn()
};

const mockEntrenadorModel = {
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn(),
  create: jest.fn()
};

const mockRoleModel = {
  find: jest.fn()
};

const mockRepresentanteModel = {
  findOne: jest.fn()
};

jest.mock('../config/tenantBusinessConnection', () => ({
  getTenantBusinessConnection: jest.fn().mockResolvedValue({})
}));

jest.mock('../services/tenantModelService', () => ({
  getTenantModel: jest.fn((_, modelName) => {
    const map = {
      User: mockUserModel,
      Entrenador: mockEntrenadorModel,
      Role: mockRoleModel,
      Representante: mockRepresentanteModel
    };
    return map[modelName] || {};
  })
}));

const { app } = require('../app');

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET_CURRENT, { expiresIn: '1h' });
}

describe('Modulo entrenadores y auth por roles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockRoleCatalog(roleDocs) {
    mockRoleModel.find.mockReturnValue({
      select: jest.fn().mockResolvedValue(roleDocs)
    });
  }

  test('POST /api/entrenadores crea entrenador y usuario entrenador', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin' });

    mockEntrenadorModel.findOne.mockResolvedValue(null);
    mockUserModel.findOne.mockResolvedValue(null);
    bcrypt.hash.mockResolvedValue('hashed-pass');
    mockUserModel.create.mockResolvedValue({
      _id: 'u-entrenador',
      email: '12345678',
      rol: 'entrenador',
      roles: ['entrenador']
    });
    mockEntrenadorModel.create.mockResolvedValue({ _id: 'e1', nombre: 'Ana', apellido: 'Coach' });

    const response = await request(app)
      .post('/api/entrenadores')
      .set('Authorization', `Bearer ${token}`)
      .send({
        nombre: 'Ana',
        apellido: 'Coach',
        cedula: '12345678',
        correo: 'coach@test.com',
        pago_config: {
          monto_base_usd: 300,
          frecuencia_pago: 'quincenal',
          metodos: ['pago_movil']
        }
      });

    expect(response.status).toBe(201);
    expect(response.body?.entrenador?._id).toBe('e1');
    expect(response.body?.usuario?.email).toBe('12345678');
    expect(mockUserModel.create).toHaveBeenCalledWith(expect.objectContaining({
      rol: 'entrenador',
      roles: ['entrenador']
    }));
    expect(mockEntrenadorModel.create).toHaveBeenCalledWith(expect.objectContaining({
      usuario: 'u-entrenador'
    }));
  });

  test('POST /api/entrenadores responde 409 por cedula duplicada', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin' });

    mockEntrenadorModel.findOne.mockResolvedValue({ _id: 'existente' });

    const response = await request(app)
      .post('/api/entrenadores')
      .set('Authorization', `Bearer ${token}`)
      .send({ nombre: 'Ana', apellido: 'Coach', cedula: '12345678' });

    expect(response.status).toBe(409);
    expect(response.body?.error).toMatch(/cedula/i);
  });

  test('PATCH /api/entrenadores/:id/estado valida estado invalido', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin' });

    const response = await request(app)
      .patch('/api/entrenadores/507f1f77bcf86cd799439011/estado')
      .set('Authorization', `Bearer ${token}`)
      .send({ estado: 'pausado' });

    expect(response.status).toBe(400);
    expect(response.body?.error).toMatch(/estado invalido/i);
  });

  test('PATCH /api/entrenadores/:id/estado actualiza a inactivo', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin' });

    mockEntrenadorModel.findByIdAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        estado: 'inactivo'
      })
    });

    const response = await request(app)
      .patch('/api/entrenadores/507f1f77bcf86cd799439011/estado')
      .set('Authorization', `Bearer ${token}`)
      .send({ estado: 'inactivo' });

    expect(response.status).toBe(200);
    expect(response.body?.entrenador?.estado).toBe('inactivo');
  });

  test('POST /api/entrenadores/:id/pagos exige monto equivalente en Bs cuando moneda es USD', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin' });

    mockEntrenadorModel.findById.mockResolvedValue({
      _id: '507f1f77bcf86cd799439011',
      pago_config: { monto_base_usd: 200, frecuencia_pago: 'quincenal' },
      pagos_nomina: [],
      save: jest.fn().mockResolvedValue(true)
    });

    const response = await request(app)
      .post('/api/entrenadores/507f1f77bcf86cd799439011/pagos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        moneda: 'USD',
        tasa_bcv: 120,
        monto_base: 100,
        bono_ajuste: 0,
        deduccion: 0,
        monto_total_usd: 100,
        metodo_pago: 'transferencia'
      });

    expect(response.status).toBe(400);
    expect(response.body?.error).toMatch(/equivalente en Bs/i);
  });

  test('POST /api/entrenadores/:id/pagos registra pago nomina con USD y VES', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin' });

    const save = jest.fn().mockResolvedValue(true);
    const doc = {
      _id: '507f1f77bcf86cd799439011',
      pago_config: { monto_base_usd: 200, frecuencia_pago: 'quincenal' },
      pagos_nomina: [],
      save
    };
    mockEntrenadorModel.findById.mockResolvedValue(doc);

    const response = await request(app)
      .post('/api/entrenadores/507f1f77bcf86cd799439011/pagos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        moneda: 'USD',
        tasa_bcv: 120,
        monto_base: 100,
        bono_ajuste: 10,
        deduccion: 0,
        monto_total_usd: 110,
        monto_total_ves: 13200,
        metodo_pago: 'transferencia',
        referencia: 'NOM-001',
        periodo: 'Julio 2026',
        periodo_clave: '2026-07-q2'
      });

    expect(response.status).toBe(201);
    expect(response.body?.pago?.monto_total_usd).toBe(110);
    expect(response.body?.pago?.monto_total_ves).toBe(13200);
    expect(save).toHaveBeenCalled();
  });

  test('GET /api/entrenadores/actividades-pendientes-nomina solo incluye pendientes', async () => {
    const token = makeToken({ id: 'admin1', rol: 'admin' });

    const entrenadores = [
      {
        _id: 'e1',
        nombre: 'Ana',
        apellido: 'Coach',
        estado: 'activo',
        fecha_ingreso: '2025-01-01T00:00:00.000Z',
        pago_config: { monto_base_usd: 200, frecuencia_pago: 'quincenal' },
        pagos_nomina: []
      },
      {
        _id: 'e2',
        nombre: 'Luis',
        apellido: 'Coach',
        estado: 'inactivo',
        fecha_ingreso: '2025-01-01T00:00:00.000Z',
        pago_config: { monto_base_usd: 200, frecuencia_pago: 'quincenal' },
        pagos_nomina: [{ periodo_clave: '2026-07-q2' }]
      }
    ];

    mockEntrenadorModel.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(entrenadores)
      })
    });

    const response = await request(app)
      .get('/api/entrenadores/actividades-pendientes-nomina?fecha=2026-07-30')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body?.actividades)).toBe(true);
    expect(response.body.actividades.some((item) => item.entrenadorId === 'e1')).toBe(true);
  });

  test('POST /api/auth/login retorna seleccion de rol cuando usuario tiene multiples roles', async () => {
    mockUserModel.findOne.mockResolvedValue({
      _id: 'u1',
      nombre: 'Usuario Multi',
      email: 'multi@test.com',
      password: 'hashed',
      rol: 'admin',
      roles: ['admin', 'entrenador'],
      roleId: 'r-admin',
      roleIds: ['r-admin', 'r-entrenador']
    });
    bcrypt.compare.mockResolvedValue(true);
    mockRepresentanteModel.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'rep1' })
    });
    mockRoleCatalog([
      { _id: 'r-admin', slug: 'admin', nombre: 'Administrador', permisos: ['dashboard.view'], activo: true },
      { _id: 'r-entrenador', slug: 'entrenador', nombre: 'Entrenador', permisos: ['entrenadores.view'], activo: true }
    ]);

    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'multi@test.com', password: '123456' });

    expect(response.status).toBe(200);
    expect(response.body?.requiereSeleccionRol).toBe(true);
    expect(Array.isArray(response.body?.user?.roles)).toBe(true);
    expect(response.body.user.roles).toEqual(expect.arrayContaining(['admin', 'entrenador']));
    expect(Array.isArray(response.body?.rolesDisponibles)).toBe(true);
    expect(response.body.rolesDisponibles).toHaveLength(2);
  });

  test('POST /api/auth/select-role activa rol solicitado si esta asignado', async () => {
    const token = makeToken({ id: 'u1', rol: 'admin' });

    mockUserModel.findById.mockResolvedValue({
      _id: 'u1',
      nombre: 'Usuario Multi',
      email: 'multi@test.com',
      rol: 'admin',
      roles: ['admin', 'entrenador'],
      roleId: 'r-admin',
      roleIds: ['r-admin', 'r-entrenador']
    });
    mockRepresentanteModel.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'rep1' })
    });
    mockRoleCatalog([
      { _id: 'r-admin', slug: 'admin', nombre: 'Administrador', permisos: ['dashboard.view'], activo: true },
      { _id: 'r-entrenador', slug: 'entrenador', nombre: 'Entrenador', permisos: ['entrenadores.view'], activo: true }
    ]);

    const response = await request(app)
      .post('/api/auth/select-role')
      .set('Authorization', `Bearer ${token}`)
      .send({ rolActivo: 'entrenador' });

    expect(response.status).toBe(200);
    expect(response.body?.user?.rolActivo).toBe('entrenador');
    expect(response.body?.requiereSeleccionRol).toBe(false);
  });
});
