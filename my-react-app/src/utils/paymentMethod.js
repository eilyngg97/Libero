export const ADDITIONAL_PAYMENT_METHODS = [
  { id: 'zelle', nombre: 'Zelle', monedas: ['USD'] },
  { id: 'paypal', nombre: 'PayPal', monedas: ['USD', 'EUR'] },
  { id: 'binance', nombre: 'Binance', monedas: ['USD'] }
];

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
  const adicional = ADDITIONAL_PAYMENT_METHODS.find((metodo) => metodo.id === raw);
  if (adicional) return adicional.nombre;
  return fallback;
}

export function metodoRequiereReferencia(metodo) {
  const metodoNormalizado = normalizeMetodoPago(metodo);
  return metodoNormalizado === 'Transferencia' || metodoNormalizado === 'Pago movil'
    || ADDITIONAL_PAYMENT_METHODS.some((item) => item.nombre === metodoNormalizado);
}

export function esMetodoPagoAdicional(value) {
  return ADDITIONAL_PAYMENT_METHODS.some((metodo) => metodo.nombre === normalizeMetodoPago(value));
}

export function referenciaPagoValida(value, metodo) {
  if (!metodoRequiereReferencia(metodo)) return true;
  const referencia = String(value || '').trim();
  return esMetodoPagoAdicional(metodo)
    ? /^[a-zA-Z0-9][a-zA-Z0-9 _./-]{2,99}$/.test(referencia)
    : /^\d{6,}$/.test(referencia);
}
