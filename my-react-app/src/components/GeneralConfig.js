import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Snackbar,
  Switch,
  TextField,
  Typography
} from '@mui/material';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import { mediaUrl } from '../utils/mediaUrl';

const API_BASE = process.env.REACT_APP_API_URL || window.location.origin;

const EMPTY_CONSTANCIAS_CONFIG = {
  institucion_nombre: '',
  subtitulo: '',
  logos: [],
  firmante: {
    nombre: '',
    cedula: '',
    telefono: '',
    cargo: ''
  },
  pie_direccion: '',
  pie_lema: '',
  retiro_personalizado: {
    habilitado: false,
    incluir_logo_academia: false,
    institucion_nombre: '',
    subtitulo: '',
    logos: [],
    firmante: {
      nombre: '',
      cedula: '',
      telefono: '',
      cargo: ''
    },
    pie_direccion: '',
    pie_lema: '',
    template: {
      titulo: 'CARTA DE RETIRO',
      destinatario: 'A QUIEN PUEDA INTERESAR',
      cuerpo: '',
      nota: '',
      cierre: 'Constancia que se hace a peticion de la parte interesada.',
      lugarEmision: 'Barquisimeto'
    }
  },
  templates: {
    simple: {
      titulo: 'CONSTANCIA',
      destinatario: 'A QUIEN PUEDA INTERESAR',
      cuerpo: '',
      nota: '',
      cierre: 'Constancia que se hace a peticion de la parte interesada.',
      lugarEmision: 'Barquisimeto'
    },
    retiro: {
      titulo: 'CARTA DE RETIRO',
      destinatario: 'A QUIEN PUEDA INTERESAR',
      cuerpo: '',
      nota: '',
      cierre: 'Constancia que se hace a peticion de la parte interesada.',
      lugarEmision: 'Barquisimeto'
    },
    horario_entrenamiento: {
      titulo: 'CONSTANCIA',
      destinatario: 'A QUIEN PUEDA INTERESAR',
      cuerpo: '',
      nota: '',
      cierre: 'Constancia que se hace a peticion de la parte interesada.',
      lugarEmision: 'Barquisimeto'
    },
    listado_alumnos: {
      titulo: 'CONSTANCIA',
      destinatario: 'A QUIEN PUEDA INTERESAR',
      cuerpo: '',
      nota: '',
      cierre: 'Constancia que se hace a peticion de la parte interesada.',
      lugarEmision: 'Barquisimeto'
    },
    asistencia: {
      titulo: 'CONSTANCIA DE ASISTENCIA',
      destinatario: 'A QUIEN PUEDA INTERESAR',
      cuerpo: '',
      nota: '',
      cierre: 'Sin mas nada que hacer referencia y agradeciendo de antemano la mayor colaboracion que puedan prestar para con nuestro atleta.',
      lugarEmision: 'Barquisimeto'
    }
  }
};

const TEMPLATE_SECTIONS = [
  { key: 'simple', title: 'Constancia simple' },
  { key: 'retiro', title: 'Carta de retiro' },
  { key: 'horario_entrenamiento', title: 'Constancia con horario' },
  { key: 'listado_alumnos', title: 'Constancia con listado de alumnos' },
  { key: 'asistencia', title: 'Constancia de asistencia' }
];

function buildConstanciasConfig(data = {}) {
  return {
    institucion_nombre: data?.institucion_nombre || EMPTY_CONSTANCIAS_CONFIG.institucion_nombre,
    subtitulo: data?.subtitulo || EMPTY_CONSTANCIAS_CONFIG.subtitulo,
    logos: Array.isArray(data?.logos) ? data.logos : [],
    firmante: {
      ...EMPTY_CONSTANCIAS_CONFIG.firmante,
      ...(data?.firmante || {})
    },
    pie_direccion: data?.pie_direccion || EMPTY_CONSTANCIAS_CONFIG.pie_direccion,
    pie_lema: data?.pie_lema || EMPTY_CONSTANCIAS_CONFIG.pie_lema,
    retiro_personalizado: {
      habilitado: Boolean(data?.retiro_personalizado?.habilitado),
      incluir_logo_academia: Boolean(data?.retiro_personalizado?.incluir_logo_academia),
      institucion_nombre: data?.retiro_personalizado?.institucion_nombre || EMPTY_CONSTANCIAS_CONFIG.retiro_personalizado.institucion_nombre,
      subtitulo: data?.retiro_personalizado?.subtitulo || EMPTY_CONSTANCIAS_CONFIG.retiro_personalizado.subtitulo,
      logos: Array.isArray(data?.retiro_personalizado?.logos)
        ? data.retiro_personalizado.logos
        : EMPTY_CONSTANCIAS_CONFIG.retiro_personalizado.logos,
      firmante: {
        ...EMPTY_CONSTANCIAS_CONFIG.retiro_personalizado.firmante,
        ...(data?.retiro_personalizado?.firmante || {})
      },
      pie_direccion: data?.retiro_personalizado?.pie_direccion || EMPTY_CONSTANCIAS_CONFIG.retiro_personalizado.pie_direccion,
      pie_lema: data?.retiro_personalizado?.pie_lema || EMPTY_CONSTANCIAS_CONFIG.retiro_personalizado.pie_lema,
      template: {
        ...EMPTY_CONSTANCIAS_CONFIG.retiro_personalizado.template,
        ...(data?.retiro_personalizado?.template || {})
      }
    },
    templates: {
      simple: {
        ...EMPTY_CONSTANCIAS_CONFIG.templates.simple,
        ...(data?.templates?.simple || {})
      },
      retiro: {
        ...EMPTY_CONSTANCIAS_CONFIG.templates.retiro,
        ...(data?.templates?.retiro || {})
      },
      horario_entrenamiento: {
        ...EMPTY_CONSTANCIAS_CONFIG.templates.horario_entrenamiento,
        ...(data?.templates?.horario_entrenamiento || {})
      },
      listado_alumnos: {
        ...EMPTY_CONSTANCIAS_CONFIG.templates.listado_alumnos,
        ...(data?.templates?.listado_alumnos || {})
      },
      asistencia: {
        ...EMPTY_CONSTANCIAS_CONFIG.templates.asistencia,
        ...(data?.templates?.asistencia || {})
      }
    }
  };
}

function GeneralConfig() {
  const token = localStorage.getItem('token');
  const [asignandoCategorias, setAsignandoCategorias] = useState(false);
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [subiendoLogosConstancias, setSubiendoLogosConstancias] = useState(false);
  const [subiendoLogosRetiro, setSubiendoLogosRetiro] = useState(false);
  const [guardandoConstancias, setGuardandoConstancias] = useState(false);
  const [cargandoConfigAdmin, setCargandoConfigAdmin] = useState(true);
  const [logoFile, setLogoFile] = useState(null);
  const [logosConstanciasFiles, setLogosConstanciasFiles] = useState([]);
  const [logosRetiroFiles, setLogosRetiroFiles] = useState([]);
  const [logoActual, setLogoActual] = useState('');
  const [logoPreview, setLogoPreview] = useState('');
  const [dragLogoActive, setDragLogoActive] = useState(false);
  const [constanciasConfig, setConstanciasConfig] = useState(EMPTY_CONSTANCIAS_CONFIG);
  const [expandedTemplate, setExpandedTemplate] = useState(TEMPLATE_SECTIONS[0].key);
  const [expandedRetiroSubAccordion, setExpandedRetiroSubAccordion] = useState('global');
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const logoInputRef = useRef(null);
  const logosConstanciasInputRef = useRef(null);
  const logosRetiroInputRef = useRef(null);
  const apiBase = useMemo(() => (process.env.REACT_APP_API_URL || window.location.origin).replace(/\/$/, ''), []);

  const sectionCardSx = {
    p: 2.4,
    borderRadius: 3,
    border: '1px solid #e7ebf3',
    boxShadow: '0 2px 6px rgba(15, 23, 42, 0.03)',
    bgcolor: '#ffffff'
  };

  const sectionHeaderSx = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 1.5,
    mb: 2
  };

  const sectionIconWrapSx = {
    width: 44,
    height: 44,
    borderRadius: 1.6,
    bgcolor: '#eef2fb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#b45309'
  };

  const fieldLabelSx = {
    '& .MuiInputLabel-root': {
      fontSize: 11,
      fontWeight: 800,
      color: '#9aa4b2',
      letterSpacing: '0.03em',
      textTransform: 'uppercase'
    },
    '& .MuiOutlinedInput-root': {
      borderRadius: 2,
      bgcolor: '#ffffff',
      '& fieldset': {
        borderColor: '#e3e8f2'
      },
      '&:hover fieldset': {
        borderColor: '#d4dbe8'
      },
      '&.Mui-focused fieldset': {
        borderColor: '#d4dbe8'
      }
    }
  };

  const orangeButtonSx = {
    textTransform: 'none',
    fontWeight: 800,
    bgcolor: '#ff7a1a',
    px: 3.4,
    '&:hover': {
      bgcolor: '#ea6c11'
    },
    '&.Mui-disabled': {
      bgcolor: '#e6eaf2',
      color: '#a8b0bf'
    }
  };

  const asignarCategorias = async () => {
    try {
      setAsignandoCategorias(true);
      setError('');
      const res = await fetch(`${API_BASE}/api/alumnos/asignar-categorias`, {
        method: 'PUT',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'No se pudieron asignar las categorias');
      setSuccessMessage(data?.message || 'Categorias asignadas correctamente');
    } catch (err) {
      setError(err.message || 'No se pudieron asignar las categorias');
    } finally {
      setAsignandoCategorias(false);
    }
  };

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const cargarBranding = async () => {
      try {
        const res = await fetch(`${apiBase}/api/tenant/context`, {
          signal: controller.signal,
          headers: {
            'Cache-Control': 'no-cache'
          }
        });
        const payload = await res.json().catch(() => null);
        if (!active || !res.ok) return;
        setLogoActual(mediaUrl(payload?.branding?.logoUrl) || '');
      } catch (_) {
        // Si falla, se mantiene el estado actual.
      }
    };

    cargarBranding();

    return () => {
      active = false;
      controller.abort();
    };
  }, [apiBase]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const cargarConfiguracionAdmin = async () => {
      try {
        setCargandoConfigAdmin(true);
        const res = await fetch(`${apiBase}/api/configuracion`, {
          signal: controller.signal,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        const payload = await res.json().catch(() => ({}));
        if (!active || !res.ok) return;
        setConstanciasConfig(buildConstanciasConfig(payload?.constancias));
      } catch (_) {
        if (active) {
          setError((prev) => prev || 'No se pudo cargar la configuracion de constancias.');
        }
      } finally {
        if (active) {
          setCargandoConfigAdmin(false);
        }
      }
    };

    cargarConfiguracionAdmin();

    return () => {
      active = false;
      controller.abort();
    };
  }, [apiBase, token]);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(logoFile);
    setLogoPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [logoFile]);

  useEffect(() => {
    const modoAislado = Boolean(constanciasConfig?.retiro_personalizado?.habilitado);
    setExpandedRetiroSubAccordion(modoAislado ? 'aislado' : 'global');
  }, [constanciasConfig?.retiro_personalizado?.habilitado]);

  const onSelectLogoFile = (file) => {
    if (!file) return;
    setLogoFile(file);
    setError('');
  };

  const handleLogoClick = () => {
    logoInputRef.current?.click();
  };

  const handleLogoDragOver = (event) => {
    event.preventDefault();
    setDragLogoActive(true);
  };

  const handleLogoDragLeave = (event) => {
    event.preventDefault();
    setDragLogoActive(false);
  };

  const handleLogoDrop = (event) => {
    event.preventDefault();
    setDragLogoActive(false);
    const file = event.dataTransfer.files?.[0];
    onSelectLogoFile(file);
  };

  const updateConstanciasField = (field, value) => {
    setConstanciasConfig((prev) => ({ ...prev, [field]: value }));
  };

  const updateFirmanteField = (field, value) => {
    setConstanciasConfig((prev) => ({
      ...prev,
      firmante: {
        ...prev.firmante,
        [field]: value
      }
    }));
  };

  const updateTemplateField = (templateKey, field, value) => {
    setConstanciasConfig((prev) => ({
      ...prev,
      templates: {
        ...prev.templates,
        [templateKey]: {
          ...prev.templates[templateKey],
          [field]: value
        }
      }
    }));
  };

  const updateRetiroField = (field, value) => {
    setConstanciasConfig((prev) => ({
      ...prev,
      retiro_personalizado: {
        ...prev.retiro_personalizado,
        [field]: value
      }
    }));
  };

  const updateRetiroFirmanteField = (field, value) => {
    setConstanciasConfig((prev) => ({
      ...prev,
      retiro_personalizado: {
        ...prev.retiro_personalizado,
        firmante: {
          ...prev.retiro_personalizado.firmante,
          [field]: value
        }
      }
    }));
  };

  const updateRetiroTemplateField = (field, value) => {
    setConstanciasConfig((prev) => ({
      ...prev,
      retiro_personalizado: {
        ...prev.retiro_personalizado,
        template: {
          ...prev.retiro_personalizado.template,
          [field]: value
        }
      }
    }));
  };

  const handleRetiroModeChange = (checked) => {
    updateRetiroField('habilitado', checked);
    setExpandedRetiroSubAccordion(checked ? 'aislado' : 'global');
  };

  const guardarConstancias = async (nextConfig = constanciasConfig, successText = 'Configuracion de constancias actualizada.') => {
    try {
      setGuardandoConstancias(true);
      setError('');
      const res = await fetch(`${apiBase}/api/configuracion`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ constancias: nextConfig })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.detalle || 'No se pudo guardar la configuracion de constancias.');

      const normalized = buildConstanciasConfig(data?.constancias);
      setConstanciasConfig(normalized);
      setSuccessMessage(successText);
      return normalized;
    } catch (err) {
      setError(err.message || 'No se pudo guardar la configuracion de constancias.');
      return null;
    } finally {
      setGuardandoConstancias(false);
    }
  };

  const onSelectConstanciaLogos = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const existentes = constanciasConfig?.logos?.length || 0;
    const maxPendientes = Math.max(0, 3 - existentes);
    if (maxPendientes <= 0) {
      setError('Ya existen 3 logos cargados para constancias. Elimina uno antes de subir otro.');
      return;
    }

    setLogosConstanciasFiles((prev) => {
      const prevFiles = Array.isArray(prev) ? prev : [];
      const all = [...prevFiles, ...files];
      const uniqueByFingerprint = Array.from(
        new Map(all.map((file) => [`${file.name}-${file.size}-${file.lastModified}`, file])).values()
      );
      const next = uniqueByFingerprint.slice(0, maxPendientes);

      if (uniqueByFingerprint.length > maxPendientes) {
        setError(`Solo puedes preparar ${maxPendientes} logo(s) para subir en este momento.`);
      } else {
        setError('');
      }
      return next;
    });
  };

  const subirLogosConstancias = async () => {
    if (!logosConstanciasFiles.length) {
      setError('Selecciona al menos una imagen para los logos de constancias.');
      return;
    }

    try {
      setSubiendoLogosConstancias(true);
      setError('');
      const formData = new FormData();
      logosConstanciasFiles.forEach((file) => formData.append('logos', file));

      const res = await fetch(`${apiBase}/api/configuracion/constancias/logos`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.detalle || 'No se pudieron subir los logos.');

      setConstanciasConfig((prev) => ({
        ...prev,
        logos: Array.isArray(data?.logos) ? data.logos : prev.logos
      }));
      setLogosConstanciasFiles([]);
      setSuccessMessage(data?.message || 'Logos de constancias actualizados.');
    } catch (err) {
      setError(err.message || 'No se pudieron subir los logos de constancias.');
    } finally {
      setSubiendoLogosConstancias(false);
    }
  };

  const onSelectRetiroLogos = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const existentes = constanciasConfig?.retiro_personalizado?.logos?.length || 0;
    const maxPendientes = Math.max(0, 3 - existentes);
    if (maxPendientes <= 0) {
      setError('Ya existen 3 logos cargados para retiro personalizado. Elimina uno antes de subir otro.');
      return;
    }

    setLogosRetiroFiles((prev) => {
      const prevFiles = Array.isArray(prev) ? prev : [];
      const all = [...prevFiles, ...files];
      const uniqueByFingerprint = Array.from(
        new Map(all.map((file) => [`${file.name}-${file.size}-${file.lastModified}`, file])).values()
      );
      const next = uniqueByFingerprint.slice(0, maxPendientes);

      if (uniqueByFingerprint.length > maxPendientes) {
        setError(`Solo puedes preparar ${maxPendientes} logo(s) para subir en este momento.`);
      } else {
        setError('');
      }
      return next;
    });
  };

  const subirLogosRetiro = async () => {
    if (!logosRetiroFiles.length) {
      setError('Selecciona al menos una imagen para los logos de retiro personalizado.');
      return;
    }

    try {
      setSubiendoLogosRetiro(true);
      setError('');
      const formData = new FormData();
      logosRetiroFiles.forEach((file) => formData.append('logos', file));

      const res = await fetch(`${apiBase}/api/configuracion/constancias/retiro/logos`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.detalle || 'No se pudieron subir los logos de retiro personalizado.');

      setConstanciasConfig((prev) => ({
        ...prev,
        retiro_personalizado: {
          ...prev.retiro_personalizado,
          logos: Array.isArray(data?.logos) ? data.logos : prev.retiro_personalizado.logos
        }
      }));
      setLogosRetiroFiles([]);
      setSuccessMessage(data?.message || 'Logos de retiro personalizado actualizados.');
    } catch (err) {
      setError(err.message || 'No se pudieron subir los logos de retiro personalizado.');
    } finally {
      setSubiendoLogosRetiro(false);
    }
  };

  const eliminarLogoConstancia = async (logoIndex) => {
    const nextConfig = {
      ...constanciasConfig,
      logos: constanciasConfig.logos.filter((_, index) => index !== logoIndex)
    };

    setConstanciasConfig(nextConfig);
    const saved = await guardarConstancias(nextConfig, 'Logo de constancias eliminado correctamente.');
    if (!saved) {
      setConstanciasConfig(constanciasConfig);
    }
  };

  const eliminarLogoRetiro = async (logoIndex) => {
    const nextConfig = {
      ...constanciasConfig,
      retiro_personalizado: {
        ...constanciasConfig.retiro_personalizado,
        logos: constanciasConfig.retiro_personalizado.logos.filter((_, index) => index !== logoIndex)
      }
    };

    setConstanciasConfig(nextConfig);
    const saved = await guardarConstancias(nextConfig, 'Logo de retiro personalizado eliminado correctamente.');
    if (!saved) {
      setConstanciasConfig(constanciasConfig);
    }
  };

  const subirLogoAcademia = async () => {
    if (!logoFile) {
      setError('Selecciona una imagen antes de subir el logo.');
      return;
    }

    try {
      setSubiendoLogo(true);
      setError('');
      const formData = new FormData();
      formData.append('logo', logoFile);

      const res = await fetch(`${apiBase}/api/configuracion/logo`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.detalle || 'No se pudo actualizar el logo.');

      setLogoActual(mediaUrl(data?.logoUrl) || logoActual);
      setLogoFile(null);
      setSuccessMessage(data?.message || 'Logo actualizado correctamente.');
    } catch (err) {
      setError(err.message || 'No se pudo subir el logo de la academia.');
    } finally {
      setSubiendoLogo(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
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

      <Typography sx={{ fontSize: { xs: 24, md: 30 }, fontWeight: 900, color: '#0f172a', mb: 0.5 }}>
        Configuracion general
      </Typography>
      <Typography sx={{ color: '#475569', mb: 2.5 }}>
        Acciones globales de la academia que no dependen de una sede en particular.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      {/*
      <Paper sx={{ ...sectionCardSx, mb: 2.2 }}>
        <Box sx={sectionHeaderSx}>
          <Box sx={sectionIconWrapSx}>
            <Groups2OutlinedIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 800, color: '#1f2a3d', mb: 0.25 }}>Categorias de alumnos</Typography>
            <Typography sx={{ color: '#637086', fontSize: 13 }}>
              Recalcula y asigna categorias para todos los alumnos activos de la academia usando la fecha de nacimiento.
            </Typography>
          </Box>
        </Box>
        <Button
          variant="contained"
          onClick={() => setConfirmDialogOpen(true)}
          disabled={asignandoCategorias}
          sx={{
            textTransform: 'none',
            fontWeight: 800,
            bgcolor: '#0f172a',
            px: 2.8,
            '&:hover': { bgcolor: '#111b31' },
            '&.Mui-disabled': {
              bgcolor: '#e6eaf2',
              color: '#a8b0bf'
            }
          }}
        >
          {asignandoCategorias ? 'Asignando categorias...' : 'Asignar categorias'}
        </Button>
      </Paper>
      */}

      <Paper sx={{ ...sectionCardSx, mb: 2.2 }}>
        <Box sx={sectionHeaderSx}>
          <Box sx={sectionIconWrapSx}>
            <ImageOutlinedIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 800, color: '#1f2a3d', mb: 0.25 }}>Logo de la academia</Typography>
            <Typography sx={{ color: '#637086', fontSize: 13 }}>
              Sube el logo que se mostrara en el login y branding del tenant actual.
            </Typography>
          </Box>
        </Box>

        <Box sx={{ bgcolor: '#eef2fb', borderRadius: 2.2, px: { xs: 1.6, md: 2 }, py: 2 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '100px 1fr' }, gap: { xs: 2, md: 2.2 }, alignItems: 'center' }}>
            <Box sx={{ display: 'grid', justifyItems: { xs: 'center', md: 'start' } }}>
            <Box
              onDragOver={handleLogoDragOver}
              onDragLeave={handleLogoDragLeave}
              onDrop={handleLogoDrop}
              onClick={handleLogoClick}
              sx={{
                width: 84,
                height: 84,
                borderRadius: '50%',
                border: '1px solid',
                borderColor: dragLogoActive ? '#f97316' : '#d7deec',
                bgcolor: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(15, 23, 42, 0.08)'
              }}
            >
              <input
                ref={logoInputRef}
                type="file"
                hidden
                accept="image/*"
                onChange={(e) => onSelectLogoFile(e.target.files?.[0] || null)}
              />
              {logoPreview || logoActual ? (
                <Box
                  component="img"
                  src={logoPreview || logoActual}
                  alt="Logo academia"
                  sx={{ width: '100%', height: '100%', objectFit: 'contain', p: 1.1 }}
                />
              ) : (
                <Typography sx={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textAlign: 'center', px: 2 }}>
                  Subir logo
                </Typography>
              )}
            </Box>
          </Box>

            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1.1 }}>
              <Button
                variant="outlined"
                onClick={handleLogoClick}
                sx={{ textTransform: 'none', fontWeight: 700, borderColor: '#cbd5e1', color: '#516079', minWidth: 188, bgcolor: '#f3f6fc' }}
              >
                Seleccionar imagen
              </Button>
              {logoFile && (
                <Typography sx={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{logoFile.name}</Typography>
              )}
              </Box>
              <Button
                variant="contained"
                onClick={subirLogoAcademia}
                disabled={subiendoLogo || !logoFile}
                sx={{ ...orangeButtonSx, minWidth: 188 }}
              >
                {subiendoLogo ? 'Subiendo logo...' : 'Guardar logo'}
              </Button>
              <Typography sx={{ color: '#738198', fontSize: 11, mt: 0.9, fontStyle: 'italic' }}>
                Formatos permitidos: PNG, JPG (MAX. 2MB)
              </Typography>
            </Box>
          </Box>
        </Box>
      </Paper>

      <Paper sx={{ ...sectionCardSx, mb: 2.2 }}>
        <Box sx={sectionHeaderSx}>
          <Box sx={sectionIconWrapSx}>
            <ArticleOutlinedIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 800, color: '#1f2a3d', mb: 0.25 }}>Constancias por academia</Typography>
            <Typography sx={{ color: '#637086', fontSize: 13 }}>
              Personaliza encabezado, firmante, pie institucional, logos y textos por tipo de constancia.
            </Typography>
          </Box>
        </Box>

        {cargandoConfigAdmin ? (
          <Typography sx={{ color: '#64748b', fontSize: 14 }}>Cargando configuracion de constancias...</Typography>
        ) : (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5, mb: 2 }}>
              <TextField
                label="Nombre institucional"
                size="small"
                value={constanciasConfig.institucion_nombre}
                onChange={(e) => updateConstanciasField('institucion_nombre', e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={fieldLabelSx}
              />
              <TextField
                label="Subtitulo"
                size="small"
                value={constanciasConfig.subtitulo}
                onChange={(e) => updateConstanciasField('subtitulo', e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={fieldLabelSx}
              />
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5, mb: 2 }}>
              <TextField
                label="Firmante"
                size="small"
                value={constanciasConfig.firmante.nombre}
                onChange={(e) => updateFirmanteField('nombre', e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={fieldLabelSx}
              />
              <TextField
                label="Cedula"
                size="small"
                value={constanciasConfig.firmante.cedula}
                onChange={(e) => updateFirmanteField('cedula', e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={fieldLabelSx}
              />
              <TextField
                label="Telefono"
                size="small"
                value={constanciasConfig.firmante.telefono}
                onChange={(e) => updateFirmanteField('telefono', e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={fieldLabelSx}
              />
              <TextField
                label="Cargo"
                size="small"
                value={constanciasConfig.firmante.cargo}
                onChange={(e) => updateFirmanteField('cargo', e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={fieldLabelSx}
              />
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5, mb: 2.2 }}>
              <TextField
                label="Pie de direccion"
                size="small"
                multiline
                minRows={2}
                value={constanciasConfig.pie_direccion}
                onChange={(e) => updateConstanciasField('pie_direccion', e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={fieldLabelSx}
              />
              <TextField
                label="Pie de lema"
                size="small"
                multiline
                minRows={2}
                value={constanciasConfig.pie_lema}
                onChange={(e) => updateConstanciasField('pie_lema', e.target.value)}
                InputLabelProps={{ shrink: true }}
                sx={fieldLabelSx}
              />
            </Box>

            <Box sx={{ mb: 2.4, p: 1.6, borderRadius: 2.2, bgcolor: '#f8fafc', border: '1px solid #e7ebf3' }}>
              <Typography sx={{ fontWeight: 800, color: '#1f2a3d', mb: 0.6 }}>Logos para constancias</Typography>
              <Typography sx={{ color: '#64748b', fontSize: 12.5, mb: 1.4 }}>
                Puedes cargar hasta 3 logos.
              </Typography>

              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.2, mb: 1.5 }}>
                {constanciasConfig.logos.map((logo, index) => (
                  <Box
                    key={`${logo}-${index}`}
                    sx={{
                      width: 92,
                      borderRadius: 2,
                      border: '1px solid #dbe3ee',
                      bgcolor: '#fff',
                      p: 1,
                      display: 'grid',
                      gap: 0.8,
                      justifyItems: 'center'
                    }}
                  >
                    <Box
                      component="img"
                      src={mediaUrl(logo)}
                      alt={`Logo constancia ${index + 1}`}
                      sx={{ width: '100%', height: 58, objectFit: 'contain' }}
                    />
                    <Button
                      size="small"
                      color="inherit"
                      onClick={() => eliminarLogoConstancia(index)}
                      disabled={guardandoConstancias}
                      sx={{ textTransform: 'none', fontSize: 11, minWidth: 0, p: 0 }}
                    >
                      Quitar
                    </Button>
                  </Box>
                ))}
                {!constanciasConfig.logos.length && (
                  <Typography sx={{ color: '#94a3b8', fontSize: 12.5 }}>Aun no hay logos cargados.</Typography>
                )}
              </Box>

              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mb: 1 }}>
                <input
                  ref={logosConstanciasInputRef}
                  type="file"
                  hidden
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    onSelectConstanciaLogos(e.target.files);
                    e.target.value = '';
                  }}
                />
                <Button
                  variant="outlined"
                  onClick={() => logosConstanciasInputRef.current?.click()}
                  disabled={(constanciasConfig.logos?.length || 0) >= 3 || subiendoLogosConstancias}
                  sx={{ textTransform: 'none', fontWeight: 700, borderColor: '#cbd5e1', color: '#516079', bgcolor: '#f3f6fc' }}
                >
                  Seleccionar logos
                </Button>
                <Button
                  variant="contained"
                  onClick={subirLogosConstancias}
                  disabled={subiendoLogosConstancias || !logosConstanciasFiles.length}
                  sx={orangeButtonSx}
                >
                  {subiendoLogosConstancias ? 'Subiendo logos...' : `Subir ${logosConstanciasFiles.length} logo(s)`}
                </Button>
              </Box>

              {!!logosConstanciasFiles.length && (
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8 }}>
                  {logosConstanciasFiles.map((file) => (
                    <Chip key={`${file.name}-${file.lastModified}`} label={file.name} size="small" />
                  ))}
                </Box>
              )}
            </Box>

            <Box sx={{ display: 'grid', gap: 1.2 }}>
              {TEMPLATE_SECTIONS.map((section) => (
                <Accordion
                  key={section.key}
                  expanded={expandedTemplate === section.key}
                  onChange={(_, isExpanded) => setExpandedTemplate(isExpanded ? section.key : false)}
                  disableGutters
                  elevation={0}
                  sx={{
                    border: '1px solid #e7ebf3',
                    borderRadius: 2.4,
                    bgcolor: '#fbfcfe',
                    '&::before': { display: 'none' },
                    '&.Mui-expanded': { margin: 0 }
                  }}
                >
                  <AccordionSummary
                    expandIcon={<ExpandMoreRoundedIcon sx={{ color: '#607089' }} />}
                    sx={{
                      px: 2,
                      minHeight: 56,
                      '& .MuiAccordionSummary-content': {
                        my: 1.2,
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 1
                      }
                    }}
                  >
                    <Typography sx={{ fontWeight: 800, color: '#1f2a3d' }}>{section.title}</Typography>
                    <Typography sx={{ fontSize: 12, color: '#738198', mr: 1 }}>
                      {expandedTemplate === section.key ? 'Ocultar campos' : 'Mostrar campos'}
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails sx={{ px: 2, pb: 2 }}>
                    {section.key === 'retiro' ? (
                      <Box sx={{ display: 'grid', gap: 1.2 }}>
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 1.2,
                            p: 1.2,
                            borderRadius: 1.8,
                            border: '1px solid #fdba74',
                            bgcolor: '#fff7ed'
                          }}
                        >
                          <Box>
                            <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: '#7c2d12' }}>
                              Modo de retiro
                            </Typography>
                            <Typography sx={{ fontSize: 12, color: '#9a3412' }}>
                              {constanciasConfig.retiro_personalizado.habilitado
                                ? 'Retiro aislado activado'
                                : 'Usando retiro global'}
                            </Typography>
                          </Box>
                          <Switch
                            checked={Boolean(constanciasConfig.retiro_personalizado.habilitado)}
                            onChange={(e) => handleRetiroModeChange(e.target.checked)}
                            inputProps={{ 'aria-label': 'Activar retiro aislado' }}
                            sx={{
                              '& .MuiSwitch-switchBase.Mui-checked': {
                                color: '#f97316'
                              },
                              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                                backgroundColor: '#fdba74',
                                opacity: 1
                              },
                              '& .MuiSwitch-track': {
                                backgroundColor: '#cbd5e1',
                                opacity: 1
                              }
                            }}
                          />
                        </Box>

                        <Accordion
                          disableGutters
                          elevation={0}
                          expanded={expandedRetiroSubAccordion === 'global'}
                          onChange={(_, isExpanded) => setExpandedRetiroSubAccordion(isExpanded ? 'global' : false)}
                          sx={{ border: '1px solid #e7ebf3', borderRadius: 2, bgcolor: '#ffffff', '&::before': { display: 'none' } }}
                        >
                          <AccordionSummary expandIcon={<ExpandMoreRoundedIcon sx={{ color: '#607089' }} />}>
                            <Typography sx={{ fontWeight: 800, color: '#1f2a3d' }}>Formato global</Typography>
                          </AccordionSummary>
                          <AccordionDetails sx={{ pt: 0.5 }}>
                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5, mb: 1.5 }}>
                              <TextField
                                label="Titulo"
                                size="small"
                                value={constanciasConfig.templates.retiro.titulo}
                                onChange={(e) => updateTemplateField('retiro', 'titulo', e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                sx={fieldLabelSx}
                              />
                              <TextField
                                label="Destinatario"
                                size="small"
                                value={constanciasConfig.templates.retiro.destinatario}
                                onChange={(e) => updateTemplateField('retiro', 'destinatario', e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                sx={fieldLabelSx}
                              />
                            </Box>
                            <Box sx={{ display: 'grid', gap: 1.5 }}>
                              <TextField
                                label="Cuerpo"
                                size="small"
                                multiline
                                minRows={4}
                                value={constanciasConfig.templates.retiro.cuerpo}
                                onChange={(e) => updateTemplateField('retiro', 'cuerpo', e.target.value)}
                                helperText="Variables: {{alumno_nombre_completo}}, {{alumno_cedula}}, {{alumno_categoria}}, {{sede_nombre}}, {{fecha_emision_texto}}"
                                InputLabelProps={{ shrink: true }}
                                sx={fieldLabelSx}
                              />
                              <TextField
                                label="Nota"
                                size="small"
                                multiline
                                minRows={2}
                                value={constanciasConfig.templates.retiro.nota}
                                onChange={(e) => updateTemplateField('retiro', 'nota', e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                sx={fieldLabelSx}
                              />
                              <TextField
                                label="Lugar de emision"
                                size="small"
                                value={constanciasConfig.templates.retiro.lugarEmision}
                                onChange={(e) => updateTemplateField('retiro', 'lugarEmision', e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                sx={fieldLabelSx}
                              />
                              <TextField
                                label="Cierre"
                                size="small"
                                multiline
                                minRows={2}
                                value={constanciasConfig.templates.retiro.cierre}
                                onChange={(e) => updateTemplateField('retiro', 'cierre', e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                sx={fieldLabelSx}
                              />
                            </Box>
                          </AccordionDetails>
                        </Accordion>

                        <Accordion
                          disableGutters
                          elevation={0}
                          expanded={expandedRetiroSubAccordion === 'aislado'}
                          onChange={(_, isExpanded) => setExpandedRetiroSubAccordion(isExpanded ? 'aislado' : false)}
                          sx={{ border: '1px solid #e7ebf3', borderRadius: 2, bgcolor: '#ffffff', '&::before': { display: 'none' } }}
                        >
                          <AccordionSummary expandIcon={<ExpandMoreRoundedIcon sx={{ color: '#607089' }} />}>
                            <Typography sx={{ fontWeight: 800, color: '#1f2a3d' }}>Formato aislado (personalizado)</Typography>
                          </AccordionSummary>
                          <AccordionDetails sx={{ pt: 0.5 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, p: 1.2, borderRadius: 1.6, border: '1px solid #fdba74', bgcolor: '#fff' }}>
                              <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: '#9a3412' }}>
                                Incluir logo principal de academia
                              </Typography>
                              <Switch
                                checked={Boolean(constanciasConfig.retiro_personalizado.incluir_logo_academia)}
                                onChange={(e) => updateRetiroField('incluir_logo_academia', e.target.checked)}
                                inputProps={{ 'aria-label': 'Incluir logo principal en retiro aislado' }}
                              />
                            </Box>

                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5, mb: 1.5 }}>
                              <TextField
                                label="Nombre institucional (aislado)"
                                size="small"
                                multiline
                                minRows={2}
                                value={constanciasConfig.retiro_personalizado.institucion_nombre}
                                onChange={(e) => updateRetiroField('institucion_nombre', e.target.value)}
                                helperText="Usa Enter para salto de linea."
                                InputLabelProps={{ shrink: true }}
                                sx={fieldLabelSx}
                              />
                              <TextField
                                label="Subtitulo (aislado)"
                                size="small"
                                value={constanciasConfig.retiro_personalizado.subtitulo}
                                onChange={(e) => updateRetiroField('subtitulo', e.target.value)}
                                InputLabelProps={{ shrink: true }}
                                sx={fieldLabelSx}
                              />
                            </Box>

                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5, mb: 1.5 }}>
                              <TextField label="Firmante" size="small" value={constanciasConfig.retiro_personalizado.firmante.nombre} onChange={(e) => updateRetiroFirmanteField('nombre', e.target.value)} InputLabelProps={{ shrink: true }} sx={fieldLabelSx} />
                              <TextField label="Cedula" size="small" value={constanciasConfig.retiro_personalizado.firmante.cedula} onChange={(e) => updateRetiroFirmanteField('cedula', e.target.value)} InputLabelProps={{ shrink: true }} sx={fieldLabelSx} />
                              <TextField label="Telefono" size="small" value={constanciasConfig.retiro_personalizado.firmante.telefono} onChange={(e) => updateRetiroFirmanteField('telefono', e.target.value)} InputLabelProps={{ shrink: true }} sx={fieldLabelSx} />
                              <TextField label="Cargo" size="small" value={constanciasConfig.retiro_personalizado.firmante.cargo} onChange={(e) => updateRetiroFirmanteField('cargo', e.target.value)} InputLabelProps={{ shrink: true }} sx={fieldLabelSx} />
                            </Box>

                            <Box sx={{ mb: 1.5, p: 1.2, borderRadius: 1.6, border: '1px dashed #fdba74', bgcolor: '#fff7ed' }}>
                              <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#9a3412', mb: 0.5 }}>
                                Bloque fijo de liga (siempre en retiro aislado)
                              </Typography>
                              <Typography sx={{ fontSize: 12.5, color: '#7c2d12' }}>
                                Recibido por el personal de la liga: _____________________________
                              </Typography>
                              <Typography sx={{ fontSize: 12.5, color: '#7c2d12' }}>
                                Fecha: ________________________________________________
                              </Typography>
                            </Box>

                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5, mb: 1.5 }}>
                              <TextField label="Pie direccion" size="small" multiline minRows={2} value={constanciasConfig.retiro_personalizado.pie_direccion} onChange={(e) => updateRetiroField('pie_direccion', e.target.value)} InputLabelProps={{ shrink: true }} sx={fieldLabelSx} />
                              <TextField label="Pie lema" size="small" multiline minRows={2} value={constanciasConfig.retiro_personalizado.pie_lema} onChange={(e) => updateRetiroField('pie_lema', e.target.value)} InputLabelProps={{ shrink: true }} sx={fieldLabelSx} />
                            </Box>

                            <Box sx={{ mb: 1.5 }}>
                              <Typography sx={{ fontWeight: 800, color: '#9a3412', mb: 0.6 }}>Logos exclusivos para retiro</Typography>
                              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.2, mb: 1.2 }}>
                                {constanciasConfig.retiro_personalizado.logos.map((logo, index) => (
                                  <Box key={`${logo}-${index}`} sx={{ width: 92, borderRadius: 2, border: '1px solid #fdba74', bgcolor: '#fff', p: 1, display: 'grid', gap: 0.8, justifyItems: 'center' }}>
                                    <Box component="img" src={mediaUrl(logo)} alt={`Logo retiro ${index + 1}`} sx={{ width: '100%', height: 58, objectFit: 'contain' }} />
                                    <Button size="small" color="inherit" onClick={() => eliminarLogoRetiro(index)} disabled={guardandoConstancias} sx={{ textTransform: 'none', fontSize: 11, minWidth: 0, p: 0 }}>
                                      Quitar
                                    </Button>
                                  </Box>
                                ))}
                                {!constanciasConfig.retiro_personalizado.logos.length && (
                                  <Typography sx={{ color: '#c2410c', fontSize: 12.5 }}>Aun no hay logos de retiro cargados.</Typography>
                                )}
                              </Box>

                              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center', mb: 1 }}>
                                <input
                                  ref={logosRetiroInputRef}
                                  type="file"
                                  hidden
                                  accept="image/*"
                                  multiple
                                  onChange={(e) => {
                                    onSelectRetiroLogos(e.target.files);
                                    e.target.value = '';
                                  }}
                                />
                                <Button
                                  variant="outlined"
                                  onClick={() => logosRetiroInputRef.current?.click()}
                                  disabled={(constanciasConfig.retiro_personalizado.logos?.length || 0) >= 3 || subiendoLogosRetiro}
                                  sx={{ textTransform: 'none', fontWeight: 700, borderColor: '#fdba74', color: '#9a3412', bgcolor: '#fff' }}
                                >
                                  Seleccionar logos retiro
                                </Button>
                                <Button
                                  variant="contained"
                                  onClick={subirLogosRetiro}
                                  disabled={subiendoLogosRetiro || !logosRetiroFiles.length}
                                  sx={orangeButtonSx}
                                >
                                  {subiendoLogosRetiro ? 'Subiendo logos retiro...' : `Subir ${logosRetiroFiles.length} logo(s)`}
                                </Button>
                              </Box>

                              {!!logosRetiroFiles.length && (
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.8 }}>
                                  {logosRetiroFiles.map((file) => (
                                    <Chip key={`${file.name}-${file.lastModified}`} label={file.name} size="small" />
                                  ))}
                                </Box>
                              )}
                            </Box>

                            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5, mb: 1.5 }}>
                              <TextField label="Titulo" size="small" value={constanciasConfig.retiro_personalizado.template.titulo} onChange={(e) => updateRetiroTemplateField('titulo', e.target.value)} InputLabelProps={{ shrink: true }} sx={fieldLabelSx} />
                              <TextField label="Destinatario" size="small" value={constanciasConfig.retiro_personalizado.template.destinatario} onChange={(e) => updateRetiroTemplateField('destinatario', e.target.value)} InputLabelProps={{ shrink: true }} sx={fieldLabelSx} />
                            </Box>

                            <Box sx={{ display: 'grid', gap: 1.5 }}>
                              <TextField label="Cuerpo" size="small" multiline minRows={5} value={constanciasConfig.retiro_personalizado.template.cuerpo} onChange={(e) => updateRetiroTemplateField('cuerpo', e.target.value)} helperText="Variables: {{alumno_nombre_completo}}, {{alumno_cedula}}, {{alumno_categoria}}, {{alumno_fecha_nacimiento}}, {{alumno_fecha_ingreso_academia}}, {{sede_nombre}}, {{fecha_emision_texto}}" InputLabelProps={{ shrink: true }} sx={fieldLabelSx} />
                              <TextField label="Lugar de emision" size="small" value={constanciasConfig.retiro_personalizado.template.lugarEmision} onChange={(e) => updateRetiroTemplateField('lugarEmision', e.target.value)} InputLabelProps={{ shrink: true }} sx={fieldLabelSx} />
                            </Box>
                          </AccordionDetails>
                        </Accordion>
                      </Box>
                    ) : (
                      <>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5, mb: 1.5 }}>
                          <TextField
                            label="Titulo"
                            size="small"
                            value={constanciasConfig.templates[section.key].titulo}
                            onChange={(e) => updateTemplateField(section.key, 'titulo', e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            sx={fieldLabelSx}
                          />
                          <TextField
                            label="Destinatario"
                            size="small"
                            value={constanciasConfig.templates[section.key].destinatario}
                            onChange={(e) => updateTemplateField(section.key, 'destinatario', e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            sx={fieldLabelSx}
                          />
                        </Box>
                        <Box sx={{ display: 'grid', gap: 1.5 }}>
                          <TextField
                            label="Cuerpo"
                            size="small"
                            multiline
                            minRows={4}
                            value={constanciasConfig.templates[section.key].cuerpo}
                            onChange={(e) => updateTemplateField(section.key, 'cuerpo', e.target.value)}
                            helperText="Variables: {{alumno_nombre_completo}}, {{alumno_cedula}}, {{alumno_categoria}}, {{sede_nombre}}, {{horario_resumen}}, {{cantidad_alumnos}}, {{fecha_emision_texto}}, {{asistencia_persona_label}}, {{asistencia_nombre}}, {{asistencia_cedula}}, {{asistencia_dia_evento}}, {{asistencia_hora_desde}}, {{asistencia_hora_hasta}}, {{asistencia_motivo_evento}}, {{asistencia_verbo_presencia}}"
                            InputLabelProps={{ shrink: true }}
                            sx={fieldLabelSx}
                          />
                          <TextField
                            label="Nota"
                            size="small"
                            multiline
                            minRows={2}
                            value={constanciasConfig.templates[section.key].nota}
                            onChange={(e) => updateTemplateField(section.key, 'nota', e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            sx={fieldLabelSx}
                          />
                          <TextField
                            label="Lugar de emision"
                            size="small"
                            value={constanciasConfig.templates[section.key].lugarEmision}
                            onChange={(e) => updateTemplateField(section.key, 'lugarEmision', e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            sx={fieldLabelSx}
                          />
                          <TextField
                            label="Cierre"
                            size="small"
                            multiline
                            minRows={2}
                            value={constanciasConfig.templates[section.key].cierre}
                            onChange={(e) => updateTemplateField(section.key, 'cierre', e.target.value)}
                            helperText="Este texto se imprime al final de la pagina en tamano pequeño."
                            InputLabelProps={{ shrink: true }}
                            sx={fieldLabelSx}
                          />
                        </Box>
                      </>
                    )}
                  </AccordionDetails>
                </Accordion>
              ))}
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2.2 }}>
              <Button
                variant="contained"
                onClick={() => guardarConstancias()}
                disabled={guardandoConstancias}
                sx={orangeButtonSx}
              >
                {guardandoConstancias ? 'Guardando constancias...' : 'Guardar configuracion de constancias'}
              </Button>
            </Box>
          </>
        )}
      </Paper>

      <Dialog
        open={confirmDialogOpen}
        onClose={() => !asignandoCategorias && setConfirmDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0f172a' }}>
          Asignar categorias
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#475569', fontSize: 14 }}>
            Esta accion actualizara las categorias de todos los alumnos activos de la academia segun su fecha de nacimiento.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => setConfirmDialogOpen(false)}
            disabled={asignandoCategorias}
            sx={{ textTransform: 'none' }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              await asignarCategorias();
              setConfirmDialogOpen(false);
            }}
            disabled={asignandoCategorias}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            {asignandoCategorias ? 'Asignando...' : 'Confirmar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default GeneralConfig;
