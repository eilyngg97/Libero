const express = require('express');
const router = express.Router();
const uniformeController = require('../controllers/uniformeController');
const uniformePedidoController = require('../controllers/uniformePedidoController');
const { authMiddleware, rolMiddleware } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');
const imageProcessor = require('../middleware/imageProcessor');

function resolveTenantId(req) {
	return resolveRequestTenantId(req);
}

const storage = multer.diskStorage({
	destination: (req, file, cb) => {
		const tenantId = resolveTenantId(req);
		const folder = file.fieldname === 'fotos' ? 'uniformes' : 'comprobantes';
		const uploadDir = path.join(__dirname, '..', 'uploads', tenantId, folder);
		fs.mkdirSync(uploadDir, { recursive: true });
		cb(null, uploadDir);
	},
	filename: (req, file, cb) => {
		const ext = path.extname(file.originalname || '').toLowerCase();
		const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
		cb(null, name);
	}
});

const uploadFotos = multer({
	storage,
	limits: { fileSize: 6 * 1024 * 1024 },
	fileFilter: (req, file, cb) => {
		if (file.fieldname !== 'fotos') return cb(new Error('Campo de archivo invalido para fotos.'));
		if (String(file.mimetype || '').toLowerCase().startsWith('image/')) return cb(null, true);
		return cb(new Error('Solo se permiten archivos de imagen para las fotos de la prenda.'));
	}
});

const uploadComprobante = multer({
	storage,
	limits: { fileSize: 5 * 1024 * 1024 },
	fileFilter: (req, file, cb) => {
		if (file.fieldname !== 'comprobante') return cb(new Error('Campo de archivo invalido para comprobante.'));
		const mime = String(file.mimetype || '').toLowerCase();
		if (mime.startsWith('image/') || mime === 'application/pdf') return cb(null, true);
		return cb(new Error('El comprobante debe ser una imagen o PDF.'));
	}
});


// Endpoint público de listado
router.get('/public', uniformeController.getUniformes);
// Pedidos de uniformes
router.post('/pedidos', authMiddleware, uploadComprobante.single('comprobante'), uniformePedidoController.createPedidoUniforme);
router.get('/pedidos/mis', authMiddleware, uniformePedidoController.getMisPedidosUniforme);
router.get('/pedidos', authMiddleware, rolMiddleware('admin'), uniformePedidoController.getPedidosUniforme);
router.patch('/pedidos/:id/solicitar-pago', authMiddleware, rolMiddleware('admin'), uniformePedidoController.solicitarPagoPedido);
router.patch('/pedidos/:id/cancelar', authMiddleware, uniformePedidoController.cancelarPedido);
router.patch('/pedidos/:id/pagar', authMiddleware, uploadComprobante.single('comprobante'), uniformePedidoController.registrarPagoPedido);
router.patch('/pedidos/:id/verificar-pago', authMiddleware, rolMiddleware('admin'), uniformePedidoController.verificarPagoPedido);
router.patch('/pedidos/:id/entregado', authMiddleware, rolMiddleware('admin'), uniformePedidoController.marcarEntregado);
// Todas las rutas protegidas para admin
router.get('/', authMiddleware, rolMiddleware('admin'), uniformeController.getUniformes);
router.post('/', authMiddleware, rolMiddleware('admin'), uploadFotos.array('fotos', 2), imageProcessor({ fieldName: 'fotos' }), uniformeController.createUniforme);
router.put('/:id', authMiddleware, rolMiddleware('admin'), uploadFotos.array('fotos', 2), imageProcessor({ fieldName: 'fotos' }), uniformeController.updateUniforme);
router.delete('/:id', authMiddleware, rolMiddleware('admin'), uniformeController.deleteUniforme);

module.exports = router;
