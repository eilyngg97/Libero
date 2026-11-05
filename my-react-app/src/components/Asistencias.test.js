import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Asistencias from './Asistencias';
import PanelOpciones from './PanelOpciones';
import { useSede } from '../context/SedeContext';
import { hasPermission } from '../utils/permissions';
import useMediaQuery from '@mui/material/useMediaQuery';
import HistorialAsistencias from './HistorialAsistencias';
import { createTheme, ThemeProvider } from '@mui/material/styles';

jest.mock('../context/SedeContext', () => ({ useSede: jest.fn() }));
jest.mock('../utils/permissions', () => ({ hasPermission: jest.fn() }));
jest.mock('@mui/material/useMediaQuery', () => ({ __esModule: true, default: jest.fn() }));
const originalFetch = global.fetch;
const sede = { _id: 'sede-a', nombre: 'Villa Crepuscular' };
const fecha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const sesion = { grupo: 'grupo-a', nombre: 'Iniciacion', hora_inicio: '16:00', hora_fin: '17:30', fecha, categorias: ['U13'], total: 2, presentes: 0, tomada: false };
const lista = () => ({ ...sesion, registros: [
  { alumno: 'alumno-a', nombre: 'Perez, Ana', categoria: 'U13', estado: '', observacion: '' },
  { alumno: 'alumno-b', nombre: 'Rojas, Maria', categoria: 'U13', estado: '', observacion: '' }
] });
const historialMensual = () => ({ mes: fecha.slice(0, 7), grupos: [{
  grupo: 'grupo-a', nombre: 'Iniciacion', sesiones: 4, fechas: [1, 2, 3, 4].map(dia => `${fecha.slice(0, 7)}-0${dia}`), alumnos: [
    { alumno: 'alumno-a', nombre: 'Perez, Ana', categoria: 'U13', presentes: 1, ausentes: 1, justificados: 1, sin_marcar: 1, total: 4, porcentaje: 25, registros: ['presente', 'ausente', 'justificado', ''].map((estado, index) => ({ fecha: `${fecha.slice(0, 7)}-0${index + 1}`, estado, observacion: '' })) },
    { alumno: 'alumno-b', nombre: 'Rojas, Maria', categoria: 'U15', presentes: 4, ausentes: 0, justificados: 0, sin_marcar: 0, total: 4, porcentaje: 100, registros: [{ fecha: `${fecha.slice(0, 7)}-01`, estado: 'presente', observacion: 'Puntual' }] },
    { alumno: 'alumno-c', nombre: 'Diaz, Luis', categoria: 'U13', presentes: 0, ausentes: 3, justificados: 1, sin_marcar: 0, total: 4, porcentaje: 0, registros: [] }
  ]
}, { grupo: 'grupo-b', nombre: 'Avanzado', sesiones: 1, fechas: [], alumnos: [{ alumno: 'alumno-d', nombre: 'Soto, Leo', categoria: 'U17', presentes: 1, ausentes: 0, justificados: 0, sin_marcar: 0, total: 1, porcentaje: 100, registros: [] }] }] });
const mount = () => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Asistencias /></MemoryRouter>);
beforeEach(() => {
  useMediaQuery.mockReturnValue(false);
  useSede.mockReturnValue({ sedeSeleccionada: sede });
  hasPermission.mockReturnValue(true);
  global.fetch = jest.fn(async (url, options) => {
    if (url.includes('/sesiones')) return { ok: true, json: async () => ({ sesiones: [sesion], hoy: fecha }) };
    if (url.includes('/lista/')) return { ok: true, json: async () => lista() };
    if (url.includes('/atletas')) return { ok: true, json: async () => ({ atletas: [{ _id: 'atleta-base', nombre: 'Perez, Ana', categoria: 'U13', activo: true }, { _id: 'atleta-extra', nombre: 'Diaz, Luis', categoria: 'U15', activo: true }, { _id: 'atleta-baja', nombre: 'Baja, Maria', categoria: 'U15', activo: false }] }) };
    if (url.includes('/grupos')) return { ok: true, json: async () => ['POST', 'PUT'].includes(options?.method) ? JSON.parse(options.body) : ({ grupos: [], categorias: ['U13', 'U15'], entrenadores: ['Ana Perez', 'Maria Rojas'] }) };
    if (url.includes('/historial')) return { ok: true, json: async () => ({ mes: fecha.slice(0, 7), grupos: [] }) };
    throw new Error(`Consulta inesperada: ${url}`);
  });
});
afterEach(() => { global.fetch = originalFetch; });

test.each([
  [['alumnos.view', 'mensualidades.view', 'asistencias.view', 'solicitudes_uniformes.view'], ['Alumnos', 'Pagos de mensualidades', 'Asistencias', 'Solicitudes Uniforme', 'Pagos de inscripciones']],
  [['mensualidades.view', 'asistencias.view'], ['Pagos de mensualidades', 'Asistencias', 'Pagos de inscripciones']]
])('tarjetas del panel mantienen el orden solicitado con permisos %j', async (permisos, orden) => {
  hasPermission.mockImplementation(permiso => permisos.includes(permiso));
  global.fetch.mockResolvedValue({ ok: true, json: async () => [sede] });
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><PanelOpciones /></MemoryRouter>);
  await screen.findByText('Pagos de inscripciones');
  expect(screen.getAllByText(/^(Alumnos|Pagos de mensualidades|Asistencias|Solicitudes Uniforme|Pagos de inscripciones)$/).map(element => element.textContent)).toEqual(orden);
});
test('tarjeta de asistencias muestra enlace e icono representativo y navega al modulo', async () => {
  hasPermission.mockImplementation(permiso => permiso === 'asistencias.view');
  global.fetch.mockResolvedValue({ ok: true, json: async () => [sede] });
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/" element={<PanelOpciones />} /><Route path="/asistencias" element={<p>Modulo de asistencias</p>} /></Routes></MemoryRouter>);
  const tarjeta = await screen.findByRole('button', { name: /Asistencias Sesiones de entrenamiento Ver asistencias/ });
  expect(within(tarjeta).getByText('Ver asistencias →')).toBeInTheDocument();
  expect(within(tarjeta).getAllByTestId('HowToRegRoundedIcon')).toHaveLength(2);
  expect(tarjeta).toHaveStyle({ minHeight: 'calc(200px + 32px)' });
  expect(tarjeta).toBeEnabled();
  fireEvent.click(tarjeta);
  expect(await screen.findByText('Modulo de asistencias')).toBeInTheDocument();
});
test('tarjeta de asistencias mantiene el bloqueo sin sede seleccionada', async () => {
  useSede.mockReturnValue({ sedeSeleccionada: null });
  hasPermission.mockImplementation(permiso => permiso === 'asistencias.view');
  global.fetch.mockResolvedValue({ ok: true, json: async () => [] });
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><PanelOpciones /></MemoryRouter>);
  const tarjeta = await screen.findByRole('button', { name: /Asistencias Selecciona una sede Ver asistencias/ });
  expect(tarjeta).toBeDisabled();
  expect(within(tarjeta).getByText('Ver asistencias →')).toBeInTheDocument();
});
test('exige sede y no consulta datos cuando no hay una seleccionada', () => {
  useSede.mockReturnValue({ sedeSeleccionada: null });
  mount();
  expect(screen.getByText('Selecciona una sede para consultar sus asistencias.')).toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalled();
});
test('consulta sesiones de la sede seleccionada y muestra resumen', async () => {
  mount();
  expect(await screen.findByText('Iniciacion')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Sede:/ })).not.toBeInTheDocument();
  expect(screen.getByText('2 alumnos')).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('sede=sede-a'), expect.any(Object));
  const pasarLista = screen.getByRole('button', { name: 'Pasar lista' });
  expect(pasarLista).toHaveStyle({ width: '100%', minHeight: '44px', backgroundColor: '#374151', color: '#fff', fontSize: '14px' });
  expect(within(pasarLista).getByTestId('EventAvailableIcon')).toBeInTheDocument();
  expect(screen.getAllByText('Sin tomar')).toHaveLength(1);
  fireEvent.click(pasarLista);
  expect(await screen.findByRole('dialog')).toBeInTheDocument();
});
test.each([
  [{ fecha: '2099-01-01' }, true, 'No puedes pasar lista en una fecha futura.'],
  [{ total: 0 }, true, 'No hay alumnos activos en las categorias de este grupo.'],
  [{}, false, 'No tienes permiso para registrar asistencias.']
])('tooltip explica el bloqueo de Pasar lista %j', async (fields, puedeGestionar, motivo) => {
  const implementation = global.fetch.getMockImplementation();
  global.fetch.mockImplementation(async (url, options) => {
    if (url.includes('/sesiones')) return { ok: true, json: async () => ({ sesiones: [{ ...sesion, ...fields }], hoy: fecha }) };
    return implementation(url, options);
  });
  hasPermission.mockImplementation(permiso => permiso !== 'asistencias.manage' || puedeGestionar);
  mount();
  const boton = await screen.findByRole('button', { name: 'Pasar lista' });
  expect(boton).toBeDisabled();
  const motivoAccesible = screen.getByLabelText(`Motivo del bloqueo: ${motivo}`);
  expect(motivoAccesible).toHaveAttribute('tabindex', '0');
  fireEvent.mouseOver(motivoAccesible);
  expect(await screen.findByRole('tooltip')).toHaveTextContent(motivo);
  fireEvent.click(boton);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('/lista/'), expect.any(Object));
});
test('mantiene las pestanas grises al cambiar de vista aunque el tema sea morado', async () => {
  render(<ThemeProvider theme={createTheme({ palette: { primary: { main: '#9c27b0' } } })}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Asistencias /></MemoryRouter></ThemeProvider>);
  expect(await screen.findByText('Iniciacion')).toBeInTheDocument();
  const sesiones = screen.getByRole('tab', { name: 'Sesiones' });
  const grupos = screen.getByRole('tab', { name: 'Grupos de entrenamiento' });
  expect(sesiones).toHaveStyle({ color: '#374151' });
  expect(grupos).toHaveStyle({ color: '#6b7280' });
  expect(screen.getByRole('tab', { name: 'Historial' })).toHaveStyle({ color: '#6b7280' });
  fireEvent.click(grupos);
  expect(await screen.findByText('No hay grupos de entrenamiento en esta sede.')).toBeInTheDocument();
  expect(grupos).toHaveAttribute('aria-selected', 'true');
  expect(grupos).toHaveStyle({ color: '#374151' });
  expect(sesiones).toHaveStyle({ color: '#6b7280' });
});
test('mantiene el estandar gris en los botones superiores y conserva la navegacion', async () => {
  render(<ThemeProvider theme={createTheme({ palette: { primary: { main: '#9c27b0' } } })}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Asistencias /></MemoryRouter></ThemeProvider>);
  expect(await screen.findByText('Iniciacion')).toBeInTheDocument();
  for (const nombre of ['Hoy', 'Configurar grupos', 'Historial']) {
    expect(screen.getByRole('button', { name: nombre, exact: true })).toHaveStyle({ color: '#475569', borderColor: '#94a3b8', backgroundColor: '#fff', minHeight: '36px' });
  }
  fireEvent.click(screen.getByRole('button', { name: 'Configurar grupos' }));
  expect(await screen.findByText('No hay grupos de entrenamiento en esta sede.')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Grupos de entrenamiento' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Historial', exact: true }));
  expect(screen.getByRole('tab', { name: 'Historial' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('button', { name: 'Sesiones', exact: true })).toHaveStyle({ color: '#475569', borderColor: '#94a3b8', backgroundColor: '#fff' });
  fireEvent.click(screen.getByRole('button', { name: 'Sesiones', exact: true }));
  expect(await screen.findByText('Iniciacion')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Sesiones' })).toHaveAttribute('aria-selected', 'true');
});
test('desktop muestra foto del atleta e iniciales cuando no hay foto', async () => {
  const implementation = global.fetch.getMockImplementation();
  global.fetch.mockImplementation(async (url, options) => {
    if (url.includes('/lista/')) return { ok: true, json: async () => ({ ...lista(), registros: lista().registros.map((item, index) => ({ ...item, foto: index === 0 ? '/uploads/qa/alumnos/ana.webp' : '' })) }) };
    return implementation(url, options);
  });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Pasar lista' }));
  const dialog = within(await screen.findByRole('dialog'));
  expect(dialog.getByRole('img', { name: 'Foto de Perez, Ana' })).toHaveAttribute('src', expect.stringContaining('/uploads/qa/alumnos/ana.webp'));
  expect(dialog.getByText('MR')).toBeInTheDocument();
  expect(dialog.getByRole('button', { name: 'Cancelar' })).toBeEnabled();
  expect(dialog.getByRole('button', { name: 'Guardar asistencia' })).toBeDisabled();
});

test('desktop identifica los cuatro estados por color y actualiza la fila al cambiar el selector', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Pasar lista' }));
  const dialog = within(await screen.findByRole('dialog'));
  expect(dialog.getByRole('group', { name: 'Perez, Ana: Sin marcar' })).toHaveStyle({ backgroundColor: '#f7f8fa', borderLeftColor: '#9298a5' });
  for (const [estado, fondo, borde] of [
    ['Presente', '#f0faf4', '#25834c'],
    ['Ausente', '#fff3f4', '#cf435d'],
    ['Justificado', '#fff9ed', '#b77916'],
    ['Sin marcar', '#f7f8fa', '#9298a5']
  ]) {
    fireEvent.mouseDown(dialog.getByRole('combobox', { name: 'Estado de Perez, Ana' }));
    fireEvent.click(await screen.findByRole('option', { name: estado, exact: true }));
    expect(dialog.getByRole('group', { name: `Perez, Ana: ${estado}` })).toHaveStyle({ backgroundColor: fondo, borderLeftColor: borde });
  }
  expect(dialog.getByRole('button', { name: 'Guardar asistencia' })).toBeEnabled();
});

test('desmarcar todos restablece la lista completa y conserva notas aunque haya una busqueda activa', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Pasar lista' }));
  const dialog = within(await screen.findByRole('dialog'));
  expect(dialog.queryByRole('button', { name: 'Todos ausentes' })).not.toBeInTheDocument();
  fireEvent.click(dialog.getByRole('button', { name: 'Todos presentes' }));
  fireEvent.change(dialog.getByRole('textbox', { name: 'Nota de Perez, Ana' }), { target: { value: 'Conservar nota' } });
  fireEvent.change(dialog.getByRole('textbox', { name: 'Buscar alumno' }), { target: { value: 'Ana' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Desmarcar todos' }));
  expect(dialog.getByRole('group', { name: 'Perez, Ana: Sin marcar' })).toBeInTheDocument();
  expect(dialog.getByRole('textbox', { name: 'Nota de Perez, Ana' })).toHaveValue('Conservar nota');
  expect(dialog.getByText('2 sin marcar')).toBeInTheDocument();
  expect(dialog.getByRole('button', { name: 'Guardar asistencia' })).toBeEnabled();
  fireEvent.change(dialog.getByRole('textbox', { name: 'Buscar alumno' }), { target: { value: '' } });
  expect(dialog.getByRole('group', { name: 'Rojas, Maria: Sin marcar' })).toBeInTheDocument();
});

test('guarda estados y observaciones despues de marcar todos presentes', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Pasar lista' }));
  const dialog = within(await screen.findByRole('dialog'));
  expect(dialog.getByRole('button', { name: 'Guardar asistencia' })).toBeDisabled();
  fireEvent.click(dialog.getByRole('button', { name: 'Todos presentes' }));
  fireEvent.change(dialog.getByRole('textbox', { name: 'Nota de Perez, Ana' }), { target: { value: 'Entreno completo' } });
  expect(dialog.getByRole('button', { name: 'Guardar asistencia' })).toBeEnabled();
  fireEvent.click(dialog.getByRole('button', { name: 'Guardar asistencia' }));
  expect(await screen.findByText('Asistencia guardada.')).toBeInTheDocument();
  const notificacion = within(await screen.findByRole('status'));
  expect(notificacion.getByText('Iniciacion - 2 de 2 marcados')).toBeInTheDocument();
  fireEvent.click(notificacion.getByRole('button', { name: 'Cerrar notificacion' }));
  await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
  const writes = global.fetch.mock.calls.filter(([, options]) => options.method === 'PUT');
  expect(writes).toHaveLength(1);
  expect(JSON.parse(writes[0][1].body)).toMatchObject({ fecha, version: null, registros: [
    { alumno: 'alumno-a', estado: 'presente', observacion: 'Entreno completo' },
    { alumno: 'alumno-b', estado: 'presente', observacion: '' }
  ] });
});
test('guarda una lista parcial, la reabre y permite completar los pendientes conservando notas y version', async () => {
  let guardada = null;
  const implementation = global.fetch.getMockImplementation();
  global.fetch.mockImplementation(async (url, options) => {
    if (url.includes('/sesiones')) return { ok: true, json: async () => ({ hoy: fecha, sesiones: [{ ...sesion, tomada: Boolean(guardada), sin_marcar: guardada ? guardada.registros.filter(item => !item.estado).length : 2 }] }) };
    if (url.includes('/lista/') && options.method === 'PUT') {
      const payload = JSON.parse(options.body);
      guardada = { ...lista(), ...payload, registros: lista().registros.map(item => ({ ...item, ...payload.registros.find(registro => registro.alumno === item.alumno) })), tomada: true, __v: guardada ? guardada.__v + 1 : 0 };
      return { ok: true, json: async () => guardada };
    }
    if (url.includes('/lista/')) return { ok: true, json: async () => guardada || lista() };
    return implementation(url, options);
  });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Pasar lista' }));
  let dialog = within(await screen.findByRole('dialog'));
  fireEvent.mouseDown(dialog.getByRole('combobox', { name: 'Estado de Perez, Ana' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Presente', exact: true }));
  fireEvent.change(dialog.getByRole('textbox', { name: 'Nota de Perez, Ana' }), { target: { value: 'Llego primero' } });
  expect(dialog.getByText('1 sin marcar')).toBeInTheDocument();
  expect(dialog.getByRole('button', { name: 'Guardar asistencia' })).toBeEnabled();
  fireEvent.click(dialog.getByRole('button', { name: 'Guardar asistencia' }));
  expect(await screen.findByText('Parcial')).toBeInTheDocument();
  expect(screen.getByText('Iniciacion - 1 de 2 marcados')).toBeInTheDocument();
  expect(guardada.registros[1].estado).toBe('');
  fireEvent.click(await screen.findByRole('button', { name: 'Ver / editar' }));
  dialog = within(await screen.findByRole('dialog'));
  expect(dialog.getByRole('group', { name: 'Perez, Ana: Presente' })).toBeInTheDocument();
  expect(dialog.getByRole('group', { name: 'Rojas, Maria: Sin marcar' })).toBeInTheDocument();
  expect(dialog.getByRole('textbox', { name: 'Nota de Perez, Ana' })).toHaveValue('Llego primero');
  fireEvent.mouseDown(dialog.getByRole('combobox', { name: 'Estado de Rojas, Maria' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Presente', exact: true }));
  fireEvent.click(dialog.getByRole('button', { name: 'Guardar asistencia' }));
  expect(await screen.findByText('Tomada')).toBeInTheDocument();
  expect(guardada.__v).toBe(1);
  expect(guardada.registros).toEqual([
    expect.objectContaining({ alumno: 'alumno-a', estado: 'presente', observacion: 'Llego primero' }),
    expect.objectContaining({ alumno: 'alumno-b', estado: 'presente', observacion: '' })
  ]);
  const writes = global.fetch.mock.calls.filter(([, options]) => options.method === 'PUT');
  expect(writes).toHaveLength(2);
  expect(JSON.parse(writes[1][1].body).version).toBe(0);
});

test('error de concurrencia conserva borrador dentro del dialogo', async () => {
  const implementation = global.fetch.getMockImplementation();
  global.fetch.mockImplementation(async (url, options) => options.method === 'PUT'
    ? { ok: false, json: async () => ({ error: 'Otra persona actualizo la lista.' }) }
    : implementation(url, options));
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Pasar lista' }));
  const dialog = within(await screen.findByRole('dialog'));
  fireEvent.click(dialog.getByRole('button', { name: 'Todos presentes' }));
  fireEvent.change(dialog.getByRole('textbox', { name: 'Nota de Perez, Ana' }), { target: { value: 'Borrador conservado' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Guardar asistencia' }));
  expect(await dialog.findByText('Otra persona actualizo la lista.')).toBeInTheDocument();
  expect(dialog.getByRole('textbox', { name: 'Nota de Perez, Ana' })).toHaveValue('Borrador conservado');
});
test('solo lectura puede consultar lista guardada sin editarla', async () => {
  hasPermission.mockImplementation(permission => permission !== 'asistencias.manage');
  const implementation = global.fetch.getMockImplementation();
  global.fetch.mockImplementation(async (url, options) => {
    if (url.includes('/sesiones')) return { ok: true, json: async () => ({ sesiones: [{ ...sesion, tomada: true, presentes: 2 }], hoy: fecha }) };
    return implementation(url, options);
  });
  mount();
  expect(screen.queryByRole('button', { name: 'Configurar grupos' })).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Ver lista' }));
  const dialog = within(await screen.findByRole('dialog'));
  expect(dialog.queryByRole('button', { name: 'Guardar asistencia' })).not.toBeInTheDocument();
  expect(dialog.getByRole('textbox', { name: 'Nota de Perez, Ana' })).toBeDisabled();
});
test('grupo distingue dias seleccionados con contraste y marca sin perder seleccion multiple', async () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Configurar grupos' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Nuevo grupo' }));
  const dialog = within(await screen.findByRole('dialog'));
  const lunes = dialog.getByRole('button', { name: 'Lunes' });
  const jueves = dialog.getByRole('button', { name: 'Jueves' });
  expect(lunes).toHaveAttribute('aria-pressed', 'false');
  expect(lunes).toHaveStyle({ backgroundColor: '#fff', color: '#4b5563', height: '58px' });
  expect(within(lunes).getByTestId('CheckIcon')).toHaveStyle({ visibility: 'hidden' });
  fireEvent.click(lunes);
  fireEvent.click(jueves);
  for (const boton of [lunes, jueves]) {
    expect(boton).toHaveAttribute('aria-pressed', 'true');
    expect(boton).toHaveStyle({ backgroundColor: '#201d58', color: '#fff', height: '58px' });
    expect(within(boton).getByTestId('CheckIcon')).toHaveStyle({ visibility: 'visible' });
  }
  fireEvent.click(lunes);
  expect(lunes).toHaveAttribute('aria-pressed', 'false');
  expect(lunes).toHaveStyle({ backgroundColor: '#fff', color: '#4b5563' });
  expect(within(lunes).getByTestId('CheckIcon')).toHaveStyle({ visibility: 'hidden' });
  expect(jueves).toHaveAttribute('aria-pressed', 'true');
});
test('grupo muestra las categorias del tenant en el orden recibido de configuracion', async () => {
  const categoriasConfiguradas = ['U7', 'U15/INFANTIL', 'MAYORES / LIBRE'];
  const implementation = global.fetch.getMockImplementation();
  global.fetch.mockImplementation(async (url, options) => {
    if (url.includes('/grupos')) return { ok: true, json: async () => ({ grupos: [], categorias: categoriasConfiguradas, entrenadores: [] }) };
    return implementation(url, options);
  });
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Configurar grupos' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Nuevo grupo' }));
  const dialog = within(await screen.findByRole('dialog'));
  fireEvent.mouseDown(dialog.getByRole('combobox', { name: 'Categorias' }));
  const opciones = await screen.findAllByRole('option');
  expect(opciones.map(opcion => opcion.textContent)).toEqual(categoriasConfiguradas);
  expect(screen.queryByRole('option', { name: 'U13' })).not.toBeInTheDocument();
});
test('crear grupo exige dias y categorias', async () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Configurar grupos' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Nuevo grupo' }));
  const dialog = within(await screen.findByRole('dialog'));
  const guardar = dialog.getByRole('button', { name: 'Guardar grupo' });
  expect(guardar).toBeDisabled();
  expect(guardar).toHaveStyle({ minHeight: '44px', backgroundColor: '#e5e7eb', color: '#6b7280', borderRadius: '6px' });
  expect(dialog.getByRole('button', { name: 'Cancelar' })).toHaveStyle({ minHeight: '44px', backgroundColor: '#fff', color: '#475569', borderColor: '#cbd5e1', borderRadius: '6px' });
  expect(within(dialog.getByRole('button', { name: 'Cancelar' })).getByTestId('CloseIcon')).toBeInTheDocument();
  fireEvent.change(dialog.getByRole('textbox', { name: /Nombre del grupo/ }), { target: { value: 'Baby' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Lunes' }));
  fireEvent.mouseDown(dialog.getByRole('combobox', { name: 'Categorias' }));
  fireEvent.click(await screen.findByRole('option', { name: 'U13' }));
  expect(guardar).toBeEnabled();
  expect(guardar).toHaveStyle({ minHeight: '44px', backgroundColor: '#201d58', color: '#fff' });
  fireEvent.click(dialog.getByRole('button', { name: 'Guardar grupo' }));
  expect(await screen.findByText('Grupo guardado.')).toBeInTheDocument();
  const writes = global.fetch.mock.calls.filter(([, options]) => options.method === 'POST');
  expect(writes).toHaveLength(1);
  expect(JSON.parse(writes[0][1].body)).toMatchObject({ nombre: 'Baby', dias: [1], categorias: ['U13'] });
});
test.each(['registrado', 'externo'])('grupo guarda entrenador %s desde el selector o texto libre', async tipo => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Configurar grupos' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Nuevo grupo' }));
  const dialog = within(await screen.findByRole('dialog'));
  fireEvent.change(dialog.getByRole('textbox', { name: /Nombre del grupo/ }), { target: { value: 'Avanzados' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Martes' }));
  fireEvent.mouseDown(dialog.getByRole('combobox', { name: 'Categorias' }));
  fireEvent.click(await screen.findByRole('option', { name: 'U15' }));
  const entrenador = dialog.getByRole('combobox', { name: 'Entrenadores' });
  expect(entrenador).toHaveAttribute('maxlength', '100');
  fireEvent.focus(entrenador);
  expect(await screen.findByRole('option', { name: 'Ana Perez' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Maria Rojas' })).toBeInTheDocument();
  fireEvent.change(entrenador, { target: { value: tipo === 'registrado' ? 'Maria' : 'Carlos Invitado' } });
  expect(screen.queryByRole('option', { name: 'Ana Perez' })).not.toBeInTheDocument();
  if (tipo === 'registrado') {
    fireEvent.click(await screen.findByRole('option', { name: 'Maria Rojas' }));
  } else {
    fireEvent.blur(entrenador);
  }
  const nombre = tipo === 'registrado' ? 'Maria Rojas' : 'Carlos Invitado';
  expect(dialog.getByText(nombre)).toBeInTheDocument();
  expect(entrenador).toHaveValue('');
  fireEvent.click(dialog.getByRole('button', { name: 'Guardar grupo' }));
  expect(await screen.findByText('Grupo guardado.')).toBeInTheDocument();
  const writes = global.fetch.mock.calls.filter(([, options]) => options.method === 'POST');
  expect(writes).toHaveLength(1);
  expect(JSON.parse(writes[0][1].body)).toMatchObject({ nombre: 'Avanzados', entrenador: nombre, entrenadores: [nombre] });
});
test('grupo existente conserva su entrenador anterior y permite seleccionar varios y agregar externos', async () => {
  const implementation = global.fetch.getMockImplementation();
  let grupoGuardado = { _id: 'grupo-a', nombre: 'Avanzados', dias: [1], hora_inicio: '16:00', hora_fin: '17:30', categorias: ['U13'], entrenador: 'Ana Perez', cancha: '', activo: true };
  global.fetch.mockImplementation(async (url, options) => {
    if (url.includes('/grupos')) {
      if (options?.method === 'PUT') {
        grupoGuardado = JSON.parse(options.body);
        return { ok: true, json: async () => grupoGuardado };
      }
      return { ok: true, json: async () => ({ grupos: [grupoGuardado], categorias: ['U13'], entrenadores: ['Ana Perez', 'Maria Rojas'] }) };
    }
    return implementation(url, options);
  });
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Configurar grupos' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Editar Avanzados' }));
  const dialog = within(await screen.findByRole('dialog'));
  expect(dialog.getByText('Ana Perez')).toBeInTheDocument();
  const entrada = dialog.getByRole('combobox', { name: 'Entrenadores' });
  fireEvent.focus(entrada);
  fireEvent.click(await screen.findByRole('option', { name: 'Maria Rojas' }));
  fireEvent.change(entrada, { target: { value: 'Carlos Invitado' } });
  fireEvent.keyDown(entrada, { key: 'Enter', code: 'Enter' });
  expect(dialog.getByText('Ana Perez')).toBeInTheDocument();
  expect(dialog.getByText('Maria Rojas')).toBeInTheDocument();
  expect(dialog.getByText('Carlos Invitado')).toBeInTheDocument();
  fireEvent.click(dialog.getByRole('button', { name: 'Guardar grupo' }));
  expect(await screen.findByText('Grupo guardado.')).toBeInTheDocument();
  const writes = global.fetch.mock.calls.filter(([, options]) => options.method === 'PUT');
  expect(writes).toHaveLength(1);
  expect(JSON.parse(writes[0][1].body)).toMatchObject({ entrenador: 'Ana Perez', entrenadores: ['Ana Perez', 'Maria Rojas', 'Carlos Invitado'] });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), { timeout: 5000 });
  fireEvent.click(await screen.findByRole('button', { name: 'Editar Avanzados' }));
  const reabierto = within(await screen.findByRole('dialog'));
  expect(reabierto.getByText('Ana Perez')).toBeInTheDocument();
  expect(reabierto.getByText('Maria Rojas')).toBeInTheDocument();
  expect(reabierto.getByText('Carlos Invitado')).toBeInTheDocument();
});
test('grupo permite quitar todos los entrenadores sin recuperar el nombre antiguo', async () => {
  const implementation = global.fetch.getMockImplementation();
  global.fetch.mockImplementation(async (url, options) => {
    if (options?.method === 'PUT') return implementation(url, options);
    if (url.includes('/grupos')) return { ok: true, json: async () => ({ grupos: [{ _id: 'grupo-a', nombre: 'Avanzados', dias: [1], hora_inicio: '16:00', hora_fin: '17:30', categorias: ['U13'], entrenador: 'Ana Perez', entrenadores: ['Ana Perez', 'Maria Rojas'], cancha: '', activo: true }], categorias: ['U13'], entrenadores: ['Ana Perez', 'Maria Rojas'] }) };
    return implementation(url, options);
  });
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Configurar grupos' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Editar Avanzados' }));
  const dialog = within(await screen.findByRole('dialog'));
  const entrada = dialog.getByRole('combobox', { name: 'Entrenadores' });
  expect(dialog.getByText('Ana Perez')).toBeInTheDocument();
  expect(dialog.getByText('Maria Rojas')).toBeInTheDocument();
  fireEvent.keyDown(entrada, { key: 'Backspace', code: 'Backspace' });
  fireEvent.keyDown(entrada, { key: 'Backspace', code: 'Backspace' });
  expect(dialog.queryByText('Ana Perez')).not.toBeInTheDocument();
  expect(dialog.queryByText('Maria Rojas')).not.toBeInTheDocument();
  fireEvent.click(dialog.getByRole('button', { name: 'Guardar grupo' }));
  expect(await screen.findByText('Grupo guardado.')).toBeInTheDocument();
  const writes = global.fetch.mock.calls.filter(([, options]) => options.method === 'PUT');
  expect(JSON.parse(writes[0][1].body)).toMatchObject({ entrenador: '', entrenadores: [] });
});
test.each([undefined, ['Ana Perez']])('grupo conserva la seleccion si el backend devuelve una lista incompleta %j', async entrenadoresDevueltos => {
  const implementation = global.fetch.getMockImplementation();
  global.fetch.mockImplementation(async (url, options) => {
    if (url.includes('/grupos') && options?.method === 'POST') return { ok: true, json: async () => ({ _id: 'grupo-nuevo', entrenador: 'Ana Perez', entrenadores: entrenadoresDevueltos }) };
    return implementation(url, options);
  });
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Configurar grupos' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Nuevo grupo' }));
  const dialog = within(await screen.findByRole('dialog'));
  fireEvent.change(dialog.getByRole('textbox', { name: /Nombre del grupo/ }), { target: { value: 'Avanzados' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Lunes' }));
  fireEvent.mouseDown(dialog.getByRole('combobox', { name: 'Categorias' }));
  fireEvent.click(await screen.findByRole('option', { name: 'U13' }));
  const entrada = dialog.getByRole('combobox', { name: 'Entrenadores' });
  fireEvent.focus(entrada);
  fireEvent.click(await screen.findByRole('option', { name: 'Ana Perez' }));
  fireEvent.change(entrada, { target: { value: 'Maria' } });
  fireEvent.click(await screen.findByRole('option', { name: 'Maria Rojas' }));
  fireEvent.click(dialog.getByRole('button', { name: 'Guardar grupo' }));
  expect(await dialog.findByRole('alert')).toHaveTextContent('El servidor no confirmo todos los entrenadores.');
  expect(dialog.getByText('Ana Perez')).toBeInTheDocument();
  expect(dialog.getByText('Maria Rojas')).toBeInTheDocument();
  expect(screen.queryByText('Grupo guardado.')).not.toBeInTheDocument();
  fireEvent.click(dialog.getByRole('button', { name: 'Guardar grupo' }));
  expect(await screen.findByText('Grupo guardado.')).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/grupos/grupo-nuevo'), expect.objectContaining({ method: 'PUT' }));
});
test('grupo permite incluir atletas de otras categorias y excluir atletas base sin cambiar categorias y conserva ajustes al reabrir', async () => {
  const implementation = global.fetch.getMockImplementation();
  let guardado = { _id: 'grupo-ajustes', nombre: 'U13 tarde', dias: [1], hora_inicio: '16:00', hora_fin: '17:30', categorias: ['U13'], entrenadores: [], entrenador: '', cancha: '', activo: true };
  global.fetch.mockImplementation(async (url, options) => {
    if (url.includes('/grupos')) {
      if (options?.method === 'PUT') { guardado = JSON.parse(options.body); return { ok: true, json: async () => guardado }; }
      return { ok: true, json: async () => ({ grupos: [guardado], categorias: ['U13', 'U15'], entrenadores: [] }) };
    }
    return implementation(url, options);
  });
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Configurar grupos' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Editar U13 tarde' }));
  const dialog = within(await screen.findByRole('dialog'));
  expect(dialog.queryByRole('combobox', { name: 'Atletas adicionales' })).not.toBeInTheDocument();
  fireEvent.click(dialog.getByRole('button', { name: 'Editar integrantes del grupo' }));
  const integrantes = within(await screen.findByRole('dialog', { name: 'Integrantes del grupo' }));
  expect(await integrantes.findByRole('checkbox', { name: 'Perez, Ana U13' })).toBeChecked();
  expect(integrantes.getByRole('checkbox', { name: 'Diaz, Luis U15' })).not.toBeChecked();
  expect(integrantes.queryByRole('checkbox', { name: /Baja, Maria/ })).not.toBeInTheDocument();
  fireEvent.click(integrantes.getByRole('checkbox', { name: 'Diaz, Luis U15' }));
  fireEvent.click(integrantes.getByRole('checkbox', { name: 'Perez, Ana U13' }));
  expect(integrantes.getByRole('button', { name: 'Aplicar integrantes' })).toHaveStyle({ backgroundColor: '#201d58', color: '#fff' });
  fireEvent.click(integrantes.getByRole('button', { name: 'Aplicar integrantes' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Integrantes del grupo' })).not.toBeInTheDocument(), { timeout: 5000 });
  fireEvent.click(dialog.getByRole('button', { name: 'Guardar grupo' }));
  expect(await screen.findByText('Grupo guardado.')).toBeInTheDocument();
  expect(guardado).toMatchObject({ categorias: ['U13'], alumnos_adicionales: ['atleta-extra'], alumnos_excluidos: ['atleta-base'] });
  expect(global.fetch).not.toHaveBeenCalledWith(expect.stringContaining('/api/alumnos'), expect.objectContaining({ method: 'PUT' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), { timeout: 5000 });
  fireEvent.click(await screen.findByRole('button', { name: 'Editar U13 tarde' }));
  const reabierto = within(await screen.findByRole('dialog'));
  fireEvent.click(reabierto.getByRole('button', { name: 'Editar integrantes del grupo' }));
  const listaIntegrantes = within(await screen.findByRole('dialog', { name: 'Integrantes del grupo' }));
  expect(await listaIntegrantes.findByRole('checkbox', { name: 'Diaz, Luis U15' })).toBeChecked();
  expect(listaIntegrantes.getByRole('checkbox', { name: 'Perez, Ana U13' })).not.toBeChecked();
  fireEvent.click(listaIntegrantes.getByRole('checkbox', { name: 'Diaz, Luis U15' }));
  fireEvent.click(listaIntegrantes.getByRole('checkbox', { name: 'Perez, Ana U13' }));
  fireEvent.click(listaIntegrantes.getByRole('button', { name: 'Aplicar integrantes' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Integrantes del grupo' })).not.toBeInTheDocument(), { timeout: 5000 });
  fireEvent.click(reabierto.getByRole('button', { name: 'Guardar grupo' }));
  await waitFor(() => expect(guardado).toMatchObject({ categorias: ['U13'], alumnos_adicionales: [], alumnos_excluidos: [] }));
});
test('grupo filtra otros integrantes por categoria y nombre sin perder seleccion y cancela el borrador', async () => {
  const implementation = global.fetch.getMockImplementation();
  global.fetch.mockImplementation(async (url, options) => {
    if (url.includes('/atletas')) {
      const response = await implementation(url, options);
      const data = await response.json();
      return { ok: true, json: async () => ({ atletas: [...data.atletas, { _id: 'atleta-u17', nombre: 'Gomez, Luisa', categoria: 'U17', activo: true }] }) };
    }
    return implementation(url, options);
  });
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Configurar grupos' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Nuevo grupo' }));
  const grupo = within(await screen.findByRole('dialog'));
  expect(grupo.getByRole('button', { name: 'Editar integrantes del grupo' })).toBeDisabled();
  fireEvent.mouseDown(grupo.getByRole('combobox', { name: 'Categorias' }));
  fireEvent.click(await screen.findByRole('option', { name: 'U13' }));
  fireEvent.keyDown(grupo.getByRole('combobox', { name: 'Categorias' }), { key: 'Escape' });
  fireEvent.click(grupo.getByRole('button', { name: 'Editar integrantes del grupo' }));
  const integrantes = within(await screen.findByRole('dialog', { name: 'Integrantes del grupo' }));
  expect(await integrantes.findByRole('checkbox', { name: 'Perez, Ana U13' })).toBeChecked();
  fireEvent.mouseDown(integrantes.getByRole('combobox', { name: 'Categoria' }));
  fireEvent.click(await screen.findByRole('option', { name: 'U17' }));
  expect(integrantes.queryByRole('checkbox', { name: 'Diaz, Luis U15' })).not.toBeInTheDocument();
  fireEvent.click(integrantes.getByRole('checkbox', { name: 'Gomez, Luisa U17' }));
  fireEvent.change(integrantes.getByRole('textbox', { name: 'Nombre del atleta' }), { target: { value: '  GÓMEZ  ' } });
  expect(integrantes.getByRole('checkbox', { name: 'Gomez, Luisa U17' })).toBeChecked();
  fireEvent.change(integrantes.getByRole('textbox', { name: 'Nombre del atleta' }), { target: { value: 'sin coincidencia' } });
  expect(integrantes.getByText('No hay atletas que coincidan.')).toBeInTheDocument();
  expect(integrantes.getByText('2 integrantes')).toBeInTheDocument();
  expect(integrantes.getByRole('checkbox', { name: 'Perez, Ana U13' })).toBeChecked();
  fireEvent.change(integrantes.getByRole('textbox', { name: 'Nombre del atleta' }), { target: { value: '' } });
  expect(integrantes.getByRole('checkbox', { name: 'Gomez, Luisa U17' })).toBeChecked();
  fireEvent.click(integrantes.getByRole('checkbox', { name: 'Gomez, Luisa U17' }));
  fireEvent.click(integrantes.getByRole('checkbox', { name: 'Perez, Ana U13' }));
  fireEvent.click(integrantes.getByRole('button', { name: 'Cancelar' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Integrantes del grupo' })).not.toBeInTheDocument(), { timeout: 5000 });
  fireEvent.click(grupo.getByRole('button', { name: 'Editar integrantes del grupo' }));
  const reabierto = within(await screen.findByRole('dialog', { name: 'Integrantes del grupo' }));
  expect(await reabierto.findByRole('checkbox', { name: 'Perez, Ana U13' })).toBeChecked();
  expect(reabierto.getByRole('checkbox', { name: 'Gomez, Luisa U17' })).not.toBeChecked();
  expect(reabierto.getByRole('checkbox', { name: 'Diaz, Luis U15' })).not.toBeChecked();
  expect(reabierto.getByRole('textbox', { name: 'Nombre del atleta' })).toHaveValue('');
  expect(global.fetch.mock.calls.filter(([, options]) => ['POST', 'PUT'].includes(options?.method))).toHaveLength(0);
});
test('grupo pagina ambas listas de integrantes independientemente y conserva selecciones de todas las paginas', async () => {
  const implementation = global.fetch.getMockImplementation();
  global.fetch.mockImplementation(async (url, options) => {
    if (url.includes('/atletas')) return { ok: true, json: async () => ({ atletas: [
      ...Array.from({ length: 12 }, (_, index) => ({ _id: `base-${index + 1}`, nombre: `Base ${index + 1}`, categoria: 'U13', activo: true })),
      ...Array.from({ length: 12 }, (_, index) => ({ _id: `otro-${index + 1}`, nombre: `Otro ${index + 1}`, categoria: 'U15', activo: true }))
    ] }) };
    return implementation(url, options);
  });
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Configurar grupos' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Nuevo grupo' }));
  const grupo = within(await screen.findByRole('dialog'));
  fireEvent.change(grupo.getByRole('textbox', { name: /Nombre del grupo/ }), { target: { value: 'Paginado' } });
  fireEvent.click(grupo.getByRole('button', { name: 'Lunes' }));
  fireEvent.mouseDown(grupo.getByRole('combobox', { name: 'Categorias' }));
  fireEvent.click(await screen.findByRole('option', { name: 'U13' }));
  fireEvent.keyDown(grupo.getByRole('combobox', { name: 'Categorias' }), { key: 'Escape' });
  fireEvent.click(grupo.getByRole('button', { name: 'Editar integrantes del grupo' }));
  const integrantes = within(await screen.findByRole('dialog', { name: 'Integrantes del grupo', exact: true }));
  const base = within(await integrantes.findByRole('region', { name: 'Atletas de las categorias seleccionadas' }));
  const otros = within(integrantes.getByRole('region', { name: 'Agregar otros atletas' }));
  expect(base.getAllByRole('checkbox')).toHaveLength(5);
  expect(otros.getAllByRole('checkbox')).toHaveLength(5);
  fireEvent.click(base.getByRole('button', { name: 'Pagina siguiente' }));
  fireEvent.click(base.getByRole('checkbox', { name: 'Base 6 U13' }));
  expect(otros.getByText('1-5 de 12')).toBeInTheDocument();
  fireEvent.click(otros.getByRole('button', { name: 'Pagina siguiente' }));
  fireEvent.click(otros.getByRole('checkbox', { name: 'Otro 6 U15' }));
  fireEvent.click(otros.getByRole('button', { name: 'Pagina siguiente' }));
  expect(otros.getAllByRole('checkbox')).toHaveLength(2);
  fireEvent.click(otros.getByRole('checkbox', { name: 'Otro 11 U15' }));
  fireEvent.change(base.getByRole('textbox', { name: 'Buscar por nombre' }), { target: { value: '  BÁSE 6  ' } });
  expect(base.getByText('1-1 de 1')).toBeInTheDocument();
  expect(base.getByRole('checkbox', { name: 'Base 6 U13' })).not.toBeChecked();
  expect(otros.getByText('11-12 de 12')).toBeInTheDocument();
  fireEvent.change(base.getByRole('textbox', { name: 'Buscar por nombre' }), { target: { value: 'sin coincidencia' } });
  expect(base.getByText('No hay atletas que coincidan.')).toBeInTheDocument();
  fireEvent.change(base.getByRole('textbox', { name: 'Buscar por nombre' }), { target: { value: '' } });
  expect(base.getByText('1-5 de 12')).toBeInTheDocument();
  fireEvent.click(base.getByRole('button', { name: 'Pagina siguiente' }));
  expect(base.getByText('6-10 de 12')).toBeInTheDocument();
  expect(base.getByRole('checkbox', { name: 'Base 6 U13' })).not.toBeChecked();
  fireEvent.change(integrantes.getByRole('textbox', { name: 'Nombre del atleta' }), { target: { value: 'Otro 1' } });
  expect(otros.getByText('1-4 de 4')).toBeInTheDocument();
  expect(otros.getByRole('checkbox', { name: 'Otro 11 U15' })).toBeChecked();
  expect(base.getByText('6-10 de 12')).toBeInTheDocument();
  fireEvent.change(integrantes.getByRole('textbox', { name: 'Nombre del atleta' }), { target: { value: '' } });
  fireEvent.click(otros.getByRole('button', { name: 'Pagina siguiente' }));
  expect(otros.getByRole('checkbox', { name: 'Otro 6 U15' })).toBeChecked();
  fireEvent.mouseDown(otros.getByRole('combobox', { name: 'Filas:' }));
  fireEvent.click(await screen.findByRole('option', { name: '10' }));
  expect(otros.getByText('1-10 de 12')).toBeInTheDocument();
  expect(otros.getAllByRole('checkbox')).toHaveLength(10);
  expect(base.getAllByRole('checkbox')).toHaveLength(5);
  expect(base.getByText('6-10 de 12')).toBeInTheDocument();
  fireEvent.click(integrantes.getByRole('button', { name: 'Aplicar integrantes' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Integrantes del grupo', exact: true })).not.toBeInTheDocument(), { timeout: 5000 });
  fireEvent.click(grupo.getByRole('button', { name: 'Guardar grupo' }));
  expect(await screen.findByText('Grupo guardado.')).toBeInTheDocument();
  const writes = global.fetch.mock.calls.filter(([, options]) => options?.method === 'POST');
  expect(writes).toHaveLength(1);
  expect(JSON.parse(writes[0][1].body)).toMatchObject({ categorias: ['U13'], alumnos_adicionales: ['otro-6', 'otro-11'], alumnos_excluidos: ['base-6'] });
}, 40000);
test('historial consulta el mes completo de la sede seleccionada', async () => {
  mount();
  fireEvent.click(screen.getByRole('tab', { name: 'Historial' }));
  expect(await screen.findByText('No hay asistencias guardadas en este mes.')).toBeInTheDocument();
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining(`historial?mes=${fecha.slice(0, 7)}&sede=sede-a`), expect.any(Object)));
  fireEvent.change(screen.getByLabelText('Mes'), { target: { value: '2020-09' } });
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('historial?mes=2020-09&sede=sede-a'), expect.any(Object)));
});

test('historial presenta cantidades, porcentaje y calendario por alumno y permite abrir la lista del dia', () => {
  const abrir = jest.fn();
  render(<HistorialAsistencias reporte={historialMensual()} mes={fecha.slice(0, 7)} onMes={jest.fn()} onAbrirLista={abrir} abriendo={false} />);
  const tabla = within(screen.getByRole('table', { name: 'Resumen mensual de asistencia' }));
  const fila = within(tabla.getByRole('row', { name: /Perez, Ana/ }));
  expect(fila.getAllByRole('cell').map(cell => cell.textContent)).toEqual([expect.stringContaining('Perez, AnaU13'), '1/4', '1', '1', '1', '1', '25%']);
  expect(fila.getByRole('progressbar', { name: 'Porcentaje de Perez, Ana' })).toHaveAttribute('aria-valuenow', '25');
  const calendario = within(screen.getByRole('complementary', { name: 'Calendario de Perez, Ana' }));
  expect(calendario.getByRole('button', { name: `${fecha.slice(0, 7)}-03: Justificado` })).toBeInTheDocument();
  expect(calendario.getByRole('button', { name: `${fecha.slice(0, 7)}-04: Sin marcar` })).toBeInTheDocument();
  fireEvent.click(calendario.getByRole('button', { name: `${fecha.slice(0, 7)}-02: Ausente` }));
  expect(abrir).toHaveBeenCalledWith({ grupo: 'grupo-a', fecha: `${fecha.slice(0, 7)}-02` });
  fireEvent.click(tabla.getByRole('button', { name: 'Ver calendario de Rojas, Maria' }));
  expect(screen.getByRole('complementary', { name: 'Calendario de Rojas, Maria' })).toBeInTheDocument();
  expect(screen.queryByText('Asistencia menor al 75% este mes.')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Excel' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'PDF' })).toBeEnabled();
});

test('historial pagina alumnos y cambia el calendario al pasar a otra pagina', () => {
  const reporte = historialMensual();
  const base = reporte.grupos[0].alumnos[0];
  reporte.grupos[0].alumnos = Array.from({ length: 23 }, (_, index) => ({ ...base, alumno: `qa-${index}`, nombre: `Alumno ${String(index + 1).padStart(2, '0')}` }));
  render(<HistorialAsistencias reporte={reporte} mes={fecha.slice(0, 7)} onMes={jest.fn()} onAbrirLista={jest.fn()} abriendo={false} />);
  const tabla = within(screen.getByRole('table', { name: 'Resumen mensual de asistencia' }));
  expect(tabla.getAllByRole('row')).toHaveLength(11);
  expect(screen.getByText('1-10 de 23')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Pagina anterior' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Pagina siguiente' }));
  expect(screen.getByText('11-20 de 23')).toBeInTheDocument();
  expect(tabla.queryByRole('button', { name: 'Ver calendario de Alumno 01' })).not.toBeInTheDocument();
  expect(screen.getByRole('complementary', { name: 'Calendario de Alumno 11' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Pagina siguiente' }));
  expect(screen.getByText('21-23 de 23')).toBeInTheDocument();
  expect(tabla.getAllByRole('row')).toHaveLength(4);
  expect(screen.getByRole('button', { name: 'Pagina siguiente' })).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Buscar alumno' }), { target: { value: 'Alumno 02' } });
  expect(screen.getByText('1-1 de 1')).toBeInTheDocument();
  expect(screen.getByRole('complementary', { name: 'Calendario de Alumno 02' })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Buscar alumno' }), { target: { value: '' } });
  expect(screen.getByText('1-10 de 23')).toBeInTheDocument();
});

test('historial movil muestra todos los conteos sin tabla ancha y conserva calendario y paginacion', () => {
  useMediaQuery.mockReturnValue(true);
  const reporte = historialMensual();
  const base = reporte.grupos[0].alumnos[0];
  reporte.grupos[0].alumnos = Array.from({ length: 12 }, (_, index) => ({ ...base, alumno: `qa-${index}`, nombre: `Alumno ${String(index + 1).padStart(2, '0')}` }));
  render(<HistorialAsistencias reporte={reporte} mes={fecha.slice(0, 7)} onMes={jest.fn()} onAbrirLista={jest.fn()} abriendo={false} />);
  expect(screen.queryByRole('table')).not.toBeInTheDocument();
  const resumen = within(screen.getByRole('list', { name: 'Resumen mensual de asistencia' }));
  expect(resumen.getAllByRole('listitem')).toHaveLength(10);
  const alumno = within(resumen.getByRole('button', { name: 'Ver calendario de Alumno 01' }));
  expect(alumno.getByText('25%')).toBeInTheDocument();
  expect(alumno.getByText('1/4 sesiones')).toBeInTheDocument();
  for (const estado of ['Presentes', 'Ausentes', 'Justificados', 'Sin marcar']) expect(alumno.getByLabelText(`${estado}: 1`)).toBeInTheDocument();
  fireEvent.click(resumen.getByRole('button', { name: 'Ver calendario de Alumno 02' }));
  expect(screen.getByRole('complementary', { name: 'Calendario de Alumno 02' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Pagina siguiente' }));
  expect(screen.getByText('11-12 de 12')).toBeInTheDocument();
  expect(resumen.getAllByRole('listitem')).toHaveLength(2);
  expect(screen.getByRole('complementary', { name: 'Calendario de Alumno 11' })).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Buscar alumno' }), { target: { value: 'Alumno 02' } });
  expect(resumen.getAllByRole('listitem')).toHaveLength(1);
  expect(screen.getByText('1-1 de 1')).toBeInTheDocument();
});
test('historial cambia cantidad de filas y reinicia pagina al cambiar categoria', async () => {
  const reporte = historialMensual();
  const base = reporte.grupos[0].alumnos[0];
  reporte.grupos[0].alumnos = Array.from({ length: 32 }, (_, index) => ({ ...base, alumno: `qa-${index}`, nombre: `Alumno ${index + 1}`, categoria: index % 2 ? 'U15' : 'U13' }));
  render(<HistorialAsistencias reporte={reporte} mes={fecha.slice(0, 7)} onMes={jest.fn()} onAbrirLista={jest.fn()} abriendo={false} />);
  fireEvent.click(screen.getByRole('button', { name: 'Pagina siguiente' }));
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Filas:' }));
  fireEvent.click(await screen.findByRole('option', { name: '25', exact: true }));
  expect(screen.getByText('1-25 de 32')).toBeInTheDocument();
  expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(26);
  fireEvent.click(screen.getByRole('button', { name: 'Pagina siguiente' }));
  expect(screen.getByText('26-32 de 32')).toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Categoria' }));
  fireEvent.click(await screen.findByRole('option', { name: 'U15', exact: true }));
  expect(screen.getByText('1-16 de 16')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Pagina siguiente' })).toBeDisabled();
});

test('historial mantiene contraste en los tres filtros seleccionados y sin seleccionar', () => {
  render(<ThemeProvider theme={createTheme({ palette: { primary: { main: '#9c27b0' } } })}><HistorialAsistencias reporte={historialMensual()} mes={fecha.slice(0, 7)} onMes={jest.fn()} onAbrirLista={jest.fn()} abriendo={false} /></ThemeProvider>);
  const nombres = ['Todos', 'Menos de 75%', '3+ ausencias'];
  for (const seleccionado of nombres) {
    fireEvent.click(screen.getByRole('button', { name: seleccionado, exact: true }));
    for (const nombre of nombres) {
      const boton = screen.getByRole('button', { name: nombre, exact: true });
      expect(boton).toHaveAttribute('aria-pressed', String(nombre === seleccionado));
      expect(boton).toHaveStyle(nombre === seleccionado ? { color: '#fff', backgroundColor: '#4b5563' } : { color: '#4b5563', backgroundColor: '#fff' });
    }
  }
});
test('historial filtra baja asistencia, ausencias, categoria, nombre y grupo sin mezclar alumnos', async () => {
  render(<HistorialAsistencias reporte={historialMensual()} mes={fecha.slice(0, 7)} onMes={jest.fn()} onAbrirLista={jest.fn()} abriendo={false} />);
  const tabla = within(screen.getByRole('table', { name: 'Resumen mensual de asistencia' }));
  fireEvent.click(screen.getByRole('button', { name: 'Menos de 75%' }));
  expect(tabla.queryByRole('button', { name: 'Ver calendario de Rojas, Maria' })).not.toBeInTheDocument();
  expect(tabla.getByRole('button', { name: 'Ver calendario de Perez, Ana' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '3+ ausencias' }));
  expect(tabla.queryByRole('button', { name: 'Ver calendario de Perez, Ana' })).not.toBeInTheDocument();
  expect(tabla.getByRole('button', { name: 'Ver calendario de Diaz, Luis' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Todos' }));
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Categoria' }));
  fireEvent.click(await screen.findByRole('option', { name: 'U15' }));
  expect(tabla.getByRole('button', { name: 'Ver calendario de Rojas, Maria' })).toBeInTheDocument();
  expect(tabla.queryByRole('button', { name: 'Ver calendario de Perez, Ana' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Buscar alumno' }), { target: { value: 'nadie' } });
  expect(screen.getByText('No hay alumnos con estos filtros.')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Buscar alumno' }), { target: { value: '' } });
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Grupo' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Avanzado' }));
  expect(screen.getByRole('button', { name: 'Ver calendario de Soto, Leo' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Ver calendario de Rojas, Maria' })).not.toBeInTheDocument();
});

test('movil agrupa alumnos, inicia presentes y alterna estados al tocar el avatar', async () => {
  useMediaQuery.mockReturnValue(true);
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Pasar lista' }));
  const dialog = within(await screen.findByRole('dialog'));
  expect(dialog.getByRole('heading', { name: '¿Quién faltó?' })).toBeInTheDocument();
  expect(dialog.getByRole('region', { name: 'U13' })).toBeInTheDocument();
  expect(dialog.getByLabelText('2 de 2 presentes')).toBeInTheDocument();
  expect(dialog.queryByRole('combobox')).not.toBeInTheDocument();
  fireEvent.click(dialog.getByRole('button', { name: 'Perez, Ana: Presente' }));
  expect(dialog.getByLabelText('1 de 2 presentes')).toBeInTheDocument();
  fireEvent.click(dialog.getByRole('button', { name: 'Perez, Ana: Ausente' }));
  expect(dialog.getByRole('button', { name: 'Perez, Ana: Justificado' })).toBeInTheDocument();
  fireEvent.click(dialog.getByRole('button', { name: 'Guardar asistencia' }));
  expect(await screen.findByText('Asistencia guardada.')).toBeInTheDocument();
  const writes = global.fetch.mock.calls.filter(([, options]) => options.method === 'PUT');
  expect(JSON.parse(writes[0][1].body).registros).toEqual([
    { alumno: 'alumno-a', estado: 'justificado', observacion: '' },
    { alumno: 'alumno-b', estado: 'presente', observacion: '' }
  ]);
});

test('movil permite anotar observaciones sin mostrar formularios por alumno en la grilla', async () => {
  useMediaQuery.mockReturnValue(true);
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Pasar lista' }));
  const dialog = within(await screen.findByRole('dialog'));
  fireEvent.click(dialog.getByRole('button', { name: 'Observacion de Perez, Ana' }));
  const observacion = await screen.findByRole('textbox', { name: 'Observacion' });
  const nota = within(screen.getByRole('dialog', { name: 'Perez, Ana' }));
  expect(nota.getByText('U13')).toBeInTheDocument();
  expect(nota.getByText('0/300')).toBeInTheDocument();
  expect(observacion).toHaveAttribute('maxlength', '300');
  expect(nota.getByRole('button', { name: 'Listo' })).toHaveStyle({ width: '100%', minHeight: '44px', backgroundColor: '#374151', color: '#fff' });
  fireEvent.change(observacion, { target: { value: 'Reposo medico' } });
  expect(nota.getByText('13/300')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Listo' }));
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Observacion' })).not.toBeInTheDocument());
  fireEvent.click(dialog.getByRole('button', { name: 'Observacion de Perez, Ana' }));
  expect(await screen.findByRole('textbox', { name: 'Observacion' })).toHaveValue('Reposo medico');
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar observacion' }));
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Observacion' })).not.toBeInTheDocument());
  fireEvent.click(dialog.getByRole('button', { name: 'Guardar asistencia' }));
  expect(await screen.findByText('Asistencia guardada.')).toBeInTheDocument();
  const writes = global.fetch.mock.calls.filter(([, options]) => options.method === 'PUT');
  expect(JSON.parse(writes[0][1].body).registros[0].observacion).toBe('Reposo medico');
});

test('movil no cambia los estados de una lista guardada al abrirla', async () => {
  useMediaQuery.mockReturnValue(true);
  const implementation = global.fetch.getMockImplementation();
  global.fetch.mockImplementation(async (url, options) => {
    if (url.includes('/lista/')) return { ok: true, json: async () => ({ ...lista(), tomada: true, __v: 2, registros: lista().registros.map(item => ({ ...item, estado: 'ausente' })) }) };
    return implementation(url, options);
  });
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Pasar lista' }));
  const dialog = within(await screen.findByRole('dialog'));
  expect(dialog.getByRole('button', { name: 'Perez, Ana: Ausente' })).toBeInTheDocument();
  expect(dialog.getByRole('button', { name: 'Guardar asistencia' })).toBeDisabled();
});

test('confirmacion integrada permite seguir editando y conserva el borrador', async () => {
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Pasar lista' }));
  const dialog = within(await screen.findByRole('dialog'));
  fireEvent.change(dialog.getByRole('textbox', { name: 'Nota de Perez, Ana' }), { target: { value: 'Conservar esta nota' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Cancelar' }));
  const confirmacion = within(await screen.findByRole('alertdialog', { name: 'Cambios sin guardar' }));
  expect(confirmacion.getByText('La asistencia tiene cambios sin guardar. Si sales ahora, se perderán.')).toBeInTheDocument();
  fireEvent.click(confirmacion.getByRole('button', { name: 'Seguir editando' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  expect(dialog.getByRole('textbox', { name: 'Nota de Perez, Ana' })).toHaveValue('Conservar esta nota');
  expect(global.fetch.mock.calls.filter(([, options]) => options.method === 'PUT')).toHaveLength(0);
});

test('en movil descartar cierra la lista sin guardar asistencia', async () => {
  useMediaQuery.mockReturnValue(true);
  mount();
  fireEvent.click(await screen.findByRole('button', { name: 'Pasar lista' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cerrar lista' }));
  const confirmacion = within(await screen.findByRole('alertdialog'));
  fireEvent.click(confirmacion.getByRole('button', { name: 'Descartar cambios' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(global.fetch.mock.calls.filter(([, options]) => options.method === 'PUT')).toHaveLength(0);
});

test('Escape cancela la confirmacion sin descartar los cambios del grupo', async () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Configurar grupos' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Nuevo grupo' }));
  const dialog = within(await screen.findByRole('dialog'));
  fireEvent.change(dialog.getByRole('textbox', { name: /Nombre del grupo/ }), { target: { value: 'Grupo en borrador' } });
  fireEvent.click(dialog.getByRole('button', { name: 'Cancelar' }));
  const confirmacion = await screen.findByRole('alertdialog');
  expect(within(confirmacion).getByText('El grupo tiene cambios sin guardar. Si sales ahora, se perderán.')).toBeInTheDocument();
  fireEvent.keyDown(confirmacion, { key: 'Escape', code: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  expect(dialog.getByRole('textbox', { name: /Nombre del grupo/ })).toHaveValue('Grupo en borrador');
});