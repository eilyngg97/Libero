import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  Snackbar,
  Typography
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { useNavigate, useParams } from 'react-router-dom';
import RosterCreateDialog from './RosterCreateDialog';

function TorneoEquiposView() {
  const { torneoId } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const [torneo, setTorneo] = useState(null);
  const [rosters, setRosters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [openRosterDialog, setOpenRosterDialog] = useState(false);
  const [dialogEliminarRosterOpen, setDialogEliminarRosterOpen] = useState(false);
  const [rosterAEliminar, setRosterAEliminar] = useState(null);
  const [savingRosterId, setSavingRosterId] = useState('');

  const [uiAlert, setUiAlert] = useState({ open: false, severity: 'success', title: '', message: '' });

  const showUiAlert = (severity, title, message) => {
    setUiAlert({ open: true, severity, title, message });
  };

  const buildAuthHeaders = useCallback((baseHeaders = {}) => ({
    ...baseHeaders,
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }), [token]);

  const parseJsonResponse = useCallback(async (response, label) => {
    const contentType = String(response.headers.get('content-type') || '');
    const rawText = await response.text();

    if (!rawText) {
      return null;
    }

    if (contentType.includes('application/json') || rawText.trim().startsWith('{') || rawText.trim().startsWith('[')) {
      try {
        return JSON.parse(rawText);
      } catch (parseError) {
        const preview = rawText.slice(0, 180).replace(/\s+/g, ' ');
        throw new Error(`${label}: la API devolvió JSON inválido (${preview})`);
      }
    }

    const preview = rawText.slice(0, 180).replace(/\s+/g, ' ');
    throw new Error(`${label}: la API respondió con contenido no JSON (${response.status}). ${preview}`);
  }, []);

  const fetchData = useCallback(async () => {
    if (!torneoId) return;
    setLoading(true);
    setError('');
    try {
      const [torneoRes, rostersRes] = await Promise.all([
        fetch(`${process.env.REACT_APP_API_URL}/api/torneos/${torneoId}?_t=${Date.now()}`, {
          cache: 'no-store',
          headers: buildAuthHeaders()
        }),
        fetch(`${process.env.REACT_APP_API_URL}/api/rosters?torneoId=${torneoId}&_t=${Date.now()}`, {
          cache: 'no-store',
          headers: buildAuthHeaders()
        })
      ]);

      const torneoData = await parseJsonResponse(torneoRes, 'Torneo');
      const rostersData = await parseJsonResponse(rostersRes, 'Roster');

      if (!torneoRes.ok) throw new Error(torneoData?.error || 'No se pudo cargar torneo');
      if (!rostersRes.ok || !Array.isArray(rostersData)) throw new Error(rostersData?.error || 'No se pudieron cargar equipos');

      setTorneo(torneoData);
      setRosters(rostersData);
    } catch (err) {
      console.error('Error cargando equipos del torneo:', err);
      setError(err.message || 'No se pudo cargar la vista de equipos');
      setTorneo(null);
      setRosters([]);
    } finally {
      setLoading(false);
    }
  }, [buildAuthHeaders, parseJsonResponse, torneoId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const estadoPorAlumno = useMemo(() => {
    const map = new Map();
    (torneo?.convocados || []).forEach((c) => {
      const id = String(c?.alumno?._id || c?.alumno || '');
      if (id) map.set(id, String(c?.estado || 'pendiente'));
    });
    return map;
  }, [torneo]);

  const statsGlobal = useMemo(() => {
    const convocados = Array.isArray(torneo?.convocados) ? torneo.convocados : [];
    const aceptados = convocados.filter((c) => c.estado === 'aceptado').length;
    const rechazados = convocados.filter((c) => c.estado === 'rechazado').length;
    const pendientes = convocados.filter((c) => c.estado === 'pendiente').length;
    return { convocados: convocados.length, aceptados, rechazados, pendientes };
  }, [torneo]);

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
      if (!res.ok) throw new Error(data?.error || 'No se pudo eliminar el equipo');

      await fetchData();
      setDialogEliminarRosterOpen(false);
      setRosterAEliminar(null);
      showUiAlert('success', 'Operacion completada', 'Equipo eliminado con exito.');
    } catch (err) {
      setDialogEliminarRosterOpen(false);
      setRosterAEliminar(null);
      showUiAlert('error', 'Operacion fallida', err.message || 'No se pudo eliminar el equipo.');
    } finally {
      setSavingRosterId('');
    }
  };

  if (loading) {
    return <Typography sx={{ color: '#64748b' }}>Cargando equipos...</Typography>;
  }

  if (error) {
    return <Typography color="error">{error}</Typography>;
  }

  if (!torneo) {
    return <Typography sx={{ color: '#64748b' }}>No se encontro el torneo.</Typography>;
  }

  return (
    <Box sx={{ bgcolor: '#ffffff', width: '100%' }}>
      <Button
        size="small"
        variant="text"
        onClick={() => navigate('/torneos')}
        sx={{
          textTransform: 'none',
          color: '#64748b',
          fontSize: 11,
          px: 0,
          minWidth: 0,
          mb: 0.45,
          '&:hover': { bgcolor: 'transparent', color: '#334155' }
        }}
      >
        ← Volver a torneos
      </Button>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1.2, flexWrap: 'wrap' }}>
        <Box>
          <Typography sx={{ fontSize: 21, lineHeight: 1.1, fontWeight: 800, color: '#172033' }}>{torneo.nombre}</Typography>
          <Typography sx={{ fontSize: 10.5, color: '#7b8797', mt: 0.25 }}>{torneo.descripcion || 'Sin descripcion'}</Typography>
        </Box>
        <Button
          size="small"
          variant="contained"
          onClick={() => setOpenRosterDialog(true)}
          sx={{
            textTransform: 'none',
            borderRadius: 1.5,
            px: 1.25,
            py: 0.45,
            fontWeight: 700,
            fontSize: 10.5,
            bgcolor: '#f97316',
            boxShadow: 'none',
            '&:hover': { bgcolor: '#ea580c' }
          }}
        >
          + Agregar equipo
        </Button>
      </Box>

      <Box
        sx={{
          mt: 1.3,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(4, minmax(0, 1fr))' },
          gap: 1,
          width: '100%',
          '& > *': { boxSizing: 'border-box', minWidth: 0 }
        }}
      >
        <Box sx={{ border: '1px solid #e7ebf1', borderRadius: 1.6, px: 1.3, py: 1, boxShadow: '0 4px 12px rgba(15, 23, 42, 0.05)', width: '100%', minHeight: 58 }}>
          <Typography sx={{ fontSize: 9, letterSpacing: '0.08em', color: '#7b8797', fontWeight: 800 }}>CONVOCADOS</Typography>
          <Typography sx={{ fontSize: 23, fontWeight: 800, color: '#172033', lineHeight: 1.15 }}>{statsGlobal.convocados}</Typography>
        </Box>
        <Box sx={{ border: '1px solid #e7ebf1', borderRadius: 1.6, px: 1.3, py: 1, boxShadow: '0 4px 12px rgba(15, 23, 42, 0.05)', width: '100%', minHeight: 58 }}>
          <Typography sx={{ fontSize: 9, letterSpacing: '0.08em', color: '#7b8797', fontWeight: 800 }}>ACEPTADOS</Typography>
          <Typography sx={{ fontSize: 23, fontWeight: 800, color: '#15803d', lineHeight: 1.15 }}>{statsGlobal.aceptados}</Typography>
        </Box>
        <Box sx={{ border: '1px solid #e7ebf1', borderRadius: 1.6, px: 1.3, py: 1, boxShadow: '0 4px 12px rgba(15, 23, 42, 0.05)', width: '100%', minHeight: 58 }}>
          <Typography sx={{ fontSize: 9, letterSpacing: '0.08em', color: '#7b8797', fontWeight: 800 }}>RECHAZADOS</Typography>
          <Typography sx={{ fontSize: 23, fontWeight: 800, color: '#dc2626', lineHeight: 1.15 }}>{statsGlobal.rechazados}</Typography>
        </Box>
        <Box sx={{ border: '1px solid #e7ebf1', borderRadius: 1.6, px: 1.3, py: 1, boxShadow: '0 4px 12px rgba(15, 23, 42, 0.05)', width: '100%', minHeight: 58 }}>
          <Typography sx={{ fontSize: 9, letterSpacing: '0.08em', color: '#7b8797', fontWeight: 800 }}>PENDIENTES</Typography>
          <Typography sx={{ fontSize: 23, fontWeight: 800, color: '#a16207', lineHeight: 1.15 }}>{statsGlobal.pendientes}</Typography>
        </Box>
      </Box>

      <Typography sx={{ fontSize: 16, fontWeight: 800, color: '#172033', mt: 1.5, mb: 0.9 }}>
        Equipos / Rosters
      </Typography>

      {rosters.length === 0 && <Typography sx={{ fontSize: 13, color: '#64748b' }}>Aun no hay equipos para este torneo.</Typography>}

      {rosters.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, minmax(0, 1fr))',
              md: 'repeat(3, minmax(0, 1fr))',
              lg: 'repeat(5, minmax(0, 1fr))'
            },
            gap: 1.5,
            alignItems: 'start'
          }}
        >
          {rosters.map((roster) => {
            const rosterId = roster._id || roster.id;
            const rosterJugadorIds = (Array.isArray(roster.jugadores) ? roster.jugadores : []).map((j) => String(j));

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
              <Box key={rosterId} sx={{ width: '100%', border: '1px solid #e6ebf2', borderRadius: 1.5, p: 1.4, boxShadow: '0 4px 12px rgba(15, 23, 42, 0.05)', bgcolor: '#ffffff', boxSizing: 'border-box' }}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#172033', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {roster.liga_name || `${torneo.nombre} ${roster.categoria || ''}`.trim()}
                      </Typography>
                      <Typography sx={{ fontSize: 10.5, color: '#7b8797', mt: 0.3 }}>{sublinea}</Typography>
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
                      sx={{ borderRadius: 1.2, textTransform: 'none', fontSize: 10, minWidth: 54, minHeight: 25, py: 0, px: 0.7 }}
                    >
                      Eliminar
                    </Button>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 0.45, flexWrap: 'wrap', mt: 1 }}>
                    <Chip size="small" label={`${totalJugadoras} convocados`} sx={{ height: 21, bgcolor: '#eff6ff', color: '#1e3a8a', fontWeight: 700, fontSize: 9.5 }} />
                    <Chip size="small" label={`${rAceptados} aceptados`} sx={{ height: 21, bgcolor: '#ecfdf5', color: '#166534', fontWeight: 700, fontSize: 9.5 }} />
                    <Chip size="small" label={`${rRechazados} rechazados`} sx={{ height: 21, bgcolor: '#fff1f2', color: '#b91c1c', fontWeight: 700, fontSize: 9.5 }} />
                    <Chip size="small" label={`${rPendientes} pendientes`} sx={{ height: 21, bgcolor: '#fff7ed', color: '#9a3412', fontWeight: 700, fontSize: 9.5 }} />
                  </Box>

                  <Button
                    fullWidth
                    size="small"
                    variant="contained"
                    onClick={() => navigate(`/torneos/${torneoId}/equipos/${rosterId}/atletas`)}
                    disabled={savingRosterId === rosterId}
                    sx={{
                      mt: 1,
                      textTransform: 'none',
                      borderRadius: 1.4,
                      minHeight: 32,
                      fontWeight: 800,
                      fontSize: 10.5,
                      bgcolor: '#f97316',
                      boxShadow: 'none',
                      '&:hover': { bgcolor: '#ea580c' }
                    }}
                  >
                    Agregar atletas
                  </Button>

                  <Button
                    fullWidth
                    size="small"
                    variant="outlined"
                    onClick={() => navigate(`/torneos/${torneoId}/equipos/${rosterId}/documento`)}
                    sx={{
                      mt: 0.75,
                      textTransform: 'none',
                      borderRadius: 1.4,
                      minHeight: 32,
                      fontWeight: 700,
                      fontSize: 10.5,
                      borderColor: '#e5e7eb',
                      color: '#334155'
                    }}
                  >
                    Editar documento
                  </Button>

              </Box>
            );
          })}
        </Box>
      )}

      <Dialog
        open={dialogEliminarRosterOpen}
        onClose={() => {
          setDialogEliminarRosterOpen(false);
          setRosterAEliminar(null);
        }}
        fullWidth
        maxWidth="xs"
        PaperProps={{ sx: { borderRadius: 3, boxShadow: '0 20px 44px rgba(15, 23, 42, 0.22)' } }}
      >
        <DialogContent sx={{ px: 3, pt: 3, pb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
            <Box sx={{ width: 32, height: 32, display: 'grid', placeItems: 'center', borderRadius: '50%', bgcolor: '#fff1f2', color: '#dc2626' }}>
              <DeleteIcon sx={{ fontSize: 17 }} />
            </Box>
            <Typography sx={{ fontSize: 20, fontWeight: 800, color: '#172033' }}>Eliminar equipo</Typography>
          </Box>
          <Typography sx={{ mt: 0.8, fontSize: 13.5, lineHeight: 1.55, color: '#64748b' }}>Se eliminará permanentemente el equipo</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => { setDialogEliminarRosterOpen(false); setRosterAEliminar(null); }} variant="outlined" sx={{ borderColor: '#d0d5dd', color: '#344054', textTransform: 'none', fontWeight: 700 }}>Cancelar</Button>
          <Button
            onClick={eliminarRoster}
            color="error"
            variant="contained"
            startIcon={<DeleteIcon />}
            sx={{ textTransform: 'none', fontWeight: 700, boxShadow: 'none' }}
            disabled={!rosterAEliminar || savingRosterId === (rosterAEliminar?._id || rosterAEliminar?.id)}
          >
            {savingRosterId === (rosterAEliminar?._id || rosterAEliminar?.id) ? 'Eliminando...' : 'Eliminar equipo'}
          </Button>
        </DialogActions>
      </Dialog>

      <RosterCreateDialog
        open={openRosterDialog}
        onClose={() => setOpenRosterDialog(false)}
        token={token}
        prefillTorneoId={torneoId}
        onCreated={() => {
          fetchData().catch(() => {});
          showUiAlert('success', 'Operacion completada', 'Equipo creado con exito.');
        }}
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

export default TorneoEquiposView;
