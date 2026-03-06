import React, { useState, useEffect } from 'react';
import { Card, CardContent, Typography, Box, Button, Chip, Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions, IconButton } from '@mui/material';
import { useLocation } from 'react-router-dom';
import ModalPago from './ModalPago';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import ErrorIcon from '@mui/icons-material/Error';
import SchoolIcon from '@mui/icons-material/School';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';

// Eliminar pagosEjemplo, usaremos datos reales

function PagosAlumno(props) {
  const [openModalPago, setOpenModalPago] = useState(false);
  const [pagoSeleccionado, setPagoSeleccionado] = useState(null);
  const location = useLocation();
  const alumno = location.state?.alumno || props.alumno;
  const sede = location.state?.sede || props.sede;
  const [filtro, setFiltro] = useState('todos'); // 'porPagar' | 'pagados' | 'todos'
  const [pagina, setPagina] = useState(1);
  const pagosPorPagina = 5;
  const [mensualidades, setMensualidades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [modalDetalle, setModalDetalle] = useState(false);
  const [detallePago, setDetallePago] = useState(null);
  const [pagosDetalle, setPagosDetalle] = useState([]);
  const [mensualidadDetalle, setMensualidadDetalle] = useState(null);

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
          _id: m._id,
          id_alumno: m.id_alumno,
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

  const pagosOrdenados = [...mensualidades].sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
  );

  const pagosFiltrados = pagosOrdenados.filter(pago => {
    if (filtro === 'porPagar') return pago.estado && pago.estado.toLowerCase() !== 'pagado';
    if (filtro === 'pagados') return pago.estado && pago.estado.toLowerCase() === 'pagado';
    return true;
  });

  const copiarReferencia = async (texto) => {
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // no-op
    }
  };

  const handleVerComprobante = (url) => {
    if (!url) return;
    const finalUrl = /^https?:\/\//i.test(url)
      ? url
      : `${process.env.REACT_APP_API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
    window.open(finalUrl, '_blank', 'noopener,noreferrer');
  };

  const handleVerDetalle = async (mensualidad) => {
    setMensualidadDetalle(mensualidad);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/pagos/${mensualidad.id}`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const pagosOrdenadosPorFecha = [...data].sort(
          (a, b) => new Date(a.fecha_pago || 0).getTime() - new Date(b.fecha_pago || 0).getTime()
        );
        setDetallePago(pagosOrdenadosPorFecha[pagosOrdenadosPorFecha.length - 1]);
        setPagosDetalle(pagosOrdenadosPorFecha);
      } else {
        setDetallePago(null);
        setPagosDetalle([]);
      }
      setModalDetalle(true);
    } catch {
      setDetallePago(null);
      setPagosDetalle([]);
      setModalDetalle(true);
    }
  };

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
          const estadoVisual = (() => {
            if (estado === 'pagado') {
              return { Icon: CheckCircleIcon, bg: '#dcfce7', color: '#15803d' };
            }
            if (estado === 'pendiente') {
              return { Icon: PendingActionsIcon, bg: '#fff7ed', color: '#c2410c' };
            }
            if (estado === 'retrasado') {
              return { Icon: ErrorIcon, bg: '#fee2e2', color: '#b91c1c' };
            }
            if (estado === 'exonerado') {
              return { Icon: SchoolIcon, bg: '#e0f2fe', color: '#0369a1' };
            }
            if (estado === 'en revision') {
              return { Icon: PendingActionsIcon, bg: '#fff9c4', color: '#5f4b00' };
            }
            return { Icon: PendingActionsIcon, bg: '#f1f5f9', color: '#64748b' };
          })();
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
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, minWidth: 0 }}>
                  <Box
                    sx={{
                      width: 34,
                      height: 34,
                      borderRadius: 1.8,
                      bgcolor: estadoVisual.bg,
                      color: estadoVisual.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    <estadoVisual.Icon sx={{ fontSize: 18 }} />
                  </Box>
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
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
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
                  {(estado === 'pagado' || estado === 'en revision') && (
                    <Button
                      variant="text"
                      endIcon={<ArrowForwardIosIcon sx={{ fontSize: 14 }} />}
                      sx={{
                        color: '#0f172a',
                        fontWeight: 700,
                        textTransform: 'none',
                        minWidth: 'fit-content'
                      }}
                      onClick={() => handleVerDetalle(pago)}
                    >
                      Ver detalle
                    </Button>
                  )}
                </Box>
              </CardContent>
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
      <Dialog open={modalDetalle} onClose={() => setModalDetalle(false)} maxWidth="xs" fullWidth>
        <DialogTitle
          sx={{
            bgcolor: '#0f2544',
            color: '#fff',
            fontWeight: 700,
            fontSize: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          Detalle del Pago
          <IconButton size="small" onClick={() => setModalDetalle(false)} sx={{ color: '#e2e8f0' }}>
            &times;
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ bgcolor: '#f8fafc', pt: 3 }}>
          {detallePago ? (
            <Box
              sx={{
                borderRadius: 3,
                p: 2,
                bgcolor: '#f1f5f9',
                border: '1px solid #e2e8f0'
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: 1.5,
                    bgcolor: '#ffe8d6',
                    color: '#ff7a00',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 700
                  }}
                >
                  ✓
                </Box>
                <Typography sx={{ fontWeight: 800, fontSize: 12, color: '#64748b', letterSpacing: '0.06em' }}>
                  ULTIMO PAGO REGISTRADO
                </Typography>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 1.5, columnGap: 2, fontSize: 13 }}>
                <Typography sx={{ color: '#64748b' }}>Metodo de pago</Typography>
                <Typography sx={{ fontWeight: 700, color: '#0f172a', textAlign: 'right' }}>{detallePago.metodo_pago || '-'}</Typography>
                <Typography sx={{ color: '#64748b' }}>Monto pagado</Typography>
                <Typography sx={{ fontWeight: 700, color: '#ff7a00', textAlign: 'right' }}>{detallePago.monto_pagado || '-'} USD</Typography>
                <Typography sx={{ color: '#64748b' }}>Monto pagado (Bs)</Typography>
                <Typography sx={{ fontWeight: 700, color: '#0f172a', textAlign: 'right' }}>
                  {detallePago.monto_pagado_bs ? `${detallePago.monto_pagado_bs} Bs` : '-'}
                </Typography>
                <Typography sx={{ color: '#64748b' }}>Fecha de pago</Typography>
                <Typography sx={{ fontWeight: 700, color: '#0f172a', textAlign: 'right' }}>
                  {detallePago.fecha_pago ? new Date(detallePago.fecha_pago).toISOString().slice(0, 10) : ''}
                </Typography>
                <Typography sx={{ color: '#64748b' }}>Referencia</Typography>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 0.5 }}>
                  <Typography sx={{ fontWeight: 700, color: '#0f172a' }}>{detallePago.referencia || '-'}</Typography>
                  {detallePago.referencia && (
                    <IconButton size="small" onClick={() => copiarReferencia(detallePago.referencia)} aria-label="Copiar referencia" sx={{ color: '#94a3b8' }}>
                      <ContentCopyIcon fontSize="inherit" />
                    </IconButton>
                  )}
                </Box>
                <Typography sx={{ color: '#64748b' }}>Comprobante</Typography>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  {detallePago.comprobante_url ? (
                    <Button
                      variant="text"
                      size="small"
                      onClick={() => handleVerComprobante(detallePago.comprobante_url)}
                      sx={{ color: '#ff7a00', fontWeight: 800 }}
                    >
                      Ver archivo
                    </Button>
                  ) : (
                    <Typography sx={{ color: '#94a3b8' }}>-</Typography>
                  )}
                </Box>
              </Box>
            </Box>
          ) : (
            <Typography>No hay informacion de pago registrada.</Typography>
          )}

          {mensualidadDetalle?.id_alumno?.habilitar_pago_cuotas === true && pagosDetalle.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Historial de abonos</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {pagosDetalle.map((pago, idx) => (
                  <Box key={pago._id || idx} sx={{ border: '1px solid #e2e8f0', borderRadius: 2, p: 1.5, background: '#fafafa' }}>
                    <Typography variant="body2"><b>Metodo:</b> {pago.metodo_pago || '-'}</Typography>
                    <Typography variant="body2"><b>Monto:</b> {pago.monto_pagado || '-'} USD</Typography>
                    <Typography variant="body2"><b>Monto (Bs):</b> {pago.monto_pagado_bs ? `${pago.monto_pagado_bs} Bs` : '-'}</Typography>
                    <Typography variant="body2"><b>Fecha:</b> {pago.fecha_pago ? new Date(pago.fecha_pago).toISOString().slice(0, 10) : ''}</Typography>
                    {pago.referencia && (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2"><b>Referencia:</b> {pago.referencia}</Typography>
                        <IconButton size="small" onClick={() => copiarReferencia(pago.referencia)} aria-label="Copiar referencia">
                          <ContentCopyIcon fontSize="inherit" />
                        </IconButton>
                      </Box>
                    )}
                    {pago.comprobante_url && (
                      <Typography variant="body2">
                        <b>Comprobante:</b>{' '}
                        <Button
                          variant="text"
                          size="small"
                          onClick={() => handleVerComprobante(pago.comprobante_url)}
                        >
                          Ver archivo
                        </Button>
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 1 }}>
          <Button onClick={() => setModalDetalle(false)} fullWidth variant="text">Volver</Button>
        </DialogActions>
      </Dialog>
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
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setSuccessMessage('')} severity="success" sx={{ width: '100%' }}>
          {successMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default PagosAlumno;
