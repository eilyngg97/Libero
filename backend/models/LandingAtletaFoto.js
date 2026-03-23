const mongoose = require('mongoose');

const LandingAtletaFotoSchema = new mongoose.Schema(
  {
    image: { type: String, required: true },
    orden: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model('LandingAtletaFoto', LandingAtletaFotoSchema);
