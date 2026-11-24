jest.mock('../config/tenantBusinessConnection', () => ({ getTenantBusinessConnection: jest.fn() }));

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs/promises');
const sharp = require('sharp');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const controller = require('../controllers/alumnoController');

const suite = process.env.RUN_MONGO_PROFILE_TESTS === '1' ? describe : describe.skip;

suite('foto de perfil persistida con Mongo real en base temporal', () => {
  let connection;
  let models;
  let tenantId;
  let uploadDir;
  let archivo;
  jest.setTimeout(30000);

  beforeAll(async () => {
    tenantId = `libero-qa-foto-${Date.now()}-${process.pid}`;
    connection = await mongoose.createConnection(`mongodb://127.0.0.1:27017/${tenantId}`, {
      serverSelectionTimeoutMS: 5000
    }).asPromise();
    models = Object.fromEntries(['Alumno', 'Sede', 'Mensualidad', 'TenantConfig']
      .map((name) => [name, getTenantModel(connection, name)]));
    await Promise.all(Object.values(models).map((model) => model.init()));
    getTenantBusinessConnection.mockResolvedValue(connection);
    uploadDir = path.join(__dirname, '..', 'uploads', tenantId, 'alumnos');
    await fs.mkdir(uploadDir, { recursive: true });
    archivo = path.join(uploadDir, 'perfil.png');
    await sharp({ create: { width: 64, height: 64, channels: 3, background: '#123456' } }).png().toFile(archivo);
  });

  afterAll(async () => {
    if (connection) {
      try { await connection.dropDatabase(); } finally { await connection.close(); }
    }
    if (archivo) await fs.unlink(archivo);
    if (uploadDir) {
      await fs.rmdir(uploadDir);
      await fs.rmdir(path.dirname(uploadDir));
    }
  });

  test('guardar una foto no depende del resto del formulario y una nueva lectura devuelve la foto guardada', async () => {
    const sede = await models.Sede.create({ nombre: 'Centro QA', direccion: 'Direccion QA', costo: 20 });
    const alumno = await models.Alumno.create({
      nombres: 'QA', apellidos: 'Foto', sede: sede._id, telefono: '000',
      fecha_inicio_cobro: new Date('2025-01-01'), foto: '/uploads/qa/anterior.png',
      tipo_mensualidad: 'monto_personalizado', monto_personalizado_valor: 0
    });
    const cuota = await models.Mensualidad.create({
      id_alumno: alumno._id, mes: 11, anio: 2026, monto_esperado: 20,
      fecha_vencimiento: new Date('2026-11-05'), estatus: 'Pagado'
    });
    const cuotaAnterior = await models.Mensualidad.findById(cuota._id).lean();
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await controller.actualizarFotoAlumno({
      tenantId, params: { id: String(alumno._id) }, body: { telefono: 'no guardar' },
      file: { path: archivo, filename: 'perfil.png' }
    }, res);
    expect(res.status).not.toHaveBeenCalled();
    const foto = `/uploads/${tenantId}/alumnos/perfil.png`;
    expect(res.json).toHaveBeenCalledWith({ foto });

    const lectura = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await controller.getAlumnoById({ tenantId, params: { id: String(alumno._id) } }, lectura);
    expect(lectura.status).not.toHaveBeenCalled();
    expect(lectura.json).toHaveBeenCalledWith(expect.objectContaining({
      foto, telefono: '000', monto_personalizado_valor: 0
    }));
    expect(await models.Mensualidad.findById(cuota._id).lean()).toEqual(cuotaAnterior);
    expect((await fs.stat(archivo)).size).toBeGreaterThan(0);
  });
});
