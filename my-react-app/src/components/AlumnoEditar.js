import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Button, TextField, Typography, Dialog, DialogTitle, DialogContent, DialogActions, FormControl, InputLabel, Select, MenuItem, Paper, FormControlLabel, Autocomplete, Box, Switch, Snackbar, Alert, AlertTitle } from '@mui/material';
import { OPCIONES_MENSUALIDAD } from './Alumnos';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useSede } from '../context/SedeContext';
import { mediaUrl } from '../utils/mediaUrl';
import { getCategoriaPorFechaNacimiento, CATEGORIAS_DISPONIBLES } from '../utils/categoria';
import './Alumnos.css';
import { Accordion, AccordionSummary, AccordionDetails, List, ListItem, ListItemText } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

const ESTADOS_MENSUALIDAD = ['Pendiente', 'Pagado', 'Retrasado', 'Exonerado'];
const PARENTESCOS = ['Padre', 'Madre', 'Hermano/a', 'Tío/a', 'Abuelo/a', 'Otro'];
const TIPOS_SANGRE = ['O+', 'A+', 'B+', 'O-', 'A-', 'AB+', 'B-', 'AB-', 'Por determinar / Desconocido'];
const SEXOS = ['Femenino', 'Masculino'];
const DIVISIONES = ['Primera división', 'Segunda división', 'Tercera división'];
const ANIO_ACTUAL = new Date().getFullYear();
const FECHA_INICIO_COBRO_MIN = `${ANIO_ACTUAL}-01-01`;
const FECHA_INICIO_COBRO_MAX = `${ANIO_ACTUAL}-12-31`;

function esFechaInicioCobroDelAnioActual(valor) {
  const raw = String(valor || '').trim();
  if (!raw) return false;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  return Number(match[1]) === ANIO_ACTUAL;
}

function AlumnoEditar({ locationState }) {
  const { id } = useParams();
  const { sedeSeleccionada } = useSede();
  const token = localStorage.getItem('token');
  const rolActual = String(localStorage.getItem('rol') || '').trim().toLowerCase();
  const esAdmin = rolActual === 'admin' || rolActual === 'super_admin';
  const [form, setForm] = useState({
    fecha_inicio_cobro: new Date().toISOString().split('T')[0],
    tipo_mensualidad: 'monto_sede',
    numero_franela: '',
    habilitar_pago_cuotas: false,
    aplicar_recargo_mensualidad: true,
    dia_limite_personalizado: '',
    etiquetas: [],
  });
  const [requisitosBaseAcademia, setRequisitosBaseAcademia] = useState([]);
  const [preview, setPreview] = useState(null);
  const [previewCedula, setPreviewCedula] = useState(null);
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoCedulaFile, setFotoCedulaFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [successOpen, setSuccessOpen] = useState(false);
  const [initialMensualidadConfig, setInitialMensualidadConfig] = useState({
    tipo_mensualidad: 'monto_sede',
    monto_personalizado_valor: ''
  });
  const [categoria, setCategoria] = useState('');
  const [numeroFranelaDuplicado, setNumeroFranelaDuplicado] = useState(false);
  const [numeroFranelaCheckLoading, setNumeroFranelaCheckLoading] = useState(false);
  const [numeroFranelaCheckMsg, setNumeroFranelaCheckMsg] = useState('');
  const [sedesDisponibles, setSedesDisponibles] = useState([]);
  const [numerosFranelaDisponibles, setNumerosFranelaDisponibles] = useState([]);
  const [numerosFranelaOcupados, setNumerosFranelaOcupados] = useState([]);
  const inputRef = useRef(null);
  const inputCedulaRef = useRef(null);

  const hidratarFormularioAlumno = (data) => {
    let { representante, ...rest } = data;
    if (rest.fecha_nacimiento) {
      rest.fecha_nacimiento = rest.fecha_nacimiento.slice(0, 10);
    }
    if (rest.fecha_inscripcion) {
      rest.fecha_inscripcion = rest.fecha_inscripcion.slice(0, 10);
    }
    if (rest.fecha_inicio_cobro) {
      rest.fecha_inicio_cobro = rest.fecha_inicio_cobro.slice(0, 10);
    } else {
      rest.fecha_inicio_cobro = new Date().toISOString().split('T')[0];
    }
    let formData = { ...rest };
    if (representante) {
      formData = {
        ...formData,
        rep_nombres: representante.nombres || '',
        rep_apellidos: representante.apellidos || '',
        rep_cedula: representante.cedula || '',
        rep_telefono: representante.telefono || '',
        rep_fecha_nacimiento: representante.fecha_nacimiento ? String(representante.fecha_nacimiento).slice(0, 10) : '',
        rep_correo: representante.correo || '',
        rep_direccion: representante.direccion || representante.domicilio || ''
      };
    }
    if (formData.dia_limite_personalizado === undefined || formData.dia_limite_personalizado === null) {
      formData.dia_limite_personalizado = '';
    }
    setForm(formData);
    setInitialMensualidadConfig({
      tipo_mensualidad: formData.tipo_mensualidad || 'monto_sede',
      monto_personalizado_valor: formData.monto_personalizado_valor ?? ''
    });
    if (data.foto) setPreview(mediaUrl(data.foto));
    if (data.foto_cedula) setPreviewCedula(mediaUrl(data.foto_cedula));
  };

  const fetchAlumnoFresco = async () => {
    const url = `${process.env.REACT_APP_API_URL}/api/alumnos/${id}?_t=${Date.now()}`;
    const res = await fetch(url, {
      cache: 'no-store',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    if (!res.ok) throw new Error('Error al obtener alumno');
    const data = await res.json();
    console.log('Alumno obtenido del API:', data);
    hidratarFormularioAlumno(data);
    return data;
  };

  const tipoMensualidadActual = form.tipo_mensualidad || 'monto_sede';
  const montoPersonalizadoActual = form.monto_personalizado_valor ?? '';
  const cambioTipoMensualidad = tipoMensualidadActual !== (initialMensualidadConfig.tipo_mensualidad || 'monto_sede');
  const cambioMontoPersonalizado =
    String(montoPersonalizadoActual || '').trim() !== String(initialMensualidadConfig.monto_personalizado_valor || '').trim();
  const debeMostrarAvisoRecalculoMensualidades =
    cambioTipoMensualidad || (tipoMensualidadActual === 'monto_personalizado' && cambioMontoPersonalizado);

  useEffect(() => {
    let mounted = true;

    const cargar = async () => {
      try {
        if (locationState?.alumno && mounted) {
          console.log('Usando alumno inicial desde location.state:', locationState.alumno);
          hidratarFormularioAlumno(locationState.alumno);
        }
        await fetchAlumnoFresco();
      } catch (err) {
        if (mounted) setError(err.message);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    cargar();
    return () => { mounted = false; };
  }, [id, locationState, token]);

  useEffect(() => {
    if (!esAdmin) return;

    let cancelled = false;

    const cargarSedes = async () => {
      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/sedes`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Error al obtener sedes');
        if (!cancelled) {
          setSedesDisponibles(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) setSedesDisponibles([]);
      }
    };

    cargarSedes();

    return () => {
      cancelled = true;
    };
  }, [esAdmin, token]);

  useEffect(() => {
    const cat = getCategoriaPorFechaNacimiento(form.fecha_nacimiento);
    setCategoria(cat);
    setForm(prev => ({ ...prev, categoria: cat }));
  }, [form.fecha_nacimiento]);

  useEffect(() => {
    let cancelled = false;
    const categoriaNormalizada = String(form.categoria || '').trim().toUpperCase();

    if (!categoriaNormalizada) {
      setNumeroFranelaCheckLoading(false);
      setNumeroFranelaCheckMsg('');
      setNumeroFranelaDuplicado(false);
      setNumerosFranelaDisponibles([]);
      setNumerosFranelaOcupados([]);
      return undefined;
    }

    const timer = setTimeout(async () => {
      setNumeroFranelaCheckLoading(true);
      try {
        const res = await fetch(
          `${process.env.REACT_APP_API_URL}/api/alumnos/numeros-franela/disponibilidad?categoria=${encodeURIComponent(categoriaNormalizada)}&excludeAlumnoId=${encodeURIComponent(id)}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Error verificando nro de franela');

        if (!cancelled) {
          const ocupados = Array.isArray(data.ocupados) ? data.ocupados : [];
          const disponibles = Array.isArray(data.disponibles) ? data.disponibles : [];
          setNumerosFranelaOcupados(ocupados);
          setNumerosFranelaDisponibles(disponibles);
          setNumeroFranelaCheckMsg('');
        }
      } catch (err) {
        if (!cancelled) {
          setNumerosFranelaOcupados([]);
          setNumerosFranelaDisponibles([]);
          setNumeroFranelaCheckMsg('No se pudo verificar disponibilidad de franela.');
        }
      } finally {
        if (!cancelled) setNumeroFranelaCheckLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [form.categoria, id]);

  useEffect(() => {
    if (!form.numero_franela) {
      setNumeroFranelaDuplicado(false);
      return;
    }

    const numero = Number(form.numero_franela);
    if (Number.isNaN(numero) || numero < 1 || numero > 100) {
      setNumeroFranelaDuplicado(false);
      setNumeroFranelaCheckMsg('El nro de franela debe estar entre 1 y 100.');
      return;
    }

    const duplicado = numerosFranelaOcupados.includes(numero);
    setNumeroFranelaDuplicado(duplicado);
    setNumeroFranelaCheckMsg(
      duplicado
        ? `El nro de franela ${numero} ya esta ocupado en la categoria ${String(form.categoria || '').trim().toUpperCase()}.`
        : ''
    );
  }, [form.numero_franela, form.categoria, numerosFranelaOcupados]);

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
    const { name, value } = e.target;
    // Si cambia el tipo de mensualidad y no es personalizado, limpia el valor personalizado
    if (name === 'tipo_mensualidad') {
      setForm((prev) => ({
        ...prev,
        tipo_mensualidad: value,
        ...(value !== 'monto_personalizado' ? { monto_personalizado_valor: '' } : {})
      }));
    } else if (name === 'habilitar_pago_cuotas') {
      setForm((prev) => ({ ...prev, habilitar_pago_cuotas: e.target.checked }));
    } else if (name === 'aplicar_recargo_mensualidad') {
      setForm((prev) => ({ ...prev, aplicar_recargo_mensualidad: e.target.checked }));
    } else if (name === 'dia_limite_personalizado') {
      setForm((prev) => ({ ...prev, dia_limite_personalizado: value }));
    } else if (name === 'sede') {
      setForm((prev) => ({ ...prev, sede: value }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage('');
    setSuccessOpen(false);
    if (form.numero_franela) {
      const nro = Number(form.numero_franela);
      if (Number.isNaN(nro) || nro < 1 || nro > 100) {
        setError('El nro de franela debe estar entre 1 y 100.');
        return;
      }
      if (numeroFranelaDuplicado) {
        setError(numeroFranelaCheckMsg || 'Ese nro de franela ya esta asignado en la categoria.');
        return;
      }
    }
    if (!String(form.fecha_inicio_cobro || '').trim()) {
      setError('La fecha de inicio de cobro es obligatoria.');
      return;
    }
    if (!esFechaInicioCobroDelAnioActual(form.fecha_inicio_cobro)) {
      setError(`La fecha de inicio de cobro debe pertenecer al año actual (${ANIO_ACTUAL}).`);
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      const camposEditables = [
        'nombres', 'apellidos', 'fecha_nacimiento', 'fecha_inscripcion', 'fecha_inicio_cobro', 'cedula',
        'sexo', 'division',
        'domicilio', 'telefono', 'talla', 'peso', 'alcance', 'envergadura', 'proyeccion',
        'tipo_sangre', 'alergias', 'antecedentes_patologicos', 'observaciones',
        'numero_franela', 'habilitar_pago_cuotas', 'etiquetas', 'activo', 'estado',
        'aplicar_recargo_mensualidad',
        'dia_limite_personalizado',
        'sede', 'categoria', 'usuario', 'parentesco', 'tipo_mensualidad',
        'monto_personalizado_valor', 'sinRepresentante',
        'rep_nombres', 'rep_apellidos', 'rep_cedula', 'rep_telefono', 'rep_fecha_nacimiento', 'rep_correo', 'rep_direccion'
      ];

      camposEditables.forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(form, key)) return;
        let value = form[key];

        if (key === 'numero_franela') {
          if (value === null || value === undefined || value === '' || String(value).toLowerCase() === 'null') {
            formData.append('numero_franela', '');
            return;
          }
          formData.append('numero_franela', String(value));
          return;
        }

        if (key === 'dia_limite_personalizado') {
          if (value === null || value === undefined || String(value).trim() === '') {
            formData.append('dia_limite_personalizado', '');
            return;
          }
          formData.append('dia_limite_personalizado', String(value));
          return;
        }

        if (key === 'sede') {
          const sedeId = typeof value === 'object' && value !== null ? (value._id || '') : value;
          formData.append('sede', sedeId || '');
          return;
        }

        if (key === 'etiquetas') {
          if (Array.isArray(value)) {
            formData.append('etiquetas', JSON.stringify(value));
          } else {
            formData.append('etiquetas', '[]');
          }
          return;
        }

        if (value === undefined || value === null) {
          formData.append(key, '');
          return;
        }

        if (typeof value === 'object') {
          formData.append(key, JSON.stringify(value));
        } else {
          formData.append(key, String(value));
        }
      });
      if (fotoFile) {
        formData.append('foto', fotoFile);
      }
      if (fotoCedulaFile) {
        formData.append('foto_cedula', fotoCedulaFile);
      }
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/${id}`, {
        method: 'PUT',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: formData
      });
      if (!res.ok) {
        let errorMsg = 'Error al actualizar alumno';
        try {
          const errData = await res.json();
          errorMsg = errData.detalle || errData.error || JSON.stringify(errData) || errorMsg;
        } catch (jsonErr) {
          // Si no es JSON, intentar leer como texto
          try {
            const errText = await res.text();
            if (errText) errorMsg = errText;
          } catch { }
        }
        throw new Error(errorMsg);
      }
      setSuccessMessage('Alumno editado con exito.');
      setSuccessOpen(true);
      await fetchAlumnoFresco();
      setFotoFile(null);
      setFotoCedulaFile(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Traer requisitos base de la academia seleccionada
  useEffect(() => {
    const fetchRequisitosAcademia = async () => {
      try {
        const url = `${process.env.REACT_APP_API_URL}/api/recaudos/requisitos`;
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        if (!res.ok) throw new Error('No se pudo obtener requisitos de la academia');
        const data = await res.json();
        console.log('Requisitos base de la academia:', data?.requisitos);
        setRequisitosBaseAcademia(Array.isArray(data?.requisitos) ? data.requisitos : []);
      } catch (err) {
        setRequisitosBaseAcademia([]);
      }
    };
    fetchRequisitosAcademia();
  }, [token]);

  if (loading) return <Typography>Cargando...</Typography>;
  if (error) return <Typography color="error">{error}</Typography>;

  // Combina los requisitos base con los del alumno
  const estadoAlumno = form.requisitos_recaudos_estado || [];
  const checklist = requisitosBaseAcademia.map(nombre => {
    const estado = estadoAlumno.find(r => r.requisito === nombre);
    return { nombre, cumplido: estado ? estado.cumplido : false };
  });

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#fdfdfd', py: { xs: 2, md: 3 } }}>
      <Snackbar
        open={successOpen}
        autoHideDuration={3500}
        onClose={() => setSuccessOpen(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSuccessOpen(false)}
          severity="success"
          variant="filled"
          sx={{ width: '100%', minWidth: 320, borderRadius: 2 }}
        >
          <AlertTitle sx={{ mb: 0.25, fontWeight: 800 }}>Alumno actualizado</AlertTitle>
        </Alert>
      </Snackbar>
      <Box
        sx={{
          mx: 'auto',
          px: { xs: 1.5, sm: 2.5, md: 3 }
        }}
      >
        <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a', mb: 2 }}>
          Editar Alumno
        </Typography>
        <Box
          component="form"
          className="alumnos-form"
          onSubmit={handleSubmit}
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(12, minmax(0, 1fr))' },
            gap: { xs: 2, md: 3 },
            alignItems: 'start',
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
                CEDULA DE IDENTIDAD DEL ALUMNO
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

            {localStorage.getItem('rol') === 'usuario' && (
              <Accordion
                sx={{
                  borderRadius: 1,
                  boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)',
                  mb: 2,
                  '&:before': { display: 'none' },
                  overflow: 'hidden'
                }}
              >
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography sx={{ fontWeight: 600, color: '#94a3b8', letterSpacing: '0.04em' }}>Requisitos de la Academia</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <RequisitosCard checklist={checklist} />
                </AccordionDetails>
              </Accordion>
            )}

            {esAdmin && (
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
                        disabled={locationState && locationState.alumno && localStorage.getItem('rol') === 'usuario'}
                      />
                    }
                    label=""
                  />
                </Box>
              </Paper>
            )}

            {esAdmin && (
              <Paper sx={{ p: 2.5, borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
                <TextField
                  id="input-dia-limite-personalizado-editar"
                  label="Pago extendido (dia del mes)"
                  name="dia_limite_personalizado"
                  type="number"
                  variant="outlined"
                  value={form.dia_limite_personalizado || ''}
                  onChange={handleChange}
                  fullWidth
                  size="small"
                  inputProps={{ min: 1, max: 31 }}
                  helperText="Opcional. Si se define, reemplaza la fecha global para recargo en este alumno."
                  FormHelperTextProps={{
                    sx: {
                      mt: 0.9,
                      lineHeight: 1.45,
                      color: '#64748b'
                    }
                  }}
                  sx={{ mb: 0.6 }}
                />
              </Paper>
            )}

            {esAdmin && (
              <Paper sx={{ p: 2.5, borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>Aplicar recargo mensual</Typography>
                    <Typography sx={{ fontSize: 11, color: '#64748b' }}>
                      Si esta activo, se sumara recargo USD al vencer la tolerancia.
                    </Typography>
                  </Box>
                  <FormControlLabel
                    sx={{ m: 0 }}
                    control={
                      <Switch
                        checked={form.aplicar_recargo_mensualidad !== false}
                        onChange={handleChange}
                        name="aplicar_recargo_mensualidad"
                        color="primary"
                        disabled={locationState && locationState.alumno && localStorage.getItem('rol') === 'usuario'}
                      />
                    }
                    label=""
                  />
                </Box>
              </Paper>
            )}
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
                  disabled={locationState && locationState.alumno && localStorage.getItem('rol') === 'usuario'}
                />
                <TextField
                  id="outlined-basic-fecha-inicio-cobro"
                  label="Fecha de inicio de cobro *"
                  name="fecha_inicio_cobro"
                  type="date"
                  variant="outlined"
                  value={form.fecha_inicio_cobro || ''}
                  onChange={handleChange}
                  fullWidth
                  size="small"
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ min: FECHA_INICIO_COBRO_MIN, max: FECHA_INICIO_COBRO_MAX }}
                  sx={{ my: 1 }}
                  disabled={locationState && locationState.alumno && localStorage.getItem('rol') === 'usuario'}
                />
              </div>
              <div className="form-row">
                <TextField id="outlined-basic-fecha-nacimiento" label="Fecha de nacimiento" name="fecha_nacimiento" type="date" variant="outlined" value={form.fecha_nacimiento || ''} onChange={handleChange} fullWidth size="small" InputLabelProps={{ shrink: true }} sx={{ my: 1 }} />
                <FormControl fullWidth size="small" sx={{ my: 1 }}>
                  <InputLabel id="sexo-editar-label">Sexo *</InputLabel>
                  <Select
                    labelId="sexo-editar-label"
                    id="select-sexo-editar"
                    name="sexo"
                    value={form.sexo || ''}
                    label="Sexo *"
                    onChange={handleChange}
                  >
                    <MenuItem value=""><em>Seleccionar</em></MenuItem>
                    {SEXOS.map((sexo) => (
                      <MenuItem key={sexo} value={sexo}>{sexo}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </div>

              <div className="form-row">
                <TextField id="outlined-basic-nombres" label="Nombres *" name="nombres" variant="outlined" value={form.nombres || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
                <TextField id="outlined-basic-apellidos" label="Apellidos *" name="apellidos" variant="outlined" value={form.apellidos || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
              </div>

              <div className="form-row">
                <FormControl fullWidth size="small" sx={{ my: 1 }}>
                  <InputLabel id="categoria-editar-label">{esAdmin ? 'Categoría' : 'Categoría asignada'}</InputLabel>
                  <Select
                    labelId="categoria-editar-label"
                    id="select-categoria-editar"
                    name="categoria"
                    value={form.categoria || categoria || ''}
                    label={esAdmin ? 'Categoría' : 'Categoría asignada'}
                    onChange={handleChange}
                    disabled={!esAdmin}
                  >
                    {CATEGORIAS_DISPONIBLES.map((cat) => (
                      <MenuItem key={cat} value={cat}>{cat}</MenuItem>
                    ))}
                    {!!(form.categoria || categoria) && !CATEGORIAS_DISPONIBLES.includes(form.categoria || categoria) && (
                      <MenuItem value={form.categoria || categoria}>{form.categoria || categoria}</MenuItem>
                    )}
                  </Select>
                  <Typography sx={{ fontSize: 12, color: '#94a3b8', mt: 0.5 }}>
                    {esAdmin ? 'Se asigna automáticamente, pero puedes ajustarla.' : 'Se asigna automáticamente'}
                  </Typography>
                </FormControl>
                <FormControl fullWidth size="small" sx={{ my: 1 }}>
                  <InputLabel id="division-editar-label">División</InputLabel>
                  <Select
                    labelId="division-editar-label"
                    id="select-division-editar"
                    name="division"
                    value={form.division || ''}
                    label="División"
                    onChange={handleChange}
                    disabled={!esAdmin}
                  >
                    <MenuItem value=""><em>Seleccionar</em></MenuItem>
                    {DIVISIONES.map((division) => (
                      <MenuItem key={division} value={division}>{division}</MenuItem>
                    ))}
                  </Select>
                  <Typography sx={{ fontSize: 12, color: '#94a3b8', mt: 0.5 }}>
                    Solo administrador puede editar este campo.
                  </Typography>
                </FormControl>
              </div>

              <div className="form-row">
                <TextField
                  id="outlined-basic-numero-franela"
                  label="Nro de franela"
                  name="numero_franela"
                  select
                  variant="outlined"
                  value={form.numero_franela || ''}
                  onChange={handleChange}
                  fullWidth
                  size="small"
                  sx={{ my: 1 }}
                  disabled={!categoria || numeroFranelaCheckLoading}
                  error={numeroFranelaDuplicado}
                  helperText={
                    numeroFranelaDuplicado
                      ? numeroFranelaCheckMsg
                      : (numeroFranelaCheckLoading
                        ? 'Verificando disponibilidad por categoria...'
                        : (!categoria
                          ? 'Selecciona fecha de nacimiento para definir categoria'
                          : `Disponibles: ${numerosFranelaDisponibles.length} de 100`))
                  }
                >
                  <MenuItem value=""><em>Sin asignar</em></MenuItem>
                  {numerosFranelaDisponibles.map((nro) => (
                    <MenuItem key={nro} value={String(nro)}>{nro}</MenuItem>
                  ))}
                </TextField>
                <TextField id="outlined-basic-cedula" label="Cédula" name="cedula" variant="outlined" value={form.cedula || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
              </div>
              <div className="form-row">
                <FormControl fullWidth sx={{ my: 1 }} disabled={locationState && locationState.alumno && localStorage.getItem('rol') === 'usuario'}
                >
                  <InputLabel id="monto-personalizado-label">Tipo de monto mensualidad</InputLabel>
                  <Select
                    labelId="monto-personalizado-label"
                    id="select-monto-personalizado"
                    name="tipo_mensualidad"
                    value={form.tipo_mensualidad || 'monto_sede'}
                    label="Tipo de monto mensualidad"
                    onChange={handleChange}
                  >
                    {OPCIONES_MENSUALIDAD.map(op => (
                      <MenuItem key={op.id} value={op.id}>{op.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                {(() => {
                  const sedeActualObj = typeof form.sede === 'object' && form.sede !== null ? form.sede : null;
                  const sedeActualId = sedeActualObj?._id || sedeActualObj?.id || '';
                  const sedeActualNombre = sedeActualObj?.nombre || '';
                  const sedeValue = sedeActualId || (typeof form.sede === 'string' ? form.sede : '');

                  return (
                <FormControl fullWidth required style={{ minWidth: 180, marginRight: 8 }} sx={{ my: 1 }}>
                  <InputLabel id="sede-label">Sede *</InputLabel>
                  <Select
                    labelId="sede-label"
                    id="sede"
                    name="sede"
                    value={sedeValue}
                    label="Sede"
                    onChange={handleChange}
                    disabled={!esAdmin}
                    renderValue={(value) => {
                      const selected = sedesDisponibles.find((s) => String(s._id || s.id || '') === String(value));
                      if (selected?.nombre) return selected.nombre;
                      if (String(value || '') === String(sedeActualId || '') && sedeActualNombre) return sedeActualNombre;
                      return typeof value === 'string' ? value : '';
                    }}
                  >
                    {sedesDisponibles.map((sedeItem) => {
                      const sedeId = sedeItem?._id || sedeItem?.id;
                      if (!sedeId) return null;
                      return <MenuItem key={sedeId} value={sedeId}>{sedeItem.nombre || sedeId}</MenuItem>;
                    })}
                    {sedeValue && !sedesDisponibles.some((s) => String(s._id || s.id || '') === String(sedeValue)) && (
                      <MenuItem value={sedeValue}>{sedeActualNombre || sedeValue}</MenuItem>
                    )}
                  </Select>
                </FormControl>
                  );
                })()}
              </div>
              {form.tipo_mensualidad === 'monto_personalizado' && (
                <div className="form-row">
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
                    disabled={locationState && locationState.alumno && localStorage.getItem('rol') === 'usuario'}
                  />
                  <Box sx={{ my: 1 }} />
                </div>
              )}
              {debeMostrarAvisoRecalculoMensualidades && (
                <Alert severity="info" sx={{ mt: 1, mb: 1.5, borderRadius: 2 }}>
                  Al guardar, se recalcularan las mensualidades del alumno que esten en Pendiente, Insolvente o Retrasado usando la configuracion de monto actual.
                </Alert>
              )}
              <div className="form-row">
                <TextField id="outlined-basic-telefono" label="Teléfono" name="telefono" type="tel" variant="outlined" value={form.telefono || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
                <TextField id="outlined-basic-domicilio" label="Dirección" name="domicilio" variant="outlined" value={form.domicilio || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
              </div>
              <div className="form-row">
                <TextField id="outlined-basic-peso" label="Peso" name="peso" variant="outlined" value={form.peso || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} disabled={locationState && locationState.alumno && localStorage.getItem('rol') === 'usuario'}
                />
                <TextField id="outlined-basic-talla" label="Talla" name="talla" variant="outlined" value={form.talla || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} disabled={locationState && locationState.alumno && localStorage.getItem('rol') === 'usuario'}
                />
              </div>
              <div className="form-row">
                <TextField id="outlined-basic-proyeccion" label="Proyección" name="proyeccion" variant="outlined" value={form.proyeccion || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} disabled={locationState && locationState.alumno && localStorage.getItem('rol') === 'usuario'}
                />
                <TextField id="outlined-basic-alcance" label="Alcance" name="alcance" variant="outlined" value={form.alcance || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} disabled={locationState && locationState.alumno && localStorage.getItem('rol') === 'usuario'}
                />
              </div>
              <div className="form-row">
                <TextField id="outlined-basic-envergadura" label="Envergadura" name="envergadura" variant="outlined" value={form.envergadura || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} disabled={locationState && locationState.alumno && localStorage.getItem('rol') === 'usuario'}
                />
                <FormControl fullWidth size="small" sx={{ my: 1 }}>
                  <InputLabel id="tipo-sangre-label">Tipo de sangre</InputLabel>
                  <Select
                    labelId="tipo-sangre-label"
                    id="select-tipo-sangre"
                    name="tipo_sangre"
                    value={form.tipo_sangre || ''}
                    label="Tipo de sangre"
                    onChange={handleChange}
                  >
                    <MenuItem value=""><em>Seleccionar</em></MenuItem>
                    {TIPOS_SANGRE.map((tipo) => (
                      <MenuItem key={tipo} value={tipo}>{tipo}</MenuItem>
                    ))}
                    {form.tipo_sangre && !TIPOS_SANGRE.includes(form.tipo_sangre) && (
                      <MenuItem value={form.tipo_sangre}>{form.tipo_sangre}</MenuItem>
                    )}
                  </Select>
                </FormControl>
              </div>
              <div className="form-row">
                <TextField id="outlined-basic-antecedentes" label="Antecedentes patológicos" name="antecedentes_patologicos" variant="outlined" value={form.antecedentes_patologicos || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
                <TextField id="outlined-basic-alergias" label="Alergias" name="alergias" variant="outlined" value={form.alergias || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
              </div>
              {esAdmin && (
                <div className="form-row">
                  <TextField id="outlined-basic-observaciones" label="Observaciones" name="observaciones" variant="outlined" value={form.observaciones || ''} onChange={handleChange} fullWidth size="small" multiline minRows={2} sx={{ my: 1 }} disabled={locationState && locationState.alumno && localStorage.getItem('rol') === 'usuario'}
                  />
                  <Autocomplete
                    multiple
                    freeSolo
                    options={[]}
                    value={form.etiquetas || []}
                    onChange={(event, newValue) => {
                      setForm(prev => ({ ...prev, etiquetas: newValue }));
                    }}
                    disabled={locationState && locationState.alumno && localStorage.getItem('rol') === 'usuario'}
                    sx={{ width: '100%' }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Etiquetas"
                        placeholder="Escribe y presiona Enter"
                        variant="outlined"
                        fullWidth
                        size="small"
                        multiline
                        sx={{ my: 2 }}
                      />
                    )}
                  />
                </div>
              )}
            </fieldset>
            <fieldset style={{ border: 'none', borderRadius: 16, padding: 20, background: '#ffffff', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
              <legend>Datos del Representante</legend>
              <div className="form-row">
                <TextField id="outlined-basic-rep-nombres" label="Nombres del representante *" name="rep_nombres" variant="outlined" value={form.rep_nombres || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
                <TextField id="outlined-basic-rep-apellidos" label="Apellidos del representante *" name="rep_apellidos" variant="outlined" value={form.rep_apellidos || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
              </div>
              <div className="form-row">
                <TextField id="outlined-basic-rep-cedula" label="Cédula del representante *" name="rep_cedula" variant="outlined" value={form.rep_cedula || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
                <TextField
                  id="outlined-basic-rep-fecha-nacimiento"
                  label="Fecha de nacimiento del representante"
                  name="rep_fecha_nacimiento"
                  type="date"
                  variant="outlined"
                  value={form.rep_fecha_nacimiento || ''}
                  onChange={handleChange}
                  fullWidth
                  size="small"
                  InputLabelProps={{ shrink: true }}
                  sx={{ my: 1 }}
                />
              </div>
              <div className="form-row">
                <TextField id="outlined-basic-rep-telefono" label="Teléfono del representante" name="rep_telefono" type="tel" variant="outlined" value={form.rep_telefono || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
                <FormControl fullWidth size="small" sx={{ my: 1 }}>
                  <InputLabel id="select-parentesco-editar-label">Parentesco *</InputLabel>
                  <Select
                    labelId="select-parentesco-editar-label"
                    id="select-parentesco-editar"
                    name="parentesco"
                    value={form.parentesco || ''}
                    label="Parentesco *"
                    onChange={handleChange}
                  >
                    {PARENTESCOS.map((op) => (
                      <MenuItem key={op} value={op}>{op}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </div>
              <div className="form-row">
                <TextField id="outlined-basic-rep-correo" label="Correo del representante" name="rep_correo" type="email" variant="outlined" value={form.rep_correo || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
                <TextField id="outlined-basic-rep-direccion" label="Dirección del representante" name="rep_direccion" variant="outlined" value={form.rep_direccion || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
              </div>
            </fieldset>
            <button type="submit" disabled={loading} style={loading ? { opacity: 0.6, pointerEvents: 'none' } : {}}>
              {loading ? 'Guardando...' : 'Guardar cambios'}
            </button>
            {error && <div className="error-message">{error}</div>}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

const RequisitosCard = ({ checklist }) => {
  if (!checklist || checklist.length === 0) {
    return <Typography>No hay requisitos configurados para esta academia.</Typography>;
  }

  return (
    <List>
      {checklist.map((item, index) => (
        <ListItem key={index}>
          {item.cumplido ? (
            <CheckCircleIcon style={{ color: 'green', marginRight: 8 }} />
          ) : (
            <CancelIcon style={{ color: 'red', marginRight: 8 }} />
          )}
          <ListItemText primary={item.nombre} />
        </ListItem>
      ))}
    </List>
  );
};

export default AlumnoEditar;
