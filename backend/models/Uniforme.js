const mongoose = require('mongoose');

const UniformeSchema = new mongoose.Schema({
  prenda: { type: String, required: true },
  precio: { type: Number, required: true },
  moneda: { type: String, enum: ['USD', 'EUR'], default: 'USD' },
  variantes_precio_activo: { type: Boolean, default: false },
  variantes_generos: {
    type: [{ type: String, enum: ['masculino', 'femenino', 'mixto'] }],
    default: []
  },
  variantes_tallas: {
    type: [{ type: String }],
    default: []
  },
  precios_variantes: {
    type: [
      {
        genero: { type: String, enum: ['masculino', 'femenino', 'mixto'], required: true },
        talla: { type: String, required: true },
        precio: { type: Number, min: 0, required: true }
      }
    ],
    default: []
  },
  lleva_nombre_atleta: { type: Boolean, default: false },
  lleva_personalizacion_nombre: { type: Boolean, default: false },
  lleva_numero_franela: { type: Boolean, default: false },
  franela_representante: { type: Boolean, default: false },
  fotos: {
    type: [{ type: String }],
    default: [],
    validate: {
      validator: (arr) => Array.isArray(arr) && arr.length <= 2,
      message: 'Solo se permiten hasta 2 fotos por prenda.'
    }
  }
}, { timestamps: true });

module.exports = mongoose.model('Uniforme', UniformeSchema);