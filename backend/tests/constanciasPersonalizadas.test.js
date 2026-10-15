const request = require('supertest');
const express = require('express');
const PDFDocument = require('pdfkit');

const mockConfigs = {};
const mockEntrenadores = {};
const mockMensualidadFind = jest.fn(() => ({ select: () => ({ lean: async () => [] }) }));
const mockAlumno = {
  _id: 'alumno1', nombres: 'Ana', apellidos: 'Perez', cedula: '123',
  categoria: 'U17', sede: { _id: 'sede1', nombre: 'Centro' }
};
const mockCreateSolicitud = jest.fn(async (data) => data);

jest.mock('../config/tenantBusinessConnection', () => ({
  getTenantBusinessConnection: jest.fn(async (tenant) => tenant)
}));
jest.mock('../config/tenantCoreConnection', () => ({
  getTenantCoreConnection: jest.fn(async () => ({}))
}));
jest.mock('../models/TenantCore', () => ({
  getTenantCoreModel: () => ({
    findOne: () => ({ select: () => ({ lean: async () => null }) })
  })
}));
jest.mock('../services/tenantFallbackService', () => ({
  resolveRequestTenantId: (req) => req.tenant.tenantId
}));
jest.mock('../services/operacionService', () => ({
  registrarOperacion: jest.fn(async () => {})
}));
jest.mock('../services/tenantModelService', () => ({
  getTenantModel: (connection, name) => {
    const query = () => {
      const result = { lean: async () => mockConfigs[connection.tenantId] || null };
      result.select = () => result;
      return result;
    };
    if (name === 'TenantConfig') return {
      findOne: query,
      findOneAndUpdate: (_, update) => {
        mockConfigs[connection.tenantId] = {
          ...mockConfigs[connection.tenantId], ...update.$set
        };
        return query();
      }
    };
    if (name === 'Alumno') return {
      findById: () => ({ populate: () => ({ populate: async () => mockAlumno }) })
    };
    if (name === 'Mensualidad') return {
      find: mockMensualidadFind
    };
    if (name === 'Entrenador') return {
      find: () => ({
        select: () => ({
          sort: () => ({
            lean: async () => Object.values(mockEntrenadores[connection.tenantId] || {}).map(({ _id, nombre, apellido, cedula }) => ({ _id, nombre, apellido, cedula }))
          })
        })
      }),
      findById: (id) => ({
        select: () => ({
          populate: () => ({ lean: async () => mockEntrenadores[connection.tenantId]?.[id] || null })
        })
      })
    };
    if (name === 'ConstanciaSolicitud') return { create: mockCreateSolicitud };
    return {};
  }
}));

const configController = require('../controllers/configuracionController');
const constancias = require('../controllers/constanciaController');
const solicitudes = require('../controllers/constanciaSolicitudController');
const TenantConfig = require('../models/TenantConfig');
const ConstanciaSolicitud = require('../models/ConstanciaSolicitud');
const { normalizePersonalizados, normalizarTipoConstancia, getTemplateRequirements } = require('../services/constanciaTemplateService');
const { registrarOperacion } = require('../services/operacionService');

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.tenant = { tenantId: req.headers['x-test-tenant'] || 'academia-a' };
  req.user = { id: '507f1f77bcf86cd799439011', rol: req.headers['x-test-role'] || 'admin' };
  next();
});
app.patch('/config', configController.patchConfiguracionAdmin);
app.get('/config', configController.getConfiguracionAdmin);
app.get('/formatos', constancias.getFormatosPersonalizados);
app.get('/entrenadores', constancias.getEntrenadoresConstancias);
app.post('/pdf', constancias.generarConstancia);
app.post('/solicitudes', solicitudes.crearSolicitudConstancia);

const formato = {
  id: 'personalizado_entrenadores',
  nombre: 'Constancias entrenadores',
  template: {
    titulo: 'TITULO PERSONALIZADO', destinatario: 'DESTINATARIO PERSONALIZADO',
    cuerpo: 'CUERPO PERSONALIZADO {{alumno_nombre_completo}}', nota: 'NOTA PERSONALIZADA',
    lugarEmision: 'Ciudad personalizada', cierre: 'CIERRE PERSONALIZADO'
  }
};

beforeEach(() => {
  for (const key of Object.keys(mockConfigs)) delete mockConfigs[key];
  for (const key of Object.keys(mockEntrenadores)) delete mockEntrenadores[key];
  jest.clearAllMocks();
});

test('guarda y recarga los seis campos, conserva los cinco defaults y permite renombrar', async () => {
  const saved = await request(app).patch('/config').send({ constancias: { personalizados: [formato] } });
  expect(saved.status).toBe(200);
  expect(saved.body.constancias.personalizados).toEqual([formato]);
  expect(Object.keys(saved.body.constancias.templates)).toHaveLength(5);
  const loaded = await request(app).get('/config');
  expect(loaded.body.constancias.personalizados).toEqual([formato]);
  await request(app).patch('/config').send({ constancias: { subtitulo: 'Academia' } });
  expect(mockConfigs['academia-a'].constancias.personalizados).toEqual([formato]);
  const renamed = { ...formato, nombre: 'Nuevo nombre' };
  await request(app).patch('/config').send({ constancias: { personalizados: [renamed] } });
  const options = await request(app).get('/formatos');
  expect(options.body).toMatchObject([{ value: formato.id, label: 'Nuevo nombre', requisitos: { alumno: true, entrenador: false } }]);
});

test('el esquema persiste formatos personalizados sin agregar ids a los desplegables', () => {
  const doc = new TenantConfig({ constancias: { personalizados: [formato] } });
  expect(doc.validateSync()).toBeUndefined();
  expect(doc.toObject().constancias.personalizados).toEqual([formato]);
});

test('elimina solo el formato indicado del tenant actual y bloquea su emision posterior', async () => {
  const otroFormato = { ...formato, id: 'personalizado_otro', nombre: 'Otro formato' };
  mockConfigs['academia-a'] = { constancias: { personalizados: [formato, otroFormato] } };
  mockConfigs['academia-b'] = { constancias: { personalizados: [formato] } };
  const result = await request(app).patch('/config').send({ constancias: { personalizados: [otroFormato] } });
  expect(result.status).toBe(200);
  expect(result.body.constancias.personalizados).toEqual([otroFormato]);
  expect(Object.keys(result.body.constancias.templates)).toHaveLength(5);
  expect((await request(app).get('/config')).body.constancias.personalizados).toEqual([otroFormato]);
  expect((await request(app).get('/formatos')).body).toMatchObject([{ value: otroFormato.id, label: otroFormato.nombre }]);
  expect((await request(app).get('/formatos').set('x-test-tenant', 'academia-b')).body)
    .toMatchObject([{ value: formato.id, label: formato.nombre }]);
  expect((await request(app).post('/pdf').send({ alumnoId: 'alumno1', tipo: formato.id })).status).toBe(400);
  expect(mockConfigs['academia-b'].constancias.personalizados).toEqual([formato]);
  const empty = await request(app).patch('/config').send({ constancias: { personalizados: [] } });
  expect(empty.status).toBe(200);
  expect((await request(app).get('/formatos')).body).toEqual([]);
});

test.each([
  [{ ...formato, nombre: ' ' }],
  [{ ...formato, id: 'simple' }],
  [formato, formato],
  [{ ...formato, template: { cuerpo: {} } }]
])('rechaza formatos invalidos sin guardarlos: %j', async (...items) => {
  const result = await request(app).patch('/config').send({ constancias: { personalizados: items } });
  expect(result.status).toBe(400);
  expect(mockConfigs['academia-a']).toBeUndefined();
});

test('aisla listados y emision por tenant y rechaza tipos desconocidos', async () => {
  mockConfigs['academia-a'] = { constancias: { personalizados: [formato] } };
  expect((await request(app).get('/formatos')).body).toHaveLength(1);
  expect((await request(app).get('/formatos').set('x-test-tenant', 'academia-b')).body).toEqual([]);
  const result = await request(app).post('/pdf').set('x-test-tenant', 'academia-b')
    .send({ alumnoId: 'alumno1', tipo: formato.id });
  expect(result.status).toBe(400);
  expect(result.body.error).toMatch(/no existe/);
  expect((await request(app).post('/pdf').send({ tipo: 'inexistente' })).status).toBe(400);
});

test('genera un PDF usando los seis campos y registra el nombre personalizado', async () => {
  mockConfigs['academia-a'] = { constancias: { personalizados: [formato] } };
  const textSpy = jest.spyOn(PDFDocument.prototype, 'text');
  try {
    const result = await request(app).post('/pdf')
      .send({ alumnoId: 'alumno1', tipo: formato.id, fechaEmision: '2026-10-15' });
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toMatch(/application\/pdf/);
    expect(result.body.subarray(0, 4).toString()).toBe('%PDF');
    const text = textSpy.mock.calls.map(([value]) => value).join(' ');
    for (const value of ['TITULO PERSONALIZADO', 'DESTINATARIO PERSONALIZADO', 'CUERPO PERSONALIZADO', 'ANA PEREZ', 'NOTA PERSONALIZADA', 'Ciudad personalizada', 'CIERRE PERSONALIZADO']) {
      expect(text).toContain(value);
    }
    expect(registrarOperacion).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ nombre: formato.nombre }));
  } finally {
    textSpy.mockRestore();
  }
});

test('solicitudes Esporta admiten formatos propios y conservan su nombre', async () => {
  mockConfigs.esporta = { constancias: { personalizados: [formato] } };
  const result = await request(app).post('/solicitudes')
    .set('x-test-tenant', 'esporta').set('x-test-role', 'usuario')
    .send({ alumnoId: 'alumno1', tipo: formato.id, fechaEmision: '2026-10-15' });
  expect(result.status).toBe(201);
  expect(result.body.solicitud).toMatchObject({ tipo: formato.id, tipo_nombre: formato.nombre });
  const doc = new ConstanciaSolicitud({
    ...result.body.solicitud,
    alumno: '507f1f77bcf86cd799439012'
  });
  expect(doc.validateSync()).toBeUndefined();
  delete mockConfigs.esporta;
  const missing = await request(app).post('/solicitudes')
    .set('x-test-tenant', 'esporta').set('x-test-role', 'usuario')
    .send({ alumnoId: 'alumno1', tipo: formato.id, fechaEmision: '2026-10-15' });
  expect(missing.status).toBe(400);
});

test('normaliza solo tipos permitidos y no comparte objetos entre formatos', () => {
  expect(normalizarTipoConstancia('horario')).toBe('horario_entrenamiento');
  expect(normalizarTipoConstancia()).toBe('simple');
  expect(normalizarTipoConstancia('otro')).toBe('');
  expect(normalizePersonalizados()).toEqual([]);
  expect(() => normalizePersonalizados({})).toThrow(/lista/);
  const normalized = normalizePersonalizados([formato]);
  normalized[0].template.titulo = 'Cambio';
  expect(formato.template.titulo).toBe('TITULO PERSONALIZADO');
});

describe('variables de entrenadores', () => {
  const entrenadorId = '507f1f77bcf86cd799439022';
  const entrenador = {
    _id: entrenadorId, nombre: 'Luis', apellido: 'Gomez', cedula: '12345678',
    telefono: '04121234567', correo: 'luis@example.test', direccion: 'Direccion de prueba',
    especialidad: 'Voleibol', fecha_nacimiento: '1990-01-15T12:00:00Z',
    fecha_ingreso: '2020-02-20T12:00:00Z', sedes_staff: [{ nombre: 'Sede del entrenador' }],
    pago_config: { monto_base_usd: 999 }
  };
  const formatoEntrenador = {
    ...formato,
    template: {
      titulo: 'CONSTANCIA {{entrenador_nombre}}',
      destinatario: '{{entrenador_apellido}}',
      cuerpo: '{{entrenador_nombre_completo}} {{entrenador_cedula}} {{entrenador_telefono}} {{entrenador_correo}} {{entrenador_direccion}} {{entrenador_especialidad}} {{entrenador_fecha_nacimiento}} {{entrenador_fecha_ingreso}}',
      nota: 'Nota {{entrenador_nombre}}',
      lugarEmision: '{{entrenador_especialidad}}',
      cierre: 'Cierre {{entrenador_apellido}}'
    }
  };

  beforeEach(() => {
    mockConfigs['academia-a'] = { constancias: { personalizados: [formatoEntrenador] } };
    mockEntrenadores['academia-a'] = { [entrenadorId]: entrenador };
  });

  test('lista solo datos basicos del tenant actual y restringe acceso administrativo', async () => {
    const result = await request(app).get('/entrenadores');
    expect(result.status).toBe(200);
    expect(result.body).toEqual([{ _id: entrenadorId, nombre: 'Luis', apellido: 'Gomez', cedula: '12345678' }]);
    expect((await request(app).get('/entrenadores').set('x-test-tenant', 'academia-b')).body).toEqual([]);
    expect((await request(app).get('/entrenadores').set('x-test-role', 'usuario')).status).toBe(403);
  });

  test('emite para entrenador sin alumno usando sus datos en los seis campos y sin consultar deudas', async () => {
    const textSpy = jest.spyOn(PDFDocument.prototype, 'text');
    try {
      const result = await request(app).post('/pdf').send({ tipo: formato.id, entrenadorId, fechaEmision: '2026-10-15' });
      expect(result.status).toBe(200);
      expect(result.headers['content-type']).toMatch(/application\/pdf/);
      const text = textSpy.mock.calls.map(([value]) => value).join(' ');
      for (const value of ['CONSTANCIA LUIS', 'GOMEZ', 'LUIS GOMEZ', '12345678', '04121234567', 'luis@example.test', 'Direccion de prueba', 'Voleibol', '15/01/1990', '20/02/2020', 'Nota LUIS', 'Cierre GOMEZ', 'SEDE DEL ENTRENADOR']) {
        expect(text).toContain(value);
      }
      expect(text).not.toMatch(/{{entrenador_/);
      expect(mockMensualidadFind).not.toHaveBeenCalled();
      expect(registrarOperacion).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        entidad_tipo: 'Entrenador', entidad_id: entrenadorId,
        metadata: expect.objectContaining({ alumno_id: null, entrenador_id: entrenadorId })
      }));
    } finally {
      textSpy.mockRestore();
    }
  });

  test('requiere alumno y entrenador si el formato usa ambas clases de variables', async () => {
    mockConfigs['academia-a'].constancias.personalizados[0] = {
      ...formatoEntrenador,
      template: { ...formatoEntrenador.template, cuerpo: '{{alumno_nombre_completo}} con {{entrenador_nombre_completo}}' }
    };
    const missingTrainer = await request(app).post('/pdf').send({ tipo: formato.id, alumnoId: 'alumno1' });
    expect(missingTrainer.status).toBe(400);
    expect(missingTrainer.body.error).toMatch(/Selecciona un entrenador/);
    const missingAlumno = await request(app).post('/pdf').send({ tipo: formato.id, entrenadorId });
    expect(missingAlumno.status).toBe(400);
    expect(missingAlumno.body.error).toMatch(/alumno/);
    const textSpy = jest.spyOn(PDFDocument.prototype, 'text');
    try {
      const result = await request(app).post('/pdf').send({ tipo: formato.id, entrenadorId, alumnoId: 'alumno1' });
      expect(result.status).toBe(200);
      const text = textSpy.mock.calls.map(([value]) => value).join(' ');
      expect(text).toContain('ANA PEREZ');
      expect(text).toContain('LUIS GOMEZ');
    } finally {
      textSpy.mockRestore();
    }
  });

  test('rechaza entrenador ajeno, ID invalido, acceso de usuario y solicitudes de usuarios', async () => {
    mockConfigs['academia-b'] = mockConfigs['academia-a'];
    const otherTenant = await request(app).post('/pdf').set('x-test-tenant', 'academia-b').send({ tipo: formato.id, entrenadorId });
    expect(otherTenant.status).toBe(404);
    expect(otherTenant.body.error).toMatch(/esta academia/);
    expect((await request(app).post('/pdf').send({ tipo: formato.id, entrenadorId: 'invalido' })).status).toBe(400);
    expect((await request(app).post('/pdf').set('x-test-role', 'usuario')
      .send({ tipo: formato.id, alumnoId: 'alumno1', entrenadorId })).status).toBe(403);
    mockConfigs.esporta = mockConfigs['academia-a'];
    expect((await request(app).post('/solicitudes').set('x-test-role', 'usuario').set('x-test-tenant', 'esporta')
      .send({ tipo: formato.id, alumnoId: 'alumno1', fechaEmision: '2026-10-15' })).status).toBe(403);
  });

  test('detecta variables en cualquier campo con espacios y entrega requisitos al selector', async () => {
    expect(getTemplateRequirements({
      titulo: '{{ entrenador_nombre }}', nota: '{{ alumno_cedula }}',
      cierre: '{{asistencia_tiempo}} {{ horario_resumen }}'
    })).toEqual({ alumno: true, entrenador: true, asistencia: true, horario: true });
    const result = await request(app).get('/formatos');
    expect(result.body[0].requisitos).toEqual({ alumno: false, entrenador: true, asistencia: false, horario: false });
  });

  test('completa horario y asistencia en formatos personalizados y valida datos faltantes', async () => {
    mockConfigs['academia-a'].constancias.personalizados[0] = {
      ...formatoEntrenador,
      template: {
        ...formatoEntrenador.template,
        cuerpo: '{{entrenador_nombre_completo}} {{horario_resumen}} {{asistencia_persona_label}} {{asistencia_nombre}} {{asistencia_dia_evento}} {{asistencia_hora_desde}} {{asistencia_hora_hasta}} {{asistencia_motivo_evento}}'
      }
    };
    const body = {
      tipo: formato.id, entrenadorId, fechaEmision: '2026-10-15',
      diasEntrenamiento: ['Lunes'], horaInicio: '14:00', horaFin: '16:00',
      eventoFecha: '2026-10-15', eventoHoraDesde: '14:00', eventoHoraHasta: '16:00', eventoMotivo: 'Capacitacion'
    };
    expect((await request(app).post('/pdf').send({ ...body, horaInicio: '' })).status).toBe(400);
    expect((await request(app).post('/pdf').send({ ...body, eventoFecha: '' })).status).toBe(400);
    const textSpy = jest.spyOn(PDFDocument.prototype, 'text');
    try {
      const result = await request(app).post('/pdf').send(body);
      expect(result.status).toBe(200);
      const text = textSpy.mock.calls.map(([value]) => value).join(' ');
      for (const value of ['LUIS GOMEZ', 'Lunes de 2:00 PM a 4:00 PM', 'el/la entrenador(a)', 'Capacitacion']) {
        expect(text).toContain(value);
      }
      expect(text).not.toMatch(/{{/);
    } finally {
      textSpy.mockRestore();
    }
  });
});
