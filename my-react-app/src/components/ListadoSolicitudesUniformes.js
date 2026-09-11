import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CloseIcon from '@mui/icons-material/Close';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import VisibilityIcon from '@mui/icons-material/Visibility';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import DownloadIcon from '@mui/icons-material/Download';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PaymentIcon from '@mui/icons-material/Payment';
import PaidIcon from '@mui/icons-material/Paid';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import { mediaUrl } from '../utils/mediaUrl';
import { useSede } from '../context/SedeContext';
import { useDolar } from '../context/DolarContext';
import { exportToExcel } from '../utils/exportExcel';
import { obtenerTasaOficialPorFecha, obtenerTasaEuroOficialPorFecha } from '../utils/dolarHistorico';

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
  entregado: { bgcolor: '#dcfce7', color: '#166534' },
  cancelado: { bgcolor: '#fee2e2', color: '#b91c1c' }
};

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const TALLAS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '4', '6', '8', '10', '12', '14', '16'];
const OPCIONES_NOMBRE_REPRESENTANTE = [
  'Volley Mom',
  'Volley Dad',
  'Volley Grandmom',
  'Volley Granddad',
  'Volley Sister',
  'Volley Brother'
];

const ALIAS_NOMBRE_REPRESENTANTE = {
  'volley grandmon': 'Volley Grandmom'
};

function normalizarNombreRepresentante(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function resolverNombreRepresentante(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const normalized = normalizarNombreRepresentante(raw);
  if (ALIAS_NOMBRE_REPRESENTANTE[normalized]) {
    return ALIAS_NOMBRE_REPRESENTANTE[normalized];
  }

  const existente = OPCIONES_NOMBRE_REPRESENTANTE.find(
    (item) => normalizarNombreRepresentante(item) === normalized
  );
  return existente || '';
}

const ESTADOS_SOLICITUD_ACTIVA = new Set([
  'pendiente',
  'esperando_pago',
  'abono',
  'pago_en_revision'
]);

const ALL_PRENDAS_VALUE = '__all__';
const ALL_CATEGORIAS_VALUE = '__all__';
const METODOS_PAGO = ['Pago movil', 'Transferencia', 'Tarjeta', 'Efectivo'];

function getLocalInputDate() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function ListadoSolicitudesUniformes() {
  const [pedidos, setPedidos] = useState([]);
  const [uniformesCatalogo, setUniformesCatalogo] = useState([]);
  const [prendasCatalogo, setPrendasCatalogo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [solicitudPagoOpen, setSolicitudPagoOpen] = useState(false);
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null);
  const [submittingSolicitudPago, setSubmittingSolicitudPago] = useState(false);
  const [editSolicitudOpen, setEditSolicitudOpen] = useState(false);
  const [submittingEditSolicitud, setSubmittingEditSolicitud] = useState(false);
  const [editSolicitudData, setEditSolicitudData] = useState({
    uniformeId: '',
    talla: '',
    nombrePersonalizado: '',
    numeroFranela: '',
    precio: '',
    moneda: 'USD',
    metodoCobranza: 'pago_completo'
  });
  const [detallePagoOpen, setDetallePagoOpen] = useState(false);
  const [submittingVerificacion, setSubmittingVerificacion] = useState(false);
  const [registrarPagoOpen, setRegistrarPagoOpen] = useState(false);
  const [submittingRegistroPago, setSubmittingRegistroPago] = useState(false);
  const [tasaPagoHistorica, setTasaPagoHistorica] = useState(null);
  const [registroPagoData, setRegistroPagoData] = useState({
    metodoPago: 'Pago movil',
    referencia: '',
    telefonoPago: '',
    cedulaTitular: '',
    nota: '',
    fechaPago: getLocalInputDate(),
    montoPagado: '',
    comprobante: null
  });
  const [confirmEntregarId, setConfirmEntregarId] = useState(null);
  const [entregandoId, setEntregandoId] = useState(null);
  const [confirmEliminarId, setConfirmEliminarId] = useState(null);
  const [eliminandoId, setEliminandoId] = useState(null);
  const [habilitandoSegundaParteId, setHabilitandoSegundaParteId] = useState(null);
  const [confirmHabilitarSegundaPartePedido, setConfirmHabilitarSegundaPartePedido] = useState(null);
  const [comprobanteDialogOpen, setComprobanteDialogOpen] = useState(false);
  const [comprobanteUrl, setComprobanteUrl] = useState('');
  const [comprobanteTipo, setComprobanteTipo] = useState('imagen');
  const [filtroMes, setFiltroMes] = useState(() => (new Date().getMonth() + 1).toString());
  const [filtroAlumno, setFiltroAlumno] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroPrenda, setFiltroPrenda] = useState([]);
  const [filtroCategoria, setFiltroCategoria] = useState([]);
  const [filtroSexo, setFiltroSexo] = useState('todos');
  const [pagina, setPagina] = useState(0);
  const [filasPorPagina, setFilasPorPagina] = useState(10);
  const [selectedPedidoIds, setSelectedPedidoIds] = useState([]);
  const [submittingSolicitudPagoLote, setSubmittingSolicitudPagoLote] = useState(false);
  const [confirmSolicitudPagoLoteOpen, setConfirmSolicitudPagoLoteOpen] = useState(false);
  const [submittingHabilitarSegundoPagoLote, setSubmittingHabilitarSegundoPagoLote] = useState(false);
  const [confirmHabilitarSegundoPagoLoteOpen, setConfirmHabilitarSegundoPagoLoteOpen] = useState(false);
  const [submittingEliminarLote, setSubmittingEliminarLote] = useState(false);
  const [confirmEliminarLoteOpen, setConfirmEliminarLoteOpen] = useState(false);

  const token = localStorage.getItem('token');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { sedeSeleccionada } = useSede();
  const { dolar } = useDolar();

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

  const actionIconButtonSx = {
    color: '#6b7280',
    bgcolor: '#fdfdfd',
    '&:hover': { bgcolor: '#e2e8f0' }
  };

  const formatMoney = (value) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
    return Number(value).toFixed(2);
  };

  const formatTelefonoPago = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    return digits.length >= 10 ? digits.slice(-10) : digits;
  };

  const getTelefonoPagoDesdeRegistro = (registro) => {
    if (!registro) return '';
    return formatTelefonoPago(
      registro?.telefono_pago
      ?? registro?.telefonoPago
      ?? registro?.telefono
      ?? registro?.telefono_de_pago
      ?? ''
    );
  };

  const formatCedulaPago = (value) => {
    const raw = String(value || '').trim().toUpperCase();
    if (!raw) return '';

    const match = raw.match(/^([VEJG])\s*[-:]?\s*(\d+)$/i);
    if (match) {
      return `${match[1].toUpperCase()}-${match[2]}`;
    }

    const digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    return `V-${digits}`;
  };

  const getCedulaPagoDesdeRegistro = (registro) => {
    if (!registro) return '';
    return formatCedulaPago(
      registro?.cedula_titular
      ?? registro?.cedulaTitular
      ?? registro?.cedula_pago
      ?? registro?.cedulaPago
      ?? ''
    );
  };

  const getNotaPagoDesdeRegistro = (registro) => {
    if (!registro) return '';
    return String(
      registro?.nota
      ?? registro?.nota_pago
      ?? registro?.notaPago
      ?? registro?.observacion
      ?? registro?.comentario
      ?? ''
    ).trim();
  };

  const normalizarMoneda = (moneda) => String(moneda || 'USD').trim().toUpperCase() === 'EUR' ? 'EUR' : 'USD';
  const normalizarMetodoCobranza = (metodo) => String(metodo || '').trim().toLowerCase() === 'dos_partes_50'
    ? 'dos_partes_50'
    : 'pago_completo';
  const formatMoneyWithCurrency = (value, moneda) => `${normalizarMoneda(moneda)} ${formatMoney(value)}`;

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

    // Cuando el backend guarda "YYYY-MM-DD" como UTC medianoche,
    // al parsear en horario local puede retroceder un dia. Lo tratamos
    // como fecha calendario local para preservar el dia de BD.
    const fechaUtcMedianoche = raw.match(/^(\d{4})-(\d{2})-(\d{2})T00:00:00(?:\.\d+)?(?:Z|\+00:00)$/i);
    if (fechaUtcMedianoche) {
      const year = Number(fechaUtcMedianoche[1]);
      const month = Number(fechaUtcMedianoche[2]) - 1;
      const day = Number(fechaUtcMedianoche[3]);
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

  const formatTasaAplicada = (montoBs, montoDivisa, moneda) => {
    const bs = Number(montoBs);
    const divisa = Number(montoDivisa);
    if (!Number.isFinite(bs) || !Number.isFinite(divisa) || divisa <= 0) return '-';
    return `Bs ${formatMoney(bs / divisa)}/${normalizarMoneda(moneda)}`;
  };

  const getEstadoLabel = (estado) => ESTADO_LABELS[estado] || estado || '-';
  const getEstadoStyle = (estado) => ESTADO_STYLES[estado] || ESTADO_STYLES.pendiente;
  const getMetodoCobranzaLabel = (pedido) => (
    String(pedido?.metodo_cobranza || '').trim().toLowerCase() === 'dos_partes_50'
      ? 'Dos partes (50/50)'
      : 'Pago completo'
  );
  const isDosPartes50 = (pedido) => String(pedido?.metodo_cobranza || '').trim().toLowerCase() === 'dos_partes_50';
  const getMontoPrimeraParteObjetivo = (pedido) => {
    const total = Number(pedido?.precio) || 0;
    const base = Number(pedido?.monto_primera_parte_objetivo);
    const monto = Number.isFinite(base) && base > 0 ? base : (total / 2);
    return Number(Number(monto || 0).toFixed(2));
  };
  const puedeHabilitarSegundaParte = (pedido) => {
    if (!isDosPartes50(pedido)) return false;
    if (pedido?.segunda_parte_habilitada === true) return false;
    if (String(pedido?.estado || '').toLowerCase() !== 'abono') return false;
    const pagado = Number(pedido?.monto_pagado) || 0;
    const objetivo = getMontoPrimeraParteObjetivo(pedido);
    return pagado + 0.01 >= objetivo;
  };
  const esPedidoPendiente = (pedido) => String(pedido?.estado || '').toLowerCase() === 'pendiente';
  const esAlumnoActivo = (alumno) => !(
    alumno?.dado_de_baja
    || alumno?.activo === false
    || String(alumno?.estado || '').trim().toLowerCase() === 'baja'
  );
  const getTooltipEstadoAlumno = (alumno) => (esAlumnoActivo(alumno)
    ? 'Alumno activo'
    : `Motivo: ${alumno?.motivo_baja?.trim() || 'No especificado'}`);

  const opcionesPrenda = useMemo(() => {
    const prendasUnicas = new Map();
    const prendasCatalogoNormalizadas = new Set();

    const registrarPrenda = (valor, esSoloActiva = false) => {
      const prenda = String(valor || '').trim();
      if (!prenda) return;
      const clave = prenda.toLowerCase();
      if (!prendasUnicas.has(clave)) {
        prendasUnicas.set(clave, { label: prenda, value: clave, esSoloActiva });
        return;
      }

      if (!esSoloActiva) {
        const actual = prendasUnicas.get(clave);
        prendasUnicas.set(clave, { ...actual, esSoloActiva: false });
      }
    };

    prendasCatalogo.forEach((prenda) => {
      const prendaNormalizada = String(prenda || '').trim().toLowerCase();
      if (prendaNormalizada) prendasCatalogoNormalizadas.add(prendaNormalizada);
      registrarPrenda(prenda, false);
    });

    pedidos.forEach((pedido) => {
      const estado = String(pedido?.estado || '').trim().toLowerCase();
      if (!ESTADOS_SOLICITUD_ACTIVA.has(estado)) return;
      const prenda = String(pedido?.prenda || '').trim();
      const clave = prenda.toLowerCase();
      if (!prenda) return;
      registrarPrenda(prenda, !prendasCatalogoNormalizadas.has(clave));
    });

    return Array.from(prendasUnicas.values()).sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));
  }, [pedidos, prendasCatalogo]);

  const getUniformeIdFromPedido = (pedido) => {
    const raw = pedido?.uniforme;
    if (!raw) return '';
    if (typeof raw === 'string') return raw;
    return String(raw?._id || '').trim();
  };

  const opcionesCategoria = useMemo(() => {
    const categoriasUnicas = new Map();

    pedidos.forEach((pedido) => {
      const categoria = String(pedido?.alumno?.categoria || '').trim();
      if (!categoria) return;
      const clave = categoria.toLowerCase();
      if (!categoriasUnicas.has(clave)) {
        categoriasUnicas.set(clave, categoria);
      }
    });

    return Array.from(categoriasUnicas.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));
  }, [pedidos]);

  const opcionesSexo = useMemo(() => {
    const sexosUnicos = new Map();

    pedidos.forEach((pedido) => {
      const sexoRaw = String(pedido?.alumno?.sexo || '').trim();
      if (!sexoRaw) return;
      const value = sexoRaw.toLowerCase();
      if (!sexosUnicos.has(value)) {
        const label = value === 'masculino'
          ? 'Masculino'
          : value === 'femenino'
            ? 'Femenino'
            : sexoRaw;
        sexosUnicos.set(value, label);
      }
    });

    return Array.from(sexosUnicos.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es', { sensitivity: 'base' }));
  }, [pedidos]);

  const pedidosFiltrados = pedidos.filter((pedido) => {
    const nombreAlumno = `${pedido?.alumno?.nombres || ''} ${pedido?.alumno?.apellidos || ''}`
      .trim()
      .toLocaleLowerCase('es')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const alumnoBuscado = filtroAlumno
      .trim()
      .toLocaleLowerCase('es')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const alumnoOk = !alumnoBuscado || nombreAlumno.includes(alumnoBuscado);
    const fechaPedido = pedido?.createdAt || pedido?.fecha_solicitud || pedido?.fechaSolicitud;
    const fechaPedidoDate = parseFechaSinDesfase(fechaPedido);
    const mesPedido = fechaPedidoDate ? (fechaPedidoDate.getMonth() + 1) : null;
    const mesOk = filtroMes === 'todos' || !filtroMes
      ? true
      : mesPedido === Number(filtroMes);

    const estadoOk = filtroEstado === 'todos'
      ? true
      : String(pedido?.estado || '').toLowerCase() === filtroEstado;

    const prendaActual = String(pedido?.prenda || '').trim().toLowerCase();
    const prendaOk = filtroPrenda.length === 0
      ? true
      : filtroPrenda.includes(prendaActual);

    const categoriaActual = String(pedido?.alumno?.categoria || '').trim().toLowerCase();
    const categoriaOk = filtroCategoria.length === 0
      ? true
      : filtroCategoria.includes(categoriaActual);

    const sexoOk = filtroSexo === 'todos'
      ? true
      : String(pedido?.alumno?.sexo || '').trim().toLowerCase() === filtroSexo;

    return alumnoOk && mesOk && estadoOk && prendaOk && categoriaOk && sexoOk;
  });

  const pagosHistorialOrdenados = Array.isArray(pedidoSeleccionado?.pagos_historial)
    ? [...pedidoSeleccionado.pagos_historial].sort((a, b) => {
      const fechaA = parseFechaSinDesfase(a?.fecha_pago)?.getTime() || 0;
      const fechaB = parseFechaSinDesfase(b?.fecha_pago)?.getTime() || 0;
      return fechaA - fechaB;
    })
    : [];

  const ultimoPagoHistorial = pagosHistorialOrdenados.length > 0
    ? pagosHistorialOrdenados[pagosHistorialOrdenados.length - 1]
    : null;

  const ultimoPagoDetalle = (pedidoSeleccionado?.estado === 'pago_en_revision' || !ultimoPagoHistorial)
    ? {
        monto_pagado: pedidoSeleccionado?.monto_ultimo_pago || pedidoSeleccionado?.monto_pagado || 0,
        monto_pagado_bs: pedidoSeleccionado?.monto_ultimo_pago_bs,
        metodo_pago: pedidoSeleccionado?.metodo_pago,
        referencia: pedidoSeleccionado?.referencia,
        telefono_pago: pedidoSeleccionado?.telefono_pago,
        cedula_titular: pedidoSeleccionado?.cedula_titular,
        nota: pedidoSeleccionado?.nota,
        comprobante_url: pedidoSeleccionado?.comprobante_url,
        fecha_pago: pedidoSeleccionado?.fecha_pago
      }
    : ultimoPagoHistorial;

  const historialPagosAnteriores = pedidoSeleccionado?.estado === 'pago_en_revision'
    ? pagosHistorialOrdenados
    : pagosHistorialOrdenados.slice(0, -1);

  const pedidosPaginados = pedidosFiltrados.slice(
    pagina * filasPorPagina,
    pagina * filasPorPagina + filasPorPagina
  );

  const pedidosFiltradosIds = pedidosFiltrados.map((pedido) => String(pedido._id));
  const pedidosFiltradosSeleccionados = pedidosFiltrados.filter((pedido) =>
    selectedPedidoIds.includes(String(pedido._id))
  );
  const pedidosPendientesSeleccionados = pedidosFiltradosSeleccionados.filter((pedido) => esPedidoPendiente(pedido));
  const pedidosSegundaParteElegiblesSeleccionados = pedidosFiltradosSeleccionados.filter((pedido) => puedeHabilitarSegundaParte(pedido));
  const todosFiltradosSeleccionadosGlobal =
    pedidosFiltradosIds.length > 0 &&
    pedidosFiltradosIds.every((id) => selectedPedidoIds.includes(id));
  const todosFiltradosPaginaSeleccionados =
    pedidosPaginados.length > 0 &&
    pedidosPaginados.every((pedido) => selectedPedidoIds.includes(String(pedido._id)));

  const buildExcelRows = (rows) => rows.map((pedido) => {
    const estadoKey = String(pedido?.estado || '').trim().toLowerCase();
    return {
      Sede: pedido.sede?.nombre || pedido.sede?.sede || '-',
      Alumno: pedido.alumno ? `${pedido.alumno.nombres || ''} ${pedido.alumno.apellidos || ''}`.trim() : '-',
      Categoria: pedido.alumno?.categoria || '-',
      Fecha: formatFecha(pedido.createdAt || pedido.fecha_solicitud || pedido.fechaSolicitud),
      Estado: ESTADO_LABELS[estadoKey] || (pedido.estado || '-'),
      Prenda: pedido.prenda || '-',
      Talla: pedido.talla || '-',
      'Nombre deportivo': pedido.nombre_personalizado || '-',
      'Numero franela': pedido.numero_franela || '-'
    };
  });

  const exportPedidosExcel = async () => {
    const rows = buildExcelRows(pedidosFiltrados);
    const exportaTodo = pedidos.length > 0 && pedidosFiltrados.length === pedidos.length;
    const suffix = exportaTodo ? '_todos' : '_filtrados';
    const sedeSuffix = sedeSeleccionada?.nombre
      ? `_${String(sedeSeleccionada.nombre).trim().replace(/\s+/g, '_')}`
      : '';
    const fileName = `solicitudes_uniformes${sedeSuffix}${suffix}.xlsx`;

    if (rows.length === 0) {
      setError('No hay solicitudes para exportar.');
      return;
    }

    await exportToExcel(
      rows,
      fileName,
      ['Sede', 'Alumno', 'Categoria', 'Fecha', 'Estado', 'Prenda', 'Talla', 'Nombre deportivo', 'Numero franela'],
      {
        statusColumnName: 'Estado',
        statusStyleMap: {
          pendiente: { bg: '#e2e8f0', color: '#475569' },
          esperando_pago: { bg: '#fef3c7', color: '#92400e' },
          abono: { bg: '#ffedd5', color: '#9a3412' },
          pago_en_revision: { bg: '#dbeafe', color: '#1d4ed8' },
          verificado: { bg: '#dcfce7', color: '#166534' },
          entregado: { bg: '#dcfce7', color: '#166534' },
          cancelado: { bg: '#fee2e2', color: '#b91c1c' }
        }
      }
    );
    setSuccessMessage('Excel de solicitudes exportado segun filtros visibles');
  };

  const montoTotalDivisa = Number(pedidoSeleccionado?.precio);
  const saldoPendienteDivisa = Number(pedidoSeleccionado?.saldo_pendiente);
  const usarSaldoRestanteComoEsperado = ['abono', 'pago_en_revision'].includes(pedidoSeleccionado?.estado)
    && Number.isFinite(saldoPendienteDivisa)
    && saldoPendienteDivisa > 0;
  const montoEsperadoDivisa = usarSaldoRestanteComoEsperado
    ? saldoPendienteDivisa
    : (Number.isFinite(montoTotalDivisa) ? montoTotalDivisa : 0);

  const tasaAplicadaNumero = (() => {
    const bs = Number(ultimoPagoDetalle?.monto_pagado_bs);
    const divisa = Number(ultimoPagoDetalle?.monto_pagado);
    if (!Number.isFinite(bs) || !Number.isFinite(divisa) || divisa <= 0) return null;
    return bs / divisa;
  })();

  const montoEsperadoBs = (() => {
    if (!Number.isFinite(montoEsperadoDivisa) || montoEsperadoDivisa <= 0 || !Number.isFinite(tasaAplicadaNumero)) return null;
    return montoEsperadoDivisa * tasaAplicadaNumero;
  })();

  const metodoPagoRequiereReferencia = registroPagoData.metodoPago === 'Transferencia' || registroPagoData.metodoPago === 'Pago movil';
  const referenciaDigitsRegistro = String(registroPagoData.referencia || '').replace(/\D/g, '');
  const referenciaRegistroValida = !metodoPagoRequiereReferencia || referenciaDigitsRegistro.length >= 6;
  const monedaPagoRegistro = normalizarMoneda(pedidoSeleccionado?.moneda || dolar?.moneda || 'USD');

  const obtenerTasaHistoricaSegunMoneda = useCallback(async (fechaIso, tasaFallback, moneda) => {
    if (String(moneda || 'USD').toUpperCase() === 'EUR') {
      return obtenerTasaEuroOficialPorFecha(fechaIso, tasaFallback);
    }
    return obtenerTasaOficialPorFecha(fechaIso, tasaFallback);
  }, []);

  const tasaFallbackRegistro = Number(dolar?.promedio) || 0;
  const tasaPagoActiva = Number(tasaPagoHistorica) > 0 ? Number(tasaPagoHistorica) : tasaFallbackRegistro;
  const montoPagadoBsCalculado = (Number(registroPagoData.montoPagado) || 0) * (Number(tasaPagoActiva) || 0);
  const registroPagoFormValido = Boolean(
    String(registroPagoData.metodoPago || '').trim()
    && String(registroPagoData.fechaPago || '').trim()
    && Number.isFinite(Number(registroPagoData.montoPagado))
    && Number(registroPagoData.montoPagado) > 0
    && Number.isFinite(Number(montoPagadoBsCalculado))
    && Number(montoPagadoBsCalculado) > 0
    && referenciaRegistroValida
  );

  const uniformeSeleccionadoEdicion = uniformesCatalogo.find((item) => String(item?._id) === String(editSolicitudData.uniformeId));
  const requiereNumeroFranelaEdicion = uniformeSeleccionadoEdicion?.lleva_numero_franela !== false;
  const muestraCampoNombreEdicion = Boolean(uniformeSeleccionadoEdicion?.lleva_nombre_atleta);
  const permitePersonalizacionNombreEdicion = Boolean(uniformeSeleccionadoEdicion?.lleva_personalizacion_nombre);
  const usaSelectorNombreRepresentanteEdicion = Boolean(uniformeSeleccionadoEdicion?.franela_representante) && muestraCampoNombreEdicion && !permitePersonalizacionNombreEdicion;

  const copiarReferencia = async (texto) => {
    try {
      if (!texto) return;
      await navigator.clipboard.writeText(String(texto));
      setSuccessMessage('Referencia copiada');
    } catch {
      setError('No se pudo copiar la referencia');
    }
  };

  const handleVerComprobante = (rawUrl) => {
    if (!rawUrl) return;
    const url = mediaUrl(rawUrl);
    const cleanUrl = String(url).split('?')[0].toLowerCase();
    setComprobanteTipo(cleanUrl.endsWith('.pdf') ? 'pdf' : 'imagen');
    setComprobanteUrl(url);
    setComprobanteDialogOpen(true);
  };

  const fetchPedidos = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (sedeSeleccionada?._id) params.set('sedeId', sedeSeleccionada._id);

      const query = params.toString();
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos${query ? `?${query}` : ''}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al obtener pedidos');
      setPedidos(Array.isArray(data) ? data : []);
    } catch (err) {
      setPedidos([]);
      setError(err.message || 'Error al obtener pedidos');
    } finally {
      setLoading(false);
    }
  }, [sedeSeleccionada?._id, token]);

  const fetchPrendasCatalogo = useCallback(async () => {
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.error || 'Error al obtener catalogo de prendas');

      const uniformes = Array.isArray(data) ? data : [];
      setUniformesCatalogo(uniformes);

      const prendas = Array.from(new Set(
        uniformes
          .map((item) => String(item?.prenda || '').trim())
          .filter(Boolean)
      )).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

      setPrendasCatalogo(prendas);
    } catch {
      setUniformesCatalogo([]);
      setPrendasCatalogo([]);
    }
  }, [token]);

  useEffect(() => {
    fetchPedidos();
  }, [fetchPedidos]);

  useEffect(() => {
    fetchPrendasCatalogo();
  }, [fetchPrendasCatalogo]);

  useEffect(() => {
    if (pagina > 0 && pagina * filasPorPagina >= pedidosFiltrados.length) {
      setPagina(0);
    }
  }, [pedidosFiltrados.length, pagina, filasPorPagina]);

  useEffect(() => {
    const idsValidos = new Set(pedidos.map((pedido) => String(pedido._id)));
    setSelectedPedidoIds((prev) => prev.filter((id) => idsValidos.has(String(id))));
  }, [pedidos]);

  useEffect(() => {
    if (!registrarPagoOpen || !registroPagoData.fechaPago) return;
    let cancelado = false;

    (async () => {
      try {
        const tasaHistorica = await obtenerTasaHistoricaSegunMoneda(
          registroPagoData.fechaPago,
          tasaFallbackRegistro,
          monedaPagoRegistro
        );
        if (!cancelado) {
          setTasaPagoHistorica(Number(tasaHistorica) || tasaFallbackRegistro);
        }
      } catch {
        if (!cancelado) {
          setTasaPagoHistorica(tasaFallbackRegistro);
        }
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [registrarPagoOpen, registroPagoData.fechaPago, tasaFallbackRegistro, monedaPagoRegistro, obtenerTasaHistoricaSegunMoneda]);

  const handleChangePagina = (_event, nuevaPagina) => {
    setPagina(nuevaPagina);
  };

  const handleChangeFilasPorPagina = (event) => {
    setFilasPorPagina(parseInt(event.target.value, 10));
    setPagina(0);
  };

  const openSolicitudPagoDialog = (pedido) => {
    setPedidoSeleccionado(pedido);
    setSolicitudPagoOpen(true);
  };

  const closeSolicitudPagoDialog = () => {
    if (submittingSolicitudPago) return;
    setSolicitudPagoOpen(false);
    setPedidoSeleccionado(null);
  };

  const openEditSolicitudDialog = (pedido) => {
    const uniformeId = getUniformeIdFromPedido(pedido);
    const uniformeCatalogo = uniformesCatalogo.find((item) => String(item?._id) === String(uniformeId));
    const requiereNumero = uniformeCatalogo?.lleva_numero_franela !== false;
    const muestraNombre = Boolean(uniformeCatalogo?.lleva_nombre_atleta);
    const usaSelectorRepresentante = Boolean(uniformeCatalogo?.franela_representante) && muestraNombre && !Boolean(uniformeCatalogo?.lleva_personalizacion_nombre);
    const nombreActual = String(pedido?.nombre_personalizado || '');
    const nombreNormalizado = usaSelectorRepresentante
      ? resolverNombreRepresentante(nombreActual)
      : nombreActual;

    setPedidoSeleccionado(pedido);
    setEditSolicitudData({
      uniformeId,
      talla: String(pedido?.talla || ''),
      nombrePersonalizado: muestraNombre ? nombreNormalizado : '',
      numeroFranela: requiereNumero ? String(pedido?.numero_franela || '') : '',
      precio: String(pedido?.precio ?? uniformeCatalogo?.precio ?? ''),
      moneda: normalizarMoneda(pedido?.moneda || uniformeCatalogo?.moneda || 'USD'),
      metodoCobranza: normalizarMetodoCobranza(pedido?.metodo_cobranza || uniformeCatalogo?.metodo_cobranza || 'pago_completo')
    });
    setEditSolicitudOpen(true);
  };

  const closeEditSolicitudDialog = () => {
    if (submittingEditSolicitud) return;
    setEditSolicitudOpen(false);
    setPedidoSeleccionado(null);
    setEditSolicitudData({
      uniformeId: '',
      talla: '',
      nombrePersonalizado: '',
      numeroFranela: '',
      precio: '',
      moneda: 'USD',
      metodoCobranza: 'pago_completo'
    });
  };

  const handleSolicitarPago = async () => {
    const precio = Number(pedidoSeleccionado?.precio);
    if (!precio || Number.isNaN(precio) || precio <= 0 || !pedidoSeleccionado?._id) {
      setError('El pedido no tiene un precio valido. Edita la solicitud antes de confirmar pago.');
      return;
    }

    try {
      setSubmittingSolicitudPago(true);
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos/${pedidoSeleccionado._id}/solicitar-pago`, {
        method: 'PATCH',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ precio })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al solicitar el pago');
      setPedidos((prev) => prev.map((pedido) => (pedido._id === data._id ? data : pedido)));
      setSolicitudPagoOpen(false);
      setPedidoSeleccionado(null);
      setSuccessMessage('Solicitud de pago enviada al usuario');
    } catch (err) {
      setError(err.message || 'Error al solicitar el pago');
    } finally {
      setSubmittingSolicitudPago(false);
    }
  };

  const handleGuardarEdicionSolicitud = async () => {
    if (!pedidoSeleccionado?._id) return;

    const precio = Number(editSolicitudData.precio);
    if (!editSolicitudData.uniformeId) {
      setError('Selecciona una prenda del catalogo');
      return;
    }
    if (!editSolicitudData.talla) {
      setError('Selecciona una talla');
      return;
    }
    if (!Number.isFinite(precio) || precio < 0) {
      setError('Debes indicar un precio valido');
      return;
    }

    try {
      setSubmittingEditSolicitud(true);
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos/${pedidoSeleccionado._id}`, {
        method: 'PATCH',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          uniformeId: editSolicitudData.uniformeId,
          talla: editSolicitudData.talla,
          nombrePersonalizado: muestraCampoNombreEdicion ? editSolicitudData.nombrePersonalizado : '',
          numeroFranela: requiereNumeroFranelaEdicion ? editSolicitudData.numeroFranela : '',
          precio,
          moneda: normalizarMoneda(editSolicitudData.moneda),
          metodo_cobranza: normalizarMetodoCobranza(editSolicitudData.metodoCobranza)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al actualizar la solicitud');

      setPedidos((prev) => prev.map((pedido) => (pedido._id === data._id ? data : pedido)));
      setSuccessMessage('Solicitud actualizada correctamente');
      closeEditSolicitudDialog();
    } catch (err) {
      setError(err.message || 'Error al actualizar la solicitud');
    } finally {
      setSubmittingEditSolicitud(false);
    }
  };

  const handleTogglePedidoSeleccionado = (pedidoId) => {
    const id = String(pedidoId || '');
    if (!id) return;

    setSelectedPedidoIds((prev) => (
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id]
    ));
  };

  const handleToggleSeleccionPaginaFiltrados = () => {
    const idsPagina = pedidosPaginados.map((pedido) => String(pedido._id));
    if (idsPagina.length === 0) return;

    setSelectedPedidoIds((prev) => {
      if (todosFiltradosPaginaSeleccionados) {
        return prev.filter((id) => !idsPagina.includes(String(id)));
      }

      const merged = new Set(prev.map((id) => String(id)));
      idsPagina.forEach((id) => merged.add(id));
      return Array.from(merged);
    });
  };

  const handleToggleSeleccionGlobalFiltrados = () => {
    if (pedidosFiltradosIds.length === 0) return;

    setSelectedPedidoIds((prev) => {
      if (todosFiltradosSeleccionadosGlobal) {
        return prev.filter((id) => !pedidosFiltradosIds.includes(String(id)));
      }

      const merged = new Set(prev.map((id) => String(id)));
      pedidosFiltradosIds.forEach((id) => merged.add(id));
      return Array.from(merged);
    });
  };

  const handleEliminarSolicitudesLote = async () => {
    if (pedidosFiltradosSeleccionados.length === 0) {
      setError('Selecciona al menos una solicitud para eliminar.');
      return;
    }

    try {
      setSubmittingEliminarLote(true);
      setConfirmEliminarLoteOpen(false);

      const resultados = await Promise.allSettled(
        pedidosFiltradosSeleccionados.map(async (pedido) => {
          const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos/${pedido._id}`, {
            method: 'DELETE',
            headers: token ? { Authorization: `Bearer ${token}` } : undefined
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data?.error || 'Error al eliminar la solicitud');
          }
          return { id: String(pedido._id) };
        })
      );

      const idsEliminados = resultados
        .filter((resultado) => resultado.status === 'fulfilled')
        .map((resultado) => resultado.value.id);

      if (idsEliminados.length > 0) {
        const idsSet = new Set(idsEliminados);
        setPedidos((prev) => prev.filter((pedido) => !idsSet.has(String(pedido._id))));
        setSelectedPedidoIds((prev) => prev.filter((id) => !idsSet.has(String(id))));
      }

      const exitos = idsEliminados.length;
      const fallidos = resultados.length - exitos;

      if (fallidos > 0) {
        setError(`Eliminación por lote parcial: ${exitos} eliminadas, ${fallidos} no se pudieron eliminar.`);
      } else {
        setSuccessMessage(`Se eliminaron ${exitos} solicitud(es) correctamente.`);
      }
    } catch (err) {
      setError(err.message || 'Error al eliminar solicitudes por lote');
    } finally {
      setSubmittingEliminarLote(false);
    }
  };

  const handleSolicitarPagoPorLote = async () => {
    if (pedidosPendientesSeleccionados.length === 0) {
      setError('Selecciona al menos un pedido pendiente para solicitar pago.');
      return;
    }

    const pedidosConPrecio = pedidosPendientesSeleccionados.filter((pedido) => {
      const precio = Number(pedido?.precio);
      return Number.isFinite(precio) && precio > 0;
    });
    const pedidosSinPrecio = pedidosPendientesSeleccionados.filter((pedido) => !pedidosConPrecio.includes(pedido));

    if (pedidosConPrecio.length === 0) {
      setError('Los pedidos seleccionados no tienen un precio valido para solicitar pago.');
      return;
    }

    try {
      setSubmittingSolicitudPagoLote(true);
      setConfirmSolicitudPagoLoteOpen(false);

      const resultados = await Promise.allSettled(
        pedidosConPrecio.map(async (pedido) => {
          const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos/${pedido._id}/solicitar-pago`, {
            method: 'PATCH',
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ precio: Number(pedido.precio) })
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data?.error || 'Error al solicitar pago');
          }
          return data;
        })
      );

      const actualizados = resultados
        .filter((resultado) => resultado.status === 'fulfilled')
        .map((resultado) => resultado.value);

      if (actualizados.length > 0) {
        const byId = new Map(actualizados.map((pedido) => [String(pedido._id), pedido]));
        setPedidos((prev) => prev.map((pedido) => byId.get(String(pedido._id)) || pedido));
      }

      const exitos = actualizados.length;
      const fallidos = resultados.length - exitos;
      const sinPrecio = pedidosSinPrecio.length;

      setSelectedPedidoIds((prev) => prev.filter((id) => {
        const fueExitoso = actualizados.some((pedido) => String(pedido._id) === String(id));
        return !fueExitoso;
      }));

      if (fallidos > 0 || sinPrecio > 0) {
        setError(`Solicitudes procesadas parcialmente: ${exitos} exitosas, ${fallidos} fallidas, ${sinPrecio} sin precio valido.`);
      } else {
        setSuccessMessage(`Solicitud de pago enviada para ${exitos} pedido(s).`);
      }
    } catch (err) {
      setError(err.message || 'Error al solicitar pagos por lote');
    } finally {
      setSubmittingSolicitudPagoLote(false);
    }
  };

  const handleHabilitarSegundoPagoPorLote = async () => {
    if (pedidosFiltradosSeleccionados.length === 0) {
      setError('Selecciona al menos una solicitud para habilitar segundo pago.');
      return;
    }

    const pedidosElegibles = pedidosSegundaParteElegiblesSeleccionados;
    const pedidosNoElegibles = pedidosFiltradosSeleccionados.filter((pedido) => !pedidosElegibles.includes(pedido));

    if (pedidosElegibles.length === 0) {
      setError('Las solicitudes seleccionadas no cumplen condiciones para habilitar segundo pago.');
      return;
    }

    try {
      setSubmittingHabilitarSegundoPagoLote(true);
      setConfirmHabilitarSegundoPagoLoteOpen(false);

      const resultados = await Promise.allSettled(
        pedidosElegibles.map(async (pedido) => {
          const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos/${pedido._id}/habilitar-segunda-parte`, {
            method: 'PATCH',
            headers: token ? { Authorization: `Bearer ${token}` } : undefined
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data?.error || 'Error al habilitar segundo pago');
          }
          return data;
        })
      );

      const actualizados = resultados
        .filter((resultado) => resultado.status === 'fulfilled')
        .map((resultado) => resultado.value);

      if (actualizados.length > 0) {
        const byId = new Map(actualizados.map((pedido) => [String(pedido._id), pedido]));
        setPedidos((prev) => prev.map((pedido) => byId.get(String(pedido._id)) || pedido));
      }

      const exitos = actualizados.length;
      const fallidos = resultados.length - exitos;
      const noElegibles = pedidosNoElegibles.length;

      setSelectedPedidoIds((prev) => prev.filter((id) => {
        const fueExitoso = actualizados.some((pedido) => String(pedido._id) === String(id));
        return !fueExitoso;
      }));

      if (fallidos > 0 || noElegibles > 0) {
        setError(`Habilitación parcial: ${exitos} exitosas, ${fallidos} fallidas, ${noElegibles} no elegibles.`);
      } else {
        setSuccessMessage(`Segundo pago habilitado para ${exitos} solicitud(es).`);
      }
    } catch (err) {
      setError(err.message || 'Error al habilitar segundo pago por lote');
    } finally {
      setSubmittingHabilitarSegundoPagoLote(false);
    }
  };

  const openDetallePagoDialog = (pedido) => {
    setPedidoSeleccionado(pedido);
    setDetallePagoOpen(true);
  };

  const openRegistrarPagoDialog = (pedido) => {
    const saldoPendiente = Number(pedido?.saldo_pendiente);
    const precio = Number(pedido?.precio);
    const montoPagadoActual = Number(pedido?.monto_pagado) || 0;
    const montoSugerido = Number.isFinite(saldoPendiente) && saldoPendiente > 0
      ? saldoPendiente
      : Math.max((Number.isFinite(precio) ? precio : 0) - montoPagadoActual, 0);

    setPedidoSeleccionado(pedido);
    setRegistroPagoData({
      metodoPago: 'Pago movil',
      referencia: '',
      telefonoPago: '',
      cedulaTitular: '',
      nota: '',
      fechaPago: getLocalInputDate(),
      montoPagado: montoSugerido > 0 ? String(Number(montoSugerido.toFixed(2))) : '',
      comprobante: null
    });
    setTasaPagoHistorica(null);
    setRegistrarPagoOpen(true);
  };

  const closeRegistrarPagoDialog = () => {
    if (submittingRegistroPago) return;
    setRegistrarPagoOpen(false);
    setPedidoSeleccionado(null);
    setRegistroPagoData({
      metodoPago: 'Pago movil',
      referencia: '',
      telefonoPago: '',
      cedulaTitular: '',
      nota: '',
      fechaPago: getLocalInputDate(),
      montoPagado: '',
      comprobante: null
    });
    setTasaPagoHistorica(null);
  };

  const handleRegistrarPago = async () => {
    if (!pedidoSeleccionado?._id) return;

    const montoPagado = Number(registroPagoData.montoPagado);
    const montoPagadoBs = Number(montoPagadoBsCalculado);

    if (!registroPagoData.metodoPago) {
      setError('Selecciona un metodo de pago');
      return;
    }
    if (!referenciaRegistroValida) {
      setError('La referencia debe tener minimo 6 digitos');
      return;
    }
    if (!Number.isFinite(montoPagado) || montoPagado <= 0) {
      setError('Debes indicar un monto pagado valido');
      return;
    }
    if (!Number.isFinite(montoPagadoBs) || montoPagadoBs <= 0) {
      setError('No se pudo calcular un monto en bolivares valido para el pago');
      return;
    }

    try {
      setSubmittingRegistroPago(true);
      const payload = new FormData();
      payload.append('metodo_pago', String(registroPagoData.metodoPago || ''));
      payload.append('monto_pagado', String(montoPagado));
      payload.append('monto_pagado_bs', String(Number(montoPagadoBs.toFixed(2))));
      payload.append('fecha_pago', String(registroPagoData.fechaPago || getLocalInputDate()));

      if (metodoPagoRequiereReferencia && referenciaDigitsRegistro) {
        payload.append('referencia', referenciaDigitsRegistro);
      }
      if (String(registroPagoData.telefonoPago || '').trim()) {
        payload.append('telefono_pago', formatTelefonoPago(registroPagoData.telefonoPago));
      }
      if (String(registroPagoData.cedulaTitular || '').trim()) {
        payload.append('cedula_titular', formatCedulaPago(registroPagoData.cedulaTitular));
      }
      if (String(registroPagoData.nota || '').trim()) {
        payload.append('nota', String(registroPagoData.nota).trim());
      }
      if (registroPagoData.comprobante) {
        payload.append('comprobante', registroPagoData.comprobante);
      }

      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos/${pedidoSeleccionado._id}/pagar`, {
        method: 'PATCH',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: payload
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al registrar el pago');

      setPedidos((prev) => prev.map((pedido) => (pedido._id === data._id ? data : pedido)));
      closeRegistrarPagoDialog();
      setSuccessMessage('Pago de uniforme registrado correctamente');
    } catch (err) {
      setError(err.message || 'Error al registrar el pago');
    } finally {
      setSubmittingRegistroPago(false);
    }
  };

  const closeDetallePagoDialog = () => {
    if (submittingVerificacion) return;
    setDetallePagoOpen(false);
    setPedidoSeleccionado(null);
  };

  const handleVerificarPago = async () => {
    if (!pedidoSeleccionado?._id) return;
    try {
      setSubmittingVerificacion(true);
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos/${pedidoSeleccionado._id}/verificar-pago`, {
        method: 'PATCH',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al verificar el pago');
      setPedidos((prev) => prev.map((pedido) => (pedido._id === data._id ? data : pedido)));
      setDetallePagoOpen(false);
      setPedidoSeleccionado(null);
      setSuccessMessage('Pago verificado correctamente');
    } catch (err) {
      setError(err.message || 'Error al verificar el pago');
    } finally {
      setSubmittingVerificacion(false);
    }
  };

  const handleEntregar = async (id) => {
    if (!id) return;
    setEntregandoId(id);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos/${id}/entregado`, {
        method: 'PATCH',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al marcar como entregado');
      setPedidos((prev) => prev.map((pedido) => (pedido._id === id ? data : pedido)));
      setSuccessMessage('Prenda marcada como entregada');
    } catch (err) {
      setError(err.message || 'Error al marcar como entregado');
    } finally {
      setEntregandoId(null);
      setConfirmEntregarId(null);
    }
  };

  const handleHabilitarSegundaParte = async (pedido) => {
    const pedidoId = String(pedido?._id || '');
    if (!pedidoId) return;

    try {
      setHabilitandoSegundaParteId(pedidoId);
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos/${pedidoId}/habilitar-segunda-parte`, {
        method: 'PATCH',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al habilitar segunda parte');

      setPedidos((prev) => prev.map((item) => (String(item._id) === pedidoId ? data : item)));
      setSuccessMessage('Segunda parte habilitada. Ya se puede registrar el pago restante.');
    } catch (err) {
      setError(err.message || 'Error al habilitar segunda parte');
    } finally {
      setHabilitandoSegundaParteId(null);
    }
  };

  const openConfirmHabilitarSegundaParte = (pedido) => {
    if (!pedido?._id) return;
    setConfirmHabilitarSegundaPartePedido(pedido);
  };

  const closeConfirmHabilitarSegundaParte = () => {
    if (habilitandoSegundaParteId) return;
    setConfirmHabilitarSegundaPartePedido(null);
  };

  const confirmHabilitarSegundaParte = async () => {
    if (!confirmHabilitarSegundaPartePedido?._id) return;
    await handleHabilitarSegundaParte(confirmHabilitarSegundaPartePedido);
    setConfirmHabilitarSegundaPartePedido(null);
  };

  const handleEliminarSolicitud = async (id) => {
    if (!id) return;
    setEliminandoId(id);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al eliminar la solicitud');

      setPedidos((prev) => prev.filter((pedido) => String(pedido._id) !== String(id)));
      setSelectedPedidoIds((prev) => prev.filter((pedidoId) => String(pedidoId) !== String(id)));
      setSuccessMessage('Solicitud eliminada correctamente');
    } catch (err) {
      setError(err.message || 'Error al eliminar la solicitud');
    } finally {
      setEliminandoId(null);
      setConfirmEliminarId(null);
    }
  };

  const renderAccion = (pedido, mobile = false) => {
    const renderEditarSolicitudButton = () => (
      <Tooltip title="Editar solicitud">
        <IconButton
          size="small"
          onClick={() => openEditSolicitudDialog(pedido)}
          aria-label="Editar solicitud"
          sx={{
            bgcolor: '#f1f5f9',
            color: '#334155',
            '&:hover': { bgcolor: '#e2e8f0' }
          }}
        >
          <EditOutlinedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    );

    if (pedido.estado === 'pendiente') {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, justifyContent: mobile ? 'flex-start' : 'center' }}>
          {renderEditarSolicitudButton()}
          <Tooltip title="Solicitar pago">
            <IconButton
              size="small"
              onClick={() => openSolicitudPagoDialog(pedido)}
              aria-label="Solicitar pago"
              sx={{
                bgcolor: '#e9f2ff',
                color: '#1557a8',
                '&:hover': { bgcolor: '#dbeafe' }
              }}
            >
              <RequestQuoteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={eliminandoId === pedido._id ? 'Eliminando...' : 'Eliminar solicitud'}>
            <span>
              <IconButton
                size="small"
                disabled={eliminandoId === pedido._id}
                onClick={() => setConfirmEliminarId(pedido._id)}
                aria-label="Eliminar solicitud"
                sx={{
                  bgcolor: '#fee2e2',
                  color: '#b91c1c',
                  '&:hover': { bgcolor: '#fecaca' },
                  '&:disabled': { bgcolor: '#e5e7eb', color: '#94a3b8' }
                }}
              >
                {eliminandoId === pedido._id
                  ? <CircularProgress size={16} sx={{ color: '#b91c1c' }} />
                  : <DeleteOutlineIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      );
    }

    if (pedido.estado === 'esperando_pago') {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, justifyContent: mobile ? 'flex-start' : 'center' }}>
          {renderEditarSolicitudButton()}
          <Tooltip title="Registrar pago">
            <IconButton
              size="small"
              onClick={() => openRegistrarPagoDialog(pedido)}
              aria-label="Registrar pago"
              sx={actionIconButtonSx}
            >
              <PaidIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={eliminandoId === pedido._id ? 'Eliminando...' : 'Eliminar solicitud'}>
            <span>
              <IconButton
                size="small"
                disabled={eliminandoId === pedido._id}
                onClick={() => setConfirmEliminarId(pedido._id)}
                aria-label="Eliminar solicitud"
                sx={{
                  bgcolor: '#fee2e2',
                  color: '#b91c1c',
                  '&:hover': { bgcolor: '#fecaca' },
                  '&:disabled': { bgcolor: '#e5e7eb', color: '#94a3b8' }
                }}
              >
                {eliminandoId === pedido._id
                  ? <CircularProgress size={16} sx={{ color: '#b91c1c' }} />
                  : <DeleteOutlineIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      );
    }

    if (pedido.estado === 'cancelado') {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, justifyContent: mobile ? 'flex-start' : 'center' }}>
          <Tooltip title={eliminandoId === pedido._id ? 'Eliminando...' : 'Eliminar solicitud'}>
            <span>
              <IconButton
                size="small"
                disabled={eliminandoId === pedido._id}
                onClick={() => setConfirmEliminarId(pedido._id)}
                aria-label="Eliminar solicitud"
                sx={{
                  bgcolor: '#fee2e2',
                  color: '#b91c1c',
                  '&:hover': { bgcolor: '#fecaca' },
                  '&:disabled': { bgcolor: '#e5e7eb', color: '#94a3b8' }
                }}
              >
                {eliminandoId === pedido._id
                  ? <CircularProgress size={16} sx={{ color: '#b91c1c' }} />
                  : <DeleteOutlineIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      );
    }

    if (pedido.estado === 'abono') {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, justifyContent: mobile ? 'flex-start' : 'center' }}>
          {renderEditarSolicitudButton()}
          {puedeHabilitarSegundaParte(pedido) && (
            <Tooltip title={habilitandoSegundaParteId === pedido._id ? 'Habilitando...' : 'Habilitar segundo pago'}>
              <span>
                <IconButton
                  size="small"
                  onClick={() => openConfirmHabilitarSegundaParte(pedido)}
                  aria-label="Habilitar segunda parte"
                  disabled={habilitandoSegundaParteId === pedido._id}
                  sx={{
                    bgcolor: '#fff7ed',
                    color: '#c2410c',
                    '&:hover': { bgcolor: '#ffedd5' },
                    '&:disabled': { bgcolor: '#e5e7eb', color: '#94a3b8' }
                  }}
                >
                  {habilitandoSegundaParteId === pedido._id
                    ? <CircularProgress size={16} sx={{ color: '#c2410c' }} />
                    : <LockOpenIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
          )}
          <Tooltip title="Registrar pago">
            <IconButton
              size="small"
              onClick={() => openRegistrarPagoDialog(pedido)}
              aria-label="Registrar pago"
              sx={actionIconButtonSx}
            >
              <PaidIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Ver detalle de pago">
            <IconButton
              size="small"
              onClick={() => openDetallePagoDialog(pedido)}
              aria-label="Ver detalle de pago"
              sx={{
                bgcolor: '#eef2ff',
                color: '#1d4ed8',
                '&:hover': { bgcolor: '#e0e7ff' }
              }}
            >
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      );
    }

    if (pedido.estado === 'pago_en_revision') {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, justifyContent: mobile ? 'flex-start' : 'center' }}>
          {renderEditarSolicitudButton()}
          <Tooltip title="Ver detalle de pago">
            <IconButton
              size="small"
              onClick={() => openDetallePagoDialog(pedido)}
              aria-label="Ver detalle de pago"
              sx={{
                bgcolor: '#eef2ff',
                color: '#1d4ed8',
                '&:hover': { bgcolor: '#e0e7ff' }
              }}
            >
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      );
    }

    if (pedido.estado === 'verificado' || pedido.estado === 'entregado') {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, justifyContent: mobile ? 'flex-start' : 'center' }}>
          {pedido.estado !== 'entregado' && renderEditarSolicitudButton()}
          <Tooltip title="Ver detalle de pago">
            <IconButton
              size="small"
              onClick={() => openDetallePagoDialog(pedido)}
              aria-label="Ver detalle de pago"
              sx={{
                bgcolor: '#eef2ff',
                color: '#1d4ed8',
                '&:hover': { bgcolor: '#e0e7ff' }
              }}
            >
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          {pedido.estado === 'verificado' && (
            <Tooltip title={entregandoId === pedido._id ? 'Entregando...' : 'Marcar como entregado'}>
              <span>
                <IconButton
                  size="small"
                  disabled={entregandoId === pedido._id}
                  onClick={() => setConfirmEntregarId(pedido._id)}
                  aria-label="Marcar como entregado"
                  sx={{
                    bgcolor: '#dcfce7',
                    color: '#166534',
                    '&:hover': { bgcolor: '#bbf7d0' },
                    '&:disabled': { bgcolor: '#e5e7eb', color: '#94a3b8' }
                  }}
                >
                  {entregandoId === pedido._id
                    ? <CircularProgress size={16} sx={{ color: '#166534' }} />
                    : <LocalShippingIcon fontSize="small" />}
                </IconButton>
              </span>
            </Tooltip>
          )}
        </Box>
      );
    }

    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, justifyContent: mobile ? 'flex-start' : 'center' }}>
        {renderEditarSolicitudButton()}
      </Box>
    );
  };

  return (
    <Box>
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
        open={!!error}
        autoHideDuration={3500}
        onClose={() => setError('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setError('')} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>

      <Box
        sx={{
          mb: 1.5,
          display: 'flex',
          alignItems: { xs: 'stretch', md: 'flex-start' },
          justifyContent: 'space-between',
          flexDirection: { xs: 'column', md: 'row' },
          gap: 1.2
        }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 900, fontSize: { xs: 29, md: 34 }, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1.06 }}>
            Pedidos de Uniformes
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.35, maxWidth: 760, lineHeight: 1.25 }}>
            Lista de solicitudes realizadas por los alumnos. Solicita pagos, verifica comprobantes y marca prendas como entregadas.
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          onClick={exportPedidosExcel}
          sx={{
            textTransform: 'none',
            fontWeight: 700,
            borderRadius: 2,
            minHeight: 40,
            px: 1.8,
            whiteSpace: 'nowrap',
            alignSelf: { xs: 'flex-end', md: 'flex-start' },
            borderColor: '#d9e2f0',
            color: '#0f172a',
            backgroundColor: '#ffffff',
            '&:hover': { borderColor: '#c2cfe3', backgroundColor: '#f8fafc' }
          }}
        >
          Exportar Excel
        </Button>
      </Box>

      <Paper
        elevation={0}
        sx={{
          border: '1px solid #e7edf6',
          borderRadius: 2.75,
          p: 1.25,
          mb: 1.2,
          backgroundColor: '#ffffff',
          boxShadow: '0 10px 22px rgba(15, 23, 42, 0.04)'
        }}
      >
        <Box
          sx={{
            display: 'grid',
            gap: 1,
            width: '100%'
          }}
        >
          <Box
            sx={{
              display: { xs: 'grid', md: 'flex' },
              gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))' },
              gap: 1,
              flexWrap: 'wrap',
              flexGrow: 1,
              minWidth: 0,
              width: '100%'
            }}
          >
            <TextField
              select
              size="small"
              label="Mes"
              value={filtroMes}
              onChange={(event) => {
                setFiltroMes(event.target.value);
                setPagina(0);
              }}
              sx={{
                minWidth: { xs: 0, md: 170 },
                '& .MuiOutlinedInput-root': { height: 40, borderRadius: 2, backgroundColor: '#f8fafc', border: '1px solid #ebf0f6' },
                '& .MuiInputLabel-root': { fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#94a3b8' }
              }}
            >
              <MenuItem value="todos">Todos</MenuItem>
              {MESES.map((mes, index) => (
                <MenuItem key={mes} value={(index + 1).toString()}>{mes}</MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              label="Estado"
              value={filtroEstado}
              onChange={(event) => {
                setFiltroEstado(event.target.value);
                setPagina(0);
              }}
              sx={{
                minWidth: { xs: 0, md: 175 },
                '& .MuiOutlinedInput-root': { height: 40, borderRadius: 2, backgroundColor: '#f8fafc', border: '1px solid #ebf0f6' },
                '& .MuiInputLabel-root': { fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#94a3b8' }
              }}
            >
              <MenuItem value="todos">Todos los estados</MenuItem>
              <MenuItem value="pendiente">Pendiente</MenuItem>
              <MenuItem value="esperando_pago">Esperando pago</MenuItem>
              <MenuItem value="abono">Abono</MenuItem>
              <MenuItem value="pago_en_revision">Pago en revision</MenuItem>
              <MenuItem value="verificado">Verificado</MenuItem>
              <MenuItem value="entregado">Entregado</MenuItem>
              <MenuItem value="cancelado">Cancelado</MenuItem>
            </TextField>

            <TextField
              size="small"
              label="Alumno"
              placeholder="Nombre o apellido"
              value={filtroAlumno}
              onChange={(event) => {
                setFiltroAlumno(event.target.value);
                setPagina(0);
              }}
              sx={{
                minWidth: { xs: 0, md: 200 },
                gridColumn: { xs: '1 / -1', sm: 'auto' },
                '& .MuiOutlinedInput-root': { height: 40, borderRadius: 2, backgroundColor: '#f8fafc', border: '1px solid #ebf0f6' },
                '& .MuiInputLabel-root': { fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#94a3b8' }
              }}
            />

            <TextField
              select
              size="small"
              label="Prenda"
              InputLabelProps={{ shrink: true }}
              value={filtroPrenda}
              onChange={(event) => {
                const value = event.target.value;
                const nextValues = Array.isArray(value) ? value : String(value).split(',');

                if (nextValues.includes(ALL_PRENDAS_VALUE)) {
                  setFiltroPrenda([]);
                  setPagina(0);
                  return;
                }

                setFiltroPrenda(nextValues);
                setPagina(0);
              }}
              SelectProps={{
                multiple: true,
                displayEmpty: true,
                renderValue: (selected) => {
                  const selectedValues = Array.isArray(selected) ? selected : [];
                  if (selectedValues.length === 0) return 'Todas las prendas';
                  if (selectedValues.length === 1) {
                    const encontrada = opcionesPrenda.find((item) => item.value === selectedValues[0]);
                    return encontrada?.label || selectedValues[0];
                  }
                  return `${selectedValues.length} prendas`;
                }
              }}
              sx={{
                minWidth: { xs: 0, md: 175 },
                gridColumn: { xs: '1 / -1', sm: 'auto' },
                '& .MuiOutlinedInput-root': { height: 40, borderRadius: 2, backgroundColor: '#f8fafc', border: '1px solid #ebf0f6' },
                '& .MuiInputLabel-root': { fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#94a3b8' }
              }}
            >
              <MenuItem value={ALL_PRENDAS_VALUE}>
                <Checkbox size="small" checked={filtroPrenda.length === 0} />
                <Typography sx={{ fontSize: 13.5, color: '#475569', fontWeight: 600 }}>Todas las prendas</Typography>
              </MenuItem>
              {opcionesPrenda.map((prenda) => (
                <MenuItem key={prenda.value} value={prenda.value}>
                  <Checkbox size="small" checked={filtroPrenda.includes(prenda.value)} />
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.45 }}>
                    <Typography component="span" sx={{ fontSize: 13.5, color: '#475569', fontWeight: 600 }}>
                      {prenda.label}
                    </Typography>
                    {prenda.esSoloActiva && (
                      <Box
                        component="span"
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          px: 0.65,
                          py: 0.2,
                          borderRadius: '999px',
                          backgroundColor: '#eef2f7',
                          border: '1px solid #d6dee9',
                          color: '#94a3b8',
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.02em',
                          lineHeight: 1,
                          whiteSpace: 'nowrap'
                        }}
                      >
                        solicitudes activas
                      </Box>
                    )}
                  </Box>
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              label="Categoria"
              InputLabelProps={{ shrink: true }}
              value={filtroCategoria}
              onChange={(event) => {
                const value = event.target.value;
                const nextValues = Array.isArray(value) ? value : String(value).split(',');

                if (nextValues.includes(ALL_CATEGORIAS_VALUE)) {
                  setFiltroCategoria([]);
                  setPagina(0);
                  return;
                }

                setFiltroCategoria(nextValues);
                setPagina(0);
              }}
              SelectProps={{
                multiple: true,
                displayEmpty: true,
                renderValue: (selected) => {
                  const selectedValues = Array.isArray(selected) ? selected : [];
                  if (selectedValues.length === 0) return 'Todas las categorias';
                  if (selectedValues.length === 1) {
                    const encontrada = opcionesCategoria.find((item) => item.value === selectedValues[0]);
                    return encontrada?.label || selectedValues[0];
                  }
                  return `${selectedValues.length} categorias`;
                }
              }}
              sx={{
                minWidth: { xs: 0, md: 175 },
                gridColumn: { xs: '1 / -1', sm: 'auto' },
                '& .MuiOutlinedInput-root': { height: 40, borderRadius: 2, backgroundColor: '#f8fafc', border: '1px solid #ebf0f6' },
                '& .MuiInputLabel-root': { fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#94a3b8' }
              }}
            >
              <MenuItem value={ALL_CATEGORIAS_VALUE}>
                <Checkbox size="small" checked={filtroCategoria.length === 0} />
                <Typography sx={{ fontSize: 13.5, color: '#475569', fontWeight: 600 }}>Todas las categorias</Typography>
              </MenuItem>
              {opcionesCategoria.map((categoria) => (
                <MenuItem key={categoria.value} value={categoria.value}>
                  <Checkbox size="small" checked={filtroCategoria.includes(categoria.value)} />
                  <Typography sx={{ fontSize: 13.5, color: '#475569', fontWeight: 600 }}>{categoria.label}</Typography>
                </MenuItem>
              ))}
            </TextField>

            <TextField
              select
              size="small"
              label="Sexo"
              value={filtroSexo}
              onChange={(event) => {
                setFiltroSexo(event.target.value);
                setPagina(0);
              }}
              sx={{
                minWidth: { xs: 0, md: 175 },
                '& .MuiOutlinedInput-root': { height: 40, borderRadius: 2, backgroundColor: '#f8fafc', border: '1px solid #ebf0f6' },
                '& .MuiInputLabel-root': { fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: '#94a3b8' }
              }}
            >
              <MenuItem value="todos">Todos</MenuItem>
              {opcionesSexo.map((sexo) => (
                <MenuItem key={sexo.value} value={sexo.value}>{sexo.label}</MenuItem>
              ))}
            </TextField>
          </Box>
        </Box>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          mb: 1.1,
          borderRadius: 2.2,
          border: '1px solid #1e293b',
          bgcolor: '#0f172a',
          color: '#e2e8f0',
          px: 1.25,
          py: 0.9
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: { xs: 'stretch', md: 'center' },
            justifyContent: 'space-between',
            flexDirection: { xs: 'column', md: 'row' },
            gap: 1
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box
              sx={{
                minWidth: 28,
                height: 22,
                px: 0.7,
                borderRadius: '999px',
                bgcolor: '#2563eb',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: 12,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {pedidosFiltradosSeleccionados.length}
            </Box>
            <Typography sx={{ color: '#e2e8f0', fontWeight: 700, fontSize: 13.5 }}>
              pedidos seleccionados
            </Typography>
            <Button
              variant="text"
              onClick={handleToggleSeleccionGlobalFiltrados}
              disabled={pedidosFiltradosIds.length === 0 || submittingSolicitudPagoLote || submittingHabilitarSegundoPagoLote || submittingEliminarLote}
              sx={{
                textTransform: 'none',
                minHeight: 28,
                px: 0.7,
                fontWeight: 700,
                fontSize: 12.5,
                color: '#93c5fd',
                '&:hover': { backgroundColor: 'rgba(147, 197, 253, 0.08)' }
              }}
            >
              {todosFiltradosSeleccionadosGlobal ? 'Limpiar selección' : `Seleccionar todos (${pedidosFiltradosIds.length})`}
            </Button>
          </Box>

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
            <Button
              variant="outlined"
              startIcon={<LockOpenIcon />}
              disabled={pedidosSegundaParteElegiblesSeleccionados.length === 0 || submittingHabilitarSegundoPagoLote}
              onClick={() => setConfirmHabilitarSegundoPagoLoteOpen(true)}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                borderRadius: 2,
                minHeight: 34,
                px: 1.2,
                whiteSpace: 'nowrap',
                borderColor: '#334155',
                color: '#e2e8f0',
                '&:hover': { borderColor: '#475569', backgroundColor: 'rgba(255,255,255,0.04)' },
                '&:disabled': { borderColor: '#334155', color: '#64748b' }
              }}
            >
              {submittingHabilitarSegundoPagoLote
                ? 'Procesando...'
                : `Habilitar 2do pago (${pedidosSegundaParteElegiblesSeleccionados.length})`}
            </Button>
            <Button
              variant="contained"
              startIcon={<RequestQuoteIcon />}
              disabled={pedidosPendientesSeleccionados.length === 0 || submittingSolicitudPagoLote}
              onClick={() => setConfirmSolicitudPagoLoteOpen(true)}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                borderRadius: 2,
                minHeight: 34,
                px: 1.2,
                whiteSpace: 'nowrap',
                bgcolor: '#2563eb',
                boxShadow: 'none',
                '&:hover': { bgcolor: '#1d4ed8', boxShadow: 'none' },
                '&:disabled': { bgcolor: '#334155', color: '#94a3b8' }
              }}
            >
              {submittingSolicitudPagoLote
                ? 'Procesando...'
                : `Solicitar pago (${pedidosPendientesSeleccionados.length})`}
            </Button>
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteOutlineIcon />}
              disabled={pedidosFiltradosSeleccionados.length === 0 || submittingEliminarLote}
              onClick={() => setConfirmEliminarLoteOpen(true)}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                borderRadius: 2,
                minHeight: 34,
                px: 1.2,
                whiteSpace: 'nowrap',
                borderColor: '#7f1d1d',
                color: '#fca5a5',
                '&:hover': { borderColor: '#b91c1c', backgroundColor: 'rgba(185, 28, 28, 0.14)' },
                '&:disabled': { borderColor: '#334155', color: '#64748b' }
              }}
            >
              {submittingEliminarLote
                ? 'Eliminando...'
                : `Eliminar (${pedidosFiltradosSeleccionados.length})`}
            </Button>
          </Box>
        </Box>
      </Paper>

      {loading ? (
        <Typography>Cargando...</Typography>
      ) : error ? (
        <Typography color="error">{error}</Typography>
      ) : isMobile ? (
        <Box>
          <Box sx={{ display: 'grid', gap: 1.5 }}>
            {pedidosPaginados.map((pedido) => (
              <Paper
                key={pedido._id}
                sx={{
                  borderRadius: 3,
                  border: '1px solid #e2e8f0',
                  p: 1.5,
                  boxShadow: '0 4px 14px rgba(15, 23, 42, 0.06)'
                }}
              >
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, mb: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minWidth: 0 }}>
                    <Checkbox
                      size="small"
                      checked={selectedPedidoIds.includes(String(pedido._id))}
                      onChange={() => handleTogglePedidoSeleccionado(pedido._id)}
                    />
                    {pedido.alumno ? (
                      <Tooltip title={getTooltipEstadoAlumno(pedido.alumno)} arrow>
                        <Box
                          sx={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            bgcolor: esAlumnoActivo(pedido.alumno) ? '#16a34a' : '#dc2626',
                            boxShadow: esAlumnoActivo(pedido.alumno)
                              ? '0 0 0 3px rgba(22, 163, 74, 0.14)'
                              : '0 0 0 3px rgba(220, 38, 38, 0.14)',
                            flexShrink: 0,
                            mr: 0.5
                          }}
                        />
                      </Tooltip>
                    ) : null}
                    <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>
                      {pedido.alumno ? `${pedido.alumno.nombres} ${pedido.alumno.apellidos}` : '-'}
                    </Typography>
                  </Box>
                  <Chip label={getEstadoLabel(pedido.estado)} size="small" sx={{ ...getEstadoStyle(pedido.estado), fontWeight: 700 }} />
                </Box>

                <Box sx={{ display: 'grid', gap: 0.5, mb: 1.2 }}>
                  <Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Sede:</b> {pedido.sede?.nombre || '-'}</Typography>
                  <Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Prenda:</b> {pedido.prenda || '-'}</Typography>
                  <Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Talla:</b> {pedido.talla || '-'}</Typography>
                  <Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Nombre:</b> {pedido.nombre_personalizado || '-'}</Typography>
                  <Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Numero:</b> {pedido.numero_franela || '-'}</Typography>
                  <Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Cobranza:</b> {getMetodoCobranzaLabel(pedido)}</Typography>
                  <Typography sx={{ fontSize: 12.5, color: '#0f172a' }}><b>Precio:</b> {formatMoneyWithCurrency(pedido.precio, pedido.moneda)}</Typography>
                  <Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Fecha:</b> {formatFecha(pedido.createdAt)}</Typography>
                  <Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Pagado:</b> {formatMoneyWithCurrency(pedido.monto_pagado, pedido.moneda)}</Typography>
                  <Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Pendiente:</b> {formatMoneyWithCurrency(pedido.saldo_pendiente ?? pedido.precio, pedido.moneda)}</Typography>
                  <Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Método:</b> {pedido.metodo_pago || '-'}</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Referencia:</b> {pedido.referencia || '-'}</Typography>
                    {pedido.referencia && (
                      <IconButton size="small" onClick={() => copiarReferencia(pedido.referencia)} aria-label="Copiar referencia" sx={{ color: '#94a3b8' }}>
                        <ContentCopyIcon fontSize="inherit" />
                      </IconButton>
                    )}
                  </Box>
                </Box>

                <Box sx={{ display: 'grid', gap: 1 }}>
                  {pedido.comprobante_url ? (
                    <Button size="small" variant="text" onClick={() => handleVerComprobante(pedido.comprobante_url)}>
                      Ver comprobante
                    </Button>
                  ) : (
                    <Typography variant="body2" color="text.secondary">Sin comprobante</Typography>
                  )}
                  {renderAccion(pedido, true)}
                </Box>
              </Paper>
            ))}
          </Box>

          <Paper
            sx={{
              mt: 1.5,
              borderRadius: 2,
              border: '1px solid #e2e8f0',
              boxShadow: '0 2px 8px rgba(15, 23, 42, 0.04)'
            }}
          >
            <TablePagination
              component="div"
              count={pedidosFiltrados.length}
              page={pagina}
              onPageChange={handleChangePagina}
              rowsPerPage={filasPorPagina}
              onRowsPerPageChange={handleChangeFilasPorPagina}
              rowsPerPageOptions={[5, 10, 25, 50]}
              labelRowsPerPage="Filas por página"
            />
          </Paper>
        </Box>
      ) : (
        <TableContainer
          component={Paper}
          sx={{
            mt: 1.25,
            borderRadius: 3,
            overflowX: 'auto',
            overflowY: 'hidden',
            maxWidth: '100%',
            border: '1px solid #e2e8f0',
            boxShadow: '0 8px 20px rgba(15, 23, 42, 0.05)'
          }}
        >
          <Table sx={{ minWidth: 980 }}>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f8fafc' }}>
                <TableCell padding="checkbox" sx={{ color: '#64748b', fontSize: 12, fontWeight: 700 }}>
                  <Checkbox
                    size="small"
                    indeterminate={!todosFiltradosPaginaSeleccionados && pedidosPaginados.some((pedido) => selectedPedidoIds.includes(String(pedido._id)))}
                    checked={todosFiltradosPaginaSeleccionados}
                    onChange={handleToggleSeleccionPaginaFiltrados}
                    disabled={pedidosPaginados.length === 0}
                  />
                </TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>ALUMNO</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>SEDE</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>PRENDA</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>TALLA</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>NOMBRE</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>NUMERO</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>COBRANZA</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>PRECIO</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>FECHA</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>ESTADO</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>ACCIONES</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pedidosPaginados.map((pedido) => (
                <TableRow
                  key={pedido._id}
                  sx={{
                    '& td': { borderBottom: '1px solid #eef0f3', py: 1.8, verticalAlign: 'middle' },
                    '&:hover': { backgroundColor: '#f8fafc' }
                  }}
                >
                  <TableCell padding="checkbox">
                    <Checkbox
                      size="small"
                      checked={selectedPedidoIds.includes(String(pedido._id))}
                      onChange={() => handleTogglePedidoSeleccionado(pedido._id)}
                    />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600, color: '#1f2937' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                      {pedido.alumno ? (
                        <Tooltip title={getTooltipEstadoAlumno(pedido.alumno)} arrow>
                          <Box
                            sx={{
                              width: 10,
                              height: 10,
                              borderRadius: '50%',
                              bgcolor: esAlumnoActivo(pedido.alumno) ? '#16a34a' : '#dc2626',
                              boxShadow: esAlumnoActivo(pedido.alumno)
                                ? '0 0 0 3px rgba(22, 163, 74, 0.14)'
                                : '0 0 0 3px rgba(220, 38, 38, 0.14)',
                              flexShrink: 0
                            }}
                          />
                        </Tooltip>
                      ) : null}
                      <Typography sx={{ fontWeight: 600, color: '#1f2937' }}>
                        {pedido.alumno ? `${pedido.alumno.nombres} ${pedido.alumno.apellidos}` : '-'}
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ color: '#475569' }}>{pedido.sede?.nombre || '-'}</TableCell>
                  <TableCell sx={{ color: '#1f2937' }}>{pedido.prenda}</TableCell>
                  <TableCell sx={{ color: '#475569', fontWeight: 600 }}>{pedido.talla}</TableCell>
                  <TableCell sx={{ color: '#475569' }}>{pedido.nombre_personalizado || '-'}</TableCell>
                  <TableCell sx={{ color: '#475569' }}>{pedido.numero_franela || '-'}</TableCell>
                  <TableCell sx={{ color: '#475569', fontWeight: 600 }}>{getMetodoCobranzaLabel(pedido)}</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: '#0f172a' }}>{formatMoneyWithCurrency(pedido.precio, pedido.moneda)}</TableCell>
                  <TableCell sx={{ color: '#475569', fontWeight: 600 }}>{formatFecha(pedido.createdAt)}</TableCell>
                  <TableCell>
                    <Chip label={getEstadoLabel(pedido.estado)} size="small" sx={{ ...getEstadoStyle(pedido.estado), fontWeight: 700 }} />
                  </TableCell>
                  <TableCell sx={{ minWidth: 190 }}>
                    {renderAccion(pedido)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={pedidosFiltrados.length}
            page={pagina}
            onPageChange={handleChangePagina}
            rowsPerPage={filasPorPagina}
            onRowsPerPageChange={handleChangeFilasPorPagina}
            rowsPerPageOptions={[5, 10, 25, 50]}
            labelRowsPerPage="Filas por página"
          />
        </TableContainer>
      )}

      <Dialog
        open={solicitudPagoOpen}
        onClose={closeSolicitudPagoDialog}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
      >
        <DialogTitle sx={{ bgcolor: '#f3f5fb', color: '#0b2a57', fontWeight: 800, fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <RequestQuoteIcon sx={{ fontSize: 20, color: '#1d4ed8' }} />
            <Typography sx={{ fontWeight: 800, fontSize: 17, color: '#0b2a57' }}>
              Solicitar pago
            </Typography>
          </Box>
          <IconButton size="small" onClick={closeSolicitudPagoDialog} disabled={submittingSolicitudPago} sx={{ color: '#6b7280' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ bgcolor: '#f3f5fb', pt: 2.5, pb: 2.5 }}>
          <Paper
            elevation={0}
            sx={{
              borderRadius: 2.5,
              border: '1px solid #e7eaf2',
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
              p: 2
            }}
          >
            <Box sx={{ display: 'grid', gap: 1.5 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 1 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', color: '#94a3b8', textTransform: 'uppercase' }}>
                  Alumno
                </Typography>
                <Typography sx={{ fontWeight: 700, color: '#0f172a' }}>
                  {pedidoSeleccionado?.alumno ? `${pedidoSeleccionado.alumno.nombres} ${pedidoSeleccionado.alumno.apellidos}` : '-'}
                </Typography>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 1 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', color: '#94a3b8', textTransform: 'uppercase' }}>
                  Prenda
                </Typography>
                <Typography sx={{ fontWeight: 700, color: '#334155' }}>
                  {pedidoSeleccionado?.prenda || '-'}
                </Typography>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 1 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', color: '#94a3b8', textTransform: 'uppercase' }}>
                  Monto
                </Typography>
                <Typography sx={{ fontWeight: 800, color: '#0f172a' }}>
                  {isDosPartes50(pedidoSeleccionado)
                    ? `${formatMoneyWithCurrency(getMontoPrimeraParteObjetivo(pedidoSeleccionado), pedidoSeleccionado?.moneda)} (primera parte)`
                    : formatMoneyWithCurrency(pedidoSeleccionado?.precio, pedidoSeleccionado?.moneda)}
                </Typography>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 1 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', color: '#94a3b8', textTransform: 'uppercase' }}>
                  Cobranza
                </Typography>
                <Typography sx={{ fontWeight: 700, color: '#334155' }}>
                  {getMetodoCobranzaLabel(pedidoSeleccionado)}
                </Typography>
              </Box>

              <Typography variant="body2" sx={{ color: '#64748b' }}>
                Para cambiar campos de la solicitud (incluyendo monto), usa "Editar solicitud" antes de confirmar.
              </Typography>
            </Box>
          </Paper>
        </DialogContent>
        <DialogActions sx={{ bgcolor: '#f3f5fb', px: 3, pb: 2.5, pt: 0.5 }}>
          <Button onClick={closeSolicitudPagoDialog} disabled={submittingSolicitudPago} sx={{ color: '#475569', textTransform: 'none', fontWeight: 700 }}>
            Cancelar
          </Button>
          <Button
            onClick={handleSolicitarPago}
            variant="contained"
            disabled={submittingSolicitudPago}
            sx={{ textTransform: 'none', fontWeight: 700, boxShadow: 'none', px: 2.2 }}
          >
            {submittingSolicitudPago ? 'Procesando...' : 'Confirmar solicitud de pago'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={registrarPagoOpen}
        onClose={closeRegistrarPagoDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)',
            overflow: 'hidden'
          }
        }}
      >
        <DialogTitle
          disableTypography
          sx={{
            p: 3,
            pb: 1.5,
            backgroundColor: '#ffffff'
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
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
                  Registrar Pago
                </Typography>
                <Typography variant="body2" sx={{ color: '#94a3b8', mt: 0.25 }}>
                  Ingresa los detalles de tu transferencia para procesar la inscripcion.
                </Typography>
              </Box>
            </Box>
            <IconButton size="small" onClick={closeRegistrarPagoDialog} disabled={submittingRegistroPago} sx={{ color: '#6b7280' }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ p: 3, pt: 1.5, bgcolor: '#f8fafc' }}>
          {String(pedidoSeleccionado?.estado || '').toLowerCase() === 'abono' && (
            <Button
              variant="text"
              size="small"
              onClick={() => {
                setRegistrarPagoOpen(false);
                openDetallePagoDialog(pedidoSeleccionado);
              }}
              sx={{ mt: 1, color: '#f97316', fontWeight: 700 }}
            >
              Ver historial de abonos
            </Button>
          )}

          {pedidoSeleccionado?.alumno && (
            <Box
              sx={{
                mb: 2,
                px: 1.75,
                py: 1.25,
                borderRadius: 2,
                border: '1px solid #e2e8f0',
                bgcolor: '#ffffff'
              }}
            >
              <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: '#94a3b8' }}>
                ALUMNO SELECCIONADO
              </Typography>
              <Typography sx={{ mt: 0.45, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                {`${pedidoSeleccionado.alumno.nombres || ''} ${pedidoSeleccionado.alumno.apellidos || ''}`.trim() || '-'}
              </Typography>
            </Box>
          )}

          <TextField
            select
            label="Método de pago"
            fullWidth
            margin="normal"
            size="small"
            sx={inputSx}
            value={registroPagoData.metodoPago}
            onChange={(event) => {
              const metodo = event.target.value;
              setRegistroPagoData((prev) => ({
                ...prev,
                metodoPago: metodo,
                referencia: metodo === 'Transferencia' || metodo === 'Pago movil' ? prev.referencia : ''
              }));
            }}
          >
            {METODOS_PAGO.map((metodo) => (
              <MenuItem key={metodo} value={metodo}>{metodo}</MenuItem>
            ))}
          </TextField>

          <TextField
            label="¿Cuándo se realizó el pago?"
            type="date"
            fullWidth
            margin="normal"
            size="small"
            sx={inputSx}
            value={registroPagoData.fechaPago}
            onChange={(event) => setRegistroPagoData((prev) => ({ ...prev, fechaPago: event.target.value }))}
            InputLabelProps={{ shrink: true }}
          />

          <TextField
            label={`Monto a pagar (${normalizarMoneda(pedidoSeleccionado?.moneda)})`}
            type="number"
            fullWidth
            margin="normal"
            size="small"
            sx={inputSx}
            value={registroPagoData.montoPagado}
            onChange={(event) => setRegistroPagoData((prev) => ({ ...prev, montoPagado: event.target.value }))}
            inputProps={{ min: 0, step: '0.01' }}
          />

          <Typography variant="body2" sx={{ mt: -0.5, mb: 1, color: '#64748b' }}>
            Monto en Bs: {formatMoney(montoPagadoBsCalculado)} Bs
          </Typography>
          <Typography variant="caption" sx={{ mt: -0.5, mb: 1, color: '#94a3b8', display: 'block' }}>
            Tasa aplicada: {formatMoney(tasaPagoActiva)} Bs/{monedaPagoRegistro}
          </Typography>

          {metodoPagoRequiereReferencia && (
            <TextField
              label="Referencia (mínimo 6 últimos dígitos)"
              fullWidth
              margin="normal"
              size="small"
              sx={inputSx}
              value={registroPagoData.referencia}
              onChange={(event) => setRegistroPagoData((prev) => ({ ...prev, referencia: event.target.value.replace(/[^0-9]/g, '') }))}
              inputProps={{ minLength: 6 }}
            />
          )}

          <TextField
            label="Telefono de pago"
            fullWidth
            margin="normal"
            size="small"
            sx={inputSx}
            value={registroPagoData.telefonoPago}
            onChange={(event) => setRegistroPagoData((prev) => ({ ...prev, telefonoPago: event.target.value.replace(/[^0-9]/g, '').slice(0, 10) }))}
            inputProps={{ inputMode: 'numeric', maxLength: 10 }}
            helperText="Opcional. Solo numeros, hasta 10 digitos."
          />

          <TextField
            label="Cedula titular"
            fullWidth
            margin="normal"
            size="small"
            sx={inputSx}
            value={registroPagoData.cedulaTitular}
            onChange={(event) => setRegistroPagoData((prev) => ({ ...prev, cedulaTitular: event.target.value }))}
          />

          <TextField
            label="Nota para administración (opcional)"
            fullWidth
            multiline
            minRows={2}
            margin="normal"
            size="small"
            sx={inputSx}
            value={registroPagoData.nota}
            onChange={(event) => setRegistroPagoData((prev) => ({ ...prev, nota: event.target.value.slice(0, 500) }))}
            helperText="Usa este campo para justificar pagos cargados tarde en sistema."
          />

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
            <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
              Haz clic para adjuntar comprobante
            </Typography>
            <Typography variant="caption" sx={{ color: '#94a3b8' }}>
              PNG, JPG o PDF hasta 5MB
            </Typography>
            <input
              type="file"
              hidden
              accept="image/*,application/pdf"
              onChange={(event) => {
                const file = event.target.files?.[0] || null;
                setRegistroPagoData((prev) => ({ ...prev, comprobante: file }));
              }}
            />
          </Box>

          {registroPagoData.comprobante && (
            <Box
              sx={{
                mt: 1.5,
                px: 1.5,
                py: 1,
                borderRadius: 2,
                border: '1px solid #e2e8f0',
                backgroundColor: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                <InsertDriveFileIcon sx={{ color: '#fb923c', fontSize: 18 }} />
                <Typography
                  variant="body2"
                  sx={{
                    color: '#475569',
                    fontSize: 12,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {registroPagoData.comprobante.name}
                </Typography>
              </Box>
              <IconButton size="small" onClick={() => setRegistroPagoData((prev) => ({ ...prev, comprobante: null }))}>
                <CloseIcon sx={{ fontSize: 16, color: '#94a3b8' }} />
              </IconButton>
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3, pt: 1, justifyContent: 'flex-end', gap: 1.5 }}>
          <Button onClick={closeRegistrarPagoDialog} disabled={submittingRegistroPago} sx={{ color: '#475569', textTransform: 'none', fontWeight: 700 }}>
            Cancelar
          </Button>
          <Button
            onClick={handleRegistrarPago}
            variant="contained"
            disabled={submittingRegistroPago || !registroPagoFormValido}
            sx={{
              bgcolor: '#ff7a00',
              '&:hover': { bgcolor: '#f97316' },
              fontWeight: 800,
              borderRadius: 2,
              px: 3,
              textTransform: 'none'
            }}
          >
            {submittingRegistroPago ? 'Guardando...' : 'Registrar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={editSolicitudOpen}
        onClose={closeEditSolicitudDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
      >
        <DialogTitle sx={{ bgcolor: '#f3f5fb', color: '#0b2a57', fontWeight: 800, fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <EditOutlinedIcon sx={{ fontSize: 20, color: '#1e293b' }} />
            <Typography sx={{ fontWeight: 800, fontSize: 17, color: '#0b2a57' }}>
              {`Editar solicitud${pedidoSeleccionado?.alumno ? ` - ${pedidoSeleccionado.alumno.nombres || ''} ${pedidoSeleccionado.alumno.apellidos || ''}`.trim() : ''}`}
            </Typography>
          </Box>
          <IconButton size="small" onClick={closeEditSolicitudDialog} disabled={submittingEditSolicitud} sx={{ color: '#6b7280' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ bgcolor: '#f3f5fb', pt: 2.5, pb: 2.5 }}>
          <Paper
            elevation={0}
            sx={{
              borderRadius: 2.5,
              border: '1px solid #e7eaf2',
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
              p: 2
            }}
          >
            <Box sx={{ display: 'grid', gap: 1.5 }}>
              <TextField
                select
                label="Prenda"
                value={editSolicitudData.uniformeId}
                onChange={(event) => {
                  const uniformeId = event.target.value;
                  const uniforme = uniformesCatalogo.find((item) => String(item?._id) === String(uniformeId));
                  const requiereNumero = uniforme?.lleva_numero_franela !== false;
                  const muestraNombre = Boolean(uniforme?.lleva_nombre_atleta);
                  const usaSelectorRepresentante = Boolean(uniforme?.franela_representante) && muestraNombre && !Boolean(uniforme?.lleva_personalizacion_nombre);
                  setEditSolicitudData((prev) => ({
                    ...prev,
                    uniformeId,
                    precio: uniforme ? String(uniforme.precio ?? '') : prev.precio,
                    moneda: uniforme ? normalizarMoneda(uniforme.moneda) : prev.moneda,
                    metodoCobranza: uniforme ? normalizarMetodoCobranza(uniforme.metodo_cobranza) : prev.metodoCobranza,
                    numeroFranela: requiereNumero ? prev.numeroFranela : '',
                    nombrePersonalizado: muestraNombre
                      ? (usaSelectorRepresentante
                        ? resolverNombreRepresentante(prev.nombrePersonalizado)
                        : prev.nombrePersonalizado)
                      : ''
                  }));
                }}
                disabled={submittingEditSolicitud}
              >
                {uniformesCatalogo.map((item) => (
                  <MenuItem key={item._id} value={item._id}>
                    {item.prenda}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                select
                label="Talla"
                value={editSolicitudData.talla}
                onChange={(event) => setEditSolicitudData((prev) => ({ ...prev, talla: event.target.value }))}
                disabled={submittingEditSolicitud}
              >
                {TALLAS.map((talla) => (
                  <MenuItem key={talla} value={talla}>{talla}</MenuItem>
                ))}
              </TextField>

              {muestraCampoNombreEdicion && (
                usaSelectorNombreRepresentanteEdicion ? (
                  <TextField
                    select
                    label="Nombre en franela"
                    value={editSolicitudData.nombrePersonalizado}
                    onChange={(event) => setEditSolicitudData((prev) => ({ ...prev, nombrePersonalizado: event.target.value }))}
                    disabled={submittingEditSolicitud}
                    helperText="Selecciona uno de los nombres permitidos para franela de representante"
                  >
                    <MenuItem value="">Seleccione</MenuItem>
                    {OPCIONES_NOMBRE_REPRESENTANTE.map((opcion) => (
                      <MenuItem key={opcion} value={opcion}>{opcion}</MenuItem>
                    ))}
                  </TextField>
                ) : (
                  <TextField
                    label="Nombre deportivo"
                    value={editSolicitudData.nombrePersonalizado}
                    onChange={(event) => setEditSolicitudData((prev) => ({ ...prev, nombrePersonalizado: event.target.value }))}
                    disabled={submittingEditSolicitud || !permitePersonalizacionNombreEdicion}
                    helperText={permitePersonalizacionNombreEdicion
                      ? 'Puedes editar el nombre que se imprimirá en la prenda'
                      : 'Esta prenda no permite personalizar el nombre'}
                  />
                )
              )}

              {requiereNumeroFranelaEdicion && (
                <TextField
                  label="Numero de franela"
                  value={editSolicitudData.numeroFranela}
                  onChange={(event) => setEditSolicitudData((prev) => ({ ...prev, numeroFranela: event.target.value }))}
                  disabled={submittingEditSolicitud}
                />
              )}

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 140px' }, gap: 1.5 }}>
                <TextField
                  label="Precio"
                  type="number"
                  value={editSolicitudData.precio}
                  onChange={(event) => setEditSolicitudData((prev) => ({ ...prev, precio: event.target.value }))}
                  inputProps={{ min: 0, step: '0.01' }}
                  disabled={submittingEditSolicitud}
                />
                <TextField
                  select
                  label="Moneda"
                  value={editSolicitudData.moneda}
                  onChange={(event) => setEditSolicitudData((prev) => ({ ...prev, moneda: event.target.value }))}
                  disabled={submittingEditSolicitud}
                >
                  <MenuItem value="USD">USD</MenuItem>
                  <MenuItem value="EUR">EUR</MenuItem>
                </TextField>
              </Box>

              <TextField
                select
                label="Metodo de cobranza"
                value={editSolicitudData.metodoCobranza}
                onChange={(event) => setEditSolicitudData((prev) => ({ ...prev, metodoCobranza: event.target.value }))}
                disabled={submittingEditSolicitud}
                helperText="Este cambio solo afecta esta solicitud."
              >
                <MenuItem value="pago_completo">Pago completo</MenuItem>
                <MenuItem value="dos_partes_50">Dos partes (50/50)</MenuItem>
              </TextField>
            </Box>
          </Paper>
        </DialogContent>

        <DialogActions sx={{ bgcolor: '#f3f5fb', px: 3, pb: 2.5, pt: 0.5 }}>
          <Button onClick={closeEditSolicitudDialog} disabled={submittingEditSolicitud} sx={{ color: '#475569', textTransform: 'none', fontWeight: 700 }}>
            Cancelar
          </Button>
          <Button
            onClick={handleGuardarEdicionSolicitud}
            variant="contained"
            disabled={submittingEditSolicitud}
            sx={{ textTransform: 'none', fontWeight: 700, boxShadow: 'none', px: 2.2 }}
          >
            {submittingEditSolicitud ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={detallePagoOpen}
        onClose={closeDetallePagoDialog}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
      >
        <DialogTitle sx={{ bgcolor: '#f3f5fb', color: '#0b2a57', fontWeight: 800, fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 17, color: '#0b2a57' }}>
              Detalle del Pago -
            </Typography>
            <Typography sx={{ color: '#516b94', fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: { xs: 170, sm: 280 } }}>
              {pedidoSeleccionado?.alumno ? `${pedidoSeleccionado.alumno.nombres} ${pedidoSeleccionado.alumno.apellidos}` : '-'}
            </Typography>
          </Box>
          <IconButton size="small" onClick={closeDetallePagoDialog} sx={{ color: '#6b7280' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ bgcolor: '#f3f5fb', pt: 2.5, pb: 2.5 }}>
          {ultimoPagoDetalle ? (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <Box sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: '#dbeafe', color: '#0b2a57', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>✓</Box>
                <Typography sx={{ fontSize: { xs: 16, sm: 19 }, fontWeight: 900, color: '#0b2a57', lineHeight: 1.1 }}>Ultimo Pago Registrado</Typography>
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
                    <Typography sx={{ mt: 0.7, fontSize: { xs: 14, sm: 16 }, fontWeight: 800, color: '#0b2a57', lineHeight: 1.12 }}>{ultimoPagoDetalle?.metodo_pago || '-'}</Typography>
                  </Box>

                  <Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Monto pagado</Typography>
                    <Typography sx={{ mt: 0.7, fontSize: { xs: 17, sm: 20 }, fontWeight: 900, color: '#9a5a00', lineHeight: 1.1 }}>
                      {`Bs ${formatMoney(ultimoPagoDetalle?.monto_pagado_bs)} / ${formatMoneyWithCurrency(ultimoPagoDetalle?.monto_pagado, pedidoSeleccionado?.moneda)}`}
                    </Typography>
                  </Box>

                  <Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>
                      {usarSaldoRestanteComoEsperado ? 'Monto esperado (restante)' : 'Monto esperado'}
                    </Typography>
                    <Typography sx={{ mt: 0.7, fontSize: { xs: 15, sm: 17 }, fontWeight: 800, color: '#0b2a57', lineHeight: 1.12 }}>
                      {`Bs ${formatMoney(montoEsperadoBs)} / ${formatMoneyWithCurrency(montoEsperadoDivisa, pedidoSeleccionado?.moneda)}`}
                    </Typography>
                  </Box>

                  <Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Fecha de pago</Typography>
                    <Typography sx={{ mt: 0.7, fontSize: { xs: 15, sm: 17 }, fontWeight: 800, color: '#0b2a57', lineHeight: 1.12 }}>{formatFecha(ultimoPagoDetalle?.fecha_pago)}</Typography>
                  </Box>

                  <Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Tasa aplicada</Typography>
                    <Typography sx={{ mt: 0.7, fontSize: { xs: 15, sm: 17 }, fontWeight: 800, color: '#0b2a57', lineHeight: 1.12 }}>
                      {formatTasaAplicada(ultimoPagoDetalle?.monto_pagado_bs, ultimoPagoDetalle?.monto_pagado, pedidoSeleccionado?.moneda)}
                    </Typography>
                  </Box>

                  <Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Referencia</Typography>
                    <Box sx={{ mt: 0.7, display: 'flex', alignItems: 'center', gap: 0.4 }}>
                      <Typography sx={{ fontSize: { xs: 15, sm: 17 }, fontWeight: 800, color: '#4c6690', lineHeight: 1.12 }}>{ultimoPagoDetalle?.referencia || '-'}</Typography>
                      {ultimoPagoDetalle?.referencia && (
                        <IconButton size="small" onClick={() => copiarReferencia(ultimoPagoDetalle.referencia)} sx={{ color: '#95a2b6' }}>
                          <ContentCopyIcon fontSize="inherit" />
                        </IconButton>
                      )}
                    </Box>
                  </Box>

                  <Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Telefono de pago</Typography>
                    <Typography sx={{ mt: 0.7, fontSize: { xs: 14, sm: 16 }, fontWeight: 700, color: '#0b2a57', lineHeight: 1.2 }}>
                      {getTelefonoPagoDesdeRegistro(ultimoPagoDetalle) || '-'}
                    </Typography>
                  </Box>

                  <Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Cedula de pago</Typography>
                    <Typography sx={{ mt: 0.7, fontSize: { xs: 14, sm: 16 }, fontWeight: 700, color: '#0b2a57', lineHeight: 1.2 }}>
                      {getCedulaPagoDesdeRegistro(ultimoPagoDetalle) || '-'}
                    </Typography>
                  </Box>

                  <Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Nota</Typography>
                    <Typography sx={{ mt: 0.7, fontSize: { xs: 14, sm: 16 }, fontWeight: 700, color: '#0b2a57', lineHeight: 1.25, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {getNotaPagoDesdeRegistro(ultimoPagoDetalle) || '-'}
                    </Typography>
                  </Box>

                  <Box>
                    <Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Comprobante</Typography>
                    {ultimoPagoDetalle?.comprobante_url ? (
                      <Button
                        variant="text"
                        onClick={() => handleVerComprobante(ultimoPagoDetalle.comprobante_url)}
                        sx={{ mt: 0.35, px: 0, color: '#ff8a00', fontWeight: 900, textTransform: 'none', fontSize: { xs: 14, sm: 16 } }}
                      >
                        Ver Archivo Digital
                      </Button>
                    ) : (
                      <Typography sx={{ mt: 0.7, color: '#9ca3af', fontWeight: 700 }}>Sin comprobante</Typography>
                    )}
                  </Box>
                </Box>
              </Box>
            </>
          ) : (
            <Typography sx={{ color: '#334155' }}>No hay informacion de pago registrada.</Typography>
          )}

          {historialPagosAnteriores.length > 0 && (
            <Box sx={{ mt: 3.25 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.25 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <HistoryRoundedIcon sx={{ color: '#8ea0bc', fontSize: 19 }} />
                  <Typography sx={{ fontSize: { xs: 16, sm: 19 }, fontWeight: 900, color: '#0b2a57', lineHeight: 1.15 }}>
                    Historial de pagos
                  </Typography>
                </Box>
                <Chip label={`${historialPagosAnteriores.length} total`} size="small" sx={{ bgcolor: '#d9e4f7', color: '#4b6ca7', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }} />
              </Box>

              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {historialPagosAnteriores.map((pago, idx) => (
                  <Box
                    key={`${pago?._id || pago?.fecha_pago || 'pago'}-${idx}`}
                    sx={{
                      bgcolor: '#ffffff',
                      border: '1px solid #e8ebf2',
                      borderRadius: 2,
                      borderLeft: '4px solid #c9daf6',
                      px: 1.7,
                      py: 1.2,
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr 1fr 1fr auto' },
                      alignItems: 'center',
                      gap: 1.3
                    }}
                  >
                    <Box>
                      <Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Pago #{idx + 1}</Typography>
                      <Typography sx={{ fontWeight: 800, color: '#0b2a57', mt: 0.25 }}>{pago?.metodo_pago || '-'}</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Monto</Typography>
                      <Typography sx={{ fontWeight: 900, color: '#0b2a57', mt: 0.25 }}>${formatMoney(pago?.monto_pagado)}</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Fecha</Typography>
                      <Typography sx={{ color: '#334155', mt: 0.25 }}>{formatFecha(pago?.fecha_pago)}</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Referencia</Typography>
                      <Typography sx={{ color: '#4c6690', fontWeight: 700, mt: 0.25 }}>{pago?.referencia || '-'}</Typography>
                      <Typography sx={{ color: '#334155', fontWeight: 700, mt: 0.25, fontSize: 12 }}>
                        Tel: {getTelefonoPagoDesdeRegistro(pago) || '-'}
                      </Typography>
                      <Typography sx={{ color: '#334155', fontWeight: 700, mt: 0.25, fontSize: 12 }}>
                        Ced: {getCedulaPagoDesdeRegistro(pago) || '-'}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 0.6, justifyContent: { xs: 'flex-start', md: 'flex-end' }, alignItems: 'center', height: '100%' }}>
                      {pago?.referencia && (
                        <IconButton size="small" onClick={() => copiarReferencia(pago.referencia)} sx={{ bgcolor: '#f3f4f6', '&:hover': { bgcolor: '#e9edf3' } }}>
                          <ContentCopyIcon fontSize="small" sx={{ color: '#4b5563' }} />
                        </IconButton>
                      )}
                      {pago?.comprobante_url && (
                        <Button
                          variant="text"
                          size="small"
                          onClick={() => handleVerComprobante(pago.comprobante_url)}
                          sx={{ color: '#ff8a00', fontWeight: 800, textTransform: 'none' }}
                        >
                          Ver comprobante
                        </Button>
                      )}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.25, bgcolor: '#f3f5fb', justifyContent: 'flex-end' }}>
          <Button onClick={closeDetallePagoDialog} variant="text" sx={{ color: '#516b94', fontWeight: 800 }} disabled={submittingVerificacion}>
            Volver
          </Button>
          {pedidoSeleccionado?.estado === 'pago_en_revision' && (
            <Button onClick={handleVerificarPago} variant="contained" disabled={submittingVerificacion}>
              {submittingVerificacion ? 'Procesando...' : 'Confirmar pago'}
            </Button>
          )}
        </DialogActions>
      </Dialog>

      <Dialog open={comprobanteDialogOpen} onClose={() => setComprobanteDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Comprobante</DialogTitle>
        <DialogContent>
          {comprobanteUrl ? (
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              {comprobanteTipo === 'pdf' ? (
                <iframe
                  src={comprobanteUrl}
                  title="Comprobante"
                  style={{ width: '100%', height: '70vh', border: 'none' }}
                />
              ) : (
                <img src={comprobanteUrl} alt="Comprobante" style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8 }} />
              )}
            </Box>
          ) : (
            <Typography>No hay comprobante disponible.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setComprobanteDialogOpen(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!confirmEntregarId} onClose={() => setConfirmEntregarId(null)}>
        <DialogTitle>Confirmar entrega</DialogTitle>
        <DialogContent>¿Deseas marcar este pedido como entregado?</DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmEntregarId(null)} disabled={entregandoId === confirmEntregarId}>Cancelar</Button>
          <Button
            onClick={() => handleEntregar(confirmEntregarId)}
            variant="contained"
            disabled={entregandoId === confirmEntregarId}
            startIcon={entregandoId === confirmEntregarId ? <CircularProgress size={14} sx={{ color: '#ffffff' }} /> : <CheckCircleOutlineIcon fontSize="small" />}
            sx={{
              bgcolor: '#2e7d32',
              textTransform: 'none',
              boxShadow: 'none',
              '&:hover': { bgcolor: '#1f6b24', boxShadow: 'none' },
              '&:disabled': { bgcolor: '#c8e6c9', color: '#2f5f32' }
            }}
          >
            {entregandoId === confirmEntregarId ? 'Procesando...' : 'Confirmar entrega'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!confirmHabilitarSegundaPartePedido}
        onClose={closeConfirmHabilitarSegundaParte}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: 'hidden',
            boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)'
          }
        }}
      >
        <DialogTitle sx={{ bgcolor: '#f3f5fb', color: '#0b2a57', fontWeight: 800, fontSize: 20, pb: 1.2 }}>
          Habilitar segunda parte
        </DialogTitle>
        <DialogContent sx={{ bgcolor: '#f3f5fb', pt: 1.5, pb: 2.2 }}>
          <Paper
            elevation={0}
            sx={{
              width: '100%',
              boxSizing: 'border-box',
              borderRadius: 2.5,
              border: '1px solid #e7eaf2',
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
              p: 1.8,
              backgroundColor: '#ffffff'
            }}
          >
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: '28px 1fr',
                alignItems: 'start',
                gap: 1,
                mb: 1.1
              }}
            >
              <Box
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  bgcolor: '#fff2e7',
                  color: '#f97316',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mt: 0.15
                }}
              >
                <LockOpenIcon sx={{ fontSize: 16 }} />
              </Box>
              <Typography sx={{ color: '#0f172a', fontWeight: 700, lineHeight: 1.3 }}>
                Se habilitara el cobro del monto restante para esta solicitud.
              </Typography>
            </Box>

            <Typography sx={{ color: '#64748b', fontSize: 14, mb: 1.35 }}>
              Desde este momento, el representante podra registrar el segundo pago del esquema 50/50.
            </Typography>

            <Box
              sx={{
                p: 1.15,
                borderRadius: 1.8,
                border: '1px solid #dbe4f0',
                bgcolor: '#f8fafc'
              }}
            >
              <Typography sx={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 800, mb: 0.35 }}>
                Solicitud
              </Typography>
              <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a', lineHeight: 1.24 }}>
                {confirmHabilitarSegundaPartePedido?.alumno
                  ? `${confirmHabilitarSegundaPartePedido.alumno.nombres || ''} ${confirmHabilitarSegundaPartePedido.alumno.apellidos || ''}`.trim()
                  : '-'}
                {' - '}
                {confirmHabilitarSegundaPartePedido?.prenda || '-'}
              </Typography>
            </Box>
          </Paper>
        </DialogContent>
        <DialogActions
          sx={{
            bgcolor: '#f3f5fb',
            px: 3,
            pb: 2.5,
            pt: 0.35,
            display: 'flex',
            gap: 1,
            alignItems: 'center'
          }}
        >
          <Button
            onClick={closeConfirmHabilitarSegundaParte}
            disabled={Boolean(habilitandoSegundaParteId)}
            sx={{
              flex: 1,
              color: '#475569',
              textTransform: 'none',
              fontWeight: 700,
              minHeight: 40,
              width: '100%',
              justifyContent: 'center'
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={confirmHabilitarSegundaParte}
            variant="contained"
            disabled={Boolean(habilitandoSegundaParteId)}
            sx={{
              flex: 1,
              bgcolor: '#2563eb',
              textTransform: 'none',
              fontWeight: 700,
              boxShadow: 'none',
              minHeight: 40,
              width: '100%',
              '&:hover': { bgcolor: '#1d4ed8', boxShadow: 'none' },
              '&:disabled': { bgcolor: '#93c5fd', color: '#eff6ff' },
              '& .MuiButton-startIcon': { mr: 0.75 }
            }}
          >
            {Boolean(habilitandoSegundaParteId) ? 'Procesando...' : 'Confirmar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!confirmEliminarId} onClose={() => setConfirmEliminarId(null)}>
        <DialogTitle>Confirmar eliminación</DialogTitle>
        <DialogContent>
          ¿Deseas eliminar esta solicitud de pedido? Esta acción no se puede deshacer.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmEliminarId(null)} disabled={eliminandoId === confirmEliminarId}>Cancelar</Button>
          <Button
            onClick={() => handleEliminarSolicitud(confirmEliminarId)}
            variant="contained"
            color="error"
            disabled={eliminandoId === confirmEliminarId}
            startIcon={eliminandoId === confirmEliminarId ? <CircularProgress size={14} sx={{ color: '#ffffff' }} /> : <DeleteOutlineIcon fontSize="small" />}
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              minWidth: 180,
              '& .MuiButton-startIcon': { mr: 0.75 }
            }}
          >
            {eliminandoId === confirmEliminarId ? 'Eliminando...' : 'Eliminar solicitud'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={confirmSolicitudPagoLoteOpen}
        onClose={() => {
          if (!submittingSolicitudPagoLote) setConfirmSolicitudPagoLoteOpen(false);
        }}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: 'hidden',
            boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)'
          }
        }}
      >
        <DialogTitle sx={{ bgcolor: '#f3f5fb', color: '#0b2a57', fontWeight: 800, fontSize: 20, pb: 1.2 }}>
          Solicitar pago por lote
        </DialogTitle>
        <DialogContent sx={{ bgcolor: '#f3f5fb', pt: 1.5, pb: 2.2 }}>
          <Paper
            elevation={0}
            sx={{
              width: '100%',
              boxSizing: 'border-box',
              borderRadius: 2.5,
              border: '1px solid #e7eaf2',
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
              p: 1.8,
              backgroundColor: '#ffffff'
            }}
          >
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: '28px 1fr',
                alignItems: 'start',
                gap: 1,
                mb: 1.1
              }}
            >
              <Box
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  bgcolor: '#e0ecff',
                  color: '#2563eb',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mt: 0.15
                }}
              >
                <RequestQuoteIcon sx={{ fontSize: 16 }} />
              </Box>
              <Typography sx={{ color: '#0f172a', fontWeight: 700, lineHeight: 1.3 }}>
                Se enviara la solicitud de pago para los pedidos pendientes seleccionados.
              </Typography>
            </Box>

            <Typography sx={{ color: '#64748b', fontSize: 14, mb: 1.35 }}>
              Los representantes veran el pedido en estado listo para registrar pago.
            </Typography>

            <Box
              sx={{
                p: 1.15,
                borderRadius: 1.8,
                border: '1px solid #dbe4f0',
                bgcolor: '#f8fafc'
              }}
            >
              <Typography sx={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 800, mb: 0.35 }}>
                Resumen
              </Typography>
              <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a', lineHeight: 1.24 }}>
                Pendientes seleccionadas: {pedidosPendientesSeleccionados.length}
              </Typography>
            </Box>
          </Paper>
        </DialogContent>
        <DialogActions
          sx={{
            bgcolor: '#f3f5fb',
            px: 3,
            pb: 2.5,
            pt: 0.35,
            display: 'flex',
            gap: 1,
            alignItems: 'center'
          }}
        >
          <Button
            onClick={() => setConfirmSolicitudPagoLoteOpen(false)}
            disabled={submittingSolicitudPagoLote}
            sx={{
              flex: 1,
              textTransform: 'none',
              fontWeight: 700,
              minHeight: 40,
              width: '100%',
              color: '#475569'
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSolicitarPagoPorLote}
            variant="contained"
            disabled={submittingSolicitudPagoLote || pedidosPendientesSeleccionados.length === 0}
            sx={{
              flex: 1,
              textTransform: 'none',
              fontWeight: 700,
              boxShadow: 'none',
              bgcolor: '#2563eb',
              minHeight: 40,
              width: '100%',
              '&:hover': { bgcolor: '#1d4ed8', boxShadow: 'none' },
              '&:disabled': { bgcolor: '#93c5fd', color: '#eff6ff' }
            }}
          >
            {submittingSolicitudPagoLote ? 'Procesando...' : 'Confirmar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={confirmHabilitarSegundoPagoLoteOpen}
        onClose={() => {
          if (!submittingHabilitarSegundoPagoLote) setConfirmHabilitarSegundoPagoLoteOpen(false);
        }}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: 'hidden',
            boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)'
          }
        }}
      >
        <DialogTitle sx={{ bgcolor: '#f3f5fb', color: '#0b2a57', fontWeight: 800, fontSize: 20, pb: 1.2 }}>
          Habilitar 2do pago por lote
        </DialogTitle>
        <DialogContent sx={{ bgcolor: '#f3f5fb', pt: 1.5, pb: 2.2 }}>
          <Paper
            elevation={0}
            sx={{
              width: '100%',
              boxSizing: 'border-box',
              borderRadius: 2.5,
              border: '1px solid #e7eaf2',
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
              p: 1.8,
              backgroundColor: '#ffffff'
            }}
          >
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: '28px 1fr',
                alignItems: 'start',
                gap: 1,
                mb: 1.1
              }}
            >
              <Box
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  bgcolor: '#fff2e7',
                  color: '#f97316',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mt: 0.15
                }}
              >
                <LockOpenIcon sx={{ fontSize: 16 }} />
              </Box>
              <Typography sx={{ color: '#0f172a', fontWeight: 700, lineHeight: 1.3 }}>
                Se habilitara el segundo pago para las solicitudes elegibles seleccionadas.
              </Typography>
            </Box>

            <Typography sx={{ color: '#64748b', fontSize: 14, mb: 1.35 }}>
              Esta accion desbloquea el pago restante en los pedidos 50/50 que ya cumplieron primera parte.
            </Typography>

            <Box
              sx={{
                p: 1.15,
                borderRadius: 1.8,
                border: '1px solid #dbe4f0',
                bgcolor: '#f8fafc'
              }}
            >
              <Typography sx={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 800, mb: 0.35 }}>
                Resumen
              </Typography>
              <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: '#0f172a', lineHeight: 1.24 }}>
                Elegibles: {pedidosSegundaParteElegiblesSeleccionados.length} de {pedidosFiltradosSeleccionados.length} seleccionadas
              </Typography>
              {pedidosFiltradosSeleccionados.length > pedidosSegundaParteElegiblesSeleccionados.length && (
                <Typography sx={{ mt: 0.5, color: '#64748b', fontSize: 12.5 }}>
                  {pedidosFiltradosSeleccionados.length - pedidosSegundaParteElegiblesSeleccionados.length} solicitud(es) no elegibles se omitiran automaticamente.
                </Typography>
              )}
            </Box>
          </Paper>
        </DialogContent>
        <DialogActions
          sx={{
            bgcolor: '#f3f5fb',
            px: 3,
            pb: 2.5,
            pt: 0.35,
            display: 'flex',
            gap: 1,
            alignItems: 'center'
          }}
        >
          <Button
            onClick={() => setConfirmHabilitarSegundoPagoLoteOpen(false)}
            disabled={submittingHabilitarSegundoPagoLote}
            sx={{
              flex: 1,
              textTransform: 'none',
              fontWeight: 700,
              minHeight: 40,
              width: '100%',
              color: '#475569'
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleHabilitarSegundoPagoPorLote}
            variant="contained"
            disabled={submittingHabilitarSegundoPagoLote || pedidosSegundaParteElegiblesSeleccionados.length === 0}
            sx={{
              flex: 1,
              textTransform: 'none',
              fontWeight: 700,
              boxShadow: 'none',
              bgcolor: '#2563eb',
              minHeight: 40,
              width: '100%',
              '&:hover': { bgcolor: '#1d4ed8', boxShadow: 'none' },
              '&:disabled': { bgcolor: '#93c5fd', color: '#eff6ff' }
            }}
          >
            {submittingHabilitarSegundoPagoLote ? 'Procesando...' : 'Confirmar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={confirmEliminarLoteOpen}
        onClose={() => {
          if (!submittingEliminarLote) setConfirmEliminarLoteOpen(false);
        }}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: 'hidden',
            boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)'
          }
        }}
      >
        <DialogTitle sx={{ bgcolor: '#f3f5fb', color: '#0b2a57', fontWeight: 800, fontSize: 20, pb: 1.2 }}>
          Eliminar por lote
        </DialogTitle>
        <DialogContent sx={{ bgcolor: '#f3f5fb', pt: 1.5, pb: 2.2 }}>
          <Paper
            elevation={0}
            sx={{
              width: '100%',
              boxSizing: 'border-box',
              borderRadius: 2.5,
              border: '1px solid #fee2e2',
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
              p: 1.8,
              backgroundColor: '#ffffff'
            }}
          >
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: '28px 1fr',
                alignItems: 'start',
                gap: 1,
                mb: 1.1
              }}
            >
              <Box
                sx={{
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  bgcolor: '#fee2e2',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mt: 0.15
                }}
              >
                <DeleteOutlineIcon sx={{ fontSize: 16 }} />
              </Box>
              <Typography sx={{ color: '#0f172a', fontWeight: 700, lineHeight: 1.3 }}>
                Se eliminaran las solicitudes seleccionadas del listado actual.
              </Typography>
            </Box>

            <Typography sx={{ color: '#64748b', fontSize: 14, mb: 1.35 }}>
              Esta accion no se puede deshacer.
            </Typography>

            <Box
              sx={{
                p: 1.15,
                borderRadius: 1.8,
                border: '1px solid #fecaca',
                bgcolor: '#fef2f2'
              }}
            >
              <Typography sx={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#b91c1c', fontWeight: 800, mb: 0.35 }}>
                Resumen
              </Typography>
              <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: '#7f1d1d', lineHeight: 1.24 }}>
                Solicitudes a eliminar: {pedidosFiltradosSeleccionados.length}
              </Typography>
            </Box>
          </Paper>
        </DialogContent>
        <DialogActions
          sx={{
            bgcolor: '#f3f5fb',
            px: 3,
            pb: 2.5,
            pt: 0.35,
            display: 'flex',
            gap: 1,
            alignItems: 'center'
          }}
        >
          <Button
            onClick={() => setConfirmEliminarLoteOpen(false)}
            disabled={submittingEliminarLote}
            sx={{
              flex: 1,
              textTransform: 'none',
              fontWeight: 700,
              minHeight: 40,
              width: '100%',
              color: '#475569'
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleEliminarSolicitudesLote}
            variant="contained"
            disabled={submittingEliminarLote || pedidosFiltradosSeleccionados.length === 0}
            sx={{
              flex: 1,
              textTransform: 'none',
              fontWeight: 700,
              boxShadow: 'none',
              bgcolor: '#dc2626',
              minHeight: 40,
              width: '100%',
              '&:hover': { bgcolor: '#b91c1c', boxShadow: 'none' },
              '&:disabled': { bgcolor: '#fca5a5', color: '#fff1f2' }
            }}
          >
            {submittingEliminarLote ? 'Eliminando...' : 'Confirmar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default ListadoSolicitudesUniformes;
