import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, Link, RouterProvider } from 'react-router-dom';
import AlumnoEditar from './AlumnoEditar';
import Header from './Header';
import Login from './Login';
import { fileToDataUrl, prepareImageFile } from './ImageCropDialog';

jest.setTimeout(15000);

jest.mock('./ImageCropDialog', () => ({
  __esModule: true,
  prepareImageFile: jest.fn(async (file) => file),
  fileToDataUrl: jest.fn(async () => 'data:image/jpeg;base64,cWE='),
  default: ({ open, title, onConfirm }) => open ? (
    <button onClick={() => onConfirm(new global.File(['recorte-qa'], 'recorte.jpg', { type: 'image/jpeg' }))}>
      {title}
    </button>
  ) : null
}));

const originalFetch = global.fetch;
let alumno;
let fotoRespuesta;
let guardarRespuesta;
let router;

beforeEach(() => {
  prepareImageFile.mockImplementation(async (file) => file);
  fileToDataUrl.mockResolvedValue('data:image/jpeg;base64,cWE=');
  localStorage.setItem('rol', 'usuario');
  localStorage.setItem('token', 'token-qa');
  localStorage.setItem('usuario', JSON.stringify({ nombre: 'QA', rol: 'usuario' }));
  alumno = {
    _id: 'a1', nombres: 'QA', apellidos: 'Atleta', telefono: '000',
    fecha_inicio_cobro: `${new Date().getFullYear()}-01-01`, tipo_mensualidad: 'monto_sede',
    sede: { _id: 's1', nombre: 'Centro', costo: 20 }, foto: '/uploads/qa/alumnos/anterior.jpg'
  };
  fotoRespuesta = async () => {
    alumno.foto = '/uploads/qa/alumnos/nueva.jpg';
    return { ok: true, json: async () => ({ foto: alumno.foto }) };
  };
  guardarRespuesta = async (options) => {
    alumno.telefono = options.body.get('telefono');
    return { ok: true, json: async () => alumno };
  };
  global.fetch = jest.fn(async (url, options = {}) => {
    const pathname = new URL(url, 'http://localhost').pathname;
    if (options.method === 'PATCH') return fotoRespuesta(options);
    if (options.method === 'PUT') return guardarRespuesta(options);
    if (pathname.endsWith('/categoria-sugerida')) {
      return { ok: true, json: async () => ({ categorias_disponibles: [] }) };
    }
    if (pathname.endsWith('/requisitos')) return { ok: true, json: async () => ({ requisitos: [] }) };
    if (pathname.endsWith('/context')) return { ok: true, json: async () => ({ branding: { displayName: 'Academia QA' } }) };
    return { ok: true, json: async () => ({ ...alumno }) };
  });
});

afterEach(() => {
  router?.dispose();
  global.fetch = originalFetch;
  localStorage.clear();
});

async function mostrarFormulario() {
  const locationState = { alumno: { ...alumno } };
  router = createMemoryRouter([
    {
      path: '/alumno-editar/:id',
      element: <><Header /><Link to="/destino">Volver</Link><AlumnoEditar locationState={locationState} /></>
    },
    { path: '/destino', element: <div>Destino</div> },
    { path: '/login', element: <Login /> }
  ], { initialEntries: ['/destino', '/alumno-editar/a1'], initialIndex: 1 });
  render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);
  await screen.findByRole('button', { name: 'Guardar cambios' });
}

async function recortarFoto() {
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Cambiar foto de perfil'), {
      target: { files: [new File(['foto-qa'], 'foto.jpg', { type: 'image/jpeg' })] }
    });
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Recortar foto del alumno' }));
}

test.each(['usuario', 'admin', 'administrador', 'super_admin'])('%s guarda solo la foto tras recortar sin perder otros cambios y la conserva al volver a entrar', async (rol) => {
  localStorage.setItem('rol', rol);
  await mostrarFormulario();
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '111' } });
  await recortarFoto();
  await screen.findByText('Foto de perfil actualizada');
  const [, options] = global.fetch.mock.calls.find(([, request]) => request?.method === 'PATCH');
  expect(Array.from(options.body.keys())).toEqual(['foto']);
  expect(options.body.get('foto')).toBeInstanceOf(File);
  expect(global.fetch.mock.calls.some(([, request]) => request?.method === 'PUT')).toBe(false);
  expect(screen.getByLabelText('Teléfono')).toHaveValue('111');
  expect(screen.getByAltText('Foto del alumno')).toHaveAttribute('src', expect.stringContaining('/nueva.jpg'));
  fireEvent.click(screen.getByRole('link', { name: 'Volver' }));
  const aviso = within(await screen.findByRole('dialog', { name: 'Cambios sin guardar' }));
  fireEvent.click(aviso.getByRole('button', { name: 'Salir sin guardar' }));
  await screen.findByText('Destino');
  await act(async () => router.navigate('/alumno-editar/a1'));
  await screen.findByRole('button', { name: 'Guardar cambios' });
  expect(screen.getByAltText('Foto del alumno')).toHaveAttribute('src', expect.stringContaining('/nueva.jpg'));
  expect(screen.getByLabelText('Teléfono')).toHaveValue('000');
});

test.each(['usuario', 'admin'])('%s muestra la subida en curso y no presenta el recorte como guardado antes de la confirmacion', async (rol) => {
  localStorage.setItem('rol', rol);
  let confirmar;
  fotoRespuesta = () => new Promise((resolve) => { confirmar = resolve; });
  await mostrarFormulario();
  await recortarFoto();
  await screen.findByText('Subiendo foto...');
  expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  expect(screen.getByAltText('Foto del alumno')).toHaveAttribute('src', expect.stringContaining('/anterior.jpg'));
  expect(screen.queryByText('Foto de perfil actualizada')).not.toBeInTheDocument();
  await act(async () => confirmar({ ok: true, json: async () => ({ foto: '/uploads/qa/alumnos/nueva.jpg' }) }));
  await screen.findByText('Foto de perfil actualizada');
  fireEvent.click(screen.getByRole('link', { name: 'Volver' }));
  await screen.findByText('Destino');
  expect(screen.queryByRole('dialog', { name: 'Cambios sin guardar' })).not.toBeInTheDocument();
});

test.each(['usuario', 'admin'])('%s si falla la foto conserva la anterior, avisa de que no se guardo y permite reintentar', async (rol) => {
  localStorage.setItem('rol', rol);
  fotoRespuesta = async () => ({ ok: false, json: async () => ({ error: 'Fallo de subida QA' }) });
  await mostrarFormulario();
  await recortarFoto();
  await screen.findByText(/No se pudo guardar la foto de perfil.*Fallo de subida QA/);
  expect(screen.getByAltText('Foto del alumno')).toHaveAttribute('src', expect.stringContaining('/anterior.jpg'));
  fireEvent.click(screen.getByRole('link', { name: 'Volver' }));
  const aviso = within(await screen.findByRole('dialog', { name: 'Cambios sin guardar' }));
  fireEvent.click(aviso.getByRole('button', { name: 'Cerrar y seguir editando' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fotoRespuesta = async () => ({ ok: true, json: async () => ({ foto: '/uploads/qa/alumnos/reintento.jpg' }) });
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await screen.findByText('Foto de perfil actualizada');
  expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  expect(screen.getByAltText('Foto del alumno')).toHaveAttribute('src', expect.stringContaining('/reintento.jpg'));
  expect(global.fetch.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(2);
});

test('una respuesta sin URL confirmada no se anuncia como foto guardada', async () => {
  fotoRespuesta = async () => ({ ok: true, json: async () => ({}) });
  await mostrarFormulario();
  await recortarFoto();
  await screen.findByText(/El servidor no confirmo la foto guardada/);
  expect(screen.queryByText('Foto de perfil actualizada')).not.toBeInTheDocument();
  expect(screen.getByAltText('Foto del alumno')).toHaveAttribute('src', expect.stringContaining('/anterior.jpg'));
});

test('el aviso lateral de foto se puede cerrar y vuelve a aparecer sin perder los datos pendientes', async () => {
  await mostrarFormulario();
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '111' } });
  await recortarFoto();
  const aviso = within(await screen.findByRole('status', { name: 'Foto de perfil actualizada' }));
  fireEvent.click(aviso.getByRole('button', { name: 'Cerrar notificación de foto' }));
  await waitFor(() => expect(screen.queryByRole('status', { name: 'Foto de perfil actualizada' })).not.toBeInTheDocument());
  expect(screen.getByLabelText('Teléfono')).toHaveValue('111');
  expect(screen.getByAltText('Foto del alumno')).toHaveAttribute('src', expect.stringContaining('/nueva.jpg'));
  expect(global.fetch.mock.calls.filter(([, request]) => request?.method === 'PATCH')).toHaveLength(1);
  await recortarFoto();
  await screen.findByRole('status', { name: 'Foto de perfil actualizada' });
  expect(screen.getByLabelText('Teléfono')).toHaveValue('111');
  expect(global.fetch.mock.calls.some(([, request]) => request?.method === 'PUT')).toBe(false);
});

test.each([28, '28'])('conserva la franela %p sin avisos de valor fuera de rango mientras carga la disponibilidad', async (numero) => {
  alumno = { ...alumno, numero_franela: numero, categoria: 'U11', sexo: 'Masculino' };
  let confirmarDisponibilidad;
  const fetchBase = global.fetch;
  global.fetch = jest.fn((url, options) => {
    if (url.includes('/numeros-franela/disponibilidad')) {
      return new Promise((resolve) => { confirmarDisponibilidad = resolve; });
    }
    return fetchBase(url, options);
  });
  const advertencias = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await mostrarFormulario();
    expect(screen.getByRole('combobox', { name: 'Nro de franela' })).toHaveTextContent('28');
    await waitFor(() => expect(confirmarDisponibilidad).toEqual(expect.any(Function)));
    const [, options] = global.fetch.mock.calls.find(([url]) => url.includes('/numeros-franela/disponibilidad'));
    expect(options.headers).toEqual({ Authorization: 'Bearer token-qa' });
    await act(async () => confirmarDisponibilidad({
      ok: true, json: async () => ({ disponibles: [1, 2, 28], ocupados: [] })
    }));
    const selector = screen.getByRole('combobox', { name: 'Nro de franela' });
    await waitFor(() => expect(selector).not.toHaveAttribute('aria-disabled', 'true'));
    expect(selector).toHaveTextContent('28');
    fireEvent.mouseDown(selector);
    expect(await screen.findAllByRole('option', { name: '28', exact: true })).toHaveLength(1);
    expect(advertencias.mock.calls.filter(([mensaje]) => String(mensaje).includes('out-of-range'))).toEqual([]);
    expect(global.fetch.mock.calls.some(([, request]) => request?.method === 'PUT')).toBe(false);
  } finally {
    advertencias.mockRestore();
  }
});

test('mantiene visible la franela actual ocupada sin permitir guardarla como disponible', async () => {
  alumno = { ...alumno, numero_franela: 28, categoria: 'U11', sexo: 'Masculino' };
  const fetchBase = global.fetch;
  global.fetch = jest.fn((url, options) => url.includes('/numeros-franela/disponibilidad')
    ? Promise.resolve({ ok: true, json: async () => ({ disponibles: [1, 2], ocupados: [28] }) })
    : fetchBase(url, options));
  await mostrarFormulario();
  expect(screen.getByRole('combobox', { name: 'Nro de franela' })).toHaveTextContent('28');
  await screen.findByText(/El nro de franela 28 ya esta ocupado/);
  fireEvent.submit(screen.getByRole('button', { name: 'Guardar cambios' }).closest('form'));
  expect(global.fetch.mock.calls.some(([, request]) => request?.method === 'PUT')).toBe(false);
});

test.each(['usuario', 'admin'])('%s bloquea volver con datos pendientes, cerrar con la equis los conserva y revertirlos elimina el aviso', async (rol) => {
  localStorage.setItem('rol', rol);
  await mostrarFormulario();
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '111' } });
  await act(async () => router.navigate(-1));
  const aviso = within(await screen.findByRole('dialog', { name: 'Cambios sin guardar' }));
  expect(aviso.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  expect(aviso.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
  expect(aviso.getByRole('button', { name: 'Salir sin guardar' })).toBeInTheDocument();
  fireEvent.click(aviso.getByRole('button', { name: 'Cerrar y seguir editando' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByLabelText('Teléfono')).toHaveValue('111');
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '000' } });
  fireEvent.click(screen.getByRole('link', { name: 'Volver' }));
  await screen.findByText('Destino');
});

test.each(['usuario', 'admin'])('%s Guardar desde el aviso espera al servidor antes de salir y conserva los datos guardados', async (rol) => {
  localStorage.setItem('rol', rol);
  let confirmar;
  guardarRespuesta = () => new Promise((resolve) => { confirmar = resolve; });
  await mostrarFormulario();
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '111' } });
  fireEvent.click(screen.getByRole('link', { name: 'Volver' }));
  const aviso = within(await screen.findByRole('dialog', { name: 'Cambios sin guardar' }));
  fireEvent.click(aviso.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(confirmar).toBeDefined());
  expect(aviso.getByRole('button', { name: 'Salir sin guardar' })).toBeDisabled();
  expect(aviso.getByRole('button', { name: 'Cerrar y seguir editando' })).toBeDisabled();
  expect(screen.queryByText('Destino')).not.toBeInTheDocument();
  alumno.telefono = '111';
  await act(async () => confirmar({ ok: true, json: async () => alumno }));
  await screen.findByText('Destino');
  await act(async () => router.navigate('/alumno-editar/a1'));
  await screen.findByRole('button', { name: 'Guardar cambios' });
  expect(screen.getByLabelText('Teléfono')).toHaveValue('111');
});

test('si falla el guardado desde el aviso no sale ni pierde los cambios', async () => {
  guardarRespuesta = async () => ({ ok: false, json: async () => ({ error: 'No se pudo guardar QA' }) });
  await mostrarFormulario();
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '111' } });
  fireEvent.click(screen.getByRole('link', { name: 'Volver' }));
  const aviso = within(await screen.findByRole('dialog', { name: 'Cambios sin guardar' }));
  fireEvent.click(aviso.getByRole('button', { name: 'Guardar' }));
  await waitFor(() => expect(aviso.getByRole('alert')).toHaveTextContent('No se pudo guardar QA'));
  expect(screen.queryByText('Destino')).not.toBeInTheDocument();
  fireEvent.click(aviso.getByRole('button', { name: 'Cerrar y seguir editando' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByLabelText('Teléfono')).toHaveValue('111');
});

test.each(['usuario', 'admin'])('%s advierte al recargar solo cuando quedan datos pendientes', async (rol) => {
  localStorage.setItem('rol', rol);
  await mostrarFormulario();
  const sinCambios = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(sinCambios);
  expect(sinCambios.defaultPrevented).toBe(false);
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '111' } });
  const conCambios = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(conCambios);
  expect(conCambios.defaultPrevented).toBe(true);
});

test('no cierra la sesion antes de resolver los cambios pendientes', async () => {
  await mostrarFormulario();
  fireEvent.change(screen.getByLabelText('Teléfono'), { target: { value: '111' } });
  fireEvent.click(within(screen.getByRole('banner')).getByTestId('ArrowDropDownIcon').closest('button'));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Cerrar sesión' }));
  const aviso = within(await screen.findByRole('dialog', { name: 'Cambios sin guardar' }));
  expect(localStorage.getItem('token')).toBe('token-qa');
  fireEvent.click(aviso.getByRole('button', { name: 'Guardar' }));
  await screen.findByText('Academia QA');
  expect(alumno.telefono).toBe('111');
  expect(localStorage.getItem('token')).toBeNull();
  localStorage.setItem('token', 'otra-sesion-qa');
  await act(async () => router.navigate('/destino'));
  await act(async () => router.navigate(-1));
  await screen.findByText('Academia QA');
  expect(localStorage.getItem('token')).toBe('otra-sesion-qa');
});

test.each(['usuario', 'admin'])('%s si intenta salir durante la subida espera la confirmacion antes de navegar', async (rol) => {
  localStorage.setItem('rol', rol);
  let confirmar;
  fotoRespuesta = () => new Promise((resolve) => { confirmar = resolve; });
  await mostrarFormulario();
  await recortarFoto();
  await screen.findByText('Subiendo foto...');
  fireEvent.click(screen.getByRole('link', { name: 'Volver' }));
  const aviso = within(await screen.findByRole('dialog', { name: 'Cambios sin guardar' }));
  expect(aviso.getByRole('button', { name: 'Salir sin guardar' })).toBeDisabled();
  expect(aviso.getByRole('button', { name: 'Cerrar y seguir editando' })).toBeDisabled();
  await act(async () => confirmar({ ok: true, json: async () => ({ foto: '/uploads/qa/alumnos/nueva.jpg' }) }));
  await screen.findByText('Destino');
});

test('la foto se guarda aunque los otros datos no pasen la validacion del formulario completo', async () => {
  alumno.fecha_inicio_cobro = '2025-01-01';
  await mostrarFormulario();
  await recortarFoto();
  await screen.findByText('Foto de perfil actualizada');
  expect(global.fetch.mock.calls.some(([, request]) => request?.method === 'PUT')).toBe(false);
});

test('el administrador vuelve sin aviso tras guardar solo la foto y no vuelve a subirla al guardar el formulario', async () => {
  localStorage.setItem('rol', 'admin');
  await mostrarFormulario();
  await recortarFoto();
  await screen.findByText('Foto de perfil actualizada');
  fireEvent.click(screen.getByRole('link', { name: 'Volver' }));
  await screen.findByText('Destino');
  expect(screen.queryByRole('dialog', { name: 'Cambios sin guardar' })).not.toBeInTheDocument();
  await act(async () => router.navigate('/alumno-editar/a1'));
  await screen.findByRole('button', { name: 'Guardar cambios' });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await screen.findByText('Alumno actualizado');
  const [, options] = global.fetch.mock.calls.find(([, request]) => request?.method === 'PUT');
  expect(options.body.has('foto')).toBe(false);
  expect(global.fetch.mock.calls.filter(([, request]) => request?.method === 'PATCH')).toHaveLength(1);
});
