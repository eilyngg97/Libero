import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Mensualidades from './Mensualidades';

jest.mock('../context/SedeContext', () => ({ useSede: () => ({ sedeSeleccionada: null }) }));
jest.mock('../context/DolarContext', () => ({ useDolar: () => ({ dolar: { promedio: 872.39, moneda: 'USD' } }) }));
jest.mock('../utils/permissions', () => ({ hasPermission: () => true }));
jest.mock('../utils/exportExcel', () => ({ exportToExcel: jest.fn() }));
jest.mock('../utils/dolarHistorico', () => ({ obtenerTasaOficialPorFecha: jest.fn().mockResolvedValue(872.39), obtenerTasaEuroOficialPorFecha: jest.fn().mockResolvedValue(900) }));

const fetchOriginal = global.fetch;
let transacciones;
let agrupado;
let errorRetiro;
let segundoRecargo;
let segundaVersion;

beforeEach(() => {
  transacciones = true;
  agrupado = true;
  errorRetiro = false;
  segundoRecargo = 4;
  segundaVersion = 'mensualidad-v2';
  localStorage.setItem('rol', 'admin');
  global.fetch = jest.fn(async (url, options = {}) => {
    const mensualidad = { _id: 'm1', id_alumno: { _id: 'a1', nombres: 'Ana', apellidos: 'Raga' },
      mes: new Date().getMonth() + 1, anio: new Date().getFullYear(), monto_esperado: 14, monto_base: 10,
      monto_sin_recargo_usd: 10, recargo_aplicado_usd: 4, monto_con_recargo_usd: 14, aplica_recargo: true,
      fecha_aplicacion_recargo: '2026-10-01', estatus: 'En revision',
      ...(agrupado ? { pago_agrupado: { id: 'g1', codigo: 'PA-TEST', monto_total: 28, cantidad_atletas: 2, estado: 'En revision' } } : {}) };
    let data;
    if (options.method === 'PATCH') {
      return { ok: !errorRetiro, status: errorRetiro ? 409 : 200, json: async () => errorRetiro
        ? { error: 'La mensualidad cambio. Actualiza la vista.' }
        : { mensualidad: { ...mensualidad, recargo_aplicado_usd: 0, monto_esperado: 10 },
          mensualidades: [{ ...mensualidad, recargo_aplicado_usd: 0, monto_esperado: 10 }],
          atletas_actualizadas: 2, saldo_a_favor_incrementado: 8 } };
    }
    if (url.includes('/api/pagos/agrupado/g1')) {
      data = { pago: { _id: 'g1', codigo: 'PA-TEST', estado: 'En revision', monto_total: 28 }, version: 'grupo-v1',
        transacciones_disponibles: transacciones,
        asignaciones: [
          { id_mensualidad: 'm1', alumno_nombre: 'Ana Raga', version_mensualidad: 'mensualidad-v1', monto_sin_recargo_usd: 10, recargo_aplicado_usd: 4 },
          { id_mensualidad: 'm2', alumno_nombre: 'Eva Raga', version_mensualidad: segundaVersion, monto_sin_recargo_usd: 10, recargo_aplicado_usd: segundoRecargo }
        ] };
    } else if (url.includes('/api/pagos/m1')) {
      data = [{ _id: 'p1', ...(agrupado ? { id_pago_agrupado: 'g1' } : {}), monto_pagado: 14, monto_pagado_bs: 12213.46,
        metodo_pago: 'Pago movil', fecha_pago: '2026-10-06', referencia: '262626' }];
    } else if (url.includes('/api/mensualidades')) data = [mensualidad];
    else data = [];
    return { ok: true, json: async () => data };
  });
});

afterEach(() => { global.fetch = fetchOriginal; localStorage.clear(); });

async function abrirRetiro() {
  render(<Mensualidades />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle' }));
  fireEvent.click(await screen.findByRole('button', { name: /^Retirar recargo/ }));
}

test('retiro agrupado consulta versiones y envia una sola operacion segura', async () => {
  await abrirRetiro();
  expect(await screen.findByText(/La transferencia PA-TEST se conserva/)).toBeInTheDocument();
  expect(screen.getByText(/retirara los recargos de 2 mensualidades/)).toBeInTheDocument();
  expect(screen.getByText('Eva Raga')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retirar todos los recargos' }));
  await waitFor(() => expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(true));
  const solicitudes = global.fetch.mock.calls.filter(([, options]) => options?.method === 'PATCH');
  expect(solicitudes).toHaveLength(1);
  expect(solicitudes[0][0]).toContain('/api/pagos/agrupado/g1/retirar-recargos');
  expect(JSON.parse(solicitudes[0][1].body)).toMatchObject({ version: 'grupo-v1', mensualidades: [
    { id_mensualidad: 'm1', version: 'mensualidad-v1' }, { id_mensualidad: 'm2', version: 'mensualidad-v2' }
  ] });
  expect(JSON.parse(solicitudes[0][1].body)).not.toHaveProperty('monto_esperado');
  expect(await screen.findByText(/Recargos retirados de 2 atletas/)).toHaveTextContent('Saldo a favor adicional total: $8.00 USD');
});

test('retiro agrupado no envia cambios cuando no hay transacciones', async () => {
  transacciones = false;
  await abrirRetiro();
  expect(await screen.findByText('El retiro seguro requiere MongoDB con transacciones.')).toBeInTheDocument();
  expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false);
});

test('grupo mixto muestra solo las atletas con recargo pero confirma las versiones de todas', async () => {
  segundoRecargo = 0;
  await abrirRetiro();
  expect(await screen.findByText(/retirara los recargos de 1 mensualidad de/)).toBeInTheDocument();
  expect(screen.queryByText('Eva Raga')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retirar todos los recargos' }));
  await waitFor(() => expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(true));
  const [, options] = global.fetch.mock.calls.find(([, options]) => options?.method === 'PATCH');
  expect(JSON.parse(options.body).mensualidades).toHaveLength(2);
});

test('no abre confirmacion ni retira recargos si falta la version de otra atleta', async () => {
  segundaVersion = undefined;
  await abrirRetiro();
  expect(await screen.findByText('Debes actualizar las versiones de todas las mensualidades del grupo.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retirar todos los recargos' })).not.toBeInTheDocument();
  expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false);
});

test('conflicto de version muestra error sin reintentar por la ruta individual', async () => {
  errorRetiro = true;
  await abrirRetiro();
  await screen.findByText(/La transferencia PA-TEST se conserva/);
  fireEvent.click(screen.getByRole('button', { name: 'Retirar todos los recargos' }));
  expect(await screen.findByText('La mensualidad cambio. Actualiza la vista.')).toBeInTheDocument();
  const solicitudes = global.fetch.mock.calls.filter(([, options]) => options?.method === 'PATCH');
  expect(solicitudes).toHaveLength(1);
  expect(solicitudes[0][0]).toContain('/api/pagos/agrupado/g1/');
});

test('pago individual conserva su ruta de retiro actual', async () => {
  agrupado = false;
  await abrirRetiro();
  fireEvent.click(await screen.findByRole('button', { name: /^S.*retirar recargo$/ }));
  await waitFor(() => expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(true));
  const [url, options] = global.fetch.mock.calls.find(([, options]) => options?.method === 'PATCH');
  expect(url).toContain('/api/mensualidades/m1');
  expect(JSON.parse(options.body)).toMatchObject({ monto_esperado: 10, bloquear_recargo_automatico: true });
});