const mongoose = require('mongoose');

const TIPOS_CONSTANCIA = ['simple', 'retiro', 'horario_entrenamiento', 'listado_alumnos', 'asistencia'];
const ESTADOS_SOLICITUD = ['pendiente', 'en_revision', 'completada', 'rechazada'];

const ConstanciaSolicitudSchema = new mongoose.Schema({
  alumno: { type: mongoose.Schema.Types.ObjectId, ref: 'Alumno', required: true },
  alumno_ids: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Alumno' }], default: [] },
  solicitado_por: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  tipo: { type: String, enum: TIPOS_CONSTANCIA, required: true },
  fecha_emision: { type: String, required: true },
  payload: {
    asistenciaPara: { type: String, enum: ['atleta', 'representante'], default: 'atleta' },
    eventoFecha: { type: String, default: '' },
    eventoHoraDesde: { type: String, default: '' },
    eventoHoraHasta: { type: String, default: '' },
    eventoMotivo: { type: String, default: '' },
    asistenciaTiempo: { type: String, enum: ['pasado', 'futuro'], default: 'pasado' },
    diasEntrenamiento: { type: [String], default: [] },
    horaInicio: { type: String, default: '' },
    horaFin: { type: String, default: '' }
  },
  estado: { type: String, enum: ESTADOS_SOLICITUD, default: 'pendiente' },
  nota_admin: { type: String, trim: true, default: '' },
  atendido_por: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  atendido_en: { type: Date }
}, { timestamps: true });

ConstanciaSolicitudSchema.index({ solicitado_por: 1, createdAt: -1 });
ConstanciaSolicitudSchema.index({ estado: 1, createdAt: -1 });
ConstanciaSolicitudSchema.index({ tipo: 1, createdAt: -1 });

module.exports = mongoose.model('ConstanciaSolicitud', ConstanciaSolicitudSchema);