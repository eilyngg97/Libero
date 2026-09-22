import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Snackbar,
  TextField,
  Typography
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import { useNavigate, useParams } from 'react-router-dom';

const EMPTY_FILTERS = {
  search: '',
  sexo: '',
  categoria: '',
  division: '',
  fechaDesde: '',
  fechaHasta: ''
};

const STATUS_STYLES = {
  aceptado: { label: 'Aceptado', color: '#15803d', bg: '#ecfdf5' },
  rechazado: { label: 'Rechazado', color: '#dc2626', bg: '#fff1f2' },
  pendiente: { label: 'Pendiente', color: '#a16207', bg: '#fff7ed' }
};

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

function uniqueOptions(rows, field) {
  return Array.from(new Set(rows.map((row) => String(row?.[field] || '').trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, 'es'));
}

function RosterAtletasView() {
  const { torneoId, rosterId } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const [torneo, setTorneo] = useState(null);
  const [roster, setRoster] = useState(null);
  const [athletes, setAthletes] = useState([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
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
      const eligibleParams = new URLSearchParams({
        torneoId,
        rosterId,
        todos: 'true'
      });
      const [torneoResponse, rostersResponse, athletesResponse] = await Promise.all([
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
        })
      ]);

      const [torneoData, rostersData, athletesData] = await Promise.all([
        torneoResponse.json(),
        rostersResponse.json(),
        athletesResponse.json()
      ]);

      if (!torneoResponse.ok) throw new Error(torneoData?.error || 'No se pudo cargar el torneo');
      if (!rostersResponse.ok || !Array.isArray(rostersData)) throw new Error(rostersData?.error || 'No se pudo cargar el roster');
      if (!athletesResponse.ok || !Array.isArray(athletesData)) throw new Error(athletesData?.error || 'No se pudieron cargar los atletas');

      const currentRoster = rostersData.find((item) => getId(item) === String(rosterId));
      if (!currentRoster) throw new Error('Roster no encontrado');

      setTorneo(torneoData);
      setRoster(currentRoster);
      setAthletes(athletesData);
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

  const filteredAthletes = useMemo(() => athletes.filter((athlete) => {
    const fullText = normalize(`${athlete.nombre_completo} ${athlete.cedula}`);
    if (filters.search && !fullText.includes(normalize(filters.search))) return false;
    if (filters.sexo && athlete.sexo !== filters.sexo) return false;
    if (filters.categoria && athlete.categoria !== filters.categoria) return false;
    if (filters.division && athlete.division !== filters.division) return false;

    if (filters.fechaDesde || filters.fechaHasta) {
      const birthDate = athlete.fecha_nacimiento ? new Date(athlete.fecha_nacimiento) : null;
      if (!birthDate || Number.isNaN(birthDate.getTime())) return false;
      if (filters.fechaDesde && birthDate < new Date(`${filters.fechaDesde}T00:00:00`)) return false;
      if (filters.fechaHasta && birthDate > new Date(`${filters.fechaHasta}T23:59:59`)) return false;
    }
    return true;
  }), [athletes, filters]);

  const selectedAthletes = useMemo(() => {
    const athleteMap = new Map(athletes.map((athlete) => [getId(athlete), athlete]));
    return Array.from(selectedIds).map((id) => athleteMap.get(id)).filter(Boolean);
  }, [athletes, selectedIds]);

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

      <Box sx={{ display: 'flex', mt: 1.4, mb: 1.7 }}>
        <Button
          variant="outlined"
          sx={{ minHeight: 31, px: 1.6, borderColor: '#e2e8f0', color: '#334155', bgcolor: '#fff', textTransform: 'none', fontSize: 10.5, fontWeight: 800, borderRadius: '6px 0 0 6px' }}
        >
          Agregar atletas
        </Button>
        <Button
          onClick={() => navigate(`/torneos/${torneoId}/equipos`)}
          sx={{ minHeight: 31, px: 1.6, color: '#64748b', bgcolor: '#f8fafc', textTransform: 'none', fontSize: 10.5, borderRadius: '0 6px 6px 0' }}
        >
          Gestionar roster
        </Button>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 3fr) minmax(330px, 2fr)' }, gap: 1.4, alignItems: 'start' }}>
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
                ['categoria', 'Categoria', options.categorias],
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
                  {values.map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}
                </TextField>
              ))}
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
            <Box sx={{ minWidth: 700 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1.45fr .8fr .9fr .9fr .8fr 72px', gap: 1, px: 1.5, py: 0.8, borderTop: '1px solid #eef2f6', borderBottom: '1px solid #eef2f6', bgcolor: '#fbfcfd' }}>
                {['ATLETA', 'SEXO', 'CATEGORIA', 'DIVISION', 'F. NAC.', ''].map((label, index) => (
                  <Typography key={`${label}-${index}`} sx={{ fontSize: 8.5, color: '#94a3b8', fontWeight: 800 }}>{label}</Typography>
                ))}
              </Box>
              {filteredAthletes.map((athlete) => {
                const athleteId = getId(athlete);
                const selected = selectedIds.has(athleteId);
                const blocked = athlete.ya_en_otro_roster && !selected;
                return (
                  <Box
                    key={athleteId}
                    sx={{ display: 'grid', gridTemplateColumns: '1.45fr .8fr .9fr .9fr .8fr 72px', gap: 1, alignItems: 'center', px: 1.5, py: 0.8, minHeight: 38, borderBottom: '1px solid #f1f5f9', bgcolor: selected ? '#fff9f6' : '#fff' }}
                  >
                    <Typography noWrap sx={{ fontSize: 10.5, fontWeight: 700 }}>{athlete.nombre_completo || 'Sin nombre'}</Typography>
                    <Typography noWrap sx={{ fontSize: 9.5, color: '#64748b' }}>{athlete.sexo || '-'}</Typography>
                    <Typography noWrap sx={{ fontSize: 9.5, color: '#64748b' }}>{athlete.categoria || '-'}</Typography>
                    <Typography noWrap sx={{ fontSize: 9.5, color: '#64748b' }}>{athlete.division || '-'}</Typography>
                    <Typography noWrap sx={{ fontSize: 9.5, color: '#64748b' }}>{formatDate(athlete.fecha_nacimiento)}</Typography>
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

          {selectedAthletes.map((athlete) => {
            const athleteId = getId(athlete);
            const status = statusByAthlete.get(athleteId) || 'pendiente';
            const statusStyle = STATUS_STYLES[status];
            return (
              <Box key={athleteId} sx={{ px: 1.5, py: 1.1, borderBottom: '1px solid #eef2f6' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography noWrap sx={{ fontSize: 10.5, fontWeight: 800 }}>{athlete.nombre_completo}</Typography>
                    <Typography noWrap sx={{ fontSize: 9, color: '#94a3b8' }}>{[athlete.sexo, athlete.categoria, athlete.division].filter(Boolean).join(' · ')}</Typography>
                  </Box>
                  <Chip label={statusStyle.label} size="small" sx={{ height: 20, bgcolor: statusStyle.bg, color: statusStyle.color, fontSize: 8.5, fontWeight: 800 }} />
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.55, mt: 0.7, flexWrap: 'wrap' }}>
                  {[
                    ['aceptado', 'Acepto'],
                    ['rechazado', 'Rechazo'],
                    ['pendiente', 'Pendiente']
                  ].map(([value, label]) => (
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
        </Box>
      </Box>

      <Snackbar open={notice.open} autoHideDuration={3000} onClose={() => setNotice((previous) => ({ ...previous, open: false }))} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity={notice.severity} variant="filled" onClose={() => setNotice((previous) => ({ ...previous, open: false }))}>{notice.message}</Alert>
      </Snackbar>
    </Box>
  );
}

export default RosterAtletasView;