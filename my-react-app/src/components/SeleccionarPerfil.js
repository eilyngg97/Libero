import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Avatar, Box, Button, ButtonBase, CircularProgress, Typography } from '@mui/material';
import SportsVolleyballOutlinedIcon from '@mui/icons-material/SportsVolleyballOutlined';
import FamilyRestroomOutlinedIcon from '@mui/icons-material/FamilyRestroomOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';

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
  if (slug === 'entrenador') return '/dashboard-entrenador';
  return '/dashboard';
}

export default function SeleccionarPerfil() {
  const navigate = useNavigate();
  const [loadingRole, setLoadingRole] = useState('');
  const [error, setError] = useState('');
  const selecting = React.useRef(false);
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
    if (!roles.includes(roleSlug) || selecting.current) return;

    selecting.current = true;
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
      if (!data.token || !data.user || (data.user.rolActivo || data.user.rol) !== roleSlug) {
        throw new Error('El servidor no confirmo el perfil seleccionado');
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('usuario', JSON.stringify(data.user));
      localStorage.setItem('rol', data.user.rol);
      localStorage.setItem('rolActivo', data.user.rolActivo || data.user.rol);
      localStorage.removeItem('sedeSeleccionada');
      window.dispatchEvent(new Event('auth-changed'));

      navigate(getRouteByRole(roleSlug), { replace: true });
    } catch (err) {
      setError(err.message || 'No se pudo activar el perfil seleccionado');
    } finally {
      selecting.current = false;
      setLoadingRole('');
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc', backgroundImage: 'linear-gradient(180deg, #ffffff 0%, #f3f5f8 100%)', px: 3, py: 4, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <Box component="img" src="/logo_apex.png" alt="APEX" sx={{ width: 104, height: 104, objectFit: 'contain', mb: 3 }} />
      <Box sx={{ width: '100%', maxWidth: 760, textAlign: 'center', my: 'auto', py: 4 }}>
        <Typography component="h1" sx={{ fontSize: { xs: 28, sm: 36 }, fontWeight: 900, color: '#0B0F2A', mb: 1 }}>
          ¿Con que perfil ingresas?
        </Typography>
        <Typography sx={{ color: '#64748b', mb: 4 }}>{user?.nombre || 'Bienvenido'}</Typography>
        {error ? <Alert severity="error" sx={{ mb: 3, textAlign: 'left' }}>{error}</Alert> : null}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: { xs: 3, sm: 5 } }}>
          {roles.map((rol) => {
            const RoleIcon = rol === 'entrenador' ? SportsVolleyballOutlinedIcon : rol === 'usuario' ? FamilyRestroomOutlinedIcon : AdminPanelSettingsOutlinedIcon;
            const accent = rol === 'entrenador' ? '#df376c' : rol === 'usuario' ? '#15856f' : '#475569';
            return (
              <ButtonBase key={rol} onClick={() => seleccionarPerfil(rol)} disabled={Boolean(loadingRole)} aria-label={`Entrar como ${getRoleLabel(rol)}`}
                sx={{ width: { xs: 128, sm: 160 }, display: 'flex', flexDirection: 'column', gap: 2, borderRadius: 2, p: 1, color: '#334155', '&:hover .profile-avatar, &.Mui-focusVisible .profile-avatar': { outline: `3px solid ${accent}`, outlineOffset: 5 }, '&.Mui-disabled': { opacity: 0.65 } }}>
                <Avatar variant="rounded" className="profile-avatar" sx={{ width: '100%', height: { xs: 112, sm: 144 }, bgcolor: accent, borderRadius: 2, transition: 'outline-offset 150ms' }}>
                  {loadingRole === rol ? <CircularProgress size={36} color="inherit" aria-label="Activando perfil" /> : <RoleIcon sx={{ fontSize: 58 }} />}
                </Avatar>
                <Typography sx={{ fontWeight: 700, fontSize: 16 }}>{getRoleLabel(rol)}</Typography>
              </ButtonBase>
            );
          })}
        </Box>
      </Box>
      <Button startIcon={<LogoutOutlinedIcon />} disabled={Boolean(loadingRole)} onClick={() => {
        ['token', 'usuario', 'rol', 'rolActivo', 'sedeSeleccionada'].forEach((key) => localStorage.removeItem(key));
        window.dispatchEvent(new Event('auth-changed'));
        navigate('/login', { replace: true });
      }} sx={{ color: '#64748b', textTransform: 'none', mt: 4 }}>Cerrar sesion</Button>
    </Box>
  );
}
