const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const { runWhatsAppTest } = require('../services/whatsappTestService');

async function main(args = process.argv.slice(2)) {
  if (args.length > 1 || args.some((arg) => arg !== '--send')) {
    throw new Error('Uso: npm run whatsapp:test [-- --send]');
  }
  const result = await runWhatsAppTest({ send: args.includes('--send') });
  console.log(JSON.stringify(result));
  console.log(result.mode === 'dry-run'
    ? 'Simulacion local: no se envio ningun mensaje ni se valido la cuenta en Meta. Usa -- --send para enviar.'
    : 'Meta acepto la solicitud. Comprueba la llegada en WhatsApp; aceptado no significa entregado.');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Error en prueba WhatsApp: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main };
