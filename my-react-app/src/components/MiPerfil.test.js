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
    plan: 'Plan QA', costo_mensual_usd: cost, datos_pago: { banco: 'Banco QA', cedula: '12345', telefono: '04001234567' }, contacto: { whatsapp: '584001234567', email: 'qa@example.com' }
  } : [] }));
  render(<MiPerfil />);
  expect(await screen.findByText('Plan QA')).toBeInTheDocument();
  expect(screen.getByText(new RegExp(`${cost},00 USD / mes`))).toBeInTheDocument();
  expect(screen.getByText('Banco QA')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /WhatsApp soporte/ })).toHaveAttribute('href', 'https://wa.me/584001234567');
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/tenant/suscripcion'), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer qa-token' }) }));
});

test('sin datos no inventa el precio y muestra el error de consulta', async () => {
  global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }));
  render(<MiPerfil />);
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar los datos de plan'));
  expect(screen.queryByText(/49.99/)).not.toBeInTheDocument();
});