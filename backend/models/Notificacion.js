const mongoose = require('mongoose');

const NotificacionSchema = new mongoose.Schema({
  periodo: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
  representante: { type: mongoose.Schema.Types.ObjectId, ref: 'Representante', required: true },
  representante_nombre: { type: String, required: true },
  telefono: { type: String, required: true },
  tipo: { type: String, enum: ['antes', 'despues'], required: true },
  fecha_programada: { type: Date, required: true },
  estado: { type: String, enum: ['aceptado', 'entregado', 'fallido'], required: true },
  meta_message_id: { type: String },
  error: { type: String },
  mensualidades: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Mensualidad' }]
}, { timestamps: true });

NotificacionSchema.index({ periodo: 1, createdAt: -1 });
module.exports = mongoose.model('Notificacion', NotificacionSchema);
