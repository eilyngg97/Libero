const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const { getOwnEntrenador } = require('../services/entrenadorAccess');

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const fail = (status, message) => Object.assign(new Error(message), { status });
const idValido = (value) => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
function fechaValida(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
function validarGrupo(body = {}) {
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : '';
  const categorias = Array.isArray(body.categorias) ? [...new Set(body.categorias.filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean))] : [];
  const dias = Array.isArray(body.dias) ? [...new Set(body.dias)] : [];
  if (!nombre || nombre.length > 100 || !dias.length || dias.some(value => !Number.isInteger(value) || value < 0 || value > 6)) throw fail(400, 'Indica nombre y dias de entrenamiento validos.');
  if (![body.hora_inicio, body.hora_fin].every(value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)) || body.hora_fin <= body.hora_inicio) throw fail(400, 'La hora final debe ser posterior a la inicial.');
  if (!categorias.length || categorias.length > 30 || categorias.some(value => value.length > 100)) throw fail(400, 'Selecciona al menos una categoria valida.');
  if (['entrenador', 'cancha'].some(key => body[key] != null && (typeof body[key] !== 'string' || body[key].length > 100))) throw fail(400, 'Entrenador o cancha invalido.');
  if (body.entrenadores !== undefined && (!Array.isArray(body.entrenadores) || body.entrenadores.length > 30 || body.entrenadores.some(value => typeof value !== 'string' || !value.trim() || value.trim().length > 100))) throw fail(400, 'Indica una lista valida de entrenadores (maximo 30, hasta 100 caracteres por nombre).');
  const entrenadores = [...new Set(body.entrenadores === undefined ? [(body.entrenador || '').trim()].filter(Boolean) : body.entrenadores.map(value => value.trim()))];
  const ajustes = {};
  for (const key of ['alumnos_adicionales', 'alumnos_excluidos']) {
    const values = body[key] === undefined ? [] : body[key];
    if (!Array.isArray(values) || values.length > 5000 || values.some(value => !idValido(value))) throw fail(400, 'Indica una lista valida de atletas adicionales o excluidos.');
    ajustes[key] = [...new Set(values.map(value => value.toLowerCase()))];
  }
  if (ajustes.alumnos_adicionales.some(value => ajustes.alumnos_excluidos.includes(value))) throw fail(400, 'Un atleta no puede estar incluido y excluido al mismo tiempo.');
  if (body.activo !== undefined && typeof body.activo !== 'boolean') throw fail(400, 'Estado de grupo invalido.');
  const asignacion = {};
  if (body.entrenadores_ids !== undefined) {
    if (!Array.isArray(body.entrenadores_ids) || body.entrenadores_ids.length > 30 || body.entrenadores_ids.some(value => !idValido(value))) throw fail(400, 'Selecciona entrenadores registrados validos.');
    asignacion.entrenadores_ids = [...new Set(body.entrenadores_ids.map(value => value.toLowerCase()))];
  }
  return { nombre, dias, categorias, ...ajustes, ...asignacion, hora_inicio: body.hora_inicio, hora_fin: body.hora_fin, entrenador: entrenadores[0] || '', entrenadores, cancha: (body.cancha || '').trim(), activo: body.activo !== false };
}
async function contexto(req) {
  if (!idValido(req.query.sede)) throw fail(400, 'Selecciona una sede valida.');
  const connection = await getTenantBusinessConnection(req.tenant || { tenantId: req.tenantId });
  const models = Object.fromEntries(['Sede', 'Alumno', 'TenantConfig', 'GrupoEntrenamiento', 'Asistencia', 'Entrenador'].map(name => [name, getTenantModel(connection, name)]));
  if (!await models.Sede.findById(req.query.sede).lean()) throw fail(404, 'Sede no encontrada.');
  let gruposPropios;
  if (req.user?.rol === 'entrenador') {
    const entrenador = await getOwnEntrenador(models.Entrenador, req.user.id);
    const grupos = await models.GrupoEntrenamiento.find({ sede: req.query.sede, entrenadores_ids: entrenador._id }).select('_id').lean();
    gruposPropios = grupos.map(grupo => String(grupo._id));
    if (!gruposPropios.length) throw fail(403, 'No tienes grupos asignados en esta sede.');
  }
  return { ...models, sede: req.query.sede, gruposPropios };
}
const filtroGrupos = (context) => context.gruposPropios ? { _id: { $in: context.gruposPropios } } : {};
const filtroListas = (context) => context.gruposPropios ? { grupo: { $in: context.gruposPropios } } : {};
function validarAccesoGrupo(context, grupoId) {
  if (context.gruposPropios && !context.gruposPropios.includes(grupoId)) throw fail(404, 'Grupo no encontrado en tus asignaciones.');
}
const handle = (action) => async (req, res) => {
  try { return await action(req, res); }
  catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: 'La lista ya fue guardada. Recarga antes de editar.' });
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'No se pudo completar la operacion de asistencias.' });
  }
};
const resumen = (lista) => ({ ...lista, presentes: lista.registros.filter(item => item.estado === 'presente').length, sin_marcar: lista.registros.filter(item => !item.estado).length, total: lista.registros.length });
const snapshot = (grupo) => ({ ...Object.fromEntries(['nombre', 'hora_inicio', 'hora_fin', 'categorias', 'entrenador', 'cancha'].map(key => [key, grupo[key]])), entrenadores: Array.isArray(grupo.entrenadores) ? grupo.entrenadores : [grupo.entrenador].filter(Boolean) });
async function alumnosGrupo(Alumno, sede, grupo) {
  const filtro = { sede, activo: { $ne: false }, dado_de_baja: { $ne: true }, estado: { $nin: ['Baja', 'Inactivo', 'baja', 'inactivo'] } };
  if (grupo.alumnos_adicionales?.length) filtro.$or = [{ categoria: { $in: grupo.categorias } }, { _id: { $in: grupo.alumnos_adicionales } }];
  else filtro.categoria = { $in: grupo.categorias };
  if (grupo.alumnos_excluidos?.length) filtro._id = { $nin: grupo.alumnos_excluidos };
  return Alumno.find(filtro).select('_id nombres apellidos categoria foto').sort({ apellidos: 1, nombres: 1 }).lean();
}
exports.atletas = handle(async (req, res) => {
  if (req.user?.rol === 'entrenador') throw fail(403, 'Solo administracion puede editar los integrantes.');
  const { Alumno, sede } = await contexto(req);
  const alumnos = await Alumno.find({ sede }).select('_id nombres apellidos categoria activo dado_de_baja estado').sort({ apellidos: 1, nombres: 1 }).lean();
  return res.json({ atletas: alumnos.map(alumno => ({ _id: alumno._id, nombre: `${alumno.apellidos}, ${alumno.nombres}`, categoria: alumno.categoria || '', activo: alumno.activo !== false && alumno.dado_de_baja !== true && !['baja', 'inactivo'].includes(String(alumno.estado || '').toLowerCase()) })) });
});
exports.grupos = handle(async (req, res) => {
  const context = await contexto(req);
  const { GrupoEntrenamiento, TenantConfig, Entrenador, sede } = context;
  const [grupos, config, entrenadores] = await Promise.all([GrupoEntrenamiento.find({ sede, ...filtroGrupos(context) }).sort({ hora_inicio: 1 }).lean(), TenantConfig.findOne({ key: 'default' }).select('categorias').lean(), context.gruposPropios ? [] : Entrenador.find({}).select('_id nombre apellido estado').lean()]);
  const catalogo = (config?.categorias?.reglas || []).map((regla, index) => ({ ...regla, orden: regla.orden ?? index + 1 })).sort((first, second) => first.orden - second.orden).map(regla => regla.etiqueta).filter(Boolean);
  const nombresEntrenadores = [...new Set(entrenadores.map(entrenador => [entrenador.nombre, entrenador.apellido].filter(Boolean).join(' ').trim()).filter(Boolean))].sort((first, second) => first.localeCompare(second, 'es'));
  return res.json({ grupos, categorias: [...new Set(catalogo)], entrenadores: nombresEntrenadores, entrenadores_registrados: entrenadores.filter(item => item.estado !== 'inactivo').map(item => ({ _id: item._id, nombre: [item.nombre, item.apellido].filter(Boolean).join(' ').trim() })) });
});
exports.guardarGrupo = handle(async (req, res) => {
  if (req.user?.rol === 'entrenador') throw fail(403, 'Solo administracion puede configurar grupos.');
  const fields = validarGrupo(req.body);
  if (req.params.id && !idValido(req.params.id)) throw fail(400, 'Grupo invalido.');
  const { GrupoEntrenamiento, Alumno, Entrenador, sede } = await contexto(req);
  if (fields.entrenadores_ids?.length) {
    const registrados = await Entrenador.find({ _id: { $in: fields.entrenadores_ids }, estado: { $ne: 'inactivo' } }).select('_id').lean();
    if (registrados.length !== fields.entrenadores_ids.length) throw fail(400, 'Los entrenadores asignados deben estar activos y pertenecer a esta academia.');
  }
  const ids = [...fields.alumnos_adicionales, ...fields.alumnos_excluidos];
  if (ids.length) {
    const alumnos = await Alumno.find({ sede, _id: { $in: ids } }).select('_id activo dado_de_baja estado').lean();
    const porId = new Map(alumnos.map(alumno => [String(alumno._id), alumno]));
    if (ids.some(id => !porId.has(id))) throw fail(400, 'Los atletas deben pertenecer a esta sede y academia.');
    if (fields.alumnos_adicionales.some(id => { const alumno = porId.get(id); return alumno.activo === false || alumno.dado_de_baja === true || ['baja', 'inactivo'].includes(String(alumno.estado || '').toLowerCase()); })) throw fail(400, 'Solo puedes agregar atletas activos al grupo.');
  }
  const grupo = req.params.id
    ? await GrupoEntrenamiento.findOneAndUpdate({ _id: req.params.id, sede }, { $set: fields }, { new: true, runValidators: true })
    : await GrupoEntrenamiento.create({ ...fields, sede });
  if (!grupo) throw fail(404, 'Grupo no encontrado en esta sede.');
  return res.status(req.params.id ? 200 : 201).json(grupo);
});
exports.sesiones = handle(async (req, res) => {
  const fecha = req.query.fecha || hoy();
  if (!fechaValida(fecha)) throw fail(400, 'Fecha invalida.');
  const context = await contexto(req);
  const { GrupoEntrenamiento, Asistencia, Alumno, sede } = context;
  const [grupos, listas] = await Promise.all([
    GrupoEntrenamiento.find({ sede, activo: true, dias: new Date(`${fecha}T12:00:00Z`).getUTCDay(), ...filtroGrupos(context) }).sort({ hora_inicio: 1 }).lean(),
    Asistencia.find({ sede, fecha, ...filtroListas(context) }).lean()
  ]);
  const sesiones = listas.map(lista => ({ ...resumen(lista), tomada: true }));
  for (const grupo of grupos) {
    if (listas.some(lista => String(lista.grupo) === String(grupo._id))) continue;
    const alumnos = await alumnosGrupo(Alumno, sede, grupo);
    sesiones.push({ ...snapshot(grupo), grupo: grupo._id, fecha, tomada: false, total: alumnos.length, presentes: 0 });
  }
  sesiones.sort((first, second) => first.hora_inicio.localeCompare(second.hora_inicio));
  return res.json({ fecha, hoy: hoy(), sesiones });
});
exports.lista = handle(async (req, res) => {
  const fecha = req.query.fecha;
  if (!fechaValida(fecha) || !idValido(req.params.grupo)) throw fail(400, 'Fecha o grupo invalido.');
  const context = await contexto(req);
  validarAccesoGrupo(context, req.params.grupo);
  const { GrupoEntrenamiento, Asistencia, Alumno, sede } = context;
  const guardada = await Asistencia.findOne({ sede, grupo: req.params.grupo, fecha }).lean();
  if (guardada) {
    const alumnos = await Alumno.find({ _id: { $in: guardada.registros.map(item => item.alumno) } }).select('_id foto').lean();
    const fotos = new Map(alumnos.map(alumno => [String(alumno._id), alumno.foto || '']));
    return res.json({ ...guardada, tomada: true, registros: guardada.registros.map(item => ({ ...item, foto: fotos.get(String(item.alumno)) || '' })) });
  }
  const grupo = await GrupoEntrenamiento.findOne({ _id: req.params.grupo, sede, activo: true }).lean();
  if (!grupo) throw fail(404, 'Grupo no encontrado en esta sede.');
  if (!grupo.dias.includes(new Date(`${fecha}T12:00:00Z`).getUTCDay())) throw fail(400, 'El grupo no entrena en esta fecha.');
  const alumnos = await alumnosGrupo(Alumno, sede, grupo);
  return res.json({ ...snapshot(grupo), grupo: grupo._id, fecha, tomada: false, registros: alumnos.map(alumno => ({ alumno: alumno._id, nombre: `${alumno.apellidos}, ${alumno.nombres}`, categoria: alumno.categoria, foto: alumno.foto || '', estado: '', observacion: '' })) });
});
exports.guardarLista = handle(async (req, res) => {
  const { fecha, registros, version } = req.body || {};
  if (!fechaValida(fecha) || fecha > hoy() || !idValido(req.params.grupo)) throw fail(400, 'No se puede registrar asistencia en una fecha futura o invalida.');
  if (!Array.isArray(registros) || registros.length > 5000 || registros.some(item => !item || !idValido(item.alumno) || !['', 'presente', 'ausente', 'justificado'].includes(item.estado) || typeof item.observacion !== 'string' || item.observacion.length > 300)) throw fail(400, 'Indica estados validos y limita las notas a 300 caracteres.');
  if (new Set(registros.map(item => item.alumno)).size !== registros.length) throw fail(400, 'Hay alumnos duplicados en la lista.');
  const context = await contexto(req);
  validarAccesoGrupo(context, req.params.grupo);
  const { GrupoEntrenamiento, Asistencia, Alumno, sede } = context;
  const filter = { sede, grupo: req.params.grupo, fecha };
  const anterior = await Asistencia.findOne(filter).lean();
  let base = anterior;
  if (!base) {
    const grupo = await GrupoEntrenamiento.findOne({ _id: req.params.grupo, sede, activo: true }).lean();
    if (!grupo) throw fail(404, 'Grupo no encontrado en esta sede.');
    if (!grupo.dias.includes(new Date(`${fecha}T12:00:00Z`).getUTCDay())) throw fail(400, 'El grupo no entrena en esta fecha.');
    const alumnos = await alumnosGrupo(Alumno, sede, grupo);
    base = { ...snapshot(grupo), registros: alumnos.map(alumno => ({ alumno: alumno._id, nombre: `${alumno.apellidos}, ${alumno.nombres}`, categoria: alumno.categoria })) };
  }
  const porAlumno = new Map(registros.map(item => [item.alumno, item]));
  if (!base.registros.length || base.registros.length !== registros.length || base.registros.some(item => !porAlumno.has(String(item.alumno)))) throw fail(409, 'La lista de alumnos cambio. Recarga la asistencia antes de guardar.');
  const fields = { registros: base.registros.map(item => ({ alumno: item.alumno, nombre: item.nombre, categoria: item.categoria, estado: porAlumno.get(String(item.alumno)).estado, observacion: porAlumno.get(String(item.alumno)).observacion.trim() })), actualizado_por: req.user?.id || req.usuario?.id };
  let result;
  if (anterior) {
    if (!Number.isInteger(version) || version !== anterior.__v) throw fail(409, 'Otra persona actualizo la lista. Recarga antes de guardar.');
    result = await Asistencia.findOneAndUpdate({ ...filter, __v: version }, { $set: fields, $inc: { __v: 1 } }, { new: true, runValidators: true });
    if (!result) throw fail(409, 'Otra persona actualizo la lista. Recarga antes de guardar.');
  } else {
    if (version != null) throw fail(409, 'La lista cambio. Recarga antes de guardar.');
    result = await Asistencia.create({ ...filter, ...snapshot(base), ...fields });
  }
  return res.status(anterior ? 200 : 201).json(result);
});
exports.historial = handle(async (req, res) => {
  if (req.query.mes !== undefined) {
    const { mes } = req.query;
    if (typeof mes !== 'string' || !/^\d{4}-\d{2}$/.test(mes) || !fechaValida(`${mes}-01`)) throw fail(400, 'Selecciona un mes valido.');
    const context = await contexto(req);
    const { Asistencia, Alumno, sede } = context;
    const listas = await Asistencia.find({ sede, ...filtroListas(context), fecha: { $gte: `${mes}-01`, $lte: `${mes}-31` < hoy() ? `${mes}-31` : hoy() } }).sort({ fecha: 1 }).lean();
    const grupos = new Map();
    for (const lista of listas) {
      const grupoId = String(lista.grupo);
      if (!grupos.has(grupoId)) grupos.set(grupoId, { grupo: grupoId, nombre: lista.nombre, fechas: [], alumnos: new Map() });
      const grupo = grupos.get(grupoId);
      grupo.nombre = lista.nombre;
      grupo.fechas.push(lista.fecha);
      for (const registro of lista.registros) {
        const alumnoId = String(registro.alumno);
        if (!grupo.alumnos.has(alumnoId)) grupo.alumnos.set(alumnoId, { alumno: alumnoId, presentes: 0, ausentes: 0, justificados: 0, sin_marcar: 0, total: 0, registros: [] });
        const alumno = grupo.alumnos.get(alumnoId);
        alumno.nombre = registro.nombre;
        alumno.categoria = registro.categoria;
        alumno.total += 1;
        const contador = { presente: 'presentes', ausente: 'ausentes', justificado: 'justificados', '': 'sin_marcar' }[registro.estado || ''];
        alumno[contador] += 1;
        alumno.registros.push({ fecha: lista.fecha, estado: registro.estado || '', observacion: registro.observacion || '' });
      }
    }
    const ids = [...new Set([...grupos.values()].flatMap(grupo => [...grupo.alumnos.keys()]))];
    const alumnos = ids.length ? await Alumno.find({ sede, _id: { $in: ids } }).select('_id foto').lean() : [];
    const fotos = new Map(alumnos.map(alumno => [String(alumno._id), alumno.foto || '']));
    return res.json({ mes, grupos: [...grupos.values()].map(grupo => ({ ...grupo, sesiones: grupo.fechas.length, alumnos: [...grupo.alumnos.values()].map(alumno => ({ ...alumno, foto: fotos.get(alumno.alumno) || '', porcentaje: Math.round(alumno.presentes / alumno.total * 100) })).sort((first, second) => first.porcentaje - second.porcentaje || first.nombre.localeCompare(second.nombre, 'es')) })) });
  }
  const { desde, hasta } = req.query;
  if (!fechaValida(desde) || !fechaValida(hasta) || desde > hasta || (new Date(hasta) - new Date(desde)) / 86400000 > 366) throw fail(400, 'Selecciona un rango de hasta un ano.');
  const context = await contexto(req);
  const { Asistencia, sede } = context;
  const page = req.query.page === undefined ? 0 : Number(req.query.page);
  if (!Number.isSafeInteger(page) || page < 0 || page > 100000) throw fail(400, 'Pagina invalida.');
  const filter = { sede, ...filtroListas(context), fecha: { $gte: desde, $lte: hasta } };
  const [listas, total] = await Promise.all([Asistencia.find(filter).sort({ fecha: -1, hora_inicio: 1 }).skip(page * 20).limit(20).lean(), Asistencia.countDocuments(filter)]);
  return res.json({ listas: listas.map(resumen), total, page });
});
exports.validarGrupo = validarGrupo;
exports.fechaValida = fechaValida;