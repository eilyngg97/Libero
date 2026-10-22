function required(env, name) {
  const value = String(env[name] || '').trim();
  if (!value) throw new Error(`Falta configurar ${name}.`);
  return value;
}

function buildTestRequest(env = process.env) {
  if (env.WHATSAPP_TEST_ENABLED !== 'true') {
    throw new Error('Prueba deshabilitada. Configura WHATSAPP_TEST_ENABLED=true.');
  }

  const version = required(env, 'WHATSAPP_GRAPH_VERSION');
  const phoneNumberId = required(env, 'WHATSAPP_TEST_PHONE_NUMBER_ID');
  const recipient = required(env, 'WHATSAPP_TEST_RECIPIENT');
  const name = required(env, 'WHATSAPP_TEST_TEMPLATE');
  const language = required(env, 'WHATSAPP_TEST_LANGUAGE');
  if (!/^v\d+\.\d+$/.test(version)) throw new Error('WHATSAPP_GRAPH_VERSION invalida.');
  if (!/^\d+$/.test(phoneNumberId)) throw new Error('WHATSAPP_TEST_PHONE_NUMBER_ID invalido.');
  if (!/^[1-9]\d{6,14}$/.test(recipient)) {
    throw new Error('WHATSAPP_TEST_RECIPIENT debe incluir codigo de pais, sin +, espacios ni cero inicial.');
  }
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error('WHATSAPP_TEST_TEMPLATE invalida.');
  if (!/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(language)) {
    throw new Error('WHATSAPP_TEST_LANGUAGE invalido.');
  }

  let parameters;
  try {
    parameters = JSON.parse(env.WHATSAPP_TEST_BODY_PARAMETERS || '[]');
  } catch {
    throw new Error('WHATSAPP_TEST_BODY_PARAMETERS debe ser un arreglo JSON de textos.');
  }
  if (!Array.isArray(parameters) || parameters.some((value) => typeof value !== 'string' || !value.trim())) {
    throw new Error('WHATSAPP_TEST_BODY_PARAMETERS debe ser un arreglo JSON de textos no vacios.');
  }

  const template = { name, language: { code: language } };
  if (parameters.length) {
    template.components = [{
      type: 'body',
      parameters: parameters.map((text) => ({ type: 'text', text }))
    }];
  }

  return {
    url: `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
    body: { messaging_product: 'whatsapp', to: recipient, type: 'template', template }
  };
}

async function runWhatsAppTest({ send = false, env = process.env } = {}) {
  const request = buildTestRequest(env);
  const summary = {
    recipient: `***${request.body.to.slice(-4)}`,
    template: request.body.template.name,
    language: request.body.template.language.code
  };
  if (!send) return { mode: 'dry-run', ...summary };

  const token = required(env, 'WHATSAPP_ACCESS_TOKEN');
  let response;
  try {
    response = await fetch(request.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(request.body),
      signal: AbortSignal.timeout(15000),
      redirect: 'error'
    });
  } catch {
    throw new Error('No se pudo confirmar la solicitud a Meta (red o timeout). Revisa WhatsApp antes de repetir; no hay reintentos automaticos.');
  }

  if (!response.ok) {
    throw new Error(`Meta rechazo la solicitud (HTTP ${response.status}). Revisa el token, los permisos, el destinatario autorizado y la plantilla en el panel de Meta.`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('Meta devolvio una respuesta no JSON. No se pudo confirmar la aceptacion; revisa WhatsApp antes de repetir.');
  }
  const message = data?.messages?.[0];
  if (typeof message?.id !== 'string' || !message.id.trim() ||
      (message.message_status && message.message_status !== 'accepted')) {
    throw new Error('Meta no confirmo la aceptacion del mensaje. Revisa el panel y WhatsApp antes de repetir.');
  }
  return { mode: 'accepted', ...summary };
}

module.exports = { runWhatsAppTest };
