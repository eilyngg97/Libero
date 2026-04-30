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

function normalizeConfigPayload(payload = {}) {
  const root = payload && typeof payload === 'object' ? payload : {};
  const pagos = root.pagos && typeof root.pagos === 'object' ? root.pagos : root;
  const cobro = root.cobro && typeof root.cobro === 'object' ? root.cobro : {};
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
    }
  };
}

function normalizeConfigPatchPayload(payload = {}) {
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
    const normalizedPatch = normalizeConfigPatchPayload(req.body || {});

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
