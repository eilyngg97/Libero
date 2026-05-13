const fs = require('fs');
const path = require('path');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');

async function getTenantRecaudoModel(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);
  return getTenantModel(connection, 'Recaudo');
}

function sanitizeTitulo(value = '') {
  return String(value || '').trim();
}

function getFileAbsolutePathFromUploadUrl(archivoUrl = '') {
  const cleanUrl = String(archivoUrl || '').trim();
  if (!cleanUrl.startsWith('/uploads/')) return null;

  const relativePart = cleanUrl.replace(/^\/uploads\//, '');
  return path.join(__dirname, '..', 'uploads', relativePart);
}

exports.listarRecaudos = async (req, res) => {
  try {
    const TenantRecaudo = await getTenantRecaudoModel(req);
    const recaudos = await TenantRecaudo.find().sort({ createdAt: -1 });
    return res.json(recaudos);
  } catch (err) {
    return res.status(500).json({ error: 'Error al obtener recaudos' });
  }
};

exports.crearRecaudo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Debe adjuntar un archivo' });
    }

    const tituloInput = sanitizeTitulo(req.body?.titulo);
    const tituloFinal = tituloInput || req.file.originalname;

    if (!tituloFinal) {
      return res.status(400).json({ error: 'El titulo es obligatorio' });
    }

    const TenantRecaudo = await getTenantRecaudoModel(req);
    const recaudo = new TenantRecaudo({
      titulo: tituloFinal,
      descripcion: String(req.body?.descripcion || '').trim(),
      archivo_url: req.file.publicUrl,
      nombre_archivo: req.file.originalname || req.file.filename,
      tipo_mime: req.file.mimetype || '',
      tamano_bytes: Number(req.file.size || 0),
      created_by: req.user?.id || null
    });

    await recaudo.save();
    return res.status(201).json(recaudo);
  } catch (err) {
    return res.status(500).json({ error: 'Error al crear recaudo' });
  }
};

exports.eliminarRecaudo = async (req, res) => {
  try {
    const TenantRecaudo = await getTenantRecaudoModel(req);
    const recaudo = await TenantRecaudo.findByIdAndDelete(req.params.id);

    if (!recaudo) {
      return res.status(404).json({ error: 'Recaudo no encontrado' });
    }

    const absolutePath = getFileAbsolutePathFromUploadUrl(recaudo.archivo_url);
    if (absolutePath && fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }

    return res.json({ message: 'Recaudo eliminado' });
  } catch (err) {
    return res.status(500).json({ error: 'Error al eliminar recaudo' });
  }
};