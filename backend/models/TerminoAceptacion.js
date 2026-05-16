const mongoose = require('mongoose');

const TerminoAceptacionSchema = new mongoose.Schema(
  {
    termino_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TerminoCondicion',
      required: true,
      index: true
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    accepted_at: { type: Date, default: Date.now },
    accepted_ip: { type: String, default: '', trim: true },
    accepted_user_agent: { type: String, default: '', trim: true }
  },
  { timestamps: true }
);

TerminoAceptacionSchema.index({ termino_id: 1, user_id: 1 }, { unique: true });

module.exports = mongoose.model('TerminoAceptacion', TerminoAceptacionSchema);