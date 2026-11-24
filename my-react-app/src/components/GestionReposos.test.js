import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import GestionReposos from './GestionReposos';

test('al cambiar un reposo activo a indefinido limpia la fecha final y la envia vacia', async () => {
  const originalFetch = global.fetch;
  const reposo = {
    _id: 'r1', tipo: 'Parcial', modalidad_cobro_parcial: 'Normal', estado: 'Activo',
    fecha_inicio: '2026-11-10T12:00:00Z', fecha_fin: '2026-11-20T12:00:00Z'
  };
  global.fetch = jest.fn(async (url, options = {}) => ({
    ok: true,
    json: async () => options.method === 'PATCH'
      ? { message: 'Reposo actualizado' }
      : url.endsWith('/reposos')
        ? [reposo]
        : { nombres: 'QA', apellidos: 'Reposo', sede: { nombre: 'Centro', costo: 20 } }
  }));
  try {
    render(
      <MemoryRouter initialEntries={['/alumnos/a1/reposos']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/alumnos/:id/reposos" element={<GestionReposos />} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click((await screen.findByTestId('EditIcon')).closest('button'));
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByLabelText('Fecha Fin')).toHaveValue('2026-11-20');
    fireEvent.mouseDown(dialog.getByLabelText('Tipo de Reposo'));
    fireEvent.click(await screen.findByRole('option', { name: 'Tiempo indefinido' }));
    expect(dialog.getByLabelText('Fecha Fin')).toHaveValue('');
    expect(dialog.getByLabelText('Fecha Fin')).toBeDisabled();
    fireEvent.click(dialog.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/alumnos/a1/reposos/r1'),
      expect.objectContaining({ method: 'PATCH' })
    ));
    const [, options] = global.fetch.mock.calls.find(([, request]) => request?.method === 'PATCH');
    expect(options.body.get('tipo')).toBe('Indefinido');
    expect(options.body.get('fecha_fin')).toBe('');
    await screen.findByText('Reposo actualizado correctamente.');
  } finally {
    global.fetch = originalFetch;
  }
});
