const router = require('express').Router();
const { authMiddleware, rolMiddleware } = require('../middleware/auth');
const { buildTenantSubscription } = require('../services/tenantSubscriptionService');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');

router.get('/', authMiddleware, rolMiddleware('admin', 'super_admin'), async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const connection = await getTenantBusinessConnection(req.tenant || { tenantId: req.tenantId });
    const TenantAlumno = getTenantModel(connection, 'Alumno');
    const totalAlumnosActivos = await TenantAlumno.countDocuments({
      activo: { $ne: false },
      dado_de_baja: { $ne: true }
    });
    return res.json(buildTenantSubscription(req.tenant || {}, req.tenantId, totalAlumnosActivos));
  } catch (_) {
    return res.status(500).json({ error: 'No se pudo calcular el plan de la academia' });
  }
});

module.exports = router;