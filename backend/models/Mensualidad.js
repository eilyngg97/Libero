const mongoose = require('mongoose');


const MensualidadSchema = new mongoose.Schema({
  id_alumno: { type: mongoose.Schema.Types.ObjectId, ref: 'Alumno', required: true },
  mes: { type: Number, required: true }, // 1-12
  anio: { type: Number, required: true },
  monto_esperado: { type: Number, required: true },
  fecha_vencimiento: { type: Date, required: true },
  estatus: { type: String, enum: ['Pendiente', 'Pagado', 'Retrasado', 'Exonerado', 'En revision', 'Abono', 'Exento por reposo'], default: 'Pendiente' }
}, { timestamps: true });

MensualidadSchema.index({ id_alumno: 1, mes: 1, anio: 1 }, { unique: true });

module.exports = mongoose.model('Mensualidad', MensualidadSchema);
