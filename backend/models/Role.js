const mongoose = require('mongoose');

const RoleSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  slug: { type: String, required: true, trim: true, lowercase: true },
  descripcion: { type: String, default: '' },
  permisos: [{ type: String, trim: true }],
  activo: { type: Boolean, default: true }
}, { timestamps: true });

RoleSchema.index({ slug: 1 }, { unique: true });
RoleSchema.index({ nombre: 1 });

module.exports = mongoose.model('Role', RoleSchema);