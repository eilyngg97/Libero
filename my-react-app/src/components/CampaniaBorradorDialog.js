import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, IconButton, InputAdornment, Switch, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography, useMediaQuery, useTheme
} from '@mui/material';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CampaniaPasos from './CampaniaPasos';
import CampaniaDialog from './CampaniaDialog';
import { tieneMontosValidos } from '../utils/campaniaMontos';

const API_BASE = process.env.REACT_APP_API_URL || window.location.origin;

function CampaniaBorradorDialog({ campania, onClose, onSaved, onContinue }) {
  const [form, setForm] = useState(() => ({
    nombre: campania?.nombre || '', descripcion: campania?.descripcion || '',
    modalidad_monto: campania?.modalidad_monto || 'unico',
    monto_general: campania?.monto_general != null ? String(campania.monto_general) : '',
    montos_por_sede: Object.fromEntries((campania?.montos_por_sede || []).map((item) => [item.sede, String(item.monto)])),
    sedes: (campania?.sedes || []).filter(Boolean).map((sede) => sede._id),
    vencimiento: campania?.vencimiento || '', permitir_abonos: campania?.permitir_abonos === true
  }));
  const [opciones, setOpciones] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorOpciones, setErrorOpciones] = useState('');
  const [intento, setIntento] = useState(0);
  const [error, setError] = useState('');
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [modificado, setModificado] = useState(false);
  const [descartar, setDescartar] = useState(false);
  const enviando = useRef(false);
  const solicitud = useRef('');
  const guardadoController = useRef(null);
  const fullScreen = useMediaQuery(useTheme().breakpoints.down('sm'));

  useEffect(() => () => guardadoController.current?.abort(), []);

  useEffect(() => {
    const controller = new AbortController();
    const cargar = async () => {
      setCargando(true);
      setErrorOpciones('');
      try {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Tu sesión no está disponible. Inicia sesión nuevamente.');
        const response = await fetch(`${API_BASE}/api/campanias-cobro/opciones`, {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store'
        });
        if (!response.ok) throw new Error('No se pudieron cargar las sedes y la moneda de la academia.');
        const data = await response.json();
        if (!['USD', 'EUR'].includes(data.moneda) || !Array.isArray(data.sedes)
          || data.sedes.some((sede) => !sede || typeof sede._id !== 'string' || typeof sede.nombre !== 'string')) {
          throw new Error('Las opciones recibidas no son válidas. Intenta nuevamente.');
        }
        if (!controller.signal.aborted) setOpciones(data);
      } catch (err) {
        if (!controller.signal.aborted) setErrorOpciones(err.message || 'No se pudieron cargar las opciones.');
      } finally {
        if (!controller.signal.aborted) setCargando(false);
      }
    };
    cargar();
    return () => controller.abort();
  }, [intento]);

  const cambiar = (campo, valor) => {
    setForm((actual) => ({ ...actual, [campo]: valor }));
    setModificado(true);
    setErrores((actual) => ({ ...actual, [campo]: '' }));
  };
  const cambiarMontoSede = (id, valor) => {
    setForm((actual) => ({ ...actual, montos_por_sede: { ...actual.montos_por_sede, [id]: valor } }));
    setModificado(true);
    setErrores((actual) => ({ ...actual, [`monto_${id}`]: '' }));
  };
  const cerrar = () => {
    if (enviando.current) return;
    if (modificado) setDescartar(true);
    else onClose();
  };
  const monedaCambio = Boolean(campania && opciones && campania.moneda !== opciones.moneda);
  const sedesFaltantes = opciones && form.sedes.some((id) => !opciones.sedes.some((sede) => sede._id === id));
  const puedeGuardar = opciones && opciones.sedes.length > 0 && !cargando && !errorOpciones && !monedaCambio && !guardando;
  const moneda = campania?.moneda || opciones?.moneda || '';
  const seccionSx = { minWidth: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '160px minmax(0, 1fr)' },
    gap: { xs: 1.75, sm: 3 }, py: 3, '& + section': { borderTop: '1px solid #f0f1f5' } };
  const tituloSeccion = (numero, titulo, detalle) => <Box sx={{ minWidth: 0, pt: { sm: 0.25 } }}>
    <Typography aria-hidden="true" sx={{ color: '#bd4779', fontSize: 10, fontWeight: 750, mb: 0.5 }}>{numero}</Typography>
    <Typography component="h3" sx={{ color: '#202441', fontSize: 14, fontWeight: 750, lineHeight: 1.35 }}>{titulo}</Typography>
    {detalle && <Typography sx={{ fontSize: 12, color: '#858999', mt: 0.5 }}
      aria-label={numero === '02' ? 'Moneda de la academia' : undefined}>{detalle}</Typography>}
  </Box>;

  const guardar = async (event, continuar = false) => {
    event.preventDefault();
    if (enviando.current || !puedeGuardar) return;
    const monto = form.monto_general.replace(',', '.');
    const nuevosErrores = {};
    if (!form.nombre.trim() || form.nombre.trim().length > 150) nuevosErrores.nombre = 'Indica un nombre de hasta 150 caracteres.';
    if (form.descripcion.trim().length > 2000) nuevosErrores.descripcion = 'La descripción admite hasta 2000 caracteres.';
    const montoValido = (valor) => /^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(valor) && Number(valor) > 0;
    if (form.modalidad_monto === 'unico' && !montoValido(monto)) {
      nuevosErrores.monto_general = 'Indica un monto mayor que cero, con hasta dos decimales.';
    }
    if (form.modalidad_monto === 'por_sede') {
      form.sedes.forEach((id) => {
        if (!montoValido((form.montos_por_sede[id] || '').replace(',', '.'))) {
          nuevosErrores[`monto_${id}`] = 'Indica un monto mayor que cero, con hasta dos decimales.';
        }
      });
    }
    if (!form.sedes.length || sedesFaltantes) nuevosErrores.sedes = 'Selecciona al menos una sede disponible.';
    if (form.vencimiento) {
      const fecha = new Date(`${form.vencimiento}T12:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(form.vencimiento) || Number(form.vencimiento.slice(0, 4)) < 1900
        || Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== form.vencimiento) {
        nuevosErrores.vencimiento = 'Indica una fecha válida.';
      }
    }
    setErrores(nuevosErrores);
    if (Object.keys(nuevosErrores).length) {
      window.requestAnimationFrame(() => {
        const invalido = document.querySelector('#campania-borrador-form [aria-invalid="true"]');
        invalido?.focus();
        invalido?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      });
      return;
    }
    enviando.current = true;
    setGuardando(true);
    setError('');
    const controller = new AbortController();
    guardadoController.current = controller;
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Tu sesión no está disponible. Inicia sesión nuevamente.');
      const body = { nombre: form.nombre.trim(), descripcion: form.descripcion.trim(), modalidad_monto: form.modalidad_monto,
        monto_general: form.modalidad_monto === 'unico' ? monto : null,
        montos_por_sede: form.modalidad_monto === 'por_sede'
          ? form.sedes.map((id) => ({ sede: id, monto: form.montos_por_sede[id].replace(',', '.') })) : [],
        moneda: opciones.moneda, sedes: form.sedes, vencimiento: form.vencimiento, permitir_abonos: form.permitir_abonos };
      if (campania) body.version = campania.__v;
      else {
        if (!solicitud.current) solicitud.current = window.crypto.randomUUID();
        body.solicitud_id = solicitud.current;
      }
      const response = await fetch(`${API_BASE}/api/campanias-cobro${campania ? `/${campania._id}` : ''}`, {
        method: campania ? 'PATCH' : 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: controller.signal, cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar el borrador. Intenta nuevamente.');
      const guardada = data.campania;
      if (!guardada || typeof guardada._id !== 'string' || guardada.estado !== 'borrador'
        || typeof guardada.nombre !== 'string' || !tieneMontosValidos(guardada)
        || !['USD', 'EUR'].includes(guardada.moneda) || !Array.isArray(guardada.sedes) || !Number.isInteger(guardada.__v)) {
        throw new Error('No se pudo verificar el guardado. Revisa el listado antes de crear otra campaña.');
      }
      if (!controller.signal.aborted) (continuar ? onContinue : onSaved)(guardada);
    } catch (err) {
      if (!controller.signal.aborted) setError(err.message || 'No se pudo guardar el borrador.');
    } finally {
      enviando.current = false;
      if (!controller.signal.aborted) setGuardando(false);
    }
  };

  return <>
    <CampaniaDialog open onClose={cerrar} fullWidth maxWidth="md" fullScreen={fullScreen}
      aria-labelledby="campania-borrador-titulo" PaperProps={{ sx: { borderRadius: { xs: 0, sm: 2 }, maxWidth: 880, color: '#202441' } }}>
      <DialogTitle component="div" id="campania-borrador-cabecera" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2,
        bgcolor: '#171b4b', color: '#fff', px: { xs: 2.5, sm: 4 }, py: 2.75, flexShrink: 0 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 10, fontWeight: 800, color: '#f28cbd', mb: 0.75 }}>COBROS ADICIONALES</Typography>
          <Typography component="h2" id="campania-borrador-titulo" sx={{ fontSize: 22, fontWeight: 750, lineHeight: 1.25 }}>
            {campania && !onContinue ? 'Editar borrador' : 'Crear campaña'}
          </Typography>
        </Box>
        <Tooltip title="Cerrar"><span><IconButton aria-label="Cerrar formulario" onClick={cerrar} disabled={guardando}
          sx={{ color: '#d8daea', bgcolor: 'rgba(255,255,255,0.07)', borderRadius: 1, width: 32, height: 32,
            '&:hover': { bgcolor: 'rgba(255,255,255,0.14)' } }}><CloseRoundedIcon sx={{ fontSize: 18 }} /></IconButton></span></Tooltip>
      </DialogTitle>
      <DialogContent sx={{ px: { xs: 2.5, sm: 4 }, pt: '0 !important', pb: 0, bgcolor: '#fff',
        '& .MuiTextField-root': { minWidth: 0 },
        '& .MuiInputBase-root': { fontSize: 13, borderRadius: 1.5, minHeight: 42, bgcolor: '#fff' },
        '& .MuiInputLabel-root': { position: 'static', transform: 'none', maxWidth: '100%', mb: 0.75,
          color: '#30344b', fontSize: 12, fontWeight: 650, lineHeight: 1.5, '&.Mui-focused': { color: '#30344b' } },
        '& .MuiFormLabel-asterisk': { color: '#bd4779' },
        '& .MuiOutlinedInput-input': { p: '10px 12px' },
        '& .MuiInputBase-multiline': { p: '10px 12px', '& textarea': { p: 0 } },
        '& .MuiOutlinedInput-notchedOutline': { top: 0, borderColor: '#e5e6ed', '& legend': { display: 'none' } },
        '& .MuiInputBase-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#b7bdcd' },
        '& .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#7d849d', borderWidth: 1 },
        '& .MuiInputAdornment-positionEnd': { height: 'auto', maxHeight: 'none', alignSelf: 'stretch', display: 'flex', alignItems: 'center',
          bgcolor: '#f7f8fb', px: 1.5, mr: -1.75, ml: 1, borderLeft: '1px solid #eceef4', borderRadius: '0 6px 6px 0',
          '& .MuiTypography-root': { fontSize: 11, color: '#667085' } },
        '& .MuiFormHelperText-root': { color: '#858999', fontSize: 11, ml: 0, mt: 0.75 },
        '& .MuiFormHelperText-root.Mui-error': { color: 'error.main' } }}>
        {onContinue && <CampaniaPasos paso={0} />}
        {cargando && <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <CircularProgress size={20} /><Typography>Cargando sedes y moneda...</Typography>
        </Box>}
        {errorOpciones && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit"
          onClick={() => setIntento((actual) => actual + 1)}>Reintentar</Button>}>{errorOpciones}</Alert>}
        {opciones && !opciones.sedes.length && <Alert severity="warning" sx={{ mb: 2 }}>Primero debes registrar una sede en la academia.</Alert>}
        {monedaCambio && <Alert severity="warning" sx={{ mb: 2 }}>La moneda de la academia cambió desde que se creó este borrador. No se realizará una conversión automática.</Alert>}
        {sedesFaltantes && <Alert severity="warning" sx={{ mb: 2 }}>Hay sedes del borrador que ya no están disponibles. Revisa la selección antes de guardar.</Alert>}
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box component="form" id="campania-borrador-form" aria-label="Datos del borrador" noValidate onSubmit={(event) => guardar(event, Boolean(onContinue))}
          sx={{ minWidth: 0 }}>
          <Box component="section" aria-label="Datos de la campaña" sx={seccionSx}>
            {tituloSeccion('01', 'Datos de la campaña', 'Visible para los representantes.')}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) minmax(0, 1fr)' }, gap: 1.75, minWidth: 0, alignItems: 'start' }}>
              <TextField label="Nombre" placeholder="Ej. Uniforme temporada 2027" required value={form.nombre} disabled={guardando || !opciones}
                onChange={(event) => cambiar('nombre', event.target.value)} error={Boolean(errores.nombre)} helperText={errores.nombre}
                slotProps={{ htmlInput: { maxLength: 150 } }} />
              <TextField label="Descripción pública" placeholder="Qué incluye este cobro y para qué se usa." value={form.descripcion} disabled={guardando || !opciones}
                onChange={(event) => cambiar('descripcion', event.target.value)} error={Boolean(errores.descripcion)} helperText={errores.descripcion}
                slotProps={{ htmlInput: { maxLength: 2000 } }} />
            </Box>
          </Box>
          <Box component="section" aria-label="Sedes e importes" sx={seccionSx}>
            {tituloSeccion('02', 'Sedes e importes', `Moneda: ${moneda || '...'}`)}
            <Box sx={{ minWidth: 0 }}>
          <Autocomplete multiple size="small" options={opciones?.sedes || []} disableCloseOnSelect disabled={guardando || !opciones}
            value={(opciones?.sedes || []).filter((sede) => form.sedes.includes(sede._id))}
            getOptionLabel={(sede) => sede.nombre} isOptionEqualToValue={(primera, segunda) => primera._id === segunda._id}
            onChange={(event, seleccionadas) => cambiar('sedes', seleccionadas.map((sede) => sede._id))}
            renderOption={(props, sede, { selected }) => { const { key, ...opcionProps } = props; return <li key={key} {...opcionProps}>
              <Checkbox checked={selected} tabIndex={-1} disableRipple sx={{ mr: 1, p: 0.5, color: '#98a2b3', '&.Mui-checked': { color: '#475569' } }} />
              <Box component="span" sx={{ overflowWrap: 'anywhere' }}>{sede.nombre}</Box>
            </li>; }}
            sx={{ mb: 2.5, '& .MuiAutocomplete-inputRoot': { py: '4px !important', pl: 0.75 },
              '& .MuiAutocomplete-inputRoot .MuiAutocomplete-input': { p: '4px !important', minWidth: '50px !important' },
              '& .MuiChip-root': { maxWidth: 'calc(100% - 8px)', height: 26, borderRadius: 1, bgcolor: '#f0f2f9', fontSize: 11, color: '#3e4465',
                '& .MuiChip-deleteIcon': { fontSize: 15, color: '#8b90a8' } } }}
            renderInput={(params) => <TextField {...params} label="Sedes participantes" placeholder={form.sedes.length ? '' : 'Seleccionar sedes'} required error={Boolean(errores.sedes)} helperText={errores.sedes} />} />
          <Typography sx={{ color: '#30344b', fontSize: 12, fontWeight: 650, mb: 0.75 }}>Importe por atleta</Typography>
            <ToggleButtonGroup exclusive value={form.modalidad_monto} aria-label="Modalidad del monto" disabled={guardando || !opciones}
              onChange={(event, valor) => { if (valor) cambiar('modalidad_monto', valor); }}
              sx={{ width: '100%', mb: 1.25, bgcolor: '#f0f1f6', p: 0.5, borderRadius: 1.5,
                '& .MuiToggleButtonGroup-grouped': { m: 0, border: '0 !important', borderRadius: '4px !important' },
                '& .MuiToggleButton-root': { flex: '1 1 0', minWidth: 0, px: 1, py: 0.9, fontSize: 12,
                  fontWeight: 500, whiteSpace: 'nowrap', textTransform: 'none', color: '#6f748b',
                  '&.Mui-selected': { color: '#262b48', bgcolor: '#fff', boxShadow: '0 1px 4px rgba(27,34,65,0.14)',
                    '&:hover': { bgcolor: '#fff' } } } }}>
              <ToggleButton value="unico">Monto único</ToggleButton>
              <ToggleButton value="por_sede">Monto por sede</ToggleButton>
            </ToggleButtonGroup>
          {form.modalidad_monto === 'unico' && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '200px minmax(0, 1fr)' }, gap: 1.5, alignItems: 'start' }}>
            <TextField placeholder="0,00" required value={form.monto_general} disabled={guardando || !opciones}
              onChange={(event) => cambiar('monto_general', event.target.value)} error={Boolean(errores.monto_general)} helperText={errores.monto_general}
              slotProps={{ htmlInput: { 'aria-label': 'Monto general', inputMode: 'decimal', maxLength: 12 },
                input: { endAdornment: <InputAdornment position="end">{moneda}</InputAdornment> } }} />
            <Typography sx={{ color: '#858999', fontSize: 11, pt: { md: 1.5 } }}>
              {form.sedes.length ? `Mismo importe en ${form.sedes.length === 1 ? 'la sede seleccionada' : `las ${form.sedes.length} sedes`}.` : 'Mismo importe en todas las sedes.'}
            </Typography>
          </Box>}
          {form.modalidad_monto === 'por_sede' && <Box>
            {!form.sedes.length && <Typography sx={{ color: '#667085', fontSize: 13, py: 1 }}>Sin sedes seleccionadas.</Typography>}
            {(opciones?.sedes || []).filter((sede) => form.sedes.includes(sede._id)).map((sede) => <Box key={sede._id}
              sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr) minmax(0, 145px)', sm: 'minmax(0, 1fr) 220px' }, alignItems: 'center',
                gap: 1.5, py: 1.25, '& + div': { borderTop: '1px solid #edf0f5' } }}>
              <Typography sx={{ color: '#344054', fontSize: 14, fontWeight: 650, overflowWrap: 'anywhere' }}>{sede.nombre}</Typography>
              <TextField placeholder="0,00" required value={form.montos_por_sede[sede._id] || ''}
                disabled={guardando} onChange={(event) => cambiarMontoSede(sede._id, event.target.value)}
                error={Boolean(errores[`monto_${sede._id}`])} helperText={errores[`monto_${sede._id}`]}
                slotProps={{ htmlInput: { 'aria-label': `Monto de ${sede.nombre}`, inputMode: 'decimal', maxLength: 12 },
                  input: { endAdornment: <InputAdornment position="end">{moneda}</InputAdornment> } }} />
            </Box>)}
          </Box>}
            </Box>
          </Box>
          <Box component="section" aria-label="Condiciones de pago" sx={seccionSx}>
            {tituloSeccion('03', 'Condiciones de pago')}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, alignItems: 'start', minWidth: 0 }}>
              <TextField type="date" label="Vencimiento (opcional)" value={form.vencimiento} disabled={guardando || !opciones}
                onChange={(event) => cambiar('vencimiento', event.target.value)} error={Boolean(errores.vencimiento)}
                helperText={errores.vencimiento || 'No genera recargos por mora.'} slotProps={{ inputLabel: { shrink: true } }} />
              <Box sx={{ border: '1px solid #e9eaf0', borderRadius: 1.5, px: 1.5, py: 1.25, mt: { md: 3 }, minWidth: 0 }}>
                <FormControlLabel sx={{ m: 0, alignItems: 'flex-start', gap: 1, '& .MuiFormControlLabel-label': { minWidth: 0 } }}
                  control={<Switch size="small" checked={form.permitir_abonos} disabled={guardando || !opciones}
                    slotProps={{ input: { role: 'switch', 'aria-label': 'Permitir abonos individuales' } }}
                    onChange={(event) => cambiar('permitir_abonos', event.target.checked)}
                    sx={{ mt: -0.25, ml: -0.5, '& .MuiSwitch-switchBase': { color: '#fff' },
                      '& .MuiSwitch-thumb': { boxShadow: '0 1px 3px rgba(16,24,40,0.25)' },
                      '& .MuiSwitch-track': { bgcolor: '#98a2b3', opacity: 1 },
                      '& .MuiSwitch-switchBase.Mui-checked': { color: '#fff' },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#d93670', opacity: 1 },
                      '& .MuiSwitch-switchBase.Mui-disabled + .MuiSwitch-track': { opacity: 0.35 } }} />}
                  label={<Box component="span" sx={{ display: 'block' }}>
                    <Typography component="span" sx={{ display: 'block', fontSize: 12, fontWeight: 650, color: '#30344b', lineHeight: 1.4 }}>Permitir abonos individuales</Typography>
                    <Typography component="span" sx={{ display: 'block', fontSize: 11, color: '#858999', mt: 0.25, lineHeight: 1.4 }}>Los pagos agrupados cubren el saldo completo.</Typography>
                  </Box>} />
              </Box>
            </Box>
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: { xs: 2.5, sm: 4 }, py: 1.75, gap: 2, borderTop: '1px solid #f0f1f5', bgcolor: '#fafafe',
        flexShrink: 0, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) auto' }, '& > :not(style) ~ :not(style)': { ml: 0 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
          <Typography sx={{ fontSize: 9, fontWeight: 750, color: '#96701b', bgcolor: '#fff7dd', px: 1, py: 0.5,
            borderRadius: 1, textTransform: 'uppercase', flexShrink: 0 }}>Borrador</Typography>
          <Typography sx={{ fontSize: 11, color: '#858999', lineHeight: 1.5 }}>No genera cargos ni envía avisos.</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={cerrar} disabled={guardando} sx={{ color: '#50566e', textTransform: 'none', fontSize: 12, height: 40, px: 1.5 }}>Cancelar</Button>
        <Button type={onContinue ? 'button' : 'submit'} form="campania-borrador-form" variant={onContinue ? 'text' : 'contained'} disabled={!puedeGuardar}
          onClick={onContinue ? (event) => guardar(event) : undefined}
          startIcon={guardando ? <CircularProgress size={18} color="inherit" /> : <SaveOutlinedIcon />}
          sx={{ '&&': { m: 0, width: 'auto', borderRadius: 1.5, px: { xs: 1.5, sm: 2 }, py: 1, fontSize: 12, minHeight: 40, whiteSpace: 'nowrap', textTransform: 'none', color: onContinue ? '#50566e' : '#fff', bgcolor: onContinue ? 'transparent' : '#171b4b', boxShadow: 'none', '&:hover': { bgcolor: onContinue ? '#f0f1f5' : '#252b60', boxShadow: 'none' } } }}>
          {guardando ? 'Guardando...' : 'Guardar borrador'}
        </Button>
        {onContinue && <Button type="submit" form="campania-borrador-form" variant="contained" disabled={!puedeGuardar}
          endIcon={<ArrowForwardRoundedIcon />} sx={{ '&&': { m: 0, width: 'auto', bgcolor: '#171b4b', '&:hover': { bgcolor: '#252b60' },
            boxShadow: 'none', borderRadius: 1.5, minHeight: 40, fontSize: 12, textTransform: 'none', px: 2 } }}>Continuar</Button>}
        </Box>
      </DialogActions>
    </CampaniaDialog>
    <Dialog open={descartar} onClose={() => setDescartar(false)} aria-labelledby="descartar-borrador-titulo" maxWidth="xs" fullWidth>
      <DialogTitle id="descartar-borrador-titulo">Descartar cambios</DialogTitle>
      <DialogContent>Los cambios que no hayas guardado se perderán. El borrador guardado anteriormente no se modificará.</DialogContent>
      <DialogActions sx={{ p: 2, flexWrap: 'wrap', gap: 1 }}>
        <Button autoFocus onClick={() => setDescartar(false)} sx={{ color: '#475569' }}>Seguir editando</Button>
        <Button onClick={onClose} sx={{ color: '#a33142' }}>Descartar cambios</Button>
      </DialogActions>
    </Dialog>
  </>;
}

export default CampaniaBorradorDialog;