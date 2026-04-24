export const mediaUrl = (value) => {
  if (!value || typeof value !== 'string') return value;

  const apiBase = String(process.env.REACT_APP_API_URL || '').trim().replace(/\/$/, '');

  if (
    value.startsWith('data:') ||
    value.startsWith('blob:') ||
    value.startsWith('http://') ||
    value.startsWith('https://')
  ) {
    return value;
  }

  if (value.startsWith('/uploads/')) {
    // En dev CRA (3000) + API (4000), resolver contra API para evitar 404.
    if (apiBase) {
      return `${apiBase}${value}`;
    }
    return value;
  }

  return value;
};
