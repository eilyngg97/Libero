const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  _id: { type: String },
  secuencia: { type: Number, required: true, default: 0 }
}, { versionKey: false });

module.exports = mongoose.model('ReciboCounter', schema);
