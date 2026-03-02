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


function getMenuOptions(handleLogout) {
  // Detectar el rol del usuario
  let rol = null;
  try {
    rol = localStorage.getItem('rol');
  } catch {}
  const dashboardPath = rol === 'usuario' ? '/dashboard-usuario' : '/dashboard';
  const options = [
    { text: 'Dashboard', icon: <DashboardIcon />, path: dashboardPath },
    
  ];
  if (rol === 'admin') {
    options.push(
      { text: 'Sedes', icon: <LocationCityIcon />, path: '/sedes' },
      { text: 'Torneos', icon: <EmojiEventsIcon />, path: '/torneos' },
      { text: 'Constancias', icon: <DescriptionIcon />, path: '/constancias' },
      { text: 'Tienda', icon: <CheckroomIcon />, path: '/uniformes' }
    );
  }
  if (rol === 'usuario') {
    options.push(
      { text: 'Mis Torneos', icon: <EmojiEventsIcon />, path: '/torneos-usuario' }
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

  const menuOptions = getMenuOptions(handleLogout);

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
          <Typography variant="h6" noWrap component="div" sx={{ color: '#ff9800', fontWeight: 700 }}>
            Libero.
          </Typography>
        )}
        <IconButton onClick={() => setCollapsed((prev) => !prev)} sx={{ color: '#fff', ml: collapsed ? 0 : 1 }}>
          {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </IconButton>
      </Toolbar>
      <List>
        {menuOptions.map((option) => {
          const selected = location.pathname === option.path;
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
                component={Link}
                to={option.path}
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
                onClick={variant === 'temporary' ? onClose : undefined}
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
