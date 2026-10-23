const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const { crearVistaPrevia } = require('../services/notificationPreview');

async function modelos(req) {
  const connection = await getTenantBusinessConnection(req.tenant || { tenantId: req.tenantId });
  return Object.fromEntries(['TenantConfig', 'Mensualidad', 'PagoDetalle', 'Alumno', 'Representante', 'Notificacion']
    .map((name) => [name, getTenantModel(connection, name)]));
}

exports.getNotificaciones = async (req, res) => {
  const periodo = req.query.periodo;
  if (typeof periodo !== 'string' || !/^(20\d{2})-(0[1-9]|1[0-2])$/.test(periodo)) {
    return res.status(400).json({ error: 'Periodo invalido. Usa YYYY-MM entre 2000 y 2099.' });
  }
  const pagina = Number(req.query.pagina || 1);
  if (!Number.isSafeInteger(pagina) || pagina < 1 || pagina > 100000) {
    return res.status(400).json({ error: 'Pagina invalida.' });
  }
  try {
    const models = await modelos(req);
    const config = await models.TenantConfig.findOne({ key: 'default' }).select('notificaciones cobro').lean();
    const habilitadas = config?.notificaciones?.habilitadas === true;
    const [anio, mes] = periodo.split('-').map(Number);
    // Incluir deudas anteriores permite proyectar el credito en orden, sin avisos retroactivos.
    const mensualidades = await models.Mensualidad.find({
      $or: [{ anio: { $lt: anio } }, { anio, mes: { $lte: mes } }],
      estatus: { $in: ['Pendiente', 'Retrasado', 'Insolvente', 'Abono', 'En revision'] }
    }).select('_id id_alumno mes anio estatus monto_esperado fecha_vencimiento es_inscripcion tipo_registro_inicial credito_aplicado credito_en_revision pago_en_revision')
      .populate({ path: 'id_alumno',
        select: 'nombres apellidos activo dado_de_baja estado fecha_inicio_cobro tipo_mensualidad dia_limite_personalizado saldo_a_favor_mensualidades representante',
        populate: { path: 'representante', select: 'nombres apellidos telefono whatsapp_consentimiento' }
      }).lean();
    const pagos = mensualidades.length ? await models.PagoDetalle.find({
      id_mensualidad: { $in: mensualidades.map((item) => item._id) }
    }).select('id_mensualidad monto_pagado').lean() : [];
    const previa = crearVistaPrevia({ mensualidades, pagos, habilitadas, periodo });
    const filtro = { periodo };
    const [historial, conteos] = await Promise.all([
      models.Notificacion.find(filtro).select('representante_nombre telefono tipo fecha_programada estado error createdAt')
        .sort({ createdAt: -1, _id: -1 }).skip((pagina - 1) * 25).limit(25).lean(),
      models.Notificacion.aggregate([
        { $match: filtro }, { $group: { _id: '$estado', cantidad: { $sum: 1 } } }
      ])
    ]);
    const cantidades = Object.fromEntries(conteos.map((item) => [item._id, item.cantidad]));
    const resumen = {
      ...previa.resumen,
      aceptados: cantidades.aceptado || 0,
      entregados: cantidades.entregado || 0,
      fallidos: cantidades.fallido || 0
    };
    resumen.enviados = resumen.aceptados + resumen.entregados;
    res.json({
      periodo, tenant: req.tenantId, habilitadas, modo: 'vista_previa', envio_disponible: false,
      moneda: config?.cobro?.moneda || 'USD',
      resumen, avisos: previa.avisos, exclusiones: previa.exclusiones, historial,
      paginacion: { pagina, por_pagina: 25, total: conteos.reduce((sum, item) => sum + item.cantidad, 0) }
    });
  } catch (err) {
    console.error('[notificaciones] Error consultando vista del tenant:', req.tenantId, err.message);
    res.status(500).json({ error: 'No se pudieron consultar las notificaciones de esta academia.' });
  }
};

exports.updateConfiguracion = async (req, res) => {
  if (!req.body || typeof req.body.habilitadas !== 'boolean' ||
      Object.keys(req.body).some((key) => key !== 'habilitadas')) {
    return res.status(400).json({ error: 'Envia exclusivamente habilitadas como booleano.' });
  }
  try {
    const models = await modelos(req);
    await models.TenantConfig.findOneAndUpdate({ key: 'default' }, {
      $set: {
        'notificaciones.habilitadas': req.body.habilitadas,
        'notificaciones.actualizado_por': req.user.id,
        'notificaciones.actualizado_en': new Date()
      }
    }, { upsert: true, runValidators: true });
    res.json({ habilitadas: req.body.habilitadas, modo: 'vista_previa', envio_disponible: false });
  } catch (err) {
    console.error('[notificaciones] Error guardando configuracion del tenant:', req.tenantId, err.message);
    res.status(500).json({ error: 'No se pudo guardar la configuracion de notificaciones.' });
  }
};
