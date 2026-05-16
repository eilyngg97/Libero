import React, { useEffect, useState } from 'react';
import { Button, Card, CardActions, CardContent, Typography, Avatar, Grid, Box } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import { mediaUrl } from '../utils/mediaUrl';
import TerminosPendientesAlert from './TerminosPendientesAlert';

function DashboardUsuario() {
  const [alumnos, setAlumnos] = useState([]);
  const [resumenPagos, setResumenPagos] = useState({});
  const navigate = useNavigate();
  const apiBase = process.env.REACT_APP_API_URL || window.location.origin;

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
  }, [apiBase]);


  return (
    <>
      <TerminosPendientesAlert sx={{ mb: 2, mt: 1 }} />

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
                <Grid item xs={12} sm={6} md={4} key={alumno._id} sx={{ display: 'flex', justifyContent: 'center' }}>
                  <Card
                    sx={{
                      width: '100%',
                      maxWidth: 380,
                      borderRadius: 2.5,
                      p: 1.3,
                      minWidth: 260,
                      bgcolor: '#f3f4f6',
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 8px 18px rgba(17, 24, 39, 0.07)'
                    }}
                  >
                    <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', pb: 1.2, px: 1.3 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, mb: 1.1 }}>
                        <Avatar
                          src={mediaUrl(alumno.foto) || undefined}
                          alt={alumno.nombres}
                          sx={{ width: 58, height: 58, boxShadow: '0 4px 10px rgba(15, 23, 42, 0.16)' }}
                        />
                        <Box sx={{ minWidth: 0 }}>
                          <Typography
                            variant="subtitle1"
                            sx={{
                              fontWeight: 700,
                              color: '#111827',
                              lineHeight: 1.15,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}
                          >
                            {alumno.nombres} {alumno.apellidos}
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 0.75, mt: 0.65, flexWrap: 'wrap' }}>
                            <Typography
                              variant="caption"
                              sx={{
                                bgcolor: '#ecedef',
                                px: 0.85,
                                py: 0.2,
                                borderRadius: 999,
                                color: '#4b5563',
                                fontWeight: 600
                              }}
                            >
                              CATEGORIA: {alumno.categoria || '-'}
                            </Typography>
                            <Typography
                              variant="caption"
                              sx={{
                                bgcolor: '#ecedef',
                                px: 0.85,
                                py: 0.2,
                                borderRadius: 999,
                                color: '#4b5563',
                                fontWeight: 600
                              }}
                            >
                              SEDE: {alumno.sede && typeof alumno.sede === 'object' ? alumno.sede.nombre : alumno.sede || '-'}
                            </Typography>
                          </Box>
                        </Box>
                      </Box>

                      <Box
                        sx={{
                          borderRadius: 1.5,
                          p: 1.25,
                          bgcolor: '#ecedef',
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{
                            display: 'block',
                            color: '#4b5563',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            mb: 0.7
                          }}
                        >
                          Resumen de cuenta
                        </Typography>

                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', columnGap: 1, py: 0.35 }}>
                          <Typography variant="body2" sx={{ color: '#374151', lineHeight: 1.25 }}>
                            Proximo pago:
                          </Typography>
                          <Typography variant="body2" sx={{ color: '#111827', lineHeight: 1.25, textAlign: 'right' }}>
                            {resumen.fechaTexto}
                          </Typography>
                        </Box>
                        <Box sx={{ borderTop: '1px solid #cfd4dc', my: 0.2 }} />

                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', columnGap: 1, py: 0.35 }}>
                          <Typography variant="body2" sx={{ color: '#374151', lineHeight: 1.25 }}>
                            Monto:
                          </Typography>
                          <Typography variant="body2" sx={{ color: '#111827', lineHeight: 1.25, textAlign: 'right' }}>
                            {formatMonto(resumen.monto).replace(' USD', '')}
                          </Typography>
                        </Box>
                        <Box sx={{ borderTop: '1px solid #cfd4dc', my: 0.2 }} />

                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', columnGap: 1, py: 0.35 }}>
                          <Typography variant="body2" sx={{ color: '#111827', fontWeight: 700, lineHeight: 1.25 }}>
                            Saldo a favor:
                          </Typography>
                          <Typography variant="body2" sx={{ color: '#111827', fontWeight: 800, lineHeight: 1.25, textAlign: 'right' }}>
                            ${Number(alumno?.saldo_a_favor_mensualidades || 0).toFixed(2)}
                          </Typography>
                        </Box>
                      </Box>
                    </CardContent>
                    <CardActions sx={{ justifyContent: 'center', pt: 0.5, px: 1.3, pb: 1.2 }}>
                      <Button
                        variant="contained"
                        fullWidth
                        sx={{
                          bgcolor: '#020617',
                          '&:hover': { bgcolor: '#111827' },
                          fontWeight: 600,
                          borderRadius: 1.4,
                          textTransform: 'none',
                          py: 0.95,
                          fontSize: '0.9rem'
                        }}
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
          </>
        )}
      </Grid>
    </>
  );
}

export default DashboardUsuario;
