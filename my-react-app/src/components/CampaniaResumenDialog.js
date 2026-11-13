import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, InputAdornment, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead,
  TablePagination, TableRow, TextField, Tooltip, Typography, useMediaQuery, useTheme
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { tieneMontosValidos } from '../utils/campaniaMontos';
import CampaniaPasos from './CampaniaPasos';
import CampaniaDialog from './CampaniaDialog';

const MODALIDADES = { general: 'Monto de campa\u00f1a', personalizado: 'Personalizado', no_aplica: 'No aplica' };
const normalizar = (valor) => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const dineroValido = (valor) => typeof valor === 'number' && Number.isFinite(valor) && valor >= 0;
const formatoMonto = (monto, moneda) => new Intl.NumberFormat('es-VE', { style: 'currency', currency: moneda }).format(monto);
const respuestaValida = (data, id, estado = 'borrador') => {
  const { campania, totales, filas } = data;
  const subtotal = Array.isArray(filas) ? filas.reduce((total, fila) => total + (dineroValido(fila?.monto) ? Math.round(fila.monto * 100) : 0), 0) / 100 : null;
  return campania?._id === id && campania.estado === estado && Number.isInteger(campania.__v) && campania.__v >= 0
    && typeof campania.nombre === 'string' && ['USD', 'EUR'].includes(campania.moneda)
    && Array.isArray(campania.sedes) && Array.isArray(campania.participantes)
    && new Set(campania.participantes).size === campania.participantes.length
    && Array.isArray(filas) && filas.length === campania.participantes.length
    && new Set(filas.map((fila) => fila?.alumno)).size === filas.length
    && filas.every((fila) => fila && typeof fila.alumno === 'string' && campania.participantes.includes(fila.alumno)
      && typeof fila.nombres === 'string' && typeof fila.apellidos === 'string' && Object.hasOwn(MODALIDADES, fila.modalidad)
      && typeof fila.nota_interna === 'string' && Array.isArray(fila.incidencias) && fila.incidencias.every((item) => typeof item === 'string')
      && (fila.modalidad === 'no_aplica' ? fila.monto === 0 : fila.monto === null || (dineroValido(fila.monto) && fila.monto > 0)))
    && totales && ['participantes', 'generales', 'personalizados', 'no_aplica', 'pendientes', 'con_observaciones']
      .every((campo) => Number.isInteger(totales[campo]) && totales[campo] >= 0)
    && totales.participantes === filas.length && totales.generales + totales.personalizados + totales.no_aplica === filas.length
    && totales.generales === filas.filter((fila) => fila.modalidad === 'general').length
    && totales.personalizados === filas.filter((fila) => fila.modalidad === 'personalizado').length
    && totales.no_aplica === filas.filter((fila) => fila.modalidad === 'no_aplica').length
    && totales.pendientes === filas.filter((fila) => fila.monto === null).length
    && totales.con_observaciones === filas.filter((fila) => fila.incidencias.length).length
    && dineroValido(totales.subtotal_calculado) && totales.subtotal_calculado === subtotal
    && (totales.pendientes ? totales.total_esperado === null : totales.total_esperado === totales.subtotal_calculado)
    && (estado === 'borrador' || (campania.publicacion
      && ['participantes', 'generales', 'personalizados', 'no_aplica', 'total_esperado'].every((campo) => campania.publicacion[campo] === totales[campo])
      && filas.every((fila) => dineroValido(fila.saldo_pendiente) && fila.saldo_pendiente <= fila.monto
        && (fila.modalidad === 'no_aplica' ? fila.estado === 'no_aplica' && fila.saldo_pendiente === 0 : fila.estado === 'pendiente'))));
};

function CampaniaResumenDialog({ campania, onClose, onRevisar, onPublished, creacionGuiada = false }) {
  const fullScreen = useMediaQuery(useTheme().breakpoints.down('sm'));
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [modalidad, setModalidad] = useState('');
  const [pagina, setPagina] = useState(0);
  const [filasPorPagina, setFilasPorPagina] = useState(10);
  const [confirmando, setConfirmando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [errorPublicacion, setErrorPublicacion] = useState('');
  const enviando = useRef(false);
  const solicitud = useRef('');
  const publicacionController = useRef(null);
  const publicada = campania.estado !== 'borrador';
  useEffect(() => () => publicacionController.current?.abort(), []);

  useEffect(() => {
    const controller = new AbortController();
    const cargar = async () => {
      setCargando(true); setDatos(null); setError('');
      try {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Tu sesi\u00f3n no est\u00e1 disponible. Inicia sesi\u00f3n nuevamente.');
        const response = await fetch(`${process.env.REACT_APP_API_URL || window.location.origin}/api/campanias-cobro/${campania._id}/${publicada ? 'cargos' : 'resumen'}`, {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'No se pudo cargar el resumen. Intenta nuevamente.');
        if (!respuestaValida(data, campania._id, campania.estado)) throw new Error('No se pudo verificar el resumen. Intenta nuevamente.');
        if (!controller.signal.aborted) { setDatos(data); setPagina(0); solicitud.current = ''; }
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message || 'No se pudo cargar el resumen.');
      } finally {
        if (!controller.signal.aborted) setCargando(false);
      }
    };
    cargar();
    return () => controller.abort();
  }, [campania._id, campania.estado, publicada, intento]);

  const cerrar = () => { if (!enviando.current) onClose(); };
  const cerrarConfirmacion = () => { if (!enviando.current) { setConfirmando(false); setErrorPublicacion(''); } };
  const tieneRevision = typeof datos?.revision === 'string' && /^[a-f\d]{64}$/.test(datos.revision);
  const puedePublicar = onPublished && !publicada && tieneRevision && !cargando && !error
    && datos.totales.participantes > 0 && !datos.totales.pendientes && !datos.totales.con_observaciones;
  const publicar = async () => {
    if (enviando.current || !puedePublicar) return;
    enviando.current = true; setPublicando(true); setErrorPublicacion('');
    const controller = new AbortController();
    publicacionController.current = controller;
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Tu sesi\u00f3n no est\u00e1 disponible.');
      if (!solicitud.current) solicitud.current = window.crypto.randomUUID();
      const response = await fetch(`${process.env.REACT_APP_API_URL || window.location.origin}/api/campanias-cobro/${campania._id}/publicar`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: datos.campania.__v, revision: datos.revision, solicitud_id: solicitud.current }),
        signal: controller.signal, cache: 'no-store'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudo publicar. Reintenta esta misma solicitud.');
      const guardada = data.campania;
      const registro = data.publicacion;
      if (!guardada || guardada._id !== campania._id || guardada.estado !== 'abierta' || guardada.__v !== datos.campania.__v + 1
        || guardada.moneda !== datos.campania.moneda || !tieneMontosValidos(guardada) || typeof guardada.nombre !== 'string'
        || !Array.isArray(guardada.sedes) || !Array.isArray(guardada.participantes)
        || guardada.participantes.length !== datos.campania.participantes.length
        || new Set(guardada.participantes).size !== guardada.participantes.length
        || guardada.participantes.some((id) => !datos.campania.participantes.includes(id))
        || !registro || registro.solicitud_id !== solicitud.current || registro.version_borrador !== datos.campania.__v
        || registro.revision !== datos.revision || !registro.actor?.id || !['admin', 'super_admin'].includes(registro.actor.rol)
        || typeof registro.fecha !== 'string' || Number.isNaN(new Date(registro.fecha).getTime())
        || ['participantes', 'generales', 'personalizados', 'no_aplica', 'total_esperado'].some((campo) => registro[campo] !== datos.totales[campo])
        || !guardada.publicacion || ['solicitud_id', 'revision', 'version_borrador', 'total_esperado', 'participantes'].some((campo) => guardada.publicacion[campo] !== registro[campo])) {
        throw new Error('No se pudo verificar la publicaci\u00f3n. Reintenta la misma solicitud o revisa el listado.');
      }
      if (!controller.signal.aborted) onPublished(guardada);
    } catch (err) {
      if (!controller.signal.aborted) setErrorPublicacion(err.message || 'No se pudo publicar. Reintenta esta misma solicitud.');
    } finally {
      enviando.current = false;
      if (!controller.signal.aborted) setPublicando(false);
    }
  };

  const filtradas = (datos?.filas || []).filter((fila) => (!modalidad || (modalidad === 'pendientes' ? fila.monto === null : fila.modalidad === modalidad))
    && normalizar(`${fila.nombres} ${fila.apellidos} ${fila.sede?.nombre || ''}`).includes(normalizar(busqueda).trim()));
  const paginaActual = Math.min(pagina, Math.max(0, Math.ceil(filtradas.length / filasPorPagina) - 1));

  return <><CampaniaDialog open fullWidth maxWidth="lg" fullScreen={fullScreen} onClose={cerrar} aria-labelledby="resumen-campania-titulo"
    PaperProps={{ sx: { maxWidth: 1000, borderRadius: { xs: 0, sm: 2 }, color: '#202441' } }}>
    <DialogTitle component="div" id="resumen-campania-cabecera" sx={{ bgcolor: '#171b4b', color: '#fff', px: { xs: 2.5, sm: 4 }, py: 2.5,
      display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 2 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 10, fontWeight: 800, color: '#f28cbd', mb: 0.75 }}>COBROS ADICIONALES</Typography>
        <Typography component="h2" id="resumen-campania-titulo" sx={{ fontSize: 22, fontWeight: 750, lineHeight: 1.25 }}>{publicada ? 'Cargos de la campa\u00f1a' : 'Resumen previo a publicar'}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.75 }}>
          <Typography sx={{ fontSize: 13, color: '#c6c8de', overflowWrap: 'anywhere', minWidth: 0 }}>{datos?.campania.nombre || campania.nombre}</Typography>
          <Chip label={publicada ? 'Publicada' : 'Borrador'} size="small" sx={{ bgcolor: publicada ? '#eaf6ee' : '#fff6dc', color: publicada ? '#237242' : '#8a6a20', borderRadius: 1, fontWeight: 650, height: 20 }} />
        </Box>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
        <Tooltip title="Recalcular resumen"><span><IconButton aria-label="Recalcular resumen" disabled={cargando || publicando} onClick={() => setIntento((actual) => actual + 1)}
          sx={{ color: '#d8daea', width: 32, height: 32, borderRadius: 1 }}><ReplayRoundedIcon sx={{ fontSize: 18 }} /></IconButton></span></Tooltip>
        <Tooltip title="Cerrar"><IconButton aria-label="Cerrar resumen" onClick={cerrar} disabled={publicando}
          sx={{ color: '#d8daea', bgcolor: 'rgba(255,255,255,0.07)', width: 32, height: 32, borderRadius: 1 }}><CloseRoundedIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
      </Box>
    </DialogTitle>
    <DialogContent sx={{ px: { xs: 2.5, sm: 4 }, pt: '24px !important', pb: 1, minWidth: 0,
      '& .MuiInputBase-root': { fontSize: 13, borderRadius: 1.5, bgcolor: '#fff' },
      '& .MuiInputLabel-root': { position: 'static', transform: 'none', maxWidth: '100%', mb: 0.75, color: '#30344b', fontSize: 12, fontWeight: 650 },
      '& .MuiOutlinedInput-notchedOutline': { top: 0, borderColor: '#e5e6ed', '& legend': { display: 'none' } },
      '& .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#7d849d', borderWidth: 1 } }}>
      {creacionGuiada && <CampaniaPasos paso={2} />}
      {cargando && <Box role="status" sx={{ py: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
        <CircularProgress size={22} sx={{ color: '#171b4b' }} /><Typography sx={{ fontSize: 14 }}>Calculando resumen...</Typography>
      </Box>}
      {error && <Alert severity="error" action={<Button color="inherit" onClick={() => setIntento((actual) => actual + 1)}>Reintentar</Button>}>{error}</Alert>}
      {!cargando && !error && datos && <>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 2, pb: 2.5,
          mb: 2.5, borderBottom: '1px solid #e9eaf0' }}>
          {[['Participantes', datos.totales.participantes], ['Total a recaudar', datos.totales.total_esperado, true],
            ['Personalizados', datos.totales.personalizados], ['No aplica', datos.totales.no_aplica]].map(([etiqueta, cantidad, esMonto]) =>
            <Box key={etiqueta} role="group" aria-label={etiqueta} sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 12, color: '#858999', minHeight: 36 }}>{etiqueta}</Typography>
              <Typography sx={{ fontSize: esMonto ? 18 : 22, fontWeight: 750, color: '#202441', mt: 0.5, overflowWrap: 'anywhere' }}>
                {esMonto ? cantidad === null ? 'Pendiente de revisar' : formatoMonto(cantidad, datos.campania.moneda) : cantidad}
                {!esMonto && <Box component="span" sx={{ fontSize: 11, fontWeight: 400, color: '#858999', ml: 0.75 }}> {cantidad === 1 ? 'atleta' : 'atletas'}</Box>}
              </Typography>
              {esMonto && cantidad === null && <Typography sx={{ fontSize: 12, color: '#626879', mt: 0.5, overflowWrap: 'anywhere' }}>
                {`Subtotal calculable: ${formatoMonto(datos.totales.subtotal_calculado, datos.campania.moneda)}`}
              </Typography>}
            </Box>)}
        </Box>
        {!datos.totales.participantes && <Alert severity="info" sx={{ mb: 2 }}>No hay participantes seleccionados.</Alert>}
        {datos.totales.con_observaciones > 0 && <Alert severity="warning" sx={{ mb: 2 }}>
          {`${datos.totales.con_observaciones} participante(s) con observaciones${datos.totales.pendientes ? `; ${datos.totales.pendientes} con importe pendiente` : ''}.`}
        </Alert>}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: '2fr 1fr' }, gap: 1.75, mb: 2 }}>
          <TextField size="small" label="Buscar atleta o sede" value={busqueda} onChange={(event) => { setBusqueda(event.target.value); setPagina(0); }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 18 }} /></InputAdornment> } }} />
          <TextField select size="small" label={'Condici\u00f3n'} value={modalidad} onChange={(event) => { setModalidad(event.target.value); setPagina(0); }}>
            <MenuItem value="">Todas las condiciones</MenuItem>{Object.entries(MODALIDADES).map(([valor, etiqueta]) => <MenuItem key={valor} value={valor}>{etiqueta}</MenuItem>)}
            <MenuItem value="pendientes">Importe pendiente</MenuItem>
          </TextField>
        </Box>
        <TableContainer sx={{ maxWidth: '100%' }}>
          <Table size="small" aria-label="Participantes del resumen" sx={{ minWidth: 620 }}>
            <TableHead sx={{ bgcolor: '#f5f6fa' }}><TableRow>{['Atleta', 'Sede', 'Condici\u00f3n', 'Importe', 'Nota interna'].map((titulo) =>
              <TableCell key={titulo} sx={{ color: '#626879', fontSize: 12, fontWeight: 750, whiteSpace: 'nowrap' }}>{titulo}</TableCell>)}
            </TableRow></TableHead>
            <TableBody>{filtradas.slice(paginaActual * filasPorPagina, (paginaActual + 1) * filasPorPagina).map((fila) => <TableRow key={fila.alumno}>
              <TableCell sx={{ minWidth: 150, maxWidth: 250, overflowWrap: 'anywhere' }}>
                <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{fila.nombres} {fila.apellidos}</Typography>
                {fila.incidencias.map((incidencia, indice) => <Typography key={indice} sx={{ fontSize: 11, color: '#a33142', mt: 0.5 }}>{incidencia}</Typography>)}
              </TableCell>
              <TableCell sx={{ fontSize: 12, maxWidth: 160, overflowWrap: 'anywhere' }}>{fila.sede?.nombre || 'Sede no disponible'}</TableCell>
              <TableCell sx={{ fontSize: 12, color: fila.modalidad === 'no_aplica' ? '#a33142' : '#626879' }}>{MODALIDADES[fila.modalidad]}</TableCell>
              <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fila.monto === null ? 'Por revisar' : formatoMonto(fila.monto, datos.campania.moneda)}</TableCell>
              <TableCell sx={{ fontSize: 12, minWidth: 140, maxWidth: 250, overflowWrap: 'anywhere' }}>{fila.nota_interna || '-'}</TableCell>
            </TableRow>)}</TableBody>
          </Table>
        </TableContainer>
        {!filtradas.length && datos.totales.participantes > 0 && <Typography sx={{ py: 4, fontSize: 13, textAlign: 'center', color: '#858999' }}>No hay participantes que coincidan con los filtros.</Typography>}
        <TablePagination component="div" count={filtradas.length} page={paginaActual} rowsPerPage={filasPorPagina} rowsPerPageOptions={[5, 10, 25]}
          onPageChange={(event, nueva) => setPagina(nueva)} onRowsPerPageChange={(event) => { setFilasPorPagina(Number(event.target.value)); setPagina(0); }}
          labelRowsPerPage="Filas" labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count}`}
          getItemAriaLabel={(tipo) => tipo === 'next' ? 'P\u00e1gina siguiente' : 'P\u00e1gina anterior'}
          sx={{ '& .MuiTablePagination-toolbar': { px: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }, '& .MuiTablePagination-spacer': { display: 'none' },
            '& .MuiTablePagination-actions': { ml: 1 }, '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': { fontSize: 11 } }} />
      </>}
    </DialogContent>
    <DialogActions sx={{ px: { xs: 2.5, sm: 4 }, py: 1.75, gap: 1, borderTop: '1px solid #f0f1f5', bgcolor: '#fafafe',
      flexWrap: 'wrap', '& > :not(style) ~ :not(style)': { ml: 0 } }}>
      {!creacionGuiada && <Button onClick={cerrar} disabled={publicando} sx={{ color: '#50566e', fontSize: 12 }}>Cerrar</Button>}
      {!publicada && <Button disabled={!datos || cargando || Boolean(error) || publicando} onClick={() => onRevisar(datos.campania)} startIcon={creacionGuiada ? <ArrowBackRoundedIcon /> : <TuneRoundedIcon />}
        variant={creacionGuiada ? 'text' : 'contained'} sx={{ color: creacionGuiada ? '#50566e' : '#fff', bgcolor: creacionGuiada ? 'transparent' : '#171b4b',
          '&:hover': { bgcolor: creacionGuiada ? '#f0f1f5' : '#252b60' }, borderRadius: 1.5, boxShadow: 'none', fontSize: 12, minHeight: 40, textTransform: 'none' }}>
        {creacionGuiada ? 'Volver a participantes' : 'Revisar participantes'}
      </Button>}
      {creacionGuiada && <Button onClick={cerrar} disabled={publicando} variant="contained" startIcon={<SaveOutlinedIcon />}
        sx={{ bgcolor: '#171b4b', '&:hover': { bgcolor: '#252b60' }, borderRadius: 1.5, boxShadow: 'none', fontSize: 12, minHeight: 40,
          textTransform: 'none' }}>Guardar borrador</Button>}
      {onPublished && !publicada && tieneRevision && <Button variant="contained" disabled={!puedePublicar || publicando}
        onClick={() => { setConfirmando(true); setErrorPublicacion(''); }} startIcon={<CheckCircleRoundedIcon />}
        sx={{ bgcolor: '#d93670', '&:hover': { bgcolor: '#ba285b' }, borderRadius: 1.5, boxShadow: 'none', fontSize: 12, minHeight: 40,
          textTransform: 'none' }}>Publicar campaña</Button>}
    </DialogActions>
  </CampaniaDialog>
  <Dialog open={confirmando} onClose={cerrarConfirmacion} fullWidth maxWidth="sm" aria-labelledby="publicar-campania-titulo"
    aria-describedby="publicar-campania-advertencia" PaperProps={{ role: 'alertdialog', sx: { borderRadius: 2, color: '#202441' } }}>
    <DialogTitle id="publicar-campania-titulo" sx={{ bgcolor: '#171b4b', color: '#fff', fontSize: 20, px: 3, py: 2 }}>Publicar campaña</DialogTitle>
    <DialogContent sx={{ px: 3, pt: '24px !important' }}>
      {errorPublicacion && <Alert severity="error" sx={{ mb: 2 }}>{errorPublicacion}</Alert>}
      <Typography sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{datos?.campania.nombre}</Typography>
      <Typography sx={{ fontSize: 22, fontWeight: 750, mt: 1, overflowWrap: 'anywhere' }}>{datos && formatoMonto(datos.totales.total_esperado, datos.campania.moneda)}</Typography>
      <Typography sx={{ fontSize: 13, color: '#626879', mt: 1 }}>{datos && `${datos.totales.generales + datos.totales.personalizados} cargos pendientes · ${datos.totales.no_aplica} No aplica`}</Typography>
      <Typography id="publicar-campania-advertencia" sx={{ fontSize: 13, color: '#626879', mt: 2, lineHeight: 1.6 }}>
        Los cargos quedarán asignados y la campaña abierta. No se registrarán pagos ni se enviarán avisos.
      </Typography>
    </DialogContent>
    <DialogActions sx={{ p: 2, gap: 1, flexWrap: 'wrap' }}>
      <Button autoFocus disabled={publicando} onClick={cerrarConfirmacion} sx={{ color: '#50566e', textTransform: 'none' }}>Cancelar</Button>
      <Button disabled={publicando || !puedePublicar} onClick={publicar} variant="contained"
        startIcon={publicando ? <CircularProgress size={16} color="inherit" /> : <CheckCircleRoundedIcon />}
        sx={{ bgcolor: '#d93670', '&:hover': { bgcolor: '#ba285b' }, boxShadow: 'none', textTransform: 'none', borderRadius: 1.5 }}>
        {publicando ? 'Publicando...' : 'Confirmar publicación'}
      </Button>
    </DialogActions>
  </Dialog></>;
}

export default CampaniaResumenDialog;