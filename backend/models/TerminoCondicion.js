const mongoose = require('mongoose');

const TerminoCondicionSchema = new mongoose.Schema(
  {
    nota: { type: String, default: '', trim: true },
    archivo_url: { type: String, required: true, trim: true },
    nombre_archivo: { type: String, required: true, trim: true },
    tipo_mime: { type: String, default: '', trim: true },
    tamano_bytes: { type: Number, default: 0, min: 0 },
    version: { type: Number, required: true, min: 1 },
    vigente: { type: Boolean, default: true },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('TerminoCondicion', TerminoCondicionSchema);