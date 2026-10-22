const { runWhatsAppTest } = require('../services/whatsappTestService');
const { main } = require('../scripts/whatsappTest');
const originalFetch = global.fetch;
const config = {
  WHATSAPP_TEST_ENABLED: 'true',
  WHATSAPP_GRAPH_VERSION: 'v25.0',
  WHATSAPP_TEST_PHONE_NUMBER_ID: '123456789',
  WHATSAPP_TEST_RECIPIENT: '584141234567',
  WHATSAPP_TEST_TEMPLATE: 'test_template',
  WHATSAPP_TEST_LANGUAGE: 'en_US'
};

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true, json: async () => ({ messages: [{ id: 'wamid.test', message_status: 'accepted' }] })
  });
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

test('esta deshabilitado por defecto', async () => {
  await expect(runWhatsAppTest({ env: {} })).rejects.toThrow('deshabilitada');
  expect(global.fetch).not.toHaveBeenCalled();
});

test('simula sin token, sin red y sin revelar el telefono completo', async () => {
  await expect(runWhatsAppTest({ env: config })).resolves.toEqual({
    mode: 'dry-run', recipient: '***4567', template: 'test_template', language: 'en_US'
  });
  expect(global.fetch).not.toHaveBeenCalled();
});

test.each([
  ['WHATSAPP_TEST_ENABLED', 'false'],
  ['WHATSAPP_GRAPH_VERSION', 'https://other.example'],
  ['WHATSAPP_TEST_PHONE_NUMBER_ID', '../other'],
  ['WHATSAPP_TEST_RECIPIENT', '+584141234567'],
  ['WHATSAPP_TEST_RECIPIENT', '04141234567'],
  ['WHATSAPP_TEST_TEMPLATE', 'Confirmacion de pedido'],
  ['WHATSAPP_TEST_LANGUAGE', ''],
  ['WHATSAPP_TEST_BODY_PARAMETERS', '{bad'],
  ['WHATSAPP_TEST_BODY_PARAMETERS', '{}'],
  ['WHATSAPP_TEST_BODY_PARAMETERS', '[1]'],
  ['WHATSAPP_TEST_BODY_PARAMETERS', '[""]']
])('rechaza configuracion invalida %s=%s antes de enviar', async (key, value) => {
  await expect(runWhatsAppTest({ send: true, env: { ...config, [key]: value } })).rejects.toThrow();
  expect(global.fetch).not.toHaveBeenCalled();
});

test('exige token solo para enviar', async () => {
  await expect(runWhatsAppTest({ send: true, env: config })).rejects.toThrow('WHATSAPP_ACCESS_TOKEN');
  expect(global.fetch).not.toHaveBeenCalled();
});

test('envia exactamente una plantilla al destinatario configurado', async () => {
  const env = { ...config, WHATSAPP_ACCESS_TOKEN: 'secret-test' };
  await expect(runWhatsAppTest({ send: true, env })).resolves.toMatchObject({ mode: 'accepted' });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  const [url, options] = global.fetch.mock.calls[0];
  expect(url).toBe('https://graph.facebook.com/v25.0/123456789/messages');
  expect(options).toMatchObject({
    method: 'POST', redirect: 'error',
    headers: { Authorization: 'Bearer secret-test', 'Content-Type': 'application/json' }
  });
  expect(options.signal).toBeInstanceOf(AbortSignal);
  expect(JSON.parse(options.body)).toEqual({
    messaging_product: 'whatsapp', to: config.WHATSAPP_TEST_RECIPIENT, type: 'template',
    template: { name: 'test_template', language: { code: 'en_US' } }
  });
});

test('incluye los parametros de texto en el orden configurado', async () => {
  await runWhatsAppTest({ send: true, env: {
    ...config, WHATSAPP_ACCESS_TOKEN: 'secret-test', WHATSAPP_TEST_BODY_PARAMETERS: '["Apex","Octubre"]'
  } });
  const body = JSON.parse(global.fetch.mock.calls[0][1].body);
  expect(body.template.components).toEqual([{
    type: 'body', parameters: [{ type: 'text', text: 'Apex' }, { type: 'text', text: 'Octubre' }]
  }]);
});

test.each([400, 401, 403, 429, 500])('informa error HTTP %s sin exponer respuesta de Meta', async (status) => {
  global.fetch.mockResolvedValue({ ok: false, status });
  await expect(runWhatsAppTest({
    send: true, env: { ...config, WHATSAPP_ACCESS_TOKEN: 'secret-test' }
  })).rejects.toThrow(`HTTP ${status}`);
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('no reintenta ni expone errores de transporte con datos sensibles', async () => {
  global.fetch.mockRejectedValue(new Error('secret-test'));
  await expect(runWhatsAppTest({
    send: true, env: { ...config, WHATSAPP_ACCESS_TOKEN: 'secret-test' }
  })).rejects.toThrow('no hay reintentos automaticos');
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test.each([{}, { messages: [] }, { messages: [{ id: '' }] },
  { messages: [{ id: 'wamid.test', message_status: 'held_for_quality_assessment' }] }
])('no afirma aceptacion con respuesta incompleta o retenida %j', async (data) => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => data });
  await expect(runWhatsAppTest({
    send: true, env: { ...config, WHATSAPP_ACCESS_TOKEN: 'secret-test' }
  })).rejects.toThrow('no confirmo');
});

test('informa respuesta no JSON como resultado incierto', async () => {
  global.fetch.mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError('bad'); } });
  await expect(runWhatsAppTest({
    send: true, env: { ...config, WHATSAPP_ACCESS_TOKEN: 'secret-test' }
  })).rejects.toThrow('respuesta no JSON');
});

test('el comando rechaza argumentos desconocidos sin enviar', async () => {
  await expect(main(['--send', '--recipient=other'])).rejects.toThrow('Uso:');
  expect(global.fetch).not.toHaveBeenCalled();
});
