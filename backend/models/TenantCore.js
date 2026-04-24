const mongoose = require('mongoose');

const TenantCoreSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, unique: true, trim: true, lowercase: true },
  nombre: { type: String, required: true, trim: true },
  estado: { type: String, enum: ['active', 'suspended'], default: 'active' },
  domains: [{ type: String, required: true, trim: true, lowercase: true }],
  dbUri: { type: String, required: true, trim: true },
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
