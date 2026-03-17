export const mediaUrl = (value) => {
  if (!value || typeof value !== 'string') return value;

  if (
    value.startsWith('data:') ||
    value.startsWith('blob:') ||
    value.startsWith('http://') ||
    value.startsWith('https://')
  ) {
    return value;
  }

  if (value.startsWith('/uploads/')) {
    const apiBase = (process.env.REACT_APP_API_URL || '').replace(/\/$/, '');
    return apiBase ? `${apiBase}${value}` : value;
  }

  return value;
};
