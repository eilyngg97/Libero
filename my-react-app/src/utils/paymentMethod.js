export function normalizeMetodoPago(value, fallback = 'Pago movil') {
  const raw = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (raw === 'transferencia') return 'Transferencia';
  if (raw === 'efectivo') return 'Efectivo';
  if (raw === 'pagomovil' || raw === 'pago movil') return 'Pago movil';
  return fallback;
}

export function metodoRequiereReferencia(metodo) {
  const metodoNormalizado = normalizeMetodoPago(metodo);
  return metodoNormalizado === 'Transferencia' || metodoNormalizado === 'Pago movil';
}
