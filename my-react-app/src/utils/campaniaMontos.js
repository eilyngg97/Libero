const MONTO_TOLERANCIA_BS = 100;

export function normalizarImportePagoCampania({ monto, montoBs, tasa, esperado, metodo }) {
  if (['Pago movil', 'Transferencia'].includes(metodo)
    && Number.isFinite(montoBs) && montoBs > 0 && Number.isFinite(tasa) && tasa > 0
    && Number.isFinite(esperado) && esperado > 0
    && Math.abs(Math.round(montoBs * 100) - Math.round(esperado * tasa * 100)) <= MONTO_TOLERANCIA_BS * 100) {
    return esperado;
  }
  return monto;
}

export function tieneMontosValidos(campania) {
  if (campania.unidad_cobro !== undefined && !['atleta', 'representante'].includes(campania.unidad_cobro)) return false;
  const modalidad = campania.modalidad_monto === undefined ? 'unico' : campania.modalidad_monto;
  const montoValido = (monto) => typeof monto === 'number' && Number.isFinite(monto)
    && monto > 0 && monto <= 999999999.99;
  if (modalidad === 'unico') {
    return montoValido(campania.monto_general)
      && (campania.montos_por_sede === undefined || (Array.isArray(campania.montos_por_sede) && !campania.montos_por_sede.length));
  }
  if (modalidad !== 'por_sede' || campania.monto_general != null || !Array.isArray(campania.sedes)
    || !Array.isArray(campania.montos_por_sede) || !campania.montos_por_sede.length
    || campania.montos_por_sede.length !== campania.sedes.length) return false;
  const montos = campania.montos_por_sede;
  if (montos.some((item) => !item || typeof item.sede !== 'string' || !item.sede || !montoValido(item.monto))
    || new Set(montos.map((item) => item.sede)).size !== montos.length) return false;
  return campania.sedes.filter(Boolean).every((sede) => montos.some((item) => item.sede === (sede._id || sede)));
}