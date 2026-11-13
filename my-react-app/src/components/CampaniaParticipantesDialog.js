import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Avatar, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, IconButton, InputAdornment, MenuItem, TablePagination, TextField, ToggleButton,
  ToggleButtonGroup, Tooltip, Typography, useMediaQuery, useTheme
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import FilterAltOffRoundedIcon from '@mui/icons-material/FilterAltOffRounded';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import CampaniaPasos from './CampaniaPasos';
import CampaniaDialog from './CampaniaDialog';
import { mediaUrl } from '../utils/mediaUrl';
import { tieneMontosValidos } from '../utils/campaniaMontos';

const API_BASE = process.env.REACT_APP_API_URL || window.location.origin;
const TIPOS_MENSUALIDAD = [
  { id: 'monto_sede', label: 'Monto sede' },
  { id: 'media_beca', label: 'Media beca (50%)' },
  { id: 'monto_personalizado', label: 'Monto personalizado' },
  { id: 'beca_completa', label: 'Beca completa' }
];
const normalizar = (valor) => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const nombreCompleto = (persona) => [persona?.nombres, persona?.apellidos].filter(Boolean).join(' ');
const fechaInscripcion = (valor) => {
  if (!valor) return 'Sin fecha registrada';
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? 'Sin fecha registrada' : fecha.toLocaleDateString('es-VE', { timeZone: 'UTC' });
};
const CONDICION_GENERAL = { modalidad: 'general', monto: '', nota_interna: '' };
const montoValido = (valor) => /^(0|[1-9]\d{0,8})(\.\d{1,2})?$/.test(String(valor)) && Number(valor) > 0;
const leerCondiciones = (borrador) => Object.fromEntries((borrador?.condiciones_participantes || [])
  .map((condicion) => [condicion.alumno, { modalidad: condicion.modalidad, monto: String(condicion.monto ?? ''), nota_interna: condicion.nota_interna }]));
const serializarCondiciones = (condiciones, seleccion) => Object.entries(condiciones)
  .filter(([id, condicion]) => seleccion.has(id) && (condicion.modalidad !== 'general' || condicion.nota_interna.trim()))
  .map(([alumno, condicion]) => ({ alumno, modalidad: condicion.modalidad,
    ...(condicion.modalidad === 'personalizado' ? { monto: Number(String(condicion.monto).replace(',', '.')) } : {}),
    nota_interna: condicion.nota_interna.trim() }))
  .sort((primera, segunda) => primera.alumno.localeCompare(segunda.alumno));
const condicionesValidas = (borrador) => {
  const condiciones = borrador.condiciones_participantes ?? [];
  return Array.isArray(condiciones) && condiciones.length <= borrador.participantes.length
    && new Set(condiciones.map((condicion) => condicion?.alumno)).size === condiciones.length
    && condiciones.every((condicion) => condicion && typeof condicion.alumno === 'string'
      && borrador.participantes.includes(condicion.alumno) && ['general', 'personalizado', 'no_aplica'].includes(condicion.modalidad)
      && typeof condicion.nota_interna === 'string' && condicion.nota_interna.length <= 1000
      && (condicion.modalidad === 'personalizado' ? typeof condicion.monto === 'number' && montoValido(condicion.monto) : condicion.monto == null));
};
const montoCampania = (borrador, atleta) => borrador.modalidad_monto === 'por_sede'
  ? borrador.montos_por_sede?.find((precio) => precio.sede === atleta.sede?._id)?.monto : borrador.monto_general;
const formatoMonto = (monto, moneda) => typeof monto === 'number' && Number.isFinite(monto)
  ? new Intl.NumberFormat('es-VE', { style: 'currency', currency: moneda }).format(monto) : 'Sin monto de sede';

function CampaniaParticipantesDialog({ campania, onClose, onSaved, onContinue, onBack }) {
  const fullScreen = useMediaQuery(useTheme().breakpoints.down('sm'));
  const [datos, setDatos] = useState(null);
  const [seleccion, setSeleccion] = useState(new Set());
  const [condiciones, setCondiciones] = useState({});
  const [condicionAbierta, setCondicionAbierta] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [descartar, setDescartar] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [sede, setSede] = useState('');
  const [categoria, setCategoria] = useState('');
  const [tipoMensualidad, setTipoMensualidad] = useState('');
  const [inscripcionDesde, setInscripcionDesde] = useState('');
  const [inscripcionHasta, setInscripcionHasta] = useState('');
  const [vista, setVista] = useState('todos');
  const [pagina, setPagina] = useState(0);
  const [filas, setFilas] = useState(10);
  const enviando = useRef(false);
  const guardadoController = useRef(null);

  useEffect(() => () => guardadoController.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    const cargar = async () => {
      setCargando(true);
      setErrorCarga('');
      try {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Tu sesión no está disponible. Inicia sesión nuevamente.');
        const response = await fetch(`${API_BASE}/api/campanias-cobro/${campania._id}/participantes`, {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los participantes.');
        const borrador = data.campania;
        if (!borrador || borrador._id !== campania._id || borrador.estado !== 'borrador' || !Number.isInteger(borrador.__v)
          || !Array.isArray(borrador.sedes) || !Array.isArray(borrador.participantes)
          || borrador.participantes.some((id) => typeof id !== 'string')
          || new Set(borrador.participantes).size !== borrador.participantes.length
          || !Array.isArray(data.atletas) || data.atletas.some((atleta) => !atleta || typeof atleta._id !== 'string'
            || typeof atleta.nombres !== 'string' || typeof atleta.apellidos !== 'string' || typeof atleta.disponible !== 'boolean')
          || new Set(data.atletas.map((atleta) => atleta._id)).size !== data.atletas.length
          || borrador.participantes.some((id) => !data.atletas.some((atleta) => atleta._id === id)) || !condicionesValidas(borrador)) {
          throw new Error('No se pudo verificar la lista de participantes. Intenta nuevamente.');
        }
        if (!controller.signal.aborted) {
          setDatos(data);
          setSeleccion(new Set(borrador.participantes));
          setCondiciones(leerCondiciones(borrador));
        }
      } catch (err) {
        if (!controller.signal.aborted) setErrorCarga(err.message || 'No se pudieron cargar los participantes.');
      } finally {
        if (!controller.signal.aborted) setCargando(false);
      }
    };
    cargar();
    return () => controller.abort();
  }, [campania._id, intento]);

  const inicial = new Set(datos?.campania.participantes || []);
  const condicionesGuardables = serializarCondiciones(condiciones, seleccion);
  const condicionesModificadas = datos && JSON.stringify(condicionesGuardables)
    !== JSON.stringify(serializarCondiciones(leerCondiciones(datos.campania), inicial));
  const modificado = datos && (seleccion.size !== inicial.size || [...seleccion].some((id) => !inicial.has(id)) || condicionesModificadas);
  const condicionInvalida = Object.entries(condiciones).find(([id, condicion]) => seleccion.has(id)
    && ((condicion.modalidad === 'personalizado' && !montoValido(String(condicion.monto).replace(',', '.'))) || condicion.nota_interna.trim().length > 1000));
  const atletas = datos?.atletas || [];
  const sedes = [...new Map([...(datos?.campania.sedes || []), ...atletas.map((atleta) => atleta.sede)]
    .filter((item) => item?._id && item.nombre).map((item) => [item._id, item])).values()];
  const categorias = [...new Set(atletas.map((atleta) => atleta.categoria || '').filter(Boolean))].sort((primera, segunda) => primera.localeCompare(segunda, 'es'));
  const rangoInvalido = Boolean(inscripcionDesde && inscripcionHasta && inscripcionDesde > inscripcionHasta);
  const filtrados = atletas.filter((atleta) => {
    if (rangoInvalido || (sede && atleta.sede?._id !== sede) || (categoria && atleta.categoria !== categoria)
      || (tipoMensualidad && atleta.tipo_mensualidad !== tipoMensualidad)
      || (vista === 'seleccionados' && !seleccion.has(atleta._id))
      || !normalizar(`${nombreCompleto(atleta)} ${nombreCompleto(atleta.representante)}`).includes(normalizar(busqueda).trim())) return false;
    if (inscripcionDesde || inscripcionHasta) {
      const fecha = atleta.fecha_inscripcion ? new Date(atleta.fecha_inscripcion) : null;
      if (!fecha || Number.isNaN(fecha.getTime())) return false;
      const dia = fecha.toISOString().slice(0, 10);
      return (!inscripcionDesde || dia >= inscripcionDesde) && (!inscripcionHasta || dia <= inscripcionHasta);
    }
    return true;
  });
  const paginaActual = Math.min(pagina, Math.max(0, Math.ceil(filtrados.length / filas) - 1));
  const visibles = filtrados.slice(paginaActual * filas, (paginaActual + 1) * filas);
  const elegibles = visibles.filter((atleta) => atleta.disponible || inicial.has(atleta._id));
  const marcados = elegibles.filter((atleta) => seleccion.has(atleta._id)).length;
  const alternar = (ids, marcar) => setSeleccion((actual) => {
    const siguiente = new Set(actual);
    ids.forEach((id) => { if (marcar) siguiente.add(id); else siguiente.delete(id); });
    return siguiente;
  });
  const cambiarCondicion = (id, cambios) => setCondiciones((actuales) => ({ ...actuales,
    [id]: { ...(actuales[id] || CONDICION_GENERAL), ...cambios } }));
  const hayFiltros = Boolean(busqueda || sede || categoria || tipoMensualidad || inscripcionDesde || inscripcionHasta || vista !== 'todos');
  const limpiarFiltros = () => {
    setBusqueda(''); setSede(''); setCategoria(''); setTipoMensualidad('');
    setInscripcionDesde(''); setInscripcionHasta(''); setVista('todos'); setPagina(0);
  };
  const cerrar = () => {
    if (enviando.current) return;
    if (modificado) setDescartar(true);
    else onClose();
  };
  const guardar = async (destino = onSaved) => {
    if (enviando.current || !datos || cargando || errorCarga || condicionInvalida) return;
    if (!modificado) {
      if (onContinue) destino(datos.campania);
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
      const participantes = [...seleccion];
      const response = await fetch(`${API_BASE}/api/campanias-cobro/${campania._id}/participantes`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ participantes, ...(condicionesModificadas ? { condiciones_participantes: condicionesGuardables } : {}),
          version: datos.campania.__v }), cache: 'no-store', signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar la selección. Intenta nuevamente.');
      const guardada = data.campania;
      if (!guardada || guardada._id !== campania._id || guardada.estado !== 'borrador' || !Number.isInteger(guardada.__v)
        || guardada.__v !== datos.campania.__v + 1 || !Array.isArray(guardada.participantes)
        || guardada.participantes.length !== participantes.length || new Set(guardada.participantes).size !== participantes.length
        || guardada.participantes.some((id) => !seleccion.has(id)) || !tieneMontosValidos(guardada)
        || !Array.isArray(guardada.sedes) || !['USD', 'EUR'].includes(guardada.moneda) || !condicionesValidas(guardada)
        || JSON.stringify(serializarCondiciones(leerCondiciones(guardada), seleccion)) !== JSON.stringify(condicionesGuardables)) {
        throw new Error('No se pudo verificar el guardado. Cierra y vuelve a abrir los participantes antes de reintentar.');
      }
      if (!controller.signal.aborted) destino(guardada);
    } catch (err) {
      if (!controller.signal.aborted) setError(err.message || 'No se pudo guardar la selección.');
    } finally {
      enviando.current = false;
      if (!controller.signal.aborted) setGuardando(false);
    }
  };

  return <>
    <CampaniaDialog open fullWidth maxWidth="lg" fullScreen={fullScreen} onClose={cerrar} aria-labelledby="participantes-titulo"
      PaperProps={{ sx: { maxWidth: 1000, borderRadius: { xs: 0, sm: 2 }, color: '#202441' } }}>
      <DialogTitle component="div" id="participantes-cabecera" sx={{ bgcolor: '#171b4b', color: '#fff', px: { xs: 2.5, sm: 4 }, py: 2.5,
        display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 2 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 10, fontWeight: 800, color: '#f28cbd', mb: 0.75 }}>COBROS ADICIONALES</Typography>
          <Typography component="h2" id="participantes-titulo" sx={{ fontSize: 22, fontWeight: 750, lineHeight: 1.25 }}>Participantes</Typography>
          <Typography sx={{ fontSize: 13, color: '#c6c8de', mt: 0.75, overflowWrap: 'anywhere' }}>{campania.nombre}</Typography>
        </Box>
        <Tooltip title="Cerrar"><span><IconButton aria-label="Cerrar participantes" disabled={guardando} onClick={cerrar}
          sx={{ color: '#d8daea', bgcolor: 'rgba(255,255,255,0.07)', borderRadius: 1, width: 32, height: 32 }}><CloseRoundedIcon sx={{ fontSize: 18 }} /></IconButton></span></Tooltip>
      </DialogTitle>
      <DialogContent sx={{ px: { xs: 2.5, sm: 4 }, pt: '24px !important', pb: 1, minWidth: 0,
        '& .MuiInputBase-root': { fontSize: 13, borderRadius: 1.5, bgcolor: '#fff' },
        '& .MuiInputLabel-root': { position: 'static', transform: 'none', maxWidth: '100%', mb: 0.75, color: '#30344b', fontSize: 12, fontWeight: 650 },
        '& .MuiOutlinedInput-notchedOutline': { top: 0, borderColor: '#e5e6ed', '& legend': { display: 'none' } },
        '& .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#7d849d', borderWidth: 1 } }}>
        {onContinue && <CampaniaPasos paso={1} />}
        {cargando && <Box role="status" sx={{ py: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
          <CircularProgress size={22} sx={{ color: '#171b4b' }} /><Typography sx={{ fontSize: 14 }}>Cargando atletas...</Typography>
        </Box>}
        {errorCarga && <Alert severity="error" action={<Button color="inherit" onClick={() => setIntento((actual) => actual + 1)}>Reintentar</Button>}>{errorCarga}</Alert>}
        {!cargando && !errorCarga && datos && <>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {condicionInvalida && <Alert severity="error" sx={{ mb: 2 }}>
            Revisa el monto personalizado o la nota interna de {nombreCompleto(atletas.find((atleta) => atleta._id === condicionInvalida[0]))}.
          </Alert>}
          {atletas.some((atleta) => !atleta.disponible && inicial.has(atleta._id)) && <Alert severity="warning" sx={{ mb: 2 }}>
            Hay participantes que ya no están activos o disponibles en las sedes de la campaña. Se conserva su selección hasta que los retires.
          </Alert>}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr 1fr' }, gap: 1.75, mb: 2 }}>
            <TextField size="small" label="Buscar atleta o representante" value={busqueda} disabled={guardando}
              onChange={(event) => { setBusqueda(event.target.value); setPagina(0); }}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 18 }} /></InputAdornment> } }} />
            <TextField select size="small" label="Sede" value={sede} disabled={guardando} onChange={(event) => { setSede(event.target.value); setPagina(0); }}>
              <MenuItem value="">Todas las sedes</MenuItem>{sedes.map((item) => <MenuItem key={item._id} value={item._id}>{item.nombre}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Categoría" value={categoria} disabled={guardando} onChange={(event) => { setCategoria(event.target.value); setPagina(0); }}>
              <MenuItem value="">Todas las categorías</MenuItem>{categorias.map((item) => <MenuItem key={item} value={item}>{item}</MenuItem>)}
            </TextField>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1.75, mb: 2 }}>
            <TextField select size="small" label="Tipo de mensualidad" value={tipoMensualidad} disabled={guardando}
              onChange={(event) => { setTipoMensualidad(event.target.value); setPagina(0); }}>
              <MenuItem value="">Todos los tipos</MenuItem>{TIPOS_MENSUALIDAD.map((tipo) => <MenuItem key={tipo.id} value={tipo.id}>{tipo.label}</MenuItem>)}
            </TextField>
            <TextField type="date" size="small" label="Inscripción desde" value={inscripcionDesde} disabled={guardando}
              onChange={(event) => { setInscripcionDesde(event.target.value); setPagina(0); }} error={rangoInvalido}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: inscripcionHasta || undefined } }} />
            <TextField type="date" size="small" label="Inscripción hasta" value={inscripcionHasta} disabled={guardando}
              onChange={(event) => { setInscripcionHasta(event.target.value); setPagina(0); }} error={rangoInvalido}
              helperText={rangoInvalido ? 'La fecha final debe ser igual o posterior a la inicial.' : undefined}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: inscripcionDesde || undefined } }} />
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mb: 2 }}>
          <ToggleButtonGroup exclusive value={vista} aria-label="Vista de participantes" disabled={guardando}
            onChange={(event, valor) => { if (valor) { setVista(valor); setPagina(0); } }}
            sx={{ bgcolor: '#f0f1f6', p: 0.5, borderRadius: 1.5, width: { xs: '100%', sm: 320 },
              '& .MuiToggleButtonGroup-grouped': { border: '0 !important', borderRadius: '4px !important', m: 0 },
              '& .MuiToggleButton-root': { flex: 1, minWidth: 0, px: { xs: 1, sm: 2 }, py: 0.75, whiteSpace: 'nowrap', color: '#6f748b', fontSize: 12, textTransform: 'none',
                '&.Mui-selected': { color: '#262b48', bgcolor: '#fff', boxShadow: '0 1px 4px rgba(27,34,65,0.14)', '&:hover': { bgcolor: '#fff' } } } }}>
            <ToggleButton value="todos">Todos</ToggleButton><ToggleButton value="seleccionados">Seleccionados ({seleccion.size})</ToggleButton>
          </ToggleButtonGroup>
          <Button onClick={limpiarFiltros} disabled={guardando || !hayFiltros} startIcon={<FilterAltOffRoundedIcon sx={{ fontSize: 18 }} />}
            sx={{ color: '#667085', fontSize: 12, textTransform: 'none', minHeight: 36, px: 1, ml: 'auto' }}>Limpiar filtros</Button>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, borderBottom: '1px solid #e9eaf0', pb: 1 }}>
            <Box component="label" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: 12, color: '#667085' }}>
              <Checkbox size="small" checked={elegibles.length > 0 && marcados === elegibles.length} indeterminate={marcados > 0 && marcados < elegibles.length}
                disabled={guardando || !elegibles.length} slotProps={{ input: { 'aria-label': 'Seleccionar página actual' } }}
                onChange={(event) => alternar(elegibles.map((atleta) => atleta._id), event.target.checked)} sx={{ p: 0.75, '&.Mui-checked, &.MuiCheckbox-indeterminate': { color: '#d93670' } }} />
              Seleccionar página
            </Box>
            <Typography sx={{ fontSize: 12, color: '#858999' }}>{filtrados.length} {filtrados.length === 1 ? 'atleta' : 'atletas'}</Typography>
          </Box>
          <Box component="ul" aria-label="Atletas de la campaña" sx={{ listStyle: 'none', p: 0, m: 0 }}>
            {visibles.map((atleta) => <Box component="li" key={atleta._id} sx={{ display: 'grid',
              gridTemplateColumns: { xs: '32px minmax(0, 1fr) 32px', sm: '32px minmax(0, 1.5fr) minmax(0, 1fr) 120px 32px' },
              gap: { xs: 1, sm: 1.5 }, alignItems: 'center', py: 1.5, px: 0.5, borderBottom: '1px solid #f0f1f5', bgcolor: seleccion.has(atleta._id) ? '#fff8fb' : '#fff' }}>
              <Checkbox size="small" checked={seleccion.has(atleta._id)} disabled={guardando || (!atleta.disponible && !inicial.has(atleta._id))}
                slotProps={{ input: { id: `participante-${atleta._id}`, 'aria-label': `Seleccionar ${nombreCompleto(atleta)}` } }}
                onChange={(event) => alternar([atleta._id], event.target.checked)} sx={{ p: 0.5, '&.Mui-checked': { color: '#d93670' } }} />
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
                <Avatar src={mediaUrl(atleta.foto)} alt={nombreCompleto(atleta)} variant="rounded" sx={{ width: 40, height: 40, borderRadius: 1.5,
                  bgcolor: '#f0f2f9', color: '#626987', fontSize: 13, flexShrink: 0 }}>{atleta.nombres.slice(0, 1)}{atleta.apellidos.slice(0, 1)}</Avatar>
                <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                  <Typography component="label" htmlFor={`participante-${atleta._id}`} sx={{ fontSize: 13, fontWeight: 700, color: '#202441', cursor: 'pointer' }}>{nombreCompleto(atleta)}</Typography>
                  <Typography sx={{ fontSize: 11, color: '#858999', mt: 0.25 }}>{atleta.categoria || 'Sin categoría'} · {atleta.sede?.nombre || 'Sede no disponible'}</Typography>
                  {seleccion.has(atleta._id) && <Typography sx={{ fontSize: 11, mt: 0.5,
                    color: condiciones[atleta._id]?.modalidad === 'no_aplica' ? '#a33142' : '#626879' }}>
                    {condiciones[atleta._id]?.modalidad === 'no_aplica' ? 'No aplica'
                      : condiciones[atleta._id]?.modalidad === 'personalizado'
                        ? `Personalizado · ${montoValido(String(condiciones[atleta._id].monto).replace(',', '.'))
                          ? formatoMonto(Number(String(condiciones[atleta._id].monto).replace(',', '.')), datos.campania.moneda) : 'Monto pendiente'}`
                        : `Campaña · ${formatoMonto(montoCampania(datos.campania, atleta), datos.campania.moneda)}`}
                  </Typography>}
                  {!atleta.disponible && <Chip size="small" label="No disponible" sx={{ height: 20, fontSize: 10, borderRadius: 1, mt: 0.5, bgcolor: '#f0f1f5', color: '#667085' }} />}
                </Box>
              </Box>
              <Box sx={{ gridColumn: { xs: 2, sm: 'auto' }, minWidth: 0, overflowWrap: 'anywhere' }}>
                <Typography sx={{ fontSize: 10, color: '#9a9eae' }}>Representante</Typography>
                <Typography sx={{ fontSize: 12, color: '#626879' }}>{nombreCompleto(atleta.representante) || 'Sin representante'}</Typography>
              </Box>
              <Box sx={{ gridColumn: { xs: 2, sm: 'auto' }, minWidth: 0 }}>
                <Typography sx={{ fontSize: 10, color: '#9a9eae' }}>Inscripción</Typography>
                <Typography sx={{ fontSize: 12, color: '#626879' }}>{fechaInscripcion(atleta.fecha_inscripcion)}</Typography>
              </Box>
              <Box sx={{ gridColumn: { xs: 3, sm: 'auto' }, gridRow: { xs: 1, sm: 'auto' } }}>
                <Tooltip title="Condiciones individuales"><span><IconButton size="small" aria-label={`Condiciones de ${nombreCompleto(atleta)}`}
                  aria-expanded={condicionAbierta === atleta._id && seleccion.has(atleta._id)}
                  disabled={guardando || !seleccion.has(atleta._id)} onClick={() => setCondicionAbierta((actual) => actual === atleta._id ? null : atleta._id)}
                  sx={{ width: 32, height: 32, color: condiciones[atleta._id]?.modalidad && condiciones[atleta._id].modalidad !== 'general' ? '#d93670' : '#626879' }}>
                  <TuneRoundedIcon sx={{ fontSize: 18 }} />
                </IconButton></span></Tooltip>
              </Box>
              {condicionAbierta === atleta._id && seleccion.has(atleta._id) && <Box component="section" aria-label={`Condiciones de ${nombreCompleto(atleta)}`}
                sx={{ gridColumn: '1 / -1', display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' },
                  gap: 1.75, pt: 2, pb: 1, pl: { xs: 0, sm: 5.5 }, minWidth: 0 }}>
                <TextField select fullWidth size="small" label={`Condición de ${nombreCompleto(atleta)}`} disabled={guardando}
                  value={condiciones[atleta._id]?.modalidad || 'general'}
                  onChange={(event) => cambiarCondicion(atleta._id, { modalidad: event.target.value })}>
                  <MenuItem value="general">Monto de campaña</MenuItem><MenuItem value="personalizado">Monto personalizado</MenuItem><MenuItem value="no_aplica">No aplica</MenuItem>
                </TextField>
                {condiciones[atleta._id]?.modalidad === 'personalizado' && <TextField fullWidth required size="small"
                  label={`Monto de ${nombreCompleto(atleta)}`} value={condiciones[atleta._id].monto} disabled={guardando}
                  error={!montoValido(String(condiciones[atleta._id].monto).replace(',', '.'))}
                  helperText={!montoValido(String(condiciones[atleta._id].monto).replace(',', '.')) ? 'Mayor que cero, hasta dos decimales.' : undefined}
                  onChange={(event) => cambiarCondicion(atleta._id, { monto: event.target.value })}
                  slotProps={{ htmlInput: { inputMode: 'decimal' }, input: { startAdornment: <InputAdornment position="start">{datos.campania.moneda}</InputAdornment> } }} />}
                <TextField fullWidth multiline minRows={2} maxRows={4} size="small" label={`Nota interna de ${nombreCompleto(atleta)}`}
                  value={condiciones[atleta._id]?.nota_interna || ''} disabled={guardando} helperText="Solo administración."
                  error={(condiciones[atleta._id]?.nota_interna || '').trim().length > 1000}
                  onChange={(event) => cambiarCondicion(atleta._id, { nota_interna: event.target.value })}
                  slotProps={{ htmlInput: { maxLength: 1000 } }} sx={{ gridColumn: '1 / -1' }} />
              </Box>}
            </Box>)}
          </Box>
          {!filtrados.length && <Typography sx={{ py: 5, textAlign: 'center', fontSize: 14, color: '#858999' }}>
            {!atletas.length ? 'No hay atletas disponibles en las sedes de esta campaña.' : vista === 'seleccionados' && !seleccion.size
              ? 'Todavía no has seleccionado atletas.' : 'No hay atletas que coincidan con los filtros.'}
          </Typography>}
          <TablePagination component="div" count={filtrados.length} page={paginaActual} rowsPerPage={filas} rowsPerPageOptions={[5, 10, 25]}
            onPageChange={(event, nueva) => setPagina(nueva)} onRowsPerPageChange={(event) => { setFilas(Number(event.target.value)); setPagina(0); }}
            labelRowsPerPage="Filas" labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count}`}
            getItemAriaLabel={(tipo) => tipo === 'next' ? 'Página siguiente' : 'Página anterior'}
            sx={{ '& .MuiTablePagination-toolbar': { px: 0, flexWrap: 'wrap', justifyContent: 'flex-end' },
              '& .MuiTablePagination-spacer': { display: 'none' }, '& .MuiTablePagination-actions': { ml: 1, '& button': { p: 0.5 } },
              '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': { fontSize: 11 } }} />
        </>}
      </DialogContent>
      <DialogActions sx={{ px: { xs: 2.5, sm: 4 }, py: 1.75, gap: 1.5, borderTop: '1px solid #f0f1f5', bgcolor: '#fafafe',
        display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) auto' }, '& > :not(style) ~ :not(style)': { ml: 0 } }}>
        <Box>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#30344b' }}>{seleccion.size} {seleccion.size === 1 ? 'atleta seleccionado' : 'atletas seleccionados'}</Typography>
          <Typography sx={{ fontSize: 11, color: '#858999', mt: 0.25 }}>Solo selección. No genera cargos ni envía avisos.</Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {onBack ? <Button disabled={!datos || guardando || cargando || Boolean(errorCarga) || Boolean(condicionInvalida)}
            onClick={() => guardar(onBack)} startIcon={<ArrowBackRoundedIcon />}
            sx={{ color: '#50566e', textTransform: 'none', fontSize: 12 }}>Volver a datos</Button>
            : <Button disabled={guardando} onClick={cerrar} sx={{ color: '#50566e', textTransform: 'none', fontSize: 12 }}>Cancelar</Button>}
          <Button variant={onContinue ? 'text' : 'contained'} disabled={!datos || (!modificado && !onContinue) || guardando || cargando || Boolean(errorCarga) || Boolean(condicionInvalida)} onClick={() => guardar()}
            startIcon={guardando ? <CircularProgress size={16} color="inherit" /> : <SaveOutlinedIcon />}
            sx={{ color: onContinue ? '#50566e' : '#fff', bgcolor: onContinue ? 'transparent' : '#171b4b', '&:hover': { bgcolor: onContinue ? '#f0f1f5' : '#252b60' }, boxShadow: 'none', borderRadius: 1.5, minHeight: 40,
              fontSize: 12, textTransform: 'none', px: 2, whiteSpace: 'nowrap' }}>{guardando ? 'Guardando...' : onContinue ? 'Guardar borrador' : 'Guardar selección'}</Button>
          {onContinue && <Button variant="contained" disabled={!datos || guardando || cargando || Boolean(errorCarga) || Boolean(condicionInvalida)}
            onClick={() => guardar(onContinue)} endIcon={<ArrowForwardRoundedIcon />}
            sx={{ bgcolor: '#171b4b', '&:hover': { bgcolor: '#252b60' }, boxShadow: 'none', borderRadius: 1.5, minHeight: 40,
              fontSize: 12, textTransform: 'none', px: 2 }}>Ver resumen</Button>}
        </Box>
      </DialogActions>
    </CampaniaDialog>
    <Dialog open={descartar} onClose={() => setDescartar(false)} maxWidth="xs" fullWidth aria-labelledby="descartar-participantes-titulo">
      <DialogTitle id="descartar-participantes-titulo">Descartar selección sin guardar</DialogTitle>
      <DialogContent>Se conservará la última selección y sus condiciones guardadas.</DialogContent>
      <DialogActions sx={{ p: 2, flexWrap: 'wrap', gap: 1 }}>
        <Button autoFocus onClick={() => setDescartar(false)} sx={{ color: '#475569' }}>Seguir seleccionando</Button>
        <Button onClick={onClose} sx={{ color: '#a33142' }}>Descartar cambios</Button>
      </DialogActions>
    </Dialog>
  </>;
}

export default CampaniaParticipantesDialog;