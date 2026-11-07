const SYSTEM_PAYMENT = Object.freeze({ banco: 'BANCAMIGA', cedula: '25894044', telefono: '04125163627' });
const SYSTEM_CONTACT = Object.freeze({ whatsapp: '584125163627', email: 'apexsistema2026@gmail.com' });

function buildTenantSubscription(tenant = {}, tenantId = '') {
  const subscription = tenant.suscripcion || tenant.subscription || tenant.billing || {};
  const rawCost = subscription.costo_mensual_usd ?? subscription.monto_mensual_usd
    ?? subscription.precio_mensual_usd ?? subscription.costo ?? tenant.costo_plan_usd;
  const cost = rawCost === undefined || rawCost === null || rawCost === '' ? null : Number(rawCost);
  return {
    tenantId,
    plan: String(subscription.plan || subscription.nombre_plan || subscription.plan_nombre || tenant.plan || '').trim(),
    costo_mensual_usd: Number.isFinite(cost) && cost >= 0 ? cost : null,
    estado_solvencia: String(subscription.estado_solvencia || subscription.solvencia || subscription.estado_pago || '').trim(),
    proximo_pago: String(subscription.proximo_pago || subscription.fecha_proximo_pago || '').trim(),
    recordatorio_pago_activo: subscription.recordatorio_pago_activo === true,
    datos_pago: {
      banco: subscription.datos_pago?.banco || SYSTEM_PAYMENT.banco,
      cedula: subscription.datos_pago?.cedula || SYSTEM_PAYMENT.cedula,
      telefono: subscription.datos_pago?.telefono || SYSTEM_PAYMENT.telefono
    },
    contacto: {
      whatsapp: subscription.contacto?.whatsapp || SYSTEM_CONTACT.whatsapp,
      email: subscription.contacto?.email || SYSTEM_CONTACT.email
    }
  };
}

function publicTenantContext(tenant) {
  if (!tenant) return null;
  const { suscripcion, subscription, billing, plan, costo_plan_usd, ...publicTenant } = tenant;
  return publicTenant;
}

module.exports = { buildTenantSubscription, publicTenantContext };