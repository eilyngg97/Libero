import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import PanelOpcionesUsuario from './PanelOpcionesUsuario';

jest.mock('./TerminosPendientesAlert', () => () => null);
jest.mock('../context/DolarContext', () => ({
  useDolar: () => ({ dolar: { moneda: 'USD' } })
}));

const originalFetch = global.fetch;
let alumno;
let respuestaAlumno;
let router;

beforeEach(() => {
  localStorage.setItem('token', 'token-qa');
  localStorage.setItem('tenantId', 'villasport');
  localStorage.setItem('aviso-expediente-leido:villasport:a1', 'true');
  alumno = {
    _id: 'a1', nombres: 'QA', apellidos: 'Atleta', foto: '/uploads/qa/nueva.jpg',
    sede: { _id: 's1', nombre: 'Centro' }, representante: { _id: 'r1', nombres: 'QA' }
  };
  respuestaAlumno = async () => ({ ok: true, json: async () => ({ ...alumno }) });
  global.fetch = jest.fn(async (url) => {
    const pathname = new URL(url, 'http://localhost').pathname;
    if (pathname.endsWith('/alumnos/a1')) return respuestaAlumno();
    return { ok: true, json: async () => pathname.endsWith('/mis-cargos') ? { cargos: [] } : [] };
  });
});

afterEach(() => {
  router?.dispose();
  global.fetch = originalFetch;
  localStorage.clear();
});

function mostrarPanel(state) {
  router = createMemoryRouter([
    { path: '/panel-opciones-usuario/:alumnoId', element: <PanelOpcionesUsuario /> },
    { path: '/pagos-alumno/:id', element: <div>Pagina de pagos QA</div> },
    { path: '/alumno-editar/:id', element: <div>Formulario QA</div> }
  ], { initialEntries: [{ pathname: '/panel-opciones-usuario/a1', state }] });
  render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);
}

test('entrar o recargar sin state carga el atleta antes de habilitar las acciones', async () => {
  let confirmar;
  respuestaAlumno = () => new Promise((resolve) => { confirmar = resolve; });
  mostrarPanel();
  expect(screen.getByText('Cargando datos del atleta...')).toBeInTheDocument();
  expect(screen.queryByText('Pagos')).not.toBeInTheDocument();
  expect(screen.queryByText('Mis datos')).not.toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch.mock.calls[0][1]).toMatchObject({
    headers: { Authorization: 'Bearer token-qa' }, cache: 'no-store'
  });
  await act(async () => confirmar({ ok: true, json: async () => alumno }));
  await screen.findByText('Bienvenido de nuevo, QA');
  expect(screen.getByAltText('QA')).toHaveAttribute('src', expect.stringContaining('/nueva.jpg'));
  fireEvent.click(screen.getByText('Pagos', { exact: true }));
  await screen.findByText('Pagina de pagos QA');
  expect(router.state.location.state).toMatchObject({ alumno, sede: alumno.sede });
});

test('al volver muestra la foto actual del servidor en lugar de los datos antiguos de navegacion', async () => {
  mostrarPanel({ alumno: { ...alumno, foto: '/uploads/qa/anterior.jpg' }, sede: { nombre: 'Anterior' } });
  await screen.findByText('Bienvenido de nuevo, QA');
  expect(screen.getByAltText('QA')).toHaveAttribute('src', expect.stringContaining('/nueva.jpg'));
  fireEvent.click(screen.getByText('Mis datos', { exact: true }));
  await screen.findByText('Formulario QA');
  expect(router.state.location.state).toMatchObject({ alumno, sede: alumno.sede });
});

test('un fallo de carga no muestra acciones ni usa datos antiguos y permite reintentar', async () => {
  respuestaAlumno = async () => ({ ok: false, json: async () => ({ error: 'No tienes permiso para este atleta QA' }) });
  mostrarPanel({ alumno });
  expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso para este atleta QA');
  expect(screen.queryByText('Pagos')).not.toBeInTheDocument();
  expect(screen.queryByText('Mis datos')).not.toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  respuestaAlumno = async () => ({ ok: true, json: async () => alumno });
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await screen.findByText('Bienvenido de nuevo, QA');
  expect(screen.getByText('Pagos', { exact: true })).toBeInTheDocument();
});

test.each([null, {}, { _id: 'otro-atleta' }])('rechaza una respuesta sin el atleta solicitado: %j', async (data) => {
  respuestaAlumno = async () => ({ ok: true, json: async () => data });
  mostrarPanel();
  expect(await screen.findByRole('alert')).toHaveTextContent('El servidor no devolvió los datos del atleta solicitado.');
  expect(screen.queryByText('Pagos')).not.toBeInTheDocument();
  expect(screen.queryByText('Mis datos')).not.toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('cambiar de atleta cancela la carga anterior e ignora una respuesta tardia', async () => {
  let confirmarAnterior;
  const siguiente = { ...alumno, _id: 'a2', nombres: 'Otro QA', foto: '/uploads/qa/otra.jpg' };
  localStorage.setItem('aviso-expediente-leido:villasport:a2', 'true');
  global.fetch = jest.fn(async (url) => {
    const pathname = new URL(url, 'http://localhost').pathname;
    if (pathname.endsWith('/alumnos/a1')) return new Promise((resolve) => { confirmarAnterior = resolve; });
    if (pathname.endsWith('/alumnos/a2')) return { ok: true, json: async () => siguiente };
    return { ok: true, json: async () => pathname.endsWith('/mis-cargos') ? { cargos: [] } : [] };
  });
  mostrarPanel();
  const signalAnterior = global.fetch.mock.calls[0][1].signal;
  await act(async () => router.navigate('/panel-opciones-usuario/a2'));
  await screen.findByText('Bienvenido de nuevo, Otro QA');
  expect(signalAnterior.aborted).toBe(true);
  await act(async () => confirmarAnterior({ ok: true, json: async () => alumno }));
  expect(screen.getByText('Bienvenido de nuevo, Otro QA')).toBeInTheDocument();
  expect(screen.getByAltText('Otro QA')).toHaveAttribute('src', expect.stringContaining('/otra.jpg'));
});
