import React, { useEffect, useState } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Avatar, Box, Button, Chip,
  CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel,
  InputAdornment, Pagination, Paper, Stack, Switch, Tab, Tabs, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import SendOutlinedIcon from '@mui/icons-material/SendOutlined';
import DoneAllOutlinedIcon from '@mui/icons-material/DoneAllOutlined';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';

const API_BASE = process.env.REACT_APP_API_URL || '';
const tipoTexto = (tipo) => tipo === 'antes' ? '1 dia antes' : '3 dias despues';
const fechaCorta = (fecha) => new Intl.DateTimeFormat('es-VE', {
  timeZone: 'America/Caracas', day: 'numeric', month: 'short'
}).format(new Date(`${fecha}T12:00:00-04:00`));
const estadoPrevia = (aviso) => {
  if (aviso.momento === 'pasado') return { texto: 'Fecha pasada', color: 'default' };
  if (aviso.bloqueos.some((motivo) => motivo.includes('Consentimiento'))) {
    return { texto: 'Falta autorización', color: 'warning' };
  }
  if (aviso.bloqueos.length) return { texto: 'Requiere revisión', color: 'warning' };
  return { texto: 'Solo simulación', color: 'info' };
};
const normalizarBusqueda = (texto) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const periodoActual = () => {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Caracas', year: 'numeric', month: '2-digit'
  }).formatToParts(new Date());
  return `${partes.find((item) => item.type === 'year').value}-${partes.find((item) => item.type === 'month').value}`;
};

async function consultar(path, options = {}) {
  const response = await fetch(`${API_BASE}/api/notificaciones${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || data.msg || 'No se pudo completar la solicitud.');
  return data;
}

export default function Notificaciones() {
  const [periodo, setPeriodo] = useState(periodoActual);
  const [pagina, setPagina] = useState(1);
  const [paginaPrevia, setPaginaPrevia] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recarga, setRecarga] = useState(0);
  const [vista, setVista] = useState('historial');
  const [busqueda, setBusqueda] = useState('');
  const [detalle, setDetalle] = useState(null);
  const rol = String(localStorage.getItem('rolActivo') || localStorage.getItem('rol') || '').toLowerCase();
  const superAdmin = rol === 'super_admin';

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setData(null);
    setDetalle(null);
    consultar(`?periodo=${encodeURIComponent(periodo)}&pagina=${pagina}`, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setPaginaPrevia(1);
        }
      })
      .catch((err) => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [periodo, pagina, recarga]);

  const cambiarEstado = async (habilitadas) => {
    setSaving(true);
    setError('');
    try {
      await consultar('/configuracion', { method: 'PATCH', body: JSON.stringify({ habilitadas }) });
      setRecarga((value) => value + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const avisosFiltrados = (data?.avisos || []).filter((aviso) =>
    normalizarBusqueda([aviso.representante, ...aviso.atletas.map((atleta) => atleta.nombre)].join(' '))
      .includes(normalizarBusqueda(busqueda.trim())));
  const tarjetas = data ? [
    { titulo: 'Enviados', total: data.resumen.enviados, ayuda: 'Aceptados por WhatsApp; la entrega puede estar pendiente.',
      Icono: SendOutlinedIcon, color: '#2563eb', fondo: '#eff6ff' },
    { titulo: 'Entregados', total: data.resumen.entregados, ayuda: 'Mensajes con entrega confirmada.',
      Icono: DoneAllOutlinedIcon, color: '#059669', fondo: '#ecfdf5' },
    { titulo: 'Con error', total: data.resumen.fallidos, ayuda: 'Mensajes que no pudieron completarse.',
      Icono: ErrorOutlineIcon, color: '#d97706', fondo: '#fffbeb' }
  ] : [];

  return (
    <Stack spacing={3} sx={{ maxWidth: 1280, mx: 'auto', pb: 3, color: '#172033' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Avatar variant="rounded" sx={{ bgcolor: '#e8f8ef', color: '#15966b', width: 48, height: 48, borderRadius: 3 }}>
            <WhatsAppIcon />
          </Avatar>
          <Box>
            <Typography component="h1" sx={{ fontWeight: 800, fontSize: { xs: 24, md: 28 } }}>Notificaciones</Typography>
            <Typography sx={{ color: '#64748b', fontSize: 14 }}>Recordatorios de mensualidad por WhatsApp</Typography>
          </Box>
        </Stack>
        <Chip label="En preparación" size="small" sx={{ alignSelf: 'flex-start', bgcolor: '#eff6ff', color: '#2563eb', fontWeight: 700 }} />
      </Stack>
      <Box sx={{ bgcolor: '#f0f7ff', border: '1px solid #dceafb', borderRadius: 3, px: 2.5, py: 1.75 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700 }}>Por ahora, no se envían recordatorios automáticos.</Typography>
        <Typography sx={{ fontSize: 13, color: '#526780', mt: 0.5 }}>
          Puedes consultar el historial y explorar cómo serían los avisos antes de activarlos.
        </Typography>
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }} justifyContent="space-between">
        <Stack direction="row" spacing={1} alignItems="center">
          <TextField label="Mes de mensualidades" type="month" size="small" value={periodo}
          sx={{ width: 215, '& .MuiOutlinedInput-root': { borderRadius: 2, bgcolor: '#fff' } }}
          inputProps={{ min: '2000-01', max: '2099-12' }}
          onChange={(event) => {
            if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(event.target.value)) {
              setPeriodo(event.target.value); setPagina(1); setPaginaPrevia(1); setBusqueda('');
            }
          }} InputLabelProps={{ shrink: true }} />
          <Button startIcon={<RefreshIcon />} onClick={() => setRecarga((value) => value + 1)}
            disabled={loading || saving} sx={{ textTransform: 'none' }}>Actualizar</Button>
        </Stack>
        {data && (superAdmin
          ? <Box>
            <FormControlLabel sx={{ mr: 0 }} label={<Typography sx={{ fontSize: 13, fontWeight: 600 }}>Habilitar para esta academia</Typography>}
              control={<Switch checked={data.habilitadas} disabled={saving || loading}
                onChange={(event) => cambiarEstado(event.target.checked)} />} />
            <Typography sx={{ color: '#64748b', fontSize: 12 }}>Guarda la preferencia; aún no activa envíos.</Typography>
          </Box>
          : <Chip size="small" variant="outlined" label={data.habilitadas ? 'Preferencia habilitada' : 'Preferencia desactivada'} />)}
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {loading && <Box role="status"><CircularProgress size={24} /> Cargando notificaciones...</Box>}
      {data && <>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 2 }}>
          {tarjetas.map(({ titulo, total, ayuda, Icono, color, fondo }) =>
            <Paper key={titulo} elevation={0} sx={{ p: 2.5, border: '1px solid #e5eaf1', borderRadius: 3 }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Box>
                  <Typography sx={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>{titulo}</Typography>
                  <Tooltip title={ayuda}><Typography component="p" sx={{ fontSize: 30, fontWeight: 800, mt: 0.5 }}>{total}</Typography></Tooltip>
                </Box>
                <Avatar variant="rounded" sx={{ bgcolor: fondo, color, borderRadius: 3 }}><Icono /></Avatar>
              </Stack>
            </Paper>)}
        </Box>
        <Paper elevation={0} sx={{ border: '1px solid #e5eaf1', borderRadius: 3, overflow: 'hidden' }}>
          <Tabs value={vista} onChange={(_, value) => setVista(value)} aria-label="Vistas de notificaciones"
            sx={{ px: 2, borderBottom: '1px solid #e5eaf1', '& .MuiTab-root': { textTransform: 'none', fontWeight: 700, minHeight: 56 } }}>
            <Tab label="Historial de envíos" value="historial" id="tab-historial" aria-controls="panel-historial" />
            <Tab label="Simulación" value="simulacion" id="tab-simulacion" aria-controls="panel-simulacion" />
          </Tabs>
          {vista === 'historial' ? <Box role="tabpanel" id="panel-historial" aria-labelledby="tab-historial">
            {data.historial.length === 0 ? <Stack spacing={1.5} alignItems="center" sx={{ py: 6, px: 3, textAlign: 'center' }}>
              <Avatar sx={{ width: 64, height: 64, bgcolor: '#f1f5f9', color: '#94a3b8' }}><NotificationsNoneOutlinedIcon sx={{ fontSize: 32 }} /></Avatar>
              <Typography sx={{ fontSize: 18, fontWeight: 700 }}>Aún no hay envíos</Typography>
              <Typography sx={{ color: '#64748b', fontSize: 14, maxWidth: 400 }}>
                Aquí verás los recordatorios enviados de este mes. Las pruebas técnicas no aparecen en este historial.
              </Typography>
              <Button variant="outlined" onClick={() => setVista('simulacion')} sx={{ textTransform: 'none', borderRadius: 2 }}>Ver simulación</Button>
            </Stack> : <>
              <TableContainer><Table aria-label="Historial de notificaciones">
                <TableHead sx={{ bgcolor: '#f8fafc' }}><TableRow>
                  {['Representante', 'Aviso', 'Fecha de envío', 'Estado'].map((label) => <TableCell key={label}>{label}</TableCell>)}
                </TableRow></TableHead>
                <TableBody>{data.historial.map((item) => <TableRow key={item._id} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{item.representante_nombre}</TableCell>
                  <TableCell>{tipoTexto(item.tipo)}</TableCell>
                  <TableCell>{new Date(item.createdAt).toLocaleString('es-VE', { timeZone: 'America/Caracas' })}</TableCell>
                  <TableCell>
                    <Chip size="small" variant="outlined" color={item.estado === 'entregado' ? 'success' : item.estado === 'fallido' ? 'error' : 'info'}
                      label={item.estado === 'aceptado' ? 'Enviado · entrega pendiente' : item.estado === 'entregado' ? 'Entregado' : 'Con error'} />
                    {item.error && <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>{item.error}</Typography>}
                  </TableCell>
                </TableRow>)}</TableBody>
              </Table></TableContainer>
              {data.paginacion.total > 25 && <Pagination sx={{ p: 2 }} aria-label="Páginas del historial"
                count={Math.ceil(data.paginacion.total / 25)} page={pagina} onChange={(_, value) => setPagina(value)} />}
            </>}
          </Box> : <Box role="tabpanel" id="panel-simulacion" aria-labelledby="tab-simulacion">
            <Stack spacing={2} sx={{ p: 2.5 }}>
              <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={2}>
                <Box>
                  <Typography sx={{ fontWeight: 700 }}>Así serían los avisos del mes</Typography>
                  <Typography sx={{ fontSize: 13, color: '#64748b', mt: 0.5 }}>Son ejemplos calculados con saldos actuales. No están programados ni se enviarán.</Typography>
                </Box>
                <TextField size="small" label="Buscar representante o atleta" value={busqueda}
                  onChange={(event) => { setBusqueda(event.target.value); setPaginaPrevia(1); }}
                  InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
                  sx={{ minWidth: { md: 285 } }} />
              </Stack>
              <Stack direction="row" gap={1} flexWrap="wrap">
                <Chip size="small" label={`${data.resumen.calculados} avisos simulados`} />
                <Chip size="small" variant="outlined" label={`${data.resumen.bloqueados} con requisitos pendientes`} />
              </Stack>
            </Stack>
            <TableContainer><Table aria-label="Vista previa de notificaciones" sx={{ minWidth: 650 }}>
              <TableHead sx={{ bgcolor: '#f8fafc' }}><TableRow>
                {['Representante / atletas', 'Aviso', 'Fecha', 'Importe', 'Estado', ''].map((label) => <TableCell key={label}>{label}</TableCell>)}
              </TableRow></TableHead>
              <TableBody>
                {avisosFiltrados.length === 0 && <TableRow><TableCell colSpan={6} sx={{ py: 5, textAlign: 'center', color: '#64748b' }}>
                  {busqueda ? 'No encontramos coincidencias para tu búsqueda.' : 'No hay avisos para simular en este mes.'}
                </TableCell></TableRow>}
                {avisosFiltrados.slice((paginaPrevia - 1) * 25, paginaPrevia * 25).map((aviso) => {
                  const estado = estadoPrevia(aviso);
                  return <TableRow key={aviso.id} hover>
                    <TableCell sx={{ maxWidth: 300 }}>
                      <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{aviso.representante}</Typography>
                      <Typography sx={{ fontSize: 12, color: '#64748b', mt: 0.5 }}>{aviso.atletas.map((atleta) => atleta.nombre).join(', ')}</Typography>
                    </TableCell>
                    <TableCell><Typography sx={{ fontSize: 13 }}>{aviso.tipo === 'antes' ? 'Por vencer' : 'Vencimiento pasado'}</Typography></TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>{fechaCorta(aviso.fecha)}</TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{aviso.total.toFixed(2)} {data.moneda}</TableCell>
                    <TableCell><Chip size="small" variant="outlined" color={estado.color} label={estado.texto} /></TableCell>
                    <TableCell><Button size="small" aria-label={`Ver detalle de ${aviso.representante}`}
                      sx={{ textTransform: 'none', whiteSpace: 'nowrap' }} onClick={() => setDetalle(aviso)}>Ver detalle</Button></TableCell>
                  </TableRow>;
                })}
              </TableBody>
            </Table></TableContainer>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 2 }} gap={2} flexWrap="wrap">
              <Typography sx={{ fontSize: 12, color: '#64748b' }}>{avisosFiltrados.length} resultados · Hora de Caracas</Typography>
              {avisosFiltrados.length > 25 && <Pagination aria-label="Paginas de vista previa"
                count={Math.ceil(avisosFiltrados.length / 25)} page={paginaPrevia} onChange={(_, value) => setPaginaPrevia(value)} />}
            </Stack>
          </Box>}
        </Paper>
        <Accordion elevation={0} disableGutters sx={{ border: '1px solid #e5eaf1', borderRadius: '12px !important', '&:before': { display: 'none' } }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}><Typography sx={{ fontSize: 14, fontWeight: 600 }}>Cómo funcionan los recordatorios</Typography></AccordionSummary>
          <AccordionDetails>
            <Stack spacing={1.5} sx={{ color: '#64748b', fontSize: 13 }}>
              <Typography variant="body2">Se avisa 1 día antes y 3 días después del vencimiento global o personalizado registrado. Los atletas del mismo representante se agrupan cuando coinciden la fecha y el tipo de aviso.</Typography>
              <Typography variant="body2">No se incluyen pagos en revisión, abonos ni cuotas no cobrables. Las fechas pasadas no se recuperan automáticamente. Las fechas de aviso pueden caer fuera del mes de la mensualidad.</Typography>
              <Typography variant="body2">Para enviar de verdad faltan la línea de producción, las plantillas agrupadas y la autorización de los representantes. Los saldos no incluyen recargos futuros proyectados.</Typography>
              {Object.keys(data.exclusiones).length > 0 && <Box>
                <Typography variant="body2" fontWeight={600}>Mensualidades fuera de la simulación</Typography>
                {Object.entries(data.exclusiones).map(([motivo, cantidad]) => <Typography key={motivo} variant="body2">{motivo}: {cantidad}</Typography>)}
              </Box>}
            </Stack>
          </AccordionDetails>
        </Accordion>
        <Dialog open={Boolean(detalle)} onClose={() => setDetalle(null)} fullWidth maxWidth="sm">
          <DialogTitle>Detalle del aviso simulado</DialogTitle>
          {detalle && <DialogContent dividers>
            <Stack spacing={2}>
              <Box><Typography fontWeight={700}>{detalle.representante}</Typography><Typography color="text.secondary">{detalle.telefono || 'Teléfono pendiente de corregir'}</Typography></Box>
              <Typography>{tipoTexto(detalle.tipo)} · {fechaCorta(detalle.fecha)} · Hora de Caracas</Typography>
              {detalle.atletas.map((atleta, index) => <Stack key={atleta.mensualidad || index} direction="row" justifyContent="space-between">
                <Typography>{atleta.nombre}</Typography><Typography fontWeight={600}>{atleta.saldo.toFixed(2)} {data.moneda}</Typography>
              </Stack>)}
              <Alert severity="info">Este aviso no está guardado ni programado para enviarse.</Alert>
              {detalle.momento === 'pasado' && <Typography variant="body2">La fecha ya pasó. No se enviará retroactivamente.</Typography>}
              {detalle.bloqueos.length > 0 && <Box><Typography fontWeight={600} gutterBottom>Requisitos pendientes</Typography>
                {detalle.bloqueos.map((motivo) => <Typography variant="body2" key={motivo} sx={{ mb: 0.75 }}>{motivo}</Typography>)}</Box>}
            </Stack>
          </DialogContent>}
          <DialogActions><Button onClick={() => setDetalle(null)}>Cerrar</Button></DialogActions>
        </Dialog>
      </>}
    </Stack>
  );
}
