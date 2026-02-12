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
    const pagoFinal = pago || metodoPago;
    const requiereReferencia = pagoFinal === 'TRANSFERENCIA' || pagoFinal === 'PAGO MOVIL';
    if (requiereReferencia && (!referencia || referencia.length < 6)) {
      setErrorReferencia('La referencia debe tener al menos 6 dígitos');
      return;
    }
    setErrorReferencia('');
    if (!prenda || !talla || !pagoFinal || (requiereReferencia && !comprobante)) return alert('Completa todos los campos');
    try {
      setGuardando(true);
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('alumnoId', alumno?._id || alumno?.id || '');
      const sedeId = sede?._id || sede?.id || alumno?.sede?._id || alumno?.sede || '';
      formData.append('sedeId', sedeId);
      formData.append('prenda', prenda);
      formData.append('talla', talla);
      formData.append('precio', prendas.find(p => p.prenda === prenda)?.precio || 0);
      formData.append('metodo_pago', pagoFinal);
      if (requiereReferencia) {
        formData.append('referencia', referencia);
      }
      formData.append('estado', estado);
      if (requiereReferencia && comprobante) {
        formData.append('comprobante', comprobante);
      }

      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al guardar el pedido');

      setPrenda('');
      setTalla('');
      setPago('');
      setMetodoPago('');
      setReferencia('');
      setComprobante(null);
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
            
            

            {/* Selección de método de pago */}
            {prenda && talla && (
              <Grid container spacing={2} sx={{ mb: 2 }} justifyContent="center">
                {['TRANSFERENCIA', 'PAGO MOVIL', 'EFECTIVO'].map((metodo) => (
                  <Grid item xs={12} sm={4} key={metodo}>
                    <Box
                      onClick={() => setMetodoPago(metodo)}
                      sx={{
                        border: metodoPago === metodo ? '2px solid #2196f3' : '1px solid #bdbdbd',
                        background: metodoPago === metodo ? 'rgba(33,150,243,0.10)' : 'rgba(0,0,0,0.03)',
                        borderRadius: 2,
                        p: 2,
                        textAlign: 'center',
                        cursor: 'pointer',
                        fontWeight: 600,
                        color: metodoPago === metodo ? '#1565c0' : '#424242',
                        boxShadow: metodoPago === metodo ? 2 : 0,
                        transition: 'all 0.2s'
                      }}
                    >
                      {metodo}
                    </Box>
                  </Grid>
                ))}
              </Grid>
            )}

            {/* Cuadro de datos de pago móvil y monto a cancelar */}
            {prenda && talla && metodoPago === 'PAGO MOVIL' && (
              <Box sx={{
                background: 'rgba(33, 150, 243, 0.10)',
                border: '1px solid #2196f3',
                borderRadius: 2,
                p: 2,
                mb: 2,
                textAlign: 'center',
                color: '#1565c0',
                fontWeight: 500
              }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                  Datos de Pago Móvil
                </Typography>
                <Typography variant="body2">
                  Banco: <b>Banesco</b><br/>
                  Teléfono: <b>0414-1234567</b><br/>
                  Cédula/RIF: <b>V-12345678-9</b>
                </Typography>
                <Typography variant="h6" sx={{ mt: 1, fontWeight: 700 }}>
                  Monto a cancelar: ${prendas.find(p => p.prenda === prenda)?.precio}
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.5, color: '#1565c0' }}>
                  Equivalente en Bs: {(Number(prendas.find(p => p.prenda === prenda)?.precio || 0) * tasaBCV).toFixed(2)} Bs
                </Typography>
              </Box>
            )}
            {prenda && talla && (metodoPago === 'TRANSFERENCIA' || metodoPago === 'PAGO MOVIL') && (
              <div>
            <TextField
              label="Número de referencia (mín. 6 dígitos)"
              fullWidth
              margin="normal"
              value={referencia}
              onChange={e => setReferencia(e.target.value.replace(/[^0-9]/g, ''))}
              inputProps={{ minLength: 6 }}
              error={!!errorReferencia}
              helperText={errorReferencia}
            />
            <Button
              variant="contained"
              component="label"
              fullWidth
              sx={{ mb: 2 }}
            >
              Adjuntar comprobante de pago
              <input
                type="file"
                accept="image/*,application/pdf"
                hidden
                onChange={e => setComprobante(e.target.files[0])}
                required
              />
            </Button>
            </div>
            )}
            {comprobante && (
              <Typography variant="body2" sx={{ mb: 2 }} color="text.secondary">
                Archivo seleccionado: {comprobante.name}
              </Typography>
            )}
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
