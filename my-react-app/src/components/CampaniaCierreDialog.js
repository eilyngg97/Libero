import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, TextField, Tooltip, Typography } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { tieneMontosValidos } from '../utils/campaniaMontos';

const API = process.env.REACT_APP_API_URL || window.location.origin;
const dinero = (valor) => typeof valor === 'number' && Number.isFinite(valor) && valor >= 0;
const formato = (valor, moneda) => new Intl.NumberFormat('es-VE', { style: 'currency', currency: moneda }).format(valor);

function CampaniaCierreDialog({ campania, onClose, onSaved }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [aceptar, setAceptar] = useState(false);
  const [intento, setIntento] = useState(0);
  const enviando = useRef(false);
  const solicitud = useRef(null);
  const controllerEnvio = useRef(null);
  const headers = () => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Tu sesion no esta disponible. Inicia sesion nuevamente.');
    return { Authorization: `Bearer ${token}` };
  };
  useEffect(() => () => controllerEnvio.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    const cargar = async () => {
      setCargando(true); setDatos(null); setError(''); setAceptar(false);
      try {
        const response = await fetch(`${API}/api/campanias-cobro/${campania._id}/cargos`, {
          headers: headers(), cache: 'no-store', signal: controller.signal
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudieron consultar los saldos.');
        const actual = data.campania;
        if (actual?._id !== campania._id || !['abierta', 'cerrada'].includes(actual.estado) || !actual.publicacion
          || !Number.isInteger(actual.__v) || actual.__v < 0 || actual.moneda !== campania.moneda
          || !Array.isArray(actual.participantes) || !Array.isArray(data.filas) || data.filas.length !== actual.participantes.length
          || new Set(data.filas.map((fila) => fila?.alumno)).size !== data.filas.length
          || data.filas.some((fila) => !actual.participantes.includes(fila?.alumno) || !dinero(fila.monto)
            || !dinero(fila.saldo_pendiente) || fila.saldo_pendiente > fila.monto || typeof fila.pago_en_revision !== 'boolean')
          || !dinero(data.totales?.total_esperado)
          || data.filas.reduce((total, fila) => total + Math.round(fila.monto * 100), 0) !== Math.round(data.totales.total_esperado * 100)) {
          throw new Error('No se pudieron verificar los saldos de la campana.');
        }
        if (!controller.signal.aborted) setDatos({ campania: actual,
          saldo: data.filas.reduce((total, fila) => total + Math.round(fila.saldo_pendiente * 100), 0) / 100,
          enRevision: data.filas.some((fila) => fila.pago_en_revision) });
      } catch (err) { if (!controller.signal.aborted) setError(err.message); }
      finally { if (!controller.signal.aborted) setCargando(false); }
    };
    cargar();
    return () => controller.abort();
  }, [campania._id, campania.moneda, intento]);

  const cerrar = () => { if (!enviando.current) onClose(); };
  const confirmar = async () => {
    if (enviando.current || !datos || datos.enRevision || datos.campania.estado !== 'abierta'
      || motivo.trim().length < 3 || (datos.saldo > 0 && !aceptar)) return;
    enviando.current = true; setGuardando(true); setError('');
    const controller = new AbortController(); controllerEnvio.current = controller;
    try {
      const auth = headers();
      if (!solicitud.current) solicitud.current = { version: datos.campania.__v, solicitud_id: window.crypto.randomUUID(),
        motivo: motivo.trim(), aceptar_saldo_pendiente: aceptar };
      const response = await fetch(`${API}/api/campanias-cobro/${campania._id}/cerrar`, {
        method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(solicitud.current),
        cache: 'no-store', signal: controller.signal
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) { solicitud.current = null; setDatos(null); }
        throw new Error(data.error || 'No se pudo cerrar la campana. Reintenta la misma solicitud.');
      }
      if (data.campania?._id !== campania._id || data.campania.estado !== 'cerrada' || typeof data.repetida !== 'boolean'
        || data.campania.__v !== solicitud.current.version + 1 || data.campania.moneda !== campania.moneda
        || typeof data.campania.nombre !== 'string' || !Array.isArray(data.campania.sedes)
        || !Array.isArray(data.campania.participantes) || !data.campania.publicacion || !tieneMontosValidos(data.campania)) {
        throw new Error('No se pudo verificar el cierre. Reintenta la misma solicitud.');
      }
      if (!controller.signal.aborted) onSaved(data.campania);
    } catch (err) { if (!controller.signal.aborted) setError(err.message); }
    finally { enviando.current = false; if (!controller.signal.aborted) setGuardando(false); }
  };

  return <Dialog open fullWidth maxWidth="sm" onClose={cerrar} aria-labelledby="cierre-campania-titulo"
    PaperProps={{ sx: { borderRadius: 2, color: '#202441', m: 2, width: 'calc(100% - 32px)' } }}>
    <DialogTitle component="div" sx={{ bgcolor: '#171b4b', color: '#fff', display: 'flex', alignItems: 'start', gap: 2, px: 3, py: 2 }}>
      <Typography component="h2" id="cierre-campania-titulo" sx={{ flex: 1, fontSize: 20, fontWeight: 700 }}>Cerrar campaña</Typography>
      <Tooltip title="Cerrar"><IconButton aria-label="Cerrar confirmacion de cierre" disabled={guardando} onClick={cerrar}
        sx={{ width: 32, height: 32, color: '#fff' }}><CloseRoundedIcon fontSize="small" /></IconButton></Tooltip>
    </DialogTitle>
    <DialogContent sx={{ pt: '24px !important', px: 3, '& .MuiInputBase-root': { fontSize: 13, borderRadius: 1.5 } }}>
      <Typography sx={{ fontSize: 15, fontWeight: 700, overflowWrap: 'anywhere', mb: 2 }}>{campania.nombre}</Typography>
      {cargando && <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 2 }}><CircularProgress size={20} />Consultando saldos...</Box>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {datos && <>
        <Typography sx={{ fontSize: 14, mb: 2 }}>Saldo pendiente: <strong>{formato(datos.saldo, campania.moneda)}</strong></Typography>
        {datos.campania.estado === 'cerrada' ? <Alert severity="info">La campaña ya esta cerrada.</Alert>
          : datos.enRevision ? <Alert severity="warning">Resuelve los pagos en revision antes de cerrar la campaña.</Alert> : <>
            <Alert severity="warning" sx={{ mb: 2 }}>No se admitiran nuevos pagos ni ajustes. Los saldos y el historial se conservaran; la deuda no se anula.</Alert>
            <TextField fullWidth required multiline minRows={2} label="Motivo del cierre" value={motivo}
              disabled={guardando || Boolean(solicitud.current)} onChange={(event) => setMotivo(event.target.value)} inputProps={{ maxLength: 1000 }} />
            {datos.saldo > 0 && <FormControlLabel sx={{ mt: 1 }} control={<Checkbox checked={aceptar}
              disabled={guardando || Boolean(solicitud.current)} onChange={(event) => setAceptar(event.target.checked)} />}
              label={<Typography sx={{ fontSize: 13 }}>Acepto cerrar con saldos pendientes, sin anular la deuda.</Typography>} />}
          </>}
      </>}
    </DialogContent>
    <DialogActions sx={{ px: 3, py: 2, flexWrap: 'wrap', gap: 1, borderTop: '1px solid #f0f1f5', '& > :not(style) ~ :not(style)': { ml: 0 } }}>
      <Button autoFocus disabled={guardando} onClick={cerrar} sx={{ color: '#50566e', textTransform: 'none' }}>Cancelar</Button>
      <Button disabled={guardando || cargando || Boolean(solicitud.current)} startIcon={<RefreshRoundedIcon />}
        onClick={() => setIntento((valor) => valor + 1)} sx={{ color: '#50566e', textTransform: 'none' }}>Actualizar saldos</Button>
      <Button variant="contained" onClick={confirmar} disabled={guardando || cargando || !datos || datos.enRevision
        || datos.campania.estado !== 'abierta' || motivo.trim().length < 3 || (datos.saldo > 0 && !aceptar)}
        startIcon={guardando ? <CircularProgress size={16} color="inherit" /> : <LockOutlinedIcon />}
        sx={{ bgcolor: '#171b4b', boxShadow: 'none', borderRadius: 1.5, textTransform: 'none' }}>{guardando ? 'Cerrando...' : 'Confirmar cierre'}</Button>
    </DialogActions>
  </Dialog>;
}

export default CampaniaCierreDialog;