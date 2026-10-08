const express = require('express');
const multer = require('multer');
const conciliacionController = require('../controllers/conciliacionController');
const { authMiddleware, permisoMiddleware } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.txt'];
const ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/plain'
];

function getExtension(filename = '') {
  const lower = String(filename).toLowerCase();
  const dotIndex = lower.lastIndexOf('.');
  return dotIndex >= 0 ? lower.slice(dotIndex) : '';
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const extension = getExtension(file?.originalname);
    const mimetype = String(file?.mimetype || '').toLowerCase();
    const isAllowedExtension = ALLOWED_EXTENSIONS.includes(extension);
    const isAllowedMime = !mimetype || mimetype === 'application/octet-stream' || ALLOWED_MIME_TYPES.includes(mimetype);
    const isAllowed = isAllowedExtension && isAllowedMime;

    if (!isAllowed) {
      return cb(new Error('Formato no permitido. Usa .xlsx, .xls o .txt'));
    }

    return cb(null, true);
  }
});

router.post(
  '/previsualizar',
  authMiddleware,
  permisoMiddleware('conciliacion.manage'),
  upload.single('archivo'),
  conciliacionController.previsualizarConciliacion
);

router.post(
  '/confirmar-match-total',
  authMiddleware,
  permisoMiddleware('conciliacion.manage'),
  conciliacionController.confirmarMatchTotal
);

router.post(
  '/pagos-agrupados/:id/rechazar',
  authMiddleware,
  permisoMiddleware('conciliacion.manage'),
  conciliacionController.rechazarPagoAgrupado
);

module.exports = router;
