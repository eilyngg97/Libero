const mongoose = require('mongoose');
const UniformePedido = require('../models/UniformePedido');
const Uniforme = require('../models/Uniforme');

const ESTADOS_PEDIDO = {
  PENDIENTE: 'pendiente',
  ESPERANDO_PAGO: 'esperando_pago',
  PAGO_EN_REVISION: 'pago_en_revision',
  VERIFICADO: 'verificado',
  ENTREGADO: 'entregado',
  CANCELADO: 'cancelado'
};

function buildComprobanteUrl(file) {
  if (!file?.filename) return null;
  return `/uploads/comprobantes/${file.filename}`;
}

exports.createPedidoUniforme = async (req, res) => {
  try {
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

    const uniforme = await Uniforme.findOne({ prenda });
    const precio = uniforme?.precio || 0;

    const pedido = await UniformePedido.create({
      alumno: alumnoId,
      sede: sedeId || undefined,
      prenda,
      nombre_personalizado: String(nombrePersonalizado || '').trim() || undefined,
      numero_franela: String(numeroFranela || '').trim() || undefined,
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
    const filtro = {
      solicitado_por: req.user?.id,
      estado: {
        $in: [
          ESTADOS_PEDIDO.PENDIENTE,
          ESTADOS_PEDIDO.ESPERANDO_PAGO,
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

    const pedidos = await UniformePedido.find(filtro)
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
    const filtro = {};

    if (req.query.sedeId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.sedeId)) {
        return res.status(400).json({ error: 'sedeId inválido' });
      }
      filtro.sede = req.query.sedeId;
    }

    const pedidos = await UniformePedido.find(filtro)
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
    const precio = Number(req.body?.precio);
    if (!precio || Number.isNaN(precio) || precio <= 0) {
      return res.status(400).json({ error: 'Precio inválido' });
    }

    const pedido = await UniformePedido.findById(req.params.id);
    if (!pedido) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    if (pedido.estado !== ESTADOS_PEDIDO.PENDIENTE) {
      return res.status(400).json({ error: 'Solo se puede solicitar pago para pedidos pendientes' });
    }

    pedido.precio = precio;
    pedido.estado = ESTADOS_PEDIDO.ESPERANDO_PAGO;
    await pedido.save();

    const pedidoActualizado = await UniformePedido.findById(pedido._id)
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
    const pedido = await UniformePedido.findOne({
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
    const { metodo_pago, referencia, fecha_pago } = req.body;
    const pedido = await UniformePedido.findOne({
      _id: req.params.id,
      solicitado_por: req.user?.id,
      estado: ESTADOS_PEDIDO.ESPERANDO_PAGO
    });

    if (!pedido) {
      return res.status(404).json({ error: 'Pedido no encontrado o no disponible para pago' });
    }

    if (!metodo_pago) {
      return res.status(400).json({ error: 'metodo_pago es requerido' });
    }

    pedido.metodo_pago = metodo_pago;
    pedido.referencia = referencia || undefined;
    pedido.fecha_pago = fecha_pago ? new Date(fecha_pago) : new Date();
    pedido.comprobante_url = buildComprobanteUrl(req.file) || pedido.comprobante_url;
    pedido.estado = ESTADOS_PEDIDO.PAGO_EN_REVISION;

    await pedido.save();
    res.json(pedido);
  } catch (err) {
    res.status(400).json({ error: 'Error al registrar pago del pedido', detalle: err.message });
  }
};

exports.verificarPagoPedido = async (req, res) => {
  try {
    const pedido = await UniformePedido.findById(req.params.id)
      .populate('alumno')
      .populate('sede')
      .populate('solicitado_por');

    if (!pedido) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    if (pedido.estado !== ESTADOS_PEDIDO.PAGO_EN_REVISION) {
      return res.status(400).json({ error: 'Solo se pueden verificar pagos en revisión' });
    }

    pedido.estado = ESTADOS_PEDIDO.VERIFICADO;
    await pedido.save();

    res.json(pedido);
  } catch (err) {
    res.status(400).json({ error: 'Error al verificar el pago del pedido', detalle: err.message });
  }
};

exports.marcarEntregado = async (req, res) => {
  try {
    const pedido = await UniformePedido.findById(req.params.id)
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
