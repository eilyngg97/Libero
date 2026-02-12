// Script para migrar alumnos y dejar solo el ObjectId de sede (forzando si la estructura es { _id, nombre })
const mongoose = require('mongoose');
const Alumno = require('../models/Alumno');
require('dotenv').config();

async function migrarSede() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/gestion_deportiva');
  const alumnos = await Alumno.find();
  let actualizados = 0;
  for (const alumno of alumnos) {
    if (alumno.sede && typeof alumno.sede === 'object' && alumno.sede._id) {
      alumno.sede = alumno.sede._id;
      await Alumno.updateOne({ _id: alumno._id }, { $set: { sede: alumno.sede } });
      actualizados++;
    }
  }
  console.log(`Alumnos actualizados: ${actualizados}`);
  mongoose.disconnect();
}

migrarSede().catch(err => {
  console.error('Error en la migración:', err);
  mongoose.disconnect();
});
