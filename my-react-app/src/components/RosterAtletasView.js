import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  ListItemText,
  MenuItem,
  Snackbar,
  TablePagination,
  TextField,
  Typography
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useNavigate, useParams } from 'react-router-dom';

const EMPTY_FILTERS = {
  search: '',
  sexo: '',
  categoria: [],
  division: '',
  fechaDesde: '',
  fechaHasta: ''
};

const STATUS_STYLES = {
  aceptado: { label: 'Aceptado', color: '#15803d', bg: '#ecfdf5' },
  rechazado: { label: 'Rechazado', color: '#dc2626', bg: '#fff1f2' },
  pendiente: { label: 'Pendiente', color: '#a16207', bg: '#fff7ed' }
};

const DEBT_STATUSES = new Set(['pendiente', 'insolvente', 'retrasado', 'abono', 'en revision']);

function getId(value) {
  return String(value?._id || value?.id || value || '');
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('es-VE', { timeZone: 'UTC' });
}

function normalize(value) {
  return String(value || '').trim().toLocaleLowerCase('es');
}

function formatDivision(value) {
  return normalize(value) === 'primer division' ? 'Primera división' : value;
}

function uniqueOptions(rows, field) {
  return Array.from(new Set(rows.map((row) => String(row?.[field] || '').trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'es'));
}

function isCurrentOrPastPeriod(mensualidad, currentPeriod) {
  const month = Number(mensualidad?.mes);
  const year = Number(mensualidad?.anio);
  if (!Number.isInteger(month) || !Number.isInteger(year)) return false;
  return year < currentPeriod.year || (year === currentPeriod.year && month <= currentPeriod.month);
}

function RosterAtletasView() {
  const { torneoId, rosterId } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const [torneo, setTorneo] = useState(null);
  const [roster, setRoster] = useState(null);
  const [athletes, setAthletes] = useState([]);
  const [solvencias, setSolvencias] = useState({});
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [convocatoriaPage, setConvocatoriaPage] = useState(0);
  const [convocatoriaRowsPerPage, setConvocatoriaRowsPerPage] = useState(5);
  const [loading, setLoading] = useState(true);
  const [savingAthleteId, setSavingAthleteId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState({ open: false, severity: 'success', message: '' });

  const authHeaders = useMemo(() => ({
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }), [token]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const today = new Date();
      const eligibleParams = new URLSearchParams({
        torneoId,
        rosterId,
        todos: 'true'
      });
      const [torneoResponse, rostersResponse, athletesResponse, solvenciasResponse] = await Promise.all([
        fetch(`${process.env.REACT_APP_API_URL}/api/torneos/${torneoId}?_t=${Date.now()}`, {
          cache: 'no-store',
          headers: authHeaders
        }),
        fetch(`${process.env.REACT_APP_API_URL}/api/rosters?torneoId=${torneoId}&_t=${Date.now()}`, {
          cache: 'no-store',
          headers: authHeaders
        }),
        fetch(`${process.env.REACT_APP_API_URL}/api/rosters/eligible-students?${eligibleParams.toString()}`, {
          cache: 'no-store',
          headers: authHeaders
        }),
        fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades`, {
          cache: 'no-store',
          headers: authHeaders
        })
      ]);

      const [torneoData, rostersData, athletesData, solvenciasData] = await Promise.all([
        torneoResponse.json(),
        rostersResponse.json(),
        athletesResponse.json(),
        solvenciasResponse.json()
      ]);

      if (!torneoResponse.ok) throw new Error(torneoData?.error || 'No se pudo cargar el torneo');
      if (!rostersResponse.ok || !Array.isArray(rostersData)) throw new Error(rostersData?.error || 'No se pudo cargar el roster');
      if (!athletesResponse.ok || !Array.isArray(athletesData)) throw new Error(athletesData?.error || 'No se pudieron cargar los atletas');

      const currentRoster = rostersData.find((item) => getId(item) === String(rosterId));
      if (!currentRoster) throw new Error('Roster no encontrado');

      setTorneo(torneoData);
      setRoster(currentRoster);
      setAthletes(athletesData);
      setSolvencias(
        solvenciasResponse.ok && Array.isArray(solvenciasData)
          ? solvenciasData.reduce((result, mensualidad) => {
            const athleteId = getId(mensualidad?.id_alumno);
            if (!athleteId || !isCurrentOrPastPeriod(mensualidad, {
              month: today.getMonth() + 1,
              year: today.getFullYear()
            })) return result;

            if (!result[athleteId]) result[athleteId] = 'Solvente';
            if (DEBT_STATUSES.has(normalize(mensualidad?.estatus))) {
              result[athleteId] = 'Insolvente';
            }
            return result;
          }, {})
          : {}
      );
    } catch (requestError) {
      setError(requestError.message || 'No se pudo cargar la vista de atletas');
    } finally {
      setLoading(false);
    }
  }, [authHeaders, rosterId, torneoId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const selectedIds = useMemo(
    () => new Set((roster?.jugadores || []).map((item) => getId(item))),
    [roster]
  );

  const statusByAthlete = useMemo(() => {
    const result = new Map();
    (torneo?.convocados || []).forEach((item) => {
      const athleteId = getId(item?.alumno);
      if (athleteId) result.set(athleteId, item?.estado || 'pendiente');
    });
    return result;
  }, [torneo]);

  const options = useMemo(() => ({
    sexos: uniqueOptions(athletes, 'sexo'),
    categorias: uniqueOptions(athletes, 'categoria'),
    divisiones: uniqueOptions(athletes, 'division')
  }), [athletes]);

  const filteredAthletes = useMemo(() => athletes
    .filter((athlete) => {
      const fullText = normalize(`${athlete.nombre_completo} ${athlete.cedula}`);
      if (filters.search && !fullText.includes(normalize(filters.search))) return false;
      if (filters.sexo && athlete.sexo !== filters.sexo) return false;
      if (filters.categoria.length > 0 && !filters.categoria.includes(athlete.categoria)) return false;
      if (filters.division && athlete.division !== filters.division) return false;

      if (filters.fechaDesde || filters.fechaHasta) {
        const birthDate = athlete.fecha_nacimiento ? new Date(athlete.fecha_nacimiento) : null;
        if (!birthDate || Number.isNaN(birthDate.getTime())) return false;
        if (filters.fechaDesde && birthDate < new Date(`${filters.fechaDesde}T00:00:00`)) return false;
        if (filters.fechaHasta && birthDate > new Date(`${filters.fechaHasta}T23:59:59`)) return false;
      }
      return true;
    })
    .sort((first, second) => (
      Number(selectedIds.has(getId(second))) - Number(selectedIds.has(getId(first)))
    )), [athletes, filters, selectedIds]);

  useEffect(() => {
    setPage(0);
  }, [filters]);

  const paginatedAthletes = useMemo(() => (
    filteredAthletes.slice(page * rowsPerPage, (page + 1) * rowsPerPage)
  ), [filteredAthletes, page, rowsPerPage]);

  const getSolvencia = (athlete) => solvencias[getId(athlete)] || 'Solvente';

  const selectedAthletes = useMemo(() => {
    const athleteMap = new Map(athletes.map((athlete) => [getId(athlete), athlete]));
    return Array.from(selectedIds).map((id) => athleteMap.get(id)).filter(Boolean);
  }, [athletes, selectedIds]);

  useEffect(() => {
    setConvocatoriaPage(0);
  }, [selectedAthletes.length]);

  const paginatedSelectedAthletes = useMemo(() => (
    selectedAthletes.slice(
      convocatoriaPage * convocatoriaRowsPerPage,
      (convocatoriaPage + 1) * convocatoriaRowsPerPage
    )
  ), [convocatoriaPage, convocatoriaRowsPerPage, selectedAthletes]);

  const counts = useMemo(() => {
    const result = { aceptado: 0, rechazado: 0, pendiente: 0 };
    selectedAthletes.forEach((athlete) => {
      const status = statusByAthlete.get(getId(athlete)) || 'pendiente';
      result[status] += 1;
    });
    return result;
  }, [selectedAthletes, statusByAthlete]);

  const updateRosterAthletes = async (athlete, shouldAdd) => {
    const athleteId = getId(athlete);
    const nextIds = shouldAdd
      ? Array.from(new Set([...selectedIds, athleteId]))
      : Array.from(selectedIds).filter((id) => id !== athleteId);

    setSavingAthleteId(athleteId);
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/rosters/${rosterId}/jugadores`, {
        method: 'PATCH',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ jugadores: nextIds })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'No se pudo actualizar el roster');

      setRoster((previous) => ({ ...previous, jugadores: nextIds }));
      if (shouldAdd && !statusByAthlete.has(athleteId)) {
        setTorneo((previous) => ({
          ...previous,
          convocados: [...(previous?.convocados || []), { alumno: athlete, estado: 'pendiente' }]
        }));
      }
      setNotice({ open: true, severity: 'success', message: shouldAdd ? 'Atleta convocado.' : 'Atleta retirado del roster.' });
    } catch (requestError) {
      setNotice({ open: true, severity: 'error', message: requestError.message || 'No se pudo actualizar el roster.' });
    } finally {
      setSavingAthleteId('');
    }
  };

  const updateAthleteStatus = async (athleteId, status) => {
    setSavingAthleteId(athleteId);
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/rosters/${rosterId}/jugadores/${athleteId}/estado`, {
        method: 'PATCH',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: status })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'No se pudo cambiar el estado');

      setTorneo((previous) => ({
        ...previous,
        convocados: (previous?.convocados || []).map((item) => (
          getId(item?.alumno) === athleteId ? { ...item, estado: status } : item
        ))
      }));
    } catch (requestError) {
      setNotice({ open: true, severity: 'error', message: requestError.message || 'No se pudo cambiar el estado.' });
    } finally {
      setSavingAthleteId('');
    }
  };

  if (loading) {
    return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 320 }}><CircularProgress size={30} /></Box>;
  }

  if (error || !torneo || !roster) {
    return <Alert severity="error">{error || 'No se encontro el roster.'}</Alert>;
  }

  const teamName = roster.liga_name || `${torneo.nombre} ${roster.categoria || ''}`.trim();
  const subtitle = [roster.categoria, roster.division, torneo.fecha_limite ? `Limite de respuesta ${formatDate(torneo.fecha_limite)}` : '']
    .filter(Boolean)
    .join(' - ');

  return (
    <Box sx={{ width: '100%', color: '#172033' }}>
      <Button
        onClick={() => navigate(`/torneos/${torneoId}/equipos`)}
        sx={{ p: 0, mb: 0.7, minWidth: 0, color: '#64748b', textTransform: 'none', fontSize: 11.5 }}
      >
        ← Volver a {torneo.nombre}
      </Button>

      <Typography sx={{ fontSize: 21, lineHeight: 1.15, fontWeight: 800 }}>{teamName}</Typography>
      <Typography sx={{ mt: 0.35, fontSize: 10.5, color: '#7b8797' }}>{subtitle}</Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 4fr) minmax(280px, 1.4fr)' }, gap: 1.4, alignItems: 'start' }}>
        <Box sx={{ border: '1px solid #e7ebf1', borderRadius: 1.5, boxShadow: '0 4px 14px rgba(15, 23, 42, 0.05)', overflow: 'hidden' }}>
          <Box sx={{ px: 1.5, pt: 1.4, pb: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 800 }}>Atletas disponibles</Typography>
              <Typography sx={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>{filteredAthletes.length} de {athletes.length} atletas</Typography>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: '1.2fr 1fr 1fr 1fr 1fr 1fr' }, gap: 0.7, mt: 1 }}>
              <TextField
                size="small"
                placeholder="Buscar atleta"
                value={filters.search}
                onChange={(event) => setFilters((previous) => ({ ...previous, search: event.target.value }))}
                InputProps={{ startAdornment: <SearchIcon sx={{ mr: 0.6, fontSize: 16, color: '#94a3b8' }} /> }}
                sx={{ '& .MuiInputBase-root': { height: 34, fontSize: 10.5 } }}
              />
              {[
                ['sexo', 'Sexo', options.sexos],
                ['division', 'Division', options.divisiones]
              ].map(([field, label, values]) => (
                <TextField
                  key={field}
                  select
                  size="small"
                  label={label}
                  value={filters[field]}
                  onChange={(event) => setFilters((previous) => ({ ...previous, [field]: event.target.value }))}
                  sx={{ '& .MuiInputBase-root': { height: 34, fontSize: 10.5 }, '& .MuiInputLabel-root': { fontSize: 10.5 } }}
                >
                  <MenuItem value="">Todos</MenuItem>
                  {values.map((value) => <MenuItem key={value} value={value}>{field === 'division' ? formatDivision(value) : value}</MenuItem>)}
                </TextField>
              ))}
              <TextField
                select
                size="small"
                label="Categorías"
                value={filters.categoria}
                onChange={(event) => {
                  const { value } = event.target;
                  setFilters((previous) => ({ ...previous, categoria: typeof value === 'string' ? value.split(',') : value }));
                }}
                SelectProps={{
                  multiple: true,
                  renderValue: (selected) => selected.length > 0 ? selected.join(', ') : 'Todas'
                }}
                sx={{ '& .MuiInputBase-root': { height: 34, fontSize: 10.5 }, '& .MuiInputLabel-root': { fontSize: 10.5 } }}
              >
                {options.categorias.map((categoria) => (
                  <MenuItem key={categoria} value={categoria}>
                    <Checkbox size="small" checked={filters.categoria.includes(categoria)} />
                    <ListItemText primary={categoria} />
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                type="date"
                label="F. nacimiento desde"
                value={filters.fechaDesde}
                onChange={(event) => setFilters((previous) => ({ ...previous, fechaDesde: event.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={{ '& .MuiInputBase-root': { height: 34, fontSize: 10 }, '& .MuiInputLabel-root': { fontSize: 10 } }}
              />
              <TextField
                size="small"
                type="date"
                label="Hasta"
                value={filters.fechaHasta}
                onChange={(event) => setFilters((previous) => ({ ...previous, fechaHasta: event.target.value }))}
                InputLabelProps={{ shrink: true }}
                sx={{ '& .MuiInputBase-root': { height: 34, fontSize: 10 }, '& .MuiInputLabel-root': { fontSize: 10 } }}
              />
            </Box>
            <Button onClick={() => setFilters(EMPTY_FILTERS)} sx={{ minWidth: 0, p: 0, mt: 0.7, color: '#f97316', textTransform: 'none', fontSize: 9.5 }}>Limpiar filtros</Button>
          </Box>

          <Box sx={{ overflowX: 'auto' }}>
            <Box sx={{ minWidth: 820 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1.35fr .65fr 1.25fr .75fr 1fr .8fr 72px', gap: 1, px: 1.5, py: 0.8, borderTop: '1px solid #eef2f6', borderBottom: '1px solid #eef2f6', bgcolor: '#fbfcfd' }}>
                {['ATLETA', 'SEXO', 'CATEGORÍA', 'F. NAC.', 'SEDE', 'SOLVENCIA', ''].map((label, index) => (
                  <Typography key={`${label}-${index}`} sx={{ fontSize: 8.5, color: '#94a3b8', fontWeight: 800 }}>{label}</Typography>
                ))}
              </Box>
              {paginatedAthletes.map((athlete) => {
                const athleteId = getId(athlete);
                const selected = selectedIds.has(athleteId);
                const blocked = athlete.ya_en_otro_roster && !selected;
                return (
                  <Box
                    key={athleteId}
                    sx={{ display: 'grid', gridTemplateColumns: '1.35fr .65fr 1.25fr .75fr 1fr .8fr 72px', gap: 1, alignItems: 'center', px: 1.5, py: 0.8, minHeight: 38, borderBottom: '1px solid #f1f5f9', bgcolor: selected ? '#fff9f6' : '#fff' }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, minWidth: 0 }}>
                      <Avatar
                        src={athlete.foto || undefined}
                        alt={athlete.nombre_completo || 'Atleta'}
                        sx={{ width: 28, height: 28, flexShrink: 0, bgcolor: '#e0ecff', color: '#2563eb', fontSize: 9, fontWeight: 800 }}
                      >
                        {`${athlete.nombres?.[0] || ''}${athlete.apellidos?.[0] || ''}`.toUpperCase()}
                      </Avatar>
                      <Typography noWrap sx={{ minWidth: 0, fontSize: 10.5, fontWeight: 700 }}>{athlete.nombre_completo || 'Sin nombre'}</Typography>
                    </Box>
                    <Typography noWrap sx={{ fontSize: 9.5, color: '#64748b' }}>{athlete.sexo || '-'}</Typography>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography noWrap sx={{ fontSize: 9.5, color: '#64748b', lineHeight: 1.2 }}>{athlete.categoria || '-'}</Typography>
                      {athlete.division && <Typography noWrap sx={{ mt: 0.25, fontSize: 8.5, color: '#94a3b8', lineHeight: 1.2 }}>{formatDivision(athlete.division)}</Typography>}
                    </Box>
                    <Typography noWrap sx={{ fontSize: 9.5, color: '#64748b' }}>{formatDate(athlete.fecha_nacimiento)}</Typography>
                    <Typography noWrap sx={{ fontSize: 9.5, color: '#64748b' }}>{athlete.sede_nombre || '-'}</Typography>
                    <Chip
                      size="small"
                      label={getSolvencia(athlete)}
                      sx={{ justifySelf: 'start', height: 20, maxWidth: '100%', fontSize: 8.5, fontWeight: 700, bgcolor: getSolvencia(athlete) === 'Solvente' ? '#dcfce7' : '#fee2e2', color: getSolvencia(athlete) === 'Solvente' ? '#166534' : '#b91c1c' }}
                    />
                    <Button
                      size="small"
                      variant={selected ? 'outlined' : 'contained'}
                      color={selected ? 'inherit' : 'primary'}
                      disabled={savingAthleteId === athleteId || blocked}
                      title={blocked ? 'Ya pertenece a otro roster activo' : ''}
                      onClick={() => updateRosterAthletes(athlete, !selected)}
                      sx={{ minWidth: 64, minHeight: 25, px: 0.7, borderRadius: 1.2, textTransform: 'none', fontSize: 9, color: selected ? '#64748b' : '#fff', bgcolor: selected ? '#fff' : '#f97316', borderColor: '#e2e8f0', boxShadow: 'none', '&:hover': { bgcolor: selected ? '#f8fafc' : '#ea580c' } }}
                    >
                      {savingAthleteId === athleteId ? '...' : selected ? 'Quitar' : blocked ? 'Ocupado' : 'Convocar'}
                    </Button>
                  </Box>
                );
              })}
              {filteredAthletes.length === 0 && <Typography sx={{ p: 2, fontSize: 11, color: '#64748b' }}>No hay atletas que coincidan con los filtros.</Typography>}
            </Box>
          </Box>
          <TablePagination
            component="div"
            count={filteredAthletes.length}
            page={page}
            onPageChange={(event, nextPage) => setPage(nextPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(event) => {
              setRowsPerPage(Number(event.target.value));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 25, 50]}
            labelRowsPerPage="Filas por página:"
            labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count !== -1 ? count : `más de ${to}`}`}
            sx={{ borderTop: '1px solid #eef2f6', '& .MuiTablePagination-toolbar': { minHeight: 42 }, '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows, & .MuiTablePagination-input': { fontSize: 10 } }}
          />
        </Box>

        <Box sx={{ border: '1px solid #e7ebf1', borderRadius: 1.5, boxShadow: '0 4px 14px rgba(15, 23, 42, 0.05)', overflow: 'hidden' }}>
          <Box sx={{ px: 1.5, pt: 1.4, pb: 1.1, borderBottom: '1px solid #eef2f6' }}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 800 }}>Convocatoria</Typography>
            <Box sx={{ display: 'flex', gap: 0.6, flexWrap: 'wrap', mt: 0.9 }}>
              <Chip label={`Convocados · ${selectedAthletes.length}`} size="small" sx={{ height: 24, bgcolor: '#172033', color: '#fff', fontSize: 9, fontWeight: 800 }} />
              <Chip label={`Aceptados · ${counts.aceptado}`} size="small" sx={{ height: 24, bgcolor: '#f8fafc', color: '#64748b', fontSize: 9, fontWeight: 700 }} />
              <Chip label={`Rechazados · ${counts.rechazado}`} size="small" sx={{ height: 24, bgcolor: '#f8fafc', color: '#64748b', fontSize: 9, fontWeight: 700 }} />
              <Chip label={`Pendientes · ${counts.pendiente}`} size="small" sx={{ height: 24, bgcolor: '#f8fafc', color: '#64748b', fontSize: 9, fontWeight: 700 }} />
            </Box>
          </Box>

          {paginatedSelectedAthletes.map((athlete) => {
            const athleteId = getId(athlete);
            const status = statusByAthlete.get(athleteId) || 'pendiente';
            const statusStyle = STATUS_STYLES[status];
            return (
              <Box key={athleteId} sx={{ px: 1.5, py: 1.1, borderBottom: '1px solid #eef2f6' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, minWidth: 0 }}>
                    <Avatar
                      src={athlete.foto || undefined}
                      alt={athlete.nombre_completo || 'Atleta'}
                      sx={{ width: 28, height: 28, flexShrink: 0, bgcolor: '#e0ecff', color: '#2563eb', fontSize: 9, fontWeight: 800 }}
                    >
                      {`${athlete.nombres?.[0] || ''}${athlete.apellidos?.[0] || ''}`.toUpperCase()}
                    </Avatar>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography noWrap sx={{ fontSize: 10.5, fontWeight: 800 }}>{athlete.nombre_completo}</Typography>
                      <Typography noWrap sx={{ fontSize: 9, color: '#94a3b8' }}>{[athlete.sexo, athlete.categoria, athlete.sede_nombre].filter(Boolean).join(' · ')}</Typography>
                    </Box>
                  </Box>
                  <Chip label={statusStyle.label} size="small" sx={{ height: 20, bgcolor: statusStyle.bg, color: statusStyle.color, fontSize: 8.5, fontWeight: 800 }} />
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.55, mt: 0.7, flexWrap: 'wrap' }}>
                  {[
                    ['aceptado', 'Acepto'],
                    ['rechazado', 'Rechazo'],
                    ['pendiente', 'Pendiente']
                  ].filter(([value]) => value !== status).map(([value, label]) => (
                    <Button
                      key={value}
                      size="small"
                      disabled={savingAthleteId === athleteId}
                      onClick={() => updateAthleteStatus(athleteId, value)}
                      sx={{ minWidth: 0, minHeight: 23, px: 0.9, bgcolor: STATUS_STYLES[value].bg, color: STATUS_STYLES[value].color, textTransform: 'none', fontSize: 8.5, fontWeight: 700, '&:hover': { bgcolor: STATUS_STYLES[value].bg, filter: 'brightness(.97)' } }}
                    >
                      {label}
                    </Button>
                  ))}
                  <Button
                    onClick={() => updateRosterAthletes(athlete, false)}
                    disabled={savingAthleteId === athleteId}
                    sx={{ ml: 'auto', minWidth: 0, p: 0, color: '#64748b', textTransform: 'none', fontSize: 8.5 }}
                  >
                    Quitar
                  </Button>
                </Box>
              </Box>
            );
          })}
          {selectedAthletes.length === 0 && <Typography sx={{ p: 2, fontSize: 11, color: '#64748b' }}>Todavia no hay atletas convocados.</Typography>}
          <TablePagination
            component="div"
            count={selectedAthletes.length}
            page={convocatoriaPage}
            onPageChange={(event, nextPage) => setConvocatoriaPage(nextPage)}
            rowsPerPage={convocatoriaRowsPerPage}
            onRowsPerPageChange={(event) => {
              setConvocatoriaRowsPerPage(Number(event.target.value));
              setConvocatoriaPage(0);
            }}
            rowsPerPageOptions={[5, 10, 25, 50]}
            labelRowsPerPage="Filas por página:"
            labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count !== -1 ? count : `más de ${to}`}`}
            sx={{ borderTop: '1px solid #eef2f6', '& .MuiTablePagination-toolbar': { minHeight: 42 }, '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows, & .MuiTablePagination-input': { fontSize: 10 } }}
          />
        </Box>
      </Box>

      <Snackbar open={notice.open} autoHideDuration={3000} onClose={() => setNotice((previous) => ({ ...previous, open: false }))} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity={notice.severity} variant="filled" onClose={() => setNotice((previous) => ({ ...previous, open: false }))}>{notice.message}</Alert>
      </Snackbar>
    </Box>
  );
}

export default RosterAtletasView;