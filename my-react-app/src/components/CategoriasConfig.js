import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Snackbar,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import Groups2OutlinedIcon from '@mui/icons-material/Groups2Outlined';
import CloseIcon from '@mui/icons-material/Close';

const API_BASE = process.env.REACT_APP_API_URL || window.location.origin;

const EMPTY_CATEGORIAS_CONFIG = {
  disciplina: 'voleibol',
  modo_asignacion: 'anio_nacimiento',
  fecha_corte: {
    mes: 12,
    dia: 31
  },
  reglas: [
    { etiqueta: 'U9/INICIACION', anio_nacimiento_desde: 2017, anio_nacimiento_hasta: null, orden: 1 },
    { etiqueta: 'U11/FORMACION', anio_nacimiento_desde: 2015, anio_nacimiento_hasta: 2016, orden: 2 },
    { etiqueta: 'U13/MINI', anio_nacimiento_desde: 2013, anio_nacimiento_hasta: 2014, orden: 3 },
    { etiqueta: 'U15/INFANTIL', anio_nacimiento_desde: 2011, anio_nacimiento_hasta: 2012, orden: 4 },
    { etiqueta: 'U17/JUVENIL', anio_nacimiento_desde: 2009, anio_nacimiento_hasta: 2010, orden: 5 },
    { etiqueta: 'U19/JUVENIL LIBRE', anio_nacimiento_desde: 2007, anio_nacimiento_hasta: 2008, orden: 6 },
    { etiqueta: 'U21', anio_nacimiento_desde: 2005, anio_nacimiento_hasta: 2006, orden: 7 },
    { etiqueta: 'MAYORES / LIBRE', anio_nacimiento_desde: null, anio_nacimiento_hasta: 2004, orden: 8 }
  ]
};

function buildCategoriasConfig(data = {}) {
  const reglas = Array.isArray(data?.reglas) && data.reglas.length
    ? data.reglas
    : EMPTY_CATEGORIAS_CONFIG.reglas;

  return {
    disciplina: String(data?.disciplina || EMPTY_CATEGORIAS_CONFIG.disciplina).trim().toLowerCase(),
    modo_asignacion: 'anio_nacimiento',
    fecha_corte: {
      mes: Number(data?.fecha_corte?.mes) || EMPTY_CATEGORIAS_CONFIG.fecha_corte.mes,
      dia: Number(data?.fecha_corte?.dia) || EMPTY_CATEGORIAS_CONFIG.fecha_corte.dia
    },
    reglas: reglas.map((regla, index) => ({
      etiqueta: String(regla?.etiqueta || '').trim(),
      anio_nacimiento_desde: regla?.anio_nacimiento_desde === null || regla?.anio_nacimiento_desde === undefined
        ? null
        : Number(regla.anio_nacimiento_desde),
      anio_nacimiento_hasta: regla?.anio_nacimiento_hasta === null || regla?.anio_nacimiento_hasta === undefined
        ? null
        : Number(regla.anio_nacimiento_hasta),
      orden: Number(regla?.orden) || (index + 1)
    }))
  };
}

function CategoriasConfig() {
  const token = localStorage.getItem('token');
  const rolActual = String(localStorage.getItem('rol') || '').trim().toLowerCase();
  const puedeGestionarCategorias = rolActual === 'super_admin' || rolActual === 'admin';

  const [categoriasConfig, setCategoriasConfig] = useState(EMPTY_CATEGORIAS_CONFIG);
  const [guardandoCategoriasConfig, setGuardandoCategoriasConfig] = useState(false);
  const [cargandoConfig, setCargandoConfig] = useState(true);

  const [asignandoCategorias, setAsignandoCategorias] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [previewCategoriasLoading, setPreviewCategoriasLoading] = useState(false);
  const [previewCategoriasData, setPreviewCategoriasData] = useState(null);
  const [previewCategoriasError, setPreviewCategoriasError] = useState('');

  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const apiBase = useMemo(() => (process.env.REACT_APP_API_URL || window.location.origin).replace(/\/$/, ''), []);

  const sectionCardSx = {
    p: 2.4,
    borderRadius: 3,
    border: '1px solid #e7ebf3',
    boxShadow: '0 2px 6px rgba(15, 23, 42, 0.03)',
    bgcolor: '#ffffff'
  };

  const sectionHeaderSx = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 1.5,
    mb: 2
  };

  const sectionIconWrapSx = {
    width: 44,
    height: 44,
    borderRadius: 1.6,
    bgcolor: '#eef2fb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#b45309'
  };

  const fieldLabelSx = {
    '& .MuiInputLabel-root': {
      fontSize: 11,
      fontWeight: 800,
      color: '#9aa4b2',
      letterSpacing: '0.03em',
      textTransform: 'uppercase'
    },
    '& .MuiOutlinedInput-root': {
      borderRadius: 2,
      bgcolor: '#ffffff',
      '& fieldset': {
        borderColor: '#e3e8f2'
      },
      '&:hover fieldset': {
        borderColor: '#d4dbe8'
      },
      '&.Mui-focused fieldset': {
        borderColor: '#d4dbe8'
      }
    }
  };

  const orangeButtonSx = {
    textTransform: 'none',
    fontWeight: 800,
    bgcolor: '#ff7a1a',
    px: 3.4,
    '&:hover': {
      bgcolor: '#ea6c11'
    },
    '&.Mui-disabled': {
      bgcolor: '#e6eaf2',
      color: '#a8b0bf'
    }
  };

  const formatFechaNacimiento = (value) => {
    if (!value) return '-';
    const fecha = new Date(value);
    if (Number.isNaN(fecha.getTime())) return '-';
    return fecha.toLocaleDateString('es-VE');
  };

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const cargarConfig = async () => {
      try {
        setCargandoConfig(true);
        const res = await fetch(`${apiBase}/api/configuracion`, {
          signal: controller.signal,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        const payload = await res.json().catch(() => ({}));
        if (!active || !res.ok) return;
        setCategoriasConfig(buildCategoriasConfig(payload?.categorias));
      } catch (_) {
        if (active) setError('No se pudo cargar la configuracion de categorias.');
      } finally {
        if (active) setCargandoConfig(false);
      }
    };

    cargarConfig();

    return () => {
      active = false;
      controller.abort();
    };
  }, [apiBase, token]);

  const updateCategoriasField = (field, value) => {
    setCategoriasConfig((prev) => ({ ...prev, [field]: value }));
  };

  const updateCategoriasFechaCorte = (field, value) => {
    const parsed = value === '' ? '' : Number.parseInt(String(value), 10);
    setCategoriasConfig((prev) => ({
      ...prev,
      fecha_corte: {
        ...prev.fecha_corte,
        [field]: Number.isFinite(parsed) ? parsed : ''
      }
    }));
  };

  const updateCategoriaRegla = (index, field, value) => {
    setCategoriasConfig((prev) => ({
      ...prev,
      reglas: prev.reglas.map((regla, idx) => {
        if (idx !== index) return regla;
        if (field === 'etiqueta') {
          return { ...regla, etiqueta: value };
        }
        if (value === '' || value === null || value === undefined) {
          return { ...regla, [field]: null };
        }
        const parsed = Number.parseInt(String(value), 10);
        return { ...regla, [field]: Number.isFinite(parsed) ? parsed : null };
      })
    }));
  };

  const agregarCategoriaRegla = () => {
    setCategoriasConfig((prev) => ({
      ...prev,
      reglas: [
        ...prev.reglas,
        {
          etiqueta: '',
          anio_nacimiento_desde: null,
          anio_nacimiento_hasta: null,
          orden: prev.reglas.length + 1
        }
      ]
    }));
  };

  const eliminarCategoriaRegla = (index) => {
    setCategoriasConfig((prev) => ({
      ...prev,
      reglas: prev.reglas.filter((_, idx) => idx !== index).map((regla, idx) => ({ ...regla, orden: idx + 1 }))
    }));
  };

  const guardarCategoriasConfig = async () => {
    try {
      setGuardandoCategoriasConfig(true);
      setError('');
      const payloadCategorias = {
        ...categoriasConfig,
        disciplina: String(categoriasConfig.disciplina || '').trim().toLowerCase(),
        reglas: (categoriasConfig.reglas || []).map((regla, idx) => ({
          etiqueta: String(regla?.etiqueta || '').trim(),
          anio_nacimiento_desde: regla?.anio_nacimiento_desde === '' ? null : regla?.anio_nacimiento_desde,
          anio_nacimiento_hasta: regla?.anio_nacimiento_hasta === '' ? null : regla?.anio_nacimiento_hasta,
          orden: idx + 1
        })),
        fecha_corte: {
          mes: Number(categoriasConfig?.fecha_corte?.mes) || 12,
          dia: Number(categoriasConfig?.fecha_corte?.dia) || 31
        }
      };

      const res = await fetch(`${apiBase}/api/configuracion`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ categorias: payloadCategorias })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || data?.detalle || 'No se pudo guardar la configuracion de categorias.');

      setCategoriasConfig(buildCategoriasConfig(data?.categorias));
      setSuccessMessage('Configuracion de categorias actualizada.');
    } catch (err) {
      setError(err.message || 'No se pudo guardar la configuracion de categorias.');
    } finally {
      setGuardandoCategoriasConfig(false);
    }
  };

  const asignarCategorias = async () => {
    try {
      setAsignandoCategorias(true);
      setError('');
      const res = await fetch(`${API_BASE}/api/alumnos/asignar-categorias`, {
        method: 'PUT',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'No se pudieron asignar las categorias');
      setSuccessMessage(data?.message || 'Categorias asignadas correctamente');
    } catch (err) {
      setError(err.message || 'No se pudieron asignar las categorias');
    } finally {
      setAsignandoCategorias(false);
    }
  };

  const cargarPreviewAsignarCategorias = async () => {
    try {
      setPreviewCategoriasLoading(true);
      setPreviewCategoriasError('');
      setPreviewCategoriasData(null);
      const res = await fetch(`${API_BASE}/api/alumnos/asignar-categorias/preview`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'No se pudo generar el preview de categorias');
      setPreviewCategoriasData(data);
    } catch (err) {
      setPreviewCategoriasError(err.message || 'No se pudo generar el preview de categorias');
    } finally {
      setPreviewCategoriasLoading(false);
    }
  };

  if (!puedeGestionarCategorias) {
    return (
      <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
        <Alert severity="warning">Solo super admin y admin pueden gestionar categorías por academia.</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>
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

      <Typography sx={{ fontSize: { xs: 24, md: 30 }, fontWeight: 900, color: '#0f172a', mb: 0.5 }}>
        Categorias
      </Typography>
      <Typography sx={{ color: '#475569', mb: 2.5 }}>
        Configura las reglas de categorias de tu academia.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}

      <Paper sx={{ ...sectionCardSx, mb: 2.2 }}>
        <Box sx={sectionHeaderSx}>
          <Box sx={sectionIconWrapSx}>
            <Groups2OutlinedIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 800, color: '#1f2a3d', mb: 0.25 }}>Reglas de categorias por academia</Typography>
            <Typography sx={{ color: '#637086', fontSize: 13 }}>
              Configura las reglas de categorias de tu academia.
            </Typography>
          </Box>
        </Box>

        {cargandoConfig ? (
          <Typography sx={{ color: '#64748b', fontSize: 14 }}>Cargando configuracion de categorias...</Typography>
        ) : (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 0.6fr 0.6fr' }, gap: 1.2 }}>
              <TextField
                label="Disciplina"
                size="small"
                value={categoriasConfig.disciplina || ''}
                onChange={(e) => updateCategoriasField('disciplina', e.target.value)}
                helperText="Ejemplo: voleibol, basket"
                InputLabelProps={{ shrink: true }}
                sx={fieldLabelSx}
              />
              <TextField
                label="Mes corte"
                size="small"
                type="number"
                value={categoriasConfig?.fecha_corte?.mes ?? ''}
                onChange={(e) => updateCategoriasFechaCorte('mes', e.target.value)}
                inputProps={{ min: 1, max: 12 }}
                InputLabelProps={{ shrink: true }}
                sx={fieldLabelSx}
              />
              <TextField
                label="Dia corte"
                size="small"
                type="number"
                value={categoriasConfig?.fecha_corte?.dia ?? ''}
                onChange={(e) => updateCategoriasFechaCorte('dia', e.target.value)}
                inputProps={{ min: 1, max: 31 }}
                InputLabelProps={{ shrink: true }}
                sx={fieldLabelSx}
              />
            </Box>

            <Box sx={{ mt: 1.5, display: 'grid', gap: 1 }}>
              {(categoriasConfig.reglas || []).map((regla, index) => (
                <Box
                  key={`regla-${index}`}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '1.2fr 0.7fr 0.7fr auto' },
                    gap: 1,
                    p: 1,
                    border: '1px solid #e2e8f0',
                    borderRadius: 2,
                    bgcolor: '#f8fafc'
                  }}
                >
                  <TextField
                    label={`Categoria #${index + 1}`}
                    size="small"
                    value={regla.etiqueta || ''}
                    onChange={(e) => updateCategoriaRegla(index, 'etiqueta', e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={fieldLabelSx}
                  />
                  <TextField
                    label="Desde"
                    size="small"
                    type="number"
                    value={regla.anio_nacimiento_desde ?? ''}
                    onChange={(e) => updateCategoriaRegla(index, 'anio_nacimiento_desde', e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={fieldLabelSx}
                  />
                  <TextField
                    label="Hasta"
                    size="small"
                    type="number"
                    value={regla.anio_nacimiento_hasta ?? ''}
                    onChange={(e) => updateCategoriaRegla(index, 'anio_nacimiento_hasta', e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    sx={fieldLabelSx}
                  />
                  <Tooltip title="Quitar">
                    <span>
                      <IconButton
                        color="error"
                        onClick={() => eliminarCategoriaRegla(index)}
                        disabled={(categoriasConfig.reglas || []).length <= 1}
                        size="small"
                        sx={{ alignSelf: 'center', justifySelf: { xs: 'flex-start', md: 'center' } }}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Box>
              ))}
            </Box>

            <Box sx={{ mt: 1.2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                onClick={agregarCategoriaRegla}
                sx={{
                  textTransform: 'none',
                  fontWeight: 700,
                  borderColor: '#d1d5db',
                  color: '#475569',
                  '&:hover': {
                    borderColor: '#cbd5e1',
                    bgcolor: 'rgba(148, 163, 184, 0.08)'
                  }
                }}
              >
                Agregar regla
              </Button>
              <Button
                variant="contained"
                onClick={guardarCategoriasConfig}
                disabled={guardandoCategoriasConfig}
                sx={orangeButtonSx}
              >
                {guardandoCategoriasConfig ? 'Guardando reglas...' : 'Guardar reglas de categorias'}
              </Button>
            </Box>
          </>
        )}
      </Paper>

      <Paper sx={{ ...sectionCardSx, mb: 2.2 }}>
        <Box sx={sectionHeaderSx}>
          <Box sx={sectionIconWrapSx}>
            <Groups2OutlinedIcon sx={{ fontSize: 22 }} />
          </Box>
          <Box>
            <Typography sx={{ fontWeight: 800, color: '#1f2a3d', mb: 0.25 }}>Categorias de alumnos</Typography>
            <Typography sx={{ color: '#637086', fontSize: 13 }}>
              Recalcula y asigna categorias para todos los alumnos activos de la academia según las reglas.
            </Typography>
          </Box>
        </Box>
        <Button
          variant="contained"
          onClick={async () => {
            setConfirmDialogOpen(true);
            await cargarPreviewAsignarCategorias();
          }}
          disabled={asignandoCategorias}
          sx={{
            textTransform: 'none',
            fontWeight: 800,
            bgcolor: '#0f172a',
            px: 2.8,
            '&:hover': { bgcolor: '#111b31' },
            '&.Mui-disabled': {
              bgcolor: '#e6eaf2',
              color: '#a8b0bf'
            }
          }}
        >
          {asignandoCategorias ? 'Asignando categorias...' : 'Asignar categorias'}
        </Button>
      </Paper>

      <Dialog
        open={confirmDialogOpen}
        onClose={() => !asignandoCategorias && setConfirmDialogOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0f172a' }}>
          Asignar categorias
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#475569', fontSize: 14 }}>
            Esta accion actualizara las categorias de todos los alumnos activos de la academia segun su fecha de nacimiento.
          </Typography>

          {previewCategoriasLoading && (
            <Typography sx={{ mt: 1.5, color: '#64748b', fontSize: 13 }}>
              Calculando impacto...
            </Typography>
          )}

          {!previewCategoriasLoading && previewCategoriasError && (
            <Alert severity="error" sx={{ mt: 1.5 }}>
              {previewCategoriasError}
            </Alert>
          )}

          {!previewCategoriasLoading && previewCategoriasData && (
            <Box sx={{ mt: 1.5, p: 1.5, border: '1px solid #e2e8f0', borderRadius: 2, bgcolor: '#f8fafc' }}>
              <Typography sx={{ fontSize: 13, color: '#0f172a', fontWeight: 700, mb: 1 }}>
                Preview de impacto
              </Typography>
              <Typography sx={{ fontSize: 12.5, color: '#334155' }}>
                Disciplina: <strong>{String(previewCategoriasData.disciplina || '-')}</strong>
              </Typography>
              <Typography sx={{ fontSize: 12.5, color: '#334155' }}>
                Alumnos evaluados: <strong>{Number(previewCategoriasData.evaluados || 0)}</strong>
              </Typography>
              <Typography sx={{ fontSize: 12.5, color: '#334155' }}>
                Con fecha de nacimiento: <strong>{Number(previewCategoriasData.con_fecha_nacimiento || 0)}</strong>
              </Typography>
              <Typography sx={{ fontSize: 12.5, color: '#334155' }}>
                Sin fecha de nacimiento: <strong>{Number(previewCategoriasData.sin_fecha_nacimiento || 0)}</strong>
              </Typography>
              <Typography sx={{ fontSize: 12.5, color: '#334155' }}>
                Cambios estimados: <strong>{Number(previewCategoriasData.cambios_estimados || 0)}</strong>
              </Typography>

              {Array.isArray(previewCategoriasData.muestra_cambios) && previewCategoriasData.muestra_cambios.length > 0 && (
                <Box sx={{ mt: 1.4 }}>
                  <Typography sx={{ fontSize: 12.5, color: '#0f172a', fontWeight: 700, mb: 0.8 }}>
                    Muestra de cambios
                  </Typography>

                  <Box sx={{
                    border: '1px solid #dbe3ef',
                    borderRadius: 1.6,
                    overflow: 'hidden',
                    bgcolor: '#fff'
                  }}>
                    <Box sx={{
                      display: 'grid',
                        gridTemplateColumns: '1.2fr 0.9fr 1fr 1fr',
                      gap: 1,
                      px: 1,
                      py: 0.8,
                      bgcolor: '#eef2ff',
                      borderBottom: '1px solid #dbe3ef'
                    }}>
                      <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: '#334155' }}>Alumno</Typography>
                        <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: '#334155' }}>F. nac.</Typography>
                      <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: '#334155' }}>Actual</Typography>
                      <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: '#334155' }}>Sugerida</Typography>
                    </Box>

                    <Box sx={{ maxHeight: 190, overflowY: 'auto' }}>
                      {previewCategoriasData.muestra_cambios.map((item, idx) => (
                        <Box
                          key={`${String(item.id || 'row')}-${idx}`}
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: '1.2fr 0.9fr 1fr 1fr',
                            gap: 1,
                            px: 1,
                            py: 0.8,
                            borderBottom: idx === previewCategoriasData.muestra_cambios.length - 1
                              ? 'none'
                              : '1px solid #f1f5f9'
                          }}
                        >
                          <Typography sx={{ fontSize: 11.8, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {String(item.alumno || '-')}
                          </Typography>
                          <Typography sx={{ fontSize: 11.8, color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {formatFechaNacimiento(item.fecha_nacimiento)}
                          </Typography>
                          <Typography sx={{ fontSize: 11.8, color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {String(item.categoria_actual || '-')}
                          </Typography>
                          <Typography sx={{ fontSize: 11.8, color: '#0369a1', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {String(item.categoria_sugerida || '-')}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => {
              setConfirmDialogOpen(false);
              setPreviewCategoriasError('');
              setPreviewCategoriasData(null);
            }}
            disabled={asignandoCategorias}
            sx={{ textTransform: 'none' }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              await asignarCategorias();
              setConfirmDialogOpen(false);
              setPreviewCategoriasError('');
              setPreviewCategoriasData(null);
            }}
            disabled={
              asignandoCategorias
              || previewCategoriasLoading
              || !!previewCategoriasError
              || Number(previewCategoriasData?.cambios_estimados || 0) === 0
            }
            sx={{ textTransform: 'none', fontWeight: 700 }}
          >
            {asignandoCategorias ? 'Asignando...' : 'Confirmar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default CategoriasConfig;
