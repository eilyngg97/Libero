import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SolicitudUniforme from './SolicitudUniforme';
import { obtenerTasaOficialPorFecha } from '../utils/dolarHistorico';

jest.mock('../context/DolarContext', () => ({ useDolar: () => ({ dolar: null }) }));
jest.mock('../utils/dolarHistorico', () => ({
  obtenerTasaOficialPorFecha: jest.fn().mockResolvedValue(null),
  obtenerTasaEuroOficialPorFecha: jest.fn().mockResolvedValue(null)
}));

const originalFetch = global.fetch;
let pedido;
let pagos;
const alumno = { _id: 'a1', nombres: 'Alumna QA', apellidos: 'Prueba', numero_franela: '6' };

beforeEach(() => {
  obtenerTasaOficialPorFecha.mockClear();
  localStorage.setItem('rol', 'usuario');
  localStorage.setItem('token', 'qa');
  pedido = { _id: 'u1', alumno: 'a1', prenda: 'Franela QA', talla: 'M', moneda: 'USD', precio: 20,
    saldo_pendiente: 20, monto_pagado: 0, estado: 'esperando_pago', metodo_cobranza: 'pago_completo' };
  pagos = { adicionales: [{ tipo: 'zelle', titular: 'Titular QA', correo: 'general@example.com', habilitado: true }],
    por_concepto: { uniformes: { usar_generales: true, adicionales: [] } } };
  global.fetch = jest.fn(async (url, options = {}) => {
    let data = {};
    if (url.includes('/api/configuracion/pagos')) data = { pagos };
    else if (url.includes('/pedidos/u1/pagar') && options.method === 'PATCH') {
      pedido = { ...pedido, estado: 'pago_en_revision', monto_ultimo_pago: Number(options.body.get('monto_pagado')),
        metodo_pago: options.body.get('metodo_pago') };
      data = pedido;
    } else if (url.includes('/pedidos/mis')) data = [pedido];
    else if (url.includes('/uniformes/public')) data = [];
    return { ok: true, json: async () => data };
  });
});

afterEach(() => { global.fetch = originalFetch; localStorage.clear(); });

test.each([
  ['Zelle', 'USD', true],
  ['PayPal', 'EUR', false],
  ['Binance', 'USD', false]
])('solicitud real registra %s en %s con herencia=%s y sin tasa ni Bs', async (nombre, moneda, heredar) => {
  pedido.moneda = moneda;
  const cuenta = { tipo: nombre.toLowerCase(), titular: 'Titular QA', correo: 'uniformes@example.com', habilitado: true };
  if (heredar) pagos.adicionales = [cuenta];
  else pagos.por_concepto.uniformes = { usar_generales: false, adicionales: [cuenta] };
  render(<SolicitudUniforme alumno={alumno} />);
  fireEvent.click((await screen.findAllByRole('button', { name: 'Realizar pago' }))[0]);
  fireEvent.click(await screen.findByText(nombre, { exact: true }));
  expect(screen.getByText('uniformes@example.com')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ya pague' }));
  await waitFor(() => expect(screen.getByLabelText(`Monto pagado (${moneda})`)).toHaveValue('20.00'));
  fireEvent.change(screen.getByLabelText('Referencia'), { target: { value: 'TX-UNIFORME-2026' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar pago' }));
  await waitFor(() => expect(global.fetch.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1));
  const [, options] = global.fetch.mock.calls.find(([, params]) => params?.method === 'PATCH');
  expect(options.body.get('metodo_pago')).toBe(nombre);
  expect(options.body.get('monto_pagado')).toBe('20.00');
  expect(options.body.get('referencia')).toBe('TX-UNIFORME-2026');
  expect(options.body.get('monto_pagado_bs')).toBeNull();
  expect(options.body.get('telefono_pago')).toBeNull();
  expect(options.body.get('cedula_titular')).toBeNull();
  expect(obtenerTasaOficialPorFecha).not.toHaveBeenCalled();
  expect(await screen.findByText('PAGO ENVIADO A REVISION', { exact: true })).toBeInTheDocument();
});

test.each([
  ['obligatoria', '', 10, null],
  ['flexible', 'Pagar 50%', 10, 'dos_partes_50'],
  ['flexible', 'Pagar completo', 20, 'pago_completo']
])('uniformes conserva modalidad %s %s con Zelle sin Bs', async (regla, opcion, monto, modalidad) => {
  pedido.regla_cobranza = regla;
  pedido.metodo_cobranza = 'dos_partes_50';
  pedido.saldo_pendiente = 10;
  pedido.monto_primera_parte_objetivo = 10;
  render(<SolicitudUniforme alumno={alumno} />);
  fireEvent.click((await screen.findAllByRole('button', { name: 'Realizar pago' }))[0]);
  fireEvent.click(await screen.findByText('Zelle', { exact: true }));
  if (opcion) fireEvent.click(screen.getByText(opcion, { exact: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Ya pague' }));
  await waitFor(() => expect(screen.getByLabelText('Monto pagado (USD)')).toHaveValue(monto.toFixed(2)));
  fireEvent.change(screen.getByLabelText('Referencia'), { target: { value: 'TX-CUOTA-2026' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar pago' }));
  await screen.findByText('PAGO ENVIADO A REVISION', { exact: true });
  const [, options] = global.fetch.mock.calls.find(([, params]) => params?.method === 'PATCH');
  expect(options.body.get('monto_pagado')).toBe(monto.toFixed(2));
  expect(options.body.get('monto_pagado_bs')).toBeNull();
  expect(options.body.get('metodo_cobranza')).toBe(modalidad);
});

test('uniformes respeta cuentas propias, deshabilitadas y moneda EUR', async () => {
  pedido.moneda = 'EUR';
  pagos.por_concepto.uniformes = { usar_generales: false, adicionales: [
    { tipo: 'paypal', titular: 'Propio', correo: 'propio@example.com', habilitado: true },
    { tipo: 'zelle', titular: 'Zelle', correo: 'zelle@example.com', habilitado: true },
    { tipo: 'binance', titular: 'Inactivo', correo: 'inactivo@example.com', habilitado: false }
  ] };
  render(<SolicitudUniforme alumno={alumno} />);
  fireEvent.click((await screen.findAllByRole('button', { name: 'Realizar pago' }))[0]);
  expect(await screen.findByText('PayPal', { exact: true })).toBeInTheDocument();
  expect(screen.queryByText('Zelle', { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText('Binance', { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText(/dep[oó]sito USD/i)).not.toBeInTheDocument();
});