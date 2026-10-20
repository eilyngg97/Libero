jest.mock('../config/tenantBusinessConnection', () => ({ getTenantBusinessConnection: jest.fn() }));
jest.mock('../services/operacionService', () => ({ registrarOperacion: jest.fn().mockResolvedValue(undefined) }));

const mongoose = require('mongoose');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const controller = require('../controllers/pagoDetalleController');
const conciliacion = require('../controllers/conciliacionController');
const mensualidades = require('../controllers/mensualidadController');
const { obtenerTrazabilidadCredito } = require('../services/monthlyCredit');

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

  async function registrar(agrupado = true, sinCredito = false, cambios = {}) {
    const body = agrupado ? { monto_total: sinCredito ? 38 : 35.95, monto_total_bs: sinCredito ? 38000 : 31415.52,
      asignaciones: octubreIds.map((id, index) => ({ id_mensualidad: String(id), credito_a_aplicar: sinCredito ? 0 : (index ? 1.02 : 1.03) })) }
      : { id_mensualidad: String(octubreIds[0]), monto_pagado: 17.97, monto_pagado_bs: 15703.39, credito_a_aplicar: 1.03 };
    Object.assign(body, { fecha_pago: '2026-10-07', metodo_pago: 'Pago movil', referencia: 'QA-262626' }, cambios);
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

  async function prepararExcedenteProvisional() {
    const alumno = await models.Alumno.create({ nombres: 'QA', apellidos: 'Provisional',
      fecha_inicio_cobro: new Date('2026-10-01'), fecha_inscripcion: new Date('2026-10-01'),
      sede: new mongoose.Types.ObjectId(), tipo_mensualidad: 'monto_personalizado',
      monto_personalizado_valor: 20, aplicar_recargo_mensualidad: false, saldo_a_favor_mensualidades: 36 });
    const origen = await models.Mensualidad.create({ id_alumno: alumno._id, mes: 10, anio: 2026,
      monto_base: 24, monto_esperado: 24, monto_sin_recargo_usd: 24, monto_con_recargo_usd: 24,
      fecha_vencimiento: new Date('2026-10-05'), saldo_a_favor_generado: 36,
      estatus: 'En revision', pago_en_revision: true, bloqueo_recargo_automatico: true });
    const pago = await models.PagoDetalle.create({ id_mensualidad: origen._id, monto_pagado: 60,
      fecha_pago: new Date('2026-10-07'), metodo_pago: 'QA' });
    return { alumno, origen, pago };
  }

  function respuesta() { return { status: jest.fn().mockReturnThis(), json: jest.fn() }; }

  test.each([['admin', false], ['admin', true], ['super_admin', false], ['super_admin', true]])('pago administrativo separado conserva saldo y queda pagado (%s, provisional=%s)', async (rol, provisional) => {
    const origen = await models.Mensualidad.findOne({ id_alumno: alumnoIds[0], mes: 9 });
    origen.estatus = provisional ? 'En revision' : 'Pagado';
    origen.pago_en_revision = provisional;
    await origen.save();
    const res = respuesta();
    await controller.registrarPago({ tenantId: 'qa-credit', user: { id: String(usuarioId), rol },
      body: { id_mensualidad: String(octubreIds[0]), credito_a_aplicar: '0', monto_pagado: 19,
        fecha_pago: '2026-10-20', metodo_pago: 'Efectivo' } }, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(await models.Mensualidad.findById(octubreIds[0])).toMatchObject({ monto_esperado: 19,
      credito_aplicado: 0, credito_en_revision: 0, estatus: 'Pagado', pago_en_revision: false,
      saldo_a_favor_generado: 0 });
    expect((await models.Alumno.findById(alumnoIds[0])).saldo_a_favor_mensualidades).toBe(1.03);
    expect((await models.Mensualidad.findById(origen._id)).estatus).toBe(provisional ? 'En revision' : 'Pagado');
  });

  test('pago administrativo que solicita credito provisional sigue en revision', async () => {
    await models.Mensualidad.updateOne({ id_alumno: alumnoIds[0], mes: 9 },
      { $set: { estatus: 'En revision', pago_en_revision: true } });
    const res = respuesta();
    await controller.registrarPago({ tenantId: 'qa-credit', user: { id: String(usuarioId), rol: 'admin' },
      body: { id_mensualidad: String(octubreIds[0]), credito_a_aplicar: 1.03, monto_pagado: 17.97,
        fecha_pago: '2026-10-20', metodo_pago: 'Efectivo' } }, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(await models.Mensualidad.findById(octubreIds[0])).toMatchObject({ credito_aplicado: 1.03,
      credito_en_revision: 1.03, estatus: 'En revision', pago_en_revision: false });
    expect((await models.Alumno.findById(alumnoIds[0])).saldo_a_favor_mensualidades).toBe(0);
  });

  async function generarNoviembre(alumno, via = 'cron') {
    if (via === 'boton') {
      const res = respuesta();
      await mensualidades.adelantarMensualidadSiguiente({ tenantId: 'qa-credit', body: { id_alumno: String(alumno._id) } }, res);
      expect(res.status).toHaveBeenCalledWith(201);
    } else {
      await mensualidades.generarMensualidadesPendientesAlumno(alumno, { models,
        periodoInicio: { mes: 11, anio: 2026 }, periodoFin: { mes: 11, anio: 2026 } });
    }
    return models.Mensualidad.findOne({ id_alumno: alumno._id, mes: 11 });
  }

  test('representante paga restante de diciembre adelantado con credito provisional de 0.04 sin duplicarlo', async () => {
    const { alumno, origen, pago } = await prepararExcedenteProvisional();
    alumno.representante = (await models.Representante.findOne({ usuario: usuarioId }))._id;
    alumno.saldo_a_favor_mensualidades = 0.04;
    await alumno.save();
    origen.mes = 11;
    origen.saldo_a_favor_generado = 0.04;
    await origen.save();
    pago.monto_pagado = 24.04;
    await pago.save();
    const adelantada = respuesta();
    await mensualidades.adelantarMensualidadSiguiente({ tenantId: 'qa-credit', body: { id_alumno: String(alumno._id) } }, adelantada);
    expect(adelantada.status).toHaveBeenCalledWith(201);
    const diciembre = await models.Mensualidad.findOne({ id_alumno: alumno._id, mes: 12, anio: 2026 });
    expect(diciembre).toMatchObject({ estatus: 'En revision', credito_aplicado: 0.04,
      credito_en_revision: 0.04, monto_esperado: 19.96 });
    const req = { tenantId: 'qa-credit', user: { id: String(usuarioId), rol: 'usuario' },
      body: { id_mensualidad: String(diciembre._id), monto_pagado: 19.96, monto_pagado_bs: 19960,
        credito_a_aplicar: 0, fecha_pago: '2026-12-01', metodo_pago: 'Pago movil', referencia: 'QA-191996' } };
    const res = respuesta();
    await controller.registrarPago(req, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ total_pagado: 19.96, restante: 0, estatus: 'En revision' }));
    expect(await models.Mensualidad.findById(diciembre._id)).toMatchObject({ monto_esperado: 19.96,
      credito_aplicado: 0.04, credito_en_revision: 0.04, saldo_a_favor_generado: 0, estatus: 'En revision' });
    expect((await models.Alumno.findById(alumno._id)).saldo_a_favor_mensualidades).toBe(0);
    expect(await models.PagoDetalle.countDocuments({ id_mensualidad: diciembre._id })).toBe(1);
    const duplicado = respuesta();
    await controller.registrarPago(req, duplicado);
    expect(duplicado.status).toHaveBeenCalledWith(400);
    expect(await models.PagoDetalle.countDocuments({ id_mensualidad: diciembre._id })).toBe(1);
  });

  test.each(['cron', 'boton'])('saldo provisional conserva revision y remanente historico por %s', async (via) => {
    const { alumno, origen } = await prepararExcedenteProvisional();
    const noviembre = await generarNoviembre(alumno, via);
    expect(noviembre).toMatchObject({ estatus: 'En revision', credito_aplicado: 20,
      credito_en_revision: 20, monto_esperado: 0, saldo_a_favor_restante: 16 });
    expect(String(noviembre.credito_origenes[0].id_mensualidad)).toBe(String(origen._id));
    const vigente = await models.Alumno.findById(alumno._id);
    expect(vigente.saldo_a_favor_mensualidades).toBe(16);
    await mensualidades.generarMensualidadesPendientesAlumno(vigente, { models,
      periodoInicio: { mes: 12, anio: 2026 }, periodoFin: { mes: 12, anio: 2026 } });
    const diciembre = await models.Mensualidad.findOne({ id_alumno: alumno._id, mes: 12 });
    expect(diciembre).toMatchObject({ credito_aplicado: 16, credito_en_revision: 16,
      monto_esperado: 4, estatus: 'En revision', saldo_a_favor_restante: 0 });
    const historial = await obtenerTrazabilidadCredito(alumno._id, models);
    expect(historial.movimientos.get(String(noviembre._id)).saldo_a_favor_restante).toBe(16);
    const res = respuesta();
    await mensualidades.getMensualidades({ tenantId: 'qa-credit', user: { rol: 'admin' },
      query: { id_alumno: String(alumno._id), mes: '11', anio: '2026' } }, res);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0]).toEqual([expect.objectContaining({ saldo_a_favor_restante: 16,
      saldo_a_favor_provisional: 16, credito_en_revision: 20 })]);
  });

  test.each(['manual', 'conciliacion'])('aprobar saldo provisional desde %s confirma las cuotas dependientes', async (via) => {
    const { alumno, origen, pago } = await prepararExcedenteProvisional();
    const noviembre = await generarNoviembre(alumno);
    const bloqueada = respuesta();
    await mensualidades.confirmarMensualidad({ tenantId: 'qa-credit', params: { id: String(noviembre._id) } }, bloqueada);
    expect(bloqueada.status).toHaveBeenCalledWith(409);
    const res = respuesta();
    if (via === 'manual') {
      await mensualidades.confirmarMensualidad({ tenantId: 'qa-credit', params: { id: String(origen._id) } }, res);
    } else {
      await conciliacion.confirmarMatchTotal({ tenantId: 'qa-credit', user: { id: String(usuarioId), rol: 'admin' },
        body: { tipo_conciliacion: 'mensualidades', pago_ids: [String(pago._id)] } }, res);
    }
    expect(res.status).not.toHaveBeenCalled();
    expect(await models.Mensualidad.findById(noviembre._id)).toMatchObject({ estatus: 'Pagado', credito_en_revision: 0 });
    expect((await models.Alumno.findById(alumno._id)).saldo_a_favor_mensualidades).toBe(16);
  });

  test.each([false, true])('eliminar saldo provisional revierte credito sin borrar cuotas y es atomico (fallo=%s)', async (fallo) => {
    const { alumno, origen, pago } = await prepararExcedenteProvisional();
    const noviembre = await generarNoviembre(alumno);
    const anterior = await models.Mensualidad.findById(noviembre._id).lean();
    const original = models.Mensualidad.prototype.save;
    const spy = jest.spyOn(models.Mensualidad.prototype, 'save').mockImplementation(function (...args) {
      if (fallo && String(this._id) === String(noviembre._id)) return Promise.reject(new Error('QA fallo al retirar credito'));
      return original.apply(this, args);
    });
    const res = respuesta();
    try {
      await controller.eliminarPago({ tenantId: 'qa-credit', user: { rol: 'admin' }, params: { id_pago: String(pago._id) } }, res);
    } finally { spy.mockRestore(); }
    if (fallo) {
      expect(res.status).toHaveBeenCalledWith(500);
      expect(await models.PagoDetalle.findById(pago._id)).not.toBeNull();
      expect(await models.Mensualidad.findById(noviembre._id).lean()).toEqual(anterior);
      expect((await models.Alumno.findById(alumno._id)).saldo_a_favor_mensualidades).toBe(16);
    } else {
      expect(res.status).not.toHaveBeenCalled();
      expect(await models.PagoDetalle.findById(pago._id)).toBeNull();
      expect(await models.Mensualidad.findById(noviembre._id)).toMatchObject({ credito_aplicado: 0,
        credito_en_revision: 0, monto_esperado: 20 });
      expect((await models.Mensualidad.findById(noviembre._id)).estatus).not.toBe('Pagado');
      expect((await models.Mensualidad.findById(origen._id)).saldo_a_favor_generado).toBe(0);
      expect((await models.Alumno.findById(alumno._id)).saldo_a_favor_mensualidades).toBe(0);
    }
  });

  test('rechazar saldo provisional consumido en dos meses restituye ambas deudas sin duplicar saldo', async () => {
    const { alumno, pago } = await prepararExcedenteProvisional();
    await generarNoviembre(alumno);
    const vigente = await models.Alumno.findById(alumno._id);
    await mensualidades.generarMensualidadesPendientesAlumno(vigente, { models,
      periodoInicio: { mes: 12, anio: 2026 }, periodoFin: { mes: 12, anio: 2026 } });
    const res = respuesta();
    await controller.eliminarPago({ tenantId: 'qa-credit', user: { rol: 'admin' }, params: { id_pago: String(pago._id) } }, res);
    expect(res.status).not.toHaveBeenCalled();
    const posteriores = await models.Mensualidad.find({ id_alumno: alumno._id, mes: { $in: [11, 12] } });
    expect(posteriores).toHaveLength(2);
    expect(posteriores.every((cuota) => cuota.credito_aplicado === 0 && cuota.monto_esperado === 20
      && cuota.estatus !== 'Pagado' && cuota.estatus !== 'En revision')).toBe(true);
    expect((await models.Alumno.findById(alumno._id)).saldo_a_favor_mensualidades).toBe(0);
  });

  test('generacion con saldo provisional revierte consumo si falla la creacion y no duplica en concurrencia', async () => {
    const { alumno } = await prepararExcedenteProvisional();
    const crear = jest.spyOn(models.Mensualidad, 'create').mockRejectedValueOnce(new Error('QA fallo al crear cuota'));
    try { await expect(generarNoviembre(alumno)).rejects.toThrow('QA fallo al crear cuota'); }
    finally { crear.mockRestore(); }
    expect((await models.Alumno.findById(alumno._id)).saldo_a_favor_mensualidades).toBe(36);
    expect(await models.Mensualidad.countDocuments({ id_alumno: alumno._id, mes: 11 })).toBe(0);
    const otro = await models.Alumno.findById(alumno._id);
    await Promise.all([generarNoviembre(alumno), generarNoviembre(otro)]);
    expect(await models.Mensualidad.countDocuments({ id_alumno: alumno._id, mes: 11 })).toBe(1);
    expect((await models.Alumno.findById(alumno._id)).saldo_a_favor_mensualidades).toBe(16);
  });

  test.each(['confirmar', 'rechazar'])('pago agrupado con saldo provisional consumido permite %s sin perder trazabilidad', async (accion) => {
    const { alumno, origen, pago } = await prepararExcedenteProvisional();
    const noviembre = await generarNoviembre(alumno);
    const otroPago = await models.PagoDetalle.findOne({ id_mensualidad: { $nin: octubreIds } });
    const grupo = await models.PagoAgrupado.create({ codigo: 'QA-PROVISIONAL', monto_total: 80.03,
      monto_total_bs: 8003, tasa_aplicada: 100, cantidad_atletas: 2, fecha_pago: new Date(), metodo_pago: 'QA' });
    pago.id_pago_agrupado = grupo._id;
    await pago.save();
    otroPago.id_pago_agrupado = grupo._id;
    await otroPago.save();
    const res = respuesta();
    if (accion === 'confirmar') {
      await conciliacion.confirmarMatchTotal({ tenantId: 'qa-credit', user: { id: String(usuarioId), rol: 'admin' },
        body: { tipo_conciliacion: 'mensualidades', pago_ids: [String(grupo._id)] } }, res);
    } else {
      await conciliacion.rechazarPagoAgrupado({ tenantId: 'qa-credit', user: { id: String(usuarioId), rol: 'admin' },
        params: { id: String(grupo._id) }, body: { motivo: 'QA sin transferencia' } }, res);
    }
    expect(res.status).not.toHaveBeenCalled();
    expect(await models.Mensualidad.findById(noviembre._id)).toMatchObject(accion === 'confirmar'
      ? { estatus: 'Pagado', credito_aplicado: 20, credito_en_revision: 0 }
      : { credito_aplicado: 0, credito_en_revision: 0, monto_esperado: 20 });
    expect((await models.Mensualidad.findById(origen._id)).estatus).not.toBe('En revision');
  });

  test.each([
    [true, 99.99], [true, 100], [true, 100.01],
    [false, 99.99], [false, 100], [false, 100.01]
  ])('registro y confirmacion reales respetan Bs 100 por transferencia (sin credito=%s, faltante=%s Bs)', async (sinCredito, faltanteBs) => {
    if (sinCredito) await prepararSinCredito();
    const anteriores = await models.Mensualidad.find({ _id: { $in: octubreIds } }).sort({ _id: 1 }).lean();
    const alumnosAnteriores = await models.Alumno.find({ _id: { $in: alumnoIds } }).sort({ _id: 1 }).lean();
    const monto = sinCredito ? 37 : 34.95;
    const montoBs = Number((monto * faltanteBs).toFixed(2));
    const registro = await registrar(true, sinCredito, { monto_total: monto, monto_total_bs: montoBs });
    if (faltanteBs > 100) {
      expect(registro.status).toHaveBeenCalledWith(400);
      expect(await models.PagoAgrupado.countDocuments()).toBe(0);
      expect(await models.PagoDetalle.countDocuments({ id_mensualidad: { $in: octubreIds } })).toBe(0);
      expect(await models.Mensualidad.find({ _id: { $in: octubreIds } }).sort({ _id: 1 }).lean()).toEqual(anteriores);
      expect(await models.Alumno.find({ _id: { $in: alumnoIds } }).sort({ _id: 1 }).lean()).toEqual(alumnosAnteriores);
      return;
    }
    expect(registro.status).toHaveBeenCalledWith(201);
    const grupo = await models.PagoAgrupado.findOne().lean();
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    await conciliacion.confirmarMatchTotal({ tenantId: 'qa-credit', user: { id: String(usuarioId), rol: 'admin' },
      body: { tipo_conciliacion: 'mensualidades', pago_ids: [String(grupo._id)] } }, res);
    expect(res.status).not.toHaveBeenCalled();
    expect((await models.PagoAgrupado.findById(grupo._id)).estado).toBe('Conciliado');
    const cuotas = await models.Mensualidad.find({ _id: { $in: octubreIds } }).lean();
    expect(cuotas.every((cuota) => cuota.estatus === 'Pagado' && cuota.saldo_a_favor_generado === 0)).toBe(true);
    expect(Number(cuotas.reduce((total, cuota) => total + cuota.credito_aplicado, 0).toFixed(2))).toBe(sinCredito ? 0 : 2.05);
    const pagos = await models.PagoDetalle.find({ id_pago_agrupado: grupo._id }).lean();
    expect(Number(pagos.reduce((total, pago) => total + pago.monto_pagado, 0).toFixed(2))).toBe(monto);
    expect(Number(pagos.reduce((total, pago) => total + pago.monto_pagado_bs, 0).toFixed(2))).toBe(montoBs);
    const alumnos = await models.Alumno.find({ _id: { $in: alumnoIds } }).lean();
    expect(alumnos.every((alumno) => alumno.saldo_a_favor_mensualidades === 0)).toBe(true);
  });

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