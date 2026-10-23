const mongoose = require('mongoose');

const RepresentanteSchema = new mongoose.Schema({
  nombres: { type: String, required: true },
  apellidos: { type: String, required: true },
  cedula: { type: String, required: true, unique: true },
  // parentesco eliminado, ahora está en Alumno
  fecha_nacimiento: { type: Date },
  correo: { type: String },
  direccion: { type: String },
  telefono: { type: String },
  whatsapp_consentimiento: {
    aceptado: { type: Boolean, default: false },
    fecha: { type: Date }
  },
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('Representante', RepresentanteSchema);
