import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Fade,
  Grid,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import CreditCardOutlinedIcon from '@mui/icons-material/CreditCardOutlined';
import AttachMoneyOutlinedIcon from '@mui/icons-material/AttachMoneyOutlined';
import SwapHorizOutlinedIcon from '@mui/icons-material/SwapHorizOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import UploadFileOutlinedIcon from '@mui/icons-material/UploadFileOutlined';
import PendingOutlinedIcon from '@mui/icons-material/PendingOutlined';
import CheckCircleOutlineOutlinedIcon from '@mui/icons-material/CheckCircleOutlineOutlined';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import SportsSoccerOutlinedIcon from '@mui/icons-material/SportsSoccerOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import HomeWorkOutlinedIcon from '@mui/icons-material/HomeWorkOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import FavoriteBorderOutlinedIcon from '@mui/icons-material/FavoriteBorderOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import ConstructionOutlinedIcon from '@mui/icons-material/ConstructionOutlined';
import RoomServiceOutlinedIcon from '@mui/icons-material/RoomServiceOutlined';
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import { hasPermission } from '../utils/permissions';
import { mediaUrl } from '../utils/mediaUrl';
import { useDolar } from '../context/DolarContext';
import { obtenerTasaOficialPorFecha, obtenerTasaEuroOficialPorFecha } from '../utils/dolarHistorico';

const METODOS_PAGO = [
  { value: 'Pago movil', label: 'Pago movil', icon: SwapHorizOutlinedIcon },
  { value: 'Transferencia', label: 'Transferencia', icon: SwapHorizOutlinedIcon },
  { value: 'Tarjeta', label: 'Tarjeta', icon: CreditCardOutlinedIcon },
  { value: 'Efectivo', label: 'Efectivo', icon: AttachMoneyOutlinedIcon },
];

const ESTADOS = [
  { value: 'Pendiente', label: 'Pendiente', color: '#f59e0b', border: '#f59e0b', icon: PendingOutlinedIcon },
  { value: 'Pagado', label: 'Pagado', color: '#22c55e', border: '#22c55e', icon: CheckCircleOutlineOutlinedIcon }
];

const SECTION_CARD_SX = {
  p: 2,
  borderRadius: 2.5,
  border: '1px solid #e7ebf3',
  boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
  background: '#ffffff'
};

const CATEGORY_ICON_MAP = {
  sports: SportsSoccerOutlinedIcon,
  personal: PersonOutlineOutlinedIcon,
  instalaciones: HomeWorkOutlinedIcon,
  servicios: BoltOutlinedIcon,
  marketing: CampaignOutlinedIcon,
  salud: FavoriteBorderOutlinedIcon,
  varios: CategoryOutlinedIcon,
  mantenimiento: ConstructionOutlinedIcon,
  atencion: RoomServiceOutlinedIcon,
  pagos: PaidOutlinedIcon,
};

function resolveCategoriaIcon(iconKey = '') {
  const key = String(iconKey || '').trim().toLowerCase();
  return CATEGORY_ICON_MAP[key] || CategoryOutlinedIcon;
}

function toInputDate(value) {
  if (!value) return '';
  const date = parseAsLocalDate(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseAsLocalDate(value) {
  if (!value) return null;
  const text = String(value).trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const localDate = new Date(year, month - 1, day);
    return Number.isNaN(localDate.getTime()) ? null : localDate;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatMoney(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return '$--';
  return `$${number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getCurrencySymbol(currency) {
  const key = String(currency || 'USD').trim().toUpperCase();
  if (key === 'EUR') return '€';
  if (key === 'VES') return 'Bs';
  return '$';
}

function formatMoneyByCurrency(value, currency) {
  const symbol = getCurrencySymbol(currency);
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return `${symbol}--`;

  if (symbol === 'Bs') {
    return `Bs ${number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  return `${symbol}${number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatMoneyWithSymbol(value, symbol = '$') {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return `${symbol}--`;
  return `${symbol}${number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatBs(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return 'Bs --';
  return `Bs ${number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatShortDate(value) {
  if (!value) return '--';
  const date = parseAsLocalDate(value);
  if (!date || Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function getMonthKey(value) {
  if (!value) return null;
  const date = parseAsLocalDate(value);
  if (!date || Number.isNaN(date.getTime())) return null;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

function formatMonthLabel(monthKey) {
  if (!monthKey || monthKey === 'all') return 'Todos los meses';
  const [year, month] = String(monthKey).split('-');
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(date.getTime())) return monthKey;
  const label = date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function getStatusChipStyles(estado = '') {
  const normalized = String(estado || '').toLowerCase();
  if (normalized === 'pagado') {
    return { bg: '#dcfce7', color: '#15803d', dot: '#22c55e' };
  }
  return { bg: '#fef3c7', color: '#a16207', dot: '#f59e0b' };
}

function getCategoryColor(nombre = '', colorAcento = '') {
  const backendColor = String(colorAcento || '').trim();
  if (/^#([0-9a-fA-F]{6})$/.test(backendColor)) {
    return backendColor.toLowerCase();
  }

  const colors = ['#f97316', '#10b981', '#6366f1', '#a855f7', '#3b82f6', '#ef4444'];
  const text = String(nombre || 'categoria').toLowerCase();
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

function resolveComprobanteUrl(apiBase, value) {
  if (!value || typeof value !== 'string') return '';
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('blob:') || value.startsWith('data:')) {
    return value;
  }

  const normalized = mediaUrl(value);
  if (normalized) return normalized;

  if (value.startsWith('/')) return `${apiBase.replace(/\/$/, '')}${value}`;
  return value;
}

function Egresos() {
  const apiBase = useMemo(() => process.env.REACT_APP_API_URL || window.location.origin, []);
  const { dolar } = useDolar();

  const [loadingCatalogo, setLoadingCatalogo] = useState(true);
  const [loadingEgresos, setLoadingEgresos] = useState(true);
  const [guardandoEgreso, setGuardandoEgreso] = useState(false);
  const [eliminandoEgresoId, setEliminandoEgresoId] = useState('');
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [egresoEditandoId, setEgresoEditandoId] = useState('');
  const [catalogo, setCatalogo] = useState([]);
  const [egresos, setEgresos] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [comprobante, setComprobante] = useState(null);

  const [openCategoriaDialog, setOpenCategoriaDialog] = useState(false);
  const [openSubcategoriaDialog, setOpenSubcategoriaDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);
  const [egresoAEliminar, setEgresoAEliminar] = useState(null);
  const [nuevaCategoria, setNuevaCategoria] = useState({ nombre: '', codigo: '' });
  const [nuevaSubcategoria, setNuevaSubcategoria] = useState({ nombre: '', codigo: '' });
  const [guardandoCategoria, setGuardandoCategoria] = useState(false);
  const [guardandoSubcategoria, setGuardandoSubcategoria] = useState(false);
  const [mesFiltro, setMesFiltro] = useState(getMonthKey(new Date()) || 'all');
  const [categoriaFiltro, setCategoriaFiltro] = useState('all');
  const [estadoFiltro, setEstadoFiltro] = useState('all');
  const [proveedorBusqueda, setProveedorBusqueda] = useState('');

  const [form, setForm] = useState({
    fecha_pago: toInputDate(new Date()),
    monto: '',
    moneda: 'USD',
    tipo_tasa: 'USD',
    tasa_referencia: '',
    categoria_id: '',
    subcategoria_id: '',
    metodo_pago: 'Tarjeta',
    proveedor: '',
    estado: 'Pendiente',
    observaciones: ''
  });
  const formHistoryPushedRef = useRef(false);

  const canManage = hasPermission('egresos.manage');
  const isEditing = Boolean(egresoEditandoId);

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const categoriaSeleccionada = useMemo(
    () => catalogo.find((item) => String(item._id) === String(form.categoria_id || '')) || null,
    [catalogo, form.categoria_id]
  );

  const subcategoriasDisponibles = useMemo(
    () => (categoriaSeleccionada?.subcategorias || []).filter((item) => item?.activo !== false),
    [categoriaSeleccionada]
  );

  const simboloDivisa = form.tipo_tasa === 'EUR' ? '€' : '$';
  const etiquetaDivisa = form.tipo_tasa === 'EUR' ? 'EUR' : 'USD';
  const etiquetaTasa = `Bs por ${etiquetaDivisa}`;

  const equivalenteBs = useMemo(() => {
    const monto = Number(form.monto);
    const tasa = Number(form.tasa_referencia);
    if (!Number.isFinite(monto) || monto <= 0) return null;
    if (!Number.isFinite(tasa) || tasa <= 0) return null;
    return monto * tasa;
  }, [form.monto, form.tasa_referencia]);

  const resumen = useMemo(() => ({
    categoria: categoriaSeleccionada?.nombre || '--',
    metodo: form.metodo_pago || '--',
    estado: form.estado || '--',
    total: formatMoneyWithSymbol(form.monto, simboloDivisa),
    equivalenteBs: formatBs(equivalenteBs)
  }), [categoriaSeleccionada?.nombre, form.metodo_pago, form.estado, form.monto, simboloDivisa, equivalenteBs]);

  const mesesDisponibles = useMemo(() => {
    const keys = new Set();
    egresos.forEach((egreso) => {
      const key = getMonthKey(egreso?.fecha_pago || egreso?.fecha_emision || egreso?.createdAt);
      if (key) keys.add(key);
    });
    return Array.from(keys).sort((a, b) => String(b).localeCompare(String(a)));
  }, [egresos]);

  const categoriasDisponiblesListado = useMemo(() => {
    const names = new Set();
    egresos.forEach((egreso) => {
      const nombre = String(egreso?.categoria_id?.nombre || '').trim();
      if (nombre) names.add(nombre);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  }, [egresos]);

  const categoriaMetaPorNombre = useMemo(() => {
    const map = new Map();
    (catalogo || []).forEach((categoria) => {
      const nombre = String(categoria?.nombre || '').trim();
      if (!nombre) return;
      map.set(nombre, {
        icono: String(categoria?.icono || 'category'),
        color: String(categoria?.color_acento || '#4f46e5')
      });
    });
    return map;
  }, [catalogo]);

  const egresosFiltrados = useMemo(() => {
    const term = String(proveedorBusqueda || '').trim().toLowerCase();

    return egresos.filter((egreso) => {
      const fechaRef = egreso?.fecha_pago || egreso?.fecha_emision || egreso?.createdAt;
      const monthKey = getMonthKey(fechaRef);
      if (mesFiltro !== 'all' && monthKey !== mesFiltro) return false;

      const categoriaNombre = String(egreso?.categoria_id?.nombre || '').trim();
      if (categoriaFiltro !== 'all' && categoriaNombre !== categoriaFiltro) return false;

      const estado = String(egreso?.estado || '').trim();
      if (estadoFiltro !== 'all' && estado !== estadoFiltro) return false;

      const proveedor = String(egreso?.proveedor || '').toLowerCase();
      if (term && !proveedor.includes(term)) return false;

      return true;
    });
  }, [egresos, mesFiltro, categoriaFiltro, estadoFiltro, proveedorBusqueda]);

  const kpis = useMemo(() => {
    const totalMes = egresosFiltrados.reduce((acc, item) => acc + (Number(item?.monto) || 0), 0);
    const pagados = egresosFiltrados.filter((item) => String(item?.estado || '').toLowerCase() === 'pagado');
    const pendientes = egresosFiltrados.filter((item) => String(item?.estado || '').toLowerCase() === 'pendiente');

    return {
      totalMes,
      totalRows: egresosFiltrados.length,
      pagados: {
        total: pagados.reduce((acc, item) => acc + (Number(item?.monto) || 0), 0),
        cantidad: pagados.length
      },
      pendientes: {
        total: pendientes.reduce((acc, item) => acc + (Number(item?.monto) || 0), 0),
        cantidad: pendientes.length
      }
    };
  }, [egresosFiltrados]);

  const cargarCatalogo = useCallback(async () => {
    try {
      setLoadingCatalogo(true);
      setError('');
      const res = await fetch(`${apiBase}/api/egresos/categorias`, {
        headers: getAuthHeaders()
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'No se pudo cargar el catalogo de categorias');
      }
      setCatalogo(Array.isArray(payload?.categorias) ? payload.categorias : []);
    } catch (err) {
      setError(err.message || 'No se pudo cargar el catalogo de categorias');
      setCatalogo([]);
    } finally {
      setLoadingCatalogo(false);
    }
  }, [apiBase, getAuthHeaders]);

  const cargarEgresos = useCallback(async () => {
    try {
      setLoadingEgresos(true);
      setError('');
      const res = await fetch(`${apiBase}/api/egresos?limit=50`, {
        headers: getAuthHeaders()
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'No se pudo cargar el listado de egresos');
      }
      setEgresos(Array.isArray(payload?.items) ? payload.items : []);
    } catch (err) {
      setError(err.message || 'No se pudo cargar el listado de egresos');
      setEgresos([]);
    } finally {
      setLoadingEgresos(false);
    }
  }, [apiBase, getAuthHeaders]);

  useEffect(() => {
    cargarCatalogo();
    cargarEgresos();
  }, [cargarCatalogo, cargarEgresos]);

  useEffect(() => {
    let cancelado = false;

    const cargarTasaSugerida = async () => {
      const fecha = String(form.fecha_pago || '').trim() || toInputDate(new Date());
      const tasaContexto = Number(dolar?.promedio) || null;
      const monedaContexto = String(dolar?.moneda || '').trim().toUpperCase();

      const fallbackUsd = monedaContexto === 'USD' ? tasaContexto : null;
      const fallbackEuro = monedaContexto === 'EUR' ? tasaContexto : null;

      try {
        const tasa = form.tipo_tasa === 'EUR'
          ? await obtenerTasaEuroOficialPorFecha(fecha, fallbackEuro)
          : await obtenerTasaOficialPorFecha(fecha, fallbackUsd);

        if (cancelado) return;

        if (Number.isFinite(Number(tasa)) && Number(tasa) > 0) {
          setForm((prev) => ({
            ...prev,
            tasa_referencia: Number(tasa).toFixed(2)
          }));
          return;
        }

        setForm((prev) => ({
          ...prev,
          tasa_referencia: ''
        }));
      } catch (_) {
        if (cancelado) return;
        setForm((prev) => ({
          ...prev,
          tasa_referencia: ''
        }));
      }
    };

    cargarTasaSugerida();

    return () => {
      cancelado = true;
    };
  }, [form.tipo_tasa, form.fecha_pago, dolar?.promedio, dolar?.moneda]);

  const actualizarCampo = (campo, valor) => {
    setForm((prev) => ({
      ...prev,
      [campo]: valor
    }));
  };

  const seleccionarCategoria = (categoriaId) => {
    setForm((prev) => ({
      ...prev,
      categoria_id: categoriaId,
      subcategoria_id: ''
    }));
  };

  const resetFormulario = () => {
    setForm({
      fecha_pago: toInputDate(new Date()),
      monto: '',
      moneda: 'USD',
      tipo_tasa: 'USD',
      tasa_referencia: '',
      categoria_id: '',
      subcategoria_id: '',
      metodo_pago: 'Tarjeta',
      proveedor: '',
      estado: 'Pendiente',
      observaciones: ''
    });
    setComprobante(null);
    setEgresoEditandoId('');
  };

  const abrirFormularioNuevo = () => {
    resetFormulario();
    setMostrarFormulario(true);
  };

  const cerrarFormulario = () => {
    if (formHistoryPushedRef.current) {
      window.history.back();
      return;
    }

    resetFormulario();
    setMostrarFormulario(false);
  };

  const editarEgreso = (egreso) => {
    const categoriaId = String(egreso?.categoria_id?._id || '');
    const subcategoriaId = String(egreso?.subcategoria_id?._id || '');
    const estadoRaw = String(egreso?.estado || 'Pendiente').trim() || 'Pendiente';
    const estado = estadoRaw === 'Rechazado' ? 'Pendiente' : estadoRaw;
    const monedaEgreso = String(egreso?.moneda || 'USD').trim().toUpperCase();
    const tipoTasa = monedaEgreso === 'EUR' ? 'EUR' : 'USD';

    setEgresoEditandoId(String(egreso?._id || ''));
    setForm({
      fecha_pago: toInputDate(egreso?.fecha_pago || egreso?.fecha_emision || egreso?.createdAt),
      monto: egreso?.monto !== undefined && egreso?.monto !== null ? String(egreso.monto) : '',
      moneda: tipoTasa,
      tipo_tasa: tipoTasa,
      tasa_referencia: egreso?.tasa_referencia !== undefined && egreso?.tasa_referencia !== null ? String(egreso.tasa_referencia) : '',
      categoria_id: categoriaId,
      subcategoria_id: subcategoriaId,
      metodo_pago: String(egreso?.metodo_pago || 'Tarjeta').trim() || 'Tarjeta',
      proveedor: String(egreso?.proveedor || '').trim(),
      estado,
      observaciones: String(egreso?.observaciones || '').trim()
    });
    setComprobante(null);
    setMostrarFormulario(true);
    setError('');
  };

  useEffect(() => {
    if (!canManage || !mostrarFormulario || formHistoryPushedRef.current) return;
    window.history.pushState({ ...window.history.state, __egresosForm: true }, '');
    formHistoryPushedRef.current = true;
  }, [canManage, mostrarFormulario]);

  useEffect(() => {
    const handlePopState = () => {
      if (!formHistoryPushedRef.current) return;
      formHistoryPushedRef.current = false;
      resetFormulario();
      setMostrarFormulario(false);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const crearCategoria = async () => {
    try {
      setGuardandoCategoria(true);
      setError('');
      const res = await fetch(`${apiBase}/api/egresos/categorias`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(nuevaCategoria)
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'No se pudo crear la categoria');
      }

      await cargarCatalogo();
      seleccionarCategoria(String(payload?._id || ''));
      setOpenCategoriaDialog(false);
      setNuevaCategoria({ nombre: '', codigo: '' });
      setSuccess('Categoria creada y seleccionada');
    } catch (err) {
      setError(err.message || 'No se pudo crear la categoria');
    } finally {
      setGuardandoCategoria(false);
    }
  };

  const crearSubcategoria = async () => {
    try {
      if (!form.categoria_id) {
        setError('Selecciona una categoria antes de crear subcategoria');
        return;
      }

      setGuardandoSubcategoria(true);
      setError('');
      const res = await fetch(`${apiBase}/api/egresos/categorias/${form.categoria_id}/subcategorias`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(nuevaSubcategoria)
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'No se pudo crear la subcategoria');
      }

      await cargarCatalogo();
      actualizarCampo('subcategoria_id', String(payload?._id || ''));
      setOpenSubcategoriaDialog(false);
      setNuevaSubcategoria({ nombre: '', codigo: '' });
      setSuccess('Subcategoria creada y seleccionada');
    } catch (err) {
      setError(err.message || 'No se pudo crear la subcategoria');
    } finally {
      setGuardandoSubcategoria(false);
    }
  };

  const guardarEgreso = async (event) => {
    event.preventDefault();

    try {
      setGuardandoEgreso(true);
      setError('');

      const fechaPago = String(form.fecha_pago || '').trim();
      if (!fechaPago) {
        throw new Error('La fecha de pago es obligatoria');
      }

      const egresoPayload = {
        fecha_emision: fechaPago,
        fecha_pago: fechaPago,
        monto: form.monto,
        moneda: String(form.tipo_tasa || 'USD').toUpperCase(),
        tasa_referencia: form.tasa_referencia,
        categoria_id: form.categoria_id,
        subcategoria_id: form.subcategoria_id,
        metodo_pago: form.metodo_pago,
        proveedor: form.proveedor,
        estado: form.estado,
        observaciones: form.observaciones
      };

      let res;
      if (isEditing) {
        res = await fetch(`${apiBase}/api/egresos/${egresoEditandoId}`, {
          method: 'PATCH',
          headers: {
            ...getAuthHeaders(),
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(egresoPayload)
        });
      } else {
        const formData = new FormData();
        Object.entries(egresoPayload).forEach(([key, value]) => {
          if (value === undefined || value === null || value === '') return;
          formData.append(key, value);
        });

        if (comprobante) {
          formData.append('comprobante', comprobante);
        }

        res = await fetch(`${apiBase}/api/egresos`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: formData
        });
      }

      const responsePayload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(responsePayload?.error || (isEditing ? 'No se pudo actualizar el egreso' : 'No se pudo registrar el egreso'));
      }

      cerrarFormulario();
      setSuccess(isEditing ? 'Egreso actualizado correctamente' : 'Egreso registrado correctamente');
      await cargarEgresos();
    } catch (err) {
      setError(err.message || (isEditing ? 'No se pudo actualizar el egreso' : 'No se pudo registrar el egreso'));
    } finally {
      setGuardandoEgreso(false);
    }
  };

  const abrirConfirmacionEliminar = (egreso) => {
    setEgresoAEliminar(egreso || null);
    setOpenDeleteDialog(true);
  };

  const cerrarConfirmacionEliminar = () => {
    if (eliminandoEgresoId) return;
    setOpenDeleteDialog(false);
    setEgresoAEliminar(null);
  };

  const eliminarEgreso = async () => {
    const egresoId = String(egresoAEliminar?._id || '').trim();
    if (!egresoId) return;

    try {
      setEliminandoEgresoId(egresoId);
      setError('');

      const res = await fetch(`${apiBase}/api/egresos/${egresoId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'No se pudo eliminar el egreso');
      }

      if (egresoEditandoId && egresoEditandoId === egresoId) {
        cerrarFormulario();
      }

      setSuccess('Egreso eliminado correctamente');
      setOpenDeleteDialog(false);
      setEgresoAEliminar(null);
      await cargarEgresos();
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el egreso');
    } finally {
      setEliminandoEgresoId('');
    }
  };

  return (
    <Box sx={{ width: '100%', maxWidth: '100%', pr: { xs: 0, md: 2 }, overflowX: 'hidden' }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="h5" sx={{ fontWeight: 800, color: '#111827' }}>
          {mostrarFormulario ? (isEditing ? 'Editar Egreso' : 'Nuevo Egreso') : 'Egresos'}
        </Typography>

        {canManage && !mostrarFormulario && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={abrirFormularioNuevo}
            sx={{
              borderRadius: 2.5,
              textTransform: 'none',
              fontWeight: 800,
              px: 2.2,
              py: 1,
              background: '#4f46e5',
              '&:hover': { background: '#4338ca' }
            }}
          >
            Agregar Nuevo Egreso
          </Button>
        )}
      </Stack>

      <Paper sx={{ p: { xs: 1.5, md: 2.5 }, borderRadius: 3, border: '1px solid #e7ebf3', boxShadow: 'none', maxWidth: '100%', background: '#f8fafc', overflowX: 'hidden' }}>
        <Fade in={Boolean(canManage && mostrarFormulario)} timeout={220} mountOnEnter unmountOnExit>
          <Box component="form" id="egreso-form" onSubmit={guardarEgreso}>
          <Grid container spacing={2} alignItems="flex-start" sx={{ width: '100%', maxWidth: '100%', m: 0 }}>
            <Grid item size={{ xs: 12, lg: 8 }} sx={{ minWidth: 0 }}>
              <Stack spacing={2}>
                <Paper sx={SECTION_CARD_SX}>
                  <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#334155', mb: 2, letterSpacing: '0.02em' }}>
                    INFORMACION GENERAL
                  </Typography>

                  <Grid container spacing={2}>
                    <Grid item size={{ xs: 12, md: 6 }}>
                      <TextField
                        type="date"
                        label="Fecha de Pago"
                        fullWidth
                        required
                        size="small"
                        InputLabelProps={{ shrink: true }}
                        value={form.fecha_pago}
                        onChange={(e) => actualizarCampo('fecha_pago', e.target.value)}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, background: '#fff' } }}
                      />
                    </Grid>

                    <Grid item size={{ xs: 12, md: 6 }}>
                      <TextField
                        type="number"
                        label={`Monto en ${etiquetaDivisa}`}
                        fullWidth
                        required
                        size="small"
                        inputProps={{ min: 0.01, step: '0.01' }}
                        placeholder="0.00"
                        value={form.monto}
                        onChange={(e) => actualizarCampo('monto', e.target.value)}
                        InputProps={{
                          startAdornment: <InputAdornment position="start">{simboloDivisa}</InputAdornment>
                        }}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, background: '#fff' } }}
                      />
                    </Grid>

                    <Grid item size={{ xs: 12, md: 6 }}>
                      <FormControl fullWidth size="small" sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, background: '#fff' } }}>
                        <InputLabel>Tipo de tasa</InputLabel>
                        <Select
                          label="Tipo de tasa"
                          value={form.tipo_tasa}
                          onChange={(e) => {
                            const tipoTasa = String(e.target.value || 'USD').toUpperCase();
                            setForm((prev) => ({
                              ...prev,
                              tipo_tasa: tipoTasa,
                              moneda: tipoTasa
                            }));
                          }}
                        >
                          <MenuItem value="USD">Dolar (USD)</MenuItem>
                          <MenuItem value="EUR">Euro (EUR)</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>

                    <Grid item size={{ xs: 12, md: 6 }}>
                      <TextField
                        type="number"
                        label={etiquetaTasa}
                        fullWidth
                        required
                        size="small"
                        inputProps={{ min: 0.01, step: '0.01' }}
                        placeholder="0.00"
                        value={form.tasa_referencia}
                        onChange={(e) => actualizarCampo('tasa_referencia', e.target.value)}
                        InputProps={{
                          startAdornment: <InputAdornment position="start">Bs/</InputAdornment>
                        }}
                        helperText="Se autocompleta con la tasa oficial de la fecha, pero puedes ajustarla."
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, background: '#fff' } }}
                      />
                    </Grid>

                    <Grid item size={{ xs: 12, md: 6 }}>
                      <TextField
                        label="Equivalente en Bs"
                        fullWidth
                        size="small"
                        value={equivalenteBs ? formatBs(equivalenteBs) : 'Bs --'}
                        InputProps={{ readOnly: true }}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, background: '#f8fafc' } }}
                      />
                    </Grid>

                    <Grid item size={{ xs: 12, md: 6 }}>
                      <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#334155', mb: 0.75 }}>
                        Metodo de Pago *
                      </Typography>
                      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                        {METODOS_PAGO.map((metodo) => {
                          const selected = form.metodo_pago === metodo.value;
                          const Icon = metodo.icon;
                          return (
                            <Button
                              key={metodo.value}
                              variant={selected ? 'contained' : 'outlined'}
                              startIcon={<Icon sx={{ fontSize: 16 }} />}
                              onClick={() => actualizarCampo('metodo_pago', metodo.value)}
                              sx={{
                                textTransform: 'none',
                                borderRadius: 2,
                                minWidth: 88,
                                px: 1.2,
                                boxShadow: 'none',
                                fontWeight: 700,
                                fontSize: 12,
                                ...(selected
                                  ? { background: '#4f46e5', '&:hover': { background: '#4338ca' } }
                                  : { borderColor: '#d1d5db', color: '#334155' })
                              }}
                            >
                              {metodo.label}
                            </Button>
                          );
                        })}
                      </Stack>
                    </Grid>
                  </Grid>
                </Paper>

                <Paper sx={SECTION_CARD_SX}>
                  <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#334155', mb: 2, letterSpacing: '0.02em' }}>
                    CLASIFICACION
                  </Typography>

                  <Grid container spacing={2}>
                    <Grid item size={{ xs: 12, md: 6 }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <FormControl
                          fullWidth
                          required
                          disabled={loadingCatalogo}
                          sx={{ '& .MuiOutlinedInput-root': { height: 40, borderRadius: 2, background: '#fff' } }}
                        >
                          <InputLabel>Categoria</InputLabel>
                          <Select
                            label="Categoria"
                            size="small"
                            value={form.categoria_id}
                            onChange={(e) => {
                              const value = String(e.target.value || '');
                              if (value === '__crear_categoria__') {
                                setOpenCategoriaDialog(true);
                                return;
                              }
                              seleccionarCategoria(value);
                            }}
                          >
                            {catalogo.map((categoria) => (
                              <MenuItem key={String(categoria._id)} value={String(categoria._id)}>
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                                  <Box
                                    sx={{
                                      width: 20,
                                      height: 20,
                                      borderRadius: '50%',
                                      background: String(categoria?.color_acento || '#4f46e5'),
                                      color: '#fff',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      flex: '0 0 20px'
                                    }}
                                  >
                                    {React.createElement(resolveCategoriaIcon(categoria?.icono), { sx: { fontSize: 13 } })}
                                  </Box>
                                  <Typography sx={{ fontSize: 14 }} noWrap>
                                    {categoria.nombre}
                                  </Typography>
                                </Stack>
                              </MenuItem>
                            ))}
                            <MenuItem value="__crear_categoria__">+ Crear nueva categoria</MenuItem>
                          </Select>
                        </FormControl>
                        <Button
                          variant="outlined"
                          startIcon={<AddCircleOutlineIcon sx={{ fontSize: 18 }} />}
                          onClick={() => setOpenCategoriaDialog(true)}
                          sx={{ whiteSpace: 'nowrap', borderColor: '#86efac', color: '#16a34a', textTransform: 'none', fontWeight: 700, borderRadius: 2, minWidth: 92, height: 40 }}
                        >
                          Nueva
                        </Button>
                      </Stack>
                    </Grid>

                    <Grid item size={{ xs: 12, md: 6 }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <FormControl
                          fullWidth
                          required
                          disabled={!form.categoria_id || loadingCatalogo}
                          sx={{ '& .MuiOutlinedInput-root': { height: 40, borderRadius: 2, background: '#fff' } }}
                        >
                          <InputLabel>Subcategoria</InputLabel>
                          <Select
                            label="Subcategoria"
                            size="small"
                            value={form.subcategoria_id}
                            onChange={(e) => {
                              const value = String(e.target.value || '');
                              if (value === '__crear_subcategoria__') {
                                setOpenSubcategoriaDialog(true);
                                return;
                              }
                              actualizarCampo('subcategoria_id', value);
                            }}
                          >
                            {subcategoriasDisponibles.map((subcategoria) => (
                              <MenuItem key={String(subcategoria._id)} value={String(subcategoria._id)}>
                                {subcategoria.nombre}
                              </MenuItem>
                            ))}
                            <MenuItem value="__crear_subcategoria__">+ Crear nueva subcategoria</MenuItem>
                          </Select>
                        </FormControl>
                        <Button
                          variant="outlined"
                          disabled={!form.categoria_id}
                          startIcon={<AddCircleOutlineIcon sx={{ fontSize: 18 }} />}
                          onClick={() => setOpenSubcategoriaDialog(true)}
                          sx={{ whiteSpace: 'nowrap', borderColor: '#86efac', color: '#16a34a', textTransform: 'none', fontWeight: 700, borderRadius: 2, minWidth: 92, height: 40 }}
                        >
                          Nueva
                        </Button>
                      </Stack>
                    </Grid>

                    <Grid item size={{ xs: 12 }}>
                      <TextField
                        label="Proveedor"
                        fullWidth
                        size="small"
                        placeholder="A quien se le pago? (ej. Liga Municipal)"
                        value={form.proveedor}
                        onChange={(e) => actualizarCampo('proveedor', e.target.value)}
                        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, background: '#fff' } }}
                      />
                    </Grid>
                  </Grid>
                </Paper>

                <Paper sx={SECTION_CARD_SX}>
                  <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#334155', mb: 2, letterSpacing: '0.02em' }}>
                    ESTADO DEL EGRESO
                  </Typography>

                  <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                    {ESTADOS.map((estado) => {
                      const selected = form.estado === estado.value;
                      const Icon = estado.icon;
                      return (
                        <Button
                          key={estado.value}
                          variant={selected ? 'contained' : 'outlined'}
                          startIcon={<Icon sx={{ fontSize: 16 }} />}
                          onClick={() => actualizarCampo('estado', estado.value)}
                          sx={{
                            textTransform: 'none',
                            borderRadius: 2,
                            px: 1.5,
                            borderColor: estado.border,
                            color: selected ? '#ffffff' : estado.color,
                            background: selected ? estado.color : '#ffffff',
                            boxShadow: 'none',
                            fontWeight: 700,
                            fontSize: 12,
                            '&:hover': {
                              borderColor: estado.border,
                              background: selected ? estado.color : '#fff7ed'
                            }
                          }}
                        >
                          {estado.label}
                        </Button>
                      );
                    })}
                  </Stack>

                </Paper>

                <Paper sx={SECTION_CARD_SX}>
                  <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#334155', mb: 2, letterSpacing: '0.02em' }}>
                    NOTAS ADICIONALES
                  </Typography>
                  <TextField
                    label="Describe el egreso o agrega observaciones..."
                    fullWidth
                    multiline
                    minRows={3}
                    value={form.observaciones}
                    onChange={(e) => actualizarCampo('observaciones', e.target.value)}
                    sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, background: '#fff' } }}
                  />
                </Paper>
              </Stack>
            </Grid>

            <Grid item size={{ xs: 12, lg: 4 }} offset={{ lg: 'auto' }} sx={{ minWidth: 0, alignSelf: 'flex-start' }}>
              <Stack spacing={2} sx={{ position: { lg: 'sticky' }, top: { lg: 0 }, width: '100%', maxWidth: '100%', mt: 0 }}>
                <Paper sx={SECTION_CARD_SX}>
                  <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#334155', mb: 2, letterSpacing: '0.02em' }}>
                    COMPROBANTE
                  </Typography>

                  <Box
                    sx={{
                      border: '1px dashed #d1d5db',
                      borderRadius: 2,
                      p: 2,
                      textAlign: 'center',
                      background: '#f8fafc'
                    }}
                  >
                    <CloudUploadOutlinedIcon sx={{ fontSize: 34, color: '#6366f1', mb: 1 }} />
                    <Typography sx={{ fontWeight: 700, color: '#334155', fontSize: 14 }}>
                      Sube tu comprobante
                    </Typography>
                    <Typography sx={{ color: '#64748b', fontSize: 12, mb: 2 }}>
                      Ticket, factura o captura de pantalla
                    </Typography>

                    <Button variant="contained" component="label" startIcon={<UploadFileOutlinedIcon />} sx={{ textTransform: 'none', fontWeight: 700 }}>
                      Elegir archivo
                      <input
                        hidden
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
                        onChange={(e) => setComprobante(e.target.files?.[0] || null)}
                      />
                    </Button>

                    <Typography sx={{ mt: 1, fontSize: 11, color: '#94a3b8' }}>
                      PNG, JPG, PDF - max. 20 MB
                    </Typography>

                    {comprobante && (
                      <Chip
                        size="small"
                        sx={{ mt: 1 }}
                        color="success"
                        label={comprobante.name}
                      />
                    )}
                  </Box>
                </Paper>

                <Paper sx={{ p: 2, borderRadius: 3, background: '#111827', color: '#ffffff' }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 800, mb: 1.5, letterSpacing: '0.02em' }}>
                    RESUMEN
                  </Typography>

                  <Stack spacing={0.75}>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography sx={{ color: '#cbd5e1', fontSize: 14 }}>Categoria</Typography>
                      <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{resumen.categoria}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between">
                      <Typography sx={{ color: '#cbd5e1', fontSize: 14 }}>Metodo</Typography>
                      <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{resumen.metodo}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography sx={{ color: '#cbd5e1', fontSize: 14 }}>Estado</Typography>
                      <Chip
                        size="small"
                        label={resumen.estado}
                        sx={{
                          background: '#fef3c7',
                          color: '#92400e',
                          fontWeight: 700,
                          height: 22
                        }}
                      />
                    </Stack>
                  </Stack>

                  <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.15)', mt: 1.5, pt: 1.5 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.25 }}>
                      <Typography sx={{ color: '#cbd5e1', fontSize: 13 }}>Equivalente Bs</Typography>
                      <Typography sx={{ fontWeight: 700, fontSize: 14 }}>{resumen.equivalenteBs}</Typography>
                    </Stack>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography sx={{ color: '#cbd5e1', fontSize: 14 }}>Total</Typography>
                      <Typography sx={{ fontWeight: 800, fontSize: 32, lineHeight: 1 }}>{resumen.total}</Typography>
                    </Stack>
                  </Box>
                </Paper>

                <Button
                  type="submit"
                  form="egreso-form"
                  variant="contained"
                  startIcon={<SaveIcon />}
                  disabled={guardandoEgreso}
                  sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 800, py: 1.2, background: '#4f46e5', '&:hover': { background: '#4338ca' }, width: '100%' }}
                >
                  {guardandoEgreso ? 'Guardando...' : (isEditing ? 'Guardar Cambios' : 'Guardar Egreso')}
                </Button>

                <Button
                  variant="outlined"
                  startIcon={<CancelOutlinedIcon />}
                  onClick={cerrarFormulario}
                  sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, borderColor: '#d1d5db', color: '#334155', width: '100%' }}
                >
                  Cancelar
                </Button>
              </Stack>
            </Grid>
          </Grid>
          </Box>
        </Fade>

        <Fade in={!mostrarFormulario || !canManage} timeout={220} mountOnEnter unmountOnExit>
          <Box>
            <Typography sx={{ color: '#94a3b8', fontSize: 13, mb: 2 }}>
              Registra y gestiona los gastos operativos de la academia.
            </Typography>

            <Grid container spacing={1.5} sx={{ mb: 2 }}>
              <Grid item size={{ xs: 12, md: 6, lg: 3 }}>
                <Paper sx={{ p: 1.75, borderRadius: 2.5, border: '1px solid #e5e7eb', borderLeft: '4px solid #4f46e5', boxShadow: 'none' }}>
                  <Typography sx={{ color: '#94a3b8', fontSize: 11, fontWeight: 800 }}>TOTAL DEL MES</Typography>
                  <Typography sx={{ color: '#0f172a', fontSize: 30, lineHeight: 1.1, fontWeight: 900 }}>{formatMoney(kpis.totalMes)}</Typography>
                  <Typography sx={{ color: '#64748b', fontSize: 12 }}>{kpis.totalRows} egresos registrados</Typography>
                </Paper>
              </Grid>

              <Grid item size={{ xs: 12, md: 6, lg: 3 }}>
                <Paper sx={{ p: 1.75, borderRadius: 2.5, border: '1px solid #e5e7eb', borderLeft: '4px solid #22c55e', boxShadow: 'none' }}>
                  <Typography sx={{ color: '#94a3b8', fontSize: 11, fontWeight: 800 }}>PAGADOS</Typography>
                  <Typography sx={{ color: '#16a34a', fontSize: 30, lineHeight: 1.1, fontWeight: 900 }}>{formatMoney(kpis.pagados.total)}</Typography>
                  <Typography sx={{ color: '#64748b', fontSize: 12 }}>{kpis.pagados.cantidad} egresos</Typography>
                </Paper>
              </Grid>

              <Grid item size={{ xs: 12, md: 6, lg: 3 }}>
                <Paper sx={{ p: 1.75, borderRadius: 2.5, border: '1px solid #e5e7eb', borderLeft: '4px solid #f59e0b', boxShadow: 'none' }}>
                  <Typography sx={{ color: '#94a3b8', fontSize: 11, fontWeight: 800 }}>PENDIENTES</Typography>
                  <Typography sx={{ color: '#d97706', fontSize: 30, lineHeight: 1.1, fontWeight: 900 }}>{formatMoney(kpis.pendientes.total)}</Typography>
                  <Typography sx={{ color: '#64748b', fontSize: 12 }}>{kpis.pendientes.cantidad} egreso</Typography>
                </Paper>
              </Grid>

            </Grid>

            <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.25} sx={{ mb: 2 }}>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <Select
                  value={mesFiltro}
                  onChange={(e) => setMesFiltro(String(e.target.value || 'all'))}
                  startAdornment={<CalendarMonthOutlinedIcon sx={{ color: '#64748b', mr: 1, fontSize: 18 }} />}
                  sx={{ borderRadius: 2, background: '#fff' }}
                >
                  <MenuItem value="all">Todos los meses</MenuItem>
                  {mesesDisponibles.map((monthKey) => (
                    <MenuItem key={monthKey} value={monthKey}>{formatMonthLabel(monthKey)}</MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 170 }}>
                <Select
                  value={categoriaFiltro}
                  onChange={(e) => setCategoriaFiltro(String(e.target.value || 'all'))}
                  sx={{ borderRadius: 2, background: '#fff' }}
                >
                  <MenuItem value="all">Todas las categorias</MenuItem>
                  {categoriasDisponiblesListado.map((categoria) => (
                    <MenuItem key={categoria} value={categoria}>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                        <Box
                          sx={{
                            width: 18,
                            height: 18,
                            borderRadius: '50%',
                            background: categoriaMetaPorNombre.get(categoria)?.color || '#4f46e5',
                            color: '#fff',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flex: '0 0 18px'
                          }}
                        >
                          {React.createElement(resolveCategoriaIcon(categoriaMetaPorNombre.get(categoria)?.icono), { sx: { fontSize: 12 } })}
                        </Box>
                        <Typography sx={{ fontSize: 14 }} noWrap>
                          {categoria}
                        </Typography>
                      </Stack>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 170 }}>
                <Select
                  value={estadoFiltro}
                  onChange={(e) => setEstadoFiltro(String(e.target.value || 'all'))}
                  sx={{ borderRadius: 2, background: '#fff' }}
                >
                  <MenuItem value="all">Todos los estados</MenuItem>
                  <MenuItem value="Pagado">Pagado</MenuItem>
                  <MenuItem value="Pendiente">Pendiente</MenuItem>
                </Select>
              </FormControl>

              <TextField
                size="small"
                placeholder="Buscar proveedor..."
                value={proveedorBusqueda}
                onChange={(e) => setProveedorBusqueda(e.target.value)}
                InputProps={{ startAdornment: <SearchRoundedIcon sx={{ color: '#94a3b8', mr: 0.75, fontSize: 18 }} /> }}
                sx={{ width: { xs: '100%', lg: 260 }, '& .MuiOutlinedInput-root': { borderRadius: 2, background: '#fff' } }}
              />
            </Stack>

            {loadingEgresos ? (
              <Typography variant="body2" sx={{ color: '#64748b' }}>Cargando egresos...</Typography>
            ) : (
              <Paper sx={{ borderRadius: 3, border: '1px solid #e5e7eb', overflow: 'hidden', boxShadow: 'none' }}>
                <Stack direction="row" justifyContent="space-between" sx={{ px: 2, py: 1.5, borderBottom: '1px solid #eef2f7', background: '#fff' }}>
                  <Typography sx={{ fontSize: 22, fontWeight: 700, color: '#0f172a' }}>Ultimos egresos</Typography>
                  <Typography sx={{ color: '#94a3b8', fontSize: 12, fontWeight: 700 }}>{egresosFiltrados.length} resultados</Typography>
                </Stack>

                <Box sx={{ display: { xs: 'block', md: 'none' }, p: 1.25 }}>
                  <Stack spacing={1}>
                    {egresosFiltrados.map((egreso) => {
                      const statusStyles = getStatusChipStyles(egreso?.estado);
                      const categoriaNombre = String(egreso?.categoria_id?.nombre || '--');
                      const categoriaColor = getCategoryColor(categoriaNombre, egreso?.categoria_id?.color_acento);
                      const isDeletingRow = eliminandoEgresoId === String(egreso?._id || '');
                      const rowTint = String(egreso?.estado || '').toLowerCase() === 'pendiente'
                        ? '#fffbeb'
                        : '#ffffff';

                      return (
                        <Paper
                          key={`mobile-${String(egreso._id)}`}
                          sx={{ p: 1.25, borderRadius: 2, border: '1px solid #e5e7eb', background: rowTint, boxShadow: 'none' }}
                        >
                          <Stack spacing={0.85}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                              <Typography sx={{ color: '#1e293b', fontWeight: 700, fontSize: 13 }}>{egreso.proveedor || '--'}</Typography>
                              <Chip size="small" label={egreso.estado} sx={{ background: statusStyles.bg, color: statusStyles.color, fontWeight: 800 }} />
                            </Stack>

                            <Stack direction="row" spacing={1.25} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                              <Typography sx={{ color: '#64748b', fontSize: 12 }}>Pago: {formatShortDate(egreso.fecha_pago)}</Typography>
                            </Stack>

                            <Stack direction="row" spacing={0.8} alignItems="center">
                              <Box sx={{ width: 7, height: 7, borderRadius: '50%', background: categoriaColor }} />
                              <Typography sx={{ color: categoriaColor, fontSize: 12, fontWeight: 700 }}>{categoriaNombre}</Typography>
                              <Typography sx={{ color: '#64748b', fontSize: 12 }}>/{egreso?.subcategoria_id?.nombre || '--'}</Typography>
                            </Stack>

                            <Typography sx={{ color: '#0f172a', fontSize: 14, fontWeight: 900 }}>
                              {formatMoneyByCurrency(egreso.monto, egreso?.moneda)}
                            </Typography>
                            <Typography sx={{ color: '#64748b', fontSize: 12 }}>
                              Tasa ref: {Number(egreso?.tasa_referencia || 0) > 0 ? `Bs ${Number(egreso?.tasa_referencia).toFixed(2)}` : '--'}
                            </Typography>
                            <Typography sx={{ color: '#64748b', fontSize: 12 }}>
                              Equivalente Bs: {Number(egreso?.monto || 0) > 0 && Number(egreso?.tasa_referencia || 0) > 0
                                ? formatBs(Number(egreso?.monto || 0) * Number(egreso?.tasa_referencia || 0))
                                : 'Bs --'}
                            </Typography>

                            <Stack direction="row" spacing={1}>
                              <Button size="small" onClick={() => editarEgreso(egreso)} sx={{ minWidth: 0, color: '#94a3b8', px: 0.5 }}>
                                <EditOutlinedIcon sx={{ fontSize: 15 }} />
                              </Button>
                              <Button
                                size="small"
                                disabled={isDeletingRow}
                                onClick={() => abrirConfirmacionEliminar(egreso)}
                                sx={{ minWidth: 0, color: '#ef4444', px: 0.5 }}
                              >
                                <DeleteOutlineIcon sx={{ fontSize: 15 }} />
                              </Button>
                            </Stack>
                          </Stack>
                        </Paper>
                      );
                    })}

                    {egresosFiltrados.length === 0 && (
                      <Typography variant="body2" sx={{ color: '#64748b', px: 0.25 }}>
                        No hay egresos registrados todavia.
                      </Typography>
                    )}
                  </Stack>
                </Box>

                <TableContainer sx={{ background: '#fff', display: { xs: 'none', md: 'block' } }}>
                <Table size="small" sx={{ minWidth: 1240 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ color: '#94a3b8', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', borderBottom: '1px solid #eef2f7' }}>Fecha pago</TableCell>
                      <TableCell sx={{ color: '#94a3b8', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', borderBottom: '1px solid #eef2f7' }}>Proveedor</TableCell>
                      <TableCell sx={{ color: '#94a3b8', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', borderBottom: '1px solid #eef2f7' }}>Categoria</TableCell>
                      <TableCell sx={{ color: '#94a3b8', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', borderBottom: '1px solid #eef2f7' }}>Subcategoria</TableCell>
                      <TableCell sx={{ color: '#94a3b8', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', borderBottom: '1px solid #eef2f7' }} align="right">Monto</TableCell>
                      <TableCell sx={{ color: '#94a3b8', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', borderBottom: '1px solid #eef2f7' }} align="right">Tasa ref</TableCell>
                      <TableCell sx={{ color: '#94a3b8', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', borderBottom: '1px solid #eef2f7' }} align="right">Equiv. Bs</TableCell>
                      <TableCell sx={{ color: '#94a3b8', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', borderBottom: '1px solid #eef2f7' }}>Estado</TableCell>
                      <TableCell sx={{ color: '#94a3b8', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', borderBottom: '1px solid #eef2f7' }}>Comprobante</TableCell>
                      <TableCell sx={{ color: '#94a3b8', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', borderBottom: '1px solid #eef2f7' }} align="center">Acciones</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {egresosFiltrados.map((egreso) => {
                      const comprobanteUrl = resolveComprobanteUrl(apiBase, egreso?.comprobante_url);
                      const statusStyles = getStatusChipStyles(egreso?.estado);
                      const categoriaNombre = String(egreso?.categoria_id?.nombre || '--');
                      const categoriaColor = getCategoryColor(categoriaNombre, egreso?.categoria_id?.color_acento);
                      const isDeletingRow = eliminandoEgresoId === String(egreso?._id || '');
                      const rowTint = String(egreso?.estado || '').toLowerCase() === 'pendiente'
                        ? '#fffbeb'
                        : '#ffffff';

                      return (
                        <TableRow key={String(egreso._id)} sx={{ background: rowTint }}>
                          <TableCell sx={{ borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: 12, whiteSpace: 'nowrap' }}>{formatShortDate(egreso.fecha_pago)}</TableCell>
                          <TableCell sx={{ borderBottom: '1px solid #f1f5f9', color: '#1e293b', fontWeight: 700, fontSize: 12 }}>{egreso.proveedor || '--'}</TableCell>
                          <TableCell sx={{ borderBottom: '1px solid #f1f5f9' }}>
                            <Stack direction="row" spacing={0.8} alignItems="center">
                              <Box sx={{ width: 7, height: 7, borderRadius: '50%', background: categoriaColor }} />
                              <Typography sx={{ color: categoriaColor, fontSize: 12, fontWeight: 700 }}>{categoriaNombre}</Typography>
                            </Stack>
                          </TableCell>
                          <TableCell sx={{ borderBottom: '1px solid #f1f5f9', color: '#64748b', fontSize: 12 }}>{egreso?.subcategoria_id?.nombre || '--'}</TableCell>
                          <TableCell sx={{ borderBottom: '1px solid #f1f5f9', color: '#1e293b', fontWeight: 800, fontSize: 13, whiteSpace: 'nowrap' }} align="right">
                            {formatMoneyByCurrency(egreso.monto, egreso?.moneda)}
                          </TableCell>
                          <TableCell sx={{ borderBottom: '1px solid #f1f5f9', color: '#334155', fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }} align="right">
                            {Number(egreso?.tasa_referencia || 0) > 0 ? `Bs ${Number(egreso?.tasa_referencia).toFixed(2)}` : '--'}
                          </TableCell>
                          <TableCell sx={{ borderBottom: '1px solid #f1f5f9', color: '#0f172a', fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }} align="right">
                            {Number(egreso?.monto || 0) > 0 && Number(egreso?.tasa_referencia || 0) > 0
                              ? formatBs(Number(egreso?.monto || 0) * Number(egreso?.tasa_referencia || 0))
                              : 'Bs --'}
                          </TableCell>
                          <TableCell>
                            <Chip size="small" label={egreso.estado} sx={{ background: statusStyles.bg, color: statusStyles.color, fontWeight: 800 }} />
                          </TableCell>
                          <TableCell sx={{ borderBottom: '1px solid #f1f5f9' }}>
                            {comprobanteUrl ? (
                              <Button size="small" href={comprobanteUrl} target="_blank" rel="noreferrer" sx={{ textTransform: 'none', color: '#4f46e5', fontWeight: 700, fontSize: 12 }}>
                                Ver
                              </Button>
                            ) : '--'}
                          </TableCell>
                          <TableCell sx={{ borderBottom: '1px solid #f1f5f9' }} align="center">
                            <Stack direction="row" spacing={0.25} justifyContent="center">
                              <Button size="small" onClick={() => editarEgreso(egreso)} sx={{ minWidth: 24, color: '#94a3b8' }}><EditOutlinedIcon sx={{ fontSize: 14 }} /></Button>
                              <Button
                                size="small"
                                disabled={isDeletingRow}
                                onClick={() => abrirConfirmacionEliminar(egreso)}
                                sx={{ minWidth: 24, color: '#ef4444' }}
                              >
                                <DeleteOutlineIcon sx={{ fontSize: 14 }} />
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {egresosFiltrados.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={10}>
                          <Typography variant="body2" sx={{ color: '#64748b' }}>
                            No hay egresos registrados todavia.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
              </Paper>
            )}
          </Box>
        </Fade>
      </Paper>

      <Dialog open={openDeleteDialog} onClose={cerrarConfirmacionEliminar} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pb: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <WarningAmberRoundedIcon sx={{ color: '#dc2626', fontSize: 22 }} />
            <Typography sx={{ color: '#991b1b', fontWeight: 800, fontSize: 18 }}>
              Eliminar egreso
            </Typography>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#7f1d1d', fontSize: 14, fontWeight: 600 }}>
            {`Se eliminara${egresoAEliminar?.proveedor ? ` el egreso de ${egresoAEliminar.proveedor}` : ' este egreso'}. Esta accion no se puede deshacer.`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={cerrarConfirmacionEliminar} disabled={Boolean(eliminandoEgresoId)}>Cancelar</Button>
          <Button
            onClick={eliminarEgreso}
            color="error"
            variant="contained"
            disabled={Boolean(eliminandoEgresoId)}
          >
            {eliminandoEgresoId ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openCategoriaDialog} onClose={() => setOpenCategoriaDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle>Crear categoria</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Nombre"
              value={nuevaCategoria.nombre}
              onChange={(e) => setNuevaCategoria((prev) => ({ ...prev, nombre: e.target.value }))}
              fullWidth
              required
            />
            <TextField
              label="Codigo (opcional)"
              value={nuevaCategoria.codigo}
              onChange={(e) => setNuevaCategoria((prev) => ({ ...prev, codigo: e.target.value }))}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCategoriaDialog(false)}>Cancelar</Button>
          <Button
            onClick={crearCategoria}
            variant="contained"
            startIcon={<AddIcon />}
            disabled={guardandoCategoria}
          >
            {guardandoCategoria ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openSubcategoriaDialog} onClose={() => setOpenSubcategoriaDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle>Crear subcategoria</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              label="Nombre"
              value={nuevaSubcategoria.nombre}
              onChange={(e) => setNuevaSubcategoria((prev) => ({ ...prev, nombre: e.target.value }))}
              fullWidth
              required
            />
            <TextField
              label="Codigo (opcional)"
              value={nuevaSubcategoria.codigo}
              onChange={(e) => setNuevaSubcategoria((prev) => ({ ...prev, codigo: e.target.value }))}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenSubcategoriaDialog(false)}>Cancelar</Button>
          <Button
            onClick={crearSubcategoria}
            variant="contained"
            startIcon={<AddIcon />}
            disabled={guardandoSubcategoria}
          >
            {guardandoSubcategoria ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(error)}
        autoHideDuration={5000}
        onClose={() => setError('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity="error" onClose={() => setError('')} variant="filled">
          {error}
        </Alert>
      </Snackbar>

      <Snackbar
        open={Boolean(success)}
        autoHideDuration={3000}
        onClose={() => setSuccess('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity="success" onClose={() => setSuccess('')} variant="filled">
          {success}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default Egresos;
