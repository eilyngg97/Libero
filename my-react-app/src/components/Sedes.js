import React, { useState, useRef, useEffect } from 'react';
import Snackbar from '@mui/material/Snackbar';
import MuiAlert from '@mui/material/Alert';
import SedeForm from './SedeForm';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';


function Sedes() {
  const [sedes, setSedes] = useState([]);
  const [open, setOpen] = useState(false);
  const [openVer, setOpenVer] = useState(false);
  const [sedeSeleccionada, setSedeSeleccionada] = useState(null);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [sedeEditar, setSedeEditar] = useState(null);
  const [alert, setAlert] = useState({ open: false, message: '', severity: 'success' });
  const [openConfirm, setOpenConfirm] = useState(false);
  const [sedeAEliminar, setSedeAEliminar] = useState(null);

  // Cargar sedes desde el backend al montar
  const fetchSedes = async () => {
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/sedes`);
      const data = await res.json();
      if (res.ok) {
        const sedesConId = Array.isArray(data)
          ? data.map(sede => ({ ...sede, id: sede._id }))
          : [];
        setSedes(sedesConId);
      } else {
        setSedes([]);
      }
    } catch (err) {
      setSedes([]);
    }
  };
  useEffect(() => {
    fetchSedes();
  }, []);

  const handleOpen = () => {
    setModoEdicion(false);
    setSedeEditar(null);
    setOpen(true);
  };
  const handleClose = () => {
    setOpen(false);
    setModoEdicion(false);
    setSedeEditar(null);
  };

  const agregarSede = (sede) => {
    // Refrescar la lista tras agregar
    // Opcional: podrías hacer un fetchSedes() aquí para recargar desde el backend
    setSedes(prev => [...prev, sede]);
    handleClose();
  };

  const handleEliminarClick = (id) => {
    const sede = sedes.find((s) => s.id === id);
    setSedeAEliminar(sede || null);
    setOpenConfirm(true);
  };

  const eliminarSede = async () => {
    if (!sedeAEliminar) return;
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/sedes/${sedeAEliminar.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Error al eliminar sede');
      setAlert({ open: true, message: '¡Sede eliminada con éxito!', severity: 'success' });
      await fetchSedes();
    } catch (err) {
      setAlert({ open: true, message: err.message, severity: 'error' });
    } finally {
      setOpenConfirm(false);
      setSedeAEliminar(null);
    }
  };

  const editarSede = (id) => {
    const sede = sedes.find((s) => s.id === id);
    setSedeEditar(sede || null);
    setModoEdicion(true);
    setOpen(true);
  };

  const verSede = (id) => {
    const sede = sedes.find((s) => s.id === id);
    setSedeSeleccionada(sede || null);
    setOpenVer(true);
  };

  return (
    <div>
      <h2>Sedes</h2>
      <Button variant="contained" color="primary" onClick={handleOpen} sx={{ mb: 2 }}>
        Agregar Sede
      </Button>
      <Dialog open={open} onClose={handleClose}>
        <DialogTitle sx={{ m: 0, p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Agregar Sede
          <IconButton
            aria-label="close"
            onClick={handleClose}
            sx={{ position: 'absolute', right: 8, top: 8, color: (theme) => theme.palette.grey[500] }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <SedeForm 
            onAgregarSede={agregarSede}
            modoEdicion={modoEdicion}
            sedeEditar={sedeEditar}
            onEditSede={async (sedeEditada) => {
              setAlert({ open: true, message: '¡Sede editada con éxito!', severity: 'success' });
              await fetchSedes();
              handleClose();
            }}
          />
        </DialogContent>
      </Dialog>
      <Snackbar open={alert.open} autoHideDuration={2500} onClose={() => setAlert({ ...alert, open: false })} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <MuiAlert onClose={() => setAlert({ ...alert, open: false })} severity={alert.severity} sx={{ width: '100%' }}>
          {alert.message}
        </MuiAlert>
      </Snackbar>
      <TableContainer component={Paper} sx={{ marginTop: 2 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Nombre</TableCell>
              <TableCell>Dirección</TableCell>
              <TableCell>Monto Mensualidad</TableCell>
              <TableCell>Estado</TableCell>
              <TableCell>Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sedes.map((sede, idx) => (
              <TableRow key={sede.id || `sede-row-${idx}`}>
                <TableCell>{sede.nombre}</TableCell>
                <TableCell>{sede.direccion || '-'}</TableCell>
                <TableCell>{sede.costo || '-'}</TableCell>
                <TableCell style={{ color: sede.estado === 'Activa' ? 'green' : sede.estado === 'Inactiva' ? '#800000' : undefined }}>
                  {sede.estado}
                </TableCell>
                <TableCell>
                  <Button variant="outlined" size="small" onClick={() => verSede(sede.id)} sx={{ mr: 1 }}>Ver</Button>
                  <Button variant="outlined" size="small" onClick={() => editarSede(sede.id)} sx={{ mr: 1 }}>Editar</Button>
                  <Button variant="outlined" color="error" size="small" onClick={() => handleEliminarClick(sede.id)}>Eliminar</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Diálogo para ver sede */}
      <Dialog open={openVer} onClose={() => setOpenVer(false)}>
        <DialogTitle sx={{ m: 0, p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Detalles de la Sede
          <IconButton
            aria-label="close"
            onClick={() => setOpenVer(false)}
            sx={{ position: 'absolute', right: 8, top: 8, color: (theme) => theme.palette.grey[500] }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ minWidth: 300 }}>
          {sedeSeleccionada ? (
            <div>
              <p><strong>Nombre:</strong> {sedeSeleccionada.nombre}</p>
              <p><strong>Dirección:</strong> {sedeSeleccionada.direccion || '-'}</p>
              <p><strong>Monto Mensualidad:</strong> {sedeSeleccionada.costo || '-'}</p>
              <p><strong>Horario para constancia:</strong> {sedeSeleccionada.horario_constancia || '-'}</p>
              <p><strong>Estado:</strong> {sedeSeleccionada.estado}</p>
            </div>
          ) : (
            <p>No hay datos para mostrar.</p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={openConfirm} onClose={() => setOpenConfirm(false)}>
        <DialogTitle>Confirmar eliminación</DialogTitle>
        <DialogContent>
          ¿Estás seguro que deseas eliminar la sede <b>{sedeAEliminar?.nombre}</b>?
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenConfirm(false)} color="primary">Cancelar</Button>
          <Button onClick={eliminarSede} color="error" variant="contained">Eliminar</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

export default Sedes;