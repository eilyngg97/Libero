import React, { useCallback, useState, useEffect } from 'react';
import { Box, Typography, TextField, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, MenuItem } from '@mui/material';
import Snackbar from '@mui/material/Snackbar';
import MuiAlert from '@mui/material/Alert';
import { useParams } from 'react-router-dom';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import './GestionReposos.css';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import HistoryIcon from '@mui/icons-material/History';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CloseIcon from '@mui/icons-material/Close';
import NavigateBeforeIcon from '@mui/icons-material/NavigateBefore';
import NavigateNextIcon from '@mui/icons-material/NavigateNext';

const GestionReposos = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [reposos, setReposos] = useState([]);
  const [nuevoReposo, setNuevoReposo] = useState({
    fechaInicio: '',
    fechaFin: '',
    tipo: '',
    modalidadCobroParcial: 'Normal',
    montoParcialPersonalizado: '',
    motivo: '',
  });
  const [certificadosNuevos, setCertificadosNuevos] = useState([]);
  const inputCertificadoRef = React.useRef();
  const inputCertificadoEditRef = React.useRef();
  const { id } = useParams();
  const [studentName, setStudentName] = useState('');
  const [studentSede, setStudentSede] = useState('Sin sede');
  const [studentMontoBase, setStudentMontoBase] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [editandoReposo, setEditandoReposo] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [reposoAEliminar, setReposoAEliminar] = useState(null);
  const [confirmarEliminarOpen, setConfirmarEliminarOpen] = useState(false);
  const [eliminandoReposo, setEliminandoReposo] = useState(false);
  const [reposoAFinalizar, setReposoAFinalizar] = useState(null);
  const [confirmarFinalizarOpen, setConfirmarFinalizarOpen] = useState(false);
  const [fechaFinFinalizacion, setFechaFinFinalizacion] = useState('');
  const [finalizandoReposo, setFinalizandoReposo] = useState(false);
  const [notificacion, setNotificacion] = useState({ open: false, severity: 'success', message: '' });
  const [certificadoDialogOpen, setCertificadoDialogOpen] = useState(false);
  const [certificadoDialogItems, setCertificadoDialogItems] = useState([]);
  const [certificadoDialogIndex, setCertificadoDialogIndex] = useState(0);

  const formatFecha = (fecha) => {
    if (!fecha) return '';

    const raw = String(fecha).trim();
    const matchIso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (matchIso) {
      return `${matchIso[3]}/${matchIso[2]}/${matchIso[1]}`;
    }

    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-VE', { timeZone: 'UTC' });
  };

  const toInputDate = (fecha) => {
    if (!fecha) return '';
    const raw = String(fecha).trim();
    const matchIso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (matchIso) return `${matchIso[1]}-${matchIso[2]}-${matchIso[3]}`;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const getTodayInputDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatMonto = (value) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
    return Number(value).toFixed(2);
  };

  const getCertificadoUrl = (certificado) => {
    if (!certificado) return '';
    if (/^https?:\/\//i.test(certificado)) return certificado;
    return `${process.env.REACT_APP_API_URL}${certificado.startsWith('/') ? '' : '/'}${certificado}`;
  };

  const esImagenCertificado = (certificado) => {
    const url = getCertificadoUrl(certificado).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.webp', '.gif'].some((ext) => url.includes(ext));
  };

  const historialActionButtonSx = {
    color: '#6b7280',
    '&:hover': { bgcolor: '#e2e8f0', color: '#4b5563' }
  };

  const normalizarMensajeErrorReposo = (mensaje) => {
    const texto = String(mensaje || '').trim();
    if (!texto) return '';

    const key = texto.toLowerCase();
    if (
      key.includes('no se puede aplicar reposo') &&
      key.includes('pendiente o insolvente')
    ) {
      const partes = texto.split(':');
      const detalle = partes.length > 1 ? partes.slice(1).join(':').trim().replace(/\.$/, '') : '';
      const base = 'No se puede aplicar este reposo porque la mensualidad afectada debe estar en Pendiente o Insolvente.';
      return detalle ? `${base} Periodos bloqueados: ${detalle}.` : base;
    }

    return texto;
  };

  const esBloqueoNegocioReposo = (mensaje) => {
    const key = String(mensaje || '').toLowerCase();
    return (
      key.includes('no se puede aplicar este reposo') ||
      (key.includes('no se puede aplicar reposo') && key.includes('pendiente o insolvente'))
    );
  };

  const normalizarCertificados = (reposo = {}) => {
    const lista = [];
    if (Array.isArray(reposo?.certificados)) {
      lista.push(...reposo.certificados);
    }
    if (reposo?.certificado) {
      lista.push(reposo.certificado);
    }
    return Array.from(new Set(lista.filter((item) => String(item || '').trim() !== '')));
  };

  const abrirCertificadoDialog = (certificados = []) => {
    const items = certificados
      .map((item) => {
        const url = getCertificadoUrl(item);
        if (!url) return null;
        return {
          original: item,
          url,
          esImagen: esImagenCertificado(item)
        };
      })
      .filter(Boolean);

    if (items.length === 0) return;
    setCertificadoDialogItems(items);
    setCertificadoDialogIndex(0);
    setCertificadoDialogOpen(true);
  };

  const cargarReposos = useCallback(async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/${id}/reposos`);
      if (!response.ok) throw new Error('Error al obtener reposos');
      const data = await response.json();
      setReposos(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setReposos([]);
    }
  }, [id]);

  useEffect(() => {
    // Fetch student data based on the ID from the URL
    const fetchStudentName = async () => {
      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/${id}`);
        if (!response.ok) throw new Error('Error al obtener datos del estudiante');
        const data = await response.json();
        setStudentName(`${data.nombres} ${data.apellidos}`);

        const sedeNombre = data?.sede?.nombre || 'Sin sede';
        setStudentSede(sedeNombre);

        const tipoMensualidad = String(data?.tipo_mensualidad || '').toLowerCase();
        let montoBase = 0;
        if (tipoMensualidad === 'monto_personalizado') {
          montoBase = Number(data?.monto_personalizado_valor || 0);
        } else if (tipoMensualidad === 'beca_completa') {
          montoBase = 0;
        } else {
          montoBase = Number(data?.sede?.costo || 0);
        }
        setStudentMontoBase(montoBase);
      } catch (error) {
        console.error(error);
      }
    };

    fetchStudentName();
    cargarReposos();
  }, [id, cargarReposos]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === 'modalidadCobroParcial') {
      setNuevoReposo({
        ...nuevoReposo,
        modalidadCobroParcial: value,
        montoParcialPersonalizado: value === 'Prorrateado' ? nuevoReposo.montoParcialPersonalizado : ''
      });
      return;
    }

    setNuevoReposo({ ...nuevoReposo, [name]: value });
  };

  const handleGuardarReposo = async () => {
    if (!nuevoReposo.fechaInicio || !nuevoReposo.tipo) {
      setNotificacion({ open: true, severity: 'warning', message: 'Debes indicar Fecha Inicio y Tipo de reposo.' });
      return;
    }

    if (
      nuevoReposo.tipo === 'Parcial' &&
      nuevoReposo.modalidadCobroParcial === 'Prorrateado' &&
      String(nuevoReposo.montoParcialPersonalizado || '').trim() === ''
    ) {
      setNotificacion({ open: true, severity: 'warning', message: 'Debes indicar manualmente el monto final para el prorrateo parcial.' });
      return;
    }

    try {
      setGuardando(true);
      const formData = new FormData();
      formData.append('fecha_inicio', nuevoReposo.fechaInicio);
      if (nuevoReposo.fechaFin) formData.append('fecha_fin', nuevoReposo.fechaFin);
      formData.append('tipo', nuevoReposo.tipo);
      if (nuevoReposo.tipo === 'Parcial') {
        formData.append('modalidad_cobro_parcial', nuevoReposo.modalidadCobroParcial || 'Normal');
        if (nuevoReposo.modalidadCobroParcial === 'Prorrateado' && String(nuevoReposo.montoParcialPersonalizado || '').trim() !== '') {
          formData.append('monto_parcial_personalizado', nuevoReposo.montoParcialPersonalizado);
        }
      }
      if (nuevoReposo.motivo) formData.append('motivo', nuevoReposo.motivo);
      certificadosNuevos.forEach((archivo) => {
        formData.append('certificados', archivo);
      });

      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/${id}/reposos`, {
        method: 'POST',
        body: formData
      });

      let data = {};
      try {
        data = await response.json();
      } catch {
        data = {};
      }
      if (!response.ok) {
        throw new Error(
          normalizarMensajeErrorReposo(data.error || data.message || 'Error al guardar reposo')
        );
      }

      setNuevoReposo({
        fechaInicio: '',
        fechaFin: '',
        tipo: '',
        modalidadCobroParcial: 'Normal',
        montoParcialPersonalizado: '',
        motivo: '',
      });
      setTipoReposo('');
      setCertificadosNuevos([]);

      await cargarReposos();

      setNotificacion({ open: true, severity: 'success', message: 'Reposo guardado correctamente.' });
    } catch (error) {
      const mensaje = error.message || 'No se pudo guardar el reposo';
      setNotificacion({
        open: true,
        severity: esBloqueoNegocioReposo(mensaje) ? 'warning' : 'error',
        message: mensaje
      });
    } finally {
      setGuardando(false);
    }
  };

   const handleClickCertificado = () => {
    inputCertificadoRef.current.click();
  };
  
  const handleFotoCertificadoChange = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setCertificadosNuevos((prev) => [...prev, ...files]);
    e.target.value = '';
  };

  const quitarCertificadoNuevo = (index) => {
    setCertificadosNuevos((prev) => prev.filter((_, i) => i !== index));
  };

  const [tipoReposo, setTipoReposo] = useState('');

  const handleTipoReposoChange = (event, newTipo) => {
    if (newTipo !== null) {
      setTipoReposo(newTipo);
      setNuevoReposo((prev) => ({
        ...prev,
        tipo: newTipo,
        fechaFin: newTipo === 'Indefinido' ? '' : prev.fechaFin,
        modalidadCobroParcial: newTipo === 'Parcial' ? (prev.modalidadCobroParcial || 'Normal') : 'Normal',
        montoParcialPersonalizado: newTipo === 'Parcial' ? prev.montoParcialPersonalizado : ''
      }));
    }
  };

  const abrirEdicionReposo = (reposo) => {
    const certificadosExistentes = normalizarCertificados(reposo);
    setEditandoReposo({
      _id: reposo._id,
      fechaInicio: toInputDate(reposo.fecha_inicio),
      fechaFin: toInputDate(reposo.fecha_fin),
      tipo: reposo.tipo || '',
      modalidadCobroParcial: reposo.modalidad_cobro_parcial || 'Normal',
      montoParcialPersonalizado: reposo.monto_parcial_personalizado !== null && reposo.monto_parcial_personalizado !== undefined
        ? String(reposo.monto_parcial_personalizado)
        : '',
      motivo: reposo.motivo || '',
      estado: reposo.estado || 'Activo',
      certificadosExistentes,
      certificadosAEliminar: [],
      nuevosCertificados: []
    });
    setEditDialogOpen(true);
  };

  const guardarEdicionReposo = async () => {
    if (!editandoReposo?._id) return;
    if (!editandoReposo.fechaInicio || !editandoReposo.tipo) {
      setNotificacion({ open: true, severity: 'warning', message: 'Fecha inicio y tipo son obligatorios.' });
      return;
    }
    if (editandoReposo.estado === 'Finalizado' && !editandoReposo.fechaFin) {
      setNotificacion({ open: true, severity: 'warning', message: 'Debes indicar la fecha de finalización del reposo.' });
      return;
    }
    if (
      editandoReposo.tipo === 'Parcial' &&
      editandoReposo.modalidadCobroParcial === 'Prorrateado' &&
      String(editandoReposo.montoParcialPersonalizado || '').trim() === ''
    ) {
      setNotificacion({ open: true, severity: 'warning', message: 'Debes indicar manualmente el monto final para el prorrateo parcial.' });
      return;
    }

    try {
      setGuardandoEdicion(true);
      const formData = new FormData();
      formData.append('fecha_inicio', editandoReposo.fechaInicio);
      formData.append('fecha_fin', editandoReposo.fechaFin || '');
      formData.append('tipo', editandoReposo.tipo);
      formData.append('modalidad_cobro_parcial', editandoReposo.tipo === 'Parcial' ? (editandoReposo.modalidadCobroParcial || 'Normal') : 'Normal');
      formData.append(
        'monto_parcial_personalizado',
        editandoReposo.tipo === 'Parcial' && editandoReposo.modalidadCobroParcial === 'Prorrateado' && String(editandoReposo.montoParcialPersonalizado || '').trim() !== ''
          ? String(Number(editandoReposo.montoParcialPersonalizado))
          : ''
      );
      formData.append('motivo', editandoReposo.motivo || '');
      formData.append('estado', editandoReposo.estado || 'Activo');
      if (Array.isArray(editandoReposo.certificadosAEliminar) && editandoReposo.certificadosAEliminar.length > 0) {
        formData.append('eliminar_certificados', JSON.stringify(editandoReposo.certificadosAEliminar));
      }
      (editandoReposo.nuevosCertificados || []).forEach((archivo) => {
        formData.append('certificados', archivo);
      });

      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/${id}/reposos/${editandoReposo._id}`, {
        method: 'PATCH',
        body: formData
      });
      let data = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (!res.ok) {
        throw new Error(
          normalizarMensajeErrorReposo(data?.error || data?.message || 'No se pudo actualizar el reposo')
        );
      }

      setEditDialogOpen(false);
      setEditandoReposo(null);
      await cargarReposos();
      setNotificacion({ open: true, severity: 'success', message: 'Reposo actualizado correctamente.' });
    } catch (error) {
      const mensaje = error.message || 'No se pudo actualizar el reposo';
      setNotificacion({
        open: true,
        severity: esBloqueoNegocioReposo(mensaje) ? 'warning' : 'error',
        message: mensaje
      });
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const solicitarEliminarReposo = (reposo) => {
    if (!reposo?._id) return;
    setReposoAEliminar(reposo);
    setConfirmarEliminarOpen(true);
  };

  const solicitarFinalizarReposo = (reposo) => {
    if (!reposo?._id) return;
    setReposoAFinalizar(reposo);
    setFechaFinFinalizacion(getTodayInputDate());
    setConfirmarFinalizarOpen(true);
  };

  const finalizarReposo = async () => {
    if (!reposoAFinalizar?._id) return;
    if (!fechaFinFinalizacion) {
      setNotificacion({ open: true, severity: 'warning', message: 'Debes indicar la fecha de finalización.' });
      return;
    }

    try {
      setFinalizandoReposo(true);
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/${id}/reposos/${reposoAFinalizar._id}/finalizar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha_fin: fechaFinFinalizacion })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudo finalizar el reposo');

      setConfirmarFinalizarOpen(false);
      setReposoAFinalizar(null);
      setFechaFinFinalizacion('');
      await cargarReposos();
      setNotificacion({ open: true, severity: 'success', message: 'Reposo finalizado correctamente.' });
    } catch (error) {
      setNotificacion({ open: true, severity: 'error', message: error.message || 'No se pudo finalizar el reposo' });
    } finally {
      setFinalizandoReposo(false);
    }
  };

  const eliminarReposo = async () => {
    if (!reposoAEliminar?._id) return;

    try {
      setEliminandoReposo(true);
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/${id}/reposos/${reposoAEliminar._id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudo eliminar el reposo');

      setConfirmarEliminarOpen(false);
      setReposoAEliminar(null);
      await cargarReposos();
      setNotificacion({ open: true, severity: 'success', message: 'Reposo eliminado correctamente.' });
    } catch (error) {
      setNotificacion({ open: true, severity: 'error', message: error.message || 'No se pudo eliminar el reposo' });
    } finally {
      setEliminandoReposo(false);
    }
  };

  const agregarCertificadosEdicion = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setEditandoReposo((prev) => ({
      ...prev,
      nuevosCertificados: [...(prev?.nuevosCertificados || []), ...files]
    }));
    e.target.value = '';
  };

  const quitarCertificadoNuevoEdicion = (index) => {
    setEditandoReposo((prev) => ({
      ...prev,
      nuevosCertificados: (prev?.nuevosCertificados || []).filter((_, i) => i !== index)
    }));
  };

  const marcarEliminarCertificadoExistente = (url) => {
    setEditandoReposo((prev) => {
      const existentes = (prev?.certificadosExistentes || []).filter((item) => item !== url);
      const aEliminar = Array.from(new Set([...(prev?.certificadosAEliminar || []), url]));
      return {
        ...prev,
        certificadosExistentes: existentes,
        certificadosAEliminar: aEliminar
      };
    });
  };

  return (
    <Box sx={{ p: { xs: 1.25, sm: 2, md: 3 }, borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)', width: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>Gestión de Reposos Médicos</Typography>
      <Box sx={{ mt: 0.5, mb: 1.5 }}>
        <Typography sx={{ fontSize: 15 }}>
          Alumno: <strong>{studentName}</strong>
        </Typography>
        <Typography sx={{ fontSize: 13, color: '#475569' }}>
          Sede: {studentSede} | Monto base: ${formatMonto(studentMontoBase)} USD
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: { xs: 1.5, md: 4 }, mb: 4, mt: 2, width: '100%', minWidth: 0 }}>
        <Box sx={{ flex: 1, backgroundColor: '#ffffff', p: { xs: 1.5, sm: 2.25, md: 3 }, borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)', minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <AddCircleOutlineIcon sx={{ color: '#0284c7', mr: 1 }} />
            <Typography variant="h6">Registrar Nuevo Reposo</Typography>
          </Box>
          <TextField
            label="Fecha Inicio"
            type="date"
            name="fechaInicio"
            value={nuevoReposo.fechaInicio}
            onChange={handleInputChange}
            fullWidth
            InputLabelProps={{ shrink: true }}
            sx={{ mb: 2 }}
          />
          <TextField
            label="Fecha Fin"
            type="date"
            name="fechaFin"
            value={nuevoReposo.fechaFin}
            onChange={handleInputChange}
            fullWidth
            InputLabelProps={{ shrink: true }}
            disabled={tipoReposo === 'Indefinido'}
            helperText={tipoReposo === 'Indefinido' ? 'Se definirá cuando se finalice el reposo.' : ''}
            sx={{ mb: 2 }}
          />
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', mb: 0.5 }}>TIPO DE REPOSO</Typography>
          <ToggleButtonGroup
            value={tipoReposo}
            exclusive
            onChange={handleTipoReposoChange}
            sx={{ mb: 2, width: '100%', display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr' }, gap: 1 }}
          >
            <ToggleButton value="Parcial" sx={{ textTransform: 'none', fontWeight: 700, borderColor: '#e2e8f0', '&.Mui-selected': { bgcolor: '#e0f2fe', color: '#0284c7' }, width: '100%' }}>
              Parcial
            </ToggleButton>
            <ToggleButton value="Total" sx={{ textTransform: 'none', fontWeight: 700, borderColor: '#e2e8f0', '&.Mui-selected': { bgcolor: '#e0f2fe', color: '#0284c7' }, width: '100%' }}>
              Total
            </ToggleButton>
            <ToggleButton value="Indefinido" sx={{ textTransform: 'none', fontWeight: 700, borderColor: '#e2e8f0', '&.Mui-selected': { bgcolor: '#e0f2fe', color: '#0284c7' }, width: '100%' }}>
              Indefinido
            </ToggleButton>
          </ToggleButtonGroup>
          {tipoReposo === 'Parcial' && (
            <>
              <TextField
                select
                label="Cobro en reposo parcial"
                name="modalidadCobroParcial"
                value={nuevoReposo.modalidadCobroParcial || 'Normal'}
                onChange={handleInputChange}
                fullWidth
                sx={{ mb: 1 }}
                helperText="Selecciona si se cobra el mes completo o proporcional a los días activos del mes."
              >
                <MenuItem value="Normal">Cobro normal</MenuItem>
                <MenuItem value="Prorrateado">Aplicar prorrateo</MenuItem>
              </TextField>
              <Typography sx={{ fontSize: 12, color: '#64748b', mb: 2 }}>
                Prorrateo manual: la administración define el monto final según su criterio de negocio.
              </Typography>
              {nuevoReposo.modalidadCobroParcial === 'Prorrateado' && (
                <TextField
                  label="Monto final a cobrar (USD)"
                  name="montoParcialPersonalizado"
                  type="number"
                  value={nuevoReposo.montoParcialPersonalizado || ''}
                  onChange={handleInputChange}
                  fullWidth
                  inputProps={{ min: 0, step: '0.01' }}
                  helperText="Monto manual obligatorio para aplicar el prorrateo parcial."
                  FormHelperTextProps={{ sx: { color: '#6b7280', '&.Mui-focused': { color: '#6b7280' } } }}
                  sx={{ mb: 2 }}
                />
              )}
            </>
          )}
          <TextField
            label="Motivo / Diagnóstico"
            name="motivo"
            value={nuevoReposo.motivo}
            onChange={handleInputChange}
            fullWidth
            multiline
            rows={3}
            sx={{ mb: 2 }}
          />
          <Paper sx={{ p: 2.5, borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', letterSpacing: '0.04em', mb: 1 }}>
                          REPOSO MEDICO
                        </Typography>
                        <Box
                          onClick={handleClickCertificado}
                          sx={{
                            border: '1.5px dashed #cbd5f5',
                            borderRadius: 2.5,
                            bgcolor: '#f8fafc',
                            px: 2,
                            py: 2.5,
                            textAlign: 'center',
                            cursor: 'pointer'
                          }}
                        >
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            multiple
                            onChange={handleFotoCertificadoChange}
                            ref={inputCertificadoRef}
                            style={{ display: 'none' }}
                          />
                          {certificadosNuevos.length > 0 ? (
                            <Box sx={{ display: 'grid', gap: 0.6 }}>
                              <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                                {certificadosNuevos.length} archivo(s) seleccionado(s)
                              </Typography>
                              <Typography sx={{ fontSize: 11, color: '#64748b' }}>
                                Puedes agregar mas archivos con el boton de abajo.
                              </Typography>
                              {certificadosNuevos.map((archivo, index) => (
                                <Box key={`${archivo.name}-${index}`} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, bgcolor: '#fff', border: '1px solid #e2e8f0', borderRadius: 1.5, px: 1, py: 0.5, minWidth: 0 }}>
                                  <Typography sx={{ fontSize: 12, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: { xs: 150, sm: 180 } }}>
                                    {archivo.name}
                                  </Typography>
                                  <IconButton
                                    size="small"
                                    onClick={(ev) => { ev.stopPropagation(); quitarCertificadoNuevo(index); }}
                                    sx={{ color: '#6b7280', '&:hover': { bgcolor: '#f3f4f6', color: '#4b5563' } }}
                                  >
                                    <CloseIcon fontSize="small" />
                                  </IconButton>
                                </Box>
                              ))}
                            </Box>
                          ) : (
                            <Box sx={{ display: 'grid', gap: 0.5 }}>
                              <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Adjunta certificados del reposo médico</Typography>
                              <Typography sx={{ fontSize: 11, color: '#94a3b8' }}>JPG, PNG o PDF (puedes seleccionar varios)</Typography>
                            </Box>
                          )}
                        </Box>
                        <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={handleClickCertificado}
                            sx={{ textTransform: 'none', color: '#6b7280', borderColor: '#d1d5db', '&:hover': { borderColor: '#9ca3af', bgcolor: '#f9fafb' } }}
                          >
                            Agregar otro archivo
                          </Button>
                        </Box>
                      </Paper>
          <Button
            type='button'
            className='save-reposo'
            onClick={handleGuardarReposo}
            disabled={guardando}
            sx={{
              width: '100%',
              mt: 2,
              py: 1.5,
              fontWeight: 700,
              color: '#fff',
              bgcolor: '#1e293b',
              '&:hover': {
                color: '#fff',
                bgcolor: '#334155'
              }
            }}
          >
            {guardando ? 'Guardando...' : 'Guardar Reposo'}
          </Button>
        </Box>
        <Box sx={{ flex: 2, backgroundColor: '#ffffff', p: { xs: 1.5, sm: 2.25, md: 3 }, borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)', minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <HistoryIcon sx={{ color: '#0284c7', mr: 1 }} />
            <Typography variant="h6">Historial de Reposos</Typography>
          </Box>
          {!isMobile ? (
          <TableContainer component={Paper} sx={{ mt: 2, overflowX: 'auto' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Periodo</TableCell>
                  <TableCell>Monto prorrateo</TableCell>
                  <TableCell sx={{ width: 240 }}>Diagnóstico</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell align="right" sx={{ width: 170, whiteSpace: 'nowrap' }}>Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reposos.map((reposo, index) => (
                  <TableRow key={reposo._id || index}>
                    <TableCell>
                      {reposo.tipo === 'Parcial'
                        ? `${reposo.tipo} (${reposo.modalidad_cobro_parcial === 'Prorrateado' ? 'Prorrateado' : 'Normal'})`
                        : reposo.tipo}
                    </TableCell>
                    <TableCell>{formatFecha(reposo.fecha_inicio)} - {reposo.fecha_fin ? formatFecha(reposo.fecha_fin) : 'Indefinido'}</TableCell>
                    <TableCell>
                      {reposo.tipo === 'Parcial' && reposo.modalidad_cobro_parcial === 'Prorrateado' && reposo.monto_parcial_personalizado !== null && reposo.monto_parcial_personalizado !== undefined
                        ? `$${formatMonto(reposo.monto_parcial_personalizado)} USD`
                        : '-'}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 240, width: 240 }}>
                      <Typography
                        component="span"
                        title={reposo.motivo || ''}
                        sx={{
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {reposo.motivo || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>{reposo.estado}</TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.3, flexWrap: 'nowrap' }}>
                        {reposo.tipo === 'Indefinido' && reposo.estado === 'Activo' && (
                          <IconButton size="small" sx={historialActionButtonSx} onClick={() => solicitarFinalizarReposo(reposo)}>
                            <TaskAltOutlinedIcon fontSize="small" />
                          </IconButton>
                        )}
                        {normalizarCertificados(reposo).length > 0 && (
                          <IconButton size="small" sx={historialActionButtonSx} onClick={() => abrirCertificadoDialog(normalizarCertificados(reposo))}>
                            <InsertDriveFileIcon fontSize="small" />
                          </IconButton>
                        )}
                        <IconButton size="small" sx={historialActionButtonSx} onClick={() => abrirEdicionReposo(reposo)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" sx={historialActionButtonSx} onClick={() => solicitarEliminarReposo(reposo)}>
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          ) : (
            <Box sx={{ mt: 1.5, display: 'grid', gap: 1 }}>
              {reposos.map((reposo, index) => {
                const certificados = normalizarCertificados(reposo);
                return (
                  <Paper key={reposo._id || index} sx={{ p: 1.25, borderRadius: 2, border: '1px solid #e2e8f0' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
                      <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>
                        {reposo.tipo === 'Parcial'
                          ? `${reposo.tipo} (${reposo.modalidad_cobro_parcial === 'Prorrateado' ? 'Prorrateado' : 'Normal'})`
                          : reposo.tipo}
                      </Typography>
                      <Typography sx={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>
                        {reposo.estado}
                      </Typography>
                    </Box>
                    <Typography sx={{ mt: 0.7, fontSize: 12, color: '#334155' }}>
                      Periodo: {formatFecha(reposo.fecha_inicio)} - {reposo.fecha_fin ? formatFecha(reposo.fecha_fin) : 'Indefinido'}
                    </Typography>
                    <Typography sx={{ mt: 0.4, fontSize: 12, color: '#334155' }}>
                      Monto prorrateo: {reposo.tipo === 'Parcial' && reposo.modalidad_cobro_parcial === 'Prorrateado' && reposo.monto_parcial_personalizado !== null && reposo.monto_parcial_personalizado !== undefined
                        ? `$${formatMonto(reposo.monto_parcial_personalizado)} USD`
                        : '-'}
                    </Typography>
                    <Typography sx={{ mt: 0.4, fontSize: 12, color: '#334155', wordBreak: 'break-word' }}>
                      Diagnóstico: {reposo.motivo || '-'}
                    </Typography>
                    <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 0.4, flexWrap: 'wrap' }}>
                      {reposo.tipo === 'Indefinido' && reposo.estado === 'Activo' && (
                        <IconButton size="small" sx={historialActionButtonSx} onClick={() => solicitarFinalizarReposo(reposo)}>
                          <TaskAltOutlinedIcon fontSize="small" />
                        </IconButton>
                      )}
                      {certificados.length > 0 && (
                        <IconButton size="small" sx={historialActionButtonSx} onClick={() => abrirCertificadoDialog(certificados)}>
                          <InsertDriveFileIcon fontSize="small" />
                        </IconButton>
                      )}
                      <IconButton size="small" sx={historialActionButtonSx} onClick={() => abrirEdicionReposo(reposo)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" sx={historialActionButtonSx} onClick={() => solicitarEliminarReposo(reposo)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Paper>
                );
              })}
            </Box>
          )}
          <Box sx={{ mt: 3, p: 2, backgroundColor: '#fdfdfd', borderRadius: 2, border: '1px solid #cbd5e1', display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        <InfoOutlinedIcon sx={{ color: '#2563eb' }} />
        <Typography sx={{ fontSize: { xs: 12.5, sm: 14 }, color: '#1e293b', fontWeight: 500 }}>
          <strong>Información importante</strong>: Los reposos médicos deben ser validados por la coordinación deportiva antes de ser efectivos.
        </Typography>
      </Box>
        </Box>
      </Box>
      <Snackbar
        open={notificacion.open}
        autoHideDuration={3000}
        onClose={() => setNotificacion(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <MuiAlert
          onClose={() => setNotificacion(prev => ({ ...prev, open: false }))}
          severity={notificacion.severity}
          sx={{ width: '100%' }}
        >
          {notificacion.message}
        </MuiAlert>
      </Snackbar>

      <Dialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2.5, overflow: 'hidden' } }}
      >
        <DialogTitle sx={{ px: { xs: 2, sm: 3 }, py: 2, borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: { xs: 20, sm: 26 }, fontWeight: 800, color: '#111827' }}>Editar reposo</Typography>
          <IconButton onClick={() => setEditDialogOpen(false)} size="small" sx={{ color: '#9ca3af' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: '16px !important', px: { xs: 2, sm: 3 }, pb: 2, bgcolor: '#f9f9f9fc' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
            <Box sx={{ display: 'grid', gap: 2 }}>
              <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid #e5e7eb', boxShadow: 'none' }}>
                <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#4b5563', mb: 1.5 }}>Periodo de Reposo</Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.6 }}>
                  <TextField
                    label="Fecha Inicio"
                    type="date"
                    value={editandoReposo?.fechaInicio || ''}
                    onChange={(e) => setEditandoReposo((prev) => ({ ...prev, fechaInicio: e.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    fullWidth
                    size="small"
                    sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#fff' } }}
                  />
                  <TextField
                    label="Fecha Fin"
                    type="date"
                    value={editandoReposo?.fechaFin || ''}
                    onChange={(e) => setEditandoReposo((prev) => ({ ...prev, fechaFin: e.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    disabled={editandoReposo?.tipo === 'Indefinido' && editandoReposo?.estado !== 'Finalizado'}
                    fullWidth
                    size="small"
                    sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#fff' } }}
                  />
                </Box>
                {editandoReposo?.tipo === 'Indefinido' && editandoReposo?.estado !== 'Finalizado' && (
                  <Typography sx={{ fontSize: 11, color: '#6b7280', mt: 1 }}>
                    Usa la accion de finalizar para cerrar un reposo indefinido.
                  </Typography>
                )}
              </Paper>

              <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid #e5e7eb', boxShadow: 'none' }}>
                <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#4b5563', mb: 1.5 }}>Detalles Administrativos</Typography>
                <Box sx={{ display: 'grid', gap: 1.6 }}>
                  <TextField
                    select
                    label="Tipo de Reposo"
                    value={editandoReposo?.tipo || ''}
                    onChange={(e) => setEditandoReposo((prev) => ({
                      ...prev,
                      tipo: e.target.value,
                      modalidadCobroParcial: e.target.value === 'Parcial' ? (prev?.modalidadCobroParcial || 'Normal') : 'Normal',
                      montoParcialPersonalizado: e.target.value === 'Parcial' ? (prev?.montoParcialPersonalizado || '') : ''
                    }))}
                    fullWidth
                    size="small"
                    sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#fff' } }}
                  >
                    {['Parcial', 'Total', 'Indefinido'].map((tipo) => (
                      <MenuItem key={tipo} value={tipo}>{tipo}</MenuItem>
                    ))}
                  </TextField>

                  {editandoReposo?.tipo === 'Parcial' && (
                    <>
                      <TextField
                        select
                        label="Cobro en reposo parcial"
                        value={editandoReposo?.modalidadCobroParcial || 'Normal'}
                        onChange={(e) => setEditandoReposo((prev) => ({
                          ...prev,
                          modalidadCobroParcial: e.target.value,
                          montoParcialPersonalizado: e.target.value === 'Prorrateado' ? (prev?.montoParcialPersonalizado || '') : ''
                        }))}
                        fullWidth
                        size="small"
                        sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#fff' } }}
                      >
                        <MenuItem value="Normal">Cobro normal</MenuItem>
                        <MenuItem value="Prorrateado">Aplicar prorrateo</MenuItem>
                      </TextField>
                      <Typography sx={{ fontSize: 11, color: '#6b7280', lineHeight: 1.3 }}>
                        Prorrateo manual: la administracion define el monto final segun su criterio de negocio.
                      </Typography>
                      {editandoReposo?.modalidadCobroParcial === 'Prorrateado' && (
                        <TextField
                          label="Monto final a cobrar (USD)"
                          type="number"
                          value={editandoReposo?.montoParcialPersonalizado || ''}
                          onChange={(e) => setEditandoReposo((prev) => ({ ...prev, montoParcialPersonalizado: e.target.value }))}
                          fullWidth
                          size="small"
                          inputProps={{ min: 0, step: '0.01' }}
                          helperText="Monto manual obligatorio para aplicar el prorrateo parcial."
                          FormHelperTextProps={{ sx: { color: '#6b7280', '&.Mui-focused': { color: '#6b7280' } } }}
                          sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#fff' } }}
                        />
                      )}
                    </>
                  )}

                  <TextField
                    select
                    label="Estado"
                    value={editandoReposo?.estado || 'Activo'}
                    onChange={(e) => setEditandoReposo((prev) => ({ ...prev, estado: e.target.value }))}
                    fullWidth
                    size="small"
                    sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#fff' } }}
                  >
                    {['Activo', 'Inactivo', 'Finalizado'].map((estado) => (
                      <MenuItem key={estado} value={estado}>{estado}</MenuItem>
                    ))}
                  </TextField>
                </Box>
              </Paper>
            </Box>

            <Box sx={{ display: 'grid', gap: 2, alignContent: 'start' }}>
              <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid #e5e7eb', boxShadow: 'none' }}>
                <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#4b5563', mb: 1.5 }}>Motivo / Diagnostico</Typography>
                <TextField
                  multiline
                  rows={4}
                  value={editandoReposo?.motivo || ''}
                  onChange={(e) => setEditandoReposo((prev) => ({ ...prev, motivo: e.target.value }))}
                  fullWidth
                  placeholder="Describe brevemente el diagnostico"
                  sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#fff' } }}
                />
              </Paper>

              <Paper sx={{ p: 2, borderRadius: 2, border: '1px solid #e5e7eb', boxShadow: 'none' }}>
                <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#4b5563', mb: 1.5 }}>Certificados del reposo</Typography>

                {(editandoReposo?.certificadosExistentes || []).length > 0 && (
                  <Box sx={{ display: 'grid', gap: 0.8, mb: 1 }}>
                    {(editandoReposo?.certificadosExistentes || []).map((url, index) => (
                      <Box key={`${url}-${index}`} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, border: '1px solid #e5e7eb', borderRadius: 1.5, px: 1.2, py: 0.7, bgcolor: '#fff', minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                          <InsertDriveFileIcon sx={{ fontSize: 18, color: '#2563eb' }} />
                          <Box sx={{ minWidth: 0 }}>
                            <Button size="small" variant="text" sx={{ textTransform: 'none', px: 0, minWidth: 0, fontWeight: 700 }} onClick={() => abrirCertificadoDialog([url])}>
                              {esImagenCertificado(url) ? `Ver imagen_${index + 1}` : `Ver archivo_${index + 1}`}
                            </Button>
                            <Typography sx={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.1 }}>
                              Adjuntado el {formatFecha(editandoReposo?.fechaInicio) || '-'}
                            </Typography>
                          </Box>
                        </Box>
                        <IconButton
                          size="small"
                          onClick={() => marcarEliminarCertificadoExistente(url)}
                          sx={{ color: '#6b7280', '&:hover': { bgcolor: '#f3f4f6', color: '#4b5563' } }}
                        >
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    ))}
                  </Box>
                )}

                {(editandoReposo?.nuevosCertificados || []).length > 0 && (
                  <Box sx={{ display: 'grid', gap: 0.8, mb: 1 }}>
                    {(editandoReposo?.nuevosCertificados || []).map((archivo, index) => (
                      <Box key={`${archivo.name}-${index}`} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, border: '1px solid #e5e7eb', borderRadius: 1.5, px: 1.2, py: 0.7, bgcolor: '#fff', minWidth: 0 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                          <InsertDriveFileIcon sx={{ fontSize: 18, color: '#2563eb' }} />
                          <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontSize: 12, color: '#334155', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: { xs: 155, sm: 190 } }}>
                              {archivo.name}
                            </Typography>
                            <Typography sx={{ fontSize: 11, color: '#9ca3af', lineHeight: 1.1 }}>
                              Pendiente por guardar
                            </Typography>
                          </Box>
                        </Box>
                        <IconButton
                          size="small"
                          onClick={() => quitarCertificadoNuevoEdicion(index)}
                          sx={{ color: '#6b7280', '&:hover': { bgcolor: '#f3f4f6', color: '#4b5563' } }}
                        >
                          <CloseIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    ))}
                  </Box>
                )}

                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => inputCertificadoEditRef.current?.click()}
                  startIcon={<InsertDriveFileIcon sx={{ fontSize: 16 }} />}
                  sx={{ textTransform: 'none', color: '#6b7280', borderColor: '#d1d5db', '&:hover': { borderColor: '#9ca3af', bgcolor: '#f9fafb' } }}
                >
                  Agregar certificados
                </Button>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  multiple
                  onChange={agregarCertificadosEdicion}
                  ref={inputCertificadoEditRef}
                  style={{ display: 'none' }}
                />
              </Paper>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 2, borderTop: '1px solid #e5e7eb', bgcolor: '#fff', flexWrap: 'wrap', gap: 1 }}>
          <Button onClick={() => setEditDialogOpen(false)} sx={{ textTransform: 'none', color: '#6b7280' }}>Cancelar</Button>
          <Button onClick={guardarEdicionReposo} variant="contained" disabled={guardandoEdicion} sx={{ textTransform: 'none', px: 2.2, borderRadius: 2 }}>
            {guardandoEdicion ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={certificadoDialogOpen}
        onClose={() => {
          setCertificadoDialogOpen(false);
          setCertificadoDialogItems([]);
          setCertificadoDialogIndex(0);
        }}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Reposo medico
          <IconButton
            onClick={() => {
              setCertificadoDialogOpen(false);
              setCertificadoDialogItems([]);
              setCertificadoDialogIndex(0);
            }}
            size="small"
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 1.5 }}>
          {certificadoDialogItems.length > 0 ? (
            <>
              <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', color: '#64748b', flexDirection: { xs: 'column', sm: 'row' }, gap: 1 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 700 }}>
                  Archivo {certificadoDialogIndex + 1} de {certificadoDialogItems.length}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, width: { xs: '100%', sm: 'auto' } }}>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<NavigateBeforeIcon />}
                    onClick={() => setCertificadoDialogIndex((prev) => (prev === 0 ? certificadoDialogItems.length - 1 : prev - 1))}
                    sx={{ textTransform: 'none', color: '#475569', borderColor: '#cbd5e1', '&:hover': { borderColor: '#94a3b8', bgcolor: '#f8fafc' }, width: { xs: '50%', sm: 'auto' } }}
                    disabled={certificadoDialogItems.length <= 1}
                  >
                    Anterior
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    endIcon={<NavigateNextIcon />}
                    onClick={() => setCertificadoDialogIndex((prev) => (prev + 1) % certificadoDialogItems.length)}
                    sx={{ textTransform: 'none', bgcolor: '#334155', '&:hover': { bgcolor: '#1e293b' }, width: { xs: '50%', sm: 'auto' } }}
                    disabled={certificadoDialogItems.length <= 1}
                  >
                    Siguiente
                  </Button>
                </Box>
              </Box>

              <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 2, p: 1, bgcolor: '#f8fafc' }}>
                {certificadoDialogItems[certificadoDialogIndex]?.esImagen ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                    <img
                      src={certificadoDialogItems[certificadoDialogIndex]?.url}
                      alt={`Reposo medico ${certificadoDialogIndex + 1}`}
                      style={{ maxWidth: '100%', maxHeight: '65vh', borderRadius: 8 }}
                    />
                  </Box>
                ) : (
                  <iframe
                    src={certificadoDialogItems[certificadoDialogIndex]?.url}
                    title={`Reposo-medico-${certificadoDialogIndex + 1}`}
                    style={{ width: '100%', height: '60vh', border: 'none', borderRadius: 8 }}
                  />
                )}
              </Box>
            </>
          ) : (
            <Typography>No hay reposo medico disponible.</Typography>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmarFinalizarOpen}
        onClose={() => {
          if (finalizandoReposo) return;
          setConfirmarFinalizarOpen(false);
          setReposoAFinalizar(null);
          setFechaFinFinalizacion('');
        }}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
      >
        <DialogTitle sx={{ bgcolor: '#ecfdf3', color: '#166534', fontWeight: 800 }}>
          Finalizar reposo indefinido
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5, display: 'grid', gap: 2 }}>
          <Typography sx={{ color: '#334155', fontSize: 14 }}>
            El reposo quedará cerrado, conservará su historial y se recalcularán las mensualidades posteriores a la fecha indicada.
          </Typography>
          <TextField
            label="Fecha de finalización"
            type="date"
            value={fechaFinFinalizacion}
            onChange={(e) => setFechaFinFinalizacion(e.target.value)}
            InputLabelProps={{ shrink: true }}
            inputProps={{
              min: reposoAFinalizar ? toInputDate(reposoAFinalizar.fecha_inicio) : undefined,
              max: getTodayInputDate()
            }}
            fullWidth
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            onClick={() => {
              setConfirmarFinalizarOpen(false);
              setReposoAFinalizar(null);
              setFechaFinFinalizacion('');
            }}
            disabled={finalizandoReposo}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={finalizarReposo}
            disabled={finalizandoReposo}
            sx={{ bgcolor: '#15803d', '&:hover': { bgcolor: '#166534' } }}
          >
            {finalizandoReposo ? 'Finalizando...' : 'Finalizar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={confirmarEliminarOpen}
        onClose={() => {
          if (eliminandoReposo) return;
          setConfirmarEliminarOpen(false);
          setReposoAEliminar(null);
        }}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
      >
        <DialogTitle sx={{ color: '#0B0F2A', fontWeight: 800 }}>
          Confirmar eliminación
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          <Typography sx={{ color: '#334155', fontSize: 14 }}>
            ¿Seguro que deseas eliminar este reposo? Esta acción no se puede deshacer.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            onClick={() => {
              setConfirmarEliminarOpen(false);
              setReposoAEliminar(null);
            }}
            disabled={eliminandoReposo}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={eliminarReposo}
            disabled={eliminandoReposo}
          >
            {eliminandoReposo ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default GestionReposos;