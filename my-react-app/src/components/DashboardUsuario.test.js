import React from 'react';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardUsuario from './DashboardUsuario';
import PagoAgrupado from './PagoAgrupado';

jest.mock('./TerminosPendientesAlert.js', () => () => null);
jest.mock('./ModalPago', () => (props) => props.open ? <div role="dialog" aria-label="Confirmar transferencia">
  <span>Transferir {props.pago.monto.toFixed(2)}</span>
  <button onClick={async () => {
    await props.onSubmitPayment({ montoPagadoMoneda: props.pago.monto, montoPagadoBs: props.conceptoPago === 'campanias' ? null : 31415.52,
      moneda: props.currencyCode || 'USD', fechaPago: '2026-10-07', metodoPago: props.conceptoPago === 'campanias' ? 'Zelle' : 'Pago movil', referencia: '262626' });
    props.onSuccess?.();
  }}>Confirmar</button>
</div> : null);

const fetchOriginal = global.fetch;
const cryptoOriginal = Object.getOwnPropertyDescriptor(window, 'crypto');
let creditoCompleto;

beforeEach(() => {
  creditoCompleto = false;
  localStorage.setItem('usuario', JSON.stringify({ id: 'u1' }));
  localStorage.setItem('token', 'qa-token');
  global.fetch = jest.fn(async (url, options = {}) => {
    let data;
    if (options.method === 'POST') data = { codigo: 'PA-QA', atletas: 2 };
    else if (url.includes('/api/representantes/por-usuario')) data = { _id: 'r1' };
    else if (url.includes('/api/alumnos/por-representante/null')) data = [];
    else if (url.includes('/api/alumnos/por-representante/r1')) data = [
      { _id: 'a1', nombres: 'Ana', representante: 'r1', saldo_a_favor_mensualidades: 1.03 },
      { _id: 'a2', nombres: 'Eva', representante: 'r1', saldo_a_favor_mensualidades: 1.02 }
    ];
    else if (url.includes('/api/campanias-cobro/mis-cargos')) data = { cargos: [] };
    else if (url.includes('/api/mensualidades')) {
      const credito = creditoCompleto ? 19 : url.includes('id_alumno=a1') ? 1.03 : 1.02;
      data = [{ _id: url.includes('id_alumno=a1') ? 'oct1' : 'oct2', mes: 10, anio: 2026,
        estatus: 'Insolvente', monto_esperado: 19, monto_sin_recargo_usd: 15, recargo_aplicado_usd: 4,
        fecha_vencimiento: '2026-10-05', credito_a_aplicar: credito,
        saldo_a_favor_disponible: credito, saldo_pendiente: Number((19 - credito).toFixed(2)) }];
    } else data = [];
    return { ok: true, json: async () => data };
  });
});

afterEach(() => {
  global.fetch = fetchOriginal; localStorage.clear();
  if (cryptoOriginal) Object.defineProperty(window, 'crypto', cryptoOriginal);
  else delete window.crypto;
});

const cargoResumen = (_id, alumno, saldo_pendiente, cambios = {}) => ({
  _id, alumno, saldo_pendiente, disponible: saldo_pendiente, pago_en_revision: false, moneda: 'USD', estado: 'pendiente',
  campania: { _id: 'camp1', moneda: 'USD', estado: 'abierta' }, ...cambios
});

function prepararCobrosAdicionales(cargosPorAtleta) {
  const fetchPrevio = global.fetch.getMockImplementation();
  global.fetch = jest.fn(async (url, options) => {
    if (url.includes('/api/campanias-cobro/mis-cargos')) {
      const alumnoId = new URL(url, window.location.origin).searchParams.get('alumnoId');
      return { ok: true, json: async () => ({ cargos: cargosPorAtleta[alumnoId] || [] }) };
    }
    return fetchPrevio(url, options);
  });
}

const cargoFamiliar = (cambios = {}) => cargoResumen('familia', 'a1', 10, {
  nombres: 'Ana', apellidos: 'QA', monto: 10, __v: 2, tipo_cobro: 'representante',
  representante_cobro: 'r1', nombre_representante: 'Representante QA',
  atletas_cubiertos: [{ alumno: 'a1', nombres: 'Ana', apellidos: 'QA', nombre_sede: 'Sede QA' },
    { alumno: 'a2', nombres: 'Eva', apellidos: 'QA', nombre_sede: 'Sede QA' }],
  campania: { _id: 'camp1', nombre: 'Campaña familiar QA', moneda: 'USD', estado: 'abierta' }, ...cambios
});

test('campaña familiar se cuenta una vez y un unico cargo de dos hermanas se reporta sin crear un grupo', async () => {
  Object.defineProperty(window, 'crypto', { configurable: true, value: { randomUUID: () => '22000000-0000-4000-8000-000000000001' } });
  const familiar = cargoFamiliar();
  const fetchPrevio = global.fetch.getMockImplementation();
  let reportado = false;
  global.fetch = jest.fn(async (url, options = {}) => {
    if (url.includes('/mis-cargos')) return { ok: true, json: async () => ({
      cargos: [{ ...familiar, pago_en_revision: reportado, disponible: reportado ? 0 : 10 }]
    }) };
    if (url.includes('/cargos-agrupables')) return { ok: true, json: async () => ({ representante: 'r1', cargos: [familiar] }) };
    if (options.method === 'POST') {
      reportado = true;
      return { ok: true, json: async () => ({ repetida: false,
        cargo: { ...familiar, campania: 'camp1', __v: 3 },
        pago: { _id: 'pago-familia', cargo: 'familia', campania: 'camp1', moneda: 'USD', monto_pagado: 10,
          monto_pagado_bs: null, estado: 'en_revision', solicitud_id: options.body.get('solicitud_id'),
          registrado_por: { id: 'u1', rol: 'usuario' } }
      }) };
    }
    return fetchPrevio(url, options);
  });
  render(<MemoryRouter><DashboardUsuario /></MemoryRouter>);
  const franja = within(await screen.findByRole('region', { name: 'Cobros adicionales' }));
  expect(await franja.findByText('$10.00')).toBeInTheDocument();
  expect(franja.queryByText('$20.00')).not.toBeInTheDocument();
  expect(franja.queryByRole('alert')).not.toBeInTheDocument();
  fireEvent.click(franja.getByRole('button', { name: 'Pagar todo junto · 2 atletas' }));
  expect(await screen.findByText('1 de 1 seleccionados')).toBeInTheDocument();
  expect(screen.getByText(/Cobro compartido/)).toHaveTextContent('Ana QA');
  expect(screen.getByText(/Cobro compartido/)).toHaveTextContent('Eva QA');
  expect(screen.getByRole('button', { name: 'Continuar con el pago' })).toBeEnabled();
  expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Continuar con el pago' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirmar', exact: true }));
  expect(await screen.findByRole('alertdialog', { name: 'Pago reportado' })).toBeInTheDocument();
  const posts = global.fetch.mock.calls.filter(([, options]) => options?.method === 'POST');
  expect(posts).toHaveLength(1);
  expect(posts[0][0]).toContain('/api/campanias-cobro/camp1/cargos/familia/pagos');
  expect(posts[0][1].body.get('version')).toBe('2');
  expect(posts[0][1].body.get('monto_pagado')).toBe('10.00');
  expect(posts[0][1].body.get('estado')).toBe('en_revision');
  expect(posts[0][1].body.get('cargos')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
  const actualizado = within(await screen.findByRole('region', { name: 'Cobros adicionales' }));
  expect(await actualizado.findByText('En revisión: $10.00 USD')).toBeInTheDocument();
  expect(actualizado.getByText('$0.00')).toBeInTheDocument();
  expect(actualizado.queryByRole('alert')).not.toBeInTheDocument();
});

test.each([false, true])('campaña familiar con abono cuenta su saldo o reserva solo una vez, revision=%s', async (revision) => {
  const familiar = cargoFamiliar({ estado: 'abono', saldo_pendiente: 5, disponible: revision ? 0 : 5, pago_en_revision: revision });
  prepararCobrosAdicionales({ a1: [familiar], a2: [familiar] });
  render(<MemoryRouter><DashboardUsuario /></MemoryRouter>);
  const franja = within(await screen.findByRole('region', { name: 'Cobros adicionales' }));
  expect(await franja.findByText(revision ? '$0.00' : '$5.00')).toBeInTheDocument();
  expect(franja.queryByText('En revisión: $5.00 USD') !== null).toBe(revision);
  expect(franja.queryByRole('alert')).not.toBeInTheDocument();
});

test.each(['saldo', 'version', 'miembros', 'ajeno', 'duplicado', 'identificador'])(
  'campaña familiar no oculta datos inconsistentes entre hermanas: %s', async (caso) => {
    const familiar = cargoFamiliar();
    const segundo = { ...familiar };
    if (caso === 'saldo') { segundo.saldo_pendiente = 5; segundo.disponible = 5; segundo.estado = 'abono'; }
    if (caso === 'version') segundo.__v = 3;
    if (caso === 'identificador') segundo._id = {};
    if (caso === 'miembros') segundo.atletas_cubiertos = [...familiar.atletas_cubiertos, { alumno: 'a3', nombres: 'Otra', apellidos: 'QA', nombre_sede: 'Sede QA' }];
    if (caso === 'ajeno') segundo.atletas_cubiertos = [familiar.atletas_cubiertos[0]];
    prepararCobrosAdicionales({ a1: [familiar], a2: caso === 'duplicado' ? [familiar, familiar] : [segundo] });
    render(<MemoryRouter><DashboardUsuario /></MemoryRouter>);
    const franja = within(await screen.findByRole('region', { name: 'Cobros adicionales' }));
    expect(await franja.findByRole('alert')).toHaveTextContent('No se pudo verificar el total de cobros adicionales.');
    expect(franja.queryByText('$10.00')).not.toBeInTheDocument();
  });

test('separa por moneda los cobros agrupables, las transferencias en revision y los otros saldos', async () => {
  prepararCobrosAdicionales({
    a1: [cargoResumen('cargo1', 'a1', 30, { pago_en_revision: true, disponible: 0 }),
      cargoResumen('euro1', 'a1', 0.1, { moneda: 'EUR', campania: { moneda: 'EUR', estado: 'abierta' } }),
      cargoResumen('exento', 'a1', 40, { estado: 'no_aplica' }),
      cargoResumen('cancelado', 'a1', 50, { campania: { moneda: 'USD', estado: 'cancelada' } })],
    a2: [cargoResumen('cargo2', 'a2', 12.5, { estado: 'abono' }), cargoResumen('pagado', 'a2', 0, { estado: 'pagado' }),
      cargoResumen('cerrado', 'a2', 5, { campania: { moneda: 'USD', estado: 'cerrada' } }),
      cargoResumen('euro2', 'a2', 0.2, { moneda: 'EUR', campania: { moneda: 'EUR', estado: 'abierta' } })]
  });
  render(<MemoryRouter><DashboardUsuario /></MemoryRouter>);
  const franja = within(await screen.findByRole('region', { name: 'Cobros adicionales' }));
  expect(await franja.findByText('$12.50')).toHaveTextContent('USD');
  expect(franja.getByText('€0.30')).toHaveTextContent('EUR');
  expect(franja.getByText('Por pagar')).toBeInTheDocument();
  expect(franja.getByText('En revisión: $30.00 USD')).toBeInTheDocument();
  expect(franja.getByText('Otros saldos: $5.00 USD')).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/mis-cargos?alumnoId=a2'), expect.objectContaining({
    headers: { Authorization: 'Bearer qa-token' }, cache: 'no-store', signal: expect.any(AbortSignal)
  }));
});

test('concuerda el dashboard con el pago agrupado cuando treinta de sesenta dolares estan en revision', async () => {
  const reinscripcion = { _id: 'reinscripcion', nombre: 'Reinscripcion', moneda: 'USD', estado: 'abierta' };
  const aniversario = { _id: 'aniversario', nombre: 'Aniversario', moneda: 'USD', estado: 'abierta' };
  const cargos = [
    { ...cargoResumen('ana-reinscripcion', 'a1', 20, { pago_en_revision: true, disponible: 0, campania: reinscripcion }), nombres: 'Ana', apellidos: 'QA', __v: 0 },
    { ...cargoResumen('ana-aniversario', 'a1', 10, { campania: aniversario }), nombres: 'Ana', apellidos: 'QA', __v: 0 },
    { ...cargoResumen('eva-reinscripcion', 'a2', 20, { campania: reinscripcion }), nombres: 'Eva', apellidos: 'QA', __v: 0 },
    { ...cargoResumen('eva-aniversario', 'a2', 10, { pago_en_revision: true, disponible: 0, campania: aniversario }), nombres: 'Eva', apellidos: 'QA', __v: 0 }
  ];
  prepararCobrosAdicionales({ a1: cargos.filter((cargo) => cargo.alumno === 'a1'), a2: cargos.filter((cargo) => cargo.alumno === 'a2') });
  const fetchPrevio = global.fetch.getMockImplementation();
  global.fetch = jest.fn(async (url, options) => url.includes('/cargos-agrupables')
    ? { ok: true, json: async () => ({ representante: 'r1', cargos: cargos.filter((cargo) => !cargo.pago_en_revision) }) }
    : fetchPrevio(url, options));
  render(<MemoryRouter><DashboardUsuario /></MemoryRouter>);
  const franja = within(await screen.findByRole('region', { name: 'Cobros adicionales' }));
  expect(await franja.findByText('$30.00')).toBeInTheDocument();
  expect(franja.getByText('En revisión: $30.00 USD')).toBeInTheDocument();
  expect(franja.queryByText('$60.00')).not.toBeInTheDocument();
  fireEvent.click(franja.getByRole('button', { name: 'Pagar todo junto · 2 atletas' }));
  expect(await screen.findByText('2 de 2 seleccionados')).toBeInTheDocument();
  expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(2);
  const resumen = within(screen.getByRole('complementary', { name: 'Resumen del pago adicional' }));
  expect(resumen.getAllByText(/USD\s*30,00/)).toHaveLength(2);
  expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
});

test('un abono parcial en revision no se vuelve a ofrecer como cargo agrupable completo', async () => {
  prepararCobrosAdicionales({
    a1: [cargoResumen('parcial', 'a1', 30, { pago_en_revision: true, disponible: 20 })],
    a2: [cargoResumen('libre', 'a2', 12.5)]
  });
  render(<MemoryRouter><DashboardUsuario /></MemoryRouter>);
  const franja = within(await screen.findByRole('region', { name: 'Cobros adicionales' }));
  expect(await franja.findByText('$12.50')).toBeInTheDocument();
  expect(franja.getByText('En revisión: $10.00 USD')).toBeInTheDocument();
  expect(franja.getByText('Otros saldos: $20.00 USD')).toBeInTheDocument();
});

test('muestra cero por pagar si todos los cargos adicionales ya tienen transferencia en revision', async () => {
  prepararCobrosAdicionales({ a1: [cargoResumen('reservado', 'a1', 30, { pago_en_revision: true, disponible: 0 })] });
  render(<MemoryRouter><DashboardUsuario /></MemoryRouter>);
  const franja = within(await screen.findByRole('region', { name: 'Cobros adicionales' }));
  expect(await franja.findByText('$0.00')).toBeInTheDocument();
  expect(franja.getByText('En revisión: $30.00 USD')).toBeInTheDocument();
  expect(franja.queryByText(/^Otros saldos:/)).not.toBeInTheDocument();
});

test('muestra cero en cobros adicionales solo despues de consultar todos los atletas', async () => {
  render(<MemoryRouter><DashboardUsuario /></MemoryRouter>);
  const franja = within(await screen.findByRole('region', { name: 'Cobros adicionales' }));
  expect(await franja.findByText('$0.00')).toBeInTheDocument();
  expect(franja.queryByRole('status')).not.toBeInTheDocument();
});

test.each(['http', 'red', 'json', 'formato', 'saldo', 'moneda', 'duplicado', 'ajeno', 'disponible', 'revision', 'reserva-inconsistente'])(
  'no muestra un total parcial si falla un atleta en cobros adicionales (%s) y permite reintentar', async (tipo) => {
    prepararCobrosAdicionales({ a1: [cargoResumen('cargo1', 'a1', 30)], a2: [cargoResumen('cargo2', 'a2', 12.5)] });
    const fetchPrevio = global.fetch.getMockImplementation();
    let fallar = true;
    global.fetch = jest.fn(async (url, options) => {
      if (url.includes('/mis-cargos?alumnoId=a2') && fallar) {
        if (tipo === 'red') throw new Error('Failed to fetch');
        if (tipo === 'json') return { ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); } };
        const cargo = cargoResumen(tipo === 'duplicado' ? 'cargo1' : 'cargo2', tipo === 'ajeno' ? 'otro' : 'a2', tipo === 'saldo' ? -1 : 12.5,
          tipo === 'moneda' ? { moneda: 'GBP', campania: { moneda: 'GBP', estado: 'abierta' } } : {});
        if (tipo === 'disponible') cargo.disponible = 13;
        if (tipo === 'revision') cargo.pago_en_revision = 'si';
        if (tipo === 'reserva-inconsistente') cargo.disponible = 0;
        return { ok: tipo !== 'http', status: tipo === 'http' ? 503 : 200,
          json: async () => ({ cargos: tipo === 'formato' ? {} : [cargo] }) };
      }
      return fetchPrevio(url, options);
    });
    render(<MemoryRouter><DashboardUsuario /></MemoryRouter>);
    const franja = within(await screen.findByRole('region', { name: 'Cobros adicionales' }));
    expect(await franja.findByRole('alert')).toBeInTheDocument();
    expect(franja.queryByText('$0.00')).not.toBeInTheDocument();
    expect(franja.queryByText('$30.00')).not.toBeInTheDocument();
    expect(screen.getByText('$35.95')).toBeInTheDocument();
    fallar = false;
    fireEvent.click(franja.getByRole('button', { name: 'Reintentar cobros adicionales' }));
    expect(await franja.findByText('$42.50')).toBeInTheDocument();
    expect(franja.queryByRole('alert')).not.toBeInTheDocument();
    expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  }
);

test('espera el ultimo saldo adicional y cancela las consultas al salir del dashboard', async () => {
  prepararCobrosAdicionales({ a1: [cargoResumen('cargo1', 'a1', 30)] });
  const fetchPrevio = global.fetch.getMockImplementation();
  let completar;
  global.fetch = jest.fn(async (url, options) => {
    if (url.includes('/mis-cargos?alumnoId=a2')) return new Promise((resolve) => { completar = resolve; });
    return fetchPrevio(url, options);
  });
  const { unmount } = render(<MemoryRouter><DashboardUsuario /></MemoryRouter>);
  const franja = within(await screen.findByRole('region', { name: 'Cobros adicionales' }));
  expect(franja.getByRole('status')).toHaveTextContent('Cargando');
  expect(franja.queryByText('$30.00')).not.toBeInTheDocument();
  expect(franja.queryByText('$0.00')).not.toBeInTheDocument();
  await act(async () => completar({ ok: true, json: async () => ({ cargos: [cargoResumen('cargo2', 'a2', 12.5)] }) }));
  expect(await franja.findByText('$42.50')).toBeInTheDocument();
  unmount();
  const consultas = global.fetch.mock.calls.filter(([url]) => url.includes('/mis-cargos'));
  expect(consultas).toHaveLength(2);
  expect(consultas.every(([, options]) => options.signal.aborted)).toBe(true);
});

test('el dashboard muestra octubre neto y total familiar tras aplicar credito disponible', async () => {
  render(<MemoryRouter><DashboardUsuario /></MemoryRouter>);
  expect(await screen.findByRole('button', { name: 'Pagar $17.97' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Pagar $17.98' })).toBeInTheDocument();
  expect(screen.getByText('$35.95')).toBeInTheDocument();
  expect(screen.getByText('-$1.03')).toBeInTheDocument();
  expect(screen.getByText('-$1.02')).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Pagos familiares' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Mensualidades' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Cobros adicionales' })).toBeInTheDocument();
  const botonMensualidades = within(screen.getByRole('region', { name: 'Mensualidades' })).getByRole('button', { name: 'Pagar todo junto · 2 atletas' });
  const botonCobros = within(screen.getByRole('region', { name: 'Cobros adicionales' })).getByRole('button', { name: 'Pagar todo junto · 2 atletas' });
  expect(botonMensualidades).toHaveClass('MuiButton-contained');
  expect(botonCobros).toHaveClass('MuiButton-contained');
  const propiedades = ['width', 'minHeight', 'fontSize', 'fontWeight', 'borderRadius', 'backgroundColor', 'color', 'paddingLeft', 'paddingRight'];
  expect(propiedades.map((propiedad) => window.getComputedStyle(botonCobros)[propiedad]))
    .toEqual(propiedades.map((propiedad) => window.getComputedStyle(botonMensualidades)[propiedad]));
});

test('el dashboard abre cobros adicionales de los hermanos aunque no deban mensualidades', async () => {
  const fetchPrevio = global.fetch.getMockImplementation();
  global.fetch = jest.fn(async (url, options) => {
    if (url.includes('/api/mensualidades')) return { ok: true, json: async () => [{ _id: 'mes-pagado', mes: 10, anio: 2026,
      estatus: 'Pagado', monto_esperado: 10, saldo_pendiente: 0 }] };
    if (url.includes('/cargos-agrupables')) return { ok: true, json: async () => ({ representante: 'r1', cargos: [
      { _id: 'cargo1', alumno: 'a1', nombres: 'Ana', apellidos: 'QA', moneda: 'USD', saldo_pendiente: 30, __v: 0,
        campania: { _id: 'camp1', nombre: 'Viaje QA' } },
      { _id: 'cargo2', alumno: 'a2', nombres: 'Eva', apellidos: 'QA', moneda: 'USD', saldo_pendiente: 30, __v: 0,
        campania: { _id: 'camp1', nombre: 'Viaje QA' } }
    ] }) };
    return fetchPrevio(url, options);
  });
  localStorage.setItem('token', 'qa-token');
  render(<MemoryRouter><DashboardUsuario /></MemoryRouter>);
  const franjaCobros = await screen.findByRole('region', { name: 'Cobros adicionales' });
  fireEvent.click(within(franjaCobros).getByRole('button', { name: 'Pagar todo junto · 2 atletas' }));
  expect(await screen.findByRole('checkbox', { name: 'Seleccionar Ana QA - Viaje QA' })).toBeInTheDocument();
  expect(screen.getByRole('checkbox', { name: 'Seleccionar Eva QA - Viaje QA' })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Mensualidades' })).not.toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/cargos-agrupables?alumnoId=a1'), expect.objectContaining({
    headers: { Authorization: 'Bearer qa-token' }, cache: 'no-store'
  }));
  expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
});

test.each(['Entendido', 'Cerrar aviso de pago agrupado'])('muestra la tarjeta de pago reportado y permite cerrarla con %s sin reenviar', async (cierre) => {
  Object.defineProperty(window, 'crypto', { configurable: true, value: { randomUUID: () => '22000000-0000-4000-8000-000000000001' } });
  const cargos = [
    { _id: 'cargo1', alumno: 'a1', nombres: 'Ana', apellidos: 'QA', moneda: 'USD', saldo_pendiente: 30, __v: 0, campania: { _id: 'camp1', nombre: 'Viaje QA' } },
    { _id: 'cargo2', alumno: 'a2', nombres: 'Eva', apellidos: 'QA', moneda: 'USD', saldo_pendiente: 12.5, __v: 0, campania: { _id: 'camp2', nombre: 'Torneo QA' } }
  ];
  const fetchPrevio = global.fetch.getMockImplementation();
  let reportado = false;
  global.fetch = jest.fn(async (url, options) => {
    if (url.includes('/cargos-agrupables')) return { ok: true, json: async () => ({ representante: 'r1', cargos }) };
    if (url.includes('/mis-cargos')) {
      const alumno = new URL(url, window.location.origin).searchParams.get('alumnoId');
      return { ok: true, json: async () => ({ cargos: cargos.filter((cargo) => cargo.alumno === alumno).map((cargo) => ({ ...cargo,
        estado: 'pendiente', campania: { ...cargo.campania, estado: 'abierta', moneda: 'USD' },
        pago_en_revision: reportado, disponible: reportado ? 0 : cargo.saldo_pendiente })) }) };
    }
    if (url.includes('/campanias-cobro/pagos-agrupados') && options?.method === 'POST') {
      reportado = true;
      return { ok: true, json: async () => ({ repetida: false, pagos: cargos.map((cargo) => ({
        _id: `pago-${cargo._id}`, cargo: cargo._id, campania: cargo.campania._id,
        monto_pagado: cargo.saldo_pendiente, moneda: 'USD', estado: 'en_revision', monto_pagado_bs: null,
        agrupacion: { id: options.body.get('solicitud_id'), monto_total: 42.5 }
      })) }) };
    }
    return fetchPrevio(url, options);
  });
  render(<MemoryRouter><DashboardUsuario /></MemoryRouter>);
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  const franja = within(await screen.findByRole('region', { name: 'Cobros adicionales' }));
  fireEvent.click(franja.getByRole('button', { name: 'Pagar todo junto · 2 atletas' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Continuar con el pago' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
  const tarjeta = await screen.findByRole('alertdialog', { name: 'Pago agrupado reportado' });
  expect(within(tarjeta).getByText('Pendiente de revisión')).toBeInTheDocument();
  expect(tarjeta).toHaveAccessibleDescription('Recibimos tu reporte de pago de cobros adicionales. La academia lo revisará antes de confirmarlo.');
  expect(within(tarjeta).getByText('El saldo pendiente se actualizará cuando el pago sea confirmado.')).toBeInTheDocument();
  fireEvent.click(within(tarjeta).getByRole('button', { name: cierre }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  expect(screen.getByRole('heading', { name: 'Mis atletas' })).toBeInTheDocument();
  const franjaActualizada = within(screen.getByRole('region', { name: 'Cobros adicionales' }));
  expect(await franjaActualizada.findByText('$0.00')).toBeInTheDocument();
  expect(franjaActualizada.getByText('En revisión: $42.50 USD')).toBeInTheDocument();
  expect(global.fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
});

test('el pago agrupado transfiere el neto y confirma el credito de cada atleta', async () => {
  render(<PagoAgrupado />);
  expect(await screen.findByText('$35.95')).toBeInTheDocument();
  expect(screen.getByText('-$2.05')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Continuar con el pago' }));
  expect(screen.getByText('Transferir 35.95')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
  await waitFor(() => expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(true));
  const [, options] = global.fetch.mock.calls.find(([, options]) => options?.method === 'POST');
  expect(options.body.get('monto_total')).toBe('35.95');
  expect(JSON.parse(options.body.get('asignaciones'))).toEqual([
    { id_mensualidad: 'oct1', credito_a_aplicar: 1.03 }, { id_mensualidad: 'oct2', credito_a_aplicar: 1.02 }
  ]);
});

test('agrupa julio de una atleta y agosto de otra tomando la deuda mas antigua de cada una', async () => {
  const fetchPrevio = global.fetch.getMockImplementation();
  global.fetch = jest.fn(async (url, options) => {
    if (url.includes('/api/mensualidades')) {
      const primera = url.includes('id_alumno=a1');
      const mes = primera ? 7 : 8;
      const cuota = { anio: 2026, estatus: 'Insolvente', monto_esperado: primera ? 20 : 25,
        monto_sin_recargo_usd: 20, recargo_aplicado_usd: primera ? 0 : 5 };
      return { ok: true, json: async () => [
        { ...cuota, _id: `oct-${primera ? 'a1' : 'a2'}`, mes: 10 },
        { ...cuota, _id: `antigua-${primera ? 'a1' : 'a2'}`, mes },
        { ...cuota, _id: `pagada-${primera ? 'a1' : 'a2'}`, mes: 6, estatus: 'Pagado' }
      ] };
    }
    return fetchPrevio(url, options);
  });

  render(<PagoAgrupado />);
  expect(await screen.findByText('2 de 2 seleccionadas')).toBeInTheDocument();
  expect(screen.getByText('julio 2026 · Sin categoría')).toBeInTheDocument();
  expect(screen.getByText('agosto 2026 · Sin categoría')).toBeInTheDocument();
  expect(screen.getByText('$45.00')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Continuar con el pago' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
  await waitFor(() => expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(true));
  const [, options] = global.fetch.mock.calls.find(([, options]) => options?.method === 'POST');
  expect(JSON.parse(options.body.get('asignaciones'))).toEqual([
    { id_mensualidad: 'antigua-a1', credito_a_aplicar: 0 },
    { id_mensualidad: 'antigua-a2', credito_a_aplicar: 0 }
  ]);
  expect(await screen.findByText('Pago enviado correctamente')).toBeInTheDocument();
});

test('no incluye atletas de otro representante aunque esten asociadas directamente al usuario', async () => {
  const fetchPrevio = global.fetch.getMockImplementation();
  global.fetch = jest.fn(async (url, options) => {
    if (url.includes('/api/alumnos/por-representante/null')) {
      return { ok: true, json: async () => [
        { _id: 'a3', nombres: 'Ajena', representante: 'r2', usuario: 'u1' },
        { _id: 'a4', nombres: 'Sin representante', usuario: 'u1' }
      ] };
    }
    return fetchPrevio(url, options);
  });

  render(<PagoAgrupado />);
  expect(await screen.findByText('2 de 2 seleccionadas')).toBeInTheDocument();
  expect(screen.queryByText('Ajena')).not.toBeInTheDocument();
  expect(screen.queryByText('Sin representante')).not.toBeInTheDocument();
  const consultas = global.fetch.mock.calls.map(([url]) => url);
  expect(consultas.some((url) => /id_alumno=a[34]/.test(url))).toBe(false);
});

test('una cuota cubierta por credito ofrece usar saldo sin pedir una transferencia cero', async () => {
  creditoCompleto = true;
  render(<MemoryRouter><DashboardUsuario /></MemoryRouter>);
  expect(await screen.findAllByRole('button', { name: 'Usar saldo a favor' })).toHaveLength(2);
  expect(screen.queryByRole('region', { name: 'Mensualidades' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Pagar $0.00' })).not.toBeInTheDocument();
});

function prepararCargaConFallo(etapa, fallo) {
  const fetchPrevio = global.fetch.getMockImplementation();
  global.fetch = jest.fn(async (url, options) => {
    const coincide = etapa === 'representante' ? url.includes('/api/representantes/por-usuario')
      : etapa === 'atletas' ? url.includes('/api/alumnos/por-representante/r1')
        : etapa === 'directas' ? url.includes('/api/alumnos/por-representante/null')
          : url.includes('/api/mensualidades?id_alumno=a3');
    if (coincide && fallo.actual) {
      if (fallo.tipo === 'red') throw new Error('Failed to fetch');
      if (fallo.tipo === 'json') return { ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); } };
      return { ok: fallo.tipo === 'formato', status: fallo.tipo === 'formato' ? 200 : fallo.status || 503,
        json: async () => ({ error: 'Servicio no disponible' }) };
    }
    if (url.includes('/api/alumnos/por-representante/r1')) {
      const response = await fetchPrevio(url, options);
      return { ok: true, json: async () => [...await response.json(), { _id: 'a3', nombres: 'Luz', representante: 'r1' }] };
    }
    if (url.includes('/api/mensualidades?id_alumno=a3')) {
      return { ok: true, json: async () => [{ _id: 'oct3', mes: 10, anio: 2026,
        estatus: 'Pendiente', monto_esperado: 19, monto_sin_recargo_usd: 19, saldo_pendiente: 19 }] };
    }
    return fetchPrevio(url, options);
  });
}

const casosCarga = ['dashboard', 'agrupado'].flatMap((vista) =>
  ['representante', 'atletas', 'directas', 'mensualidades'].flatMap((etapa) =>
    ['http', 'red', 'formato'].map((tipo) => [vista, etapa, tipo])));

test.each(casosCarga)('%s muestra error y no permite pagar informacion parcial si falla %s (%s)', async (vista, etapa, tipo) => {
  prepararCargaConFallo(etapa, { actual: true, tipo });
  render(<MemoryRouter>{vista === 'dashboard' ? <DashboardUsuario /> : <PagoAgrupado />}</MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent(/No se pud/);
  expect(screen.getByRole('button', { name: 'Reintentar' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: /Pagar todo junto|Continuar con el pago/ })).not.toBeInTheDocument();
  expect(screen.queryByText('No tienes alumnos registrados.')).not.toBeInTheDocument();
  expect(screen.queryByText('No hay atletas con mensualidades pendientes elegibles.')).not.toBeInTheDocument();
  expect(screen.queryByText('Al día')).not.toBeInTheDocument();
  expect(screen.queryByText('Total pendiente')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Pagar \$/ })).not.toBeInTheDocument();
  expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  if (etapa === 'mensualidades') {
    expect(screen.getByRole('alert')).toHaveTextContent('Luz');
    if (vista === 'dashboard') expect(screen.getByText('Luz')).toBeInTheDocument();
  }
});

test.each(['dashboard', 'agrupado'])('%s permite reintentar y recuperar las tres atletas sin conservar una seleccion parcial', async (vista) => {
  const fallo = { actual: true, tipo: 'http' };
  prepararCargaConFallo('mensualidades', fallo);
  render(<MemoryRouter>{vista === 'dashboard' ? <DashboardUsuario /> : <PagoAgrupado />}</MemoryRouter>);
  await screen.findByRole('alert');
  fallo.actual = false;
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByText('$54.95')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  if (vista === 'dashboard') {
    expect(within(screen.getByRole('region', { name: 'Mensualidades' })).getByRole('button', { name: 'Pagar todo junto · 3 atletas' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Pagar $19.00' })).toBeEnabled();
  } else {
    expect(screen.getByText('3 de 3 seleccionadas')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar con el pago' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await screen.findByText('Pago enviado correctamente');
    const [, options] = global.fetch.mock.calls.find(([, config]) => config?.method === 'POST');
    expect(JSON.parse(options.body.get('asignaciones')).map((item) => item.id_mensualidad)).toEqual(['oct1', 'oct2', 'oct3']);
    expect(options.body.get('monto_total')).toBe('54.95');
  }
});

test.each(['dashboard', 'agrupado'])('%s distingue JSON invalido de una respuesta sin mensualidades', async (vista) => {
  prepararCargaConFallo('mensualidades', { actual: true, tipo: 'json' });
  render(<MemoryRouter>{vista === 'dashboard' ? <DashboardUsuario /> : <PagoAgrupado />}</MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Luz');
  expect(screen.queryByRole('button', { name: /Pagar todo junto|Continuar con el pago/ })).not.toBeInTheDocument();
});

test.each([
  ['dashboard', 401], ['dashboard', 403], ['agrupado', 401], ['agrupado', 403]
])('%s no interpreta el rechazo de acceso %s como ausencia de deuda', async (vista, status) => {
  prepararCargaConFallo('mensualidades', { actual: true, tipo: 'http', status });
  render(<MemoryRouter>{vista === 'dashboard' ? <DashboardUsuario /> : <PagoAgrupado />}</MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Luz');
  expect(screen.queryByText('Al día')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Pagar todo junto|Continuar con el pago/ })).not.toBeInTheDocument();
});

test.each(['dashboard', 'agrupado'])('%s espera todas las mensualidades, autentica las consultas y cancela al salir', async (vista) => {
  localStorage.setItem('token', 'qa-token');
  prepararCargaConFallo('mensualidades', { actual: false });
  const fetchPrevio = global.fetch.getMockImplementation();
  let liberar;
  global.fetch = jest.fn(async (url, options) => {
    const response = await fetchPrevio(url, options);
    if (url.includes('/api/mensualidades?id_alumno=a3')) {
      return new Promise((resolve) => { liberar = () => resolve(response); });
    }
    return response;
  });
  const { unmount } = render(<MemoryRouter>{vista === 'dashboard' ? <DashboardUsuario /> : <PagoAgrupado />}</MemoryRouter>);
  await waitFor(() => expect(liberar).toEqual(expect.any(Function)));
  expect(screen.getByRole('progressbar')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Pagar todo junto|Continuar con el pago/ })).not.toBeInTheDocument();
  expect(screen.queryByText('Al día')).not.toBeInTheDocument();
  expect(screen.queryByText('Total pendiente')).not.toBeInTheDocument();
  await act(async () => liberar());
  expect(await screen.findByText('$54.95')).toBeInTheDocument();
  for (const [, options] of global.fetch.mock.calls) expect(options.headers.Authorization).toBe('Bearer qa-token');
  const signal = global.fetch.mock.calls[0][1].signal;
  expect(signal.aborted).toBe(false);
  unmount();
  expect(signal.aborted).toBe(true);
});

test.each(['dashboard', 'agrupado'])('%s conserva el estado vacio cuando no existe representante y ambas listas estan vacias', async (vista) => {
  global.fetch = jest.fn(async (url) => ({ ok: true,
    json: async () => url.includes('/api/representantes/por-usuario') ? null : [] }));
  render(<MemoryRouter>{vista === 'dashboard' ? <DashboardUsuario /> : <PagoAgrupado />}</MemoryRouter>);
  expect(await screen.findByText(vista === 'dashboard'
    ? 'No tienes alumnos registrados.' : 'No hay atletas con mensualidades pendientes elegibles.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  expect(global.fetch.mock.calls.some(([url]) => url.includes('/api/mensualidades'))).toBe(false);
});

test.each(['dashboard', 'agrupado'])('%s distingue una lista de mensualidades vacia de un error de carga', async (vista) => {
  const fetchPrevio = global.fetch.getMockImplementation();
  global.fetch = jest.fn(async (url, options) => url.includes('/api/mensualidades')
    ? { ok: true, json: async () => [] } : fetchPrevio(url, options));
  render(<MemoryRouter>{vista === 'dashboard' ? <DashboardUsuario /> : <PagoAgrupado />}</MemoryRouter>);
  if (vista === 'dashboard') expect(await screen.findAllByRole('button', { name: 'Sin mensualidades' })).toHaveLength(2);
  else expect(await screen.findByText('No hay atletas con mensualidades pendientes elegibles.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  expect(screen.queryByText('Al día')).not.toBeInTheDocument();
});

test.each([
  ['dashboard', { mes: 13 }], ['agrupado', { mes: 13 }],
  ['dashboard', { saldo_pendiente: 'invalido' }], ['agrupado', { saldo_pendiente: 'invalido' }]
])('%s no omite silenciosamente mensualidades mal formadas (%j)', async (vista, invalido) => {
  const fetchPrevio = global.fetch.getMockImplementation();
  global.fetch = jest.fn(async (url, options) => url.includes('/api/mensualidades?id_alumno=a2')
    ? { ok: true, json: async () => [{ _id: 'erronea', mes: 10, anio: 2026, estatus: 'Pendiente', monto_esperado: 19, ...invalido }] }
    : fetchPrevio(url, options));
  render(<MemoryRouter>{vista === 'dashboard' ? <DashboardUsuario /> : <PagoAgrupado />}</MemoryRouter>);
  expect(await screen.findByRole('alert')).toHaveTextContent('Eva');
  expect(screen.queryByRole('button', { name: /Pagar todo junto|Continuar con el pago/ })).not.toBeInTheDocument();
});