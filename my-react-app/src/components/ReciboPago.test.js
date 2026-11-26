import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import QRCode from 'qrcode';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import ReciboPagoButton, { ReciboDocumento, VerificarRecibo } from './ReciboPago';

jest.mock('qrcode', () => ({ toDataURL: jest.fn() }));
jest.mock('html-to-image', () => ({ toPng: jest.fn() }));
jest.mock('jspdf', () => ({ jsPDF: jest.fn() }));

const recibo = {
  numero: 'REC-2026-0042', emitido_en: '2026-11-24T14:42:00Z',
  verificacion_url: 'https://qa.apex.com.ve/verificar/REC-2026-0042', qr: 'data:image/png;base64,AAAA',
  datos: {
    academia: { nombre: 'Academia QA', rif: 'J-QA', sede: 'Sede QA', logo: '' },
    representante: { nombre: 'Representante QA', cedula: 'V-QA' },
    atleta: { nombre: 'Atleta QA', categoria: 'Sub-15' },
    concepto: 'Inscripcion + Mensualidad noviembre 2026', totales: [{ moneda: 'VES', monto: 2150 }],
    lineas: [
      { concepto: 'Inscripcion', importes: [{ moneda: 'VES', monto: 716.67 }] },
      { concepto: 'Mensualidad noviembre 2026', importes: [{ moneda: 'VES', monto: 1433.33 }] }
    ],
    pagos: [{ metodo: 'Pago movil', referencia: '849281', fecha: '2026-11-24', moneda: 'VES', monto: 2150 }]
  }
};
let pdf;
let click;
const originalFetch = global.fetch;
const originalDecode = HTMLImageElement.prototype.decode;

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('token', 'token-qa');
  QRCode.toDataURL.mockResolvedValue(recibo.qr);
  toPng.mockResolvedValue(recibo.qr);
  pdf = { addPage: jest.fn(), addImage: jest.fn(), save: jest.fn(), getImageProperties: () => ({ width: 900, height: 450 }) };
  jsPDF.mockImplementation(() => pdf);
  HTMLImageElement.prototype.decode = jest.fn().mockResolvedValue(undefined);
  click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => recibo });
});

afterEach(() => {
  global.fetch = originalFetch;
  HTMLImageElement.prototype.decode = originalDecode;
  click.mockRestore();
});

test('muestra datos fiscales, cliente, atleta, inscripcion, mensualidad y referencia', () => {
  render(<ReciboDocumento recibo={recibo} />);
  for (const text of ['Academia QA', 'Representante QA', 'Atleta QA', 'Sub-15', 'Inscripcion', 'Mensualidad noviembre 2026']) {
    expect(screen.getByText(text)).toBeInTheDocument();
  }
  expect(screen.getByText(/849281/)).toBeInTheDocument();
  expect(screen.getByText('24 nov. 2026')).toBeInTheDocument();
  expect(screen.getByText('RIF / ID: J-QA')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Verificar autenticidad/ })).toHaveAttribute('href', recibo.verificacion_url);
  expect(screen.queryByText('Recargo por mora')).not.toBeInTheDocument();
});

test.each([undefined, '', '   '])('omite la fila fiscal del recibo y la verificacion cuando no tiene RIF (%p)', async (rif) => {
  const datos = { ...recibo.datos, academia: { ...recibo.datos.academia, rif } };
  const { unmount } = render(<ReciboDocumento recibo={{ ...recibo, datos }} />);
  expect(screen.queryByText(/^RIF/)).not.toBeInTheDocument();
  unmount();
  global.fetch.mockResolvedValue({
    ok: true, json: async () => ({ ...datos, numero: recibo.numero, emitido_en: recibo.emitido_en })
  });
  render(<MemoryRouter initialEntries={['/verificar/REC-2026-0042']}>
    <Routes><Route path="/verificar/:numero" element={<VerificarRecibo />} /></Routes>
  </MemoryRouter>);
  await screen.findByRole('status');
  expect(screen.queryByText(/^RIF/)).not.toBeInTheDocument();
});

test.each(['Efectivo', 'Zelle', 'PayPal', 'Binance'])('el recibo de %s muestra solo divisas', (metodo) => {
  const datos = { ...recibo.datos,
    totales: [{ moneda: 'USD', monto: 45 }],
    lineas: recibo.datos.lineas.map((linea, index) => ({ concepto: linea.concepto,
      importes: [{ moneda: 'USD', monto: index === 0 ? 15 : 30 }] })),
    pagos: [{ ...recibo.datos.pagos[0], metodo, moneda: 'USD', monto: 45 }]
  };
  render(<ReciboDocumento recibo={{ ...recibo, datos }} />);
  expect(screen.getByRole('article').textContent).toContain('USD');
  expect(screen.getByRole('article').textContent).not.toContain('Bs');
});

test('recibo y QR mixtos muestran totales separados sin sumar monedas', async () => {
  const datos = { ...recibo.datos, totales: [{ moneda: 'VES', monto: 1000 }, { moneda: 'USD', monto: 10 }],
    lineas: recibo.datos.lineas.map((linea) => ({ ...linea, importes: [
      { moneda: 'VES', monto: 500 }, { moneda: 'USD', monto: 5 }
    ] })),
    pagos: [{ ...recibo.datos.pagos[0], monto: 1000 },
      { ...recibo.datos.pagos[0], metodo: 'Zelle', moneda: 'USD', monto: 10 }]
  };
  const { unmount } = render(<ReciboDocumento recibo={{ ...recibo, datos }} />);
  expect(screen.getByText('Importes separados por moneda. No se suman entre si.')).toBeInTheDocument();
  expect(screen.getByText('Desglose distribuido proporcionalmente entre las monedas de los pagos.')).toBeInTheDocument();
  expect(screen.queryByText('1.010,00')).not.toBeInTheDocument();
  unmount();
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({
    academia: datos.academia, concepto: datos.concepto, totales: datos.totales,
    numero: recibo.numero, emitido_en: recibo.emitido_en
  }) });
  render(<MemoryRouter initialEntries={['/verificar/REC-2026-0042']}>
    <Routes><Route path="/verificar/:numero" element={<VerificarRecibo />} /></Routes>
  </MemoryRouter>);
  await screen.findByRole('status');
  expect(screen.getByText('1.000,00')).toBeInTheDocument();
  expect(screen.getByText('10,00')).toBeInTheDocument();
  expect(screen.getByText('Importes separados por moneda. No se suman entre si.')).toBeInTheDocument();
});

test('importes incompletos no se descargan ni se presentan como cero', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => ({
    ...recibo, datos: { ...recibo.datos, totales: [{ moneda: 'VES', monto: null }] }
  }) });
  render(<ReciboPagoButton mensualidadId="m1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Ver Recibo' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('importes del recibo estan incompletos');
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
  expect(pdf.save).not.toHaveBeenCalled();
});

test('el boton destacado abre el recibo autenticado y permite descargar PDF y PNG sin controles', async () => {
  render(<ReciboPagoButton mensualidadId="m1" label="Compartir / Descargar Recibo" destacado />);
  fireEvent.click(screen.getByRole('button', { name: 'Compartir / Descargar Recibo' }));
  await screen.findByRole('article');
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/mensualidad/m1'), expect.objectContaining({
    method: 'POST', headers: { Authorization: 'Bearer token-qa' }
  }));
  expect(QRCode.toDataURL).toHaveBeenCalledWith(recibo.verificacion_url, expect.any(Object));
  fireEvent.click(screen.getByRole('button', { name: 'Descargar PDF' }));
  await waitFor(() => expect(pdf.save).toHaveBeenCalledWith('REC-2026-0042.pdf'));
  expect(toPng.mock.calls[0][0].tagName).toBe('ARTICLE');
  expect(toPng.mock.calls[0][0].textContent).not.toContain('Descargar PDF');
  expect(toPng.mock.calls[0][0].textContent).not.toMatch(/USD|EUR|\$/);
  expect(toPng.mock.calls[0][0].textContent).toContain('2.150,00');
  fireEvent.click(screen.getByRole('button', { name: 'Descargar imagen PNG' }));
  await waitFor(() => expect(click).toHaveBeenCalled());
  expect(toPng.mock.calls[1][0].textContent).not.toMatch(/USD|EUR|\$/);
  expect(screen.getByRole('link', { name: /Compartir por WhatsApp/ })).toHaveAttribute('href', expect.stringContaining(encodeURIComponent(recibo.verificacion_url)));
  expect(screen.queryByRole('button', { name: 'Cerrar', exact: true })).not.toBeInTheDocument();
  const cerrar = screen.getByRole('button', { name: 'Cerrar recibo' });
  expect(cerrar.closest('h2')).toHaveTextContent('Recibo de pago digital');
  fireEvent.click(cerrar);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('descarga todos los recibos en un PDF con una pagina por recibo, con un clic', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => [recibo, { ...recibo, numero: 'REC-2026-0043' }] });
  render(<ReciboPagoButton todos label="Todos mis recibos" />);
  fireEvent.click(screen.getByRole('button', { name: 'Todos mis recibos' }));
  await waitFor(() => expect(pdf.save).toHaveBeenCalledWith('Mis-recibos.pdf'));
  expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/mios'), expect.any(Object));
  expect(pdf.addImage).toHaveBeenCalledTimes(2);
  expect(pdf.addPage).toHaveBeenCalledTimes(1);
});

test('notifica errores de emision y exportacion vacia sin descargar archivos', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => [] });
  render(<ReciboPagoButton todos />);
  fireEvent.click(screen.getByRole('button', { name: 'Ver Recibo' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('No tienes recibos pagados');
  expect(pdf.save).not.toHaveBeenCalled();
});

test.each([true, false])('verificacion publica sin token muestra validacion o no encontrado (valido=%s)', async (valido) => {
  global.fetch.mockResolvedValue({
    ok: valido,
    json: async () => valido
      ? { ...recibo.datos, numero: recibo.numero, emitido_en: recibo.emitido_en }
      : { error: 'Comprobante no encontrado' }
  });
  render(<MemoryRouter initialEntries={['/verificar/REC-2026-0042']}>
    <Routes><Route path="/verificar/:numero" element={<VerificarRecibo />} /></Routes>
  </MemoryRouter>);
  expect(await screen.findByRole(valido ? 'status' : 'alert')).toHaveTextContent(valido ? 'Comprobante Válido' : 'Comprobante no encontrado');
  if (valido) expect(screen.getByText('RIF: J-QA')).toBeInTheDocument();
  if (valido) {
    expect(screen.getByText('2.150,00')).toBeInTheDocument();
    expect(screen.getByRole('article').textContent).not.toMatch(/USD|EUR|\$/);
  }
  expect(global.fetch.mock.calls[0][1].headers).toBeUndefined();
  expect(screen.queryByText('Representante QA')).not.toBeInTheDocument();
});
