const { getMongoUri } = require('../config/secrets');

function normalizeTenantId(value, fallback = '') {
  return String(value || fallback || '').trim().toLowerCase();
}

function isMultiTenantModeEnabled() {
  return process.env.MULTI_TENANT_MODE === 'true';
}

function getConfiguredDefaultTenantId() {
  return normalizeTenantId(process.env.DEFAULT_TENANT_ID, 'villasport');
}

function getConfiguredDefaultTenantName() {
  return String(process.env.DEFAULT_TENANT_NAME || 'Villasport').trim();
}

function getConfiguredDefaultTenantDbUri() {
  return String(process.env.DEFAULT_TENANT_DB_URI || getMongoUri()).trim();
}

function getConfiguredDefaultTenantConfig() {
  return {
    tenantId: getConfiguredDefaultTenantId(),
    nombre: getConfiguredDefaultTenantName(),
    dbUri: getConfiguredDefaultTenantDbUri(),
    domains: []
  };
}

function getFailSafeTenantId() {
  return normalizeTenantId(process.env.TENANT_B_ID || process.env.SAFE_FALLBACK_TENANT_ID, 'pruebas');
}

function getFailSafeTenantName() {
  return String(process.env.TENANT_B_NAME || process.env.SAFE_FALLBACK_TENANT_NAME || 'Pruebas').trim();
}

function getFailSafeTenantDbUri() {
  const dbUri = process.env.TENANT_B_DB_URI || process.env.SAFE_FALLBACK_TENANT_DB_URI || '';
  const normalized = String(dbUri || '').trim();
  return normalized || null;
}

function getFailSafeTenantConfig() {
  return {
    tenantId: getFailSafeTenantId(),
    nombre: getFailSafeTenantName(),
    dbUri: getFailSafeTenantDbUri(),
    domains: []
  };
}

function resolveRequestTenantId(req) {
  if (req?.tenantId) return normalizeTenantId(req.tenantId);
  return isMultiTenantModeEnabled() ? getFailSafeTenantId() : getConfiguredDefaultTenantId();
}

module.exports = {
  normalizeTenantId,
  isMultiTenantModeEnabled,
  getConfiguredDefaultTenantId,
  getConfiguredDefaultTenantName,
  getConfiguredDefaultTenantConfig,
  getFailSafeTenantId,
  getFailSafeTenantName,
  getFailSafeTenantConfig,
  resolveRequestTenantId
};