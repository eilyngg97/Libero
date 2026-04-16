require('dotenv').config();
const { getTenantCoreConnection } = require('../config/tenantCoreConnection');
const { getMongoUri } = require('../config/secrets');
const { getTenantCoreModel } = require('../models/TenantCore');

const args = process.argv.slice(2);

function getArgValue(flag) {
  const index = args.indexOf(flag);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) return null;
  return String(value).trim();
}

function normalizeDomains(rawDomains) {
  return String(rawDomains || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .map((host) => host.replace(/^https?:\/\//, '').split(':')[0]);
}

async function seedTenantCore() {
  const tenantId = String(getArgValue('--tenant-id') || process.env.DEFAULT_TENANT_ID || 'villasport').trim().toLowerCase();
  const tenantName = String(getArgValue('--tenant-name') || process.env.DEFAULT_TENANT_NAME || 'Villasport').trim();
  const domains = normalizeDomains(getArgValue('--domains') || process.env.DEFAULT_TENANT_DOMAINS || 'localhost');
  const dbUri = getArgValue('--db-uri') || process.env.DEFAULT_TENANT_DB_URI || getMongoUri();
  const estado = String(getArgValue('--estado') || 'active').trim().toLowerCase();

  if (!['active', 'suspended'].includes(estado)) {
    throw new Error('El estado debe ser active o suspended');
  }

  if (!domains.length) {
    throw new Error('DEFAULT_TENANT_DOMAINS no puede estar vacío');
  }

  const connection = await getTenantCoreConnection();
  const TenantCore = getTenantCoreModel(connection);

  const tenant = await TenantCore.findOneAndUpdate(
    { tenantId },
    {
      $set: {
        tenantId,
        nombre: tenantName,
        estado,
        domains,
        dbUri
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  console.log('Tenant core registrado:', {
    tenantId: tenant.tenantId,
    nombre: tenant.nombre,
    estado: tenant.estado,
    domains: tenant.domains
  });

  await connection.close();
}

seedTenantCore()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error seed tenant core:', err.message);
    process.exit(1);
  });
