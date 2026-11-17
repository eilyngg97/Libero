const mongoose = require('mongoose');

const actorSchema = new mongoose.Schema({
  id: { type: String, required: true },
  rol: { type: String, enum: ['admin', 'super_admin', 'usuario'], required: true }
}, { _id: false });

const PagoCampaniaSchema = new mongoose.Schema({
  campania: { type: mongoose.Schema.Types.ObjectId, ref: 'CampaniaCobro', required: true },
  cargo: { type: mongoose.Schema.Types.ObjectId, ref: 'CargoCampania', required: true },
  alumno: { type: mongoose.Schema.Types.ObjectId, ref: 'Alumno', required: true },
  solicitud_id: { type: String, required: true },
  huella: { type: String, required: true, select: false },
  agrupacion: { type: new mongoose.Schema({
    id: { type: String, required: true },
    representante: { type: mongoose.Schema.Types.ObjectId, ref: 'Representante', required: true },
    cargos: { type: [mongoose.Schema.Types.ObjectId], required: true },
    monto_total: { type: Number, required: true, min: 0.01 },
    monto_total_bs: { type: Number, default: null, min: 0.01 }
  }, { _id: false }), default: undefined },
  es_principal_grupo: { type: Boolean, default: undefined },
  moneda: { type: String, enum: ['USD', 'EUR'], required: true },
  monto_pagado: { type: Number, required: true, min: 0.01, max: 999999999.99 },
  monto_pagado_bs: { type: Number, default: null, min: 0.01 },
  tasa: { type: Number, default: null },
  fecha_tasa: { type: String, default: '' },
  fecha_pago: { type: String, required: true },
  metodo_pago: { type: String, required: true },
  referencia: { type: String, required: true, maxlength: 100 },
  telefono_pago: { type: String, default: '', maxlength: 15 },
  cedula_titular: { type: String, default: '', maxlength: 20 },
  nota: { type: String, default: '', maxlength: 500 },
  comprobante_url: { type: String, default: '' },
  estado: { type: String, enum: ['en_revision', 'confirmado', 'eliminado'], required: true },
  eliminado_por: { type: actorSchema, default: undefined },
  eliminado_en: { type: Date, default: undefined },
  modificaciones: { type: [{ solicitud_id: String, huella: String, anterior: mongoose.Schema.Types.Mixed,
    actor: actorSchema, fecha: Date }], default: [], select: false },
  registrado_por: { type: actorSchema, required: true },
  confirmado_por: { type: actorSchema, default: undefined },
  confirmado_en: { type: Date, default: undefined }
}, { timestamps: true });

PagoCampaniaSchema.index({ cargo: 1, solicitud_id: 1 }, { unique: true });
PagoCampaniaSchema.index({ 'agrupacion.id': 1 });
PagoCampaniaSchema.index({ 'agrupacion.id': 1 }, { name: 'grupo_solicitud_unica', unique: true,
  partialFilterExpression: { es_principal_grupo: true } });
module.exports = mongoose.model('PagoCampania', PagoCampaniaSchema);