const mongoose = require('mongoose');

const AspiranteSchema = new mongoose.Schema({
  nombreCompleto: { type: String, required: true, trim: true, maxlength: 120 },
  fechaNacimiento: { type: Date, required: true },
  nivelExperiencia: { type: String, required: true, enum: ['Principiante', 'Intermedio', 'Avanzado'] },
  telefono: { type: String, required: true, trim: true, maxlength: 30 },
  estado: { type: String, enum: ['pendiente', 'contactado', 'inscrito', 'descartado'], default: 'pendiente' },
  observacion: { type: String, trim: true, maxlength: 500 }
}, { timestamps: true });

module.exports = mongoose.model('Aspirante', AspiranteSchema);
