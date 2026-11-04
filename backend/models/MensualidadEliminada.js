const mongoose = require('mongoose');

const MensualidadEliminadaSchema = new mongoose.Schema({
  id_alumno: { type: mongoose.Schema.Types.ObjectId, ref: 'Alumno', required: true, immutable: true },
  mes: { type: Number, required: true, min: 1, max: 12, immutable: true },
  anio: { type: Number, required: true, immutable: true },
  motivo: { type: String, required: true, trim: true, maxlength: 1000, immutable: true },
  actor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  actor_nombre: { type: String, default: '', immutable: true },
  actor_rol: { type: String, default: '', immutable: true },
  alumno_nombre: { type: String, default: '', immutable: true },
  sede: { type: mongoose.Schema.Types.ObjectId, ref: 'Sede', immutable: true },
  mensualidad_original: { type: mongoose.Schema.Types.Mixed, required: true, immutable: true }
}, { timestamps: true });

MensualidadEliminadaSchema.index({ id_alumno: 1, mes: 1, anio: 1 }, { unique: true });

module.exports = mongoose.model('MensualidadEliminada', MensualidadEliminadaSchema);