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
    recargo_usd: 0
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
    titulo: cleanValue(template.titulo || fallback.titulo),
    destinatario: cleanValue(template.destinatario || fallback.destinatario),
    cuerpo: cleanValue(template.cuerpo || fallback.cuerpo),
    nota: cleanValue(template.nota || fallback.nota),
    cierre: cleanValue(template.cierre || fallback.cierre),
    lugarEmision: cleanValue(template.lugarEmision || fallback.lugarEmision)
  };
}

function normalizeConstanciasPayload(constancias = {}, fallback = DEFAULT_CONFIG.constancias) {
  const root = constancias && typeof constancias === 'object' ? constancias : {};
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
  const constancias = root.constancias && typeof root.constancias === 'object' ? root.constancias : {};
  const recargoUsdRaw = cobro.recargo_usd ?? cobro.recargo_porcentaje;

  const pagoMovil = pagos.pago_movil || {};
  const transferencia = pagos.transferencia || {};
  const depositoUsd = pagos.deposito_usd || {};

  return {
    pagos: {
      pago_movil: {
        banco: cleanValue(pagoMovil.banco),
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
      recargo_usd: clampDecimal(recargoUsdRaw, DEFAULT_CONFIG.cobro.recargo_usd, 0, 100000)
    },
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

    if (Object.keys(cobroPatch).length > 0) {
      patch.cobro = cobroPatch;
    }
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
  const constancias = doc?.constancias || {};
  const recargoUsdRaw = cobro?.recargo_usd ?? cobro?.recargo_porcentaje;

  return {
    pagos: {
      pago_movil: {
        banco: cleanValue(pagos?.pago_movil?.banco),
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
      recargo_usd: clampDecimal(recargoUsdRaw, DEFAULT_CONFIG.cobro.recargo_usd, 0, 100000)
    },
    constancias: normalizeConstanciasPayload(constancias),
    is_default: false,
    updatedAt: doc.updatedAt
  };
}

function serializePagosConfig(doc) {
  if (!doc) {
    return {
      pagos: { ...DEFAULT_CONFIG.pagos },
      is_default: true
    };
  }

  const pagos = doc?.pagos || {};
  return {
    pagos: {
      pago_movil: {
        banco: cleanValue(pagos?.pago_movil?.banco),
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
    is_default: false,
    updatedAt: doc.updatedAt
  };
}

exports.getConfiguracionPagos = async (req, res) => {
  try {
    const TenantConfig = await getTenantConfigModel(req);
    const config = await TenantConfig.findOne({ key: 'default' }).select('pagos updatedAt').lean();
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
    const currentConfig = await TenantConfig.findOne({ key: 'default' }).select('constancias').lean();
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
