import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createTheme, ThemeProvider } from '@mui/material';
import ReportePagosMensuales from './ReportePagosMensuales';
import { exportToExcel } from '../utils/exportExcel';

jest.mock('../context/DolarContext', () => ({ useDolar: () => ({ dolar: { moneda: 'USD' } }) }));
jest.mock('../utils/exportExcel', () => ({ exportToExcel: jest.fn().mockResolvedValue(undefined) }));

const fetchOriginal = global.fetch;
const reporte = () => ({ periodo: { mes: 10, anio: 2026 }, resumen: { pagos: 1 },
  cuotas_del_mes: [
    { id: 'm1', id_alumno: 'a1', alumno: 'Roberto QA', representante: 'Maria QA', mes: 10, anio: 2026,
      monto: 15, estado: 'Pagado', fecha_pago: '2026-09-25', momento_pago: 'anticipado' },
    { id: 'm2', id_alumno: 'a2', alumno: 'Ana QA', representante: 'Maria QA', mes: 10, anio: 2026,
      monto: 15, estado: 'Pagado', fecha_pago: '2026-10-05', momento_pago: 'en_mes' },
    { id: 'm3', id_alumno: 'a3', alumno: 'Eva QA', mes: 10, anio: 2026,
      monto: 20, estado: 'En revision', fecha_pago: null, momento_pago: null }
  ],
  periodos_habito: [{ mes: 7, anio: 2026 }, { mes: 8, anio: 2026 }, { mes: 9, anio: 2026 }],
  pagos: [{ id: 'grupo:g1', codigo: 'PA-QA', fecha: '2026-10-05', monto: 30, metodo: 'Efectivo',
    estado: 'Confirmado', agrupado: true, referencia: 'QA-123', asignaciones: [
      { id_alumno: 'a1', alumno: 'Roberto QA', representante: 'Maria QA', mes: 9, anio: 2026, monto: 15 },
      { id_alumno: 'a2', alumno: 'Ana QA', representante: 'Maria QA', mes: 10, anio: 2026, monto: 15 }
    ] }, { id: 'pago:p2', fecha: '2026-10-15', monto: 20, metodo: 'Zelle', estado: 'En revision',
    agrupado: false, asignaciones: [{ id_alumno: 'a3', alumno: 'Eva QA', mes: 10, anio: 2026, monto: 20 }] }],
  habitos: [{ id_alumno: 'a1', alumno: 'Roberto QA', representante: 'Maria QA', franja: '6_15', franjas_frecuentes: ['6_15'],
    coincidencias: 2, meses_observados: 3, muestras: [{ mes: 8, anio: 2026, fecha_completada: '2026-08-12' }] },
  { id_alumno: 'a2', alumno: 'Ana QA', franja: 'insuficiente', franjas_frecuentes: [], meses_observados: 0, coincidencias: 0, muestras: [] }] });
const abrir = () => {
  const result = render(<ReportePagosMensuales mes={10} sede={{ _id: 's1', nombre: 'Sede QA' }} onClose={jest.fn()} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Dinero recibido' }));
  return result;
};

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => reporte() });
});
afterEach(() => { global.fetch = fetchOriginal; });

test('abre cuotas del mes y distingue dos cuotas pagadas de un ingreso recibido en el mes', async () => {
  const datos = reporte();
  datos.pagos = [datos.pagos[0]];
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => datos });
  render(<ReportePagosMensuales mes={10} onClose={jest.fn()} />);
  const tabla = await screen.findByRole('table', { name: 'Cuotas del mes' });
  expect(screen.getByRole('tab', { name: 'Cuotas del mes' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.queryByLabelText('Desde')).not.toBeInTheDocument();
  expect(screen.getByText(/aunque se hayan pagado en otro mes/)).toBeInTheDocument();
  expect(screen.getByText('Cuotas pagadas').parentElement).toHaveTextContent('2');
  expect(within(tabla).getByText('25/09/2026')).toBeInTheDocument();
  expect(within(tabla).getByText('Anticipado')).toBeInTheDocument();
  expect(within(tabla).getByText('En el mes')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Dinero recibido' }));
  expect(screen.getByText(/Aquí se cuenta el dinero recibido por fecha de pago/)).toBeInTheDocument();
  expect(screen.getByText('Pagos recibidos').parentElement).toHaveTextContent('1');
  expect(screen.getByLabelText('Desde')).toBeInTheDocument();
});

test('cuotas filtra estado y representante y exporta ambas pagadas incluidas las anticipadas', async () => {
  render(<ReportePagosMensuales mes={10} onClose={jest.fn()} />);
  await screen.findByRole('table', { name: 'Cuotas del mes' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Buscar alumno o representante' }), { target: { value: 'Maria' } });
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Estado de la cuota' }));
  fireEvent.click(await screen.findByRole('option', { name: 'Pagado', exact: true }));
  expect(screen.queryByText('Eva QA')).not.toBeInTheDocument();
  expect(screen.getByText('Cuotas pagadas').parentElement).toHaveTextContent('2');
  fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
  await waitFor(() => expect(exportToExcel).toHaveBeenCalledTimes(1));
  expect(exportToExcel.mock.calls[0][1]).toBe(`cuotas-del-mes-${new Date().getFullYear()}-10.xlsx`);
  expect(exportToExcel.mock.calls[0][3]).toMatchObject({
    statusColumnName: 'Estado',
    statusStyleMap: {
      pagado: { bg: '#dff7ea', color: '#0f7a4a' },
      insolvente: { bg: '#ffe1e6', color: '#d32f2f' },
      'en revision': { bg: '#fff6cc', color: '#b45309' }
    }
  });
  expect(exportToExcel.mock.calls[0][0]).toEqual([
    expect.objectContaining({ Alumno: 'Roberto QA', Estado: 'Pagado', 'Fecha de pago': '25/09/2026', 'Momento del pago': 'Anticipado' }),
    expect.objectContaining({ Alumno: 'Ana QA', Estado: 'Pagado', 'Fecha de pago': '05/10/2026', 'Momento del pago': 'En el mes' })
  ]);
});

test('pagada sin fecha se cuenta sin inventar momento y abono no muestra fecha de cancelacion', async () => {
  const datos = reporte();
  datos.cuotas_del_mes[0] = { ...datos.cuotas_del_mes[0], fecha_pago: null, momento_pago: null };
  datos.cuotas_del_mes[2].estado = 'Abono';
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => datos });
  render(<ReportePagosMensuales mes={10} onClose={jest.fn()} />);
  const tabla = await screen.findByRole('table', { name: 'Cuotas del mes' });
  expect(within(tabla).getByText('Sin fecha registrada')).toBeInTheDocument();
  expect(screen.getByText('Cuotas pagadas').parentElement).toHaveTextContent('2');
  expect(screen.getByText(/Esto puede ocurrir con pagos históricos o saldo a favor/)).toBeInTheDocument();
  expect(within(tabla).getByText('Eva QA').closest('tr')).toHaveTextContent('—');
});

test('el archivo Excel conserva el fondo y texto de los estados pagado, insolvente y en revision', async () => {
  const ExcelJS = require('exceljs');
  const exportarReal = jest.requireActual('../utils/exportExcel').exportToExcel;
  const datos = reporte();
  datos.cuotas_del_mes.push({ ...datos.cuotas_del_mes[2], id: 'm4', id_alumno: 'a4',
    alumno: 'Atleta insolvente', estado: 'Insolvente' });
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => datos });
  let workbook;
  const addWorksheet = ExcelJS.Workbook.prototype.addWorksheet;
  const spyWorksheet = jest.spyOn(ExcelJS.Workbook.prototype, 'addWorksheet').mockImplementation(function (...args) {
    workbook = this;
    return addWorksheet.apply(this, args);
  });
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const createUrl = URL.createObjectURL;
  const revokeUrl = URL.revokeObjectURL;
  URL.createObjectURL = jest.fn(() => 'blob:excel-qa');
  URL.revokeObjectURL = jest.fn();
  exportToExcel.mockImplementationOnce(exportarReal);
  try {
    render(<ReportePagosMensuales mes={10} onClose={jest.fn()} />);
    await screen.findByRole('table', { name: 'Cuotas del mes' });
    fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
    await waitFor(() => expect(click).toHaveBeenCalledTimes(1));
    const buffer = await workbook.xlsx.writeBuffer();
    spyWorksheet.mockRestore();
    const archivo = new ExcelJS.Workbook();
    await archivo.xlsx.load(buffer);
    const hoja = archivo.worksheets[0];
    const columnaEstado = hoja.getRow(1).values.indexOf('Estado');
    const colores = {
      Pagado: ['FFDFF7EA', 'FF0F7A4A'],
      Insolvente: ['FFFFE1E6', 'FFD32F2F'],
      'En revisión': ['FFFFF6CC', 'FFB45309']
    };
    for (let fila = 2; fila <= hoja.rowCount; fila += 1) {
      const celda = hoja.getRow(fila).getCell(columnaEstado);
      const [fondo, texto] = colores[celda.value];
      expect(celda.fill.fgColor.argb).toBe(fondo);
      expect(celda.font).toMatchObject({ bold: true, color: { argb: texto } });
    }
  } finally {
    spyWorksheet.mockRestore();
    click.mockRestore();
    URL.createObjectURL = createUrl;
    URL.revokeObjectURL = revokeUrl;
  }
});

test('consulta mes y sede, cuenta grupos una vez y muestra la cuota de otro mes', async () => {
  abrir();
  expect(await screen.findByText('PA-QA')).toBeInTheDocument();
  const [url] = global.fetch.mock.calls[0];
  const params = new URLSearchParams(url.split('?')[1]);
  expect(params.get('mes')).toBe('10');
  expect(params.get('id_sede')).toBe('s1');
  expect(screen.getByText('Cuota de Septiembre 2026', { exact: false })).toBeInTheDocument();
  expect(screen.getByText('05/10/2026')).toBeInTheDocument();
  expect(screen.getByText('2', { selector: 'p' })).toBeInTheDocument();
  expect(screen.getByText('3', { selector: 'p' })).toBeInTheDocument();
});

test('en movil muestra estado y fecha anticipada en la tarjeta de cada cuota', async () => {
  const originalMatchMedia = window.matchMedia;
  window.matchMedia = jest.fn((query) => ({
    matches: query.includes('max-width'), media: query, onchange: null,
    addListener: jest.fn(), removeListener: jest.fn(),
    addEventListener: jest.fn(), removeEventListener: jest.fn(), dispatchEvent: jest.fn()
  }));
  try {
    render(<ReportePagosMensuales mes={10} onClose={jest.fn()} />);
    const alumno = await screen.findByText('Roberto QA');
    const tarjeta = alumno.closest('article');
    expect(tarjeta).not.toBeNull();
    expect(within(tarjeta).getByText('Pagado')).toBeInTheDocument();
    expect(within(tarjeta).getByText('25/09/2026')).toBeInTheDocument();
    expect(within(tarjeta).getByText('Anticipado')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  } finally {
    window.matchMedia = originalMatchMedia;
  }
});

test('ambas vistas usan grises aunque el tema exterior tenga textos azules y acento morado', async () => {
  const temaExterior = createTheme({ palette: { primary: { main: '#7c3aed' },
    text: { primary: '#172554', secondary: '#3730a3' } } });
  render(<ThemeProvider theme={temaExterior}>
    <ReportePagosMensuales mes={10} sede={{ _id: 's1', nombre: 'Sede QA' }} onClose={jest.fn()} />
  </ThemeProvider>);
  fireEvent.click(screen.getByRole('tab', { name: 'Dinero recibido' }));
  await screen.findByText('PA-QA');
  expect(screen.getByRole('tab', { name: 'Dinero recibido' })).toHaveStyle({ color: '#475569' });
  expect(screen.getByRole('tab', { name: 'Hábito de pago' })).toHaveStyle({ color: '#6b7280' });
  expect(screen.getByText('QA-123')).toHaveStyle({ color: '#6b7280' });
  expect(screen.getByText(/Fecha de pago:/)).toHaveStyle({ color: '#6b7280' });
  expect(screen.getByRole('button', { name: 'Aplicar rango' })).toHaveStyle({ '--variant-outlinedColor': '#475569' });
  expect(screen.getByRole('button', { name: 'Excel' })).toHaveStyle({ '--variant-outlinedColor': '#475569' });
  fireEvent.click(screen.getByRole('tab', { name: 'Hábito de pago' }));
  expect(screen.getByRole('tab', { name: 'Hábito de pago' })).toHaveStyle({ color: '#475569' });
  expect(screen.getByRole('tab', { name: 'Dinero recibido' })).toHaveStyle({ color: '#6b7280' });
  expect(screen.getByText(/Cobertura de la sede:/)).toHaveStyle({ color: '#6b7280' });
  expect(screen.getByText('Cuotas completadas con pagos confirmados.')).toHaveStyle({ color: '#6b7280' });
  expect(screen.getByText('Hábito consistente: del 6 al 15')).toHaveStyle({ color: '#216548' });
});

test('aplica rango dentro del mes y no consulta rangos invertidos', async () => {
  abrir();
  await screen.findByText('PA-QA');
  fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-05' } });
  fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-15' } });
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar rango' }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2));
  expect(global.fetch.mock.calls[1][0]).toContain('desde=2026-10-05&hasta=2026-10-15');
  await screen.findByText('PA-QA');
  fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-20' } });
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar rango' }));
  expect(screen.getByRole('alert')).toHaveTextContent('rango válido');
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

test('habito presenta estimacion, muestra evidencia y no inventa historial', async () => {
  abrir();
  await screen.findByText('PA-QA');
  fireEvent.click(screen.getByRole('tab', { name: 'Hábito de pago' }));
  expect(screen.getByText('Hábito consistente: del 6 al 15')).toBeInTheDocument();
  expect(screen.getByText('3 cuotas analizadas · 2 coinciden')).toBeInTheDocument();
  expect(screen.getByText('0 cuotas analizadas')).toBeInTheDocument();
  expect(screen.getByText('Sin cuotas completadas')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Fechas de cancelación'));
  expect(screen.getByText('Agosto 2026: 12/08/2026')).toBeInTheDocument();
});

test('habito acepta mas de tres cuotas, muestra el historial completo y lo exporta', async () => {
  const historico = reporte();
  historico.periodos_habito = Array.from({ length: 7 }, (_, index) => ({ mes: index + 1, anio: 2026 }));
  historico.habitos[0] = { ...historico.habitos[0], coincidencias: 5, meses_observados: 7,
    muestras: historico.periodos_habito.map((item) => ({ ...item, fecha_completada: `2026-${String(item.mes).padStart(2, '0')}-12` })) };
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => historico });
  abrir();
  await screen.findByText('PA-QA');
  fireEvent.click(screen.getByRole('tab', { name: 'Hábito de pago' }));
  expect(screen.getByText('Referencia estimada · Historial completo')).toBeInTheDocument();
  expect(screen.getByText('Cobertura de la sede: Enero 2026 a Julio 2026 · 7 períodos con evidencia')).toBeInTheDocument();
  expect(screen.getByText('7 cuotas analizadas · 5 coinciden')).toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: 'Año' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Fechas de cancelación'));
  expect(screen.getByText('Enero 2026: 12/01/2026')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
  await waitFor(() => expect(exportToExcel).toHaveBeenCalledTimes(1));
  expect(exportToExcel.mock.calls[0][0][0]).toMatchObject({ 'Cuotas analizadas': 7, Coincidencias: 5 });
  expect(exportToExcel.mock.calls[0][1]).toBe('habitos-historial-completo.xlsx');
  fireEvent.click(screen.getByRole('tab', { name: 'Dinero recibido' }));
  expect(screen.getByRole('combobox', { name: 'Año' })).toBeInTheDocument();
});

test('mayor frecuencia de tres de seis aparece en el filtro y se exporta sin afirmar consistencia', async () => {
  const historico = reporte();
  historico.habitos[0] = { ...historico.habitos[0], franja: 'sin_patron', franja_frecuente: 'atrasado',
    franjas_frecuentes: ['atrasado'], coincidencias: 3, meses_observados: 6, muestras: [
      { mes: 3, anio: 2026, fecha_completada: '2026-03-06', franja: '6_15' },
      { mes: 6, anio: 2026, fecha_completada: '2026-07-01', franja: 'atrasado' },
      { mes: 7, anio: 2026, fecha_completada: '2026-08-01', franja: 'atrasado' },
      { mes: 8, anio: 2026, fecha_completada: '2026-08-31', franja: '16_fin' },
      { mes: 9, anio: 2026, fecha_completada: '2026-10-01', franja: 'atrasado' },
      { mes: 10, anio: 2026, fecha_completada: '2026-10-21', franja: '16_fin' }
    ] };
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => historico });
  abrir();
  await screen.findByText('PA-QA');
  fireEvent.click(screen.getByRole('tab', { name: 'Hábito de pago' }));
  expect(screen.getByText('Mayor frecuencia: en meses posteriores')).toBeInTheDocument();
  expect(screen.getByText('6 cuotas analizadas · 3 coinciden')).toBeInTheDocument();
  expect(screen.queryByText(/Hábito consistente:/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByText('Fechas de cancelación'));
  expect(screen.getByText('Junio 2026: 01/07/2026 · En meses posteriores')).toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Tendencia' }));
  fireEvent.click(await screen.findByRole('option', { name: 'En meses posteriores', exact: true }));
  expect(screen.getByText('Roberto QA')).toBeInTheDocument();
  expect(screen.queryByText('Ana QA')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
  await waitFor(() => expect(exportToExcel).toHaveBeenCalledTimes(1));
  expect(exportToExcel.mock.calls[0][0]).toEqual([expect.objectContaining({
    Tendencia: 'Mayor frecuencia: en meses posteriores', 'Cuotas analizadas': 6, Coincidencias: 3
  })]);
});

test('empate muestra todas las franjas maximas, filtra por cualquiera y exporta sus coincidencias', async () => {
  const historico = reporte();
  historico.habitos[0] = { ...historico.habitos[0], franja: 'sin_patron', franja_frecuente: null,
    franjas_frecuentes: ['1_5', '6_15'], coincidencias: 2, meses_observados: 4 };
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => historico });
  abrir();
  await screen.findByText('PA-QA');
  fireEvent.click(screen.getByRole('tab', { name: 'Hábito de pago' }));
  expect(screen.getByText('Mayor frecuencia (empate): del 1 al 5 / del 6 al 15')).toBeInTheDocument();
  expect(screen.getByText('4 cuotas analizadas · 2 por franja')).toBeInTheDocument();
  expect(screen.queryByText('Sin franja predominante')).not.toBeInTheDocument();
  for (const franja of ['Del 1 al 5', 'Del 6 al 15']) {
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Tendencia' }));
    expect(screen.queryByRole('option', { name: 'Sin franja predominante' })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('option', { name: franja, exact: true }));
    expect(screen.getByText('Roberto QA')).toBeInTheDocument();
    expect(screen.queryByText('Ana QA')).not.toBeInTheDocument();
  }
  fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
  await waitFor(() => expect(exportToExcel).toHaveBeenCalledTimes(1));
  expect(exportToExcel.mock.calls[0][0][0]).toMatchObject({
    Tendencia: 'Mayor frecuencia (empate): del 1 al 5 / del 6 al 15', Coincidencias: 2 });
});

test('una cuota muestra su frecuencia sin presentarla como habito consistente', async () => {
  const historico = reporte();
  historico.habitos[0] = { ...historico.habitos[0], franja: 'insuficiente', franjas_frecuentes: ['6_15'],
    coincidencias: 1, meses_observados: 1 };
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => historico });
  abrir();
  await screen.findByText('PA-QA');
  fireEvent.click(screen.getByRole('tab', { name: 'Hábito de pago' }));
  expect(screen.getByText('Mayor frecuencia: del 6 al 15')).toBeInTheDocument();
  expect(screen.getByText('1 cuota analizada · 1 coincide')).toBeInTheDocument();
  expect(screen.queryByText(/Hábito consistente:/)).not.toBeInTheDocument();
});

test('exporta todas las transferencias filtradas, sin multiplicarlas por atleta', async () => {
  abrir();
  await screen.findByText('PA-QA');
  fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
  await waitFor(() => expect(exportToExcel).toHaveBeenCalledTimes(1));
  expect(exportToExcel.mock.calls[0][0]).toHaveLength(2);
  expect(exportToExcel.mock.calls[0][0][0]).toMatchObject({ Monto: 30, Alumnos: 'Roberto QA / Ana QA' });
  expect(exportToExcel.mock.calls[0][3]).toMatchObject({
    statusColumnName: 'Estado',
    statusStyleMap: {
      confirmado: { bg: '#e9f6ef', color: '#216548' },
      'en revision': { bg: '#fff6cc', color: '#b45309' }
    }
  });
});

test('error de consulta no muestra ceros ni exporta y reintentar recupera el reporte', async () => {
  global.fetch.mockRejectedValueOnce(new Error('Servicio no disponible'));
  abrir();
  expect(await screen.findByRole('alert')).toHaveTextContent('Servicio no disponible');
  expect(screen.queryByText('Alumnos que pagaron')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Excel' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByText('PA-QA')).toBeInTheDocument();
});

test('filtra por representante y estado antes de calcular y exportar', async () => {
  abrir();
  await screen.findByText('PA-QA');
  fireEvent.change(screen.getByRole('textbox', { name: 'Buscar alumno o representante' }), { target: { value: 'Maria' } });
  const tabla = screen.getByRole('table', { name: 'Pagos recibidos' });
  expect(within(tabla).queryByText('Eva QA')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
  await waitFor(() => expect(exportToExcel).toHaveBeenCalledTimes(1));
  expect(exportToExcel.mock.calls[0][0]).toHaveLength(1);
});

test('respuesta incompleta no se interpreta como ausencia de pagos', async () => {
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ pagos: [] }) });
  abrir();
  expect(await screen.findByRole('alert')).toHaveTextContent('incompleto');
  expect(screen.queryByText('No hay pagos recibidos para esta selección.')).not.toBeInTheDocument();
});

test('importe invalido no se presenta como cero ni permite exportar', async () => {
  const invalido = reporte(); invalido.pagos[0].monto = null;
  global.fetch.mockResolvedValueOnce({ ok: true, json: async () => invalido });
  abrir();
  expect(await screen.findByRole('alert')).toHaveTextContent('incompleto');
  expect(screen.queryByText('Alumnos que pagaron')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Excel' })).toBeDisabled();
});

test('filtro de estado recalcula cantidades y exporta solo pagos en revision', async () => {
  abrir();
  await screen.findByText('PA-QA');
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Estado del pago' }));
  fireEvent.click(await screen.findByRole('option', { name: 'En revisión', exact: true }));
  expect(screen.queryByText('PA-QA')).not.toBeInTheDocument();
  expect(screen.getAllByText('1', { selector: 'p' })).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Excel' }));
  await waitFor(() => expect(exportToExcel).toHaveBeenCalledTimes(1));
  expect(exportToExcel.mock.calls[0][0]).toEqual([expect.objectContaining({ Alumnos: 'Eva QA', Estado: 'En revision', Monto: 20 })]);
});

test('cambiar de anio ignora respuestas anteriores y cancela la peticion al cerrar', async () => {
  let resolverPrimera;
  global.fetch.mockImplementationOnce(() => new Promise((resolve) => { resolverPrimera = resolve; }));
  const { unmount } = abrir();
  const signalPrimera = global.fetch.mock.calls[0][1].signal;
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Año' }));
  fireEvent.click(await screen.findByRole('option', { name: String(new Date().getFullYear() - 1), exact: true }));
  expect(await screen.findByText('PA-QA')).toBeInTheDocument();
  expect(signalPrimera.aborted).toBe(true);
  const obsoleto = reporte(); obsoleto.pagos[0].codigo = 'PA-OBSOLETO';
  await act(async () => { resolverPrimera({ ok: true, json: async () => obsoleto }); });
  expect(screen.queryByText('PA-OBSOLETO')).not.toBeInTheDocument();
  const signalActual = global.fetch.mock.calls[1][1].signal;
  unmount();
  expect(signalActual.aborted).toBe(true);
});