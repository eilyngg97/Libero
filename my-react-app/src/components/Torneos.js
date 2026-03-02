import React, { useEffect, useState } from 'react';
import { Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, List, ListItem, ListItemText, IconButton, Typography, Accordion, AccordionSummary, AccordionDetails, Box, Grid, Chip, InputAdornment, Snackbar, Alert, Paper, Avatar } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { DataGrid } from '@mui/x-data-grid';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SportsSoccerIcon from '@mui/icons-material/SportsSoccer';
import VisibilityIcon from '@mui/icons-material/Visibility';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import EventIcon from '@mui/icons-material/Event';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import PersonIcon from '@mui/icons-material/Person';
import DescriptionIcon from '@mui/icons-material/Description';
import SportsVolleyballIcon from '@mui/icons-material/SportsVolleyball';
import GroupsIcon from '@mui/icons-material/Groups';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CloseIcon from '@mui/icons-material/Close';
import DriveFileRenameOutlineIcon from '@mui/icons-material/DriveFileRenameOutline';
import SearchIcon from '@mui/icons-material/Search';
import { useNavigate } from 'react-router-dom';


function Torneos() {
  const [dialogEliminarOpen, setDialogEliminarOpen] = useState(false);
  const [torneoAEliminar, setTorneoAEliminar] = useState(null);
    // Estado para saber si se está editando un partido
    const [editandoPartido, setEditandoPartido] = useState(false);
    const [partidoEditId, setPartidoEditId] = useState(null);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fechaLimite, setFechaLimite] = useState('');
  const [torneos, setTorneos] = useState([]);
  const [editId, setEditId] = useState(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [modalPartidos, setModalPartidos] = useState(false);
  const [torneoActual, setTorneoActual] = useState(null);
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
  const [convocadosModalOpen, setConvocadosModalOpen] = useState(false);
  const [convocadosModalTitle, setConvocadosModalTitle] = useState('');
  const [convocadosModalList, setConvocadosModalList] = useState([]);

  // --- PARTIDOS ---
  const [partidos, setPartidos] = useState([]);
  const [partidoLoading, setPartidoLoading] = useState(false);
  const [partidoError, setPartidoError] = useState('');
  const [partidoSuccess, setPartidoSuccess] = useState(false);
  const [partidoForm, setPartidoForm] = useState({
    nombre: '',
    direccion: '',
    fecha: '',
    hora: '',
    monto: '',
    monto_inscripcion: '',
    monto_acompanante: '',
    entrenador: '',
    equipo_contrario: '',
    jugadores: []
  });
  const alumnosEjemplo = [
    { id: 1, nombre: 'Juan Pérez' },
    { id: 2, nombre: 'Ana Gómez' },
    { id: 3, nombre: 'Luis Torres' },
  ];

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  useEffect(() => {
    setPaginationModel(prev => ({ ...prev, page: 0 }));
  }, [filtroNombre, filtroDesde, filtroHasta]);

  useEffect(() => {
    const fetchTorneos = async () => {
      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/torneos`);
        const data = await res.json();
        if (!res.ok || !Array.isArray(data)) throw new Error('Respuesta inválida');
        setTorneos(data);
      } catch {
        setTorneos([]);
      }
    };
    fetchTorneos();
  }, []);

  // Torneo CRUD
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
    setPaginationModel({ page: 0, pageSize: 10 });
    setSolvencias({});
    setSolvenciasError('');
    setSaveError('');
  };
  const handleGuardar = async () => {
    if (!editId) return;
    setSaveError('');
    setSaveLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/torneos/${editId}` , {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre,
          descripcion,
          fecha_limite: fechaLimite || null,
          convocados
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar torneo');
      setTorneos(prev => prev.map(t => (t._id === data._id ? data : t)));
      handleClose();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaveLoading(false);
    }
  };
  const handleEditar = async (t) => {
    const torneoId = t._id || t.id;
    if (!torneoId) return;
    setSaveError('');
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/torneos/${torneoId}`);
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
      setFiltroNombre('');
      setFiltroDesde('');
      setFiltroHasta('');
      setPaginationModel({ page: 0, pageSize: 10 });
      setSolvencias({});
      setSolvenciasError('');
      setOpen(true);
    } catch (err) {
      setSaveError(err.message);
    }
  };
  const handleEliminar = async () => {
    if (!torneoAEliminar) return;
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/torneos/${torneoAEliminar}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'No se pudo eliminar el torneo');
      }
      setTorneos(prev => prev.filter(t => (t._id || t.id) !== torneoAEliminar));
      setDialogEliminarOpen(false);
      setTorneoAEliminar(null);
    } catch (err) {
      window.alert(err.message);
      setDialogEliminarOpen(false);
      setTorneoAEliminar(null);
    }
  };

  // Partidos Modal
  const abrirModalPartidos = (torneo) => {
    console.log('Abriendo modal de partidos para torneo:', torneo);
    setTorneoActual(torneo);
    setModalPartidos(true);
    setPartidos([]); // Aquí podrías cargar los partidos del torneo
    setEditandoPartido(false);
    setPartidoEditId(null);
  };
  const cerrarModalPartidos = () => {
    setModalPartidos(false);
    setPartidoError('');
    setEditandoPartido(false);
    setPartidoEditId(null);
    setPartidoForm({
      nombre: '',
      direccion: '',
      fecha: '',
      hora: '',
      monto: '',
      monto_inscripcion: '',
      monto_acompanante: '',
      entrenador: '',
      equipo_contrario: '',
      jugadores: []
    });
  };
  const handleCrearPartido = async () => {
    const torneoId = torneoActual?._id || torneoActual?.id;
    if (!torneoId) return;
    setPartidoError('');
    setPartidoLoading(true);
    try {
      let res, data;
      if (editandoPartido && partidoEditId) {
        // Editar partido existente
        res = await fetch(`${process.env.REACT_APP_API_URL}/api/torneos/${torneoId}/partidos/${partidoEditId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...partidoForm,
            jugadores: Array.isArray(partidoForm.jugadores) ? partidoForm.jugadores : []
          })
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al editar partido');
        setPartidos(prev => prev.map(p => (p._id === data._id ? data : p)));
        setTorneos(prev => prev.map(t => {
          if ((t._id || t.id) !== torneoId) return t;
          const partidosActuales = Array.isArray(t.partidos) ? t.partidos : [];
          return { ...t, partidos: partidosActuales.map(p => (p._id === data._id ? data : p)) };
        }));
      } else {
        // Crear partido nuevo
        res = await fetch(`${process.env.REACT_APP_API_URL}/api/torneos/${torneoId}/partidos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...partidoForm,
          })
        });
        data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Error al crear partido');
        setPartidos(prev => [...prev, data]);
        setTorneos(prev => prev.map(t => {
          if ((t._id || t.id) !== torneoId) return t;
          const partidosActuales = Array.isArray(t.partidos) ? t.partidos : [];
          return { ...t, partidos: [...partidosActuales, data] };
        }));
      }
      setPartidoForm({
        nombre: '',
        direccion: '',
        fecha: '',
        hora: '',
        monto: '',
        monto_inscripcion: '',
        monto_acompanante: '',
        entrenador: '',
        equipo_contrario: '',
        jugadores: []
      });
      setModalPartidos(false);
      setEditandoPartido(false);
      setPartidoEditId(null);
      setPartidoSuccess(true);
    } catch (err) {
      setPartidoError(err.message);
    } finally {
      setPartidoLoading(false);
    }
  };
  const handleConvocados = (id) => {
    setPartidoForm(form => {
      const jugadores = form.jugadores.includes(id)
        ? form.jugadores.filter(j => j !== id)
        : [...form.jugadores, id];
      return { ...form, jugadores };
    });
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

  const formatFechaPartido = (fecha) => {
    const base = getBaseDate(fecha);
    if (!base) return '';
    const parts = base.split('-');
    if (parts.length !== 3) return '';
    const [anio, mes, dia] = parts;
    return `${dia}/${mes}/${anio}`;
  };

  const getAlumnoId = (al) => al._id || al.id;

  // Filtrar alumnos y ordenar: los seleccionados (convocados) primero
  const alumnosFiltrados = alumnos
    .filter((al) => {
      const nombreCompleto = `${al.nombres || ''} ${al.apellidos || ''}`.toLowerCase();
      if (filtroNombre && !nombreCompleto.includes(filtroNombre.toLowerCase())) return false;
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

  const handleToggleConvocado = (id) => {
    setConvocados(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const alumnosRows = alumnosFiltrados.map((al) => ({
    id: getAlumnoId(al),
    nombre_completo: `${al.nombres || ''} ${al.apellidos || ''}`.trim() || '-',
    fecha_nacimiento: formatFechaNacimiento(al.fecha_nacimiento) || '-',
    sede: al.sede?.nombre || '-',
    solvencia: solvencias[getAlumnoId(al)] || (solvenciasLoading ? 'Cargando...' : 'Sin mensualidad')
  }));

  const alumnosColumns = [
    { field: 'nombre_completo', headerName: 'Nombre completo', flex: 1.3, minWidth: 220 },
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
          'en revision': { label: 'En revisión', color: 'info' },
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

  const totalCostosPartido =
    (Number(partidoForm.monto_inscripcion) || 0) +
    (Number(partidoForm.monto_acompanante) || 0) +
    (Number(partidoForm.monto) || 0);

  const juegosColumns = [
    {
      key: 'fechaHora',
      label: 'FECHA / HORA',
      width: '1.2fr',
      render: (j) => `${formatFechaPartido(j.fecha)} ${j.hora || ''}`.trim()
    },
    {
      key: 'enfrentamiento',
      label: 'ENFRENTAMIENTO',
      width: '1.6fr',
      render: (j) => `${j.nombre || ''} vs ${j.equipo_contrario || ''}`.trim()
    },
    {
      key: 'ubicacion',
      label: 'UBICACION',
      width: '1.2fr',
      render: (j) => j.direccion || '-'
    },
    {
      key: 'inscripcion',
      label: 'INSCRIPCION',
      width: '0.9fr',
      render: (j) => j.monto_inscripcion || '-'
    },
    {
      key: 'acompanante',
      label: 'ACOMPANANTE',
      width: '0.9fr',
      render: (j) => j.monto_acompanante || '-'
    },
    {
      key: 'arbitraje',
      label: 'ARBITRAJE',
      width: '0.9fr',
      render: (j) => j.monto || '-'
    },
    {
      key: 'acciones',
      label: 'ACCIONES',
      width: '1.2fr',
      align: 'right',
      render: (j) => (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
          <IconButton
            edge="end"
            aria-label="editar-juego"
            onClick={() => {
              setPartidoForm({
                nombre: j.nombre || '',
                direccion: j.direccion || '',
                fecha: j.fecha ? j.fecha.substring(0, 10) : '',
                hora: j.hora || '',
                monto: j.monto || '',
                monto_inscripcion: j.monto_inscripcion || '',
                monto_acompanante: j.monto_acompanante || '',
                entrenador: j.entrenador || '',
                equipo_contrario: j.equipo_contrario || '',
                jugadores: Array.isArray(j.jugadores) ? j.jugadores : []
              });
              setEditandoPartido(true);
              setPartidoEditId(j._id || j.id);
              setModalPartidos(true);
            }}
            size="small"
          >
            <DriveFileRenameOutlineIcon fontSize="small" />
          </IconButton>
          <IconButton edge="end" aria-label="eliminar-juego" onClick={() => alert(`Eliminar juego: ${j.nombre}`)} size="small">
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
          <IconButton edge="end" aria-label="ver-convocados-juego" onClick={() => {
            setConvocadosModalTitle(j.nombre || 'Convocados del partido');
            setConvocadosModalList(Array.isArray(j.convocados) ? j.convocados : []);
            setConvocadosModalOpen(true);
          }} size="small">
            <VisibilityIcon fontSize="small" />
          </IconButton>
        </Box>
      )
    }
  ];

  return (
    <div>
      <Button variant="contained" sx={{ mb: 2, backgroundColor: '#f97316' }} onClick={() => navigate('/torneos/crear')}>
        Crear Torneo
      </Button>
      <Dialog
        open={open}
        onClose={handleClose}
        fullWidth
        maxWidth="xl"
        PaperProps={{ sx: { width: '95vw', maxWidth: 1400 } }}
      >
        <DialogTitle>{editId ? 'Editar Torneo' : 'Crear Torneo'}</DialogTitle>
        <DialogContent sx={{ bgcolor: '#f8fafc' }}>
          <Grid container spacing={3} sx={{ mt: 1 }} wrap="wrap">
            <Grid item size={{ xs: 12, md: 4 }}>
              <Box sx={{ bgcolor: '#fff', borderRadius: 3, p: 2.5, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#0f172a', mb: 1 }}>Datos del torneo</Typography>
                <TextField label="Nombre" fullWidth margin="normal" value={nombre} onChange={e => setNombre(e.target.value)} />
                <TextField label="Descripción" fullWidth margin="normal" multiline rows={3} value={descripcion} onChange={e => setDescripcion(e.target.value)} />
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
      <Typography variant="h6" sx={{ mt: 3, mb: 1, fontWeight: 700 }}>Torneos creados</Typography>
      <Box>
        {torneos.map(t => {
          const juegos = Array.isArray(t.partidos) ? t.partidos : [];
          const convocados = Array.isArray(t.convocados) ? t.convocados : [];
          const totalConvocados = convocados.length;
          const aceptados = convocados.filter(c => c.estado === 'aceptado').length;
          const rechazados = convocados.filter(c => c.estado === 'rechazado').length;
          const pendientes = convocados.filter(c => c.estado === 'pendiente').length;
          return (
            <Accordion
              key={t._id || t.id}
              sx={{
                mb: 2,
                borderRadius: 3,
                border: '1px solid #e2e8f0',
                boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)',
                bgcolor: '#fff',
                '&:before': { display: 'none' }
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMoreIcon />}
                sx={{
                  px: 2,
                  py: 1.25,
                  '& .MuiAccordionSummary-content': {
                    alignItems: 'center',
                    my: 0
                  }
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', gap: 2, flexWrap: 'wrap' }}>
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: 2,
                      bgcolor: '#f1f5f9',
                      color: '#475569',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <SportsVolleyballIcon fontSize="small" />
                  </Box>
                  <Typography sx={{ flexGrow: 1, fontWeight: 700, color: '#0f172a' }}>{t.nombre}</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<AddCircleOutlineIcon />}
                      onClick={e => { e.stopPropagation(); abrirModalPartidos(t); }}
                      sx={{
                        borderRadius: 2,
                        textTransform: 'none',
                        borderColor: '#cbd5e1',
                        color: '#334155',
                        bgcolor: '#f8fafc',
                        '&:hover': { bgcolor: '#f1f5f9', borderColor: '#cbd5e1' }
                      }}
                    >
                      Crear juego
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<EditIcon />}
                      onClick={e => { e.stopPropagation(); handleEditar(t); }}
                      sx={{
                        borderRadius: 2,
                        textTransform: 'none',
                        borderColor: '#cbd5e1',
                        color: '#334155',
                        bgcolor: '#f8fafc',
                        '&:hover': { bgcolor: '#f1f5f9', borderColor: '#cbd5e1' }
                      }}
                    >
                      Editar torneo
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="error"
                      startIcon={<DeleteIcon />}
                      onClick={e => {
                        e.stopPropagation();
                        setTorneoAEliminar(t._id || t.id);
                        setDialogEliminarOpen(true);
                      }}
                      sx={{
                        borderRadius: 2,
                        textTransform: 'none',
                        borderColor: '#fecaca',
                        color: '#ef4444',
                        bgcolor: '#fff',
                        '&:hover': { bgcolor: '#fef2f2', borderColor: '#fecaca' }
                      }}
                    >
                      Eliminar torneo
                    </Button>
                  </Box>
                </Box>
              </AccordionSummary>
              <AccordionDetails sx={{ px: 2, pb: 2 }}>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2, mb: 1.5 }}>
                  <Box sx={{ minWidth: 240 }}>
                    <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#94a3b8', textTransform: 'uppercase' }}>
                      Informacion general
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: '#475569', mt: 0.5 }}>
                      Descripcion: {t.descripcion || '-'}
                    </Typography>
                    {t.fecha_limite && (
                      <Typography sx={{ fontSize: 13, color: '#475569', mt: 0.5 }}>
                        Fecha limite: {t.fecha_limite.substring(0, 10)}
                      </Typography>
                    )}
                  </Box>
                  {totalConvocados > 0 && (
                    <Box sx={{ ml: 'auto' }}>
                      <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#94a3b8', textTransform: 'uppercase', mb: 0.75 }}>
                        Estado de convocatoria
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                        <Chip
                          size="small"
                          label={`Convocados: ${totalConvocados}`}
                          sx={{ bgcolor: '#e0f2fe', color: '#1d4ed8', fontWeight: 700 }}
                        />
                        <Chip
                          size="small"
                          label={`Aceptados: ${aceptados}`}
                          sx={{ bgcolor: '#dcfce7', color: '#166534', fontWeight: 700 }}
                        />
                        <Chip
                          size="small"
                          label={`Rechazados: ${rechazados}`}
                          sx={{ bgcolor: '#fee2e2', color: '#b91c1c', fontWeight: 700 }}
                        />
                        <Chip
                          size="small"
                          label={`Pendientes: ${pendientes}`}
                          sx={{ bgcolor: '#ffedd5', color: '#c2410c', fontWeight: 700 }}
                        />
                      </Box>
                    </Box>
                  )}
                </Box>
                <Box sx={{ mt: 8 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
                    <Typography sx={{ fontWeight: 700, color: '#0f172a' }}>Juegos del Torneo</Typography>
                    {totalConvocados > 0 && (
                      <Button
                        variant="text"
                        size="small"
                        onClick={() => {
                          setConvocadosModalTitle(t.nombre || 'Convocados');
                          setConvocadosModalList(convocados);
                          setConvocadosModalOpen(true);
                        }}
                        sx={{ px: 0, textTransform: 'none', color: '#f97316', fontWeight: 700 }}
                      >
                        Ver listado completo de convocados
                      </Button>
                    )}
                  </Box>
                  <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 2.5, overflow: 'hidden' }}>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: juegosColumns.map((col) => col.width).join(' '),
                        bgcolor: '#f8fafc',
                        px: 2,
                        py: 1
                      }}
                    >
                      {juegosColumns.map((col) => (
                        <Typography
                          key={col.key}
                          sx={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: '#64748b',
                            letterSpacing: '0.04em',
                            textAlign: col.align || 'left'
                          }}
                        >
                          {col.label}
                        </Typography>
                      ))}
                    </Box>
                    {juegos.length === 0 ? (
                      <Box sx={{ px: 2, py: 4, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                        No hay juegos registrados para este torneo aun.
                      </Box>
                    ) : (
                      juegos.map(j => (
                        <Box
                          key={j._id || j.id}
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: juegosColumns.map((col) => col.width).join(' '),
                            px: 2,
                            py: 1.25,
                            borderTop: '1px solid #e2e8f0',
                            alignItems: 'center',
                            position: 'relative'
                          }}
                        >
                          {juegosColumns.map((col) => (
                            <Box key={`${col.key}-${j._id || j.id}`} sx={{ textAlign: col.align || 'left' }}>
                              {typeof col.render === 'function' ? (
                                col.key === 'enfrentamiento' ? (
                                  <Typography sx={{ fontSize: 13, color: '#0f172a', fontWeight: 600 }}>
                                    {col.render(j)}
                                  </Typography>
                                ) : (
                                  <Typography sx={{ fontSize: 13, color: '#475569' }}>
                                    {col.render(j)}
                                  </Typography>
                                )
                              ) : (
                                <Typography sx={{ fontSize: 13, color: '#475569' }}>-</Typography>
                              )}
                            </Box>
                          ))}
                        </Box>
                      ))
                    )}
                  </Box>
                </Box>
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Box>
      {/* Modal de Partidos */}
      <Dialog
        open={modalPartidos}
        onClose={cerrarModalPartidos}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            width: '96vw',
            maxWidth: 980,
            borderRadius: 3,
            overflow: 'hidden'
          }
        }}
      >
        <DialogTitle
          sx={{
            bgcolor: '#0f172a',
            color: '#e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SportsVolleyballIcon fontSize="small" />
            <Box>
              <Typography sx={{ fontWeight: 700, color: '#e2e8f0' }}>
                Juegos de {torneoActual?.nombre}
              </Typography>
              <Typography sx={{ fontSize: 11, color: '#94a3b8', letterSpacing: '0.06em' }}>
                GESTION DE JUEGOS
              </Typography>
            </Box>
          </Box>
          <IconButton onClick={cerrarModalPartidos} size="small" sx={{ color: '#cbd5f5' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ bgcolor: '#f8fafc', p: { xs: 2, md: 3 } }}>
          <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 700, color: '#0f172a' }}>{editandoPartido ? 'Editar Juego' : 'Crear Juego'}</Typography>
          {partidoError && (
            <Typography variant="body2" color="error" sx={{ mb: 2 }}>
              {partidoError}
            </Typography>
          )}
          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item size={{ xs: 12, md: 7 }}>
              <Paper sx={{ p: 2.5, borderRadius: 3, boxShadow: '0 4px 14px rgba(15, 23, 42, 0.06)' }}>
                <Grid container spacing={2}>
                  <Grid item size={{ xs: 12, md: 6 }}>
                    <TextField
                      label="Nombre del encuentro"
                      fullWidth
                      size="small"
                      value={partidoForm.nombre}
                      onChange={e => setPartidoForm(f => ({ ...f, nombre: e.target.value }))}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <SportsVolleyballIcon fontSize="small" />
                          </InputAdornment>
                        )
                      }}
                    />
                  </Grid>
                  <Grid item size={{ xs: 12, md: 6 }}>
                    <TextField
                      label="Equipo contrario"
                      fullWidth
                      size="small"
                      value={partidoForm.equipo_contrario}
                      onChange={e => setPartidoForm(f => ({ ...f, equipo_contrario: e.target.value }))}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <GroupsIcon fontSize="small" />
                          </InputAdornment>
                        )
                      }}
                    />
                  </Grid>
                  <Grid item size={{ xs: 12 }}>
                    <TextField
                      label="Descripcion"
                      fullWidth
                      size="small"
                      multiline
                      rows={2}
                      value={partidoForm.descripcion || ''}
                      onChange={e => setPartidoForm(f => ({ ...f, descripcion: e.target.value }))}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <DescriptionIcon fontSize="small" />
                          </InputAdornment>
                        )
                      }}
                    />
                  </Grid>
                  <Grid item size={{ xs: 12, md: 6 }}>
                    <TextField
                      label="Fecha"
                      type="date"
                      fullWidth
                      size="small"
                      InputLabelProps={{ shrink: true }}
                      value={partidoForm.fecha}
                      onChange={e => setPartidoForm(f => ({ ...f, fecha: e.target.value }))}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <EventIcon fontSize="small" />
                          </InputAdornment>
                        )
                      }}
                    />
                  </Grid>
                  <Grid item size={{ xs: 12, md: 6 }}>
                    <TextField
                      label="Hora"
                      type="time"
                      fullWidth
                      size="small"
                      InputLabelProps={{ shrink: true }}
                      value={partidoForm.hora}
                      onChange={e => setPartidoForm(f => ({ ...f, hora: e.target.value }))}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <AccessTimeIcon fontSize="small" />
                          </InputAdornment>
                        )
                      }}
                    />
                  </Grid>
                  <Grid item size={{ xs: 12 }}>
                    <TextField
                      label="Entrenador encargado"
                      fullWidth
                      size="small"
                      value={partidoForm.entrenador}
                      onChange={e => setPartidoForm(f => ({ ...f, entrenador: e.target.value }))}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <PersonIcon fontSize="small" />
                          </InputAdornment>
                        )
                      }}
                    />
                  </Grid>
                </Grid>
              </Paper>
              <Box sx={{ mt: 2 }}>
                <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#94a3b8', textTransform: 'uppercase', mb: 0.75 }}>
                  Ubicacion del evento
                </Typography>
                <TextField
                  label="Direccion"
                  fullWidth
                  size="small"
                  value={partidoForm.direccion}
                  onChange={e => setPartidoForm(f => ({ ...f, direccion: e.target.value }))}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <LocationOnIcon fontSize="small" />
                      </InputAdornment>
                    )
                  }}
                />
              </Box>
            </Grid>
            <Grid item size={{ xs: 12, md: 5 }}>
              <Paper sx={{ p: 2.5, borderRadius: 3, boxShadow: '0 4px 14px rgba(15, 23, 42, 0.06)', bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <Typography sx={{ fontWeight: 700, color: '#0f172a', mb: 1 }}>Costos del Encuentro</Typography>
                {torneoActual?.partidos?.length === 0 && (
                <TextField
                  label="Monto de inscripcion"
                  type="number"
                  fullWidth
                  size="small"
                  sx={{ mb: 1.5 }}
                  value={partidoForm.monto_inscripcion}
                  onChange={e => setPartidoForm(f => ({ ...f, monto_inscripcion: e.target.value }))}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <AttachMoneyIcon fontSize="small" />
                      </InputAdornment>
                    )
                  }}
                />
                )}
                <TextField
                  label="Monto de acompanante"
                  type="number"
                  fullWidth
                  size="small"
                  sx={{ mb: 1.5 }}
                  value={partidoForm.monto_acompanante}
                  onChange={e => setPartidoForm(f => ({ ...f, monto_acompanante: e.target.value }))}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <AttachMoneyIcon fontSize="small" />
                      </InputAdornment>
                    )
                  }}
                />
                <TextField
                  label="Monto de arbitraje"
                  type="number"
                  fullWidth
                  size="small"
                  value={partidoForm.monto}
                  onChange={e => setPartidoForm(f => ({ ...f, monto: e.target.value }))}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <AttachMoneyIcon fontSize="small" />
                      </InputAdornment>
                    )
                  }}
                />
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 2 }}>
                  <Typography sx={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Monto Total Estimado</Typography>
                  <Typography sx={{ fontSize: 18, fontWeight: 800, color: '#f97316' }}>
                    ${totalCostosPartido.toFixed(2)}
                  </Typography>
                </Box>
              </Paper>
            </Grid>
          </Grid>
         
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, bgcolor: '#f8fafc' }}>
          <Button onClick={cerrarModalPartidos} sx={{ color: '#64748b', fontWeight: 700 }}>
            Cerrar
          </Button>
          <Button
            onClick={handleCrearPartido}
            variant="contained"
            disabled={partidoLoading || !partidoForm.nombre}
            sx={{ bgcolor: '#f97316', '&:hover': { bgcolor: '#ea580c' }, fontWeight: 700, borderRadius: 2, px: 3 }}
          >
            {partidoLoading ? 'Guardando...' : editandoPartido ? 'Guardar Cambios' : 'Crear Juego'}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={partidoSuccess}
        autoHideDuration={3000}
        onClose={() => setPartidoSuccess(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setPartidoSuccess(false)} severity="success" variant="filled" sx={{ width: '100%' }}>
          Juego creado con exito
        </Alert>
      </Snackbar>
        <Dialog
          open={convocadosModalOpen}
          onClose={() => setConvocadosModalOpen(false)}
          fullWidth
          maxWidth="sm"
          PaperProps={{
            sx: {
              bgcolor: '#fff',
              borderRadius: 3,
              boxShadow: '0 6px 18px rgba(15, 23, 42, 0.10)',
              p: 0.5
            }
          }}
        >
          <DialogTitle sx={{ fontWeight: 700, color: '#0f172a', bgcolor: '#f8fafc', borderTopLeftRadius: 12, borderTopRightRadius: 12, px: 3, py: 2, borderBottom: '1px solid #e2e8f0' }}>
            Convocados - {convocadosModalTitle}
          </DialogTitle>
          <DialogContent sx={{ bgcolor: '#fff', px: 3, py: 2.5 }}>
            {convocadosModalList.length === 0 ? (
              <Typography variant="body2" sx={{ color: '#64748b' }}>
                No hay convocados para este torneo.
              </Typography>
            ) : (
              <List
                dense
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1.5,
                  mt: 1,
                  mb: 1
                }}
              >
                {convocadosModalList.map((c, idx) => {
                  const estado = c.estado || 'pendiente';
                  const estadoColor =
                    estado === 'aceptado'
                      ? { bg: '#dcfce7', text: '#16a34a' }
                      : estado === 'rechazado'
                      ? { bg: '#fee2e2', text: '#dc2626' }
                      : { bg: '#fef9c3', text: '#f59e0b' };
                  return (
                    <ListItem key={c.alumno?._id || c.alumno || idx} sx={{
                      pl: 0,
                      pr: 0,
                      py: 1.2,
                      borderRadius: 2,
                      border: '1px solid #e2e8f0',
                      bgcolor: '#f8fafc',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2
                    }}>
                      {/* Avatar del alumno */}
                      <Box sx={{ minWidth: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Avatar
                          src={c.alumno?.foto || undefined}
                          alt={c.alumno ? `${c.alumno.nombres || ''} ${c.alumno.apellidos || ''}` : 'Alumno'}
                          sx={{ width: 38, height: 38, bgcolor: '#f1f5f9', color: '#475569', fontWeight: 700, fontSize: 18 }}
                        >
                          {(!c.alumno?.foto && c.alumno?.nombres) ? c.alumno.nombres[0] : ''}
                        </Avatar>
                      </Box>
                      <ListItemText
                        primary={<Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: 15 }}>{c.alumno ? `${c.alumno.nombres || ''} ${c.alumno.apellidos || ''}` : 'Alumno'}</Typography>}
                        secondary={<Typography sx={{ color: '#64748b', fontSize: 12 }}>{c.alumno?.categoria ? `Categoría ${c.alumno.categoria}` : ''}</Typography>}
                      />
                      <Chip
                        size="small"
                        label={estado === 'aceptado' ? 'Confirmado' : estado === 'rechazado' ? 'Rechazado' : 'Pendiente'}
                        sx={{ bgcolor: estadoColor.bg, color: estadoColor.text, fontWeight: 700, fontSize: 13, px: 1.5, py: 0.5, mr: 1, borderRadius: 2 }}
                      />
                    </ListItem>
                  );
                })}
              </List>
            )}
          </DialogContent>
          <DialogActions sx={{ bgcolor: '#f8fafc', px: 3, py: 2, borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }}>
            <Button onClick={() => setConvocadosModalOpen(false)} sx={{ color: '#f97316', fontWeight: 700 }}>Cerrar</Button>
          </DialogActions>
        </Dialog>
         <Dialog open={dialogEliminarOpen} onClose={() => { setDialogEliminarOpen(false); setTorneoAEliminar(null); }}>
                              <DialogTitle sx={{ fontWeight: 700, color: '#b91c1c' }}>Eliminar torneo</DialogTitle>
                              <DialogContent>
                                <Typography>¿Estás seguro que deseas eliminar este torneo? Esta acción eliminará también todos los partidos asociados y no se puede deshacer.</Typography>
                              </DialogContent>
                              <DialogActions>
                                <Button onClick={() => { setDialogEliminarOpen(false); setTorneoAEliminar(null); }} color="inherit" sx={{ fontWeight: 700 }}>Cancelar</Button>
                                <Button onClick={handleEliminar} color="error" variant="contained" sx={{ fontWeight: 700 }}>Eliminar</Button>
                              </DialogActions>
                            </Dialog>
    </div>
  );
}

export default Torneos;
