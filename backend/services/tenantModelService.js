const User = require('../models/User');
const Sede = require('../models/Sede');
const Representante = require('../models/Representante');
const Alumno = require('../models/Alumno');
const Reposo = require('../models/Reposo');
const Mensualidad = require('../models/Mensualidad');
const PagoDetalle = require('../models/PagoDetalle');
const Aspirante = require('../models/Aspirante');
const Uniforme = require('../models/Uniforme');
const UniformePedido = require('../models/UniformePedido');
const LandingAtletaFoto = require('../models/LandingAtletaFoto');

const modelSchemaMap = {
  User: User.schema,
  Sede: Sede.schema,
  Representante: Representante.schema,
  Alumno: Alumno.schema,
  Reposo: Reposo.schema,
  Mensualidad: Mensualidad.schema,
  PagoDetalle: PagoDetalle.schema,
  Aspirante: Aspirante.schema,
  Uniforme: Uniforme.schema,
  UniformePedido: UniformePedido.schema,
  LandingAtletaFoto: LandingAtletaFoto.schema
};

function getTenantModel(connection, modelName) {
  const schema = modelSchemaMap[modelName];
  if (!schema) {
    throw new Error(`Modelo tenant no registrado: ${modelName}`);
  }
  return connection.models[modelName] || connection.model(modelName, schema);
}

module.exports = {
  getTenantModel
};
