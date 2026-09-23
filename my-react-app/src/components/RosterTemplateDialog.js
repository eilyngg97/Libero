import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  TextField,
  Typography
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import { mediaUrl } from '../utils/mediaUrl';

const DEFAULT_FORM = {
  header_title: 'ROSTER',
  texto_institucional: [
    'FEDERACION VENEZOLANA DE VOLEIBOL',
    'ASOCIACION DE VOLEIBOL DEL ESTADO LARA',
    'LIGA DE INICIACION DE VOLEIBOL'
  ].join('\n'),
  equipo_label: 'EQUIPO',
  club_label: 'CLUB',
  categoria_label: 'CATEGORIA',
  entrenador_principal_label: 'ENTRENADOR (A) PRINCIPAL',
  asistente_label: 'ASISTENTE',
  logos: []
};

function RosterTemplateDialog({ open, onClose, token, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(DEFAULT_FORM);
  const [selectedLogo, setSelectedLogo] = useState('');

  const fieldSx = {
    '& .MuiOutlinedInput-root': {
      borderRadius: 1.2,
      bgcolor: '#fff',
      '& fieldset': { borderColor: '#e6ebf2' },
      '&:hover fieldset': { borderColor: '#d7dee8' },
      '&.Mui-focused fieldset': { borderColor: '#c9d3e0' }
    },
    '& .MuiInputLabel-root': { color: '#7c8798' }
  };

  const updateField = (field) => (event) => {
    setForm((previous) => ({ ...previous, [field]: event.target.value }));
  };

  useEffect(() => {
    if (!open) return;

    const fetchTemplate = async () => {
      setError('');
      setLoading(true);
      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/rosters/template`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'No se pudo cargar plantilla');

        const tpl = data?.template || {};
        setForm({
          ...DEFAULT_FORM,
          ...tpl,
          logos: Array.isArray(tpl.logos) ? tpl.logos : []
        });
        setSelectedLogo('');
      } catch (err) {
        setError(err.message || 'No se pudo cargar plantilla');
      } finally {
        setLoading(false);
      }
    };

    fetchTemplate();
  }, [open, token]);

  const handleSave = async () => {
    setLoading(true);
    setError('');
    try {
      const payload = {
        template: {
          header_title: form.header_title,
          texto_institucional: form.texto_institucional,
          equipo_label: form.equipo_label,
          club_label: form.club_label,
          categoria_label: form.categoria_label,
          entrenador_principal_label: form.entrenador_principal_label,
          asistente_label: form.asistente_label,
          logos: form.logos
        }
      };

      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/rosters/template`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudo guardar plantilla');

      if (typeof onSaved === 'function') onSaved();
      if (typeof onClose === 'function') onClose();
    } catch (err) {
      setError(err.message || 'No se pudo guardar plantilla');
    } finally {
      setLoading(false);
    }
  };

  const uploadLogo = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || form.logos.length >= 4) return;

    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('logo', file);
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/rosters/template/logos`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'No se pudo cargar el logo');

      const logo = {
        ...data.logo,
        x: 0.04 + (form.logos.length * 0.15),
        zIndex: form.logos.length + 1
      };
      setForm((previous) => ({ ...previous, logos: [...previous.logos, logo] }));
      setSelectedLogo(logo._id || logo.url);
    } catch (uploadError) {
      setError(uploadError.message || 'No se pudo cargar el logo');
    } finally {
      setUploading(false);
    }
  };

  const removeSelectedLogo = () => {
    if (!selectedLogo) return;
    setForm((previous) => ({
      ...previous,
      logos: previous.logos.filter((logo) => (logo._id || logo.url) !== selectedLogo)
    }));
    setSelectedLogo('');
  };

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{ sx: { borderRadius: 3, maxWidth: 820, boxShadow: '0 20px 48px rgba(15, 23, 42, 0.2)' } }}
    >
      <DialogTitle sx={{ px: { xs: 2, sm: 3 }, pt: 2.6, pb: 0.5 }}>
        <Typography sx={{ fontSize: 22, lineHeight: 1.2, fontWeight: 800, color: '#1f2937' }}>Configurar membrete de roster</Typography>
        <Typography sx={{ mt: 0.45, fontSize: 12, color: '#7b8797', fontWeight: 400 }}>Personaliza los textos institucionales que aparecen en los documentos del equipo.</Typography>
      </DialogTitle>
      <DialogContent sx={{ px: { xs: 2, sm: 3 }, pt: '16px !important', pb: 1 }}>
        {!!error && <Alert severity="error" sx={{ mb: 1.5, borderRadius: 1.5 }}>{error}</Alert>}

        <Box sx={{ border: '1px solid #eef2f6', borderRadius: 2, p: { xs: 1.5, sm: 2 }, boxShadow: '0 4px 14px rgba(15, 23, 42, 0.05)' }}>
          <Typography sx={{ fontSize: 14.5, fontWeight: 800, color: '#172033' }}>Encabezado del documento</Typography>
          <Typography sx={{ mt: 0.25, mb: 1.5, fontSize: 11.5, color: '#7b8797' }}>Título e identificación institucional.</Typography>
          <Grid container spacing={1.5}>
            <Grid size={{ xs: 12 }}>
              <TextField size="small" label="Título" fullWidth disabled={loading} value={form.header_title} onChange={updateField('header_title')} sx={fieldSx} />
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField size="small" label="Texto institucional" fullWidth multiline minRows={3} disabled={loading} value={form.texto_institucional} onChange={updateField('texto_institucional')} sx={fieldSx} />
            </Grid>
          </Grid>
        </Box>

        <Box sx={{ mt: 1.5, border: '1px solid #eef2f6', borderRadius: 2, p: { xs: 1.5, sm: 2 }, boxShadow: '0 4px 14px rgba(15, 23, 42, 0.05)' }}>
          <Typography sx={{ fontSize: 14.5, fontWeight: 800, color: '#172033' }}>Etiquetas del roster</Typography>
          <Typography sx={{ mt: 0.25, mb: 1.5, fontSize: 11.5, color: '#7b8797' }}>Nombres visibles para los datos del equipo y el cuerpo técnico.</Typography>
          <Grid container spacing={1.5}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField size="small" label="Club" fullWidth disabled={loading} value={form.club_label} onChange={updateField('club_label')} sx={fieldSx} />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField size="small" label="Categoría" fullWidth disabled={loading} value={form.categoria_label} onChange={updateField('categoria_label')} sx={fieldSx} />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField size="small" label="Equipo" fullWidth disabled={loading} value={form.equipo_label} onChange={updateField('equipo_label')} sx={fieldSx} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField size="small" label="Entrenador principal" fullWidth disabled={loading} value={form.entrenador_principal_label} onChange={updateField('entrenador_principal_label')} sx={fieldSx} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField size="small" label="Asistente" fullWidth disabled={loading} value={form.asistente_label} onChange={updateField('asistente_label')} sx={fieldSx} />
            </Grid>
          </Grid>
        </Box>

        <Box sx={{ mt: 1.5, border: '1px solid #eef2f6', borderRadius: 2, p: { xs: 1.5, sm: 2 }, boxShadow: '0 4px 14px rgba(15, 23, 42, 0.05)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Box>
              <Typography sx={{ fontSize: 14.5, fontWeight: 800, color: '#172033' }}>Logos institucionales</Typography>
              <Typography sx={{ mt: 0.25, fontSize: 11.5, color: '#7b8797' }}>Se copiarán como logos iniciales de cada roster.</Typography>
            </Box>
            <Chip label={`${form.logos.length} / 4`} size="small" sx={{ height: 22, fontSize: 10, fontWeight: 800 }} />
          </Box>

          {form.logos.length > 0 && (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 1, mt: 1.5 }}>
              {form.logos.map((logo, index) => {
                const logoId = logo._id || logo.url;
                const isSelected = selectedLogo === logoId;
                return (
                  <Box key={logoId} onClick={() => setSelectedLogo(logoId)} sx={{ height: 64, border: `2px solid ${isSelected ? '#f97316' : '#e5eaf1'}`, borderRadius: 1.5, bgcolor: '#fafbfc', p: 0.7, cursor: 'pointer', boxSizing: 'border-box', '&:hover': { borderColor: isSelected ? '#f97316' : '#b8c2d1' } }}>
                    <Box component="img" src={mediaUrl(logo.url)} alt={`Logo ${index + 1}`} sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                  </Box>
                );
              })}
            </Box>
          )}

          <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexDirection: { xs: 'column', sm: 'row' } }}>
            <Button component="label" fullWidth variant="outlined" startIcon={uploading ? <CircularProgress size={15} /> : <ImageOutlinedIcon />} disabled={loading || uploading || form.logos.length >= 4} sx={{ borderColor: '#dfe5ec', color: '#475467', textTransform: 'none', fontWeight: 700 }}>
              Agregar logo
              <input hidden type="file" accept="image/*" onChange={uploadLogo} />
            </Button>
            <Button fullWidth variant="outlined" startIcon={<DeleteOutlineIcon />} disabled={loading || !selectedLogo} onClick={removeSelectedLogo} sx={{ borderColor: '#dfe5ec', color: '#667085', textTransform: 'none', fontWeight: 700 }}>
              Quitar logo
            </Button>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: { xs: 2, sm: 3 }, pt: 1.4, pb: 2.5, gap: 1 }}>
        <Button onClick={onClose} variant="outlined" disabled={loading || uploading} sx={{ borderColor: '#d0d5dd', color: '#344054', borderRadius: 1.4, textTransform: 'none', fontWeight: 700 }}>Cancelar</Button>
        <Button onClick={handleSave} variant="contained" disabled={loading || uploading} sx={{ bgcolor: '#f97316', borderRadius: 1.4, textTransform: 'none', fontWeight: 700, boxShadow: 'none', '&:hover': { bgcolor: '#ea580c', boxShadow: 'none' } }}>{loading ? 'Guardando...' : 'Guardar cambios'}</Button>
      </DialogActions>
    </Dialog>
  );
}

export default RosterTemplateDialog;
