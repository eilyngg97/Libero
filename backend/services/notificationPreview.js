const { obtenerFechaCortePagoAlumnoMensualidad, obtenerInicioDiaZonaCaracas } = require('./monthlyDueDate');
const { proyectarCreditoMensualidades } = require('./monthlyCredit');

const DIA = 86400000;
const nombre = (persona) => [persona?.nombres, persona?.apellidos].filter(Boolean).join(' ');
const fechaTexto = (fecha) => new Date(fecha.getTime() - 4 * 3600000).toISOString().slice(0, 10);

function normalizarTelefono(valor) {
  const raw = String(valor || '').trim().replace(/[\s()-]/g, '');
  const nacional = /^0(412|414|416|424|426)\d{7}$/.test(raw) ? `58${raw.slice(1)}` : raw.replace(/^\+/, '');
  return /^[1-9]\d{6,14}$/.test(nacional) ? nacional : null;
}

function crearVistaPrevia({ mensualidades, pagos, habilitadas, periodo, hoy = new Date() }) {
  const pagosPorCuota = new Map();
  for (const pago of pagos) {
    const id = String(pago.id_mensualidad);
    pagosPorCuota.set(id, [...(pagosPorCuota.get(id) || []), pago]);
  }
  const saldos = new Map();
  const cuotas = mensualidades.map((cuota) => {
    const alumno = cuota.id_alumno;
    if (alumno?._id) saldos.set(String(alumno._id), Number(alumno.saldo_a_favor_mensualidades || 0));
    const total = (pagosPorCuota.get(String(cuota._id)) || [])
      .reduce((sum, pago) => sum + Math.round(Number(pago.monto_pagado || 0) * 100), 0);
    return { ...cuota, saldo_pendiente: Math.max(0, Math.round(Number(cuota.monto_esperado) * 100) - total) / 100 };
  });
  const proyectadas = proyectarCreditoMensualidades(cuotas, saldos);
  const grupos = new Map();
  const exclusiones = {};
  const excluir = (motivo) => { exclusiones[motivo] = (exclusiones[motivo] || 0) + 1; };
  const inicioHoy = obtenerInicioDiaZonaCaracas(hoy);
  for (const cuota of proyectadas) {
    if (`${cuota.anio}-${String(cuota.mes).padStart(2, '0')}` !== periodo) continue;
    if (cuota.es_inscripcion || cuota.tipo_registro_inicial) {
      excluir('Inscripcion o reingreso'); continue;
    }
    const alumno = cuota.id_alumno;
    if (!alumno || alumno.activo === false || alumno.dado_de_baja ||
        ['inactivo', 'retirado', 'baja'].includes(String(alumno.estado || '').toLowerCase())) {
      excluir('Atleta inactivo o sin ficha'); continue;
    }
    if (alumno.tipo_mensualidad === 'beca_completa' ||
        !['Pendiente', 'Retrasado', 'Insolvente', 'Abono', 'En revision'].includes(cuota.estatus)) {
      excluir('Pagada, exonerada o no cobrable'); continue;
    }
    if (cuota.estatus === 'En revision' || cuota.pago_en_revision || cuota.credito_en_revision > 0) {
      excluir('Pago o credito en revision'); continue;
    }
    const tienePago = (pagosPorCuota.get(String(cuota._id)) || []).some((pago) => Number(pago.monto_pagado) > 0);
    if (cuota.estatus === 'Abono' || tienePago || cuota.credito_aplicado > 0 || cuota.credito_a_aplicar > 0) {
      excluir('Abono o credito parcial/total'); continue;
    }
    if (!(cuota.saldo_pendiente > 0) || !Number.isFinite(cuota.saldo_pendiente)) {
      excluir('Sin saldo cobrable'); continue;
    }
    const representante = alumno.representante;
    if (!representante?._id) { excluir('Sin representante'); continue; }
    const vencimiento = obtenerFechaCortePagoAlumnoMensualidad(cuota, alumno);
    if (!vencimiento) { excluir('Sin vencimiento valido'); continue; }
    if (alumno.fecha_inicio_cobro) {
      const inicio = new Date(alumno.fecha_inicio_cobro);
      if (!Number.isNaN(inicio.getTime()) && (inicio.getUTCFullYear() * 12 + inicio.getUTCMonth()) >
          (Number(cuota.anio) * 12 + Number(cuota.mes) - 1)) {
        excluir('Periodo anterior al inicio de cobro'); continue;
      }
    }
    for (const [tipo, desplazamiento] of [['antes', -1], ['despues', 3]]) {
      const fecha = new Date(vencimiento.getTime() + desplazamiento * DIA);
      const key = `${representante._id}:${cuota.anio}-${cuota.mes}:${tipo}:${fechaTexto(fecha)}`;
      if (!grupos.has(key)) {
        const bloqueos = [];
        if (!habilitadas) bloqueos.push('Funcion desactivada para esta academia');
        if (!normalizarTelefono(representante.telefono)) bloqueos.push('Telefono invalido');
        if (representante.whatsapp_consentimiento?.aceptado !== true ||
            !representante.whatsapp_consentimiento?.fecha) bloqueos.push('Consentimiento de WhatsApp pendiente');
        grupos.set(key, {
          id: key, representante: nombre(representante), telefono: normalizarTelefono(representante.telefono),
          tipo, fecha: fechaTexto(fecha), vencimiento: fechaTexto(vencimiento),
          momento: fecha < inicioHoy ? 'pasado' : fecha.getTime() === inicioHoy.getTime() ? 'hoy' : 'futuro',
          bloqueos, atletas: [], total: 0
        });
      }
      const grupo = grupos.get(key);
      grupo.atletas.push({ mensualidad: String(cuota._id), nombre: nombre(alumno), saldo: cuota.saldo_pendiente });
      grupo.total = Math.round((grupo.total + cuota.saldo_pendiente) * 100) / 100;
    }
  }
  const avisos = [...grupos.values()].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
  return { avisos, exclusiones,
    resumen: {
      calculados: avisos.length,
      elegibles_hoy: avisos.filter((aviso) => aviso.momento === 'hoy' && aviso.bloqueos.length === 0).length,
      bloqueados: avisos.filter((aviso) => aviso.bloqueos.length > 0).length
    }
  };
}

module.exports = { crearVistaPrevia, normalizarTelefono };
