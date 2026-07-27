const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  rol: { type: String, default: 'usuario' },
  roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', default: null },
  roles: { type: [String], default: ['usuario'] },
  roleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }]
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
