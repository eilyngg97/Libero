import React, { useEffect, useState } from 'react';
import { Alert, Autocomplete, Avatar, Box, Button, ButtonBase, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Snackbar, Stack, Switch, Tab, TablePagination, Tabs, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import AddIcon from '@mui/icons-material/Add';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import CloseIcon from '@mui/icons-material/Close';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import CheckIcon from '@mui/icons-material/Check';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useNavigate } from 'react-router-dom';
import { useSede } from '../context/SedeContext';
import { hasPermission } from '../utils/permissions';
import { mediaUrl } from '../utils/mediaUrl';
import HistorialAsistencias from './HistorialAsistencias';

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado'];
const ESTADOS = { presente: 'Presente', ausente: 'Ausente', justificado: 'Justificado' };
const ESTILO_PESTANA = { color: '#6b7280', '&.Mui-selected': { color: '#374151', fontWeight: 700 }, '&:hover': { bgcolor: '#f3f4f6' }, '&.Mui-focusVisible': { outline: '2px solid #6b7280', outlineOffset: -2 } };
const ESTILO_BOTON_CABECERA = { minHeight: 36, borderRadius: 2, fontWeight: 700, color: '#475569', borderColor: '#94a3b8', bgcolor: '#fff', '&:hover': { color: '#475569', borderColor: '#64748b', bgcolor: '#fdfdfd' }, '&.Mui-focusVisible': { outline: '2px solid #6b7280', outlineOffset: 2 } };
const COLORES_ESTADOS = {
  presente: { fondo: '#f0faf4', texto: '#17603b', borde: '#25834c', indicador: '#ddf7e9' },
  ausente: { fondo: '#fff3f4', texto: '#a32942', borde: '#cf435d', indicador: '#ffe7e7' },
  justificado: { fondo: '#fff9ed', texto: '#855009', borde: '#b77916', indicador: '#fff0d9' },
  '': { fondo: '#f7f8fa', texto: '#5c606d', borde: '#9298a5', indicador: '#eceef2' }
};
const fechaHoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const fechaTexto = fecha => new Intl.DateTimeFormat('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${fecha}T12:00:00Z`));
const horaTexto = hora => {
  const [hours, minutes] = hora.split(':').map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'am' : 'pm'}`;
};
const entrenadoresDelGrupo = grupo => Array.isArray(grupo.entrenadores) ? grupo.entrenadores : [grupo.entrenador].filter(Boolean);
const nuevoGrupo = () => ({ nombre: '', dias: [], hora_inicio: '16:00', hora_fin: '17:30', categorias: [], alumnos_adicionales: [], alumnos_excluidos: [], entrenador: '', entrenadores: [], cancha: '', activo: true });
const primary = { bgcolor: '#201d58', color: '#fff', '&:hover': { bgcolor: '#302b73' } };
async function api(sede, path, options = {}) {
  const token = localStorage.getItem('token');
  const esEntrenador = (localStorage.getItem('rolActivo') || localStorage.getItem('rol')) === 'entrenador';
  const base = esEntrenador ? '/api/entrenador/asistencias' : '/api/asistencias';
  const response = await fetch(`${process.env.REACT_APP_API_URL || ''}${base}/${path}${path.includes('?') ? '&' : '?'}sede=${encodeURIComponent(sede)}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.msg || 'No se pudo completar la operacion.');
  return data;
}
function estadoSesion(sesion, hoy) {
  if (sesion.tomada && (sesion.sin_marcar > 0 || sesion.registros?.some(item => !item.estado))) return { texto: 'Parcial', fondo: '#fff0d9', color: '#855009' };
  if (sesion.tomada) return { texto: 'Tomada', fondo: '#ddf7e9', color: '#187349' };
  const hora = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Caracas', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  if (sesion.fecha === hoy && hora >= sesion.hora_inicio && hora < sesion.hora_fin) return { texto: 'En curso', fondo: '#fff0d9', color: '#9b580b' };
  return { texto: sesion.fecha < hoy || (sesion.fecha === hoy && hora >= sesion.hora_fin) ? 'Sin tomar' : 'Pendiente', fondo: '#f1f2f4', color: '#606875' };
}
function Categorias({ categorias = [] }) {
  return <Stack direction="row" gap={0.6} flexWrap="wrap">{categorias.map(categoria => <Chip key={categoria} label={categoria} size="small" sx={{ height: 'auto', minHeight: 22, borderRadius: 1, bgcolor: '#eff0f9', color: '#29265d', fontSize: 11, fontWeight: 700, '& .MuiChip-label': { whiteSpace: 'normal', py: 0.3 } }} />)}</Stack>;
}

function nombreMovil(nombre) {
  const [apellidos, nombres] = nombre.split(',').map(value => value.trim());
  return nombres ? `${nombres.split(/\s+/)[0]} ${apellidos.split(/\s+/)[0]}` : nombre;
}

function IntegrantesGrupo({ grupo, atletas, categorias, loading, error, onRetry, disabled, onChange }) {
  const [abierto, setAbierto] = useState(false);
  const [adicionales, setAdicionales] = useState([]);
  const [excluidos, setExcluidos] = useState([]);
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [nombreFiltro, setNombreFiltro] = useState('');
  const [nombreBaseFiltro, setNombreBaseFiltro] = useState('');
  const [paginaBase, setPaginaBase] = useState(0);
  const [paginaOtros, setPaginaOtros] = useState(0);
  const [filasBase, setFilasBase] = useState(5);
  const [filasOtros, setFilasOtros] = useState(5);
  const catalogo = [...atletas];
  for (const id of [...grupo.alumnos_adicionales, ...grupo.alumnos_excluidos]) {
    if (!catalogo.some(atleta => atleta._id === id)) catalogo.push({ _id: id, nombre: 'Atleta no disponible', categoria: '', activo: false });
  }
  const disponibles = catalogo.filter(atleta => atleta.activo || grupo.alumnos_adicionales.includes(atleta._id) || grupo.alumnos_excluidos.includes(atleta._id));
  const base = disponibles.filter(atleta => grupo.categorias.includes(atleta.categoria));
  const otros = disponibles.filter(atleta => !grupo.categorias.includes(atleta.categoria));
  const categoriasFiltro = [...new Set([...categorias, ...otros.map(atleta => atleta.categoria).filter(Boolean)])].filter(categoria => !grupo.categorias.includes(categoria));
  const normalizar = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().trim();
  const baseVisibles = base.filter(atleta => normalizar(atleta.nombre).includes(normalizar(nombreBaseFiltro)));
  const otrosVisibles = otros.filter(atleta => (!categoriaFiltro || atleta.categoria === categoriaFiltro) && normalizar(atleta.nombre).includes(normalizar(nombreFiltro)));
  const total = disponibles.filter(atleta => atleta.activo && !excluidos.includes(atleta._id) && (grupo.categorias.includes(atleta.categoria) || adicionales.includes(atleta._id))).length;
  const abrir = () => {
    setAdicionales([...grupo.alumnos_adicionales]); setExcluidos([...grupo.alumnos_excluidos]);
    setCategoriaFiltro(''); setNombreFiltro(''); setNombreBaseFiltro(''); setPaginaBase(0); setPaginaOtros(0); setAbierto(true);
  };
  const cambiar = (atleta, esBase, checked) => {
    setAdicionales(previous => esBase || !checked ? previous.filter(id => id !== atleta._id) : [...new Set([...previous, atleta._id])]);
    setExcluidos(previous => esBase && !checked ? [...new Set([...previous, atleta._id])] : previous.filter(id => id !== atleta._id));
  };
  const filas = (items, esBase) => {
    const cantidad = esBase ? filasBase : filasOtros;
    const pagina = Math.min(esBase ? paginaBase : paginaOtros, Math.max(0, Math.ceil(items.length / cantidad) - 1));
    return <>
    <Box component="ul" key={`${pagina}-${cantidad}`} aria-label={esBase ? 'Atletas de categorias base' : 'Otros atletas disponibles'} sx={{ listStyle: 'none', p: 0, m: 0, minHeight: 300, maxHeight: 360, overflowY: 'auto', scrollbarGutter: 'stable' }}>
    {items.slice(pagina * cantidad, (pagina + 1) * cantidad).map(atleta => {
      const checked = esBase ? !excluidos.includes(atleta._id) : adicionales.includes(atleta._id);
      return <Box component="li" key={atleta._id} sx={{ borderBottom: '1px solid #eef0f2', bgcolor: checked ? '#f5f6f7' : '#fff' }}>
        <FormControlLabel sx={{ m: 0, px: 1, py: 0.75, minHeight: 58, width: '100%', boxSizing: 'border-box', alignItems: 'center', '& .MuiFormControlLabel-label': { minWidth: 0, flex: 1 } }} control={<Checkbox checked={checked} disabled={disabled || loading || Boolean(error) || (!atleta.activo && !checked)} onChange={(_, value) => cambiar(atleta, esBase, value)} sx={{ color: '#9ca3af', '&.Mui-checked': { color: '#4b5563' } }} />} label={<Box><Typography component="span" sx={{ display: 'block', fontSize: 14, fontWeight: checked ? 600 : 400, color: '#374151', overflowWrap: 'anywhere' }}>{atleta.nombre}</Typography><Typography component="span" sx={{ display: 'block', fontSize: 12, color: '#6b7280' }}>{atleta.categoria || 'Sin categoria'}{!atleta.activo ? ' - No disponible' : ''}</Typography></Box>} />
      </Box>;
    })}
    </Box>
    <TablePagination component="div" count={items.length} page={pagina} rowsPerPage={cantidad} rowsPerPageOptions={[5, 10, 25]} onPageChange={(_, value) => (esBase ? setPaginaBase : setPaginaOtros)(value)} onRowsPerPageChange={event => { (esBase ? setFilasBase : setFilasOtros)(Number(event.target.value)); (esBase ? setPaginaBase : setPaginaOtros)(0); }} labelRowsPerPage="Filas:" labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count}`} getItemAriaLabel={tipo => tipo === 'next' ? 'Pagina siguiente' : 'Pagina anterior'} sx={{ borderTop: '1px solid #e5e7eb', '& .MuiTablePagination-toolbar': { px: 0, minHeight: 52, flexWrap: 'wrap', justifyContent: 'flex-end' }, '& .MuiTablePagination-spacer': { display: 'none' }, '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows, & .MuiTablePagination-select': { fontSize: 12 }, '& .MuiTablePagination-input': { mx: 1 }, '& .MuiTablePagination-actions': { ml: 1 }, '& .MuiTablePagination-displayedRows': { ml: 'auto' } }} />
    </>;
  };
  return <>
    <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={abrir} disabled={disabled || !grupo.categorias.length} sx={{ ...ESTILO_BOTON_CABECERA, minHeight: 44, alignSelf: 'stretch' }}>Editar integrantes del grupo</Button>
    <Dialog open={abierto} onClose={() => setAbierto(false)} fullWidth maxWidth="lg" aria-labelledby="grupo-integrantes-titulo" PaperProps={{ sx: { borderRadius: 2, m: { xs: 1, sm: 3 }, width: { xs: 'calc(100% - 16px)', sm: 'calc(100% - 48px)' }, maxHeight: 'calc(100dvh - 32px)' } }}>
      <DialogTitle component="div" id="grupo-integrantes-cabecera" sx={{ p: 2.5, pr: 7, flexShrink: 0 }}><Typography component="h2" id="grupo-integrantes-titulo" sx={{ fontSize: 20, fontWeight: 700, color: '#374151' }}>Integrantes del grupo</Typography><Tooltip title="Cerrar integrantes"><IconButton aria-label="Cerrar integrantes" onClick={() => setAbierto(false)} sx={{ position: 'absolute', right: 12, top: 14, color: '#6b7280' }}><CloseIcon /></IconButton></Tooltip></DialogTitle>
      <DialogContent dividers sx={{ p: { xs: 2, sm: 3 }, minHeight: 0, '& .MuiOutlinedInput-root.Mui-focused fieldset': { borderColor: '#6b7280' }, '& .MuiInputLabel-root.Mui-focused': { color: '#4b5563' } }}>
        {loading ? <Stack direction="row" alignItems="center" gap={1.5} role="status" sx={{ py: 3 }}><CircularProgress size={20} sx={{ color: '#6b7280' }} /><Typography>Cargando atletas...</Typography></Stack> : error ? <Alert severity="error" action={<Button color="inherit" startIcon={<RestartAltIcon />} onClick={onRetry}>Reintentar</Button>}>{error}</Alert> : <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: { xs: 3, md: 0 } }}>
          <Box component="section" aria-label="Atletas de las categorias seleccionadas" sx={{ minWidth: 0, pr: { md: 3 } }}>
            <Box sx={{ minHeight: { md: 160, lg: 132 } }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} mb={1}><Typography component="h3" sx={{ fontSize: 14, fontWeight: 700, color: '#374151' }}>Categorias seleccionadas</Typography><Typography sx={{ fontSize: 12, color: '#6b7280', flexShrink: 0 }}>{base.filter(atleta => atleta.activo && !excluidos.includes(atleta._id)).length} / {base.filter(atleta => atleta.activo).length}</Typography></Stack>
            <Box sx={{ mb: 1.5 }}><Categorias categorias={grupo.categorias} /></Box>
            <TextField fullWidth size="small" label="Buscar por nombre" value={nombreBaseFiltro} onChange={event => { setNombreBaseFiltro(event.target.value); setPaginaBase(0); }} sx={{ mb: 1.5 }} />
            </Box>
            {baseVisibles.length ? filas(baseVisibles, true) : <Typography sx={{ py: 2, fontSize: 14, color: '#6b7280' }}>{base.length ? 'No hay atletas que coincidan.' : 'No hay atletas en estas categorias.'}</Typography>}
          </Box>
          <Box component="section" aria-label="Agregar otros atletas" sx={{ minWidth: 0, pt: { xs: 2.5, md: 0 }, pl: { md: 3 }, borderTop: { xs: '1px solid #d1d5db', md: 0 }, borderLeft: { md: '1px solid #d1d5db' } }}>
            <Box sx={{ minHeight: { md: 160, lg: 132 } }}>
            <Typography component="h3" sx={{ fontSize: 14, fontWeight: 700, color: '#374151', mb: 2 }}>Agregar otros atletas</Typography>
            <Stack direction={{ xs: 'column', sm: 'row', md: 'column', lg: 'row' }} gap={1.5} mb={1.5}>
              <TextField select size="small" label="Categoria" value={categoriaFiltro} onChange={event => { setCategoriaFiltro(event.target.value); setPaginaOtros(0); }} sx={{ width: { xs: '100%', sm: 190, md: '100%', lg: 190 }, flexShrink: 0 }}><MenuItem value="">Todas</MenuItem>{categoriasFiltro.map(categoria => <MenuItem key={categoria} value={categoria}>{categoria}</MenuItem>)}</TextField>
              <TextField fullWidth size="small" label="Nombre del atleta" value={nombreFiltro} onChange={event => { setNombreFiltro(event.target.value); setPaginaOtros(0); }} />
            </Stack>
            </Box>
            {otrosVisibles.length ? filas(otrosVisibles, false) : <Typography sx={{ py: 2, fontSize: 14, color: '#6b7280' }}>No hay atletas que coincidan.</Typography>}
          </Box>
        </Box>}
      </DialogContent>
      <DialogActions sx={{ flexShrink: 0, p: 2, gap: 1, bgcolor: '#f9fafb', flexWrap: 'wrap', '& > :not(style) ~ :not(style)': { ml: 0 } }}>
        <Typography aria-live="polite" sx={{ fontSize: 13, color: '#4b5563', mr: 'auto', width: { xs: '100%', sm: 'auto' }, mb: { xs: 0.5, sm: 0 } }}>{loading || error ? '' : `${total} ${total === 1 ? 'integrante' : 'integrantes'}`}</Typography>
        <Button startIcon={<CloseIcon />} onClick={() => setAbierto(false)} sx={{ ...ESTILO_BOTON_CABECERA, minHeight: 44 }}>Cancelar</Button>
        <Button variant="contained" disableElevation startIcon={<CheckIcon />} disabled={loading || Boolean(error) || disabled} onClick={() => { onChange({ alumnos_adicionales: adicionales, alumnos_excluidos: excluidos }); setAbierto(false); }} sx={{ ...primary, minHeight: 44, fontWeight: 700 }}>Aplicar integrantes</Button>
      </DialogActions>
    </Dialog>
  </>;
}

function ListaMovil({ registros, categorias, editable, saving, cambiarRegistro }) {
  const [notaAlumno, setNotaAlumno] = useState(null);
  const alumnoNota = registros.find(item => item.alumno === notaAlumno);
  const grupos = new Map(categorias.map(categoria => [categoria, []]));
  registros.forEach(item => {
    const categoria = item.categoria || 'Sin categoria';
    if (!grupos.has(categoria)) grupos.set(categoria, []);
    grupos.get(categoria).push(item);
  });
  const colores = { presente: '#16834b', ausente: '#ce4255', justificado: '#ad5b09', '': '#737784' };
  const siguiente = { presente: 'ausente', ausente: 'justificado', justificado: 'presente', '': 'presente' };
  return <>
    {[...grupos].filter(([, alumnos]) => alumnos.length).map(([categoria, alumnos]) => <Box component="section" key={categoria} aria-label={categoria} sx={{ mb: 2.5 }}>
      <Typography component="h3" sx={{ fontSize: 12, fontWeight: 800, color: '#777b87', mb: 1.5, textTransform: 'uppercase', overflowWrap: 'anywhere' }}>{categoria}</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '14px 8px' }}>
        {alumnos.map(item => {
          const nombre = nombreMovil(item.nombre);
          const iniciales = nombre.split(/\s+/).filter(Boolean).map(value => value[0]).slice(0, 2).join('').toUpperCase();
          const color = colores[item.estado] || colores[''];
          return <Box key={item.alumno} sx={{ minWidth: 0, textAlign: 'center' }}>
            <Tooltip title={`${item.nombre}: ${ESTADOS[item.estado] || 'Sin marcar'}`}>
              <ButtonBase aria-label={`${item.nombre}: ${ESTADOS[item.estado] || 'Sin marcar'}`} disabled={!editable || saving} onClick={() => cambiarRegistro(item.alumno, { estado: siguiente[item.estado] || 'presente' })} sx={{ width: '100%', maxWidth: 72, aspectRatio: '1', borderRadius: '50%', p: '3px', position: 'relative', border: `2px solid ${item.estado === 'presente' ? 'transparent' : color}`, '&.Mui-focusVisible': { outline: '3px solid #3530a0', outlineOffset: 3 } }}>
                <Avatar src={mediaUrl(item.foto) || undefined} alt="" sx={{ width: '100%', height: '100%', bgcolor: '#ededff', color: '#4643bd', fontSize: 19, fontWeight: 800, opacity: item.estado === 'ausente' ? 0.45 : 1 }}>{iniciales}</Avatar>
                <Box component="span" aria-hidden="true" sx={{ position: 'absolute', right: 0, bottom: 0, width: 21, height: 21, borderRadius: '50%', bgcolor: color, color: '#fff', border: '2px solid white', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800 }}>{item.estado === 'presente' ? <CheckIcon sx={{ fontSize: 13 }} /> : item.estado === 'ausente' ? 'A' : item.estado === 'justificado' ? 'J' : '?'}</Box>
              </ButtonBase>
            </Tooltip>
            <Tooltip title={`Observacion de ${item.nombre}`}>
              <ButtonBase aria-label={`Observacion de ${item.nombre}`} onClick={() => setNotaAlumno(item.alumno)} sx={{ width: '100%', minHeight: 40, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 0.25, pt: 0.5, color: '#383b4b', '&.Mui-focusVisible': { outline: '2px solid #3530a0' } }}>
                <Typography component="span" sx={{ minWidth: 0, fontSize: 11, lineHeight: 1.3, overflowWrap: 'anywhere' }}>{nombre}</Typography><EditOutlinedIcon sx={{ fontSize: 11, flexShrink: 0, mt: 0.2, color: item.observacion ? '#ad5b09' : '#9699a4' }} />
              </ButtonBase>
            </Tooltip>
          </Box>;
        })}
      </Box>
    </Box>)}
    <Dialog open={Boolean(alumnoNota)} onClose={() => setNotaAlumno(null)} fullWidth maxWidth="xs" aria-labelledby="asistencia-nota-titulo" PaperProps={{ sx: { borderRadius: 2, m: 2, width: 'calc(100% - 32px)', maxHeight: 'calc(100dvh - 32px)' } }}>
      <DialogTitle component="div" id="asistencia-nota-cabecera" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2.5, borderBottom: '1px solid #e5e7eb' }}>
        <Avatar src={mediaUrl(alumnoNota?.foto) || undefined} alt="" sx={{ width: 44, height: 44, flexShrink: 0, bgcolor: '#f3f4f6', color: '#4b5563', fontSize: 16, fontWeight: 800 }}>{alumnoNota ? nombreMovil(alumnoNota.nombre).split(/\s+/).filter(Boolean).map(value => value[0]).slice(0, 2).join('').toUpperCase() : ''}</Avatar>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography component="h2" id="asistencia-nota-titulo" sx={{ fontSize: 18, fontWeight: 700, color: '#374151', lineHeight: 1.35, overflowWrap: 'anywhere' }}>{alumnoNota?.nombre}</Typography>
          <Typography sx={{ mt: 0.25, fontSize: 12, color: '#6b7280', overflowWrap: 'anywhere' }}>{alumnoNota?.categoria}</Typography>
        </Box>
        <Tooltip title="Cerrar observacion"><IconButton aria-label="Cerrar observacion" onClick={() => setNotaAlumno(null)} sx={{ width: 36, height: 36, flexShrink: 0, color: '#6b7280', '&:hover': { bgcolor: '#f3f4f6' } }}><CloseIcon sx={{ fontSize: 20 }} /></IconButton></Tooltip>
      </DialogTitle>
      <DialogContent sx={{ p: 2.5 }}>
        <TextField fullWidth multiline minRows={4} maxRows={7} label="Observacion" value={alumnoNota?.observacion || ''} disabled={!editable || saving} onChange={event => cambiarRegistro(alumnoNota.alumno, { observacion: event.target.value })} inputProps={{ maxLength: 300 }} helperText={`${(alumnoNota?.observacion || '').length}/300`} FormHelperTextProps={{ sx: { textAlign: 'right', mx: 0, mt: 1, color: '#6b7280', fontSize: 12 } }} sx={{ mt: 1, '& .MuiOutlinedInput-root': { borderRadius: 1.5, bgcolor: '#fafafa', fontSize: 14, lineHeight: 1.6, '& fieldset': { borderColor: '#d1d5db' }, '&:hover fieldset': { borderColor: '#9ca3af' }, '&.Mui-focused fieldset': { borderColor: '#6b7280' } }, '& .MuiInputLabel-root.Mui-focused': { color: '#4b5563' } }} />
      </DialogContent>
      <DialogActions sx={{ px: 2.5, py: 2, bgcolor: '#f9fafb', borderTop: '1px solid #e5e7eb' }}>
        <Button fullWidth variant="contained" disableElevation startIcon={<CheckIcon />} onClick={() => setNotaAlumno(null)} sx={{ minHeight: 44, borderRadius: 1.5, fontSize: 14, fontWeight: 700, textTransform: 'none', bgcolor: '#374151', color: '#fff', '&:hover': { bgcolor: '#1f2937' }, '&.Mui-focusVisible': { outline: '2px solid #6b7280', outlineOffset: 2 } }}>Listo</Button>
      </DialogActions>
    </Dialog>
  </>;
}

export function AsistenciasSede({ sede }) {
  const esMovil = useMediaQuery(useTheme().breakpoints.down('sm'));
  const esEntrenador = (localStorage.getItem('rolActivo') || localStorage.getItem('rol')) === 'entrenador';
  const canManage = esEntrenador || hasPermission('asistencias.manage');
  const canConfigure = !esEntrenador && hasPermission('asistencias.manage');
  const [tab, setTab] = useState('sesiones');
  const [fecha, setFecha] = useState(fechaHoy);
  const [hoy, setHoy] = useState(fechaHoy);
  const [grupos, setGrupos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [entrenadores, setEntrenadores] = useState([]);
  const [entrenadoresRegistrados, setEntrenadoresRegistrados] = useState([]);
  const [sesiones, setSesiones] = useState([]);
  const [historial, setHistorial] = useState({ grupos: [] });
  const [mes, setMes] = useState(() => fechaHoy().slice(0, 7));
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [grupoEditar, setGrupoEditar] = useState(null);
  const [lista, setLista] = useState(null);
  const [dialogError, setDialogError] = useState('');
  const [saving, setSaving] = useState(false);
  const [abriendo, setAbriendo] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [atletas, setAtletas] = useState([]);
  const [cargandoAtletas, setCargandoAtletas] = useState(false);
  const [errorAtletas, setErrorAtletas] = useState('');
  const [revisionAtletas, setRevisionAtletas] = useState(0);
  const grupoAbierto = Boolean(grupoEditar);
  const sedeId = sede._id;

  useEffect(() => {
    if (!grupoAbierto || !canManage) return undefined;
    const controller = new AbortController();
    setAtletas([]); setCargandoAtletas(true); setErrorAtletas('');
    api(sedeId, 'atletas', { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setAtletas(data.atletas || []);
    }).catch(err => { if (!controller.signal.aborted) setErrorAtletas(err.message); }).finally(() => { if (!controller.signal.aborted) setCargandoAtletas(false); });
    return () => controller.abort();
  }, [grupoAbierto, canManage, sedeId, revisionAtletas]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const cargar = async () => {
      try {
        if (tab === 'grupos') {
          const data = await api(sedeId, 'grupos', { signal: controller.signal });
          if (!controller.signal.aborted) { setGrupos(data.grupos); setCategorias(data.categorias); setEntrenadores(data.entrenadores || []); setEntrenadoresRegistrados(data.entrenadores_registrados || []); }
        } else if (tab === 'historial') {
          const data = await api(sedeId, `historial?mes=${mes}`, { signal: controller.signal });
          if (!controller.signal.aborted) setHistorial(data);
        } else {
          const data = await api(sedeId, `sesiones?fecha=${fecha}`, { signal: controller.signal });
          if (!controller.signal.aborted) { setSesiones(data.sesiones); setHoy(data.hoy); }
        }
      } catch (err) { if (!controller.signal.aborted) setError(err.message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    cargar();
    return () => controller.abort();
  }, [sedeId, tab, fecha, mes, revision]);

  const moverDia = delta => {
    const date = new Date(`${fecha}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + delta);
    setFecha(date.toISOString().slice(0, 10));
  };
  const abrirLista = async sesion => {
    setAbriendo(true); setError(''); setDialogError(''); setDirty(false); setBusqueda(''); setMensaje('');
    try {
      const data = await api(sedeId, `lista/${sesion.grupo}?fecha=${sesion.fecha}`);
      const iniciarPresentes = esMovil && canManage && !data.tomada && data.fecha <= hoy && data.registros.length > 0;
      setLista(iniciarPresentes ? { ...data, registros: data.registros.map(item => ({ ...item, estado: 'presente' })) } : data);
      setDirty(iniciarPresentes);
    }
    catch (err) { setError(err.message); }
    finally { setAbriendo(false); }
  };
  const descartarCambios = () => {
    setConfirmarSalida(false);
    setLista(null); setGrupoEditar(null); setDialogError(''); setDirty(false);
  };
  const cerrarDialogo = () => {
    if (saving) return;
    if (dirty) { setConfirmarSalida(true); return; }
    descartarCambios();
  };
  const editarGrupo = grupo => { setGrupoEditar({ ...grupo, entrenadores: entrenadoresDelGrupo(grupo), alumnos_adicionales: grupo.alumnos_adicionales || [], alumnos_excluidos: grupo.alumnos_excluidos || [] }); setDialogError(''); setDirty(false); setMensaje(''); };
  const cambiarGrupo = fields => { setGrupoEditar(previous => ({ ...previous, ...fields })); setDirty(true); };
  const cambiarRegistro = (alumno, fields) => {
    setLista(previous => ({ ...previous, registros: previous.registros.map(item => item.alumno === alumno ? { ...item, ...fields } : item) }));
    setDirty(true);
  };
  const marcarTodos = estado => {
    setLista(previous => ({ ...previous, registros: previous.registros.map(item => ({ ...item, estado })) }));
    setDirty(true);
  };
  const guardarGrupo = async event => {
    event.preventDefault(); setSaving(true); setDialogError('');
    try {
      const guardado = await api(sedeId, `grupos${grupoEditar._id ? `/${grupoEditar._id}` : ''}`, { method: grupoEditar._id ? 'PUT' : 'POST', body: JSON.stringify({ ...grupoEditar, entrenador: grupoEditar.entrenadores[0] || '' }) });
      if (!Array.isArray(guardado.entrenadores) || guardado.entrenadores.length !== grupoEditar.entrenadores.length || guardado.entrenadores.some((nombre, index) => nombre !== grupoEditar.entrenadores[index])) {
        if (guardado._id) setGrupoEditar(previous => ({ ...previous, _id: guardado._id }));
        throw new Error('El servidor no confirmo todos los entrenadores. Reinicia el backend actualizado y vuelve a guardar. Tu seleccion se conserva.');
      }
      if (['alumnos_adicionales', 'alumnos_excluidos'].some(key => !Array.isArray(guardado[key]) || guardado[key].length !== grupoEditar[key].length || grupoEditar[key].some(id => !guardado[key].includes(id)))) {
        if (guardado._id) setGrupoEditar(previous => ({ ...previous, _id: guardado._id }));
        throw new Error('El servidor no confirmo los ajustes de atletas. Reinicia el backend actualizado y vuelve a guardar. Tu seleccion se conserva.');
      }
      if (grupoEditar.entrenadores_ids !== undefined && (!Array.isArray(guardado.entrenadores_ids) || guardado.entrenadores_ids.length !== grupoEditar.entrenadores_ids.length || grupoEditar.entrenadores_ids.some(id => !guardado.entrenadores_ids.includes(id)))) {
        if (guardado._id) setGrupoEditar(previous => ({ ...previous, _id: guardado._id }));
        throw new Error('El servidor no confirmo los entrenadores con acceso al grupo.');
      }
      setGrupoEditar(null); setDirty(false); setRevision(value => value + 1); setMensaje({ titulo: 'Grupo guardado.', detalle: grupoEditar.nombre });
    } catch (err) { setDialogError(err.message); }
    finally { setSaving(false); }
  };
  const guardarLista = async () => {
    setSaving(true); setDialogError('');
    try {
      await api(sedeId, `lista/${lista.grupo}`, { method: 'PUT', body: JSON.stringify({ fecha: lista.fecha, version: lista.__v ?? null, registros: lista.registros.map(({ alumno, estado, observacion }) => ({ alumno, estado, observacion })) }) });
      const marcados = lista.registros.filter(item => item.estado).length;
      setLista(null); setDirty(false); setRevision(value => value + 1); setMensaje({ titulo: 'Asistencia guardada.', detalle: `${lista.nombre} - ${marcados} de ${lista.registros.length} marcados` });
    } catch (err) { setDialogError(err.message); }
    finally { setSaving(false); }
  };
  const editable = canManage && lista?.fecha <= hoy;
  const pendientes = lista?.registros.filter(item => !item.estado).length || 0;
  const registrosVisibles = lista?.registros.filter(item => `${item.nombre} ${item.categoria}`.toLocaleLowerCase().includes(busqueda.toLocaleLowerCase())) || [];

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', color: '#171a2b', '& button': { letterSpacing: 0 }, '& .MuiButton-root': { textTransform: 'none' } }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} gap={2} mb={2}>
        <Box><Typography component="h1" sx={{ fontSize: 26, fontWeight: 800, lineHeight: 1.3 }}>Asistencias</Typography><Typography sx={{ color: '#747984', fontSize: 14 }}>{tab === 'sesiones' ? fechaTexto(fecha) : sede.nombre}</Typography></Box>
        <Stack direction="row" gap={1} flexWrap="wrap">
          {tab === 'sesiones' && <Button variant="outlined" startIcon={<TodayOutlinedIcon />} onClick={() => setFecha(fechaHoy())} sx={ESTILO_BOTON_CABECERA}>Hoy</Button>}
          {canConfigure && <Button variant="outlined" startIcon={<EventAvailableIcon />} onClick={() => setTab('grupos')} sx={ESTILO_BOTON_CABECERA}>Configurar grupos</Button>}
          <Button variant="outlined" startIcon={tab === 'historial' ? <EventAvailableIcon /> : <HistoryRoundedIcon />} onClick={() => setTab(tab === 'historial' ? 'sesiones' : 'historial')} sx={ESTILO_BOTON_CABECERA}>{tab === 'historial' ? 'Sesiones' : 'Historial'}</Button>
        </Stack>
      </Stack>
      <Tabs value={tab} onChange={(_, value) => { setTab(value); setMensaje(''); }} variant="scrollable" sx={{ borderBottom: '1px solid #e8e8ee', mb: 2, '& .MuiTabs-indicator': { bgcolor: '#6b7280' } }}>
        <Tab value="sesiones" label="Sesiones" sx={ESTILO_PESTANA} /><Tab value="grupos" label="Grupos de entrenamiento" sx={ESTILO_PESTANA} /><Tab value="historial" label="Historial" sx={ESTILO_PESTANA} />
      </Tabs>
      <Snackbar open={Boolean(mensaje)} autoHideDuration={5000} anchorOrigin={{ vertical: 'top', horizontal: esMovil ? 'center' : 'right' }} onClose={(_, reason) => { if (reason !== 'clickaway') setMensaje(''); }} sx={{ top: { xs: 'calc(env(safe-area-inset-top, 0px) + 16px)', sm: 24 }, left: { xs: 16, sm: 'auto' }, right: { xs: 16, sm: 24 }, width: { xs: 'auto', sm: 360 }, maxWidth: 'calc(100% - 32px)' }}>
        <Alert severity="success" role="status" aria-live="polite" icon={<CheckIcon sx={{ fontSize: 20 }} />} action={<Tooltip title="Cerrar notificacion"><IconButton size="small" aria-label="Cerrar notificacion" onClick={() => setMensaje('')} sx={{ color: '#66756d', width: 32, height: 32 }}><CloseIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>} sx={{ width: '100%', boxSizing: 'border-box', alignItems: 'center', bgcolor: '#fff', color: '#173e2b', border: '1px solid #d5e8dc', borderLeft: '4px solid #25834c', borderRadius: 2, boxShadow: '0 8px 28px rgba(22, 55, 37, 0.14)', py: 1, pl: 1.5, pr: 1, '& .MuiAlert-icon': { bgcolor: '#ddf7e9', color: '#187349', borderRadius: '50%', width: 34, height: 34, flexShrink: 0, p: 0, alignItems: 'center', justifyContent: 'center', opacity: 1 }, '& .MuiAlert-message': { flex: '1 1 auto', minWidth: 0, py: 0.5 }, '& .MuiAlert-action': { alignSelf: 'center', flexShrink: 0, p: 0, ml: 1, mr: 0 } }}>
          <Typography sx={{ fontSize: 14, fontWeight: 800, lineHeight: 1.5 }}>{mensaje.titulo}</Typography>
          <Typography sx={{ fontSize: 12, color: '#65736b', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{mensaje.detalle}</Typography>
        </Alert>
      </Snackbar>
      {error && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" onClick={() => setRevision(value => value + 1)}>Reintentar</Button>}>{error}</Alert>}
      {tab === 'sesiones' && <Stack direction="row" gap={0.5} alignItems="center" mb={2}>
        <Tooltip title="Dia anterior"><IconButton onClick={() => moverDia(-1)} aria-label="Dia anterior"><ChevronLeftIcon /></IconButton></Tooltip>
        <TextField type="date" label="Fecha" size="small" value={fecha} onChange={event => { if (event.target.value) setFecha(event.target.value); }} InputLabelProps={{ shrink: true }} sx={{ width: 175 }} />
        <Tooltip title="Dia siguiente"><IconButton onClick={() => moverDia(1)} aria-label="Dia siguiente"><ChevronRightIcon /></IconButton></Tooltip>
      </Stack>}
      {tab === 'grupos' && canConfigure && <Button variant="contained" startIcon={<AddIcon />} onClick={() => editarGrupo(nuevoGrupo())} sx={{ ...primary, mb: 2 }}>Nuevo grupo</Button>}
      {loading ? <Box role="status" sx={{ py: 6, textAlign: 'center' }}><CircularProgress size={28} /><Typography>Cargando...</Typography></Box> : !error && <>
        {tab === 'historial' ? <HistorialAsistencias reporte={historial} mes={mes} onMes={setMes} onAbrirLista={abrirLista} abriendo={abriendo} /> : tab === 'grupos' ? <>
          {!grupos.length && <Alert severity="info">No hay grupos de entrenamiento en esta sede.</Alert>}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
            {grupos.map(grupo => <Box key={grupo._id} sx={{ border: '1px solid #e7e7ed', borderRadius: 2, p: 2, minWidth: 0 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="flex-start" gap={1}><Typography component="h2" sx={{ fontWeight: 700, fontSize: 17, overflowWrap: 'anywhere' }}>{grupo.nombre}</Typography>{canConfigure && <Tooltip title="Editar grupo"><IconButton size="small" aria-label={`Editar ${grupo.nombre}`} onClick={() => editarGrupo({ ...grupo })}><EditOutlinedIcon fontSize="small" /></IconButton></Tooltip>}</Stack>
              <Chip size="small" label={grupo.activo ? 'Activo' : 'Inactivo'} sx={{ my: 1, bgcolor: grupo.activo ? '#ddf7e9' : '#f1f2f4' }} />
              <Typography sx={{ fontSize: 13, mb: 1 }}>{grupo.dias.map(dia => DIAS[dia]).join(', ')}</Typography>
              <Typography sx={{ fontWeight: 700, mb: 1 }}>{horaTexto(grupo.hora_inicio)} - {horaTexto(grupo.hora_fin)}</Typography>
              <Categorias categorias={grupo.categorias} />
              <Typography sx={{ color: '#747984', fontSize: 13, mt: 1, overflowWrap: 'anywhere' }}>{[entrenadoresDelGrupo(grupo).join(', '), grupo.cancha].filter(Boolean).join(' · ')}</Typography>
            </Box>)}
          </Box>
        </> : <>
          {!sesiones.length && <Alert severity="info">No hay sesiones programadas para esta fecha.</Alert>}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
            {sesiones.map(sesion => {
              const estado = estadoSesion(sesion, hoy);
              const motivoBloqueo = abriendo ? 'Se esta abriendo una lista. Espera un momento.'
                : !sesion.tomada && !canManage ? 'No tienes permiso para registrar asistencias.'
                : !sesion.tomada && sesion.fecha > hoy ? 'No puedes pasar lista en una fecha futura.'
                : !sesion.tomada && !sesion.total ? 'No hay alumnos activos en las categorias de este grupo.' : '';
              return <Box key={`${sesion.grupo}-${sesion.fecha}`} sx={{ border: '1px solid #e7e7ed', borderRadius: 2, p: 2, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1.2 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}><Typography sx={{ fontSize: 23, fontWeight: 800, lineHeight: 1.3 }}>{horaTexto(sesion.hora_inicio)}</Typography><Chip label={estado.texto} size="small" sx={{ fontSize: 11, fontWeight: 700, height: 22, bgcolor: estado.fondo, color: estado.color }} /></Stack>
                <Typography component="h2" sx={{ fontSize: 16, fontWeight: 700, overflowWrap: 'anywhere' }}>{sesion.nombre}</Typography>
                <Categorias categorias={sesion.categorias} />
                <Typography sx={{ fontSize: 12, color: '#747984', overflowWrap: 'anywhere' }}>{[entrenadoresDelGrupo(sesion).join(', '), sesion.cancha, `${sesion.total} alumnos`].filter(Boolean).join(' · ')}</Typography>
                <Stack gap={1.25} sx={{ borderTop: '1px solid #f0f0f3', pt: 1.5, mt: 'auto' }}>
                  {sesion.tomada && <Typography sx={{ fontSize: 12, color: '#6b7280' }}>{sesion.presentes}/{sesion.total} presentes</Typography>}
                  <Tooltip title={motivoBloqueo} describeChild arrow enterTouchDelay={0} leaveTouchDelay={3000}>
                    <Box component="span" tabIndex={motivoBloqueo ? 0 : undefined} aria-label={motivoBloqueo ? `Motivo del bloqueo: ${motivoBloqueo}` : undefined} sx={{ display: 'block', width: '100%', borderRadius: 1.5, '&:focus-visible': { outline: '2px solid #6b7280', outlineOffset: 2 } }}>
                      <Button variant="contained" disableElevation fullWidth startIcon={<EventAvailableIcon />} disabled={Boolean(motivoBloqueo)} onClick={() => abrirLista(sesion)} sx={{ minHeight: 44, px: 2, py: 1, borderRadius: 1.5, fontSize: 14, fontWeight: 700, textTransform: 'none', bgcolor: sesion.tomada ? '#f3f4f6' : '#374151', color: sesion.tomada ? '#374151' : '#fff', '&:hover': { bgcolor: sesion.tomada ? '#e5e7eb' : '#1f2937' }, '&.Mui-focusVisible': { outline: '2px solid #6b7280', outlineOffset: 2 }, '&.Mui-disabled': { bgcolor: '#e5e7eb', color: '#6b7280' } }}>{sesion.tomada ? (canManage ? 'Ver / editar' : 'Ver lista') : 'Pasar lista'}</Button>
                    </Box>
                  </Tooltip>
                </Stack>
              </Box>;
            })}
          </Box>
        </>}
      </>}

      <Dialog open={Boolean(grupoEditar)} onClose={cerrarDialogo} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: 2, m: { xs: 1, sm: 3 }, width: { xs: 'calc(100% - 16px)', sm: '100%' } } }}>
        <Box component="form" onSubmit={guardarGrupo} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1, overflow: 'hidden' }}>
          <DialogTitle sx={{ pr: 6, fontWeight: 700, flexShrink: 0 }}>{grupoEditar?._id ? 'Editar grupo' : 'Nuevo grupo'}<IconButton aria-label="Cerrar grupo" disabled={saving} onClick={cerrarDialogo} sx={{ position: 'absolute', right: 8, top: 8 }}><CloseIcon /></IconButton></DialogTitle>
          {grupoEditar && <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
            {dialogError && <Alert severity="error">{dialogError}</Alert>}
            <TextField required label="Nombre del grupo" value={grupoEditar.nombre} onChange={event => cambiarGrupo({ nombre: event.target.value })} inputProps={{ maxLength: 100 }} />
            <Box>
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#374151', mb: 1 }}>Dias de entrenamiento</Typography>
              <ToggleButtonGroup value={grupoEditar.dias} onChange={(_, dias) => cambiarGrupo({ dias })} aria-label="Dias de entrenamiento" sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(4, minmax(0, 1fr))', sm: 'repeat(7, minmax(0, 1fr))' }, gap: 0.75 }}>
                {[1, 2, 3, 4, 5, 6, 0].map(dia => <ToggleButton key={dia} value={dia} aria-label={DIAS[dia]} sx={{ '&&': { m: 0, width: '100%', minWidth: 0, height: 58, p: 0.5, border: '1px solid #d1d5db', borderRadius: 1.5, display: 'flex', flexDirection: 'column', gap: 0.25, color: '#4b5563', bgcolor: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 0, textTransform: 'none', '&:hover': { bgcolor: '#f3f4f6', borderColor: '#9ca3af' }, '&.Mui-selected': { ...primary, borderColor: primary.bgcolor, '&:hover': { ...primary['&:hover'], borderColor: primary['&:hover'].bgcolor } }, '&.Mui-focusVisible': { outline: '2px solid #6b7280', outlineOffset: 2 } } }}>
                  <CheckIcon sx={{ fontSize: 18, visibility: grupoEditar.dias.includes(dia) ? 'visible' : 'hidden' }} />
                  {DIAS[dia].slice(0, 3)}
                </ToggleButton>)}
              </ToggleButtonGroup>
            </Box>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={2}><TextField fullWidth required type="time" label="Hora de inicio" value={grupoEditar.hora_inicio} onChange={event => cambiarGrupo({ hora_inicio: event.target.value })} InputLabelProps={{ shrink: true }} /><TextField fullWidth required type="time" label="Hora de fin" value={grupoEditar.hora_fin} onChange={event => cambiarGrupo({ hora_fin: event.target.value })} InputLabelProps={{ shrink: true }} /></Stack>
            <Autocomplete multiple options={categorias} value={grupoEditar.categorias} disableCloseOnSelect onChange={(_, value) => cambiarGrupo({ categorias: value })} renderOption={(props, option, { selected }) => { const { key, ...other } = props; return <li key={key} {...other}><Checkbox checked={selected} size="small" />{option}</li>; }} renderInput={params => <TextField {...params} label="Categorias" />} />
            {!categorias.length && <Alert severity="info">No hay categorias configuradas para esta academia.</Alert>}
            <IntegrantesGrupo grupo={grupoEditar} atletas={atletas} categorias={categorias} loading={cargandoAtletas} error={errorAtletas} onRetry={() => setRevisionAtletas(value => value + 1)} disabled={saving} onChange={cambiarGrupo} />
            <Autocomplete multiple freeSolo autoSelect openOnFocus selectOnFocus handleHomeEndKeys filterSelectedOptions options={entrenadores} value={grupoEditar.entrenadores} onChange={(_, value) => cambiarGrupo({ entrenadores: [...new Set(value.map(nombre => nombre.trim()).filter(Boolean))] })} renderInput={params => <TextField {...params} label="Entrenadores" inputProps={{ ...params.inputProps, maxLength: 100, autoComplete: 'off' }} />} />
            <Autocomplete multiple options={entrenadoresRegistrados} value={(grupoEditar.entrenadores_ids || []).map(id => entrenadoresRegistrados.find(item => item._id === id) || { _id: id, nombre: 'Entrenador no disponible' })} getOptionLabel={item => item.nombre} isOptionEqualToValue={(option, value) => option._id === value._id} onChange={(_, value) => cambiarGrupo({ entrenadores_ids: value.map(item => item._id), entrenadores: [...new Set([...grupoEditar.entrenadores, ...value.map(item => item.nombre)])] })} renderInput={params => <TextField {...params} label="Entrenadores con acceso al grupo" />} />
            <TextField label="Cancha" value={grupoEditar.cancha} onChange={event => cambiarGrupo({ cancha: event.target.value })} inputProps={{ maxLength: 100 }} />
            {grupoEditar._id && <FormControlLabel control={<Switch checked={grupoEditar.activo} onChange={(_, activo) => cambiarGrupo({ activo })} />} label="Grupo activo" />}
          </DialogContent>}
          <DialogActions sx={{ flexShrink: 0, px: { xs: 2, sm: 3 }, py: 2, gap: 1.25, bgcolor: '#f9fafb', flexDirection: { xs: 'column-reverse', sm: 'row' }, '& > :not(style) ~ :not(style)': { ml: 0 } }}>
            <Button variant="outlined" startIcon={<CloseIcon />} disabled={saving} onClick={cerrarDialogo} sx={{ '&&': { m: 0, minHeight: 44, minWidth: 112, width: { xs: '100%', sm: 'auto' }, px: 2.5, py: 1, borderRadius: 1.5, fontSize: 14, fontWeight: 700, textTransform: 'none', color: '#475569', borderColor: '#cbd5e1', bgcolor: '#fff', '&:hover': { bgcolor: '#f3f4f6', borderColor: '#94a3b8' }, '&.Mui-focusVisible': { outline: '2px solid #6b7280', outlineOffset: 2 }, '&.Mui-disabled': { color: '#9ca3af', borderColor: '#e5e7eb', bgcolor: '#f9fafb' } } }}>Cancelar</Button>
            <Button type="submit" variant="contained" disableElevation startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <SaveOutlinedIcon />} disabled={saving || !grupoEditar?.dias.length || !grupoEditar?.categorias.length} sx={{ '&&': { ...primary, m: 0, minHeight: 44, minWidth: 176, width: { xs: '100%', sm: 'auto' }, px: 2.5, py: 1, borderRadius: 1.5, fontSize: 14, fontWeight: 700, textTransform: 'none', '&.Mui-focusVisible': { outline: '2px solid #6b7280', outlineOffset: 2 }, '&.Mui-disabled': { bgcolor: '#e5e7eb', color: '#6b7280' } } }}>{saving ? 'Guardando...' : 'Guardar grupo'}</Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog open={Boolean(lista)} onClose={cerrarDialogo} fullScreen={esMovil} fullWidth maxWidth="md" aria-labelledby="asistencia-lista-titulo" PaperProps={{ sx: esMovil ? { m: 0, width: '100%', height: '100dvh', maxHeight: '100dvh', borderRadius: 0 } : { borderRadius: 2 } }}>
        {esMovil ? <DialogTitle component="div" sx={{ px: 2, pt: 'max(12px, env(safe-area-inset-top))', pb: 1.5, borderBottom: '1px solid #efeff4' }}>
          <Stack direction="row" alignItems="center" gap={0.5} mb={0.5}><Tooltip title="Volver"><IconButton size="small" aria-label="Cerrar lista" disabled={saving} onClick={cerrarDialogo}><ChevronLeftIcon /></IconButton></Tooltip><Typography sx={{ fontSize: 12, color: '#777b87', overflowWrap: 'anywhere' }}>{lista?.nombre}{lista && ` · ${horaTexto(lista.hora_inicio)}`}</Typography></Stack>
          <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1}><Typography component="h2" id="asistencia-lista-titulo" sx={{ fontSize: 23, fontWeight: 800 }}>¿Quién faltó?</Typography><Typography aria-label={`${lista?.registros.filter(item => item.estado === 'presente').length || 0} de ${lista?.registros.length || 0} presentes`} sx={{ color: '#18796d', fontSize: 17, fontWeight: 800 }}>{lista?.registros.filter(item => item.estado === 'presente').length || 0}/{lista?.registros.length || 0}</Typography></Stack>
        </DialogTitle> : <DialogTitle id="asistencia-lista-titulo" sx={{ pr: 6, bgcolor: '#201d58', color: '#fff', fontSize: 20, fontWeight: 700, overflowWrap: 'anywhere' }}>{lista?.nombre}<Typography component="span" display="block" sx={{ fontSize: 13, fontWeight: 400, mt: 0.5 }}>{lista && `${fechaTexto(lista.fecha)} · ${horaTexto(lista.hora_inicio)}`}</Typography><IconButton aria-label="Cerrar lista" disabled={saving} onClick={cerrarDialogo} sx={{ position: 'absolute', right: 8, top: 8, color: '#fff' }}><CloseIcon /></IconButton></DialogTitle>}
        <DialogContent dividers={!esMovil} sx={{ px: { xs: 2, sm: 3 }, py: 2 }}>
          {dialogError && <Alert severity="error" sx={{ mb: 2 }}>{dialogError}</Alert>}
          {esMovil ? <ListaMovil registros={lista?.registros || []} categorias={lista?.categorias || []} editable={editable} saving={saving} cambiarRegistro={cambiarRegistro} /> : <>
          <Stack direction="row" gap={1} flexWrap="wrap" mb={2}>{Object.entries(ESTADOS).map(([estado, label]) => <Chip key={estado} size="small" label={`${lista?.registros.filter(item => item.estado === estado).length || 0} ${label.toLowerCase()}s`} sx={{ bgcolor: COLORES_ESTADOS[estado].indicador, color: COLORES_ESTADOS[estado].texto, fontWeight: 700 }} />)}<Chip size="small" label={`${pendientes} sin marcar`} sx={{ bgcolor: COLORES_ESTADOS[''].indicador, color: COLORES_ESTADOS[''].texto, fontWeight: 700 }} /></Stack>
          <Stack direction={{ xs: 'column', md: 'row' }} gap={1} mb={2}>
            <TextField size="small" label="Buscar alumno" value={busqueda} onChange={event => setBusqueda(event.target.value)} sx={{ flex: 1 }} />
            {editable && <Stack direction="row" alignItems="center" gap={0.5} flexWrap="wrap">
              <Button disabled={saving} startIcon={<CheckIcon />} onClick={() => marcarTodos('presente')} sx={{ color: COLORES_ESTADOS.presente.texto, whiteSpace: 'nowrap' }}>Todos presentes</Button>
              <Tooltip title="Desmarcar todos"><span><IconButton disabled={saving} aria-label="Desmarcar todos" onClick={() => marcarTodos('')} sx={{ color: COLORES_ESTADOS[''].texto }}><RestartAltIcon /></IconButton></span></Tooltip>
            </Stack>}
          </Stack>
          {registrosVisibles.map(item => {
            const colores = COLORES_ESTADOS[item.estado] || COLORES_ESTADOS[''];
            return <Box key={item.alumno} role="group" aria-label={`${item.nombre}: ${ESTADOS[item.estado] || 'Sin marcar'}`} sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) 150px' }, gap: 1, p: 1.5, mb: 1, bgcolor: colores.fondo, borderLeft: `3px solid ${colores.borde}`, borderBottom: '1px solid #ededf1' }}>
            <Stack direction="row" alignItems="center" gap={1.5} sx={{ minWidth: 0 }}>
              <Avatar src={mediaUrl(item.foto) || undefined} alt={`Foto de ${item.nombre}`} sx={{ width: 44, height: 44, flexShrink: 0, bgcolor: '#ededff', color: '#4643bd', fontSize: 16, fontWeight: 800 }}>{nombreMovil(item.nombre).split(/\s+/).filter(Boolean).map(value => value[0]).slice(0, 2).join('').toUpperCase()}</Avatar>
              <Box sx={{ minWidth: 0 }}><Typography sx={{ fontWeight: 700, fontSize: 14, overflowWrap: 'anywhere' }}>{item.nombre}</Typography><Typography sx={{ fontSize: 12, color: '#747984' }}>{item.categoria}</Typography></Box>
            </Stack>
            <TextField select size="small" label={`Estado de ${item.nombre}`} value={item.estado} disabled={!editable || saving} onChange={event => cambiarRegistro(item.alumno, { estado: event.target.value })} SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }} sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#fff', color: colores.texto, fontWeight: 700, '& fieldset': { borderColor: colores.borde }, '&:hover fieldset': { borderColor: colores.borde }, '&.Mui-focused fieldset': { borderColor: colores.borde }, '&.Mui-disabled fieldset': { borderColor: colores.borde } }, '& .MuiInputLabel-root, & .MuiSelect-icon': { color: colores.texto }, '& .MuiSelect-select.Mui-disabled': { WebkitTextFillColor: colores.texto } }}>{[['', 'Sin marcar'], ...Object.entries(ESTADOS)].map(([value, label]) => <MenuItem key={value} value={value}><Box component="span" aria-hidden="true" sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: COLORES_ESTADOS[value].borde, mr: 1, flexShrink: 0 }} />{label}</MenuItem>)}</TextField>
            <TextField size="small" label={`Nota de ${item.nombre}`} placeholder="Observacion (opcional)" value={item.observacion} disabled={!editable || saving} onChange={event => cambiarRegistro(item.alumno, { observacion: event.target.value })} inputProps={{ maxLength: 300 }} sx={{ gridColumn: '1 / -1', '& .MuiOutlinedInput-root': { bgcolor: '#fff' } }} />
          </Box>;
          })}
          {!registrosVisibles.length && <Typography sx={{ color: '#747984', py: 2 }}>No hay alumnos para mostrar.</Typography>}
          </>}
        </DialogContent>
        <DialogActions sx={{ px: { xs: 2, sm: 3 }, pt: esMovil ? 1.5 : 2, pb: esMovil ? 'max(16px, env(safe-area-inset-bottom))' : 2, flexWrap: 'wrap', gap: 1.25, bgcolor: esMovil ? '#fff' : '#fafafe', borderTop: esMovil ? '1px solid #efeff4' : undefined, '& > :not(style) ~ :not(style)': { ml: 0 } }}>
          {(!esMovil || !editable) && <Button variant="outlined" startIcon={<CloseIcon />} disabled={saving} onClick={cerrarDialogo} sx={{ minHeight: 42, minWidth: 112, px: 2.5, borderRadius: 1.5, fontSize: 14, fontWeight: 700, textTransform: 'none', color: '#4b4d60', borderColor: '#d8dae4', bgcolor: '#fff', '&:hover': { bgcolor: '#f4f4f8', borderColor: '#a6a7ba' } }}>{editable ? 'Cancelar' : 'Cerrar'}</Button>}
          {editable && <Button variant={esMovil ? 'text' : 'contained'} disableElevation fullWidth={esMovil} startIcon={esMovil ? undefined : saving ? <CircularProgress size={16} color="inherit" /> : <SaveOutlinedIcon />} disabled={saving || !lista?.registros.length || !dirty} onClick={guardarLista} sx={esMovil ? { minHeight: 48, borderRadius: 8, background: 'linear-gradient(100deg, #ed3885 0%, #ff7914 100%)', color: '#fff', fontSize: 15, fontWeight: 700, textTransform: 'none', '&:hover': { background: 'linear-gradient(100deg, #dc2774 0%, #ef6904 100%)' }, '&.Mui-disabled': { background: '#ededf2', color: '#8a8b97' } } : { ...primary, minHeight: 42, minWidth: 184, px: 2.5, borderRadius: 1.5, fontSize: 14, fontWeight: 700, textTransform: 'none', '&.Mui-disabled': { bgcolor: '#e8e8f0', color: '#7b7c8e' } }}>{saving ? 'Guardando...' : 'Guardar asistencia'}</Button>}
        </DialogActions>
      </Dialog>
      <Dialog open={confirmarSalida} onClose={() => setConfirmarSalida(false)} fullWidth maxWidth="xs" aria-labelledby="asistencia-salida-titulo" aria-describedby="asistencia-salida-descripcion" PaperProps={{ role: 'alertdialog', sx: { borderRadius: 2, m: 2, width: 'calc(100% - 32px)' } }}>
        <DialogTitle id="asistencia-salida-titulo" sx={{ px: 3, pt: 3, pb: 1, display: 'flex', alignItems: 'center', gap: 1.5, color: '#201d58', fontSize: 20, fontWeight: 800 }}>
          <Box component="span" sx={{ display: 'grid', placeItems: 'center', width: 40, height: 40, flexShrink: 0, borderRadius: '50%', bgcolor: '#fff1db', color: '#ad5b09' }}><WarningAmberRoundedIcon /></Box>
          Cambios sin guardar
        </DialogTitle>
        <DialogContent sx={{ px: 3, pb: 1 }}><Typography id="asistencia-salida-descripcion" sx={{ fontSize: 14, color: '#676977', lineHeight: 1.6 }}>{lista ? 'La asistencia tiene cambios sin guardar.' : 'El grupo tiene cambios sin guardar.'} Si sales ahora, se perderán.</Typography></DialogContent>
        <DialogActions sx={{ px: 3, pt: 2, pb: 3, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1, '& > :not(style) ~ :not(style)': { ml: 0 }, '& .MuiButton-root': { width: { xs: '100%', sm: 'auto' }, minHeight: 42, textTransform: 'none', fontWeight: 700 } }}>
          <Button autoFocus variant="contained" disableElevation onClick={() => setConfirmarSalida(false)} sx={primary}>Seguir editando</Button>
          <Button variant="outlined" onClick={descartarCambios} sx={{ color: '#b7354e', borderColor: '#e8b8c2', '&:hover': { borderColor: '#b7354e', bgcolor: '#fff4f6' } }}>Descartar cambios</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default function Asistencias() {
  const { sedeSeleccionada } = useSede();
  const navigate = useNavigate();
  if (!sedeSeleccionada?._id) return <Alert severity="info" action={<Button color="inherit" onClick={() => navigate('/panelOpciones')}>Seleccionar sede</Button>}>Selecciona una sede para consultar sus asistencias.</Alert>;
  return <AsistenciasSede key={sedeSeleccionada._id} sede={sedeSeleccionada} />;
}