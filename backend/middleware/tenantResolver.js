const { resolveTenantByHost, normalizeHost } = require('../services/tenantResolverService');

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
  const tenantId = (process.env.DEFAULT_TENANT_ID || 'villasport').trim().toLowerCase();
  req.tenantId = tenantId;
  req.tenant = {
    tenantId,
    nombre: process.env.DEFAULT_TENANT_NAME || 'Villasport',
    modo: 'single-tenant-fallback'
  };
  res.setHeader('X-Tenant-Id', tenantId);
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
      if (process.env.ALLOW_DEFAULT_TENANT_FALLBACK === 'true') {
        return applySingleTenantFallback(req, res, next);
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
