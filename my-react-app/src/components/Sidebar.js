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
import Collapse from '@mui/material/Collapse';
import DashboardIcon from '@mui/icons-material/Dashboard';
import LocationCityIcon from '@mui/icons-material/LocationCity';
import CheckroomIcon from '@mui/icons-material/Checkroom';
import LogoutIcon from '@mui/icons-material/Logout';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import DescriptionIcon from '@mui/icons-material/Description';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import GavelIcon from '@mui/icons-material/Gavel';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import PhotoLibraryIcon from '@mui/icons-material/PhotoLibrary';
import CelebrationIcon from '@mui/icons-material/Celebration';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import Groups2OutlinedIcon from '@mui/icons-material/Groups2Outlined';
import QueryStatsIcon from '@mui/icons-material/QueryStats';
import SportsIcon from '@mui/icons-material/Sports';
import SettingsIcon from '@mui/icons-material/Settings';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import { hasAnyPermission, hasPermission } from '../utils/permissions';


function getMenuOptions(handleLogout, handleDashboardNavigation) {
  let rol = null;
  let tenantId = '';
  try {
    rol = String(localStorage.getItem('rolActivo') || localStorage.getItem('rol') || '').trim().toLowerCase();
    tenantId = String(localStorage.getItem('tenantId') || '').trim().toLowerCase();
  } catch {}
  const dashboardPath = rol === 'usuario'
    ? '/dashboard-usuario'
    : (rol === 'entrenador' ? '/sin-acceso' : '/dashboard');
  const options = [
    { text: 'Dashboard', icon: <DashboardIcon />, path: dashboardPath, onClick: handleDashboardNavigation },
  ];

  const esAdminLegacy = rol === 'admin' || rol === 'super_admin';
  const canViewConstancias = hasPermission('constancias.view') || esAdminLegacy;
  const canViewRecaudos = hasPermission('recaudos.view') || esAdminLegacy;
  const canViewEgresos = hasPermission('egresos.view') || esAdminLegacy;
  const canViewReglamento = hasPermission('reglamento.view') || esAdminLegacy;
  const canViewTienda = hasPermission('tienda.view') || esAdminLegacy;
  const canViewSolicitudesConstancias = hasPermission('solicitudes_constancias.view') || esAdminLegacy;
  const canManageUsers = rol === 'super_admin';
  const canViewConfiguraciones = esAdminLegacy;
  const canViewSedes = hasAnyPermission(['sedes.view', 'sedes.manage']) || esAdminLegacy;
  const canViewEntrenadores = hasAnyPermission(['entrenadores.view', 'entrenadores.manage']) || esAdminLegacy;
  const canViewEstadisticas = hasPermission('dashboard.stats') || esAdminLegacy;
  const canViewConciliacion = hasPermission('dashboard.finance') || esAdminLegacy;

  if (rol === 'usuario') {
    options.push({ text: 'Recaudos', icon: <FolderOpenIcon />, path: '/recaudos' });
    options.push({ text: 'Reglamento', icon: <GavelIcon />, path: '/terminos-condiciones' });
  } else if (rol !== 'entrenador') {
    if (canViewConstancias) {
      options.push({ text: 'Constancias', icon: <DescriptionIcon />, path: '/constancias' });
    }
    if (tenantId === 'esporta' && canViewSolicitudesConstancias) {
      options.push({ text: 'Solicitudes constancias', icon: <DescriptionIcon />, path: '/solicitudes-constancias' });
    }
    if (canViewRecaudos) {
      options.push({ text: 'Recaudos', icon: <FolderOpenIcon />, path: '/recaudos' });
    }
    if (canViewEgresos) {
      options.push({ text: 'Egresos', icon: <AttachMoneyIcon />, path: '/egresos' });
    }
    if (canViewReglamento) {
      options.push({ text: 'Reglamento', icon: <GavelIcon />, path: '/terminos-condiciones' });
    }
    if (canViewTienda) {
      options.push({ text: 'Tienda', icon: <CheckroomIcon />, path: '/uniformes' });
    }
    if (canManageUsers) {
      options.push({ text: 'Usuarios', icon: <ManageAccountsIcon />, path: '/usuarios' });
    }
  }

  if (canViewSedes) {
    options.push({ text: 'Sedes', icon: <LocationCityIcon />, path: '/sedes' });
  }
  if (canViewEntrenadores) {
    options.push({ text: 'Entrenadores', icon: <SportsIcon />, path: '/entrenadores' });
  }
  if (canViewEstadisticas) {
    options.push({
      text: 'Estadisticas',
      icon: <QueryStatsIcon />,
      children: [
        { text: 'Resumen general', icon: <TrendingUpIcon />, path: '/estadisticas/resumen' },
        { text: 'Reporte financiero', icon: <AssessmentOutlinedIcon />, path: '/estadisticas/financiero' }
      ]
    });
  }
  if (canViewConciliacion) {
    options.push({ text: 'Conciliacion', icon: <AccountBalanceIcon />, path: '/conciliacion-bancaria' });
  }

  if (esAdminLegacy) {
    options.push({ text: 'Publicaciones', icon: <CelebrationIcon />, path: '/publicaciones/cumpleanos' });

    if (canViewConfiguraciones) {
      options.push({
        text: 'Configuraciones',
        icon: <SettingsIcon />,
        children: [
          { text: 'Config. pagos', icon: <AttachMoneyIcon />, path: '/configuracion' },
          { text: 'Constancias', icon: <SettingsIcon />, path: '/config-general' },
          { text: 'Categorias', icon: <Groups2OutlinedIcon />, path: '/config-categorias' },
          { text: 'Catalogo egresos', icon: <AttachMoneyIcon />, path: '/config-catalogo-egresos' }
        ]
      });
    }

    if (tenantId === 'villasport') {
      options.push(
        { text: 'Torneos', icon: <EmojiEventsIcon />, path: '/torneos' },
        { text: 'Aspirantes', icon: <PeopleAltIcon />, path: '/aspirantes' },
        { text: 'Config. Landing', icon: <PhotoLibraryIcon />, path: '/config-landing' }
      );
    }

    if (tenantId === 'esporta' && !options.some((item) => item.path === '/solicitudes-constancias')) {
      options.push({ text: 'Solicitudes constancias', icon: <DescriptionIcon />, path: '/solicitudes-constancias' });
    }
  }

  options.push({ text: 'Cerrar Sesión', icon: <LogoutIcon />, onClick: handleLogout });
  return options;
}



function Sidebar({ variant = 'permanent', open, onClose }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [openSubmenus, setOpenSubmenus] = useState({});

  const drawerWidth = collapsed ? 64 : 220;

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('rol');
    localStorage.removeItem('usuario');
    localStorage.removeItem('tenantId');
    localStorage.removeItem('sedeSeleccionada');
    navigate('/login');
  };

  const handleDashboardNavigation = async () => {
    const rol = String(localStorage.getItem('rolActivo') || localStorage.getItem('rol') || '').trim().toLowerCase();
    if (rol === 'entrenador') {
      navigate('/sin-acceso');
      if (variant === 'temporary' && onClose) onClose();
      return;
    }

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
          background: 'linear-gradient(180deg, #0B0F2A 0%, #131A47 100%)',
          color: '#FFFFFF',
          borderRight: '1px solid rgba(0, 194, 199, 0.24)',
          transition: 'width 0.3s',
          overflowX: 'hidden',
        },
        zIndex: (theme) => (variant === 'temporary' ? theme.zIndex.appBar + 1 : undefined),
      }}
    >
      <Toolbar sx={{ display: 'flex', justifyContent: collapsed ? 'center' : 'space-between', alignItems: 'center', minHeight: 64 }}>
        {!collapsed && (
          <Typography
            noWrap
            component="div"
            sx={{
              color: '#FFFFFF',
              fontWeight: 800,
              letterSpacing: 0.6,
              fontSize: '1.55rem',
              textShadow: '0 0 20px rgba(215, 38, 122, 0.35)',
            }}
          >
            APEX
          </Typography>
        )}
        <IconButton
          onClick={() => setCollapsed((prev) => !prev)}
          sx={{
            color: '#FFFFFF',
            ml: collapsed ? 0 : 1,
            '&:hover': { bgcolor: 'rgba(0, 194, 199, 0.16)' },
          }}
        >
          {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
        </IconButton>
      </Toolbar>
      <List>
        {menuOptions.map((option) => {
          if (Array.isArray(option.children) && option.children.length > 0) {
            const submenuKey = option.text;
            const submenuSelected = option.children.some((child) => location.pathname === child.path || location.pathname.startsWith(`${child.path}/`));
            const submenuOpen = Boolean(openSubmenus[submenuKey] || submenuSelected);

            return (
              <React.Fragment key={option.text}>
                <ListItem disablePadding sx={{ justifyContent: 'center' }}>
                  <ListItemButton
                    onClick={() => {
                      if (collapsed) {
                        const firstPath = option.children[0]?.path;
                        if (firstPath) navigate(firstPath);
                        if (variant === 'temporary' && onClose) onClose();
                        return;
                      }
                      setOpenSubmenus((prev) => ({ ...prev, [submenuKey]: !submenuOpen }));
                    }}
                    selected={submenuSelected}
                    sx={{
                      borderRadius: 2,
                      my: 0.5,
                      minHeight: 48,
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      px: collapsed ? 1 : 2,
                      color: '#FFFFFF',
                      background: submenuSelected
                        ? 'linear-gradient(90deg, rgba(215, 38, 122, 0.96) 0%, rgba(255, 122, 24, 0.92) 100%)'
                        : 'transparent',
                      '&:hover': {
                        backgroundColor: submenuSelected ? undefined : 'rgba(0, 194, 199, 0.15)',
                      },
                      position: 'relative',
                      ...(submenuSelected && {
                        boxShadow: '0 10px 20px rgba(215, 38, 122, 0.28)',
                        '&:after': {
                          content: '""',
                          position: 'absolute',
                          right: 0,
                          top: 8,
                          bottom: 8,
                          width: '4px',
                          borderRadius: '4px',
                          background: '#00C2C7',
                        },
                      }),
                    }}
                  >
                    <ListItemIcon
                      sx={{
                        color: submenuSelected ? '#FFFFFF' : 'rgba(255, 255, 255, 0.86)',
                        minWidth: 0,
                        justifyContent: 'center'
                      }}
                    >
                      {option.icon}
                    </ListItemIcon>
                    {!collapsed && (
                      <>
                        <ListItemText
                          primary={option.text}
                          sx={{ color: submenuSelected ? '#FFFFFF' : 'rgba(255, 255, 255, 0.92)', pl: 2 }}
                        />
                        {submenuOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                      </>
                    )}
                  </ListItemButton>
                </ListItem>

                {!collapsed && (
                  <Collapse in={submenuOpen} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding>
                      {option.children.map((child) => {
                        const childSelected = location.pathname === child.path || location.pathname.startsWith(`${child.path}/`);
                        return (
                          <ListItem key={child.text} disablePadding sx={{ justifyContent: 'center' }}>
                            <ListItemButton
                              component={Link}
                              to={child.path}
                              selected={childSelected}
                              sx={{
                                borderRadius: 2,
                                my: 0.3,
                                ml: 2,
                                minHeight: 42,
                                px: 2,
                                color: '#FFFFFF',
                                backgroundColor: childSelected ? 'rgba(0, 194, 199, 0.18)' : 'transparent',
                                '&:hover': {
                                  backgroundColor: childSelected ? 'rgba(0, 194, 199, 0.22)' : 'rgba(0, 194, 199, 0.12)',
                                }
                              }}
                              onClick={variant === 'temporary' ? onClose : undefined}
                            >
                              <ListItemIcon sx={{ color: childSelected ? '#FFFFFF' : 'rgba(255, 255, 255, 0.86)', minWidth: 0, justifyContent: 'center' }}>
                                {child.icon}
                              </ListItemIcon>
                              <ListItemText primary={child.text} sx={{ color: childSelected ? '#FFFFFF' : 'rgba(255, 255, 255, 0.92)', pl: 2 }} />
                            </ListItemButton>
                          </ListItem>
                        );
                      })}
                    </List>
                  </Collapse>
                )}
              </React.Fragment>
            );
          }

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
                    color: '#FFFFFF',
                    backgroundColor: 'transparent',
                    '&:hover': {
                      backgroundColor: 'rgba(0, 194, 199, 0.15)',
                    },
                    position: 'relative',
                  }}
                >
                  <ListItemIcon sx={{ color: '#FFFFFF', minWidth: 0, justifyContent: 'center' }}>{option.icon}</ListItemIcon>
                  {!collapsed && <ListItemText primary={option.text} sx={{ color: '#FFFFFF', pl: 2 }} />}
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
                  color: '#FFFFFF',
                  background: selected
                    ? 'linear-gradient(90deg, rgba(215, 38, 122, 0.96) 0%, rgba(255, 122, 24, 0.92) 100%)'
                    : 'transparent',
                  '&:hover': {
                    backgroundColor: selected ? undefined : 'rgba(0, 194, 199, 0.15)',
                  },
                  position: 'relative',
                  ...(selected && {
                    boxShadow: '0 10px 20px rgba(215, 38, 122, 0.28)',
                    '&:after': {
                      content: '""',
                      position: 'absolute',
                      right: 0,
                      top: 8,
                      bottom: 8,
                      width: '4px',
                      borderRadius: '4px',
                      background: '#00C2C7',
                    },
                  }),
                }}
                onClick={option.onClick || (variant === 'temporary' ? onClose : undefined)}
              >
                <ListItemIcon
                  sx={{
                    color: selected ? '#FFFFFF' : 'rgba(255, 255, 255, 0.86)',
                    minWidth: 0,
                    justifyContent: 'center'
                  }}
                >
                  {option.icon}
                </ListItemIcon>
                {!collapsed && (
                  <ListItemText
                    primary={option.text}
                    sx={{ color: selected ? '#FFFFFF' : 'rgba(255, 255, 255, 0.92)', pl: 2 }}
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
