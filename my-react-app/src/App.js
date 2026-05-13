import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import Dashboard from './components/Dashboard';
import Uniformes from './components/Uniformes';
import DashboardUsuario from './components/DashboardUsuario';
import PanelOpciones from './components/PanelOpciones';
import PanelOpcionesUsuario from './components/PanelOpcionesUsuario';
import Alumnos from './components/Alumnos';
import Entrenadores from './components/Entrenadores';
import EntrenadoresSedeStaff from './components/EntrenadoresSedeStaff';
import Horarios from './components/Horarios';
import ListadoSolicitudesUniformes from './components/ListadoSolicitudesUniformes';
import PagosAlumno from './components/PagosAlumno';
import Mensualidades from './components/Mensualidades';
import TablaAlumnos from './components/TablaAlumnos';
import Torneos from './components/Torneos';
import TorneoCrear from './components/TorneoCrear';
import Sedes from './components/Sedes';
import Login from './components/Login';
import LandingPage from './components/LandingPage';
import Constancias from './components/Constancias';
import TorneoDetalle from './components/TorneoDetalle';
import GestionReposos from './components/GestionReposos';
import Aspirantes from './components/Aspirantes';
import LandingConfig from './components/LandingConfig';
import PaymentConfig from './components/PaymentConfig';
import GeneralConfig from './components/GeneralConfig';
import ConciliacionBancaria from './components/ConciliacionBancaria';
import Estadisticas from './components/Estadisticas';
import MiPerfil from './components/MiPerfil';
import Recaudos from './components/Recaudos';

import { SedeProvider, useSede } from './context/SedeContext';
import { DolarProvider } from './context/DolarContext';
import './App.css';
import Box from '@mui/material/Box';
import Breadcrumbs from '@mui/material/Breadcrumbs';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
 // Wrapper para pasar location.state a AlumnoEditar si viene de PanelOpcionesUsuario
import AlumnoEditar from './components/AlumnoEditar';
import SolicitudUniforme from './components/SolicitudUniforme';
                      
function BackNavigationButton() {
  const navigate = useNavigate();
  const location = useLocation();

  const rutasSinBotonVolver = ['/dashboard', '/dashboard-usuario', '/panelOpciones'];
  const mostrarBotonVolver = !rutasSinBotonVolver.includes(location.pathname);

  if (!mostrarBotonVolver) return null;

  const usuarioRaw = localStorage.getItem('usuario');
  let usuario = null;
  try {
    usuario = usuarioRaw ? JSON.parse(usuarioRaw) : null;
  } catch (_) {
    usuario = null;
  }

  const rutaFallback = usuario?.rol === 'usuario' ? '/dashboard-usuario' : '/dashboard';

  const handleVolver = () => {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate(rutaFallback);
  };

  return (
    <Box sx={{ mb: 1.25 }}>
      <Button
        variant="text"
        startIcon={<ArrowBackIcon />}
        onClick={handleVolver}
        sx={{
          color: '#64748b',
          fontWeight: 700,
          textTransform: 'none',
          borderRadius: 8,
          px: 0,
          py: 0,
          minWidth: 0,
          fontSize: 16,
          '& .MuiButton-startIcon': {
            mr: 0.6,
            ml: 0,
            '& svg': { fontSize: 18 }
          },
          '&:hover': {
            backgroundColor: 'transparent',
            color: '#334155'
          }
        }}
      >
        Volver
      </Button>
    </Box>
  );
}

function obtenerNombreSede(sede) {
  if (!sede) return '';
  if (typeof sede?.nombre === 'object') {
    return sede.nombre?.nombre || sede.nombre?.label || '';
  }
  return sede?.nombre || sede?.label || '';
}

function SedeBreadcrumb() {
  const location = useLocation();
  const { sedeSeleccionada } = useSede();

  const rutaLabels = [
    { startsWith: '/tabla-alumnos', label: 'Alumnos' },
    { startsWith: '/alumnos', label: 'Alumnos' },
    { startsWith: '/mensualidades', label: 'Mensualidades' },
    { startsWith: '/solicitud-uniforme', label: 'Solicitud de uniformes' },
    { startsWith: '/listado-solicitudes-uniformes', label: 'Solicitud de uniformes' }
  ];

  const match = rutaLabels.find((item) => location.pathname.startsWith(item.startsWith));
  if (!match) return null;

  const sedeNombre = obtenerNombreSede(sedeSeleccionada) || obtenerNombreSede(location.state?.sede) || 'Sin sede seleccionada';

  return (
    <Box sx={{ mb: 1.25 }}>
      <Breadcrumbs separator="›" aria-label="breadcrumb" sx={{ color: '#64748b' }}>
        <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 600 }}>
          Panel
        </Typography>
        <Typography variant="body2" sx={{ color: '#334155', fontWeight: 700 }}>
          {match.label}
        </Typography>
        <Typography variant="body2" sx={{ color: '#0f766e', fontWeight: 700 }}>
          Sede: {sedeNombre}
        </Typography>
      </Breadcrumbs>
    </Box>
  );
}

function RequireSedeSelection({ children }) {
  const { sedeSeleccionada } = useSede();
  const location = useLocation();
  const hasValidSede = Boolean(sedeSeleccionada && sedeSeleccionada._id);

  if (!hasValidSede) {
    return (
      <Navigate
        to="/dashboard"
        replace
        state={{ sedeRequired: true, redirect: location.pathname }}
      />
    );
  }

  return children;
}

function TenantOnlyRoute({ children, allowedTenantIds = [] }) {
  let tenantId = '';
  let rol = '';

  try {
    tenantId = String(localStorage.getItem('tenantId') || '').trim().toLowerCase();
    rol = String(localStorage.getItem('rol') || '').trim().toLowerCase();
  } catch (_) {
    tenantId = '';
    rol = '';
  }

  const isAllowed = allowedTenantIds.map((id) => String(id || '').trim().toLowerCase()).includes(tenantId);
  if (isAllowed) return children;

  return <Navigate to={rol === 'usuario' ? '/dashboard-usuario' : '/dashboard'} replace />;
}

function BlockConstanciasForEsportaUsers({ children }) {
  let tenantId = '';
  let rol = '';

  try {
    tenantId = String(localStorage.getItem('tenantId') || '').trim().toLowerCase();
    rol = String(localStorage.getItem('rol') || '').trim().toLowerCase();
  } catch (_) {
    tenantId = '';
    rol = '';
  }

  if (rol === 'usuario' && tenantId === 'esporta') {
    return <Navigate to="/dashboard-usuario" replace />;
  }

  return children;
}

function TenantHostGate({ children }) {
  const [state, setState] = React.useState({ status: 'loading', message: '' });

  React.useEffect(() => {
    let isActive = true;
    const controller = new AbortController();
    const apiBase = (process.env.REACT_APP_API_URL || window.location.origin).replace(/\/$/, '');

    async function validateTenantHost() {
      try {
        const response = await fetch(`${apiBase}/api/tenant/context`, {
          signal: controller.signal,
          headers: {
            'Cache-Control': 'no-cache'
          }
        });

        let payload = null;
        try {
          payload = await response.json();
        } catch (_) {
          payload = null;
        }

        if (!isActive) return;

        if (!response.ok || !payload?.tenantId) {
          setState({
            status: 'invalid',
            message: payload?.error || 'Este host no está registrado para ningún tenant.'
          });
          return;
        }

        setState({ status: 'ready', message: '' });
      } catch (err) {
        if (!isActive || err.name === 'AbortError') return;
        setState({
          status: 'error',
          message: 'No se pudo validar el tenant del host actual.'
        });
      }
    }

    validateTenantHost();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, []);

  if (state.status === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f8fafc', color: '#0f172a', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 480 }}>
          <h1 style={{ marginBottom: 12 }}>Validando tenant...</h1>
          <p style={{ margin: 0, color: '#475569' }}>Verificando que el host actual esté asociado a una academia registrada.</p>
        </div>
      </div>
    );
  }

  if (state.status === 'invalid' || state.status === 'error') {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#f8fafc', color: '#0f172a', padding: 24 }}>
        <div style={{ width: '100%', maxWidth: 560, background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 20, padding: 28, boxShadow: '0 20px 45px rgba(15, 23, 42, 0.08)' }}>
          <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#b91c1c' }}>Host no autorizado</p>
          <h1 style={{ margin: '0 0 12px', fontSize: 28, lineHeight: 1.1 }}>Este subdominio no está habilitado.</h1>
          <p style={{ margin: '0 0 8px', color: '#334155' }}>{state.message}</p>
          <p style={{ margin: 0, color: '#64748b' }}>Host detectado: {window.location.host}</p>
        </div>
      </div>
    );
  }

  return children;
}

function LandingEntryRoute() {
  const host = window.location.hostname.toLowerCase();
  const allowedLandingHosts = ['villasport.com.ve', 'www.villasport.com.ve', 'localhost', '127.0.0.1'];

  if (!allowedLandingHosts.includes(host)) {
    return <Navigate to="/login" replace />;
  }

  return <LandingPage />;
}

function SinAccesoEntrenador() {
  return (
    <Box sx={{ maxWidth: 720, p: 2, border: '1px solid #e2e8f0', borderRadius: 3, background: '#f8fafc' }}>
      <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a', mb: 1 }}>
        Perfil de entrenador creado
      </Typography>
      <Typography sx={{ color: '#334155' }}>
        Tu usuario rol entrenador existe correctamente, pero todavia no tiene modulos habilitados en esta version.
      </Typography>
    </Box>
  );
}


function App() {
  const [sedeSeleccionada, setSedeSeleccionada] = React.useState(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const adminOnly = ['admin'];
  const userOnly = ['usuario'];
  const adminAndUser = ['admin', 'usuario'];

  function EntrypointAlumnoEditar() {
                          const location = useLocation();
                          // Si viene desde PanelOpcionesUsuario, location.state tendrá alumno y sede
                          return <AlumnoEditar locationState={location.state} />;
                        }

    function SolicitudUniformeWrapper() {
                        const location = useLocation();
                        const alumno = location.state?.alumno || null;
                        const sede = location.state?.sede || null;
                        return <SolicitudUniforme alumno={alumno} sede={sede} />;
                      }

    return (
      <SedeProvider>
        <DolarProvider>
          <Router>
            <TenantHostGate>
              <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/" element={<LandingEntryRoute />} />
              <Route path="/*" element={
                <ProtectedRoute>
                  <div style={{ display: 'flex', width: '100%', maxWidth: '100%', overflowX: 'hidden' }}>
                    <Sidebar
                      variant={isMobile ? 'temporary' : 'permanent'}
                      open={drawerOpen}
                      onClose={() => setDrawerOpen(false)}
                    />
                    <div style={{ flex: 1, minWidth: 0, maxWidth: '100%', minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#FFFFFF', overflowX: 'hidden' }}>
                      <Header
                        onMenuClick={isMobile ? () => setDrawerOpen(true) : undefined}
                      />
                      <main style={{ flex: 1, minWidth: 0, maxWidth: '100%', overflowX: 'hidden', padding: 16, background: '#FFFFFF', color: '#0B0F2A' }}>
                        <BackNavigationButton />
                        <SedeBreadcrumb />
                        <Routes>
                          <Route path="dashboard" element={<ProtectedRoute allowedRoles={adminOnly}><Dashboard /></ProtectedRoute>} />
                          <Route path="sin-acceso" element={<ProtectedRoute allowedRoles={['entrenador']}><SinAccesoEntrenador /></ProtectedRoute>} />
                          <Route path="alumnos" element={<ProtectedRoute allowedRoles={adminOnly}><RequireSedeSelection><Alumnos /></RequireSedeSelection></ProtectedRoute>} />
                          <Route path="entrenadores" element={<ProtectedRoute allowedRoles={adminOnly}><Entrenadores /></ProtectedRoute>} />
                          <Route path="entrenadores-sede" element={<ProtectedRoute allowedRoles={adminOnly}><RequireSedeSelection><EntrenadoresSedeStaff /></RequireSedeSelection></ProtectedRoute>} />
                          <Route path="horarios" element={<ProtectedRoute allowedRoles={adminOnly}><Horarios /></ProtectedRoute>} />
                          <Route path="listado-solicitudes-uniformes" element={<ProtectedRoute allowedRoles={adminOnly}><ListadoSolicitudesUniformes /></ProtectedRoute>} />
                          <Route path="pagos-alumno/:alumnoId" element={<ProtectedRoute allowedRoles={adminAndUser}><PagosAlumno /></ProtectedRoute>} />
                          <Route path="mensualidades" element={<ProtectedRoute allowedRoles={adminOnly}><Mensualidades /></ProtectedRoute>} />
                          <Route path="sedes" element={<ProtectedRoute allowedRoles={adminOnly}><Sedes /></ProtectedRoute>} />
                          <Route path="panelOpciones" element={<ProtectedRoute allowedRoles={adminOnly}><PanelOpciones /></ProtectedRoute>} />
                          <Route path="tabla-alumnos" element={<ProtectedRoute allowedRoles={adminOnly}><RequireSedeSelection><TablaAlumnos /></RequireSedeSelection></ProtectedRoute>} />
                          <Route path="alumno/:id" element={<ProtectedRoute allowedRoles={adminOnly}>{React.createElement(require('./components/AlumnoDetalle').default)}</ProtectedRoute>} />
                          <Route path="alumno/editar/:id" element={<ProtectedRoute allowedRoles={adminOnly}>{React.createElement(require('./components/AlumnoEditar').default)}</ProtectedRoute>} />
                          <Route path="alumno-editar/:id" element={<ProtectedRoute allowedRoles={adminAndUser}><EntrypointAlumnoEditar /></ProtectedRoute>} />
                          <Route path="torneos" element={<ProtectedRoute allowedRoles={adminOnly}><Torneos /></ProtectedRoute>} />
                          <Route path="torneos/crear" element={<ProtectedRoute allowedRoles={adminOnly}><TorneoCrear /></ProtectedRoute>} />
                          <Route path="dashboard-usuario" element={<ProtectedRoute allowedRoles={userOnly}><DashboardUsuario /></ProtectedRoute>} />
                          <Route path="constancias" element={<ProtectedRoute allowedRoles={adminAndUser}><BlockConstanciasForEsportaUsers><Constancias /></BlockConstanciasForEsportaUsers></ProtectedRoute>} />
                          <Route path="panel-opciones-usuario/:alumnoId" element={<ProtectedRoute allowedRoles={userOnly}><PanelOpcionesUsuario /></ProtectedRoute>} />
                          <Route path="solicitud-uniforme" element={<ProtectedRoute allowedRoles={userOnly}><SolicitudUniformeWrapper /></ProtectedRoute>} />
                          <Route path="uniformes" element={<ProtectedRoute allowedRoles={adminOnly}><Uniformes /></ProtectedRoute>} />
                          <Route path="configuracion" element={<ProtectedRoute allowedRoles={adminOnly}><PaymentConfig /></ProtectedRoute>} />
                          <Route path="config-general" element={<ProtectedRoute allowedRoles={adminOnly}><GeneralConfig /></ProtectedRoute>} />
                          <Route path="config-pagos" element={<Navigate to="/configuracion" replace />} />
                          <Route path="aspirantes" element={<ProtectedRoute allowedRoles={adminOnly}><TenantOnlyRoute allowedTenantIds={['villasport']}><Aspirantes /></TenantOnlyRoute></ProtectedRoute>} />
                          <Route path="estadisticas" element={<ProtectedRoute allowedRoles={adminOnly}><Estadisticas /></ProtectedRoute>} />
                          <Route path="config-landing" element={<ProtectedRoute allowedRoles={adminOnly}><TenantOnlyRoute allowedTenantIds={['villasport']}><LandingConfig /></TenantOnlyRoute></ProtectedRoute>} />
                          <Route path="conciliacion-bancaria" element={<ProtectedRoute allowedRoles={adminOnly}><ConciliacionBancaria /></ProtectedRoute>} />
                          <Route path="mi-perfil" element={<ProtectedRoute allowedRoles={adminOnly}><MiPerfil /></ProtectedRoute>} />
                          <Route path="torneos-usuario/:torneoId" element={<ProtectedRoute allowedRoles={userOnly}><TorneoDetalle /></ProtectedRoute>} />
                          <Route path="alumno/reposos/:id" element={<ProtectedRoute allowedRoles={adminOnly}><GestionReposos /></ProtectedRoute>} />
                          <Route path="recaudos" element={<ProtectedRoute allowedRoles={adminAndUser}><Recaudos /></ProtectedRoute>} />
                        </Routes>
                      </main>
                    </div>
                  </div>
                </ProtectedRoute>
              } />
              </Routes>
            </TenantHostGate>
          </Router>
        </DolarProvider>
      </SedeProvider>
    );
}

export default App;
