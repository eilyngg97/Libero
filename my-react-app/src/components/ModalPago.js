import React, { useEffect, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, Card, CardContent, Typography, IconButton, Box, Button, Collapse, TextField, InputAdornment } from '@mui/material';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import CloseIcon from '@mui/icons-material/Close';
import PhoneIphoneIcon from '@mui/icons-material/PhoneIphone';
import AccountBalanceIcon from '@mui/icons-material/AccountBalance';
import SavingsIcon from '@mui/icons-material/Savings';
import LockIcon from '@mui/icons-material/Lock';
import PaymentsIcon from '@mui/icons-material/Payments';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useDolar } from '../context/DolarContext';
import { obtenerTasaOficialPorFecha } from '../utils/dolarHistorico';

const metodos = [
  {
    id: 'pago-movil',
    nombre: 'Pago Móvil',
    detalles: {
      banco: 'BANCO BANESCO',
      telefono: '0412-5228727',
      cedula: '19433844',
    }
  },
  {
    id: 'transferencia',
    nombre: 'Transferencia',
    detalles: {
      banco: 'BANCO BANESCO',
      cuenta: '0134-0945-5094-6116-6130',
      titular: 'EDIXON NELO',
    }
  },
  {
    id: 'deposito-usd',
    nombre: 'Depósito USD',
  }
];

const getTodayInCaracas = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;

  if (!year || !month || !day) return '';
  return `${year}-${month}-${day}`;
};

function ModalPago({ open, onClose, pago, onSuccess }) {
  const [metodoSeleccionado, setMetodoSeleccionado] = useState(null);
  const [mostrarFormularioPago, setMostrarFormularioPago] = useState(false);
  const [montoPagado, setMontoPagado] = useState('');
  const [montoPagadoBs, setMontoPagadoBs] = useState('');
  const [fechaPago, setFechaPago] = useState('');
  const [referencia, setReferencia] = useState('');
  const [comprobante, setComprobante] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [copySuccess, setCopySuccess] = useState('');
  const [tasaPago, setTasaPago] = useState(null);
  const [preferenciaCuota, setPreferenciaCuota] = useState(null);
  const monto = pago?.monto;
  const cuotasHabilitadas = pago?.id_alumno?.habilitar_pago_cuotas === true;
  const { dolar } = useDolar();
  const tasa = dolar?.promedio;
  const montoBs = (monto !== undefined && monto !== null && tasaPago) ? Number(monto) * Number(tasaPago) : null;
  const esAbonoParcial = preferenciaCuota === 'parcial';
  const montoAbonoUsd = esAbonoParcial ? Number(montoPagado) : null;
  const montoAbonoBs = (esAbonoParcial && Number.isFinite(montoAbonoUsd) && montoAbonoUsd > 0 && Number.isFinite(Number(tasaPago)) && Number(tasaPago) > 0)
    ? (montoAbonoUsd * Number(tasaPago))
    : null;
  const montoPagadoEquivalenteUsd = (() => {
    const montoBsIngresado = Number(montoPagado);
    const tasaAplicada = Number(tasaPago);

    if (!Number.isFinite(montoBsIngresado) || montoBsIngresado <= 0) return null;
    if (!Number.isFinite(tasaAplicada) || tasaAplicada <= 0) return null;

    return montoBsIngresado / tasaAplicada;
  })();
  const montoPagadoBsEquivalenteUsd = (() => {
    const montoBsIngresado = Number(montoPagadoBs);
    const tasaAplicada = Number(tasaPago);

    if (!Number.isFinite(montoBsIngresado) || montoBsIngresado <= 0) return null;
    if (!Number.isFinite(tasaAplicada) || tasaAplicada <= 0) return null;

    return montoBsIngresado / tasaAplicada;
  })();
  const formatMoney = (value) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
    return Number(value).toFixed(2);
  };
  const referenciaInvalida = !/^[0-9]{6,}$/.test(referencia);

  useEffect(() => {
    if (!open) {
      setMetodoSeleccionado(null);
      setMostrarFormularioPago(false);
      setMontoPagado('');
      setMontoPagadoBs('');
      setFechaPago('');
      setReferencia('');
      setComprobante(null);
      setSubmitting(false);
      setSubmitError(null);
      setCopySuccess('');
      setTasaPago(Number(tasa) || null);
      setPreferenciaCuota(null);
    }
  }, [open, tasa]);

  const copiarDatoPago = async (clave, valor) => {
    const valorFormateado = formatearValorDetallePago(clave, valor);
    const soloDigitos = String(valor || '').replace(/\D/g, '');
    const textoParaCopiar = (clave === 'cedula' || clave === 'telefono' || clave === 'cuenta')
      ? soloDigitos
      : String(valorFormateado || '');
    if (!textoParaCopiar || textoParaCopiar === '-') return;
    const label = String(clave || '').replace('_', ' ');
    try {
      await navigator.clipboard.writeText(textoParaCopiar);
      setCopySuccess(`${label} copiado`);
      setTimeout(() => setCopySuccess(''), 1800);
    } catch {
      setCopySuccess('No se pudo copiar');
      setTimeout(() => setCopySuccess(''), 1800);
    }
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

    return valor;
  };

  useEffect(() => {
    if (!open || !mostrarFormularioPago || !fechaPago || monto === undefined || monto === null) return;

    let cancelled = false;

    const actualizarMontoConHistorico = async () => {
      try {
        const tasaHistorica = await obtenerTasaOficialPorFecha(fechaPago, Number(tasa) || null);
        if (cancelled) return;
        const tasaNormalizada = Number(tasaHistorica) || null;
        setTasaPago(tasaNormalizada);
        if (!cuotasHabilitadas || preferenciaCuota === 'completo') {
          setMontoPagado(tasaNormalizada ? formatMoney(Number(monto) * Number(tasaNormalizada)) : '');
        }
      } catch {
        if (cancelled) return;
        const tasaActual = Number(tasa) || null;
        setTasaPago(tasaActual);
        if (!cuotasHabilitadas || preferenciaCuota === 'completo') {
          setMontoPagado(tasaActual ? formatMoney(Number(monto) * tasaActual) : '');
        }
      }
    };

    actualizarMontoConHistorico();

    return () => {
      cancelled = true;
    };
  }, [open, mostrarFormularioPago, fechaPago, monto, tasa, cuotasHabilitadas, preferenciaCuota]);

  const handleSeleccionMetodo = (m) => {
    setMetodoSeleccionado(m);
    setMostrarFormularioPago(false);
    setPreferenciaCuota(null);
  };

  const handleYaPague = () => {
    setMostrarFormularioPago(true);
    if (esAbonoParcial) {
      setMontoPagadoBs(montoAbonoBs !== null ? formatMoney(montoAbonoBs) : '');
    }
    if (fechaPago === '') {
      setFechaPago(getTodayInCaracas());
    }
  };

  const handleSeleccionPreferenciaCuota = (tipo) => {
    setPreferenciaCuota(tipo);
    if (tipo === 'parcial') {
      setMontoPagado('');
      setMontoPagadoBs('');
      setMostrarFormularioPago(false);
      if (fechaPago === '') {
        setFechaPago(getTodayInCaracas());
      }
      return;
    }

    // Para pago completo se conserva el flujo clásico: mostrar datos del método
    // y continuar con "Ya pagué".
    setMostrarFormularioPago(false);
    if (fechaPago === '') {
      setFechaPago(getTodayInCaracas());
    }
  };

  const handleConfirmar = async () => {
    const montoRequerido = esAbonoParcial ? montoPagadoBs : montoPagado;
    if (referenciaInvalida || !pago?.id || !montoRequerido || !fechaPago) {
      setSubmitError('Completa los campos requeridos');
      return;
    }
    const montoPagadoNum = Number(montoPagado);
    const montoPagadoBsNum = Number(montoPagadoBs);
    const tasaAplicada = Number(tasaPago) || Number(tasa) || null;
    const montoPagadoUsd = esAbonoParcial
      ? (tasaAplicada ? (montoPagadoBsNum / tasaAplicada) : null)
      : (tasaAplicada ? (montoPagadoNum / tasaAplicada) : null);
    const montoPagadoBsFinal = esAbonoParcial ? montoPagadoBsNum : montoPagadoNum;
    const montoEsperadoUsd = Number(monto);
    const montoEsperadoBs = montoBs !== null ? Number(montoBs) : null;
    if (esAbonoParcial && (!montoPagadoBsNum || Number.isNaN(montoPagadoBsNum))) {
      setSubmitError('Monto pagado en Bs invalido');
      return;
    }
    if (!esAbonoParcial && (!montoPagadoNum || Number.isNaN(montoPagadoNum))) {
      setSubmitError('Monto pagado invalido');
      return;
    }
    if (!tasaAplicada || !montoPagadoUsd || Number.isNaN(montoPagadoUsd)) {
      setSubmitError('No se pudo calcular el monto en USD');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const formData = new FormData();
      formData.append('id_mensualidad', pago.id);
      formData.append('monto_pagado', montoPagadoUsd.toFixed(2));
      formData.append('monto_pagado_bs', montoPagadoBsFinal.toFixed(2));
      if (Number.isFinite(montoEsperadoUsd)) {
        formData.append('monto_esperado_usd', montoEsperadoUsd.toFixed(2));
      }
      if (Number.isFinite(montoEsperadoBs)) {
        formData.append('monto_esperado_bs', montoEsperadoBs.toFixed(2));
      }
      formData.append('fecha_pago', fechaPago);
      formData.append('metodo_pago', metodoSeleccionado?.nombre || metodoSeleccionado?.id || '');
      if (referencia) formData.append('referencia', referencia);
      if (comprobante) formData.append('comprobante', comprobante);

      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/pagos`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al registrar pago');
      onClose();
      if (onSuccess) onSuccess();
    } catch (err) {
      setSubmitError(err.message || 'Error al registrar pago');
    } finally {
      setSubmitting(false);
    }
  };

  const iconByMetodo = {
    'pago-movil': PhoneIphoneIcon,
    transferencia: AccountBalanceIcon,
    'deposito-usd': SavingsIcon
  };

  const inputSx = {
    '& .MuiOutlinedInput-root': {
      borderRadius: 2,
      backgroundColor: '#ffffff'
    },
    '& .MuiOutlinedInput-notchedOutline': {
      borderColor: '#e2e8f0'
    },
    '& .MuiInputLabel-root': {
      color: '#94a3b8'
    }
  };

  const headerTitle = !metodoSeleccionado
    ? '¿Como vas a pagar?'
    : (cuotasHabilitadas && !mostrarFormularioPago && !preferenciaCuota && metodoSeleccionado.id !== 'deposito-usd')
      ? 'Pago por cuotas habilitado'
    : (cuotasHabilitadas && !mostrarFormularioPago && preferenciaCuota === 'parcial' && metodoSeleccionado.id !== 'deposito-usd')
      ? 'Abono parcial'
    : (mostrarFormularioPago && metodoSeleccionado.id !== 'deposito-usd')
      ? 'Confirma los datos del pago'
      : metodoSeleccionado.id === 'deposito-usd'
        ? 'Pago en USD'
        : `Datos para pagar por ${metodoSeleccionado.nombre}`;

  const headerSubtitle = !metodoSeleccionado
    ? 'Selecciona tu metodo de pago preferido para continuar.'
    : (cuotasHabilitadas && !mostrarFormularioPago && !preferenciaCuota && metodoSeleccionado.id !== 'deposito-usd')
      ? 'Se ha habilitado el pago por cuotas para su cuenta. Seleccione su preferencia:'
    : (cuotasHabilitadas && !mostrarFormularioPago && preferenciaCuota === 'parcial' && metodoSeleccionado.id !== 'deposito-usd')
      ? 'Ingresa el monto en USD y usa el equivalente en Bs para realizar la transferencia.'
    : (mostrarFormularioPago && metodoSeleccionado.id !== 'deposito-usd')
      ? 'Completa los datos y carga el comprobante para finalizar.'
      : metodoSeleccionado.id === 'deposito-usd'
        ? 'Sigue las instrucciones para registrar el pago con administracion.'
        : 'Revisa la informacion y continua cuando hayas realizado el pago.';

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)',
          overflow: 'hidden'
        }
      }}
    >
      <DialogTitle
        disableTypography
        sx={{
          px: 3,
          pt: 2.5,
          pb: 1.5,
          backgroundColor: '#ffffff'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a', mt: 0.5 }}>
              {headerTitle}
            </Typography>
            <Typography variant="body2" sx={{ color: '#94a3b8', mt: 0.5 }}>
              {headerSubtitle}
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small" sx={{ color: '#94a3b8' }}>
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ px: 3, pb: 2.5, pt: 1.5, bgcolor: '#f8fafc' }}>
        {!metodoSeleccionado ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {metodos.map((m) => (
              <Card
                key={m.id}
                sx={{
                  borderRadius: 2.5,
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 10px 20px rgba(15, 23, 42, 0.06)',
                  cursor: 'pointer'
                }}
                onClick={() => handleSeleccionMetodo(m)}
              >
                <CardContent
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                    py: 2
                  }}
                >
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
                      {React.createElement(iconByMetodo[m.id] || PhoneIphoneIcon, { style: { color: '#f97316' } })}
                    </Box>
                    <Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#0f172a' }}>
                        {m.nombre}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                        {m.id === 'pago-movil' && 'Transaccion inmediata'}
                        {m.id === 'transferencia' && 'Cualquier banco nacional'}
                        {m.id === 'deposito-usd' && 'Divisas en efectivo o cuenta custodia'}
                      </Typography>
                    </Box>
                  </Box>
                  <ArrowForwardIosIcon sx={{ color: '#cbd5f0', fontSize: 18 }} />
                </CardContent>
              </Card>
            ))}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mt: 1 }}>
              <LockIcon sx={{ fontSize: 16, color: '#94a3b8' }} />
              <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                Pago seguro y encriptado
              </Typography>
            </Box>
          </Box>
        ) : (
          <Box>
            {metodoSeleccionado.id == 'deposito-usd' && (
              <Card
                sx={{
                  mb: 2,
                  borderRadius: 2.5,
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#ffffff'
                }}
              >
                <CardContent>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#0f172a' }}>
                    {metodoSeleccionado.nombre}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1, color: '#64748b' }}>
                    Por favor comunicate con el administrador de la academia para registrar el pago en USD.
                  </Typography>
                </CardContent>
              </Card>
            )}
            {metodoSeleccionado.detalles && !mostrarFormularioPago && (!cuotasHabilitadas || preferenciaCuota === 'completo') && (
              <Card
                sx={{
                  mb: 2,
                  borderRadius: 2.5,
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#f8fafc'
                }}
              >
                <CardContent sx={{ p: 2.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <AccountBalanceIcon sx={{ color: '#f97316', fontSize: 18 }} />
                    <Typography variant="caption" sx={{ fontWeight: 800, letterSpacing: '0.08em', color: '#0f172a' }}>
                      DATOS PARA EL PAGO
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, mb: 2 }}>
                    {Object.entries(metodoSeleccionado.detalles).map(([k, v]) => (
                      <Box key={k}>
                        {(() => {
                          const valorFormateado = formatearValorDetallePago(k, v);
                          return (
                            <>
                        <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          {k.replace('_', ' ')}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a', wordBreak: 'break-word' }}>
                            {valorFormateado}
                          </Typography>
                          <IconButton
                            size="small"
                            onClick={() => copiarDatoPago(k, v)}
                            sx={{ color: '#64748b' }}
                            aria-label={`Copiar ${k}`}
                          >
                            <ContentCopyIcon fontSize="inherit" />
                          </IconButton>
                        </Box>
                            </>
                          );
                        })()}
                      </Box>
                    ))}
                  </Box>
                  {copySuccess && (
                    <Typography variant="caption" sx={{ color: '#16a34a', fontWeight: 700, display: 'block', mb: 1 }}>
                      {copySuccess}
                    </Typography>
                  )}
                  <Box
                    sx={{
                      borderRadius: 2,
                      backgroundColor: '#343e48',
                      color: '#ffffff',
                      px: 2,
                      py: 1.5,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 2
                    }}
                  >
                    <Box>
                      <Typography variant="caption" sx={{ opacity: 0.9, letterSpacing: '0.08em' }}>
                        MONTO TOTAL A TRANSFERIR
                      </Typography>
                      <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                        {montoBs !== null ? `${formatMoney(montoBs)} Bs` : '-'} / {formatMoney(monto)} USD
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <IconButton
                        size="small"
                        onClick={() => copiarDatoPago('monto_bs', montoBs !== null ? formatMoney(montoBs) : '')}
                        disabled={montoBs === null}
                        sx={{ color: '#ffffff', opacity: montoBs === null ? 0.45 : 0.9 }}
                        aria-label="Copiar monto en Bs"
                      >
                        <ContentCopyIcon fontSize="inherit" />
                      </IconButton>
                      <PaymentsIcon sx={{ opacity: 0.85 }} />
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            )}
            {metodoSeleccionado.id !== 'deposito-usd' && cuotasHabilitadas && !mostrarFormularioPago && !preferenciaCuota && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mt: 1 }}>
                <Card
                  sx={{
                    borderRadius: 2.5,
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 10px 20px rgba(15, 23, 42, 0.06)',
                    cursor: 'pointer'
                  }}
                  onClick={() => handleSeleccionPreferenciaCuota('completo')}
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
                        <PaymentsIcon sx={{ color: '#f97316' }} />
                      </Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#0f172a' }}>
                        Pagar Mensualidad Completa
                      </Typography>
                    </Box>
                    <ArrowForwardIosIcon sx={{ color: '#cbd5f0', fontSize: 18 }} />
                  </CardContent>
                </Card>

                <Card
                  sx={{
                    borderRadius: 2.5,
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 10px 20px rgba(15, 23, 42, 0.06)',
                    cursor: 'pointer'
                  }}
                  onClick={() => handleSeleccionPreferenciaCuota('parcial')}
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
                        <PaymentsIcon sx={{ color: '#f97316' }} />
                      </Box>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#0f172a' }}>
                        Realizar Abono Parcial
                      </Typography>
                    </Box>
                    <ArrowForwardIosIcon sx={{ color: '#cbd5f0', fontSize: 18 }} />
                  </CardContent>
                </Card>
              </Box>
            )}
            {metodoSeleccionado.id !== 'deposito-usd' && !mostrarFormularioPago && (!cuotasHabilitadas || preferenciaCuota === 'completo') && (
              <Button
                variant="contained"
                fullWidth
                onClick={handleYaPague}
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
            )}
            {metodoSeleccionado.id !== 'deposito-usd' && cuotasHabilitadas && preferenciaCuota === 'parcial' && !mostrarFormularioPago && (
              <Card
                sx={{
                  mt: 2,
                  borderRadius: 2.5,
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#ffffff'
                }}
              >
                <CardContent sx={{ p: 2.5 }}>
                  {metodoSeleccionado.detalles && (
                    <Card
                      sx={{
                        mb: 2,
                        borderRadius: 2,
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#f8fafc'
                      }}
                    >
                      <CardContent sx={{ p: 2 }}>
                        <Typography variant="caption" sx={{ fontWeight: 800, letterSpacing: '0.08em', color: '#0f172a' }}>
                          DATOS PARA EL PAGO
                        </Typography>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 1 }}>
                          {Object.entries(metodoSeleccionado.detalles).map(([k, v]) => {
                            const valorFormateado = formatearValorDetallePago(k, v);
                            return (
                              <Box key={k}>
                                <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                  {k.replace('_', ' ')}
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a', wordBreak: 'break-word' }}>
                                    {valorFormateado}
                                  </Typography>
                                  <IconButton size="small" onClick={() => copiarDatoPago(k, v)} sx={{ color: '#64748b' }}>
                                    <ContentCopyIcon fontSize="inherit" />
                                  </IconButton>
                                </Box>
                              </Box>
                            );
                          })}
                        </Box>
                      </CardContent>
                    </Card>
                  )}
                  {copySuccess && (
                    <Typography variant="caption" sx={{ color: '#16a34a', fontWeight: 700, display: 'block', mb: 1 }}>
                      {copySuccess}
                    </Typography>
                  )}
                  <TextField
                    label="Monto a pagar (USD)"
                    fullWidth
                    margin="dense"
                    size="small"
                    sx={inputSx}
                    value={montoPagado}
                    onChange={(e) => setMontoPagado(e.target.value)}
                    InputProps={{
                      endAdornment: <InputAdornment position="end">USD</InputAdornment>
                    }}
                  />
                  <Box
                    sx={{
                      mt: 1,
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
                        {montoAbonoBs !== null ? `${formatMoney(montoAbonoBs)} Bs` : '-'}
                      </Typography>
                    </Box>
                    <IconButton
                      size="small"
                      onClick={() => copiarDatoPago('monto_bs', montoAbonoBs !== null ? formatMoney(montoAbonoBs) : '')}
                      disabled={montoAbonoBs === null}
                      sx={{ color: '#ffffff', opacity: montoAbonoBs === null ? 0.45 : 0.9 }}
                      aria-label="Copiar monto en Bs"
                    >
                      <ContentCopyIcon fontSize="inherit" />
                    </IconButton>
                  </Box>
                  <Typography variant="caption" sx={{ color: '#64748b', mt: 0.25, display: 'block' }}>
                    Tasa aplicada: {tasaPago ? `${formatMoney(tasaPago)} Bs/USD` : 'No disponible'}
                  </Typography>
                  <Button
                    variant="contained"
                    fullWidth
                    onClick={handleYaPague}
                    disabled={montoAbonoBs === null}
                    sx={{
                      mt: 2,
                      bgcolor: '#f97316',
                      '&:hover': { bgcolor: '#ea580c' },
                      fontWeight: 800,
                      borderRadius: 2,
                      py: 1.2
                    }}
                  >
                    Ya pague
                  </Button>
                </CardContent>
              </Card>
            )}
            {mostrarFormularioPago && metodoSeleccionado.id !== 'deposito-usd' && (
              <Card
                sx={{
                  mt: 2,
                  borderRadius: 2.5,
                  border: '1px solid #e2e8f0',
                  backgroundColor: '#ffffff'
                }}
              >
                <CardContent sx={{ p: 2.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                    <PaymentsIcon sx={{ color: '#f97316', fontSize: 18 }} />
                    <Typography variant="caption" sx={{ fontWeight: 800, letterSpacing: '0.08em', color: '#0f172a' }}>
                      DETALLES DEL PAGO
                    </Typography>
                  </Box>
                  <Box sx={{ height: 1, backgroundColor: '#e2e8f0', mb: 2 }} />
                  {!esAbonoParcial && (
                    <TextField
                      label="Monto pagado (Bs)"
                      fullWidth
                      margin="dense"
                      size="small"
                      sx={inputSx}
                      value={montoPagado}
                      onChange={(e) => setMontoPagado(e.target.value)}
                      InputProps={{
                        endAdornment: <InputAdornment position="end">Bs</InputAdornment>
                      }}
                    />
                  )}
                  {!esAbonoParcial && montoPagadoEquivalenteUsd !== null && (
                    <Typography variant="caption" sx={{ color: '#64748b', mt: 0.35, display: 'block' }}>
                      Equivalente: ${formatMoney(montoPagadoEquivalenteUsd)} USD
                    </Typography>
                  )}
                  {esAbonoParcial && (
                    <>
                      <TextField
                        label="Monto pagado (Bs)"
                        fullWidth
                        margin="dense"
                        size="small"
                        sx={inputSx}
                        value={montoPagadoBs}
                        onChange={(e) => setMontoPagadoBs(e.target.value)}
                        InputProps={{
                          endAdornment: <InputAdornment position="end">Bs</InputAdornment>
                        }}
                      />
                      {montoPagadoBsEquivalenteUsd !== null && (
                        <Typography variant="caption" sx={{ color: '#64748b', mt: 0.35, display: 'block' }}>
                          Equivalente: ${formatMoney(montoPagadoBsEquivalenteUsd)} USD
                        </Typography>
                      )}
                    </>
                  )}
                  <TextField
                    label="Fecha de pago"
                    type="date"
                    fullWidth
                    margin="dense"
                    size="small"
                    sx={inputSx}
                    InputLabelProps={{ shrink: true }}
                    value={fechaPago}
                    onChange={(e) => setFechaPago(e.target.value)}
                  />
                  <Typography variant="caption" sx={{ color: '#64748b', mt: 0.25, display: 'block' }}>
                    Tasa aplicada: {tasaPago ? `${formatMoney(tasaPago)} Bs/USD` : 'No disponible'}
                  </Typography>
                  <TextField
                    label="Referencia"
                    fullWidth
                    margin="dense"
                    size="small"
                    sx={inputSx}
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                    error={referenciaInvalida}
                    helperText={referenciaInvalida ? 'La referencia debe incluir, como mínimo, los últimos 6 dígitos.' : ''}
                    inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
                  />
                  <Box
                    component="label"
                    sx={{
                      mt: 1.5,
                      border: '1px dashed #cbd5f0',
                      borderRadius: 2,
                      px: 2,
                      py: 1.25,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 1,
                      cursor: 'pointer',
                      color: '#475569',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      fontSize: 12,
                      letterSpacing: '0.08em'
                    }}
                  >
                    <CloudUploadIcon sx={{ fontSize: 18, color: '#94a3b8' }} />
                    Adjuntar comprobante
                    <input
                      type="file"
                      hidden
                      onChange={(e) => setComprobante(e.target.files?.[0] || null)}
                    />
                  </Box>
                  {comprobante && (
                    <Box
                      sx={{
                        mt: 1,
                        px: 1.5,
                        py: 0.75,
                        borderRadius: 2,
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          color: '#64748b',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        Archivo: {comprobante.name}
                      </Typography>
                      <IconButton size="small" onClick={() => setComprobante(null)}>
                        <CloseIcon sx={{ fontSize: 16, color: '#94a3b8' }} />
                      </IconButton>
                    </Box>
                  )}
                  {submitError && (
                    <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
                      {submitError}
                    </Typography>
                  )}
                  <Button
                    variant="contained"
                    fullWidth
                    sx={{
                      mt: 2,
                      bgcolor: '#f97316',
                      '&:hover': { bgcolor: '#ea580c' },
                      fontWeight: 800,
                      borderRadius: 2,
                      py: 1.2,
                      letterSpacing: '0.06em'
                    }}
                    onClick={handleConfirmar}
                    disabled={submitting || referenciaInvalida}
                  >
                    {submitting ? 'Enviando...' : 'Confirmar pago'}
                  </Button>
                </CardContent>
              </Card>
            )}
            <Button
              variant="text"
              fullWidth
              sx={{ mt: 1, color: '#64748b', fontWeight: 700 }}
              onClick={() => setMetodoSeleccionado(null)}
              startIcon={<ArrowBackIosNewIcon sx={{ fontSize: 16 }} />}
            >
              Volver
            </Button>
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ModalPago;
