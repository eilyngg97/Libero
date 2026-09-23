import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  TextField,
  Typography
} from '@mui/material';
import { CATEGORIAS_DISPONIBLES } from '../utils/categoria';

const DIVISIONES_DISPONIBLES = ['Primera división', 'Segunda división', 'Tercera división'];

function RosterCreateDialog({ open, onClose, token, prefillTorneoId = '', onCreated }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    torneoId: '',
    categoria: '',
    sexo: '',
    division: '',
    grupoCompeticion: ''
  });

  useEffect(() => {
    if (!open) return;

    setError('');
    setForm((prev) => ({ ...prev, torneoId: prefillTorneoId || prev.torneoId }));

  }, [open, prefillTorneoId]);

  const canCreate = Boolean(form.torneoId && form.categoria && form.sexo && form.division && form.grupoCompeticion.trim());
  const fieldSx = {
    '& .MuiOutlinedInput-root': {
      bgcolor: '#f8fafc',
      borderRadius: 2,
      '& fieldset': { borderColor: '#e2e8f0' },
      '&:hover fieldset': { borderColor: '#cbd5e1' },
      '&.Mui-focused fieldset': { borderColor: '#94a3b8' }
    }
  };

  const handleCreate = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/rosters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          torneoId: form.torneoId,
          categoria: form.categoria,
          sexo: form.sexo,
          division: form.division,
          grupoCompeticion: form.grupoCompeticion,
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudo crear roster');

      if (typeof onCreated === 'function') onCreated(data?.roster);
      if (typeof onClose === 'function') onClose();
    } catch (err) {
      setError(err.message || 'No se pudo crear roster');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" PaperProps={{ sx: { borderRadius: 3, boxShadow: '0 18px 42px rgba(15, 23, 42, 0.18)' } }}>
      <DialogTitle sx={{ px: 3, pt: 2.8, pb: 0, fontWeight: 800, color: '#0f172a' }}>Agregar equipo</DialogTitle>
      <DialogContent sx={{ px: 3, pt: '16px !important', pb: 2.5 }}>
        {!!error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={{ bgcolor: '#fff', borderRadius: 2.5, p: { xs: 1.5, sm: 2.25 }, border: '1px solid #eef2f6', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
          <Typography sx={{ fontSize: 15, fontWeight: 700, color: '#0f172a', mb: 0.45 }}>Datos del equipo</Typography>
          <Typography sx={{ fontSize: 12, color: '#64748b', mb: 2 }}>Define la categoría y el grupo antes de agregar atletas.</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select label="Categoría" fullWidth value={form.categoria} onChange={(e) => setForm((prev) => ({ ...prev, categoria: e.target.value }))} sx={fieldSx}>
                {CATEGORIAS_DISPONIBLES.map((categoria) => <MenuItem key={categoria} value={categoria}>{categoria}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                select
                label="Sexo"
                fullWidth
                value={form.sexo}
                onChange={(e) => setForm((prev) => ({ ...prev, sexo: e.target.value }))}
                sx={fieldSx}
              >
                <MenuItem value="Femenino">Femenino</MenuItem>
                <MenuItem value="Masculino">Masculino</MenuItem>
                <MenuItem value="Mixto">Mixto</MenuItem>
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField select label="División" fullWidth value={form.division} onChange={(e) => setForm((prev) => ({ ...prev, division: e.target.value }))} sx={fieldSx}>
                {DIVISIONES_DISPONIBLES.map((division) => <MenuItem key={division} value={division}>{division}</MenuItem>)}
              </TextField>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Grupo de competición" fullWidth value={form.grupoCompeticion} onChange={(e) => setForm((prev) => ({ ...prev, grupoCompeticion: e.target.value }))} placeholder="Grupo A" sx={fieldSx} />
            </Grid>
          </Grid>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={onClose} variant="outlined" sx={{ borderColor: '#cbd5e1', color: '#1e293b', fontWeight: 700, textTransform: 'none' }}>Cancelar</Button>
        <Button onClick={handleCreate} variant="contained" disabled={loading || !canCreate} sx={{ bgcolor: '#f97316', fontWeight: 700, textTransform: 'none', boxShadow: 'none', '&:hover': { bgcolor: '#ea580c', boxShadow: 'none' } }}>
          {loading ? 'Guardando...' : 'Crear equipo'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default RosterCreateDialog;
