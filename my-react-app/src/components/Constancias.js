import React, { useState } from 'react';
import { Box, Button, TextField, MenuItem, Select, InputLabel, FormControl, CircularProgress, Typography, Paper, Autocomplete, Chip, Alert, Divider } from '@mui/material';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useLocation } from 'react-router-dom';

const tipos = [
  { value: 'simple', label: 'Constancia simple' },
  { value: 'retiro', label: 'Constancia de retiro' },
  { value: 'horario_entrenamiento', label: 'Constancia con horario de entrenamiento' },
  { value: 'listado_alumnos', label: 'Constancia con listado de alumnos' },
  { value: 'asistencia', label: 'Constancia de asistencia' }
];

const DIAS_ENTRENAMIENTO = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

function getAlumnoEstadoVisual(alumno) {
  const estaRetirado = alumno?.dado_de_baja === true || alumno?.activo === false;
  return {
    estaRetirado,
    label: estaRetirado ? 'Retirado / Baja' : (alumno?.estado || 'Activo')
  };
}



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
  const [diasEntrenamiento, setDiasEntrenamiento] = useState([]);
  const [horaInicioEntrenamiento, setHoraInicioEntrenamiento] = useState('');
  const [horaFinEntrenamiento, setHoraFinEntrenamiento] = useState('');
  const [selectedAlumnosListado, setSelectedAlumnosListado] = useState([]);
  const [asistenciaPara, setAsistenciaPara] = useState('atleta');
  const [eventoFecha, setEventoFecha] = useState(() => {
    const hoy = new Date();
    const year = hoy.getFullYear();
    const month = String(hoy.getMonth() + 1).padStart(2, '0');
    const day = String(hoy.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  const [eventoHoraDesde, setEventoHoraDesde] = useState('');
  const [eventoHoraHasta, setEventoHoraHasta] = useState('');
  const [eventoMotivo, setEventoMotivo] = useState('amistoso');
  const [asistenciaTiempo, setAsistenciaTiempo] = useState('pasado');
  const [tenantId, setTenantId] = useState('');
  const [solicitudes, setSolicitudes] = useState([]);
  const [loadingSolicitudes, setLoadingSolicitudes] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState('');
  const [requestError, setRequestError] = useState('');
  const alumnosOptions = React.useMemo(() => (Array.isArray(alumnos) ? alumnos : []), [alumnos]);
  const alumnosListadoValue = React.useMemo(
    () => (Array.isArray(selectedAlumnosListado) ? selectedAlumnosListado : []),
    [selectedAlumnosListado]
  );
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
    const tenantIdLS = String(localStorage.getItem('tenantId') || '').trim().toLowerCase();
    setTenantId(tenantIdLS);
  }, []);

  const token = localStorage.getItem('token');
  const isEsportaUserRequestMode = rol === 'usuario' && tenantId === 'esporta';

  const fetchMisSolicitudes = React.useCallback(async () => {
    if (!isEsportaUserRequestMode || !alumnoId) {
      setSolicitudes([]);
      return;
    }

    try {
      setLoadingSolicitudes(true);
      const params = new URLSearchParams();
      params.set('alumnoId', alumnoId);
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/constancias/solicitudes/mias?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.error || 'No se pudieron cargar tus solicitudes.');
      setSolicitudes(Array.isArray(data) ? data : []);
    } catch (err) {
      setRequestError(err.message || 'No se pudieron cargar tus solicitudes.');
      setSolicitudes([]);
    } finally {
      setLoadingSolicitudes(false);
    }
  }, [alumnoId, isEsportaUserRequestMode, token]);

  React.useEffect(() => {
    fetchMisSolicitudes();
  }, [fetchMisSolicitudes]);

  React.useEffect(() => {
    if (rol === 'admin') {
      if (inputValue.length >= 3) {
        setLoadingAlumnos(true);
        fetch(`${process.env.REACT_APP_API_URL}/api/alumnos?search=${encodeURIComponent(inputValue)}&incluirBajas=1`)
          .then(res => res.json())
          .then(data => {
            if (Array.isArray(data)) {
              setAlumnos(data);
            } else if (Array.isArray(data?.alumnos)) {
              setAlumnos(data.alumnos);
            } else {
              setAlumnos([]);
            }
            setLoadingAlumnos(false);
          })
          .catch(() => {
            setAlumnos([]);
            setLoadingAlumnos(false);
          });
      } else {
        setAlumnos([]);
      }
    }
  }, [inputValue, rol]);

  React.useEffect(() => {
    if (!alumnoId) {
      setSolventeMensualidades(true);
      setValidandoSolvencia(false);
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
      if (t.value === 'listado_alumnos' && rol !== 'admin') return false;
      if (rol !== 'admin' && t.value !== 'listado_alumnos' && alumnoId && !solventeMensualidades) return false;
      return true;
    });
  }, [rol, solventeMensualidades, alumnoId]);

  React.useEffect(() => {
    if (!tiposDisponibles.length) {
      setTipo('');
      return;
    }
    if (!tiposDisponibles.some((t) => t.value === tipo)) {
      setTipo(tiposDisponibles[0].value);
    }
  }, [tipo, tiposDisponibles]);

  const selectedAlumnoEstado = React.useMemo(() => getAlumnoEstadoVisual(selectedAlumno), [selectedAlumno]);

  React.useEffect(() => {
    if (tipo !== 'horario_entrenamiento') {
      setDiasEntrenamiento([]);
      setHoraInicioEntrenamiento('');
      setHoraFinEntrenamiento('');
    }
  }, [tipo]);

  React.useEffect(() => {
    if (tipo !== 'listado_alumnos') {
      setSelectedAlumnosListado([]);
    }
  }, [tipo]);

  React.useEffect(() => {
    if (tipo !== 'asistencia') {
      setAsistenciaPara('atleta');
      setEventoHoraDesde('');
      setEventoHoraHasta('');
      setEventoMotivo('amistoso');
      setAsistenciaTiempo('pasado');
    }
  }, [tipo]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setPdfUrl(null);
    setRequestSuccess('');
    setRequestError('');
    try {
      const bodyPayload = {
        alumnoId: tipo === 'listado_alumnos' ? (selectedAlumnosListado[0]?._id || '') : alumnoId,
        alumnoIds: tipo === 'listado_alumnos' ? selectedAlumnosListado.map((alumno) => alumno._id) : [],
        tipo,
        fechaEmision,
        asistenciaPara: tipo === 'asistencia' ? asistenciaPara : 'atleta',
        eventoFecha: tipo === 'asistencia' ? eventoFecha : '',
        eventoHoraDesde: tipo === 'asistencia' ? eventoHoraDesde : '',
        eventoHoraHasta: tipo === 'asistencia' ? eventoHoraHasta : '',
        eventoMotivo: tipo === 'asistencia' ? eventoMotivo : '',
        asistenciaTiempo: tipo === 'asistencia' ? asistenciaTiempo : 'pasado',
        diasEntrenamiento: tipo === 'horario_entrenamiento' ? diasEntrenamiento : [],
        horaInicio: tipo === 'horario_entrenamiento' ? horaInicioEntrenamiento : '',
        horaFin: tipo === 'horario_entrenamiento' ? horaFinEntrenamiento : ''
      };

      if (isEsportaUserRequestMode) {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/constancias/solicitudes`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify(bodyPayload)
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(payload?.error || payload?.detalle || 'Error enviando solicitud de constancia');
        }
        setRequestSuccess('Solicitud enviada al administrador. Te notificaremos cuando esté lista.');
        await fetchMisSolicitudes();
      } else {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/constancias`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify(bodyPayload)
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error || payload?.detalle || 'Error generando constancia');
        }
        const blob = await res.blob();
        setPdfUrl(URL.createObjectURL(blob));
      }
    } catch (err) {
      setRequestError(err.message || 'No se pudo procesar la solicitud.');
    } finally {
      setLoading(false);
    }
  };

  const estadoSolicitudLabel = (estado = '') => {
    if (estado === 'pendiente') return 'Pendiente';
    if (estado === 'en_revision') return 'En revision';
    if (estado === 'completada') return 'Completada';
    if (estado === 'rechazada') return 'Rechazada';
    return estado || '-';
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
            {isEsportaUserRequestMode && (
              <Alert severity="info" sx={{ mb: 2 }}>
                En Esporta, los usuarios no descargan constancias directamente. Aqui puedes armarla y enviarla como solicitud al administrador.
              </Alert>
            )}
            {requestSuccess && (
              <Alert severity="success" sx={{ mb: 2 }}>
                {requestSuccess}
              </Alert>
            )}
            {requestError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {requestError}
              </Alert>
            )}
            {rol === 'admin' ? (
              <FormControl fullWidth margin="normal">
                {tipo === 'listado_alumnos' ? (
                  <Autocomplete
                    key="autocomplete-listado"
                    multiple
                    options={alumnosOptions}
                    value={alumnosListadoValue}
                    isOptionEqualToValue={(option, value) => option?._id === value?._id}
                    getOptionLabel={(option) => `${option?.nombres || ''} ${option?.apellidos || ''} (C.I. ${option?.cedula || 'N/A'})`}
                    loading={loadingAlumnos}
                    onInputChange={(e, value, reason) => {
                      if (reason === 'input' || reason === 'clear') {
                        setInputValue(typeof value === 'string' ? value : '');
                      }
                    }}
                    onChange={(e, value) => setSelectedAlumnosListado(Array.isArray(value) ? value : [])}
                    renderOption={(props, option) => {
                      const estadoVisual = getAlumnoEstadoVisual(option);
                      return (
                        <Box component="li" {...props} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography sx={{ fontWeight: 600, color: '#0f172a' }}>
                              {`${option?.nombres || ''} ${option?.apellidos || ''}`.trim()}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>
                              {`C.I. ${option?.cedula || 'N/A'}`}
                            </Typography>
                          </Box>
                          <Chip
                            size="small"
                            label={estadoVisual.label}
                            sx={{
                              bgcolor: estadoVisual.estaRetirado ? '#fee2e2' : '#eef2ff',
                              color: estadoVisual.estaRetirado ? '#b91c1c' : '#2563eb',
                              fontWeight: 700
                            }}
                          />
                        </Box>
                      );
                    }}
                    renderInput={(params) => (
                      <TextField {...params} label="Buscar y seleccionar alumnos" variant="outlined" sx={inputSx} helperText="Escribe al menos 3 caracteres para buscar. Incluye alumnos activos y retirados." />
                    )}
                  />
                ) : (
                  <Autocomplete
                    key="autocomplete-simple"
                    options={alumnosOptions}
                    value={selectedAlumno || null}
                    isOptionEqualToValue={(option, value) => option?._id === value?._id}
                    getOptionLabel={(option) => `${option?.nombres || ''} ${option?.apellidos || ''} (C.I. ${option?.cedula || 'N/A'})`}
                    loading={loadingAlumnos}
                    onInputChange={(e, value, reason) => {
                      if (reason === 'input' || reason === 'clear') {
                        setInputValue(typeof value === 'string' ? value : '');
                      }
                    }}
                    onChange={(e, value) => {
                      setSelectedAlumno(value);
                      setAlumnoId(value ? value._id : '');
                    }}
                    renderOption={(props, option) => {
                      const estadoVisual = getAlumnoEstadoVisual(option);
                      return (
                        <Box component="li" {...props} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
                          <Box sx={{ minWidth: 0, flex: 1 }}>
                            <Typography sx={{ fontWeight: 600, color: '#0f172a' }}>
                              {`${option?.nombres || ''} ${option?.apellidos || ''}`.trim()}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>
                              {`C.I. ${option?.cedula || 'N/A'}`}
                            </Typography>
                          </Box>
                          <Chip
                            size="small"
                            label={estadoVisual.label}
                            sx={{
                              bgcolor: estadoVisual.estaRetirado ? '#fee2e2' : '#eef2ff',
                              color: estadoVisual.estaRetirado ? '#b91c1c' : '#2563eb',
                              fontWeight: 700
                            }}
                          />
                        </Box>
                      );
                    }}
                    renderInput={(params) => (
                      <TextField {...params} label="Buscar alumno" variant="outlined" required sx={inputSx} helperText="La búsqueda incluye alumnos activos y retirados." />
                    )}
                  />
                )}
              </FormControl>
            ) : null}
            {selectedAlumno && tipo !== 'listado_alumnos' && (
              <Box my={2} p={2} bgcolor="#f8fafc" borderRadius={2} border="1px solid #e2e8f0">
                <Typography variant="subtitle1"><b>Nombre:</b> {selectedAlumno.nombres} {selectedAlumno.apellidos}</Typography>
                <Typography variant="subtitle2"><b>Cédula:</b> {selectedAlumno.cedula}</Typography>
                <Typography variant="subtitle2"><b>Sede:</b> {selectedAlumno.sede.nombre}</Typography>
                <Box sx={{ mt: 1 }}>
                  <Chip
                    size="small"
                    label={selectedAlumnoEstado.label}
                    sx={{
                      bgcolor: selectedAlumnoEstado.estaRetirado ? '#fee2e2' : '#eef2ff',
                      color: selectedAlumnoEstado.estaRetirado ? '#b91c1c' : '#2563eb',
                      fontWeight: 700
                    }}
                  />
                </Box>
              </Box>
            )}
            {rol === 'admin' && selectedAlumno && tipo !== 'listado_alumnos' && (
              <Typography
                variant="caption"
                sx={{
                  display: 'block',
                  mt: -1,
                  mb: 0.7,
                  color: validandoSolvencia ? '#475569' : (solventeMensualidades ? '#15803d' : '#b91c1c'),
                  fontWeight: 700
                }}
              >
                {validandoSolvencia
                  ? 'Validando solvencia del alumno...'
                  : (solventeMensualidades ? 'Estado del alumno: SOLVENTE' : 'Estado del alumno: NO SOLVENTE')}
              </Typography>
            )}
            {tipo === 'listado_alumnos' && selectedAlumnosListado.length > 0 && (
              <Box my={2} p={2} bgcolor="#f8fafc" borderRadius={2} border="1px solid #e2e8f0">
                <Typography variant="subtitle2" sx={{ mb: 0.5 }}><b>Alumnos seleccionados:</b> {selectedAlumnosListado.length}</Typography>
                <Typography variant="caption" sx={{ color: '#64748b' }}>
                  El PDF se generará con una tabla de nombres, apellidos y categoría para todos los alumnos seleccionados.
                </Typography>
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
            {rol !== 'admin' && alumnoId && !solventeMensualidades && (
              <Typography variant="caption" sx={{ color: '#b91c1c', display: 'block', mt: 0.5 }}>
                Todas las constancias solo están disponibles cuando el alumno está solvente.
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
            {tipo === 'horario_entrenamiento' && (
              <>
                <FormControl fullWidth margin="normal" sx={inputSx}>
                  <Autocomplete
                    multiple
                    options={DIAS_ENTRENAMIENTO}
                    value={diasEntrenamiento}
                    onChange={(e, value) => setDiasEntrenamiento(value || [])}
                    renderInput={(params) => (
                      <TextField {...params} label="Dias de entrenamiento" placeholder="Selecciona uno o varios dias" />
                    )}
                  />
                </FormControl>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                  <TextField
                    fullWidth
                    label="Hora de inicio"
                    type="time"
                    value={horaInicioEntrenamiento}
                    onChange={(e) => setHoraInicioEntrenamiento(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={inputSx}
                  />
                  <TextField
                    fullWidth
                    label="Hora de fin"
                    type="time"
                    value={horaFinEntrenamiento}
                    onChange={(e) => setHoraFinEntrenamiento(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={inputSx}
                  />
                </Box>
              </>
            )}
            {tipo === 'asistencia' && (
              <>
                <FormControl fullWidth margin="normal" sx={inputSx}>
                  <InputLabel id="asistencia-para-label">Constancia para</InputLabel>
                  <Select
                    labelId="asistencia-para-label"
                    value={asistenciaPara}
                    label="Constancia para"
                    onChange={(e) => setAsistenciaPara(e.target.value)}
                  >
                    <MenuItem value="atleta">Atleta</MenuItem>
                    <MenuItem value="representante">Representante</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  fullWidth
                  margin="normal"
                  label="Dia del evento"
                  type="date"
                  value={eventoFecha}
                  onChange={(e) => setEventoFecha(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={inputSx}
                />
                <FormControl fullWidth margin="normal" sx={inputSx}>
                  <InputLabel id="asistencia-tiempo-label">Tiempo verbal</InputLabel>
                  <Select
                    labelId="asistencia-tiempo-label"
                    value={asistenciaTiempo}
                    label="Tiempo verbal"
                    onChange={(e) => setAsistenciaTiempo(e.target.value)}
                  >
                    <MenuItem value="pasado">Estuvo presente</MenuItem>
                    <MenuItem value="futuro">Estara presente</MenuItem>
                  </Select>
                </FormControl>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, mt: 1 }}>
                  <TextField
                    fullWidth
                    label="Hora desde"
                    type="time"
                    value={eventoHoraDesde}
                    onChange={(e) => setEventoHoraDesde(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={inputSx}
                  />
                  <TextField
                    fullWidth
                    label="Hora hasta"
                    type="time"
                    value={eventoHoraHasta}
                    onChange={(e) => setEventoHoraHasta(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={inputSx}
                  />
                </Box>
                <TextField
                  fullWidth
                  margin="normal"
                  label="Motivo del evento"
                  value={eventoMotivo}
                  onChange={(e) => setEventoMotivo(e.target.value)}
                  placeholder="Ej: amistoso"
                  sx={inputSx}
                />
              </>
            )}
            <Box mt={2} display="flex" justifyContent="center">
              <Button
                type="submit"
                variant="contained"
                disabled={
                  loading ||
                  (tipo === 'listado_alumnos' ? selectedAlumnosListado.length === 0 : !alumnoId) ||
                  !tipo ||
                  (rol !== 'admin' && validandoSolvencia) ||
                  (tipo === 'horario_entrenamiento' && (diasEntrenamiento.length === 0 || !horaInicioEntrenamiento || !horaFinEntrenamiento)) ||
                  (tipo === 'asistencia' && (!eventoFecha || !eventoHoraDesde || !eventoHoraHasta))
                }
                fullWidth
                sx={{ bgcolor: '#f97316', '&:hover': { bgcolor: '#ea580c' }, fontWeight: 700, borderRadius: 2, py: 1.2 }}
              >
                {loading ? <CircularProgress size={24} color="inherit" /> : (isEsportaUserRequestMode ? 'Enviar solicitud' : 'Generar PDF')}
              </Button>
            </Box>
            <Typography variant="caption" sx={{ display: 'block', textAlign: 'center', color: '#94a3b8', mt: 1 }}>
              {isEsportaUserRequestMode
                ? 'Tu solicitud se enviara al administrador con todos los datos editables de la constancia.'
                : 'Una vez generado, puede descargarlo o visualizarlo en el siguiente recuadro.'}
            </Typography>
          </form>
        </Paper>
        {isEsportaUserRequestMode && (
          <Paper
            elevation={0}
            sx={{
              p: { xs: 2, md: 2.5 },
              borderRadius: 3,
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)'
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#0f172a', mb: 1 }}>
              Mis solicitudes recientes
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748b', mb: 1.5 }}>
              Revisa aqui el estado de las ultimas solicitudes enviadas al administrador.
            </Typography>
            <Divider sx={{ mb: 1.5 }} />
            {loadingSolicitudes ? (
              <Typography variant="body2" sx={{ color: '#64748b' }}>Cargando solicitudes...</Typography>
            ) : solicitudes.length === 0 ? (
              <Typography variant="body2" sx={{ color: '#64748b' }}>Aun no tienes solicitudes registradas.</Typography>
            ) : (
              <Box sx={{ display: 'grid', gap: 1 }}>
                {solicitudes.slice(0, 6).map((solicitud) => (
                  <Paper key={solicitud._id} elevation={0} sx={{ p: 1.2, border: '1px solid #e2e8f0', borderRadius: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                      <Typography variant="body2" sx={{ color: '#0f172a', fontWeight: 700 }}>
                        {tipos.find((item) => item.value === solicitud.tipo)?.label || solicitud.tipo}
                      </Typography>
                      <Chip
                        size="small"
                        label={estadoSolicitudLabel(solicitud.estado)}
                        sx={{
                          bgcolor: solicitud.estado === 'completada' ? '#dcfce7' : solicitud.estado === 'rechazada' ? '#fee2e2' : '#e2e8f0',
                          color: solicitud.estado === 'completada' ? '#166534' : solicitud.estado === 'rechazada' ? '#b91c1c' : '#334155',
                          fontWeight: 700
                        }}
                      />
                    </Box>
                    <Typography variant="caption" sx={{ color: '#64748b' }}>
                      Solicitud creada: {new Date(solicitud.createdAt).toLocaleString('es-VE')}
                    </Typography>
                  </Paper>
                ))}
              </Box>
            )}
          </Paper>
        )}
        {pdfUrl && !isEsportaUserRequestMode && (
          <Paper
            elevation={0}
            sx={{
              p: 2,
              borderRadius: 3,
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              height: { xs: 'calc(100vh - 160px)', md: 'calc(100vh - 120px)' },
              minHeight: { xs: 420, md: 560 }
            }}
          >
            <Button href={pdfUrl} download="constancia.pdf" variant="outlined" fullWidth sx={{ mb: 2, borderColor: '#cbd5e1', color: '#334155' }}>
              Descargar constancia
            </Button>
            <Box sx={{ flex: 1, minHeight: 0, mt: 1.2 }}>
              <iframe
                src={pdfUrl + "#navpanes=0&toolbar=0"}
                title="Vista previa"
                width="100%"
                height="100%"
                style={{ border: '1px solid #e2e8f0', borderRadius: 12 }}
              />
            </Box>
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
                <Typography variant="body2" sx={{ color: '#9a3412', fontWeight: 400 }}>
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
