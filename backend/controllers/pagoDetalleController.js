const PagoDetalle = require('../models/PagoDetalle');
const Mensualidad = require('../models/Mensualidad');
const Alumno = require('../models/Alumno');
const fs = require('fs');
const path = require('path');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');
const { aplicarRecargoMensualidadSegunConfig, prepararRetiroRecargoAgrupado } = require('./mensualidadController');
const { aplicarSession, ejecutarConTransaccion } = require('../services/financeTransaction');
const { obtenerTasaPagoPorFecha } = require('../services/paymentExchangeRate');
const { cotizarCreditosAlumno, aplicarCreditoMensualidad } = require('../services/monthlyCredit');

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
    PagoAgrupado: getTenantModel(connection, 'PagoAgrupado'),
    Mensualidad: getTenantModel(connection, 'Mensualidad'),
    Alumno: getTenantModel(connection, 'Alumno'),
    Representante: getTenantModel(connection, 'Representante'),
    TenantConfig: getTenantModel(connection, 'TenantConfig')
  };
}

async function recalcularMensualidad(mensualidad, actorRol, estatusAnterior, models = {}, options = {}) {
  const PagoDetalleModel = models.PagoDetalle || PagoDetalle;
  const AlumnoModel = models.Alumno || Alumno;
  const { session } = options;

  await aplicarRecargoMensualidadSegunConfig(mensualidad, {
    models,
    persistir: false
  });

  const pagos = await aplicarSession(PagoDetalleModel.find({ id_mensualidad: mensualidad._id }), session);
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
      const alumno = await aplicarSession(AlumnoModel.findById(alumnoId), session);
      if (session && !alumno) throw errorPagoAgrupado(409, 'No se encontro el alumno para actualizar su saldo a favor.');
      if (alumno) {
        const saldoResultante = redondearMonto((alumno.saldo_a_favor_mensualidades || 0) + deltaSaldo);
        if (saldoResultante < 0) {
          throw new Error('El saldo a favor de esta mensualidad ya fue consumido en meses posteriores.');
        }
        alumno.saldo_a_favor_mensualidades = saldoResultante;
        await alumno.save(session ? { session } : undefined);
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

  await mensualidad.save(session ? { session } : undefined);

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
  models = {},
  session
}) {
  const PagoDetalleModel = models.PagoDetalle || PagoDetalle;
  if (!mensualidad) return { error: { status: 404, payload: { error: 'Mensualidad no encontrada' } } };

  const habilitarCuotasAlumno = mensualidad.id_alumno?.habilitar_pago_cuotas === true;
  const puedePagarCuotas = esRolAdmin(actorRol) || habilitarCuotasAlumno;
  const permiteSobrepagoAdelantado = esRolAdmin(actorRol);
  const pagosPrevios = await aplicarSession(PagoDetalleModel.find({ id_mensualidad: mensualidad._id }), session);
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

function parseAsignacionesAgrupadas(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function mensualidadEsAnterior(candidata, seleccionada) {
  const periodoCandidata = (Number(candidata.anio) * 12) + Number(candidata.mes);
  const periodoSeleccionado = (Number(seleccionada.anio) * 12) + Number(seleccionada.mes);
  return periodoCandidata < periodoSeleccionado;
}

async function usuarioPuedePagarMensualidad(req, mensualidad, RepresentanteModel, session) {
  if (req.user?.rol !== 'usuario') return true;
  const alumno = mensualidad?.id_alumno;
  if (!alumno) return false;
  if (alumno.usuario && String(alumno.usuario) === String(req.user.id)) return true;
  if (!alumno.representante) return false;
  const representante = await aplicarSession(RepresentanteModel.findById(alumno.representante).select('usuario'), session);
  return Boolean(representante && String(representante.usuario) === String(req.user.id));
}

async function validarPropietarioPagoAgrupado(req, grupo, models, session) {
  if (req.user?.rol !== 'usuario') return;
  const representante = await aplicarSession(models.Representante.findById(grupo.representante).select('usuario'), session);
  if (!representante?.usuario || !req.user?.id || String(representante.usuario) !== String(req.user.id)) {
    throw errorPagoAgrupado(403, 'No tienes permiso para este pago agrupado.');
  }
}

async function cotizarCreditoRegistro(mensualidad, models, session) {
  const id = mensualidad.id_alumno?._id || mensualidad.id_alumno;
  return cotizarCreditosAlumno(id, models, { session,
    prepararMensualidad: (item) => aplicarRecargoMensualidadSegunConfig(item, { models, persistir: false }) });
}

function validarCreditoDeclarado(declarado, credito) {
  if (declarado !== undefined && (!Number.isFinite(Number(declarado))
    || Math.round(Number(declarado) * 100) !== Math.round(credito * 100))) {
    throw errorPagoAgrupado(409, 'El saldo a favor cambio. Actualiza las mensualidades antes de pagar.');
  }
}

exports.registrarPagoAgrupado = async (req, res) => {
  let cabeceraCreada = null;
  let detallesCreados = [];
  let mensualidadesValidadas = [];
  let models = null;
  const estadosOriginales = new Map();
  let transaccionObligatoria = false;
  let usoFallback = false;
  let completado = false;

  try {
    models = await getTenantFinanceModels(req);
    const { PagoAgrupado, PagoDetalle: TenantPagoDetalle, Mensualidad: TenantMensualidad, Representante: TenantRepresentante } = models;
    const asignaciones = parseAsignacionesAgrupadas(req.body?.asignaciones);
    const ids = asignaciones.map((item) => String(item?.id_mensualidad || '')).filter(Boolean);
    const idsUnicos = [...new Set(ids)];

    if (ids.length < 2 || idsUnicos.length !== ids.length) {
      return res.status(400).json({ error: 'Debes seleccionar mensualidades de al menos dos atletas, sin duplicados' });
    }

    for (const idMensualidad of idsUnicos) {
      const mensualidad = await TenantMensualidad.findById(idMensualidad)
        .populate('id_alumno', 'nombres apellidos usuario representante saldo_a_favor_mensualidades');
      if (!mensualidad?.id_alumno) {
        return res.status(404).json({ error: 'Una de las mensualidades no existe' });
      }
      if (!(await usuarioPuedePagarMensualidad(req, mensualidad, TenantRepresentante))) {
        return res.status(403).json({ error: 'No tienes permiso para una de las mensualidades seleccionadas' });
      }

      estadosOriginales.set(String(mensualidad._id), {
        estatus: mensualidad.estatus,
        monto_esperado: mensualidad.monto_esperado,
        recargo_aplicado_usd: mensualidad.recargo_aplicado_usd,
        monto_con_recargo_usd: mensualidad.monto_con_recargo_usd,
        fecha_aplicacion_recargo: mensualidad.fecha_aplicacion_recargo,
        saldo_a_favor_generado: mensualidad.saldo_a_favor_generado
      });
      await aplicarRecargoMensualidadSegunConfig(mensualidad, { models, persistir: false });
      mensualidadesValidadas.push(mensualidad);
    }

    const atletas = new Set(mensualidadesValidadas.map((mensualidad) => String(mensualidad.id_alumno._id)));
    if (atletas.size < 2) {
      return res.status(400).json({ error: 'El pago agrupado requiere al menos dos atletas distintos' });
    }

    const estadosBloqueantes = ['Pendiente', 'Retrasado', 'Insolvente', 'Abono'];
    const asignacionesCalculadas = [];
    for (const mensualidad of mensualidadesValidadas) {
      if (!estadosBloqueantes.includes(mensualidad.estatus)) {
        return res.status(400).json({ error: 'Solo puedes incluir mensualidades pendientes de pago' });
      }

      const mensualidadesAtleta = await TenantMensualidad.find({
        id_alumno: mensualidad.id_alumno._id,
        estatus: { $in: estadosBloqueantes }
      }).select('_id mes anio');
      const deudaAnterior = mensualidadesAtleta.some((item) => mensualidadEsAnterior(item, mensualidad));
      if (deudaAnterior) {
        return res.status(400).json({
          error: `${mensualidad.id_alumno.nombres || 'El atleta'} debe pagar primero su mensualidad más antigua`
        });
      }

      const pagosPrevios = await TenantPagoDetalle.find({ id_mensualidad: mensualidad._id });
      const totalPrevio = redondearMonto(pagosPrevios.reduce((total, pago) => total + (Number(pago.monto_pagado) || 0), 0));
      const cotizacion = await cotizarCreditoRegistro(mensualidad, models);
      const credito = cotizacion.proyecciones.get(String(mensualidad._id))?.credito_a_aplicar || 0;
      validarCreditoDeclarado(asignaciones.find((item) => String(item.id_mensualidad) === String(mensualidad._id))?.credito_a_aplicar, credito);
      const restante = redondearMonto((Number(mensualidad.monto_esperado) || 0) - totalPrevio - credito);
      if (restante <= 0) {
        return res.status(409).json({ error: 'Una mensualidad se cubre con saldo a favor. Aplica ese credito desde su detalle antes de agrupar.' });
      }
      transaccionObligatoria = transaccionObligatoria || credito > 0;
      asignacionesCalculadas.push({ mensualidad, monto: restante, credito, version: versionPagoAgrupado(mensualidad) });
    }

    const montoTotal = redondearMonto(asignacionesCalculadas.reduce((total, item) => total + item.monto, 0));
    const montoTotalDeclarado = normalizarMonto(req.body?.monto_total);
    if (!Number.isFinite(montoTotalDeclarado) || Math.abs(montoTotalDeclarado - montoTotal) > 0.01) {
      return res.status(400).json({ error: 'El monto debe cubrir exactamente todas las mensualidades seleccionadas' });
    }
    const montoTotalBs = normalizarMontoBs(req.body?.monto_total_bs);
    if (!montoTotalBs || montoTotalBs <= 0) {
      return res.status(400).json({ error: 'Monto total en Bs inválido' });
    }
    const tasaAplicada = redondearMonto(montoTotalBs / montoTotal);
    const comprobanteUrl = req.file
      ? `/uploads/${resolveTenantId(req)}/comprobantes/${req.file.filename}`
      : null;
    const representanteIds = [...new Set(mensualidadesValidadas
      .map((item) => item.id_alumno.representante)
      .filter(Boolean)
      .map(String))];
    if (representanteIds.length !== 1 || mensualidadesValidadas.some((item) => !item.id_alumno.representante)) {
      return res.status(400).json({ error: 'Todas las atletas deben pertenecer al mismo representante' });
    }
    const codigo = `PA-${Date.now()}-${Math.round(Math.random() * 1e6)}`;

    const resultado = await ejecutarConTransaccion(PagoAgrupado, async (session) => {
      usoFallback = !session;
      for (const item of asignacionesCalculadas) {
        if (!session && item.credito <= 0) continue;
        const vigente = await aplicarSession(TenantMensualidad.findById(item.mensualidad._id).populate('id_alumno'), session);
        if (!vigente || versionPagoAgrupado(vigente) !== item.version
          || !(await usuarioPuedePagarMensualidad(req, vigente, TenantRepresentante, session))) {
          throw errorPagoAgrupado(409, 'Una mensualidad cambio. Actualiza las mensualidades antes de pagar.');
        }
        await aplicarRecargoMensualidadSegunConfig(vigente, { models, persistir: false });
        const cotizacion = await cotizarCreditoRegistro(vigente, models, session);
        const credito = cotizacion.proyecciones.get(String(vigente._id))?.credito_a_aplicar || 0;
        validarCreditoDeclarado(item.credito, credito);
        await aplicarCreditoMensualidad(vigente, cotizacion, { session, actor: req.user });
        item.mensualidad = vigente;
      }
      const [cabecera] = await PagoAgrupado.create([{
        codigo,
        representante: representanteIds[0],
        monto_total: montoTotal,
        monto_total_bs: redondearMonto(montoTotalBs),
        tasa_aplicada: tasaAplicada,
        fecha_pago: req.body?.fecha_pago,
        metodo_pago: req.body?.metodo_pago,
        referencia: req.body?.referencia,
        telefono_pago: normalizarTelefonoPago(req.body?.telefono_pago),
        cedula_titular: String(req.body?.cedula_titular || '').trim(),
        comprobante_url: comprobanteUrl,
        nota: normalizarNotaPago(req.body?.nota),
        cantidad_atletas: atletas.size,
        registrado_por: construirRegistradoPor(req)
      }], session ? { session } : undefined);
      cabeceraCreada = cabecera;

      let bsAsignados = 0;
      const detalles = [];
      for (let index = 0; index < asignacionesCalculadas.length; index += 1) {
        const item = asignacionesCalculadas[index];
        const esUltima = index === asignacionesCalculadas.length - 1;
        const montoBs = esUltima
          ? redondearMonto(montoTotalBs - bsAsignados)
          : redondearMonto(item.monto * tasaAplicada);
        bsAsignados = redondearMonto(bsAsignados + montoBs);
        const [detalle] = await TenantPagoDetalle.create([{
          id_mensualidad: item.mensualidad._id,
          id_pago_agrupado: cabecera._id,
          monto_pagado: item.monto,
          monto_pagado_bs: montoBs,
          monto_original_usd: item.monto,
          monto_original_bs: montoBs,
          monto_aplicado_usd: item.monto,
          monto_aplicado_bs: montoBs,
          monto_esperado_usd: item.monto,
          monto_esperado_bs: montoBs,
          fecha_pago: req.body?.fecha_pago,
          metodo_pago: req.body?.metodo_pago,
          referencia: req.body?.referencia,
          telefono_pago: normalizarTelefonoPago(req.body?.telefono_pago),
          cedula_titular: String(req.body?.cedula_titular || '').trim(),
          comprobante_url: comprobanteUrl,
          nota: normalizarNotaPago(req.body?.nota),
          registrado_por: construirRegistradoPor(req)
        }], session ? { session } : undefined);
        detalles.push(detalle);
      }
      detallesCreados = detalles;

      for (const item of asignacionesCalculadas) {
        await recalcularMensualidad(item.mensualidad, req.user?.rol, item.mensualidad.estatus, models, { session });
      }

      return { cabecera, detalles };
    }, { obligatoria: transaccionObligatoria });

    completado = true;
    return res.status(201).json({
      message: 'Pago agrupado registrado y enviado a revisión',
      pago_agrupado_id: resultado.cabecera._id,
      codigo: resultado.cabecera.codigo,
      monto_total: montoTotal,
      monto_total_bs: redondearMonto(montoTotalBs),
      atletas: atletas.size,
      asignaciones: resultado.detalles.length
    });
  } catch (error) {
    if (models && usoFallback) {
      if (detallesCreados.length) {
        await models.PagoDetalle.deleteMany({ _id: { $in: detallesCreados.map((item) => item._id) } }).catch(() => {});
      }
      if (cabeceraCreada) {
        await models.PagoAgrupado.deleteOne({ _id: cabeceraCreada._id }).catch(() => {});
      }
      for (const mensualidad of mensualidadesValidadas) {
        const original = estadosOriginales.get(String(mensualidad._id));
        if (!original) continue;
        Object.assign(mensualidad, original);
        await mensualidad.save().catch(() => {});
      }
    }
    return res.status(error.status || 500).json({ error: error.message || 'Error al registrar el pago agrupado' });
  } finally {
    if (!completado && req.file) eliminarArchivoComprobante(`/uploads/${resolveTenantId(req)}/comprobantes/${req.file.filename}`);
  }
};

function errorPagoAgrupado(status, mensaje) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

function versionPagoAgrupado(pago) {
  return `${pago.__v || 0}:${new Date(pago.updatedAt || pago.createdAt || 0).toISOString()}`;
}

function montoEnCentavos(value) {
  const numero = Number(value);
  const centavos = Math.round(numero * 100);
  if (!Number.isFinite(numero) || numero <= 0 || !Number.isSafeInteger(centavos)
    || centavos <= 0 || Math.abs(numero * 100 - centavos) > 0.000001) {
    throw errorPagoAgrupado(400, 'Los importes deben ser positivos y tener como maximo dos decimales.');
  }
  return centavos;
}

function repartirBsAgrupados(importes, totalBs, total) {
  const partes = importes.map((importe, index) => {
    const numerador = BigInt(importe) * BigInt(totalBs);
    const denominador = BigInt(total);
    return { index, centavos: Number(numerador / denominador), resto: numerador % denominador };
  });
  const faltantes = totalBs - partes.reduce((suma, parte) => suma + parte.centavos, 0);
  const ordenadas = [...partes].sort((primera, segunda) => primera.resto === segunda.resto
    ? primera.index - segunda.index : (primera.resto > segunda.resto ? -1 : 1));
  for (let index = 0; index < faltantes; index += 1) ordenadas[index % ordenadas.length].centavos += 1;
  if (partes.some((parte) => parte.centavos <= 0)) {
    throw errorPagoAgrupado(400, 'El total en Bs es insuficiente para las asignaciones.');
  }
  return partes.map((parte) => parte.centavos / 100);
}

async function monedaPagoAgrupado(models, session) {
  const config = await aplicarSession(models.TenantConfig.findOne({ key: 'default' }).select('cobro').lean(), session);
  return String(config?.cobro?.moneda || 'USD').toUpperCase() === 'EUR' ? 'EUR' : 'USD';
}

exports.getTasaPagoAgrupado = async (req, res) => {
  try {
    const models = await getTenantFinanceModels(req);
    const grupo = await models.PagoAgrupado.findById(req.params.id);
    if (!grupo) throw errorPagoAgrupado(404, 'Pago agrupado no encontrado');
    await validarPropietarioPagoAgrupado(req, grupo, models);
    const moneda = await monedaPagoAgrupado(models);
    const cotizacion = await obtenerTasaPagoPorFecha(req.query.fecha, moneda);
    return res.json({ ...cotizacion, fecha_pago: req.query.fecha });
  } catch (error) {
    return res.status(error.status || (error.name === 'CastError' ? 400 : 500)).json({ error: error.message });
  }
};

exports.getPagoAgrupado = async (req, res) => {
  try {
    const models = await getTenantFinanceModels(req);
    const grupo = await models.PagoAgrupado.findById(req.params.id);
    if (!grupo) return res.status(404).json({ error: 'Pago agrupado no encontrado' });
    await validarPropietarioPagoAgrupado(req, grupo, models);
    const detalles = await models.PagoDetalle.find({ id_pago_agrupado: grupo._id }).sort({ _id: 1 });
    const asignaciones = [];
    for (const detalle of detalles) {
      const mensualidad = await models.Mensualidad.findById(detalle.id_mensualidad).populate('id_alumno');
      if (!mensualidad?.id_alumno) throw errorPagoAgrupado(409, 'Una mensualidad del grupo ya no existe.');
      if (!(await usuarioPuedePagarMensualidad(req, mensualidad, models.Representante))) {
        throw errorPagoAgrupado(403, 'No tienes permiso para una de las mensualidades del grupo.');
      }
      await aplicarRecargoMensualidadSegunConfig(mensualidad, { models, persistir: false });
      const pagos = await models.PagoDetalle.find({ id_mensualidad: mensualidad._id });
      const otros = pagos.filter((pago) => String(pago._id) !== String(detalle._id))
        .reduce((total, pago) => total + Number(pago.monto_pagado || 0), 0);
      asignaciones.push({
        id_pago: detalle._id,
        id_mensualidad: mensualidad._id,
        alumno_nombre: `${mensualidad.id_alumno.nombres || ''} ${mensualidad.id_alumno.apellidos || ''}`.trim(),
        mes: mensualidad.mes,
        anio: mensualidad.anio,
        monto_pagado: detalle.monto_pagado,
        monto_pagado_bs: detalle.monto_pagado_bs,
        version_mensualidad: versionPagoAgrupado(mensualidad),
        monto_sin_recargo_usd: mensualidad.monto_sin_recargo_usd,
        recargo_aplicado_usd: mensualidad.recargo_aplicado_usd,
        monto_pendiente: redondearMonto(Math.max(0, Number(mensualidad.monto_esperado || 0) - otros))
      });
    }
    const topologia = await models.PagoAgrupado.db.db.admin().command({ hello: 1 });
    return res.json({ pago: grupo, version: versionPagoAgrupado(grupo), asignaciones,
      transacciones_disponibles: Boolean(topologia.setName || topologia.msg === 'isdbgrid') });
  } catch (error) {
    return res.status(error.status || (error.name === 'CastError' ? 400 : 500)).json({ error: error.message });
  }
};

exports.editarPagoAgrupado = async (req, res) => {
  let guardado = false;
  try {
    const models = await getTenantFinanceModels(req);
    const body = req.body || {};
    const totalCentavos = montoEnCentavos(body.monto_total);
    const totalBsCentavos = montoEnCentavos(body.monto_total_bs);
    const asignaciones = parseAsignacionesAgrupadas(body.asignaciones);
    if (asignaciones.length < 2 || new Set(asignaciones.map((item) => String(item.id_pago))).size !== asignaciones.length) {
      throw errorPagoAgrupado(400, 'Debes enviar todas las asignaciones del grupo, sin duplicados.');
    }
    const importes = asignaciones.map((item) => montoEnCentavos(item.monto_pagado));
    if (importes.reduce((suma, monto) => suma + monto, 0) !== totalCentavos) {
      throw errorPagoAgrupado(400, 'La suma de las asignaciones debe coincidir exactamente con el total.');
    }
    const metodo = String(body.metodo_pago || '').trim();
    if (!['Pago movil', 'Transferencia', 'Efectivo'].includes(metodo)) {
      throw errorPagoAgrupado(400, 'Metodo de pago invalido.');
    }
    const referencia = String(body.referencia || '').trim();
    if (metodo !== 'Efectivo' && !/^\d{6,}$/.test(referencia)) {
      throw errorPagoAgrupado(400, 'La referencia debe contener al menos seis digitos.');
    }
    const fecha = String(body.fecha_pago || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(new Date(fecha).getTime())
      || new Date(fecha).toISOString().slice(0, 10) !== fecha) {
      throw errorPagoAgrupado(400, 'Fecha de pago invalida.');
    }
    const moneda = await monedaPagoAgrupado(models);
    const cotizacion = await obtenerTasaPagoPorFecha(fecha, moneda);
    if (totalCentavos !== Math.round(totalBsCentavos / cotizacion.tasa)) {
      throw errorPagoAgrupado(400, 'El total convertido no coincide con la tasa oficial de la fecha de pago. Actualiza el editor.');
    }
    const resultado = await ejecutarConTransaccion(models.PagoAgrupado, async (session) => {
      const grupo = await aplicarSession(models.PagoAgrupado.findById(req.params.id), session);
      if (!grupo) throw errorPagoAgrupado(404, 'Pago agrupado no encontrado.');
      await validarPropietarioPagoAgrupado(req, grupo, models, session);
      if (grupo.estado !== 'En revision') throw errorPagoAgrupado(409, 'Solo se pueden editar pagos agrupados en revision.');
      if (body.version !== versionPagoAgrupado(grupo)) {
        throw errorPagoAgrupado(409, 'El grupo cambio desde que lo abriste. Cierra y vuelve a abrir el editor.');
      }
      if (await monedaPagoAgrupado(models, session) !== moneda) {
        throw errorPagoAgrupado(409, 'La moneda configurada cambio. Actualiza el editor.');
      }
      const detalles = await aplicarSession(models.PagoDetalle.find({ id_pago_agrupado: grupo._id }).sort({ _id: 1 }), session);
      const porId = new Map(detalles.map((detalle) => [String(detalle._id), detalle]));
      if (detalles.length !== asignaciones.length || asignaciones.some((item) => !porId.has(String(item.id_pago)))
        || new Set(detalles.map((detalle) => String(detalle.id_mensualidad))).size !== detalles.length) {
        throw errorPagoAgrupado(409, 'Las asignaciones deben ser exactamente las del grupo original.');
      }
      const pesos = detalles.map((detalle) => montoEnCentavos(detalle.monto_pagado));
      const sumaPesos = pesos.reduce((suma, peso) => suma + peso, 0);
      const convertidos = repartirBsAgrupados(pesos, totalCentavos, sumaPesos);
      const bolivares = repartirBsAgrupados(pesos, totalBsCentavos, sumaPesos);
      const importesBs = asignaciones.map((item, index) => {
        const posicion = detalles.findIndex((detalle) => String(detalle._id) === String(item.id_pago));
        if (importes[index] !== Math.round(convertidos[posicion] * 100)) {
          throw errorPagoAgrupado(409, 'El reparto debe corresponder a la tasa oficial y a la proporcion original de cada atleta.');
        }
        return bolivares[posicion];
      });
      const mensualidades = [];
      const esperados = new Map();
      for (const detalle of detalles) {
        const mensualidad = await aplicarSession(models.Mensualidad.findById(detalle.id_mensualidad).populate('id_alumno'), session);
        if (!mensualidad?.id_alumno || String(mensualidad.id_alumno.representante) !== String(grupo.representante)) {
          throw errorPagoAgrupado(409, 'Una mensualidad ya no pertenece al representante del grupo.');
        }
        if (!(await usuarioPuedePagarMensualidad(req, mensualidad, models.Representante, session))) {
          throw errorPagoAgrupado(403, 'No tienes permiso para una de las mensualidades del grupo.');
        }
        await aplicarRecargoMensualidadSegunConfig(mensualidad, { models, persistir: false });
        const pagos = await aplicarSession(models.PagoDetalle.find({ id_mensualidad: mensualidad._id }), session);
        const otros = pagos.filter((pago) => String(pago._id) !== String(detalle._id))
          .reduce((suma, pago) => suma + Number(pago.monto_pagado || 0), 0);
        const pendiente = Math.max(0, Math.round(redondearMonto(Number(mensualidad.monto_esperado || 0) - otros) * 100));
        const index = asignaciones.findIndex((item) => String(item.id_pago) === String(detalle._id));
        if (importes[index] < pendiente) {
          throw errorPagoAgrupado(409, `La asignacion de ${mensualidad.id_alumno.nombres || 'un atleta'} debe cubrir su saldo (${(pendiente / 100).toFixed(2)}).`);
        }
        esperados.set(String(detalle._id), pendiente);
        mensualidades.push(mensualidad);
      }
      if (new Set(mensualidades.map((mensualidad) => String(mensualidad.id_alumno._id))).size !== grupo.cantidad_atletas) {
        throw errorPagoAgrupado(409, 'La cantidad de atletas del grupo no coincide con sus asignaciones.');
      }
      const campos = {
        fecha_pago: new Date(fecha),
        metodo_pago: metodo,
        referencia: metodo === 'Efectivo' ? '' : referencia,
        telefono_pago: normalizarTelefonoPago(body.telefono_pago),
        cedula_titular: String(body.cedula_titular || '').trim(),
        nota: normalizarNotaPago(body.nota),
        comprobante_url: req.file ? `/uploads/${resolveTenantId(req)}/comprobantes/${req.file.filename}` : grupo.comprobante_url
      };
      const antes = {
        ...Object.fromEntries(Object.keys(campos).map((campo) => [campo, grupo[campo]])),
        monto_total: grupo.monto_total,
        monto_total_bs: grupo.monto_total_bs,
        tasa_aplicada: grupo.tasa_aplicada,
        asignaciones: detalles.map((detalle) => ({ id_pago: detalle._id, monto_pagado: detalle.monto_pagado, monto_pagado_bs: detalle.monto_pagado_bs }))
      };
      Object.assign(grupo, campos, {
        monto_total: totalCentavos / 100,
        monto_total_bs: totalBsCentavos / 100,
        tasa_aplicada: cotizacion.tasa
      });
      grupo.ediciones = grupo.ediciones || [];
      grupo.ediciones.push({
        usuario: req.user?.id,
        fecha: new Date(),
        antes,
        despues: { ...campos, monto_total: grupo.monto_total, monto_total_bs: grupo.monto_total_bs,
          tasa_aplicada: cotizacion.tasa, fecha_tasa: cotizacion.fecha_tasa, moneda,
          asignaciones: asignaciones.map((item, index) => ({ id_pago: item.id_pago, monto_pagado: importes[index] / 100, monto_pagado_bs: importesBs[index] })) }
      });
      grupo.increment();
      await grupo.save({ session });
      for (let index = 0; index < asignaciones.length; index += 1) {
        const detalle = porId.get(String(asignaciones[index].id_pago));
        Object.assign(detalle, campos, {
          monto_pagado: importes[index] / 100,
          monto_pagado_bs: importesBs[index],
          monto_original_usd: importes[index] / 100,
          monto_original_bs: importesBs[index],
          monto_aplicado_usd: importes[index] / 100,
          monto_aplicado_bs: importesBs[index],
          monto_esperado_usd: esperados.get(String(detalle._id)) / 100,
          monto_esperado_bs: redondearMonto((esperados.get(String(detalle._id)) / 100) * cotizacion.tasa)
        });
        await detalle.save({ session });
      }
      for (const mensualidad of mensualidades) {
        await recalcularMensualidad(mensualidad, 'usuario', 'En revision', models, { session });
      }
      return { id: grupo._id, codigo: grupo.codigo, mensualidades_actualizadas: mensualidades.length };
    }, { obligatoria: true });
    guardado = true;
    return res.json({ message: 'Pago agrupado actualizado correctamente', ...resultado });
  } catch (error) {
    return res.status(error.status || (error.name === 'CastError' ? 400 : 500)).json({ error: error.message || 'No se pudo editar el pago agrupado' });
  } finally {
    if (!guardado && req.file) eliminarArchivoComprobante(`/uploads/${resolveTenantId(req)}/comprobantes/${req.file.filename}`);
  }
};

exports.retirarRecargoPagoAgrupado = async (req, res) => {
  try {
    const models = await getTenantFinanceModels(req);
    const resultado = await ejecutarConTransaccion(models.PagoAgrupado, async (session) => {
      const grupo = await aplicarSession(models.PagoAgrupado.findById(req.params.id), session);
      if (!grupo) throw errorPagoAgrupado(404, 'Pago agrupado no encontrado.');
      if (!['En revision', 'Conciliado'].includes(grupo.estado)) throw errorPagoAgrupado(409, 'El grupo ya no admite retiro de recargo.');
      if (req.body?.version !== versionPagoAgrupado(grupo)) throw errorPagoAgrupado(409, 'El grupo cambio. Actualiza la vista antes de retirar el recargo.');
      const detalles = await aplicarSession(models.PagoDetalle.find({ id_pago_agrupado: grupo._id }), session);
      if (req.params.id_mensualidad && !detalles.some((pago) => String(pago.id_mensualidad) === String(req.params.id_mensualidad))) {
        throw errorPagoAgrupado(404, 'La mensualidad no pertenece a este grupo.');
      }
      const suma = redondearMonto(detalles.reduce((total, pago) => total + Number(pago.monto_pagado || 0), 0));
      const sumaBs = redondearMonto(detalles.reduce((total, pago) => total + Number(pago.monto_pagado_bs || 0), 0));
      if (detalles.length < grupo.cantidad_atletas || new Set(detalles.map((pago) => String(pago.id_mensualidad))).size !== detalles.length
        || suma !== redondearMonto(grupo.monto_total) || sumaBs !== redondearMonto(grupo.monto_total_bs)) {
        throw errorPagoAgrupado(409, 'El grupo tiene asignaciones inconsistentes. No se retiro el recargo.');
      }
      const versiones = Array.isArray(req.body?.mensualidades) ? req.body.mensualidades : [];
      const porId = new Map(versiones.map((item) => [String(item?.id_mensualidad), item?.version]));
      if (versiones.length !== detalles.length || porId.size !== detalles.length
        || detalles.some((detalle) => !porId.has(String(detalle.id_mensualidad)))) {
        throw errorPagoAgrupado(409, 'Debes confirmar todas las mensualidades del grupo con sus versiones actuales.');
      }
      const atletas = new Set();
      const pendientes = [];
      for (const detalle of detalles) {
        const mensualidad = await aplicarSession(models.Mensualidad.findById(detalle.id_mensualidad).populate('id_alumno'), session);
        if (!mensualidad?.id_alumno || String(mensualidad.id_alumno.representante) !== String(grupo.representante)) {
          throw errorPagoAgrupado(409, 'Una mensualidad ya no pertenece al representante del grupo.');
        }
        atletas.add(String(mensualidad.id_alumno._id));
        if (porId.get(String(mensualidad._id)) !== versionPagoAgrupado(mensualidad)) {
          throw errorPagoAgrupado(409, 'Una mensualidad del grupo cambio. Actualiza la vista antes de retirar los recargos.');
        }
        const base = Number(mensualidad.monto_sin_recargo_usd);
        const recargo = Number(mensualidad.recargo_aplicado_usd || 0);
        if (recargo === 0) continue;
        if (!Number.isFinite(base) || base < 0 || !Number.isFinite(recargo) || recargo < 0
          || redondearMonto(Number(mensualidad.monto_esperado) - base) !== redondearMonto(recargo)) {
          throw errorPagoAgrupado(409, 'Una mensualidad del grupo tiene un recargo invalido. No se retiraron recargos.');
        }
        pendientes.push({ detalle, mensualidad, base, recargo, saldoAnterior: redondearMonto(mensualidad.saldo_a_favor_generado || 0) });
      }
      if (atletas.size !== grupo.cantidad_atletas) throw errorPagoAgrupado(409, 'Las atletas del grupo no coinciden con sus asignaciones.');
      if (!pendientes.length) throw errorPagoAgrupado(409, 'El grupo ya no tiene recargos para retirar.');
      const actualizadas = [];
      for (const { detalle, mensualidad, base, saldoAnterior } of pendientes) {
        const registrarHistorial = prepararRetiroRecargoAgrupado(mensualidad, req);
        const resumen = await recalcularMensualidad(mensualidad, 'admin', grupo.estado === 'En revision' ? 'En revision' : 'Pagado', models, { session });
        registrarHistorial();
        await mensualidad.save({ session });
        const pagos = await aplicarSession(models.PagoDetalle.find({ id_mensualidad: mensualidad._id }), session);
        const otros = pagos.filter((pago) => String(pago._id) !== String(detalle._id)).reduce((total, pago) => total + Number(pago.monto_pagado || 0), 0);
        detalle.monto_esperado_usd = redondearMonto(Math.max(0, base - otros));
        detalle.monto_esperado_bs = redondearMonto(detalle.monto_esperado_usd * Number(grupo.monto_total_bs) / Number(grupo.monto_total));
        await detalle.save({ session });
        actualizadas.push({ mensualidad, resumen, saldo_a_favor_incrementado: redondearMonto(mensualidad.saldo_a_favor_generado - saldoAnterior) });
      }
      grupo.ediciones = grupo.ediciones || [];
      grupo.ediciones.push({ usuario: req.user?.id, fecha: new Date(),
        antes: { accion: 'retiro_recargos_grupo', mensualidades: pendientes.map((item) => ({ id_mensualidad: item.mensualidad._id,
          monto_esperado: redondearMonto(item.base + item.recargo), saldo_a_favor_generado: item.saldoAnterior })) },
        despues: { accion: 'retiro_recargos_grupo', mensualidades: actualizadas.map((item) => ({ id_mensualidad: item.mensualidad._id,
          monto_esperado: item.mensualidad.monto_esperado, saldo_a_favor_generado: item.mensualidad.saldo_a_favor_generado })),
          monto_total: grupo.monto_total, monto_total_bs: grupo.monto_total_bs }
      });
      grupo.increment();
      await grupo.save({ session });
      return { mensualidades: actualizadas.map((item) => item.mensualidad), mensualidades_actualizadas: actualizadas.length,
        atletas_actualizadas: new Set(actualizadas.map((item) => String(item.mensualidad.id_alumno._id))).size,
        recargo_retirado: redondearMonto(pendientes.reduce((total, item) => total + item.recargo, 0)),
        saldo_a_favor_incrementado: redondearMonto(actualizadas.reduce((total, item) => total + item.saldo_a_favor_incrementado, 0)) };
    }, { obligatoria: true });
    return res.json({ message: 'Recargos del grupo retirados sin modificar la transferencia agrupada', ...resultado });
  } catch (error) {
    return res.status(error.status || (error.name === 'CastError' ? 400 : 500)).json({ error: error.message || 'No se pudo retirar el recargo' });
  }
};

// Registrar un pago y actualizar mensualidad
exports.registrarPago = async (req, res) => {
  let guardado = false;
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
      cedula_titular,
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
    const inicial = await obtenerMensualidadConAlumnoTenant(id_mensualidad, tenantModels);
    if (!inicial) throw errorPagoAgrupado(404, 'Mensualidad no encontrada');
    const solicitaRevisionRecargo = normalizarBooleano(solicita_revision_recargo);
    const obligatoria = Number(inicial.id_alumno?.saldo_a_favor_mensualidades) > 0 || Number(req.body.credito_a_aplicar) > 0;
    const resultado = await ejecutarConTransaccion(tenantModels.PagoAgrupado, async (session) => {
    const mensualidad = session ? await aplicarSession(tenantModels.Mensualidad.findById(id_mensualidad).populate('id_alumno'), session) : inicial;
    if (!mensualidad || !(await usuarioPuedePagarMensualidad(req, mensualidad, tenantModels.Representante, session))) {
      throw errorPagoAgrupado(403, 'No tienes permiso para esta mensualidad');
    }
    await aplicarRecargoMensualidadSegunConfig(mensualidad, { models: tenantModels, persistir: false });
    const cotizacion = await cotizarCreditoRegistro(mensualidad, tenantModels, session);
    const credito = cotizacion.proyecciones.get(String(mensualidad._id))?.credito_a_aplicar || 0;
    validarCreditoDeclarado(req.body.credito_a_aplicar, credito);
    await aplicarCreditoMensualidad(mensualidad, cotizacion, { session, actor: req.user });
    const validacion = await validarPago({
      mensualidad,
      monto,
      montoBs,
      actorRol: req.user?.rol,
      solicitaRevisionRecargo,
      models: tenantModels,
      session
    });
    if (validacion.error) {
      throw Object.assign(errorPagoAgrupado(validacion.error.status, validacion.error.payload.error), { payload: validacion.error.payload });
    }

    const datosPago = {
      id_mensualidad,
      monto_pagado: validacion.montoARegistrar,
      monto_pagado_bs: montoBs,
      monto_original_usd: validacion.montoARegistrar,
      monto_original_bs: montoBs,
      monto_aplicado_usd: validacion.montoARegistrar,
      monto_aplicado_bs: montoBs,
      monto_esperado_usd: Number.isFinite(montoEsperadoUsd) ? redondearMonto(montoEsperadoUsd) : undefined,
      monto_esperado_bs: montoEsperadoBs !== null ? redondearMonto(montoEsperadoBs) : undefined,
      nota: normalizarNotaPago(nota),
      solicita_revision_recargo: solicitaRevisionRecargo,
      fecha_pago,
      metodo_pago,
      referencia,
      telefono_pago: normalizarTelefonoPago(telefono_pago),
      cedula_titular: String(cedula_titular || '').trim(),
      comprobante_url,
      registrado_por: construirRegistradoPor(req)
    };
    if (session) await TenantPagoDetalle.create([datosPago], { session });
    else await TenantPagoDetalle.create(datosPago);

    return { ...await recalcularMensualidad(mensualidad, req.user?.rol, mensualidad.estatus, tenantModels, { session }), credito };
    }, { obligatoria });
    guardado = true;
    res.json({
      message: 'Pago registrado y mensualidad actualizada',
      total_pagado: resultado.totalPagado,
      restante: resultado.restante,
      estatus: resultado.estatus,
      credito_aplicado: resultado.credito
    });
  } catch (err) {
    res.status(err.status || 500).json(err.payload || { error: err.message });
  } finally {
    if (!guardado && req.file) eliminarArchivoComprobante(`/uploads/${resolveTenantId(req)}/comprobantes/${req.file.filename}`);
  }
};

exports.aplicarCreditoSinTransferencia = async (req, res) => {
  try {
    const models = await getTenantFinanceModels(req);
    const resultado = await ejecutarConTransaccion(models.PagoAgrupado, async (session) => {
      const mensualidad = await aplicarSession(models.Mensualidad.findById(req.body.id_mensualidad).populate('id_alumno'), session);
      if (!mensualidad) throw errorPagoAgrupado(404, 'Mensualidad no encontrada');
      if (!(await usuarioPuedePagarMensualidad(req, mensualidad, models.Representante, session))) {
        throw errorPagoAgrupado(403, 'No tienes permiso para esta mensualidad');
      }
      await aplicarRecargoMensualidadSegunConfig(mensualidad, { models, persistir: false });
      const cotizacion = await cotizarCreditoRegistro(mensualidad, models, session);
      const proyeccion = cotizacion.proyecciones.get(String(mensualidad._id));
      validarCreditoDeclarado(req.body.credito_a_aplicar, proyeccion?.credito_a_aplicar || 0);
      if (!proyeccion || proyeccion.credito_a_aplicar <= 0 || proyeccion.saldo_pendiente > 0) {
        throw errorPagoAgrupado(409, 'El credito no cubre toda esta mensualidad. Actualiza la vista y paga el restante.');
      }
      const credito = await aplicarCreditoMensualidad(mensualidad, cotizacion, { session, actor: req.user });
      return { ...await recalcularMensualidad(mensualidad, req.user?.rol, mensualidad.estatus, models, { session }), credito };
    }, { obligatoria: true });
    return res.json({ message: 'Mensualidad cubierta con saldo a favor, sin transferencia adicional', credito_aplicado: resultado.credito, restante: resultado.restante });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.message });
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
      cedula_titular,
      nota,
      solicita_revision_recargo,
      eliminar_comprobante
    } = req.body;
    const pago = await TenantPagoDetalle.findById(req.params.id_pago);
    if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });
    if (pago.id_pago_agrupado) {
      return res.status(409).json({ error: 'Las asignaciones de un pago agrupado no pueden editarse individualmente' });
    }

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
    pago.monto_original_usd = validacion.montoARegistrar;
    pago.monto_original_bs = montoBs;
    pago.monto_aplicado_usd = validacion.montoARegistrar;
    pago.monto_aplicado_bs = montoBs;
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
    if (cedula_titular !== undefined) {
      pago.cedula_titular = String(cedula_titular || '').trim();
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
    if (pago.id_pago_agrupado) {
      return res.status(409).json({ error: 'Las asignaciones de un pago agrupado no pueden eliminarse individualmente' });
    }

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
