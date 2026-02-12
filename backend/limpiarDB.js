// Script para limpiar las colecciones de alumnos y representantes
const mongoose = require('mongoose');

const uri = 'mongodb://localhost:27017/tu_basededatos'; // Cambia esto por tu URI real

async function limpiarColecciones() {
  await mongoose.connect(uri);
  await mongoose.connection.collection('alumnos').deleteMany({});
  await mongoose.connection.collection('representantes').deleteMany({});
  console.log('Colecciones de alumnos y representantes eliminadas.');
  await mongoose.disconnect();
}

limpiarColecciones();
