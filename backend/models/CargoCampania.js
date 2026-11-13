const mongoose = require('mongoose');

const CargoCampaniaSchema = new mongoose.Schema({
  campania: { type: mongoose.Schema.Types.ObjectId, ref: 'CampaniaCobro', required: true },
  alumno: { type: mongoose.Schema.Types.ObjectId, ref: 'Alumno', required: true },
  sede: { type: mongoose.Schema.Types.ObjectId, ref: 'Sede', required: true },
  nombre_sede: { type: String, required: true },
  nombres: { type: String, required: true },
  apellidos: { type: String, default: '' },
  categoria: { type: String, default: '' },
  modalidad: { type: String, enum: ['general', 'personalizado', 'no_aplica'], required: true },
  moneda: { type: String, enum: ['USD', 'EUR'], required: true },
  monto: { type: Number, required: true, min: 0, max: 999999999.99 },
  saldo_pendiente: { type: Number, required: true, min: 0, max: 999999999.99 },
  estado: { type: String, enum: ['pendiente', 'no_aplica'], required: true },
  nota_interna: { type: String, default: '', maxlength: 1000, select: false },
  vencimiento: { type: String, default: '' },
  permitir_abonos: { type: Boolean, default: false }
}, { timestamps: true });

CargoCampaniaSchema.index({ campania: 1, alumno: 1 }, { unique: true });
module.exports = mongoose.model('CargoCampania', CargoCampaniaSchema);