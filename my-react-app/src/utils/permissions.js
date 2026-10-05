const LEGACY_DEFAULT_PERMISSIONS = {
  admin: [
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
    'horarios.view',
    'horarios.manage',
    'mensualidades.view',
    'mensualidades.insolventes.view',
    'mensualidades.manage',
    'solicitudes_uniformes.view',
    'solicitudes_uniformes.manage',
    'sedes.view',
    'sedes.manage',
    'torneos.view',
    'torneos.manage',
    'rosters.view',
    'rosters.manage',
    'aspirantes.view',
    'aspirantes.manage',
    'conciliacion.view',
    'conciliacion.manage',
    'operaciones.view',
    'publicaciones.view',
    'publicaciones.manage',
    'configuracion.view',
    'configuracion.manage',
    'landing.view',
    'landing.manage',
    'usuarios.manage',
    'roles.manage'
  ],
  super_admin: [
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
    'horarios.view',
    'horarios.manage',
    'mensualidades.view',
    'mensualidades.insolventes.view',
    'mensualidades.manage',
    'solicitudes_uniformes.view',
    'solicitudes_uniformes.manage',
    'sedes.view',
    'sedes.manage',
    'torneos.view',
    'torneos.manage',
    'rosters.view',
    'rosters.manage',
    'aspirantes.view',
    'aspirantes.manage',
    'conciliacion.view',
    'conciliacion.manage',
    'operaciones.view',
    'publicaciones.view',
    'publicaciones.manage',
    'configuracion.view',
    'configuracion.manage',
    'landing.view',
    'landing.manage',
    'usuarios.manage',
    'roles.manage'
  ],
  asistente: [
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
    'horarios.view',
    'mensualidades.view',
    'solicitudes_uniformes.view',
    'sedes.view',
    'torneos.view',
    'rosters.view',
    'publicaciones.view'
  ],
  usuario: ['constancias.view', 'recaudos.view', 'reglamento.view'],
  entrenador: []
};

function getStoredUser() {
  try {
    const raw = localStorage.getItem('usuario');
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function normalizePermissionList(permisos = []) {
  if (!Array.isArray(permisos)) return [];
  const normalized = permisos
    .map((permiso) => String(permiso || '').trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function getStoredRole() {
  try {
    return String(localStorage.getItem('rolActivo') || localStorage.getItem('rol') || '').trim().toLowerCase();
  } catch (_) {
    return '';
  }
}

export function getStoredPermissions() {
  const user = getStoredUser();
  const role = getStoredRole();
  const direct = normalizePermissionList(user?.permisos);
  if (Array.isArray(user?.permisos)) {
    if (role === 'admin' || role === 'super_admin') {
      return normalizePermissionList([...direct, ...(LEGACY_DEFAULT_PERMISSIONS[role] || [])]);
    }
    return direct;
  }
  return LEGACY_DEFAULT_PERMISSIONS[role] || [];
}

export function hasPermission(permission) {
  const target = String(permission || '').trim().toLowerCase();
  if (!target) return false;
  return getStoredPermissions().includes(target);
}

export function hasAllPermissions(permissions = []) {
  const required = normalizePermissionList(permissions);
  if (required.length === 0) return true;
  const current = new Set(getStoredPermissions());
  return required.every((permiso) => current.has(permiso));
}

export function hasAnyPermission(permissions = []) {
  const required = normalizePermissionList(permissions);
  if (required.length === 0) return true;
  const current = new Set(getStoredPermissions());
  return required.some((permiso) => current.has(permiso));
}