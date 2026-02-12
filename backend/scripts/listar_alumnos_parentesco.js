// Script para listar alumnos y su representante con parentesco
// Ejecutar con: node backend/scripts/listar_alumnos_parentesco.js

const mongoose = require('mongoose');
const Alumno = require('../models/Alumno');
const Representante = require('../models/Representante');
require('dotenv').config();

async function listarAlumnosConParentesco() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/gestion_deportiva');

  const alumnos = await Alumno.find().populate('representante');
  let encontrados = 0;
  for (const alumno of alumnos) {
    if (alumno.representante) {
      console.log(`Alumno: ${alumno.nombres} ${alumno.apellidos} | Representante: ${alumno.representante.nombres} ${alumno.representante.apellidos} | Parentesco en representante: ${alumno.representante.parentesco || '-'} | Parentesco en alumno: ${alumno.parentesco || '-'}`);
      encontrados++;
    } else {
      console.log(`Alumno: ${alumno.nombres} ${alumno.apellidos} | Sin representante asociado.`);
    }
  }
  console.log(`Total alumnos listados: ${encontrados}`);
  mongoose.disconnect();
}

listarAlumnosConParentesco().catch(err => {
  console.error('Error al listar:', err);
  mongoose.disconnect();
});
