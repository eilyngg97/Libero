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
import ConciliacionBancaria from './components/ConciliacionBancaria';

import { SedeProvider } from './context/SedeContext';
import { DolarProvider } from './context/DolarContext';
import './App.css';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
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
          color: '#1e3a8a',
          fontWeight: 700,
          textTransform: 'none',
          borderRadius: 999,
          px: 1.25,
          minWidth: 0,
          '&:hover': { bgcolor: '#eff6ff' }
        }}
      >
        Volver
      </Button>
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
            <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<LandingPage />} />
            <Route path="/*" element={
              <ProtectedRoute>
                <div style={{ display: 'flex' }}>
                  <Sidebar
                    variant={isMobile ? 'temporary' : 'permanent'}
                    open={drawerOpen}
                    onClose={() => setDrawerOpen(false)}
                  />
                  <div style={{ flex: 1, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
                    <Header
                      onMenuClick={isMobile ? () => setDrawerOpen(true) : undefined}
                    />
                    <main style={{ flex: 1, padding: 16 }}>
                      <BackNavigationButton />
                      <Routes>
                        <Route path="dashboard" element={<ProtectedRoute allowedRoles={adminOnly}><Dashboard /></ProtectedRoute>} />
                        <Route path="alumnos" element={<ProtectedRoute allowedRoles={adminOnly}><Alumnos /></ProtectedRoute>} />
                        <Route path="entrenadores" element={<ProtectedRoute allowedRoles={adminOnly}><Entrenadores /></ProtectedRoute>} />
                        <Route path="horarios" element={<ProtectedRoute allowedRoles={adminOnly}><Horarios /></ProtectedRoute>} />
                        <Route path="listado-solicitudes-uniformes" element={<ProtectedRoute allowedRoles={adminOnly}><ListadoSolicitudesUniformes /></ProtectedRoute>} />
                        <Route path="pagos-alumno/:alumnoId" element={<ProtectedRoute allowedRoles={adminAndUser}><PagosAlumno /></ProtectedRoute>} />
                        <Route path="mensualidades" element={<ProtectedRoute allowedRoles={adminOnly}><Mensualidades /></ProtectedRoute>} />
                        <Route path="sedes" element={<ProtectedRoute allowedRoles={adminOnly}><Sedes /></ProtectedRoute>} />
                        <Route path="panelOpciones" element={<ProtectedRoute allowedRoles={adminOnly}><PanelOpciones /></ProtectedRoute>} />
                        <Route path="tabla-alumnos" element={<ProtectedRoute allowedRoles={adminOnly}><TablaAlumnos /></ProtectedRoute>} />
                        <Route path="alumno/:id" element={<ProtectedRoute allowedRoles={adminOnly}>{React.createElement(require('./components/AlumnoDetalle').default)}</ProtectedRoute>} />
                        <Route path="alumno/editar/:id" element={<ProtectedRoute allowedRoles={adminOnly}>{React.createElement(require('./components/AlumnoEditar').default)}</ProtectedRoute>} />
                        <Route path="alumno-editar/:id" element={<ProtectedRoute allowedRoles={adminAndUser}><EntrypointAlumnoEditar /></ProtectedRoute>} />
                        <Route path="torneos" element={<ProtectedRoute allowedRoles={adminOnly}><Torneos /></ProtectedRoute>} />
                        <Route path="torneos/crear" element={<ProtectedRoute allowedRoles={adminOnly}><TorneoCrear /></ProtectedRoute>} />
                        <Route path="dashboard-usuario" element={<ProtectedRoute allowedRoles={userOnly}><DashboardUsuario /></ProtectedRoute>} />
                        <Route path="constancias" element={<ProtectedRoute allowedRoles={adminAndUser}><Constancias /></ProtectedRoute>} />
                        <Route path="panel-opciones-usuario/:alumnoId" element={<ProtectedRoute allowedRoles={userOnly}><PanelOpcionesUsuario /></ProtectedRoute>} />
                        <Route path="solicitud-uniforme" element={<ProtectedRoute allowedRoles={userOnly}><SolicitudUniformeWrapper /></ProtectedRoute>} />
                        <Route path="uniformes" element={<ProtectedRoute allowedRoles={adminOnly}><Uniformes /></ProtectedRoute>} />
                        <Route path="aspirantes" element={<ProtectedRoute allowedRoles={adminOnly}><Aspirantes /></ProtectedRoute>} />
                        <Route path="config-landing" element={<ProtectedRoute allowedRoles={adminOnly}><LandingConfig /></ProtectedRoute>} />
                        <Route path="conciliacion-bancaria" element={<ProtectedRoute allowedRoles={adminOnly}><ConciliacionBancaria /></ProtectedRoute>} />
                        <Route path="torneos-usuario/:torneoId" element={<ProtectedRoute allowedRoles={userOnly}><TorneoDetalle /></ProtectedRoute>} />
                        <Route path="alumno/reposos/:id" element={<ProtectedRoute allowedRoles={adminOnly}><GestionReposos /></ProtectedRoute>} />
                      </Routes>
                    </main>
                  </div>
                </div>
              </ProtectedRoute>
            } />
            </Routes>
          </Router>
        </DolarProvider>
      </SedeProvider>
    );
}

export default App;
