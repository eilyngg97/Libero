const { crearVistaPrevia, normalizarTelefono } = require('../services/notificationPreview');
const { obtenerFechaCortePagoAlumnoMensualidad } = require('../services/monthlyDueDate');

function cuota(id = 'm1', overrides = {}, alumno = {}) {
  return {
    _id: id, mes: 11, anio: 2026, estatus: 'Pendiente', monto_esperado: 20,
    fecha_vencimiento: '2026-11-11T03:59:59.999Z',
    id_alumno: {
      _id: `a-${id}`, nombres: `Atleta ${id}`, activo: true, fecha_inicio_cobro: '2026-01-01T04:00:00Z',
      representante: { _id: 'r1', nombres: 'Maria', apellidos: 'Perez', telefono: '04141234567',
        whatsapp_consentimiento: { aceptado: true, fecha: '2026-10-22' } },
      ...alumno
    },
    ...overrides
  };
}

function previa(mensualidades, options = {}) {
  return crearVistaPrevia({ mensualidades, pagos: [], habilitadas: true, periodo: '2026-11',
    hoy: new Date('2026-11-09T15:00:00Z'), ...options });
}

test('agrupa dos atletas por representante, tipo y fecha sin duplicar avisos', () => {
  const result = previa([cuota(), cuota('m2')]);
  expect(result.avisos).toHaveLength(2);
  expect(result.avisos[0]).toMatchObject({ fecha: '2026-11-09', tipo: 'antes', momento: 'hoy', total: 40 });
  expect(result.avisos[1]).toMatchObject({ fecha: '2026-11-13', tipo: 'despues', momento: 'futuro' });
  expect(result.avisos[0].atletas).toHaveLength(2);
  expect(result.resumen).toEqual({ calculados: 2, elegibles_hoy: 1, bloqueados: 0 });
});

test('vencimientos personalizados distintos conservan sus propias fechas', () => {
  const result = previa([cuota(), cuota('m2', {}, { dia_limite_personalizado: 15 })]);
  expect(result.avisos.map((aviso) => aviso.fecha)).toEqual(['2026-11-09', '2026-11-13', '2026-11-14', '2026-11-18']);
});

test('respeta Caracas y los limites de mes, anio y febrero bisiesto', () => {
  const result = previa([cuota('m1', { mes: 1, anio: 2027 }, { dia_limite_personalizado: 1 })],
    { periodo: '2027-01', hoy: new Date('2026-12-31T03:59:59Z') });
  expect(result.avisos.map((aviso) => aviso.fecha)).toEqual(['2026-12-31', '2027-01-04']);
  expect(result.avisos[0].momento).toBe('futuro');
  expect(obtenerFechaCortePagoAlumnoMensualidad({ mes: 2, anio: 2028 },
    { dia_limite_personalizado: 31 }).toISOString()).toBe('2028-02-29T04:00:00.000Z');
});

test.each([
  ['Pagado', { estatus: 'Pagado' }, {}],
  ['Exonerado', { estatus: 'Exonerado' }, {}],
  ['Becado', { estatus: 'Becado' }, {}],
  ['Exento por reposo', { estatus: 'Exento por reposo' }, {}],
  ['En revision', { estatus: 'En revision' }, {}],
  ['pago en revision', { pago_en_revision: true }, {}],
  ['credito en revision', { credito_en_revision: 5 }, {}],
  ['Abono', { estatus: 'Abono' }, {}],
  ['credito aplicado', { credito_aplicado: 1 }, {}],
  ['monto cero', { monto_esperado: 0 }, {}],
  ['monto invalido', { monto_esperado: 'invalido' }, {}],
  ['inscripcion', { es_inscripcion: true }, {}],
  ['reingreso', { tipo_registro_inicial: 'reingreso' }, {}],
  ['baja', {}, { dado_de_baja: true }],
  ['inactivo', {}, { activo: false }],
  ['beca completa', {}, { tipo_mensualidad: 'beca_completa' }],
  ['sin representante', {}, { representante: null }],
  ['sin alumno', { id_alumno: null }, {}],
  ['fecha invalida', { fecha_vencimiento: 'bad' }, {}],
  ['antes de inicio de cobro', {}, { fecha_inicio_cobro: '2026-12-01T04:00:00Z' }]
])('excluye %s', (_, overrides, alumno) => {
  const result = previa([cuota('m1', overrides, alumno)]);
  expect(result.avisos).toHaveLength(0);
  expect(Object.values(result.exclusiones)).toEqual([1]);
});

test('excluye un abono aunque el estatus este desactualizado', () => {
  expect(previa([cuota()], { pagos: [{ id_mensualidad: 'm1', monto_pagado: 1 }] }).avisos).toEqual([]);
});

test('proyecta credito anterior en orden sin incluir meses anteriores en los avisos', () => {
  const alumno = { _id: 'a1', saldo_a_favor_mensualidades: 20 };
  const octubre = cuota('m0', { mes: 10 }, alumno);
  const noviembre = cuota('m1', {}, alumno);
  const result = previa([noviembre, octubre]);
  expect(result.avisos).toHaveLength(2);
  expect(result.avisos[0].atletas[0].mensualidad).toBe('m1');
  expect(previa([noviembre]).avisos).toEqual([]);
});

test('no mezcla representantes aunque compartan telefono', () => {
  const segunda = cuota('m2');
  segunda.id_alumno.representante = { ...segunda.id_alumno.representante, _id: 'r2' };
  expect(previa([cuota(), segunda]).avisos).toHaveLength(4);
});

test('conserva los bloqueos visibles sin inventar pendientes o consentimiento', () => {
  const mensualidad = cuota();
  mensualidad.id_alumno.representante.whatsapp_consentimiento = undefined;
  mensualidad.id_alumno.representante.telefono = '';
  const result = previa([mensualidad], { habilitadas: false });
  expect(result.resumen).toMatchObject({ calculados: 2, bloqueados: 2, elegibles_hoy: 0 });
  expect(result.avisos[0].bloqueos).toHaveLength(3);
});

test('no muta los datos ni recupera automaticamente fechas pasadas', () => {
  const mensualidades = [cuota()];
  const snapshot = JSON.stringify(mensualidades);
  const result = previa(mensualidades, { hoy: new Date('2026-11-20T15:00:00Z') });
  expect(result.avisos.every((aviso) => aviso.momento === 'pasado')).toBe(true);
  expect(result.resumen.elegibles_hoy).toBe(0);
  expect(JSON.stringify(mensualidades)).toBe(snapshot);
});

test.each([['04141234567', '584141234567'], ['+58 (414) 123-4567', '584141234567'], ['', null],
  ['telefono', null], ['012345', null]])('normaliza telefono %s', (input, output) => {
  expect(normalizarTelefono(input)).toBe(output);
});
