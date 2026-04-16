const { getTenantCoreConnection } = require('../config/tenantCoreConnection');
const { getTenantCoreModel } = require('../models/TenantCore');

function normalizeHost(hostValue) {
  if (!hostValue) return '';
  const host = String(hostValue).split(',')[0].trim().toLowerCase();
  return host.replace(/^https?:\/\//, '').split(':')[0].trim();
}

async function resolveTenantByHost(hostValue) {
  const host = normalizeHost(hostValue);
  if (!host) return null;

  const connection = await getTenantCoreConnection();
  const TenantCore = getTenantCoreModel(connection);

  let tenant = await TenantCore.findOne({
    estado: 'active',
    domains: host
  }).lean();

  if (tenant) return tenant;

  if (process.env.ENABLE_SUBDOMAIN_TENANT_LOOKUP === 'true') {
    const maybeTenantId = host.split('.')[0];
    if (maybeTenantId) {
      tenant = await TenantCore.findOne({
        estado: 'active',
        tenantId: maybeTenantId
      }).lean();
    }
  }

  return tenant || null;
}

async function listActiveTenants() {
  const connection = await getTenantCoreConnection();
  const TenantCore = getTenantCoreModel(connection);

  return TenantCore.find({ estado: 'active' })
    .sort({ tenantId: 1 })
    .lean();
}

module.exports = {
  normalizeHost,
  resolveTenantByHost,
  listActiveTenants
};
