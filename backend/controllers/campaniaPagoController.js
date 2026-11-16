const { createHash, randomUUID } = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const { ejecutarConTransaccion, aplicarSession } = require('../services/financeTransaction');
const { obtenerTasaPagoPorFecha } = require('../services/paymentExchangeRate');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');

const OBJECT_ID = /^[a-f\d]{24}$/i;
const UUID = /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
const fallo = (status, message) => Object.assign(new Error(message), { status });
const centimos = (monto) => Math.round(monto * 100);

async function modelos(req, identificarActor = true) {
  if (!OBJECT_ID.test(req.params.id) || !OBJECT_ID.test(req.params.cargoId)
    || (req.params.pagoId && !OBJECT_ID.test(req.params.pagoId))) throw fallo(400, 'El cargo o pago no es valido.');
  if (identificarActor && !req.user?.id) throw fallo(401, 'Inicia sesion nuevamente para identificar al administrador.');
  const connection = await getTenantBusinessConnection(req.tenant || { tenantId: req.tenantId });
  return Object.fromEntries(['CampaniaCobro', 'CargoCampania', 'PagoCampania', 'TenantConfig']
    .map((nombre) => [nombre, getTenantModel(connection, nombre)]));
}

async function cargoVigente(models, req, session, abierto = true) {
  const campania = await aplicarSession(models.CampaniaCobro.findById(req.params.id), session).lean();
  if (!campania) throw fallo(404, 'La campana no existe en esta academia.');
  if (!campania.publicacion || (abierto && campania.estado !== 'abierta')) throw fallo(409, 'La campana no admite pagos.');
  const cargo = await aplicarSession(models.CargoCampania.findOne({ _id: req.params.cargoId, campania: req.params.id }), session).lean();
  if (!cargo) throw fallo(404, 'El cargo no existe en esta campana.');
  return cargo;
}

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
  if (!data.referencia || (data.telefono_pago && !/^\d{10,15}$/.test(data.telefono_pago))
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

async function validarMetodo(models, data, session) {
  if (['Pago movil', 'Transferencia'].includes(data.metodo_pago)) {
    if (!/^\d{6,100}$/.test(data.referencia) || !data.monto_pagado_bs) throw fallo(400, 'Indica el monto en Bs y una referencia de al menos seis digitos.');
    const historico = await obtenerTasaPagoPorFecha(data.fecha_pago, data.moneda);
    if (centimos(data.monto_pagado) !== Math.round(data.monto_pagado_bs * 100 / historico.tasa)) {
      throw fallo(409, 'El equivalente no coincide con la tasa oficial de la fecha. Reabre el formulario.');
    }
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

async function actualizarCargo(models, cargo, monto, session) {
  const saldo = (centimos(cargo.saldo_pendiente) - centimos(monto)) / 100;
  if (saldo < 0 || (!cargo.permitir_abonos && saldo !== 0)) throw fallo(409, 'El pago supera el saldo o la campana no permite abonos.');
  const guardado = await models.CargoCampania.findOneAndUpdate({ _id: cargo._id, __v: cargo.__v,
    saldo_pendiente: cargo.saldo_pendiente, estado: cargo.estado }, { $set: { saldo_pendiente: saldo,
    estado: saldo === 0 ? 'pagado' : 'abono' }, $inc: { __v: 1 } }, { new: true, runValidators: true, session }).lean();
  if (!guardado) throw fallo(409, 'El cargo cambio. Revisa su saldo antes de registrar el pago.');
  return guardado;
}

function responderError(res, error) {
  return res.status(error.status || (error.code === 11000 ? 409 : 500)).json({ error: error.status ? error.message
    : 'No se pudo registrar el pago. Reintenta la misma solicitud o consulta el historial.' });
}

async function guardarComprobante(req) {
  const tenantId = resolveRequestTenantId(req);
  if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) throw fallo(400, 'Academia no valida para el comprobante.');
  const nombre = `${randomUUID()}${path.extname(req.file.originalname).toLowerCase()}`;
  const carpeta = path.join(__dirname, '..', 'uploads', tenantId, 'comprobantes');
  await fs.mkdir(carpeta, { recursive: true });
  const archivo = { path: path.join(carpeta, nombre), url: `/uploads/${tenantId}/comprobantes/${nombre}` };
  await fs.writeFile(archivo.path, req.file.buffer, { flag: 'wx' });
  return archivo;
}

exports.registrar = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  let archivoNuevo;
  try {
    const { data, huella } = validarRegistro(req);
    const models = await modelos(req);
    await models.PagoCampania.init();
    const resultado = await ejecutarConTransaccion(models.CargoCampania, async (session) => {
      let cargo = await cargoVigente(models, req, session);
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
      const tasas = await validarMetodo(models, data, session);
      const pendientes = await aplicarSession(models.PagoCampania.find({ cargo: cargo._id, estado: 'en_revision' }), session).lean();
      const reservado = pendientes.reduce((suma, pago) => suma + centimos(pago.monto_pagado), 0);
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
      return { cargo, pago: publico, repetida: false };
    }, { obligatoria: true });
    if (resultado.repetida && archivoNuevo) await fs.unlink(archivoNuevo.path).catch(() => {});
    return res.status(resultado.repetida ? 200 : 201).json(resultado);
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
    return res.json({ cargo, pagos, totales: { confirmado, en_revision, saldo_pendiente: cargo.saldo_pendiente,
      disponible: (centimos(cargo.saldo_pendiente) - centimos(en_revision)) / 100 } });
  } catch (error) { return responderError(res, error); }
};

exports.confirmar = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    if (Object.keys(req.body || {}).length) throw fallo(400, 'La confirmacion no admite cambios al importe.');
    const models = await modelos(req);
    const resultado = await ejecutarConTransaccion(models.CargoCampania, async (session) => {
      let cargo = await cargoVigente(models, req, session);
      const pago = await aplicarSession(models.PagoCampania.findOne({ _id: req.params.pagoId, cargo: cargo._id,
        campania: req.params.id }), session).lean();
      if (!pago) throw fallo(404, 'El pago no existe en este cargo.');
      if (pago.estado === 'eliminado') throw fallo(409, 'El pago fue eliminado. Consulta el historial.');
      if (pago.estado === 'confirmado') return { cargo, pago, repetida: true };
      if (cargo.modalidad === 'no_aplica' || pago.moneda !== cargo.moneda) throw fallo(409, 'El cargo no admite la confirmacion.');
      cargo = await actualizarCargo(models, cargo, pago.monto_pagado, session);
      const confirmado = await models.PagoCampania.findOneAndUpdate({ _id: pago._id, estado: 'en_revision' }, {
        $set: { estado: 'confirmado', confirmado_por: { id: req.user.id, rol: req.user.rol }, confirmado_en: new Date() }
      }, { new: true, runValidators: true, session }).lean();
      if (!confirmado) throw fallo(409, 'El pago cambio. Consulta el historial.');
      return { cargo, pago: confirmado, repetida: false };
    }, { obligatoria: true });
    return res.json(resultado);
  } catch (error) { return responderError(res, error); }
};

async function corregir(req, res, eliminar) {
  res.set('Cache-Control', 'no-store');
  let archivoNuevo;
  try {
    let registro;
    if (eliminar) {
      if (Object.keys(req.body || {}).some((campo) => campo !== 'version')
        || !['string', 'number'].includes(typeof req.body?.version) || !/^\d{1,9}$/.test(String(req.body.version))) {
        throw fallo(400, 'Indica la version del cargo para eliminar el pago.');
      }
    } else registro = validarRegistro(req);
    const models = await modelos(req);
    const resultado = await ejecutarConTransaccion(models.CargoCampania, async (session) => {
      let cargo = await cargoVigente(models, req, session);
      const pago = await aplicarSession(models.PagoCampania.findOne({ _id: req.params.pagoId,
        cargo: cargo._id, campania: req.params.id }).select('+modificaciones'), session).lean();
      if (!pago) throw fallo(404, 'El pago no existe en este cargo.');
      const publico = ({ modificaciones, huella, ...datos }) => datos;
      if (eliminar && pago.estado === 'eliminado') return { cargo, pago: publico(pago), repetida: true };
      if (pago.estado === 'eliminado') throw fallo(409, 'El pago fue eliminado. Consulta el historial.');
      const repetida = !eliminar && (pago.modificaciones || []).find((item) => item.solicitud_id === registro.data.solicitud_id);
      if (repetida) {
        if (repetida.huella !== registro.huella) throw fallo(409, 'Esta solicitud ya corresponde a otra correccion.');
        if (pago.modificaciones[pago.modificaciones.length - 1].solicitud_id !== registro.data.solicitud_id) {
          throw fallo(409, 'El pago tiene una correccion posterior. Consulta el historial.');
        }
        return { cargo, pago: publico(pago), repetida: true };
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
        cambios = { ...datos, ...await validarMetodo(models, datos, session) };
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
      return { cargo, pago: publico(guardado), repetida: false };
    }, { obligatoria: true });
    if (resultado.repetida && archivoNuevo) await fs.unlink(archivoNuevo.path).catch(() => {});
    return res.json(resultado);
  } catch (error) {
    if (archivoNuevo && !error.hasErrorLabel?.('UnknownTransactionCommitResult')) await fs.unlink(archivoNuevo.path).catch(() => {});
    return responderError(res, error);
  }
}

exports.editar = (req, res) => corregir(req, res, false);
exports.eliminar = (req, res) => corregir(req, res, true);