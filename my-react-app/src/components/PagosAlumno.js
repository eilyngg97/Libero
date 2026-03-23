import React, { useState, useEffect } from 'react';
import { Card, CardContent, Typography, Box, Button, Chip, Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, TextField, MenuItem } from '@mui/material';
import { useLocation } from 'react-router-dom';
import ModalPago from './ModalPago';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import ErrorIcon from '@mui/icons-material/Error';
import SchoolIcon from '@mui/icons-material/School';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CloseIcon from '@mui/icons-material/Close';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import { useDolar } from '../context/DolarContext';

// Eliminar pagosEjemplo, usaremos datos reales

function PagosAlumno(props) {
  const metodosPago = ['Pago movil', 'Transferencia', 'Efectivo'];
  const { dolar } = useDolar();
  const tasa = Number(dolar?.promedio);
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
  const [editandoPago, setEditandoPago] = useState(null);
  const [modalEditarOpen, setModalEditarOpen] = useState(false);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [eliminandoPagoId, setEliminandoPagoId] = useState('');
  const [confirmarEliminarOpen, setConfirmarEliminarOpen] = useState(false);
  const [pagoAEliminar, setPagoAEliminar] = useState(null);
  const [metodoPago, setMetodoPago] = useState(metodosPago[0]);
  const [montoPago, setMontoPago] = useState('');
  const [fechaPago, setFechaPago] = useState(() => new Date().toISOString().slice(0, 10));
  const [referencia, setReferencia] = useState('');
  const [errorRef, setErrorRef] = useState('');
  const [comprobante, setComprobante] = useState(null);
  const [quitarComprobanteActual, setQuitarComprobanteActual] = useState(false);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchMensualidades = React.useCallback(() => {
    if (!alumno?._id) return;
    setLoading(true);
    setError(null);
    fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades?id_alumno=${alumno._id}`, {
      headers: getAuthHeaders()
    })
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
  }, [alumno?._id]);

  const cargarPagosMensualidad = async (mensualidadId) => {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/api/pagos/${mensualidadId}`, {
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Error al obtener pagos');
    return Array.isArray(data) ? data : [];
  };

  const actualizarDetalleMensualidad = async (mensualidad, abrirModal = true) => {
    setMensualidadDetalle(mensualidad);
    try {
      const data = await cargarPagosMensualidad(mensualidad.id);
      if (data.length > 0) {
        const pagosOrdenadosPorFecha = [...data].sort(
          (a, b) => new Date(a.fecha_pago || 0).getTime() - new Date(b.fecha_pago || 0).getTime()
        );
        setDetallePago(pagosOrdenadosPorFecha[pagosOrdenadosPorFecha.length - 1]);
        setPagosDetalle(pagosOrdenadosPorFecha);
      } else {
        setDetallePago(null);
        setPagosDetalle([]);
      }
    } catch {
      setDetallePago(null);
      setPagosDetalle([]);
    }
    if (abrirModal) setModalDetalle(true);
  };

  useEffect(() => {
    fetchMensualidades();
  }, [fetchMensualidades]);

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
    await actualizarDetalleMensualidad(mensualidad, true);
  };

  const formatMoney = (value) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
    return Number(value).toFixed(2);
  };

  const formatMontoEsperadoConBs = (montoUsd) => {
    const usd = formatMoney(montoUsd);
    if (!tasa || Number.isNaN(tasa)) {
      return `${usd} USD`;
    }
    const bs = formatMoney(Number(montoUsd) * tasa);
    return `${usd} USD / Bs ${bs}`;
  };

  const formatMontoConBs = (pago) => {
    const montoUsd = formatMoney(pago?.monto_pagado);
    const montoBs = pago?.monto_pagado_bs;
    if (montoBs === null || montoBs === undefined || Number.isNaN(Number(montoBs))) {
      return `$${montoUsd}`;
    }
    return `$${montoUsd} / Bs ${formatMoney(montoBs)}`;
  };

  const formatFechaBonita = (value) => {
    if (!value) return '-';
    const fecha = new Date(value);
    if (Number.isNaN(fecha.getTime())) return '-';
    return fecha.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const abrirModalEditarPago = (pago) => {
    setEditandoPago(pago);
    setMetodoPago(pago?.metodo_pago || metodosPago[0]);
    setMontoPago(Number(pago?.monto_pagado) || '');
    setFechaPago(pago?.fecha_pago ? new Date(pago.fecha_pago).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
    setReferencia(pago?.referencia || '');
    setErrorRef('');
    setComprobante(null);
    setQuitarComprobanteActual(false);
    setModalEditarOpen(true);
  };

  const guardarEdicionPago = async () => {
    if (!editandoPago?._id || !mensualidadDetalle?.id) return;
    if ((metodoPago === 'Transferencia' || metodoPago === 'Pago movil') && referencia.length !== 6) {
      setErrorRef('Debes ingresar los 6 ultimos digitos de la referencia');
      return;
    }

    const monto = Number(montoPago);
    if (!monto || Number.isNaN(monto) || monto <= 0) {
      setError('Monto invalido');
      return;
    }

    try {
      setGuardandoEdicion(true);
      setErrorRef('');

      const formData = new FormData();
      formData.append('monto_pagado', monto);
      formData.append('fecha_pago', fechaPago);
      formData.append('metodo_pago', metodoPago);
      formData.append('referencia', (metodoPago === 'Transferencia' || metodoPago === 'Pago movil') ? referencia : '');

      const montoBs = (Number(detallePago?.monto_pagado_bs) && Number(detallePago?.monto_pagado))
        ? (monto * (Number(detallePago.monto_pagado_bs) / Number(detallePago.monto_pagado))).toFixed(2)
        : '';
      if (montoBs) formData.append('monto_pagado_bs', montoBs);

      if (comprobante) {
        formData.append('comprobante', comprobante);
      }
      if (quitarComprobanteActual && !comprobante) {
        formData.append('eliminar_comprobante', 'true');
      }

      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/pagos/${editandoPago._id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al actualizar pago');

      setModalEditarOpen(false);
      setEditandoPago(null);
      await fetchMensualidades();
      await actualizarDetalleMensualidad(mensualidadDetalle, true);
      setSuccessMessage('Pago actualizado correctamente');
    } catch (err) {
      setError(err.message || 'Error al actualizar pago');
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const solicitarEliminarPago = (pago) => {
    setPagoAEliminar(pago);
    setConfirmarEliminarOpen(true);
  };

  const eliminarPago = async () => {
    if (!pagoAEliminar?._id || !mensualidadDetalle?.id) return;
    try {
      setEliminandoPagoId(pagoAEliminar._id);
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/pagos/${pagoAEliminar._id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al eliminar pago');

      setConfirmarEliminarOpen(false);
      setPagoAEliminar(null);
      await fetchMensualidades();
      await actualizarDetalleMensualidad(mensualidadDetalle, true);
      setSuccessMessage('Pago eliminado correctamente');
    } catch (err) {
      setError(err.message || 'Error al eliminar pago');
    } finally {
      setEliminandoPagoId('');
    }
  };

  // Paginación
  const totalPaginas = Math.ceil(pagosFiltrados.length / pagosPorPagina);
  const pagosPagina = pagosFiltrados.slice((pagina - 1) * pagosPorPagina, pagina * pagosPorPagina);

  return (
    <Box sx={{ p: { md: 3 } }}>
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
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, minWidth: 0 }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#0f172a' }}>
                      Mensualidad de {mesNombre} {anio}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mt: 0.5 }}>
                      <Typography variant="body2" sx={{ color: '#64748b' }}>
                        Monto: <Box component="span" sx={{ color: '#ff7a00', fontWeight: 700 }}>{formatMontoEsperadoConBs(pago.monto)}</Box>
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
                  {(estado === 'pagado' || estado === 'en revision' || estado === 'abono') && (
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
      <Dialog
        open={modalDetalle}
        onClose={() => setModalDetalle(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
      >
        <DialogTitle sx={{ bgcolor: '#f3f5fb', color: '#0b2a57', fontWeight: 800, fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Detalle del Pago
          <IconButton size="small" onClick={() => setModalDetalle(false)} sx={{ color: '#6b7280' }}>
            &times;
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ bgcolor: '#f3f5fb', pt: 2.5, pb: 2.5 }}>
          {detallePago ? (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <Box sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: '#dbeafe', color: '#0b2a57', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>✓</Box>
                <Typography sx={{ fontSize: 34, fontWeight: 900, color: '#0b2a57', lineHeight: 1.1 }}>Último Pago Registrado</Typography>
              </Box>

              <Box
                sx={{
                  position: 'relative',
                  bgcolor: '#ffffff',
                  borderRadius: 2.5,
                  border: '1px solid #e7eaf2',
                  p: { xs: 2, sm: 3 },
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 7,
                    borderTopLeftRadius: 10,
                    borderTopRightRadius: 10,
                    background: 'linear-gradient(90deg, #ff8a00 0%, #8a4b00 100%)'
                  }
                }}
              >
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, columnGap: 4.5, rowGap: 2.25, pt: 1.75 }}>
                  <Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Metodo de pago</Typography>
                    <Typography sx={{ mt: 0.7, fontSize: 32, fontWeight: 800, color: '#0b2a57', lineHeight: 1.12 }}>{detallePago.metodo_pago || '-'}</Typography>
                  </Box>

                  <Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Monto pagado</Typography>
                    <Typography sx={{ mt: 0.7, fontSize: 39, fontWeight: 900, color: '#9a5a00', lineHeight: 1.1 }}>{formatMontoConBs(detallePago)}</Typography>
                  </Box>

                  <Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Fecha de pago</Typography>
                    <Typography sx={{ mt: 0.7, fontSize: 31, fontWeight: 800, color: '#0b2a57', lineHeight: 1.12 }}>{formatFechaBonita(detallePago.fecha_pago)}</Typography>
                  </Box>

                  <Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Referencia</Typography>
                    <Box sx={{ mt: 0.7, display: 'flex', alignItems: 'center', gap: 0.4 }}>
                      <Typography sx={{ fontSize: 28, fontWeight: 800, color: '#4c6690', lineHeight: 1.12 }}>{detallePago.referencia || '-'}</Typography>
                      {detallePago.referencia && (
                        <IconButton size="small" onClick={() => copiarReferencia(detallePago.referencia)} sx={{ color: '#95a2b6' }}>
                          <ContentCopyIcon fontSize="inherit" />
                        </IconButton>
                      )}
                    </Box>
                  </Box>

                  <Box>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Comprobante</Typography>
                    {detallePago.comprobante_url ? (
                      <Button
                        variant="text"
                        startIcon={<InsertDriveFileIcon fontSize="small" />}
                        onClick={() => handleVerComprobante(detallePago.comprobante_url)}
                        sx={{ mt: 0.35, px: 0, color: '#ff8a00', fontWeight: 900, textTransform: 'none', fontSize: 25 }}
                      >
                        Ver Archivo Digital
                      </Button>
                    ) : (
                      <Typography sx={{ mt: 0.7, color: '#9ca3af', fontWeight: 700 }}>Sin comprobante</Typography>
                    )}
                  </Box>

                  <Box sx={{ display: 'flex', justifyContent: { xs: 'flex-start', md: 'flex-end' }, alignItems: 'flex-end', gap: 1.2 }}>
                    <Button
                      variant="contained"
                      startIcon={<EditIcon fontSize="small" />}
                      onClick={() => abrirModalEditarPago(detallePago)}
                      sx={{ borderRadius: 999, px: 2.2, bgcolor: '#e5edf8', color: '#1165a4', boxShadow: 'none', fontWeight: 800, '&:hover': { bgcolor: '#d8e5f6', boxShadow: 'none' } }}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="contained"
                      startIcon={<DeleteOutlineIcon fontSize="small" />}
                      onClick={() => solicitarEliminarPago(detallePago)}
                      disabled={eliminandoPagoId === detallePago._id}
                      sx={{ borderRadius: 999, px: 2.2, bgcolor: '#f9e9e9', color: '#d32727', boxShadow: 'none', fontWeight: 800, '&:hover': { bgcolor: '#f6dddd', boxShadow: 'none' } }}
                    >
                      {eliminandoPagoId === detallePago._id ? 'Eliminando...' : 'Eliminar'}
                    </Button>
                  </Box>
                </Box>
              </Box>
            </>
          ) : (
            <Typography sx={{ color: '#334155' }}>No hay informacion de pago registrada.</Typography>
          )}

          {pagosDetalle.length > 0 && (
            <Box sx={{ mt: 3.25 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.25 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <HistoryRoundedIcon sx={{ color: '#8ea0bc', fontSize: 19 }} />
                  <Typography sx={{ fontSize: 35, fontWeight: 900, color: '#0b2a57', lineHeight: 1.15 }}>
                    {mensualidadDetalle?.id_alumno?.habilitar_pago_cuotas === true ? 'Historial de abonos' : 'Historial de pagos'}
                  </Typography>
                </Box>
                <Chip label={`${pagosDetalle.length} total`} size="small" sx={{ bgcolor: '#d9e4f7', color: '#4b6ca7', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }} />
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {pagosDetalle.map((pago, idx) => (
                  <Box
                    key={pago._id || idx}
                    sx={{
                      bgcolor: '#ffffff',
                      border: '1px solid #e8ebf2',
                      borderRadius: 2,
                      borderLeft: '4px solid #c9daf6',
                      px: 1.7,
                      py: 1.2,
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr 1fr 1fr auto' },
                      alignItems: 'center',
                      gap: 1.3
                    }}
                  >
                    <Box>
                      <Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Pago #{idx + 1}</Typography>
                      <Typography sx={{ fontWeight: 800, color: '#0b2a57', mt: 0.25 }}>{pago.metodo_pago || '-'}</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Monto</Typography>
                      <Typography sx={{ fontWeight: 900, color: '#0b2a57', mt: 0.25 }}>{formatMontoConBs(pago)}</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Fecha</Typography>
                      <Typography sx={{ color: '#334155', mt: 0.25 }}>{formatFechaBonita(pago.fecha_pago)}</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Referencia</Typography>
                      <Typography sx={{ color: '#4c6690', fontWeight: 700, mt: 0.25 }}>{pago.referencia || '-'}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.6, justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
                      {pago.comprobante_url && (
                        <IconButton size="small" onClick={() => handleVerComprobante(pago.comprobante_url)} sx={{ bgcolor: '#f3f4f6', '&:hover': { bgcolor: '#e9edf3' } }}>
                          <InsertDriveFileIcon fontSize="small" sx={{ color: '#4b5563' }} />
                        </IconButton>
                      )}
                      <IconButton size="small" onClick={() => abrirModalEditarPago(pago)} sx={{ bgcolor: '#e0f1fb', '&:hover': { bgcolor: '#d1e9f8' } }}>
                        <EditIcon fontSize="small" sx={{ color: '#0a78b8' }} />
                      </IconButton>
                      <IconButton size="small" onClick={() => solicitarEliminarPago(pago)} disabled={eliminandoPagoId === pago._id} sx={{ bgcolor: '#fdecec', '&:hover': { bgcolor: '#fbdede' } }}>
                        <DeleteOutlineIcon fontSize="small" sx={{ color: '#d32727' }} />
                      </IconButton>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.25, bgcolor: '#f3f5fb', justifyContent: 'flex-end' }}>
          <Button onClick={() => setModalDetalle(false)} variant="text" sx={{ color: '#516b94', fontWeight: 800 }}>
            Volver
          </Button>
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
      <Dialog open={modalEditarOpen} onClose={() => { if (!guardandoEdicion) setModalEditarOpen(false); }} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800, color: '#0f172a' }}>Editar pago</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1.25, pt: '12px !important' }}>
          <TextField
            select
            label="Metodo de pago"
            value={metodoPago}
            onChange={(e) => { setMetodoPago(e.target.value); setErrorRef(''); if (e.target.value === 'Efectivo') setReferencia(''); }}
            fullWidth
            size="small"
          >
            {metodosPago.map((metodo) => (
              <MenuItem key={metodo} value={metodo}>{metodo}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Fecha de pago"
            type="date"
            value={fechaPago}
            onChange={(e) => setFechaPago(e.target.value)}
            fullWidth
            size="small"
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Monto"
            type="number"
            value={montoPago}
            onChange={(e) => setMontoPago(e.target.value)}
            fullWidth
            size="small"
            inputProps={{ min: 0, step: '0.01' }}
          />
          {(metodoPago === 'Transferencia' || metodoPago === 'Pago movil') && (
            <TextField
              label="6 ultimos digitos de referencia"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value.replace(/[^0-9]/g, ''))}
              fullWidth
              size="small"
              inputProps={{ maxLength: 6 }}
              error={!!errorRef}
              helperText={errorRef}
            />
          )}
          <Box component="label" sx={{ mt: 0.5, border: '1px dashed #cbd5f0', borderRadius: 2, p: 1.5, textAlign: 'center', cursor: 'pointer' }}>
            <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>Adjuntar nuevo comprobante</Typography>
            <Typography variant="caption" sx={{ color: '#94a3b8' }}>PNG, JPG o PDF</Typography>
            <input type="file" hidden onChange={(e) => { setComprobante(e.target.files[0]); setQuitarComprobanteActual(false); }} />
          </Box>
          {comprobante && (
            <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 2, px: 1.25, py: 0.75, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                <InsertDriveFileIcon sx={{ color: '#fb923c', fontSize: 18 }} />
                <Typography variant="body2" sx={{ color: '#475569', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {comprobante.name}
                </Typography>
              </Box>
              <IconButton size="small" onClick={() => setComprobante(null)}>
                <CloseIcon sx={{ fontSize: 16, color: '#94a3b8' }} />
              </IconButton>
            </Box>
          )}
          {editandoPago?.comprobante_url && !comprobante && (
            <Box sx={{ p: 1.25, borderRadius: 2, border: '1px solid #e2e8f0', bgcolor: '#ffffff' }}>
              <Typography variant="body2" sx={{ color: '#64748b', mb: 0.75 }}>Hay un comprobante asociado a este pago.</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button size="small" onClick={() => handleVerComprobante(editandoPago.comprobante_url)}>Ver actual</Button>
                <Button size="small" color={quitarComprobanteActual ? 'success' : 'error'} onClick={() => setQuitarComprobanteActual((prev) => !prev)}>
                  {quitarComprobanteActual ? 'Deshacer quitar comprobante' : 'Quitar comprobante actual'}
                </Button>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalEditarOpen(false)} disabled={guardandoEdicion}>Cancelar</Button>
          <Button variant="contained" onClick={guardarEdicionPago} disabled={guardandoEdicion}>
            {guardandoEdicion ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={confirmarEliminarOpen}
        onClose={() => {
          if (eliminandoPagoId) return;
          setConfirmarEliminarOpen(false);
          setPagoAEliminar(null);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#b91c1c' }}>Eliminar pago</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#334155' }}>
            ¿Seguro que deseas eliminar este pago? Esta acción recalculará el estado de la mensualidad y no se puede deshacer.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setConfirmarEliminarOpen(false);
              setPagoAEliminar(null);
            }}
            disabled={!!eliminandoPagoId}
          >
            Cancelar
          </Button>
          <Button variant="contained" color="error" onClick={eliminarPago} disabled={!!eliminandoPagoId}>
            {eliminandoPagoId ? 'Eliminando...' : 'Eliminar pago'}
          </Button>
        </DialogActions>
      </Dialog>
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
