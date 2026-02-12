import React, { useState, useEffect } from 'react';
import { Card, CardContent, Typography, IconButton, Collapse, Box, Button, Chip, Snackbar, Alert } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useLocation, useNavigate } from 'react-router-dom';
import ModalPago from './ModalPago';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import ErrorIcon from '@mui/icons-material/Error';
import SchoolIcon from '@mui/icons-material/School';

// Eliminar pagosEjemplo, usaremos datos reales

function PagosAlumno(props) {
  const [openModalPago, setOpenModalPago] = useState(false);
  const [pagoSeleccionado, setPagoSeleccionado] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  const alumno = location.state?.alumno || props.alumno;
  const sede = location.state?.sede || props.sede;
  const [expanded, setExpanded] = useState({});
  const [filtro, setFiltro] = useState('todos'); // 'porPagar' | 'pagados' | 'todos'
  const [pagina, setPagina] = useState(1);
  const pagosPorPagina = 5;
  const [mensualidades, setMensualidades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');

  const fetchMensualidades = () => {
    if (!alumno?._id) return;
    setLoading(true);
    setError(null);
    fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades?id_alumno=${alumno._id}`)
      .then(res => {
        if (!res.ok) throw new Error('Error al obtener mensualidades');
        return res.json();
      })
      .then(data => {
        setMensualidades(data.map(m => ({
          id: m._id,
          fecha: `${m.anio}-${String(m.mes).padStart(2, '0')}-01`,
          monto: m.monto_esperado,
          estado: m.estatus,
          detalle: m.detalle || `Mensualidad correspondiente a ${m.mes}/${m.anio}`,
          descripcion: 'Mensualidad',
        })));
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchMensualidades();
  }, [alumno?._id]);

  const handleExpandClick = (id) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const pagosFiltrados = mensualidades.filter(pago => {
    if (filtro === 'porPagar') return pago.estado && pago.estado.toLowerCase() !== 'pagado';
    if (filtro === 'pagados') return pago.estado && pago.estado.toLowerCase() === 'pagado';
    return true;
  });

  // Paginación
  const totalPaginas = Math.ceil(pagosFiltrados.length / pagosPorPagina);
  const pagosPagina = pagosFiltrados.slice((pagina - 1) * pagosPorPagina, pagina * pagosPorPagina);

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a' }}>
          Mis pagos
        </Typography>
        <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
          Alumno: <Box component="span" sx={{ fontWeight: 700 }}>{alumno?.nombres || alumno?.nombre}</Box> | Sede:{' '}
          <Box component="span" sx={{ fontWeight: 700 }}>{typeof sede?.nombre === 'object' ? sede.nombre.nombre : sede?.nombre || '-'}</Box>
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 3 }}>
        <Button
          variant={filtro === 'porPagar' ? 'contained' : 'outlined'}
          onClick={() => setFiltro('porPagar')}
          sx={{
            borderRadius: 999,
            px: 2.5,
            fontWeight: 700,
            textTransform: 'none',
            borderColor: filtro === 'porPagar' ? '#ff7a00' : '#cbd5f0',
            bgcolor: filtro === 'porPagar' ? '#ff7a00' : '#ffffff',
            color: filtro === 'porPagar' ? '#ffffff' : '#0f172a',
            boxShadow: filtro === 'porPagar' ? '0 6px 14px rgba(255, 122, 0, 0.25)' : 'none',
            '&:hover': { bgcolor: filtro === 'porPagar' ? '#f97316' : '#f8fafc', borderColor: '#ff7a00' }
          }}
        >
          Por pagar
        </Button>
        <Button
          variant={filtro === 'pagados' ? 'contained' : 'outlined'}
          onClick={() => setFiltro('pagados')}
          sx={{
            borderRadius: 999,
            px: 2.5,
            fontWeight: 700,
            textTransform: 'none',
            borderColor: filtro === 'pagados' ? '#ff7a00' : '#cbd5f0',
            bgcolor: filtro === 'pagados' ? '#ff7a00' : '#ffffff',
            color: filtro === 'pagados' ? '#ffffff' : '#0f172a',
            boxShadow: filtro === 'pagados' ? '0 6px 14px rgba(255, 122, 0, 0.25)' : 'none',
            '&:hover': { bgcolor: filtro === 'pagados' ? '#f97316' : '#f8fafc', borderColor: '#ff7a00' }
          }}
        >
          Pagados
        </Button>
        <Button
          variant={filtro === 'todos' ? 'contained' : 'outlined'}
          onClick={() => setFiltro('todos')}
          sx={{
            borderRadius: 999,
            px: 2.5,
            fontWeight: 700,
            textTransform: 'none',
            borderColor: filtro === 'todos' ? '#ff7a00' : '#cbd5f0',
            bgcolor: filtro === 'todos' ? '#ff7a00' : '#ffffff',
            color: filtro === 'todos' ? '#ffffff' : '#0f172a',
            boxShadow: filtro === 'todos' ? '0 6px 14px rgba(255, 122, 0, 0.25)' : 'none',
            '&:hover': { bgcolor: filtro === 'todos' ? '#f97316' : '#f8fafc', borderColor: '#ff7a00' }
          }}
        >
          Todos
        </Button>
      </Box>
      {loading ? (
        <Typography variant="body2" color="text.secondary">Cargando mensualidades...</Typography>
      ) : error ? (
        <Typography variant="body2" color="error">{error}</Typography>
      ) : pagosFiltrados.length === 0 ? (
        <Typography variant="body2" color="text.secondary">No hay pagos para mostrar.</Typography>
      ) : (
        pagosPagina.map((pago) => {
          const estado = pago.estado?.toLowerCase() || '';
          // Ajustar fecha a la zona horaria local
          const dateObj = new Date(pago.fecha + 'T00:00:00');
          // Usar toLocaleString para asegurar zona local
          const mesNombre = dateObj.toLocaleString('es-ES', { month: 'long', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
          const anio = dateObj.toLocaleString('es-ES', { year: 'numeric', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
          return (
            <Card
              key={pago.id}
              sx={{
                mb: 2,
                borderRadius: 2.5,
                border: '1px solid #e5e7eb',
                boxShadow: '0 8px 18px rgba(15, 23, 42, 0.06)'
              }}
            >
              <CardContent
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2,
                  px: { xs: 2, md: 3 },
                  py: { xs: 2, md: 2.5 }
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#0f172a' }}>
                    Mensualidad de {mesNombre} {anio}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mt: 0.5 }}>
                    <Typography variant="body2" sx={{ color: '#64748b' }}>
                      Monto: <Box component="span" sx={{ color: '#ff7a00', fontWeight: 700 }}>{pago.monto} USD</Box>
                    </Typography>
                    {(() => {
                      if (estado === 'pagado') {
                        return (
                          <Chip
                            icon={<CheckCircleIcon />}
                            label={pago.estado}
                            sx={{ bgcolor: '#dcfce7', color: '#15803d', fontWeight: 700 }}
                          />
                        );
                      }
                      if (estado === 'pendiente') {
                        return (
                          <Chip
                            icon={<PendingActionsIcon />}
                            label={pago.estado}
                            sx={{ bgcolor: '#fff7ed', color: '#c2410c', fontWeight: 700 }}
                          />
                        );
                      }
                      if (estado === 'retrasado') {
                        return (
                          <Chip
                            icon={<ErrorIcon />}
                            label={pago.estado}
                            sx={{ bgcolor: '#fee2e2', color: '#b91c1c', fontWeight: 700 }}
                          />
                        );
                      }
                      if (estado === 'exonerado') {
                        return (
                          <Chip
                            icon={<SchoolIcon />}
                            label={pago.estado}
                            sx={{ bgcolor: '#e0f2fe', color: '#0369a1', fontWeight: 700 }}
                          />
                        );
                      }
                      if (estado === 'en revision') return (
                        <Chip
                          icon={<PendingActionsIcon />}
                          label={pago.estado}
                          sx={{ bgcolor: '#fff9c4', color: '#5f4b00', fontWeight: 700 }}
                        />
                      );
                      return pago.estado;
                    })()}
                  </Box>
                </Box>
                {(estado === 'pendiente' || estado === 'retrasado') && (
                  <Button
                    variant="contained"
                    size="medium"
                    sx={{
                      ml: 1,
                      bgcolor: estado === 'retrasado' ? '#ef4444' : '#ff7a00',
                      '&:hover': { bgcolor: estado === 'retrasado' ? '#dc2626' : '#f97316' },
                      fontWeight: 700,
                      borderRadius: 2
                    }}
                    onClick={() => { setPagoSeleccionado(pago); setOpenModalPago(true); }}
                  >
                    Pagar
                  </Button>
                )}
                <IconButton
                  onClick={() => handleExpandClick(pago.id)}
                  aria-expanded={!!expanded[pago.id]}
                  aria-label="mostrar más"
                >
                  <ExpandMoreIcon style={{ transform: expanded[pago.id] ? 'rotate(180deg)' : 'rotate(0deg)', transition: '0.2s', color: '#94a3b8' }} />
                </IconButton>
              </CardContent>
              <Collapse in={!!expanded[pago.id]} timeout="auto" unmountOnExit>
                <CardContent sx={{ pt: 0, px: { xs: 2, md: 3 }, pb: 2.5 }}>
                  <Typography variant="body2" sx={{ color: '#64748b' }}>{pago.detalle}</Typography>
                </CardContent>
              </Collapse>
            </Card>
          );
        })
      )}
      {/* Controles de paginación */}
      {totalPaginas > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mt: 2 }}>
          <Button disabled={pagina === 1} onClick={() => setPagina(pagina - 1)}>Anterior</Button>
          {Array.from({ length: totalPaginas }, (_, i) => (
            <Button key={i+1} variant={pagina === i+1 ? 'contained' : 'outlined'} onClick={() => setPagina(i+1)}>{i+1}</Button>
          ))}
          <Button disabled={pagina === totalPaginas} onClick={() => setPagina(pagina + 1)}>Siguiente</Button>
        </Box>
      )}
      <ModalPago
        open={openModalPago}
        onClose={() => setOpenModalPago(false)}
        pago={pagoSeleccionado}
        onSuccess={() => {
          fetchMensualidades();
          setSuccessMessage('Pago registrado');
        }}
      />
      <Snackbar
        open={!!successMessage}
        autoHideDuration={3000}
        onClose={() => setSuccessMessage('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={() => setSuccessMessage('')} severity="success" sx={{ width: '100%' }}>
          {successMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default PagosAlumno;
