const PagoDetalle = require('../models/PagoDetalle');
const Mensualidad = require('../models/Mensualidad');
const fs = require('fs');
const path = require('path');

function normalizarMonto(value) {
  return Number(value);
}

function normalizarMontoBs(value) {
  if (value === undefined || value === null || value === '') return null;
  return Number(value);
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

async function recalcularMensualidad(mensualidad, actorRol, estatusAnterior) {
  const pagos = await PagoDetalle.find({ id_mensualidad: mensualidad._id });
  const totalPagado = pagos.reduce((acc, pago) => acc + (Number(pago.monto_pagado) || 0), 0);
  const montoEsperado = Number(mensualidad.monto_esperado) || 0;
  const restante = Math.max(0, montoEsperado - totalPagado);
  const mantenerRevision = estatusAnterior === 'En revision' || actorRol === 'usuario';

  if (totalPagado <= 0) {
    mensualidad.estatus = 'Pendiente';
  } else if (totalPagado >= montoEsperado) {
    mensualidad.estatus = mantenerRevision ? 'En revision' : 'Pagado';
  } else {
    mensualidad.estatus = mantenerRevision ? 'En revision' : 'Abono';
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

function validarMontoBs(montoBs) {
  return montoBs === null || (!Number.isNaN(montoBs) && montoBs > 0);
}

async function validarPago({ mensualidad, monto, montoBs, pagoIdExcluir = null, actorRol = null }) {
  if (!mensualidad) return { error: { status: 404, payload: { error: 'Mensualidad no encontrada' } } };

  const habilitarCuotasAlumno = mensualidad.id_alumno?.habilitar_pago_cuotas === true;
  const puedePagarCuotas = actorRol === 'admin' || habilitarCuotasAlumno;
  const pagosPrevios = await PagoDetalle.find({ id_mensualidad: mensualidad._id });
  const totalPrevio = pagosPrevios
    .filter((pago) => String(pago._id) !== String(pagoIdExcluir))
    .reduce((acc, pago) => acc + (Number(pago.monto_pagado) || 0), 0);
  const restante = Math.max(0, (Number(mensualidad.monto_esperado) || 0) - totalPrevio);

  if (!monto || Number.isNaN(monto) || monto <= 0) {
    return { error: { status: 400, payload: { error: 'Monto pagado inválido' } } };
  }

  if (!validarMontoBs(montoBs)) {
    return { error: { status: 400, payload: { error: 'Monto pagado Bs inválido' } } };
  }

  if (restante <= 0) {
    return { error: { status: 400, payload: { error: 'La mensualidad ya está pagada' } } };
  }

  if (!puedePagarCuotas && monto < restante) {
    return { error: { status: 400, payload: { error: 'Este alumno no tiene habilitado pago en cuotas' } } };
  }

  if (monto > restante) {
    return { error: { status: 400, payload: { error: 'El monto excede el saldo pendiente' } } };
  }

  return {
    totalPrevio,
    restante,
    habilitarCuotas: puedePagarCuotas
  };
}

// Registrar un pago y actualizar mensualidad
exports.registrarPago = async (req, res) => {
  try {
    const { id_mensualidad, monto_pagado, monto_pagado_bs, fecha_pago, metodo_pago, referencia } = req.body;
    const comprobante_url = req.file ? `/uploads/comprobantes/${req.file.filename}` : null;
    if (!id_mensualidad) return res.status(400).json({ error: 'id_mensualidad requerido' });
    const monto = normalizarMonto(monto_pagado);
    const montoBs = normalizarMontoBs(monto_pagado_bs);
    const mensualidad = await obtenerMensualidadConAlumno(id_mensualidad);
    const validacion = await validarPago({ mensualidad, monto, montoBs, actorRol: req.user?.rol });
    if (validacion.error) {
      return res.status(validacion.error.status).json(validacion.error.payload);
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

    const resultado = await recalcularMensualidad(mensualidad, req.user?.rol, mensualidad.estatus);
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
    const { monto_pagado, monto_pagado_bs, fecha_pago, metodo_pago, referencia, eliminar_comprobante } = req.body;
    const pago = await PagoDetalle.findById(req.params.id_pago);
    if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });

    const mensualidad = await obtenerMensualidadConAlumno(pago.id_mensualidad);
    const monto = normalizarMonto(monto_pagado);
    const montoBs = normalizarMontoBs(monto_pagado_bs);
    const validacion = await validarPago({
      mensualidad,
      monto,
      montoBs,
      pagoIdExcluir: pago._id,
      actorRol: req.user?.rol
    });

    if (validacion.error) {
      return res.status(validacion.error.status).json(validacion.error.payload);
    }

    const comprobanteAnterior = pago.comprobante_url;
    pago.monto_pagado = monto;
    pago.monto_pagado_bs = montoBs;
    pago.fecha_pago = fecha_pago;
    pago.metodo_pago = metodo_pago;
    pago.referencia = referencia;

    if (req.file) {
      pago.comprobante_url = `/uploads/comprobantes/${req.file.filename}`;
    } else if (eliminar_comprobante === 'true') {
      pago.comprobante_url = null;
    }

    await pago.save();

    if ((req.file || eliminar_comprobante === 'true') && comprobanteAnterior && comprobanteAnterior !== pago.comprobante_url) {
      eliminarArchivoComprobante(comprobanteAnterior);
    }

    const resultado = await recalcularMensualidad(mensualidad, req.user?.rol, mensualidad.estatus);

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
    const pago = await PagoDetalle.findById(req.params.id_pago);
    if (!pago) return res.status(404).json({ error: 'Pago no encontrado' });

    const mensualidad = await obtenerMensualidadConAlumno(pago.id_mensualidad);
    const comprobanteAnterior = pago.comprobante_url;
    const estatusAnterior = mensualidad?.estatus;

    if (typeof pago.deleteOne === 'function') {
      await pago.deleteOne();
    } else {
      await PagoDetalle.findByIdAndDelete(req.params.id_pago);
    }

    eliminarArchivoComprobante(comprobanteAnterior);

    const resultado = await recalcularMensualidad(mensualidad, req.user?.rol, estatusAnterior);

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
    const pagos = await PagoDetalle.find({ id_mensualidad: req.params.id_mensualidad });
    res.json(ordenarPagos(pagos));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
