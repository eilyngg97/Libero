import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import { mediaUrl } from '../utils/mediaUrl';
import { hasPermission } from '../utils/permissions';

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return '--';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateValue) {
  if (!dateValue) return '--';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString('es-VE', {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  });
}

function hasPreviewSupport(item) {
  const mime = String(item?.tipo_mime || '').toLowerCase();
  const filename = String(item?.nombre_archivo || '').toLowerCase();

  if (mime.startsWith('image/')) return true;
  if (mime === 'application/pdf') return true;
  if (filename.endsWith('.pdf')) return true;
  if (filename.endsWith('.png') || filename.endsWith('.jpg') || filename.endsWith('.jpeg') || filename.endsWith('.webp')) return true;

  return false;
}

function isPdfFile(item) {
  const mime = String(item?.tipo_mime || '').toLowerCase();
  const filename = String(item?.nombre_archivo || '').toLowerCase();
  return mime === 'application/pdf' || filename.endsWith('.pdf');
}

function Recaudos() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [rol, setRol] = useState('');
  const [recaudos, setRecaudos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [eliminandoId, setEliminandoId] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [recaudoAEliminar, setRecaudoAEliminar] = useState(null);
  const [requisitosCatalogo, setRequisitosCatalogo] = useState([]);
  const [requisitoInput, setRequisitoInput] = useState('');
  const [guardandoRequisitos, setGuardandoRequisitos] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const fileInputRef = useRef(null);

  const apiBase = useMemo(() => process.env.REACT_APP_API_URL || window.location.origin, []);

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const resolveFileUrl = useCallback((value) => {
    if (!value || typeof value !== 'string') return '';

    if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('blob:') || value.startsWith('data:')) {
      return value;
    }

    const normalized = mediaUrl(value);
    if (typeof normalized === 'string' && normalized) {
      return normalized;
    }

    if (value.startsWith('/')) {
      return `${apiBase.replace(/\/$/, '')}${value}`;
    }

    return value;
  }, [apiBase]);

  const cargarRecaudos = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch(`${apiBase}/api/recaudos`, {
        headers: getAuthHeaders()
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'No se pudo cargar la lista de recaudos');
      }
      const data = await res.json();
      setRecaudos(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'No se pudo cargar la lista de recaudos');
      setRecaudos([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase, getAuthHeaders]);

  const cargarRequisitos = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/recaudos/requisitos`, {
        headers: getAuthHeaders()
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'No se pudo cargar el catalogo de requisitos');
      }

      const payload = await res.json();
      setRequisitosCatalogo(Array.isArray(payload?.requisitos) ? payload.requisitos : []);
    } catch (err) {
      setError(err.message || 'No se pudo cargar el catalogo de requisitos');
      setRequisitosCatalogo([]);
    }
  }, [apiBase, getAuthHeaders]);

  useEffect(() => {
    const rolLs = String(localStorage.getItem('rol') || '').trim().toLowerCase();
    const puedeGestionarRequisitos = hasPermission('recaudos.manage');
    setRol(rolLs);
    cargarRecaudos();
    if (puedeGestionarRequisitos) {
      cargarRequisitos();
    }
  }, [cargarRecaudos, cargarRequisitos]);

  const agregarRequisito = () => {
    const requisito = String(requisitoInput || '').trim();
    if (!requisito) return;

    const yaExiste = requisitosCatalogo.some((item) => String(item || '').trim().toLowerCase() === requisito.toLowerCase());
    if (yaExiste) {
      setRequisitoInput('');
      return;
    }

    setRequisitosCatalogo((prev) => [...prev, requisito]);
    setRequisitoInput('');
  };

  const eliminarRequisitoLocal = (requisito) => {
    const target = String(requisito || '').trim().toLowerCase();
    setRequisitosCatalogo((prev) => prev.filter((item) => String(item || '').trim().toLowerCase() !== target));
  };

  const guardarRequisitos = async () => {
    try {
      setGuardandoRequisitos(true);
      setError('');
      setSuccessMessage('');

      const res = await fetch(`${apiBase}/api/recaudos/requisitos`, {
        method: 'PUT',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ requisitos: requisitosCatalogo })
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'No se pudo guardar el catalogo de requisitos');
      }

      const payload = await res.json().catch(() => ({}));
      setRequisitosCatalogo(Array.isArray(payload?.requisitos) ? payload.requisitos : []);
      setSuccessMessage(payload?.message || 'Requisitos guardados correctamente');
    } catch (err) {
      setError(err.message || 'No se pudo guardar el catalogo de requisitos');
    } finally {
      setGuardandoRequisitos(false);
    }
  };

  const abrirPreview = async (item) => {
    setPreviewItem(item);
    setPreviewOpen(true);

    if (!hasPreviewSupport(item)) return;

    try {
      setPreviewLoading(true);
      setError('');

      if (previewBlobUrl) {
        window.URL.revokeObjectURL(previewBlobUrl);
        setPreviewBlobUrl('');
      }

      const fileUrl = resolveFileUrl(item.archivo_url);
      if (!fileUrl) {
        throw new Error('No se encontro la URL del archivo');
      }

      const res = await fetch(fileUrl, {
        headers: getAuthHeaders()
      });

      if (!res.ok) {
        throw new Error('No se pudo cargar la vista previa');
      }

      const blob = await res.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      setPreviewBlobUrl(objectUrl);
    } catch (err) {
      setError(err.message || 'No se pudo cargar la vista previa');
    } finally {
      setPreviewLoading(false);
    }
  };

  const cerrarPreview = () => {
    setPreviewOpen(false);
    setPreviewItem(null);
    if (previewBlobUrl) {
      window.URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl('');
    }
    setPreviewLoading(false);
  };

  const descargarArchivo = async (item) => {
    try {
      const fileUrl = resolveFileUrl(item.archivo_url);
      if (!fileUrl) {
        throw new Error('No se encontro la URL del archivo');
      }

      const res = await fetch(fileUrl, {
        headers: getAuthHeaders()
      });

      if (!res.ok) {
        throw new Error('No se pudo descargar el archivo');
      }

      const blob = await res.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = item.nombre_archivo || item.titulo || 'recaudo';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err.message || 'No se pudo descargar el archivo');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!archivo) {
      setError('Debes seleccionar un archivo para subir.');
      return;
    }

    try {
      setSubiendo(true);
      setError('');
      const formData = new FormData();
      formData.append('archivo', archivo);
      formData.append('titulo', titulo);
      formData.append('descripcion', descripcion);

      const res = await fetch(`${apiBase}/api/recaudos`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'No se pudo subir el recaudo');
      }

      setTitulo('');
      setDescripcion('');
      setArchivo(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await cargarRecaudos();
    } catch (err) {
      setError(err.message || 'No se pudo subir el recaudo');
    } finally {
      setSubiendo(false);
    }
  };

  const setArchivoSeleccionado = (file) => {
    setArchivo(file || null);
    if (file) {
      const nombreSinExtension = String(file.name || '').replace(/\.[^/.]+$/, '').trim();
      setTitulo(nombreSinExtension || String(file.name || '').trim());
    }
  };

  const handleFileInputChange = (event) => {
    const file = event.target.files?.[0] || null;
    setArchivoSeleccionado(file);
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const file = event.dataTransfer?.files?.[0] || null;
    if (!file) return;
    setArchivoSeleccionado(file);
  };

  const eliminarRecaudo = async (id) => {
    try {
      setEliminandoId(id);
      setError('');
      const res = await fetch(`${apiBase}/api/recaudos/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'No se pudo eliminar el recaudo');
      }

      await cargarRecaudos();
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el recaudo');
    } finally {
      setEliminandoId('');
    }
  };

  const solicitarEliminarRecaudo = (recaudo) => {
    setRecaudoAEliminar(recaudo || null);
    setConfirmDeleteOpen(true);
  };

  const confirmarEliminarRecaudo = async () => {
    if (!recaudoAEliminar?._id) return;
    await eliminarRecaudo(recaudoAEliminar._id);
    setConfirmDeleteOpen(false);
    setRecaudoAEliminar(null);
  };

  const esAdmin = hasPermission('recaudos.manage');
  const actionIconSx = {
    color: '#64748b',
    '&:hover': { color: '#475569', backgroundColor: 'rgba(100, 116, 139, 0.08)' }
  };
  const primarySaveButtonSx = {
    bgcolor: '#1e293b',
    '&:hover': {
      bgcolor: '#233653'
    },
    height: 40,
    fontSize: 14,
    textTransform: 'none',
    fontWeight: 700
  };
  const canSubmitRecaudo = Boolean(archivo) && String(titulo || '').trim().length > 0;
  const previewSrc = previewItem && isPdfFile(previewItem)
    ? (isMobile
      ? `${previewBlobUrl}#page=1&zoom=page-width&pagemode=none&toolbar=0&navpanes=0&scrollbar=0`
      : `${previewBlobUrl}#page=1&view=FitV&zoom=page-fit&pagemode=none`)
    : previewBlobUrl;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc', p: { xs: 2, md: 4 } }}>
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

      <Box sx={{ maxWidth: 1200, mx: 'auto', display: 'grid', gap: 2.5 }}>
        <Box>
          <Typography variant="h5" sx={{ color: '#0f172a', fontWeight: 800 }}>
            Recaudos
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            {esAdmin
              ? 'Sube planillas y recaudos para que los usuarios puedan visualizarlos y descargarlos.'
              : 'Consulta y descarga los documentos y planillas disponibles.'}
          </Typography>
        </Box>

        {error ? <Alert severity="error">{error}</Alert> : null}

        {esAdmin ? (
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid #e2e8f0' }}>
            <Typography variant="subtitle1" sx={{ color: '#0f172a', fontWeight: 700, mb: 1.5 }}>
              Subir nuevo recaudo
            </Typography>
            <Box
              component="form"
              onSubmit={handleSubmit}
              sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, alignItems: 'end' }}
            >
              <TextField
                label="Titulo"
                size="small"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ej: Planilla de inscripción"
              />
              <TextField
                label="Descripcion"
                size="small"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Opcional"
              />

              <Box
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                sx={{
                  gridColumn: { xs: '1 / -1', md: '1 / -1' },
                  mt: 0.25,
                  border: '1px dashed',
                  borderColor: dragActive ? '#f97316' : '#cbd5f0',
                  borderRadius: 2,
                  p: 2,
                  textAlign: 'center',
                  backgroundColor: dragActive ? '#fff7ed' : '#f8fafc',
                  display: 'block',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
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
                  <CloudUploadIcon sx={{ color: '#ff7a00', fontSize: 18 }} />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                  Arrastra y suelta el archivo aqui o haz clic para adjuntar
                </Typography>
                <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                  PDF, PNG, JPG, DOC, DOCX, XLS, XLSX (MAX. 20MB)
                </Typography>
                <input
                  ref={fileInputRef}
                  hidden
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
                  onChange={handleFileInputChange}
                />
              </Box>

              {archivo ? (
                <Box
                  sx={{
                    gridColumn: { xs: '1 / -1', md: '1 / -1' },
                    px: 1.5,
                    py: 1,
                    border: '1px solid #e2e8f0',
                    borderRadius: 2,
                    bgcolor: '#ffffff',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 1
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                    <InsertDriveFileIcon sx={{ color: '#fb923c', fontSize: 18 }} />
                    <Typography
                      variant="body2"
                      sx={{ color: '#475569', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {archivo.name}
                    </Typography>
                  </Box>
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      setArchivo(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                  >
                    <CloseIcon sx={{ fontSize: 16, color: '#94a3b8' }} />
                  </IconButton>
                </Box>
              ) : null}

              <Box sx={{ gridColumn: { xs: '1 / -1', md: '1 / -1' }, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button type="submit" variant="contained" disabled={subiendo || !canSubmitRecaudo} sx={{ ...primarySaveButtonSx, ml: 'auto' }}>
                  {subiendo ? 'Subiendo...' : 'Guardar recaudo'}
                </Button>
              </Box>
            </Box>
          </Paper>
        ) : null}

        {esAdmin ? (
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid #e2e8f0' }}>
            <Typography variant="subtitle1" sx={{ color: '#0f172a', fontWeight: 700, mb: 1 }}>
              Requisitos por academia
            </Typography>
            <Typography variant="body2" sx={{ color: '#64748b', mb: 1.5 }}>
              Agrega etiquetas de requisitos que se controlaran por atleta en el detalle del alumno.
            </Typography>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField
                fullWidth
                size="small"
                label="Nuevo requisito"
                value={requisitoInput}
                onChange={(e) => setRequisitoInput(e.target.value)}
                placeholder="Ej: Partida de nacimiento"
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    agregarRequisito();
                  }
                }}
              />
              <Button
                variant="outlined"
                onClick={agregarRequisito}
                sx={{
                  minWidth: { xs: '100%', sm: 140 },
                  textTransform: 'none',
                  fontWeight: 700,
                  color: '#1e293b',
                  borderColor: '#1e293b',
                  '&:hover': {
                    borderColor: '#1e293b',
                    backgroundColor: 'rgba(30, 41, 59, 0.04)'
                  }
                }}
              >
                Agregar
              </Button>
            </Stack>

            <Box sx={{ mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              {requisitosCatalogo.length === 0 ? (
                <Typography variant="body2" sx={{ color: '#94a3b8' }}>
                  No hay requisitos cargados.
                </Typography>
              ) : (
                requisitosCatalogo.map((item) => (
                  <Chip
                    key={item}
                    label={item}
                    onDelete={() => eliminarRequisitoLocal(item)}
                    sx={{ bgcolor: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', fontWeight: 700 }}
                  />
                ))
              )}
            </Box>

            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                onClick={guardarRequisitos}
                disabled={guardandoRequisitos}
                sx={primarySaveButtonSx}
              >
                {guardandoRequisitos ? 'Guardando...' : 'Guardar requisitos'}
              </Button>
            </Box>
          </Paper>
        ) : null}

        <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          {loading ? (
            <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
              <CircularProgress size={28} />
            </Box>
          ) : recaudos.length === 0 ? (
            <Box sx={{ p: 3 }}>
              <Typography sx={{ color: '#64748b' }}>No hay recaudos disponibles.</Typography>
            </Box>
          ) : (
              isMobile ? (
                <Box sx={{ display: 'grid', gap: 1.5, p: 1.5 }}>
                  {recaudos.map((item) => (
                    <Paper
                      key={item._id}
                      variant="outlined"
                      sx={{
                        borderRadius: 3,
                        borderColor: '#e2e8f0',
                        p: 1.5,
                        bgcolor: '#ffffff'
                      }}
                    >
                      <Box sx={{ display: 'grid', gap: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                              {item.titulo || '--'}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>
                              {formatDate(item.createdAt)}
                            </Typography>
                          </Box>
                          <Typography variant="caption" sx={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>
                            {formatBytes(item.tamano_bytes)}
                          </Typography>
                        </Box>

                        <Typography variant="body2" sx={{ color: '#475569' }}>
                          {item.descripcion || 'Sin descripcion'}
                        </Typography>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                          <InsertDriveFileIcon sx={{ color: '#fb923c', fontSize: 18, flexShrink: 0 }} />
                          <Typography
                            variant="body2"
                            sx={{ color: '#334155', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                          >
                            {item.nombre_archivo || '--'}
                          </Typography>
                        </Box>

                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Tooltip title="Ver" arrow>
                            <IconButton size="small" aria-label="Ver" onClick={() => abrirPreview(item)} sx={actionIconSx}>
                              <VisibilityIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Descargar" arrow>
                            <IconButton size="small" aria-label="Descargar" onClick={() => descargarArchivo(item)} sx={actionIconSx}>
                              <DownloadIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {esAdmin ? (
                            <Tooltip title="Eliminar" arrow>
                              <IconButton
                                size="small"
                                aria-label="Eliminar"
                                onClick={() => solicitarEliminarRecaudo(item)}
                                disabled={eliminandoId === item._id}
                                sx={actionIconSx}
                              >
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          ) : null}
                        </Stack>
                      </Box>
                    </Paper>
                  ))}
                </Box>
              ) : (
                <TableContainer sx={{ overflowX: 'auto' }}>
                  <Table size="small" sx={{ minWidth: 760 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Titulo</TableCell>
                        <TableCell>Descripcion</TableCell>
                        <TableCell>Archivo</TableCell>
                        <TableCell>Fecha</TableCell>
                        <TableCell align="right">Acciones</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {recaudos.map((item) => (
                        <TableRow key={item._id} hover>
                          <TableCell sx={{ fontWeight: 600, color: '#0f172a' }}>{item.titulo || '--'}</TableCell>
                          <TableCell>{item.descripcion || '--'}</TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ color: '#334155' }}>
                              {item.nombre_archivo || '--'}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>
                              {formatBytes(item.tamano_bytes)}
                            </Typography>
                          </TableCell>
                          <TableCell>{formatDate(item.createdAt)}</TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                              <Tooltip title="Ver" arrow>
                                <IconButton
                                  size="small"
                                  aria-label="Ver"
                                  onClick={() => abrirPreview(item)}
                                  sx={actionIconSx}
                                >
                                  <VisibilityIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Descargar" arrow>
                                <IconButton
                                  size="small"
                                  aria-label="Descargar"
                                  onClick={() => descargarArchivo(item)}
                                  sx={actionIconSx}
                                >
                                  <DownloadIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              {esAdmin ? (
                                <Tooltip title="Eliminar" arrow>
                                  <IconButton
                                    size="small"
                                    aria-label="Eliminar"
                                    onClick={() => solicitarEliminarRecaudo(item)}
                                    disabled={eliminandoId === item._id}
                                    sx={actionIconSx}
                                  >
                                    <DeleteOutlineIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              ) : null}
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )
            )}
        </Paper>
      </Box>

      <Dialog
        open={previewOpen}
        onClose={cerrarPreview}
        fullWidth
        maxWidth="md"
        PaperProps={{
          sx: {
            width: { xs: '96vw', md: '74vw', lg: '1200px' },
            maxWidth: '98vw',
            height: { xs: '90vh', md: '94vh' },
            maxHeight: '96vh',
            overflow: 'hidden'
          }
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
          <Typography sx={{ fontWeight: 700 }}>{previewItem?.titulo || 'Vista previa'}</Typography>
          <IconButton onClick={cerrarPreview}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ p: 0, height: '100%', overflow: 'hidden' }}>
          {previewItem ? (
            hasPreviewSupport(previewItem) ? (
              previewLoading ? (
                <Box sx={{ height: '100%', display: 'grid', placeItems: 'center' }}>
                  <CircularProgress size={28} />
                </Box>
              ) : previewBlobUrl ? (
                <iframe
                  src={previewSrc}
                  title={previewItem.titulo || 'Recaudo'}
                  style={{ width: '100%', height: '100%', border: 0 }}
                />
              ) : (
                <Box sx={{ p: 3 }}>
                  <Alert severity="warning">No se pudo preparar la vista previa de este archivo.</Alert>
                </Box>
              )
            ) : (
              <Box sx={{ p: 3 }}>
                <Alert severity="info" sx={{ mb: 2 }}>
                  Este tipo de archivo no admite vista previa integrada en el navegador.
                </Alert>
                <Stack direction="row" spacing={1.2}>
                  <Button
                    variant="contained"
                    startIcon={<DownloadIcon />}
                    onClick={() => descargarArchivo(previewItem)}
                  >
                    Descargar archivo
                  </Button>
                  <Button
                    variant="outlined"
                    component="a"
                    href={resolveFileUrl(previewItem.archivo_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir en nueva pestaña
                  </Button>
                </Stack>
              </Box>
            )
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmDeleteOpen}
        onClose={() => {
          if (eliminandoId) return;
          setConfirmDeleteOpen(false);
          setRecaudoAEliminar(null);
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0f172a' }}>
          Eliminar recaudo
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mt: 1.5, mb: 1.5 }}>
            Esta accion no se puede deshacer.
          </Alert>
          <Typography sx={{ color: '#475569', fontSize: 14 }}>
            ¿Seguro que deseas eliminar el recaudo {recaudoAEliminar?.titulo ? `"${recaudoAEliminar.titulo}"` : 'seleccionado'}?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => {
              setConfirmDeleteOpen(false);
              setRecaudoAEliminar(null);
            }}
            disabled={Boolean(eliminandoId)}
            sx={{ textTransform: 'none' }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={confirmarEliminarRecaudo}
            disabled={Boolean(eliminandoId)}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            {eliminandoId ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Recaudos;