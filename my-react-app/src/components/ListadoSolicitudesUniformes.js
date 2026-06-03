import React, { useCallback, useEffect, useState } from 'react';
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
  Menu,
  MenuItem,
  Paper,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CloseIcon from '@mui/icons-material/Close';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import VisibilityIcon from '@mui/icons-material/Visibility';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import DownloadIcon from '@mui/icons-material/Download';
import { mediaUrl } from '../utils/mediaUrl';
import { useSede } from '../context/SedeContext';
import { exportToExcel } from '../utils/exportExcel';

const ESTADO_LABELS = {
  pendiente: 'Pendiente',
  esperando_pago: 'Esperando pago',
  abono: 'Abono',
  pago_en_revision: 'Pago en revision',
  verificado: 'Verificado',
  entregado: 'Entregado',
  cancelado: 'Cancelado'
};

const ESTADO_STYLES = {
  pendiente: { bgcolor: '#e2e8f0', color: '#475569' },
  esperando_pago: { bgcolor: '#fef3c7', color: '#92400e' },
  abono: { bgcolor: '#ffedd5', color: '#9a3412' },
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
  const [comprobanteDialogOpen, setComprobanteDialogOpen] = useState(false);
  const [comprobanteUrl, setComprobanteUrl] = useState('');
  const [comprobanteTipo, setComprobanteTipo] = useState('imagen');
  const [pagina, setPagina] = useState(0);
  const [filasPorPagina, setFilasPorPagina] = useState(10);
  const [exportMenuAnchorEl, setExportMenuAnchorEl] = useState(null);

  const token = localStorage.getItem('token');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { sedeSeleccionada } = useSede();

  const formatMoney = (value) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
    return Number(value).toFixed(2);
  };

  const normalizarMoneda = (moneda) => String(moneda || 'USD').trim().toUpperCase() === 'EUR' ? 'EUR' : 'USD';
  const formatMoneyWithCurrency = (value, moneda) => `${normalizarMoneda(moneda)} ${formatMoney(value)}`;

  const parseFechaSinDesfase = (fecha) => {
    if (!fecha) return null;
    if (fecha instanceof Date) {
      return Number.isNaN(fecha.getTime()) ? null : fecha;
    }

    const raw = String(fecha).trim();
    const fechaBase = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
    if (fechaBase) {
      const year = Number(fechaBase[1]);
      const month = Number(fechaBase[2]) - 1;
      const day = Number(fechaBase[3]);
      const localDate = new Date(year, month, day);
      return Number.isNaN(localDate.getTime()) ? null : localDate;
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const formatFecha = (fecha) => {
    if (!fecha) return '-';
    const date = parseFechaSinDesfase(fecha);
    if (!date || Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('es-VE');
  };

  const formatTasaAplicada = (montoBs, montoDivisa, moneda) => {
    const bs = Number(montoBs);
    const divisa = Number(montoDivisa);
    if (!Number.isFinite(bs) || !Number.isFinite(divisa) || divisa <= 0) return '-';
    return `Bs ${formatMoney(bs / divisa)}/${normalizarMoneda(moneda)}`;
  };

  const getEstadoLabel = (estado) => ESTADO_LABELS[estado] || estado || '-';
  const getEstadoStyle = (estado) => ESTADO_STYLES[estado] || ESTADO_STYLES.pendiente;

  const pagosHistorialOrdenados = Array.isArray(pedidoSeleccionado?.pagos_historial)
    ? [...pedidoSeleccionado.pagos_historial].sort((a, b) => {
      const fechaA = parseFechaSinDesfase(a?.fecha_pago)?.getTime() || 0;
      const fechaB = parseFechaSinDesfase(b?.fecha_pago)?.getTime() || 0;
      return fechaA - fechaB;
    })
    : [];

  const ultimoPagoHistorial = pagosHistorialOrdenados.length > 0
    ? pagosHistorialOrdenados[pagosHistorialOrdenados.length - 1]
    : null;

  const ultimoPagoDetalle = (pedidoSeleccionado?.estado === 'pago_en_revision' || !ultimoPagoHistorial)
    ? {
        monto_pagado: pedidoSeleccionado?.monto_ultimo_pago || pedidoSeleccionado?.monto_pagado || 0,
        monto_pagado_bs: pedidoSeleccionado?.monto_ultimo_pago_bs,
        metodo_pago: pedidoSeleccionado?.metodo_pago,
        referencia: pedidoSeleccionado?.referencia,
        comprobante_url: pedidoSeleccionado?.comprobante_url,
        fecha_pago: pedidoSeleccionado?.fecha_pago
      }
    : ultimoPagoHistorial;

  const historialPagosAnteriores = pedidoSeleccionado?.estado === 'pago_en_revision'
    ? pagosHistorialOrdenados
    : pagosHistorialOrdenados.slice(0, -1);

  const pedidosPaginados = pedidos.slice(
    pagina * filasPorPagina,
    pagina * filasPorPagina + filasPorPagina
  );

  const buildExcelRows = (rows) => rows.map((pedido) => ({
    Alumno: pedido.alumno ? `${pedido.alumno.nombres || ''} ${pedido.alumno.apellidos || ''}`.trim() : '-',
    Prenda: pedido.prenda || '-',
    Talla: pedido.talla || '-',
    'Nombre deportivo': pedido.nombre_personalizado || '-',
    'Numero franela': pedido.numero_franela || '-'
  }));

  const exportPedidosExcel = async (mode) => {
    const baseRows = mode === 'verificados'
      ? pedidos.filter((pedido) => String(pedido.estado || '').toLowerCase() === 'verificado')
      : pedidos;

    const rows = buildExcelRows(baseRows);
    const suffix = mode === 'verificados' ? '_verificados' : '_todos';
    const sedeSuffix = sedeSeleccionada?.nombre
      ? `_${String(sedeSeleccionada.nombre).trim().replace(/\s+/g, '_')}`
      : '';
    const fileName = `solicitudes_uniformes${sedeSuffix}${suffix}.xlsx`;

    if (rows.length === 0) {
      setError(mode === 'verificados'
        ? 'No hay solicitudes verificadas para exportar.'
        : 'No hay solicitudes para exportar.');
      return;
    }

    await exportToExcel(rows, fileName, ['Alumno', 'Prenda', 'Talla', 'Nombre deportivo', 'Numero franela']);
    setSuccessMessage(mode === 'verificados'
      ? 'Excel de solicitudes verificadas exportado'
      : 'Excel de todas las solicitudes exportado');
  };

  const handleOpenExportMenu = (event) => {
    setExportMenuAnchorEl(event.currentTarget);
  };

  const handleCloseExportMenu = () => {
    setExportMenuAnchorEl(null);
  };

  const handleExportAll = async () => {
    handleCloseExportMenu();
    await exportPedidosExcel('all');
  };

  const handleExportVerified = async () => {
    handleCloseExportMenu();
    await exportPedidosExcel('verificados');
  };

  const montoTotalDivisa = Number(pedidoSeleccionado?.precio);
  const saldoPendienteDivisa = Number(pedidoSeleccionado?.saldo_pendiente);
  const usarSaldoRestanteComoEsperado = ['abono', 'pago_en_revision'].includes(pedidoSeleccionado?.estado)
    && Number.isFinite(saldoPendienteDivisa)
    && saldoPendienteDivisa > 0;
  const montoEsperadoDivisa = usarSaldoRestanteComoEsperado
    ? saldoPendienteDivisa
    : (Number.isFinite(montoTotalDivisa) ? montoTotalDivisa : 0);

  const tasaAplicadaNumero = (() => {
    const bs = Number(ultimoPagoDetalle?.monto_pagado_bs);
    const divisa = Number(ultimoPagoDetalle?.monto_pagado);
    if (!Number.isFinite(bs) || !Number.isFinite(divisa) || divisa <= 0) return null;
    return bs / divisa;
  })();

  const montoEsperadoBs = (() => {
    if (!Number.isFinite(montoEsperadoDivisa) || montoEsperadoDivisa <= 0 || !Number.isFinite(tasaAplicadaNumero)) return null;
    return montoEsperadoDivisa * tasaAplicadaNumero;
  })();

  const copiarReferencia = async (texto) => {
    try {
      if (!texto) return;
      await navigator.clipboard.writeText(String(texto));
      setSuccessMessage('Referencia copiada');
    } catch {
      setError('No se pudo copiar la referencia');
    }
  };

  const handleVerComprobante = (rawUrl) => {
    if (!rawUrl) return;
    const url = mediaUrl(rawUrl);
    const cleanUrl = String(url).split('?')[0].toLowerCase();
    setComprobanteTipo(cleanUrl.endsWith('.pdf') ? 'pdf' : 'imagen');
    setComprobanteUrl(url);
    setComprobanteDialogOpen(true);
  };

  const fetchPedidos = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (sedeSeleccionada?._id) params.set('sedeId', sedeSeleccionada._id);

      const query = params.toString();
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos${query ? `?${query}` : ''}`, {
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
  }, [sedeSeleccionada?._id, token]);

  useEffect(() => {
    fetchPedidos();
  }, [fetchPedidos]);

  useEffect(() => {
    if (pagina > 0 && pagina * filasPorPagina >= pedidos.length) {
      setPagina(0);
    }
  }, [pedidos.length, pagina, filasPorPagina]);

  const handleChangePagina = (_event, nuevaPagina) => {
    setPagina(nuevaPagina);
  };

  const handleChangeFilasPorPagina = (event) => {
    setFilasPorPagina(parseInt(event.target.value, 10));
    setPagina(0);
  };

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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, justifyContent: mobile ? 'flex-start' : 'center' }}>
          <Tooltip title="Solicitar pago">
            <IconButton
              size="small"
              onClick={() => openSolicitudPagoDialog(pedido)}
              aria-label="Solicitar pago"
              sx={{
                bgcolor: '#e9f2ff',
                color: '#1557a8',
                '&:hover': { bgcolor: '#dbeafe' }
              }}
            >
              <RequestQuoteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      );
    }

    if (pedido.estado === 'pago_en_revision' || pedido.estado === 'abono') {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, justifyContent: mobile ? 'flex-start' : 'center' }}>
          <Tooltip title="Ver detalle de pago">
            <IconButton
              size="small"
              onClick={() => openDetallePagoDialog(pedido)}
              aria-label="Ver detalle de pago"
              sx={{
                bgcolor: '#eef2ff',
                color: '#1d4ed8',
                '&:hover': { bgcolor: '#e0e7ff' }
              }}
            >
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      );
    }

    if (pedido.estado === 'verificado') {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, justifyContent: mobile ? 'flex-start' : 'center' }}>
          <Tooltip title="Ver detalle de pago">
            <IconButton
              size="small"
              onClick={() => openDetallePagoDialog(pedido)}
              aria-label="Ver detalle de pago"
              sx={{
                bgcolor: '#eef2ff',
                color: '#1d4ed8',
                '&:hover': { bgcolor: '#e0e7ff' }
              }}
            >
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={entregandoId === pedido._id ? 'Entregando...' : 'Marcar como entregado'}>
            <span>
              <IconButton
                size="small"
                disabled={entregandoId === pedido._id}
                onClick={() => setConfirmEntregarId(pedido._id)}
                aria-label="Marcar como entregado"
                sx={{
                  bgcolor: '#dcfce7',
                  color: '#166534',
                  '&:hover': { bgcolor: '#bbf7d0' },
                  '&:disabled': { bgcolor: '#e5e7eb', color: '#94a3b8' }
                }}
              >
                {entregandoId === pedido._id
                  ? <CircularProgress size={16} sx={{ color: '#166534' }} />
                  : <LocalShippingIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
        </Box>
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

      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 'bold' }}>Pedidos de Uniformes</Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            Lista de solicitudes de uniformes realizadas por los alumnos. Puedes solicitar pagos, verificar pagos pendientes y marcar prendas como entregadas desde esta sección.
          </Typography>
        </Box>

        <Box>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleOpenExportMenu}
            sx={{ borderColor: '#cbd5e1', color: '#0f172a', fontWeight: 700 }}
          >
            Exportar Excel
          </Button>
          <Menu
            anchorEl={exportMenuAnchorEl}
            open={Boolean(exportMenuAnchorEl)}
            onClose={handleCloseExportMenu}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <MenuItem onClick={handleExportAll}>Exportar todos los registros</MenuItem>
            <MenuItem onClick={handleExportVerified}>Exportar solo verificados</MenuItem>
          </Menu>
        </Box>
      </Box>
      {loading ? (
        <Typography>Cargando...</Typography>
      ) : error ? (
        <Typography color="error">{error}</Typography>
      ) : isMobile ? (
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          {pedidosPaginados.map((pedido) => (
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
                <Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Nombre:</b> {pedido.nombre_personalizado || '-'}</Typography>
                <Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Numero:</b> {pedido.numero_franela || '-'}</Typography>
                <Typography sx={{ fontSize: 12.5, color: '#0f172a' }}><b>Precio:</b> {formatMoneyWithCurrency(pedido.precio, pedido.moneda)}</Typography>
                <Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Fecha:</b> {formatFecha(pedido.createdAt)}</Typography>
                <Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Pagado:</b> {formatMoneyWithCurrency(pedido.monto_pagado, pedido.moneda)}</Typography>
                <Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Pendiente:</b> {formatMoneyWithCurrency(pedido.saldo_pendiente ?? pedido.precio, pedido.moneda)}</Typography>
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
                  <Button size="small" variant="text" onClick={() => handleVerComprobante(pedido.comprobante_url)}>
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
        <TableContainer
          component={Paper}
          sx={{
            mt: 3,
            borderRadius: 3,
            overflowX: 'auto',
            overflowY: 'hidden',
            maxWidth: '100%',
            boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)'
          }}
        >
          <Table sx={{ minWidth: 980 }}>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f8fafc' }}>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>ALUMNO</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>SEDE</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>PRENDA</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>TALLA</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>NOMBRE</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>NUMERO</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>PRECIO</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>FECHA</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>ESTADO</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>ACCION</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pedidosPaginados.map((pedido) => (
                <TableRow key={pedido._id} sx={{ '& td': { borderBottom: '1px solid #eef0f3', py: 2 }, '&:hover': { backgroundColor: '#fafafa' } }}>
                  <TableCell sx={{ fontWeight: 600, color: '#1f2937' }}>{pedido.alumno ? `${pedido.alumno.nombres} ${pedido.alumno.apellidos}` : '-'}</TableCell>
                  <TableCell sx={{ color: '#475569' }}>{pedido.sede?.nombre || '-'}</TableCell>
                  <TableCell sx={{ color: '#1f2937' }}>{pedido.prenda}</TableCell>
                  <TableCell sx={{ color: '#475569', fontWeight: 600 }}>{pedido.talla}</TableCell>
                  <TableCell sx={{ color: '#475569' }}>{pedido.nombre_personalizado || '-'}</TableCell>
                  <TableCell sx={{ color: '#475569' }}>{pedido.numero_franela || '-'}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#0f172a' }}>{formatMoneyWithCurrency(pedido.precio, pedido.moneda)}</TableCell>
                  <TableCell sx={{ color: '#475569', fontWeight: 600 }}>{formatFecha(pedido.createdAt)}</TableCell>
                  <TableCell>
                    <Chip label={getEstadoLabel(pedido.estado)} size="small" sx={{ ...getEstadoStyle(pedido.estado), fontWeight: 700 }} />
                  </TableCell>
                  <TableCell>
                    {renderAccion(pedido)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={pedidos.length}
            page={pagina}
            onPageChange={handleChangePagina}
            rowsPerPage={filasPorPagina}
            onRowsPerPageChange={handleChangeFilasPorPagina}
            rowsPerPageOptions={[5, 10, 25, 50]}
            labelRowsPerPage="Filas por página"
          />
        </TableContainer>
      )}

      <Dialog
        open={solicitudPagoOpen}
        onClose={closeSolicitudPagoDialog}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
      >
        <DialogTitle sx={{ bgcolor: '#f3f5fb', color: '#0b2a57', fontWeight: 800, fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <RequestQuoteIcon sx={{ fontSize: 20, color: '#1d4ed8' }} />
            <Typography sx={{ fontWeight: 800, fontSize: 17, color: '#0b2a57' }}>
              Solicitar pago
            </Typography>
          </Box>
          <IconButton size="small" onClick={closeSolicitudPagoDialog} disabled={submittingSolicitudPago} sx={{ color: '#6b7280' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ bgcolor: '#f3f5fb', pt: 2.5, pb: 2.5 }}>
          <Paper
            elevation={0}
            sx={{
              borderRadius: 2.5,
              border: '1px solid #e7eaf2',
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
              p: 2
            }}
          >
            <Box sx={{ display: 'grid', gap: 1.5 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 1 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', color: '#94a3b8', textTransform: 'uppercase' }}>
                  Alumno
                </Typography>
                <Typography sx={{ fontWeight: 700, color: '#0f172a' }}>
                  {pedidoSeleccionado?.alumno ? `${pedidoSeleccionado.alumno.nombres} ${pedidoSeleccionado.alumno.apellidos}` : '-'}
                </Typography>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 1 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', color: '#94a3b8', textTransform: 'uppercase' }}>
                  Prenda
                </Typography>
                <Typography sx={{ fontWeight: 700, color: '#334155' }}>
                  {pedidoSeleccionado?.prenda || '-'}
                </Typography>
              </Box>

              <TextField
                label={`Monto solicitado (${normalizarMoneda(pedidoSeleccionado?.moneda)})`}
                type="number"
                value={precioSolicitado}
                onChange={(event) => setPrecioSolicitado(event.target.value)}
                inputProps={{ min: 0, step: '0.01' }}
                sx={{
                  '& .MuiInputBase-root': {
                    bgcolor: '#ffffff',
                    borderRadius: 2
                  }
                }}
              />

              <Typography variant="body2" sx={{ color: '#64748b' }}>
                El monto viene desde la prenda configurada, pero puedes ajustarlo antes de confirmar la solicitud de pago.
              </Typography>
            </Box>
          </Paper>
        </DialogContent>
        <DialogActions sx={{ bgcolor: '#f3f5fb', px: 3, pb: 2.5, pt: 0.5 }}>
          <Button onClick={closeSolicitudPagoDialog} disabled={submittingSolicitudPago} sx={{ color: '#475569', textTransform: 'none', fontWeight: 700 }}>
            Cancelar
          </Button>
          <Button
            onClick={handleSolicitarPago}
            variant="contained"
            disabled={submittingSolicitudPago}
            sx={{ textTransform: 'none', fontWeight: 700, boxShadow: 'none', px: 2.2 }}
          >
            {submittingSolicitudPago ? 'Procesando...' : 'Confirmar solicitud'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={detallePagoOpen}
        onClose={closeDetallePagoDialog}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
      >
        <DialogTitle sx={{ bgcolor: '#f3f5fb', color: '#0b2a57', fontWeight: 800, fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 17, color: '#0b2a57' }}>
              Detalle del Pago -
            </Typography>
            <Typography sx={{ color: '#516b94', fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: { xs: 170, sm: 280 } }}>
              {pedidoSeleccionado?.alumno ? `${pedidoSeleccionado.alumno.nombres} ${pedidoSeleccionado.alumno.apellidos}` : '-'}
            </Typography>
          </Box>
          <IconButton size="small" onClick={closeDetallePagoDialog} sx={{ color: '#6b7280' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ bgcolor: '#f3f5fb', pt: 2.5, pb: 2.5 }}>
          {ultimoPagoDetalle ? (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <Box sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: '#dbeafe', color: '#0b2a57', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>✓</Box>
                <Typography sx={{ fontSize: { xs: 16, sm: 19 }, fontWeight: 900, color: '#0b2a57', lineHeight: 1.1 }}>Ultimo Pago Registrado</Typography>
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
                    <Typography sx={{ mt: 0.7, fontSize: { xs: 14, sm: 16 }, fontWeight: 800, color: '#0b2a57', lineHeight: 1.12 }}>{ultimoPagoDetalle?.metodo_pago || '-'}</Typography>
                  </Box>

                  <Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Monto pagado</Typography>
                    <Typography sx={{ mt: 0.7, fontSize: { xs: 17, sm: 20 }, fontWeight: 900, color: '#9a5a00', lineHeight: 1.1 }}>
                      {`Bs ${formatMoney(ultimoPagoDetalle?.monto_pagado_bs)} / ${formatMoneyWithCurrency(ultimoPagoDetalle?.monto_pagado, pedidoSeleccionado?.moneda)}`}
                    </Typography>
                  </Box>

                  <Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>
                      {usarSaldoRestanteComoEsperado ? 'Monto esperado (restante)' : 'Monto esperado'}
                    </Typography>
                    <Typography sx={{ mt: 0.7, fontSize: { xs: 15, sm: 17 }, fontWeight: 800, color: '#0b2a57', lineHeight: 1.12 }}>
                      {`Bs ${formatMoney(montoEsperadoBs)} / ${formatMoneyWithCurrency(montoEsperadoDivisa, pedidoSeleccionado?.moneda)}`}
                    </Typography>
                  </Box>

                  <Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Fecha de pago</Typography>
                    <Typography sx={{ mt: 0.7, fontSize: { xs: 15, sm: 17 }, fontWeight: 800, color: '#0b2a57', lineHeight: 1.12 }}>{formatFecha(ultimoPagoDetalle?.fecha_pago)}</Typography>
                  </Box>

                  <Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Tasa aplicada</Typography>
                    <Typography sx={{ mt: 0.7, fontSize: { xs: 15, sm: 17 }, fontWeight: 800, color: '#0b2a57', lineHeight: 1.12 }}>
                      {formatTasaAplicada(ultimoPagoDetalle?.monto_pagado_bs, ultimoPagoDetalle?.monto_pagado, pedidoSeleccionado?.moneda)}
                    </Typography>
                  </Box>

                  <Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Referencia</Typography>
                    <Box sx={{ mt: 0.7, display: 'flex', alignItems: 'center', gap: 0.4 }}>
                      <Typography sx={{ fontSize: { xs: 15, sm: 17 }, fontWeight: 800, color: '#4c6690', lineHeight: 1.12 }}>{ultimoPagoDetalle?.referencia || '-'}</Typography>
                      {ultimoPagoDetalle?.referencia && (
                        <IconButton size="small" onClick={() => copiarReferencia(ultimoPagoDetalle.referencia)} sx={{ color: '#95a2b6' }}>
                          <ContentCopyIcon fontSize="inherit" />
                        </IconButton>
                      )}
                    </Box>
                  </Box>

                  <Box>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Comprobante</Typography>
                    {ultimoPagoDetalle?.comprobante_url ? (
                      <Button
                        variant="text"
                        onClick={() => handleVerComprobante(ultimoPagoDetalle.comprobante_url)}
                        sx={{ mt: 0.35, px: 0, color: '#ff8a00', fontWeight: 900, textTransform: 'none', fontSize: { xs: 14, sm: 16 } }}
                      >
                        Ver Archivo Digital
                      </Button>
                    ) : (
                      <Typography sx={{ mt: 0.7, color: '#9ca3af', fontWeight: 700 }}>Sin comprobante</Typography>
                    )}
                  </Box>
                </Box>
              </Box>
            </>
          ) : (
            <Typography sx={{ color: '#334155' }}>No hay informacion de pago registrada.</Typography>
          )}

          {historialPagosAnteriores.length > 0 && (
            <Box sx={{ mt: 3.25 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.25 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <HistoryRoundedIcon sx={{ color: '#8ea0bc', fontSize: 19 }} />
                  <Typography sx={{ fontSize: { xs: 16, sm: 19 }, fontWeight: 900, color: '#0b2a57', lineHeight: 1.15 }}>
                    Historial de pagos
                  </Typography>
                </Box>
                <Chip label={`${historialPagosAnteriores.length} total`} size="small" sx={{ bgcolor: '#d9e4f7', color: '#4b6ca7', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }} />
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {historialPagosAnteriores.map((pago, idx) => (
                  <Box
                    key={`${pago?._id || pago?.fecha_pago || 'pago'}-${idx}`}
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
                      <Typography sx={{ fontWeight: 800, color: '#0b2a57', mt: 0.25 }}>{pago?.metodo_pago || '-'}</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Monto</Typography>
                      <Typography sx={{ fontWeight: 900, color: '#0b2a57', mt: 0.25 }}>${formatMoney(pago?.monto_pagado)}</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Fecha</Typography>
                      <Typography sx={{ color: '#334155', mt: 0.25 }}>{formatFecha(pago?.fecha_pago)}</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Referencia</Typography>
                      <Typography sx={{ color: '#4c6690', fontWeight: 700, mt: 0.25 }}>{pago?.referencia || '-'}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.6, justifyContent: { xs: 'flex-start', md: 'flex-end' }, alignItems: 'center', height: '100%' }}>
                      {pago?.referencia && (
                        <IconButton size="small" onClick={() => copiarReferencia(pago.referencia)} sx={{ bgcolor: '#f3f4f6', '&:hover': { bgcolor: '#e9edf3' } }}>
                          <ContentCopyIcon fontSize="small" sx={{ color: '#4b5563' }} />
                        </IconButton>
                      )}
                      {pago?.comprobante_url && (
                        <Button
                          variant="text"
                          size="small"
                          onClick={() => handleVerComprobante(pago.comprobante_url)}
                          sx={{ color: '#ff8a00', fontWeight: 800, textTransform: 'none' }}
                        >
                          Ver comprobante
                        </Button>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.25, bgcolor: '#f3f5fb', justifyContent: 'flex-end' }}>
          <Button onClick={closeDetallePagoDialog} variant="text" sx={{ color: '#516b94', fontWeight: 800 }} disabled={submittingVerificacion}>
            Volver
          </Button>
          {pedidoSeleccionado?.estado === 'pago_en_revision' && (
            <Button onClick={handleVerificarPago} variant="contained" disabled={submittingVerificacion}>
              {submittingVerificacion ? 'Procesando...' : 'Confirmar pago'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={comprobanteDialogOpen} onClose={() => setComprobanteDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Comprobante</DialogTitle>
        <DialogContent>
          {comprobanteUrl ? (
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              {comprobanteTipo === 'pdf' ? (
                <iframe
                  src={comprobanteUrl}
                  title="Comprobante"
                  style={{ width: '100%', height: '70vh', border: 'none' }}
                />
              ) : (
                <img src={comprobanteUrl} alt="Comprobante" style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8 }} />
              )}
            </Box>
          ) : (
            <Typography>No hay comprobante disponible.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setComprobanteDialogOpen(false)}>Cerrar</Button>
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
