import React, { useState, useRef, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import LocationOnIcon from '@mui/icons-material/LocationOn';
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
import AddIcon from '@mui/icons-material/Add';


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
  const [eliminandoSede, setEliminandoSede] = useState(false);

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
      setEliminandoSede(true);
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/sedes/${sedeAEliminar.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Error al eliminar sede');
      setAlert({ open: true, message: '¡Sede eliminada con éxito!', severity: 'success' });
      await fetchSedes();
    } catch (err) {
      setAlert({ open: true, message: err.message, severity: 'error' });
    } finally {
      setEliminandoSede(false);
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
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <h2 style={{ margin: 0 }}>Gestión de Sedes</h2>
        <Button variant="contained" color="secondary" onClick={handleOpen} sx={{ borderRadius: 999 }} startIcon={<AddIcon />}>
          Agregar Sede
        </Button>
      </Box>
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
      <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {sedes.map((sede, idx) => {
          const porcentaje = sede.meta && sede.costo ? Math.round((sede.costo / sede.meta) * 100) : null;
          return (
            <Paper key={sede.id || `sede-card-${idx}`}
              sx={{
                p: 3,
                borderRadius: 3,
                boxShadow: '0 2px 8px rgba(15,23,42,0.06)',
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                flexWrap: 'wrap',
                minHeight: 120
              }}
            >
              <Box sx={{ minWidth: 180, flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LocationOnIcon sx={{ color: '#f59e0b', fontSize: 28 }} />
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#0f172a' }}>{sede.nombre}</Typography>
                </Box>
                <Typography sx={{ color: '#64748b', fontSize: 14 }}>{sede.direccion || '-'}</Typography>
                <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip label={sede.estado} size="small" sx={{ bgcolor: sede.estado === 'Activa' ? '#dcfce7' : '#fee2e2', color: sede.estado === 'Activa' ? '#16a34a' : '#dc2626', fontWeight: 700 }} />
                  <Typography sx={{ fontSize: 13, color: '#475569', fontWeight: 700 }}>Mensualidad: ${sede.costo || '-'}</Typography>
                </Box>
              </Box>
              <Box sx={{ flex: 1, minWidth: 180 }}>
                <Typography sx={{ fontSize: 13, color: '#64748b', fontWeight: 700, mb: 0.5 }}>Horario constancia</Typography>
                <Typography sx={{ fontSize: 15, color: '#0f172a', fontWeight: 700 }}>{sede.horario_constancia || '-'}</Typography>
              </Box>
              <Box sx={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => editarSede(sede.id)}
                      sx={{
                        borderRadius: 2,
                        color: '#334155',
                        borderColor: '#cbd5e1',
                        bgcolor: '#fff',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        boxShadow: 'none',
                        letterSpacing: 1,
                        px: 2.5,
                        '&:hover': {
                          bgcolor: '#fdfdfd',
                          borderColor: '#cbd5e1',
                          boxShadow: 'none'
                        }
                      }}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => handleEliminarClick(sede.id)}
                      sx={{
                        borderRadius: 2,
                        color: '#ef4444',
                        borderColor: '#fecaca',
                        bgcolor: '#fff',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        boxShadow: 'none',
                        letterSpacing: 1,
                        px: 2.5,
                        '&:hover': {
                          bgcolor: '#fef2f2',
                          borderColor: '#fca5a5',
                          boxShadow: 'none'
                        }
                      }}
                    >
                      Eliminar
                    </Button>
                </Box>
              </Box>
            </Paper>
          );
        })}
      </Box>

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
      <Dialog
        open={openConfirm}
        onClose={() => {
          if (eliminandoSede) return;
          setOpenConfirm(false);
        }}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
      >
        <DialogTitle sx={{ bgcolor: '#fff7ed', color: '#9a3412', fontWeight: 800 }}>
          Confirmar eliminación
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          <Typography sx={{ color: '#334155', fontSize: 14 }}>
            ¿Estás seguro que deseas eliminar la sede <b>{sedeAEliminar?.nombre}</b>? Esta acción no se puede deshacer.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setOpenConfirm(false)} disabled={eliminandoSede}>Cancelar</Button>
          <Button onClick={eliminarSede} color="error" variant="contained" disabled={eliminandoSede}>
            {eliminandoSede ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

export default Sedes;