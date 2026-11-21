import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, InputAdornment, LinearProgress, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead,
  TablePagination, TableRow, TextField, Tooltip, Typography, useMediaQuery, useTheme
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import PaidIcon from '@mui/icons-material/Paid';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import PersonAddOutlinedIcon from '@mui/icons-material/PersonAddOutlined';
import PersonRemoveOutlinedIcon from '@mui/icons-material/PersonRemoveOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import { tieneMontosValidos } from '../utils/campaniaMontos';
import { coberturaValida, detalleCobertura, titularCargo, esCubierto, etiquetaCobro, totalesEspecialesValidos } from '../utils/campaniaCobros';
import CampaniaPasos from './CampaniaPasos';
import CampaniaDialog from './CampaniaDialog';
import CampaniaPagoDialog from './CampaniaPagoDialog';
import CampaniaPagoAgrupadoDialog from './CampaniaPagoAgrupadoDialog';
import CampaniaCargoAjusteDialog from './CampaniaCargoAjusteDialog';
import CampaniaConversionDialog from './CampaniaConversionDialog';
import CampaniaCoberturaDialog from './CampaniaCoberturaDialog';
import EstadoPagoChip from './EstadoPagoChip';

const MODALIDADES = { general: 'Monto de campa\u00f1a', personalizado: 'Personalizado', no_aplica: 'No aplica' };
const ESTADOS = { pendiente: 'Pendiente', en_revision: 'En revisi\u00f3n', abono: 'Abono', pagado: 'Pagado', cubierto: 'Cubierto por pago familiar', no_aplica: 'No aplica', retirado: 'Retirado' };
const estadoVisible = (fila) => esCubierto(fila) ? 'cubierto' : fila.retirado ? 'retirado' : fila.pago_en_revision ? 'en_revision' : fila.estado;
const normalizar = (valor) => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const dineroValido = (valor) => typeof valor === 'number' && Number.isFinite(valor) && valor >= 0;
const formatoMonto = (monto, moneda) => new Intl.NumberFormat('es-VE', { style: 'currency', currency: moneda }).format(monto);
const respuestaValida = (data, id, estado = 'borrador') => {
  const { campania, totales, filas } = data;
  const porRepresentante = campania?.unidad_cobro === 'representante';
  const subtotal = Array.isArray(filas) ? filas.reduce((total, fila) => total + (dineroValido(fila?.monto) ? Math.round(fila.monto * 100) : 0), 0) / 100 : null;
  return campania?._id === id && (estado === 'borrador' ? campania.estado === estado : ['abierta', 'cerrada', 'cancelada'].includes(campania.estado))
    && Number.isInteger(campania.__v) && campania.__v >= 0
    && typeof campania.nombre === 'string' && ['USD', 'EUR'].includes(campania.moneda)
    && Array.isArray(campania.sedes) && Array.isArray(campania.participantes)
    && new Set(campania.participantes).size === campania.participantes.length
    && coberturaValida(filas, campania.participantes, porRepresentante)
    && new Set(filas.map((fila) => fila?.alumno)).size === filas.length
    && filas.every((fila) => fila && typeof fila.alumno === 'string' && campania.participantes.includes(fila.alumno)
      && typeof fila.nombres === 'string' && typeof fila.apellidos === 'string' && Object.hasOwn(MODALIDADES, fila.modalidad)
      && typeof fila.nota_interna === 'string' && Array.isArray(fila.incidencias) && fila.incidencias.every((item) => typeof item === 'string')
      && (fila.modalidad === 'no_aplica' ? fila.monto === 0 || (porRepresentante && fila.monto === null)
        : fila.monto === null || (dineroValido(fila.monto) && fila.monto > 0)))
    && totales && ['participantes', 'generales', 'personalizados', 'no_aplica', 'pendientes', 'con_observaciones']
      .every((campo) => Number.isInteger(totales[campo]) && totales[campo] >= 0)
    && totales.participantes === campania.participantes.length && totales.generales + totales.personalizados + totales.no_aplica + (totales.cubiertos || 0) === filas.length
    && totalesEspecialesValidos(filas, totales)
    && (!porRepresentante || (totales.cobros === filas.length
      && totales.representantes === filas.filter((fila) => fila.tipo_cobro === 'representante').length
      && totales.individuales === filas.filter((fila) => fila.tipo_cobro === 'individual_sin_representante').length))
    && totales.generales === filas.filter((fila) => fila.modalidad === 'general').length
    && totales.personalizados === filas.filter((fila) => fila.modalidad === 'personalizado').length
    && totales.no_aplica === filas.filter((fila) => fila.modalidad === 'no_aplica' && !esCubierto(fila)).length
    && totales.pendientes === filas.filter((fila) => fila.monto === null).length
    && totales.con_observaciones === filas.filter((fila) => fila.incidencias.length).length
    && dineroValido(totales.subtotal_calculado) && totales.subtotal_calculado === subtotal
    && (totales.pendientes ? totales.total_esperado === null : totales.total_esperado === totales.subtotal_calculado)
    && (estado === 'borrador' || (campania.publicacion
      && ['participantes', 'generales', 'personalizados', 'no_aplica', 'total_esperado'].every((campo) => (campania.totales_cargos || campania.publicacion)[campo] === totales[campo])
      && (!porRepresentante || ['cobros', 'representantes', 'individuales']
        .every((campo) => (campania.totales_cargos || campania.publicacion)[campo] === totales[campo]))
      && ['conservados', 'cubiertos'].every((campo) => ((campania.totales_cargos || campania.publicacion)[campo] ?? 0) === (totales[campo] ?? 0))
      && filas.every((fila) => dineroValido(fila.saldo_pendiente) && fila.saldo_pendiente <= fila.monto
        && (fila.pago_en_revision === undefined || typeof fila.pago_en_revision === 'boolean')
        && (fila.puede_revisar_cobertura === undefined || typeof fila.puede_revisar_cobertura === 'boolean')
        && (fila.modalidad === 'no_aplica' ? fila.estado === 'no_aplica' && fila.saldo_pendiente === 0
          : fila.saldo_pendiente === 0 ? fila.estado === 'pagado'
            : fila.saldo_pendiente === fila.monto ? fila.estado === 'pendiente' : fila.estado === 'abono'))));
};

function CampaniaResumenDialog({ campania, onClose, onRevisar, onPublished, onConverted, creacionGuiada = false }) {
  const publicada = campania.estado !== 'borrador';
  const fullScreen = useMediaQuery(useTheme().breakpoints.down('sm'));
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [modalidad, setModalidad] = useState('');
  const [estado, setEstado] = useState('');
  const [tipoCobro, setTipoCobro] = useState('');
  const [pagina, setPagina] = useState(0);
  const [filasPorPagina, setFilasPorPagina] = useState(publicada ? 5 : 10);
  const [confirmando, setConfirmando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [errorPublicacion, setErrorPublicacion] = useState('');
  const [pagoActivo, setPagoActivo] = useState(null);
  const [agrupadoAlumno, setAgrupadoAlumno] = useState('');
  const [mensajePago, setMensajePago] = useState('');
  const [ajusteActivo, setAjusteActivo] = useState(null);
  const [conversionAbierta, setConversionAbierta] = useState(false);
  const [conversionCompletada, setConversionCompletada] = useState(false);
  const [coberturaActiva, setCoberturaActiva] = useState(null);
  const enviando = useRef(false);
  const solicitud = useRef('');
  const publicacionController = useRef(null);
  const porRepresentante = datos?.campania.unidad_cobro === 'representante';
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
        || (guardada.unidad_cobro || 'atleta') !== (datos.campania.unidad_cobro || 'atleta')
        || guardada.moneda !== datos.campania.moneda || !tieneMontosValidos(guardada) || typeof guardada.nombre !== 'string'
        || !Array.isArray(guardada.sedes) || !Array.isArray(guardada.participantes)
        || guardada.participantes.length !== datos.campania.participantes.length
        || new Set(guardada.participantes).size !== guardada.participantes.length
        || guardada.participantes.some((id) => !datos.campania.participantes.includes(id))
        || !registro || registro.solicitud_id !== solicitud.current || registro.version_borrador !== datos.campania.__v
        || registro.revision !== datos.revision || !registro.actor?.id || !['admin', 'super_admin'].includes(registro.actor.rol)
        || typeof registro.fecha !== 'string' || Number.isNaN(new Date(registro.fecha).getTime())
        || ['participantes', 'generales', 'personalizados', 'no_aplica', 'total_esperado'].some((campo) => registro[campo] !== datos.totales[campo])
        || (datos.campania.unidad_cobro === 'representante'
          && ['cobros', 'representantes', 'individuales'].some((campo) => registro[campo] !== datos.totales[campo]))
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
    && (!publicada || !estado || estadoVisible(fila) === estado)
    && (!tipoCobro || (tipoCobro === 'varios' ? fila.tipo_cobro === 'representante' && fila.atletas_cubiertos.length > 1
      : tipoCobro === 'conservados' ? fila.preservado_conversion
        : tipoCobro === 'cubiertos' ? esCubierto(fila) : fila.tipo_cobro === 'individual_sin_representante'))
    && normalizar(`${titularCargo(fila)} ${detalleCobertura(fila)} ${fila.sede?.nombre || ''}`).includes(normalizar(busqueda).trim()));
  const paginaActual = Math.min(pagina, Math.max(0, Math.ceil(filtradas.length / filasPorPagina) - 1));
  const avance = (datos?.filas || []).filter((fila) => fila.modalidad !== 'no_aplica').reduce((conteos, fila) => {
    conteos.total += 1;
    const estadoFila = estadoVisible(fila);
    if (Object.hasOwn(conteos, estadoFila)) conteos[estadoFila] += 1;
    return conteos;
  }, { total: 0, pagado: 0, pendiente: 0, en_revision: 0, abono: 0 });
  const porcentajePagado = avance.total ? Math.round(avance.pagado * 100 / avance.total) : 0;

  return <><CampaniaDialog open fullWidth maxWidth={publicada ? 'xl' : 'lg'} fullScreen={fullScreen} onClose={cerrar} aria-labelledby="resumen-campania-titulo"
    PaperProps={{ sx: { maxWidth: publicada ? 1440 : 1000,
      ...(publicada ? { width: { xs: '100%', sm: 'calc(100% - 64px)' }, m: { xs: 0, sm: 4 },
        maxHeight: { xs: '100%', sm: 'calc(100% - 64px)' } } : {}),
      borderRadius: { xs: 0, sm: 2 }, color: '#202441' } }}>
    <DialogTitle component="div" id="resumen-campania-cabecera" sx={{ bgcolor: '#171b4b', color: '#fff', px: { xs: 2.5, sm: 4 }, py: publicada ? 1.5 : 2.5,
      display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 2 }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography sx={{ fontSize: 10, fontWeight: 800, color: '#f28cbd', mb: 0.75 }}>COBROS ADICIONALES</Typography>
        <Typography component="h2" id="resumen-campania-titulo" sx={{ fontSize: 22, fontWeight: 750, lineHeight: 1.25 }}>{publicada ? 'Cargos de la campa\u00f1a' : 'Resumen previo a publicar'}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mt: 0.75 }}>
          <Typography sx={{ fontSize: 13, color: '#c6c8de', overflowWrap: 'anywhere', minWidth: 0 }}>{datos?.campania.nombre || campania.nombre}</Typography>
          <Chip label={publicada ? datos?.campania.estado === 'cerrada' ? 'Cerrada' : datos?.campania.estado === 'cancelada' ? 'Cancelada' : 'Publicada' : 'Borrador'} size="small" sx={{ bgcolor: publicada ? '#eaf6ee' : '#fff6dc', color: publicada ? '#237242' : '#8a6a20', borderRadius: 1, fontWeight: 650, height: 20 }} />
        </Box>
      </Box>
      <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
        <Tooltip title="Recalcular resumen"><span><IconButton aria-label="Recalcular resumen" disabled={cargando || publicando} onClick={() => setIntento((actual) => actual + 1)}
          sx={{ color: '#d8daea', width: 32, height: 32, borderRadius: 1 }}><ReplayRoundedIcon sx={{ fontSize: 18 }} /></IconButton></span></Tooltip>
        <Tooltip title="Cerrar"><IconButton aria-label="Cerrar resumen" onClick={cerrar} disabled={publicando}
          sx={{ color: '#d8daea', bgcolor: 'rgba(255,255,255,0.07)', width: 32, height: 32, borderRadius: 1 }}><CloseRoundedIcon sx={{ fontSize: 18 }} /></IconButton></Tooltip>
      </Box>
    </DialogTitle>
    <DialogContent sx={{ px: { xs: 2.5, sm: 4 }, pt: publicada ? '16px !important' : '24px !important', pb: publicada ? 0.5 : 1, minWidth: 0,
      '& .MuiInputBase-root': { fontSize: 13, borderRadius: 1.5, bgcolor: '#fff' },
      '& .MuiInputLabel-root': { position: 'static', transform: 'none', maxWidth: '100%', mb: 0.75, color: '#30344b', fontSize: 12, fontWeight: 650 },
      '& .MuiOutlinedInput-notchedOutline': { top: 0, borderColor: '#e5e6ed', '& legend': { display: 'none' } },
      '& .MuiInputBase-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#7d849d', borderWidth: 1 } }}>
      {creacionGuiada && <CampaniaPasos paso={2} />}
      {cargando && <Box role="status" sx={{ py: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5 }}>
        <CircularProgress size={22} sx={{ color: '#171b4b' }} /><Typography sx={{ fontSize: 14 }}>Calculando resumen...</Typography>
      </Box>}
      {error && <Alert severity="error" action={<Button color="inherit" onClick={() => setIntento((actual) => actual + 1)}>Reintentar</Button>}>{error}</Alert>}
      {mensajePago === 'Pago confirmado' ? <Alert severity="success" aria-labelledby="pago-confirmado-titulo"
        aria-describedby="pago-confirmado-descripcion" icon={<CheckCircleRoundedIcon sx={{ fontSize: 26 }} />}
        action={<IconButton size="small" aria-label="Cerrar aviso de pago" onClick={() => setMensajePago('')}
          sx={{ color: '#527461', borderRadius: 1.5, '&:hover': { bgcolor: '#dcf0e3' } }}><CloseRoundedIcon fontSize="small" /></IconButton>}
        sx={{ mb: 2.5, p: { xs: 1.5, sm: 2 }, borderRadius: 2.5, border: '1px solid #cee8d7',
          borderLeft: '4px solid #21834d', background: 'linear-gradient(110deg, #eef9f2 0%, #fbfefc 100%)',
          boxShadow: '0 4px 16px rgba(32, 93, 57, 0.05)', alignItems: 'flex-start',
          '& .MuiAlert-icon': { color: '#21834d', bgcolor: '#dcefe3', p: 1, mr: { xs: 1, sm: 1.5 }, borderRadius: 2 },
          '& .MuiAlert-message': { minWidth: 0, py: 0.5 }, '& .MuiAlert-action': { pt: 0.5 } }}>
        <Typography component="h3" id="pago-confirmado-titulo" sx={{ fontSize: 16, fontWeight: 750, color: '#205d39', mb: 0.5 }}>
          Pago confirmado
        </Typography>
        <Typography id="pago-confirmado-descripcion" sx={{ fontSize: 13, color: '#4d6c58', lineHeight: 1.6, overflowWrap: 'anywhere' }}>
          El importe se aplicó al saldo del cargo. Puedes consultarlo en el historial.
        </Typography>
      </Alert> : mensajePago && <Alert severity="success" onClose={() => setMensajePago('')} sx={{ mb: 2 }}>{mensajePago}</Alert>}
      {conversionCompletada && <Alert severity="success" aria-labelledby="conversion-completada-titulo" icon={<CheckCircleRoundedIcon sx={{ fontSize: 25 }} />}
        action={<IconButton size="small" aria-label="Cerrar aviso de conversión" onClick={() => setConversionCompletada(false)}
          sx={{ color: '#47705a', '&:hover': { bgcolor: '#deeee3' } }}><CloseRoundedIcon fontSize="small" /></IconButton>}
        sx={{ mb: 2.5, p: { xs: 1.5, sm: 2 }, borderRadius: 2.5, bgcolor: '#f0f8f2', border: '1px solid #d3e8da',
          alignItems: 'flex-start', '& .MuiAlert-icon': { color: '#27814c', p: 1, mr: 1.5, borderRadius: 2, bgcolor: '#deeee3' },
          '& .MuiAlert-message': { minWidth: 0, py: 0.5 }, '& .MuiAlert-action': { pt: 0.5 } }}>
        <Typography component="h3" id="conversion-completada-titulo" sx={{ fontSize: 15, fontWeight: 750, color: '#205d39', mb: 0.5 }}>Conversión completada</Typography>
        <Typography sx={{ fontSize: 13, color: '#426650', lineHeight: 1.6, overflowWrap: 'anywhere' }}>
          <Box component="span" sx={{ fontWeight: 700 }}>{campania.nombre}</Box> ahora tiene cobro por representante.
          {' '}Los cargos conservados y sus pagos permanecen sin cambios.
        </Typography>
      </Alert>}
      {!cargando && !error && datos && <>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 2, pb: publicada ? 1 : 2.5,
          mb: publicada ? 1 : 2.5, borderBottom: '1px solid #e9eaf0' }}>
          {[['Participantes', datos.totales.participantes], ['Total a recaudar', datos.totales.total_esperado, true],
            ['Personalizados', datos.totales.personalizados], ['No aplica', datos.totales.no_aplica]].map(([etiqueta, cantidad, esMonto]) =>
            <Box key={etiqueta} role="group" aria-label={etiqueta} sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: 12, color: '#858999', minHeight: publicada ? 18 : 36 }}>{etiqueta}</Typography>
              <Typography sx={{ fontSize: esMonto ? 18 : 22, fontWeight: 750, color: '#202441', mt: publicada ? 0.25 : 0.5, overflowWrap: 'anywhere' }}>
                {esMonto ? cantidad === null ? 'Pendiente de revisar' : formatoMonto(cantidad, datos.campania.moneda) : cantidad}
                {!esMonto && <Box component="span" sx={{ fontSize: 11, fontWeight: 400, color: '#858999', ml: 0.75 }}> {porRepresentante && etiqueta !== 'Participantes'
                  ? cantidad === 1 ? 'cobro' : 'cobros' : cantidad === 1 ? 'atleta' : 'atletas'}</Box>}
              </Typography>
              {esMonto && cantidad === null && <Typography sx={{ fontSize: 12, color: '#626879', mt: 0.5, overflowWrap: 'anywhere' }}>
                {`Subtotal calculable: ${formatoMonto(datos.totales.subtotal_calculado, datos.campania.moneda)}`}
              </Typography>}
            </Box>)}
        </Box>
        {porRepresentante && <Alert severity="info" sx={{ mb: 2 }}>
          {`${datos.totales.participantes} atletas incluidos · ${datos.totales.representantes} cobros por representante + ${datos.totales.individuales} individuales sin representante${datos.totales.conservados ? ` + ${datos.totales.conservados} conservados` : ''}${datos.totales.cubiertos ? ` + ${datos.totales.cubiertos} cubiertos por pagos existentes` : ''} = ${datos.totales.cobros} cobros.`}
          <Typography sx={{ fontSize: 12, mt: 0.5 }}>Cada cobro por representante se paga una sola vez y cubre los atletas indicados.</Typography>
        </Alert>}
        {publicada && <Box component="section" aria-label="Avance de cobros" sx={{ mb: 1.5, pb: 1.5, borderBottom: '1px solid #e9eaf0' }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 750, color: '#202441' }}>
              {avance.total ? `${avance.pagado} de ${avance.total} pagados (${porcentajePagado}%)` : 'Sin cargos por cobrar'}
            </Typography>
            <Typography sx={{ fontSize: 12, color: '#626879' }}>Faltan por pagar: {avance.total - avance.pagado}</Typography>
          </Box>
          <LinearProgress variant="determinate" value={porcentajePagado} aria-label="Porcentaje de cargos pagados"
            sx={{ height: 8, borderRadius: 1, bgcolor: '#e8ebf2', '& .MuiLinearProgress-bar': { bgcolor: '#0f7a4a' } }} />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5, mt: 0.75 }}>
            {[[ 'Pagados', avance.pagado, '#0f7a4a'], ['Pendientes', avance.pendiente, '#b45309'],
              ['En revisi\u00f3n', avance.en_revision, '#d4a017'], ['Con abono', avance.abono, '#6d4c41']].map(([label, cantidad, color]) =>
              <Box key={label} role="group" aria-label={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                <Box aria-hidden="true" sx={{ width: 8, height: 8, flexShrink: 0, borderRadius: 0.5, bgcolor: color }} />
                <Typography sx={{ fontSize: 12, color: '#626879', overflowWrap: 'break-word' }}>{label}</Typography>
                <Typography sx={{ fontSize: 14, fontWeight: 750, color: '#202441' }}>{cantidad}</Typography>
              </Box>)}
          </Box>
        </Box>}
        {!datos.totales.participantes && <Alert severity="info" sx={{ mb: 2 }}>No hay participantes seleccionados.</Alert>}
        {datos.totales.con_observaciones > 0 && <Alert severity="warning" sx={{ mb: 2 }}>
          {`${datos.totales.con_observaciones} participante(s) con observaciones${datos.totales.pendientes ? `; ${datos.totales.pendientes} con importe pendiente` : ''}.`}
        </Alert>}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: publicada ? '2fr 1fr 1fr' : '2fr 1fr' }, gap: 1.75, mb: publicada ? 1.5 : 2 }}>
          <TextField size="small" label={porRepresentante ? 'Buscar representante, atleta o sede' : 'Buscar atleta o sede'} value={busqueda} onChange={(event) => { setBusqueda(event.target.value); setPagina(0); }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 18 }} /></InputAdornment> } }} />
          <TextField select size="small" label={'Condici\u00f3n'} value={modalidad} onChange={(event) => { setModalidad(event.target.value); setPagina(0); }}>
            <MenuItem value="">Todas las condiciones</MenuItem>{Object.entries(MODALIDADES).map(([valor, etiqueta]) => <MenuItem key={valor} value={valor}>{etiqueta}</MenuItem>)}
            <MenuItem value="pendientes">Importe pendiente</MenuItem>
          </TextField>
          {publicada && <TextField select size="small" label="Estado" value={estado} onChange={(event) => { setEstado(event.target.value); setPagina(0); }}>
            <MenuItem value="">Todos los estados</MenuItem>{Object.entries(ESTADOS).map(([valor, etiqueta]) => <MenuItem key={valor} value={valor}>{etiqueta}</MenuItem>)}
          </TextField>}
          {porRepresentante && <TextField select size="small" label="Tipo de cobro" value={tipoCobro}
            onChange={(event) => { setTipoCobro(event.target.value); setPagina(0); }}>
            <MenuItem value="">Todos los cobros</MenuItem>
            <MenuItem value="varios">Representantes con varios atletas</MenuItem>
            <MenuItem value="sin_representante">Sin representante</MenuItem>
            <MenuItem value="conservados">Conservados para revisión</MenuItem>
            <MenuItem value="cubiertos">Cubiertos por pago familiar</MenuItem>
          </TextField>}
        </Box>
        <TableContainer sx={{ maxWidth: '100%' }}>
          <Table size="small" aria-label="Participantes del resumen" sx={{ minWidth: publicada ? 1160 : 620,
            ...(publicada ? { '& .MuiTableCell-root': { px: 1.5, py: 0.5 } } : {}) }}>
            <TableHead sx={{ bgcolor: '#f5f6fa' }}><TableRow>{[porRepresentante ? 'Responsable y atletas cubiertos' : 'Atleta', 'Sede', 'Condici\u00f3n', 'Importe', 'Nota interna', ...(publicada ? ['Saldo pendiente', 'Estado', 'Acciones'] : [])].map((titulo) =>
              <TableCell key={titulo} sx={{ color: '#626879', fontSize: 12, fontWeight: 750, whiteSpace: 'nowrap' }}>{titulo}</TableCell>)}
            </TableRow></TableHead>
            <TableBody>{filtradas.slice(paginaActual * filasPorPagina, (paginaActual + 1) * filasPorPagina).map((fila) => <TableRow key={fila.alumno}>
              <TableCell sx={{ minWidth: 150, maxWidth: 250, overflowWrap: 'anywhere' }}>
                <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{titularCargo(fila)}</Typography>
                {porRepresentante && <>
                  <Chip size="small" label={fila.tipo_cobro === 'representante' ? `${fila.atletas_cubiertos.length} ${fila.atletas_cubiertos.length === 1 ? 'atleta' : 'atletas'} · ${etiquetaCobro(fila)}` : etiquetaCobro(fila)}
                    sx={{ mt: 0.5, height: 'auto', '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 }, fontSize: 10 }} />
                  {(fila.atletas_cubiertos || []).map((atleta) => <Typography key={atleta.alumno} sx={{ fontSize: 11, color: '#626879', mt: 0.5 }}>
                    {`${atleta.nombres} ${atleta.apellidos} · ${atleta.categoria || 'Sin categoría'} · ${atleta.nombre_sede}`}
                  </Typography>)}
                  {fila.preservado_conversion && <Typography sx={{ fontSize: 11, color: '#895a13', mt: 0.5 }}>{fila.motivo_conservacion}</Typography>}
                  {esCubierto(fila) && <Typography sx={{ fontSize: 11, color: '#626879', mt: 0.5 }}>Pago original de: {fila.cobertura_familiar.nombre_atleta}</Typography>}
                </>}
                {fila.incidencias.map((incidencia, indice) => <Typography key={indice} sx={{ fontSize: 11, color: '#a33142', mt: 0.5 }}>{incidencia}</Typography>)}
              </TableCell>
              <TableCell sx={{ fontSize: 12, minWidth: 140, maxWidth: 200, overflowWrap: publicada ? 'anywhere' : 'break-word' }}>
                {porRepresentante && fila.atletas_cubiertos ? [...new Set(fila.atletas_cubiertos.map((atleta) => atleta.nombre_sede || 'Sede no disponible'))].join(' / ')
                  : fila.sede?.nombre || 'Sede no disponible'}
              </TableCell>
              <TableCell sx={{ fontSize: 12, color: fila.modalidad === 'no_aplica' ? '#a33142' : '#626879' }}>{esCubierto(fila) ? 'Cobertura familiar' : MODALIDADES[fila.modalidad]}</TableCell>
              <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fila.monto === null ? 'Por revisar' : formatoMonto(fila.monto, datos.campania.moneda)}</TableCell>
              <TableCell sx={{ fontSize: 12, minWidth: 140, maxWidth: 250, overflowWrap: 'anywhere' }}>{fila.nota_interna || '-'}</TableCell>
              {publicada && <>
                <TableCell sx={{ fontSize: 12, whiteSpace: 'nowrap' }}>{formatoMonto(fila.saldo_pendiente, datos.campania.moneda)}</TableCell>
                <TableCell sx={{ '& .MuiChip-root': { maxWidth: '100%', height: 'auto', minHeight: 32 },
                  '& .MuiChip-label': { whiteSpace: 'normal', py: 0.5 } }}><EstadoPagoChip
                  data-testid={`estado-cargo-${fila.alumno}`}
                  estado={estadoVisible(fila) === 'en_revision' ? 'en revision' : estadoVisible(fila) === 'no_aplica' ? 'exonerado' : estadoVisible(fila)}
                  label={esCubierto(fila) ? 'Cubierto por pago familiar' : fila.retirado ? 'Retirado' : fila.pago_en_revision ? 'En revisi\u00f3n' : fila.estado === 'no_aplica' ? 'No aplica' : undefined} /></TableCell>
                <TableCell><Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'flex-start' }}>
                  {fila.puede_revisar_cobertura && datos.campania.estado === 'abierta' && porRepresentante
                    && fila.preservado_conversion && ['pagado', 'abono'].includes(fila.estado) && <Tooltip arrow placement="top"
                      title="Unir a los hermanos en un solo cargo, conservando los pagos confirmados y el saldo restante. Se pedirá confirmación antes de aplicar.">
                      <Button variant="outlined" size="small" startIcon={<GroupsOutlinedIcon />}
                        aria-label={`Aplicar cobertura familiar con el pago de ${titularCargo(fila)}`}
                        onClick={() => setCoberturaActiva(fila)}
                        sx={{ px: 1.5, py: 0.75, minHeight: 36, borderRadius: 2, fontSize: 12, fontWeight: 700,
                          whiteSpace: 'nowrap', textTransform: 'none', color: '#343b78', bgcolor: '#eeeffc', borderColor: '#c4c9ea',
                          '& .MuiButton-startIcon': { mr: 0.75, '& > :nth-of-type(1)': { fontSize: 19 } },
                          '&:hover': { bgcolor: '#e1e4f8', borderColor: '#737db8' },
                          '&:focus-visible': { outline: '2px solid #343b78', outlineOffset: 2 } }}>
                        Cubrir hermanos
                      </Button>
                    </Tooltip>}
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, alignItems: 'center' }}>
                  {fila._id && datos.campania.estado === 'abierta' && <>
                    <Tooltip title={fila.puede_ajustar ? fila.retirado ? 'Reincorporar alumno' : 'Editar cargo' : 'El cargo tiene pagos o no admite ajustes'}><span>
                      <IconButton aria-label={`${fila.retirado ? 'Reincorporar' : 'Editar cargo de'} ${titularCargo(fila)}`}
                        disabled={!fila.puede_ajustar} onClick={() => setAjusteActivo({ fila, accion: 'editar' })}
                        sx={{ width: 36, height: 36, color: '#626879' }}><EditOutlinedIcon sx={{ fontSize: 19 }} /></IconButton></span></Tooltip>
                    {!fila.retirado && <Tooltip title={fila.puede_ajustar ? porRepresentante ? 'Retirar cobro completo y sus atletas' : 'Retirar alumno' : 'No puedes retirar un cargo con pagos'}><span>
                      <IconButton aria-label={`Retirar a ${titularCargo(fila)}`} disabled={!fila.puede_ajustar}
                        onClick={() => setAjusteActivo({ fila, accion: 'retirar' })}
                        sx={{ width: 36, height: 36, color: '#626879' }}><PersonRemoveOutlinedIcon sx={{ fontSize: 19 }} /></IconButton></span></Tooltip>}
                  </>}
                  {fila._id && <Tooltip title="Historial de pagos"><IconButton aria-label={`Historial de pagos de ${titularCargo(fila)}`}
                    onClick={() => setPagoActivo({ fila, modo: 'historial' })} sx={{ width: 36, height: 36, color: '#626879', '&:hover': { bgcolor: 'transparent' } }}><HistoryRoundedIcon sx={{ fontSize: 19 }} /></IconButton></Tooltip>}
                  {fila._id && datos.campania.estado === 'abierta' && fila.modalidad !== 'no_aplica' && fila.saldo_pendiente > 0
                    && <Tooltip title="Registrar pago"><IconButton aria-label={`Pagar cargo de ${titularCargo(fila)}`}
                      onClick={() => setPagoActivo({ fila, modo: 'pago' })} sx={{ width: 36, height: 36, color: '#626879', '&:hover': { bgcolor: 'transparent' } }}><PaidIcon fontSize="small" /></IconButton></Tooltip>}
                  {fila._id && datos.campania.estado === 'abierta' && fila.modalidad !== 'no_aplica' && fila.saldo_pendiente > 0
                    && fila.tipo_cobro !== 'individual_sin_representante'
                    && <Tooltip title="Pago agrupado del representante"><IconButton aria-label={`Pago agrupado de ${titularCargo(fila)}`}
                      onClick={() => setAgrupadoAlumno(fila.alumno)} sx={{ width: 36, height: 36, color: '#626879' }}><PaymentsOutlinedIcon fontSize="small" /></IconButton></Tooltip>}
                  </Box>
                </Box></TableCell>
              </>}
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
    <DialogActions sx={{ px: { xs: 2.5, sm: 4 }, py: publicada ? 1.25 : 1.75, gap: 1, borderTop: '1px solid #f0f1f5', bgcolor: '#fafafe',
      flexWrap: 'wrap', '& > :not(style) ~ :not(style)': { ml: 0 } }}>
      {!creacionGuiada && <Button onClick={cerrar} disabled={publicando} sx={{ color: '#50566e', fontSize: 12 }}>Cerrar</Button>}
      {publicada && datos?.campania.estado === 'abierta' && !cargando && !error && <Button startIcon={<PersonAddOutlinedIcon />}
        onClick={() => setAjusteActivo({ accion: 'agregar' })} sx={{ color: '#50566e', fontSize: 12, textTransform: 'none' }}>Agregar alumno</Button>}
      {publicada && datos?.campania.estado === 'abierta' && !porRepresentante && !cargando && !error && <Button
        onClick={() => setConversionAbierta(true)} sx={{ color: '#50566e', fontSize: 12, textTransform: 'none' }}>
        Convertir a cobro por representante
      </Button>}
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
  {coberturaActiva && datos && <CampaniaCoberturaDialog campania={datos.campania} fila={coberturaActiva}
    onClose={() => setCoberturaActiva(null)} onApplied={(guardada) => {
      setCoberturaActiva(null); setMensajePago('Cobertura familiar aplicada. Los atletas indicados comparten un único cargo y saldo.');
      setIntento((valor) => valor + 1);
      onConverted?.(guardada);
    }} />}
  {conversionAbierta && datos && <CampaniaConversionDialog campania={datos.campania} onClose={() => setConversionAbierta(false)}
    onConverted={(guardada) => {
      setConversionAbierta(false); setConversionCompletada(true);
      setIntento((valor) => valor + 1);
      onConverted?.(guardada);
    }} />}
  {ajusteActivo && datos && <CampaniaCargoAjusteDialog campania={datos.campania} {...ajusteActivo}
    onClose={() => setAjusteActivo(null)} onSaved={() => {
      setMensajePago(ajusteActivo.accion === 'retirar' ? porRepresentante ? 'Cobro retirado de la campaña' : 'Alumno retirado de la campaña' : 'Cargo actualizado');
      setAjusteActivo(null); setIntento((valor) => valor + 1);
    }} />}
  {pagoActivo && <CampaniaPagoDialog campania={campania} fila={pagoActivo.fila} modo={pagoActivo.modo}
    onClose={() => setPagoActivo(null)} onSaved={(resultado, cerrarPago = true) => {
      if (cerrarPago) setPagoActivo(null);
      setMensajePago(resultado.mensaje || (resultado.pago.estado === 'confirmado' ? 'Pago confirmado' : 'Pago registrado en revision'));
      setIntento((valor) => valor + 1);
    }} />}
  {agrupadoAlumno && <CampaniaPagoAgrupadoDialog alumnoId={agrupadoAlumno} onClose={() => setAgrupadoAlumno('')}
    onSaved={(resultado) => { setAgrupadoAlumno(''); setMensajePago(resultado.mensaje); setIntento((valor) => valor + 1); }} />}
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