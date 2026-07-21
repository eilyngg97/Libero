const Uniforme = require('../models/Uniforme');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');

async function getTenantUniformeModel(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);
  return getTenantModel(connection, 'Uniforme');
}

function buildUploadUrl(req, file) {
  if (!file || !file.filename) return null;
  const tenantId = resolveRequestTenantId(req);
  return `/uploads/${tenantId}/uniformes/${file.filename}`;
}

function parseFotosExistentes(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') return [];

  if (Array.isArray(rawValue)) {
    return rawValue.filter((value) => typeof value === 'string' && value.trim());
  }

  if (typeof rawValue === 'string') {
    try {
      const parsed = JSON.parse(rawValue);
      return Array.isArray(parsed)
        ? parsed.filter((value) => typeof value === 'string' && value.trim())
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

function parseBooleanField(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'si' || normalized === 'sí') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === '') return false;
  }
  return Boolean(value);
}

function normalizeMoneda(value) {
  return String(value || 'USD').trim().toUpperCase();
}

function parseJsonArrayField(rawValue) {
  if (rawValue === undefined || rawValue === null || rawValue === '') return [];
  if (Array.isArray(rawValue)) return rawValue;
  if (typeof rawValue === 'string') {
    try {
      const parsed = JSON.parse(rawValue);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeGeneros(rawGeneros = []) {
  const allowed = new Set(['masculino', 'femenino', 'mixto']);
  return Array.from(new Set(
    rawGeneros
      .map((item) => String(item || '').trim().toLowerCase())
      .filter((item) => allowed.has(item))
  ));
}

function normalizeTallas(rawTallas = []) {
  return Array.from(new Set(
    rawTallas
      .map((item) => String(item || '').trim().toUpperCase())
      .filter(Boolean)
  ));
}

function parseVariantesPrecio(payload = {}) {
  const variantesPrecioActivo = parseBooleanField(payload.variantes_precio_activo);
  const variantesGeneros = normalizeGeneros(parseJsonArrayField(payload.variantes_generos));
  const variantesTallas = normalizeTallas(parseJsonArrayField(payload.variantes_tallas));
  const preciosRaw = parseJsonArrayField(payload.precios_variantes);

  const preciosVariantes = preciosRaw
    .map((item) => {
      const genero = String(item?.genero || '').trim().toLowerCase();
      const talla = String(item?.talla || '').trim().toUpperCase();
      const precio = Number(item?.precio);
      return { genero, talla, precio };
    })
    .filter((item) => item.genero && item.talla && Number.isFinite(item.precio) && item.precio >= 0);

  const preciosSinDuplicados = Array.from(
    new Map(preciosVariantes.map((item) => [`${item.genero}::${item.talla}`, item])).values()
  );

  if (variantesPrecioActivo && (variantesGeneros.length === 0 || variantesTallas.length === 0)) {
    throw new Error('Debes seleccionar al menos un genero y una talla para activar variantes de precio.');
  }

  return {
    variantes_precio_activo: variantesPrecioActivo,
    variantes_generos: variantesGeneros,
    variantes_tallas: variantesTallas,
    precios_variantes: variantesPrecioActivo ? preciosSinDuplicados : []
  };
}

exports.getUniformes = async (req, res) => {
  try {
    const TenantUniforme = await getTenantUniformeModel(req);
    const uniformes = await TenantUniforme.find();
    res.json(uniformes);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener uniformes' });
  }
};

exports.createUniforme = async (req, res) => {
  try {
    const TenantUniforme = await getTenantUniformeModel(req);
    const {
      prenda,
      precio,
      moneda,
      lleva_nombre_atleta,
      lleva_personalizacion_nombre,
      lleva_numero_franela,
      franela_representante
    } = req.body;
    const precioNumerico = Number(precio);
    if (!Number.isFinite(precioNumerico) || precioNumerico < 0) {
      return res.status(400).json({ error: 'Precio invalido para la prenda.' });
    }
    const monedaNormalizada = normalizeMoneda(moneda);
    if (!['USD', 'EUR'].includes(monedaNormalizada)) {
      return res.status(400).json({ error: 'Moneda invalida. Debe ser USD o EUR.' });
    }
    const fotosNuevas = Array.isArray(req.files) ? req.files.map((file) => buildUploadUrl(req, file)).filter(Boolean) : [];
    const variantesPrecio = parseVariantesPrecio(req.body || {});

    if (fotosNuevas.length > 2) {
      return res.status(400).json({ error: 'Solo se permiten hasta 2 fotos por prenda.' });
    }

    const uniforme = new TenantUniforme({
      prenda,
      precio: precioNumerico,
      moneda: monedaNormalizada,
      lleva_nombre_atleta: parseBooleanField(lleva_nombre_atleta),
      lleva_personalizacion_nombre: parseBooleanField(lleva_personalizacion_nombre),
      lleva_numero_franela: parseBooleanField(lleva_numero_franela),
      franela_representante: parseBooleanField(franela_representante),
      ...variantesPrecio,
      fotos: fotosNuevas
    });
    await uniforme.save();
    res.status(201).json(uniforme);
  } catch (err) {
    res.status(400).json({ error: 'Error al crear uniforme' });
  }
};

exports.updateUniforme = async (req, res) => {
  try {
    const TenantUniforme = await getTenantUniformeModel(req);
    const { id } = req.params;
    const {
      prenda,
      precio,
      moneda,
      lleva_nombre_atleta,
      lleva_personalizacion_nombre,
      lleva_numero_franela,
      franela_representante
    } = req.body;
    const precioNumerico = Number(precio);
    if (!Number.isFinite(precioNumerico) || precioNumerico < 0) {
      return res.status(400).json({ error: 'Precio invalido para la prenda.' });
    }
    const monedaNormalizada = normalizeMoneda(moneda);
    if (!['USD', 'EUR'].includes(monedaNormalizada)) {
      return res.status(400).json({ error: 'Moneda invalida. Debe ser USD o EUR.' });
    }
    const fotosExistentes = parseFotosExistentes(req.body?.fotos_existentes);
    const fotosNuevas = Array.isArray(req.files) ? req.files.map((file) => buildUploadUrl(req, file)).filter(Boolean) : [];
    const fotos = [...fotosExistentes, ...fotosNuevas].slice(0, 2);
    const variantesPrecio = parseVariantesPrecio(req.body || {});

    if (fotosExistentes.length + fotosNuevas.length > 2) {
      return res.status(400).json({ error: 'Solo se permiten hasta 2 fotos por prenda.' });
    }

    const uniforme = await TenantUniforme.findByIdAndUpdate(
      id,
      {
        prenda,
        precio: precioNumerico,
        moneda: monedaNormalizada,
        lleva_nombre_atleta: parseBooleanField(lleva_nombre_atleta),
        lleva_personalizacion_nombre: parseBooleanField(lleva_personalizacion_nombre),
        lleva_numero_franela: parseBooleanField(lleva_numero_franela),
        franela_representante: parseBooleanField(franela_representante),
        ...variantesPrecio,
        fotos
      },
      { new: true }
    );
    if (!uniforme) return res.status(404).json({ error: 'Uniforme no encontrado' });

    res.json(uniforme);
  } catch (err) {
    res.status(400).json({ error: 'Error al actualizar uniforme' });
  }
};

exports.deleteUniforme = async (req, res) => {
  try {
    const TenantUniforme = await getTenantUniformeModel(req);
    const { id } = req.params;
    const uniforme = await TenantUniforme.findByIdAndDelete(id);
    if (!uniforme) return res.status(404).json({ error: 'Uniforme no encontrado' });
    res.json({ message: 'Uniforme eliminado' });
  } catch (err) {
    res.status(400).json({ error: 'Error al eliminar uniforme' });
  }
};
