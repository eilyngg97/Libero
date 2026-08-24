import React from 'react';
import { Navigate } from 'react-router-dom';
import { getStoredPermissions, hasAllPermissions, hasAnyPermission } from '../utils/permissions';

function ProtectedRoute({ children, allowedRoles, requiredPermissions = [], requireAllPermissions = true }) {
  const token = localStorage.getItem('token');
  const rol = String(localStorage.getItem('rolActivo') || localStorage.getItem('rol') || '').trim().toLowerCase();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  const rolesPermitidos = Array.isArray(allowedRoles)
    ? allowedRoles.map((item) => String(item || '').trim().toLowerCase())
    : null;

  if (rolesPermitidos && rolesPermitidos.includes('admin') && !rolesPermitidos.includes('super_admin')) {
    rolesPermitidos.push('super_admin');
  }

  const hasRoleAccess = rolesPermitidos ? rolesPermitidos.includes(rol) : null;
  let hasPermissionAccess = null;
  if (Array.isArray(requiredPermissions) && requiredPermissions.length > 0) {
    hasPermissionAccess = requireAllPermissions
      ? hasAllPermissions(requiredPermissions)
      : hasAnyPermission(requiredPermissions);
  }

  const accessDenied = (() => {
    if (hasRoleAccess === null && hasPermissionAccess === null) return false;
    if (hasRoleAccess !== null && hasPermissionAccess !== null) {
      return !hasRoleAccess && !hasPermissionAccess;
    }
    if (hasRoleAccess !== null) return !hasRoleAccess;
    return !hasPermissionAccess;
  })();

  if (accessDenied) {
    const permisos = getStoredPermissions();
    const fallback = (() => {
      if (rol === 'usuario') return '/dashboard-usuario';
      if (rol === 'entrenador') return '/sin-acceso';
      if (permisos.includes('dashboard.view')) return '/dashboard';
      if (permisos.includes('constancias.view')) return '/constancias';
      if (permisos.includes('recaudos.view')) return '/recaudos';
      if (permisos.includes('egresos.view')) return '/egresos';
      if (permisos.includes('reglamento.view')) return '/terminos-condiciones';
      if (permisos.includes('tienda.view')) return '/uniformes';
      return '/login';
    })();
    return <Navigate to={fallback} replace />;
  }

  return children;
}

export default ProtectedRoute;
