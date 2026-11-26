const { aplicarSession, ejecutarConTransaccion } = require('./financeTransaction');

const money = (value) => Math.round(Number(value || 0) * 100) / 100;
const nombre = (persona) => [persona?.nombres, persona?.apellidos].filter(Boolean).join(' ');

function construirDesglose(mensualidad, pagos) {
  const mes = new Date(Date.UTC(mensualidad.anio, mensualidad.mes - 1, 15))
    .toLocaleString('es-VE', { month: 'long', year: 'numeric', timeZone: 'America/Caracas' });
  const inscripcion = money(mensualidad.monto_inscripcion || mensualidad.monto_reingreso);
  const recargo = money(mensualidad.recargo_aplicado_usd);
  const credito = money(mensualidad.credito_aplicado);
  const ajuste = money(mensualidad.ajuste_extraordinario);
  const esperado = money(mensualidad.monto_esperado);
  const pagosRegistrados = pagos.length || esperado <= 0 ? pagos : [{
    monto_pagado: esperado,
    monto_pagado_bs: mensualidad.monto_equivalente_bs,
    metodo_pago: mensualidad.metodo_pago || 'Registro administrativo sin detalle historico',
    referencia: mensualidad.referencia,
    fecha_pago: mensualidad.fecha_pago || mensualidad.updatedAt || mensualidad.createdAt
  }];
  const base = money(esperado - recargo + credito + ajuste);
  const lineas = [];
  if (inscripcion > 0) {
    lineas.push({ concepto: mensualidad.tipo_registro_inicial === 'reingreso' ? 'Reingreso' : 'Inscripcion', monto: inscripcion });
  }
  lineas.push({ concepto: `Mensualidad ${mes}`, monto: money(base - inscripcion) });
  if (recargo) lineas.push({ concepto: 'Recargo por mora', monto: recargo });
  if (ajuste) lineas.push({ concepto: mensualidad.ajuste_descripcion || (ajuste > 0 ? 'Descuento' : 'Ajuste adicional'), monto: -ajuste });
  if (credito) lineas.push({ concepto: 'Saldo a favor aplicado', monto: -credito });
  const total = money(pagosRegistrados.reduce((sum, pago) => sum + Number(pago.monto_pagado || 0), 0));
  if (total !== esperado) {
    lineas.push({ concepto: total > esperado ? 'Excedente abonado a saldo a favor' : 'Diferencia de conciliacion', monto: money(total - esperado) });
  }
  return {
    concepto: inscripcion > 0 ? `${lineas[0].concepto} + Mensualidad ${mes}` : `Mensualidad ${mes}`,
    lineas,
    total,
    total_bs: pagosRegistrados.some((pago) => Number(pago.monto_pagado_bs) > 0)
      ? money(pagosRegistrados.reduce((sum, pago) => sum + Number(pago.monto_pagado_bs || 0), 0)) : null,
    pagos: pagosRegistrados.map((pago) => ({
      metodo: pago.metodo_pago, referencia: pago.referencia || '',
      fecha: pago.fecha_pago, monto: money(pago.monto_pagado),
      monto_bs: pago.monto_pagado_bs == null ? null : money(pago.monto_pagado_bs)
    }))
  };
}

function presentarImportesRecibo(datos) {
  if (!Array.isArray(datos?.pagos) || !Array.isArray(datos?.lineas)
    || datos.lineas.some((linea) => !Number.isFinite(Number(linea.monto)))) {
    throw Object.assign(new Error('El desglose del recibo esta incompleto.'), { status: 422 });
  }
  const { total, total_bs, moneda, lineas, pagos, ...identidad } = datos;
  const totalesPorMoneda = new Map();
  const pagosPresentados = pagos.map((pago) => {
    const metodo = String(pago.metodo || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    const bancario = ['pago movil', 'transferencia'].includes(metodo)
      || (metodo === 'registro administrativo sin detalle historico' && Number(pago.monto_bs) > 0);
    if (!bancario && !['efectivo', 'zelle', 'paypal', 'binance', 'registro administrativo sin detalle historico'].includes(metodo)) {
      throw Object.assign(new Error(`No se puede determinar la moneda del metodo "${pago.metodo}". Revisa el pago antes de descargar el recibo.`), { status: 422 });
    }
    const valor = bancario ? pago.monto_bs : pago.monto;
    if (valor == null || !Number.isFinite(Number(valor)) || Number(valor) < 0
      || (bancario && Number(pago.monto) > 0 && Number(valor) === 0)) {
      throw Object.assign(new Error(`El pago "${pago.metodo}" no tiene un importe valido ${bancario ? 'en Bs' : 'en divisas'}. Revisa el pago antes de descargar el recibo.`), { status: 422 });
    }
    const divisa = bancario ? 'VES' : moneda;
    if (!['VES', 'USD', 'EUR'].includes(divisa)) {
      throw Object.assign(new Error('La moneda del recibo no es valida.'), { status: 422 });
    }
    const centavos = Math.round(Number(valor) * 100);
    totalesPorMoneda.set(divisa, (totalesPorMoneda.get(divisa) || 0) + centavos);
    const { monto_bs, ...detalle } = pago;
    return { ...detalle, monto: centavos / 100, moneda: divisa };
  });
  const totales = [...totalesPorMoneda].map(([divisa, centavos]) => ({ moneda: divisa, monto: centavos / 100 }));
  if (!pagos.length && Number(total) === 0) totales.push({ moneda: 'VES', monto: 0 });
  const base = Number(total);
  if (!Number.isFinite(base) || base < 0 || (!pagos.length && base > 0)) {
    throw Object.assign(new Error('El recibo no tiene un total de pagos valido.'), { status: 422 });
  }
  if (Math.round(lineas.reduce((sum, linea) => sum + Number(linea.monto), 0) * 100) !== Math.round(base * 100)) {
    throw Object.assign(new Error('El desglose del recibo no coincide con el total pagado.'), { status: 422 });
  }
  const lineasPresentadas = lineas.map((linea) => ({
    concepto: linea.concepto,
    importes: base > 0 ? totales.map((item) => ({ moneda: item.moneda, monto: money(Number(linea.monto) * item.monto / base) })) : []
  }));
  // El desglose es proporcional; el residuo de centavos se conserva en su ultima linea.
  if (base > 0 && lineasPresentadas.length) {
    totales.forEach((item, index) => {
      const suma = lineasPresentadas.reduce((sum, linea) => sum + Math.round(linea.importes[index].monto * 100), 0);
      const ultima = lineasPresentadas[lineasPresentadas.length - 1].importes[index];
      ultima.monto = (Math.round(ultima.monto * 100) + Math.round(item.monto * 100) - suma) / 100;
    });
  }
  return { ...identidad, totales, lineas: lineasPresentadas, pagos: pagosPresentados };
}

async function prepararRecibo(mensualidad, session) {
  if (!mensualidad.recibo && !session?.inTransaction()) {
    throw Object.assign(new Error('Emitir un recibo requiere MongoDB con transacciones (replica set). No se guardaron cambios.'), { status: 503 });
  }
  const { getTenantModel } = require('./tenantModelService');
  const connection = mensualidad.constructor.db;
  const model = (name) => getTenantModel(connection, name);
  const alumno = await aplicarSession(model('Alumno').findById(mensualidad.id_alumno?._id || mensualidad.id_alumno), session);
  if (!alumno) throw new Error('No se encontro el atleta para emitir el recibo.');
  const representante = alumno.representante
    ? await aplicarSession(model('Representante').findById(alumno.representante), session) : alumno;
  const sede = await aplicarSession(model('Sede').findById(alumno.sede), session);
  const config = await aplicarSession(model('TenantConfig').findOne({ key: 'default' }).lean(), session);
  const pagos = await aplicarSession(model('PagoDetalle').find({ id_mensualidad: mensualidad._id }).sort({ fecha_pago: 1, _id: 1 }), session);
  const tenant = connection.receiptTenant || {};
  const datos = {
    academia: {
      nombre: config?.recibos?.nombre_oficial || tenant.branding?.displayName || tenant.nombre || config?.constancias?.institucion_nombre || '',
      rif: config?.recibos?.rif || '',
      logo: tenant.branding?.logoUrl || '',
      sede: sede?.nombre || ''
    },
    representante: { nombre: nombre(representante), cedula: representante?.cedula || '' },
    atleta: { nombre: nombre(alumno), categoria: alumno.categoria || '' },
    moneda: config?.cobro?.moneda || 'USD',
    ...construirDesglose(mensualidad, pagos)
  };
  if (mensualidad.recibo) {
    mensualidad.recibo.datos = datos;
    mensualidad.markModified('recibo.datos');
    return;
  }
  const emitido = new Date();
  const anio = new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'America/Caracas' }).format(emitido);
  const counter = await model('ReciboCounter').findOneAndUpdate(
    { _id: `${tenant.tenantId || 'default'}:${anio}` },
    { $inc: { secuencia: 1 } },
    { upsert: true, new: true, session }
  );
  mensualidad.recibo = {
    numero: `REC-${anio}-${String(counter.secuencia).padStart(4, '0')}`,
    emitido_en: emitido,
    datos
  };
}

async function guardarMensualidadConRecibo(mensualidad, { session } = {}) {
  const guardar = async (sesion) => {
    if (mensualidad.estatus === 'Pagado') await prepararRecibo(mensualidad, sesion);
    return mensualidad.save(sesion ? { session: sesion } : undefined);
  };
  if (session || mensualidad.estatus !== 'Pagado' || mensualidad.recibo) {
    return guardar(session);
  }
  return ejecutarConTransaccion(mensualidad.constructor, async (sesion) => {
    // Releer dentro de cada intento evita consumir otro numero si hubo una emision concurrente.
    const vigente = mensualidad.isNew ? null : await mensualidad.constructor.findById(mensualidad._id).select('recibo').session(sesion);
    if (!mensualidad.isNew && !vigente) {
      throw Object.assign(new Error('Mensualidad no encontrada al emitir el recibo.'), { status: 404 });
    }
    mensualidad.recibo = vigente?.recibo;
    return guardar(sesion);
  }, { obligatoria: true });
}

module.exports = { construirDesglose, presentarImportesRecibo, prepararRecibo, guardarMensualidadConRecibo };
