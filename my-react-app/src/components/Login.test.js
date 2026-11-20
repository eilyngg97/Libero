import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Login from './Login';

const originalFetch = window.fetch;
const context = { branding: { displayName: 'Academia QA', tagline: 'Academy', logoUrl: '/academia-qa.png' } };
const json = (data, ok = true) => ({ ok, json: async () => data });
const abrir = (onLogin = jest.fn(), search = '') => render(
  <MemoryRouter initialEntries={[`/login${search}`]}>
    <Routes>
      <Route path="/login" element={<Login onLogin={onLogin} />} />
      <Route path="/dashboard" element={<h1>Panel de prueba</h1>} />
    </Routes>
  </MemoryRouter>
);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.fetch = jest.fn(async () => json(context));
});

afterEach(() => {
  window.fetch = originalFetch;
  jest.restoreAllMocks();
});

test('mantiene identidad de academia, campos accesibles, visibilidad y ayuda sin enviar credenciales', async () => {
  abrir(jest.fn(), '?expired=1&reason=inactive');
  expect(await screen.findByText('Academia QA')).toBeInTheDocument();
  expect(screen.getByAltText('Academia QA')).toHaveAttribute('src', '/academia-qa.png');
  expect(screen.getByText(/Tu sesión se cerró por inactividad/)).toBeInTheDocument();
  const password = screen.getByLabelText('Contraseña');
  fireEvent.change(password, { target: { value: 'clave-de-prueba' } });
  fireEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
  expect(password).toHaveAttribute('type', 'text');
  expect(password).toHaveValue('clave-de-prueba');
  fireEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
  expect(password).toHaveAttribute('type', 'password');
  expect(screen.queryByRole('button', { name: '¿Olvidaste tu contraseña?' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Contacta al equipo de soporte.' }));
  expect(await screen.findByRole('dialog', { name: 'Ayuda para ingresar' })).toHaveTextContent('administración de Academia QA');
  expect(window.fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Contacta al equipo de soporte.' }));
  await screen.findByRole('dialog', { name: 'Ayuda para ingresar' });
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar ayuda' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.queryByRole('link', { name: 'Volver al sitio web' })).not.toBeInTheDocument();
});

test('envia las mismas credenciales normalizadas, bloquea doble envio y conserva el acceso', async () => {
  let resolver;
  const onLogin = jest.fn();
  window.fetch.mockImplementation(async (url, options) => options?.method === 'POST'
    ? new Promise((resolve) => { resolver = resolve; }) : json(context));
  abrir(onLogin);
  await screen.findByText('Academia QA');
  fireEvent.change(screen.getByLabelText('Número de identificación'), { target: { value: ' 12345678 ' } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: ' clave-de-prueba ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  expect(screen.getByRole('button', { name: 'Ingresando...' })).toBeDisabled();
  expect(screen.getByLabelText('Número de identificación')).toBeDisabled();
  expect(screen.getByLabelText('Contraseña')).toBeDisabled();
  const posts = window.fetch.mock.calls.filter(([, options]) => options?.method === 'POST');
  expect(posts).toHaveLength(1);
  expect(JSON.parse(posts[0][1].body)).toEqual({ email: '12345678', password: 'clave-de-prueba' });
  const data = { token: 'token-qa', tenantId: 'qa', user: { id: 'admin-qa', rol: 'admin' } };
  await act(async () => resolver(json(data)));
  expect(await screen.findByRole('heading', { name: 'Panel de prueba' })).toBeInTheDocument();
  expect(onLogin).toHaveBeenCalledWith(data);
  expect(localStorage.getItem('token')).toBe('token-qa');
});

test('un error de autenticacion conserva el formulario y permite reintentar', async () => {
  const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
  const onLogin = jest.fn();
  window.fetch.mockImplementation(async (url, options) => options?.method === 'POST'
    ? json({ msg: 'Credenciales incorrectas' }, false) : json(context));
  abrir(onLogin);
  await screen.findByText('Academia QA');
  fireEvent.change(screen.getByLabelText('Número de identificación'), { target: { value: '12345678' } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'clave-incorrecta' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales incorrectas');
  expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  expect(screen.getByLabelText('Número de identificación')).toHaveValue('12345678');
  expect(onLogin).not.toHaveBeenCalled();
  expect(errorLog).toHaveBeenCalledWith('Credenciales incorrectas');
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  expect(screen.getByLabelText('Número de identificación')).toHaveValue('12345678');
});
