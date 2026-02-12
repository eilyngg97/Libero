const mongoose = require('mongoose');

const EntrenadorSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  apellido: { type: String, required: true },
  correo: { type: String, required: true, unique: true },
  telefono: { type: String },
  estado: { type: String, enum: ['activo', 'inactivo'], default: 'activo' },
  foto: { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Entrenador', EntrenadorSchema);
