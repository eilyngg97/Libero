const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const { getOwnEntrenador } = require('../services/entrenadorAccess');
const { getTrainerFormats } = require('./constanciaController');

exports.getPortal = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const connection = await getTenantBusinessConnection(req.tenant || { tenantId: req.tenantId });
    const Entrenador = getTenantModel(connection, 'Entrenador');
    const Grupo = getTenantModel(connection, 'GrupoEntrenamiento');
    const Sede = getTenantModel(connection, 'Sede');
    const TenantConfig = getTenantModel(connection, 'TenantConfig');
    const own = await getOwnEntrenador(Entrenador, req.user.id);
    const grupos = await Grupo.find({ entrenadores_ids: own._id, activo: true })
      .select('_id nombre sede dias hora_inicio hora_fin categorias cancha entrenadores').sort({ hora_inicio: 1 }).lean();
    const sedeIds = [...new Set([...(own.sedes_staff || []).map(String), ...grupos.map(grupo => String(grupo.sede))])];
    const sedes = sedeIds.length ? await Sede.find({ _id: { $in: sedeIds } }).select('_id nombre direccion').lean() : [];
    const fields = ['_id', 'nombre', 'apellido', 'cedula', 'telefono', 'correo', 'direccion', 'especialidad',
      'nivel_instruccion', 'fecha_nacimiento', 'fecha_ingreso', 'foto', 'estado', 'tipo_contrato', 'pago_config',
      'datos_bancarios', 'certificaciones', 'contratos', 'pagos_nomina'];
    const entrenador = Object.fromEntries(fields.map(field => [field, own[field]]));
    const config = await TenantConfig.findOne({ key: 'default' }).select('constancias').lean();
    const formatos = getTrainerFormats(config?.constancias || {});
    return res.json({ entrenador, grupos, sedes, formatos });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'No se pudo cargar el portal del entrenador.' });
  }
};