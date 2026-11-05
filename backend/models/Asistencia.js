const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  sede: { type: mongoose.Schema.Types.ObjectId, ref: 'Sede', required: true },
  grupo: { type: mongoose.Schema.Types.ObjectId, ref: 'GrupoEntrenamiento', required: true },
  fecha: { type: String, required: true },
  nombre: String,
  hora_inicio: String,
  hora_fin: String,
  categorias: [String],
  entrenador: String,
  entrenadores: { type: [String], default: undefined },
  cancha: String,
  registros: [{
    _id: false,
    alumno: { type: mongoose.Schema.Types.ObjectId, ref: 'Alumno', required: true },
    nombre: { type: String, required: true },
    categoria: String,
    estado: { type: String, enum: ['', 'presente', 'ausente', 'justificado'], default: '' },
    observacion: { type: String, maxlength: 300, default: '' }
  }],
  actualizado_por: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

schema.index({ sede: 1, grupo: 1, fecha: 1 }, { unique: true });
schema.index({ sede: 1, fecha: -1 });
module.exports = mongoose.model('Asistencia', schema);