import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  Button,
  Chip,
  Paper,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import ReceiptIcon from '@mui/icons-material/Receipt';
import { useParams } from 'react-router-dom';

const TorneoDetalle = () => {
  const { torneoId } = useParams();
  const [torneo, setTorneo] = useState(null);
  const [comprobante, setComprobante] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchTorneo = async () => {
      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/torneos/${torneoId}`);
        if (!response.ok) {
          throw new Error('Error al cargar los datos del torneo');
        }
        const data = await response.json();
        setTorneo(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTorneo();
  }, [torneoId]);

  if (loading) {
    return <Typography>Cargando...</Typography>;
  }

  if (error) {
    return <Typography color="error">{error}</Typography>;
  }

  if (!torneo) {
    return <Typography>No se encontraron datos del torneo</Typography>;
  }

  if (!torneo.partidos || torneo.partidos.length === 0) {
    return <Typography>No hay juegos disponibles para este torneo</Typography>;
  }

  const handleFileChange = (e) => {
    setComprobante(e.target.files[0]);
  };

  const handleUpload = () => {
    if (comprobante) {
      console.log('Comprobante subido:', comprobante);
      // Aquí puedes implementar la lógica para enviar el comprobante al backend
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ fontWeight: 700, mb: 2 }}>
        {torneo.nombre}
      </Typography>
      <Typography variant="body1" sx={{ color: '#64748b', mb: 3 }}>
        {torneo.fechaInicio} - {torneo.fechaFin} • {torneo.ubicacion}
      </Typography>
      <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
        Inscripción: ${torneo.montoInscripcion}
      </Typography>

      <Typography variant="h5" sx={{ fontWeight: 700, mt: 4, mb: 2 }}>
        Próximos Juegos y Pagos
      </Typography>

      {torneo.partidos.map((juego) => (
        <Paper
          key={juego.id}
          sx={{ p: 2, mb: 2, borderRadius: 3, boxShadow: '0 4px 14px rgba(15, 23, 42, 0.1)' }}
        >
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={8}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>
                {juego.nombre}
              </Typography>
              <Typography variant="body2" sx={{ color: '#64748b' }}>
                {juego.fecha} • {juego.hora} • {juego.ubicacion}
              </Typography>
              <Chip
                label={juego.estadoPago ? juego.estadoPago.toUpperCase() : 'SIN ESTADO'}
                sx={{
                  mt: 1,
                  bgcolor: juego.estadoPago === 'pagado' ? '#d1fae5' : '#fef3c7',
                  color: juego.estadoPago === 'pagado' ? '#065f46' : '#92400e',
                  fontWeight: 700,
                }}
              />
            </Grid>
            <Grid item xs={12} sm={4} sx={{ textAlign: 'right' }}>
              {juego.estadoPago === 'pendiente' ? (
                <Button
                  variant="contained"
                  color="warning"
                  onClick={() => console.log('Pagar y reportar', juego.id)}
                >
                  Pagar y Reportar
                </Button>
              ) : (
                <Button
                  variant="outlined"
                  startIcon={<ReceiptIcon />}
                  onClick={() => console.log('Ver recibo', juego.id)}
                >
                  Ver Recibo
                </Button>
              )}
            </Grid>
          </Grid>
        </Paper>
      ))}

      <Typography variant="h6" sx={{ fontWeight: 700, mt: 4, mb: 2 }}>
        Subir Comprobante de Pago
      </Typography>
      <Box
        sx={{
          border: '2px dashed #e2e8f0',
          borderRadius: 3,
          p: 3,
          textAlign: 'center',
          bgcolor: '#f8fafc',
        }}
      >
        <input
          type="file"
          accept=".pdf,.jpg,.jpeg,.png"
          onChange={handleFileChange}
          style={{ display: 'none' }}
          id="upload-comprobante"
        />
        <label htmlFor="upload-comprobante">
          <Button
            variant="outlined"
            component="span"
            startIcon={<UploadFileIcon />}
          >
            {comprobante ? comprobante.name : 'Haz clic para subir un comprobante'}
          </Button>
        </label>
        {comprobante && (
          <Button
            variant="contained"
            color="primary"
            sx={{ mt: 2 }}
            onClick={handleUpload}
          >
            Subir Comprobante
          </Button>
        )}
      </Box>
    </Box>
  );
};

export default TorneoDetalle;