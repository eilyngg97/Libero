const { createHash, randomUUID } = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const { ejecutarConTransaccion, aplicarSession } = require('../services/financeTransaction');
const { obtenerTasaPagoPorFecha } = require('../services/paymentExchangeRate');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');
const { userRepresentsAlumno } = require('../services/paymentOwnership');
const { actualizarCargo, confirmarPagoCampania, validarEquivalenteCampania } = require('../services/campaniaPaymentConfirmation');
const { bloquearCampania, actualizarCierreAutomatico } = require('../services/campaniaClosure');

const OBJECT_ID = /^[a-f\d]{24}$/i;
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const fallo = (status, message) => Object.assign(new Error(message), { status });
const centimos = (monto) => Math.round(monto * 100);

async function modelosPortal(req) {
  const connection = await getTenantBusinessConnection(req.tenant || { tenantId: req.tenantId });
  return Object.fromEntries(['CampaniaCobro', 'CargoCampania', 'PagoCampania', 'TenantConfig',
    ...(req.user?.rol === 'usuario' ? ['Alumno', 'Representante'] : [])]
    .map((nombre) => [nombre, getTenantModel(connection, nombre)]));
}

async function modelosAgrupados(req) {
  if (!req.user?.id) throw fallo(401, 'Inicia sesion nuevamente.');
  const models = await modelosPortal(req);
  const connection = models.CargoCampania.db;
  for (const nombre of ['Alumno', 'Representante']) models[nombre] = getTenantModel(connection, nombre);
  return models;
}

async function representanteAgrupado(models, req, alumnoId, session) {
  if (!OBJECT_ID.test(String(alumnoId))) throw fallo(400, 'Indica un atleta valido.');
  await verificarPropiedad(models, req, alumnoId, session);
  const alumno = await aplicarSession(models.Alumno.findById(alumnoId).select('representante'), session).lean();
  if (!alumno) throw fallo(404, 'El atleta no esta disponible en esta academia.');
  if (!alumno?.representante) throw fallo(409, 'El atleta debe tener un representante para agrupar pagos.');
  const representante = await aplicarSession(models.Representante.findById(alumno.representante).select('_id'), session).lean();
  if (!representante) throw fallo(409, 'El representante no esta disponible.');
  return representante._id;
}

exports.cargosAgrupables = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const models = await modelosAgrupados(req);
    const representante = await representanteAgrupado(models, req, req.query.alumnoId);
    const atletas = await models.Alumno.find({ representante }).select('_id').lean();
    const cargos = await models.CargoCampania.find({ $or: [
      { alumno: { $in: atletas.map((alumno) => alumno._id) }, tipo_cobro: { $ne: 'representante' } },
      { tipo_cobro: 'representante', representante_cobro: representante }
    ],
      saldo_pendiente: { $gt: 0 }, modalidad: { $ne: 'no_aplica' } })
      .select('campania alumno tipo_cobro representante_cobro nombre_representante atletas_cubiertos nombres apellidos moneda saldo_pendiente __v')
      .populate('campania', 'nombre descripcion estado publicacion').sort({ _id: 1 }).lean();
    const reservas = await models.PagoCampania.find({ cargo: { $in: cargos.map((cargo) => cargo._id) }, estado: 'en_revision' }).select('cargo').lean();
    const disponibles = [];
    for (const cargo of cargos) {
      try { await verificarPropiedadCargo(models, req, cargo); disponibles.push(cargo); }
      catch (error) { if (error.status !== 404) throw error; }
    }
    return res.json({ representante: String(representante), cargos: disponibles.filter((cargo) => cargo.campania?.estado === 'abierta'
      && cargo.campania.publicacion && !reservas.some((pago) => String(pago.cargo) === String(cargo._id)))
      .map((cargo) => ({ ...cargo, campania: { _id: cargo.campania._id, nombre: cargo.campania.nombre, descripcion: cargo.campania.descripcion || '' } })) });
  } catch (error) { return responderError(res, error); }
};

function repartirBs(total, importes) {
  const pesos = importes.map((importe) => BigInt(centimos(importe)));
  const suma = pesos.reduce((acumulado, importe) => acumulado + importe, 0n);
  const centavos = BigInt(centimos(total));
  const partes = pesos.map((peso, indice) => ({ indice, valor: centavos * peso / suma, resto: centavos * peso % suma }));
  let faltan = centavos - partes.reduce((acumulado, parte) => acumulado + parte.valor, 0n);
  for (const parte of [...partes].sort((primera, segunda) => primera.resto === segunda.resto ? primera.indice - segunda.indice : primera.resto > segunda.resto ? -1 : 1)) {
    if (faltan > 0n) { parte.valor += 1n; faltan -= 1n; }
  }
  if (partes.some((parte) => parte.valor <= 0n)) throw fallo(400, 'El importe en Bs no permite repartir todos los cargos.');
  return partes.map((parte) => Number(parte.valor) / 100);
}

exports.registrarAgrupado = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  let archivoNuevo;
  try {
    const { cargos: entrada, alumnoId, ...body } = req.body || {};
    let seleccion;
    try { seleccion = typeof entrada === 'string' ? JSON.parse(entrada) : entrada; } catch (_) { throw fallo(400, 'Revisa los cargos seleccionados.'); }
    if (!Array.isArray(seleccion) || seleccion.length < 2 || seleccion.length > 100
      || seleccion.some((item) => !item || Object.keys(item).some((key) => !['cargo', 'version'].includes(key))
        || !OBJECT_ID.test(item.cargo) || !Number.isInteger(item.version) || item.version < 0)
      || new Set(seleccion.map((item) => item.cargo)).size !== seleccion.length) throw fallo(400, 'Selecciona entre 2 y 100 cargos distintos con su version.');
    seleccion.sort((primero, segundo) => primero.cargo.localeCompare(segundo.cargo));
    if (req.user?.rol === 'usuario' && body.estado !== 'en_revision') throw fallo(403, 'Los pagos reportados deben quedar en revision.');
    const { data, huella: huellaPago } = validarRegistro({ body: { ...body, version: 0 }, file: req.file, user: req.user });
    const models = await modelosAgrupados(req);
    const huella = createHash('sha256').update(JSON.stringify({ huellaPago, seleccion, alumnoId, actor: req.user.id, rol: req.user.rol })).digest('hex');
    await models.PagoCampania.init();
    const resultado = await ejecutarConTransaccion(models.CargoCampania, async (session) => {
      const representante = await representanteAgrupado(models, req, alumnoId, session);
      const anteriores = await aplicarSession(models.PagoCampania.find({ 'agrupacion.id': data.solicitud_id }).select('+huella +modificaciones').sort({ cargo: 1 }), session).lean();
      if (anteriores.length) {
        if (anteriores.length !== seleccion.length || anteriores.some((pago, indice) => pago.huella !== huella
          || String(pago.cargo) !== seleccion[indice].cargo || pago.estado === 'eliminado' || pago.modificaciones?.length)) throw fallo(409, 'La solicitud agrupada ya fue utilizada o modificada. Consulta el historial.');
        return { pagos: anteriores.map(({ huella: privada, modificaciones, ...pago }) => pago), repetida: true };
      }
      const cargos = [];
      for (const item of seleccion) {
        const cargo = await aplicarSession(models.CargoCampania.findById(item.cargo), session).lean();
        if (!cargo) throw fallo(404, 'Un cargo no esta disponible en esta academia.');
        await verificarPropiedadCargo(models, req, cargo, session);
        const propietario = cargo.tipo_cobro === 'representante' ? cargo.representante_cobro
          : (await aplicarSession(models.Alumno.findById(cargo.alumno).select('representante'), session).lean())?.representante;
        if (String(propietario || '') !== String(representante)) throw fallo(409, 'Los cargos deben pertenecer al mismo representante.');
        const campania = await aplicarSession(models.CampaniaCobro.findById(cargo.campania), session).lean();
        if (!campania?.publicacion || campania.estado !== 'abierta' || cargo.__v !== item.version || cargo.moneda !== data.moneda
          || cargo.modalidad === 'no_aplica' || !(cargo.saldo_pendiente > 0)) throw fallo(409, 'Un cargo cambio o no admite este pago agrupado.');
        const reserva = await aplicarSession(models.PagoCampania.findOne({ cargo: cargo._id, estado: 'en_revision' }), session).lean();
        if (reserva) throw fallo(409, 'Un cargo ya tiene un pago en revision.');
        cargos.push(cargo);
      }
      const total = cargos.reduce((suma, cargo) => suma + centimos(cargo.saldo_pendiente), 0);
      if (total !== centimos(data.monto_pagado)) throw fallo(409, 'El pago agrupado debe cubrir exactamente los saldos completos seleccionados.');
      for (const id of [...new Set(cargos.map((cargo) => String(cargo.campania)))].sort()) await bloquearCampania(models, id, session);
      const tasas = await validarMetodo(models, data, session, total / 100);
      const partesBs = data.monto_pagado_bs === null ? cargos.map(() => null) : repartirBs(data.monto_pagado_bs, cargos.map((cargo) => cargo.saldo_pendiente));
      if (req.file && !archivoNuevo) archivoNuevo = await guardarComprobante(req);
      const agrupacion = { id: data.solicitud_id, representante, cargos: cargos.map((cargo) => cargo._id),
        monto_total: data.monto_pagado, monto_total_bs: data.monto_pagado_bs };
      const actor = { id: req.user.id, rol: req.user.rol };
      const pagos = [];
      for (const [indice, cargo] of cargos.entries()) {
        const { version, ...registro } = data;
        const [pago] = await models.PagoCampania.create([{ ...registro, ...tasas, huella, agrupacion, es_principal_grupo: indice === 0,
          campania: cargo.campania, cargo: cargo._id, alumno: cargo.alumno, monto_pagado: cargo.saldo_pendiente,
          monto_pagado_bs: partesBs[indice], comprobante_url: archivoNuevo?.url || '', registrado_por: actor,
          ...(data.estado === 'confirmado' ? { confirmado_por: actor, confirmado_en: new Date() } : {}) }], { session });
        if (data.estado === 'confirmado') await actualizarCargo(models, cargo, cargo.saldo_pendiente, session);
        else {
          const actualizado = await models.CargoCampania.findOneAndUpdate({ _id: cargo._id, __v: cargo.__v }, { $inc: { __v: 1 } }, { new: true, session }).lean();
          if (!actualizado) throw fallo(409, 'El cargo cambio durante el pago agrupado.');
        }
        const { huella: privada, modificaciones, ...publico } = pago.toObject();
        pagos.push(publico);
      }
      if (data.estado === 'confirmado') await actualizarCierreAutomatico(models, cargos.map((cargo) => cargo.campania), actor, session);
      return { pagos, repetida: false };
    }, { obligatoria: true });
    if (resultado.repetida && archivoNuevo) await fs.unlink(archivoNuevo.path).catch(() => {});
    const publico = req.user.rol === 'usuario' ? { ...resultado, pagos: resultado.pagos.map((pago) => ({ ...pago,
      registrado_por: { rol: pago.registrado_por.rol }, confirmado_por: pago.confirmado_por ? { rol: pago.confirmado_por.rol } : undefined })) } : resultado;
    return res.status(resultado.repetida ? 200 : 201).json(publico);
  } catch (error) {
    if (archivoNuevo && !error.hasErrorLabel?.('UnknownTransactionCommitResult')) await fs.unlink(archivoNuevo.path).catch(() => {});
    return responderError(res, error);
  }
};

async function grupoDisponible(models, req, session, corregir = false) {
  if (!UUID.test(req.params.grupoId || '')) throw fallo(400, 'El pago agrupado no es valido.');
  const pagos = await aplicarSession(models.PagoCampania.find({ 'agrupacion.id': req.params.grupoId.toLowerCase() })
    .select('+modificaciones').sort({ cargo: 1 }), session).lean();
  if (pagos.length < 2 || pagos.length !== pagos[0].agrupacion.cargos.length) throw fallo(404, 'El pago agrupado no esta disponible.');
  for (const pago of pagos) {
    const cargo = await aplicarSession(models.CargoCampania.findById(pago.cargo), session).lean();
    if (!cargo) throw fallo(404, 'Un cargo del grupo no esta disponible.');
    await verificarPropiedadCargo(models, req, cargo, session);
    if (corregir && req.user.rol === 'usuario' && (pago.registrado_por?.rol !== 'usuario' || String(pago.registrado_por.id) !== String(req.user.id))) {
      throw fallo(403, 'Solo puedes corregir los pagos agrupados que reportaste.');
    }
  }
  return pagos;
}

exports.historialAgrupado = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const models = await modelosAgrupados(req);
    const pagos = await grupoDisponible(models, req);
    const cargos = await models.CargoCampania.find({ _id: { $in: pagos.map((pago) => pago.cargo) } })
      .select('campania alumno tipo_cobro representante_cobro nombre_representante atletas_cubiertos nombres apellidos moneda saldo_pendiente __v')
      .populate('campania', 'nombre estado').sort({ _id: 1 }).lean();
    return res.json({ cargos, puede_corregir: pagos.every((pago) => pago.estado === 'en_revision'
      && (req.user.rol !== 'usuario' || (pago.registrado_por?.rol === 'usuario' && String(pago.registrado_por.id) === String(req.user.id))))
      && cargos.length === pagos.length && cargos.every((cargo) => cargo.campania?.estado === 'abierta'),
    pagos: pagos.map(({ modificaciones, ...pago }) => ({ ...pago,
      ...(req.user.rol === 'usuario' ? { registrado_por: { rol: pago.registrado_por.rol }, confirmado_por: pago.confirmado_por ? { rol: pago.confirmado_por.rol } : undefined,
        eliminado_por: undefined } : {}) })) });
  } catch (error) { return responderError(res, error); }
};

async function corregirAgrupado(req, res, eliminar) {
  res.set('Cache-Control', 'no-store');
  let archivoNuevo;
  try {
    const { cargos: entrada, ...body } = req.body || {};
    let seleccion;
    try { seleccion = typeof entrada === 'string' ? JSON.parse(entrada) : entrada; } catch (_) { throw fallo(400, 'Revisa las versiones de los cargos.'); }
    if (!Array.isArray(seleccion) || seleccion.length < 2 || seleccion.length > 100
      || seleccion.some((item) => !item || Object.keys(item).some((key) => !['cargo', 'version'].includes(key))
        || !OBJECT_ID.test(item.cargo) || !Number.isInteger(item.version) || item.version < 0)
      || new Set(seleccion.map((item) => item.cargo)).size !== seleccion.length) throw fallo(400, 'Revisa las versiones de todos los cargos.');
    if (eliminar && Object.keys(body).length) throw fallo(400, 'El retiro no admite cambios al pago.');
    const registro = eliminar ? null : validarRegistro({ body: { ...body, version: 0 }, file: req.file, user: req.user });
    if (registro && registro.data.estado !== 'en_revision') throw fallo(403, 'Solo puedes corregir transferencias pendientes de revision.');
    const models = await modelosAgrupados(req);
    const resultado = await ejecutarConTransaccion(models.CargoCampania, async (session) => {
      const pagos = await grupoDisponible(models, req, session, true);
      if (pagos.length !== seleccion.length || pagos.some((pago) => !seleccion.some((item) => item.cargo === String(pago.cargo)))) throw fallo(400, 'Incluye todos los cargos del pago agrupado.');
      if (eliminar && pagos.every((pago) => pago.estado === 'eliminado')) return { repetida: true };
      if (pagos.some((pago) => pago.estado !== 'en_revision')) throw fallo(409, 'La transferencia ya fue confirmada o retirada. No se puede corregir.');
      if (registro) {
        const anteriores = pagos.map((pago) => pago.modificaciones?.find((item) => item.solicitud_id === registro.data.solicitud_id));
        if (anteriores.some(Boolean)) {
          if (anteriores.every((item) => item?.huella === registro.huella) && pagos.every((pago) => pago.modificaciones.at(-1)?.solicitud_id === registro.data.solicitud_id)) return { repetida: true };
          throw fallo(409, 'La solicitud de correccion ya se utilizo.');
        }
        if (registro.data.solicitud_id === pagos[0].solicitud_id || registro.data.moneda !== pagos[0].moneda
          || centimos(registro.data.monto_pagado) !== centimos(pagos[0].agrupacion.monto_total)) throw fallo(400, 'Conserva la moneda y el total del pago agrupado.');
      }
      const tasas = registro ? await validarMetodo(models, registro.data, session, pagos[0].agrupacion.monto_total) : null;
      for (const id of [...new Set(pagos.map((pago) => String(pago.campania)))].sort()) await bloquearCampania(models, id, session);
      const partes = registro?.data.monto_pagado_bs != null ? repartirBs(registro.data.monto_pagado_bs, pagos.map((pago) => pago.monto_pagado)) : pagos.map(() => null);
      if (req.file && !archivoNuevo) archivoNuevo = await guardarComprobante(req);
      for (const [indice, pago] of pagos.entries()) {
        const campania = await aplicarSession(models.CampaniaCobro.findById(pago.campania), session).lean();
        const cargo = await aplicarSession(models.CargoCampania.findById(pago.cargo), session).lean();
        const ultimo = await aplicarSession(models.PagoCampania.findOne({ cargo: pago.cargo, estado: { $ne: 'eliminado' } }).sort({ createdAt: -1, _id: -1 }), session).lean();
        if (campania?.estado !== 'abierta' || !cargo || String(ultimo?._id) !== String(pago._id)
          || cargo.__v !== seleccion.find((item) => item.cargo === String(pago.cargo)).version) throw fallo(409, 'Un cargo cambio o tiene un pago posterior. Recarga el grupo.');
        const actualizado = await models.CargoCampania.findOneAndUpdate({ _id: cargo._id, __v: cargo.__v }, { $inc: { __v: 1 } }, { new: true, session }).lean();
        if (!actualizado) throw fallo(409, 'Un cargo cambio durante la correccion.');
        let cambios;
        if (eliminar) cambios = { estado: 'eliminado', eliminado_por: { id: req.user.id, rol: req.user.rol }, eliminado_en: new Date() };
        else {
          const { version, solicitud_id, monto_pagado, ...data } = registro.data;
          cambios = { ...data, ...tasas, monto_pagado_bs: partes[indice],
            'agrupacion.monto_total_bs': registro.data.monto_pagado_bs,
            ...(archivoNuevo ? { comprobante_url: archivoNuevo.url } : {}) };
        }
        const { modificaciones, ...anterior } = pago;
        const guardado = await models.PagoCampania.findOneAndUpdate({ _id: pago._id, estado: 'en_revision' }, { $set: cambios,
          ...(!eliminar ? { $push: { modificaciones: { solicitud_id: registro.data.solicitud_id, huella: registro.huella,
            anterior, actor: { id: req.user.id, rol: req.user.rol }, fecha: new Date() } } } : {}) }, { new: true, runValidators: true, session }).lean();
        if (!guardado) throw fallo(409, 'La transferencia cambio durante la correccion.');
      }
      return { repetida: false };
    }, { obligatoria: true });
    if (resultado.repetida && archivoNuevo) await fs.unlink(archivoNuevo.path).catch(() => {});
    return res.json(resultado);
  } catch (error) {
    if (archivoNuevo && !error.hasErrorLabel?.('UnknownTransactionCommitResult')) await fs.unlink(archivoNuevo.path).catch(() => {});
    return responderError(res, error);
  }
}

exports.editarAgrupado = (req, res) => corregirAgrupado(req, res, false);
exports.eliminarAgrupado = (req, res) => corregirAgrupado(req, res, true);

async function verificarPropiedad(models, req, alumnoId, session) {
  if (req.user?.rol !== 'usuario') return;
  if (!req.user.id) throw fallo(401, 'Inicia sesion nuevamente.');
  const alumno = await aplicarSession(models.Alumno.findById(alumnoId).select('usuario representante'), session).lean();
  if (!alumno || !(String(alumno.usuario || '') === String(req.user.id)
    || await userRepresentsAlumno(req.user.id, alumno, models.Representante, session))) {
    throw fallo(404, 'El cargo no esta disponible.');
  }
}

async function verificarPropiedadCargo(models, req, cargo, session) {
  if (!['representante', 'cubierto_por_representante'].includes(cargo.tipo_cobro)) return verificarPropiedad(models, req, cargo.alumno, session);
  if (req.user?.rol !== 'usuario') return;
  if (!req.user.id) throw fallo(401, 'Inicia sesion nuevamente.');
  if (!await userRepresentsAlumno(req.user.id, { representante: cargo.representante_cobro }, models.Representante, session)) {
    throw fallo(404, 'El cargo no esta disponible.');
  }
}

function respuestaPublica(req, datos) {
  if (req.user?.rol !== 'usuario') return datos;
  const cargoPublico = ({ nota_interna, ...cargo }) => cargo;
  const pagoPublico = ({ huella, modificaciones, eliminado_por, eliminado_en, registrado_por, confirmado_por, ...pago }) => ({
    ...pago, registrado_por: registrado_por ? { rol: registrado_por.rol } : undefined,
    confirmado_por: confirmado_por ? { rol: confirmado_por.rol } : undefined,
    puede_corregir: !pago.agrupacion && pago.estado === 'en_revision' && registrado_por?.rol === 'usuario'
      && String(registrado_por.id) === String(req.user.id)
  });
  return { ...datos, cargo: cargoPublico(datos.cargo),
    ...(datos.pago ? { pago: pagoPublico(datos.pago) } : {}),
    ...(datos.pagos ? { pagos: datos.pagos.map(pagoPublico) } : {}) };
}

async function modelos(req, identificarActor = true) {
  if (!OBJECT_ID.test(req.params.id) || !OBJECT_ID.test(req.params.cargoId)
    || (req.params.pagoId && !OBJECT_ID.test(req.params.pagoId))) throw fallo(400, 'El cargo o pago no es valido.');
  if (identificarActor && !req.user?.id) throw fallo(401, 'Inicia sesion nuevamente para identificar al administrador.');
  return modelosPortal(req);
}

async function cargoVigente(models, req, session, abierto = true) {
  const campania = await aplicarSession(models.CampaniaCobro.findById(req.params.id), session).lean();
  if (!campania) throw fallo(404, 'La campana no existe en esta academia.');
  if (!campania.publicacion || (abierto && campania.estado !== 'abierta')) throw fallo(409, 'La campana no admite pagos.');
  const cargo = await aplicarSession(models.CargoCampania.findOne({ _id: req.params.cargoId, campania: req.params.id }), session).lean();
  if (!cargo) throw fallo(404, 'El cargo no existe en esta campana.');
  await verificarPropiedadCargo(models, req, cargo, session);
  return cargo;
}

exports.misCargos = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    if (typeof req.query.alumnoId !== 'string' || !OBJECT_ID.test(req.query.alumnoId)) throw fallo(400, 'Indica un atleta valido.');
    const models = await modelosPortal(req);
    await verificarPropiedad(models, req, req.query.alumnoId);
    const cargos = await models.CargoCampania.find({ $or: [
      { alumno: req.query.alumnoId }, { 'atletas_cubiertos.alumno': req.query.alumnoId }
    ] })
      .select('campania alumno tipo_cobro cobertura_familiar representante_cobro nombre_representante atletas_cubiertos nombres apellidos nombre_sede moneda monto saldo_pendiente estado modalidad vencimiento permitir_abonos __v')
      .populate('campania', 'nombre descripcion moneda unidad_cobro estado publicacion.fecha').sort({ createdAt: -1, _id: -1 }).lean();
    const publicados = [];
    for (const cargo of cargos.filter((item) => item.campania?.publicacion && item.campania.estado !== 'borrador')) {
      try { await verificarPropiedadCargo(models, req, cargo); publicados.push(cargo); }
      catch (error) { if (error.status !== 404) throw error; }
    }
    const revisiones = publicados.length ? await models.PagoCampania.find({ cargo: { $in: publicados.map((cargo) => cargo._id) },
      estado: 'en_revision' }).select('cargo monto_pagado').lean() : [];
    return res.json({ cargos: publicados.map((cargo) => ({ ...cargo,
      campania: { _id: cargo.campania._id, nombre: cargo.campania.nombre, descripcion: cargo.campania.descripcion,
        moneda: cargo.campania.moneda, estado: cargo.campania.estado, unidad_cobro: cargo.campania.unidad_cobro },
      disponible: (centimos(cargo.saldo_pendiente) - revisiones.filter((pago) => String(pago.cargo) === String(cargo._id))
        .reduce((suma, pago) => suma + centimos(pago.monto_pagado), 0)) / 100,
      pago_en_revision: revisiones.some((pago) => String(pago.cargo) === String(cargo._id)) })) });
  } catch (error) { return responderError(res, error); }
};

function validarRegistro(req) {
  const body = req.body || {};
  const permitidos = ['solicitud_id', 'version', 'moneda', 'monto_pagado', 'monto_pagado_bs', 'fecha_pago',
    'metodo_pago', 'referencia', 'telefono_pago', 'cedula_titular', 'nota', 'estado'];
  if (Object.keys(body).some((key) => !permitidos.includes(key)) || typeof body.solicitud_id !== 'string' || !UUID.test(body.solicitud_id)
    || !['string', 'number'].includes(typeof body.version) || !/^\d{1,9}$/.test(String(body.version)) || !['USD', 'EUR'].includes(body.moneda)
    || !['en_revision', 'confirmado'].includes(body.estado)) throw fallo(400, 'Revisa la solicitud y el estado del pago.');
  const importe = (valor, digitos) => ['string', 'number'].includes(typeof valor)
    && new RegExp(`^(0|[1-9]\\d{0,${digitos - 1}})(\\.\\d{1,2})?$`).test(String(valor)) && Number(valor) > 0;
  if (!importe(body.monto_pagado, 9) || (body.monto_pagado_bs != null && !importe(body.monto_pagado_bs, 13))) {
    throw fallo(400, 'Indica importes positivos de hasta dos decimales.');
  }
  const fecha = new Date(`${body.fecha_pago}T12:00:00Z`);
  if (typeof body.fecha_pago !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.fecha_pago) || Number.isNaN(fecha.getTime())
    || fecha.toISOString().slice(0, 10) !== body.fecha_pago || Number(body.fecha_pago.slice(0, 4)) < 1900
    || body.fecha_pago > new Date().toISOString().slice(0, 10)) throw fallo(400, 'La fecha de pago no es valida.');
  const texto = (campo, maximo) => {
    if (body[campo] != null && (typeof body[campo] !== 'string' || body[campo].length > maximo)) throw fallo(400, `Revisa ${campo}.`);
    return (body[campo] || '').trim();
  };
  const data = { solicitud_id: body.solicitud_id.toLowerCase(), version: Number(body.version), moneda: body.moneda,
    monto_pagado: Number(body.monto_pagado), monto_pagado_bs: body.monto_pagado_bs == null ? null : Number(body.monto_pagado_bs),
    fecha_pago: body.fecha_pago, metodo_pago: texto('metodo_pago', 50), referencia: texto('referencia', 100),
    telefono_pago: texto('telefono_pago', 15), cedula_titular: texto('cedula_titular', 20), nota: texto('nota', 500), estado: body.estado };
  if (data.metodo_pago === 'Efectivo' && !['admin', 'super_admin'].includes(req.user?.rol)) {
    throw fallo(403, 'Solo los administradores pueden registrar pagos en efectivo.');
  }
  if ((!data.referencia && data.metodo_pago !== 'Efectivo') || (data.telefono_pago && !/^\d{10,15}$/.test(data.telefono_pago))
    || (data.cedula_titular && !/^[VEJG]-\d{1,15}$/i.test(data.cedula_titular))) throw fallo(400, 'Revisa la referencia y los datos del titular.');
  const archivo = req.file;
  if (archivo) {
    const buffer = archivo.buffer;
    const firma = { '.png': buffer.subarray(0, 8).toString('hex') === '89504e470d0a1a0a',
      '.jpg': buffer.subarray(0, 3).toString('hex') === 'ffd8ff', '.jpeg': buffer.subarray(0, 3).toString('hex') === 'ffd8ff',
      '.pdf': buffer.subarray(0, 5).toString() === '%PDF-',
      '.webp': buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP' };
    if (!firma[path.extname(archivo.originalname).toLowerCase()]) throw fallo(400, 'El contenido del comprobante no corresponde a una imagen o PDF valido.');
  }
  const huella = createHash('sha256').update(JSON.stringify({ ...data,
    archivo: archivo ? createHash('sha256').update(archivo.buffer).digest('hex') : '' })).digest('hex');
  return { data, huella };
}

async function validarMetodo(models, data, session, esperado) {
  if (data.metodo_pago === 'Efectivo') {
    if (data.monto_pagado_bs !== null) throw fallo(400, 'El efectivo debe registrarse en la moneda de la campana, sin monto en Bs.');
    return { tasa: null, fecha_tasa: '' };
  }
  if (['Pago movil', 'Transferencia'].includes(data.metodo_pago)) {
    if (!/^\d{6,100}$/.test(data.referencia) || !data.monto_pagado_bs) throw fallo(400, 'Indica el monto en Bs y una referencia de al menos seis digitos.');
    const historico = await obtenerTasaPagoPorFecha(data.fecha_pago, data.moneda);
    validarEquivalenteCampania(data, historico.tasa, esperado);
    return { tasa: historico.tasa, fecha_tasa: historico.fecha_tasa };
  }
  const config = await aplicarSession(models.TenantConfig.findOne({ key: 'default' }), session).lean();
  const pagos = config?.pagos?.por_concepto?.campanias?.usar_generales === false ? config.pagos.por_concepto.campanias : config?.pagos;
  const tipos = { Zelle: ['zelle', ['USD']], PayPal: ['paypal', ['USD', 'EUR']], Binance: ['binance', ['USD']] };
  const tipo = tipos[data.metodo_pago];
  if (!tipo || !tipo[1].includes(data.moneda) || !(pagos?.adicionales || []).some((cuenta) => cuenta.tipo === tipo[0]
    && cuenta.habilitado !== false && cuenta.titular && cuenta.correo) || data.monto_pagado_bs !== null
    || !/^[a-zA-Z0-9][a-zA-Z0-9 _./-]{2,99}$/.test(data.referencia)) throw fallo(400, 'El metodo o referencia no esta habilitado para esta moneda.');
  return { tasa: null, fecha_tasa: '' };
}

function responderError(res, error) {
  return res.status(error.status || (error.code === 11000 ? 409 : 500)).json({ error: error.status ? error.message
    : 'No se pudo registrar el pago. Reintenta la misma solicitud o consulta el historial.' });
}

async function guardarComprobante(req) {
  const tenantId = resolveRequestTenantId(req);
  if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) throw fallo(400, 'Academia no valida para el comprobante.');
  const nombre = `${randomUUID()}${path.extname(req.file.originalname).toLowerCase()}`;
  const carpeta = path.join(__dirname, '..', 'private-uploads', 'campanias', tenantId);
  await fs.mkdir(carpeta, { recursive: true });
  const archivo = { path: path.join(carpeta, nombre), url: `/archivos-campania/${tenantId}/${nombre}` };
  await fs.writeFile(archivo.path, req.file.buffer, { flag: 'wx' });
  return archivo;
}

exports.registrar = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  let archivoNuevo;
  try {
    if (req.user?.rol === 'usuario' && req.body?.estado !== 'en_revision') throw fallo(403, 'Los pagos reportados deben quedar en revision.');
    const { data, huella } = validarRegistro(req);
    const models = await modelos(req);
    await models.PagoCampania.init();
    const resultado = await ejecutarConTransaccion(models.CargoCampania, async (session) => {
      let cargo = await cargoVigente(models, req, session, false);
      const anterior = await aplicarSession(models.PagoCampania.findOne({ cargo: cargo._id, solicitud_id: data.solicitud_id }).select('+huella'), session).lean();
      if (anterior) {
        if (anterior.huella !== huella || anterior.estado === 'eliminado' || anterior.updatedAt > anterior.createdAt) {
          throw fallo(409, 'Esta solicitud ya corresponde a un pago modificado. Consulta el historial.');
        }
        const { huella: privada, ...pago } = anterior;
        return { cargo, pago, repetida: true };
      }
      if (cargo.modalidad === 'no_aplica' || cargo.saldo_pendiente <= 0 || cargo.__v !== data.version || cargo.moneda !== data.moneda) {
        throw fallo(409, 'El saldo, la moneda o la version del cargo cambio. Vuelve a abrirlo.');
      }
      await bloquearCampania(models, req.params.id, session);
      const pendientes = await aplicarSession(models.PagoCampania.find({ cargo: cargo._id, estado: 'en_revision' }), session).lean();
      const reservado = pendientes.reduce((suma, pago) => suma + centimos(pago.monto_pagado), 0);
      const tasas = await validarMetodo(models, data, session, (centimos(cargo.saldo_pendiente) - reservado) / 100);
      if (centimos(data.monto_pagado) + reservado > centimos(cargo.saldo_pendiente)
        || (!cargo.permitir_abonos && centimos(data.monto_pagado) !== centimos(cargo.saldo_pendiente))) {
        throw fallo(409, 'El importe supera el saldo disponible o la campana no permite abonos. Revisa los pagos en revision.');
      }
      if (req.file && !archivoNuevo) {
        archivoNuevo = await guardarComprobante(req);
      }
      const actor = { id: req.user.id, rol: req.user.rol };
      const { version, ...registro } = data;
      const [pago] = await models.PagoCampania.create([{ ...registro, ...tasas, huella, campania: req.params.id,
        cargo: cargo._id, alumno: cargo.alumno, comprobante_url: archivoNuevo?.url || '', registrado_por: actor,
        ...(data.estado === 'confirmado' ? { confirmado_por: actor, confirmado_en: new Date() } : {}) }], { session });
      if (data.estado === 'confirmado') cargo = await actualizarCargo(models, cargo, data.monto_pagado, session);
      else {
        cargo = await models.CargoCampania.findOneAndUpdate({ _id: cargo._id, __v: data.version }, { $inc: { __v: 1 } }, { new: true, session }).lean();
        if (!cargo) throw fallo(409, 'El cargo cambio. Revisa su saldo antes de registrar el pago.');
      }
      const { huella: privada, ...publico } = pago.toObject();
      if (data.estado === 'confirmado') await actualizarCierreAutomatico(models, [req.params.id], actor, session);
      return { cargo, pago: publico, repetida: false };
    }, { obligatoria: true });
    if (resultado.repetida && archivoNuevo) await fs.unlink(archivoNuevo.path).catch(() => {});
    return res.status(resultado.repetida ? 200 : 201).json(respuestaPublica(req, resultado));
  } catch (error) {
    if (archivoNuevo && !error.hasErrorLabel?.('UnknownTransactionCommitResult')) await fs.unlink(archivoNuevo.path).catch(() => {});
    return responderError(res, error);
  }
};

exports.historial = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const models = await modelos(req, false);
    const cargo = await cargoVigente(models, req, null, false);
    const pagos = await models.PagoCampania.find({ cargo: cargo._id, campania: req.params.id, estado: { $ne: 'eliminado' } }).sort({ createdAt: -1, _id: -1 }).lean();
    const en_revision = pagos.filter((pago) => pago.estado === 'en_revision').reduce((suma, pago) => suma + centimos(pago.monto_pagado), 0) / 100;
    const confirmado = pagos.filter((pago) => pago.estado === 'confirmado').reduce((suma, pago) => suma + centimos(pago.monto_pagado), 0) / 100;
    if (centimos(confirmado) + centimos(cargo.saldo_pendiente) !== centimos(cargo.monto) || en_revision > cargo.saldo_pendiente) {
      throw fallo(409, 'No se pudo verificar el saldo y el historial del cargo.');
    }
    const campania = req.user.rol !== 'usuario' ? await models.CampaniaCobro.findById(req.params.id).select('estado +cierre').lean() : null;
    const puede_corregir = Boolean(campania && (campania.estado === 'abierta' || (campania.estado === 'cerrada' && campania.cierre?.tipo === 'automatico')));
    return res.json(respuestaPublica(req, { cargo, pagos, puede_corregir, totales: { confirmado, en_revision, saldo_pendiente: cargo.saldo_pendiente,
      disponible: (centimos(cargo.saldo_pendiente) - centimos(en_revision)) / 100 } }));
  } catch (error) { return responderError(res, error); }
};

exports.comprobante = async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  try {
    const models = await modelos(req, false);
    const cargo = await cargoVigente(models, req, null, false);
    const pago = await models.PagoCampania.findOne({ _id: req.params.pagoId, cargo: cargo._id,
      campania: req.params.id, estado: { $ne: 'eliminado' } }).select('comprobante_url').lean();
    const tenantId = resolveRequestTenantId(req);
    if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) throw fallo(404, 'Comprobante no disponible.');
    const url = pago?.comprobante_url || '';
    const nombre = path.basename(url);
    if (!/^[a-f\d-]{36}\.(png|jpe?g|webp|pdf)$/i.test(nombre)) throw fallo(404, 'Comprobante no disponible.');
    let archivo;
    if (url === `/archivos-campania/${tenantId}/${nombre}`) archivo = path.join(__dirname, '..', 'private-uploads', 'campanias', tenantId, nombre);
    else if (url === `/uploads/${tenantId}/comprobantes/${nombre}`) archivo = path.join(__dirname, '..', 'uploads', tenantId, 'comprobantes', nombre);
    else throw fallo(404, 'Comprobante no disponible.');
    const contenido = await fs.readFile(archivo);
    res.set('Content-Disposition', `inline; filename="${nombre}"`);
    res.set('X-Content-Type-Options', 'nosniff');
    return res.type(path.extname(nombre)).send(contenido);
  } catch (error) {
    return responderError(res, error.code === 'ENOENT' ? fallo(404, 'Comprobante no disponible.') : error);
  }
};

exports.confirmar = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    if (Object.keys(req.body || {}).length) throw fallo(400, 'La confirmacion no admite cambios al importe.');
    const models = await modelos(req);
    const resultado = await ejecutarConTransaccion(models.CargoCampania, (session) => confirmarPagoCampania(models, {
      campaniaId: req.params.id, cargoId: req.params.cargoId, pagoId: req.params.pagoId, actor: req.user
    }, session), { obligatoria: true });
    return res.json(resultado);
  } catch (error) { return responderError(res, error); }
};

async function corregir(req, res, eliminar) {
  res.set('Cache-Control', 'no-store');
  let archivoNuevo;
  try {
    if (req.user?.rol === 'usuario' && !eliminar && req.body?.estado !== 'en_revision') {
      throw fallo(403, 'Solo puedes corregir pagos pendientes de revision.');
    }
    let registro;
    if (eliminar) {
      if (Object.keys(req.body || {}).some((campo) => campo !== 'version')
        || !['string', 'number'].includes(typeof req.body?.version) || !/^\d{1,9}$/.test(String(req.body.version))) {
        throw fallo(400, 'Indica la version del cargo para eliminar el pago.');
      }
    } else registro = validarRegistro(req);
    const models = await modelos(req);
    const resultado = await ejecutarConTransaccion(models.CargoCampania, async (session) => {
      let cargo = await cargoVigente(models, req, session, false);
      const pago = await aplicarSession(models.PagoCampania.findOne({ _id: req.params.pagoId,
        cargo: cargo._id, campania: req.params.id }).select('+modificaciones'), session).lean();
      if (!pago) throw fallo(404, 'El pago no existe en este cargo.');
      if (req.user.rol === 'usuario') {
        if (pago.registrado_por?.rol !== 'usuario' || String(pago.registrado_por.id) !== String(req.user.id)) {
          throw fallo(403, 'Solo puedes corregir los pagos que registraste.');
        }
        if (pago.estado !== 'en_revision' && !(eliminar && pago.estado === 'eliminado')) {
          throw fallo(409, 'El pago ya no esta pendiente de revision. Consulta el historial.');
        }
      }
      const publico = ({ modificaciones, huella, ...datos }) => datos;
      if (eliminar && pago.estado === 'eliminado') return { cargo, pago: publico(pago), repetida: true };
      if (pago.estado === 'eliminado') throw fallo(409, 'El pago fue eliminado. Consulta el historial.');
      if (pago.agrupacion) throw fallo(409, 'Corrige o retira la transferencia agrupada completa, no un reparto individual.');
      const repetida = !eliminar && (pago.modificaciones || []).find((item) => item.solicitud_id === registro.data.solicitud_id);
      if (repetida) {
        if (repetida.huella !== registro.huella) throw fallo(409, 'Esta solicitud ya corresponde a otra correccion.');
        if (pago.modificaciones[pago.modificaciones.length - 1].solicitud_id !== registro.data.solicitud_id) {
          throw fallo(409, 'El pago tiene una correccion posterior. Consulta el historial.');
        }
        return { cargo, pago: publico(pago), repetida: true };
      }
      await bloquearCampania(models, req.params.id, session, req.user.rol !== 'usuario');
      if (eliminar || centimos(registro.data.monto_pagado) !== centimos(pago.monto_pagado)) {
        const cubierto = await aplicarSession(models.CargoCampania.findOne({
          campania: cargo.campania, 'cobertura_familiar.cargo': cargo._id
        }).select('_id'), session).lean();
        if (cubierto) throw fallo(409, 'Este pago cubre a otros atletas del representante. No puedes eliminarlo ni cambiar su importe sin resolver primero la cobertura familiar.');
      }
      const activos = await aplicarSession(models.PagoCampania.find({ cargo: cargo._id,
        campania: req.params.id, estado: { $ne: 'eliminado' } }).sort({ createdAt: -1, _id: -1 }), session).lean();
      if (String(activos[0]?._id) !== String(pago._id)) throw fallo(409, 'Solo puedes modificar o eliminar el ultimo pago registrado.');
      if (cargo.__v !== Number(req.body.version) || cargo.modalidad === 'no_aplica' || pago.moneda !== cargo.moneda) {
        throw fallo(409, 'El cargo cambio. Reabre el historial.');
      }
      const confirmados = activos.filter((item) => item.estado === 'confirmado').reduce((suma, item) => suma + centimos(item.monto_pagado), 0);
      const reservas = activos.filter((item) => item.estado === 'en_revision').reduce((suma, item) => suma + centimos(item.monto_pagado), 0);
      if (confirmados + centimos(cargo.saldo_pendiente) !== centimos(cargo.monto) || reservas > centimos(cargo.saldo_pendiente)) {
        throw fallo(409, 'No se pudo verificar el saldo del cargo.');
      }
      let cambios;
      let saldo = centimos(cargo.saldo_pendiente) + (pago.estado === 'confirmado' ? centimos(pago.monto_pagado) : 0);
      if (eliminar) cambios = { estado: 'eliminado', eliminado_por: { id: req.user.id, rol: req.user.rol }, eliminado_en: new Date() };
      else {
        const { version, solicitud_id, ...datos } = registro.data;
        if (datos.moneda !== cargo.moneda || datos.estado !== pago.estado || solicitud_id === pago.solicitud_id) {
          throw fallo(400, 'La correccion no puede cambiar moneda o estado y necesita una solicitud nueva.');
        }
        const reservado = reservas - (pago.estado === 'en_revision' ? centimos(pago.monto_pagado) : 0);
        if (centimos(datos.monto_pagado) + reservado > saldo || (!cargo.permitir_abonos && centimos(datos.monto_pagado) !== saldo)) {
          throw fallo(409, 'El importe supera el saldo disponible o la campana no permite abonos.');
        }
        cambios = { ...datos, ...await validarMetodo(models, datos, session, (saldo - reservado) / 100) };
        if (pago.estado === 'confirmado') saldo -= centimos(datos.monto_pagado);
        if (req.file && !archivoNuevo) archivoNuevo = await guardarComprobante(req);
        if (archivoNuevo) cambios.comprobante_url = archivoNuevo.url;
      }
      cargo = await models.CargoCampania.findOneAndUpdate({ _id: cargo._id, __v: cargo.__v,
        saldo_pendiente: cargo.saldo_pendiente, estado: cargo.estado }, { $set: { saldo_pendiente: saldo / 100,
        estado: saldo === 0 ? 'pagado' : saldo === centimos(cargo.monto) ? 'pendiente' : 'abono' }, $inc: { __v: 1 } },
      { new: true, runValidators: true, session }).lean();
      if (!cargo) throw fallo(409, 'El cargo cambio. Reabre el historial.');
      const guardado = await models.PagoCampania.findOneAndUpdate({ _id: pago._id, estado: pago.estado }, {
        $set: cambios, ...(!eliminar ? { $push: { modificaciones: { solicitud_id: registro.data.solicitud_id,
          huella: registro.huella, anterior: publico(pago), actor: { id: req.user.id, rol: req.user.rol }, fecha: new Date() } } } : {})
      }, { new: true, runValidators: true, session }).lean();
      if (!guardado) throw fallo(409, 'El pago cambio. Reabre el historial.');
      await actualizarCierreAutomatico(models, [req.params.id], req.user, session);
      return { cargo, pago: publico(guardado), repetida: false };
    }, { obligatoria: true });
    if (resultado.repetida && archivoNuevo) await fs.unlink(archivoNuevo.path).catch(() => {});
    return res.json(respuestaPublica(req, resultado));
  } catch (error) {
    if (archivoNuevo && !error.hasErrorLabel?.('UnknownTransactionCommitResult')) await fs.unlink(archivoNuevo.path).catch(() => {});
    return responderError(res, error);
  }
}

exports.editar = (req, res) => corregir(req, res, false);
exports.eliminar = (req, res) => corregir(req, res, true);