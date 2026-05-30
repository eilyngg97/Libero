import React from 'react';
import { Navigate } from 'react-router-dom';

function ProtectedRoute({ children, allowedRoles }) {
  const token = localStorage.getItem('token');
  const rol = String(localStorage.getItem('rol') || '').trim().toLowerCase();

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  const rolesPermitidos = Array.isArray(allowedRoles)
    ? allowedRoles.map((item) => String(item || '').trim().toLowerCase())
    : null;

  if (rolesPermitidos && rolesPermitidos.includes('admin') && !rolesPermitidos.includes('super_admin')) {
    rolesPermitidos.push('super_admin');
  }

  if (rolesPermitidos && !rolesPermitidos.includes(rol)) {
    const fallback = rol === 'usuario'
      ? '/dashboard-usuario'
      : (rol === 'entrenador' ? '/sin-acceso' : '/dashboard');
    return <Navigate to={fallback} replace />;
  }

  return children;
}

export default ProtectedRoute;
