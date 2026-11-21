const mongoose = require('mongoose');

const CampaniaCobroSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true, maxlength: 150 },
  descripcion: { type: String, trim: true, default: '', maxlength: 2000 },
  unidad_cobro: { type: String, enum: ['atleta', 'representante'], default: 'atleta' },
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
  cierre: { type: mongoose.Schema.Types.Mixed, select: false },
  historial_cierres: { type: [mongoose.Schema.Types.Mixed], default: [], select: false },
  solicitud_id: { type: String },
  publicacion: { type: new mongoose.Schema({
    solicitud_id: { type: String, required: true },
    version_borrador: { type: Number, required: true },
    revision: { type: String, required: true },
    fecha: { type: Date, required: true },
    actor: { id: { type: String, required: true }, rol: { type: String, required: true } },
    participantes: { type: Number, required: true },
    cobros: Number,
    representantes: Number,
    individuales: Number,
    generales: { type: Number, required: true },
    personalizados: { type: Number, required: true },
    no_aplica: { type: Number, required: true },
    total_esperado: { type: Number, required: true, min: 0 }
  }, { _id: false }), default: undefined },
  totales_cargos: { type: new mongoose.Schema({
    participantes: Number, cobros: Number, representantes: Number, individuales: Number,
    conservados: Number, cubiertos: Number,
    generales: Number, personalizados: Number, no_aplica: Number, total_esperado: Number
  }, { _id: false }), default: undefined },
  excepciones_cobro: { type: [new mongoose.Schema({
    cargo: { type: mongoose.Schema.Types.ObjectId, ref: 'CargoCampania', required: true },
    representante: { type: mongoose.Schema.Types.ObjectId, ref: 'Representante' },
    motivo: { type: String, required: true }
  }, { _id: false })], default: undefined },
  ajustes_cargos: { type: [new mongoose.Schema({
    solicitud_id: String, huella: String, accion: String, cargo: mongoose.Schema.Types.ObjectId,
    anterior: mongoose.Schema.Types.Mixed, nuevo: mongoose.Schema.Types.Mixed,
    actor: { id: String, rol: String }, fecha: Date
  }, { _id: false })], default: [], select: false },
  actualizado_por: { id: String, rol: String },
  coberturas_familiares: { type: [mongoose.Schema.Types.Mixed], default: [], select: false },
  conversion_representante: { type: mongoose.Schema.Types.Mixed, select: false }
}, { timestamps: true });

CampaniaCobroSchema.index({ createdAt: -1, _id: -1 });
CampaniaCobroSchema.index({ solicitud_id: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('CampaniaCobro', CampaniaCobroSchema);