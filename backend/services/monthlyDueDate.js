function normalizarDiaMes(valor, fallback) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= 1 && numero <= 31 ? numero : fallback;
}

function construirFechaPeriodoConDia(mes, anio, dia, { finDelDia = false } = {}) {
  const ultimoDiaMes = new Date(anio, mes, 0).getDate();
  const diaAjustado = Math.min(Math.max(1, Number(dia) || 1), ultimoDiaMes);
  return new Date(Date.UTC(anio, mes - 1, diaAjustado,
    (finDelDia ? 23 : 0) + 4, finDelDia ? 59 : 0, finDelDia ? 59 : 0, finDelDia ? 999 : 0));
}

function obtenerInicioDiaZonaCaracas(fecha) {
  const fechaValida = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(fechaValida.getTime())) return null;
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Caracas', year: 'numeric', month: 'numeric', day: 'numeric'
  }).formatToParts(fechaValida);
  const parte = (tipo) => Number(partes.find((item) => item.type === tipo)?.value);
  return construirFechaPeriodoConDia(parte('month'), parte('year'), parte('day'));
}

function obtenerFechaCortePagoAlumnoMensualidad(mensualidad, alumno = null) {
  const dia = normalizarDiaMes(alumno?.dia_limite_personalizado
    ?? mensualidad?.id_alumno?.dia_limite_personalizado, null);
  const mes = Number(mensualidad?.mes);
  const anio = Number(mensualidad?.anio);
  if (dia && Number.isInteger(mes) && mes >= 1 && mes <= 12 && Number.isInteger(anio) && anio > 1900) {
    return construirFechaPeriodoConDia(mes, anio, dia);
  }
  const fecha = mensualidad?.fecha_vencimiento ? new Date(mensualidad.fecha_vencimiento) : null;
  return fecha && !Number.isNaN(fecha.getTime()) ? obtenerInicioDiaZonaCaracas(fecha) : null;
}

module.exports = { normalizarDiaMes, construirFechaPeriodoConDia,
  obtenerInicioDiaZonaCaracas, obtenerFechaCortePagoAlumnoMensualidad };
