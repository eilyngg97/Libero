import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography
} from '@mui/material';

const TAB_BASICO = 0;
const TAB_CERTIFICACIONES = 1;
const TAB_ADMINISTRATIVO = 2;

const initialForm = {
  nombre: '',
  apellido: '',
  direccion: '',
  cedula: '',
  correo: '',
  fecha_nacimiento: '',
  telefono: '',
  especialidad: '',
  nivel_instruccion: '',
  experiencia_previa: '',
  talla_franela: '',
  talla_short: '',
  talla_mono: '',
  tipo_contrato: '',
  datos_bancarios: '',
  fecha_ingreso: ''
};

function EntrenadorForm({ onSuccess, onCancel }) {
  const [tab, setTab] = useState(TAB_BASICO);
  const [form, setForm] = useState(initialForm);
  const [fotoFile, setFotoFile] = useState(null);
  const [previewFoto, setPreviewFoto] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fotoInputRef = useRef(null);

  const canSubmit = useMemo(() => {
    return (
      form.nombre.trim() &&
      form.apellido.trim() &&
      form.cedula.trim()
    );
  }, [form]);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleFotoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setFotoFile(null);
      setPreviewFoto('');
      return;
    }

    setFotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = String(reader.result || '');
      setPreviewFoto(img);
    };
    reader.readAsDataURL(file);
  };

  const openFotoPicker = () => {
    fotoInputRef.current?.click();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) {
      setError('Completa los campos obligatorios: nombre, apellido y cédula.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    const formData = new FormData();
    formData.append('nombre', form.nombre || '');
    formData.append('apellido', form.apellido || '');
    formData.append('direccion', form.direccion || '');
    formData.append('cedula', form.cedula || '');
    formData.append('correo', form.correo || '');
    formData.append('fecha_nacimiento', form.fecha_nacimiento || '');
    formData.append('telefono', form.telefono || '');
    formData.append('especialidad', form.especialidad || '');
    formData.append('nivel_instruccion', form.nivel_instruccion || '');
    formData.append('experiencia_previa', form.experiencia_previa || '');
    formData.append('tipo_contrato', form.tipo_contrato || '');
    formData.append('datos_bancarios', form.datos_bancarios || '');
    formData.append('fecha_ingreso', form.fecha_ingreso || '');
    formData.append('talla_uniforme', JSON.stringify({
      franela: form.talla_franela || '',
      short: form.talla_short || '',
      mono: form.talla_mono || ''
    }));

    if (fotoFile) {
      formData.append('foto', fotoFile);
    }

    try {
      const token = localStorage.getItem('token');
      const apiBase = process.env.REACT_APP_API_URL || window.location.origin;
      const res = await fetch(`${apiBase}/api/entrenadores`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudo crear el entrenador');

      setSuccess('Entrenador creado. Usuario rol entrenador generado con contrasena inicial igual a la cedula.');
      setForm(initialForm);
      setFotoFile(null);
      setPreviewFoto('');
      setTab(TAB_BASICO);
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err.message || 'No se pudo crear el entrenador');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{
        display: 'grid',
        gap: 2,
        bgcolor: '#fdfdfd',
        p: { xs: 1.5, md: 2 },
        borderRadius: 3
      }}
    >
      <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a' }}>
        Nuevo Entrenador
      </Typography>

      <Tabs
        value={tab}
        onChange={(_, next) => setTab(next)}
        variant="fullWidth"
        sx={{
          '& .MuiTabs-indicator': {
            backgroundColor: '#94a3b8'
          },
          '& .MuiTab-root': {
            color: '#94a3b8',
            fontWeight: 700,
            textTransform: 'none'
          },
          '& .MuiTab-root.Mui-selected': {
            color: '#64748b'
          }
        }}
      >
        <Tab label="Basico" />
        <Tab label="Certificaciones" />
        <Tab label="Administrativo" />
      </Tabs>

      {tab === TAB_BASICO && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(12, minmax(0, 1fr))' },
            gap: 2,
            alignItems: 'start'
          }}
        >
          <Paper sx={{ p: 2.5, borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)', gridColumn: { xs: '1 / -1', md: 'span 4' } }}>
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
              <Box
                onClick={openFotoPicker}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragActive(false);
                  const file = event.dataTransfer.files?.[0];
                  if (file) {
                    handleFotoChange({ target: { files: [file] } });
                  }
                }}
                sx={{
                  width: 140,
                  height: 140,
                  borderRadius: '50%',
                  border: '2px solid',
                  borderColor: dragActive ? '#f97316' : '#e2e8f0',
                  bgcolor: '#f8fafc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  boxShadow: '0 6px 16px rgba(15, 23, 42, 0.08)'
                }}
              >
                <input ref={fotoInputRef} hidden accept="image/*" type="file" onChange={handleFotoChange} />
                {previewFoto ? (
                  <img src={previewFoto} alt="Foto del entrenador" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <Typography sx={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textAlign: 'center', px: 2 }}>
                    Subir foto
                  </Typography>
                )}
              </Box>
              <Box sx={{ textAlign: 'center' }}>
                <Typography sx={{ fontWeight: 700, color: '#0f172a' }}>Foto de perfil</Typography>
                <Typography sx={{ fontSize: 12, color: '#64748b' }}>Arrastra o haz clic para cambiar</Typography>
              </Box>
            </Box>
          </Paper>

          <Box sx={{ gridColumn: { xs: '1 / -1', md: 'span 8' } }}>
            <fieldset style={{ border: 'none', borderRadius: 16, padding: 20, background: '#ffffff', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
              <legend>Datos Basicos</legend>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
                <TextField label="Nombre" value={form.nombre} onChange={handleChange('nombre')} required size="small" sx={{ my: 1 }} />
                <TextField label="Apellido" value={form.apellido} onChange={handleChange('apellido')} required size="small" sx={{ my: 1 }} />
                <TextField label="Direccion" value={form.direccion} onChange={handleChange('direccion')} size="small" sx={{ my: 1 }} />
                <TextField label="Numero de cedula" value={form.cedula} onChange={handleChange('cedula')} required size="small" sx={{ my: 1 }} />
                <TextField label="Correo" type="email" value={form.correo} onChange={handleChange('correo')} size="small" sx={{ my: 1 }} />
                <TextField
                  label="Fecha de nacimiento"
                  type="date"
                  value={form.fecha_nacimiento}
                  onChange={handleChange('fecha_nacimiento')}
                  InputLabelProps={{ shrink: true }}
                  size="small"
                  sx={{ my: 1 }}
                />
                <TextField label="Telefono" value={form.telefono} onChange={handleChange('telefono')} size="small" sx={{ my: 1 }} />
              </Box>
            </fieldset>
          </Box>
        </Box>
      )}

      {tab === TAB_CERTIFICACIONES && (
        <fieldset style={{ border: 'none', borderRadius: 16, padding: 20, background: '#ffffff', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
          <legend>Certificaciones</legend>
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            <TextField label="Especialidad" value={form.especialidad} onChange={handleChange('especialidad')} size="small" sx={{ my: 1 }} />
            <TextField label="Nivel de instruccion" value={form.nivel_instruccion} onChange={handleChange('nivel_instruccion')} size="small" sx={{ my: 1 }} />
            <TextField
              label="Experiencia previa (breve)"
              value={form.experiencia_previa}
              onChange={handleChange('experiencia_previa')}
              multiline
              minRows={3}
              size="small"
              sx={{ my: 1 }}
            />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 1.5 }}>
              <TextField label="Talla franela" value={form.talla_franela} onChange={handleChange('talla_franela')} size="small" sx={{ my: 1 }} />
              <TextField label="Talla short" value={form.talla_short} onChange={handleChange('talla_short')} size="small" sx={{ my: 1 }} />
              <TextField label="Talla mono" value={form.talla_mono} onChange={handleChange('talla_mono')} size="small" sx={{ my: 1 }} />
            </Box>
          </Box>
        </fieldset>
      )}

      {tab === TAB_ADMINISTRATIVO && (
        <fieldset style={{ border: 'none', borderRadius: 16, padding: 20, background: '#ffffff', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
          <legend>Administrativo</legend>
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            <TextField
              select
              label="Tipo de contrato"
              value={form.tipo_contrato}
              onChange={handleChange('tipo_contrato')}
              size="small"
              sx={{ my: 1 }}
            >
              <MenuItem value="">Sin definir</MenuItem>
              <MenuItem value="fijo">Fijo</MenuItem>
              <MenuItem value="por_horas">Por horas</MenuItem>
              <MenuItem value="honorarios_profesionales">Por honorarios profesionales</MenuItem>
            </TextField>
            <TextField
              label="Datos bancarios"
              value={form.datos_bancarios}
              onChange={handleChange('datos_bancarios')}
              multiline
              minRows={3}
              size="small"
              sx={{ my: 1 }}
            />
            <TextField
              label="Fecha de ingreso"
              type="date"
              value={form.fecha_ingreso}
              onChange={handleChange('fecha_ingreso')}
              InputLabelProps={{ shrink: true }}
              size="small"
              sx={{ my: 1 }}
            />
          </Box>
        </fieldset>
      )}

      {!!error && <Alert severity="error">{error}</Alert>}
      {!!success && <Alert severity="success">{success}</Alert>}

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1 }}>
        <Button
          type="submit"
          variant="contained"
          disabled={saving || !canSubmit}
          sx={{ bgcolor: '#1e293b', '&:hover': { bgcolor: '#334155' }, fontWeight: 700 }}
        >
          {saving ? 'Guardando...' : 'Crear entrenador'}
        </Button>
      </Box>
    </Box>
  );
}

export default EntrenadorForm;
