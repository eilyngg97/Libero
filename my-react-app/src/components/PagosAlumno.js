import React, { useState, useEffect } from 'react';
import { Card, CardContent, Typography, Box, Button, Chip, Snackbar, Alert, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, TextField, MenuItem, Tooltip } from '@mui/material';
import { useLocation } from 'react-router-dom';
import ModalPago from './ModalPago';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
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
import { obtenerTasaOficialPorFecha } from '../utils/dolarHistorico';
import { normalizeMetodoPago, metodoRequiereReferencia } from '../utils/paymentMethod';

// Eliminar pagosEjemplo, usaremos datos reales

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
  const matchIso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (matchIso) {
    const year = Number(matchIso[1]);
    const month = Number(matchIso[2]);
    const day = Number(matchIso[3]);
    const fecha = new Date(year, month - 1, day);
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }

  const fecha = new Date(value);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
};

function PagosAlumno(props) {
  const metodosPago = ['Pago movil', 'Transferencia', 'Efectivo'];

  const { dolar } = useDolar();
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

  const mapMensualidadToPagoItem = (m) => ({
    id: m._id,
    _id: m._id,
    id_alumno: m.id_alumno,
    fecha: `${m.anio}-${String(m.mes).padStart(2, '0')}-01`,
    fecha_vencimiento: m.fecha_vencimiento,
    monto: m.saldo_pendiente ?? m.monto_esperado,
    monto_total: m.monto_total ?? m.monto_esperado,
    total_pagado: m.total_pagado || 0,
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
    fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades?id_alumno=${alumno._id}`, {
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
  }, [fetchMensualidades]);

  useEffect(() => {
    if (!modalEditarOpen || !fechaPago) return;

    let cancelled = false;

    const cargarTasaHistorica = async () => {
      try {
        const tasaHistorica = await obtenerTasaOficialPorFecha(fechaPago, Number(tasa) || null);
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
  }, [modalEditarOpen, fechaPago, tasa]);

  const pagosOrdenados = [...mensualidades].sort(
    (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
  );

  const normalizarEstado = (value) => String(value || '').trim().toLowerCase();
  const esAlumnoBecado = String(alumno?.tipo_mensualidad || '').toLowerCase() === 'beca_completa';
  const tieneMensualidadBecado = mensualidades.some((m) => normalizarEstado(m?.estado) === 'becado');
  const bloqueaAdelantoPorBeca = esAlumnoBecado || tieneMensualidadBecado;
  const estadoMensualidadDetalle = normalizarEstado(mensualidadDetalle?.estado);
  const usuarioPuedeEditarEliminarPago = ['insolvente', 'retrasado', 'pendiente', 'en revision'].includes(estadoMensualidadDetalle);

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

    return `$${formatMoney(pago?.monto_pagado)} USD`;
  };

  const formatMontoEsperado = (pago, fallbackMontoUsd = null, preferirMontoActual = false) => {
    if (preferirMontoActual) {
      const montoActualUsd = Number(fallbackMontoUsd);
      if (Number.isFinite(montoActualUsd) && montoActualUsd >= 0) {
        const montoPagoUsd = Number(pago?.monto_pagado);
        const montoPagoBs = Number(pago?.monto_pagado_bs);
        const tasaAplicada = (Number.isFinite(montoPagoUsd) && montoPagoUsd > 0 && Number.isFinite(montoPagoBs) && montoPagoBs > 0)
          ? (montoPagoBs / montoPagoUsd)
          : null;

        if (Number.isFinite(tasaAplicada) && tasaAplicada > 0) {
          const montoActualBs = montoActualUsd * tasaAplicada;
          return `Bs ${formatMoney(montoActualBs)} / $${formatMoney(montoActualUsd)} USD`;
        }

        return `$${formatMoney(montoActualUsd)} USD`;
      }
    }

    const montoBs = Number(pago?.monto_esperado_bs);
    const montoUsd = Number.isFinite(Number(pago?.monto_esperado_usd))
      ? Number(pago?.monto_esperado_usd)
      : Number(fallbackMontoUsd);

    if (Number.isFinite(montoBs) && montoBs > 0 && Number.isFinite(montoUsd) && montoUsd > 0) {
      return `Bs ${formatMoney(montoBs)} / $${formatMoney(montoUsd)} USD`;
    }

    if (Number.isFinite(montoBs) && montoBs > 0) {
      return `Bs ${formatMoney(montoBs)}`;
    }

    if (Number.isFinite(montoUsd) && montoUsd > 0) {
      return `$${formatMoney(montoUsd)} USD`;
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

    return `$${formatMoney(montoBs / tasaAplicada)} USD`;
  };

  const formatTasaAplicada = (pago) => {
    const montoUsd = Number(pago?.monto_pagado);
    const montoBs = Number(pago?.monto_pagado_bs);
    if (!montoUsd || Number.isNaN(montoUsd) || !montoBs || Number.isNaN(montoBs)) {
      return '-';
    }
    return `${formatMoney(montoBs / montoUsd)} Bs/USD`;
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
  const saldoAFavorDisponible = Math.max(0, Number(alumno?.saldo_a_favor_mensualidades) || 0);
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
                          label={`Recargo aplicado: +$${formatMoney(recargoAplicado)} USD`}
                          sx={{
                            height: 22,
                            bgcolor: '#fee2e2',
                            color: '#b91c1c',
                            fontWeight: 800,
                            fontSize: 12
                          }}
                        />
                        <Typography sx={{ fontSize: 12, color: '#b45309', fontWeight: 700 }}>
                          Base: ${formatMoney(montoBaseSinRecargo)} USD{fechaRecargoTexto ? ` | Aplicado: ${fechaRecargoTexto}` : ''}
                        </Typography>
                      </Box>
                    )}
                  </Box>

                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: { xs: 'flex-start', sm: 'flex-end' }, gap: 0.7 }}>
                    <Typography sx={{ color: estadoUi.amountColor, fontWeight: 900, fontSize: { xs: 25, md: 27 }, lineHeight: 1 }}>
                      ${formatMoney(montoCard)}
                    </Typography>
                    {mostrarMontoEsperado && (
                      <Typography sx={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>
                        Monto esperado (USD)
                      </Typography>
                    )}
                    {mostrarMontoEsperado && (
                      <Typography sx={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>
                        Pagado: ${formatMoney(montoPagadoCard)} USD
                      </Typography>
                    )}

                    {showPrimaryAction ? (
                      <Button
                        variant="contained"
                        size="small"
                        onClick={() => { setPagoSeleccionado(pago); setOpenModalPago(true); }}
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
                        {estadoUi.actionLabel}
                      </Button>
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
                  ${formatMoney(balancePendiente)}
                </Typography>
                <Typography sx={{ fontSize: 22, fontWeight: 600, opacity: 0.9 }}>USD</Typography>
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
                  ${formatMoney(saldoAFavorDisponible)}
                </Typography>
                <Typography sx={{ fontSize: 22, fontWeight: 600, opacity: 0.9 }}>USD</Typography>
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
        maxWidth="lg"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
      >
        <DialogTitle sx={{ bgcolor: '#f3f5fb', color: '#0b2a57', fontWeight: 800, fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Detalle del Pago
          <IconButton size="small" onClick={() => setModalDetalle(false)} sx={{ color: '#6b7280' }}>
            &times;
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ bgcolor: '#f3f5fb', pt: 2.5, pb: 2.5 }}>
          {mensualidadDetalle && Number(mensualidadDetalle.recargo_aplicado_usd || 0) > 0 && (
            <Box
              sx={{
                mb: 2,
                bgcolor: '#fff7ed',
                border: '1px solid #fed7aa',
                borderRadius: 2,
                p: 1.5
              }}
            >
              <Typography sx={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#9a3412', fontWeight: 800 }}>
                Desglose de recargo
              </Typography>
              <Typography sx={{ mt: 0.6, color: '#7c2d12', fontWeight: 700, fontSize: 13 }}>
                Monto base: ${formatMoney(mensualidadDetalle.monto_sin_recargo_usd || 0)} USD | Recargo: ${formatMoney(mensualidadDetalle.recargo_aplicado_usd || 0)} USD | Total: ${formatMoney(mensualidadDetalle.monto_con_recargo_usd || mensualidadDetalle.monto_total || 0)} USD
              </Typography>
              {mensualidadDetalle.fecha_aplicacion_recargo && (
                <Typography sx={{ mt: 0.4, color: '#9a3412', fontSize: 12, fontWeight: 600 }}>
                  Aplicado: {formatFechaBonita(mensualidadDetalle.fecha_aplicacion_recargo)}
                </Typography>
              )}
            </Box>
          )}

          {detallePago ? (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <Box sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: '#dbeafe', color: '#0b2a57', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>✓</Box>
                <Typography sx={{ fontSize: { xs: 16, sm: 19 }, fontWeight: 900, color: '#0b2a57', lineHeight: 1.1 }}>Último Pago Registrado</Typography>
              </Box>

              <Box
                sx={{
                  position: 'relative',
                  bgcolor: '#ffffff',
                  borderRadius: 2.5,
                  border: '1px solid #e7eaf2',
                  p: { xs: 2, sm: 3 },
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 7,
                    borderTopLeftRadius: 10,
                    borderTopRightRadius: 10,
                    background: 'linear-gradient(90deg, #ff8a00 0%, #8a4b00 100%)'
                  }
                }}
              >
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, columnGap: 4.5, rowGap: 2.25, pt: 1.75 }}>
                  <Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Metodo de pago</Typography>
                    <Typography sx={{ mt: 0.7, fontSize: { xs: 14, sm: 16 }, fontWeight: 800, color: '#0b2a57', lineHeight: 1.12 }}>{detallePago.metodo_pago || '-'}</Typography>
                  </Box>

                  <Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Monto pagado</Typography>
                    <Typography sx={{ mt: 0.7, fontSize: { xs: 17, sm: 20 }, fontWeight: 900, color: '#9a5a00', lineHeight: 1.1 }}>{formatMontoPrincipal(detallePago)}</Typography>
                    {formatEquivalenteUsdDesdeBs(detallePago) && (
                      <Typography sx={{ mt: 0.45, fontSize: 13, fontWeight: 700, color: '#64748b', lineHeight: 1.2 }}>
                        Equivalente: {formatEquivalenteUsdDesdeBs(detallePago)}
                      </Typography>
                    )}
                  </Box>

                  <Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Monto esperado</Typography>
                    <Typography sx={{ mt: 0.7, fontSize: { xs: 14, sm: 16 }, fontWeight: 800, color: '#0b2a57', lineHeight: 1.12 }}>{formatMontoEsperado(detallePago, mensualidadDetalle?.monto_total ?? mensualidadDetalle?.monto, true)}</Typography>
                  </Box>

                  <Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Fecha de pago</Typography>
                    <Typography sx={{ mt: 0.7, fontSize: { xs: 15, sm: 17 }, fontWeight: 800, color: '#0b2a57', lineHeight: 1.12 }}>{formatFechaBonita(detallePago.fecha_pago)}</Typography>
                  </Box>

                  <Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Tasa aplicada</Typography>
                    <Typography sx={{ mt: 0.7, fontSize: { xs: 15, sm: 17 }, fontWeight: 800, color: '#0b2a57', lineHeight: 1.12 }}>{formatTasaAplicada(detallePago)}</Typography>
                  </Box>

                  <Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Referencia</Typography>
                    <Box sx={{ mt: 0.7, display: 'flex', alignItems: 'center', gap: 0.4 }}>
                      <Typography sx={{ fontSize: { xs: 15, sm: 17 }, fontWeight: 800, color: '#4c6690', lineHeight: 1.12 }}>{detallePago.referencia || '-'}</Typography>
                      {detallePago.referencia && (
                        <IconButton size="small" onClick={() => copiarReferencia(detallePago.referencia)} sx={{ color: '#95a2b6' }}>
                          <ContentCopyIcon fontSize="inherit" />
                        </IconButton>
                      )}
                    </Box>
                  </Box>

                  {String(detallePago.telefono_pago || '').trim() && (
                    <Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
                      <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Telefono de pago</Typography>
                      <Typography sx={{ mt: 0.7, fontSize: { xs: 15, sm: 17 }, fontWeight: 800, color: '#0b2a57', lineHeight: 1.12 }}>
                        {formatTelefonoPago(detallePago.telefono_pago)}
                      </Typography>
                    </Box>
                  )}

                  {String(detallePago.cedula_titular || '').trim() && (
                    <Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
                      <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Cédula del titular</Typography>
                      <Typography sx={{ mt: 0.7, fontSize: { xs: 15, sm: 17 }, fontWeight: 800, color: '#0b2a57', lineHeight: 1.12 }}>
                        {formatCedulaTitular(detallePago.cedula_titular)}
                      </Typography>
                    </Box>
                  )}

                  <Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Nota</Typography>
                    <Typography sx={{ mt: 0.7, color: '#334155', fontWeight: 700, lineHeight: 1.3 }}>
                      {String(detallePago.nota || '').trim() || '-'}
                    </Typography>
                    {detallePago.solicita_revision_recargo && (
                      <Chip size="small" label="Solicitud de revision de recargo" sx={{ mt: 0.8, bgcolor: '#fff7ed', color: '#9a3412', fontWeight: 800 }} />
                    )}
                  </Box>

                  <Box>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Comprobante</Typography>
                    {detallePago.comprobante_url ? (
                      <Button
                        variant="text"
                        startIcon={<InsertDriveFileIcon fontSize="small" />}
                        onClick={() => handleVerComprobante(detallePago.comprobante_url)}
                        sx={{ mt: 0.35, px: 0, color: '#ff8a00', fontWeight: 900, textTransform: 'none', fontSize: { xs: 14, sm: 16 } }}
                      >
                        Ver Archivo Digital
                      </Button>
                    ) : (
                      <Typography sx={{ mt: 0.7, color: '#9ca3af', fontWeight: 700 }}>Sin comprobante</Typography>
                    )}
                  </Box>

                  {usuarioPuedeEditarEliminarPago && (
                    <Box sx={{ display: 'flex', justifyContent: { xs: 'flex-start', md: 'flex-end' }, alignItems: 'flex-end', gap: 1.2, gridColumn: { md: '2 / 3' } }}>
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
            <Box sx={{ mt: 3.25 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.25 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <HistoryRoundedIcon sx={{ color: '#8ea0bc', fontSize: 19 }} />
                  <Typography sx={{ fontSize: { xs: 16, sm: 19 }, fontWeight: 900, color: '#0b2a57', lineHeight: 1.15 }}>
                    {mensualidadDetalle?.id_alumno?.habilitar_pago_cuotas === true ? 'Historial de abonos' : 'Historial de pagos'}
                  </Typography>
                </Box>
                <Chip label={`${pagosDetalle.length} total`} size="small" sx={{ bgcolor: '#d9e4f7', color: '#4b6ca7', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }} />
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {pagosDetalle.map((pago, idx) => (
                  <Box
                    key={pago._id || idx}
                    sx={{
                      bgcolor: '#ffffff',
                      border: '1px solid #e8ebf2',
                      borderRadius: 2,
                      borderLeft: '4px solid #c9daf6',
                      px: 1.7,
                      py: 1.2,
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr 1fr 1fr 1fr auto' },
                      alignItems: 'center',
                      gap: 1.3
                    }}
                  >
                    <Box>
                      <Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Pago #{idx + 1}</Typography>
                      <Typography sx={{ fontWeight: 800, color: '#0b2a57', mt: 0.25 }}>{pago.metodo_pago || '-'}</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Monto</Typography>
                      <Typography sx={{ fontWeight: 900, color: '#0b2a57', mt: 0.25 }}>{formatMontoPrincipal(pago)}</Typography>
                      {formatEquivalenteUsdDesdeBs(pago) && (
                        <Typography sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, mt: 0.2 }}>
                          Equivalente: {formatEquivalenteUsdDesdeBs(pago)}
                        </Typography>
                      )}
                      {formatMontoEsperado(pago, mensualidadDetalle?.monto_total ?? mensualidadDetalle?.monto, true) !== '-' && (
                        <Typography sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, mt: 0.2 }}>
                          Esperado: {formatMontoEsperado(pago, mensualidadDetalle?.monto_total ?? mensualidadDetalle?.monto, true)}
                        </Typography>
                      )}
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Fecha</Typography>
                      <Typography sx={{ color: '#334155', mt: 0.25 }}>{formatFechaBonita(pago.fecha_pago)}</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Tasa</Typography>
                      <Typography sx={{ color: '#334155', mt: 0.25, fontWeight: 700 }}>{formatTasaAplicada(pago)}</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Referencia</Typography>
                      <Typography sx={{ color: '#4c6690', fontWeight: 700, mt: 0.25 }}>{pago.referencia || '-'}</Typography>
                      {String(pago.telefono_pago || '').trim() && (
                        <Typography sx={{ color: '#334155', fontWeight: 700, mt: 0.25 }}>
                          Tel: {formatTelefonoPago(pago.telefono_pago)}
                        </Typography>
                      )}
                      {String(pago.cedula_titular || '').trim() && (
                        <Typography sx={{ color: '#334155', fontWeight: 700, mt: 0.25 }}>
                          Cédula: {formatCedulaTitular(pago.cedula_titular)}
                        </Typography>
                      )}
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Nota</Typography>
                      <Typography sx={{ color: '#334155', fontWeight: 700, mt: 0.25 }}>{String(pago.nota || '').trim() || '-'}</Typography>
                      {pago.solicita_revision_recargo && (
                        <Chip size="small" label="Solicita revision" sx={{ mt: 0.6, bgcolor: '#fff7ed', color: '#9a3412', fontWeight: 800 }} />
                      )}
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.6, justifyContent: { xs: 'flex-start', md: 'flex-end' }, alignItems: 'center', height: '100%' }}>
                      {pago.comprobante_url && (
                        <IconButton size="small" onClick={() => handleVerComprobante(pago.comprobante_url)} sx={{ bgcolor: '#f3f4f6', '&:hover': { bgcolor: '#e9edf3' } }}>
                          <InsertDriveFileIcon fontSize="small" sx={{ color: '#4b5563' }} />
                        </IconButton>
                      )}
                      {usuarioPuedeEditarEliminarPago && (
                        <>
                          <IconButton size="small" onClick={() => abrirModalEditarPago(pago)} sx={{ bgcolor: '#e0f1fb', '&:hover': { bgcolor: '#d1e9f8' } }}>
                            <EditIcon fontSize="small" sx={{ color: '#0a78b8' }} />
                          </IconButton>
                          <IconButton size="small" onClick={() => solicitarEliminarPago(pago)} disabled={eliminandoPagoId === pago._id} sx={{ bgcolor: '#fdecec', '&:hover': { bgcolor: '#fbdede' } }}>
                            <DeleteOutlineIcon fontSize="small" sx={{ color: '#d32727' }} />
                          </IconButton>
                        </>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.25, bgcolor: '#f3f5fb', justifyContent: 'flex-end' }}>
          <Button onClick={() => setModalDetalle(false)} variant="text" sx={{ color: '#516b94', fontWeight: 800 }}>
            Volver
          </Button>
        </DialogActions>
      </Dialog>
      <ModalPago
        open={openModalPago}
        onClose={() => setOpenModalPago(false)}
        pago={pagoSeleccionado}
        onSuccess={() => {
          fetchMensualidades();
          setSuccessMessage('Pago registrado');
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
            Tasa aplicada: {tasaPagoHistorica ? `${formatMoney(tasaPagoHistorica)} Bs/USD` : 'No disponible'}
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
              ? `Con tasa de ${formatMoney(tasaPagoHistorica)} Bs/USD, este monto equivale a $${formatMoney(equivalenteUsdDesdeBs)} USD.`
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
