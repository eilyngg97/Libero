const jwt = require('jsonwebtoken');
const { getJwtVerificationSecrets } = require('../config/secrets');

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

    req.user = decoded;
    return next();
  } catch (err) {
    res.status(401).json({ msg: 'Token inválido' });
  }
};

exports.rolMiddleware = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.rol)) {
    return res.status(403).json({ msg: 'No tienes permiso para esta acción' });
  }
  next();
};
