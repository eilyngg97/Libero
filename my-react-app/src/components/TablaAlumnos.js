import React, { useState, useEffect, useCallback } from 'react';
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
import { Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Typography, IconButton, TablePagination, TextField, InputAdornment, Tooltip, Avatar, Chip, Box, MenuItem, Select, FormControl, InputLabel, Checkbox } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DownloadIcon from '@mui/icons-material/Download';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import ReplayIcon from '@mui/icons-material/Replay';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import TableChartIcon from '@mui/icons-material/TableChart';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import { exportToCsv } from '../utils/exportCsv';
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

function obtenerSexoAlumno(alumno) {
  const raw = String(alumno?.sexo || '').trim().toLowerCase();
  if (raw === 'femenino') return 'Femenino';
  if (raw === 'masculino') return 'Masculino';
  return '-';
}

const METODOS_PAGO = ['Pago movil', 'Transferencia', 'Efectivo'];

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
      Sexo: obtenerSexoAlumno(a),
      Fecha_Nacimiento: formatFecha(a.fecha_nacimiento),
      Edad: calcularEdad(a.fecha_nacimiento),
      Cedula: a.cedula,
      Representante: a.representante ? `${a.representante.nombres} ${a.representante.apellidos}` : ('-'),
      Telefono: a.representante && a.representante.telefono ? `${a.representante.telefono}` : ('-'),
    }));
    const headers = ['Nombre', 'Apellido', 'Sexo', 'Fecha_Nacimiento', 'Edad', 'Cedula', 'Representante', 'Telefono'];
    exportToCsv(
      data,
      `alumnos${sedeSeleccionada && sedeSeleccionada.nombre ? '_' + sedeSeleccionada.nombre.replace(/\s+/g, '_') : ''}.csv`,
      headers
    );
  };

  // Función para descargar PDF
  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    const columns = ["N°", "Nombre", "Apellido", "Sexo", "Fecha de Nacimiento", "Edad", "Cedula", "Representante", "Telefono"];
    const rows = alumnosFiltrados.map((a, i) => [
      i + 1,
      a.nombres,
      a.apellidos,
      obtenerSexoAlumno(a),
      formatFecha(a.fecha_nacimiento),
      calcularEdad(a.fecha_nacimiento),
      a.cedula,
      a.representante ? `${a.representante.nombres} ${a.representante.apellidos}` : ('-'),
      a.representante && a.representante.telefono ? `${a.representante.telefono}` : ('-')
    ]);
    doc.text(`Lista de Alumnos (Total: ${alumnosFiltrados.length})`, 14, 10);
    autoTable(doc, { head: [columns], body: rows, startY: 20 });
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
      setAlumnos(prev => prev.map(a => a._id === reactivarId ? { ...a, estado: 'Activo', dado_de_baja: false, activo: true } : a));
      setReactivarId(null);
      setReactivarSuccess({ open: true, message: data.message || 'Alumno reactivado y reingreso registrado' });
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

    return nombreApellidoMatch && fechaDesdeMatch && fechaHastaMatch && sexoMatch && categoriaMatch && tipoMensualidadMatch && estadoMatch;
  });
  const alumnosPaginados = alumnosFiltrados.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Lista de Alumnos</Typography>
          <Typography variant="body2" sx={{ color: '#94a3b8' }}>
            Gestion centralizada de estudiantes y categorias.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', width: { xs: '100%', md: 'auto' } }}>
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
            CSV
          </Button>
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
      <Box
        sx={{
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
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1, flexWrap: 'wrap' }}>
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
      <Box sx={{ display: 'none' }} />
      {loading ? (
        <Typography>Cargando...</Typography>
      ) : error ? (
        <Typography color="error">{error}</Typography>
      ) : isMobile ? (
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          {alumnosPaginados.map((alumno) => (
            <Paper
              key={alumno._id}
              sx={{
                p: 1.5,
                borderRadius: 3,
                border: '1px solid #eef0f3',
                boxShadow: '0 4px 12px rgba(15, 23, 42, 0.05)'
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 1.2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.2, minWidth: 0 }}>
                  <Avatar
                    src={mediaUrl(alumno.foto) || ''}
                    alt={alumno.nombres}
                    sx={{ width: 40, height: 40, bgcolor: '#e0ecff', color: '#2563eb', fontWeight: 700, flexShrink: 0 }}
                  >
                    {`${alumno.nombres?.[0] || ''}${alumno.apellidos?.[0] || ''}`.toUpperCase()}
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700, color: '#0f172a', lineHeight: 1.15 }} noWrap>
                      {alumno.nombres} {alumno.apellidos}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: '#94a3b8' }}>
                      Edad: {calcularEdad(alumno.fecha_nacimiento) || '-'}
                    </Typography>
                  </Box>
                </Box>
                <Tooltip
                  title={alumno.dado_de_baja || alumno.activo === false ? `Motivo: ${alumno.motivo_baja?.trim() || 'No especificado'}` : ''}
                  arrow
                >
                  <span>
                    <Chip
                      label={alumno.dado_de_baja || alumno.activo === false ? 'Retirado' : (alumno.estado || '-')}
                      size="small"
                      sx={{
                        bgcolor: alumno.dado_de_baja || alumno.activo === false ? '#fee2e2' : '#eef2ff',
                        color: alumno.dado_de_baja || alumno.activo === false ? '#b91c1c' : '#2563eb',
                        fontWeight: 700
                      }}
                    />
                  </span>
                </Tooltip>
              </Box>

              <Box sx={{ display: 'grid', gap: 0.4, mb: 1.1 }}>
                <Typography sx={{ fontSize: 12.5, color: '#475569' }}>
                  <strong>Sexo:</strong> {obtenerSexoAlumno(alumno)}
                </Typography>
                <Typography sx={{ fontSize: 12.5, color: '#475569' }}>
                  <strong>Categoría:</strong> {alumno.categoria || '-'}
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
                  <IconButton aria-label="ver" size="small" sx={{ color: '#64748b', bgcolor: '#f8fafc' }} onClick={() => navigate(`/alumno/${alumno._id}`)}>
                    <VisibilityIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Editar">
                  <IconButton aria-label="editar" size="small" sx={{ color: '#64748b', bgcolor: '#f8fafc' }} onClick={() => navigate(`/alumno/editar/${alumno._id}`)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                {!(alumno.dado_de_baja || alumno.activo === false) && (
                  <Tooltip title="Dar de baja">
                    <IconButton aria-label="dar de baja" size="small" sx={{ color: '#64748b', bgcolor: '#fff7ed' }} onClick={() => {
                      setBajaId(alumno._id);
                      setMotivoBaja('');
                    }}>
                      <PersonOffIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                {(alumno.dado_de_baja || alumno.activo === false) && (
                  <Tooltip title="Reactivar">
                    <IconButton aria-label="reactivar" size="small" sx={{ color: '#2e7d32', bgcolor: '#f0fdf4' }} onClick={() => openReactivarDialog(alumno)}>
                      <ReplayIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                <Tooltip title="Eliminar">
                  <IconButton aria-label="eliminar" size="small" sx={{ color: '#64748b', bgcolor: '#fff1f2' }} onClick={() => setDeleteId(alumno._id)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title={alumno.tiene_reposo_activo ? 'Gestionar reposos (activo)' : 'Gestionar reposos'}>
                  <IconButton
                    aria-label="gestionar reposos"
                    size="small"
                    sx={{
                      color: alumno.tiene_reposo_activo ? '#15803d' : '#64748b',
                      bgcolor: alumno.tiene_reposo_activo ? '#f0fdf4' : '#f8fafc'
                    }}
                    onClick={() => navigate(`/alumno/reposos/${alumno._id}`)}
                  >
                    <LocalHospitalIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
                {alumno.foto_cedula && (
                  <Tooltip title="Descargar cédula">
                    <IconButton
                      aria-label="descargar cédula"
                      size="small"
                      sx={{ color: '#64748b', bgcolor: '#f8fafc' }}
                      onClick={() => {
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
            />
          </Paper>
        </Box>
      ) : (
        <TableContainer
          component={Paper}
          sx={{
            borderRadius: 3,
            overflow: 'hidden',
            boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)'
          }}
        >
          <Table sx={{ minWidth: 780 }}>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f8fafc' }}>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>NOMBRE DEL ALUMNO</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>EDAD</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>SEXO</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>CATEGORÍA</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>TIPO DE MENSUALIDAD</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>ESTADO</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>REPRESENTANTE</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>ACCIONES</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {alumnosPaginados.map((alumno) => (
                <TableRow
                  key={alumno._id}
                  sx={{ '& td': { borderBottom: '1px solid #eef0f3', py: 2 }, '&:hover': { backgroundColor: '#fafafa' } }}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar
                        src={mediaUrl(alumno.foto) || ''}
                        alt={alumno.nombres}
                        sx={{ width: 38, height: 38, bgcolor: '#e0ecff', color: '#2563eb', fontWeight: 700 }}
                      >
                        {`${alumno.nombres?.[0] || ''}${alumno.apellidos?.[0] || ''}`.toUpperCase()}
                      </Avatar>
                      <Box>
                        <Typography sx={{ fontWeight: 700, color: '#0f172a', lineHeight: 1.1 }}>
                          {alumno.nombres} {alumno.apellidos}
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: '#94a3b8' }}>
                          Fecha Nac: {formatFecha(alumno.fecha_nacimiento) || '-'}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>{calcularEdad(alumno.fecha_nacimiento)}</TableCell>
                  <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>{obtenerSexoAlumno(alumno)}</TableCell>
                  <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>{alumno.categoria || '-'}</TableCell>
                  <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>
                    {obtenerTipoMensualidad(alumno)}
                  </TableCell>
                  <TableCell>
                    <Tooltip
                      title={alumno.dado_de_baja || alumno.activo === false ? `Motivo: ${alumno.motivo_baja?.trim() || 'No especificado'}` : ''}
                      arrow
                    >
                      <span>
                        <Chip
                          label={alumno.dado_de_baja || alumno.activo === false ? 'Retirado' : (alumno.estado || '-')}
                          size="small"
                          sx={{
                            bgcolor: alumno.dado_de_baja || alumno.activo === false ? '#fee2e2' : '#eef2ff',
                            color: alumno.dado_de_baja || alumno.activo === false ? '#b91c1c' : '#2563eb',
                            fontWeight: 700
                          }}
                        />
                      </span>
                    </Tooltip>
                  </TableCell>
                  <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>
                    {alumno.representante && typeof alumno.representante === 'object'
                      ? `${alumno.representante.nombres} ${alumno.representante.apellidos}`
                      : (alumno.representante || '-')}
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Ver detalles">
                      <IconButton aria-label="ver" size="small" sx={{ color: '#94a3b8', mr: 1 }} onClick={() => navigate(`/alumno/${alumno._id}`)}>
                        <VisibilityIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Editar">
                      <IconButton aria-label="editar" size="small" sx={{ color: '#94a3b8', mr: 1 }} onClick={() => navigate(`/alumno/editar/${alumno._id}`)}>
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    {!(alumno.dado_de_baja || alumno.activo === false) && (
                      <Tooltip title="Dar de baja">
                        <IconButton aria-label="dar de baja" size="small" sx={{ color: '#94a3b8', mr: 1 }} onClick={() => {
                          setBajaId(alumno._id);
                          setMotivoBaja('');
                        }}>
                          <PersonOffIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                    {(alumno.dado_de_baja || alumno.activo === false) && (
                      <Tooltip title="Reactivar">
                        <IconButton aria-label="reactivar" size="small" sx={{ color: '#2e7d32', mr: 1 }} onClick={() => openReactivarDialog(alumno)}>
                          <ReplayIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Eliminar">
                      <IconButton aria-label="eliminar" size="small" sx={{ color: '#94a3b8' }} onClick={() => setDeleteId(alumno._id)}>
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={alumno.tiene_reposo_activo ? 'Gestionar reposos (activo)' : 'Gestionar reposos'}>
                      <IconButton
                        aria-label="gestionar reposos"
                        size="small"
                        sx={{
                          color: alumno.tiene_reposo_activo ? '#15803d' : '#94a3b8',
                          ml: 1
                        }}
                        onClick={() => navigate(`/alumno/reposos/${alumno._id}`)}
                      >
                        <LocalHospitalIcon />
                      </IconButton>
                    </Tooltip>
                    {alumno.foto_cedula && (
                      <Tooltip title="Descargar cédula">
                        <IconButton
                          aria-label="descargar cédula"
                          size="small"
                          sx={{ color: '#94a3b8', ml: 1 }}
                          onClick={() => {
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
    </Box>
  );
}

export default TablaAlumnos;
