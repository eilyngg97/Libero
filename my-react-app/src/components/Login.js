import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './Login.css';
import { motion } from 'framer-motion';

import { Box, Paper, Typography, TextField, Button, Snackbar, Alert, InputAdornment, IconButton, Link } from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import logoImage from '../assets/logos/logo_apex.png';
import { mediaUrl } from '../utils/mediaUrl';

const DEFAULT_BRANDING = {
  displayName: 'NOMBRE DE TU CLUB',
  tagline: 'Volleyball Club',
  logoUrl: logoImage
};

function normalizeBranding(payload) {
  const branding = payload?.branding || {};
  const displayName = String(branding.displayName || payload?.tenant?.nombre || '').trim();
  const tagline = String(branding.tagline || '').trim();
  const logoUrl = mediaUrl(branding.logoUrl) || DEFAULT_BRANDING.logoUrl;

  return {
    displayName: displayName || DEFAULT_BRANDING.displayName,
    tagline: tagline || DEFAULT_BRANDING.tagline,
    logoUrl
  };
}


function Login({ onLogin }) {
  const navigate = useNavigate();
  const location = useLocation();
  const apiBase = useMemo(() => (process.env.REACT_APP_API_URL || window.location.origin).replace(/\/$/, ''), []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [openSnackbar, setOpenSnackbar] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [branding, setBranding] = useState(DEFAULT_BRANDING);

  useEffect(() => {
    let isActive = true;
    const controller = new AbortController();

    async function loadTenantBranding() {
      try {
        const response = await fetch(`${apiBase}/api/tenant/context`, {
          signal: controller.signal,
          headers: {
            'Cache-Control': 'no-cache'
          }
        });

        const payload = await response.json().catch(() => null);
        if (!isActive || !response.ok) return;

        setBranding(normalizeBranding(payload));
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }

    loadTenantBranding();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [apiBase]);

  const sessionNotice = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    if (params.get('expired') !== '1') return '';
    const reason = params.get('reason');
    if (reason === 'inactive') {
      return 'Tu sesión se cerró por inactividad. Inicia sesión nuevamente.';
    }
    return 'Tu sesión expiró. Inicia sesión nuevamente.';
  }, [location.search]);

  const redirectAfterLogin = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    const redirect = params.get('redirect') || '';
    if (!redirect.startsWith('/') || redirect.startsWith('//') || redirect.startsWith('/login')) {
      return null;
    }
    return redirect;
  }, [location.search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${apiBase}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || 'Error de autenticación');

      const tenantId = String(data.tenantId || '').trim().toLowerCase();
      const tenantIdPrevio = String(localStorage.getItem('tenantId') || '').trim().toLowerCase();
      if (tenantId && tenantIdPrevio && tenantId !== tenantIdPrevio) {
        localStorage.removeItem('sedeSeleccionada');
      }

      if (tenantId) {
        localStorage.setItem('tenantId', tenantId);
      }

      localStorage.setItem('token', data.token);
      localStorage.setItem('usuario', JSON.stringify(data.user));
      localStorage.setItem('rol', data.user.rol);
      if (onLogin) onLogin(data);

      if (redirectAfterLogin) {
        navigate(redirectAfterLogin, { replace: true });
        return;
      }

      if (data.user.rol === 'usuario') {
        try {
          let alumnosFinal = [];
          const repRes = await fetch(`${apiBase}/api/representantes/por-usuario/${data.user.id}`);
          const repData = await repRes.json();
          if (repRes.ok && repData && repData._id) {
            const alumRes = await fetch(`${apiBase}/api/alumnos/por-representante/${repData._id}?populateSede=1`);
            const alumData = await alumRes.json();
            if (alumRes.ok && Array.isArray(alumData)) {
              alumnosFinal = alumnosFinal.concat(alumData);
            }
          }
          const alumRes2 = await fetch(`${apiBase}/api/alumnos/por-representante/null?usuarioId=${data.user.id}&populateSede=1`);
          const alumData2 = await alumRes2.json();
          if (alumRes2.ok && Array.isArray(alumData2)) {
            alumnosFinal = alumnosFinal.concat(alumData2);
          }
          const alumnosUnicos = alumnosFinal.filter((al, idx, arr) => arr.findIndex(a2 => a2._id === al._id) === idx);
          if (alumnosUnicos.length > 1) {
            navigate('/dashboard-usuario');
          } else if (alumnosUnicos.length === 1) {
            const alumno = alumnosUnicos[0];
            navigate(`/panel-opciones-usuario/${alumno._id}`, {
              state: {
                alumno,
                sede: { nombre: alumno.sede }
              }
            });
          } else {
            navigate('/dashboard-usuario');
          }
        } catch {
          navigate('/dashboard-usuario');
        }
      } else if (data.user.rol === 'entrenador') {
        navigate('/sin-acceso');
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.message);
      setOpenSnackbar(true);
      console.error(err.message);
    }
  };

  return (
    <>
      <Box sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        background:
          'radial-gradient(circle at 14% 18%, rgba(249, 115, 22, 0.18), rgba(249, 115, 22, 0) 34%), radial-gradient(circle at 88% 82%, rgba(14, 116, 144, 0.2), rgba(14, 116, 144, 0) 32%), linear-gradient(136deg, #f8fafc 0%, #eef4fb 44%, #f8fafc 100%)',
        overflow: 'hidden',
        px: 2,
        py: 3
      }}>
        <Box
          component={motion.div}
          initial={{ opacity: 0, x: -30, y: -20 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={{ duration: 0.65 }}
          sx={{
            position: 'absolute',
            width: 420,
            height: 420,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255, 122, 0, 0.2) 0%, rgba(255, 122, 0, 0) 72%)',
            top: -180,
            right: -140,
            zIndex: 0
          }}
        />

        <Box
          component={motion.div}
          initial={{ opacity: 0, x: 30, y: 20 }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          transition={{ duration: 0.7, delay: 0.08 }}
          sx={{
            position: 'absolute',
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(14, 116, 144, 0.2) 0%, rgba(14, 116, 144, 0) 72%)',
            bottom: -180,
            left: -120,
            zIndex: 0
          }}
        />

        <Paper
          component={motion.div}
          initial={{ opacity: 0, y: 30, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55 }}
          elevation={0}
          sx={{
            p: { xs: 2.6, sm: 3.3 },
            width: '100%',
            maxWidth: 430,
            borderRadius: 5,
            background:
              'linear-gradient(145deg, rgba(255, 255, 255, 0.97) 0%, rgba(255, 255, 255, 0.92) 100%), radial-gradient(circle at 100% 0, rgba(249, 115, 22, 0.14), rgba(249, 115, 22, 0) 36%), radial-gradient(circle at 0 100%, rgba(14, 116, 144, 0.1), rgba(14, 116, 144, 0) 40%)',
            border: '1px solid rgba(226, 232, 240, 0.9)',
            boxShadow: '0 26px 54px rgba(15, 23, 42, 0.16)',
            backdropFilter: 'blur(6px)',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: 2
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  background: '#ffffff',
                  border: '1px solid rgba(226, 232, 240, 0.9)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 8px 16px rgba(15, 23, 42, 0.09)'
                }}
              >
                <Box component="img" src={branding.logoUrl} alt={branding.displayName} sx={{ width: 34, height: 34, objectFit: 'contain' }} />
              </Box>
              <Box sx={{ textAlign: 'left' }}>
                <Typography sx={{ fontWeight: 900, color: '#0f172a', letterSpacing: '0.03em', lineHeight: 1 }}>
                  {branding.displayName}
                </Typography>
                <Typography variant="caption" sx={{ color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  {branding.tagline}
                </Typography>
              </Box>
            </Box>
          </Box>

          <Box sx={{ textAlign: 'left' }}>
            <Typography variant="h5" sx={{ fontWeight: 900, color: '#0f172a', mb: 0.4 }}>
              Iniciar Sesión
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748b', lineHeight: 1.6 }}>
              Entra a tu cuenta para gestionar alumnos, pagos y seguimiento académico.
            </Typography>
          </Box>

          {!!sessionNotice && (
            <Alert severity="warning" sx={{ borderRadius: 2 }}>
              {sessionNotice}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ width: '100%' }}>
            <Typography variant="caption" sx={{ color: '#475569', fontWeight: 700 }}>
              Número de identificación
            </Typography>
            <TextField
              label="Cédula"
              variant="outlined"
              fullWidth
              margin="normal"
              size="medium"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
              InputProps={{
                sx: {
                  borderRadius: 3,
                  backgroundColor: '#f8fafc'
                }
              }}
              InputLabelProps={{ sx: { color: '#94a3b8' } }}
            />

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
              <Typography variant="caption" sx={{ color: '#475569', fontWeight: 700 }}>
                Contraseña
              </Typography>
            </Box>

            <TextField
              placeholder="********"
              type={showPassword ? 'text' : 'password'}
              variant="outlined"
              fullWidth
              margin="dense"
              value={password}
              onChange={e => setPassword(e.target.value)}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={showPassword ? 'Ocultar contrasena' : 'Mostrar contrasena'}
                      onClick={() => setShowPassword((prev) => !prev)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOutlinedIcon /> : <VisibilityOffOutlinedIcon />}
                    </IconButton>
                  </InputAdornment>
                ),
                sx: {
                  borderRadius: 3,
                  backgroundColor: '#f8fafc'
                }
              }}
            />

            <Button
              type="submit"
              variant="contained"
              fullWidth
              sx={{
                mt: 1.2,
                fontWeight: 800,
                background: 'linear-gradient(95deg, #ff7a00 0%, #f05a00 100%)',
                '&:hover': { background: 'linear-gradient(95deg, #ea580c 0%, #dc4a00 100%)' },
                color: '#fff',
                borderRadius: 999,
                py: 1.15,
                letterSpacing: '0.07em',
                boxShadow: '0 14px 26px rgba(249, 115, 22, 0.32)'
              }}
            >
              Entrar
            </Button>
          </Box>
        </Paper>
      </Box>
      <Snackbar open={openSnackbar} autoHideDuration={4000} onClose={() => setOpenSnackbar(false)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert onClose={() => setOpenSnackbar(false)} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}

export default Login;
