import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';

const estadoLabels = {
  pendiente: 'Pendiente',
  contactado: 'Contactado',
  inscrito: 'Inscrito',
  descartado: 'Descartado'
};

const estadoOptions = Object.keys(estadoLabels);

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('es-VE');
}

function Aspirantes() {
  const apiBase = process.env.REACT_APP_API_URL || window.location.origin;
  const token = localStorage.getItem('token');

  const [aspirantes, setAspirantes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState('');
  const [alert, setAlert] = useState({ open: false, message: '', severity: 'success' });

  const rows = useMemo(() => aspirantes, [aspirantes]);

  const fetchAspirantes = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await fetch(`${apiBase}/api/aspirantes`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json().catch(() => []);

      if (!res.ok) {
        throw new Error(data.error || 'No se pudo cargar la lista de aspirantes.');
      }

      setAspirantes(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Error al cargar aspirantes.');
      setAspirantes([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAspirantes();
  }, []);

  const updateEstado = async (aspiranteId, estado) => {
    try {
      setSavingId(aspiranteId);
      const res = await fetch(`${apiBase}/api/aspirantes/${aspiranteId}/estado`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ estado })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo actualizar el estado.');
      }

      setAspirantes((prev) =>
        prev.map((item) => (item._id === aspiranteId ? { ...item, estado } : item))
      );
      setAlert({ open: true, message: 'Estado actualizado correctamente.', severity: 'success' });
    } catch (err) {
      setAlert({ open: true, message: err.message || 'No se pudo actualizar el estado.', severity: 'error' });
    } finally {
      setSavingId('');
    }
  };

  const renderEstadoChip = (estado) => {
    const colorMap = {
      pendiente: { bg: '#fef3c7', color: '#92400e' },
      contactado: { bg: '#dbeafe', color: '#1e3a8a' },
      inscrito: { bg: '#dcfce7', color: '#166534' },
      descartado: { bg: '#fee2e2', color: '#991b1b' }
    };
    const palette = colorMap[estado] || { bg: '#e5e7eb', color: '#1f2937' };

    return (
      <Chip
        label={estadoLabels[estado] || estado}
        size="small"
        sx={{ backgroundColor: palette.bg, color: palette.color, fontWeight: 700 }}
      />
    );
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2, fontWeight: 800 }}>
        Gestion de Aspirantes
      </Typography>
      <Typography sx={{ color: '#64748b', mb: 3 }}>
        Revisa los registros enviados desde la landing y actualiza su estado de seguimiento.
      </Typography>

      {loading ? (
        <Box sx={{ py: 8, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 3, boxShadow: '0 8px 26px rgba(15, 23, 42, 0.08)' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Nombre</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Fecha nacimiento</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Experiencia</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Telefono</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Estado actual</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Cambiar estado</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: 'center', py: 6, color: '#64748b' }}>
                    No hay aspirantes registrados por ahora.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((aspirante) => (
                  <TableRow key={aspirante._id} hover>
                    <TableCell>{aspirante.nombreCompleto || '-'}</TableCell>
                    <TableCell>{formatDate(aspirante.fechaNacimiento)}</TableCell>
                    <TableCell>{aspirante.nivelExperiencia || '-'}</TableCell>
                    <TableCell>{aspirante.telefono || '-'}</TableCell>
                    <TableCell>{renderEstadoChip(aspirante.estado)}</TableCell>
                    <TableCell sx={{ minWidth: 220 }}>
                      <FormControl size="small" fullWidth>
                        <InputLabel id={`estado-aspirante-${aspirante._id}`}>Estado</InputLabel>
                        <Select
                          labelId={`estado-aspirante-${aspirante._id}`}
                          value={aspirante.estado || 'pendiente'}
                          label="Estado"
                          disabled={savingId === aspirante._id}
                          onChange={(event) => updateEstado(aspirante._id, event.target.value)}
                        >
                          {estadoOptions.map((estado) => (
                            <MenuItem key={estado} value={estado}>
                              {estadoLabels[estado]}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Snackbar
        open={alert.open}
        autoHideDuration={2500}
        onClose={() => setAlert((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setAlert((prev) => ({ ...prev, open: false }))}
          severity={alert.severity}
          sx={{ width: '100%' }}
        >
          {alert.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default Aspirantes;
