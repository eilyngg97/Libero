const mongoose = require('mongoose');

const UniformePedidoSchema = new mongoose.Schema({
  alumno: { type: mongoose.Schema.Types.ObjectId, ref: 'Alumno', required: true },
  sede: { type: mongoose.Schema.Types.ObjectId, ref: 'Sede', required: false },
  prenda: { type: String, required: true },
  nombre_personalizado: { type: String, trim: true },
  numero_franela: { type: String, trim: true },
  precio: { type: Number, default: 0 },
  talla: { type: String, required: true },
  estado: {
    type: String,
    enum: ['pendiente', 'esperando_pago', 'abono', 'pago_en_revision', 'verificado', 'entregado', 'cancelado'],
    default: 'pendiente'
  },
  monto_pagado: { type: Number, default: 0 },
  monto_pagado_bs: { type: Number, default: 0 },
  monto_ultimo_pago: { type: Number, default: 0 },
  monto_ultimo_pago_bs: { type: Number, default: 0 },
  saldo_pendiente: { type: Number, default: 0 },
  metodo_pago: { type: String },
  referencia: { type: String },
  comprobante_url: { type: String },
  fecha_pago: { type: Date },
  pagos_historial: {
    type: [
      {
        monto_pagado: { type: Number, required: true },
        monto_pagado_bs: { type: Number, default: 0 },
        metodo_pago: { type: String },
        referencia: { type: String },
        comprobante_url: { type: String },
        fecha_pago: { type: Date }
      }
    ],
    default: []
  },
  solicitado_por: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('UniformePedido', UniformePedidoSchema);
