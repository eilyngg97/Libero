const MONTO_TOLERANCIA_BS = 100;

function redondearMonto(valor) {
  return Number((Number(valor) || 0).toFixed(2));
}

function ordenarPagos(pagos = []) {
  return [...pagos].sort((a, b) => {
    const fechaA = new Date(a.fecha_pago || a.createdAt || 0).getTime();
    const fechaB = new Date(b.fecha_pago || b.createdAt || 0).getTime();
    if (fechaA !== fechaB) return fechaA - fechaB;
    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  });
}

function obtenerCoberturaMensualidad(monto, pagos = []) {
  const totalPagado = redondearMonto(pagos.reduce((total, pago) => total + (Number(pago.monto_pagado) || 0), 0));
  const montoEsperado = redondearMonto(monto);
  const pagoConTasa = ordenarPagos(pagos).reverse().find((pago) => {
    const divisa = Number(pago.monto_pagado);
    const bs = Number(pago.monto_pagado_bs);
    return Number.isFinite(divisa) && divisa > 0 && Number.isFinite(bs) && bs > 0;
  });
  const tasa = pagoConTasa ? Number(pagoConTasa.monto_pagado_bs) / Number(pagoConTasa.monto_pagado) : 0;
  const cubreEsperadoConTolerancia = totalPagado >= montoEsperado
    || (Number.isFinite(tasa) && tasa > 0 && totalPagado > 0
      && redondearMonto((montoEsperado - totalPagado) * tasa) <= MONTO_TOLERANCIA_BS);
  return { totalPagado, montoEsperado, cubreEsperadoConTolerancia };
}

module.exports = { MONTO_TOLERANCIA_BS, ordenarPagos, obtenerCoberturaMensualidad };
