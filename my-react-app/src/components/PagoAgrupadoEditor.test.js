import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import PagoAgrupadoEditor from './PagoAgrupadoEditor';

const fetchOriginal = global.fetch;
const fixture = {
  pago: { _id: 'g1', codigo: 'PA-TEST', estado: 'En revision', fecha_pago: '2026-10-06T00:00:00.000Z',
    metodo_pago: 'Pago movil', referencia: '262626', monto_total: 28, monto_total_bs: 24427 },
  version: '0:2026-10-06T00:00:00.000Z', transacciones_disponibles: true,
  asignaciones: [
    { id_pago: 'p1', alumno_nombre: 'Ana Raga', mes: 10, anio: 2026, monto_pagado: 14, monto_pendiente: 14 },
    { id_pago: 'p2', alumno_nombre: 'Eva Raga', mes: 10, anio: 2026, monto_pagado: 14, monto_pendiente: 14 }
  ]
};

beforeEach(() => {
  global.fetch = jest.fn(async (url) => ({ ok: true, json: async () => url.includes('/tasa?')
    ? { tasa: 872.39, moneda: 'USD', fecha_pago: '2026-10-06', fecha_tasa: '2026-10-06' } : fixture }));
});

afterEach(() => { global.fetch = fetchOriginal; });

async function abrir(data = fixture) {
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => data });
  const onSaved = jest.fn().mockResolvedValue(undefined);
  const onClose = jest.fn();
  const view = render(<PagoAgrupadoEditor open pagoId="g1" onSaved={onSaved} onClose={onClose} />);
  await screen.findByText('Ana Raga');
  if (data.transacciones_disponibles && data.pago.estado === 'En revision') {
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled());
  }
  return { ...view, onSaved, onClose };
}

test('guarda el grupo completo y su version en una sola solicitud', async () => {
  const { onSaved } = await abrir();
  fireEvent.change(screen.getByLabelText(/Referencia/), { target: { value: '999999' } });
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ mensualidades_actualizadas: 2 }) });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  const [url, options] = global.fetch.mock.calls.find(([, options]) => options?.method === 'PATCH');
  expect(url).toContain('/api/pagos/agrupado/g1');
  expect(options.method).toBe('PATCH');
  expect(options.body.get('version')).toBe(fixture.version);
  expect(options.body.get('referencia')).toBe('999999');
  expect(options.body.get('monto_total')).toBe('28.00');
  expect(JSON.parse(options.body.get('asignaciones'))).toEqual([
    { id_pago: 'p1', monto_pagado: 14 }, { id_pago: 'p2', monto_pagado: 14 }
  ]);
});

test('el comprobante esta dentro de datos y permite adjuntar, descartar y guardar sin alterar el reparto', async () => {
  const { onSaved } = await abrir();
  const datos = screen.getByRole('region', { name: 'Datos del pago' });
  const comprobante = within(datos).getByRole('region', { name: 'Comprobante del pago' });
  const input = within(comprobante).getByLabelText('Cambiar comprobante');
  const archivo = new File(['QA'], 'comprobante.pdf', { type: 'application/pdf' });
  fireEvent.change(input, { target: { files: [archivo] } });
  expect(within(comprobante).getByText('comprobante.pdf')).toBeInTheDocument();
  fireEvent.click(within(comprobante).getByRole('button', { name: 'Descartar archivo' }));
  expect(within(comprobante).queryByText('comprobante.pdf')).not.toBeInTheDocument();
  fireEvent.change(input, { target: { files: [archivo] } });
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ mensualidades_actualizadas: 2 }) });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  const form = global.fetch.mock.calls.find(([, options]) => options?.method === 'PATCH')[1].body;
  expect(form.get('comprobante')).toHaveProperty('name', 'comprobante.pdf');
  expect(form.get('monto_total')).toBe('28.00');
  expect(JSON.parse(form.get('asignaciones'))).toEqual([
    { id_pago: 'p1', monto_pagado: 14 }, { id_pago: 'p2', monto_pagado: 14 }
  ]);
});

test('no guarda un monto en Bs cuyo equivalente no cubre los saldos', async () => {
  await abrir();
  fireEvent.change(screen.getByLabelText(/Total transferido/), { target: { value: '10000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('debe cubrir su saldo pendiente');
  expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false);
});

test('conflicto de version exige actualizar antes de volver a guardar', async () => {
  const { onSaved } = await abrir();
  global.fetch.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: 'El grupo cambio' }) });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('El grupo cambio');
  expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Actualizar grupo' })).toBeEnabled();
  expect(onSaved).not.toHaveBeenCalled();
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ...fixture, version: '1:nueva' }) });
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar grupo' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled());
  expect(global.fetch.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1);
});

test('MongoDB standalone muestra el bloqueo y no permite guardar', async () => {
  await abrir({ ...fixture, transacciones_disponibles: false });
  expect(screen.getByRole('alert')).toHaveTextContent('replica set');
  expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  expect(screen.getByLabelText('Equivalente USD - Ana Raga').tagName).toBe('OUTPUT');
});

test('un grupo conciliado ya no permite edicion', async () => {
  await abrir({ ...fixture, pago: { ...fixture.pago, estado: 'Conciliado' } });
  expect(screen.getByRole('alert')).toHaveTextContent('Solo se pueden editar pagos agrupados en revision');
  expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
});

test('conserva el importe transferido cuando existe excedente por retiro de recargo', async () => {
  const data = { ...fixture, asignaciones: fixture.asignaciones.map((item, index) => index === 0 ? { ...item, monto_pendiente: 10 } : item) };
  const { onSaved } = await abrir(data);
  expect(screen.getByText('Excedente: 4.00 USD')).toBeInTheDocument();
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ mensualidades_actualizadas: 2 }) });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(global.fetch.mock.calls.find(([, options]) => options?.method === 'PATCH')[1].body.get('monto_total')).toBe('28.00');
});

test('los equivalentes son calculados y no se pueden editar independientemente', async () => {
  await abrir({ ...fixture, asignaciones: fixture.asignaciones.map((item, index) => index === 0 ? { ...item, monto_pendiente: 10 } : item) });
  expect(screen.queryByRole('textbox', { name: /Equivalente/ })).not.toBeInTheDocument();
  expect(screen.getByLabelText('Equivalente USD - Ana Raga').tagName).toBe('OUTPUT');
  expect(screen.getByLabelText('Equivalente USD - Eva Raga').tagName).toBe('OUTPUT');
  expect(screen.getByLabelText('Equivalente USD - Ana Raga')).toHaveTextContent('14.00 USD');
});

test('50000 Bs muestra el equivalente por atleta con la tasa seleccionada y envia el total convertido', async () => {
  const data = { ...fixture, pago: { ...fixture.pago, monto_total_bs: 33207.06 },
    asignaciones: fixture.asignaciones.map((item) => ({ ...item, monto_pagado: 19, monto_pendiente: 19 })) };
  global.fetch.mockImplementation(async (url) => ({ ok: true, json: async () => url.includes('/tasa?')
    ? { tasa: 873.867, moneda: 'USD', fecha_pago: '2026-10-06', fecha_tasa: '2026-10-06' } : data }));
  const { onSaved } = await abrir(data);
  fireEvent.change(screen.getByLabelText(/Total transferido/), { target: { value: '50000' } });
  expect(screen.getByLabelText('Equivalente USD - Ana Raga')).toHaveTextContent('28.61');
  expect(screen.getByLabelText('Equivalente USD - Eva Raga')).toHaveTextContent('28.61');
  expect(screen.getByText('57.22')).toBeInTheDocument();
  expect(screen.getByText('Tasa oficial: 873.867 Bs/USD')).toBeInTheDocument();
  expect(screen.getAllByText('Excedente: 9.61 USD')).toHaveLength(2);
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ mensualidades_actualizadas: 2 }) });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  const form = global.fetch.mock.calls.find(([, options]) => options?.method === 'PATCH')[1].body;
  expect(form.get('monto_total')).toBe('57.22');
  expect(JSON.parse(form.get('asignaciones'))).toEqual([{ id_pago: 'p1', monto_pagado: 28.61 }, { id_pago: 'p2', monto_pagado: 28.61 }]);
});

test('cambiar la fecha consulta otra tasa y recalcula el equivalente', async () => {
  const original = global.fetch.getMockImplementation();
  global.fetch.mockImplementation(async (url, options) => url.includes('/tasa?fecha=2026-10-07')
    ? { ok: true, json: async () => ({ tasa: 1000, moneda: 'USD', fecha_pago: '2026-10-07', fecha_tasa: '2026-10-07' }) }
    : original(url, options));
  await abrir();
  fireEvent.change(screen.getByLabelText(/Total transferido/), { target: { value: '50000' } });
  fireEvent.change(screen.getByLabelText(/Fecha de pago/), { target: { value: '2026-10-07' } });
  expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  await waitFor(() => expect(screen.getByLabelText('Equivalente USD - Ana Raga')).toHaveTextContent('25.00'));
  expect(screen.getByLabelText('Equivalente USD - Eva Raga')).toHaveTextContent('25.00');
  expect(screen.getByText('Tasa oficial: 1000.00 Bs/USD')).toBeInTheDocument();
});

test('si no hay tasa no permite guardar ni inventa equivalentes', async () => {
  global.fetch.mockImplementation(async (url) => url.includes('/tasa?')
    ? { ok: false, status: 503, json: async () => ({ error: 'No hay tasa oficial disponible' }) }
    : { ok: true, json: async () => fixture });
  render(<PagoAgrupadoEditor open pagoId="g1" onSaved={jest.fn()} onClose={jest.fn()} />);
  expect(await screen.findByRole('alert')).toHaveTextContent('No hay tasa oficial disponible');
  expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  expect(screen.getByLabelText('Equivalente USD - Ana Raga')).toHaveTextContent('-');
});

test('el reparto desigual conserva los centavos de Bs y los del total convertido', async () => {
  await abrir({ ...fixture, asignaciones: [
    { ...fixture.asignaciones[0], monto_pagado: 15, monto_pendiente: 15 },
    { ...fixture.asignaciones[1], monto_pagado: 13, monto_pendiente: 13 }
  ] });
  fireEvent.change(screen.getByLabelText(/Total transferido/), { target: { value: '50000' } });
  expect(screen.getByLabelText('Equivalente USD - Ana Raga')).toHaveTextContent('30.70');
  expect(screen.getByLabelText('Equivalente USD - Eva Raga')).toHaveTextContent('26.61');
  expect(screen.getByText('Bs 26785.71')).toBeInTheDocument();
  expect(screen.getByText('Bs 23214.29')).toBeInTheDocument();
  expect(screen.getByText('57.31')).toBeInTheDocument();
});

test('usa EUR cuando esa es la moneda verificada por el backend', async () => {
  global.fetch.mockImplementation(async (url) => ({ ok: true, json: async () => url.includes('/tasa?')
    ? { tasa: 1000, moneda: 'EUR', fecha_pago: '2026-10-06', fecha_tasa: '2026-10-06' } : fixture }));
  await abrir();
  fireEvent.change(screen.getByLabelText(/Total transferido/), { target: { value: '50000' } });
  expect(screen.getByLabelText('Equivalente EUR - Ana Raga')).toHaveTextContent('25.00');
  expect(screen.getByLabelText('Equivalente EUR - Eva Raga')).toHaveTextContent('25.00');
  expect(screen.getByText('Total EUR')).toBeInTheDocument();
});

test('reintentar una tasa fallida conserva el monto y la fecha editados', async () => {
  const original = global.fetch.getMockImplementation();
  let falla = true;
  global.fetch.mockImplementation(async (url, options) => url.includes('/tasa?fecha=2026-10-07')
    ? { ok: !falla, json: async () => falla ? { error: 'Tasa temporalmente no disponible' }
      : { tasa: 1000, moneda: 'USD', fecha_pago: '2026-10-07', fecha_tasa: '2026-10-07' } }
    : original(url, options));
  await abrir();
  fireEvent.change(screen.getByLabelText(/Total transferido/), { target: { value: '50000' } });
  fireEvent.change(screen.getByLabelText(/Fecha de pago/), { target: { value: '2026-10-07' } });
  expect(await screen.findByRole('alert')).toHaveTextContent('Tasa temporalmente no disponible');
  falla = false;
  fireEvent.click(screen.getByRole('button', { name: 'Consultar tasa nuevamente' }));
  await waitFor(() => expect(screen.getByLabelText('Equivalente USD - Ana Raga')).toHaveTextContent('25.00'));
  expect(screen.getByLabelText(/Total transferido/)).toHaveValue(50000);
  expect(screen.getByLabelText(/Fecha de pago/)).toHaveValue('2026-10-07');
  expect(global.fetch.mock.calls.filter(([url]) => !url.includes('/tasa?'))).toHaveLength(1);
});