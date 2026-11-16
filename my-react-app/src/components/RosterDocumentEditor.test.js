import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RosterDocumentEditor from './RosterDocumentEditor';

jest.mock('../hooks/useTenantCategorias', () => ({
  __esModule: true,
  default: () => ({ categorias: [] }),
  combinarCategoriasTenant: () => []
}));

const fetchOriginal = global.fetch;
const resizeObserverOriginal = global.ResizeObserver;

beforeEach(() => {
  global.ResizeObserver = jest.fn(() => ({ observe: jest.fn(), disconnect: jest.fn() }));
});

afterEach(() => {
  global.fetch = fetchOriginal;
  global.ResizeObserver = resizeObserverOriginal;
});

function renderEditor(jugadores, prestamos = []) {
  global.fetch = jest.fn(async (url, options = {}) => {
    const data = url.includes('/entrenadores')
      ? []
      : options.method === 'PATCH'
        ? { documento: { campos: {}, logos: [] } }
        : { roster: { jugadores, prestamos, documento: { campos: {}, logos: [] } }, template: {} };
    return { ok: true, json: async () => data };
  });
  return render(
    <MemoryRouter initialEntries={['/torneos/torneo/equipos/equipo/documento']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/torneos/:torneoId/equipos/:rosterId/documento" element={<RosterDocumentEditor />} />
        <Route path="/torneos/:torneoId/equipos/:rosterId/atletas" element={<h1>Convocatoria del equipo</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

test.each([
  [{ activo: false }],
  [{ activo: true, dado_de_baja: true }]
])('advierte al abrir y mantiene el aviso al guardar para una atleta inactiva: %j', async (estado) => {
  renderEditor([{ _id: 'inactiva', nombres: 'Ana', apellidos: 'Perez', ...estado }]);

  const warning = await screen.findByRole('alert');
  expect(within(warning).getByText('Este roster contiene 1 atleta inactiva.')).toBeInTheDocument();
  expect(warning).toHaveTextContent('Ana Perez');
  expect(warning).toHaveTextContent('Si guardas o descargas el documento, estas atletas seguirán incluidas.');
  expect(screen.getByRole('button', { name: 'DOC', exact: true })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'PDF', exact: true })).toBeEnabled();

  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    expect.stringContaining('/equipo/documento'), expect.objectContaining({ method: 'PATCH' })
  ));
  await screen.findByText('Documento guardado.');
  expect(warning).toBeInTheDocument();
}, 15000);

test('identifica todas las inactivas sin contar atletas activas ni prestamos', async () => {
  renderEditor([
    { _id: 'inactiva', nombres: 'Ana', apellidos: 'Perez', activo: false },
    { _id: 'baja', nombres: 'Maria', apellidos: 'Lopez', dado_de_baja: true },
    { _id: 'activa', nombres: 'Elena', activo: true }
  ], [{ _id: 'prestamo', nombres: 'Laura', activo: false }]);

  const warning = await screen.findByRole('alert');
  expect(warning).toHaveTextContent('Este roster contiene 2 atletas inactivas.');
  expect(within(warning).getByText('Ana Perez')).toBeInTheDocument();
  expect(within(warning).getByText('Maria Lopez')).toBeInTheDocument();
  const convocatoriaLink = within(warning).getByRole('link', { name: 'Revisar convocatoria' });
  expect(convocatoriaLink).toHaveAttribute('href', '/torneos/torneo/equipos/equipo/atletas');
  expect(convocatoriaLink).not.toHaveAttribute('target');
  expect(warning).not.toHaveTextContent('Elena');
  expect(warning).not.toHaveTextContent('Laura');
  fireEvent.click(convocatoriaLink);
  expect(await screen.findByRole('heading', { name: 'Convocatoria del equipo' })).toBeInTheDocument();
  expect(screen.queryByText('Editor de roster')).not.toBeInTheDocument();
});

test('no muestra advertencia si no hay atletas inactivas', async () => {
  renderEditor([
    { _id: 'activa', nombres: 'Ana', activo: true, dado_de_baja: false },
    { _id: 'legacy', nombres: 'Maria' }
  ]);

  await screen.findByText('Editor de roster');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
