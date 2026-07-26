const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantCoreConnection } = require('../config/tenantCoreConnection');
const { getTenantCoreModel } = require('../models/TenantCore');
const { getTenantModel } = require('../services/tenantModelService');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');

const DEFAULT_CONFIG = {
  pagos: {
    pago_movil: {
      banco: '',
      codigo_banco: '',
      telefono: '',
      cedula: '',
      titular: ''
    },
    transferencia: {
      banco: '',
      cuenta: '',
      titular: '',
      cedula: ''
    },
    deposito_usd: {
      instrucciones: ''
    }
  },
  cobro: {
    dia_cobro: 1,
    dia_vencimiento: 5,
    dias_gracia: 0,
    recargo_usd: 0,
    moneda: 'USD'
  },
  categorias: {
    disciplina: 'voleibol',
    modo_asignacion: 'anio_nacimiento',
    fecha_corte: {
      mes: 12,
      dia: 31
    },
    reglas: [
      { etiqueta: 'U9/INICIACION', anio_nacimiento_desde: 2017, anio_nacimiento_hasta: null, orden: 1 },
      { etiqueta: 'U11/FORMACION', anio_nacimiento_desde: 2015, anio_nacimiento_hasta: 2016, orden: 2 },
      { etiqueta: 'U13/MINI', anio_nacimiento_desde: 2013, anio_nacimiento_hasta: 2014, orden: 3 },
      { etiqueta: 'U15/INFANTIL', anio_nacimiento_desde: 2011, anio_nacimiento_hasta: 2012, orden: 4 },
      { etiqueta: 'U17/JUVENIL', anio_nacimiento_desde: 2009, anio_nacimiento_hasta: 2010, orden: 5 },
      { etiqueta: 'U19/JUVENIL LIBRE', anio_nacimiento_desde: 2007, anio_nacimiento_hasta: 2008, orden: 6 },
      { etiqueta: 'U21', anio_nacimiento_desde: 2005, anio_nacimiento_hasta: 2006, orden: 7 },
      { etiqueta: 'MAYORES / LIBRE', anio_nacimiento_desde: null, anio_nacimiento_hasta: 2004, orden: 8 }
    ]
  },
  constancias: {
    institucion_nombre: '',
    subtitulo: '',
    logos: [],
    firmante: {
      nombre: '',
      cedula: '',
      telefono: '',
      cargo: ''
    },
    pie_direccion: '',
    pie_lema: '',
    retiro_personalizado: {
      habilitado: false,
      incluir_logo_academia: false,
      institucion_nombre: '',
      subtitulo: '',
      logos: [],
      firmante: {
        nombre: '',
        cedula: '',
        telefono: '',
        cargo: ''
      },
      pie_direccion: '',
      pie_lema: '',
      template: {
        titulo: 'CARTA DE RETIRO',
        destinatario: 'A QUIEN PUEDA INTERESAR',
        cuerpo: '',
        nota: '',
        cierre: 'Constancia que se hace a petición de la parte interesada.',
        lugarEmision: 'Barquisimeto'
      }
    },
    templates: {
      simple: {
        titulo: 'CONSTANCIA',
        destinatario: 'A QUIEN PUEDA INTERESAR',
        cuerpo: '',
        nota: '',
        cierre: 'Constancia que se hace a petición de la parte interesada.',
        lugarEmision: 'Barquisimeto'
      },
      retiro: {
        titulo: 'CARTA DE RETIRO',
        destinatario: 'A QUIEN PUEDA INTERESAR',
        cuerpo: '',
        nota: '',
        cierre: 'Constancia que se hace a petición de la parte interesada.',
        lugarEmision: 'Barquisimeto'
      },
      horario_entrenamiento: {
        titulo: 'CONSTANCIA',
        destinatario: 'A QUIEN PUEDA INTERESAR',
        cuerpo: '',
        nota: '',
        cierre: 'Constancia que se hace a petición de la parte interesada.',
        lugarEmision: 'Barquisimeto'
      },
      listado_alumnos: {
        titulo: 'CONSTANCIA',
        destinatario: 'A QUIEN PUEDA INTERESAR',
        cuerpo: '',
        nota: '',
        cierre: 'Constancia que se hace a petición de la parte interesada.',
        lugarEmision: 'Barquisimeto'
      },
      asistencia: {
        titulo: 'CONSTANCIA DE ASISTENCIA',
        destinatario: 'A QUIEN PUEDA INTERESAR',
        cuerpo: '',
        nota: '',
        cierre: 'Sin mas nada que hacer referencia y agradeciendo de antemano la mayor colaboracion que puedan prestar para con nuestro atleta.',
        lugarEmision: 'Barquisimeto'
      }
    }
  }
};

async function getTenantConfigModel(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);
  return getTenantModel(connection, 'TenantConfig');
}

async function getTenantUserModel(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);
  return getTenantModel(connection, 'User');
}

function buildBrandingLogoUrl(req, file) {
  if (!file?.filename) return null;
  const tenantId = resolveRequestTenantId(req);
  return `/uploads/${tenantId}/branding/${file.filename}`;
}

async function eliminarLogoAnteriorSiAplica(previousLogoUrl) {
  const logoUrl = String(previousLogoUrl || '').trim();
  if (!logoUrl.startsWith('/uploads/')) return;
  if (!logoUrl.includes('/branding/')) return;

  const relativePath = logoUrl.replace(/^\/+/, '');
  const absolutePath = path.join(__dirname, '..', relativePath);
  try {
    await fs.promises.unlink(absolutePath);
  } catch (err) {
    if (err?.code !== 'ENOENT') {
      console.warn('No se pudo eliminar logo anterior:', err.message);
    }
  }
}

function cleanValue(value) {
  return String(value || '').trim();
}

function clampInteger(value, fallback, min, max) {
  const number = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(number)) return fallback;
  if (number < min) return min;
  if (number > max) return max;
  return number;
}

function clampDecimal(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  if (number < min) return min;
  if (number > max) return max;
  return number;
}

function normalizeCobroMoneda(value, fallback = DEFAULT_CONFIG.cobro.moneda) {
  const normalized = cleanValue(value || fallback).toUpperCase();
  return normalized === 'EUR' ? 'EUR' : 'USD';
}

function normalizeLogosList(logos, maxItems = 3) {
  const list = Array.isArray(logos) ? logos : [];
  const max = Number.isFinite(Number(maxItems)) ? Number(maxItems) : 3;
  const withLimit = max < 0 ? 0 : max;
  const cleaned = list
    .map((item) => cleanValue(item))
    .filter((item) => item !== '')
    .slice(0, withLimit);
  return Array.from(new Set(cleaned));
}

function normalizeTemplatePayload(template = {}, fallback = {}) {
  return {
    titulo: cleanValue(template?.titulo ?? fallback?.titulo),
    destinatario: cleanValue(template?.destinatario ?? fallback?.destinatario),
    cuerpo: cleanValue(template?.cuerpo ?? fallback?.cuerpo),
    nota: cleanValue(template?.nota ?? fallback?.nota),
    cierre: cleanValue(template?.cierre ?? fallback?.cierre),
    lugarEmision: cleanValue(template?.lugarEmision ?? fallback?.lugarEmision)
  };
}

function normalizeDisciplina(value, fallback = DEFAULT_CONFIG.categorias.disciplina) {
  const normalized = cleanValue(value || fallback).toLowerCase();
  return normalized || DEFAULT_CONFIG.categorias.disciplina;
}

function normalizeReglasCategoriasList(reglas, fallback = DEFAULT_CONFIG.categorias.reglas) {
  const source = Array.isArray(reglas) ? reglas : fallback;

  function parseOptionalYear(value) {
    if (value === undefined || value === null || String(value).trim() === '') {
      return null;
    }

    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) return null;
    return parsed;
  }

  return source
    .map((item, index) => {
      const etiqueta = cleanValue(item?.etiqueta);
      const desdeRaw = item?.anio_nacimiento_desde;
      const hastaRaw = item?.anio_nacimiento_hasta;
      const ordenRaw = item?.orden;

      const anio_nacimiento_desde = parseOptionalYear(desdeRaw);
      const anio_nacimiento_hasta = parseOptionalYear(hastaRaw);
      const ordenCalculado = Number.isInteger(Number(ordenRaw)) ? Number(ordenRaw) : (index + 1);
      const orden = ordenCalculado < 1 ? 1 : ordenCalculado;

      if (!etiqueta) return null;

      return {
        etiqueta,
        anio_nacimiento_desde,
        anio_nacimiento_hasta,
        orden
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.orden - b.orden)
    .map((item, index) => ({ ...item, orden: index + 1 }));
}

function validarReglasCategorias(reglas = []) {
  if (!Array.isArray(reglas) || reglas.length === 0) {
    throw new Error('Debes definir al menos una regla de categoria.');
  }

  const intervalos = reglas.map((regla, index) => {
    const etiqueta = cleanValue(regla?.etiqueta);
    const desde = regla?.anio_nacimiento_desde;
    const hasta = regla?.anio_nacimiento_hasta;

    if (!etiqueta) {
      throw new Error(`La regla #${index + 1} no tiene etiqueta valida.`);
    }

    const tieneDesde = Number.isInteger(desde);
    const tieneHasta = Number.isInteger(hasta);

    if (!tieneDesde && !tieneHasta) {
      throw new Error(`La regla "${etiqueta}" debe definir al menos un limite (desde u hasta).`);
    }

    if (tieneDesde && (desde < 1900 || desde > 3000)) {
      throw new Error(`La regla "${etiqueta}" tiene anio_nacimiento_desde fuera de rango.`);
    }

    if (tieneHasta && (hasta < 1900 || hasta > 3000)) {
      throw new Error(`La regla "${etiqueta}" tiene anio_nacimiento_hasta fuera de rango.`);
    }

    const min = tieneDesde ? desde : Number.NEGATIVE_INFINITY;
    const max = tieneHasta ? hasta : Number.POSITIVE_INFINITY;

    if (min > max) {
      throw new Error(`La regla "${etiqueta}" tiene rango invalido (desde mayor que hasta).`);
    }

    return { etiqueta, min, max };
  });

  const ordenados = [...intervalos].sort((a, b) => a.min - b.min);
  for (let i = 1; i < ordenados.length; i += 1) {
    const anterior = ordenados[i - 1];
    const actual = ordenados[i];
    if (anterior.max >= actual.min) {
      throw new Error(
        `Las reglas "${anterior.etiqueta}" y "${actual.etiqueta}" se solapan. Ajusta los rangos para evitar cruces.`
      );
    }
  }
}

function normalizeFechaCorte(fechaCorte = {}, fallback = DEFAULT_CONFIG.categorias.fecha_corte) {
  const mes = clampInteger(fechaCorte?.mes, fallback?.mes ?? 12, 1, 12);
  const diaInicial = clampInteger(fechaCorte?.dia, fallback?.dia ?? 31, 1, 31);
  const maxDiaMes = new Date(Date.UTC(2024, mes, 0)).getUTCDate();
  const dia = diaInicial > maxDiaMes ? maxDiaMes : diaInicial;
  return { mes, dia };
}

function normalizeCategoriasPayload(categorias = {}, fallback = DEFAULT_CONFIG.categorias) {
  const root = categorias && typeof categorias === 'object' ? categorias : {};
  const fechaCorte = root?.fecha_corte && typeof root.fecha_corte === 'object'
    ? root.fecha_corte
    : {};

  const categoriasNormalizadas = {
    disciplina: normalizeDisciplina(root.disciplina, fallback.disciplina),
    modo_asignacion: 'anio_nacimiento',
    fecha_corte: normalizeFechaCorte(fechaCorte, fallback?.fecha_corte),
    reglas: normalizeReglasCategoriasList(root.reglas, fallback.reglas)
  };

  validarReglasCategorias(categoriasNormalizadas.reglas);
  return categoriasNormalizadas;
}

function normalizeConstanciasPayload(constancias = {}, fallback = DEFAULT_CONFIG.constancias) {
  const root = constancias && typeof constancias === 'object' ? constancias : {};
  const retiroRoot = root?.retiro_personalizado && typeof root.retiro_personalizado === 'object'
    ? root.retiro_personalizado
    : {};
  const retiroFallback = fallback?.retiro_personalizado || DEFAULT_CONFIG.constancias.retiro_personalizado;

  return {
    institucion_nombre: cleanValue(root.institucion_nombre || fallback.institucion_nombre),
    subtitulo: cleanValue(root.subtitulo || fallback.subtitulo),
    logos: normalizeLogosList(root.logos),
    firmante: {
      nombre: cleanValue(root?.firmante?.nombre || fallback?.firmante?.nombre),
      cedula: cleanValue(root?.firmante?.cedula || fallback?.firmante?.cedula),
      telefono: cleanValue(root?.firmante?.telefono || fallback?.firmante?.telefono),
      cargo: cleanValue(root?.firmante?.cargo || fallback?.firmante?.cargo)
    },
    pie_direccion: cleanValue(root.pie_direccion || fallback.pie_direccion),
    pie_lema: cleanValue(root.pie_lema || fallback.pie_lema),
    retiro_personalizado: {
      habilitado: Boolean(retiroRoot.habilitado),
      incluir_logo_academia: Boolean(retiroRoot.incluir_logo_academia),
      institucion_nombre: cleanValue(retiroRoot.institucion_nombre || retiroFallback.institucion_nombre),
      subtitulo: cleanValue(retiroRoot.subtitulo || retiroFallback.subtitulo),
      logos: normalizeLogosList(retiroRoot.logos),
      firmante: {
        nombre: cleanValue(retiroRoot?.firmante?.nombre || retiroFallback?.firmante?.nombre),
        cedula: cleanValue(retiroRoot?.firmante?.cedula || retiroFallback?.firmante?.cedula),
        telefono: cleanValue(retiroRoot?.firmante?.telefono || retiroFallback?.firmante?.telefono),
        cargo: cleanValue(retiroRoot?.firmante?.cargo || retiroFallback?.firmante?.cargo)
      },
      pie_direccion: cleanValue(retiroRoot.pie_direccion || retiroFallback.pie_direccion),
      pie_lema: cleanValue(retiroRoot.pie_lema || retiroFallback.pie_lema),
      template: normalizeTemplatePayload(retiroRoot.template, retiroFallback.template)
    },
    templates: {
      simple: normalizeTemplatePayload(root?.templates?.simple, fallback?.templates?.simple),
      retiro: normalizeTemplatePayload(root?.templates?.retiro, fallback?.templates?.retiro),
      horario_entrenamiento: normalizeTemplatePayload(root?.templates?.horario_entrenamiento, fallback?.templates?.horario_entrenamiento),
      listado_alumnos: normalizeTemplatePayload(root?.templates?.listado_alumnos, fallback?.templates?.listado_alumnos),
      asistencia: normalizeTemplatePayload(root?.templates?.asistencia, fallback?.templates?.asistencia)
    }
  };
}

function normalizeConfigPayload(payload = {}) {
  const root = payload && typeof payload === 'object' ? payload : {};
  const pagos = root.pagos && typeof root.pagos === 'object' ? root.pagos : root;
  const cobro = root.cobro && typeof root.cobro === 'object' ? root.cobro : {};
  const categorias = root.categorias && typeof root.categorias === 'object' ? root.categorias : {};
  const constancias = root.constancias && typeof root.constancias === 'object' ? root.constancias : {};
  const recargoUsdRaw = cobro.recargo_usd ?? cobro.recargo_porcentaje;

  const pagoMovil = pagos.pago_movil || {};
  const transferencia = pagos.transferencia || {};
  const depositoUsd = pagos.deposito_usd || {};

  return {
    pagos: {
      pago_movil: {
        banco: cleanValue(pagoMovil.banco),
        codigo_banco: cleanValue(pagoMovil.codigo_banco),
        telefono: cleanValue(pagoMovil.telefono),
        cedula: cleanValue(pagoMovil.cedula),
        titular: cleanValue(pagoMovil.titular)
      },
      transferencia: {
        banco: cleanValue(transferencia.banco),
        cuenta: cleanValue(transferencia.cuenta),
        titular: cleanValue(transferencia.titular),
        cedula: cleanValue(transferencia.cedula)
      },
      deposito_usd: {
        instrucciones: cleanValue(depositoUsd.instrucciones)
      }
    },
    cobro: {
      dia_cobro: clampInteger(cobro.dia_cobro, DEFAULT_CONFIG.cobro.dia_cobro, 1, 31),
      dia_vencimiento: clampInteger(cobro.dia_vencimiento, DEFAULT_CONFIG.cobro.dia_vencimiento, 1, 31),
      dias_gracia: clampInteger(cobro.dias_gracia, DEFAULT_CONFIG.cobro.dias_gracia, 0, 31),
      recargo_usd: clampDecimal(recargoUsdRaw, DEFAULT_CONFIG.cobro.recargo_usd, 0, 100000),
      moneda: normalizeCobroMoneda(cobro.moneda, DEFAULT_CONFIG.cobro.moneda)
    },
    categorias: normalizeCategoriasPayload(categorias),
    constancias: normalizeConstanciasPayload(constancias)
  };
}

function normalizeConfigPatchPayload(payload = {}, existingConfig = {}) {
  const root = payload && typeof payload === 'object' ? payload : {};
  const patch = {};

  if (root.pagos && typeof root.pagos === 'object') {
    const pagosPatch = {};

    if (root.pagos.pago_movil && typeof root.pagos.pago_movil === 'object') {
      const pagoMovil = root.pagos.pago_movil;
      pagosPatch.pago_movil = {
        banco: cleanValue(pagoMovil.banco),
        codigo_banco: cleanValue(pagoMovil.codigo_banco),
        telefono: cleanValue(pagoMovil.telefono),
        cedula: cleanValue(pagoMovil.cedula),
        titular: cleanValue(pagoMovil.titular)
      };
    }

    if (root.pagos.transferencia && typeof root.pagos.transferencia === 'object') {
      const transferencia = root.pagos.transferencia;
      pagosPatch.transferencia = {
        banco: cleanValue(transferencia.banco),
        cuenta: cleanValue(transferencia.cuenta),
        titular: cleanValue(transferencia.titular),
        cedula: cleanValue(transferencia.cedula)
      };
    }

    if (root.pagos.deposito_usd && typeof root.pagos.deposito_usd === 'object') {
      pagosPatch.deposito_usd = {
        instrucciones: cleanValue(root.pagos.deposito_usd.instrucciones)
      };
    }

    if (Object.keys(pagosPatch).length > 0) {
      patch.pagos = pagosPatch;
    }
  }

  if (root.cobro && typeof root.cobro === 'object') {
    const cobroPatch = {};

    if (root.cobro.dia_cobro !== undefined) {
      cobroPatch.dia_cobro = clampInteger(root.cobro.dia_cobro, DEFAULT_CONFIG.cobro.dia_cobro, 1, 31);
    }

    if (root.cobro.dia_vencimiento !== undefined) {
      cobroPatch.dia_vencimiento = clampInteger(root.cobro.dia_vencimiento, DEFAULT_CONFIG.cobro.dia_vencimiento, 1, 31);
    }

    if (root.cobro.dias_gracia !== undefined) {
      cobroPatch.dias_gracia = clampInteger(root.cobro.dias_gracia, DEFAULT_CONFIG.cobro.dias_gracia, 0, 31);
    }

    if (root.cobro.recargo_usd !== undefined || root.cobro.recargo_porcentaje !== undefined) {
      const recargoUsdRaw = root.cobro.recargo_usd ?? root.cobro.recargo_porcentaje;
      cobroPatch.recargo_usd = clampDecimal(recargoUsdRaw, DEFAULT_CONFIG.cobro.recargo_usd, 0, 100000);
    }

    if (root.cobro.moneda !== undefined) {
      cobroPatch.moneda = normalizeCobroMoneda(root.cobro.moneda, DEFAULT_CONFIG.cobro.moneda);
    }

    if (Object.keys(cobroPatch).length > 0) {
      patch.cobro = cobroPatch;
    }
  }

  if (root.categorias && typeof root.categorias === 'object') {
    const existingCategorias = normalizeCategoriasPayload(existingConfig?.categorias || {}, DEFAULT_CONFIG.categorias);
    const mergedCategoriasInput = {
      ...existingCategorias,
      ...root.categorias,
      fecha_corte: {
        ...existingCategorias.fecha_corte,
        ...(root.categorias.fecha_corte || {})
      },
      reglas: root.categorias.reglas !== undefined ? root.categorias.reglas : existingCategorias.reglas
    };

    patch.categorias = normalizeCategoriasPayload(mergedCategoriasInput, DEFAULT_CONFIG.categorias);
  }

  if (root.constancias && typeof root.constancias === 'object') {
    const existingConstancias = normalizeConstanciasPayload(existingConfig?.constancias || {}, DEFAULT_CONFIG.constancias);
    const mergedConstanciasInput = {
      ...existingConstancias,
      ...root.constancias,
      logos: root.constancias.logos !== undefined ? root.constancias.logos : existingConstancias.logos,
      firmante: {
        ...existingConstancias.firmante,
        ...(root.constancias.firmante || {})
      },
      retiro_personalizado: {
        ...existingConstancias.retiro_personalizado,
        ...(root.constancias.retiro_personalizado || {}),
        logos: root?.constancias?.retiro_personalizado?.logos !== undefined
          ? root.constancias.retiro_personalizado.logos
          : existingConstancias.retiro_personalizado.logos,
        firmante: {
          ...existingConstancias.retiro_personalizado.firmante,
          ...(root?.constancias?.retiro_personalizado?.firmante || {})
        },
        template: {
          ...existingConstancias.retiro_personalizado.template,
          ...(root?.constancias?.retiro_personalizado?.template || {})
        }
      },
      templates: {
        ...existingConstancias.templates,
        simple: {
          ...existingConstancias.templates.simple,
          ...(root?.constancias?.templates?.simple || {})
        },
        retiro: {
          ...existingConstancias.templates.retiro,
          ...(root?.constancias?.templates?.retiro || {})
        },
        horario_entrenamiento: {
          ...existingConstancias.templates.horario_entrenamiento,
          ...(root?.constancias?.templates?.horario_entrenamiento || {})
        },
        listado_alumnos: {
          ...existingConstancias.templates.listado_alumnos,
          ...(root?.constancias?.templates?.listado_alumnos || {})
        },
        asistencia: {
          ...existingConstancias.templates.asistencia,
          ...(root?.constancias?.templates?.asistencia || {})
        }
      }
    };

    const constanciasPatch = normalizeConstanciasPayload(mergedConstanciasInput, DEFAULT_CONFIG.constancias);
    patch.constancias = constanciasPatch;
  }

  return patch;
}

function serializeConfig(doc) {
  if (!doc) {
    return {
      ...DEFAULT_CONFIG,
      is_default: true
    };
  }

  const pagos = doc?.pagos || {};
  const cobro = doc?.cobro || {};
  const categorias = doc?.categorias || {};
  const constancias = doc?.constancias || {};
  const recargoUsdRaw = cobro?.recargo_usd ?? cobro?.recargo_porcentaje;
  const categoriasParaRespuesta = Array.isArray(categorias?.reglas) && categorias.reglas.length > 0
    ? categorias
    : DEFAULT_CONFIG.categorias;

  return {
    pagos: {
      pago_movil: {
        banco: cleanValue(pagos?.pago_movil?.banco),
        codigo_banco: cleanValue(pagos?.pago_movil?.codigo_banco),
        telefono: cleanValue(pagos?.pago_movil?.telefono),
        cedula: cleanValue(pagos?.pago_movil?.cedula),
        titular: cleanValue(pagos?.pago_movil?.titular)
      },
      transferencia: {
        banco: cleanValue(pagos?.transferencia?.banco),
        cuenta: cleanValue(pagos?.transferencia?.cuenta),
        titular: cleanValue(pagos?.transferencia?.titular),
        cedula: cleanValue(pagos?.transferencia?.cedula)
      },
      deposito_usd: {
        instrucciones: cleanValue(pagos?.deposito_usd?.instrucciones)
      }
    },
    cobro: {
      dia_cobro: clampInteger(cobro?.dia_cobro, DEFAULT_CONFIG.cobro.dia_cobro, 1, 31),
      dia_vencimiento: clampInteger(cobro?.dia_vencimiento, DEFAULT_CONFIG.cobro.dia_vencimiento, 1, 31),
      dias_gracia: clampInteger(cobro?.dias_gracia, DEFAULT_CONFIG.cobro.dias_gracia, 0, 31),
      recargo_usd: clampDecimal(recargoUsdRaw, DEFAULT_CONFIG.cobro.recargo_usd, 0, 100000),
      moneda: normalizeCobroMoneda(cobro?.moneda, DEFAULT_CONFIG.cobro.moneda)
    },
    categorias: normalizeCategoriasPayload(categoriasParaRespuesta, DEFAULT_CONFIG.categorias),
    constancias: normalizeConstanciasPayload(constancias),
    is_default: false,
    updatedAt: doc.updatedAt
  };
}

function serializePagosConfig(doc) {
  if (!doc) {
    return {
      pagos: { ...DEFAULT_CONFIG.pagos },
      cobro: { moneda: DEFAULT_CONFIG.cobro.moneda },
      is_default: true
    };
  }

  const pagos = doc?.pagos || {};
  const cobro = doc?.cobro || {};
  return {
    pagos: {
      pago_movil: {
        banco: cleanValue(pagos?.pago_movil?.banco),
        codigo_banco: cleanValue(pagos?.pago_movil?.codigo_banco),
        telefono: cleanValue(pagos?.pago_movil?.telefono),
        cedula: cleanValue(pagos?.pago_movil?.cedula),
        titular: cleanValue(pagos?.pago_movil?.titular)
      },
      transferencia: {
        banco: cleanValue(pagos?.transferencia?.banco),
        cuenta: cleanValue(pagos?.transferencia?.cuenta),
        titular: cleanValue(pagos?.transferencia?.titular),
        cedula: cleanValue(pagos?.transferencia?.cedula)
      },
      deposito_usd: {
        instrucciones: cleanValue(pagos?.deposito_usd?.instrucciones)
      }
    },
    cobro: {
      moneda: normalizeCobroMoneda(cobro?.moneda, DEFAULT_CONFIG.cobro.moneda)
    },
    is_default: false,
    updatedAt: doc.updatedAt
  };
}

exports.getConfiguracionPagos = async (req, res) => {
  try {
    const TenantConfig = await getTenantConfigModel(req);
    const config = await TenantConfig.findOne({ key: 'default' }).select('pagos cobro updatedAt').lean();
    return res.json(serializePagosConfig(config));
  } catch {
    return res.status(500).json({ error: 'Error al obtener metodos de pago.' });
  }
};

exports.getConfiguracionAdmin = async (req, res) => {
  try {
    const TenantConfig = await getTenantConfigModel(req);
    const config = await TenantConfig.findOne({ key: 'default' }).lean();
    return res.json(serializeConfig(config));
  } catch {
    return res.status(500).json({ error: 'Error al obtener la configuracion.' });
  }
};

exports.upsertConfiguracionAdmin = async (req, res) => {
  try {
    const TenantConfig = await getTenantConfigModel(req);
    const normalized = normalizeConfigPayload(req.body || {});

    const updated = await TenantConfig.findOneAndUpdate(
      { key: 'default' },
      {
        $set: {
          ...normalized,
          updated_by: req.user?.id
        }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    ).lean();

    return res.json(serializeConfig(updated));
  } catch (err) {
    return res.status(400).json({ error: 'Error al guardar la configuracion.', detalle: err.message });
  }
};

exports.patchConfiguracionAdmin = async (req, res) => {
  try {
    const TenantConfig = await getTenantConfigModel(req);
    const currentConfig = await TenantConfig.findOne({ key: 'default' }).select('categorias constancias').lean();
    const normalizedPatch = normalizeConfigPatchPayload(req.body || {}, currentConfig || {});

    if (Object.keys(normalizedPatch).length === 0) {
      return res.status(400).json({ error: 'No se recibieron secciones validas para actualizar.' });
    }

    const setPayload = {
      updated_by: req.user?.id
    };

    if (normalizedPatch.pagos) {
      if (normalizedPatch.pagos.pago_movil) {
        setPayload['pagos.pago_movil'] = normalizedPatch.pagos.pago_movil;
      }
      if (normalizedPatch.pagos.transferencia) {
        setPayload['pagos.transferencia'] = normalizedPatch.pagos.transferencia;
      }
      if (normalizedPatch.pagos.deposito_usd) {
        setPayload['pagos.deposito_usd'] = normalizedPatch.pagos.deposito_usd;
      }
    }

    if (normalizedPatch.cobro) {
      Object.entries(normalizedPatch.cobro).forEach(([key, value]) => {
        setPayload[`cobro.${key}`] = value;
      });
    }

    if (normalizedPatch.categorias) {
      setPayload.categorias = normalizedPatch.categorias;
    }

    if (normalizedPatch.constancias) {
      setPayload.constancias = normalizedPatch.constancias;
    }

    const updated = await TenantConfig.findOneAndUpdate(
      { key: 'default' },
      { $set: setPayload },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    ).lean();

    return res.json(serializeConfig(updated));
  } catch (err) {
    return res.status(400).json({ error: 'Error al actualizar parcialmente la configuracion.', detalle: err.message });
  }
};

exports.subirLogoAcademia = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Debes adjuntar un archivo de imagen en el campo logo.' });
    }

    const tenantId = resolveRequestTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ error: 'No se pudo resolver el tenant actual.' });
    }

    const logoUrl = buildBrandingLogoUrl(req, req.file);
    if (!logoUrl) {
      return res.status(400).json({ error: 'No se pudo procesar el archivo de logo.' });
    }

    const coreConnection = await getTenantCoreConnection();
    const TenantCore = getTenantCoreModel(coreConnection);
    const tenantActual = await TenantCore.findOne({ tenantId }).select('tenantId nombre branding').lean();
    if (!tenantActual) {
      return res.status(404).json({ error: 'Tenant no encontrado en base core.' });
    }

    await TenantCore.updateOne(
      { tenantId },
      {
        $set: {
          'branding.logoUrl': logoUrl,
          'branding.displayName': tenantActual?.branding?.displayName || tenantActual?.nombre || tenantId
        }
      }
    );

    await eliminarLogoAnteriorSiAplica(tenantActual?.branding?.logoUrl);

    return res.status(200).json({
      message: 'Logo de la academia actualizado con exito.',
      logoUrl
    });
  } catch (err) {
    return res.status(400).json({ error: 'No se pudo subir el logo de la academia.', detalle: err.message });
  }
};

exports.subirLogosConstancias = async (req, res) => {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'Debes adjuntar al menos una imagen en el campo logos.' });
    }

    const TenantConfig = await getTenantConfigModel(req);
    const config = await TenantConfig.findOne({ key: 'default' }).lean();
    const existentes = normalizeLogosList(config?.constancias?.logos || [], Number.POSITIVE_INFINITY);
    const nuevos = normalizeLogosList(files.map((file) => buildBrandingLogoUrl(req, file)), Number.POSITIVE_INFINITY);
    const fusionadosSinRecorte = normalizeLogosList([...existentes, ...nuevos], Number.POSITIVE_INFINITY);

    if (fusionadosSinRecorte.length > 3) {
      return res.status(400).json({ error: 'Solo se permiten hasta 3 logos para constancias por academia.' });
    }

    const fusionados = normalizeLogosList(fusionadosSinRecorte, 3);

    await TenantConfig.findOneAndUpdate(
      { key: 'default' },
      {
        $set: {
          'constancias.logos': fusionados,
          updated_by: req.user?.id
        }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    ).lean();

    return res.status(200).json({
      message: 'Logos de constancias actualizados con exito.',
      logos: fusionados
    });
  } catch (err) {
    return res.status(400).json({ error: 'No se pudieron subir los logos de constancias.', detalle: err.message });
  }
};

exports.subirLogosConstanciaRetiro = async (req, res) => {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'Debes adjuntar al menos una imagen en el campo logos.' });
    }

    const TenantConfig = await getTenantConfigModel(req);
    const config = await TenantConfig.findOne({ key: 'default' }).lean();
    const existentes = normalizeLogosList(config?.constancias?.retiro_personalizado?.logos || [], Number.POSITIVE_INFINITY);
    const nuevos = normalizeLogosList(files.map((file) => buildBrandingLogoUrl(req, file)), Number.POSITIVE_INFINITY);
    const fusionadosSinRecorte = normalizeLogosList([...existentes, ...nuevos], Number.POSITIVE_INFINITY);

    if (fusionadosSinRecorte.length > 3) {
      return res.status(400).json({ error: 'Solo se permiten hasta 3 logos para la constancia de retiro personalizada.' });
    }

    const fusionados = normalizeLogosList(fusionadosSinRecorte, 3);

    await TenantConfig.findOneAndUpdate(
      { key: 'default' },
      {
        $set: {
          'constancias.retiro_personalizado.logos': fusionados,
          updated_by: req.user?.id
        }
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true
      }
    ).lean();

    return res.status(200).json({
      message: 'Logos de retiro personalizados actualizados con exito.',
      logos: fusionados
    });
  } catch (err) {
    return res.status(400).json({ error: 'No se pudieron subir los logos de retiro personalizados.', detalle: err.message });
  }
};

exports.cambiarClaveUsuario = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Sesion invalida.' });
    }

    const claveActual = String(req.body?.clave_actual || '').trim();
    const claveNueva = String(req.body?.clave_nueva || '').trim();
    const confirmarClaveNueva = String(req.body?.confirmar_clave_nueva || '').trim();

    if (!claveActual || !claveNueva || !confirmarClaveNueva) {
      return res.status(400).json({ error: 'Debes completar clave actual, nueva clave y confirmacion.' });
    }

    if (claveNueva.length < 8) {
      return res.status(400).json({ error: 'La nueva clave debe tener al menos 8 caracteres.' });
    }

    if (claveNueva !== confirmarClaveNueva) {
      return res.status(400).json({ error: 'La confirmacion de clave no coincide.' });
    }

    const TenantUser = await getTenantUserModel(req);
    const user = await TenantUser.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const coincideClaveActual = await bcrypt.compare(claveActual, user.password);
    if (!coincideClaveActual) {
      return res.status(400).json({ error: 'La clave actual es incorrecta.' });
    }

    const nuevaHash = await bcrypt.hash(claveNueva, 10);
    user.password = nuevaHash;
    await user.save();

    return res.status(200).json({ message: 'Clave actualizada con exito.' });
  } catch (err) {
    return res.status(400).json({ error: 'No se pudo cambiar la clave.', detalle: err.message });
  }
};
