import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import Estadisticas from './Estadisticas';

jest.mock('../context/DolarContext', () => ({ useDolar: () => ({ dolar: { moneda: 'USD' } }) }));
jest.mock('../utils/permissions', () => ({ hasPermission: () => false }));
jest.mock('recharts', () => ({
  ...jest.requireActual('recharts'), ResponsiveContainer: () => null
}));

const fetchOriginal = global.fetch;

beforeEach(() => {
  const atletas = [
    { _id: 'activo', nombres: 'Ana', apellidos: 'Activa', activo: true },
    { _id: 'baja', nombres: 'Eva', apellidos: 'Retirada', activo: false },
    { _id: 'legacy', nombres: 'Sin', apellidos: 'Estado' }
  ];
  global.fetch = jest.fn(async url => ({ ok: true, json: async () => (
    url.includes('/estadisticas/inscritos-retirados')
      ? { anio: 2026, totales: { inscritos: 3, retirados: 3, reingresos: 3 }, meses: [
        { mes: 8, inscritos: 3, retirados: 3, reingresos: 3,
          detalle: { inscritos: atletas, retirados: atletas, reingresos: atletas } }
      ] }
      : url.includes('/api/sedes') ? [] : { meses: [], sedes: [], totales: {} }
  ) }));
});

afterEach(() => { global.fetch = fetchOriginal; });

test.each([['Inscritos', 0], ['Reingresos', 1], ['Retirados', 2]])(
  '%s muestra puntos por estado actual, no por tipo de evento', async (tipo, indice) => {
    render(<Estadisticas />);
    const fila = await screen.findByRole('row', { name: /^Ago 3 Ver 3 Ver 3 Ver$/ });
    fireEvent.click(within(fila).getAllByRole('button', { name: 'Ver', exact: true })[indice]);
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByText(`${tipo} - Ago 2026`)).toBeInTheDocument();
    expect(within(dialogo).getByRole('img', { name: 'Activo', exact: true })).toHaveStyle({
      backgroundColor: '#22c55e', width: '8px', height: '8px'
    });
    expect(within(dialogo).getByRole('img', { name: 'De baja', exact: true })).toHaveStyle({
      backgroundColor: '#ef4444', width: '8px', height: '8px'
    });
    expect(within(dialogo).getAllByRole('img')).toHaveLength(2);
  }
);