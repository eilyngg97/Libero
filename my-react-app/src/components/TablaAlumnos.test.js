import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TablaAlumnos from './TablaAlumnos';

jest.mock('../context/SedeContext', () => ({ useSede: () => ({ sedeSeleccionada: null }) }));
jest.mock('../hooks/useTenantCategorias', () => ({
  __esModule: true,
  default: () => ({ categorias: ['U9', 'U13'] })
}));
jest.mock('@mui/material/useMediaQuery', () => ({ __esModule: true, default: () => false }));
jest.mock('../utils/exportExcel', () => ({ exportToExcel: jest.fn() }));
jest.mock('jspdf', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('jspdf-autotable', () => ({ __esModule: true, default: jest.fn() }));

const fetchOriginal = global.fetch;
const nombres = ['Ana', 'Berta', 'Carla', 'Diego', 'Elena', 'Fabio', 'Gina'];
const franelas = ['10', '2', null, 0, '100', 2, ''];

beforeEach(() => {
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => [...nombres].reverse().map((nombre) => {
      const indice = nombres.indexOf(nombre);
      return {
        _id: `alumno-${indice}`,
        nombres: nombre,
        apellidos: 'Prueba',
        numero_franela: franelas[indice],
        categoria: indice % 2 ? 'U9' : 'U13',
        fecha_nacimiento: '2015-01-01',
        sexo: 'Femenino',
        tipo_mensualidad: 'monto_sede',
        solvencia_mensualidades: 'solvente'
      };
    })
  }));
});

afterEach(() => { global.fetch = fetchOriginal; });

async function renderAlumnos() {
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <TablaAlumnos />
    </MemoryRouter>
  );
  await screen.findByText('Ana Prueba', { exact: true });
}

function nombresVisibles() {
  return within(screen.getByRole('table')).getAllByRole('row').slice(1).map((fila) => (
    within(fila).getByText(/^(Ana|Berta|Carla|Diego|Elena|Fabio|Gina) Prueba$/).textContent
  ));
}

test('mantiene el orden alfabetico inicial y permite invertirlo', async () => {
  await renderAlumnos();
  expect(nombresVisibles()).toEqual(['Ana Prueba', 'Berta Prueba', 'Carla Prueba', 'Diego Prueba', 'Elena Prueba']);
  expect(screen.getByRole('columnheader', { name: 'ALUMNO' })).toHaveAttribute('aria-sort', 'ascending');
  fireEvent.click(screen.getByRole('button', { name: 'Ordenar por alumno descendente' }));
  expect(nombresVisibles()).toEqual(['Gina Prueba', 'Fabio Prueba', 'Elena Prueba', 'Diego Prueba', 'Carla Prueba']);
  expect(screen.getByRole('columnheader', { name: 'ALUMNO' })).toHaveAttribute('aria-sort', 'descending');
});

test('ordena franelas numericamente antes de paginar, conserva cero y deja vacios al final', async () => {
  await renderAlumnos();
  fireEvent.click(screen.getByRole('button', { name: 'Ordenar por franela ascendente' }));
  expect(nombresVisibles()).toEqual(['Diego Prueba', 'Berta Prueba', 'Fabio Prueba', 'Ana Prueba', 'Elena Prueba']);
  const filaDiego = screen.getByRole('row', { name: /Diego Prueba/ });
  expect(within(filaDiego).getByRole('cell', { name: '0', exact: true })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ordenar por franela descendente' }));
  expect(nombresVisibles()).toEqual(['Elena Prueba', 'Ana Prueba', 'Berta Prueba', 'Fabio Prueba', 'Diego Prueba']);
  fireEvent.click(screen.getByRole('button', { name: /next page/i }));
  expect(nombresVisibles()).toEqual(['Carla Prueba', 'Gina Prueba']);
  fireEvent.click(screen.getByRole('button', { name: 'Ordenar por franela ascendente' }));
  expect(nombresVisibles()).toEqual(['Diego Prueba', 'Berta Prueba', 'Fabio Prueba', 'Ana Prueba', 'Elena Prueba']);
});

test('ofrece orden en todas las columnas de datos y compara categorias en orden natural', async () => {
  await renderAlumnos();
  expect(screen.getAllByRole('button', { name: /^Ordenar por/ })).toHaveLength(6);
  fireEvent.click(screen.getByRole('button', { name: /Ordenar por categor.* ascendente/ }));
  expect(nombresVisibles()).toEqual(['Berta Prueba', 'Diego Prueba', 'Fabio Prueba', 'Ana Prueba', 'Carla Prueba']);
});