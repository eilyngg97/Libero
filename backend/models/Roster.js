const mongoose = require('mongoose');

const RosterDocumentLogoSchema = new mongoose.Schema({
  url: { type: String, required: true, trim: true },
  x: { type: Number, min: 0, max: 1, default: 0.04 },
  y: { type: Number, min: 0, max: 1, default: 0.025 },
  width: { type: Number, min: 0.03, max: 0.5, default: 0.12 },
  height: { type: Number, min: 0.02, max: 0.3, default: 0.08 },
  zIndex: { type: Number, default: 1 }
}, { _id: true });

const RosterDocumentSchema = new mongoose.Schema({
  incluir_fotos_cedula: { type: Boolean, default: false },
  logos_inicializados: { type: Boolean, default: false },
  campos: {
    titulo: { type: String, trim: true },
    subtitulo: { type: String, trim: true },
    texto_institucional: { type: String, trim: true },
    federacion_linea_1: { type: String, trim: true },
    federacion_linea_2: { type: String, trim: true },
    federacion_linea_3: { type: String, trim: true },
    club: { type: String, default: '', trim: true },
    categoria: { type: String, default: '', trim: true },
    equipo: { type: String, default: '', trim: true },
    entrenador_principal: { type: String, default: '', trim: true },
    asistente: { type: String, default: '', trim: true },
    asistentes: {
      type: [{ type: String, trim: true }],
      default: [],
      validate: {
        validator: (value) => !Array.isArray(value) || value.length <= 4,
        message: 'Solo se permiten hasta 4 asistentes por roster.'
      }
    }
  },
  logos: {
    type: [RosterDocumentLogoSchema],
    default: [],
    validate: {
      validator: (value) => !Array.isArray(value) || value.length <= 4,
      message: 'Solo se permiten hasta 4 logos por roster.'
    }
  }
}, { _id: false });

const RosterPrestamoSchema = new mongoose.Schema({
  nombres: { type: String, default: '', trim: true },
  apellidos: { type: String, default: '', trim: true },
  cedula: { type: String, default: '', trim: true },
  fecha_nacimiento: { type: Date, default: null },
  numero_franela: { type: String, default: '', trim: true },
  foto: { type: String, default: '', trim: true },
  representante: { type: String, default: '', trim: true },
  telefono: { type: String, default: '', trim: true },
  club_procedencia: { type: String, default: '', trim: true },
  fecha_prestamo: { type: Date, default: null },
  foto_cedula: { type: String, default: '', trim: true }
}, { timestamps: true });

const RosterSchema = new mongoose.Schema({
  torneo: { type: mongoose.Schema.Types.ObjectId, ref: 'Torneo', required: true, index: true },
  liga_name: { type: String, default: '' },
  categoria: { type: String, required: true, trim: true },
  sexo: { type: String, enum: ['Femenino', 'Masculino', 'Mixto'], required: true },
  division: { type: String, default: '', trim: true },
  grupo_competicion: { type: String, required: true, trim: true },
  jugadores: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Alumno' }],
  prestamos: { type: [RosterPrestamoSchema], default: [] },
  documento: { type: RosterDocumentSchema, default: () => ({}) },
  status: { type: String, enum: ['borrador', 'oficial', 'finalizado'], default: 'borrador' },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

RosterSchema.index({ torneo: 1, categoria: 1, sexo: 1, division: 1, grupo_competicion: 1, status: 1 });

module.exports = mongoose.model('Roster', RosterSchema);
