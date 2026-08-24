const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const egresoController = require('../controllers/egresoController');
const { authMiddleware, permisoMiddleware } = require('../middleware/auth');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');

function resolveTenantId(req) {
  return resolveRequestTenantId(req);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tenantId = resolveTenantId(req);
    const uploadDir = path.join(__dirname, '..', 'uploads', tenantId, 'egresos', 'comprobantes');
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

function uploadComprobante(req, res, next) {
  upload.single('comprobante')(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'El archivo supera el limite de 20MB' });
    }

    return res.status(400).json({ error: err.message || 'No se pudo procesar el archivo' });
  });
}

function attachPublicUrl(req, res, next) {
  if (req.file) {
    const tenantId = resolveTenantId(req);
    req.file.publicUrl = `/uploads/${tenantId}/egresos/comprobantes/${req.file.filename}`;
  }
  return next();
}

router.get('/categorias', authMiddleware, permisoMiddleware('egresos.view'), egresoController.listarCategorias);
router.post('/categorias', authMiddleware, permisoMiddleware('egresos.manage'), egresoController.crearCategoria);
router.post('/categorias/:categoriaId/subcategorias', authMiddleware, permisoMiddleware('egresos.manage'), egresoController.crearSubcategoria);
router.patch('/categorias/:id', authMiddleware, permisoMiddleware('egresos.manage'), egresoController.actualizarCategoria);
router.patch('/subcategorias/:id', authMiddleware, permisoMiddleware('egresos.manage'), egresoController.actualizarCategoria);
router.delete('/categorias/:id', authMiddleware, permisoMiddleware('egresos.manage'), egresoController.eliminarCategoria);
router.delete('/subcategorias/:id', authMiddleware, permisoMiddleware('egresos.manage'), egresoController.eliminarCategoria);

router.get('/', authMiddleware, permisoMiddleware('egresos.view'), egresoController.listarEgresos);
router.post('/', authMiddleware, permisoMiddleware('egresos.manage'), uploadComprobante, attachPublicUrl, egresoController.crearEgreso);
router.patch('/:id', authMiddleware, permisoMiddleware('egresos.manage'), egresoController.actualizarEgreso);
router.patch('/:id/estado', authMiddleware, permisoMiddleware('egresos.approve'), egresoController.actualizarEstadoEgreso);
router.post('/:id/comprobante', authMiddleware, permisoMiddleware('egresos.manage'), uploadComprobante, attachPublicUrl, egresoController.subirComprobanteEgreso);
router.delete('/:id', authMiddleware, permisoMiddleware('egresos.manage'), egresoController.eliminarEgreso);

module.exports = router;
