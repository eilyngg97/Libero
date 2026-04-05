const mongoose = require('mongoose');


const MensualidadSchema = new mongoose.Schema({
  id_alumno: { type: mongoose.Schema.Types.ObjectId, ref: 'Alumno', required: true },
  mes: { type: Number, required: true }, // 1-12
  anio: { type: Number, required: true },
  monto_base: { type: Number },
  credito_aplicado: { type: Number, default: 0 },
  ajuste_extraordinario: { type: Number, default: 0 },
  saldo_a_favor_generado: { type: Number, default: 0 },
  ajuste_descripcion: { type: String },
  ajuste_fecha: { type: Date },
  monto_esperado: { type: Number, required: true },
  fecha_vencimiento: { type: Date, required: true },
  estatus: { type: String, enum: ['Pendiente', 'Pagado', 'Retrasado', 'Insolvente', 'Exonerado', 'En revision', 'Abono', 'Exento por reposo', 'Becado'], default: 'Pendiente' }
}, { timestamps: true });

MensualidadSchema.index({ id_alumno: 1, mes: 1, anio: 1 }, { unique: true });

module.exports = mongoose.model('Mensualidad', MensualidadSchema);
