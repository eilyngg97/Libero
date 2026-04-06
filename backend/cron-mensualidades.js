const mongoose = require('mongoose');
require('dotenv').config();
const {
  generarMensualidadesMesCore,
  actualizarRetrasadosCore
} = require('./controllers/mensualidadController');

async function generarMensualidadesMes() {
  const creadas = await generarMensualidadesMesCore();
  console.log(`Mensualidades generadas: ${creadas}`);
}

async function actualizarRetrasados() {
  const actualizadas = await actualizarRetrasadosCore();
  console.log(`Mensualidades actualizadas a Insolvente: ${actualizadas}`);
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  await generarMensualidadesMes();
  await actualizarRetrasados();
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Error ejecutando cron de mensualidades:', error);
    process.exitCode = 1;
  });
}

module.exports = {
  generarMensualidadesMes,
  actualizarRetrasados,
  main
};
