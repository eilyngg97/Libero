const mongoose = require('mongoose');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { getTenantModel } = require('../services/tenantModelService');
const { ajustar, validarDependencias, normalizarNoviembre, respaldar, limpiarComprobantes,
  rutaComprobante } = require('../scripts/ajustar_inicio_cobro_olympykus');

describe('protecciones del ajuste de Olympykus', () => {
  const datos = () => ({ octubre: [{ _id: 'oct', id_alumno: 'alumno' }],
    restantes: [], pagosAgrupados: [], alumnos: [{ _id: 'alumno' }] });

  test('permite cuotas sin dependencias financieras', () => {
    expect(() => validarDependencias(datos())).not.toThrow();
  });

  test('permite retirar credito de octubre consumido en noviembre', () => {
    const entrada = datos();
    entrada.restantes.push({ mes: 11, anio: 2026, id_alumno: 'alumno', credito_origenes: [{ id_mensualidad: 'oct', monto: 1 }] });
    expect(() => validarDependencias(entrada)).not.toThrow();
  });

  test('detiene el ajuste ante cuotas de otros periodos', () => {
    const entrada = datos();
    entrada.restantes.push({ mes: 12, anio: 2026 });
    expect(() => validarDependencias(entrada)).toThrow('fuera de octubre/noviembre');
  });

  test('bloquea grupos con detalles de otro periodo', () => {
    const entrada = datos();
    entrada.pagosAgrupados.push({ id_mensualidad: 'nov' });
    expect(() => validarDependencias(entrada)).toThrow('eliminar parcialmente');
  });

  test.each(['credito_aplicado', 'saldo_a_favor_generado', 'credito_en_revision'])('permite retirar %s en octubre', (campo) => {
    const entrada = datos();
    entrada.octubre[0][campo] = 1;
    expect(() => validarDependencias(entrada)).not.toThrow();
  });

  test.each(['Becado', 'Exonerado', 'Exento por reposo'])('conserva el estado especial %s', (estatus) => {
    expect(normalizarNoviembre({ monto_esperado: 0, estatus }, []).estatus).toBe(estatus);
  });

  test('rechaza rutas relativas y no selecciona archivos de otro tenant', () => {
    expect(() => rutaComprobante('/uploads/olympykus/comprobantes/%2e%2e/secreto')).toThrow('insegura');
    expect(rutaComprobante('/uploads/otro/comprobantes/archivo.jpg')).toBeNull();
    expect(rutaComprobante('https://ejemplo.test/uploads/olympykus/comprobantes/archivo.jpg'))
      .toBe('olympykus/comprobantes/archivo.jpg');
  });
});

const suite = process.env.RUN_MONGO_CREDIT_TESTS === '1' ? describe : describe.skip;

suite('ajuste de Olympykus en Mongo temporal, sin datos reales', () => {
  let connection;
  let models;
  let alumnos;
  let noviembre;
  let pagoNoviembre;
  let directorioTemporal;
  let uploadsRoot;
  jest.setTimeout(30000);

  beforeAll(async () => {
    connection = await mongoose.createConnection(`mongodb://127.0.0.1:27017/libero_qa_credit_olympykus_${Date.now()}_${process.pid}?replicaSet=rs0`, {
      serverSelectionTimeoutMS: 5000
    }).asPromise();
    models = Object.fromEntries(['Alumno', 'Mensualidad', 'PagoDetalle', 'PagoAgrupado', 'Sede',
      'Reposo', 'TenantConfig', 'Representante', 'HistorialEstadoAlumno']
      .map((nombre) => [nombre, getTenantModel(connection, nombre)]));
    await Promise.all(Object.values(models).map((model) => model.init()));
  });

  afterAll(async () => {
    if (connection) {
      try { await connection.dropDatabase(); } finally { await connection.close(); }
    }
  });

  beforeEach(async () => {
    directorioTemporal = await fs.mkdtemp(path.join(os.tmpdir(), 'libero-qa-olympykus-'));
    uploadsRoot = path.join(directorioTemporal, 'uploads');
    await fs.mkdir(path.join(uploadsRoot, 'olympykus', 'comprobantes'), { recursive: true });
    await Promise.all(Object.values(models).map((model) => model.deleteMany({})));
    const sede = await models.Sede.create({ nombre: 'QA', direccion: 'QA', costo: 20 });
    alumnos = [];
    for (const tipo of ['monto_sede', 'media_beca', 'beca_completa', 'monto_personalizado', 'reposo', 'inactivo', 'baja', 'conservado']) {
      const alumno = await models.Alumno.create({ nombres: 'QA', apellidos: tipo, sede: sede._id,
        tipo_mensualidad: ['monto_sede', 'media_beca', 'beca_completa', 'monto_personalizado'].includes(tipo) ? tipo : 'monto_sede',
        monto_personalizado_valor: 13, activo: tipo !== 'inactivo', dado_de_baja: tipo === 'baja',
        fecha_inicio_cobro: new Date('2026-10-01T12:00:00Z') });
      alumnos.push(alumno);
      const cuota = await models.Mensualidad.create({ id_alumno: alumno._id, mes: 10, anio: 2026,
        monto_esperado: 20, fecha_vencimiento: new Date('2026-10-05'), estatus: 'En revision' });
      await models.PagoDetalle.create({ id_mensualidad: cuota._id, monto_pagado: 20,
        fecha_pago: new Date('2026-10-10'), metodo_pago: 'QA' });
    }
    await models.Reposo.create({ id_alumno: alumnos[4]._id, tipo: 'Indefinido', fecha_inicio: new Date('2026-10-01') });
    noviembre = await models.Mensualidad.create({ id_alumno: alumnos[7]._id, mes: 11, anio: 2026,
      monto_esperado: 17, estatus: 'En revision', pago_en_revision: true, fecha_vencimiento: new Date('2026-11-05') });
    pagoNoviembre = await models.PagoDetalle.create({ id_mensualidad: noviembre._id, monto_pagado: 17,
      fecha_pago: new Date('2026-10-20'), metodo_pago: 'QA', referencia: 'CONSERVAR' });
  });

  afterEach(async () => {
    if (directorioTemporal) await fs.rm(directorioTemporal, { recursive: true, force: true });
  });

  const guardarArchivos = (datos) => respaldar(datos, { directorio: path.join(directorioTemporal, 'backups'), uploadsRoot });

  async function comprobanteOctubre(nombre = 'octubre.jpg') {
    const archivo = path.join(uploadsRoot, 'olympykus', 'comprobantes', nombre);
    await fs.writeFile(archivo, 'comprobante-qa');
    const cuota = await models.Mensualidad.findOne({ mes: 10 });
    await models.PagoDetalle.updateOne({ id_mensualidad: cuota._id },
      { $set: { comprobante_url: `/uploads/olympykus/comprobantes/${nombre}` } });
    return archivo;
  }

  const snapshot = async () => JSON.stringify(await Promise.all(['Alumno', 'Mensualidad', 'PagoDetalle', 'PagoAgrupado']
    .map((nombre) => models[nombre].find({}).sort({ _id: 1 }).lean())));

  test('la simulacion calcula altas reales y revierte todas las escrituras', async () => {
    const antes = await snapshot();
    const resultado = await ajustar(models);
    expect(resultado).toMatchObject({ alumnos: 8, octubreEliminadas: 8, detallesEliminados: 8,
      noviembreConservadas: 1, noviembreEnRevisionConservadas: 1, noviembreCreadas: 5, inactivosSinCuotaNueva: 2 });
    expect(await snapshot()).toBe(antes);
  });

  test('aplica reglas de cobro, preserva noviembre y permite repetir sin duplicados', async () => {
    const guardarRespaldo = jest.fn().mockResolvedValue('respaldo-qa');
    const resultado = await ajustar(models, { apply: true, guardarRespaldo });
    expect(resultado.noviembreCreadas).toBe(5);
    expect(guardarRespaldo).toHaveBeenCalledTimes(1);
    expect(await models.Mensualidad.countDocuments({ mes: 10 })).toBe(0);
    expect(await models.PagoDetalle.countDocuments({})).toBe(1);
    expect(await models.Mensualidad.findById(noviembre._id).lean()).toMatchObject({
      _id: noviembre._id, monto_esperado: 17, estatus: 'En revision', pago_en_revision: true, credito_aplicado: 0
    });
    expect(await models.PagoDetalle.findById(pagoNoviembre._id).lean()).toEqual(pagoNoviembre.toObject());
    const esperados = [[0, 20], [1, 10], [2, 0], [3, 13], [4, 0]];
    for (const [indice, monto] of esperados) {
      const cuota = await models.Mensualidad.findOne({ id_alumno: alumnos[indice]._id, mes: 11 });
      expect(cuota.monto_esperado).toBe(monto);
      expect(cuota.es_inscripcion).toBe(false);
      if (indice === 2) expect(cuota.estatus).toBe('Becado');
      if (indice === 4) expect(cuota.estatus).toBe('Exento por reposo');
    }
    expect(await models.Alumno.countDocuments({ fecha_inicio_cobro: new Date('2026-11-01T12:00:00Z') })).toBe(8);
    const segunda = await ajustar(models, { apply: true, guardarRespaldo });
    expect(segunda).toMatchObject({ noviembreCreadas: 0, octubreEliminadas: 0, fechasActualizadas: 0 });
  });

  test('un fallo de respaldo impide cualquier cambio', async () => {
    const antes = await snapshot();
    await expect(ajustar(models, { apply: true, guardarRespaldo: async () => { throw new Error('QA respaldo'); } }))
      .rejects.toThrow('QA respaldo');
    expect(await snapshot()).toBe(antes);
  });

  test('un fallo de generacion revierte bajas y fechas ya modificadas', async () => {
    const antes = await snapshot();
    const fallo = jest.spyOn(models.Mensualidad, 'create').mockRejectedValueOnce(new Error('QA generacion'));
    try {
      await expect(ajustar(models, { apply: true, guardarRespaldo: jest.fn().mockResolvedValue('qa') }))
        .rejects.toThrow('QA generacion');
    } finally { fallo.mockRestore(); }
    expect(await snapshot()).toBe(antes);
  });

  test('elimina cabeceras de grupos completos de octubre sin dejar detalles huerfanos', async () => {
    const grupo = await models.PagoAgrupado.create({ codigo: 'QA', monto_total: 40, monto_total_bs: 4000,
      tasa_aplicada: 100, fecha_pago: new Date(), metodo_pago: 'QA', cantidad_atletas: 2 });
    const cuotas = await models.Mensualidad.find({ mes: 10 }).limit(2);
    await models.PagoDetalle.updateMany({ id_mensualidad: { $in: cuotas.map((cuota) => cuota._id) } },
      { $set: { id_pago_agrupado: grupo._id } });
    const resultado = await ajustar(models, { apply: true, guardarRespaldo: jest.fn().mockResolvedValue('qa') });
    expect(resultado.gruposEliminados).toBe(1);
    expect(await models.PagoAgrupado.countDocuments({})).toBe(0);
    expect(await models.PagoDetalle.countDocuments({ id_pago_agrupado: grupo._id })).toBe(0);
  });

  test('un grupo compartido con noviembre cancela el lote sin cambios', async () => {
    const grupoId = new mongoose.Types.ObjectId();
    await models.PagoDetalle.updateMany({}, { $set: { id_pago_agrupado: grupoId } });
    const antes = await snapshot();
    await expect(ajustar(models)).rejects.toThrow('eliminar parcialmente');
    expect(await snapshot()).toBe(antes);
  });

  test.each([false, true])('retira abonos de octubre con trazabilidad explicita=%s sin crear pagos de noviembre', async (explicita) => {
    const origen = await models.Mensualidad.findOne({ id_alumno: alumnos[7]._id, mes: 10 });
    origen.saldo_a_favor_generado = 10.03;
    await origen.save();
    await models.Alumno.updateMany({}, { $set: { saldo_a_favor_mensualidades: 999 } });
    noviembre.credito_aplicado = 10.03;
    noviembre.monto_esperado = 19.97;
    noviembre.estatus = 'Abono';
    if (explicita) noviembre.credito_origenes = [{ id_mensualidad: origen._id, monto: 10.03 }];
    await noviembre.save();
    await models.PagoDetalle.deleteOne({ _id: pagoNoviembre._id });
    await ajustar(models, { apply: true, guardarRespaldo: jest.fn().mockResolvedValue('qa') });
    expect(await models.Mensualidad.findById(noviembre._id)).toMatchObject({ monto_esperado: 30,
      credito_aplicado: 0, credito_en_revision: 0, credito_origenes: [], saldo_a_favor_generado: 0,
      pago_en_revision: false });
    expect((await models.Mensualidad.findById(noviembre._id)).estatus).not.toBe('Abono');
    expect(await models.Alumno.countDocuments({ saldo_a_favor_mensualidades: 0 })).toBe(8);
    expect(await models.PagoDetalle.countDocuments({})).toBe(0);
  });

  test.each(['Pagado', 'En revision'])('solo conserva excedente real de noviembre en estado %s', async (estatus) => {
    noviembre.credito_aplicado = 10;
    noviembre.monto_esperado = 20;
    noviembre.saldo_a_favor_generado = 15;
    noviembre.estatus = estatus;
    noviembre.pago_en_revision = estatus === 'En revision';
    await noviembre.save();
    pagoNoviembre.monto_pagado = 35;
    await pagoNoviembre.save();
    await models.Alumno.updateOne({ _id: alumnos[7]._id }, { $set: { saldo_a_favor_mensualidades: 123 } });
    await ajustar(models, { apply: true, guardarRespaldo: jest.fn().mockResolvedValue('qa') });
    expect(await models.Mensualidad.findById(noviembre._id)).toMatchObject({ monto_esperado: 30,
      credito_aplicado: 0, saldo_a_favor_generado: 5, saldo_a_favor_restante: 5, estatus });
    expect((await models.Alumno.findById(alumnos[7]._id)).saldo_a_favor_mensualidades).toBe(5);
    expect(await models.PagoDetalle.findById(pagoNoviembre._id).lean()).toEqual(pagoNoviembre.toObject());
  });

  test('respalda el archivo y solo lo elimina despues del commit; limpieza repetible', async () => {
    const archivo = await comprobanteOctubre();
    const simulado = await ajustar(models);
    expect(simulado.comprobantesAEliminar).toBe(1);
    expect(await fs.readFile(archivo, 'utf8')).toBe('comprobante-qa');
    const resultado = await ajustar(models, { apply: true, guardarRespaldo: guardarArchivos });
    expect(await fs.readFile(archivo, 'utf8')).toBe('comprobante-qa');
    const limpieza = await limpiarComprobantes(connection, resultado.respaldo, { uploadsRoot });
    expect(limpieza).toMatchObject({ eliminados: 1, pendientes: [] });
    await expect(fs.access(archivo)).rejects.toMatchObject({ code: 'ENOENT' });
    const copia = mongoose.mongo.BSON.EJSON.parse(await fs.readFile(resultado.respaldo, 'utf8'));
    expect(await fs.readFile(path.join(path.dirname(resultado.respaldo), copia.archivos[0].copia), 'utf8')).toBe('comprobante-qa');
    expect((await limpiarComprobantes(connection, resultado.respaldo, { uploadsRoot })).ausentes).toBe(1);
  });

  test('conserva un comprobante compartido con el pago de noviembre', async () => {
    const archivo = await comprobanteOctubre();
    pagoNoviembre.comprobante_url = '/uploads/olympykus/comprobantes/octubre.jpg';
    await pagoNoviembre.save();
    const resultado = await ajustar(models, { apply: true, guardarRespaldo: guardarArchivos });
    expect(resultado.comprobantesAEliminar).toBe(0);
    expect(resultado.comprobantesCompartidosConservados).toBe(1);
    expect((await limpiarComprobantes(connection, resultado.respaldo, { uploadsRoot })).eliminados).toBe(0);
    expect(await fs.readFile(archivo, 'utf8')).toBe('comprobante-qa');
  });

  test('un rollback conserva archivos y no permite limpiarlos usando su respaldo', async () => {
    const archivo = await comprobanteOctubre();
    let respaldo;
    const fallo = jest.spyOn(models.Mensualidad, 'create').mockRejectedValueOnce(new Error('QA rollback archivos'));
    try {
      await expect(ajustar(models, { apply: true, guardarRespaldo: async (datos) => {
        respaldo = await guardarArchivos(datos);
        return respaldo;
      } })).rejects.toThrow('QA rollback archivos');
    } finally { fallo.mockRestore(); }
    await expect(limpiarComprobantes(connection, respaldo, { uploadsRoot })).rejects.toThrow('confirmacion del commit');
    expect(await fs.readFile(archivo, 'utf8')).toBe('comprobante-qa');
  });

  test('no elimina un archivo que cambio despues del respaldo', async () => {
    const archivo = await comprobanteOctubre();
    const resultado = await ajustar(models, { apply: true, guardarRespaldo: guardarArchivos });
    await fs.writeFile(archivo, 'archivo-nuevo-qa');
    const limpieza = await limpiarComprobantes(connection, resultado.respaldo, { uploadsRoot });
    expect(limpieza.pendientes).toHaveLength(1);
    expect(limpieza.eliminados).toBe(0);
    expect(await fs.readFile(archivo, 'utf8')).toBe('archivo-nuevo-qa');
  });
});