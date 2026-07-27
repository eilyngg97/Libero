import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { ThemeProvider, createTheme } from '@mui/material/styles';

const appTheme = createTheme({
  palette: {
    primary: {
      main: '#1E3A8A',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#D7267A',
      contrastText: '#FFFFFF',
    },
    warning: {
      main: '#FF7A18',
      contrastText: '#FFFFFF',
    },
    info: {
      main: '#00C2C7',
      contrastText: '#0B0F2A',
    },
    background: {
      default: '#FFFFFF',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#0B0F2A',
      secondary: '#1E3A8A',
    },
  },
  components: {
    MuiFormLabel: {
      styleOverrides: {
        root: {
          color: '#64748B',
          '&.Mui-focused': {
            color: '#334155',
          },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: '#64748B',
          '&.Mui-focused': {
            color: '#334155',
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: '#94A3B8',
          },
          '&:hover .MuiOutlinedInput-notchedOutline': {
            borderColor: '#64748B',
          },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: '#475569',
            borderWidth: '1px',
          },
          '&.Mui-disabled .MuiOutlinedInput-notchedOutline': {
            borderColor: '#CBD5E1',
          },
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 700,
          letterSpacing: '0.01em',
        },
        containedSecondary: {
          borderRadius: 999,
          paddingInline: 16,
          color: '#FFFFFF',
          background: 'linear-gradient(90deg, #D7267A 0%, #FF7A18 100%)',
          boxShadow: '0 8px 18px rgba(215, 38, 122, 0.28)',
          '&:hover': {
            background: 'linear-gradient(90deg, #c71f6f 0%, #f56f0f 100%)',
            boxShadow: '0 10px 22px rgba(215, 38, 122, 0.34)',
          },
          '&.Mui-disabled': {
            color: 'rgba(255,255,255,0.74)',
            background: 'linear-gradient(90deg, rgba(215, 38, 122, 0.6) 0%, rgba(255, 122, 24, 0.6) 100%)',
          },
        },
      },
    },
  },
});

const defaultSessionTimeoutMinutes = process.env.NODE_ENV === 'production' ? 10 : 15;
const configuredSessionTimeoutMinutes = Number(process.env.REACT_APP_INACTIVITY_TIMEOUT_MINUTES);
const sessionTimeoutMinutes = Number.isFinite(configuredSessionTimeoutMinutes) && configuredSessionTimeoutMinutes > 0
  ? configuredSessionTimeoutMinutes
  : defaultSessionTimeoutMinutes;
const SESSION_TIMEOUT_MS = sessionTimeoutMinutes * 60 * 1000;

let inactivityTimerId = null;

function clearAuthStorage() {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  localStorage.removeItem('rol');
  localStorage.removeItem('rolActivo');
  localStorage.removeItem('tenantId');
  localStorage.removeItem('sedeSeleccionada');
}

function redirectToLogin(reason = 'expired') {
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const loginPath = `/login?expired=1&reason=${encodeURIComponent(reason)}&redirect=${encodeURIComponent(currentPath)}`;
  if (window.location.pathname !== '/login') {
    window.location.assign(loginPath);
  }
}

function forceLogout(reason = 'expired') {
  clearAuthStorage();
  redirectToLogin(reason);
}

function resetInactivityTimer() {
  if (inactivityTimerId) {
    window.clearTimeout(inactivityTimerId);
    inactivityTimerId = null;
  }

  const token = localStorage.getItem('token');
  if (!token) return;

  inactivityTimerId = window.setTimeout(() => {
    if (!localStorage.getItem('token')) return;
    forceLogout('inactive');
  }, SESSION_TIMEOUT_MS);
}

function initializeSessionInactivityMonitor() {
  const activityEvents = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'];

  activityEvents.forEach((eventName) => {
    window.addEventListener(eventName, resetInactivityTimer, { passive: true });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      resetInactivityTimer();
    }
  });

  window.addEventListener('storage', (event) => {
    if (event.key === 'token') {
      resetInactivityTimer();
    }
  });

  resetInactivityTimer();
}

// Adjunta token automáticamente a llamadas del API para unificar autenticación.
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const apiBase = process.env.REACT_APP_API_URL || window.location.origin;
  const url = typeof input === 'string' ? input : input?.url || '';
  const isApiRequest = url.startsWith(`${apiBase}/api/`) || url.startsWith('/api/');
  const isAuthLoginRequest = url.includes('/api/auth/login');

  if (!isApiRequest) {
    return originalFetch(input, init);
  }

  const headers = new Headers(init.headers || (input && input.headers) || undefined);
  const tenantHost = window.location.host || window.location.hostname || '';
  if (tenantHost && !headers.has('X-Tenant-Host')) {
    headers.set('X-Tenant-Host', tenantHost);
  }

  const token = localStorage.getItem('token');
  const hadTokenAtRequestStart = Boolean(token);
  if (hadTokenAtRequestStart && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await originalFetch(input, { ...init, headers });

  resetInactivityTimer();

  // Si el token expiro, forzamos cierre de sesion para evitar que el usuario
  // quede en estado inconsistente con errores en todas las llamadas.
  if (response.status === 401 && !isAuthLoginRequest && hadTokenAtRequestStart) {
    forceLogout('expired');
  }

  return response;
};

initializeSessionInactivityMonitor();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ThemeProvider theme={appTheme}>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
