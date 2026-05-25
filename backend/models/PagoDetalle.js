const mongoose = require('mongoose');

const PagoDetalleSchema = new mongoose.Schema({
  id_mensualidad: { type: mongoose.Schema.Types.ObjectId, ref: 'Mensualidad', required: true },
  concepto: { type: String },
  origen: { type: String },
  conceptos_detalle: [{
    tipo: { type: String },
    monto_esperado_usd: { type: Number },
    monto_pagado_usd: { type: Number },
    monto_esperado_bs: { type: Number },
    monto_pagado_bs: { type: Number }
  }],
  monto_pagado: { type: Number, required: true },
  monto_pagado_bs: { type: Number },
  monto_esperado_usd: { type: Number },
  monto_esperado_bs: { type: Number },
  nota: { type: String, default: '' },
  solicita_revision_recargo: { type: Boolean, default: false },
  fecha_pago: { type: Date, required: true },
  metodo_pago: { type: String, required: true },
  referencia: { type: String },
  comprobante_url: { type: String },
  registrado_por: {
    id_usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    nombre: { type: String, default: '' },
    rol: { type: String, default: '' },
    origen: { type: String, default: '' }
  }
}, { timestamps: true });

module.exports = mongoose.model('PagoDetalle', PagoDetalleSchema);
