import React, { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
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
import PaymentIcon from '@mui/icons-material/Payment';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CloseIcon from '@mui/icons-material/Close';
import { useDolar } from '../context/DolarContext';

const TALLAS = ['S', 'M', 'L', 'XL'];
const METODOS_PAGO = ['Pago movil', 'Transferencia'];

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
  entregado: { bgcolor: '#ccfbf1', color: '#0f766e' },
  cancelado: { bgcolor: '#fee2e2', color: '#b91c1c' }
};

function SolicitudUniforme({ alumno, sede, onGuardar }) {
  const { dolar } = useDolar();
  const [prendas, setPrendas] = useState([]);
  const [prendasLoading, setPrendasLoading] = useState(false);
  const [prendasError, setPrendasError] = useState('');
  const [prenda, setPrenda] = useState('');
  const [talla, setTalla] = useState('');
  const [nombrePersonalizado, setNombrePersonalizado] = useState('');
  const [numeroFranela, setNumeroFranela] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [pedidos, setPedidos] = useState([]);
  const [pedidosLoading, setPedidosLoading] = useState(false);
  const [cancelandoId, setCancelandoId] = useState(null);
  const [confirmCancelId, setConfirmCancelId] = useState(null);
  const [pagoDialogOpen, setPagoDialogOpen] = useState(false);
  const [pedidoPago, setPedidoPago] = useState(null);
  const [metodoPago, setMetodoPago] = useState(METODOS_PAGO[0]);
  const [referencia, setReferencia] = useState('');
  const [comprobante, setComprobante] = useState(null);
  const [submittingPago, setSubmittingPago] = useState(false);

  const tasaBCV = Number(dolar?.promedio) || 0;
  const token = localStorage.getItem('token');

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

  const fetchPrendas = async () => {
    setPrendasLoading(true);
    setPrendasError('');
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/public`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al obtener uniformes');
      setPrendas(Array.isArray(data) ? data : []);
    } catch (err) {
      setPrendas([]);
      setPrendasError(err.message || 'Error al obtener uniformes');
    } finally {
      setPrendasLoading(false);
    }
  };

  const fetchPedidos = async () => {
    if (!alumno?._id) return;
    setPedidosLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos/mis?alumnoId=${alumno._id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al obtener solicitudes activas');
      setPedidos(Array.isArray(data) ? data : []);
    } catch (err) {
      setPedidos([]);
      setErrorMessage(err.message || 'Error al obtener solicitudes activas');
    } finally {
      setPedidosLoading(false);
    }
  };

  useEffect(() => {
    fetchPrendas();
  }, []);

  useEffect(() => {
    fetchPedidos();
  }, [alumno?._id]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!prenda || !talla) {
      setErrorMessage('Completa todos los campos del pedido');
      return;
    }

    try {
      setGuardando(true);
      const formData = new FormData();
      formData.append('alumnoId', alumno?._id || alumno?.id || '');
      const sedeId = sede?._id || sede?.id || alumno?.sede?._id || alumno?.sede || '';
      formData.append('sedeId', sedeId);
      formData.append('prenda', prenda);
      formData.append('talla', talla);
      formData.append('nombrePersonalizado', nombrePersonalizado);
      formData.append('numeroFranela', numeroFranela);

      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al guardar el pedido');

      setPrenda('');
      setTalla('');
      setNombrePersonalizado('');
      setNumeroFranela('');
      setSuccessMessage('Pedido realizado con exito');
      onGuardar && onGuardar(data);
      await fetchPedidos();
    } catch (err) {
      setErrorMessage(err.message || 'Error al guardar el pedido');
    } finally {
      setGuardando(false);
    }
  };

  const handleCancelarPedido = async (pedidoId) => {
    if (!pedidoId) return;
    try {
      setCancelandoId(pedidoId);
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos/${pedidoId}/cancelar`, {
        method: 'PATCH',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al cancelar solicitud');
      setPedidos((prev) => prev.map((pedido) => (pedido._id === pedidoId ? data : pedido)));
      setSuccessMessage('Solicitud cancelada');
    } catch (err) {
      setErrorMessage(err.message || 'Error al cancelar solicitud');
    } finally {
      setCancelandoId(null);
      setConfirmCancelId(null);
    }
  };

  const openPagoDialog = (pedido) => {
    setPedidoPago(pedido);
    setMetodoPago(METODOS_PAGO[0]);
    setReferencia('');
    setComprobante(null);
    setPagoDialogOpen(true);
  };

  const closePagoDialog = () => {
    if (submittingPago) return;
    setPagoDialogOpen(false);
    setPedidoPago(null);
    setMetodoPago(METODOS_PAGO[0]);
    setReferencia('');
    setComprobante(null);
  };

  const handlePagarPedido = async () => {
    if (!pedidoPago?._id) return;
    if ((metodoPago === 'Transferencia' || metodoPago === 'Pago movil') && !/^[0-9]{6,}$/.test(referencia)) {
      setErrorMessage('La referencia debe tener minimo 6 digitos');
      return;
    }

    try {
      setSubmittingPago(true);
      const formData = new FormData();
      formData.append('metodo_pago', metodoPago);
      if (referencia) formData.append('referencia', referencia);
      formData.append('fecha_pago', new Date().toISOString());
      if (comprobante) formData.append('comprobante', comprobante);

      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos/${pedidoPago._id}/pagar`, {
        method: 'PATCH',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al registrar el pago');

      setPedidos((prev) => prev.map((pedido) => (pedido._id === data._id ? data : pedido)));
      setPagoDialogOpen(false);
      setPedidoPago(null);
      setMetodoPago(METODOS_PAGO[0]);
      setReferencia('');
      setComprobante(null);
      setSuccessMessage('Pago registrado correctamente');
    } catch (err) {
      setErrorMessage(err.message || 'Error al registrar el pago');
    } finally {
      setSubmittingPago(false);
    }
  };

  const montoPagoBs = pedidoPago?.precio && tasaBCV ? Number(pedidoPago.precio) * tasaBCV : null;

  const inputSx = {
    '& .MuiOutlinedInput-root': {
      borderRadius: 2,
      backgroundColor: '#ffffff'
    },
    '& .MuiOutlinedInput-notchedOutline': {
      borderColor: '#e2e8f0'
    },
    '& .MuiInputLabel-root': {
      color: '#64748b'
    }
  };

  const getEstadoLabel = (estado) => ESTADO_LABELS[estado] || estado || '-';

  const getEstadoStyle = (estado) => ESTADO_STYLES[estado] || ESTADO_STYLES.pendiente;

  return (
    <Grid container justifyContent="center" alignItems="flex-start" sx={{ minHeight: '80vh', py: 3 }}>
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
        open={!!errorMessage}
        autoHideDuration={3500}
        onClose={() => setErrorMessage('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setErrorMessage('')} severity="error" sx={{ width: '100%' }}>
          {errorMessage}
        </Alert>
      </Snackbar>
      <Grid item size={{ xs: 12, sm: 11, md: 10 }}>
        <Box sx={{ display: 'grid', gap: 3 }}>
          <Paper elevation={4} sx={{ p: 4, borderRadius: 3 }}>
            <Typography variant="h5" gutterBottom align="center" fontWeight={700} color="primary.main">
              Solicitar Uniforme
            </Typography>
            {alumno && (
              <Typography variant="subtitle1" sx={{ mb: 1 }}>
                <b>Alumno:</b> {alumno.nombres} {alumno.apellidos}
              </Typography>
            )}
            <Box component="form" onSubmit={handleSubmit} noValidate>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item size={{ xs: 12, md: 6 }}>
                  <FormControl fullWidth required>
                    <InputLabel id="prenda-label">Prenda</InputLabel>
                    <Select
                      labelId="prenda-label"
                      value={prenda}
                      label="Prenda"
                      onChange={(event) => setPrenda(event.target.value)}
                      disabled={prendasLoading || !!prendasError}
                    >
                      <MenuItem value=""><em>Seleccione</em></MenuItem>
                      {prendas.map((item) => (
                        <MenuItem key={item._id} value={item.prenda}>{item.prenda} - ${formatMoney(item.precio)}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item size={{ xs: 12, md: 6 }}>
                  <FormControl fullWidth required>
                    <InputLabel id="talla-label">Talla</InputLabel>
                    <Select
                      labelId="talla-label"
                      value={talla}
                      label="Talla"
                      onChange={(event) => setTalla(event.target.value)}
                    >
                      <MenuItem value=""><em>Seleccione</em></MenuItem>
                      {TALLAS.map((item) => (
                        <MenuItem key={item} value={item}>{item}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Nombre personalizado"
                    value={nombrePersonalizado}
                    onChange={(event) => setNombrePersonalizado(event.target.value)}
                    helperText="Opcional"
                  />
                </Grid>
                <Grid item size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    label="Numero de franela"
                    value={numeroFranela}
                    onChange={(event) => setNumeroFranela(event.target.value.replace(/[^0-9]/g, '').slice(0, 3))}
                    helperText="Opcional"
                  />
                </Grid>
              </Grid>
              {prendasError && (
                <Typography variant="body2" color="error" sx={{ mb: 2 }}>
                  {prendasError}
                </Typography>
              )}
              <Button type="submit" variant="contained" color="primary" fullWidth size="large" disabled={guardando}>
                {guardando ? 'Guardando...' : 'Guardar pedido'}
              </Button>
            </Box>
          </Paper>

          <Paper elevation={3} sx={{ p: 3, borderRadius: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
              Solicitudes de uniformes del alumno
            </Typography>
            {pedidosLoading ? (
              <Typography>Cargando solicitudes...</Typography>
            ) : pedidos.length === 0 ? (
              <Typography color="text.secondary">No hay solicitudes registradas para este alumno.</Typography>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Prenda</TableCell>
                      <TableCell>Talla</TableCell>
                      <TableCell>Nombre</TableCell>
                      <TableCell>Numero</TableCell>
                      <TableCell>Precio</TableCell>
                      <TableCell>Pago</TableCell>
                      <TableCell>Fecha</TableCell>
                      <TableCell>Estado</TableCell>
                      <TableCell>Acciones</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pedidos.map((pedido) => (
                      <TableRow key={pedido._id}>
                        <TableCell>{pedido.prenda}</TableCell>
                        <TableCell>{pedido.talla}</TableCell>
                        <TableCell>{pedido.nombre_personalizado || '-'}</TableCell>
                        <TableCell>{pedido.numero_franela || '-'}</TableCell>
                        <TableCell>
                          <Typography sx={{ fontWeight: 700 }}>${formatMoney(pedido.precio)}</Typography>
                          {tasaBCV ? (
                            <Typography variant="body2" sx={{ color: '#64748b' }}>
                              Bs. {formatMoney(Number(pedido.precio) * tasaBCV)}
                            </Typography>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          {pedido.metodo_pago ? (
                            <>
                              <Typography>{pedido.metodo_pago}</Typography>
                              <Typography variant="body2" sx={{ color: '#64748b' }}>
                                Ref: {pedido.referencia || '-'}
                              </Typography>
                            </>
                          ) : '-'}
                        </TableCell>
                        <TableCell>{formatFecha(pedido.fecha_pago || pedido.createdAt)}</TableCell>
                        <TableCell>
                          <Chip
                            label={getEstadoLabel(pedido.estado)}
                            size="small"
                            sx={{
                              ...getEstadoStyle(pedido.estado),
                              fontWeight: 700
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          {pedido.estado === 'esperando_pago' ? (
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                              <Button size="small" variant="contained" onClick={() => openPagoDialog(pedido)}>
                                Realizar pago
                              </Button>
                              <Button
                                size="small"
                                color="error"
                                variant="outlined"
                                disabled={cancelandoId === pedido._id}
                                onClick={() => setConfirmCancelId(pedido._id)}
                              >
                                {cancelandoId === pedido._id ? 'Cancelando...' : 'Cancelar'}
                              </Button>
                            </Box>
                          ) : pedido.estado === 'pendiente' ? (
                            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                              <Typography variant="body2" sx={{ color: '#64748b' }}>
                                Esperando solicitud de pago del administrador
                              </Typography>
                              <Button
                                size="small"
                                color="error"
                                variant="outlined"
                                disabled={cancelandoId === pedido._id}
                                onClick={() => setConfirmCancelId(pedido._id)}
                              >
                                {cancelandoId === pedido._id ? 'Cancelando...' : 'Cancelar'}
                              </Button>
                            </Box>
                          ) : (
                            <Typography variant="body2" sx={{ color: '#64748b' }}>
                              {pedido.estado === 'cancelado'
                                ? 'Solicitud cancelada'
                                : pedido.estado === 'pago_en_revision'
                                  ? 'Pago enviado, en revision'
                                  : pedido.estado === 'verificado'
                                    ? 'Pago verificado. En espera de entrega'
                                    : pedido.estado === 'entregado'
                                      ? 'Prenda entregada'
                                      : 'Sin acciones disponibles'}
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Box>
      </Grid>

      <Dialog open={!!confirmCancelId} onClose={() => setConfirmCancelId(null)}>
        <DialogTitle>Cancelar solicitud</DialogTitle>
        <DialogContent>
          <Typography>¿Deseas cancelar esta solicitud de uniforme?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmCancelId(null)} disabled={cancelandoId === confirmCancelId}>Volver</Button>
          <Button onClick={() => handleCancelarPedido(confirmCancelId)} color="error" variant="contained" disabled={cancelandoId === confirmCancelId}>
            Confirmar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={pagoDialogOpen}
        onClose={closePagoDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
      >
        <DialogTitle
          disableTypography
          sx={{
            p: 3,
            pb: 1.5,
            backgroundColor: '#ffffff'
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 2,
                backgroundColor: '#fff2e7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <PaymentIcon sx={{ color: '#ff7a00' }} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a' }}>
                Realizar pago del uniforme
              </Typography>
              <Typography variant="body2" sx={{ color: '#94a3b8', mt: 0.25 }}>
                Confirma los datos y carga el comprobante para validar el pago.
              </Typography>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 3, pt: 1.5, bgcolor: '#f8fafc' }}>
          <Box sx={{ display: 'grid', gap: 2 }}>
            <Box
              sx={{
                position: 'relative',
                bgcolor: '#ffffff',
                borderRadius: 2.5,
                border: '1px solid #e7eaf2',
                p: 2,
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 6,
                  borderTopLeftRadius: 10,
                  borderTopRightRadius: 10,
                  background: 'linear-gradient(90deg, #ff8a00 0%, #8a4b00 100%)'
                }
              }}
            >
              <Box sx={{ pt: 1.25, display: 'grid', gap: 1 }}>
                <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 700 }}>
                  Prenda
                </Typography>
                <Typography sx={{ color: '#0f172a', fontWeight: 800 }}>
                  {pedidoPago?.prenda || '-'}
                </Typography>
                <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 700, mt: 0.75 }}>
                  Monto
                </Typography>
                <Typography sx={{ color: '#9a5a00', fontWeight: 900, fontSize: 18 }}>
                  ${formatMoney(pedidoPago?.precio)}{montoPagoBs ? ` / Bs. ${formatMoney(montoPagoBs)}` : ''}
                </Typography>
              </Box>
            </Box>
            <FormControl fullWidth>
              <InputLabel id="metodo-pago-uniforme-label">Metodo de pago</InputLabel>
              <Select
                labelId="metodo-pago-uniforme-label"
                value={metodoPago}
                label="Metodo de pago"
                onChange={(event) => setMetodoPago(event.target.value)}
                size="small"
                sx={inputSx}
              >
                {METODOS_PAGO.map((item) => (
                  <MenuItem key={item} value={item}>{item}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Referencia"
              value={referencia}
              onChange={(event) => setReferencia(event.target.value.replace(/[^0-9]/g, '').slice(0, 20))}
              size="small"
              sx={inputSx}
              helperText={metodoPago === 'Transferencia' || metodoPago === 'Pago movil' ? 'Minimo 6 digitos' : ''}
            />
            <Box
              component="label"
              sx={{
                mt: 0.5,
                border: '1px dashed #cbd5f0',
                borderRadius: 2,
                p: 2,
                textAlign: 'center',
                backgroundColor: '#f8fafc',
                display: 'block',
                cursor: 'pointer'
              }}
            >
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  backgroundColor: '#fff2e7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 1
                }}
              >
                <PaymentIcon sx={{ color: '#ff7a00', fontSize: 18 }} />
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>Haz clic para adjuntar comprobante</Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8' }}>PNG, JPG o PDF hasta 5MB</Typography>
              <input type="file" hidden onChange={(event) => setComprobante(event.target.files?.[0] || null)} />
            </Box>
            {comprobante && (
              <Box sx={{ mt: 0.25, px: 1.5, py: 1, border: '1px solid #e2e8f0', borderRadius: 2, bgcolor: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
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
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, pt: 1, justifyContent: 'flex-end', gap: 1.5 }}>
          <Button onClick={closePagoDialog} disabled={submittingPago} sx={{ color: '#64748b', fontWeight: 700 }}>
            Cancelar
          </Button>
          <Button
            onClick={handlePagarPedido}
            variant="contained"
            disabled={submittingPago}
            sx={{ bgcolor: '#ff7a00', '&:hover': { bgcolor: '#f97316' }, fontWeight: 800, borderRadius: 2, px: 3 }}
          >
            {submittingPago ? 'Procesando...' : 'Confirmar pago'}
          </Button>
        </DialogActions>
      </Dialog>
    </Grid>
  );
}

export default SolicitudUniforme;
