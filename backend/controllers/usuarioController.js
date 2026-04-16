const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');

async function getTenantUserModel(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);
  return getTenantModel(connection, 'User');
}

// Solo para admins: crear usuario
exports.crearUsuario = async (req, res) => {
  const { nombre, email, cedula, rol } = req.body;
  try {
    const TenantUser = await getTenantUserModel(req);
    let user = await TenantUser.findOne({ email });
    if (user) return res.status(400).json({ msg: 'El usuario ya existe' });
    const password = await bcrypt.hash(cedula, 10); // La cédula será la contraseña inicial
    user = new TenantUser({ nombre, email, password, rol });
    await user.save();
    res.status(201).json({ msg: 'Usuario creado', user: { id: user._id, nombre: user.nombre, email: user.email, rol: user.rol } });
  } catch (err) {
    res.status(500).json({ msg: 'Error en el servidor' });
  }
};
