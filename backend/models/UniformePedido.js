const mongoose = require('mongoose');

const UniformePedidoSchema = new mongoose.Schema({
  alumno: { type: mongoose.Schema.Types.ObjectId, ref: 'Alumno', required: true },
  sede: { type: mongoose.Schema.Types.ObjectId, ref: 'Sede', required: false },
  prenda: { type: String, required: true },
  precio: { type: Number, default: 0 },
  talla: { type: String, required: true },
  estado: {
    type: String,
    enum: ['pendiente', 'esperando_pago', 'pago_en_revision', 'verificado', 'entregado', 'cancelado'],
    default: 'pendiente'
  },
  metodo_pago: { type: String },
  referencia: { type: String },
  comprobante_url: { type: String },
  fecha_pago: { type: Date },
  solicitado_por: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('UniformePedido', UniformePedidoSchema);
