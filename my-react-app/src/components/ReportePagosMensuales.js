import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  MenuItem, Tab, Tabs, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, TextField, ThemeProvider, Tooltip, Typography, createTheme, useMediaQuery, useTheme } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import TimelineOutlinedIcon from '@mui/icons-material/TimelineOutlined';
import { exportToExcel } from '../utils/exportExcel';
import { useDolar } from '../context/DolarContext';

const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const tendencias = { '1_5': 'Del 1 al 5', '6_15': 'Del 6 al 15', '16_fin': 'Después del 15',
  anticipado: 'Pago anticipado', atrasado: 'En meses posteriores', sin_patron: 'Frecuencias iguales', insuficiente: 'Sin cuotas completadas' };
const descripcionHabito = (habito) => {
  if (!habito.franjas_frecuentes.length) return tendencias.insuficiente;
  const prefijo = habito.franjas_frecuentes.length > 1 ? 'Mayor frecuencia (empate)'
    : ['sin_patron', 'insuficiente'].includes(habito.franja) ? 'Mayor frecuencia' : 'Hábito consistente';
  return `${prefijo}: ${habito.franjas_frecuentes.map((franja) => tendencias[franja].toLowerCase()).join(' / ')}`;
};
const normalizar = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const fechaVisible = (value) => String(value || '').split('-').reverse().join('/');

function rangoMes(mes, anio) {
  const prefijo = `${anio}-${String(mes).padStart(2, '0')}`;
  return { desde: `${prefijo}-01`, hasta: `${prefijo}-${new Date(Date.UTC(anio, mes, 0)).getUTCDate()}` };
}

export default function ReportePagosMensuales({ mes, anioInicial = new Date().getFullYear(), sede, onClose }) {
  const theme = useTheme();
  const temaReporte = createTheme(theme, { palette: {
    primary: { main: '#475569', light: '#64748b', dark: '#374151' },
    text: { primary: '#374151', secondary: '#6b7280' }
  } });
  const movil = useMediaQuery(theme.breakpoints.down('sm'));
  const { dolar } = useDolar();
  const moneda = dolar?.moneda === 'EUR' ? 'EUR' : 'USD';
  const dinero = (valor) => new Intl.NumberFormat('es-VE', { style: 'currency', currency: moneda }).format(valor || 0);
  const anioActual = new Date().getFullYear();
  const [anio, setAnio] = useState(anioInicial);
  const [rango, setRango] = useState(() => rangoMes(mes, anioInicial));
  const [borrador, setBorrador] = useState(() => rangoMes(mes, anioInicial));
  const ultimoAnio = Math.max(anioActual + 1, anioInicial);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [errorAccion, setErrorAccion] = useState('');
  const [intento, setIntento] = useState(0);
  const [vista, setVista] = useState('pagos');
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('');
  const [tendencia, setTendencia] = useState('');
  const [pagina, setPagina] = useState(0);
  const [filas, setFilas] = useState(10);
  const [exportando, setExportando] = useState(false);
  const limites = rangoMes(mes, anio);
  const sedeId = sede?._id;

  useEffect(() => {
    const controller = new AbortController();
    let vigente = true;
    async function cargar() {
      setCargando(true);
      setError('');
      setDatos(null);
      try {
        const params = new URLSearchParams({ mes: String(mes), anio: String(anio), desde: rango.desde, hasta: rango.hasta });
        if (sedeId) params.set('id_sede', sedeId);
        const token = localStorage.getItem('token');
        const response = await fetch(`${process.env.REACT_APP_API_URL || ''}/api/mensualidades/reporte-pagos?${params}`, {
          signal: controller.signal, headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || 'No se pudo consultar el reporte.');
        if (!Array.isArray(payload.pagos) || !Array.isArray(payload.habitos) || !Array.isArray(payload.periodos_habito)
          || !payload.resumen || payload.pagos.some((pago) => !pago.id || !Number.isFinite(pago.monto) || pago.monto <= 0
            || !['Confirmado', 'En revision'].includes(pago.estado) || !Array.isArray(pago.asignaciones)
            || pago.asignaciones.some((item) => !item.id_alumno || !Number.isFinite(item.monto) || item.monto <= 0))
          || payload.habitos.some((habito) => !Array.isArray(habito.muestras) || !tendencias[habito.franja]
            || !Array.isArray(habito.franjas_frecuentes) || habito.franjas_frecuentes.some((franja) => !tendencias[franja]
              || ['sin_patron', 'insuficiente'].includes(franja))
            || (habito.franja_frecuente != null && (!tendencias[habito.franja_frecuente]
              || ['sin_patron', 'insuficiente'].includes(habito.franja_frecuente)))
            || !Number.isInteger(habito.meses_observados) || habito.meses_observados < 0)) {
          throw new Error('El reporte recibido está incompleto.');
        }
        if (vigente) { setDatos(payload); setPagina(0); }
      } catch (err) {
        if (vigente && err.name !== 'AbortError') setError(err.message || 'No se pudo consultar el reporte.');
      } finally {
        if (vigente) setCargando(false);
      }
    }
    cargar();
    return () => { vigente = false; controller.abort(); };
  }, [mes, anio, rango.desde, rango.hasta, sedeId, intento]);

  const consulta = normalizar(busqueda);
  const pagos = (datos?.pagos || []).filter((pago) => (!estado || pago.estado === estado)
    && normalizar([pago.codigo, pago.referencia, ...pago.asignaciones.map((item) => `${item.alumno} ${item.representante}`)].join(' ')).includes(consulta));
  const habitos = (datos?.habitos || []).filter((habito) => (!tendencia
    || (tendencia === 'insuficiente' ? habito.franjas_frecuentes.length === 0 : habito.franjas_frecuentes.includes(tendencia)))
    && normalizar(`${habito.alumno} ${habito.representante}`).includes(consulta));
  const alumnos = new Set(pagos.flatMap((pago) => pago.asignaciones.map((item) => item.id_alumno))).size;
  const total = (estadoPago) => pagos.filter((pago) => pago.estado === estadoPago)
    .reduce((suma, pago) => suma + Math.round(pago.monto * 100), 0) / 100;
  const registros = vista === 'pagos' ? pagos : habitos;
  const periodosHabito = datos?.periodos_habito || [];
  const inicioHistorial = periodosHabito[0];
  const finHistorial = periodosHabito[periodosHabito.length - 1];
  const paginaActual = Math.min(pagina, Math.max(0, Math.ceil(registros.length / filas) - 1));
  const visibles = registros.slice(paginaActual * filas, (paginaActual + 1) * filas);

  const aplicarRango = () => {
    if (!borrador.desde || !borrador.hasta || borrador.desde < limites.desde || borrador.hasta > limites.hasta
      || borrador.desde > borrador.hasta) {
      setErrorAccion('Selecciona un rango válido dentro del mes consultado.');
      return;
    }
    setErrorAccion('');
    setRango({ ...borrador });
  };

  const exportar = async () => {
    setExportando(true);
    setErrorAccion('');
    try {
      const rows = vista === 'pagos' ? pagos.map((pago) => ({ Fecha: fechaVisible(pago.fecha),
        Alumnos: pago.asignaciones.map((item) => item.alumno).join(' / '),
        Representantes: [...new Set(pago.asignaciones.map((item) => item.representante).filter(Boolean))].join(' / '),
        Mensualidades: pago.asignaciones.map((item) => `${item.alumno}: Cuota de ${meses[item.mes - 1]} ${item.anio} (${item.monto})`).join(' / '),
        Monto: pago.monto, Moneda: moneda, Método: pago.metodo, Estado: pago.estado, Código: pago.codigo, Referencia: pago.referencia
      })) : habitos.map((habito) => ({ Alumno: habito.alumno, Representante: habito.representante,
        Tendencia: descripcionHabito(habito), 'Cuotas analizadas': habito.meses_observados,
        Coincidencias: habito.franjas_frecuentes.length ? habito.coincidencias : '',
        Evidencia: habito.muestras.map((muestra) => `${meses[muestra.mes - 1]} ${muestra.anio}: ${fechaVisible(muestra.fecha_completada)}`).join(' / ') }));
      await exportToExcel(rows, vista === 'pagos' ? `${vista}-${anio}-${String(mes).padStart(2, '0')}.xlsx`
        : 'habitos-historial-completo.xlsx', [], { numberColumns: ['Monto'] });
    } catch (err) { setErrorAccion('No se pudo exportar el reporte.'); }
    finally { setExportando(false); }
  };

  const detallePago = (pago) => (
    <Box>
      {pago.asignaciones.map((item, index) => <Box key={`${item.id_alumno}-${index}`} sx={{ mb: 0.75 }}>
        <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{item.alumno}</Typography>
        <Typography variant="caption" color="text.secondary">Cuota de {meses[item.mes - 1]} {item.anio} · {dinero(item.monto)}</Typography>
        {item.representante && <Typography variant="caption" component="div" color="text.secondary">{item.representante}</Typography>}
      </Box>)}
      {pago.agrupado && <Typography variant="caption" sx={{ color: '#475569', fontWeight: 700 }}>{pago.codigo || 'Pago agrupado'}</Typography>}
    </Box>
  );
  const estadoChip = (pago) => <Chip size="small" label={pago.estado === 'Confirmado' ? 'Confirmado' : 'En revisión'}
    sx={{ bgcolor: pago.estado === 'Confirmado' ? '#e9f6ef' : '#fff3d8', color: pago.estado === 'Confirmado' ? '#216548' : '#8a5700', fontWeight: 700 }} />;
  const tendenciaHabito = (habito) => <Typography sx={{ fontWeight: 700, fontSize: 13,
    color: !habito.franjas_frecuentes.length ? '#64748b'
      : ['sin_patron', 'insuficiente'].includes(habito.franja) ? '#8a5700' : '#216548' }}>{descripcionHabito(habito)}</Typography>;
  const evidenciaHabito = (habito) => <Box>
    <Typography variant="body2">{habito.meses_observados} {habito.meses_observados === 1 ? 'cuota analizada' : 'cuotas analizadas'}{habito.franjas_frecuentes.length > 0 && ` · ${habito.coincidencias} ${habito.franjas_frecuentes.length > 1 ? 'por franja' : habito.coincidencias === 1 ? 'coincide' : 'coinciden'}`}</Typography>
    {habito.muestras.length > 0 && <Box component="details" sx={{ mt: 0.5, fontSize: 12, color: '#64748b', '& summary': { cursor: 'pointer' } }}>
      <summary>Fechas de cancelación</summary>
      {habito.muestras.map((muestra) => <Typography key={`${muestra.anio}-${muestra.mes}`} variant="caption" component="div">
        {meses[muestra.mes - 1]} {muestra.anio}: {fechaVisible(muestra.fecha_completada)}{tendencias[muestra.franja] && ` · ${tendencias[muestra.franja]}`}
      </Typography>)}
    </Box>}
  </Box>;

  return <ThemeProvider theme={temaReporte}><Dialog open onClose={onClose} fullWidth maxWidth="lg" fullScreen={movil} aria-labelledby="reporte-pagos-title"
    PaperProps={{ sx: { borderRadius: movil ? 0 : 2, maxHeight: movil ? '100dvh' : '90dvh' } }}>
    <DialogTitle component="div" id="reporte-pagos-header" sx={{ bgcolor: '#0f1535', color: '#fff', px: { xs: 2, sm: 3 }, py: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <PaymentsOutlinedIcon sx={{ mt: 0.25, color: '#cbd5e1' }} />
        <Box sx={{ minWidth: 0, flex: 1 }}><Typography component="h2" id="reporte-pagos-title" sx={{ fontSize: 20, fontWeight: 700 }}>Reporte de pagos</Typography>
          <Typography sx={{ fontSize: 13, color: '#cbd5e1', mt: 0.5, overflowWrap: 'anywhere' }}>{vista === 'pagos' ? `${meses[mes - 1]} ${anio}` : 'Historial completo'} · {sede?.nombre || 'Todas las sedes'}</Typography></Box>
        <IconButton aria-label="Cerrar reporte" onClick={onClose} size="small" sx={{ color: '#fff' }}><CloseIcon /></IconButton>
      </Box>
    </DialogTitle>
    <Tabs value={vista} onChange={(event, value) => { setVista(value); setPagina(0); setErrorAccion(''); }} variant="fullWidth" aria-label="Vistas del reporte">
      <Tab value="pagos" label="Pagos recibidos" icon={<PaymentsOutlinedIcon fontSize="small" />} iconPosition="start"
        sx={{ minHeight: 56, minWidth: 0, px: 1, fontSize: { xs: 12, sm: 13 }, '& .MuiTab-iconWrapper': { mr: 0.75, fontSize: 18 } }} />
      <Tab value="habitos" label="Hábito de pago" icon={<TimelineOutlinedIcon fontSize="small" />} iconPosition="start"
        sx={{ minHeight: 56, minWidth: 0, px: 1, fontSize: { xs: 12, sm: 13 }, '& .MuiTab-iconWrapper': { mr: 0.75, fontSize: 18 } }} />
    </Tabs>
    <DialogContent dividers sx={{ px: { xs: 2, sm: 3 }, overflowWrap: 'anywhere' }}>
      {vista === 'pagos' && <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
        <TextField select size="small" label="Año" value={anio} sx={{ width: 110 }} onChange={(event) => {
          const value = Number(event.target.value); setAnio(value); setRango(rangoMes(mes, value)); setBorrador(rangoMes(mes, value)); setErrorAccion('');
        }}>{Array.from({ length: ultimoAnio - 1999 }, (_, index) => ultimoAnio - index).map((value) => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
          <TextField label="Desde" type="date" size="small" value={borrador.desde} onChange={(event) => setBorrador({ ...borrador, desde: event.target.value })}
            InputLabelProps={{ shrink: true }} inputProps={{ min: limites.desde, max: limites.hasta }} sx={{ flex: { xs: '1 1 150px', sm: '0 1 160px' }, minWidth: 0 }} />
          <TextField label="Hasta" type="date" size="small" value={borrador.hasta} onChange={(event) => setBorrador({ ...borrador, hasta: event.target.value })}
            InputLabelProps={{ shrink: true }} inputProps={{ min: limites.desde, max: limites.hasta }} sx={{ flex: { xs: '1 1 150px', sm: '0 1 160px' }, minWidth: 0 }} />
          <Button variant="outlined" onClick={aplicarRango} disabled={cargando}>Aplicar rango</Button>
      </Box>}
      {errorAccion && <Alert severity="error" sx={{ mb: 2 }}>{errorAccion}</Alert>}
      {cargando ? <Typography role="status" sx={{ py: 5, textAlign: 'center' }}>Consultando pagos...</Typography> : error ? (
        <Alert severity="error" action={<Button onClick={() => setIntento(intento + 1)}>Reintentar</Button>}>{error}</Alert>
      ) : datos && <>
        {vista === 'pagos' ? <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>Fecha de pago: {fechaVisible(rango.desde)} al {fechaVisible(rango.hasta)}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0', py: 2, mb: 2 }}>
            {[['Pagos recibidos', pagos.length], ['Alumnos que pagaron', alumnos], ['Confirmado', dinero(total('Confirmado'))], ['En revisión', dinero(total('En revision'))]].map(([label, valor]) => <Box key={label}>
              <Typography sx={{ fontSize: 12, color: '#64748b' }}>{label}</Typography><Typography sx={{ fontSize: 21, fontWeight: 700, color: '#374151', mt: 0.5 }}>{valor}</Typography>
            </Box>)}
          </Box>
        </> : <Box sx={{ mb: 2 }}><Typography sx={{ fontWeight: 700, fontSize: 14 }}>Referencia estimada · Historial completo</Typography>
          {inicioHistorial && <Typography variant="body2" color="text.secondary">Cobertura {sede ? 'de la sede' : 'de todas las sedes'}: {meses[inicioHistorial.mes - 1]} {inicioHistorial.anio} a {meses[finHistorial.mes - 1]} {finHistorial.anio} · {periodosHabito.length} períodos con evidencia</Typography>}
          <Typography variant="caption" color="text.secondary">Cuotas completadas con pagos confirmados.</Typography></Box>}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) 220px' }, gap: 1.5, mb: 2 }}>
          <TextField size="small" label="Buscar alumno o representante" value={busqueda} onChange={(event) => { setBusqueda(event.target.value); setPagina(0); }} />
          {vista === 'pagos' ? <TextField select size="small" label="Estado del pago" value={estado} onChange={(event) => { setEstado(event.target.value); setPagina(0); }}>
            <MenuItem value="">Todos</MenuItem><MenuItem value="Confirmado">Confirmados</MenuItem><MenuItem value="En revision">En revisión</MenuItem>
          </TextField> : <TextField select size="small" label="Tendencia" value={tendencia} onChange={(event) => { setTendencia(event.target.value); setPagina(0); }}>
            <MenuItem value="">Todas</MenuItem>{Object.entries(tendencias).filter(([value]) => value !== 'sin_patron').map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
          </TextField>}
        </Box>
        {registros.length === 0 ? <Typography sx={{ py: 5, textAlign: 'center', color: '#64748b' }}>{vista === 'pagos' ? 'No hay pagos recibidos para esta selección.' : 'No hay alumnos para esta selección.'}</Typography>
          : movil ? visibles.map((item) => <Box component="article" key={item.id || item.id_alumno} sx={{ py: 2, borderBottom: '1px solid #e2e8f0' }}>
            {vista === 'pagos' ? <><Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 1 }}><Typography variant="body2">{fechaVisible(item.fecha)}</Typography>{estadoChip(item)}</Box>
              {detallePago(item)}<Typography sx={{ fontWeight: 700, mt: 1 }}>{dinero(item.monto)} · {item.metodo}</Typography>
              {item.referencia && <Typography variant="caption" color="text.secondary">Referencia: {item.referencia}</Typography>}</>
              : <><Typography fontWeight={700}>{item.alumno}</Typography><Typography variant="body2" color="text.secondary">{item.representante}</Typography>
                <Box sx={{ my: 1 }}>{tendenciaHabito(item)}</Box>{evidenciaHabito(item)}</>}
          </Box>) : <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small" aria-label={vista === 'pagos' ? 'Pagos recibidos' : 'Hábitos de pago'} sx={{ minWidth: vista === 'pagos' ? 760 : 620,
              '& th': { bgcolor: '#f8fafc', color: '#64748b', fontSize: 11, fontWeight: 700, py: 1.5 }, '& td': { py: 1.5, verticalAlign: 'top' } }}>
              <TableHead><TableRow>{(vista === 'pagos' ? ['Fecha de pago', 'Alumnos / mensualidades', `Importe ${moneda}`, 'Método / referencia', 'Estado']
                : ['Alumno', 'Tendencia estimada', 'Evidencia']).map((label) => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
              <TableBody>{visibles.map((item) => <TableRow key={item.id || item.id_alumno}>
                {vista === 'pagos' ? <><TableCell sx={{ whiteSpace: 'nowrap' }}>{fechaVisible(item.fecha)}</TableCell><TableCell>{detallePago(item)}</TableCell>
                  <TableCell sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{dinero(item.monto)}</TableCell><TableCell>{item.metodo}<Typography variant="caption" component="div" color="text.secondary">{item.referencia}</Typography></TableCell><TableCell>{estadoChip(item)}</TableCell></>
                  : <><TableCell><Typography sx={{ fontWeight: 700, fontSize: 13 }}>{item.alumno}</Typography><Typography variant="caption" color="text.secondary">{item.representante}</Typography></TableCell>
                    <TableCell>{tendenciaHabito(item)}</TableCell>
                    <TableCell>{evidenciaHabito(item)}</TableCell></>}
              </TableRow>)}</TableBody>
            </Table>
          </TableContainer>}
        <TablePagination component="div" count={registros.length} page={paginaActual} rowsPerPage={filas} rowsPerPageOptions={[10, 25, 50]}
          onPageChange={(event, value) => setPagina(value)} onRowsPerPageChange={(event) => { setFilas(Number(event.target.value)); setPagina(0); }}
          labelRowsPerPage="Filas" labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count}`}
          getItemAriaLabel={(tipo) => tipo === 'next' ? 'Página siguiente' : 'Página anterior'} sx={{
            '& .MuiTablePagination-toolbar': { px: 0 }, '& .MuiTablePagination-selectLabel': { m: 0, fontSize: 12 },
            '& .MuiTablePagination-displayedRows': { fontSize: 12 }, '& .MuiTablePagination-actions': { ml: 1 },
            '& .MuiTablePagination-input': { ml: 0.5, mr: 1 }
          }} />
      </>}
    </DialogContent>
    <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 1.5, bgcolor: '#f8fafc', gap: 1 }}>
      <Tooltip title="Exportar resultados filtrados"><span><Button startIcon={<DownloadOutlinedIcon />} onClick={exportar} variant="outlined"
        disabled={cargando || !!error || exportando || registros.length === 0}>{exportando ? 'Exportando...' : 'Excel'}</Button></span></Tooltip>
      <Button variant="contained" onClick={onClose} sx={{ bgcolor: '#0f1535', boxShadow: 'none', borderRadius: 1 }}>Cerrar</Button>
    </DialogActions>
  </Dialog></ThemeProvider>;
}