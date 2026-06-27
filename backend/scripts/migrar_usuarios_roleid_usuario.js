require('dotenv').config();

const { getTenantCoreConnection } = require('../config/tenantCoreConnection');
const { getTenantCoreModel } = require('../models/TenantCore');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const {
  normalizePermissionList,
  getDefaultPermissionsByLegacyRole
} = require('../config/permissions');

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

async function resolveTenants() {
  const tenantId = String(getArgValue('--tenant-id') || '').trim().toLowerCase();
  const includeAllTenants = hasFlag('--all-tenants');

  const connection = await getTenantCoreConnection();
  const TenantCore = getTenantCoreModel(connection);

  try {
    if (tenantId) {
      const tenant = await TenantCore.findOne({ tenantId }).lean();
      if (!tenant) throw new Error(`No existe tenant core para ${tenantId}`);
      return [tenant];
    }

    if (!includeAllTenants) {
      throw new Error('Debes indicar --tenant-id <id> o --all-tenants');
    }

    return await TenantCore.find({ estado: 'active' }).sort({ tenantId: 1 }).lean();
  } finally {
    await connection.close();
  }
}

async function ensureRoleUsuario(RoleModel, { apply = false } = {}) {
  const existente = await RoleModel.findOne({ slug: 'usuario' }).select('_id slug nombre permisos activo');
  if (existente) {
    return {
      roleId: existente._id,
      roleCreado: false,
      roleNombre: existente.nombre || 'Usuario'
    };
  }

  if (!apply) {
    return {
      roleId: null,
      roleCreado: false,
      roleNombre: 'Usuario'
    };
  }

  const role = await RoleModel.create({
    nombre: 'Usuario',
    slug: 'usuario',
    descripcion: 'Rol base del sistema',
    permisos: normalizePermissionList(getDefaultPermissionsByLegacyRole('usuario')),
    activo: true
  });

  return {
    roleId: role._id,
    roleCreado: true,
    roleNombre: role.nombre
  };
}

async function migrarTenant(tenant, { apply = false } = {}) {
  const connection = await getTenantBusinessConnection(tenant);
  const User = getTenantModel(connection, 'User');
  const Role = getTenantModel(connection, 'Role');

  const resumen = {
    tenantId: tenant.tenantId,
    usuariosUsuarioSinRoleId: 0,
    actualizados: 0,
    roleUsuarioCreado: false,
    roleUsuarioId: null,
    roleUsuarioFaltante: false,
    ejemplos: []
  };

  try {
    const { roleId, roleCreado } = await ensureRoleUsuario(Role, { apply });
    resumen.roleUsuarioCreado = roleCreado;
    resumen.roleUsuarioId = roleId ? String(roleId) : null;

    const filtroUsuariosUsuarioSinRoleId = {
      rol: /^usuario$/i,
      $or: [
        { roleId: { $exists: false } },
        { roleId: null }
      ]
    };

    const [count, ejemplos] = await Promise.all([
      User.countDocuments(filtroUsuariosUsuarioSinRoleId),
      User.find(filtroUsuariosUsuarioSinRoleId)
        .select('_id nombre email rol roleId')
        .sort({ createdAt: 1 })
        .limit(20)
        .lean()
    ]);

    resumen.usuariosUsuarioSinRoleId = count;
    resumen.ejemplos = ejemplos.map((item) => ({
      id: String(item._id),
      nombre: item.nombre || '',
      email: item.email || '',
      rol: item.rol || '',
      roleId: item.roleId ? String(item.roleId) : null
    }));

    if (!count) {
      return resumen;
    }

    if (!roleId) {
      resumen.roleUsuarioFaltante = true;
      return resumen;
    }

    if (apply) {
      const resultado = await User.updateMany(
        filtroUsuariosUsuarioSinRoleId,
        {
          $set: {
            rol: 'usuario',
            roleId
          }
        }
      );
      resumen.actualizados = Number(resultado.modifiedCount || 0);
    }

    return resumen;
  } finally {
    await connection.close();
  }
}

async function main() {
  const apply = hasFlag('--apply');
  const tenants = await resolveTenants();
  const resultados = [];

  for (const tenant of tenants) {
    const resumen = await migrarTenant(tenant, { apply });
    resultados.push(resumen);
    console.log('Migracion roleId usuario por tenant:', resumen);
  }

  const total = resultados.reduce((acc, item) => ({
    tenants: acc.tenants + 1,
    usuariosUsuarioSinRoleId: acc.usuariosUsuarioSinRoleId + item.usuariosUsuarioSinRoleId,
    actualizados: acc.actualizados + item.actualizados,
    roleUsuarioCreado: acc.roleUsuarioCreado + (item.roleUsuarioCreado ? 1 : 0),
    tenantsConRoleUsuarioFaltante: acc.tenantsConRoleUsuarioFaltante + (item.roleUsuarioFaltante ? 1 : 0)
  }), {
    tenants: 0,
    usuariosUsuarioSinRoleId: 0,
    actualizados: 0,
    roleUsuarioCreado: 0,
    tenantsConRoleUsuarioFaltante: 0
  });

  console.log('Resumen total migracion roleId usuario:', {
    modo: apply ? 'apply' : 'dry-run',
    ...total
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error migrando roleId de usuarios tipo usuario:', err.message);
    process.exit(1);
  });
