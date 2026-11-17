import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, MenuItem, TextField, Tooltip, Typography
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import PersonRemoveOutlinedIcon from '@mui/icons-material/PersonRemoveOutlined';

const MODALIDADES = { general: 'Monto de campa\u00f1a', personalizado: 'Personalizado', no_aplica: 'No aplica' };
const nombre = (alumno) => `${alumno.nombres} ${alumno.apellidos || ''}`.trim();
const formatoMonto = (monto, moneda) => new Intl.NumberFormat('es-VE', { style: 'currency', currency: moneda }).format(monto);

function CampaniaCargoAjusteDialog({ campania, fila, accion, onClose, onSaved }) {
  const [alumno, setAlumno] = useState(null);
  const [atletas, setAtletas] = useState([]);
  const [cargando, setCargando] = useState(accion === 'agregar');
  const [errorCarga, setErrorCarga] = useState('');
  const [intento, setIntento] = useState(0);
  const [modalidad, setModalidad] = useState(fila?.modalidad || 'general');
  const [monto, setMonto] = useState(fila?.modalidad === 'personalizado' ? String(fila.monto) : '');
  const [nota, setNota] = useState(fila?.nota_interna || '');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [descartar, setDescartar] = useState(false);
  const enviando = useRef(false);
  const solicitud = useRef(null);
  const guardadoController = useRef(null);
  const retirando = accion === 'retirar';
  const elegido = fila || alumno;
  const importePersonal = String(monto).replace(',', '.');
  const importeGeneral = campania.modalidad_monto === 'por_sede'
    ? campania.montos_por_sede?.find((precio) => precio.sede === elegido?.sede?._id)?.monto : campania.monto_general;
  const importe = retirando || modalidad === 'no_aplica' ? 0 : modalidad === 'general' ? importeGeneral : Number(importePersonal);
  const valido = elegido && Number.isFinite(importe) && (retirando || modalidad === 'no_aplica' || importe > 0)
    && (modalidad !== 'personalizado' || retirando || /^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(importePersonal)) && nota.trim().length <= 1000;
  const cambio = alumno || modalidad !== (fila?.modalidad || 'general') || nota !== (fila?.nota_interna || '')
    || monto !== (fila?.modalidad === 'personalizado' ? String(fila.monto) : '');
  const titulo = accion === 'agregar' ? 'Agregar alumno' : retirando ? 'Retirar alumno' : fila.retirado ? 'Reincorporar alumno' : 'Editar cargo';
  const cerrar = () => { if (!enviando.current) { if (cambio) setDescartar(true); else onClose(); } };

  useEffect(() => () => guardadoController.current?.abort(), []);
  useEffect(() => {
    if (accion !== 'agregar') return undefined;
    const controller = new AbortController();
    const cargar = async () => {
      setCargando(true); setErrorCarga('');
      try {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Tu sesi\u00f3n no est\u00e1 disponible.');
        const response = await fetch(`${process.env.REACT_APP_API_URL || window.location.origin}/api/campanias-cobro/${campania._id}/candidatos-cargos`, {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los alumnos.');
        if (!Array.isArray(data.atletas) || data.atletas.some((atleta) => !atleta || typeof atleta._id !== 'string'
          || typeof atleta.nombres !== 'string' || typeof atleta.apellidos !== 'string' || !atleta.sede?._id)) {
          throw new Error('No se pudieron verificar los alumnos disponibles.');
        }
        if (!controller.signal.aborted) setAtletas(data.atletas);
      } catch (err) { if (!controller.signal.aborted) setErrorCarga(err.message); }
      finally { if (!controller.signal.aborted) setCargando(false); }
    };
    cargar();
    return () => controller.abort();
  }, [accion, campania._id, intento]);

  const guardar = async () => {
    if (enviando.current || !valido || cargando || errorCarga) return;
    enviando.current = true; setGuardando(true); setError('');
    const controller = new AbortController();
    guardadoController.current = controller;
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Tu sesi\u00f3n no est\u00e1 disponible.');
      const body = { alumno: fila?.alumno || alumno._id, accion, version: campania.__v,
        ...(fila ? { version_cargo: fila.version } : {}), modalidad: retirando ? 'no_aplica' : modalidad,
        ...(!retirando && modalidad === 'personalizado' ? { monto: Number(importePersonal) } : {}), nota_interna: nota.trim() };
      const contenido = JSON.stringify(body);
      if (solicitud.current?.contenido !== contenido) solicitud.current = { contenido, id: window.crypto.randomUUID() };
      const response = await fetch(`${process.env.REACT_APP_API_URL || window.location.origin}/api/campanias-cobro/${campania._id}/ajustes-cargos`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, solicitud_id: solicitud.current.id }), cache: 'no-store', signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar. Reintenta la misma solicitud.');
      const cargo = data.cargo;
      if (!cargo?._id || cargo.campania !== campania._id || cargo.alumno !== body.alumno
        || (fila && cargo._id !== fila._id) || cargo.moneda !== campania.moneda
        || cargo.modalidad !== body.modalidad || cargo.monto !== importe || cargo.saldo_pendiente !== importe
        || cargo.estado !== (body.modalidad === 'no_aplica' ? 'no_aplica' : 'pendiente')
        || cargo.retirado !== retirando || cargo.__v !== (fila ? fila.version + 1 : 0)) {
        throw new Error('No se pudo verificar el ajuste. Reintenta la misma solicitud o recarga los cargos.');
      }
      if (!controller.signal.aborted) onSaved();
    } catch (err) { if (!controller.signal.aborted) setError(err.message); }
    finally { enviando.current = false; if (!controller.signal.aborted) setGuardando(false); }
  };

  return <><Dialog open fullWidth maxWidth="sm" onClose={cerrar} aria-labelledby="ajuste-cargo-titulo"
    PaperProps={{ sx: { borderRadius: 2, color: '#202441', maxHeight: 'calc(100% - 32px)', m: 2, width: 'calc(100% - 32px)' } }}>
    <DialogTitle component="div" id="ajuste-cargo-cabecera" sx={{ bgcolor: '#171b4b', color: '#fff', display: 'flex', alignItems: 'start', gap: 2, px: 3, py: 2 }}>
      <Typography component="h2" id="ajuste-cargo-titulo" sx={{ flex: 1, fontSize: 20, fontWeight: 700 }}>{titulo}</Typography>
      <Tooltip title="Cerrar"><IconButton aria-label="Cerrar ajuste" disabled={guardando} onClick={cerrar}
        sx={{ width: 32, height: 32, color: '#fff', flexShrink: 0 }}><CloseRoundedIcon fontSize="small" /></IconButton></Tooltip>
    </DialogTitle>
    <DialogContent sx={{ pt: '24px !important', px: 3, '& .MuiInputBase-root': { fontSize: 13, borderRadius: 1.5, bgcolor: '#fff' },
      '& .MuiInputLabel-root': { position: 'static', transform: 'none', maxWidth: '100%', whiteSpace: 'normal', mb: 0.75,
        color: '#30344b', fontSize: 12, fontWeight: 650 },
      '& .MuiOutlinedInput-notchedOutline': { top: 0, borderColor: '#e5e6ed', '& legend': { display: 'none' } },
      '& .MuiInputLabel-root.Mui-focused': { color: '#626879' }, '& .Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#7d849d !important' } }}>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {errorCarga && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" onClick={() => setIntento((valor) => valor + 1)}>Reintentar</Button>}>{errorCarga}</Alert>}
      <Typography sx={{ fontSize: 13, color: '#626879', mb: 2, overflowWrap: 'anywhere' }}>{campania.nombre}</Typography>
      {accion === 'agregar' ? <Autocomplete options={atletas} value={alumno} onChange={(event, valor) => setAlumno(valor)}
        disabled={guardando || cargando || Boolean(errorCarga)} loading={cargando} noOptionsText="Sin alumnos disponibles"
        getOptionLabel={(atleta) => `${nombre(atleta)} · ${atleta.sede.nombre || ''}`}
        isOptionEqualToValue={(opcion, valor) => opcion._id === valor._id}
        renderInput={(params) => <TextField {...params} label="Alumno" size="small" />}
        sx={{ mb: 2 }} /> : <Typography sx={{ fontWeight: 700, mb: 2, overflowWrap: 'anywhere' }}>{nombre(fila)}</Typography>}
      {cargando && <Box role="status" sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 2 }}><CircularProgress size={18} />Cargando alumnos...</Box>}
      {retirando ? <Alert severity="warning" sx={{ mb: 2 }}>{'Se anular\u00e1 el cargo del alumno sin borrar su historial.'}</Alert>
        : <TextField select fullWidth size="small" label={'Condici\u00f3n del cargo'} value={modalidad} disabled={guardando}
          onChange={(event) => setModalidad(event.target.value)} sx={{ mb: 2 }}>
          {Object.entries(MODALIDADES).map(([valor, etiqueta]) => <MenuItem key={valor} value={valor}>{etiqueta}</MenuItem>)}
        </TextField>}
      {!retirando && modalidad === 'personalizado' && <TextField label={`Monto personalizado (${campania.moneda})`} fullWidth size="small"
        value={monto} onChange={(event) => setMonto(event.target.value)} disabled={guardando}
        slotProps={{ htmlInput: { inputMode: 'decimal', maxLength: 12 } }} sx={{ mb: 2 }} />}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 2 }}>
        <Typography sx={{ fontSize: 13, color: '#626879' }}>Nuevo importe</Typography>
        <Typography sx={{ fontSize: 18, fontWeight: 700 }}>{Number.isFinite(importe) ? formatoMonto(importe, campania.moneda) : '-'}</Typography>
      </Box>
      <TextField label="Nota interna" multiline minRows={2} fullWidth size="small" value={nota} disabled={guardando}
        onChange={(event) => setNota(event.target.value)} slotProps={{ htmlInput: { maxLength: 1000 } }} />
    </DialogContent>
    <DialogActions sx={{ px: 3, py: 2, gap: 1, flexWrap: 'wrap' }}>
      <Button onClick={cerrar} disabled={guardando} sx={{ color: '#50566e', textTransform: 'none' }}>Cancelar</Button>
      <Button onClick={guardar} disabled={!valido || cargando || Boolean(errorCarga) || guardando} variant="contained"
        startIcon={guardando ? <CircularProgress size={16} color="inherit" /> : retirando ? <PersonRemoveOutlinedIcon /> : <SaveOutlinedIcon />}
        sx={{ bgcolor: '#171b4b', '&:hover': { bgcolor: '#252b60' }, borderRadius: 1.5, boxShadow: 'none', textTransform: 'none' }}>
        {retirando ? 'Confirmar retiro' : 'Guardar ajuste'}
      </Button>
    </DialogActions>
  </Dialog>
  <Dialog open={descartar} onClose={() => setDescartar(false)} aria-labelledby="descartar-ajuste-titulo" maxWidth="xs" fullWidth>
    <DialogTitle id="descartar-ajuste-titulo">Cambios sin guardar</DialogTitle>
    <DialogContent>{'Se perder\u00e1n los cambios de este ajuste.'}</DialogContent>
    <DialogActions sx={{ flexWrap: 'wrap' }}><Button autoFocus onClick={() => setDescartar(false)}>Seguir editando</Button>
      <Button onClick={onClose} sx={{ color: '#a33142' }}>Descartar cambios</Button></DialogActions>
  </Dialog></>;
}

export default CampaniaCargoAjusteDialog;