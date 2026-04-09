const mongoose = require('mongoose');

const UniformePedidoSchema = new mongoose.Schema({
  alumno: { type: mongoose.Schema.Types.ObjectId, ref: 'Alumno', required: true },
  sede: { type: mongoose.Schema.Types.ObjectId, ref: 'Sede', required: false },
  prenda: { type: String, required: true },
  talla: { type: String, required: true },
  estado: { type: String, default: 'pendiente' },
  solicitado_por: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('UniformePedido', UniformePedidoSchema);
