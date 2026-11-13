import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, MenuItem, Snackbar, Tooltip,
  Table, TableBody, TableCell, TableContainer, TableHead, TablePagination,
  TableRow, TextField, Typography, useMediaQuery, useTheme
} from '@mui/material';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import GroupRoundedIcon from '@mui/icons-material/GroupRounded';
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import CampaniaBorradorDialog from './CampaniaBorradorDialog';
import CampaniaParticipantesDialog from './CampaniaParticipantesDialog';
import CampaniaResumenDialog from './CampaniaResumenDialog';
import { CierrePasoCampania } from './CampaniaDialog';
import { tieneMontosValidos } from '../utils/campaniaMontos';

const ESTADOS = {
  borrador: { label: 'Borrador', color: '#475569', background: '#f1f3f6' },
  abierta: { label: 'Abierta', color: '#237242', background: '#eaf6ee' },
  cerrada: { label: 'Cerrada', color: '#475569', background: '#f1f3f6' },
  cancelada: { label: 'Cancelada', color: '#a33142', background: '#fceef0' }
};
const normalizar = (valor) => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const nombreSedes = (campania) => campania.sedes.map((sede) => sede?.nombre || 'Sede no disponible').join(', ');
const formatoMonto = (monto, moneda) => new Intl.NumberFormat('es-VE', { style: 'currency', currency: moneda }).format(monto);

function fechaVencimiento(valor) {
  if (!valor) return 'Sin vencimiento';
  const fecha = new Date(`${valor}T12:00:00Z`);
  return Number.isNaN(fecha.getTime()) ? 'Fecha no disponible'
    : fecha.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

function CobrosAdicionales() {
  const [campanias, setCampanias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('');
  const [sede, setSede] = useState('');
  const [pagina, setPagina] = useState(0);
  const [filas, setFilas] = useState(10);
  const [editor, setEditor] = useState(null);
  const [participantes, setParticipantes] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [creacionGuiada, setCreacionGuiada] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [porEliminar, setPorEliminar] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState('');
  const eliminandoRef = useRef(false);
  const eliminacionController = useRef(null);
  const cierrePaso = useRef(null);
  const fullScreen = useMediaQuery(useTheme().breakpoints.down('sm'));
  const flujoAbierto = creacionGuiada || Boolean(editor && !editor.campania);

  useEffect(() => () => eliminacionController.current?.abort(), []);

  useEffect(() => {
    const controller = new AbortController();
    const cargar = async () => {
      setCargando(true);
      setError('');
      setCampanias([]);
      try {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Tu sesión no está disponible. Inicia sesión nuevamente.');
        const response = await fetch(`${process.env.REACT_APP_API_URL || window.location.origin}/api/campanias-cobro`, {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store'
        });
        if (response.status === 401) throw new Error('Tu sesión venció. Inicia sesión nuevamente.');
        if (response.status === 403) throw new Error('No tienes acceso a los cobros adicionales de esta academia.');
        if (!response.ok) throw new Error('No se pudieron cargar las campañas. Intenta nuevamente.');
        const data = await response.json();
        if (!Array.isArray(data.campanias) || data.campanias.some((item) => !item
          || typeof item._id !== 'string' || typeof item.nombre !== 'string'
          || !Object.hasOwn(ESTADOS, item.estado) || !Array.isArray(item.sedes)
          || !['USD', 'EUR'].includes(item.moneda) || !tieneMontosValidos(item))) {
          throw new Error('La respuesta de campañas no es válida. Intenta nuevamente.');
        }
        if (!controller.signal.aborted) {
          setCampanias(data.campanias);
          setPagina(0);
        }
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message || 'No se pudieron cargar las campañas.');
      } finally {
        if (!controller.signal.aborted) setCargando(false);
      }
    };
    cargar();
    return () => controller.abort();
  }, [intento]);

  const sedes = [...new Map(campanias.flatMap((item) => item.sedes)
    .filter((item) => item?._id && item.nombre).map((item) => [item._id, item])).values()];
  const filtradas = campanias.filter((item) => (!estado || item.estado === estado)
    && (!sede || item.sedes.some((itemSede) => itemSede?._id === sede))
    && normalizar(`${item.nombre} ${item.descripcion || ''}`).includes(normalizar(busqueda).trim()));
  const paginaActual = Math.min(pagina, Math.max(0, Math.ceil(filtradas.length / filas) - 1));

  const cerrarEliminacion = () => {
    if (eliminandoRef.current) return;
    setPorEliminar(null);
    setErrorEliminar('');
  };
  const eliminarCampania = async () => {
    if (eliminandoRef.current || !porEliminar || !Number.isInteger(porEliminar.__v)) return;
    eliminandoRef.current = true;
    setEliminando(true);
    setErrorEliminar('');
    const controller = new AbortController();
    eliminacionController.current = controller;
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Tu sesión no está disponible. Inicia sesión nuevamente.');
      const response = await fetch(`${process.env.REACT_APP_API_URL || window.location.origin}/api/campanias-cobro/${porEliminar._id}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: porEliminar.__v }), cache: 'no-store', signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo eliminar la campaña. Intenta nuevamente.');
      if (data.eliminada !== porEliminar._id) throw new Error('No se pudo verificar la eliminación. Vuelve a cargar el listado antes de reintentar.');
      if (!controller.signal.aborted) {
        setCampanias((actuales) => actuales.filter((item) => item._id !== porEliminar._id));
        setAviso({ titulo: 'Campaña eliminada', nombre: porEliminar.nombre, detalle: 'El borrador se ha eliminado definitivamente.' });
        setPorEliminar(null);
      }
    } catch (err) {
      if (!controller.signal.aborted) setErrorEliminar(err.message || 'No se pudo eliminar la campaña.');
    } finally {
      eliminandoRef.current = false;
      if (!controller.signal.aborted) setEliminando(false);
    }
  };

  const formularios = <>
    {editor && <CampaniaBorradorDialog campania={editor.campania} onClose={() => { setEditor(null); setCreacionGuiada(false); }}
      onContinue={!editor.campania || creacionGuiada ? (guardada) => {
        setCampanias((actuales) => [guardada, ...actuales.filter((item) => item._id !== guardada._id)]);
        setEditor(null); setCreacionGuiada(true); setParticipantes(guardada);
        setBusqueda(''); setSede(''); setEstado(''); setPagina(0);
      } : undefined}
      onSaved={(guardada) => {
        setCampanias((actuales) => editor.campania
          ? actuales.map((item) => item._id === guardada._id ? guardada : item)
          : [guardada, ...actuales.filter((item) => item._id !== guardada._id)]);
        setAviso({ titulo: editor.campania ? 'Cambios guardados' : 'Campaña creada', nombre: guardada.nombre });
        setEditor(null);
        setCreacionGuiada(false);
        setBusqueda(''); setSede(''); setEstado(''); setPagina(0);
      }} />}
    {resumen && <CampaniaResumenDialog campania={resumen} creacionGuiada={creacionGuiada} onClose={() => {
      if (creacionGuiada) setAviso({ titulo: 'Borrador guardado', nombre: resumen.nombre });
      setResumen(null); setCreacionGuiada(false);
    }}
      onRevisar={(guardada) => { setResumen(null); setParticipantes(guardada); }}
      onPublished={(guardada) => {
        setCampanias((actuales) => actuales.map((item) => item._id === guardada._id ? guardada : item));
        setResumen(null); setCreacionGuiada(false);
        setAviso({ titulo: 'Campaña publicada', nombre: guardada.nombre,
          detalle: `${guardada.publicacion.generales + guardada.publicacion.personalizados} cargos generados. No se han registrado pagos ni enviado avisos.` });
      }} />}
    {participantes && <CampaniaParticipantesDialog campania={participantes} onClose={() => { setParticipantes(null); setCreacionGuiada(false); }}
      onContinue={creacionGuiada ? (guardada) => {
        setCampanias((actuales) => actuales.map((item) => item._id === guardada._id ? guardada : item));
        setParticipantes(null); setResumen(guardada);
      } : undefined}
      onBack={creacionGuiada ? (guardada) => {
        setCampanias((actuales) => actuales.map((item) => item._id === guardada._id ? guardada : item));
        setParticipantes(null); setEditor({ campania: guardada });
      } : undefined}
      onSaved={(guardada) => {
        setCampanias((actuales) => actuales.map((item) => item._id === guardada._id ? guardada : item));
        setParticipantes(null);
        setCreacionGuiada(false);
        setAviso({ titulo: creacionGuiada ? 'Borrador guardado' : 'Participantes guardados', nombre: guardada.nombre });
      }} />}
  </>;

  return (
    <Box sx={{ width: '100%', maxWidth: 1300, mx: 'auto', minWidth: 0, pb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 3 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#d93670', mb: 0.75 }}>FINANZAS</Typography>
          <Typography component="h1" sx={{ fontSize: { xs: 26, sm: 32 }, lineHeight: 1.2, fontWeight: 800, color: '#111342' }}>
            Cobros adicionales
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddRoundedIcon />} disabled={cargando || Boolean(error)}
          onClick={() => { setAviso(null); setEditor({ campania: null }); }}
          sx={{ bgcolor: '#111342', '&:hover': { bgcolor: '#25284f' }, textTransform: 'none', borderRadius: 1.5 }}>
          Crear campaña
        </Button>
      </Box>

      {aviso && <Snackbar open autoHideDuration={6000} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        onClose={(event, motivo) => { if (motivo !== 'clickaway') setAviso(null); }}
        sx={{ top: { xs: 'calc(16px + env(safe-area-inset-top, 0px))', sm: 24 }, right: { xs: 16, sm: 24 },
          left: { xs: 16, sm: 'auto' }, bottom: 'auto', width: { xs: 'auto', sm: 400 }, maxWidth: 'calc(100% - 32px)', transform: 'none' }}>
        <Box role="status" aria-label={aviso.titulo === 'Campaña eliminada' ? 'Confirmación de eliminación' : 'Confirmación de guardado'} aria-live="polite" aria-atomic="true" sx={{ width: '100%', boxSizing: 'border-box',
          display: 'grid', gridTemplateColumns: '36px minmax(0, 1fr) 28px', alignItems: 'start', gap: 1.5,
          p: 2, bgcolor: '#fff', border: '1px solid #e8eaf1', borderLeft: '4px solid #d93670', borderRadius: 2,
          boxShadow: '0 12px 32px rgba(17,19,66,0.16)' }}>
          <Box sx={{ width: 36, height: 36, display: 'grid', placeItems: 'center', bgcolor: '#fff0f5', borderRadius: 1.5 }}>
            <CheckCircleOutlineRoundedIcon sx={{ color: '#d93670', fontSize: 22 }} />
          </Box>
          <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            <Typography sx={{ fontSize: 14, fontWeight: 750, color: '#111342', lineHeight: 1.4 }}>{aviso.titulo}</Typography>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#475569', mt: 0.5, lineHeight: 1.5 }}>{aviso.nombre}</Typography>
            <Typography sx={{ fontSize: 12, color: '#7a8194', mt: 0.5, lineHeight: 1.5 }}>{aviso.detalle || 'No se han generado cargos ni avisos.'}</Typography>
          </Box>
          <Tooltip title="Cerrar notificación"><IconButton size="small" aria-label="Cerrar notificación" onClick={() => setAviso(null)}
            sx={{ width: 28, height: 28, color: '#858b9b', '&:hover': { bgcolor: '#f3f4f8', color: '#111342' } }}>
            <CloseRoundedIcon sx={{ fontSize: 18 }} />
          </IconButton></Tooltip>
        </Box>
      </Snackbar>}
      {cargando && <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 6, justifyContent: 'center' }}>
        <CircularProgress size={24} sx={{ color: '#111342' }} /><Typography>Cargando campañas...</Typography>
      </Box>}
      {!cargando && error && <Alert severity="error" action={<Button color="inherit"
        onClick={() => setIntento((actual) => actual + 1)}>Reintentar</Button>}>{error}</Alert>}

      {!cargando && !error && !campanias.length && <Box sx={{ py: 7, textAlign: 'center', borderTop: '1px solid #e7e9f2' }}>
        <CampaignOutlinedIcon sx={{ color: '#d93670', fontSize: 40, mb: 1.5 }} />
        <Typography component="h2" sx={{ fontSize: 18, fontWeight: 750, color: '#111342' }}>Todavía no hay campañas</Typography>
      </Box>}

      {!cargando && !error && campanias.length > 0 && <>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr 1fr' }, gap: 2, mb: 2.5 }}>
          <TextField label="Buscar campaña" value={busqueda} size="small"
            onChange={(event) => { setBusqueda(event.target.value); setPagina(0); }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> } }} />
          <TextField select label="Sede" value={sede} size="small"
            onChange={(event) => { setSede(event.target.value); setPagina(0); }}>
            <MenuItem value="">Todas las sedes</MenuItem>
            {sedes.map((item) => <MenuItem key={item._id} value={item._id}>{item.nombre}</MenuItem>)}
          </TextField>
          <TextField select label="Estado" value={estado} size="small"
            onChange={(event) => { setEstado(event.target.value); setPagina(0); }}>
            <MenuItem value="">Todos los estados</MenuItem>
            {Object.entries(ESTADOS).map(([key, item]) => <MenuItem key={key} value={key}>{item.label}</MenuItem>)}
          </TextField>
        </Box>
        <Typography sx={{ color: '#6b7280', fontSize: 13, mb: 1.5 }} role="status">
          {filtradas.length} {filtradas.length === 1 ? 'campaña' : 'campañas'}
        </Typography>
        <TableContainer sx={{ border: '1px solid #e7e9f2', borderRadius: 2, bgcolor: '#fff', maxWidth: '100%' }}>
          <Table aria-label="Campañas de cobros adicionales" sx={{ minWidth: 650 }}>
            <TableHead sx={{ bgcolor: '#f5f6fa' }}><TableRow>
              {['Campaña', 'Sedes', 'Vencimiento', 'Monto general', 'Estado', 'Acciones'].map((titulo) =>
                <TableCell key={titulo} sx={{ color: '#475569', fontWeight: 750, whiteSpace: 'nowrap' }}>{titulo}</TableCell>)}
            </TableRow></TableHead>
            <TableBody>
              {filtradas.slice(paginaActual * filas, (paginaActual + 1) * filas).map((item) => <TableRow key={item._id}>
                <TableCell sx={{ minWidth: 180, maxWidth: 300, overflowWrap: 'anywhere' }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 750, color: '#111342' }}>{item.nombre}</Typography>
                  {item.descripcion && <Typography sx={{ fontSize: 12, color: '#6b7280', mt: 0.5 }}>{item.descripcion}</Typography>}
                </TableCell>
                <TableCell sx={{ maxWidth: 220, overflowWrap: 'anywhere' }}>{nombreSedes(item) || 'Sin sedes'}</TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{fechaVencimiento(item.vencimiento)}</TableCell>
                <TableCell sx={{ minWidth: 160, maxWidth: 300, overflowWrap: 'anywhere' }}>
                  {item.modalidad_monto === 'por_sede' ? <>
                    <Typography sx={{ fontSize: 12, fontWeight: 750, color: '#475569', mb: 0.5 }}>Por sede</Typography>
                    {item.montos_por_sede.map((precio) => <Typography key={precio.sede} sx={{ fontSize: 13 }}>
                      {item.sedes.find((sede) => sede?._id === precio.sede)?.nombre || 'Sede no disponible'}: {formatoMonto(precio.monto, item.moneda)}
                    </Typography>)}
                  </> : formatoMonto(item.monto_general, item.moneda)}
                </TableCell>
                <TableCell><Chip size="small" label={ESTADOS[item.estado].label}
                  sx={{ bgcolor: ESTADOS[item.estado].background, color: ESTADOS[item.estado].color, borderRadius: 1, fontWeight: 650 }} /></TableCell>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{item.estado === 'borrador' && <Box sx={{ display: 'grid',
                  gridTemplateColumns: 'max-content 36px 36px 36px', justifyContent: 'end', alignItems: 'center', columnGap: 0.75,
                  '& .MuiIconButton-root': { width: 36, height: 36, borderRadius: 1.5, border: 0, bgcolor: 'transparent',
                    '&:hover': { bgcolor: 'transparent', color: '#171b4b' },
                    '&.Mui-focusVisible': { outline: '2px solid #7d849d', outlineOffset: 2 },
                    '& .MuiSvgIcon-root': { fontSize: 20 } } }}>
                  <Button size="small" startIcon={<GroupRoundedIcon sx={{ fontSize: 20 }} />}
                    aria-label={`Seleccionar participantes de ${item.nombre}`} disabled={!Number.isInteger(item.__v)}
                    onClick={() => { setAviso(null); setParticipantes(item); }}
                    sx={{ textTransform: 'none', fontSize: 12, color: '#475569' }}>
                    Participantes ({item.participantes?.length || 0})
                  </Button>
                  <Tooltip title="Resumen previo a publicar"><IconButton aria-label={`Resumen de ${item.nombre}`} disabled={!Number.isInteger(item.__v)}
                    onClick={() => { setAviso(null); setResumen(item); }} sx={{ color: '#475569' }}>
                    <VisibilityRoundedIcon />
                  </IconButton></Tooltip>
                  <Tooltip title="Editar borrador">
                  <IconButton aria-label={`Editar ${item.nombre}`} disabled={!Number.isInteger(item.__v)}
                    onClick={() => { setAviso(null); setEditor({ campania: item }); }} sx={{ color: '#475569' }}>
                    <EditRoundedIcon />
                  </IconButton>
                </Tooltip>
                  <Tooltip title="Eliminar campaña">
                    <IconButton aria-label={`Eliminar ${item.nombre}`} disabled={!Number.isInteger(item.__v)}
                      onClick={() => { setAviso(null); setErrorEliminar(''); setPorEliminar(item); }}
                      sx={{ color: '#a33142', '&:hover': { color: '#d93670' } }}>
                      <DeleteRoundedIcon />
                    </IconButton>
                  </Tooltip>
                </Box>}
                {item.publicacion && item.estado !== 'borrador' && <Tooltip title="Ver cargos publicados">
                  <IconButton aria-label={`Ver cargos de ${item.nombre}`} onClick={() => { setAviso(null); setResumen(item); }}
                    sx={{ width: 36, height: 36, color: '#475569', '&:hover': { bgcolor: 'transparent', color: '#171b4b' } }}>
                    <VisibilityRoundedIcon sx={{ fontSize: 20 }} />
                  </IconButton>
                </Tooltip>}</TableCell>
              </TableRow>)}
              {!filtradas.length && <TableRow><TableCell colSpan={6} sx={{ textAlign: 'center', py: 5 }}>
                No hay campañas que coincidan con los filtros.
              </TableCell></TableRow>}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={filtradas.length} page={paginaActual} rowsPerPage={filas}
          onPageChange={(event, nuevaPagina) => setPagina(nuevaPagina)} rowsPerPageOptions={[5, 10, 25]}
          onRowsPerPageChange={(event) => { setFilas(Number(event.target.value)); setPagina(0); }}
          labelRowsPerPage="Filas" labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count}`}
          getItemAriaLabel={(tipo) => tipo === 'next' ? 'Página siguiente' : 'Página anterior'}
          sx={{ '& .MuiTablePagination-toolbar': { px: { xs: 0, sm: 2 } }, '& .MuiTablePagination-actions': { ml: { xs: 0, sm: 2 } } }} />
      </>}
      <Dialog open={Boolean(porEliminar)} onClose={cerrarEliminacion} fullWidth maxWidth="sm"
        aria-labelledby="eliminar-campania-titulo" aria-describedby="eliminar-campania-advertencia"
        PaperProps={{ role: 'alertdialog', sx: { borderRadius: 2, color: '#202441', m: { xs: 2, sm: 4 }, width: { xs: 'calc(100% - 32px)', sm: 'calc(100% - 64px)' } } }}>
        <DialogTitle component="div" id="eliminar-campania-cabecera" sx={{ bgcolor: '#171b4b', color: '#fff', px: { xs: 2.5, sm: 4 }, py: 2.5,
          display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 2 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 10, fontWeight: 800, color: '#f28cbd', mb: 0.75 }}>COBROS ADICIONALES</Typography>
            <Typography component="h2" id="eliminar-campania-titulo" sx={{ fontSize: 22, fontWeight: 750, lineHeight: 1.25 }}>Eliminar campaña</Typography>
          </Box>
          <Tooltip title="Cerrar"><span><IconButton aria-label="Cerrar confirmación de eliminación" disabled={eliminando} onClick={cerrarEliminacion}
            sx={{ color: '#d8daea', bgcolor: 'rgba(255,255,255,0.07)', borderRadius: 1, width: 32, height: 32 }}>
            <CloseRoundedIcon sx={{ fontSize: 18 }} />
          </IconButton></span></Tooltip>
        </DialogTitle>
        <DialogContent sx={{ px: { xs: 2.5, sm: 4 }, pt: '24px !important', pb: 3 }}>
          {errorEliminar && <Alert severity="error" sx={{ mb: 2 }}>{errorEliminar}</Alert>}
          <Box sx={{ display: 'flex', alignItems: 'start', gap: 1.5 }}>
            <Box sx={{ width: 40, height: 40, flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: '#fff0f5', borderRadius: 1.5 }}>
              <WarningAmberRoundedIcon sx={{ color: '#d93670', fontSize: 24 }} />
            </Box>
            <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              <Typography sx={{ fontSize: 15, fontWeight: 750, color: '#202441' }}>{porEliminar?.nombre}</Typography>
              <Typography id="eliminar-campania-advertencia" sx={{ fontSize: 13, lineHeight: 1.7, color: '#626879', mt: 1 }}>
                Se eliminará el borrador y su selección de participantes. Esta acción es permanente y no se puede deshacer.
              </Typography>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: { xs: 2.5, sm: 4 }, py: 1.75, gap: 1, borderTop: '1px solid #f0f1f5', bgcolor: '#fafafe',
          flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: { xs: 'stretch', sm: 'center' }, '& > :not(style) ~ :not(style)': { ml: 0 } }}>
          <Button autoFocus disabled={eliminando} onClick={cerrarEliminacion} sx={{ color: '#50566e', textTransform: 'none', fontSize: 12 }}>Cancelar</Button>
          <Button variant="contained" disabled={eliminando} onClick={eliminarCampania}
            startIcon={eliminando ? <CircularProgress size={16} color="inherit" /> : <DeleteRoundedIcon />}
            sx={{ bgcolor: '#d93670', '&:hover': { bgcolor: '#ba285b' }, boxShadow: 'none', borderRadius: 1.5, minHeight: 40,
              minWidth: 170, fontSize: 12, textTransform: 'none', px: 2 }}>
            {eliminando ? 'Eliminando...' : 'Eliminar campaña'}
          </Button>
        </DialogActions>
      </Dialog>
      {flujoAbierto ? <CierrePasoCampania.Provider value={cierrePaso}>
        <Dialog open fullWidth maxWidth="lg" fullScreen={fullScreen}
          onClose={(event, motivo) => cierrePaso.current?.(event, motivo)}
          aria-labelledby={editor ? 'campania-borrador-titulo' : participantes ? 'participantes-titulo' : 'resumen-campania-titulo'}
          PaperProps={{ sx: { maxWidth: 1000, height: { xs: '100%', sm: 'calc(100% - 64px)' },
            borderRadius: { xs: 0, sm: 2 }, color: '#202441' } }}>
          {formularios}
        </Dialog>
      </CierrePasoCampania.Provider> : formularios}
    </Box>
  );
}

export default CobrosAdicionales;