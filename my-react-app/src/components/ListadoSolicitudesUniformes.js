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
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import VisibilityIcon from '@mui/icons-material/Visibility';
import LocalShippingIcon from '@mui/icons-material/LocalShipping';
import DownloadIcon from '@mui/icons-material/Download';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { mediaUrl } from '../utils/mediaUrl';
import { useSede } from '../context/SedeContext';
import { exportToExcel } from '../utils/exportExcel';

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

const ESTADOS_SOLICITUD_ACTIVA = new Set([
  'pendiente',
  'esperando_pago',
  'abono',
  'pago_en_revision'
]);

const ALL_PRENDAS_VALUE = '__all__';
const ALL_CATEGORIAS_VALUE = '__all__';

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
    moneda: 'USD'
  });
  const [detallePagoOpen, setDetallePagoOpen] = useState(false);
  const [submittingVerificacion, setSubmittingVerificacion] = useState(false);
  const [confirmEntregarId, setConfirmEntregarId] = useState(null);
  const [entregandoId, setEntregandoId] = useState(null);
  const [confirmEliminarId, setConfirmEliminarId] = useState(null);
  const [eliminandoId, setEliminandoId] = useState(null);
  const [comprobanteDialogOpen, setComprobanteDialogOpen] = useState(false);
  const [comprobanteUrl, setComprobanteUrl] = useState('');
  const [comprobanteTipo, setComprobanteTipo] = useState('imagen');
  const [filtroMes, setFiltroMes] = useState(() => (new Date().getMonth() + 1).toString());
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroPrenda, setFiltroPrenda] = useState([]);
  const [filtroCategoria, setFiltroCategoria] = useState([]);
  const [filtroSexo, setFiltroSexo] = useState('todos');
  const [pagina, setPagina] = useState(0);
  const [filasPorPagina, setFilasPorPagina] = useState(10);
  const [selectedPedidoIds, setSelectedPedidoIds] = useState([]);
  const [submittingSolicitudPagoLote, setSubmittingSolicitudPagoLote] = useState(false);
  const [confirmSolicitudPagoLoteOpen, setConfirmSolicitudPagoLoteOpen] = useState(false);
  const [submittingEliminarLote, setSubmittingEliminarLote] = useState(false);
  const [confirmEliminarLoteOpen, setConfirmEliminarLoteOpen] = useState(false);

  const token = localStorage.getItem('token');
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { sedeSeleccionada } = useSede();

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

    return mesOk && estadoOk && prendaOk && categoriaOk && sexoOk;
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

  const uniformeSeleccionadoEdicion = uniformesCatalogo.find((item) => String(item?._id) === String(editSolicitudData.uniformeId));
  const requiereNumeroFranelaEdicion = uniformeSeleccionadoEdicion?.lleva_numero_franela !== false;
  const muestraCampoNombreEdicion = Boolean(uniformeSeleccionadoEdicion?.lleva_nombre_atleta) || Boolean(uniformeSeleccionadoEdicion?.franela_representante);
  const permitePersonalizacionNombreEdicion = Boolean(uniformeSeleccionadoEdicion?.lleva_personalizacion_nombre);
  const usaSelectorNombreRepresentanteEdicion = Boolean(uniformeSeleccionadoEdicion?.franela_representante) && !permitePersonalizacionNombreEdicion;

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
    const muestraNombre = Boolean(uniformeCatalogo?.lleva_nombre_atleta) || Boolean(uniformeCatalogo?.franela_representante);
    const usaSelectorRepresentante = Boolean(uniformeCatalogo?.franela_representante) && !Boolean(uniformeCatalogo?.lleva_personalizacion_nombre);
    const nombreActual = String(pedido?.nombre_personalizado || '');
    const nombreNormalizado = usaSelectorRepresentante && !OPCIONES_NOMBRE_REPRESENTANTE.includes(nombreActual)
      ? ''
      : nombreActual;

    setPedidoSeleccionado(pedido);
    setEditSolicitudData({
      uniformeId,
      talla: String(pedido?.talla || ''),
      nombrePersonalizado: muestraNombre ? nombreNormalizado : '',
      numeroFranela: requiereNumero ? String(pedido?.numero_franela || '') : '',
      precio: String(pedido?.precio ?? uniformeCatalogo?.precio ?? ''),
      moneda: normalizarMoneda(pedido?.moneda || uniformeCatalogo?.moneda || 'USD')
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
      moneda: 'USD'
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
          moneda: normalizarMoneda(editSolicitudData.moneda)
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

  const openDetallePagoDialog = (pedido) => {
    setPedidoSeleccionado(pedido);
    setDetallePagoOpen(true);
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
    if (pedido.estado === 'pendiente') {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, justifyContent: mobile ? 'flex-start' : 'center' }}>
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

    if (pedido.estado === 'esperando_pago' || pedido.estado === 'cancelado') {
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

    if (pedido.estado === 'pago_en_revision' || pedido.estado === 'abono') {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, justifyContent: mobile ? 'flex-start' : 'center' }}>
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

    return <Typography variant="body2" color="text.secondary">Sin acciones</Typography>;
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

      <Box sx={{ mb: 1.5 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, fontSize: { xs: 24, md: 30 }, color: '#0f172a' }}>
          Pedidos de Uniformes
        </Typography>
        <Typography variant="body2" sx={{ color: '#64748b', mt: 0.4 }}>
          Lista de solicitudes realizadas por los alumnos. Solicita pagos, verifica comprobantes y marca prendas como entregadas.
        </Typography>
      </Box>

      <Paper
        elevation={0}
        sx={{
          border: '1px solid #e2e8f0',
          borderRadius: 2.5,
          p: 1.75,
          mb: 1.5,
          backgroundColor: '#ffffff',
          boxShadow: '0 8px 18px rgba(15, 23, 42, 0.04)'
        }}
      >
        <Box
          sx={{
            display: 'flex',
            gap: 1,
            flexWrap: { xs: 'wrap', xl: 'nowrap' },
            alignItems: { xs: 'stretch', xl: 'center' },
            justifyContent: 'space-between',
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
                '& .MuiOutlinedInput-root': { height: 40, borderRadius: 2, backgroundColor: '#f8fafc' }
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
                '& .MuiOutlinedInput-root': { height: 40, borderRadius: 2, backgroundColor: '#f8fafc' }
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
                '& .MuiOutlinedInput-root': { height: 40, borderRadius: 2, backgroundColor: '#f8fafc' }
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
                '& .MuiOutlinedInput-root': { height: 40, borderRadius: 2, backgroundColor: '#f8fafc' }
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
                '& .MuiOutlinedInput-root': { height: 40, borderRadius: 2, backgroundColor: '#f8fafc' }
              }}
            >
              <MenuItem value="todos">Todos</MenuItem>
              {opcionesSexo.map((sexo) => (
                <MenuItem key={sexo.value} value={sexo.value}>{sexo.label}</MenuItem>
              ))}
            </TextField>
          </Box>

          <Box
            sx={{
              display: { xs: 'grid', sm: 'flex' },
              gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))' },
              gap: 1,
              flexWrap: 'wrap',
              justifyContent: { xs: 'flex-start', xl: 'flex-end' },
              ml: { xl: 'auto' },
              width: { xs: '100%', xl: 'auto' }
            }}
          >
            <Button
              variant="outlined"
              startIcon={<RequestQuoteIcon />}
              disabled={pedidosPendientesSeleccionados.length === 0 || submittingSolicitudPagoLote}
              onClick={() => setConfirmSolicitudPagoLoteOpen(true)}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                borderRadius: 2,
                minHeight: 40,
                px: 1.5,
                whiteSpace: 'nowrap',
                width: { xs: '100%', sm: 'auto' }
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
                minHeight: 40,
                px: 1.5,
                whiteSpace: 'nowrap',
                width: { xs: '100%', sm: 'auto' }
              }}
            >
              {submittingEliminarLote
                ? 'Eliminando...'
                : `Eliminar (${pedidosFiltradosSeleccionados.length})`}
            </Button>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={exportPedidosExcel}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                borderRadius: 2,
                minHeight: 40,
                px: 1.5,
                whiteSpace: 'nowrap',
                width: { xs: '100%', sm: 'auto' },
                gridColumn: { xs: '1 / -1', sm: 'auto' }
              }}
            >
              Exportar Excel
            </Button>
          </Box>
        </Box>
      </Paper>

      <Box sx={{ mb: 1.1 }}>
        <Button
          variant="text"
          onClick={handleToggleSeleccionGlobalFiltrados}
          disabled={pedidosFiltradosIds.length === 0 || submittingSolicitudPagoLote || submittingEliminarLote}
          sx={{
            textTransform: 'none',
            fontWeight: 600,
            color: '#475569',
            minHeight: 34,
            px: 0.5,
            justifyContent: 'flex-start',
            '&:hover': { backgroundColor: '#f1f5f9' }
          }}
        >
          {todosFiltradosSeleccionadosGlobal
            ? 'Limpiar selección global'
            : `Seleccionar todos los resultados (${pedidosFiltradosIds.length})`}
        </Button>
      </Box>

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
                  {formatMoneyWithCurrency(pedidoSeleccionado?.precio, pedidoSeleccionado?.moneda)}
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
                  const muestraNombre = Boolean(uniforme?.lleva_nombre_atleta) || Boolean(uniforme?.franela_representante);
                  const usaSelectorRepresentante = Boolean(uniforme?.franela_representante) && !Boolean(uniforme?.lleva_personalizacion_nombre);
                  setEditSolicitudData((prev) => ({
                    ...prev,
                    uniformeId,
                    precio: uniforme ? String(uniforme.precio ?? '') : prev.precio,
                    moneda: uniforme ? normalizarMoneda(uniforme.moneda) : prev.moneda,
                    numeroFranela: requiereNumero ? prev.numeroFranela : '',
                    nombrePersonalizado: muestraNombre
                      ? (usaSelectorRepresentante
                        ? (OPCIONES_NOMBRE_REPRESENTANTE.includes(prev.nombrePersonalizado) ? prev.nombrePersonalizado : '')
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
      >
        <DialogTitle>Confirmar solicitud por lote</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1 }}>
            Se enviará solicitud de pago para <b>{pedidosPendientesSeleccionados.length}</b> pedido(s) pendiente(s) seleccionados.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmSolicitudPagoLoteOpen(false)}
            disabled={submittingSolicitudPagoLote}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              color: '#64748b',
              '&:hover': {
                backgroundColor: '#f1f5f9'
              }
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSolicitarPagoPorLote}
            variant="contained"
            disabled={submittingSolicitudPagoLote || pedidosPendientesSeleccionados.length === 0}
            startIcon={submittingSolicitudPagoLote ? <CircularProgress size={14} sx={{ color: '#ffffff' }} /> : <RequestQuoteIcon fontSize="small" />}
            sx={{
              textTransform: 'none',
              boxShadow: 'none',
              bgcolor: '#0B0F2A',
              color: '#ffffff',
              '&:hover': {
                bgcolor: '#141A3A',
                boxShadow: 'none'
              },
              '&:disabled': {
                bgcolor: '#94a3b8',
                color: '#ffffff'
              }
            }}
          >
            {submittingSolicitudPagoLote ? 'Procesando...' : 'Confirmar solicitud'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={confirmEliminarLoteOpen}
        onClose={() => {
          if (!submittingEliminarLote) setConfirmEliminarLoteOpen(false);
        }}
      >
        <DialogTitle>Confirmar eliminación por lote</DialogTitle>
        <DialogContent>
          Se intentará eliminar <b>{pedidosFiltradosSeleccionados.length}</b> solicitud(es) seleccionada(s) del filtro actual.
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmEliminarLoteOpen(false)}
            disabled={submittingEliminarLote}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleEliminarSolicitudesLote}
            variant="contained"
            color="error"
            disabled={submittingEliminarLote || pedidosFiltradosSeleccionados.length === 0}
            startIcon={submittingEliminarLote ? <CircularProgress size={14} sx={{ color: '#ffffff' }} /> : <DeleteOutlineIcon fontSize="small" />}
            sx={{
              textTransform: 'none',
              fontWeight: 700,
              minWidth: 180,
              '& .MuiButton-startIcon': { mr: 0.75 }
            }}
          >
            {submittingEliminarLote ? 'Eliminando...' : 'Eliminar seleccionadas'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default ListadoSolicitudesUniformes;
