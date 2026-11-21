const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const { aplicarSession, ejecutarConTransaccion } = require('../services/financeTransaction');
const { createHash } = require('crypto');
const { resumenCierre, actualizarCierreAutomatico } = require('../services/campaniaClosure');
const { alumnosCargo, cantidadCargos, fotoAtleta, agruparCargosPorRepresentante, totalesCargos } = require('../services/campaniaBilling');
const { prepararConversion } = require('../services/campaniaConversion');
const { prepararCoberturaFamiliar } = require('../services/campaniaFamilyCoverage');

const CAMPOS = 'nombre descripcion unidad_cobro modalidad_monto monto_general montos_por_sede moneda sedes participantes vencimiento permitir_abonos estado publicacion totales_cargos excepciones_cobro createdAt updatedAt __v';
const OBJECT_ID = /^[a-f\d]{24}$/i;
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const errorPeticion = (status, message) => Object.assign(new Error(message), { status });

async function modelos(req) {
  const connection = await getTenantBusinessConnection(req.tenant || { tenantId: req.tenantId });
  return {
    connection,
    Sede: getTenantModel(connection, 'Sede'),
    Campania: getTenantModel(connection, 'CampaniaCobro'),
    Config: getTenantModel(connection, 'TenantConfig')
  };
}

async function monedaAcademia(Config, session = null) {
  const config = await aplicarSession(Config.findOne({ key: 'default' }).select('cobro.moneda'), session).lean();
  const moneda = config?.cobro?.moneda || 'USD';
  if (!['USD', 'EUR'].includes(moneda)) throw errorPeticion(409, 'Revisa la moneda configurada para la academia.');
  return moneda;
}

function validarDatos(body, editar) {
  const permitidos = ['nombre', 'descripcion', 'unidad_cobro', 'modalidad_monto', 'monto_general', 'montos_por_sede', 'moneda', 'sedes', 'vencimiento', 'permitir_abonos', editar ? 'version' : 'solicitud_id'];
  if (!body || Object.keys(body).some((key) => !permitidos.includes(key))) {
    throw errorPeticion(400, 'Solo puedes modificar los datos del borrador; no su estado ni sus pagos.');
  }
  if (typeof body.nombre !== 'string' || !body.nombre.trim() || body.nombre.trim().length > 150) {
    throw errorPeticion(400, 'Indica un nombre de hasta 150 caracteres.');
  }
  if (typeof body.descripcion !== 'string' || body.descripcion.trim().length > 2000) {
    throw errorPeticion(400, 'La descripcion debe tener hasta 2000 caracteres.');
  }
  if (!Array.isArray(body.sedes) || !body.sedes.length || body.sedes.length > 1000
    || body.sedes.some((id) => typeof id !== 'string' || !OBJECT_ID.test(id))
    || new Set(body.sedes.map((id) => id.toLowerCase())).size !== body.sedes.length) {
    throw errorPeticion(400, 'Selecciona al menos una sede valida, sin duplicados.');
  }
  const modalidad = body.modalidad_monto === undefined ? 'unico' : body.modalidad_monto;
  const unidad = body.unidad_cobro === undefined ? 'atleta' : body.unidad_cobro;
  if (!['atleta', 'representante'].includes(unidad)) throw errorPeticion(400, 'Selecciona cobro por atleta o por representante.');
  if (!['unico', 'por_sede'].includes(modalidad)) throw errorPeticion(400, 'Selecciona monto unico o monto por sede.');
  const montoValido = (valor) => ['number', 'string'].includes(typeof valor)
    && /^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(String(valor)) && Number(valor) > 0;
  const montos = body.montos_por_sede === undefined ? [] : body.montos_por_sede;
  if (!Array.isArray(montos)) throw errorPeticion(400, 'Los montos por sede no son validos.');
  if (modalidad === 'unico') {
    if (!montoValido(body.monto_general)) throw errorPeticion(400, 'El monto debe ser mayor que cero y tener como maximo dos decimales.');
    if (montos.length) throw errorPeticion(400, 'El monto unico no admite importes adicionales por sede.');
  } else {
    if (body.monto_general != null) throw errorPeticion(400, 'En la modalidad por sede no hay un monto unico.');
    const sedes = new Set(body.sedes.map((id) => id.toLowerCase()));
    if (montos.length !== sedes.size || montos.some((item) => !item || typeof item !== 'object'
      || Object.keys(item).some((key) => !['sede', 'monto'].includes(key))
      || typeof item.sede !== 'string' || !sedes.has(item.sede.toLowerCase()) || !montoValido(item.monto))
      || new Set(montos.map((item) => item.sede.toLowerCase())).size !== sedes.size) {
      throw errorPeticion(400, 'Indica un monto positivo de hasta dos decimales para cada sede seleccionada, sin duplicados ni sedes adicionales.');
    }
  }
  if (typeof body.permitir_abonos !== 'boolean') throw errorPeticion(400, 'Indica si se permiten abonos individuales.');
  if (typeof body.vencimiento !== 'string') throw errorPeticion(400, 'Indica una fecha valida o deja el vencimiento vacio.');
  if (body.vencimiento) {
    const fecha = new Date(`${body.vencimiento}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.vencimiento) || Number(body.vencimiento.slice(0, 4)) < 1900
      || Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== body.vencimiento) {
      throw errorPeticion(400, 'El vencimiento debe ser una fecha de calendario valida.');
    }
  }
  if (editar ? !Number.isInteger(body.version) || body.version < 0 : typeof body.solicitud_id !== 'string' || !UUID.test(body.solicitud_id)) {
    throw errorPeticion(400, editar ? 'Falta la version del borrador. Vuelve a abrirlo.' : 'La solicitud de creacion no es valida.');
  }
  if (!['USD', 'EUR'].includes(body.moneda)) throw errorPeticion(400, 'La moneda no es valida.');
  return { nombre: body.nombre.trim(), descripcion: body.descripcion.trim(), unidad_cobro: unidad, modalidad_monto: modalidad,
    monto_general: modalidad === 'unico' ? Number(body.monto_general) : null,
    montos_por_sede: montos.map((item) => ({ sede: item.sede.toLowerCase(), monto: Number(item.monto) })),
    moneda: body.moneda, sedes: body.sedes.map((id) => id.toLowerCase()), vencimiento: body.vencimiento,
    permitir_abonos: body.permitir_abonos };
}

function responderError(res, error) {
  return res.status(error.status || 500).json({ error: error.status ? error.message : 'No se pudo guardar el borrador. Intenta nuevamente.' });
}

async function comprobarOpciones(data, models) {
  if (data.moneda !== await monedaAcademia(models.Config)) {
    throw errorPeticion(409, 'La moneda de la academia cambio. Cierra y vuelve a abrir el formulario antes de guardar.');
  }
  const cantidad = await models.Sede.countDocuments({ _id: { $in: data.sedes } });
  if (cantidad !== data.sedes.length) throw errorPeticion(400, 'Una sede ya no esta disponible en esta academia. Revisa la seleccion.');
}

async function incorporarAtletasDeSedes(models, sedes, anteriores = []) {
  const Alumno = getTenantModel(models.connection, 'Alumno');
  const atletas = await Alumno.find({ sede: { $in: sedes }, activo: { $ne: false }, dado_de_baja: { $ne: true } })
    .select('_id').lean();
  const participantes = [...new Set([...anteriores.map(String), ...atletas.map((atleta) => String(atleta._id))])];
  if (participantes.length > 10000) throw errorPeticion(400, 'La campana supera el limite de 10000 participantes.');
  return participantes;
}

async function devolverCampania(res, Campania, id, status, incluirCondiciones = false) {
  const campania = await Campania.findOne({ _id: id }).select(incluirCondiciones ? `${CAMPOS} +condiciones_participantes` : CAMPOS).populate('sedes', 'nombre').lean();
  if (incluirCondiciones && campania) campania.condiciones_participantes = campania.condiciones_participantes || [];
  return res.status(status).json({ campania });
}

exports.listar = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const connection = await getTenantBusinessConnection(req.tenant || { tenantId: req.tenantId });
    getTenantModel(connection, 'Sede');
    const Campania = getTenantModel(connection, 'CampaniaCobro');
    const campanias = await Campania.find({})
      .select(CAMPOS)
      .populate('sedes', 'nombre')
      .sort({ createdAt: -1, _id: -1 })
      .lean();
    return res.json({ campanias });
  } catch {
    return res.status(500).json({ error: 'No se pudieron cargar las campanas. Intenta nuevamente.' });
  }
};

exports.opciones = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const models = await modelos(req);
    const [moneda, sedes] = await Promise.all([
      monedaAcademia(models.Config), models.Sede.find({}).select('nombre').sort({ nombre: 1 }).lean()
    ]);
    return res.json({ moneda, sedes });
  } catch {
    return res.status(500).json({ error: 'No se pudieron cargar las sedes y la moneda de la academia.' });
  }
};

exports.crear = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const data = validarDatos(req.body, false);
    const models = await modelos(req);
    await comprobarOpciones(data, models);
    let guardada;
    let status = 201;
    try {
      const participantes = await incorporarAtletasDeSedes(models, data.sedes);
      guardada = await models.Campania.create({ ...data, participantes, estado: 'borrador', solicitud_id: req.body.solicitud_id,
        actualizado_por: { id: req.user.id, rol: req.user.rol } });
    } catch (error) {
      if (error.code !== 11000) throw error;
      guardada = await models.Campania.findOne({ solicitud_id: req.body.solicitud_id }).lean();
      const coincide = guardada && Object.entries(data).every(([key, value]) => {
        if (key === 'sedes') return JSON.stringify(guardada.sedes.map(String).sort()) === JSON.stringify([...value].sort());
        if (key === 'montos_por_sede') {
          const ordenar = (items) => items.map((item) => `${item.sede}:${item.monto}`).sort();
          return JSON.stringify(ordenar(guardada.montos_por_sede || [])) === JSON.stringify(ordenar(value));
        }
        if (key === 'modalidad_monto') return (guardada.modalidad_monto || 'unico') === value;
        if (key === 'unidad_cobro') return (guardada.unidad_cobro || 'atleta') === value;
        return guardada[key] === value;
      });
      if (!coincide || guardada.estado !== 'borrador') {
        throw errorPeticion(409, 'Esta solicitud ya fue guardada con otros datos. Revisa el listado antes de crear otra campana.');
      }
      status = 200;
    }
    return await devolverCampania(res, models.Campania, guardada._id, status);
  } catch (error) {
    return responderError(res, error);
  }
};

exports.editar = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    if (!OBJECT_ID.test(req.params.id)) throw errorPeticion(400, 'El identificador del borrador no es valido.');
    const data = validarDatos(req.body, true);
    const models = await modelos(req);
    const actual = await models.Campania.findOne({ _id: req.params.id }).lean();
    if (!actual) throw errorPeticion(404, 'El borrador no existe en esta academia.');
    if (actual.estado !== 'borrador') throw errorPeticion(409, 'Solo se pueden editar borradores en esta etapa.');
    if (req.body.unidad_cobro === undefined) data.unidad_cobro = actual.unidad_cobro || 'atleta';
    if (actual.moneda !== data.moneda) throw errorPeticion(409, 'No se puede cambiar la moneda del borrador.');
    await comprobarOpciones(data, models);
    const anteriores = new Set((actual.sedes || []).map(String));
    const sedesNuevas = data.sedes.filter((sede) => !anteriores.has(sede));
    if (sedesNuevas.length) data.participantes = await incorporarAtletasDeSedes(models, sedesNuevas, actual.participantes || []);
    const guardada = await models.Campania.findOneAndUpdate({ _id: req.params.id, estado: 'borrador', __v: req.body.version }, {
      $set: { ...data, actualizado_por: { id: req.user.id, rol: req.user.rol } }, $inc: { __v: 1 }
    }, { new: true, runValidators: true });
    if (!guardada) throw errorPeticion(409, 'Otro administrador modifico este borrador. Cierra y vuelve a abrirlo para revisar los datos recientes.');
    return await devolverCampania(res, models.Campania, guardada._id, 200);
  } catch (error) {
    return responderError(res, error);
  }
};

exports.eliminar = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    if (!OBJECT_ID.test(req.params.id)) throw errorPeticion(400, 'El identificador del borrador no es valido.');
    const body = req.body;
    if (!body || Object.keys(body).some((key) => key !== 'version') || !Number.isInteger(body.version) || body.version < 0) {
      throw errorPeticion(400, 'Falta la version del borrador. Vuelve a cargar el listado.');
    }
    const connection = await getTenantBusinessConnection(req.tenant || { tenantId: req.tenantId });
    const Campania = getTenantModel(connection, 'CampaniaCobro');
    const eliminada = await Campania.findOneAndDelete({ _id: req.params.id, estado: 'borrador', __v: body.version });
    if (!eliminada) {
      const actual = await Campania.findOne({ _id: req.params.id }).select('_id').lean();
      if (!actual) throw errorPeticion(404, 'La campana ya no existe en esta academia.');
      throw errorPeticion(409, 'La campana cambio o ya no es un borrador. Vuelve a cargar el listado antes de eliminarla.');
    }
    return res.json({ eliminada: String(eliminada._id) });
  } catch (error) {
    if (error.status) return responderError(res, error);
    return res.status(500).json({ error: 'No se pudo eliminar la campana. Intenta nuevamente.' });
  }
};

async function borradorParticipantes(req) {
  if (!OBJECT_ID.test(req.params.id)) throw errorPeticion(400, 'El identificador del borrador no es valido.');
  const models = await modelos(req);
  const campania = await models.Campania.findOne({ _id: req.params.id }).select(`${CAMPOS} +condiciones_participantes`).populate('sedes', 'nombre').lean();
  if (!campania) throw errorPeticion(404, 'El borrador no existe en esta academia.');
  if (campania.estado !== 'borrador') throw errorPeticion(409, 'Solo puedes seleccionar participantes de un borrador.');
  const Alumno = getTenantModel(models.connection, 'Alumno');
  return { ...models, Alumno, campania };
}

exports.participantes = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const { campania, Alumno, connection } = await borradorParticipantes(req);
    getTenantModel(connection, 'Representante');
    const seleccionados = (campania.participantes || []).map(String);
    const sedes = campania.sedes.filter(Boolean).map((sede) => String(sede._id));
    const atletas = await Alumno.find({ $or: [
      { sede: { $in: sedes }, activo: { $ne: false }, dado_de_baja: { $ne: true } },
      { _id: { $in: seleccionados } }
    ] }).select('nombres apellidos foto categoria sede representante tipo_mensualidad fecha_inscripcion activo dado_de_baja')
      .populate('sede', 'nombre').populate('representante', 'nombres apellidos')
      .sort({ apellidos: 1, nombres: 1, _id: 1 }).lean();
    const resultado = atletas.map((alumno) => ({
      _id: String(alumno._id), nombres: alumno.nombres, apellidos: alumno.apellidos,
      foto: alumno.foto || '', categoria: alumno.categoria || '', sede: alumno.sede,
      tipo_mensualidad: alumno.tipo_mensualidad || 'monto_sede',
      representante: alumno.representante, fecha_inscripcion: alumno.fecha_inscripcion || null,
      disponible: alumno.activo !== false && alumno.dado_de_baja !== true && sedes.includes(String(alumno.sede?._id))
    }));
    const encontrados = new Set(resultado.map((alumno) => alumno._id));
    for (const id of seleccionados) {
      if (!encontrados.has(id)) resultado.push({ _id: id, nombres: 'Atleta no disponible', apellidos: '',
        foto: '', categoria: '', sede: null, representante: null, tipo_mensualidad: null, fecha_inscripcion: null, disponible: false });
    }
    return res.json({ campania: { ...campania, participantes: seleccionados,
      condiciones_participantes: campania.condiciones_participantes || [] }, atletas: resultado });
  } catch (error) {
    if (error.status) return responderError(res, error);
    return res.status(500).json({ error: 'No se pudieron cargar los participantes. Intenta nuevamente.' });
  }
};

async function calcularResumen(campania, Alumno, session = null) {
    const porRepresentante = campania.unidad_cobro === 'representante';
    if (porRepresentante) getTenantModel(Alumno.db, 'Representante');
    const seleccionados = (campania.participantes || []).map(String);
    const condiciones = validarCondiciones((campania.condiciones_participantes || [])
      .map((condicion) => ({ ...condicion, alumno: String(condicion.alumno) })), seleccionados);
    const acuerdos = new Map(condiciones.map((condicion) => [condicion.alumno, condicion]));
    let consultaAtletas = Alumno.find({ _id: { $in: seleccionados } })
      .select('nombres apellidos categoria sede activo dado_de_baja representante').populate('sede', 'nombre');
    if (porRepresentante) consultaAtletas = consultaAtletas.populate('representante', 'nombres apellidos');
    const atletas = await aplicarSession(consultaAtletas, session).lean();
    const encontrados = new Map(atletas.map((atleta) => [String(atleta._id), atleta]));
    const sedes = new Set(campania.sedes.filter(Boolean).map((sede) => String(sede._id)));
    const individuales = seleccionados.map((id) => {
      const atleta = encontrados.get(id);
      const condicion = acuerdos.get(id);
      const modalidad = condicion?.modalidad || 'general';
      const incidencias = [];
      if (!atleta) incidencias.push('El atleta ya no esta disponible. Revisa su seleccion.');
      else {
        if (atleta.activo === false || atleta.dado_de_baja === true) incidencias.push('El atleta esta inactivo o dado de baja.');
        if (!sedes.has(String(atleta.sede?._id))) incidencias.push('La sede actual del atleta no esta incluida en la campana.');
      }
      let monto = modalidad === 'no_aplica' ? 0 : modalidad === 'personalizado' ? condicion.monto
        : campania.modalidad_monto === 'por_sede'
          ? campania.montos_por_sede?.find((precio) => String(precio.sede) === String(atleta?.sede?._id))?.monto
          : campania.monto_general;
      if (modalidad !== 'no_aplica' && (typeof monto !== 'number' || !Number.isFinite(monto)
        || !/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(String(monto)) || monto <= 0)) {
        monto = null;
        incidencias.push('No hay un importe valido para este participante. Revisa su sede o condicion individual.');
      }
      return { alumno: id, nombres: atleta?.nombres || 'Atleta no disponible', apellidos: atleta?.apellidos || '',
        categoria: atleta?.categoria || '', sede: atleta?.sede || null, modalidad, monto,
        ...(porRepresentante ? { representante: atleta?.representante || null } : {}),
        nota_interna: condicion?.nota_interna || '', incidencias };
    });
    const filas = porRepresentante ? agruparCargosPorRepresentante(individuales) : individuales;
    const totales = { ...totalesCargos(filas, porRepresentante),
      pendientes: filas.filter((fila) => fila.monto === null).length,
      con_observaciones: filas.filter((fila) => fila.incidencias.length).length,
      subtotal_calculado: filas.reduce((total, fila) => total + Math.round((fila.monto || 0) * 100), 0) / 100 };
    const { condiciones_participantes, ...datosCampania } = campania;
    const revision = createHash('sha256').update(JSON.stringify({ version: campania.__v, totales, filas })).digest('hex');
    return { campania: { ...datosCampania, participantes: seleccionados }, totales, filas, revision };
}

exports.resumen = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const { campania, Alumno } = await borradorParticipantes(req);
    return res.json(await calcularResumen(campania, Alumno));
  } catch (error) {
    if (error.status) return responderError(res, error);
    return res.status(500).json({ error: 'No se pudo calcular el resumen de la campana. Intenta nuevamente.' });
  }
};

exports.publicar = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const body = req.body;
    if (!OBJECT_ID.test(req.params.id) || !body || Object.keys(body).some((key) => !['version', 'revision', 'solicitud_id'].includes(key))
      || !Number.isInteger(body.version) || body.version < 0 || typeof body.revision !== 'string' || !/^[a-f\d]{64}$/.test(body.revision)
      || typeof body.solicitud_id !== 'string' || !UUID.test(body.solicitud_id)) {
      throw errorPeticion(400, 'Revisa el resumen y confirma una solicitud de publicacion valida.');
    }
    if (!req.user.id) throw errorPeticion(401, 'Tu sesion no identifica al administrador. Inicia sesion nuevamente.');
    const models = await modelos(req);
    const Cargo = getTenantModel(models.connection, 'CargoCampania');
    const Alumno = getTenantModel(models.connection, 'Alumno');
    await Cargo.init();
    const resultado = await ejecutarConTransaccion(models.Campania, async (session) => {
      const actual = await aplicarSession(models.Campania.findOne({ _id: req.params.id }).select(`${CAMPOS} +condiciones_participantes`)
        .populate('sedes', 'nombre'), session).lean();
      if (!actual) throw errorPeticion(404, 'La campana no existe en esta academia.');
      if (actual.estado !== 'borrador') {
        const anterior = actual.publicacion;
        if (anterior?.solicitud_id !== body.solicitud_id || anterior.version_borrador !== body.version || anterior.revision !== body.revision) {
          throw errorPeticion(409, 'La campana ya no es un borrador. Revisa su estado antes de publicar.');
        }
        const { condiciones_participantes, ...campania } = actual;
        return { campania, publicacion: anterior, repetida: true };
      }
      if (actual.__v !== body.version) throw errorPeticion(409, 'Otro administrador cambio el borrador. Recalcula el resumen antes de publicar.');
      if (actual.moneda !== await monedaAcademia(models.Config, session)) {
        throw errorPeticion(409, 'La moneda de la academia cambio. Revisa la campana antes de publicar.');
      }
      const resumen = await calcularResumen(actual, Alumno, session);
      if (!resumen.filas.length || resumen.totales.pendientes || resumen.totales.con_observaciones || actual.sedes.some((sede) => !sede)) {
        throw errorPeticion(409, 'Selecciona participantes y resuelve todas las observaciones del resumen antes de publicar.');
      }
      if (resumen.revision !== body.revision) throw errorPeticion(409, 'Los datos de los participantes cambiaron. Recalcula y revisa el resumen antes de publicar.');
      const { participantes, generales, personalizados, no_aplica, total_esperado } = resumen.totales;
      const actor = { id: req.user.id, rol: req.user.rol };
      const publicacion = { solicitud_id: body.solicitud_id, version_borrador: body.version, revision: body.revision,
        fecha: new Date(), actor, participantes, generales, personalizados, no_aplica, total_esperado,
        ...(actual.unidad_cobro === 'representante' ? { cobros: resumen.totales.cobros,
          representantes: resumen.totales.representantes, individuales: resumen.totales.individuales } : {}) };
      const guardada = await models.Campania.findOneAndUpdate({ _id: req.params.id, estado: 'borrador', __v: body.version }, {
        $set: { estado: 'abierta', publicacion, actualizado_por: actor }, $inc: { __v: 1 }
      }, { new: true, runValidators: true, session });
      if (!guardada) throw errorPeticion(409, 'La campana cambio. Recalcula el resumen antes de publicar.');
      await Cargo.insertMany(resumen.filas.map((fila) => ({ campania: actual._id, alumno: fila.alumno,
        ...(fila.tipo_cobro ? { tipo_cobro: fila.tipo_cobro, representante_cobro: fila.representante_cobro,
          nombre_representante: fila.nombre_representante, atletas_cubiertos: fila.atletas_cubiertos } : {}),
        sede: fila.sede._id, nombre_sede: fila.sede.nombre, nombres: fila.nombres, apellidos: fila.apellidos,
        categoria: fila.categoria, modalidad: fila.modalidad, moneda: actual.moneda, monto: fila.monto,
        saldo_pendiente: fila.monto, estado: fila.modalidad === 'no_aplica' ? 'no_aplica' : 'pendiente', nota_interna: fila.nota_interna,
        vencimiento: actual.vencimiento, permitir_abonos: actual.permitir_abonos })), { session, ordered: true });
      const campania = await aplicarSession(models.Campania.findOne({ _id: actual._id }).select(CAMPOS)
        .populate('sedes', 'nombre'), session).lean();
      return { campania, publicacion, repetida: false };
    }, { obligatoria: true });
    return res.status(resultado.repetida ? 200 : 201).json(resultado);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ error: error.message });
    if (error.code === 11000) return res.status(409).json({ error: 'Ya existen cargos para esta campana. Revisa su estado antes de reintentar.' });
    return res.status(500).json({ error: 'No se pudo publicar la campana. Reintenta la misma solicitud; no crees otra campana.' });
  }
};

exports.cerrar = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const body = req.body;
    if (!OBJECT_ID.test(req.params.id) || !body || Object.keys(body).some((key) => !['version', 'solicitud_id', 'motivo', 'aceptar_saldo_pendiente'].includes(key))
      || !Number.isInteger(body.version) || body.version < 0 || typeof body.solicitud_id !== 'string' || !UUID.test(body.solicitud_id)
      || typeof body.motivo !== 'string' || body.motivo.trim().length < 3 || body.motivo.trim().length > 1000
      || typeof body.aceptar_saldo_pendiente !== 'boolean') throw errorPeticion(400, 'Indica version, solicitud, motivo y confirmacion del cierre.');
    if (!req.user.id) throw errorPeticion(401, 'Inicia sesion nuevamente.');
    const models = await modelos(req);
    const financieros = { CampaniaCobro: models.Campania, CargoCampania: getTenantModel(models.connection, 'CargoCampania'),
      PagoCampania: getTenantModel(models.connection, 'PagoCampania') };
    const huella = createHash('sha256').update(JSON.stringify({ version: body.version, solicitud_id: body.solicitud_id,
      motivo: body.motivo.trim(), aceptar_saldo_pendiente: body.aceptar_saldo_pendiente, actor: String(req.user.id), rol: req.user.rol })).digest('hex');
    const resultado = await ejecutarConTransaccion(models.Campania, async (session) => {
      const actual = await aplicarSession(models.Campania.findById(req.params.id).select('+cierre'), session).lean();
      if (!actual) throw errorPeticion(404, 'La campana no existe en esta academia.');
      if (actual.estado === 'cerrada' && actual.cierre?.solicitud_id === body.solicitud_id && actual.cierre.huella === huella) return { repetida: true };
      if (!actual.publicacion || actual.estado !== 'abierta' || actual.__v !== body.version) throw errorPeticion(409, 'La campana cambio o ya esta cerrada. Actualiza el listado.');
      const resumen = await resumenCierre(financieros, actual, session);
      if (resumen.en_revision) throw errorPeticion(409, 'Resuelve los pagos en revision antes de cerrar la campana.');
      if (resumen.saldo_pendiente > 0 && !body.aceptar_saldo_pendiente) throw errorPeticion(409, 'Confirma expresamente el cierre con saldos pendientes. Los saldos no se anulan.');
      const cierre = { tipo: 'manual', fecha: new Date(), actor: { id: String(req.user.id), rol: req.user.rol },
        motivo: body.motivo.trim(), solicitud_id: body.solicitud_id, huella, saldo_pendiente: resumen.saldo_pendiente };
      const guardada = await models.Campania.findOneAndUpdate({ _id: actual._id, estado: 'abierta', __v: body.version }, {
        $set: { estado: 'cerrada', cierre, actualizado_por: cierre.actor }, $inc: { __v: 1 }, $push: { historial_cierres: cierre }
      }, { new: true, runValidators: true, session }).lean();
      if (!guardada) throw errorPeticion(409, 'La campana cambio durante el cierre. Actualiza los datos.');
      return { repetida: false };
    }, { obligatoria: true });
    const campania = await models.Campania.findById(req.params.id).select(CAMPOS).populate('sedes', 'nombre').lean();
    return res.json({ ...resultado, campania });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'No se pudo cerrar la campana. Reintenta la misma solicitud.' });
  }
};

exports.cargos = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    if (!OBJECT_ID.test(req.params.id)) throw errorPeticion(400, 'La campana no es valida.');
    const models = await modelos(req);
    const campania = await models.Campania.findOne({ _id: req.params.id }).select(CAMPOS).populate('sedes', 'nombre').lean();
    if (!campania) throw errorPeticion(404, 'La campana no existe en esta academia.');
    if (!campania.publicacion || campania.estado === 'borrador') throw errorPeticion(409, 'Esta campana aun no tiene cargos publicados.');
    const Cargo = getTenantModel(models.connection, 'CargoCampania');
    const cargos = await Cargo.find({ campania: req.params.id })
      .select('alumno tipo_cobro cobertura_familiar representante_cobro nombre_representante atletas_cubiertos sede nombre_sede nombres apellidos categoria modalidad moneda monto saldo_pendiente estado permitir_abonos retirado __v +nota_interna')
      .sort({ nombres: 1, apellidos: 1, alumno: 1 }).lean();
    const pagosEnRevision = await models.connection.db.collection('pagocampanias')
      .find({ campania: campania._id, estado: 'en_revision' }, { projection: { cargo: 1 } }).toArray();
    const cargosEnRevision = new Set(pagosEnRevision.map((pago) => String(pago.cargo)));
    const excepciones = new Map((campania.excepciones_cobro || []).map((item) => [String(item.cargo), item.motivo]));
    const gruposConservados = new Map();
    for (const item of campania.excepciones_cobro || []) {
      if (item.representante) {
        const clave = String(item.representante);
        gruposConservados.set(clave, (gruposConservados.get(clave) || 0) + 1);
      }
    }
    const filas = cargos.map((cargo) => ({ _id: String(cargo._id), version: cargo.__v, permitir_abonos: cargo.permitir_abonos,
      pago_en_revision: cargosEnRevision.has(String(cargo._id)),
      puede_revisar_cobertura: campania.estado === 'abierta' && campania.unidad_cobro === 'representante'
        && ['pagado', 'abono'].includes(cargo.estado) && cargo.monto > 0 && !cargosEnRevision.has(String(cargo._id))
        && (campania.excepciones_cobro || []).some((item) => String(item.cargo) === String(cargo._id)
          && (gruposConservados.get(String(item.representante)) || 0) > 1),
      retirado: cargo.retirado === true, puede_ajustar: campania.estado === 'abierta' && !cargo.cobertura_familiar
        && ['pendiente', 'no_aplica'].includes(cargo.estado) && cargo.saldo_pendiente === cargo.monto && !cargosEnRevision.has(String(cargo._id)),
      alumno: String(cargo.alumno), nombres: cargo.nombres, apellidos: cargo.apellidos,
      tipo_cobro: cargo.tipo_cobro || 'atleta', representante_cobro: cargo.representante_cobro,
      cobertura_familiar: cargo.cobertura_familiar,
      ...(excepciones.has(String(cargo._id)) ? { preservado_conversion: true,
        motivo_conservacion: excepciones.get(String(cargo._id)) } : {}),
      nombre_representante: cargo.nombre_representante, atletas_cubiertos: cargo.atletas_cubiertos,
      categoria: cargo.categoria, sede: { _id: String(cargo.sede), nombre: cargo.nombre_sede }, modalidad: cargo.modalidad,
      monto: cargo.monto, saldo_pendiente: cargo.saldo_pendiente, estado: cargo.estado, nota_interna: cargo.nota_interna || '', incidencias: [] }));
    const subtotal = filas.reduce((total, fila) => total + Math.round(fila.monto * 100), 0) / 100;
    const vigentes = campania.totales_cargos || campania.publicacion;
    const participantes = new Set(campania.participantes.map(String));
    const cubiertos = filas.flatMap(alumnosCargo);
    if (filas.length !== cantidadCargos(vigentes) || cubiertos.length !== participantes.size || new Set(cubiertos).size !== participantes.size
      || cubiertos.some((id) => !participantes.has(id))
      || subtotal !== vigentes.total_esperado || cargos.some((cargo) => cargo.moneda !== campania.moneda)) {
      throw new Error('Cargos inconsistentes');
    }
    return res.json({ campania, filas, totales: { ...totalesCargos(cargos, campania.unidad_cobro === 'representante'),
      pendientes: 0, con_observaciones: 0, subtotal_calculado: subtotal, total_esperado: subtotal } });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'No se pudieron verificar los cargos publicados.' });
  }
};

async function modelosConversion(req) {
  if (!OBJECT_ID.test(req.params.id)) throw errorPeticion(400, 'La campana no es valida.');
  const models = await modelos(req);
  return { ...models, Cargo: getTenantModel(models.connection, 'CargoCampania'),
    Pago: getTenantModel(models.connection, 'PagoCampania'), Alumno: getTenantModel(models.connection, 'Alumno'),
    Representante: getTenantModel(models.connection, 'Representante') };
}

exports.resumenConversion = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const models = await modelosConversion(req);
    const campania = await models.Campania.findById(req.params.id).select(CAMPOS).populate('sedes', 'nombre').lean();
    if (!campania) throw errorPeticion(404, 'La campana no existe en esta academia.');
    const { anteriores, ...resumen } = await prepararConversion(models, campania);
    return res.json({ campania, ...resumen });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'No se pudo calcular la conversion. Intenta nuevamente.' });
  }
};

exports.convertirRepresentante = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const body = req.body;
    if (!body || Object.keys(body).some((key) => !['version', 'revision', 'solicitud_id'].includes(key))
      || !Number.isInteger(body.version) || body.version < 0 || typeof body.revision !== 'string' || !/^[a-f\d]{64}$/.test(body.revision)
      || typeof body.solicitud_id !== 'string' || !UUID.test(body.solicitud_id)) {
      throw errorPeticion(400, 'Revisa la vista previa y confirma una solicitud de conversion valida.');
    }
    if (!req.user.id) throw errorPeticion(401, 'Inicia sesion nuevamente para identificar al administrador.');
    const models = await modelosConversion(req);
    await models.Cargo.init();
    const actor = { id: String(req.user.id), rol: req.user.rol };
    const solicitudId = body.solicitud_id.toLowerCase();
    const resultado = await ejecutarConTransaccion(models.Campania, async (session) => {
      const actual = await aplicarSession(models.Campania.findById(req.params.id).select(`${CAMPOS} +conversion_representante`), session).lean();
      if (!actual) throw errorPeticion(404, 'La campana no existe en esta academia.');
      const anterior = actual.conversion_representante;
      if (anterior) {
        if (anterior.solicitud_id !== solicitudId || anterior.version !== body.version || anterior.revision !== body.revision
          || anterior.actor.id !== actor.id || anterior.actor.rol !== actor.rol) {
          throw errorPeticion(409, 'La campana ya fue convertida. Actualiza sus cargos.');
        }
        return { repetida: true };
      }
      if (actual.__v !== body.version) throw errorPeticion(409, 'La campana cambio. Actualiza la vista previa antes de convertir.');
      const resumen = await prepararConversion(models, actual, session);
      if (resumen.revision !== body.revision) throw errorPeticion(409, 'Los cargos o representantes cambiaron. Actualiza y revisa la vista previa.');
      if (resumen.totales.pendientes || resumen.totales.con_observaciones) {
        throw errorPeticion(409, 'Unifica los importes y condiciones de cada representante y resuelve las observaciones antes de convertir.');
      }
      const totales = totalesCargos(resumen.filas, true);
      const conversion = { solicitud_id: solicitudId, version: body.version, revision: body.revision,
        fecha: new Date(), actor, antes: resumen.antes, despues: totales,
        cargos_anteriores: resumen.anteriores };
      const excepciones = resumen.filas.filter((fila) => fila.preservado_conversion).map((fila) => ({
        cargo: fila._id, representante: fila.representante_excepcion, motivo: fila.motivo_conservacion
      }));
      const guardada = await models.Campania.findOneAndUpdate({ _id: actual._id, estado: 'abierta', __v: body.version }, {
        $set: { unidad_cobro: 'representante', totales_cargos: totales, conversion_representante: conversion,
          excepciones_cobro: excepciones, actualizado_por: actor },
        $inc: { __v: 1 }
      }, { new: true, runValidators: true, session }).lean();
      if (!guardada) throw errorPeticion(409, 'La campana cambio durante la conversion. Actualiza la vista previa.');
      const originales = new Map(resumen.anteriores.map((cargo) => [String(cargo._id), cargo]));
      for (const fila of resumen.filas) {
        if (fila.preservado_conversion) continue;
        const original = originales.get(fila._id);
        const cargo = await models.Cargo.findOneAndUpdate({ _id: fila._id, campania: actual._id, __v: original.__v }, {
          $set: { tipo_cobro: fila.tipo_cobro, representante_cobro: fila.representante_cobro || null,
            nombre_representante: fila.nombre_representante || '', atletas_cubiertos: fila.atletas_cubiertos,
            nota_interna: fila.nota_interna,
            ...(fila.cobertura_familiar ? { cobertura_familiar: fila.cobertura_familiar, modalidad: 'no_aplica',
              monto: 0, saldo_pendiente: 0, estado: 'no_aplica' } : {}) }, $inc: { __v: 1 }
        }, { new: true, runValidators: true, session }).lean();
        if (!cargo) throw errorPeticion(409, 'Un cargo cambio durante la conversion. Actualiza la vista previa.');
      }
      const conservados = new Set(resumen.filas.map((fila) => fila._id));
      const absorbidos = resumen.anteriores.filter((cargo) => !conservados.has(String(cargo._id))).map((cargo) => cargo._id);
      if (absorbidos.length) {
        const eliminados = await models.Cargo.deleteMany({ campania: actual._id, _id: { $in: absorbidos } }, { session });
        if (eliminados.deletedCount !== absorbidos.length) throw errorPeticion(409, 'Un cargo cambio durante la conversion.');
      }
      return { repetida: false };
    }, { obligatoria: true });
    const campania = await models.Campania.findById(req.params.id).select(CAMPOS).populate('sedes', 'nombre').lean();
    return res.json({ ...resultado, campania });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message
      : 'No se pudo convertir la campana. Reintenta la misma solicitud o actualiza sus cargos.' });
  }
};

exports.resumenCoberturaFamiliar = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    if (!OBJECT_ID.test(req.params.cargoId)) throw errorPeticion(400, 'El cargo no es valido.');
    const models = await modelosConversion(req);
    const campania = await models.Campania.findById(req.params.id).select(CAMPOS).populate('sedes', 'nombre').lean();
    if (!campania) throw errorPeticion(404, 'La campana no existe en esta academia.');
    const { anteriores, familia, datosFamilia, ...resumen } = await prepararCoberturaFamiliar(models, campania, req.params.cargoId);
    return res.json({ campania, ...resumen });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'No se pudo calcular la cobertura familiar. Intenta nuevamente.' });
  }
};

exports.aplicarCoberturaFamiliar = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const body = req.body;
    if (!OBJECT_ID.test(req.params.cargoId) || !body
      || Object.keys(body).some((key) => !['version', 'revision', 'solicitud_id'].includes(key))
      || !Number.isInteger(body.version) || body.version < 0 || typeof body.revision !== 'string' || !/^[a-f\d]{64}$/.test(body.revision)
      || typeof body.solicitud_id !== 'string' || !UUID.test(body.solicitud_id)) {
      throw errorPeticion(400, 'Revisa la vista previa y confirma una solicitud de cobertura valida.');
    }
    if (!req.user.id) throw errorPeticion(401, 'Inicia sesion nuevamente para identificar al administrador.');
    const models = await modelosConversion(req);
    const actor = { id: String(req.user.id), rol: req.user.rol };
    const solicitudId = body.solicitud_id.toLowerCase();
    const cargoId = req.params.cargoId.toLowerCase();
    const resultado = await ejecutarConTransaccion(models.Campania, async (session) => {
      const actual = await aplicarSession(models.Campania.findById(req.params.id).select(`${CAMPOS} +coberturas_familiares`), session).lean();
      if (!actual) throw errorPeticion(404, 'La campana no existe en esta academia.');
      const previa = (actual.coberturas_familiares || []).find((item) => item.solicitud_id === solicitudId);
      if (previa) {
        if (previa.cargo !== cargoId || previa.version !== body.version || previa.revision !== body.revision
          || previa.actor.id !== actor.id || previa.actor.rol !== actor.rol) {
          throw errorPeticion(409, 'Esta solicitud ya corresponde a otra cobertura.');
        }
        return { repetida: true, fuente: cargoId, cubiertos: previa.cubiertos };
      }
      if (actual.__v !== body.version) throw errorPeticion(409, 'La campana cambio. Actualiza y revisa la cobertura antes de confirmar.');
      const resumen = await prepararCoberturaFamiliar(models, actual, cargoId, session);
      if (resumen.revision !== body.revision) throw errorPeticion(409, 'Los cargos, pagos o representantes cambiaron. Actualiza la vista previa.');
      const cubiertos = resumen.hermanos.map((cargo) => cargo._id);
      const idsFamilia = new Set([cargoId, ...cubiertos]);
      const excepciones = actual.excepciones_cobro.filter((item) => !idsFamilia.has(String(item.cargo)));
      const auditoria = { solicitud_id: solicitudId, cargo: cargoId, version: body.version,
        revision: body.revision, actor, fecha: new Date(), cubiertos,
        antes: resumen.antes, despues: resumen.despues, cargos_anteriores: resumen.familia };
      const campania = await models.Campania.findOneAndUpdate({ _id: actual._id, __v: body.version, estado: 'abierta' }, {
        $set: { totales_cargos: resumen.despues, excepciones_cobro: excepciones, actualizado_por: actor },
        $inc: { __v: 1 }, $push: { coberturas_familiares: auditoria }
      }, { new: true, runValidators: true, session }).lean();
      if (!campania) throw errorPeticion(409, 'La campana cambio durante la cobertura. Actualiza la vista previa.');
      const cargo = await models.Cargo.findOneAndUpdate({ _id: cargoId, campania: actual._id, __v: resumen.fuente.version,
        estado: resumen.fuente.estado, monto: resumen.fuente.monto, saldo_pendiente: resumen.fuente.saldo_pendiente }, {
        $set: resumen.datosFamilia, $inc: { __v: 1 }
      }, { new: true, runValidators: true, session }).lean();
      if (!cargo) throw errorPeticion(409, 'El cargo de origen cambio durante la cobertura. Actualiza la vista previa.');
      const eliminados = await models.Cargo.deleteMany({ campania: actual._id, $or: resumen.hermanos.map((hermano) => ({
        _id: hermano._id, __v: hermano.version, estado: 'pendiente', monto: hermano.monto, saldo_pendiente: hermano.saldo_pendiente
      })) }, { session });
      if (eliminados.deletedCount !== cubiertos.length) throw errorPeticion(409, 'Un cargo cambio durante la cobertura. Actualiza la vista previa.');
      await actualizarCierreAutomatico({ CampaniaCobro: models.Campania, CargoCampania: models.Cargo, PagoCampania: models.Pago },
        [actual._id], actor, session);
      return { repetida: false, fuente: cargoId, cubiertos };
    }, { obligatoria: true });
    const campania = await models.Campania.findById(req.params.id).select(CAMPOS).populate('sedes', 'nombre').lean();
    return res.json({ ...resultado, campania });
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message
      : 'No se pudo aplicar la cobertura familiar. Reintenta la misma solicitud o actualiza los cargos.' });
  }
};

exports.candidatosCargos = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    if (!OBJECT_ID.test(req.params.id)) throw errorPeticion(400, 'La campana no es valida.');
    const models = await modelos(req);
    const actual = await models.Campania.findById(req.params.id).select(CAMPOS).lean();
    if (!actual) throw errorPeticion(404, 'La campana no existe en esta academia.');
    if (actual.estado !== 'abierta' || !actual.publicacion) throw errorPeticion(409, 'La campana no admite ajustes.');
    const Alumno = getTenantModel(models.connection, 'Alumno');
    getTenantModel(models.connection, 'Representante');
    const atletas = await Alumno.find({ sede: { $in: actual.sedes }, activo: { $ne: false }, dado_de_baja: { $ne: true },
      _id: { $nin: actual.participantes } }).select('nombres apellidos categoria sede representante')
      .populate('sede', 'nombre').populate('representante', 'nombres apellidos')
      .sort({ apellidos: 1, nombres: 1, _id: 1 }).limit(10000).lean();
    return res.json({ atletas });
  } catch (error) { return responderError(res, error); }
};

exports.ajustarCargo = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const body = req.body;
    if (!OBJECT_ID.test(req.params.id) || !body || Object.keys(body).some((key) =>
      !['alumno', 'accion', 'modalidad', 'monto', 'nota_interna', 'version', 'version_cargo', 'solicitud_id'].includes(key))
      || typeof body.alumno !== 'string' || !OBJECT_ID.test(body.alumno)
      || !['agregar', 'editar', 'retirar'].includes(body.accion) || !Number.isInteger(body.version) || body.version < 0
      || (body.accion !== 'agregar' && (!Number.isInteger(body.version_cargo) || body.version_cargo < 0))
      || typeof body.solicitud_id !== 'string' || !UUID.test(body.solicitud_id)) {
      throw errorPeticion(400, 'Revisa el alumno, la accion y las versiones del ajuste.');
    }
    if (!req.user.id) throw errorPeticion(401, 'Inicia sesion nuevamente para identificar al administrador.');
    const alumnoId = body.alumno.toLowerCase();
    const condicion = validarCondiciones([{ alumno: alumnoId,
      modalidad: body.accion === 'retirar' ? 'no_aplica' : body.modalidad,
      ...(body.monto !== undefined ? { monto: body.monto } : {}), nota_interna: body.nota_interna ?? '' }], [alumnoId])[0]
      || { alumno: alumnoId, modalidad: 'general', nota_interna: '' };
    const solicitudId = body.solicitud_id.toLowerCase();
    const huella = createHash('sha256').update(JSON.stringify({ alumno: body.alumno.toLowerCase(), accion: body.accion,
      version: body.version, version_cargo: body.version_cargo, condicion, actor: { id: req.user.id, rol: req.user.rol } })).digest('hex');
    const models = await modelos(req);
    const Cargo = getTenantModel(models.connection, 'CargoCampania');
    const Pago = getTenantModel(models.connection, 'PagoCampania');
    const Alumno = getTenantModel(models.connection, 'Alumno');
    await Cargo.init();
    const resultado = await ejecutarConTransaccion(models.Campania, async (session) => {
      const actual = await aplicarSession(models.Campania.findById(req.params.id).select(`${CAMPOS} +ajustes_cargos`), session).lean();
      if (!actual) throw errorPeticion(404, 'La campana no existe en esta academia.');
      if (actual.estado !== 'abierta' || !actual.publicacion) throw errorPeticion(409, 'Solo puedes ajustar cargos de una campana abierta.');
      const repetida = (actual.ajustes_cargos || []).find((ajuste) => ajuste.solicitud_id === solicitudId);
      if (repetida) {
        if (repetida.huella !== huella) throw errorPeticion(409, 'La solicitud ya corresponde a otro ajuste.');
        return { cargo: await aplicarSession(Cargo.findById(repetida.cargo), session).lean(), repetida: true,
          ...(repetida.accion === 'agregar' && repetida.anterior ? { vinculado: true } : {}) };
      }
      if (actual.__v !== body.version) throw errorPeticion(409, 'La campana cambio. Recarga sus cargos antes de ajustar.');
      const anteriores = await aplicarSession(Cargo.find({ campania: actual._id }).select('+nota_interna'), session).lean();
      const vigentes = actual.totales_cargos || actual.publicacion;
      if (anteriores.length !== cantidadCargos(vigentes) || anteriores.reduce((total, cargo) => total + Math.round(cargo.monto * 100), 0) !== Math.round(vigentes.total_esperado * 100)) {
        throw errorPeticion(409, 'No se pudieron verificar los totales de los cargos.');
      }
      let anterior = anteriores.find((cargo) => alumnosCargo(cargo).includes(alumnoId));
      if (anterior?.cobertura_familiar) throw errorPeticion(409, 'Este cargo esta cubierto por un pago familiar. No se puede editar ni retirar como una exoneracion.');
      let base = anterior;
      let vincular = false;
      let incorporado;
      if (body.accion === 'agregar') {
        if (anterior) throw errorPeticion(409, 'El alumno ya tiene un cargo. Edita el existente para reincorporarlo.');
        if (actual.participantes.length >= 10000) throw errorPeticion(409, 'La campana supera el limite de participantes.');
        getTenantModel(models.connection, 'Representante');
        const alumno = await aplicarSession(Alumno.findById(body.alumno).select('nombres apellidos categoria sede activo dado_de_baja representante')
          .populate('sede', 'nombre').populate('representante', 'nombres apellidos'), session).lean();
        if (!alumno || alumno.activo === false || alumno.dado_de_baja === true
          || !actual.sedes.some((sede) => String(sede) === String(alumno.sede?._id))) {
          throw errorPeticion(409, 'Selecciona un alumno activo de las sedes de esta campana.');
        }
        base = { campania: actual._id, alumno: alumno._id, nombres: alumno.nombres, apellidos: alumno.apellidos || '',
          categoria: alumno.categoria || '', sede: alumno.sede._id, nombre_sede: alumno.sede.nombre,
          moneda: actual.moneda, permitir_abonos: actual.permitir_abonos, vencimiento: actual.vencimiento };
        if (actual.unidad_cobro === 'representante') {
          if (alumno.representante && (actual.excepciones_cobro || [])
            .some((item) => String(item.representante || '') === String(alumno.representante._id))) {
            throw errorPeticion(409, 'Este representante conserva cargos individuales de la conversion. Revisa su cobertura familiar antes de agregar otra deuda.');
          }
          incorporado = fotoAtleta({ ...alumno, alumno: alumno._id });
          base = { ...base, tipo_cobro: alumno.representante ? 'representante' : 'individual_sin_representante',
            atletas_cubiertos: [incorporado],
            ...(alumno.representante ? { representante_cobro: alumno.representante._id,
              nombre_representante: [alumno.representante.nombres, alumno.representante.apellidos].filter(Boolean).join(' ') } : {}) };
          anterior = alumno.representante && anteriores.find((cargo) => cargo.tipo_cobro === 'representante'
            && String(cargo.representante_cobro) === String(alumno.representante._id));
          if (anterior) {
            if (anterior.retirado) throw errorPeticion(409, 'Reincorpora primero el cobro de este representante.');
            vincular = true;
          }
        }
      } else {
        if (!anterior) throw errorPeticion(404, 'El cargo no existe en esta campana.');
        const pago = await aplicarSession(Pago.findOne({ campania: actual._id, cargo: anterior._id,
          estado: { $in: ['confirmado', 'en_revision'] } }).select('_id'), session).lean();
        if (pago || !['pendiente', 'no_aplica'].includes(anterior.estado) || anterior.saldo_pendiente !== anterior.monto) {
          throw errorPeticion(409, 'No puedes ajustar un cargo con pagos confirmados o en revision.');
        }
        if (anterior.__v !== body.version_cargo) throw errorPeticion(409, 'El cargo cambio. Reabre el ajuste.');
      }
      const monto = condicion.modalidad === 'no_aplica' ? 0 : condicion.modalidad === 'personalizado' ? condicion.monto
        : actual.modalidad_monto === 'por_sede' ? actual.montos_por_sede.find((precio) => String(precio.sede) === String(base.sede))?.monto : actual.monto_general;
      if (!Number.isFinite(monto) || monto < 0 || (condicion.modalidad !== 'no_aplica' && monto <= 0)) {
        throw errorPeticion(409, 'No hay un monto valido de campana para la sede del alumno.');
      }
      if (vincular && (monto !== anterior.monto || (condicion.modalidad === 'no_aplica') !== (anterior.modalidad === 'no_aplica'))) {
        throw errorPeticion(409, 'El representante ya tiene un cobro. Usa el mismo importe y condicion de aplicacion para vincular al atleta sin generar otra deuda.');
      }
      const cambios = vincular ? { atletas_cubiertos: [...anterior.atletas_cubiertos, incorporado] }
        : { modalidad: condicion.modalidad, monto, saldo_pendiente: monto,
        estado: condicion.modalidad === 'no_aplica' ? 'no_aplica' : 'pendiente',
        retirado: body.accion === 'retirar', nota_interna: condicion.nota_interna };
      let cargo;
      if (anterior) cargo = await Cargo.findOneAndUpdate({ _id: anterior._id, __v: anterior.__v,
        estado: anterior.estado, saldo_pendiente: anterior.saldo_pendiente }, { $set: cambios, $inc: { __v: 1 } },
      { new: true, runValidators: true, session }).lean();
      else [cargo] = await Cargo.insertMany([{ ...base, ...cambios }], { session });
      if (!cargo) throw errorPeticion(409, 'El cargo cambio. Recarga antes de ajustar.');
      const todos = [...anteriores.filter((item) => String(item._id) !== String(anterior?._id)), cargo];
      const totales = totalesCargos(todos, actual.unidad_cobro === 'representante');
      const actor = { id: req.user.id, rol: req.user.rol };
      const guardada = await models.Campania.findOneAndUpdate({ _id: actual._id, estado: 'abierta', __v: body.version }, {
        $set: { totales_cargos: totales, participantes: todos.flatMap(alumnosCargo), actualizado_por: actor }, $inc: { __v: 1 },
        $push: { ajustes_cargos: { solicitud_id: solicitudId, huella, accion: body.accion, cargo: cargo._id,
          anterior: anterior || null, nuevo: cargo.toObject ? cargo.toObject() : cargo, actor, fecha: new Date() } }
      }, { new: true, runValidators: true, session });
      if (!guardada) throw errorPeticion(409, 'La campana cambio. Recarga antes de ajustar.');
      await actualizarCierreAutomatico({ CampaniaCobro: models.Campania, CargoCampania: Cargo,
        PagoCampania: getTenantModel(models.connection, 'PagoCampania') }, [actual._id], actor, session);
      return { cargo, repetida: false, ...(vincular ? { vinculado: true } : {}) };
    }, { obligatoria: true });
    return res.json(resultado);
  } catch (error) {
    return res.status(error.status || (error.code === 11000 ? 409 : 500)).json({ error: error.status ? error.message
      : 'No se pudo ajustar el cargo. Reintenta la misma solicitud o recarga la campana.' });
  }
};

function validarCondiciones(condiciones, participantes) {
  if (!Array.isArray(condiciones) || condiciones.length > participantes.length) {
    throw errorPeticion(400, 'Las condiciones individuales no son validas.');
  }
  const seleccionados = new Set(participantes);
  const encontrados = new Set();
  const resultado = [];
  for (const condicion of condiciones) {
    if (!condicion || typeof condicion !== 'object' || Array.isArray(condicion)
      || Object.keys(condicion).some((key) => !['alumno', 'modalidad', 'monto', 'nota_interna'].includes(key))
      || typeof condicion.alumno !== 'string' || !OBJECT_ID.test(condicion.alumno)
      || !seleccionados.has(condicion.alumno.toLowerCase()) || encontrados.has(condicion.alumno.toLowerCase())
      || !['general', 'personalizado', 'no_aplica'].includes(condicion.modalidad)
      || typeof condicion.nota_interna !== 'string' || condicion.nota_interna.trim().length > 1000) {
      throw errorPeticion(400, 'Revisa las condiciones y notas de los participantes seleccionados.');
    }
    encontrados.add(condicion.alumno.toLowerCase());
    const nota = condicion.nota_interna.trim();
    const personalizada = condicion.modalidad === 'personalizado';
    if (personalizada ? !['number', 'string'].includes(typeof condicion.monto)
      || !/^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(String(condicion.monto)) || Number(condicion.monto) <= 0 : condicion.monto != null) {
      throw errorPeticion(400, 'El monto personalizado debe ser positivo y tener hasta dos decimales; las otras modalidades no admiten importe.');
    }
    if (condicion.modalidad !== 'general' || nota) resultado.push({ alumno: condicion.alumno.toLowerCase(),
      modalidad: condicion.modalidad, ...(personalizada ? { monto: Number(condicion.monto) } : {}), nota_interna: nota });
  }
  return resultado;
}

exports.guardarParticipantes = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const body = req.body;
    if (!body || Object.keys(body).some((key) => !['version', 'participantes', 'condiciones_participantes'].includes(key))
      || !Number.isInteger(body.version) || body.version < 0 || !Array.isArray(body.participantes)
      || body.participantes.length > 10000 || body.participantes.some((id) => typeof id !== 'string' || !OBJECT_ID.test(id))
      || new Set(body.participantes.map((id) => id.toLowerCase())).size !== body.participantes.length) {
      throw errorPeticion(400, 'Selecciona atletas validos, sin duplicados, e indica la version del borrador.');
    }
    const { campania, Campania, Alumno } = await borradorParticipantes(req);
    if (campania.__v !== body.version) throw errorPeticion(409, 'Otro administrador modifico el borrador. Cierra y vuelve a abrir los participantes.');
    const participantes = body.participantes.map((id) => id.toLowerCase());
    const condiciones = body.condiciones_participantes === undefined
      ? (campania.condiciones_participantes || []).filter((condicion) => participantes.includes(String(condicion.alumno)))
      : validarCondiciones(body.condiciones_participantes, participantes);
    const anteriores = new Set((campania.participantes || []).map(String));
    const nuevos = participantes.filter((id) => !anteriores.has(id));
    if (nuevos.length) {
      const cantidad = await Alumno.countDocuments({ _id: { $in: nuevos },
        sede: { $in: campania.sedes.filter(Boolean).map((sede) => sede._id) }, activo: { $ne: false }, dado_de_baja: { $ne: true } });
      if (cantidad !== nuevos.length) throw errorPeticion(400, 'Hay atletas nuevos que no estan activos o no pertenecen a las sedes de esta campana. Revisa la seleccion.');
    }
    const guardada = await Campania.findOneAndUpdate({ _id: req.params.id, estado: 'borrador', __v: body.version }, {
      $set: { participantes, condiciones_participantes: condiciones, actualizado_por: { id: req.user.id, rol: req.user.rol } }, $inc: { __v: 1 }
    }, { new: true, runValidators: true });
    if (!guardada) throw errorPeticion(409, 'Otro administrador modifico el borrador. Cierra y vuelve a abrir los participantes.');
    return await devolverCampania(res, Campania, req.params.id, 200, true);
  } catch (error) {
    return responderError(res, error);
  }
};