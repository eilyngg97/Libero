import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Alert, Avatar, Box, Button, Chip, CircularProgress, Grid, MenuItem, Paper, Stack, TablePagination, TextField, Typography } from '@mui/material';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import ArrowBackOutlinedIcon from '@mui/icons-material/ArrowBackOutlined';
import ArrowForwardOutlinedIcon from '@mui/icons-material/ArrowForwardOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import AlternateEmailOutlinedIcon from '@mui/icons-material/AlternateEmailOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import CakeOutlinedIcon from '@mui/icons-material/CakeOutlined';
import WorkOutlineOutlinedIcon from '@mui/icons-material/WorkOutlineOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import OpenInNewOutlinedIcon from '@mui/icons-material/OpenInNewOutlined';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { mediaUrl } from '../utils/mediaUrl';
import { AsistenciasSede } from './Asistencias';

const DIAS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
const VISTAS = [
  ['grupos', 'Mis grupos y horarios', EventNoteOutlinedIcon, '#16c1de', '#0f8aa7', 'Ver grupos'],
  ['asistencias', 'Asistencias', FactCheckOutlinedIcon, '#302b73', '#201d58', 'Ver asistencias'],
  ['honorarios', 'Honorarios y pagos', PaymentsOutlinedIcon, '#ff8a00', '#ff6a00', 'Ver pagos'],
  ['informacion', 'Mi informacion', PersonOutlineIcon, '#2563eb', '#1d4ed8', 'Ver mi informacion'],
  ['constancias', 'Constancias', DescriptionOutlinedIcon, '#7b5cff', '#5a34d6', 'Ver constancias']
];
const money = (value, currency = 'USD') => Number(value || 0).toLocaleString('es-VE', { style: 'currency', currency });
const dateText = value => value ? new Date(value).toLocaleDateString('es-VE', { timeZone: 'UTC' }) : 'No registrado';

export default function DashboardEntrenador() {
  const [params, setParams] = useSearchParams();
  const vista = VISTAS.some(([key]) => key === params.get('vista')) ? params.get('vista') : null;
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState('');
  const [revision, setRevision] = React.useState(0);
  const [sedeId, setSedeId] = React.useState('');
  const [formato, setFormato] = React.useState('');
  const [fecha, setFecha] = React.useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
  const [datosConstancia, setDatosConstancia] = React.useState({ eventoFecha: fecha, eventoHoraDesde: '', eventoHoraHasta: '', eventoMotivo: '', asistenciaTiempo: 'pasado', diasEntrenamiento: [], horaInicio: '', horaFin: '' });
  const [descargando, setDescargando] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState('');
  const [pdf, setPdf] = React.useState(null);
  const pdfRequest = React.useRef(null);
  const [busqueda, setBusqueda] = React.useState('');
  const [page, setPage] = React.useState(0);
  const [rows, setRows] = React.useState(10);
  const token = localStorage.getItem('token');
  const apiBase = (process.env.REACT_APP_API_URL || window.location.origin).replace(/\/$/, '');

  React.useEffect(() => {
    const controller = new AbortController();
    setError(''); setData(null);
    fetch(`${apiBase}/api/entrenador`, { signal: controller.signal, headers: { Authorization: `Bearer ${token}` } })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'No se pudo cargar tu perfil.');
        if (!payload.entrenador || !Array.isArray(payload.grupos) || !Array.isArray(payload.sedes)) throw new Error('El servidor no devolvio el perfil completo.');
        if (!controller.signal.aborted) {
          setData(payload);
          const primeraSede = payload.grupos[0]?.sede || '';
          setSedeId(String(primeraSede));
          setFormato(payload.formatos?.[0]?.value || '');
          setPage(0);
        }
      }).catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [apiBase, token, revision]);

  React.useEffect(() => () => { if (pdf) URL.revokeObjectURL(pdf.url); }, [pdf]);
  React.useEffect(() => {
    setPdf(null);
    setDescargando(false);
    return () => pdfRequest.current?.abort();
  }, [vista, apiBase, token]);

  const requisitosFormato = data?.formatos?.find(item => item.value === formato)?.requisitos || {};
  const faltanDatosConstancia = (requisitosFormato.asistencia && (!datosConstancia.eventoFecha || !datosConstancia.eventoHoraDesde || !datosConstancia.eventoHoraHasta))
    || (requisitosFormato.horario && (!datosConstancia.diasEntrenamiento.length || !datosConstancia.horaInicio || !datosConstancia.horaFin));
  const descargarConstancia = async () => {
    if (!formato || !fecha || descargando || faltanDatosConstancia) return;
    setDescargando(true); setDownloadError(''); setPdf(null);
    const controller = new AbortController();
    pdfRequest.current = controller;
    try {
      const body = { tipo: formato, fechaEmision: fecha };
      if (requisitosFormato.asistencia) {
        for (const key of ['eventoFecha', 'eventoHoraDesde', 'eventoHoraHasta', 'eventoMotivo', 'asistenciaTiempo']) body[key] = datosConstancia[key];
      }
      if (requisitosFormato.horario) {
        for (const key of ['diasEntrenamiento', 'horaInicio', 'horaFin']) body[key] = datosConstancia[key];
      }
      const response = await fetch(`${apiBase}/api/entrenador/constancias`, { method: 'POST', signal: controller.signal, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.error || 'No se pudo generar la constancia.'); }
      if (!response.headers.get('content-type')?.includes('application/pdf')) throw new Error('El servidor no devolvio una constancia PDF.');
      const blob = await response.blob();
      if (!controller.signal.aborted) setPdf({ url: URL.createObjectURL(blob), nombre: `constancia-entrenador-${fecha}.pdf` });
    } catch (err) { if (!controller.signal.aborted) setDownloadError(err.message); }
    finally { if (!controller.signal.aborted) setDescargando(false); }
  };

  if (error) return <Alert severity="error" action={<Button color="inherit" startIcon={<RefreshOutlinedIcon />} onClick={() => setRevision(value => value + 1)}>Reintentar</Button>}>{error}</Alert>;
  if (!data) return <Stack role="status" direction="row" alignItems="center" gap={2} sx={{ py: 5 }}><CircularProgress size={24} /><Typography>Cargando tu perfil...</Typography></Stack>;
  const { entrenador, grupos, sedes, formatos = [] } = data;
  const nombre = [entrenador.nombre, entrenador.apellido].filter(Boolean).join(' ');
  const iniciales = nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('');
  const sedesGrupos = sedes.filter(sede => grupos.some(grupo => String(grupo.sede) === String(sede._id)));
  const sedeActiva = sedesGrupos.find(sede => String(sede._id) === sedeId);
  const pagos = [...(entrenador.pagos_nomina || [])].sort((first, second) => new Date(second.fecha_pago) - new Date(first.fecha_pago));
  const pagosFiltrados = pagos.filter(pago => `${pago.periodo || ''} ${pago.periodo_clave || ''} ${pago.referencia || ''}`.toLowerCase().includes(busqueda.toLowerCase()));
  const pagina = Math.min(page, Math.max(0, Math.ceil(pagosFiltrados.length / rows) - 1));
  const labelSede = id => sedes.find(sede => String(sede._id) === String(id))?.nombre || 'Sede no disponible';

  return <Box sx={{ maxWidth: vista === 'constancias' ? 'none' : 1200, mx: 'auto', color: '#0B0F2A', '& .MuiButton-root': { textTransform: 'none' } }}>
    {!vista && <Stack direction="row" alignItems="center" gap={2} sx={{ py: 3, borderBottom: '1px solid #e5e7eb' }}>
      <Avatar src={mediaUrl(entrenador.foto) || undefined} alt={nombre} sx={{ width: 64, height: 64, bgcolor: '#0B0F2A', fontSize: 22, fontWeight: 800 }}>{iniciales}</Avatar>
      <Box sx={{ minWidth: 0, flex: 1 }}><Typography component="h1" sx={{ fontSize: 24, fontWeight: 800, overflowWrap: 'anywhere' }}>{nombre}</Typography><Stack direction="row" flexWrap="wrap" gap={1} alignItems="center"><Chip label="Entrenador" size="small" sx={{ borderRadius: 1, bgcolor: '#fce7ef', color: '#b92859', fontWeight: 700 }} /><Typography sx={{ fontSize: 13, color: '#6b7280' }}>{entrenador.especialidad || 'Academia deportiva'}</Typography></Stack></Box>
    </Stack>}
    {!vista ? <Grid container spacing={2.5} sx={{ mt: 1, pb: 3 }} justifyContent="center" component="nav" aria-label="Opciones del entrenador">
      {VISTAS.map(([key, label, Icon, inicio, fin, accion]) => <Grid key={key} size={{ xs: 12, sm: 6, md: 3 }}>
        <Button aria-label={label} onClick={() => setParams({ vista: key })} sx={{
          width: '100%', minHeight: theme => `calc(200px + ${theme.spacing(4)})`, height: '100%', p: 2,
          borderRadius: 3, boxShadow: 4, background: `linear-gradient(135deg, ${inicio} 0%, ${fin} 100%)`,
          color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
          justifyContent: 'space-between', position: 'relative', overflow: 'hidden', textAlign: 'left',
          transition: 'transform 0.2s', '&:hover': { transform: 'scale(1.04)' },
          '&.Mui-focusVisible': { outline: '3px solid #0B0F2A', outlineOffset: 3 },
          '& > *:not(.bg-icon)': { position: 'relative', zIndex: 1 }
        }}>
          <Box sx={{ bgcolor: 'rgba(255,255,255,0.2)', p: 1, borderRadius: '50%', display: 'flex' }}><Icon sx={{ fontSize: 32 }} /></Box>
          <Typography variant="h6" component="span" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{label}</Typography>
          <Stack direction="row" alignItems="center" gap={1}><Typography variant="body2" component="span" sx={{ fontWeight: 600 }}>{accion}</Typography><ArrowForwardOutlinedIcon sx={{ fontSize: 18 }} /></Stack>
          <Icon className="bg-icon" sx={{ position: 'absolute', top: 12, right: 12, fontSize: 96, opacity: 0.16 }} />
        </Button>
      </Grid>)}
    </Grid> : <Button startIcon={<ArrowBackOutlinedIcon />} onClick={() => setParams({})} sx={vista === 'constancias' ? { mb: 1.25, color: '#64748b', fontWeight: 700, borderRadius: 8, px: 0, py: 0, minWidth: 0, fontSize: 16, '& .MuiButton-startIcon': { mr: 0.6, ml: 0, '& svg': { fontSize: 18 } }, '&:hover': { bgcolor: 'transparent' } } : { mb: 3, color: '#475569' }}>Volver al dashboard</Button>}
    {vista === 'grupos' && <Box component="section">
      <Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, mb: 2 }}>Mis grupos y horarios</Typography>
      {!grupos.length ? <Alert severity="info">No tienes grupos asignados.</Alert> : grupos.map(grupo => <Box key={grupo._id} sx={{ py: 2.5, borderBottom: '1px solid #e5e7eb', display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) 180px 160px' }, gap: 2, alignItems: 'center' }}>
        <Box sx={{ minWidth: 0 }}><Typography component="h3" sx={{ fontSize: 16, fontWeight: 700, overflowWrap: 'anywhere' }}>{grupo.nombre}</Typography><Typography sx={{ color: '#6b7280', fontSize: 13 }}>{labelSede(grupo.sede)}{grupo.cancha ? ` / ${grupo.cancha}` : ''}</Typography><Typography sx={{ mt: 0.5, color: '#64748b', fontSize: 13 }}>{(grupo.categorias || []).join(', ')}</Typography></Box>
        <Box><Typography sx={{ fontWeight: 700, fontSize: 15 }}>{grupo.hora_inicio} - {grupo.hora_fin}</Typography><Typography sx={{ fontSize: 13, color: '#6b7280' }}>{(grupo.dias || []).map(dia => DIAS[dia]).join(' / ')}</Typography></Box>
        <Button variant="outlined" startIcon={<FactCheckOutlinedIcon />} onClick={() => { setSedeId(String(grupo.sede)); setParams({ vista: 'asistencias' }); }} sx={{ color: '#475569', borderColor: '#cbd5e1', minHeight: 40 }}>Asistencias</Button>
      </Box>)}
    </Box>}
    {vista === 'asistencias' && <Box component="section">
      {!sedesGrupos.length ? <Alert severity="info">No tienes grupos asignados para registrar asistencias.</Alert> : <>
        <TextField select label="Sede" size="small" value={sedeId} onChange={event => setSedeId(event.target.value)} sx={{ mb: 3, width: '100%', maxWidth: 320 }}>{sedesGrupos.map(sede => <MenuItem key={sede._id} value={String(sede._id)}>{sede.nombre}</MenuItem>)}</TextField>
        {sedeActiva && <AsistenciasSede key={sedeId} sede={sedeActiva} />}
      </>}
    </Box>}
    {vista === 'honorarios' && <Box component="section">
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={2} sx={{ mb: 3 }}><Box><Typography component="h2" sx={{ fontSize: 18, fontWeight: 700 }}>Honorarios y pagos</Typography><Typography sx={{ color: '#6b7280', fontSize: 14, mt: 0.5 }}>Base mensual: {money(entrenador.pago_config?.monto_base_usd)} / {entrenador.pago_config?.frecuencia_pago || 'Sin frecuencia registrada'}</Typography></Box><TextField size="small" label="Periodo o referencia" value={busqueda} onChange={event => { setBusqueda(event.target.value); setPage(0); }} /></Stack>
      {!pagosFiltrados.length ? <Alert severity="info">No hay pagos registrados{busqueda ? ' que coincidan con la busqueda' : ''}.</Alert> : pagosFiltrados.slice(pagina * rows, (pagina + 1) * rows).map((pago, index) => <Box key={pago._id || index} sx={{ py: 2, borderBottom: '1px solid #e5e7eb' }}>
        <Stack direction="row" justifyContent="space-between" gap={2}><Box sx={{ minWidth: 0 }}><Typography sx={{ fontWeight: 700, fontSize: 15, overflowWrap: 'anywhere' }}>{pago.periodo || pago.periodo_clave || 'Pago de honorarios'}</Typography><Typography sx={{ color: '#6b7280', fontSize: 13 }}>{dateText(pago.fecha_pago)} / {pago.metodo_pago || 'Sin metodo'}</Typography></Box><Box sx={{ textAlign: 'right', flexShrink: 0 }}><Typography sx={{ fontWeight: 800, color: '#15856f' }}>{money(pago.monto_total_usd)}</Typography><Typography sx={{ color: '#6b7280', fontSize: 12 }}>{money(pago.monto_total_ves, 'VES')}</Typography></Box></Stack>
        <Box component="details" sx={{ mt: 1.5, color: '#475569', fontSize: 13 }}><Box component="summary" sx={{ cursor: 'pointer', width: 'fit-content', py: 0.5 }}>Detalle del pago</Box><Stack gap={0.75} sx={{ pt: 1 }}><Typography variant="body2">Base: {money(pago.monto_base_pago_usd)} / Bono: {money(pago.bono_usd)} / Deduccion: {money(pago.deduccion_usd)}</Typography><Typography variant="body2">Referencia: {pago.referencia || 'No registrada'}</Typography>{pago.observacion && <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{pago.observacion}</Typography>}{pago.comprobante_url && <Button component="a" href={mediaUrl(pago.comprobante_url)} target="_blank" rel="noopener noreferrer" startIcon={<DescriptionOutlinedIcon />} sx={{ alignSelf: 'flex-start', color: '#475569' }}>Comprobante</Button>}</Stack></Box>
      </Box>)}
      {pagosFiltrados.length > 0 && <TablePagination component="div" count={pagosFiltrados.length} page={pagina} rowsPerPage={rows} rowsPerPageOptions={[5, 10, 25]} onPageChange={(_, value) => setPage(value)} onRowsPerPageChange={event => { setRows(Number(event.target.value)); setPage(0); }} labelRowsPerPage="Filas:" labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count}`} sx={{ '& .MuiTablePagination-toolbar': { flexWrap: 'wrap', px: 0 }, '& .MuiTablePagination-spacer': { display: 'none' }, '& .MuiTablePagination-actions': { ml: 1 } }} />}
    </Box>}
    {vista === 'informacion' && <Box component="section" sx={{ pb: 3 }}>
      <Typography component="h2" sx={{ fontSize: 22, fontWeight: 800, mb: 3 }}>Mi informacion</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 1.2fr) minmax(0, 1fr)' }, gap: { xs: 3, md: 4 } }}>
        {[
          { titulo: 'Datos personales', Icono: PersonOutlineIcon, color: '#2563eb', fondo: '#eff6ff', campos: [
            ['Cedula', entrenador.cedula, BadgeOutlinedIcon], ['Fecha de nacimiento', dateText(entrenador.fecha_nacimiento), CakeOutlinedIcon],
            ['Telefono', entrenador.telefono, PhoneOutlinedIcon], ['Correo', entrenador.correo, AlternateEmailOutlinedIcon],
            ['Direccion', entrenador.direccion, LocationOnOutlinedIcon]
          ] },
          { titulo: 'Perfil profesional', Icono: WorkOutlineOutlinedIcon, color: '#15856f', fondo: '#edf8f4', campos: [
            ['Especialidad', entrenador.especialidad, FactCheckOutlinedIcon], ['Nivel de instruccion', entrenador.nivel_instruccion, SchoolOutlinedIcon],
            ['Fecha de ingreso', dateText(entrenador.fecha_ingreso), EventNoteOutlinedIcon], ['Tipo de contrato', entrenador.tipo_contrato?.replace(/_/g, ' '), WorkOutlineOutlinedIcon],
            ['Sedes', sedes.map(sede => sede.nombre).join(', '), LocationOnOutlinedIcon]
          ] }
        ].map(({ titulo, Icono, color, fondo, campos }) => <Box component="section" key={titulo} sx={{ minWidth: 0 }}>
          <Stack direction="row" alignItems="center" gap={1.5} sx={{ px: 2, py: 1.5, bgcolor: fondo, borderLeft: `3px solid ${color}`, mb: 1 }}>
            <Icono sx={{ color, fontSize: 24 }} /><Typography component="h3" sx={{ fontSize: 16, fontWeight: 800 }}>{titulo}</Typography>
          </Stack>
          <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' }, columnGap: 2.5 }}>
            {campos.map(([label, value, IconoCampo]) => <Box key={label} sx={{ py: 2, minWidth: 0, borderBottom: '1px solid #e8edf3', gridColumn: label === 'Direccion' || label === 'Correo' || label === 'Sedes' ? '1 / -1' : 'auto' }}>
              <Typography component="dt" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 12, color: '#64748b', mb: 0.75 }}><IconoCampo sx={{ fontSize: 17, color }} />{label}</Typography>
              <Typography component="dd" sx={{ m: 0, pl: '25px', fontSize: 15, fontWeight: value && value !== 'No registrado' ? 700 : 400, color: value && value !== 'No registrado' ? '#0B0F2A' : '#64748b', overflowWrap: 'anywhere', lineHeight: 1.6 }}>{value || 'No registrado'}</Typography>
            </Box>)}
          </Box>
        </Box>)}
      </Box>
      {['certificaciones', 'contratos'].some(key => entrenador[key]?.length > 0) && <Box component="section" sx={{ mt: 4, pt: 3, borderTop: '1px solid #e8edf3' }}>
        <Typography component="h3" sx={{ fontSize: 18, fontWeight: 800, mb: 2.5 }}>Mis documentos</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' }, gap: 3 }}>
          {['certificaciones', 'contratos'].map(key => entrenador[key]?.length > 0 && <Box key={key} sx={{ minWidth: 0 }}>
            <Stack direction="row" alignItems="center" gap={1} sx={{ mb: 1.5 }}><Typography component="h4" sx={{ fontSize: 14, fontWeight: 700, color: '#475569' }}>{key === 'contratos' ? 'Contratos' : 'Certificaciones'}</Typography><Box component="span" sx={{ bgcolor: '#f1f5f9', color: '#475569', borderRadius: 1, px: 0.75, fontSize: 12, fontWeight: 700 }}>{entrenador[key].length}</Box></Stack>
            <Stack gap={1}>{entrenador[key].map((url, index) => <Button key={`${url}-${index}`} component="a" href={mediaUrl(url)} target="_blank" rel="noopener noreferrer" sx={{ p: 1.5, minHeight: 64, borderRadius: 2, border: '1px solid #e2e8f0', color: '#0B0F2A', justifyContent: 'flex-start', gap: 1.5, textAlign: 'left', '&:hover': { bgcolor: '#f8fafc', borderColor: key === 'contratos' ? '#15856f' : '#2563eb' } }}>
              <Box sx={{ display: 'flex', p: 1, borderRadius: 1, bgcolor: key === 'contratos' ? '#edf8f4' : '#eff6ff', color: key === 'contratos' ? '#15856f' : '#2563eb' }}><DescriptionOutlinedIcon sx={{ fontSize: 22 }} /></Box>
              <Typography component="span" sx={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, overflowWrap: 'anywhere' }}>{key === 'contratos' ? 'Contrato' : 'Certificacion'} {index + 1}</Typography><OpenInNewOutlinedIcon sx={{ fontSize: 18, color: '#64748b', flexShrink: 0 }} />
            </Button>)}</Stack>
          </Box>)}
        </Box>
      </Box>}
    </Box>}
    {vista === 'constancias' && <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc', p: { xs: 2, md: 4 } }}>
      <Box sx={{ maxWidth: 1300, mx: 'auto', display: 'grid', gap: 3, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 0.9fr) minmax(0, 1.1fr)' }, alignItems: 'start' }}>
      <Paper component="section" aria-labelledby="entrenador-constancia-title" elevation={0} sx={{
        minWidth: 0, p: { xs: 2.5, md: 4 }, borderRadius: 4, boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
        '& .MuiOutlinedInput-root': { bgcolor: '#f8fafc', borderRadius: 2, '& fieldset': { borderColor: '#e2e8f0' }, '&:hover fieldset': { borderColor: '#cbd5e1' }, '&.Mui-focused fieldset': { borderColor: '#94a3b8' } }
      }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', mb: 3 }}>
          <Box sx={{ width: 56, height: 56, borderRadius: 3, bgcolor: '#ffedd5', color: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 1 }}><VerifiedUserIcon /></Box>
          <Typography id="entrenador-constancia-title" component="h2" variant="h6" sx={{ fontWeight: 800, color: '#0f172a' }}>Generar constancia</Typography>
        </Box>
        {!formatos.length ? <Alert severity="info">No hay formatos de constancias habilitados para entrenadores en esta academia.</Alert> : <Stack component="form" aria-label="Generar constancia" onSubmit={event => { event.preventDefault(); descargarConstancia(); }}>
      {downloadError && <Alert severity="error">{downloadError}</Alert>}
      <TextField select fullWidth margin="normal" label="Tipo de constancia" value={formato} onChange={event => { setFormato(event.target.value); setDownloadError(''); }}>{formatos.map(item => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}</TextField>
      <TextField type="date" fullWidth margin="normal" required label="Fecha de emision" value={fecha} onChange={event => setFecha(event.target.value)} InputLabelProps={{ shrink: true }} />
      {requisitosFormato.asistencia && <>
        <TextField type="date" fullWidth margin="normal" required label="Fecha del evento" value={datosConstancia.eventoFecha} onChange={event => setDatosConstancia(prev => ({ ...prev, eventoFecha: event.target.value }))} InputLabelProps={{ shrink: true }} />
        <TextField select fullWidth margin="normal" label="Tiempo del evento" value={datosConstancia.asistenciaTiempo} onChange={event => setDatosConstancia(prev => ({ ...prev, asistenciaTiempo: event.target.value }))}><MenuItem value="pasado">Pasado</MenuItem><MenuItem value="futuro">Futuro</MenuItem></TextField>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5} sx={{ mt: 1 }}>
          {[['eventoHoraDesde', 'Hora desde'], ['eventoHoraHasta', 'Hora hasta']].map(([key, label]) => <TextField key={key} type="time" required fullWidth label={label} value={datosConstancia[key]} onChange={event => setDatosConstancia(prev => ({ ...prev, [key]: event.target.value }))} InputLabelProps={{ shrink: true }} />)}
        </Stack>
        <TextField fullWidth margin="normal" label="Motivo del evento" value={datosConstancia.eventoMotivo} onChange={event => setDatosConstancia(prev => ({ ...prev, eventoMotivo: event.target.value }))} />
      </>}
      {requisitosFormato.horario && <>
        <TextField select fullWidth margin="normal" required label="Dias de entrenamiento" value={datosConstancia.diasEntrenamiento} SelectProps={{ multiple: true }} onChange={event => setDatosConstancia(prev => ({ ...prev, diasEntrenamiento: event.target.value }))}>{['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'].map(dia => <MenuItem key={dia} value={dia}>{dia}</MenuItem>)}</TextField>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1.5}>
          {[['horaInicio', 'Hora de inicio'], ['horaFin', 'Hora de fin']].map(([key, label]) => <TextField key={key} type="time" required fullWidth label={label} value={datosConstancia[key]} onChange={event => setDatosConstancia(prev => ({ ...prev, [key]: event.target.value }))} InputLabelProps={{ shrink: true }} />)}
        </Stack>
      </>}
      <Button type="submit" variant="contained" fullWidth startIcon={descargando ? <CircularProgress size={18} color="inherit" /> : undefined} disabled={descargando || !formato || !fecha || Boolean(faltanDatosConstancia)} sx={{ mt: 2, fontWeight: 700, borderRadius: 2, py: 1.2 }}>{descargando ? 'Generando...' : 'Generar PDF'}</Button>
        </Stack>}
      </Paper>
      {pdf && <Paper component="section" aria-label="Previsualizacion de constancia" elevation={0} sx={{ p: 2, minWidth: 0, borderRadius: 3, boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)', display: 'flex', flexDirection: 'column', height: { xs: 'calc(100vh - 160px)', md: 'calc(100vh - 120px)' }, minHeight: { xs: 420, md: 560 } }}>
        <Button component="a" href={pdf.url} download={pdf.nombre} variant="contained" fullWidth startIcon={<DownloadOutlinedIcon />} sx={{ fontWeight: 700, borderRadius: 2, py: 1.2, bgcolor: '#1e293b', color: '#fff', '&:hover': { bgcolor: '#334155' } }}>Descargar constancia</Button>
        <Box sx={{ flex: 1, minHeight: 0, mt: 1.2 }}>
          <iframe src={`${pdf.url}#navpanes=0&toolbar=0`} title="Vista previa" width="100%" height="100%" style={{ display: 'block', boxSizing: 'border-box', border: '1px solid #e2e8f0', borderRadius: 12 }} />
        </Box>
        <Box sx={{ mt: 2, p: 2, borderRadius: 3, border: '1px solid #fdba74', bgcolor: '#fff7ed', display: 'flex', alignItems: 'center', gap: 1 }}>
          <InfoOutlinedIcon sx={{ color: '#c2410c', fontSize: 18, flexShrink: 0 }} /><Typography variant="body2" sx={{ color: '#9a3412', fontWeight: 400 }}>Una vez impresas las constancias, deberan ser presentadas ante la Direccion de la Academia para su correspondiente firma y sello.</Typography>
        </Box>
      </Paper>}
      </Box>
    </Box>}
  </Box>;
}