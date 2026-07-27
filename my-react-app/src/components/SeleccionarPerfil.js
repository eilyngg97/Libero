import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material';

function getRoleLabel(rol = '') {
  const slug = String(rol || '').trim().toLowerCase();
  if (slug === 'usuario') return 'Representante';
  if (slug === 'entrenador') return 'Entrenador';
  if (slug === 'admin') return 'Administrador';
  if (slug === 'super_admin') return 'Super Administrador';
  return slug || 'Perfil';
}

function getRouteByRole(rol = '') {
  const slug = String(rol || '').trim().toLowerCase();
  if (slug === 'usuario') return '/dashboard-usuario';
  if (slug === 'entrenador') return '/sin-acceso';
  return '/dashboard';
}

export default function SeleccionarPerfil() {
  const navigate = useNavigate();
  const [loadingRole, setLoadingRole] = useState('');
  const [error, setError] = useState('');
  const apiBase = useMemo(() => (process.env.REACT_APP_API_URL || window.location.origin).replace(/\/$/, ''), []);

  const { user, roles, token } = useMemo(() => {
    let parsedUser = null;
    try {
      const raw = localStorage.getItem('usuario');
      parsedUser = raw ? JSON.parse(raw) : null;
    } catch (_) {
      parsedUser = null;
    }

    const normalizedRoles = Array.isArray(parsedUser?.roles)
      ? parsedUser.roles.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
      : [];

    const fallbackRole = String(parsedUser?.rol || localStorage.getItem('rol') || '').trim().toLowerCase();
    const finalRoles = normalizedRoles.length > 0 ? normalizedRoles : (fallbackRole ? [fallbackRole] : []);

    return {
      user: parsedUser,
      roles: Array.from(new Set(finalRoles)),
      token: localStorage.getItem('token') || ''
    };
  }, []);

  React.useEffect(() => {
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }

    if (roles.length <= 1) {
      const role = roles[0] || String(localStorage.getItem('rolActivo') || localStorage.getItem('rol') || '').trim().toLowerCase();
      navigate(getRouteByRole(role), { replace: true });
    }
  }, [navigate, roles, token]);

  const seleccionarPerfil = async (rol) => {
    const roleSlug = String(rol || '').trim().toLowerCase();
    if (!roleSlug || loadingRole) return;

    setError('');
    setLoadingRole(roleSlug);
    try {
      const res = await fetch(`${apiBase}/api/auth/select-role`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ rolActivo: roleSlug })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.msg || 'No se pudo activar el perfil seleccionado');
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('usuario', JSON.stringify(data.user));
      localStorage.setItem('rol', data.user.rol);
      localStorage.setItem('rolActivo', data.user.rolActivo || data.user.rol);

      navigate(getRouteByRole(roleSlug), { replace: true });
    } catch (err) {
      setError(err.message || 'No se pudo activar el perfil seleccionado');
    } finally {
      setLoadingRole('');
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: '#f8fafc', px: 2 }}>
      <Paper elevation={0} sx={{ width: '100%', maxWidth: 540, border: '1px solid #e2e8f0', borderRadius: 3, p: { xs: 2.5, md: 3 } }}>
        <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#0f766e', mb: 0.5 }}>
          Bienvenido
        </Typography>
        <Typography variant="h5" sx={{ fontWeight: 900, color: '#0f172a', mb: 0.8 }}>
          ¿Como deseas ingresar hoy?
        </Typography>
        <Typography sx={{ color: '#475569', mb: 2 }}>
          {user?.nombre ? `${user.nombre}, selecciona el perfil que deseas usar en esta sesion.` : 'Selecciona el perfil que deseas usar en esta sesion.'}
        </Typography>

        {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

        <Stack spacing={1.25}>
          {roles.map((rol) => (
            <Button
              key={rol}
              variant="contained"
              onClick={() => seleccionarPerfil(rol)}
              disabled={Boolean(loadingRole)}
              sx={{
                justifyContent: 'space-between',
                textTransform: 'none',
                fontWeight: 800,
                borderRadius: 2,
                px: 2,
                py: 1.15,
                bgcolor: '#0f172a',
                '&:hover': { bgcolor: '#1e293b' }
              }}
            >
              <span>Entrar como {getRoleLabel(rol)}</span>
              <span>{loadingRole === rol ? 'Activando...' : 'Entrar'}</span>
            </Button>
          ))}
        </Stack>
      </Paper>
    </Box>
  );
}
