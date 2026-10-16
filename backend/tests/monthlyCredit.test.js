const { proyectarCreditoMensualidades, aplicarCreditoMensualidad } = require('../services/monthlyCredit');

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