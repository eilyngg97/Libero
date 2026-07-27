import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Divider,
  InputAdornment,
  MenuItem,
  Paper,
  Snackbar,
  TextField,
  Typography
} from '@mui/material';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import PhoneIphoneOutlinedIcon from '@mui/icons-material/PhoneIphoneOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import RequestQuoteOutlinedIcon from '@mui/icons-material/RequestQuoteOutlined';
import { BANCOS_PAGO_MOVIL } from '../constants/pagos';

const API_BASE = process.env.REACT_APP_API_URL || window.location.origin;

const EMPTY_CONFIG = {
  pagos: {
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
    }
  },
  cobro: {
    ...EMPTY_CONFIG.cobro,
    ...(data?.cobro || {})
  }
});

function PaymentConfig() {
  const token = localStorage.getItem('token');
  const [config, setConfig] = useState(EMPTY_CONFIG);
  const [loading, setLoading] = useState(true);
  const [savingPagos, setSavingPagos] = useState(false);
  const [savingCobro, setSavingCobro] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const monedaCobro = String(config?.cobro?.moneda || 'USD').toUpperCase() === 'EUR' ? 'EUR' : 'USD';
  const simboloMonedaCobro = monedaCobro === 'EUR' ? '€' : '$';

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
      diaVencimiento + diasTolerancia + 1
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

  const updateField = (group, section, field, value) => {
    setConfig((prev) => ({
      ...prev,
      [group]: {
        ...prev[group],
        [section]: {
          ...prev[group][section],
          [field]: value
        }
      }
    }));
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
    setConfig((prev) => ({
      ...prev,
      pagos: {
        ...prev.pagos,
        pago_movil: {
          ...prev.pagos.pago_movil,
          codigo_banco: codigoSeleccionado,
          banco: bancoSeleccionado?.nombre || ''
        }
      }
    }));
  };

  const handleBancoTransferenciaChange = (value) => {
    const codigoSeleccionado = String(value || '');
    const bancoSeleccionado = BANCOS_PAGO_MOVIL.find((item) => item.codigo === codigoSeleccionado);
    setConfig((prev) => ({
      ...prev,
      pagos: {
        ...prev.pagos,
        transferencia: {
          ...prev.pagos.transferencia,
          banco: bancoSeleccionado?.nombre || ''
        }
      }
    }));
  };

  const selectedCodigoBancoTransferencia = (() => {
    const bancoActual = String(config?.pagos?.transferencia?.banco || '').trim().toUpperCase();
    const match = BANCOS_PAGO_MOVIL.find((item) => item.nombre === bancoActual);
    return match?.codigo || '';
  })();

  const savePagos = async () => {
    try {
      setSavingPagos(true);
      setError('');
      const res = await fetch(`${API_BASE}/api/configuracion`, {
        method: 'PATCH',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pagos: config.pagos })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'No se pudo guardar pagos');

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

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2 }}>
        <Paper sx={sectionCardSx}>
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
              value={config.pagos.pago_movil.codigo_banco || ''}
              onChange={(e) => handleBancoPagoMovilChange(e.target.value)}
            >
              <MenuItem value="">Seleccione un banco</MenuItem>
              {BANCOS_PAGO_MOVIL.map((item) => (
                <MenuItem key={item.codigo} value={item.codigo}>{`${item.codigo}-${item.nombre}`}</MenuItem>
              ))}
            </TextField>
            <TextField label="Telefono" placeholder="0412 000 0000" InputLabelProps={{ shrink: true }} size="small" sx={fieldSx} value={config.pagos.pago_movil.telefono} onChange={(e) => updateField('pagos', 'pago_movil', 'telefono', e.target.value)} />
            <TextField label="Cedula" placeholder="V-00.000.000" InputLabelProps={{ shrink: true }} size="small" sx={fieldSx} value={config.pagos.pago_movil.cedula} onChange={(e) => updateField('pagos', 'pago_movil', 'cedula', e.target.value)} />
            <TextField label="Titular (opcional)" placeholder="Nombre completo" InputLabelProps={{ shrink: true }} size="small" sx={fieldSx} value={config.pagos.pago_movil.titular} onChange={(e) => updateField('pagos', 'pago_movil', 'titular', e.target.value)} />
          </Box>
        </Paper>

        <Paper sx={sectionCardSx}>
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
            >
              <MenuItem value="">Seleccione un banco</MenuItem>
              {BANCOS_PAGO_MOVIL.map((item) => (
                <MenuItem key={`tr-${item.codigo}`} value={item.codigo}>{`${item.codigo}-${item.nombre}`}</MenuItem>
              ))}
            </TextField>
            <TextField label="Cuenta" placeholder="0000 0000 00 0000000000" InputLabelProps={{ shrink: true }} size="small" sx={fieldSx} value={config.pagos.transferencia.cuenta} onChange={(e) => updateField('pagos', 'transferencia', 'cuenta', e.target.value)} />
            <TextField label="Titular" placeholder="Nombre completo" InputLabelProps={{ shrink: true }} size="small" sx={fieldSx} value={config.pagos.transferencia.titular} onChange={(e) => updateField('pagos', 'transferencia', 'titular', e.target.value)} />
            <TextField label="Cedula" placeholder="J-00000000-0" InputLabelProps={{ shrink: true }} size="small" sx={fieldSx} value={config.pagos.transferencia.cedula} onChange={(e) => updateField('pagos', 'transferencia', 'cedula', e.target.value)} />
          </Box>
        </Paper>

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
