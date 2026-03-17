const mongoose = require('mongoose');

const ReposoSchema = new mongoose.Schema({
  id_alumno: { type: mongoose.Schema.Types.ObjectId, ref: 'Alumno', required: true, index: true },
  fecha_inicio: { type: Date, required: true },
  fecha_fin: { type: Date },
  tipo: { type: String, enum: ['Parcial', 'Total', 'Indefinido'], required: true },
  motivo: { type: String },
  certificado: { type: String }, // URL pública del certificado
  estado: { type: String, default: 'Activo' }
}, { timestamps: true });

ReposoSchema.index({ id_alumno: 1, fecha_inicio: -1 });

module.exports = mongoose.model('Reposo', ReposoSchema);
