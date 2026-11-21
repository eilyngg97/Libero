import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, IconButton, Typography, useMediaQuery, useTheme } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import { tieneMontosValidos } from '../utils/campaniaMontos';

const API = process.env.REACT_APP_API_URL || window.location.origin;
const formato = (valor, moneda) => new Intl.NumberFormat('es-VE', { style: 'currency', currency: moneda }).format(valor);
const centimos = (valor) => Math.round(valor * 100);
const CAMPOS = ['participantes', 'cobros', 'representantes', 'individuales', 'conservados', 'cubiertos',
  'generales', 'personalizados', 'no_aplica', 'total_esperado'];
const nombre = (cargo) => `${cargo.nombres} ${cargo.apellidos || ''}`.trim();

function previewValido(data, campaniaId, cargoId) {
  const { campania, fuente, hermanos, representante, antes, despues } = data;
  if (campania?._id !== campaniaId || campania.unidad_cobro !== 'representante' || campania.estado !== 'abierta'
    || !Number.isInteger(campania.__v) || campania.__v < 0 || !['USD', 'EUR'].includes(campania.moneda)
    || !Array.isArray(campania.participantes) || new Set(campania.participantes).size !== campania.participantes.length
    || fuente?._id !== cargoId || typeof fuente.nombres !== 'string' || typeof fuente.apellidos !== 'string'
    || !campania.participantes.includes(fuente.alumno) || !['pagado', 'abono'].includes(fuente.estado)
    || !Number.isFinite(fuente.saldo_pendiente)
    || (fuente.estado === 'pagado' ? fuente.saldo_pendiente !== 0
      : fuente.saldo_pendiente <= 0 || fuente.saldo_pendiente >= fuente.monto || !campania.permitir_abonos)
    || !Number.isFinite(fuente.monto) || fuente.monto <= 0 || !['general', 'personalizado'].includes(fuente.modalidad)
    || typeof representante?._id !== 'string' || !representante._id || typeof representante.nombre !== 'string'
    || !Array.isArray(hermanos) || !hermanos.length || new Set(hermanos.map((cargo) => cargo?._id)).size !== hermanos.length
    || new Set([fuente.alumno, ...hermanos.map((cargo) => cargo?.alumno)]).size !== hermanos.length + 1
    || hermanos.some((cargo) => !cargo || typeof cargo._id !== 'string' || cargo._id === cargoId
      || typeof cargo.nombres !== 'string' || typeof cargo.apellidos !== 'string'
      || !campania.participantes.includes(cargo.alumno) || cargo.estado !== 'pendiente'
      || cargo.monto !== fuente.monto || cargo.saldo_pendiente !== cargo.monto || cargo.modalidad !== fuente.modalidad)
    || !antes || !despues || !campania.totales_cargos
    || CAMPOS.some((key) => !Number.isFinite(antes[key] ?? 0) || (antes[key] ?? 0) < 0
      || !Number.isFinite(despues[key] ?? 0) || (despues[key] ?? 0) < 0
      || (key !== 'total_esperado' && (!Number.isInteger(antes[key] ?? 0) || !Number.isInteger(despues[key] ?? 0)))
      || (antes[key] ?? 0) !== (campania.totales_cargos[key] ?? 0))
    || antes.participantes !== campania.participantes.length || !Number.isFinite(antes.total_esperado)
    || !Number.isFinite(despues.total_esperado)
    || typeof data.revision !== 'string' || !/^[a-f\d]{64}$/.test(data.revision)) return false;
  const esperado = { ...antes, conservados: (antes.conservados || 0) - hermanos.length - 1,
    cobros: antes.cobros - hermanos.length, representantes: antes.representantes + 1,
    [fuente.modalidad === 'general' ? 'generales' : 'personalizados']:
      antes[fuente.modalidad === 'general' ? 'generales' : 'personalizados'] - hermanos.length,
    total_esperado: (centimos(antes.total_esperado) - hermanos.reduce((suma, cargo) => suma + centimos(cargo.monto), 0)) / 100 };
  return CAMPOS.every((key) => (despues[key] ?? 0) === (esperado[key] ?? 0));
}

function CampaniaCoberturaDialog({ campania, fila, onClose, onApplied }) {
  const movil = useMediaQuery(useTheme().breakpoints.down('sm'));
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);
  const [aceptar, setAceptar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const enviando = useRef(false);
  const solicitud = useRef('');
  const envio = useRef(null);
  const ruta = `${API}/api/campanias-cobro/${campania._id}/cargos/${fila._id}/cobertura-familiar`;
  const headers = () => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Tu sesión no está disponible. Inicia sesión nuevamente.');
    return { Authorization: `Bearer ${token}` };
  };
  useEffect(() => () => envio.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    const cargar = async () => {
      setCargando(true); setDatos(null); setError(''); setAceptar(false); solicitud.current = '';
      try {
        const response = await fetch(ruta, { headers: headers(), cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo calcular la cobertura familiar.');
        if (!previewValido(data, campania._id, fila._id)) throw new Error('No se pudo verificar la vista previa de cobertura.');
        if (!controller.signal.aborted) setDatos(data);
      } catch (err) { if (!controller.signal.aborted) setError(err.message); }
      finally { if (!controller.signal.aborted) setCargando(false); }
    };
    cargar();
    return () => controller.abort();
  }, [ruta, campania._id, fila._id, intento]);
  const cerrar = () => { if (!enviando.current) onClose(); };
  const aplicar = async () => {
    if (enviando.current || !datos || !aceptar) return;
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
        throw new Error(data.error || 'No se pudo aplicar la cobertura. Reintenta la misma solicitud.');
      }
      const actual = data.campania;
      if (typeof data.repetida !== 'boolean' || actual?._id !== campania._id || actual.unidad_cobro !== 'representante'
        || !['abierta', 'cerrada'].includes(actual.estado) || actual.moneda !== datos.campania.moneda || !tieneMontosValidos(actual)
        || !Number.isInteger(actual.__v) || actual.__v <= datos.campania.__v || data.fuente !== fila._id
        || !Array.isArray(data.cubiertos) || data.cubiertos.length !== datos.hermanos.length
        || new Set(data.cubiertos).size !== data.cubiertos.length
        || data.cubiertos.some((id) => !datos.hermanos.some((cargo) => cargo._id === id))
        || !Array.isArray(actual.participantes) || actual.participantes.length !== datos.campania.participantes.length
        || new Set(actual.participantes).size !== actual.participantes.length
        || actual.participantes.some((id) => !datos.campania.participantes.includes(id))
        || CAMPOS.some((key) => (actual.totales_cargos?.[key] ?? 0) !== (datos.despues[key] ?? 0))) {
        throw new Error('No se pudo verificar la cobertura aplicada. Reintenta la misma solicitud o actualiza los cargos.');
      }
      if (!controller.signal.aborted) onApplied(actual);
    } catch (err) { if (!controller.signal.aborted) setError(err.message); }
    finally { enviando.current = false; if (!controller.signal.aborted) setGuardando(false); }
  };
  return <Dialog open fullWidth fullScreen={movil} maxWidth="sm" onClose={cerrar} aria-labelledby="cobertura-familiar-titulo"
    PaperProps={{ sx: { borderRadius: { xs: 0, sm: 3 }, color: '#202441' } }}>
    <DialogTitle component="div" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, bgcolor: '#171b4b', color: '#fff' }}>
      <GroupsOutlinedIcon />
      <Box sx={{ flex: 1 }}>
        <Typography component="h2" id="cobertura-familiar-titulo" sx={{ fontSize: 19, fontWeight: 700 }}>Aplicar cobertura familiar</Typography>
        <Typography sx={{ fontSize: 12, color: '#d2d5ee' }}>{campania.nombre}</Typography>
      </Box>
      <IconButton aria-label="Cerrar cobertura familiar" onClick={cerrar} disabled={guardando} sx={{ color: '#fff' }}><CloseRoundedIcon fontSize="small" /></IconButton>
    </DialogTitle>
    <DialogContent sx={{ pt: '20px !important' }}>
      {cargando && <Box role="status" sx={{ display: 'flex', gap: 1, alignItems: 'center' }}><CircularProgress size={20} />Calculando cobertura...</Box>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {!cargando && !datos && <Button onClick={() => setIntento((valor) => valor + 1)}>Actualizar vista previa</Button>}
      {datos && <>
        <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
          El importe y los pagos de {nombre(datos.fuente)} se conservan. Los hermanos se vincularán a un único cobro familiar.
          Si corriges o eliminas el pago, todos compartirán el nuevo saldo. No se registra otro pago ni se exonera a los hermanos.
        </Alert>
        <Box sx={{ p: 2, borderRadius: 2, bgcolor: '#f0f8f2', border: '1px solid #d3e8da', mb: 2 }}>
          <Typography sx={{ fontSize: 12, color: '#426650' }}>Pagos confirmados de</Typography>
          <Typography sx={{ fontWeight: 700 }}>{nombre(datos.fuente)} · {formato(
            (centimos(datos.fuente.monto) - centimos(datos.fuente.saldo_pendiente)) / 100, datos.campania.moneda)}</Typography>
          <Typography sx={{ fontSize: 12, mt: 0.5 }}>Representante: {datos.representante.nombre}</Typography>
        </Box>
        <Box role="group" aria-label="Saldo familiar después de aplicar cobertura" sx={{ mb: 2 }}>
          <Typography sx={{ fontWeight: 700 }}>
            Saldo familiar pendiente: {formato(datos.fuente.saldo_pendiente, datos.campania.moneda)}
          </Typography>
          <Typography sx={{ fontSize: 12, color: '#626879' }}>
            Importe familiar: {formato(datos.fuente.monto, datos.campania.moneda)}. El saldo restante se debe una sola vez entre todos.
          </Typography>
        </Box>
        <Typography component="h3" sx={{ fontSize: 15, fontWeight: 700, mb: 1 }}>Atletas que quedarán cubiertos</Typography>
        <Box component="ul" aria-label="Hermanos que quedarán cubiertos" sx={{ listStyle: 'none', p: 0, m: 0 }}>
          {datos.hermanos.map((cargo) => <Box component="li" key={cargo._id} sx={{ borderBottom: '1px solid #e3e5ee', py: 1.5 }}>
            <Typography sx={{ fontWeight: 600, fontSize: 14 }}>{nombre(cargo)}</Typography>
            <Typography sx={{ fontSize: 12, color: '#626879', mt: 0.5 }}>
              Saldo individual: {formato(cargo.saldo_pendiente, datos.campania.moneda)} → Saldo familiar: {formato(datos.fuente.saldo_pendiente, datos.campania.moneda)}
            </Typography>
            <Typography sx={{ fontSize: 12, color: '#267351', mt: 0.5 }}>Incluido en el mismo cobro por representante</Typography>
          </Box>)}
        </Box>
        <Typography sx={{ fontSize: 12, color: '#626879', mt: 1.5 }}>
          Un solo cargo e historial para todos. Si el pago se elimina, el importe familiar se deberá una sola vez, no por cada atleta.
        </Typography>
        <Box role="group" aria-label="Total de la campaña después de aplicar cobertura" sx={{ mt: 2, p: 2, bgcolor: '#eeeffc', borderRadius: 2 }}>
          <Typography sx={{ fontSize: 12 }}>Total a recaudar de la campaña</Typography>
          <Typography sx={{ fontWeight: 700, fontSize: 18 }}>
            {formato(datos.antes.total_esperado, datos.campania.moneda)} → {formato(datos.despues.total_esperado, datos.campania.moneda)}
          </Typography>
        </Box>
      </>}
    </DialogContent>
    <DialogActions sx={{ display: 'block', px: 3, py: 2, borderTop: '1px solid #e3e5ee', '& > :not(style) ~ :not(style)': { ml: 0 } }}>
      {datos && <FormControlLabel sx={{ mb: 1, alignItems: 'flex-start', '& .MuiFormControlLabel-label': { fontSize: 12, pt: 1 } }}
        control={<Checkbox size="small" checked={aceptar} disabled={guardando} onChange={(event) => setAceptar(event.target.checked)} />}
        label={`Confirmo que el pago de ${nombre(datos.fuente)} cubrirá a los hermanos indicados y compartirán el saldo restante.`} />}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={cerrar} disabled={guardando} sx={{ color: '#50566e', textTransform: 'none' }}>Cancelar</Button>
        {datos && <Button disabled={guardando} onClick={() => setIntento((valor) => valor + 1)} sx={{ textTransform: 'none' }}>Actualizar vista previa</Button>}
        <Button variant="contained" disabled={!datos || !aceptar || cargando || guardando} onClick={aplicar}
          startIcon={guardando ? <CircularProgress size={16} color="inherit" /> : undefined}
          sx={{ bgcolor: '#171b4b', '&:hover': { bgcolor: '#252b60' }, boxShadow: 'none', borderRadius: 2, textTransform: 'none' }}>Confirmar cobertura</Button>
      </Box>
    </DialogActions>
  </Dialog>;
}

export default CampaniaCoberturaDialog;
