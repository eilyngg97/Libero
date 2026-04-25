const mongoose = require('mongoose');

const HistorialEstadoAlumnoSchema = new mongoose.Schema({
  id_alumno: { type: mongoose.Schema.Types.ObjectId, ref: 'Alumno', required: true },
  tipo_movimiento: {
    type: String,
    enum: ['BAJA', 'REINGRESO', 'REACTIVACION', 'SUSPENSION', 'CAMBIO_ESTADO'],
    required: true
  },
  fecha_evento: { type: Date, required: true, default: Date.now },
  motivo: { type: String },
  comentario: { type: String },
  actor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  metadata: { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

HistorialEstadoAlumnoSchema.index({ id_alumno: 1, fecha_evento: -1 });
HistorialEstadoAlumnoSchema.index({ tipo_movimiento: 1, fecha_evento: -1 });

module.exports = mongoose.model('HistorialEstadoAlumno', HistorialEstadoAlumnoSchema);