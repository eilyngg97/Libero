const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');

const DEFAULT_CATALOG = [
  {
    nombre: 'Material deportivo',
    codigo: 'ED',
    descripcion: 'Gastos de balones, implementos y equipamiento deportivo.',
    icono: 'sports',
    color_acento: '#10b981',
    subcategorias: ['Balones', 'Conos y mallas', 'Uniformes internos']
  },
  {
    nombre: 'Instalaciones',
    codigo: 'INS',
    descripcion: 'Gastos asociados a espacios, alquiler y mantenimiento.',
    icono: 'instalaciones',
    color_acento: '#3b82f6',
    subcategorias: ['Alquiler', 'Mantenimiento', 'Servicios basicos']
  },
  {
    nombre: 'Servicios',
    codigo: 'SRV',
    descripcion: 'Pagos a proveedores y servicios profesionales.',
    icono: 'servicios',
    color_acento: '#6366f1',
    subcategorias: ['Honorarios', 'Asesorias', 'Soporte tecnico']
  },
  {
    nombre: 'Marketing',
    codigo: 'MKT',
    descripcion: 'Promocion, diseño y eventos de visibilidad.',
    icono: 'marketing',
    color_acento: '#ec4899',
    subcategorias: ['Publicidad', 'Diseño', 'Eventos']
  },
  {
    nombre: 'Varios',
    codigo: 'VAR',
    descripcion: 'Gastos no clasificados en otras categorias.',
    icono: 'varios',
    color_acento: '#6b7280',
    subcategorias: ['No clasificado']
  }
];

async function getTenantEgresoModels(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);

  return {
    Egreso: getTenantModel(connection, 'Egreso'),
    EgresoCategoria: getTenantModel(connection, 'EgresoCategoria'),
    Sede: getTenantModel(connection, 'Sede')
  };
}

function normalizeName(value = '') {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseDate(value) {
  if (!value) return null;

  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const parsedDateOnly = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    return Number.isNaN(parsedDateOnly.getTime()) ? null : parsedDateOnly;
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toOptionalObjectId(value) {
  const id = String(value || '').trim();
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
  return new mongoose.Types.ObjectId(id);
}

function normalizeColorAcento(value, fallback = '#4f46e5') {
  const color = String(value || '').trim();
  if (!color) return fallback;
  const validHex = /^#([0-9a-fA-F]{6})$/.test(color);
  return validHex ? color.toLowerCase() : fallback;
}

function normalizeIcono(value, fallback = 'category') {
  const icono = String(value || '').trim().toLowerCase();
  return icono || fallback;
}

function getFileAbsolutePathFromUploadUrl(archivoUrl = '') {
  const cleanUrl = String(archivoUrl || '').trim();
  if (!cleanUrl.startsWith('/uploads/')) return null;

  const relativePart = cleanUrl.replace(/^\/uploads\//, '');
  return path.join(__dirname, '..', 'uploads', relativePart);
}

async function ensureDefaultCatalog(EgresoCategoria, actorId = null) {
  const totalCategorias = await EgresoCategoria.countDocuments({ tipo: 'categoria' });
  if (totalCategorias > 0) return;

  for (let index = 0; index < DEFAULT_CATALOG.length; index += 1) {
    const item = DEFAULT_CATALOG[index];
    const categoria = await EgresoCategoria.create({
      nombre: item.nombre,
      nombre_normalizado: normalizeName(item.nombre),
      tipo: 'categoria',
      parent_id: null,
      codigo: item.codigo,
      descripcion: String(item.descripcion || '').trim(),
      icono: normalizeIcono(item.icono, 'category'),
      color_acento: normalizeColorAcento(item.color_acento, '#4f46e5'),
      activo: true,
      es_sugerida: true,
      orden: index,
      created_by: actorId,
      updated_by: actorId
    });

    for (let subIndex = 0; subIndex < item.subcategorias.length; subIndex += 1) {
      const subNombre = item.subcategorias[subIndex];
      await EgresoCategoria.create({
        nombre: subNombre,
        nombre_normalizado: normalizeName(subNombre),
        tipo: 'subcategoria',
        parent_id: categoria._id,
        codigo: `${item.codigo}-${String(subIndex + 1).padStart(2, '0')}`,
        descripcion: '',
        icono: normalizeIcono(item.icono, 'category'),
        color_acento: normalizeColorAcento(item.color_acento, '#4f46e5'),
        activo: true,
        es_sugerida: true,
        orden: subIndex,
        created_by: actorId,
        updated_by: actorId
      });
    }
  }
}

function buildCategoryTree(items = []) {
  const categorias = items
    .filter((item) => item.tipo === 'categoria')
    .map((item) => ({
      _id: item._id,
      nombre: item.nombre,
      codigo: item.codigo,
      descripcion: item.descripcion || '',
      icono: item.icono || 'category',
      color_acento: item.color_acento || '#4f46e5',
      activo: item.activo,
      es_sugerida: item.es_sugerida,
      orden: item.orden,
      subcategorias: []
    }));

  const categoriaMap = new Map(categorias.map((cat) => [String(cat._id), cat]));

  items
    .filter((item) => item.tipo === 'subcategoria')
    .forEach((sub) => {
      const parent = categoriaMap.get(String(sub.parent_id || ''));
      if (!parent) return;
      parent.subcategorias.push({
        _id: sub._id,
        nombre: sub.nombre,
        codigo: sub.codigo,
        descripcion: sub.descripcion || '',
        icono: sub.icono || 'category',
        color_acento: sub.color_acento || '#4f46e5',
        activo: sub.activo,
        es_sugerida: sub.es_sugerida,
        orden: sub.orden,
        parent_id: sub.parent_id
      });
    });

  categorias.forEach((categoria) => {
    categoria.subcategorias.sort((a, b) => {
      if (a.orden !== b.orden) return a.orden - b.orden;
      return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
    });
  });

  categorias.sort((a, b) => {
    if (a.orden !== b.orden) return a.orden - b.orden;
    return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', { sensitivity: 'base' });
  });

  return categorias;
}

async function findCategoriaActiva(EgresoCategoria, categoriaId) {
  if (!mongoose.Types.ObjectId.isValid(categoriaId)) return null;
  return EgresoCategoria.findOne({ _id: categoriaId, tipo: 'categoria', activo: true });
}

async function findSubcategoriaActiva(EgresoCategoria, subcategoriaId) {
  if (!mongoose.Types.ObjectId.isValid(subcategoriaId)) return null;
  return EgresoCategoria.findOne({ _id: subcategoriaId, tipo: 'subcategoria', activo: true });
}

exports.listarCategorias = async (req, res) => {
  try {
    const { EgresoCategoria } = await getTenantEgresoModels(req);
    const actorId = toOptionalObjectId(req.user?.id);
    await ensureDefaultCatalog(EgresoCategoria, actorId);

    const includeInactive = String(req.query.include_inactive || 'false').toLowerCase() === 'true';
    const query = includeInactive ? {} : { activo: true };

    const categorias = await EgresoCategoria.find(query)
      .select('_id nombre tipo parent_id codigo descripcion icono color_acento activo es_sugerida orden')
      .sort({ tipo: 1, orden: 1, nombre: 1 })
      .lean();

    return res.json({ categorias: buildCategoryTree(categorias) });
  } catch (err) {
    return res.status(500).json({ error: 'Error al listar categorias de egresos' });
  }
};

exports.crearCategoria = async (req, res) => {
  try {
    const { EgresoCategoria } = await getTenantEgresoModels(req);
    const actorId = toOptionalObjectId(req.user?.id);
    await ensureDefaultCatalog(EgresoCategoria, actorId);

    const nombre = String(req.body?.nombre || '').trim();
    const codigo = String(req.body?.codigo || '').trim();
    const descripcion = String(req.body?.descripcion || '').trim();
    const icono = normalizeIcono(req.body?.icono, 'category');
    const colorAcento = normalizeColorAcento(req.body?.color_acento, '#4f46e5');

    if (!nombre) {
      return res.status(400).json({ error: 'El nombre de la categoria es obligatorio' });
    }

    const nombreNormalizado = normalizeName(nombre);
    const duplicada = await EgresoCategoria.findOne({
      tipo: 'categoria',
      parent_id: null,
      nombre_normalizado: nombreNormalizado
    }).lean();

    if (duplicada) {
      return res.status(409).json({ error: 'Ya existe una categoria con ese nombre' });
    }

    const totalCategorias = await EgresoCategoria.countDocuments({ tipo: 'categoria' });
    const categoria = await EgresoCategoria.create({
      nombre,
      nombre_normalizado: nombreNormalizado,
      tipo: 'categoria',
      parent_id: null,
      codigo,
      descripcion,
      icono,
      color_acento: colorAcento,
      activo: true,
      es_sugerida: false,
      orden: totalCategorias,
      created_by: actorId,
      updated_by: actorId
    });

    return res.status(201).json(categoria);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'No se pudo crear categoria: ya existe un registro similar' });
    }
    return res.status(500).json({ error: 'Error al crear categoria' });
  }
};

exports.crearSubcategoria = async (req, res) => {
  try {
    const { EgresoCategoria } = await getTenantEgresoModels(req);
    const actorId = toOptionalObjectId(req.user?.id);
    await ensureDefaultCatalog(EgresoCategoria, actorId);

    const categoriaId = String(req.params?.categoriaId || '').trim();
    const nombre = String(req.body?.nombre || '').trim();
    const codigo = String(req.body?.codigo || '').trim();
    const descripcion = String(req.body?.descripcion || '').trim();
    const icono = normalizeIcono(req.body?.icono, 'category');
    const colorAcento = normalizeColorAcento(req.body?.color_acento, '#4f46e5');

    if (!nombre) {
      return res.status(400).json({ error: 'El nombre de la subcategoria es obligatorio' });
    }

    const categoria = await findCategoriaActiva(EgresoCategoria, categoriaId);
    if (!categoria) {
      return res.status(404).json({ error: 'Categoria no encontrada o inactiva' });
    }

    const nombreNormalizado = normalizeName(nombre);
    const duplicada = await EgresoCategoria.findOne({
      tipo: 'subcategoria',
      parent_id: categoria._id,
      nombre_normalizado: nombreNormalizado
    }).lean();

    if (duplicada) {
      return res.status(409).json({ error: 'Ya existe una subcategoria con ese nombre en la categoria seleccionada' });
    }

    const totalSubcategorias = await EgresoCategoria.countDocuments({ tipo: 'subcategoria', parent_id: categoria._id });
    const subcategoria = await EgresoCategoria.create({
      nombre,
      nombre_normalizado: nombreNormalizado,
      tipo: 'subcategoria',
      parent_id: categoria._id,
      codigo,
      descripcion,
      icono,
      color_acento: colorAcento,
      activo: true,
      es_sugerida: false,
      orden: totalSubcategorias,
      created_by: actorId,
      updated_by: actorId
    });

    return res.status(201).json(subcategoria);
  } catch (err) {
    console.error('[egresos] crearSubcategoria fallo', {
      message: err?.message,
      name: err?.name,
      code: err?.code,
      categoriaId: req.params?.categoriaId,
      userId: req.user?.id
    });
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'No se pudo crear subcategoria: ya existe un registro similar' });
    }
    return res.status(500).json({ error: 'Error al crear subcategoria' });
  }
};

exports.actualizarCategoria = async (req, res) => {
  try {
    const { EgresoCategoria } = await getTenantEgresoModels(req);
    const actorId = toOptionalObjectId(req.user?.id);
    const categoriaId = String(req.params?.id || '').trim();

    if (!mongoose.Types.ObjectId.isValid(categoriaId)) {
      return res.status(400).json({ error: 'ID de categoria invalido' });
    }

    const categoria = await EgresoCategoria.findById(categoriaId);
    if (!categoria) {
      return res.status(404).json({ error: 'Categoria no encontrada' });
    }

    const payload = {};

    if (req.body?.nombre !== undefined) {
      const nombre = String(req.body.nombre || '').trim();
      if (!nombre) return res.status(400).json({ error: 'El nombre no puede estar vacio' });

      const nombreNormalizado = normalizeName(nombre);
      const duplicateQuery = {
        _id: { $ne: categoria._id },
        tipo: categoria.tipo,
        parent_id: categoria.parent_id || null,
        nombre_normalizado: nombreNormalizado
      };
      const duplicada = await EgresoCategoria.findOne(duplicateQuery).lean();
      if (duplicada) {
        return res.status(409).json({ error: 'Ya existe otra categoria con ese nombre' });
      }

      payload.nombre = nombre;
      payload.nombre_normalizado = nombreNormalizado;
    }

    if (req.body?.codigo !== undefined) payload.codigo = String(req.body.codigo || '').trim();
    if (req.body?.descripcion !== undefined) payload.descripcion = String(req.body.descripcion || '').trim();
    if (req.body?.icono !== undefined) payload.icono = normalizeIcono(req.body.icono, categoria.icono || 'category');
    if (req.body?.color_acento !== undefined) payload.color_acento = normalizeColorAcento(req.body.color_acento, categoria.color_acento || '#4f46e5');
    if (req.body?.activo !== undefined) payload.activo = Boolean(req.body.activo);
    if (req.body?.orden !== undefined) payload.orden = Number(req.body.orden) || 0;
    payload.updated_by = actorId;

    const updated = await EgresoCategoria.findByIdAndUpdate(categoria._id, { $set: payload }, { new: true });
    return res.json(updated);
  } catch (err) {
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'No se pudo actualizar: ya existe un registro similar' });
    }
    return res.status(500).json({ error: 'Error al actualizar categoria' });
  }
};

exports.eliminarCategoria = async (req, res) => {
  try {
    const { EgresoCategoria } = await getTenantEgresoModels(req);
    const actorId = toOptionalObjectId(req.user?.id);
    const categoriaId = String(req.params?.id || '').trim();

    if (!mongoose.Types.ObjectId.isValid(categoriaId)) {
      return res.status(400).json({ error: 'ID de categoria invalido' });
    }

    const categoria = await EgresoCategoria.findById(categoriaId);
    if (!categoria) {
      return res.status(404).json({ error: 'Categoria no encontrada' });
    }

    if (categoria.tipo === 'categoria') {
      await Promise.all([
        EgresoCategoria.updateOne(
          { _id: categoria._id },
          { $set: { activo: false, updated_by: actorId } }
        ),
        EgresoCategoria.updateMany(
          { parent_id: categoria._id },
          { $set: { activo: false, updated_by: actorId } }
        )
      ]);

      return res.json({ ok: true, tipo: 'categoria', id: categoriaId });
    }

    await EgresoCategoria.updateOne(
      { _id: categoria._id },
      { $set: { activo: false, updated_by: actorId } }
    );

    return res.json({ ok: true, tipo: 'subcategoria', id: categoriaId });
  } catch (err) {
    return res.status(500).json({ error: 'Error al eliminar categoria' });
  }
};

exports.listarEgresos = async (req, res) => {
  try {
    const { Egreso } = await getTenantEgresoModels(req);

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const query = { deleted_at: null };

    const estado = String(req.query.estado || '').trim();
    if (estado) query.estado = estado;

    const categoriaId = String(req.query.categoria_id || '').trim();
    if (categoriaId && mongoose.Types.ObjectId.isValid(categoriaId)) {
      query.categoria_id = categoriaId;
    }

    const subcategoriaId = String(req.query.subcategoria_id || '').trim();
    if (subcategoriaId && mongoose.Types.ObjectId.isValid(subcategoriaId)) {
      query.subcategoria_id = subcategoriaId;
    }

    const sedeId = String(req.query.sede || '').trim();
    if (sedeId && mongoose.Types.ObjectId.isValid(sedeId)) {
      query.sede = sedeId;
    }

    const proveedor = String(req.query.proveedor || '').trim();
    if (proveedor) {
      query.proveedor = { $regex: proveedor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    }

    const fechaDesde = parseDate(req.query.fecha_desde);
    const fechaHasta = parseDate(req.query.fecha_hasta);
    if (fechaDesde || fechaHasta) {
      query.fecha_emision = {};
      if (fechaDesde) query.fecha_emision.$gte = fechaDesde;
      if (fechaHasta) query.fecha_emision.$lte = fechaHasta;
    }

    const [items, total] = await Promise.all([
      Egreso.find(query)
        .populate('categoria_id', 'nombre codigo tipo icono color_acento descripcion')
        .populate('subcategoria_id', 'nombre codigo tipo parent_id icono color_acento descripcion')
        .populate('sede', 'nombre')
        .sort({ fecha_emision: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Egreso.countDocuments(query)
    ]);

    return res.json({
      page,
      limit,
      total,
      total_pages: Math.max(1, Math.ceil(total / limit)),
      items
    });
  } catch (err) {
    return res.status(500).json({ error: 'Error al listar egresos' });
  }
};

exports.crearEgreso = async (req, res) => {
  try {
    const { Egreso, EgresoCategoria, Sede } = await getTenantEgresoModels(req);
    const actorId = toOptionalObjectId(req.user?.id);
    await ensureDefaultCatalog(EgresoCategoria, actorId);

    const fechaEmision = parseDate(req.body?.fecha_emision);
    const fechaPago = parseDate(req.body?.fecha_pago);
    const monto = Number(req.body?.monto);
    const moneda = String(req.body?.moneda || 'USD').trim().toUpperCase();
    const categoriaId = String(req.body?.categoria_id || '').trim();
    const subcategoriaId = String(req.body?.subcategoria_id || '').trim();
    const metodoPago = String(req.body?.metodo_pago || '').trim();
    const proveedor = String(req.body?.proveedor || '').trim();
    const estado = String(req.body?.estado || 'Pendiente').trim();
    const observaciones = String(req.body?.observaciones || '').trim();
    const tasaReferencia = req.body?.tasa_referencia === undefined || req.body?.tasa_referencia === ''
      ? null
      : Number(req.body?.tasa_referencia);
    const sede = String(req.body?.sede || '').trim();

    if (!fechaEmision) return res.status(400).json({ error: 'fecha_emision es obligatoria y debe ser valida' });
    if (!Number.isFinite(monto) || monto <= 0) return res.status(400).json({ error: 'monto invalido' });
    if (!['USD', 'EUR', 'VES'].includes(moneda)) return res.status(400).json({ error: 'moneda invalida (USD, EUR o VES)' });
    if (!metodoPago) return res.status(400).json({ error: 'metodo_pago es obligatorio' });
    if (!['Pendiente', 'Pagado'].includes(estado)) return res.status(400).json({ error: 'estado invalido' });

    if (estado === 'Pagado' && !fechaPago) {
      return res.status(400).json({ error: 'fecha_pago es obligatoria cuando el estado es Pagado' });
    }

    if (tasaReferencia !== null && (!Number.isFinite(tasaReferencia) || tasaReferencia <= 0)) {
      return res.status(400).json({ error: 'tasa_referencia invalida' });
    }

    const categoria = await findCategoriaActiva(EgresoCategoria, categoriaId);
    if (!categoria) return res.status(400).json({ error: 'categoria_id invalida o inactiva' });

    const subcategoria = await findSubcategoriaActiva(EgresoCategoria, subcategoriaId);
    if (!subcategoria) return res.status(400).json({ error: 'subcategoria_id invalida o inactiva' });

    if (String(subcategoria.parent_id || '') !== String(categoria._id)) {
      return res.status(400).json({ error: 'La subcategoria no pertenece a la categoria seleccionada' });
    }

    let sedeFinal = null;
    if (sede) {
      if (!mongoose.Types.ObjectId.isValid(sede)) {
        return res.status(400).json({ error: 'sede invalida' });
      }
      const sedeDoc = await Sede.findById(sede).select('_id').lean();
      if (!sedeDoc) return res.status(404).json({ error: 'sede no encontrada' });
      sedeFinal = sedeDoc._id;
    }

    const egreso = new Egreso({
      fecha_emision: fechaEmision,
      fecha_pago: fechaPago,
      monto,
      moneda,
      tasa_referencia: tasaReferencia,
      categoria_id: categoria._id,
      subcategoria_id: subcategoria._id,
      metodo_pago: metodoPago,
      proveedor,
      estado,
      motivo_rechazo: '',
      observaciones,
      sede: sedeFinal,
      created_by: actorId,
      updated_by: actorId,
      aprobado_por: estado === 'Pagado' ? actorId : null,
      historial_estado: [{
        estado_anterior: '',
        estado_nuevo: estado,
        motivo: '',
        usuario_id: actorId,
        usuario_nombre: req.user?.nombre || req.user?.email || '',
        fecha: new Date()
      }]
    });

    if (req.file) {
      egreso.comprobante_url = req.file.publicUrl || '';
      egreso.comprobante_nombre = req.file.originalname || req.file.filename || '';
      egreso.comprobante_mime = req.file.mimetype || '';
      egreso.comprobante_tamano_bytes = Number(req.file.size || 0);
    }

    await egreso.save();
    const saved = await Egreso.findById(egreso._id)
      .populate('categoria_id', 'nombre codigo tipo icono color_acento descripcion')
      .populate('subcategoria_id', 'nombre codigo tipo parent_id icono color_acento descripcion')
      .populate('sede', 'nombre')
      .lean();

    return res.status(201).json(saved);
  } catch (err) {
    return res.status(500).json({ error: 'Error al crear egreso' });
  }
};

exports.actualizarEgreso = async (req, res) => {
  try {
    const { Egreso, EgresoCategoria, Sede } = await getTenantEgresoModels(req);
    const actorId = toOptionalObjectId(req.user?.id);
    const egresoId = String(req.params?.id || '').trim();

    if (!mongoose.Types.ObjectId.isValid(egresoId)) {
      return res.status(400).json({ error: 'ID de egreso invalido' });
    }

    const egreso = await Egreso.findOne({ _id: egresoId, deleted_at: null });
    if (!egreso) {
      return res.status(404).json({ error: 'Egreso no encontrado' });
    }

    await ensureDefaultCatalog(EgresoCategoria, actorId);

    const fechaEmision = req.body?.fecha_emision !== undefined ? parseDate(req.body?.fecha_emision) : egreso.fecha_emision;
    const fechaPago = req.body?.fecha_pago !== undefined ? parseDate(req.body?.fecha_pago) : egreso.fecha_pago;
    const monto = req.body?.monto !== undefined ? Number(req.body?.monto) : Number(egreso.monto);
    const moneda = req.body?.moneda !== undefined
      ? String(req.body?.moneda || 'USD').trim().toUpperCase()
      : String(egreso.moneda || 'USD').trim().toUpperCase();
    const categoriaId = req.body?.categoria_id !== undefined
      ? String(req.body?.categoria_id || '').trim()
      : String(egreso.categoria_id || '').trim();
    const subcategoriaId = req.body?.subcategoria_id !== undefined
      ? String(req.body?.subcategoria_id || '').trim()
      : String(egreso.subcategoria_id || '').trim();
    const metodoPago = req.body?.metodo_pago !== undefined
      ? String(req.body?.metodo_pago || '').trim()
      : String(egreso.metodo_pago || '').trim();
    const proveedor = req.body?.proveedor !== undefined
      ? String(req.body?.proveedor || '').trim()
      : String(egreso.proveedor || '').trim();
    const estado = req.body?.estado !== undefined
      ? String(req.body?.estado || '').trim()
      : String(egreso.estado || 'Pendiente').trim();
    const observaciones = req.body?.observaciones !== undefined
      ? String(req.body?.observaciones || '').trim()
      : String(egreso.observaciones || '').trim();
    const tasaReferencia = req.body?.tasa_referencia !== undefined
      ? (req.body?.tasa_referencia === '' ? null : Number(req.body?.tasa_referencia))
      : egreso.tasa_referencia;
    const sedeInput = req.body?.sede !== undefined ? String(req.body?.sede || '').trim() : undefined;

    if (!fechaEmision) return res.status(400).json({ error: 'fecha_emision es obligatoria y debe ser valida' });
    if (!Number.isFinite(monto) || monto <= 0) return res.status(400).json({ error: 'monto invalido' });
    if (!['USD', 'EUR', 'VES'].includes(moneda)) return res.status(400).json({ error: 'moneda invalida (USD, EUR o VES)' });
    if (!metodoPago) return res.status(400).json({ error: 'metodo_pago es obligatorio' });
    if (!['Pendiente', 'Pagado'].includes(estado)) return res.status(400).json({ error: 'estado invalido' });

    if (estado === 'Pagado' && !fechaPago) {
      return res.status(400).json({ error: 'fecha_pago es obligatoria cuando el estado es Pagado' });
    }

    if (tasaReferencia !== null && (!Number.isFinite(tasaReferencia) || tasaReferencia <= 0)) {
      return res.status(400).json({ error: 'tasa_referencia invalida' });
    }

    const categoria = await findCategoriaActiva(EgresoCategoria, categoriaId);
    if (!categoria) return res.status(400).json({ error: 'categoria_id invalida o inactiva' });

    const subcategoria = await findSubcategoriaActiva(EgresoCategoria, subcategoriaId);
    if (!subcategoria) return res.status(400).json({ error: 'subcategoria_id invalida o inactiva' });

    if (String(subcategoria.parent_id || '') !== String(categoria._id)) {
      return res.status(400).json({ error: 'La subcategoria no pertenece a la categoria seleccionada' });
    }

    let sedeFinal = egreso.sede || null;
    if (sedeInput !== undefined) {
      if (!sedeInput) {
        sedeFinal = null;
      } else {
        if (!mongoose.Types.ObjectId.isValid(sedeInput)) {
          return res.status(400).json({ error: 'sede invalida' });
        }
        const sedeDoc = await Sede.findById(sedeInput).select('_id').lean();
        if (!sedeDoc) return res.status(404).json({ error: 'sede no encontrada' });
        sedeFinal = sedeDoc._id;
      }
    }

    const estadoAnterior = String(egreso.estado || 'Pendiente');

    egreso.fecha_emision = fechaEmision;
    egreso.fecha_pago = fechaPago || null;
    egreso.monto = monto;
    egreso.moneda = moneda;
    egreso.tasa_referencia = tasaReferencia;
    egreso.categoria_id = categoria._id;
    egreso.subcategoria_id = subcategoria._id;
    egreso.metodo_pago = metodoPago;
    egreso.proveedor = proveedor;
    egreso.estado = estado;
    egreso.motivo_rechazo = '';
    egreso.observaciones = observaciones;
    egreso.sede = sedeFinal;
    egreso.updated_by = actorId;
    egreso.aprobado_por = estado === 'Pagado' ? actorId : null;

    if (estado !== estadoAnterior) {
      egreso.historial_estado = Array.isArray(egreso.historial_estado) ? egreso.historial_estado : [];
      egreso.historial_estado.push({
        estado_anterior: estadoAnterior,
        estado_nuevo: estado,
        motivo: '',
        usuario_id: actorId,
        usuario_nombre: req.user?.nombre || req.user?.email || '',
        fecha: new Date()
      });
    }

    await egreso.save();
    const saved = await Egreso.findById(egreso._id)
      .populate('categoria_id', 'nombre codigo tipo icono color_acento descripcion')
      .populate('subcategoria_id', 'nombre codigo tipo parent_id icono color_acento descripcion')
      .populate('sede', 'nombre')
      .lean();

    return res.json(saved);
  } catch (err) {
    return res.status(500).json({ error: 'Error al actualizar egreso' });
  }
};

exports.actualizarEstadoEgreso = async (req, res) => {
  try {
    const { Egreso } = await getTenantEgresoModels(req);
    const actorId = toOptionalObjectId(req.user?.id);
    const egresoId = String(req.params?.id || '').trim();

    if (!mongoose.Types.ObjectId.isValid(egresoId)) {
      return res.status(400).json({ error: 'ID de egreso invalido' });
    }

    const estadoNuevo = String(req.body?.estado || '').trim();
    const fechaPagoNueva = parseDate(req.body?.fecha_pago);
    if (!['Pendiente', 'Pagado'].includes(estadoNuevo)) {
      return res.status(400).json({ error: 'estado invalido' });
    }

    if (estadoNuevo === 'Pagado' && !fechaPagoNueva) {
      return res.status(400).json({ error: 'fecha_pago es obligatoria cuando el estado es Pagado' });
    }

    const egreso = await Egreso.findOne({ _id: egresoId, deleted_at: null });
    if (!egreso) {
      return res.status(404).json({ error: 'Egreso no encontrado' });
    }

    const estadoAnterior = egreso.estado;
    egreso.estado = estadoNuevo;
    egreso.updated_by = actorId;

    if (estadoNuevo === 'Pagado') {
      egreso.fecha_pago = fechaPagoNueva;
      egreso.aprobado_por = actorId;
      egreso.motivo_rechazo = '';
    }

    if (estadoNuevo === 'Pendiente') {
      egreso.aprobado_por = null;
      egreso.motivo_rechazo = '';
    }

    egreso.historial_estado = Array.isArray(egreso.historial_estado) ? egreso.historial_estado : [];
    egreso.historial_estado.push({
      estado_anterior: estadoAnterior,
      estado_nuevo: estadoNuevo,
      motivo: '',
      usuario_id: actorId,
      usuario_nombre: req.user?.nombre || req.user?.email || '',
      fecha: new Date()
    });

    await egreso.save();

    const saved = await Egreso.findById(egreso._id)
      .populate('categoria_id', 'nombre codigo tipo icono color_acento descripcion')
      .populate('subcategoria_id', 'nombre codigo tipo parent_id icono color_acento descripcion')
      .populate('sede', 'nombre')
      .lean();

    return res.json(saved);
  } catch (err) {
    return res.status(500).json({ error: 'Error al actualizar estado del egreso' });
  }
};

exports.eliminarEgreso = async (req, res) => {
  try {
    const { Egreso } = await getTenantEgresoModels(req);
    const actorId = toOptionalObjectId(req.user?.id);
    const egresoId = String(req.params?.id || '').trim();

    if (!mongoose.Types.ObjectId.isValid(egresoId)) {
      return res.status(400).json({ error: 'ID de egreso invalido' });
    }

    const egreso = await Egreso.findOneAndUpdate(
      { _id: egresoId, deleted_at: null },
      {
        $set: {
          deleted_at: new Date(),
          updated_by: actorId
        }
      },
      { new: true }
    );

    if (!egreso) return res.status(404).json({ error: 'Egreso no encontrado' });

    return res.json({ message: 'Egreso eliminado' });
  } catch (err) {
    return res.status(500).json({ error: 'Error al eliminar egreso' });
  }
};

exports.subirComprobanteEgreso = async (req, res) => {
  try {
    const { Egreso } = await getTenantEgresoModels(req);
    const actorId = toOptionalObjectId(req.user?.id);
    const egresoId = String(req.params?.id || '').trim();

    if (!mongoose.Types.ObjectId.isValid(egresoId)) {
      return res.status(400).json({ error: 'ID de egreso invalido' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'Debe adjuntar un comprobante' });
    }

    const egreso = await Egreso.findOne({ _id: egresoId, deleted_at: null });
    if (!egreso) return res.status(404).json({ error: 'Egreso no encontrado' });

    const oldAbsolutePath = getFileAbsolutePathFromUploadUrl(egreso.comprobante_url);

    egreso.comprobante_url = req.file.publicUrl || '';
    egreso.comprobante_nombre = req.file.originalname || req.file.filename || '';
    egreso.comprobante_mime = req.file.mimetype || '';
    egreso.comprobante_tamano_bytes = Number(req.file.size || 0);
    egreso.updated_by = actorId;

    await egreso.save();

    if (oldAbsolutePath && fs.existsSync(oldAbsolutePath)) {
      fs.promises.unlink(oldAbsolutePath).catch(() => {});
    }

    return res.json({
      comprobante_url: egreso.comprobante_url,
      comprobante_nombre: egreso.comprobante_nombre,
      comprobante_mime: egreso.comprobante_mime,
      comprobante_tamano_bytes: egreso.comprobante_tamano_bytes
    });
  } catch (err) {
    return res.status(500).json({ error: 'Error al subir comprobante del egreso' });
  }
};
