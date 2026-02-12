
import React, { useState, useRef, useEffect } from 'react';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import { useSede } from '../context/SedeContext';
import { useNavigate } from 'react-router-dom';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import { MenuItem, FormControl, InputLabel, Select, TextField, Autocomplete, CircularProgress, Checkbox, FormControlLabel, InputAdornment, Box, Paper, Typography, Switch } from '@mui/material';
import './Alumnos.css';

// ...existing code...
// Opciones de parentesco para el representante
const PARENTESCOS = [
  'Padre',
  'Madre',
  'Hermano/a',
  'Tío/a',
  'Abuelo/a',
  'Otro'
];


// Opciones de tipo de mensualidad
export const OPCIONES_MENSUALIDAD = [
  { id: 'monto_sede', label: 'Monto sede' },
  { id: 'monto_personalizado', label: 'Monto personalizado' },
  { id: 'beca_completa', label: 'Beca completa' }
];

// Estados permitidos para mensualidad
const ESTADOS_MENSUALIDAD = ['Pendiente', 'Pagado', 'Retrasado', 'Exonerado'];


function Alumnos() {
  // Estado para el formulario
  const [form, setForm] = useState({
    fecha_inscripcion: new Date().toISOString().split('T')[0],
    tipo_mensualidad: 'monto_sede',
    numero_franela: '',
    habilitar_pago_cuotas: false,
    etiquetas: [],
  });
  // Estado para ocultar datos de representante
  const [sinRepresentante, setSinRepresentante] = useState(false);
  // Estado para controlar búsqueda de representante
  const [buscandoRep, setBuscandoRep] = useState(false);
  const [opcionesRepresentantes, setOpcionesRepresentantes] = useState([]);
  const [loadingOpciones, setLoadingOpciones] = useState(false);

  // Buscar representante por cédula

  // Buscar representantes que coincidan con la cédula tipeada
  const buscarOpcionesRepresentantes = async (cedula) => {
    if (!cedula || cedula.length < 4) {
      setOpcionesRepresentantes([]);
      return;
    }
    setLoadingOpciones(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/representantes?cedula=${cedula}`);
      if (!res.ok) throw new Error('Error buscando representantes');
      const data = await res.json();
      setOpcionesRepresentantes(data.filter(r => r.cedula.includes(cedula)));
    } catch (err) {
      setOpcionesRepresentantes([]);
    } finally {
      setLoadingOpciones(false);
    }
  };
  const { sedeSeleccionada } = useSede();
  const [preview, setPreview] = useState(null);
  const [previewCedula, setPreviewCedula] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  // Sincronizar sinRepresentante con form al montar o cuando form cambia
  useEffect(() => {
    setSinRepresentante(!!form.sinRepresentante);
  }, [form.sinRepresentante]);
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoCedulaFile, setFotoCedulaFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [cedulaDuplicada, setCedulaDuplicada] = useState(false);
  const [cedulaCheckLoading, setCedulaCheckLoading] = useState(false);
  const [cedulaCheckMsg, setCedulaCheckMsg] = useState('');
  // Estados para la primera mensualidad
  const [showMensualidadModal, setShowMensualidadModal] = useState(false);
  const [nuevoAlumnoId, setNuevoAlumnoId] = useState(null);
  const [montoMensualidad, setMontoMensualidad] = useState('');
  const [loadingMensualidad, setLoadingMensualidad] = useState(false);
  const [errorMensualidad, setErrorMensualidad] = useState(null);
  const [estadoMensualidad, setEstadoMensualidad] = useState('Pendiente');
  // const [sedes, setSedes] = useState([]); // Eliminado porque no se usa
  const [categoria, setCategoria] = useState('');
  const navigate = useNavigate();
    // Calcular categoría automáticamente
    useEffect(() => {
      if (form.fecha_nacimiento) {
        const anioNacimiento = parseInt(form.fecha_nacimiento.substring(0, 4));
        const anioActual = new Date().getFullYear();
        const edadDeportiva = anioActual - anioNacimiento;
        let cat = '';
        if (edadDeportiva <= 11) cat = 'U11';
        else if (edadDeportiva <= 13) cat = 'U13';
        else if (edadDeportiva <= 15) cat = 'U15';
        else if (edadDeportiva <= 17) cat = 'U17';
        else cat = 'MAYORES / LIBRE';
        setCategoria(cat);
        setForm(prev => ({ ...prev, categoria: cat }));
      } else {
        setCategoria('');
        setForm(prev => ({ ...prev, categoria: '' }));
      }
    }, [form.fecha_nacimiento]);
  useEffect(() => {
    if (success && !showMensualidadModal) {
      const timer = setTimeout(() => {
        navigate('/tabla-alumnos');
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [success, showMensualidadModal, navigate]);
  useEffect(() => {
    let cancelled = false;
    const cedula = (form.cedula || '').trim();
    const sedeId = form.sede?._id || '';
    if (!cedula || !sedeId || cedula.length < 4) {
      setCedulaDuplicada(false);
      setCedulaCheckLoading(false);
      setCedulaCheckMsg('');
      return undefined;
    }
    const timer = setTimeout(async () => {
      setCedulaCheckLoading(true);
      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos?incluirBajas=1`);
        if (!res.ok) throw new Error('Error buscando alumnos');
        const data = await res.json();
        const existe = Array.isArray(data) && data.some(a => {
          const alumnoCedula = (a.cedula || '').trim();
          const alumnoSede = a.sede && typeof a.sede === 'object' ? a.sede._id : a.sede;
          return alumnoCedula === cedula && String(alumnoSede || '') === String(sedeId);
        });
        if (!cancelled) {
          setCedulaDuplicada(!!existe);
          setCedulaCheckMsg(existe ? 'Ya existe un alumno con esta cédula en la sede seleccionada.' : '');
        }
      } catch (err) {
        if (!cancelled) {
          setCedulaDuplicada(false);
          setCedulaCheckMsg('');
        }
      } finally {
        if (!cancelled) setCedulaCheckLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.cedula, form.sede?._id]);
  // Al montar, establecer la sede desde el contexto o localStorage
  useEffect(() => {
    let sede = sedeSeleccionada;
    if (!sede) {
      const stored = localStorage.getItem('sedeSeleccionada');
      sede = stored ? JSON.parse(stored) : '';
    }
    if (sede && sede._id && sede.nombre) {
      setForm(prev => ({ ...prev, sede: { _id: sede._id, nombre: sede.nombre } }));
    }
  }, [sedeSeleccionada]);
  const inputRef = useRef(null);
  const inputCedulaRef = useRef(null);

  const handleFotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result);
      };
      reader.readAsDataURL(file);
    } else {
      setFotoFile(null);
      setPreview(null);
    }
  };

  const handleFotoCedulaChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFotoCedulaFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewCedula(reader.result);
      };
      reader.readAsDataURL(file);
    } else {
      setFotoCedulaFile(null);
      setPreviewCedula(null);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFotoChange({ target: { files: e.dataTransfer.files } });
    }
  };

  const handleClick = () => {
    inputRef.current.click();
  };
  const handleClickCedula = () => {
    inputCedulaRef.current.click();
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (name === 'sinRepresentante') {
      setSinRepresentante(checked);
      setForm((prev) => ({ ...prev, sinRepresentante: checked }));
    } else if (name === 'habilitar_pago_cuotas') {
      setForm((prev) => ({ ...prev, habilitar_pago_cuotas: checked }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  // Función para registrar la primera mensualidad (mover antes del return)
  // Ahora registrarPrimeraMensualidad crea el alumno y luego la mensualidad
  const registrarPrimeraMensualidad = async () => {
    setLoadingMensualidad(true);
    setErrorMensualidad(null);
    if (cedulaDuplicada) {
      setErrorMensualidad('Ya existe un alumno con esta cédula en la sede seleccionada.');
      setLoadingMensualidad(false);
      return;
    }
    try {
      // 1. Crear alumno
      const formData = buildAlumnoFormData(form, fotoFile, fotoCedulaFile);
      const resAlumno = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos`, {
        method: 'POST',
        body: formData
      });
      if (!resAlumno.ok) {
        let errMsg = 'Error al registrar alumno';
        try {
          const errData = await resAlumno.json();
          errMsg = errData.detalle || errData.error || errMsg;
        } catch {}
        throw new Error(errMsg);
      }
      const dataAlumno = await resAlumno.json();
      // 2. Registrar mensualidad
      const resMens = await fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades/primera`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_alumno: dataAlumno._id,
          monto_esperado: montoMensualidad,
          estatus: estadoMensualidad
        })
      });
      if (!resMens.ok) {
        const errData = await resMens.json();
        throw new Error(errData.error || 'Error al registrar mensualidad');
      }
      setShowMensualidadModal(false);
      setMontoMensualidad('');
      setEstadoMensualidad('Pendiente');
      resetAlumnoForm();
      setSuccess(true);
    } catch (err) {
      setErrorMensualidad(err.message);
    } finally {
      setLoadingMensualidad(false);
    }
  };

  // --- Utilidades para evitar repetición de código ---
  function buildAlumnoFormData(form, fotoFile, fotoCedulaFile) {
    const formData = new FormData();
        let cleanForm = { ...form };
        if (cleanForm.tipo_mensualidad !== 'monto_personalizado') {
          delete cleanForm.monto_personalizado_valor;
        }
    Object.entries(cleanForm).forEach(([key, value]) => {
      if (typeof value === 'object' && value !== null) {
        formData.append(key, JSON.stringify(value));
      } else {
        formData.append(key, value);
      }
    });
    if (fotoFile) {
      formData.append('foto', fotoFile);
    }
    if (fotoCedulaFile) {
      formData.append('foto_cedula', fotoCedulaFile);
    }
    return formData;
  }

  function resetAlumnoForm() {
      setForm({
        fecha_inscripcion: new Date().toISOString().split('T')[0],
        tipo_mensualidad: 'monto_sede',
        numero_franela: '',
        habilitar_pago_cuotas: false,
        etiquetas: [],
      });
      setPreview(null);
      setFotoFile(null);
      setPreviewCedula(null);
      setFotoCedulaFile(null);
      setTimeout(() => {
        navigate('/tabla-alumnos');
      }, 1200);
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (cedulaDuplicada) {
      setError('Ya existe un alumno con esta cédula en la sede seleccionada.');
      return;
    }

    // Validación de campos obligatorios
    const requiredFields = [
      {key: 'fecha_inscripcion', label: 'Fecha de inscripción' },
      { key: 'nombres', label: 'Nombres del alumno' },
      { key: 'apellidos', label: 'Apellidos del alumno' },
      { key: 'sede', label: 'Sede' },
    ];
    // Solo pedir datos de representante si NO está tildado sinRepresentante
    if (!sinRepresentante) {
      requiredFields.push(
        { key: 'rep_nombres', label: 'Nombres del representante' },
        { key: 'rep_apellidos', label: 'Apellidos del representante' },
        { key: 'rep_cedula', label: 'Cédula del representante' },
        { key: 'parentesco', label: 'Parentesco' }
      );
    }
    const faltantes = requiredFields.filter(f => {
      const value = form[f.key];
      if (value === undefined || value === null) return true;
      if (typeof value === 'string') return value.trim() === '';
      // Si es objeto (como sede), verificar que tenga datos
      if (typeof value === 'object') {
        if (f.key === 'sede') {
          return !value._id || !value.nombre;
        }
        return false;
      }
      return false;
    });
    if (faltantes.length > 0) {
      setError('Completa los campos obligatorios: ' + faltantes.map(f => f.label).join(', '));
      return;
    }

    if (form.numero_franela) {
      const nro = Number(form.numero_franela);
      if (Number.isNaN(nro) || nro < 1 || nro > 100) {
        setError('El nro de franela debe estar entre 1 y 100.');
        return;
      }
    }

    // Si es beca completa, registrar el alumno directamente
    console.log('Tipo de mensualidad seleccionado:', form.tipo_mensualidad);
    if (form.tipo_mensualidad === 'beca_completa') {
      setLoading(true);
      try {
        const formData = buildAlumnoFormData(form, fotoFile, fotoCedulaFile);
        const resAlumno = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos`, {
          method: 'POST',
          body: formData
        });
        if (!resAlumno.ok) {
          let errMsg = 'Error al registrar alumno';
          try {
            const errData = await resAlumno.json();
            errMsg = errData.detalle || errData.error || errMsg;
          } catch {}
          throw new Error(errMsg);
        }
        resetAlumnoForm();
        setSuccess(true);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    } else {
      setShowMensualidadModal(true);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f1f5f9', py: { xs: 2, md: 3 } }}>
      <Box
        sx={{
          mx: 'auto',
          px: { xs: 1.5, sm: 2.5, md: 3 }
        }}
      >
        <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a', mb: 2 }}>
          Registro de Alumno
        </Typography>
        <Box
          component="form"
          className="alumnos-form"
          onSubmit={handleSubmit}
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(12, minmax(0, 1fr))' },
            gap: { xs: 2, md: 3 },
            alignItems: 'start'
          }}
        >
          <Box
            sx={{
              gridColumn: { xs: '1 / -1', md: 'span 4' },
              position: { md: 'sticky' },
              top: 24,
              alignSelf: 'start',
              display: 'grid',
              gap: 2
            }}
          >
            <Paper sx={{ p: 2.5, borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
                <Box
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={handleClick}
                  sx={{
                    width: 140,
                    height: 140,
                    borderRadius: '50%',
                    border: '2px solid',
                    borderColor: dragActive ? '#f97316' : '#e2e8f0',
                    bgcolor: '#f8fafc',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    boxShadow: '0 6px 16px rgba(15, 23, 42, 0.08)'
                  }}
                >
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFotoChange}
                    ref={inputRef}
                    style={{ display: 'none' }}
                  />
                  {preview ? (
                    <img src={preview} alt="Foto del alumno" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <Typography sx={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textAlign: 'center', px: 2 }}>
                      Subir foto
                    </Typography>
                  )}
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography sx={{ fontWeight: 700, color: '#0f172a' }}>Foto del alumno</Typography>
                  <Typography sx={{ fontSize: 12, color: '#64748b' }}>Arrastra o haz clic para cambiar</Typography>
                </Box>
              </Box>
            </Paper>

            <Paper sx={{ p: 2.5, borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
              <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', letterSpacing: '0.04em', mb: 1 }}>
                CEDULA DE IDENTIDAD
              </Typography>
              <Box
                onClick={handleClickCedula}
                sx={{
                  border: '1.5px dashed #cbd5f5',
                  borderRadius: 2.5,
                  bgcolor: '#f8fafc',
                  px: 2,
                  py: 2.5,
                  textAlign: 'center',
                  cursor: 'pointer'
                }}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFotoCedulaChange}
                  ref={inputCedulaRef}
                  style={{ display: 'none' }}
                />
                {previewCedula ? (
                  <img src={previewCedula} alt="Foto de la cédula" style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 10 }} />
                ) : (
                  <Box sx={{ display: 'grid', gap: 0.5 }}>
                    <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Adjunta foto de la cédula</Typography>
                    <Typography sx={{ fontSize: 11, color: '#94a3b8' }}>JPG o PNG, max 5MB</Typography>
                  </Box>
                )}
              </Box>
            </Paper>

            <Paper sx={{ p: 2.5, borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Habilitar pago en cuotas</Typography>
                <FormControlLabel
                  sx={{ m: 0 }}
                  control={
                    <Switch
                      checked={!!form.habilitar_pago_cuotas}
                      onChange={handleChange}
                      name="habilitar_pago_cuotas"
                      color="primary"
                    />
                  }
                  label=""
                />
              </Box>
            </Paper>
          </Box>

          <Box
            sx={{
              gridColumn: { xs: '1 / -1', md: 'span 8' },
              display: 'grid',
              gap: 2,
              width: '100%'
            }}
          >
            <fieldset style={{ border: 'none', borderRadius: 16, padding: 20, background: '#ffffff', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
          <legend>Datos del Alumno</legend>
          <div className="form-row">
            <TextField
              id="outlined-basic-fecha-inscripcion"
              label="Fecha de inscripción *"
              name="fecha_inscripcion"
              type="date"
              variant="outlined"
              value={form.fecha_inscripcion || ''}
              onChange={handleChange}
              fullWidth
              size="small"
              InputLabelProps={{ shrink: true }}
              sx={{ my: 1 }}
            />
            <TextField
              id="outlined-basic-numero-franela"
              label="Nro de franela"
              name="numero_franela"
              type="number"
              variant="outlined"
              value={form.numero_franela || ''}
              onChange={handleChange}
              fullWidth
              size="small"
              sx={{ my: 1 }}
              inputProps={{ min: 1, max: 100 }}
            />
          </div>
          <div className="form-row">
            <TextField id="outlined-basic-nombres" label="Nombres *" name="nombres" variant="outlined" value={form.nombres || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
            <TextField id="outlined-basic-apellidos" label="Apellidos *" name="apellidos" variant="outlined" value={form.apellidos || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
          </div>
          <div className="form-row">
            <TextField id="outlined-basic-fecha-nacimiento" label="Fecha de nacimiento" name="fecha_nacimiento" type="date" variant="outlined" value={form.fecha_nacimiento || ''} onChange={handleChange} fullWidth size="small" InputLabelProps={{ shrink: true }} sx={{ my: 1 }} />
            <TextField id="outlined-basic-categoria" disabled label="Categoría asignada" name="categoria" variant="outlined" value={categoria} InputProps={{ readOnly: true }} fullWidth size="small" helperText="Se asigna automáticamente" sx={{ my: 1 }} />
          </div>
          <div className="form-row">
            <TextField
              id="outlined-basic-cedula"
              label="Cédula"
              name="cedula"
              variant="outlined"
              value={form.cedula || ''}
              onChange={handleChange}
              fullWidth
              size="small"
              error={cedulaDuplicada}
              helperText={cedulaDuplicada ? cedulaCheckMsg : (cedulaCheckLoading ? 'Verificando cédula...' : '')}
              sx={{ my: 1 }}
            />
            <FormControl fullWidth sx={{ my: 1 }}>
              <InputLabel id="monto-personalizado-label">Tipo de monto mensualidad</InputLabel>
              <Select
                labelId="monto-personalizado-label"
                id="select-monto-personalizado"
                name="tipo_mensualidad"
                value={form.tipo_mensualidad}
                label="Tipo de monto mensualidad"
                onChange={handleChange}
              >
                {OPCIONES_MENSUALIDAD.map(op => (
                  <MenuItem key={op.id} value={op.id}>{op.label}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {form.tipo_mensualidad === 'monto_personalizado' && (
              <TextField
                id="input-monto-personalizado"
                label="Monto personalizado"
                name="monto_personalizado_valor"
                type="number"
                variant="outlined"
                value={form.monto_personalizado_valor || ''}
                onChange={handleChange}
                fullWidth
                size="small"
                sx={{ mt: 1 }}
              />
            )}
          </div>
          
          <div className="form-row">
            <FormControl fullWidth required style={{ minWidth: 180, marginRight: 8 }} sx={{ my: 1 }}>
              <InputLabel id="sede-label">Sede</InputLabel>
                <Select
                  labelId="sede-label"
                  id="sede"
                  name="sede"
                  value={form.sede?.nombre || ''}
                  label="Sede"
                  disabled
                  renderValue={(value) => typeof value === 'object' ? value.nombre : value}
                >
                  {/* Solo mostrar la sede seleccionada, sin opciones */}
                  {form.sede?.nombre && <MenuItem value={form.sede.nombre}>{form.sede.nombre}</MenuItem>}
                </Select>
            </FormControl>
            <TextField id="outlined-basic-telefono" label="Teléfono" name="telefono" type="tel" variant="outlined" value={form.telefono || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
          </div>
          <div className="form-row">
             <TextField id="outlined-basic-domicilio" label="Domicilio" name="domicilio" variant="outlined" value={form.domicilio || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }}/>
            <TextField id="outlined-basic-peso" InputProps={{ endAdornment: <InputAdornment position="end">kg</InputAdornment> }} label="Peso" name="peso" variant="outlined" value={form.peso || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
          </div>
          <div className="form-row">
            <TextField id="outlined-basic-talla" InputProps={{ endAdornment: <InputAdornment position="end">m</InputAdornment> }} label="Talla" name="talla" variant="outlined" value={form.talla || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
            <TextField id="outlined-basic-proyeccion" label="Proyección" name="proyeccion" variant="outlined" value={form.proyeccion || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
          </div>
          <div className="form-row">
            <TextField id="outlined-basic-alcance" InputProps={{ endAdornment: <InputAdornment position="end">m</InputAdornment> }} label="Alcance" name="alcance" variant="outlined" value={form.alcance || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
            <TextField id="outlined-basic-envergadura" label="Envergadura" name="envergadura" variant="outlined" value={form.envergadura || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
          </div>
          <div className="form-row">
            <TextField id="outlined-basic-tipo-sangre" label="Tipo de sangre" name="tipo_sangre" variant="outlined" value={form.tipo_sangre || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
           <TextField id="outlined-basic-antecedentes" label="Antecedentes patológicos" name="antecedentes_patologicos" variant="outlined" value={form.antecedentes_patologicos || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
          </div>
          <div className="form-row">
            <TextField id="outlined-basic-alergias" label="Alergias" name="alergias" variant="outlined" value={form.alergias || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
            <TextField id="outlined-basic-observaciones" label="Observaciones" name="observaciones" variant="outlined" value={form.observaciones || ''} onChange={handleChange} fullWidth size="small" multiline minRows={2} sx={{ my: 1 }} />
          </div>
          <div className="form-row">
            <Autocomplete
              multiple
              freeSolo
              options={[]}
              value={form.etiquetas || []}
              onChange={(event, newValue) => {
                setForm(prev => ({ ...prev, etiquetas: newValue }));
              }}
              sx={{ width: '49%' }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Etiquetas"
                  placeholder="Escribe y presiona Enter"
                  variant="outlined"
                  fullWidth
                  size="small"
                  multiline
                  sx={{ my: 1 }}
                />
              )}
            />
          </div>
        </fieldset>
            <Paper sx={{ p: 2.5, borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={sinRepresentante}
                    onChange={handleChange}
                    name="sinRepresentante"
                    color="primary"
                  />
                }
                label="No aplica datos del representante"
              />
            </Paper>
        {!sinRepresentante && (
        <fieldset style={{ border: 'none', borderRadius: 16, padding: 20, background: '#ffffff', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
          <legend>Datos del Representante</legend>
          <div className="form-row">
            <Autocomplete
              freeSolo
              id="autocomplete-rep-cedula"
              options={opcionesRepresentantes}
              getOptionLabel={option => option.cedula ? `${option.cedula} - ${option.nombres} ${option.apellidos}` : ''}
              inputValue={form.rep_cedula || ''}
              onInputChange={(event, newInputValue, reason) => {
                // Si el usuario escribe, solo setea el texto
                if (reason === 'input') {
                  setForm(prev => ({ ...prev, rep_cedula: newInputValue }));
                  buscarOpcionesRepresentantes(newInputValue);
                }
                // Si selecciona una opción, setea solo la cédula
                if (reason === 'reset' && newInputValue) {
                  const cedulaSolo = newInputValue.split(' - ')[0];
                  setForm(prev => ({ ...prev, rep_cedula: cedulaSolo }));
                }
              }}
              onChange={(event, value) => {
                if (value && value.cedula) {
                  setForm(prev => ({
                    ...prev,
                    rep_cedula: value.cedula,
                    rep_nombres: value.nombres,
                    rep_apellidos: value.apellidos,
                    rep_telefono: value.telefono,
                  }));
                }
              }}
              loading={loadingOpciones}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Cédula del representante *"
                  name="rep_cedula"
                  variant="outlined"
                  fullWidth
                  size="medium"
                  sx={{ my: 1, minWidth: 250}}
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {loadingOpciones ? <CircularProgress color="inherit" size={18} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    )
                  }}
                />
              )}
            />
          </div>
          <div className="form-row">
            <TextField id="outlined-basic-rep-nombres" label="Nombres del representante *" name="rep_nombres" variant="outlined" value={form.rep_nombres || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }}/>
            <TextField id="outlined-basic-rep-apellidos" label="Apellidos del representante *" name="rep_apellidos" variant="outlined" value={form.rep_apellidos || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }}/>
          </div>
          <div className="form-row"> 
            <TextField id="outlined-basic-rep-telefono" label="Teléfono del representante" name="rep_telefono" type="tel" variant="outlined" value={form.rep_telefono || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }}/>
            <FormControl fullWidth size="small" sx={{ my: 1 }}>
              <InputLabel id="select-parentesco-label">Parentesco *</InputLabel>
              <Select
                labelId="select-parentesco-label"
                id="select-parentesco"
                name="parentesco"
                value={form.parentesco || ''}
                label="Parentesco *"
                onChange={handleChange}
                required
              >
                {PARENTESCOS.map((op) => (
                  <MenuItem key={op} value={op}>{op}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </div>
        </fieldset>
        )}
            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    minWidth: 200,
                    maxWidth: 300,
                    width: '100%',
                    opacity: loading ? 0.6 : 1,
                    pointerEvents: loading ? 'none' : 'auto',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '12px 0',
                    fontSize: 18,
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
                  }}
                >
                  {loading ? 'Registrando...' : 'Registrar Alumno'}
                </button>
              </div>
            </div>
            {error && <div className="error-message">{error}</div>}
          </Box>
        </Box>
      <Dialog open={!!success} onClose={() => {}} disableEscapeKeyDown>
        <DialogTitle sx={{ textAlign: 'center', pb: 0 }}>
          <CheckCircleIcon color="success" sx={{ fontSize: 60, mb: 1 }} />
        </DialogTitle>
        <DialogContent sx={{ textAlign: 'center' }}>
          Alumno registrado correctamente
        </DialogContent>
      </Dialog>

      {/* Modal para registrar la primera mensualidad */}
      <Dialog open={!!showMensualidadModal} onClose={() => setShowMensualidadModal(false)}>
        <DialogTitle>Registrar primera mensualidad</DialogTitle>
        <DialogContent>
          <TextField
            label="Monto"
            type="number"
            value={montoMensualidad}
            onChange={e => setMontoMensualidad(e.target.value)}
            fullWidth
            sx={{ my: 2 }}
          />
          <FormControl fullWidth sx={{ my: 2 }}>
            <InputLabel id="estado-label">Estado</InputLabel>
            <Select
              labelId="estado-label"
              value={estadoMensualidad}
              label="Estado"
              onChange={e => setEstadoMensualidad(e.target.value)}
            >
              {ESTADOS_MENSUALIDAD.map(e => (
                <MenuItem key={e} value={e}>{e}</MenuItem>
              ))}
            </Select>
          </FormControl>
          {errorMensualidad && <div style={{ color: 'red', marginBottom: 8 }}>{errorMensualidad}</div>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowMensualidadModal(false)} disabled={loadingMensualidad}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={registrarPrimeraMensualidad}
            disabled={!montoMensualidad || loadingMensualidad}
          >
            {loadingMensualidad ? 'Registrando...' : 'Registrar'}
          </Button>
        </DialogActions>
      </Dialog>
      </Box>
    </Box>
  );
}

export default Alumnos;
