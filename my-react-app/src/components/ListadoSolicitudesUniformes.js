import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { mediaUrl } from '../utils/mediaUrl';

const ESTADO_LABELS = {
  pendiente: 'Pendiente',
  esperando_pago: 'Esperando pago',
  pago_en_revision: 'Pago en revision',
  verificado: 'Verificado',
  entregado: 'Entregado',
  cancelado: 'Cancelado'
};

const ESTADO_STYLES = {
  pendiente: { bgcolor: '#e2e8f0', color: '#475569' },
  esperando_pago: { bgcolor: '#fef3c7', color: '#92400e' },
  pago_en_revision: { bgcolor: '#dbeafe', color: '#1d4ed8' },
  verificado: { bgcolor: '#dcfce7', color: '#166534' },
  entregado: { bgcolor: '#dcfce7', color: '#166534' },
  cancelado: { bgcolor: '#fee2e2', color: '#b91c1c' }
};

function ListadoSolicitudesUniformes() {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [solicitudPagoOpen, setSolicitudPagoOpen] = useState(false);
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null);
  const [precioSolicitado, setPrecioSolicitado] = useState('');
  const [submittingSolicitudPago, setSubmittingSolicitudPago] = useState(false);
  const [detallePagoOpen, setDetallePagoOpen] = useState(false);
  const [submittingVerificacion, setSubmittingVerificacion] = useState(false);
  const [confirmEntregarId, setConfirmEntregarId] = useState(null);
  const [entregandoId, setEntregandoId] = useState(null);

  const token = localStorage.getItem('token');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  const formatMoney = (value) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
    return Number(value).toFixed(2);
  };

  const formatFecha = (fecha) => {
    if (!fecha) return '-';
    const date = new Date(fecha);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('es-VE');
  };

  const getEstadoLabel = (estado) => ESTADO_LABELS[estado] || estado || '-';
  const getEstadoStyle = (estado) => ESTADO_STYLES[estado] || ESTADO_STYLES.pendiente;

  const copiarReferencia = async (texto) => {
    try {
      if (!texto) return;
      await navigator.clipboard.writeText(String(texto));
      setSuccessMessage('Referencia copiada');
    } catch {
      setError('No se pudo copiar la referencia');
    }
  };

  const fetchPedidos = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al obtener pedidos');
      setPedidos(Array.isArray(data) ? data : []);
    } catch (err) {
      setPedidos([]);
      setError(err.message || 'Error al obtener pedidos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPedidos();
  }, []);

  const openSolicitudPagoDialog = (pedido) => {
    setPedidoSeleccionado(pedido);
    setPrecioSolicitado(formatMoney(pedido?.precio));
    setSolicitudPagoOpen(true);
  };

  const closeSolicitudPagoDialog = () => {
    if (submittingSolicitudPago) return;
    setSolicitudPagoOpen(false);
    setPedidoSeleccionado(null);
    setPrecioSolicitado('');
  };

  const handleSolicitarPago = async () => {
    const precio = Number(precioSolicitado);
    if (!precio || Number.isNaN(precio) || precio <= 0 || !pedidoSeleccionado?._id) {
      setError('Debes indicar un precio valido para solicitar el pago');
      return;
    }

    try {
      setSubmittingSolicitudPago(true);
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos/${pedidoSeleccionado._id}/solicitar-pago`, {
        method: 'PATCH',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ precio })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al solicitar el pago');
      setPedidos((prev) => prev.map((pedido) => (pedido._id === data._id ? data : pedido)));
      setSolicitudPagoOpen(false);
      setPedidoSeleccionado(null);
      setPrecioSolicitado('');
      setSuccessMessage('Solicitud de pago enviada al usuario');
    } catch (err) {
      setError(err.message || 'Error al solicitar el pago');
    } finally {
      setSubmittingSolicitudPago(false);
    }
  };

  const openDetallePagoDialog = (pedido) => {
    setPedidoSeleccionado(pedido);
    setDetallePagoOpen(true);
  };

  const closeDetallePagoDialog = () => {
    if (submittingVerificacion) return;
    setDetallePagoOpen(false);
    setPedidoSeleccionado(null);
  };

  const handleVerificarPago = async () => {
    if (!pedidoSeleccionado?._id) return;
    try {
      setSubmittingVerificacion(true);
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos/${pedidoSeleccionado._id}/verificar-pago`, {
        method: 'PATCH',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al verificar el pago');
      setPedidos((prev) => prev.map((pedido) => (pedido._id === data._id ? data : pedido)));
      setDetallePagoOpen(false);
      setPedidoSeleccionado(null);
      setSuccessMessage('Pago verificado correctamente');
    } catch (err) {
      setError(err.message || 'Error al verificar el pago');
    } finally {
      setSubmittingVerificacion(false);
    }
  };

  const handleEntregar = async (id) => {
    if (!id) return;
    setEntregandoId(id);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos/${id}/entregado`, {
        method: 'PATCH',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al marcar como entregado');
      setPedidos((prev) => prev.map((pedido) => (pedido._id === id ? data : pedido)));
      setSuccessMessage('Prenda marcada como entregada');
    } catch (err) {
      setError(err.message || 'Error al marcar como entregado');
    } finally {
      setEntregandoId(null);
      setConfirmEntregarId(null);
    }
  };

  const renderAccion = (pedido, mobile = false) => {
    if (pedido.estado === 'pendiente') {
      return (
        <Button
          size="small"
          variant="contained"
          fullWidth={mobile}
          onClick={() => openSolicitudPagoDialog(pedido)}
        >
          Solicitar pago
        </Button>
      );
    }

    if (pedido.estado === 'pago_en_revision') {
      return (
        <Button
          size="small"
          variant="outlined"
          fullWidth={mobile}
          onClick={() => openDetallePagoDialog(pedido)}
        >
          Ver detalles pago
        </Button>
      );
    }

    if (pedido.estado === 'verificado') {
      return (
        <Button
          size="small"
          variant="contained"
          fullWidth={mobile}
          disabled={entregandoId === pedido._id}
          onClick={() => setConfirmEntregarId(pedido._id)}
          startIcon={
            entregandoId === pedido._id
              ? <CircularProgress size={14} sx={{ color: '#ffffff' }} />
              : <CheckCircleOutlineIcon fontSize="small" />
          }
          sx={{
            bgcolor: '#2e7d32',
            color: '#ffffff',
            fontWeight: 700,
            textTransform: 'none',
            boxShadow: 'none',
            '&:hover': {
              bgcolor: '#1f6b24',
              boxShadow: 'none'
            },
            '&:disabled': {
              bgcolor: '#c8e6c9',
              color: '#2f5f32'
            }
          }}
        >
          {entregandoId === pedido._id ? 'Entregando...' : 'Marcar entregado'}
        </Button>
      );
    }

    return <Typography variant="body2" color="text.secondary">Sin acciones</Typography>;
  };

  return (
    <Box>
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
      <Snackbar
        open={!!error}
        autoHideDuration={3500}
        onClose={() => setError('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setError('')} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>

      <Typography variant="h5" sx={{ mb: 2 }}>Pedidos de Uniformes</Typography>
      {loading ? (
        <Typography>Cargando...</Typography>
      ) : error ? (
        <Typography color="error">{error}</Typography>
      ) : isMobile ? (
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          {pedidos.map((pedido) => (
            <Paper
              key={pedido._id}
              sx={{
                borderRadius: 3,
                border: '1px solid #e2e8f0',
                p: 1.5,
                boxShadow: '0 4px 14px rgba(15, 23, 42, 0.06)'
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 1 }}>
                <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>
                  {pedido.alumno ? `${pedido.alumno.nombres} ${pedido.alumno.apellidos}` : '-'}
                </Typography>
                <Chip label={getEstadoLabel(pedido.estado)} size="small" sx={{ ...getEstadoStyle(pedido.estado), fontWeight: 700 }} />
              </Box>

              <Box sx={{ display: 'grid', gap: 0.5, mb: 1.2 }}>
                <Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Sede:</b> {pedido.sede?.nombre || '-'}</Typography>
                <Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Prenda:</b> {pedido.prenda || '-'}</Typography>
                <Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Talla:</b> {pedido.talla || '-'}</Typography>
                <Typography sx={{ fontSize: 12.5, color: '#0f172a' }}><b>Precio:</b> ${formatMoney(pedido.precio)}</Typography>
                <Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Método:</b> {pedido.metodo_pago || '-'}</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Referencia:</b> {pedido.referencia || '-'}</Typography>
                  {pedido.referencia && (
                    <IconButton size="small" onClick={() => copiarReferencia(pedido.referencia)} aria-label="Copiar referencia" sx={{ color: '#94a3b8' }}>
                      <ContentCopyIcon fontSize="inherit" />
                    </IconButton>
                  )}
                </Box>
              </Box>

              <Box sx={{ display: 'grid', gap: 1 }}>
                {pedido.comprobante_url ? (
                  <Button size="small" variant="text" onClick={() => window.open(mediaUrl(pedido.comprobante_url), '_blank')}>
                    Ver comprobante
                  </Button>
                ) : (
                  <Typography variant="body2" color="text.secondary">Sin comprobante</Typography>
                )}
                {renderAccion(pedido, true)}
              </Box>
            </Paper>
          ))}
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Alumno</TableCell>
                <TableCell>Sede</TableCell>
                <TableCell>Prenda</TableCell>
                <TableCell>Talla</TableCell>
                <TableCell>Precio</TableCell>
                <TableCell>Metodo</TableCell>
                <TableCell>Referencia</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Comprobante</TableCell>
                <TableCell>Accion</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pedidos.map((pedido) => (
                <TableRow key={pedido._id}>
                  <TableCell>{pedido.alumno ? `${pedido.alumno.nombres} ${pedido.alumno.apellidos}` : '-'}</TableCell>
                  <TableCell>{pedido.sede?.nombre || '-'}</TableCell>
                  <TableCell>{pedido.prenda}</TableCell>
                  <TableCell>{pedido.talla}</TableCell>
                  <TableCell>${formatMoney(pedido.precio)}</TableCell>
                  <TableCell>{pedido.metodo_pago || '-'}</TableCell>
                  <TableCell>{pedido.referencia || '-'}</TableCell>
                  <TableCell>
                    <Chip label={getEstadoLabel(pedido.estado)} size="small" sx={{ ...getEstadoStyle(pedido.estado), fontWeight: 700 }} />
                  </TableCell>
                  <TableCell>
                    {pedido.comprobante_url ? (
                      <Button size="small" variant="text" onClick={() => window.open(mediaUrl(pedido.comprobante_url), '_blank')}>
                        Ver
                      </Button>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    {renderAccion(pedido)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={solicitudPagoOpen} onClose={closeSolicitudPagoDialog} maxWidth="xs" fullWidth>
        <DialogTitle>Solicitar pago</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gap: 2, pt: 1 }}>
            <Typography>
              <b>Alumno:</b> {pedidoSeleccionado?.alumno ? `${pedidoSeleccionado.alumno.nombres} ${pedidoSeleccionado.alumno.apellidos}` : '-'}
            </Typography>
            <Typography><b>Prenda:</b> {pedidoSeleccionado?.prenda || '-'}</Typography>
            <TextField
              label="Monto solicitado"
              type="number"
              value={precioSolicitado}
              onChange={(event) => setPrecioSolicitado(event.target.value)}
              inputProps={{ min: 0, step: '0.01' }}
            />
            <Typography variant="body2" sx={{ color: '#64748b' }}>
              El monto viene desde la prenda configurada, pero puedes ajustarlo antes de confirmar la solicitud de pago.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeSolicitudPagoDialog} disabled={submittingSolicitudPago}>Cancelar</Button>
          <Button onClick={handleSolicitarPago} variant="contained" disabled={submittingSolicitudPago}>
            {submittingSolicitudPago ? 'Procesando...' : 'Confirmar solicitud'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={detallePagoOpen} onClose={closeDetallePagoDialog} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Detalle del pago</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gap: 1.5, pt: 1 }}>
            <Typography sx={{ color: '#64748b' }}>
              Alumno: {pedidoSeleccionado?.alumno ? `${pedidoSeleccionado.alumno.nombres} ${pedidoSeleccionado.alumno.apellidos}` : '-'}
            </Typography>
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
                  $
                </Box>
                <Typography sx={{ fontWeight: 800, fontSize: 12, color: '#64748b', letterSpacing: '0.06em' }}>
                  DETALLE DEL PAGO RECIBIDO
                </Typography>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 1.5, columnGap: 2, fontSize: 13 }}>
                <Typography sx={{ color: '#64748b' }}>Prenda</Typography>
                <Typography sx={{ fontWeight: 700, color: '#0f172a', textAlign: 'right' }}>{pedidoSeleccionado?.prenda || '-'}</Typography>

                <Typography sx={{ color: '#64748b' }}>Monto</Typography>
                <Typography sx={{ fontWeight: 700, color: '#ff7a00', textAlign: 'right' }}>${formatMoney(pedidoSeleccionado?.precio)}</Typography>

                <Typography sx={{ color: '#64748b' }}>Metodo de pago</Typography>
                <Typography sx={{ fontWeight: 700, color: '#0f172a', textAlign: 'right' }}>{pedidoSeleccionado?.metodo_pago || '-'}</Typography>

                <Typography sx={{ color: '#64748b' }}>Fecha de pago</Typography>
                <Typography sx={{ fontWeight: 700, color: '#0f172a', textAlign: 'right' }}>{formatFecha(pedidoSeleccionado?.fecha_pago)}</Typography>

                <Typography sx={{ color: '#64748b' }}>Referencia</Typography>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 0.5 }}>
                  <Typography sx={{ fontWeight: 700, color: '#0f172a' }}>{pedidoSeleccionado?.referencia || '-'}</Typography>
                  {pedidoSeleccionado?.referencia && (
                    <IconButton size="small" onClick={() => copiarReferencia(pedidoSeleccionado.referencia)} aria-label="Copiar referencia" sx={{ color: '#94a3b8' }}>
                      <ContentCopyIcon fontSize="inherit" />
                    </IconButton>
                  )}
                </Box>

                <Typography sx={{ color: '#64748b' }}>Comprobante</Typography>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  {pedidoSeleccionado?.comprobante_url ? (
                    <Button
                      variant="text"
                      size="small"
                      onClick={() => window.open(mediaUrl(pedidoSeleccionado.comprobante_url), '_blank')}
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
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDetallePagoDialog} disabled={submittingVerificacion}>Cerrar</Button>
          <Button onClick={handleVerificarPago} variant="contained" disabled={submittingVerificacion}>
            {submittingVerificacion ? 'Procesando...' : 'Confirmar pago'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!confirmEntregarId} onClose={() => setConfirmEntregarId(null)}>
        <DialogTitle>Confirmar entrega</DialogTitle>
        <DialogContent>¿Deseas marcar este pedido como entregado?</DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmEntregarId(null)} disabled={entregandoId === confirmEntregarId}>Cancelar</Button>
          <Button
            onClick={() => handleEntregar(confirmEntregarId)}
            variant="contained"
            disabled={entregandoId === confirmEntregarId}
            startIcon={entregandoId === confirmEntregarId ? <CircularProgress size={14} sx={{ color: '#ffffff' }} /> : <CheckCircleOutlineIcon fontSize="small" />}
            sx={{
              bgcolor: '#2e7d32',
              textTransform: 'none',
              boxShadow: 'none',
              '&:hover': { bgcolor: '#1f6b24', boxShadow: 'none' },
              '&:disabled': { bgcolor: '#c8e6c9', color: '#2f5f32' }
            }}
          >
            {entregandoId === confirmEntregarId ? 'Procesando...' : 'Confirmar entrega'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default ListadoSolicitudesUniformes;
