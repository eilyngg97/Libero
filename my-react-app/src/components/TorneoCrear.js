import React, { useEffect, useState } from 'react';
import { Button, TextField, Typography, Box, Grid, Chip, InputAdornment } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { DataGrid } from '@mui/x-data-grid';
import SearchIcon from '@mui/icons-material/Search';
import { useNavigate } from 'react-router-dom';

function TorneoCrear() {
  const navigate = useNavigate();
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fechaLimite, setFechaLimite] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveLoading, setSaveLoading] = useState(false);
  const [alumnos, setAlumnos] = useState([]);
  const [alumnosLoading, setAlumnosLoading] = useState(false);
  const [alumnosError, setAlumnosError] = useState('');
  const [solvencias, setSolvencias] = useState({});
  const [solvenciasLoading, setSolvenciasLoading] = useState(false);
  const [solvenciasError, setSolvenciasError] = useState('');
  const [convocados, setConvocados] = useState([]);
  const [filtroNombre, setFiltroNombre] = useState('');
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 10 });

  useEffect(() => {
    const fetchAlumnos = async () => {
      setAlumnosLoading(true);
      setAlumnosError('');
      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos`);
        const data = await res.json();
        if (!res.ok || !Array.isArray(data)) throw new Error('Error al obtener alumnos');
        setAlumnos(data);
      } catch {
        setAlumnos([]);
        setAlumnosError('No se pudieron cargar los alumnos');
      } finally {
        setAlumnosLoading(false);
      }
    };
    fetchAlumnos();
  }, []);

  useEffect(() => {
    const fetchSolvencias = async () => {
      setSolvenciasLoading(true);
      setSolvenciasError('');
      try {
        const hoy = new Date();
        const mes = hoy.getMonth() + 1;
        const anio = hoy.getFullYear();
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades?mes=${mes}&anio=${anio}`);
        const data = await res.json();
        if (!res.ok || !Array.isArray(data)) throw new Error('Error al obtener mensualidades');
        const map = {};
        data.forEach((m) => {
          const idAlumno = m.id_alumno?._id || m.id_alumno;
          if (idAlumno) {
            map[idAlumno] = m.estatus || 'Pendiente';
          }
        });
        setSolvencias(map);
      } catch {
        setSolvencias({});
        setSolvenciasError('No se pudieron cargar las mensualidades');
      } finally {
        setSolvenciasLoading(false);
      }
    };
    fetchSolvencias();
  }, []);

  useEffect(() => {
    setPaginationModel(prev => ({ ...prev, page: 0 }));
  }, [filtroNombre, filtroDesde, filtroHasta]);

  const getBaseDate = (fecha) => {
    if (!fecha) return '';
    return fecha.substring(0, 10);
  };

  const formatFechaNacimiento = (fecha) => {
    const base = getBaseDate(fecha);
    if (!base) return '';
    const parts = base.split('-');
    if (parts.length !== 3) return '';
    const [anio, mes, dia] = parts;
    return `${dia}/${mes}/${anio}`;
  };

  const getAlumnoId = (al) => al._id || al.id;

  const alumnosFiltrados = alumnos.filter((al) => {
    const nombreCompleto = `${al.nombres || ''} ${al.apellidos || ''}`.toLowerCase();
    if (filtroNombre && !nombreCompleto.includes(filtroNombre.toLowerCase())) return false;
    const base = getBaseDate(al.fecha_nacimiento);
    if (filtroDesde && (!base || base < filtroDesde)) return false;
    if (filtroHasta && (!base || base > filtroHasta)) return false;
    return true;
  });

  const alumnosRows = alumnosFiltrados.map((al) => ({
    id: getAlumnoId(al),
    nombre_completo: al.nombres + ' ' + al.apellidos || '-',
    fecha_nacimiento: formatFechaNacimiento(al.fecha_nacimiento) || '-',
    sede: al.sede?.nombre || '-',
    solvencia: solvencias[getAlumnoId(al)] || (solvenciasLoading ? 'Cargando...' : 'Sin mensualidad')
  }));

  const alumnosColumns = [
    { field: 'nombre_completo', headerName: 'Nombre completo', flex: 1, minWidth: 150 },
    { field: 'fecha_nacimiento', headerName: 'Fecha de nacimiento', flex: 1, minWidth: 170 },
    { field: 'sede', headerName: 'Sede', flex: 1, minWidth: 160 },
    {
      field: 'solvencia',
      headerName: 'Solvencia',
      flex: 1,
      minWidth: 150,
      renderCell: (params) => {
        const raw = String(params.value || '').toLowerCase();
        const map = {
          pagado: { label: 'Pagado', color: 'success' },
          pendiente: { label: 'Pendiente', color: 'warning' },
          retrasado: { label: 'Retrasado', color: 'error' },
          'en revision': { label: 'En revision', color: 'info' },
          exonerado: { label: 'Exonerado', color: 'default' },
          abono: { label: 'Abono', color: 'warning' },
          'sin mensualidad': { label: 'Sin mensualidad', color: 'default' },
          'cargando...': { label: 'Cargando...', color: 'default' }
        };
        const meta = map[raw] || { label: params.value || '-', color: 'default' };
        const chipStyles = {
          pagado: { bg: '#dcfce7', text: '#166534' },
          pendiente: { bg: '#ffedd5', text: '#c2410c' },
          retrasado: { bg: '#fee2e2', text: '#b91c1c' },
          'en revision': { bg: '#e0f2fe', text: '#1d4ed8' },
          exonerado: { bg: '#e2e8f0', text: '#475569' },
          abono: { bg: '#ffedd5', text: '#c2410c' },
          'sin mensualidad': { bg: '#e2e8f0', text: '#475569' },
          'cargando...': { bg: '#e2e8f0', text: '#475569' }
        };
        const style = chipStyles[raw] || { bg: '#e2e8f0', text: '#475569' };
        return (
          <Chip
            size="small"
            label={meta.label}
            sx={{
              bgcolor: style.bg,
              color: style.text,
              fontWeight: 700,
              borderRadius: 999,
              px: 0.5
            }}
          />
        );
      }
    }
  ];

  const hasFiltros = Boolean(filtroNombre || filtroDesde || filtroHasta);

  const handleClearFiltros = () => {
    setFiltroNombre('');
    setFiltroDesde('');
    setFiltroHasta('');
    setPaginationModel(prev => ({ ...prev, page: 0 }));
  };

  const handleCrear = async () => {
    setSaveError('');
    setSaveLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/torneos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre,
          descripcion,
          fecha_limite: fechaLimite || null,
          convocados
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al crear torneo');
      }
      navigate('/torneos');
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaveLoading(false);
    }
  };

  const handleCancelar = () => {
    navigate('/torneos');
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc', p: { xs: 2, md: 3 } }}>
      <Box sx={{ maxWidth: 1200, mx: 'auto' }}>
        <Typography variant="h5" sx={{ fontWeight: 700, color: '#0f172a' }}>Crear Torneo</Typography>
        <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>
          Configura los detalles del nuevo evento deportivo.
        </Typography>
        <Grid container spacing={3} wrap="wrap">
          <Grid item size={{ xs: 12, md: 4 }}>
            <Box sx={{ bgcolor: '#fff', borderRadius: 3, p: 2.5, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#0f172a', mb: 1 }}>Datos del torneo</Typography>
              <TextField label="Nombre del Torneo" fullWidth margin="normal" value={nombre} onChange={e => setNombre(e.target.value)} />
              <TextField label="Descripcion" fullWidth margin="normal" multiline rows={3} value={descripcion} onChange={e => setDescripcion(e.target.value)} />
              <TextField
                label="Fecha limite de respuesta"
                type="date"
                fullWidth
                margin="normal"
                InputLabelProps={{ shrink: true }}
                value={fechaLimite}
                onChange={e => setFechaLimite(e.target.value)}
              />
              {saveError && (
                <Typography variant="body2" color="error" sx={{ mt: 1 }}>
                  {saveError}
                </Typography>
              )}
              <Box sx={{ display: 'flex', gap: 1.5, mt: 2 }}>
                <Button
                  onClick={handleCancelar}
                  variant="outlined"
                  sx={{ borderColor: '#cbd5f5', color: '#1e293b', fontWeight: 700 }}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleCrear}
                  variant="contained"
                  disabled={!nombre || !descripcion || saveLoading}
                  sx={{ bgcolor: '#f97316', fontWeight: 700, '&:hover': { bgcolor: '#ea580c' } }}
                >
                  {saveLoading ? 'Guardando...' : 'Crear'}
                </Button>
              </Box>
            </Box>
          </Grid>
          <Grid item size={{ xs: 12, md: 8 }}>
            <Box sx={{ bgcolor: '#fff', borderRadius: 3, p: 2.5, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#0f172a' }}>Convocar jugadores</Typography>
                <Chip
                  label={`Seleccionados: ${convocados.length}`}
                  sx={{ bgcolor: '#fff7ed', color: '#ea580c', fontWeight: 700 }}
                />
              </Box>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={12} sm={5}>
                  <TextField
                    placeholder="Buscar por nombre..."
                    size="small"
                    fullWidth
                    value={filtroNombre}
                    onChange={e => setFiltroNombre(e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon fontSize="small" sx={{ color: '#94a3b8' }} />
                        </InputAdornment>
                      )
                    }}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        bgcolor: '#f8fafc',
                        borderRadius: 2,
                        '& fieldset': { borderColor: '#e2e8f0' },
                        '&:hover fieldset': { borderColor: '#cbd5e1' },
                        '&.Mui-focused fieldset': { borderColor: '#94a3b8' }
                      }
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={3.5}>
                  <TextField
                    label="Desde"
                    type="date"
                    size="small"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    value={filtroDesde}
                    onChange={e => setFiltroDesde(e.target.value)}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        bgcolor: '#f8fafc',
                        borderRadius: 2,
                        '& fieldset': { borderColor: '#e2e8f0' },
                        '&:hover fieldset': { borderColor: '#cbd5e1' },
                        '&.Mui-focused fieldset': { borderColor: '#94a3b8' }
                      }
                    }}
                  />
                </Grid>
                <Grid item xs={12} sm={3.5}>
                  <TextField
                    label="Hasta"
                    type="date"
                    size="small"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    value={filtroHasta}
                    onChange={e => setFiltroHasta(e.target.value)}
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        bgcolor: '#f8fafc',
                        borderRadius: 2,
                        '& fieldset': { borderColor: '#e2e8f0' },
                        '&:hover fieldset': { borderColor: '#cbd5e1' },
                        '&.Mui-focused fieldset': { borderColor: '#94a3b8' }
                      }
                    }}
                  />
                </Grid>
                {hasFiltros && (
                  <Grid item xs={12}>
                    <Button variant="text" size="medium" onClick={handleClearFiltros} sx={{ color: '#64748b', fontWeight: 700 }}>
                      Limpiar filtros
                    </Button>
                  </Grid>
                )}
              </Grid>
              {alumnosError && <Typography variant="body2" color="error" sx={{ mb: 1 }}>{alumnosError}</Typography>}
              {solvenciasError && <Typography variant="body2" color="error" sx={{ mb: 1 }}>{solvenciasError}</Typography>}
              <Box sx={{ height: 430, width: '100%' }}>
                <DataGrid
                  rows={alumnosRows}
                  columns={alumnosColumns}
                  checkboxSelection
                  disableRowSelectionOnClick
                  keepNonExistentRowsSelected
                  loading={alumnosLoading}
                  rowSelectionModel={convocados}
                  onRowSelectionModelChange={(newSelection) => setConvocados(newSelection)}
                  paginationModel={paginationModel}
                  onPaginationModelChange={setPaginationModel}
                  pageSizeOptions={[10, 25, 50]}
                  rowHeight={56}
                  headerHeight={44}
                  sx={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 2.5,
                    bgcolor: '#fff',
                    '& .MuiDataGrid-columnHeaders': { bgcolor: '#f8fafc', color: '#64748b', fontWeight: 700 },
                    '& .MuiDataGrid-columnHeaderTitle': { fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' },
                    '& .MuiDataGrid-row': { borderBottom: '1px solid #e2e8f0' },
                    '& .MuiDataGrid-cell': { borderBottom: 'none', color: '#475569' },
                    '& .MuiDataGrid-row:hover': { bgcolor: '#f8fafc' },
                    '& .MuiDataGrid-footerContainer': { borderTop: '1px solid #e2e8f0' }
                  }}
                />
              </Box>
            </Box>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
}

export default TorneoCrear;
