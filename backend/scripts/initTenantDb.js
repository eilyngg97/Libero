require('dotenv').config();
const bcrypt = require('bcryptjs');
const { getTenantCoreConnection } = require('../config/tenantCoreConnection');
const { getTenantCoreModel } = require('../models/TenantCore');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const User = require('../models/User');
const Sede = require('../models/Sede');
const Representante = require('../models/Representante');
const Alumno = require('../models/Alumno');
const Reposo = require('../models/Reposo');
const Mensualidad = require('../models/Mensualidad');
const PagoDetalle = require('../models/PagoDetalle');
const Aspirante = require('../models/Aspirante');
const Uniforme = require('../models/Uniforme');
const UniformePedido = require('../models/UniformePedido');
const LandingAtletaFoto = require('../models/LandingAtletaFoto');
const Torneo = require('../models/Torneo');
const Partido = require('../models/Partido');
const Entrenador = require('../models/Entrenador');

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

const tenantModelDefinitions = [
  { modelName: 'User', schema: User.schema },
  { modelName: 'Sede', schema: Sede.schema },
  { modelName: 'Representante', schema: Representante.schema },
  { modelName: 'Alumno', schema: Alumno.schema },
  { modelName: 'Reposo', schema: Reposo.schema },
  { modelName: 'Mensualidad', schema: Mensualidad.schema },
  { modelName: 'PagoDetalle', schema: PagoDetalle.schema },
  { modelName: 'Aspirante', schema: Aspirante.schema },
  { modelName: 'Uniforme', schema: Uniforme.schema },
  { modelName: 'UniformePedido', schema: UniformePedido.schema },
  { modelName: 'LandingAtletaFoto', schema: LandingAtletaFoto.schema },
  { modelName: 'Torneo', schema: Torneo.schema },
  { modelName: 'Partido', schema: Partido.schema },
  { modelName: 'Entrenador', schema: Entrenador.schema }
];

async function resolveTenantConfig() {
  const tenantId = String(getArgValue('--tenant-id') || process.env.TENANT_B_ID || process.env.DEFAULT_TENANT_ID || 'villasport')
    .trim()
    .toLowerCase();
  const explicitDbUri = getArgValue('--db-uri');

  if (explicitDbUri) {
    return {
      tenantId,
      nombre: getArgValue('--tenant-name') || tenantId,
      dbUri: explicitDbUri
    };
  }

  const connection = await getTenantCoreConnection();
  const TenantCore = getTenantCoreModel(connection);

  try {
    const tenant = await TenantCore.findOne({ tenantId }).lean();
    if (!tenant) {
      throw new Error(`No existe configuracion tenant core para ${tenantId}`);
    }
    return tenant;
  } finally {
    await connection.close();
  }
}

async function ensureCollections(connection) {
  const created = [];

  for (const definition of tenantModelDefinitions) {
    const Model = connection.models[definition.modelName] || connection.model(definition.modelName, definition.schema);
    await Model.createCollection().catch((err) => {
      if (!String(err?.message || '').includes('already exists')) {
        throw err;
      }
    });
    await Model.syncIndexes();
    created.push({ modelName: definition.modelName, collectionName: Model.collection.collectionName });
  }

  return created;
}

async function ensureAdminUser(connection, tenantId) {
  const adminEmail = getArgValue('--admin-email') || `admin@${tenantId}.local`;
  const adminPassword = getArgValue('--admin-password') || '12345678';
  const adminName = getArgValue('--admin-name') || `Admin ${tenantId}`;
  const UserModel = connection.models.User || connection.model('User', User.schema);

  let user = await UserModel.findOne({ email: adminEmail });
  if (user) {
    return {
      created: false,
      email: adminEmail,
      password: adminPassword,
      rol: user.rol
    };
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  user = await UserModel.create({
    nombre: adminName,
    email: adminEmail,
    password: passwordHash,
    rol: 'admin'
  });

  return {
    created: true,
    email: user.email,
    password: adminPassword,
    rol: user.rol
  };
}

async function initTenantDb() {
  const tenant = await resolveTenantConfig();
  const connection = await getTenantBusinessConnection(tenant);

  try {
    const collections = await ensureCollections(connection);
    const shouldCreateAdmin = hasFlag('--with-admin') || !hasFlag('--without-admin');
    const adminUser = shouldCreateAdmin ? await ensureAdminUser(connection, tenant.tenantId) : null;

    console.log('Tenant DB inicializada:', {
      tenantId: tenant.tenantId,
      dbUri: tenant.dbUri,
      collections: collections.map((item) => item.collectionName),
      adminUser
    });
  } finally {
    await connection.close();
  }
}

initTenantDb()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error inicializando DB tenant:', err.message);
    process.exit(1);
  });