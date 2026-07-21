import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Switch,
  Snackbar,
  Alert,
  AlertTitle,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  InputAdornment,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import StraightenIcon from '@mui/icons-material/Straighten';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { mediaUrl } from '../utils/mediaUrl';


const API_URL = `${process.env.REACT_APP_API_URL}/api/uniformes`;

const GENERO_VARIANTES = [
  { key: 'masculino', label: 'Masculino' },
  { key: 'femenino', label: 'Femenino' },
  { key: 'mixto', label: 'Mixto' }
];

const TALLAS_VARIANTES = ['6', '8', '10', '12', '14', '16', 'XS', 'S', 'M', 'L', 'XL', 'XXL'];

const initialForm = {
  prenda: '',
  precio: '',
  precio_aplicar_variantes: '',
  moneda: 'USD',
  variantes_precio_activo: false,
  variantes_generos: [],
  variantes_tallas: [],
  precios_variantes: [],
  lleva_nombre_atleta: false,
  lleva_personalizacion_nombre: false,
  lleva_numero_franela: false,
  franela_representante: false,
  fotos: []
};

function normalizeVariantPriceRows(rows = []) {
  const normalized = rows
    .map((row) => ({
      genero: String(row?.genero || '').trim().toLowerCase(),
      talla: String(row?.talla || '').trim().toUpperCase(),
      precio: row?.precio === '' || row?.precio === null || row?.precio === undefined
        ? ''
        : Number(row?.precio)
    }))
    .filter((row) => row.genero && row.talla);

  const uniqueMap = new Map();
  normalized.forEach((row) => {
    uniqueMap.set(`${row.genero}::${row.talla}`, row);
  });
  return Array.from(uniqueMap.values());
}

function upsertVariantBatch(existingRows = [], generos = [], tallas = [], precio) {
  const map = new Map(normalizeVariantPriceRows(existingRows).map((row) => [`${row.genero}::${row.talla}`, row]));

  generos.forEach((genero) => {
    tallas.forEach((talla) => {
      map.set(`${genero}::${talla}`, { genero, talla, precio });
    });
  });

  return Array.from(map.values());
}

function getGeneroLabel(genero) {
  const found = GENERO_VARIANTES.find((item) => item.key === genero);
  if (found) return found.label;
  const normalized = String(genero || '').trim().toLowerCase();
  return normalized ? `${normalized.charAt(0).toUpperCase()}${normalized.slice(1)}` : '-';
}

function parsePriceInput(rawValue) {
  const text = String(rawValue ?? '').trim().replace(',', '.');
  if (text === '') return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function buildVariantSummaryRows(rows = []) {
  const grouped = new Map();
  normalizeVariantPriceRows(rows).forEach((row) => {
    const price = Number(row.precio);
    if (!Number.isFinite(price) || price < 0) return;

    const key = price.toFixed(2);
    const current = grouped.get(key) || {
      precio: price,
      generos: new Set(),
      tallas: new Set(),
      combinaciones: 0,
      keys: []
    };

    current.generos.add(row.genero);
    current.tallas.add(row.talla);
    current.combinaciones += 1;
    current.keys.push(`${row.genero}::${row.talla}`);
    grouped.set(key, current);
  });

  return Array.from(grouped.values()).map((item) => ({
    precio: item.precio,
    generos: Array.from(item.generos),
    tallas: Array.from(item.tallas),
    combinaciones: item.combinaciones,
    keys: item.keys
  }));
}

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

const MAX_IMAGE_WIDTH = 1280;
const MAX_IMAGE_HEIGHT = 1280;
const TARGET_IMAGE_QUALITY = 0.78;

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo procesar la imagen seleccionada.'));
    };

    image.src = objectUrl;
  });
}

async function optimizeImage(file) {
  if (!(file instanceof File) || !String(file.type || '').toLowerCase().startsWith('image/')) {
    throw new Error('Archivo invalido.');
  }

  const image = await loadImageFromFile(file);
  const ratio = Math.min(MAX_IMAGE_WIDTH / image.width, MAX_IMAGE_HEIGHT / image.height, 1);
  const targetWidth = Math.max(1, Math.round(image.width * ratio));
  const targetHeight = Math.max(1, Math.round(image.height * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('No se pudo comprimir la imagen.');
  }

  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (!result) {
          reject(new Error('No se pudo generar la imagen optimizada.'));
          return;
        }
        resolve(result);
      },
      'image/webp',
      TARGET_IMAGE_QUALITY
    );
  });

  const optimizedName = `${String(file.name || 'uniforme').replace(/\.[^/.]+$/, '')}.webp`;
  return new File([blob], optimizedName, {
    type: 'image/webp',
    lastModified: Date.now()
  });
}

export default function Uniformes() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [uniformes, setUniformes] = useState([]);
  const [open, setOpen] = useState(false);
  const [confirmarEliminarOpen, setConfirmarEliminarOpen] = useState(false);
  const [uniformeAEliminar, setUniformeAEliminar] = useState(null);
  const [previewImage, setPreviewImage] = useState({ open: false, src: '', title: '', isObjectUrl: false });
  const [deletingId, setDeletingId] = useState('');
  const [form, setForm] = useState(initialForm);
  const [fotosNuevas, setFotosNuevas] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState({ open: false, message: '', severity: 'success' });
  const [editingVariantKeys, setEditingVariantKeys] = useState([]);
  const fileInputRef = useRef(null);
  const token = localStorage.getItem('token');

  // Obtener uniformes del backend
  const fetchUniformes = async () => {
    if (!token) {
      setUniformes([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}?_t=${Date.now()}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudieron cargar los uniformes');
      setUniformes(data);
    } catch (e) {
      setUniformes([]);
      setAlert({ open: true, message: e.message || 'Error al cargar uniformes', severity: 'error' });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchUniformes();
    // eslint-disable-next-line
  }, []);

  const handleOpen = (id = null) => {
    if (!token) return;
    if (id !== null) {
      const u = uniformes.find((u) => u._id === id);
      const generosSeleccionados = Array.isArray(u.variantes_generos) ? u.variantes_generos : [];
      const tallasSeleccionadas = Array.isArray(u.variantes_tallas) ? u.variantes_tallas : [];
      setForm({
        prenda: u.prenda,
        precio: u.precio,
        moneda: String(u.moneda || 'USD').toUpperCase() === 'EUR' ? 'EUR' : 'USD',
        variantes_precio_activo: Boolean(u.variantes_precio_activo),
        variantes_generos: generosSeleccionados,
        variantes_tallas: tallasSeleccionadas,
        precios_variantes: normalizeVariantPriceRows(u.precios_variantes || []),
        lleva_nombre_atleta: Boolean(u.lleva_nombre_atleta),
        lleva_personalizacion_nombre: Boolean(u.lleva_personalizacion_nombre),
        lleva_numero_franela: Boolean(u.lleva_numero_franela),
        franela_representante: Boolean(u.franela_representante),
        fotos: Array.isArray(u.fotos) ? u.fotos.slice(0, 2) : []
      });
      setFotosNuevas([]);
      setEditId(id);
      setEditingVariantKeys([]);
    } else {
      setForm(initialForm);
      setFotosNuevas([]);
      setEditId(null);
      setEditingVariantKeys([]);
    }
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setForm(initialForm);
    setFotosNuevas([]);
    setEditId(null);
    setEditingVariantKeys([]);
  };

  const handleChange = (e) => {
    const { name, type, checked, value } = e.target;
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value });
  };

  const toggleGeneroVariante = (genero) => {
    setForm((prev) => {
      const exists = prev.variantes_generos.includes(genero);
      let nextGeneros;

      if (genero === 'mixto') {
        nextGeneros = exists ? [] : ['mixto'];
      } else if (exists) {
        nextGeneros = prev.variantes_generos.filter((item) => item !== genero);
      } else {
        nextGeneros = prev.variantes_generos
          .filter((item) => item !== 'mixto')
          .concat(genero);
      }

      return {
        ...prev,
        variantes_generos: nextGeneros
      };
    });
  };

  const toggleTallaVariante = (talla) => {
    setForm((prev) => {
      const exists = prev.variantes_tallas.includes(talla);
      const nextTallas = exists
        ? prev.variantes_tallas.filter((item) => item !== talla)
        : [...prev.variantes_tallas, talla];

      return {
        ...prev,
        variantes_tallas: nextTallas
      };
    });
  };

  const toggleTodasTallasVariantes = () => {
    setForm((prev) => {
      const todasSeleccionadas = TALLAS_VARIANTES.every((talla) => prev.variantes_tallas.includes(talla));
      return {
        ...prev,
        variantes_tallas: todasSeleccionadas ? [] : [...TALLAS_VARIANTES]
      };
    });
  };

  const editarSeleccionesAplicadas = (summaryRow = null) => {
    if (!summaryRow) {
      const rows = normalizeVariantPriceRows(form.precios_variantes);
      if (!rows.length) return;

      const generos = Array.from(new Set(rows.map((row) => row.genero)));
      const tallas = Array.from(new Set(rows.map((row) => row.talla)));
      const preciosUnicos = Array.from(new Set(rows.map((row) => Number(row.precio)).filter((value) => Number.isFinite(value))));

      setForm((prev) => ({
        ...prev,
        variantes_generos: generos,
        variantes_tallas: tallas,
        precio_aplicar_variantes: preciosUnicos.length === 1 ? String(preciosUnicos[0]) : ''
      }));
      return;
    }

    setForm((prev) => ({
      ...prev,
      variantes_generos: Array.isArray(summaryRow.generos) ? summaryRow.generos : [],
      variantes_tallas: Array.isArray(summaryRow.tallas) ? summaryRow.tallas : [],
      precio_aplicar_variantes: Number.isFinite(Number(summaryRow.precio)) ? String(summaryRow.precio) : ''
    }));
    setEditingVariantKeys(Array.isArray(summaryRow.keys) ? summaryRow.keys : []);
  };

  const cancelarEdicionVariante = () => {
    setForm((prev) => ({
      ...prev,
      variantes_generos: [],
      variantes_tallas: [],
      precio_aplicar_variantes: ''
    }));
    setEditingVariantKeys([]);
  };

  const quitarSeleccionesAplicadas = (summaryRow) => {
    const precioObjetivo = Number(summaryRow?.precio);
    if (!Number.isFinite(precioObjetivo)) return;

    setForm((prev) => ({
      ...prev,
      precios_variantes: normalizeVariantPriceRows(prev.precios_variantes)
        .filter((row) => Number(row.precio).toFixed(2) !== precioObjetivo.toFixed(2))
    }));
    setEditingVariantKeys([]);
  };

  const aplicarPrecioBaseAVariantes = () => {
    const precioBase = parsePriceInput(form.precio_aplicar_variantes);
    if (precioBase === null) {
      setAlert({ open: true, message: 'Ingresa un precio valido para aplicar.', severity: 'warning' });
      return;
    }
    if (form.variantes_generos.length === 0 || form.variantes_tallas.length === 0) {
      setAlert({ open: true, message: 'Selecciona genero y talla para aplicar el precio.', severity: 'warning' });
      return;
    }

    const keysEnEdicion = editingVariantKeys;

    setForm((prev) => ({
      ...(() => {
        const normalized = normalizeVariantPriceRows(prev.precios_variantes);
        const rowsBase = keysEnEdicion.length
          ? normalized.filter((row) => !keysEnEdicion.includes(`${row.genero}::${row.talla}`))
          : normalized;

        return {
          ...prev,
          precio_aplicar_variantes: '',
          variantes_generos: [],
          variantes_tallas: [],
          precios_variantes: upsertVariantBatch(rowsBase, prev.variantes_generos, prev.variantes_tallas, precioBase)
        };
      })()
    }));

    if (keysEnEdicion.length) {
      setAlert({ open: true, message: 'Variante editada y guardada.', severity: 'success' });
    }
    setEditingVariantKeys([]);
  };

  const toggleVariantesPrecioActivo = () => {
    setForm((prev) => {
      const nextActive = !prev.variantes_precio_activo;
      if (!nextActive) {
        return {
          ...prev,
          variantes_precio_activo: false,
          variantes_generos: [],
          variantes_tallas: [],
          precios_variantes: []
        };
      }

      return {
        ...prev,
        variantes_precio_activo: true,
        variantes_generos: prev.variantes_generos,
        variantes_tallas: prev.variantes_tallas,
        precios_variantes: normalizeVariantPriceRows(prev.precios_variantes)
      };
    });
  };

  const totalFotosSeleccionadas = (form.fotos?.length || 0) + fotosNuevas.length;
  const preciosVariantesNormalizados = normalizeVariantPriceRows(form.precios_variantes);
  const resumenFilasVariantes = buildVariantSummaryRows(preciosVariantesNormalizados);
  const precioAplicarValido = parsePriceInput(form.precio_aplicar_variantes) !== null;
  const tallasSeleccionadasCount = form.variantes_tallas.filter((talla) => TALLAS_VARIANTES.includes(talla)).length;
  const todasTallasSeleccionadas = TALLAS_VARIANTES.length > 0 && tallasSeleccionadasCount === TALLAS_VARIANTES.length;
  const hayTallasSeleccionadas = tallasSeleccionadasCount > 0;

  const agregarFotos = async (archivos = []) => {
    const imagenes = archivos.filter((archivo) => String(archivo?.type || '').toLowerCase().startsWith('image/'));
    if (!imagenes.length) return;

    const espaciosDisponibles = Math.max(0, 2 - totalFotosSeleccionadas);
    if (espaciosDisponibles <= 0) {
      setAlert({ open: true, message: 'Solo puedes cargar hasta 2 fotos por prenda.', severity: 'error' });
      return;
    }

    const imagenesAAgregar = imagenes.slice(0, espaciosDisponibles);
    if (imagenesAAgregar.length < imagenes.length) {
      setAlert({ open: true, message: 'Solo puedes cargar hasta 2 fotos por prenda.', severity: 'error' });
    }

    const optimizadas = [];
    for (const imagen of imagenesAAgregar) {
      try {
        const imagenOptimizada = await optimizeImage(imagen);
        optimizadas.push(imagenOptimizada);
      } catch {
        optimizadas.push(imagen);
      }
    }

    setFotosNuevas((prev) => [...prev, ...optimizadas]);
  };

  const handleFotosChange = async (e) => {
    const archivos = Array.from(e.target.files || []);
    if (!archivos.length) return;
    await agregarFotos(archivos);
    e.target.value = '';
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

  const handleDrop = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const archivos = Array.from(event.dataTransfer?.files || []);
    if (!archivos.length) return;
    await agregarFotos(archivos);
  };

  const abrirVistaImagen = (src, title, isObjectUrl = false) => {
    if (!src) return;
    setPreviewImage({ open: true, src, title: title || 'Imagen de prenda', isObjectUrl });
  };

  const cerrarVistaImagen = () => {
    setPreviewImage((prev) => {
      if (prev.isObjectUrl && prev.src) {
        URL.revokeObjectURL(prev.src);
      }
      return { open: false, src: '', title: '', isObjectUrl: false };
    });
  };

  const removerFotoExistente = (index) => {
    setForm((prev) => ({
      ...prev,
      fotos: (prev.fotos || []).filter((_, fotoIndex) => fotoIndex !== index)
    }));
  };

  const removerFotoNueva = (index) => {
    setFotosNuevas((prev) => prev.filter((_, fotoIndex) => fotoIndex !== index));
  };

  const handleSave = async () => {
    if (!token || !form.prenda) return;
    try {
      if (totalFotosSeleccionadas > 2) {
        throw new Error('Solo puedes guardar hasta 2 fotos por prenda.');
      }

      const preciosVariantes = normalizeVariantPriceRows(form.precios_variantes || [])
        .filter((item) => Number.isFinite(Number(item.precio)) && Number(item.precio) >= 0);
      const variantesGeneros = Array.from(new Set(preciosVariantes.map((item) => item.genero)));
      const variantesTallas = Array.from(new Set(preciosVariantes.map((item) => item.talla)));

      if (form.variantes_precio_activo) {
        if (preciosVariantes.length === 0) {
          throw new Error('Debes aplicar al menos una variante de precio para guardar.');
        }
      } else if (form.precio === '' || form.precio === null || form.precio === undefined) {
        throw new Error('Debes indicar el precio base de la prenda.');
      }

      const precioBasePayload = form.variantes_precio_activo
        ? (form.precio === '' || form.precio === null || form.precio === undefined ? '0' : String(form.precio))
        : String(form.precio);

      const formData = new FormData();
      formData.append('prenda', form.prenda);
      formData.append('precio', precioBasePayload);
      formData.append('moneda', String(form.moneda || 'USD').toUpperCase());
      formData.append('variantes_precio_activo', String(Boolean(form.variantes_precio_activo)));
      formData.append('variantes_generos', JSON.stringify(variantesGeneros));
      formData.append('variantes_tallas', JSON.stringify(variantesTallas));
      formData.append('precios_variantes', JSON.stringify(preciosVariantes));
      formData.append('lleva_nombre_atleta', String(Boolean(form.lleva_nombre_atleta)));
      formData.append('lleva_personalizacion_nombre', String(Boolean(form.lleva_personalizacion_nombre)));
      formData.append('lleva_numero_franela', String(Boolean(form.lleva_numero_franela)));
      formData.append('franela_representante', String(Boolean(form.franela_representante)));
      formData.append('fotos_existentes', JSON.stringify(Array.isArray(form.fotos) ? form.fotos : []));
      fotosNuevas.forEach((foto) => formData.append('fotos', foto));

      if (editId) {
        const res = await fetch(`${API_URL}/${editId}`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: formData
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Error al actualizar uniforme');
        setAlert({ open: true, message: 'Uniforme editado con exito.', severity: 'success' });
      } else {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`
          },
          body: formData
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Error al crear uniforme');
        setAlert({ open: true, message: 'Uniforme agregado con exito.', severity: 'success' });
      }
      await fetchUniformes();
      handleClose();
    } catch (e) {
      setAlert({ open: true, message: e.message || 'No se pudo guardar el uniforme', severity: 'error' });
    }
  };

  const handleDelete = async (id) => {
    if (!token || !id) return false;
    try {
      setDeletingId(id);
      const res = await fetch(`${API_URL}/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'No se pudo eliminar el uniforme');
      setAlert({ open: true, message: 'Uniforme eliminado con exito.', severity: 'success' });
      await fetchUniformes();
      return true;
    } catch (e) {
      setAlert({ open: true, message: e.message || 'No se pudo eliminar el uniforme', severity: 'error' });
      return false;
    } finally {
      setDeletingId('');
    }
  };

  const solicitarEliminarUniforme = (uniforme) => {
    if (!uniforme?._id) return;
    setUniformeAEliminar(uniforme);
    setConfirmarEliminarOpen(true);
  };

  const cerrarDialogoEliminar = () => {
    if (deletingId) return;
    setConfirmarEliminarOpen(false);
    setUniformeAEliminar(null);
  };

  const confirmarEliminarUniforme = async () => {
    if (!uniformeAEliminar?._id) return;
    const eliminado = await handleDelete(uniformeAEliminar._id);
    if (eliminado) {
      setConfirmarEliminarOpen(false);
      setUniformeAEliminar(null);
    }
  };

  return (
    <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 } }}>
      <h2>Gestion de uniformes</h2>
      {!token && (
        <Typography color="error" sx={{ mb: 2 }}>
          Debes iniciar sesión como administrador para gestionar uniformes.
        </Typography>
      )}
      <Button
        variant="contained"
        color="secondary"
        onClick={() => handleOpen()}
        sx={{ mb: 2, borderRadius: 999, width: { xs: '100%', sm: 'auto' } }}
        disabled={!token}
      >
        Agregar Prenda
      </Button>
      {isMobile ? (
        <Box sx={{ display: 'grid', gap: 1.25 }}>
          {loading && (
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography color="text.secondary">Cargando...</Typography>
            </Paper>
          )}

          {!loading && uniformes.length === 0 && (
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography color="text.secondary">No hay uniformes registrados.</Typography>
            </Paper>
          )}

          {!loading && uniformes.map((uniforme) => (
            <Paper key={uniforme._id} sx={{ p: 1.5, borderRadius: 2.5, border: '1px solid #eef0f3' }}>
              <Typography sx={{ fontWeight: 800, color: '#0f172a', mb: 0.75 }}>
                {uniforme.prenda}
              </Typography>
              <Box sx={{ display: 'grid', gap: 0.35 }}>
                <Typography sx={{ fontSize: 13, color: '#475569' }}><b>Precio:</b> ${uniforme.precio}</Typography>
                <Typography sx={{ fontSize: 13, color: '#475569' }}><b>Moneda:</b> {String(uniforme.moneda || 'USD').toUpperCase()}</Typography>
                <Typography sx={{ fontSize: 13, color: '#475569' }}><b>Nombre del atleta:</b> {uniforme.lleva_nombre_atleta ? 'Si' : 'No'}</Typography>
                <Typography sx={{ fontSize: 13, color: '#475569' }}><b>Personalización nombre:</b> {uniforme.lleva_personalizacion_nombre ? 'Si' : 'No'}</Typography>
                <Typography sx={{ fontSize: 13, color: '#475569' }}><b>Número de franela:</b> {uniforme.lleva_numero_franela ? 'Si' : 'No'}</Typography>
                <Typography sx={{ fontSize: 13, color: '#475569' }}><b>Franela representante:</b> {uniforme.franela_representante ? 'Si' : 'No'}</Typography>
              </Box>
              {Array.isArray(uniforme.fotos) && uniforme.fotos.length > 0 && (
                <Box sx={{ display: 'flex', gap: 1, mt: 1.25, flexWrap: 'wrap' }}>
                  {uniforme.fotos.map((foto, index) => (
                    <Box
                      key={`${uniforme._id}-foto-${index}`}
                      component="img"
                      src={mediaUrl(foto)}
                      alt={`${uniforme.prenda} ${index + 1}`}
                      sx={{ width: 72, height: 72, borderRadius: 2, objectFit: 'cover', border: '1px solid #e2e8f0' }}
                    />
                  ))}
                </Box>
              )}
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 1 }}>
                <IconButton onClick={() => handleOpen(uniforme._id)} disabled={!token}>
                  <EditIcon />
                </IconButton>
                <IconButton
                  onClick={() => solicitarEliminarUniforme(uniforme)}
                  disabled={!token || deletingId === uniforme._id}
                >
                  <DeleteIcon />
                </IconButton>
              </Box>
            </Paper>
          ))}
        </Box>
      ) : (
        <TableContainer
          component={Paper}
          sx={{
            overflowX: 'auto',
            overflowY: 'hidden',
            maxWidth: '100%',
            borderRadius: 3,
            border: '1px solid #eef0f3',
            boxShadow: 'none'
          }}
        >
          <Table sx={{ minWidth: 860, width: '100%', tableLayout: 'fixed' }}>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f8fafc' }}>
                <TableCell sx={{ width: '19%', color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', px: 1.5 }}>PRENDA</TableCell>
                <TableCell sx={{ width: '9%', color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', px: 1 }}>PRECIO</TableCell>
                <TableCell sx={{ width: '8%', color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', px: 1 }}>MONEDA</TableCell>
                <TableCell sx={{ width: '16%', color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', px: 1 }}>NOMBRE DEL ATLETA</TableCell>
                <TableCell sx={{ width: '16%', color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', px: 1 }}>PERSONALIZACION NOMBRE</TableCell>
                <TableCell sx={{ width: '14%', color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', px: 1 }}>NUMERO DE FRANELA</TableCell>
                <TableCell sx={{ width: '12%', color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', px: 1 }}>FRANELA REP.</TableCell>
                <TableCell sx={{ width: '12%', color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textAlign: 'center', px: 1 }}>ACCIONES</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 2.2, color: '#94a3b8', fontWeight: 600 }}>
                    Cargando...
                  </TableCell>
                </TableRow>
              ) : (
                uniformes.map((uniforme) => {
                  const variantesCount = Boolean(uniforme.variantes_precio_activo)
                    ? buildVariantSummaryRows(uniforme.precios_variantes || []).length
                    : 0;

                  return (
                    <TableRow
                      key={uniforme._id}
                      sx={{ '& td': { borderBottom: '1px solid #eef0f3', py: 1.45, px: 1 }, '&:hover': { backgroundColor: '#fafafa' } }}
                    >
                      <TableCell sx={{ px: 1.5, color: '#0f172a', fontWeight: 700 }}>
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
                          <span>{uniforme.prenda}</span>
                          {variantesCount > 0 && (
                            <Box
                              component="span"
                              sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                px: 0.8,
                                py: 0.2,
                                borderRadius: 999,
                                fontSize: 11,
                                fontWeight: 700,
                                letterSpacing: '0.02em',
                                color: '#b45309',
                                bgcolor: '#ffedd5',
                                border: '1px solid #fdba74'
                              }}
                            >
                              {`${variantesCount} variante${variantesCount === 1 ? '' : 's'}`}
                            </Box>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>
                        {uniforme.precio}
                      </TableCell>
                      <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>
                        {String(uniforme.moneda || 'USD').toUpperCase()}
                      </TableCell>
                      <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>
                        {uniforme.lleva_nombre_atleta ? 'Si' : 'No'}
                      </TableCell>
                      <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>
                        {uniforme.lleva_personalizacion_nombre ? 'Si' : 'No'}
                      </TableCell>
                      <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>
                        {uniforme.lleva_numero_franela ? 'Si' : 'No'}
                      </TableCell>
                      <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>
                        {uniforme.franela_representante ? 'Si' : 'No'}
                      </TableCell>
                      <TableCell align="center" sx={{ whiteSpace: 'nowrap' }}>
                        <IconButton
                          onClick={() => handleOpen(uniforme._id)}
                          disabled={!token}
                          size="small"
                          sx={{ color: '#94a3b8', p: 0.55 }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          onClick={() => solicitarEliminarUniforme(uniforme)}
                          disabled={!token || deletingId === uniforme._id}
                          size="small"
                          sx={{ color: '#94a3b8', p: 0.55 }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
              {!loading && uniformes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 2.5, color: '#94a3b8', fontWeight: 600 }}>
                    No hay uniformes registrados.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Dialog
        open={confirmarEliminarOpen}
        onClose={cerrarDialogoEliminar}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
      >
        <DialogTitle sx={{ color: '#0B0F2A', fontWeight: 800 }}>
          Confirmar eliminación
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          <Typography sx={{ color: '#334155', fontSize: 14 }}>
            ¿Seguro que deseas eliminar la prenda {uniformeAEliminar?.prenda ? `"${uniformeAEliminar.prenda}"` : ''}? Esta acción no se puede deshacer.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={cerrarDialogoEliminar} disabled={!!deletingId}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={confirmarEliminarUniforme}
            disabled={!!deletingId}
          >
            {deletingId ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="lg"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: 'hidden',
            width: 'min(1120px, 96vw)',
            boxShadow: '0 24px 50px rgba(15, 23, 42, 0.24)'
          }
        }}
      >
        <DialogTitle
          sx={{
            px: 2.5,
            py: 1.8,
            bgcolor: '#f8fafc',
            borderBottom: '1px solid #e2e8f0',
            fontWeight: 800,
            fontSize: 16,
            color: '#0f172a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          {editId ? 'Editar Prenda' : 'Agregar Prenda'}
          <IconButton
            aria-label="cerrar"
            onClick={handleClose}
            size="small"
            sx={{ color: '#94a3b8' }}
          >
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ px: 2.5, pt: 2.25, pb: 1.25, bgcolor: '#ffffff' }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1.25fr 0.75fr' },
              gap: 2,
              alignItems: 'start'
            }}
          >
            <Box>
          <TextField
            autoFocus
            margin="dense"
            name="prenda"
            label="Prenda"
            placeholder="Ej: Franela de entrenamiento"
            fullWidth
            value={form.prenda}
            onChange={handleChange}
            disabled={!token}
            sx={modalInputSx}
          />

          <Box
            sx={{
              mt: 1.5,
              border: '1px solid #e2e8f0',
              borderRadius: 2,
              p: 1.5,
              backgroundColor: '#f8fafc'
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Box>
                <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                  Variantes de precio
                </Typography>
                <Typography sx={{ fontSize: 12, color: '#64748b' }}>
                  El precio puede variar según género y talla.
                </Typography>
              </Box>
              <Switch
                checked={Boolean(form.variantes_precio_activo)}
                onChange={toggleVariantesPrecioActivo}
                disabled={!token}
                size="small"
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': { color: '#f97316' },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: '#fdba74' }
                }}
              />
            </Box>

            {form.variantes_precio_activo && (
              <Box sx={{ mt: 1.5, display: 'grid', gap: 1.25 }}>
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#334155', mb: 0.75, display: 'inline-flex', alignItems: 'center', gap: 0.55 }}>
                    <PersonOutlineIcon sx={{ fontSize: 15, color: '#64748b' }} />
                    Género
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                    {GENERO_VARIANTES.map((option) => {
                      const selected = form.variantes_generos.includes(option.key);
                      const mixtoActivo = form.variantes_generos.includes('mixto');
                      const optionDisabled = !token || (mixtoActivo && option.key !== 'mixto');
                      return (
                        <Button
                          key={option.key}
                          type="button"
                          size="small"
                          variant="outlined"
                          onClick={() => toggleGeneroVariante(option.key)}
                          disabled={optionDisabled}
                          sx={{
                            textTransform: 'none',
                            fontWeight: 700,
                            borderRadius: 2,
                            minWidth: 96,
                            bgcolor: '#ffffff',
                            borderColor: selected ? '#f97316' : '#cbd5e1',
                            color: selected ? '#c2410c' : '#475569',
                            '&:hover': {
                              bgcolor: '#ffffff',
                              borderColor: selected ? '#ea580c' : '#94a3b8'
                            }
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6 }}>
                            <Checkbox
                              checked={selected}
                              tabIndex={-1}
                              disableRipple
                              size="small"
                              sx={{
                                p: 0,
                                pointerEvents: 'none',
                                color: selected ? '#f97316' : optionDisabled ? '#cbd5e1' : '#94a3b8',
                                '&.Mui-checked': { color: '#f97316' }
                              }}
                            />
                            {option.label}
                          </Box>
                        </Button>
                      );
                    })}
                  </Box>
                </Box>

                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#334155', mb: 0.75, display: 'inline-flex', alignItems: 'center', gap: 0.55 }}>
                    <StraightenIcon sx={{ fontSize: 15, color: '#64748b' }} />
                    Talla
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                    <Button
                      type="button"
                      size="small"
                      variant="outlined"
                      onClick={toggleTodasTallasVariantes}
                      disabled={!token}
                      sx={{
                        textTransform: 'none',
                        fontWeight: 700,
                        borderRadius: 2,
                        minWidth: 138,
                        bgcolor: '#ffffff',
                        borderColor: todasTallasSeleccionadas ? '#f97316' : '#cbd5e1',
                        color: todasTallasSeleccionadas ? '#c2410c' : '#475569',
                        '&:hover': {
                          bgcolor: '#ffffff',
                          borderColor: todasTallasSeleccionadas ? '#ea580c' : '#94a3b8'
                        }
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Checkbox
                          checked={todasTallasSeleccionadas}
                          indeterminate={!todasTallasSeleccionadas && hayTallasSeleccionadas}
                          tabIndex={-1}
                          disableRipple
                          size="small"
                          sx={{
                            p: 0,
                            pointerEvents: 'none',
                            color: (todasTallasSeleccionadas || hayTallasSeleccionadas) ? '#f97316' : '#94a3b8',
                            '&.Mui-checked': { color: '#f97316' },
                            '&.MuiCheckbox-indeterminate': { color: '#f97316' }
                          }}
                        />
                        {todasTallasSeleccionadas ? 'Quitar todas' : 'Seleccionar todo'}
                      </Box>
                    </Button>
                    {TALLAS_VARIANTES.map((tallaOption) => {
                      const selected = form.variantes_tallas.includes(tallaOption);
                      return (
                        <Button
                          key={tallaOption}
                          type="button"
                          size="small"
                          variant="outlined"
                          onClick={() => toggleTallaVariante(tallaOption)}
                          disabled={!token}
                          sx={{
                            textTransform: 'none',
                            fontWeight: 700,
                            borderRadius: 2,
                            minWidth: 64,
                            bgcolor: '#ffffff',
                            borderColor: selected ? '#f97316' : '#cbd5e1',
                            color: selected ? '#c2410c' : '#475569',
                            '&:hover': {
                              bgcolor: '#ffffff',
                              borderColor: selected ? '#ea580c' : '#94a3b8'
                            }
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Checkbox
                              checked={selected}
                              tabIndex={-1}
                              disableRipple
                              size="small"
                              sx={{
                                p: 0,
                                pointerEvents: 'none',
                                color: selected ? '#f97316' : '#94a3b8',
                                '&.Mui-checked': { color: '#f97316' }
                              }}
                            />
                            {tallaOption}
                          </Box>
                        </Button>
                      );
                    })}
                  </Box>
                </Box>

                <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 2, overflow: 'hidden', bgcolor: '#fff' }}>
                  <Box
                    sx={{
                      px: 1.25,
                      py: 0.75,
                      borderBottom: '1px solid #e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1,
                      flexWrap: 'wrap'
                    }}
                  >
                    <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#334155' }}>
                      Precio por combinacion
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 0.75 }}>
                      <TextField
                        size="small"
                        type="number"
                        placeholder="0.00"
                        value={form.precio_aplicar_variantes}
                        onChange={(event) => setForm((prev) => ({ ...prev, precio_aplicar_variantes: event.target.value }))}
                        disabled={!token}
                        inputProps={{ min: 0, step: '0.01' }}
                        sx={{
                          width: 112,
                          '& .MuiOutlinedInput-root': {
                            height: 40,
                            borderRadius: 1.5
                          }
                        }}
                        InputProps={{
                          startAdornment: <InputAdornment position="start">$</InputAdornment>
                        }}
                      />
                      <Button
                        type="button"
                        size="small"
                        variant="outlined"
                        onClick={aplicarPrecioBaseAVariantes}
                        disabled={!token || !precioAplicarValido || form.variantes_generos.length === 0 || form.variantes_tallas.length === 0}
                        sx={{
                          minWidth: 112,
                          height: 40,
                          borderRadius: 1.5,
                          textTransform: 'none',
                          fontWeight: 700,
                          borderColor: '#fdba74',
                          color: '#c2410c'
                        }}
                      >
                        {editingVariantKeys.length > 0 ? 'Guardar edicion' : 'Aplicar'}
                      </Button>
                      {editingVariantKeys.length > 0 && (
                        <Button
                          type="button"
                          size="small"
                          variant="text"
                          onClick={cancelarEdicionVariante}
                          disabled={!token}
                          sx={{
                            minWidth: 88,
                            height: 40,
                            textTransform: 'none',
                            fontWeight: 700,
                            color: '#64748b'
                          }}
                        >
                          Cancelar
                        </Button>
                      )}
                    </Box>
                  </Box>

                  <Typography sx={{ px: 1.25, pt: 0.8, pb: 0.35, fontSize: 11.5, color: '#64748b' }}>
                    Se aplicará al lote seleccionado: {form.variantes_generos.length} genero(s) x {form.variantes_tallas.length} talla(s)
                  </Typography>
                  {editingVariantKeys.length > 0 && (
                    <Typography sx={{ px: 1.25, pb: 0.35, fontSize: 11.5, fontWeight: 700, color: '#b45309' }}>
                      Modo edicion activo: pulsa Guardar edicion para persistir los cambios.
                    </Typography>
                  )}

                  {preciosVariantesNormalizados.length === 0 ? (
                    <Typography sx={{ px: 1.25, py: 1.2, fontSize: 12, color: '#64748b' }}>
                      Selecciona genero(s) y talla(s), define un precio y pulsa Aplicar.
                    </Typography>
                  ) : (
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 700, color: '#475569' }}>Genero</TableCell>
                          <TableCell sx={{ fontWeight: 700, color: '#475569' }}>Talla</TableCell>
                          <TableCell sx={{ fontWeight: 700, color: '#475569' }}>Precio</TableCell>
                          <TableCell sx={{ fontWeight: 700, color: '#475569' }}>Comb.</TableCell>
                          <TableCell sx={{ fontWeight: 700, color: '#475569' }} align="right">Accion</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {resumenFilasVariantes.map((row, index) => {
                          const generoResumen = row.generos.length
                            ? `${getGeneroLabel(row.generos[0])}${row.generos.length > 1 ? ' +' : ''}`
                            : '-';
                          const tallaResumen = row.tallas.length
                            ? `${row.tallas[0]}${row.tallas.length > 1 ? ' +' : ''}`
                            : '-';

                          return (
                            <TableRow key={`${row.precio}-${index}`}>
                              <TableCell>{generoResumen}</TableCell>
                              <TableCell>{tallaResumen}</TableCell>
                              <TableCell sx={{ fontWeight: 700 }}>{`$ ${Number(row.precio).toFixed(2)}`}</TableCell>
                              <TableCell>{row.combinaciones}</TableCell>
                              <TableCell align="right">
                                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                  <Button
                                    type="button"
                                    size="small"
                                    variant="text"
                                    onClick={() => editarSeleccionesAplicadas(row)}
                                    disabled={!token}
                                    sx={{ textTransform: 'none', minWidth: 0, px: 0.5 }}
                                  >
                                    Editar
                                  </Button>
                                  <Button
                                    type="button"
                                    size="small"
                                    color="error"
                                    variant="text"
                                    onClick={() => quitarSeleccionesAplicadas(row)}
                                    disabled={!token}
                                    sx={{ textTransform: 'none', minWidth: 0, px: 0.5 }}
                                  >
                                    Quitar
                                  </Button>
                                </Box>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </Box>
              </Box>
            )}
          </Box>

          {!form.variantes_precio_activo && (
            <TextField
              margin="dense"
              name="precio"
              label="Precio"
              type="number"
              placeholder="0.00"
              fullWidth
              value={form.precio}
              onChange={handleChange}
              disabled={!token}
              sx={modalInputSx}
              InputProps={{
                startAdornment: <InputAdornment position="start">$</InputAdornment>
              }}
            />
          )}

          <FormControl fullWidth margin="dense" sx={modalInputSx}>
            <InputLabel id="moneda-prenda-label">Moneda</InputLabel>
            <Select
              labelId="moneda-prenda-label"
              name="moneda"
              value={form.moneda || 'USD'}
              label="Moneda"
              onChange={handleChange}
              disabled={!token}
            >
              <MenuItem value="USD">USD</MenuItem>
              <MenuItem value="EUR">EUR</MenuItem>
            </Select>
          </FormControl>
          <FormControlLabel
            sx={{ mt: 0.5, mb: 0, color: '#475569' }}
            control={(
              <Checkbox
                name="lleva_nombre_atleta"
                checked={Boolean(form.lleva_nombre_atleta)}
                onChange={handleChange}
                disabled={!token}
                size="small"
                sx={{ color: '#cbd5e1', '&.Mui-checked': { color: '#f97316' } }}
              />
            )}
            label="Prenda con nombre"
          />
          <FormControlLabel
            sx={{ mt: 0.5, mb: 0, color: '#475569' }}
            control={(
              <Checkbox
                name="lleva_personalizacion_nombre"
                checked={Boolean(form.lleva_personalizacion_nombre)}
                onChange={handleChange}
                disabled={!token}
                size="small"
                sx={{ color: '#cbd5e1', '&.Mui-checked': { color: '#f97316' } }}
              />
            )}
            label="Personalizar nombre"
          />
          <FormControlLabel
            sx={{ my: 0, color: '#475569' }}
            control={(
              <Checkbox
                name="lleva_numero_franela"
                checked={Boolean(form.lleva_numero_franela)}
                onChange={handleChange}
                disabled={!token}
                size="small"
                sx={{ color: '#cbd5e1', '&.Mui-checked': { color: '#f97316' } }}
              />
            )}
            label="Número de franela"
          />
          <FormControlLabel
            sx={{ my: 0, color: '#475569' }}
            control={(
              <Checkbox
                name="franela_representante"
                checked={Boolean(form.franela_representante)}
                onChange={handleChange}
                disabled={!token}
                size="small"
                sx={{ color: '#cbd5e1', '&.Mui-checked': { color: '#f97316' } }}
              />
            )}
            label="Franela de representante"
          />

            </Box>

            <Box sx={{ mt: { xs: 0, md: 0.5 } }}>
          <Box sx={{ mt: 1.5 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#334155', mb: 0.75 }}>
              Fotos de la prenda ({totalFotosSeleccionadas}/2)
            </Typography>
            <Box
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              sx={{
                border: '1px dashed',
                borderColor: dragActive ? '#f97316' : '#cbd5f0',
                borderRadius: 2,
                p: 2,
                textAlign: 'center',
                backgroundColor: dragActive ? '#fff7ed' : '#f8fafc',
                display: 'block',
                cursor: !token || totalFotosSeleccionadas >= 2 ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s ease',
                opacity: !token || totalFotosSeleccionadas >= 2 ? 0.7 : 1
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
                Arrastra y suelta la foto aqui o haz clic para adjuntar
              </Typography>
              <Typography variant="caption" sx={{ color: '#94a3b8' }}>
                JPG, PNG, WEBP (MAX. 2 fotos)
              </Typography>
              <input
                ref={fileInputRef}
                hidden
                type="file"
                accept="image/*"
                multiple
                onChange={handleFotosChange}
                disabled={!token || totalFotosSeleccionadas >= 2}
              />
            </Box>
            <Typography sx={{ mt: 0.75, fontSize: 12, color: '#64748b' }}>
              Puedes guardar una o dos fotos. Se optimizan automáticamente para ahorrar espacio en servidor.
            </Typography>

            {((form.fotos?.length || 0) > 0 || fotosNuevas.length > 0) && (
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 1.25 }}>
                {(form.fotos || []).map((foto, index) => (
                  <Box key={`existente-${index}`} sx={{ position: 'relative' }}>
                    <Box
                      component="img"
                      src={mediaUrl(foto)}
                      alt={`Foto existente ${index + 1}`}
                      onClick={() => abrirVistaImagen(mediaUrl(foto), `Foto prenda`)}
                      sx={{ width: 86, height: 86, borderRadius: 2, objectFit: 'cover', border: '1px solid #e2e8f0', cursor: 'zoom-in' }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => removerFotoExistente(index)}
                      aria-label="quitar foto existente"
                      sx={{ position: 'absolute', top: -8, right: -8, bgcolor: '#fff', border: '1px solid #e2e8f0' }}
                    >
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                ))}
                {fotosNuevas.map((foto, index) => (
                  <Box key={`nueva-${index}`} sx={{ position: 'relative' }}>
                    <Box
                      component="img"
                      src={URL.createObjectURL(foto)}
                      alt={`Foto nueva ${index + 1}`}
                      onClick={() => abrirVistaImagen(URL.createObjectURL(foto), `Foto nueva ${index + 1}`, true)}
                      sx={{ width: 86, height: 86, borderRadius: 2, objectFit: 'cover', border: '1px solid #e2e8f0', cursor: 'zoom-in' }}
                    />
                    <IconButton
                      size="small"
                      onClick={() => removerFotoNueva(index)}
                      aria-label="quitar foto nueva"
                      sx={{ position: 'absolute', top: -8, right: -8, bgcolor: '#fff', border: '1px solid #e2e8f0' }}
                    >
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                ))}
              </Box>
            )}

            {fotosNuevas.length > 0 && (
              <Box sx={{ mt: 1.25, display: 'grid', gap: 0.75 }}>
                {fotosNuevas.map((foto, index) => (
                  <Box
                    key={`archivo-nuevo-${index}`}
                    sx={{
                      px: 1.25,
                      py: 0.8,
                      border: '1px solid #e2e8f0',
                      borderRadius: 1.5,
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
                        sx={{
                          color: '#475569',
                          fontSize: 12,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}
                      >
                        {foto.name}
                      </Typography>
                    </Box>
                    <IconButton size="small" onClick={() => removerFotoNueva(index)}>
                      <CloseIcon sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 2.5, pb: 2.2, pt: 1, gap: 1.25, justifyContent: 'space-between' }}>
          <Button
            onClick={handleClose}
            variant="outlined"
            sx={{
              flex: 1,
              borderRadius: 2,
              borderColor: '#e2e8f0',
              color: '#475569',
              fontWeight: 700,
              '&:hover': { borderColor: '#cbd5e1', bgcolor: '#f8fafc' }
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            sx={{
              flex: 1,
              borderRadius: 2,
              fontWeight: 800,
              bgcolor: '#f97316',
              '&:hover': { bgcolor: '#ea580c' }
            }}
            disabled={!token}
          >
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={previewImage.open}
        onClose={cerrarVistaImagen}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2.5, overflow: 'hidden', m: 0 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0f172a', pr: 6 }}>
          {previewImage.title || 'Imagen de prenda'}
          <IconButton
            aria-label="cerrar vista de imagen"
            onClick={cerrarVistaImagen}
            size="small"
            sx={{ position: 'absolute', right: 14, top: 14, color: '#64748b' }}
          >
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </DialogTitle>
        <DialogContent
          sx={{
            p: 0,
            bgcolor: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: { xs: 260, sm: 340, md: 420 },
            height: { xs: '50vw', sm: '55vh', md: '65vh' },
            maxHeight: { xs: '60vw', sm: '65vh', md: '75vh' },
            overflow: 'hidden'
          }}
        >
          {previewImage.src ? (
            <Box
              component="img"
              src={previewImage.src}
              alt={previewImage.title || 'Imagen de prenda'}
              sx={{
                width: 'auto',
                height: '100%',
                maxWidth: '98%',
                maxHeight: '98%',
                objectFit: 'contain',
                borderRadius: 1.5,
                border: '1px solid #dbe3ef',
                bgcolor: '#fff',
                boxShadow: '0 2px 12px rgba(0,0,0,0.07)'
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Snackbar
        open={alert.open}
        autoHideDuration={3500}
        onClose={() => setAlert((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setAlert((prev) => ({ ...prev, open: false }))}
          severity={alert.severity}
          variant="filled"
          sx={{ width: '100%', minWidth: 320, borderRadius: 2 }}
        >
          <AlertTitle sx={{ mb: 0.25, fontWeight: 800 }}>
            {alert.severity === 'success' ? 'Operacion completada' : 'Operacion fallida'}
          </AlertTitle>
          {alert.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
