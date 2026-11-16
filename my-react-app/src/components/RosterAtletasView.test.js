import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RosterAtletasView from './RosterAtletasView';

jest.mock('../hooks/useTenantCategorias', () => ({
  __esModule: true,
  default: () => ({ categorias: [] }),
  combinarCategoriasTenant: () => []
}));

const fetchOriginal = global.fetch;

afterEach(() => { global.fetch = fetchOriginal; });

test('muestra la inactiva en convocatoria y permite quitarla sin ofrecer convocarla', async () => {
  const inactiva = { _id: 'inactiva', nombre_completo: 'Atleta inactiva', activo: false };
  const activa = { _id: 'activa', nombre_completo: 'Atleta activa', activo: true };
  global.fetch = jest.fn(async (url, options = {}) => {
    let data = [];
    if (options.method === 'PATCH') data = {};
    else if (url.includes('/eligible-students')) data = [inactiva, activa];
    else if (url.includes('/api/rosters?')) data = [{ _id: 'equipo', jugadores: ['inactiva'] }];
    else if (url.includes('/api/torneos/')) data = { nombre: 'Torneo', convocados: [] };
    return { ok: true, json: async () => data };
  });

  render(
    <MemoryRouter initialEntries={['/torneos/torneo/equipos/equipo/atletas']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/torneos/:torneoId/equipos/:rosterId/atletas" element={<RosterAtletasView />} />
      </Routes>
    </MemoryRouter>
  );

  await screen.findByText('Atleta inactiva');
  expect(screen.getByText('Inactivo')).toBeInTheDocument();
  expect(screen.getByText('Convocados · 1')).toBeInTheDocument();
  const disponibles = screen.getByText('Atletas disponibles').parentElement.parentElement.parentElement;
  expect(within(disponibles).queryByText('Atleta inactiva')).not.toBeInTheDocument();
  expect(within(disponibles).getByText('Atleta activa')).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining('incluirInactivosRoster=true'), expect.anything()
  );

  fireEvent.click(screen.getByRole('button', { name: 'Quitar', exact: true }));

  await waitFor(() => expect(screen.queryByText('Atleta inactiva')).not.toBeInTheDocument());
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/equipo/jugadores'), expect.objectContaining({
    method: 'PATCH',
    body: JSON.stringify({ jugadores: [] })
  }));
  expect(screen.getAllByRole('button', { name: 'Convocar', exact: true })).toHaveLength(1);
  expect(screen.getByText('Convocados · 0')).toBeInTheDocument();
});
