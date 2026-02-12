const User = require('../models/User');
const bcrypt = require('bcryptjs');

// Solo para admins: crear usuario
exports.crearUsuario = async (req, res) => {
  const { nombre, email, cedula, rol } = req.body;
  try {
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ msg: 'El usuario ya existe' });
    const password = await bcrypt.hash(cedula, 10); // La cédula será la contraseña inicial
    user = new User({ nombre, email, password, rol });
    await user.save();
    res.status(201).json({ msg: 'Usuario creado', user: { id: user._id, nombre: user.nombre, email: user.email, rol: user.rol } });
  } catch (err) {
    res.status(500).json({ msg: 'Error en el servidor' });
  }
};
