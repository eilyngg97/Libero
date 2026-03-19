import React, { useState, useEffect } from 'react';
import { Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Typography, IconButton, TablePagination } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import EntrenadorForm from './EntrenadorForm';
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
    fetch(`${process.env.REACT_APP_API_URL || window.location.origin}/entrenadores`, {
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
        const nombreCompleto = `${e.nombre} ${e.apellido}`.toLowerCase();
        const coincideBusqueda = nombreCompleto.includes(busqueda.toLowerCase());
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
      <Typography variant="h5" sx={{ mb: 2 }}>Lista de Entrenadores</Typography>
      <Button variant="contained" color="primary" sx={{ mb: 2 }} onClick={() => setShowModal(true)}>
        Nuevo Entrenador
      </Button>
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <span className="cerrar-modal-x" onClick={() => setShowModal(false)}>&times;</span>
            <EntrenadorForm onSuccess={() => { setShowModal(false); setReload(r => !r); }} />
          </div>
        </div>
      )}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Foto</TableCell>
              <TableCell>Nombre</TableCell>
              <TableCell>Estado</TableCell>
              <TableCell>Correo</TableCell>
              <TableCell>Teléfono</TableCell>
              <TableCell>Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {entrenadoresPagina.map(e => (
              <TableRow key={e._id || e.id}>
                <TableCell>{e.foto ? <img src={e.foto} alt="Foto" className="entrenador-foto" style={{ width: 40, height: 40, borderRadius: '50%' }} /> : <span className="foto-placeholder">Sin foto</span>}</TableCell>
                <TableCell>{e.nombre} {e.apellido}</TableCell>
                <TableCell><span className={`estado-${e.estado}`}>{e.estado}</span></TableCell>
                <TableCell>{e.correo}</TableCell>
                <TableCell>{e.telefono}</TableCell>
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
