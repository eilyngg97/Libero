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
  TextField
} from '@mui/material';

const DEFAULT_FORM = {
  header_title: 'ROSTER',
  federacion_linea_1: 'FEDERACION VENEZOLANA DE VOLEIBOL',
  federacion_linea_2: 'ASOCIACION DE VOLEIBOL DEL ESTADO LARA',
  federacion_linea_3: 'LIGA DE INICIACION DE VOLEIBOL',
  temporada_texto: 'TEMPORADA',
  equipo_label: 'EQUIPO',
  club_label: 'CLUB',
  categoria_label: 'CATEGORIA',
  entrenador_principal_label: 'ENTRENADOR (A) PRINCIPAL',
  asistente_label: 'ASISTENTE',
  logos_text: ''
};

function RosterTemplateDialog({ open, onClose, token, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(DEFAULT_FORM);

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
          logos_text: Array.isArray(tpl.logos) ? tpl.logos.join('\n') : ''
        });
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
      const logos = String(form.logos_text || '')
        .split('\n')
        .map((item) => item.trim())
        .filter(Boolean);

      const payload = {
        template: {
          header_title: form.header_title,
          federacion_linea_1: form.federacion_linea_1,
          federacion_linea_2: form.federacion_linea_2,
          federacion_linea_3: form.federacion_linea_3,
          temporada_texto: form.temporada_texto,
          equipo_label: form.equipo_label,
          club_label: form.club_label,
          categoria_label: form.categoria_label,
          entrenador_principal_label: form.entrenador_principal_label,
          asistente_label: form.asistente_label,
          logos
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

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Configurar membrete de roster</DialogTitle>
      <DialogContent>
        {!!error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Grid container spacing={2} sx={{ mt: 0.2 }}>
          <Grid item xs={12} md={6}>
            <TextField label="Titulo" fullWidth value={form.header_title} onChange={(e) => setForm((prev) => ({ ...prev, header_title: e.target.value }))} />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField label="Texto temporada" fullWidth value={form.temporada_texto} onChange={(e) => setForm((prev) => ({ ...prev, temporada_texto: e.target.value }))} />
          </Grid>
          <Grid item xs={12}><TextField label="Linea 1" fullWidth value={form.federacion_linea_1} onChange={(e) => setForm((prev) => ({ ...prev, federacion_linea_1: e.target.value }))} /></Grid>
          <Grid item xs={12}><TextField label="Linea 2" fullWidth value={form.federacion_linea_2} onChange={(e) => setForm((prev) => ({ ...prev, federacion_linea_2: e.target.value }))} /></Grid>
          <Grid item xs={12}><TextField label="Linea 3" fullWidth value={form.federacion_linea_3} onChange={(e) => setForm((prev) => ({ ...prev, federacion_linea_3: e.target.value }))} /></Grid>
          <Grid item xs={12} md={4}><TextField label="Label club" fullWidth value={form.club_label} onChange={(e) => setForm((prev) => ({ ...prev, club_label: e.target.value }))} /></Grid>
          <Grid item xs={12} md={4}><TextField label="Label categoria" fullWidth value={form.categoria_label} onChange={(e) => setForm((prev) => ({ ...prev, categoria_label: e.target.value }))} /></Grid>
          <Grid item xs={12} md={4}><TextField label="Label equipo" fullWidth value={form.equipo_label} onChange={(e) => setForm((prev) => ({ ...prev, equipo_label: e.target.value }))} /></Grid>
          <Grid item xs={12} md={6}><TextField label="Label entrenador principal" fullWidth value={form.entrenador_principal_label} onChange={(e) => setForm((prev) => ({ ...prev, entrenador_principal_label: e.target.value }))} /></Grid>
          <Grid item xs={12} md={6}><TextField label="Label asistente" fullWidth value={form.asistente_label} onChange={(e) => setForm((prev) => ({ ...prev, asistente_label: e.target.value }))} /></Grid>
          <Grid item xs={12}>
            <TextField
              label="Logos (/uploads/... uno por linea)"
              fullWidth
              multiline
              minRows={3}
              value={form.logos_text}
              onChange={(e) => setForm((prev) => ({ ...prev, logos_text: e.target.value }))}
            />
          </Grid>
        </Grid>
        <Box sx={{ mt: 1, color: '#64748b', fontSize: 12 }}>
          Solo se aceptan rutas internas que inicien con /uploads/ y maximo 3 logos.
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        <Button onClick={handleSave} variant="contained" disabled={loading}>{loading ? 'Guardando...' : 'Guardar'}</Button>
      </DialogActions>
    </Dialog>
  );
}

export default RosterTemplateDialog;
