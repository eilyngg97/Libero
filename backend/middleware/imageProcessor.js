const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Middleware para comprimir/redimensionar imágenes subidas
// Opciones: maxWidth, maxHeight, quality (0-100)
function imageProcessor(options = {}) {
  const {
    fieldName = 'fotos',
    maxWidth = 1280,
    maxHeight = 1280,
    quality = 78 // calidad webp
  } = options;

  return async (req, res, next) => {
    if (!req.files || !Array.isArray(req.files)) return next();

    const processedFiles = [];

    for (const file of req.files) {
      const mime = String(file?.mimetype || '').toLowerCase();
      if (file?.fieldname !== fieldName || !mime.startsWith('image/')) {
        processedFiles.push(file);
        continue;
      }

      try {
        const inputPath = file.path;
        const parsed = path.parse(inputPath);
        const outputPath = path.join(parsed.dir, `${parsed.name}.webp`);

        await sharp(inputPath)
          .resize({ width: maxWidth, height: maxHeight, fit: 'inside', withoutEnlargement: true })
          .webp({ quality })
          .toFile(outputPath);

        // Actualiza el objeto file para que apunte al nuevo archivo optimizado.
        file.path = outputPath;
        file.filename = path.basename(outputPath);
        file.mimetype = 'image/webp';

        // Elimina el archivo original solo si cambió el nombre/salida.
        // Si falla (p. ej. lock temporal en Windows), no se revierte la optimización.
        if (outputPath !== inputPath && fs.existsSync(inputPath)) {
          fs.promises.unlink(inputPath).catch(() => {});
        }

        processedFiles.push(file);
      } catch (_err) {
        // Si falla, deja el archivo original
        processedFiles.push(file);
      }
    }

    req.files = processedFiles;
    next();
  };
}

module.exports = imageProcessor;
