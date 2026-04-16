const tenantMetrics = new Map();

function normalizeThreshold(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function getAlertThresholds() {
  return {
    request5xxRateWarnPct: normalizeThreshold(process.env.HEALTH_ALERT_5XX_WARN_PCT, 2),
    request5xxRateCriticalPct: normalizeThreshold(process.env.HEALTH_ALERT_5XX_CRITICAL_PCT, 5),
    slowRateWarnPct: normalizeThreshold(process.env.HEALTH_ALERT_SLOW_WARN_PCT, 10),
    slowRateCriticalPct: normalizeThreshold(process.env.HEALTH_ALERT_SLOW_CRITICAL_PCT, 20),
    avgLatencyWarnMs: normalizeThreshold(process.env.HEALTH_ALERT_AVG_LAT_WARN_MS, 1200),
    avgLatencyCriticalMs: normalizeThreshold(process.env.HEALTH_ALERT_AVG_LAT_CRITICAL_MS, 2500),
    jobFailureWarnPct: normalizeThreshold(process.env.HEALTH_ALERT_JOB_FAIL_WARN_PCT, 5),
    jobFailureCriticalPct: normalizeThreshold(process.env.HEALTH_ALERT_JOB_FAIL_CRITICAL_PCT, 15)
  };
}

function toPct(numerator, denominator) {
  if (!denominator || denominator <= 0) return 0;
  return Number(((Number(numerator || 0) * 100) / denominator).toFixed(2));
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function createAlert(severity, code, message, value, threshold) {
  return {
    severity,
    code,
    message,
    value,
    threshold
  };
}

function buildTenantKpis(tenant) {
  const reqTotal = Number(tenant?.requests?.total || 0);
  const req4xx = Number(tenant?.requests?.status4xx || 0);
  const req5xx = Number(tenant?.requests?.status5xx || 0);
  const reqSlow = Number(tenant?.requests?.slow || 0);
  const reqAvgLatencyMs = Number(tenant?.requests?.avgLatencyMs || 0);
  const jobTotal = Number(tenant?.jobs?.total || 0);
  const jobFailed = Number(tenant?.jobs?.failed || 0);

  return {
    request4xxRatePct: toPct(req4xx, reqTotal),
    request5xxRatePct: toPct(req5xx, reqTotal),
    requestSlowRatePct: toPct(reqSlow, reqTotal),
    requestAvgLatencyMs: Number(reqAvgLatencyMs.toFixed(2)),
    jobFailureRatePct: toPct(jobFailed, jobTotal)
  };
}

function buildTenantAlerts(tenant, thresholds) {
  const kpis = buildTenantKpis(tenant);
  const alerts = [];

  if (kpis.request5xxRatePct >= thresholds.request5xxRateCriticalPct) {
    alerts.push(createAlert(
      'critical',
      'request_5xx_rate',
      'Tasa de errores 5xx critica',
      kpis.request5xxRatePct,
      thresholds.request5xxRateCriticalPct
    ));
  } else if (kpis.request5xxRatePct >= thresholds.request5xxRateWarnPct) {
    alerts.push(createAlert(
      'warning',
      'request_5xx_rate',
      'Tasa de errores 5xx elevada',
      kpis.request5xxRatePct,
      thresholds.request5xxRateWarnPct
    ));
  }

  if (kpis.requestSlowRatePct >= thresholds.slowRateCriticalPct) {
    alerts.push(createAlert(
      'critical',
      'request_slow_rate',
      'Porcentaje de requests lentas critico',
      kpis.requestSlowRatePct,
      thresholds.slowRateCriticalPct
    ));
  } else if (kpis.requestSlowRatePct >= thresholds.slowRateWarnPct) {
    alerts.push(createAlert(
      'warning',
      'request_slow_rate',
      'Porcentaje de requests lentas elevado',
      kpis.requestSlowRatePct,
      thresholds.slowRateWarnPct
    ));
  }

  if (kpis.requestAvgLatencyMs >= thresholds.avgLatencyCriticalMs) {
    alerts.push(createAlert(
      'critical',
      'request_avg_latency',
      'Latencia promedio critica',
      kpis.requestAvgLatencyMs,
      thresholds.avgLatencyCriticalMs
    ));
  } else if (kpis.requestAvgLatencyMs >= thresholds.avgLatencyWarnMs) {
    alerts.push(createAlert(
      'warning',
      'request_avg_latency',
      'Latencia promedio elevada',
      kpis.requestAvgLatencyMs,
      thresholds.avgLatencyWarnMs
    ));
  }

  if (kpis.jobFailureRatePct >= thresholds.jobFailureCriticalPct) {
    alerts.push(createAlert(
      'critical',
      'job_failure_rate',
      'Tasa de fallos de jobs critica',
      kpis.jobFailureRatePct,
      thresholds.jobFailureCriticalPct
    ));
  } else if (kpis.jobFailureRatePct >= thresholds.jobFailureWarnPct) {
    alerts.push(createAlert(
      'warning',
      'job_failure_rate',
      'Tasa de fallos de jobs elevada',
      kpis.jobFailureRatePct,
      thresholds.jobFailureWarnPct
    ));
  }

  return { kpis, alerts };
}

function computeTenantHealthScore(kpis) {
  // Score en [0, 100], penalizando errores, latencia y fallos de jobs.
  const requestPenalty =
    clamp01(kpis.request5xxRatePct / 20) * 45 +
    clamp01(kpis.requestSlowRatePct / 40) * 20 +
    clamp01(kpis.requestAvgLatencyMs / 3000) * 15;

  const jobsPenalty = clamp01(kpis.jobFailureRatePct / 30) * 20;
  const totalPenalty = Math.min(100, requestPenalty + jobsPenalty);

  return Number((100 - totalPenalty).toFixed(2));
}

function normalizeTenantId(value) {
  return String(value || 'unknown').trim().toLowerCase() || 'unknown';
}

function getOrCreateTenantMetrics(tenantIdInput) {
  const tenantId = normalizeTenantId(tenantIdInput);
  if (!tenantMetrics.has(tenantId)) {
    tenantMetrics.set(tenantId, {
      tenantId,
      requests: {
        total: 0,
        status4xx: 0,
        status5xx: 0,
        slow: 0,
        totalLatencyMs: 0,
        avgLatencyMs: 0,
        lastAt: null
      },
      jobs: {
        total: 0,
        failed: 0,
        totalDurationMs: 0,
        avgDurationMs: 0,
        byName: {},
        lastAt: null
      }
    });
  }
  return tenantMetrics.get(tenantId);
}

function recordRequestMetric({ tenantId, durationMs, statusCode, slowThresholdMs = 1500 }) {
  const metrics = getOrCreateTenantMetrics(tenantId);
  const duration = Number(durationMs) || 0;
  const status = Number(statusCode) || 0;

  metrics.requests.total += 1;
  metrics.requests.totalLatencyMs += duration;
  metrics.requests.avgLatencyMs = Number(
    (metrics.requests.totalLatencyMs / Math.max(metrics.requests.total, 1)).toFixed(2)
  );
  metrics.requests.lastAt = new Date().toISOString();

  if (status >= 400 && status < 500) {
    metrics.requests.status4xx += 1;
  }

  if (status >= 500) {
    metrics.requests.status5xx += 1;
  }

  if (duration > Number(slowThresholdMs || 1500)) {
    metrics.requests.slow += 1;
  }
}

function recordJobMetric({ tenantId, jobName, durationMs, success = true }) {
  const metrics = getOrCreateTenantMetrics(tenantId);
  const duration = Number(durationMs) || 0;
  const safeJobName = String(jobName || 'unknown-job').trim();

  metrics.jobs.total += 1;
  metrics.jobs.totalDurationMs += duration;
  metrics.jobs.avgDurationMs = Number(
    (metrics.jobs.totalDurationMs / Math.max(metrics.jobs.total, 1)).toFixed(2)
  );
  metrics.jobs.lastAt = new Date().toISOString();

  if (!success) {
    metrics.jobs.failed += 1;
  }

  if (!metrics.jobs.byName[safeJobName]) {
    metrics.jobs.byName[safeJobName] = {
      total: 0,
      failed: 0,
      avgDurationMs: 0,
      totalDurationMs: 0,
      lastAt: null
    };
  }

  const job = metrics.jobs.byName[safeJobName];
  job.total += 1;
  job.totalDurationMs += duration;
  job.avgDurationMs = Number((job.totalDurationMs / Math.max(job.total, 1)).toFixed(2));
  job.lastAt = new Date().toISOString();

  if (!success) {
    job.failed += 1;
  }
}

function getTenantHealthDashboard() {
  const thresholds = getAlertThresholds();
  const tenants = Array.from(tenantMetrics.values())
    .sort((a, b) => a.tenantId.localeCompare(b.tenantId))
    .map((tenant) => {
      const { kpis, alerts } = buildTenantAlerts(tenant, thresholds);
      const healthScore = computeTenantHealthScore(kpis);

      return {
        ...tenant,
        kpis,
        alerts,
        healthScore
      };
    });

  const tenantsWithAlerts = tenants.filter((tenant) => tenant.alerts.length > 0);
  const criticalAlerts = tenantsWithAlerts.reduce(
    (acc, tenant) => acc + tenant.alerts.filter((alert) => alert.severity === 'critical').length,
    0
  );
  const warningAlerts = tenantsWithAlerts.reduce(
    (acc, tenant) => acc + tenant.alerts.filter((alert) => alert.severity === 'warning').length,
    0
  );

  const topRiskTenants = [...tenants]
    .sort((a, b) => a.healthScore - b.healthScore)
    .slice(0, 5)
    .map((tenant) => ({
      tenantId: tenant.tenantId,
      healthScore: tenant.healthScore,
      alertCount: tenant.alerts.length
    }));

  return {
    generatedAt: new Date().toISOString(),
    thresholds,
    tenants,
    summary: {
      totalTenants: tenants.length,
      totalRequests: tenants.reduce((acc, t) => acc + (t.requests.total || 0), 0),
      totalRequest5xx: tenants.reduce((acc, t) => acc + (t.requests.status5xx || 0), 0),
      totalJobs: tenants.reduce((acc, t) => acc + (t.jobs.total || 0), 0),
      totalFailedJobs: tenants.reduce((acc, t) => acc + (t.jobs.failed || 0), 0),
      tenantsWithAlerts: tenantsWithAlerts.length,
      warningAlerts,
      criticalAlerts,
      avgHealthScore: Number(
        (tenants.reduce((acc, t) => acc + (t.healthScore || 0), 0) / Math.max(tenants.length, 1)).toFixed(2)
      ),
      topRiskTenants
    },
    alerts: {
      totalTenantsWithAlerts: tenantsWithAlerts.length,
      warning: warningAlerts,
      critical: criticalAlerts
    }
  };
}

module.exports = {
  recordRequestMetric,
  recordJobMetric,
  getTenantHealthDashboard
};
