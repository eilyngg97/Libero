require('dotenv').config();
const mongoose = require('mongoose');
const cron = require('node-cron');
const {
  generarMensualidadesMesCore,
  actualizarRetrasadosCore
} = require('./controllers/mensualidadController');
const { app, logWithTime } = require('./app');
const { getMongoUri } = require('./config/secrets');

async function bootstrap() {
  try {
    const mongoUri = getMongoUri();
    await mongoose.connect(mongoUri);
    logWithTime('Conectado a MongoDB');

    try {
      const creadas = await generarMensualidadesMesCore();
      logWithTime(`Catch-up mensualidades generadas: ${creadas}`);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error en catch-up de mensualidades:`, err);
    }

    try {
      const hoy = new Date();
      if (hoy.getDate() >= 6) {
        const actualizadas = await actualizarRetrasadosCore({ force: true });
        logWithTime(`Catch-up retrasados actualizados: ${actualizadas}`);
      }
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Error en catch-up de retrasados:`, err);
    }

    cron.schedule('5 0 1 * *', async () => {
      try {
        const creadas = await generarMensualidadesMesCore();
        logWithTime(`Mensualidades generadas automáticamente: ${creadas}`);
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Error al generar mensualidades automáticamente:`, err);
      }
    });

    cron.schedule('10 0 6 * *', async () => {
      try {
        const actualizadas = await actualizarRetrasadosCore();
        logWithTime(`Mensualidades actualizadas a Retrasado: ${actualizadas}`);
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Error al actualizar mensualidades a Retrasado:`, err);
      }
    });

    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => {
      logWithTime(`Servidor backend escuchando en puerto ${PORT}`);
    });
  } catch (err) {
    console.error(`[${new Date().toISOString()}] Error de conexión a MongoDB:`, err);
  }
}

if (require.main === module) {
  bootstrap();
}

module.exports = { app, bootstrap };
