require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const mongoose = require('mongoose');
const cron = require('node-cron');
const path = require('path');
const {
  generarMensualidadesMesCore,
  actualizarRetrasadosCore
} = require('./controllers/mensualidadController');

const app = express();

const logWithTime = (message) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
};

// Middlewares
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, 'uploads')));

// Rutas
app.use('/api/auth', require('./routes/auth'));


// Rutas
app.get('/', (req, res) => res.send('API de gestión deportiva funcionando'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/torneos', require('./routes/torneos'));


app.use('/api/alumnos', require('./routes/alumnos'));
app.use('/api/representantes', require('./routes/representantes'));
app.use('/api/sedes', require('./routes/sedes'));
app.use('/api/mensualidades', require('./routes/mensualidades'));
app.use('/api/pagos', require('./routes/pagos'));
app.use('/api/constancias', require('./routes/constancias'));
app.use('/api/cumpleaneros', require('./routes/cumpleaneros'));

// Uniformes
app.use('/api/uniformes', require('./routes/uniformes'));

// Conexión a MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    logWithTime('Conectado a MongoDB');

    // Catch-up al iniciar: generar mensualidades del mes si faltan
    (async () => {
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
    })();

    // Generar mensualidades el día 1 de cada mes a las 00:05
    cron.schedule('5 0 1 * *', async () => {
      try {
        const creadas = await generarMensualidadesMesCore();
        logWithTime(`Mensualidades generadas automáticamente: ${creadas}`);
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Error al generar mensualidades automáticamente:`, err);
      }
    });

    // Marcar retrasados el día 6 a las 00:10
    cron.schedule('10 0 6 * *', async () => {
      try {
        const actualizadas = await actualizarRetrasadosCore();
        logWithTime(`Mensualidades actualizadas a Retrasado: ${actualizadas}`);
      } catch (err) {
        console.error(`[${new Date().toISOString()}] Error al actualizar mensualidades a Retrasado:`, err);
      }
    });
  })
  .catch(err => console.error(`[${new Date().toISOString()}] Error de conexión a MongoDB:`, err));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  logWithTime(`Servidor backend escuchando en puerto ${PORT}`);
});
