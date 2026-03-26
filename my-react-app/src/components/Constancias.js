import React, { useState } from 'react';
import { Box, Button, TextField, MenuItem, Select, InputLabel, FormControl, CircularProgress, Typography, Paper, Autocomplete } from '@mui/material';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useLocation } from 'react-router-dom';

const tipos = [
  { value: 'simple', label: 'Constancia simple' },
  { value: 'retiro', label: 'Constancia de retiro' },
  // { value: 'horario', label: 'Constancia con horario' }
];



function Constancias() {
  const location = useLocation();
  const alumnoNavegado = location.state?.alumno;
  const [alumnoId, setAlumnoId] = useState(alumnoNavegado ? alumnoNavegado._id : '');
  const [tipo, setTipo] = useState('simple');
  const [fechaEmision, setFechaEmision] = useState(() => {
    const hoy = new Date();
    const year = hoy.getFullYear();
    const month = String(hoy.getMonth() + 1).padStart(2, '0');
    const day = String(hoy.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [alumnos, setAlumnos] = useState([]);
  const [selectedAlumno, setSelectedAlumno] = useState(alumnoNavegado || null);
  const [loadingAlumnos, setLoadingAlumnos] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [rol, setRol] = useState('');
  const [solventeMensualidades, setSolventeMensualidades] = useState(true);
  const [validandoSolvencia, setValidandoSolvencia] = useState(false);
  const inputSx = {
    '& .MuiOutlinedInput-root': {
      bgcolor: '#f8fafc',
      borderRadius: 2,
      '& fieldset': { borderColor: '#e2e8f0' },
      '&:hover fieldset': { borderColor: '#cbd5e1' },
      '&.Mui-focused fieldset': { borderColor: '#94a3b8' }
    }
  };

  React.useEffect(() => {
    const rolLS = localStorage.getItem('rol');
    if (rolLS) setRol(rolLS);
  }, []);

  React.useEffect(() => {
    if (rol === 'admin') {
      if (inputValue.length >= 3) {
        setLoadingAlumnos(true);
        fetch(`${process.env.REACT_APP_API_URL}/api/alumnos?search=${inputValue}`)
          .then(res => res.json())
          .then(data => {
            setAlumnos(data);
            setLoadingAlumnos(false);
          })
          .catch(() => setLoadingAlumnos(false));
      } else {
        setAlumnos([]);
      }
    }
  }, [inputValue, rol]);

  React.useEffect(() => {
    if (!alumnoId) {
      setSolventeMensualidades(false);
      return;
    }

    let cancelled = false;
    const estatusConDeuda = new Set(['pendiente', 'abono', 'en revision', 'retrasado', 'insolvente']);

    const cargarSolvencia = async () => {
      try {
        setValidandoSolvencia(true);
        const token = localStorage.getItem('token');
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades?id_alumno=${alumnoId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        if (!res.ok) throw new Error('No se pudo validar solvencia');
        const data = await res.json();
        const mensualidades = Array.isArray(data) ? data : [];
        const tieneDeuda = mensualidades.some((m) => estatusConDeuda.has(String(m.estatus || '').toLowerCase()));
        if (!cancelled) {
          setSolventeMensualidades(!tieneDeuda);
        }
      } catch {
        if (!cancelled) {
          setSolventeMensualidades(false);
        }
      } finally {
        if (!cancelled) {
          setValidandoSolvencia(false);
        }
      }
    };

    cargarSolvencia();

    return () => {
      cancelled = true;
    };
  }, [alumnoId]);

  const tiposDisponibles = React.useMemo(() => {
    return tipos.filter((t) => {
      if (t.value === 'retiro' && rol !== 'admin') return false;
      if (t.value === 'simple' && !solventeMensualidades) return false;
      return true;
    });
  }, [rol, solventeMensualidades]);

  React.useEffect(() => {
    if (!tiposDisponibles.length) {
      setTipo('');
      return;
    }
    if (!tiposDisponibles.some((t) => t.value === tipo)) {
      setTipo(tiposDisponibles[0].value);
    }
  }, [tipo, tiposDisponibles]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setPdfUrl(null);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/constancias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alumnoId, tipo, fechaEmision })
      });
      if (!res.ok) throw new Error('Error generando constancia');
      const blob = await res.blob();
      setPdfUrl(URL.createObjectURL(blob));
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc', p: { xs: 2, md: 4 } }}>
      <Box
        sx={{
          maxWidth: 1300,
          mx: 'auto',
          display: 'grid',
          gap: 3,
          gridTemplateColumns: { xs: '1fr', md: '0.9fr 1.1fr' },
          alignItems: 'start'
        }}
      >
        <Paper elevation={0} sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 4, boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)' }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', mb: 3 }}>
            <Box sx={{ width: 56, height: 56, borderRadius: 3, bgcolor: '#ffedd5', color: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}>
              <VerifiedUserIcon />
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a' }}>Generar constancia</Typography>
            <Typography variant="body2" sx={{ color: '#64748b' }}>
              Complete los detalles para emitir el documento oficial.
            </Typography>
          </Box>
          <form onSubmit={handleSubmit}>
            {rol === 'admin' ? (
              <FormControl fullWidth margin="normal">
                <Autocomplete
                  options={alumnos}
                  getOptionLabel={option => `${option.nombres} ${option.apellidos} (C.I. ${option.cedula})`}
                  loading={loadingAlumnos}
                  onInputChange={(e, value) => setInputValue(value)}
                  onChange={(e, value) => {
                    setSelectedAlumno(value);
                    setAlumnoId(value ? value._id : '');
                  }}
                  renderInput={(params) => (
                    <TextField {...params} label="Buscar alumno" variant="outlined" required sx={inputSx} />
                  )}
                />
              </FormControl>
            ) : (
              <Box my={2}>
                <Typography variant="subtitle1"><b>Alumno:</b> {selectedAlumno ? `${selectedAlumno.nombres} ${selectedAlumno.apellidos}` : ''}</Typography>
                <Typography variant="subtitle2"><b>Cédula:</b> {selectedAlumno ? selectedAlumno.cedula : ''}</Typography>
              </Box>
            )}
            {selectedAlumno && (
              <Box my={2} p={2} bgcolor="#f8fafc" borderRadius={2} border="1px solid #e2e8f0">
                <Typography variant="subtitle1"><b>Nombre:</b> {selectedAlumno.nombres} {selectedAlumno.apellidos}</Typography>
                <Typography variant="subtitle2"><b>Cédula:</b> {selectedAlumno.cedula}</Typography>
                <Typography variant="subtitle2"><b>Sede:</b> {selectedAlumno.sede.nombre}</Typography>
              </Box>
            )}
            <FormControl fullWidth margin="normal">
              <InputLabel id="tipo-label">Tipo de constancia</InputLabel>
              <Select
                labelId="tipo-label"
                value={tipo}
                label="Tipo de constancia"
                onChange={e => setTipo(e.target.value)}
                sx={inputSx}
              >
                {tiposDisponibles.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
              </Select>
            </FormControl>
            {!solventeMensualidades && (
              <Typography variant="caption" sx={{ color: '#b91c1c', display: 'block', mt: 0.5 }}>
                La constancia simple solo está disponible cuando el alumno está solvente.
              </Typography>
            )}
            <TextField
              fullWidth
              margin="normal"
              label="Fecha de emisión"
              type="date"
              value={fechaEmision}
              onChange={e => setFechaEmision(e.target.value)}
              InputLabelProps={{ shrink: true }}
              required
              disabled={rol !== 'admin'}
              helperText={rol !== 'admin' ? 'Solo un administrador puede modificar la fecha de emisión.' : ''}
              sx={inputSx}
            />
            <Box mt={2} display="flex" justifyContent="center">
              <Button
                type="submit"
                variant="contained"
                disabled={loading || !alumnoId || !tipo || validandoSolvencia}
                fullWidth
                sx={{ bgcolor: '#f97316', '&:hover': { bgcolor: '#ea580c' }, fontWeight: 700, borderRadius: 2, py: 1.2 }}
              >
                {loading ? <CircularProgress size={24} color="inherit" /> : 'Generar PDF'}
              </Button>
            </Box>
            <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: '#94a3b8', mt: 1 }}>
              Una vez generado, puede descargarlo o visualizarlo en el siguiente recuadro.
            </Typography>
          </form>
        </Paper>
        {pdfUrl && (
          <Paper elevation={0} sx={{ p: 2, borderRadius: 3, boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)' }}>
            <Button href={pdfUrl} download="constancia.pdf" variant="outlined" fullWidth sx={{ mb: 2, borderColor: '#cbd5e1', color: '#334155' }}>
              Descargar constancia
            </Button>
            <iframe src={pdfUrl+"#navpanes=0&toolbar=0"} title="Vista previa" width="100%" height="400px" style={{ border: '1px solid #e2e8f0', marginTop: 10, borderRadius: 12 }} />
            {/* NOTA */}
            <Paper
              elevation={0}
              sx={{
                mt: 2,
                p: 2,
                borderRadius: 3,
                border: '1px solid #fdba74',
                backgroundColor: '#fff7ed',
                boxShadow: '0 4px 14px rgba(249, 115, 22, 0.12)'
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <InfoOutlinedIcon sx={{ color: '#c2410c', fontSize: 18 }} />
                <Typography variant="body2" sx={{ color: '#9a3412', fontWeight: 600 }}>
                  Una vez impresas las constancias, deberán ser presentadas ante la Dirección de la Academia para su correspondiente firma y sello.
                </Typography>
              </Box>
            </Paper>
          </Paper>
        )}
      </Box>
    </Box>
  );
}

export default Constancias;
