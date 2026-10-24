import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NumeroFranelaResumen from './NumeroFranelaResumen';

const fetchOriginal = global.fetch;
const pedido = { _id: 'pedido-1', numero_franela: '11', numero_franela_primera_eleccion: true };
const resumen = {
  numero: 11,
  alumno: { _id: 'a1', nombres: 'Ana', apellidos: 'Raga', fecha_nacimiento: '2014-12-26T00:00:00.000Z', categoria: 'U13', sexo: 'Femenino', division: 'Primera division', sede: { nombre: 'Centro' } },
  coincidencias: [
    { _id: 'a2', nombres: 'Luis', apellidos: 'Perez', fecha_nacimiento: '2011-06-10', categoria: 'U17', sexo: 'Masculino', division: 'Segunda division', sede: { nombre: 'Norte' } },
    { _id: 'a3', nombres: 'Marta', apellidos: 'Lopez', activo: false, categoria: 'U15', sede: { nombre: 'Sur' } }
  ]
};

beforeEach(() => {
  global.fetch = jest.fn(async () => ({ ok: true, json: async () => resumen }));
});
afterEach(() => { global.fetch = fetchOriginal; });

test('marca primera eleccion y muestra ficha y coincidencias de toda la academia al pasar el cursor', async () => {
  render(<NumeroFranelaResumen pedido={pedido} />);
  expect(screen.getByText('Nuevo')).toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalled();
  fireEvent.mouseOver(screen.getByRole('button', { name: /Ver resumen de franela 11/ }));
  const panel = within(await screen.findByRole('tooltip'));
  expect(await panel.findByText('Ana Raga')).toBeInTheDocument();
  expect(panel.getByText('26/12/2014')).toBeInTheDocument();
  expect(panel.getByText('U13')).toBeInTheDocument();
  expect(panel.getByText('Femenino')).toBeInTheDocument();
  expect(panel.getByText('Primera division')).toBeInTheDocument();
  expect(panel.getByText('Luis Perez')).toBeInTheDocument();
  expect(panel.getByText('Norte')).toBeInTheDocument();
  expect(panel.getByText('Marta Lopez')).toBeInTheDocument();
  expect(panel.getByText('De baja')).toBeInTheDocument();
  expect(panel.getAllByRole('table')).toHaveLength(2);
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/pedidos/pedido-1/resumen-numero'), expect.objectContaining({ cache: 'no-store' }));
});

test.each([
  [false, 'Numero previamente asignado al atleta'],
  [null, 'Origen del numero no registrado en esta solicitud']
])('no etiqueta como nuevo un pedido con origen %s', async (marca, texto) => {
  render(<NumeroFranelaResumen pedido={{ ...pedido, numero_franela_primera_eleccion: marca }} />);
  expect(screen.queryByText('Nuevo')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Ver resumen/ }));
  expect(await screen.findByText(texto)).toBeInTheDocument();
});

test('permite abrir con foco de teclado y muestra ausencia de coincidencias', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ...resumen, coincidencias: [] }) });
  render(<NumeroFranelaResumen pedido={pedido} />);
  userEvent.tab();
  expect(await screen.findByText('No hay otros atletas con este numero.')).toBeInTheDocument();
});

test('muestra error de consulta y no inventa coincidencias', async () => {
  global.fetch.mockResolvedValue({ ok: false });
  render(<NumeroFranelaResumen pedido={pedido} />);
  fireEvent.click(screen.getByRole('button', { name: /Ver resumen/ }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el resumen');
  expect(screen.queryByText('No hay otros atletas con este numero.')).not.toBeInTheDocument();
});

test('no consulta pedidos sin numero', () => {
  render(<NumeroFranelaResumen pedido={{ ...pedido, numero_franela: null }} />);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalled();
});

test('ignora una respuesta que llega despues de cerrar el resumen', async () => {
  let responder;
  global.fetch.mockImplementation(() => new Promise((resolve) => { responder = resolve; }));
  render(<NumeroFranelaResumen pedido={pedido} />);
  const boton = screen.getByRole('button', { name: /Ver resumen/ });
  fireEvent.click(boton);
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
  fireEvent.click(boton);
  expect(global.fetch.mock.calls[0][1].signal.aborted).toBe(true);
  responder({ ok: true, json: async () => resumen });
  await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
});