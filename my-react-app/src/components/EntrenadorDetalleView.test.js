import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import EntrenadorDetalleView from './EntrenadorDetalleView';
import { mediaUrl } from '../utils/mediaUrl';

jest.mock('../context/DolarContext', () => ({
  useDolar: () => ({ dolar: { promedio: 884.75 }, loading: false, error: null })
}));
jest.mock('../utils/dolarHistorico', () => ({
  obtenerTasaOficialPorFecha: jest.fn().mockResolvedValue(884.75)
}));
jest.mock('./EntrenadorForm', () => () => null);

const pagos = [
  {
    _id: 'pago-octubre',
    periodo: 'Abono octubre',
    periodo_clave: '2026-10-abono-1',
    fecha_pago: '2026-10-22',
    monto_total_usd: 100,
    comprobante_url: '/uploads/villasport/entrenadores/octubre.png'
  },
  {
    _id: 'pago-septiembre',
    periodo: 'Abono septiembre',
    periodo_clave: '2026-09-abono-1',
    fecha_pago: '2026-10-01',
    monto_total_usd: 50,
    comprobante_url: '/uploads/villasport/entrenadores/septiembre.pdf'
  },
  {
    _id: 'pago-sin-comprobante',
    periodo: 'Abono sin comprobante',
    fecha_pago: '2026-10-15',
    monto_total_usd: 25
  }
];

function abrir(pagosNomina = pagos) {
  return render(
    <EntrenadorDetalleView
      entrenador={{ _id: 'entrenador-1', nombre: 'Ana', pagos_nomina: pagosNomina }}
      palette={{ bg: '#eee', color: '#111' }}
      trainerSedes={[]}
      paymentMethods={[]}
      initialActiveTab="historial"
    />
  );
}

function elegirMes(label) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Filtrar por mes' }));
  fireEvent.click(screen.getByRole('option', { name: label }));
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 9, 22, 12));
});

afterEach(() => {
  jest.useRealTimers();
});

test('inicia en el mes actual y respeta el mes contable aunque se pague despues', async () => {
  abrir();
  expect(await screen.findByText('Historial de pagos')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Filtrar por mes' })).toHaveTextContent('octubre de 2026');
  expect(screen.getByText('Abono octubre')).toBeInTheDocument();
  expect(screen.getByText('Abono sin comprobante')).toBeInTheDocument();
  expect(screen.queryByText('Abono septiembre')).not.toBeInTheDocument();
});

test('permite seleccionar otro mes y todos los meses', async () => {
  abrir();
  await screen.findByText('Historial de pagos');
  elegirMes('septiembre de 2026');
  expect(screen.getByText('Abono septiembre')).toBeInTheDocument();
  expect(screen.queryByText('Abono octubre')).not.toBeInTheDocument();
  elegirMes('Todos los meses');
  expect(screen.getByText('Abono octubre')).toBeInTheDocument();
  expect(screen.getByText('Abono septiembre')).toBeInTheDocument();
});

test('mantiene el mes actual disponible aunque no tenga pagos y permite limpiar filtros', async () => {
  abrir([pagos[1]]);
  expect(await screen.findByText('No hay pagos que coincidan con esos filtros.')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Filtrar por mes' })).toHaveTextContent('octubre de 2026');
  fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
  expect(screen.getByText('Abono septiembre')).toBeInTheDocument();
});

test('abre imagenes y PDF dentro del historial y conserva el filtro al cerrar', async () => {
  abrir();
  await screen.findByText('Historial de pagos');
  elegirMes('Todos los meses');
  const botones = screen.getAllByRole('button', { name: 'Ver comprobante' });
  expect(botones).toHaveLength(2);
  expect(screen.queryByRole('link', { name: 'Ver comprobante' })).not.toBeInTheDocument();
  fireEvent.click(botones[0]);
  expect(screen.getByRole('dialog', { name: 'Comprobante de pago' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Cargando comprobante...');
  const imagen = screen.getByAltText('Comprobante de pago');
  expect(imagen).toHaveAttribute('src', mediaUrl(pagos[0].comprobante_url));
  fireEvent.load(imagen);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Volver al historial' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByRole('combobox', { name: 'Filtrar por mes' })).toHaveTextContent('Todos los meses');
  fireEvent.click(screen.getAllByRole('button', { name: 'Ver comprobante' })[1]);
  const pdf = screen.getByTitle('Vista previa del comprobante');
  expect(pdf).toHaveAttribute('src', mediaUrl(pagos[1].comprobante_url));
  fireEvent.load(pdf);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar comprobante' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByText('Abono sin comprobante')).toBeInTheDocument();
});

test('muestra un error si la imagen no carga y permite cerrar y reintentar', async () => {
  abrir();
  await screen.findByText('Historial de pagos');
  fireEvent.click(screen.getByRole('button', { name: 'Ver comprobante' }));
  fireEvent.error(screen.getByAltText('Comprobante de pago'));
  expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar el comprobante');
  fireEvent.click(screen.getByRole('button', { name: 'Volver al historial' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Ver comprobante' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toBeInTheDocument();
});

test('sin pagos conserva una seleccion valida del mes actual', async () => {
  abrir([]);
  expect(await screen.findByText('No hay pagos registrados todavía.')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Filtrar por mes' })).toHaveTextContent('octubre de 2026');
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Filtrar por mes' }));
  expect(screen.getByRole('option', { name: 'octubre de 2026' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Todos los meses' })).toBeInTheDocument();
});
