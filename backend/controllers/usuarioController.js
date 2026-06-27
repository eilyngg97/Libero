const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const {
  getSafeRoleSlug,
  normalizePermissionList,
  getDefaultPermissionsByLegacyRole
} = require('../config/permissions');

async function getTenantUserModel(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);
  return getTenantModel(connection, 'User');
}

async function getTenantModels(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);
  return {
    TenantUser: getTenantModel(connection, 'User'),
    TenantRole: getTenantModel(connection, 'Role')
  };
}

function toUserPayload(user, role) {
  const rolLegacy = String(user?.rol || '').trim().toLowerCase();
  const roleSlug = String(role?.slug || rolLegacy || 'usuario').trim().toLowerCase();
  const permisos = role?.activo !== false
    ? normalizePermissionList(role?.permisos || getDefaultPermissionsByLegacyRole(roleSlug))
    : normalizePermissionList(getDefaultPermissionsByLegacyRole(roleSlug));

  return {
    id: user?._id,
    nombre: user?.nombre,
    email: user?.email,
    rol: roleSlug,
    roleId: role?._id || user?.roleId || null,
    roleNombre: role?.nombre || user?.rol || roleSlug,
    permisos,
    createdAt: user?.createdAt,
    updatedAt: user?.updatedAt
  };
}

exports.listarUsuarios = async (req, res) => {
  try {
    const { TenantUser, TenantRole } = await getTenantModels(req);
    const users = await TenantUser.find({}).select('nombre email rol roleId createdAt updatedAt').sort({ createdAt: -1 });

    const roleIds = users
      .map((item) => String(item.roleId || '').trim())
      .filter(Boolean);
    const roles = roleIds.length > 0
      ? await TenantRole.find({ _id: { $in: roleIds } }).select('nombre slug permisos activo')
      : [];
    const roleMap = new Map(roles.map((role) => [String(role._id), role]));

    const payload = users.map((user) => toUserPayload(user, roleMap.get(String(user.roleId || ''))));
    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ msg: 'Error en el servidor' });
  }
};

// Solo para admins: crear usuario
exports.crearUsuario = async (req, res) => {
  const { nombre, email, cedula, rol, roleId } = req.body;
  try {
    const { TenantUser, TenantRole } = await getTenantModels(req);
    const nombreLimpio = String(nombre || '').trim();
    const emailLimpio = String(email || '').trim().toLowerCase();
    const cedulaLimpia = String(cedula || '').trim();

    if (!nombreLimpio || !emailLimpio || !cedulaLimpia) {
      return res.status(400).json({ msg: 'Nombre, email y cédula son obligatorios' });
    }

    let user = await TenantUser.findOne({ email: emailLimpio });
    if (user) return res.status(400).json({ msg: 'El usuario ya existe' });

    let role = null;
    if (roleId) {
      role = await TenantRole.findById(roleId).select('nombre slug permisos activo');
      if (!role) {
        return res.status(400).json({ msg: 'El rol seleccionado no existe' });
      }
    }

    const rolLegacy = role ? String(role.slug || '').trim().toLowerCase() : getSafeRoleSlug(rol || 'usuario');
    const password = await bcrypt.hash(cedulaLimpia, 10);

    user = new TenantUser({
      nombre: nombreLimpio,
      email: emailLimpio,
      password,
      rol: rolLegacy,
      roleId: role?._id || null
    });
    await user.save();

    return res.status(201).json({ msg: 'Usuario creado', user: toUserPayload(user, role) });
  } catch (err) {
    return res.status(500).json({ msg: 'Error en el servidor' });
  }
};

exports.actualizarRolUsuario = async (req, res) => {
  const { id } = req.params;
  const { roleId, rol } = req.body;

  try {
    const { TenantUser, TenantRole } = await getTenantModels(req);
    const user = await TenantUser.findById(id);
    if (!user) {
      return res.status(404).json({ msg: 'Usuario no encontrado' });
    }

    let role = null;
    if (roleId) {
      role = await TenantRole.findById(roleId).select('nombre slug permisos activo');
      if (!role) {
        return res.status(400).json({ msg: 'El rol seleccionado no existe' });
      }
    }

    user.roleId = role?._id || null;
    user.rol = role ? String(role.slug || '').trim().toLowerCase() : getSafeRoleSlug(rol || user.rol || 'usuario');
    await user.save();

    return res.json({ msg: 'Rol actualizado', user: toUserPayload(user, role) });
  } catch (err) {
    return res.status(500).json({ msg: 'Error en el servidor' });
  }
};
