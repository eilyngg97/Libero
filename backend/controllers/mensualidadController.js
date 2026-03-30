const Mensualidad = require('../models/Mensualidad');
const Alumno = require('../models/Alumno');
const Sede = require('../models/Sede');
const Reposo = require('../models/Reposo');
const PagoDetalle = require('../models/PagoDetalle');
const Representante = require('../models/Representante');

function redondearMonto(valor) {
  return Number((Number(valor) || 0).toFixed(2));
}

function esEstatusInsolvente(estatus) {
  const normalizado = String(estatus || '').toLowerCase();
  return normalizado === 'retrasado' || normalizado === 'insolvente';
}

function obtenerMontoBaseMensualidad(mensualidad) {
  if (mensualidad?.monto_base !== undefined && mensualidad?.monto_base !== null) {
    return redondearMonto(mensualidad.monto_base);
  }

  return redondearMonto(
    (Number(mensualidad?.monto_esperado) || 0) +
    (Number(mensualidad?.credito_aplicado) || 0) +
    (Number(mensualidad?.ajuste_extraordinario) || 0)
  );
}

async function resolverMontoBaseAlumno(alumno) {
  if (alumno.tipo_mensualidad === 'monto_sede' || !alumno.tipo_mensualidad) {
    const sedeId = alumno.sede && alumno.sede._id ? alumno.sede._id : alumno.sede;
    const sede = await Sede.findById(sedeId);
    return redondearMonto(sede && sede.costo ? sede.costo : 0);
  }

  if (alumno.tipo_mensualidad === 'monto_personalizado') {
    return redondearMonto(alumno.monto_personalizado_valor || 0);
  }

  return 0;
}

async function consumirSaldoAFavor(alumno, montoBase) {
  const saldoDisponible = redondearMonto(alumno?.saldo_a_favor_mensualidades || 0);
  if (saldoDisponible <= 0 || montoBase <= 0) {
    return { creditoAplicado: 0, montoEsperado: redondearMonto(montoBase) };
  }

  const creditoAplicado = redondearMonto(Math.min(saldoDisponible, montoBase));
  alumno.saldo_a_favor_mensualidades = redondearMonto(saldoDisponible - creditoAplicado);
  await alumno.save();

  return {
    creditoAplicado,
    montoEsperado: redondearMonto(montoBase - creditoAplicado)
  };
}

async function recalcularMensualidadPorPagos(
  mensualidad,
  { actorRol = 'admin', estatusAnterior = null, preservarPagadoSinPagos = false } = {}
) {
  const pagos = await PagoDetalle.find({ id_mensualidad: mensualidad._id });
  const tienePagosRegistrados = pagos.length > 0;
  const totalPagado = redondearMonto(
    pagos.reduce((acc, pago) => acc + (Number(pago.monto_pagado) || 0), 0)
  );
  const montoEsperado = redondearMonto(mensualidad.monto_esperado || 0);
  const saldoGeneradoPrevio = redondearMonto(mensualidad.saldo_a_favor_generado || 0);
  const saldoGeneradoNuevo = redondearMonto(Math.max(0, totalPagado - montoEsperado));
  const deltaSaldo = redondearMonto(saldoGeneradoNuevo - saldoGeneradoPrevio);

  if (deltaSaldo !== 0) {
    const alumnoDoc = await Alumno.findById(mensualidad.id_alumno?._id || mensualidad.id_alumno);
    if (alumnoDoc) {
      const saldoActual = redondearMonto(alumnoDoc.saldo_a_favor_mensualidades || 0);
      const saldoResultante = redondearMonto(saldoActual + deltaSaldo);

      if (saldoResultante < 0) {
        throw new Error('El saldo a favor de esta mensualidad ya fue consumido en meses posteriores.');
      }

      alumnoDoc.saldo_a_favor_mensualidades = saldoResultante;
      await alumnoDoc.save();
    }
  }

  mensualidad.saldo_a_favor_generado = saldoGeneradoNuevo;

  const requiereRevisionPagoCompleto = estatusAnterior === 'En revision' || actorRol === 'usuario';
  const estatusAnteriorNormalizado = String(estatusAnterior || '').toLowerCase();
  const estaVencida = mensualidad.fecha_vencimiento ? new Date(mensualidad.fecha_vencimiento) < new Date() : false;
  const debePreservarPagadoManual =
    preservarPagadoSinPagos &&
    !tienePagosRegistrados &&
    totalPagado <= 0 &&
    estatusAnteriorNormalizado === 'pagado';

  if (debePreservarPagadoManual) {
    mensualidad.estatus = 'Pagado';
  } else
  if (montoEsperado <= 0) {
    mensualidad.estatus = requiereRevisionPagoCompleto && totalPagado > 0 ? 'En revision' : 'Pagado';
  } else if (totalPagado <= 0) {
    mensualidad.estatus = (esEstatusInsolvente(estatusAnteriorNormalizado) || estaVencida) ? 'Insolvente' : 'Pendiente';
  } else if (totalPagado >= montoEsperado) {
    mensualidad.estatus = requiereRevisionPagoCompleto ? 'En revision' : 'Pagado';
  } else {
    mensualidad.estatus = 'Abono';
  }

  await mensualidad.save();

  return {
    totalPagado,
    restante: redondearMonto(Math.max(0, montoEsperado - totalPagado)),
    estatus: mensualidad.estatus,
    saldoAFavorGenerado: saldoGeneradoNuevo
  };
}

async function obtenerReglaReposoParaPeriodo(alumnoId, mes, anio) {
  const inicioMes = new Date(anio, mes - 1, 1, 0, 0, 0, 0);
  const finMes = new Date(anio, mes, 0, 23, 59, 59, 999);

  const reposoIndefinido = await Reposo.findOne({
    id_alumno: alumnoId,
    tipo: 'Indefinido',
    fecha_inicio: { $lte: finMes }
  }).sort({ fecha_inicio: -1 });

  if (reposoIndefinido) {
    return 'EXENTO_POR_REPOSO';
  }

  const reposoTotal = await Reposo.findOne({
    id_alumno: alumnoId,
    tipo: 'Total',
    fecha_inicio: { $gte: inicioMes, $lte: finMes }
  }).sort({ fecha_inicio: -1 });

  if (reposoTotal) {
    return 'EXENTO_POR_REPOSO';
  }

  return 'NORMAL';
}

async function obtenerObjetivoAjustePorSede({ id_sede, mesNumero, anioNumero }) {
  const alumnos = await Alumno.find({
    sede: id_sede,
    activo: { $ne: false },
    dado_de_baja: { $ne: true },
    $or: [
      { tipo_mensualidad: 'monto_sede' },
      { tipo_mensualidad: { $exists: false } }
    ]
  }).select('_id saldo_a_favor_mensualidades');

  if (alumnos.length === 0) {
    return { alumnos: [], mensualidades: [] };
  }

  const mensualidades = await Mensualidad.find({
    id_alumno: { $in: alumnos.map((alumno) => alumno._id) },
    mes: mesNumero,
    anio: anioNumero
  });

  return { alumnos, mensualidades };
}

function esMensualidadOmitidaAjusteSede(mensualidad) {
  const estatusActual = String(mensualidad.estatus || '').toLowerCase();
  if (estatusActual === 'exonerado' || estatusActual === 'exento por reposo') {
    return true;
  }

  const montoBase = obtenerMontoBaseMensualidad(mensualidad);
  return montoBase <= 0;
}

function generarVistaPreviaAjusteSede(mensualidades, nuevoMonto) {
  let actualizables = 0;
  let omitidas = 0;
  let noCompatibles = 0;
  let montoBaseMinimo = null;

  for (const mensualidad of mensualidades) {
    if (esMensualidadOmitidaAjusteSede(mensualidad)) {
      omitidas += 1;
      continue;
    }

    const montoBase = obtenerMontoBaseMensualidad(mensualidad);
    if (nuevoMonto > montoBase) {
      noCompatibles += 1;
      if (montoBaseMinimo === null || montoBase < montoBaseMinimo) {
        montoBaseMinimo = montoBase;
      }
      continue;
    }

    actualizables += 1;
  }

  return {
    mensualidades_actualizables: actualizables,
    mensualidades_omitidas: omitidas,
    mensualidades_no_compatibles: noCompatibles,
    monto_base_minimo_compatible: montoBaseMinimo
  };
}

async function generarMensualidadesMesCore() {
  const hoy = new Date();
  const mes = hoy.getMonth() + 1;
  const anio = hoy.getFullYear();
  const fecha_vencimiento = new Date(anio, mes - 1, 5, 23, 59, 59); // Día 5 del mes actual
  const alumnos = await Alumno.find({
    activo: { $ne: false },
    dado_de_baja: { $ne: true }
  });
  let creadas = 0;

  for (const alumno of alumnos) {
    const existe = await Mensualidad.findOne({ id_alumno: alumno._id, mes, anio });
    if (!existe) {
      const montoBase = await resolverMontoBaseAlumno(alumno);
      let monto = montoBase;
      let creditoAplicado = 0;
      let estatus = 'Pendiente';

      const reglaReposo = await obtenerReglaReposoParaPeriodo(alumno._id, mes, anio);
      if (reglaReposo === 'EXENTO_POR_REPOSO') {
        monto = 0;
        estatus = 'Exento por reposo';
      } else {
        const credito = await consumirSaldoAFavor(alumno, montoBase);
        creditoAplicado = credito.creditoAplicado;
        monto = credito.montoEsperado;
      }

      await Mensualidad.create({
        id_alumno: alumno._id,
        mes,
        anio,
        monto_base: montoBase,
        credito_aplicado: creditoAplicado,
        ajuste_extraordinario: 0,
        saldo_a_favor_generado: 0,
        monto_esperado: monto,
        fecha_vencimiento,
        estatus
      });
      creadas++;
    }
  }

  return creadas;
}

function obtenerMesSiguiente(fechaBase = new Date()) {
  const base = new Date(fechaBase);
  const siguiente = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  return {
    mes: siguiente.getMonth() + 1,
    anio: siguiente.getFullYear()
  };
}

async function actualizarRetrasadosCore({ force = false } = {}) {
  const hoy = new Date();
  if (!force && hoy.getDate() !== 6) return 0;
  const mes = hoy.getMonth() + 1;
  const anio = hoy.getFullYear();
  const result = await Mensualidad.updateMany(
    { mes, anio, estatus: 'Pendiente', fecha_vencimiento: { $lt: hoy } },
    { $set: { estatus: 'Insolvente' } }
  );
  return result.modifiedCount;
}

// Registrar la primera mensualidad manualmente
exports.registrarPrimeraMensualidad = async (req, res) => {
  try {
    const { id_alumno, monto_esperado, fecha_vencimiento, estatus } = req.body;
    if (!id_alumno || !monto_esperado) {
      return res.status(400).json({ error: 'Faltan datos requeridos' });
    }
    const hoy = new Date();
    const mes = hoy.getMonth() + 1;
    const anio = hoy.getFullYear();
    const alumno = await Alumno.findById(id_alumno);
    if (!alumno) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }
    const existe = await Mensualidad.findOne({ id_alumno, mes, anio });
    if (existe) {
      return res.status(400).json({ error: 'Ya existe una mensualidad para este alumno este mes' });
    }

    const reglaReposo = await obtenerReglaReposoParaPeriodo(id_alumno, mes, anio);
    const montoBase = redondearMonto(monto_esperado);
    let creditoAplicado = 0;
    let montoFinal = montoBase;
    const estatusFinal = reglaReposo === 'EXENTO_POR_REPOSO' ? 'Exento por reposo' : (estatus || 'Pendiente');

    if (reglaReposo === 'EXENTO_POR_REPOSO') {
      montoFinal = 0;
    } else {
      const credito = await consumirSaldoAFavor(alumno, montoBase);
      creditoAplicado = credito.creditoAplicado;
      montoFinal = credito.montoEsperado;
    }

    const mensualidad = await Mensualidad.create({
      id_alumno,
      mes,
      anio,
      monto_base: montoBase,
      credito_aplicado: creditoAplicado,
      ajuste_extraordinario: 0,
      saldo_a_favor_generado: 0,
      monto_esperado: montoFinal,
      fecha_vencimiento: fecha_vencimiento || new Date(anio, mes - 1, 5, 23, 59, 59),
      estatus: estatusFinal
    });

    const estatusNormalizado = String(estatusFinal || '').toLowerCase();
    if (estatusNormalizado === 'pagado' && montoFinal > 0) {
      await PagoDetalle.create({
        id_mensualidad: mensualidad._id,
        monto_pagado: montoFinal,
        fecha_pago: new Date(),
        metodo_pago: 'Registro inicial admin',
        referencia: 'primera-mensualidad'
      });
    }

    res.json(mensualidad);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Generar mensualidades automáticamente para todos los alumnos activos
exports.generarMensualidadesMes = async (req, res) => {
  try {
    const creadas = await generarMensualidadesMesCore();
    res.json({ message: `Mensualidades generadas: ${creadas}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.adelantarMensualidadSiguiente = async (req, res) => {
  try {
    const { id_alumno } = req.body;
    if (!id_alumno) {
      return res.status(400).json({ error: 'id_alumno es requerido' });
    }

    const alumno = await Alumno.findById(id_alumno);
    if (!alumno) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    if (alumno.activo === false || alumno.dado_de_baja === true) {
      return res.status(400).json({ error: 'No se puede adelantar mensualidad para un alumno inactivo o dado de baja' });
    }

    const { mes, anio } = obtenerMesSiguiente(new Date());
    const existente = await Mensualidad.findOne({ id_alumno, mes, anio }).populate('id_alumno');
    if (existente) {
      return res.json({
        message: 'La mensualidad del mes siguiente ya existe',
        mensualidad: existente,
        creada: false
      });
    }

    const fecha_vencimiento = new Date(anio, mes - 1, 5, 23, 59, 59);
    const montoBase = await resolverMontoBaseAlumno(alumno);
    let monto = montoBase;
    let creditoAplicado = 0;
    let estatus = 'Pendiente';

    const reglaReposo = await obtenerReglaReposoParaPeriodo(alumno._id, mes, anio);
    if (reglaReposo === 'EXENTO_POR_REPOSO') {
      monto = 0;
      estatus = 'Exento por reposo';
    } else {
      const credito = await consumirSaldoAFavor(alumno, montoBase);
      creditoAplicado = credito.creditoAplicado;
      monto = credito.montoEsperado;
    }

    const mensualidad = await Mensualidad.create({
      id_alumno,
      mes,
      anio,
      monto_base: montoBase,
      credito_aplicado: creditoAplicado,
      ajuste_extraordinario: 0,
      saldo_a_favor_generado: 0,
      monto_esperado: monto,
      fecha_vencimiento,
      estatus
    });

    const mensualidadPopulada = await Mensualidad.findById(mensualidad._id).populate('id_alumno');
    return res.status(201).json({
      message: 'Mensualidad del mes siguiente creada correctamente',
      mensualidad: mensualidadPopulada,
      creada: true
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// Actualizar mensualidades a 'Retrasado' el día 6 si siguen en 'Pendiente'
exports.actualizarRetrasados = async (req, res) => {
  try {
    const actualizadas = await actualizarRetrasadosCore();
    if (!actualizadas) return res.json({ message: 'Solo se ejecuta el día 6' });
    res.json({ message: `Mensualidades actualizadas a Retrasado: ${actualizadas}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.generarMensualidadesMesCore = generarMensualidadesMesCore;
exports.actualizarRetrasadosCore = actualizarRetrasadosCore;

exports.previewAjusteExtraordinarioSede = async (req, res) => {
  try {
    const { id_sede, mes, anio, nuevo_monto } = req.body;

    if (!id_sede || !mes || !anio || nuevo_monto === undefined || nuevo_monto === null || nuevo_monto === '') {
      return res.status(400).json({ error: 'id_sede, mes, anio y nuevo_monto son requeridos' });
    }

    const mesNumero = Number(mes);
    const anioNumero = Number(anio);
    const nuevoMonto = redondearMonto(nuevo_monto);

    if (!Number.isInteger(mesNumero) || mesNumero < 1 || mesNumero > 12) {
      return res.status(400).json({ error: 'Mes inválido' });
    }

    if (!Number.isInteger(anioNumero) || anioNumero < 2000) {
      return res.status(400).json({ error: 'Año inválido' });
    }

    if (nuevoMonto < 0) {
      return res.status(400).json({ error: 'El nuevo monto no puede ser negativo' });
    }

    const { alumnos, mensualidades } = await obtenerObjetivoAjustePorSede({ id_sede, mesNumero, anioNumero });

    if (alumnos.length === 0) {
      return res.status(404).json({ error: 'No hay alumnos activos con monto por sede en esta sede' });
    }

    if (mensualidades.length === 0) {
      return res.status(404).json({ error: 'No hay mensualidades generadas para esa sede en el periodo indicado' });
    }

    const preview = generarVistaPreviaAjusteSede(mensualidades, nuevoMonto);

    return res.json({
      message: 'Vista previa generada correctamente',
      total_mensualidades_evaluadas: mensualidades.length,
      ...preview,
      nuevo_monto: nuevoMonto,
      mes: mesNumero,
      anio: anioNumero
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

exports.aplicarAjusteExtraordinarioSede = async (req, res) => {
  try {
    const { id_sede, mes, anio, nuevo_monto, descripcion } = req.body;

    if (!id_sede || !mes || !anio || nuevo_monto === undefined || nuevo_monto === null || nuevo_monto === '') {
      return res.status(400).json({ error: 'id_sede, mes, anio y nuevo_monto son requeridos' });
    }

    const mesNumero = Number(mes);
    const anioNumero = Number(anio);
    const nuevoMonto = redondearMonto(nuevo_monto);

    if (!Number.isInteger(mesNumero) || mesNumero < 1 || mesNumero > 12) {
      return res.status(400).json({ error: 'Mes inválido' });
    }

    if (!Number.isInteger(anioNumero) || anioNumero < 2000) {
      return res.status(400).json({ error: 'Año inválido' });
    }

    if (nuevoMonto < 0) {
      return res.status(400).json({ error: 'El nuevo monto no puede ser negativo' });
    }

    const { alumnos, mensualidades } = await obtenerObjetivoAjustePorSede({ id_sede, mesNumero, anioNumero });

    if (alumnos.length === 0) {
      return res.status(404).json({ error: 'No hay alumnos activos con monto por sede en esta sede' });
    }

    const alumnoMap = new Map(alumnos.map((alumno) => [String(alumno._id), alumno]));

    if (mensualidades.length === 0) {
      return res.status(404).json({ error: 'No hay mensualidades generadas para esa sede en el periodo indicado' });
    }

    const preview = generarVistaPreviaAjusteSede(mensualidades, nuevoMonto);
    if (preview.mensualidades_no_compatibles > 0) {
      return res.status(400).json({
        error: 'El nuevo monto excede el monto base de una o más mensualidades del periodo',
        mensualidades_no_compatibles: preview.mensualidades_no_compatibles,
        monto_base_minimo_compatible: preview.monto_base_minimo_compatible
      });
    }

    let actualizadas = 0;
    let omitidas = 0;
    let saldoTotalGenerado = 0;
    let alumnosConSaldoAFavor = 0;

    for (const mensualidad of mensualidades) {
      if (esMensualidadOmitidaAjusteSede(mensualidad)) {
        omitidas += 1;
        continue;
      }

      const montoBase = obtenerMontoBaseMensualidad(mensualidad);

      mensualidad.monto_base = montoBase;
      mensualidad.ajuste_extraordinario = redondearMonto(montoBase - nuevoMonto);
      mensualidad.ajuste_descripcion = descripcion ? String(descripcion).trim() : 'Ajuste extraordinario por sede';
      mensualidad.ajuste_fecha = new Date();
      mensualidad.monto_esperado = redondearMonto(
        Math.max(0, montoBase - (Number(mensualidad.credito_aplicado) || 0) - mensualidad.ajuste_extraordinario)
      );

      const resultado = await recalcularMensualidadPorPagos(mensualidad, {
        actorRol: 'admin',
        estatusAnterior: mensualidad.estatus,
        preservarPagadoSinPagos: true
      });

      actualizadas += 1;
      saldoTotalGenerado = redondearMonto(saldoTotalGenerado + resultado.saldoAFavorGenerado);

      if (resultado.saldoAFavorGenerado > 0) {
        const alumno = alumnoMap.get(String(mensualidad.id_alumno));
        if (alumno) {
          alumnosConSaldoAFavor += 1;
          alumnoMap.delete(String(mensualidad.id_alumno));
        }
      }
    }

    res.json({
      message: 'Ajuste extraordinario aplicado correctamente',
      mensualidades_actualizadas: actualizadas,
      mensualidades_omitidas: omitidas,
      alumnos_con_saldo_a_favor: alumnosConSaldoAFavor,
      saldo_total_generado: saldoTotalGenerado,
      nuevo_monto: nuevoMonto,
      mes: mesNumero,
      anio: anioNumero
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Consultar mensualidades (por sede, alumno, mes, año)
exports.getMensualidades = async (req, res) => {
  try {
    const filtro = {};
    let ownedAlumnoIds = null;

    if (req.user?.rol === 'usuario') {
      const representantes = await Representante.find({ usuario: req.user.id }).select('_id');
      const representanteIds = representantes.map((r) => r._id);
      const filtroPropio = [{ usuario: req.user.id }];
      if (representanteIds.length > 0) {
        filtroPropio.push({ representante: { $in: representanteIds } });
      }

      const alumnosPropios = await Alumno.find({ $or: filtroPropio }).select('_id');
      ownedAlumnoIds = alumnosPropios.map((a) => String(a._id));
      if (ownedAlumnoIds.length === 0) {
        return res.json([]);
      }
    }

    if (req.query.id_alumno) filtro.id_alumno = req.query.id_alumno;
    if (req.query.mes) filtro.mes = Number(req.query.mes);
    if (req.query.anio) filtro.anio = Number(req.query.anio);
    // Si se quiere filtrar por sede, buscar alumnos de esa sede
      if (req.query.id_sede) {
        console.log('Tipo de req.query.id_sede:', typeof req.query.id_sede, 'Valor:', req.query.id_sede);
        const mongoose = require('mongoose');
        let idSede;
        try {
          idSede = new mongoose.Types.ObjectId(req.query.id_sede);
        } catch (e) {
          console.log('Error al convertir id_sede:', e);
          return res.status(400).json({ error: 'id_sede inválido' });
        }
        const alumnos = await Alumno.find({ sede: idSede });
        filtro.id_alumno = { $in: alumnos.map(a => a._id) };
      }

    if (ownedAlumnoIds) {
      if (!filtro.id_alumno) {
        filtro.id_alumno = { $in: ownedAlumnoIds };
      } else if (typeof filtro.id_alumno === 'string') {
        if (!ownedAlumnoIds.includes(String(filtro.id_alumno))) {
          return res.json([]);
        }
      } else if (filtro.id_alumno.$in) {
        const permitidos = filtro.id_alumno.$in
          .map((id) => String(id))
          .filter((id) => ownedAlumnoIds.includes(id));

        if (permitidos.length === 0) {
          return res.json([]);
        }
        filtro.id_alumno = { $in: permitidos };
      }
    }

    const mensualidades = await Mensualidad.find(filtro).populate({
      path: 'id_alumno',
      populate: {
        path: 'representante',
        select: 'nombres apellidos'
      }
    });

    const mensualidadIds = mensualidades.map((m) => m._id);
    const pagosPorMensualidad = mensualidadIds.length > 0
      ? await PagoDetalle.aggregate([
          { $match: { id_mensualidad: { $in: mensualidadIds } } },
          {
            $group: {
              _id: '$id_mensualidad',
              total_pagado: { $sum: { $ifNull: ['$monto_pagado', 0] } }
            }
          }
        ])
      : [];

    const totalPagadoMap = new Map(
      pagosPorMensualidad.map((item) => [String(item._id), redondearMonto(item.total_pagado)])
    );

    // Compatibilidad: data histórica con "Retrasado" se expone como "Insolvente".
    const mensualidadesCompat = mensualidades.map((m) => {
      const raw = m.toObject ? m.toObject() : m;
      const totalPagado = totalPagadoMap.get(String(raw._id)) || 0;
      const saldoPendiente = redondearMonto(Math.max(0, (Number(raw.monto_esperado) || 0) - totalPagado));

      raw.total_pagado = totalPagado;
      raw.saldo_pendiente = saldoPendiente;
      raw.monto_total = redondearMonto(raw.monto_esperado || 0);

      if (esEstatusInsolvente(raw.estatus)) {
        raw.estatus = 'Insolvente';
      }
      return raw;
    });

    res.json(mensualidadesCompat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Confirmar mensualidad en revisión
exports.confirmarMensualidad = async (req, res) => {
  try {
    const mensualidad = await Mensualidad.findById(req.params.id);
    if (!mensualidad) return res.status(404).json({ error: 'Mensualidad no encontrada' });
    mensualidad.estatus = 'Pagado';
    await mensualidad.save();
    res.json({ message: 'Mensualidad confirmada', mensualidad });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Resumen de mensualidades por sede (mes en curso por defecto)
exports.getResumenMensualidadesPorSede = async (req, res) => {
  try {
    const hoy = new Date();
    const mes = req.query.mes ? Number(req.query.mes) : hoy.getMonth() + 1;
    const anio = req.query.anio ? Number(req.query.anio) : hoy.getFullYear();

    const pipeline = [
      { $match: { mes, anio } },
      {
        $lookup: {
          from: 'alumnos',
          localField: 'id_alumno',
          foreignField: '_id',
          as: 'alumno'
        }
      },
      { $unwind: '$alumno' },
      {
        $match: {
          'alumno.activo': { $ne: false },
          'alumno.dado_de_baja': { $ne: true }
        }
      },
      {
        $lookup: {
          from: 'sedes',
          localField: 'alumno.sede',
          foreignField: '_id',
          as: 'sede'
        }
      },
      { $unwind: { path: '$sede', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: {
            sedeId: '$sede._id',
            sedeNombre: '$sede.nombre',
            estatus: '$estatus'
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: { sedeId: '$_id.sedeId', sedeNombre: '$_id.sedeNombre' },
          estatuses: { $push: { estatus: '$_id.estatus', count: '$count' } },
          total: { $sum: '$count' }
        }
      },
      {
        $project: {
          _id: 0,
          sedeId: '$_id.sedeId',
          sedeNombre: '$_id.sedeNombre',
          estatuses: 1,
          total: 1
        }
      }
    ];

    const data = await Mensualidad.aggregate(pipeline);
    const estados = ['pagado', 'pendiente', 'retrasado', 'en revision', 'exonerado', 'abono', 'exento por reposo'];
    const resultado = data.map(item => {
      const conteos = {};
      estados.forEach(e => { conteos[e] = 0; });
      item.estatuses.forEach(e => {
        const key = String(e.estatus || '').toLowerCase();
        if (conteos[key] !== undefined) conteos[key] = e.count;
      });
      return {
        sedeId: item.sedeId,
        sedeNombre: item.sedeNombre || 'Sin sede',
        total: item.total,
        ...conteos
      };
    });

    res.json({ mes, anio, sedes: resultado });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Dolares pagados por sede para el mes/anio seleccionado
exports.getDolaresPagadosPorSede = async (req, res) => {
  try {
    const hoy = new Date();
    const mes = req.query.mes ? Number(req.query.mes) : hoy.getMonth() + 1;
    const anio = req.query.anio ? Number(req.query.anio) : hoy.getFullYear();

    if (!Number.isInteger(mes) || mes < 1 || mes > 12) {
      return res.status(400).json({ error: 'Mes inválido' });
    }
    if (!Number.isInteger(anio) || anio < 2000) {
      return res.status(400).json({ error: 'Año inválido' });
    }

    const pipeline = [
      { $match: { mes, anio } },
      {
        $lookup: {
          from: 'alumnos',
          localField: 'id_alumno',
          foreignField: '_id',
          as: 'alumno'
        }
      },
      { $unwind: '$alumno' },
      {
        $match: {
          'alumno.activo': { $ne: false },
          'alumno.dado_de_baja': { $ne: true }
        }
      },
      {
        $lookup: {
          from: 'sedes',
          localField: 'alumno.sede',
          foreignField: '_id',
          as: 'sede'
        }
      },
      { $unwind: { path: '$sede', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'pagodetalles',
          let: { mensualidadId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$id_mensualidad', '$$mensualidadId'] }
              }
            },
            {
              $group: {
                _id: null,
                total_pagado: { $sum: { $ifNull: ['$monto_pagado', 0] } }
              }
            }
          ],
          as: 'pagos'
        }
      },
      {
        $addFields: {
          total_pagado_mensualidad: {
            $ifNull: [{ $arrayElemAt: ['$pagos.total_pagado', 0] }, 0]
          }
        }
      },
      {
        $group: {
          _id: {
            sedeId: '$sede._id',
            sedeNombre: '$sede.nombre'
          },
          monto_pagado: { $sum: '$total_pagado_mensualidad' }
        }
      },
      {
        $project: {
          _id: 0,
          sedeId: '$_id.sedeId',
          sedeNombre: { $ifNull: ['$_id.sedeNombre', 'Sin sede'] },
          monto_pagado: 1
        }
      },
      { $sort: { sedeNombre: 1 } }
    ];

    const data = await Mensualidad.aggregate(pipeline);
    const sedes = data.map((item) => ({
      sedeId: item.sedeId,
      sedeNombre: item.sedeNombre,
      monto_pagado: redondearMonto(item.monto_pagado)
    }));

    return res.json({ mes, anio, sedes });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
