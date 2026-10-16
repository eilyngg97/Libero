const mongoose = require('mongoose');

const PagoAgrupadoSchema = new mongoose.Schema({
  codigo: { type: String, required: true, unique: true },
  representante: { type: mongoose.Schema.Types.ObjectId, ref: 'Representante' },
  monto_total: { type: Number, required: true },
  monto_total_bs: { type: Number, required: true },
  tasa_aplicada: { type: Number, required: true },
  fecha_pago: { type: Date, required: true },
  metodo_pago: { type: String, required: true },
  referencia: { type: String },
  telefono_pago: { type: String, default: '' },
  cedula_titular: { type: String, default: '' },
  comprobante_url: { type: String },
  nota: { type: String, default: '' },
  estado: {
    type: String,
    enum: ['En revision', 'Conciliado', 'Rechazado', 'Anulado'],
    default: 'En revision'
  },
  cantidad_atletas: { type: Number, required: true, min: 2 },
  registrado_por: {
    id_usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    nombre: { type: String, default: '' },
    rol: { type: String, default: '' },
    origen: { type: String, default: '' }
  },
  conciliado_por: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  conciliado_en: { type: Date },
  rechazado_por: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rechazado_en: { type: Date },
  motivo_rechazo: { type: String, default: '' },
  ediciones: [{
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    fecha: { type: Date, required: true },
    antes: { type: mongoose.Schema.Types.Mixed },
    despues: { type: mongoose.Schema.Types.Mixed }
  }]
}, { timestamps: true });

PagoAgrupadoSchema.index({ estado: 1, fecha_pago: -1 });

module.exports = mongoose.model('PagoAgrupado', PagoAgrupadoSchema);