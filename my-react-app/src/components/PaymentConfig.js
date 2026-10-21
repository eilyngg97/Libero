import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  InputAdornment,
  IconButton,
  MenuItem,
  Paper,
  Snackbar,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from '@mui/material';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import CheckroomOutlinedIcon from '@mui/icons-material/CheckroomOutlined';
import PhoneIphoneOutlinedIcon from '@mui/icons-material/PhoneIphoneOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import RequestQuoteOutlinedIcon from '@mui/icons-material/RequestQuoteOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { BANCOS_PAGO_MOVIL } from '../constants/pagos';
import { hasPermission } from '../utils/permissions';
import { ADDITIONAL_PAYMENT_METHODS } from '../utils/paymentMethod';

const API_BASE = process.env.REACT_APP_API_URL || window.location.origin;

const EMPTY_CONFIG = {
  pagos: {
    adicionales: [],
    pago_movil: {
      banco: '',
      codigo_banco: '',
      telefono: '',
      cedula: '',
      titular: ''
    },
    transferencia: {
      banco: '',
      cuenta: '',
      titular: '',
      cedula: ''
    },
    deposito_usd: {
      instrucciones: ''
    },
    por_concepto: {
      mensualidades: {
        usar_generales: true,
        adicionales: [],
        pago_movil: { banco: '', codigo_banco: '', telefono: '', cedula: '', titular: '' },
        transferencia: { banco: '', cuenta: '', titular: '', cedula: '' },
        deposito_usd: { instrucciones: '' }
      },
      uniformes: {
        usar_generales: true,
        adicionales: [],
        pago_movil: { banco: '', codigo_banco: '', telefono: '', cedula: '', titular: '' },
        transferencia: { banco: '', cuenta: '', titular: '', cedula: '' },
        deposito_usd: { instrucciones: '' }
      }
    }
  },
  cobro: {
    dia_cobro: 1,
    dia_vencimiento: 5,
    dias_gracia: 0,
    recargo_usd: 0,
    moneda: 'USD'
  }
};

const buildConfigFromResponse = (data = {}) => ({
  pagos: {
    adicionales: Array.isArray(data?.pagos?.adicionales) ? data.pagos.adicionales : [],
    pago_movil: {
      ...EMPTY_CONFIG.pagos.pago_movil,
      ...(data?.pagos?.pago_movil || {})
    },
    transferencia: {
      ...EMPTY_CONFIG.pagos.transferencia,
      ...(data?.pagos?.transferencia || {})
    },
    deposito_usd: {
      ...EMPTY_CONFIG.pagos.deposito_usd,
      ...(data?.pagos?.deposito_usd || {})
    },
    por_concepto: {
      mensualidades: {
        ...EMPTY_CONFIG.pagos.por_concepto.mensualidades,
        ...(data?.pagos?.por_concepto?.mensualidades || {}),
        pago_movil: {
          ...EMPTY_CONFIG.pagos.por_concepto.mensualidades.pago_movil,
          ...(data?.pagos?.por_concepto?.mensualidades?.pago_movil || {})
        },
        transferencia: {
          ...EMPTY_CONFIG.pagos.por_concepto.mensualidades.transferencia,
          ...(data?.pagos?.por_concepto?.mensualidades?.transferencia || {})
        }
      },
      uniformes: {
        ...EMPTY_CONFIG.pagos.por_concepto.uniformes,
        ...(data?.pagos?.por_concepto?.uniformes || {}),
        pago_movil: {
          ...EMPTY_CONFIG.pagos.por_concepto.uniformes.pago_movil,
          ...(data?.pagos?.por_concepto?.uniformes?.pago_movil || {})
        },
        transferencia: {
          ...EMPTY_CONFIG.pagos.por_concepto.uniformes.transferencia,
          ...(data?.pagos?.por_concepto?.uniformes?.transferencia || {})
        }
      }
    }
  },
  cobro: {
    ...EMPTY_CONFIG.cobro,
    ...(data?.cobro || {})
  }
});

function PaymentConfig() {
  const token = localStorage.getItem('token');
  const canViewUniformes = hasPermission('solicitudes_uniformes.view');
  const canManageUniformes = hasPermission('solicitudes_uniformes.manage');
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [loading, setLoading] = useState(true);
  const [savingPagos, setSavingPagos] = useState(false);
  const [savingCobro, setSavingCobro] = useState(false);
  const [paymentScope, setPaymentScope] = useState('generales');
  const [nuevoMetodo, setNuevoMetodo] = useState('zelle');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const monedaCobro = String(config?.cobro?.moneda || 'USD').toUpperCase() === 'EUR' ? 'EUR' : 'USD';
  const simboloMonedaCobro = monedaCobro === 'EUR' ? '€' : '$';
  const activePayments = paymentScope === 'generales'
    ? config.pagos
    : config.pagos.por_concepto[paymentScope];
  const usingGeneralPayments = paymentScope !== 'generales' && activePayments.usar_generales;
  const displayedPayments = usingGeneralPayments ? config.pagos : activePayments;
  const adicionales = displayedPayments.adicionales || [];
  const metodosDisponibles = ADDITIONAL_PAYMENT_METHODS.filter((metodo) => !adicionales.some((item) => item.tipo === metodo.id));
  const metodosValidos = [config.pagos, ...Object.values(config.pagos.por_concepto)]
    .every((pagos) => (pagos.adicionales || []).every((metodo) => String(metodo.titular || '').trim()
      && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(metodo.correo || '').trim())));

  const buildFechaInicioRecargoTexto = () => {
    const diaVencimiento = Number(config?.cobro?.dia_vencimiento);
    const diasTolerancia = Number(config?.cobro?.dias_gracia);

    if (!Number.isFinite(diaVencimiento) || !Number.isFinite(diasTolerancia)) {
      return '-';
    }

    const hoy = new Date();
    const fechaInicioRecargo = new Date(
      hoy.getFullYear(),
      hoy.getMonth(),
      diaVencimiento + diasTolerancia
    );

    return fechaInicioRecargo.toLocaleDateString('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const fechaInicioRecargoTexto = buildFechaInicioRecargoTexto();

  const sectionCardSx = {
    p: 2.2,
    borderRadius: 3,
    border: '1px solid #e4e9f1',
    boxShadow: '0 2px 6px rgba(15, 23, 42, 0.04)',
    bgcolor: '#ffffff'
  };

  const cardTitleSx = {
    display: 'flex',
    alignItems: 'center',
    gap: 0.8,
    color: '#243145',
    fontWeight: 800,
    fontSize: 17
  };

  const fieldSx = {
    '& .MuiInputLabel-root': {
      fontSize: 14,
      fontWeight: 800,
      color: '#8b97aa',
      letterSpacing: '0.03em',
      textTransform: 'uppercase'
    },
    '& .MuiOutlinedInput-root': {
      borderRadius: 1.8,
      bgcolor: '#ffffff',
      '& fieldset': {
        borderColor: '#dfe6f0'
      },
      '&:hover fieldset': {
        borderColor: '#d5deeb'
      },
      '&.Mui-focused fieldset': {
        borderColor: '#d1d9e8'
      }
    },
    '& .MuiInputBase-input': {
      color: '#4b5a73',
      fontWeight: 600,
      fontSize: 13
    }
  };

  const sectionHeaderSx = {
    display: 'flex',
    alignItems: 'center',
    gap: 0.8,
    mb: 1.6,
    color: '#27364b',
  };

  const darkButtonSx = {
    textTransform: 'none',
    fontWeight: 800,
    fontSize: 13,
    px: 2.6,
    bgcolor: '#0d1117',
    '&:hover': {
      bgcolor: '#080b10'
    },
    '&.Mui-disabled': {
      bgcolor: '#e5eaf2',
      color: '#a4adbc'
    }
  };

  const orangeButtonSx = {
    textTransform: 'none',
    fontWeight: 800,
    fontSize: 13,
    px: 2.6,
    bgcolor: '#ff7a1a',
    '&:hover': {
      bgcolor: '#ea6d11'
    },
    '&.Mui-disabled': {
      bgcolor: '#e5eaf2',
      color: '#a4adbc'
    }
  };

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch(`${API_BASE}/api/configuracion`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'No se pudo cargar la configuracion');
      setConfig(buildConfigFromResponse(data));
    } catch (err) {
      setError(err.message || 'No se pudo cargar la configuracion');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const updatePaymentField = (section, field, value) => {
    setConfig((prev) => ({
      ...prev,
      pagos: paymentScope === 'generales' ? {
        ...prev.pagos,
        [section]: { ...prev.pagos[section], [field]: value }
      } : {
        ...prev.pagos,
        por_concepto: {
          ...prev.pagos.por_concepto,
          [paymentScope]: {
            ...prev.pagos.por_concepto[paymentScope],
            [section]: { ...prev.pagos.por_concepto[paymentScope][section], [field]: value }
          }
        }
      }
    }));
  };

  const toggleGeneralPayments = (checked) => {
    if (paymentScope === 'generales') return;
    setConfig((prev) => ({
      ...prev,
      pagos: {
        ...prev.pagos,
        por_concepto: {
          ...prev.pagos.por_concepto,
          [paymentScope]: {
            ...prev.pagos.por_concepto[paymentScope],
            usar_generales: checked
          }
        }
      }
    }));
  };

  const updateAdditionalPayments = (updater) => {
    setConfig((prev) => {
      const target = paymentScope === 'generales' ? prev.pagos : prev.pagos.por_concepto[paymentScope];
      const updated = { ...target, adicionales: updater(target.adicionales || []) };
      return { ...prev, pagos: paymentScope === 'generales' ? updated : {
        ...prev.pagos, por_concepto: { ...prev.pagos.por_concepto, [paymentScope]: updated }
      } };
    });
  };

  const updateAdditionalField = (tipo, field, value) => updateAdditionalPayments((items) => items.map((item) => (
    item.tipo === tipo ? { ...item, [field]: value } : item
  )));

  const agregarMetodo = () => {
    const tipo = metodosDisponibles.some((item) => item.id === nuevoMetodo) ? nuevoMetodo : metodosDisponibles[0]?.id;
    if (!tipo || usingGeneralPayments) return;
    updateAdditionalPayments((items) => [...items, { tipo, titular: '', correo: '', banco: '', identificador: '', habilitado: true }]);
  };

  const updateCobroField = (field, value) => {
    setConfig((prev) => ({
      ...prev,
      cobro: {
        ...prev.cobro,
        [field]: value
      }
    }));
  };

  const handleBancoPagoMovilChange = (value) => {
    const codigoSeleccionado = String(value || '');
    const bancoSeleccionado = BANCOS_PAGO_MOVIL.find((item) => item.codigo === codigoSeleccionado);
    updatePaymentField('pago_movil', 'codigo_banco', codigoSeleccionado);
    updatePaymentField('pago_movil', 'banco', bancoSeleccionado?.nombre || '');
  };

  const handleBancoTransferenciaChange = (value) => {
    const codigoSeleccionado = String(value || '');
    const bancoSeleccionado = BANCOS_PAGO_MOVIL.find((item) => item.codigo === codigoSeleccionado);
    updatePaymentField('transferencia', 'banco', bancoSeleccionado?.nombre || '');
  };

  const selectedCodigoBancoTransferencia = (() => {
    const bancoActual = String(displayedPayments?.transferencia?.banco || '').trim().toUpperCase();
    const match = BANCOS_PAGO_MOVIL.find((item) => item.nombre === bancoActual);
    return match?.codigo || '';
  })();

  const savePagos = async () => {
    if (!metodosValidos) {
      setError('Completa el titular y un correo valido para cada metodo adicional.');
      return;
    }
    try {
      setSavingPagos(true);
      setError('');
      const pagosPayload = {
        ...config.pagos,
        por_concepto: { ...config.pagos.por_concepto }
      };
      if (!canManageUniformes) {
        delete pagosPayload.por_concepto.uniformes;
      }
      const res = await fetch(`${API_BASE}/api/configuracion`, {
        method: 'PATCH',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pagos: pagosPayload })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.detalle || data?.error || 'No se pudo guardar pagos');

      setSuccessMessage('Pagos actualizados correctamente');
      setConfig(buildConfigFromResponse(data));
    } catch (err) {
      setError(err.message || 'No se pudo guardar pagos');
    } finally {
      setSavingPagos(false);
    }
  };

  const saveCobro = async () => {
    try {
      setSavingCobro(true);
      setError('');
      const res = await fetch(`${API_BASE}/api/configuracion`, {
        method: 'PATCH',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ cobro: config.cobro })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'No se pudo guardar cobro');

      setSuccessMessage('Reglas de cobro actualizadas correctamente');
      setConfig(buildConfigFromResponse(data));
    } catch (err) {
      setError(err.message || 'No se pudo guardar cobro');
    } finally {
      setSavingCobro(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
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

      <Typography sx={{ fontSize: { xs: 22, md: 25 }, fontWeight: 900, color: '#1f2a3d', mb: 0.5 }}>
        Configuracion de academia
      </Typography>
      <Typography sx={{ color: '#66758d', mb: 2.5, fontSize: 13 }}>
        Este modulo centraliza variables de negocio de la academia. Solo el rol admin puede ver y editar estos valores.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      <Box sx={sectionHeaderSx}>
        <AccountBalanceOutlinedIcon sx={{ color: '#b5641a', fontSize: 20 }} />
        <Typography sx={{ fontWeight: 900, color: '#2a374d', fontSize: 24 }}>Metodos de Pago</Typography>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 1.25, mb: 2 }}>
        <ToggleButtonGroup
          exclusive
          value={paymentScope}
          onChange={(_, value) => value && setPaymentScope(value)}
          aria-label="Concepto de pago"
          sx={{
            width: '100%',
            gap: 0.5,
            p: 0.5,
            bgcolor: '#f1f4f8',
            border: '1px solid #e2e7ef',
            borderRadius: 1,
            '& .MuiToggleButtonGroup-grouped': {
              flex: 1,
              minHeight: 38,
              px: { xs: 1.25, sm: 2 },
              gap: 0.8,
              border: '0 !important',
              borderRadius: '6px !important',
              color: '#66758d',
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 0,
              textTransform: 'none',
              transition: 'background-color 160ms ease, color 160ms ease, box-shadow 160ms ease',
              '&:hover': {
                bgcolor: '#e6ebf2',
                color: '#26354a'
              },
              '&.Mui-selected': {
                bgcolor: '#111827',
                color: '#ffffff',
                boxShadow: '0 2px 5px rgba(15, 23, 42, 0.2)',
                '&:hover': {
                  bgcolor: '#111827'
                },
                '& .MuiSvgIcon-root': {
                  color: '#ff8a32'
                }
              }
            },
            '& .MuiSvgIcon-root': {
              fontSize: 17,
              color: '#8a96a8'
            }
          }}
        >
          <ToggleButton value="generales">
            <AccountBalanceWalletOutlinedIcon />
            Generales
          </ToggleButton>
          <ToggleButton value="mensualidades">
            <CalendarMonthOutlinedIcon />
            Mensualidades
          </ToggleButton>
          {canViewUniformes && (
            <ToggleButton value="uniformes">
              <CheckroomOutlinedIcon />
              Uniformes
            </ToggleButton>
          )}
        </ToggleButtonGroup>
        {paymentScope !== 'generales' && (
          <Box sx={{
            display: 'flex',
            alignSelf: 'flex-end',
            alignItems: 'center',
            gap: 0.75,
            minHeight: 40,
            px: 1.25,
            pr: 1.75,
            bgcolor: usingGeneralPayments ? '#fff7ed' : '#f7f9fc',
            border: `1px solid ${usingGeneralPayments ? '#fed7aa' : '#e2e7ef'}`,
            borderRadius: 1
          }}>
            <Switch
              size="small"
              checked={usingGeneralPayments}
              onChange={(event) => toggleGeneralPayments(event.target.checked)}
              slotProps={{ input: { 'aria-label': 'Usar datos generales' } }}
              sx={{
                '& .MuiSwitch-switchBase.Mui-checked': { color: '#f97316' },
                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#f97316' }
              }}
            />
            <Typography sx={{ color: '#445269', fontWeight: 800, fontSize: 12.5 }}>
              Usar datos generales
            </Typography>
          </Box>
        )}
      </Box>

      {usingGeneralPayments && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Este concepto mostrara los datos generales. Desactiva la opcion para configurar una cuenta diferente.
        </Alert>
      )}

      <Box component="section" aria-label="Metodos adicionales" sx={{ mb: 2 }}>
        <Box sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          alignItems: { xs: 'stretch', md: 'center' },
          justifyContent: 'space-between',
          gap: 2,
          py: 2,
          borderTop: '1px solid #e2e7ef',
          borderBottom: '1px solid #e2e7ef',
          mb: 2
        }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <AccountBalanceWalletOutlinedIcon sx={{ fontSize: 20, color: '#b5641a', flexShrink: 0 }} />
            <Typography sx={{ fontSize: 16, fontWeight: 800, color: '#27364b' }}>Otros metodos de pago</Typography>
          </Box>
          <Box sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(180px, 1fr) auto' },
            alignItems: 'center',
            gap: 1.25,
            width: { xs: '100%', md: 'auto' },
            minWidth: 0
          }}>
            <TextField
              select
              fullWidth
              size="small"
              label="Nuevo metodo"
              InputLabelProps={{ shrink: true }}
              value={metodosDisponibles.some((item) => item.id === nuevoMetodo) ? nuevoMetodo : (metodosDisponibles[0]?.id || '')}
              onChange={(event) => setNuevoMetodo(event.target.value)}
              disabled={usingGeneralPayments || !metodosDisponibles.length}
              SelectProps={{ displayEmpty: true }}
              sx={{
                minWidth: 0,
                '& .MuiOutlinedInput-root': {
                  height: 42,
                  bgcolor: '#ffffff',
                  borderRadius: 1,
                  '& fieldset': { borderColor: '#d6deea' },
                  '&:hover fieldset': { borderColor: '#97a6ba' },
                  '&.Mui-focused fieldset': { borderColor: '#c45c12' }
                },
                '& .MuiInputLabel-root': { color: '#66758d', fontSize: 13 },
                '& .MuiInputLabel-root.Mui-focused': { color: '#a94d0d' },
                '& .MuiSelect-select': { fontSize: 14, fontWeight: 600 }
              }}
            >
              {!metodosDisponibles.length && <MenuItem value="" disabled>Sin metodos disponibles</MenuItem>}
              {metodosDisponibles.map((metodo) => <MenuItem key={metodo.id} value={metodo.id}>{metodo.nombre}</MenuItem>)}
            </TextField>
            <Button
              variant="contained"
              disableElevation
              startIcon={<AddRoundedIcon />}
              onClick={agregarMetodo}
              disabled={usingGeneralPayments || !metodosDisponibles.length}
              sx={{
                minHeight: 42,
                px: 2,
                borderRadius: 1,
                textTransform: 'none',
                letterSpacing: 0,
                fontSize: 13,
                fontWeight: 800,
                whiteSpace: 'nowrap',
                bgcolor: '#c45c12',
                color: '#ffffff',
                '&:hover': { bgcolor: '#a94d0d' },
                '&:focus-visible': { outline: '3px solid #fdba74', outlineOffset: 2 }
              }}
            >
              Agregar metodo
            </Button>
          </Box>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2, opacity: usingGeneralPayments ? 0.55 : 1 }}>
        <Paper component="section" aria-label="Pago movil" sx={sectionCardSx}>
          <Box sx={cardTitleSx}>
            <PhoneIphoneOutlinedIcon sx={{ color: '#bd6e26', fontSize: 18 }} />
            <Typography sx={{ fontWeight: 800, color: '#2a374d', fontSize: 22 }}>Pago movil</Typography>
          </Box>
          <Divider sx={{ my: 1.4, borderColor: '#e6ebf3' }} />
          <Box sx={{ display: 'grid', gap: 1.75 }}>
            <TextField
              label="Banco"
              InputLabelProps={{ shrink: true }}
              size="small"
              select
              sx={fieldSx}
              value={displayedPayments.pago_movil.codigo_banco || ''}
              onChange={(e) => handleBancoPagoMovilChange(e.target.value)}
              disabled={usingGeneralPayments}
            >
              <MenuItem value="">Seleccione un banco</MenuItem>
              {BANCOS_PAGO_MOVIL.map((item) => (
                <MenuItem key={item.codigo} value={item.codigo}>{`${item.codigo}-${item.nombre}`}</MenuItem>
              ))}
            </TextField>
            <TextField disabled={usingGeneralPayments} label="Telefono" placeholder="0412 000 0000" InputLabelProps={{ shrink: true }} size="small" sx={fieldSx} value={displayedPayments.pago_movil.telefono} onChange={(e) => updatePaymentField('pago_movil', 'telefono', e.target.value)} />
            <TextField disabled={usingGeneralPayments} label="Cedula" placeholder="V-00.000.000" InputLabelProps={{ shrink: true }} size="small" sx={fieldSx} value={displayedPayments.pago_movil.cedula} onChange={(e) => updatePaymentField('pago_movil', 'cedula', e.target.value)} />
            <TextField disabled={usingGeneralPayments} label="Titular (opcional)" placeholder="Nombre completo" InputLabelProps={{ shrink: true }} size="small" sx={fieldSx} value={displayedPayments.pago_movil.titular} onChange={(e) => updatePaymentField('pago_movil', 'titular', e.target.value)} />
          </Box>
        </Paper>

        <Paper component="section" aria-label="Transferencia" sx={sectionCardSx}>
          <Box sx={cardTitleSx}>
            <AccountBalanceOutlinedIcon sx={{ color: '#bd6e26', fontSize: 18 }} />
            <Typography sx={{ fontWeight: 800, color: '#2a374d', fontSize: 22 }}>Transferencia</Typography>
          </Box>
          <Divider sx={{ my: 1.4, borderColor: '#e6ebf3' }} />
          <Box sx={{ display: 'grid', gap: 1.75 }}>
            <TextField
              label="Banco"
              InputLabelProps={{ shrink: true }}
              size="small"
              select
              sx={fieldSx}
              value={selectedCodigoBancoTransferencia}
              onChange={(e) => handleBancoTransferenciaChange(e.target.value)}
              disabled={usingGeneralPayments}
            >
              <MenuItem value="">Seleccione un banco</MenuItem>
              {BANCOS_PAGO_MOVIL.map((item) => (
                <MenuItem key={`tr-${item.codigo}`} value={item.codigo}>{`${item.codigo}-${item.nombre}`}</MenuItem>
              ))}
            </TextField>
            <TextField disabled={usingGeneralPayments} label="Cuenta" placeholder="0000 0000 00 0000000000" InputLabelProps={{ shrink: true }} size="small" sx={fieldSx} value={displayedPayments.transferencia.cuenta} onChange={(e) => updatePaymentField('transferencia', 'cuenta', e.target.value)} />
            <TextField disabled={usingGeneralPayments} label="Titular" placeholder="Nombre completo" InputLabelProps={{ shrink: true }} size="small" sx={fieldSx} value={displayedPayments.transferencia.titular} onChange={(e) => updatePaymentField('transferencia', 'titular', e.target.value)} />
            <TextField disabled={usingGeneralPayments} label="Cedula" placeholder="J-00000000-0" InputLabelProps={{ shrink: true }} size="small" sx={fieldSx} value={displayedPayments.transferencia.cedula} onChange={(e) => updatePaymentField('transferencia', 'cedula', e.target.value)} />
          </Box>
        </Paper>

        {adicionales.map((metodo) => <Paper component="section" aria-label={`Cuenta ${metodo.tipo}`} key={metodo.tipo} sx={{ ...sectionCardSx, borderRadius: 2, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <AccountBalanceWalletOutlinedIcon sx={{ fontSize: 19, color: '#bd6e26' }} />
            <Typography sx={{ fontWeight: 800, fontSize: 18, mr: 'auto' }}>{ADDITIONAL_PAYMENT_METHODS.find((item) => item.id === metodo.tipo)?.nombre}</Typography>
            <Switch size="small" checked={metodo.habilitado !== false} onChange={(event) => updateAdditionalField(metodo.tipo, 'habilitado', event.target.checked)} disabled={usingGeneralPayments} slotProps={{ input: { 'aria-label': `Habilitar ${metodo.tipo}` } }} />
            <Tooltip title="Quitar metodo"><span><IconButton size="small" aria-label={`Quitar ${metodo.tipo}`} disabled={usingGeneralPayments} onClick={() => updateAdditionalPayments((items) => items.filter((item) => item.tipo !== metodo.tipo))}><DeleteOutlineIcon fontSize="small" /></IconButton></span></Tooltip>
          </Box>
          <Box sx={{ display: 'grid', gap: 1.75 }}>
            <TextField required disabled={usingGeneralPayments} label="Nombre del titular" size="small" sx={fieldSx} value={metodo.titular} onChange={(event) => updateAdditionalField(metodo.tipo, 'titular', event.target.value)} inputProps={{ maxLength: 150 }} />
            <TextField required disabled={usingGeneralPayments} label="Correo" type="email" size="small" sx={fieldSx} value={metodo.correo} onChange={(event) => updateAdditionalField(metodo.tipo, 'correo', event.target.value)} inputProps={{ maxLength: 254 }} error={Boolean(metodo.correo) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(metodo.correo.trim())} />
            {metodo.tipo === 'zelle' && <TextField disabled={usingGeneralPayments} label="Banco (opcional)" size="small" sx={fieldSx} value={metodo.banco || ''} onChange={(event) => updateAdditionalField(metodo.tipo, 'banco', event.target.value)} inputProps={{ maxLength: 150 }} />}
            {metodo.tipo === 'binance' && <TextField disabled={usingGeneralPayments} label="Binance Pay ID (opcional)" size="small" sx={fieldSx} value={metodo.identificador || ''} onChange={(event) => updateAdditionalField(metodo.tipo, 'identificador', event.target.value)} inputProps={{ maxLength: 100 }} />}
          </Box>
        </Paper>)}

        <Box sx={{ gridColumn: { xs: '1 / -1' }, display: 'flex', justifyContent: 'flex-end', mt: -0.5 }}>
          <Button
            type="button"
            variant="contained"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              savePagos();
            }}
            disabled={loading || savingPagos}
            sx={darkButtonSx}
          >
            {savingPagos ? 'Guardando pagos...' : 'Guardar pagos'}
          </Button>
        </Box>

        <Box sx={{ ...sectionHeaderSx, gridColumn: { xs: '1 / -1' }, mt: 0.8, mb: 1.2 }}>
          <ReceiptLongOutlinedIcon sx={{ color: '#b5641a', fontSize: 20 }} />
          <Typography sx={{ fontWeight: 900, color: '#2a374d', fontSize: 24 }}>Facturacion</Typography>
        </Box>

        <Paper sx={{ ...sectionCardSx, gridColumn: { xs: '1 / -1' } }}>
          <Box sx={cardTitleSx}>
            <RequestQuoteOutlinedIcon sx={{ color: '#bd6e26', fontSize: 18 }} />
            <Typography sx={{ fontWeight: 800, color: '#2a374d', fontSize: 22 }}>Cobro mensual</Typography>
          </Box>
          <Divider sx={{ my: 1.4, borderColor: '#e6ebf3' }} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(5, minmax(0, 1fr))' }, gap: 1.25 }}>
            <TextField
              label="Moneda de cobro"
              InputLabelProps={{ shrink: true }}
              size="small"
              select
              sx={fieldSx}
              value={monedaCobro}
              onChange={(e) => updateCobroField('moneda', e.target.value)}
            >
              <MenuItem value="USD">Dolar (USD)</MenuItem>
              <MenuItem value="EUR">Euro (EUR)</MenuItem>
            </TextField>
            <TextField
              label="Dia de cobro"
              placeholder="1"
              InputLabelProps={{ shrink: true }}
              size="small"
              sx={fieldSx}
              type="number"
              inputProps={{ min: 1, max: 31 }}
              value={config.cobro.dia_cobro}
              onChange={(e) => updateCobroField('dia_cobro', e.target.value)}
            />
            <TextField
              label="Dia de vencimiento"
              placeholder="5"
              InputLabelProps={{ shrink: true }}
              size="small"
              sx={fieldSx}
              type="number"
              inputProps={{ min: 1, max: 31 }}
              value={config.cobro.dia_vencimiento}
              onChange={(e) => updateCobroField('dia_vencimiento', e.target.value)}
            />
            <TextField
              label="Dias de tolerancia"
              placeholder="3"
              InputLabelProps={{ shrink: true }}
              size="small"
              sx={fieldSx}
              type="number"
              inputProps={{ min: 0, max: 31 }}
              value={config.cobro.dias_gracia}
              onChange={(e) => updateCobroField('dias_gracia', e.target.value)}
            />
            <TextField
              label={`Recargo (${monedaCobro})`}
              placeholder="0.00"
              InputLabelProps={{ shrink: true }}
              size="small"
              sx={fieldSx}
              InputProps={{
                startAdornment: <InputAdornment position="start">{simboloMonedaCobro}</InputAdornment>
              }}
              type="number"
              inputProps={{ min: 0, max: 100000, step: '0.01' }}
              value={config.cobro.recargo_usd}
              onChange={(e) => updateCobroField('recargo_usd', e.target.value)}
            />
          </Box>
          <Typography sx={{ mt: 1.2, color: '#8f9cb2', fontSize: 12 }}>
            Con esta configuracion, el recargo se aplicara a partir del {fechaInicioRecargoTexto}.
          </Typography>
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              type="button"
              variant="contained"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                saveCobro();
              }}
              disabled={loading || savingCobro}
              sx={orangeButtonSx}
            >
              {savingCobro ? 'Guardando cobro...' : 'Guardar cobro'}
            </Button>
          </Box>
        </Paper>

      </Box>
    </Box>
  );
}

export default PaymentConfig;
