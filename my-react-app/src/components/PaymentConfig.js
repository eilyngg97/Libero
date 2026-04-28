import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Paper,
  Snackbar,
  TextField,
  Typography
} from '@mui/material';

const API_BASE = process.env.REACT_APP_API_URL || window.location.origin;

const EMPTY_CONFIG = {
  pagos: {
    pago_movil: {
      banco: '',
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
    recargo_usd: 0
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
    position: 'relative',
    p: 2.2,
    pt: 2.6,
    borderRadius: 3,
    border: '1px solid #e2e8f0',
    boxShadow: '0 12px 26px rgba(15, 23, 42, 0.06)',
    overflow: 'hidden',
    bgcolor: '#ffffff',
    '&::before': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 7,
      background: 'linear-gradient(90deg, #ff8a00 0%, #8a4b00 100%)'
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

      <Typography sx={{ fontSize: { xs: 24, md: 30 }, fontWeight: 900, color: '#0f172a', mb: 0.5 }}>
        Configuracion de academia
      </Typography>
      <Typography sx={{ color: '#475569', mb: 2.5 }}>
        Este modulo centraliza variables de negocio de la academia. Solo el rol admin puede ver y editar estos valores.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2 }}>
        <Paper sx={sectionCardSx}>
          <Typography sx={{ fontWeight: 800, color: '#0f172a', mb: 1.5 }}>Pago movil</Typography>
          <Box sx={{ display: 'grid', gap: 1.25 }}>
            <TextField label="Banco" size="small" value={config.pagos.pago_movil.banco} onChange={(e) => updateField('pagos', 'pago_movil', 'banco', e.target.value)} />
            <TextField label="Telefono" size="small" value={config.pagos.pago_movil.telefono} onChange={(e) => updateField('pagos', 'pago_movil', 'telefono', e.target.value)} />
            <TextField label="Cedula" size="small" value={config.pagos.pago_movil.cedula} onChange={(e) => updateField('pagos', 'pago_movil', 'cedula', e.target.value)} />
            <TextField label="Titular (opcional)" size="small" value={config.pagos.pago_movil.titular} onChange={(e) => updateField('pagos', 'pago_movil', 'titular', e.target.value)} />
          </Box>
        </Paper>

        <Paper sx={sectionCardSx}>
          <Typography sx={{ fontWeight: 800, color: '#0f172a', mb: 1.5 }}>Transferencia</Typography>
          <Box sx={{ display: 'grid', gap: 1.25 }}>
            <TextField label="Banco" size="small" value={config.pagos.transferencia.banco} onChange={(e) => updateField('pagos', 'transferencia', 'banco', e.target.value)} />
            <TextField label="Cuenta" size="small" value={config.pagos.transferencia.cuenta} onChange={(e) => updateField('pagos', 'transferencia', 'cuenta', e.target.value)} />
            <TextField label="Titular" size="small" value={config.pagos.transferencia.titular} onChange={(e) => updateField('pagos', 'transferencia', 'titular', e.target.value)} />
            <TextField label="Cedula" size="small" value={config.pagos.transferencia.cedula} onChange={(e) => updateField('pagos', 'transferencia', 'cedula', e.target.value)} />
          </Box>
        </Paper>

        <Box sx={{ gridColumn: { xs: '1 / -1' }, display: 'flex', justifyContent: 'flex-end', mt: -0.5 }}>
          <Button
            variant="contained"
            onClick={savePagos}
            disabled={loading || savingPagos || savingCobro}
            sx={{ textTransform: 'none', fontWeight: 700, px: 2.6 }}
          >
            {savingPagos ? 'Guardando pagos...' : 'Guardar pagos'}
          </Button>
        </Box>

        <Paper sx={{ ...sectionCardSx, gridColumn: { xs: '1 / -1' } }}>
          <Typography sx={{ fontWeight: 800, color: '#0f172a', mb: 1.5 }}>Cobro mensual</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.25 }}>
            <TextField
              label="Dia de cobro"
              size="small"
              type="number"
              inputProps={{ min: 1, max: 31 }}
              value={config.cobro.dia_cobro}
              onChange={(e) => updateCobroField('dia_cobro', e.target.value)}
            />
            <TextField
              label="Dia de vencimiento"
              size="small"
              type="number"
              inputProps={{ min: 1, max: 31 }}
              value={config.cobro.dia_vencimiento}
              onChange={(e) => updateCobroField('dia_vencimiento', e.target.value)}
            />
            <TextField
              label="Dias de tolerancia"
              size="small"
              type="number"
              inputProps={{ min: 0, max: 31 }}
              value={config.cobro.dias_gracia}
              onChange={(e) => updateCobroField('dias_gracia', e.target.value)}
            />
            <TextField
              label="Recargo (USD)"
              size="small"
              type="number"
              inputProps={{ min: 0, max: 100000, step: '0.01' }}
              value={config.cobro.recargo_usd}
              onChange={(e) => updateCobroField('recargo_usd', e.target.value)}
            />
          </Box>
          <Typography sx={{ mt: 1.2, color: '#94a3b8', fontSize: 12 }}>
            Con esta configuracion, el recargo se aplicara a partir del {fechaInicioRecargoTexto}.
          </Typography>
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button
              variant="contained"
              onClick={saveCobro}
              disabled={loading || savingCobro || savingPagos}
              sx={{ textTransform: 'none', fontWeight: 700, px: 2.6 }}
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
