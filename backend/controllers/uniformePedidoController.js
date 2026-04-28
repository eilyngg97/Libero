const mongoose = require('mongoose');
const UniformePedido = require('../models/UniformePedido');
const Uniforme = require('../models/Uniforme');
const Alumno = require('../models/Alumno');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');

const ESTADOS_PEDIDO = {
  PENDIENTE: 'pendiente',
  ESPERANDO_PAGO: 'esperando_pago',
  ABONO: 'abono',
  PAGO_EN_REVISION: 'pago_en_revision',
  VERIFICADO: 'verificado',
  ENTREGADO: 'entregado',
  CANCELADO: 'cancelado'
};

function buildComprobanteUrl(file, tenantIdInput) {
  if (!file?.filename) return null;
  const tenantId = resolveRequestTenantId({ tenantId: tenantIdInput });
  return `/uploads/${tenantId}/comprobantes/${file.filename}`;
}

async function getTenantUniformePedidoModels(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);

  const models = {
    UniformePedido: getTenantModel(connection, 'UniformePedido'),
    Uniforme: getTenantModel(connection, 'Uniforme'),
    Alumno: getTenantModel(connection, 'Alumno')
  };

  // Registrar modelos referenciados para populate en la misma conexion.
  getTenantModel(connection, 'User');
  getTenantModel(connection, 'Sede');

  return models;
}

exports.createPedidoUniforme = async (req, res) => {
  try {
    const {
      UniformePedido: TenantUniformePedido,
      Uniforme: TenantUniforme,
      Alumno: TenantAlumno
    } = await getTenantUniformePedidoModels(req);

    const {
      alumnoId,
      sedeId,
      prenda,
      talla,
      nombrePersonalizado,
      numeroFranela,
    } = req.body;

    if (!alumnoId || !prenda || !talla) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    if (!mongoose.Types.ObjectId.isValid(alumnoId)) {
      return res.status(400).json({ error: 'alumnoId inválido' });
    }
    if (sedeId && !mongoose.Types.ObjectId.isValid(sedeId)) {
      return res.status(400).json({ error: 'sedeId inválido' });
    }

    const uniforme = await TenantUniforme.findOne({ prenda });
    const precio = uniforme?.precio || 0;
    const requiereNumeroFranela = uniforme?.lleva_numero_franela !== false;
    const alumno = await TenantAlumno.findById(alumnoId).select('numero_franela categoria activo');

    if (!alumno) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    let numeroFranelaPedido = null;

    if (requiereNumeroFranela) {
      numeroFranelaPedido = Number(alumno.numero_franela);

      if (!Number.isInteger(numeroFranelaPedido) || numeroFranelaPedido < 1 || numeroFranelaPedido > 100) {
        const numeroSolicitado = Number(numeroFranela);
        if (!Number.isInteger(numeroSolicitado) || numeroSolicitado < 1 || numeroSolicitado > 100) {
          return res.status(400).json({ error: 'Debes seleccionar un numero de franela valido (1-100).' });
        }

        const categoria = String(alumno.categoria || '').trim();
        if (!categoria) {
          return res.status(400).json({ error: 'El alumno no tiene categoria asignada para validar numero de franela.' });
        }

        const numeroOcupado = await TenantAlumno.findOne({
          _id: { $ne: alumno._id },
          activo: { $ne: false },
          categoria: { $regex: new RegExp(`^${String(categoria).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          numero_franela: numeroSolicitado
        }).select('_id');

        if (numeroOcupado) {
          return res.status(409).json({ error: `El numero de franela ${numeroSolicitado} ya esta ocupado en la categoria ${categoria}.` });
        }

        alumno.numero_franela = numeroSolicitado;
        await alumno.save();
        numeroFranelaPedido = numeroSolicitado;
      }
    }

    const pedido = await TenantUniformePedido.create({
      alumno: alumnoId,
      sede: sedeId || undefined,
      prenda,
      nombre_personalizado: String(nombrePersonalizado || '').trim().toUpperCase() || undefined,
      numero_franela: requiereNumeroFranela ? String(numeroFranelaPedido) : null,
      precio,
      talla,
      estado: ESTADOS_PEDIDO.PENDIENTE,
      solicitado_por: req.user?.id
    });

    res.status(201).json(pedido);
  } catch (err) {
    res.status(400).json({ error: 'Error al crear pedido de uniforme', detalle: err.message });
  }
};

exports.getMisPedidosUniforme = async (req, res) => {
  try {
    const { UniformePedido: TenantUniformePedido } = await getTenantUniformePedidoModels(req);
    const filtro = {
      solicitado_por: req.user?.id,
      estado: {
        $in: [
          ESTADOS_PEDIDO.PENDIENTE,
          ESTADOS_PEDIDO.ESPERANDO_PAGO,
          ESTADOS_PEDIDO.ABONO,
          ESTADOS_PEDIDO.PAGO_EN_REVISION,
          ESTADOS_PEDIDO.VERIFICADO,
          ESTADOS_PEDIDO.ENTREGADO,
          ESTADOS_PEDIDO.CANCELADO
        ]
      }
    };

    if (req.query.alumnoId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.alumnoId)) {
        return res.status(400).json({ error: 'alumnoId inválido' });
      }
      filtro.alumno = req.query.alumnoId;
    }

    const pedidos = await TenantUniformePedido.find(filtro)
      .populate('alumno')
      .populate('sede')
      .sort({ createdAt: -1 });

    res.json(pedidos);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener tus pedidos de uniformes' });
  }
};

exports.getPedidosUniforme = async (req, res) => {
  try {
    const { UniformePedido: TenantUniformePedido } = await getTenantUniformePedidoModels(req);
    const filtro = {};

    if (req.query.sedeId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.sedeId)) {
        return res.status(400).json({ error: 'sedeId inválido' });
      }
      filtro.sede = req.query.sedeId;
    }

    const pedidos = await TenantUniformePedido.find(filtro)
      .populate('alumno')
      .populate('sede')
      .populate('solicitado_por')
      .sort({ createdAt: -1 });
    res.json(pedidos);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener pedidos de uniformes' });
  }
};

exports.solicitarPagoPedido = async (req, res) => {
  try {
    const { UniformePedido: TenantUniformePedido } = await getTenantUniformePedidoModels(req);
    const precio = Number(req.body?.precio);
    if (!precio || Number.isNaN(precio) || precio <= 0) {
      return res.status(400).json({ error: 'Precio inválido' });
    }

    const pedido = await TenantUniformePedido.findById(req.params.id);
    if (!pedido) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    if (pedido.estado !== ESTADOS_PEDIDO.PENDIENTE) {
      return res.status(400).json({ error: 'Solo se puede solicitar pago para pedidos pendientes' });
    }

    pedido.precio = precio;
    pedido.monto_pagado = 0;
    pedido.monto_pagado_bs = 0;
    pedido.monto_ultimo_pago = 0;
    pedido.monto_ultimo_pago_bs = 0;
    pedido.saldo_pendiente = precio;
    pedido.estado = ESTADOS_PEDIDO.ESPERANDO_PAGO;
    await pedido.save();

    const pedidoActualizado = await TenantUniformePedido.findById(pedido._id)
      .populate('alumno')
      .populate('sede')
      .populate('solicitado_por');

    res.json(pedidoActualizado);
  } catch (err) {
    res.status(400).json({ error: 'Error al solicitar pago del pedido', detalle: err.message });
  }
};

exports.cancelarPedido = async (req, res) => {
  try {
    const { UniformePedido: TenantUniformePedido } = await getTenantUniformePedidoModels(req);
    const pedido = await TenantUniformePedido.findOne({
      _id: req.params.id,
      solicitado_por: req.user?.id,
      estado: { $in: [ESTADOS_PEDIDO.PENDIENTE, ESTADOS_PEDIDO.ESPERANDO_PAGO] }
    });

    if (!pedido) {
      return res.status(404).json({ error: 'Pedido no encontrado o no se puede cancelar' });
    }

    pedido.estado = ESTADOS_PEDIDO.CANCELADO;
    await pedido.save();
    res.json(pedido);
  } catch (err) {
    res.status(400).json({ error: 'Error al cancelar pedido' });
  }
};

exports.registrarPagoPedido = async (req, res) => {
  try {
    const { UniformePedido: TenantUniformePedido } = await getTenantUniformePedidoModels(req);
    const { metodo_pago, referencia, fecha_pago, monto_pagado, monto_pagado_bs } = req.body;
    const pedido = await TenantUniformePedido.findOne({
      _id: req.params.id,
      solicitado_por: req.user?.id,
      estado: { $in: [ESTADOS_PEDIDO.ESPERANDO_PAGO, ESTADOS_PEDIDO.ABONO] }
    });

    if (!pedido) {
      return res.status(404).json({ error: 'Pedido no encontrado o no disponible para pago' });
    }

    if (!metodo_pago) {
      return res.status(400).json({ error: 'metodo_pago es requerido' });
    }

    const montoPagado = Number(monto_pagado);
    if (!Number.isFinite(montoPagado) || montoPagado <= 0) {
      return res.status(400).json({ error: 'Debes indicar un monto_pagado valido' });
    }

    const montoPagadoBs = Number(monto_pagado_bs);
    if (!Number.isFinite(montoPagadoBs) || montoPagadoBs <= 0) {
      return res.status(400).json({ error: 'Debes indicar un monto_pagado_bs valido' });
    }

    const totalPedido = Number(pedido.precio) || 0;
    const saldoActual = Number(pedido.saldo_pendiente);
    const saldoPendiente = Number.isFinite(saldoActual) && saldoActual > 0
      ? saldoActual
      : Math.max(totalPedido - (Number(pedido.monto_pagado) || 0), 0);

    if (saldoPendiente <= 0) {
      return res.status(400).json({ error: 'El pedido no tiene saldo pendiente por pagar' });
    }

    if (montoPagado > saldoPendiente) {
      return res.status(400).json({ error: `El monto pagado no puede superar el saldo pendiente (${saldoPendiente.toFixed(2)}).` });
    }

    const esPagoCompleto = montoPagado >= (saldoPendiente - 0.0001);

    pedido.metodo_pago = metodo_pago;
    pedido.referencia = referencia || undefined;
    pedido.fecha_pago = fecha_pago ? new Date(fecha_pago) : new Date();
    pedido.comprobante_url = buildComprobanteUrl(req.file, req.tenantId) || pedido.comprobante_url;
    pedido.monto_ultimo_pago = montoPagado;
    pedido.monto_ultimo_pago_bs = montoPagadoBs;

    if (esPagoCompleto) {
      // El pago completo requiere revisión administrativa antes de marcar como verificado.
      pedido.estado = ESTADOS_PEDIDO.PAGO_EN_REVISION;
    } else {
      // El abono parcial se acumula inmediatamente y queda listo para próximos pagos.
      const totalPagado = (Number(pedido.monto_pagado) || 0) + montoPagado;
      const totalPagadoBs = (Number(pedido.monto_pagado_bs) || 0) + montoPagadoBs;
      const saldoPendienteNuevo = Math.max(totalPedido - totalPagado, 0);

      pedido.pagos_historial = Array.isArray(pedido.pagos_historial) ? pedido.pagos_historial : [];
      pedido.pagos_historial.push({
        monto_pagado: montoPagado,
        monto_pagado_bs: montoPagadoBs,
        metodo_pago: pedido.metodo_pago,
        referencia: pedido.referencia,
        comprobante_url: pedido.comprobante_url,
        fecha_pago: pedido.fecha_pago
      });

      pedido.monto_pagado = totalPagado;
      pedido.monto_pagado_bs = totalPagadoBs;
      pedido.saldo_pendiente = saldoPendienteNuevo;
      pedido.estado = ESTADOS_PEDIDO.ABONO;
    }

    await pedido.save();
    res.json(pedido);
  } catch (err) {
    res.status(400).json({ error: 'Error al registrar pago del pedido', detalle: err.message });
  }
};

exports.verificarPagoPedido = async (req, res) => {
  try {
    const { UniformePedido: TenantUniformePedido } = await getTenantUniformePedidoModels(req);
    const pedido = await TenantUniformePedido.findById(req.params.id)
      .populate('alumno')
      .populate('sede')
      .populate('solicitado_por');

    if (!pedido) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    if (pedido.estado !== ESTADOS_PEDIDO.PAGO_EN_REVISION) {
      return res.status(400).json({ error: 'Solo se pueden verificar pagos en revisión' });
    }

    const totalPedido = Number(pedido.precio) || 0;
    const montoPrevioPagado = Number(pedido.monto_pagado) || 0;
    const montoPrevioPagadoBs = Number(pedido.monto_pagado_bs) || 0;
    const montoUltimoPagoRaw = Number(pedido.monto_ultimo_pago);
    const montoUltimoPagoBsRaw = Number(pedido.monto_ultimo_pago_bs);
    const saldoActual = Number(pedido.saldo_pendiente);
    const saldoPendienteActual = Number.isFinite(saldoActual) && saldoActual > 0
      ? saldoActual
      : Math.max(totalPedido - montoPrevioPagado, 0);
    const montoUltimoPago = Number.isFinite(montoUltimoPagoRaw) && montoUltimoPagoRaw > 0
      ? Math.min(montoUltimoPagoRaw, saldoPendienteActual)
      : saldoPendienteActual;
    const factorAjusteUltimoPago = Number.isFinite(montoUltimoPagoRaw) && montoUltimoPagoRaw > 0
      ? (montoUltimoPago / montoUltimoPagoRaw)
      : 1;
    const montoUltimoPagoBs = Number.isFinite(montoUltimoPagoBsRaw) && montoUltimoPagoBsRaw > 0
      ? (montoUltimoPagoBsRaw * factorAjusteUltimoPago)
      : 0;

    const totalPagado = Math.min(totalPedido, montoPrevioPagado + montoUltimoPago);
    const totalPagadoBs = montoPrevioPagadoBs + montoUltimoPagoBs;
    const saldoPendiente = Math.max(totalPedido - totalPagado, 0);

    pedido.pagos_historial = Array.isArray(pedido.pagos_historial) ? pedido.pagos_historial : [];
    pedido.pagos_historial.push({
      monto_pagado: montoUltimoPago,
      monto_pagado_bs: montoUltimoPagoBs,
      metodo_pago: pedido.metodo_pago,
      referencia: pedido.referencia,
      comprobante_url: pedido.comprobante_url,
      fecha_pago: pedido.fecha_pago
    });

    pedido.monto_pagado = totalPagado;
    pedido.monto_pagado_bs = totalPagadoBs;
    pedido.saldo_pendiente = saldoPendiente;
    pedido.estado = saldoPendiente > 0 ? ESTADOS_PEDIDO.ABONO : ESTADOS_PEDIDO.VERIFICADO;
    await pedido.save();

    res.json(pedido);
  } catch (err) {
    res.status(400).json({ error: 'Error al verificar el pago del pedido', detalle: err.message });
  }
};

exports.marcarEntregado = async (req, res) => {
  try {
    const { UniformePedido: TenantUniformePedido } = await getTenantUniformePedidoModels(req);
    const pedido = await TenantUniformePedido.findById(req.params.id)
      .populate('alumno')
      .populate('sede')
      .populate('solicitado_por');
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

    if (pedido.estado !== ESTADOS_PEDIDO.VERIFICADO) {
      return res.status(400).json({ error: 'Solo se puede marcar como entregado un pedido verificado' });
    }

    pedido.estado = ESTADOS_PEDIDO.ENTREGADO;
    await pedido.save();
    res.json(pedido);
  } catch (err) {
    res.status(400).json({ error: 'Error al marcar como entregado' });
  }
};
