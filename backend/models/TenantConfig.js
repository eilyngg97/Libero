const mongoose = require('mongoose');

const PaymentMethodSchema = new mongoose.Schema({
  banco: { type: String, default: '' },
  telefono: { type: String, default: '' },
  cedula: { type: String, default: '' },
  cuenta: { type: String, default: '' },
  titular: { type: String, default: '' }
}, { _id: false });

const PagosSchema = new mongoose.Schema({
  pago_movil: { type: PaymentMethodSchema, default: () => ({}) },
  transferencia: { type: PaymentMethodSchema, default: () => ({}) },
  deposito_usd: {
    instrucciones: { type: String, default: '' }
  }
}, { _id: false });

const CobroSchema = new mongoose.Schema({
  dia_cobro: { type: Number, default: 1, min: 1, max: 31 },
  dia_vencimiento: { type: Number, default: 5, min: 1, max: 31 },
  dias_gracia: { type: Number, default: 0, min: 0, max: 31 },
  recargo_usd: { type: Number, default: 0, min: 0, max: 100000 }
}, { _id: false });

const ConstanciaTemplateSchema = new mongoose.Schema({
  titulo: { type: String, default: '' },
  destinatario: { type: String, default: '' },
  cuerpo: { type: String, default: '' },
  nota: { type: String, default: '' },
  cierre: { type: String, default: '' },
  lugarEmision: { type: String, default: '' }
}, { _id: false });

const RetiroPersonalizadoSchema = new mongoose.Schema({
  habilitado: { type: Boolean, default: false },
  incluir_logo_academia: { type: Boolean, default: false },
  institucion_nombre: { type: String, default: '' },
  subtitulo: { type: String, default: '' },
  logos: {
    type: [{ type: String }],
    default: [],
    validate: {
      validator: (arr) => Array.isArray(arr) && arr.length <= 3,
      message: 'Solo se permiten hasta 3 logos en retiro personalizado.'
    }
  },
  firmante: {
    nombre: { type: String, default: '' },
    cedula: { type: String, default: '' },
    telefono: { type: String, default: '' },
    cargo: { type: String, default: '' }
  },
  pie_direccion: { type: String, default: '' },
  pie_lema: { type: String, default: '' },
  template: { type: ConstanciaTemplateSchema, default: () => ({}) }
}, { _id: false });

const ConstanciasSchema = new mongoose.Schema({
  institucion_nombre: { type: String, default: '' },
  subtitulo: { type: String, default: '' },
  logos: {
    type: [{ type: String }],
    default: [],
    validate: {
      validator: (arr) => Array.isArray(arr) && arr.length <= 3,
      message: 'Solo se permiten hasta 3 logos en constancias.'
    }
  },
  firmante: {
    nombre: { type: String, default: '' },
    cedula: { type: String, default: '' },
    telefono: { type: String, default: '' },
    cargo: { type: String, default: '' }
  },
  pie_direccion: { type: String, default: '' },
  pie_lema: { type: String, default: '' },
  templates: {
    simple: { type: ConstanciaTemplateSchema, default: () => ({}) },
    retiro: { type: ConstanciaTemplateSchema, default: () => ({}) },
    horario_entrenamiento: { type: ConstanciaTemplateSchema, default: () => ({}) },
    listado_alumnos: { type: ConstanciaTemplateSchema, default: () => ({}) },
    asistencia: { type: ConstanciaTemplateSchema, default: () => ({}) }
  },
  retiro_personalizado: { type: RetiroPersonalizadoSchema, default: () => ({}) }
}, { _id: false });

const TenantConfigSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true },
  pagos: { type: PagosSchema, default: () => ({}) },
  cobro: { type: CobroSchema, default: () => ({}) },
  constancias: { type: ConstanciasSchema, default: () => ({}) },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('TenantConfig', TenantConfigSchema);
