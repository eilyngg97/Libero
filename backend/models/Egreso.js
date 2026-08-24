const mongoose = require('mongoose');

const HistorialEstadoSchema = new mongoose.Schema(
  {
    estado_anterior: { type: String, default: '' },
    estado_nuevo: { type: String, required: true, trim: true },
    motivo: { type: String, default: '', trim: true },
    usuario_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    usuario_nombre: { type: String, default: '', trim: true },
    fecha: { type: Date, default: Date.now }
  },
  { _id: false }
);

const EgresoSchema = new mongoose.Schema(
  {
    fecha_emision: { type: Date, required: true },
    fecha_pago: { type: Date, default: null },
    monto: { type: Number, required: true, min: 0.01 },
    moneda: { type: String, enum: ['USD', 'EUR', 'VES'], default: 'USD' },
    tasa_referencia: { type: Number, default: null, min: 0 },
    categoria_id: { type: mongoose.Schema.Types.ObjectId, ref: 'EgresoCategoria', required: true },
    subcategoria_id: { type: mongoose.Schema.Types.ObjectId, ref: 'EgresoCategoria', required: true },
    metodo_pago: { type: String, required: true, trim: true },
    proveedor: { type: String, default: '', trim: true },
    comprobante_url: { type: String, default: '', trim: true },
    comprobante_nombre: { type: String, default: '', trim: true },
    comprobante_mime: { type: String, default: '', trim: true },
    comprobante_tamano_bytes: { type: Number, default: 0, min: 0 },
    estado: { type: String, enum: ['Pendiente', 'Pagado'], default: 'Pendiente' },
    motivo_rechazo: { type: String, default: '', trim: true },
    observaciones: { type: String, default: '', trim: true },
    sede: { type: mongoose.Schema.Types.ObjectId, ref: 'Sede', default: null },
    historial_estado: { type: [HistorialEstadoSchema], default: [] },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    aprobado_por: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    deleted_at: { type: Date, default: null }
  },
  { timestamps: true }
);

EgresoSchema.index({ estado: 1, fecha_emision: -1 });
EgresoSchema.index({ fecha_pago: -1 });
EgresoSchema.index({ categoria_id: 1, subcategoria_id: 1 });
EgresoSchema.index({ proveedor: 1 });
EgresoSchema.index({ sede: 1, fecha_pago: -1 });
EgresoSchema.index({ deleted_at: 1, createdAt: -1 });

module.exports = mongoose.model('Egreso', EgresoSchema);
