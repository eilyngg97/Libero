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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  Pagination,
  TableRow,
  Tab,
  TextField,
  Tabs,
  Tooltip,
  Typography
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import GavelIcon from '@mui/icons-material/Gavel';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import { mediaUrl } from '../utils/mediaUrl';

function formatDate(dateValue) {
  if (!dateValue) return '--';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString('es-VE', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return '--';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function getDocumentoTitulo(termino) {
  const filename = String(termino?.nombre_archivo || '').trim();
  const withoutExtension = filename.replace(/\.[^/.]+$/, '').trim();
  if (withoutExtension) return withoutExtension;
  return 'Reglamento Interno';
}

function hasPreviewSupport(item) {
  const mime = String(item?.tipo_mime || '').toLowerCase();
  const filename = String(item?.nombre_archivo || '').toLowerCase();

  if (mime === 'application/pdf') return true;
  if (filename.endsWith('.pdf')) return true;

  return false;
}

function isPdfFile(item) {
  const mime = String(item?.tipo_mime || '').toLowerCase();
  const filename = String(item?.nombre_archivo || '').toLowerCase();
  return mime === 'application/pdf' || filename.endsWith('.pdf');
}

function isPdfUploadFile(file) {
  if (!file) return false;
  const mime = String(file.type || '').toLowerCase();
  const filename = String(file.name || '').toLowerCase();
  return mime === 'application/pdf' || filename.endsWith('.pdf');
}

function getInitials(nombreCompleto) {
  const nombre = String(nombreCompleto || '').trim();
  if (!nombre) return 'NA';

  const partes = nombre.split(/\s+/).filter(Boolean);
  if (partes.length === 1) {
    return partes[0].slice(0, 2).toUpperCase();
  }

  return `${partes[0][0] || ''}${partes[1][0] || ''}`.toUpperCase();
}

const DETALLE_PAGE_SIZE = 6;

function TerminosCondiciones() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [rol, setRol] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [documentos, setDocumentos] = useState([]);
  const [terminoVigente, setTerminoVigente] = useState(null);
  const [aceptado, setAceptado] = useState(false);
  const [aceptacion, setAceptacion] = useState(null);
  const [nombreAcademia, setNombreAcademia] = useState('la academia');

  const [nota, setNota] = useState('');
  const [archivo, setArchivo] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [aceptando, setAceptando] = useState(false);
  const [eliminandoId, setEliminandoId] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState('');
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [detalleOpen, setDetalleOpen] = useState(false);
  const [detalleLoading, setDetalleLoading] = useState(false);
  const [detalleError, setDetalleError] = useState('');
  const [detalleTab, setDetalleTab] = useState(0);
  const [detalleDocumento, setDetalleDocumento] = useState(null);
  const [detallePageAceptados, setDetallePageAceptados] = useState(1);
  const [detallePagePendientes, setDetallePagePendientes] = useState(1);
  const [detallePageSinUsuario, setDetallePageSinUsuario] = useState(1);
  const [detalleAceptaciones, setDetalleAceptaciones] = useState({
    total_alumnos: 0,
    total_aceptados: 0,
    total_pendientes: 0,
    total_sin_usuario: 0,
    aceptados: [],
    pendientes: [],
    sin_usuario: []
  });

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmAcceptOpen, setConfirmAcceptOpen] = useState(false);
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
    if (typeof normalized === 'string' && normalized) return normalized;

    if (value.startsWith('/')) {
      return `${apiBase.replace(/\/$/, '')}${value}`;
    }

    return value;
  }, [apiBase]);

  const cargarInformacion = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const res = await fetch(`${apiBase}/api/terminos-condiciones`, {
        headers: getAuthHeaders()
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'No se pudo cargar la informacion del reglamento interno');
      }

      const payload = await res.json();
      const rolActual = String(localStorage.getItem('rol') || '').trim().toLowerCase();
      const esRolAdmin = rolActual === 'admin' || rolActual === 'super_admin';
      const payloadAdmin = Array.isArray(payload?.documentos) || Object.prototype.hasOwnProperty.call(payload || {}, 'vigente');

      if (esRolAdmin || payloadAdmin) {
        setDocumentos(Array.isArray(payload?.documentos) ? payload.documentos : []);
        setTerminoVigente(payload?.vigente || null);
      } else {
        setDocumentos([]);
        setTerminoVigente(payload?.termino || null);
        setAceptado(Boolean(payload?.aceptado));
        setAceptacion(payload?.aceptacion || null);
      }
    } catch (err) {
      setError(err.message || 'No se pudo cargar la informacion del reglamento interno');
      setDocumentos([]);
      setTerminoVigente(null);
      setAceptado(false);
      setAceptacion(null);
    } finally {
      setLoading(false);
    }
  }, [apiBase, getAuthHeaders]);

  const cargarNombreAcademia = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/tenant/context`, {
        headers: getAuthHeaders()
      });

      if (!res.ok) return;
      const payload = await res.json().catch(() => null);

      const nombre = String(
        payload?.branding?.displayName ||
        payload?.tenant?.nombre ||
        ''
      ).trim();

      if (nombre) {
        setNombreAcademia(nombre);
      }
    } catch (_) {
      // Fallback silencioso para no interrumpir la pantalla.
    }
  }, [apiBase, getAuthHeaders]);

  useEffect(() => {
    const rolLs = String(localStorage.getItem('rol') || '').trim().toLowerCase();
    setRol(rolLs);
    cargarInformacion();
    cargarNombreAcademia();
  }, [cargarInformacion, cargarNombreAcademia]);

  const descargarArchivo = async (item) => {
    try {
      setError('');
      const fileUrl = resolveFileUrl(item?.archivo_url);
      if (!fileUrl) throw new Error('No se encontro la URL del archivo');

      const res = await fetch(fileUrl, {
        headers: getAuthHeaders()
      });

      if (!res.ok) throw new Error('No se pudo descargar el archivo');

      const blob = await res.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = item?.nombre_archivo || 'terminos-y-condiciones';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (err) {
      setError(err.message || 'No se pudo descargar el archivo');
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

      const fileUrl = resolveFileUrl(item?.archivo_url);
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

  const subirNuevoDocumento = async (event) => {
    event.preventDefault();
    if (!archivo) {
      setError('Debes seleccionar un archivo');
      return;
    }

    try {
      setSubiendo(true);
      setError('');

      const formData = new FormData();
      formData.append('archivo', archivo);
      formData.append('nota', nota);

      const res = await fetch(`${apiBase}/api/terminos-condiciones`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'No se pudo subir el documento');
      }

      setNota('');
      setArchivo(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await cargarInformacion();
    } catch (err) {
      setError(err.message || 'No se pudo subir el documento');
    } finally {
      setSubiendo(false);
    }
  };

  const eliminarDocumento = async (id) => {
    if (!id) return;
    try {
      setEliminandoId(id);
      setError('');

      const res = await fetch(`${apiBase}/api/terminos-condiciones/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'No se pudo eliminar el documento');
      }

      await cargarInformacion();
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el documento');
    } finally {
      setEliminandoId('');
      setConfirmDeleteId('');
      setConfirmDeleteOpen(false);
    }
  };

  const abrirDetalleAceptaciones = async (item) => {
    if (!item?._id) return;

    try {
      setDetalleDocumento(item);
      setDetalleOpen(true);
      setDetalleLoading(true);
      setDetalleError('');
      setDetalleTab(0);
      setDetallePageAceptados(1);
      setDetallePagePendientes(1);
      setDetallePageSinUsuario(1);

      const res = await fetch(`${apiBase}/api/terminos-condiciones/${item._id}/aceptaciones`, {
        headers: getAuthHeaders()
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'No se pudo cargar el detalle de aceptaciones');
      }

      const payload = await res.json();
      setDetalleAceptaciones({
        total_alumnos: Number(payload?.total_alumnos || payload?.total_usuarios || 0),
        total_aceptados: Number(payload?.total_aceptados || 0),
        total_pendientes: Number(payload?.total_pendientes || 0),
        total_sin_usuario: Number(payload?.total_sin_usuario || 0),
        aceptados: Array.isArray(payload?.aceptados) ? payload.aceptados : [],
        pendientes: Array.isArray(payload?.pendientes) ? payload.pendientes : [],
        sin_usuario: Array.isArray(payload?.sin_usuario) ? payload.sin_usuario : []
      });
    } catch (err) {
      setDetalleAceptaciones({
        total_alumnos: 0,
        total_aceptados: 0,
        total_pendientes: 0,
        total_sin_usuario: 0,
        aceptados: [],
        pendientes: [],
        sin_usuario: []
      });
      setDetalleError(err.message || 'No se pudo cargar el detalle de aceptaciones');
    } finally {
      setDetalleLoading(false);
    }
  };

  const cerrarDetalleAceptaciones = () => {
    setDetalleOpen(false);
    setDetalleDocumento(null);
    setDetalleLoading(false);
    setDetalleError('');
    setDetalleTab(0);
    setDetallePageAceptados(1);
    setDetallePagePendientes(1);
    setDetallePageSinUsuario(1);
  };

  const aceptarDocumentoVigente = async () => {
    if (!terminoVigente?._id || aceptado) return;

    try {
      setAceptando(true);
      setError('');

      const res = await fetch(`${apiBase}/api/terminos-condiciones/aceptar`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ termino_id: terminoVigente._id })
      });

      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'No se pudo aceptar el reglamento interno');
      }

      setConfirmAcceptOpen(false);
      await cargarInformacion();
    } catch (err) {
      setError(err.message || 'No se pudo aceptar el reglamento interno');
    } finally {
      setAceptando(false);
    }
  };

  const handleFileInputChange = (event) => {
    const file = event.target.files?.[0] || null;
    if (file && !isPdfUploadFile(file)) {
      setError('Solo se permite subir archivos PDF en el reglamento interno');
      setArchivo(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setError('');
    setArchivo(file);
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
    if (!isPdfUploadFile(file)) {
      setError('Solo se permite subir archivos PDF en el reglamento interno');
      return;
    }
    setError('');
    setArchivo(file);
  };

  const esAdmin = rol === 'admin' || rol === 'super_admin';
  const previewSrc = previewItem && isPdfFile(previewItem)
    ? (isMobile
      ? `${previewBlobUrl}#page=1&zoom=page-width&pagemode=none&toolbar=0&navpanes=0&scrollbar=0`
      : `${previewBlobUrl}#page=1&view=FitV&zoom=page-fit&pagemode=none`)
    : previewBlobUrl;
  const actionIconSx = {
    color: '#64748b',
    '&:hover': { color: '#475569', backgroundColor: 'rgba(100, 116, 139, 0.08)' }
  };

  const totalPagesAceptados = Math.max(1, Math.ceil(detalleAceptaciones.aceptados.length / DETALLE_PAGE_SIZE));
  const totalPagesPendientes = Math.max(1, Math.ceil(detalleAceptaciones.pendientes.length / DETALLE_PAGE_SIZE));
  const totalPagesSinUsuario = Math.max(1, Math.ceil(detalleAceptaciones.sin_usuario.length / DETALLE_PAGE_SIZE));

  const aceptadosPaginados = useMemo(() => {
    const start = (detallePageAceptados - 1) * DETALLE_PAGE_SIZE;
    return detalleAceptaciones.aceptados.slice(start, start + DETALLE_PAGE_SIZE);
  }, [detalleAceptaciones.aceptados, detallePageAceptados]);

  const pendientesPaginados = useMemo(() => {
    const start = (detallePagePendientes - 1) * DETALLE_PAGE_SIZE;
    return detalleAceptaciones.pendientes.slice(start, start + DETALLE_PAGE_SIZE);
  }, [detalleAceptaciones.pendientes, detallePagePendientes]);

  const sinUsuarioPaginados = useMemo(() => {
    const start = (detallePageSinUsuario - 1) * DETALLE_PAGE_SIZE;
    return detalleAceptaciones.sin_usuario.slice(start, start + DETALLE_PAGE_SIZE);
  }, [detalleAceptaciones.sin_usuario, detallePageSinUsuario]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc', p: { xs: 2, md: 4 } }}>
      <Box sx={{ maxWidth: 1200, mx: 'auto', display: 'grid', gap: 2.5 }}>
        <Box>
          <Typography variant="h5" sx={{ color: '#0f172a', fontWeight: 800 }}>
            Reglamento Interno {nombreAcademia ? `de ${nombreAcademia}` : ''}
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
            {esAdmin
              ? 'Sube la version vigente del reglamento interno y una nota informativa para tus usuarios.'
              : 'Por favor, lea detenidamente los reglamentos internos antes de continuar con la gestión deportiva.'}
          </Typography>
        </Box>

        {error ? <Alert severity="error">{error}</Alert> : null}

        {loading ? (
          <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid #e2e8f0', py: 6, display: 'grid', placeItems: 'center' }}>
            <CircularProgress size={28} />
          </Paper>
        ) : null}

        {!loading && esAdmin ? (
          <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid #e2e8f0' }}>
            <Typography variant="subtitle1" sx={{ color: '#0f172a', fontWeight: 700, mb: 1.5 }}>
              Subir nueva version
            </Typography>
            <Box component="form" onSubmit={subirNuevoDocumento} sx={{ display: 'grid', gap: 1.5 }}>
              <Box
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                sx={{
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
                  PDF (MAX. 20MB)
                </Typography>
                <input
                  ref={fileInputRef}
                  hidden
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={handleFileInputChange}
                />
              </Box>

              {archivo ? (
                <Box
                  sx={{
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
                    onClick={(event) => {
                      event.stopPropagation();
                      setArchivo(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                  >
                    <CloseIcon sx={{ fontSize: 16, color: '#94a3b8' }} />
                  </IconButton>
                </Box>
              ) : null}

              <TextField
                label="Nota"
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Ej: Esta version entra en vigencia desde el 01/06/2026"
                multiline
                minRows={3}
              />

              <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="submit" variant="contained" disabled={subiendo || !archivo}>
                  {subiendo ? 'Subiendo...' : 'Guardar version'}
                </Button>
              </Box>
            </Box>
          </Paper>
        ) : null}

        {!loading && esAdmin ? (
          <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            {documentos.length === 0 ? (
              <Box sx={{ p: 3 }}>
                <Typography sx={{ color: '#64748b' }}>No hay documentos cargados.</Typography>
              </Box>
            ) : (
              isMobile ? (
                <Box sx={{ display: 'grid', gap: 1.5, p: 1.5 }}>
                  {documentos.map((item) => (
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
                          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontWeight: 800, color: '#0f172a' }}>
                              v{item.version || '--'}
                            </Typography>
                            {item.vigente ? <Chip size="small" color="success" label="Vigente" /> : null}
                          </Stack>
                          <Typography variant="caption" sx={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>
                            {formatDate(item.createdAt)}
                          </Typography>
                        </Box>

                        <Typography variant="body2" sx={{ color: '#475569' }}>
                          {item.nota || '--'}
                        </Typography>

                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                          <InsertDriveFileIcon sx={{ color: '#fb923c', fontSize: 18, flexShrink: 0 }} />
                          <Box sx={{ minWidth: 0 }}>
                            <Typography
                              variant="body2"
                              sx={{ color: '#334155', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                            >
                              {item.nombre_archivo || '--'}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>
                              {formatBytes(item.tamano_bytes)}
                            </Typography>
                          </Box>
                        </Box>

                        <Button
                          size="small"
                          variant="text"
                          onClick={() => abrirDetalleAceptaciones(item)}
                          sx={{
                            textTransform: 'none',
                            px: 0,
                            minWidth: 'auto',
                            justifyContent: 'flex-start',
                            fontWeight: 700
                          }}
                        >
                          {Number(item.total_aceptaciones || 0)} aceptados
                        </Button>

                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Tooltip title="Ver" arrow>
                            <IconButton size="small" onClick={() => abrirPreview(item)} sx={actionIconSx}>
                              <VisibilityIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Descargar" arrow>
                            <IconButton size="small" onClick={() => descargarArchivo(item)} sx={actionIconSx}>
                              <DownloadIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Eliminar" arrow>
                            <IconButton
                              size="small"
                              onClick={() => {
                                setConfirmDeleteId(item._id);
                                setConfirmDeleteOpen(true);
                              }}
                              disabled={eliminandoId === item._id}
                              sx={actionIconSx}
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </Box>
                    </Paper>
                  ))}
                </Box>
              ) : (
                <TableContainer>
                  <Table size="small" sx={{ minWidth: 760 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Version</TableCell>
                        <TableCell>Nota</TableCell>
                        <TableCell>Archivo</TableCell>
                        <TableCell>Aceptaciones</TableCell>
                        <TableCell>Fecha</TableCell>
                        <TableCell align="right">Acciones</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {documentos.map((item) => (
                        <TableRow key={item._id} hover>
                          <TableCell>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Typography sx={{ fontWeight: 700 }}>v{item.version || '--'}</Typography>
                              {item.vigente ? <Chip size="small" color="success" label="Vigente" /> : null}
                            </Stack>
                          </TableCell>
                          <TableCell sx={{ maxWidth: 280 }}>{item.nota || '--'}</TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ color: '#334155' }}>{item.nombre_archivo || '--'}</Typography>
                            <Typography variant="caption" sx={{ color: '#64748b' }}>{formatBytes(item.tamano_bytes)}</Typography>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="small"
                              variant="text"
                              onClick={() => abrirDetalleAceptaciones(item)}
                              sx={{
                                textTransform: 'none',
                                px: 0,
                                minWidth: 'auto',
                                justifyContent: 'flex-start',
                                fontWeight: 700
                              }}
                            >
                              {Number(item.total_aceptaciones || 0)} aceptados
                            </Button>
                          </TableCell>
                          <TableCell>{formatDate(item.createdAt)}</TableCell>
                          <TableCell align="right">
                            <Stack direction="row" spacing={1} justifyContent="flex-end">
                              <Tooltip title="Ver" arrow>
                                <IconButton size="small" onClick={() => abrirPreview(item)} sx={actionIconSx}>
                                  <VisibilityIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Descargar" arrow>
                                <IconButton size="small" onClick={() => descargarArchivo(item)} sx={actionIconSx}>
                                  <DownloadIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Eliminar" arrow>
                                <IconButton
                                  size="small"
                                  onClick={() => {
                                    setConfirmDeleteId(item._id);
                                    setConfirmDeleteOpen(true);
                                  }}
                                  disabled={eliminandoId === item._id}
                                  sx={actionIconSx}
                                >
                                  <DeleteOutlineIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
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
        ) : null}

        <Dialog
          open={confirmDeleteOpen}
          onClose={() => {
            if (eliminandoId) return;
            setConfirmDeleteOpen(false);
            setConfirmDeleteId('');
          }}
          fullWidth
          maxWidth="xs"
        >
          <DialogTitle sx={{ fontWeight: 800, color: '#0f172a' }}>
            Confirmar eliminación
          </DialogTitle>
          <DialogContent>
            <Alert severity="warning" sx={{ mt: 1.5, mb: 1.5 }}>
              Esta acción eliminará el documento y no se puede deshacer.
            </Alert>
            <Typography sx={{ color: '#475569', fontSize: 14 }}>
              ¿Seguro que deseas eliminar este documento?
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button
              onClick={() => {
                if (eliminandoId) return;
                setConfirmDeleteOpen(false);
                setConfirmDeleteId('');
              }}
              disabled={eliminandoId}
              sx={{
                textTransform: 'none',
                bgcolor: '#e5e7eb',
                color: '#374151',
                '&:hover': { bgcolor: '#d1d5db' }
              }}
            >
              Cancelar
            </Button>
            <Button
              variant="contained"
              color="error"
              onClick={() => eliminarDocumento(confirmDeleteId)}
              disabled={eliminandoId}
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              {eliminandoId ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogActions>
        </Dialog>

        {!loading && !esAdmin ? (
          <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid #e2e8f0', overflow: 'hidden', p: { xs: 1, sm: 2, md: 0 } }}>
            {!terminoVigente ? (
              <Box sx={{ p: 3 }}>
                <Typography sx={{ color: '#64748b' }}>
                  Tu academia aun no ha publicado el reglamento interno.
                </Typography>
              </Box>
            ) : (
              <>
                <Box sx={{ p: { xs: 1.2, sm: 2, md: 2.5 }, borderBottom: '1px solid #e5e7eb', bgcolor: '#fafafa' }}>
                  <Stack direction="row" spacing={1.5} alignItems="flex-start" justifyContent="space-between">
                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ minWidth: 0 }}>
                      <Box
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: 1.5,
                          bgcolor: '#fee8d8',
                          color: '#b45309',
                          display: 'grid',
                          placeItems: 'center',
                          flexShrink: 0
                        }}
                      >
                        <GavelIcon sx={{ fontSize: 20 }} />
                      </Box>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 800, color: '#1f2937', lineHeight: 1.2 }}>
                          {getDocumentoTitulo(terminoVigente)}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#6b7280' }}>
                          Documento vigente v{terminoVigente.version || '--'} • Actualizado: {formatDate(terminoVigente.createdAt)}
                        </Typography>
                      </Box>
                    </Stack>
                    {aceptado ? (
                      <Chip
                        size="small"
                        icon={<CheckCircleIcon sx={{ color: '#15803d !important' }} />}
                        label="ACEPTADO"
                        sx={{
                          bgcolor: '#dcfce7',
                          color: '#166534',
                          fontWeight: 700,
                          border: '1px solid #86efac'
                        }}
                      />
                    ) : (
                      <Chip
                        size="small"
                        label="PENDIENTE POR ACEPTAR"
                        sx={{
                          bgcolor: '#ffedd5',
                          color: '#9a3412',
                          fontWeight: 800,
                          border: '1px solid #fdba74',
                          letterSpacing: 0.2
                        }}
                      />
                    )}
                  </Stack>
                </Box>

                <Box sx={{ p: { xs: 1.2, sm: 2, md: 2.5 }, borderBottom: '1px solid #e5e7eb' }}>
                  <Typography variant="body2" sx={{ color: '#374151', fontWeight: 600, mb: 1.25, lineHeight: 1.5 }}>
                    {terminoVigente.nota || 'El presente documento establece las normativas, deberes y derechos de los administradores y usuarios dentro de la plataforma de gestión de la academia.'}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#4b5563', lineHeight: 1.55 }}>
                    Al hacer clic en "Aceptar", usted confirma que ha leido, comprendido y esta de acuerdo con el reglamento interno de {nombreAcademia}.
                  </Typography>
                </Box>

                <Box sx={{ p: { xs: 1.2, sm: 2, md: 2.5 }, borderBottom: '1px solid #e5e7eb' }}>
                  <Box
                    sx={{
                      display: 'grid',
                      gap: { xs: 1, sm: 1.25 },
                      gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }
                    }}
                  >
                    <Button
                      variant="outlined"
                      startIcon={<VisibilityIcon />}
                      onClick={() => abrirPreview(terminoVigente)}
                      sx={{
                        minHeight: 42,
                        fontSize: { xs: 13, sm: 15 },
                        textTransform: 'none',
                        fontWeight: 700,
                        borderColor: '#d1d5db',
                        color: '#374151',
                        width: '100%'
                      }}
                    >
                      Ver y leer
                    </Button>
                    <Button
                      variant="outlined"
                      startIcon={<DownloadIcon />}
                      onClick={() => descargarArchivo(terminoVigente)}
                      sx={{
                        minHeight: 42,
                        fontSize: { xs: 13, sm: 15 },
                        textTransform: 'none',
                        fontWeight: 700,
                        borderColor: '#d1d5db',
                        color: '#374151',
                        width: '100%'
                      }}
                    >
                      Descargar
                    </Button>
                    <Button
                      variant="contained"
                      onClick={() => setConfirmAcceptOpen(true)}
                      disabled={aceptado || aceptando}
                      startIcon={<CheckCircleIcon />}
                      sx={{
                        minHeight: 42,
                        fontSize: { xs: 13, sm: 15 },
                        textTransform: 'none',
                        fontWeight: 800,
                        bgcolor: '#16a34a',
                        width: '100%',
                        '&:hover': { bgcolor: '#15803d' },
                        '&.Mui-disabled': {
                          bgcolor: '#bbf7d0',
                          color: '#166534'
                        }
                      }}
                    >
                      {aceptado ? 'Reglamento aceptado' : (aceptando ? 'Aceptando...' : 'Aceptar reglamento')}
                    </Button>
                  </Box>
                </Box>

                <Box sx={{ px: { xs: 1.2, sm: 2, md: 2.5 }, py: { xs: 1, sm: 1.25 }, bgcolor: '#f3f4f6' }}>
                  <Stack direction="row" spacing={1} alignItems="flex-start">
                    <InfoOutlinedIcon sx={{ color: '#6b7280', mt: 0.1, fontSize: 18 }} />
                    <Typography variant="caption" sx={{ color: '#4b5563', lineHeight: 1.45, fontWeight: 600 }}>
                      Nota importante: La aceptación del reglamento interno es un proceso irreversible. Una vez aceptado, quedará un registro digital con fecha y hora.
                    </Typography>
                  </Stack>
                </Box>
              </>
            )}
          </Paper>
        ) : null}
      </Box>

      <Dialog
        open={detalleOpen}
        onClose={cerrarDetalleAceptaciones}
        fullWidth
        maxWidth="md"
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: 'hidden',
            border: '1px solid #e2e8f0'
          }
        }}
      >
        <DialogTitle
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            px: { xs: 2, sm: 2.5 },
            py: 2,
            borderBottom: '1px solid #e5e7eb'
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
              Estado de aceptaciones
            </Typography>
            <Typography variant="caption" sx={{ color: '#64748b' }}>
              {detalleDocumento ? `Documento v${detalleDocumento.version || '--'}` : ''}
            </Typography>
          </Box>
          <IconButton onClick={cerrarDetalleAceptaciones}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ p: 0, bgcolor: '#f8fafc' }}>
          <Box sx={{ px: { xs: 1.5, sm: 2.5 }, pt: 2, pb: 1.5 }}>
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip
                size="small"
                label={`Atletas: ${detalleAceptaciones.total_alumnos}`}
                sx={{ fontWeight: 700, bgcolor: '#e2e8f0', color: '#334155' }}
              />
              <Chip
                size="small"
                label={`Aceptados: ${detalleAceptaciones.total_aceptados}`}
                sx={{ fontWeight: 700, bgcolor: '#dcfce7', color: '#166534', border: '1px solid #86efac' }}
              />
              <Chip
                size="small"
                label={`Pendientes: ${detalleAceptaciones.total_pendientes}`}
                sx={{ fontWeight: 700, bgcolor: '#ffedd5', color: '#9a3412', border: '1px solid #fdba74' }}
              />
              <Chip
                size="small"
                label={`Sin usuario: ${detalleAceptaciones.total_sin_usuario}`}
                sx={{ fontWeight: 700, bgcolor: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' }}
              />
            </Stack>
          </Box>

          <Tabs
            value={detalleTab}
            onChange={(_, value) => setDetalleTab(value)}
            variant="fullWidth"
            sx={{
              minHeight: 44,
              borderTop: '1px solid #e5e7eb',
              borderBottom: '1px solid #e5e7eb',
              bgcolor: '#ffffff',
              '& .MuiTabs-indicator': {
                backgroundColor: '#ea580c',
                height: 3
              },
              '& .MuiTab-root': {
                minHeight: 44,
                textTransform: 'uppercase',
                letterSpacing: 0.35,
                fontSize: 12,
                fontWeight: 800,
                color: '#64748b'
              },
              '& .Mui-selected': {
                color: '#c2410c !important'
              }
            }}
          >
            <Tab label={`Aceptados (${detalleAceptaciones.total_aceptados})`} />
            <Tab label={`Pendientes (${detalleAceptaciones.total_pendientes})`} />
            <Tab label={`Sin usuario (${detalleAceptaciones.total_sin_usuario})`} />
          </Tabs>

          <Box sx={{ px: { xs: 1.5, sm: 2.5 }, py: 2, maxHeight: 380, overflowY: 'auto' }}>
            {detalleError ? (
              <Alert severity="error">{detalleError}</Alert>
            ) : detalleLoading ? (
              <Box sx={{ py: 6, display: 'grid', placeItems: 'center' }}>
                <CircularProgress size={28} />
              </Box>
            ) : detalleTab === 0 ? (
              detalleAceptaciones.aceptados.length === 0 ? (
                <Alert severity="info">Ningun atleta ha aceptado este documento aun.</Alert>
              ) : (
                <Stack spacing={1.1}>
                  {aceptadosPaginados.map((item) => (
                    <Paper
                      key={String(item.alumno_id)}
                      variant="outlined"
                      sx={{ p: 1.5, borderRadius: 2, borderColor: '#e2e8f0', bgcolor: '#ffffff' }}
                    >
                      <Stack direction="row" spacing={1.2} alignItems="flex-start" justifyContent="space-between">
                        <Stack direction="row" spacing={1.1} sx={{ minWidth: 0, flex: 1 }}>
                          <Box
                            sx={{
                              width: 34,
                              height: 34,
                              borderRadius: '50%',
                              bgcolor: '#1e293b',
                              color: '#ffffff',
                              fontSize: 11,
                              fontWeight: 800,
                              display: 'grid',
                              placeItems: 'center',
                              flexShrink: 0
                            }}
                          >
                            {getInitials(item.alumno_nombre)}
                          </Box>

                          <Box sx={{ minWidth: 0 }}>
                            <Typography
                              sx={{
                                fontWeight: 800,
                                color: '#0f172a',
                                fontSize: 13,
                                textTransform: 'uppercase',
                                lineHeight: 1.2
                              }}
                            >
                              {item.alumno_nombre || 'Sin nombre'}
                            </Typography>
                          </Box>
                        </Stack>

                        <CheckCircleIcon sx={{ color: '#16a34a', fontSize: 18, mt: 0.2, flexShrink: 0 }} />
                      </Stack>

                      <Box
                        sx={{
                          mt: 1,
                          pt: 0.85,
                          borderTop: '1px dashed #e2e8f0',
                          display: 'grid',
                          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                          gap: 0.8
                        }}
                      >
                        <Box>
                          <Typography sx={{ color: '#94a3b8', fontSize: 10, fontWeight: 800, letterSpacing: 0.35 }}>
                            ACEPTADO EL
                          </Typography>
                          <Typography sx={{ color: '#334155', fontSize: 12, fontWeight: 700 }}>
                            {formatDate(item.accepted_at)}
                          </Typography>
                        </Box>

                        <Box>
                          <Typography sx={{ color: '#94a3b8', fontSize: 10, fontWeight: 800, letterSpacing: 0.35 }}>
                            USUARIO PORTAL
                          </Typography>
                          <Typography sx={{ color: '#334155', fontSize: 12, fontWeight: 700 }}>
                            {item.usuario_nombre || item.email || '--'}
                          </Typography>
                        </Box>
                      </Box>
                    </Paper>
                  ))}

                  {totalPagesAceptados > 1 ? (
                    <Box sx={{ pt: 0.75, display: 'flex', justifyContent: 'center' }}>
                      <Pagination
                        page={detallePageAceptados}
                        count={totalPagesAceptados}
                        onChange={(_, page) => setDetallePageAceptados(page)}
                        color="primary"
                        size="small"
                        siblingCount={isMobile ? 0 : 1}
                        boundaryCount={1}
                      />
                    </Box>
                  ) : null}
                </Stack>
              )
            ) : detalleTab === 1 ? (
              detalleAceptaciones.pendientes.length === 0 ? (
                <Alert severity="success">Todos los atletas objetivo ya aceptaron el documento.</Alert>
              ) : (
                <Stack spacing={1.1}>
                  {pendientesPaginados.map((item) => (
                    <Paper
                      key={String(item.alumno_id)}
                      variant="outlined"
                      sx={{ p: 1.5, borderRadius: 2, borderColor: '#e2e8f0', bgcolor: '#ffffff' }}
                    >
                      <Stack direction="row" spacing={1.2} alignItems="flex-start" justifyContent="space-between">
                        <Stack direction="row" spacing={1.1} sx={{ minWidth: 0, flex: 1 }}>
                          <Box
                            sx={{
                              width: 34,
                              height: 34,
                              borderRadius: '50%',
                              bgcolor: '#334155',
                              color: '#ffffff',
                              fontSize: 11,
                              fontWeight: 800,
                              display: 'grid',
                              placeItems: 'center',
                              flexShrink: 0
                            }}
                          >
                            {getInitials(item.alumno_nombre)}
                          </Box>

                          <Box sx={{ minWidth: 0 }}>
                            <Typography
                              sx={{
                                fontWeight: 800,
                                color: '#0f172a',
                                fontSize: 13,
                                textTransform: 'uppercase',
                                lineHeight: 1.2
                              }}
                            >
                              {item.alumno_nombre || 'Sin nombre'}
                            </Typography>
                          </Box>
                        </Stack>

                        <Chip
                          size="small"
                          label="Pendiente"
                          sx={{
                            height: 22,
                            bgcolor: '#ffedd5',
                            color: '#9a3412',
                            border: '1px solid #fdba74',
                            fontWeight: 800,
                            fontSize: 10,
                            mt: 0.1
                          }}
                        />
                      </Stack>

                      <Box
                        sx={{
                          mt: 1,
                          pt: 0.85,
                          borderTop: '1px dashed #e2e8f0',
                          display: 'grid',
                          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                          gap: 0.8
                        }}
                      >
                        <Box>
                          <Typography sx={{ color: '#94a3b8', fontSize: 10, fontWeight: 800, letterSpacing: 0.35 }}>
                            ESTADO
                          </Typography>
                          <Typography sx={{ color: '#9a3412', fontSize: 12, fontWeight: 800 }}>
                            Pendiente por aceptar
                          </Typography>
                        </Box>

                        <Box>
                          <Typography sx={{ color: '#94a3b8', fontSize: 10, fontWeight: 800, letterSpacing: 0.35 }}>
                            USUARIO PORTAL
                          </Typography>
                          <Typography sx={{ color: '#334155', fontSize: 12, fontWeight: 700 }}>
                            {item.usuario_nombre || item.email || '--'}
                          </Typography>
                        </Box>
                      </Box>
                    </Paper>
                  ))}

                  {totalPagesPendientes > 1 ? (
                    <Box sx={{ pt: 0.75, display: 'flex', justifyContent: 'center' }}>
                      <Pagination
                        page={detallePagePendientes}
                        count={totalPagesPendientes}
                        onChange={(_, page) => setDetallePagePendientes(page)}
                        color="primary"
                        size="small"
                        siblingCount={isMobile ? 0 : 1}
                        boundaryCount={1}
                      />
                    </Box>
                  ) : null}
                </Stack>
              )
            ) : (
              detalleAceptaciones.sin_usuario.length === 0 ? (
                <Alert severity="info">No hay atletas sin usuario vinculado.</Alert>
              ) : (
                <Stack spacing={1.1}>
                  {sinUsuarioPaginados.map((item) => (
                    <Paper
                      key={String(item.alumno_id)}
                      variant="outlined"
                      sx={{ p: 1.5, borderRadius: 2, borderColor: '#e2e8f0', bgcolor: '#ffffff' }}
                    >
                      <Stack direction="row" spacing={1.2} alignItems="flex-start" justifyContent="space-between">
                        <Stack direction="row" spacing={1.1} sx={{ minWidth: 0, flex: 1 }}>
                          <Box
                            sx={{
                              width: 34,
                              height: 34,
                              borderRadius: '50%',
                              bgcolor: '#475569',
                              color: '#ffffff',
                              fontSize: 11,
                              fontWeight: 800,
                              display: 'grid',
                              placeItems: 'center',
                              flexShrink: 0
                            }}
                          >
                            {getInitials(item.alumno_nombre)}
                          </Box>

                          <Box sx={{ minWidth: 0 }}>
                            <Typography
                              sx={{
                                fontWeight: 800,
                                color: '#0f172a',
                                fontSize: 13,
                                textTransform: 'uppercase',
                                lineHeight: 1.2
                              }}
                            >
                              {item.alumno_nombre || 'Sin nombre'}
                            </Typography>
                          </Box>
                        </Stack>

                        <Chip
                          size="small"
                          label="Sin usuario"
                          sx={{
                            height: 22,
                            bgcolor: '#e2e8f0',
                            color: '#334155',
                            border: '1px solid #cbd5e1',
                            fontWeight: 800,
                            fontSize: 10,
                            mt: 0.1
                          }}
                        />
                      </Stack>

                      <Box
                        sx={{
                          mt: 1,
                          pt: 0.85,
                          borderTop: '1px dashed #e2e8f0',
                          display: 'grid',
                          gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
                          gap: 0.8
                        }}
                      >
                        <Box>
                          <Typography sx={{ color: '#94a3b8', fontSize: 10, fontWeight: 800, letterSpacing: 0.35 }}>
                            ESTADO
                          </Typography>
                          <Typography sx={{ color: '#334155', fontSize: 12, fontWeight: 700 }}>
                            No tiene usuario vinculado
                          </Typography>
                        </Box>

                        <Box>
                          <Typography sx={{ color: '#94a3b8', fontSize: 10, fontWeight: 800, letterSpacing: 0.35 }}>
                            ACCION SUGERIDA
                          </Typography>
                          <Typography sx={{ color: '#334155', fontSize: 12, fontWeight: 700 }}>
                            Crear o vincular usuario
                          </Typography>
                        </Box>
                      </Box>
                    </Paper>
                  ))}

                  {totalPagesSinUsuario > 1 ? (
                    <Box sx={{ pt: 0.75, display: 'flex', justifyContent: 'center' }}>
                      <Pagination
                        page={detallePageSinUsuario}
                        count={totalPagesSinUsuario}
                        onChange={(_, page) => setDetallePageSinUsuario(page)}
                        color="primary"
                        size="small"
                        siblingCount={isMobile ? 0 : 1}
                        boundaryCount={1}
                      />
                    </Box>
                  ) : null}
                </Stack>
              )
            )}
          </Box>
        </DialogContent>
      </Dialog>

      <Dialog
        open={previewOpen}
        onClose={cerrarPreview}
        fullWidth
        maxWidth="lg"
        PaperProps={{
          sx: {
            width: { xs: '99vw', sm: '96vw', md: '80vw', lg: '1200px' },
            maxWidth: '99vw',
            height: { xs: '80vh', sm: '90vh', md: '94vh' },
            maxHeight: '98vh',
            overflow: 'hidden'
          }
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1, fontSize: { xs: 16, sm: 18 } }}>
          <Typography sx={{ fontWeight: 700, fontSize: { xs: 15, sm: 17 } }}>
            {previewItem?.nombre_archivo || 'Vista de documento'}
          </Typography>
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
                  title={previewItem.nombre_archivo || 'Documento'}
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
              </Box>
            )
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmAcceptOpen}
        onClose={() => {
          if (aceptando) return;
          setConfirmAcceptOpen(false);
        }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0f172a' }}>
          Confirmar aceptacion
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mt: 1.5, mb: 1.5 }}>
            Esta accion no se puede deshacer.
          </Alert>
          <Typography sx={{ color: '#475569', fontSize: 14 }}>
            ¿Seguro que deseas aceptar los terminos y condiciones?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setConfirmAcceptOpen(false)}
            disabled={aceptando}
            sx={{
              textTransform: 'none',
              bgcolor: '#e5e7eb',
              color: '#374151',
              '&:hover': { bgcolor: '#d1d5db' }
            }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={aceptarDocumentoVigente}
            disabled={aceptando}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            {aceptando ? 'Aceptando...' : 'Aceptar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default TerminosCondiciones;
