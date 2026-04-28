const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');

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
