import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Avatar, Box, Button, Chip, Paper, Typography } from '@mui/material';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import GroupsIcon from '@mui/icons-material/Groups';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import PersonRemoveAlt1Icon from '@mui/icons-material/PersonRemoveAlt1';
import { useSede } from '../context/SedeContext';
import { mediaUrl } from '../utils/mediaUrl';

function EntrenadoresSedeStaff() {
  const { sedeSeleccionada } = useSede();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [entrenadores, setEntrenadores] = useState([]);
  const [updatingId, setUpdatingId] = useState('');

  const sedeId = String(sedeSeleccionada?._id || '').trim();

  const totalVinculados = useMemo(() => {
    return entrenadores.filter((item) => item.vinculado).length;
  }, [entrenadores]);

  const fetchStaffSede = async () => {
    if (!sedeId) return;

    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const apiBase = process.env.REACT_APP_API_URL || window.location.origin;
      const res = await fetch(`${apiBase}/api/entrenadores/staff-por-sede/${sedeId}`, {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        }
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudo cargar el staff de la sede');
      setEntrenadores(Array.isArray(data) ? data : []);
    } catch (err) {
      setEntrenadores([]);
      setError(err.message || 'No se pudo cargar el staff de la sede');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaffSede();
  }, [sedeId]);

  const handleToggleVinculo = async (entrenador) => {
    if (!sedeId || !entrenador?._id) return;

    setUpdatingId(String(entrenador._id));
    setError('');

    try {
      const token = localStorage.getItem('token');
      const apiBase = process.env.REACT_APP_API_URL || window.location.origin;
      const endpoint = entrenador.vinculado
        ? `${apiBase}/api/entrenadores/${entrenador._id}/desvincular-sede`
        : `${apiBase}/api/entrenadores/${entrenador._id}/vincular-sede`;

      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ id_sede: sedeId })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudo actualizar el staff');

      await fetchStaffSede();
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el staff');
    } finally {
      setUpdatingId('');
    }
  };

  if (!sedeId) {
    return (
      <Alert severity="info" sx={{ mb: 2 }}>
        Selecciona una sede en el panel de opciones para gestionar su staff de entrenadores.
      </Alert>
    );
  }

  return (
    <Box
      sx={{
        display: 'grid',
        gap: 1.4,
        maxWidth: 1280,
        mx: 'auto'
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 1.4, gap: 1.5, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 900, color: '#0f172a', fontSize: { xs: 30, md: 40 }, lineHeight: 1.08, letterSpacing: '-0.01em' }}>
            Staff de Entrenadores por Sede
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, mt: 0.7 }}>
            <LocationOnIcon sx={{ color: '#2563eb', fontSize: 18 }} />
            <Typography sx={{ color: '#475569', fontSize: { xs: 16, md: 24 }, fontWeight: 600 }}>
              {sedeSeleccionada?.nombre || '-'}
            </Typography>
          </Box>
        </Box>
        <Chip
          icon={<GroupsIcon />}
          label={`VINCULADOS: ${totalVinculados}`}
          sx={{
            bgcolor: '#dbeafe',
            color: '#1e3a8a',
            fontWeight: 900,
            px: 1.4,
            py: 2.3,
            borderRadius: 2,
            fontSize: 13,
            '& .MuiChip-icon': { color: '#0f172a', fontSize: 18 }
          }}
        />
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {loading ? (
        <Typography sx={{ color: '#64748b' }}>Cargando entrenadores...</Typography>
      ) : entrenadores.length === 0 ? (
        <Paper sx={{ p: 2, borderRadius: 3, border: '1px dashed #cbd5e1', color: '#64748b' }}>
          Aun no hay entrenadores registrados.
        </Paper>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gap: 2.2,
            gridTemplateColumns: {
              xs: '1fr',
              sm: 'repeat(2, minmax(0, 1fr))',
              md: 'repeat(2, minmax(0, 1fr))'
            }
          }}
        >
          {entrenadores.map((item) => {
            const normalizedFoto = mediaUrl(item.foto);
            const fotoSrc = normalizedFoto && normalizedFoto.startsWith('/uploads/') && process.env.REACT_APP_API_URL
              ? `${process.env.REACT_APP_API_URL}${normalizedFoto}`
              : normalizedFoto;

            return (
              <Paper
                key={item._id}
                sx={{
                  p: 0,
                  position: 'relative',
                  borderRadius: 2,
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 6px 16px rgba(15, 23, 42, 0.05)',
                  overflow: 'hidden'
                }}
              >
                {item.vinculado && (
                  <Box
                    sx={{
                      position: 'absolute',
                      top: 12,
                      right: -34,
                      width: 150,
                      textAlign: 'center',
                      py: 0.35,
                      bgcolor: '#11173f',
                      color: '#ffffff',
                      fontSize: 10.5,
                      fontWeight: 900,
                      letterSpacing: '0.06em',
                      transform: 'rotate(35deg)',
                      boxShadow: '0 6px 14px rgba(22, 163, 74, 0.35)',
                      zIndex: 2
                    }}
                  >
                    VINCULADO
                  </Box>
                )}
                <Box sx={{ height: 4, bgcolor: '#3b82f6' }} />
                <Box sx={{ p: 2.25 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.4, mb: 1.65 }}>
                    <Avatar
                      src={fotoSrc || ''}
                      alt={`${item.nombre || ''} ${item.apellido || ''}`.trim()}
                      sx={{ width: 54, height: 54, borderRadius: 2, bgcolor: '#e0ecff', color: '#2563eb', fontWeight: 700 }}
                    >
                      {`${item.nombre?.[0] || ''}${item.apellido?.[0] || ''}`.toUpperCase()}
                    </Avatar>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Typography sx={{ fontWeight: 800, color: '#0f172a', fontSize: { xs: 19, md: 31 }, lineHeight: 1.14 }} noWrap>
                          {item.nombre} {item.apellido}
                        </Typography>
                        <Box
                          sx={{
                            px: 1,
                            py: 0.25,
                            borderRadius: 1,
                            bgcolor: '#dcfce7',
                            color: '#15803d',
                            fontWeight: 800,
                            fontSize: 10.5
                          }}
                        >
                          {(item.estado || 'activo').toUpperCase()}
                        </Box>
                      </Box>
                      <Typography sx={{ fontSize: { xs: 14.5, md: 22 }, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        Especialidad: {item.especialidad || '-'}
                      </Typography>
                    </Box>
                  </Box>

                  <Box sx={{ borderTop: '1px solid #f1f5f9', borderBottom: '1px solid #f1f5f9', py: 1.4, mb: 1.6, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.7 }}>
                    <Box>
                      <Typography sx={{ fontSize: { xs: 13, md: 15 }, color: '#9ca3af', fontWeight: 700 }}>C.I.</Typography>
                      <Typography sx={{ fontSize: { xs: 16, md: 21 }, color: '#334155', fontWeight: 700, lineHeight: 1.2 }}>V-{item.cedula || '-'}</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: { xs: 13, md: 15 }, color: '#9ca3af', fontWeight: 700 }}>Teléfono</Typography>
                      <Typography sx={{ fontSize: { xs: 16, md: 21 }, color: '#334155', fontWeight: 700, lineHeight: 1.2 }}>{item.telefono || '-'}</Typography>
                    </Box>
                  </Box>

                  <Button
                    fullWidth
                    variant={item.vinculado ? 'outlined' : 'contained'}
                    startIcon={item.vinculado ? <PersonRemoveAlt1Icon /> : <PersonAddAlt1Icon />}
                    disabled={updatingId === String(item._id)}
                    onClick={() => handleToggleVinculo(item)}
                    sx={{
                      textTransform: 'none',
                      fontWeight: 800,
                      borderRadius: 1,
                      py: 1.05,
                      fontSize: 14,
                      borderColor: item.vinculado ? '#ef4444' : 'transparent',
                      color: item.vinculado ? '#ef4444' : '#ffffff',
                      bgcolor: item.vinculado ? '#ffffff' : '#0b1f49',
                      '&:hover': {
                        borderColor: item.vinculado ? '#dc2626' : 'transparent',
                        bgcolor: item.vinculado ? '#fff5f5' : '#102a63'
                      }
                    }}
                  >
                    {updatingId === String(item._id)
                      ? 'Actualizando...'
                      : (item.vinculado ? 'Desvincular de esta sede' : 'Agregar al staff de esta sede')}
                  </Button>
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

export default EntrenadoresSedeStaff;
