import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CategoriasConfig from './CategoriasConfig';

const originalFetch = global.fetch;
let resultado;

beforeEach(() => {
  localStorage.setItem('rol', 'admin');
  resultado = { ok: true, data: {} };
  global.fetch = jest.fn(async (url, options = {}) => {
    if (options.method === 'PATCH' || options.method === 'PUT') {
      return { ok: resultado.ok, json: async () => resultado.data };
    }
    if (url.endsWith('/preview')) {
      return { ok: true, json: async () => ({ cambios_estimados: 48 }) };
    }
    return { ok: true, json: async () => ({}) };
  });
});

afterEach(() => {
  global.fetch = originalFetch;
  localStorage.clear();
  jest.useRealTimers();
});

async function mostrar() {
  render(<CategoriasConfig />);
  await screen.findByRole('button', { name: 'Guardar reglas de categorias' });
}

test('guardar muestra la tarjeta derecha y permite cerrarla sin quitar las reglas', async () => {
  await mostrar();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar reglas de categorias' }));
  const tarjeta = await screen.findByRole('status', { name: 'Reglas de categorias guardadas' });
  expect(within(tarjeta).getByText('Reglas de categorias guardadas')).toBeInTheDocument();
  expect(within(tarjeta).getByText('Configuracion de categorias actualizada.')).toBeInTheDocument();
  expect(tarjeta.closest('.MuiSnackbar-anchorOriginTopRight')).not.toBeNull();
  fireEvent.click(within(tarjeta).getByRole('button', { name: 'Cerrar notificacion' }));
  await waitFor(() => expect(screen.queryByRole('status', { name: 'Reglas de categorias guardadas' })).not.toBeInTheDocument());
  expect(screen.getByDisplayValue('U9/INICIACION')).toBeInTheDocument();
});

test('el error de guardado se muestra en la tarjeta sin anunciar exito', async () => {
  resultado = { ok: false, data: { error: 'No se pudo guardar las reglas.' } };
  await mostrar();
  fireEvent.click(screen.getByRole('button', { name: 'Guardar reglas de categorias' }));
  const tarjeta = await screen.findByRole('alert');
  expect(within(tarjeta).getByText('Error al guardar reglas')).toBeInTheDocument();
  expect(within(tarjeta).getByText('No se pudo guardar las reglas.')).toBeInTheDocument();
  expect(tarjeta.closest('.MuiSnackbar-anchorOriginTopRight')).not.toBeNull();
  expect(screen.queryByRole('status', { name: 'Reglas de categorias guardadas' })).not.toBeInTheDocument();
});

test('asignar conserva el mensaje con el numero de alumnos en la tarjeta', async () => {
  resultado.data = { message: 'Categorias asignadas correctamente. Se actualizaron 48 alumno(s).' };
  await mostrar();
  fireEvent.click(screen.getByRole('button', { name: 'Asignar categorias' }));
  const confirmar = await screen.findByRole('button', { name: 'Confirmar' });
  await waitFor(() => expect(confirmar).toBeEnabled());
  fireEvent.click(confirmar);
  const tarjeta = await screen.findByRole('status', { name: 'Categorias asignadas' });
  expect(within(tarjeta).getByText('Categorias asignadas')).toBeInTheDocument();
  expect(within(tarjeta).getByText(resultado.data.message)).toBeInTheDocument();
});

test('la tarjeta se cierra automaticamente a los seis segundos', async () => {
  jest.useFakeTimers();
  await mostrar();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Guardar reglas de categorias' }));
  });
  expect(screen.getByRole('status', { name: 'Reglas de categorias guardadas' })).toBeInTheDocument();
  act(() => { jest.advanceTimersByTime(5999); });
  expect(screen.getByRole('status', { name: 'Reglas de categorias guardadas' })).toBeInTheDocument();
  act(() => { jest.advanceTimersByTime(1); });
  expect(screen.queryByRole('status', { name: 'Reglas de categorias guardadas' })).not.toBeInTheDocument();
});
