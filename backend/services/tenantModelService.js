const User = require('../models/User');
const Role = require('../models/Role');
const Sede = require('../models/Sede');
const Representante = require('../models/Representante');
const Alumno = require('../models/Alumno');
const Reposo = require('../models/Reposo');
const Mensualidad = require('../models/Mensualidad');
const PagoDetalle = require('../models/PagoDetalle');
const Aspirante = require('../models/Aspirante');
const Uniforme = require('../models/Uniforme');
const UniformePedido = require('../models/UniformePedido');
const TenantConfig = require('../models/TenantConfig');
const LandingAtletaFoto = require('../models/LandingAtletaFoto');
const Entrenador = require('../models/Entrenador');
const HistorialEstadoAlumno = require('../models/HistorialEstadoAlumno');
const Recaudo = require('../models/Recaudo');
const EgresoCategoria = require('../models/EgresoCategoria');
const Egreso = require('../models/Egreso');
const TerminoCondicion = require('../models/TerminoCondicion');
const TerminoAceptacion = require('../models/TerminoAceptacion');
const ConstanciaSolicitud = require('../models/ConstanciaSolicitud');

const modelSchemaMap = {
  User: User.schema,
  Role: Role.schema,
  Sede: Sede.schema,
  Representante: Representante.schema,
  Alumno: Alumno.schema,
  Reposo: Reposo.schema,
  Mensualidad: Mensualidad.schema,
  PagoDetalle: PagoDetalle.schema,
  Aspirante: Aspirante.schema,
  Uniforme: Uniforme.schema,
  UniformePedido: UniformePedido.schema,
  TenantConfig: TenantConfig.schema,
  LandingAtletaFoto: LandingAtletaFoto.schema,
  Entrenador: Entrenador.schema,
  HistorialEstadoAlumno: HistorialEstadoAlumno.schema,
  Recaudo: Recaudo.schema,
  EgresoCategoria: EgresoCategoria.schema,
  Egreso: Egreso.schema,
  TerminoCondicion: TerminoCondicion.schema,
  TerminoAceptacion: TerminoAceptacion.schema,
  ConstanciaSolicitud: ConstanciaSolicitud.schema
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
