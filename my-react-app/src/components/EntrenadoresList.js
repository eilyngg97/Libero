import React, { useState, useEffect } from 'react';
import { Avatar, Box, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Typography, IconButton, TablePagination, TextField, MenuItem } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import AddIcon from '@mui/icons-material/Add';
import EntrenadorForm from './EntrenadorForm';
import { mediaUrl } from '../utils/mediaUrl';
import './EntrenadoresList.css';

function EntrenadoresList() {
  const [entrenadores, setEntrenadores] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('todos');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [showModal, setShowModal] = useState(false);
  const [reload, setReload] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch(`${process.env.REACT_APP_API_URL || window.location.origin}/api/entrenadores`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setEntrenadores(data);
        } else {
          setEntrenadores([]);
        }
      })
      .catch(() => setEntrenadores([]));
  }, [reload]);

  const entrenadoresFiltrados = Array.isArray(entrenadores)
    ? entrenadores.filter(e => {
        const nombreCompleto = `${e.nombre || ''} ${e.apellido || ''}`.toLowerCase();
        const cedula = String(e.cedula || '').toLowerCase();
        const coincideBusqueda = nombreCompleto.includes(busqueda.toLowerCase()) || cedula.includes(busqueda.toLowerCase());
        const coincideEstado = estadoFiltro === 'todos' || e.estado === estadoFiltro;
        return coincideBusqueda && coincideEstado;
      })
    : [];

  const entrenadoresPagina = entrenadoresFiltrados.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  return (
    <div>
      <Typography variant="h5" sx={{ mb: 2, fontWeight: 800 }}>Entrenadores</Typography>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
          gap: 1.25,
          mb: 2,
          width: '100%',
          maxWidth: 640
        }}
      >
        <TextField
          label="Buscar por nombre o cédula"
          size="small"
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
        />
        <TextField
          select
          label="Estado"
          size="small"
          value={estadoFiltro}
          onChange={(event) => setEstadoFiltro(event.target.value)}
        >
          <MenuItem value="todos">Todos</MenuItem>
          <MenuItem value="activo">Activo</MenuItem>
          <MenuItem value="inactivo">Inactivo</MenuItem>
        </TextField>
      </Box>
      <Button
        variant="contained"
        color="secondary"
        sx={{ mb: 2, borderRadius: 999 }}
        startIcon={<AddIcon />}
        onClick={() => setShowModal(true)}
      >
        Nuevo Entrenador
      </Button>
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <span className="cerrar-modal-x" onClick={() => setShowModal(false)}>&times;</span>
            <EntrenadorForm
              onCancel={() => setShowModal(false)}
              onSuccess={() => {
                setShowModal(false);
                setReload(r => !r);
              }}
            />
          </div>
        </div>
      )}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Nombre</TableCell>
              <TableCell>Cédula</TableCell>
              <TableCell>Estado</TableCell>
              <TableCell>Especialidad</TableCell>
              <TableCell>Teléfono</TableCell>
              <TableCell>Tipo contrato</TableCell>
              <TableCell>Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entrenadoresPagina.map(e => (
              <TableRow key={e._id || e.id}>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Avatar
                      src={(() => {
                        const normalizedFoto = mediaUrl(e.foto);
                        if (normalizedFoto && normalizedFoto.startsWith('/uploads/') && process.env.REACT_APP_API_URL) {
                          return `${process.env.REACT_APP_API_URL}${normalizedFoto}`;
                        }
                        return normalizedFoto || '';
                      })()}
                      alt={`${e.nombre || ''} ${e.apellido || ''}`.trim()}
                      sx={{ width: 30, height: 30, bgcolor: '#e0ecff', color: '#2563eb', fontSize: 12, fontWeight: 700 }}
                    >
                      {`${e.nombre?.[0] || ''}${e.apellido?.[0] || ''}`.toUpperCase()}
                    </Avatar>
                    <Typography sx={{ fontWeight: 600, color: '#1f2937' }}>
                      {e.nombre} {e.apellido}
                    </Typography>
                  </Box>
                </TableCell>
                <TableCell>{e.cedula || '-'}</TableCell>
                <TableCell><span className={`estado-${e.estado}`}>{e.estado}</span></TableCell>
                <TableCell>{e.especialidad || '-'}</TableCell>
                <TableCell>{e.telefono}</TableCell>
                <TableCell>{e.tipo_contrato ? e.tipo_contrato.replaceAll('_', ' ') : '-'}</TableCell>
                <TableCell>
                  <IconButton aria-label="ver" size="small" sx={{ color: '#757575', mr: 1 }}>
                    <VisibilityIcon />
                  </IconButton>
                  <IconButton aria-label="editar" size="small" sx={{ color: '#757575', mr: 1 }}>
                    <EditIcon />
                  </IconButton>
                  <IconButton aria-label="eliminar" size="small" sx={{ color: '#757575' }}>
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={entrenadoresFiltrados.length}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[5, 10, 25]}
          labelRowsPerPage="Filas por página:"
        />
      </TableContainer>
    </div>
  );
}

export default EntrenadoresList;
