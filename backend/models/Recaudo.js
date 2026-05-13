const mongoose = require('mongoose');

const RecaudoSchema = new mongoose.Schema(
  {
    titulo: { type: String, required: true, trim: true },
    descripcion: { type: String, default: '', trim: true },
    archivo_url: { type: String, required: true, trim: true },
    nombre_archivo: { type: String, required: true, trim: true },
    tipo_mime: { type: String, default: '', trim: true },
    tamano_bytes: { type: Number, default: 0, min: 0 },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Recaudo', RecaudoSchema);