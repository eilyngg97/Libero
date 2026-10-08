import React, { useState, useEffect } from 'react';
import { Card, CardContent, Typography, Box, Button, Chip, Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, TextField, MenuItem, Tooltip } from '@mui/material';
import { useLocation } from 'react-router-dom';
import ModalPago from './ModalPago';
import PagoAgrupadoEditor from './PagoAgrupadoEditor';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import PendingActionsIcon from '@mui/icons-material/PendingActions';
import ErrorIcon from '@mui/icons-material/Error';
import SchoolIcon from '@mui/icons-material/School';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CloseIcon from '@mui/icons-material/Close';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import PaymentIcon from '@mui/icons-material/Payment';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import PaymentsIcon from '@mui/icons-material/Payments';
import SavingsOutlinedIcon from '@mui/icons-material/SavingsOutlined';
import { useDolar } from '../context/DolarContext';
import { obtenerTasaOficialPorFecha, obtenerTasaEuroOficialPorFecha } from '../utils/dolarHistorico';
import { normalizeMetodoPago, metodoRequiereReferencia } from '../utils/paymentMethod';

// Eliminar pagosEjemplo, usaremos datos reales

const normalizarDiaMes = (value) => {
  const numero = Number(value);
  if (!Number.isInteger(numero) || numero < 1 || numero > 31) return null;
  return numero;
};

const obtenerIdGrupo = (pago) => pago?.id_pago_agrupado?._id || pago?.id_pago_agrupado || '';

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

function PagosAlumno(props) {
  const metodosPago = ['Pago movil', 'Transferencia', 'Efectivo'];

  const { dolar } = useDolar();
  const monedaConfigurada = String(dolar?.moneda || 'USD').toUpperCase() === 'EUR' ? 'EUR' : 'USD';
  const simboloMonedaConfigurada = monedaConfigurada === 'EUR' ? '€' : '$';
  const etiquetaTasa = `Bs/${monedaConfigurada}`;
  const tasa = Number(dolar?.promedio);
  const [openModalPago, setOpenModalPago] = useState(false);
  const [pagoSeleccionado, setPagoSeleccionado] = useState(null);
  const location = useLocation();
  const alumno = location.state?.alumno || props.alumno;
  const sede = location.state?.sede || props.sede;
  const [filtro, setFiltro] = useState('todos'); // 'porPagar' | 'pagados' | 'todos'
  const [pagina, setPagina] = useState(1);
  const pagosPorPagina = 5;
  const [mensualidades, setMensualidades] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [modalDetalle, setModalDetalle] = useState(false);
  const [detallePago, setDetallePago] = useState(null);
  const [pagosDetalle, setPagosDetalle] = useState([]);
  const [mensualidadDetalle, setMensualidadDetalle] = useState(null);
  const creditoAplicadoDetalle = Math.max(0, Number(mensualidadDetalle?.credito_aplicado) || 0);
  const ajusteDetalle = Number(mensualidadDetalle?.ajuste_extraordinario) || 0;
  const baseNetaDetalle = Number(mensualidadDetalle?.monto_sin_recargo_usd ?? Math.max(0, Number(mensualidadDetalle?.monto_total || 0) - Number(mensualidadDetalle?.recargo_aplicado_usd || 0)));
  const baseOriginalDetalle = Number(mensualidadDetalle?.monto_base ?? (baseNetaDetalle + creditoAplicadoDetalle + ajusteDetalle));
  const [grupoDetalle, setGrupoDetalle] = useState(null);
  const [errorGrupoDetalle, setErrorGrupoDetalle] = useState('');
  const [pagoAgrupadoEditandoId, setPagoAgrupadoEditandoId] = useState('');
  const [editandoPago, setEditandoPago] = useState(null);
  const [modalEditarOpen, setModalEditarOpen] = useState(false);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [eliminandoPagoId, setEliminandoPagoId] = useState('');
  const [confirmarEliminarOpen, setConfirmarEliminarOpen] = useState(false);
  const [pagoAEliminar, setPagoAEliminar] = useState(null);
  const [metodoPago, setMetodoPago] = useState(metodosPago[0]);
  const [montoPagoBs, setMontoPagoBs] = useState('');
  const [fechaPago, setFechaPago] = useState(() => new Date().toISOString().slice(0, 10));
  const [referencia, setReferencia] = useState('');
  const [notaPago, setNotaPago] = useState('');
  const [solicitaRevisionRecargo, setSolicitaRevisionRecargo] = useState(false);
  const [telefonoPago, setTelefonoPago] = useState('');
  const [tipoCedulaTitular, setTipoCedulaTitular] = useState('V');
  const [cedulaTitular, setCedulaTitular] = useState('');
  const [errorRef, setErrorRef] = useState('');
  const [errorEdicion, setErrorEdicion] = useState('');
  const [comprobante, setComprobante] = useState(null);
  const [quitarComprobanteActual, setQuitarComprobanteActual] = useState(false);
  const [tasaPagoHistorica, setTasaPagoHistorica] = useState(null);
  const [adelantandoMensualidad, setAdelantandoMensualidad] = useState(false);
  const [confirmarAdelantoOpen, setConfirmarAdelantoOpen] = useState(false);
  const [pagoSuccessDialogOpen, setPagoSuccessDialogOpen] = useState(false);
  const [pagoSuccessData, setPagoSuccessData] = useState(null);
  const [aplicandoCreditoId, setAplicandoCreditoId] = useState('');

  const construirPeriodoLegible = (pagoObj) => {
    if (!pagoObj) return 'Mensualidad';
    if (pagoObj.fecha) {
      try {
        const rawFecha = String(pagoObj.fecha);
        const match = rawFecha.match(/^(\d{4})-(\d{2})/);
        if (match) {
          const anio = match[1];
          const mesNum = Number(match[2]);
          const fechaAux = new Date(Number(anio), mesNum - 1, 1);
          const mesNombre = fechaAux.toLocaleString('es-ES', { month: 'long' });
          if (mesNombre) {
            return `Mensualidad ${mesNombre} ${anio}`;
          }
        }
      } catch (_) {}
    }
    return pagoObj.detalle || 'Mensualidad';
  };

  const mapMensualidadToPagoItem = (m) => ({
    id: m._id,
    _id: m._id,
    id_alumno: m.id_alumno,
    fecha: `${m.anio}-${String(m.mes).padStart(2, '0')}-01`,
    fecha_vencimiento: m.fecha_vencimiento,
    monto: m.saldo_pendiente ?? m.monto_esperado,
    monto_total: m.monto_total ?? m.monto_esperado,
    monto_base: m.monto_base,
    credito_aplicado: m.credito_aplicado || 0,
    ajuste_extraordinario: m.ajuste_extraordinario || 0,
    total_pagado: m.total_pagado || 0,
    credito_a_aplicar: m.credito_a_aplicar || 0,
    saldo_a_favor_disponible: m.saldo_a_favor_disponible,
    estado: m.estatus,
    aplica_recargo: m.aplica_recargo,
    monto_sin_recargo_usd: m.monto_sin_recargo_usd,
    recargo_aplicado_usd: m.recargo_aplicado_usd,
    monto_con_recargo_usd: m.monto_con_recargo_usd,
    fecha_aplicacion_recargo: m.fecha_aplicacion_recargo,
    detalle: m.detalle || `Mensualidad correspondiente a ${m.mes}/${m.anio}`,
    descripcion: 'Mensualidad'
  });

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchMensualidades = React.useCallback(() => {
    if (!alumno?._id) return;
    setLoading(true);
    setError(null);
    return fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades?id_alumno=${alumno._id}`, {
      headers: getAuthHeaders()
    })
      .then(res => {
        if (!res.ok) throw new Error('Error al obtener mensualidades');
        return res.json();
      })
      .then(data => {
        setMensualidades(data.map(mapMensualidadToPagoItem));
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [alumno?._id]);

  const adelantarSiguienteMensualidad = async () => {
    if (!alumno?._id || adelantandoMensualidad) return;

    if (bloqueaAdelantoPorBeca) {
      setError('No se puede adelantar mensualidades para alumnos becados.');
      return;
    }

    const tieneMensualidadesBloqueantes = mensualidades.some((m) => {
      const estado = normalizarEstado(m?.estado);
      return estado === 'pendiente' || estado === 'retrasado' || estado === 'insolvente' || estado === 'abono';
    });

    if (tieneMensualidadesBloqueantes) {
      setError('No puedes adelantar mensualidades mientras tengas cuotas pendientes, insolventes o con abonos.');
      return;
    }

    try {
      setAdelantandoMensualidad(true);
      setError(null);
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades/adelantar`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id_alumno: alumno._id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudo adelantar la mensualidad');

      const mensualidad = data?.mensualidad;
      if (mensualidad?._id) {
        setPagoSeleccionado(mapMensualidadToPagoItem(mensualidad));
        setOpenModalPago(true);
      }
      await fetchMensualidades();
      setSuccessMessage(data?.message || 'Mensualidad adelantada correctamente');
    } catch (err) {
      setError(err.message || 'No se pudo adelantar la mensualidad');
    } finally {
      setAdelantandoMensualidad(false);
    }
  };

  const cargarPagosMensualidad = async (mensualidadId) => {
    const res = await fetch(`${process.env.REACT_APP_API_URL}/api/pagos/${mensualidadId}`, {
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Error al obtener pagos');
    return Array.isArray(data) ? data : [];
  };

  const parsePagoDate = (value) => {
    if (!value) return 0;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
  };

  const ordenarPagosCronologicamente = (pagos = []) => {
    return [...pagos]
      .map((pago, index) => ({ pago, index }))
      .sort((a, b) => {
        const creadoA = parsePagoDate(a.pago?.createdAt);
        const creadoB = parsePagoDate(b.pago?.createdAt);
        if (creadoA !== creadoB) return creadoA - creadoB;

        const fechaA = parsePagoDate(a.pago?.fecha_pago);
        const fechaB = parsePagoDate(b.pago?.fecha_pago);
        if (fechaA !== fechaB) return fechaA - fechaB;

        return a.index - b.index;
      })
      .map((item) => item.pago);
  };

  const actualizarDetalleMensualidad = async (mensualidad, abrirModal = true) => {
    setMensualidadDetalle(mensualidad);
    try {
      const data = await cargarPagosMensualidad(mensualidad.id);
      if (data.length > 0) {
        const pagosOrdenados = ordenarPagosCronologicamente(data);
        setDetallePago(pagosOrdenados[pagosOrdenados.length - 1]);
        setPagosDetalle(pagosOrdenados);
      } else {
        setDetallePago(null);
        setPagosDetalle([]);
      }
    } catch {
      setDetallePago(null);
      setPagosDetalle([]);
    }
    if (abrirModal) setModalDetalle(true);
  };

  useEffect(() => {
    fetchMensualidades();
    window.addEventListener('focus', fetchMensualidades);
    return () => window.removeEventListener('focus', fetchMensualidades);
  }, [fetchMensualidades]);

  const usarCreditoSinTransferencia = async (pago) => {
    if (aplicandoCreditoId) return;
    setAplicandoCreditoId(pago.id);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/pagos/credito`, {
        method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_mensualidad: pago.id, credito_a_aplicar: pago.credito_a_aplicar })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudo aplicar el saldo a favor.');
      await fetchMensualidades();
      setSuccessMessage('Mensualidad cubierta con saldo a favor, sin transferencia adicional.');
    } catch (err) {
      setError(err.message);
      await fetchMensualidades();
    } finally {
      setAplicandoCreditoId('');
    }
  };

  const idGrupoDetalle = obtenerIdGrupo(detallePago);
  useEffect(() => {
    setGrupoDetalle(null);
    setErrorGrupoDetalle('');
    if (!modalDetalle || !idGrupoDetalle) return;
    const abort = new AbortController();
    const cargarGrupo = async () => {
      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/pagos/agrupado/${idGrupoDetalle}`, {
          headers: getAuthHeaders(), signal: abort.signal
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'No se pudo consultar la transferencia agrupada.');
        if (!abort.signal.aborted) setGrupoDetalle(data);
      } catch (err) {
        if (!abort.signal.aborted) setErrorGrupoDetalle(err.message || 'No se pudo consultar la transferencia agrupada.');
      }
    };
    cargarGrupo();
    return () => abort.abort();
  }, [modalDetalle, idGrupoDetalle, detallePago]);

  useEffect(() => {
    if (!modalEditarOpen || !fechaPago) return;

    let cancelled = false;

    const cargarTasaHistorica = async () => {
      try {
        const tasaHistorica = monedaConfigurada === 'EUR'
          ? await obtenerTasaEuroOficialPorFecha(fechaPago, Number(tasa) || null)
          : await obtenerTasaOficialPorFecha(fechaPago, Number(tasa) || null);
        if (!cancelled) {
          setTasaPagoHistorica(Number(tasaHistorica) || null);
        }
      } catch {
        if (!cancelled) {
          setTasaPagoHistorica(Number(tasa) || null);
        }
      }
    };

    cargarTasaHistorica();

    return () => {
      cancelled = true;
    };
  }, [modalEditarOpen, fechaPago, tasa, monedaConfigurada]);

  const pagosOrdenados = [...mensualidades].sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
  );

  const estadosBloqueantesOrdenPago = ['pendiente', 'retrasado', 'insolvente', 'abono'];

  const normalizarEstado = (value) => String(value || '').trim().toLowerCase();
  const esAlumnoBecado = String(alumno?.tipo_mensualidad || '').toLowerCase() === 'beca_completa';
  const tieneMensualidadBecado = mensualidades.some((m) => normalizarEstado(m?.estado) === 'becado');
  const bloqueaAdelantoPorBeca = esAlumnoBecado || tieneMensualidadBecado;
  const estadoMensualidadDetalle = normalizarEstado(mensualidadDetalle?.estado);
  const usuarioPuedeEditarEliminarPago = ['insolvente', 'retrasado', 'pendiente', 'en revision'].includes(estadoMensualidadDetalle);
  const puedeEditarPago = (pago) => obtenerIdGrupo(pago) && obtenerIdGrupo(pago) === idGrupoDetalle
    ? grupoDetalle?.pago?.estado === 'En revision' : usuarioPuedeEditarEliminarPago;

  const pagosFiltrados = pagosOrdenados.filter(pago => {
    const estado = normalizarEstado(pago.estado);
    if (filtro === 'porPagar') return estado && estado !== 'pagado';
    if (filtro === 'pagados') return estado === 'pagado';
    return true;
  });

  const copiarReferencia = async (texto) => {
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // no-op
    }
  };

  const handleVerComprobante = (url) => {
    if (!url) return;
    const finalUrl = /^https?:\/\//i.test(url)
      ? url
      : `${process.env.REACT_APP_API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
    window.open(finalUrl, '_blank', 'noopener,noreferrer');
  };

  const handleVerDetalle = async (mensualidad) => {
    await actualizarDetalleMensualidad(mensualidad, true);
  };

  const formatMoney = (value) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
    return Number(value).toFixed(2);
  };

  const formatTelefonoPago = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    const base = digits.length >= 10 ? digits.slice(-10) : digits;
    return base;
  };

  const descomponerCedulaTitular = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return { tipo: 'V', numero: '' };

    const match = raw.match(/^([VEJG])\s*[-:]?\s*(\d+)$/i);
    if (match) {
      return { tipo: match[1].toUpperCase(), numero: match[2] };
    }

    return { tipo: 'V', numero: raw.replace(/\D/g, '') };
  };

  const formatCedulaTitular = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const match = raw.match(/^([VEJG])\s*[-:]?\s*(\d+)$/i);
    if (match) {
      return `${match[1].toUpperCase()}-${match[2]}`;
    }

    return raw;
  };

  const formatMontoPrincipal = (pago) => {
    const montoBs = Number(pago?.monto_pagado_bs);
    if (Number.isFinite(montoBs) && montoBs > 0) {
      return `Bs ${formatMoney(montoBs)}`;
    }

    return `${simboloMonedaConfigurada}${formatMoney(pago?.monto_pagado)} ${monedaConfigurada}`;
  };

  const formatMontoEsperado = (pago, fallbackMontoUsd = null, preferirMontoActual = false) => {
    if (preferirMontoActual) {
      const montoActualUsd = Number(fallbackMontoUsd);
      if (Number.isFinite(montoActualUsd) && montoActualUsd >= 0) {
        const montoPagoUsd = Number(pago?.monto_pagado);
        const montoPagoBs = Number(pago?.monto_pagado_bs);
        const tasaGrupo = Number(obtenerIdGrupo(pago) && obtenerIdGrupo(pago) === idGrupoDetalle ? grupoDetalle?.pago?.tasa_aplicada : null);
        const tasaAplicada = Number.isFinite(tasaGrupo) && tasaGrupo > 0 ? tasaGrupo : (Number.isFinite(montoPagoUsd) && montoPagoUsd > 0 && Number.isFinite(montoPagoBs) && montoPagoBs > 0)
          ? (montoPagoBs / montoPagoUsd)
          : null;

        if (Number.isFinite(tasaAplicada) && tasaAplicada > 0) {
          const montoActualBs = montoActualUsd * tasaAplicada;
          return `Bs ${formatMoney(montoActualBs)} / ${simboloMonedaConfigurada}${formatMoney(montoActualUsd)} ${monedaConfigurada}`;
        }

        return `${simboloMonedaConfigurada}${formatMoney(montoActualUsd)} ${monedaConfigurada}`;
      }
    }

    const montoBs = Number(pago?.monto_esperado_bs);
    const montoUsd = Number.isFinite(Number(pago?.monto_esperado_usd))
      ? Number(pago?.monto_esperado_usd)
      : Number(fallbackMontoUsd);

    if (Number.isFinite(montoBs) && montoBs > 0 && Number.isFinite(montoUsd) && montoUsd > 0) {
      return `Bs ${formatMoney(montoBs)} / ${simboloMonedaConfigurada}${formatMoney(montoUsd)} ${monedaConfigurada}`;
    }

    if (Number.isFinite(montoBs) && montoBs > 0) {
      return `Bs ${formatMoney(montoBs)}`;
    }

    if (Number.isFinite(montoUsd) && montoUsd > 0) {
      return `${simboloMonedaConfigurada}${formatMoney(montoUsd)} ${monedaConfigurada}`;
    }

    return '-';
  };

  const formatEquivalenteUsdDesdeBs = (pago) => {
    const montoBs = Number(pago?.monto_pagado_bs);
    const montoUsd = Number(pago?.monto_pagado);

    if (!Number.isFinite(montoBs) || montoBs <= 0 || !Number.isFinite(montoUsd) || montoUsd <= 0) {
      return null;
    }

    const tasaAplicada = montoBs / montoUsd;
    if (!Number.isFinite(tasaAplicada) || tasaAplicada <= 0) {
      return null;
    }

    return `${simboloMonedaConfigurada}${formatMoney(montoBs / tasaAplicada)} ${monedaConfigurada}`;
  };

  const formatTasaAplicada = (pago) => {
    const tasaGrupo = Number(obtenerIdGrupo(pago) && obtenerIdGrupo(pago) === idGrupoDetalle ? grupoDetalle?.pago?.tasa_aplicada : null);
    if (Number.isFinite(tasaGrupo) && tasaGrupo > 0) {
      return `${tasaGrupo.toLocaleString('en-US', { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 6 })} Bs/${monedaConfigurada}`;
    }
    const montoUsd = Number(pago?.monto_pagado);
    const montoBs = Number(pago?.monto_pagado_bs);
    if (!montoUsd || Number.isNaN(montoUsd) || !montoBs || Number.isNaN(montoBs)) {
      return '-';
    }
    return `${formatMoney(montoBs / montoUsd)} Bs/${monedaConfigurada}`;
  };

  const formatFechaBonita = (value) => {
    if (!value) return '-';

    // Evita desfases por zona horaria cuando la API envia fechas ISO (YYYY-MM-DD o YYYY-MM-DDTHH:mm:ssZ).
    // Tomamos la parte de fecha y la reconstruimos en horario local.
    const raw = String(value).trim();
    const matchIso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);

    let fecha;
    if (matchIso) {
      const year = Number(matchIso[1]);
      const month = Number(matchIso[2]);
      const day = Number(matchIso[3]);
      fecha = new Date(year, month - 1, day);
    } else {
      fecha = new Date(value);
    }

    if (Number.isNaN(fecha.getTime())) return '-';
    return fecha.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const obtenerFechaVencimientoVisible = (item) => {
    const diaLimitePersonalizado = normalizarDiaMes(item?.id_alumno?.dia_limite_personalizado ?? alumno?.dia_limite_personalizado);
    if (diaLimitePersonalizado) {
      const matchPeriodo = String(item?.fecha || '').trim().match(/^(\d{4})-(\d{2})-/);
      if (matchPeriodo) {
        const anioPeriodo = Number(matchPeriodo[1]);
        const mesPeriodo = Number(matchPeriodo[2]);
        return construirFechaPeriodoConDia(mesPeriodo, anioPeriodo, diaLimitePersonalizado);
      }
    }

    return parseFechaSinDesfase(item?.fecha_vencimiento);
  };

  const abrirModalEditarPago = (pago) => {
    const grupoId = obtenerIdGrupo(pago);
    if (grupoId) {
      setPagoAgrupadoEditandoId(grupoId);
      return;
    }
    setEditandoPago(pago);
    setMetodoPago(normalizeMetodoPago(pago?.metodo_pago));
    const montoPagoBsInicial = Number(pago?.monto_pagado_bs);
    if (Number.isFinite(montoPagoBsInicial) && montoPagoBsInicial > 0) {
      setMontoPagoBs(montoPagoBsInicial);
    } else {
      const montoUsdInicial = Number(pago?.monto_pagado);
      const tasaActual = Number(tasa) || 0;
      setMontoPagoBs(montoUsdInicial > 0 && tasaActual > 0 ? (montoUsdInicial * tasaActual).toFixed(2) : '');
    }
    setFechaPago(pago?.fecha_pago ? new Date(pago.fecha_pago).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
    setReferencia(pago?.referencia ? String(pago.referencia) : '');
    setTelefonoPago(formatTelefonoPago(pago?.telefono_pago));
    const cedulaEditada = descomponerCedulaTitular(pago?.cedula_titular);
    setTipoCedulaTitular(cedulaEditada.tipo || 'V');
    setCedulaTitular(cedulaEditada.numero || '');
    setNotaPago(pago?.nota ? String(pago.nota) : '');
    setSolicitaRevisionRecargo(Boolean(pago?.solicita_revision_recargo));
    setErrorRef('');
    setErrorEdicion('');
    setComprobante(null);
    setQuitarComprobanteActual(false);
    setTasaPagoHistorica(Number(tasa) || null);
    setModalEditarOpen(true);
  };

  const guardarEdicionPago = async () => {
    if (!editandoPago?._id || !mensualidadDetalle?.id) return;
    if (!camposObligatoriosEdicionCompletos) {
      const msg = 'Completa todos los campos obligatorios para guardar el pago.';
      setError(msg);
      setErrorEdicion(msg);
      return;
    }

    if (metodoRequiereReferencia(metodoPago) && referenciaNormalizada.length !== 6) {
      const msg = 'Debes ingresar los 6 ultimos digitos de la referencia';
      setErrorRef(msg);
      setErrorEdicion(msg);
      return;
    }

    const monto = equivalenteUsdDesdeBs;
    if (!Number.isFinite(monto) || monto <= 0) {
      const msg = 'Monto equivalente en USD invalido para la tasa y monto en bolivares ingresados';
      setError(msg);
      setErrorEdicion(msg);
      return;
    }

    try {
      setGuardandoEdicion(true);
      setErrorRef('');
      setErrorEdicion('');

      const formData = new FormData();
      formData.append('monto_pagado', monto);
      formData.append('fecha_pago', fechaPago);
      formData.append('metodo_pago', normalizeMetodoPago(metodoPago));
      formData.append('referencia', metodoRequiereReferencia(metodoPago) ? referenciaNormalizada : '');
      formData.append('telefono_pago', telefonoPagoNormalizado);
      formData.append('cedula_titular', cedulaTitularNormalizada ? `${String(tipoCedulaTitular || 'V').toUpperCase()}-${cedulaTitularNormalizada}` : '');
      formData.append('nota', String(notaPago || '').trim());
      formData.append('solicita_revision_recargo', solicitaRevisionRecargo ? 'true' : 'false');

      if (!Number.isFinite(montoPagoBsNumerico) || montoPagoBsNumerico <= 0) {
        const msg = 'Monto en bolivares invalido';
        setError(msg);
        setErrorEdicion(msg);
        return;
      }
      formData.append('monto_pagado_bs', montoPagoBsNumerico.toFixed(2));

      if (comprobante) {
        formData.append('comprobante', comprobante);
      }
      if (quitarComprobanteActual && !comprobante) {
        formData.append('eliminar_comprobante', 'true');
      }

      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/pagos/${editandoPago._id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: formData
      });
      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      if (!res.ok) {
        throw new Error(data?.error || data?.message || 'Error al actualizar pago');
      }

      setModalEditarOpen(false);
      setEditandoPago(null);
      setNotaPago('');
      setSolicitaRevisionRecargo(false);
      setErrorEdicion('');
      await fetchMensualidades();
      await actualizarDetalleMensualidad(mensualidadDetalle, true);
      setSuccessMessage('Pago actualizado correctamente');
    } catch (err) {
      const msg = err.message || 'Error al actualizar pago';
      setError(msg);
      setErrorEdicion(msg);
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const solicitarEliminarPago = (pago) => {
    setPagoAEliminar(pago);
    setConfirmarEliminarOpen(true);
  };

  const eliminarPago = async () => {
    if (!pagoAEliminar?._id || !mensualidadDetalle?.id) return;
    try {
      setEliminandoPagoId(pagoAEliminar._id);
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/pagos/${pagoAEliminar._id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al eliminar pago');

      setConfirmarEliminarOpen(false);
      setPagoAEliminar(null);
      await fetchMensualidades();
      await actualizarDetalleMensualidad(mensualidadDetalle, true);
      setSuccessMessage('Pago eliminado correctamente');
    } catch (err) {
      setError(err.message || 'Error al eliminar pago');
    } finally {
      setEliminandoPagoId('');
    }
  };

  // Paginación
  const totalPaginas = Math.ceil(pagosFiltrados.length / pagosPorPagina);
  const pagosPagina = pagosFiltrados.slice((pagina - 1) * pagosPorPagina, pagina * pagosPorPagina);

  const referenciaNormalizada = String(referencia || '').replace(/\D/g, '');
  const telefonoPagoNormalizado = String(telefonoPago || '').replace(/\D/g, '');
  const cedulaTitularNormalizada = String(cedulaTitular || '').replace(/\D/g, '');
  const montoPagoBsNumerico = Number(montoPagoBs);
  const metodoPagoNormalizado = normalizeMetodoPago(metodoPago);
  const equivalenteUsdDesdeBs =
    Number.isFinite(montoPagoBsNumerico) && montoPagoBsNumerico > 0 && Number.isFinite(Number(tasaPagoHistorica)) && Number(tasaPagoHistorica) > 0
      ? montoPagoBsNumerico / Number(tasaPagoHistorica)
      : null;
  const camposObligatoriosEdicionCompletos =
    Boolean(editandoPago?._id && mensualidadDetalle?.id) &&
    Boolean(metodoPagoNormalizado) &&
    Boolean(fechaPago) &&
    Number.isFinite(montoPagoBsNumerico) &&
    montoPagoBsNumerico > 0 &&
    Number.isFinite(equivalenteUsdDesdeBs) &&
    equivalenteUsdDesdeBs > 0 &&
    (!metodoRequiereReferencia(metodoPagoNormalizado) || referenciaNormalizada.length === 6) &&
    telefonoPagoNormalizado.length === 10 &&
    Boolean(String(tipoCedulaTitular || '').trim()) &&
    cedulaTitularNormalizada.length > 0;

  const inputSx = {
    '& .MuiOutlinedInput-root': {
      borderRadius: 2,
      backgroundColor: '#ffffff'
    },
    '& .MuiOutlinedInput-notchedOutline': {
      borderColor: '#e2e8f0'
    },
    '& .MuiInputLabel-root': {
      color: '#64748b'
    }
  };

  const estadosConSaldo = ['pendiente', 'retrasado', 'abono', 'insolvente'];
  const mensualidadesConSaldo = mensualidades.filter((m) => estadosConSaldo.includes(normalizarEstado(m.estado)));
  const balancePendiente = mensualidadesConSaldo.reduce((acc, item) => acc + (Number(item.monto) || 0), 0);
  const saldoAFavorDisponible = Math.max(0, Number(mensualidades[0]?.saldo_a_favor_disponible ?? alumno?.saldo_a_favor_mensualidades) || 0);
  const proximaMensualidadPorVencer = mensualidadesConSaldo
    .map((item) => obtenerFechaVencimientoVisible(item))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime())[0] || null;

  const textoVencimiento = (() => {
    if (!proximaMensualidadPorVencer) return 'Sin vencimientos cercanos';
    const hoy = new Date();
    const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
    const inicioVenc = new Date(
      proximaMensualidadPorVencer.getFullYear(),
      proximaMensualidadPorVencer.getMonth(),
      proximaMensualidadPorVencer.getDate()
    );
    const diffDias = Math.ceil((inicioVenc.getTime() - inicioHoy.getTime()) / 86400000);
    if (diffDias <= 0) return 'Vencida';
    return `Vence en ${diffDias} ${diffDias === 1 ? 'dia' : 'dias'}`;
  })();

  const estadoConteo = mensualidades.reduce((acc, item) => {
    const estado = normalizarEstado(item?.estado);
    acc[estado] = (acc[estado] || 0) + 1;
    return acc;
  }, {});

  const estadoPagado = estadoConteo['pagado'] || 0;
  const estadoPendiente = estadoConteo['pendiente'] || 0;
  const estadoRetrasado = estadoConteo['retrasado'] || 0;
  const estadoEnRevision = estadoConteo['en revision'] || 0;
  const estadoAbono = estadoConteo['abono'] || 0;
  const estadoInsolvente = estadoConteo['insolvente'] || 0;
  const estadoExonerado = estadoConteo['exonerado'] || 0;
  const estadoExentoReposo = estadoConteo['exento por reposo'] || 0;
  const bloqueaAdelantoPorDeuda = estadoPendiente > 0 || estadoRetrasado > 0 || estadoInsolvente > 0 || estadoAbono > 0;
  const tooltipBloqueoAdelanto = 'No puedes adelantar el proximo mes porque tienes mensualidades pendientes, insolventes, retrasadas o con abonos pendientes.';
  const tooltipBloqueoAdelantoBeca = 'Los alumnos con beca completa no pueden adelantar mensualidades.';

  const ultimaMensualidadRegistrada = [...mensualidades]
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())[0];

  const estadoCuenta = (() => {
    if (estadoRetrasado > 0 || estadoInsolvente > 0) {
      return {
        titulo: 'Con Retrasos',
        subtitulo: 'Tienes cuotas vencidas por regularizar',
        color: '#b91c1c',
        fondoIcono: '#fecaca',
        icono: <ErrorIcon sx={{ color: '#b91c1c', fontSize: 18 }} />
      };
    }

    if (estadoPendiente > 0) {
      return {
        titulo: 'Pago Pendiente',
        subtitulo: 'Tienes cuotas pendientes por pagar',
        color: '#c2410c',
        fondoIcono: '#fed7aa',
        icono: <PendingActionsIcon sx={{ color: '#c2410c', fontSize: 18 }} />
      };
    }

    if (estadoAbono > 0) {
      return {
        titulo: 'Con Abonos',
        subtitulo: 'Hay mensualidades parcialmente cubiertas',
        color: '#b45309',
        fondoIcono: '#fde68a',
        icono: <PendingActionsIcon sx={{ color: '#b45309', fontSize: 18 }} />
      };
    }

    if (estadoEnRevision > 0) {
      return {
        titulo: 'En Revision',
        subtitulo: 'Tus pagos estan en proceso de verificacion',
        color: '#1d4ed8',
        fondoIcono: '#bfdbfe',
        icono: <PendingActionsIcon sx={{ color: '#1d4ed8', fontSize: 18 }} />
      };
    }

    if (estadoPagado > 0 || estadoExonerado > 0 || estadoExentoReposo > 0) {
      return {
        titulo: 'En Buen Estado',
        subtitulo: 'Al dia con tus cuotas',
        color: '#047857',
        fondoIcono: '#86efac',
        icono: <CheckCircleIcon sx={{ color: '#047857', fontSize: 18 }} />
      };
    }

    return {
      titulo: 'Sin Datos',
      subtitulo: 'Aun no hay mensualidades registradas',
      color: '#475569',
      fondoIcono: '#e2e8f0',
      icono: <SchoolIcon sx={{ color: '#475569', fontSize: 18 }} />
    };
  })();

  return (
    <Box sx={{ p: { md: 3 } }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '9fr 3fr' }, gap: { xs: 3, md: 4 }, alignItems: 'start' }}>
        <Box>
          <Box sx={{ mb: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a' }}>
              Mis pagos
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
              Alumno: <Box component="span" sx={{ fontWeight: 700 }}>{alumno?.nombres || alumno?.nombre}</Box> | Sede:{' '}
              <Box component="span" sx={{ fontWeight: 700 }}>{typeof sede?.nombre === 'object' ? sede.nombre.nombre : sede?.nombre || '-'}</Box>
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 3 }}>
            <Button
              startIcon={<PendingActionsIcon sx={{ fontSize: 18 }} />}
              variant={filtro === 'porPagar' ? 'contained' : 'outlined'}
              onClick={() => setFiltro('porPagar')}
              sx={{
                borderRadius: 999,
                px: 2.5,
                fontWeight: 700,
                textTransform: 'none',
                borderColor: filtro === 'porPagar' ? '#b45309' : '#cbd5e1',
                bgcolor: filtro === 'porPagar' ? '#b45309' : '#ffffff',
                color: filtro === 'porPagar' ? '#ffffff' : '#334155',
                boxShadow: filtro === 'porPagar' ? '0 6px 14px rgba(180, 83, 9, 0.24)' : 'none',
                '&:hover': {
                  bgcolor: filtro === 'porPagar' ? '#92400e' : '#f8fafc',
                  borderColor: '#b45309'
                }
              }}
            >
              Por pagar
            </Button>
            <Button
              startIcon={<CheckCircleIcon sx={{ fontSize: 18 }} />}
              variant={filtro === 'pagados' ? 'contained' : 'outlined'}
              onClick={() => setFiltro('pagados')}
              sx={{
                borderRadius: 999,
                px: 2.5,
                fontWeight: 700,
                textTransform: 'none',
                borderColor: filtro === 'pagados' ? '#15803d' : '#cbd5e1',
                bgcolor: filtro === 'pagados' ? '#15803d' : '#ffffff',
                color: filtro === 'pagados' ? '#ffffff' : '#334155',
                boxShadow: filtro === 'pagados' ? '0 6px 14px rgba(21, 128, 61, 0.24)' : 'none',
                '&:hover': {
                  bgcolor: filtro === 'pagados' ? '#166534' : '#f8fafc',
                  borderColor: '#15803d'
                }
              }}
            >
              Pagados
            </Button>
            <Button
              startIcon={<HistoryRoundedIcon sx={{ fontSize: 18 }} />}
              variant={filtro === 'todos' ? 'contained' : 'outlined'}
              onClick={() => setFiltro('todos')}
              sx={{
                borderRadius: 999,
                px: 2.5,
                fontWeight: 700,
                textTransform: 'none',
                borderColor: filtro === 'todos' ? '#334155' : '#cbd5e1',
                bgcolor: filtro === 'todos' ? '#334155' : '#ffffff',
                color: filtro === 'todos' ? '#ffffff' : '#334155',
                boxShadow: filtro === 'todos' ? '0 6px 14px rgba(51, 65, 85, 0.22)' : 'none',
                '&:hover': {
                  bgcolor: filtro === 'todos' ? '#1e293b' : '#f8fafc',
                  borderColor: '#334155'
                }
              }}
            >
              Todos
            </Button>
            <Tooltip
              title={bloqueaAdelantoPorBeca ? tooltipBloqueoAdelantoBeca : (bloqueaAdelantoPorDeuda ? tooltipBloqueoAdelanto : '')}
              arrow
              disableHoverListener={!bloqueaAdelantoPorBeca && !bloqueaAdelantoPorDeuda}
              disableFocusListener={!bloqueaAdelantoPorBeca && !bloqueaAdelantoPorDeuda}
              disableTouchListener={!bloqueaAdelantoPorBeca && !bloqueaAdelantoPorDeuda}
            >
              <span>
                {!bloqueaAdelantoPorBeca && (
                  <Button
                    startIcon={<PaymentsIcon sx={{ fontSize: 17 }} />}
                    variant="contained"
                    onClick={() => {
                      if (bloqueaAdelantoPorDeuda) return;
                      setConfirmarAdelantoOpen(true);
                    }}
                    disabled={adelantandoMensualidad || !alumno?._id || bloqueaAdelantoPorDeuda}
                    sx={{
                      borderRadius: 999,
                      px: 2.5,
                      fontWeight: 700,
                      textTransform: 'none',
                      bgcolor: '#e07d00',
                      color: '#ffffff',
                      boxShadow: '0 6px 14px rgba(255, 187, 0, 0.24)',
                      '&:hover': { bgcolor: '#8f5602' }
                    }}
                  >
                    {adelantandoMensualidad ? 'Creando...' : 'Adelantar proximo mes'}
                  </Button>
                )}
              </span>
            </Tooltip>
          </Box>
          {loading ? (
            <Typography variant="body2" color="text.secondary">Cargando mensualidades...</Typography>
          ) : error ? (
            <Typography variant="body2" color="error">{error}</Typography>
          ) : pagosFiltrados.length === 0 ? (
            <Typography variant="body2" color="text.secondary">No hay pagos para mostrar.</Typography>
          ) : (
            pagosPagina.map((pago) => {
          const estado = normalizarEstado(pago.estado);
          const dateObj = new Date(pago.fecha + 'T00:00:00');
          const mesNombre = dateObj.toLocaleString('es-ES', { month: 'long', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
          const anio = dateObj.toLocaleString('es-ES', { year: 'numeric', timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
          const vencimiento = obtenerFechaVencimientoVisible(pago);
          const tieneVencimiento = vencimiento && !Number.isNaN(vencimiento.getTime());
          const diasRetraso = tieneVencimiento
            ? Math.max(0, Math.ceil((new Date().setHours(0, 0, 0, 0) - new Date(vencimiento.getFullYear(), vencimiento.getMonth(), vencimiento.getDate()).getTime()) / 86400000))
            : 0;

          const estadoUi = (() => {
            if (estado === 'retrasado' || estado === 'insolvente') {
              return {
                badge: 'VENCIDO',
                bg: '#fff5f5',
                border: '#f6d6d6',
                iconBg: '#fde2e2',
                icon: <ErrorIcon sx={{ color: '#dc2626', fontSize: 20 }} />,
                amountColor: '#dc2626',
                actionLabel: 'Pagar Ahora',
                actionBg: '#dc2626',
                actionHover: '#b91c1c',
                infoColor: '#b91c1c'
              };
            }

            if (estado === 'pendiente' || estado === 'abono' || estado === 'en revision') {
              return {
                badge: estado === 'en revision' ? 'EN REVISION' : (estado === 'abono' ? 'ABONO' : 'PENDIENTE'),
                bg: '#fffdf8',
                border: '#efe7dc',
                iconBg: '#fbe6cf',
                icon: <PendingActionsIcon sx={{ color: '#b45309', fontSize: 20 }} />,
                amountColor: '#0f172a',
                actionLabel: estado === 'en revision' ? 'Ver detalle' : 'Pagar Ahora',
                actionBg: estado === 'en revision' ? '#475569' : '#a16207',
                actionHover: estado === 'en revision' ? '#334155' : '#854d0e',
                infoColor: '#92400e'
              };
            }

            if (estado === 'pagado') {
              return {
                badge: 'PAGADO',
                bg: '#f6f8ff',
                border: '#e5e9f5',
                iconBg: '#86efac',
                icon: <CheckCircleIcon sx={{ color: '#166534', fontSize: 20 }} />,
                amountColor: '#a1a1aa',
                actionLabel: 'Ver Recibo',
                actionBg: 'transparent',
                actionHover: 'transparent',
                infoColor: '#64748b'
              };
            }

            if (estado === 'exonerado' || estado === 'exento por reposo') {
              return {
                badge: 'EXONERADO',
                bg: '#f0fdf4',
                border: '#dcfce7',
                iconBg: '#bbf7d0',
                icon: <SchoolIcon sx={{ color: '#15803d', fontSize: 20 }} />,
                amountColor: '#15803d',
                actionLabel: 'Ver detalle',
                actionBg: '#15803d',
                actionHover: '#166534',
                infoColor: '#15803d'
              };
            }

            return {
              badge: String(pago.estado || '-').toUpperCase(),
              bg: '#ffffff',
              border: '#e5e7eb',
              iconBg: '#e2e8f0',
              icon: <PaymentIcon sx={{ color: '#334155', fontSize: 20 }} />,
              amountColor: '#0f172a',
              actionLabel: 'Ver detalle',
              actionBg: '#475569',
              actionHover: '#334155',
              infoColor: '#64748b'
            };
          })();

          const subInfo = (() => {
            if (estado === 'abono') {
              return `Abonado: $${formatMoney(pago.total_pagado)} | Restante: $${formatMoney(pago.monto)}`;
            }

            if (estado === 'retrasado' || estado === 'insolvente') {
              return `Atrasado por ${diasRetraso || 1} ${diasRetraso === 1 ? 'dia' : 'dias'}`;
            }

            return tieneVencimiento ? `Vence: ${formatFechaBonita(vencimiento)}` : `Periodo: ${mesNombre} ${anio}`;
          })();

          const recargoAplicado = Math.max(0, Number(pago.recargo_aplicado_usd) || 0);
          const tieneRecargoAplicado = recargoAplicado > 0;
          const montoBaseSinRecargo = (() => {
            const baseRaw = Number(pago.monto_sin_recargo_usd);
            if (Number.isFinite(baseRaw) && baseRaw >= 0) return baseRaw;
            const totalRaw = Number(pago.monto_con_recargo_usd ?? pago.monto_total ?? pago.monto);
            if (Number.isFinite(totalRaw)) return Math.max(0, totalRaw - recargoAplicado);
            return 0;
          })();
          const fechaRecargoTexto = pago.fecha_aplicacion_recargo
            ? formatFechaBonita(pago.fecha_aplicacion_recargo)
            : null;

          const mostrarMontoEsperado = estado === 'pagado' || estado === 'en revision';
          const montoCard = mostrarMontoEsperado
            ? (Number(pago.monto_total) || Number(pago.monto) || 0)
            : pago.monto;
          const montoPagadoCard = Number(pago.total_pagado) || 0;

          const showPrimaryAction = estado === 'pendiente' || estado === 'retrasado' || estado === 'abono' || estado === 'insolvente';
          const fechaPeriodoActual = parseFechaSinDesfase(pago.fecha);
          const bloqueadoPorMesAnterior = showPrimaryAction && Boolean(fechaPeriodoActual) && mensualidades.some((item) => {
            if (String(item?.id || item?._id || '') === String(pago?.id || pago?._id || '')) return false;
            const estadoItem = normalizarEstado(item?.estado);
            if (!estadosBloqueantesOrdenPago.includes(estadoItem)) return false;
            const fechaPeriodoItem = parseFechaSinDesfase(item?.fecha);
            if (!fechaPeriodoItem) return false;
            return fechaPeriodoItem.getTime() < fechaPeriodoActual.getTime();
          });

          return (
            <Card
              key={pago.id}
              sx={{
                mb: 2,
                borderRadius: 4,
                border: `1px solid ${estadoUi.border}`,
                backgroundColor: estadoUi.bg,
                boxShadow: '0 8px 18px rgba(15, 23, 42, 0.05)'
              }}
            >
              <CardContent sx={{ px: { xs: 1.8, md: 2.25 }, py: { xs: 2.4, md: 2.8 }, '&:last-child': { pb: { xs: 2.4, md: 2.8 } } }}>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'auto 1fr auto' }, alignItems: 'center', gap: 1.5 }}>
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      backgroundColor: estadoUi.iconBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {estadoUi.icon}
                  </Box>

                  <Box sx={{ minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                      <Typography sx={{ fontWeight: 900, color: '#1f2937', fontSize: { xs: 18, md: 19 }, lineHeight: 1.1 }}>
                        Mensualidad {mesNombre} {anio}
                      </Typography>
                      <Chip
                        label={estadoUi.badge}
                        size="small"
                        sx={{
                          height: 22,
                          bgcolor: estado === 'retrasado' ? '#dc2626' : (estado === 'pagado' ? '#4ade80' : '#f6d3ad'),
                          color: estado === 'pagado' ? '#065f46' : (estado === 'retrasado' ? '#ffffff' : '#8a4b08'),
                          fontWeight: 800,
                          fontSize: 9
                        }}
                      />
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.8, flexWrap: 'wrap', mt: 0.5 }}>
                      <Typography sx={{ fontSize: 16, color: estadoUi.infoColor, fontWeight: 700 }}>
                        {subInfo}
                      </Typography>
                    </Box>
                    {tieneRecargoAplicado && (
                      <Box sx={{ mt: 0.6, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Chip
                          size="small"
                          label={`Recargo aplicado: +${simboloMonedaConfigurada}${formatMoney(recargoAplicado)} ${monedaConfigurada}`}
                          sx={{
                            height: 22,
                            bgcolor: '#fee2e2',
                            color: '#b91c1c',
                            fontWeight: 800,
                            fontSize: 12
                          }}
                        />
                        <Typography sx={{ fontSize: 12, color: '#b45309', fontWeight: 700 }}>
                          Base: {simboloMonedaConfigurada}{formatMoney(montoBaseSinRecargo)} {monedaConfigurada}{fechaRecargoTexto ? ` | Aplicado: ${fechaRecargoTexto}` : ''}
                        </Typography>
                      </Box>
                    )}
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: { xs: 'flex-start', sm: 'flex-end' }, gap: 0.7 }}>
                    <Typography sx={{ color: estadoUi.amountColor, fontWeight: 900, fontSize: { xs: 25, md: 27 }, lineHeight: 1 }}>
                      {simboloMonedaConfigurada}{formatMoney(montoCard)}
                    </Typography>
                    {Number(pago.credito_a_aplicar) > 0 && <Typography sx={{ fontSize: 12, color: '#047857', fontWeight: 700 }}>
                      Credito: -{simboloMonedaConfigurada}{formatMoney(pago.credito_a_aplicar)} {monedaConfigurada}
                    </Typography>}
                    {mostrarMontoEsperado && (
                      <Typography sx={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>
                        Monto esperado ({monedaConfigurada})
                      </Typography>
                    )}
                    {mostrarMontoEsperado && (
                      <Typography sx={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>
                        Pagado: {simboloMonedaConfigurada}{formatMoney(montoPagadoCard)} {monedaConfigurada}
                      </Typography>
                    )}

                    {showPrimaryAction ? (
                      <Tooltip
                        title={bloqueadoPorMesAnterior ? 'Debes pagar primero la mensualidad más antigua con deuda.' : ''}
                        arrow
                        disableHoverListener={!bloqueadoPorMesAnterior}
                        disableFocusListener={!bloqueadoPorMesAnterior}
                        disableTouchListener={!bloqueadoPorMesAnterior}
                      >
                        <span>
                          <Button
                            variant="contained"
                            size="small"
                            onClick={() => {
                              if (bloqueadoPorMesAnterior) return;
                              if (Number(pago.monto) === 0 && pago.credito_a_aplicar > 0) {
                                usarCreditoSinTransferencia(pago);
                                return;
                              }
                              setPagoSeleccionado(pago);
                              setOpenModalPago(true);
                            }}
                            disabled={bloqueadoPorMesAnterior || Boolean(aplicandoCreditoId)}
                            sx={{
                              borderRadius: 999,
                              px: 2,
                              py: 0.45,
                              fontSize: 12,
                              fontWeight: 800,
                              textTransform: 'none',
                              bgcolor: estadoUi.actionBg,
                              '&:hover': { bgcolor: estadoUi.actionHover }
                            }}
                          >
                            {aplicandoCreditoId === pago.id ? 'Aplicando...' : Number(pago.monto) === 0 && pago.credito_a_aplicar > 0 ? 'Usar saldo a favor' : estadoUi.actionLabel}
                          </Button>
                        </span>
                      </Tooltip>
                    ) : (
                      <Button
                        variant="text"
                        endIcon={<ArrowForwardIosIcon sx={{ fontSize: 13 }} />}
                        onClick={() => handleVerDetalle(pago)}
                        sx={{
                          color: '#8a4b08',
                          fontSize: 13,
                          fontWeight: 800,
                          textTransform: 'none',
                          px: 0,
                          minWidth: 'fit-content'
                        }}
                      >
                        {estadoUi.actionLabel}
                      </Button>
                    )}
                  </Box>
                </Box>
              </CardContent>
            </Card>
          );
            })
          )}
          {/* Controles de paginación */}
          {totalPaginas > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mt: 2 }}>
              <Button disabled={pagina === 1} onClick={() => setPagina(pagina - 1)}>Anterior</Button>
              {Array.from({ length: totalPaginas }, (_, i) => (
                <Button key={i + 1} variant={pagina === i + 1 ? 'contained' : 'outlined'} onClick={() => setPagina(i + 1)}>{i + 1}</Button>
              ))}
              <Button disabled={pagina === totalPaginas} onClick={() => setPagina(pagina + 1)}>Siguiente</Button>
            </Box>
          )}
        </Box>

        <Box sx={{ position: { md: 'sticky' }, top: { md: 24 }, width: '100%', maxWidth: { md: 320 }, justifySelf: { md: 'end' } }}>
          <Card
            sx={{
              mb: 1.75,
              borderRadius: 4,
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              boxShadow: '0 8px 20px rgba(15, 23, 42, 0.08)'
            }}
          >
            <CardContent sx={{ p: 2.25 }}>
              <Typography sx={{ fontSize: 12, letterSpacing: '0.08em', fontWeight: 800, color: '#475569' }}>
                ESTADO DE CUENTA
              </Typography>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mt: 1.4 }}>
                <Box
                  sx={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    backgroundColor: estadoCuenta.fondoIcono,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0
                  }}
                >
                  {estadoCuenta.icono}
                </Box>
                <Box>
                  <Typography sx={{ fontSize: { xs: 22, md: 24 }, lineHeight: 1, fontWeight: 900, color: '#0f172a' }}>{estadoCuenta.titulo}</Typography>
                  <Typography sx={{ mt: 0.3, fontSize: 13, fontWeight: 700, color: estadoCuenta.color }}>{estadoCuenta.subtitulo}</Typography>
                </Box>
              </Box>

              <Box sx={{ mt: 2.1, pt: 1.2, borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: 12, color: '#64748b' }}>Ultima mensualidad</Typography>
                <Typography sx={{ fontSize: 13, color: '#0f172a', fontWeight: 800 }}>
                  {ultimaMensualidadRegistrada ? formatFechaBonita(ultimaMensualidadRegistrada.fecha) : '-'}
                </Typography>
              </Box>
            </CardContent>
          </Card>

          <Card
            sx={{
              borderRadius: 4,
              background: 'linear-gradient(145deg, #cc6e00 0%, #e98300 100%)',
              color: '#ffffff',
              overflow: 'hidden',
              boxShadow: '0 16px 28px rgba(204, 110, 0, 0.32)'
            }}
          >
            <CardContent sx={{ p: 3, position: 'relative' }}>
              <Typography sx={{ fontSize: 13, letterSpacing: '0.08em', fontWeight: 800, opacity: 0.92 }}>
                BALANCE PENDIENTE
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 1.2 }}>
                <Typography sx={{ fontSize: { xs: 40, md: 42 }, lineHeight: 1, fontWeight: 900 }}>
                  {simboloMonedaConfigurada}{formatMoney(balancePendiente)}
                </Typography>
                <Typography sx={{ fontSize: 22, fontWeight: 600, opacity: 0.9 }}>{monedaConfigurada}</Typography>
              </Box>

              <Box
                sx={{
                  mt: 2,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.8,
                  px: 1.5,
                  py: 0.8,
                  borderRadius: 999,
                  bgcolor: 'rgba(255,255,255,0.24)',
                  backdropFilter: 'blur(2px)'
                }}
              >
                <AccessTimeIcon sx={{ fontSize: 14, opacity: 0.95 }} />
                <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{textoVencimiento}</Typography>
              </Box>

              <Box
                sx={{
                  position: 'absolute',
                  right: 16,
                  bottom: 16,
                  width: 74,
                  height: 74,
                  borderRadius: 3,
                  bgcolor: 'rgba(255,255,255,0.16)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <AccountBalanceWalletOutlinedIcon sx={{ fontSize: 38, color: 'rgba(255,255,255,0.45)' }} />
              </Box>
            </CardContent>
          </Card>

          <Card
            sx={{
              mt: 1.75,
              borderRadius: 4,
              background: 'linear-gradient(145deg, #0f766e 0%, #0d9488 100%)',
              color: '#ffffff',
              overflow: 'hidden',
              boxShadow: '0 16px 28px rgba(15, 118, 110, 0.3)'
            }}
          >
            <CardContent sx={{ p: 3, position: 'relative' }}>
              <Typography sx={{ fontSize: 13, letterSpacing: '0.08em', fontWeight: 800, opacity: 0.92 }}>
                SALDO A FAVOR DISPONIBLE
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mt: 1.2 }}>
                <Typography sx={{ fontSize: { xs: 40, md: 42 }, lineHeight: 1, fontWeight: 900 }}>
                  {simboloMonedaConfigurada}{formatMoney(saldoAFavorDisponible)}
                </Typography>
                <Typography sx={{ fontSize: 22, fontWeight: 600, opacity: 0.9 }}>{monedaConfigurada}</Typography>
              </Box>

              <Box
                sx={{
                  mt: 2,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.8,
                  px: 1.5,
                  py: 0.8,
                  borderRadius: 999,
                  bgcolor: 'rgba(255,255,255,0.24)',
                  backdropFilter: 'blur(2px)'
                }}
              >
                <SavingsOutlinedIcon sx={{ fontSize: 14, opacity: 0.95 }} />
                <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
                  {saldoAFavorDisponible > 0 ? 'Disponible para proximas cuotas' : 'Sin saldo a favor en este momento'}
                </Typography>
              </Box>

              <Box
                sx={{
                  position: 'absolute',
                  right: 16,
                  bottom: 16,
                  width: 74,
                  height: 74,
                  borderRadius: 3,
                  bgcolor: 'rgba(255,255,255,0.16)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <SavingsOutlinedIcon sx={{ fontSize: 38, color: 'rgba(255,255,255,0.45)' }} />
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Box>
      <Dialog
        open={modalDetalle}
        onClose={() => setModalDetalle(false)}
        aria-labelledby="detalle-pago-title"
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2, overflow: 'hidden', width: 'calc(100% - 24px)', maxWidth: 760, m: 1.5, maxHeight: 'calc(100% - 24px)', color: '#162647' } }}
      >
        <DialogTitle id="detalle-pago-title" sx={{ bgcolor: '#fff', px: { xs: 2, sm: 3 }, py: 1.75, display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Typography component="span" sx={{ fontSize: 14, fontWeight: 800 }}>Detalle del pago</Typography>
          <Chip size="small" label={String(grupoDetalle?.pago?.estado || mensualidadDetalle?.estado || 'Sin pago').replace('revision', 'revisión')} sx={{ height: 22, fontSize: 10, fontWeight: 700, bgcolor: estadoMensualidadDetalle === 'pagado' || grupoDetalle?.pago?.estado === 'Conciliado' ? '#e8f5ef' : '#fff3df', color: estadoMensualidadDetalle === 'pagado' || grupoDetalle?.pago?.estado === 'Conciliado' ? '#187863' : '#9a600b' }} />
          <IconButton aria-label="Cerrar detalle del pago" size="small" onClick={() => setModalDetalle(false)} sx={{ ml: 'auto', color: '#707b8e' }}>
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ bgcolor: '#fff', px: { xs: 2, sm: 3 }, pb: 0 }}>
          {idGrupoDetalle && (
            <Box component="section" aria-label="Transferencia agrupada" sx={{ mb: 2.5, minWidth: 0 }}>
              {errorGrupoDetalle ? <Alert severity="error" sx={{ mt: 1 }}>{errorGrupoDetalle}</Alert> : !grupoDetalle ? (
                <Typography role="status" sx={{ mt: 1 }}>Cargando transferencia...</Typography>
              ) : (
                <>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 1.5, mx: { xs: -2, sm: -3 }, px: { xs: 2, sm: 3 }, py: 2.5, bgcolor: '#13224a', color: '#fff' }}>
                    <Box sx={{ minWidth: 0, flex: '1 1 260px', overflowWrap: 'anywhere' }}>
                      <Typography sx={{ color: '#b7c4e2', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', mb: 0.6 }}>Transferencia agrupada · {grupoDetalle.pago.metodo_pago || detallePago?.metodo_pago}</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1.25, rowGap: 0.25 }}>
                        <Typography sx={{ fontWeight: 800, fontSize: { xs: 26, sm: 34 }, lineHeight: 1.15 }}>Bs {formatMoney(grupoDetalle.pago.monto_total_bs)}</Typography>
                        <Typography sx={{ fontWeight: 700, fontSize: 15, color: '#ffbe57' }}>{simboloMonedaConfigurada}{formatMoney(grupoDetalle.pago.monto_total)} {monedaConfigurada}</Typography>
                      </Box>
                      <Typography sx={{ fontSize: 10, mt: 0.9, color: '#b7c4e2', lineHeight: 1.6 }}>{grupoDetalle.pago.codigo} · {formatFechaBonita(grupoDetalle.pago.fecha_pago)} · Tasa {formatTasaAplicada(detallePago)}</Typography>
                    </Box>
                    {grupoDetalle.pago.estado === 'En revision' && (
                      <Button aria-label="Editar pago agrupado" variant="outlined" startIcon={<EditIcon sx={{ fontSize: 14 }} />} onClick={() => abrirModalEditarPago(detallePago)} sx={{ color: '#fff', borderColor: '#465476', bgcolor: '#ffffff0c', borderRadius: 1.5, fontSize: 11, textTransform: 'none', px: 1.5, py: 0.8, '&:hover': { borderColor: '#8796b9', bgcolor: '#ffffff18' } }}>
                        Editar pago
                      </Button>
                    )}
                  </Box>
                  <Typography sx={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 800, color: '#68758b', mt: 2.5, mb: 1 }}>Distribución por atleta</Typography>
                  <Box aria-hidden="true" sx={{ display: 'flex', height: 6, borderRadius: 1, overflow: 'hidden', bgcolor: '#d3daea', mb: 1.25 }}>
                    {grupoDetalle.asignaciones.map((item) => <Box key={item.id_pago} sx={{ width: `${grupoDetalle.pago.monto_total > 0 ? Number(item.monto_pagado) / grupoDetalle.pago.monto_total * 100 : 0}%`, bgcolor: String(item.id_mensualidad) === String(mensualidadDetalle?.id) ? '#e69a16' : '#c9d2e5' }} />)}
                  </Box>
                  <Box sx={{ border: '1px solid #edf0f5', borderRadius: 1.5, overflow: 'hidden' }}>
                    {grupoDetalle.asignaciones.map((item) => {
                      const esActual = String(item.id_mensualidad) === String(mensualidadDetalle?.id);
                      return <Box key={item.id_pago} sx={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 1, px: 1.5, py: 1.1, bgcolor: esActual ? '#fffbf2' : '#fff', borderLeft: `2px solid ${esActual ? '#e69a16' : 'transparent'}`, '& + &': { borderTop: '1px solid #edf0f5' } }}>
                        <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75 }}>
                            <Typography sx={{ fontWeight: 700, fontSize: 12 }}>{item.alumno_nombre}</Typography>
                            {esActual && <Chip size="small" label="Este alumno" sx={{ height: 17, fontSize: 9, fontWeight: 700, bgcolor: '#e69a16', color: '#fff', '& .MuiChip-label': { px: 0.75 } }} />}
                          </Box>
                          <Typography sx={{ fontSize: 10, color: '#748096', mt: 0.25 }}>Mensualidad {String(item.mes).padStart(2, '0')}/{item.anio}{esActual && Number(mensualidadDetalle?.recargo_aplicado_usd) > 0 ? ' · incluye recargo' : ''}</Typography>
                        </Box>
                        <Box sx={{ minWidth: 0, overflowWrap: 'anywhere', textAlign: 'right', alignSelf: 'center' }}>
                          <Typography sx={{ fontWeight: 700, fontSize: 12 }}>Bs {formatMoney(item.monto_pagado_bs)}</Typography>
                          <Typography sx={{ fontSize: 10, color: '#748096' }}>{simboloMonedaConfigurada}{formatMoney(item.monto_pagado)} {monedaConfigurada}</Typography>
                        </Box>
                      </Box>;
                    })}
                  </Box>
                </>
              )}
            </Box>
          )}
          {mensualidadDetalle && detallePago && (
            <Box component="section" aria-label="Resumen de la mensualidad" sx={{ mb: 2.5 }}>
              <Typography sx={{ fontSize: 10, textTransform: 'uppercase', color: '#68758b', fontWeight: 800, mb: 1 }}>Monto de {alumno?.nombres || 'este alumno'}</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: `repeat(${creditoAplicadoDetalle > 0 ? (ajusteDetalle !== 0 ? 6 : 5) : 4}, minmax(0, 1fr))` }, border: '1px solid #edf0f5', borderRadius: 1.5, overflow: 'hidden' }}>
                {[
                  { label: creditoAplicadoDetalle > 0 ? 'Monto base original' : 'Monto base', value: `${simboloMonedaConfigurada}${formatMoney(creditoAplicadoDetalle > 0 ? baseOriginalDetalle : baseNetaDetalle)}` },
                  ...(creditoAplicadoDetalle > 0 ? [{ label: 'Saldo a favor aplicado', value: `- ${simboloMonedaConfigurada}${formatMoney(creditoAplicadoDetalle)}`, detail: `Base neta: ${simboloMonedaConfigurada}${formatMoney(baseNetaDetalle)}`, color: '#16786e', bg: '#eaf6f2' }] : []),
                  ...(creditoAplicadoDetalle > 0 && ajusteDetalle !== 0 ? [{ label: 'Ajuste de mensualidad', value: `${ajusteDetalle > 0 ? '-' : '+'} ${simboloMonedaConfigurada}${formatMoney(Math.abs(ajusteDetalle))}` }] : []),
                  { label: `Recargo${mensualidadDetalle.fecha_aplicacion_recargo ? ` · ${formatFechaBonita(mensualidadDetalle.fecha_aplicacion_recargo)}` : ''}`, value: `+ ${simboloMonedaConfigurada}${formatMoney(mensualidadDetalle.recargo_aplicado_usd || 0)}`, color: '#a76809' },
                  { label: 'Total esperado', value: formatMontoEsperado(detallePago, mensualidadDetalle.monto_total ?? mensualidadDetalle.monto, true) },
                  { label: idGrupoDetalle ? 'Asignado a este alumno' : 'Monto pagado', value: `${simboloMonedaConfigurada}${formatMoney(detallePago.monto_pagado)}`, color: '#16786e', bg: '#eaf6f2' }
                ].map((item) => <Box key={item.label} sx={{ p: 1.4, bgcolor: item.bg || '#f9fafc', minWidth: 0, borderRight: '1px solid #edf0f5', borderBottom: { xs: '1px solid #edf0f5', sm: 0 } }}>
                  <Typography sx={{ fontSize: 10, color: '#748096', mb: 0.4 }}>{item.label}</Typography>
                  <Typography sx={{ fontSize: 12, fontWeight: 800, color: item.color || '#162647', overflowWrap: 'anywhere', lineHeight: 1.5 }}>{item.value}</Typography>
                  {item.detail && <Typography sx={{ fontSize: 10, color: '#748096', mt: 0.4, overflowWrap: 'anywhere' }}>{item.detail}</Typography>}
                </Box>)}
              </Box>
            </Box>
          )}

          {detallePago ? (
            <>
              <Typography sx={{ fontSize: 10, fontWeight: 800, color: '#68758b', mb: 1, textTransform: 'uppercase' }}>Datos del pago</Typography>
              <Box sx={{ pb: 2.5 }}>
                <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }, columnGap: 2 }}>
                  {[
                    ['Método', detallePago.metodo_pago || '-'],
                    ['Fecha de pago', formatFechaBonita(detallePago.fecha_pago)],
                    ['Referencia', <Box key="referencia" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5, minWidth: 0 }}>
                      <Box component="span" sx={{ overflowWrap: 'anywhere' }}>{detallePago.referencia || '-'}</Box>
                      {detallePago.referencia && <Tooltip title="Copiar referencia"><IconButton aria-label="Copiar referencia" size="small" onClick={() => copiarReferencia(detallePago.referencia)} sx={{ color: '#607491', p: 0.4 }}><ContentCopyIcon sx={{ fontSize: 13 }} /></IconButton></Tooltip>}
                    </Box>],
                    ['Tasa aplicada', formatTasaAplicada(detallePago)],
                    ['Teléfono', formatTelefonoPago(detallePago.telefono_pago) || '-'],
                    ['Cédula del titular', formatCedulaTitular(detallePago.cedula_titular) || '-'],
                    ['Comprobante', detallePago.comprobante_url ? <Button key="comprobante" size="small" startIcon={<InsertDriveFileIcon sx={{ fontSize: 14 }} />} onClick={() => handleVerComprobante(detallePago.comprobante_url)} sx={{ p: 0, fontSize: 11, textTransform: 'none', color: '#246c89' }}>Ver archivo</Button> : 'Sin adjuntar'],
                    ['Nota', String(detallePago.nota || '').trim() || '-']
                  ].map(([label, value]) => <Box key={label} sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, minWidth: 0, py: 1.1, borderBottom: '1px solid #f0f2f6' }}>
                    <Typography component="dt" sx={{ fontSize: 11, color: '#748096', flexShrink: 0 }}>{label}</Typography>
                    <Box component="dd" sx={{ m: 0, minWidth: 0, fontSize: 11, color: '#162647', fontWeight: 600, textAlign: 'right', overflowWrap: 'anywhere' }}>{value}</Box>
                  </Box>)}
                </Box>
                {detallePago.solicita_revision_recargo && <Chip size="small" label="Solicitud de revisión de recargo" sx={{ mt: 1, fontSize: 10, bgcolor: '#fff3df', color: '#9a600b' }} />}
                <Box sx={{ display: 'grid' }}>

                  {!idGrupoDetalle && usuarioPuedeEditarEliminarPago && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'flex-end', gap: 1.2, gridColumn: '1 / -1' }}>
                      <Button
                        variant="contained"
                        startIcon={<EditIcon fontSize="small" />}
                        onClick={() => abrirModalEditarPago(detallePago)}
                        sx={{ borderRadius: 999, px: 2.2, minWidth: 118, bgcolor: '#e5edf8', color: '#1165a4', boxShadow: 'none', fontWeight: 800, '&:hover': { bgcolor: '#d8e5f6', boxShadow: 'none' } }}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="contained"
                        startIcon={<DeleteOutlineIcon fontSize="small" />}
                        onClick={() => solicitarEliminarPago(detallePago)}
                        disabled={eliminandoPagoId === detallePago._id}
                        sx={{ borderRadius: 999, px: 2.2, minWidth: 118, bgcolor: '#f9e9e9', color: '#d32727', boxShadow: 'none', fontWeight: 800, '&:hover': { bgcolor: '#f6dddd', boxShadow: 'none' } }}
                      >
                        {eliminandoPagoId === detallePago._id ? 'Eliminando...' : 'Eliminar'}
                      </Button>
                    </Box>
                  )}
                </Box>
              </Box>
            </>
          ) : (
            <Typography sx={{ color: '#334155' }}>No hay informacion de pago registrada.</Typography>
          )}

          {pagosDetalle.length > 0 && (
            <Box sx={{ mx: { xs: -2, sm: -3 }, px: { xs: 2, sm: 3 }, py: 2, bgcolor: '#f6f8fc', borderTop: '1px solid #edf0f5' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 1.25 }}>
                  <Typography sx={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: '#68758b' }}>
                    {mensualidadDetalle?.id_alumno?.habilitar_pago_cuotas === true ? 'Historial de abonos' : 'Historial de pagos'}
                  </Typography>
                <Typography sx={{ color: '#748096', fontSize: 10 }}>{pagosDetalle.length} {pagosDetalle.length === 1 ? 'registro' : 'registros'}</Typography>
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {pagosDetalle.map((pago, idx) => (
                  <Box key={pago._id || idx} sx={{ bgcolor: '#fff', border: '1px solid #e9edf4', borderRadius: 1.5, p: 1.25, display: 'grid', gridTemplateColumns: { xs: '26px minmax(0, 1fr)', sm: '26px minmax(0, 1fr) auto auto' }, alignItems: 'center', gap: 1.1 }}>
                    <Box sx={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: '#13224a', color: '#fff', fontSize: 11, fontWeight: 700 }}>{idx + 1}</Box>
                    <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                      <Typography sx={{ fontWeight: 700, fontSize: 11 }}>{pago.metodo_pago || '-'} · Ref. {pago.referencia || '-'}</Typography>
                      <Typography sx={{ fontSize: 10, color: '#748096', mt: 0.25 }}>{formatFechaBonita(pago.fecha_pago)} · <Box component="span">{formatTasaAplicada(pago)}</Box>{pago.cedula_titular ? ` · ${formatCedulaTitular(pago.cedula_titular)}` : ''}</Typography>
                      {pago.telefono_pago && <Typography sx={{ fontSize: 10, color: '#748096' }}>Tel: {formatTelefonoPago(pago.telefono_pago)}</Typography>}
                      {pago.nota && <Typography sx={{ fontSize: 10, color: '#748096' }}>{pago.nota}</Typography>}
                      {pago.solicita_revision_recargo && <Chip size="small" label="Solicita revisión" sx={{ mt: 0.5, height: 20, fontSize: 9, bgcolor: '#fff3df', color: '#9a600b' }} />}
                    </Box>
                    <Box sx={{ minWidth: 0, textAlign: { xs: 'left', sm: 'right' }, overflowWrap: 'anywhere', gridColumn: { xs: '2', sm: 'auto' } }}>
                      <Typography sx={{ fontSize: 11, fontWeight: 700 }}>{formatMontoPrincipal(pago)}</Typography>
                      <Typography sx={{ fontSize: 10, color: '#748096' }}>{formatEquivalenteUsdDesdeBs(pago)}</Typography>
                      <Typography sx={{ fontSize: 9, color: '#748096' }}>Esperado: {formatMontoEsperado(pago, mensualidadDetalle?.monto_total ?? mensualidadDetalle?.monto, true)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.6, justifyContent: { xs: 'flex-start', md: 'flex-end' }, alignItems: 'center', height: '100%' }}>
                      {pago.comprobante_url && (
                        <IconButton size="small" onClick={() => handleVerComprobante(pago.comprobante_url)} sx={{ bgcolor: '#f3f4f6', '&:hover': { bgcolor: '#e9edf3' } }}>
                          <InsertDriveFileIcon fontSize="small" sx={{ color: '#4b5563' }} />
                        </IconButton>
                      )}
                      {puedeEditarPago(pago) && (
                        <Tooltip title={obtenerIdGrupo(pago) ? 'Editar pago agrupado' : 'Editar pago'}>
                          <IconButton aria-label={obtenerIdGrupo(pago) ? 'Editar grupo desde historial' : 'Editar pago desde historial'} size="small" onClick={() => abrirModalEditarPago(pago)} sx={{ border: '1px solid #e9edf4', borderRadius: 1, '&:hover': { bgcolor: '#f2f5fb' } }}>
                            <EditIcon sx={{ fontSize: 15, color: '#385581' }} />
                          </IconButton>
                        </Tooltip>
                      )}
                      {!obtenerIdGrupo(pago) && usuarioPuedeEditarEliminarPago && (
                          <Tooltip title="Eliminar pago"><span><IconButton aria-label="Eliminar" size="small" onClick={() => solicitarEliminarPago(pago)} disabled={eliminandoPagoId === pago._id} sx={{ border: '1px solid #f1dddd', borderRadius: 1, '&:hover': { bgcolor: '#fff1f1' } }}><DeleteOutlineIcon sx={{ fontSize: 15, color: '#c44444' }} /></IconButton></span></Tooltip>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 1.5, bgcolor: '#fff', borderTop: '1px solid #edf0f5' }}>
          <Button onClick={() => setModalDetalle(false)} variant="contained" sx={{ bgcolor: '#13224a', borderRadius: 1.5, fontSize: 11, px: 2, py: 0.85, textTransform: 'none', boxShadow: 'none', '&:hover': { bgcolor: '#223765', boxShadow: 'none' } }}>
            Volver
          </Button>
        </DialogActions>
      </Dialog>
      <PagoAgrupadoEditor
        open={Boolean(pagoAgrupadoEditandoId)}
        pagoId={pagoAgrupadoEditandoId}
        moneda={monedaConfigurada}
        onClose={() => setPagoAgrupadoEditandoId('')}
        onSaved={async () => {
          setPagoAgrupadoEditandoId('');
          fetchMensualidades();
          await actualizarDetalleMensualidad(mensualidadDetalle, true);
          setSuccessMessage('Transferencia agrupada actualizada para todos los atletas.');
        }}
      />
      <ModalPago
        open={openModalPago}
        onClose={() => setOpenModalPago(false)}
        pago={pagoSeleccionado}
        conceptoPago="mensualidades"
        onSuccess={(payloadPago) => {
          fetchMensualidades();
          const periodoTxt = construirPeriodoLegible(pagoSeleccionado);
          const monedaSimbolo = payloadPago?.moneda === 'EUR' ? '€' : '$';
          const montoMonedaTxt = payloadPago?.montoPagadoMoneda != null
            ? `${monedaSimbolo}${Number(payloadPago.montoPagadoMoneda).toFixed(2)} ${payloadPago.moneda || monedaConfigurada}`
            : `${simboloMonedaConfigurada}${Number(pagoSeleccionado?.monto || 0).toFixed(2)} ${monedaConfigurada}`;
          const montoBsTxt = payloadPago?.montoPagadoBs != null
            ? `Bs ${Number(payloadPago.montoPagadoBs).toFixed(2)}`
            : '';

          setPagoSuccessData({
            alumnoNombre: `${alumno?.nombres || alumno?.nombre || ''} ${alumno?.apellidos || alumno?.apellido || ''}`.trim(),
            periodo: periodoTxt,
            montoMoneda: montoMonedaTxt,
            montoBs: montoBsTxt,
            tasaBcv: payloadPago?.tasaPago ? Number(payloadPago.tasaPago).toFixed(2) : (tasa ? Number(tasa).toFixed(2) : null),
            metodoPago: payloadPago?.metodoPago || '-',
            referencia: payloadPago?.referencia || '',
            fechaPago: payloadPago?.fechaPago
              ? (payloadPago.fechaPago.includes('-') ? payloadPago.fechaPago.split('-').reverse().join('/') : payloadPago.fechaPago)
              : new Date().toLocaleDateString('es-VE'),
            comprobanteNombre: payloadPago?.comprobanteNombre || ''
          });
          setPagoSuccessDialogOpen(true);
        }}
      />
      <Dialog
        open={modalEditarOpen}
        onClose={() => {
          if (!guardandoEdicion) {
            setModalEditarOpen(false);
            setErrorEdicion('');
          }
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle
          disableTypography
          sx={{
            p: 3,
            pb: 1.5,
            backgroundColor: '#ffffff'
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 2,
                backgroundColor: '#fff2e7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <PaymentIcon sx={{ color: '#ff7a00' }} />
            </Box>
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a' }}>
                Editar Pago
              </Typography>
              <Typography variant="body2" sx={{ color: '#94a3b8', mt: 0.25 }}>
                Corrige los datos del pago y guarda los cambios.
              </Typography>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: 3, pt: 1.5, bgcolor: '#f8fafc' }}>
          {!!errorEdicion && (
            <Alert severity="error" sx={{ mb: 1.5 }}>
              {errorEdicion}
            </Alert>
          )}
          <TextField
            select
            label="Método de pago"
            value={metodoPago}
            onChange={(e) => {
              const nuevoMetodo = normalizeMetodoPago(e.target.value);
              setMetodoPago(nuevoMetodo);
              if (!metodoRequiereReferencia(nuevoMetodo)) setReferencia('');
              setErrorRef('');
            }}
            fullWidth
            margin="normal"
            size="small"
            sx={inputSx}
          >
            {metodosPago.map((metodo) => (
              <MenuItem key={metodo} value={metodo}>{metodo}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="¿Cuándo hiciste el pago?"
            type="date"
            value={fechaPago}
            onChange={(e) => setFechaPago(e.target.value)}
            fullWidth
            margin="normal"
            size="small"
            sx={inputSx}
            InputLabelProps={{ shrink: true }}
          />
          <Typography variant="caption" sx={{ mt: 0.25, mb: 1, color: '#94a3b8', display: 'block' }}>
            Tasa aplicada: {tasaPagoHistorica ? `${formatMoney(tasaPagoHistorica)} ${etiquetaTasa}` : 'No disponible'}
          </Typography>
          <TextField
            label="Monto pagado (Bs)"
            type="number"
            value={montoPagoBs}
            onChange={(e) => setMontoPagoBs(e.target.value)}
            fullWidth
            margin="normal"
            size="small"
            sx={inputSx}
            inputProps={{ min: 0, step: '0.01' }}
          />
          <Typography variant="caption" sx={{ color: '#64748b', mt: -0.35, mb: 0.5, display: 'block' }}>
            {equivalenteUsdDesdeBs
              ? `Con tasa de ${formatMoney(tasaPagoHistorica)} ${etiquetaTasa}, este monto equivale a $${formatMoney(equivalenteUsdDesdeBs)} ${monedaConfigurada}.`
              : 'Equivalente no disponible hasta tener una tasa valida para la fecha seleccionada.'}
          </Typography>
          {metodoRequiereReferencia(metodoPago) && (
            <TextField
              label="6 últimos dígitos de referencia"
              value={referencia}
              onChange={(e) => setReferencia(e.target.value.replace(/[^0-9]/g, ''))}
              fullWidth
              margin="normal"
              size="small"
              sx={inputSx}
              inputProps={{ maxLength: 6 }}
              error={!!errorRef}
              helperText={errorRef}
            />
          )}
          <TextField
            label="Teléfono de pago"
            value={telefonoPago}
            onChange={(e) => setTelefonoPago(e.target.value.replace(/\D/g, '').slice(0, 10))}
            fullWidth
            margin="normal"
            size="small"
            sx={inputSx}
            inputProps={{ inputMode: 'numeric', pattern: '[0-9]*', maxLength: 10 }}
          />
          <Typography variant="caption" sx={{ color: '#64748b', mt: -0.35, mb: 0.5, display: 'block' }}>
            Sin el 0 adelante. Este campo es obligatorio.
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '76px 1fr' }, gap: 1, mt: 1 }}>
            <TextField
              select
              label="Tipo"
              value={tipoCedulaTitular}
              onChange={(e) => setTipoCedulaTitular(String(e.target.value || 'V').toUpperCase())}
              fullWidth
              margin="normal"
              size="small"
              sx={inputSx}
            >
              {['V', 'E', 'J', 'G'].map((tipo) => (
                <MenuItem key={tipo} value={tipo}>{tipo}</MenuItem>
              ))}
            </TextField>
            <TextField
              label="Cédula del titular"
              value={cedulaTitular}
              onChange={(e) => setCedulaTitular(e.target.value.replace(/\D/g, ''))}
              fullWidth
              margin="normal"
              size="small"
              sx={inputSx}
              inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
            />
          </Box>
          <TextField
            label="Nota para administración (opcional)"
            value={notaPago}
            onChange={(e) => setNotaPago(e.target.value.slice(0, 500))}
            fullWidth
            multiline
            minRows={2}
            margin="normal"
            size="small"
            sx={inputSx}
          />
          {Number(mensualidadDetalle?.recargo_aplicado_usd || 0) > 0 && (
            <Box sx={{ mt: 0.2 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#475569', fontSize: 14 }}>
                <input
                  type="checkbox"
                  checked={solicitaRevisionRecargo}
                  onChange={(e) => setSolicitaRevisionRecargo(e.target.checked)}
                />
                Solicitar revision de recargo para este pago
              </label>
            </Box>
          )}
          <Box
            component="label"
            sx={{
              mt: 2,
              border: '1px dashed #cbd5f0',
              borderRadius: 2,
              p: 2,
              textAlign: 'center',
              backgroundColor: '#f8fafc',
              display: 'block',
              cursor: 'pointer'
            }}
          >
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                backgroundColor: '#fff2e7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mx: 'auto',
                mb: 1
              }}
            >
              <PaymentIcon sx={{ color: '#ff7a00', fontSize: 18 }} />
            </Box>
            <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>Haz clic para adjuntar comprobante</Typography>
            <Typography variant="caption" sx={{ color: '#94a3b8' }}>PNG, JPG hasta 5MB</Typography>
            <input type="file" hidden onChange={(e) => { setComprobante(e.target.files[0]); setQuitarComprobanteActual(false); }} />
          </Box>
          {comprobante && (
            <Box sx={{ mt: 1.5, px: 1.5, py: 1, border: '1px solid #e2e8f0', borderRadius: 2, bgcolor: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                <InsertDriveFileIcon sx={{ color: '#fb923c', fontSize: 18 }} />
                <Typography variant="body2" sx={{ color: '#475569', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {comprobante.name}
                </Typography>
              </Box>
              <IconButton size="small" onClick={() => setComprobante(null)}>
                <CloseIcon sx={{ fontSize: 16, color: '#94a3b8' }} />
              </IconButton>
            </Box>
          )}
          {editandoPago?.comprobante_url && !comprobante && (
            <Box sx={{ mt: 1.5, p: 1.25, borderRadius: 2, border: '1px solid #e2e8f0', bgcolor: '#ffffff' }}>
              <Typography variant="body2" sx={{ color: '#64748b', mb: 0.75 }}>Hay un comprobante asociado a este pago.</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                <Button size="small" onClick={() => handleVerComprobante(editandoPago.comprobante_url)}>Ver actual</Button>
                <Button size="small" color={quitarComprobanteActual ? 'success' : 'error'} onClick={() => setQuitarComprobanteActual((prev) => !prev)}>
                  {quitarComprobanteActual ? 'Deshacer quitar comprobante' : 'Quitar comprobante actual'}
                </Button>
              </Box>
              {quitarComprobanteActual && (
                <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: '#b91c1c' }}>
                  Al guardar, este pago quedará sin comprobante.
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, pt: 1, justifyContent: 'flex-end', gap: 1.5 }}>
          <Button
            onClick={() => {
              setModalEditarOpen(false);
              setErrorEdicion('');
            }}
            disabled={guardandoEdicion}
            sx={{ color: '#64748b', fontWeight: 700 }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={guardarEdicionPago}
            disabled={guardandoEdicion || !camposObligatoriosEdicionCompletos}
            sx={{ bgcolor: '#ff7a00', '&:hover': { bgcolor: '#f97316' }, fontWeight: 800, borderRadius: 2, px: 3 }}
          >
            {guardandoEdicion ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={confirmarEliminarOpen}
        onClose={() => {
          if (eliminandoPagoId) return;
          setConfirmarEliminarOpen(false);
          setPagoAEliminar(null);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#b91c1c' }}>Eliminar pago</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#334155' }}>
            ¿Seguro que deseas eliminar este pago? Esta acción recalculará el estado de la mensualidad y no se puede deshacer.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setConfirmarEliminarOpen(false);
              setPagoAEliminar(null);
            }}
            disabled={!!eliminandoPagoId}
          >
            Cancelar
          </Button>
          <Button variant="contained" color="error" onClick={eliminarPago} disabled={!!eliminandoPagoId}>
            {eliminandoPagoId ? 'Eliminando...' : 'Eliminar pago'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={confirmarAdelantoOpen}
        onClose={() => {
          if (adelantandoMensualidad) return;
          setConfirmarAdelantoOpen(false);
        }}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0f172a' }}>Adelantar mensualidad</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#334155' }}>
            ¿Estas seguro de adelantar la factura del proximo mes?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmarAdelantoOpen(false)}
            disabled={adelantandoMensualidad}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              setConfirmarAdelantoOpen(false);
              await adelantarSiguienteMensualidad();
            }}
            disabled={adelantandoMensualidad}
          >
            {adelantandoMensualidad ? 'Procesando...' : 'Si, adelantar'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={pagoSuccessDialogOpen}
        onClose={() => {
          setPagoSuccessDialogOpen(false);
          setPagoSuccessData(null);
        }}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3.5,
            textAlign: 'center',
            m: { xs: 2, sm: 4 },
            width: { xs: 'calc(100% - 32px)', sm: 'calc(100% - 64px)' },
            p: { xs: 0, sm: 2.5 }
          }
        }}
      >
        <DialogContent sx={{ px: { xs: 2, sm: 3 }, pt: { xs: 2, sm: 1 }, pb: 1.25, minWidth: 0, overflowWrap: 'anywhere' }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
            <CheckCircleRoundedIcon sx={{ fontSize: 64, color: '#10b981' }} />
          </Box>

          <Typography sx={{ fontWeight: 900, color: '#0f172a', mb: 0.8, letterSpacing: 0.3, fontSize: { xs: 18, sm: 20 } }}>
            PAGO REGISTRADO EXITOSAMENTE
          </Typography>

          <Typography variant="body2" sx={{ color: '#475569', mb: 1.8 }}>
            Tu pago ha sido registrado y enviado a revisión. El administrador validará el comprobante en breve.
          </Typography>

          <Box
            sx={{
              textAlign: 'left',
              border: '1px solid #e2e8f0',
              borderRadius: 2.5,
              backgroundColor: '#f8fafc',
              p: 1.6,
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr)',
              gap: 0.8,
              mb: 1.2,
              '& > .MuiBox-root': {
                minWidth: 0,
                gap: { xs: 0.5, sm: 2 },
                flexDirection: { xs: 'column', sm: 'row' },
                alignItems: { xs: 'flex-start', sm: 'center' }
              },
              '& > .MuiBox-root > .MuiTypography-caption': {
                flexShrink: 0
              },
              '& > .MuiBox-root > :last-child': {
                minWidth: 0,
                maxWidth: { xs: '100%', sm: '60%' },
                whiteSpace: 'normal',
                overflowWrap: 'anywhere',
                textAlign: { xs: 'left', sm: 'right' }
              }
            }}
          >
            {pagoSuccessData?.alumnoNombre && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #edf2f7', pb: 0.8 }}>
                <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                  Alumno
                </Typography>
                <Typography variant="body2" sx={{ color: '#0f172a', fontWeight: 800 }}>
                  {pagoSuccessData.alumnoNombre}
                </Typography>
              </Box>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #edf2f7', pb: 0.8 }}>
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                Periodo / Concepto
              </Typography>
              <Typography variant="body2" sx={{ color: '#0f172a', fontWeight: 800 }}>
                {pagoSuccessData?.periodo || 'Mensualidad'}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #edf2f7', pb: 0.8 }}>
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                Monto reportado
              </Typography>
              <Box sx={{ textAlign: 'right' }}>
                <Typography variant="body2" sx={{ color: '#059669', fontWeight: 900, fontSize: 16 }}>
                  {pagoSuccessData?.montoMoneda || '$0.00'}
                </Typography>
                {pagoSuccessData?.montoBs && (
                  <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>
                    {pagoSuccessData.montoBs} {pagoSuccessData?.tasaBcv ? `· Tasa: ${pagoSuccessData.tasaBcv}` : ''}
                  </Typography>
                )}
              </Box>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #edf2f7', pb: 0.8 }}>
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                Método de pago
              </Typography>
              <Typography variant="body2" sx={{ color: '#0f172a', fontWeight: 800 }}>
                {pagoSuccessData?.metodoPago || '-'}
              </Typography>
            </Box>

            {!!pagoSuccessData?.referencia && pagoSuccessData.referencia !== '-' && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #edf2f7', pb: 0.8 }}>
                <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                  Referencia
                </Typography>
                <Typography variant="body2" sx={{ color: '#0f172a', fontWeight: 800 }}>
                  {pagoSuccessData.referencia}
                </Typography>
              </Box>
            )}

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', ...(pagoSuccessData?.comprobanteNombre ? { borderBottom: '1px solid #edf2f7', pb: 0.8 } : {}) }}>
              <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                Fecha de pago
              </Typography>
              <Typography variant="body2" sx={{ color: '#0f172a', fontWeight: 800 }}>
                {pagoSuccessData?.fechaPago || '-'}
              </Typography>
            </Box>

            {!!pagoSuccessData?.comprobanteNombre && (
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                  Comprobante
                </Typography>
                <Typography variant="body2" sx={{ color: '#0284c7', fontWeight: 700 }}>
                  {pagoSuccessData.comprobanteNombre}
                </Typography>
              </Box>
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ justifyContent: 'center', pt: 0.5, pb: { xs: 2, sm: 0.5 } }}>
          <Button
            variant="contained"
            onClick={() => {
              setPagoSuccessDialogOpen(false);
              setPagoSuccessData(null);
            }}
            sx={{
              minWidth: 150,
              fontWeight: 800,
              borderRadius: 999,
              textTransform: 'none',
              bgcolor: '#0f172a',
              '&:hover': {
                bgcolor: '#1e293b'
              }
            }}
          >
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={!!successMessage}
        autoHideDuration={3000}
        onClose={() => setSuccessMessage('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setSuccessMessage('')} severity="success" sx={{ width: '100%' }}>
          {successMessage}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default PagosAlumno;
