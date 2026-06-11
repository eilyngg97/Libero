import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  IconButton,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  useMediaQuery
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import BlockOutlinedIcon from '@mui/icons-material/BlockOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

const TIPOS_LABEL = {
  simple: 'Constancia simple',
  retiro: 'Constancia de retiro',
  horario_entrenamiento: 'Constancia con horario',
  listado_alumnos: 'Constancia con listado',
  asistencia: 'Constancia de asistencia'
};

const DIAS_ENTRENAMIENTO = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('es-VE');
}

function getStatusLabel(estado) {
  if (estado === 'completada') return 'Completada';
  if (estado === 'rechazada') return 'Rechazada';
  if (estado === 'en_revision') return 'En revision';
  return 'Pendiente';
}

function buildStatusStyle(estado) {
  if (estado === 'completada') return { bgcolor: '#dcfce7', color: '#166534' };
  if (estado === 'rechazada') return { bgcolor: '#fee2e2', color: '#b91c1c' };
  if (estado === 'en_revision') return { bgcolor: '#dbeafe', color: '#1d4ed8' };
  return { bgcolor: '#fef3c7', color: '#b45309' };
}

function getAvatarColor(seed) {
  const colors = ['#f97316', '#0ea5e9', '#8b5cf6', '#ec4899', '#10b981', '#ef4444', '#06b6d4', '#eab308'];
  let sum = 0;
  for (let i = 0; i < seed.length; i += 1) sum += seed.charCodeAt(i);
  return colors[sum % colors.length];
}

function ListadoSolicitudesConstancias() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const token = localStorage.getItem('token');
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [editingSolicitud, setEditingSolicitud] = useState(null);
  const [notaAdmin, setNotaAdmin] = useState('');
  const [fechaEmision, setFechaEmision] = useState('');
  const [payload, setPayload] = useState({
    diasEntrenamiento: [],
    horaInicio: '',
    horaFin: '',
    eventoFecha: '',
    eventoHoraDesde: '',
    eventoHoraHasta: '',
    eventoMotivo: '',
    asistenciaPara: 'atleta',
    asistenciaTiempo: 'pasado'
  });
  const [saving, setSaving] = useState(false);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState('');
  const [pdfPreviewName, setPdfPreviewName] = useState('constancia.pdf');
  const [generatingPdfId, setGeneratingPdfId] = useState('');
  const [updatingEstadoId, setUpdatingEstadoId] = useState('');
  const [estadoConfirmDialog, setEstadoConfirmDialog] = useState({
    open: false,
    estado: '',
    solicitud: null
  });
  const inputSx = {
    '& .MuiOutlinedInput-root': {
      bgcolor: '#f8fafc',
      borderRadius: 2,
      '& fieldset': { borderColor: '#e2e8f0' },
      '&:hover fieldset': { borderColor: '#cbd5e1' },
      '&.Mui-focused fieldset': { borderColor: '#94a3b8' }
    }
  };

  const fetchSolicitudes = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/constancias/solicitudes`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = await res.json().catch(() => []);
      if (!res.ok) throw new Error(data?.error || 'No se pudieron cargar solicitudes.');
      setSolicitudes(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar solicitudes.');
      setSolicitudes([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchSolicitudes();
  }, [fetchSolicitudes]);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  const openEditDialog = (solicitud) => {
    setEditingSolicitud(solicitud);
    setNotaAdmin(String(solicitud?.nota_admin || ''));
    setFechaEmision(String(solicitud?.fecha_emision || ''));
    const diasPayload = solicitud?.payload?.diasEntrenamiento;
    setPayload({
      diasEntrenamiento: Array.isArray(diasPayload)
        ? diasPayload
        : String(diasPayload || '')
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
      horaInicio: String(solicitud?.payload?.horaInicio || ''),
      horaFin: String(solicitud?.payload?.horaFin || ''),
      eventoFecha: String(solicitud?.payload?.eventoFecha || ''),
      eventoHoraDesde: String(solicitud?.payload?.eventoHoraDesde || ''),
      eventoHoraHasta: String(solicitud?.payload?.eventoHoraHasta || ''),
      eventoMotivo: String(solicitud?.payload?.eventoMotivo || ''),
      asistenciaPara: String(solicitud?.payload?.asistenciaPara || 'atleta'),
      asistenciaTiempo: String(solicitud?.payload?.asistenciaTiempo || 'pasado')
    });
  };

  const closeEditDialog = () => {
    if (saving) return;
    setEditingSolicitud(null);
    setNotaAdmin('');
    setFechaEmision('');
  };

  const handleSave = async () => {
    if (!editingSolicitud?._id) return;
    try {
      setSaving(true);
      const body = {
        notaAdmin,
        fechaEmision,
        payload: {
          diasEntrenamiento: Array.isArray(payload.diasEntrenamiento)
            ? payload.diasEntrenamiento
            : String(payload.diasEntrenamiento || '')
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean),
          horaInicio: payload.horaInicio,
          horaFin: payload.horaFin,
          eventoFecha: payload.eventoFecha,
          eventoHoraDesde: payload.eventoHoraDesde,
          eventoHoraHasta: payload.eventoHoraHasta,
          eventoMotivo: payload.eventoMotivo,
          asistenciaPara: payload.asistenciaPara,
          asistenciaTiempo: payload.asistenciaTiempo
        }
      };

      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/constancias/solicitudes/${editingSolicitud._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(body)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.detalle || 'No se pudo actualizar la solicitud.');
      setSuccess('Solicitud actualizada.');
      closeEditDialog();
      fetchSolicitudes();
    } catch (err) {
      setError(err.message || 'No se pudo actualizar la solicitud.');
    } finally {
      setSaving(false);
    }
  };

  const handleChangeEstado = async (solicitud, estado) => {
    const solicitudId = String(solicitud?._id || '');
    if (!solicitudId) return;
    try {
      setUpdatingEstadoId(solicitudId);
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/constancias/solicitudes/${solicitud._id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ estado })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.detalle || 'No se pudo actualizar el estado.');
      setSuccess('Estado de solicitud actualizado.');
      fetchSolicitudes();
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el estado.');
    } finally {
      setUpdatingEstadoId('');
    }
  };

  const openEstadoConfirmDialog = (solicitud, estado) => {
    setEstadoConfirmDialog({
      open: true,
      estado,
      solicitud
    });
  };

  const closeEstadoConfirmDialog = () => {
    if (updatingEstadoId) return;
    setEstadoConfirmDialog({
      open: false,
      estado: '',
      solicitud: null
    });
  };

  const confirmEstadoChange = async () => {
    if (!estadoConfirmDialog?.solicitud || !estadoConfirmDialog?.estado) return;
    await handleChangeEstado(estadoConfirmDialog.solicitud, estadoConfirmDialog.estado);
    setEstadoConfirmDialog({
      open: false,
      estado: '',
      solicitud: null
    });
  };

  const handleGenerarPdf = async (solicitud) => {
    try {
      setGeneratingPdfId(String(solicitud?._id || ''));
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/constancias/solicitudes/${solicitud._id}/generar`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || data?.detalle || 'No se pudo generar la constancia.');
      }

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(blobUrl);
      setPdfPreviewName(`constancia-${solicitud?._id || 'preview'}.pdf`);

      setSuccess('Constancia generada. Revisa la vista previa y descarga desde el card.');
      fetchSolicitudes();
    } catch (err) {
      setError(err.message || 'No se pudo generar la constancia.');
    } finally {
      setGeneratingPdfId('');
    }
  };

  const handleDescargarPreview = () => {
    if (!pdfPreviewUrl) return;
    const anchor = document.createElement('a');
    anchor.href = pdfPreviewUrl;
    anchor.download = pdfPreviewName || 'constancia.pdf';
    anchor.click();
  };

  const solicitudesRows = useMemo(() => (Array.isArray(solicitudes) ? solicitudes : []), [solicitudes]);

  const conteos = useMemo(() => {
    return solicitudesRows.reduce(
      (acc, item) => {
        const estado = String(item?.estado || 'pendiente');
        if (estado === 'pendiente') acc.pendiente += 1;
        if (estado === 'completada') acc.completada += 1;
        if (estado === 'rechazada') acc.rechazada += 1;
        return acc;
      },
      { pendiente: 0, completada: 0, rechazada: 0 }
    );
  }, [solicitudesRows]);

  const filteredRows = useMemo(() => {
    if (!estadoFiltro) return solicitudesRows;
    return solicitudesRows.filter((s) => String(s?.estado || 'pendiente') === estadoFiltro);
  }, [estadoFiltro, solicitudesRows]);

  const solicitudTitulo = useMemo(() => {
    if (!editingSolicitud) return 'Editar solicitud';
    return TIPOS_LABEL[editingSolicitud?.tipo] || 'Editar solicitud';
  }, [editingSolicitud]);

  const solicitudSubtitulo = useMemo(() => {
    if (!editingSolicitud) return 'Actualiza los campos y guarda los cambios.';
    const nombreAlumno = `${editingSolicitud?.alumno?.nombres || ''} ${editingSolicitud?.alumno?.apellidos || ''}`.trim() || 'Alumno sin nombre';
    const sede = editingSolicitud?.alumno?.sede || editingSolicitud?.sede || '';
    return sede ? `para ${nombreAlumno} - ${sede}` : `para ${nombreAlumno}`;
  }, [editingSolicitud]);

  const previewCard = (
    <Paper elevation={0} sx={{ p: { xs: 1.25, sm: 2, md: 2.5 }, borderRadius: 3, border: '1px solid #e2e8f0', height: '100%' }}>
      <Box sx={{ display: 'flex', alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between', flexDirection: { xs: 'column', sm: 'row' }, gap: 1, mb: 1.5 }}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a' }}>
            Vista previa de constancia
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b' }}>
            Verifica el PDF antes de descargarlo.
          </Typography>
        </Box>
        <Button
          variant="contained"
          onClick={handleDescargarPreview}
          disabled={!pdfPreviewUrl}
          sx={{
            width: { xs: '100%', sm: 'auto' },
            bgcolor: '#1e293b',
            '&:hover': { bgcolor: '#0f172a' },
            '&.Mui-disabled': { bgcolor: '#cbd5e1', color: '#64748b' }
          }}
        >
          Descargar PDF
        </Button>
      </Box>

      {pdfPreviewUrl ? (
        <Box sx={{ height: { xs: 320, sm: 420, md: 560, lg: 680 }, border: '1px solid #e2e8f0', borderRadius: 2, overflow: 'hidden' }}>
          <iframe
            src={`${pdfPreviewUrl}#navpanes=0&toolbar=1`}
            title="Vista previa constancia"
            width="100%"
            height="100%"
            style={{ border: 0 }}
          />
        </Box>
      ) : (
        <Box
          sx={{
            height: { xs: 180, sm: 220, md: 560, lg: 680 },
            border: '1px dashed #cbd5e1',
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            p: 2
          }}
        >
          <Typography variant="body2" sx={{ color: '#64748b' }}>
            Genera una constancia desde la tabla para verla aqui.
          </Typography>
        </Box>
      )}
    </Paper>
  );

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc', p: { xs: 1.25, sm: 2, md: 3 } }}>
      <Grid container spacing={2}>
        <Grid item size={{ xs: 12, md: 8 }}>
          <Paper
            elevation={0}
            sx={{
              p: { xs: 1.25, sm: 2, md: 2.5 },
              borderRadius: 3,
              border: '1px solid #e2e8f0',
              height: '100%'
            }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a' }}>
                Solicitudes de constancias
              </Typography>
              <Typography variant="body2" sx={{ color: '#64748b' }}>
                Revisa solicitudes de usuarios Esporta, ajusta datos editables y genera PDF.
              </Typography>

              <Box sx={{ display: 'flex', gap: 1, mt: 1, overflowX: 'auto', pb: 0.5 }}>
                {[
                  { label: 'Todas', value: '', color: null, count: solicitudesRows.length },
                  { label: 'Pendientes', value: 'pendiente', color: '#f59e0b', count: conteos.pendiente },
                  { label: 'Completadas', value: 'completada', color: '#22c55e', count: conteos.completada },
                  { label: 'Rechazadas', value: 'rechazada', color: '#ef4444', count: conteos.rechazada }
                ].map((tab) => (
                  <Box
                    key={tab.value}
                    onClick={() => setEstadoFiltro(tab.value)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.8,
                      px: 1.6,
                      py: 0.8,
                      borderRadius: 2,
                      fontWeight: 700,
                      fontSize: 13,
                      cursor: 'pointer',
                      border: estadoFiltro === tab.value ? '1px solid #0f172a' : '1px solid #e2e8f0',
                      bgcolor: estadoFiltro === tab.value ? '#0f172a' : '#f8fafc',
                      color: estadoFiltro === tab.value ? '#ffffff' : '#334155',
                      userSelect: 'none',
                      flexShrink: 0
                    }}
                  >
                    {tab.color && (
                      <Box
                        sx={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          bgcolor: tab.color
                        }}
                      />
                    )}
                    <Box component="span">{tab.label}</Box>
                    <Box
                      component="span"
                      sx={{
                        minWidth: 18,
                        height: 18,
                        px: 0.6,
                        borderRadius: 9,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: estadoFiltro === tab.value ? '#1e293b' : '#e2e8f0',
                        color: estadoFiltro === tab.value ? '#e2e8f0' : '#475569',
                        fontWeight: 700,
                        fontSize: 12,
                        lineHeight: 1
                      }}
                    >
                      {tab.count}
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert>}
            {success && <Alert severity="success" sx={{ mb: 1.5 }} onClose={() => setSuccess('')}>{success}</Alert>}

            {loading ? (
              <Box sx={{ py: 4, display: 'flex', justifyContent: 'center' }}>
                <CircularProgress />
              </Box>
            ) : isMobile ? (
              <Box sx={{ display: 'grid', gap: 1.2 }}>
                {filteredRows.map((solicitud) => {
                  const statusStyle = buildStatusStyle(solicitud.estado);
                  const nombres = `${solicitud?.alumno?.nombres || ''} ${solicitud?.alumno?.apellidos || ''}`.trim();
                  const cedula = solicitud?.alumno?.cedula || '';
                  const tipo = TIPOS_LABEL[solicitud.tipo] || solicitud.tipo;
                  const initials = nombres
                    ? nombres.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase()
                    : 'NA';

                  return (
                    <Paper key={solicitud._id} elevation={0} sx={{ p: 1.25, borderRadius: 2, border: '1px solid #e2e8f0' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.1 }}>
                        <Avatar
                          sx={{
                            width: 32,
                            height: 32,
                            fontWeight: 700,
                            bgcolor: getAvatarColor(nombres || String(solicitud?._id || 'x')),
                            fontSize: 12
                          }}
                        >
                          {initials}
                        </Avatar>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography
                            variant="body2"
                            sx={{
                              fontWeight: 700,
                              color: '#0f172a',
                              lineHeight: 1.2,
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden'
                            }}
                          >
                            {nombres || '-'}
                          </Typography>
                          <Typography variant="caption" sx={{ color: cedula ? '#64748b' : '#dc2626' }}>
                            {cedula ? `V-${cedula}` : 'Sin cedula'}
                          </Typography>
                        </Box>
                        <Box sx={{ ml: 'auto' }}>
                          <Chip size="small" label={getStatusLabel(solicitud.estado)} sx={{ ...statusStyle, fontWeight: 700 }} />
                        </Box>
                      </Box>

                      <Box sx={{ mt: 0.8 }}>
                        <Typography variant="caption" sx={{ color: '#64748b' }}>{tipo}</Typography>
                      </Box>

                      <Box sx={{ mt: 0.6 }}>
                        <Typography variant="caption" sx={{ color: '#0f172a', fontWeight: 700 }}>
                          {solicitud?.solicitado_por?.nombre || solicitud?.solicitado_por?.email || '-'}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#64748b', display: 'block' }}>
                          {formatDateTime(solicitud.createdAt)}
                        </Typography>
                      </Box>

                      <Box sx={{ mt: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.8 }}>
                        <Button variant="outlined" size="small" onClick={() => openEditDialog(solicitud)}>
                          Editar
                        </Button>
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() => handleGenerarPdf(solicitud)}
                          disabled={generatingPdfId === String(solicitud?._id || '')}
                        >
                          {generatingPdfId === String(solicitud?._id || '') ? 'Generando...' : 'Ver PDF'}
                        </Button>
                      </Box>

                      <Button
                        variant="text"
                        size="small"
                        color="success"
                        onClick={() => openEstadoConfirmDialog(solicitud, 'completada')}
                        disabled={solicitud.estado === 'completada' || updatingEstadoId === String(solicitud?._id || '')}
                        sx={{ mt: 0.4 }}
                      >
                        Marcar como completado
                      </Button>

                      <Button
                        variant="text"
                        size="small"
                        color="error"
                        onClick={() => openEstadoConfirmDialog(solicitud, 'rechazada')}
                        disabled={solicitud.estado === 'rechazada' || updatingEstadoId === String(solicitud?._id || '')}
                        sx={{ mt: 0.4 }}
                      >
                        Rechazar
                      </Button>
                    </Paper>
                  );
                })}

                {!filteredRows.length && (
                  <Typography variant="body2" sx={{ color: '#64748b', py: 2, textAlign: 'center' }}>
                    No hay solicitudes para mostrar.
                  </Typography>
                )}
              </Box>
            ) : (
              <TableContainer sx={{ overflowX: 'auto' }}>
                <Table size="small" sx={{ minWidth: { sm: 720, md: 820 }, bgcolor: '#f8fafc' }}>
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                      <TableCell sx={{ fontWeight: 700, color: '#334155', border: 0 }}>ALUMNO · TIPO</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#334155', border: 0 }}>SOLICITANTE · FECHA</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: '#334155', border: 0, width: 120 }}>ESTADO</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, color: '#334155', border: 0, width: 220 }}>Acciones</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredRows.map((solicitud) => {
                      const statusStyle = buildStatusStyle(solicitud.estado);
                      const nombres = `${solicitud?.alumno?.nombres || ''} ${solicitud?.alumno?.apellidos || ''}`.trim();
                      const cedula = solicitud?.alumno?.cedula || '';
                      const tipo = TIPOS_LABEL[solicitud.tipo] || solicitud.tipo;
                      const initials = nombres
                        ? nombres.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase()
                        : 'NA';

                      return (
                        <TableRow key={solicitud._id} hover sx={{ '& td': { borderBottom: '1px solid #e2e8f0' } }}>
                          <TableCell sx={{ py: 1.6 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.3 }}>
                              <Avatar
                                sx={{
                                  width: 34,
                                  height: 34,
                                  fontWeight: 700,
                                  bgcolor: getAvatarColor(nombres || String(solicitud?._id || 'x')),
                                  fontSize: 13
                                }}
                              >
                                {initials}
                              </Avatar>

                              <Box>
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontWeight: 700,
                                    color: '#0f172a',
                                    lineHeight: 1.2,
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden',
                                    maxWidth: { sm: 210, md: 260, lg: 320 }
                                  }}
                                >
                                  {nombres || '-'}
                                </Typography>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                  {cedula ? (
                                    <Typography variant="caption" sx={{ color: '#64748b' }}>
                                      V-{cedula}
                                    </Typography>
                                  ) : (
                                    <Typography variant="caption" sx={{ color: '#dc2626' }}>
                                      Sin cedula
                                    </Typography>
                                  )}
                                  <Typography variant="caption" sx={{ color: '#64748b' }}>
                                    {tipo}
                                  </Typography>
                                </Box>
                              </Box>
                            </Box>
                          </TableCell>

                          <TableCell sx={{ py: 1.6 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                              {solicitud?.solicitado_por?.nombre || solicitud?.solicitado_por?.email || '-'}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>
                              {formatDateTime(solicitud.createdAt)}
                            </Typography>
                          </TableCell>

                          <TableCell sx={{ py: 1.6 }}>
                            <Chip size="small" label={getStatusLabel(solicitud.estado)} sx={{ ...statusStyle, fontWeight: 700 }} />
                          </TableCell>

                          <TableCell align="right" sx={{ py: 1.6 }}>
                            <Box sx={{ display: 'inline-flex', gap: 0.5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              <Tooltip title="Editar solicitud" arrow>
                                <IconButton
                                  size="small"
                                  onClick={() => openEditDialog(solicitud)}
                                  sx={{ color: '#334155' }}
                                >
                                  <EditOutlinedIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>

                              <Tooltip
                                title={generatingPdfId === String(solicitud?._id || '') ? 'Generando PDF...' : 'Ver PDF'}
                                arrow
                              >
                                <span>
                                  <IconButton
                                    size="small"
                                    onClick={() => handleGenerarPdf(solicitud)}
                                    disabled={generatingPdfId === String(solicitud?._id || '')}
                                    sx={{ color: '#1e293b' }}
                                  >
                                    {generatingPdfId === String(solicitud?._id || '') ? (
                                      <CircularProgress size={16} />
                                    ) : (
                                      <PictureAsPdfOutlinedIcon fontSize="small" />
                                    )}
                                  </IconButton>
                                </span>
                              </Tooltip>

                              <Tooltip
                                title={solicitud.estado === 'completada' ? 'Solicitud ya completada' : 'Marcar como completado'}
                                arrow
                              >
                                <span>
                                  <IconButton
                                    size="small"
                                    color="success"
                                    onClick={() => openEstadoConfirmDialog(solicitud, 'completada')}
                                    disabled={solicitud.estado === 'completada' || updatingEstadoId === String(solicitud?._id || '')}
                                  >
                                    <CheckCircleOutlineIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>

                              <Tooltip
                                title={solicitud.estado === 'rechazada' ? 'Solicitud ya rechazada' : 'Rechazar solicitud'}
                                arrow
                              >
                                <span>
                                  <IconButton
                                    size="small"
                                    color="error"
                                    onClick={() => openEstadoConfirmDialog(solicitud, 'rechazada')}
                                    disabled={solicitud.estado === 'rechazada' || updatingEstadoId === String(solicitud?._id || '')}
                                  >
                                    <BlockOutlinedIcon fontSize="small" />
                                  </IconButton>
                                </span>
                              </Tooltip>
                            </Box>
                          </TableCell>
                        </TableRow>
                      );
                    })}

                    {!filteredRows.length && (
                      <TableRow>
                        <TableCell colSpan={4}>
                          <Typography variant="body2" sx={{ color: '#64748b', py: 2, textAlign: 'center' }}>
                            No hay solicitudes para mostrar.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Grid>

        <Grid item size={{ xs: 12, md: 4 }} sx={{ mt: { xs: 2, sm: 2, md: 0 } }}>
          {previewCard}
        </Grid>
      </Grid>

      <Dialog
        open={Boolean(editingSolicitud)}
        onClose={closeEditDialog}
        fullWidth
        maxWidth="sm"
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: 'hidden'
          }
        }}
      >
        <DialogTitle sx={{ p: 0 }}>
          <Box sx={{ p: { xs: 1.2, sm: 1.5 }, bgcolor: '#eef2f7', borderBottom: '1px solid #e2e8f0' }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.2,
                p: { xs: 1, sm: 1.1 },
                borderRadius: 2,
                bgcolor: '#f8fafc',
                border: '1px solid #e2e8f0'
              }}
            >
              <Box
                sx={{
                  width: 30,
                  height: 30,
                  borderRadius: 1.5,
                  bgcolor: '#e2e8f0',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#64748b',
                  flexShrink: 0
                }}
              >
                <EditOutlinedIcon sx={{ fontSize: 16 }} />
              </Box>

              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    fontWeight: 800,
                    letterSpacing: 0.5,
                    color: '#f97316',
                    textTransform: 'uppercase'
                  }}
                >
                    Editar solicitud
                </Typography>
                <Typography
                  variant="h6"
                  sx={{ fontWeight: 800, color: '#0f172a', lineHeight: 1.1, fontSize: { xs: 18, sm: 21 } }}
                >
                  {solicitudTitulo}
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    color: '#64748b',
                    fontSize: { xs: 12, sm: 13 },
                    display: '-webkit-box',
                    WebkitLineClamp: 1,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}
                >
                  {solicitudSubtitulo}
                </Typography>
              </Box>

              <IconButton
                onClick={closeEditDialog}
                disabled={saving}
                size="small"
                sx={{
                  bgcolor: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  color: '#94a3b8',
                  '&:hover': { bgcolor: '#e2e8f0', color: '#64748b' }
                }}
              >
                <CloseRoundedIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gap: 1.2, mt: 0.5 }}>
            <TextField
              fullWidth
              label="Fecha emision"
              type="date"
              value={fechaEmision}
              onChange={(e) => setFechaEmision(e.target.value)}
              InputLabelProps={{ shrink: true }}
              sx={inputSx}
            />
            <TextField
              fullWidth
              multiline
              minRows={2}
              label="Nota admin"
              value={notaAdmin}
              onChange={(e) => setNotaAdmin(e.target.value)}
              sx={inputSx}
            />

            {editingSolicitud?.tipo === 'horario_entrenamiento' && (
              <>
                <FormControl fullWidth sx={inputSx}>
                  <Autocomplete
                    multiple
                    options={DIAS_ENTRENAMIENTO}
                    value={Array.isArray(payload.diasEntrenamiento) ? payload.diasEntrenamiento : []}
                    onChange={(e, value) => setPayload((prev) => ({ ...prev, diasEntrenamiento: value || [] }))}
                    renderInput={(params) => (
                      <TextField {...params} label="Dias de entrenamiento" placeholder="Selecciona uno o varios dias" />
                    )}
                  />
                </FormControl>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                  <TextField
                    fullWidth
                    label="Hora de inicio"
                    type="time"
                    value={payload.horaInicio}
                    onChange={(e) => setPayload((prev) => ({ ...prev, horaInicio: e.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    sx={inputSx}
                  />
                  <TextField
                    fullWidth
                    label="Hora de fin"
                    type="time"
                    value={payload.horaFin}
                    onChange={(e) => setPayload((prev) => ({ ...prev, horaFin: e.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    sx={inputSx}
                  />
                </Box>
              </>
            )}

            {editingSolicitud?.tipo === 'asistencia' && (
              <>
                <FormControl fullWidth sx={inputSx}>
                  <InputLabel id="asistencia-para-admin">Constancia para</InputLabel>
                  <Select
                    labelId="asistencia-para-admin"
                    label="Constancia para"
                    value={payload.asistenciaPara}
                    onChange={(e) => setPayload((prev) => ({ ...prev, asistenciaPara: e.target.value }))}
                  >
                    <MenuItem value="atleta">Atleta</MenuItem>
                    <MenuItem value="representante">Representante</MenuItem>
                  </Select>
                </FormControl>
                <FormControl fullWidth sx={inputSx}>
                  <InputLabel id="asistencia-tiempo-admin">Tiempo verbal</InputLabel>
                  <Select
                    labelId="asistencia-tiempo-admin"
                    label="Tiempo verbal"
                    value={payload.asistenciaTiempo}
                    onChange={(e) => setPayload((prev) => ({ ...prev, asistenciaTiempo: e.target.value }))}
                  >
                    <MenuItem value="pasado">Estuvo presente</MenuItem>
                    <MenuItem value="futuro">Estara presente</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  fullWidth
                  label="Fecha evento"
                  type="date"
                  value={payload.eventoFecha}
                  onChange={(e) => setPayload((prev) => ({ ...prev, eventoFecha: e.target.value }))}
                  InputLabelProps={{ shrink: true }}
                  sx={inputSx}
                />
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                  <TextField
                    fullWidth
                    label="Hora desde"
                    type="time"
                    value={payload.eventoHoraDesde}
                    onChange={(e) => setPayload((prev) => ({ ...prev, eventoHoraDesde: e.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    sx={inputSx}
                  />
                  <TextField
                    fullWidth
                    label="Hora hasta"
                    type="time"
                    value={payload.eventoHoraHasta}
                    onChange={(e) => setPayload((prev) => ({ ...prev, eventoHoraHasta: e.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    sx={inputSx}
                  />
                </Box>
                <TextField
                  fullWidth
                  label="Motivo evento"
                  value={payload.eventoMotivo}
                  onChange={(e) => setPayload((prev) => ({ ...prev, eventoMotivo: e.target.value }))}
                  sx={inputSx}
                />
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={saving}
            sx={{
              bgcolor: '#1e293b',
              '&:hover': { bgcolor: '#0f172a' },
              '&.Mui-disabled': { bgcolor: '#cbd5e1', color: '#64748b' }
            }}
          >
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={estadoConfirmDialog.open}
        onClose={closeEstadoConfirmDialog}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          Confirmar acción
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: '#334155' }}>
            {estadoConfirmDialog.estado === 'completada'
              ? `Vas a marcar como completada la solicitud de ${`${estadoConfirmDialog?.solicitud?.alumno?.nombres || ''} ${estadoConfirmDialog?.solicitud?.alumno?.apellidos || ''}`.trim() || 'este alumno'}.`
              : `Vas a rechazar la solicitud de ${`${estadoConfirmDialog?.solicitud?.alumno?.nombres || ''} ${estadoConfirmDialog?.solicitud?.alumno?.apellidos || ''}`.trim() || 'este alumno'}. Esta acción cambiará su estado.`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEstadoConfirmDialog} disabled={Boolean(updatingEstadoId)}>
            Cancelar
          </Button>
          <Button
            onClick={confirmEstadoChange}
            variant="contained"
            disabled={Boolean(updatingEstadoId)}
            sx={estadoConfirmDialog.estado === 'rechazada'
              ? {
                  bgcolor: '#dc2626',
                  '&:hover': { bgcolor: '#b91c1c' },
                  '&.Mui-disabled': { bgcolor: '#fecaca', color: '#7f1d1d' }
                }
              : {
                  bgcolor: '#1e293b',
                  '&:hover': { bgcolor: '#0f172a' },
                  '&.Mui-disabled': { bgcolor: '#cbd5e1', color: '#64748b' }
                }}
          >
            {updatingEstadoId ? 'Procesando...' : 'Confirmar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default ListadoSolicitudesConstancias;
