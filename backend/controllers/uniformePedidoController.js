const mongoose = require('mongoose');
const UniformePedido = require('../models/UniformePedido');

exports.createPedidoUniforme = async (req, res) => {
  try {
    const {
      alumnoId,
      sedeId,
      prenda,
      talla,
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

    const pedido = await UniformePedido.create({
      alumno: alumnoId,
      sede: sedeId || undefined,
      prenda,
      talla,
      estado: 'pendiente',
      solicitado_por: req.user?.id
    });

    res.status(201).json(pedido);
  } catch (err) {
    res.status(400).json({ error: 'Error al crear pedido de uniforme', detalle: err.message });
  }
};

exports.getPedidosUniforme = async (req, res) => {
  try {
    const pedidos = await UniformePedido.find()
      .populate('alumno')
      .populate('sede')
      .populate('solicitado_por');
    res.json(pedidos);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener pedidos de uniformes' });
  }
};

exports.marcarEntregado = async (req, res) => {
  try {
    const pedido = await UniformePedido.findByIdAndUpdate(
      req.params.id,
      { estado: 'entregado' },
      { new: true }
    );
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
    res.json(pedido);
  } catch (err) {
    res.status(400).json({ error: 'Error al marcar como entregado' });
  }
};
