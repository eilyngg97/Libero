const mongoose = require('mongoose');

const UniformeSchema = new mongoose.Schema({
  prenda: { type: String, required: true },
  precio: { type: Number, required: true },
}, { timestamps: true });

module.exports = mongoose.model('Uniforme', UniformeSchema);