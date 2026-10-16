jest.mock('../config/tenantBusinessConnection', () => ({ getTenantBusinessConnection: jest.fn() }));
jest.mock('../services/operacionService', () => ({ registrarOperacion: jest.fn().mockResolvedValue(undefined) }));

const mongoose = require('mongoose');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const controller = require('../controllers/pagoDetalleController');
const conciliacion = require('../controllers/conciliacionController');

const suite = process.env.RUN_MONGO_CREDIT_TESTS === '1' ? describe : describe.skip;

suite('credito mensual con transacciones Mongo reales en base temporal', () => {
  let connection;
  let models;
  let alumnoIds;
  let octubreIds;
  let usuarioId;
  jest.setTimeout(30000);

  beforeAll(async () => {
    const dbName = `libero_qa_credit_${Date.now()}_${process.pid}`;
    connection = await mongoose.createConnection(`mongodb://127.0.0.1:27017/${dbName}?replicaSet=rs0`, {
      serverSelectionTimeoutMS: 5000
    }).asPromise();
    models = Object.fromEntries(['Alumno', 'Representante', 'Mensualidad', 'PagoDetalle', 'PagoAgrupado',
      'TenantConfig', 'Sede', 'Reposo'].map((nombre) => [nombre, getTenantModel(connection, nombre)]));
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
    usuarioId = new mongoose.Types.ObjectId();
    const representante = await models.Representante.create({ nombres: 'QA', apellidos: 'Credito', cedula: 'QA-TEMP', usuario: usuarioId });
    alumnoIds = [];
    octubreIds = [];
    for (const credito of [1.03, 1.02]) {
      const alumno = await models.Alumno.create({ nombres: 'QA', apellidos: String(credito),
        fecha_inicio_cobro: new Date('2026-09-01'), sede: new mongoose.Types.ObjectId(),
        representante: representante._id, saldo_a_favor_mensualidades: credito });
      alumnoIds.push(alumno._id);
      const septiembre = await models.Mensualidad.create({ id_alumno: alumno._id, mes: 9, anio: 2026,
        monto_base: 15, monto_esperado: 19, fecha_vencimiento: new Date('2026-09-05'),
        saldo_a_favor_generado: credito, estatus: 'Pagado', bloqueo_recargo_automatico: true });
      await models.PagoDetalle.create({ id_mensualidad: septiembre._id, monto_pagado: Number((19 + credito).toFixed(2)),
        fecha_pago: new Date('2026-09-07'), metodo_pago: 'QA' });
      const octubre = await models.Mensualidad.create({ id_alumno: alumno._id, mes: 10, anio: 2026,
        monto_base: 15, monto_esperado: 19, monto_sin_recargo_usd: 15, recargo_aplicado_usd: 4,
        monto_con_recargo_usd: 19, aplica_recargo: true, bloqueo_recargo_automatico: true,
        fecha_vencimiento: new Date('2026-10-05'), estatus: 'Insolvente' });
      octubreIds.push(octubre._id);
    }
  });

  async function registrar(agrupado = true, sinCredito = false) {
    const body = agrupado ? { monto_total: sinCredito ? 38 : 35.95, monto_total_bs: sinCredito ? 38000 : 31415.52,
      asignaciones: octubreIds.map((id, index) => ({ id_mensualidad: String(id), credito_a_aplicar: sinCredito ? 0 : (index ? 1.02 : 1.03) })) }
      : { id_mensualidad: String(octubreIds[0]), monto_pagado: 17.97, monto_pagado_bs: 15703.39, credito_a_aplicar: 1.03 };
    Object.assign(body, { fecha_pago: '2026-10-07', metodo_pago: 'Pago movil', referencia: 'QA-262626' });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await controller[agrupado ? 'registrarPagoAgrupado' : 'registrarPago']({ tenantId: 'qa-credit',
      user: { id: String(usuarioId), rol: 'usuario' }, body }, res);
    return res;
  }

  async function prepararSinCredito() {
    await models.Alumno.updateMany({ _id: { $in: alumnoIds } }, { $set: { saldo_a_favor_mensualidades: 0 } });
    await models.Mensualidad.updateMany({ id_alumno: { $in: alumnoIds }, mes: 9 }, { $set: { saldo_a_favor_generado: 0 } });
    await models.PagoDetalle.updateMany({ id_mensualidad: { $nin: octubreIds } }, { $set: { monto_pagado: 19 } });
  }

  test('grupo sin credito ni excedente registra cabecera, dos asignaciones y ambas mensualidades', async () => {
    await prepararSinCredito();
    expect((await registrar(true, true)).status).toHaveBeenCalledWith(201);
    const grupo = await models.PagoAgrupado.findOne().lean();
    expect(grupo).toMatchObject({ monto_total: 38, monto_total_bs: 38000, cantidad_atletas: 2, estado: 'En revision' });
    const pagos = await models.PagoDetalle.find({ id_pago_agrupado: grupo._id }).lean();
    expect(pagos).toHaveLength(2);
    expect(pagos.reduce((total, pago) => total + pago.monto_pagado, 0)).toBe(38);
    const cuotas = await models.Mensualidad.find({ _id: { $in: octubreIds } }).lean();
    expect(cuotas.every((cuota) => cuota.estatus === 'En revision' && cuota.credito_aplicado === 0)).toBe(true);
  });

  test.each(['segunda asignacion', 'segunda mensualidad'])('registro sin credito revierte todo ante fallo en %s', async (caso) => {
    await prepararSinCredito();
    let spy;
    if (caso === 'segunda asignacion') {
      const original = models.PagoDetalle.create;
      let llamadas = 0;
      spy = jest.spyOn(models.PagoDetalle, 'create').mockImplementation(function (...args) {
        llamadas += 1;
        if (llamadas === 2) return Promise.reject(new Error('QA fallo segunda asignacion'));
        return original.apply(this, args);
      });
    } else {
      const original = models.Mensualidad.prototype.save;
      spy = jest.spyOn(models.Mensualidad.prototype, 'save').mockImplementation(function (...args) {
        if (String(this._id) === String(octubreIds[1])) return Promise.reject(new Error('QA fallo segunda mensualidad'));
        return original.apply(this, args);
      });
    }
    try { expect((await registrar(true, true)).status).toHaveBeenCalledWith(500); } finally { spy.mockRestore(); }
    expect(await models.PagoAgrupado.countDocuments()).toBe(0);
    expect(await models.PagoDetalle.countDocuments({ id_mensualidad: { $in: octubreIds } })).toBe(0);
    const cuotas = await models.Mensualidad.find({ _id: { $in: octubreIds } }).lean();
    expect(cuotas.every((cuota) => cuota.estatus === 'Insolvente' && cuota.credito_aplicado === 0)).toBe(true);
    const alumnos = await models.Alumno.find({ _id: { $in: alumnoIds } }).lean();
    expect(alumnos.every((alumno) => alumno.saldo_a_favor_mensualidades === 0)).toBe(true);
  });

  test('solicitudes agrupadas concurrentes sin credito solo registran una transferencia', async () => {
    await prepararSinCredito();
    const resultados = await Promise.all([registrar(true, true), registrar(true, true)]);
    expect(resultados.filter((res) => res.status.mock.calls.some(([status]) => status === 201))).toHaveLength(1);
    expect(resultados.filter((res) => res.status.mock.calls.some(([status]) => [400, 409].includes(status)))).toHaveLength(1);
    expect(await models.PagoAgrupado.countDocuments()).toBe(1);
    expect(await models.PagoDetalle.countDocuments({ id_mensualidad: { $in: octubreIds } })).toBe(2);
  });

  test.each([false, true])('confirmacion real guarda todo el grupo o revierte si falla una mensualidad (fallo=%s)', async (fallo) => {
    expect((await registrar()).status).toHaveBeenCalledWith(201);
    const grupo = await models.PagoAgrupado.findOne().lean();
    const anteriores = await models.Mensualidad.find({ _id: { $in: octubreIds } }).sort({ _id: 1 }).lean();
    const original = models.Mensualidad.prototype.save;
    const spy = jest.spyOn(models.Mensualidad.prototype, 'save').mockImplementation(function (...args) {
      if (fallo && String(this._id) === String(octubreIds[1])) return Promise.reject(new Error('QA fallo al confirmar segunda mensualidad'));
      return original.apply(this, args);
    });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    try {
      await conciliacion.confirmarMatchTotal({ tenantId: 'qa-credit', user: { id: String(usuarioId), rol: 'admin' },
        body: { tipo_conciliacion: 'mensualidades', pago_ids: [String(grupo._id)] } }, res);
    } finally { spy.mockRestore(); }
    const vigente = await models.PagoAgrupado.findById(grupo._id).lean();
    const cuotas = await models.Mensualidad.find({ _id: { $in: octubreIds } }).sort({ _id: 1 }).lean();
    if (fallo) {
      expect(res.status).toHaveBeenCalledWith(500);
      expect(vigente).toEqual(grupo);
      expect(cuotas).toEqual(anteriores);
    } else {
      expect(res.status).not.toHaveBeenCalled();
      expect(vigente.estado).toBe('Conciliado');
      expect(cuotas.every((cuota) => cuota.estatus === 'Pagado')).toBe(true);
    }
    expect(await models.PagoDetalle.countDocuments({ id_pago_agrupado: grupo._id })).toBe(2);
  });

  test('grupo consume creditos, conserva efectivo y no duplica credito en reintento', async () => {
    const res = await registrar();
    expect(res.status).toHaveBeenCalledWith(201);
    const alumnos = await models.Alumno.find({ _id: { $in: alumnoIds } }).sort({ _id: 1 }).lean();
    expect(alumnos.map((alumno) => alumno.saldo_a_favor_mensualidades)).toEqual([0, 0]);
    const cuotas = await models.Mensualidad.find({ _id: { $in: octubreIds } }).sort({ _id: 1 }).lean();
    expect(cuotas.map((cuota) => cuota.credito_aplicado)).toEqual([1.03, 1.02]);
    expect(cuotas.map((cuota) => cuota.monto_esperado)).toEqual([17.97, 17.98]);
    expect((await models.PagoAgrupado.findOne().lean()).monto_total).toBe(35.95);
    const pagos = await models.PagoDetalle.find({ id_mensualidad: { $in: octubreIds } }).sort({ id_mensualidad: 1 }).lean();
    expect(pagos.map((pago) => pago.monto_pagado)).toEqual([17.97, 17.98]);
    expect((await registrar()).status).toHaveBeenCalledWith(400);
    expect(await models.PagoAgrupado.countDocuments()).toBe(1);
  });

  test('fallo real del guardado de la segunda cuota revierte grupo, efectivo y ambos saldos', async () => {
    const original = models.Mensualidad.prototype.save;
    const spy = jest.spyOn(models.Mensualidad.prototype, 'save').mockImplementation(function (...args) {
      if (String(this._id) === String(octubreIds[1])) return Promise.reject(new Error('QA fallo segunda cuota'));
      return original.apply(this, args);
    });
    try { expect((await registrar()).status).toHaveBeenCalledWith(500); } finally { spy.mockRestore(); }
    expect(await models.PagoAgrupado.countDocuments()).toBe(0);
    expect(await models.PagoDetalle.countDocuments({ id_mensualidad: { $in: octubreIds } })).toBe(0);
    const alumnos = await models.Alumno.find({ _id: { $in: alumnoIds } }).sort({ _id: 1 }).lean();
    expect(alumnos.map((alumno) => alumno.saldo_a_favor_mensualidades)).toEqual([1.03, 1.02]);
    const cuotas = await models.Mensualidad.find({ _id: { $in: octubreIds } }).lean();
    expect(cuotas.every((cuota) => cuota.credito_aplicado === 0 && cuota.monto_esperado === 19)).toBe(true);
  });

  test('solicitudes individuales concurrentes solo registran y consumen una vez', async () => {
    const resultados = await Promise.all([registrar(false), registrar(false)]);
    expect(resultados.filter((res) => !res.status.mock.calls.length)).toHaveLength(1);
    expect(resultados.some((res) => res.status.mock.calls.some(([status]) => status === 409))).toBe(true);
    expect(await models.PagoDetalle.countDocuments({ id_mensualidad: octubreIds[0] })).toBe(1);
    expect((await models.Alumno.findById(alumnoIds[0]).lean()).saldo_a_favor_mensualidades).toBe(0);
    expect((await models.Mensualidad.findById(octubreIds[0]).lean()).credito_aplicado).toBe(1.03);
  });

  test('solicitudes agrupadas concurrentes solo crean una transferencia y consumen el credito una vez', async () => {
    const resultados = await Promise.all([registrar(), registrar()]);
    expect(resultados.filter((res) => res.status.mock.calls.some(([status]) => status === 201))).toHaveLength(1);
    expect(await models.PagoAgrupado.countDocuments()).toBe(1);
    expect(await models.PagoDetalle.countDocuments({ id_mensualidad: { $in: octubreIds } })).toBe(2);
    const alumnos = await models.Alumno.find({ _id: { $in: alumnoIds } }).lean();
    expect(alumnos.every((alumno) => alumno.saldo_a_favor_mensualidades === 0)).toBe(true);
  });

  test('usuario directo no registra un grupo si no es el usuario del representante real', async () => {
    await models.Alumno.updateMany({ _id: { $in: alumnoIds } }, { $set: { usuario: usuarioId } });
    await models.Representante.updateOne({ usuario: usuarioId }, { $set: { usuario: new mongoose.Types.ObjectId() } });
    const res = await registrar();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(await models.PagoAgrupado.countDocuments()).toBe(0);
    expect(await models.PagoDetalle.countDocuments({ id_mensualidad: { $in: octubreIds } })).toBe(0);
    const alumnos = await models.Alumno.find({ _id: { $in: alumnoIds } }).sort({ _id: 1 }).lean();
    expect(alumnos.map((alumno) => alumno.saldo_a_favor_mensualidades)).toEqual([1.03, 1.02]);
    const cuotas = await models.Mensualidad.find({ _id: { $in: octubreIds } }).lean();
    expect(cuotas.every((cuota) => cuota.estatus === 'Insolvente' && cuota.credito_aplicado === 0)).toBe(true);
  });
});