const mongoose = require('mongoose');
const { getMongoUri } = require('./secrets');
const {
  getConfiguredDefaultTenantConfig,
  getFailSafeTenantConfig,
  isMultiTenantModeEnabled,
  normalizeTenantId
} = require('../services/tenantFallbackService');

const connectionCache = new Map();
const metrics = {
  cacheHits: 0,
  cacheMisses: 0,
  connectionsOpened: 0,
  connectionsClosed: 0,
  connectionErrors: 0,
  evictions: 0
};

function getCacheKey(tenantId, dbUri) {
  return `${String(tenantId || '').trim().toLowerCase()}::${String(dbUri || '').trim()}`;
}

function getBusinessDbUriFromTenant(tenant, fallbackTenant = null) {
  if (tenant?.dbUri) return String(tenant.dbUri).trim();
  if (fallbackTenant?.dbUri) return String(fallbackTenant.dbUri).trim();
  if (isMultiTenantModeEnabled()) return null;
  if (process.env.DEFAULT_TENANT_DB_URI) return String(process.env.DEFAULT_TENANT_DB_URI).trim();
  return getMongoUri();
}

function normalizePoolSize(raw, fallback) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

function evictIfNeeded(maxEntries) {
  if (connectionCache.size < maxEntries) return;
  const firstKey = connectionCache.keys().next().value;
  if (!firstKey) return;
  const firstEntry = connectionCache.get(firstKey);
  connectionCache.delete(firstKey);
  metrics.evictions += 1;
  if (firstEntry?.connection?.readyState === 1) {
    firstEntry.connection.close().catch(() => {});
  }
}

function attachConnectionMetrics(connection) {
  let openCounted = false;

  connection.on('connected', () => {
    if (!openCounted) {
      metrics.connectionsOpened += 1;
      openCounted = true;
    }
  });

  connection.on('close', () => {
    metrics.connectionsClosed += 1;
  });

  connection.on('error', () => {
    metrics.connectionErrors += 1;
  });
}

function getTenantConnectionMetrics() {
  const tenantIds = new Set();
  for (const entry of connectionCache.values()) {
    if (entry?.tenantId) {
      tenantIds.add(String(entry.tenantId));
    }
  }

  return {
    ...metrics,
    cacheSize: connectionCache.size,
    cachedTenants: tenantIds.size
  };
}

async function getTenantBusinessConnection(tenant = {}) {
  const fallbackTenant = isMultiTenantModeEnabled()
    ? getFailSafeTenantConfig()
    : getConfiguredDefaultTenantConfig();
  const tenantId = normalizeTenantId(tenant?.tenantId || fallbackTenant.tenantId);
  const dbUri = getBusinessDbUriFromTenant(tenant, fallbackTenant);

  // saneamiento defensivo y logs para depuración
  const candidateDbUri = typeof dbUri === 'string' ? String(dbUri).replace(/^<|>|\s+$/g, '').trim() : dbUri;
  console.log(`[TENANT-CONN] tenantId=${tenantId} fallbackTenant=${fallbackTenant && fallbackTenant.tenantId}; rawDbUri=${dbUri}; candidateDbUri=${candidateDbUri}`);

  if (!tenantId || !candidateDbUri) {
    console.error(`[TENANT-CONN] No se pudo resolver un tenant seguro para la conexion de negocio - tenantId=${tenantId} candidateDbUri=${candidateDbUri}`);
    throw new Error('No se pudo resolver un tenant seguro para la conexion de negocio');
  }

  const cacheKey = getCacheKey(tenantId, candidateDbUri);
  const maxEntries = normalizePoolSize(process.env.TENANT_CONNECTION_CACHE_SIZE, 20);

  const existing = connectionCache.get(cacheKey);
  if (existing?.connectionPromise) {
    metrics.cacheHits += 1;
    return existing.connectionPromise;
  }

  metrics.cacheMisses += 1;

  evictIfNeeded(maxEntries);

  const maxPoolSize = normalizePoolSize(process.env.TENANT_MONGO_MAX_POOL_SIZE, 10);
  const connection = mongoose.createConnection(candidateDbUri, {
    maxPoolSize,
    serverSelectionTimeoutMS: 5000
  });
  attachConnectionMetrics(connection);

  const connectionPromise = connection.asPromise().catch((err) => {
    connectionCache.delete(cacheKey);
    throw err;
  });

  connectionCache.set(cacheKey, {
    tenantId,
    dbUri: candidateDbUri,
    connection,
    connectionPromise,
    createdAt: Date.now()
  });

  return connectionPromise;
}

module.exports = {
  getTenantBusinessConnection,
  getBusinessDbUriFromTenant,
  getTenantConnectionMetrics
};
