const express = require('express');
const router = express.Router();
const pagoDetalleController = require('../controllers/pagoDetalleController');
const { authMiddleware } = require('../middleware/auth');
const {
	ensureMensualidadOwnershipFromBody,
	ensureMensualidadOwnershipFromParam,
	ensurePagoOwnershipFromParam
} = require('../middleware/ownership');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');

function resolveTenantId(req) {
	return resolveRequestTenantId(req);
}

function resolveComprobanteUploadDir(req) {
	const uploadDir = path.join(__dirname, '..', 'uploads', resolveTenantId(req), 'comprobantes');
	fs.mkdirSync(uploadDir, { recursive: true });
	return uploadDir;
}

const storage = multer.diskStorage({
	destination: (req, file, cb) => cb(null, resolveComprobanteUploadDir(req)),
	filename: (req, file, cb) => {
		const ext = path.extname(file.originalname || '').toLowerCase();
		const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
		cb(null, name);
	}
});

const upload = multer({ storage });

// Registrar pago
router.post('/', authMiddleware, upload.single('comprobante'), ensureMensualidadOwnershipFromBody('id_mensualidad'), pagoDetalleController.registrarPago);
// Editar pago
router.patch('/:id_pago', authMiddleware, upload.single('comprobante'), ensurePagoOwnershipFromParam('id_pago'), pagoDetalleController.editarPago);
// Eliminar pago
router.delete('/:id_pago', authMiddleware, ensurePagoOwnershipFromParam('id_pago'), pagoDetalleController.eliminarPago);
// Consultar pagos por mensualidad
router.get('/:id_mensualidad', authMiddleware, ensureMensualidadOwnershipFromParam('id_mensualidad'), pagoDetalleController.getPagosPorMensualidad);

module.exports = router;
