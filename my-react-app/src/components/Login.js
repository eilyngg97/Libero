import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.css';

import { Box, Paper, Typography, TextField, Button, FormControlLabel, Checkbox, Link, Snackbar, Alert } from '@mui/material';
import SportsVolleyballIcon from '@mui/icons-material/SportsVolleyball';


function Login({ onLogin }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [openSnackbar, setOpenSnackbar] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const apiBase = process.env.REACT_APP_API_URL || window.location.origin;
      const res = await fetch(`${apiBase}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.msg || 'Error de autenticación');
      localStorage.setItem('token', data.token);
      localStorage.setItem('usuario', JSON.stringify(data.user));
      localStorage.setItem('rol', data.user.rol);
      if (onLogin) onLogin(data);
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
        background: 'linear-gradient(135deg, #f8fafc 0%, #edf2f7 40%, #f8fafc 100%)',
        overflow: 'hidden',
        px: 2
      }}>
        <Box sx={{
          position: 'absolute',
          width: 380,
          height: 420,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,122,0,0.18) 0%, rgba(255,122,0,0) 70%)',
          top: -140,
          right: -120,
          zIndex: 0
        }} />
        <Box sx={{
          position: 'absolute',
          width: 380,
          height: 380,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, rgba(59,130,246,0) 70%)',
          bottom: -160,
          left: -120,
          zIndex: 0
        }} />
        <Paper elevation={0} sx={{
          p: 4,
          width: '100%',
          maxWidth: 380,
          borderRadius: 4,
          background: '#ffffff',
          boxShadow: '0 18px 40px rgba(15, 23, 42, 0.12)',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 2
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, justifyContent: 'center' }}>
            <Box
              sx={{
                width: 46,
                height: 46,
                borderRadius: 2,
                background: '#ff7a00',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <SportsVolleyballIcon sx={{ color: '#ffffff', fontSize: 26 }} />
            </Box>
            <Box sx={{ textAlign: 'left' }}>
              <Typography sx={{ fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
                LIBERO
                <Box component="span" sx={{ color: '#ff7a00' }}>
                  .
                </Box>
              </Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                Gestión de la Academia de Voleibol
              </Typography>
            </Box>
          </Box>
          <Box sx={{ textAlign: 'left' }}>
            <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a' }}>
              Iniciar Sesión
            </Typography>
            <Typography variant="body2" sx={{ color: '#94a3b8' }}>
              Accede y gestiona tu academia profesionalmente
            </Typography>
          </Box>
          <form onSubmit={handleSubmit} style={{ width: '100%' }}>
            <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>
              Correo Electronico
            </Typography>
            <TextField
              label="Correo Electronico"
              variant="outlined"
              fullWidth
              margin="normal"
              size="medium"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoFocus
              InputProps={{
                sx: {
                  borderRadius: 4,
                  backgroundColor: '#f1f5f9'
                }
              }}
              InputLabelProps={{ sx: { color: '#94a3b8' } }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>
                Contraseña
              </Typography>
            </Box>
            <TextField
              label=""
              placeholder="********"
              type="password"
              variant="outlined"
              fullWidth
              margin="dense"
              value={password}
              onChange={e => setPassword(e.target.value)}
              InputProps={{
                sx: {
                  borderRadius: 4,
                  backgroundColor: '#f1f5f9'
                }
              }}
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              sx={{
                mt: 2,
                fontWeight: 800,
                backgroundColor: '#f97316',
                '&:hover': { backgroundColor: '#ea580c' },
                color: '#fff',
                borderRadius: 999,
                py: 1.1,
                letterSpacing: '0.08em'
              }}
            >
              Entrar
            </Button>
          </form>
          <Typography variant="caption" sx={{ textAlign: 'center', color: '#94a3b8' }}>
            <Link href="/#inicio" sx={{ color: '#f97316', fontWeight: 700, textDecoration: 'none' }}>
              Volver a nuestro sitio web
            </Link>
          </Typography>
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
