const mongoose = require('mongoose');

const SedeSchema = new mongoose.Schema({
  nombre: { type: String, required: true, unique: true },
  direccion: { type: String, required: true },
  costo: { type: Number, required: true },
  monto_inscripcion: { type: Number, default: 0 },
  recargo_usd: { type: Number, default: 0, min: 0 },
  usar_recargo_global: { type: Boolean, default: true },
  estado: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Sede', SedeSchema);
