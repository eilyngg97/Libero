const mongoose = require('mongoose');

const PaymentMethodSchema = new mongoose.Schema({
  banco: { type: String, default: '' },
  telefono: { type: String, default: '' },
  cedula: { type: String, default: '' },
  cuenta: { type: String, default: '' },
  titular: { type: String, default: '' }
}, { _id: false });

const PagosSchema = new mongoose.Schema({
  pago_movil: { type: PaymentMethodSchema, default: () => ({}) },
  transferencia: { type: PaymentMethodSchema, default: () => ({}) },
  deposito_usd: {
    instrucciones: { type: String, default: '' }
  }
}, { _id: false });

const CobroSchema = new mongoose.Schema({
  dia_cobro: { type: Number, default: 1, min: 1, max: 31 },
  dia_vencimiento: { type: Number, default: 5, min: 1, max: 31 },
  dias_gracia: { type: Number, default: 0, min: 0, max: 31 },
  recargo_usd: { type: Number, default: 0, min: 0, max: 100000 }
}, { _id: false });

const TenantConfigSchema = new mongoose.Schema({
  key: { type: String, default: 'default', unique: true },
  pagos: { type: PagosSchema, default: () => ({}) },
  cobro: { type: CobroSchema, default: () => ({}) },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.model('TenantConfig', TenantConfigSchema);
