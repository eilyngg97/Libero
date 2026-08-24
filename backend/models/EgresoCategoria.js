const mongoose = require('mongoose');

const EgresoCategoriaSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true, trim: true },
    nombre_normalizado: { type: String, required: true, trim: true, lowercase: true },
    tipo: { type: String, enum: ['categoria', 'subcategoria'], required: true },
    parent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'EgresoCategoria', default: null },
    codigo: { type: String, default: '', trim: true },
    descripcion: { type: String, default: '', trim: true },
    icono: { type: String, default: 'category', trim: true },
    color_acento: { type: String, default: '#4f46e5', trim: true },
    activo: { type: Boolean, default: true },
    es_sugerida: { type: Boolean, default: false },
    orden: { type: Number, default: 0 },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
);

EgresoCategoriaSchema.index({ tipo: 1, parent_id: 1, activo: 1, orden: 1 });
EgresoCategoriaSchema.index({ tipo: 1, parent_id: 1, nombre_normalizado: 1 }, { unique: true });

module.exports = mongoose.model('EgresoCategoria', EgresoCategoriaSchema);
