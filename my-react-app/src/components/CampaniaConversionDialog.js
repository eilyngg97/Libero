import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, InputAdornment, Pagination, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import VerifiedUserOutlinedIcon from '@mui/icons-material/VerifiedUserOutlined';
import { coberturaValida, detalleCobertura, titularCargo, esCubierto, etiquetaCobro, totalesEspecialesValidos } from '../utils/campaniaCobros';
import { tieneMontosValidos } from '../utils/campaniaMontos';

const API = process.env.REACT_APP_API_URL || window.location.origin;
const dinero = (valor) => typeof valor === 'number' && Number.isFinite(valor) && valor >= 0;
const formato = (valor, moneda) => new Intl.NumberFormat('es-VE', { style: 'currency', currency: moneda }).format(valor);
const CAMPOS_TOTALES = ['participantes', 'cobros', 'representantes', 'individuales', 'generales', 'personalizados', 'no_aplica'];
const POR_PAGINA = 8;
const normalizar = (valor) => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const grupoCargo = (fila) => fila.preservado_conversion ? 'conservados' : esCubierto(fila) ? 'cubiertos' : fila.tipo_cobro;

function previewValido(data, id) {
  const { campania, filas, totales, antes } = data;
  return campania?._id === id && campania.estado === 'abierta' && (campania.unidad_cobro || 'atleta') === 'atleta'
    && Number.isInteger(campania.__v) && campania.__v >= 0 && ['USD', 'EUR'].includes(campania.moneda)
    && coberturaValida(filas, campania.participantes, true) && filas.length > 0
    && new Set(filas.map((fila) => fila._id)).size === filas.length
    && filas.every((fila) => typeof fila._id === 'string' && Array.isArray(fila.incidencias)
      && fila.incidencias.every((item) => typeof item === 'string')
      && ['general', 'personalizado', 'no_aplica'].includes(fila.modalidad)
      && (fila.monto === null || (fila.modalidad === 'no_aplica' ? fila.monto === 0 : dinero(fila.monto) && fila.monto > 0)))
    && totales && [...CAMPOS_TOTALES, 'pendientes', 'con_observaciones'].every((key) => Number.isInteger(totales[key]) && totales[key] >= 0)
    && totales.participantes === campania.participantes.length && totales.cobros === filas.length
    && totales.representantes === filas.filter((fila) => fila.tipo_cobro === 'representante').length
    && totales.individuales === filas.filter((fila) => fila.tipo_cobro === 'individual_sin_representante').length
    && totalesEspecialesValidos(filas, totales)
    && ['general', 'personalizado', 'no_aplica'].every((valor, indice) =>
      totales[['generales', 'personalizados', 'no_aplica'][indice]] === filas.filter((fila) => fila.modalidad === valor && !esCubierto(fila)).length)
    && totales.pendientes === filas.filter((fila) => fila.monto === null).length
    && totales.con_observaciones === filas.filter((fila) => fila.incidencias.length > 0).length
    && totales.subtotal_calculado === filas.reduce((suma, fila) => suma + Math.round((fila.monto || 0) * 100), 0) / 100
    && (totales.pendientes ? totales.total_esperado === null : totales.total_esperado === totales.subtotal_calculado)
    && antes && antes.cobros === campania.participantes.length && dinero(antes.total_esperado)
    && antes.total_esperado === (campania.totales_cargos || campania.publicacion)?.total_esperado
    && typeof data.revision === 'string' && /^[a-f\d]{64}$/.test(data.revision);
}

function CampaniaConversionDialog({ campania, onClose, onConverted }) {
  const movil = useMediaQuery(useTheme().breakpoints.down('sm'));
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);
  const [aceptar, setAceptar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState('');
  const [pagina, setPagina] = useState(1);
  const enviando = useRef(false);
  const solicitud = useRef('');
  const envio = useRef(null);
  const ruta = `${API}/api/campanias-cobro/${campania._id}/conversion-representante`;
  const headers = () => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Tu sesión no está disponible. Inicia sesión nuevamente.');
    return { Authorization: `Bearer ${token}` };
  };
  useEffect(() => () => envio.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    const cargar = async () => {
      setCargando(true); setDatos(null); setAceptar(false); setError(''); solicitud.current = '';
      setBusqueda(''); setFiltro(''); setPagina(1);
      try {
        const response = await fetch(ruta, { headers: headers(), cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo cargar la vista previa.');
        if (!previewValido(data, campania._id)) throw new Error('No se pudo verificar la vista previa de la conversión.');
        if (!controller.signal.aborted) setDatos(data);
      } catch (err) { if (!controller.signal.aborted) setError(err.message); }
      finally { if (!controller.signal.aborted) setCargando(false); }
    };
    cargar();
    return () => controller.abort();
  }, [ruta, campania._id, intento]);
  const valido = datos && !datos.totales.pendientes && !datos.totales.con_observaciones;
  const filtradas = (datos?.filas || []).filter((fila) => (!filtro || grupoCargo(fila) === filtro)
    && normalizar(`${titularCargo(fila)} ${detalleCobertura(fila)} ${fila.nombre_representante || ''}`).includes(normalizar(busqueda)));
  const visibles = filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const cerrar = () => { if (!enviando.current) onClose(); };
  const convertir = async () => {
    if (enviando.current || !valido || !aceptar) return;
    enviando.current = true; setGuardando(true); setError('');
    const controller = new AbortController(); envio.current = controller;
    try {
      if (!solicitud.current) solicitud.current = window.crypto.randomUUID();
      const response = await fetch(ruta, { method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: datos.campania.__v, revision: datos.revision, solicitud_id: solicitud.current }),
        cache: 'no-store', signal: controller.signal });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409) { setDatos(null); setAceptar(false); }
        throw new Error(data.error || 'No se pudo convertir. Reintenta la misma solicitud.');
      }
      const actual = data.campania;
      if (typeof data.repetida !== 'boolean' || actual?._id !== campania._id || actual.unidad_cobro !== 'representante'
        || actual.estado !== 'abierta' || actual.moneda !== datos.campania.moneda || !tieneMontosValidos(actual)
        || !Number.isInteger(actual.__v) || actual.__v < datos.campania.__v + 1
        || !Array.isArray(actual.participantes) || actual.participantes.length !== datos.campania.participantes.length
        || new Set(actual.participantes).size !== actual.participantes.length
        || actual.participantes.some((id) => !datos.campania.participantes.includes(id))
        || [...CAMPOS_TOTALES, 'total_esperado'].some((key) => actual.totales_cargos?.[key] !== datos.totales[key])
        || ['conservados', 'cubiertos'].some((key) => (actual.totales_cargos?.[key] ?? 0) !== (datos.totales[key] ?? 0))) {
        throw new Error('No se pudo verificar la conversión. Reintenta la misma solicitud o actualiza los cargos.');
      }
      if (!controller.signal.aborted) onConverted(actual);
    } catch (err) { if (!controller.signal.aborted) setError(err.message); }
    finally { enviando.current = false; if (!controller.signal.aborted) setGuardando(false); }
  };
  return <Dialog open fullWidth fullScreen={movil} maxWidth="lg" onClose={cerrar} aria-labelledby="conversion-campania-titulo"
    PaperProps={{ sx: { borderRadius: { xs: 0, sm: 3 }, color: '#202441', m: { xs: 0, sm: 2 },
      width: { xs: '100%', sm: 'calc(100% - 32px)' }, maxHeight: { sm: '92dvh' }, bgcolor: '#f6f7fb' } }}>
    <DialogTitle component="div" sx={{ bgcolor: '#171b4b', color: '#fff', px: { xs: 2, sm: 3 }, py: 2,
      display: 'flex', alignItems: 'center', gap: 1.5 }}>
      <Box sx={{ display: { xs: 'none', sm: 'flex' }, p: 1.25, borderRadius: 2, bgcolor: '#ffffff12' }}>
        <GroupsOutlinedIcon />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.3, color: '#c4c7f0', textTransform: 'uppercase' }}>Configuración de cobros</Typography>
        <Typography component="h2" id="conversion-campania-titulo" sx={{ fontSize: { xs: 18, sm: 21 }, fontWeight: 700 }}>
          Convertir a cobro por representante
        </Typography>
        <Typography sx={{ fontSize: 12, color: '#d2d5ee', mt: 0.25, overflowWrap: 'anywhere' }}>{campania.nombre}</Typography>
      </Box>
      <IconButton aria-label="Cerrar conversión" onClick={cerrar} disabled={guardando}
        sx={{ color: '#fff', bgcolor: '#ffffff0d', '&:hover': { bgcolor: '#ffffff20' } }}><CloseRoundedIcon fontSize="small" /></IconButton>
    </DialogTitle>
    <DialogContent sx={{ p: { xs: 2, sm: 3 }, pt: '20px !important' }}>
      {cargando && <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><CircularProgress size={20} />Calculando conversión...</Box>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!cargando && !datos && <Button disabled={guardando} onClick={() => setIntento((valor) => valor + 1)}>Actualizar vista previa</Button>}
      {datos && <>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr auto 1fr' }, alignItems: 'center', gap: 1.5, mb: 2 }}>
          <Box role="group" aria-label="Cobro actual" sx={{ p: 2, bgcolor: '#fff', border: '1px solid #e3e5ee', borderRadius: 2.5 }}>
            <Typography sx={{ fontSize: 12, color: '#626879', fontWeight: 600 }}>Antes · Por atleta</Typography>
            <Typography sx={{ fontSize: 25, fontWeight: 750, mt: 0.5 }}>{formato(datos.antes.total_esperado, datos.campania.moneda)}</Typography>
            <Typography sx={{ fontSize: 12, color: '#626879', mt: 0.25 }}>{datos.antes.cobros} cobros</Typography>
          </Box>
          <ArrowForwardRoundedIcon aria-hidden="true" sx={{ display: { xs: 'none', sm: 'block' }, color: '#858baa', fontSize: 22 }} />
          <Box role="group" aria-label="Cobro después de convertir" sx={{ p: 2, bgcolor: '#eeeffc', border: '1px solid #d5d9f4', borderRadius: 2.5 }}>
            <Typography sx={{ fontSize: 12, color: '#474f91', fontWeight: 600 }}>Después · Por representante</Typography>
            <Typography sx={{ fontSize: 25, fontWeight: 750, color: '#282f70', mt: 0.5 }}>
              {datos.totales.total_esperado === null ? 'Importe por revisar' : formato(datos.totales.total_esperado, datos.campania.moneda)}
            </Typography>
            <Typography sx={{ fontSize: 12, color: '#474f91', mt: 0.25 }}>{datos.totales.cobros} cobros · {datos.totales.participantes} atletas incluidos</Typography>
          </Box>
        </Box>
        <Alert severity="info" icon={<VerifiedUserOutlinedIcon fontSize="small" />} sx={{ mb: 2.5, borderRadius: 2, bgcolor: '#eaf3f7', color: '#285466',
          '& .MuiAlert-message': { width: '100%' }, '& .MuiAlert-icon': { color: '#32768c' } }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700 }}>Tus pagos registrados están protegidos</Typography>
          {(datos.totales.conservados > 0 || datos.totales.cubiertos > 0) && <Typography sx={{ fontSize: 12, mt: 0.25 }}>
            {`${datos.totales.conservados || 0} cargos conservados sin cambios · ${datos.totales.cubiertos || 0} atletas cubiertos por pagos existentes.`}
          </Typography>}
          <Box component="details" sx={{ mt: 0.75, fontSize: 12 }}>
            <Box component="summary" sx={{ cursor: 'pointer', fontWeight: 600, width: 'fit-content', '&:focus-visible': { outline: '2px solid #32768c' } }}>Cómo se aplicará el cambio</Box>
            <Typography sx={{ fontSize: 12, mt: 1, lineHeight: 1.7 }}>
              Los cargos con pagos se conservan sin cambios. Un único cargo pagado y confirmado puede cubrir a los hermanos
              pendientes del mismo importe y condición. Los casos ambiguos se conservan para revisión y no impiden convertir las demás familias.
              Se conservará una auditoría de los cargos originales. Este cambio no tiene reversión automática.
            </Typography>
          </Box>
        </Alert>
        {!valido && <Alert severity="error" sx={{ mb: 2 }}>
          Resuelve las observaciones antes de convertir. Cierra esta vista y edita los cargos para unificar los importes y condiciones de cada representante.
        </Alert>}
        <Box sx={{ display: 'flex', alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, gap: 2, mb: 1.5 }}>
          <Box sx={{ flex: 1 }}>
            <Typography component="h3" sx={{ fontSize: 16, fontWeight: 750 }}>Detalle de los cobros</Typography>
            <Typography sx={{ fontSize: 12, color: '#626879', mt: 0.25 }}>Revisa quién paga y qué atletas quedan incluidos.</Typography>
          </Box>
          <TextField size="small" label="Buscar representante, atleta o sede" value={busqueda}
            onChange={(event) => { setBusqueda(event.target.value); setPagina(1); }}
            sx={{ width: { xs: '100%', sm: 310 }, '& .MuiOutlinedInput-root': { bgcolor: '#fff', borderRadius: 2 } }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon fontSize="small" /></InputAdornment> }} />
        </Box>
        <Box role="group" aria-label="Filtrar cobros" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
          {[['', 'Todos', datos.totales.cobros], ['representante', 'Por representante', datos.totales.representantes],
            ['individual_sin_representante', 'Sin representante', datos.totales.individuales],
            ['conservados', 'Conservados', datos.totales.conservados || 0], ['cubiertos', 'Cubiertos por pago', datos.totales.cubiertos || 0]]
            .map(([valor, texto, cantidad]) => <Chip key={valor} component="button" clickable
              label={`${texto} (${cantidad})`} aria-pressed={filtro === valor}
              onClick={() => { setFiltro(valor); setPagina(1); }}
              sx={{ fontSize: 12, fontWeight: 600, border: '1px solid', borderColor: filtro === valor ? '#343b78' : '#e0e3ee',
                bgcolor: filtro === valor ? '#343b78' : '#fff', color: filtro === valor ? '#fff' : '#626879',
                '&:hover, &:focus-visible': { bgcolor: filtro === valor ? '#282f65' : '#e9ebf5' } }} />)}
        </Box>
        <Typography role="status" sx={{ fontSize: 12, color: '#626879', mb: 1 }}>
          {filtradas.length ? `Mostrando ${(pagina - 1) * POR_PAGINA + 1}–${Math.min(pagina * POR_PAGINA, filtradas.length)} de ${filtradas.length} cobros` : 'Sin resultados con estos filtros'}
        </Typography>
        <Box component="ul" aria-label="Cobros después de convertir" sx={{ listStyle: 'none', p: 0, m: 0,
          display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.25 }}>
          {visibles.map((fila) => <Box component="li" key={fila._id} sx={{ p: 2, bgcolor: '#fff', border: '1px solid',
            borderColor: fila.preservado_conversion ? '#eadbbd' : '#e3e5ee', borderRadius: 2, minWidth: 0, overflowWrap: 'anywhere' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{titularCargo(fila)}</Typography>
              <Typography sx={{ fontWeight: 750, fontSize: 14, whiteSpace: 'nowrap', color: '#282f70' }}>
                {fila.monto === null ? 'Por revisar' : formato(fila.monto, datos.campania.moneda)}
              </Typography>
            </Box>
            <Chip size="small" label={etiquetaCobro(fila)} sx={{ height: 'auto', minHeight: 22, maxWidth: '100%', mt: 0.75, fontSize: 10, fontWeight: 600,
              bgcolor: fila.preservado_conversion ? '#fff4df' : esCubierto(fila) ? '#e5f4ed' : '#eeeff8',
              color: fila.preservado_conversion ? '#825c19' : esCubierto(fila) ? '#267351' : '#4b5286',
              '& .MuiChip-label': { whiteSpace: 'normal', py: 0.25 } }} />
            {(fila.retirado || (fila.modalidad === 'no_aplica' && !esCubierto(fila))) && <Typography sx={{ fontSize: 12, mt: 0.5, color: '#626879' }}>
              {fila.retirado ? 'Retirado' : 'No aplica'}
            </Typography>}
            <Typography sx={{ fontSize: 12, mt: 1, lineHeight: 1.7, color: '#626879' }}>Cubre: {detalleCobertura(fila)}</Typography>
            {fila.preservado_conversion && <Box component="details" sx={{ mt: 1, fontSize: 12, color: '#895a13' }}>
              <Box component="summary" sx={{ cursor: 'pointer', fontWeight: 600 }}>Ver motivo de conservación</Box>
              <Typography sx={{ fontSize: 12, mt: 0.75, lineHeight: 1.7 }}>{fila.motivo_conservacion}</Typography>
            </Box>}
            {esCubierto(fila) && <Typography sx={{ fontSize: 12, mt: 0.5 }}>Pago original de: {fila.cobertura_familiar.nombre_atleta}. No es una exoneración.</Typography>}
            {fila.incidencias.map((item, indice) => <Typography key={indice} sx={{ fontSize: 12, color: 'error.main', mt: 0.5 }}>{item}</Typography>)}
          </Box>)}
        </Box>
        {!filtradas.length && <Box sx={{ textAlign: 'center', p: 4, bgcolor: '#fff', borderRadius: 2, border: '1px dashed #d8dce9' }}>
          <SearchRoundedIcon sx={{ color: '#8b90ac', fontSize: 30 }} />
          <Typography sx={{ fontWeight: 600, fontSize: 14, mt: 1 }}>No encontramos cobros</Typography>
          <Typography sx={{ fontSize: 12, color: '#626879', mt: 0.5 }}>Prueba con otro nombre, sede o tipo de cobro.</Typography>
          <Button size="small" onClick={() => { setBusqueda(''); setFiltro(''); setPagina(1); }} sx={{ mt: 1 }}>Limpiar filtros</Button>
        </Box>}
        {filtradas.length > POR_PAGINA && <Pagination page={pagina} count={Math.ceil(filtradas.length / POR_PAGINA)}
          onChange={(_, valor) => setPagina(valor)} size={movil ? 'small' : 'medium'} siblingCount={movil ? 0 : 1}
          getItemAriaLabel={(tipo, valor) => tipo === 'page' ? `Ir a la página ${valor}` : tipo === 'next' ? 'Página siguiente' : 'Página anterior'}
          sx={{ mt: 2, display: 'flex', justifyContent: 'center', '& .Mui-selected': { bgcolor: '#e0e3f5', color: '#282f70', fontWeight: 700 } }} />}
      </>}
    </DialogContent>
    <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 1.5, display: 'block', bgcolor: '#fff', borderTop: '1px solid #e3e5ee', '& > :not(style) ~ :not(style)': { ml: 0 } }}>
      {datos && <Box sx={{ mb: 1.5 }}>
        <FormControlLabel sx={{ alignItems: 'flex-start', m: 0, '& .MuiFormControlLabel-label': { fontSize: 12, lineHeight: 1.5, pt: 0.75 } }}
          control={<Checkbox size="small" sx={{ p: 0.75, mr: 0.5 }} checked={aceptar} disabled={!valido || guardando} onChange={(event) => setAceptar(event.target.checked)} />}
          label="Confirmo el nuevo total y que cada cobro por representante cubrirá a los atletas indicados." />
        <Typography sx={{ fontSize: 11, color: '#895a13', ml: 4 }}>Este cambio no tiene reversión automática.</Typography>
      </Box>}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={cerrar} disabled={guardando} sx={{ color: '#50566e', textTransform: 'none' }}>Cancelar</Button>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {datos && <Button startIcon={<RefreshRoundedIcon />} disabled={guardando} onClick={() => setIntento((valor) => valor + 1)}
            sx={{ color: '#50566e', textTransform: 'none', fontSize: 12 }}>Actualizar vista previa</Button>}
          <Button variant="contained" disabled={!valido || !aceptar || guardando || cargando} onClick={convertir}
            startIcon={guardando ? <CircularProgress size={16} color="inherit" /> : undefined}
            sx={{ bgcolor: '#171b4b', '&:hover': { bgcolor: '#252b60' }, boxShadow: 'none', borderRadius: 2, textTransform: 'none' }}>Confirmar conversión</Button>
        </Box>
      </Box>
    </DialogActions>
  </Dialog>;
}

export default CampaniaConversionDialog;
