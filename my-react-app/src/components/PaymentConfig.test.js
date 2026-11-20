import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PaymentConfig from './PaymentConfig';
import { buildMetodosFromConfig } from './ModalPago';

const originalFetch = global.fetch;
let saved;

beforeEach(() => {
  saved = { pagos: {}, cobro: { moneda: 'USD' } };
  localStorage.setItem('rol', 'admin');
  global.fetch = jest.fn(async (url, options = {}) => {
    if (options.method === 'PATCH') saved = { ...saved, ...JSON.parse(options.body) };
    return { ok: true, json: async () => saved };
  });
});

afterEach(() => { global.fetch = originalFetch; localStorage.clear(); });

async function agregar(nombre) {
  fireEvent.mouseDown(await screen.findByRole('combobox', { name: 'Nuevo metodo' }));
  fireEvent.click(screen.getByRole('option', { name: nombre }));
  fireEvent.click(screen.getByRole('button', { name: 'Agregar metodo' }));
  const cuenta = within(screen.getByRole('region', { name: `Cuenta ${nombre.toLowerCase()}` }));
  fireEvent.change(cuenta.getByRole('textbox', { name: /Nombre del titular/ }), { target: { value: 'Titular QA' } });
  fireEvent.change(cuenta.getByRole('textbox', { name: /Correo/ }), { target: { value: 'pagos@example.com' } });
  return cuenta;
}

test.each(['Zelle', 'PayPal', 'Binance'])('agrega guarda y recarga cuenta %s', async (nombre) => {
  const view = render(<PaymentConfig />);
  const cuenta = await agregar(nombre);
  if (nombre === 'Zelle') fireEvent.change(cuenta.getByLabelText('Banco (opcional)'), { target: { value: 'Banco QA' } });
  if (nombre === 'Binance') fireEvent.change(cuenta.getByLabelText('Binance Pay ID (opcional)'), { target: { value: '12345678' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar pagos' }));
  await waitFor(() => expect(saved.pagos.adicionales).toHaveLength(1));
  expect(saved.pagos.adicionales[0]).toMatchObject({ tipo: nombre.toLowerCase(), titular: 'Titular QA', correo: 'pagos@example.com', habilitado: true });
  await screen.findByText('Pagos actualizados correctamente');
  view.unmount();
  render(<PaymentConfig />);
  const recargada = within(await screen.findByRole('region', { name: `Cuenta ${nombre.toLowerCase()}` }));
  expect(recargada.getByRole('textbox', { name: /Correo/ })).toHaveValue('pagos@example.com');
  fireEvent.click(recargada.getByLabelText(`Habilitar ${nombre.toLowerCase()}`));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar pagos' }));
  await waitFor(() => expect(saved.pagos.adicionales[0].habilitado).toBe(false));
  fireEvent.click(recargada.getByRole('button', { name: `Quitar ${nombre.toLowerCase()}` }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar pagos' }));
  await waitFor(() => expect(saved.pagos.adicionales).toEqual([]));
});

test('coloca los nuevos metodos despues de pago movil y transferencia en orden de incorporacion', async () => {
  render(<PaymentConfig />);
  await agregar('Zelle');
  await agregar('PayPal');
  await agregar('Binance');
  expect(screen.getAllByRole('region', { name: /^(Pago movil|Transferencia|Cuenta )/ })).toEqual([
    screen.getByRole('region', { name: 'Pago movil' }),
    screen.getByRole('region', { name: 'Transferencia' }),
    screen.getByRole('region', { name: 'Cuenta zelle' }),
    screen.getByRole('region', { name: 'Cuenta paypal' }),
    screen.getByRole('region', { name: 'Cuenta binance' })
  ]);
});

test('rechaza correo invalido antes de guardar y permite cancelar quitando el metodo', async () => {
  render(<PaymentConfig />);
  const cuenta = await agregar('Zelle');
  fireEvent.change(cuenta.getByRole('textbox', { name: /Correo/ }), { target: { value: 'correo-invalido' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar pagos' }));
  expect(await screen.findByText(/Completa el titular y un correo valido/)).toBeInTheDocument();
  expect(global.fetch.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(0);
  fireEvent.click(cuenta.getByRole('button', { name: 'Quitar zelle' }));
  expect(screen.queryByRole('region', { name: 'Cuenta zelle' })).not.toBeInTheDocument();
});

test.each([['Mensualidades', 'mensualidades'], ['Cobros adicionales', 'campanias']])('%s hereda cuentas generales o guarda y recarga cuentas propias sin modificar las generales', async (nombre, concepto) => {
  const view = render(<PaymentConfig />);
  await agregar('Zelle');
  fireEvent.click(screen.getByRole('button', { name: nombre }));
  expect(within(screen.getByRole('region', { name: 'Cuenta zelle' })).getByRole('textbox', { name: /Correo/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Agregar metodo' })).toBeDisabled();
  fireEvent.click(screen.getByLabelText('Usar datos generales'));
  await agregar('PayPal');
  fireEvent.click(screen.getByRole('button', { name: 'Guardar pagos' }));
  await waitFor(() => expect(saved.pagos.por_concepto[concepto].adicionales).toHaveLength(1));
  expect(saved.pagos.por_concepto[concepto]).toMatchObject({ usar_generales: false, adicionales: [expect.objectContaining({ tipo: 'paypal' })] });
  expect(saved.pagos.adicionales).toEqual([expect.objectContaining({ tipo: 'zelle' })]);
  await screen.findByText('Pagos actualizados correctamente');
  view.unmount();
  render(<PaymentConfig />);
  await screen.findByRole('button', { name: nombre });
  fireEvent.click(screen.getByRole('button', { name: nombre }));
  expect(screen.getByLabelText('Usar datos generales')).not.toBeChecked();
  expect(within(screen.getByRole('region', { name: 'Cuenta paypal' })).getByRole('textbox', { name: /Correo/ })).toHaveValue('pagos@example.com');
});
test.each([undefined, true, false])('selector de pago de cobros adicionales usa la cuenta correspondiente con herencia=%s', (usarGenerales) => {
  const config = { pagos: {
    pago_movil: { telefono: '04121111111' }, transferencia: { cuenta: 'CUENTA-GENERAL' },
    adicionales: [{ tipo: 'zelle', titular: 'General', correo: 'general@example.com' }],
    por_concepto: { campanias: { usar_generales: usarGenerales,
      pago_movil: { telefono: '04122222222' }, transferencia: { cuenta: 'CUENTA-COBROS' },
      adicionales: [{ tipo: 'paypal', titular: 'Cobros', correo: 'cobros@example.com' }] } }
  } };
  const metodos = buildMetodosFromConfig(config, 'campanias');
  expect(metodos.map(metodo => metodo.nombre)).toEqual(['Pago movil', 'Transferencia', usarGenerales === false ? 'PayPal' : 'Zelle']);
  expect(metodos[0].detalles.telefono).toBe(usarGenerales === false ? '04122222222' : '04121111111');
  expect(metodos[1].detalles.cuenta).toBe(usarGenerales === false ? 'CUENTA-COBROS' : 'CUENTA-GENERAL');
  expect(buildMetodosFromConfig(config, 'mensualidades')[2].nombre).toBe('Zelle');
});