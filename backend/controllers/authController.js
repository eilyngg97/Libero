const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getJwtSigningSecret } = require('../config/secrets');

exports.login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: 'Usuario no encontrado' });
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: 'Contraseña incorrecta' });
    const jwtSecret = getJwtSigningSecret();
    const token = jwt.sign(
      { id: user._id, rol: user.rol, nombre: user.nombre },
      jwtSecret,
      { expiresIn: '8h' }
    );
    res.json({ token, user: { id: user._id, nombre: user.nombre, rol: user.rol, email: user.email } });
  } catch (err) {
    res.status(500).json({ msg: 'Error en el servidor' });
  }
};
