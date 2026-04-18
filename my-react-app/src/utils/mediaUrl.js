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
    // Mantener URL relativa para que el browser use el host del tenant activo.
    return value;
  }

  return value;
};
