import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardActions, Button, Typography, Avatar, Grid, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';

function DashboardUsuario() {
  const [alumnos, setAlumnos] = useState([]);
  const [resumenPagos, setResumenPagos] = useState({});
  const navigate = useNavigate();

  const formatMonto = (monto) => {
    const montoNum = Number(monto);
    if (Number.isNaN(montoNum)) return '--';
    return `$${montoNum.toFixed(2)} USD`;
  };

  const obtenerResumenPago = (mensualidades = []) => {
    if (!Array.isArray(mensualidades) || mensualidades.length === 0) {
      return { fechaTexto: '--', monto: null, estado: 'sin datos' };
    }

    const normalizarEstado = (estado) => (estado || '').toLowerCase();
    const ordenadas = mensualidades
      .map((m) => {
        const fecha = new Date(`${m.anio}-${String(m.mes).padStart(2, '0')}-01T00:00:00`);
        return {
          fecha,
          estado: normalizarEstado(m.estatus),
          monto: m.monto_esperado
        };
      })
      .filter((m) => !Number.isNaN(m.fecha.getTime()))
      .sort((a, b) => a.fecha - b.fecha);

    if (!ordenadas.length) {
      return { fechaTexto: '--', monto: null, estado: 'sin datos' };
    }

    const pendientes = ordenadas.filter((m) => !['pagado', 'exonerado'].includes(m.estado));
    const referencia = pendientes.length ? pendientes[0] : ordenadas[ordenadas.length - 1];

    return {
      fechaTexto: referencia.fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
      monto: referencia.monto,
      estado: pendientes.length ? 'pendiente' : 'al dia'
    };
  };

  useEffect(() => {
    // 1. Obtener el usuario logueado
    const usuario = JSON.parse(localStorage.getItem('usuario'));
    if (!usuario || !usuario.id) {
      setAlumnos([]);
      return;
    }

    // 2. Buscar el representante asociado a este usuario o alumnos por usuario
    const fetchAlumnos = async () => {
      try {
        let alumnosFinal = [];
        // Buscar representante por usuario
        const repRes = await fetch(`${process.env.REACT_APP_API_URL}/api/representantes/por-usuario/${usuario.id}`);
        const repData = await repRes.json();
        if (repRes.ok && repData && repData._id) {
          // Buscar alumnos asociados a ese representante
          const alumRes = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/por-representante/${repData._id}?populateSede=1`);
          const alumData = await alumRes.json();
          if (alumRes.ok && Array.isArray(alumData)) {
            alumnosFinal = alumnosFinal.concat(alumData);
          }
        }
        // Buscar también alumnos por usuarioId (caso usuario sin representante o representante que es alumno)
        const alumRes2 = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/por-representante/null?usuarioId=${usuario.id}&populateSede=1`);
        const alumData2 = await alumRes2.json();
        console.log('Alumnos por usuarioId:', alumData2);
        if (alumRes2.ok && Array.isArray(alumData2)) {
          alumnosFinal = alumnosFinal.concat(alumData2);
        }
        // Eliminar duplicados por _id
        const alumnosUnicos = alumnosFinal.filter((al, idx, arr) => arr.findIndex(a2 => a2._id === al._id) === idx);
        setAlumnos(alumnosUnicos);

        const resumenEntries = await Promise.all(
          alumnosUnicos.map(async (alumno) => {
            try {
              const resMens = await fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades?id_alumno=${alumno._id}`);
              const dataMens = await resMens.json();
              return [alumno._id, obtenerResumenPago(Array.isArray(dataMens) ? dataMens : [])];
            } catch {
              return [alumno._id, { fechaTexto: '--', monto: null, estado: 'sin datos' }];
            }
          })
        );

        setResumenPagos(Object.fromEntries(resumenEntries));
      } catch {
        setAlumnos([]);
        setResumenPagos({});
      }
    };
    fetchAlumnos();
  }, []);
  
  return (
    <>
      <Box sx={{ mb: 2, mt: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a' }}>
          Selecciona un Alumno
        </Typography>
        <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
          Gestiona pagos y actividades de tus representados.
        </Typography>
      </Box>
      <Grid container spacing={3} justifyContent="center" sx={{ mt: 2 }}>
        {alumnos.length === 0 ? (
          <Grid item xs={12} sx={{ textAlign: 'center', mt: 6 }}>
            <Typography variant="h6" color="text.secondary">
              No tienes alumnos registrados.
            </Typography>
          </Grid>
        ) : (
          <>
            {alumnos.map((alumno) => {
              const resumen = resumenPagos[alumno._id] || { fechaTexto: '--', monto: null, estado: 'sin datos' };
              return (
                <Grid item xs={12} sm={6} md={4} key={alumno._id}>
                  <Card sx={{ borderRadius: 3, boxShadow: '0 10px 25px rgba(15, 23, 42, 0.08)', p: 2, minWidth: 260, border: '1px solid #e2e8f0' }}>
                    <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pb: 1.5 }}>
                      <Avatar
                        src={alumno.foto || undefined}
                        alt={alumno.nombres}
                        sx={{ width: 72, height: 72, mb: 1.25, boxShadow: '0 8px 18px rgba(15, 23, 42, 0.16)' }}
                      />
                      <Typography variant="h6" sx={{ fontWeight: 700, mb: 0.5, color: '#0f172a' }}>
                        {alumno.nombres} {alumno.apellidos}
                      </Typography>
                      <Box sx={{ display: 'flex', gap: 1, mb: 1.5, flexWrap: 'wrap', justifyContent: 'center' }}>
                        <Typography variant="caption" sx={{ bgcolor: '#f8fafc', border: '1px solid #e2e8f0', px: 1, py: 0.4, borderRadius: 1.5, color: '#475569' }}>
                          Categoria: <b>{alumno.categoria || '-'}</b>
                        </Typography>
                        <Typography variant="caption" sx={{ bgcolor: '#f8fafc', border: '1px solid #e2e8f0', px: 1, py: 0.4, borderRadius: 1.5, color: '#475569' }}>
                          Sede: <b>{alumno.sede && typeof alumno.sede === 'object' ? alumno.sede.nombre : alumno.sede || '-'}</b>
                        </Typography>
                      </Box>

                      <Box sx={{ width: '100%', borderRadius: 2, p: 1.4, bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <Typography variant="caption" sx={{ display: 'block', color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em' }}>
                          RESUMEN
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 0.75 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                            <EventAvailableIcon sx={{ color: '#3b82f6', fontSize: 18 }} />
                            <Typography variant="body2" sx={{ color: '#475569' }}>
                              Proximo pago
                            </Typography>
                          </Box>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                            {resumen.fechaTexto}
                          </Typography>
                        </Box>
                        <Typography variant="body2" sx={{ mt: 0.7, color: '#0f172a', fontWeight: 700 }}>
                          {formatMonto(resumen.monto)}
                        </Typography>
                      </Box>
                    </CardContent>
                    <CardActions sx={{ justifyContent: 'center', pt: 0.5 }}>
                      <Button
                        variant="contained"
                        fullWidth
                        sx={{
                          bgcolor: '#1e293b',
                          '&:hover': { bgcolor: '#0f172a' },
                          fontWeight: 700,
                          borderRadius: 2,
                          textTransform: 'none',
                          py: 1
                        }}
                        startIcon={<PersonOutlineIcon />}
                        onClick={() => {
                          navigate(`/panel-opciones-usuario/${alumno._id}`, {
                            state: {
                              alumno,
                              sede: { nombre: alumno.sede }
                            }
                          });
                        }}
                      >
                        Seleccionar
                      </Button>
                    </CardActions>
                  </Card>
                </Grid>
              );
            })}

            <Grid item xs={12} sm={6} md={4}>
              <Card
                sx={{
                  borderRadius: 3,
                  minHeight: 330,
                  border: '2px dashed #cbd5e1',
                  boxShadow: 'none',
                  backgroundColor: '#f8fafc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  p: 2
                }}
              >
                <Box>
                  <AddCircleOutlineIcon sx={{ fontSize: 42, color: '#94a3b8', mb: 1 }} />
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#334155' }}>
                    Inscribir Alumno
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5, mb: 1.5 }}>
                    Anadir nuevo miembro de la familia
                  </Typography>
                  <Button
                    variant="outlined"
                    sx={{ borderRadius: 999, textTransform: 'none', fontWeight: 700 }}
                    onClick={() => window.alert('Para inscribir un nuevo alumno, contacta a la academia.')}
                  >
                    Solicitar inscripcion
                  </Button>
                </Box>
              </Card>
            </Grid>
          </>
        )}
      </Grid>
    </>
  );
}

export default DashboardUsuario;
