import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DashboardEntrenador from './DashboardEntrenador';
import Header from './Header';

const originalFetch = global.fetch;
const user = { id: 'user-a', nombre: 'Ana Coach', rol: 'entrenador', rolActivo: 'entrenador', roles: ['entrenador', 'usuario'], permisos: [] };
const payload = {
  entrenador: { _id: 'coach-a', nombre: 'Ana', apellido: 'Coach', cedula: '12345678', especialidad: 'Voleibol', estado: 'activo', pago_config: { monto_base_usd: 200, frecuencia_pago: 'mensual' }, pagos_nomina: [{ _id: 'pago-a', fecha_pago: '2026-10-10', periodo: 'Octubre 2026', monto_total_usd: 200, monto_total_ves: 20000, referencia: 'REF-123', metodo_pago: 'transferencia' }] },
  grupos: [{ _id: 'grupo-a', nombre: 'U13 tarde', sede: 'sede-a', dias: [1, 3], hora_inicio: '16:00', hora_fin: '17:30', categorias: ['U13'] }],
  sedes: [{ _id: 'sede-a', nombre: 'Sede Centro' }], formatos: [{ value: 'personalizado_laboral', label: 'Constancia laboral' }]
};
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('token', 'trainer-token');
  localStorage.setItem('rolActivo', 'entrenador');
  localStorage.setItem('usuario', JSON.stringify(user));
  global.fetch = jest.fn(async url => {
    if (url.includes('/asistencias/sesiones')) return { ok: true, json: async () => ({ sesiones: [], hoy: '2026-11-08' }) };
    if (url.includes('/asistencias/grupos')) return { ok: true, json: async () => ({ grupos: payload.grupos, categorias: ['U13'], entrenadores: [] }) };
    return { ok: true, json: async () => payload };
  });
});
afterEach(() => { global.fetch = originalFetch; localStorage.clear(); });
const mount = vista => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }} initialEntries={[`/dashboard-entrenador${vista ? `?vista=${vista}` : ''}`]}><DashboardEntrenador /></MemoryRouter>);

test('muestra el perfil y horarios propios consultando la API autenticada', async () => {
  mount();
  expect(await screen.findByRole('heading', { name: 'Ana Coach' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Mis grupos y horarios', exact: true }));
  expect(screen.queryByRole('heading', { name: 'Ana Coach' })).not.toBeInTheDocument();
  expect(screen.getByText('U13 tarde')).toBeInTheDocument();
  expect(screen.getByText('16:00 - 17:30')).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/entrenador'), expect.objectContaining({ headers: { Authorization: 'Bearer trainer-token' } }));
  fireEvent.click(screen.getByRole('button', { name: 'Volver al dashboard' }));
  fireEvent.click(screen.getByRole('button', { name: 'Mi informacion', exact: true }));
  expect(screen.getByText('12345678')).toBeInTheDocument();
});
test('las asistencias usan la API propia y no permiten configurar grupos', async () => {
  mount('asistencias');
  expect(await screen.findByText('No hay sesiones programadas para esta fecha.')).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/entrenador/asistencias/sesiones'), expect.any(Object));
  expect(screen.queryByRole('button', { name: 'Configurar grupos' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Grupos de entrenamiento' }));
  expect(await screen.findByText('U13 tarde')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Nuevo grupo' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar U13 tarde' })).not.toBeInTheDocument();
});
test('muestra y filtra el historial propio de honorarios sin controles administrativos', async () => {
  mount('honorarios');
  expect(await screen.findByText('Octubre 2026')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Periodo o referencia'), { target: { value: 'otro' } });
  expect(screen.getByText(/No hay pagos registrados que coincidan/)).toBeInTheDocument();
  expect(screen.queryByText('Registrar pago')).not.toBeInTheDocument();
});
test('informa un fallo de consulta y permite reintentar sin datos de ejemplo', async () => {
  global.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Perfil inactivo' }) });
  mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('Perfil inactivo');
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Mis grupos y horarios', exact: true }));
  expect(await screen.findByText('U13 tarde')).toBeInTheDocument();
});
test('sin grupos ni formatos muestra estados vacios', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ...payload, grupos: [], formatos: [] }) });
  mount('grupos');
  expect(await screen.findByText('No tienes grupos asignados.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Volver al dashboard' }));
  fireEvent.click(screen.getByRole('button', { name: 'Constancias', exact: true }));
  expect(screen.getByText(/No hay formatos de constancias habilitados/)).toBeInTheDocument();
});
test('el dashboard ofrece cinco tarjetas de colores y permite abrir y volver de cada modulo', async () => {
  mount();
  expect(await screen.findByRole('navigation', { name: 'Opciones del entrenador' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Actualizar mi perfil' })).not.toBeInTheDocument();
  expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  const opciones = [
    ['Mis grupos y horarios', /U13 tarde/, '#16c1de', '#0f8aa7'],
    ['Asistencias', /No hay sesiones programadas/, '#302b73', '#201d58'],
    ['Honorarios y pagos', /Octubre 2026/, '#ff8a00', '#ff6a00'],
    ['Mi informacion', /12345678/, '#2563eb', '#1d4ed8'],
    ['Constancias', /Generar constancia/, '#7b5cff', '#5a34d6']
  ];
  for (const [label, contenido, inicio, fin] of opciones) {
    const tarjeta = screen.getByRole('button', { name: label, exact: true });
    expect(tarjeta).toHaveStyle({ background: `linear-gradient(135deg, ${inicio} 0%, ${fin} 100%)` });
    fireEvent.click(tarjeta);
    expect(await screen.findByText(contenido)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ana Coach' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Opciones del entrenador' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Volver al dashboard' }));
    expect(screen.getByRole('navigation', { name: 'Opciones del entrenador' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ana Coach' })).toBeInTheDocument();
  }
});
test('agrupa la informacion personal y profesional y conserva los enlaces de documentos propios', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ...payload, entrenador: { ...payload.entrenador, correo: 'entrenadora.con.correo.largo@example.test', contratos: ['/uploads/contratos/propio.pdf'], certificaciones: ['/uploads/certificaciones/propia.pdf'] } }) });
  mount('informacion');
  expect(await screen.findByRole('heading', { name: 'Datos personales' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Perfil profesional' })).toBeInTheDocument();
  expect(screen.getByText('entrenadora.con.correo.largo@example.test')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Contrato 1' })).toHaveAttribute('href', expect.stringContaining('/uploads/contratos/propio.pdf'));
  expect(screen.getByRole('link', { name: 'Certificacion 1' })).toHaveAttribute('href', expect.stringContaining('/uploads/certificaciones/propia.pdf'));
  expect(screen.getByRole('link', { name: 'Contrato 1' })).toHaveAttribute('rel', 'noopener noreferrer');
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Actualizar mi perfil' })).not.toBeInTheDocument();
});
test('el formulario de constancias conserva el estilo del formulario de representantes', async () => {
  mount('constancias');
  const region = await screen.findByRole('region', { name: 'Generar constancia' });
  expect(region).toHaveStyle({ borderRadius: '16px', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)' });
  expect(screen.getByTestId('VerifiedUserIcon')).toBeInTheDocument();
  expect(screen.getByRole('form', { name: 'Generar constancia' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Generar PDF' })).toHaveStyle({ borderRadius: '8px', fontWeight: 700 });
  expect(screen.getByRole('button', { name: 'Volver al dashboard' })).toHaveStyle({ fontSize: '16px', paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px', paddingLeft: '0px', marginBottom: '10px' });
});
test('previsualiza una constancia propia y conserva el PDF para descargar hasta salir', async () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = jest.fn(() => 'blob:constancia');
  URL.revokeObjectURL = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  try {
    const { unmount } = mount('constancias');
    const button = await screen.findByRole('button', { name: 'Generar PDF' });
    global.fetch.mockResolvedValueOnce({ ok: true, headers: { get: () => 'application/pdf' }, blob: async () => new Blob(['%PDF-1.4']) });
    fireEvent.click(button);
    const download = await screen.findByRole('link', { name: 'Descargar constancia' });
    expect(download).toHaveAttribute('href', 'blob:constancia');
    expect(download).toHaveAttribute('download', expect.stringContaining('constancia-entrenador-'));
    expect(screen.getByTitle('Vista previa')).toHaveAttribute('src', 'blob:constancia#navpanes=0&toolbar=0');
    expect(click).not.toHaveBeenCalled();
    const options = global.fetch.mock.calls[global.fetch.mock.calls.length - 1][1];
    expect(JSON.parse(options.body)).toEqual({ tipo: 'personalizado_laboral', fechaEmision: expect.any(String) });
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:constancia');
  } finally { click.mockRestore(); URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; }
});
test('regenerar reemplaza la previsualizacion y libera el documento anterior', async () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = jest.fn().mockReturnValueOnce('blob:primero').mockReturnValueOnce('blob:segundo');
  URL.revokeObjectURL = jest.fn();
  try {
    mount('constancias');
    const button = await screen.findByRole('button', { name: 'Generar PDF' });
    global.fetch.mockResolvedValue({ ok: true, headers: { get: () => 'application/pdf' }, blob: async () => new Blob(['%PDF-1.4']) });
    fireEvent.click(button);
    expect(await screen.findByRole('link', { name: 'Descargar constancia' })).toHaveAttribute('href', 'blob:primero');
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole('link', { name: 'Descargar constancia' })).toHaveAttribute('href', 'blob:segundo'));
    expect(screen.getByTitle('Vista previa')).toHaveAttribute('src', 'blob:segundo#navpanes=0&toolbar=0');
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:primero');
    fireEvent.click(screen.getByRole('button', { name: 'Volver al dashboard' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:segundo');
    expect(screen.queryByTitle('Vista previa')).not.toBeInTheDocument();
  } finally { URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; }
});
test('pide los datos del evento antes de descargar una constancia de asistencia sin enviar identidades', async () => {
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ...payload, formatos: [{ value: 'asistencia', label: 'Constancia de asistencia', requisitos: { asistencia: true } }] }) });
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = jest.fn(() => 'blob:asistencia');
  URL.revokeObjectURL = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  try {
    mount('constancias');
    const button = await screen.findByRole('button', { name: 'Generar PDF' });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/^Fecha del evento/), { target: { value: '2026-11-08' } });
    fireEvent.change(screen.getByLabelText(/^Hora desde/), { target: { value: '16:00' } });
    fireEvent.change(screen.getByLabelText(/^Hora hasta/), { target: { value: '18:00' } });
    fireEvent.change(screen.getByLabelText('Motivo del evento'), { target: { value: 'Entrenamiento' } });
    expect(button).toBeEnabled();
    global.fetch.mockResolvedValueOnce({ ok: true, headers: { get: () => 'application/pdf' }, blob: async () => new Blob(['%PDF-1.4']) });
    fireEvent.click(button);
    expect(await screen.findByRole('link', { name: 'Descargar constancia' })).toHaveAttribute('href', 'blob:asistencia');
    const requestOptions = global.fetch.mock.calls[global.fetch.mock.calls.length - 1][1];
    expect(JSON.parse(requestOptions.body)).toEqual({ tipo: 'asistencia', fechaEmision: expect.any(String), eventoFecha: '2026-11-08', eventoHoraDesde: '16:00', eventoHoraHasta: '18:00', eventoMotivo: 'Entrenamiento', asistenciaTiempo: 'pasado' });
    fireEvent.click(screen.getByRole('button', { name: 'Volver al dashboard' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:asistencia');
  } finally { click.mockRestore(); URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; }
});
test('el formato con horario exige dias y horas y no envia datos del evento', async () => {
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ...payload, formatos: [{ value: 'personalizado_horario', label: 'Horario propio', requisitos: { horario: true } }] }) });
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  URL.createObjectURL = jest.fn(() => 'blob:horario');
  URL.revokeObjectURL = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  try {
    mount('constancias');
    const button = await screen.findByRole('button', { name: 'Generar PDF' });
    expect(button).toBeDisabled();
    expect(screen.queryByLabelText(/^Fecha del evento/)).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /^Dias de entrenamiento/ }));
    fireEvent.click(screen.getByRole('option', { name: 'Lunes', exact: true }));
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'Escape' });
    fireEvent.change(screen.getByLabelText(/^Hora de inicio/), { target: { value: '16:00' } });
    fireEvent.change(screen.getByLabelText(/^Hora de fin/), { target: { value: '18:00' } });
    expect(button).toBeEnabled();
    global.fetch.mockResolvedValueOnce({ ok: true, headers: { get: () => 'application/pdf' }, blob: async () => new Blob(['%PDF-1.4']) });
    fireEvent.click(button);
    expect(await screen.findByRole('link', { name: 'Descargar constancia' })).toHaveAttribute('href', 'blob:horario');
    const requestOptions = global.fetch.mock.calls[global.fetch.mock.calls.length - 1][1];
    expect(JSON.parse(requestOptions.body)).toEqual({ tipo: 'personalizado_horario', fechaEmision: expect.any(String), diasEntrenamiento: ['Lunes'], horaInicio: '16:00', horaFin: '18:00' });
    fireEvent.click(screen.getByRole('button', { name: 'Volver al dashboard' }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:horario');
  } finally { click.mockRestore(); URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke; }
});
test('la cuenta permite volver al selector sin cerrar sesion', async () => {
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/" element={<Header />} /><Route path="/seleccionar-perfil" element={<div>Selector de perfiles</div>} /></Routes></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Menu de cuenta' }));
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Cambiar perfil' }));
  expect(await screen.findByText('Selector de perfiles')).toBeInTheDocument();
  expect(localStorage.getItem('token')).toBe('trainer-token');
});