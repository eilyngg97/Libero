import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Notificaciones from './Notificaciones';

const originalFetch = global.fetch;
const data = {
  habilitadas: false, moneda: 'USD',
  resumen: { enviados: 0, entregados: 0, fallidos: 0, calculados: 1, elegibles_hoy: 0, bloqueados: 1 },
  avisos: [{ id: 'r1:antes', representante: 'Maria Perez', telefono: '584141234567',
    atletas: [{ nombre: 'Andrea Perez', saldo: 20 }], total: 20, tipo: 'antes', fecha: '2026-11-09',
    momento: 'futuro', bloqueos: ['Consentimiento de WhatsApp pendiente'] }],
  exclusiones: {}, historial: [], paginacion: { pagina: 1, por_pagina: 25, total: 0 }
};
beforeEach(() => {
  localStorage.setItem('token', 'test-token');
  localStorage.setItem('rol', 'admin');
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => data });
});
afterEach(() => {
  global.fetch = originalFetch;
  localStorage.clear();
});

test('admin ve un resumen simple e historial por defecto, con simulacion secundaria', async () => {
  render(<Notificaciones />);
  expect(await screen.findByText('Aún no hay envíos')).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Historial de envíos' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.queryByText('Maria Perez')).not.toBeInTheDocument();
  expect(screen.getByText('Enviados')).toBeInTheDocument();
  expect(screen.getByText('Entregados')).toBeInTheDocument();
  expect(screen.getByText('Con error')).toBeInTheDocument();
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^enviar/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ver simulación' }));
  expect(screen.getByText('Maria Perez')).toBeInTheDocument();
  expect(screen.getByText('Falta autorización')).toBeInTheDocument();
  expect(screen.queryByText('Consentimiento de WhatsApp pendiente')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ver detalle de Maria Perez' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText('Consentimiento de WhatsApp pendiente')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(global.fetch.mock.calls[0][0]).toMatch(/\/api\/notificaciones\?periodo=20\d{2}-\d{2}&pagina=1$/);
});

test('superadmin puede cambiar preferencia sin activar envio', async () => {
  localStorage.setItem('rol', 'super_admin');
  render(<Notificaciones />);
  fireEvent.click(await screen.findByRole('switch'));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/configuracion'),
    expect.objectContaining({ method: 'PATCH', body: '{"habilitadas":true}' })));
  expect(screen.getByText(/Guarda la preferencia/)).toBeInTheDocument();
});

test('muestra error de consulta, no tarjetas con falsos ceros', async () => {
  global.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'Consulta no disponible' }) });
  render(<Notificaciones />);
  expect(await screen.findByText('Consulta no disponible')).toBeInTheDocument();
  expect(screen.queryByText('Enviados')).not.toBeInTheDocument();
});

test('filtra el periodo sin crear pendientes', async () => {
  render(<Notificaciones />);
  await screen.findByText('Aún no hay envíos');
  fireEvent.change(screen.getByLabelText('Mes de mensualidades'), { target: { value: '2026-12' } });
  await waitFor(() => expect(global.fetch.mock.calls.some(([url]) => url.includes('periodo=2026-12'))).toBe(true));
  expect(global.fetch.mock.calls.every(([, options]) => !options.method)).toBe(true);
});

test('pagina la vista previa y vuelve a la primera pagina al actualizar', async () => {
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({
    ...data,
    avisos: Array.from({ length: 26 }, (_, index) => ({
      ...data.avisos[0], id: `r${index}`, representante: `Representante ${index}`
    }))
  }) });
  render(<Notificaciones />);
  await screen.findByText('Aún no hay envíos');
  fireEvent.click(screen.getByRole('tab', { name: 'Simulación' }));
  expect(screen.getByText('Representante 0')).toBeInTheDocument();
  expect(screen.queryByText('Representante 25')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Go to page 2' }));
  expect(screen.getByText('Representante 25')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
  expect(await screen.findByText('Maria Perez')).toBeInTheDocument();
});

test('permite buscar por atleta sin mostrar los motivos repetidos en la tabla', async () => {
  render(<Notificaciones />);
  await screen.findByText('Aún no hay envíos');
  fireEvent.click(screen.getByRole('tab', { name: 'Simulación' }));
  fireEvent.change(screen.getByLabelText('Buscar representante o atleta'), { target: { value: 'ándrea' } });
  expect(screen.getByText('Maria Perez')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Buscar representante o atleta'), { target: { value: 'otra persona' } });
  expect(screen.getByText('No encontramos coincidencias para tu búsqueda.')).toBeInTheDocument();
});

test('el historial diferencia mensajes aceptados de entregados y conserva los errores', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({
    ...data,
    historial: [
      { _id: 'n1', representante_nombre: 'Representante 1', tipo: 'antes', createdAt: '2026-11-09T12:00:00Z', estado: 'aceptado' },
      { _id: 'n2', representante_nombre: 'Representante 2', tipo: 'despues', createdAt: '2026-11-13T12:00:00Z', estado: 'entregado' },
      { _id: 'n3', representante_nombre: 'Representante 3', tipo: 'antes', createdAt: '2026-11-09T12:00:00Z', estado: 'fallido', error: 'Numero no disponible' }
    ]
  }) });
  render(<Notificaciones />);
  expect(await screen.findByText('Enviado · entrega pendiente')).toBeInTheDocument();
  expect(screen.getByText('Entregado')).toBeInTheDocument();
  expect(screen.getByText('Numero no disponible')).toBeInTheDocument();
});
