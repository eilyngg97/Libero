require('dotenv').config();
const mongoose = require('mongoose');
const { listActiveTenants } = require('../services/tenantResolverService');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const { aplicarRecargoMensualidadSegunConfig } = require('../controllers/mensualidadController');

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
  // pasar el objeto tenant completo para que getTenantBusinessConnection pueda
  // usar tenant.dbUri cuando esté disponible en el registro leído desde core
  const connection = await getTenantBusinessConnection(tenant);
  return {
    connection,
    Mensualidad: getTenantModel(connection, 'Mensualidad'),
    Alumno: getTenantModel(connection, 'Alumno'),
    PagoDetalle: getTenantModel(connection, 'PagoDetalle'),
    TenantConfig: getTenantModel(connection, 'TenantConfig')
  };
}

function buildMensualidadFilter({ mes, anio, alumnoId }) {
  const filtro = {
    // El recargo solo debe evaluarse en deudas activas, no en pagos bajo revisión.
    estatus: { $in: ['Pendiente', 'Insolvente', 'Abono'] },
    bloqueo_recargo_automatico: { $ne: true },
    monto_esperado: { $gt: 0 },
    $or: [
      { recargo_aplicado_usd: { $exists: false } },
      { recargo_aplicado_usd: { $lte: 0 } }
    ]
  };

  if (mes !== null) filtro.mes = mes;
  if (anio !== null) filtro.anio = anio;
  if (alumnoId) filtro.id_alumno = alumnoId;

  return filtro;
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

function obtenerFechaCortePagoMensualidad(mensualidad) {
  const diaPersonalizado = normalizarDiaMes(mensualidad?.id_alumno?.dia_limite_personalizado, null);
  const fechaPorPeriodo = construirFechaCortePeriodo(mensualidad?.mes, mensualidad?.anio, diaPersonalizado);
  if (fechaPorPeriodo) return fechaPorPeriodo;

  const fechaVencimiento = mensualidad?.fecha_vencimiento ? new Date(mensualidad.fecha_vencimiento) : null;
  if (!fechaVencimiento || Number.isNaN(fechaVencimiento.getTime())) return null;
  return fechaVencimiento;
}

function recargoYaAplicado(mensualidad) {
  const recargoMonto = Number(mensualidad?.recargo_aplicado_usd || 0) > 0;
  const flagRecargo = mensualidad?.aplica_recargo === true;
  const fechaAplicacion = !!mensualidad?.fecha_aplicacion_recargo;
  return recargoMonto || flagRecargo || fechaAplicacion;
}

async function procesarTenant(tenant, args, hoy) {
  const models = await getTenantModels(tenant);
  const filtro = buildMensualidadFilter(args);
  let query = models.Mensualidad.find(filtro).populate('id_alumno', 'tipo_mensualidad aplicar_recargo_mensualidad dia_limite_personalizado');

  if (args.limit !== null) {
    query = query.limit(args.limit);
  }

  const candidatas = await query;
  const resultadoTenant = {
    tenantId: tenant.tenantId,
    nombre: tenant.nombre,
    total: candidatas.length,
    estatusCorregidos: 0,
    aplicadas: 0,
    noAplicadas: 0,
    detallesNoAplicadas: []
  };

  for (const mensualidad of candidatas) {
    const estatusActual = String(mensualidad?.estatus || '').toLowerCase();
    if (estatusActual === 'pendiente') {
      const fechaCortePago = obtenerFechaCortePagoMensualidad(mensualidad);
      if (fechaCortePago && fechaCortePago < hoy) {
        mensualidad.estatus = 'Insolvente';
        resultadoTenant.estatusCorregidos += 1;

        if (args.apply) {
          await mensualidad.save();
        }

        if (args.verbose) {
          console.log(`TENANT ${tenant.tenantId} ESTATUS AJUSTADO: ${mensualidad._id} pendiente -> insolvente fechaCorte=${fechaCortePago.toISOString()}`);
        }
      }
    }

    if (String(mensualidad?.estatus || '').toLowerCase() === 'en revision') {
      resultadoTenant.noAplicadas += 1;
      resultadoTenant.detallesNoAplicadas.push({
        id: String(mensualidad._id),
        periodo: `${mensualidad.mes}/${mensualidad.anio}`,
        alumnoId: String(mensualidad.id_alumno?._id || mensualidad.id_alumno),
        estatus: mensualidad.estatus,
        monto_esperado: mensualidad.monto_esperado,
        recargo_aplicado_usd: mensualidad.recargo_aplicado_usd,
        fechaRecargo: null,
        motivo: 'pago en revision'
      });

      if (args.verbose) {
        console.log(`TENANT ${tenant.tenantId} NO APLICADO: ${mensualidad._id} motivo=pago en revision`);
      }
      continue;
    }

    if (recargoYaAplicado(mensualidad)) {
      resultadoTenant.noAplicadas += 1;
      resultadoTenant.detallesNoAplicadas.push({
        id: String(mensualidad._id),
        periodo: `${mensualidad.mes}/${mensualidad.anio}`,
        alumnoId: String(mensualidad.id_alumno?._id || mensualidad.id_alumno),
        estatus: mensualidad.estatus,
        monto_esperado: mensualidad.monto_esperado,
        recargo_aplicado_usd: mensualidad.recargo_aplicado_usd,
        fechaRecargo: mensualidad.fecha_aplicacion_recargo || null,
        motivo: 'recargo ya aplicado previamente'
      });

      if (args.verbose) {
        console.log(`TENANT ${tenant.tenantId} NO APLICADO: ${mensualidad._id} motivo=recargo ya aplicado previamente`);
      }
      continue;
    }

    const resultado = await aplicarRecargoMensualidadSegunConfig(mensualidad, {
      fechaReferencia: hoy,
      persistir: args.apply,
      models
    });

    if (resultado.aplicado) {
      resultadoTenant.aplicadas += 1;
      if (args.verbose) {
        console.log(`TENANT ${tenant.tenantId} APLICADO: ${mensualidad._id} periodo=${mensualidad.mes}/${mensualidad.anio} alumno=${String(mensualidad.id_alumno?._id || mensualidad.id_alumno)} recargo=${mensualidad.recargo_aplicado_usd} fechaRecargo=${resultado.fechaRecargo}`);
      }
    } else {
      resultadoTenant.noAplicadas += 1;
      const motivo = Number(resultado.configCobro?.recargo_usd || 0) <= 0
        ? 'recargo_usd=0'
        : (resultado.fechaRecargo && hoy < new Date(resultado.fechaRecargo))
          ? 'fechaRecargo no alcanzada'
          : 'no elegible para recargo';

      resultadoTenant.detallesNoAplicadas.push({
        id: String(mensualidad._id),
        periodo: `${mensualidad.mes}/${mensualidad.anio}`,
        alumnoId: String(mensualidad.id_alumno?._id || mensualidad.id_alumno),
        estatus: mensualidad.estatus,
        monto_esperado: mensualidad.monto_esperado,
        recargo_aplicado_usd: mensualidad.recargo_aplicado_usd,
        fechaRecargo: resultado.fechaRecargo,
        motivo
      });

      if (args.verbose) {
        console.log(`TENANT ${tenant.tenantId} NO APLICADO: ${mensualidad._id} motivo=${motivo} fechaRecargo=${resultado.fechaRecargo}`);
      }
    }
  }

  return resultadoTenant;
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
  let totalEstatusCorregidos = 0;
  let totalAplicadas = 0;
  let totalNoAplicadas = 0;
  const reporte = [];

  for (const tenant of tenantsToProcess) {
    // logs para depuración: mostrar resumen y documento completo del tenant recibido
    try {
      console.log('[APLICAR-RECARGO] tenant recibido (summary):', {
        tenantId: tenant && tenant.tenantId,
        nombre: tenant && tenant.nombre,
        dbUri: tenant && tenant.dbUri
      });
      console.log('[APLICAR-RECARGO] tenant completo:', JSON.stringify(tenant));
    } catch (e) {
      console.warn('[APLICAR-RECARGO] error serializando tenant para logs', e && e.message);
    }
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

    totalCandidatas += resultado.total;
    totalEstatusCorregidos += resultado.estatusCorregidos;
    totalAplicadas += resultado.aplicadas;
    totalNoAplicadas += resultado.noAplicadas;
    reporte.push(resultado);

    console.log(`TENANT ${tenant.tenantId} (${tenant.nombre || 'sin nombre'}) -> candidatas=${resultado.total} estatusCorregidos=${resultado.estatusCorregidos} aplicadas=${resultado.aplicadas} noAplicadas=${resultado.noAplicadas}`);
  }

  console.log('---');
  console.log(`Total tenants procesados: ${tenantsToProcess.length}`);
  console.log(`Total candidatas: ${totalCandidatas}`);
  console.log(`Total estatus corregidos a Insolvente: ${totalEstatusCorregidos}`);
  console.log(`Total recargos aplicados: ${totalAplicadas}`);
  console.log(`Total no aplicados: ${totalNoAplicadas}`);

  if (totalNoAplicadas > 0) {
    console.log('Primeras no aplicadas por tenant:');
    for (const resultado of reporte) {
      if (resultado.detallesNoAplicadas.length === 0) continue;
      console.log(`Tenant ${resultado.tenantId} (${resultado.nombre}):`);
      resultado.detallesNoAplicadas.slice(0, 5).forEach((item) => {
        console.log(`  - ${item.id} periodo=${item.periodo} estatus=${item.estatus} motivo=${item.motivo} fechaRecargo=${item.fechaRecargo}`);
      });
    }
  }

  if (!args.apply) {
    console.log('Dry-run finalizado. Agrega --apply para aplicar los recargos en la base de datos.');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
