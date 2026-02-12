const mongoose = require('mongoose');

const PagoDetalleSchema = new mongoose.Schema({
  id_mensualidad: { type: mongoose.Schema.Types.ObjectId, ref: 'Mensualidad', required: true },
  monto_pagado: { type: Number, required: true },
  monto_pagado_bs: { type: Number },
  fecha_pago: { type: Date, required: true },
  metodo_pago: { type: String, required: true },
  referencia: { type: String },
  comprobante_url: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('PagoDetalle', PagoDetalleSchema);
