import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Slider,
  TextField,
  Typography
} from '@mui/material';
import DownloadIcon from '@mui/icons-material/Download';
import PhotoCameraOutlinedIcon from '@mui/icons-material/PhotoCameraOutlined';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import ImageSearchOutlinedIcon from '@mui/icons-material/ImageSearchOutlined';
import AutoFixHighOutlinedIcon from '@mui/icons-material/AutoFixHighOutlined';
import Person2OutlinedIcon from '@mui/icons-material/Person2Outlined';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import NotesOutlinedIcon from '@mui/icons-material/NotesOutlined';
import LightbulbOutlinedIcon from '@mui/icons-material/LightbulbOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import { Rnd } from 'react-rnd';
import { mediaUrl } from '../utils/mediaUrl';
import { toPng } from 'html-to-image';
import './CumpleanosPostGenerator.css';

const LAYOUTS = [
  { id: 'neon', nombre: 'Neon' },
  { id: 'minimal', nombre: 'Minimalista' },
  { id: 'badge', nombre: 'Badge' },
  { id: 'aurora', nombre: 'Aurora' },
  { id: 'diagonal', nombre: 'Diagonal' },
  { id: 'confetti', nombre: 'Confetti' }
];

const FORMATS = [
  { id: 'post', nombre: 'Post 1080x1080', width: 1080, height: 1080 },
  { id: 'story', nombre: 'Story 1080x1920', width: 1080, height: 1920 }
];

const DEFAULT_COLORS = {
  fondo: '#1a1a3e',
  texto: '#ffffff',
  acento: '#ec4899',
  detalle: '#7dd3fc'
};

const DEFAULT_MESSAGE = '¡Te deseamos un gran día lleno de éxitos en la cancha!';
const DEFAULT_LAYOUT = 'neon';
const DEFAULT_FORMAT = 'post';
const DEFAULT_TEXT_SCALE = 0.84;
const DEFAULT_MESSAGE_SCALE = 0.9;
const DIAGONAL_TEXT_SCALE = 0.78;
const DIAGONAL_MESSAGE_SCALE = 0.86;
const MESSAGE_MIN_GAP = {
  post: 0.012,
  story: 0.01
};

function stackMensajeDebajoTexto(layers = {}, formatKey = DEFAULT_FORMAT) {
  const texto = layers?.texto;
  const mensaje = layers?.mensaje;
  if (!texto || !mensaje) return layers;

  const minGap = MESSAGE_MIN_GAP[formatKey] ?? 0.01;
  const minY = clamp(texto.y + texto.h + minGap, 0, 1 - mensaje.h);
  const centeredX = clamp(texto.x + ((texto.w - mensaje.w) / 2), 0, 1 - mensaje.w);

  return {
    ...layers,
    mensaje: {
      ...mensaje,
      x: centeredX,
      y: Math.max(mensaje.y, minY)
    }
  };
}

const DEFAULT_ELEMENTS_BY_FORMAT = {
  post: {
    logo: { x: 0.78, y: 0.05, w: 0.16, h: 0.1 },
    foto: { x: 0.31, y: 0.16, w: 0.38, h: 0.38 },
    texto: { x: 0.12, y: 0.58, w: 0.76, h: 0.18, fontScale: DEFAULT_TEXT_SCALE },
    mensaje: { x: 0.09, y: 0.76, w: 0.82, h: 0.16, fontScale: DEFAULT_MESSAGE_SCALE }
  },
  story: {
    logo: { x: 0.74, y: 0.04, w: 0.2, h: 0.09 },
    foto: { x: 0.2, y: 0.18, w: 0.6, h: 0.34 },
    texto: { x: 0.08, y: 0.58, w: 0.84, h: 0.16, fontScale: DEFAULT_TEXT_SCALE },
    mensaje: { x: 0.06, y: 0.76, w: 0.88, h: 0.16, fontScale: DEFAULT_MESSAGE_SCALE }
  }
};

function cloneDefaultElementsByFormat() {
  return {
    post: {
      logo: { ...DEFAULT_ELEMENTS_BY_FORMAT.post.logo },
      foto: { ...DEFAULT_ELEMENTS_BY_FORMAT.post.foto },
      texto: { ...DEFAULT_ELEMENTS_BY_FORMAT.post.texto },
      mensaje: { ...DEFAULT_ELEMENTS_BY_FORMAT.post.mensaje }
    },
    story: {
      logo: { ...DEFAULT_ELEMENTS_BY_FORMAT.story.logo },
      foto: { ...DEFAULT_ELEMENTS_BY_FORMAT.story.foto },
      texto: { ...DEFAULT_ELEMENTS_BY_FORMAT.story.texto },
      mensaje: { ...DEFAULT_ELEMENTS_BY_FORMAT.story.mensaje }
    }
  };
}

function createDefaultElements() {
  const base = LAYOUTS.reduce((acc, layout) => {
    acc[layout.id] = cloneDefaultElementsByFormat();
    return acc;
  }, {});

  base.minimal.post.logo = { x: 0.08, y: 0.06, w: 0.2, h: 0.08, fontScale: 1 };
  base.minimal.post.foto = { x: 0.26, y: 0.18, w: 0.48, h: 0.49 };
  base.minimal.post.texto = { x: 0.14, y: 0.66, w: 0.72, h: 0.16, fontScale: 0.82 };
  base.minimal.post.mensaje = { x: 0.09, y: 0.82, w: 0.82, h: 0.12, fontScale: 0.88 };
  base.minimal.story.logo = { x: 0.08, y: 0.06, w: 0.2, h: 0.08, fontScale: 1 };
  base.minimal.story.foto = { x: 0.22, y: 0.16, w: 0.56, h: 0.5 };
  base.minimal.story.texto = { x: 0.14, y: 0.68, w: 0.72, h: 0.15, fontScale: 0.82 };
  base.minimal.story.mensaje = { x: 0.08, y: 0.83, w: 0.84, h: 0.12, fontScale: 0.88 };

  base.diagonal.post.logo = { x: 0.06, y: 0.05, w: 0.14, h: 0.11 };
  base.diagonal.post.texto = { x: 0.14, y: 0.69, w: 0.7, h: 0.14, fontScale: DIAGONAL_TEXT_SCALE };
  base.diagonal.post.mensaje = { x: 0.17, y: 0.84, w: 0.68, h: 0.08, fontScale: DIAGONAL_MESSAGE_SCALE };
  base.diagonal.story.logo = { x: 0.06, y: 0.05, w: 0.16, h: 0.1 };
  base.diagonal.story.texto = { x: 0.12, y: 0.7, w: 0.72, h: 0.14, fontScale: DIAGONAL_TEXT_SCALE };
  base.diagonal.story.mensaje = { x: 0.14, y: 0.84, w: 0.72, h: 0.08, fontScale: DIAGONAL_MESSAGE_SCALE };

  return base;
}

const DEFAULT_ELEMENTS = createDefaultElements();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getInitials(fullName) {
  const words = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 'AL';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
}

function buildCanvasAthleteName(nombres = '', apellidos = '', fallbackFullName = '') {
  const firstName = String(nombres || '').trim().split(/\s+/).filter(Boolean)[0] || '';
  const firstSurname = String(apellidos || '').trim().split(/\s+/).filter(Boolean)[0] || '';
  const shortName = `${firstName} ${firstSurname}`.trim();
  if (shortName) return shortName;

  const fallbackWords = String(fallbackFullName || '').trim().split(/\s+/).filter(Boolean);
  if (fallbackWords.length === 0) return 'Atleta';
  if (fallbackWords.length === 1) return fallbackWords[0];
  return `${fallbackWords[0]} ${fallbackWords[1]}`;
}

function toCanvasImageSrc(value) {
  if (!value || typeof value !== 'string') return value;
  const raw = value.trim();
  if (!raw) return raw;

  if (
    raw.startsWith('data:')
    || raw.startsWith('blob:')
    || raw.startsWith('http://')
    || raw.startsWith('https://')
    || raw.startsWith('/uploads/')
  ) {
    return raw;
  }

  if (raw.startsWith('uploads/')) {
    return `/${raw}`;
  }

  // Algunos registros antiguos guardan solo el nombre del archivo.
  if (!raw.includes('/') && /\.(png|jpe?g|webp|gif|svg)$/i.test(raw)) {
    return `/uploads/${raw}`;
  }

  return raw;
}

async function waitForNodeImages(node) {
  if (!node) return;
  const images = Array.from(node.querySelectorAll('img'));
  if (!images.length) return;

  await Promise.all(images.map((img) => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    if (img.complete && img.naturalWidth === 0) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const clean = () => {
        img.removeEventListener('load', handleLoad);
        img.removeEventListener('error', handleError);
        window.clearTimeout(timer);
      };

      const handleLoad = () => {
        if (settled) return;
        settled = true;
        clean();
        resolve();
      };

      const handleError = () => {
        if (settled) return;
        settled = true;
        clean();
        resolve();
      };

      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        clean();
        resolve();
      }, 8000);

      img.addEventListener('load', handleLoad, { once: true });
      img.addEventListener('error', handleError, { once: true });

      // Si el estado cambió antes de registrar listeners, resolver/rechazar de inmediato.
      if (img.complete) {
        if (img.naturalWidth > 0) {
          handleLoad();
        } else {
          handleError();
        }
      }
    });
  }));
}

function normalizeLayer(layer = {}, fallback = {}) {
  const x = clamp(Number(layer?.x ?? fallback?.x ?? 0), 0, 1);
  const y = clamp(Number(layer?.y ?? fallback?.y ?? 0), 0, 1);
  const w = clamp(Number(layer?.w ?? fallback?.w ?? 0.3), 0.04, 1);
  const h = clamp(Number(layer?.h ?? fallback?.h ?? 0.1), 0.04, 1);
  const normalized = { x, y, w, h };

  const hasScale = layer?.fontScale !== undefined || fallback?.fontScale !== undefined;
  if (hasScale) {
    normalized.fontScale = clamp(Number(layer?.fontScale ?? fallback?.fontScale ?? 1), 0.65, 2.5);
  }

  return normalized;
}

function normalizeElements(elements = {}) {
  const root = elements && typeof elements === 'object' ? elements : {};

  const normalizeByFormat = (source = {}, fallback = DEFAULT_ELEMENTS_BY_FORMAT) => {
    const sourcePost = source?.post || {};
    const sourceStory = source?.story || {};
    const fallbackPost = fallback?.post || DEFAULT_ELEMENTS_BY_FORMAT.post;
    const fallbackStory = fallback?.story || DEFAULT_ELEMENTS_BY_FORMAT.story;

    const normalizeTextLayer = (sourceLayer, fallbackLayer) => ({
      ...normalizeLayer(sourceLayer, fallbackLayer),
      fontScale: clamp(Number(sourceLayer?.fontScale ?? fallbackLayer?.fontScale ?? 1), 0.65, 2.5)
    });

    const postLayers = stackMensajeDebajoTexto({
      logo: normalizeLayer(sourcePost.logo, fallbackPost.logo),
      foto: normalizeLayer(sourcePost.foto, fallbackPost.foto),
      texto: normalizeTextLayer(sourcePost.texto, fallbackPost.texto),
      mensaje: normalizeTextLayer(sourcePost.mensaje, fallbackPost.mensaje)
    }, 'post');

    const storyLayers = stackMensajeDebajoTexto({
      logo: normalizeLayer(sourceStory.logo, fallbackStory.logo),
      foto: normalizeLayer(sourceStory.foto, fallbackStory.foto),
      texto: normalizeTextLayer(sourceStory.texto, fallbackStory.texto),
      mensaje: normalizeTextLayer(sourceStory.mensaje, fallbackStory.mensaje)
    }, 'story');

    return {
      post: postLayers,
      story: storyLayers
    };
  };

  const hasLegacyFormatShape = !!(root?.post || root?.story);

  return LAYOUTS.reduce((acc, layout) => {
    const layoutSource = hasLegacyFormatShape
      ? root
      : (root?.[layout.id] && typeof root[layout.id] === 'object' ? root[layout.id] : {});
    acc[layout.id] = normalizeByFormat(layoutSource, DEFAULT_ELEMENTS[layout.id] || DEFAULT_ELEMENTS_BY_FORMAT);
    return acc;
  }, {});
}

function normalizePreset(input = {}) {
  const allowedLayouts = new Set(LAYOUTS.map((item) => item.id));
  const allowedFormats = new Set(FORMATS.map((item) => item.id));
  const colors = input?.colores && typeof input.colores === 'object' ? input.colores : {};
  const toHex = (value, fallback) => {
    const str = String(value || fallback || '').trim();
    const hex = str.startsWith('#') ? str : `#${str}`;
    return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toLowerCase() : fallback;
  };

  const normalizedLayout = String(input?.layout || DEFAULT_LAYOUT).trim();
  const normalizedFormat = String(input?.formato || DEFAULT_FORMAT).trim();

  return {
    nombre: String(input?.nombre || '').trim(),
    layout: allowedLayouts.has(normalizedLayout) ? normalizedLayout : DEFAULT_LAYOUT,
    formato: allowedFormats.has(normalizedFormat) ? normalizedFormat : DEFAULT_FORMAT,
    mensaje: String(input?.mensaje || DEFAULT_MESSAGE).trim() || DEFAULT_MESSAGE,
    elementos: normalizeElements(input?.elementos || DEFAULT_ELEMENTS),
    colores: {
      fondo: toHex(colors.fondo, DEFAULT_COLORS.fondo),
      texto: toHex(colors.texto, DEFAULT_COLORS.texto),
      acento: toHex(colors.acento, DEFAULT_COLORS.acento),
      detalle: toHex(colors.detalle, DEFAULT_COLORS.detalle)
    }
  };
}

function hexToRgba(hex, alpha = 1) {
  const normalized = String(hex || '').replace('#', '').trim();
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(26, 26, 62, ${alpha})`;
  }
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function buildLayoutBackground(layoutId, colors) {
  const fondo = colors?.fondo || '#1a1a3e';
  const acento = colors?.acento || '#ec4899';
  const detalle = colors?.detalle || '#7dd3fc';

  switch (layoutId) {
    case 'minimal':
      return colors?.fondo || '#000000';
    case 'badge':
      return `radial-gradient(circle at 50% 0%, ${hexToRgba(detalle, 0.34)} 0%, ${hexToRgba(detalle, 0.22)} 24%, transparent 56%), linear-gradient(180deg, ${hexToRgba(fondo, 1)} 0%, ${hexToRgba(fondo, 0.94)} 100%)`;
    case 'aurora':
      return `linear-gradient(120deg, ${hexToRgba(fondo, 0.95)} 0%, ${hexToRgba(detalle, 0.35)} 100%), ${fondo}`;
    case 'diagonal':
      return `radial-gradient(circle at 18% 24%, ${hexToRgba(detalle, 0.14)} 0%, transparent 38%), linear-gradient(180deg, ${hexToRgba(fondo, 1)} 0%, ${hexToRgba(fondo, 0.94)} 100%)`;
    case 'confetti':
      return `radial-gradient(circle at 8% 18%, ${hexToRgba(acento, 0.9)} 0%, ${hexToRgba(acento, 0.9)} 1.1%, transparent 1.2%), radial-gradient(circle at 88% 24%, ${hexToRgba(detalle, 0.9)} 0%, ${hexToRgba(detalle, 0.9)} 1.2%, transparent 1.3%), radial-gradient(circle at 75% 86%, rgba(250, 204, 21, 0.95) 0%, rgba(250, 204, 21, 0.95) 1.05%, transparent 1.15%), radial-gradient(circle at 16% 80%, rgba(251, 113, 133, 0.9) 0%, rgba(251, 113, 133, 0.9) 1.15%, transparent 1.25%), linear-gradient(180deg, ${hexToRgba(fondo, 1)} 0%, ${hexToRgba(fondo, 0.96)} 100%)`;
    default:
      return `radial-gradient(circle at 20% 30%, ${hexToRgba(acento, 0.48)} 0%, ${hexToRgba(acento, 0.24)} 22%, transparent 50%), linear-gradient(180deg, ${hexToRgba(fondo, 1)} 0%, ${hexToRgba(fondo, 0.96)} 100%)`;
  }
}

function getDiaMesCaracas(fechaNacimiento) {
  if (!fechaNacimiento) return { dia: 99, mes: 99 };
  const date = new Date(fechaNacimiento);
  if (Number.isNaN(date.getTime())) return { dia: 99, mes: 99 };
  const parts = new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'America/Caracas'
  }).formatToParts(date);
  const dia = Number.parseInt(parts.find((item) => item.type === 'day')?.value || '99', 10);
  const mes = Number.parseInt(parts.find((item) => item.type === 'month')?.value || '99', 10);
  return {
    dia: Number.isFinite(dia) ? dia : 99,
    mes: Number.isFinite(mes) ? mes : 99
  };
}

function CumpleanosPostGenerator() {
  const apiBase = (process.env.REACT_APP_API_URL || window.location.origin).replace(/\/$/, '');
  const token = localStorage.getItem('token');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });
  const [activePanel, setActivePanel] = useState('athlete');
  const [atletas, setAtletas] = useState([]);
  const [athleteId, setAthleteId] = useState('');
  const [nombreAtletaLienzoEdit, setNombreAtletaLienzoEdit] = useState('');
  const [layoutId, setLayoutId] = useState(DEFAULT_LAYOUT);
  const [formatId, setFormatId] = useState(DEFAULT_FORMAT);
  const [mensaje, setMensaje] = useState(DEFAULT_MESSAGE);
  const [colors, setColors] = useState(DEFAULT_COLORS);
  const [elementos, setElementos] = useState(() => createDefaultElements());
  const [selectedLayer, setSelectedLayer] = useState('foto');
  const [presetNombre, setPresetNombre] = useState('');
  const [presetSeleccionado, setPresetSeleccionado] = useState('');
  const [presets, setPresets] = useState([]);
  const [guardandoPreset, setGuardandoPreset] = useState(false);
  const [eliminandoPreset, setEliminandoPreset] = useState(false);
  const [confirmarEliminarPresetOpen, setConfirmarEliminarPresetOpen] = useState(false);
  const [presetAEliminar, setPresetAEliminar] = useState('');
  const [descargando, setDescargando] = useState(false);
  const [logoAcademia, setLogoAcademia] = useState('');
  const [clubNombre, setClubNombre] = useState('Academia');
  const [logoLocalFile, setLogoLocalFile] = useState(null);
  const [logoLocalPreview, setLogoLocalPreview] = useState('');
  const [fotoLocalFile, setFotoLocalFile] = useState(null);
  const [fotoLocalPreview, setFotoLocalPreview] = useState('');
  const [dragFotoActive, setDragFotoActive] = useState(false);
  const [dragLogoActive, setDragLogoActive] = useState(false);
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });

  const logoInputRef = useRef(null);
  const fotoInputRef = useRef(null);
  const postRef = useRef(null);
  const exportRef = useRef(null);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const fetchInitialData = async () => {
      setLoading(true);
      setError('');
      try {
        const [cumpleRes, tenantRes, configRes] = await Promise.all([
          fetch(`${apiBase}/api/cumpleaneros/mes`, {
            signal: controller.signal,
            headers: token ? { Authorization: `Bearer ${token}` } : undefined
          }),
          fetch(`${apiBase}/api/tenant/context`, {
            signal: controller.signal,
            headers: { 'Cache-Control': 'no-cache' }
          }),
          fetch(`${apiBase}/api/configuracion`, {
            signal: controller.signal,
            headers: token ? { Authorization: `Bearer ${token}` } : undefined
          })
        ]);

        const cumpleData = await cumpleRes.json().catch(() => []);
        const tenantData = await tenantRes.json().catch(() => null);
        const configData = await configRes.json().catch(() => null);

        if (!active) return;

        if (!cumpleRes.ok) {
          throw new Error('No se pudieron cargar los atletas de cumpleaños.');
        }

        const lista = Array.isArray(cumpleData)
          ? cumpleData.map((item) => {
              const nombreCompleto = `${item.nombres || ''} ${item.apellidos || ''}`.trim() || 'Atleta sin nombre';
              return {
                _id: item._id,
                nombre: nombreCompleto,
                nombreLienzo: buildCanvasAthleteName(item.nombres, item.apellidos, nombreCompleto),
                foto: mediaUrl(item.foto || ''),
                fecha_nacimiento: item.fecha_nacimiento || null
              };
            })
          : [];

        const listaOrdenada = lista.slice().sort((a, b) => {
          const aDM = getDiaMesCaracas(a.fecha_nacimiento);
          const bDM = getDiaMesCaracas(b.fecha_nacimiento);
          if (aDM.mes !== bDM.mes) return aDM.mes - bDM.mes;
          return aDM.dia - bDM.dia;
        });

        setAtletas(listaOrdenada);
        setAthleteId((prev) => prev || listaOrdenada[0]?._id || '');
        setLogoAcademia(mediaUrl(tenantData?.branding?.logoUrl) || '');
        setClubNombre(String(tenantData?.branding?.displayName || tenantData?.nombre || 'Academia').trim() || 'Academia');

        if (configRes.ok) {
          const cumpleConfig = configData?.publicaciones?.cumpleanos || {};
          const presetsGuardados = Array.isArray(cumpleConfig?.presets)
            ? cumpleConfig.presets.map((item) => normalizePreset(item)).filter((item) => item.nombre)
            : [];
          setPresets(presetsGuardados);

          if (presetsGuardados.length > 0) {
            const ultimoPreset = normalizePreset(cumpleConfig?.ultimo_preset || {});
            setLayoutId(ultimoPreset.layout);
            setFormatId(ultimoPreset.formato);
            setMensaje(ultimoPreset.mensaje);
            setColors(ultimoPreset.colores);
            setElementos(ultimoPreset.elementos || DEFAULT_ELEMENTS);
            setPresetNombre(ultimoPreset.nombre || '');
          } else {
            setLayoutId(DEFAULT_LAYOUT);
            setFormatId(DEFAULT_FORMAT);
            setMensaje(DEFAULT_MESSAGE);
            setColors(DEFAULT_COLORS);
            setElementos(createDefaultElements());
            setPresetNombre('');
          }
        }
      } catch (err) {
        if (!active || err.name === 'AbortError') return;
        setError(err.message || 'No se pudo cargar el generador de cumpleaños.');
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchInitialData();

    return () => {
      active = false;
      controller.abort();
    };
  }, [apiBase, token]);

  useEffect(() => {
    if (!logoLocalFile) {
      setLogoLocalPreview('');
      return undefined;
    }
    const objectUrl = URL.createObjectURL(logoLocalFile);
    setLogoLocalPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [logoLocalFile]);

  useEffect(() => {
    if (!fotoLocalFile) {
      setFotoLocalPreview('');
      return undefined;
    }
    const objectUrl = URL.createObjectURL(fotoLocalFile);
    setFotoLocalPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [fotoLocalFile]);

  useEffect(() => {
    if (!postRef.current) return undefined;

    const node = postRef.current;
    const updateSize = () => {
      const nextWidth = node.clientWidth || 1;
      const nextHeight = node.clientHeight || 1;
      setCanvasSize({ width: nextWidth, height: nextHeight });
    };

    updateSize();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateSize);
      return () => window.removeEventListener('resize', updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(node);

    return () => observer.disconnect();
  }, [formatId]);

  const atletaSeleccionado = useMemo(
    () => atletas.find((atleta) => atleta._id === athleteId) || null,
    [atletas, athleteId]
  );

  const formatoActual = useMemo(
    () => FORMATS.find((item) => item.id === formatId) || FORMATS[0],
    [formatId]
  );
  const layoutBackground = useMemo(() => buildLayoutBackground(layoutId, colors), [layoutId, colors]);

  const layersActuales = elementos?.[layoutId]?.[formatId]
    || DEFAULT_ELEMENTS?.[layoutId]?.[formatId]
    || DEFAULT_ELEMENTS_BY_FORMAT[formatId];
  const nombreAtleta = atletaSeleccionado?.nombre || 'Selecciona un atleta';
  const nombreAtletaLienzoSugerido = atletaSeleccionado?.nombreLienzo || buildCanvasAthleteName('', '', nombreAtleta);
  const nombreAtletaLienzo = String(nombreAtletaLienzoEdit || '').trim() || nombreAtletaLienzoSugerido;
  const fotoAtleta = toCanvasImageSrc(fotoLocalPreview || atletaSeleccionado?.foto || '');
  const logoActivo = toCanvasImageSrc(logoLocalPreview || logoAcademia || '');

  useEffect(() => {
    if (!atletaSeleccionado) {
      setNombreAtletaLienzoEdit('');
      return;
    }
    setNombreAtletaLienzoEdit(atletaSeleccionado?.nombreLienzo || buildCanvasAthleteName('', '', atletaSeleccionado?.nombre || ''));
  }, [atletaSeleccionado]);

  const formatCumpleLabel = (fechaNacimiento) => {
    if (!fechaNacimiento) return 'Sin fecha';
    const date = new Date(fechaNacimiento);
    if (Number.isNaN(date.getTime())) return 'Sin fecha';
    return date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
  };

  const handleColorChange = (field) => (event) => {
    setColors((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSelectLogo = (file) => {
    if (!file) return;
    setLogoLocalFile(file);
  };

  const handleSelectFoto = (file) => {
    if (!file) return;
    setFotoLocalFile(file);
  };

  const getLayerPx = (layerKey) => {
    const layer = layersActuales?.[layerKey]
      || DEFAULT_ELEMENTS?.[layoutId]?.[formatId]?.[layerKey]
      || DEFAULT_ELEMENTS_BY_FORMAT[formatId][layerKey];
    return {
      x: layer.x * canvasSize.width,
      y: layer.y * canvasSize.height,
      width: layer.w * canvasSize.width,
      height: layer.h * canvasSize.height,
      fontScale: layer.fontScale || 1
    };
  };

  const getLayerRelativeStyle = (layerKey) => {
    const layer = layersActuales?.[layerKey]
      || DEFAULT_ELEMENTS?.[layoutId]?.[formatId]?.[layerKey]
      || DEFAULT_ELEMENTS_BY_FORMAT[formatId][layerKey];
    return {
      left: `${layer.x * 100}%`,
      top: `${layer.y * 100}%`,
      width: `${layer.w * 100}%`,
      height: `${layer.h * 100}%`
    };
  };

  const renderLayerContent = (layerKey, fontScale = 1, editable = false) => {
    if (layerKey === 'logo') {
      return (
        <Box className="logo-layer-shell" onMouseDown={editable ? () => setSelectedLayer('logo') : undefined}>
          {logoActivo ? (
            <img src={logoActivo} alt="Logo" className="post-logo" />
          ) : (
            <Typography className="club-fallback">Club</Typography>
          )}
        </Box>
      );
    }

    if (layerKey === 'foto') {
      return (
        <Box className="athlete-frame" onMouseDown={editable ? () => setSelectedLayer('foto') : undefined} sx={{ width: '100%', height: '100%' }}>
          {fotoAtleta ? (
            <>
              {layoutId === 'minimal' ? <img src={fotoAtleta} alt="" className="athlete-photo-ghost" aria-hidden="true" /> : null}
              <img src={fotoAtleta} alt={nombreAtletaLienzo} className="athlete-photo" />
            </>
          ) : (
            <Typography className="athlete-initials">{getInitials(nombreAtletaLienzo)}</Typography>
          )}
        </Box>
      );
    }

    if (layoutId === 'minimal') {
      if (layerKey === 'mensaje') {
        return (
          <Box
            className="text-layer-shell text-layer-shell-minimal-message"
            onMouseDown={editable ? () => setSelectedLayer('mensaje') : undefined}
            style={{ '--text-scale': String(fontScale || 1) }}
          >
            <Typography className="minimal-message">{mensaje || DEFAULT_MESSAGE}</Typography>
          </Box>
        );
      }

      return (
        <Box
          className="text-layer-shell text-layer-shell-minimal"
          onMouseDown={editable ? () => setSelectedLayer('texto') : undefined}
          style={{ '--text-scale': String(fontScale || 1) }}
        >
          <Box className="minimal-title-stack">
            <Typography className="minimal-happy">HAPPY</Typography>
            <Typography className="minimal-birthday">BIRTHDAY</Typography>
          </Box>
          <Typography className="minimal-athlete-name">{nombreAtletaLienzo.toUpperCase()}</Typography>
        </Box>
      );
    }

    if (layerKey === 'mensaje' && layoutId === 'diagonal') {
      return (
        <Box
          className="text-layer-shell diagonal-message-layer"
          onMouseDown={editable ? () => setSelectedLayer('mensaje') : undefined}
          style={{ '--text-scale': String(fontScale || 1) }}
        >
          <Typography className="diagonal-message">{mensaje || DEFAULT_MESSAGE}</Typography>
        </Box>
      );
    }

    if (layoutId === 'diagonal') {
      return (
        <Box
          className="text-layer-shell text-layer-shell-diagonal"
          onMouseDown={editable ? () => setSelectedLayer('texto') : undefined}
          style={{ '--text-scale': String(fontScale || 1) }}
        >
          <Typography className="diagonal-kicker">¡FELIZ CUMPLEAÑOS!</Typography>
          <Typography className="diagonal-name-pill">{nombreAtletaLienzo.toUpperCase()}</Typography>
        </Box>
      );
    }

    return (
      <Box
        className={layerKey === 'mensaje' ? 'text-layer-shell text-layer-shell-message' : 'text-layer-shell'}
        onMouseDown={editable ? () => setSelectedLayer(layerKey) : undefined}
        style={{ '--text-scale': String(fontScale || 1) }}
      >
        {layerKey === 'mensaje' ? (
          <>
            <Typography className="birthday-message">{mensaje || DEFAULT_MESSAGE}</Typography>
          </>
        ) : (
          <>
            <Typography className="birthday-kicker">¡Feliz cumpleaños!</Typography>
            <Typography className="birthday-name">{nombreAtletaLienzo.toUpperCase()}</Typography>
          </>
        )}
      </Box>
    );
  };

  const renderMinimalDecorations = () => (
    <>
      <Box className="minimal-bunting minimal-bunting-left" aria-hidden>
        {['#d6d0c8', '#ece3d3', '#a89c8f', '#cbb79f', '#f6f0e8', '#b9b1a8', '#e6d8c6', '#7e756f'].map((color, index) => (
          <span key={`left-${color}-${index}`} style={{ '--flag-color': color }} />
        ))}
      </Box>
      <Box className="minimal-bunting minimal-bunting-right" aria-hidden>
        {['#d6d0c8', '#ece3d3', '#a89c8f', '#cbb79f', '#f6f0e8', '#b9b1a8', '#e6d8c6', '#7e756f'].map((color, index) => (
          <span key={`right-${color}-${index}`} style={{ '--flag-color': color }} />
        ))}
      </Box>
      <Box className="minimal-star minimal-star-a" aria-hidden />
      <Box className="minimal-star minimal-star-b" aria-hidden />
      <Box className="minimal-star minimal-star-c" aria-hidden />
      <Box className="minimal-star minimal-star-d" aria-hidden />
      <Box className="minimal-star minimal-star-e" aria-hidden />
    </>
  );

  const updateLayerFromPixels = (layerKey, payload, keepScale = true) => {
    setElementos((prev) => {
      const baseByLayout = prev?.[layoutId] || DEFAULT_ELEMENTS[layoutId];
      const baseByFormat = baseByLayout?.[formatId]
        || DEFAULT_ELEMENTS?.[layoutId]?.[formatId]
        || DEFAULT_ELEMENTS_BY_FORMAT[formatId];
      const current = baseByFormat[layerKey] || DEFAULT_ELEMENTS_BY_FORMAT[formatId][layerKey];

      const widthNorm = clamp(payload.width / canvasSize.width, 0.04, 1);
      const heightNorm = clamp(payload.height / canvasSize.height, 0.04, 1);
      const xNormRaw = payload.x / canvasSize.width;
      const yNormRaw = payload.y / canvasSize.height;
      const xNorm = clamp(xNormRaw, 0, 1 - widthNorm);
      const yNorm = clamp(yNormRaw, 0, 1 - heightNorm);

      const nextLayer = {
        ...current,
        x: xNorm,
        y: yNorm,
        w: widthNorm,
        h: heightNorm
      };

      const shouldScaleText = layerKey === 'texto' || layerKey === 'mensaje';
      if (shouldScaleText) {
        const baseWidth = (
          DEFAULT_ELEMENTS?.[layoutId]?.[formatId]
          || DEFAULT_ELEMENTS_BY_FORMAT[formatId]
        )[layerKey].w;
        const computedScale = clamp(widthNorm / baseWidth, 0.65, 2.5);
        nextLayer.fontScale = keepScale ? computedScale : (current.fontScale || 1);
      }

      const nextByFormat = {
        ...baseByFormat,
        [layerKey]: nextLayer
      };

      const nextStackedByFormat = stackMensajeDebajoTexto(nextByFormat, formatId);

      return {
        ...prev,
        [layoutId]: {
          ...baseByLayout,
          [formatId]: nextStackedByFormat
        }
      };
    });
  };

  const updateTextScaleForLayer = (layerKey, nextScale) => {
    if (!['texto', 'mensaje'].includes(layerKey)) return;
    const safeScale = clamp(Number(nextScale) || 1, 0.65, 2.5);
    setElementos((prev) => {
      const baseByLayout = prev?.[layoutId] || DEFAULT_ELEMENTS[layoutId];
      const baseByFormat = baseByLayout?.[formatId]
        || DEFAULT_ELEMENTS?.[layoutId]?.[formatId]
        || DEFAULT_ELEMENTS_BY_FORMAT[formatId];
      const current = baseByFormat[layerKey] || DEFAULT_ELEMENTS_BY_FORMAT[formatId][layerKey];
      return {
        ...prev,
        [layoutId]: {
          ...baseByLayout,
          [formatId]: {
            ...baseByFormat,
            [layerKey]: {
              ...current,
              fontScale: safeScale
            }
          }
        }
      };
    });
  };

  const nudgeLayer = (layerKey, dx, dy) => {
    if (!layerKey) return;
    setElementos((prev) => {
      const baseByLayout = prev?.[layoutId] || DEFAULT_ELEMENTS[layoutId];
      const baseByFormat = baseByLayout?.[formatId]
        || DEFAULT_ELEMENTS?.[layoutId]?.[formatId]
        || DEFAULT_ELEMENTS_BY_FORMAT[formatId];
      const current = baseByFormat[layerKey] || DEFAULT_ELEMENTS_BY_FORMAT[formatId][layerKey];
      if (!current) return prev;

      const nextLayer = {
        ...current,
        x: clamp(current.x + dx, 0, 1 - current.w),
        y: clamp(current.y + dy, 0, 1 - current.h)
      };

      const nextByFormat = {
        ...baseByFormat,
        [layerKey]: nextLayer
      };

      const nextStackedByFormat = stackMensajeDebajoTexto(nextByFormat, formatId);

      return {
        ...prev,
        [layoutId]: {
          ...baseByLayout,
          [formatId]: nextStackedByFormat
        }
      };
    });
  };

  const selectedTextLayer = ['texto', 'mensaje'].includes(selectedLayer) ? selectedLayer : '';
  const selectedTextScale = selectedTextLayer
    ? Number(layersActuales?.[selectedTextLayer]?.fontScale || 1)
    : 1;
  const selectedTextScalePercent = Math.round(clamp(selectedTextScale * 100, 65, 250));

  const handleAplicarPreset = (nombrePreset) => {
    setPresetSeleccionado(nombrePreset);
    if (!nombrePreset) {
      setLayoutId(DEFAULT_LAYOUT);
      setFormatId(DEFAULT_FORMAT);
      setMensaje(DEFAULT_MESSAGE);
      setColors(DEFAULT_COLORS);
      setElementos(createDefaultElements());
      setPresetNombre('');
      setMessage({ type: 'success', text: 'Diseño restablecido (sin plantilla).' });
      return;
    }

    const preset = presets.find((item) => item.nombre === nombrePreset);
    if (!preset) return;

    const normalizedPreset = normalizePreset(preset);
    setLayoutId(normalizedPreset.layout);
    setFormatId(normalizedPreset.formato);
    setMensaje(normalizedPreset.mensaje);
    setColors(normalizedPreset.colores);
    setElementos(normalizedPreset.elementos);
    setPresetNombre(normalizedPreset.nombre);
    setMessage({ type: 'success', text: `Plantilla "${preset.nombre}" aplicada.` });
  };

  const guardarPresetAcademia = async () => {
    const nombreFinal = String(presetNombre || '').trim();
    if (!nombreFinal) {
      setMessage({ type: 'error', text: 'Coloca un nombre para guardar la plantilla.' });
      return;
    }

    const presetActual = normalizePreset({
      nombre: nombreFinal,
      layout: layoutId,
      formato: formatId,
      mensaje,
      elementos,
      colores: colors
    });

    const listaActualizada = [...presets];
    const indexExistente = listaActualizada.findIndex((item) => item.nombre.toLowerCase() === nombreFinal.toLowerCase());
    if (indexExistente >= 0) {
      listaActualizada[indexExistente] = presetActual;
    } else {
      listaActualizada.push(presetActual);
    }

    if (listaActualizada.length > 12) {
      setMessage({ type: 'error', text: 'Maximo 12 plantillas guardadas por academia.' });
      return;
    }

    setGuardandoPreset(true);
    setMessage({ type: '', text: '' });

    try {
      const res = await fetch(`${apiBase}/api/configuracion`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          publicaciones: {
            cumpleanos: {
              ultimo_preset: presetActual,
              presets: listaActualizada
            }
          }
        })
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.detalle || payload?.error || 'No se pudo guardar la plantilla.');
      }

      const presetsGuardados = Array.isArray(payload?.publicaciones?.cumpleanos?.presets)
        ? payload.publicaciones.cumpleanos.presets.map((item) => normalizePreset(item)).filter((item) => item.nombre)
        : listaActualizada;

      setPresets(presetsGuardados);
      setPresetSeleccionado(presetActual.nombre);
      setMessage({ type: 'success', text: 'Plantilla guardada para esta academia.' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'No se pudo guardar la plantilla.' });
    } finally {
      setGuardandoPreset(false);
    }
  };

  const solicitarEliminarPresetAcademia = () => {
    const nombreObjetivo = String(presetSeleccionado || '').trim();
    if (!nombreObjetivo) {
      setMessage({ type: 'error', text: 'Selecciona una plantilla guardada para eliminar.' });
      return;
    }

    const presetExiste = presets.some((item) => item.nombre.toLowerCase() === nombreObjetivo.toLowerCase());
    if (!presetExiste) {
      setMessage({ type: 'error', text: 'La plantilla seleccionada ya no existe.' });
      return;
    }

    setPresetAEliminar(nombreObjetivo);
    setConfirmarEliminarPresetOpen(true);
  };

  const cerrarDialogoEliminarPreset = () => {
    if (eliminandoPreset) return;
    setConfirmarEliminarPresetOpen(false);
    setPresetAEliminar('');
  };

  const eliminarPresetAcademia = async () => {
    const nombreObjetivo = String(presetAEliminar || '').trim();
    if (!nombreObjetivo) {
      setMessage({ type: 'error', text: 'No hay plantilla seleccionada para eliminar.' });
      return;
    }

    const listaActualizada = presets.filter((item) => item.nombre.toLowerCase() !== nombreObjetivo.toLowerCase());

    setEliminandoPreset(true);
    setMessage({ type: '', text: '' });

    try {
      const res = await fetch(`${apiBase}/api/configuracion`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          publicaciones: {
            cumpleanos: {
              presets: listaActualizada,
              ultimo_preset: listaActualizada.length ? undefined : null
            }
          }
        })
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.detalle || payload?.error || 'No se pudo eliminar la plantilla.');
      }

      const presetsGuardados = Array.isArray(payload?.publicaciones?.cumpleanos?.presets)
        ? payload.publicaciones.cumpleanos.presets.map((item) => normalizePreset(item)).filter((item) => item.nombre)
        : listaActualizada;

      setPresets(presetsGuardados);
      setPresetSeleccionado('');
      setPresetNombre('');
      setConfirmarEliminarPresetOpen(false);
      setPresetAEliminar('');
      setMessage({ type: 'success', text: `Plantilla "${nombreObjetivo}" eliminada.` });
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'No se pudo eliminar la plantilla.' });
    } finally {
      setEliminandoPreset(false);
    }
  };

  const descargarPng = async () => {
    if (!exportRef.current) return;
    setDescargando(true);
    setMessage({ type: '', text: '' });

    try {
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      await waitForNodeImages(exportRef.current);

      const baseOptions = {
        // cacheBust rompe URLs blob (foto adjunta local) al anexar querystring.
        cacheBust: false,
        pixelRatio: 2,
        width: formatoActual.width,
        height: formatoActual.height,
        canvasWidth: formatoActual.width,
        canvasHeight: formatoActual.height,
        skipAutoScale: true,
        backgroundColor: colors.fondo || '#1a1a3e',
        style: {
          width: `${formatoActual.width}px`,
          height: `${formatoActual.height}px`
        }
      };

      const dataUrl = await toPng(exportRef.current, baseOptions);

      const slugNombre = String(nombreAtletaLienzo || 'atleta')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'atleta';

      const link = document.createElement('a');
      link.download = `cumpleanos-${slugNombre}-${formatId}.png`;
      link.href = dataUrl;
      link.click();

      setMessage({ type: 'success', text: 'PNG generado y descargado.' });
    } catch (err) {
      const isEventLike = !!(err && typeof err === 'object' && 'type' in err);
      const detalle = isEventLike
        ? `evento de carga (${String(err.type || 'desconocido')})`
        : String(err?.message || err?.toString?.() || '').trim();
      setMessage({ type: 'error', text: detalle ? `No se pudo generar el PNG: ${detalle}` : 'No se pudo generar el PNG.' });
    } finally {
      setDescargando(false);
    }
  };

  return (
    <Box className="birthday-generator-root">
      <Box className="birthday-generator-sidebar">
        <Typography className="birthday-generator-title">Generador de Publicaciones de Cumpleaños</Typography>

        <Box className="birthday-panels-nav">
          <button
            type="button"
            className={`birthday-panel-tab ${activePanel === 'athlete' ? 'active' : ''}`}
            onClick={() => setActivePanel('athlete')}
          >
            <Person2OutlinedIcon sx={{ fontSize: 14 }} />
            <span>Atleta & Foto</span>
          </button>
          <button
            type="button"
            className={`birthday-panel-tab ${activePanel === 'design' ? 'active' : ''}`}
            onClick={() => setActivePanel('design')}
          >
            <PaletteOutlinedIcon sx={{ fontSize: 14 }} />
            <span>Diseño</span>
          </button>
          <button
            type="button"
            className={`birthday-panel-tab ${activePanel === 'content' ? 'active' : ''}`}
            onClick={() => setActivePanel('content')}
          >
            <NotesOutlinedIcon sx={{ fontSize: 14 }} />
            <span>Contenido</span>
          </button>
        </Box>

        {error ? <Alert severity="error" sx={{ mb: 1.5 }}>{error}</Alert> : null}
        {message.text ? <Alert severity={message.type === 'error' ? 'error' : 'success'} sx={{ mb: 1.5 }}>{message.text}</Alert> : null}

        {activePanel === 'athlete' ? (
          <>
            <Box className="birthday-step">
              <Typography className="birthday-step-title"><span className="step-dot">1</span>Plantilla de academia</Typography>
              <Box className="preset-grid-wrap" sx={{ display: 'grid', gap: 1 }}>
                <Box
                  className="preset-select-row"
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr auto' },
                    alignItems: 'center',
                    gap: { xs: 0.8, sm: 0.4 }
                  }}
                >
                  <FormControl fullWidth size="small">
                    <InputLabel id="preset-select-label">Plantilla guardada</InputLabel>
                    <Select
                      labelId="preset-select-label"
                      value={presetSeleccionado}
                      label="Plantilla guardada"
                      onChange={(event) => handleAplicarPreset(event.target.value)}
                    >
                      <MenuItem value="">Sin plantilla</MenuItem>
                      {presets.map((preset) => (
                        <MenuItem key={preset.nombre} value={preset.nombre}>{preset.nombre}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <IconButton
                    size="small"
                    color="error"
                    aria-label="Eliminar plantilla seleccionada"
                    title="Eliminar plantilla seleccionada"
                    onClick={solicitarEliminarPresetAcademia}
                    disabled={eliminandoPreset || guardandoPreset || !presets.length || !presetSeleccionado}
                    sx={{
                      border: '1px solid #fecaca',
                      borderRadius: 1.2,
                      mt: 0.2,
                      '&:hover': { backgroundColor: '#fef2f2' }
                    }}
                  >
                    <DeleteOutlineOutlinedIcon fontSize="small" />
                  </IconButton>
                </Box>
                <Box
                  className="preset-save-row"
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr auto' },
                    gap: 1
                  }}
                >
                  <TextField
                    size="small"
                    label="Nombre de la plantilla"
                    placeholder="Base club"
                    value={presetNombre}
                    onChange={(event) => setPresetNombre(event.target.value)}
                  />
                  <Button
                    variant="contained"
                    onClick={guardarPresetAcademia}
                    disabled={guardandoPreset || eliminandoPreset}
                    className="save-preset-btn"
                    sx={{ textTransform: 'none', fontWeight: 700, px: 1.8, minHeight: 40 }}
                  >
                    {guardandoPreset ? '...' : 'Guardar'}
                  </Button>
                </Box>
              </Box>
            </Box>

            <Box className="birthday-step">
              <Typography className="birthday-step-title"><span className="step-dot">2</span>Atleta</Typography>
              {loading ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#475569' }}>
                  <CircularProgress size={18} />
                  <Typography sx={{ fontSize: 13 }}>Cargando atletas...</Typography>
                </Box>
              ) : (
                <FormControl fullWidth size="small">
                  <InputLabel id="athlete-select-label">Atleta</InputLabel>
                  <Select
                    labelId="athlete-select-label"
                    value={athleteId}
                    label="Atleta"
                    onChange={(event) => setAthleteId(event.target.value)}
                  >
                    {atletas.map((atleta) => (
                      <MenuItem key={atleta._id} value={atleta._id}>
                        <Box sx={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', gap: 1.5 }}>
                          <Typography sx={{ fontSize: 13, color: '#0f172a' }}>{atleta.nombre}</Typography>
                          <Typography sx={{ fontSize: 11, color: '#64748b', fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {formatCumpleLabel(atleta.fecha_nacimiento)}
                          </Typography>
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
              <TextField
                label="Nombre en el lienzo"
                size="small"
                fullWidth
                value={nombreAtletaLienzoEdit}
                onChange={(event) => setNombreAtletaLienzoEdit(event.target.value)}
                sx={{ mt: 1 }}
              />
              <Typography className="helper-text" sx={{ fontSize: 10.5 }}>
                Sugerencia automática: primer nombre + primer apellido. Puedes editarlo si lo deseas.
              </Typography>
            </Box>

            <Box className="birthday-step">
              <Typography className="birthday-step-title"><span className="step-dot">3</span>Formato de publicación</Typography>
              <Box className="format-switcher">
                {FORMATS.map((format) => (
                  <button
                    key={format.id}
                    type="button"
                    className={`format-option ${formatId === format.id ? 'active' : ''}`}
                    onClick={() => setFormatId(format.id)}
                  >
                    <span>{format.id === 'post' ? 'Post' : 'Story'}</span>
                    <small>{format.width}x{format.height}</small>
                  </button>
                ))}
              </Box>
            </Box>

            <Box className="birthday-step">
              <Typography className="birthday-step-title"><span className="step-dot">4</span>Foto del atleta</Typography>
              <Box
                className={`drop-area ${dragFotoActive ? 'active' : ''}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragFotoActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setDragFotoActive(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragFotoActive(false);
                  const file = event.dataTransfer.files?.[0];
                  handleSelectFoto(file);
                }}
                onClick={() => fotoInputRef.current?.click()}
              >
                {fotoAtleta ? (
                  <img src={fotoAtleta} alt="Foto atleta" className="photo-preview" />
                ) : (
                  <Box sx={{ textAlign: 'center' }}>
                    <ImageSearchOutlinedIcon sx={{ fontSize: 36, color: '#64748b' }} />
                    <Typography sx={{ color: '#334155', fontSize: 12 }}>Arrastra la foto o haz clic</Typography>
                  </Box>
                )}
              </Box>
              <Typography className="helper-text">Por defecto se usa la foto guardada del sistema</Typography>
              <Box
                className="dual-mobile-actions"
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                  gap: 1,
                  mt: 1
                }}
              >
                <Button
                  size="small"
                  fullWidth
                  variant="outlined"
                  onClick={() => fotoInputRef.current?.click()}
                  sx={{
                    color: '#64748b',
                    borderColor: '#94a3b8',
                    '&:hover': { borderColor: '#64748b', backgroundColor: '#f8fafc' }
                  }}
                >
                  Cambiar
                </Button>
                <Button
                  size="small"
                  fullWidth
                  variant="text"
                  onClick={() => setFotoLocalFile(null)}
                  sx={{
                    color: '#64748b',
                    border: '1px solid #94a3b8',
                    '&:hover': { borderColor: '#64748b', backgroundColor: '#f8fafc' }
                  }}
                >
                  Sistema
                </Button>
              </Box>
              <input
                ref={fotoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={(event) => handleSelectFoto(event.target.files?.[0])}
              />
            </Box>

            <Box className="birthday-step">
              <Typography className="birthday-step-title"><span className="step-dot">5</span>Mover y ajustar capas</Typography>
              <Typography sx={{ fontSize: 12, color: '#334155' }}>
                Haz clic en texto, mensaje, foto o logo en el preview y arrastra para mover. Usa la esquina para redimensionar.
              </Typography>
              <Typography sx={{ fontSize: 11, color: '#ef4444', mt: 1, fontWeight: 700 }}>
                Capa activa: {selectedLayer}
              </Typography>

              {selectedTextLayer ? (
                <Box sx={{ mt: 1.2, p: 1, border: '1px solid #e2e8f0', borderRadius: 1.5, background: '#f8fafc' }}>
                  <Typography sx={{ fontSize: 11, fontWeight: 700, color: selectedTextLayer === 'mensaje' ? '#64748b' : '#0f172a', mb: 0.5 }}>
                    Ajustes de {selectedTextLayer}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: '#64748b' }}>
                    Tamaño de texto: {selectedTextScalePercent}%
                  </Typography>
                  {selectedTextLayer === 'mensaje' ? (
                    <Typography sx={{ fontSize: 10.5, color: '#64748b', mb: 0.4 }}>
                      El mensaje se alinea automáticamente debajo del título.
                    </Typography>
                  ) : null}
                  <Slider
                    size="small"
                    min={65}
                    max={250}
                    step={1}
                    value={selectedTextScalePercent}
                    onChange={(_, value) => {
                      const raw = Array.isArray(value) ? value[0] : value;
                      updateTextScaleForLayer(selectedTextLayer, Number(raw) / 100);
                    }}
                    onChangeCommitted={(_, value) => {
                      const raw = Array.isArray(value) ? value[0] : value;
                      updateTextScaleForLayer(selectedTextLayer, Number(raw) / 100);
                    }}
                    sx={{
                      mt: 0.2,
                      mb: 0.6,
                      color: selectedTextLayer === 'mensaje' ? '#64748b' : undefined,
                      '& .MuiSlider-rail': {
                        opacity: 1,
                        backgroundColor: selectedTextLayer === 'mensaje' ? '#cbd5e1' : undefined
                      }
                    }}
                  />
                  <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.8 }}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => nudgeLayer(selectedTextLayer, 0, -0.01)}
                      sx={selectedTextLayer === 'mensaje' ? { color: '#64748b', borderColor: '#94a3b8', '&:hover': { borderColor: '#64748b', backgroundColor: '#f8fafc' } } : undefined}
                    >
                      Subir
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => nudgeLayer(selectedTextLayer, 0, 0.01)}
                      sx={selectedTextLayer === 'mensaje' ? { color: '#64748b', borderColor: '#94a3b8', '&:hover': { borderColor: '#64748b', backgroundColor: '#f8fafc' } } : undefined}
                    >
                      Bajar
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => nudgeLayer(selectedTextLayer, -0.01, 0)}
                      disabled={selectedTextLayer === 'mensaje'}
                      sx={selectedTextLayer === 'mensaje' ? { color: '#64748b', borderColor: '#94a3b8', '&.Mui-disabled': { color: '#94a3b8', borderColor: '#cbd5e1' } } : undefined}
                    >
                      Izquierda
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => nudgeLayer(selectedTextLayer, 0.01, 0)}
                      disabled={selectedTextLayer === 'mensaje'}
                      sx={selectedTextLayer === 'mensaje' ? { color: '#64748b', borderColor: '#94a3b8', '&.Mui-disabled': { color: '#94a3b8', borderColor: '#cbd5e1' } } : undefined}
                    >
                      Derecha
                    </Button>
                  </Box>
                </Box>
              ) : null}
            </Box>
          </>
        ) : null}

        {activePanel === 'design' ? (
          <>
            <Box className="birthday-step">
              <Typography className="birthday-step-title"><span className="step-dot">1</span>Layout del diseño</Typography>
              <Box className="layout-grid">
                {LAYOUTS.map((layout) => (
                  <Card
                    key={layout.id}
                    className={`layout-option ${layoutId === layout.id ? 'is-active' : ''}`}
                    onClick={() => setLayoutId(layout.id)}
                    elevation={0}
                  >
                    <CardActionArea>
                      <CardContent sx={{ p: 1.1 }}>
                        <Box className={`layout-swatch layout-swatch-${layout.id}`} />
                        <Typography sx={{ fontSize: 12, fontWeight: 700, mt: 0.8 }}>{layout.nombre}</Typography>
                      </CardContent>
                    </CardActionArea>
                  </Card>
                ))}
              </Box>
            </Box>

            <Box className="birthday-step">
              <Typography className="birthday-step-title"><span className="step-dot">2</span>Colores del club</Typography>
              <Box className="color-row">
                <Typography>Fondo</Typography>
                <TextField size="small" value={colors.fondo} onChange={handleColorChange('fondo')} sx={{ width: 116 }} />
                <input type="color" value={colors.fondo} onChange={handleColorChange('fondo')} className="color-input" />
              </Box>
              <Box className="color-row">
                <Typography>Texto</Typography>
                <TextField size="small" value={colors.texto} onChange={handleColorChange('texto')} sx={{ width: 116 }} />
                <input type="color" value={colors.texto} onChange={handleColorChange('texto')} className="color-input" />
              </Box>
              <Box className="color-row">
                <Typography>Acento</Typography>
                <TextField size="small" value={colors.acento} onChange={handleColorChange('acento')} sx={{ width: 116 }} />
                <input type="color" value={colors.acento} onChange={handleColorChange('acento')} className="color-input" />
              </Box>
              <Box className="color-row">
                <Typography>Detalle</Typography>
                <TextField size="small" value={colors.detalle} onChange={handleColorChange('detalle')} sx={{ width: 116 }} />
                <input type="color" value={colors.detalle} onChange={handleColorChange('detalle')} className="color-input" />
              </Box>
            </Box>

            <Box className="birthday-step">
              <Typography className="birthday-step-title"><span className="step-dot">3</span>Logo del club</Typography>
              <Box
                className={`drop-area ${dragLogoActive ? 'active' : ''}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragLogoActive(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setDragLogoActive(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragLogoActive(false);
                  const file = event.dataTransfer.files?.[0];
                  handleSelectLogo(file);
                }}
              >
                {logoActivo ? <img src={logoActivo} alt="Logo del club" className="logo-preview" /> : <CloudUploadOutlinedIcon sx={{ fontSize: 34, color: '#64748b' }} />}
              </Box>
              <Typography className="helper-text">{clubNombre} · PNG transparente recomendado</Typography>
              <Box
                className="dual-mobile-actions"
                sx={{
                  display: 'grid',
                  gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                  gap: 1,
                  mt: 1
                }}
              >
                <Button
                  size="small"
                  fullWidth
                  variant="outlined"
                  onClick={() => logoInputRef.current?.click()}
                  startIcon={<PhotoCameraOutlinedIcon />}
                  sx={{
                    color: '#64748b',
                    borderColor: '#94a3b8',
                    '&:hover': { borderColor: '#64748b', backgroundColor: '#f8fafc' }
                  }}
                >
                  Subir logo
                </Button>
                <Button
                  size="small"
                  fullWidth
                  variant="text"
                  onClick={() => setLogoLocalFile(null)}
                  sx={{
                    color: '#64748b',
                    border: '1px solid #94a3b8',
                    '&:hover': { borderColor: '#64748b', backgroundColor: '#f8fafc' }
                  }}
                >
                  Usar academia
                </Button>
              </Box>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={(event) => handleSelectLogo(event.target.files?.[0])}
              />
            </Box>
          </>
        ) : null}

        {activePanel === 'content' ? (
          <>
            <Box className="birthday-step">
              <Typography className="birthday-step-title"><span className="step-dot">1</span>Mensaje personalizado</Typography>
              <TextField
                value={mensaje}
                onChange={(event) => setMensaje(event.target.value)}
                multiline
                minRows={4}
                fullWidth
              />
              <Typography className="helper-text">Este texto aparece en la publicación generada.</Typography>
            </Box>

            <Box className="birthday-tip-card">
              <Box className="birthday-tip-title">
                <LightbulbOutlinedIcon sx={{ fontSize: 16 }} />
                <span>Tip de diseño</span>
              </Box>
              <Typography sx={{ fontSize: 12, color: '#78350f', lineHeight: 1.35 }}>
                Usa un mensaje corto y emotivo. El nombre del atleta se agrega automáticamente desde el sistema.
              </Typography>
            </Box>

            <Box className="birthday-step">
              <Typography className="birthday-step-title"><span className="step-dot">2</span>Datos automáticos</Typography>
              <Box className="auto-data-grid">
                <Typography>Nombre del atleta</Typography>
                <Typography>{nombreAtleta}</Typography>
                <Typography>Club</Typography>
                <Typography>{clubNombre}</Typography>
              </Box>
            </Box>
          </>
        ) : null}
      </Box>

      <Box className="birthday-generator-preview-wrap">
        <Box className="preview-toolbar">
          <Box className="preview-toolbar-left">
            <Typography className="preview-toolbar-title">Vista previa</Typography>
            <Typography className="preview-toolbar-pill">
              Instagram · {formatoActual.width} x {formatoActual.height}
            </Typography>
          </Box>
          <Box className="preview-toolbar-actions">
            <Button
              variant="text"
              onClick={() => {
                setLayoutId(DEFAULT_LAYOUT);
                setFormatId(DEFAULT_FORMAT);
                setMensaje(DEFAULT_MESSAGE);
                setColors(DEFAULT_COLORS);
                setElementos(createDefaultElements());
                setMessage({ type: 'success', text: 'Diseño restablecido a valores base.' });
              }}
              startIcon={<AutoFixHighOutlinedIcon />}
              sx={{ textTransform: 'none', fontWeight: 700 }}
            >
              Restablecer
            </Button>

          <Button
            variant="contained"
            onClick={descargarPng}
            disabled={descargando || loading}
            startIcon={<DownloadIcon />}
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            {descargando ? 'Generando PNG...' : 'Descargar PNG'}
          </Button>
          </Box>
        </Box>

        <Box
          ref={postRef}
          className={`birthday-post layout-${layoutId} format-${formatId}`}
          style={{
            background: layoutBackground,
            '--birthday-bg': colors.fondo,
            '--birthday-text': colors.texto,
            '--birthday-accent': colors.acento,
            '--birthday-detail': colors.detalle
          }}
        >
          <Box className="post-decoration post-decoration-a" />
          <Box className="post-decoration post-decoration-b" />
          <Box className="post-grid" />
          {layoutId === 'minimal' ? renderMinimalDecorations() : null}
          {layoutId === 'diagonal' ? (
            <>
              <Box className="diagonal-blob" aria-hidden />
            </>
          ) : null}

          {['logo', 'foto', 'texto', 'mensaje'].map((layerKey) => {
            const layerPx = getLayerPx(layerKey);
            return (
              <Rnd
                key={layerKey}
                bounds="parent"
                size={{ width: layerPx.width, height: layerPx.height }}
                position={{ x: layerPx.x, y: layerPx.y }}
                onDragStart={() => setSelectedLayer(layerKey)}
                onResizeStart={() => setSelectedLayer(layerKey)}
                onDragStop={(_, data) => {
                  updateLayerFromPixels(layerKey, {
                    x: data.x,
                    y: data.y,
                    width: layerPx.width,
                    height: layerPx.height
                  }, false);
                }}
                onResizeStop={(_, __, ref, ___, position) => {
                  updateLayerFromPixels(layerKey, {
                    x: position.x,
                    y: position.y,
                    width: ref.offsetWidth,
                    height: ref.offsetHeight
                  }, true);
                }}
                minWidth={layerKey === 'texto' ? 130 : layerKey === 'mensaje' ? 280 : 60}
                minHeight={layerKey === 'texto' ? 70 : layerKey === 'mensaje' ? 34 : 40}
                className={`post-layer post-layer-${layerKey} ${selectedLayer === layerKey ? 'is-selected' : ''}`}
              >
                {renderLayerContent(layerKey, layerPx.fontScale || 1, true)}
              </Rnd>
            );
          })}
        </Box>

        <Box className="birthday-export-stage" aria-hidden>
          <Box
            ref={exportRef}
            className={`birthday-post birthday-post-export layout-${layoutId} format-${formatId}`}
            style={{
              width: `${formatoActual.width}px`,
              height: `${formatoActual.height}px`,
              aspectRatio: 'auto',
              background: layoutBackground,
              '--birthday-bg': colors.fondo,
              '--birthday-text': colors.texto,
              '--birthday-accent': colors.acento,
              '--birthday-detail': colors.detalle
            }}
          >
            <Box className="post-decoration post-decoration-a" />
            <Box className="post-decoration post-decoration-b" />
            <Box className="post-grid" />
            {layoutId === 'minimal' ? renderMinimalDecorations() : null}
            {layoutId === 'diagonal' ? (
              <>
                <Box className="diagonal-blob" aria-hidden />
              </>
            ) : null}

            <Box className="post-layer-static post-layer-logo" style={getLayerRelativeStyle('logo')}>
              {renderLayerContent('logo', 1, false)}
            </Box>
            <Box className="post-layer-static post-layer-foto" style={getLayerRelativeStyle('foto')}>
              {renderLayerContent('foto', 1, false)}
            </Box>
            <Box className="post-layer-static post-layer-texto" style={getLayerRelativeStyle('texto')}>
              {renderLayerContent('texto', (layersActuales?.texto?.fontScale || 1), false)}
            </Box>
            <Box className="post-layer-static post-layer-mensaje" style={getLayerRelativeStyle('mensaje')}>
              {renderLayerContent('mensaje', (layersActuales?.mensaje?.fontScale || 1), false)}
            </Box>
          </Box>
        </Box>

      </Box>

      <Dialog
        open={confirmarEliminarPresetOpen}
        onClose={cerrarDialogoEliminarPreset}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#b91c1c' }}>Eliminar plantilla</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mt: 1.5, mb: 1.5 }}>
            Esta accion no se puede deshacer.
          </Alert>
          <Typography sx={{ color: '#334155' }}>
            ¿Seguro que deseas eliminar la plantilla "{presetAEliminar}"?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={cerrarDialogoEliminarPreset} disabled={eliminandoPreset}>
            Cancelar
          </Button>
          <Button variant="contained" color="error" onClick={eliminarPresetAcademia} disabled={eliminandoPreset}>
            {eliminandoPreset ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default CumpleanosPostGenerator;
