require('dotenv').config();
const { getTenantCoreConnection } = require('../config/tenantCoreConnection');
const { getTenantCoreModel } = require('../models/TenantCore');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');

const args = process.argv.slice(2);

function getArgValue(flag) {
  const index = args.indexOf(flag);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) return null;
  return String(value).trim();
}

function hasFlag(flag) {
  return args.includes(flag);
}

function buildFechaInicioCobro(anio, mes) {
  if (!Number.isInteger(anio) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    return null;
  }
  return new Date(Date.UTC(anio, mes - 1, 1, 12, 0, 0));
}

async function resolveTenants() {
  const tenantId = String(getArgValue('--tenant-id') || '').trim().toLowerCase();
  const includeAllTenants = hasFlag('--all-tenants');

  const connection = await getTenantCoreConnection();
  const TenantCore = getTenantCoreModel(connection);

  try {
    if (tenantId) {
      const tenant = await TenantCore.findOne({ tenantId }).lean();
      if (!tenant) throw new Error(`No existe tenant core para ${tenantId}`);
      return [tenant];
    }

    if (!includeAllTenants) {
      throw new Error('Debes indicar --tenant-id <id> o --all-tenants');
    }

    return await TenantCore.find({ estado: 'active' }).sort({ tenantId: 1 }).lean();
  } finally {
    await connection.close();
  }
}

async function migrarTenant(tenant, { apply = false } = {}) {
  const connection = await getTenantBusinessConnection(tenant);
  const Alumno = getTenantModel(connection, 'Alumno');
  const Mensualidad = getTenantModel(connection, 'Mensualidad');

  const resumen = {
    tenantId: tenant.tenantId,
    alumnosRevisados: 0,
    actualizados: 0,
    sinMensualidades: 0,
    yaConfigurados: 0,
    errores: []
  };

  try {
    const alumnos = await Alumno.find({}).select('_id nombres apellidos fecha_inicio_cobro').lean();
    resumen.alumnosRevisados = alumnos.length;

    for (const alumno of alumnos) {
      if (alumno?.fecha_inicio_cobro) {
        resumen.yaConfigurados += 1;
        continue;
      }

      const primeraMensualidad = await Mensualidad.findOne({ id_alumno: alumno._id })
        .select('mes anio')
        .sort({ anio: 1, mes: 1, createdAt: 1 })
        .lean();

      if (!primeraMensualidad) {
        resumen.sinMensualidades += 1;
        resumen.errores.push({
          alumnoId: String(alumno._id),
          alumno: `${alumno.nombres || ''} ${alumno.apellidos || ''}`.trim(),
          motivo: 'Sin mensualidades para inferir fecha_inicio_cobro'
        });
        continue;
      }

      const fechaInicioCobro = buildFechaInicioCobro(Number(primeraMensualidad.anio), Number(primeraMensualidad.mes));
      if (!fechaInicioCobro) {
        resumen.errores.push({
          alumnoId: String(alumno._id),
          alumno: `${alumno.nombres || ''} ${alumno.apellidos || ''}`.trim(),
          motivo: 'Mensualidad mas antigua sin periodo valido'
        });
        continue;
      }

      if (apply) {
        await Alumno.updateOne(
          { _id: alumno._id },
          { $set: { fecha_inicio_cobro: fechaInicioCobro } }
        );
      }

      resumen.actualizados += 1;
    }

    return resumen;
  } finally {
    await connection.close();
  }
}

async function main() {
  const apply = hasFlag('--apply');
  const tenants = await resolveTenants();
  const resultados = [];

  for (const tenant of tenants) {
    const resumen = await migrarTenant(tenant, { apply });
    resultados.push(resumen);
    console.log('Migracion fecha_inicio_cobro tenant:', resumen);
  }

  const total = resultados.reduce((acc, item) => ({
    tenants: acc.tenants + 1,
    alumnosRevisados: acc.alumnosRevisados + item.alumnosRevisados,
    actualizados: acc.actualizados + item.actualizados,
    sinMensualidades: acc.sinMensualidades + item.sinMensualidades,
    yaConfigurados: acc.yaConfigurados + item.yaConfigurados
  }), {
    tenants: 0,
    alumnosRevisados: 0,
    actualizados: 0,
    sinMensualidades: 0,
    yaConfigurados: 0
  });

  console.log('Resumen total migracion fecha_inicio_cobro:', {
    modo: apply ? 'apply' : 'dry-run',
    ...total
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error migrando fecha_inicio_cobro:', err.message);
    process.exit(1);
  });
