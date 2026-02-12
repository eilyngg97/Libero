import React, { useEffect, useMemo, useState } from 'react';
import { Box, Typography, Grid, IconButton, Button, Chip, Avatar, Divider } from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import PersonIcon from '@mui/icons-material/Person';
import DescriptionIcon from '@mui/icons-material/Description';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import { useLocation, useNavigate } from 'react-router-dom';

function PanelOpcionesUsuario() {
  const location = useLocation();
  const navigate = useNavigate();
  const [loadingRep, setLoadingRep] = useState(false);
  const [torneosAlumno, setTorneosAlumno] = useState([]);
  const [torneosLoading, setTorneosLoading] = useState(false);
  const [torneosError, setTorneosError] = useState('');
  const [mensualidades, setMensualidades] = useState([]);
  const [mensualidadesLoading, setMensualidadesLoading] = useState(false);
  const [mensualidadesError, setMensualidadesError] = useState('');
  const alumno = location.state?.alumno;
  const sede = location.state?.sede;

  useEffect(() => {
    if (!alumno?._id) return;
    const fetchTorneos = async () => {
      setTorneosLoading(true);
      setTorneosError('');
      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/torneos/por-alumno/${alumno._id}`);
        const data = await res.json();
        if (!res.ok || !Array.isArray(data)) throw new Error('No se pudieron cargar los torneos');
        setTorneosAlumno(data);
      } catch (err) {
        setTorneosAlumno([]);
        setTorneosError(err.message);
      } finally {
        setTorneosLoading(false);
      }
    };
    fetchTorneos();
  }, [alumno?._id]);

  useEffect(() => {
    if (!alumno?._id) return;
    const fetchMensualidades = async () => {
      setMensualidadesLoading(true);
      setMensualidadesError('');
      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades?id_alumno=${alumno._id}`);
        const data = await res.json();
        if (!res.ok || !Array.isArray(data)) throw new Error('No se pudieron cargar las mensualidades');
        setMensualidades(data);
      } catch (err) {
        setMensualidades([]);
        setMensualidadesError(err.message);
      } finally {
        setMensualidadesLoading(false);
      }
    };
    fetchMensualidades();
  }, [alumno?._id]);

  const handleRespuestaTorneo = async (torneoId, estado) => {
    if (!alumno?._id) return;
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/torneos/${torneoId}/convocados/${alumno._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo registrar la respuesta');
      setTorneosAlumno(prev => prev.map(t => t._id === torneoId ? { ...t, estado } : t));
    } catch (err) {
      window.alert(err.message);
    }
  };

  const formatFechaCorta = (iso) => {
    if (!iso) return '-';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  };

  const formatHora = (iso) => {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  };

  const isDeadlinePassed = (iso) => {
    if (!iso) return false;
    return new Date() > new Date(iso);
  };

  const resumenPago = useMemo(() => {
    if (mensualidadesLoading) {
      return { label: 'Cargando', color: 'info', detalle: 'Actualizando estado de pago', proximo: '' };
    }
    if (mensualidadesError) {
      return { label: 'Sin datos', color: 'warning', detalle: 'No se pudo cargar el estado de pago', proximo: '' };
    }
    if (!Array.isArray(mensualidades) || mensualidades.length === 0) {
      return { label: 'Sin datos', color: 'warning', detalle: 'No hay mensualidades registradas', proximo: '' };
    }

    const normalizarEstado = (estado) => (estado || '').toLowerCase();
    const mensualidadesOrdenadas = mensualidades
      .map((m) => {
        const fecha = new Date(`${m.anio}-${String(m.mes).padStart(2, '0')}-01T00:00:00`);
        return {
          estado: normalizarEstado(m.estatus),
          fecha,
          raw: m
        };
      })
      .filter((m) => !Number.isNaN(m.fecha.getTime()))
      .sort((a, b) => a.fecha - b.fecha);

    const pendientes = mensualidadesOrdenadas.filter(
      (m) => !['pagado', 'exonerado'].includes(m.estado)
    );
    const hayRetraso = pendientes.some((m) => m.estado === 'retrasado');
    const hayPendiente = pendientes.length > 0;
    const proximo = pendientes.length ? pendientes[0].fecha : null;

    if (hayRetraso) {
      return {
        label: 'Retrasado',
        color: 'error',
        detalle: 'Tienes mensualidades vencidas',
        proximo: proximo ? proximo.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : ''
      };
    }

    if (hayPendiente) {
      return {
        label: 'Pendiente',
        color: 'warning',
        detalle: 'Tienes mensualidades por pagar',
        proximo: proximo ? proximo.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }) : ''
      };
    }

    const ultima = mensualidadesOrdenadas[mensualidadesOrdenadas.length - 1];
    return {
      label: 'Al dia',
      color: 'success',
      detalle: 'Todas las mensualidades estan al dia',
      proximo: ultima?.fecha
        ? ultima.fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
        : ''
    };
  }, [mensualidades, mensualidadesError, mensualidadesLoading]);

  return (
    <Box sx={{ p: 2 }}>
        <Box sx={{ mb: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Bienvenido de nuevo, {alumno?.nombres || 'Jugador'}
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b' }}>
            Aqui tienes el resumen de actividades de {alumno?.nombres || 'tu cuenta'} para esta semana.
          </Typography>
        </Box>
        <Grid container spacing={4} sx={{ mt: 3 }}>
          <Grid item size={{ xs:12, md:8 }}>
            <Grid container spacing={2.5} mt={1} justifyContent="center">
              <Grid item size={{ xs:12, sm:6, md:6 }}>
                <Box sx={{
                  borderRadius: 3,
                  minWidth: 160,
                  minHeight: 200,
                  boxShadow: 4,
                  background: 'linear-gradient(135deg, #ff8a00 0%, #ff6a00 100%)',
                  color: 'white',
                  p: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'transform 0.2s',
                  '& > *:not(.bg-icon)': { position: 'relative', zIndex: 1 },
                  '&:hover': { transform: 'scale(1.04)' }
                }} onClick={() => navigate(`/pagos-alumno/${alumno._id}`, { state: { alumno, sede } })}>
                  <IconButton sx={{ bgcolor: 'rgba(255,255,255,0.2)', mb: 1 }}>
                    <NotificationsIcon sx={{ fontSize: 32, color: 'white' }} />
                  </IconButton>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>Pagos</Typography>
                  <Typography variant="body2">Ver y gestionar tus pagos</Typography>
                  <NotificationsIcon
                    className="bg-icon"
                    sx={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      fontSize: 96,
                      opacity: 0.16,
                      color: 'white'
                    }}
                  />
                </Box>
              </Grid>
              <Grid item size={{ xs:12, sm:6, md:6 }}>
                <Box sx={{
                  borderRadius: 3,
                  minWidth: 160,
                  minHeight: 200,
                  boxShadow: 4,
                  background: 'linear-gradient(135deg, #7b5cff 0%, #5a34d6 100%)',
                  color: 'white',
                  p: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'transform 0.2s',
                  '& > *:not(.bg-icon)': { position: 'relative', zIndex: 1 },
                  '&:hover': { transform: 'scale(1.04)' }
                }}
                  onClick={async () => {
                    if (alumno && alumno.representante && typeof alumno.representante === 'string') {
                      setLoadingRep(true);
                      try {
                        const res = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:4000'}/api/representantes/${alumno.representante}`);
                        if (res.ok) {
                          const repData = await res.json();
                          navigate(`/alumno-editar/${alumno._id}`, { state: { alumno: { ...alumno, representante: repData }, sede } });
                        } else {
                          navigate(`/alumno-editar/${alumno._id}`, { state: { alumno, sede } });
                        }
                      } catch {
                        navigate(`/alumno-editar/${alumno._id}`, { state: { alumno, sede } });
                      } finally {
                        setLoadingRep(false);
                      }
                    } else {
                      navigate(`/alumno-editar/${alumno._id}`, { state: { alumno, sede } });
                    }
                  }}
                >
                  <IconButton sx={{ bgcolor: 'rgba(255,255,255,0.2)', mb: 1 }}>
                    <PersonIcon sx={{ fontSize: 32, color: 'white' }} />
                  </IconButton>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>Mis datos</Typography>
                  <Typography variant="body2">Ver y editar tus datos</Typography>
                  {loadingRep && <Typography variant="caption">Cargando representante...</Typography>}
                  <PersonIcon
                    className="bg-icon"
                    sx={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      fontSize: 96,
                      opacity: 0.16,
                      color: 'white'
                    }}
                  />
                </Box>
              </Grid>
              <Grid item size={{ xs:12, sm:6, md:6 }}>
                <Box sx={{
                  borderRadius: 3,
                  minWidth: 160,
                  minHeight: 200,
                  boxShadow: 4,
                  background: 'linear-gradient(135deg, #16c1de 0%, #0f8aa7 100%)',
                  color: 'white',
                  p: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'transform 0.2s',
                  '& > *:not(.bg-icon)': { position: 'relative', zIndex: 1 },
                  '&:hover': { transform: 'scale(1.04)' }
                }} onClick={() => navigate('/constancias', { state: { alumno, sede } })}>
                  <IconButton sx={{ bgcolor: 'rgba(255,255,255,0.2)', mb: 1 }}>
                    <DescriptionIcon sx={{ fontSize: 32, color: 'white' }} />
                  </IconButton>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>Constancias</Typography>
                  <Typography variant="body2">Solicita y gestiona constancias</Typography>
                  <DescriptionIcon
                    className="bg-icon"
                    sx={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      fontSize: 96,
                      opacity: 0.16,
                      color: 'white'
                    }}
                  />
                </Box>
              </Grid>
              <Grid item size={{ xs:12, sm:6, md:6 }}>
                <Box sx={{
                  borderRadius: 3,
                  minWidth: 160,
                  minHeight: 200,
                  boxShadow: 4,
                  background: 'linear-gradient(135deg, #27c86b 0%, #0ea577 100%)',
                  color: 'white',
                  p: 2,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  position: 'relative',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'transform 0.2s',
                  '& > *:not(.bg-icon)': { position: 'relative', zIndex: 1 },
                  '&:hover': { transform: 'scale(1.04)' }
                }} onClick={() => navigate('/solicitud-uniforme', { state: { alumno, sede } })}>
                  <IconButton sx={{ bgcolor: 'rgba(255,255,255,0.2)', mb: 1 }}>
                    <ShoppingBagIcon sx={{ fontSize: 32, color: 'white' }} />
                  </IconButton>
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>Solicitar uniforme</Typography>
                  <Typography variant="body2">Solicita tu uniforme</Typography>
                  <ShoppingBagIcon
                    className="bg-icon"
                    sx={{
                      position: 'absolute',
                      top: 12,
                      right: 12,
                      fontSize: 96,
                      opacity: 0.16,
                      color: 'white'
                    }}
                  />
                </Box>
              </Grid>
            </Grid>
            <Box sx={{ mt: 4 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: 700 }}>Proximos torneos</Typography>
              </Box>
              {torneosLoading && <Typography variant="body2">Cargando...</Typography>}
              {torneosError && <Typography variant="body2" color="error">{torneosError}</Typography>}
              {!torneosLoading && !torneosError && torneosAlumno.length === 0 && (
                <Typography variant="body2" sx={{ color: '#64748b' }}>
                  No tienes convocatorias activas.
                </Typography>
              )}
              {torneosAlumno.map((t) => {
                const deadlinePassed = isDeadlinePassed(t.fecha_limite);
                const estado = t.estado || 'pendiente';
                const fechaTexto = formatFechaCorta(t.fecha_limite);
                const fechaParts = fechaTexto.split(' ');
                const dia = fechaParts[0] || '--';
                const mes = (fechaParts[1] || '').toUpperCase();
                return (
                  <Box
                    key={t._id}
                    sx={{
                      mb: 2,
                      p: { xs: 2, md: 2.5 },
                      borderRadius: 3,
                      border: '1px solid #e2e8f0',
                      backgroundColor: 'white',
                      boxShadow: '0 8px 20px rgba(15, 23, 42, 0.08)'
                    }}
                  >
                    <Grid container spacing={2} alignItems="center" sx={{ flexWrap: 'nowrap' }}>
                      <Grid item xs={12} sm={2} md={2}>
                        <Box
                          sx={{
                            width: 86,
                            height: 86,
                            borderRadius: 2.5,
                            background: 'linear-gradient(135deg, #f97316, #fb923c)',
                            color: 'white',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 700,
                            textAlign: 'center'
                          }}
                        >
                          <Typography sx={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>
                            {dia}
                          </Typography>
                          <Typography sx={{ fontSize: 10, letterSpacing: '0.08em' }}>
                            {mes}
                          </Typography>
                          <Typography sx={{ fontSize: 10, opacity: 0.9, mt: 0.5 }}>
                            {formatHora(t.fecha_limite) || 'Hora'}
                          </Typography>
                        </Box>
                      </Grid>
                      <Grid item xs={12} sm={6.5} md={6.5}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                          {t.liga && (
                            <Chip
                              size="small"
                              label={t.liga}
                              sx={{ bgcolor: '#ffedd5', color: '#c2410c', fontWeight: 700 }}
                            />
                          )}
                          {alumno?.categoria && (
                            <Chip
                              size="small"
                              label={`Categoria ${alumno.categoria}`}
                              sx={{ bgcolor: '#e2e8f0', color: '#475569', fontWeight: 700 }}
                            />
                          )}
                        </Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, color: '#0f172a' }}>
                          {t.nombre}
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#64748b' }}>
                          {t.descripcion || 'Convocatoria abierta para este torneo.'}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} sm={3.5} md={3.5} />
                    </Grid>
                    <Divider sx={{ my: 2 }} />
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, flexWrap: 'wrap' }}>
                      {deadlinePassed && (
                        <Typography variant="caption" sx={{ color: '#b91c1c', display: 'block', alignSelf: 'center' }}>
                          La fecha limite ya paso.
                        </Typography>
                      )}
                      <Button
                        variant="contained"
                        disabled={estado !== 'pendiente' || deadlinePassed}
                        onClick={() => handleRespuestaTorneo(t._id, 'aceptado')}
                        sx={{
                          bgcolor: '#f97316',
                          '&:hover': { bgcolor: '#ea580c' },
                          fontWeight: 700,
                          borderRadius: 2,
                          width: 132
                        }}
                      >
                        Aceptar
                      </Button>
                      <Button
                        variant="outlined"
                        disabled={estado !== 'pendiente' || deadlinePassed}
                        onClick={() => handleRespuestaTorneo(t._id, 'rechazado')}
                        sx={{
                          borderColor: '#e2e8f0',
                          color: '#64748b',
                          fontWeight: 700,
                          borderRadius: 2,
                          width: 132
                        }}
                      >
                        Declinar
                      </Button>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Grid>
          <Grid item xs={12} md={4}>
            <Box sx={{ position: { xs: 'static', md: 'sticky' }, top: { md: 24 } }}>
              <Box
                sx={{
                  borderRadius: 3,
                  border: '1px solid #e5e7eb',
                  backgroundColor: 'white',
                  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)',
                  overflow: 'hidden'
                }}
              >
                <Box sx={{ height: 90, background: 'linear-gradient(135deg, #60a5fa, #2563eb)' }} />
                <Box sx={{ px: 3, pb: 3, textAlign: 'center', mt: -5 }}>
                  <Avatar
                    src={alumno?.foto || undefined}
                    alt={alumno?.nombres}
                    sx={{ width: 80, height: 80, border: '3px solid white', mx: 'auto' }}
                  />
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 1 }}>
                    {alumno?.nombres} {alumno?.apellidos}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    ID: #{alumno?._id?.slice(-6) || 'N/A'} • Categoria {alumno?.categoria || '-'}
                  </Typography>
                  <Grid container spacing={2} sx={{ mt: 2 }}>
                    <Grid item xs={6}>
                      <Box sx={{ borderRadius: 2, border: '1px solid #e5e7eb', p: 1 }}>
                        <Typography variant="caption" sx={{ color: '#94a3b8' }}>Asistencia</Typography>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>92%</Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={6}>
                      <Box sx={{ borderRadius: 2, border: '1px solid #e5e7eb', p: 1 }}>
                        <Typography variant="caption" sx={{ color: '#94a3b8' }}>Puntos</Typography>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>145</Typography>
                      </Box>
                    </Grid>
                  </Grid>
                </Box>
              </Box>
              <Box
                sx={{
                  mt: 2,
                  p: 2,
                  borderRadius: 3,
                  border: '1px solid #e5e7eb',
                  backgroundColor: 'white',
                  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)'
                }}
              >
                <Typography variant="subtitle2" sx={{ color: '#64748b', fontWeight: 700, mb: 1 }}>
                  Estado de pago
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  {resumenPago.color === 'success' && <CheckCircleIcon color="success" />}
                  {resumenPago.color === 'error' && <ErrorOutlineIcon color="error" />}
                  {(resumenPago.color === 'warning' || resumenPago.color === 'info') && (
                    <PendingActionsIcon color={resumenPago.color} />
                  )}
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {resumenPago.label}
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ color: '#64748b', mb: 1 }}>
                  {resumenPago.detalle}
                </Typography>
                {resumenPago.proximo && (
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                    Proximo vencimiento: {resumenPago.proximo}
                  </Typography>
                )}
              </Box>
            </Box>
          </Grid>
        </Grid>
    </Box>
  );
}

export default PanelOpcionesUsuario;
