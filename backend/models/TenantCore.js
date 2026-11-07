const mongoose = require('mongoose');

const TenantCoreSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, unique: true, trim: true, lowercase: true },
  nombre: { type: String, required: true, trim: true },
  estado: { type: String, enum: ['active', 'suspended'], default: 'active' },
  domains: [{ type: String, required: true, trim: true, lowercase: true }],
  dbUri: { type: String, required: true, trim: true },
  suscripcion: {
    plan: { type: String, trim: true },
    costo_mensual_usd: { type: Number, min: 0 },
    estado_solvencia: { type: String, trim: true },
    proximo_pago: { type: String, trim: true },
    recordatorio_pago_activo: { type: Boolean, default: false },
    datos_pago: {
      banco: { type: String, trim: true },
      cedula: { type: String, trim: true },
      telefono: { type: String, trim: true }
    },
    contacto: {
      whatsapp: { type: String, trim: true },
      email: { type: String, trim: true }
    }
  },
  branding: {
    displayName: { type: String, trim: true },
    tagline: { type: String, trim: true },
    logoUrl: { type: String, trim: true }
  }
}, { timestamps: true, collection: 'tenants' });

TenantCoreSchema.index({ domains: 1 }, { unique: true, sparse: true });

function getTenantCoreModel(connection) {
  return connection.models.TenantCore || connection.model('TenantCore', TenantCoreSchema);
}

module.exports = {
  getTenantCoreModel
};
