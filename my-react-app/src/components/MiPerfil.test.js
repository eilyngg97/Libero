import { render, screen, waitFor } from '@testing-library/react';
import MiPerfil from './MiPerfil';

const originalFetch = global.fetch;
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('token', 'qa-token');
  localStorage.setItem('usuario', JSON.stringify({ rol: 'admin', nombre: 'QA' }));
});
afterEach(() => { global.fetch = originalFetch; localStorage.clear(); });

test.each([25, 0])('usa los datos privados compartidos de plan y pago con costo %s', async (cost) => {
  global.fetch = jest.fn(async (url) => ({ ok: true, json: async () => url.endsWith('/api/tenant/suscripcion') ? {
    plan: 'Plan QA', costo_mensual_usd: cost, total_alumnos_activos: 212, datos_pago: { banco: 'Banco QA', cedula: '12345', telefono: '04001234567' }, contacto: { whatsapp: '584001234567', email: 'qa@example.com' }
  } : [] }));
  render(<MiPerfil />);
  expect(await screen.findByText('Plan QA')).toBeInTheDocument();
  expect(screen.getByText(new RegExp(`${cost},00 USD / mes`))).toBeInTheDocument();
  expect(screen.getByText('Banco QA')).toBeInTheDocument();
  expect(screen.getByText('212')).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('link', { name: /WhatsApp soporte/ })).toHaveAttribute('href', 'https://wa.me/584001234567');
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/tenant/suscripcion'), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer qa-token' }) }));
});

test('sin datos no inventa el precio y muestra el error de consulta', async () => {
  global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }));
  render(<MiPerfil />);
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar los datos de plan'));
  expect(screen.queryByText(/49.99/)).not.toBeInTheDocument();
});

test.each([
  [0, 'Plan Inicial', 20], [51, 'Plan Crecimiento', 35],
  [101, 'Plan Profesional', 50], [212, 'Plan Elite', 70]
])('muestra el plan y el mismo conteo de %i activos recibido del servidor', async (total, plan, cost) => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({
    plan, costo_mensual_usd: cost, total_alumnos_activos: total
  }) }));
  render(<MiPerfil />);
  expect(await screen.findByText(plan)).toBeInTheDocument();
  expect(screen.getByText(String(total))).toBeInTheDocument();
  expect(screen.getByText(new RegExp(`${cost},00 USD / mes`))).toBeInTheDocument();
});

test('no muestra el plan de un backend que no devuelve el conteo automatico', async () => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ plan: 'Plan antiguo', costo_mensual_usd: 40 }) }));
  render(<MiPerfil />);
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar los datos de plan'));
  expect(screen.queryByText('Plan antiguo')).not.toBeInTheDocument();
});