import React, { useEffect, useState } from 'react';
import { Box, Button, IconButton, Typography } from '@mui/material';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import CloseIcon from '@mui/icons-material/Close';
import { useNavigate } from 'react-router-dom';

function TerminosPendientesAlert({ sx = {} }) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();
  const apiBase = process.env.REACT_APP_API_URL || window.location.origin;

  useEffect(() => {
    const fetchEstadoTerminos = async () => {
      try {
        const token = localStorage.getItem('token');
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(`${apiBase}/api/terminos-condiciones`, { headers });

        if (!res.ok) {
          setVisible(false);
          return;
        }

        const payload = await res.json().catch(() => ({}));
        const pendiente = Boolean(payload?.termino?._id) && !Boolean(payload?.aceptado);
        setVisible(pendiente);
      } catch {
        setVisible(false);
      }
    };

    fetchEstadoTerminos();
  }, [apiBase]);

  if (!visible || dismissed) return null;

  return (
    <Box
      sx={{
        borderRadius: 2.5,
        border: '1px solid #e9edf3',
        bgcolor: '#ffffff',
        boxShadow: '0 10px 24px rgba(15, 23, 42, 0.08)',
        px: { xs: 1.5, md: 2 },
        py: 1.5,
        display: 'flex',
        gap: 1.5,
        alignItems: 'flex-start',
        overflow: 'hidden',
        ...sx
      }}
    >
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: 2,
          bgcolor: '#fffbe6',
          border: '1px solid #ffe066',
          display: 'grid',
          placeItems: 'center',
          flexShrink: 0,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            width: 90,
            height: 90,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255, 221, 87, 0.65) 0%, rgba(255, 221, 87, 0.32) 55%, rgba(255, 221, 87, 0) 85%)',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 0,
            filter: 'blur(2.5px)'
          }}
        />
        <WarningAmberRoundedIcon sx={{ color: '#e6b800', fontSize: 26, zIndex: 1, position: 'relative' }} />
      </Box>

      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography sx={{ fontWeight: 800, color: '#202124', fontSize: 24, lineHeight: 1.1 }}>
          Recordatorio
        </Typography>
        <Typography sx={{ color: '#5f6368', mt: 0.5, lineHeight: 1.35 }}>
          Debes aceptar el reglamento interno de tu academia para continuar al día con tu cuenta.
        </Typography>
        <Button
          size="small"
          onClick={() => navigate('/terminos-condiciones')}
          sx={{
            mt: 1,
            px: 0,
            minWidth: 0,
            textTransform: 'none',
            fontWeight: 700,
            color: '#111840',
            '&:hover': { bgcolor: 'transparent', color: '#172052' }
          }}
        >
          Revisar ahora
        </Button>
      </Box>

      <IconButton
        size="small"
        onClick={() => setDismissed(true)}
        aria-label="Cerrar alerta"
        sx={{ color: '#9ca3af', mt: -0.2 }}
      >
        <CloseIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}

export default TerminosPendientesAlert;