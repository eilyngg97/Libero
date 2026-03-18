const express = require('express');
const router = express.Router();
const uniformeController = require('../controllers/uniformeController');
const uniformePedidoController = require('../controllers/uniformePedidoController');
const { authMiddleware, rolMiddleware } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '..', 'uploads', 'comprobantes');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
	destination: (req, file, cb) => cb(null, uploadDir),
	filename: (req, file, cb) => {
		const ext = path.extname(file.originalname || '').toLowerCase();
		const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
		cb(null, name);
	}
});

const upload = multer({ storage });


// Endpoint público de listado
router.get('/public', uniformeController.getUniformes);
// Pedidos de uniformes
router.post('/pedidos', authMiddleware, upload.single('comprobante'), uniformePedidoController.createPedidoUniforme);
router.get('/pedidos/mis', authMiddleware, uniformePedidoController.getMisPedidosUniforme);
router.get('/pedidos', authMiddleware, rolMiddleware('admin'), uniformePedidoController.getPedidosUniforme);
router.patch('/pedidos/:id/solicitar-pago', authMiddleware, rolMiddleware('admin'), uniformePedidoController.solicitarPagoPedido);
router.patch('/pedidos/:id/cancelar', authMiddleware, uniformePedidoController.cancelarPedido);
router.patch('/pedidos/:id/pagar', authMiddleware, upload.single('comprobante'), uniformePedidoController.registrarPagoPedido);
router.patch('/pedidos/:id/verificar-pago', authMiddleware, rolMiddleware('admin'), uniformePedidoController.verificarPagoPedido);
router.patch('/pedidos/:id/entregado', authMiddleware, rolMiddleware('admin'), uniformePedidoController.marcarEntregado);
// Todas las rutas protegidas para admin
router.get('/', authMiddleware, rolMiddleware('admin'), uniformeController.getUniformes);
router.post('/', authMiddleware, rolMiddleware('admin'), uniformeController.createUniforme);
router.put('/:id', authMiddleware, rolMiddleware('admin'), uniformeController.updateUniforme);
router.delete('/:id', authMiddleware, rolMiddleware('admin'), uniformeController.deleteUniforme);

module.exports = router;
