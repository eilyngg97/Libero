require('dotenv').config();
const mongoose = require('mongoose');
const { listActiveTenants } = require('../services/tenantResolverService');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');

function parseArgs(argv) {
  const args = {
    apply: false,
    allTenants: false,
    tenantId: null,
    fecha: null,
    diaVencimiento: 5,
    setDiasGracia: null,
    verbose: false
  };

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--apply') args.apply = true;
    if (token === '--all-tenants') args.allTenants = true;
    if (token === '--verbose') args.verbose = true;
    if (token.startsWith('--tenant-id=')) args.tenantId = token.split('=')[1];
    if (token.startsWith('--fecha=')) args.fecha = token.split('=')[1];
    if (token.startsWith('--dia-vencimiento=')) args.diaVencimiento = Number(token.split('=')[1]);
    if (token.startsWith('--set-dias-gracia=')) args.setDiasGracia = Number(token.split('=')[1]);
  }

  return args;
}

function validarArgs(args) {
  if (!args.fecha || !/^\d{4}-\d{2}-\d{2}$/.test(args.fecha)) {
    throw new Error('Debes indicar --fecha=AAAA-MM-DD. Ejemplo: --fecha=2026-10-05');
  }

  const [anio, mes, dia] = args.fecha.split('-').map(Number);
  const fechaValida = new Date(Date.UTC(anio, mes - 1, dia));
  if (
    fechaValida.getUTCFullYear() !== anio ||
    fechaValida.getUTCMonth() !== mes - 1 ||
    fechaValida.getUTCDate() !== dia
  ) {
    throw new Error(`Fecha invalida: ${args.fecha}`);
  }

  if (!args.allTenants && !args.tenantId) {
    throw new Error('Indica --all-tenants o --tenant-id=<id>.');
  }

  if (args.allTenants && args.tenantId) {
    throw new Error('Usa --all-tenants o --tenant-id, no ambos.');
  }

  if (!Number.isInteger(args.diaVencimiento) || args.diaVencimiento < 1 || args.diaVencimiento > 31) {
    throw new Error('--dia-vencimiento debe ser un entero entre 1 y 31.');
  }

  if (
    args.setDiasGracia !== null &&
    (!Number.isInteger(args.setDiasGracia) || args.setDiasGracia < 0 || args.setDiasGracia > 31)
  ) {
    throw new Error('--set-dias-gracia debe ser un entero entre 0 y 31.');
  }
}

function obtenerRangoDiaCaracas(fechaTexto) {
  const [anio, mes, dia] = fechaTexto.split('-').map(Number);
  return {
    inicio: new Date(Date.UTC(anio, mes - 1, dia, 4, 0, 0, 0)),
    fin: new Date(Date.UTC(anio, mes - 1, dia + 1, 4, 0, 0, 0)),
    mes,
    anio
  };
}

function redondearMonto(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function evaluarCandidata(mensualidad, pagosPosteriores = 0) {
  const diaPersonalizado = Number(mensualidad?.id_alumno?.dia_limite_personalizado);
  if (Number.isInteger(diaPersonalizado) && diaPersonalizado >= 1 && diaPersonalizado <= 31) {
    return { elegible: false, motivo: `dia personalizado=${diaPersonalizado}` };
  }

  if (pagosPosteriores > 0) {
    return { elegible: false, motivo: `tiene ${pagosPosteriores} pago(s) registrado(s) despues del recargo` };
  }

  const montoBase = Number(mensualidad?.monto_sin_recargo_usd);
  const recargo = Number(mensualidad?.recargo_aplicado_usd);
  const montoEsperado = Number(mensualidad?.monto_esperado);
  const montoConRecargo = Number(mensualidad?.monto_con_recargo_usd);

  if (!Number.isFinite(montoBase) || montoBase < 0 || !Number.isFinite(recargo) || recargo <= 0) {
    return { elegible: false, motivo: 'snapshot de recargo incompleto' };
  }

  const totalSnapshot = redondearMonto(montoBase + recargo);
  if (
    redondearMonto(montoEsperado) !== totalSnapshot ||
    redondearMonto(montoConRecargo) !== totalSnapshot
  ) {
    return { elegible: false, motivo: 'el monto fue modificado despues de aplicar el recargo' };
  }

  return { elegible: true, montoBase: redondearMonto(montoBase), recargo: redondearMonto(recargo) };
}

function construirReversion(montoBase) {
  return {
    $set: {
      aplica_recargo: false,
      monto_esperado: montoBase,
      monto_con_recargo_usd: montoBase,
      recargo_aplicado_usd: 0
    },
    $unset: {
      fecha_aplicacion_recargo: 1
    }
  };
}

async function getTenantModels(tenant) {
  const connection = await getTenantBusinessConnection(tenant);
  return {
    Alumno: getTenantModel(connection, 'Alumno'),
    Mensualidad: getTenantModel(connection, 'Mensualidad'),
    PagoDetalle: getTenantModel(connection, 'PagoDetalle'),
    TenantConfig: getTenantModel(connection, 'TenantConfig')
  };
}

async function procesarTenant(tenant, args, rango) {
  const models = await getTenantModels(tenant);
  const config = await models.TenantConfig.findOne({ key: 'default' }).select('cobro').lean();
  const diaVencimiento = Number(config?.cobro?.dia_vencimiento ?? 5);
  const diasGraciaActual = Number(config?.cobro?.dias_gracia ?? 0);
  const resultado = {
    tenantId: tenant.tenantId,
    nombre: tenant.nombre || '',
    diaVencimiento,
    diasGraciaActual,
    encontradas: 0,
    reversibles: 0,
    conflictos: 0,
    recargoRevertible: 0,
    configActualizable: diaVencimiento === args.diaVencimiento &&
      args.setDiasGracia !== null && diasGraciaActual === 0,
    detallesConflictos: []
  };

  if (diaVencimiento !== args.diaVencimiento) {
    return resultado;
  }

  const mensualidades = await models.Mensualidad.find({
    mes: rango.mes,
    anio: rango.anio,
    recargo_aplicado_usd: { $gt: 0 },
    fecha_aplicacion_recargo: { $gte: rango.inicio, $lt: rango.fin }
  }).populate('id_alumno', 'dia_limite_personalizado');

  resultado.encontradas = mensualidades.length;
  const ids = mensualidades.map((mensualidad) => mensualidad._id);
  const pagos = ids.length > 0
    ? await models.PagoDetalle.find({
        id_mensualidad: { $in: ids },
        createdAt: { $gte: rango.inicio, $lt: rango.fin }
      }).select('id_mensualidad createdAt').lean()
    : [];
  const pagosPorMensualidad = new Map();
  pagos.forEach((pago) => {
    const mensualidadId = String(pago.id_mensualidad);
    const fechas = pagosPorMensualidad.get(mensualidadId) || [];
    fechas.push(new Date(pago.createdAt));
    pagosPorMensualidad.set(mensualidadId, fechas);
  });
  const operaciones = [];

  for (const mensualidad of mensualidades) {
    const fechaAplicacion = new Date(mensualidad.fecha_aplicacion_recargo);
    const pagosPosteriores = (pagosPorMensualidad.get(String(mensualidad._id)) || [])
      .filter((fechaPago) => fechaPago >= fechaAplicacion)
      .length;
    const evaluacion = evaluarCandidata(
      mensualidad,
      pagosPosteriores
    );

    if (!evaluacion.elegible) {
      resultado.conflictos += 1;
      resultado.detallesConflictos.push({
        id: String(mensualidad._id),
        estatus: mensualidad.estatus,
        motivo: evaluacion.motivo
      });
      continue;
    }

    resultado.reversibles += 1;
    resultado.recargoRevertible = redondearMonto(resultado.recargoRevertible + evaluacion.recargo);
    operaciones.push({
      updateOne: {
        filter: {
          _id: mensualidad._id,
          recargo_aplicado_usd: mensualidad.recargo_aplicado_usd,
          fecha_aplicacion_recargo: mensualidad.fecha_aplicacion_recargo
        },
        update: construirReversion(evaluacion.montoBase)
      }
    });
  }

  if (args.apply && operaciones.length > 0) {
    const escritura = await models.Mensualidad.bulkWrite(operaciones, { ordered: false });
    resultado.modificadas = escritura.modifiedCount;
  } else {
    resultado.modificadas = 0;
  }

  if (args.apply && resultado.configActualizable) {
    await models.TenantConfig.updateOne(
      { key: 'default', 'cobro.dia_vencimiento': args.diaVencimiento, 'cobro.dias_gracia': 0 },
      { $set: { 'cobro.dias_gracia': args.setDiasGracia } }
    );
    resultado.configActualizada = true;
  } else {
    resultado.configActualizada = false;
  }

  return resultado;
}

async function main() {
  const args = parseArgs(process.argv);
  validarArgs(args);
  const rango = obtenerRangoDiaCaracas(args.fecha);
  const tenants = await listActiveTenants();
  const tenantsSeleccionados = args.tenantId
    ? tenants.filter((tenant) => String(tenant.tenantId) === String(args.tenantId))
    : tenants;

  if (tenantsSeleccionados.length === 0) {
    throw new Error('No se encontraron tenants activos para la seleccion indicada.');
  }

  console.log(`${args.apply ? 'APPLY' : 'DRY-RUN'} recargos del ${args.fecha} (America/Caracas)`);
  console.log(`Periodo mensual: ${rango.mes}/${rango.anio}; vencimiento objetivo: dia ${args.diaVencimiento}`);
  if (args.setDiasGracia !== null) {
    console.log(`Configuracion solicitada: dias_gracia 0 -> ${args.setDiasGracia}`);
  }

  const totales = { encontradas: 0, reversibles: 0, conflictos: 0, recargoRevertible: 0, modificadas: 0 };
  let tenantsConError = 0;

  for (const tenant of tenantsSeleccionados) {
    try {
      const resultado = await procesarTenant(tenant, args, rango);
      Object.keys(totales).forEach((key) => {
        totales[key] = redondearMonto(totales[key] + Number(resultado[key] || 0));
      });
      console.log(
        `TENANT ${resultado.tenantId} (${resultado.nombre || 'sin nombre'}): ` +
        `vencimiento=${resultado.diaVencimiento} gracia=${resultado.diasGraciaActual} ` +
        `encontradas=${resultado.encontradas} reversibles=${resultado.reversibles} ` +
        `conflictos=${resultado.conflictos} recargo=${resultado.recargoRevertible}` +
        `${resultado.configActualizable ? ` config->gracia ${args.setDiasGracia}` : ''}`
      );

      if (args.verbose && resultado.detallesConflictos.length > 0) {
        resultado.detallesConflictos.forEach((detalle) => {
          console.log(`  CONFLICTO ${detalle.id} estatus=${detalle.estatus} motivo=${detalle.motivo}`);
        });
      }
    } catch (error) {
      tenantsConError += 1;
      console.error(`ERROR TENANT ${tenant.tenantId}: ${error.message || error}`);
    }
  }

  console.log('---');
  console.log(
    `TOTAL encontradas=${totales.encontradas} reversibles=${totales.reversibles} ` +
    `conflictos=${totales.conflictos} recargo=${totales.recargoRevertible} modificadas=${totales.modificadas}`
  );
  if (!args.apply) {
    console.log('Dry-run finalizado. Repite exactamente el comando agregando --apply despues de revisar el reporte.');
  }
  if (tenantsConError > 0) {
    throw new Error(`La ejecucion quedo parcial: ${tenantsConError} tenant(s) presentaron errores.`);
  }
}

if (require.main === module) {
  main()
    .then(() => mongoose.disconnect())
    .catch(async (error) => {
      console.error('Error:', error.message || error);
      await mongoose.disconnect().catch(() => {});
      process.exitCode = 1;
    });
}

module.exports = {
  parseArgs,
  validarArgs,
  obtenerRangoDiaCaracas,
  evaluarCandidata,
  construirReversion,
  getTenantModels
};