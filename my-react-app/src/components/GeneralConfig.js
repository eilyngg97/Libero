import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Snackbar,
  Typography
} from '@mui/material';

const API_BASE = process.env.REACT_APP_API_URL || window.location.origin;

function GeneralConfig() {
  const token = localStorage.getItem('token');
  const [asignandoCategorias, setAsignandoCategorias] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const sectionCardSx = {
    position: 'relative',
    p: 2.2,
    pt: 2.6,
    borderRadius: 3,
    border: '1px solid #e2e8f0',
    boxShadow: '0 12px 26px rgba(15, 23, 42, 0.06)',
    overflow: 'hidden',
    bgcolor: '#ffffff',
    '&::before': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 7,
      background: 'linear-gradient(90deg, #64748b 0%, #334155 100%)'
    }
  };

  const asignarCategorias = async () => {
    try {
      setAsignandoCategorias(true);
      setError('');
      const res = await fetch(`${API_BASE}/api/alumnos/asignar-categorias`, {
        method: 'PUT',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'No se pudieron asignar las categorias');
      setSuccessMessage(data?.message || 'Categorias asignadas correctamente');
    } catch (err) {
      setError(err.message || 'No se pudieron asignar las categorias');
    } finally {
      setAsignandoCategorias(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
      <Snackbar
        open={!!successMessage}
        autoHideDuration={3000}
        onClose={() => setSuccessMessage('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setSuccessMessage('')} severity="success" sx={{ width: '100%' }}>
          {successMessage}
        </Alert>
      </Snackbar>

      <Typography sx={{ fontSize: { xs: 24, md: 30 }, fontWeight: 900, color: '#0f172a', mb: 0.5 }}>
        Configuracion general
      </Typography>
      <Typography sx={{ color: '#475569', mb: 2.5 }}>
        Acciones globales de la academia que no dependen de una sede en particular.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      <Paper sx={sectionCardSx}>
        <Typography sx={{ fontWeight: 800, color: '#0f172a', mb: 0.8 }}>Categorias de alumnos</Typography>
        <Typography sx={{ color: '#64748b', fontSize: 13, mb: 1.8 }}>
          Recalcula y asigna categorias para todos los alumnos activos de la academia usando la fecha de nacimiento.
        </Typography>
        <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
          <Button
            variant="outlined"
            onClick={() => setConfirmDialogOpen(true)}
            disabled={asignandoCategorias}
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              borderColor: '#cbd5e1',
              color: '#475569'
            }}
          >
            {asignandoCategorias ? 'Asignando categorias...' : 'Asignar categorias'}
          </Button>
        </Box>
      </Paper>

      <Dialog
        open={confirmDialogOpen}
        onClose={() => !asignandoCategorias && setConfirmDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0f172a' }}>
          Asignar categorias
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#475569', fontSize: 14 }}>
            Esta accion actualizara las categorias de todos los alumnos activos de la academia segun su fecha de nacimiento.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setConfirmDialogOpen(false)}
            disabled={asignandoCategorias}
            sx={{ textTransform: 'none' }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              await asignarCategorias();
              setConfirmDialogOpen(false);
            }}
            disabled={asignandoCategorias}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            {asignandoCategorias ? 'Asignando...' : 'Confirmar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default GeneralConfig;
