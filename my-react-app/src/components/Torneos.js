import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  InputAdornment,
  ListItemText,
  MenuItem,
  Snackbar,
  TextField,
  Typography
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import { useNavigate } from 'react-router-dom';
import RosterCreateDialog from './RosterCreateDialog';
import RosterTemplateDialog from './RosterTemplateDialog';

function Torneos() {
  const token = localStorage.getItem('token');
  const navigate = useNavigate();

  const buildAuthHeaders = useCallback((baseHeaders = {}) => ({
    ...baseHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }), [token]);

  const [open, setOpen] = useState(false);
  const [openCrear, setOpenCrear] = useState(false);
  const [dialogEliminarOpen, setDialogEliminarOpen] = useState(false);
  const [torneoAEliminar, setTorneoAEliminar] = useState(null);
  const [dialogEliminarRosterOpen, setDialogEliminarRosterOpen] = useState(false);
  const [rosterAEliminar, setRosterAEliminar] = useState(null);
  const [rosterDialogOpen, setRosterDialogOpen] = useState(false);
  const [rosterTemplateOpen, setRosterTemplateOpen] = useState(false);
  const [rosterPrefillTorneoId, setRosterPrefillTorneoId] = useState('');
  const [expandedTorneoId, setExpandedTorneoId] = useState('');

  const [torneos, setTorneos] = useState([]);
  const [torneosError, setTorneosError] = useState('');
  const [rosters, setRosters] = useState([]);
  const [rostersLoading, setRostersLoading] = useState(false);
  const [rostersError, setRostersError] = useState('');
  const [downloadingRosterId, setDownloadingRosterId] = useState('');
  const [savingRosterId, setSavingRosterId] = useState('');

  const [editId, setEditId] = useState(null);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fechaLimite, setFechaLimite] = useState('');
  const [convocados, setConvocados] = useState([]);

  const [alumnos, setAlumnos] = useState([]);
  const [alumnosLoading, setAlumnosLoading] = useState(false);
  const [alumnosError, setAlumnosError] = useState('');
  const [solvencias, setSolvencias] = useState({});
  const [solvenciasLoading, setSolvenciasLoading] = useState(false);
  const [solvenciasError, setSolvenciasError] = useState('');

  const [filtroNombre, setFiltroNombre] = useState('');
  const [filtroDesde, setFiltroDesde] = useState('');
  const [filtroHasta, setFiltroHasta] = useState('');
  const [filtroSexo, setFiltroSexo] = useState('todos');
  const [filtroCategoria, setFiltroCategoria] = useState([]);
  const [filtroDivision, setFiltroDivision] = useState('todos');
  const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 10 });

  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [crearNombre, setCrearNombre] = useState('');
  const [crearDescripcion, setCrearDescripcion] = useState('');
  const [crearFechaLimite, setCrearFechaLimite] = useState('');
  const [crearLoading, setCrearLoading] = useState(false);
  const [crearError, setCrearError] = useState('');
  const [uiAlert, setUiAlert] = useState({ open: false, severity: 'success', title: '', message: '' });

  const showUiAlert = (severity, title, message) => {
    setUiAlert({ open: true, severity, title, message });
  };

  const fetchTorneosFrescos = useCallback(async () => {
    setTorneosError('');
    const res = await fetch(`${process.env.REACT_APP_API_URL}/api/torneos?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: buildAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok || !Array.isArray(data)) throw new Error('Respuesta invalida');
    setTorneos(data);
    return data;
  }, [buildAuthHeaders]);

  const fetchRostersFrescos = useCallback(async () => {
    setRostersLoading(true);
    setRostersError('');
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/rosters?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: buildAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error('No se pudieron cargar los rosters');
      setRosters(data);
      return data;
    } catch (err) {
      setRosters([]);
      setRostersError(err.message || 'No se pudieron cargar los rosters');
      throw err;
    } finally {
      setRostersLoading(false);
    }
  }, [buildAuthHeaders]);

  useEffect(() => {
    const cargar = async () => {
      try {
        await fetchTorneosFrescos();
      } catch (err) {
        setTorneos([]);
        setTorneosError(err.message || 'No se pudieron cargar los torneos');
        return;
      }

      try {
        await fetchRostersFrescos();
      } catch (err) {
        console.warn('No se pudieron cargar los rosters, pero la lista de torneos sigue disponible:', err);
      }
    };
    cargar();
  }, [fetchTorneosFrescos, fetchRostersFrescos]);

  useEffect(() => {
    if (!open) return;
    const fetchAlumnos = async () => {
      setAlumnosLoading(true);
      setAlumnosError('');
      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos`, {
          headers: buildAuthHeaders()
        });
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
  }, [open, buildAuthHeaders]);

  useEffect(() => {
    if (!open) return;
    const fetchSolvencias = async () => {
      setSolvenciasLoading(true);
      setSolvenciasError('');
      try {
        const hoy = new Date();
        const mes = hoy.getMonth() + 1;
        const anio = hoy.getFullYear();
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades?mes=${mes}&anio=${anio}`, {
          headers: buildAuthHeaders()
        });
        const data = await res.json();
        if (!res.ok || !Array.isArray(data)) throw new Error('Error al obtener mensualidades');
        const map = {};
        data.forEach((m) => {
          const idAlumno = m.id_alumno?._id || m.id_alumno;
          if (idAlumno) map[idAlumno] = m.estatus || 'Pendiente';
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
  }, [open, buildAuthHeaders]);

  useEffect(() => {
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
  }, [filtroNombre, filtroDesde, filtroHasta, filtroSexo, filtroCategoria, filtroDivision]);

  const handleClose = () => {
    setOpen(false);
    setEditId(null);
    setNombre('');
    setDescripcion('');
    setFechaLimite('');
    setConvocados([]);
    setFiltroNombre('');
    setFiltroDesde('');
    setFiltroHasta('');
    setFiltroSexo('todos');
    setFiltroCategoria([]);
    setFiltroDivision('todos');
    setPaginationModel({ page: 0, pageSize: 10 });
    setSolvencias({});
    setSolvenciasError('');
    setSaveError('');
  };

  const categoriaOptions = useMemo(() => {
    const values = Array.from(new Set(
      alumnos
        .map((al) => String(al?.categoria || '').trim())
        .filter(Boolean)
    ));
    return values.sort((a, b) => a.localeCompare(b));
  }, [alumnos]);

  const divisionOptions = useMemo(() => {
    const values = Array.from(new Set(
      alumnos
        .map((al) => String(al?.division || '').trim())
        .filter(Boolean)
    ));
    return values.sort((a, b) => a.localeCompare(b));
  }, [alumnos]);

  const handleEditar = async (torneo) => {
    const torneoId = torneo._id || torneo.id;
    if (!torneoId) return;

    setSaveError('');
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/torneos/${torneoId}?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: buildAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al obtener torneo');

      setEditId(data._id);
      setNombre(data.nombre || '');
      setDescripcion(data.descripcion || '');
      setFechaLimite(data.fecha_limite ? data.fecha_limite.substring(0, 10) : '');
      const convocadosIds = Array.isArray(data.convocados)
        ? data.convocados.map((c) => c.alumno?._id || c.alumno || c._id || c)
        : [];
      setConvocados(convocadosIds);
      setOpen(true);
    } catch (err) {
      setSaveError(err.message);
      showUiAlert('error', 'Operacion fallida', err.message || 'No se pudo cargar el torneo.');
    }
  };

  const handleGuardar = async () => {
    if (!editId) return;

    setSaveError('');
    setSaveLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/torneos/${editId}`, {
        method: 'PUT',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          nombre,
          descripcion,
          fecha_limite: fechaLimite || null,
          convocados
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar torneo');

      await fetchTorneosFrescos();
      handleClose();
      showUiAlert('success', 'Operacion completada', 'Torneo actualizado con exito.');
    } catch (err) {
      setSaveError(err.message);
      showUiAlert('error', 'Operacion fallida', err.message || 'No se pudo actualizar el torneo.');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleEliminar = async () => {
    if (!torneoAEliminar) return;

    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/torneos/${torneoAEliminar}`, {
        method: 'DELETE',
        headers: buildAuthHeaders()
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'No se pudo eliminar el torneo');
      }

      await fetchTorneosFrescos();
      setDialogEliminarOpen(false);
      setTorneoAEliminar(null);
      showUiAlert('success', 'Operacion completada', 'Torneo eliminado con exito.');
    } catch (err) {
      setDialogEliminarOpen(false);
      setTorneoAEliminar(null);
      showUiAlert('error', 'Operacion fallida', err.message || 'No se pudo eliminar el torneo.');
    }
  };

  const handleAbrirCrear = () => {
    setCrearNombre('');
    setCrearDescripcion('');
    setCrearFechaLimite('');
    setCrearError('');
    setOpenCrear(true);
  };

  const handleCrearTorneo = async () => {
    if (!crearNombre.trim()) return;

    setCrearLoading(true);
    setCrearError('');
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/torneos`, {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          nombre: crearNombre.trim(),
          descripcion: crearDescripcion.trim(),
          fecha_limite: crearFechaLimite || null,
          convocados: []
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudo crear el torneo');

      await fetchTorneosFrescos();
      setOpenCrear(false);
      showUiAlert('success', 'Operacion completada', 'Torneo creado con exito.');
    } catch (err) {
      setCrearError(err.message || 'No se pudo crear el torneo');
      showUiAlert('error', 'Operacion fallida', err.message || 'No se pudo crear el torneo.');
    } finally {
      setCrearLoading(false);
    }
  };

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

  const getAlumnoId = (alumno) => alumno._id || alumno.id;

  const alumnosFiltrados = alumnos
    .filter((al) => {
      const nombreCompleto = `${al.nombres || ''} ${al.apellidos || ''}`.toLowerCase();
      if (filtroNombre && !nombreCompleto.includes(filtroNombre.toLowerCase())) return false;

      const sexo = String(al?.sexo || '').trim().toLowerCase();
      if (filtroSexo !== 'todos' && sexo !== filtroSexo) return false;

      const categoria = String(al?.categoria || '').trim();
      if (filtroCategoria.length > 0 && !filtroCategoria.includes(categoria)) return false;

      const division = String(al?.division || '').trim();
      if (filtroDivision !== 'todos' && division !== filtroDivision) return false;

      const base = getBaseDate(al.fecha_nacimiento);
      if (filtroDesde && (!base || base < filtroDesde)) return false;
      if (filtroHasta && (!base || base > filtroHasta)) return false;
      return true;
    })
    .sort((a, b) => {
      const convocadosSet = new Set(convocados);
      const aSel = convocadosSet.has(getAlumnoId(a));
      const bSel = convocadosSet.has(getAlumnoId(b));
      if (aSel === bSel) return 0;
      return aSel ? -1 : 1;
    });

  const alumnosRows = alumnosFiltrados.map((al) => ({
    id: getAlumnoId(al),
    nombre_completo: `${al.nombres || ''} ${al.apellidos || ''}`.trim() || '-',
    sexo: al.sexo || '-',
    categoria: al.categoria || '-',
    division: al.division || '-',
    fecha_nacimiento: formatFechaNacimiento(al.fecha_nacimiento) || '-',
    sede: al.sede?.nombre || '-',
    solvencia: solvencias[getAlumnoId(al)] || (solvenciasLoading ? 'Cargando...' : 'Sin mensualidad')
  }));

  const alumnosColumns = [
    { field: 'nombre_completo', headerName: 'Nombre completo', flex: 1.3, minWidth: 220 },
    { field: 'sexo', headerName: 'Sexo', flex: 0.75, minWidth: 120 },
    { field: 'categoria', headerName: 'Categoria', flex: 0.9, minWidth: 140 },
    { field: 'division', headerName: 'Division', flex: 0.9, minWidth: 150 },
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
          pagado: { label: 'Pagado', color: '#166534', bg: '#dcfce7' },
          pendiente: { label: 'Pendiente', color: '#c2410c', bg: '#ffedd5' },
          retrasado: { label: 'Retrasado', color: '#b91c1c', bg: '#fee2e2' },
          'en revision': { label: 'En revision', color: '#1d4ed8', bg: '#e0f2fe' },
          exonerado: { label: 'Exonerado', color: '#475569', bg: '#e2e8f0' },
          abono: { label: 'Abono', color: '#c2410c', bg: '#ffedd5' },
          'sin mensualidad': { label: 'Sin mensualidad', color: '#475569', bg: '#e2e8f0' },
          'cargando...': { label: 'Cargando...', color: '#475569', bg: '#e2e8f0' }
        };
        const meta = map[raw] || { label: params.value || '-', color: '#475569', bg: '#e2e8f0' };
        return (
          <Chip
            size="small"
            label={meta.label}
            sx={{
              bgcolor: meta.bg,
              color: meta.color,
              fontWeight: 700,
              borderRadius: 999,
              px: 0.5
            }}
          />
        );
      }
    }
  ];

  const handleClearFiltros = () => {
    setFiltroNombre('');
    setFiltroDesde('');
    setFiltroHasta('');
    setFiltroSexo('todos');
    setFiltroCategoria([]);
    setFiltroDivision('todos');
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
  };

  const rostersPorTorneo = useMemo(() => {
    const map = {};
    rosters.forEach((roster) => {
      const torneoId = roster?.torneo?._id || roster?.torneo || '';
      if (!torneoId) return;
      if (!map[torneoId]) map[torneoId] = [];
      map[torneoId].push(roster);
    });
    return map;
  }, [rosters]);

  const descargarRosterPdf = async (roster) => {
    const rosterId = roster?._id || roster?.id;
    if (!rosterId) return;

    setDownloadingRosterId(rosterId);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/rosters/${rosterId}/pdf`, {
        headers: buildAuthHeaders()
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'No se pudo descargar el PDF del roster');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `roster-${rosterId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      showUiAlert('error', 'Operacion fallida', err.message || 'No se pudo descargar el PDF del roster.');
    } finally {
      setDownloadingRosterId('');
    }
  };

  const actualizarEstatusRoster = async (roster, nuevoStatus) => {
    const rosterId = roster?._id || roster?.id;
    if (!rosterId) return;

    setSavingRosterId(rosterId);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/rosters/${rosterId}/status`, {
        method: 'PATCH',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status: nuevoStatus })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudo actualizar el estatus del roster');

      await fetchRostersFrescos();
      showUiAlert('success', 'Operacion completada', 'Estatus de roster actualizado.');
    } catch (err) {
      showUiAlert('error', 'Operacion fallida', err.message || 'No se pudo actualizar el estatus del roster.');
    } finally {
      setSavingRosterId('');
    }
  };

  const eliminarRoster = async () => {
    const rosterId = rosterAEliminar?._id || rosterAEliminar?.id;
    if (!rosterId) return;

    setSavingRosterId(rosterId);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/rosters/${rosterId}`, {
        method: 'DELETE',
        headers: buildAuthHeaders()
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'No se pudo eliminar el roster');

      await fetchRostersFrescos();
      setDialogEliminarRosterOpen(false);
      setRosterAEliminar(null);
      showUiAlert('success', 'Operacion completada', 'Roster eliminado con exito.');
    } catch (err) {
      setDialogEliminarRosterOpen(false);
      setRosterAEliminar(null);
      showUiAlert('error', 'Operacion fallida', err.message || 'No se pudo eliminar el roster.');
    } finally {
      setSavingRosterId('');
    }
  };

  const isPlazoCerrado = (fechaLimiteRaw) => {
    if (!fechaLimiteRaw) return false;
    const fechaLimite = new Date(fechaLimiteRaw);
    if (Number.isNaN(fechaLimite.getTime())) return false;
    return fechaLimite.getTime() < Date.now();
  };

  const getTorneoInitials = (nombreTorneo) => {
    const words = String(nombreTorneo || '').trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return 'TO';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#ffffff', p: { xs: 1.5, md: 2 } }}>
      <Box sx={{ mb: 1.1 }}>
        <Typography variant="h5" sx={{ fontWeight: 800, color: '#1f2937', lineHeight: 1.05, fontSize: { xs: 27, md: 29 } }}>
          Torneos
        </Typography>
        <Typography variant="body2" sx={{ color: '#7b8797', fontSize: 12.5, mt: 0.2 }}>
          Crea y gestiona torneos, arma los equipos y controla la respuesta de cada atleta convocado.
        </Typography>
      </Box>

      {torneosError && (
        <Alert severity="error" sx={{ mb: 1.5 }}>
          {torneosError}
        </Alert>
      )}

      <Box sx={{ display: 'flex', gap: 1.1, flexWrap: 'wrap', mb: 1.8 }}>
        <Button
          variant="contained"
          size="small"
          sx={{
            backgroundColor: '#f97316',
            textTransform: 'none',
            fontWeight: 700,
            borderRadius: 1.6,
            px: 1.2,
            py: 0.4,
            minHeight: 28,
            fontSize: 12,
            boxShadow: 'none',
            '&:hover': { backgroundColor: '#ea580c' }
          }}
          onClick={handleAbrirCrear}
        >
          + Crear torneo
        </Button>
        <Button
          variant="outlined"
          size="small"
          sx={{ textTransform: 'none', borderRadius: 1.6, minHeight: 28, fontSize: 12, borderColor: '#dbe3ef', color: '#64748b' }}
          onClick={() => setRosterTemplateOpen(true)}
        >
          Configurar membrete roster
        </Button>
      </Box>

      <Dialog
        open={open}
        onClose={handleClose}
        fullWidth
        maxWidth="xl"
        PaperProps={{ sx: { width: '95vw', maxWidth: 1400 } }}
      >
        <DialogTitle>Editar Torneo</DialogTitle>
        <DialogContent sx={{ bgcolor: '#f8fafc' }}>
          <Grid container spacing={3} sx={{ mt: 1 }}>
            <Grid item xs={12} md={4}>
              <Box sx={{ bgcolor: '#fff', borderRadius: 3, p: 2.5, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#0f172a', mb: 1 }}>
                  Datos del torneo
                </Typography>
                <TextField label="Nombre" fullWidth margin="normal" value={nombre} onChange={(e) => setNombre(e.target.value)} />
                <TextField
                  label="Descripcion"
                  fullWidth
                  margin="normal"
                  multiline
                  rows={3}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                />
                <TextField
                  label="Fecha limite de respuesta"
                  type="date"
                  fullWidth
                  margin="normal"
                  InputLabelProps={{ shrink: true }}
                  value={fechaLimite}
                  onChange={(e) => setFechaLimite(e.target.value)}
                />
                {saveError && (
                  <Typography variant="body2" color="error" sx={{ mt: 1 }}>
                    {saveError}
                  </Typography>
                )}
              </Box>
            </Grid>

            <Grid item xs={12} md={8}>
              <Box sx={{ bgcolor: '#fff', borderRadius: 3, p: 2.5, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#0f172a' }}>
                    Convocar jugadores
                  </Typography>
                  <Chip label={`Seleccionados: ${convocados.length}`} sx={{ bgcolor: '#fff7ed', color: '#ea580c', fontWeight: 700 }} />
                </Box>

                <Grid container spacing={2} sx={{ mb: 2 }}>
                  <Grid item xs={12} md={4}>
                    <TextField
                      placeholder="Buscar por nombre..."
                      size="small"
                      fullWidth
                      value={filtroNombre}
                      onChange={(e) => setFiltroNombre(e.target.value)}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon fontSize="small" sx={{ color: '#94a3b8' }} />
                          </InputAdornment>
                        )
                      }}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4} md={2.5}>
                    <TextField
                      select
                      SelectProps={{ native: true }}
                      label="Sexo"
                      size="small"
                      fullWidth
                      value={filtroSexo}
                      onChange={(e) => setFiltroSexo(e.target.value)}
                    >
                      <option value="todos">Todos</option>
                      <option value="femenino">Femenino</option>
                      <option value="masculino">Masculino</option>
                    </TextField>
                  </Grid>
                  <Grid item xs={12} sm={4} md={2.5}>
                    <TextField
                      select
                      label="Categorias"
                      size="small"
                      fullWidth
                      value={filtroCategoria}
                      onChange={(e) => {
                        const { value } = e.target;
                        setFiltroCategoria(typeof value === 'string' ? value.split(',') : value);
                      }}
                      SelectProps={{
                        multiple: true,
                        displayEmpty: true,
                        renderValue: (selected) => {
                          const values = Array.isArray(selected) ? selected : [];
                          return values.length > 0 ? values.join(', ') : 'Todas';
                        }
                      }}
                    >
                      <MenuItem disabled value="">
                        Todas
                      </MenuItem>
                      {categoriaOptions.map((categoria) => (
                        <MenuItem key={categoria} value={categoria}>
                          <Checkbox size="small" checked={filtroCategoria.indexOf(categoria) > -1} />
                          <ListItemText primary={categoria} />
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={12} sm={4} md={3}>
                    <TextField
                      select
                      SelectProps={{ native: true }}
                      label="Division"
                      size="small"
                      fullWidth
                      value={filtroDivision}
                      onChange={(e) => setFiltroDivision(e.target.value)}
                    >
                      <option value="todos">Todas</option>
                      {divisionOptions.map((division) => (
                        <option key={division} value={division}>{division}</option>
                      ))}
                    </TextField>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      label="Desde"
                      type="date"
                      size="small"
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                      value={filtroDesde}
                      onChange={(e) => setFiltroDesde(e.target.value)}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      label="Hasta"
                      type="date"
                      size="small"
                      fullWidth
                      InputLabelProps={{ shrink: true }}
                      value={filtroHasta}
                      onChange={(e) => setFiltroHasta(e.target.value)}
                    />
                  </Grid>
                </Grid>

                {(filtroNombre || filtroDesde || filtroHasta || filtroSexo !== 'todos' || filtroCategoria.length > 0 || filtroDivision !== 'todos') && (
                  <Button variant="text" size="medium" onClick={handleClearFiltros} sx={{ color: '#64748b', fontWeight: 700, mb: 1 }}>
                    Limpiar filtros
                  </Button>
                )}

                {alumnosError && <Typography variant="body2" color="error" sx={{ mb: 1 }}>{alumnosError}</Typography>}
                {solvenciasError && <Typography variant="body2" color="error" sx={{ mb: 1 }}>{solvenciasError}</Typography>}

                <Box sx={{ height: 420, width: '100%' }}>
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
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancelar</Button>
          <Button onClick={handleGuardar} variant="contained" sx={{ backgroundColor: '#ff7a00' }} disabled={!nombre || saveLoading}>
            {saveLoading ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={openCrear}
        onClose={() => setOpenCrear(false)}
        fullWidth
        maxWidth="sm"
        PaperProps={{
          sx: {
            borderRadius: 2,
            maxWidth: 470,
            boxShadow: '0 20px 42px rgba(15, 23, 42, 0.2)'
          }
        }}
      >
        <DialogTitle sx={{ px: 2.6, pt: 2.1, pb: 1, fontWeight: 800, color: '#1f2937', fontSize: 22 }}>
          Crear torneo
        </DialogTitle>
        <DialogContent sx={{ px: 2.6, pt: '4px !important', pb: 1 }}>
          <Box sx={{ mb: 1.25 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#7c8798', mb: 0.45 }}>
              Nombre del torneo / liga *
            </Typography>
            <TextField
              fullWidth
              size="small"
              value={crearNombre}
              onChange={(e) => setCrearNombre(e.target.value)}
              placeholder="Ej. Liga Metropolitana 2026"
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 1.2,
                  bgcolor: '#fff',
                  '& fieldset': { borderColor: '#e6ebf2' },
                  '&:hover fieldset': { borderColor: '#d7dee8' },
                  '&.Mui-focused fieldset': { borderColor: '#c9d3e0' }
                }
              }}
            />
          </Box>

          <Box sx={{ mb: 1.25 }}>
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#7c8798', mb: 0.45 }}>
              Descripcion
            </Typography>
            <TextField
              fullWidth
              size="small"
              multiline
              minRows={2}
              value={crearDescripcion}
              onChange={(e) => setCrearDescripcion(e.target.value)}
              placeholder="Sede, disciplina, formato de competencia..."
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 1.2,
                  bgcolor: '#fff',
                  '& fieldset': { borderColor: '#e6ebf2' },
                  '&:hover fieldset': { borderColor: '#d7dee8' },
                  '&.Mui-focused fieldset': { borderColor: '#c9d3e0' }
                }
              }}
            />
          </Box>

          <Box>
            <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#7c8798', mb: 0.45 }}>
              Fecha limite de respuesta *
            </Typography>
            <TextField
              type="date"
              fullWidth
              size="small"
              value={crearFechaLimite}
              onChange={(e) => setCrearFechaLimite(e.target.value)}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: 1.2,
                  bgcolor: '#fff',
                  '& fieldset': { borderColor: '#e6ebf2' },
                  '&:hover fieldset': { borderColor: '#d7dee8' },
                  '&.Mui-focused fieldset': { borderColor: '#c9d3e0' }
                }
              }}
            />
          </Box>

          {crearError && (
            <Typography variant="body2" color="error" sx={{ mt: 1 }}>
              {crearError}
            </Typography>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2.6, pb: 2, pt: 0.7 }}>
          <Button
            onClick={() => setOpenCrear(false)}
            variant="outlined"
            size="small"
            sx={{
              textTransform: 'none',
              borderRadius: 1.6,
              borderColor: '#e2e8f0',
              color: '#64748b',
              minWidth: 72,
              fontWeight: 700
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleCrearTorneo}
            variant="contained"
            size="small"
            disabled={!crearNombre.trim() || crearLoading}
            sx={{
              textTransform: 'none',
              borderRadius: 1.6,
              bgcolor: '#f97316',
              boxShadow: 'none',
              minWidth: 72,
              fontWeight: 700,
              '&:hover': { bgcolor: '#ea580c' }
            }}
          >
            {crearLoading ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Typography variant="h6" sx={{ mt: 1.2, mb: 1, fontWeight: 700, color: '#334155', fontSize: 16 }}>Torneos creados</Typography>
      <Box sx={{ display: 'grid', gap: 0.8 }}>
        {torneos.map((torneo) => {
          const convocadosTorneo = Array.isArray(torneo.convocados) ? torneo.convocados : [];
          const totalConvocados = convocadosTorneo.length;
          const aceptados = convocadosTorneo.filter((c) => c.estado === 'aceptado').length;
          const rechazados = convocadosTorneo.filter((c) => c.estado === 'rechazado').length;
          const pendientes = convocadosTorneo.filter((c) => c.estado === 'pendiente').length;
          const torneoId = torneo._id || torneo.id;
          const rostersDeTorneo = rostersPorTorneo[torneoId] || [];
          const plazoCerrado = isPlazoCerrado(torneo.fecha_limite);

          return (
            <Box
              key={torneoId}
              sx={{
                borderRadius: 1.8,
                border: '1px solid #e5e7eb',
                boxShadow: '0 8px 22px rgba(15, 23, 42, 0.07)',
                bgcolor: '#fff',
                overflow: 'hidden',
                transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
                '&:hover': {
                  borderColor: '#dbe3ef',
                  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.1)'
                }
              }}
            >
              <Box sx={{ px: 1.3, py: 1.05, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box
                  sx={{
                    width: 22,
                    height: 22,
                    borderRadius: 1,
                    bgcolor: '#fff7ed',
                    color: '#f97316',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 9,
                    fontWeight: 800,
                    flexShrink: 0
                  }}
                >
                  {getTorneoInitials(torneo.nombre)}
                </Box>

                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                  <Typography sx={{ fontSize: 13.2, color: '#1e293b', fontWeight: 700, lineHeight: 1.15 }}>
                    {torneo.nombre}
                  </Typography>
                  <Typography sx={{ fontSize: 11.4, color: '#8090a3', mt: 0.1 }}>
                    {torneo.descripcion || 'Sin descripcion'}
                  </Typography>
                  <Box sx={{ mt: 0.35, display: 'flex', gap: 0.9, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Typography sx={{ fontSize: 10.5, color: '#6b7280', fontWeight: 600 }}>
                      Limite de respuesta: {torneo.fecha_limite ? torneo.fecha_limite.substring(0, 10) : '-'}
                    </Typography>
                    <Typography sx={{ fontSize: 10.5, color: '#6b7280', fontWeight: 600 }}>
                      {rostersDeTorneo.length} equipos
                    </Typography>
                    <Typography sx={{ fontSize: 10.5, color: '#6b7280', fontWeight: 600 }}>
                      {totalConvocados} convocados
                    </Typography>
                    <Chip
                      size="small"
                      label={plazoCerrado ? 'Plazo cerrado' : 'Plazo activo'}
                      sx={{
                        height: 18,
                        fontSize: 9.6,
                        bgcolor: plazoCerrado ? '#fff1f2' : '#ecfdf5',
                        color: plazoCerrado ? '#be123c' : '#166534',
                        fontWeight: 700
                      }}
                    />
                  </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.55, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => navigate(`/torneos/${torneoId}/equipos`)}
                    sx={{
                      borderRadius: 1.4,
                      textTransform: 'none',
                      minWidth: 84,
                      px: 0.95,
                      py: 0.3,
                      minHeight: 27,
                      fontWeight: 700,
                      fontSize: 11.5,
                      bgcolor: '#0f172a',
                      boxShadow: 'none',
                      '&:hover': { bgcolor: '#1e293b' }
                    }}
                  >
                    Ver equipos
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => handleEditar(torneo)}
                    sx={{
                      borderRadius: 1.4,
                      textTransform: 'none',
                      minWidth: 60,
                      px: 0.9,
                      py: 0.3,
                      minHeight: 27,
                      borderColor: '#e2e8f0',
                      color: '#64748b',
                      fontSize: 11.5
                    }}
                  >
                    Editar
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    color="error"
                    onClick={() => {
                      setTorneoAEliminar(torneo._id || torneo.id);
                      setDialogEliminarOpen(true);
                    }}
                    sx={{
                      borderRadius: 1.4,
                      textTransform: 'none',
                      minWidth: 66,
                      px: 0.9,
                      py: 0.3,
                      minHeight: 27,
                      borderColor: '#fecaca',
                      fontSize: 11.5
                    }}
                  >
                    Eliminar
                  </Button>
                </Box>
              </Box>

              {false && (
                <Box sx={{ px: 1.6, pb: 1.7, pt: 1, borderTop: '1px solid #eef2f7', bgcolor: '#ffffff' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1.2, flexWrap: 'wrap' }}>
                    <Box>
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => setExpandedTorneoId('')}
                        sx={{
                          textTransform: 'none',
                          color: '#64748b',
                          fontSize: 11.5,
                          px: 0,
                          minWidth: 0,
                          mb: 0.25,
                          '&:hover': { bgcolor: 'transparent', color: '#334155' }
                        }}
                      >
                        ← Volver a torneos
                      </Button>
                      <Typography sx={{ fontSize: 30, lineHeight: 1.05, fontWeight: 800, color: '#0f172a' }}>{torneo.nombre}</Typography>
                      <Typography sx={{ fontSize: 12, color: '#64748b' }}>{torneo.descripcion || 'Sin descripcion'}</Typography>
                    </Box>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => {
                        setRosterPrefillTorneoId(torneo._id || torneo.id || '');
                        setRosterDialogOpen(true);
                      }}
                      sx={{
                        textTransform: 'none',
                        borderRadius: 2,
                        px: 1.3,
                        py: 0.55,
                        fontWeight: 700,
                        fontSize: 12,
                        bgcolor: '#f97316',
                        boxShadow: 'none',
                        '&:hover': { bgcolor: '#ea580c' }
                      }}
                    >
                      + Agregar equipo
                    </Button>
                  </Box>

                  <Grid container spacing={1.1} sx={{ mt: 0.9 }}>
                    <Grid item xs={12} sm={6} md={3}>
                      <Box sx={{ border: '1px solid #e6ebf2', borderRadius: 1.8, p: 1.2 }}>
                        <Typography sx={{ fontSize: 10, letterSpacing: '0.08em', color: '#94a3b8', fontWeight: 800 }}>CONVOCADOS</Typography>
                        <Typography sx={{ fontSize: 34, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{totalConvocados}</Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <Box sx={{ border: '1px solid #e6ebf2', borderRadius: 1.8, p: 1.2 }}>
                        <Typography sx={{ fontSize: 10, letterSpacing: '0.08em', color: '#94a3b8', fontWeight: 800 }}>ACEPTADOS</Typography>
                        <Typography sx={{ fontSize: 34, fontWeight: 800, color: '#16a34a', lineHeight: 1 }}>{aceptados}</Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <Box sx={{ border: '1px solid #e6ebf2', borderRadius: 1.8, p: 1.2 }}>
                        <Typography sx={{ fontSize: 10, letterSpacing: '0.08em', color: '#94a3b8', fontWeight: 800 }}>RECHAZADOS</Typography>
                        <Typography sx={{ fontSize: 34, fontWeight: 800, color: '#dc2626', lineHeight: 1 }}>{rechazados}</Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                      <Box sx={{ border: '1px solid #e6ebf2', borderRadius: 1.8, p: 1.2 }}>
                        <Typography sx={{ fontSize: 10, letterSpacing: '0.08em', color: '#94a3b8', fontWeight: 800 }}>PENDIENTES</Typography>
                        <Typography sx={{ fontSize: 34, fontWeight: 800, color: '#a16207', lineHeight: 1 }}>{pendientes}</Typography>
                      </Box>
                    </Grid>
                  </Grid>

                  <Typography sx={{ fontSize: 28, fontWeight: 800, color: '#0f172a', mt: 1.2, mb: 0.8 }}>
                    Equipos / Rosters
                  </Typography>

                  {rostersLoading && (
                    <Typography sx={{ fontSize: 13, color: '#64748b' }}>
                      Cargando rosters...
                    </Typography>
                  )}

                  {!rostersLoading && rostersError && (
                    <Typography sx={{ fontSize: 13, color: '#dc2626' }}>
                      {rostersError}
                    </Typography>
                  )}

                  {!rostersLoading && !rostersError && rostersDeTorneo.length === 0 && (
                    <Typography sx={{ fontSize: 13, color: '#64748b' }}>
                      Aun no hay equipos para este torneo.
                    </Typography>
                  )}

                  {!rostersLoading && !rostersError && rostersDeTorneo.length > 0 && (
                    <Grid container spacing={1.2}>
                      {rostersDeTorneo.map((roster) => {
                        const rosterId = roster._id || roster.id;
                        const rosterJugadorIds = (Array.isArray(roster.jugadores) ? roster.jugadores : []).map((j) => String(j));
                        const estadoPorAlumno = new Map(
                          convocadosTorneo.map((c) => [String(c?.alumno?._id || c?.alumno || ''), String(c?.estado || 'pendiente')])
                        );

                        let rAceptados = 0;
                        let rRechazados = 0;
                        let rPendientes = 0;
                        rosterJugadorIds.forEach((jugadorId) => {
                          const estado = estadoPorAlumno.get(jugadorId) || 'pendiente';
                          if (estado === 'aceptado') rAceptados += 1;
                          else if (estado === 'rechazado') rRechazados += 1;
                          else rPendientes += 1;
                        });

                        const totalJugadoras = rosterJugadorIds.length;
                        const sublinea = [roster.categoria || 'Sin categoria', roster.division || 'Sin division'].join(' | ');

                        return (
                          <Grid item xs={12} sm={6} md={4} key={rosterId}>
                            <Box sx={{ border: '1px solid #e6ebf2', borderRadius: 2, p: 1.1, boxShadow: '0 10px 20px rgba(15, 23, 42, 0.05)' }}>
                              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                                <Box sx={{ minWidth: 0 }}>
                                  <Typography sx={{ fontSize: 19, fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
                                    {roster.liga_name || `${torneo.nombre} ${roster.categoria || ''}`.trim()}
                                  </Typography>
                                  <Typography sx={{ fontSize: 11.5, color: '#64748b', mt: 0.25 }}>{sublinea}</Typography>
                                </Box>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  color="error"
                                  disabled={savingRosterId === rosterId}
                                  onClick={() => {
                                    setRosterAEliminar(roster);
                                    setDialogEliminarRosterOpen(true);
                                  }}
                                  sx={{ borderRadius: 1.4, textTransform: 'none', fontSize: 10.5, minWidth: 62, py: 0.2, px: 0.8 }}
                                >
                                  Eliminar
                                </Button>
                              </Box>

                              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.9 }}>
                                <Chip size="small" label={`${totalJugadoras} convocados`} sx={{ bgcolor: '#eff6ff', color: '#1e3a8a', fontWeight: 700, fontSize: 10.5 }} />
                                <Chip size="small" label={`${rAceptados} aceptados`} sx={{ bgcolor: '#ecfdf5', color: '#166534', fontWeight: 700, fontSize: 10.5 }} />
                                <Chip size="small" label={`${rRechazados} rechazados`} sx={{ bgcolor: '#fff1f2', color: '#b91c1c', fontWeight: 700, fontSize: 10.5 }} />
                                <Chip size="small" label={`${rPendientes} pendientes`} sx={{ bgcolor: '#fff7ed', color: '#9a3412', fontWeight: 700, fontSize: 10.5 }} />
                              </Box>

                              <Button
                                fullWidth
                                size="small"
                                variant="contained"
                                onClick={() => descargarRosterPdf(roster)}
                                disabled={downloadingRosterId === rosterId || savingRosterId === rosterId}
                                sx={{
                                  mt: 1,
                                  textTransform: 'none',
                                  borderRadius: 1.6,
                                  minHeight: 30,
                                  fontWeight: 800,
                                  bgcolor: '#f97316',
                                  boxShadow: 'none',
                                  '&:hover': { bgcolor: '#ea580c' }
                                }}
                              >
                                {downloadingRosterId === rosterId ? 'Descargando...' : 'Agregar atletas'}
                              </Button>

                              <Box sx={{ mt: 0.8, border: '1px solid #e5e7eb', borderRadius: 1.3, p: 0.7, bgcolor: '#fff' }}>
                                <Typography sx={{ fontSize: 11, color: '#64748b', mb: 0.5, fontWeight: 700 }}>
                                  Gestionar roster
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 0.6, flexWrap: 'wrap' }}>
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => descargarRosterPdf(roster)}
                                    disabled={downloadingRosterId === rosterId || savingRosterId === rosterId}
                                    sx={{ textTransform: 'none', borderRadius: 1.2, fontSize: 10.5, minHeight: 24 }}
                                  >
                                    PDF
                                  </Button>
                                  <TextField
                                    select
                                    size="small"
                                    value={roster.status || 'borrador'}
                                    onChange={(e) => actualizarEstatusRoster(roster, e.target.value)}
                                    disabled={savingRosterId === rosterId}
                                    sx={{ minWidth: 126 }}
                                  >
                                    <MenuItem value="borrador">Borrador</MenuItem>
                                    <MenuItem value="oficial">Oficial</MenuItem>
                                    <MenuItem value="finalizado">Finalizado</MenuItem>
                                  </TextField>
                                </Box>
                              </Box>
                            </Box>
                          </Grid>
                        );
                      })}
                    </Grid>
                  )}
                </Box>
              )}
            </Box>
          );
        })}
      </Box>

      <Dialog open={dialogEliminarOpen} onClose={() => setDialogEliminarOpen(false)}>
        <DialogTitle>Eliminar torneo</DialogTitle>
        <DialogContent>
          <Typography>Esta seguro de eliminar este torneo?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogEliminarOpen(false)}>Cancelar</Button>
          <Button onClick={handleEliminar} color="error" variant="contained">Eliminar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dialogEliminarRosterOpen} onClose={() => setDialogEliminarRosterOpen(false)}>
        <DialogTitle>Eliminar roster</DialogTitle>
        <DialogContent>
          <Typography>Esta seguro de eliminar este roster?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogEliminarRosterOpen(false)}>Cancelar</Button>
          <Button onClick={eliminarRoster} color="error" variant="contained" disabled={!rosterAEliminar || savingRosterId === (rosterAEliminar?._id || rosterAEliminar?.id)}>
            {savingRosterId === (rosterAEliminar?._id || rosterAEliminar?.id) ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </DialogActions>
      </Dialog>

      <RosterCreateDialog
        open={rosterDialogOpen}
        onClose={() => {
          setRosterDialogOpen(false);
          setRosterPrefillTorneoId('');
        }}
        token={token}
        prefillTorneoId={rosterPrefillTorneoId}
        onCreated={() => {
          fetchRostersFrescos().catch(() => {});
          showUiAlert('success', 'Operacion completada', 'Roster creado con exito.');
        }}
      />

      <RosterTemplateDialog
        open={rosterTemplateOpen}
        onClose={() => setRosterTemplateOpen(false)}
        token={token}
        onSaved={() => showUiAlert('success', 'Operacion completada', 'Membrete de roster actualizado.')}
      />

      <Snackbar
        open={uiAlert.open}
        autoHideDuration={3500}
        onClose={() => setUiAlert((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setUiAlert((prev) => ({ ...prev, open: false }))}
          severity={uiAlert.severity}
          variant="filled"
          sx={{ width: '100%', minWidth: 320, borderRadius: 2 }}
        >
          <AlertTitle sx={{ mb: 0.25, fontWeight: 800 }}>
            {uiAlert.title || (uiAlert.severity === 'success' ? 'Operacion completada' : 'Operacion fallida')}
          </AlertTitle>
          {uiAlert.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default Torneos;
