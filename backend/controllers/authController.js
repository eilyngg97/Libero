const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getJwtSigningSecret } = require('../config/secrets');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');
const { normalizePermissionList, getDefaultPermissionsByLegacyRole, getSafeRoleSlug } = require('../config/permissions');

function normalizeRoleList(rawRoles = [], legacyRole = '') {
  const roles = Array.isArray(rawRoles)
    ? rawRoles.map((item) => getSafeRoleSlug(String(item || '').trim().toLowerCase())).filter(Boolean)
    : [];

  const legacy = String(legacyRole || '').trim().toLowerCase();
  const hasOnlyUsuarioPlaceholder = roles.length === 1 && roles[0] === 'usuario';

  if (hasOnlyUsuarioPlaceholder && legacy && legacy !== 'usuario') {
    return [getSafeRoleSlug(legacy)];
  }

  if (legacy) {
    roles.push(getSafeRoleSlug(legacy));
  }

  const unique = Array.from(new Set(roles.filter(Boolean)));
  return unique.length > 0 ? unique : ['usuario'];
}

function toObjectIdStringList(values = []) {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );
}

async function resolveRoleCatalog({ TenantRole, roles, roleIds }) {
  if (!TenantRole || typeof TenantRole.find !== 'function') {
    return { roleDocs: [], roleBySlug: new Map() };
  }

  const filters = [];
  if (roles.length > 0) {
    filters.push({ slug: { $in: roles } });
  }
  if (roleIds.length > 0) {
    filters.push({ _id: { $in: roleIds } });
  }

  if (filters.length === 0) {
    return { roleDocs: [], roleBySlug: new Map() };
  }

  const roleDocs = await TenantRole.find({ $or: filters }).select('nombre slug permisos activo');
  const roleBySlug = new Map(
    roleDocs
      .map((role) => [String(role?.slug || '').trim().toLowerCase(), role])
      .filter(([slug]) => Boolean(slug))
  );

  return { roleDocs, roleBySlug };
}

async function getEffectiveLoginRoles({ TenantUser, TenantRole, Representative, user }) {
  const roles = normalizeRoleList(user.roles, user.rol);
  const roleIds = toObjectIdStringList([...(user.roleIds || []), user.roleId]);
  let hasRepresentativeLink = false;
  if (Representative && typeof Representative.findOne === 'function') {
    const representativeQuery = Representative.findOne({ usuario: user._id });
    const representativeResult = representativeQuery && typeof representativeQuery.select === 'function'
      ? await representativeQuery.select('_id')
      : await representativeQuery;
    hasRepresentativeLink = Boolean(representativeResult);
  }

  if (!hasRepresentativeLink && roles.includes('usuario') && roles.includes('entrenador')) {
    return {
      roles: ['entrenador'],
      roleIds: roleIds.filter(Boolean)
    };
  }

  return { roles, roleIds };
}

function buildAuthResponse({ user, roles, roleBySlug, activeRole, tenantId }) {
  const roleActivo = String(activeRole || '').trim().toLowerCase();
  const roleDocActivo = roleBySlug.get(roleActivo) || null;
  const permisos = roleDocActivo?.activo !== false
    ? normalizePermissionList(roleDocActivo?.permisos || getDefaultPermissionsByLegacyRole(roleActivo))
    : normalizePermissionList(getDefaultPermissionsByLegacyRole(roleActivo));
  const roleIdsFromUser = toObjectIdStringList([...(user.roleIds || []), user.roleId]);
  const roleIdsFromRoles = roles
    .map((slug) => roleBySlug.get(slug)?._id)
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  const roleIds = Array.from(new Set([...roleIdsFromUser, ...roleIdsFromRoles]));
  const roleIdActivo = String(roleDocActivo?._id || user.roleId || '').trim() || null;

  const payloadToken = {
    id: user._id,
    rol: roleActivo,
    rolActivo: roleActivo,
    roles,
    roleId: roleIdActivo,
    roleIds,
    roleNombre: roleDocActivo?.nombre || roleActivo,
    nombre: user.nombre,
    permisos,
    tenantId
  };

  const token = jwt.sign(payloadToken, getJwtSigningSecret(), { expiresIn: '8h' });

  return {
    token,
    user: {
      id: user._id,
      nombre: user.nombre,
      email: user.email,
      rol: roleActivo,
      rolActivo: roleActivo,
      roles,
      roleId: roleIdActivo,
      roleIds,
      roleNombre: roleDocActivo?.nombre || roleActivo,
      permisos,
      rolesDetalle: roles.map((slug) => {
        const role = roleBySlug.get(slug);
        return {
          slug,
          nombre: role?.nombre || slug,
          roleId: role?._id || null
        };
      })
    }
  };
}

exports.login = async (req, res) => {
  const email = String(req.body?.email || '').trim();
  const password = String(req.body?.password || '').trim();

  if (!email || !password) {
    return res.status(400).json({ msg: 'Credenciales incompletas' });
  }

  try {
    const tenantConfig = req.tenant || { tenantId: req.tenantId };
    const businessConnection = await getTenantBusinessConnection(tenantConfig);
    const TenantUser = getTenantModel(businessConnection, 'User');
    const TenantRole = getTenantModel(businessConnection, 'Role');
    const Representative = getTenantModel(businessConnection, 'Representante');

    const user = await TenantUser.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Usuario no encontrado' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Contraseña incorrecta' });
    const tenantId = resolveRequestTenantId(req);

    const { roles, roleIds } = await getEffectiveLoginRoles({ TenantUser, TenantRole, Representative, user });
    const { roleBySlug } = await resolveRoleCatalog({ TenantRole, roles, roleIds });

    const rolPorDefecto = roles[0] || 'usuario';
    const auth = buildAuthResponse({
      user,
      roles,
      roleBySlug,
      activeRole: rolPorDefecto,
      tenantId
    });

    const requiereSeleccionRol = roles.length > 1;

    return res.json({
      ...auth,
      tenantId,
      requiereSeleccionRol,
      rolesDisponibles: auth.user.rolesDetalle,
      msg: requiereSeleccionRol ? 'Selecciona el perfil con el que deseas ingresar' : undefined
    });
  } catch (err) {
    res.status(500).json({ msg: 'Error en el servidor' });
  }
};

exports.selectRolActivo = async (req, res) => {
  const rolSolicitado = String(req.body?.rolActivo || req.body?.rol || '').trim().toLowerCase();
  if (!rolSolicitado) {
    return res.status(400).json({ msg: 'Debes indicar el rol a activar' });
  }

  try {
    const tenantConfig = req.tenant || { tenantId: req.tenantId };
    const businessConnection = await getTenantBusinessConnection(tenantConfig);
    const TenantUser = getTenantModel(businessConnection, 'User');
    const TenantRole = getTenantModel(businessConnection, 'Role');
    const Representative = getTenantModel(businessConnection, 'Representante');

    const user = await TenantUser.findById(req.user?.id);
    if (!user) {
      return res.status(404).json({ msg: 'Usuario no encontrado' });
    }

    const { roles } = await getEffectiveLoginRoles({ TenantUser, TenantRole, Representative, user });
    if (!roles.includes(rolSolicitado)) {
      return res.status(403).json({ msg: 'El usuario no tiene asignado ese rol' });
    }

    const roleIds = toObjectIdStringList([...(user.roleIds || []), user.roleId]);
    const { roleBySlug } = await resolveRoleCatalog({ TenantRole, roles, roleIds });
    const tenantId = resolveRequestTenantId(req);
    const auth = buildAuthResponse({
      user,
      roles,
      roleBySlug,
      activeRole: rolSolicitado,
      tenantId
    });

    return res.json({
      ...auth,
      tenantId,
      requiereSeleccionRol: false,
      rolesDisponibles: auth.user.rolesDetalle
    });
  } catch (err) {
    return res.status(500).json({ msg: 'Error en el servidor' });
  }
};
