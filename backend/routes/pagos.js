const express = require('express');
const router = express.Router();
const pagoDetalleController = require('../controllers/pagoDetalleController');
const { authMiddleware, permisoMiddleware } = require('../middleware/auth');
const {
	ensureMensualidadOwnershipFromBody,
	ensureMensualidadOwnershipFromParam,
	ensurePagoOwnershipFromParam,
	ensurePagoAgrupadoOwnershipFromParam
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
const uploadAgrupado = multer({
	storage,
	limits: { fileSize: 10 * 1024 * 1024 },
	fileFilter: (req, file, cb) => {
		const permitidos = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf' };
		const extension = path.extname(file.originalname || '').toLowerCase();
		if (permitidos[extension] !== file.mimetype) return cb(new Error('Comprobante invalido. Usa JPG, PNG, WebP o PDF.'));
		return cb(null, true);
	}
});

function subirComprobanteAgrupado(req, res, next) {
	uploadAgrupado.single('comprobante')(req, res, (error) => {
		if (error) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'El comprobante no puede superar 10 MB.' : error.message });
		return next();
	});
}

// Registrar pago
const permisoGestion = permisoMiddleware('mensualidades.manage');
const propiedadGrupo = ensurePagoAgrupadoOwnershipFromParam('id');
function accesoPagoAgrupado(req, res, next) {
	return req.user?.rol === 'usuario' ? propiedadGrupo(req, res, next) : permisoGestion(req, res, next);
}

router.post('/', authMiddleware, upload.single('comprobante'), ensureMensualidadOwnershipFromBody('id_mensualidad'), pagoDetalleController.registrarPago);
router.post('/credito', authMiddleware, ensureMensualidadOwnershipFromBody('id_mensualidad'), pagoDetalleController.aplicarCreditoSinTransferencia);
// Registrar una transferencia para varias mensualidades
router.post('/agrupado', authMiddleware, upload.single('comprobante'), pagoDetalleController.registrarPagoAgrupado);
router.get('/agrupado/:id/tasa', authMiddleware, accesoPagoAgrupado, pagoDetalleController.getTasaPagoAgrupado);
router.get('/agrupado/:id', authMiddleware, accesoPagoAgrupado, pagoDetalleController.getPagoAgrupado);
router.patch('/agrupado/:id/retirar-recargos', authMiddleware, permisoMiddleware('mensualidades.manage'), pagoDetalleController.retirarRecargoPagoAgrupado);
router.patch('/agrupado/:id/mensualidades/:id_mensualidad/retirar-recargo', authMiddleware, permisoMiddleware('mensualidades.manage'), pagoDetalleController.retirarRecargoPagoAgrupado);
router.patch('/agrupado/:id', authMiddleware, accesoPagoAgrupado, subirComprobanteAgrupado, pagoDetalleController.editarPagoAgrupado);
// Editar pago
router.patch('/:id_pago', authMiddleware, upload.single('comprobante'), ensurePagoOwnershipFromParam('id_pago'), pagoDetalleController.editarPago);
// Eliminar pago
router.delete('/:id_pago', authMiddleware, ensurePagoOwnershipFromParam('id_pago'), pagoDetalleController.eliminarPago);
// Consultar pagos por mensualidad
router.get('/:id_mensualidad', authMiddleware, ensureMensualidadOwnershipFromParam('id_mensualidad'), pagoDetalleController.getPagosPorMensualidad);

module.exports = router;
