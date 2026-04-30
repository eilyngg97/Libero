import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Paper,
  Snackbar,
  TextField,
  Typography
} from '@mui/material';
import Groups2OutlinedIcon from '@mui/icons-material/Groups2Outlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import { mediaUrl } from '../utils/mediaUrl';

const API_BASE = process.env.REACT_APP_API_URL || window.location.origin;

function GeneralConfig() {
  const token = localStorage.getItem('token');
  const [asignandoCategorias, setAsignandoCategorias] = useState(false);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [logoFile, setLogoFile] = useState(null);
  const [logoActual, setLogoActual] = useState('');
  const [logoPreview, setLogoPreview] = useState('');
  const [dragLogoActive, setDragLogoActive] = useState(false);
  const [cambiandoClave, setCambiandoClave] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    clave_actual: '',
    clave_nueva: '',
    confirmar_clave_nueva: ''
  });
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [showPasswords, setShowPasswords] = useState({
    actual: false,
    nueva: false,
    confirmar: false
  });
  const logoInputRef = useRef(null);
  const apiBase = useMemo(() => (process.env.REACT_APP_API_URL || window.location.origin).replace(/\/$/, ''), []);

  const sectionCardSx = {
    p: 2.4,
    borderRadius: 3,
    border: '1px solid #e7ebf3',
    boxShadow: '0 2px 6px rgba(15, 23, 42, 0.03)',
    bgcolor: '#ffffff'
  };

  const sectionHeaderSx = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 1.5,
    mb: 2
  };

  const sectionIconWrapSx = {
    width: 44,
    height: 44,
    borderRadius: 1.6,
    bgcolor: '#eef2fb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#b45309'
  };

  const fieldLabelSx = {
    '& .MuiInputLabel-root': {
      fontSize: 11,
      fontWeight: 800,
      color: '#9aa4b2',
      letterSpacing: '0.03em',
      textTransform: 'uppercase'
    },
    '& .MuiOutlinedInput-root': {
      borderRadius: 2,
      bgcolor: '#ffffff',
      '& fieldset': {
        borderColor: '#e3e8f2'
      },
      '&:hover fieldset': {
        borderColor: '#d4dbe8'
      },
      '&.Mui-focused fieldset': {
        borderColor: '#d4dbe8'
      }
    }
  };

  const orangeButtonSx = {
    textTransform: 'none',
    fontWeight: 800,
    bgcolor: '#ff7a1a',
    px: 3.4,
    '&:hover': {
      bgcolor: '#ea6c11'
    },
    '&.Mui-disabled': {
      bgcolor: '#e6eaf2',
      color: '#a8b0bf'
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

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const cargarBranding = async () => {
      try {
        const res = await fetch(`${apiBase}/api/tenant/context`, {
          signal: controller.signal,
          headers: {
            'Cache-Control': 'no-cache'
          }
        });
        const payload = await res.json().catch(() => null);
        if (!active || !res.ok) return;
        setLogoActual(mediaUrl(payload?.branding?.logoUrl) || '');
      } catch (_) {
        // Si falla, se mantiene el estado actual.
      }
    };

    cargarBranding();

    return () => {
      active = false;
      controller.abort();
    };
  }, [apiBase]);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(logoFile);
    setLogoPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [logoFile]);

  const onSelectLogoFile = (file) => {
    if (!file) return;
    setLogoFile(file);
    setError('');
  };

  const handleLogoClick = () => {
    logoInputRef.current?.click();
  };

  const handleLogoDragOver = (event) => {
    event.preventDefault();
    setDragLogoActive(true);
  };

  const handleLogoDragLeave = (event) => {
    event.preventDefault();
    setDragLogoActive(false);
  };

  const handleLogoDrop = (event) => {
    event.preventDefault();
    setDragLogoActive(false);
    const file = event.dataTransfer.files?.[0];
    onSelectLogoFile(file);
  };

  const togglePasswordVisibility = (key) => {
    setShowPasswords((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const subirLogoAcademia = async () => {
    if (!logoFile) {
      setError('Selecciona una imagen antes de subir el logo.');
      return;
    }

    try {
      setSubiendoLogo(true);
      setError('');
      const formData = new FormData();
      formData.append('logo', logoFile);

      const res = await fetch(`${apiBase}/api/configuracion/logo`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.detalle || 'No se pudo actualizar el logo.');

      setLogoActual(mediaUrl(data?.logoUrl) || logoActual);
      setLogoFile(null);
      setSuccessMessage(data?.message || 'Logo actualizado correctamente.');
    } catch (err) {
      setError(err.message || 'No se pudo subir el logo de la academia.');
    } finally {
      setSubiendoLogo(false);
    }
  };

  const cambiarClave = async () => {
    const payload = {
      clave_actual: String(passwordForm.clave_actual || '').trim(),
      clave_nueva: String(passwordForm.clave_nueva || '').trim(),
      confirmar_clave_nueva: String(passwordForm.confirmar_clave_nueva || '').trim()
    };

    if (!payload.clave_actual || !payload.clave_nueva || !payload.confirmar_clave_nueva) {
      setError('Completa los campos para cambiar la clave.');
      return;
    }

    try {
      setCambiandoClave(true);
      setError('');
      const res = await fetch(`${apiBase}/api/configuracion/cambiar-clave`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.detalle || 'No se pudo cambiar la clave.');

      setPasswordForm({ clave_actual: '', clave_nueva: '', confirmar_clave_nueva: '' });
      setSuccessMessage(data?.message || 'Clave actualizada correctamente.');
    } catch (err) {
      setError(err.message || 'No se pudo cambiar la clave.');
    } finally {
      setCambiandoClave(false);
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

      {/*
      <Paper sx={{ ...sectionCardSx, mb: 2.2 }}>
        <Box sx={sectionHeaderSx}>
          <Box sx={sectionIconWrapSx}>
            <Groups2OutlinedIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 800, color: '#1f2a3d', mb: 0.25 }}>Categorias de alumnos</Typography>
            <Typography sx={{ color: '#637086', fontSize: 13 }}>
              Recalcula y asigna categorias para todos los alumnos activos de la academia usando la fecha de nacimiento.
            </Typography>
          </Box>
        </Box>
        <Button
          variant="contained"
          onClick={() => setConfirmDialogOpen(true)}
          disabled={asignandoCategorias}
          sx={{
            textTransform: 'none',
            fontWeight: 800,
            bgcolor: '#0f172a',
            px: 2.8,
            '&:hover': { bgcolor: '#111b31' },
            '&.Mui-disabled': {
              bgcolor: '#e6eaf2',
              color: '#a8b0bf'
            }
          }}
        >
          {asignandoCategorias ? 'Asignando categorias...' : 'Asignar categorias'}
        </Button>
      </Paper>
      */}

      <Paper sx={{ ...sectionCardSx, mb: 2.2 }}>
        <Box sx={sectionHeaderSx}>
          <Box sx={sectionIconWrapSx}>
            <ImageOutlinedIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 800, color: '#1f2a3d', mb: 0.25 }}>Logo de la academia</Typography>
            <Typography sx={{ color: '#637086', fontSize: 13 }}>
              Sube el logo que se mostrara en el login y branding del tenant actual.
            </Typography>
          </Box>
        </Box>

        <Box sx={{ bgcolor: '#eef2fb', borderRadius: 2.2, px: { xs: 1.6, md: 2 }, py: 2 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '100px 1fr' }, gap: { xs: 2, md: 2.2 }, alignItems: 'center' }}>
            <Box sx={{ display: 'grid', justifyItems: { xs: 'center', md: 'start' } }}>
            <Box
              onDragOver={handleLogoDragOver}
              onDragLeave={handleLogoDragLeave}
              onDrop={handleLogoDrop}
              onClick={handleLogoClick}
              sx={{
                width: 84,
                height: 84,
                borderRadius: '50%',
                border: '1px solid',
                borderColor: dragLogoActive ? '#f97316' : '#d7deec',
                bgcolor: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(15, 23, 42, 0.08)'
              }}
            >
              <input
                ref={logoInputRef}
                type="file"
                hidden
                accept="image/*"
                onChange={(e) => onSelectLogoFile(e.target.files?.[0] || null)}
              />
              {logoPreview || logoActual ? (
                <Box
                  component="img"
                  src={logoPreview || logoActual}
                  alt="Logo academia"
                  sx={{ width: '100%', height: '100%', objectFit: 'contain', p: 1.1 }}
                />
              ) : (
                <Typography sx={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textAlign: 'center', px: 2 }}>
                  Subir logo
                </Typography>
              )}
            </Box>
          </Box>

            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.1 }}>
              <Button
                variant="outlined"
                onClick={handleLogoClick}
                sx={{ textTransform: 'none', fontWeight: 700, borderColor: '#cbd5e1', color: '#516079', minWidth: 188, bgcolor: '#f3f6fc' }}
              >
                Seleccionar imagen
              </Button>
              {logoFile && (
                <Typography sx={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{logoFile.name}</Typography>
              )}
              </Box>
              <Button
                variant="contained"
                onClick={subirLogoAcademia}
                disabled={subiendoLogo || !logoFile}
                sx={{ ...orangeButtonSx, minWidth: 188 }}
              >
                {subiendoLogo ? 'Subiendo logo...' : 'Guardar logo'}
              </Button>
              <Typography sx={{ color: '#738198', fontSize: 11, mt: 0.9, fontStyle: 'italic' }}>
                Formatos permitidos: PNG, JPG (MAX. 2MB)
              </Typography>
            </Box>
          </Box>
        </Box>
      </Paper>

      <Paper sx={sectionCardSx}>
        <Box sx={sectionHeaderSx}>
          <Box sx={sectionIconWrapSx}>
            <SecurityOutlinedIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 800, color: '#1f2a3d', mb: 0.25 }}>Seguridad de usuario</Typography>
            <Typography sx={{ color: '#637086', fontSize: 13 }}>
              Cambia la clave de tu usuario para proteger el acceso a la academia.
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5, mb: 2.4 }}>
          <TextField
            label="Clave actual"
            type={showPasswords.actual ? 'text' : 'password'}
            size="small"
            value={passwordForm.clave_actual}
            onChange={(e) => setPasswordForm((prev) => ({ ...prev, clave_actual: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            sx={fieldLabelSx}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => togglePasswordVisibility('actual')} edge="end" sx={{ color: '#b4bdc9' }}>
                    {showPasswords.actual ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              )
            }}
          />
          <TextField
            label="Nueva clave"
            type={showPasswords.nueva ? 'text' : 'password'}
            size="small"
            value={passwordForm.clave_nueva}
            onChange={(e) => setPasswordForm((prev) => ({ ...prev, clave_nueva: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            sx={fieldLabelSx}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => togglePasswordVisibility('nueva')} edge="end" sx={{ color: '#b4bdc9' }}>
                    {showPasswords.nueva ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              )
            }}
          />
          <TextField
            label="Confirmar nueva clave"
            type={showPasswords.confirmar ? 'text' : 'password'}
            size="small"
            value={passwordForm.confirmar_clave_nueva}
            onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmar_clave_nueva: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            sx={fieldLabelSx}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => togglePasswordVisibility('confirmar')} edge="end" sx={{ color: '#b4bdc9' }}>
                    {showPasswords.confirmar ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              )
            }}
          />
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              onClick={cambiarClave}
              disabled={cambiandoClave}
              sx={orangeButtonSx}
            >
              {cambiandoClave ? 'Actualizando clave...' : 'Cambiar clave'}
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
