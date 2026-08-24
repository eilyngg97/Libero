import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SportsSoccerOutlinedIcon from '@mui/icons-material/SportsSoccerOutlined';
import PersonOutlineOutlinedIcon from '@mui/icons-material/PersonOutlineOutlined';
import HomeWorkOutlinedIcon from '@mui/icons-material/HomeWorkOutlined';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import CampaignOutlinedIcon from '@mui/icons-material/CampaignOutlined';
import FavoriteBorderOutlinedIcon from '@mui/icons-material/FavoriteBorderOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import ConstructionOutlinedIcon from '@mui/icons-material/ConstructionOutlined';
import RoomServiceOutlinedIcon from '@mui/icons-material/RoomServiceOutlined';
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import { hasPermission } from '../utils/permissions';

const ICON_OPTIONS = [
  { key: 'sports', icon: SportsSoccerOutlinedIcon },
  { key: 'personal', icon: PersonOutlineOutlinedIcon },
  { key: 'instalaciones', icon: HomeWorkOutlinedIcon },
  { key: 'servicios', icon: BoltOutlinedIcon },
  { key: 'marketing', icon: CampaignOutlinedIcon },
  { key: 'salud', icon: FavoriteBorderOutlinedIcon },
  { key: 'varios', icon: CategoryOutlinedIcon },
  { key: 'mantenimiento', icon: ConstructionOutlinedIcon },
  { key: 'atencion', icon: RoomServiceOutlinedIcon },
  { key: 'pagos', icon: PaidOutlinedIcon }
];

const ACCENT_COLORS = ['#f97316', '#6366f1', '#10b981', '#3b82f6', '#a855f7', '#ec4899', '#ef4444', '#d97706', '#6b7280'];

function resolveIconComponent(iconKey = '') {
  const selected = ICON_OPTIONS.find((item) => item.key === String(iconKey || '').trim().toLowerCase());
  return selected?.icon || CategoryOutlinedIcon;
}

function toCodeFromName(nombre = '') {
  return String(nombre || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((part) => part.slice(0, 3))
    .join('-')
    .slice(0, 12);
}

function CatalogoCategoriasEgresos() {
  const apiBase = process.env.REACT_APP_API_URL || window.location.origin;
  const canManage = hasPermission('egresos.manage');

  const [loading, setLoading] = useState(true);
  const [catalogo, setCatalogo] = useState([]);
  const [categoriaSeleccionadaId, setCategoriaSeleccionadaId] = useState('');
  const [busqueda, setBusqueda] = useState('');

  const [openCategoriaDialog, setOpenCategoriaDialog] = useState(false);
  const [openSubcategoriaDialog, setOpenSubcategoriaDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);

  const [categoriaDialogModo, setCategoriaDialogModo] = useState('crear');
  const [subcategoriaDialogModo, setSubcategoriaDialogModo] = useState('crear');
  const [categoriaForm, setCategoriaForm] = useState({ id: '', nombre: '', codigo: '' });
  const [categoriaVisualForm, setCategoriaVisualForm] = useState({ descripcion: '', icono: 'sports', color: '#f97316' });
  const [subcategoriaForm, setSubcategoriaForm] = useState({ id: '', nombre: '', codigo: '' });

  const [itemAEliminar, setItemAEliminar] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const roundedInputSx = {
    '& .MuiInputLabel-root': { fontSize: 13 },
    '& .MuiOutlinedInput-root': {
      borderRadius: 3,
      fontSize: 13
    },
    '& .MuiInputBase-input': { fontSize: 13 }
  };

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };
  };

  const cargarCatalogo = async () => {
    try {
      setLoading(true);
      setError('');

      const res = await fetch(`${apiBase}/api/egresos/categorias`, {
        headers: getAuthHeaders()
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'No se pudo cargar el catalogo');
      }

      const categorias = Array.isArray(payload?.categorias) ? payload.categorias : [];
      setCatalogo(categorias);

      if (!categoriaSeleccionadaId && categorias.length > 0) {
        setCategoriaSeleccionadaId(String(categorias[0]._id));
      } else if (categoriaSeleccionadaId) {
        const existe = categorias.some((item) => String(item._id) === String(categoriaSeleccionadaId));
        if (!existe) {
          setCategoriaSeleccionadaId(categorias[0] ? String(categorias[0]._id) : '');
        }
      }
    } catch (err) {
      setError(err?.message || 'No se pudo cargar el catalogo');
      setCatalogo([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarCatalogo();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoriasFiltradas = useMemo(() => {
    const term = String(busqueda || '').trim().toLowerCase();
    if (!term) return catalogo;

    return catalogo.filter((categoria) => {
      const nombreCategoria = String(categoria?.nombre || '').toLowerCase();
      if (nombreCategoria.includes(term)) return true;

      const subcategorias = Array.isArray(categoria?.subcategorias) ? categoria.subcategorias : [];
      return subcategorias.some((sub) => String(sub?.nombre || '').toLowerCase().includes(term));
    });
  }, [catalogo, busqueda]);

  const categoriaSeleccionada = useMemo(
    () => categoriasFiltradas.find((item) => String(item._id) === String(categoriaSeleccionadaId)) || categoriasFiltradas[0] || null,
    [categoriasFiltradas, categoriaSeleccionadaId]
  );

  const categoriaContextoSubcategoria = useMemo(
    () => catalogo.find((item) => String(item?._id || '') === String(categoriaSeleccionadaId || '')) || categoriaSeleccionada || null,
    [catalogo, categoriaSeleccionadaId, categoriaSeleccionada]
  );

  useEffect(() => {
    if (categoriaSeleccionada && String(categoriaSeleccionada._id) !== String(categoriaSeleccionadaId)) {
      setCategoriaSeleccionadaId(String(categoriaSeleccionada._id));
    }
  }, [categoriaSeleccionada, categoriaSeleccionadaId]);

  const abrirCrearCategoria = () => {
    setCategoriaDialogModo('crear');
    setCategoriaForm({ id: '', nombre: '', codigo: '' });
    setCategoriaVisualForm({ descripcion: '', icono: 'sports', color: '#f97316' });
    setOpenCategoriaDialog(true);
  };

  const abrirEditarCategoria = (categoria) => {
    setCategoriaDialogModo('editar');
    setCategoriaForm({
      id: String(categoria?._id || ''),
      nombre: String(categoria?.nombre || ''),
      codigo: String(categoria?.codigo || '')
    });
    setCategoriaVisualForm({
      descripcion: String(categoria?.descripcion || ''),
      icono: String(categoria?.icono || 'sports'),
      color: String(categoria?.color_acento || '#f97316')
    });
    setOpenCategoriaDialog(true);
  };

  const abrirCrearSubcategoria = () => {
    if (!categoriaSeleccionada) return;
    setSubcategoriaDialogModo('crear');
    setSubcategoriaForm({ id: '', nombre: '', codigo: '' });
    setOpenSubcategoriaDialog(true);
  };

  const abrirEditarSubcategoria = (subcategoria) => {
    setSubcategoriaDialogModo('editar');
    setSubcategoriaForm({
      id: String(subcategoria?._id || ''),
      nombre: String(subcategoria?.nombre || ''),
      codigo: String(subcategoria?.codigo || '')
    });
    setOpenSubcategoriaDialog(true);
  };

  const guardarCategoria = async () => {
    try {
      setGuardando(true);
      setError('');

      const nombre = String(categoriaForm.nombre || '').trim();
      if (!nombre) {
        throw new Error('El nombre de la categoria es obligatorio');
      }

      const body = {
        nombre,
        codigo: String(categoriaForm.codigo || '').trim() || toCodeFromName(nombre),
        descripcion: String(categoriaVisualForm.descripcion || '').trim(),
        icono: String(categoriaVisualForm.icono || 'sports'),
        color_acento: String(categoriaVisualForm.color || '#f97316')
      };

      const isEditar = categoriaDialogModo === 'editar' && categoriaForm.id;
      const endpoint = isEditar
        ? `${apiBase}/api/egresos/categorias/${categoriaForm.id}`
        : `${apiBase}/api/egresos/categorias`;
      const method = isEditar ? 'PATCH' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'No se pudo guardar la categoria');
      }

      setSuccess(isEditar ? 'Categoria actualizada correctamente' : 'Categoria creada correctamente');
      setOpenCategoriaDialog(false);
      await cargarCatalogo();
    } catch (err) {
      setError(err?.message || 'No se pudo guardar la categoria');
    } finally {
      setGuardando(false);
    }
  };

  const guardarSubcategoria = async () => {
    try {
      setGuardando(true);
      setError('');

      const nombre = String(subcategoriaForm.nombre || '').trim();
      if (!nombre) {
        throw new Error('El nombre de la subcategoria es obligatorio');
      }

      const body = {
        nombre,
        codigo: String(subcategoriaForm.codigo || '').trim()
      };

      const isEditar = subcategoriaDialogModo === 'editar' && subcategoriaForm.id;
      const endpoint = isEditar
        ? `${apiBase}/api/egresos/subcategorias/${subcategoriaForm.id}`
        : `${apiBase}/api/egresos/categorias/${categoriaSeleccionadaId}/subcategorias`;
      const method = isEditar ? 'PATCH' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'No se pudo guardar la subcategoria');
      }

      setSuccess(isEditar ? 'Subcategoria actualizada correctamente' : 'Subcategoria creada correctamente');
      setOpenSubcategoriaDialog(false);
      await cargarCatalogo();
    } catch (err) {
      setError(err?.message || 'No se pudo guardar la subcategoria');
    } finally {
      setGuardando(false);
    }
  };

  const abrirEliminar = (item, tipo) => {
    setItemAEliminar({ ...item, tipo });
    setOpenDeleteDialog(true);
  };

  const eliminarItem = async () => {
    if (!itemAEliminar?.id || !itemAEliminar?.tipo) return;

    try {
      setGuardando(true);
      setError('');

      const endpoint = itemAEliminar.tipo === 'categoria'
        ? `${apiBase}/api/egresos/categorias/${itemAEliminar.id}`
        : `${apiBase}/api/egresos/subcategorias/${itemAEliminar.id}`;

      const res = await fetch(endpoint, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(payload?.error || 'No se pudo eliminar');
      }

      setSuccess(itemAEliminar.tipo === 'categoria'
        ? 'Categoria eliminada correctamente'
        : 'Subcategoria eliminada correctamente');
      setOpenDeleteDialog(false);
      setItemAEliminar(null);
      await cargarCatalogo();
    } catch (err) {
      setError(err?.message || 'No se pudo eliminar');
    } finally {
      setGuardando(false);
    }
  };

  const iconoVistaPrevia = useMemo(() => {
    const selected = ICON_OPTIONS.find((item) => item.key === categoriaVisualForm.icono) || ICON_OPTIONS[0];
    return selected.icon;
  }, [categoriaVisualForm.icono]);

  return (
    <Box sx={{ width: '100%', display: 'grid', gap: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" spacing={1.2}>
        <Box>
          <Typography sx={{ color: '#0f172a', fontSize: { xs: 30, md: 26 }, lineHeight: 1.05, fontWeight: 900 }}>
            Catálogo de Cuentas
          </Typography>
          <Typography sx={{ color: '#94a3b8', fontSize: 13, mt: 0.35 }}>
            Define las categorías y subcategorías para clasificar egresos.
          </Typography>
        </Box>

        {canManage && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={abrirCrearCategoria}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 800, px: 2.2, py: 1, background: '#4f46e5', '&:hover': { background: '#4338ca' } }}
          >
            Nueva categoría
          </Button>
        )}
      </Stack>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '300px 1fr' }, gap: 1.5 }}>
        <Paper sx={{ borderRadius: 2.5, border: '1px solid #e5e7eb', boxShadow: 'none', p: 1.2 }}>
          <TextField
            size="small"
            fullWidth
            placeholder="Buscar categoria..."
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            InputProps={{ startAdornment: <SearchRoundedIcon sx={{ color: '#94a3b8', mr: 0.75, fontSize: 18 }} /> }}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, background: '#fff' }, mb: 1 }}
          />

          <Stack spacing={0.6}>
            {categoriasFiltradas.map((categoria) => {
              const selected = String(categoria?._id || '') === String(categoriaSeleccionada?._id || '');
              const totalSub = Array.isArray(categoria?.subcategorias) ? categoria.subcategorias.length : 0;

              return (
                <Button
                  key={String(categoria?._id || '')}
                  onClick={() => setCategoriaSeleccionadaId(String(categoria?._id || ''))}
                  variant={selected ? 'contained' : 'text'}
                  sx={{
                    justifyContent: 'space-between',
                    textTransform: 'none',
                    borderRadius: 2,
                    px: 1.2,
                    py: 0.9,
                    color: selected ? '#fff' : '#0f172a',
                    background: selected ? '#4f46e5' : '#fff',
                    '&:hover': { background: selected ? '#4338ca' : '#f8fafc' }
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                    <Box
                      sx={{
                        width: 24,
                        height: 24,
                        borderRadius: 1.3,
                        background: categoria?.color_acento || '#4f46e5',
                        display: 'grid',
                        placeItems: 'center',
                        color: '#fff',
                        flexShrink: 0
                      }}
                    >
                      {React.createElement(resolveIconComponent(categoria?.icono), { sx: { fontSize: 14 } })}
                    </Box>
                    <Box sx={{ textAlign: 'left', minWidth: 0 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 800 }}>{categoria?.nombre || '--'}</Typography>
                    <Typography sx={{ fontSize: 11, opacity: selected ? 0.85 : 0.6 }}>{totalSub} subcategorias</Typography>
                    </Box>
                  </Stack>
                </Button>
              );
            })}

            {!loading && categoriasFiltradas.length === 0 && (
              <Typography sx={{ color: '#94a3b8', fontSize: 13, px: 0.5, py: 1 }}>
                No hay categorias para mostrar.
              </Typography>
            )}
          </Stack>
        </Paper>

        <Paper sx={{ borderRadius: 2.5, border: '1px solid #e5e7eb', boxShadow: 'none', p: 2 }}>
          {!categoriaSeleccionada ? (
            <Typography sx={{ color: '#94a3b8', fontSize: 14 }}>
              Selecciona una categoria para ver sus subcategorias.
            </Typography>
          ) : (
            <>
              <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }}>
                <Box>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.35 }}>
                    <Box
                      sx={{
                        width: 30,
                        height: 30,
                        borderRadius: 1.5,
                        background: categoriaSeleccionada?.color_acento || '#4f46e5',
                        display: 'grid',
                        placeItems: 'center',
                        color: '#fff'
                      }}
                    >
                      {React.createElement(resolveIconComponent(categoriaSeleccionada?.icono), { sx: { fontSize: 17 } })}
                    </Box>
                    <Typography sx={{ color: '#0f172a', fontSize: 25, fontWeight: 900, lineHeight: 1.1 }}>
                      {categoriaSeleccionada?.nombre || '--'}
                    </Typography>
                  </Stack>
                  <Typography sx={{ color: '#94a3b8', fontSize: 13 }}>
                    {categoriaSeleccionada?.descripcion || 'Subcategorias de esta categoria'}
                  </Typography>
                </Box>

                {canManage && (
                  <Stack direction="row" spacing={1}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<EditOutlinedIcon />}
                      onClick={() => abrirEditarCategoria(categoriaSeleccionada)}
                      sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
                    >
                      Editar
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      variant="outlined"
                      startIcon={<DeleteOutlineIcon />}
                      onClick={() => abrirEliminar({ id: String(categoriaSeleccionada?._id || ''), nombre: categoriaSeleccionada?.nombre || '' }, 'categoria')}
                      sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700 }}
                    >
                      Eliminar
                    </Button>
                  </Stack>
                )}
              </Stack>

              <Stack spacing={0.8}>
                {(Array.isArray(categoriaSeleccionada?.subcategorias) ? categoriaSeleccionada.subcategorias : []).map((sub) => (
                  <Paper key={String(sub?._id || '')} sx={{ borderRadius: 2, border: '1px solid #e5e7eb', p: 1.1, boxShadow: 'none' }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography sx={{ color: '#0f172a', fontSize: 14, fontWeight: 700 }}>
                        {sub?.nombre || '--'}
                      </Typography>

                      {canManage && (
                        <Stack direction="row" spacing={0.3}>
                          <Button size="small" onClick={() => abrirEditarSubcategoria(sub)} sx={{ minWidth: 0, color: '#64748b', px: 0.5 }}>
                            <EditOutlinedIcon sx={{ fontSize: 15 }} />
                          </Button>
                          <Button
                            size="small"
                            onClick={() => abrirEliminar({ id: String(sub?._id || ''), nombre: sub?.nombre || '' }, 'subcategoria')}
                            sx={{ minWidth: 0, color: '#ef4444', px: 0.5 }}
                          >
                            <DeleteOutlineIcon sx={{ fontSize: 15 }} />
                          </Button>
                        </Stack>
                      )}
                    </Stack>
                  </Paper>
                ))}

                {canManage && (
                  <Button
                    variant="outlined"
                    startIcon={<AddIcon />}
                    onClick={abrirCrearSubcategoria}
                    sx={{
                      textTransform: 'none',
                      fontWeight: 700,
                      borderStyle: 'dashed',
                      borderRadius: 2,
                      justifyContent: 'flex-start',
                      color: '#6b7280',
                      borderColor: '#cbd5e1',
                      '&:hover': {
                        borderColor: '#94a3b8',
                        background: '#f8fafc'
                      }
                    }}
                  >
                    Agregar subcategoria
                  </Button>
                )}
              </Stack>
            </>
          )}
        </Paper>
      </Box>

      <Dialog open={openCategoriaDialog} onClose={() => setOpenCategoriaDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pb: 1 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5}>
            <Box>
              <Typography sx={{ color: '#0f172a', fontWeight: 900, fontSize: 25, lineHeight: 1.05 }}>
                {categoriaDialogModo === 'editar' ? 'Editar categoria' : 'Nueva categoria'}
              </Typography>
              <Typography sx={{ color: '#94a3b8', fontSize: 12, mt: 0.5 }}>
                Los cambios se reflejaran en el formulario de egresos.
              </Typography>
            </Box>
            <IconButton onClick={() => setOpenCategoriaDialog(false)} sx={{ mt: -0.5 }}>
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent sx={{ pt: 1.5 }}>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              size="small"
              label="Nombre de la categoria *"
              value={categoriaForm.nombre}
              onChange={(event) => setCategoriaForm((prev) => ({ ...prev, nombre: event.target.value }))}
              fullWidth
              required
              placeholder="ej. Uniformes, Administracion..."
              sx={{ ...roundedInputSx, mt: 0.5 }}
            />

            <TextField
              size="small"
              label="Descripcion (opcional)"
              value={categoriaVisualForm.descripcion}
              onChange={(event) => setCategoriaVisualForm((prev) => ({ ...prev, descripcion: event.target.value }))}
              fullWidth
              multiline
              minRows={2}
              placeholder="¿Para que tipo de gastos se usara esta categoria?"
              sx={roundedInputSx}
            />

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.5 }}>
              <Box>
                <Typography sx={{ color: '#334155', fontSize: 13, fontWeight: 800, mb: 0.8 }}>
                  Icono
                </Typography>
                <Stack direction="row" spacing={0.7} sx={{ flexWrap: 'wrap', rowGap: 0.7 }}>
                  {ICON_OPTIONS.map((item) => {
                    const Icon = item.icon;
                    const selected = categoriaVisualForm.icono === item.key;
                    return (
                      <Button
                        key={item.key}
                        variant="outlined"
                        onClick={() => setCategoriaVisualForm((prev) => ({ ...prev, icono: item.key }))}
                        sx={{
                          minWidth: 36,
                          width: 36,
                          height: 36,
                          p: 0,
                          borderRadius: 2.4,
                          borderColor: selected ? '#4f46e5' : '#d1d5db',
                          color: selected ? '#4f46e5' : '#64748b',
                          background: selected ? '#eef2ff' : '#fff'
                        }}
                      >
                        <Icon sx={{ fontSize: 17 }} />
                      </Button>
                    );
                  })}
                </Stack>
              </Box>

              <Box>
                <Typography sx={{ color: '#334155', fontSize: 13, fontWeight: 800, mb: 0.8 }}>
                  Color de acento
                </Typography>
                <Stack direction="row" spacing={0.7} sx={{ flexWrap: 'wrap', rowGap: 0.7 }}>
                  {ACCENT_COLORS.map((color) => {
                    const selected = categoriaVisualForm.color === color;
                    return (
                      <Button
                        key={color}
                        variant="outlined"
                        onClick={() => setCategoriaVisualForm((prev) => ({ ...prev, color }))}
                        sx={{
                          minWidth: 34,
                          width: 34,
                          height: 34,
                          p: 0,
                          borderRadius: 2.2,
                          borderColor: selected ? '#0f172a' : '#e5e7eb',
                          background: color
                        }}
                      />
                    );
                  })}
                </Stack>
              </Box>
            </Box>

            <Paper sx={{ p: 1.25, borderRadius: 2, border: '1px solid #e5e7eb', boxShadow: 'none', background: '#f8fafc' }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Box
                  sx={{
                    width: 30,
                    height: 30,
                    borderRadius: 1.5,
                    background: categoriaVisualForm.color,
                    display: 'grid',
                    placeItems: 'center',
                    color: '#fff'
                  }}
                >
                  {React.createElement(iconoVistaPrevia, { sx: { fontSize: 17 } })}
                </Box>
                <Box>
                  <Typography sx={{ color: '#0f172a', fontSize: 14, fontWeight: 800 }}>
                    {categoriaForm.nombre || 'Vista previa'}
                  </Typography>
                  <Typography sx={{ color: '#94a3b8', fontSize: 12 }}>
                    {categoriaVisualForm.descripcion || 'Podras agregar subcategorias despues de crearla.'}
                  </Typography>
                </Box>
              </Stack>
            </Paper>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setOpenCategoriaDialog(false)} sx={{ textTransform: 'none', fontWeight: 700 }}>
            Cancelar
          </Button>
          <Button onClick={guardarCategoria} variant="contained" disabled={guardando} sx={{ textTransform: 'none', fontWeight: 800 }}>
            {guardando ? 'Guardando...' : (categoriaDialogModo === 'editar' ? 'Guardar cambios' : 'Crear categoria')}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openSubcategoriaDialog} onClose={() => setOpenSubcategoriaDialog(false)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ pb: 1 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1.5}>
            <Box>
              <Stack direction="row" spacing={0.9} alignItems="center" sx={{ mb: 0.8 }}>
                <Box
                  sx={{
                    width: 22,
                    height: 22,
                    borderRadius: 1.1,
                    background: categoriaContextoSubcategoria?.color_acento || '#f97316',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#fff'
                  }}
                >
                  {React.createElement(resolveIconComponent(categoriaContextoSubcategoria?.icono), { sx: { fontSize: 13 } })}
                </Box>
                <Typography sx={{ color: '#64748b', fontSize: 13, fontWeight: 800 }}>
                  {categoriaContextoSubcategoria?.nombre || 'Categoria'}
                </Typography>
                <Typography sx={{ color: '#94a3b8', fontSize: 14, fontWeight: 700 }}>
                  {'>'}
                </Typography>
                <Typography sx={{ color: '#0f172a', fontSize: 13, fontWeight: 800 }}>
                  {subcategoriaDialogModo === 'editar' ? 'Editar subcategoria' : 'Nueva subcategoria'}
                </Typography>
              </Stack>

              <Typography sx={{ color: '#0f172a', fontWeight: 900, fontSize: 24, lineHeight: 1.02 }}>
                {subcategoriaDialogModo === 'editar' ? 'Editar Subcategoria' : 'Nueva Subcategoria'}
              </Typography>
              <Typography sx={{ color: '#94a3b8', fontSize: 12, mt: 0.5 }}>
                Dentro de <strong>{categoriaContextoSubcategoria?.nombre || 'la categoria seleccionada'}</strong>
              </Typography>
            </Box>
            <IconButton onClick={() => setOpenSubcategoriaDialog(false)} sx={{ mt: -0.5 }}>
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {subcategoriaDialogModo === 'crear' && (
              <FormControl fullWidth size="small" sx={roundedInputSx}>
                <InputLabel>Categoria</InputLabel>
                <Select
                  label="Categoria"
                  value={categoriaSeleccionadaId}
                  onChange={(event) => setCategoriaSeleccionadaId(String(event.target.value || ''))}
                >
                  {catalogo.map((categoria) => (
                    <MenuItem key={String(categoria?._id || '')} value={String(categoria?._id || '')}>
                      {categoria?.nombre || '--'}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            <TextField
              size="small"
              label="Nombre"
              value={subcategoriaForm.nombre}
              onChange={(event) => setSubcategoriaForm((prev) => ({ ...prev, nombre: event.target.value }))}
              fullWidth
              required
              sx={roundedInputSx}
            />
            <TextField
              size="small"
              label="Codigo (opcional)"
              value={subcategoriaForm.codigo}
              onChange={(event) => setSubcategoriaForm((prev) => ({ ...prev, codigo: event.target.value }))}
              fullWidth
              sx={roundedInputSx}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenSubcategoriaDialog(false)}>Cancelar</Button>
          <Button onClick={guardarSubcategoria} variant="contained" disabled={guardando}>
            {guardando ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={openDeleteDialog} onClose={() => setOpenDeleteDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle>Eliminar</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#7f1d1d', fontSize: 14, fontWeight: 600 }}>
            {`Se eliminara ${itemAEliminar?.tipo === 'categoria' ? 'la categoria' : 'la subcategoria'} ${itemAEliminar?.nombre ? `"${itemAEliminar.nombre}"` : ''}. Esta accion no se puede deshacer.`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDeleteDialog(false)}>Cancelar</Button>
          <Button onClick={eliminarItem} color="error" variant="contained" disabled={guardando}>
            {guardando ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={Boolean(error)}
        autoHideDuration={5000}
        onClose={() => setError('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity="error" onClose={() => setError('')} variant="filled">
          {error}
        </Alert>
      </Snackbar>

      <Snackbar
        open={Boolean(success)}
        autoHideDuration={3000}
        onClose={() => setSuccess('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity="success" onClose={() => setSuccess('')} variant="filled">
          {success}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default CatalogoCategoriasEgresos;
