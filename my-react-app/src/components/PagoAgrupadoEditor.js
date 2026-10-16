import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import { normalizeMetodoPago, metodoRequiereReferencia } from '../utils/paymentMethod';
import { mediaUrl } from '../utils/mediaUrl';

const metodos = ['Pago movil', 'Transferencia', 'Efectivo'];
const headers = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};
const centavos = (value) => Math.round(Number(value) * 100);

const repartirCentavos = (total, pesos) => {
  const suma = pesos.reduce((importe, peso) => importe + peso, 0);
  if (!Number.isSafeInteger(total) || total <= 0 || !Number.isSafeInteger(suma) || suma <= 0
    || pesos.some((peso) => !Number.isSafeInteger(peso) || peso <= 0)) return pesos.map(() => 0);
  const partes = pesos.map((peso, index) => {
    const numerador = window.BigInt(total) * window.BigInt(peso);
    const denominador = window.BigInt(suma);
    return { index, importe: Number(numerador / denominador), resto: numerador % denominador };
  });
  const faltantes = total - partes.reduce((importe, parte) => importe + parte.importe, 0);
  const orden = [...partes].sort((primera, segunda) => primera.resto === segunda.resto
    ? primera.index - segunda.index : (primera.resto > segunda.resto ? -1 : 1));
  for (let index = 0; index < faltantes; index += 1) orden[index % orden.length].importe += 1;
  return partes.map((parte) => parte.importe);
};

export default function PagoAgrupadoEditor({ open, pagoId, onClose, onSaved, moneda = 'USD' }) {
  const [grupo, setGrupo] = useState(null);
  const [draft, setDraft] = useState(null);
  const [version, setVersion] = useState('');
  const [asignaciones, setAsignaciones] = useState([]);
  const [comprobante, setComprobante] = useState(null);
  const [loading, setLoading] = useState(false);
  const [transacciones, setTransacciones] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [conflicto, setConflicto] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const [cotizacion, setCotizacion] = useState(null);
  const [cargandoTasa, setCargandoTasa] = useState(false);
  const [errorTasa, setErrorTasa] = useState('');
  const [recargaTasa, setRecargaTasa] = useState(0);

  useEffect(() => {
    if (!open || !pagoId) return;
    const abort = new AbortController();
    setLoading(true);
    setGrupo(null);
    setDraft(null);
    setComprobante(null);
    setError('');
    setConflicto(false);
    const cargar = async () => {
      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/pagos/agrupado/${pagoId}`, {
          headers: headers(), signal: abort.signal
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'No se pudo cargar el grupo.');
        if (abort.signal.aborted) return;
        setGrupo(data.pago);
        setTransacciones(data.transacciones_disponibles === true);
        setVersion(data.version);
        setAsignaciones(data.asignaciones.map((item) => ({ ...item, importe_inicial: item.monto_pagado })));
        setDraft({
          fecha_pago: String(data.pago.fecha_pago).slice(0, 10),
          metodo_pago: normalizeMetodoPago(data.pago.metodo_pago),
          monto_total_bs: data.pago.monto_total_bs,
          referencia: data.pago.referencia || '',
          telefono_pago: data.pago.telefono_pago || '',
          cedula_titular: data.pago.cedula_titular || '',
          nota: data.pago.nota || ''
        });
        if (data.pago.estado !== 'En revision') setError('Solo se pueden editar pagos agrupados en revision.');
        else if (!data.transacciones_disponibles) setError('La edicion segura requiere MongoDB configurado como replica set. No se pueden guardar cambios en esta instancia.');
      } catch (err) {
        if (!abort.signal.aborted) setError(err.message || 'No se pudo cargar el grupo.');
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    };
    cargar();
    return () => abort.abort();
  }, [open, pagoId, recarga]);

  const fechaSeleccionada = draft?.fecha_pago;
  useEffect(() => {
    setCotizacion(null);
    setErrorTasa('');
    setCargandoTasa(false);
    if (!open || !fechaSeleccionada || !transacciones || grupo?.estado !== 'En revision') return;
    const abort = new AbortController();
    setCargandoTasa(true);
    const cargarTasa = async () => {
      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/pagos/agrupado/${pagoId}/tasa?fecha=${encodeURIComponent(fechaSeleccionada)}`, {
          headers: headers(), signal: abort.signal
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'No se pudo consultar la tasa de la fecha de pago.');
        if (!Number.isFinite(Number(data.tasa)) || Number(data.tasa) <= 0 || data.fecha_pago !== fechaSeleccionada
          || !['USD', 'EUR'].includes(data.moneda)) throw new Error('La tasa recibida no corresponde a la fecha de pago.');
        if (!abort.signal.aborted) setCotizacion(data);
      } catch (err) {
        if (!abort.signal.aborted) setErrorTasa(err.message || 'No se pudo consultar la tasa de la fecha de pago.');
      } finally {
        if (!abort.signal.aborted) setCargandoTasa(false);
      }
    };
    cargarTasa();
    return () => abort.abort();
  }, [open, pagoId, fechaSeleccionada, transacciones, grupo?.estado, recarga, recargaTasa]);

  const tasaDisponible = cotizacion?.fecha_pago === fechaSeleccionada && Number(cotizacion?.tasa) > 0;
  const monedaPago = cotizacion?.moneda || moneda;
  const totalBsCentavos = centavos(draft?.monto_total_bs);
  const totalCentavos = tasaDisponible ? Math.round(totalBsCentavos / cotizacion.tasa) : 0;
  const total = totalCentavos / 100;
  const pesos = asignaciones.map((item) => centavos(item.importe_inicial));
  const reparto = repartirCentavos(totalCentavos, pesos);
  const repartoBs = repartirCentavos(totalBsCentavos, pesos);
  const calculadas = asignaciones.map((item, index) => ({ ...item, monto_pagado: reparto[index] / 100, monto_pagado_bs: repartoBs[index] / 100 }));
  const bloqueado = loading || guardando || !transacciones || grupo?.estado !== 'En revision';
  const cambiar = (campo) => (event) => setDraft((prev) => ({ ...prev, [campo]: event.target.value }));
  const cerrar = () => { if (!guardando) onClose(); };

  const guardar = async (event) => {
    event.preventDefault();
    if (bloqueado || !draft || !tasaDisponible) return;
    setError('');
    if (!Number.isSafeInteger(totalBsCentavos) || totalBsCentavos <= 0
      || Math.abs(Number(draft.monto_total_bs) * 100 - totalBsCentavos) > 0.000001) {
      setError('El monto transferido debe ser positivo y tener como maximo dos decimales.');
      return;
    }
    if (calculadas.some((item) => !Number.isFinite(Number(item.monto_pagado)) || Number(item.monto_pagado) <= 0
      || Math.abs(Number(item.monto_pagado) * 100 - centavos(item.monto_pagado)) > 0.000001)) {
      setError('Los importes de las asignaciones deben ser positivos y tener como maximo dos decimales.');
      return;
    }
    if (calculadas.some((item) => centavos(item.monto_pagado) < centavos(item.monto_pendiente))) {
      setError('El equivalente de cada atleta debe cubrir su saldo pendiente.');
      return;
    }
    if (metodoRequiereReferencia(draft.metodo_pago) && !/^\d{6,}$/.test(String(draft.referencia).trim())) {
      setError('La referencia debe contener al menos seis digitos.');
      return;
    }
    try {
      setGuardando(true);
      const form = new FormData();
      Object.entries(draft).forEach(([campo, value]) => form.append(campo, value));
      form.set('referencia', metodoRequiereReferencia(draft.metodo_pago) ? String(draft.referencia).trim() : '');
      form.append('version', version);
      form.append('monto_total', total.toFixed(2));
      form.append('asignaciones', JSON.stringify(calculadas.map((item) => ({ id_pago: item.id_pago, monto_pagado: Number(item.monto_pagado) }))));
      if (comprobante) form.append('comprobante', comprobante);
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/pagos/agrupado/${pagoId}`, {
        method: 'PATCH', headers: headers(), body: form
      });
      const data = await res.json();
      if (!res.ok) {
        setConflicto(res.status === 409);
        throw new Error(data?.error || 'No se pudo guardar el grupo.');
      }
      await onSaved(data);
    } catch (err) {
      setError(err.message || 'No se pudo guardar el grupo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={open} onClose={cerrar} fullWidth maxWidth="md" component="form" onSubmit={guardar}
      aria-labelledby="editar-grupo-title"
      PaperProps={{ sx: { borderRadius: 2, m: 1.5, width: 'calc(100% - 24px)', maxWidth: 760, maxHeight: 'calc(100% - 24px)', color: '#162647' } }}>
      <DialogTitle id="editar-grupo-title" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, px: { xs: 2, sm: 3 }, py: 1.75, bgcolor: '#fff' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="span" sx={{ fontWeight: 800, fontSize: 14 }}>Editar pago agrupado</Typography>
        </Box>
        <Tooltip title="Cerrar"><IconButton size="small" aria-label="Cerrar editor" onClick={cerrar} disabled={guardando} sx={{ color: '#707b8e' }}><CloseIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
      </DialogTitle>
      <DialogContent sx={{ minWidth: 0, px: { xs: 2, sm: 3 }, pb: 2.5, bgcolor: '#fff', '& .MuiInputBase-root': { fontSize: 13, borderRadius: 1.5 }, '& .MuiInputLabel-root': { fontSize: 12 } }}>
        {grupo && <Box sx={{ bgcolor: '#13224a', color: '#fff', mx: { xs: -2, sm: -3 }, px: { xs: 2, sm: 3 }, py: 2.5, mb: 2.5, minWidth: 0, overflowWrap: 'anywhere' }}>
          <Typography sx={{ color: '#b7c4e2', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', mb: 0.6 }}>Transferencia actual · {grupo.metodo_pago}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 1.25 }}>
            <Typography sx={{ fontSize: { xs: 26, sm: 34 }, fontWeight: 800, lineHeight: 1.15 }}>Bs {Number(grupo.monto_total_bs).toFixed(2)}</Typography>
            <Typography sx={{ fontSize: 15, fontWeight: 700, color: '#ffbe57' }}>{Number(grupo.monto_total).toFixed(2)} {monedaPago}</Typography>
          </Box>
          <Typography sx={{ color: '#b7c4e2', fontSize: 10, mt: 0.9, lineHeight: 1.6 }}>{grupo.codigo} · {String(grupo.estado || '').replace('revision', 'revisión')}</Typography>
        </Box>}
        {loading && <Typography role="status">Cargando pago agrupado...</Typography>}
        {error && <Alert severity="error" sx={{ mb: 2 }} action={conflicto && (
          <Tooltip title="Actualizar grupo"><IconButton aria-label="Actualizar grupo" disabled={guardando} onClick={() => setRecarga((value) => value + 1)}><RefreshIcon /></IconButton></Tooltip>
        )}>{error}</Alert>}
        {errorTasa && <Alert severity="error" sx={{ mb: 2 }} action={
          <Tooltip title="Consultar tasa nuevamente"><IconButton aria-label="Consultar tasa nuevamente" onClick={() => setRecargaTasa((value) => value + 1)} disabled={guardando}><RefreshIcon /></IconButton></Tooltip>
        }>{errorTasa}</Alert>}
        {draft && (
          <>
            <Typography sx={{ fontSize: 10, fontWeight: 800, color: '#68758b', textTransform: 'uppercase', mb: 1.5 }}>Datos del pago</Typography>
            <Box component="section" aria-label="Datos del pago" sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5, '& .MuiTextField-root': { minWidth: 0 } }}>
              <TextField size="small" label="Fecha de pago" type="date" required value={draft.fecha_pago} onChange={cambiar('fecha_pago')} disabled={bloqueado} InputLabelProps={{ shrink: true }} />
              <TextField size="small" select label="Metodo de pago" value={draft.metodo_pago} onChange={cambiar('metodo_pago')} disabled={bloqueado}>
                {metodos.map((metodo) => <MenuItem key={metodo} value={metodo}>{metodo}</MenuItem>)}
              </TextField>
              <TextField size="small" label="Referencia" required={metodoRequiereReferencia(draft.metodo_pago)} value={draft.referencia} onChange={cambiar('referencia')} disabled={bloqueado || !metodoRequiereReferencia(draft.metodo_pago)} inputProps={{ inputMode: 'numeric' }} />
              <TextField size="small" label="Telefono de pago" value={draft.telefono_pago} onChange={cambiar('telefono_pago')} disabled={bloqueado} inputProps={{ inputMode: 'tel' }} />
              <TextField size="small" label="Cedula del titular" value={draft.cedula_titular} onChange={cambiar('cedula_titular')} disabled={bloqueado} />
              <TextField size="small" label="Total transferido (Bs)" type="number" required value={draft.monto_total_bs} onChange={cambiar('monto_total_bs')} disabled={bloqueado} inputProps={{ min: 0.01, step: 0.01 }} />
              <TextField size="small" label="Nota" multiline minRows={2} value={draft.nota} onChange={cambiar('nota')} disabled={bloqueado} inputProps={{ maxLength: 500 }} sx={{ gridColumn: { xs: '1 / -1', md: 'span 2' }, minHeight: 64, '& .MuiOutlinedInput-root': { height: '100%', alignItems: 'flex-start' } }} />
              <Box component="section" aria-label="Comprobante del pago" sx={{ minWidth: 0, minHeight: 64, boxSizing: 'border-box', border: '1px solid #d9dfe9', borderRadius: 1.5, p: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.4 }}>
                <Typography sx={{ fontSize: 10, color: '#748096' }}>Comprobante</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
                  {grupo.comprobante_url && <Button size="small" component="a" href={mediaUrl(grupo.comprobante_url)} target="_blank" rel="noopener noreferrer" startIcon={<AttachFileIcon sx={{ fontSize: 14 }} />} sx={{ fontSize: 11, textTransform: 'none', p: 0.5 }}>Ver comprobante</Button>}
                  <Button size="small" component="label" startIcon={<AttachFileIcon sx={{ fontSize: 14 }} />} disabled={bloqueado} sx={{ fontSize: 11, textTransform: 'none', p: 0.5 }}>
                    Cambiar comprobante
                    <input hidden type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={bloqueado} onChange={(event) => {
                      const archivo = event.target.files?.[0];
                      if (archivo?.size > 10 * 1024 * 1024) { setError('El comprobante no puede superar 10 MB.'); event.target.value = ''; return; }
                      setComprobante(archivo || null);
                    }} />
                  </Button>
                </Box>
                {comprobante && <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0, maxWidth: '100%' }}>
                  <Typography sx={{ fontSize: 10, overflowWrap: 'anywhere', minWidth: 0 }}>{comprobante.name}</Typography>
                  <Tooltip title="Descartar archivo"><IconButton aria-label="Descartar archivo" size="small" disabled={bloqueado} onClick={() => setComprobante(null)}><CloseIcon fontSize="small" /></IconButton></Tooltip>
                </Box>}
              </Box>
            </Box>
            {cargandoTasa && <Typography role="status" sx={{ mt: 2 }}>Consultando tasa de la fecha de pago...</Typography>}
            {tasaDisponible && (
              <Box sx={{ mt: 1.75, py: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 0.5, minWidth: 0, overflowWrap: 'anywhere', borderBottom: '1px solid #edf0f5' }}>
                <Typography sx={{ fontWeight: 700, fontSize: 12 }}>Tasa oficial: {Number(cotizacion.tasa).toLocaleString('en-US', { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 6 })} Bs/{monedaPago}</Typography>
                <Typography sx={{ fontSize: 10, color: '#748096' }}>Publicada: {cotizacion.fecha_tasa}</Typography>
              </Box>
            )}
            <Box sx={{ mt: 2.5 }}>
              <Typography sx={{ fontWeight: 800, fontSize: 10, color: '#68758b', textTransform: 'uppercase', mb: 1 }}>Distribución por atleta</Typography>
              <Box sx={{ border: '1px solid #edf0f5', borderRadius: 1.5, overflow: 'hidden' }}>
              {calculadas.map((item) => (
                <Box key={item.id_pago} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 1.25, alignItems: 'center', px: 1.5, py: 1.1, bgcolor: '#fff', '& + &': { borderTop: '1px solid #edf0f5' } }}>
                  <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 12 }}>{item.alumno_nombre}</Typography>
                    <Typography sx={{ fontSize: 10, color: '#748096', mt: 0.3 }}>Mensualidad {String(item.mes).padStart(2, '0')}/{item.anio} · Saldo: {Number(item.monto_pendiente).toFixed(2)} {monedaPago}</Typography>
                    {tasaDisponible && Number(item.monto_pagado) > Number(item.monto_pendiente) && (
                      <Typography variant="caption" display="block" sx={{ color: '#047857' }}>Excedente: {(Number(item.monto_pagado) - Number(item.monto_pendiente)).toFixed(2)} {monedaPago}</Typography>
                    )}
                  </Box>
                  <Box sx={{ minWidth: 0, textAlign: 'right', overflowWrap: 'anywhere' }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 700 }}>{tasaDisponible ? `Bs ${item.monto_pagado_bs.toFixed(2)}` : '-'}</Typography>
                    <Box component="output" aria-label={`Equivalente ${monedaPago} - ${item.alumno_nombre}`} sx={{ display: 'block', fontSize: 10, color: '#748096', mt: 0.25 }}>
                      {tasaDisponible ? `${item.monto_pagado.toFixed(2)} ${monedaPago}` : '-'}
                    </Box>
                  </Box>
                </Box>
              ))}
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, py: 1.5 }}>
                <Typography sx={{ fontWeight: 700, fontSize: 12 }}>Total {monedaPago}</Typography>
                <Typography sx={{ fontWeight: 800, fontSize: 18, color: '#16786e' }}>{tasaDisponible ? total.toFixed(2) : '-'}</Typography>
              </Box>
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions disableSpacing sx={{ px: { xs: 2, sm: 3 }, py: 1.5, gap: 1, borderTop: '1px solid #edf0f5', bgcolor: '#fff' }}>
        <Button variant="outlined" onClick={cerrar} disabled={guardando} sx={{ color: '#607491', borderColor: '#dce2ed', borderRadius: 1.5, minWidth: 84, height: 36, fontSize: 12, fontWeight: 600, textTransform: 'none', '&:hover': { borderColor: '#b7c4d8', bgcolor: '#f6f8fc' } }}>Cancelar</Button>
        <Button type="submit" variant="contained" startIcon={<SaveIcon sx={{ fontSize: 15 }} />} disabled={bloqueado || !draft || conflicto || !tasaDisponible || cargandoTasa} sx={{ '&&': { bgcolor: '#13224a', borderRadius: 1.5, height: 36, width: 'auto', px: 2, py: 0, mt: 0, fontSize: 12, fontWeight: 700, lineHeight: '20px', whiteSpace: 'nowrap', flexShrink: 0, textTransform: 'none', boxShadow: 'none', '&:hover': { bgcolor: '#223765', boxShadow: 'none' } } }}>
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}