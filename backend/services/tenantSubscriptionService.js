const SYSTEM_PAYMENT = Object.freeze({ banco: 'BANCAMIGA', cedula: '25894044', telefono: '04125163627' });
const SYSTEM_CONTACT = Object.freeze({ whatsapp: '584125163627', email: 'apexsistema2026@gmail.com' });
const LEGACY_PRICING_TENANTS = Object.freeze(['cantevista', 'fenix', 'esporta']);

function resolveSubscriptionPlan(totalAlumnosActivos, tenantId = '') {
  if (!Number.isSafeInteger(totalAlumnosActivos) || totalAlumnosActivos < 0) {
    throw new Error('Conteo de alumnos activos invalido');
  }
  const costs = LEGACY_PRICING_TENANTS.includes(String(tenantId).trim().toLowerCase())
    ? [15, 25, 40, 50]
    : [20, 35, 50, 70];
  if (totalAlumnosActivos <= 50) return { plan: 'Plan Inicial', costo_mensual_usd: costs[0] };
  if (totalAlumnosActivos <= 100) return { plan: 'Plan Crecimiento', costo_mensual_usd: costs[1] };
  if (totalAlumnosActivos <= 200) return { plan: 'Plan Profesional', costo_mensual_usd: costs[2] };
  return { plan: 'Plan Elite', costo_mensual_usd: costs[3] };
}

function buildTenantSubscription(tenant = {}, tenantId = '', totalAlumnosActivos) {
  const subscription = tenant.suscripcion || tenant.subscription || tenant.billing || {};
  const rawCost = subscription.costo_mensual_usd ?? subscription.monto_mensual_usd
    ?? subscription.precio_mensual_usd ?? subscription.costo ?? tenant.costo_plan_usd;
  const cost = rawCost === undefined || rawCost === null || rawCost === '' ? null : Number(rawCost);
  return {
    tenantId,
    plan: String(subscription.plan || subscription.nombre_plan || subscription.plan_nombre || tenant.plan || '').trim(),
    costo_mensual_usd: Number.isFinite(cost) && cost >= 0 ? cost : null,
    ...(totalAlumnosActivos === undefined ? {} : {
      ...resolveSubscriptionPlan(totalAlumnosActivos, tenantId),
      total_alumnos_activos: totalAlumnosActivos
    }),
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

module.exports = { buildTenantSubscription, publicTenantContext, resolveSubscriptionPlan };