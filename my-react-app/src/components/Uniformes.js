import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  FormControlLabel,
  Checkbox,
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
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';


const API_URL = `${process.env.REACT_APP_API_URL}/api/uniformes`;

const initialForm = {
  prenda: '',
  precio: '',
  lleva_personalizacion_nombre: false,
  lleva_numero_franela: false,
  franela_representante: false
};

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

export default function Uniformes() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [uniformes, setUniformes] = useState([]);
  const [open, setOpen] = useState(false);
  const [confirmarEliminarOpen, setConfirmarEliminarOpen] = useState(false);
  const [uniformeAEliminar, setUniformeAEliminar] = useState(null);
  const [deletingId, setDeletingId] = useState('');
  const [form, setForm] = useState(initialForm);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState({ open: false, message: '', severity: 'success' });
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
      setForm({
        prenda: u.prenda,
        precio: u.precio,
        lleva_personalizacion_nombre: Boolean(u.lleva_personalizacion_nombre),
        lleva_numero_franela: Boolean(u.lleva_numero_franela),
        franela_representante: Boolean(u.franela_representante)
      });
      setEditId(id);
    } else {
      setForm(initialForm);
      setEditId(null);
    }
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setForm(initialForm);
    setEditId(null);
  };

  const handleChange = (e) => {
    const { name, type, checked, value } = e.target;
    setForm({ ...form, [name]: type === 'checkbox' ? checked : value });
  };

  const handleSave = async () => {
    if (!token || !form.prenda || !form.precio) return;
    try {
      if (editId) {
        const res = await fetch(`${API_URL}/${editId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(form)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Error al actualizar uniforme');
        setAlert({ open: true, message: 'Uniforme editado con exito.', severity: 'success' });
      } else {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(form)
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
                <Typography sx={{ fontSize: 13, color: '#475569' }}><b>Personalización nombre:</b> {uniforme.lleva_personalizacion_nombre ? 'Si' : 'No'}</Typography>
                <Typography sx={{ fontSize: 13, color: '#475569' }}><b>Número de franela:</b> {uniforme.lleva_numero_franela ? 'Si' : 'No'}</Typography>
                <Typography sx={{ fontSize: 13, color: '#475569' }}><b>Franela representante:</b> {uniforme.franela_representante ? 'Si' : 'No'}</Typography>
              </Box>
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
            maxWidth: '100%'
          }}
        >
          <Table sx={{ minWidth: 760 }}>
            <TableHead>
              <TableRow>
                <TableCell>Prenda</TableCell>
                <TableCell>Precio</TableCell>
                <TableCell>Personalizacion nombre</TableCell>
                <TableCell>Numero de franela</TableCell>
                <TableCell>Franela de representante</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} align="center">Cargando...</TableCell></TableRow>
              ) : (
                uniformes.map((uniforme) => (
                  <TableRow key={uniforme._id}>
                    <TableCell>{uniforme.prenda}</TableCell>
                    <TableCell>{uniforme.precio}</TableCell>
                    <TableCell>{uniforme.lleva_personalizacion_nombre ? 'Si' : 'No'}</TableCell>
                    <TableCell>{uniforme.lleva_numero_franela ? 'Si' : 'No'}</TableCell>
                    <TableCell>{uniforme.franela_representante ? 'Si' : 'No'}</TableCell>
                    <TableCell align="right">
                      <IconButton onClick={() => handleOpen(uniforme._id)} disabled={!token}><EditIcon /></IconButton>
                      <IconButton
                        onClick={() => solicitarEliminarUniforme(uniforme)}
                        disabled={!token || deletingId === uniforme._id}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
              {!loading && uniformes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center">No hay uniformes registrados.</TableCell>
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
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: 'hidden',
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
