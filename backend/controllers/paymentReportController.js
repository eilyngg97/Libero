const mongoose = require('mongoose');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const { resolverPeriodoReporte, construirReportePagos } = require('../services/paymentReport');

exports.getReportePagos = async (req, res) => {
  try {
    if (req.user?.rol === 'usuario') return res.status(403).json({ error: 'Reporte reservado al personal autorizado.' });
    const periodo = resolverPeriodoReporte(req.query);
    const sede = req.query.id_sede;
    if (sede && !mongoose.isValidObjectId(sede)) return res.status(400).json({ error: 'Sede invalida.' });
    const connection = await getTenantBusinessConnection(req.tenant || { tenantId: req.tenantId });
    const models = Object.fromEntries(['Alumno', 'Representante', 'Sede', 'Mensualidad', 'PagoDetalle', 'PagoAgrupado']
      .map((modelName) => [modelName, getTenantModel(connection, modelName)]));
    const alumnos = await models.Alumno.find(sede ? { sede } : {})
      .select('nombres apellidos sede representante activo dado_de_baja')
      .populate([{ path: 'sede', select: 'nombre' }, { path: 'representante', select: 'nombres apellidos' }]).lean();
    const alumnosPorId = new Map(alumnos.map((alumno) => [String(alumno._id), alumno]));
    const historicas = await models.Mensualidad.find({
      id_alumno: { $in: alumnos.map((alumno) => alumno._id) }
    }).lean();
    const fechas = { $gte: periodo.inicioConsulta, $lt: periodo.finConsulta };
    const gruposDelMes = await models.PagoAgrupado.find({ fecha_pago: fechas }).select('_id').lean();
    const pagos = await models.PagoDetalle.find({ $or: [
      { fecha_pago: fechas }, { id_pago_agrupado: { $in: gruposDelMes.map((grupo) => grupo._id) } },
      { id_mensualidad: { $in: historicas.map((cuota) => cuota._id) } }
    ] }).lean();
    const cuotas = await models.Mensualidad.find({
      _id: { $in: pagos.map((pago) => pago.id_mensualidad) },
      id_alumno: { $in: alumnos.map((alumno) => alumno._id) }
    }).lean();
    const grupos = await models.PagoAgrupado.find({ _id: { $in: [...new Set(pagos
      .filter((pago) => pago.id_pago_agrupado).map((pago) => String(pago.id_pago_agrupado)))] } }).lean();
    const gruposPorId = new Map(grupos.map((grupo) => [String(grupo._id), grupo]));
    const mensualidades = new Map([...historicas, ...cuotas].map((cuota) => [String(cuota._id), {
      ...cuota, id_alumno: alumnosPorId.get(String(cuota.id_alumno))
    }]));
    const resultado = construirReportePagos({ alumnos, mensualidades: [...mensualidades.values()],
      pagos: pagos.map((pago) => ({ ...pago, id_pago_agrupado: pago.id_pago_agrupado
        ? gruposPorId.get(String(pago.id_pago_agrupado)) || { _id: pago.id_pago_agrupado, estado: 'Desconocido' }
        : null })), periodo, sede });
    res.json(resultado);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
};