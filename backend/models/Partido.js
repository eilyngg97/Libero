const mongoose = require('mongoose');

const PartidoSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  descripcion: { type: String },
  direccion: { type: String },
  fecha: { type: Date },
  hora: { type: String },
  monto: { type: Number },
  monto_inscripcion: { type: Number },
  monto_acompanante: { type: Number },
  entrenador: { type: String },
  equipo_contrario: { type: String },
  torneo: { type: mongoose.Schema.Types.ObjectId, ref: 'Torneo' },
  convocados: [
    {
      alumno: { type: mongoose.Schema.Types.ObjectId, ref: 'Alumno', required: true },
      categoria_snapshot: { type: String }, // Guardar la categoría del alumno al ser convocado
      estado: { type: String, enum: ['pendiente', 'aceptado', 'rechazado'], default: 'pendiente' },
      respondido_en: { type: Date }
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model('Partido', PartidoSchema);
