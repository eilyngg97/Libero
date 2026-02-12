const mongoose = require('mongoose');

const RepresentanteSchema = new mongoose.Schema({
  nombres: { type: String, required: true },
  apellidos: { type: String, required: true },
  cedula: { type: String, required: true, unique: true },
  // parentesco eliminado, ahora está en Alumno
  telefono: { type: String },
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Representante', RepresentanteSchema);
