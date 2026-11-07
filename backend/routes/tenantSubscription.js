const router = require('express').Router();
const { authMiddleware, rolMiddleware } = require('../middleware/auth');
const { buildTenantSubscription } = require('../services/tenantSubscriptionService');

router.get('/', authMiddleware, rolMiddleware('admin', 'super_admin'), (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.json(buildTenantSubscription(req.tenant || {}, req.tenantId));
});

module.exports = router;