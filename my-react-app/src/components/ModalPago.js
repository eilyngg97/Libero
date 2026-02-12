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
import { useDolar } from '../context/DolarContext';

const metodos = [
  {
    id: 'pago-movil',
    nombre: 'Pago Móvil',
    detalles: {
      banco: 'BANCO BANESCO',
      telefono: '0412-5228727',
      cedula: 'V-19433844',
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

function ModalPago({ open, onClose, pago, onSuccess }) {
  const [metodoSeleccionado, setMetodoSeleccionado] = useState(null);
  const [mostrarFormularioPago, setMostrarFormularioPago] = useState(false);
  const [montoPagado, setMontoPagado] = useState('');
  const [fechaPago, setFechaPago] = useState('');
  const [referencia, setReferencia] = useState('');
  const [comprobante, setComprobante] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const monto = pago?.monto;
  const { dolar } = useDolar();
  const tasa = dolar?.promedio;
  const montoBs = (monto !== undefined && monto !== null && tasa) ? Number(monto) * Number(tasa) : null;
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
      setFechaPago('');
      setReferencia('');
      setComprobante(null);
      setSubmitting(false);
      setSubmitError(null);
    }
  }, [open]);

  const handleSeleccionMetodo = (m) => {
    setMetodoSeleccionado(m);
    setMostrarFormularioPago(false);
  };

  const handleYaPague = () => {
    setMostrarFormularioPago(true);
    if (montoPagado === '') {
      setMontoPagado(montoBs !== null ? formatMoney(montoBs) : '');
    }
    if (fechaPago === '') {
      setFechaPago(new Date().toISOString().slice(0, 10));
    }
  };

  const handleConfirmar = async () => {
    if (referenciaInvalida || !pago?.id || !montoPagado || !fechaPago) {
      setSubmitError('Completa los campos requeridos');
      return;
    }
    const montoPagadoNum = Number(montoPagado);
    const montoPagadoUsd = tasa ? (montoPagadoNum / Number(tasa)) : null;
    if (!montoPagadoNum || Number.isNaN(montoPagadoNum)) {
      setSubmitError('Monto pagado invalido');
      return;
    }
    if (!tasa || !montoPagadoUsd || Number.isNaN(montoPagadoUsd)) {
      setSubmitError('No se pudo calcular el monto en USD');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const formData = new FormData();
      formData.append('id_mensualidad', pago.id);
      formData.append('monto_pagado', montoPagadoUsd.toFixed(2));
      formData.append('monto_pagado_bs', montoPagadoNum.toFixed(2));
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
              ¿Como vas a pagar?
            </Typography>
            <Typography variant="body2" sx={{ color: '#94a3b8', mt: 0.5 }}>
              Selecciona tu metodo de pago preferido para continuar.
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
            {metodoSeleccionado.detalles && !mostrarFormularioPago && (
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
                        <Typography variant="caption" sx={{ color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                          {k.replace('_', ' ')}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                          {v}
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                  <Box
                    sx={{
                      borderRadius: 2,
                      backgroundColor: '#f97316',
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
                    <PaymentsIcon sx={{ opacity: 0.85 }} />
                  </Box>
                </CardContent>
              </Card>
            )}
            {metodoSeleccionado.id !== 'deposito-usd' && !mostrarFormularioPago && (
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
                  <TextField
                    label="Referencia"
                    fullWidth
                    margin="dense"
                    size="small"
                    sx={inputSx}
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                    error={referenciaInvalida}
                    helperText={referenciaInvalida ? 'La referencia debe tener mínimo 6 dígitos' : ''}
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
