const PagoDetalle = require('../models/PagoDetalle');
const Mensualidad = require('../models/Mensualidad');

// Registrar un pago y actualizar mensualidad
exports.registrarPago = async (req, res) => {
  try {
    const { id_mensualidad, monto_pagado, monto_pagado_bs, fecha_pago, metodo_pago, referencia } = req.body;
    const comprobante_url = req.file ? `/uploads/comprobantes/${req.file.filename}` : null;
    if (!id_mensualidad) return res.status(400).json({ error: 'id_mensualidad requerido' });
    const monto = Number(monto_pagado);
    const montoBs = monto_pagado_bs !== undefined && monto_pagado_bs !== null
      ? Number(monto_pagado_bs)
      : null;
    if (!monto || Number.isNaN(monto) || monto <= 0) {
      return res.status(400).json({ error: 'Monto pagado inválido' });
    }
    if (montoBs !== null && (Number.isNaN(montoBs) || montoBs <= 0)) {
      return res.status(400).json({ error: 'Monto pagado Bs inválido' });
    }

    const mensualidad = await Mensualidad.findById(id_mensualidad).populate('id_alumno');
    if (!mensualidad) return res.status(404).json({ error: 'Mensualidad no encontrada' });

    const habilitarCuotas = mensualidad.id_alumno?.habilitar_pago_cuotas === true;

    const pagosPrevios = await PagoDetalle.find({ id_mensualidad });
    const totalPrevio = pagosPrevios.reduce((acc, p) => acc + (Number(p.monto_pagado) || 0), 0);
    const restante = Math.max(0, (Number(mensualidad.monto_esperado) || 0) - totalPrevio);

    if (restante <= 0) {
      return res.status(400).json({ error: 'La mensualidad ya está pagada' });
    }

    if (!habilitarCuotas && monto < restante) {
      return res.status(400).json({ error: 'Este alumno no tiene habilitado pago en cuotas' });
    }

    if (monto > restante) {
      return res.status(400).json({ error: 'El monto excede el saldo pendiente' });
    }

    await PagoDetalle.create({
      id_mensualidad,
      monto_pagado: monto,
      monto_pagado_bs: montoBs,
      fecha_pago,
      metodo_pago,
      referencia,
      comprobante_url
    });

    const totalPagado = totalPrevio + monto;
    if (totalPagado >= mensualidad.monto_esperado) {
      mensualidad.estatus = req.user?.rol === 'usuario' ? 'En revision' : 'Pagado';
    } else {
      if (req.user?.rol === 'usuario') {
        mensualidad.estatus = 'En revision';
      } else {
        mensualidad.estatus = 'Abono';
      }
    }

    await mensualidad.save();
    res.json({
      message: 'Pago registrado y mensualidad actualizada',
      total_pagado: totalPagado,
      restante: Math.max(0, mensualidad.monto_esperado - totalPagado),
      estatus: mensualidad.estatus
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Consultar pagos por mensualidad
exports.getPagosPorMensualidad = async (req, res) => {
  try {
    const pagos = await PagoDetalle.find({ id_mensualidad: req.params.id_mensualidad });
    res.json(pagos);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
