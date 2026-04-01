// Obtener alumnos por representante
exports.getAlumnosPorRepresentante = async (req, res) => {
  try {
    const esUsuarioFinal = req.user?.rol === 'usuario';
    let alumnos = [];
    const incluirBajas = req.query.incluirBajas === '1';
    const filtroBajas = incluirBajas ? {} : { activo: { $ne: false } };

    if (esUsuarioFinal) {
      const representantes = await Representante.find({ usuario: req.user.id }).select('_id');
      const representanteIds = representantes.map((r) => r._id);
      const filtroPropio = [{ usuario: req.user.id }];
      if (representanteIds.length > 0) {
        filtroPropio.push({ representante: { $in: representanteIds } });
      }

      let queryUsuario = Alumno.find({ ...filtroBajas, $or: filtroPropio });
      if (req.query.populateSede === '1') {
        queryUsuario = queryUsuario.populate('sede');
      }
      const propios = await queryUsuario;
      return res.json(propios);
    }

    if (req.params.representanteId && req.params.representanteId !== 'null') {
      let query = Alumno.find({ representante: req.params.representanteId, ...filtroBajas });
      if (req.query.populateSede === '1') {
        query = query.populate('sede');
      }
      alumnos = await query;
    }
    // Si no hay alumnos asociados a representante, buscar por usuario
    if ((!alumnos || alumnos.length === 0) && req.query.usuarioId) {
      let query2 = Alumno.find({ usuario: req.query.usuarioId, ...filtroBajas });
      if (req.query.populateSede === '1') {
        query2 = query2.populate('sede');
      }
      alumnos = await query2;
    }
    res.json(alumnos);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener alumnos por representante/usuario' });
  }
};

const Alumno = require('../models/Alumno');
const Representante = require('../models/Representante');
const User = require('../models/User');
const Mensualidad = require('../models/Mensualidad');
const Sede = require('../models/Sede');
const Reposo = require('../models/Reposo');
const PagoDetalle = require('../models/PagoDetalle');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

function buildUploadUrl(req, file, folder) {
  if (!file || !file.filename) return null;
  return `/uploads/${folder}/${file.filename}`;
}

function normalizarCategoria(valor) {
  return String(valor || '').trim().toUpperCase();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizarNumeroFranela(valor) {
  if (valor === undefined || valor === null || valor === '') return undefined;
  const nro = Number(valor);
  if (Number.isNaN(nro)) return NaN;
  return nro;
}

async function validarNumeroFranelaDisponible({ numeroFranela, categoria, excludeAlumnoId }) {
  if (numeroFranela === undefined || numeroFranela === null || numeroFranela === '') return;

  if (!Number.isInteger(numeroFranela) || numeroFranela < 1 || numeroFranela > 100) {
    throw new Error('El nro de franela debe estar entre 1 y 100.');
  }

  const categoriaNormalizada = normalizarCategoria(categoria);
  if (!categoriaNormalizada) {
    throw new Error('La categoria es obligatoria para asignar nro de franela.');
  }

  const filtro = {
    categoria: categoriaNormalizada,
    numero_franela: numeroFranela,
    activo: { $ne: false }
  };

  if (excludeAlumnoId) {
    filtro._id = { $ne: excludeAlumnoId };
  }

  const alumnoExistente = await Alumno.findOne(filtro).select('_id nombres apellidos sede categoria numero_franela');
  if (alumnoExistente) {
    throw new Error(
      `El nro de franela ${numeroFranela} ya esta asignado en la categoria ${categoriaNormalizada} a ${alumnoExistente.nombres} ${alumnoExistente.apellidos}.`
    );
  }
}

function normalizarTipoReposo(tipo) {
  const valor = String(tipo || '').trim().toLowerCase();
  if (valor === 'indefinido') return 'Indefinido';
  if (valor === 'total') return 'Total';
  if (valor === 'parcial') return 'Parcial';
  return null;
}

function parseDateInput(value) {
  const raw = String(value || '').trim();
  const matchIso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (matchIso) {
    const year = Number(matchIso[1]);
    const month = Number(matchIso[2]);
    const day = Number(matchIso[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getPeriodoFromInput(rawValue, parsedDate) {
  const raw = String(rawValue || '').trim();
  const matchIso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (matchIso) {
    return {
      mes: Number(matchIso[2]),
      anio: Number(matchIso[1])
    };
  }

  if (parsedDate instanceof Date && !Number.isNaN(parsedDate.getTime())) {
    return {
      mes: parsedDate.getUTCMonth() + 1,
      anio: parsedDate.getUTCFullYear()
    };
  }

  const now = new Date();
  return {
    mes: now.getUTCMonth() + 1,
    anio: now.getUTCFullYear()
  };
}

function redondearMonto(valor) {
  return Number((Number(valor) || 0).toFixed(2));
}

function esEstatusInsolvente(estatus) {
  const normalizado = String(estatus || '').toLowerCase();
  return normalizado === 'retrasado' || normalizado === 'insolvente';
}

function buildPeriodoKey(mes, anio) {
  return `${anio}-${String(mes).padStart(2, '0')}`;
}

async function resolverMontoBaseAlumno(alumno) {
  if (alumno.tipo_mensualidad === 'monto_sede' || !alumno.tipo_mensualidad) {
    const sedeId = alumno.sede && alumno.sede._id ? alumno.sede._id : alumno.sede;
    const sede = await Sede.findById(sedeId).select('costo');
    return redondearMonto(sede && sede.costo ? sede.costo : 0);
  }

  if (alumno.tipo_mensualidad === 'monto_personalizado') {
    return redondearMonto(alumno.monto_personalizado_valor || 0);
  }

  return 0;
}

async function recalcularMensualidadPorPagos(mensualidad, estatusAnterior = null) {
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

  const estatusAnteriorNormalizado = String(estatusAnterior || '').toLowerCase();
  const estaVencida = mensualidad.fecha_vencimiento ? new Date(mensualidad.fecha_vencimiento) < new Date() : false;

  if (montoEsperado <= 0) {
    mensualidad.estatus = totalPagado > 0 ? 'En revision' : 'Pagado';
  } else if (totalPagado <= 0) {
    mensualidad.estatus = (esEstatusInsolvente(estatusAnteriorNormalizado) || estaVencida) ? 'Insolvente' : 'Pendiente';
  } else if (totalPagado >= montoEsperado) {
    mensualidad.estatus = 'Pagado';
  } else {
    mensualidad.estatus = 'Abono';
  }

  await mensualidad.save();
}

async function obtenerReglaReposoParaPeriodo(alumnoId, mes, anio) {
  const inicioMes = new Date(Date.UTC(anio, mes - 1, 1, 0, 0, 0, 0));
  const finMes = new Date(Date.UTC(anio, mes, 0, 23, 59, 59, 999));

  const reposoIndefinido = await Reposo.findOne({
    id_alumno: alumnoId,
    estado: { $ne: 'Inactivo' },
    tipo: 'Indefinido',
    fecha_inicio: { $lte: finMes },
    $or: [
      { fecha_fin: null },
      { fecha_fin: { $gte: inicioMes } }
    ]
  }).sort({ fecha_inicio: -1 });

  if (reposoIndefinido) {
    return 'EXENTO_POR_REPOSO';
  }

  const reposoTotal = await Reposo.findOne({
    id_alumno: alumnoId,
    estado: { $ne: 'Inactivo' },
    tipo: 'Total',
    $or: [
      {
        fecha_fin: { $ne: null, $gte: inicioMes },
        fecha_inicio: { $lte: finMes }
      },
      {
        fecha_fin: null,
        fecha_inicio: { $gte: inicioMes, $lte: finMes }
      }
    ]
  }).sort({ fecha_inicio: -1 });

  return reposoTotal ? 'EXENTO_POR_REPOSO' : 'NORMAL';
}

async function listarPeriodosAfectadosPorReposo(alumnoId, reposo) {
  if (!reposo || !reposo.fecha_inicio) return [];

  const tipo = normalizarTipoReposo(reposo.tipo);
  if (!tipo) return [];

  if (tipo === 'Parcial') return [];

  if (tipo === 'Total') {
    return listarPeriodosEntreFechas(reposo.fecha_inicio, reposo.fecha_fin || reposo.fecha_inicio);
  }

  if (reposo.fecha_fin) {
    return listarPeriodosEntreFechas(reposo.fecha_inicio, reposo.fecha_fin);
  }

  const inicioMes = reposo.fecha_inicio.getUTCMonth() + 1;
  const inicioAnio = reposo.fecha_inicio.getUTCFullYear();
  const mensualidades = await Mensualidad.find({
    id_alumno: alumnoId,
    $or: [
      { anio: { $gt: inicioAnio } },
      { anio: inicioAnio, mes: { $gte: inicioMes } }
    ]
  }).select('mes anio').lean();

  const periodosMap = new Map();
  periodosMap.set(buildPeriodoKey(inicioMes, inicioAnio), { mes: inicioMes, anio: inicioAnio });
  mensualidades.forEach((mensualidad) => {
    periodosMap.set(buildPeriodoKey(mensualidad.mes, mensualidad.anio), {
      mes: mensualidad.mes,
      anio: mensualidad.anio
    });
  });

  return Array.from(periodosMap.values());
}

async function sincronizarMensualidadesAfectadasPorReposos(alumnoId, periodos) {
  if (!Array.isArray(periodos) || periodos.length === 0) return;

  const alumno = await Alumno.findById(alumnoId).select('sede tipo_mensualidad monto_personalizado_valor');
  if (!alumno) return;

  const periodosUnicos = Array.from(
    new Map(periodos.map((periodo) => [buildPeriodoKey(periodo.mes, periodo.anio), periodo])).values()
  );

  for (const periodo of periodosUnicos) {
    const reglaReposo = await obtenerReglaReposoParaPeriodo(alumnoId, periodo.mes, periodo.anio);
    let mensualidad = await Mensualidad.findOne({ id_alumno: alumnoId, mes: periodo.mes, anio: periodo.anio });

    if (reglaReposo === 'EXENTO_POR_REPOSO') {
      await upsertMensualidadExentaPorReposo(alumnoId, periodo.mes, periodo.anio);
      continue;
    }

    if (!mensualidad) continue;

    const estatusActual = String(mensualidad.estatus || '').toLowerCase();
    const estuvoExentaPorReposo = estatusActual === 'exento por reposo' || redondearMonto(mensualidad.monto_esperado || 0) <= 0;
    if (!estuvoExentaPorReposo) continue;

    const montoBase = mensualidad.monto_base !== undefined && mensualidad.monto_base !== null
      ? redondearMonto(mensualidad.monto_base)
      : await resolverMontoBaseAlumno(alumno);

    mensualidad.monto_base = montoBase;
    mensualidad.credito_aplicado = redondearMonto(mensualidad.credito_aplicado || 0);
    mensualidad.ajuste_extraordinario = redondearMonto(mensualidad.ajuste_extraordinario || 0);
    mensualidad.monto_esperado = redondearMonto(
      Math.max(0, montoBase - mensualidad.credito_aplicado - mensualidad.ajuste_extraordinario)
    );

    await recalcularMensualidadPorPagos(mensualidad, estatusActual || 'Exento por reposo');
  }
}

function listarPeriodosEntreFechas(inicioDate, finDate) {
  const inicio = new Date(Date.UTC(inicioDate.getUTCFullYear(), inicioDate.getUTCMonth(), 1, 12, 0, 0));
  const fin = new Date(Date.UTC(finDate.getUTCFullYear(), finDate.getUTCMonth(), 1, 12, 0, 0));
  const periodos = [];

  const cursor = new Date(inicio);
  while (cursor <= fin) {
    periodos.push({
      mes: cursor.getUTCMonth() + 1,
      anio: cursor.getUTCFullYear()
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return periodos;
}

async function aplicarReposoTotalPorPeriodo(alumnoId, fechaInicio, fechaFin = null) {
  if (!(fechaInicio instanceof Date) || Number.isNaN(fechaInicio.getTime())) return;

  const fechaFinal = fechaFin instanceof Date && !Number.isNaN(fechaFin.getTime())
    ? fechaFin
    : fechaInicio;

  const periodos = listarPeriodosEntreFechas(fechaInicio, fechaFinal);
  for (const periodo of periodos) {
    await upsertMensualidadExentaPorReposo(alumnoId, periodo.mes, periodo.anio);
  }
}

async function upsertMensualidadExentaPorReposo(alumnoId, mes, anio) {
  const fechaVencimiento = new Date(anio, mes - 1, 5, 23, 59, 59);
  await Mensualidad.findOneAndUpdate(
    { id_alumno: alumnoId, mes, anio, estatus: { $ne: 'Pagado' } },
    {
      $set: {
        monto_esperado: 0,
        estatus: 'Exento por reposo',
        fecha_vencimiento: fechaVencimiento
      }
    },
    {
      upsert: true,
      setDefaultsOnInsert: true,
      new: true
    }
  );
}

async function eliminarUsuarioSiQuedaHuerfano(userId) {
  if (!userId) return;

  const [alumnoRelacionado, representanteRelacionado] = await Promise.all([
    Alumno.findOne({ usuario: userId }).select('_id'),
    Representante.findOne({ usuario: userId }).select('_id')
  ]);

  if (!alumnoRelacionado && !representanteRelacionado) {
    await User.findByIdAndDelete(userId);
  }
}

async function sincronizarUsuarioPortalRepresentante({ representante, cedulaAnterior, cedulaNueva, nombres, apellidos }) {
  if (!representante || !cedulaNueva) return;

  const nombreCompleto = `${String(nombres || '').trim()} ${String(apellidos || '').trim()}`.trim();
  let user = null;

  if (representante.usuario) {
    user = await User.findById(representante.usuario);
  }

  if (!user) {
    user = await User.findOne({ email: cedulaNueva });
    if (!user) {
      const password = await bcrypt.hash(cedulaNueva, 10);
      user = new User({
        nombre: nombreCompleto,
        email: cedulaNueva,
        password,
        rol: 'usuario'
      });
      await user.save();
    }
    representante.usuario = user._id;
    await representante.save();
    return;
  }

  if (String(user.email || '').trim() !== cedulaNueva) {
    const userConCedulaNueva = await User.findOne({ email: cedulaNueva }).select('_id');
    if (userConCedulaNueva && String(userConCedulaNueva._id) !== String(user._id)) {
      throw new Error('Ya existe un usuario de portal con esa cedula de representante.');
    }

    const cedulaVieja = String(cedulaAnterior || '').trim();
    if (cedulaVieja) {
      const passwordEraCedulaAnterior = await bcrypt.compare(cedulaVieja, user.password);
      if (passwordEraCedulaAnterior) {
        user.password = await bcrypt.hash(cedulaNueva, 10);
      }
    }

    user.email = cedulaNueva;
  }

  if (nombreCompleto) {
    user.nombre = nombreCompleto;
  }
  await user.save();
}

// Obtener todos los alumnos
exports.getAlumnos = async (req, res) => {
  try {
    const incluirBajas = req.query.incluirBajas === '1';
    const filtro = incluirBajas ? {} : { activo: { $ne: false } };

    if (req.user?.rol === 'usuario') {
      const representantes = await Representante.find({ usuario: req.user.id }).select('_id');
      const representanteIds = representantes.map((r) => r._id);
      const filtroPropio = [{ usuario: req.user.id }];
      if (representanteIds.length > 0) {
        filtroPropio.push({ representante: { $in: representanteIds } });
      }
      filtro.$or = filtroPropio;
    }

    if (req.query.cedula) {
      filtro.cedula = req.query.cedula;
    }
    if (req.query.sede) {
      filtro.sede = req.query.sede;
    }
    const alumnos = await Alumno.find(filtro).populate('representante').populate('sede').lean();

    const alumnoIds = alumnos.map((alumno) => alumno._id);
    const ahora = new Date();
    const repososActivos = alumnoIds.length > 0
      ? await Reposo.find({
          id_alumno: { $in: alumnoIds },
          estado: 'Activo',
          fecha_inicio: { $lte: ahora },
          $or: [{ fecha_fin: null }, { fecha_fin: { $gte: ahora } }]
        }).select('id_alumno').lean()
      : [];

    const alumnosConReposoActivo = new Set(
      repososActivos.map((reposo) => String(reposo.id_alumno))
    );

    const resultado = alumnos.map((alumno) => ({
      ...alumno,
      tiene_reposo_activo: alumnosConReposoActivo.has(String(alumno._id))
    }));

    console.log('Alumnos obtenidos:', resultado);
    res.json(resultado);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener alumnos' });
  }
};

exports.getDisponibilidadNumeroFranela = async (req, res) => {
  try {
    const categoria = normalizarCategoria(req.query.categoria);
    if (!categoria) {
      return res.status(400).json({ error: 'La categoria es obligatoria.' });
    }

    const filtro = {
      activo: { $ne: false },
      numero_franela: { $gte: 1, $lte: 100 },
      categoria: { $regex: new RegExp(`^${escapeRegex(categoria)}$`, 'i') }
    };

    const excludeAlumnoId = req.query.excludeAlumnoId;
    if (excludeAlumnoId && mongoose.Types.ObjectId.isValid(excludeAlumnoId)) {
      filtro._id = { $ne: excludeAlumnoId };
    }

    const alumnos = await Alumno.find(filtro).select('numero_franela').lean();
    const ocupadosSet = new Set();

    alumnos.forEach((alumno) => {
      const nro = Number(alumno.numero_franela);
      if (Number.isInteger(nro) && nro >= 1 && nro <= 100) {
        ocupadosSet.add(nro);
      }
    });

    const ocupados = Array.from(ocupadosSet).sort((a, b) => a - b);
    const disponibles = [];
    for (let i = 1; i <= 100; i += 1) {
      if (!ocupadosSet.has(i)) disponibles.push(i);
    }

    return res.json({
      categoria,
      ocupados,
      disponibles,
      totalOcupados: ocupados.length,
      totalDisponibles: disponibles.length
    });
  } catch (err) {
    return res.status(500).json({ error: 'Error al consultar disponibilidad de nro de franela' });
  }
};


// Crear un alumno con representante y usuario
exports.createAlumno = async (req, res) => {
    console.log('BODY recibido:', req.body);
    console.log('FILE recibido:', req.file);
  try {
    let sedeId = req.body.sede;
    if (typeof sedeId === 'string') {
      try {
        const parsed = JSON.parse(sedeId);
        sedeId = parsed._id || sedeId;
      } catch {
        // Si no es JSON, se asume que es el id directamente
      }
    }
    const cedula = (req.body.cedula || '').trim();
    if (cedula && sedeId) {
      const existente = await Alumno.findOne({ cedula, sede: sedeId });
      if (existente) {
        return res.status(409).json({ error: 'Ya existe un alumno con esa cedula en esta sede.' });
      }
    }
    // Permitir crear alumno sin representante si no se envían datos de representante
    let representante = null;
    let user = null;
    const tieneDatosRepresentante = req.body.rep_cedula && req.body.rep_nombres && req.body.rep_apellidos;
    if (tieneDatosRepresentante) {
      // Validar campos obligatorios de representante
      const requiredRepFields = [
        'rep_nombres', 'rep_apellidos', 'rep_cedula'
      ];
      const missingRepFields = requiredRepFields.filter(f => !req.body[f] || req.body[f].trim() === '');
      if (missingRepFields.length > 0) {
        return res.status(400).json({ error: 'Faltan campos obligatorios del representante', detalle: missingRepFields });
      }
      const repData = {
        nombres: req.body.rep_nombres,
        apellidos: req.body.rep_apellidos,
        cedula: req.body.rep_cedula,
        telefono: req.body.rep_telefono,
        domicilio: req.body.rep_domicilio || ''
      };
      representante = await Representante.findOne({ cedula: repData.cedula });
      user = await User.findOne({ email: repData.cedula });
      // Si no existe el usuario, crearlo
      if (!user) {
        const password = await bcrypt.hash(repData.cedula, 10);
        user = new User({
          nombre: repData.nombres + ' ' + repData.apellidos,
          email: repData.cedula, // ahora el email es la cédula
          password,
          rol: 'usuario'
        });
        await user.save();
      }
      // Si no existe el representante, crearlo y asociar el usuario
      if (!representante) {
        representante = new Representante({ ...repData, usuario: user._id });
        await representante.save();
      } else if (!representante.usuario) {
        // Si el representante existe pero no tiene usuario asociado, actualizarlo
        representante.usuario = user._id;
        await representante.save();
      }
    } else {
      // Si no hay datos de representante, crear usuario con la cédula del alumno y asociar al alumno
      if (req.body.cedula && req.body.nombres && req.body.apellidos) {
        user = await User.findOne({ email: req.body.cedula });
        if (!user) {
          const password = await bcrypt.hash(req.body.cedula, 10);
          user = new User({
            nombre: req.body.nombres + ' ' + req.body.apellidos,
            email: req.body.cedula,
            password,
            rol: 'usuario'
          });
          await user.save();
        }
      }
      

    }



    // 3. Crear alumno con referencia al representante
    const alumnoData = {
      ...req.body,
      sede: sedeId,
      representante: representante ? representante._id : undefined,
      usuario: user ? user._id : undefined,
      cedula
    };
    if (alumnoData.categoria !== undefined) {
      alumnoData.categoria = normalizarCategoria(alumnoData.categoria);
    }
    if (Object.prototype.hasOwnProperty.call(alumnoData, 'numero_franela')) {
      const nro = normalizarNumeroFranela(alumnoData.numero_franela);
      if (nro === undefined) {
        delete alumnoData.numero_franela;
      } else {
        alumnoData.numero_franela = nro;
      }
    }
    await validarNumeroFranelaDisponible({
      numeroFranela: alumnoData.numero_franela,
      categoria: alumnoData.categoria
    });
    if (alumnoData.habilitar_pago_cuotas !== undefined) {
      alumnoData.habilitar_pago_cuotas = alumnoData.habilitar_pago_cuotas === true || alumnoData.habilitar_pago_cuotas === 'true';
    }
    if (alumnoData.etiquetas) {
      if (typeof alumnoData.etiquetas === 'string') {
        try {
          alumnoData.etiquetas = JSON.parse(alumnoData.etiquetas);
        } catch {
          alumnoData.etiquetas = [alumnoData.etiquetas];
        }
      }
      if (!Array.isArray(alumnoData.etiquetas)) {
        alumnoData.etiquetas = [];
      }
    }
    // Eliminar los campos de representante del body para evitar duplicidad
    delete alumnoData.rep_nombres;
    delete alumnoData.rep_apellidos;
    delete alumnoData.rep_cedula;
    delete alumnoData.rep_parentesco;
    delete alumnoData.rep_telefono;
    delete alumnoData.rep_domicilio;

    // Si hay archivo de foto, guardar solo la URL pública
    if (req.files && req.files['foto'] && req.files['foto'][0]) {
      const fotoFile = req.files['foto'][0];
      alumnoData.foto = buildUploadUrl(req, fotoFile, 'alumnos');
    }
    // Si hay archivo de foto_cedula, guardar solo la URL pública
    if (req.files && req.files['foto_cedula'] && req.files['foto_cedula'][0]) {
      const cedulaFile = req.files['foto_cedula'][0];
      alumnoData.foto_cedula = buildUploadUrl(req, cedulaFile, 'alumnos');
    }

    const alumno = new Alumno(alumnoData);
    await alumno.save();
    res.status(201).json(alumno);
  } catch (err) {
    console.error('Error al crear alumno:', err);
    res.status(400).json({ error: 'Error al crear alumno', detalle: err.message });
  }
};

// Obtener un alumno por ID
exports.getAlumnoById = async (req, res) => {
  try {
    const alumno = await Alumno.findById(req.params.id).populate('representante').populate('sede');
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });
    res.json(alumno);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener alumno' });
  }
};

// Actualizar un alumno
exports.updateAlumno = async (req, res) => {
  try {
    const alumnoActual = await Alumno.findById(req.params.id).select('_id categoria numero_franela nombres apellidos cedula usuario representante');
    if (!alumnoActual) return res.status(404).json({ error: 'Alumno no encontrado' });

    let updateData = { ...req.body };
    let sedeId = updateData.sede;
    if (typeof sedeId === 'string') {
      try {
        const parsed = JSON.parse(sedeId);
        sedeId = parsed._id || sedeId;
      } catch {
        // Si no es JSON, se asume que es el id directamente
      }
    }
    updateData.sede = sedeId;
    const repNombresInput = req.body.rep_nombres !== undefined ? String(req.body.rep_nombres || '').trim() : undefined;
    const repApellidosInput = req.body.rep_apellidos !== undefined ? String(req.body.rep_apellidos || '').trim() : undefined;
    const repCedulaInput = req.body.rep_cedula !== undefined ? String(req.body.rep_cedula || '').trim() : undefined;
    const repTelefonoInput = req.body.rep_telefono !== undefined ? String(req.body.rep_telefono || '').trim() : undefined;
    const repDomicilioInput = req.body.rep_domicilio !== undefined ? String(req.body.rep_domicilio || '').trim() : undefined;

    const hayCambiosRepresentante =
      repNombresInput !== undefined ||
      repApellidosInput !== undefined ||
      repCedulaInput !== undefined ||
      repTelefonoInput !== undefined ||
      repDomicilioInput !== undefined;

    delete updateData.rep_nombres;
    delete updateData.rep_apellidos;
    delete updateData.rep_cedula;
    delete updateData.rep_telefono;
    delete updateData.rep_domicilio;

    if (hayCambiosRepresentante) {
      const representanteObjetivoId = updateData.representante !== undefined
        ? updateData.representante
        : alumnoActual.representante;

      if (!representanteObjetivoId) {
        return res.status(400).json({ error: 'No se puede actualizar datos de representante porque el alumno no tiene representante asociado.' });
      }

      const representanteActual = await Representante.findById(representanteObjetivoId);
      if (!representanteActual) {
        return res.status(404).json({ error: 'Representante no encontrado para actualizar sus datos.' });
      }

      const cedulaAnteriorRepresentante = String(representanteActual.cedula || '').trim();
      const cedulaNuevaRepresentante = repCedulaInput !== undefined ? repCedulaInput : cedulaAnteriorRepresentante;
      const nombresNuevosRepresentante = repNombresInput !== undefined ? repNombresInput : String(representanteActual.nombres || '').trim();
      const apellidosNuevosRepresentante = repApellidosInput !== undefined ? repApellidosInput : String(representanteActual.apellidos || '').trim();

      if (!cedulaNuevaRepresentante || !nombresNuevosRepresentante || !apellidosNuevosRepresentante) {
        return res.status(400).json({ error: 'Nombre, apellido y cedula del representante son obligatorios.' });
      }

      if (cedulaNuevaRepresentante !== cedulaAnteriorRepresentante) {
        const representanteDuplicado = await Representante.findOne({
          cedula: cedulaNuevaRepresentante,
          _id: { $ne: representanteActual._id }
        }).select('_id');

        if (representanteDuplicado) {
          return res.status(409).json({ error: 'Ya existe otro representante con esa cedula.' });
        }
      }

      representanteActual.nombres = nombresNuevosRepresentante;
      representanteActual.apellidos = apellidosNuevosRepresentante;
      representanteActual.cedula = cedulaNuevaRepresentante;
      if (repTelefonoInput !== undefined) {
        representanteActual.telefono = repTelefonoInput;
      }
      if (repDomicilioInput !== undefined) {
        representanteActual.domicilio = repDomicilioInput;
      }
      await sincronizarUsuarioPortalRepresentante({
        representante: representanteActual,
        cedulaAnterior: cedulaAnteriorRepresentante,
        cedulaNueva: cedulaNuevaRepresentante,
        nombres: nombresNuevosRepresentante,
        apellidos: apellidosNuevosRepresentante
      });
      await representanteActual.save();
    }

    if (req.body.cedula !== undefined) {
      updateData.cedula = String(req.body.cedula || '').trim();
    }
    if (updateData.categoria !== undefined) {
      updateData.categoria = normalizarCategoria(updateData.categoria);
    }
    if (Object.prototype.hasOwnProperty.call(updateData, 'numero_franela')) {
      const nro = normalizarNumeroFranela(updateData.numero_franela);
      updateData.numero_franela = nro === undefined ? null : nro;
    }
    const cambiaNumeroOCategoria = updateData.numero_franela !== undefined || updateData.categoria !== undefined;
    if (cambiaNumeroOCategoria) {
      const categoriaObjetivo = updateData.categoria !== undefined
        ? updateData.categoria
        : alumnoActual.categoria;
      const numeroObjetivo = updateData.numero_franela !== undefined
        ? updateData.numero_franela
        : alumnoActual.numero_franela;

      await validarNumeroFranelaDisponible({
        numeroFranela: numeroObjetivo,
        categoria: categoriaObjetivo,
        excludeAlumnoId: alumnoActual._id
      });
    }
    if (updateData.habilitar_pago_cuotas !== undefined) {
      updateData.habilitar_pago_cuotas = updateData.habilitar_pago_cuotas === true || updateData.habilitar_pago_cuotas === 'true';
    }
    if (updateData.etiquetas) {
      if (typeof updateData.etiquetas === 'string') {
        try {
          updateData.etiquetas = JSON.parse(updateData.etiquetas);
        } catch {
          updateData.etiquetas = [updateData.etiquetas];
        }
      }
      if (!Array.isArray(updateData.etiquetas)) {
        updateData.etiquetas = [];
      }
    }
    // Si hay archivo de foto, guardar solo la URL pública
    if (req.files && req.files['foto'] && req.files['foto'][0]) {
      const fotoFile = req.files['foto'][0];
      updateData.foto = buildUploadUrl(req, fotoFile, 'alumnos');
    }
    // Si hay archivo de foto_cedula, guardar solo la URL pública
    if (req.files && req.files['foto_cedula'] && req.files['foto_cedula'][0]) {
      const cedulaFile = req.files['foto_cedula'][0];
      updateData.foto_cedula = buildUploadUrl(req, cedulaFile, 'alumnos');
    }

    const cedulaObjetivo = updateData.cedula !== undefined
      ? String(updateData.cedula || '').trim()
      : String(alumnoActual.cedula || '').trim();
    const nombresObjetivo = String(updateData.nombres ?? alumnoActual.nombres ?? '').trim();
    const apellidosObjetivo = String(updateData.apellidos ?? alumnoActual.apellidos ?? '').trim();
    const representanteObjetivo = updateData.representante !== undefined
      ? updateData.representante
      : alumnoActual.representante;
    const usuarioObjetivo = updateData.usuario !== undefined
      ? updateData.usuario
      : alumnoActual.usuario;

    const sinRepresentante = !representanteObjetivo;
    const sinUsuario = !usuarioObjetivo;

    // Si el alumno no tiene representante, al completar cédula en edición se crea su usuario de portal.
    if (sinRepresentante && sinUsuario && cedulaObjetivo && nombresObjetivo && apellidosObjetivo) {
      let user = await User.findOne({ email: cedulaObjetivo });
      if (!user) {
        const password = await bcrypt.hash(cedulaObjetivo, 10);
        user = new User({
          nombre: `${nombresObjetivo} ${apellidosObjetivo}`.trim(),
          email: cedulaObjetivo,
          password,
          rol: 'usuario'
        });
        await user.save();
      }
      updateData.usuario = user._id;
    }

    const alumno = await Alumno.findByIdAndUpdate(req.params.id, updateData, { new: true });
    const debeRecalcularMonto =
      updateData.tipo_mensualidad !== undefined ||
      updateData.monto_personalizado_valor !== undefined ||
      updateData.sede !== undefined;
    if (debeRecalcularMonto) {
      const hoy = new Date();
      const mes = hoy.getMonth() + 1;
      const anio = hoy.getFullYear();
      let monto = 0;
      if (alumno.tipo_mensualidad === 'monto_sede' || !alumno.tipo_mensualidad) {
        const sede = await Sede.findById(alumno.sede);
        monto = sede && sede.costo ? sede.costo : 0;
      } else if (alumno.tipo_mensualidad === 'monto_personalizado') {
        monto = alumno.monto_personalizado_valor || 0;
      } else if (alumno.tipo_mensualidad === 'beca_completa') {
        monto = 0;
      }
      await Mensualidad.updateMany(
        {
          id_alumno: alumno._id,
          mes,
          anio,
          estatus: { $nin: ['Pagado', 'Exonerado'] }
        },
        { $set: { monto_esperado: monto } }
      );
    }
    res.json(alumno);
  } catch (err) {
    console.error('Error al actualizar alumno:', {
      alumnoId: req.params.id,
      name: err?.name,
      message: err?.message,
      code: err?.code
    });
    res.status(400).json({
      error: 'Error al actualizar alumno',
      detalle: err?.message || 'Error desconocido al actualizar alumno',
      tipo: err?.name || 'Error'
    });
  }
};

// Eliminar un alumno
exports.deleteAlumno = async (req, res) => {
  try {
    const alumno = await Alumno.findByIdAndDelete(req.params.id);
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

    if (alumno.representante) {
      const otroAlumnoConRepresentante = await Alumno.findOne({ representante: alumno.representante }).select('_id');

      if (!otroAlumnoConRepresentante) {
        const representante = await Representante.findByIdAndDelete(alumno.representante);
        if (representante?.usuario) {
          await eliminarUsuarioSiQuedaHuerfano(representante.usuario);
        }
      }
    }

    if (alumno.usuario) {
      await eliminarUsuarioSiQuedaHuerfano(alumno.usuario);
    }

    res.json({ message: 'Alumno eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar alumno' });
  }
};

// Dar de baja un alumno (baja lógica)
exports.darDeBajaAlumno = async (req, res) => {
  try {
    const { motivo_baja } = req.body || {};
    const alumno = await Alumno.findByIdAndUpdate(
      req.params.id,
      {
        activo: false,
        dado_de_baja: true,
        estado: 'Baja',
        fecha_baja: new Date(),
        ...(motivo_baja ? { motivo_baja } : {})
      },
      { new: true }
    );
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });
    res.json({ message: 'Alumno dado de baja', alumno });
  } catch (err) {
    res.status(400).json({ error: 'Error al dar de baja al alumno' });
  }
};

// Reactivar un alumno (revertir baja)
exports.reactivarAlumno = async (req, res) => {
  try {
    const alumno = await Alumno.findByIdAndUpdate(
      req.params.id,
      {
        activo: true,
        dado_de_baja: false,
        estado: 'Activo',
        fecha_baja: null,
        motivo_baja: null
      },
      { new: true }
    );
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });
    res.json({ message: 'Alumno reactivado', alumno });
  } catch (err) {
    res.status(400).json({ error: 'Error al reactivar al alumno' });
  }
};

// Listar historial de reposos de un alumno
exports.getRepososAlumno = async (req, res) => {
  try {
    const alumno = await Alumno.findById(req.params.id);
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

    const reposos = await Reposo.find({ id_alumno: alumno._id }).sort({ fecha_inicio: -1, createdAt: -1 });
    res.json(reposos);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener reposos del alumno' });
  }
};

// Registrar reposo y aplicar lógica de mensualidad según tipo
exports.registrarReposoAlumno = async (req, res) => {
  try {
    const alumno = await Alumno.findById(req.params.id);
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

    const fecha_inicio_raw = req.body.fecha_inicio || req.body.fechaInicio;
    const tipo_raw = req.body.tipo;

    if (!fecha_inicio_raw || !tipo_raw) {
      return res.status(400).json({ error: 'Los campos obligatorios son fecha_inicio y tipo' });
    }

    const tipo = normalizarTipoReposo(tipo_raw);
    if (!tipo) {
      return res.status(400).json({ error: 'Tipo de reposo inválido. Valores permitidos: Indefinido, Total, Parcial' });
    }

    const fecha_inicio = parseDateInput(fecha_inicio_raw);
    if (!fecha_inicio) {
      return res.status(400).json({ error: 'fecha_inicio inválida' });
    }

    let fecha_fin = null;
    if (req.body.fecha_fin || req.body.fechaFin) {
      fecha_fin = parseDateInput(req.body.fecha_fin || req.body.fechaFin);
      if (!fecha_fin) {
        return res.status(400).json({ error: 'fecha_fin inválida' });
      }
      if (fecha_fin.getTime() < fecha_inicio.getTime()) {
        return res.status(400).json({ error: 'fecha_fin no puede ser anterior a fecha_inicio' });
      }
    }

    let certificado = req.body.certificado || null;
    if (req.file) {
      certificado = buildUploadUrl(req, req.file, 'reposos');
    }

    const reposo = await Reposo.create({
      id_alumno: alumno._id,
      fecha_inicio,
      fecha_fin,
      tipo,
      motivo: req.body.motivo || '',
      certificado,
      estado: 'Activo'
    });

    const { mes: mesInicio, anio: anioInicio } = getPeriodoFromInput(fecha_inicio_raw, fecha_inicio);

    if (tipo === 'Total') {
      await aplicarReposoTotalPorPeriodo(alumno._id, fecha_inicio, fecha_fin);
    }

    if (tipo === 'Indefinido') {
      if (fecha_fin) {
        await aplicarReposoTotalPorPeriodo(alumno._id, fecha_inicio, fecha_fin);
      } else {
        await Mensualidad.updateMany(
          {
            id_alumno: alumno._id,
            estatus: { $ne: 'Pagado' },
            $or: [
              { anio: { $gt: anioInicio } },
              { anio: anioInicio, mes: { $gte: mesInicio } }
            ]
          },
          {
            $set: {
              monto_esperado: 0,
              estatus: 'Exento por reposo'
            }
          }
        );

        await upsertMensualidadExentaPorReposo(alumno._id, mesInicio, anioInicio);
      }
    }

    res.status(201).json({ message: 'Reposo registrado', reposo });
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar reposo', detalle: err.message });
  }
};

// Editar reposo de un alumno
exports.editarReposoAlumno = async (req, res) => {
  try {
    const alumno = await Alumno.findById(req.params.id).select('_id');
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

    const reposo = await Reposo.findOne({ _id: req.params.reposoId, id_alumno: alumno._id });
    if (!reposo) return res.status(404).json({ error: 'Reposo no encontrado' });

    const reposoAnterior = {
      tipo: reposo.tipo,
      fecha_inicio: reposo.fecha_inicio,
      fecha_fin: reposo.fecha_fin
    };

    const fecha_inicio_raw = req.body.fecha_inicio || req.body.fechaInicio;
    const fecha_fin_raw = req.body.fecha_fin || req.body.fechaFin;

    if (fecha_inicio_raw !== undefined) {
      const fechaInicio = parseDateInput(fecha_inicio_raw);
      if (!fechaInicio) return res.status(400).json({ error: 'fecha_inicio inválida' });
      if (reposo.fecha_fin && fechaInicio.getTime() > reposo.fecha_fin.getTime()) {
        return res.status(400).json({ error: 'fecha_inicio no puede ser posterior a fecha_fin' });
      }
      reposo.fecha_inicio = fechaInicio;
    }

    if (fecha_fin_raw !== undefined) {
      const raw = String(fecha_fin_raw || '').trim();
      if (raw === '') {
        reposo.fecha_fin = null;
      } else {
        const fechaFin = parseDateInput(raw);
        if (!fechaFin) return res.status(400).json({ error: 'fecha_fin inválida' });
        if (reposo.fecha_inicio && fechaFin.getTime() < reposo.fecha_inicio.getTime()) {
          return res.status(400).json({ error: 'fecha_fin no puede ser anterior a fecha_inicio' });
        }
        reposo.fecha_fin = fechaFin;
      }
    }

    if (req.body.tipo !== undefined) {
      const tipo = normalizarTipoReposo(req.body.tipo);
      if (!tipo) {
        return res.status(400).json({ error: 'Tipo de reposo inválido. Valores permitidos: Indefinido, Total, Parcial' });
      }
      reposo.tipo = tipo;
    }

    if (req.body.motivo !== undefined) {
      reposo.motivo = req.body.motivo || '';
    }

    if (req.body.estado !== undefined) {
      reposo.estado = req.body.estado || 'Activo';
    }

    if (reposo.estado === 'Finalizado' && !reposo.fecha_fin) {
      return res.status(400).json({ error: 'Debes indicar una fecha_fin para finalizar el reposo.' });
    }

    if (req.file) {
      reposo.certificado = buildUploadUrl(req, req.file, 'reposos');
    }

    await reposo.save();

    const periodosPrevios = await listarPeriodosAfectadosPorReposo(alumno._id, reposoAnterior);
    const periodosNuevos = await listarPeriodosAfectadosPorReposo(alumno._id, reposo);
    await sincronizarMensualidadesAfectadasPorReposos(alumno._id, [...periodosPrevios, ...periodosNuevos]);

    return res.json({ message: 'Reposo actualizado', reposo });
  } catch (err) {
    return res.status(500).json({ error: 'Error al actualizar reposo', detalle: err.message });
  }
};

exports.finalizarReposoIndefinido = async (req, res) => {
  try {
    const alumno = await Alumno.findById(req.params.id).select('_id');
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

    const reposo = await Reposo.findOne({ _id: req.params.reposoId, id_alumno: alumno._id });
    if (!reposo) return res.status(404).json({ error: 'Reposo no encontrado' });
    if (reposo.tipo !== 'Indefinido') {
      return res.status(400).json({ error: 'Solo los reposos indefinidos se pueden finalizar con esta acción.' });
    }

    const fecha_fin_raw = req.body.fecha_fin || req.body.fechaFin;
    if (!fecha_fin_raw) {
      return res.status(400).json({ error: 'La fecha_fin es obligatoria para finalizar el reposo.' });
    }

    const fecha_fin = parseDateInput(fecha_fin_raw);
    if (!fecha_fin) {
      return res.status(400).json({ error: 'fecha_fin inválida' });
    }
    if (fecha_fin.getTime() < reposo.fecha_inicio.getTime()) {
      return res.status(400).json({ error: 'fecha_fin no puede ser anterior a fecha_inicio' });
    }

    const reposoAnterior = {
      tipo: reposo.tipo,
      fecha_inicio: reposo.fecha_inicio,
      fecha_fin: reposo.fecha_fin
    };

    reposo.fecha_fin = fecha_fin;
    reposo.estado = 'Finalizado';
    await reposo.save();

    const periodosPrevios = await listarPeriodosAfectadosPorReposo(alumno._id, reposoAnterior);
    const periodosNuevos = await listarPeriodosAfectadosPorReposo(alumno._id, reposo);
    await sincronizarMensualidadesAfectadasPorReposos(alumno._id, [...periodosPrevios, ...periodosNuevos]);

    return res.json({ message: 'Reposo finalizado', reposo });
  } catch (err) {
    return res.status(500).json({ error: 'Error al finalizar reposo', detalle: err.message });
  }
};

// Eliminar reposo de un alumno
exports.eliminarReposoAlumno = async (req, res) => {
  try {
    const alumno = await Alumno.findById(req.params.id).select('_id');
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

    const reposo = await Reposo.findOneAndDelete({ _id: req.params.reposoId, id_alumno: alumno._id });
    if (!reposo) return res.status(404).json({ error: 'Reposo no encontrado' });

    const periodosAfectados = await listarPeriodosAfectadosPorReposo(alumno._id, reposo);
    await sincronizarMensualidadesAfectadasPorReposos(alumno._id, periodosAfectados);

    return res.json({ message: 'Reposo eliminado' });
  } catch (err) {
    return res.status(500).json({ error: 'Error al eliminar reposo', detalle: err.message });
  }
};
