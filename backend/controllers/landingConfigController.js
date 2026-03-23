const fs = require('fs');
const path = require('path');
const LandingAtletaFoto = require('../models/LandingAtletaFoto');

const LANDING_UPLOAD_PREFIX = '/uploads/landing-atletas/';

async function eliminarArchivoSiExiste(rutaPublica) {
  if (!rutaPublica || typeof rutaPublica !== 'string') return;
  if (!rutaPublica.startsWith(LANDING_UPLOAD_PREFIX)) return;

  const rutaRelativa = rutaPublica.replace(/^\/+/, '');
  const rutaAbsoluta = path.join(__dirname, '..', rutaRelativa);

  try {
    await fs.promises.unlink(rutaAbsoluta);
  } catch (err) {
    if (err && err.code !== 'ENOENT') {
      console.warn('No se pudo eliminar archivo de landing:', rutaAbsoluta, err.message);
    }
  }
}

function normalizarLista(items) {
  return items.map((item) => ({
    _id: item._id,
    image: item.image,
    orden: item.orden,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  }));
}

exports.getFotosAtletasPublic = async (req, res) => {
  try {
    const fotos = await LandingAtletaFoto.find().sort({ orden: 1, createdAt: 1 }).lean();
    return res.json(normalizarLista(fotos));
  } catch (err) {
    return res.status(500).json({ error: 'Error al obtener fotos del landing.' });
  }
};

exports.getFotosAtletasAdmin = async (req, res) => {
  try {
    const fotos = await LandingAtletaFoto.find().sort({ orden: 1, createdAt: 1 }).lean();
    return res.json(normalizarLista(fotos));
  } catch (err) {
    return res.status(500).json({ error: 'Error al obtener fotos para configuracion.' });
  }
};

exports.crearFotoAtleta = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Debes subir una foto.' });
    }

    const ultimaFoto = await LandingAtletaFoto.findOne().sort({ orden: -1 }).select('orden').lean();
    const siguienteOrden = ultimaFoto ? Number(ultimaFoto.orden || 0) + 1 : 0;

    const nuevaFoto = new LandingAtletaFoto({
      image: `${LANDING_UPLOAD_PREFIX}${req.file.filename}`,
      orden: siguienteOrden
    });

    await nuevaFoto.save();
    return res.status(201).json({ message: 'Foto agregada con exito.', foto: nuevaFoto });
  } catch (err) {
    return res.status(500).json({ error: 'Error al guardar foto del landing.' });
  }
};

exports.actualizarFotoAtleta = async (req, res) => {
  try {
    const foto = await LandingAtletaFoto.findById(req.params.id);
    if (!foto) {
      return res.status(404).json({ error: 'Foto no encontrada.' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Debes subir una nueva foto.' });
    }

    const rutaAnterior = foto.image;
    foto.image = `${LANDING_UPLOAD_PREFIX}${req.file.filename}`;
    await foto.save();
    await eliminarArchivoSiExiste(rutaAnterior);

    return res.json({ message: 'Foto actualizada con exito.', foto });
  } catch (err) {
    return res.status(500).json({ error: 'Error al actualizar foto del landing.' });
  }
};

exports.eliminarFotoAtleta = async (req, res) => {
  try {
    const foto = await LandingAtletaFoto.findByIdAndDelete(req.params.id);
    if (!foto) {
      return res.status(404).json({ error: 'Foto no encontrada.' });
    }

    await eliminarArchivoSiExiste(foto.image);
    return res.json({ message: 'Foto eliminada con exito.' });
  } catch (err) {
    return res.status(500).json({ error: 'Error al eliminar foto del landing.' });
  }
};

exports.reordenarFotosAtletas = async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) {
      return res.status(400).json({ error: 'Debes enviar ids para reordenar.' });
    }

    const idsUnicos = [...new Set(ids.map((id) => String(id).trim()).filter(Boolean))];
    const fotos = await LandingAtletaFoto.find({ _id: { $in: idsUnicos } }).select('_id');
    if (fotos.length !== idsUnicos.length) {
      return res.status(400).json({ error: 'La lista de ids contiene elementos invalidos.' });
    }

    const operaciones = idsUnicos.map((id, index) => ({
      updateOne: {
        filter: { _id: id },
        update: { $set: { orden: index } }
      }
    }));

    await LandingAtletaFoto.bulkWrite(operaciones);
    return res.json({ message: 'Orden actualizado con exito.' });
  } catch (err) {
    return res.status(500).json({ error: 'Error al reordenar fotos del landing.' });
  }
};
