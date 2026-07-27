import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Avatar, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, MenuItem, Paper, TextField, Typography } from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import CreditCardRoundedIcon from '@mui/icons-material/CreditCardRounded';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PauseCircleOutlineRoundedIcon from '@mui/icons-material/PauseCircleOutlineRounded';
import PaidRoundedIcon from '@mui/icons-material/PaidRounded';
import PhoneIphoneRoundedIcon from '@mui/icons-material/PhoneIphoneRounded';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import DeleteForeverRoundedIcon from '@mui/icons-material/DeleteForeverRounded';
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import WorkOutlineRoundedIcon from '@mui/icons-material/WorkOutlineRounded';
import EntrenadorForm from './EntrenadorForm';
import { useDolar } from '../context/DolarContext';
import { obtenerTasaOficialPorFecha } from '../utils/dolarHistorico';

const detailTabs = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'pagos', label: 'Pagos' },
  { key: 'historial', label: 'Historial' },
  // Pendiente para proxima iteracion:
  // { key: 'horario', label: 'Horario' },
  // { key: 'planes', label: 'Planes de entrenamiento' },
  // { key: 'documentos', label: 'Documentos' }
];

function formatUsd(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 'No configurado';
  return `$${numeric.toFixed(2)}`;
}

function getWhatsappHref(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  return `https://wa.me/${digits}`;
}

function parseDateLocalSafe(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const raw = String(value).trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const localDate = new Date(year, month, day);
    return Number.isNaN(localDate.getTime()) ? null : localDate;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDate(value) {
  if (!value) return 'Sin fecha';
  const date = parseDateLocalSafe(value);
  if (!date) return 'Sin fecha';
  return date.toLocaleDateString('es-VE');
}

function formatMonthYear(value) {
  if (!value) return '';
  const date = parseDateLocalSafe(value);
  if (!date) return '';
  return date.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });
}

function toIsoDateLocal(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '';
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayIsoDate() {
  return toIsoDateLocal(new Date());
}

function formatMoney(value, currency = 'USD') {
  const amount = Number(value) || 0;
  return `${currency === 'USD' ? '$' : ''}${amount.toFixed(2)}`;
}

function pickFirstNumber(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
}

function normalizeFrecuenciaPago(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'quincenal') return 'quincenal';
  if (raw === 'semanal') return 'semanal';
  if (raw === 'mensual') return 'mensual';
  if (raw === 'por_sesion') return 'por_sesion';
  return 'mensual';
}

function getDivisorFrecuencia(frecuencia) {
  if (frecuencia === 'quincenal') return 2;
  if (frecuencia === 'semanal') return 4;
  return 1;
}

function getFrecuenciaLabel(frecuencia) {
  if (frecuencia === 'quincenal') return 'Quincenal';
  if (frecuencia === 'semanal') return 'Semanal';
  if (frecuencia === 'por_sesion') return 'Por sesion';
  return 'Mensual';
}

const paymentMethodOptions = [
  {
    key: 'transferencia',
    label: 'Transferencia',
    subtitle: 'Banco · cuenta bancaria',
    icon: CreditCardRoundedIcon
  },
  {
    key: 'pago_movil',
    label: 'Pago movil',
    subtitle: 'C2P · cualquier banco',
    icon: PhoneIphoneRoundedIcon
  },
  {
    key: 'zelle',
    label: 'Zelle',
    subtitle: 'En dolares · cuenta USA',
    icon: SwapHorizRoundedIcon
  },
  {
    key: 'efectivo',
    label: 'Efectivo',
    subtitle: 'Pago presencial',
    icon: PaidRoundedIcon
  }
];

function EmptyTab({ title }) {
  return (
    <Paper sx={{ borderRadius: 3.5, p: 2.5, border: '1px solid #e6ebf2', boxShadow: 'none' }}>
      <Typography sx={{ fontWeight: 900, color: '#0f172a', fontSize: 20 }}>{title}</Typography>
      <Typography sx={{ mt: 0.8, color: '#64748b', fontWeight: 600 }}>
        Esta seccion estara disponible en una siguiente iteracion.
      </Typography>
    </Paper>
  );
}

function EntrenadorDetalleView({
  entrenador,
  photo,
  palette,
  trainerSedes,
  paymentMethods,
  contractLabel,
  initialActiveTab = 'resumen',
  initialPagoPrefill = null,
  onUpdated,
  onDeleted,
  onBack
}) {
  const [activeTab, setActiveTab] = useState('resumen');
  const [isEditing, setIsEditing] = useState(false);
  const [submittingPago, setSubmittingPago] = useState(false);
  const [pagoFeedback, setPagoFeedback] = useState('');
  const [accionPerfilEnCurso, setAccionPerfilEnCurso] = useState(false);
  const [accionPerfilFeedback, setAccionPerfilFeedback] = useState('');
  const [estadoDialogOpen, setEstadoDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [confirmarPagoDialogOpen, setConfirmarPagoDialogOpen] = useState(false);
  const [comprobantePago, setComprobantePago] = useState(null);
  const [historialMesFiltro, setHistorialMesFiltro] = useState('todos');
  const [historialPeriodoFiltro, setHistorialPeriodoFiltro] = useState('todos');
  const { dolar, loading: dolarLoading, error: dolarError } = useDolar();
  const [tasaPagoHistorica, setTasaPagoHistorica] = useState(null);
  const [pagoForm, setPagoForm] = useState({
    periodo: '',
    fecha_pago: getTodayIsoDate(),
    monto_base: 0,
    moneda: 'USD',
    bono_ajuste: 0,
    nota_bono_ajuste: '',
    deduccion: 0,
    nota_deduccion: '',
    metodo_pago: 'transferencia',
    referencia: ''
  });

  const proximoPago = useMemo(() => {
    return formatUsd(
      entrenador?.pago_config?.monto_base_usd
      || entrenador?.pago_config?.monto_mensual_usd
      || entrenador?.pago_config?.monto_usd
      || entrenador?.pago_config?.monto
    );
  }, [entrenador]);

  const whatsappHref = useMemo(() => getWhatsappHref(entrenador?.telefono), [entrenador?.telefono]);
  const frecuenciaPago = useMemo(
    () => normalizeFrecuenciaPago(entrenador?.pago_config?.frecuencia_pago),
    [entrenador]
  );
  const montoBaseConfigurado = useMemo(() => {
    const raw = entrenador?.pago_config?.monto_base_usd
      || entrenador?.pago_config?.monto_mensual_usd
      || entrenador?.pago_config?.monto_usd
      || entrenador?.pago_config?.monto;
    const numeric = Number(raw);
    return Number.isFinite(numeric) ? numeric : 0;
  }, [entrenador]);

  const montoBasePorPago = useMemo(() => {
    const divisor = getDivisorFrecuencia(frecuenciaPago);
    if (divisor <= 1) return Number(montoBaseConfigurado.toFixed(2));
    return Number((montoBaseConfigurado / divisor).toFixed(2));
  }, [montoBaseConfigurado, frecuenciaPago]);

  const periodOptions = useMemo(() => {
    if (frecuenciaPago === 'quincenal') {
      return [
        { value: '1ra quincena', label: '1ra quincena' },
        { value: '2da quincena', label: '2da quincena' }
      ];
    }

    if (frecuenciaPago === 'semanal') {
      return [
        { value: 'Semana 1', label: 'Semana 1' },
        { value: 'Semana 2', label: 'Semana 2' },
        { value: 'Semana 3', label: 'Semana 3' },
        { value: 'Semana 4', label: 'Semana 4' }
      ];
    }

    if (frecuenciaPago === 'por_sesion') {
      return [
        { value: 'Sesion 1', label: 'Sesion 1' },
        { value: 'Sesion 2', label: 'Sesion 2' },
        { value: 'Sesion 3', label: 'Sesion 3' }
      ];
    }

    return [{ value: 'Mes completo', label: 'Mes completo' }];
  }, [frecuenciaPago]);

  const totalPago = useMemo(() => {
    const montoBase = Number(pagoForm.monto_base) || 0;
    const bono = Number(pagoForm.bono_ajuste) || 0;
    const deduccion = Number(pagoForm.deduccion) || 0;
    return Math.max(0, montoBase + bono - deduccion);
  }, [pagoForm]);

  const tasaDiaBs = useMemo(() => {
    const tasaHistorica = Number(tasaPagoHistorica);
    if (Number.isFinite(tasaHistorica) && tasaHistorica > 0) return Number(tasaHistorica.toFixed(2));
    const tasa = Number(dolar?.promedio);
    if (!Number.isFinite(tasa) || tasa <= 0) return null;
    return Number(tasa.toFixed(2));
  }, [dolar?.promedio, tasaPagoHistorica]);

  const totalPagoBs = useMemo(() => {
    if (pagoForm.moneda === 'VES') return Number(totalPago.toFixed(2));
    if (!tasaDiaBs) return null;
    return Number((totalPago * tasaDiaBs).toFixed(2));
  }, [totalPago, pagoForm.moneda, tasaDiaBs]);

  const totalPagoUsd = useMemo(() => {
    if (pagoForm.moneda === 'USD') return Number(totalPago.toFixed(2));
    if (!tasaDiaBs) return null;
    return Number((totalPago / tasaDiaBs).toFixed(2));
  }, [totalPago, pagoForm.moneda, tasaDiaBs]);

  const equivalenciaLabel = pagoForm.moneda === 'VES' ? 'Equivalente en USD' : 'Equivalente en Bs';
  const equivalenciaValue = pagoForm.moneda === 'VES'
    ? (totalPagoUsd == null ? 'No disponible' : `$ ${totalPagoUsd.toFixed(2)}`)
    : (totalPagoBs == null ? 'No disponible' : `Bs ${totalPagoBs.toFixed(2)}`);
  const prefijoMonedaPago = pagoForm.moneda === 'USD' ? '$' : 'Bs';

  const metodoPagoSeleccionado = useMemo(
    () => paymentMethodOptions.find((item) => item.key === pagoForm.metodo_pago) || paymentMethodOptions[0],
    [pagoForm.metodo_pago]
  );
  const pagoFeedbackEsError = /no se pudo|error/i.test(pagoFeedback);

  const detalleMetodoPago = useMemo(() => {
    const pagoConfig = entrenador?.pago_config || {};

    if (pagoForm.metodo_pago === 'transferencia') {
      const transferencia = pagoConfig?.transferencia || {};
      const partes = [
        transferencia.banco,
        transferencia.tipo_cuenta,
        transferencia.numero_cuenta,
        transferencia.titular,
        transferencia.cedula
      ].filter(Boolean);
      return partes.length ? partes.join(' · ') : 'No hay datos bancarios de transferencia configurados para este entrenador.';
    }

    if (pagoForm.metodo_pago === 'pago_movil') {
      const pagoMovil = pagoConfig?.pago_movil || {};
      const partes = [
        pagoMovil.banco,
        pagoMovil.telefono,
        pagoMovil.cedula
      ].filter(Boolean);
      return partes.length ? partes.join(' · ') : 'No hay datos de pago movil configurados para este entrenador.';
    }

    if (pagoForm.metodo_pago === 'zelle') {
      return 'Este metodo no tiene datos configurados en el perfil actual.';
    }

    return 'Pago en efectivo: no requiere datos bancarios del entrenador.';
  }, [entrenador, pagoForm.metodo_pago]);

  const pagosNominaOrdenados = useMemo(() => {
    const pagos = Array.isArray(entrenador?.pagos_nomina) ? entrenador.pagos_nomina : [];

    return pagos
      .map((pago, index) => ({ pago, index }))
      .sort((a, b) => {
        const fechaA = new Date(a.pago?.fecha_pago || 0).getTime();
        const fechaB = new Date(b.pago?.fecha_pago || 0).getTime();

        if (Number.isFinite(fechaA) && Number.isFinite(fechaB) && fechaA !== fechaB) {
          return fechaB - fechaA;
        }

        return b.index - a.index;
      })
      .map((item) => item.pago);
  }, [entrenador?.pagos_nomina]);

  const historialMesOptions = useMemo(() => {
    const meses = new Map();

    pagosNominaOrdenados.forEach((pago) => {
      const etiqueta = formatMonthYear(pago?.fecha_pago);
      const valor = etiqueta.toLowerCase();
      if (etiqueta && !meses.has(valor)) {
        meses.set(valor, etiqueta);
      }
    });

    return Array.from(meses.entries()).map(([value, label]) => ({ value, label }));
  }, [pagosNominaOrdenados]);

  const historialPeriodoOptions = useMemo(() => {
    const periodos = new Map();

    pagosNominaOrdenados.forEach((pago) => {
      const label = String(pago?.periodo || pago?.periodo_clave || '').trim();
      const value = label.toLowerCase();
      if (label && !periodos.has(value)) {
        periodos.set(value, label);
      }
    });

    return Array.from(periodos.entries()).map(([value, label]) => ({ value, label }));
  }, [pagosNominaOrdenados]);

  const pagosNominaFiltrados = useMemo(() => {
    return pagosNominaOrdenados.filter((pago) => {
      const mesPago = formatMonthYear(pago?.fecha_pago).toLowerCase();
      const periodoPago = String(pago?.periodo || pago?.periodo_clave || '').trim().toLowerCase();

      const coincideMes = historialMesFiltro === 'todos' || mesPago === historialMesFiltro;
      const coincidePeriodo = historialPeriodoFiltro === 'todos' || periodoPago === historialPeriodoFiltro;

      return coincideMes && coincidePeriodo;
    });
  }, [historialMesFiltro, historialPeriodoFiltro, pagosNominaOrdenados]);

  const periodStatusByValue = useMemo(() => {
    const mesReferencia = formatMonthYear(pagoForm.fecha_pago).toLowerCase();
    const status = new Map(periodOptions.map((option) => [String(option.value), 'pendiente']));

    pagosNominaOrdenados
      .filter((pago) => formatMonthYear(pago?.fecha_pago).toLowerCase() === mesReferencia)
      .forEach((pago) => {
        const periodoPago = String(pago?.periodo || pago?.periodo_clave || '').trim().toLowerCase();
        const optionMatch = periodOptions.find((option) => {
          const value = String(option.value || '').trim().toLowerCase();
          const label = String(option.label || '').trim().toLowerCase();
          return periodoPago === value || periodoPago === label;
        });

        if (optionMatch) {
          status.set(String(optionMatch.value), 'pagado');
        }
      });

    return status;
  }, [pagoForm.fecha_pago, pagosNominaOrdenados, periodOptions]);

  const pagoPeriodoActualRegistrado = useMemo(() => {
    const periodoActual = String(pagoForm.periodo || '').trim().toLowerCase();
    if (!periodoActual) return false;

    const mesActualPago = formatMonthYear(pagoForm.fecha_pago).toLowerCase();
    if (!mesActualPago) return false;

    return pagosNominaOrdenados.some((pago) => {
      const periodoPago = String(pago?.periodo || '').trim().toLowerCase();
      const mesPago = formatMonthYear(pago?.fecha_pago).toLowerCase();
      return periodoPago === periodoActual && mesPago === mesActualPago;
    });
  }, [pagoForm.periodo, pagoForm.fecha_pago, pagosNominaOrdenados]);

  const periodoSugerido = useMemo(() => {
    if (!periodOptions.length) return '';

    const mesReferencia = formatMonthYear(pagoForm.fecha_pago).toLowerCase();
    const periodosCubiertos = new Set(
      pagosNominaOrdenados
        .filter((pago) => formatMonthYear(pago?.fecha_pago).toLowerCase() === mesReferencia)
        .map((pago) => String(pago?.periodo || pago?.periodo_clave || '').trim().toLowerCase())
        .filter(Boolean)
    );

    const siguientePendiente = periodOptions.find((option) => !periodosCubiertos.has(String(option.value).toLowerCase()));
    return siguientePendiente?.value || '';
  }, [periodOptions, pagoForm.fecha_pago, pagosNominaOrdenados]);

  const periodoSugeridoLabel = useMemo(() => {
    if (!periodoSugerido) return 'Todos los periodos de este mes ya están cubiertos';
    return periodOptions.find((option) => option.value === periodoSugerido)?.label || periodoSugerido;
  }, [periodOptions, periodoSugerido]);

  const mostrarReferencia = pagoForm.metodo_pago === 'transferencia' || pagoForm.metodo_pago === 'pago_movil';
  const formularioPagoBloqueado = pagoPeriodoActualRegistrado;
  const entrenadorId = String(entrenador?._id || entrenador?.id || '');
  const estadoActual = String(entrenador?.estado || 'activo').toLowerCase() === 'inactivo' ? 'inactivo' : 'activo';
  const proximoEstado = estadoActual === 'activo' ? 'inactivo' : 'activo';

  const activeTabFromNavigation = useMemo(() => {
    return detailTabs.some((tab) => tab.key === initialActiveTab) ? initialActiveTab : 'resumen';
  }, [initialActiveTab]);
  const periodoPrefillFromNavigation = useMemo(() => {
    return String(initialPagoPrefill?.periodo || '').trim();
  }, [initialPagoPrefill]);

  useEffect(() => {
    setIsEditing(false);
    setAccionPerfilFeedback('');
    setEstadoDialogOpen(false);
    setDeleteDialogOpen(false);
    setConfirmarPagoDialogOpen(false);
  }, [entrenador]);

  useEffect(() => {
    setActiveTab(activeTabFromNavigation);
  }, [activeTabFromNavigation, entrenadorId]);

  useEffect(() => {
    setPagoForm((prev) => ({
      ...prev,
      monto_base: montoBasePorPago
    }));
  }, [montoBasePorPago]);

  useEffect(() => {
    let cancelled = false;

    const cargarTasaHistorica = async () => {
      try {
        const tasaHistorica = await obtenerTasaOficialPorFecha(pagoForm.fecha_pago, Number(dolar?.promedio) || 0);
        if (!cancelled) {
          setTasaPagoHistorica(Number(tasaHistorica) || 0);
        }
      } catch {
        if (!cancelled) {
          setTasaPagoHistorica(Number(dolar?.promedio) || 0);
        }
      }
    };

    cargarTasaHistorica();

    return () => {
      cancelled = true;
    };
  }, [pagoForm.fecha_pago, dolar?.promedio]);

  useEffect(() => {
    if (!periodoSugerido) return;
    setPagoForm((prev) => {
      const exists = periodOptions.some((option) => option.value === prev.periodo);
      if (exists) return prev;
      return { ...prev, periodo: periodoSugerido };
    });
  }, [periodOptions, periodoSugerido]);

  useEffect(() => {
    if (!periodoPrefillFromNavigation) return;

    setPagoForm((prev) => {
      const periodMatch = periodOptions.find((option) => {
        const value = String(option.value || '').trim().toLowerCase();
        const label = String(option.label || '').trim().toLowerCase();
        const target = periodoPrefillFromNavigation.toLowerCase();
        return value === target || label === target;
      });

      if (!periodMatch) return prev;
      if (prev.periodo === periodMatch.value) return prev;
      return { ...prev, periodo: periodMatch.value };
    });
  }, [periodOptions, periodoPrefillFromNavigation, entrenadorId]);

  useEffect(() => {
    const periodoActual = String(pagoForm.periodo || '').trim().toLowerCase();
    if (!periodoActual) return;

    const mesActual = formatMonthYear(pagoForm.fecha_pago).toLowerCase();
    if (!mesActual) return;

    const pagoExistente = pagosNominaOrdenados.find((pago) => {
      const periodoPago = String(pago?.periodo || pago?.periodo_clave || '').trim().toLowerCase();
      const mesPago = formatMonthYear(pago?.fecha_pago).toLowerCase();
      return periodoPago === periodoActual && mesPago === mesActual;
    });

    if (!pagoExistente) {
      setPagoForm((prev) => {
        const montoSugerido = Number(montoBasePorPago.toFixed(2));
        const changed = Number(prev.monto_base) !== montoSugerido
          || Number(prev.bono_ajuste) !== 0
          || prev.nota_bono_ajuste !== ''
          || Number(prev.deduccion) !== 0
          || prev.nota_deduccion !== ''
          || prev.referencia !== '';

        if (!changed) return prev;

        return {
          ...prev,
          monto_base: montoSugerido,
          bono_ajuste: 0,
          nota_bono_ajuste: '',
          deduccion: 0,
          nota_deduccion: '',
          referencia: ''
        };
      });

      setComprobantePago((prev) => (prev ? null : prev));
      return;
    }

    const monedaPago = String(pagoExistente?.moneda || 'USD').toUpperCase() === 'VES' ? 'VES' : 'USD';
    const fechaPagoLocal = toIsoDateLocal(parseDateLocalSafe(pagoExistente?.fecha_pago));

    const montoBaseUsd = pickFirstNumber(
      pagoExistente?.monto_base_pago_usd,
      pagoExistente?.monto_base_usd,
      pagoExistente?.monto_base
    );
    const montoBaseVes = pickFirstNumber(
      pagoExistente?.monto_base_ves,
      pagoExistente?.monto_base_pago_ves
    );
    const bonoUsd = pickFirstNumber(pagoExistente?.bono_usd, pagoExistente?.bono_ajuste);
    const bonoVes = pickFirstNumber(pagoExistente?.bono_ves);
    const deduccionUsd = pickFirstNumber(pagoExistente?.deduccion_usd, pagoExistente?.deduccion);
    const deduccionVes = pickFirstNumber(pagoExistente?.deduccion_ves);

    const nextValues = {
      fecha_pago: fechaPagoLocal || pagoForm.fecha_pago,
      moneda: monedaPago,
      monto_base: Number((monedaPago === 'VES' ? (montoBaseVes || montoBaseUsd) : montoBaseUsd).toFixed(2)),
      bono_ajuste: Number((monedaPago === 'VES' ? (bonoVes || bonoUsd) : bonoUsd).toFixed(2)),
      deduccion: Number((monedaPago === 'VES' ? (deduccionVes || deduccionUsd) : deduccionUsd).toFixed(2)),
      metodo_pago: pagoExistente?.metodo_pago || pagoForm.metodo_pago,
      referencia: pagoExistente?.referencia || ''
    };

    setPagoForm((prev) => {
      const changed = prev.fecha_pago !== nextValues.fecha_pago
        || prev.moneda !== nextValues.moneda
        || Number(prev.monto_base) !== nextValues.monto_base
        || Number(prev.bono_ajuste) !== nextValues.bono_ajuste
        || Number(prev.deduccion) !== nextValues.deduccion
        || prev.metodo_pago !== nextValues.metodo_pago
        || prev.referencia !== nextValues.referencia;

      if (!changed) return prev;

      return {
        ...prev,
        ...nextValues
      };
    });
  }, [pagoForm.periodo, pagoForm.fecha_pago, pagosNominaOrdenados, montoBasePorPago]);

  const handlePagoField = (field) => (event) => {
    const { value } = event.target;
    setPagoForm((prev) => ({
      ...prev,
      [field]: ['monto_base', 'bono_ajuste', 'deduccion'].includes(field) ? Number(value || 0) : value
    }));
  };

  const registrarPagoNomina = async () => {
    setPagoFeedback('');
    setSubmittingPago(true);

    try {
      const token = localStorage.getItem('token');
      const apiBase = process.env.REACT_APP_API_URL || '';
      const payload = new FormData();
      payload.append('periodo', pagoForm.periodo || '');
      payload.append('fecha_pago', pagoForm.fecha_pago || '');
      payload.append('monto_base', String(Number(pagoForm.monto_base) || 0));
      payload.append('monto_base_usd', String(Number(pagoForm.monto_base) || 0));
      payload.append('moneda', pagoForm.moneda || 'USD');
      payload.append('bono_ajuste', String(Number(pagoForm.bono_ajuste) || 0));
      payload.append('deduccion', String(Number(pagoForm.deduccion) || 0));
      payload.append('metodo_pago', pagoForm.metodo_pago || '');
      payload.append('referencia', pagoForm.referencia || '');
      payload.append('observacion', [pagoForm.nota_bono_ajuste, pagoForm.nota_deduccion].filter(Boolean).join(' | '));
      payload.append('tasa_bcv', String(Number(tasaDiaBs) || 0));
      payload.append('monto_base_ves', totalPagoBs == null ? '' : String(totalPagoBs));
      payload.append('monto_total_usd', totalPagoUsd == null ? '' : String(totalPagoUsd));
      payload.append('monto_total_ves', totalPagoBs == null ? '' : String(totalPagoBs));

      if (comprobantePago) {
        payload.append('comprobante', comprobantePago);
      }

      const res = await fetch(`${apiBase}/api/entrenadores/${entrenador?._id || entrenador?.id}/pagos`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: payload
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPagoFeedback(data?.error || 'No se pudo registrar el pago en backend');
        return;
      }

      if (typeof onUpdated === 'function' && data?.pago) {
        const pagosActuales = Array.isArray(entrenador?.pagos_nomina) ? entrenador.pagos_nomina : [];
        const pagoNuevo = data.pago;
        const existePago = pagosActuales.some((pago) => {
          const mismaFecha = String(pago?.fecha_pago || '') === String(pagoNuevo?.fecha_pago || '');
          const mismoPeriodo = String(pago?.periodo || '') === String(pagoNuevo?.periodo || '');
          const mismaReferencia = String(pago?.referencia || '') === String(pagoNuevo?.referencia || '');
          return mismaFecha && mismoPeriodo && mismaReferencia;
        });

        if (!existePago) {
          onUpdated({
            ...entrenador,
            pagos_nomina: [...pagosActuales, pagoNuevo]
          });
        }
      }

      const totalUsd = Number(data?.pago?.monto_total_usd || 0).toFixed(2);
      const totalVes = Number(data?.pago?.monto_total_ves || 0).toFixed(2);
      setPagoFeedback(`Pago registrado. Total USD: $${totalUsd} · Total VES: Bs ${totalVes}.${comprobantePago ? ` Comprobante: ${comprobantePago.name}.` : ''}`);
      setComprobantePago(null);
    } catch (_) {
      setPagoFeedback('No se pudo registrar el pago por un error de conexion');
    } finally {
      setSubmittingPago(false);
    }
  };

  const handleAbrirConfirmarPago = () => {
    setPagoFeedback('');
    setConfirmarPagoDialogOpen(true);
  };

  const handleConfirmarPago = () => {
    setConfirmarPagoDialogOpen(false);
    registrarPagoNomina();
  };

  const handleCambiarEstado = () => {
    if (!entrenadorId || accionPerfilEnCurso) return;
    setEstadoDialogOpen(true);
  };

  const confirmarCambioEstado = async () => {
    if (!entrenadorId) return;

    setEstadoDialogOpen(false);
    setAccionPerfilFeedback('');
    setAccionPerfilEnCurso(true);
    try {
      const token = localStorage.getItem('token');
      const apiBase = process.env.REACT_APP_API_URL || '';
      const res = await fetch(`${apiBase}/api/entrenadores/${entrenadorId}/estado`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ estado: proximoEstado })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAccionPerfilFeedback(data?.error || 'No se pudo cambiar el estado del entrenador');
        return;
      }

      if (typeof onUpdated === 'function') {
        onUpdated(data?.entrenador || { ...entrenador, estado: proximoEstado });
      }
      setAccionPerfilFeedback(data?.mensaje || `Estado actualizado a ${proximoEstado}`);
    } catch (_) {
      setAccionPerfilFeedback('No se pudo cambiar el estado por un error de conexion');
    } finally {
      setAccionPerfilEnCurso(false);
    }
  };

  const handleEliminarDefinitivo = () => {
    if (!entrenadorId || accionPerfilEnCurso) return;
    setDeleteDialogOpen(true);
  };

  const confirmarEliminarDefinitivo = async () => {
    if (!entrenadorId) return;

    setDeleteDialogOpen(false);
    setAccionPerfilFeedback('');
    setAccionPerfilEnCurso(true);
    try {
      const token = localStorage.getItem('token');
      const apiBase = process.env.REACT_APP_API_URL || '';
      const res = await fetch(`${apiBase}/api/entrenadores/${entrenadorId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAccionPerfilFeedback(data?.error || 'No se pudo eliminar el entrenador');
        return;
      }

      if (typeof onDeleted === 'function') {
        onDeleted(entrenadorId);
      } else if (typeof onBack === 'function') {
        onBack();
      }
    } catch (_) {
      setAccionPerfilFeedback('No se pudo eliminar el entrenador por un error de conexion');
    } finally {
      setAccionPerfilEnCurso(false);
    }
  };

  return (
    <div className="entrenadores-page">
      <Button
        variant="text"
        startIcon={<ArrowBackRoundedIcon />}
        onClick={onBack}
        sx={{
          justifyContent: 'flex-start',
          textTransform: 'none',
          color: '#0f172a',
          fontWeight: 700,
          width: 'fit-content'
        }}
      >
        Volver a lista de entrenadores
      </Button>

      <Paper sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 4, border: '1px solid #e5e7eb', boxShadow: '0 18px 36px rgba(15, 23, 42, 0.06)' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.8, minWidth: 0 }}>
            <Avatar
              src={photo}
              alt={`${entrenador.nombre || ''} ${entrenador.apellido || ''}`.trim()}
              sx={{ width: 76, height: 76, background: palette.bg, color: palette.color, fontWeight: 900, fontSize: 30 }}
            >
              {`${entrenador.nombre?.[0] || ''}${entrenador.apellido?.[0] || ''}`.toUpperCase()}
            </Avatar>
            <Box sx={{ minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: { xs: 24, md: 30 }, fontWeight: 900, color: '#0f172a', lineHeight: 1.1 }}>
                  {entrenador.nombre} {entrenador.apellido}
                </Typography>
                <span className={`estado-pill estado-${entrenador.estado}`}>{entrenador.estado || 'sin estado'}</span>
              </Box>
              <Typography sx={{ color: '#64748b', mt: 0.3 }}>
                Voleibol {entrenador.especialidad ? `- ${entrenador.especialidad}` : '- Staff tecnico'}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<PauseCircleOutlineRoundedIcon />}
              onClick={handleCambiarEstado}
              disabled={accionPerfilEnCurso}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                borderRadius: 2.5,
                borderColor: estadoActual === 'activo' ? '#f59e0b' : '#059669',
                color: estadoActual === 'activo' ? '#b45309' : '#047857'
              }}
            >
              {estadoActual === 'activo' ? 'Pasar a inactivo' : 'Reactivar entrenador'}
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<EditOutlinedIcon />}
              onClick={() => {
                setIsEditing(true);
              }}
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2.5, bgcolor: '#0f172a' }}
            >
              Editar perfil
            </Button>
            <Button
              variant="contained"
              color="error"
              size="small"
              startIcon={<DeleteForeverRoundedIcon />}
              onClick={handleEliminarDefinitivo}
              disabled={accionPerfilEnCurso}
              sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2.5 }}
            >
              Eliminar entrenador
            </Button>
          </Box>
        </Box>

        {accionPerfilFeedback && (
          <Alert
            severity={/no se pudo|error/i.test(accionPerfilFeedback) ? 'error' : 'success'}
            sx={{ mt: 1.5, borderRadius: 2.5 }}
          >
            {accionPerfilFeedback}
          </Alert>
        )}

        <Dialog
          open={deleteDialogOpen}
          onClose={() => {
            if (!accionPerfilEnCurso) setDeleteDialogOpen(false);
          }}
        >
          <DialogTitle>¿Eliminar entrenador?</DialogTitle>
          <DialogContent>
            <Typography>
              Esta accion eliminara definitivamente al entrenador. No se puede deshacer.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteDialogOpen(false)} disabled={accionPerfilEnCurso}>Cancelar</Button>
            <Button
              onClick={confirmarEliminarDefinitivo}
              color="error"
              variant="contained"
              disabled={accionPerfilEnCurso}
            >
              {accionPerfilEnCurso ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={estadoDialogOpen}
          onClose={() => {
            if (!accionPerfilEnCurso) setEstadoDialogOpen(false);
          }}
        >
          <DialogTitle>
            {proximoEstado === 'inactivo' ? '¿Pasar entrenador a inactivo?' : '¿Reactivar entrenador?'}
          </DialogTitle>
          <DialogContent>
            <Typography>
              {proximoEstado === 'inactivo'
                ? 'El entrenador quedara inactivo y no aparecera en procesos activos hasta reactivarlo.'
                : 'El entrenador volvera a estado activo y participara nuevamente en procesos activos.'}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setEstadoDialogOpen(false)} disabled={accionPerfilEnCurso}>Cancelar</Button>
            <Button
              onClick={confirmarCambioEstado}
              variant="contained"
              disabled={accionPerfilEnCurso}
              sx={proximoEstado === 'inactivo' ? { bgcolor: '#d97706', '&:hover': { bgcolor: '#b45309' } } : undefined}
            >
              {accionPerfilEnCurso
                ? 'Procesando...'
                : (proximoEstado === 'inactivo' ? 'Pasar a inactivo' : 'Reactivar')}
            </Button>
          </DialogActions>
        </Dialog>

        <Dialog
          open={confirmarPagoDialogOpen}
          onClose={() => {
            if (!submittingPago) setConfirmarPagoDialogOpen(false);
          }}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle>Confirmar registro de pago</DialogTitle>
          <DialogContent>
            <Typography sx={{ color: '#64748b', mb: 1.2 }}>
              Revisa el resumen antes de registrar.
            </Typography>
            <Box sx={{ border: '1px solid #e8edf3', borderRadius: 2, p: 1.2, bgcolor: '#f8fafc', display: 'grid', gap: 0.8 }}>
              <Typography sx={{ fontSize: 13 }}><strong>Periodo:</strong> {pagoForm.periodo || 'Sin periodo'}</Typography>
              <Typography sx={{ fontSize: 13 }}><strong>Fecha:</strong> {formatDate(pagoForm.fecha_pago)}</Typography>
              <Typography sx={{ fontSize: 13 }}><strong>Metodo:</strong> {metodoPagoSeleccionado.label}</Typography>
              <Typography sx={{ fontSize: 13 }}><strong>Monto:</strong> {formatMoney(totalPago, pagoForm.moneda)} {pagoForm.moneda}</Typography>
            </Box>
          </DialogContent>
          <DialogActions sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1, px: 3, pb: 2 }}>
            <Button
              variant="outlined"
              onClick={() => setConfirmarPagoDialogOpen(false)}
              disabled={submittingPago}
              sx={{
                width: '100%',
                borderColor: '#94a3b8',
                color: '#475569',
                '&:hover': {
                  borderColor: '#64748b',
                  backgroundColor: '#f8fafc'
                }
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmarPago}
              variant="contained"
              disabled={submittingPago}
              sx={{ width: '100%', bgcolor: '#059669', '&:hover': { bgcolor: '#047857' } }}
            >
              {submittingPago ? 'Registrando...' : 'Confirmar y registrar'}
            </Button>
          </DialogActions>
        </Dialog>

        <Box
          sx={{
            mt: 2,
            p: 1.2,
            borderRadius: 3,
            border: '1px solid #e8edf3',
            bgcolor: '#f8fafc',
            display: 'grid',
            gap: 1,
            gridTemplateColumns: { xs: '1fr', md: 'repeat(5, minmax(0, 1fr))' }
          }}
        >
          <Box>
            <Typography sx={{ display: 'flex', alignItems: 'center', gap: 0.6, fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
              <BadgeOutlinedIcon sx={{ fontSize: 14 }} />
              Cedula
            </Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>V-{entrenador.cedula || 'Sin cedula'}</Typography>
          </Box>
          <Box>
            <Typography sx={{ display: 'flex', alignItems: 'center', gap: 0.6, fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
              <BusinessOutlinedIcon sx={{ fontSize: 14 }} />
              Sede
            </Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{trainerSedes[0] || 'Sin sede'}</Typography>
          </Box>
          <Box>
            <Typography sx={{ display: 'flex', alignItems: 'center', gap: 0.6, fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
              <WorkOutlineRoundedIcon sx={{ fontSize: 14 }} />
              Contrato
            </Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{contractLabel}</Typography>
          </Box>
          <Box>
            <Typography sx={{ display: 'flex', alignItems: 'center', gap: 0.6, fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
              <CalendarMonthOutlinedIcon sx={{ fontSize: 14 }} />
              Fecha de ingreso
            </Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{formatDate(entrenador.fecha_ingreso)}</Typography>
          </Box>
          <Box>
            <Typography sx={{ display: 'flex', alignItems: 'center', gap: 0.6, fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
              <PhoneOutlinedIcon sx={{ fontSize: 14 }} />
              Telefono
            </Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{entrenador.telefono || 'Sin telefono'}</Typography>
          </Box>
        </Box>
      </Paper>

      {isEditing && (
        <EntrenadorForm
          mode="edit"
          entrenadorId={String(entrenador?._id || entrenador?.id || '')}
          entrenadorData={entrenador}
          onCancel={() => setIsEditing(false)}
          onSuccess={(updatedEntrenador) => {
            if (updatedEntrenador && onUpdated) {
              onUpdated(updatedEntrenador);
            }
            setIsEditing(false);
            setActiveTab('resumen');
          }}
        />
      )}

      {!isEditing && (
      <Paper sx={{ borderRadius: 3.5, border: '1px solid #e6ebf2', p: 1, boxShadow: 'none' }}>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {detailTabs.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <Button
                key={tab.key}
                variant={active ? 'contained' : 'text'}
                onClick={() => setActiveTab(tab.key)}
                sx={{
                  borderRadius: 999,
                  textTransform: 'none',
                  fontWeight: 800,
                  px: 1.8,
                  color: active ? '#ffffff' : '#334155',
                  bgcolor: active ? '#0f172a' : 'transparent',
                  '&:hover': {
                    bgcolor: active ? '#0f172a' : '#f1f5f9'
                  }
                }}
              >
                {tab.label}
              </Button>
            );
          })}
        </Box>
      </Paper>
      )}

      {!isEditing && (
      <>
      {activeTab === 'resumen' && (
        <>
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr' } }}>
            <Paper sx={{ borderRadius: 3.5, p: 2, border: '1px solid #e6ebf2', boxShadow: 'none' }}>
              <Typography sx={{ fontWeight: 900, color: '#0f172a', mb: 1.5 }}>Metricas del perfil</Typography>
              <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                <Paper sx={{ p: 1.2, borderRadius: 2, border: '1px solid #e8edf3', boxShadow: 'none', bgcolor: '#f8fbff' }}>
                  <Typography sx={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Sedes activas</Typography>
                  <Typography sx={{ mt: 0.4, fontSize: 28, fontWeight: 900, color: '#0f766e', lineHeight: 1 }}>{trainerSedes.length || 0}</Typography>
                </Paper>
                <Paper sx={{ p: 1.2, borderRadius: 2, border: '1px solid #e8edf3', boxShadow: 'none', bgcolor: '#faf8ff' }}>
                  <Typography sx={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Certificaciones</Typography>
                  <Typography sx={{ mt: 0.4, fontSize: 28, fontWeight: 900, color: '#7c3aed', lineHeight: 1 }}>{entrenador.certificaciones?.length || 0}</Typography>
                </Paper>
                <Paper sx={{ p: 1.2, borderRadius: 2, border: '1px solid #e8edf3', boxShadow: 'none', bgcolor: '#f7fcfb' }}>
                  <Typography sx={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Metodos de pago agregado</Typography>
                  <Typography sx={{ mt: 0.4, fontSize: 28, fontWeight: 900, color: '#15803d', lineHeight: 1 }}>{paymentMethods.length || 0}</Typography>
                </Paper>
              </Box>
            </Paper>

            <Paper sx={{ borderRadius: 3.5, p: 2, border: '1px solid #e6ebf2', boxShadow: 'none' }}>
              <Typography sx={{ fontWeight: 900, color: '#0f172a', mb: 1.5 }}>Proximo pago</Typography>
              <Box sx={{ p: 1.6, borderRadius: 2.5, border: '1px solid #d8efe5', background: 'linear-gradient(180deg, #ecfdf5 0%, #dcfce7 100%)' }}>
                <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#15803d' }}>Configurado</Typography>
                <Typography sx={{ mt: 0.5, fontSize: 40, lineHeight: 1, fontWeight: 900, color: '#0f172a' }}>{proximoPago}</Typography>
                <Typography sx={{ mt: 0.5, color: '#0f766e', fontWeight: 700, fontSize: 13 }}>
                  {paymentMethods.length ? paymentMethods.join(' · ') : 'Sin metodo de pago configurado'}
                </Typography>
                <Button
                  fullWidth
                  variant="contained"
                  onClick={() => setActiveTab('pagos')}
                  sx={{ mt: 1.8, borderRadius: 999, textTransform: 'none', fontWeight: 800, bgcolor: '#0f172a' }}
                >
                  Registrar pago
                </Button>
              </Box>
            </Paper>
          </Box>

          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '1.2fr 1fr' } }}>
            <Paper sx={{ borderRadius: 3.5, p: 2, border: '1px solid #e6ebf2', boxShadow: 'none' }}>
              <Typography sx={{ fontWeight: 900, color: '#0f172a', mb: 1.4 }}>Especialidad y experiencia</Typography>
              <Box sx={{ display: 'grid', gap: 1.2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
                <Box>
                  <Typography sx={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Especialidad</Typography>
                  <Typography sx={{ mt: 0.4, color: '#0f172a', fontWeight: 700 }}>{entrenador.especialidad || 'No registrada'}</Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Nivel de instruccion</Typography>
                  <Typography sx={{ mt: 0.4, color: '#0f172a', fontWeight: 700 }}>{entrenador.nivel_instruccion || 'No registrado'}</Typography>
                </Box>
                <Box sx={{ gridColumn: { xs: '1', md: '1 / -1' } }}>
                  <Typography sx={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Experiencia previa</Typography>
                  <Typography sx={{ mt: 0.4, color: '#334155', fontWeight: 600 }}>{entrenador.experiencia_previa || 'Sin experiencia registrada'}</Typography>
                </Box>
              </Box>
            </Paper>

            <Paper sx={{ borderRadius: 3.5, p: 2, border: '1px solid #e6ebf2', boxShadow: 'none' }}>
              <Typography sx={{ fontWeight: 900, color: '#0f172a', mb: 1.4 }}>Talla de uniforme</Typography>
              <Box sx={{ display: 'grid', gap: 1, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                <Paper sx={{ p: 1.1, borderRadius: 2, border: '1px solid #e8edf3', boxShadow: 'none', textAlign: 'center' }}>
                  <Typography sx={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Franela</Typography>
                  <Typography sx={{ fontSize: 24, fontWeight: 900, color: '#0f172a', mt: 0.3 }}>{entrenador.talla_uniforme?.franela || '-'}</Typography>
                </Paper>
                <Paper sx={{ p: 1.1, borderRadius: 2, border: '1px solid #e8edf3', boxShadow: 'none', textAlign: 'center' }}>
                  <Typography sx={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Short</Typography>
                  <Typography sx={{ fontSize: 24, fontWeight: 900, color: '#0f172a', mt: 0.3 }}>{entrenador.talla_uniforme?.short || '-'}</Typography>
                </Paper>
                <Paper sx={{ p: 1.1, borderRadius: 2, border: '1px solid #e8edf3', boxShadow: 'none', textAlign: 'center' }}>
                  <Typography sx={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Mono</Typography>
                  <Typography sx={{ fontSize: 24, fontWeight: 900, color: '#0f172a', mt: 0.3 }}>{entrenador.talla_uniforme?.mono || '-'}</Typography>
                </Paper>
              </Box>
            </Paper>
          </Box>
        </>
      )}

      {/* Tabs ocultas temporalmente:
      {activeTab === 'horario' && <EmptyTab title="Horario" />}
      {activeTab === 'planes' && <EmptyTab title="Planes de entrenamiento" />}
      */}
      {activeTab === 'pagos' && (
        <Paper sx={{ borderRadius: 3.5, border: '1px solid #e6ebf2', boxShadow: 'none', overflow: 'hidden' }}>
          <Box sx={{ p: 2, borderBottom: '1px solid #eef2f7', bgcolor: '#fbfdff' }}>
            <Typography sx={{ fontWeight: 900, color: '#0f172a', fontSize: 24 }}>Registrar pago</Typography>
            <Typography sx={{ color: '#64748b', mt: 0.5 }}>
              Registra el pago, guarda el comprobante y notifica al entrenador.
            </Typography>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.3fr 0.95fr' }, gap: 0 }}>
            <Box sx={{ p: 2, borderRight: { xs: 'none', lg: '1px solid #eef2f7' } }}>
              <Paper sx={{ p: 1.6, borderRadius: 2.5, border: '1px solid #e8edf3', boxShadow: 'none', mb: 1.8 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2 }}>
                    <Avatar sx={{ width: 40, height: 40, background: palette.bg, color: palette.color, fontWeight: 900 }}>
                      {`${entrenador.nombre?.[0] || ''}${entrenador.apellido?.[0] || ''}`.toUpperCase()}
                    </Avatar>
                    <Box>
                      <Typography sx={{ fontWeight: 800, color: '#0f172a' }}>
                        {entrenador.nombre} {entrenador.apellido}
                      </Typography>
                      <Typography sx={{ color: '#64748b', fontSize: 13 }}>
                        V-{entrenador.cedula || 'Sin cedula'} · {contractLabel} · {trainerSedes[0] || 'Sin sede'}
                      </Typography>
                    </Box>
                  </Box>
                  <Typography
                    sx={{
                      fontSize: 12,
                      fontWeight: 800,
                      color: pagoPeriodoActualRegistrado ? '#166534' : '#92400e',
                      bgcolor: pagoPeriodoActualRegistrado ? '#ecfdf5' : '#fff7ed',
                      px: 1,
                      py: 0.4,
                      borderRadius: 999
                    }}
                  >
                    {pagoPeriodoActualRegistrado ? 'Pagado' : 'Pendiente'}
                  </Typography>
                </Box>
              </Paper>

              <Paper sx={{ p: 1.8, borderRadius: 2.5, border: '1px solid #e8edf3', boxShadow: 'none', mb: 1.5 }}>
                <Typography sx={{ fontWeight: 800, color: '#0f172a', mb: 1.4 }}>1. Periodo y monto</Typography>
                <Box sx={{ display: 'grid', gap: 1.4, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
                  <TextField
                    select
                    size="small"
                    label="Periodo a cubrir"
                    value={pagoForm.periodo}
                    onChange={handlePagoField('periodo')}
                    SelectProps={{
                      renderValue: (selectedValue) => {
                        const selectedOption = periodOptions.find((option) => option.value === selectedValue);
                        const status = periodStatusByValue.get(String(selectedValue)) || 'pendiente';
                        return (
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, width: '100%' }}>
                            <span>{selectedOption?.label || selectedValue}</span>
                            <Chip
                              size="small"
                              label={status === 'pagado' ? 'Pagado' : 'Pendiente'}
                              color={status === 'pagado' ? 'success' : 'warning'}
                              variant={status === 'pagado' ? 'filled' : 'outlined'}
                              sx={{ height: 22, fontWeight: 700 }}
                            />
                          </Box>
                        );
                      }
                    }}
                  >
                    {periodOptions.map((option) => (
                      <MenuItem key={option.value} value={option.value}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, width: '100%' }}>
                          <span>{option.label}</span>
                          <Chip
                            size="small"
                            label={(periodStatusByValue.get(String(option.value)) || 'pendiente') === 'pagado' ? 'Pagado' : 'Pendiente'}
                            color={(periodStatusByValue.get(String(option.value)) || 'pendiente') === 'pagado' ? 'success' : 'warning'}
                            variant={(periodStatusByValue.get(String(option.value)) || 'pendiente') === 'pagado' ? 'filled' : 'outlined'}
                            sx={{ height: 22, fontWeight: 700 }}
                          />
                        </Box>
                      </MenuItem>
                    ))}
                  </TextField>
                  <TextField
                    size="small"
                    label="Fecha del pago"
                    type="date"
                    value={pagoForm.fecha_pago}
                    onChange={handlePagoField('fecha_pago')}
                    disabled={formularioPagoBloqueado}
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    size="small"
                    label="Monto"
                    type="number"
                    value={pagoForm.monto_base}
                    onChange={handlePagoField('monto_base')}
                    disabled={formularioPagoBloqueado}
                  />
                  <TextField
                    size="small"
                    label="Moneda"
                    select
                    value={pagoForm.moneda}
                    onChange={handlePagoField('moneda')}
                    disabled={formularioPagoBloqueado}
                  >
                    <MenuItem value="USD">USD</MenuItem>
                    <MenuItem value="VES">VES</MenuItem>
                  </TextField>
                </Box>
                <Typography sx={{ mt: 0.9, fontSize: 12, color: '#64748b', fontWeight: 600 }}>
                  Base mensual: {formatMoney(montoBaseConfigurado, pagoForm.moneda)} · Frecuencia {getFrecuenciaLabel(frecuenciaPago)} · Monto por pago sugerido: {formatMoney(montoBasePorPago, pagoForm.moneda)}
                </Typography>
                <Typography sx={{ mt: 0.45, fontSize: 12, color: '#0f766e', fontWeight: 700 }}>
                  Sugerido para este registro: {periodoSugeridoLabel} · {formatMoney(montoBasePorPago, pagoForm.moneda)}
                </Typography>

                <Box sx={{ display: 'grid', gap: 1.3, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, mt: 1.5 }}>
                  <Paper
                    sx={{
                      p: 1.2,
                      borderRadius: 2.2,
                      border: '1px solid #c7f3df',
                      bgcolor: '#ecfdf5',
                      boxShadow: '0 1px 0 rgba(16, 185, 129, 0.08) inset'
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#047857', letterSpacing: '0.02em' }}>BONO / AJUSTE</Typography>
                      <Paper
                        sx={{
                          px: 1,
                          py: 0.45,
                          borderRadius: 1.4,
                          border: '1px solid #d1fae5',
                          bgcolor: '#ffffff',
                          boxShadow: 'none',
                          minWidth: 92,
                          textAlign: 'right'
                        }}
                      >
                        <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#059669' }}>
                          {prefijoMonedaPago} {Number(pagoForm.bono_ajuste || 0).toFixed(0)}
                        </Typography>
                      </Paper>
                    </Box>
                    <TextField
                      size="small"
                      type="number"
                      value={pagoForm.bono_ajuste}
                      onChange={handlePagoField('bono_ajuste')}
                      disabled={formularioPagoBloqueado}
                      InputProps={{ startAdornment: <InputAdornment position="start">{prefijoMonedaPago}</InputAdornment> }}
                      sx={{
                        mt: 0.9,
                        width: '100%',
                        '& .MuiOutlinedInput-root': {
                          bgcolor: '#ffffff',
                          borderRadius: 1.6
                        }
                      }}
                    />
                    {!!(Number(pagoForm.bono_ajuste) > 0) && (
                      <TextField
                        size="small"
                        placeholder="Ej. Bono por torneo regional, horas extra"
                        value={pagoForm.nota_bono_ajuste}
                        onChange={handlePagoField('nota_bono_ajuste')}
                        disabled={formularioPagoBloqueado}
                        sx={{
                          mt: 0.9,
                          width: '100%',
                          '& .MuiOutlinedInput-root': {
                            bgcolor: '#f8fffb',
                            borderRadius: 1.6,
                            '& fieldset': { borderColor: '#d1fae5' }
                          },
                          '& .MuiInputBase-input::placeholder': {
                            color: '#6b7280',
                            opacity: 1
                          }
                        }}
                      />
                    )}
                  </Paper>
                  <Paper
                    sx={{
                      p: 1.2,
                      borderRadius: 2.2,
                      border: '1px solid #fde68a',
                      bgcolor: '#fffbeb',
                      boxShadow: '0 1px 0 rgba(217, 119, 6, 0.08) inset'
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#b45309', letterSpacing: '0.02em' }}>DEDUCCION</Typography>
                      <Paper
                        sx={{
                          px: 1,
                          py: 0.45,
                          borderRadius: 1.4,
                          border: '1px solid #fef3c7',
                          bgcolor: '#ffffff',
                          boxShadow: 'none',
                          minWidth: 92,
                          textAlign: 'right'
                        }}
                      >
                        <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#b45309' }}>
                          {prefijoMonedaPago} {Number(pagoForm.deduccion || 0).toFixed(0)}
                        </Typography>
                      </Paper>
                    </Box>
                    <TextField
                      size="small"
                      type="number"
                      value={pagoForm.deduccion}
                      onChange={handlePagoField('deduccion')}
                      disabled={formularioPagoBloqueado}
                      InputProps={{ startAdornment: <InputAdornment position="start">{prefijoMonedaPago}</InputAdornment> }}
                      sx={{
                        mt: 0.9,
                        width: '100%',
                        '& .MuiOutlinedInput-root': {
                          bgcolor: '#ffffff',
                          borderRadius: 1.6
                        }
                      }}
                    />
                    {!!(Number(pagoForm.deduccion) > 0) && (
                      <TextField
                        size="small"
                        placeholder="Ej. Adelanto, descuento por inasistencia"
                        value={pagoForm.nota_deduccion}
                        onChange={handlePagoField('nota_deduccion')}
                        disabled={formularioPagoBloqueado}
                        sx={{
                          mt: 0.9,
                          width: '100%',
                          '& .MuiOutlinedInput-root': {
                            bgcolor: '#fffef7',
                            borderRadius: 1.6,
                            '& fieldset': { borderColor: '#fef3c7' }
                          },
                          '& .MuiInputBase-input::placeholder': {
                            color: '#6b7280',
                            opacity: 1
                          }
                        }}
                      />
                    )}
                  </Paper>
                </Box>
              </Paper>

              <Paper sx={{ p: 1.8, borderRadius: 2.5, border: '1px solid #e8edf3', boxShadow: 'none' }}>
                <Typography sx={{ fontWeight: 800, color: '#0f172a', mb: 1.2 }}>2. Metodo de pago</Typography>
                <Box sx={{ display: 'grid', gap: 1.1, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
                  {paymentMethodOptions.map((method) => {
                    const Icon = method.icon;
                    const selected = pagoForm.metodo_pago === method.key;
                    return (
                      <Paper
                        key={method.key}
                        onClick={() => {
                          if (formularioPagoBloqueado) return;
                          setPagoForm((prev) => ({ ...prev, metodo_pago: method.key }));
                        }}
                        sx={{
                          p: 1.2,
                          borderRadius: 2,
                          border: '1px solid',
                          borderColor: selected ? '#5eead4' : '#e8edf3',
                          bgcolor: selected ? '#f0fdfa' : '#ffffff',
                          boxShadow: 'none',
                          cursor: formularioPagoBloqueado ? 'not-allowed' : 'pointer',
                          opacity: formularioPagoBloqueado ? 0.78 : 1
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box sx={{ width: 34, height: 34, borderRadius: 1.6, bgcolor: selected ? '#14b8a6' : '#f1f5f9', color: selected ? '#ffffff' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Icon sx={{ fontSize: 18 }} />
                          </Box>
                          <Box>
                            <Typography sx={{ fontWeight: 800, color: '#0f172a', fontSize: 14 }}>{method.label}</Typography>
                            <Typography sx={{ fontSize: 12, color: '#64748b' }}>{method.subtitle}</Typography>
                          </Box>
                        </Box>
                      </Paper>
                    );
                  })}
                </Box>

                <Paper sx={{ p: 1.1, mt: 1.2, borderRadius: 2, border: '1px solid #e8edf3', bgcolor: '#f8fafc', boxShadow: 'none' }}>
                  <Typography sx={{ fontSize: 11, color: '#64748b', fontWeight: 800, textTransform: 'uppercase' }}>
                    Datos del metodo seleccionado
                  </Typography>
                  <Typography sx={{ mt: 0.45, fontSize: 13, color: '#334155', fontWeight: 600 }}>
                    {detalleMetodoPago}
                  </Typography>
                </Paper>

                {mostrarReferencia && (
                  <>
                    <TextField
                      label="Referencia"
                      placeholder="Numero de referencia, transferencia o nota"
                      size="small"
                      value={pagoForm.referencia}
                      onChange={handlePagoField('referencia')}
                      disabled={formularioPagoBloqueado}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <ReceiptLongOutlinedIcon fontSize="small" />
                          </InputAdornment>
                        )
                      }}
                      sx={{ mt: 1.4, width: '100%' }}
                    />

                    <Box sx={{ mt: 1.2 }}>
                      <Button
                        component="label"
                        variant="outlined"
                        disabled={formularioPagoBloqueado}
                        startIcon={<CloudUploadIcon sx={{ fontSize: 18, color: '#94a3b8' }} />}
                        sx={{
                          textTransform: 'none',
                          fontWeight: 700,
                          borderStyle: 'dashed',
                          borderColor: '#cbd5e1',
                          color: '#334155',
                          borderRadius: 2,
                          width: '100%',
                          justifyContent: 'flex-start',
                          px: 1.4,
                          py: 0.85,
                          '&:hover': {
                            borderColor: '#94a3b8',
                            backgroundColor: '#f8fafc'
                          }
                        }}
                      >
                        Adjuntar comprobante (opcional)
                        <input
                          hidden
                          type="file"
                          accept="image/*,application/pdf"
                          disabled={formularioPagoBloqueado}
                          onChange={(e) => setComprobantePago(e.target.files?.[0] || null)}
                        />
                      </Button>

                      {comprobantePago && (
                        <Paper
                          sx={{
                            mt: 1,
                            p: 1,
                            borderRadius: 2,
                            border: '1px solid #e5e7eb',
                            bgcolor: '#f8fafc',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 1,
                            boxShadow: 'none'
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, minWidth: 0 }}>
                            <InsertDriveFileIcon sx={{ fontSize: 16, color: '#64748b' }} />
                            <Typography sx={{ fontSize: 12.5, color: '#334155', fontWeight: 700 }} noWrap>
                              {comprobantePago.name}
                            </Typography>
                          </Box>
                          <Button
                            size="small"
                            onClick={() => setComprobantePago(null)}
                            disabled={formularioPagoBloqueado}
                            sx={{ textTransform: 'none', minWidth: 'auto', px: 1, color: '#64748b' }}
                          >
                            Quitar
                          </Button>
                        </Paper>
                      )}
                    </Box>
                  </>
                )}
              </Paper>
            </Box>

            <Box sx={{ p: 2, bgcolor: '#fcfdff' }}>
              <Typography sx={{ fontSize: 12, color: '#64748b', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', mb: 1 }}>
                Resumen del pago
              </Typography>

              <Paper sx={{ p: 1.8, borderRadius: 2.5, background: 'linear-gradient(120deg, #0f172a 0%, #0b2342 55%, #0f766e 100%)', color: '#ffffff', boxShadow: 'none' }}>
                <Typography sx={{ fontSize: 12, opacity: 0.85, fontWeight: 700 }}>TOTAL A PAGAR</Typography>
                <Typography sx={{ mt: 0.3, fontSize: 44, lineHeight: 1, fontWeight: 900 }}>
                  {formatMoney(totalPago, pagoForm.moneda)}
                  <Typography component="span" sx={{ ml: 0.6, fontSize: 20, fontWeight: 700, opacity: 0.9 }}>
                    {pagoForm.moneda}
                  </Typography>
                </Typography>
                <Typography sx={{ mt: 0.7, fontSize: 13, opacity: 0.9, fontWeight: 700 }}>
                  {equivalenciaLabel}: {equivalenciaValue}
                </Typography>
                <Typography sx={{ mt: 0.2, fontSize: 12, opacity: 0.82, fontWeight: 700 }}>
                  Tasa del dia: {dolarLoading ? 'Cargando...' : (dolarError || tasaDiaBs == null ? 'No disponible' : `Bs ${tasaDiaBs.toFixed(2)}/USD`)}
                </Typography>
                <Box sx={{ mt: 1.3, pt: 1, borderTop: '1px solid rgba(255,255,255,0.2)', display: 'flex', justifyContent: 'space-between' }}>
                  <Typography sx={{ fontSize: 13, opacity: 0.92 }}>Salario base</Typography>
                  <Typography sx={{ fontSize: 13, fontWeight: 800 }}>{formatMoney(pagoForm.monto_base, pagoForm.moneda)}</Typography>
                </Box>
                {!!(Number(pagoForm.bono_ajuste) > 0) && (
                  <Box sx={{ mt: 0.6, display: 'flex', justifyContent: 'space-between' }}>
                    <Typography sx={{ fontSize: 13, opacity: 0.92 }}>+ Bono / ajuste</Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#86efac' }}>
                      {formatMoney(Number(pagoForm.bono_ajuste) || 0, pagoForm.moneda)}
                    </Typography>
                  </Box>
                )}
                {!!(Number(pagoForm.deduccion) > 0) && (
                  <Box sx={{ mt: 0.35, display: 'flex', justifyContent: 'space-between' }}>
                    <Typography sx={{ fontSize: 13, opacity: 0.92 }}>- Deduccion</Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#fde68a' }}>
                      -{formatMoney(Number(pagoForm.deduccion) || 0, pagoForm.moneda)}
                    </Typography>
                  </Box>
                )}
              </Paper>

              <Paper sx={{ p: 1.5, borderRadius: 2.5, border: '1px solid #e8edf3', boxShadow: 'none', mt: 1.3 }}>
                <Typography sx={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Periodo</Typography>
                <Typography sx={{ fontWeight: 800, color: '#0f172a' }}>{pagoForm.periodo}</Typography>
                <Typography sx={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, mt: 1 }}>Fecha del pago</Typography>
                <Typography sx={{ fontWeight: 800, color: '#0f172a' }}>{formatDate(pagoForm.fecha_pago)}</Typography>
                <Typography sx={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, mt: 1 }}>Metodo</Typography>
                <Typography sx={{ fontWeight: 800, color: '#0f172a' }}>{metodoPagoSeleccionado.label}</Typography>
                <Typography sx={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, mt: 1 }}>Frecuencia</Typography>
                <Typography sx={{ fontWeight: 800, color: '#0f172a' }}>{getFrecuenciaLabel(frecuenciaPago)}</Typography>
              </Paper>

              <Paper sx={{ p: 1.5, borderRadius: 2.5, border: '1px solid #e8edf3', boxShadow: 'none', mt: 1.3 }}>
                <Typography sx={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800, mb: 0.6 }}>Destinatario</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Avatar sx={{ width: 34, height: 34, background: palette.bg, color: palette.color, fontWeight: 900, fontSize: 14 }}>
                    {`${entrenador.nombre?.[0] || ''}${entrenador.apellido?.[0] || ''}`.toUpperCase()}
                  </Avatar>
                  <Box>
                    <Typography sx={{ fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>{entrenador.nombre} {entrenador.apellido}</Typography>
                    <Typography sx={{ color: '#64748b', fontSize: 12 }}>{trainerSedes[0] || 'Sin sede'}</Typography>
                  </Box>
                </Box>
                <Typography sx={{ mt: 1, color: '#64748b', fontSize: 12 }}>
                  Al confirmar, el pago queda registrado en el historial y la planilla del mes actualiza el estado del entrenador a Pagado.
                </Typography>
              </Paper>

              {formularioPagoBloqueado && (
                <Alert severity="info" sx={{ mt: 1.3, borderRadius: 2.5 }}>
                  Este periodo ya fue pagado. Los campos estan en solo lectura.
                </Alert>
              )}

              {pagoFeedback && (
                pagoFeedbackEsError ? (
                  <Alert severity="error" sx={{ mt: 1.3, borderRadius: 2.5 }}>
                    {pagoFeedback}
                  </Alert>
                ) : (
                  <Box
                    sx={{
                      mt: 1.3,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                      px: 1.25,
                      py: 0.85,
                      borderRadius: 1.8,
                      border: '1px solid #6ee7b7',
                      backgroundColor: '#d1fae5',
                      color: '#065f46',
                      boxShadow: '0 6px 14px rgba(15, 23, 42, 0.08)'
                    }}
                  >
                    <Box
                      sx={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: '#10b981',
                        flexShrink: 0
                      }}
                    />
                    <Typography component="span" sx={{ fontSize: 12.5, fontWeight: 800, lineHeight: 1.2 }}>
                      {pagoFeedback}
                    </Typography>
                  </Box>
                )
              )}

              {!pagoPeriodoActualRegistrado && (
                <Box sx={{ mt: 1.6, display: 'grid', gap: 1, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
                  <Button
                    variant="outlined"
                    onClick={() => {
                      setPagoFeedback('');
                      setActiveTab('resumen');
                    }}
                    sx={{
                      textTransform: 'none',
                      fontWeight: 700,
                      width: '100%',
                      borderColor: '#94a3b8',
                      color: '#475569',
                      '&:hover': {
                        borderColor: '#64748b',
                        backgroundColor: '#f8fafc'
                      }
                    }}
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleAbrirConfirmarPago}
                    disabled={submittingPago}
                    sx={{ textTransform: 'none', fontWeight: 800, width: '100%', bgcolor: '#059669', '&:hover': { bgcolor: '#047857' } }}
                  >
                    {submittingPago ? 'Guardando...' : 'Confirmar pago'}
                  </Button>
                </Box>
              )}
            </Box>
          </Box>

        </Paper>
      )}
      {activeTab === 'historial' && (
        <Paper sx={{ borderRadius: 3.5, border: '1px solid #e6ebf2', boxShadow: 'none', overflow: 'hidden' }}>
          <Box sx={{ p: 2, borderBottom: '1px solid #eef2f7', bgcolor: '#fbfdff' }}>
            <Typography sx={{ fontWeight: 900, color: '#0f172a', fontSize: 24 }}>Historial de pagos</Typography>
            <Typography sx={{ color: '#64748b', mt: 0.5 }}>
              Pagos de nómina ya registrados para este entrenador.
            </Typography>
          </Box>

          <Box sx={{ p: 2 }}>
            <Box sx={{ display: 'grid', gap: 1.2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, mb: 1.5 }}>
              <TextField
                select
                size="small"
                label="Filtrar por mes"
                value={historialMesFiltro}
                onChange={(event) => setHistorialMesFiltro(event.target.value)}
              >
                <MenuItem value="todos">Todos los meses</MenuItem>
                {historialMesOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                ))}
              </TextField>

              <TextField
                select
                size="small"
                label="Filtrar por periodo"
                value={historialPeriodoFiltro}
                onChange={(event) => setHistorialPeriodoFiltro(event.target.value)}
              >
                <MenuItem value="todos">Todos los periodos</MenuItem>
                {historialPeriodoOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                ))}
              </TextField>

              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 1, flexWrap: 'wrap' }}>
                <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#0f766e', bgcolor: '#ecfdf5', px: 1.2, py: 0.5, borderRadius: 999 }}>
                  {pagosNominaFiltrados.length} registro{pagosNominaFiltrados.length === 1 ? '' : 's'}
                </Typography>
                {(historialMesFiltro !== 'todos' || historialPeriodoFiltro !== 'todos') && (
                  <Button
                    size="small"
                    onClick={() => {
                      setHistorialMesFiltro('todos');
                      setHistorialPeriodoFiltro('todos');
                    }}
                    sx={{ textTransform: 'none', fontWeight: 700, color: '#0f172a' }}
                  >
                    Limpiar filtros
                  </Button>
                )}
              </Box>
            </Box>

            {pagosNominaOrdenados.length === 0 ? (
              <Paper sx={{ p: 2, borderRadius: 2.5, border: '1px dashed #dbe3ec', bgcolor: '#f8fafc', boxShadow: 'none' }}>
                <Typography sx={{ fontWeight: 800, color: '#0f172a' }}>No hay pagos registrados todavía.</Typography>
                <Typography sx={{ color: '#64748b', mt: 0.35 }}>
                  Cuando confirmes un pago, aparecerá aquí con su fecha, monto y método.
                </Typography>
              </Paper>
            ) : pagosNominaFiltrados.length === 0 ? (
              <Paper sx={{ p: 2, borderRadius: 2.5, border: '1px dashed #dbe3ec', bgcolor: '#f8fafc', boxShadow: 'none' }}>
                <Typography sx={{ fontWeight: 800, color: '#0f172a' }}>No hay pagos que coincidan con esos filtros.</Typography>
                <Typography sx={{ color: '#64748b', mt: 0.35 }}>
                  Prueba con otro mes o periodo, o limpia los filtros para ver todo el historial.
                </Typography>
              </Paper>
            ) : (
              <Box sx={{ display: 'grid', gap: 1.2 }}>
                {pagosNominaFiltrados.map((pago, index) => (
                  <Paper
                    key={`${pago?.periodo_clave || pago?.fecha_pago || 'pago'}-${index}`}
                    sx={{
                      p: 1.5,
                      borderRadius: 2.5,
                      border: '1px solid #e8edf3',
                      bgcolor: '#fcfdff',
                      boxShadow: 'none'
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1.2, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 900, color: '#0f172a' }}>
                          {pago?.periodo || pago?.periodo_clave || 'Periodo sin nombre'}
                        </Typography>
                        <Typography sx={{ color: '#64748b', fontSize: 13, mt: 0.2 }}>
                          Fecha: {formatDate(pago?.fecha_pago)} · Método: {paymentMethodOptions.find((item) => item.key === pago?.metodo_pago)?.label || pago?.metodo_pago || 'Sin método'}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography sx={{ fontWeight: 900, color: '#0f172a', fontSize: 18 }}>
                          {formatMoney(pago?.monto_total_usd, 'USD')}
                        </Typography>
                        <Typography sx={{ color: '#64748b', fontSize: 12 }}>
                          Bs {Number(pago?.monto_total_ves || 0).toFixed(2)} · Tasa {Number(pago?.tasa_bcv || 0).toFixed(2)}
                        </Typography>
                      </Box>
                    </Box>

                    <Box sx={{ mt: 1.2, display: 'grid', gap: 1, gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' } }}>
                      <Box>
                        <Typography sx={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Monto</Typography>
                        <Typography sx={{ fontWeight: 800, color: '#0f172a' }}>{formatMoney(pago?.monto_base_pago_usd, 'USD')}</Typography>
                      </Box>
                      <Box>
                        <Typography sx={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Bono / ajuste</Typography>
                        <Typography sx={{ fontWeight: 800, color: '#0f172a' }}>{formatMoney(pago?.bono_usd, 'USD')}</Typography>
                      </Box>
                      <Box>
                        <Typography sx={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Deducción</Typography>
                        <Typography sx={{ fontWeight: 800, color: '#0f172a' }}>{formatMoney(pago?.deduccion_usd, 'USD')}</Typography>
                      </Box>
                      <Box>
                        <Typography sx={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>Referencia</Typography>
                        <Typography sx={{ fontWeight: 800, color: '#0f172a' }}>{pago?.referencia || 'Sin referencia'}</Typography>
                      </Box>
                    </Box>

                    {!!pago?.observacion && (
                      <Typography sx={{ mt: 1, fontSize: 13, color: '#475569' }}>
                        Nota: {pago.observacion}
                      </Typography>
                    )}
                  </Paper>
                ))}
              </Box>
            )}
          </Box>
        </Paper>
      )}
      {/* Tab oculta temporalmente:
      {activeTab === 'documentos' && <EmptyTab title="Documentos" />}
      */}
      </>
      )}
    </div>
  );
}

export default EntrenadorDetalleView;
