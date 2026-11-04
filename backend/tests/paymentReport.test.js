const { fechaCalendarioPago, resolverPeriodoReporte, construirReportePagos } = require('../services/paymentReport');

jest.mock('../config/tenantBusinessConnection', () => ({ getTenantBusinessConnection: jest.fn() }));
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getReportePagos } = require('../controllers/paymentReportController');

const alumno = { _id: 'a1', nombres: 'Roberto', apellidos: 'QA', sede: { _id: 's1', nombre: 'Sede QA' } };
const periodo = () => resolverPeriodoReporte({ mes: '11', anio: '2026' }, new Date('2026-11-03T12:00:00Z'));
const cuota = (mes, cambios = {}) => ({ _id: `m${mes}`, id_alumno: alumno, mes, anio: 2026,
  monto_esperado: 20, estatus: 'Pagado', ...cambios });
const pago = (mes, dia, cambios = {}) => ({ _id: `p${mes}-${dia}`, id_mensualidad: `m${mes}`,
  fecha_pago: `2026-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`, monto_pagado: 20, metodo_pago: 'Efectivo', ...cambios });

test('distingue fecha administrativa UTC y fecha con hora en Caracas', () => {
  expect(fechaCalendarioPago('2026-11-03')).toBe('2026-11-03');
  expect(fechaCalendarioPago('2026-11-03T02:00:00Z')).toBe('2026-11-02');
});

test('resuelve el rango de recibidos sin limitar el historial de habito', () => {
  expect(resolverPeriodoReporte({ mes: '1', anio: '2026' }, new Date('2026-11-03'))).toMatchObject({
    desde: '2026-01-01', hasta: '2026-01-31' });
});

test('habito incluye todo el historial aunque el mes de recibidos sea anterior', () => {
  const meses = [1, 2, 3, 4, 9, 10, 11];
  const resultado = construirReportePagos({ alumnos: [alumno], mensualidades: meses.map((mes) => cuota(mes)),
    pagos: meses.map((mes) => pago(mes, mes < 9 ? 3 : 12)),
    periodo: resolverPeriodoReporte({ mes: 2, anio: 2026 }, new Date('2026-11-03')) });
  expect(resultado.habitos[0]).toMatchObject({ franja: '1_5', coincidencias: 4, meses_observados: 7 });
  expect(resultado.periodos_habito).toHaveLength(7);
  expect(resultado.periodos_habito[0]).toEqual({ mes: 1, anio: 2026 });
  expect(resultado.periodos_habito[6]).toEqual({ mes: 11, anio: 2026 });
  expect(resultado.resumen.pagos).toBe(1);
});

test('empate conserva todas las franjas de mayor frecuencia sin elegir una arbitrariamente', () => {
  const meses = [1, 2, 3, 4, 5];
  const resultado = construirReportePagos({ alumnos: [alumno], mensualidades: meses.map((mes) => cuota(mes)),
    pagos: meses.map((mes, index) => pago(mes, [3, 3, 12, 12, 22][index])), periodo: periodo() });
  expect(resultado.habitos[0]).toMatchObject({ franja: 'sin_patron', franja_frecuente: null,
    franjas_frecuentes: ['1_5', '6_15'], coincidencias: 2, meses_observados: 5 });
});

test('una cuota conserva su franja mas frecuente sin afirmar un habito consistente', () => {
  const resultado = construirReportePagos({ alumnos: [alumno], mensualidades: [cuota(9)],
    pagos: [pago(9, 3)], periodo: periodo() });
  expect(resultado.habitos[0]).toMatchObject({ franja: 'insuficiente', franja_frecuente: '1_5',
    franjas_frecuentes: ['1_5'], coincidencias: 1, meses_observados: 1 });
});

test('distingue la mayor frecuencia de un habito consistente en el caso de tres de seis', () => {
  const meses = [3, 6, 7, 8, 9, 10];
  const fechas = ['2026-03-06', '2026-07-01', '2026-08-01', '2026-08-31', '2026-10-01', '2026-10-21'];
  const resultado = construirReportePagos({ alumnos: [alumno], mensualidades: meses.map((mes) => cuota(mes)),
    pagos: meses.map((mes, index) => pago(mes, 1, { fecha_pago: fechas[index] })), periodo: periodo() });
  expect(resultado.habitos[0]).toMatchObject({ franja: 'sin_patron', franja_frecuente: 'atrasado',
    franjas_frecuentes: ['atrasado'], coincidencias: 3, meses_observados: 6 });
});

test('muestra la franja mas frecuente sin mayoria y conserva la distincion de consistencia', () => {
  const meses = [1, 2, 3, 4, 5, 6, 7];
  const resultado = construirReportePagos({ alumnos: [alumno], mensualidades: meses.map((mes) => cuota(mes)),
    pagos: meses.map((mes, index) => pago(mes, [3, 3, 3, 12, 12, 22, 22][index])), periodo: periodo() });
  expect(resultado.habitos[0]).toMatchObject({ franja: 'sin_patron', franja_frecuente: '1_5',
    coincidencias: 3, meses_observados: 7 });
});

test.each([{ mes: '13', anio: '2026' }, { mes: '2', anio: '2026', desde: '2026-02-30' },
  { mes: '11', anio: '2026', desde: '2026-11-20', hasta: '2026-11-10' }])('rechaza periodo o rango invalido %j', (query) => {
  expect(() => resolverPeriodoReporte(query, new Date('2026-11-03'))).toThrow();
});

test('fecha de pago y no periodo de cuota determina los recibidos', () => {
  const resultado = construirReportePagos({ alumnos: [alumno], mensualidades: [cuota(10)],
    pagos: [pago(10, 5, { fecha_pago: '2026-11-02' })], periodo: periodo() });
  expect(resultado.resumen).toMatchObject({ pagos: 1, alumnos: 1, total_confirmado: 20 });
  expect(resultado.pagos[0].asignaciones[0]).toMatchObject({ mes: 10 });
});

test('agrupado cuenta una transferencia, dos alumnos e importes en centavos', () => {
  const grupo = { _id: 'g1', estado: 'Conciliado', fecha_pago: '2026-11-05', codigo: 'PA-QA' };
  const resultado = construirReportePagos({ alumnos: [alumno], mensualidades: [cuota(11), cuota(11, {
    _id: 'm2', id_alumno: { ...alumno, _id: 'a2' } })], pagos: [pago(11, 5, { monto_pagado: 10.01, id_pago_agrupado: grupo }),
    pago(11, 5, { _id: 'p2', id_mensualidad: 'm2', monto_pagado: 10.02, id_pago_agrupado: grupo })], periodo: periodo() });
  expect(resultado.resumen).toMatchObject({ pagos: 1, alumnos: 2, total_confirmado: 20.03 });
});

test('habito usa fecha de cuota completada, no primer abono', () => {
  const resultado = construirReportePagos({ alumnos: [alumno], mensualidades: [cuota(9), cuota(10)],
    pagos: [pago(9, 2, { monto_pagado: 5 }), pago(9, 14, { monto_pagado: 15 }), pago(10, 12)], periodo: periodo() });
  expect(resultado.habitos[0]).toMatchObject({ franja: '6_15', franja_frecuente: '6_15', coincidencias: 2, meses_observados: 2 });
});

test('cuotas con credito o sin evidencia confirmada no inventan habito', () => {
  const resultado = construirReportePagos({ alumnos: [alumno], mensualidades: [cuota(9, { credito_aplicado: 10 }),
    cuota(10, { pago_en_revision: true })], pagos: [pago(9, 3), pago(10, 3)], periodo: periodo() });
  expect(resultado.habitos[0]).toMatchObject({ franja: 'insuficiente', franja_frecuente: null,
    franjas_frecuentes: [], meses_observados: 0 });
});

test.each(['Rechazado', 'Anulado'])('grupo %s no es dinero recibido ni evidencia de habito', (estado) => {
  const resultado = construirReportePagos({ alumnos: [alumno], mensualidades: [cuota(11)],
    pagos: [pago(11, 3, { id_pago_agrupado: { _id: 'g1', estado } })], periodo: periodo() });
  expect(resultado.resumen.pagos).toBe(0);
});

test('separa confirmados y revision sin confundir credito provisional con pago directo confirmado', () => {
  const resultado = construirReportePagos({ alumnos: [alumno], mensualidades: [cuota(11, {
    estatus: 'En revision', credito_en_revision: 1, pago_en_revision: false }), cuota(10, { pago_en_revision: true })],
    pagos: [pago(11, 2), pago(10, 5, { fecha_pago: '2026-11-03', monto_pagado: 10 })], periodo: periodo() });
  expect(resultado.resumen).toMatchObject({ confirmados: 1, en_revision: 1, total_confirmado: 20, total_en_revision: 10 });
});

test('grupo entre sedes suma solo asignaciones de la sede consultada', () => {
  const grupo = { _id: 'g1', estado: 'Conciliado', fecha_pago: '2026-11-05', monto_total: 40 };
  const resultado = construirReportePagos({ alumnos: [alumno], mensualidades: [cuota(11), cuota(11, {
    _id: 'm2', id_alumno: { ...alumno, _id: 'a2', sede: { _id: 's2' } } })], pagos: [pago(11, 5, { id_pago_agrupado: grupo }),
    pago(11, 5, { _id: 'p2', id_mensualidad: 'm2', id_pago_agrupado: grupo })], sede: 's1', periodo: periodo() });
  expect(resultado.resumen).toMatchObject({ pagos: 1, alumnos: 1, total_confirmado: 20 });
});

test('rango incluye extremos y excluye pagos fuera del intervalo', () => {
  const resultado = construirReportePagos({ alumnos: [alumno], mensualidades: [cuota(11)],
    pagos: [pago(11, 1), pago(11, 5), pago(11, 15), pago(11, 16)],
    periodo: resolverPeriodoReporte({ mes: 11, anio: 2026, desde: '2026-11-05', hasta: '2026-11-15' }, new Date('2026-11-20')) });
  expect(resultado.resumen.pagos).toBe(2);
});

test.each([['anticipado', '2026-08-25', '2026-09-25'], ['atrasado', '2026-10-03', '2026-11-03']])(
  'habito distingue %s de los dias del mes de cobro', (franja, primera, segunda) => {
    const resultado = construirReportePagos({ alumnos: [alumno], mensualidades: [cuota(9), cuota(10)],
      pagos: [pago(9, 3, { fecha_pago: primera }), pago(10, 3, { fecha_pago: segunda })], periodo: periodo() });
    expect(resultado.habitos[0]).toMatchObject({ franja, meses_observados: 2, coincidencias: 2 });
  });

test('coincidencias unitarias empatadas conservan sus franjas y el rango de recibidos no altera el habito', () => {
  const resultado = construirReportePagos({ alumnos: [alumno], mensualidades: [cuota(9), cuota(10)],
    pagos: [pago(9, 3), pago(10, 12)],
    periodo: resolverPeriodoReporte({ mes: 11, anio: 2026, desde: '2026-11-10', hasta: '2026-11-15' }, new Date('2026-11-20')) });
  expect(resultado.resumen.pagos).toBe(0);
  expect(resultado.habitos[0]).toMatchObject({ franja: 'sin_patron', franjas_frecuentes: ['1_5', '6_15'],
    coincidencias: 1, meses_observados: 2 });
});

test('respeta tolerancia financiera al encontrar la fecha de cancelacion', () => {
  const resultado = construirReportePagos({ alumnos: [alumno], mensualidades: [cuota(9), cuota(10)],
    pagos: [pago(9, 5, { monto_pagado: 19.95, monto_pagado_bs: 19950 }),
      pago(10, 4, { monto_pagado: 19.95, monto_pagado_bs: 19950 })], periodo: periodo() });
  expect(resultado.habitos[0]).toMatchObject({ franja: '1_5', meses_observados: 2 });
});

test('no usa cuotas de inscripcion para estimar pero incluye cancelaciones posteriores al mes consultado', () => {
  const resultado = construirReportePagos({ alumnos: [alumno], mensualidades: [cuota(9, { es_inscripcion: true }), cuota(10)],
    pagos: [pago(9, 3), pago(10, 3, { fecha_pago: '2026-12-03' })], periodo: periodo() });
  expect(resultado.habitos[0]).toMatchObject({ franja: 'insuficiente', meses_observados: 1 });
});

test.each([['usuario', { mes: 11, anio: 2026 }, 403], ['admin', { mes: 13, anio: 2026 }, 400],
  ['admin', { mes: 1, anio: 2020, id_sede: 'invalida' }, 400]])('controlador valida %s antes de consultar', async (rol, query, estado) => {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await getReportePagos({ user: { rol }, query }, res);
  expect(res.status).toHaveBeenCalledWith(estado);
  expect(getTenantBusinessConnection).not.toHaveBeenCalled();
});