import React, { useEffect, useState } from 'react';
import { Box, Typography, TextField, MenuItem, Button, InputLabel, Select, FormControl, Grid, Paper, Snackbar, Alert } from '@mui/material';
import { useDolar } from '../context/DolarContext';

const TALLAS = ['S', 'M', 'L', 'XL'];

function SolicitudUniforme({ alumno, sede, onGuardar }) {
  const { dolar } = useDolar();
  const [prendas, setPrendas] = useState([]);
  const [prendasLoading, setPrendasLoading] = useState(false);
  const [prendasError, setPrendasError] = useState('');
  const [prenda, setPrenda] = useState('');
  const [talla, setTalla] = useState('');
  const [pago, setPago] = useState('');
  const [comprobante, setComprobante] = useState(null);
  const [metodoPago, setMetodoPago] = useState('');
  const [estado] = useState('pendiente');
  const [referencia, setReferencia] = useState('');
  const [errorReferencia, setErrorReferencia] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const tasaBCV = dolar?.promedio || 0;

  useEffect(() => {
    const fetchPrendas = async () => {
      setPrendasLoading(true);
      setPrendasError('');
      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/public`);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Error al obtener uniformes');
        setPrendas(Array.isArray(data) ? data : []);
      } catch (err) {
        setPrendas([]);
        setPrendasError(err.message || 'Error al obtener uniformes');
      } finally {
        setPrendasLoading(false);
      }
    };
    fetchPrendas();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!prenda || !talla) return alert('Completa todos los campos');
    try {
      setGuardando(true);
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('alumnoId', alumno?._id || alumno?.id || '');
      const sedeId = sede?._id || sede?.id || alumno?.sede?._id || alumno?.sede || '';
      formData.append('sedeId', sedeId);
      formData.append('prenda', prenda);
      formData.append('talla', talla);
      formData.append('estado', estado);

      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al guardar el pedido');

      setPrenda('');
      setTalla('');
      setSuccessMessage('Pedido realizado con éxito');
      onGuardar && onGuardar(data);
    } catch (err) {
      alert(err.message || 'Error al guardar el pedido');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Grid container justifyContent="center" alignItems="center" style={{ minHeight: '80vh' }}>
      <Snackbar
        open={!!successMessage}
        autoHideDuration={3000}
        onClose={() => setSuccessMessage('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert onClose={() => setSuccessMessage('')} severity="success" sx={{ width: '100%' }}>
          {successMessage}
        </Alert>
      </Snackbar>
      <Grid item size={{xs:12, sm:10, md:8}}>
        <Paper elevation={4} sx={{ p: 4, borderRadius: 3 }}>
          <Typography variant="h5" gutterBottom align="center" fontWeight={700} color="primary.main">
            Solicitar Uniforme
          </Typography>
          {alumno && (
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              <b>Alumno:</b> {alumno.nombres} {alumno.apellidos}
            </Typography>
          )}
          <Box component="form" onSubmit={handleSubmit} noValidate>
            <div className="form-row">
<FormControl fullWidth sx={{ mb: 2 }} required>
              <InputLabel id="prenda-label">Prenda</InputLabel>
              <Select
                labelId="prenda-label"
                value={prenda}
                label="Prenda"
                onChange={e => setPrenda(e.target.value)}
                disabled={prendasLoading || !!prendasError}
              >
                <MenuItem value=""><em>Seleccione</em></MenuItem>
                {prendas.map(p => (
                  <MenuItem key={p._id} value={p.prenda}>{p.prenda} - ${p.precio}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {prendasError && (
              <Typography variant="body2" color="error" sx={{ mb: 2 }}>
                {prendasError}
              </Typography>
            )}

            <FormControl fullWidth sx={{ mb: 2 }} required>
              <InputLabel id="talla-label">Talla</InputLabel>
              <Select
                labelId="talla-label"
                value={talla}
                label="Talla"
                onChange={e => setTalla(e.target.value)}
              >
                <MenuItem value=""><em>Seleccione</em></MenuItem>
                {TALLAS.map(t => (
                  <MenuItem key={t} value={t}>{t}</MenuItem>
                ))}
              </Select>
            </FormControl>
            </div>
            
            <Button type="submit" variant="contained" color="primary" fullWidth size="large">
              {guardando ? 'Guardando...' : 'Guardar pedido'}
            </Button>
          </Box>
        </Paper>
      </Grid>
    </Grid>
  );
}

export default SolicitudUniforme;
