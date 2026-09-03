export const BANCOS_PAGO_MOVIL = [
  { codigo: '0102', nombre: 'BANCO DE VENEZUELA' },
  { codigo: '0105', nombre: 'BANCO MERCANTIL' },
  { codigo: '0108', nombre: 'BANCO PROVINCIAL' },
  { codigo: '0134', nombre: 'BANESCO' },
  { codigo: '0163', nombre: 'BANCO DEL TESORO' },
  { codigo: '0174', nombre: 'BANPLUS' },
  { codigo: '0172', nombre: 'BANCAMIGA' }
];

export function normalizeNombreBanco(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const normalized = raw.toUpperCase();
  const match = BANCOS_PAGO_MOVIL.find((item) => item.nombre === normalized);
  return match?.nombre || raw;
}
