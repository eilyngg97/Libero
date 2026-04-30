const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const path = require('path');
const { tenantResolver } = require('./middleware/tenantResolver');
const { normalizeHost, resolveTenantByHost } = require('./services/tenantResolverService');
const { getTenantConnectionMetrics } = require('./config/tenantBusinessConnection');
const { authMiddleware, rolMiddleware } = require('./middleware/auth');
const { recordRequestMetric, getTenantHealthDashboard } = require('./services/tenantHealthMetrics');
const { getConfiguredDefaultTenantId, getFailSafeTenantId } = require('./services/tenantFallbackService');

const app = express();

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const logWithTime = (message) => {
  console.log(`[${new Date().toISOString()}] ${message}`);
};

function tenantRateLimitKey(req) {
  const tenantId = req.tenantId || 'unknown';
  const rawIp = req.ip || req.connection?.remoteAddress || 'unknown-ip';
  return `${tenantId}:${ipKeyGenerator(rawIp)}`;
}

function getRequestHost(req) {
  const directHost = (
    req.headers['x-tenant-host'] ||
    req.headers['x-forwarded-host'] ||
    req.headers.host ||
    req.hostname ||
    ''
  );

  const normalizedDirectHost = normalizeHost(directHost);
  if (normalizedDirectHost && normalizedDirectHost !== 'localhost' && normalizedDirectHost !== '127.0.0.1') {
    return normalizedDirectHost;
  }

  const originHost = normalizeHost(req.headers.origin || '');
  if (originHost && originHost !== 'localhost' && originHost !== '127.0.0.1') {
    return originHost;
  }

  const refererHost = normalizeHost(req.headers.referer || req.headers.referrer || '');
  if (refererHost && refererHost !== 'localhost' && refererHost !== '127.0.0.1') {
    return refererHost;
  }

  return directHost;
}

function getDefaultTenantId() {
  return getConfiguredDefaultTenantId();
}

function buildTenantBrandingPayload(req) {
  const tenantName = String(req?.tenant?.nombre || process.env.DEFAULT_TENANT_NAME || 'PRUEBA').trim();
  const branding = req?.tenant?.branding || {};

  return {
    displayName: String(branding.displayName || tenantName || 'PRUEBA').trim(),
    tagline: String(branding.tagline || process.env.DEFAULT_TENANT_TAGLINE || 'Volleyball Club').trim(),
    logoUrl: branding.logoUrl || process.env.DEFAULT_TENANT_LOGO_URL || null
  };
}

function getOriginHost(origin) {
  if (!origin) return '';
  try {
    return normalizeHost(new URL(origin).host);
  } catch {
    return '';
  }
}

async function resolveTenantForUploads(req) {
  if (process.env.MULTI_TENANT_MODE !== 'true') {
    return getDefaultTenantId();
  }

  const host = normalizeHost(getRequestHost(req));
  if (!host) return null;

  const tenant = await resolveTenantByHost(host);
  if (tenant?.tenantId) return String(tenant.tenantId).trim().toLowerCase();

  if (process.env.ALLOW_DEFAULT_TENANT_FALLBACK === 'true') {
    return getFailSafeTenantId();
  }

  return null;
}

function getFirstPathSegment(uploadPath = '') {
  const normalized = String(uploadPath || '').replace(/^\/+/, '');
  if (!normalized) return '';
  return normalized.split('/')[0].trim().toLowerCase();
}

function isLegacyUploadFolder(segment) {
  const legacyFolders = new Set(['alumnos', 'comprobantes', 'landing-atletas', 'reposos']);
  return legacyFolders.has(String(segment || '').trim().toLowerCase());
}

async function enforceTenantUploadAccess(req, res, next) {
  try {
    const tenantId = await resolveTenantForUploads(req);
    if (!tenantId) {
      return res.status(404).json({ error: 'Tenant no encontrado para acceso a archivos' });
    }

    const firstSegment = getFirstPathSegment(req.path);
    const defaultTenantId = getDefaultTenantId();

    if (firstSegment === tenantId) {
      res.setHeader('X-Tenant-Id', tenantId);
      return next();
    }

    // Compatibilidad para archivos legacy sin prefijo de tenant, solo en tenant por defecto.
    if (tenantId === defaultTenantId && isLegacyUploadFolder(firstSegment)) {
      res.setHeader('X-Tenant-Id', tenantId);
      return next();
    }

    return res.status(403).json({ error: 'Acceso denegado a archivo de otro tenant' });
  } catch (err) {
    return res.status(503).json({ error: 'No se pudo validar acceso a archivos del tenant' });
  }
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  keyGenerator: tenantRateLimitKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { msg: 'Demasiados intentos de autenticacion. Intenta nuevamente en unos minutos.' }
});

const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  keyGenerator: tenantRateLimitKey,
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

    if (process.env.MULTI_TENANT_MODE !== 'true') {
      callback(new Error('Origen no permitido por CORS'));
      return;
    }

    const originHost = getOriginHost(origin);
    if (!originHost) {
      callback(new Error('Origen no permitido por CORS'));
      return;
    }

    resolveTenantByHost(originHost)
      .then((tenant) => {
        if (tenant?.tenantId) {
          callback(null, true);
          return;
        }
        callback(new Error('Origen no permitido por CORS'));
      })
      .catch((err) => callback(err));
  }
}));

app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const endedAt = process.hrtime.bigint();
    const durationMs = Number(endedAt - startedAt) / 1e6;
    const tenantTag = req.tenantId || 'unknown';

    if (durationMs > Number(process.env.MONITOR_LATENCY_WARN_MS || 1500)) {
      console.warn(
        `[${new Date().toISOString()}] [tenant:${tenantTag}] Slow request ${req.method} ${req.originalUrl} (${durationMs.toFixed(2)}ms)`
      );
    }

    if (res.statusCode >= 500) {
      console.error(
        `[${new Date().toISOString()}] [tenant:${tenantTag}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs.toFixed(2)}ms)`
      );
    }

    recordRequestMetric({
      tenantId: tenantTag,
      durationMs,
      statusCode: res.statusCode,
      slowThresholdMs: Number(process.env.MONITOR_LATENCY_WARN_MS || 1500)
    });
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
}, enforceTenantUploadAccess, express.static(path.join(__dirname, 'uploads')));
app.use('/api', tenantResolver);

app.use('/api/auth', authLimiter, require('./routes/auth'));

app.get('/', (req, res) => res.send('API de gestión deportiva funcionando'));
app.get('/health', (req, res) => {
  const mem = process.memoryUsage();
  const connectionMetrics = getTenantConnectionMetrics();
  res.json({
    status: 'ok',
    uptime_seconds: Math.floor(process.uptime()),
    memory_mb: {
      rss: Number((mem.rss / (1024 * 1024)).toFixed(2)),
      heap_used: Number((mem.heapUsed / (1024 * 1024)).toFixed(2)),
      heap_total: Number((mem.heapTotal / (1024 * 1024)).toFixed(2))
    },
    tenant_connection_metrics: connectionMetrics,
    timestamp: new Date().toISOString()
  });
});
app.get('/api/tenant/context', (req, res) => {
  res.json({
    tenantId: req.tenantId || null,
    tenant: req.tenant || null,
    multiTenantMode: process.env.MULTI_TENANT_MODE === 'true',
    branding: buildTenantBrandingPayload(req)
  });
});
app.get('/api/tenant/health', authMiddleware, rolMiddleware('admin'), (req, res) => {
  const health = getTenantHealthDashboard();
  return res.json(health);
});
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/torneos', require('./routes/torneos'));
app.use('/api/alumnos', require('./routes/alumnos'));
app.use('/api/representantes', require('./routes/representantes'));
app.use('/api/sedes', require('./routes/sedes'));
app.use('/api/mensualidades', require('./routes/mensualidades'));
app.use('/api/pagos', require('./routes/pagos'));
app.use('/api/conciliacion', require('./routes/conciliacion'));
app.use('/api/constancias', require('./routes/constancias'));
app.use('/api/cumpleaneros', require('./routes/cumpleaneros'));
app.use('/api/configuracion', require('./routes/configuracion'));
app.use('/api/uniformes', require('./routes/uniformes'));
app.use('/api/aspirantes', require('./routes/aspirantes'));
app.use('/api/landing', require('./routes/landing'));
app.use('/api/entrenadores', require('./routes/entrenadores'));

app.use((err, req, res, next) => {
  const tenantTag = req?.tenantId || 'unknown';
  console.error(`[${new Date().toISOString()}] [tenant:${tenantTag}] Unhandled error in ${req.method} ${req.originalUrl}:`, err);
  if (res.headersSent) return next(err);
  return res.status(500).json({ error: 'Error interno del servidor' });
});

module.exports = { app, logWithTime };