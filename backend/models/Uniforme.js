const mongoose = require('mongoose');

const UniformeSchema = new mongoose.Schema({
  prenda: { type: String, required: true },
  precio: { type: Number, required: true },
  lleva_personalizacion_nombre: { type: Boolean, default: false },
  lleva_numero_franela: { type: Boolean, default: false },
  franela_representante: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Uniforme', UniformeSchema);