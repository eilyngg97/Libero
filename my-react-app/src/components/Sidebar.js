import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import DashboardIcon from '@mui/icons-material/Dashboard';
import LocationCityIcon from '@mui/icons-material/LocationCity';
import CheckroomIcon from '@mui/icons-material/Checkroom';
import LogoutIcon from '@mui/icons-material/Logout';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import DescriptionIcon from '@mui/icons-material/Description';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';


function getMenuOptions(handleLogout, handleDashboardNavigation) {
  // Detectar el rol del usuario
  let rol = null;
  try {
    rol = localStorage.getItem('rol');
  } catch {}
  const dashboardPath = rol === 'usuario' ? '/dashboard-usuario' : '/dashboard';
  const options = [
    { text: 'Dashboard', icon: <DashboardIcon />, path: dashboardPath, onClick: handleDashboardNavigation },
    
  ];
  if (rol === 'admin') {
    options.push(
      { text: 'Sedes', icon: <LocationCityIcon />, path: '/sedes' },
      { text: 'Torneos', icon: <EmojiEventsIcon />, path: '/torneos' },
      { text: 'Constancias', icon: <DescriptionIcon />, path: '/constancias' },
      { text: 'Tienda', icon: <CheckroomIcon />, path: '/uniformes' },
      { text: 'Aspirantes', icon: <PeopleAltIcon />, path: '/aspirantes' },
      { text: 'Config. Landing', icon: <PhotoLibraryIcon />, path: '/config-landing' },
    );
  }
  options.push({ text: 'Cerrar Sesión', icon: <LogoutIcon />, onClick: handleLogout });
  return options;
}



function Sidebar({ variant = 'permanent', open, onClose }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const drawerWidth = collapsed ? 64 : 220;

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('rol');
    localStorage.removeItem('usuario');
    localStorage.removeItem('sedeSeleccionada');
    navigate('/login');
  };

  const handleDashboardNavigation = async () => {
    const rol = localStorage.getItem('rol');
    if (rol !== 'usuario') {
      navigate('/dashboard');
      if (variant === 'temporary' && onClose) onClose();
      return;
    }

    const apiBase = process.env.REACT_APP_API_URL || window.location.origin;
    try {
      const usuario = JSON.parse(localStorage.getItem('usuario') || '{}');
      if (!usuario?.id) {
        navigate('/dashboard-usuario');
        if (variant === 'temporary' && onClose) onClose();
        return;
      }

      let alumnosFinal = [];
      const repRes = await fetch(`${apiBase}/api/representantes/por-usuario/${usuario.id}`);
      const repData = await repRes.json();
      if (repRes.ok && repData && repData._id) {
        const alumRes = await fetch(`${apiBase}/api/alumnos/por-representante/${repData._id}?populateSede=1`);
        const alumData = await alumRes.json();
        if (alumRes.ok && Array.isArray(alumData)) {
          alumnosFinal = alumnosFinal.concat(alumData);
        }
      }

      const alumRes2 = await fetch(`${apiBase}/api/alumnos/por-representante/null?usuarioId=${usuario.id}&populateSede=1`);
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
    } finally {
      if (variant === 'temporary' && onClose) onClose();
    }
  };

  const menuOptions = getMenuOptions(handleLogout, handleDashboardNavigation);

  return (
    <Drawer
      variant={variant}
      open={variant === 'temporary' ? open : undefined}
      onClose={variant === 'temporary' ? onClose : undefined}
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: {
          width: drawerWidth,
          boxSizing: 'border-box',
          background: '#1e293b',
          transition: 'width 0.3s',
          overflowX: 'hidden',
        },
        zIndex: (theme) => (variant === 'temporary' ? theme.zIndex.appBar + 1 : undefined),
      }}
    >
      <Toolbar sx={{ display: 'flex', justifyContent: collapsed ? 'center' : 'space-between', alignItems: 'center', minHeight: 64 }}>
        {!collapsed && (
          <Typography noWrap component="div" sx={{ color: '#ff9800', fontWeight: 'bold', fontSize: '2rem' }}>
            Libero.
          </Typography>
        )}
        <IconButton onClick={() => setCollapsed((prev) => !prev)} sx={{ color: '#fff', ml: collapsed ? 0 : 1 }}>
          {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </IconButton>
      </Toolbar>
      <List>
        {menuOptions.map((option) => {
          const isDashboardOption = option.text === 'Dashboard';
          const selected = isDashboardOption
            ? location.pathname === '/dashboard' || location.pathname === '/dashboard-usuario' || location.pathname.startsWith('/panel-opciones-usuario/')
            : location.pathname === option.path;
          if (option.text === 'Cerrar Sesión') {
            return (
              <ListItem key={option.text} disablePadding sx={{ justifyContent: 'center' }}>
                <ListItemButton
                  onClick={option.onClick}
                  sx={{
                    borderRadius: 2,
                    my: 0.5,
                    minHeight: 48,
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    px: collapsed ? 1 : 2,
                    color: '#fff',
                    backgroundColor: 'transparent',
                    '&:hover': {
                      backgroundColor: 'rgba(255,255,255,0.18)',
                    },
                    position: 'relative',
                  }}
                >
                  <ListItemIcon sx={{ color: '#fff', minWidth: 0, justifyContent: 'center' }}>{option.icon}</ListItemIcon>
                  {!collapsed && <ListItemText primary={option.text} sx={{ color: '#fff', pl: 2 }} />}
                </ListItemButton>
              </ListItem>
            );
          }
          return (
            <ListItem key={option.text} disablePadding sx={{ justifyContent: 'center' }}>
              <ListItemButton
                component={option.onClick ? 'button' : Link}
                to={option.onClick ? undefined : option.path}
                selected={selected}
                sx={{
                  borderRadius: 2,
                  my: 0.5,
                  minHeight: 48,
                  justifyContent: collapsed ? 'center' : 'flex-start',
                  px: collapsed ? 1 : 2,
                  color: '#fff',
                  backgroundColor: selected ? '#452b03a7' : 'transparent',
                  '&:hover': {
                    backgroundColor: 'rgba(72, 42, 2, 0.43)',
                  },
                  position: 'relative',
                  ...(selected && {
                    boxShadow: '0 6px 14px rgba(0,0,0,0.18)',
                    '&:after': {
                      content: '""',
                      position: 'absolute',
                      right: 0,
                      top: 8,
                      bottom: 8,
                      width: '4px',
                      borderRadius: '4px',
                      background: '#ff9800',
                    },
                  }),
                }}
                onClick={option.onClick || (variant === 'temporary' ? onClose : undefined)}
              >
                <ListItemIcon
                  sx={{
                    color: selected ? '#ff9800' : '#fff',
                    minWidth: 0,
                    justifyContent: 'center'
                  }}
                >
                  {option.icon}
                </ListItemIcon>
                {!collapsed && (
                  <ListItemText
                    primary={option.text}
                    sx={{ color: selected ? '#ffffff' : '#fff', pl: 2 }}
                  />
                )}
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Drawer>
  );
}

export default Sidebar;
