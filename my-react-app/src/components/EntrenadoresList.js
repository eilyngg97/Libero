import React, { useMemo, useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Avatar, Box, Button, Paper, Typography, TablePagination, TextField, MenuItem, InputAdornment } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import WorkOutlineRoundedIcon from '@mui/icons-material/WorkOutlineRounded';
import EntrenadorForm from './EntrenadorForm';
import EntrenadorDetalleView from './EntrenadorDetalleView';
import { mediaUrl } from '../utils/mediaUrl';
import './EntrenadoresList.css';

const avatarPalettes = [
  { bg: 'linear-gradient(135deg, #f472b6 0%, #ec4899 100%)', color: '#ffffff' },
  { bg: 'linear-gradient(135deg, #14b8a6 0%, #0f766e 100%)', color: '#ffffff' },
  { bg: 'linear-gradient(135deg, #fb923c 0%, #f97316 100%)', color: '#ffffff' },
  { bg: 'linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)', color: '#ffffff' },
  { bg: 'linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)', color: '#ffffff' }
];

function formatContractLabel(value) {
  if (!value) return 'Sin contrato';
  return value.replaceAll('_', ' ');
}

function getAvatarPalette(seed) {
  const normalized = String(seed || 'entrenador');
  const hash = normalized.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return avatarPalettes[hash % avatarPalettes.length];
}

function getEdad(fechaNacimiento) {
  if (!fechaNacimiento) return '--';
  const fecha = new Date(fechaNacimiento);
  if (Number.isNaN(fecha.getTime())) return '--';

  const hoy = new Date();
  let edad = hoy.getFullYear() - fecha.getFullYear();
  const yaCumplioEsteAnio =
    hoy.getMonth() > fecha.getMonth()
    || (hoy.getMonth() === fecha.getMonth() && hoy.getDate() >= fecha.getDate());

  if (!yaCumplioEsteAnio) edad -= 1;
  return edad >= 0 ? edad : '--';
}

function EntrenadoresList() {
  const location = useLocation();
  const [entrenadores, setEntrenadores] = useState([]);
  const [sedes, setSedes] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('todos');
  const [sedeFiltro, setSedeFiltro] = useState('todas');
  const [contratoFiltro, setContratoFiltro] = useState('todos');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [showModal, setShowModal] = useState(false);
  const [reload, setReload] = useState(false);
  const [entrenadorDetalleId, setEntrenadorDetalleId] = useState('');
  const [entrenadorDetalleTab, setEntrenadorDetalleTab] = useState('resumen');
  const [entrenadorPagoPrefill, setEntrenadorPagoPrefill] = useState(null);

  useEffect(() => {
    const targetId = String(location.state?.entrenadorId || '').trim();
    const targetTab = String(location.state?.activeTab || '').trim();

    if (!targetId) return;

    setEntrenadorDetalleId(targetId);
    setEntrenadorDetalleTab(targetTab || 'resumen');
    setEntrenadorPagoPrefill(
      location.state?.pagoPrefill && typeof location.state.pagoPrefill === 'object'
        ? location.state.pagoPrefill
        : null
    );
  }, [location.state]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const apiBase = process.env.REACT_APP_API_URL || window.location.origin;

    fetch(`${apiBase}/api/entrenadores`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setEntrenadores(data);
        } else {
          setEntrenadores([]);
        }
      })
      .catch(() => setEntrenadores([]));

    fetch(`${apiBase}/api/sedes`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setSedes(data);
        } else {
          setSedes([]);
        }
      })
      .catch(() => setSedes([]));
  }, [reload]);

  const sedesById = useMemo(() => {
    return new Map(sedes.map((sede) => [String(sede._id || sede.id), sede]));
  }, [sedes]);

  const entrenadoresFiltrados = Array.isArray(entrenadores)
    ? entrenadores.filter(e => {
        const nombreCompleto = `${e.nombre || ''} ${e.apellido || ''}`.toLowerCase();
        const cedula = String(e.cedula || '').toLowerCase();
        const coincideBusqueda = nombreCompleto.includes(busqueda.toLowerCase()) || cedula.includes(busqueda.toLowerCase());
        const coincideEstado = estadoFiltro === 'todos' || e.estado === estadoFiltro;
        const sedesStaff = Array.isArray(e.sedes_staff) ? e.sedes_staff.map((id) => String(id)) : [];
        const coincideSede = sedeFiltro === 'todas' || sedesStaff.includes(sedeFiltro);
        const coincideContrato = contratoFiltro === 'todos' || (e.tipo_contrato || '') === contratoFiltro;
        return coincideBusqueda && coincideEstado && coincideSede && coincideContrato;
      })
    : [];

  const entrenadoresPagina = entrenadoresFiltrados.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const entrenadorDetalle = useMemo(() => {
    if (!entrenadorDetalleId) return null;
    return entrenadores.find((item) => String(item._id || item.id) === entrenadorDetalleId) || null;
  }, [entrenadorDetalleId, entrenadores]);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };


  const getTrainerPhoto = (entrenador) => {
    const normalizedFoto = mediaUrl(entrenador.foto);
    if (normalizedFoto && normalizedFoto.startsWith('/uploads/') && process.env.REACT_APP_API_URL) {
      return `${process.env.REACT_APP_API_URL}${normalizedFoto}`;
    }
    return normalizedFoto || '';
  };

  const getTrainerSedes = (entrenador) => {
    const ids = Array.isArray(entrenador.sedes_staff) ? entrenador.sedes_staff : [];
    return ids
      .map((id) => sedesById.get(String(id))?.nombre)
      .filter(Boolean);
  };

  const getPaymentMethods = (entrenador) => {
    const methods = entrenador?.pago_config?.metodos;
    if (Array.isArray(methods) && methods.length) {
      return methods.map((method) => method === 'pago_movil' ? 'Pago movil' : 'Transferencia');
    }
    return [];
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const filterLabelSx = {
    fontSize: 11,
    fontWeight: 700,
    color: '#94a3b8',
    letterSpacing: '0.06em',
    mb: 0.5,
    textTransform: 'uppercase'
  };

  const filterFieldSx = {
    width: '100%',
    '& .MuiOutlinedInput-root': {
      borderRadius: 2,
      backgroundColor: '#fff'
    },
    '& .MuiInputBase-input, & .MuiSelect-select': {
      py: 0.8,
      fontSize: 13
    }
  };

  const handleEntrenadorUpdated = (updatedEntrenador) => {
    const updatedId = String(updatedEntrenador?._id || updatedEntrenador?.id || '');
    if (!updatedId) return;
    setEntrenadores((prev) => prev.map((item) => {
      const currentId = String(item._id || item.id || '');
      return currentId === updatedId ? { ...item, ...updatedEntrenador } : item;
    }));
  };

  const handleEntrenadorDeleted = (deletedId) => {
    const targetId = String(deletedId || '');
    if (!targetId) return;
    setEntrenadores((prev) => prev.filter((item) => String(item._id || item.id || '') !== targetId));
    setEntrenadorDetalleId('');
    setEntrenadorDetalleTab('resumen');
    setEntrenadorPagoPrefill(null);
  };

  if (entrenadorDetalle) {
    const photo = getTrainerPhoto(entrenadorDetalle);
    const palette = getAvatarPalette(`${entrenadorDetalle.nombre}${entrenadorDetalle.apellido}`);
    const trainerSedes = getTrainerSedes(entrenadorDetalle);
    const contractLabel = formatContractLabel(entrenadorDetalle.tipo_contrato);
    const paymentMethods = getPaymentMethods(entrenadorDetalle);

    return (
      <EntrenadorDetalleView
        entrenador={entrenadorDetalle}
        photo={photo}
        palette={palette}
        trainerSedes={trainerSedes}
        paymentMethods={paymentMethods}
        contractLabel={contractLabel}
        initialActiveTab={entrenadorDetalleTab}
        initialPagoPrefill={entrenadorPagoPrefill}
        onUpdated={handleEntrenadorUpdated}
        onDeleted={handleEntrenadorDeleted}
        onBack={() => {
          setEntrenadorDetalleId('');
          setEntrenadorDetalleTab('resumen');
          setEntrenadorPagoPrefill(null);
        }}
      />
    );
  }

  return (
    <div className="entrenadores-page">
      <Box className="entrenadores-toolbar-header">
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 900, color: '#0f172a' }}>Entrenadores</Typography>
          <Typography sx={{ mt: 0.5, color: '#64748b', fontSize: 14 }}>
            Gestiona el staff tecnico de tu academia.
          </Typography>
        </Box>
        <Button
          variant="contained"
          className="entrenadores-primary-btn"
          startIcon={<AddIcon />}
          onClick={() => setShowModal(true)}
        >
          Nuevo entrenador
        </Button>
      </Box>

      <Box
        className="entrenadores-filters-shell"
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(260px, 1.5fr) repeat(3, minmax(170px, 1fr))' },
          gap: 1.5,
          mb: 2.25,
          bgcolor: '#fff',
          border: '1px solid #eef0f3',
          borderRadius: 3,
          p: 2,
          boxShadow: 'none'
        }}
      >
        <Box>
          <Typography sx={filterLabelSx}>Entrenador</Typography>
          <TextField
            className="entrenadores-filter-field"
            placeholder="Nombre o cédula"
            size="small"
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchRoundedIcon fontSize="small" />
                </InputAdornment>
              )
            }}
            sx={filterFieldSx}
          />
        </Box>
        <Box>
          <Typography sx={filterLabelSx}>Estado</Typography>
          <TextField
            className="entrenadores-filter-field"
            select
            size="small"
            value={estadoFiltro}
            onChange={(event) => setEstadoFiltro(event.target.value)}
            sx={filterFieldSx}
          >
            <MenuItem value="todos">Todos</MenuItem>
            <MenuItem value="activo">Activo</MenuItem>
            <MenuItem value="inactivo">Inactivo</MenuItem>
          </TextField>
        </Box>
        <Box>
          <Typography sx={filterLabelSx}>Sede</Typography>
          <TextField
            className="entrenadores-filter-field"
            select
            size="small"
            value={sedeFiltro}
            onChange={(event) => setSedeFiltro(event.target.value)}
            sx={filterFieldSx}
          >
            <MenuItem value="todas">Todas las sedes</MenuItem>
            {sedes.map((sede) => (
              <MenuItem key={sede._id || sede.id} value={String(sede._id || sede.id)}>
                {sede.nombre}
              </MenuItem>
            ))}
          </TextField>
        </Box>
        <Box>
          <Typography sx={filterLabelSx}>Contrato</Typography>
          <TextField
            className="entrenadores-filter-field"
            select
            size="small"
            value={contratoFiltro}
            onChange={(event) => setContratoFiltro(event.target.value)}
            sx={filterFieldSx}
          >
            <MenuItem value="todos">Todos</MenuItem>
            <MenuItem value="fijo">Fijo</MenuItem>
            <MenuItem value="por_horas">Por horas</MenuItem>
            <MenuItem value="honorarios_profesionales">Honorarios</MenuItem>
          </TextField>
        </Box>
      </Box>

      <Box className="entrenadores-meta-row">
        <Typography className="entrenadores-count-copy">
          Mostrando {entrenadoresPagina.length} de {entrenadoresFiltrados.length} entrenadores
        </Typography>
        <Typography className="entrenadores-meta-hint">
          Vista resumida del staff tecnico por tarjeta.
        </Typography>
      </Box>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <span className="cerrar-modal-x" onClick={() => setShowModal(false)}>&times;</span>
            <EntrenadorForm
              onCancel={() => setShowModal(false)}
              onSuccess={() => {
                setShowModal(false);
                setReload(r => !r);
              }}
            />
          </div>
        </div>
      )}

      <Box className="entrenadores-grid">
        {!entrenadoresPagina.length && (
          <Paper className="entrenadores-empty-state">
            <Typography className="entrenadores-empty-title">No hay entrenadores para esos filtros</Typography>
            <Typography className="entrenadores-empty-copy">
              Ajusta la busqueda o limpia algun filtro para volver a ver resultados.
            </Typography>
          </Paper>
        )}

        {entrenadoresPagina.map((entrenador) => {
          const photo = getTrainerPhoto(entrenador);
          const palette = getAvatarPalette(`${entrenador.nombre}${entrenador.apellido}`);
          const trainerSedes = getTrainerSedes(entrenador);
          const paymentMethods = getPaymentMethods(entrenador);
          const edad = getEdad(entrenador.fecha_nacimiento);
          const paymentSummary = paymentMethods.length ? paymentMethods.join(' · ') : 'Sin metodo de pago';

          return (
            <Paper
              key={entrenador._id || entrenador.id}
              className="entrenador-card"
              onClick={() => {
                setEntrenadorDetalleId(String(entrenador._id || entrenador.id));
                setEntrenadorDetalleTab('resumen');
                setEntrenadorPagoPrefill(null);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setEntrenadorDetalleId(String(entrenador._id || entrenador.id));
                  setEntrenadorDetalleTab('resumen');
                  setEntrenadorPagoPrefill(null);
                }
              }}
              sx={{ cursor: 'pointer' }}
            >
              <Box className="entrenador-card-top">
                <Box className="entrenador-card-identity">
                  <Avatar
                    src={photo}
                    alt={`${entrenador.nombre || ''} ${entrenador.apellido || ''}`.trim()}
                    sx={{
                      width: 56,
                      height: 56,
                      background: palette.bg,
                      color: palette.color,
                      fontSize: 22,
                      fontWeight: 800,
                      boxShadow: '0 12px 28px rgba(15, 23, 42, 0.14)'
                    }}
                  >
                    {`${entrenador.nombre?.[0] || ''}${entrenador.apellido?.[0] || ''}`.toUpperCase()}
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography className="entrenador-card-name">
                      {entrenador.nombre} {entrenador.apellido}
                    </Typography>
                    <Typography className="entrenador-card-cedula">
                      V-{entrenador.cedula || 'Sin cedula'}
                    </Typography>
                  </Box>
                </Box>
                <span className={`estado-pill estado-${entrenador.estado}`}>{entrenador.estado || 'sin estado'}</span>
              </Box>

              <Typography className="entrenador-card-summary">
                Voleibol {entrenador.especialidad ? `— ${entrenador.especialidad}` : '— Staff tecnico'}
              </Typography>
              <Box className="entrenador-card-stats">
                <Box className="entrenador-stat-item">
                  <Typography className="entrenador-stat-value">{trainerSedes.length || 0}</Typography>
                  <Typography className="entrenador-stat-label">Sedes</Typography>
                </Box>
                <Box className="entrenador-stat-item">
                  <Typography className="entrenador-stat-value purple">{entrenador.certificaciones?.length || 0}</Typography>
                  <Typography className="entrenador-stat-label">Certifs.</Typography>
                </Box>
                <Box className="entrenador-stat-item">
                  <Typography className="entrenador-stat-value green">{edad}</Typography>
                  <Typography className="entrenador-stat-label">Edad</Typography>
                </Box>
              </Box>

              <Box className="entrenador-card-footer-row">
                <span className="entrenador-footer-pill payment">
                  <PhoneOutlinedIcon sx={{ fontSize: 14 }} />
                  {paymentSummary}
                </span>
                <span className="entrenador-footer-pill contract">
                  <WorkOutlineRoundedIcon sx={{ fontSize: 14 }} />
                  {formatContractLabel(entrenador.tipo_contrato)}
                </span>
              </Box>

              <Box className="entrenador-card-footer-row between">
                <Box className="entrenador-footer-stack">
                  <span className="entrenador-footer-link wide">
                    <BusinessOutlinedIcon sx={{ fontSize: 14 }} />
                    {trainerSedes.length ? trainerSedes.join(', ') : 'Sin sede asignada'}
                  </span>
                  <span className="entrenador-footer-link subtle">
                    <PhoneOutlinedIcon sx={{ fontSize: 14 }} />
                    {entrenador.telefono || 'Sin telefono'}
                  </span>
                </Box>
              </Box>
            </Paper>
          );
        })}
      </Box>

      <Paper className="entrenadores-pagination-shell">
        <TablePagination
          component="div"
          count={entrenadoresFiltrados.length}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[4, 8, 12]}
          labelRowsPerPage="Filas por pagina:"
        />
      </Paper>
    </div>
  );
}

export default EntrenadoresList;
