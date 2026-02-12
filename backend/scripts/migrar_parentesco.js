// Script de migración para mover el campo 'parentesco' de Representante a Alumno
// Ejecutar este script con: node backend/scripts/migrar_parentesco.js

const mongoose = require('mongoose');
const Alumno = require('../models/Alumno');
const Representante = require('../models/Representante');
require('dotenv').config();

async function migrarParentesco() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/gestion_deportiva');

  const alumnos = await Alumno.find().populate('representante');
  let conParentesco = 0;
  let actualizados = 0;
  for (const alumno of alumnos) {
    if (alumno.representante && alumno.representante.parentesco && alumno.representante.parentesco.trim() !== '') {
      conParentesco++;
    }
  }
  console.log(`Alumnos con representante y parentesco ANTES de migrar: ${conParentesco}`);

  for (const alumno of alumnos) {
    if (alumno.representante && alumno.representante.parentesco && alumno.representante.parentesco.trim() !== '') {
      alumno.parentesco = alumno.representante.parentesco;
      await alumno.save();
      actualizados++;
    }
  }

  // Limpiar el campo parentesco de los representantes
  await Representante.updateMany({}, { $unset: { parentesco: "" } });

  console.log(`Alumnos actualizados: ${actualizados}`);
  mongoose.disconnect();
}

migrarParentesco().catch(err => {
  console.error('Error en la migración:', err);
  mongoose.disconnect();
});
