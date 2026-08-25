const mongoose = require('mongoose');
const UniformePedido = require('../models/UniformePedido');
const Uniforme = require('../models/Uniforme');
const Alumno = require('../models/Alumno');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');
const { getDefaultPermissionsByLegacyRole } = require('../config/permissions');

const ESTADOS_PEDIDO = {
  PENDIENTE: 'pendiente',
  ESPERANDO_PAGO: 'esperando_pago',
  ABONO: 'abono',
  PAGO_EN_REVISION: 'pago_en_revision',
  VERIFICADO: 'verificado',
  ENTREGADO: 'entregado',
  CANCELADO: 'cancelado'
};
const MONTO_TOLERANCIA_BS = 100;

function redondearMonto(valor) {
  return Number((Number(valor) || 0).toFixed(2));
}

function calcularToleranciaDivisaDesdeBs(montoDivisa, montoBs) {
  const montoDivisaNum = Number(montoDivisa);
  const montoBsNum = Number(montoBs);
  if (!Number.isFinite(montoDivisaNum) || montoDivisaNum <= 0) return 0;
  if (!Number.isFinite(montoBsNum) || montoBsNum <= 0) return 0;

  const tasaAplicada = montoBsNum / montoDivisaNum;
  if (!Number.isFinite(tasaAplicada) || tasaAplicada <= 0) return 0;

  return redondearMonto(MONTO_TOLERANCIA_BS / tasaAplicada);
}

function buildComprobanteUrl(file, tenantIdInput) {
  if (!file?.filename) return null;
  const tenantId = resolveRequestTenantId({ tenantId: tenantIdInput });
  return `/uploads/${tenantId}/comprobantes/${file.filename}`;
}

function normalizeMoneda(moneda) {
  return String(moneda || 'USD').trim().toUpperCase() === 'EUR' ? 'EUR' : 'USD';
}

function normalizeGeneroAlumno(sexoRaw) {
  const sexo = String(sexoRaw || '').trim().toLowerCase();
  if (sexo.startsWith('masc')) return 'masculino';
  if (sexo.startsWith('fem')) return 'femenino';
  return 'mixto';
}

function resolveGeneroPrecioVariante(generoRaw, sexoAlumnoRaw) {
  const genero = String(generoRaw || '').trim().toLowerCase();
  if (genero === 'masculino' || genero === 'femenino' || genero === 'mixto') {
    return genero;
  }
  return normalizeGeneroAlumno(sexoAlumnoRaw);
}

function resolvePrecioUniformePorVariante(uniforme, tallaRaw, sexoAlumnoRaw) {
  const precioBase = Number(uniforme?.precio) || 0;
  const variantesActivas = uniforme?.variantes_precio_activo === true;
  const variantes = Array.isArray(uniforme?.precios_variantes) ? uniforme.precios_variantes : [];

  if (!variantesActivas || variantes.length === 0) {
    return precioBase;
  }

  const talla = String(tallaRaw || '').trim().toUpperCase();
  const generoAlumno = normalizeGeneroAlumno(sexoAlumnoRaw);

  const matchExacto = variantes.find((item) =>
    String(item?.talla || '').trim().toUpperCase() === talla
    && String(item?.genero || '').trim().toLowerCase() === generoAlumno
  );
  if (matchExacto && Number.isFinite(Number(matchExacto.precio))) {
    return Number(matchExacto.precio);
  }

  const matchMixto = variantes.find((item) =>
    String(item?.talla || '').trim().toUpperCase() === talla
    && String(item?.genero || '').trim().toLowerCase() === 'mixto'
  );
  if (matchMixto && Number.isFinite(Number(matchMixto.precio))) {
    return Number(matchMixto.precio);
  }

  return precioBase;
}

function resolvePedidoPrenda(pedidoDoc) {
  const pedido = typeof pedidoDoc?.toObject === 'function' ? pedidoDoc.toObject() : { ...pedidoDoc };
  const prendaCatalogo = String(pedido?.uniforme?.prenda || '').trim();
  const prendaHistorica = String(pedido?.prenda || '').trim();
  return {
    ...pedido,
    prenda: prendaCatalogo || prendaHistorica || ''
  };
}

async function findPedidoByIdWithRelations(TenantUniformePedido, id) {
  return TenantUniformePedido.findById(id)
    .populate('alumno')
    .populate('sede')
    .populate('solicitado_por')
    .populate('uniforme', 'prenda precio moneda lleva_nombre_atleta lleva_personalizacion_nombre lleva_numero_franela franela_representante');
}

exports.actualizarPedidoUniforme = async (req, res) => {
  try {
    const {
      UniformePedido: TenantUniformePedido,
      Uniforme: TenantUniforme,
      Alumno: TenantAlumno
    } = await getTenantUniformePedidoModels(req);

    const pedido = await TenantUniformePedido.findById(req.params.id);
    if (!pedido) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    const rolUsuario = String(req.user?.rol || '').trim().toLowerCase();
    const esUsuarioFinal = rolUsuario === 'usuario';
    const permisosUsuario = Array.isArray(req.user?.permisos)
      ? req.user.permisos
      : getDefaultPermissionsByLegacyRole(rolUsuario);
    const tienePermisoGestion = permisosUsuario
      .map((permiso) => String(permiso || '').trim().toLowerCase())
      .includes('solicitudes_uniformes.manage');

    if (esUsuarioFinal) {
      const alumnoPedido = await TenantAlumno.findById(pedido.alumno).select('usuario representante');
      if (!alumnoPedido) {
        return res.status(404).json({ error: 'Alumno no encontrado para esta solicitud' });
      }

      let esPropietario = alumnoPedido.usuario && String(alumnoPedido.usuario) === String(req.user.id);
      if (!esPropietario && alumnoPedido.representante) {
        const RepresentanteModel = getTenantModel((await getTenantBusinessConnection(req.tenant || { tenantId: req.tenantId })), 'Representante');
        const representante = await RepresentanteModel.findById(alumnoPedido.representante).select('usuario');
        esPropietario = !!representante && String(representante.usuario) === String(req.user.id);
      }

      if (!esPropietario) {
        return res.status(403).json({ error: 'No tienes permiso para editar esta solicitud' });
      }
    } else if (!tienePermisoGestion) {
      return res.status(403).json({ msg: 'No tienes permisos suficientes para esta acción' });
    }

    if (pedido.estado !== ESTADOS_PEDIDO.PENDIENTE) {
      return res.status(400).json({ error: 'Solo se puede editar una solicitud pendiente' });
    }

    const body = req.body || {};
    const { uniformeId, talla, nombrePersonalizado, numeroFranela, precio, moneda, generoPrecioVariante } = body;
  let uniformeActualizado = null;
  let cambioTalla = false;
  let cambioGeneroPrecio = false;

    if (uniformeId !== undefined && uniformeId !== null && String(uniformeId).trim()) {
      const uniformeIdNormalizado = String(uniformeId).trim();
      if (!mongoose.Types.ObjectId.isValid(uniformeIdNormalizado)) {
        return res.status(400).json({ error: 'uniformeId inválido' });
      }

      const uniforme = await TenantUniforme.findById(uniformeIdNormalizado)
        .select('_id prenda precio moneda variantes_precio_activo precios_variantes');
      if (!uniforme) {
        return res.status(404).json({ error: 'Prenda no encontrada en el catalogo' });
      }

      pedido.uniforme = uniforme._id;
      pedido.prenda = String(uniforme.prenda || '').trim();
      uniformeActualizado = uniforme;

      if (precio === undefined || precio === null || String(precio).trim() === '') {
        pedido.precio = Number(uniforme.precio) || 0;
      }
      if (moneda === undefined || moneda === null || String(moneda).trim() === '') {
        pedido.moneda = normalizeMoneda(uniforme.moneda);
      }
    }

    if (talla !== undefined) {
      const tallaNormalizada = String(talla || '').trim().toUpperCase();
      if (!tallaNormalizada) {
        return res.status(400).json({ error: 'La talla es requerida' });
      }
      pedido.talla = tallaNormalizada;
      cambioTalla = true;
    }

    if (nombrePersonalizado !== undefined) {
      const nombre = String(nombrePersonalizado || '').trim().toUpperCase();
      pedido.nombre_personalizado = nombre || undefined;
    }

    if (numeroFranela !== undefined) {
      const numeroNormalizado = String(numeroFranela || '').trim();
      if (!numeroNormalizado) {
        pedido.numero_franela = null;
      } else {
        const numero = Number(numeroNormalizado);
        if (!Number.isInteger(numero) || numero < 1 || numero > 100) {
          return res.status(400).json({ error: 'numeroFranela invalido. Debe estar entre 1 y 100' });
        }
        pedido.numero_franela = String(numero);
      }
    }

    if (precio !== undefined) {
      const precioNumerico = Number(precio);
      if (!Number.isFinite(precioNumerico) || precioNumerico < 0) {
        return res.status(400).json({ error: 'Precio invalido para la solicitud' });
      }
      pedido.precio = precioNumerico;
      if (pedido.estado === ESTADOS_PEDIDO.ESPERANDO_PAGO && (Number(pedido.monto_pagado) || 0) <= 0) {
        pedido.saldo_pendiente = precioNumerico;
      }
    }

    if (moneda !== undefined) {
      pedido.moneda = normalizeMoneda(moneda);
    }

    if (generoPrecioVariante !== undefined) {
      const alumno = await TenantAlumno.findById(pedido.alumno).select('sexo');
      const generoPrecio = resolveGeneroPrecioVariante(generoPrecioVariante, alumno?.sexo);
      pedido.genero_precio_variante = generoPrecio;
      cambioGeneroPrecio = true;
    }

    if (precio === undefined || precio === null || String(precio).trim() === '') {
      if (!uniformeActualizado && pedido.uniforme && mongoose.Types.ObjectId.isValid(String(pedido.uniforme))) {
        uniformeActualizado = await TenantUniforme.findById(pedido.uniforme)
          .select('_id prenda precio moneda variantes_precio_activo precios_variantes');
      }

      if (uniformeActualizado && (cambioTalla || uniformeId !== undefined || cambioGeneroPrecio)) {
        const alumno = await TenantAlumno.findById(pedido.alumno).select('sexo');
        const generoPrecio = resolveGeneroPrecioVariante(generoPrecioVariante ?? pedido.genero_precio_variante, alumno?.sexo);
        const precioCalculado = resolvePrecioUniformePorVariante(uniformeActualizado, pedido.talla, generoPrecio);
        pedido.precio = precioCalculado;
        pedido.genero_precio_variante = generoPrecio;
      }
    }

    await pedido.save();
    const pedidoActualizado = await findPedidoByIdWithRelations(TenantUniformePedido, pedido._id);
    return res.json(resolvePedidoPrenda(pedidoActualizado));
  } catch (err) {
    return res.status(400).json({ error: 'Error al actualizar la solicitud de uniforme', detalle: err.message });
  }
};

async function getTenantUniformePedidoModels(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);

  const models = {
    UniformePedido: getTenantModel(connection, 'UniformePedido'),
    Uniforme: getTenantModel(connection, 'Uniforme'),
    Alumno: getTenantModel(connection, 'Alumno')
  };

  // Registrar modelos referenciados para populate en la misma conexion.
  getTenantModel(connection, 'User');
  getTenantModel(connection, 'Sede');

  return models;
}

exports.createPedidoUniforme = async (req, res) => {
  try {
    const {
      UniformePedido: TenantUniformePedido,
      Uniforme: TenantUniforme,
      Alumno: TenantAlumno
    } = await getTenantUniformePedidoModels(req);

    const {
      alumnoId,
      sedeId,
      uniformeId,
      prenda,
      talla,
      nombrePersonalizado,
      numeroFranela,
      generoPrecioVariante,
    } = req.body;

    if (!alumnoId || !talla || (!uniformeId && !prenda)) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    if (!mongoose.Types.ObjectId.isValid(alumnoId)) {
      return res.status(400).json({ error: 'alumnoId inválido' });
    }
    if (sedeId && !mongoose.Types.ObjectId.isValid(sedeId)) {
      return res.status(400).json({ error: 'sedeId inválido' });
    }
    if (uniformeId && !mongoose.Types.ObjectId.isValid(uniformeId)) {
      return res.status(400).json({ error: 'uniformeId inválido' });
    }

    const uniforme = uniformeId
      ? await TenantUniforme.findById(uniformeId)
      : await TenantUniforme.findOne({ prenda });
    if (!uniforme) {
      return res.status(404).json({ error: 'Prenda no encontrada en el catalogo' });
    }
    const prendaActual = String(uniforme.prenda || '').trim();
    const moneda = String(uniforme?.moneda || 'USD').toUpperCase() === 'EUR' ? 'EUR' : 'USD';
    const llevaNombreAtleta = uniforme?.lleva_nombre_atleta === true;
    const esFranelaRepresentante = uniforme?.franela_representante === true;
    const requiereNombrePersonalizado = llevaNombreAtleta || esFranelaRepresentante;
    const requiereNumeroFranela = uniforme?.lleva_numero_franela !== false;
    const alumno = await TenantAlumno.findById(alumnoId).select('numero_franela categoria activo sexo');

    if (!alumno) {
      return res.status(404).json({ error: 'Alumno no encontrado' });
    }

    const generoPrecio = resolveGeneroPrecioVariante(generoPrecioVariante, alumno?.sexo);
    const precio = resolvePrecioUniformePorVariante(uniforme, talla, generoPrecio);

    let numeroFranelaPedido = null;

    if (requiereNumeroFranela) {
      numeroFranelaPedido = Number(alumno.numero_franela);

      if (!Number.isInteger(numeroFranelaPedido) || numeroFranelaPedido < 1 || numeroFranelaPedido > 100) {
        const numeroSolicitado = Number(numeroFranela);
        if (!Number.isInteger(numeroSolicitado) || numeroSolicitado < 1 || numeroSolicitado > 100) {
          return res.status(400).json({ error: 'Debes seleccionar un numero de franela valido (1-100).' });
        }

        const categoria = String(alumno.categoria || '').trim();
        if (!categoria) {
          return res.status(400).json({ error: 'El alumno no tiene categoria asignada para validar numero de franela.' });
        }

        const numeroOcupado = await TenantAlumno.findOne({
          _id: { $ne: alumno._id },
          activo: { $ne: false },
          categoria: { $regex: new RegExp(`^${String(categoria).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          numero_franela: numeroSolicitado
        }).select('_id');

        if (numeroOcupado) {
          return res.status(409).json({ error: `El numero de franela ${numeroSolicitado} ya esta ocupado en la categoria ${categoria}.` });
        }

        alumno.numero_franela = numeroSolicitado;
        await alumno.save();
        numeroFranelaPedido = numeroSolicitado;
      }
    }

    const pedido = await TenantUniformePedido.create({
      alumno: alumnoId,
      sede: sedeId || undefined,
      uniforme: uniforme._id,
      prenda: prendaActual,
      moneda,
      genero_precio_variante: generoPrecio,
      nombre_personalizado: requiereNombrePersonalizado ? (String(nombrePersonalizado || '').trim().toUpperCase() || undefined) : undefined,
      numero_franela: requiereNumeroFranela ? String(numeroFranelaPedido) : null,
      precio,
      talla,
      estado: ESTADOS_PEDIDO.PENDIENTE,
      solicitado_por: req.user?.id
    });

    const pedidoCreado = await findPedidoByIdWithRelations(TenantUniformePedido, pedido._id);
    res.status(201).json(resolvePedidoPrenda(pedidoCreado));
  } catch (err) {
    res.status(400).json({ error: 'Error al crear pedido de uniforme', detalle: err.message });
  }
};

exports.getMisPedidosUniforme = async (req, res) => {
  try {
    const { UniformePedido: TenantUniformePedido } = await getTenantUniformePedidoModels(req);
    const filtro = {
      solicitado_por: req.user?.id,
      estado: {
        $in: [
          ESTADOS_PEDIDO.PENDIENTE,
          ESTADOS_PEDIDO.ESPERANDO_PAGO,
          ESTADOS_PEDIDO.ABONO,
          ESTADOS_PEDIDO.PAGO_EN_REVISION,
          ESTADOS_PEDIDO.VERIFICADO,
          ESTADOS_PEDIDO.ENTREGADO,
          ESTADOS_PEDIDO.CANCELADO
        ]
      }
    };

    if (req.query.alumnoId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.alumnoId)) {
        return res.status(400).json({ error: 'alumnoId inválido' });
      }
      filtro.alumno = req.query.alumnoId;
    }

    const pedidos = await TenantUniformePedido.find(filtro)
      .populate('alumno')
      .populate('sede')
      .populate('uniforme', 'prenda precio moneda')
      .sort({ createdAt: -1 });

    res.json(pedidos.map(resolvePedidoPrenda));
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener tus pedidos de uniformes' });
  }
};

exports.getPedidosUniforme = async (req, res) => {
  try {
    const { UniformePedido: TenantUniformePedido } = await getTenantUniformePedidoModels(req);
    const filtro = {};

    if (req.query.sedeId) {
      if (!mongoose.Types.ObjectId.isValid(req.query.sedeId)) {
        return res.status(400).json({ error: 'sedeId inválido' });
      }
      filtro.sede = req.query.sedeId;
    }

    const pedidos = await TenantUniformePedido.find(filtro)
      .populate('alumno')
      .populate('sede')
      .populate('solicitado_por')
      .populate('uniforme', 'prenda precio moneda')
      .sort({ createdAt: -1 });
    res.json(pedidos.map(resolvePedidoPrenda));
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener pedidos de uniformes' });
  }
};

exports.solicitarPagoPedido = async (req, res) => {
  try {
    const { UniformePedido: TenantUniformePedido } = await getTenantUniformePedidoModels(req);
    const precio = Number(req.body?.precio);
    if (!precio || Number.isNaN(precio) || precio <= 0) {
      return res.status(400).json({ error: 'Precio inválido' });
    }

    const pedido = await TenantUniformePedido.findById(req.params.id);
    if (!pedido) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    if (pedido.estado !== ESTADOS_PEDIDO.PENDIENTE) {
      return res.status(400).json({ error: 'Solo se puede solicitar pago para pedidos pendientes' });
    }

    pedido.precio = precio;
    pedido.monto_pagado = 0;
    pedido.monto_pagado_bs = 0;
    pedido.monto_ultimo_pago = 0;
    pedido.monto_ultimo_pago_bs = 0;
    pedido.saldo_pendiente = precio;
    pedido.estado = ESTADOS_PEDIDO.ESPERANDO_PAGO;
    await pedido.save();

    const pedidoActualizado = await findPedidoByIdWithRelations(TenantUniformePedido, pedido._id);

    res.json(resolvePedidoPrenda(pedidoActualizado));
  } catch (err) {
    res.status(400).json({ error: 'Error al solicitar pago del pedido', detalle: err.message });
  }
};

exports.cancelarPedido = async (req, res) => {
  try {
    const { UniformePedido: TenantUniformePedido } = await getTenantUniformePedidoModels(req);
    const pedido = await TenantUniformePedido.findOne({
      _id: req.params.id,
      solicitado_por: req.user?.id,
      estado: { $in: [ESTADOS_PEDIDO.PENDIENTE, ESTADOS_PEDIDO.ESPERANDO_PAGO] }
    });

    if (!pedido) {
      return res.status(404).json({ error: 'Pedido no encontrado o no se puede cancelar' });
    }

    pedido.estado = ESTADOS_PEDIDO.CANCELADO;
    await pedido.save();
    const pedidoActualizado = await findPedidoByIdWithRelations(TenantUniformePedido, pedido._id);
    res.json(resolvePedidoPrenda(pedidoActualizado));
  } catch (err) {
    res.status(400).json({ error: 'Error al cancelar pedido' });
  }
};

exports.registrarPagoPedido = async (req, res) => {
  try {
    const { UniformePedido: TenantUniformePedido } = await getTenantUniformePedidoModels(req);
    const { metodo_pago, referencia, fecha_pago, monto_pagado, monto_pagado_bs, telefono_pago, cedula_titular, nota } = req.body;
    const pedido = await TenantUniformePedido.findById(req.params.id);

    if (!pedido) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    const rolUsuario = String(req.user?.rol || '').trim().toLowerCase();
    const permisosToken = Array.isArray(req.user?.permisos) ? req.user.permisos : [];
    const permisosRol = getDefaultPermissionsByLegacyRole(rolUsuario);
    const permisosUsuario = new Set(
      [...permisosToken, ...permisosRol]
        .map((permiso) => String(permiso || '').trim().toLowerCase())
        .filter(Boolean)
    );

    const puedeGestionar = permisosUsuario.has('solicitudes_uniformes.manage');
    const esPropietario = String(pedido?.solicitado_por || '') === String(req.user?.id || '');

    if (!puedeGestionar && !esPropietario) {
      return res.status(403).json({ error: 'No tienes permiso para registrar pago en esta solicitud' });
    }

    if (![ESTADOS_PEDIDO.ESPERANDO_PAGO, ESTADOS_PEDIDO.ABONO].includes(String(pedido.estado || '').trim().toLowerCase())) {
      return res.status(400).json({ error: 'Pedido no disponible para pago' });
    }

    if (!metodo_pago) {
      return res.status(400).json({ error: 'metodo_pago es requerido' });
    }

    const montoPagado = Number(monto_pagado);
    if (!Number.isFinite(montoPagado) || montoPagado <= 0) {
      return res.status(400).json({ error: 'Debes indicar un monto_pagado valido' });
    }

    const montoPagadoBs = Number(monto_pagado_bs);
    if (!Number.isFinite(montoPagadoBs) || montoPagadoBs <= 0) {
      return res.status(400).json({ error: 'Debes indicar un monto_pagado_bs valido' });
    }

    const totalPedido = Number(pedido.precio) || 0;
    const saldoActual = Number(pedido.saldo_pendiente);
    const saldoPendiente = Number.isFinite(saldoActual) && saldoActual > 0
      ? saldoActual
      : Math.max(totalPedido - (Number(pedido.monto_pagado) || 0), 0);

    if (saldoPendiente <= 0) {
      return res.status(400).json({ error: 'El pedido no tiene saldo pendiente por pagar' });
    }

    const toleranciaDivisa = calcularToleranciaDivisaDesdeBs(montoPagado, montoPagadoBs);

    if (montoPagado > (saldoPendiente + toleranciaDivisa)) {
      return res.status(400).json({ error: `El monto pagado no puede superar el saldo pendiente (${saldoPendiente.toFixed(2)}).` });
    }

    const factorAjuste = montoPagado > saldoPendiente ? (saldoPendiente / montoPagado) : 1;
    const montoPagadoAplicado = redondearMonto(montoPagado * factorAjuste);
    const montoPagadoBsAplicado = redondearMonto(montoPagadoBs * factorAjuste);
    const esPagoCompleto = montoPagadoAplicado >= (saldoPendiente - 0.0001);

    pedido.metodo_pago = metodo_pago;
    pedido.referencia = referencia || undefined;
    pedido.telefono_pago = telefono_pago || undefined;
    pedido.cedula_titular = cedula_titular || undefined;
    pedido.nota = String(nota || '').trim();
    pedido.fecha_pago = fecha_pago ? new Date(fecha_pago) : new Date();
    pedido.comprobante_url = buildComprobanteUrl(req.file, req.tenantId) || pedido.comprobante_url;
    pedido.monto_ultimo_pago = montoPagadoAplicado;
    pedido.monto_ultimo_pago_bs = montoPagadoBsAplicado;

    const totalPagado = (Number(pedido.monto_pagado) || 0) + montoPagadoAplicado;
    const totalPagadoBs = (Number(pedido.monto_pagado_bs) || 0) + montoPagadoBsAplicado;
    const saldoPendienteNuevo = Math.max(totalPedido - totalPagado, 0);

    if (esPagoCompleto && !puedeGestionar) {
      // Si lo registra el usuario final y completa el saldo, queda en revisión administrativa.
      pedido.estado = ESTADOS_PEDIDO.PAGO_EN_REVISION;
    } else {
      // Cuando lo registra admin/gestion, o cuando es abono parcial, se acumula de inmediato.
      pedido.pagos_historial = Array.isArray(pedido.pagos_historial) ? pedido.pagos_historial : [];
      pedido.pagos_historial.push({
        monto_pagado: montoPagadoAplicado,
        monto_pagado_bs: montoPagadoBsAplicado,
        metodo_pago: pedido.metodo_pago,
        referencia: pedido.referencia,
        telefono_pago: pedido.telefono_pago,
        cedula_titular: pedido.cedula_titular,
        nota: pedido.nota,
        comprobante_url: pedido.comprobante_url,
        fecha_pago: pedido.fecha_pago
      });

      pedido.monto_pagado = totalPagado;
      pedido.monto_pagado_bs = totalPagadoBs;
      pedido.saldo_pendiente = saldoPendienteNuevo;
      pedido.estado = esPagoCompleto ? ESTADOS_PEDIDO.VERIFICADO : ESTADOS_PEDIDO.ABONO;
      pedido.monto_ultimo_pago = 0;
      pedido.monto_ultimo_pago_bs = 0;
    }

    await pedido.save();
    const pedidoActualizado = await findPedidoByIdWithRelations(TenantUniformePedido, pedido._id);
    res.json(resolvePedidoPrenda(pedidoActualizado));
  } catch (err) {
    res.status(400).json({ error: 'Error al registrar pago del pedido', detalle: err.message });
  }
};

exports.verificarPagoPedido = async (req, res) => {
  try {
    const { UniformePedido: TenantUniformePedido } = await getTenantUniformePedidoModels(req);
    const pedido = await TenantUniformePedido.findById(req.params.id)
      .populate('alumno')
      .populate('sede')
      .populate('solicitado_por');

    if (!pedido) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    if (pedido.estado !== ESTADOS_PEDIDO.PAGO_EN_REVISION) {
      return res.status(400).json({ error: 'Solo se pueden verificar pagos en revisión' });
    }

    const totalPedido = Number(pedido.precio) || 0;
    const montoPrevioPagado = Number(pedido.monto_pagado) || 0;
    const montoPrevioPagadoBs = Number(pedido.monto_pagado_bs) || 0;
    const montoUltimoPagoRaw = Number(pedido.monto_ultimo_pago);
    const montoUltimoPagoBsRaw = Number(pedido.monto_ultimo_pago_bs);
    const saldoActual = Number(pedido.saldo_pendiente);
    const saldoPendienteActual = Number.isFinite(saldoActual) && saldoActual > 0
      ? saldoActual
      : Math.max(totalPedido - montoPrevioPagado, 0);
    const montoUltimoPago = Number.isFinite(montoUltimoPagoRaw) && montoUltimoPagoRaw > 0
      ? Math.min(montoUltimoPagoRaw, saldoPendienteActual)
      : saldoPendienteActual;
    const factorAjusteUltimoPago = Number.isFinite(montoUltimoPagoRaw) && montoUltimoPagoRaw > 0
      ? (montoUltimoPago / montoUltimoPagoRaw)
      : 1;
    const montoUltimoPagoBs = Number.isFinite(montoUltimoPagoBsRaw) && montoUltimoPagoBsRaw > 0
      ? (montoUltimoPagoBsRaw * factorAjusteUltimoPago)
      : 0;

    const totalPagado = Math.min(totalPedido, montoPrevioPagado + montoUltimoPago);
    const totalPagadoBs = montoPrevioPagadoBs + montoUltimoPagoBs;
    const saldoPendiente = Math.max(totalPedido - totalPagado, 0);

    pedido.pagos_historial = Array.isArray(pedido.pagos_historial) ? pedido.pagos_historial : [];
    pedido.pagos_historial.push({
      monto_pagado: montoUltimoPago,
      monto_pagado_bs: montoUltimoPagoBs,
      metodo_pago: pedido.metodo_pago,
      referencia: pedido.referencia,
      telefono_pago: pedido.telefono_pago,
      cedula_titular: pedido.cedula_titular,
      nota: pedido.nota,
      comprobante_url: pedido.comprobante_url,
      fecha_pago: pedido.fecha_pago
    });

    pedido.monto_pagado = totalPagado;
    pedido.monto_pagado_bs = totalPagadoBs;
    pedido.saldo_pendiente = saldoPendiente;
    pedido.estado = saldoPendiente > 0 ? ESTADOS_PEDIDO.ABONO : ESTADOS_PEDIDO.VERIFICADO;
    await pedido.save();

    const pedidoActualizado = await findPedidoByIdWithRelations(TenantUniformePedido, pedido._id);
    res.json(resolvePedidoPrenda(pedidoActualizado));
  } catch (err) {
    res.status(400).json({ error: 'Error al verificar el pago del pedido', detalle: err.message });
  }
};

exports.marcarEntregado = async (req, res) => {
  try {
    const { UniformePedido: TenantUniformePedido } = await getTenantUniformePedidoModels(req);
    const pedido = await TenantUniformePedido.findById(req.params.id)
      .populate('alumno')
      .populate('sede')
      .populate('solicitado_por');
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });

    if (pedido.estado !== ESTADOS_PEDIDO.VERIFICADO) {
      return res.status(400).json({ error: 'Solo se puede marcar como entregado un pedido verificado' });
    }

    pedido.estado = ESTADOS_PEDIDO.ENTREGADO;
    await pedido.save();
    const pedidoActualizado = await findPedidoByIdWithRelations(TenantUniformePedido, pedido._id);
    res.json(resolvePedidoPrenda(pedidoActualizado));
  } catch (err) {
    res.status(400).json({ error: 'Error al marcar como entregado' });
  }
};

exports.eliminarPedidoUniforme = async (req, res) => {
  try {
    const { UniformePedido: TenantUniformePedido } = await getTenantUniformePedidoModels(req);
    const pedido = await TenantUniformePedido.findById(req.params.id);

    if (!pedido) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    if (![ESTADOS_PEDIDO.PENDIENTE, ESTADOS_PEDIDO.ESPERANDO_PAGO, ESTADOS_PEDIDO.CANCELADO].includes(pedido.estado)) {
      return res.status(400).json({
        error: 'Solo se pueden eliminar pedidos en estado pendiente, esperando_pago o cancelado'
      });
    }

    const tienePagosHistorial = Array.isArray(pedido.pagos_historial) && pedido.pagos_historial.length > 0;
    const montoPagado = Number(pedido.monto_pagado) || 0;
    const montoUltimoPago = Number(pedido.monto_ultimo_pago) || 0;

    if (tienePagosHistorial || montoPagado > 0 || montoUltimoPago > 0) {
      return res.status(400).json({
        error: 'No se puede eliminar un pedido que tenga pagos registrados'
      });
    }

    await pedido.deleteOne();

    return res.json({ message: 'Solicitud de pedido eliminada correctamente' });
  } catch (err) {
    return res.status(400).json({ error: 'Error al eliminar la solicitud de pedido', detalle: err.message });
  }
};
