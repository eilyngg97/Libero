import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CloseIcon from '@mui/icons-material/Close';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import ModalPago from './ModalPago';
import { mediaUrl } from '../utils/mediaUrl';

const TALLAS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '6', '8', '10', '12', '14', '16'];
const MONTO_TOLERANCIA_BS = 100;
const OPCIONES_NOMBRE_REPRESENTANTE = [
  'Volley Mom',
  'Volley Dad',
  'Volley Grandmom',
  'Volley Granddad',
  'Volley Sister',
  'Volley Brother'
];

const GENERO_PRECIO_OPTIONS = [
  { key: 'masculino', label: 'Masculino' },
  { key: 'femenino', label: 'Femenino' },
  { key: 'mixto', label: 'Mixto' }
];

const ESTADO_LABELS = {
  pendiente: 'Pendiente',
  esperando_pago: 'Esperando pago',
  abono: 'Abono',
  pago_en_revision: 'Pago en revision',
  verificado: 'Verificado',
  entregado: 'Entregado',
  cancelado: 'Cancelado'
};

const ESTADO_STYLES = {
  pendiente: { bgcolor: '#e2e8f0', color: '#475569' },
  esperando_pago: { bgcolor: '#fef3c7', color: '#92400e' },
  abono: { bgcolor: '#ffedd5', color: '#9a3412' },
  pago_en_revision: { bgcolor: '#dbeafe', color: '#1d4ed8' },
  verificado: { bgcolor: '#dcfce7', color: '#166534' },
  entregado: { bgcolor: '#ccfbf1', color: '#0f766e' },
  cancelado: { bgcolor: '#fee2e2', color: '#b91c1c' }
};

const ACCION_BOTON_BASE_SX = {
  textTransform: 'none',
  borderRadius: '10px',
  fontWeight: 600,
  px: 1.6,
  py: 0.45,
  minWidth: 90,
  lineHeight: 1.2,
  boxShadow: 'none'
};

const ACCION_BOTON_EDITAR_SX = {
  ...ACCION_BOTON_BASE_SX,
  color: '#4b5563',
  borderColor: '#d1d5db',
  backgroundColor: '#ffffff',
  '&:hover': {
    borderColor: '#9ca3af',
    backgroundColor: '#f8fafc'
  }
};

const ACCION_BOTON_ELIMINAR_SX = {
  ...ACCION_BOTON_BASE_SX,
  color: '#b91c1c',
  borderColor: '#e5caca',
  backgroundColor: '#ffffff',
  '&:hover': {
    borderColor: '#ef4444',
    backgroundColor: '#fff7f7'
  }
};

function construirNombrePersonalizado(alumno) {
  const apellidos = String(alumno?.apellidos || '').trim();
  const nombres = String(alumno?.nombres || '').trim();

  const primerApellido = apellidos.split(/\s+/).filter(Boolean)[0] || '';
  const primerNombre = nombres.split(/\s+/).filter(Boolean)[0] || '';

  const apellidoUpper = primerApellido.toUpperCase();
  const inicialNombre = primerNombre ? primerNombre.charAt(0).toUpperCase() : '';

  if (!apellidoUpper && !inicialNombre) return '';
  if (!apellidoUpper) return inicialNombre;
  if (!inicialNombre) return apellidoUpper;
  return `${apellidoUpper} ${inicialNombre}`;
}

function normalizarMoneda(moneda) {
  return String(moneda || 'USD').trim().toUpperCase() === 'EUR' ? 'EUR' : 'USD';
}

function normalizarGeneroAlumno(sexoRaw) {
  const sexo = String(sexoRaw || '').trim().toLowerCase();
  if (sexo.startsWith('masc')) return 'masculino';
  if (sexo.startsWith('fem')) return 'femenino';
  return 'mixto';
}

function getGeneroLabel(genero) {
  const found = GENERO_PRECIO_OPTIONS.find((item) => item.key === genero);
  return found ? found.label : 'Mixto';
}

function resolverPrecioPorVariante(prendaConfig, talla, sexoAlumno) {
  const precioBase = Number(prendaConfig?.precio) || 0;
  const variantesActivas = prendaConfig?.variantes_precio_activo === true;
  const variantes = Array.isArray(prendaConfig?.precios_variantes) ? prendaConfig.precios_variantes : [];

  if (!variantesActivas || variantes.length === 0) return precioBase;

  const tallaNorm = String(talla || '').trim().toUpperCase();
  const generoNorm = normalizarGeneroAlumno(sexoAlumno);

  const matchExacto = variantes.find((item) =>
    String(item?.talla || '').trim().toUpperCase() === tallaNorm
    && String(item?.genero || '').trim().toLowerCase() === generoNorm
  );
  if (matchExacto && Number.isFinite(Number(matchExacto.precio))) {
    return Number(matchExacto.precio);
  }

  const matchMixto = variantes.find((item) =>
    String(item?.talla || '').trim().toUpperCase() === tallaNorm
    && String(item?.genero || '').trim().toLowerCase() === 'mixto'
  );
  if (matchMixto && Number.isFinite(Number(matchMixto.precio))) {
    return Number(matchMixto.precio);
  }

  return precioBase;
}

function construirEjemploNombreJugador(alumno) {
  const nombres = String(alumno?.nombres || '').trim();
  const apellidos = String(alumno?.apellidos || '').trim();

  const primerNombre = nombres.split(/\s+/).filter(Boolean)[0] || '';
  const primerApellido = apellidos.split(/\s+/).filter(Boolean)[0] || '';
  const inicialApellido = primerApellido ? `${primerApellido.charAt(0).toUpperCase()}.` : '';

  if (primerNombre && inicialApellido) return `${primerNombre} ${inicialApellido}`;
  if (primerNombre) return primerNombre;
  if (inicialApellido) return inicialApellido;
  return 'Nombre A.';
}

function SolicitudUniforme({ alumno, sede, onGuardar }) {
  const [prendas, setPrendas] = useState([]);
  const [prendasLoading, setPrendasLoading] = useState(false);
  const [prendasError, setPrendasError] = useState('');
  const [prenda, setPrenda] = useState('');
  const [talla, setTalla] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [showPedidoSuccessDialog, setShowPedidoSuccessDialog] = useState(false);
  const [pedidoSuccessDialogMode, setPedidoSuccessDialogMode] = useState('crear');
  const [showPagoRevisionDialog, setShowPagoRevisionDialog] = useState(false);
  const [pagoRevisionResumen, setPagoRevisionResumen] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [pedidos, setPedidos] = useState([]);
  const [pedidosLoading, setPedidosLoading] = useState(false);
  const [cancelandoId, setCancelandoId] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [confirmCancelId, setConfirmCancelId] = useState(null);
  const [pagoDialogOpen, setPagoDialogOpen] = useState(false);
  const [pedidoPago, setPedidoPago] = useState(null);
  const [numeroFranelaAsignado, setNumeroFranelaAsignado] = useState(() => String(alumno?.numero_franela ?? alumno?.numeroFranela ?? '').trim());
  const [numeroFranelaSeleccionado, setNumeroFranelaSeleccionado] = useState('');
  const [numerosFranelaDisponibles, setNumerosFranelaDisponibles] = useState([]);
  const [numeroFranelaLoading, setNumeroFranelaLoading] = useState(false);
  const [numeroFranelaError, setNumeroFranelaError] = useState('');
  const [mostrarImagenesPrenda, setMostrarImagenesPrenda] = useState(false);
  const [tasaUsdBCV, setTasaUsdBCV] = useState(null);
  const [tasaEuroBCV, setTasaEuroBCV] = useState(null);
  const [generoPrecioSeleccionado, setGeneroPrecioSeleccionado] = useState('');

  const token = localStorage.getItem('token');
  const numeroFranelaAlumno = String(numeroFranelaAsignado || '').trim();
  const categoriaAlumno = String(alumno?.categoria || '').trim();
  const sexoAlumno = String(alumno?.sexo || '').trim();
  const nombrePersonalizadoDefault = construirNombrePersonalizado(alumno);
  const ejemploNombreJugador = construirEjemploNombreJugador(alumno);
  const [nombrePersonalizadoInput, setNombrePersonalizadoInput] = useState(nombrePersonalizadoDefault);
  const prendaSeleccionada = prendas.find((item) => String(item._id) === String(prenda));
  const generoAlumnoNormalizado = normalizarGeneroAlumno(alumno?.sexo);
  const generosDisponiblesPrecio = useMemo(() => {
    if (!prendaSeleccionada?.variantes_precio_activo) return [];
    const variantes = Array.isArray(prendaSeleccionada?.precios_variantes) ? prendaSeleccionada.precios_variantes : [];
    if (!variantes.length) return [];

    const tallaNorm = String(talla || '').trim().toUpperCase();
    const generosRaw = variantes
      .filter((item) => {
        const tallaItem = String(item?.talla || '').trim().toUpperCase();
        if (!tallaNorm) return true;
        return tallaItem === tallaNorm;
      })
      .map((item) => String(item?.genero || '').trim().toLowerCase())
      .filter((value) => value === 'masculino' || value === 'femenino' || value === 'mixto');

    const fuente = generosRaw.length ? generosRaw : variantes
      .map((item) => String(item?.genero || '').trim().toLowerCase())
      .filter((value) => value === 'masculino' || value === 'femenino' || value === 'mixto');

    const unique = Array.from(new Set(fuente));
    return GENERO_PRECIO_OPTIONS
      .map((item) => item.key)
      .filter((key) => unique.includes(key));
  }, [prendaSeleccionada, talla]);
  const requiereSelectorGeneroPrecio = Boolean(prendaSeleccionada?.variantes_precio_activo) && generosDisponiblesPrecio.length > 1;
  const generoPrecioParaCalculo = requiereSelectorGeneroPrecio
    ? (generoPrecioSeleccionado
      || (generosDisponiblesPrecio.includes(generoAlumnoNormalizado) ? generoAlumnoNormalizado : generosDisponiblesPrecio[0] || 'mixto'))
    : generoAlumnoNormalizado;
  const precioSeleccionActual = prendaSeleccionada
    ? resolverPrecioPorVariante(prendaSeleccionada, talla, generoPrecioParaCalculo)
    : null;
  const esFranelaRepresentante = Boolean(prendaSeleccionada?.franela_representante);
  const llevaNombreAtleta = Boolean(prendaSeleccionada?.lleva_nombre_atleta);
  const permitePersonalizacionNombre = Boolean(prendaSeleccionada?.lleva_personalizacion_nombre);
  const usaSelectorNombreRepresentante = esFranelaRepresentante && !permitePersonalizacionNombre;
  const mostrarCampoNombre = llevaNombreAtleta || esFranelaRepresentante;
  const ocultarNumeroFranela = Boolean(prendaSeleccionada) && prendaSeleccionada.lleva_numero_franela === false;
  const requiereNumeroFranela = !ocultarNumeroFranela;

  const formatMoney = (value) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
    return Number(value).toFixed(2);
  };

  const parseFechaSinDesfase = (fecha) => {
    if (!fecha) return null;
    if (fecha instanceof Date) {
      return Number.isNaN(fecha.getTime()) ? null : fecha;
    }

    const raw = String(fecha).trim();
    const fechaBase = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (fechaBase) {
      const year = Number(fechaBase[1]);
      const month = Number(fechaBase[2]) - 1;
      const day = Number(fechaBase[3]);
      const localDate = new Date(year, month, day);
      return Number.isNaN(localDate.getTime()) ? null : localDate;
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const formatFecha = (fecha) => {
    if (!fecha) return '-';
    const date = parseFechaSinDesfase(fecha);
    if (!date || Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('es-VE');
  };

  const obtenerTasaPorMoneda = useCallback((moneda) => {
    const monedaNormalizada = normalizarMoneda(moneda);
    if (monedaNormalizada === 'EUR') {
      return Number(tasaEuroBCV) || 0;
    }
    return Number(tasaUsdBCV) || 0;
  }, [tasaEuroBCV, tasaUsdBCV]);

  const formatearMontoConMoneda = useCallback((monto, moneda) => {
    return `${normalizarMoneda(moneda)} ${formatMoney(monto)}`;
  }, []);

  const uniformControlSx = {
    '& .MuiOutlinedInput-root': {
      height: 56
    },
    '& .MuiSelect-select': {
      height: '56px !important',
      display: 'flex',
      alignItems: 'center',
      boxSizing: 'border-box',
      paddingTop: '0 !important',
      paddingBottom: '0 !important',
      minWidth: 0,
      maxWidth: '100%',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    },
    '& .MuiInputBase-input': {
      boxSizing: 'border-box'
    }
  };

  const mobileMenuProps = {
    anchorOrigin: { vertical: 'bottom', horizontal: 'left' },
    transformOrigin: { vertical: 'top', horizontal: 'left' },
    PaperProps: {
      sx: {
        mt: 0.5,
        maxHeight: 320,
        width: { xs: 'calc(100vw - 24px)', sm: 'auto' },
        maxWidth: 'calc(100vw - 24px)',
        '& .MuiMenuItem-root': {
          minWidth: 0
        }
      }
    }
  };

  useEffect(() => {
    let cancelled = false;

    const parseRate = (payload) => {
      if (payload == null) return null;
      if (typeof payload === 'number') return Number.isFinite(payload) ? payload : null;
      const candidates = [
        payload.promedio,
        payload.price,
        payload.valor,
        payload.rate,
        payload.oficial,
        payload?.data?.promedio,
        payload?.data?.price,
        payload?.data?.valor,
        payload?.data?.rate,
        payload?.data?.oficial
      ];
      for (const candidate of candidates) {
        const numeric = Number(candidate);
        if (Number.isFinite(numeric) && numeric > 0) return numeric;
      }
      return null;
    };

    const fetchRates = async () => {
      fetch('https://ve.dolarapi.com/v1/dolares/oficial')
        .then(async (response) => {
          if (!response.ok) return null;
          const payload = await response.json().catch(() => null);
          return parseRate(payload);
        })
        .then((rate) => {
          if (!cancelled) setTasaUsdBCV(rate || null);
        })
        .catch(() => {
          if (!cancelled) setTasaUsdBCV(null);
        });

      fetch('https://ve.dolarapi.com/v1/euros/oficial')
        .then(async (response) => {
          if (!response.ok) return null;
          const payload = await response.json().catch(() => null);
          return parseRate(payload);
        })
        .then((rate) => {
          if (!cancelled) setTasaEuroBCV(rate || null);
        })
        .catch(() => {
          if (!cancelled) setTasaEuroBCV(null);
        });
    };

    fetchRates();

    return () => {
      cancelled = true;
    };
  }, []);

  const fetchPrendas = useCallback(async () => {
    setPrendasLoading(true);
    setPrendasError('');
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/public`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al obtener uniformes');
      setPrendas(Array.isArray(data) ? data : []);
    } catch (err) {
      setPrendas([]);
      setPrendasError(err.message || 'Error al obtener uniformes');
    } finally {
      setPrendasLoading(false);
    }
  }, []);

  const fetchPedidos = useCallback(async () => {
    if (!alumno?._id) return;
    setPedidosLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos/mis?alumnoId=${alumno._id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al obtener solicitudes activas');
      setPedidos(Array.isArray(data) ? data : []);
    } catch (err) {
      setPedidos([]);
      setErrorMessage(err.message || 'Error al obtener solicitudes activas');
    } finally {
      setPedidosLoading(false);
    }
  }, [alumno?._id, token]);

  useEffect(() => {
    fetchPrendas();
  }, [fetchPrendas]);

  useEffect(() => {
    fetchPedidos();
  }, [fetchPedidos]);

  useEffect(() => {
    setMostrarImagenesPrenda(false);
  }, [prenda]);

  useEffect(() => {
    if (!requiereSelectorGeneroPrecio) {
      setGeneroPrecioSeleccionado('');
      return;
    }

    setGeneroPrecioSeleccionado((prev) => {
      if (prev && generosDisponiblesPrecio.includes(prev)) return prev;
      if (generosDisponiblesPrecio.includes(generoAlumnoNormalizado)) return generoAlumnoNormalizado;
      return generosDisponiblesPrecio[0] || '';
    });
  }, [generoAlumnoNormalizado, generosDisponiblesPrecio, requiereSelectorGeneroPrecio]);

  useEffect(() => {
    setNumeroFranelaAsignado(String(alumno?.numero_franela ?? alumno?.numeroFranela ?? '').trim());
    setNumeroFranelaSeleccionado('');
    setNumeroFranelaError('');
    setNumerosFranelaDisponibles([]);
    setEditandoId(null);
  }, [alumno?._id, alumno?.numero_franela, alumno?.numeroFranela]);

  useEffect(() => {
    if (!mostrarCampoNombre) {
      setNombrePersonalizadoInput(nombrePersonalizadoDefault);
      return;
    }

    if (usaSelectorNombreRepresentante) {
      setNombrePersonalizadoInput('');
      return;
    }

    setNombrePersonalizadoInput(nombrePersonalizadoDefault);
  }, [nombrePersonalizadoDefault, mostrarCampoNombre, usaSelectorNombreRepresentante]);

  useEffect(() => {
    if (!requiereNumeroFranela) {
      setNumeroFranelaError('');
      setNumeroFranelaLoading(false);
      setNumeroFranelaSeleccionado('');
      return;
    }

    const categoriaNormalizada = String(categoriaAlumno || '').trim().toUpperCase();

    if (numeroFranelaAlumno) {
      setNumeroFranelaError('');
      setNumerosFranelaDisponibles([]);
      setNumeroFranelaLoading(false);
      return;
    }

    if (!categoriaNormalizada) {
      setNumeroFranelaError('El alumno no tiene categoria asignada para mostrar numeros disponibles.');
      setNumerosFranelaDisponibles([]);
      setNumeroFranelaLoading(false);
      return;
    }

    if (!sexoAlumno) {
      setNumeroFranelaError('El alumno no tiene sexo asignado para mostrar numeros disponibles.');
      setNumerosFranelaDisponibles([]);
      setNumeroFranelaLoading(false);
      return;
    }

    let cancelled = false;

    const cargarDisponibilidad = async () => {
      try {
        setNumeroFranelaLoading(true);
        setNumeroFranelaError('');
        const res = await fetch(
          `${process.env.REACT_APP_API_URL}/api/alumnos/numeros-franela/disponibilidad?categoria=${encodeURIComponent(categoriaNormalizada)}&sexo=${encodeURIComponent(sexoAlumno)}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'No se pudo cargar la disponibilidad de nro de franela.');

        if (!cancelled) {
          const disponibles = Array.isArray(data?.disponibles) ? data.disponibles : [];
          setNumerosFranelaDisponibles(disponibles);
          if (disponibles.length === 0) {
            setNumeroFranelaError(`No hay numeros de franela disponibles para la categoria ${categoriaNormalizada}.`);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setNumerosFranelaDisponibles([]);
          setNumeroFranelaError(err.message || 'No se pudo cargar la disponibilidad de nro de franela.');
        }
      } finally {
        if (!cancelled) {
          setNumeroFranelaLoading(false);
        }
      }
    };

    cargarDisponibilidad();

    return () => {
      cancelled = true;
    };
  }, [categoriaAlumno, numeroFranelaAlumno, requiereNumeroFranela, sexoAlumno, token]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!prenda || !talla) {
      setErrorMessage('Completa todos los campos del pedido');
      return;
    }
    const numeroFranelaFinal = numeroFranelaAlumno || String(numeroFranelaSeleccionado || '').trim();

    if (requiereNumeroFranela && !numeroFranelaFinal) {
      setErrorMessage('Debes seleccionar un numero de franela para continuar');
      return;
    }

    if (mostrarCampoNombre && !String(nombrePersonalizadoInput || '').trim()) {
      setErrorMessage(usaSelectorNombreRepresentante
        ? 'Debes seleccionar el nombre para la franela de representante'
        : 'Debes ingresar el nombre del atleta para continuar');
      return;
    }

    try {
      setGuardando(true);
      const formData = new FormData();
      formData.append('uniformeId', prenda);
      formData.append('talla', talla);
      if (mostrarCampoNombre) {
        formData.append('nombrePersonalizado', String(nombrePersonalizadoInput || '').trim());
      }
      if (prendaSeleccionada?.variantes_precio_activo && generoPrecioParaCalculo) {
        formData.append('generoPrecioVariante', generoPrecioParaCalculo);
      }
      if (requiereNumeroFranela && numeroFranelaFinal) {
        formData.append('numeroFranela', numeroFranelaFinal);
      }

      if (!editandoId) {
        formData.append('alumnoId', alumno?._id || alumno?.id || '');
        const sedeId = sede?._id || sede?.id || alumno?.sede?._id || alumno?.sede || '';
        formData.append('sedeId', sedeId);
      }

      const endpoint = editandoId
        ? `${process.env.REACT_APP_API_URL}/api/uniformes/pedidos/${editandoId}`
        : `${process.env.REACT_APP_API_URL}/api/uniformes/pedidos`;

      const res = await fetch(endpoint, {
        method: editandoId ? 'PATCH' : 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || (editandoId ? 'Error al editar el pedido' : 'Error al guardar el pedido'));

      setPrenda('');
      setTalla('');
      setEditandoId(null);
      if (requiereNumeroFranela && !numeroFranelaAlumno) {
        setNumeroFranelaAsignado(numeroFranelaFinal);
      }
      if (editandoId) {
        setPedidoSuccessDialogMode('editar');
        setShowPedidoSuccessDialog(true);
      } else {
        setPedidoSuccessDialogMode('crear');
        setShowPedidoSuccessDialog(true);
      }
      onGuardar && onGuardar(data);
      await fetchPedidos();
    } catch (err) {
      setErrorMessage(err.message || (editandoId ? 'Error al editar el pedido' : 'Error al guardar el pedido'));
    } finally {
      setGuardando(false);
    }
  };

  const handleEditarPedido = (pedido) => {
    if (!pedido || pedido.estado !== 'pendiente') return;

    const prendaId = String(pedido.uniforme?._id || pedido.uniforme || '').trim();
    if (!prendaId) {
      setErrorMessage('No se pudo editar: la prenda no está disponible en el catálogo.');
      return;
    }

    setEditandoId(String(pedido._id));
    setPrenda(prendaId);
    setTalla(String(pedido.talla || '').trim().toUpperCase());
    setGeneroPrecioSeleccionado(String(pedido.genero_precio_variante || '').trim().toLowerCase());
    setNombrePersonalizadoInput(String(pedido.nombre_personalizado || '').trim());
    if (!numeroFranelaAlumno) {
      setNumeroFranelaSeleccionado(String(pedido.numero_franela || '').trim());
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelarEdicionPedido = () => {
    setEditandoId(null);
    setPrenda('');
    setTalla('');
    setNombrePersonalizadoInput(nombrePersonalizadoDefault);
    if (!numeroFranelaAlumno) {
      setNumeroFranelaSeleccionado('');
    }
  };

  const handleCancelarPedido = async (pedidoId) => {
    if (!pedidoId) return;
    try {
      setCancelandoId(pedidoId);
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos/${pedidoId}/cancelar`, {
        method: 'PATCH',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al cancelar solicitud');
      setPedidos((prev) => prev.map((pedido) => (pedido._id === pedidoId ? data : pedido)));
      setSuccessMessage('Solicitud cancelada');
    } catch (err) {
      setErrorMessage(err.message || 'Error al cancelar solicitud');
    } finally {
      setCancelandoId(null);
      setConfirmCancelId(null);
    }
  };

  const tieneTasaDisponibleParaPedido = (pedido) => {
    const tasaActual = obtenerTasaPorMoneda(pedido?.moneda);
    return Number.isFinite(tasaActual) && tasaActual > 0;
  };

  const openPagoDialog = (pedido) => {
    if (!tieneTasaDisponibleParaPedido(pedido)) {
      setErrorMessage('Aun estamos cargando la tasa de cambio para esta moneda. Intenta de nuevo en unos segundos.');
      return;
    }
    setPedidoPago(pedido);
    setPagoDialogOpen(true);
  };

  const closePagoDialog = () => {
    setPagoDialogOpen(false);
    setPedidoPago(null);
  };

  const handlePagarPedido = async ({ pago, metodoPago, fechaPago, referencia, comprobante, montoPagadoMoneda, montoPagadoBs, moneda, telefonoPago, cedulaTitular }) => {
    if (!pago?._id) return;

    const montoPagadoNum = Number(montoPagadoMoneda);
    const montoPagadoBsNum = Number(montoPagadoBs);
    const saldoPendiente = Number(pago?.saldo_pendiente);
    const totalPedido = Number(pago?.precio) || 0;
    const saldoValidoRaw = Number.isFinite(saldoPendiente) && saldoPendiente > 0 ? saldoPendiente : totalPedido;
    const saldoValido = Number(Number(saldoValidoRaw).toFixed(2));
    const tasaAplicada = montoPagadoNum > 0 ? (montoPagadoBsNum / montoPagadoNum) : 0;
    const saldoValidoBs = Number.isFinite(tasaAplicada) && tasaAplicada > 0
      ? Number(Number(saldoValido * tasaAplicada).toFixed(2))
      : null;

    if (!montoPagadoNum || Number.isNaN(montoPagadoNum) || montoPagadoNum <= 0) {
      throw new Error('Debes indicar un monto pagado valido');
    }

    if (!montoPagadoBsNum || Number.isNaN(montoPagadoBsNum) || montoPagadoBsNum <= 0) {
      throw new Error('Debes indicar un monto pagado en Bs valido');
    }

    if (Number.isFinite(saldoValidoBs) && montoPagadoBsNum > (saldoValidoBs + MONTO_TOLERANCIA_BS)) {
      throw new Error(
        `El monto pagado en Bs no puede superar el saldo pendiente (${formatearMontoConMoneda(saldoValido, moneda)} = Bs. ${formatMoney(saldoValidoBs)}; tolerancia Bs. ${formatMoney(MONTO_TOLERANCIA_BS)})`
      );
    }

    const montoPagadoFinal = montoPagadoNum > saldoValido ? saldoValido : montoPagadoNum;
    const formData = new FormData();
    formData.append('metodo_pago', metodoPago);
    formData.append('monto_pagado', montoPagadoFinal.toFixed(2));
    formData.append('monto_pagado_bs', Number(montoPagadoBsNum.toFixed(2)).toFixed(2));
    if (referencia) formData.append('referencia', referencia);
    if (telefonoPago) formData.append('telefono_pago', telefonoPago);
    if (cedulaTitular) formData.append('cedula_titular', cedulaTitular);
    formData.append('fecha_pago', fechaPago);
    if (comprobante) formData.append('comprobante', comprobante);

    const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos/${pago._id}/pagar`, {
      method: 'PATCH',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || 'Error al registrar el pago');
    }

    setPedidos((prev) => prev.map((pedido) => (pedido._id === data._id ? data : pedido)));
    setSuccessMessage(
      data?.estado === 'abono'
        ? `Abono registrado. Saldo pendiente: ${formatearMontoConMoneda(data?.saldo_pendiente, normalizarMoneda(data?.moneda || pago?.moneda))}`
        : data?.estado === 'pago_en_revision'
          ? ''
          : 'Pago registrado correctamente'
    );

    if (data?.estado === 'pago_en_revision') {
      setPagoRevisionResumen({
        metodoPago: metodoPago || '-',
        referencia: referencia || '-',
        fechaPago: fechaPago || '-',
        monto: formatearMontoConMoneda(montoPagadoFinal, moneda)
      });
      setShowPagoRevisionDialog(true);
    }
  };

  const getEstadoLabel = (estado) => ESTADO_LABELS[estado] || estado || '-';

  const getEstadoStyle = (estado) => ESTADO_STYLES[estado] || ESTADO_STYLES.pendiente;

  const getEstadoChipSx = (estado) => {
    const base = getEstadoStyle(estado);
    return {
      ...base,
      borderRadius: '999px',
      height: 28,
      border: '1px solid rgba(148, 163, 184, 0.35)',
      '& .MuiChip-label': {
        px: 1.15,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        gap: 0.65
      }
    };
  };

  const renderEstadoChipLabel = (estado) => (
    <>
      <Box
        component="span"
        sx={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          backgroundColor: 'currentColor',
          opacity: 0.75,
          display: 'inline-block'
        }}
      />
      {getEstadoLabel(estado)}
    </>
  );

  const getSaldoPendienteVisible = (pedido) => {
    const saldo = Number(pedido?.saldo_pendiente);
    const precio = Number(pedido?.precio) || 0;
    if (Number.isFinite(saldo) && saldo > 0) return saldo;
    if (pedido?.estado === 'esperando_pago' || pedido?.estado === 'abono' || pedido?.estado === 'pago_en_revision') {
      return precio;
    }
    return 0;
  };

  const getTasaAplicadaPedido = (pedido) => {
    const montoPagadoDivisa = Number(pedido?.monto_pagado);
    const montoPagadoBs = Number(pedido?.monto_pagado_bs);
    if (Number.isFinite(montoPagadoDivisa) && montoPagadoDivisa > 0 && Number.isFinite(montoPagadoBs) && montoPagadoBs > 0) {
      return montoPagadoBs / montoPagadoDivisa;
    }

    if (Array.isArray(pedido?.pagos_historial) && pedido.pagos_historial.length > 0) {
      const ultimoPago = pedido.pagos_historial[pedido.pagos_historial.length - 1] || null;
      const ultimoDivisa = Number(ultimoPago?.monto_pagado);
      const ultimoBs = Number(ultimoPago?.monto_pagado_bs);
      if (Number.isFinite(ultimoDivisa) && ultimoDivisa > 0 && Number.isFinite(ultimoBs) && ultimoBs > 0) {
        return ultimoBs / ultimoDivisa;
      }
    }

    return null;
  };

  const getTextoMontoBsPedido = (pedido) => {
    const precioDivisa = Number(pedido?.precio) || 0;
    const tasaAplicadaPedido = getTasaAplicadaPedido(pedido);
    if (Number.isFinite(tasaAplicadaPedido) && tasaAplicadaPedido > 0) {
      return `Bs. ${formatMoney(precioDivisa * tasaAplicadaPedido)} (tasa del pago)`;
    }

    const tasaActual = obtenerTasaPorMoneda(pedido?.moneda);
    if (Number.isFinite(tasaActual) && tasaActual > 0) {
      return `Bs. ${formatMoney(precioDivisa * tasaActual)} (tasa actual)`;
    }

    return null;
  };

  return (
    <Grid container justifyContent="center" alignItems="flex-start" sx={{ minHeight: '80vh', py: { xs: 2, md: 3 }, px: { xs: 0.75, sm: 0 }, width: '100%', maxWidth: '100%', overflowX: 'hidden', boxSizing: 'border-box' }}>
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
      <Snackbar
        open={!!errorMessage}
        autoHideDuration={3500}
        onClose={() => setErrorMessage('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setErrorMessage('')} severity="error" sx={{ width: '100%' }}>
          {errorMessage}
        </Alert>
      </Snackbar>
      <Grid item size={{ xs: 12, sm: 11, md: 10 }} sx={{ minWidth: 0, maxWidth: '100%', boxSizing: 'border-box' }}>
        <Box sx={{ display: 'grid', gap: 3 }}>
          <Paper
            elevation={4}
            sx={{
              p: { xs: 2, sm: 3, md: 4 },
              borderRadius: 3,
              width: '100%',
              maxWidth: '100%',
              overflowX: 'hidden',
              boxSizing: 'border-box',
              border: '1px solid #e2e8f0'
            }}
          >
            <Typography variant="h5" gutterBottom align="center" fontWeight={700}>
              {editandoId ? 'Editar Solicitud de Uniforme' : 'Solicitar Uniforme'}
            </Typography>
            {alumno && (
              <Typography variant="subtitle1" sx={{ mb: 1 }}>
                <b>Alumno:</b> {alumno.nombres} {alumno.apellidos}
              </Typography>
            )}
            <Box component="form" onSubmit={handleSubmit} noValidate>
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item size={{ xs: 12, md: 6 }}>
                  <FormControl fullWidth required sx={uniformControlSx}>
                    <InputLabel id="prenda-label">Prenda</InputLabel>
                    <Select
                      labelId="prenda-label"
                      value={prenda}
                      label="Prenda"
                      onChange={(event) => setPrenda(event.target.value)}
                      disabled={prendasLoading || !!prendasError}
                      MenuProps={mobileMenuProps}
                      renderValue={(selected) => {
                        if (!selected) return <em>Seleccione</em>;
                        const item = prendas.find((p) => String(p._id) === String(selected));
                        if (!item) return selected;
                        const precioCalculado = resolverPrecioPorVariante(item, talla, generoPrecioParaCalculo);
                        const label = `${item.prenda} - ${formatearMontoConMoneda(precioCalculado, item.moneda)}`;
                        return (
                          <Typography
                            component="span"
                            sx={{
                              display: 'block',
                              minWidth: 0,
                              maxWidth: '100%',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}
                            title={label}
                          >
                            {label}
                          </Typography>
                        );
                      }}
                    >
                      <MenuItem value=""><em>Seleccione</em></MenuItem>
                      {prendas.map((item) => (
                        <MenuItem key={item._id} value={item._id}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
                            {item.fotos?.[0] ? (
                              <Box
                                component="img"
                                src={mediaUrl(item.fotos[0])}
                                alt={item.prenda}
                                sx={{
                                  width: 34,
                                  height: 34,
                                  borderRadius: 1.5,
                                  objectFit: 'cover',
                                  border: '1px solid #dbe3ef',
                                  flexShrink: 0,
                                  backgroundColor: '#fff'
                                }}
                              />
                            ) : (
                              <Box
                                sx={{
                                  width: 34,
                                  height: 34,
                                  borderRadius: 1.5,
                                  border: '1px dashed #cbd5e1',
                                  flexShrink: 0,
                                  backgroundColor: '#f8fafc'
                                }}
                              />
                            )}
                            <Typography sx={{ fontSize: 14, color: '#0f172a', whiteSpace: { xs: 'normal', sm: 'nowrap' }, wordBreak: 'break-word', overflow: 'hidden', textOverflow: { xs: 'clip', sm: 'ellipsis' }, lineHeight: 1.25 }}>
                              {item.prenda}
                            </Typography>
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item size={{ xs: 12, md: 6 }}>
                  <FormControl fullWidth required sx={uniformControlSx}>
                    <InputLabel id="talla-label">Talla</InputLabel>
                    <Select
                      labelId="talla-label"
                      value={talla}
                      label="Talla"
                      onChange={(event) => setTalla(event.target.value)}
                      MenuProps={mobileMenuProps}
                    >
                      <MenuItem value=""><em>Seleccione</em></MenuItem>
                      {TALLAS.map((item) => (
                        <MenuItem key={item} value={item}>{item}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                {requiereSelectorGeneroPrecio && (
                  <Grid item size={{ xs: 12, md: 6 }}>
                    <FormControl fullWidth required sx={uniformControlSx}>
                      <InputLabel id="genero-precio-label">Género para precio</InputLabel>
                      <Select
                        labelId="genero-precio-label"
                        value={generoPrecioParaCalculo}
                        label="Género para precio"
                        onChange={(event) => setGeneroPrecioSeleccionado(String(event.target.value || '').trim().toLowerCase())}
                        MenuProps={mobileMenuProps}
                      >
                        {generosDisponiblesPrecio.map((genero) => (
                          <MenuItem key={genero} value={genero}>{getGeneroLabel(genero)}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>
                )}
                {prendaSeleccionada && (
                  <Grid item size={{ xs: 12 }}>
                    <Box
                      sx={{
                        border: '1px solid #e2e8f0',
                        borderRadius: 2,
                        p: 1.25,
                        backgroundColor: '#f8fafc'
                      }}
                    >
                      <Typography sx={{ fontSize: 12, color: '#64748b', fontWeight: 700 }}>
                        Precio según selección
                      </Typography>
                      <Typography sx={{ fontSize: 18, color: '#0f172a', fontWeight: 800, lineHeight: 1.2 }}>
                        {formatearMontoConMoneda(precioSeleccionActual, prendaSeleccionada?.moneda)}
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: '#64748b', mt: 0.25 }}>
                        {`Género para precio: ${generoPrecioParaCalculo} | Talla: ${String(talla || '-').toUpperCase()}`}
                      </Typography>
                    </Box>
                  </Grid>
                )}
                {mostrarCampoNombre && (
                  <Grid item size={{ xs: 12, md: 6 }}>
                    {usaSelectorNombreRepresentante ? (
                      <FormControl fullWidth required sx={uniformControlSx}>
                        <InputLabel id="nombre-representante-label">Nombre para franela</InputLabel>
                        <Select
                          labelId="nombre-representante-label"
                          value={nombrePersonalizadoInput}
                          label="Nombre para franela"
                          onChange={(event) => setNombrePersonalizadoInput(event.target.value)}
                          MenuProps={mobileMenuProps}
                        >
                          <MenuItem value=""><em>Seleccione</em></MenuItem>
                          {OPCIONES_NOMBRE_REPRESENTANTE.map((opcion) => (
                            <MenuItem key={opcion} value={opcion}>{opcion}</MenuItem>
                          ))}
                        </Select>
                        <Typography variant="caption" sx={{ mt: 0.6, color: '#64748b', display: 'block' }}>
                          Selecciona el texto que llevara la franela del representante
                        </Typography>
                      </FormControl>
                    ) : (
                      <TextField
                        fullWidth
                        label="Nombre del atleta"
                        placeholder={`Ej: ${ejemploNombreJugador}`}
                        value={nombrePersonalizadoInput}
                        onChange={(event) => setNombrePersonalizadoInput(event.target.value)}
                        disabled={!permitePersonalizacionNombre}
                        sx={{
                          ...uniformControlSx,
                          '& .MuiInputBase-input.Mui-disabled': {
                            WebkitTextFillColor: '#64748b'
                          },
                          '& .MuiOutlinedInput-root.Mui-disabled': {
                            backgroundColor: '#fdfdfd'
                          }
                        }}
                        helperText={permitePersonalizacionNombre
                          ? (esFranelaRepresentante
                            ? 'Escribe el nombre personalizado para la franela de representante'
                            : 'Escribe el nombre del atleta que llevará la prenda')
                          : 'El sistema usa el nombre sugerido del atleta'}
                      />
                  )}
                  </Grid>
                )}
                {requiereNumeroFranela && (
                  <Grid item size={{ xs: 12, md: 6 }}>
                    {numeroFranelaAlumno ? (
                      <TextField
                        fullWidth
                        label="Numero de franela"
                        value={numeroFranelaAlumno}
                        disabled
                        sx={{
                          '& .MuiInputBase-input.Mui-disabled': {
                            WebkitTextFillColor: '#64748b'
                          },
                          '& .MuiOutlinedInput-root.Mui-disabled': {
                            backgroundColor: '#fdfdfd'
                          }
                        }}
                        helperText="Se usa el numero asignado en la ficha del alumno"
                      />
                    ) : (
                      <FormControl fullWidth required error={!!numeroFranelaError && !numeroFranelaLoading} sx={uniformControlSx}>
                        <InputLabel id="numero-franela-label">Numero de franela</InputLabel>
                        <Select
                          labelId="numero-franela-label"
                          value={numeroFranelaSeleccionado}
                          label="Numero de franela"
                          onChange={(event) => setNumeroFranelaSeleccionado(event.target.value)}
                          disabled={numeroFranelaLoading || numerosFranelaDisponibles.length === 0}
                          MenuProps={mobileMenuProps}
                        >
                          <MenuItem value=""><em>Seleccione</em></MenuItem>
                          {numerosFranelaDisponibles.map((numero) => (
                            <MenuItem key={numero} value={String(numero)}>{numero}</MenuItem>
                          ))}
                        </Select>
                        <Typography variant="caption" sx={{ mt: 0.6, color: numeroFranelaError ? '#d32f2f' : '#64748b', display: 'block' }}>
                          {numeroFranelaLoading
                            ? 'Cargando numeros disponibles por categoria...'
                            : (numeroFranelaError || `Disponibles: ${numerosFranelaDisponibles.length} de 100 en ${String(categoriaAlumno || '').toUpperCase()}`)}
                        </Typography>
                      </FormControl>
                    )}
                  </Grid>
                )}
                {Array.isArray(prendaSeleccionada?.fotos) && prendaSeleccionada.fotos.length > 0 && (
                  <Grid item size={{ xs: 12 }}>
                    <Box sx={{ display: 'flex', justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
                      <Button
                        type="button"
                        variant="outlined"
                        onClick={() => setMostrarImagenesPrenda(true)}
                        sx={{
                          border: '2px solid #cbd5e1',
                          borderRadius: '10px',
                          fontWeight: 700,
                          color: '#64748b',
                          px: 2.5,
                          py: 1,
                          textTransform: 'none',
                          boxShadow: 'none',
                          minWidth: 0,
                          transition: 'border-color 0.2s',
                          '&:hover': {
                            borderColor: '#94a3b8',
                            bgcolor: '#f8fafc',
                            color: '#334155'
                          }
                        }}
                      >
                        Imágenes de la prenda
                      </Button>
                    </Box>
                  </Grid>
                )}
              </Grid>
              {prendasError && (
                <Typography variant="body2" color="error" sx={{ mb: 2 }}>
                  {prendasError}
                </Typography>
              )}
              <Button
                type="submit"
                variant="contained"
                color="primary"
                fullWidth
                size="large"
                disabled={guardando || (mostrarCampoNombre && !String(nombrePersonalizadoInput || '').trim()) || (requiereNumeroFranela && (!numeroFranelaAlumno && !numeroFranelaSeleccionado)) || (requiereNumeroFranela && numeroFranelaLoading) || (requiereNumeroFranela && !!numeroFranelaError)}
              >
                {guardando ? 'Guardando...' : (editandoId ? 'Guardar cambios' : 'Guardar pedido')}
              </Button>
              {editandoId && (
                <Button
                  type="button"
                  variant="text"
                  color="inherit"
                  fullWidth
                  sx={{ mt: 1, textTransform: 'none', fontWeight: 700, color: '#64748b' }}
                  onClick={cancelarEdicionPedido}
                >
                  Cancelar edición
                </Button>
              )}
            </Box>
          </Paper>

          <Paper elevation={3} sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
              Solicitudes de uniformes del alumno
            </Typography>
            {pedidosLoading ? (
              <Typography>Cargando solicitudes...</Typography>
            ) : pedidos.length === 0 ? (
              <Typography color="text.secondary">No hay solicitudes registradas para este alumno.</Typography>
            ) : (
              <>
                <Box sx={{ display: { xs: 'grid', md: 'none' }, gap: 1.5 }}>
                  {pedidos.map((pedido) => (
                    <Box
                      key={pedido._id}
                      sx={{
                        border: '1px solid #e2e8f0',
                        borderRadius: 2.5,
                        p: 1.5,
                        backgroundColor: '#ffffff',
                        boxShadow: '0 6px 16px rgba(15, 23, 42, 0.06)'
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
                        <Typography sx={{ fontWeight: 800, color: '#0f172a' }}>
                          {pedido.prenda} - {pedido.talla}
                        </Typography>
                        <Chip
                          label={renderEstadoChipLabel(pedido.estado)}
                          size="small"
                          sx={getEstadoChipSx(pedido.estado)}
                        />
                      </Box>

                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, mb: 1 }}>
                        <Box>
                          <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>Nombre</Typography>
                          <Typography variant="body2" sx={{ color: '#0f172a' }}>{pedido.nombre_personalizado || '-'}</Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>Numero</Typography>
                          <Typography variant="body2" sx={{ color: '#0f172a' }}>{pedido.numero_franela || '-'}</Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>Fecha</Typography>
                          <Typography variant="body2" sx={{ color: '#0f172a' }}>{formatFecha(pedido.fecha_pago || pedido.createdAt)}</Typography>
                        </Box>
                        <Box>
                          <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>Pago</Typography>
                          <Typography variant="body2" sx={{ color: '#0f172a' }}>
                            {pedido.metodo_pago ? `${pedido.metodo_pago} | Ref: ${pedido.referencia || '-'}` : '-'}
                          </Typography>
                        </Box>
                      </Box>

                      <Box sx={{ mb: 1 }}>
                        <Typography variant="caption" sx={{ color: '#64748b', fontWeight: 700 }}>Precio</Typography>
                        <Typography sx={{ fontWeight: 800, color: '#0f172a' }}>{formatearMontoConMoneda(pedido.precio, pedido.moneda)}</Typography>
                        <Typography variant="body2" sx={{ color: '#64748b' }}>
                          Saldo pendiente: {formatearMontoConMoneda(getSaldoPendienteVisible(pedido), pedido.moneda)}
                        </Typography>
                        {getTextoMontoBsPedido(pedido) ? (
                          <Typography variant="body2" sx={{ color: '#64748b' }}>
                            {getTextoMontoBsPedido(pedido)}
                          </Typography>
                        ) : null}
                      </Box>

                      {(pedido.estado === 'esperando_pago' || pedido.estado === 'abono') ? (
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => openPagoDialog(pedido)}
                            disabled={!tieneTasaDisponibleParaPedido(pedido)}
                            sx={ACCION_BOTON_EDITAR_SX}
                          >
                            {tieneTasaDisponibleParaPedido(pedido) ? 'Realizar pago' : 'Cargando tasa...'}
                          </Button>
                          <Button
                            size="small"
                            color="error"
                            variant="outlined"
                            disabled={cancelandoId === pedido._id}
                            onClick={() => setConfirmCancelId(pedido._id)}
                          >
                            {cancelandoId === pedido._id ? 'Eliminando solicitud...' : 'Eliminar solicitud'}
                          </Button>
                        </Box>
                      ) : pedido.estado === 'pendiente' ? (
                        <Box sx={{ display: 'grid', gap: 1 }}>
                          <Typography variant="body2" sx={{ color: '#64748b' }}>
                            Esperando solicitud de pago del administrador
                          </Typography>
                          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => handleEditarPedido(pedido)}
                              disabled={!pedido?.uniforme}
                              sx={ACCION_BOTON_EDITAR_SX}
                            >
                              Editar
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              disabled={cancelandoId === pedido._id}
                              onClick={() => setConfirmCancelId(pedido._id)}
                              sx={ACCION_BOTON_ELIMINAR_SX}
                            >
                              {cancelandoId === pedido._id ? 'Eliminando solicitud...' : 'Eliminar'}
                            </Button>
                          </Box>
                        </Box>
                      ) : (
                        <Typography variant="body2" sx={{ color: '#64748b' }}>
                          {pedido.estado === 'cancelado'
                            ? 'Solicitud cancelada'
                            : pedido.estado === 'abono'
                              ? `Abono registrado. Saldo pendiente: ${formatearMontoConMoneda(getSaldoPendienteVisible(pedido), pedido.moneda)}`
                            : pedido.estado === 'pago_en_revision'
                              ? 'Pago enviado, en revision'
                              : pedido.estado === 'verificado'
                                ? 'Pago verificado. En espera de entrega'
                                : pedido.estado === 'entregado'
                                  ? 'Prenda entregada'
                                  : 'Sin acciones disponibles'}
                        </Typography>
                      )}
                    </Box>
                  ))}
                </Box>

                <TableContainer sx={{ display: { xs: 'none', md: 'block' } }}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Prenda</TableCell>
                        <TableCell>Talla</TableCell>
                        <TableCell>Nombre</TableCell>
                        <TableCell>Numero</TableCell>
                        <TableCell>Precio</TableCell>
                        <TableCell>Pago</TableCell>
                        <TableCell>Fecha</TableCell>
                        <TableCell>Estado</TableCell>
                        <TableCell>Acciones</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {pedidos.map((pedido) => (
                        <TableRow key={pedido._id}>
                          <TableCell>{pedido.prenda}</TableCell>
                          <TableCell>{pedido.talla}</TableCell>
                          <TableCell>{pedido.nombre_personalizado || '-'}</TableCell>
                          <TableCell>{pedido.numero_franela || '-'}</TableCell>
                          <TableCell>
                            <Typography sx={{ fontWeight: 700 }}>{formatearMontoConMoneda(pedido.precio, pedido.moneda)}</Typography>
                            <Typography variant="body2" sx={{ color: '#64748b' }}>
                              Pendiente: {formatearMontoConMoneda(getSaldoPendienteVisible(pedido), pedido.moneda)}
                            </Typography>
                            {getTextoMontoBsPedido(pedido) ? (
                              <Typography variant="body2" sx={{ color: '#64748b' }}>
                                {getTextoMontoBsPedido(pedido)}
                              </Typography>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            {pedido.metodo_pago ? (
                              <>
                                <Typography>{pedido.metodo_pago}</Typography>
                                <Typography variant="body2" sx={{ color: '#64748b' }}>
                                  Ref: {pedido.referencia || '-'}
                                </Typography>
                              </>
                            ) : '-'}
                          </TableCell>
                          <TableCell>{formatFecha(pedido.fecha_pago || pedido.createdAt)}</TableCell>
                          <TableCell>
                            <Chip
                              label={renderEstadoChipLabel(pedido.estado)}
                              size="small"
                              sx={getEstadoChipSx(pedido.estado)}
                            />
                          </TableCell>
                          <TableCell>
                            {(pedido.estado === 'esperando_pago' || pedido.estado === 'abono') ? (
                              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() => openPagoDialog(pedido)}
                                  disabled={!tieneTasaDisponibleParaPedido(pedido)}
                                  sx={ACCION_BOTON_EDITAR_SX}
                                >
                                  {tieneTasaDisponibleParaPedido(pedido) ? 'Realizar pago' : 'Cargando tasa...'}
                                </Button>
                                <Button
                                  size="small"
                                  color="error"
                                  variant="outlined"
                                  disabled={cancelandoId === pedido._id}
                                  onClick={() => setConfirmCancelId(pedido._id)}
                                >
                                  {cancelandoId === pedido._id ? 'Eliminando solicitud...' : 'Eliminar solicitud'}
                                </Button>
                              </Box>
                            ) : pedido.estado === 'pendiente' ? (
                              <Box sx={{ display: 'grid', gap: 0.9, alignItems: 'start' }}>
                                <Typography variant="body2" sx={{ color: '#64748b' }}>
                                  Esperando solicitud de pago del administrador
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'nowrap', alignItems: 'center' }}>
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => handleEditarPedido(pedido)}
                                    disabled={!pedido?.uniforme}
                                    sx={ACCION_BOTON_EDITAR_SX}
                                  >
                                    Editar
                                  </Button>
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    disabled={cancelandoId === pedido._id}
                                    onClick={() => setConfirmCancelId(pedido._id)}
                                    sx={ACCION_BOTON_ELIMINAR_SX}
                                  >
                                    {cancelandoId === pedido._id ? 'Eliminando solicitud...' : 'Eliminar solicitud'}
                                  </Button>
                                </Box>
                              </Box>
                            ) : (
                              <Typography variant="body2" sx={{ color: '#64748b' }}>
                                {pedido.estado === 'cancelado'
                                  ? 'Solicitud cancelada'
                                  : pedido.estado === 'abono'
                                    ? `Abono registrado. Saldo pendiente: ${formatearMontoConMoneda(getSaldoPendienteVisible(pedido), pedido.moneda)}`
                                  : pedido.estado === 'pago_en_revision'
                                    ? 'Pago enviado, en revision'
                                    : pedido.estado === 'verificado'
                                      ? 'Pago verificado. En espera de entrega'
                                      : pedido.estado === 'entregado'
                                        ? 'Prenda entregada'
                                        : 'Sin acciones disponibles'}
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </Paper>
        </Box>
      </Grid>

      <Dialog open={!!confirmCancelId} onClose={() => setConfirmCancelId(null)}>
        <DialogTitle>Cancelar solicitud</DialogTitle>
        <DialogContent>
          <Typography>¿Deseas cancelar esta solicitud de uniforme?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmCancelId(null)} disabled={cancelandoId === confirmCancelId}>Volver</Button>
          <Button onClick={() => handleCancelarPedido(confirmCancelId)} color="error" variant="contained" disabled={cancelandoId === confirmCancelId}>
            Confirmar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={showPedidoSuccessDialog}
        onClose={() => setShowPedidoSuccessDialog(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            textAlign: 'center',
            p: { xs: 2, sm: 2.5 }
          }
        }}
      >
        <DialogContent sx={{ pt: 1, pb: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
            {pedidoSuccessDialogMode === 'editar' ? (
              <TaskAltRoundedIcon sx={{ fontSize: 62, color: '#0ea5e9' }} />
            ) : (
              <CheckCircleRoundedIcon sx={{ fontSize: 62, color: '#16a34a' }} />
            )}
          </Box>
          <Typography sx={{ fontWeight: 800, color: '#0f172a', mb: 1, letterSpacing: 0.3 }}>
            {pedidoSuccessDialogMode === 'editar'
              ? 'SOLICITUD DE UNIFORME ACTUALIZADA'
              : 'SOLICITUD DE UNIFORME ENVIADO'}
          </Typography>
          <Typography variant="body2" sx={{ color: '#475569' }}>
            {pedidoSuccessDialogMode === 'editar'
              ? 'Tu solicitud fue actualizada correctamente. Próximamente el administrador le solicitará el pago del uniforme y te avisaremos por aquí.'
              : 'Próximamente el administrador le solicitará el pago del uniforme. No se preocupe, le avisaremos por aquí en cuanto ocurra.'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pt: 1, pb: 0.5 }}>
          <Button
            variant="contained"
            onClick={() => setShowPedidoSuccessDialog(false)}
            sx={{
              minWidth: 140,
              fontWeight: 700,
              textTransform: 'none',
              bgcolor: '#0B0F2A',
              '&:hover': {
                bgcolor: '#11183d'
              }
            }}
          >
            Entendido
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={showPagoRevisionDialog}
        onClose={() => setShowPagoRevisionDialog(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            textAlign: 'center',
            p: { xs: 2, sm: 2.5 }
          }
        }}
      >
        <DialogContent sx={{ pt: 1, pb: 1.25 }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
            <TaskAltRoundedIcon sx={{ fontSize: 64, color: '#0ea5e9' }} />
          </Box>

          <Typography sx={{ fontWeight: 800, color: '#0f172a', mb: 0.8, letterSpacing: 0.3 }}>
            PAGO ENVIADO A REVISION
          </Typography>

          <Typography variant="body2" sx={{ color: '#475569', mb: 1.6 }}>
            Recibimos tu comprobante correctamente. El administrador validara tu pago y te notificaremos por aqui cuando cambie el estado.
          </Typography>

          <Box
            sx={{
              textAlign: 'left',
              border: '1px solid #e2e8f0',
              borderRadius: 2,
              backgroundColor: '#f8fafc',
              p: 1.35,
              display: 'grid',
              gap: 0.5,
              mb: 1.2
            }}
          >
            <Typography variant="caption" sx={{ color: '#64748b' }}>
              Monto reportado: <strong style={{ color: '#0f172a' }}>{pagoRevisionResumen?.monto || '-'}</strong>
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748b' }}>
              Metodo: <strong style={{ color: '#0f172a' }}>{pagoRevisionResumen?.metodoPago || '-'}</strong>
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748b' }}>
              Referencia: <strong style={{ color: '#0f172a' }}>{pagoRevisionResumen?.referencia || '-'}</strong>
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748b' }}>
              Fecha de pago: <strong style={{ color: '#0f172a' }}>{pagoRevisionResumen?.fechaPago || '-'}</strong>
            </Typography>
          </Box>

          <Typography variant="caption" sx={{ color: '#64748b' }}>
            Mientras esta en revision, no necesitas volver a enviarlo.
          </Typography>
        </DialogContent>

        <DialogActions sx={{ justifyContent: 'center', pt: 0.8, pb: 0.5 }}>
          <Button
            variant="contained"
            onClick={() => setShowPagoRevisionDialog(false)}
            sx={{
              minWidth: 150,
              fontWeight: 700,
              textTransform: 'none',
              bgcolor: '#0B0F2A',
              '&:hover': {
                bgcolor: '#11183d'
              }
            }}
          >
            Entendido
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={mostrarImagenesPrenda}
        onClose={() => setMostrarImagenesPrenda(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0f172a', pr: 6 }}>
          Imagen{prendaSeleccionada?.fotos?.length > 1 ? 'es' : ''} de la prenda
          <IconButton
            aria-label="cerrar imagenes de la prenda"
            onClick={() => setMostrarImagenesPrenda(false)}
            size="small"
            sx={{ position: 'absolute', right: 14, top: 14, color: '#64748b' }}
          >
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 2, bgcolor: '#f8fafc' }}>
          <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap', justifyContent: 'center' }}>
            {(prendaSeleccionada?.fotos || []).map((foto, index) => (
              <Box
                key={`${prendaSeleccionada?._id || prendaSeleccionada?.prenda || 'prenda'}-dialog-foto-${index}`}
                component="img"
                src={mediaUrl(foto)}
                alt={`${prendaSeleccionada?.prenda || 'Prenda'} ${index + 1}`}
                sx={{
                  width: { xs: '100%', sm: 'calc(50% - 10px)' },
                  maxWidth: 360,
                  height: { xs: 220, sm: 280 },
                  objectFit: 'contain',
                  borderRadius: 2,
                  border: '1px solid #dbe3ef',
                  backgroundColor: '#fff'
                }}
              />
            ))}
          </Box>
        </DialogContent>
      </Dialog>

      <ModalPago
        open={pagoDialogOpen}
        onClose={closePagoDialog}
        pago={pedidoPago ? {
          _id: pedidoPago._id,
          id: pedidoPago._id,
          monto: getSaldoPendienteVisible(pedidoPago),
          id_alumno: { habilitar_pago_cuotas: false },
          recargo_aplicado_usd: 0,
          precio: pedidoPago.precio,
          saldo_pendiente: pedidoPago.saldo_pendiente,
          moneda: pedidoPago.moneda
        } : null}
        currencyCode={normalizarMoneda(pedidoPago?.moneda)}
        fallbackRate={pedidoPago ? obtenerTasaPorMoneda(pedidoPago?.moneda) : null}
        disableCuotas
        allowedMethodIds={['pago-movil', 'transferencia']}
        onSubmitPayment={handlePagarPedido}
        onSuccess={() => {
          closePagoDialog();
          fetchPedidos();
        }}
      />
    </Grid>
  );
}

export default SolicitudUniforme;
