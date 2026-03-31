import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
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


const API_URL = `${process.env.REACT_APP_API_URL}/api/uniformes`;

const initialForm = { prenda: '', precio: '' };

export default function Uniformes() {
  const [uniformes, setUniformes] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const token = localStorage.getItem('token');

  // Obtener uniformes del backend
  const fetchUniformes = async () => {
    if (!token) {
      setUniformes([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(API_URL, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setUniformes(data);
    } catch (e) {
      setUniformes([]);
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
      setForm({ prenda: u.prenda, precio: u.precio });
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
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSave = async () => {
    if (!token || !form.prenda || !form.precio) return;
    try {
      if (editId) {
        await fetch(`${API_URL}/${editId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(form)
        });
      } else {
        await fetch(API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(form)
        });
      }
      fetchUniformes();
      handleClose();
    } catch (e) {}
  };

  const handleDelete = async (id) => {
    if (!token) return;
    try {
      await fetch(`${API_URL}/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchUniformes();
    } catch (e) {}
  };

  return (
    <Box sx={{ p: 3 }}>
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
        sx={{ mb: 2, borderRadius: 999 }}
        disabled={!token}
      >
        Agregar Prenda
      </Button>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Prenda</TableCell>
              <TableCell>Precio</TableCell>
              <TableCell align="right">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={3} align="center">Cargando...</TableCell></TableRow>
            ) : (
              uniformes.map((uniforme) => (
                <TableRow key={uniforme._id}>
                  <TableCell>{uniforme.prenda}</TableCell>
                  <TableCell>{uniforme.precio}</TableCell>
                  <TableCell align="right">
                    <IconButton onClick={() => handleOpen(uniforme._id)} disabled={!token}><EditIcon /></IconButton>
                    <IconButton onClick={() => handleDelete(uniforme._id)} disabled={!token}><DeleteIcon /></IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
            {!loading && uniformes.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} align="center">No hay uniformes registrados.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>{editId ? 'Editar Prenda' : 'Agregar Prenda'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            name="prenda"
            label="Prenda"
            fullWidth
            value={form.prenda}
            onChange={handleChange}
            disabled={!token}
          />
          <TextField
            margin="dense"
            name="precio"
            label="Precio"
            type="number"
            fullWidth
            value={form.precio}
            onChange={handleChange}
            disabled={!token}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancelar</Button>
          <Button onClick={handleSave} variant="contained" color="secondary" sx={{ borderRadius: 999 }} disabled={!token}>Guardar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
