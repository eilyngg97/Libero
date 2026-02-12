const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
require('dotenv').config();

async function crearAdmin() {
  await mongoose.connect(process.env.MONGO_URI);
  const existe = await User.findOne({ email: 'admin@dux.com' });
  if (existe) {
    console.log('El usuario admin ya existe');
    process.exit();
  }
  const password = await bcrypt.hash('12345678', 10); // Contraseña inicial
  const admin = new User({ nombre: 'Administrador', email: 'admin@dux.com', password, rol: 'admin' });
  await admin.save();
  console.log('Usuario admin creado:', admin);
  process.exit();
}

crearAdmin();
