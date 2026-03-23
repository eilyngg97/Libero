const express = require('express');
const multer = require('multer');
const conciliacionController = require('../controllers/conciliacionController');
const { authMiddleware, rolMiddleware } = require('../middleware/auth');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

router.post(
  '/previsualizar',
  authMiddleware,
  rolMiddleware('admin'),
  upload.single('archivo'),
  conciliacionController.previsualizarConciliacion
);

router.post(
  '/confirmar-match-total',
  authMiddleware,
  rolMiddleware('admin'),
  conciliacionController.confirmarMatchTotal
);

module.exports = router;
