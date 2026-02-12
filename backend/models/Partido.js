const mongoose = require('mongoose');

const PartidoSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  descripcion: { type: String },
  direccion: { type: String, required: true },
  fecha: { type: Date, required: true },
  hora: { type: String, required: true },
  monto: { type: Number, required: true },
  monto_inscripcion: { type: Number, required: true },
  monto_acompanante: { type: Number, required: true },
  entrenador: { type: String, required: true },
  equipo_contrario: { type: String, required: true },
  jugadores: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Alumno' }],
  torneo: { type: mongoose.Schema.Types.ObjectId, ref: 'Torneo' }
}, { timestamps: true });

module.exports = mongoose.model('Partido', PartidoSchema);
