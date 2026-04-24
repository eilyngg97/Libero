require('dotenv').config();
const mongoose = require('mongoose');
const cron = require('node-cron');
const { getTenantBusinessConnection } = require('./config/tenantBusinessConnection');
const { getTenantModel } = require('./services/tenantModelService');
const { listActiveTenants } = require('./services/tenantResolverService');
const {
  generarMensualidadesMesCore,
  actualizarRetrasadosCore
} = require('./controllers/mensualidadController');
const { generarReporteConciliacionCore } = require('./controllers/conciliacionController');
const { app, logWithTime } = require('./app');
const { getMongoUri } = require('./config/secrets');
const { recordJobMetric } = require('./services/tenantHealthMetrics');
const {
  getConfiguredDefaultTenantConfig,
  getFailSafeTenantConfig,
  isMultiTenantModeEnabled
} = require('./services/tenantFallbackService');

function areScheduledJobsEnabled() {
  return process.env.ENABLE_SCHEDULED_JOBS !== 'false';
}

function getDefaultTenantConfig() {
  const tenant = isMultiTenantModeEnabled()
    ? getFailSafeTenantConfig()
    : getConfiguredDefaultTenantConfig();

  return {
    tenantId: tenant.tenantId,
    nombre: tenant.nombre,
    dbUri: tenant.dbUri || getMongoUri(),
    domains: []
  };
}

async function listTenantsForJobs() {
  const tenants = await listActiveTenants();

  if (tenants.length > 0) {
    return tenants;
  }

  if (process.env.ALLOW_DEFAULT_TENANT_FALLBACK === 'true') {
    return [getDefaultTenantConfig()];
  }

  return [];
}

function getTenantJobsConcurrency() {
  const configured = Number(process.env.TENANT_JOBS_CONCURRENCY || 1);
  if (!Number.isFinite(configured) || configured <= 0) return 1;
  return Math.max(1, Math.floor(configured));
}

async function getTenantJobModels(tenant) {
  const connection = await getTenantBusinessConnection(tenant);

  return {
    connection,
    Alumno: getTenantModel(connection, 'Alumno'),
    Mensualidad: getTenantModel(connection, 'Mensualidad'),
    PagoDetalle: getTenantModel(connection, 'PagoDetalle'),
    Sede: getTenantModel(connection, 'Sede'),
    Reposo: getTenantModel(connection, 'Reposo'),
    Representante: getTenantModel(connection, 'Representante')
  };
}

async function runJobForTenants(jobName, worker) {
  const tenants = await listTenantsForJobs();

  if (tenants.length === 0) {
    logWithTime(`${jobName}: no hay tenants activos para procesar`);
    return 0;
  }

  const concurrency = Math.min(getTenantJobsConcurrency(), tenants.length);
  let total = 0;
  let cursor = 0;

  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const currentIndex = cursor;
      cursor += 1;
      if (currentIndex >= tenants.length) return;

      const tenant = tenants[currentIndex];
      const startedAt = Date.now();
      try {
        const models = await getTenantJobModels(tenant);
        const result = await worker({ tenant, models });
        const numericResult = Number(result) || 0;
        const durationMs = Date.now() - startedAt;

        total += numericResult;
        recordJobMetric({ tenantId: tenant.tenantId, jobName, durationMs, success: true });
        logWithTime(`[tenant:${tenant.tenantId}] ${jobName}: ${numericResult}`);
      } catch (err) {
        const durationMs = Date.now() - startedAt;
        recordJobMetric({ tenantId: tenant.tenantId, jobName, durationMs, success: false });
        console.error(`[${new Date().toISOString()}] [tenant:${tenant.tenantId}] Error en ${jobName}:`, err);
      }
    }
  });

  await Promise.all(workers);

  return total;
}

async function bootstrap() {
  try {
    const mongoUri = getMongoUri();
    await mongoose.connect(mongoUri);
    logWithTime('Conectado a MongoDB');

    if (areScheduledJobsEnabled()) {
      try {
        const creadas = isMultiTenantModeEnabled()
          ? await runJobForTenants('Catch-up mensualidades generadas', ({ models }) =>
              generarMensualidadesMesCore({ models })
            )
          : await generarMensualidadesMesCore();
        logWithTime(`Catch-up mensualidades generadas: ${creadas}`);
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Error en catch-up de mensualidades:`, err);
      }

      try {
        const hoy = new Date();
        if (hoy.getDate() >= 6) {
          const actualizadas = isMultiTenantModeEnabled()
            ? await runJobForTenants('Catch-up retrasados actualizados', ({ models }) =>
                actualizarRetrasadosCore({ force: true, models })
              )
            : await actualizarRetrasadosCore({ force: true });
          logWithTime(`Catch-up retrasados actualizados: ${actualizadas}`);
        }
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Error en catch-up de retrasados:`, err);
      }

      try {
        const reportes = isMultiTenantModeEnabled()
          ? await runJobForTenants('Catch-up conciliacion/reportes', async ({ models }) => {
              const reporte = await generarReporteConciliacionCore({ models });
              return Number(reporte.mensualidadesEnRevision) || 0;
            })
          : Number((await generarReporteConciliacionCore()).mensualidadesEnRevision) || 0;
        logWithTime(`Catch-up conciliacion/reportes procesado: ${reportes}`);
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Error en catch-up de conciliacion/reportes:`, err);
      }

      cron.schedule('5 0 1 * *', async () => {
        try {
          const creadas = isMultiTenantModeEnabled()
            ? await runJobForTenants('Mensualidades generadas automáticamente', ({ models }) =>
                generarMensualidadesMesCore({ models })
              )
            : await generarMensualidadesMesCore();
          logWithTime(`Mensualidades generadas automáticamente: ${creadas}`);
        } catch (err) {
          console.error(`[${new Date().toISOString()}] Error al generar mensualidades automáticamente:`, err);
        }
      });

      cron.schedule('10 0 6 * *', async () => {
        try {
          const actualizadas = isMultiTenantModeEnabled()
            ? await runJobForTenants('Mensualidades actualizadas a Insolvente', ({ models }) =>
                actualizarRetrasadosCore({ models })
              )
            : await actualizarRetrasadosCore();
          logWithTime(`Mensualidades actualizadas a Retrasado: ${actualizadas}`);
        } catch (err) {
          console.error(`[${new Date().toISOString()}] Error al actualizar mensualidades a Retrasado:`, err);
        }
      });

      cron.schedule('20 0 * * *', async () => {
        try {
          const totalEnRevision = isMultiTenantModeEnabled()
            ? await runJobForTenants('Conciliacion/reportes diarios', async ({ models }) => {
                const reporte = await generarReporteConciliacionCore({ models });
                return Number(reporte.mensualidadesEnRevision) || 0;
              })
            : Number((await generarReporteConciliacionCore()).mensualidadesEnRevision) || 0;
          logWithTime(`Conciliacion/reportes diarios procesado (mensualidades en revision): ${totalEnRevision}`);
        } catch (err) {
          console.error(`[${new Date().toISOString()}] Error al ejecutar conciliacion/reportes diarios:`, err);
        }
      });
    } else {
      logWithTime('ENABLE_SCHEDULED_JOBS=false: catch-up y jobs cron deshabilitados para esta instancia');
    }

    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => {
      logWithTime(`Servidor backend escuchando en puerto ${PORT}`);
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error de conexión a MongoDB:`, err);
  }
}

if (require.main === module) {
  bootstrap();
}

module.exports = { app, bootstrap };
