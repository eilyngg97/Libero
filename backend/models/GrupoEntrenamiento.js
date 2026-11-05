const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  sede: { type: mongoose.Schema.Types.ObjectId, ref: 'Sede', required: true },
  nombre: { type: String, required: true, trim: true, maxlength: 100 },
  dias: [{ type: Number, min: 0, max: 6 }],
  hora_inicio: { type: String, required: true },
  hora_fin: { type: String, required: true },
  categorias: [{ type: String, trim: true }],
  alumnos_adicionales: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Alumno' }],
  alumnos_excluidos: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Alumno' }],
  entrenador: { type: String, trim: true, maxlength: 100 },
  entrenadores: { type: [{ type: String, trim: true, maxlength: 100 }], default: undefined },
  cancha: { type: String, trim: true, maxlength: 100 },
  activo: { type: Boolean, default: true }
}, { timestamps: true });

schema.index({ sede: 1, activo: 1 });
module.exports = mongoose.model('GrupoEntrenamiento', schema);