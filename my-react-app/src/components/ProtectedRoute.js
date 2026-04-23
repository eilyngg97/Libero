import React from 'react';
import { Navigate } from 'react-router-dom';

function ProtectedRoute({ children, allowedRoles }) {
  const token = localStorage.getItem('token');
  const rol = localStorage.getItem('rol');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(rol)) {
    const fallback = rol === 'usuario'
      ? '/dashboard-usuario'
      : (rol === 'entrenador' ? '/sin-acceso' : '/dashboard');
    return <Navigate to={fallback} replace />;
  }

  return children;
}

export default ProtectedRoute;
