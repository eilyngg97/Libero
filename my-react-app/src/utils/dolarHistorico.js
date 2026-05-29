let historicoCache = null;
let historicoPromise = null;
let historicoEuroCache = null;
let historicoEuroPromise = null;

async function cargarHistoricoOficial() {
  if (Array.isArray(historicoCache)) return historicoCache;
  if (!historicoPromise) {
    historicoPromise = fetch('https://ve.dolarapi.com/v1/historicos/dolares/oficial')
      .then(async (res) => {
        const data = await res.json().catch(() => []);
        if (!res.ok) {
          throw new Error(data?.error || 'No se pudo obtener el historico del dolar.');
        }
        historicoCache = Array.isArray(data) ? data : [];
        return historicoCache;
      })
      .finally(() => {
        historicoPromise = null;
      });
  }

  return historicoPromise;
}

export async function obtenerTasaOficialPorFecha(fechaIso, tasaFallback = null) {
  if (!fechaIso) return tasaFallback;

  const historico = await cargarHistoricoOficial();
  if (!historico.length) return tasaFallback;

  const exacta = historico.find((item) => item?.fecha === fechaIso && item?.promedio != null);
  if (exacta) return Number(exacta.promedio);

  const anteriores = historico
    .filter((item) => item?.fecha && item.fecha <= fechaIso && item?.promedio != null)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  if (anteriores.length > 0) {
    return Number(anteriores[0].promedio);
  }

  return tasaFallback;
}

async function cargarHistoricoEuroOficial() {
  if (Array.isArray(historicoEuroCache)) return historicoEuroCache;
  if (!historicoEuroPromise) {
    historicoEuroPromise = fetch('https://ve.dolarapi.com/v1/historicos/euros/oficial')
      .then(async (res) => {
        const data = await res.json().catch(() => []);
        if (!res.ok) {
          throw new Error(data?.error || 'No se pudo obtener el historico del euro.');
        }
        historicoEuroCache = Array.isArray(data) ? data : [];
        return historicoEuroCache;
      })
      .finally(() => {
        historicoEuroPromise = null;
      });
  }

  return historicoEuroPromise;
}

export async function obtenerTasaEuroOficialPorFecha(fechaIso, tasaFallback = null) {
  if (!fechaIso) return tasaFallback;

  const historico = await cargarHistoricoEuroOficial();
  if (!historico.length) return tasaFallback;

  const exacta = historico.find((item) => item?.fecha === fechaIso && item?.promedio != null);
  if (exacta) return Number(exacta.promedio);

  const anteriores = historico
    .filter((item) => item?.fecha && item.fecha <= fechaIso && item?.promedio != null)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  if (anteriores.length > 0) {
    return Number(anteriores[0].promedio);
  }

  return tasaFallback;
}