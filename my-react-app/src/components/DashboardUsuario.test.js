import React from 'react';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardUsuario from './DashboardUsuario';
import PagoAgrupado from './PagoAgrupado';

jest.mock('./TerminosPendientesAlert.js', () => () => null);
jest.mock('./ModalPago', () => (props) => props.open ? <div role="dialog" aria-label="Confirmar transferencia">
  <span>Transferir {props.pago.monto.toFixed(2)}</span>
  <button onClick={() => props.onSubmitPayment({ montoPagadoMoneda: props.pago.monto, montoPagadoBs: 31415.52,
    fechaPago: '2026-10-07', metodoPago: 'Pago movil', referencia: '262626' })}>Confirmar</button>
</div> : null);

const fetchOriginal = global.fetch;
let creditoCompleto;

beforeEach(() => {
  creditoCompleto = false;
  localStorage.setItem('usuario', JSON.stringify({ id: 'u1' }));
  global.fetch = jest.fn(async (url, options = {}) => {
    let data;
    if (options.method === 'POST') data = { codigo: 'PA-QA', atletas: 2 };
    else if (url.includes('/api/representantes/por-usuario')) data = { _id: 'r1' };
    else if (url.includes('/api/alumnos/por-representante/null')) data = [];
    else if (url.includes('/api/alumnos/por-representante/r1')) data = [
      { _id: 'a1', nombres: 'Ana', representante: 'r1', saldo_a_favor_mensualidades: 1.03 },
      { _id: 'a2', nombres: 'Eva', representante: 'r1', saldo_a_favor_mensualidades: 1.02 }
    ];
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

afterEach(() => { global.fetch = fetchOriginal; localStorage.clear(); });

test('el dashboard muestra octubre neto y total familiar tras aplicar credito disponible', async () => {
  render(<MemoryRouter><DashboardUsuario /></MemoryRouter>);
  expect(await screen.findByRole('button', { name: 'Pagar $17.97' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Pagar $17.98' })).toBeInTheDocument();
  expect(screen.getByText('$35.95')).toBeInTheDocument();
  expect(screen.getByText('-$1.03')).toBeInTheDocument();
  expect(screen.getByText('-$1.02')).toBeInTheDocument();
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
  expect(screen.queryByRole('button', { name: /Pagar todo junto/ })).not.toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Pagar todo junto · 3 atletas' })).toBeEnabled();
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