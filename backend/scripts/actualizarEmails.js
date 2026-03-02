const mongoose = require('mongoose');
const User = require('../models/User'); // Asegúrate de que la ruta sea correcta
const Representante = require('../models/Representante'); // Asegúrate de que la ruta sea correcta

const updateEmails = async () => {
  try {
    // Conectar a la base de datos
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/gestion_deportiva');
    console.log('Conectado a la base de datos');

    // Buscar usuarios con emails que no son cédulas (por ejemplo, contienen un '@')
    const usuariosAfectados = await User.find({ email: { $regex: /@/ } });

    for (const usuario of usuariosAfectados) {
      // Buscar el representante correspondiente
      console.log(`Procesando usuario ${usuario._id}`);
      const representante = await Representante.findOne({ usuario: usuario._id });
      console.log(representante);
      if (representante && representante.cedula) {
        // Actualizar el email con la cédula del representante
        usuario.email = representante.cedula;
        await usuario.save();
        console.log(`Usuario ${usuario._id} actualizado con email: ${representante.cedula}`);
      } else {
        console.log(`No se encontró representante para el usuario ${usuario._id}`);
      }
    }

    console.log('Corrección completada');
    mongoose.connection.close();
  } catch (error) {
    console.error('Error al actualizar los usuarios:', error);
    mongoose.connection.close();
  }
};

updateEmails();