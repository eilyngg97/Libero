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

function parseOptions() {
  const sample = Number(getArgValue('--sample') || 20);
  if (!Number.isInteger(sample) || sample < 0) {
    throw new Error('Parametro --sample invalido. Debe ser un entero >= 0.');
  }

  return {
    tenantId: String(getArgValue('--tenant-id') || '').trim().toLowerCase(),
    allTenants: hasFlag('--all-tenants'),
    apply: hasFlag('--apply'),
    sample
  };
}

async function resolveTenants(options) {
  const connection = await getTenantCoreConnection();
  const TenantCore = getTenantCoreModel(connection);

  try {
    if (options.tenantId) {
      const tenant = await TenantCore.findOne({ tenantId: options.tenantId }).lean();
      if (!tenant) {
        throw new Error(`No existe tenant core para ${options.tenantId}`);
      }
      return [tenant];
    }

    if (options.allTenants) {
      const tenants = await TenantCore.find({ estado: 'active' }).sort({ tenantId: 1 }).lean();
      if (tenants.length === 0) {
        throw new Error('No hay tenants activos en core.');
      }
      return tenants;
    }

    throw new Error('Debes indicar --tenant-id <id> o --all-tenants');
  } finally {
    await connection.close();
  }
}

function buildOrphanPipeline(alumnoCollectionName) {
  return [
    {
      $lookup: {
        from: alumnoCollectionName,
        localField: 'id_alumno',
        foreignField: '_id',
        as: 'alumno_match'
      }
    },
    {
      $match: {
        alumno_match: { $size: 0 }
      }
    }
  ];
}

async function deleteOrphansInBatches(Mensualidad, orphanPipeline, chunkSize = 500) {
  const cursor = Mensualidad.aggregate([
    ...orphanPipeline,
    { $project: { _id: 1 } }
  ]).cursor({ batchSize: chunkSize });

  let deleted = 0;
  let buffer = [];

  for await (const row of cursor) {
    buffer.push(row._id);
    if (buffer.length >= chunkSize) {
      const result = await Mensualidad.deleteMany({ _id: { $in: buffer } });
      deleted += Number(result.deletedCount || 0);
      buffer = [];
    }
  }

  if (buffer.length > 0) {
    const result = await Mensualidad.deleteMany({ _id: { $in: buffer } });
    deleted += Number(result.deletedCount || 0);
  }

  return deleted;
}

async function processTenant(tenant, options) {
  const connection = await getTenantBusinessConnection(tenant);
  const Mensualidad = getTenantModel(connection, 'Mensualidad');
  const Alumno = getTenantModel(connection, 'Alumno');
  const alumnoCollectionName = Alumno.collection.collectionName;
  const orphanPipeline = buildOrphanPipeline(alumnoCollectionName);

  const summary = {
    tenantId: tenant.tenantId,
    totalMensualidades: 0,
    huerfanas: 0,
    eliminadas: 0,
    muestra: []
  };

  try {
    summary.totalMensualidades = await Mensualidad.countDocuments({});

    const countResult = await Mensualidad.aggregate([
      ...orphanPipeline,
      { $count: 'total' }
    ]);
    summary.huerfanas = Number(countResult[0]?.total || 0);

    if (options.sample > 0 && summary.huerfanas > 0) {
      summary.muestra = await Mensualidad.aggregate([
        ...orphanPipeline,
        {
          $project: {
            _id: 1,
            id_alumno: 1,
            mes: 1,
            anio: 1,
            estatus: 1,
            monto_esperado: 1,
            createdAt: 1
          }
        },
        { $sort: { anio: -1, mes: -1, createdAt: -1 } },
        { $limit: options.sample }
      ]);
    }

    if (options.apply && summary.huerfanas > 0) {
      summary.eliminadas = await deleteOrphansInBatches(Mensualidad, orphanPipeline);
    }

    return summary;
  } finally {
    await connection.close();
  }
}

async function main() {
  const options = parseOptions();
  const tenants = await resolveTenants(options);
  const results = [];

  for (const tenant of tenants) {
    const summary = await processTenant(tenant, options);
    results.push(summary);

    console.log('Resultado tenant:', {
      tenantId: summary.tenantId,
      totalMensualidades: summary.totalMensualidades,
      huerfanas: summary.huerfanas,
      eliminadas: summary.eliminadas,
      modo: options.apply ? 'apply' : 'dry-run'
    });

    if (summary.muestra.length > 0) {
      console.log(`Muestra huerfanas (${summary.muestra.length}) tenant ${summary.tenantId}:`);
      for (const item of summary.muestra) {
        console.log(`- mensualidad=${item._id} alumno=${item.id_alumno} periodo=${item.mes}/${item.anio} estatus=${item.estatus} monto=${item.monto_esperado}`);
      }
    }
  }

  const totals = results.reduce((acc, item) => ({
    tenants: acc.tenants + 1,
    totalMensualidades: acc.totalMensualidades + item.totalMensualidades,
    huerfanas: acc.huerfanas + item.huerfanas,
    eliminadas: acc.eliminadas + item.eliminadas
  }), {
    tenants: 0,
    totalMensualidades: 0,
    huerfanas: 0,
    eliminadas: 0
  });

  console.log('Resumen global mensualidades huerfanas:', {
    modo: options.apply ? 'apply' : 'dry-run',
    ...totals
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error detectando mensualidades huerfanas:', err.message);
    process.exit(1);
  });
