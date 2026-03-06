const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const logWithTime = (message) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
};

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { msg: 'Demasiados intentos de autenticacion. Intenta nuevamente en unos minutos.' }
});

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { msg: 'Demasiadas solicitudes de escritura. Intenta nuevamente en unos minutos.' }
});

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Origen no permitido por CORS'));
  }
}));
app.use(express.json());
app.use(morgan('dev'));
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return writeLimiter(req, res, next);
  }
  return next();
});
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
}, express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authLimiter, require('./routes/auth'));

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
app.use('/api/uniformes', require('./routes/uniformes'));

module.exports = { app, logWithTime };