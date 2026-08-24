const jwt = require('jsonwebtoken');
const { getJwtVerificationSecrets } = require('../config/secrets');
const { getDefaultPermissionsByLegacyRole } = require('../config/permissions');

exports.authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ msg: 'No token, autorización denegada' });

  try {
    const secrets = getJwtVerificationSecrets();
    let decoded = null;

    for (const secret of secrets) {
      try {
        decoded = jwt.verify(token, secret);
        break;
      } catch (err) {
        // Se intenta con el siguiente secreto para soportar rotacion.
      }
    }

    if (!decoded) {
      return res.status(401).json({ msg: 'Token inválido' });
    }

    if (req.tenantId && decoded.tenantId && String(req.tenantId) !== String(decoded.tenantId)) {
      return res.status(403).json({ msg: 'El token no pertenece al tenant solicitado' });
    }

    if (req.tenantId && !decoded.tenantId && process.env.REQUIRE_TENANT_IN_TOKEN === 'true') {
      return res.status(401).json({ msg: 'Token sin tenantId' });
    }

    if (!decoded.tenantId && req.tenantId) {
      decoded.tenantId = req.tenantId;
    }

    req.user = decoded;
    return next();
  } catch (err) {
    res.status(401).json({ msg: 'Token inválido' });
  }
};

exports.rolMiddleware = (...roles) => (req, res, next) => {
  const rolUsuario = String(req.user?.rol || '').trim().toLowerCase();
  const rolesNormalizados = roles
    .map((rol) => String(rol || '').trim().toLowerCase())
    .filter(Boolean);

  if (rolesNormalizados.includes('admin') && !rolesNormalizados.includes('super_admin')) {
    rolesNormalizados.push('super_admin');
  }

  if (!rolesNormalizados.includes(rolUsuario)) {
    return res.status(403).json({ msg: 'No tienes permiso para esta acción' });
  }
  next();
};

exports.superAdminMiddleware = (req, res, next) => {
  const rolUsuario = String(req.user?.rol || '').trim().toLowerCase();
  if (rolUsuario !== 'super_admin') {
    return res.status(403).json({ msg: 'Esta acción está permitida solo para super_admin' });
  }
  return next();
};

exports.permisoMiddleware = (...permisos) => (req, res, next) => {
  const requeridos = permisos
    .map((permiso) => String(permiso || '').trim().toLowerCase())
    .filter(Boolean);

  if (requeridos.length === 0) {
    return next();
  }

  const rolUsuario = String(req.user?.rol || '').trim().toLowerCase();
  const permisosToken = Array.isArray(req.user?.permisos) ? req.user.permisos : [];
  const permisosRol = getDefaultPermissionsByLegacyRole(rolUsuario);
  const permisosUsuario = [...permisosToken, ...permisosRol];

  const usuarioSet = new Set(
    permisosUsuario
      .map((permiso) => String(permiso || '').trim().toLowerCase())
      .filter(Boolean)
  );

  const autorizado = requeridos.every((permiso) => usuarioSet.has(permiso));
  if (!autorizado) {
    return res.status(403).json({ msg: 'No tienes permisos suficientes para esta acción' });
  }

  return next();
};
