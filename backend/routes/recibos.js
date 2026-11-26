const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const { authMiddleware, hasRequestPermission } = require('../middleware/auth');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const { userRepresentsAlumno } = require('../services/paymentOwnership');
const { aplicarSession, ejecutarConTransaccion } = require('../services/financeTransaction');
const { guardarMensualidadConRecibo, presentarImportesRecibo } = require('../services/paymentReceipt');

const router = express.Router();
const noEncontrado = () => Object.assign(new Error('Comprobante no encontrado'), { status: 404 });

async function modelos(req) {
  const connection = await getTenantBusinessConnection(req.tenant);
  return Object.fromEntries(['Mensualidad', 'Alumno', 'Representante'].map((name) => [name, getTenantModel(connection, name)]));
}

function serializar(req, mensualidad) {
  const recibo = mensualidad.recibo.toObject ? mensualidad.recibo.toObject() : mensualidad.recibo;
  const domains = req.tenant?.domains?.length ? req.tenant.domains
    : req.tenant?.modo === 'single-tenant-fallback'
      ? String(process.env.DEFAULT_TENANT_DOMAINS || '').split(',').map((domain) => domain.trim()).filter(Boolean)
      : [];
  const canonical = `${req.tenantId}.apex.com.ve`;
  const host = domains.includes(canonical) ? canonical : domains[0] || canonical;
  let origin = `https://${host}`;
  if (process.env.NODE_ENV !== 'production' && /^https?:\/\/((?:[a-z0-9-]+\.)*localhost|127\.0\.0\.1)(:\d+)?$/i.test(req.headers.origin || '')) {
    origin = req.headers.origin;
  }
  return { ...recibo, datos: presentarImportesRecibo(recibo.datos), estado: 'PAGADO', verificacion_url: `${origin}/verificar/${recibo.numero}` };
}

const publicLimiter = rateLimit({
  windowMs: 60 * 1000, limit: 60,
  message: { error: 'Demasiadas consultas. Intenta nuevamente en un minuto.' }
});

router.get('/verificar/:numero', publicLimiter, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    if (!/^REC-\d{4}-\d{4,}$/.test(req.params.numero)) throw noEncontrado();
    const { Mensualidad } = await modelos(req);
    const mensualidad = await Mensualidad.findOne({ 'recibo.numero': req.params.numero, estatus: 'Pagado' });
    if (!mensualidad) throw noEncontrado();
    const { numero, emitido_en, datos } = mensualidad.recibo;
    const { totales } = presentarImportesRecibo(datos);
    return res.json({
      valido: true, numero, emitido_en, estado: 'PAGADO',
      academia: datos.academia, concepto: datos.concepto,
      totales
    });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
});

router.use(authMiddleware);

async function puedeVer(req, alumno, models, session) {
  if (req.user.rol !== 'usuario') return hasRequestPermission(req, 'mensualidades.view');
  return String(alumno?.usuario || '') === String(req.user.id)
    || userRepresentsAlumno(req.user.id, alumno, models.Representante, session);
}

router.post('/mensualidad/:id', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    if (!mongoose.isValidObjectId(req.params.id)) throw noEncontrado();
    const models = await modelos(req);
    const mensualidad = await ejecutarConTransaccion(models.Mensualidad, async (session) => {
      const actual = await aplicarSession(models.Mensualidad.findById(req.params.id), session);
      if (!actual || actual.estatus !== 'Pagado') throw noEncontrado();
      const alumno = await aplicarSession(models.Alumno.findById(actual.id_alumno), session);
      if (!alumno || !(await puedeVer(req, alumno, models, session))) {
        throw Object.assign(new Error('No tienes permiso para este recibo'), { status: 403 });
      }
      await guardarMensualidadConRecibo(actual, { session });
      return actual;
    }, { obligatoria: true });
    return res.json(serializar(req, mensualidad));
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
});

router.post('/mios', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const models = await modelos(req);
    const representantes = await models.Representante.find({ usuario: req.user.id }).select('_id').lean();
    const alumnos = await models.Alumno.find({
      $or: [{ usuario: req.user.id }, { representante: { $in: representantes.map((item) => item._id) } }]
    }).select('_id').lean();
    const ids = await models.Mensualidad.find({
      id_alumno: { $in: alumnos.map((item) => item._id) }, estatus: 'Pagado'
    }).sort({ anio: 1, mes: 1, _id: 1 }).select('_id').lean();
    const recibos = [];
    const corte = new Date();
    for (const { _id } of ids) {
      const mensualidad = await ejecutarConTransaccion(models.Mensualidad, async (session) => {
        const actual = await aplicarSession(models.Mensualidad.findById(_id), session);
        if (!actual || actual.estatus !== 'Pagado') return null;
        const alumno = await aplicarSession(models.Alumno.findById(actual.id_alumno), session);
        if (!alumno || !(await puedeVer(req, alumno, models, session))) throw noEncontrado();
        await guardarMensualidadConRecibo(actual, { session });
        return actual;
      }, { obligatoria: true });
      if (mensualidad && mensualidad.recibo.datos.pagos.every((pago) => new Date(pago.fecha) <= corte)) {
        recibos.push(serializar(req, mensualidad));
      }
    }
    return res.json(recibos);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
  }
});

module.exports = router;
