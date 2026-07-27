export const mediaUrl = (value) => {
  if (!value || typeof value !== 'string') return value;

  const apiBase = String(process.env.REACT_APP_API_URL || '').trim().replace(/\/$/, '');
  const currentHost = window.location.hostname;
  const isTenantLocalhost = currentHost.endsWith('.localhost');

  if (
    value.startsWith('data:') ||
    value.startsWith('blob:') ||
    value.startsWith('http://') ||
    value.startsWith('https://')
  ) {
    return value;
  }

  if (value.startsWith('/uploads/')) {
    // En local multi-tenant, conservar el subdominio del tenant en el host.
    if (apiBase) {
      try {
        const apiUrl = new URL(apiBase);
        const isApiLocalhost = apiUrl.hostname === 'localhost' || apiUrl.hostname === '127.0.0.1';

        if (isApiLocalhost && isTenantLocalhost) {
          apiUrl.hostname = currentHost;
        }

        return `${apiUrl.origin}${value}`;
      } catch (_) {
        return `${apiBase}${value}`;
      }
    }

    return value;
  }

  return value;
};
