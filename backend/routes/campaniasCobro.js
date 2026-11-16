const express = require('express');
const { authMiddleware, rolMiddleware } = require('../middleware/auth');
const controller = require('../controllers/campaniaCobroController');
const pagoController = require('../controllers/campaniaPagoController');
const multer = require('multer');
const path = require('path');

const comprobante = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 15 },
	fileFilter: (req, file, cb) => {
		const tipos = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.pdf': 'application/pdf' };
		cb(tipos[path.extname(file.originalname).toLowerCase()] === file.mimetype ? null : new Error('Usa un comprobante JPG, PNG, WebP o PDF.'), true);
	} });
const subirComprobante = (req, res, next) => comprobante.single('comprobante')(req, res, (error) => {
	if (error) return res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'El comprobante no puede superar 5 MB.' : error.message });
	next();
});

const router = express.Router();
router.get('/mis-cargos', authMiddleware, rolMiddleware('usuario'), pagoController.misCargos);
router.get('/:id/cargos/:cargoId/pagos/:pagoId/comprobante', authMiddleware, rolMiddleware('admin', 'super_admin', 'usuario'), pagoController.comprobante);
router.get('/:id/cargos/:cargoId/pagos', authMiddleware, rolMiddleware('admin', 'super_admin', 'usuario'), pagoController.historial);
router.post('/:id/cargos/:cargoId/pagos', authMiddleware, rolMiddleware('admin', 'super_admin', 'usuario'), subirComprobante, pagoController.registrar);
router.patch('/:id/cargos/:cargoId/pagos/:pagoId', authMiddleware, rolMiddleware('admin', 'super_admin', 'usuario'), subirComprobante, pagoController.editar);
router.delete('/:id/cargos/:cargoId/pagos/:pagoId', authMiddleware, rolMiddleware('admin', 'super_admin', 'usuario'), pagoController.eliminar);
router.use(authMiddleware, rolMiddleware('admin', 'super_admin'));
router.get('/opciones', controller.opciones);
router.get('/', controller.listar);
router.post('/', controller.crear);
router.get('/:id/participantes', controller.participantes);
router.get('/:id/resumen', controller.resumen);
router.get('/:id/cargos', controller.cargos);
router.get('/:id/candidatos-cargos', controller.candidatosCargos);
router.post('/:id/ajustes-cargos', controller.ajustarCargo);
router.post('/:id/cargos/:cargoId/pagos/:pagoId/confirmar', pagoController.confirmar);
router.post('/:id/publicar', controller.publicar);
router.put('/:id/participantes', controller.guardarParticipantes);
router.patch('/:id', controller.editar);
router.delete('/:id', controller.eliminar);

module.exports = router;