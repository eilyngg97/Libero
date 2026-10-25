const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const mongoose = require('mongoose');
const { ejecutarConTransaccion } = require('../services/financeTransaction');
const { generarMensualidadesPendientesAlumno } = require('../controllers/mensualidadController');
const { obtenerCoberturaMensualidad } = require('../services/monthlyPaymentCoverage');

const TENANT_ID = 'olympykus';
const ANIO = 2026;
const FECHA_INICIO = new Date('2026-11-01T12:00:00.000Z');
const MODEL_NAMES = ['Alumno', 'Mensualidad', 'PagoDetalle', 'PagoAgrupado', 'Sede',
  'Reposo', 'TenantConfig', 'Representante', 'HistorialEstadoAlumno'];
const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');
const JOURNAL = 'ajustes_inicio_cobro';

function rutaComprobante(valor) {
  if (typeof valor !== 'string') return null;
  let ruta = valor;
  if (/^https?:\/\//i.test(ruta)) ruta = new URL(ruta).pathname;
  if (!ruta.startsWith('/uploads/')) return null;
  ruta = decodeURIComponent(ruta.slice('/uploads/'.length));
  if (ruta.includes('\\') || ruta.includes('\0') || ruta.split('/').some((parte) => parte === '..' || parte === '.')) {
    throw new Error('Ruta de comprobante insegura. No se borraran archivos.');
  }
  const partes = ruta.split('/');
  if (partes.length !== 3 || partes[0] !== TENANT_ID || partes[1] !== 'comprobantes' || !partes[2]) {
    return null;
  }
  return ruta;
}

function rutasEnDocumento(documento, resultado = new Set()) {
  if (typeof documento === 'string') {
    const ruta = rutaComprobante(documento);
    if (ruta) resultado.add(ruta);
  } else if (Array.isArray(documento)) {
    documento.forEach((valor) => rutasEnDocumento(valor, resultado));
  } else if (documento && typeof documento === 'object' && !documento._bsontype && !(documento instanceof Date)) {
    if (documento.comprobante_url && !String(documento.comprobante_url).startsWith('data:')
      && !rutaComprobante(documento.comprobante_url)) {
      throw new Error('Hay un comprobante fuera de /uploads/olympykus/comprobantes/. Revisar su ubicacion antes de aplicar.');
    }
    Object.values(documento).forEach((valor) => rutasEnDocumento(valor, resultado));
  }
  return resultado;
}

async function buscarReferencias(connection, colecciones, candidatos, { session, ignorados = new Map() } = {}) {
  const referencias = new Set();
  for (const nombre of colecciones) {
    const cursor = connection.db.collection(nombre).find({}, { session });
    for await (const documento of cursor) {
      if (ignorados.get(nombre)?.has(String(documento._id))) continue;
      for (const ruta of rutasEnDocumentoReferencias(documento)) {
        if (candidatos.has(ruta)) referencias.add(ruta);
      }
    }
  }
  return referencias;
}

function rutasEnDocumentoReferencias(documento, resultado = new Set()) {
  if (typeof documento === 'string') {
    const ruta = rutaComprobante(documento);
    if (ruta) resultado.add(ruta);
  } else if (Array.isArray(documento)) {
    documento.forEach((valor) => rutasEnDocumentoReferencias(valor, resultado));
  } else if (documento && typeof documento === 'object' && !documento._bsontype && !(documento instanceof Date)) {
    Object.values(documento).forEach((valor) => rutasEnDocumentoReferencias(valor, resultado));
  }
  return resultado;
}

async function archivoSeguro(ruta, uploadsRoot) {
  if (rutaComprobante(`/uploads/${ruta}`) !== ruta) throw new Error('Ruta de archivo fuera de Olympykus.');
  const absoluto = path.resolve(uploadsRoot, ruta);
  try {
    const raizReal = await fs.realpath(uploadsRoot);
    const archivoReal = await fs.realpath(absoluto);
    const relativa = path.relative(raizReal, archivoReal);
    if (relativa.startsWith('..') || path.isAbsolute(relativa)
      || path.relative(path.resolve(raizReal, ruta), archivoReal) !== '' || !(await fs.stat(archivoReal)).isFile()) {
      throw new Error('El comprobante resuelve fuera del directorio de uploads.');
    }
    return absoluto;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

async function respaldar(datos, { directorio = path.join(__dirname, '..', 'backups'), uploadsRoot = UPLOADS_ROOT } = {}) {
  const destino = path.join(directorio, `olympykus-inicio-noviembre-${datos.runId}`);
  await fs.mkdir(destino, { recursive: true, mode: 0o700 });
  const archivos = [];
  for (const ruta of datos.comprobantesAEliminar) {
    const origen = await archivoSeguro(ruta, uploadsRoot);
    if (!origen) {
      archivos.push({ ruta, ausente: true });
      continue;
    }
    const contenido = await fs.readFile(origen);
    const copia = `${archivos.length}.bin`;
    await fs.writeFile(path.join(destino, copia), contenido, { flag: 'wx', mode: 0o600 });
    archivos.push({ ruta, copia, sha256: createHash('sha256').update(contenido).digest('hex') });
  }
  const manifiesto = path.join(destino, 'respaldo.ejson');
  await fs.writeFile(manifiesto, mongoose.mongo.BSON.EJSON.stringify({ ...datos, archivos }, { relaxed: false }),
    { flag: 'wx', mode: 0o600 });
  return manifiesto;
}

async function limpiarComprobantes(connection, respaldo, { uploadsRoot = UPLOADS_ROOT } = {}) {
  const datos = mongoose.mongo.BSON.EJSON.parse(await fs.readFile(respaldo, 'utf8'));
  if (datos.tenantId !== TENANT_ID || !datos.runId) throw new Error('Respaldo ajeno a Olympykus.');
  const commit = await connection.db.collection(JOURNAL).findOne({ _id: datos.runId, tenantId: TENANT_ID });
  if (!commit) throw new Error('No existe confirmacion del commit de este respaldo. No se borraran archivos.');
  const colecciones = (await connection.db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name);
  const referencias = await buscarReferencias(connection, colecciones, new Set(datos.archivos.map((archivo) => archivo.ruta)));
  const resultado = { eliminados: 0, ausentes: 0, compartidosConservados: 0, pendientes: [] };
  for (const archivo of datos.archivos) {
    if (referencias.has(archivo.ruta)) {
      resultado.compartidosConservados += 1;
      continue;
    }
    try {
      const absoluto = await archivoSeguro(archivo.ruta, uploadsRoot);
      if (!absoluto) {
        resultado.ausentes += 1;
        continue;
      }
      if (!archivo.sha256) throw new Error('El archivo no existia al respaldar; no se borrara un archivo nuevo.');
      if (!/^\d+\.bin$/.test(archivo.copia)) throw new Error('Nombre de copia de respaldo invalido.');
      const copia = await fs.readFile(path.join(path.dirname(respaldo), archivo.copia));
      if (createHash('sha256').update(copia).digest('hex') !== archivo.sha256) throw new Error('Copia de respaldo alterada.');
      const contenido = await fs.readFile(absoluto);
      if (createHash('sha256').update(contenido).digest('hex') !== archivo.sha256) throw new Error('El archivo cambio despues del respaldo.');
      await fs.unlink(absoluto);
      resultado.eliminados += 1;
    } catch (error) {
      resultado.pendientes.push({ ruta: archivo.ruta, motivo: error.message });
    }
  }
  return resultado;
}

function validarDependencias({ octubre, restantes, pagosAgrupados, alumnos }) {
  const idsOctubre = new Set(octubre.map((cuota) => String(cuota._id)));
  if (restantes.some((cuota) => cuota.mes !== 11 || cuota.anio !== ANIO)) {
    throw new Error('Hay cuotas fuera de octubre/noviembre 2026. Revisar sus pagos y creditos antes de continuar.');
  }
  if (pagosAgrupados.some((pago) => !idsOctubre.has(String(pago.id_mensualidad)))) {
    throw new Error('Un pago agrupado incluye octubre y otros periodos. No se puede eliminar parcialmente.');
  }
  const alumnosConCuotas = new Set(alumnos.map((alumno) => String(alumno._id)));
  if ([...octubre, ...restantes].some((cuota) => !alumnosConCuotas.has(String(cuota.id_alumno)))) {
    throw new Error('Hay cuotas sin alumno. Revisar antes de continuar.');
  }
}

function normalizarNoviembre(cuota, pagos) {
  const centavos = (monto) => Math.round(Number(monto || 0) * 100);
  const creditoAnterior = centavos(cuota.credito_aplicado);
  const esperado = (centavos(cuota.monto_esperado) + creditoAnterior) / 100;
  const cobertura = obtenerCoberturaMensualidad(esperado, pagos);
  const generado = Math.max(0, centavos(cobertura.totalPagado) - centavos(esperado)) / 100;
  const revision = cobertura.totalPagado > 0
    && (cuota.pago_en_revision ?? (cuota.estatus === 'En revision'));
  let estatus = cuota.estatus;
  if (!['Becado', 'Exonerado', 'Exento por reposo'].includes(estatus)) {
    if (cobertura.totalPagado > 0) {
      estatus = revision ? 'En revision' : (cobertura.cubreEsperadoConTolerancia ? 'Pagado' : 'Abono');
    } else {
      estatus = new Date(cuota.fecha_vencimiento) <= new Date() ? 'Insolvente' : 'Pendiente';
    }
  }
  return {
    credito_aplicado: 0,
    credito_origenes: [],
    credito_en_revision: 0,
    pago_en_revision: Boolean(revision),
    monto_esperado: esperado,
    monto_sin_recargo_usd: Math.max(0, centavos(esperado) - centavos(cuota.recargo_aplicado_usd)) / 100,
    monto_con_recargo_usd: esperado,
    saldo_a_favor_generado: generado,
    saldo_a_favor_restante: generado,
    estatus
  };
}

async function ajustar(models, { apply = false, guardarRespaldo } = {}) {
  let resumen;
  const runId = randomUUID();
  const connection = models.Mensualidad.db;
  const colecciones = (await connection.db.listCollections({}, { nameOnly: true }).toArray()).map((item) => item.name);
  const rollbackSimulacion = new Error('ROLLBACK_SIMULACION_OLYMPYKUS');
  try {
    await ejecutarConTransaccion(models.Mensualidad, async (session) => {
      const alumnos = await models.Alumno.find({}).session(session);
      const octubre = await models.Mensualidad.find({ mes: 10, anio: ANIO }).session(session).lean();
      const idsOctubre = octubre.map((cuota) => cuota._id);
      const restantes = await models.Mensualidad.find({ _id: { $nin: idsOctubre } }).session(session).lean();
      const pagos = await models.PagoDetalle.find({ id_mensualidad: { $in: idsOctubre } }).session(session).lean();
      const idsGrupos = [...new Set(pagos.map((pago) => pago.id_pago_agrupado).filter(Boolean).map(String))];
      const pagosAgrupados = await models.PagoDetalle.find({ id_pago_agrupado: { $in: idsGrupos } }).session(session).lean();
      const grupos = await models.PagoAgrupado.find({ _id: { $in: idsGrupos } }).session(session).lean();
      validarDependencias({ octubre, restantes, pagosAgrupados, alumnos });
      if (!alumnos.length) throw new Error('El tenant no tiene alumnos. No se modifico nada.');

      const noviembre = restantes.filter((cuota) => cuota.mes === 11 && cuota.anio === ANIO);
      const pagosNoviembre = await models.PagoDetalle.find({ id_mensualidad: { $in: noviembre.map((cuota) => cuota._id) } })
        .session(session).lean();
      const candidatos = rutasEnDocumento([...octubre, ...pagos, ...grupos]);
      const ignorados = new Map([
        [models.Mensualidad.collection.name, new Set(idsOctubre.map(String))],
        [models.PagoDetalle.collection.name, new Set(pagos.map((pago) => String(pago._id)))],
        [models.PagoAgrupado.collection.name, new Set(idsGrupos)]
      ]);
      const compartidos = await buscarReferencias(connection, colecciones, candidatos, { session, ignorados });
      const comprobantesAEliminar = [...candidatos].filter((ruta) => !compartidos.has(ruta));
      resumen = {
        tenantId: TENANT_ID,
        modo: apply ? 'apply' : 'simulacion-con-rollback',
        fechaInicioCobro: FECHA_INICIO.toISOString(),
        alumnos: alumnos.length,
        fechasActualizadas: 0,
        octubreEliminadas: octubre.length,
        detallesEliminados: pagos.length,
        gruposEliminados: grupos.length,
        noviembreConservadas: noviembre.length,
        noviembreEnRevisionConservadas: noviembre.filter((cuota) => cuota.estatus === 'En revision').length,
        noviembreCreadas: 0,
        noviembreRecalculadas: 0,
        creditoRetiradoNoviembre: 0,
        saldoFinalNoviembre: 0,
        inactivosSinCuotaNueva: 0,
        estadosNuevas: {}
      };
      resumen.baseDeDatos = connection.name;
      resumen.comprobantesAEliminar = comprobantesAEliminar.length;
      resumen.comprobantesCompartidosConservados = compartidos.size;

      if (apply) {
        if (typeof guardarRespaldo !== 'function') throw new Error('Se requiere respaldo antes de aplicar.');
        resumen.respaldo = await guardarRespaldo({
          tenantId: TENANT_ID,
          runId,
          fecha: new Date(),
          comprobantesAEliminar,
          alumnos: alumnos.map((alumno) => alumno.toObject()),
          mensualidades: [...octubre, ...restantes],
          pagosOctubre: pagos,
          pagosAgrupadosOctubre: grupos,
          pagosNoviembre
        });
        await connection.db.collection(JOURNAL).insertOne({ _id: runId, tenantId: TENANT_ID,
          fecha: new Date(), respaldo: resumen.respaldo }, { session });
      }

      await models.PagoDetalle.deleteMany({ _id: { $in: pagos.map((pago) => pago._id) } }).session(session);
      await models.PagoAgrupado.deleteMany({ _id: { $in: idsGrupos } }).session(session);
      await models.Mensualidad.deleteMany({ _id: { $in: idsOctubre } }).session(session);

      const saldoNoviembre = new Map();
      for (const cuota of noviembre) {
        const detalles = pagosNoviembre.filter((pago) => String(pago.id_mensualidad) === String(cuota._id));
        const cambios = normalizarNoviembre(cuota, detalles);
        const modificada = Object.entries(cambios).some(([campo, valor]) =>
          JSON.stringify(cuota[campo]) !== JSON.stringify(valor));
        if (modificada) {
          await models.Mensualidad.updateOne({ _id: cuota._id }, { $set: cambios }).session(session);
          resumen.noviembreRecalculadas += 1;
        }
        saldoNoviembre.set(String(cuota.id_alumno), cambios.saldo_a_favor_generado);
        resumen.creditoRetiradoNoviembre = Math.round((resumen.creditoRetiradoNoviembre + Number(cuota.credito_aplicado || 0)) * 100) / 100;
        resumen.saldoFinalNoviembre = Math.round((resumen.saldoFinalNoviembre + cambios.saldo_a_favor_generado) * 100) / 100;
      }

      for (const alumno of alumnos) {
        const saldoValido = saldoNoviembre.get(String(alumno._id)) || 0;
        const cambioSaldo = Number(alumno.saldo_a_favor_mensualidades || 0) !== saldoValido;
        alumno.saldo_a_favor_mensualidades = saldoValido;
        if (alumno.fecha_inicio_cobro?.getTime() !== FECHA_INICIO.getTime()) {
          alumno.fecha_inicio_cobro = new Date(FECHA_INICIO);
          resumen.fechasActualizadas += 1;
        }
        if (alumno.isModified('fecha_inicio_cobro') || cambioSaldo) await alumno.save({ session });
        if (alumno.activo === false || alumno.dado_de_baja === true) {
          resumen.inactivosSinCuotaNueva += 1;
          continue;
        }
        const resultados = await generarMensualidadesPendientesAlumno(alumno, {
          models,
          periodoInicio: { mes: 11, anio: ANIO },
          periodoFin: { mes: 11, anio: ANIO },
          esInscripcionOverride: false,
          session
        });
        for (const resultado of resultados) {
          if (!resultado.creada) continue;
          resumen.noviembreCreadas += 1;
          const estado = resultado.mensualidad.estatus;
          resumen.estadosNuevas[estado] = (resumen.estadosNuevas[estado] || 0) + 1;
        }
      }

      if (await models.Mensualidad.countDocuments({ mes: 10, anio: ANIO }).session(session)) {
        throw new Error('Verificacion fallida: quedan mensualidades de octubre.');
      }
      const nuevasNoviembre = await models.Mensualidad.find({ mes: 11, anio: ANIO }).session(session).lean();
      const alumnosNoviembre = new Set(nuevasNoviembre.map((cuota) => String(cuota.id_alumno)));
      if (alumnos.some((alumno) => alumno.activo !== false && alumno.dado_de_baja !== true
        && !alumnosNoviembre.has(String(alumno._id)))) {
        throw new Error('Verificacion fallida: faltan alumnos con mensualidad de noviembre.');
      }
      const pagosConservados = await models.PagoDetalle.find({ _id: { $in: pagosNoviembre.map((pago) => pago._id) } })
        .session(session).lean();
      const originalesPorId = new Map(pagosNoviembre.map((pago) => [String(pago._id), mongoose.mongo.BSON.EJSON.stringify(pago)]));
      if (pagosConservados.length !== pagosNoviembre.length || pagosConservados.some((pago) =>
        originalesPorId.get(String(pago._id)) !== mongoose.mongo.BSON.EJSON.stringify(pago))) {
        throw new Error('Verificacion fallida: se modificaron pagos directos de noviembre.');
      }
      if (!apply) throw rollbackSimulacion;
    }, { obligatoria: true });
  } catch (error) {
    if (error !== rollbackSimulacion) throw error;
  }
  return resumen;
}

async function main() {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
  const args = process.argv.slice(2);
  const reintentar = args.length === 2 && args[0] === '--limpiar-comprobantes';
  if (!reintentar && !(args.length === 0 || (args.length === 1 && args[0] === '--apply'))) {
    throw new Error('Uso: node scripts/ajustar_inicio_cobro_olympykus.js [--apply | --limpiar-comprobantes <respaldo.ejson>].');
  }
  const { getTenantCoreConnection } = require('../config/tenantCoreConnection');
  const { getTenantCoreModel } = require('../models/TenantCore');
  const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
  const { getTenantModel } = require('../services/tenantModelService');
  let connection;
  const core = await getTenantCoreConnection();
  try {
    const tenant = await getTenantCoreModel(core).findOne({ tenantId: TENANT_ID }).lean();
    if (!tenant?.dbUri) throw new Error('No existe olympykus con dbUri explicita en el core configurado. No se usara una BD fallback.');
    connection = await getTenantBusinessConnection(tenant);
    const models = Object.fromEntries(MODEL_NAMES.map((name) => [name, getTenantModel(connection, name)]));
    if (reintentar) {
      const limpieza = await limpiarComprobantes(connection, path.resolve(args[1]));
      console.log(JSON.stringify(limpieza, null, 2));
      if (limpieza.pendientes.length) process.exitCode = 1;
      return;
    }
    const resumen = await ajustar(models, {
      apply: args.includes('--apply'),
      guardarRespaldo: respaldar
    });
    if (resumen.respaldo) {
      resumen.estadoBaseDeDatos = 'commit-confirmado';
      try {
        resumen.comprobantes = await limpiarComprobantes(connection, resumen.respaldo);
        if (resumen.comprobantes.pendientes.length) process.exitCode = 1;
      } catch (error) {
        resumen.comprobantes = { limpiezaPendiente: true, motivo: error.message };
        process.exitCode = 1;
      }
    }
    console.log(JSON.stringify(resumen, null, 2));
  } finally {
    if (connection) await connection.close();
    await core.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Error en ajuste/limpieza Olympykus:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { ajustar, validarDependencias, normalizarNoviembre, rutaComprobante,
  respaldar, limpiarComprobantes };