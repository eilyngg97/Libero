import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, CardActions, CardContent, Typography, Avatar, Box, Chip, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Tooltip } from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { useNavigate } from 'react-router-dom';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { FaSackDollar } from 'react-icons/fa6';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import { mediaUrl } from '../utils/mediaUrl';
import TerminosPendientesAlert from './TerminosPendientesAlert.js';
import { cargarAtletasPortal, cargarMensualidadesPortal } from '../utils/portalPaymentData';
import CampaniaPagoAgrupadoDialog from './CampaniaPagoAgrupadoDialog';
import { alumnosDelCargo } from '../utils/campaniaCobros';

const normalizarDiaMes = (value) => {
  const numero = Number(value);
  if (!Number.isInteger(numero) || numero < 1 || numero > 31) return null;
  return numero;
};

const construirFechaPeriodoConDia = (mes, anio, dia) => {
  const ultimoDiaMes = new Date(anio, mes, 0).getDate();
  const diaAjustado = Math.min(Math.max(1, Number(dia) || 1), ultimoDiaMes);
  return new Date(anio, mes - 1, diaAjustado);
};

const parseFechaSinDesfase = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  const matchIso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (matchIso) {
    const year = Number(matchIso[1]);
    const month = Number(matchIso[2]);
    const day = Number(matchIso[3]);
    const fecha = new Date(year, month - 1, day);
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }

  const fecha = new Date(value);
  if (Number.isNaN(fecha.getTime())) return null;

  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  }).formatToParts(fecha);
  const obtenerParte = (tipo) => Number(partes.find((parte) => parte.type === tipo)?.value);
  return new Date(obtenerParte('year'), obtenerParte('month') - 1, obtenerParte('day'));
};

const buildSiguientePeriodoDesde = (mes, anio) => {
  const mesNum = Number(mes);
  const anioNum = Number(anio);
  if (!Number.isInteger(mesNum) || !Number.isInteger(anioNum)) {
    return { mes: null, anio: null };
  }

  if (mesNum >= 12) {
    return { mes: 1, anio: anioNum + 1 };
  }

  return { mes: mesNum + 1, anio: anioNum };
};

const estiloBotonPagoAgrupado = {
  width: { xs: '100%', sm: 240 }, maxWidth: '100%', minWidth: 0, minHeight: 44, flexShrink: 0,
  px: 2, borderRadius: 1.5, bgcolor: '#ec3e75', color: '#fff', textTransform: 'none',
  fontSize: 12, fontWeight: 750, boxShadow: 'none',
  '&:hover': { bgcolor: '#d62c63', boxShadow: 'none' }
};

function DashboardUsuario() {
  const [alumnos, setAlumnos] = useState([]);
  const [resumenPagos, setResumenPagos] = useState({});
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState('');
  const [intentoCarga, setIntentoCarga] = useState(0);
  const [pagoCobrosAbierto, setPagoCobrosAbierto] = useState(false);
  const [mensajeCobros, setMensajeCobros] = useState('');
  const [totalesCobros, setTotalesCobros] = useState(null);
  const [errorCobros, setErrorCobros] = useState('');
  const [intentoCobros, setIntentoCobros] = useState(0);
  const navigate = useNavigate();
  const apiBase = process.env.REACT_APP_API_URL || window.location.origin;
  const token = localStorage.getItem('token');

  const obtenerFechaVencimientoVisible = useCallback((mensualidad, alumno) => {
    const diaLimitePersonalizado = normalizarDiaMes(alumno?.dia_limite_personalizado);
    if (diaLimitePersonalizado) {
      return construirFechaPeriodoConDia(mensualidad?.mes, mensualidad?.anio, diaLimitePersonalizado);
    }

    return parseFechaSinDesfase(mensualidad?.fecha_vencimiento);
  }, []);

  const obtenerResumenPago = useCallback((mensualidades = [], alumno = null) => {
    if (!Array.isArray(mensualidades) || mensualidades.length === 0) {
      return { fechaTexto: '--', monto: null, estado: 'sin datos', pagable: false };
    }

    const normalizarEstado = (estado) => (estado || '').toLowerCase();
    const ordenadas = mensualidades
      .map((m) => {
        const fechaPeriodo = new Date(`${m.anio}-${String(m.mes).padStart(2, '0')}-01T00:00:00`);
        const fechaVencimientoVisible = obtenerFechaVencimientoVisible(m, alumno);
        return {
          mes: Number(m.mes),
          anio: Number(m.anio),
          fecha: fechaPeriodo,
          fechaVencimientoVisible,
          estado: normalizarEstado(m.estatus),
          monto: Number(m.saldo_pendiente ?? m.monto_con_recargo_usd ?? m.monto_esperado) || 0,
          montoBase: Number(m.monto_sin_recargo_usd) || Math.max(0, (Number(m.monto_esperado) || 0) - (Number(m.recargo_aplicado_usd) || 0)),
          recargoAplicado: Math.max(0, Number(m.recargo_aplicado_usd) || 0),
          creditoAUsar: Math.max(0, Number(m.credito_a_aplicar) || 0),
          saldoAFavorDisponible: m.saldo_a_favor_disponible,
          mensualidad: m
        };
      })
      .filter((m) => !Number.isNaN(m.fecha.getTime()))
      .sort((a, b) => a.fecha - b.fecha);

    if (!ordenadas.length) {
      return { fechaTexto: '--', monto: null, estado: 'sin datos', pagable: false };
    }

    const estadosPagables = ['pendiente', 'retrasado', 'insolvente', 'abono'];
    const pendientes = ordenadas.filter((m) => estadosPagables.includes(m.estado));

    let referencia = pendientes[0] || null;
    if (!referencia) {
      const ultimaMensualidad = ordenadas[ordenadas.length - 1];
      const siguientePeriodo = buildSiguientePeriodoDesde(ultimaMensualidad?.mes, ultimaMensualidad?.anio);
      const diaReferencia = normalizarDiaMes(alumno?.dia_limite_personalizado)
        || normalizarDiaMes(ultimaMensualidad?.fechaVencimientoVisible?.getDate())
        || 1;

      referencia = {
        fecha: (siguientePeriodo.mes && siguientePeriodo.anio)
          ? new Date(siguientePeriodo.anio, siguientePeriodo.mes - 1, 1)
          : ultimaMensualidad.fecha,
        fechaVencimientoVisible: (siguientePeriodo.mes && siguientePeriodo.anio)
          ? construirFechaPeriodoConDia(siguientePeriodo.mes, siguientePeriodo.anio, diaReferencia)
          : ultimaMensualidad.fechaVencimientoVisible,
        monto: ultimaMensualidad?.monto,
        montoBase: ultimaMensualidad?.montoBase,
        recargoAplicado: 0
      };
    }

    return {
      fechaTexto: referencia.fechaVencimientoVisible
        ? referencia.fechaVencimientoVisible.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
        : referencia.fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
      monto: referencia.monto,
      montoBase: referencia.montoBase || 0,
      recargoAplicado: referencia.recargoAplicado || 0,
      creditoAUsar: referencia.creditoAUsar || 0,
      saldoAFavorDisponible: referencia.saldoAFavorDisponible,
      mes: referencia.mes,
      anio: referencia.anio,
      fechaVencimiento: referencia.fechaVencimientoVisible,
      estado: pendientes.length ? referencia.estado : 'al dia',
      pagable: pendientes.length > 0
    };
  }, [obtenerFechaVencimientoVisible]);

  useEffect(() => {
    const abortController = new AbortController();
    const { signal } = abortController;
    const fetchAlumnos = async () => {
      setCargando(true);
      setErrorCarga('');
      setAlumnos([]);
      setResumenPagos({});
      try {
        const usuario = JSON.parse(localStorage.getItem('usuario') || 'null');
        if (!usuario?.id) throw new Error('No se pudo identificar al representante.');
        const { atletas } = await cargarAtletasPortal(apiBase, usuario.id, signal);
        if (signal.aborted) return;
        setAlumnos(atletas);

        const resumenEntries = await Promise.all(
          atletas.map(async (alumno) => {
            const mensualidades = await cargarMensualidadesPortal(apiBase, alumno, signal);
            return [alumno._id, obtenerResumenPago(mensualidades, alumno)];
          })
        );

        if (!signal.aborted) setResumenPagos(Object.fromEntries(resumenEntries));
      } catch (error) {
        if (!signal.aborted) setErrorCarga(error.message || 'No se pudieron cargar los pagos de tus atletas.');
      } finally {
        if (!signal.aborted) setCargando(false);
      }
    };
    fetchAlumnos();
    return () => abortController.abort();
  }, [apiBase, obtenerResumenPago, intentoCarga]);

  useEffect(() => {
    const controller = new AbortController();
    setTotalesCobros(null);
    setErrorCobros('');
    if (alumnos.length) {
      const cargarCobros = async () => {
        try {
          if (!token) throw new Error('Inicia sesion nuevamente para consultar los cobros.');
          const resultados = await Promise.all(alumnos.map(async (alumno) => {
            const response = await fetch(`${apiBase}/api/campanias-cobro/mis-cargos?alumnoId=${encodeURIComponent(alumno._id)}`, {
              headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal
            });
            const data = await response.json();
            if (!response.ok) throw new Error('No se pudo cargar el total de cobros adicionales.');
            if (!Array.isArray(data?.cargos) || new Set(data.cargos.map((cargo) => cargo?._id)).size !== data.cargos.length
              || data.cargos.some((cargo) => {
              const familiar = cargo?.tipo_cobro === 'representante';
              if (typeof cargo?._id !== 'string' || !cargo._id || (familiar ? !Array.isArray(cargo.atletas_cubiertos) || !cargo.atletas_cubiertos.length
                || typeof cargo.representante_cobro !== 'string' || !cargo.representante_cobro
                || cargo.atletas_cubiertos[0]?.alumno !== cargo.alumno
                || cargo.atletas_cubiertos.some((atleta) => typeof atleta?.alumno !== 'string')
                || new Set(alumnosDelCargo(cargo)).size !== cargo.atletas_cubiertos.length
                || !alumnosDelCargo(cargo).includes(alumno._id) : cargo.alumno !== alumno._id)
                || !['USD', 'EUR'].includes(cargo.moneda) || cargo.campania?.moneda !== cargo.moneda
                || !['abierta', 'cerrada', 'cancelada'].includes(cargo.campania?.estado)
                || !['pendiente', 'abono', 'pagado', 'no_aplica'].includes(cargo.estado)
                || typeof cargo.saldo_pendiente !== 'number' || !Number.isFinite(cargo.saldo_pendiente)
                || cargo.saldo_pendiente < 0 || !Number.isSafeInteger(Math.round(cargo.saldo_pendiente * 100))
                || typeof cargo.pago_en_revision !== 'boolean' || typeof cargo.disponible !== 'number' || !Number.isFinite(cargo.disponible)
                || cargo.disponible < 0 || cargo.disponible > cargo.saldo_pendiente) return true;
              return false;
            })) throw new Error('No se pudo verificar el total de cobros adicionales.');
            return data.cargos;
          }));
          const cargosUnicos = new Map();
          for (const cargo of resultados.flat()) {
            const huella = JSON.stringify({ alumno: cargo.alumno, tipo: cargo.tipo_cobro, moneda: cargo.moneda,
              representante: cargo.representante_cobro,
              monto: cargo.monto, estado: cargo.estado, version: cargo.__v, saldo: cargo.saldo_pendiente,
              disponible: cargo.disponible, revision: cargo.pago_en_revision, atletas: cargo.atletas_cubiertos,
              campania: { id: cargo.campania._id, moneda: cargo.campania.moneda, estado: cargo.campania.estado } });
            const anterior = cargosUnicos.get(cargo._id);
            if (anterior && (cargo.tipo_cobro !== 'representante' || anterior.huella !== huella)) {
              throw new Error('No se pudo verificar el total de cobros adicionales.');
            }
            if (!anterior) cargosUnicos.set(cargo._id, { cargo, huella });
          }
          const totales = { USD: { porPagar: 0, revision: 0, otros: 0 }, EUR: { porPagar: 0, revision: 0, otros: 0 } };
          cargosUnicos.forEach(({ cargo }) => {
            if (['pendiente', 'abono'].includes(cargo.estado) && cargo.campania.estado !== 'cancelada') {
              const saldo = Math.round(cargo.saldo_pendiente * 100);
              const revision = saldo - Math.round(cargo.disponible * 100);
              const porPagar = cargo.campania.estado === 'abierta' && !cargo.pago_en_revision ? saldo : 0;
              totales[cargo.moneda].porPagar += porPagar;
              totales[cargo.moneda].revision += revision;
              totales[cargo.moneda].otros += saldo - revision - porPagar;
            }
          });
          if (Object.values(totales).some((importes) => Object.values(importes).some((importe) => !Number.isSafeInteger(importe) || importe < 0))) throw new Error('No se pudo verificar el total de cobros adicionales.');
          if (!controller.signal.aborted) setTotalesCobros(Object.entries(totales).filter(([, importes]) => Object.values(importes).some((importe) => importe > 0)));
        } catch (error) {
          if (!controller.signal.aborted) setErrorCobros(error.message || 'No se pudo cargar el total de cobros adicionales.');
        }
      };
      cargarCobros();
    }
    return () => controller.abort();
  }, [alumnos, apiBase, intentoCobros, token]);

  const mostrarCobros = Boolean(errorCobros) || totalesCobros === null || totalesCobros.length > 0;
  const puedePagarCobros = !errorCobros && Boolean(totalesCobros?.some(([, importes]) => importes.porPagar > 0));

  const resumenFamiliar = useMemo(() => {
    const pendientes = alumnos
      .map((alumno) => resumenPagos[alumno._id])
      .filter((resumen) => resumen?.pagable && Number(resumen.monto) > 0);
    const fechas = pendientes.map((resumen) => resumen.fechaVencimiento).filter(Boolean);
    const vencimiento = fechas.length
      ? new Date(Math.min(...fechas.map((fecha) => fecha.getTime())))
      : null;

    return {
      total: pendientes.reduce((suma, resumen) => suma + (Number(resumen.monto) || 0), 0),
      recargos: pendientes.reduce((suma, resumen) => suma + (Number(resumen.recargoAplicado) || 0), 0),
      atletas: pendientes.length,
      vencimiento: vencimiento
        ? vencimiento.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
        : '--'
    };
  }, [alumnos, resumenPagos]);

  const navegarDetalle = (alumno) => {
    navigate(`/panel-opciones-usuario/${alumno._id}`, {
      state: { alumno, sede: { nombre: alumno.sede } }
    });
  };


  if (pagoCobrosAbierto && alumnos[0]) return <CampaniaPagoAgrupadoDialog pagina representante alumnoId={alumnos[0]._id}
    onClose={() => setPagoCobrosAbierto(false)} onSaved={(resultado) => {
      setPagoCobrosAbierto(false); setMensajeCobros(resultado.mensaje || 'Pago agrupado reportado');
      setIntentoCobros((actual) => actual + 1);
    }} />;

  return (
    <Box sx={{ width: '100%', maxWidth: 1040, mx: 'auto', pb: 5 }}>
      <TerminosPendientesAlert sx={{ mb: 2, mt: 1 }} />

      <Box sx={{ mb: 3, mt: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 850, color: '#11132f' }}>
          Mis atletas
        </Typography>
        <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.35 }}>
          Gestiona pagos y actividades de tus representados.
        </Typography>
      </Box>

      <Dialog open={Boolean(mensajeCobros)} disableEscapeKeyDown fullWidth maxWidth="xs"
        aria-labelledby="cobros-agrupados-aviso-titulo" aria-describedby="cobros-agrupados-aviso-descripcion"
        slotProps={{ paper: { role: 'alertdialog', sx: { m: 2, width: 'calc(100% - 32px)', borderRadius: 2,
          border: '1px solid #dce8df', borderTop: '4px solid #2e7d4f', boxShadow: '0 20px 60px rgba(17,19,66,0.2)' } } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, px: 3, pt: 2.5 }}>
          <Box sx={{ display: 'grid', placeItems: 'center', width: 44, height: 44, flexShrink: 0, borderRadius: '50%', bgcolor: '#e8f4ec', color: '#2e7d4f' }}>
            <CheckCircleRoundedIcon sx={{ fontSize: 26 }} />
          </Box>
          <DialogTitle id="cobros-agrupados-aviso-titulo" sx={{ flex: 1, minWidth: 0, p: 0, pt: 0.4, fontSize: 20, fontWeight: 800, lineHeight: 1.35, color: '#111342' }}>
            {mensajeCobros}
          </DialogTitle>
          <Tooltip title="Cerrar aviso"><IconButton aria-label="Cerrar aviso de pago agrupado" size="small" onClick={() => setMensajeCobros('')}
            sx={{ color: '#747a90', flexShrink: 0 }}><CloseRoundedIcon fontSize="small" /></IconButton></Tooltip>
        </Box>
        <DialogContent sx={{ px: 3, pt: 2, pb: 2.5 }}>
          <Chip label="Pendiente de revisión" size="small" sx={{ mb: 1.5, bgcolor: '#fff3da', color: '#895a13', fontWeight: 700, borderRadius: 1 }} />
          <Typography id="cobros-agrupados-aviso-descripcion" sx={{ color: '#555b72', fontSize: 14, lineHeight: 1.7 }}>
            Recibimos tu reporte de pago de cobros adicionales. La academia lo revisará antes de confirmarlo.
          </Typography>
          <Typography sx={{ mt: 1, color: '#747a90', fontSize: 13, lineHeight: 1.6 }}>
            El saldo pendiente se actualizará cuando el pago sea confirmado.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid #eceef3' }}>
          <Button autoFocus variant="contained" onClick={() => setMensajeCobros('')}
            sx={{ minHeight: 42, px: 3, bgcolor: '#111342', color: '#fff', borderRadius: 1.5, textTransform: 'none', fontWeight: 750,
              boxShadow: 'none', '&:hover': { bgcolor: '#25284f', boxShadow: 'none' } }}>Entendido</Button>
        </DialogActions>
      </Dialog>

      {cargando && <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>}
      {errorCarga && <Alert severity="error" sx={{ mb: 2 }} action={
        <Button color="inherit" size="small" onClick={() => setIntentoCarga((actual) => actual + 1)}>Reintentar</Button>
      }>{errorCarga}</Alert>}

      {!cargando && !errorCarga && alumnos.length > 0 && (resumenFamiliar.atletas > 0 || mostrarCobros) && (
        <Box component="section" aria-label="Pagos familiares" sx={{ mb: 3.5, display: 'grid', gap: 1.5 }}>
          {resumenFamiliar.atletas > 0 && (
            <Box component="section" aria-label="Mensualidades" sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'minmax(0, 1fr) minmax(95px, auto) minmax(80px, auto) minmax(190px, auto)' },
              alignItems: 'center', gap: { xs: 2.25, lg: 3 }, p: { xs: 2, sm: 2.5 }, bgcolor: '#111342', border: '1px solid #111342', borderRadius: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, gridColumn: { xs: '1 / -1', lg: 'auto' } }}>
                <Box sx={{ display: 'grid', placeItems: 'center', width: 42, height: 42, flexShrink: 0, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.12)', color: '#fff' }}>
                  <CalendarMonthOutlinedIcon fontSize="small" />
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography component="h2" sx={{ fontSize: 15, fontWeight: 800, color: '#fff', lineHeight: 1.4 }}>Mensualidades</Typography>
                  <Typography sx={{ mt: 0.25, fontSize: 12, color: '#bec5e4' }}>{resumenFamiliar.atletas} {resumenFamiliar.atletas === 1 ? 'atleta con saldo pendiente' : 'atletas con saldo pendiente'}</Typography>
                </Box>
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ color: '#bec5e4', fontSize: 11, mb: 0.25 }}>Total pendiente</Typography>
                <Typography sx={{ color: '#fff', fontSize: 26, fontWeight: 850, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>${resumenFamiliar.total.toFixed(2)}</Typography>
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography sx={{ color: '#bec5e4', fontSize: 11, mb: 0.5 }}>Vencimiento</Typography>
                <Typography sx={{ color: '#fff', fontSize: 15, fontWeight: 750, textTransform: 'lowercase' }}>{resumenFamiliar.vencimiento}</Typography>
              </Box>
              {resumenFamiliar.atletas > 1 && <Button variant="contained" endIcon={<ArrowForwardRoundedIcon />}
                onClick={() => navigate('/pagos-agrupados')}
                sx={{ ...estiloBotonPagoAgrupado, gridColumn: { xs: '1 / -1', lg: 'auto' }, justifySelf: 'end' }}>
                Pagar todo junto · {resumenFamiliar.atletas} atletas
              </Button>}
            </Box>
          )}
          {mostrarCobros && <Box component="section" aria-label="Cobros adicionales" sx={{ display: 'grid', alignItems: 'center',
            gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'minmax(0, 1fr) minmax(95px, auto) minmax(80px, auto) minmax(190px, auto)' },
            gap: { xs: 2.25, lg: 3 }, p: { xs: 2, sm: 2.5 }, bgcolor: '#fff', border: '1px solid #e5e7ee', boxShadow: 'inset 3px 0 0 #111342', borderRadius: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0, gridColumn: { xs: '1 / -1', lg: 'auto' } }}>
              <Box sx={{ display: 'grid', placeItems: 'center', width: 42, height: 42, flexShrink: 0, borderRadius: 1.5, bgcolor: '#eef0f7', color: '#111342' }}>
                <FaSackDollar size={20} aria-hidden="true" focusable="false" />
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Typography component="h2" sx={{ fontSize: 15, fontWeight: 800, color: '#111342', lineHeight: 1.4 }}>Cobros adicionales</Typography>
                <Typography sx={{ mt: 0.25, fontSize: 12, color: '#70758a' }}>Campañas y actividades</Typography>
              </Box>
            </Box>
            <Box sx={{ minWidth: 0, gridColumn: { xs: '1 / -1', lg: '2 / 4' } }}>
              <Typography sx={{ color: '#70758a', fontSize: 11, mb: 0.25 }}>Por pagar</Typography>
              {errorCobros ? <Alert severity="error" action={<Button color="inherit" size="small" aria-label="Reintentar cobros adicionales"
                onClick={() => setIntentoCobros((actual) => actual + 1)}>Reintentar</Button>}>{errorCobros}</Alert>
                : totalesCobros === null ? <Typography role="status" sx={{ color: '#70758a', fontSize: 13 }}>Cargando...</Typography>
                  : totalesCobros.map(([moneda, importes]) => <Box key={moneda} sx={{ overflowWrap: 'anywhere' }}>
                    <Typography sx={{ color: '#111342', fontSize: 26, fontWeight: 850, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
                      {new Intl.NumberFormat('en-US', { style: 'currency', currency: moneda }).format(importes.porPagar / 100)}
                      <Box component="span" sx={{ ml: 0.5, fontSize: 11, fontWeight: 700, color: '#70758a' }}>{moneda}</Box>
                    </Typography>
                    {importes.revision > 0 && <Typography sx={{ color: '#895a13', fontSize: 12, mt: 0.5, lineHeight: 1.5 }}>
                      En revisión: {new Intl.NumberFormat('en-US', { style: 'currency', currency: moneda }).format(importes.revision / 100)} {moneda}
                    </Typography>}
                    {importes.otros > 0 && <Tooltip title="Saldo pendiente no disponible para pago agrupado">
                      <Typography sx={{ color: '#70758a', fontSize: 12, mt: 0.5, lineHeight: 1.5 }}>
                        Otros saldos: {new Intl.NumberFormat('en-US', { style: 'currency', currency: moneda }).format(importes.otros / 100)} {moneda}
                      </Typography>
                    </Tooltip>}
                  </Box>)}
            </Box>
            {puedePagarCobros && <Button variant="contained" endIcon={<ArrowForwardRoundedIcon />}
              onClick={() => { setMensajeCobros(''); setPagoCobrosAbierto(true); }}
              sx={{ ...estiloBotonPagoAgrupado, gridColumn: { xs: '1 / -1', lg: 'auto' }, justifySelf: 'end' }}>
              Pagar todo junto · {alumnos.length} {alumnos.length === 1 ? 'atleta' : 'atletas'}
            </Button>}
          </Box>}
        </Box>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 2.25 }}>
        {alumnos.length === 0 ? (!cargando && !errorCarga && (
          <Box sx={{ textAlign: 'center', mt: 6, gridColumn: '1 / -1' }}>
            <Typography variant="h6" color="text.secondary">
              No tienes alumnos registrados.
            </Typography>
          </Box>
        )) : (
          <>
            {alumnos.map((alumno) => {
              const resumen = resumenPagos[alumno._id] || { fechaTexto: '--', monto: null, estado: 'sin datos' };
              const mensajePago = cargando ? 'Cargando pagos' : errorCarga ? 'Pagos no disponibles'
                : resumen.estado === 'sin datos' ? 'Sin mensualidades' : '';
              return (
                <Box key={alumno._id} sx={{ display: 'flex', minWidth: 0 }}>
                  <Card
                    sx={{
                      width: '100%',
                      borderRadius: 2,
                      bgcolor: '#fff',
                      border: '1px solid #e7e9f2',
                      boxShadow: '0 8px 24px rgba(34, 39, 78, 0.07)',
                      display: 'flex',
                      flexDirection: 'column'
                    }}
                  >
                    <CardContent sx={{ flex: 1, p: 2, '&:last-child': { pb: 1.25 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.1, mb: 1.7 }}>
                        <Avatar
                          src={mediaUrl(alumno.foto) || undefined}
                          alt={alumno.nombres}
                          sx={{ width: 46, height: 46, bgcolor: '#eceefe', color: '#111342', fontSize: 14, fontWeight: 850 }}
                        >
                          {`${String(alumno.nombres || '').charAt(0)}${String(alumno.apellidos || '').charAt(0)}`.toUpperCase()}
                        </Avatar>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography
                            variant="subtitle1"
                            sx={{
                              fontWeight: 800,
                              color: '#17182f',
                              lineHeight: 1.15,
                              fontSize: 15
                            }}
                          >
                            {alumno.nombres} {alumno.apellidos}
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 0.55, mt: 0.6, flexWrap: 'wrap' }}>
                            <Chip size="small" label={alumno.categoria || 'Sin categoría'} sx={{ height: 20, bgcolor: '#f1f2f7', color: '#555b74', fontSize: 10, borderRadius: 1 }} />
                            <Chip size="small" label={alumno.sede && typeof alumno.sede === 'object' ? alumno.sede.nombre : alumno.sede || 'Sin sede'} sx={{ height: 20, bgcolor: '#f1f2f7', color: '#555b74', fontSize: 10, borderRadius: 1 }} />
                          </Box>
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 1, mb: 1.6 }}>
                        <Box>
                          <Typography sx={{ color: '#7a8098', fontSize: 11 }}>
                            {resumen.pagable && resumen.mes
                              ? `Por pagar · ${new Intl.DateTimeFormat('es-VE', { month: 'long' }).format(new Date(2026, resumen.mes - 1, 1))} ${resumen.anio}`
                              : 'Estado de cuenta'}
                          </Typography>
                          <Typography sx={{ color: '#11132f', fontWeight: 850, fontSize: 24, lineHeight: 1.15 }}>
                            {resumen.monto != null ? `$${Number(resumen.monto).toFixed(2)}` : '--'}
                          </Typography>
                        </Box>
                        <Chip
                          size="small"
                          label={mensajePago || (resumen.pagable ? `Vence · ${resumen.fechaTexto}` : 'Al día')}
                          sx={{ height: 22, bgcolor: mensajePago ? '#f1f2f7' : resumen.pagable ? '#fff0f3' : '#e9f8ef', color: mensajePago ? '#555b74' : resumen.pagable ? '#c52d55' : '#16794a', fontSize: 10, fontWeight: 750, borderRadius: 1 }}
                        />
                      </Box>

                      {!cargando && !errorCarga && resumen.monto != null && <Box sx={{ borderTop: '1px solid #eceef4', pt: 1.25, display: 'grid', gap: 0.55 }}>
                        {[
                          ['Mensualidad', resumen.montoBase],
                          ['Recargo por mora', resumen.recargoAplicado],
                          ['Credito para esta cuota', -resumen.creditoAUsar],
                          ['Saldo a favor', Number(resumen.saldoAFavorDisponible ?? alumno?.saldo_a_favor_mensualidades ?? 0)]
                        ].map(([etiqueta, valor]) => (
                          <Box key={etiqueta} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                            <Typography sx={{ color: etiqueta === 'Recargo por mora' && valor > 0 ? '#c52d55' : '#5f657c', fontSize: 11.5 }}>{etiqueta}</Typography>
                            <Typography sx={{ color: etiqueta === 'Recargo por mora' && valor > 0 ? '#c52d55' : '#33384f', fontSize: 11.5, fontWeight: 650 }}>
                              {valor < 0 ? '-' : etiqueta === 'Recargo por mora' && valor > 0 ? '+' : ''}${Math.abs(Number(valor || 0)).toFixed(2)}
                            </Typography>
                          </Box>
                        ))}
                      </Box>}
                    </CardContent>
                    <CardActions sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.8, px: 2, pb: 2, pt: 1 }}>
                      <Button
                        variant="outlined"
                        onClick={() => navegarDetalle(alumno)}
                        sx={{
                          color: '#25283e',
                          borderColor: '#d9dce7',
                          fontWeight: 700,
                          borderRadius: 1.25,
                          textTransform: 'none',
                          fontSize: 12,
                          minHeight: 38
                        }}
                      >
                        Ver detalle
                      </Button>
                      <Button
                        variant="contained"
                        disabled={cargando || Boolean(errorCarga) || !resumen.pagable}
                        onClick={() => navigate(`/pagos-alumno/${alumno._id}`, { state: { alumno } })}
                        sx={{
                          bgcolor: '#11132f',
                          '&:hover': { bgcolor: '#25284f' },
                          fontWeight: 750,
                          borderRadius: 1.25,
                          textTransform: 'none',
                          fontSize: 12,
                          minHeight: 38,
                          boxShadow: 'none'
                        }}
                      >
                        {mensajePago || (resumen.pagable ? (Number(resumen.monto) === 0 && resumen.creditoAUsar > 0 ? 'Usar saldo a favor' : `Pagar $${Number(resumen.monto || 0).toFixed(2)}`) : 'Sin deuda')}
                      </Button>
                    </CardActions>
                  </Card>
                </Box>
              );
            })}
          </>
        )}
      </Box>
    </Box>
  );
}

export default DashboardUsuario;
