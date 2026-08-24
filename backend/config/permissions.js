const PERMISSIONS = [
  'dashboard.view',
  'dashboard.finance',
  'dashboard.stats',
  'constancias.view',
  'constancias.manage',
  'recaudos.view',
  'recaudos.manage',
  'egresos.view',
  'egresos.manage',
  'egresos.approve',
  'egresos.report.view',
  'reglamento.view',
  'reglamento.manage',
  'tienda.view',
  'tienda.manage',
  'solicitudes_constancias.view',
  'solicitudes_constancias.manage',
  'alumnos.view',
  'alumnos.manage',
  'entrenadores.view',
  'entrenadores.manage',
  'mensualidades.view',
  'mensualidades.insolventes.view',
  'mensualidades.manage',
  'solicitudes_uniformes.view',
  'solicitudes_uniformes.manage',
  'sedes.view',
  'sedes.manage',
  'usuarios.manage',
  'roles.manage'
];

const ALL_PERMISSIONS = new Set(PERMISSIONS);

function normalizePermissionList(permisos = []) {
  if (!Array.isArray(permisos)) return [];
  const normalized = permisos
    .map((permiso) => String(permiso || '').trim().toLowerCase())
    .filter(Boolean)
    .filter((permiso) => ALL_PERMISSIONS.has(permiso));

  return Array.from(new Set(normalized));
}

function getSafeRoleSlug(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'rol';
}

function getDefaultPermissionsByLegacyRole(rolRaw = '') {
  const rol = String(rolRaw || '').trim().toLowerCase();

  if (rol === 'super_admin' || rol === 'admin') {
    return [...PERMISSIONS];
  }

  if (rol === 'usuario') {
    return ['constancias.view', 'recaudos.view', 'reglamento.view'];
  }

  if (rol === 'asistente') {
    return [
      'dashboard.view',
      'constancias.view',
      'constancias.manage',
      'recaudos.view',
      'egresos.view',
      'reglamento.view',
      'tienda.view',
      'tienda.manage',
      'solicitudes_constancias.view',
      'alumnos.view',
      'entrenadores.view',
      'mensualidades.view',
      'solicitudes_uniformes.view',
      'sedes.view'
    ];
  }

  return [];
}

module.exports = {
  PERMISSIONS,
  normalizePermissionList,
  getSafeRoleSlug,
  getDefaultPermissionsByLegacyRole
};