import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SeleccionarPerfil from './SeleccionarPerfil';

const originalFetch = global.fetch;
const user = { id: 'trainer', nombre: 'Entrenador QA', rol: 'entrenador', rolActivo: 'entrenador', roles: ['entrenador', 'usuario'] };
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('usuario', JSON.stringify(user));
  localStorage.setItem('token', 'original');
});
afterEach(() => { global.fetch = originalFetch; localStorage.clear(); });

function renderSelector() {
  return render(<MemoryRouter initialEntries={['/seleccionar-perfil']}><Routes>
    <Route path="/seleccionar-perfil" element={<SeleccionarPerfil />} />
    <Route path="/dashboard-usuario" element={<div>Portal representante</div>} />
    <Route path="/dashboard-entrenador" element={<div>Portal entrenador</div>} />
    <Route path="/login" element={<div>Inicio de sesion</div>} />
  </Routes></MemoryRouter>);
}

test('muestra los dos perfiles y activa Representante mediante el servidor', async () => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ token: 'representante', user: { ...user, rol: 'usuario', rolActivo: 'usuario' } }) }));
  renderSelector();
  expect(screen.getByRole('button', { name: 'Entrar como Entrenador' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Entrar como Representante' }));
  expect(await screen.findByText('Portal representante')).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/auth/select-role'), expect.objectContaining({ body: JSON.stringify({ rolActivo: 'usuario' }), headers: expect.objectContaining({ Authorization: 'Bearer original' }) }));
  expect(localStorage.getItem('rolActivo')).toBe('usuario');
});

test('no reemplaza la sesion cuando el servidor rechaza el perfil', async () => {
  global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({ msg: 'Perfil no permitido' }) }));
  renderSelector();
  fireEvent.click(screen.getByRole('button', { name: 'Entrar como Representante' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Perfil no permitido');
  expect(localStorage.getItem('token')).toBe('original');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Entrar como Entrenador' })).toBeEnabled());
});

test('no guarda respuestas incompletas de cambio de perfil', async () => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ token: 'incorrecto', user }) }));
  renderSelector();
  fireEvent.click(screen.getByRole('button', { name: 'Entrar como Representante' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('El servidor no confirmo');
  expect(localStorage.getItem('token')).toBe('original');
});

test('un entrenador de un solo rol entra directamente', async () => {
  localStorage.setItem('usuario', JSON.stringify({ ...user, roles: ['entrenador'] }));
  renderSelector();
  expect(await screen.findByText('Portal entrenador')).toBeInTheDocument();
});