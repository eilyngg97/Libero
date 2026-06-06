const PagoDetalle = require('../models/PagoDetalle');
const Mensualidad = require('../models/Mensualidad');
const Alumno = require('../models/Alumno');
const fs = require('fs');
const path = require('path');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');
const { aplicarRecargoMensualidadSegunConfig } = require('./mensualidadController');

const MONTO_TOLERANCIA_BS = 100;

function redondearMonto(valor) {
  return Number((Number(valor) || 0).toFixed(2));
}

function esEstatusInsolvente(estatus) {
  const normalizado = String(estatus || '').toLowerCase();
  return normalizado === 'retrasado' || normalizado === 'insolvente';
}

function normalizarMonto(value) {
  return Number(value);
}

function normalizarMontoBs(value) {
  if (value === undefined || value === null || value === '') return null;
  return Number(value);
}

function normalizarNotaPago(value) {
  return String(value || '').trim().slice(0, 500);
}

function normalizarTelefonoPago(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function normalizarBooleano(value) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return false;
}

function esRolAdmin(rol) {
  const normalizado = String(rol || '').trim().toLowerCase();
  return normalizado === 'admin' || normalizado === 'super_admin';
}

function construirRegistradoPor(req) {
  const rol = String(req?.user?.rol || '').trim().toLowerCase();
  const nombre = String(
    req?.user?.nombre
    || req?.user?.usuario
    || req?.user?.email
    || req?.user?.correo
    || ''
  ).trim();

  return {
    id_usuario: req?.user?.id || undefined,
    nombre,
    rol: rol || 'desconocido',
    origen: esRolAdmin(rol) ? 'admin_portal' : (rol ? 'usuario_portal' : 'desconocido')
  };
}

function enriquecerPagoConMontoEsperado(pago, mensualidad) {
  const pagoPlano = typeof pago?.toObject === 'function' ? pago.toObject() : { ...pago };
  const montoEsperadoPagoUsd = Number(pagoPlano?.monto_esperado_usd);
  const montoEsperadoPagoBs = Number(pagoPlano?.monto_esperado_bs);
  const montoEsperadoMensualidadUsd = Number(mensualidad?.monto_esperado);

  const montoEsperadoUsd = Number.isFinite(montoEsperadoPagoUsd)
    ? redondearMonto(montoEsperadoPagoUsd)
    : (Number.isFinite(montoEsperadoMensualidadUsd) ? redondearMonto(montoEsperadoMensualidadUsd) : undefined);

  const montoEsperadoBs = Number.isFinite(montoEsperadoPagoBs)
    ? redondearMonto(montoEsperadoPagoBs)
    : undefined;

  if (Number.isFinite(montoEsperadoUsd)) {
    pagoPlano.monto_esperado_usd = montoEsperadoUsd;
  }

  if (Number.isFinite(montoEsperadoBs)) {
    pagoPlano.monto_esperado_bs = montoEsperadoBs;
  }

  return pagoPlano;
}

function ordenarPagos(pagos = []) {
  return [...pagos].sort((a, b) => {
    const fechaA = new Date(a.fecha_pago || a.createdAt || 0).getTime();
    const fechaB = new Date(b.fecha_pago || b.createdAt || 0).getTime();
    if (fechaA !== fechaB) return fechaA - fechaB;

    const creadoA = new Date(a.createdAt || 0).getTime();
    const creadoB = new Date(b.createdAt || 0).getTime();
    return creadoA - creadoB;
  });
}

function eliminarArchivoComprobante(comprobanteUrl) {
  if (!comprobanteUrl) return;

  const rutaRelativa = comprobanteUrl.replace(/^\/+/, '');
  const rutaCompleta = path.join(__dirname, '..', rutaRelativa);

  try {
    if (fs.existsSync(rutaCompleta)) {
      fs.unlinkSync(rutaCompleta);
    }
  } catch (_) {
    // Si falla la limpieza del archivo no se debe bloquear la operación principal.
  }
}

function resolveTenantId(req) {
  return resolveRequestTenantId(req);
}

async function getTenantFinanceModels(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);

  return {
    PagoDetalle: getTenantModel(connection, 'PagoDetalle'),
    Mensualidad: getTenantModel(connection, 'Mensualidad'),
    Alumno: getTenantModel(connection, 'Alumno'),
    TenantConfig: getTenantModel(connection, 'TenantConfig')
  };
}

async function recalcularMensualidad(mensualidad, actorRol, estatusAnterior, models = {}) {
  const PagoDetalleModel = models.PagoDetalle || PagoDetalle;
  const AlumnoModel = models.Alumno || Alumno;

  await aplicarRecargoMensualidadSegunConfig(mensualidad, {
    models,
    persistir: false
  });

  const pagos = await PagoDetalleModel.find({ id_mensualidad: mensualidad._id });
  const totalPagado = redondearMonto(pagos.reduce((acc, pago) => acc + (Number(pago.monto_pagado) || 0), 0));
  const montoEsperado = redondearMonto(mensualidad.monto_esperado || 0);
  const tasaReferencia = obtenerTasaReferenciaDesdePagos(pagos);
  const toleranciaUsdLiquidacion = Number.isFinite(tasaReferencia) && tasaReferencia > 0
    ? redondearMonto(MONTO_TOLERANCIA_BS / tasaReferencia)
    : 0;
  const montoEsperadoConTolerancia = redondearMonto(Math.max(0, montoEsperado - toleranciaUsdLiquidacion));
  const cubreEsperadoConTolerancia = totalPagado >= montoEsperadoConTolerancia;
  const restante = cubreEsperadoConTolerancia
    ? 0
    : redondearMonto(Math.max(0, montoEsperado - totalPagado));
  const saldoGeneradoPrevio = redondearMonto(mensualidad.saldo_a_favor_generado || 0);
  const saldoGeneradoNuevo = redondearMonto(Math.max(0, totalPagado - montoEsperado));
  const deltaSaldo = redondearMonto(saldoGeneradoNuevo - saldoGeneradoPrevio);
  const requiereRevisionPagoCompleto = estatusAnterior === 'En revision' || actorRol === 'usuario';
  const estatusAnteriorNormalizado = String(estatusAnterior || '').toLowerCase();
  const estaVencida = mensualidad.fecha_vencimiento ? new Date(mensualidad.fecha_vencimiento) < new Date() : false;

  if (deltaSaldo !== 0) {
    const alumnoId = mensualidad.id_alumno?._id || mensualidad.id_alumno;
    if (alumnoId) {
      const alumno = await AlumnoModel.findById(alumnoId);
      if (alumno) {
        const saldoResultante = redondearMonto((alumno.saldo_a_favor_mensualidades || 0) + deltaSaldo);
        if (saldoResultante < 0) {
          throw new Error('El saldo a favor de esta mensualidad ya fue consumido en meses posteriores.');
        }
        alumno.saldo_a_favor_mensualidades = saldoResultante;
        await alumno.save();
      }
    }
  }

  mensualidad.saldo_a_favor_generado = saldoGeneradoNuevo;

  if (montoEsperado <= 0) {
    mensualidad.estatus = requiereRevisionPagoCompleto && totalPagado > 0 ? 'En revision' : 'Pagado';
  } else if (totalPagado <= 0) {
    mensualidad.estatus = (esEstatusInsolvente(estatusAnteriorNormalizado) || estaVencida) ? 'Insolvente' : 'Pendiente';
  } else if (cubreEsperadoConTolerancia) {
    mensualidad.estatus = requiereRevisionPagoCompleto ? 'En revision' : 'Pagado';
  } else {
    mensualidad.estatus = 'Abono';
  }

  await mensualidad.save();

  return {
    totalPagado,
    restante,
    estatus: mensualidad.estatus
  };
}

async function obtenerMensualidadConAlumno(idMensualidad) {
  return Mensualidad.findById(idMensualidad).populate('id_alumno');
}

async function obtenerMensualidadConAlumnoTenant(idMensualidad, models = {}) {
  const MensualidadModel = models.Mensualidad || Mensualidad;
  return MensualidadModel.findById(idMensualidad).populate('id_alumno');
}

function validarMontoBs(montoBs) {
  return montoBs === null || (!Number.isNaN(montoBs) && montoBs > 0);
}

function calcularToleranciaUsdDesdeBs(monto, montoBs) {
  const montoNum = Number(monto);
  const montoBsNum = Number(montoBs);
  if (!Number.isFinite(montoNum) || montoNum <= 0) return 0;
  if (!Number.isFinite(montoBsNum) || montoBsNum <= 0) return 0;

  const tasaAplicada = montoBsNum / montoNum;
  if (!Number.isFinite(tasaAplicada) || tasaAplicada <= 0) return 0;

  return redondearMonto(MONTO_TOLERANCIA_BS / tasaAplicada);
}

function obtenerTasaReferenciaDesdePagos(pagos = []) {
  if (!Array.isArray(pagos) || pagos.length === 0) return 0;

  const pagosOrdenados = ordenarPagos(pagos);
  const pagoRecienteConTasa = [...pagosOrdenados].reverse().find((pago) => {
    const montoUsd = Number(pago?.monto_pagado);
    const montoBs = Number(pago?.monto_pagado_bs);
    return Number.isFinite(montoUsd) && montoUsd > 0 && Number.isFinite(montoBs) && montoBs > 0;
  });

  if (!pagoRecienteConTasa) return 0;

  const tasa = Number(pagoRecienteConTasa.monto_pagado_bs) / Number(pagoRecienteConTasa.monto_pagado);
  return Number.isFinite(tasa) && tasa > 0 ? tasa : 0;
}

async function validarPago({
  mensualidad,
  monto,
  montoBs,
  pagoIdExcluir = null,
  actorRol = null,
  solicitaRevisionRecargo = false,
  models = {}
}) {
  const PagoDetalleModel = models.PagoDetalle || PagoDetalle;
  if (!mensualidad) return { error: { status: 404, payload: { error: 'Mensualidad no encontrada' } } };

  const habilitarCuotasAlumno = mensualidad.id_alumno?.habilitar_pago_cuotas === true;
  const puedePagarCuotas = esRolAdmin(actorRol) || habilitarCuotasAlumno;
  const permiteSobrepagoAdelantado = esRolAdmin(actorRol);
  const pagosPrevios = await PagoDetalleModel.find({ id_mensualidad: mensualidad._id });
  const totalPrevio = pagosPrevios
    .filter((pago) => String(pago._id) !== String(pagoIdExcluir))
    .reduce((acc, pago) => acc + (Number(pago.monto_pagado) || 0), 0);
  const restante = Math.max(0, (Number(mensualidad.monto_esperado) || 0) - totalPrevio);
  const toleranciaUsd = calcularToleranciaUsdDesdeBs(monto, montoBs);
  const totalConPagoActual = redondearMonto(totalPrevio + monto);
  const montoBaseSinRecargo = Number.isFinite(Number(mensualidad.monto_sin_recargo_usd))
    ? Number(mensualidad.monto_sin_recargo_usd)
    : redondearMonto((Number(mensualidad.monto_esperado) || 0) - (Number(mensualidad.recargo_aplicado_usd) || 0));
  const recargoAplicado = Number(mensualidad.recargo_aplicado_usd);
  const tieneRecargoAplicado = Number.isFinite(recargoAplicado) && recargoAplicado > 0;
  const baseSinRecargoValida = Number.isFinite(montoBaseSinRecargo) && montoBaseSinRecargo > 0;
  const cubreMontoBaseSinRecargo = baseSinRecargoValida && totalConPagoActual >= (montoBaseSinRecargo - toleranciaUsd);
  const permiteRevisionRecargoSinCuotas = solicitaRevisionRecargo && tieneRecargoAplicado && cubreMontoBaseSinRecargo;

  if (!monto || Number.isNaN(monto) || monto <= 0) {
    return { error: { status: 400, payload: { error: 'Monto pagado inválido' } } };
  }

  if (!validarMontoBs(montoBs)) {
    return { error: { status: 400, payload: { error: 'Monto pagado Bs inválido' } } };
  }

  if (restante <= 0 && !permiteSobrepagoAdelantado) {
    return { error: { status: 400, payload: { error: 'La mensualidad ya está pagada' } } };
  }

  if (!puedePagarCuotas && monto < restante && (restante - monto) > toleranciaUsd && !permiteRevisionRecargoSinCuotas) {
    return { error: { status: 400, payload: { error: 'Este alumno no tiene habilitado pago en cuotas' } } };
  }

  if (monto > restante && !permiteSobrepagoAdelantado && (monto - restante) > toleranciaUsd) {
    return { error: { status: 400, payload: { error: 'El monto excede el saldo pendiente' } } };
  }

  const montoARegistrar = redondearMonto(monto);

  return {
    totalPrevio,
    restante,
    habilitarCuotas: puedePagarCuotas,
    montoARegistrar,
    toleranciaUsd
  };
}

// Registrar un pago y actualizar mensualidad
exports.registrarPago = async (req, res) => {
  try {
    const tenantModels = await getTenantFinanceModels(req);
    const { PagoDetalle: TenantPagoDetalle } = tenantModels;
    const {
      id_mensualidad,
      monto_pagado,
      monto_pagado_bs,
      monto_esperado_usd,
      monto_esperado_bs,
      fecha_pago,
      metodo_pago,
      referencia,
      telefono_pago,
      nota,
      solicita_revision_recargo
    } = req.body;
    const comprobante_url = req.file
      ? `/uploads/${resolveTenantId(req)}/comprobantes/${req.file.filename}`
      : null;
    if (!id_mensualidad) return res.status(400).json({ error: 'id_mensualidad requerido' });
    const monto = normalizarMonto(monto_pagado);
    const montoBs = normalizarMontoBs(monto_pagado_bs);
    const montoEsperadoUsd = normalizarMonto(monto_esperado_usd);
    const montoEsperadoBs = normalizarMontoBs(monto_esperado_bs);
    const mensualidad = await obtenerMensualidadConAlumnoTenant(id_mensualidad, tenantModels);
    const solicitaRevisionRecargo = normalizarBooleano(solicita_revision_recargo);
    const validacion = await validarPago({
      mensualidad,
      monto,
      montoBs,
      actorRol: req.user?.rol,
      solicitaRevisionRecargo,
      models: tenantModels
    });
    if (validacion.error) {
      return res.status(validacion.error.status).json(validacion.error.payload);
    }

    await TenantPagoDetalle.create({
      id_mensualidad,
      monto_pagado: validacion.montoARegistrar,
      monto_pagado_bs: montoBs,
      monto_esperado_usd: Number.isFinite(montoEsperadoUsd) ? redondearMonto(montoEsperadoUsd) : undefined,
      monto_esperado_bs: montoEsperadoBs !== null ? redondearMonto(montoEsperadoBs) : undefined,
      nota: normalizarNotaPago(nota),
      solicita_revision_recargo: solicitaRevisionRecargo,
      fecha_pago,
      metodo_pago,
      referencia,
      telefono_pago: normalizarTelefonoPago(telefono_pago),
      comprobante_url,
      registrado_por: construirRegistradoPor(req)
    });

    const resultado = await recalcularMensualidad(mensualidad, req.user?.rol, mensualidad.estatus, tenantModels);
    res.json({
      message: 'Pago registrado y mensualidad actualizada',
      total_pagado: resultado.totalPagado,
      restante: resultado.restante,
      estatus: resultado.estatus
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.editarPago = async (req, res) => {
  try {
    const tenantModels = await getTenantFinanceModels(req);
    const { PagoDetalle: TenantPagoDetalle } = tenantModels;
    const {
      monto_pagado,
      monto_pagado_bs,
      monto_esperado_usd,
      monto_esperado_bs,
      fecha_pago,
      metodo_pago,
      referencia,
      telefono_pago,
      nota,
      solicita_revision_recargo,
      eliminar_comprobante
    } = req.body;
    const pago = await TenantPagoDetalle.findById(req.params.id_pago);
    if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });

    const mensualidad = await obtenerMensualidadConAlumnoTenant(pago.id_mensualidad, tenantModels);
    const monto = normalizarMonto(monto_pagado);
    const montoBs = normalizarMontoBs(monto_pagado_bs);
    const montoEsperadoUsd = normalizarMonto(monto_esperado_usd);
    const montoEsperadoBs = normalizarMontoBs(monto_esperado_bs);
    const solicitaRevisionRecargo = solicita_revision_recargo !== undefined
      ? normalizarBooleano(solicita_revision_recargo)
      : normalizarBooleano(pago.solicita_revision_recargo);
    const validacion = await validarPago({
      mensualidad,
      monto,
      montoBs,
      pagoIdExcluir: pago._id,
      actorRol: req.user?.rol,
      solicitaRevisionRecargo,
      models: tenantModels
    });

    if (validacion.error) {
      return res.status(validacion.error.status).json(validacion.error.payload);
    }

    const comprobanteAnterior = pago.comprobante_url;
    pago.monto_pagado = validacion.montoARegistrar;
    pago.monto_pagado_bs = montoBs;
    if (Number.isFinite(montoEsperadoUsd)) {
      pago.monto_esperado_usd = redondearMonto(montoEsperadoUsd);
    }
    if (montoEsperadoBs !== null) {
      pago.monto_esperado_bs = redondearMonto(montoEsperadoBs);
    }
    pago.fecha_pago = fecha_pago;
    pago.metodo_pago = metodo_pago;
    pago.referencia = referencia;
    if (telefono_pago !== undefined) {
      pago.telefono_pago = normalizarTelefonoPago(telefono_pago);
    }
    if (nota !== undefined) {
      pago.nota = normalizarNotaPago(nota);
    }
    if (solicita_revision_recargo !== undefined) {
      pago.solicita_revision_recargo = solicitaRevisionRecargo;
    }

    if (req.file) {
      pago.comprobante_url = `/uploads/${resolveTenantId(req)}/comprobantes/${req.file.filename}`;
    } else if (eliminar_comprobante === 'true') {
      pago.comprobante_url = null;
    }

    await pago.save();

    if ((req.file || eliminar_comprobante === 'true') && comprobanteAnterior && comprobanteAnterior !== pago.comprobante_url) {
      eliminarArchivoComprobante(comprobanteAnterior);
    }

    const resultado = await recalcularMensualidad(mensualidad, req.user?.rol, mensualidad.estatus, tenantModels);

    res.json({
      message: 'Pago actualizado correctamente',
      pago,
      total_pagado: resultado.totalPagado,
      restante: resultado.restante,
      estatus: resultado.estatus
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.eliminarPago = async (req, res) => {
  try {
    const tenantModels = await getTenantFinanceModels(req);
    const { PagoDetalle: TenantPagoDetalle } = tenantModels;
    const pago = await TenantPagoDetalle.findById(req.params.id_pago);
    if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });

    const mensualidad = await obtenerMensualidadConAlumnoTenant(pago.id_mensualidad, tenantModels);
    const comprobanteAnterior = pago.comprobante_url;
    const estatusAnterior = mensualidad?.estatus;

    if (typeof pago.deleteOne === 'function') {
      await pago.deleteOne();
    } else {
      await TenantPagoDetalle.findByIdAndDelete(req.params.id_pago);
    }

    eliminarArchivoComprobante(comprobanteAnterior);

    const resultado = await recalcularMensualidad(mensualidad, req.user?.rol, estatusAnterior, tenantModels);

    res.json({
      message: 'Pago eliminado correctamente',
      total_pagado: resultado.totalPagado,
      restante: resultado.restante,
      estatus: resultado.estatus
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Consultar pagos por mensualidad
exports.getPagosPorMensualidad = async (req, res) => {
  try {
    const tenantModels = await getTenantFinanceModels(req);
    const { PagoDetalle: TenantPagoDetalle, Mensualidad: TenantMensualidad } = tenantModels;
    const [pagos, mensualidad] = await Promise.all([
      TenantPagoDetalle.find({ id_mensualidad: req.params.id_mensualidad }),
      TenantMensualidad.findById(req.params.id_mensualidad).select('monto_esperado')
    ]);

    res.json(
      ordenarPagos(pagos).map((pago) => enriquecerPagoConMontoEsperado(pago, mensualidad))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
