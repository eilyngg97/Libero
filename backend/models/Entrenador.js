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
  talla_uniforme: {
    franela: { type: String, default: '' },
    short: { type: String, default: '' },
    mono: { type: String, default: '' }
  },
  tipo_contrato: {
    type: String,
    enum: ['fijo', 'por_horas', 'honorarios_profesionales']
  },
  datos_bancarios: { type: String },
  fecha_ingreso: { type: Date },
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sedes_staff: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Sede' }],
  estado: { type: String, enum: ['activo', 'inactivo'], default: 'activo' },
  foto: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Entrenador', EntrenadorSchema);
