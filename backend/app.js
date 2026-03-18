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

app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const endedAt = process.hrtime.bigint();
    const durationMs = Number(endedAt - startedAt) / 1e6;

    if (durationMs > Number(process.env.MONITOR_LATENCY_WARN_MS || 1500)) {
      console.warn(
        `[${new Date().toISOString()}] Slow request ${req.method} ${req.originalUrl} (${durationMs.toFixed(2)}ms)`
      );
    }

    if (res.statusCode >= 500) {
      console.error(
        `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs.toFixed(2)}ms)`
      );
    }
  });
  next();
});

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
app.get('/health', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: 'ok',
    uptime_seconds: Math.floor(process.uptime()),
    memory_mb: {
      rss: Number((mem.rss / (1024 * 1024)).toFixed(2)),
      heap_used: Number((mem.heapUsed / (1024 * 1024)).toFixed(2)),
      heap_total: Number((mem.heapTotal / (1024 * 1024)).toFixed(2))
    },
    timestamp: new Date().toISOString()
  });
});
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
app.use('/api/aspirantes', require('./routes/aspirantes'));

app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] Unhandled error in ${req.method} ${req.originalUrl}:`, err);
  if (res.headersSent) return next(err);
  return res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = { app, logWithTime };