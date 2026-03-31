import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, TextField, Typography, Dialog, DialogTitle, DialogContent, DialogActions, FormControl, InputLabel, Select, MenuItem, Paper, FormControlLabel, Autocomplete, Box, Switch } from '@mui/material';
import { OPCIONES_MENSUALIDAD } from './Alumnos';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { useSede } from '../context/SedeContext';
import { mediaUrl } from '../utils/mediaUrl';
import './Alumnos.css';
const ESTADOS_MENSUALIDAD = ['Pendiente', 'Pagado', 'Retrasado', 'Exonerado'];
const PARENTESCOS = ['Padre', 'Madre', 'Hermano/a', 'Tío/a', 'Abuelo/a', 'Otro'];
const TIPOS_SANGRE = ['O+', 'A+', 'B+', 'O-', 'A-', 'AB+', 'B-', 'AB-', 'Por determinar / Desconocido'];

function AlumnoEditar({ locationState }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { sedeSeleccionada } = useSede();
  const [form, setForm] = useState({
    tipo_mensualidad: 'monto_sede',
    numero_franela: '',
    habilitar_pago_cuotas: false,
    etiquetas: [],
  });
  const [preview, setPreview] = useState(null);
  const [previewCedula, setPreviewCedula] = useState(null);
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoCedulaFile, setFotoCedulaFile] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [categoria, setCategoria] = useState('');
  const [numeroFranelaDuplicado, setNumeroFranelaDuplicado] = useState(false);
  const [numeroFranelaCheckLoading, setNumeroFranelaCheckLoading] = useState(false);
  const [numeroFranelaCheckMsg, setNumeroFranelaCheckMsg] = useState('');
  const [numerosFranelaDisponibles, setNumerosFranelaDisponibles] = useState([]);
  const [numerosFranelaOcupados, setNumerosFranelaOcupados] = useState([]);
  const inputRef = useRef(null);
  const inputCedulaRef = useRef(null);

  useEffect(() => {
    // Si locationState tiene alumno, usarlo directamente
    if (locationState && locationState.alumno) {
      const data = locationState.alumno;
      console.log('Usando alumno desde location.state:', data);
      let { representante, ...rest } = data;
      if (rest.fecha_nacimiento) {
        rest.fecha_nacimiento = rest.fecha_nacimiento.slice(0, 10);
      }
      if (rest.fecha_inscripcion) {
        rest.fecha_inscripcion = rest.fecha_inscripcion.slice(0, 10);
      }
      let formData = { ...rest };
      if (representante) {
        formData = {
          ...formData,
          rep_nombres: representante.nombres || '',
          rep_apellidos: representante.apellidos || '',
          rep_cedula: representante.cedula || '',
          rep_telefono: representante.telefono || ''
        };
      }
      setForm(formData);
      if (data.foto) setPreview(mediaUrl(data.foto));
      if (data.foto_cedula) setPreviewCedula(mediaUrl(data.foto_cedula));
      setLoading(false);
    } else {
      // Si no, hacer fetch normal
      const fetchAlumno = async () => {
        try {
          const res = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/${id}`);
          if (!res.ok) throw new Error('Error al obtener alumno');
          const data = await res.json();
          console.log('Alumno obtenido del API:', data);
          let { representante, ...rest } = data;
          if (rest.fecha_nacimiento) {
            rest.fecha_nacimiento = rest.fecha_nacimiento.slice(0, 10);
          }
          if (rest.fecha_inscripcion) {
            rest.fecha_inscripcion = rest.fecha_inscripcion.slice(0, 10);
          }
          let formData = { ...rest };
          if (representante) {
            formData = {
              ...formData,
              rep_nombres: representante.nombres || '',
              rep_apellidos: representante.apellidos || '',
              rep_cedula: representante.cedula || '',
              rep_telefono: representante.telefono || ''
            };
          }
          setForm(formData);
          if (data.foto) setPreview(mediaUrl(data.foto));
          if (data.foto_cedula) setPreviewCedula(mediaUrl(data.foto_cedula));
        } catch (err) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      };
      fetchAlumno();
    }
  }, [id, locationState]);

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
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
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
    setLoading(true);
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        // No enviar el base64 de foto/foto_cedula
        if (key === 'foto' || key === 'foto_cedula') return;
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
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/${id}`, {
        method: 'PUT',
        body: formData
      });
      if (!res.ok) {
        let errorMsg = 'Error al actualizar alumno';
        try {
          const errData = await res.json();
          errorMsg = errData.error || JSON.stringify(errData) || errorMsg;
        } catch (jsonErr) {
          // Si no es JSON, intentar leer como texto
          try {
            const errText = await res.text();
            if (errText) errorMsg = errText;
          } catch {}
        }
        throw new Error(errorMsg);
      }
      navigate('/tabla-alumnos');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Typography>Cargando...</Typography>;
  if (error) return <Typography color="error">{error}</Typography>;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f1f5f9', py: { xs: 2, md: 3 } }}>
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

            {localStorage.getItem('rol') === 'admin' && (
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
            <TextField id="outlined-basic-categoria" disabled label="Categoría asignada" name="categoria" variant="outlined" value={categoria} InputProps={{ readOnly: true }} fullWidth size="small" helperText="Se asigna automáticamente" sx={{ my: 1 }} />
          </div>
          <div className="form-row">
          <TextField id="outlined-basic-nombres" label="Nombres *" name="nombres" variant="outlined" value={form.nombres || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
            <TextField id="outlined-basic-apellidos" label="Apellidos *" name="apellidos" variant="outlined" value={form.apellidos || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
          </div>
          <div className="form-row">
            <TextField id="outlined-basic-fecha-nacimiento" label="Fecha de nacimiento" name="fecha_nacimiento" type="date" variant="outlined" value={form.fecha_nacimiento || ''} onChange={handleChange} fullWidth size="small" InputLabelProps={{ shrink: true }} sx={{ my: 1 }} />
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
          </div>
          <div className="form-row">
            <TextField id="outlined-basic-cedula" label="Cédula" name="cedula" variant="outlined" value={form.cedula || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }}/>
            <FormControl fullWidth sx={{ my: 1 }} disabled={locationState && locationState.alumno && localStorage.getItem('rol') === 'usuario'}>
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
                disabled={locationState && locationState.alumno && localStorage.getItem('rol') === 'usuario'}
              />
            )}
          </div>
          <div className="form-row">
            <FormControl fullWidth required style={{ minWidth: 180, marginRight: 8 }} sx={{ my: 1 }}>
                              <InputLabel id="sede-label">Sede *</InputLabel>
                <Select
                  labelId="sede-label"
                  id="sede"
                  name="sede"
                  value={form.sede?.nombre || ''}
                  label="Sede"
                  disabled
                  renderValue={(value) => typeof value === 'object' ? value.nombre : value}
                >
                  {form.sede?.nombre && <MenuItem value={form.sede.nombre}>{form.sede.nombre}</MenuItem>}
                </Select>
            </FormControl>
            <TextField id="outlined-basic-telefono" label="Teléfono" name="telefono" type="tel" variant="outlined" value={form.telefono || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
          </div>
          <div className="form-row">
             <TextField id="outlined-basic-domicilio" label="Dirección" name="domicilio" variant="outlined" value={form.domicilio || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }}/>
            <TextField id="outlined-basic-peso" label="Peso" name="peso" variant="outlined" value={form.peso || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} disabled={locationState && locationState.alumno && localStorage.getItem('rol') === 'usuario'}/>
          </div>
          <div className="form-row">
            <TextField id="outlined-basic-talla" label="Talla" name="talla" variant="outlined" value={form.talla || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} disabled={locationState && locationState.alumno && localStorage.getItem('rol') === 'usuario'}/>
            <TextField id="outlined-basic-proyeccion" label="Proyección" name="proyeccion" variant="outlined" value={form.proyeccion || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} disabled={locationState && locationState.alumno && localStorage.getItem('rol') === 'usuario'} />
          </div>
          <div className="form-row">
            <TextField id="outlined-basic-alcance" label="Alcance" name="alcance" variant="outlined" value={form.alcance || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} disabled={locationState && locationState.alumno && localStorage.getItem('rol') === 'usuario'}/>
            <TextField id="outlined-basic-envergadura" label="Envergadura" name="envergadura" variant="outlined" value={form.envergadura || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} disabled={locationState && locationState.alumno && localStorage.getItem('rol') === 'usuario'}/>
          </div>
          <div className="form-row">
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
           <TextField id="outlined-basic-antecedentes" label="Antecedentes patológicos" name="antecedentes_patologicos" variant="outlined" value={form.antecedentes_patologicos || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
          </div>
          <div className="form-row">
            <TextField id="outlined-basic-alergias" label="Alergias" name="alergias" variant="outlined" value={form.alergias || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
            <TextField id="outlined-basic-observaciones" label="Observaciones" name="observaciones" variant="outlined" value={form.observaciones || ''} onChange={handleChange} fullWidth size="small" multiline minRows={2} sx={{ my: 1 }} disabled={locationState && locationState.alumno && localStorage.getItem('rol') === 'usuario'}/>
          </div>
          {localStorage.getItem('rol') === 'admin' && (
          <div className="form-row">
            <Autocomplete
              multiple
              freeSolo
              options={[]}
              value={form.etiquetas || []}
              onChange={(event, newValue) => {
                setForm(prev => ({ ...prev, etiquetas: newValue }));
              }}
              disabled={locationState && locationState.alumno && localStorage.getItem('rol') === 'usuario'}
              sx={{ width: '48%' }}
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
            {form.sinRepresentante !== true && (
              <fieldset style={{ border: 'none', borderRadius: 16, padding: 20, background: '#ffffff', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
                <legend>Datos del Representante</legend>
                <div className="form-row">
                  <TextField id="outlined-basic-rep-nombres" label="Nombres del representante *" name="rep_nombres" variant="outlined" value={form.rep_nombres || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }}/>
                  <TextField id="outlined-basic-rep-apellidos" label="Apellidos del representante *" name="rep_apellidos" variant="outlined" value={form.rep_apellidos || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }}/>
                </div>
                <div className="form-row">
                  <TextField id="outlined-basic-rep-cedula" label="Cédula del representante *" name="rep_cedula" variant="outlined" value={form.rep_cedula || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }}/>
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
                  <TextField id="outlined-basic-rep-telefono" label="Teléfono del representante" name="rep_telefono" type="tel" variant="outlined" value={form.rep_telefono || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }}/>
                </div>
              </fieldset>
            )}
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

export default AlumnoEditar;
