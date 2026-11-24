jest.mock('../config/tenantBusinessConnection', () => ({ getTenantBusinessConnection: jest.fn() }));

const mongoose = require('mongoose');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const controller = require('../controllers/alumnoController');
const { generarMensualidadesPendientesAlumno } = require('../controllers/mensualidadController');

const suite = process.env.RUN_MONGO_REPOSO_TESTS === '1' ? describe : describe.skip;

suite('edicion de reposos con Mongo real en base temporal', () => {
  let connection;
  let models;
  let alumno;
  let reposo;
  jest.setTimeout(30000);

  beforeAll(async () => {
    const dbName = `libero_qa_reposo_${Date.now()}_${process.pid}`;
    connection = await mongoose.createConnection(`mongodb://127.0.0.1:27017/${dbName}?replicaSet=rs0`, {
      serverSelectionTimeoutMS: 5000
    }).asPromise();
    models = Object.fromEntries(['Alumno', 'Reposo', 'Mensualidad', 'PagoDetalle', 'TenantConfig', 'Sede',
      'MensualidadEliminada'].map((name) => [name, getTenantModel(connection, name)]));
    await Promise.all(Object.values(models).map((model) => model.init()));
    getTenantBusinessConnection.mockResolvedValue(connection);
  });

  afterAll(async () => {
    if (connection) {
      try { await connection.dropDatabase(); } finally { await connection.close(); }
    }
  });

  beforeEach(async () => {
    await Promise.all(Object.values(models).map((model) => model.deleteMany({})));
    alumno = await models.Alumno.create({
      nombres: 'QA', apellidos: 'Reposo', fecha_inicio_cobro: new Date('2026-10-01'),
      sede: new mongoose.Types.ObjectId(), tipo_mensualidad: 'monto_personalizado',
      monto_personalizado_valor: 20
    });
    reposo = await models.Reposo.create({
      id_alumno: alumno._id, tipo: 'Parcial', modalidad_cobro_parcial: 'Normal', estado: 'Activo',
      fecha_inicio: new Date('2026-11-10T12:00:00Z'), fecha_fin: new Date('2026-11-20T12:00:00Z')
    });
  });

  afterEach(() => jest.restoreAllMocks());

  function crearCuota(mes, estatus, anio = 2026, cambios = {}) {
    return models.Mensualidad.create({
      id_alumno: alumno._id, mes, anio, monto_base: 20, monto_esperado: 20,
      fecha_vencimiento: new Date(Date.UTC(anio, mes - 1, 5)), estatus, ...cambios
    });
  }

  async function editar(cambios = {}) {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await controller.editarReposoAlumno({
      tenantId: 'qa-reposo', params: { id: String(alumno._id), reposoId: String(reposo._id) },
      body: { tipo: 'Indefinido', ...cambios }
    }, res);
    return res;
  }

  test('conserva noviembre y meses futuros pagados; exonera pendientes desde el inicio sin duplicarlos', async () => {
    const octubre = await crearCuota(10, 'Pendiente');
    const noviembre = await crearCuota(11, 'Pagado', 2026, { referencia: 'QA-NOV', fecha_pago: new Date('2026-11-02') });
    await crearCuota(12, 'Pendiente');
    await crearCuota(1, 'Insolvente', 2027);
    const febrero = await crearCuota(2, 'Pagado', 2027);
    const originales = await models.Mensualidad.find({ _id: { $in: [octubre._id, noviembre._id, febrero._id] } }).sort({ _id: 1 }).lean();

    const res = await editar({ fecha_fin: '2026-11-20' });
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Reposo actualizado', reposo: expect.objectContaining({ tipo: 'Indefinido', fecha_fin: null })
    }));
    expect(await models.Mensualidad.find({ _id: { $in: [octubre._id, noviembre._id, febrero._id] } }).sort({ _id: 1 }).lean()).toEqual(originales);
    const exentas = await models.Mensualidad.find({ id_alumno: alumno._id, estatus: 'Exento por reposo' }).sort({ anio: 1, mes: 1 }).lean();
    expect(exentas.map((cuota) => [cuota.mes, cuota.anio, cuota.monto_esperado])).toEqual([[12, 2026, 0], [1, 2027, 0]]);
    expect(await models.Mensualidad.countDocuments({ id_alumno: alumno._id })).toBe(5);
    expect((await models.Reposo.findById(reposo._id)).fecha_fin).toBeNull();
  });

  test('crea la cuota inicial ausente y el generador futuro mantiene la exencion', async () => {
    const res = await editar({ fecha_fin: '' });
    expect(res.status).not.toHaveBeenCalled();
    const inicial = await models.Mensualidad.findOne({ id_alumno: alumno._id, mes: 11, anio: 2026 }).lean();
    expect(inicial).toMatchObject({ monto_esperado: 0, estatus: 'Exento por reposo' });
    expect(inicial.createdAt).toBeInstanceOf(Date);
    await generarMensualidadesPendientesAlumno(alumno, {
      models, periodoInicio: { mes: 12, anio: 2026 }, periodoFin: { mes: 1, anio: 2027 }
    });
    const futuras = await models.Mensualidad.find({ id_alumno: alumno._id, _id: { $ne: inicial._id } }).lean();
    expect(futuras).toHaveLength(2);
    futuras.forEach((cuota) => expect(cuota).toMatchObject({ monto_esperado: 0, estatus: 'Exento por reposo' }));
  });

  test('revierte reposo y cuotas si falla la sincronizacion despues de modificar diciembre', async () => {
    await crearCuota(11, 'Pagado');
    await crearCuota(12, 'Pendiente');
    await crearCuota(1, 'Insolvente', 2027);
    const anterior = await models.Reposo.findById(reposo._id).lean();
    const cuotasAnteriores = await models.Mensualidad.find({ id_alumno: alumno._id }).sort({ _id: 1 }).lean();
    const original = models.Mensualidad.findOneAndUpdate.bind(models.Mensualidad);
    jest.spyOn(models.Mensualidad, 'findOneAndUpdate').mockImplementation((filtro, cambios, opciones) => {
      if (filtro.mes === 1 && cambios.$set) throw new Error('Fallo QA en enero');
      return original(filtro, cambios, opciones);
    });

    const res = await editar();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'Error al actualizar reposo', detalle: 'Fallo QA en enero' });
    expect(await models.Reposo.findById(reposo._id).lean()).toEqual(anterior);
    expect(await models.Mensualidad.find({ id_alumno: alumno._id }).sort({ _id: 1 }).lean()).toEqual(cuotasAnteriores);
  });

  test('al acortar un reposo, un fallo revierte cuotas recalculadas y saldo del alumno', async () => {
    reposo.tipo = 'Total';
    reposo.fecha_fin = new Date('2027-01-31T12:00:00Z');
    await reposo.save();
    alumno.saldo_a_favor_mensualidades = 10;
    await alumno.save();
    await crearCuota(11, 'Exento por reposo', 2026, { monto_esperado: 0 });
    const diciembre = await crearCuota(12, 'Exento por reposo', 2026, { monto_esperado: 0, saldo_a_favor_generado: 10 });
    const enero = await crearCuota(1, 'Exento por reposo', 2027, { monto_esperado: 0 });
    await models.PagoDetalle.create({ id_mensualidad: diciembre._id, monto_pagado: 10, fecha_pago: new Date('2026-12-02'), metodo_pago: 'QA' });
    const anterior = await models.Reposo.findById(reposo._id).lean();
    const cuotasAnteriores = await models.Mensualidad.find({ id_alumno: alumno._id }).sort({ _id: 1 }).lean();
    const originalSave = models.Mensualidad.prototype.save;
    jest.spyOn(models.Mensualidad.prototype, 'save').mockImplementation(function (...args) {
      if (String(this._id) === String(enero._id)) throw new Error('Fallo QA al recalcular enero');
      return originalSave.apply(this, args);
    });

    const res = await editar({ tipo: 'Total', fecha_fin: '2026-11-30' });
    expect(res.status).toHaveBeenCalledWith(500);
    expect(await models.Reposo.findById(reposo._id).lean()).toEqual(anterior);
    expect(await models.Mensualidad.find({ id_alumno: alumno._id }).sort({ _id: 1 }).lean()).toEqual(cuotasAnteriores);
    expect((await models.Alumno.findById(alumno._id)).saldo_a_favor_mensualidades).toBe(10);
  });

  test('mantiene la fecha final al finalizar un indefinido y libera las cuotas posteriores', async () => {
    reposo.tipo = 'Indefinido';
    reposo.fecha_fin = null;
    await reposo.save();
    await crearCuota(11, 'Pagado');
    await crearCuota(12, 'Exento por reposo', 2026, { monto_esperado: 0 });
    const res = await editar({ estado: 'Finalizado', fecha_fin: '2026-11-30' });
    expect(res.status).not.toHaveBeenCalled();
    expect((await models.Reposo.findById(reposo._id)).fecha_fin.toISOString()).toBe('2026-11-30T12:00:00.000Z');
    expect(await models.Mensualidad.findOne({ id_alumno: alumno._id, mes: 12 }).lean()).toMatchObject({
      monto_esperado: 20, estatus: 'Pendiente'
    });
  });

  test('sin transacciones devuelve 503 sin guardar el cambio de reposo', async () => {
    const anterior = await models.Reposo.findById(reposo._id).lean();
    jest.spyOn(connection, 'startSession').mockResolvedValue({
      withTransaction: jest.fn().mockRejectedValue(new Error('Transaction numbers are only allowed on a replica set member or mongos')),
      endSession: jest.fn().mockResolvedValue(undefined)
    });
    const res = await editar();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(await models.Reposo.findById(reposo._id).lean()).toEqual(anterior);
    expect(await models.Mensualidad.countDocuments({ id_alumno: alumno._id })).toBe(0);
  });
});
