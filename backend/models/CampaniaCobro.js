const mongoose = require('mongoose');

const CampaniaCobroSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true, maxlength: 150 },
  descripcion: { type: String, trim: true, default: '', maxlength: 2000 },
  modalidad_monto: { type: String, enum: ['unico', 'por_sede'], default: 'unico' },
  monto_general: { type: Number, required() { return this.get('modalidad_monto') !== 'por_sede'; }, min: 0.01, max: 999999999.99 },
  montos_por_sede: { type: [new mongoose.Schema({
    sede: { type: mongoose.Schema.Types.ObjectId, ref: 'Sede', required: true },
    monto: { type: Number, required: true, min: 0.01, max: 999999999.99 }
  }, { _id: false })], default: [] },
  moneda: { type: String, enum: ['USD', 'EUR'], required: true },
  sedes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Sede' }],
  participantes: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Alumno' }], default: [] },
  condiciones_participantes: { type: [new mongoose.Schema({
    alumno: { type: mongoose.Schema.Types.ObjectId, ref: 'Alumno', required: true },
    modalidad: { type: String, enum: ['general', 'personalizado', 'no_aplica'], required: true },
    monto: { type: Number, min: 0.01, max: 999999999.99 },
    nota_interna: { type: String, trim: true, maxlength: 1000, default: '' }
  }, { _id: false })], default: [], select: false },
  vencimiento: { type: String, default: '' },
  permitir_abonos: { type: Boolean, default: false },
  estado: { type: String, enum: ['borrador', 'abierta', 'cerrada', 'cancelada'], default: 'borrador' },
  solicitud_id: { type: String },
  publicacion: { type: new mongoose.Schema({
    solicitud_id: { type: String, required: true },
    version_borrador: { type: Number, required: true },
    revision: { type: String, required: true },
    fecha: { type: Date, required: true },
    actor: { id: { type: String, required: true }, rol: { type: String, required: true } },
    participantes: { type: Number, required: true },
    generales: { type: Number, required: true },
    personalizados: { type: Number, required: true },
    no_aplica: { type: Number, required: true },
    total_esperado: { type: Number, required: true, min: 0 }
  }, { _id: false }), default: undefined },
  actualizado_por: { id: String, rol: String }
}, { timestamps: true });

CampaniaCobroSchema.index({ createdAt: -1, _id: -1 });
CampaniaCobroSchema.index({ solicitud_id: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('CampaniaCobro', CampaniaCobroSchema);