const { proyectarCreditoMensualidades, aplicarCreditoMensualidad, reconstruirCredito } = require('../services/monthlyCredit');

test('credito de septiembre descuenta octubre ya creada sin mutar ni consumir el saldo', () => {
  const mensualidades = [
    { _id: 'sep', id_alumno: 'a1', mes: 9, anio: 2026, monto_esperado: 19, saldo_pendiente: 0, estatus: 'En revision' },
    { _id: 'oct', id_alumno: 'a1', mes: 10, anio: 2026, monto_esperado: 19, saldo_pendiente: 19, estatus: 'Insolvente' }
  ];
  const saldos = new Map([['a1', 1.03]]);
  const antes = JSON.stringify(mensualidades);
  const resultado = proyectarCreditoMensualidades(mensualidades, saldos);
  expect(resultado[1]).toMatchObject({ saldo_pendiente: 17.97, credito_a_aplicar: 1.03, saldo_pendiente_antes_credito: 19 });
  expect(JSON.stringify(mensualidades)).toBe(antes);
  expect(saldos.get('a1')).toBe(1.03);
  expect(proyectarCreditoMensualidades(mensualidades, saldos)).toEqual(resultado);
});

test('reparte el credito en orden cronologico, no lo repite en otros meses ni otros atletas', () => {
  const mensualidades = [
    { _id: 'nov', id_alumno: 'a1', mes: 11, anio: 2026, monto_esperado: 19, estatus: 'Pendiente' },
    { _id: 'oct', id_alumno: 'a1', mes: 10, anio: 2026, monto_esperado: 19, estatus: 'Insolvente' },
    { _id: 'otra', id_alumno: { _id: 'a2' }, mes: 10, anio: 2026, monto_esperado: 19, estatus: 'Pendiente' }
  ];
  const resultado = proyectarCreditoMensualidades(mensualidades, new Map([['a1', 20.03], ['a2', 1.02]]));
  expect(resultado[0]).toMatchObject({ credito_a_aplicar: 1.03, saldo_pendiente: 17.97 });
  expect(resultado[1]).toMatchObject({ credito_a_aplicar: 19, saldo_pendiente: 0 });
  expect(resultado[2]).toMatchObject({ credito_a_aplicar: 1.02, saldo_pendiente: 17.98 });
});

test('no reduce cuotas pagadas, en revision ni exoneradas; respeta abonos existentes', () => {
  const mensualidades = ['Pagado', 'En revision', 'Exonerado', 'Abono'].map((estatus, index) => ({
    _id: String(index), id_alumno: 'a1', mes: index + 1, anio: 2026, monto_esperado: 19, saldo_pendiente: 5, estatus
  }));
  const resultado = proyectarCreditoMensualidades(mensualidades, new Map([['a1', 10]]));
  expect(resultado.map((item) => item.credito_a_aplicar)).toEqual([0, 0, 0, 5]);
  expect(resultado[3].saldo_pendiente).toBe(0);
});

test('aplica credito con historial sin cambiar la cuota original ni crear efectivo ficticio', async () => {
  const alumno = { saldo_a_favor_mensualidades: 1.03, save: jest.fn().mockResolvedValue(undefined) };
  const mensualidad = { _id: 'oct', monto_base: 15, monto_esperado: 19, recargo_aplicado_usd: 4, estatus: 'Insolvente' };
  const cotizacion = { alumno, proyecciones: new Map([['oct', { credito_a_aplicar: 1.03 }]]) };
  const session = {};
  expect(await aplicarCreditoMensualidad(mensualidad, cotizacion, { session })).toBe(1.03);
  expect(mensualidad).toMatchObject({ monto_base: 15, credito_aplicado: 1.03, monto_esperado: 17.97,
    monto_sin_recargo_usd: 13.97, recargo_aplicado_usd: 4, monto_con_recargo_usd: 17.97 });
  expect(alumno.saldo_a_favor_mensualidades).toBe(0);
  expect(alumno.save).toHaveBeenCalledWith({ session });
  expect(mensualidad.historial_ediciones[0]).toMatchObject({ accion: 'aplicacion_saldo_a_favor', anterior: { monto_esperado: 19 }, nuevo: { monto_esperado: 17.97 } });
});

test('no consume saldo sin transaccion', async () => {
  const alumno = { saldo_a_favor_mensualidades: 1.03, save: jest.fn() };
  const mensualidad = { _id: 'oct', monto_esperado: 19 };
  await expect(aplicarCreditoMensualidad(mensualidad, { alumno,
    proyecciones: new Map([['oct', { credito_a_aplicar: 1.03 }]]) })).rejects.toMatchObject({ status: 503 });
  expect(alumno.save).not.toHaveBeenCalled();
  expect(mensualidad.monto_esperado).toBe(19);
});

test.each(['Pagado', 'En revision'])('reconstruye octubre, noviembre y diciembre sin perder el remanente historico (%s)', (estatus) => {
  const mensualidades = [
    { _id: 'oct', mes: 10, anio: 2026, saldo_a_favor_generado: 36, estatus },
    { _id: 'nov', mes: 11, anio: 2026, credito_aplicado: 20, estatus: 'Pagado' },
    { _id: 'dic', mes: 12, anio: 2026, credito_aplicado: 16, estatus: 'Abono' }
  ];
  const antes = JSON.stringify(mensualidades);
  const historial = reconstruirCredito(mensualidades);
  expect(historial.movimientos.get('oct').saldo_a_favor_restante).toBe(36);
  expect(historial.movimientos.get('nov')).toMatchObject({ saldo_a_favor_restante: 16,
    credito_en_revision: estatus === 'En revision' ? 20 : 0 });
  expect(historial.movimientos.get('dic')).toMatchObject({ saldo_a_favor_restante: 0,
    credito_origenes: [{ id_mensualidad: 'oct', monto: 16 }] });
  expect(JSON.stringify(mensualidades)).toBe(antes);
});

test('mezcla saldo confirmado y provisional sin perder origenes ni reutilizar dinero', () => {
  const historial = reconstruirCredito([
    { _id: 'sep', mes: 9, anio: 2026, saldo_a_favor_generado: 10, estatus: 'Pagado' },
    { _id: 'oct', mes: 10, anio: 2026, saldo_a_favor_generado: 26, estatus: 'En revision' },
    { _id: 'nov', mes: 11, anio: 2026, credito_aplicado: 20 }
  ], 16);
  expect(historial.movimientos.get('nov')).toMatchObject({ credito_en_revision: 10,
    saldo_a_favor_restante: 16, saldo_a_favor_provisional: 16,
    credito_origenes: [{ id_mensualidad: 'sep', monto: 10 }, { id_mensualidad: 'oct', monto: 10 }] });
  expect(historial.disponibles.reduce((total, fuente) => total + fuente.disponible, 0)).toBe(1600);
});

test('reconstruye centavos y saldos iniciales sin inventar una transferencia', () => {
  const historial = reconstruirCredito([{ _id: 'oct', mes: 10, anio: 2026, credito_aplicado: 1.03 },
    { _id: 'nov', mes: 11, anio: 2026, credito_aplicado: 1.02 }], 0.01);
  expect(historial.movimientos.get('oct').saldo_a_favor_restante).toBe(1.03);
  expect(historial.movimientos.get('nov').saldo_a_favor_restante).toBe(0.01);
});

test('puede cubrir la diferencia de una cuota parcialmente cubierta con credito provisional', () => {
  const resultado = proyectarCreditoMensualidades([
    { _id: 'nov', id_alumno: 'a1', mes: 11, anio: 2026, estatus: 'En revision', credito_en_revision: 20, saldo_pendiente: 0 },
    { _id: 'dic', id_alumno: 'a1', mes: 12, anio: 2026, estatus: 'En revision', credito_en_revision: 16, saldo_pendiente: 4 }
  ], new Map([['a1', 10]]));
  expect(resultado.map((item) => item.credito_a_aplicar)).toEqual([0, 4]);
});

test('un origen de credito ausente nunca se considera confirmado', () => {
  const historial = reconstruirCredito([{ _id: 'nov', mes: 11, anio: 2026, credito_aplicado: 20,
    credito_origenes: [{ id_mensualidad: 'origen-ausente', monto: 20 }] }]);
  expect(historial.movimientos.get('nov').credito_en_revision).toBe(20);
  expect(historial.movimientos.get('nov').saldo_a_favor_restante).toBe(0);
});