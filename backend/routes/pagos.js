const express = require('express');
const router = express.Router();
const pagoDetalleController = require('../controllers/pagoDetalleController');
const { authMiddleware } = require('../middleware/auth');
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

// Registrar pago
router.post('/', authMiddleware, upload.single('comprobante'), pagoDetalleController.registrarPago);
// Consultar pagos por mensualidad
router.get('/:id_mensualidad', authMiddleware, pagoDetalleController.getPagosPorMensualidad);

module.exports = router;
