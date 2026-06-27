const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getJwtSigningSecret } = require('../config/secrets');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');
const { normalizePermissionList, getDefaultPermissionsByLegacyRole } = require('../config/permissions');

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

    const user = await TenantUser.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Usuario no encontrado' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Contraseña incorrecta' });

    let role = null;
    if (user.roleId) {
      role = await TenantRole.findById(user.roleId).select('nombre slug permisos activo');
    }

    const rolLegacy = String(user.rol || '').trim().toLowerCase();
    const rolEfectivo = String(role?.slug || rolLegacy || 'usuario').trim().toLowerCase();
    const permisosEfectivos = role?.activo !== false
      ? normalizePermissionList(role?.permisos || getDefaultPermissionsByLegacyRole(rolEfectivo))
      : normalizePermissionList(getDefaultPermissionsByLegacyRole(rolEfectivo));

    const jwtSecret = getJwtSigningSecret();
    const tenantId = resolveRequestTenantId(req);
    const token = jwt.sign(
      {
        id: user._id,
        rol: rolEfectivo,
        roleId: role?._id || user.roleId || null,
        roleNombre: role?.nombre || user.rol,
        nombre: user.nombre,
        permisos: permisosEfectivos,
        tenantId
      },
      jwtSecret,
      { expiresIn: '8h' }
    );
    res.json({
      token,
      user: {
        id: user._id,
        nombre: user.nombre,
        rol: rolEfectivo,
        roleId: role?._id || user.roleId || null,
        roleNombre: role?.nombre || user.rol,
        permisos: permisosEfectivos,
        email: user.email
      },
      tenantId
    });
  } catch (err) {
    res.status(500).json({ msg: 'Error en el servidor' });
  }
};
