import React, { useEffect, useState } from 'react';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Typography, Chip, Button, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material';

function ListadoSolicitudesUniformes() {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [entregandoId, setEntregandoId] = useState(null);
  const [confirmEntregarId, setConfirmEntregarId] = useState(null);

  const fetchPedidos = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al obtener pedidos');
      setPedidos(Array.isArray(data) ? data : []);
    } catch (err) {
      setPedidos([]);
      setError(err.message || 'Error al obtener pedidos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchPedidos();
    };
    load();
  }, []);

  const handleEntregar = async (id) => {
    setEntregandoId(id);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos/${id}/entregado`, {
        method: 'PATCH',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al marcar como entregado');
      setPedidos(prev => prev.map(p => p._id === id ? { ...p, estado: 'entregado' } : p));
    } catch (err) {
      setError(err.message || 'Error al marcar como entregado');
    } finally {
      setEntregandoId(null);
    }
  };

  const handleConfirmEntregar = (id) => {
    setConfirmEntregarId(id);
  };

  const handleCloseConfirm = () => {
    setConfirmEntregarId(null);
  };

  return (
    <div>
      <Typography variant="h5" sx={{ mb: 2 }}>Pedidos de Uniformes</Typography>
      {loading ? (
        <Typography>Cargando...</Typography>
      ) : error ? (
        <Typography color="error">{error}</Typography>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Alumno</TableCell>
                <TableCell>Sede</TableCell>
                <TableCell>Prenda</TableCell>
                <TableCell>Talla</TableCell>
                <TableCell>Precio</TableCell>
                <TableCell>Método</TableCell>
                <TableCell>Referencia</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Comprobante</TableCell>
                <TableCell>Acción</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pedidos.map((p) => (
                <TableRow key={p._id}>
                  <TableCell>
                    {p.alumno ? `${p.alumno.nombres} ${p.alumno.apellidos}` : '-'}
                  </TableCell>
                  <TableCell>
                    {p.sede?.nombre || '-'}
                  </TableCell>
                  <TableCell>{p.prenda}</TableCell>
                  <TableCell>{p.talla}</TableCell>
                  <TableCell>${p.precio}</TableCell>
                  <TableCell>{p.metodo_pago}</TableCell>
                  <TableCell>{p.referencia || '-'}</TableCell>
                  <TableCell>
                    <Chip label={p.estado || 'pendiente'} color={p.estado === 'entregado' ? 'success' : 'warning'} size="small" />
                  </TableCell>
                  <TableCell>
                    {p.comprobante_url ? (
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => window.open(`${process.env.REACT_APP_API_URL}${p.comprobante_url}`, '_blank')}
                      >
                        Ver
                      </Button>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    {p.estado !== 'entregado' ? (
                      <Button
                        size="small"
                        variant="outlined"
                        disabled={entregandoId === p._id}
                        onClick={() => handleConfirmEntregar(p._id)}
                        sx={{
                          borderColor: '#2e7d32',
                          color: '#2e7d32',
                          backgroundColor: 'rgba(46, 125, 50, 0.12)',
                          '&:hover': {
                            borderColor: '#2e7d32',
                            backgroundColor: 'rgba(46, 125, 50, 0.2)'
                          }
                        }}
                      >
                        {entregandoId === p._id ? 'Procesando...' : 'Entregar'}
                      </Button>
                    ) : (
                      <Typography variant="body2" color="text.secondary">Entregado</Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Dialog open={!!confirmEntregarId} onClose={handleCloseConfirm}>
        <DialogTitle>Confirmar entrega</DialogTitle>
        <DialogContent>¿Deseas marcar este pedido como entregado?</DialogContent>
        <DialogActions>
          <Button onClick={handleCloseConfirm} disabled={entregandoId === confirmEntregarId}>Cancelar</Button>
          <Button
            onClick={() => {
              const id = confirmEntregarId;
              handleCloseConfirm();
              if (id) handleEntregar(id);
            }}
            variant="contained"
            disabled={entregandoId === confirmEntregarId}
          >
            Confirmar
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

export default ListadoSolicitudesUniformes;
