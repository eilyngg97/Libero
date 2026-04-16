const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const landingConfigController = require('../controllers/landingConfigController');
const { authMiddleware, rolMiddleware } = require('../middleware/auth');

const router = express.Router();

function resolveTenantId(req) {
  return String(req.tenantId || process.env.DEFAULT_TENANT_ID || 'villasport')
    .trim()
    .toLowerCase();
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tenantId = resolveTenantId(req);
    const landingUploadDir = path.join(__dirname, '..', 'uploads', tenantId, 'landing-atletas');
    fs.mkdirSync(landingUploadDir, { recursive: true });
    cb(null, landingUploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, name);
  }
});

const fileFilter = (req, file, cb) => {
  if ((file.mimetype || '').startsWith('image/')) {
    cb(null, true);
    return;
  }
  cb(new Error('Solo se permiten imagenes.'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 8 * 1024 * 1024 }
});

router.get('/atletas-fotos', landingConfigController.getFotosAtletasPublic);
router.get('/atletas-fotos/admin', authMiddleware, rolMiddleware('admin'), landingConfigController.getFotosAtletasAdmin);
router.patch('/atletas-fotos/reordenar', authMiddleware, rolMiddleware('admin'), landingConfigController.reordenarFotosAtletas);
router.post('/atletas-fotos', authMiddleware, rolMiddleware('admin'), upload.single('foto'), landingConfigController.crearFotoAtleta);
router.patch('/atletas-fotos/:id', authMiddleware, rolMiddleware('admin'), upload.single('foto'), landingConfigController.actualizarFotoAtleta);
router.delete('/atletas-fotos/:id', authMiddleware, rolMiddleware('admin'), landingConfigController.eliminarFotoAtleta);

module.exports = router;
