export async function fetchSystemSubscription(apiBase, token, signal) {
  const response = await fetch(`${apiBase}/api/tenant/suscripcion`, {
    signal,
    headers: { Authorization: `Bearer ${token}`, 'Cache-Control': 'no-cache' }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.msg || 'No se pudo consultar la suscripción del sistema.');
  return payload;
}

export function formatMonthlyCost(value) {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) || Number(value) < 0) return 'No configurado';
  return `${Number(value).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD / mes`;
}

export function formatSubscriptionDate(value) {
  if (!value) return 'No configurado';
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-VE', { timeZone: 'UTC' });
}

export function startSystemReminderSession(tenantId) {
  const id = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
  sessionStorage.setItem('apex-system-reminder-session', JSON.stringify({ id, tenantId: String(tenantId || '').trim().toLowerCase() }));
}

export function getSubscriptionDueStatus(value, now = new Date()) {
  if (!value) return null;
  const dueDate = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(dueDate.getTime())) return null;
  const formatter = new Intl.DateTimeFormat('en', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' });
  const calendarDay = (date) => {
    const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
    return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  };
  const dueCalendarDay = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const days = Math.round((dueCalendarDay - calendarDay(now)) / 86400000);
  if (days < 0) return { label: `Venció hace ${Math.abs(days)} ${days === -1 ? 'día' : 'días'}`, color: '#b42318', background: '#fef3f2' };
  if (days === 0) return { label: 'Vence hoy', color: '#b45309', background: '#fff3e9' };
  return { label: `Vence en ${days} ${days === 1 ? 'día' : 'días'}`, color: days <= 7 ? '#b45309' : '#475569', background: days <= 7 ? '#fff3e9' : '#f1f5f9' };
}