import React from 'react';
import { act, render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import Dashboard from './Dashboard';
import { useSede } from '../context/SedeContext';
import { hasPermission } from '../utils/permissions';

jest.mock('../context/SedeContext', () => ({ useSede: jest.fn() }));
jest.mock('../context/DolarContext', () => ({ useDolar: () => ({ dolar: { promedio: 100, moneda: 'USD' } }) }));
jest.mock('../utils/permissions', () => ({ hasPermission: jest.fn() }));
jest.mock('../utils/exportExcel', () => ({ exportToExcel: jest.fn() }));
jest.mock('recharts', () => ({
  ...jest.requireActual('recharts'), ResponsiveContainer: () => null
}));

const fetchOriginal = global.fetch;
let solicitudes;
let falloConsulta;
let setSedeSeleccionada;

function Destino() {
  const location = useLocation();
  return <div>Destino: {location.pathname}{location.search}</div>;
}

const renderDashboard = () => render(
  <MemoryRouter initialEntries={['/dashboard']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/mensualidades" element={<Destino />} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => {
  solicitudes = [
    { _id: 'm1', mes: 9, anio: 2025, id_alumno: { sede: { _id: 's1', nombre: 'Centro' } } },
    { _id: 'm2', mes: 10, anio: 2026, id_alumno: { sede: { _id: 's1', nombre: 'Centro' } } },
    { _id: 'm3', mes: 8, anio: 2026, id_alumno: { sede: { _id: 's2', nombre: 'Norte' } } }
  ];
  falloConsulta = false;
  setSedeSeleccionada = jest.fn();
  useSede.mockReturnValue({ setSedeSeleccionada });
  hasPermission.mockReturnValue(true);
  global.fetch = jest.fn(async (url) => {
    if (url.includes('/api/mensualidades/revisiones-recargo')) {
      return { ok: !falloConsulta, json: async () => falloConsulta ? { error: 'Error de consulta' } : solicitudes };
    }
    return { ok: true, json: async () => [] };
  });
});

afterEach(() => { global.fetch = fetchOriginal; });

function controlarConsultasRecargo() {
  const consultas = [];
  const original = global.fetch.getMockImplementation();
  global.fetch.mockImplementation((url, options) => {
    if (!url.includes('/api/mensualidades/revisiones-recargo')) return original(url, options);
    return new Promise((resolve, reject) => consultas.push({ resolve, reject }));
  });
  return consultas;
}

test.each(['datos', 'error'])('ignora una respuesta antigua de %s despues de recibir cero pendientes recientes', async (resultado) => {
  const consultas = controlarConsultasRecargo();
  renderDashboard();
  const tarjeta = within(screen.getByRole('region', { name: 'Solicitudes de revisión de recargo.' }));
  await waitFor(() => expect(consultas).toHaveLength(1));
  fireEvent.focus(window);
  expect(consultas).toHaveLength(2);
  await act(async () => consultas[1].resolve({ ok: true, json: async () => [] }));
  expect(tarjeta.getByText('0', { exact: true })).toBeInTheDocument();
  await act(async () => {
    if (resultado === 'error') consultas[0].reject(new Error('Consulta antigua fallida'));
    else consultas[0].resolve({ ok: true, json: async () => solicitudes });
  });
  expect(tarjeta.getByText('0', { exact: true })).toBeInTheDocument();
  expect(tarjeta.queryByRole('alert')).not.toBeInTheDocument();
  expect(tarjeta.queryByRole('button', { name: 'Centro 2' })).not.toBeInTheDocument();
});

test('una consulta antigua no termina la carga de la consulta mas reciente', async () => {
  const consultas = controlarConsultasRecargo();
  renderDashboard();
  const tarjeta = within(screen.getByRole('region', { name: 'Solicitudes de revisión de recargo.' }));
  await waitFor(() => expect(consultas).toHaveLength(1));
  fireEvent.focus(window);
  expect(consultas).toHaveLength(2);
  await act(async () => consultas[0].resolve({ ok: true, json: async () => solicitudes }));
  expect(tarjeta.getByRole('status')).toHaveTextContent('Cargando solicitudes...');
  expect(tarjeta.queryByText('Solicitudes pendientes:')).not.toBeInTheDocument();
  await act(async () => consultas[1].resolve({ ok: true, json: async () => [] }));
  expect(tarjeta.getByText('0', { exact: true })).toBeInTheDocument();
});

test('muestra pendientes de todos los meses por sede y abre todas las solicitudes', async () => {
  renderDashboard();
  const tarjeta = within(screen.getByRole('region', { name: 'Solicitudes de revisión de recargo.' }));
  expect(await tarjeta.findByRole('button', { name: 'Centro 2' })).toBeInTheDocument();
  expect(tarjeta.getByRole('button', { name: 'Norte 1' })).toBeInTheDocument();
  expect(tarjeta.getByText('3', { exact: true })).toBeInTheDocument();
  fireEvent.click(tarjeta.getByRole('button', { name: 'Ver solicitudes de recargo' }));
  expect(setSedeSeleccionada).toHaveBeenCalledWith(null);
  expect(await screen.findByText('Destino: /mensualidades?revision_recargo=true')).toBeInTheDocument();
});

test('abrir una sede conserva su seleccion para la lista filtrada', async () => {
  renderDashboard();
  fireEvent.click(await screen.findByRole('button', { name: 'Centro 2' }));
  expect(setSedeSeleccionada).toHaveBeenCalledWith({ _id: 's1', nombre: 'Centro' });
  expect(await screen.findByText('Destino: /mensualidades?revision_recargo=true')).toBeInTheDocument();
});

test('muestra cero cuando no hay solicitudes y actualiza al volver a la ventana', async () => {
  renderDashboard();
  const tarjeta = within(screen.getByRole('region', { name: 'Solicitudes de revisión de recargo.' }));
  await tarjeta.findByRole('button', { name: 'Centro 2' });
  solicitudes = [];
  fireEvent.focus(window);
  expect(await tarjeta.findByText('Sin solicitudes de revisión de recargo.')).toBeInTheDocument();
  expect(tarjeta.getByText('0', { exact: true })).toBeInTheDocument();
});

test('un fallo no se presenta como cero solicitudes', async () => {
  falloConsulta = true;
  renderDashboard();
  const tarjeta = within(screen.getByRole('region', { name: 'Solicitudes de revisión de recargo.' }));
  expect(await tarjeta.findByRole('alert')).toHaveTextContent('No se pudieron cargar las solicitudes.');
  expect(tarjeta.queryByText('0', { exact: true })).not.toBeInTheDocument();
});

test('sin permiso de mensualidades no consulta ni muestra solicitudes', async () => {
  hasPermission.mockImplementation((permission) => permission !== 'mensualidades.view');
  renderDashboard();
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  expect(screen.queryByRole('region', { name: 'Solicitudes de revisión de recargo.' })).not.toBeInTheDocument();
  expect(global.fetch.mock.calls.some(([url]) => url.includes('/revisiones-recargo'))).toBe(false);
});