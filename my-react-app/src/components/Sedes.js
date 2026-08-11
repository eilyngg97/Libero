import React, { useState, useEffect } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import Snackbar from '@mui/material/Snackbar';
import MuiAlert from '@mui/material/Alert';
import SedeForm from './SedeForm';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import IconButton from '@mui/material/IconButton';
import CloseIcon from '@mui/icons-material/Close';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import AddIcon from '@mui/icons-material/Add';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TablePagination from '@mui/material/TablePagination';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import { useDolar } from '../context/DolarContext';


function Sedes() {
  const { dolar } = useDolar();
  const monedaActiva = String(dolar?.moneda || 'USD').toUpperCase() === 'EUR' ? 'EUR' : 'USD';
  const simboloMonedaActiva = monedaActiva === 'EUR' ? '€' : '$';
  const usaRecargoGlobal = (sede) => {
    if (sede?.usar_recargo_global !== undefined && sede?.usar_recargo_global !== null) {
      return sede.usar_recargo_global !== false;
    }

    return !(Number(sede?.recargo_usd || 0) > 0);
  };
  const [sedes, setSedes] = useState([]);
  const [open, setOpen] = useState(false);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [sedeEditar, setSedeEditar] = useState(null);
  const [alert, setAlert] = useState({ open: false, message: '', severity: 'success' });
  const [openConfirm, setOpenConfirm] = useState(false);
  const [sedeAEliminar, setSedeAEliminar] = useState(null);
  const [eliminandoSede, setEliminandoSede] = useState(false);
  const [openRecargo, setOpenRecargo] = useState(false);
  const [sedeAjusteRecargo, setSedeAjusteRecargo] = useState(null);
  const [recargoMes, setRecargoMes] = useState(() => String(new Date().getMonth() + 1));
  const [recargoAnio, setRecargoAnio] = useState(() => String(new Date().getFullYear()));
  const [nuevoRecargo, setNuevoRecargo] = useState('');
  const [descripcionRecargo, setDescripcionRecargo] = useState('');
  const [previewRecargo, setPreviewRecargo] = useState(null);
  const [previewRecargoLoading, setPreviewRecargoLoading] = useState(false);
  const [previewRecargoError, setPreviewRecargoError] = useState('');
  const [aplicandoRecargo, setAplicandoRecargo] = useState(false);
  const [openImpactoRecargo, setOpenImpactoRecargo] = useState(false);
  const [impactoPage, setImpactoPage] = useState(0);
  const [impactoRowsPerPage, setImpactoRowsPerPage] = useState(10);
  const [omitidasPage, setOmitidasPage] = useState(0);
  const [omitidasRowsPerPage, setOmitidasRowsPerPage] = useState(10);
  const [impactoTab, setImpactoTab] = useState('actualizables');

  const formatMoney = (value) => Number(value || 0).toFixed(2);
  const detalleImpacto = Array.isArray(previewRecargo?.actualizables_detalle)
    ? previewRecargo.actualizables_detalle
    : [];
  const detalleOmitidas = Array.isArray(previewRecargo?.omitidas_detalle)
    ? previewRecargo.omitidas_detalle
    : [];
  const detalleImpactoPaginado = detalleImpacto.slice(
    impactoPage * impactoRowsPerPage,
    impactoPage * impactoRowsPerPage + impactoRowsPerPage
  );
  const detalleOmitidasPaginado = detalleOmitidas.slice(
    omitidasPage * omitidasRowsPerPage,
    omitidasPage * omitidasRowsPerPage + omitidasRowsPerPage
  );

  // Cargar sedes desde el backend al montar
  const fetchSedes = async () => {
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/sedes`);
      const data = await res.json();
      if (res.ok) {
        const sedesConId = Array.isArray(data)
          ? data.map(sede => ({ ...sede, id: sede._id }))
          : [];
        setSedes(sedesConId);
      } else {
        setSedes([]);
      }
    } catch (err) {
      setSedes([]);
    }
  };
  useEffect(() => {
    fetchSedes();
  }, []);

  const handleOpen = () => {
    setModoEdicion(false);
    setSedeEditar(null);
    setOpen(true);
  };
  const handleClose = () => {
    setOpen(false);
    setModoEdicion(false);
    setSedeEditar(null);
  };

  const agregarSede = (sede) => {
    // Refrescar la lista tras agregar
    // Opcional: podrías hacer un fetchSedes() aquí para recargar desde el backend
    setSedes(prev => [...prev, sede]);
    handleClose();
  };

  const handleEliminarClick = (id) => {
    const sede = sedes.find((s) => s.id === id);
    setSedeAEliminar(sede || null);
    setOpenConfirm(true);
  };

  const eliminarSede = async () => {
    if (!sedeAEliminar) return;
    try {
      setEliminandoSede(true);
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/sedes/${sedeAEliminar.id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Error al eliminar sede');
      setAlert({ open: true, message: '¡Sede eliminada con éxito!', severity: 'success' });
      await fetchSedes();
    } catch (err) {
      setAlert({ open: true, message: err.message, severity: 'error' });
    } finally {
      setEliminandoSede(false);
      setOpenConfirm(false);
      setSedeAEliminar(null);
    }
  };

  const editarSede = (id) => {
    const sede = sedes.find((s) => s.id === id);
    setSedeEditar(sede || null);
    setModoEdicion(true);
    setOpen(true);
  };

  const abrirAjusteRecargo = (sede) => {
    setSedeAjusteRecargo(sede || null);
    setRecargoMes(String(new Date().getMonth() + 1));
    setRecargoAnio(String(new Date().getFullYear()));
    setNuevoRecargo(String(Number(sede?.recargo_usd || 0)));
    setDescripcionRecargo('Ajuste de recargo por sede');
    setPreviewRecargo(null);
    setPreviewRecargoError('');
    setOpenRecargo(true);
  };

  const cerrarAjusteRecargo = () => {
    if (aplicandoRecargo) return;
    setOpenRecargo(false);
    setOpenImpactoRecargo(false);
    setSedeAjusteRecargo(null);
    setRecargoMes(String(new Date().getMonth() + 1));
    setRecargoAnio(String(new Date().getFullYear()));
    setNuevoRecargo('');
    setDescripcionRecargo('');
    setPreviewRecargo(null);
    setPreviewRecargoError('');
  };

  const obtenerPreviewRecargo = React.useCallback(async () => {
    if (!openRecargo || !sedeAjusteRecargo?._id) return;

    const mesNumero = Number(recargoMes);
    const anioNumero = Number(recargoAnio);
    const recargoNumero = Number(nuevoRecargo);

    if (!Number.isInteger(mesNumero) || mesNumero < 1 || mesNumero > 12) return;
    if (!Number.isInteger(anioNumero) || anioNumero < 2000) return;
    if (!Number.isFinite(recargoNumero) || recargoNumero < 0) return;

    try {
      setPreviewRecargoLoading(true);
      setPreviewRecargoError('');
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades/recargo-sede/preview`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id_sede: sedeAjusteRecargo._id,
          mes: mesNumero,
          anio: anioNumero,
          nuevo_recargo_usd: recargoNumero
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'No se pudo calcular la vista previa');
      setPreviewRecargo(data);
    } catch (err) {
      setPreviewRecargo(null);
      setPreviewRecargoError(err.message || 'No se pudo calcular la vista previa');
    } finally {
      setPreviewRecargoLoading(false);
    }
  }, [openRecargo, sedeAjusteRecargo?._id, recargoMes, recargoAnio, nuevoRecargo]);

  React.useEffect(() => {
    if (!openRecargo) return;
    const timer = setTimeout(() => {
      obtenerPreviewRecargo();
    }, 300);
    return () => clearTimeout(timer);
  }, [openRecargo, obtenerPreviewRecargo]);

  React.useEffect(() => {
    if (!openImpactoRecargo) return;
    setImpactoPage(0);
    setOmitidasPage(0);
    if (detalleImpacto.length > 0) {
      setImpactoTab('actualizables');
      return;
    }
    if (detalleOmitidas.length > 0) {
      setImpactoTab('omitidas');
    }
  }, [openImpactoRecargo, detalleImpacto.length, detalleOmitidas.length]);

  React.useEffect(() => {
    if (!openImpactoRecargo) return;
    if (impactoTab === 'actualizables') {
      setImpactoPage(0);
      return;
    }
    setOmitidasPage(0);
  }, [impactoTab, openImpactoRecargo]);

  const aplicarRecargoSede = async () => {
    if (!sedeAjusteRecargo?._id || aplicandoRecargo) return;

    const mesNumero = Number(recargoMes);
    const anioNumero = Number(recargoAnio);
    const recargoNumero = Number(nuevoRecargo);

    if (!Number.isInteger(mesNumero) || mesNumero < 1 || mesNumero > 12) {
      setPreviewRecargoError('Selecciona un mes válido.');
      return;
    }

    if (!Number.isInteger(anioNumero) || anioNumero < 2000) {
      setPreviewRecargoError('Selecciona un año válido.');
      return;
    }

    if (!Number.isFinite(recargoNumero) || recargoNumero < 0) {
      setPreviewRecargoError('Ingresa un recargo válido.');
      return;
    }

    try {
      setAplicandoRecargo(true);
      setPreviewRecargoError('');
      const token = localStorage.getItem('token');
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades/recargo-sede`, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id_sede: sedeAjusteRecargo._id,
          mes: mesNumero,
          anio: anioNumero,
          nuevo_recargo_usd: recargoNumero,
          descripcion: descripcionRecargo.trim()
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'No se pudo aplicar el recargo');

      const resumen = data?.resumen_ajuste || {
        procesadas_total: (data?.mensualidades_actualizadas || 0) + (data?.mensualidades_omitidas_no_aplicables || 0),
        correctas: data?.mensualidades_actualizadas || 0,
        omitidas_total: data?.mensualidades_omitidas_no_aplicables || 0,
        omitidas_no_aplicables: data?.mensualidades_omitidas_no_aplicables || 0,
        omitidas_conflicto_saldo: 0,
        omitidas_detalle: Array.isArray(data?.mensualidades_omitidas_detalle) ? data.mensualidades_omitidas_detalle : []
      };

      setPreviewRecargo(data);
      setAlert({
        open: true,
        message: `Recargo aplicado: ${resumen.correctas || 0} actualizadas, ${resumen.omitidas_total || 0} omitidas.`,
        severity: 'success'
      });
      await fetchSedes();
      cerrarAjusteRecargo();
    } catch (err) {
      setPreviewRecargoError(err.message || 'No se pudo aplicar el recargo');
    } finally {
      setAplicandoRecargo(false);
    }
  };

  return (
    <div>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <h2 style={{ margin: 0 }}>Gestión de Sedes</h2>
        <Button variant="contained" color="secondary" onClick={handleOpen} sx={{ borderRadius: 999 }} startIcon={<AddIcon />}>
          Agregar Sede
        </Button>
      </Box>
      <Dialog open={open} onClose={handleClose}>
        <DialogTitle sx={{ m: 0, p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Agregar Sede
          <IconButton
            aria-label="close"
            onClick={handleClose}
            sx={{ position: 'absolute', right: 8, top: 8, color: (theme) => theme.palette.grey[500] }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <SedeForm 
            onAgregarSede={agregarSede}
            modoEdicion={modoEdicion}
            sedeEditar={sedeEditar}
            onEditSede={async (sedeEditada) => {
              setAlert({ open: true, message: '¡Sede editada con éxito!', severity: 'success' });
              await fetchSedes();
              handleClose();
            }}
          />
        </DialogContent>
      </Dialog>
      <Snackbar open={alert.open} autoHideDuration={2500} onClose={() => setAlert({ ...alert, open: false })} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <MuiAlert onClose={() => setAlert({ ...alert, open: false })} severity={alert.severity} sx={{ width: '100%' }}>
          {alert.message}
        </MuiAlert>
      </Snackbar>
      <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {sedes.map((sede, idx) => {
          return (
            <Paper key={sede.id || `sede-card-${idx}`}
              sx={{
                p: 3,
                borderRadius: 3,
                boxShadow: '0 2px 8px rgba(15,23,42,0.06)',
                display: 'flex',
                alignItems: 'center',
                gap: 3,
                flexWrap: 'wrap',
                minHeight: 120
              }}
            >
              <Box sx={{ minWidth: 180, flex: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <LocationOnIcon sx={{ color: '#f59e0b', fontSize: 28 }} />
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#0f172a' }}>{sede.nombre}</Typography>
                </Box>
                <Typography sx={{ color: '#64748b', fontSize: 14 }}>{sede.direccion || '-'}</Typography>
                <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Chip label={sede.estado} size="small" sx={{ bgcolor: sede.estado === 'Activa' ? '#dcfce7' : '#fee2e2', color: sede.estado === 'Activa' ? '#16a34a' : '#dc2626', fontWeight: 700 }} />
                  <Typography sx={{ fontSize: 13, color: '#475569', fontWeight: 700 }}>
                    Mensualidad: {simboloMonedaActiva}{sede.costo || '-'}
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: '#475569', fontWeight: 700 }}>
                    Inscripción: {simboloMonedaActiva}{sede.monto_inscripcion || '-'}
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: '#475569', fontWeight: 700 }}>
                    Recargo: {usaRecargoGlobal(sede) ? 'Global' : `${simboloMonedaActiva}${sede.recargo_usd || 0}`}
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    {!usaRecargoGlobal(sede) && (
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => abrirAjusteRecargo(sede)}
                        sx={{
                          borderRadius: 2,
                          color: '#b45309',
                          borderColor: '#fdba74',
                          bgcolor: '#fff',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                          boxShadow: 'none',
                          letterSpacing: 1,
                          px: 2.5,
                          '&:hover': {
                            bgcolor: '#fff7ed',
                            borderColor: '#fb923c',
                            boxShadow: 'none'
                          }
                        }}
                      >
                        Recalcular recargo
                      </Button>
                    )}
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => editarSede(sede.id)}
                      sx={{
                        borderRadius: 2,
                        color: '#334155',
                        borderColor: '#cbd5e1',
                        bgcolor: '#fff',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        boxShadow: 'none',
                        letterSpacing: 1,
                        px: 2.5,
                        '&:hover': {
                          bgcolor: '#fdfdfd',
                          borderColor: '#cbd5e1',
                          boxShadow: 'none'
                        }
                      }}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => handleEliminarClick(sede.id)}
                      sx={{
                        borderRadius: 2,
                        color: '#ef4444',
                        borderColor: '#fecaca',
                        bgcolor: '#fff',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        boxShadow: 'none',
                        letterSpacing: 1,
                        px: 2.5,
                        '&:hover': {
                          bgcolor: '#fef2f2',
                          borderColor: '#fca5a5',
                          boxShadow: 'none'
                        }
                      }}
                    >
                      Eliminar
                    </Button>
                </Box>
              </Box>
            </Paper>
          );
        })}
      </Box>
      <Dialog
        open={openConfirm}
        onClose={() => {
          if (eliminandoSede) return;
          setOpenConfirm(false);
        }}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
      >
        <DialogTitle sx={{ bgcolor: '#fff7ed', color: '#9a3412', fontWeight: 800 }}>
          Confirmar eliminación
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5 }}>
          <Typography sx={{ color: '#334155', fontSize: 14 }}>
            ¿Estás seguro que deseas eliminar la sede <b>{sedeAEliminar?.nombre}</b>? Esta acción no se puede deshacer.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setOpenConfirm(false)} disabled={eliminandoSede}>Cancelar</Button>
          <Button onClick={eliminarSede} color="error" variant="contained" disabled={eliminandoSede}>
            {eliminandoSede ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={openRecargo}
        onClose={cerrarAjusteRecargo}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, border: '1px solid #d1d5db', backgroundColor: '#f8fafc' } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#1f2937', pr: 6, borderBottom: '1px solid #e5e7eb', backgroundColor: '#f3f4f6' }}>
          Recalcular recargo por sede
          <IconButton
            aria-label="Cerrar"
            onClick={cerrarAjusteRecargo}
            disabled={aplicandoRecargo}
            sx={{ position: 'absolute', right: 8, top: 8, color: '#6b7280' }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 1.5 }}>
          <Alert severity="info" sx={{ mb: 2, borderColor: '#cbd5e1', color: '#334155', backgroundColor: '#f8fafc' }}>
            Este ajuste recalcula las mensualidades activas de la sede del periodo indicado, incluyendo montos por sede y montos personalizados.
          </Alert>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
            <Button
              onClick={obtenerPreviewRecargo}
              disabled={aplicandoRecargo || previewRecargoLoading}
              variant="outlined"
              sx={{
                borderColor: '#9ca3af',
                color: '#4b5563',
                fontWeight: 700,
                '&:hover': {
                  borderColor: '#6b7280',
                  backgroundColor: '#f3f4f6'
                }
              }}
            >
              Recalcular vista previa
            </Button>
          </Box>
          <TextField
            label="Sede"
            fullWidth
            margin="normal"
            value={sedeAjusteRecargo?.nombre || ''}
            disabled
          />
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            <TextField
              label="Mes"
              type="number"
              fullWidth
              margin="normal"
              value={recargoMes}
              onChange={(e) => {
                setRecargoMes(e.target.value);
                setPreviewRecargo(null);
              }}
              inputProps={{ min: 1, max: 12, step: 1 }}
            />
            <TextField
              label="Año"
              type="number"
              fullWidth
              margin="normal"
              value={recargoAnio}
              onChange={(e) => {
                setRecargoAnio(e.target.value);
                setPreviewRecargo(null);
              }}
              inputProps={{ min: 2000, step: 1 }}
            />
          </Box>
          <TextField
            label={`Nuevo recargo (${simboloMonedaActiva})`}
            type="number"
            fullWidth
            margin="normal"
            value={nuevoRecargo}
            onChange={(e) => {
              setNuevoRecargo(e.target.value);
              setPreviewRecargo(null);
            }}
            inputProps={{ min: 0, step: '0.01' }}
          />
          <TextField
            label="Nota"
            fullWidth
            margin="normal"
            value={descripcionRecargo}
            onChange={(e) => setDescripcionRecargo(e.target.value)}
            multiline
            minRows={2}
            placeholder="Motivo del cambio de recargo"
          />
          {previewRecargoError && <Alert severity="error" sx={{ mt: 2 }}>{previewRecargoError}</Alert>}
          {previewRecargo && (
            <Box sx={{ mt: 2 }}>
              <Alert severity={Number(previewRecargo.mensualidades_actualizables || 0) > 0 ? 'success' : 'info'}>
                Impacto estimado: {previewRecargo.mensualidades_actualizables || 0} actualizables, {previewRecargo.mensualidades_omitidas || 0} omitidas, {previewRecargo.mensualidades_sin_cambio || 0} sin cambio.
              </Alert>
            </Box>
          )}
          {previewRecargoLoading && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Calculando vista previa...
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, display: 'flex', justifyContent: 'flex-end', gap: 1.2, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: { xs: 'flex-start', sm: 'flex-end' } }}>
            <Button
              onClick={() => setOpenImpactoRecargo(true)}
              variant="outlined"
              disabled={
                aplicandoRecargo ||
                previewRecargoLoading ||
                !previewRecargo ||
                (
                  (!Array.isArray(previewRecargo.actualizables_detalle) || previewRecargo.actualizables_detalle.length === 0) &&
                  (!Array.isArray(previewRecargo.omitidas_detalle) || previewRecargo.omitidas_detalle.length === 0)
                )
              }
              sx={{
                borderColor: '#94a3b8',
                color: '#64748b',
                fontWeight: 700,
                '&:hover': {
                  borderColor: '#7b8794',
                  backgroundColor: '#f8fafc'
                }
              }}
            >
              Ver impacto
            </Button>
            <Button
              onClick={aplicarRecargoSede}
              variant="contained"
              disabled={aplicandoRecargo || previewRecargoLoading || !(previewRecargo?.mensualidades_actualizables > 0)}
              sx={{
                bgcolor: '#f97316',
                '&:hover': { bgcolor: '#ea580c' },
                fontWeight: 700,
                borderRadius: 2,
                py: 1.2,
                '&.Mui-disabled': { backgroundColor: '#d1d5db', color: '#6b7280' }
              }}
            >
              {aplicandoRecargo ? 'Aplicando...' : 'Aplicar recargo'}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>
      <Dialog
        open={openImpactoRecargo}
        onClose={() => setOpenImpactoRecargo(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, border: '1px solid #d1d5db', backgroundColor: '#f8fafc' } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#1f2937', pr: 6, borderBottom: '1px solid #e5e7eb', backgroundColor: '#f3f4f6' }}>
          Impacto del recargo por alumno
          <IconButton
            aria-label="Cerrar"
            onClick={() => setOpenImpactoRecargo(false)}
            sx={{ position: 'absolute', right: 8, top: 8, color: '#6b7280' }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: 1.5 }}>
          {(detalleImpacto.length > 0 || detalleOmitidas.length > 0) ? (
            <>
              <Tabs
                value={impactoTab}
                onChange={(_, value) => setImpactoTab(value)}
                sx={{
                  mb: 1.5,
                  borderBottom: '1px solid #d1d5db',
                  '& .MuiTabs-indicator': {
                    backgroundColor: '#6b7280'
                  }
                }}
                variant="fullWidth"
              >
                <Tab
                  value="actualizables"
                  label={`Actualizables (${detalleImpacto.length})`}
                  disabled={detalleImpacto.length === 0}
                  sx={{
                    fontWeight: 700,
                    textTransform: 'none',
                    color: '#6b7280',
                    '&.Mui-selected': { color: '#374151' }
                  }}
                />
                <Tab
                  value="omitidas"
                  label={`Omitidas (${detalleOmitidas.length})`}
                  disabled={detalleOmitidas.length === 0}
                  sx={{
                    fontWeight: 700,
                    textTransform: 'none',
                    color: '#6b7280',
                    '&.Mui-selected': { color: '#374151' }
                  }}
                />
              </Tabs>

              {impactoTab === 'actualizables' && (
                <>
                  <Typography sx={{ fontWeight: 800, color: '#0f172a', mb: 1 }}>Actualizables</Typography>
                  {detalleImpacto.length > 0 ? (
                    <>
                      <TableContainer component={Paper} variant="outlined" sx={{ borderColor: '#d1d5db', maxHeight: 420, backgroundColor: '#ffffff' }}>
                        <Table stickyHeader size="small" aria-label="detalle mensualidades actualizables">
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 800 }}>Alumno</TableCell>
                              <TableCell sx={{ fontWeight: 800 }}>Cédula</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 800 }}>Recargo anterior</TableCell>
                              <TableCell align="right" sx={{ fontWeight: 800 }}>Recargo nuevo</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {detalleImpactoPaginado.map((item) => (
                              <TableRow key={item?.mensualidad_id || `${item?.alumno_id || 'alumno'}-${item?.alumno_cedula || 'cedula'}`} hover>
                                <TableCell>{item?.alumno_nombre || 'Alumno sin nombre'}</TableCell>
                                <TableCell>{item?.alumno_cedula || '-'}</TableCell>
                                <TableCell align="right">{`${simboloMonedaActiva}${formatMoney(item?.recargo_anterior_usd)}`}</TableCell>
                                <TableCell align="right">{`${simboloMonedaActiva}${formatMoney(item?.recargo_nuevo_usd)}`}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                      <TablePagination
                        component="div"
                        count={detalleImpacto.length}
                        page={impactoPage}
                        onPageChange={(_, newPage) => setImpactoPage(newPage)}
                        rowsPerPage={impactoRowsPerPage}
                        onRowsPerPageChange={(event) => {
                          setImpactoRowsPerPage(Number(event.target.value));
                          setImpactoPage(0);
                        }}
                        rowsPerPageOptions={[5, 10, 25, 50]}
                        labelRowsPerPage="Filas por página"
                      />
                    </>
                  ) : (
                    <Alert severity="info">No hay mensualidades actualizables para mostrar.</Alert>
                  )}
                </>
              )}
              {impactoTab === 'omitidas' && (
                <>
                  <Typography sx={{ fontWeight: 800, color: '#0f172a', mb: 1 }}>Omitidas</Typography>
                  {detalleOmitidas.length > 0 ? (
                    <>
                      <TableContainer component={Paper} variant="outlined" sx={{ borderColor: '#d1d5db', maxHeight: 420, backgroundColor: '#ffffff' }}>
                        <Table stickyHeader size="small" aria-label="detalle mensualidades omitidas">
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ fontWeight: 800 }}>Alumno</TableCell>
                              <TableCell sx={{ fontWeight: 800 }}>Cédula</TableCell>
                              <TableCell sx={{ fontWeight: 800 }}>Estatus</TableCell>
                              <TableCell sx={{ fontWeight: 800 }}>Motivo</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {detalleOmitidasPaginado.map((item) => (
                              <TableRow key={item?.mensualidad_id || `${item?.alumno_id || 'alumno'}-${item?.motivo_code || 'motivo'}`} hover>
                                <TableCell>{item?.alumno_nombre || 'Alumno sin nombre'}</TableCell>
                                <TableCell>{item?.alumno_cedula || '-'}</TableCell>
                                <TableCell>{item?.estatus || '-'}</TableCell>
                                <TableCell>{item?.motivo || 'Omitida por regla de negocio'}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                      <TablePagination
                        component="div"
                        count={detalleOmitidas.length}
                        page={omitidasPage}
                        onPageChange={(_, newPage) => setOmitidasPage(newPage)}
                        rowsPerPage={omitidasRowsPerPage}
                        onRowsPerPageChange={(event) => {
                          setOmitidasRowsPerPage(Number(event.target.value));
                          setOmitidasPage(0);
                        }}
                        rowsPerPageOptions={[5, 10, 25, 50]}
                        labelRowsPerPage="Filas por página"
                      />
                    </>
                  ) : (
                    <Alert severity="info">No hay mensualidades omitidas para mostrar.</Alert>
                  )}
                </>
              )}
            </>
          ) : (
            <Alert severity="info">No hay mensualidades actualizables para mostrar.</Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setOpenImpactoRecargo(false)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

export default Sedes;