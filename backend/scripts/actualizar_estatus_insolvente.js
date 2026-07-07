require('dotenv').config();
const mongoose = require('mongoose');
const { listActiveTenants } = require('../services/tenantResolverService');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');

function parseArgs(argv) {
  const args = {
    apply: false,
    verbose: false,
    limit: null,
    mes: null,
    anio: null,
    tenantId: null,
    allTenants: false
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--apply') args.apply = true;
    if (token === '--verbose') args.verbose = true;
    if (token === '--all-tenants') args.allTenants = true;
    if (token.startsWith('--limit=')) args.limit = Number(token.split('=')[1]);
    if (token.startsWith('--mes=')) args.mes = Number(token.split('=')[1]);
    if (token.startsWith('--anio=')) args.anio = Number(token.split('=')[1]);
    if (token.startsWith('--tenant-id=')) args.tenantId = token.split('=')[1];
  }

  return args;
}

function validarArgs(args) {
  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit <= 0)) {
    throw new Error('Parametro --limit invalido. Debe ser un entero mayor a 0.');
  }

  if (args.mes !== null && (!Number.isInteger(args.mes) || args.mes < 1 || args.mes > 12)) {
    throw new Error('Parametro --mes invalido. Debe estar entre 1 y 12.');
  }

  if (args.anio !== null && (!Number.isInteger(args.anio) || args.anio < 2000)) {
    throw new Error('Parametro --anio invalido. Debe ser un anio valido.');
  }
}

async function getTenantModels(tenant) {
  const connection = await getTenantBusinessConnection(tenant);
  return {
    connection,
    Mensualidad: getTenantModel(connection, 'Mensualidad'),
    Alumno: getTenantModel(connection, 'Alumno')
  };
}

function normalizarDiaMes(value, fallback = null) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 31) return fallback;
  return parsed;
}

function construirFechaCortePeriodo(mes, anio, dia) {
  const mesNum = Number(mes);
  const anioNum = Number(anio);
  const diaNum = normalizarDiaMes(dia, null);

  if (!Number.isInteger(mesNum) || mesNum < 1 || mesNum > 12) return null;
  if (!Number.isInteger(anioNum) || anioNum < 1900) return null;
  if (!diaNum) return null;

  const ultimoDiaMes = new Date(Date.UTC(anioNum, mesNum, 0)).getUTCDate();
  const diaAjustado = Math.min(diaNum, ultimoDiaMes);

  return new Date(Date.UTC(anioNum, mesNum - 1, diaAjustado, 23, 59, 59, 999));
}

function obtenerFechaVencimiento(mensualidad) {
  const diaPersonalizado = normalizarDiaMes(mensualidad?.id_alumno?.dia_limite_personalizado, null);
  const fechaPorPeriodo = construirFechaCortePeriodo(mensualidad?.mes, mensualidad?.anio, diaPersonalizado);
  if (fechaPorPeriodo) return fechaPorPeriodo;

  const fechaVencimiento = mensualidad?.fecha_vencimiento ? new Date(mensualidad.fecha_vencimiento) : null;
  if (!fechaVencimiento || Number.isNaN(fechaVencimiento.getTime())) return null;
  return fechaVencimiento;
}

async function procesarTenant(tenant, args, hoy) {
  const models = await getTenantModels(tenant);
  const filtro = {
    estatus: 'Pendiente',
    monto_esperado: { $gt: 0 }
  };

  if (args.mes !== null) filtro.mes = args.mes;
  if (args.anio !== null) filtro.anio = args.anio;

  let query = models.Mensualidad.find(filtro)
    .select('_id id_alumno mes anio estatus monto_esperado fecha_vencimiento')
    .populate('id_alumno', 'dia_limite_personalizado');

  if (args.limit !== null) {
    query = query.limit(args.limit);
  }

  const candidatas = await query;
  const vencidas = [];

  for (const mensualidad of candidatas) {
    const fechaVencimiento = obtenerFechaVencimiento(mensualidad);
    if (!fechaVencimiento || fechaVencimiento >= hoy) continue;
    vencidas.push({ mensualidad, fechaVencimiento });
  }

  if (args.verbose) {
    console.log(`TENANT ${tenant.tenantId}: candidatas=${candidatas.length} vencidas=${vencidas.length}`);
    vencidas.slice(0, 20).forEach(({ mensualidad, fechaVencimiento }) => {
      console.log(
        `  - ${mensualidad._id} periodo=${mensualidad.mes}/${mensualidad.anio} fechaVencimiento=${fechaVencimiento.toISOString()} estatus=${mensualidad.estatus}`
      );
    });
  }

  if (!args.apply || vencidas.length === 0) {
    return {
      tenantId: tenant.tenantId,
      nombre: tenant.nombre,
      candidatas: candidatas.length,
      vencidas: vencidas.length,
      actualizadas: 0
    };
  }

  const ids = vencidas.map(({ mensualidad }) => mensualidad._id);
  const result = await models.Mensualidad.updateMany(
    { _id: { $in: ids } },
    { $set: { estatus: 'Insolvente' } }
  );

  return {
    tenantId: tenant.tenantId,
    nombre: tenant.nombre,
    candidatas: candidatas.length,
    vencidas: vencidas.length,
    actualizadas: result.modifiedCount || 0
  };
}

async function main() {
  const args = parseArgs(process.argv);
  validarArgs(args);

  const tenants = await listActiveTenants();
  if (!tenants || tenants.length === 0) {
    throw new Error('No se encontraron tenants activos.');
  }

  let tenantsToProcess = tenants;
  if (args.tenantId) {
    tenantsToProcess = tenants.filter((tenant) => String(tenant.tenantId) === String(args.tenantId));
    if (tenantsToProcess.length === 0) {
      throw new Error(`No se encontro el tenant activo con tenantId=${args.tenantId}`);
    }
  }

  if (!args.allTenants && !args.tenantId) {
    console.log('Procesando todos los tenants activos. Usa --tenant-id=<id> para un tenant especifico.');
  }

  const hoy = new Date();
  let totalCandidatas = 0;
  let totalVencidas = 0;
  let totalActualizadas = 0;

  for (const tenant of tenantsToProcess) {
    if (!tenant.tenantId || typeof tenant.tenantId !== 'string') {
      console.warn(`SKIP TENANT: no tenantId definido para registro ${tenant._id || '(sin id)'}`);
      continue;
    }

    if (!tenant.dbUri || typeof tenant.dbUri !== 'string' || !tenant.dbUri.trim()) {
      console.warn(`SKIP TENANT ${tenant.tenantId}: dbUri no definido o invalido`);
      continue;
    }

    let resultado;
    try {
      resultado = await procesarTenant(tenant, args, hoy);
    } catch (error) {
      console.error(`ERROR TENANT ${tenant.tenantId}: ${error.message || error}`);
      continue;
    }

    totalCandidatas += resultado.candidatas;
    totalVencidas += resultado.vencidas;
    totalActualizadas += resultado.actualizadas;

    console.log(
      `TENANT ${tenant.tenantId} (${resultado.nombre || 'sin nombre'}) -> candidatas=${resultado.candidatas} vencidas=${resultado.vencidas} actualizadas=${resultado.actualizadas}`
    );
  }

  console.log('---');
  console.log(`Total tenants procesados: ${tenantsToProcess.length}`);
  console.log(`Total candidatas: ${totalCandidatas}`);
  console.log(`Total vencidas: ${totalVencidas}`);
  console.log(`Total actualizadas a Insolvente: ${totalActualizadas}`);

  if (!args.apply) {
    console.log('Dry-run finalizado. Agrega --apply para aplicar los cambios en la base de datos.');
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Error:', err.message || err);
  try {
    await mongoose.disconnect();
  } catch (_) {
    // no-op
  }
  process.exit(1);
});