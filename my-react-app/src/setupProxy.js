const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function setupProxy(app) {
  const rawTarget = process.env.REACT_APP_API_URL || 'http://localhost:4000';
  let target = 'http://localhost:4000';

  try {
    target = new URL(rawTarget).origin;
  } catch (_) {
    target = 'http://localhost:4000';
  }

  app.use(
    '/uploads',
    createProxyMiddleware({
      target,
      // Mantener Host original (ej: cantevista.localhost:3000)
      // para que backend resuelva correctamente el tenant en /uploads.
      changeOrigin: false,
      xfwd: true,
      secure: false,
      logLevel: 'silent'
    })
  );
};
