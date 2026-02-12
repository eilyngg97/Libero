const mongoose = require('mongoose');
const UniformePedido = require('../models/UniformePedido');

exports.createPedidoUniforme = async (req, res) => {
  try {
    const {
      alumnoId,
      sedeId,
      prenda,
      talla,
      precio,
      metodo_pago,
      referencia
    } = req.body;

    if (!alumnoId || !prenda || !talla || !precio || !metodo_pago) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    if (!mongoose.Types.ObjectId.isValid(alumnoId)) {
      return res.status(400).json({ error: 'alumnoId inválido' });
    }
    if (sedeId && !mongoose.Types.ObjectId.isValid(sedeId)) {
      return res.status(400).json({ error: 'sedeId inválido' });
    }
    if (Number.isNaN(Number(precio))) {
      return res.status(400).json({ error: 'precio inválido' });
    }

    const requiereReferencia = metodo_pago === 'TRANSFERENCIA' || metodo_pago === 'PAGO MOVIL';
    if (requiereReferencia && (!referencia || referencia.length < 6)) {
      return res.status(400).json({ error: 'Referencia obligatoria (mín. 6 dígitos)' });
    }

    const comprobante_url = req.file ? `/uploads/comprobantes/${req.file.filename}` : null;

    const pedido = await UniformePedido.create({
      alumno: alumnoId,
      sede: sedeId || undefined,
      prenda,
      talla,
      precio: Number(precio),
      metodo_pago,
      referencia: requiereReferencia ? referencia : undefined,
      comprobante_url,
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
