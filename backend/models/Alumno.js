const mongoose = require('mongoose');


const AlumnoSchema = new mongoose.Schema({
  nombres: { type: String, required: true },
  apellidos: { type: String, required: true },
  foto: { type: String }, // URL pública del archivo (ej. /uploads/alumnos/...)
  foto_cedula: { type: String }, // URL pública de la cédula (ej. /uploads/alumnos/...)
  lugar_nacimiento: { type: String },
  fecha_nacimiento: { type: Date },
  fecha_inscripcion: { type: Date },
  fecha_inicio_cobro: { type: Date, required: true },
  cedula: { type: String },
  domicilio: { type: String },
  telefono: { type: String },
  talla: { type: String },
  peso: { type: String },
  alcance: { type: String },
  envergadura: { type: String },
  proyeccion: { type: String },
  tipo_sangre: { type: String },
  alergias: { type: String },
  antecedentes_patologicos: { type: String },
  observaciones: { type: String },
  numero_franela: { type: Number, min: 1, max: 100 },
  habilitar_pago_cuotas: { type: Boolean, default: false },
  aplicar_recargo_mensualidad: { type: Boolean, default: true },
  saldo_a_favor_mensualidades: { type: Number, default: 0 },
  etiquetas: [{ type: String }],
  activo: { type: Boolean, default: true },
  dado_de_baja: { type: Boolean, default: false },
  fecha_baja: { type: Date },
  motivo_baja: { type: String },
  estado: { type: String, default: 'Activo' },
  sede: { type: mongoose.Schema.Types.ObjectId, ref: 'Sede', required: true },
  categoria: { type: String },
  representante: { type: mongoose.Schema.Types.ObjectId, ref: 'Representante', required: false },
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },
  parentesco: { type: String },
  tipo_mensualidad: { type: String, enum: ['monto_sede', 'monto_personalizado', 'beca_completa'], default: 'monto_sede' },
  monto_personalizado_valor: { type: Number },
  sinRepresentante: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Alumno', AlumnoSchema);
