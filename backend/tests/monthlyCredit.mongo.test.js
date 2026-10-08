jest.mock('../config/tenantBusinessConnection', () => ({ getTenantBusinessConnection: jest.fn() }));

const mongoose = require('mongoose');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const controller = require('../controllers/pagoDetalleController');

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

  async function registrar(agrupado = true) {
    const body = agrupado ? { monto_total: 35.95, monto_total_bs: 31415.52,
      asignaciones: octubreIds.map((id, index) => ({ id_mensualidad: String(id), credito_a_aplicar: index ? 1.02 : 1.03 })) }
      : { id_mensualidad: String(octubreIds[0]), monto_pagado: 17.97, monto_pagado_bs: 15703.39, credito_a_aplicar: 1.03 };
    Object.assign(body, { fecha_pago: '2026-10-07', metodo_pago: 'Pago movil', referencia: 'QA-262626' });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await controller[agrupado ? 'registrarPagoAgrupado' : 'registrarPago']({ tenantId: 'qa-credit',
      user: { id: String(usuarioId), rol: 'usuario' }, body }, res);
    return res;
  }

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
});