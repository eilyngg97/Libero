const fetchOriginal = global.fetch;
let obtenerTasaPagoPorFecha;

beforeEach(() => {
  jest.resetModules();
  ({ obtenerTasaPagoPorFecha } = require('../services/paymentExchangeRate'));
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => [
    { fecha: '2026-10-06', promedio: 872.39 },
    { fecha: '2026-10-07', promedio: 873.87 },
    { fecha: '2026-10-08', promedio: 900 }
  ] });
});

afterEach(() => { global.fetch = fetchOriginal; });

test('selecciona la tasa oficial de la fecha y reutiliza el historico', async () => {
  await expect(obtenerTasaPagoPorFecha('2026-10-07')).resolves.toEqual({ tasa: 873.87, fecha_tasa: '2026-10-07', moneda: 'USD' });
  await expect(obtenerTasaPagoPorFecha('2026-10-06')).resolves.toMatchObject({ tasa: 872.39 });
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('usa la ultima tasa publicada anterior, nunca una posterior', async () => {
  await expect(obtenerTasaPagoPorFecha('2026-10-09')).resolves.toMatchObject({ tasa: 900, fecha_tasa: '2026-10-08' });
  await expect(obtenerTasaPagoPorFecha('2026-10-05')).rejects.toMatchObject({ status: 503 });
});

test('consulta y cachea EUR independientemente de USD', async () => {
  await obtenerTasaPagoPorFecha('2026-10-07');
  await obtenerTasaPagoPorFecha('2026-10-07', 'EUR');
  expect(global.fetch.mock.calls[1][0]).toContain('/historicos/euros/oficial');
});

test.each(['2026-02-30', 'fecha-invalida'])('rechaza fechas invalidas: %s', async (fecha) => {
  await expect(obtenerTasaPagoPorFecha(fecha)).rejects.toMatchObject({ status: 400 });
  expect(global.fetch).not.toHaveBeenCalled();
});

test.each([null, [], [{ fecha: '2026-10-07', promedio: 0 }], [{ fecha: '2026-10-07', promedio: 'NaN' }]])('no inventa tasa cuando el historico es invalido: %j', async (datos) => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => datos });
  await expect(obtenerTasaPagoPorFecha('2026-10-07')).rejects.toMatchObject({ status: 503 });
});

test('un fallo de red bloquea la conversion sin usar una tasa enviada por el cliente', async () => {
  global.fetch.mockRejectedValue(new Error('Sin red'));
  await expect(obtenerTasaPagoPorFecha('2026-10-07')).rejects.toMatchObject({ status: 503 });
});