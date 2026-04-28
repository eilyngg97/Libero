const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getJwtSigningSecret } = require('../config/secrets');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');

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

    const user = await TenantUser.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Usuario no encontrado' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Contraseña incorrecta' });
    const jwtSecret = getJwtSigningSecret();
    const tenantId = resolveRequestTenantId(req);
    const token = jwt.sign(
      { id: user._id, rol: user.rol, nombre: user.nombre, tenantId },
      jwtSecret,
      { expiresIn: '8h' }
    );
    res.json({
      token,
      user: { id: user._id, nombre: user.nombre, rol: user.rol, email: user.email },
      tenantId
    });
  } catch (err) {
    res.status(500).json({ msg: 'Error en el servidor' });
  }
};
