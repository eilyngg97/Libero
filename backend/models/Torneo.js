const mongoose = require('mongoose');

const TorneoSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  descripcion: { type: String },
  fecha_limite: { type: Date },
  convocados: [
    {
      alumno: { type: mongoose.Schema.Types.ObjectId, ref: 'Alumno', required: true },
      categoria_snapshot: { type: String }, // String exacto de la categoría al momento de convocar
      estado: { type: String, enum: ['pendiente', 'aceptado', 'rechazado'], default: 'pendiente' },
      respondido_en: { type: Date }
    }
  ],
  partidos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Partido' }]
}, { timestamps: true });

module.exports = mongoose.model('Torneo', TorneoSchema);
