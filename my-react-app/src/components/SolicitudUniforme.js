import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
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
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import { useDolar } from '../context/DolarContext';
import { mediaUrl } from '../utils/mediaUrl';

const TALLAS = ['S', 'M', 'L', 'XL', 'XXL', '6', '8', '10', '12', '14', '16'];
const METODO_PAGO_DEFAULT = '';

function buildPaymentMethods(config) {
  return [
    {
      id: 'Pago movil',
      nombre: 'Pago Movil',
      detalles: {
        banco: config?.pago_movil?.banco || '',
        telefono: config?.pago_movil?.telefono || '',
        cedula: config?.pago_movil?.cedula || '',
        titular: config?.pago_movil?.titular || ''
      }
    },
    {
      id: 'Transferencia',
      nombre: 'Transferencia',
      detalles: {
        banco: config?.transferencia?.banco || '',
        cuenta: config?.transferencia?.cuenta || '',
        titular: config?.transferencia?.titular || '',
        cedula: config?.transferencia?.cedula || ''
      }
    }
  ];
}
const OPCIONES_NOMBRE_REPRESENTANTE = [
  'Volley Mom',
  'Volley Dad',
  'Volley Grandmom',
  'Volley Granddad',
  'Volley Sister',
  'Volley Brother'
];

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
  entregado: { bgcolor: '#ccfbf1', color: '#0f766e' },
  cancelado: { bgcolor: '#fee2e2', color: '#b91c1c' }
};

const getLocalInputDate = (dateValue = new Date()) => {
  const date = new Date(dateValue);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};

function construirNombrePersonalizado(alumno) {
  const apellidos = String(alumno?.apellidos || '').trim();
  const nombres = String(alumno?.nombres || '').trim();

  const primerApellido = apellidos.split(/\s+/).filter(Boolean)[0] || '';
  const primerNombre = nombres.split(/\s+/).filter(Boolean)[0] || '';

  const apellidoUpper = primerApellido.toUpperCase();
  const inicialNombre = primerNombre ? primerNombre.charAt(0).toUpperCase() : '';

  if (!apellidoUpper && !inicialNombre) return '';
  if (!apellidoUpper) return inicialNombre;
  if (!inicialNombre) return apellidoUpper;
  return `${apellidoUpper} ${inicialNombre}`;
}

function construirEjemploNombreJugador(alumno) {
  const nombres = String(alumno?.nombres || '').trim();
  const apellidos = String(alumno?.apellidos || '').trim();

  const primerNombre = nombres.split(/\s+/).filter(Boolean)[0] || '';
  const primerApellido = apellidos.split(/\s+/).filter(Boolean)[0] || '';
  const inicialApellido = primerApellido ? `${primerApellido.charAt(0).toUpperCase()}.` : '';

  if (primerNombre && inicialApellido) return `${primerNombre} ${inicialApellido}`;
  if (primerNombre) return primerNombre;
  if (inicialApellido) return inicialApellido;
  return 'Nombre A.';
}

function SolicitudUniforme({ alumno, sede, onGuardar }) {
  const { dolar } = useDolar();
  const [prendas, setPrendas] = useState([]);
  const [prendasLoading, setPrendasLoading] = useState(false);
  const [prendasError, setPrendasError] = useState('');
  const [prenda, setPrenda] = useState('');
  const [talla, setTalla] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [pedidos, setPedidos] = useState([]);
  const [pedidosLoading, setPedidosLoading] = useState(false);
  const [cancelandoId, setCancelandoId] = useState(null);
  const [confirmCancelId, setConfirmCancelId] = useState(null);
  const [pagoDialogOpen, setPagoDialogOpen] = useState(false);
  const [pedidoPago, setPedidoPago] = useState(null);
  const [metodoPago, setMetodoPago] = useState(METODO_PAGO_DEFAULT);
  const [paymentConfig, setPaymentConfig] = useState(null);
  const [loadingMetodosPago, setLoadingMetodosPago] = useState(false);
  const [errorMetodosPago, setErrorMetodosPago] = useState('');
  const metodosPagoUniforme = buildPaymentMethods(paymentConfig);
  const metodoPagoConfig = metodosPagoUniforme.find((item) => item.id === metodoPago) || null;
  const [fechaPago, setFechaPago] = useState(() => getLocalInputDate());
  const [montoPagado, setMontoPagado] = useState('');
  const [montoPagadoBsConfirmacion, setMontoPagadoBsConfirmacion] = useState('');
  const [referencia, setReferencia] = useState('');
  const [comprobante, setComprobante] = useState(null);
  const [copySuccess, setCopySuccess] = useState('');
  const [mostrarConfirmacionPago, setMostrarConfirmacionPago] = useState(false);
  const [submittingPago, setSubmittingPago] = useState(false);
  const [numeroFranelaAsignado, setNumeroFranelaAsignado] = useState(() => String(alumno?.numero_franela ?? alumno?.numeroFranela ?? '').trim());
  const [numeroFranelaSeleccionado, setNumeroFranelaSeleccionado] = useState('');
  const [numerosFranelaDisponibles, setNumerosFranelaDisponibles] = useState([]);
  const [numeroFranelaLoading, setNumeroFranelaLoading] = useState(false);
  const [numeroFranelaError, setNumeroFranelaError] = useState('');
  const [mostrarImagenesPrenda, setMostrarImagenesPrenda] = useState(false);

  const tasaBCV = Number(dolar?.promedio) || 0;
  const token = localStorage.getItem('token');
  const numeroFranelaAlumno = String(numeroFranelaAsignado || '').trim();
  const categoriaAlumno = String(alumno?.categoria || '').trim();
  const nombrePersonalizadoDefault = construirNombrePersonalizado(alumno);
  const ejemploNombreJugador = construirEjemploNombreJugador(alumno);
  const [nombrePersonalizadoInput, setNombrePersonalizadoInput] = useState(nombrePersonalizadoDefault);
  const prendaSeleccionada = prendas.find((item) => item.prenda === prenda);
  const esFranelaRepresentante = Boolean(prendaSeleccionada?.franela_representante);
  const permiteEditarNombrePersonalizado = Boolean(prendaSeleccionada?.lleva_personalizacion_nombre);
  const usaSelectorNombreRepresentante = esFranelaRepresentante && prendaSeleccionada?.lleva_personalizacion_nombre === false;
  const ocultarNumeroFranela = Boolean(prendaSeleccionada) && prendaSeleccionada.lleva_numero_franela === false;
  const requiereNumeroFranela = !ocultarNumeroFranela;

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

  const fetchPrendas = useCallback(async () => {
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
  }, []);

  const fetchPedidos = useCallback(async () => {
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
  }, [alumno?._id, token]);

  useEffect(() => {
    fetchPrendas();
  }, [fetchPrendas]);

  useEffect(() => {
    fetchPedidos();
  }, [fetchPedidos]);

  useEffect(() => {
    setMostrarImagenesPrenda(false);
  }, [prenda]);

  useEffect(() => {
    if (!pagoDialogOpen) return;

    let cancelled = false;

    const fetchMetodosPago = async () => {
      try {
        setLoadingMetodosPago(true);
        setErrorMetodosPago('');
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/configuracion/pagos`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || data?.msg || 'No se pudo cargar la configuracion de pago');

        if (!cancelled) {
          setPaymentConfig(data?.pagos || null);
        }
      } catch (err) {
        if (!cancelled) {
          setPaymentConfig(null);
          setErrorMetodosPago(err.message || 'No se pudo cargar la configuracion de pago');
        }
      } finally {
        if (!cancelled) {
          setLoadingMetodosPago(false);
        }
      }
    };

    fetchMetodosPago();

    return () => {
      cancelled = true;
    };
  }, [pagoDialogOpen, token]);

  useEffect(() => {
    setNumeroFranelaAsignado(String(alumno?.numero_franela ?? alumno?.numeroFranela ?? '').trim());
    setNumeroFranelaSeleccionado('');
    setNumeroFranelaError('');
    setNumerosFranelaDisponibles([]);
  }, [alumno?._id, alumno?.numero_franela, alumno?.numeroFranela]);

  useEffect(() => {
    if (permiteEditarNombrePersonalizado || usaSelectorNombreRepresentante) {
      setNombrePersonalizadoInput('');
      return;
    }

    setNombrePersonalizadoInput(nombrePersonalizadoDefault);
  }, [nombrePersonalizadoDefault, permiteEditarNombrePersonalizado, usaSelectorNombreRepresentante]);

  useEffect(() => {
    if (!requiereNumeroFranela) {
      setNumeroFranelaError('');
      setNumeroFranelaLoading(false);
      setNumeroFranelaSeleccionado('');
      return;
    }

    const categoriaNormalizada = String(categoriaAlumno || '').trim().toUpperCase();

    if (numeroFranelaAlumno) {
      setNumeroFranelaError('');
      setNumerosFranelaDisponibles([]);
      setNumeroFranelaLoading(false);
      return;
    }

    if (!categoriaNormalizada) {
      setNumeroFranelaError('El alumno no tiene categoria asignada para mostrar numeros disponibles.');
      setNumerosFranelaDisponibles([]);
      setNumeroFranelaLoading(false);
      return;
    }

    let cancelled = false;

    const cargarDisponibilidad = async () => {
      try {
        setNumeroFranelaLoading(true);
        setNumeroFranelaError('');
        const res = await fetch(
          `${process.env.REACT_APP_API_URL}/api/alumnos/numeros-franela/disponibilidad?categoria=${encodeURIComponent(categoriaNormalizada)}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'No se pudo cargar la disponibilidad de nro de franela.');

        if (!cancelled) {
          const disponibles = Array.isArray(data?.disponibles) ? data.disponibles : [];
          setNumerosFranelaDisponibles(disponibles);
          if (disponibles.length === 0) {
            setNumeroFranelaError(`No hay numeros de franela disponibles para la categoria ${categoriaNormalizada}.`);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setNumerosFranelaDisponibles([]);
          setNumeroFranelaError(err.message || 'No se pudo cargar la disponibilidad de nro de franela.');
        }
      } finally {
        if (!cancelled) {
          setNumeroFranelaLoading(false);
        }
      }
    };

    cargarDisponibilidad();

    return () => {
      cancelled = true;
    };
  }, [categoriaAlumno, numeroFranelaAlumno, requiereNumeroFranela, token]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!prenda || !talla) {
      setErrorMessage('Completa todos los campos del pedido');
      return;
    }
    const numeroFranelaFinal = numeroFranelaAlumno || String(numeroFranelaSeleccionado || '').trim();

    if (requiereNumeroFranela && !numeroFranelaFinal) {
      setErrorMessage('Debes seleccionar un numero de franela para continuar');
      return;
    }

    if (usaSelectorNombreRepresentante && !String(nombrePersonalizadoInput || '').trim()) {
      setErrorMessage('Debes seleccionar el nombre para la franela de representante');
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
      formData.append('nombrePersonalizado', String(nombrePersonalizadoInput || '').trim());
      if (requiereNumeroFranela && numeroFranelaFinal) {
        formData.append('numeroFranela', numeroFranelaFinal);
      }

      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al guardar el pedido');

      setPrenda('');
      setTalla('');
      if (requiereNumeroFranela && !numeroFranelaAlumno) {
        setNumeroFranelaAsignado(numeroFranelaFinal);
      }
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
    setMetodoPago(METODO_PAGO_DEFAULT);
    setFechaPago(getLocalInputDate());
    const saldoPendiente = Number(pedido?.saldo_pendiente);
    const totalPedido = Number(pedido?.precio) || 0;
    const montoSugerido = Number.isFinite(saldoPendiente) && saldoPendiente > 0 ? saldoPendiente : totalPedido;
    setMontoPagado(montoSugerido > 0 ? String(montoSugerido) : '');
    setMontoPagadoBsConfirmacion('');
    setReferencia('');
    setComprobante(null);
    setCopySuccess('');
    setMostrarConfirmacionPago(false);
    setPagoDialogOpen(true);
  };

  const closePagoDialog = () => {
    if (submittingPago) return;
    setPagoDialogOpen(false);
    setPedidoPago(null);
    setMetodoPago(METODO_PAGO_DEFAULT);
    setFechaPago(getLocalInputDate());
    setMontoPagado('');
    setMontoPagadoBsConfirmacion('');
    setReferencia('');
    setComprobante(null);
    setCopySuccess('');
    setMostrarConfirmacionPago(false);
  };

  const formatearValorDetallePago = (clave, valor) => {
    if (clave === 'cedula') {
      const base = String(valor || '').replace(/^V-?/i, '').trim();
      return base ? `V-${base}` : '-';
    }
    if (clave === 'telefono') {
      const digits = String(valor || '').replace(/\D/g, '');
      if (!digits) return '-';
      if (digits.length <= 4) return digits;
      return `${digits.slice(0, 4)}-${digits.slice(4)}`;
    }
    if (clave === 'cuenta') {
      const digits = String(valor || '').replace(/\D/g, '');
      if (!digits) return '-';
      return digits.match(/.{1,4}/g)?.join('-') || digits;
    }
    return String(valor || '-');
  };

  const copiarDatoPago = async (clave, valor) => {
    const valorFormateado = formatearValorDetallePago(clave, valor);
    const soloDigitos = String(valor || '').replace(/\D/g, '');
    const textoParaCopiar = (clave === 'cedula' || clave === 'cuenta' || clave === 'telefono')
      ? soloDigitos
      : String(valorFormateado || '');

    if (!textoParaCopiar || textoParaCopiar === '-') return;

    try {
      await navigator.clipboard.writeText(textoParaCopiar);
      setCopySuccess(`${String(clave || '').replace('_', ' ')} copiado`);
      setTimeout(() => setCopySuccess(''), 1800);
    } catch {
      setCopySuccess('No se pudo copiar');
      setTimeout(() => setCopySuccess(''), 1800);
    }
  };

  const handleYaPagueClick = () => {
    if (!metodoPago) {
      setErrorMessage('Debes seleccionar un metodo de pago');
      return;
    }
    const montoPagadoNum = Number(montoPagado);
    const saldoValido = Number(getSaldoPendienteVisible(pedidoPago)) || 0;

    if (!montoPagadoNum || Number.isNaN(montoPagadoNum) || montoPagadoNum <= 0) {
      setErrorMessage('Debes indicar un monto pagado valido');
      return;
    }

    if (saldoValido > 0 && montoPagadoNum > saldoValido) {
      setErrorMessage(`El monto pagado no puede superar el saldo pendiente ($${formatMoney(saldoValido)})`);
      return;
    }

    setMontoPagadoBsConfirmacion(montoPagadoBsInput !== null && Number.isFinite(montoPagadoBsInput) ? formatMoney(montoPagadoBsInput) : '');
    setMostrarConfirmacionPago(true);
  };

  const handlePagarPedido = async () => {
    if (!pedidoPago?._id) return;
    if (!metodoPago) {
      setErrorMessage('Debes seleccionar un metodo de pago');
      return;
    }
    if ((metodoPago === 'Transferencia' || metodoPago === 'Pago movil') && !/^[0-9]{6,}$/.test(referencia)) {
      setErrorMessage('La referencia debe tener minimo 6 digitos');
      return;
    }

    if (!fechaPago) {
      setErrorMessage('Debes indicar la fecha del pago');
      return;
    }

    const montoPagadoBsNum = Number(montoPagadoBsConfirmacion);
    const montoPagadoNum = tasaBCV > 0 ? (montoPagadoBsNum / tasaBCV) : Number(montoPagado);
    const saldoPendiente = Number(pedidoPago?.saldo_pendiente);
    const totalPedido = Number(pedidoPago?.precio) || 0;
    const saldoValido = Number.isFinite(saldoPendiente) && saldoPendiente > 0 ? saldoPendiente : totalPedido;

    if (tasaBCV <= 0) {
      setErrorMessage('No hay tasa BCV disponible para convertir el monto en Bs');
      return;
    }

    if (!montoPagadoBsNum || Number.isNaN(montoPagadoBsNum) || montoPagadoBsNum <= 0) {
      setErrorMessage('Debes indicar un monto pagado en Bs valido');
      return;
    }

    if (!montoPagadoNum || Number.isNaN(montoPagadoNum) || montoPagadoNum <= 0) {
      setErrorMessage('Debes indicar un monto pagado valido');
      return;
    }

    if (montoPagadoNum > saldoValido) {
      setErrorMessage(`El monto pagado no puede superar el saldo pendiente ($${formatMoney(saldoValido)})`);
      return;
    }

    try {
      setSubmittingPago(true);
      const formData = new FormData();
      formData.append('metodo_pago', metodoPago);
      formData.append('monto_pagado', montoPagadoNum.toFixed(2));
      formData.append('monto_pagado_bs', montoPagadoBsNum.toFixed(2));
      if (referencia) formData.append('referencia', referencia);
      formData.append('fecha_pago', fechaPago);
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
      setMetodoPago(METODO_PAGO_DEFAULT);
      setFechaPago(getLocalInputDate());
      setMontoPagado('');
      setMontoPagadoBsConfirmacion('');
      setReferencia('');
      setComprobante(null);
      setCopySuccess('');
      setMostrarConfirmacionPago(false);
      setSuccessMessage(
        data?.estado === 'abono'
          ? `Abono registrado. Saldo pendiente: $${formatMoney(data?.saldo_pendiente)}`
          : data?.estado === 'pago_en_revision'
            ? 'Pago enviado a revision'
            : 'Pago registrado correctamente'
      );
    } catch (err) {
      setErrorMessage(err.message || 'Error al registrar el pago');
    } finally {
      setSubmittingPago(false);
    }
  };

  const montoPagoBs = pedidoPago?.precio && tasaBCV ? Number(pedidoPago.precio) * tasaBCV : null;
  const montoPagadoBsInput = montoPagado && tasaBCV ? Number(montoPagado) * tasaBCV : null;

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

  const getSaldoPendienteVisible = (pedido) => {
    const saldo = Number(pedido?.saldo_pendiente);
    const precio = Number(pedido?.precio) || 0;
    if (Number.isFinite(saldo) && saldo > 0) return saldo;
    if (pedido?.estado === 'esperando_pago' || pedido?.estado === 'abono' || pedido?.estado === 'pago_en_revision') {
      return precio;
    }
    return 0;
  };

  return (
    <Grid container justifyContent="center" alignItems="flex-start" sx={{ minHeight: '80vh', py: { xs: 2, md: 3 } }}>
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
          <Paper elevation={4} sx={{ p: { xs: 2, sm: 3, md: 4 }, borderRadius: 3 }}>
            <Typography variant="h5" gutterBottom align="center" fontWeight={700}>
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
                        <MenuItem key={item._id} value={item.prenda}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
                            {item.fotos?.[0] ? (
                              <Box
                                component="img"
                                src={mediaUrl(item.fotos[0])}
                                alt={item.prenda}
                                sx={{
                                  width: 34,
                                  height: 34,
                                  borderRadius: 1.5,
                                  objectFit: 'cover',
                                  border: '1px solid #dbe3ef',
                                  flexShrink: 0,
                                  backgroundColor: '#fff'
                                }}
                              />
                            ) : (
                              <Box
                                sx={{
                                  width: 34,
                                  height: 34,
                                  borderRadius: 1.5,
                                  border: '1px dashed #cbd5e1',
                                  flexShrink: 0,
                                  backgroundColor: '#f8fafc'
                                }}
                              />
                            )}
                            <Typography sx={{ fontSize: 14, color: '#0f172a', whiteSpace: 'normal', lineHeight: 1.25 }}>
                              {item.prenda} - ${formatMoney(item.precio)}
                            </Typography>
                          </Box>
                        </MenuItem>
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
                  {usaSelectorNombreRepresentante ? (
                    <FormControl fullWidth required>
                      <InputLabel id="nombre-representante-label">Nombre para franela</InputLabel>
                      <Select
                        labelId="nombre-representante-label"
                        value={nombrePersonalizadoInput}
                        label="Nombre para franela"
                        onChange={(event) => setNombrePersonalizadoInput(event.target.value)}
                      >
                        <MenuItem value=""><em>Seleccione</em></MenuItem>
                        {OPCIONES_NOMBRE_REPRESENTANTE.map((opcion) => (
                          <MenuItem key={opcion} value={opcion}>{opcion}</MenuItem>
                        ))}
                      </Select>
                      <Typography variant="caption" sx={{ mt: 0.6, color: '#64748b', display: 'block' }}>
                        Selecciona el texto que llevara la franela del representante
                      </Typography>
                    </FormControl>
                  ) : (
                    <TextField
                      fullWidth
                      label="Nombre personalizado"
                      placeholder={!esFranelaRepresentante ? `Ej: ${ejemploNombreJugador}` : ''}
                      value={nombrePersonalizadoInput}
                      onChange={(event) => setNombrePersonalizadoInput(event.target.value)}
                      disabled={!permiteEditarNombrePersonalizado}
                      sx={{
                        '& .MuiInputBase-input.Mui-disabled': {
                          WebkitTextFillColor: '#64748b'
                        },
                        '& .MuiOutlinedInput-root.Mui-disabled': {
                          backgroundColor: '#fdfdfd'
                        }
                      }}
                      helperText={permiteEditarNombrePersonalizado
                        ? (esFranelaRepresentante
                          ? 'Escribe el nombre personalizado para la franela'
                          : `Ejemplo: ${ejemploNombreJugador}`)
                        : 'Sugerido: primer apellido + inicial del primer nombre'}
                    />
                  )}
                </Grid>
                {requiereNumeroFranela && (
                  <Grid item size={{ xs: 12, md: 6 }}>
                    {numeroFranelaAlumno ? (
                      <TextField
                        fullWidth
                        label="Numero de franela"
                        value={numeroFranelaAlumno}
                        disabled
                        sx={{
                          '& .MuiInputBase-input.Mui-disabled': {
                            WebkitTextFillColor: '#64748b'
                          },
                          '& .MuiOutlinedInput-root.Mui-disabled': {
                            backgroundColor: '#fdfdfd'
                          }
                        }}
                        helperText="Se usa el numero asignado en la ficha del alumno"
                      />
                    ) : (
                      <FormControl fullWidth required error={!!numeroFranelaError && !numeroFranelaLoading}>
                        <InputLabel id="numero-franela-label">Numero de franela</InputLabel>
                        <Select
                          labelId="numero-franela-label"
                          value={numeroFranelaSeleccionado}
                          label="Numero de franela"
                          onChange={(event) => setNumeroFranelaSeleccionado(event.target.value)}
                          disabled={numeroFranelaLoading || numerosFranelaDisponibles.length === 0}
                        >
                          <MenuItem value=""><em>Seleccione</em></MenuItem>
                          {numerosFranelaDisponibles.map((numero) => (
                            <MenuItem key={numero} value={String(numero)}>{numero}</MenuItem>
                          ))}
                        </Select>
                        <Typography variant="caption" sx={{ mt: 0.6, color: numeroFranelaError ? '#d32f2f' : '#64748b', display: 'block' }}>
                          {numeroFranelaLoading
                            ? 'Cargando numeros disponibles por categoria...'
                            : (numeroFranelaError || `Disponibles: ${numerosFranelaDisponibles.length} de 100 en ${String(categoriaAlumno || '').toUpperCase()}`)}
                        </Typography>
                      </FormControl>
                    )}
                  </Grid>
                )}
                {Array.isArray(prendaSeleccionada?.fotos) && prendaSeleccionada.fotos.length > 0 && (
                  <Grid item size={{ xs: 12 }}>
                    <Box sx={{ display: 'flex', justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
                      <Button
                        type="button"
                        variant="outlined"
                        onClick={() => setMostrarImagenesPrenda(true)}
                        sx={{
                          border: '2px solid #cbd5e1',
                          borderRadius: '10px',
                          fontWeight: 700,
                          color: '#64748b',
                          px: 2.5,
                          py: 1,
                          textTransform: 'none',
                          boxShadow: 'none',
                          minWidth: 0,
                          transition: 'border-color 0.2s',
                          '&:hover': {
                            borderColor: '#94a3b8',
                            bgcolor: '#f8fafc',
                            color: '#334155'
                          }
                        }}
                      >
                        Imágenes de la prenda
                      </Button>
                    </Box>
                  </Grid>
                )}
              </Grid>
              {prendasError && (
                <Typography variant="body2" color="error" sx={{ mb: 2 }}>
                  {prendasError}
                </Typography>
              )}
              <Button
                type="submit"
                variant="contained"
                color="primary"
                fullWidth
                size="large"
                disabled={guardando || (usaSelectorNombreRepresentante && !String(nombrePersonalizadoInput || '').trim()) || (requiereNumeroFranela && (!numeroFranelaAlumno && !numeroFranelaSeleccionado)) || (requiereNumeroFranela && numeroFranelaLoading) || (requiereNumeroFranela && !!numeroFranelaError)}
              >
                {guardando ? 'Guardando...' : 'Guardar pedido'}
              </Button>
            </Box>
          </Paper>

          <Paper elevation={3} sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
              Solicitudes de uniformes del alumno
            </Typography>
            {pedidosLoading ? (
              <Typography>Cargando solicitudes...</Typography>
            ) : pedidos.length === 0 ? (
              <Typography color="text.secondary">No hay solicitudes registradas para este alumno.</Typography>
            ) : (
              <>
                <Box sx={{ display: { xs: 'grid', md: 'none' }, gap: 1.5 }}>
                  {pedidos.map((pedido) => (
                    <Box
                      key={pedido._id}
                      sx={{
                        border: '1px solid #e2e8f0',
                        borderRadius: 2.5,
                        p: 1.5,
                        backgroundColor: '#ffffff',
                        boxShadow: '0 6px 16px rgba(15, 23, 42, 0.06)'
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
                        <Typography sx={{ fontWeight: 800, color: '#0f172a' }}>
                          {pedido.prenda} - {pedido.talla}
                        </Typography>
                        <Chip
                          label={getEstadoLabel(pedido.estado)}
                          size="small"
                          sx={{
                            ...getEstadoStyle(pedido.estado),
                            fontWeight: 700
                          }}
                        />
                      </Box>

                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 1 }}>
                        <Box>
                          <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>Nombre</Typography>
                          <Typography variant="body2" sx={{ color: '#0f172a' }}>{pedido.nombre_personalizado || '-'}</Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>Numero</Typography>
                          <Typography variant="body2" sx={{ color: '#0f172a' }}>{pedido.numero_franela || '-'}</Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>Fecha</Typography>
                          <Typography variant="body2" sx={{ color: '#0f172a' }}>{formatFecha(pedido.fecha_pago || pedido.createdAt)}</Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>Pago</Typography>
                          <Typography variant="body2" sx={{ color: '#0f172a' }}>
                            {pedido.metodo_pago ? `${pedido.metodo_pago} | Ref: ${pedido.referencia || '-'}` : '-'}
                          </Typography>
                        </Box>
                      </Box>

                      <Box sx={{ mb: 1 }}>
                        <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>Precio</Typography>
                        <Typography sx={{ fontWeight: 800, color: '#0f172a' }}>${formatMoney(pedido.precio)}</Typography>
                        <Typography variant="body2" sx={{ color: '#64748b' }}>
                          Saldo pendiente: ${formatMoney(getSaldoPendienteVisible(pedido))}
                        </Typography>
                        {tasaBCV ? (
                          <Typography variant="body2" sx={{ color: '#64748b' }}>
                            Bs. {formatMoney(Number(pedido.precio) * tasaBCV)}
                          </Typography>
                        ) : null}
                      </Box>

                      {(pedido.estado === 'esperando_pago' || pedido.estado === 'abono') ? (
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
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
                        <Box sx={{ display: 'grid', gap: 1 }}>
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
                            : pedido.estado === 'abono'
                              ? `Abono registrado. Saldo pendiente: $${formatMoney(getSaldoPendienteVisible(pedido))}`
                            : pedido.estado === 'pago_en_revision'
                              ? 'Pago enviado, en revision'
                              : pedido.estado === 'verificado'
                                ? 'Pago verificado. En espera de entrega'
                                : pedido.estado === 'entregado'
                                  ? 'Prenda entregada'
                                  : 'Sin acciones disponibles'}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Box>

                <TableContainer sx={{ display: { xs: 'none', md: 'block' } }}>
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
                            <Typography variant="body2" sx={{ color: '#64748b' }}>
                              Pendiente: ${formatMoney(getSaldoPendienteVisible(pedido))}
                            </Typography>
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
                            {(pedido.estado === 'esperando_pago' || pedido.estado === 'abono') ? (
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
                                  : pedido.estado === 'abono'
                                    ? `Abono registrado. Saldo pendiente: $${formatMoney(getSaldoPendienteVisible(pedido))}`
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
              </>
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
        open={mostrarImagenesPrenda}
        onClose={() => setMostrarImagenesPrenda(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0f172a', pr: 6 }}>
          Imagen{prendaSeleccionada?.fotos?.length > 1 ? 'es' : ''} de la prenda
          <IconButton
            aria-label="cerrar imagenes de la prenda"
            onClick={() => setMostrarImagenesPrenda(false)}
            size="small"
            sx={{ position: 'absolute', right: 14, top: 14, color: '#64748b' }}
          >
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 2, bgcolor: '#f8fafc' }}>
          <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap', justifyContent: 'center' }}>
            {(prendaSeleccionada?.fotos || []).map((foto, index) => (
              <Box
                key={`${prendaSeleccionada?._id || prendaSeleccionada?.prenda || 'prenda'}-dialog-foto-${index}`}
                component="img"
                src={mediaUrl(foto)}
                alt={`${prendaSeleccionada?.prenda || 'Prenda'} ${index + 1}`}
                sx={{
                  width: { xs: '100%', sm: 'calc(50% - 10px)' },
                  maxWidth: 360,
                  height: { xs: 220, sm: 280 },
                  objectFit: 'contain',
                  borderRadius: 2,
                  border: '1px solid #dbe3ef',
                  backgroundColor: '#fff'
                }}
              />
            ))}
          </Box>
        </DialogContent>
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
            {!metodoPago && (
              <>
                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#0f172a' }}>
                  Como vas a pagar?
                </Typography>
                {loadingMetodosPago && (
                  <Typography variant="body2" sx={{ color: '#64748b' }}>
                    Cargando metodos de pago...
                  </Typography>
                )}
                {errorMetodosPago && (
                  <Alert severity="error" sx={{ borderRadius: 2 }}>
                    {errorMetodosPago}
                  </Alert>
                )}
                {metodosPagoUniforme.map((metodo) => (
                  <Card
                    key={metodo.id}
                    sx={{
                      borderRadius: 2.5,
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 10px 20px rgba(15, 23, 42, 0.06)',
                      cursor: loadingMetodosPago ? 'not-allowed' : 'pointer',
                      opacity: loadingMetodosPago ? 0.6 : 1
                    }}
                    onClick={() => {
                      if (!loadingMetodosPago) setMetodoPago(metodo.id);
                    }}
                  >
                    <CardContent sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, py: 2 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Box
                          sx={{
                            width: 40,
                            height: 40,
                            borderRadius: '50%',
                            backgroundColor: '#fff2e7',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          {metodo.id === 'Pago movil' ? (
                            <PhoneIphoneIcon sx={{ color: '#f97316' }} />
                          ) : (
                            <AccountBalanceIcon sx={{ color: '#f97316' }} />
                          )}
                        </Box>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#0f172a' }}>
                          {metodo.nombre}
                        </Typography>
                      </Box>
                      <ArrowForwardIosIcon sx={{ color: '#cbd5f0', fontSize: 18 }} />
                    </CardContent>
                  </Card>
                ))}
              </>
            )}

            {metodoPago && (
              <>
                <Button
                  variant="text"
                  fullWidth
                  onClick={() => {
                    setMetodoPago('');
                    setCopySuccess('');
                    setMostrarConfirmacionPago(false);
                  }}
                  startIcon={<ArrowBackIosNewIcon sx={{ fontSize: 16 }} />}
                  sx={{ mt: -0.25, color: '#64748b', fontWeight: 700 }}
                >
                  Volver
                </Button>

                {!mostrarConfirmacionPago && (
                  <>
                    <Box
                      sx={{
                        borderRadius: 2.5,
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#ffffff',
                        p: 2
                      }}
                    >
                      <Typography variant="caption" sx={{ fontWeight: 800, letterSpacing: '0.08em', color: '#0f172a' }}>
                        DATOS PARA EL PAGO
                      </Typography>
                      <Box sx={{ display: 'grid', gap: 1, mt: 1 }}>
                        {Object.entries(metodoPagoConfig?.detalles || {}).map(([clave, valor]) => (
                          <Box key={clave}>
                            <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                              {clave.replace('_', ' ')}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                              <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a', wordBreak: 'break-word' }}>
                                {formatearValorDetallePago(clave, valor)}
                              </Typography>
                              <IconButton size="small" onClick={() => copiarDatoPago(clave, valor)} sx={{ color: '#64748b' }}>
                                <ContentCopyIcon fontSize="inherit" />
                              </IconButton>
                            </Box>
                          </Box>
                        ))}
                      </Box>
                    </Box>

                    {copySuccess && (
                      <Typography variant="caption" sx={{ color: '#16a34a', fontWeight: 700, display: 'block', mt: -0.5 }}>
                        {copySuccess}
                      </Typography>
                    )}

                    <TextField
                      label="Monto a pagar (USD)"
                      type="number"
                      value={montoPagado}
                      onChange={(event) => setMontoPagado(event.target.value)}
                      size="small"
                      sx={inputSx}
                      inputProps={{
                        min: 0,
                        step: '0.01',
                        max: getSaldoPendienteVisible(pedidoPago) || undefined
                      }}
                      helperText={`Saldo pendiente actual: $${formatMoney(getSaldoPendienteVisible(pedidoPago))}`}
                    />

                    <Box
                      sx={{
                        borderRadius: 2,
                        backgroundColor: '#343e48',
                        color: '#ffffff',
                        px: 1.5,
                        py: 1.25,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1
                      }}
                    >
                      <Box>
                        <Typography variant="caption" sx={{ opacity: 0.9, letterSpacing: '0.08em' }}>
                          MONTO A TRANSFERIR EN BS
                        </Typography>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                          {montoPagadoBsInput !== null && Number.isFinite(montoPagadoBsInput)
                            ? `${formatMoney(montoPagadoBsInput)} Bs`
                            : '-'}
                        </Typography>
                      </Box>
                      <IconButton
                        size="small"
                        onClick={() => copiarDatoPago('monto_bs', montoPagadoBsInput !== null ? formatMoney(montoPagadoBsInput) : '')}
                        disabled={montoPagadoBsInput === null || !Number.isFinite(montoPagadoBsInput)}
                        sx={{ color: '#ffffff', opacity: (montoPagadoBsInput === null || !Number.isFinite(montoPagadoBsInput)) ? 0.45 : 0.9 }}
                        aria-label="Copiar monto en Bs"
                      >
                        <ContentCopyIcon fontSize="inherit" />
                      </IconButton>
                    </Box>

                    <Typography variant="caption" sx={{ color: '#64748b', mt: -0.5, display: 'block' }}>
                      Tasa aplicada: {tasaBCV ? `${formatMoney(tasaBCV)} Bs/USD` : 'No disponible'}
                    </Typography>

                  <Button
                    variant="contained"
                    fullWidth
                    onClick={handleYaPagueClick}
                    disabled={!montoPagado || Number(montoPagado) <= 0}
                    sx={{
                      bgcolor: '#f97316',
                      '&:hover': { bgcolor: '#ea580c' },
                      fontWeight: 800,
                      borderRadius: 2,
                      py: 1.2
                    }}
                  >
                    Ya pague
                  </Button>
                  </>
                )}

                {mostrarConfirmacionPago && (
                  <Box sx={{ display: 'grid', gap: 1.25 }}>
                    <TextField
                      label="Monto pagado Bs"
                      type="number"
                      value={montoPagadoBsConfirmacion}
                      onChange={(event) => setMontoPagadoBsConfirmacion(event.target.value)}
                      size="small"
                      sx={inputSx}
                      inputProps={{ min: 0, step: '0.01' }}
                      helperText={tasaBCV > 0
                        ? `Equivalente en USD: $${formatMoney((Number(montoPagadoBsConfirmacion) || 0) / tasaBCV)}`
                        : 'No hay tasa BCV disponible'}
                      required
                    />
                    <TextField
                      label="Fecha de pago"
                      type="date"
                      value={fechaPago}
                      onChange={(event) => setFechaPago(event.target.value)}
                      size="small"
                      sx={inputSx}
                      InputLabelProps={{ shrink: true }}
                      required
                    />
                    <TextField
                      label="Referencia"
                      value={referencia}
                      onChange={(event) => setReferencia(event.target.value.replace(/[^0-9]/g, '').slice(0, 20))}
                      size="small"
                      sx={inputSx}
                      helperText={metodoPago === 'Transferencia' || metodoPago === 'Pago movil' ? 'Minimo ultimos 6 digitos' : ''}
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
                )}
              </>
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
            disabled={submittingPago || !mostrarConfirmacionPago}
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
