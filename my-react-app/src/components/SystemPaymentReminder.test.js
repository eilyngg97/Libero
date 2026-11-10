import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import SystemPaymentReminder from './SystemPaymentReminder';
import Login from './Login';
import { startSystemReminderSession, getSubscriptionDueStatus, formatSubscriptionDate } from '../utils/systemSubscription';

const originalFetch = global.fetch;
const payload = { tenantId: 'alfa', plan: 'Pro QA', costo_mensual_usd: 25, recordatorio_pago_activo: true, datos_pago: { banco: 'Banco QA', cedula: '12345', telefono: '04001234567' }, contacto: { whatsapp: '584001234567', email: 'qa@example.com' } };
const renderReminder = () => render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/" element={<SystemPaymentReminder />} /><Route path="/mi-perfil" element={<div>Perfil de la academia</div>} /></Routes></MemoryRouter>);

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem('token', 'qa-token');
  localStorage.setItem('tenantId', 'alfa');
  localStorage.setItem('usuario', JSON.stringify({ rol: 'admin' }));
  startSystemReminderSession('alfa');
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => payload }));
});
afterEach(() => { global.fetch = originalFetch; localStorage.clear(); sessionStorage.clear(); });

test.each(['admin', 'super_admin'])('muestra plan, monto y pago al iniciar sesion como %s', async (rol) => {
  localStorage.setItem('usuario', JSON.stringify({ rol }));
  renderReminder();
  expect(await screen.findByRole('dialog', { name: 'Recordatorio de pago' })).toHaveTextContent('Pro QA');
  expect(screen.getByLabelText('25,00 USD / mes')).toBeInTheDocument();
  expect(screen.getByText('Banco QA')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'APEX' })).toHaveAttribute('src', `${process.env.PUBLIC_URL || ''}/logo_apex.png`);
  expect(screen.queryByRole('link', { name: 'Correo de soporte' })).not.toBeInTheDocument();
  expect(screen.queryByText('qa@example.com')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Enviar comprobante por WhatsApp' })).toHaveAttribute('href', 'https://wa.me/584001234567');
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/tenant/suscripcion'), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer qa-token' }) }));
});

test.each(['usuario', 'entrenador', 'staff'])('no consulta ni muestra el aviso para %s', (rol) => {
  localStorage.setItem('usuario', JSON.stringify({ rol }));
  renderReminder();
  expect(global.fetch).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test.each([false, 'true', undefined])('no muestra el aviso con interruptor %s', async (enabled) => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ...payload, recordatorio_pago_activo: enabled }) });
  renderReminder();
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('no repite al volver o recargar y reaparece en un nuevo login', async () => {
  const { unmount } = renderReminder();
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar recordatorio' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  unmount();
  const { unmount: unmountSecond } = renderReminder();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  unmountSecond();
  startSystemReminderSession('alfa');
  renderReminder();
  await screen.findByRole('dialog');
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test('no consulta sin un login nuevo ni con marca de otro tenant', () => {
  sessionStorage.removeItem('apex-system-reminder-session');
  const { unmount } = renderReminder();
  expect(global.fetch).not.toHaveBeenCalled();
  unmount();
  startSystemReminderSession('beta');
  renderReminder();
  expect(global.fetch).not.toHaveBeenCalled();
});

test('no muestra respuestas de otro tenant ni errores', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ...payload, tenantId: 'beta' }) });
  const { unmount } = renderReminder();
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  unmount();
  global.fetch.mockResolvedValue({ ok: false, json: async () => ({}) });
  renderReminder();
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('ignora respuestas despues de desmontar sin consumir la sesion', async () => {
  let resolve;
  global.fetch.mockImplementation(() => new Promise((done) => { resolve = done; }));
  const view = renderReminder();
  view.unmount();
  await act(async () => resolve({ ok: true, json: async () => payload }));
  expect(sessionStorage.getItem('apex-system-reminder-seen')).toBe(null);
});

test('el boton de perfil abre facturacion y conserva el interruptor del servidor', async () => {
  renderReminder();
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button', { name: 'Ver perfil de facturación' }));
  expect(await screen.findByText('Perfil de la academia')).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('el importe cero se conserva', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ...payload, costo_mensual_usd: 0 }) });
  renderReminder();
  expect(await screen.findByLabelText('0,00 USD / mes')).toBeInTheDocument();
});

test('copia los datos de pago y confirma visualmente', async () => {
  const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const writeText = jest.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  try {
    renderReminder();
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: 'Copiar banco' }));
    expect(await screen.findByText('Banco copiado')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith('Banco QA');
    fireEvent.click(screen.getByRole('button', { name: 'Copiar cédula' }));
    expect(await screen.findByText('Cédula copiada')).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith('12345');
  } finally {
    if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
    else delete navigator.clipboard;
  }
});

test('informa si no se puede copiar sin confirmar un exito falso', async () => {
  renderReminder();
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button', { name: 'Copiar teléfono' }));
  expect(await screen.findByRole('status')).toHaveTextContent('No se pudo copiar');
  expect(screen.queryByText('Teléfono copiado')).not.toBeInTheDocument();
});

test.each([
  ['2026-11-11', 'Vence en 5 días'],
  ['2026-11-07', 'Vence en 1 día'],
  ['2026-11-06', 'Vence hoy'],
  ['2026-11-05', 'Venció hace 1 día'],
  ['2026-11-01', 'Venció hace 5 días'],
  ['2026-11-07T00:00:00Z', 'Vence en 1 día']
])('calcula el vencimiento real de %s en Caracas', (date, label) => {
  expect(getSubscriptionDueStatus(date, new Date('2026-11-06T16:00:00Z')).label).toBe(label);
});

test('no inventa vencimiento si falta la fecha o es invalida', () => {
  expect(getSubscriptionDueStatus('')).toBe(null);
  expect(getSubscriptionDueStatus('fecha-invalida')).toBe(null);
});

test('un login real del formulario crea una nueva sesion y abre el recordatorio', async () => {
  sessionStorage.clear();
  global.fetch.mockImplementation(async (url) => ({ ok: true, json: async () => {
    if (url.endsWith('/api/auth/login')) return { tenantId: 'alfa', token: 'new-qa-token', user: { rol: 'admin', nombre: 'Admin QA' } };
    if (url.endsWith('/api/tenant/context')) return { tenantId: 'alfa', branding: { displayName: 'Alfa' } };
    return payload;
  } }));
  render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes><Route path="/" element={<Login />} /><Route path="/dashboard" element={<SystemPaymentReminder />} /></Routes></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Cédula'), { target: { value: 'qa-admin' } });
  fireEvent.change(screen.getByPlaceholderText('********'), { target: { value: 'qa-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  expect(await screen.findByRole('dialog')).toHaveTextContent('Pro QA');
  expect(JSON.parse(sessionStorage.getItem('apex-system-reminder-session')).tenantId).toBe('alfa');
});

test('un login rechazado no crea la marca de sesion', async () => {
  sessionStorage.clear();
  global.fetch.mockImplementation(async (url) => ({ ok: !url.endsWith('/api/auth/login'), json: async () => ({ msg: 'Credenciales inválidas' }) }));
  render(<MemoryRouter><Login /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Cédula'), { target: { value: 'qa-admin' } });
  fireEvent.change(screen.getByPlaceholderText('********'), { target: { value: 'qa-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales inválidas');
  expect(sessionStorage.getItem('apex-system-reminder-session')).toBe(null);
});

test('la fecha mostrada coincide con el calendario usado para el vencimiento', () => {
  expect(formatSubscriptionDate('2026-11-07T00:00:00Z')).toBe('7/11/2026');
  expect(formatSubscriptionDate('2026-11-07')).toBe('7/11/2026');
  expect(getSubscriptionDueStatus('2026-11-07T00:00:00.000Z', new Date('2026-11-07T16:00:00Z')).label).toBe('Vence hoy');
  expect(getSubscriptionDueStatus('2026-11-07T00:00:00.000Z', new Date('2026-11-07T02:00:00Z')).label).toBe('Vence en 1 día');
  expect(getSubscriptionDueStatus('2026-11-07T00:00:00.000Z', new Date('2026-11-08T16:00:00Z')).label).toBe('Venció hace 1 día');
});

test('muestra el dia guardado en Mongo sin desplazar la fecha de proximo pago', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ...payload, proximo_pago: '2026-11-07T00:00:00.000Z' }) });
  renderReminder();
  expect(await screen.findByText('7/11/2026')).toBeInTheDocument();
  expect(screen.queryByText('6/11/2026')).not.toBeInTheDocument();
});