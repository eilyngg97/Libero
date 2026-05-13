const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const recaudoController = require('../controllers/recaudoController');
const { authMiddleware, rolMiddleware } = require('../middleware/auth');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');

function resolveTenantId(req) {
  return resolveRequestTenantId(req);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tenantId = resolveTenantId(req);
    const uploadDir = path.join(__dirname, '..', 'uploads', tenantId, 'recaudos');
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  }
});

const allowedMimeTypes = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (allowedMimeTypes.has(file.mimetype)) {
      cb(null, true);
      return;
    }
    cb(new Error('Formato de archivo no permitido'));
  }
});

function uploadArchivo(req, res, next) {
  upload.single('archivo')(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'El archivo supera el limite de 20MB' });
    }

    return res.status(400).json({ error: err.message || 'No se pudo procesar el archivo' });
  });
}

router.get('/', authMiddleware, rolMiddleware('admin', 'usuario'), recaudoController.listarRecaudos);

router.post(
  '/',
  authMiddleware,
  rolMiddleware('admin'),
  uploadArchivo,
  (req, res, next) => {
    if (req.file) {
      const tenantId = resolveTenantId(req);
      req.file.publicUrl = `/uploads/${tenantId}/recaudos/${req.file.filename}`;
    }
    return next();
  },
  recaudoController.crearRecaudo
);

router.delete('/:id', authMiddleware, rolMiddleware('admin'), recaudoController.eliminarRecaudo);

module.exports = router;