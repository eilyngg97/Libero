const mongoose = require('mongoose');

const OperacionSchema = new mongoose.Schema(
  {
    tipo: {
      type: String,
      enum: ['conciliacion_bancaria', 'nueva_inscripcion', 'generacion_constancia'],
      required: true,
      index: true
    },
    nombre: { type: String, required: true, trim: true },
    detalle: { type: String, default: '', trim: true },
    actor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actor_nombre: { type: String, default: '', trim: true },
    entidad_tipo: { type: String, default: '', trim: true },
    entidad_id: { type: mongoose.Schema.Types.ObjectId, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

OperacionSchema.index({ createdAt: -1 });
OperacionSchema.index({ tipo: 1, createdAt: -1 });

module.exports = mongoose.model('Operacion', OperacionSchema);