import React, { useState, useEffect } from 'react';
import { Box, Typography, TextField, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, MenuItem } from '@mui/material';
import Snackbar from '@mui/material/Snackbar';
import MuiAlert from '@mui/material/Alert';
import { useParams } from 'react-router-dom';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import './GestionReposos.css';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import HistoryIcon from '@mui/icons-material/History';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';

const GestionReposos = () => {
  const [reposos, setReposos] = useState([]);
  const [nuevoReposo, setNuevoReposo] = useState({
    fechaInicio: '',
    fechaFin: '',
    tipo: '',
    motivo: '',
    certificado: null,
  });
  const [fotoCertificado, setFotoCertificado] = useState(null);
  const [previewCertificado, setPreviewCertificado] = useState(null);
  const inputCertificadoRef = React.useRef();
  const { id } = useParams();
  const [studentName, setStudentName] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [editandoReposo, setEditandoReposo] = useState(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [reposoAEliminar, setReposoAEliminar] = useState(null);
  const [confirmarEliminarOpen, setConfirmarEliminarOpen] = useState(false);
  const [eliminandoReposo, setEliminandoReposo] = useState(false);
  const [notificacion, setNotificacion] = useState({ open: false, severity: 'success', message: '' });

  const formatFecha = (fecha) => {
    if (!fecha) return '';

    const raw = String(fecha).trim();
    const matchIso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (matchIso) {
      return `${matchIso[3]}/${matchIso[2]}/${matchIso[1]}`;
    }

    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('es-VE', { timeZone: 'UTC' });
  };

  const toInputDate = (fecha) => {
    if (!fecha) return '';
    const raw = String(fecha).trim();
    const matchIso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (matchIso) return `${matchIso[1]}-${matchIso[2]}-${matchIso[3]}`;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const cargarReposos = async () => {
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/${id}/reposos`);
      if (!response.ok) throw new Error('Error al obtener reposos');
      const data = await response.json();
      setReposos(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      setReposos([]);
    }
  };

  useEffect(() => {
    // Fetch student data based on the ID from the URL
    const fetchStudentName = async () => {
      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/${id}`);
        if (!response.ok) throw new Error('Error al obtener datos del estudiante');
        const data = await response.json();
        setStudentName(`${data.nombres} ${data.apellidos}`);
      } catch (error) {
        console.error(error);
      }
    };

    fetchStudentName();
    cargarReposos();
  }, [id]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNuevoReposo({ ...nuevoReposo, [name]: value });
  };

  const handleGuardarReposo = async () => {
    if (!nuevoReposo.fechaInicio || !nuevoReposo.tipo) {
      setNotificacion({ open: true, severity: 'warning', message: 'Debes indicar Fecha Inicio y Tipo de reposo.' });
      return;
    }

    try {
      setGuardando(true);
      const formData = new FormData();
      formData.append('fecha_inicio', nuevoReposo.fechaInicio);
      if (nuevoReposo.fechaFin) formData.append('fecha_fin', nuevoReposo.fechaFin);
      formData.append('tipo', nuevoReposo.tipo);
      if (nuevoReposo.motivo) formData.append('motivo', nuevoReposo.motivo);
      if (fotoCertificado) formData.append('certificado', fotoCertificado);

      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/${id}/reposos`, {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Error al guardar reposo');

      setNuevoReposo({
        fechaInicio: '',
        fechaFin: '',
        tipo: '',
        motivo: '',
        certificado: null,
      });
      setTipoReposo('');
      setFotoCertificado(null);
      setPreviewCertificado(null);

      await cargarReposos();

      setNotificacion({ open: true, severity: 'success', message: 'Reposo guardado correctamente.' });
    } catch (error) {
      setNotificacion({ open: true, severity: 'error', message: error.message || 'No se pudo guardar el reposo' });
    } finally {
      setGuardando(false);
    }
  };

   const handleClickCertificado = () => {
    inputCertificadoRef.current.click();
  };
  
  const handleFotoCertificadoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFotoCertificado(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewCertificado(reader.result);
      };
      reader.readAsDataURL(file);
      setNuevoReposo(prev => ({ ...prev, certificado: file }));
    } else {
      setFotoCertificado(null);
      setPreviewCertificado(null);
      setNuevoReposo(prev => ({ ...prev, certificado: null }));
    }
  };

  const [tipoReposo, setTipoReposo] = useState('');

  const handleTipoReposoChange = (event, newTipo) => {
    if (newTipo !== null) {
      setTipoReposo(newTipo);
      setNuevoReposo({ ...nuevoReposo, tipo: newTipo });
    }
  };

  const abrirEdicionReposo = (reposo) => {
    setEditandoReposo({
      _id: reposo._id,
      fechaInicio: toInputDate(reposo.fecha_inicio),
      fechaFin: toInputDate(reposo.fecha_fin),
      tipo: reposo.tipo || '',
      motivo: reposo.motivo || '',
      estado: reposo.estado || 'Activo'
    });
    setEditDialogOpen(true);
  };

  const guardarEdicionReposo = async () => {
    if (!editandoReposo?._id) return;
    if (!editandoReposo.fechaInicio || !editandoReposo.tipo) {
      setNotificacion({ open: true, severity: 'warning', message: 'Fecha inicio y tipo son obligatorios.' });
      return;
    }

    try {
      setGuardandoEdicion(true);
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/${id}/reposos/${editandoReposo._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha_inicio: editandoReposo.fechaInicio,
          fecha_fin: editandoReposo.fechaFin || '',
          tipo: editandoReposo.tipo,
          motivo: editandoReposo.motivo,
          estado: editandoReposo.estado
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudo actualizar el reposo');

      setEditDialogOpen(false);
      setEditandoReposo(null);
      await cargarReposos();
      setNotificacion({ open: true, severity: 'success', message: 'Reposo actualizado correctamente.' });
    } catch (error) {
      setNotificacion({ open: true, severity: 'error', message: error.message || 'No se pudo actualizar el reposo' });
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const solicitarEliminarReposo = (reposo) => {
    if (!reposo?._id) return;
    setReposoAEliminar(reposo);
    setConfirmarEliminarOpen(true);
  };

  const eliminarReposo = async () => {
    if (!reposoAEliminar?._id) return;

    try {
      setEliminandoReposo(true);
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/${id}/reposos/${reposoAEliminar._id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudo eliminar el reposo');

      setConfirmarEliminarOpen(false);
      setReposoAEliminar(null);
      await cargarReposos();
      setNotificacion({ open: true, severity: 'success', message: 'Reposo eliminado correctamente.' });
    } catch (error) {
      setNotificacion({ open: true, severity: 'error', message: error.message || 'No se pudo eliminar el reposo' });
    } finally {
      setEliminandoReposo(false);
    }
  };

  return (
    <Box sx={{ p: 3, borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>Gestión de Reposos Médicos</Typography>
      <span>Estudiante: <strong>{studentName}</strong></span>
      <Box sx={{ display: 'flex', gap: 4, mb: 4, mt: 2 }}>
        <Box sx={{ flex: 1, backgroundColor: '#ffffff', p: 3, borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <AddCircleOutlineIcon sx={{ color: '#0284c7', mr: 1 }} />
            <Typography variant="h6">Registrar Nuevo Reposo</Typography>
          </Box>
          <TextField
            label="Fecha Inicio"
            type="date"
            name="fechaInicio"
            value={nuevoReposo.fechaInicio}
            onChange={handleInputChange}
            fullWidth
            InputLabelProps={{ shrink: true }}
            sx={{ mb: 2 }}
          />
          <TextField
            label="Fecha Fin"
            type="date"
            name="fechaFin"
            value={nuevoReposo.fechaFin}
            onChange={handleInputChange}
            fullWidth
            InputLabelProps={{ shrink: true }}
            sx={{ mb: 2 }}
          />
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', mb: 0.5 }}>TIPO DE REPOSO</Typography>
          <ToggleButtonGroup
            value={tipoReposo}
            exclusive
            onChange={handleTipoReposoChange}
            sx={{ mb: 2, width: '100%' }}
          >
            <ToggleButton value="Parcial" sx={{ textTransform: 'none', fontWeight: 700, borderColor: '#e2e8f0', '&.Mui-selected': { bgcolor: '#e0f2fe', color: '#0284c7' }, flex: 1 }}>
              Parcial
            </ToggleButton>
            <ToggleButton value="Total" sx={{ textTransform: 'none', fontWeight: 700, borderColor: '#e2e8f0', '&.Mui-selected': { bgcolor: '#e0f2fe', color: '#0284c7' }, flex: 1 }}>
              Total
            </ToggleButton>
            <ToggleButton value="Indefinido" sx={{ textTransform: 'none', fontWeight: 700, borderColor: '#e2e8f0', '&.Mui-selected': { bgcolor: '#e0f2fe', color: '#0284c7' }, flex: 1 }}>
              Indefinido
            </ToggleButton>
          </ToggleButtonGroup>
          <TextField
            label="Motivo / Diagnóstico"
            name="motivo"
            value={nuevoReposo.motivo}
            onChange={handleInputChange}
            fullWidth
            multiline
            rows={3}
            sx={{ mb: 2 }}
          />
          <Paper sx={{ p: 2.5, borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', letterSpacing: '0.04em', mb: 1 }}>
                          REPOSO MEDICO
                        </Typography>
                        <Box
                          onClick={handleClickCertificado}
                          sx={{
                            border: '1.5px dashed #cbd5f5',
                            borderRadius: 2.5,
                            bgcolor: '#f8fafc',
                            px: 2,
                            py: 2.5,
                            textAlign: 'center',
                            cursor: 'pointer'
                          }}
                        >
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleFotoCertificadoChange}
                            ref={inputCertificadoRef}
                            style={{ display: 'none' }}
                          />
                          {previewCertificado ? (
                            <img src={previewCertificado} alt="Foto del reposo médico" style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 10 }} />
                          ) : (
                            <Box sx={{ display: 'grid', gap: 0.5 }}>
                              <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Adjunta foto del reposo médico</Typography>
                              <Typography sx={{ fontSize: 11, color: '#94a3b8' }}>JPG o PNG, max 5MB</Typography>
                            </Box>
                          )}
                        </Box>
                      </Paper>
          <Button
            type='button'
            className='save-reposo'
            onClick={handleGuardarReposo}
            disabled={guardando}
           sx={{ width: '100%', mt: 2, py: 1.5, fontWeight: 700 }}
          >
            {guardando ? 'Guardando...' : 'Guardar Reposo'}
          </Button>
        </Box>
        <Box sx={{ flex: 2, backgroundColor: '#ffffff', p: 3, borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <HistoryIcon sx={{ color: '#0284c7', mr: 1 }} />
            <Typography variant="h6">Historial de Reposos</Typography>
          </Box>
          <TableContainer component={Paper} sx={{ mt: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Periodo</TableCell>
                  <TableCell>Diagnóstico</TableCell>
                  <TableCell>Estado</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reposos.map((reposo, index) => (
                  <TableRow key={index}>
                    <TableCell>{reposo.tipo}</TableCell>
                    <TableCell>{formatFecha(reposo.fecha_inicio)} - {reposo.fecha_fin ? formatFecha(reposo.fecha_fin) : 'Indefinido'}</TableCell>
                    <TableCell>{reposo.motivo}</TableCell>
                    <TableCell>{reposo.estado}</TableCell>
                    <TableCell align="right">
                      <IconButton size="small" color="primary" onClick={() => abrirEdicionReposo(reposo)}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => solicitarEliminarReposo(reposo)}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Box sx={{ mt: 3, p: 2, backgroundColor: '#f1f5f9', borderRadius: 2, border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: 1 }}>
        <InfoOutlinedIcon sx={{ color: '#2563eb' }} />
        <Typography sx={{ fontSize: 14, color: '#1e293b', fontWeight: 500 }}>
          <strong>Información importante</strong>: Los reposos médicos deben ser validados por la coordinación deportiva antes de ser efectivos.
        </Typography>
      </Box>
        </Box>
      </Box>
      <Snackbar
        open={notificacion.open}
        autoHideDuration={3000}
        onClose={() => setNotificacion(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <MuiAlert
          onClose={() => setNotificacion(prev => ({ ...prev, open: false }))}
          severity={notificacion.severity}
          sx={{ width: '100%' }}
        >
          {notificacion.message}
        </MuiAlert>
      </Snackbar>

      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Editar reposo</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: 1 }}>
          <TextField
            label="Fecha Inicio"
            type="date"
            value={editandoReposo?.fechaInicio || ''}
            onChange={(e) => setEditandoReposo((prev) => ({ ...prev, fechaInicio: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <TextField
            label="Fecha Fin"
            type="date"
            value={editandoReposo?.fechaFin || ''}
            onChange={(e) => setEditandoReposo((prev) => ({ ...prev, fechaFin: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <TextField
            select
            label="Tipo"
            value={editandoReposo?.tipo || ''}
            onChange={(e) => setEditandoReposo((prev) => ({ ...prev, tipo: e.target.value }))}
            fullWidth
          >
            {['Parcial', 'Total', 'Indefinido'].map((tipo) => (
              <MenuItem key={tipo} value={tipo}>{tipo}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Motivo / Diagnóstico"
            multiline
            rows={3}
            value={editandoReposo?.motivo || ''}
            onChange={(e) => setEditandoReposo((prev) => ({ ...prev, motivo: e.target.value }))}
            fullWidth
          />
          <TextField
            select
            label="Estado"
            value={editandoReposo?.estado || 'Activo'}
            onChange={(e) => setEditandoReposo((prev) => ({ ...prev, estado: e.target.value }))}
            fullWidth
          >
            {['Activo', 'Inactivo'].map((estado) => (
              <MenuItem key={estado} value={estado}>{estado}</MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Cancelar</Button>
          <Button onClick={guardarEdicionReposo} variant="contained" disabled={guardandoEdicion}>
            {guardandoEdicion ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={confirmarEliminarOpen}
        onClose={() => {
          if (eliminandoReposo) return;
          setConfirmarEliminarOpen(false);
          setReposoAEliminar(null);
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
            ¿Seguro que deseas eliminar este reposo? Esta acción no se puede deshacer.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button
            onClick={() => {
              setConfirmarEliminarOpen(false);
              setReposoAEliminar(null);
            }}
            disabled={eliminandoReposo}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={eliminarReposo}
            disabled={eliminandoReposo}
          >
            {eliminandoReposo ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default GestionReposos;