import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, TablePagination, TextField, Tooltip, Typography } from '@mui/material';
import PaidIcon from '@mui/icons-material/Paid';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { useParams } from 'react-router-dom';
import CampaniaPagoDialog from './CampaniaPagoDialog';

const API = process.env.REACT_APP_API_URL || window.location.origin;
const dinero = (valor) => typeof valor === 'number' && Number.isFinite(valor) && valor >= 0;
const formato = (valor, moneda) => new Intl.NumberFormat('es-VE', { style: 'currency', currency: moneda }).format(valor);
const estadoVisible = (cargo) => cargo.pago_en_revision ? 'en_revision' : cargo.estado;
const ESTADOS = { pendiente: 'Pendiente', abono: 'Abono', en_revision: 'En revision', pagado: 'Pagado', no_aplica: 'No aplica' };
const ESTILOS = {
  pendiente: { fondo: '#fffdf8', borde: '#efe7dc', circulo: '#fbe6cf', icono: '#b45309', etiqueta: '#f6d3ad', texto: '#8a4b08', importe: '#0f172a' },
  pagado: { fondo: '#f6f8ff', borde: '#e5e9f5', circulo: '#86efac', icono: '#166534', etiqueta: '#4ade80', texto: '#065f46', importe: '#a1a1aa' },
  no_aplica: { fondo: '#f0fdf4', borde: '#dcfce7', circulo: '#bbf7d0', icono: '#15803d', etiqueta: '#dcfce7', texto: '#15803d', importe: '#15803d' }
};

function CampaniasAlumno() {
  const { alumnoId } = useParams();
  const [cargos, setCargos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [intento, setIntento] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('');
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(10);
  const [seleccion, setSeleccion] = useState(null);
  const token = localStorage.getItem('token');

  useEffect(() => {
    const controller = new AbortController();
    setCargando(true); setError(''); setCargos([]); setSeleccion(null); setPagina(0);
    const cargar = async () => {
      try {
        if (!token) throw new Error('Inicia sesion nuevamente.');
        const response = await fetch(`${API}/api/campanias-cobro/mis-cargos?alumnoId=${encodeURIComponent(alumnoId)}`, {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los cobros.');
        if (!Array.isArray(data.cargos) || new Set(data.cargos.map((cargo) => cargo?._id)).size !== data.cargos.length
          || data.cargos.some((cargo) => !cargo?._id || cargo.alumno !== alumnoId || !cargo.campania?._id
            || typeof cargo.campania.nombre !== 'string' || !['abierta', 'cerrada', 'cancelada'].includes(cargo.campania.estado)
            || !['USD', 'EUR'].includes(cargo.moneda) || cargo.moneda !== cargo.campania.moneda
            || !dinero(cargo.monto) || !dinero(cargo.saldo_pendiente) || cargo.saldo_pendiente > cargo.monto
            || !dinero(cargo.disponible) || cargo.disponible > cargo.saldo_pendiente
            || !Object.prototype.hasOwnProperty.call(ESTADOS, cargo.estado) || typeof cargo.pago_en_revision !== 'boolean'
            || typeof cargo.permitir_abonos !== 'boolean')) throw new Error('No se pudieron verificar los cobros del atleta.');
        if (!controller.signal.aborted) setCargos(data.cargos);
      } catch (err) { if (!controller.signal.aborted) setError(err.message); }
      finally { if (!controller.signal.aborted) setCargando(false); }
    };
    cargar();
    return () => controller.abort();
  }, [alumnoId, intento, token]);

  const filtrados = cargos.filter((cargo) => (!estado || estadoVisible(cargo) === estado)
    && cargo.campania.nombre.toLocaleLowerCase().includes(busqueda.trim().toLocaleLowerCase()));
  const cambiarFiltro = (setter) => (event) => { setter(event.target.value); setPagina(0); };

  return <Box sx={{ p: { xs: 2, md: 3 }, width: '100%', boxSizing: 'border-box', maxWidth: 1200, mx: 'auto', minWidth: 0 }}>
    <Typography component="h1" sx={{ fontSize: 26, fontWeight: 800, color: '#0f172a' }}>Cobros adicionales</Typography>
    {cargos[0] && <Typography sx={{ mt: 0.5, color: '#64748b', overflowWrap: 'anywhere' }}>{cargos[0].nombres} {cargos[0].apellidos}</Typography>}
    <Dialog open={Boolean(aviso)} disableEscapeKeyDown fullWidth maxWidth="xs"
      aria-labelledby="pago-reportado-titulo" aria-describedby="pago-reportado-descripcion"
      slotProps={{ paper: { role: 'alertdialog', sx: { m: 2, width: 'calc(100% - 32px)', borderRadius: 2,
        border: '1px solid #bbf7d0', borderTop: '4px solid #22c55e', bgcolor: '#ffffff' } } }}>
      <DialogTitle id="pago-reportado-titulo" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 3, pt: 2.5, pb: 1.5 }}>
        <Box component="span" sx={{ display: 'inline-flex', flexShrink: 0, bgcolor: '#dcfce7', color: '#15803d', p: 1, borderRadius: '50%' }}>
          <CheckCircleIcon sx={{ fontSize: 24 }} />
        </Box>
        <Box component="span" sx={{ flex: 1, minWidth: 0, fontSize: 18, fontWeight: 800, color: '#166534' }}>{aviso}</Box>
        <Tooltip title="Cerrar aviso"><IconButton aria-label="Cerrar aviso" onClick={() => setAviso('')} size="small" sx={{ color: '#64748b' }}>
          <CloseRoundedIcon fontSize="small" />
        </IconButton></Tooltip>
      </DialogTitle>
      <DialogContent sx={{ px: 3, pb: 2.5 }}>
        <Typography id="pago-reportado-descripcion" sx={{ fontSize: 14, lineHeight: 1.7, color: '#475569' }}>
          Tu pago está pendiente de revisión. El importe se aplicará al saldo cuando sea confirmado.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #dcfce7' }}>
        <Button autoFocus variant="contained" startIcon={<CheckCircleIcon />} onClick={() => setAviso('')}
          sx={{ bgcolor: '#15803d', color: '#fff', borderRadius: 2, px: 3, fontWeight: 700, textTransform: 'none',
            boxShadow: 'none', '&:hover': { bgcolor: '#166534', boxShadow: 'none' } }}>Entendido</Button>
      </DialogActions>
    </Dialog>
    {error && <Alert severity="error" sx={{ mt: 2 }} action={<Button color="inherit" onClick={() => setIntento((valor) => valor + 1)}>Reintentar</Button>}>{error}</Alert>}
    {cargando && <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 4 }}><CircularProgress size={22} />Cargando cobros...</Box>}
    {!cargando && !error && <>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '2fr 1fr' }, gap: 2, my: 3 }}>
        <TextField label="Buscar campaña" value={busqueda} onChange={cambiarFiltro(setBusqueda)} size="small" />
        <TextField select label="Estado" value={estado} onChange={cambiarFiltro(setEstado)} size="small">
          <MenuItem value="">Todos los estados</MenuItem>
          {Object.entries(ESTADOS).map(([valor, label]) => <MenuItem key={valor} value={valor}>{label}</MenuItem>)}
        </TextField>
      </Box>
      {!filtrados.length && <Alert severity="info">{cargos.length ? 'No hay cobros con estos filtros.' : 'No tienes cobros adicionales registrados.'}</Alert>}
      <Box component="ul" aria-label="Cobros adicionales del atleta" sx={{ p: 0, m: 0, listStyle: 'none', display: 'grid', gap: 2 }}>
        {filtrados.slice(pagina * porPagina, (pagina + 1) * porPagina).map((cargo) => {
          const estadoCard = estadoVisible(cargo);
          const estilo = ESTILOS[estadoCard] || ESTILOS.pendiente;
          return <Card component="li" key={cargo._id} sx={{ borderRadius: 4, border: `1px solid ${estilo.borde}`,
            bgcolor: estilo.fondo, boxShadow: '0 8px 18px rgba(15, 23, 42, 0.05)', minWidth: 0 }}>
            <CardContent sx={{ px: { xs: 1.8, md: 2.25 }, py: { xs: 2.4, md: 2.8 }, '&:last-child': { pb: { xs: 2.4, md: 2.8 } } }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '44px minmax(0, 1fr)', sm: '44px minmax(0, 1fr) minmax(180px, auto)' }, alignItems: 'center', gap: 1.5 }}>
                <Box aria-hidden="true" sx={{ width: 44, height: 44, borderRadius: '50%', bgcolor: estilo.circulo,
                  color: estilo.icono, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {estadoCard === 'pagado' ? <CheckCircleIcon sx={{ fontSize: 20 }} />
                    : estadoCard === 'no_aplica' ? <BlockOutlinedIcon sx={{ fontSize: 20 }} /> : <PendingActionsIcon sx={{ fontSize: 20 }} />}
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                    <Typography component="h2" sx={{ fontSize: { xs: 18, md: 19 }, lineHeight: 1.1, fontWeight: 900, color: '#1f2937', overflowWrap: 'anywhere' }}>{cargo.campania.nombre}</Typography>
                    <Chip label={ESTADOS[estadoCard]} size="small" sx={{ height: 22, bgcolor: estilo.etiqueta, color: estilo.texto, fontWeight: 800, fontSize: 9, textTransform: 'uppercase' }} />
                  </Box>
                  <Typography sx={{ fontSize: 14, color: estilo.texto, fontWeight: 700, mt: 0.75 }}>{cargo.vencimiento ? `Vence: ${cargo.vencimiento.split('-').reverse().join('/')}` : 'Sin vencimiento'}</Typography>
                  {cargo.campania.descripcion && <Typography sx={{ fontSize: 13, color: '#64748b', mt: 0.5, overflowWrap: 'anywhere' }}>{cargo.campania.descripcion}</Typography>}
                  <Typography sx={{ fontSize: 12, color: '#64748b', mt: 0.5 }}>{cargo.campania.estado === 'cancelada' ? 'Campana cancelada'
                    : cargo.campania.estado === 'cerrada' ? 'Campana cerrada' : cargo.permitir_abonos ? 'Permite abonos' : 'Pago completo'}</Typography>
                </Box>
                <Box sx={{ gridColumn: { xs: '1 / -1', sm: 'auto' }, display: 'flex', flexDirection: 'column', alignItems: { xs: 'flex-start', sm: 'flex-end' }, gap: 0.7, minWidth: 0 }}>
                  <Typography sx={{ fontWeight: 900, fontSize: { xs: 25, md: 27 }, color: estilo.importe, lineHeight: 1.1, overflowWrap: 'anywhere', maxWidth: '100%' }}>
                    {formato(estadoCard === 'pagado' ? cargo.monto : cargo.saldo_pendiente, cargo.moneda)}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>{estadoCard === 'pagado' ? 'Monto esperado' : 'Saldo pendiente'} ({cargo.moneda})</Typography>
                  <Typography sx={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>Monto: {formato(cargo.monto, cargo.moneda)}</Typography>
                  <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', flexWrap: 'wrap' }}>
            <Tooltip title="Reportar pago"><span><IconButton aria-label={`Reportar pago de ${cargo.campania.nombre}`} disabled={cargo.campania.estado !== 'abierta'
              || cargo.estado === 'no_aplica' || cargo.disponible === 0 || (!cargo.permitir_abonos && cargo.pago_en_revision)}
              onClick={() => setSeleccion({ cargo, modo: 'pago' })} sx={{ color: '#475569' }}><PaidIcon /></IconButton></span></Tooltip>
            <Tooltip title="Historial de pagos"><IconButton aria-label={`Historial de ${cargo.campania.nombre}`} onClick={() => setSeleccion({ cargo, modo: 'historial' })}
              sx={{ color: '#475569' }}><HistoryRoundedIcon /></IconButton></Tooltip>
                  </Box>
                </Box>
              </Box>
            </CardContent>
          </Card>;
        })}
      </Box>
      {filtrados.length > 0 && <TablePagination component="div" count={filtrados.length} page={pagina} rowsPerPage={porPagina} rowsPerPageOptions={[5, 10, 25]}
        onPageChange={(_, valor) => setPagina(valor)} onRowsPerPageChange={(event) => { setPorPagina(Number(event.target.value)); setPagina(0); }}
        labelRowsPerPage="Filas" labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count}`}
        sx={{ '& .MuiTablePagination-toolbar': { px: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }, '& .MuiTablePagination-spacer': { display: 'none' } }} />}
    </>}
    {seleccion && <CampaniaPagoDialog representante campania={seleccion.cargo.campania} fila={seleccion.cargo} modo={seleccion.modo}
      onClose={() => setSeleccion(null)} onSaved={(_, cerrar = true) => { if (cerrar) { setSeleccion(null); setAviso('Pago reportado'); } setIntento((valor) => valor + 1); }} />}
  </Box>;
}

export default CampaniasAlumno;