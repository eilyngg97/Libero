import React, { useEffect, useMemo, useState } from 'react';
import { Box, Typography, Grid, IconButton, Button, Chip, Avatar, Alert } from '@mui/material';
import NotificationsIcon from '@mui/icons-material/Notifications';
import PersonIcon from '@mui/icons-material/Person';
import DescriptionIcon from '@mui/icons-material/Description';
import ShoppingBagIcon from '@mui/icons-material/ShoppingBag';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import SavingsOutlinedIcon from '@mui/icons-material/SavingsOutlined';
import { useLocation, useNavigate } from 'react-router-dom';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import { mediaUrl } from '../utils/mediaUrl';
import TerminosPendientesAlert from './TerminosPendientesAlert.js';

const normalizarDiaMes = (value) => {
  const numero = Number(value);
  if (!Number.isInteger(numero) || numero < 1 || numero > 31) return null;
  return numero;
};

const construirFechaPeriodoConDia = (mes, anio, dia) => {
  const ultimoDiaMes = new Date(anio, mes, 0).getDate();
  const diaAjustado = Math.min(Math.max(1, Number(dia) || 1), ultimoDiaMes);
  return new Date(anio, mes - 1, diaAjustado);
};

const parseFechaSinDesfase = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  const matchIso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (matchIso) {
    const year = Number(matchIso[1]);
    const month = Number(matchIso[2]);
    const day = Number(matchIso[3]);
    const fecha = new Date(year, month - 1, day);
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }

  const fecha = new Date(value);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
};

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
  const [juegosAlumno, setJuegosAlumno] = useState([]);
  const [juegosLoading, setJuegosLoading] = useState(false);
  const [juegosError, setJuegosError] = useState('');
  const [pedidosUniforme, setPedidosUniforme] = useState([]);
  const [uniformesLoading, setUniformesLoading] = useState(false);
  const [uniformesError, setUniformesError] = useState('');
  const alumno = location.state?.alumno;
  const sede = location.state?.sede;
  const token = localStorage.getItem('token');
  const tenantId = String(localStorage.getItem('tenantId') || '').trim().toLowerCase();
  const esUsuarioEsporta = tenantId === 'esporta';
  const sizeTarjetaOpciones = { xs: 12, sm: 6, md: 6 };
  const saldoAFavorActual = Number(alumno?.saldo_a_favor_mensualidades) || 0;

  const handleRespuestaJuego = async (torneoId, partidoId, estado) => {
    if (!alumno?._id) return;
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/torneos/${torneoId}/partidos/${partidoId}/convocados/${alumno._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo registrar la respuesta');
      setJuegosAlumno(prev => prev.map(j => j._id === partidoId ? { ...j, estadoConvocatoria: estado, respondido_en: data.respondido_en } : j));
    } catch (err) {
      window.alert(err.message);
    }
  };
  
  // Utilidad para obtener partidos futuros donde el alumno está convocado
  const fetchProximosJuegos = async (alumnoId, torneos) => {
    const juegos = [];
    for (const torneo of torneos) {
      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/torneos/${torneo._id}/partidos`);
        const data = await res.json();
        if (Array.isArray(data)) {
          const ahora = new Date();
          data.forEach(partido => {
            // Buscar convocatoria del alumno en el partido
            const convocado = Array.isArray(partido.convocados)
              ? partido.convocados.find(c => (c.alumno?._id || c.alumno) === alumnoId)
              : null;
            if (
              convocado &&
              new Date(partido.fecha) > ahora
            ) {
              juegos.push({ ...partido, torneo, estadoConvocatoria: convocado.estado, respondido_en: convocado.respondido_en });
            }
          });
        }
      } catch {}
    }
    // Ordenar por fecha
    return juegos.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  };

  useEffect(() => {
    if (!alumno?._id) return;
    const fetchTorneos = async () => {
      setTorneosLoading(true);
      setTorneosError('');
      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/torneos/por-alumno/${alumno._id}`);
        const data = await res.json();
        console.log('Torneos donde el alumno está convocado', data);
        if (!res.ok || !Array.isArray(data)) throw new Error('No se pudieron cargar los torneos');
        setTorneosAlumno(data);
        // Si hay torneos, buscar partidos futuros donde el alumno está convocado
        setJuegosLoading(true);
        setJuegosError('');
        try {
          const juegos = await fetchProximosJuegos(alumno._id, data.filter(t => t.estado === 'aceptado'));
          console.log('Juegos futuros donde el alumno está convocado', juegos);
          setJuegosAlumno(juegos);
        } catch (err) {
          setJuegosAlumno([]);
          setJuegosError('No se pudieron cargar los juegos');
        } finally {
          setJuegosLoading(false);
        }
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

  useEffect(() => {
    if (!alumno?._id) return;

    const fetchPedidosUniforme = async () => {
      setUniformesLoading(true);
      setUniformesError('');
      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos/mis?alumnoId=${alumno._id}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        const data = await res.json();
        if (!res.ok || !Array.isArray(data)) {
          throw new Error(data?.error || 'No se pudieron cargar las solicitudes de uniforme');
        }
        setPedidosUniforme(data);
      } catch (err) {
        setPedidosUniforme([]);
        setUniformesError(err.message || 'No se pudieron cargar las solicitudes de uniforme');
      } finally {
        setUniformesLoading(false);
      }
    };

    fetchPedidosUniforme();
  }, [alumno?._id, token]);

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

  const obtenerFechaVencimientoVisible = (mensualidad) => {
    const diaLimitePersonalizado = normalizarDiaMes(alumno?.dia_limite_personalizado);
    if (diaLimitePersonalizado) {
      return construirFechaPeriodoConDia(mensualidad?.mes, mensualidad?.anio, diaLimitePersonalizado);
    }

    return parseFechaSinDesfase(mensualidad?.fecha_vencimiento);
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
          fechaVencimientoVisible: obtenerFechaVencimientoVisible(m),
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
    const proximo = pendientes.length ? (pendientes[0].fechaVencimientoVisible || pendientes[0].fecha) : null;

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

    return {
      label: 'Al dia',
      color: 'success',
      detalle: 'Todas las mensualidades estan al dia',
      proximo: ''
    };
  }, [mensualidades, mensualidadesError, mensualidadesLoading]);

  const uniformesPendientesPago = useMemo(
    () => pedidosUniforme.filter((pedido) => pedido.estado === 'esperando_pago' || pedido.estado === 'abono'),
    [pedidosUniforme]
  );

  const resumenUniforme = useMemo(() => {
    if (uniformesLoading) {
      return {
        label: 'Cargando',
        detalle: 'Revisando solicitudes de uniforme',
        color: 'info'
      };
    }

    if (uniformesError) {
      return {
        label: 'Sin datos',
        detalle: 'No se pudieron cargar tus solicitudes de uniforme',
        color: 'warning'
      };
    }

    if (uniformesPendientesPago.length > 0) {
      return {
        label: 'Pago pendiente',
        detalle: `Tienes ${uniformesPendientesPago.length} solicitud${uniformesPendientesPago.length > 1 ? 'es' : ''} de uniforme con saldo pendiente`,
        color: 'warning'
      };
    }

    return {
      label: 'Sin pendientes',
      detalle: 'No tienes solicitudes de uniforme por pagar',
      color: 'success'
    };
  }, [uniformesError, uniformesLoading, uniformesPendientesPago]);

  return (
    <Box sx={{ p: 2 }}>
        <TerminosPendientesAlert sx={{ mb: 2, borderRadius: 2 }} />

        <Box sx={{ mb: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Bienvenido de nuevo, {alumno?.nombres || 'Jugador'}
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b' }}>
            Aqui tienes el resumen de actividades de {alumno?.nombres || 'tu cuenta'}.
          </Typography>
        </Box>
        {uniformesPendientesPago.length > 0 && (
          <Alert
            severity="warning"
            sx={{
              mb: 2,
              borderRadius: 2,
              alignItems: 'center',
              '& .MuiAlert-message': { width: '100%' }
            }}
            action={
              <Button
                variant="contained"
                color="inherit"
                size="small"
                onClick={() => navigate('/solicitud-uniforme', { state: { alumno, sede } })}
                sx={{
                  fontWeight: 800,
                  borderRadius: 999,
                  px: 2,
                  py: 0.6,
                  whiteSpace: 'nowrap',
                  textTransform: 'none',
                  bgcolor: '#0f172a',
                  color: '#ffffff',
                  boxShadow: '0 8px 18px rgba(15, 23, 42, 0.28)',
                  '&:hover': {
                    bgcolor: '#020617',
                    boxShadow: '0 10px 20px rgba(2, 6, 23, 0.38)'
                  }
                }}
              >
                Pagar ahora
              </Button>
            }
          >
            Tienes {uniformesPendientesPago.length} solicitud{uniformesPendientesPago.length > 1 ? 'es' : ''} de uniforme con saldo pendiente.
          </Alert>
        )}
        <Grid container spacing={4} sx={{ mt: 3 }}>
          <Grid item size={{ xs:12, md:8 }}>
            <Grid container spacing={2.5} mt={1} justifyContent="center">
              <Grid item size={sizeTarjetaOpciones}>
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
              <Grid item size={sizeTarjetaOpciones}>
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
                        const res = await fetch(`${process.env.REACT_APP_API_URL || window.location.origin}/api/representantes/${alumno.representante}`);
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
              <Grid item size={sizeTarjetaOpciones}>
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
                  <Typography variant="h6" sx={{ fontWeight: 700 }}>
                    {esUsuarioEsporta ? 'Solicitar constancia' : 'Constancias'}
                  </Typography>
                  <Typography variant="body2">
                    {esUsuarioEsporta ? 'Arma tus datos y envia solicitud al admin' : 'Solicita y gestiona constancias'}
                  </Typography>
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
              <Grid item size={sizeTarjetaOpciones}>
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
                  <Chip
                    label={resumenUniforme.label}
                    size="small"
                    sx={{
                      mt: 1,
                      bgcolor: uniformesPendientesPago.length > 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.14)',
                      color: '#ffffff',
                      fontWeight: 800,
                      border: '1px solid rgba(255,255,255,0.24)'
                    }}
                  />
                  <Typography variant="caption" sx={{ opacity: 0.9 }}>
                    {resumenUniforme.detalle}
                  </Typography>
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
          </Grid>
          <Grid item size={{ xs: 12, md: 4 }} sx={{ marginLeft: 'auto'}}>
            <Box sx={{ position: { xs: 'static', md: 'sticky' }, top: { md: 24 }, width: '100%', maxWidth: 400 }}>
              <Box
                sx={{
                  borderRadius: 3,
                  border: '1px solid #e5e7eb',
                  backgroundColor: 'white',
                  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)',
                  overflow: 'hidden'
                }}
              >
                <Box sx={{ height: 90, background: '#0f1437' }} />
                <Box sx={{ px: 3, pb: 3, textAlign: 'center', mt: -5 }}>
                  <Avatar
                    src={mediaUrl(alumno?.foto) || undefined}
                    alt={alumno?.nombres}
                    sx={{ width: 80, height: 80, border: '3px solid white', mx: 'auto' }}
                  />
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 1 }}>
                    {alumno?.nombres} {alumno?.apellidos}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                     Categoria {alumno?.categoria || '-'}
                  </Typography>
                </Box>
              </Box>
              <Box
                sx={{
                  mt: 2,
                  p: 3,
                  borderRadius: 4,
                  background: 'linear-gradient(145deg, #0f766e 0%, #0d9488 100%)',
                  color: '#ffffff',
                  overflow: 'hidden',
                  boxShadow: '0 16px 28px rgba(15, 118, 110, 0.3)',
                  position: 'relative'
                }}
              >
                <Typography sx={{ fontSize: 13, letterSpacing: '0.08em', fontWeight: 800, opacity: 0.92 }}>
                  SALDO A FAVOR DISPONIBLE
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 1.2 }}>
                  <Typography sx={{ fontSize: { xs: 40, md: 42 }, lineHeight: 1, fontWeight: 900 }}>
                    ${saldoAFavorActual.toFixed(2)}
                  </Typography>
                  <Typography sx={{ fontSize: 22, fontWeight: 600, opacity: 0.9 }}>USD</Typography>
                </Box>

                <Box
                  sx={{
                    mt: 2,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.8,
                    px: 1.5,
                    py: 0.8,
                    borderRadius: 999,
                    bgcolor: 'rgba(255,255,255,0.24)',
                    backdropFilter: 'blur(2px)'
                  }}
                >
                  <SavingsOutlinedIcon sx={{ fontSize: 14, opacity: 0.95 }} />
                  <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
                    {saldoAFavorActual > 0 ? 'Disponible para proximas cuotas' : 'Sin saldo a favor en este momento'}
                  </Typography>
                </Box>

                <Box
                  sx={{
                    position: 'absolute',
                    right: 16,
                    bottom: 16,
                    width: 74,
                    height: 74,
                    borderRadius: 3,
                    bgcolor: 'rgba(255,255,255,0.16)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <SavingsOutlinedIcon sx={{ fontSize: 38, color: 'rgba(255,255,255,0.45)' }} />
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
                <Button
                  fullWidth
                  variant="contained"
                  endIcon={<ArrowForwardIosIcon sx={{ fontSize: 16 }} />}
                  onClick={() => navigate(`/pagos-alumno/${alumno._id}`, { state: { alumno, sede } })}
                  sx={{
                    mt: 1.5,
                    borderRadius: 2,
                    textTransform: 'none',
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #ff8a00 0%, #ff6a00 100%)',
                    '&:hover': { background: 'linear-gradient(135deg, #ff8a00 0%, #ff6a00 100%)' }
                  }}
                >
                  Pagar ahora
                </Button>
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
                  Uniformes
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  {resumenUniforme.color === 'success' && <CheckCircleIcon color="success" />}
                  {(resumenUniforme.color === 'warning' || resumenUniforme.color === 'info') && (
                    <PendingActionsIcon color={resumenUniforme.color} />
                  )}
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    {resumenUniforme.label}
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ color: '#64748b', mb: 1 }}>
                  {resumenUniforme.detalle}
                </Typography>
                <Button
                  fullWidth
                  variant="contained"
                  endIcon={<ArrowForwardIosIcon sx={{ fontSize: 16 }} />}
                  onClick={() => navigate('/solicitud-uniforme', { state: { alumno, sede } })}
                  sx={{
                    mt: 1.5,
                    borderRadius: 2,
                    textTransform: 'none',
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #27c86b 0%, #0ea577 100%)',
                    '&:hover': { background: 'linear-gradient(135deg, #27c86b 0%, #0ea577 100%)' }
                  }}
                >
                  Ver solicitudes
                </Button>
              </Box>
            </Box>
          </Grid>
        </Grid>
    </Box>
  );
}

export default PanelOpcionesUsuario;
