import React, { useState, useEffect } from 'react';
import { useSede } from '../context/SedeContext';
import Snackbar from '@mui/material/Snackbar';
import MuiAlert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { useNavigate } from 'react-router-dom';
import { Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, Typography, IconButton, TablePagination, TextField, InputAdornment, Tooltip, Checkbox, FormControlLabel, Avatar, Chip, Box } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import DownloadIcon from '@mui/icons-material/Download';
import PersonOffIcon from '@mui/icons-material/PersonOff';
import ReplayIcon from '@mui/icons-material/Replay';
import PersonAddAlt1Icon from '@mui/icons-material/PersonAddAlt1';
import TableChartIcon from '@mui/icons-material/TableChart';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';

function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return '';
  const hoy = new Date();
  const nacimiento = new Date(fechaNacimiento);
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const m = hoy.getMonth() - nacimiento.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) {
    edad--;
  }
  return edad;
}

function TablaAlumnos() {
      // Estados para filtros
      const [filtroNombre, setFiltroNombre] = useState('');
      const [filtroApellido, setFiltroApellido] = useState('');
      const [filtroCategoria, setFiltroCategoria] = useState('');
      const [filtroAnio, setFiltroAnio] = useState('');
      const [filtroFechaInscripcion, setFiltroFechaInscripcion] = useState('');
    // Formatear fecha a DD/MM/YYYY (corrige desfase por zona horaria)
    const formatFecha = (fecha) => {
      if (!fecha) return '';
      const d = new Date(fecha);
      // Ajustar para evitar desfase por zona horaria UTC
      const local = new Date(d.getTime() + Math.abs(d.getTimezoneOffset() * 60000));
      const dia = String(local.getDate()).padStart(2, '0');
      const mes = String(local.getMonth() + 1).padStart(2, '0');
      const anio = local.getFullYear();
      return `${dia}/${mes}/${anio}`;
    };
  const { sedeSeleccionada } = useSede();
  const navigate = useNavigate();
  const [alumnos, setAlumnos] = useState([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState({ open: false, message: '' });
  const [bajaId, setBajaId] = useState(null);
  const [bajaLoading, setBajaLoading] = useState(false);
  const [bajaSuccess, setBajaSuccess] = useState({ open: false, message: '' });
  const [reactivarId, setReactivarId] = useState(null);
  const [reactivarLoading, setReactivarLoading] = useState(false);
  const [reactivarSuccess, setReactivarSuccess] = useState({ open: false, message: '' });
  const [incluirBajas, setIncluirBajas] = useState(false);
  // Función para descargar Excel
  const handleDownloadExcel = () => {
    const alumnosActivos = alumnosFiltrados.filter(a => !(a.dado_de_baja || a.activo === false || a.estado === 'Baja'));
    const data = alumnosActivos.map(a => ({
      Nombre: a.nombres,
      Apellido: a.apellidos,
      Fecha_Nacimiento: formatFecha(a.fecha_nacimiento),
      Edad: calcularEdad(a.fecha_nacimiento),
      Cedula: a.cedula,
      Representante: a.representante ? `${a.representante.nombres} ${a.representante.apellidos}` : ('-'),
      Telefono: a.representante && a.representante.telefono ? `${a.representante.telefono}` : ('-'),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Alumnos');
    XLSX.writeFile(wb, `alumnos${sedeSeleccionada && sedeSeleccionada.nombre ? '_' + sedeSeleccionada.nombre.replace(/\s+/g, '_') : ''}.xlsx`);
  };

  // Función para descargar PDF
  const handleDownloadPDF = () => {
    const doc = new jsPDF();
    const columns = ["N°", "Nombre", "Apellido", "Fecha de Nacimiento", "Edad", "Cedula", "Representante", "Telefono"];
    const rows = alumnosFiltrados.map((a, i) => [
      i + 1,
      a.nombres,
      a.apellidos,
      formatFecha(a.fecha_nacimiento),
      calcularEdad(a.fecha_nacimiento),
      a.cedula,
      a.representante ? `${a.representante.nombres} ${a.representante.apellidos}` : ('-'),
      a.representante && a.representante.telefono ? `${a.representante.telefono}` : ('-')
    ]);
    doc.text(`Lista de Alumnos (Total: ${alumnosFiltrados.length})`, 14, 10);
    autoTable(doc, { head: [columns], body: rows, startY: 20 });
    let nombreSede = '';
    if (sedeSeleccionada && sedeSeleccionada.nombre) {
      nombreSede = `_${sedeSeleccionada.nombre.replace(/\s+/g, '_')}`;
    }
    doc.save(`alumnos${nombreSede}.pdf`);
  };
  const handleDeleteAlumno = async () => {
    if (!deleteId) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/${deleteId}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar alumno');
      setAlumnos(alumnos.filter(a => a._id !== deleteId));
      setDeleteId(null);
      setDeleteSuccess({ open: true, message: data.message || 'Alumno eliminado' });
    } catch (err) {
      setError(err.message);
    } finally {
      setDeleteLoading(false);
    }
  };
  const handleBajaAlumno = async () => {
    if (!bajaId) return;
    setBajaLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/${bajaId}/baja`, {
        method: 'PATCH'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al dar de baja al alumno');
      setAlumnos(prev => prev.map(a => a._id === bajaId ? { ...a, estado: 'Baja', dado_de_baja: true, activo: false } : a));
      setBajaId(null);
      setBajaSuccess({ open: true, message: data.message || 'Alumno dado de baja' });
    } catch (err) {
      setError(err.message);
    } finally {
      setBajaLoading(false);
    }
  };
  const handleReactivarAlumno = async () => {
    if (!reactivarId) return;
    setReactivarLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/${reactivarId}/reactivar`, {
        method: 'PATCH'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al reactivar al alumno');
      setAlumnos(prev => prev.map(a => a._id === reactivarId ? { ...a, estado: 'Activo', dado_de_baja: false, activo: true, fecha_baja: null, motivo_baja: null } : a));
      setReactivarId(null);
      setReactivarSuccess({ open: true, message: data.message || 'Alumno reactivado' });
    } catch (err) {
      setError(err.message);
    } finally {
      setReactivarLoading(false);
    }
  };

  useEffect(() => {
    const fetchAlumnos = async () => {
      setLoading(true);
      try {
        const incluirBajasParam = incluirBajas ? '?incluirBajas=1' : '';
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos${incluirBajasParam}`);
        if (!res.ok) throw new Error('Error al obtener alumnos');
        let data;
        try {
          data = await res.json();
        } catch (jsonErr) {
          // Si la respuesta no es JSON, intenta leer el texto y mostrarlo como error
          const text = await res.text();
          throw new Error('Respuesta inesperada del servidor: ' + text.substring(0, 200));
        }
        setAlumnos(data);
        setError(null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchAlumnos();
  }, [incluirBajas]);

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Filtrar alumnos por sede seleccionada
  let alumnosFiltrados = sedeSeleccionada && sedeSeleccionada._id
    ? alumnos.filter(a => a.sede && a.sede._id === sedeSeleccionada._id)
    : alumnos;
  console.log('Alumnos después de filtrar por sede:', alumnosFiltrados);
  // Aplicar filtros adicionales
  alumnosFiltrados = alumnosFiltrados.filter(a => {
    const nombreMatch = filtroNombre === '' || (a.nombres && a.nombres.toLowerCase().includes(filtroNombre.toLowerCase()));
    const apellidoMatch = filtroApellido === '' || (a.apellidos && a.apellidos.toLowerCase().includes(filtroApellido.toLowerCase()));
    // Asegurar que categoría sea string
    let categoriaValue = a.categoria;
    if (typeof categoriaValue === 'object' && categoriaValue !== null) {
      categoriaValue = categoriaValue.nombre || '';
    }
    const categoriaMatch = filtroCategoria === '' || (categoriaValue && categoriaValue.toLowerCase().includes(filtroCategoria.toLowerCase()));
    const anioMatch = filtroAnio === '' || (a.fecha_nacimiento && new Date(a.fecha_nacimiento).getFullYear().toString() === filtroAnio);
    // Filtro por fecha de inscripción (formato YYYY-MM-DD)
    const fechaInscripcionMatch = filtroFechaInscripcion === '' || (a.fecha_inscripcion && a.fecha_inscripcion.startsWith(filtroFechaInscripcion));
    return nombreMatch && apellidoMatch && categoriaMatch && anioMatch && fechaInscripcionMatch;
  });
  const alumnosPaginados = alumnosFiltrados.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>Lista de Alumnos</Typography>
          <Typography variant="body2" sx={{ color: '#94a3b8' }}>
            Gestion centralizada de estudiantes y categorias.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant="contained"
            sx={{ bgcolor: '#f97316', fontWeight: 700, '&:hover': { bgcolor: '#ea580c' } }}
            startIcon={<PersonAddAlt1Icon />}
            onClick={() => navigate('/alumnos')}
          >
            Registrar Alumno
          </Button>
          <Button
            variant="outlined"
            sx={{ borderColor: '#e2e8f0', color: '#16a34a', fontWeight: 700 }}
            startIcon={<TableChartIcon />}
            onClick={handleDownloadExcel}
          >
            Excel
          </Button>
          <Button
            variant="outlined"
            sx={{ borderColor: '#e2e8f0', color: '#ef4444', fontWeight: 700 }}
            startIcon={<PictureAsPdfIcon />}
            onClick={handleDownloadPDF}
          >
            PDF
          </Button>
        </Box>
      </Box>
      <Box
        sx={{
          bgcolor: '#fff',
          border: '1px solid #eef0f3',
          borderRadius: 3,
          p: 2,
          mb: 2,
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: 'repeat(5, minmax(0, 1fr))' }
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', mb: 0.5 }}>NOMBRE</Typography>
          <TextField
            variant="outlined"
            size="small"
            placeholder="Filtrar por nombre"
            value={filtroNombre}
            onChange={e => setFiltroNombre(e.target.value)}
            sx={{ width: '100%', '& .MuiInputBase-input': { py: 0.8, fontSize: 13 } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start" sx={{ mr: 0.5 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                </InputAdornment>
              )
            }}
          />
        </Box>
        <Box>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', mb: 0.5 }}>APELLIDO</Typography>
          <TextField
            variant="outlined"
            size="small"
            placeholder="Filtrar por apellido"
            value={filtroApellido}
            onChange={e => setFiltroApellido(e.target.value)}
            sx={{ width: '100%', '& .MuiInputBase-input': { py: 0.8, fontSize: 13 } }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start" sx={{ mr: 0.5 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                </InputAdornment>
              )
            }}
          />
        </Box>
        <Box>
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', mb: 0.5 }}>FECHA</Typography>
          <TextField
            type="date"
            size="small"
            value={filtroFechaInscripcion}
            onChange={e => setFiltroFechaInscripcion(e.target.value)}
            sx={{ width: '100%', '& .MuiInputBase-input': { py: 0.8, fontSize: 13 } }}
            InputLabelProps={{ shrink: true }}
          />
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={incluirBajas}
                onChange={(e) => setIncluirBajas(e.target.checked)}
                color="primary"
              />
            }
            label="Incluir de baja"
            sx={{ color: '#64748b', '& .MuiFormControlLabel-label': { fontSize: 13 } }}
          />
        </Box>
      </Box>
      <Box sx={{ display: 'none' }} />
      {loading ? (
        <Typography>Cargando...</Typography>
      ) : error ? (
        <Typography color="error">{error}</Typography>
      ) : (
        <TableContainer
          component={Paper}
          sx={{
            borderRadius: 3,
            overflow: 'hidden',
            boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)'
          }}
        >
          <Table sx={{ minWidth: 780 }}>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f8fafc' }}>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>NOMBRE DEL ALUMNO</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>EDAD</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>SEDE</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>ESTADO</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>REPRESENTANTE</TableCell>
                <TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>ACCIONES</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {alumnosPaginados.map((alumno) => (
                <TableRow
                  key={alumno._id}
                  sx={{ '& td': { borderBottom: '1px solid #eef0f3', py: 2 }, '&:hover': { backgroundColor: '#fafafa' } }}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar
                        src={alumno.foto || ''}
                        alt={alumno.nombres}
                        sx={{ width: 38, height: 38, bgcolor: '#e0ecff', color: '#2563eb', fontWeight: 700 }}
                      >
                        {`${alumno.nombres?.[0] || ''}${alumno.apellidos?.[0] || ''}`.toUpperCase()}
                      </Avatar>
                      <Box>
                        <Typography sx={{ fontWeight: 700, color: '#0f172a', lineHeight: 1.1 }}>
                          {alumno.nombres} {alumno.apellidos}
                        </Typography>
                        <Typography sx={{ fontSize: 12, color: '#94a3b8' }}>
                          Fecha Nac: {formatFecha(alumno.fecha_nacimiento) || '-'}
                        </Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>{calcularEdad(alumno.fecha_nacimiento)}</TableCell>
                  <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>
                    {alumno.sede && typeof alumno.sede === 'object' ? alumno.sede.nombre : (alumno.sede || '-')}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={alumno.estado || '-'}
                      size="small"
                      sx={{ bgcolor: '#eef2ff', color: '#2563eb', fontWeight: 700 }}
                    />
                  </TableCell>
                  <TableCell sx={{ color: '#64748b', fontWeight: 600 }}>
                    {alumno.representante && typeof alumno.representante === 'object'
                      ? `${alumno.representante.nombres} ${alumno.representante.apellidos}`
                      : (alumno.representante || '-')}
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Ver detalles">
                      <IconButton aria-label="ver" size="small" sx={{ color: '#94a3b8', mr: 1 }} onClick={() => navigate(`/alumno/${alumno._id}`)}>
                        <VisibilityIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Editar">
                      <IconButton aria-label="editar" size="small" sx={{ color: '#94a3b8', mr: 1 }} onClick={() => navigate(`/alumno/editar/${alumno._id}`)}>
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Dar de baja">
                      <IconButton aria-label="dar de baja" size="small" sx={{ color: '#94a3b8', mr: 1 }} onClick={() => setBajaId(alumno._id)}>
                        <PersonOffIcon />
                      </IconButton>
                    </Tooltip>
                    {(alumno.dado_de_baja || alumno.activo === false) && (
                      <Tooltip title="Reactivar">
                        <IconButton aria-label="reactivar" size="small" sx={{ color: '#2e7d32', mr: 1 }} onClick={() => setReactivarId(alumno._id)}>
                          <ReplayIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title="Eliminar">
                      <IconButton aria-label="eliminar" size="small" sx={{ color: '#94a3b8' }} onClick={() => setDeleteId(alumno._id)}>
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Gestionar reposos">
                      <IconButton
                        aria-label="gestionar reposos"
                        size="small"
                        sx={{ color: '#94a3b8', ml: 1 }}
                        onClick={() => navigate(`/alumno/reposos/${alumno._id}`)}
                      >
                        <LocalHospitalIcon />
                      </IconButton>
                    </Tooltip>
                    {alumno.foto_cedula && (
                      <Tooltip title="Descargar cédula">
                        <IconButton
                          aria-label="descargar cédula"
                          size="small"
                          sx={{ color: '#94a3b8', ml: 1 }}
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = alumno.foto_cedula;
                            link.download = `cedula_${alumno.nombres}_${alumno.apellidos}.jpg`;
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);
                          }}
                        >
                          <DownloadIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Dialog open={!!deleteId} onClose={() => setDeleteId(null)}>
                      <DialogTitle>¿Eliminar alumno?</DialogTitle>
                      <DialogContent>¿Estás seguro de que deseas eliminar este alumno? Esta acción no se puede deshacer.</DialogContent>
                      <DialogActions>
                        <Button onClick={() => setDeleteId(null)} disabled={deleteLoading}>Cancelar</Button>
                        <Button onClick={handleDeleteAlumno} color="error" variant="contained" disabled={deleteLoading}>
                          {deleteLoading ? 'Eliminando...' : 'Eliminar'}
                        </Button>
                      </DialogActions>
                    </Dialog>
                    <Dialog
                      open={!!bajaId}
                      onClose={() => setBajaId(null)}
                      BackdropProps={{ sx: { backgroundColor: 'rgba(255, 255, 255, 0.08)', backdropFilter: 'blur(4px)' } }}
                    >
                      <DialogTitle>¿Dar de baja al alumno?</DialogTitle>
                      <DialogContent>Confirma si deseas dar de baja al alumno. Esta acción se puede revertir.</DialogContent>
                      <DialogActions>
                        <Button onClick={() => setBajaId(null)} disabled={bajaLoading}>Cancelar</Button>
                        <Button onClick={handleBajaAlumno} style={loading ? { opacity: 0.6, pointerEvents: 'none' } : {}} variant="contained" disabled={bajaLoading}>
                          {bajaLoading ? 'Procesando...' : 'Dar de baja'}
                        </Button>
                      </DialogActions>
                    </Dialog>
                    <Dialog open={!!reactivarId} onClose={() => setReactivarId(null)}>
                      <DialogTitle>¿Reactivar alumno?</DialogTitle>
                      <DialogContent>Confirma si deseas reactivar al alumno.</DialogContent>
                      <DialogActions>
                        <Button onClick={() => setReactivarId(null)} disabled={reactivarLoading}>Cancelar</Button>
                        <Button onClick={handleReactivarAlumno} style={loading ? { opacity: 0.6, pointerEvents: 'none' } : {}} variant="contained" disabled={reactivarLoading}>
                          {reactivarLoading ? 'Procesando...' : 'Reactivar'}
                        </Button>
                      </DialogActions>
                    </Dialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={alumnosFiltrados.length}
            page={page}
            onPageChange={handleChangePage}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[5, 10, 25]}
            labelRowsPerPage="Filas por página:"
          />
        </TableContainer>
      )}
      <Snackbar open={deleteSuccess.open} autoHideDuration={2500} onClose={() => setDeleteSuccess({ open: false, message: '' })} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <MuiAlert onClose={() => setDeleteSuccess({ open: false, message: '' })} severity="success" sx={{ width: '100%' }}>
          {deleteSuccess.message}
        </MuiAlert>
      </Snackbar>
      <Snackbar open={bajaSuccess.open} autoHideDuration={2500} onClose={() => setBajaSuccess({ open: false, message: '' })} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <MuiAlert onClose={() => setBajaSuccess({ open: false, message: '' })} severity="success" sx={{ width: '100%' }}>
          {bajaSuccess.message}
        </MuiAlert>
      </Snackbar>
      <Snackbar open={reactivarSuccess.open} autoHideDuration={2500} onClose={() => setReactivarSuccess({ open: false, message: '' })} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <MuiAlert onClose={() => setReactivarSuccess({ open: false, message: '' })} severity="success" sx={{ width: '100%' }}>
          {reactivarSuccess.message}
        </MuiAlert>
      </Snackbar>
    </Box>
  );
}

export default TablaAlumnos;
