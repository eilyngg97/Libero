const { obtenerCoberturaMensualidad, ordenarPagos } = require('../services/monthlyPaymentCoverage');

test.each([
  [14, 13, 1299.87, true],
  [14, 13, 1300, true],
  [14, 13, 1300.13, false],
  [19, 18.89, 17756.6, false],
  [14, 13, undefined, false],
  [14, 13, 0, false],
  [14, 13, -100, false],
  [14, 13, Infinity, false],
  [14, 14, undefined, true],
  [14, 15, undefined, true],
  [14, 0, 10000, false]
])('cobertura de %s con %s y %s Bs respeta el limite monetario (%s)', (esperado, pagado, bs, cubre) => {
  expect(obtenerCoberturaMensualidad(esperado, [{ monto_pagado: pagado, monto_pagado_bs: bs }]))
    .toEqual({ totalPagado: pagado, montoEsperado: esperado, cubreEsperadoConTolerancia: cubre });
});

test('sin pagos no aplica tolerancia ni inventa una tasa', () => {
  expect(obtenerCoberturaMensualidad(14)).toEqual({
    totalPagado: 0, montoEsperado: 14, cubreEsperadoConTolerancia: false
  });
});

test('suma pagos en centavos antes de comparar cobertura exacta', () => {
  expect(obtenerCoberturaMensualidad(0.3, [{ monto_pagado: 0.1 }, { monto_pagado: 0.2 }]))
    .toEqual({ totalPagado: 0.3, montoEsperado: 0.3, cubreEsperadoConTolerancia: true });
});

test.each([false, true])('usa la tasa del ultimo pago valido por fecha y createdAt, no el orden de consulta (invertido=%s)', (invertido) => {
  const pagos = [
    { monto_pagado: 6, monto_pagado_bs: 600, fecha_pago: '2026-10-01', createdAt: '2026-10-02' },
    { monto_pagado: 7, monto_pagado_bs: 700.07, fecha_pago: '2026-10-01', createdAt: '2026-10-03' },
    { monto_pagado: 0, monto_pagado_bs: 10000, fecha_pago: '2026-10-04' }
  ];
  if (invertido) pagos.reverse();
  const originales = [...pagos];
  expect(obtenerCoberturaMensualidad(14, pagos).cubreEsperadoConTolerancia).toBe(false);
  expect(pagos).toEqual(originales);
  expect(ordenarPagos(pagos)[0].monto_pagado).toBe(6);
});
