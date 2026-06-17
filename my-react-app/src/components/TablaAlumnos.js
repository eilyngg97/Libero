import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSede } from '../context/SedeContext';
import Snackbar from '@mui/material/Snackbar';
import MuiAlert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Typography, IconButton, TablePagination, TextField, InputAdornment, Tooltip, Avatar, Box, MenuItem, Select, FormControl, InputLabel, Checkbox } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DownloadIcon from '@mui/icons-material/Download';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import ReplayIcon from '@mui/icons-material/Replay';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import TableChartIcon from '@mui/icons-material/TableChart';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { exportToExcel } from '../utils/exportExcel';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import { mediaUrl } from '../utils/mediaUrl';
import { CATEGORIAS_DISPONIBLES } from '../utils/categoria';

function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return '';
  const hoy = new Date();
  const nacimiento = new Date(fechaNacimiento);
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const m = hoy.getMonth() - nacimiento.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) {
    edad--;
  }
  return edad;
}

function obtenerTipoMensualidad(alumno) {
  const tipo = alumno?.tipo_mensualidad || alumno?.tipoMensualidad;
  if (!tipo) return '-';

  const etiquetas = {
    monto_sede: 'Monto sede',
    monto_personalizado: 'Monto personalizado',
    beca_completa: 'Beca completa'
  };

  return etiquetas[tipo] || tipo.replace(/_/g, ' ');
}

function obtenerTipoMensualidadKey(alumno) {
  return String(alumno?.tipo_mensualidad || alumno?.tipoMensualidad || 'monto_sede').toLowerCase();
}

function obtenerEstadoAlumno(alumno) {
  if (alumno?.dado_de_baja || alumno?.activo === false) return 'Baja';
  return alumno?.estado || 'Activo';
}

function esAlumnoActivo(alumno) {
  return !(alumno?.dado_de_baja || alumno?.activo === false);
}

function obtenerSexoAlumno(alumno) {
  const raw = String(alumno?.sexo || '').trim().toLowerCase();
  if (raw === 'femenino') return 'Femenino';
  if (raw === 'masculino') return 'Masculino';
  return '-';
}

function obtenerNombreCompletoAlumno(alumno) {
  const nombres = String(alumno?.nombres || '').trim();
  const apellidos = String(alumno?.apellidos || '').trim();
  return `${nombres} ${apellidos}`.trim();
}

const METODOS_PAGO = ['Pago movil', 'Transferencia', 'Efectivo'];
const PREVIEW_PAGE_SIZE = 20;

function normalizeMetodoPago(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'pago movil' || raw === 'pago móvil') return 'Pago movil';
  if (raw === 'transferencia') return 'Transferencia';
  if (raw === 'efectivo') return 'Efectivo';
  return String(value || '').trim();
}

function metodoRequiereReferencia(metodo) {
  const key = String(metodo || '').toLowerCase();
  return key === 'pago movil' || key === 'transferencia';
}

function parseFechaLocal(fecha) {
  if (!fecha) return null;
  const raw = String(fecha).trim();
  const matchIso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (matchIso) {
    return new Date(Number(matchIso[1]), Number(matchIso[2]) - 1, Number(matchIso[3]));
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function TablaAlumnos() {
  // Estados para filtros
  const [filtroNombreApellido, setFiltroNombreApellido] = useState('');
  const [filtroFechaNacimientoDesde, setFiltroFechaNacimientoDesde] = useState('');
  const [filtroFechaNacimientoHasta, setFiltroFechaNacimientoHasta] = useState('');
  const [filtroSexo, setFiltroSexo] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState([]);
  const [filtroTipoMensualidad, setFiltroTipoMensualidad] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroPagoCuotas, setFiltroPagoCuotas] = useState('');
  const [mostrarFiltrosMobile, setMostrarFiltrosMobile] = useState(false);
    // Formatear fecha a DD/MM/YYYY (corrige desfase por zona horaria)
    const formatFecha = (fecha) => {
      if (!fecha) return '';
      const d = new Date(fecha);
      // Ajustar para evitar desfase por zona horaria UTC
      const local = new Date(d.getTime() + Math.abs(d.getTimezoneOffset() * 60000));
      const dia = String(local.getDate()).padStart(2, '0');
      const mes = String(local.getMonth() + 1).padStart(2, '0');
      const anio = local.getFullYear();
      return `${dia}/${mes}/${anio}`;
    };
  const { sedeSeleccionada } = useSede();
  const navigate = useNavigate();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const rolActual = String(localStorage.getItem('rol') || '').trim().toLowerCase();
  const esSuperAdmin = rolActual === 'super_admin';
  const tieneSedeEspecifica = Boolean(sedeSeleccionada?._id);
  const [alumnos, setAlumnos] = useState([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState({ open: false, message: '' });
  const [bajaId, setBajaId] = useState(null);
  const [motivoBaja, setMotivoBaja] = useState('');
  const [bajaLoading, setBajaLoading] = useState(false);
  const [bajaSuccess, setBajaSuccess] = useState({ open: false, message: '' });
  const [reactivarId, setReactivarId] = useState(null);
  const [reactivarLoading, setReactivarLoading] = useState(false);
  const [reactivarSuccess, setReactivarSuccess] = useState({ open: false, message: '' });
  const [reactivarError, setReactivarError] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importSuccess, setImportSuccess] = useState({ open: false, message: '' });
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importPreviewData, setImportPreviewData] = useState(null);
  const [importPreviewLoading, setImportPreviewLoading] = useState(false);
  const [importPendingFile, setImportPendingFile] = useState(null);
  const [previewCreatePage, setPreviewCreatePage] = useState(0);
  const [previewSkipPage, setPreviewSkipPage] = useState(0);
  const [previewErrorPage, setPreviewErrorPage] = useState(0);
  const importInputRef = useRef(null);
  const [reactivarForm, setReactivarForm] = useState({
    montoReingreso: '',
    montoMensualidad: '',
    montoPagado: '',
    fechaPago: new Date().toISOString().slice(0, 10),
    metodoPago: METODOS_PAGO[0],
    referencia: '',
    comentario: '',
    comprobante: null
  });
  const modalInputSx = {
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
  const alumnoReactivar = alumnos.find((item) => item._id === reactivarId) || null;
  const totalReingresoUsd = Number((
    (Number(reactivarForm.montoReingreso) || 0) +
    (Number(reactivarForm.montoMensualidad) || 0)
  ).toFixed(2));
  const montoPagadoReingresoUsd = Number(reactivarForm.montoPagado) || 0;
  const saldoReingresoUsd = Number((Math.max(0, totalReingresoUsd - montoPagadoReingresoUsd)).toFixed(2));
  // Función para descargar CSV
  const handleDownloadExcel = () => {
    const alumnosActivos = alumnosFiltrados.filter(a => !(a.dado_de_baja || a.activo === false || a.estado === 'Baja'));
    const data = alumnosActivos.map(a => ({
      Nombre: a.nombres,
      Apellido: a.apellidos,
      Cedula: a.cedula,
      Categoria: a.categoria || '-',
      Division: a.division || '-',
      Nro_Franela: (a.numero_franela ?? '-') || '-',
      Sexo: obtenerSexoAlumno(a),
      Fecha_Nacimiento: formatFecha(a.fecha_nacimiento),
      Edad: calcularEdad(a.fecha_nacimiento),
      Representante: a.representante ? `${a.representante.nombres} ${a.representante.apellidos}` : ('-'),
      Telefono: a.representante && a.representante.telefono ? `${a.representante.telefono}` : ('-'),
    }));
    const headers = ['Nombre', 'Apellido', 'Cedula', 'Categoria', 'Division', 'Nro_Franela', 'Sexo', 'Fecha_Nacimiento', 'Edad', 'Representante', 'Telefono'];
    exportToExcel(
      data,
      `alumnos${sedeSeleccionada && sedeSeleccionada.nombre ? '_' + sedeSeleccionada.nombre.replace(/\s+/g, '_') : ''}.xlsx`,
      headers
    );
  };

  // Función para descargar PDF
  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    const columns = ["N°", "Alumno", "Cedula", "Categoria", "#", "Sexo", "Fecha de Nacimiento", "Edad", "Representante", "Telefono"];
    const rows = alumnosFiltrados.map((a, i) => [
      i + 1,
      obtenerNombreCompletoAlumno(a),
      a.cedula,
      a.categoria || '-',
      (a.numero_franela ?? '-') || '-',
      (() => {
        const sexo = obtenerSexoAlumno(a);
        if (sexo === 'Femenino') return 'F';
        if (sexo === 'Masculino') return 'M';
        return sexo || '-';
      })(),
      formatFecha(a.fecha_nacimiento),
      calcularEdad(a.fecha_nacimiento),
      a.representante ? `${a.representante.nombres} ${a.representante.apellidos}` : ('-'),
      a.representante && a.representante.telefono ? `${a.representante.telefono}` : ('-')
    ]);
    doc.text(`Lista de Alumnos (Total: ${alumnosFiltrados.length})`, 14, 10);
    autoTable(doc, {
      head: [columns],
      body: rows,
      startY: 20,
      styles: {
        fontSize: 8,
        overflow: 'linebreak',
        cellPadding: 2
      },
      columnStyles: {
        0: { cellWidth: 8 },
        1: { cellWidth: 32 },
        4: { cellWidth: 8, halign: 'center' },
        5: { cellWidth: 10, halign: 'center' },
        7: { cellWidth: 10, halign: 'center' }
      }
    });
    let nombreSede = '';
    if (sedeSeleccionada && sedeSeleccionada.nombre) {
      nombreSede = `_${sedeSeleccionada.nombre.replace(/\s+/g, '_')}`;
    }
    doc.save(`alumnos${nombreSede}.pdf`);
  };
  const handleDeleteAlumno = async () => {
    if (!deleteId) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/${deleteId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar alumno');
      setAlumnos(alumnos.filter(a => a._id !== deleteId));
      setDeleteId(null);
      setDeleteSuccess({ open: true, message: data.message || 'Alumno eliminado' });
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  const openImportPicker = () => {
    if (!tieneSedeEspecifica) {
      setError('Debes seleccionar una sede antes de importar alumnos.');
      return;
    }
    if (importInputRef.current) {
      importInputRef.current.value = '';
      importInputRef.current.click();
    }
  };

  const requestImport = async ({ file, dryRun }) => {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No hay token de sesion. Inicia sesion nuevamente.');
    }

    const formData = new FormData();
    formData.append('archivo', file);
    formData.append('sede', String(sedeSeleccionada._id));
    if (dryRun) {
      formData.append('dryRun', '1');
    }

    const res = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/importar-excel`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || data?.detalle || 'No se pudo procesar el archivo.');
    }
    return data;
  };

  const handleImportFileSelected = async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;

    const fileName = String(file.name || '').toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      setError('Formato no permitido. Usa .xlsx o .xls');
      return;
    }

    setImportPreviewLoading(true);
    setError(null);
    try {
      const preview = await requestImport({ file, dryRun: true });
      setImportPendingFile(file);
      setImportPreviewData(preview);
      setPreviewCreatePage(0);
      setPreviewSkipPage(0);
      setPreviewErrorPage(0);
      setImportPreviewOpen(true);
    } catch (err) {
      setError(err.message || 'Error al importar el archivo.');
    } finally {
      setImportPreviewLoading(false);
    }
  };

  const closeImportPreview = () => {
    if (importLoading || importPreviewLoading) return;
    setImportPreviewOpen(false);
    setImportPreviewData(null);
    setImportPendingFile(null);
    setPreviewCreatePage(0);
    setPreviewSkipPage(0);
    setPreviewErrorPage(0);
  };

  const confirmImportFromPreview = async () => {
    if (!importPendingFile) {
      setError('No hay archivo seleccionado para importar.');
      return;
    }

    setImportLoading(true);
    setError(null);
    try {
      const data = await requestImport({ file: importPendingFile, dryRun: false });

      setImportSuccess({
        open: true,
        message: `Importacion completada. Creados: ${data.creados || 0}, Omitidos: ${data.omitidos || 0}, Errores: ${data.conError || 0}.`
      });

      if (Array.isArray(data?.detalle?.errores) && data.detalle.errores.length > 0) {
        const resumenErrores = data.detalle.errores
          .slice(0, 4)
          .map((item) => `Fila ${item.fila}: ${item.error}`)
          .join(' | ');
        setError(`Algunas filas no se importaron. ${resumenErrores}`);
      }

      closeImportPreview();
      await fetchAlumnos();
    } catch (err) {
      setError(err.message || 'Error al importar el archivo.');
    } finally {
      setImportLoading(false);
    }
  };
  const handleBajaAlumno = async () => {
    if (!bajaId) return;
    setBajaLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/${bajaId}/baja`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ motivo_baja: motivoBaja.trim() || undefined })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al dar de baja al alumno');
      setAlumnos(prev => prev.map(a => a._id === bajaId ? { ...a, estado: 'Baja', dado_de_baja: true, activo: false, motivo_baja: motivoBaja.trim() || null } : a));
      setBajaId(null);
      setMotivoBaja('');
      setBajaSuccess({ open: true, message: data.message || 'Alumno dado de baja' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBajaLoading(false);
    }
  };
  const handleCloseBajaDialog = () => {
    if (bajaLoading) return;
    setBajaId(null);
    setMotivoBaja('');
  };

  const openReactivarDialog = (alumno) => {
    const montoSugerido = Number(alumno?.sede?.costo);
    const sugerido = Number.isFinite(montoSugerido) && montoSugerido > 0 ? String(montoSugerido) : '';
    setReactivarForm({
      montoReingreso: sugerido,
      montoMensualidad: sugerido,
      montoPagado: '',
      fechaPago: new Date().toISOString().slice(0, 10),
      metodoPago: METODOS_PAGO[0],
      referencia: '',
      comentario: '',
      comprobante: null
    });
    setReactivarError(null);
    setReactivarId(alumno?._id || null);
  };

  const closeReactivarDialog = () => {
    if (reactivarLoading) return;
    setReactivarId(null);
    setReactivarError(null);
    setReactivarForm((prev) => ({
      ...prev,
      referencia: '',
      comentario: '',
      comprobante: null
    }));
  };

  const handleReactivarAlumno = async () => {
    if (!reactivarId) return;
    setReactivarError(null);

    const montoReingreso = Number(reactivarForm.montoReingreso);
    const montoMensualidad = Number(reactivarForm.montoMensualidad);
    if (!Number.isFinite(montoReingreso) || montoReingreso <= 0) {
      setReactivarError('Debes ingresar un monto de reingreso valido.');
      return;
    }
    if (!Number.isFinite(montoMensualidad) || montoMensualidad <= 0) {
      setReactivarError('Debes ingresar un monto de mensualidad valido.');
      return;
    }

    const metodoPago = normalizeMetodoPago(reactivarForm.metodoPago);
    if (!metodoPago) {
      setReactivarError('Debes seleccionar un metodo de pago.');
      return;
    }

    if (metodoRequiereReferencia(metodoPago) && !/^[0-9]{6,}$/.test(String(reactivarForm.referencia || '').trim())) {
      setReactivarError('La referencia debe tener minimo 6 digitos para el metodo de pago seleccionado.');
      return;
    }

    const totalEsperado = Number((montoReingreso + montoMensualidad).toFixed(2));
    const montoPagado = Number(reactivarForm.montoPagado || 0);
    const estatus = (!Number.isFinite(montoPagado) || montoPagado <= 0)
      ? 'Pendiente'
      : (montoPagado < totalEsperado ? 'Abono' : 'Pagado');

    setReactivarLoading(true);
    try {
      const formData = new FormData();
      formData.append('monto_reingreso', String(montoReingreso));
      formData.append('monto_mensualidad', String(montoMensualidad));
      formData.append('monto_esperado', String(totalEsperado));
      formData.append('monto_pagado', Number.isFinite(montoPagado) && montoPagado > 0 ? String(montoPagado) : '');
      formData.append('fecha_pago', reactivarForm.fechaPago || new Date().toISOString().slice(0, 10));
      formData.append('metodo_pago', metodoPago);
      formData.append('referencia', metodoRequiereReferencia(metodoPago) ? String(reactivarForm.referencia || '').trim() : '');
      formData.append('estatus', estatus);
      formData.append('comentario_reingreso', String(reactivarForm.comentario || '').trim());
      if (reactivarForm.comprobante) {
        formData.append('comprobante', reactivarForm.comprobante);
      }

      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/${reactivarId}/reactivar`, {
        method: 'PATCH',
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al reactivar al alumno');
      setAlumnos(prev => prev.map(a => a._id === reactivarId ? { ...a, estado: 'Activo', dado_de_baja: false, activo: true, numero_franela: null } : a));
      setReactivarId(null);
      setReactivarSuccess({
        open: true,
        message: data.message || 'Alumno reactivado y reingreso registrado. Debes reasignar el nro de franela.'
      });
    } catch (err) {
      setReactivarError(err.message);
    } finally {
      setReactivarLoading(false);
    }
  };

  const fetchAlumnos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos?incluirBajas=1`);
      if (!res.ok) throw new Error('Error al obtener alumnos');
      let data;
      try {
        data = await res.json();
      } catch (jsonErr) {
        // Si la respuesta no es JSON, intenta leer el texto y mostrarlo como error
        const text = await res.text();
        throw new Error('Respuesta inesperada del servidor: ' + text.substring(0, 200));
      }
      setAlumnos(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlumnos();
  }, [fetchAlumnos]);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setFiltroPagoCuotas('');
    setPage(0);
  };

  const handleLimpiarFiltros = () => {
    setFiltroNombreApellido('');
    setFiltroFechaNacimientoDesde('');
    setFiltroFechaNacimientoHasta('');
    setFiltroSexo('');
    setFiltroCategoria([]);
    setFiltroTipoMensualidad('');
    setFiltroEstado('');
    setFiltroPagoCuotas('');
    setPage(0);
  };

  // Filtrar alumnos por sede seleccionada
  let alumnosFiltrados = sedeSeleccionada && sedeSeleccionada._id
    ? alumnos.filter(a => a.sede && a.sede._id === sedeSeleccionada._id)
    : alumnos;
  console.log('Alumnos después de filtrar por sede:', alumnosFiltrados);
  // Aplicar filtros adicionales
  alumnosFiltrados = alumnosFiltrados.filter(a => {
    const textoBusqueda = `${a.nombres || ''} ${a.apellidos || ''}`.toLowerCase().trim();
    const nombreApellidoMatch = filtroNombreApellido === '' || textoBusqueda.includes(filtroNombreApellido.toLowerCase());

    const fechaNacimientoAlumno = parseFechaLocal(a.fecha_nacimiento);
    const fechaDesde = parseFechaLocal(filtroFechaNacimientoDesde);
    const fechaHasta = parseFechaLocal(filtroFechaNacimientoHasta);
    const fechaDesdeMatch = !fechaDesde || (fechaNacimientoAlumno && fechaNacimientoAlumno >= fechaDesde);
    const fechaHastaMatch = !fechaHasta || (fechaNacimientoAlumno && fechaNacimientoAlumno <= fechaHasta);

    const sexoAlumno = String(obtenerSexoAlumno(a)).toLowerCase();
    const sexoMatch = filtroSexo === '' || sexoAlumno === filtroSexo.toLowerCase();

    const categoriaAlumno = String(a.categoria || '').trim().toUpperCase();
    const categoriasSeleccionadas = (filtroCategoria || []).map((item) => String(item).toUpperCase());
    const categoriaMatch = categoriasSeleccionadas.length === 0 || categoriasSeleccionadas.includes(categoriaAlumno);

    const tipoMensualidad = obtenerTipoMensualidadKey(a);
    const tipoMensualidadMatch = filtroTipoMensualidad === '' || tipoMensualidad === filtroTipoMensualidad;

    const estadoAlumno = String(obtenerEstadoAlumno(a)).toLowerCase();
    const estadoMatch = filtroEstado === '' || estadoAlumno === filtroEstado.toLowerCase();

    const pagoCuotasMatch =
      filtroPagoCuotas === ''
        ? true
        : filtroPagoCuotas === 'si'
          ? a.habilitar_pago_cuotas === true
          : !a.habilitar_pago_cuotas;
    return nombreApellidoMatch && fechaDesdeMatch && fechaHastaMatch && sexoMatch && categoriaMatch && tipoMensualidadMatch && estadoMatch && pagoCuotasMatch;
  });
  alumnosFiltrados = [...alumnosFiltrados].sort((a, b) => {
    const nombreA = String(a?.nombres || '').trim();
    const nombreB = String(b?.nombres || '').trim();
    const apellidoA = String(a?.apellidos || '').trim();
    const apellidoB = String(b?.apellidos || '').trim();

    const cmpNombre = nombreA.localeCompare(nombreB, 'es', { sensitivity: 'base' });
    if (cmpNombre !== 0) return cmpNombre;

    return apellidoA.localeCompare(apellidoB, 'es', { sensitivity: 'base' });
  });
  const alumnosPaginados = alumnosFiltrados.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const previewCreados = importPreviewData?.detalle?.creados || [];
  const previewOmitidos = importPreviewData?.detalle?.omitidos || [];
  const previewErrores = importPreviewData?.detalle?.errores || [];

  const createTotalPages = Math.max(1, Math.ceil(previewCreados.length / PREVIEW_PAGE_SIZE));
  const skipTotalPages = Math.max(1, Math.ceil(previewOmitidos.length / PREVIEW_PAGE_SIZE));
  const errorTotalPages = Math.max(1, Math.ceil(previewErrores.length / PREVIEW_PAGE_SIZE));

  const currentCreatePage = Math.min(previewCreatePage, createTotalPages - 1);
  const currentSkipPage = Math.min(previewSkipPage, skipTotalPages - 1);
  const currentErrorPage = Math.min(previewErrorPage, errorTotalPages - 1);

  const createdPageRows = previewCreados.slice(
    currentCreatePage * PREVIEW_PAGE_SIZE,
    (currentCreatePage + 1) * PREVIEW_PAGE_SIZE
  );
  const skippedPageRows = previewOmitidos.slice(
    currentSkipPage * PREVIEW_PAGE_SIZE,
    (currentSkipPage + 1) * PREVIEW_PAGE_SIZE
  );
  const errorPageRows = previewErrores.slice(
    currentErrorPage * PREVIEW_PAGE_SIZE,
    (currentErrorPage + 1) * PREVIEW_PAGE_SIZE
  );

  return (
    <Box sx={{ width: '100%', boxSizing: 'border-box' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2, flexWrap: 'wrap', width: '100%' }}>
        <input
          ref={importInputRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={handleImportFileSelected}
        />
        <Box sx={{ minWidth: 0, maxWidth: '100%' }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Lista de Alumnos</Typography>
          <Typography variant="body2" sx={{ color: '#94a3b8' }}>
            Gestion centralizada de estudiantes y categorias.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', width: { xs: '100%', md: 'auto' }, minWidth: 0 }}>
          <Button
            variant="contained"
            color="secondary"
            sx={{
              width: { xs: '100%', sm: 'auto' },
              py: 0.8,
              borderRadius: 999,
            }}
            startIcon={<PersonAddAlt1Icon />}
            onClick={() => navigate('/alumnos')}
          >
            Nueva inscripción
          </Button>
          <Button
            variant="outlined"
            sx={{ borderColor: '#e2e8f0', color: '#16a34a', fontWeight: 700, width: { xs: '100%', sm: 'auto' } }}
            startIcon={<TableChartIcon />}
            onClick={handleDownloadExcel}
          >
            Excel
          </Button>
          {esSuperAdmin && (
            <Button
              variant="outlined"
              sx={{ borderColor: '#e2e8f0', color: '#2563eb', fontWeight: 700, width: { xs: '100%', sm: 'auto' } }}
              startIcon={<UploadFileIcon />}
              onClick={openImportPicker}
              disabled={importLoading || importPreviewLoading || !tieneSedeEspecifica}
            >
              {importLoading || importPreviewLoading
                ? 'Importando...'
                : tieneSedeEspecifica
                  ? 'Importar Excel'
                  : 'Importar Excel (elige una sede)'}
            </Button>
          )}
          <Button
            variant="outlined"
            sx={{ borderColor: '#e2e8f0', color: '#ef4444', fontWeight: 700, width: { xs: '100%', sm: 'auto' } }}
            startIcon={<PictureAsPdfIcon />}
            onClick={handleDownloadPDF}
          >
            PDF
          </Button>
        </Box>
      </Box>
      {isMobile && (
        <Box sx={{ mb: 1.25, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setMostrarFiltrosMobile((prev) => !prev)}
            sx={{
              borderColor: '#cbd5e1',
              color: '#475569',
              fontWeight: 700,
              textTransform: 'none'
            }}
          >
            {mostrarFiltrosMobile ? 'Ocultar filtros' : 'Mostrar filtros'}
          </Button>
        </Box>
      )}

      {(!isMobile || mostrarFiltrosMobile) && (
      <Box
        sx={{
          width: '100%',
          maxWidth: '100%',
            minWidth: 0,
            boxSizing: 'border-box',
            bgcolor: '#fff',
          border: '1px solid #eef0f3',
          borderRadius: 3,
          p: 2,
          mb: 2,
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: 'repeat(8, minmax(0, 1fr))' }
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', mb: 0.5 }}>ALUMNO</Typography>
          <TextField
            variant="outlined"
            size="small"
            placeholder="Nombre o apellido"
            value={filtroNombreApellido}
            onChange={e => setFiltroNombreApellido(e.target.value)}
            sx={{ width: '100%', '& .MuiInputBase-input': { py: 0.8, fontSize: 13 } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start" sx={{ mr: 0.5 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                </InputAdornment>
              )
            }}
          />
        </Box>
        <Box>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', mb: 0.5 }}>NAC. DESDE</Typography>
          <TextField
            type="date"
            size="small"
            value={filtroFechaNacimientoDesde}
            onChange={e => setFiltroFechaNacimientoDesde(e.target.value)}
            sx={{ width: '100%', '& .MuiInputBase-input': { py: 0.8, fontSize: 13 } }}
            InputLabelProps={{ shrink: true }}
          />
        </Box>
        <Box>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', mb: 0.5 }}>NAC. HASTA</Typography>
          <TextField
            type="date"
            size="small"
            value={filtroFechaNacimientoHasta}
            onChange={e => setFiltroFechaNacimientoHasta(e.target.value)}
            sx={{ width: '100%', '& .MuiInputBase-input': { py: 0.8, fontSize: 13 } }}
            InputLabelProps={{ shrink: true }}
          />
        </Box>
        <Box>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', mb: 0.5 }}>SEXO</Typography>
          <TextField
            select
            size="small"
            value={filtroSexo}
            onChange={(e) => setFiltroSexo(e.target.value)}
            sx={{ width: '100%', '& .MuiInputBase-input': { py: 0.8, fontSize: 13 } }}
          >
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="Femenino">Femenino</MenuItem>
            <MenuItem value="Masculino">Masculino</MenuItem>
          </TextField>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', mb: 0.5 }}>CATEGORÍA</Typography>
          <FormControl size="small" sx={{ width: '100%' }}>
            <Select
              multiple
            size="small"
            value={filtroCategoria}
              onChange={(e) => {
                const value = e.target.value;
                setFiltroCategoria(typeof value === 'string' ? value.split(',') : value);
              }}
              displayEmpty
              renderValue={(selected) => {
                if (!selected || selected.length === 0) return 'Todas';
                return selected.join(', ');
              }}
              sx={{ '& .MuiSelect-select': { py: 0.8, fontSize: 13 } }}
            >
              {CATEGORIAS_DISPONIBLES.map((categoria) => (
                <MenuItem key={categoria} value={categoria}>
                  <Checkbox size="small" checked={filtroCategoria.includes(categoria)} />
                  <Typography sx={{ fontSize: 13 }}>{categoria}</Typography>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', mb: 0.5 }}>TIPO MENSUALIDAD</Typography>
          <TextField
            select
            size="small"
            value={filtroTipoMensualidad}
            onChange={(e) => setFiltroTipoMensualidad(e.target.value)}
            sx={{ width: '100%', '& .MuiInputBase-input': { py: 0.8, fontSize: 13 } }}
          >
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="monto_sede">Monto sede</MenuItem>
            <MenuItem value="monto_personalizado">Monto personalizado</MenuItem>
            <MenuItem value="beca_completa">Beca completa</MenuItem>
          </TextField>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', mb: 0.5 }}>ESTADO</Typography>
          <TextField
            select
            size="small"
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            sx={{ width: '100%', '& .MuiInputBase-input': { py: 0.8, fontSize: 13 } }}
          >
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="Activo">Activo</MenuItem>
            <MenuItem value="Baja">Baja</MenuItem>
          </TextField>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', mb: 0.5 }}>PAGO EN CUOTAS</Typography>
          <TextField
            select
            size="small"
            value={filtroPagoCuotas}
            onChange={e => setFiltroPagoCuotas(e.target.value)}
            sx={{ width: '100%', '& .MuiInputBase-input': { py: 0.8, fontSize: 13 } }}
          >
            <MenuItem value="">Todos</MenuItem>
            <MenuItem value="si">Habilitado</MenuItem>
            <MenuItem value="no">No habilitado</MenuItem>
          </TextField>
        </Box>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 1,
            flexWrap: 'wrap',
            gridColumn: { xs: '1 / -1', md: '-2 / -1' }
          }}
        >
          <Button
            variant="outlined"
            size="small"
            onClick={handleLimpiarFiltros}
            sx={{
              borderColor: '#cbd5e1',
              color: '#475569',
              fontWeight: 700,
              textTransform: 'none'
            }}
          >
            Limpiar filtros
          </Button>
        </Box>
      </Box>
      )}
      <Box sx={{ display: 'none' }} />
      {loading ? (
        <Typography>Cargando...</Typography>
      ) : error ? (
        <Typography color="error">{error}</Typography>
      ) : isMobile ? (
        <Box sx={{ display: 'grid', gap: 1.5, width: '100%', boxSizing: 'border-box' }}>
          {alumnosPaginados.map((alumno) => (
            <Paper
              key={alumno._id}
              onClick={() => navigate(`/alumno/${alumno._id}`)}
              sx={{
                p: 1.5,
                borderRadius: 3,
                border: '1px solid #eef0f3',
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.05)',
                  width: '100%',
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                  overflowWrap: 'break-word',
                  cursor: 'pointer'
                }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.2, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, minWidth: 0, flex: 1 }}>
                  <Tooltip
                    title={esAlumnoActivo(alumno)
                      ? 'Alumno activo'
                      : `Motivo: ${alumno.motivo_baja?.trim() || 'No especificado'}`}
                    arrow
                  >
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        bgcolor: esAlumnoActivo(alumno) ? '#16a34a' : '#dc2626',
                        boxShadow: esAlumnoActivo(alumno)
                          ? '0 0 0 3px rgba(22, 163, 74, 0.14)'
                          : '0 0 0 3px rgba(220, 38, 38, 0.14)',
                        flexShrink: 0
                      }}
                    />
                  </Tooltip>
                  <Avatar
                    src={mediaUrl(alumno.foto) || ''}
                    alt={alumno.nombres}
                    sx={{ width: 40, height: 40, bgcolor: '#e0ecff', color: '#2563eb', fontWeight: 700, flexShrink: 0 }}
                  >
                    {`${alumno.nombres?.[0] || ''}${alumno.apellidos?.[0] || ''}`.toUpperCase()}
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, color: '#0f172a', lineHeight: 1.15 }} noWrap>
                      {obtenerNombreCompletoAlumno(alumno)}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: '#94a3b8' }}>
                      Edad: {calcularEdad(alumno.fecha_nacimiento) || '-'}
                    </Typography>
                  </Box>
                </Box>
              </Box>

              <Box sx={{ display: 'grid', gap: 0.4, mb: 1.1 }}>
                <Typography sx={{ fontSize: 12.5, color: '#475569' }}>
                  <strong>Sexo:</strong> {obtenerSexoAlumno(alumno)}
                </Typography>
                <Typography sx={{ fontSize: 12.5, color: '#475569' }}>
                  <strong>Categoría:</strong> {alumno.categoria || '-'}
                </Typography>
                <Typography sx={{ fontSize: 12.5, color: '#475569' }}>
                  <strong>Nro franela:</strong> {(alumno.numero_franela ?? '-') || '-'}
                </Typography>
                <Typography sx={{ fontSize: 12.5, color: '#475569' }}>
                  <strong>Tipo de mensualidad:</strong> {obtenerTipoMensualidad(alumno)}
                </Typography>
                <Typography sx={{ fontSize: 12.5, color: '#475569' }}>
                  <strong>Representante:</strong> {alumno.representante && typeof alumno.representante === 'object'
                    ? `${alumno.representante.nombres} ${alumno.representante.apellidos}`
                    : (alumno.representante || '-')}
                </Typography>
                <Typography sx={{ fontSize: 12.5, color: '#64748b' }}>
                  <strong>Fecha nac.:</strong> {formatFecha(alumno.fecha_nacimiento) || '-'}
                </Typography>
              </Box>

              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                <Tooltip title="Ver detalles">
                  <IconButton aria-label="ver" size="small" sx={{ color: '#64748b', bgcolor: '#f8fafc' }} onClick={(e) => { e.stopPropagation(); navigate(`/alumno/${alumno._id}`); }}>
                    <VisibilityIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Editar">
                  <IconButton aria-label="editar" size="small" sx={{ color: '#64748b', bgcolor: '#f8fafc' }} onClick={(e) => { e.stopPropagation(); navigate(`/alumno/editar/${alumno._id}`); }}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                {!(alumno.dado_de_baja || alumno.activo === false) && (
                  <Tooltip title="Dar de baja">
                    <IconButton aria-label="dar de baja" size="small" sx={{ color: '#64748b', bgcolor: '#fff7ed' }} onClick={(e) => {
                      e.stopPropagation();
                      setBajaId(alumno._id);
                      setMotivoBaja('');
                    }}>
                      <PersonOffIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                {(alumno.dado_de_baja || alumno.activo === false) && (
                  <Tooltip title="Reactivar">
                    <IconButton aria-label="reactivar" size="small" sx={{ color: '#2e7d32', bgcolor: '#f0fdf4' }} onClick={(e) => { e.stopPropagation(); openReactivarDialog(alumno); }}>
                      <ReplayIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                <Tooltip title={alumno.tiene_reposo_activo ? 'Gestionar reposos (activo)' : 'Gestionar reposos'}>
                  <IconButton
                    aria-label="gestionar reposos"
                    size="small"
                    sx={{
                      color: alumno.tiene_reposo_activo ? '#15803d' : '#64748b',
                      bgcolor: alumno.tiene_reposo_activo ? '#f0fdf4' : '#f8fafc'
                    }}
                    onClick={(e) => { e.stopPropagation(); navigate(`/alumno/reposos/${alumno._id}`); }}
                  >
                    <LocalHospitalIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Eliminar">
                  <IconButton aria-label="eliminar" size="small" sx={{ color: '#64748b', bgcolor: '#fff1f2' }} onClick={(e) => { e.stopPropagation(); setDeleteId(alumno._id); }}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                {alumno.foto_cedula && (
                  <Tooltip title="Descargar cédula">
                    <IconButton
                      aria-label="descargar cédula"
                      size="small"
                      sx={{ color: '#64748b', bgcolor: '#f8fafc' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const link = document.createElement('a');
                        link.href = alumno.foto_cedula;
                        link.download = `cedula_${alumno.nombres}_${alumno.apellidos}.jpg`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }}
                    >
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            </Paper>
          ))}

          <Paper sx={{ borderRadius: 3, border: '1px solid #eef0f3' }}>
            <TablePagination
              component="div"
              count={alumnosFiltrados.length}
              page={page}
              onPageChange={handleChangePage}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              rowsPerPageOptions={[5, 10, 25]}
              labelRowsPerPage="Filas por página:"
              sx={{
                width: '100%',
                '& .MuiTablePagination-toolbar': {
                  minHeight: 44,
                  px: 1,
                  flexWrap: 'wrap',
                  rowGap: 0.5
                },
                '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': {
                  m: 0,
                  fontSize: 12
                }
              }}
            />
          </Paper>
        </Box>
      ) : (
        <TableContainer
          component={Paper}
          sx={{
            borderRadius: 3,
            overflowX: 'hidden',
            overflowY: 'hidden',
            maxWidth: '100%',
            boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)'
          }}
        >
          <Table sx={{ width: '100%', tableLayout: 'fixed' }}>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f8fafc' }}>
                <TableCell sx={{ width: '26%', color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', px: 1.5 }}>ALUMNO</TableCell>
                <TableCell sx={{ width: '6%', color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', px: 1 }}>EDAD</TableCell>
                <TableCell sx={{ width: '5%', color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', px: 1 }}>SEXO</TableCell>
                <TableCell sx={{ width: '10%', color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', px: 1 }}>CATEGORÍA</TableCell>
                <TableCell sx={{ width: '6%', color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', px: 1 }}>FRANELA</TableCell>
                <TableCell sx={{ width: '12%', color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', px: 1 }}>TIPO DE MENSUALIDAD</TableCell>
                <TableCell sx={{ width: '15%', color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textAlign: 'center', px: 1 }}>ACCIONES</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {alumnosPaginados.map((alumno) => (
                <TableRow
                  key={alumno._id}
                  onClick={() => navigate(`/alumno/${alumno._id}`)}
                  sx={{ '& td': { borderBottom: '1px solid #eef0f3', py: 2, px: 1 }, '&:hover': { backgroundColor: '#fafafa' }, cursor: 'pointer' }}
                >
                  <TableCell sx={{ px: 1.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5, minWidth: 0 }}>
                      <Tooltip
                        title={esAlumnoActivo(alumno)
                          ? 'Alumno activo'
                          : `Motivo: ${alumno.motivo_baja?.trim() || 'No especificado'}`}
                        arrow
                      >
                        <Box
                          sx={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            bgcolor: esAlumnoActivo(alumno) ? '#16a34a' : '#dc2626',
                            boxShadow: esAlumnoActivo(alumno)
                              ? '0 0 0 3px rgba(22, 163, 74, 0.14)'
                              : '0 0 0 3px rgba(220, 38, 38, 0.14)',
                            flexShrink: 0
                          }}
                        />
                      </Tooltip>
                      <Avatar
                        src={mediaUrl(alumno.foto) || ''}
                        alt={alumno.nombres}
                        sx={{ width: 38, height: 38, bgcolor: '#e0ecff', color: '#2563eb', fontWeight: 700, flexShrink: 0 }}
                      >
                        {`${alumno.nombres?.[0] || ''}${alumno.apellidos?.[0] || ''}`.toUpperCase()}
                      </Avatar>
                      <Box sx={{ minWidth: 0, maxWidth: '100%' }}>
                        <Typography sx={{ fontWeight: 700, color: '#0f172a', lineHeight: 1.1, whiteSpace: 'normal', wordBreak: 'break-word' }}>
                          {obtenerNombreCompletoAlumno(alumno)}
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: '#94a3b8' }}>
                          Fecha Nac: {formatFecha(alumno.fecha_nacimiento) || '-'}
                        </Typography>
                        {/* Eliminado chip de pago extendido en mobile */}
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ color: '#64748b', fontWeight: 600, px: 1 }}>{calcularEdad(alumno.fecha_nacimiento)}</TableCell>
                  <TableCell sx={{ color: '#64748b', fontWeight: 600, px: 1 }}>{obtenerSexoAlumno(alumno)}</TableCell>
                  <TableCell sx={{ color: '#64748b', fontWeight: 600, px: 1 }}>{alumno.categoria || '-'}</TableCell>
                  <TableCell sx={{ color: '#64748b', fontWeight: 600, px: 1 }}>{(alumno.numero_franela ?? '-') || '-'}</TableCell>
                  <TableCell sx={{ color: '#64748b', fontWeight: 600, px: 1 }}>
                    {obtenerTipoMensualidad(alumno)}
                  </TableCell>
                  <TableCell sx={{ textAlign: 'center', whiteSpace: 'nowrap', px: 1 }}>
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 0.25, maxWidth: '100%' }}>
                      <Tooltip title="Ver detalles">
                        <IconButton aria-label="ver" size="small" sx={{ color: '#94a3b8', p: 0.5 }} onClick={(e) => { e.stopPropagation(); navigate(`/alumno/${alumno._id}`); }}>
                          <VisibilityIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Editar">
                        <IconButton aria-label="editar" size="small" sx={{ color: '#94a3b8', p: 0.5 }} onClick={(e) => { e.stopPropagation(); navigate(`/alumno/editar/${alumno._id}`); }}>
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      {!(alumno.dado_de_baja || alumno.activo === false) && (
                        <Tooltip title="Dar de baja">
                          <IconButton aria-label="dar de baja" size="small" sx={{ color: '#94a3b8', p: 0.5 }} onClick={(e) => {
                            e.stopPropagation();
                            setBajaId(alumno._id);
                            setMotivoBaja('');
                          }}>
                            <PersonOffIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                      {(alumno.dado_de_baja || alumno.activo === false) && (
                        <Tooltip title="Reactivar">
                          <IconButton aria-label="reactivar" size="small" sx={{ color: '#2e7d32', p: 0.5 }} onClick={(e) => { e.stopPropagation(); openReactivarDialog(alumno); }}>
                            <ReplayIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title={alumno.tiene_reposo_activo ? 'Gestionar reposos (activo)' : 'Gestionar reposos'}>
                        <IconButton
                          aria-label="gestionar reposos"
                          size="small"
                          sx={{
                            color: alumno.tiene_reposo_activo ? '#15803d' : '#94a3b8',
                            p: 0.5
                          }}
                          onClick={(e) => { e.stopPropagation(); navigate(`/alumno/reposos/${alumno._id}`); }}
                        >
                          <LocalHospitalIcon />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Eliminar">
                        <IconButton aria-label="eliminar" size="small" sx={{ color: '#94a3b8', p: 0.5 }} onClick={(e) => { e.stopPropagation(); setDeleteId(alumno._id); }}>
                          <DeleteIcon />
                        </IconButton>
                      </Tooltip>
                      {alumno.foto_cedula && (
                        <Tooltip title="Descargar cédula">
                          <IconButton
                            aria-label="descargar cédula"
                            size="small"
                            sx={{ color: '#94a3b8', p: 0.5 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              const link = document.createElement('a');
                              link.href = alumno.foto_cedula;
                              link.download = `cedula_${alumno.nombres}_${alumno.apellidos}.jpg`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                            }}
                          >
                            <DownloadIcon />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={alumnosFiltrados.length}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[5, 10, 25]}
            labelRowsPerPage="Filas por página:"
          />
        </TableContainer>
      )}
      <Dialog open={!!deleteId} onClose={() => setDeleteId(null)}>
        <DialogTitle>¿Eliminar alumno?</DialogTitle>
        <DialogContent>¿Estás seguro de que deseas eliminar este alumno? Esta acción no se puede deshacer.</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)} disabled={deleteLoading}>Cancelar</Button>
          <Button onClick={handleDeleteAlumno} color="error" variant="contained" disabled={deleteLoading}>
            {deleteLoading ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={!!bajaId}
        onClose={handleCloseBajaDialog}
        BackdropProps={{ sx: { backgroundColor: 'rgba(255, 255, 255, 0.08)', backdropFilter: 'blur(4px)' } }}
      >
        <DialogTitle>¿Dar de baja al alumno?</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>
            Confirma si deseas dar de baja al alumno. Esta acción se puede revertir.
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={3}
            label="Motivo de baja"
            placeholder="Opcional"
            value={motivoBaja}
            onChange={(e) => setMotivoBaja(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseBajaDialog} disabled={bajaLoading}>Cancelar</Button>
          <Button onClick={handleBajaAlumno} style={loading ? { opacity: 0.6, pointerEvents: 'none' } : {}} variant="contained" disabled={bajaLoading}>
            {bajaLoading ? 'Procesando...' : 'Dar de baja'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={!!reactivarId}
        onClose={closeReactivarDialog}
        fullWidth
        maxWidth="sm"
        BackdropProps={{ sx: { backgroundColor: 'rgba(255, 255, 255, 0.08)', backdropFilter: 'blur(4px)' } }}
        PaperProps={{
          sx: {
            borderRadius: 3,
            boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)',
            px: { xs: 0.5, sm: 1.5 },
            py: 0.5
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0f172a', pb: 0.5 }}>
          Reingreso y reactivacion
        </DialogTitle>
        <DialogContent sx={{ pt: 1.25, pb: 1.5 }}>
          <Typography sx={{ color: '#64748b', mb: 1.25 }}>
            Registra el cobro de reingreso con montos separados por concepto para mantener trazabilidad.
          </Typography>

          <Box
            sx={{
              p: 2,
              borderRadius: 2.5,
              border: '1px solid #dbe3ef',
              borderLeft: '4px solid #f97316',
              background: 'linear-gradient(135deg, #f8fbff 0%, #fdfdfd 100%)',
              mb: 2
            }}
          >
            <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', mb: 0.5 }}>
              Datos base
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr auto' }, gap: 0.75, alignItems: 'center' }}>
              <Typography variant="body2" sx={{ color: '#334155' }}>Alumno</Typography>
              <Typography variant="body2" sx={{ color: '#0f172a', fontWeight: 800 }}>
                {alumnoReactivar ? `${alumnoReactivar.nombres || ''} ${alumnoReactivar.apellidos || ''}`.trim() : '-'}
              </Typography>
              <Typography variant="body2" sx={{ color: '#334155' }}>Sede</Typography>
              <Typography variant="body2" sx={{ color: '#0f172a', fontWeight: 800 }}>
                {alumnoReactivar?.sede?.nombre || '-'}
              </Typography>
              <Typography variant="body2" sx={{ color: '#334155' }}>Monto base sede</Typography>
              <Typography variant="body2" sx={{ color: '#0f172a', fontWeight: 800 }}>
                {alumnoReactivar?.sede?.costo !== undefined && alumnoReactivar?.sede?.costo !== null
                  ? `$${Number(alumnoReactivar.sede.costo).toFixed(2)}`
                  : 'No disponible'}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, my: 1.5 }}>
            <TextField
              label="Monto de reingreso (USD)"
              type="number"
              value={reactivarForm.montoReingreso}
              onChange={(e) => setReactivarForm((prev) => ({ ...prev, montoReingreso: e.target.value }))}
              inputProps={{ min: 0, step: '0.01' }}
              InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
              fullWidth
              size="small"
              sx={modalInputSx}
            />
            <TextField
              label="Monto mensualidad (USD)"
              type="number"
              value={reactivarForm.montoMensualidad}
              onChange={(e) => setReactivarForm((prev) => ({ ...prev, montoMensualidad: e.target.value }))}
              inputProps={{ min: 0, step: '0.01' }}
              InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
              fullWidth
              size="small"
              sx={modalInputSx}
            />
          </Box>

          <Box
            sx={{
              p: 2,
              borderRadius: 2.5,
              border: '1px solid #1e2a57',
              background: '#0B0F2A',
              mb: 2
            }}
          >
            <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#cbd5e1', mb: 0.75 }}>
              Resumen de reingreso
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr auto' }, gap: 0.75, alignItems: 'center' }}>
              <Typography variant="body2" sx={{ color: '#e2e8f0', fontWeight: 700 }}>Total USD</Typography>
              <Typography sx={{ color: '#ffffff', fontWeight: 900, fontSize: 20, lineHeight: 1.1 }}>
                ${totalReingresoUsd.toFixed(2)}
              </Typography>
              <Typography variant="body2" sx={{ color: '#e2e8f0', fontWeight: 700 }}>Pagado USD</Typography>
              <Typography variant="body2" sx={{ color: '#ffffff', fontWeight: 800 }}>
                ${montoPagadoReingresoUsd.toFixed(2)}
              </Typography>
              <Typography variant="body2" sx={{ color: '#e2e8f0', fontWeight: 700 }}>Saldo USD</Typography>
              <Typography variant="body2" sx={{ color: '#ffffff', fontWeight: 800 }}>
                ${saldoReingresoUsd.toFixed(2)}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
            <TextField
              label="Monto pagado (USD)"
              type="number"
              value={reactivarForm.montoPagado}
              onChange={(e) => setReactivarForm((prev) => ({ ...prev, montoPagado: e.target.value }))}
              inputProps={{ min: 0, step: '0.01' }}
              InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
              helperText="Opcional. Si queda en blanco se registra como pendiente."
              fullWidth
              size="small"
              sx={modalInputSx}
            />
            <TextField
              label="Fecha de pago"
              type="date"
              value={reactivarForm.fechaPago}
              onChange={(e) => setReactivarForm((prev) => ({ ...prev, fechaPago: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              fullWidth
              size="small"
              sx={modalInputSx}
            />
            <FormControl fullWidth size="small" sx={modalInputSx}>
              <InputLabel id="metodo-pago-reingreso-label">Metodo de pago</InputLabel>
              <Select
                labelId="metodo-pago-reingreso-label"
                value={reactivarForm.metodoPago}
                label="Metodo de pago"
                onChange={(e) => setReactivarForm((prev) => ({ ...prev, metodoPago: normalizeMetodoPago(e.target.value) }))}
              >
                {METODOS_PAGO.map((metodo) => (
                  <MenuItem key={metodo} value={metodo}>{metodo}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {metodoRequiereReferencia(reactivarForm.metodoPago) && (
              <TextField
                label="Referencia (minimo 6 digitos)"
                value={reactivarForm.referencia}
                onChange={(e) => setReactivarForm((prev) => ({ ...prev, referencia: e.target.value.replace(/\D/g, '') }))}
                inputProps={{ minLength: 6 }}
                fullWidth
                size="small"
                sx={modalInputSx}
              />
            )}
            <TextField
              label="Comentario"
              value={reactivarForm.comentario}
              onChange={(e) => setReactivarForm((prev) => ({ ...prev, comentario: e.target.value }))}
              multiline
              minRows={2}
              fullWidth
              size="small"
              sx={{ ...modalInputSx, gridColumn: { xs: '1 / -1', sm: '1 / -1' } }}
            />
          </Box>

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
            <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
              Haz clic para adjuntar comprobante
            </Typography>
            <Typography variant="caption" sx={{ color: '#94a3b8' }}>PNG, JPG hasta 5MB</Typography>
            <input
              type="file"
              hidden
              accept="image/*"
              onChange={(e) => setReactivarForm((prev) => ({ ...prev, comprobante: e.target.files?.[0] || null }))}
            />
          </Box>

          {reactivarForm.comprobante && (
            <Box
              sx={{
                mt: 1.5,
                px: 1.5,
                py: 1,
                border: '1px solid #e2e8f0',
                borderRadius: 2,
                bgcolor: '#ffffff'
              }}
            >
              <Typography sx={{ fontSize: 12, color: '#475569' }}>
                Archivo: {reactivarForm.comprobante.name}
              </Typography>
            </Box>
          )}

          {reactivarError && (
            <MuiAlert
              severity="error"
              sx={{
                mt: 1.5,
                borderRadius: 2,
                border: '1px solid #fecaca',
                backgroundColor: '#fef2f2',
                color: '#991b1b',
                '& .MuiAlert-icon': { color: '#dc2626' }
              }}
            >
              {reactivarError}
            </MuiAlert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.25 }}>
          <Button onClick={closeReactivarDialog} disabled={reactivarLoading} sx={{ color: '#64748b', fontWeight: 700 }}>
            Cancelar
          </Button>
          <Button
            onClick={handleReactivarAlumno}
            style={loading ? { opacity: 0.6, pointerEvents: 'none' } : {}}
            variant="contained"
            disabled={reactivarLoading}
            sx={{ bgcolor: '#ff7a00', '&:hover': { bgcolor: '#f97316' }, fontWeight: 800, borderRadius: 2, px: 3 }}
          >
            {reactivarLoading ? 'Procesando...' : 'Registrar reingreso'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={importPreviewOpen}
        onClose={closeImportPreview}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Previsualizacion de importacion</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 1.5, color: '#475569' }}>
            Revisa los registros antes de confirmar.
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(4, minmax(0, 1fr))' },
              gap: 1,
              mb: 2
            }}
          >
            {/* Chips de resumen de importación eliminados */}
          </Box>

          <Typography sx={{ fontWeight: 700, mb: 1 }}>Registros a crear</Typography>
          <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 2, p: 1.25, maxHeight: 180, overflowY: 'auto', mb: 2 }}>
            {previewCreados.length === 0 ? (
              <Typography sx={{ color: '#64748b' }}>No hay registros para crear.</Typography>
            ) : (
              createdPageRows.map((item, index) => (
                <Typography key={`crear-${index}`} sx={{ fontSize: 13, color: '#0f172a', mb: 0.4 }}>
                  {`Fila ${item.fila}: ${item.nombres || ''} ${item.apellidos || ''}`.trim()}
                </Typography>
              ))
            )}
          </Box>
          {previewCreados.length > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography sx={{ fontSize: 12, color: '#64748b' }}>{`Pagina ${currentCreatePage + 1} de ${createTotalPages}`}</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" variant="outlined" onClick={() => setPreviewCreatePage((p) => Math.max(0, p - 1))} disabled={currentCreatePage === 0}>Anterior</Button>
                <Button size="small" variant="outlined" onClick={() => setPreviewCreatePage((p) => Math.min(createTotalPages - 1, p + 1))} disabled={currentCreatePage >= createTotalPages - 1}>Siguiente</Button>
              </Box>
            </Box>
          )}

          <Typography sx={{ fontWeight: 700, mb: 1 }}>Registros omitidos</Typography>
          <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 2, p: 1.25, maxHeight: 180, overflowY: 'auto', mb: 2 }}>
            {previewOmitidos.length === 0 ? (
              <Typography sx={{ color: '#64748b' }}>No hay registros omitidos.</Typography>
            ) : (
              skippedPageRows.map((item, index) => (
                <Typography key={`omitido-${index}`} sx={{ fontSize: 13, color: '#92400e', mb: 0.4 }}>
                  {`Fila ${item.fila}: ${item.motivo || 'Omitido'}`}
                </Typography>
              ))
            )}
          </Box>
          {previewOmitidos.length > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography sx={{ fontSize: 12, color: '#64748b' }}>{`Pagina ${currentSkipPage + 1} de ${skipTotalPages}`}</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" variant="outlined" onClick={() => setPreviewSkipPage((p) => Math.max(0, p - 1))} disabled={currentSkipPage === 0}>Anterior</Button>
                <Button size="small" variant="outlined" onClick={() => setPreviewSkipPage((p) => Math.min(skipTotalPages - 1, p + 1))} disabled={currentSkipPage >= skipTotalPages - 1}>Siguiente</Button>
              </Box>
            </Box>
          )}

          <Typography sx={{ fontWeight: 700, mb: 1 }}>Filas con error</Typography>
          <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 2, p: 1.25, maxHeight: 180, overflowY: 'auto' }}>
            {previewErrores.length === 0 ? (
              <Typography sx={{ color: '#64748b' }}>No hay errores.</Typography>
            ) : (
              errorPageRows.map((item, index) => (
                <Typography key={`error-${index}`} sx={{ fontSize: 13, color: '#b91c1c', mb: 0.4 }}>
                  {`Fila ${item.fila}: ${item.error || 'Error desconocido'}`}
                </Typography>
              ))
            )}
          </Box>
          {previewErrores.length > 0 && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.5 }}>
              <Typography sx={{ fontSize: 12, color: '#64748b' }}>{`Pagina ${currentErrorPage + 1} de ${errorTotalPages}`}</Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="small" variant="outlined" onClick={() => setPreviewErrorPage((p) => Math.max(0, p - 1))} disabled={currentErrorPage === 0}>Anterior</Button>
                <Button size="small" variant="outlined" onClick={() => setPreviewErrorPage((p) => Math.min(errorTotalPages - 1, p + 1))} disabled={currentErrorPage >= errorTotalPages - 1}>Siguiente</Button>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeImportPreview} disabled={importLoading || importPreviewLoading}>Cancelar</Button>
          <Button onClick={confirmImportFromPreview} variant="contained" disabled={importLoading || importPreviewLoading || (importPreviewData?.creados || 0) === 0}>
            {importLoading ? 'Importando...' : 'Confirmar importacion'}
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar open={deleteSuccess.open} autoHideDuration={2500} onClose={() => setDeleteSuccess({ open: false, message: '' })} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <MuiAlert onClose={() => setDeleteSuccess({ open: false, message: '' })} severity="success" sx={{ width: '100%' }}>
          {deleteSuccess.message}
        </MuiAlert>
      </Snackbar>
      <Snackbar open={bajaSuccess.open} autoHideDuration={2500} onClose={() => setBajaSuccess({ open: false, message: '' })} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <MuiAlert onClose={() => setBajaSuccess({ open: false, message: '' })} severity="success" sx={{ width: '100%' }}>
          {bajaSuccess.message}
        </MuiAlert>
      </Snackbar>
      <Snackbar open={reactivarSuccess.open} autoHideDuration={2500} onClose={() => setReactivarSuccess({ open: false, message: '' })} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <MuiAlert onClose={() => setReactivarSuccess({ open: false, message: '' })} severity="success" sx={{ width: '100%' }}>
          {reactivarSuccess.message}
        </MuiAlert>
      </Snackbar>
      <Snackbar open={importSuccess.open} autoHideDuration={3500} onClose={() => setImportSuccess({ open: false, message: '' })} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <MuiAlert onClose={() => setImportSuccess({ open: false, message: '' })} severity="success" sx={{ width: '100%' }}>
          {importSuccess.message}
        </MuiAlert>
      </Snackbar>
    </Box>
  );
}

export default TablaAlumnos;

