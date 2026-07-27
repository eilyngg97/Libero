const mongoose = require('mongoose');

const EntrenadorSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  apellido: { type: String, required: true },
  direccion: { type: String },
  cedula: { type: String, required: true, unique: true },
  fecha_nacimiento: { type: Date },
  telefono: { type: String },
  correo: { type: String },
  especialidad: { type: String },
  nivel_instruccion: { type: String },
  experiencia_previa: { type: String },
  certificaciones: [{ type: String }],
  talla_uniforme: {
    franela: { type: String, default: '' },
    short: { type: String, default: '' },
    mono: { type: String, default: '' }
  },
  tipo_contrato: {
    type: String,
    enum: ['fijo', 'por_horas', 'honorarios_profesionales']
  },
  pago_config: {
    monto_base_usd: { type: Number, default: 0 },
    frecuencia_pago: { type: String, enum: ['quincenal', 'semanal', 'por_sesion'], default: 'quincenal' },
    metodos: [{ type: String, enum: ['pago_movil', 'transferencia'] }],
    pago_movil: {
      banco: { type: String, default: '' },
      telefono: { type: String, default: '' },
      cedula: { type: String, default: '' }
    },
    transferencia: {
      banco: { type: String, default: '' },
      tipo_cuenta: { type: String, default: '' },
      numero_cuenta: { type: String, default: '' },
      titular: { type: String, default: '' },
      cedula: { type: String, default: '' }
    }
  },
  pagos_nomina: [{
    fecha_pago: { type: Date, required: true },
    periodo: { type: String, default: '' },
    periodo_clave: { type: String, default: '' },
    frecuencia_pago: { type: String, enum: ['mensual', 'quincenal', 'semanal', 'por_sesion'], default: 'mensual' },
    moneda_seleccionada: { type: String, enum: ['USD', 'VES'], default: 'USD' },
    tasa_bcv: { type: Number, default: 0 },
    monto_base_mensual_usd: { type: Number, default: 0 },
    monto_base_periodo_usd: { type: Number, default: 0 },
    monto_base_pago_usd: { type: Number, default: 0 },
    monto_base_pago_ves: { type: Number, default: 0 },
    bono_usd: { type: Number, default: 0 },
    bono_ves: { type: Number, default: 0 },
    deduccion_usd: { type: Number, default: 0 },
    deduccion_ves: { type: Number, default: 0 },
    monto_total_usd: { type: Number, default: 0 },
    monto_total_ves: { type: Number, default: 0 },
    metodo_pago: { type: String, default: '' },
    referencia: { type: String, default: '' },
    comprobante_url: { type: String, default: '' },
    observacion: { type: String, default: '' },
    registrado_por: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  datos_bancarios: { type: String },
  fecha_ingreso: { type: Date },
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sedes_staff: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Sede' }],
  estado: { type: String, enum: ['activo', 'inactivo'], default: 'activo' },
  foto: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Entrenador', EntrenadorSchema);
