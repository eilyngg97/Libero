import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Constancias from './Constancias';

test('incluye los formatos del tenant en el selector de emision junto a los predeterminados', async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn(async (url) => ({
    ok: true,
    json: async () => url.endsWith('/api/constancias/entrenadores')
      ? []
      : [{ value: 'personalizado_equipo', label: 'Constancias del equipo' }]
  }));
  localStorage.setItem('rol', 'admin');
  try {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Constancias />
      </MemoryRouter>
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/constancias/formatos-personalizados'),
      expect.any(Object)
    ));
    fireEvent.mouseDown(screen.getByLabelText('Tipo de constancia'));
    const customOption = await screen.findByRole('option', { name: 'Constancias del equipo' });
    expect(screen.getAllByRole('option')).toHaveLength(6);
    fireEvent.click(customOption);
    expect(screen.getByRole('combobox', { name: 'Tipo de constancia' })).toHaveTextContent('Constancias del equipo');
  } finally {
    global.fetch = originalFetch;
    localStorage.clear();
  }
});

test('selecciona un entrenador y genera un formato personalizado sin exigir alumno', async () => {
  const originalFetch = global.fetch;
  const originalCreateObjectURL = URL.createObjectURL;
  const entrenador = { _id: '507f1f77bcf86cd799439022', nombre: 'Luis', apellido: 'Gomez', cedula: '12345678' };
  global.fetch = jest.fn(async (url, options = {}) => {
    if (options.method === 'POST') return { ok: true, blob: async () => new Blob(['%PDF']) };
    return {
      ok: true,
      json: async () => url.endsWith('/api/constancias/entrenadores') ? [entrenador] : [{
        value: 'personalizado_equipo', label: 'Constancias del equipo',
        requisitos: { alumno: false, entrenador: true, horario: false, asistencia: false }
      }]
    };
  });
  URL.createObjectURL = jest.fn(() => 'blob:constancia-prueba');
  localStorage.setItem('rol', 'admin');
  try {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Constancias />
      </MemoryRouter>
    );
    fireEvent.mouseDown(screen.getByLabelText('Tipo de constancia'));
    fireEvent.click(await screen.findByRole('option', { name: 'Constancias del equipo' }));
    expect(screen.getByRole('button', { name: 'Generar PDF' })).toBeDisabled();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /Seleccionar entrenador/ }));
    fireEvent.click(await screen.findByRole('option', { name: /Luis Gomez/ }));
    expect(screen.getByRole('combobox', { name: /Buscar alumno/ })).not.toBeRequired();
    const generar = screen.getByRole('button', { name: 'Generar PDF' });
    expect(generar).toBeEnabled();
    fireEvent.click(generar);
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/constancias$/),
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining(`"entrenadorId":"${entrenador._id}"`)
      })
    ));
    const post = global.fetch.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(JSON.parse(post[1].body)).toMatchObject({ alumnoId: '', entrenadorId: entrenador._id, tipo: 'personalizado_equipo' });
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
  } finally {
    global.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL;
    localStorage.clear();
  }
}, 15000);

test('habilita campos de horario y asistencia segun las variables del formato personalizado', async () => {
  const originalFetch = global.fetch;
  global.fetch = jest.fn(async (url) => ({
    ok: true,
    json: async () => url.endsWith('/api/constancias/entrenadores') ? [] : [{
      value: 'personalizado_equipo', label: 'Constancias del equipo',
      requisitos: { alumno: true, entrenador: false, horario: true, asistencia: true }
    }]
  }));
  localStorage.setItem('rol', 'admin');
  try {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Constancias />
      </MemoryRouter>
    );
    fireEvent.mouseDown(screen.getByLabelText('Tipo de constancia'));
    fireEvent.click(await screen.findByRole('option', { name: 'Constancias del equipo' }));
    expect(screen.getByRole('combobox', { name: 'Dias de entrenamiento' })).toBeVisible();
    expect(screen.getByLabelText('Hora de inicio')).toBeVisible();
    expect(screen.getByLabelText('Motivo del evento')).toBeVisible();
    expect(screen.getByRole('combobox', { name: /Buscar alumno/ })).toBeRequired();
    expect(screen.getByRole('button', { name: 'Generar PDF' })).toBeDisabled();
  } finally {
    global.fetch = originalFetch;
    localStorage.clear();
  }
}, 15000);
