import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './Login.css';

import { TextField, Button, Snackbar, Alert, AlertTitle, InputAdornment, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import logoImage from '../assets/logos/apex-mark.png';
import { mediaUrl } from '../utils/mediaUrl';
import { startSystemReminderSession } from '../utils/systemSubscription';

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    if (!location.state?.cerrarSesion) return;
    localStorage.removeItem('token');
    localStorage.removeItem('rol');
    localStorage.removeItem('usuario');
    if (location.state.limpiarTenant) {
      localStorage.removeItem('tenantId');
      localStorage.removeItem('sedeSeleccionada');
    }
    navigate(`${location.pathname}${location.search}${location.hash}`, {
      replace: true,
      state: { ...location.state, cerrarSesion: false, limpiarTenant: false }
    });
  }, [location, navigate]);

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
    if (isSubmitting) return;

    const emailNormalizado = String(email || '').trim();
    const passwordNormalizada = String(password || '').trim();

    // Evita errores de autenticacion por espacios accidentales al inicio o final.
    setEmail(emailNormalizado);
    setPassword(passwordNormalizada);

    try {
      setIsSubmitting(true);
      const res = await fetch(`${apiBase}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailNormalizado, password: passwordNormalizada })
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
      startSystemReminderSession(tenantId);
      window.dispatchEvent(new Event('auth-changed'));
      localStorage.setItem('rolActivo', data.user.rolActivo || data.user.rol);
      if (onLogin) onLogin(data);

      if (data?.requiereSeleccionRol && Array.isArray(data?.user?.roles) && data.user.roles.length > 1) {
        navigate('/seleccionar-perfil', { replace: true });
        return;
      }

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
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <main className="apex-login">
        <aside className="login-hero" aria-label="APEX, gestión deportiva">
          <header className="login-platform">
            <div className="login-platform-brand">
              <img src={logoImage} alt="" width="30" height="25" />
              <span>APEX</span>
            </div>
            <p>GESTIÓN DEPORTIVA</p>
          </header>
          <div className="login-hero-message">
            <div className="login-community-badge">
              <span aria-hidden="true" />
              Tu comunidad deportiva, conectada
            </div>
            <h2>Familias y<br />{' '}academias,<br />{' '}<span>un solo equipo.</span></h2>
            <p className="login-hero-description">
              Un espacio para acompañar a cada deportista<br className="login-desktop-break" />
              {' '}y mantener al día la vida de tu academia.
            </p>
          </div>
          <ul className="login-features">
            <li><span>01</span><strong>Comunidad</strong><p>Familias y academias</p></li>
            <li><span>02</span><strong>Pagos</strong><p>Información al día</p></li>
            <li><span>03</span><strong>Seguimiento</strong><p>Cada avance cuenta</p></li>
          </ul>
          <footer className="login-hero-footer">APEX · Conectamos familias y academias.</footer>
        </aside>

        <section className="login-access" aria-labelledby="login-title">
          <div className="login-access-content">
            <div className="login-academy">
              <div className="login-academy-logo">
                <img src={branding.logoUrl} alt={branding.displayName} width="36" height="36" />
              </div>
              <div>
                <p className="login-academy-name">{branding.displayName}</p>
                <p className="login-academy-tagline">{branding.tagline}</p>
              </div>
            </div>
            <h1 id="login-title">Iniciar sesión</h1>
            <p className="login-intro">
              Un espacio para familias, representantes,<br className="login-desktop-break" />
              {' '}administradores y dueños de academias.
            </p>
            {!!sessionNotice && <Alert severity="warning" className="login-session-notice login-notification login-notification-warning">
              <AlertTitle className="login-notification-title">Tu sesión ha finalizado</AlertTitle>
              <span className="login-notification-description">{sessionNotice}</span>
            </Alert>}
            <form className="login-form" onSubmit={handleSubmit}>
              <div className="login-field">
                <label htmlFor="login-identification">Número de identificación</label>
                <TextField
                  id="login-identification"
                  name="username"
                  placeholder="Cédula"
                  autoComplete="username"
                  variant="outlined"
                  fullWidth
                  value={email}
                  disabled={isSubmitting}
                  onChange={e => setEmail(e.target.value)}
                  onBlur={e => setEmail(String(e.target.value || '').trim())}
                />
              </div>
              <div className="login-field">
                <label htmlFor="login-password">Contraseña</label>
                <TextField
                  id="login-password"
                  name="password"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  type={showPassword ? 'text' : 'password'}
                  variant="outlined"
                  fullWidth
                  value={password}
                  disabled={isSubmitting}
                  onChange={e => setPassword(e.target.value)}
                  onBlur={e => setPassword(String(e.target.value || '').trim())}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                          aria-pressed={showPassword}
                          onClick={() => setShowPassword((prev) => !prev)}
                          onMouseDown={(event) => event.preventDefault()}
                          disabled={isSubmitting}
                          edge="end"
                        >
                          {showPassword ? <VisibilityOffOutlinedIcon /> : <VisibilityOutlinedIcon />}
                        </IconButton>
                      </InputAdornment>
                    )
                  }}
                />
              </div>
              <Button className="login-submit" type="submit" variant="contained" fullWidth disabled={isSubmitting}
                endIcon={!isSubmitting && <ArrowForwardRoundedIcon />}>
                {isSubmitting ? 'Ingresando...' : 'Entrar'}
              </Button>
            </form>
            <p className="login-support">
              ¿Necesitas ayuda?{' '}
              <button type="button" className="login-text-button" onClick={() => setShowHelp(true)}>
                Contacta al equipo de soporte.
              </button>
            </p>
          </div>
          <footer className="login-access-footer">Gestión deportiva impulsada por APEX</footer>
        </section>
      </main>
      <Dialog className="login-help-dialog" open={showHelp} onClose={() => setShowHelp(false)}
        aria-labelledby="login-help-title" aria-describedby="login-help-description" maxWidth="xs" fullWidth>
        <div className="login-help-heading">
          <DialogTitle id="login-help-title">Ayuda para ingresar</DialogTitle>
          <IconButton aria-label="Cerrar ayuda" onClick={() => setShowHelp(false)}><CloseRoundedIcon /></IconButton>
        </div>
        <DialogContent className="login-help-content">
          <p id="login-help-description">
            Para recuperar tu contraseña o resolver un problema de acceso, comunícate con la administración de <strong>{branding.displayName}</strong>.
          </p>
          <div className="login-help-academy">
            <img src={branding.logoUrl} alt="" width="40" height="40" />
            <div>
              <span>Tu equipo de apoyo</span>
              <strong>Administración de tu academia</strong>
            </div>
          </div>
          <p className="login-help-hint">El equipo de tu academia podrá ayudarte a restablecer tus credenciales.</p>
        </DialogContent>
        <DialogActions>
          <Button className="login-help-confirm" variant="contained" fullWidth startIcon={<CheckRoundedIcon />}
            onClick={() => setShowHelp(false)}>Entendido</Button>
        </DialogActions>
      </Dialog>
      <Snackbar className="login-notification-toast" open={openSnackbar} autoHideDuration={4000}
        onClose={() => setOpenSnackbar(false)} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert className="login-notification login-notification-error" onClose={() => setOpenSnackbar(false)}
          closeText="Cerrar aviso" severity="error">
          <AlertTitle className="login-notification-title">No pudimos iniciar sesión</AlertTitle>
          <span className="login-notification-description">{error}</span>
        </Alert>
      </Snackbar>
    </>
  );
}

export default Login;
