const mongoose = require('mongoose');


const MensualidadSchema = new mongoose.Schema({
  id_alumno: { type: mongoose.Schema.Types.ObjectId, ref: 'Alumno', required: true },
  mes: { type: Number, required: true }, // 1-12
  anio: { type: Number, required: true },
  monto_base: { type: Number },
  credito_aplicado: { type: Number, default: 0 },
  ajuste_extraordinario: { type: Number, default: 0 },
  saldo_a_favor_generado: { type: Number, default: 0 },
  aplica_recargo: { type: Boolean, default: false },
  monto_sin_recargo_usd: { type: Number, default: 0 },
  recargo_aplicado_usd: { type: Number, default: 0 },
  monto_con_recargo_usd: { type: Number, default: 0 },
  fecha_aplicacion_recargo: { type: Date },
  ajuste_descripcion: { type: String },
  ajuste_fecha: { type: Date },
  monto_esperado: { type: Number, required: true },
  monto_inscripcion: { type: Number },
  monto_primera_mensualidad: { type: Number },
  monto_reingreso: { type: Number },
  monto_mensualidad_reingreso: { type: Number },
  tipo_registro_inicial: { type: String, enum: ['inscripcion', 'reingreso'] },
  es_inscripcion: { type: Boolean, default: false },
  monto_equivalente_bs: { type: Number },
  fecha_pago: { type: Date },
  metodo_pago: { type: String },
  referencia: { type: String },
  comprobante_url: { type: String },
  fecha_vencimiento: { type: Date, required: true },
  estatus: { type: String, enum: ['Pendiente', 'Pagado', 'Retrasado', 'Insolvente', 'Exonerado', 'En revision', 'Abono', 'Exento por reposo', 'Becado'], default: 'Pendiente' },
  historial_ediciones: [{
    fecha: { type: Date, default: Date.now },
    accion: { type: String, default: 'edicion_manual' },
    nota: { type: String, default: '' },
    actor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actor_nombre: { type: String, default: '' },
    actor_rol: { type: String, default: '' },
    anterior: {
      monto_esperado: { type: Number },
      estatus: { type: String },
      ajuste_extraordinario: { type: Number },
      ajuste_descripcion: { type: String },
      saldo_a_favor_generado: { type: Number }
    },
    nuevo: {
      monto_esperado: { type: Number },
      estatus: { type: String },
      ajuste_extraordinario: { type: Number },
      ajuste_descripcion: { type: String },
      saldo_a_favor_generado: { type: Number }
    }
  }]
}, { timestamps: true });

MensualidadSchema.index({ id_alumno: 1, mes: 1, anio: 1 }, { unique: true });

module.exports = mongoose.model('Mensualidad', MensualidadSchema);
