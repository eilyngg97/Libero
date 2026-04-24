const { resolveTenantByHost, normalizeHost } = require('../services/tenantResolverService');
const {
  getConfiguredDefaultTenantConfig,
  getFailSafeTenantConfig
} = require('../services/tenantFallbackService');

function getRequestHost(req) {
  return (
    req.headers['x-tenant-host'] ||
    req.headers['x-forwarded-host'] ||
    req.headers.host ||
    req.hostname ||
    ''
  );
}

function applySingleTenantFallback(req, res, next) {
  const tenant = getConfiguredDefaultTenantConfig();
  req.tenantId = tenant.tenantId;
  req.tenant = {
    tenantId: tenant.tenantId,
    nombre: tenant.nombre,
    dbUri: tenant.dbUri,
    modo: 'single-tenant-fallback'
  };
  res.setHeader('X-Tenant-Id', tenant.tenantId);
  return next();
}

function getConfiguredDefaultTenantDomains() {
  return String(process.env.DEFAULT_TENANT_DOMAINS || '')
    .split(',')
    .map((item) => normalizeHost(item))
    .filter(Boolean);
}

function applyConfiguredDefaultTenant(req, res, next, mode = 'default-tenant-domain') {
  const tenant = getConfiguredDefaultTenantConfig();
  req.tenantId = tenant.tenantId;
  req.tenant = {
    tenantId: tenant.tenantId,
    nombre: tenant.nombre,
    dbUri: tenant.dbUri,
    modo: mode,
    domains: getConfiguredDefaultTenantDomains()
  };
  res.setHeader('X-Tenant-Id', tenant.tenantId);
  return next();
}

function applyFailSafeTenantFallback(req, res, next, mode = 'fail-safe-tenant-fallback') {
  const tenant = getFailSafeTenantConfig();
  req.tenantId = tenant.tenantId;
  req.tenant = {
    tenantId: tenant.tenantId,
    nombre: tenant.nombre,
    dbUri: tenant.dbUri,
    modo: mode,
    domains: []
  };
  res.setHeader('X-Tenant-Id', tenant.tenantId);
  return next();
}

async function tenantResolver(req, res, next) {
  if (process.env.MULTI_TENANT_MODE !== 'true') {
    return applySingleTenantFallback(req, res, next);
  }

  try {
    const host = normalizeHost(getRequestHost(req));
    if (!host) {
      return res.status(400).json({ error: 'No se pudo resolver el host del tenant' });
    }

    const tenant = await resolveTenantByHost(host);
    if (!tenant) {
      const defaultTenantDomains = getConfiguredDefaultTenantDomains();
      if (defaultTenantDomains.includes(host)) {
        return applyConfiguredDefaultTenant(req, res, next);
      }

      if (process.env.ALLOW_DEFAULT_TENANT_FALLBACK === 'true') {
        return applyFailSafeTenantFallback(req, res, next);
      }
      return res.status(404).json({ error: 'Tenant no encontrado para el host solicitado' });
    }

    req.tenantId = tenant.tenantId;
    req.tenant = tenant;
    res.setHeader('X-Tenant-Id', tenant.tenantId);
    return next();
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error resolviendo tenant:`, err.message);
    return res.status(503).json({ error: 'No se pudo resolver el tenant temporalmente' });
  }
}

module.exports = {
  tenantResolver
};
