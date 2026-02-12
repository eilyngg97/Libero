const mongoose = require('mongoose');

const SedeSchema = new mongoose.Schema({
  nombre: { type: String, required: true, unique: true },
  direccion: { type: String, required: true },
  costo: { type: Number, required: true },
  estado: { type: String },
  horario_constancia: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Sede', SedeSchema);
