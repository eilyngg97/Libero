import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ListadoSolicitudesUniformes from './ListadoSolicitudesUniformes';
import { obtenerTasaOficialPorFecha } from '../utils/dolarHistorico';

jest.mock('../context/SedeContext', () => ({ useSede: () => ({ sedeSeleccionada: null }) }));
jest.mock('../context/DolarContext', () => ({ useDolar: () => ({ dolar: { promedio: 800, moneda: 'USD' } }) }));
jest.mock('../hooks/useTenantCategorias', () => ({ __esModule: true,
  default: () => ({ categorias: [] }), combinarCategoriasTenant: () => [] }));
jest.mock('../utils/exportExcel', () => ({ exportToExcel: jest.fn() }));
jest.mock('../utils/dolarHistorico', () => ({ obtenerTasaOficialPorFecha: jest.fn().mockResolvedValue(800),
  obtenerTasaEuroOficialPorFecha: jest.fn().mockResolvedValue(900) }));

const originalFetch = global.fetch;
let pedido;

beforeEach(() => {
  obtenerTasaOficialPorFecha.mockClear();
  localStorage.setItem('rol', 'admin');
  pedido = { _id: 'u1', alumno: { _id: 'a1', nombres: 'Andres', apellidos: 'QA' },
    prenda: 'Franela QA', talla: 'M', moneda: 'USD', precio: 15, estado: 'pago_en_revision',
    createdAt: new Date().toISOString(), fecha_pago: new Date().toISOString(),
    monto_pagado: 0, monto_pagado_bs: 0, monto_ultimo_pago: 15, monto_ultimo_pago_bs: 0,
    saldo_pendiente: 15, metodo_pago: 'Zelle', referencia: 'TX-ZELLE-2026', pagos_historial: [] };
  global.fetch = jest.fn(async (url, options = {}) => {
    if (options.method === 'PATCH') {
      pedido = { ...pedido, referencia: options.body.get('referencia'),
        monto_ultimo_pago: Number(options.body.get('monto_pagado')) };
      return { ok: true, json: async () => pedido };
    }
    return { ok: true, json: async () => url.includes('/uniformes/pedidos') ? [pedido] : [] };
  });
});

afterEach(() => { global.fetch = originalFetch; localStorage.clear(); });

async function abrirDetalle() {
  render(<ListadoSolicitudesUniformes />);
  fireEvent.click((await screen.findAllByRole('button', { name: 'Ver detalle de pago' }))[0]);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
}

test.each(['Zelle', 'PayPal', 'Binance'])('detalle de %s muestra metodo, importe esperado y pagado en USD y referencia', async (metodo) => {
  pedido.metodo_pago = metodo;
  await abrirDetalle();
  expect(screen.getByRole('combobox', { name: 'Metodo de pago' })).toHaveTextContent(metodo);
  expect(screen.getByRole('group', { name: 'Monto pagado (USD)' })).toHaveTextContent('USD 15.00');
  expect(screen.getByRole('group', { name: 'Monto esperado (USD)' })).toHaveTextContent('USD 15.00');
  expect(screen.getByRole('textbox', { name: 'Referencia' })).toHaveValue('TX-ZELLE-2026');
  expect(screen.queryByText('Monto pagado (BS)', { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText('No aplica para este metodo')).not.toBeInTheDocument();
});

test('detalle toma los datos Zelle del historial confirmado', async () => {
  pedido.estado = 'verificado';
  pedido.monto_pagado = 15;
  pedido.saldo_pendiente = 0;
  pedido.monto_ultimo_pago = 0;
  pedido.metodo_pago = undefined;
  pedido.referencia = undefined;
  pedido.pagos_historial = [{ metodo_pago: 'Zelle', monto_pagado: 15, monto_pagado_bs: 0,
    referencia: 'TX-HISTORIAL-2026', fecha_pago: new Date().toISOString() }];
  await abrirDetalle();
  expect(screen.getByRole('combobox', { name: 'Metodo de pago' })).toHaveTextContent('Zelle');
  expect(screen.getByRole('group', { name: 'Monto pagado (USD)' })).toHaveTextContent('USD 15.00');
  expect(screen.getByRole('textbox', { name: 'Referencia' })).toHaveValue('TX-HISTORIAL-2026');
});

test('edicion Zelle conserva referencia alfanumerica e importe USD sin Bs ni tasa', async () => {
  await abrirDetalle();
  fireEvent.click(screen.getByRole('button', { name: 'Editar', exact: true }));
  expect(screen.getByRole('textbox', { name: 'Monto pagado (USD)' })).toHaveValue('15');
  fireEvent.change(screen.getByRole('textbox', { name: 'Referencia' }), { target: { value: 'TX-CORREGIDA-2026' } });
  const guardar = screen.getByRole('button', { name: 'Guardar cambios' });
  expect(guardar).toBeEnabled();
  fireEvent.click(guardar);
  await waitFor(() => expect(global.fetch.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1));
  const [, options] = global.fetch.mock.calls.find(([, params]) => params?.method === 'PATCH');
  expect(options.body.get('metodo_pago')).toBe('Zelle');
  expect(options.body.get('monto_pagado')).toBe('15');
  expect(options.body.get('monto_pagado_bs')).toBeNull();
  expect(options.body.get('referencia')).toBe('TX-CORREGIDA-2026');
  expect(obtenerTasaOficialPorFecha).not.toHaveBeenCalled();
});

test('detalle de pago movil conserva importes en Bs y referencia numerica', async () => {
  pedido.metodo_pago = 'Pago movil';
  pedido.referencia = '123456';
  pedido.monto_ultimo_pago_bs = 12000;
  await abrirDetalle();
  expect(screen.getByRole('combobox', { name: 'Metodo de pago' })).toHaveTextContent('Pago movil');
  expect(screen.getByRole('group', { name: 'Monto pagado (BS)' })).toHaveTextContent('12.000,00');
  expect(screen.getByRole('textbox', { name: 'Referencia' })).toHaveValue('123456');
});