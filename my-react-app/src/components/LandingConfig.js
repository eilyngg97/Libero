import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  Typography
} from '@mui/material';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SyncAltIcon from '@mui/icons-material/SyncAlt';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import { mediaUrl } from '../utils/mediaUrl';
import { atletasDefault } from '../constants/landingAtletasDefault';

const API_BASE = process.env.REACT_APP_API_URL || window.location.origin;

function LandingConfig() {
  const [fotos, setFotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [fotoNueva, setFotoNueva] = useState(null);
  const [fotoAEliminar, setFotoAEliminar] = useState(null);

  const reemplazoInputRef = useRef(null);
  const [fotoAReemplazar, setFotoAReemplazar] = useState(null);

  const token = localStorage.getItem('token');

  const defaultsDisponibles = atletasDefault.filter((item) => !!item?.image);

  const cargarFotos = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await fetch(`${API_BASE}/api/landing/atletas-fotos/admin`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json().catch(() => []);
      if (!response.ok) {
        throw new Error(data.error || 'No se pudieron cargar las fotos del landing.');
      }
      setFotos(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Error al cargar fotos del landing.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    cargarFotos();
  }, [cargarFotos]);

  const limpiarMensajes = () => {
    setError('');
    setMensaje('');
  };

  const handleAgregarFoto = async () => {
    if (!fotoNueva) {
      setError('Selecciona una imagen para agregar.');
      return;
    }

    try {
      limpiarMensajes();
      setSubiendo(true);
      const formData = new FormData();
      formData.append('foto', fotoNueva);

      const response = await fetch(`${API_BASE}/api/landing/atletas-fotos`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'No se pudo agregar la foto.');
      }

      setFotoNueva(null);
      setMensaje('Foto agregada correctamente.');
      await cargarFotos();
    } catch (err) {
      setError(err.message || 'Error al agregar foto.');
    } finally {
      setSubiendo(false);
    }
  };

  const iniciarReemplazo = (foto) => {
    setFotoAReemplazar(foto);
    if (reemplazoInputRef.current) {
      reemplazoInputRef.current.value = '';
      reemplazoInputRef.current.click();
    }
  };

  const handleArchivoReemplazo = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !fotoAReemplazar?._id) return;

    try {
      limpiarMensajes();
      setSubiendo(true);

      const formData = new FormData();
      formData.append('foto', file);

      const response = await fetch(`${API_BASE}/api/landing/atletas-fotos/${fotoAReemplazar._id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'No se pudo reemplazar la foto.');
      }

      setMensaje('Foto reemplazada correctamente.');
      await cargarFotos();
    } catch (err) {
      setError(err.message || 'Error al reemplazar foto.');
    } finally {
      setSubiendo(false);
      setFotoAReemplazar(null);
    }
  };

  const confirmarEliminar = (foto) => setFotoAEliminar(foto);

  const reordenarFotos = async (idsOrdenados) => {
    const response = await fetch(`${API_BASE}/api/landing/atletas-fotos/reordenar`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ ids: idsOrdenados })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'No se pudo actualizar el orden de fotos.');
    }
  };

  const moverFoto = async (indexActual, direccion) => {
    const nuevoIndex = direccion === 'up' ? indexActual - 1 : indexActual + 1;
    if (nuevoIndex < 0 || nuevoIndex >= fotos.length) return;

    const copia = [...fotos];
    const temporal = copia[indexActual];
    copia[indexActual] = copia[nuevoIndex];
    copia[nuevoIndex] = temporal;

    setFotos(copia);
    try {
      await reordenarFotos(copia.map((f) => f._id));
      setMensaje('Orden actualizado.');
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el orden.');
      await cargarFotos();
    }
  };

  const migrarFotosActuales = async () => {
    try {
      limpiarMensajes();
      setSubiendo(true);

      for (let i = 0; i < defaultsDisponibles.length; i += 1) {
        const item = defaultsDisponibles[i];
        const imageResponse = await fetch(item.image);
        if (!imageResponse.ok) {
          throw new Error('No se pudo leer una de las fotos actuales del landing.');
        }

        const blob = await imageResponse.blob();
        const extension = (blob.type || 'image/jpeg').split('/')[1] || 'jpg';
        const archivo = new File([blob], `landing-atleta-${i + 1}.${extension}`, { type: blob.type || 'image/jpeg' });

        const formData = new FormData();
        formData.append('foto', archivo);

        const saveResponse = await fetch(`${API_BASE}/api/landing/atletas-fotos`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        });

        const saveData = await saveResponse.json().catch(() => ({}));
        if (!saveResponse.ok) {
          throw new Error(saveData.error || 'No se pudo migrar una foto del landing.');
        }
      }

      setMensaje('Fotos actuales migradas correctamente al gestor.');
      await cargarFotos();
    } catch (err) {
      setError(err.message || 'Error al migrar fotos actuales del landing.');
    } finally {
      setSubiendo(false);
    }
  };

  const handleEliminar = async () => {
    if (!fotoAEliminar?._id) return;

    try {
      limpiarMensajes();
      setSubiendo(true);

      const response = await fetch(`${API_BASE}/api/landing/atletas-fotos/${fotoAEliminar._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'No se pudo eliminar la foto.');
      }

      setMensaje('Foto eliminada correctamente.');
      await cargarFotos();
    } catch (err) {
      setError(err.message || 'Error al eliminar foto.');
    } finally {
      setSubiendo(false);
      setFotoAEliminar(null);
    }
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', py: 1 }}>
      <Typography sx={{ fontSize: { xs: 24, md: 30 }, fontWeight: 900, color: '#0f172a', mb: 0.5 }}>
        Configuracion Landing
      </Typography>
      <Typography sx={{ color: '#475569', mb: 2.5 }}>
        Gestiona las fotos de la seccion Nuestros Atletas para que se reflejen en el landing publico.
      </Typography>

      <Paper
        sx={{
          p: 2,
          mb: 2.5,
          borderRadius: 3,
          border: '1px solid #e2e8f0',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1.5,
          alignItems: 'center'
        }}
      >
        <Button
          component="label"
          variant="outlined"
          startIcon={<AddPhotoAlternateIcon />}
          disabled={subiendo}
          sx={{ textTransform: 'none', borderRadius: 2, fontWeight: 700 }}
        >
          Seleccionar nueva foto
          <input
            hidden
            type="file"
            accept="image/*"
            onChange={(event) => setFotoNueva(event.target.files?.[0] || null)}
          />
        </Button>

        <Button
          variant="contained"
          onClick={handleAgregarFoto}
          disabled={!fotoNueva || subiendo}
          sx={{ textTransform: 'none', borderRadius: 2, fontWeight: 800 }}
        >
          {subiendo ? 'Guardando...' : 'Agregar al landing'}
        </Button>

        <Typography sx={{ color: '#64748b', fontSize: 13 }}>
          {fotoNueva ? `Archivo: ${fotoNueva.name}` : 'No hay archivo seleccionado'}
        </Typography>

        <input
          ref={reemplazoInputRef}
          type="file"
          hidden
          accept="image/*"
          onChange={handleArchivoReemplazo}
        />
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {mensaje && <Alert severity="success" sx={{ mb: 2 }}>{mensaje}</Alert>}

      {loading ? (
        <Box sx={{ py: 6, display: 'flex', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {fotos.length === 0 ? (
            <Paper sx={{ p: 3, borderRadius: 3, border: '1px dashed #cbd5e1', textAlign: 'center', color: '#64748b' }}>
              <Typography sx={{ mb: 1.2 }}>
                Aun no hay fotos cargadas en base de datos. Las fotos que ves hoy en la web siguen viniendo de archivos estaticos del frontend.
              </Typography>
              <Button
                variant="contained"
                onClick={migrarFotosActuales}
                disabled={subiendo || defaultsDisponibles.length === 0}
                sx={{ textTransform: 'none', borderRadius: 2, fontWeight: 800 }}
              >
                {subiendo ? 'Migrando...' : 'Importar fotos actuales al gestor'}
              </Button>
            </Paper>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gap: 2,
                gridTemplateColumns: {
                  xs: 'repeat(1, minmax(0, 1fr))',
                  sm: 'repeat(2, minmax(0, 1fr))',
                  md: 'repeat(3, minmax(0, 1fr))'
                }
              }}
            >
              {fotos.map((foto, index) => (
                <Paper key={foto._id} sx={{ p: 1.25, borderRadius: 3, border: '1px solid #e2e8f0' }}>
                  <Box
                    component="img"
                    src={mediaUrl(foto.image)}
                    alt={`Foto atleta ${index + 1}`}
                    sx={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: 2, mb: 1.25 }}
                  />

                  <Stack direction="row" spacing={1} justifyContent="space-between" alignItems="center">
                    <Typography sx={{ fontSize: 13, color: '#64748b', fontWeight: 700 }}>
                      Foto #{index + 1}
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                      <IconButton
                        size="small"
                        color="default"
                        onClick={() => moverFoto(index, 'up')}
                        disabled={subiendo || index === 0}
                        title="Subir en orden"
                      >
                        <ArrowUpwardIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="default"
                        onClick={() => moverFoto(index, 'down')}
                        disabled={subiendo || index === fotos.length - 1}
                        title="Bajar en orden"
                      >
                        <ArrowDownwardIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => iniciarReemplazo(foto)}
                        disabled={subiendo}
                        title="Reemplazar foto"
                      >
                        <SyncAltIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => confirmarEliminar(foto)}
                        disabled={subiendo}
                        title="Eliminar foto"
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Stack>
                </Paper>
              ))}
            </Box>
          )}
        </>
      )}

      <Dialog open={Boolean(fotoAEliminar)} onClose={() => setFotoAEliminar(null)}>
        <DialogTitle>Eliminar foto</DialogTitle>
        <DialogContent>
          Esta accion quitara la foto del landing de atletas. ¿Deseas continuar?
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFotoAEliminar(null)} disabled={subiendo}>Cancelar</Button>
          <Button color="error" onClick={handleEliminar} disabled={subiendo}>
            Eliminar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default LandingConfig;
