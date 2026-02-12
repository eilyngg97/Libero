import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import MenuIcon from '@mui/icons-material/Menu';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';

function Header({ titulo, onMenuClick }) {
  const navigate = useNavigate();
  // Puedes reemplazar la URL por la foto real del usuario
  const userPhoto = 'https://i.pravatar.cc/40?img=3';
  const [anchorEl, setAnchorEl] = useState(null);
  const openMenu = Boolean(anchorEl);
  let usuario = localStorage.getItem('usuario') || '';
  try {
    usuario = usuario ? JSON.parse(usuario) : null;
  } catch (e) {
    usuario = null;
  }
  console.log('usuario localStorage:', usuario);

  const handleMenuClick = (event) => {
    setAnchorEl(event.currentTarget);
  };
  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('rol');
    localStorage.removeItem('usuario');
    setAnchorEl(null);
    navigate('/login');
  };

  return (
    <AppBar position="static" color="inherit" elevation={1} sx={{ mb: 1 }}>
      <Toolbar sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {onMenuClick && (
            <IconButton edge="start" color="inherit" aria-label="menu" onClick={onMenuClick} sx={{ mr: 1, display: { xs: 'inline-flex', md: 'none' } }}>
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" component="div" sx={{ fontWeight: 700, color: '#3a3a3a' }}>
            {titulo || 'Dashboard Academia Voleibol'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="subtitle1" sx={{ color: '#1e293b', fontWeight: 500, mr: 1 }}>
            {usuario && `Bienvenido, ${usuario.nombre}`}
          </Typography>
          <IconButton onClick={handleMenuClick} sx={{ p: 0 }}>
            <Avatar alt="Usuario" src={userPhoto} sx={{ width: 40, height: 40 }} />
            <ArrowDropDownIcon sx={{ color: '#1e293b', ml: 0.5 }} />
          </IconButton>
          <Menu
            anchorEl={anchorEl}
            open={openMenu}
            onClose={handleMenuClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            PaperProps={{ sx: { mt: 1, minWidth: 140 } }}
          >
            <MenuItem onClick={handleLogout}>Cerrar sesión</MenuItem>
          </Menu>
        </Box>
      </Toolbar>
    </AppBar>
  );
}

export default Header;
