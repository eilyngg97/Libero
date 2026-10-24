import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Torneos from './Torneos';

jest.mock('./RosterCreateDialog', () => () => null);
jest.mock('./RosterTemplateDialog', () => () => null);
jest.mock('@mui/x-data-grid', () => ({ DataGrid: () => null }));
jest.mock('../hooks/useTenantCategorias', () => ({
  __esModule: true,
  default: () => ({ categorias: [] }),
  combinarCategoriasTenant: () => []
}));

const fetchOriginal = global.fetch;
let torneos;

beforeEach(() => {
  torneos = Array.from({ length: 11 }, (_, indice) => ({
    _id: `torneo-${indice + 1}`,
    nombre: `Torneo ${indice + 1}`,
    convocados: []
  }));
  global.fetch = jest.fn(async (url, options = {}) => {
    if (options.method === 'DELETE') {
      torneos = torneos.filter((torneo) => !url.endsWith(`/${torneo._id}`));
      return { ok: true, json: async () => ({}) };
    }
    return { ok: true, json: async () => url.includes('/api/torneos') ? torneos : [] };
  });
});

afterEach(() => { global.fetch = fetchOriginal; });

async function renderTorneos() {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Torneos />
    </MemoryRouter>
  );
  await screen.findByText('Torneo 1', { exact: true });
}

test('limita la lista y permite navegar a primera, anterior, siguiente y ultima pagina', async () => {
  await renderTorneos();
  expect(screen.getAllByRole('button', { name: /^Ver equipos de / })).toHaveLength(5);
  expect(screen.queryByText('Torneo 6', { exact: true })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ir a la primera pagina' })).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: 'Ir a la pagina siguiente' }));
  expect(screen.getByText('Torneo 6', { exact: true })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ir a la ultima pagina' }));
  expect(screen.getByText('Torneo 11', { exact: true })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ir a la pagina siguiente' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Ir a la ultima pagina' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Ir a la pagina anterior' }));
  expect(screen.getByText('Torneo 6', { exact: true })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ir a la primera pagina' }));
  expect(screen.getByText('Torneo 1', { exact: true })).toBeInTheDocument();
});

test('cambiar la cantidad vuelve a la primera pagina', async () => {
  await renderTorneos();
  fireEvent.click(screen.getByRole('button', { name: 'Ir a la ultima pagina' }));
  fireEvent.mouseDown(screen.getByRole('combobox', { name: /Torneos por/ }));
  fireEvent.click(screen.getByRole('option', { name: '10', exact: true }));
  expect(screen.getByText('Torneo 1', { exact: true })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /^Ver equipos de / })).toHaveLength(10);
  expect(screen.queryByText('Torneo 11', { exact: true })).not.toBeInTheDocument();
});

test('eliminar el unico torneo de la ultima pagina vuelve a la pagina anterior', async () => {
  await renderTorneos();
  fireEvent.click(screen.getByRole('button', { name: 'Ir a la ultima pagina' }));
  fireEvent.click(screen.getByRole('button', { name: 'Eliminar', exact: true }));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar torneo' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByText('Torneo 6', { exact: true })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: /^Ver equipos de / })).toHaveLength(5);
  expect(screen.getByRole('button', { name: 'Ir a la ultima pagina' })).toBeDisabled();
});