import React, { useCallback, useEffect, useState } from 'react';
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
import CloseIcon from '@mui/icons-material/Close';
import ModalPago from './ModalPago';
import { useDolar } from '../context/DolarContext';
import { mediaUrl } from '../utils/mediaUrl';

const TALLAS = ['S', 'M', 'L', 'XL', 'XXL', '6', '8', '10', '12', '14', '16'];
const MONTO_TOLERANCIA_BS = 100;
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

function normalizarMoneda(moneda) {
  return String(moneda || 'USD').trim().toUpperCase() === 'EUR' ? 'EUR' : 'USD';
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
  const [numeroFranelaAsignado, setNumeroFranelaAsignado] = useState(() => String(alumno?.numero_franela ?? alumno?.numeroFranela ?? '').trim());
  const [numeroFranelaSeleccionado, setNumeroFranelaSeleccionado] = useState('');
  const [numerosFranelaDisponibles, setNumerosFranelaDisponibles] = useState([]);
  const [numeroFranelaLoading, setNumeroFranelaLoading] = useState(false);
  const [numeroFranelaError, setNumeroFranelaError] = useState('');
  const [mostrarImagenesPrenda, setMostrarImagenesPrenda] = useState(false);
  const [tasaEuroBCV, setTasaEuroBCV] = useState(null);

  const tasaBCV = Number(dolar?.promedio) || 0;
  const token = localStorage.getItem('token');
  const numeroFranelaAlumno = String(numeroFranelaAsignado || '').trim();
  const categoriaAlumno = String(alumno?.categoria || '').trim();
  const sexoAlumno = String(alumno?.sexo || '').trim();
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

  const obtenerTasaPorMoneda = useCallback((moneda) => {
    const monedaNormalizada = normalizarMoneda(moneda);
    if (monedaNormalizada === 'EUR') {
      return Number(tasaEuroBCV) || 0;
    }
    return Number(tasaBCV) || 0;
  }, [tasaEuroBCV, tasaBCV]);

  const formatearMontoConMoneda = useCallback((monto, moneda) => {
    return `${normalizarMoneda(moneda)} ${formatMoney(monto)}`;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const parseRate = (payload) => {
      if (payload == null) return null;
      if (typeof payload === 'number') return Number.isFinite(payload) ? payload : null;
      const candidates = [
        payload.promedio,
        payload.price,
        payload.valor,
        payload.rate,
        payload.oficial,
        payload?.data?.promedio,
        payload?.data?.price,
        payload?.data?.valor,
        payload?.data?.rate,
        payload?.data?.oficial
      ];
      for (const candidate of candidates) {
        const numeric = Number(candidate);
        if (Number.isFinite(numeric) && numeric > 0) return numeric;
      }
      return null;
    };

    const fetchEuroRate = async () => {
      try {
        const response = await fetch('https://ve.dolarapi.com/v1/euros/oficial');
        if (!response.ok) throw new Error('No se pudo obtener la tasa EUR oficial');
        const payload = await response.json().catch(() => null);
        const parsed = parseRate(payload);
        if (parsed && !cancelled) {
          setTasaEuroBCV(parsed);
          return;
        }
      } catch {
        // Sin tasa EUR disponible.
      }

      if (!cancelled) {
        setTasaEuroBCV(null);
      }
    };

    fetchEuroRate();

    return () => {
      cancelled = true;
    };
  }, []);

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

    if (!sexoAlumno) {
      setNumeroFranelaError('El alumno no tiene sexo asignado para mostrar numeros disponibles.');
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
          `${process.env.REACT_APP_API_URL}/api/alumnos/numeros-franela/disponibilidad?categoria=${encodeURIComponent(categoriaNormalizada)}&sexo=${encodeURIComponent(sexoAlumno)}`,
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
  }, [categoriaAlumno, numeroFranelaAlumno, requiereNumeroFranela, sexoAlumno, token]);

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
    setPagoDialogOpen(true);
  };

  const closePagoDialog = () => {
    setPagoDialogOpen(false);
    setPedidoPago(null);
  };

  const handlePagarPedido = async ({ pago, metodoPago, fechaPago, referencia, comprobante, montoPagadoMoneda, montoPagadoBs, moneda, telefonoPago, cedulaTitular }) => {
    if (!pago?._id) return;

    const montoPagadoNum = Number(montoPagadoMoneda);
    const montoPagadoBsNum = Number(montoPagadoBs);
    const saldoPendiente = Number(pago?.saldo_pendiente);
    const totalPedido = Number(pago?.precio) || 0;
    const saldoValidoRaw = Number.isFinite(saldoPendiente) && saldoPendiente > 0 ? saldoPendiente : totalPedido;
    const saldoValido = Number(Number(saldoValidoRaw).toFixed(2));
    const tasaAplicada = montoPagadoNum > 0 ? (montoPagadoBsNum / montoPagadoNum) : 0;
    const saldoValidoBs = Number.isFinite(tasaAplicada) && tasaAplicada > 0
      ? Number(Number(saldoValido * tasaAplicada).toFixed(2))
      : null;

    if (!montoPagadoNum || Number.isNaN(montoPagadoNum) || montoPagadoNum <= 0) {
      throw new Error('Debes indicar un monto pagado valido');
    }

    if (!montoPagadoBsNum || Number.isNaN(montoPagadoBsNum) || montoPagadoBsNum <= 0) {
      throw new Error('Debes indicar un monto pagado en Bs valido');
    }

    if (Number.isFinite(saldoValidoBs) && montoPagadoBsNum > (saldoValidoBs + MONTO_TOLERANCIA_BS)) {
      throw new Error(
        `El monto pagado en Bs no puede superar el saldo pendiente (${formatearMontoConMoneda(saldoValido, moneda)} = Bs. ${formatMoney(saldoValidoBs)}; tolerancia Bs. ${formatMoney(MONTO_TOLERANCIA_BS)})`
      );
    }

    const montoPagadoFinal = montoPagadoNum > saldoValido ? saldoValido : montoPagadoNum;
    const formData = new FormData();
    formData.append('metodo_pago', metodoPago);
    formData.append('monto_pagado', montoPagadoFinal.toFixed(2));
    formData.append('monto_pagado_bs', Number(montoPagadoBsNum.toFixed(2)).toFixed(2));
    if (referencia) formData.append('referencia', referencia);
    if (telefonoPago) formData.append('telefono_pago', telefonoPago);
    if (cedulaTitular) formData.append('cedula_titular', cedulaTitular);
    formData.append('fecha_pago', fechaPago);
    if (comprobante) formData.append('comprobante', comprobante);

    const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos/${pago._id}/pagar`, {
      method: 'PATCH',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || 'Error al registrar el pago');
    }

    setPedidos((prev) => prev.map((pedido) => (pedido._id === data._id ? data : pedido)));
    setSuccessMessage(
      data?.estado === 'abono'
        ? `Abono registrado. Saldo pendiente: ${formatearMontoConMoneda(data?.saldo_pendiente, normalizarMoneda(data?.moneda || pago?.moneda))}`
        : data?.estado === 'pago_en_revision'
          ? 'Pago enviado a revision'
          : 'Pago registrado correctamente'
    );
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

  const getTasaAplicadaPedido = (pedido) => {
    const montoPagadoDivisa = Number(pedido?.monto_pagado);
    const montoPagadoBs = Number(pedido?.monto_pagado_bs);
    if (Number.isFinite(montoPagadoDivisa) && montoPagadoDivisa > 0 && Number.isFinite(montoPagadoBs) && montoPagadoBs > 0) {
      return montoPagadoBs / montoPagadoDivisa;
    }

    if (Array.isArray(pedido?.pagos_historial) && pedido.pagos_historial.length > 0) {
      const ultimoPago = pedido.pagos_historial[pedido.pagos_historial.length - 1] || null;
      const ultimoDivisa = Number(ultimoPago?.monto_pagado);
      const ultimoBs = Number(ultimoPago?.monto_pagado_bs);
      if (Number.isFinite(ultimoDivisa) && ultimoDivisa > 0 && Number.isFinite(ultimoBs) && ultimoBs > 0) {
        return ultimoBs / ultimoDivisa;
      }
    }

    return null;
  };

  const getTextoMontoBsPedido = (pedido) => {
    const precioDivisa = Number(pedido?.precio) || 0;
    const tasaAplicadaPedido = getTasaAplicadaPedido(pedido);
    if (Number.isFinite(tasaAplicadaPedido) && tasaAplicadaPedido > 0) {
      return `Bs. ${formatMoney(precioDivisa * tasaAplicadaPedido)} (tasa del pago)`;
    }

    const tasaActual = obtenerTasaPorMoneda(pedido?.moneda);
    if (Number.isFinite(tasaActual) && tasaActual > 0) {
      return `Bs. ${formatMoney(precioDivisa * tasaActual)} (tasa actual)`;
    }

    return null;
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
                              {item.prenda} - {formatearMontoConMoneda(item.precio, item.moneda)}
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
                        <Typography sx={{ fontWeight: 800, color: '#0f172a' }}>{formatearMontoConMoneda(pedido.precio, pedido.moneda)}</Typography>
                        <Typography variant="body2" sx={{ color: '#64748b' }}>
                          Saldo pendiente: {formatearMontoConMoneda(getSaldoPendienteVisible(pedido), pedido.moneda)}
                        </Typography>
                        {getTextoMontoBsPedido(pedido) ? (
                          <Typography variant="body2" sx={{ color: '#64748b' }}>
                            {getTextoMontoBsPedido(pedido)}
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
                            {cancelandoId === pedido._id ? 'Eliminando solicitud...' : 'Eliminar solicitud'}
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
                            {cancelandoId === pedido._id ? 'Eliminando solicitud...' : 'Eliminar solicitud'}
                          </Button>
                        </Box>
                      ) : (
                        <Typography variant="body2" sx={{ color: '#64748b' }}>
                          {pedido.estado === 'cancelado'
                            ? 'Solicitud cancelada'
                            : pedido.estado === 'abono'
                              ? `Abono registrado. Saldo pendiente: ${formatearMontoConMoneda(getSaldoPendienteVisible(pedido), pedido.moneda)}`
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
                            <Typography sx={{ fontWeight: 700 }}>{formatearMontoConMoneda(pedido.precio, pedido.moneda)}</Typography>
                            <Typography variant="body2" sx={{ color: '#64748b' }}>
                              Pendiente: {formatearMontoConMoneda(getSaldoPendienteVisible(pedido), pedido.moneda)}
                            </Typography>
                            {getTextoMontoBsPedido(pedido) ? (
                              <Typography variant="body2" sx={{ color: '#64748b' }}>
                                {getTextoMontoBsPedido(pedido)}
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
                                  {cancelandoId === pedido._id ? 'Eliminando solicitud...' : 'Eliminar solicitud'}
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
                                  {cancelandoId === pedido._id ? 'Eliminando solicitud...' : 'Eliminar solicitud'}
                                </Button>
                              </Box>
                            ) : (
                              <Typography variant="body2" sx={{ color: '#64748b' }}>
                                {pedido.estado === 'cancelado'
                                  ? 'Solicitud cancelada'
                                  : pedido.estado === 'abono'
                                    ? `Abono registrado. Saldo pendiente: ${formatearMontoConMoneda(getSaldoPendienteVisible(pedido), pedido.moneda)}`
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

      <ModalPago
        open={pagoDialogOpen}
        onClose={closePagoDialog}
        pago={pedidoPago ? {
          _id: pedidoPago._id,
          id: pedidoPago._id,
          monto: getSaldoPendienteVisible(pedidoPago),
          id_alumno: { habilitar_pago_cuotas: false },
          recargo_aplicado_usd: 0,
          precio: pedidoPago.precio,
          saldo_pendiente: pedidoPago.saldo_pendiente,
          moneda: pedidoPago.moneda
        } : null}
        currencyCode={normalizarMoneda(pedidoPago?.moneda)}
        disableCuotas
        allowedMethodIds={['pago-movil', 'transferencia']}
        onSubmitPayment={handlePagarPedido}
        onSuccess={() => {
          closePagoDialog();
          fetchPedidos();
        }}
      />
    </Grid>
  );
}

export default SolicitudUniforme;
