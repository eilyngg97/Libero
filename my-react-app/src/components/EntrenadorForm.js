import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  InputAdornment,
  MenuItem,
  Paper,
  TextField,
  Typography
} from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import LocationOnOutlinedIcon from '@mui/icons-material/LocationOnOutlined';
import PhoneIphoneOutlinedIcon from '@mui/icons-material/PhoneIphoneOutlined';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import PhoneOutlinedIcon from '@mui/icons-material/PhoneOutlined';
import SchoolOutlinedIcon from '@mui/icons-material/SchoolOutlined';
import UploadRoundedIcon from '@mui/icons-material/UploadRounded';
import WorkOutlineRoundedIcon from '@mui/icons-material/WorkOutlineRounded';
import { mediaUrl } from '../utils/mediaUrl';
import { BANCOS_PAGO_MOVIL, normalizeNombreBanco } from '../constants/pagos';

const TAB_BASICO = 0;
const TAB_CERTIFICACIONES = 1;
const TAB_ADMINISTRATIVO = 2;

const steps = [
  {
    id: TAB_BASICO,
    step: '1',
    title: 'Datos basicos',
    description: 'Identidad y contacto'
  },
  {
    id: TAB_CERTIFICACIONES,
    step: '2',
    title: 'Perfil tecnico',
    description: 'Certificaciones y experiencia'
  },
  {
    id: TAB_ADMINISTRATIVO,
    step: '3',
    title: 'Administrativo',
    description: 'Contrato y pago'
  }
];

const instructionLevelOptions = [
  'Selecciona un nivel...',
  'Bachiller',
  'TSU',
  'Licenciatura',
  'Postgrado',
  'Certificacion federativa'
];

const bankOptions = BANCOS_PAGO_MOVIL.map((item) => item.nombre);

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 3,
    backgroundColor: '#ffffff',
    minHeight: { xs: 46, md: 50, lg: 48 },
    '& fieldset': {
      borderColor: '#e5e7eb'
    },
    '&:hover fieldset': {
      borderColor: '#cbd5e1'
    },
    '&.Mui-focused fieldset': {
      borderColor: '#fb923c',
      borderWidth: 1
    },
    '@media (max-height: 860px)': {
      minHeight: 44
    }
  },
  '& .MuiInputBase-input': {
    fontSize: 13,
    color: '#0f172a'
  },
  '& .MuiInputLabel-root': {
    color: '#64748b',
    fontWeight: 600,
    fontSize: 13
  },
  '& .MuiInputAdornment-root': {
    color: '#94a3b8'
  }
};

const panelSx = {
  borderRadius: 5,
  border: '1px solid #e5e7eb',
  backgroundColor: '#ffffff',
  boxShadow: '0 18px 48px rgba(15, 23, 42, 0.08)'
};

const scrollableStepSx = {
  pt: 0.5
};

const initialForm = {
  nombre: '',
  apellido: '',
  direccion: '',
  cedula: '',
  correo: '',
  fecha_nacimiento: '',
  telefono: '',
  especialidad: '',
  nivel_instruccion: '',
  experiencia_previa: '',
  talla_franela: '',
  talla_short: '',
  talla_mono: '',
  sedes_staff: [],
  tipo_contrato: '',
  datos_bancarios: '',
  salario_base_usd: '',
  frecuencia_pago: '',
  pago_metodos: [],
  pago_movil_banco: '',
  pago_movil_telefono: '',
  pago_movil_cedula: '',
  transferencia_banco: '',
  transferencia_tipo_cuenta: '',
  transferencia_numero_cuenta: '',
  transferencia_titular: '',
  transferencia_cedula: '',
  fecha_ingreso: ''
};

function toDateInput(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function getFileLabelFromPath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const parts = raw.split('/').filter(Boolean);
  return parts.length ? parts[parts.length - 1] : raw;
}

function buildInitialFormFromEntrenador(entrenador = {}) {
  const pagoConfig = entrenador?.pago_config || {};
  const pagoMovil = pagoConfig?.pago_movil || {};
  const transferencia = pagoConfig?.transferencia || {};

  return {
    ...initialForm,
    nombre: entrenador?.nombre || '',
    apellido: entrenador?.apellido || '',
    direccion: entrenador?.direccion || '',
    cedula: entrenador?.cedula || '',
    correo: entrenador?.correo || '',
    fecha_nacimiento: toDateInput(entrenador?.fecha_nacimiento),
    telefono: entrenador?.telefono || '',
    especialidad: entrenador?.especialidad || '',
    nivel_instruccion: entrenador?.nivel_instruccion || '',
    experiencia_previa: entrenador?.experiencia_previa || '',
    talla_franela: entrenador?.talla_uniforme?.franela || '',
    talla_short: entrenador?.talla_uniforme?.short || '',
    talla_mono: entrenador?.talla_uniforme?.mono || '',
    sedes_staff: Array.isArray(entrenador?.sedes_staff) ? entrenador.sedes_staff.map((id) => String(id)) : [],
    tipo_contrato: entrenador?.tipo_contrato || '',
    datos_bancarios: entrenador?.datos_bancarios || '',
    salario_base_usd: pagoConfig?.monto_base_usd != null ? String(pagoConfig.monto_base_usd) : '',
    frecuencia_pago: pagoConfig?.frecuencia_pago || '',
    pago_metodos: Array.isArray(pagoConfig?.metodos) ? pagoConfig.metodos : [],
    pago_movil_banco: normalizeNombreBanco(pagoMovil?.banco),
    pago_movil_telefono: pagoMovil?.telefono || '',
    pago_movil_cedula: pagoMovil?.cedula || '',
    transferencia_banco: normalizeNombreBanco(transferencia?.banco),
    transferencia_tipo_cuenta: transferencia?.tipo_cuenta || '',
    transferencia_numero_cuenta: transferencia?.numero_cuenta || '',
    transferencia_titular: transferencia?.titular || '',
    transferencia_cedula: transferencia?.cedula || '',
    fecha_ingreso: toDateInput(entrenador?.fecha_ingreso)
  };
}

function EntrenadorForm({ onSuccess, onCancel, mode = 'create', entrenadorData = null, entrenadorId = '' }) {
  const isEditMode = mode === 'edit' && !!entrenadorId;
  const [tab, setTab] = useState(TAB_BASICO);
  const [form, setForm] = useState(initialForm);
  const [fotoFile, setFotoFile] = useState(null);
  const [previewFoto, setPreviewFoto] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [certificacionesFiles, setCertificacionesFiles] = useState([]);
  const [certificacionesExistentes, setCertificacionesExistentes] = useState([]);
  const [dragCertificacionesActive, setDragCertificacionesActive] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sedes, setSedes] = useState([]);
  const fotoInputRef = useRef(null);
  const certificacionesInputRef = useRef(null);

  const canSubmit = useMemo(() => {
    return (
      form.nombre.trim() &&
      form.apellido.trim() &&
      form.cedula.trim()
    );
  }, [form]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const apiBase = process.env.REACT_APP_API_URL || window.location.origin;

    fetch(`${apiBase}/api/sedes`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    })
      .then((res) => res.json())
      .then((data) => {
        setSedes(Array.isArray(data) ? data : []);
      })
      .catch(() => setSedes([]));
  }, []);

  useEffect(() => {
    if (!isEditMode || !entrenadorData) return;

    setForm(buildInitialFormFromEntrenador(entrenadorData));
    setPreviewFoto(mediaUrl(entrenadorData?.foto) || '');
    setFotoFile(null);
    setCertificacionesFiles([]);
    setCertificacionesExistentes(Array.isArray(entrenadorData?.certificaciones) ? entrenadorData.certificaciones : []);
    setError('');
    setSuccess('');
    setTab(TAB_BASICO);
  }, [isEditMode, entrenadorData]);

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleFotoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      setFotoFile(null);
      setPreviewFoto('');
      return;
    }

    setFotoFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      const img = String(reader.result || '');
      setPreviewFoto(img);
    };
    reader.readAsDataURL(file);
  };

  const openFotoPicker = () => {
    fotoInputRef.current?.click();
  };

  const openCertificacionesPicker = () => {
    certificacionesInputRef.current?.click();
  };

  const handleCertificacionesChange = (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      setCertificacionesFiles([]);
      return;
    }

    const pdfFiles = files.filter((file) => String(file.type || '').includes('pdf') || String(file.name || '').toLowerCase().endsWith('.pdf'));
    setCertificacionesFiles(pdfFiles);
  };

  const toggleSede = (sedeId) => {
    setForm((prev) => {
      const current = Array.isArray(prev.sedes_staff) ? prev.sedes_staff : [];
      const exists = current.includes(sedeId);

      return {
        ...prev,
        sedes_staff: exists ? current.filter((id) => id !== sedeId) : [...current, sedeId]
      };
    });
  };

  const toggleMetodoPago = (metodo) => {
    setForm((prev) => {
      const current = Array.isArray(prev.pago_metodos) ? prev.pago_metodos : [];
      const exists = current.includes(metodo);

      return {
        ...prev,
        pago_metodos: exists ? current.filter((item) => item !== metodo) : [...current, metodo]
      };
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!canSubmit) {
      setError('Completa los campos obligatorios: nombre, apellido y cédula.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    const formData = new FormData();
    formData.append('nombre', form.nombre || '');
    formData.append('apellido', form.apellido || '');
    formData.append('direccion', form.direccion || '');
    formData.append('cedula', form.cedula || '');
    formData.append('correo', form.correo || '');
    formData.append('fecha_nacimiento', form.fecha_nacimiento || '');
    formData.append('telefono', form.telefono || '');
    formData.append('especialidad', form.especialidad || '');
    formData.append('nivel_instruccion', form.nivel_instruccion || '');
    formData.append('experiencia_previa', form.experiencia_previa || '');
    formData.append('sedes_staff', JSON.stringify(form.sedes_staff || []));
    formData.append('tipo_contrato', form.tipo_contrato || '');
    formData.append('pago_config', JSON.stringify({
      monto_base_usd: form.salario_base_usd === '' ? '' : Number(form.salario_base_usd),
      frecuencia_pago: form.frecuencia_pago || '',
      metodos: form.pago_metodos || [],
      pago_movil: {
        banco: form.pago_movil_banco || '',
        telefono: form.pago_movil_telefono || '',
        cedula: form.pago_movil_cedula || ''
      },
      transferencia: {
        banco: form.transferencia_banco || '',
        tipo_cuenta: form.transferencia_tipo_cuenta || '',
        numero_cuenta: form.transferencia_numero_cuenta || '',
        titular: form.transferencia_titular || '',
        cedula: form.transferencia_cedula || ''
      }
    }));
    formData.append('datos_bancarios', form.datos_bancarios || '');
    formData.append('fecha_ingreso', form.fecha_ingreso || '');
    formData.append('talla_uniforme', JSON.stringify({
      franela: form.talla_franela || '',
      short: form.talla_short || '',
      mono: form.talla_mono || ''
    }));

    if (fotoFile) {
      formData.append('foto', fotoFile);
    }

    certificacionesFiles.forEach((file) => {
      formData.append('certificaciones', file);
    });

    formData.append('certificaciones_existentes', JSON.stringify(certificacionesExistentes || []));

    try {
      const token = localStorage.getItem('token');
      const apiBase = process.env.REACT_APP_API_URL || window.location.origin;
      const endpoint = isEditMode ? `${apiBase}/api/entrenadores/${entrenadorId}` : `${apiBase}/api/entrenadores`;
      const method = isEditMode ? 'PATCH' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudo crear el entrenador');

      if (isEditMode) {
        setSuccess('Perfil de entrenador actualizado correctamente.');
        if (onSuccess) onSuccess(data?.entrenador || null);
      } else {
        setSuccess('Entrenador creado. Usuario rol entrenador generado con contrasena inicial igual a la cedula.');
        setForm(initialForm);
        setFotoFile(null);
        setPreviewFoto('');
        setCertificacionesFiles([]);
        setCertificacionesExistentes([]);
        setTab(TAB_BASICO);
        if (onSuccess) onSuccess(data?.entrenador || null);
      }
    } catch (err) {
      setError(err.message || 'No se pudo crear el entrenador');
    } finally {
      setSaving(false);
    }
  };

  const renderInput = ({
    label,
    field,
    placeholder,
    required = false,
    type = 'text',
    multiline = false,
    minRows,
    icon,
    select = false,
    children,
    shrink,
    gridColumn,
    selectProps
  }) => (
    <TextField
      label={label}
      value={form[field]}
      onChange={handleChange(field)}
      placeholder={placeholder}
      required={required}
      type={type}
      multiline={multiline}
      minRows={minRows}
      select={select}
      fullWidth
      SelectProps={select ? selectProps : undefined}
      InputLabelProps={shrink || select ? { shrink: true } : undefined}
      InputProps={icon ? {
        startAdornment: <InputAdornment position="start">{icon}</InputAdornment>
      } : undefined}
      sx={{ ...fieldSx, gridColumn }}
    >
      {children}
    </TextField>
  );

  const nextTab = () => setTab((current) => Math.min(current + 1, TAB_ADMINISTRATIVO));
  const prevTab = () => setTab((current) => Math.max(current - 1, TAB_BASICO));

  const basicStep = (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '200px minmax(0, 1fr)' },
        gap: { xs: 1.5, md: 2.25 },
        alignItems: 'start'
      }}
    >
      <Paper
        elevation={0}
        sx={{
          borderRadius: 5,
          border: '1px solid #eef2f7',
          p: { xs: 1.5, md: 2 },
          display: 'grid',
          gap: 1,
          background: 'linear-gradient(180deg, #ffffff 0%, #fbfcfe 100%)'
        }}
      >
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>
          Foto de perfil
        </Typography>
        <Box
          onClick={openFotoPicker}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            const file = event.dataTransfer.files?.[0];
            if (file) {
              handleFotoChange({ target: { files: [file] } });
            }
          }}
          sx={{
            width: { xs: 132, md: 146 },
            height: { xs: 132, md: 146 },
            mx: 'auto',
            borderRadius: '50%',
            border: '2px dashed',
            borderColor: dragActive ? '#fb923c' : '#d7dee9',
            backgroundColor: dragActive ? '#fff7ed' : '#fcfdff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <input ref={fotoInputRef} hidden accept="image/*" type="file" onChange={handleFotoChange} />
          {previewFoto ? (
            <img src={previewFoto} alt="Foto del entrenador" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <Box sx={{ textAlign: 'center', px: 2 }}>
              <UploadRoundedIcon sx={{ fontSize: 28, color: '#a855f7', mb: 1 }} />
              <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#334155' }}>Subir foto</Typography>
              <Typography sx={{ fontSize: 12, color: '#94a3b8', mt: 0.5 }}>JPG o PNG · max. 5 MB</Typography>
            </Box>
          )}
        </Box>
      </Paper>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
          gap: 1.5
        }}
      >
        {renderInput({
          label: 'Nombre',
          field: 'nombre',
          placeholder: 'Ej. Juan',
          required: true,
          icon: <PersonOutlineRoundedIcon fontSize="small" />
        })}
        {renderInput({
          label: 'Apellido',
          field: 'apellido',
          placeholder: 'Ej. Pérez',
          required: true,
          icon: <PersonOutlineRoundedIcon fontSize="small" />
        })}
        {renderInput({
          label: 'Numero de cedula',
          field: 'cedula',
          placeholder: '12345678',
          required: true,
          icon: <BadgeOutlinedIcon fontSize="small" />
        })}
        {renderInput({
          label: 'Fecha de nacimiento',
          field: 'fecha_nacimiento',
          type: 'date',
          shrink: true,
          required: true,
          icon: <CalendarMonthOutlinedIcon fontSize="small" />
        })}
        {renderInput({
          label: 'Correo electronico',
          field: 'correo',
          placeholder: 'entrenador@apex.com',
          type: 'email',
          icon: <EmailOutlinedIcon fontSize="small" />,
          gridColumn: { xs: 'auto', md: '1 / -1' }
        })}
        {renderInput({
          label: 'Telefono',
          field: 'telefono',
          placeholder: '+58 412-555-0000',
          icon: <PhoneOutlinedIcon fontSize="small" />
        })}
        {renderInput({
          label: 'Direccion',
          field: 'direccion',
          placeholder: 'Ej. Av. Las Industrias...',
          icon: <HomeOutlinedIcon fontSize="small" />
        })}
      </Box>
    </Box>
  );

  const certificationStep = (
    <Box sx={{ ...scrollableStepSx, display: 'grid', gap: 1.75 }}>
      {renderInput({
        label: 'Nivel de instruccion',
        field: 'nivel_instruccion',
        select: true,
        icon: <SchoolOutlinedIcon fontSize="small" />,
        children: instructionLevelOptions.map((option, index) => (
          <MenuItem key={option} value={index === 0 ? '' : option} disabled={index === 0}>
            {option}
          </MenuItem>
        ))
      })}
      {renderInput({
        label: 'Especialidad principal',
        field: 'especialidad',
        placeholder: 'Ej. Preparacion fisica, recepcion, formacion base',
        icon: <SchoolOutlinedIcon fontSize="small" />
      })}
      {renderInput({
        label: 'Experiencia previa',
        field: 'experiencia_previa',
        placeholder: 'Ej. 12 anos entrenando categorias formativas y competitivas...',
        multiline: true,
        minRows: 4,
        gridColumn: { xs: 'auto', md: '1 / -1' }
      })}

      <Typography sx={{ mt: -1.25, fontSize: 12, color: '#94a3b8' }}>
        Resumen breve. Aparecera en el perfil publico.
      </Typography>

      <Box>
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#334155', mb: 1.25 }}>
          Subir certificaciones
        </Typography>
        <Box
          onClick={openCertificacionesPicker}
          onDragOver={(event) => {
            event.preventDefault();
            setDragCertificacionesActive(true);
          }}
          onDragLeave={() => setDragCertificacionesActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragCertificacionesActive(false);
            handleCertificacionesChange({ target: { files: event.dataTransfer.files } });
          }}
          sx={{
            border: '2px dashed',
            borderColor: dragCertificacionesActive ? '#c084fc' : '#d7dee9',
            backgroundColor: dragCertificacionesActive ? '#faf5ff' : '#fcfdff',
            borderRadius: 3.5,
            minHeight: 72,
            px: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            textAlign: 'center',
            transition: 'all 0.2s ease'
          }}
        >
          <input
            ref={certificacionesInputRef}
            hidden
            accept="application/pdf,.pdf"
            multiple
            type="file"
            onChange={handleCertificacionesChange}
          />
          <Box>
            <UploadRoundedIcon sx={{ fontSize: 22, color: '#a855f7', mb: 0.75 }} />
            <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#7c3aed' }}>
              Arrastra archivos aqui o haz clic
            </Typography>
          </Box>
        </Box>
        <Typography sx={{ mt: 1, fontSize: 12, color: '#94a3b8' }}>
          Puedes adjuntar varios PDFs (diplomas, cursos).
        </Typography>
        {!!certificacionesFiles.length && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1.5 }}>
            {certificacionesFiles.map((file) => (
              <Chip
                key={`${file.name}-${file.lastModified}`}
                label={file.name}
                onDelete={() => {
                  setCertificacionesFiles((prev) => prev.filter((item) => !(item.name === file.name && item.lastModified === file.lastModified)));
                }}
                sx={{ borderRadius: 999, maxWidth: '100%' }}
              />
            ))}
          </Box>
        )}
        {!!certificacionesExistentes.length && (
          <>
            <Typography sx={{ mt: 1.25, fontSize: 12, color: '#94a3b8' }}>
              Certificaciones ya registradas
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
              {certificacionesExistentes.map((item) => (
                <Chip
                  key={item}
                  label={getFileLabelFromPath(item)}
                  onDelete={() => {
                    setCertificacionesExistentes((prev) => prev.filter((value) => value !== item));
                  }}
                  sx={{ borderRadius: 999, maxWidth: '100%' }}
                />
              ))}
            </Box>
          </>
        )}
      </Box>

    </Box>
  );

  const administrativeStep = (
    <Box sx={{ ...scrollableStepSx, display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
      <Box sx={{ gridColumn: { xs: 'auto', md: '1 / -1' } }}>
        <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#334155', mb: 0.5 }}>
          Sede asignada
        </Typography>
        <Typography sx={{ fontSize: 12, color: '#94a3b8', mb: 1.5 }}>
          Puedes vincular al entrenador a una o varias sedes desde el inicio.
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {sedes.map((sede) => {
            const sedeId = String(sede._id || sede.id || '');
            const selected = form.sedes_staff.includes(sedeId);

            return (
              <Chip
                key={sedeId}
                label={sede.nombre || 'Sede'}
                icon={<LocationOnOutlinedIcon />}
                onClick={() => toggleSede(sedeId)}
                clickable
                variant={selected ? 'filled' : 'outlined'}
                sx={{
                  position: 'relative',
                  overflow: 'visible',
                  borderRadius: 999,
                  height: 34,
                  fontWeight: 700,
                  color: selected ? '#1e3a8a' : '#475569',
                  borderColor: selected ? '#2563eb' : '#e5e7eb',
                  backgroundColor: selected ? '#dbeafe' : '#ffffff',
                  boxShadow: selected ? '0 8px 18px rgba(37, 99, 235, 0.22)' : 'none',
                  '& .MuiChip-icon': {
                    color: selected ? '#2563eb' : '#94a3b8'
                  },
                  '&::after': selected ? {
                    content: '"✓"',
                    position: 'absolute',
                    top: -7,
                    right: -4,
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    fontSize: 11,
                    fontWeight: 900,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '2px solid #ffffff',
                    boxShadow: '0 2px 8px rgba(37, 99, 235, 0.35)'
                  } : {}
                }}
              />
            );
          })}
          {!sedes.length && (
            <Typography sx={{ fontSize: 13, color: '#94a3b8' }}>
              No hay sedes disponibles para seleccionar.
            </Typography>
          )}
        </Box>
      </Box>

      {renderInput({
        label: 'Tipo de contrato',
        field: 'tipo_contrato',
        select: true,
        icon: <WorkOutlineRoundedIcon fontSize="small" />,
        children: [
          <MenuItem key="empty" value="">Sin definir</MenuItem>,
          <MenuItem key="fijo" value="fijo">Fijo</MenuItem>,
          <MenuItem key="por_horas" value="por_horas">Por horas</MenuItem>,
          <MenuItem key="honorarios_profesionales" value="honorarios_profesionales">Honorarios profesionales</MenuItem>
        ]
      })}
      {renderInput({
        label: 'Fecha de ingreso',
        field: 'fecha_ingreso',
        type: 'date',
        shrink: true,
        icon: <CalendarMonthOutlinedIcon fontSize="small" />
      })}
      {renderInput({
        label: 'Salario base (USD)',
        field: 'salario_base_usd',
        type: 'number',
        placeholder: 'Ej. 120',
        icon: <AccountBalanceOutlinedIcon fontSize="small" />
      })}
      {renderInput({
        label: 'Frecuencia de pago',
        field: 'frecuencia_pago',
        select: true,
        children: [
          <MenuItem key="frecuencia-empty" value="">Sin definir</MenuItem>,
          <MenuItem key="quincenal" value="quincenal">Quincenal</MenuItem>,
          <MenuItem key="semanal" value="semanal">Semanal</MenuItem>,
          <MenuItem key="por_sesion" value="por_sesion">Por sesion</MenuItem>
        ]
      })}

      <Box sx={{ gridColumn: { xs: 'auto', md: '1 / -1' }, mt: 0.5 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#334155', mb: 0.5 }}>
          Metodos de pago
        </Typography>
        <Typography sx={{ fontSize: 12, color: '#94a3b8', mb: 1.5 }}>
          Define uno o varios metodos y completa solo los datos necesarios de cada uno.
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 2 }}>
          {[
            { value: 'pago_movil', label: 'Pago movil', icon: <PhoneIphoneOutlinedIcon /> },
            { value: 'transferencia', label: 'Transferencia', icon: <AccountBalanceOutlinedIcon /> }
          ].map((metodo) => {
            const selected = form.pago_metodos.includes(metodo.value);

            return (
              <Chip
                key={metodo.value}
                label={metodo.label}
                icon={metodo.icon}
                onClick={() => toggleMetodoPago(metodo.value)}
                clickable
                variant={selected ? 'filled' : 'outlined'}
                sx={{
                  borderRadius: 999,
                  height: 34,
                  fontWeight: 700,
                  color: selected ? '#0f172a' : '#475569',
                  borderColor: selected ? '#c7d2fe' : '#e5e7eb',
                  backgroundColor: selected ? '#eef2ff' : '#ffffff'
                }}
              />
            );
          })}
        </Box>

        {form.pago_metodos.includes('pago_movil') && (
          <Box sx={{ mb: 2.5 }}>
            <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#475569', mb: 1.25 }}>
              Pago movil
            </Typography>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' } }}>
              {renderInput({
                label: 'Banco',
                field: 'pago_movil_banco',
                select: true,
                icon: <AccountBalanceOutlinedIcon fontSize="small" />,
                children: [
                  <MenuItem key="pm-empty" value="">Selecciona un banco...</MenuItem>,
                  ...bankOptions.map((bank) => <MenuItem key={`pm-${bank}`} value={bank}>{bank}</MenuItem>),
                  <MenuItem key="pm-otros" value="OTROS">Otros</MenuItem>
                ]
              })}
              {renderInput({
                label: 'Telefono',
                field: 'pago_movil_telefono',
                placeholder: '0412-1234567',
                icon: <PhoneIphoneOutlinedIcon fontSize="small" />
              })}
              {renderInput({
                label: 'Cedula asociada',
                field: 'pago_movil_cedula',
                placeholder: 'V-12345678',
                icon: <BadgeOutlinedIcon fontSize="small" />
              })}
            </Box>
          </Box>
        )}

        {form.pago_metodos.includes('transferencia') && (
          <Box>
            <Typography sx={{ fontSize: 13, fontWeight: 800, color: '#475569', mb: 1.25 }}>
              Transferencia
            </Typography>
            <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
              {renderInput({
                label: 'Banco',
                field: 'transferencia_banco',
                select: true,
                icon: <AccountBalanceOutlinedIcon fontSize="small" />,
                children: [
                  <MenuItem key="tr-empty" value="">Selecciona un banco...</MenuItem>,
                  ...bankOptions.map((bank) => <MenuItem key={`tr-${bank}`} value={bank}>{bank}</MenuItem>),
                  <MenuItem key="tr-otros" value="OTROS">Otros</MenuItem>
                ]
              })}
              {renderInput({
                label: 'Tipo de cuenta',
                field: 'transferencia_tipo_cuenta',
                select: true,
                children: [
                  <MenuItem key="tipo-empty" value="">Selecciona...</MenuItem>,
                  <MenuItem key="ahorro" value="ahorro">Ahorro</MenuItem>,
                  <MenuItem key="corriente" value="corriente">Corriente</MenuItem>
                ]
              })}
              {renderInput({
                label: 'Numero de cuenta',
                field: 'transferencia_numero_cuenta',
                placeholder: '0172-0000-0000-0000-0000',
                icon: <AccountBalanceOutlinedIcon fontSize="small" />
              })}
              {renderInput({
                label: 'Titular',
                field: 'transferencia_titular',
                placeholder: 'Nombre y apellido',
                icon: <PersonOutlineRoundedIcon fontSize="small" />
              })}
              {renderInput({
                label: 'Cedula del titular',
                field: 'transferencia_cedula',
                placeholder: 'V-12345678',
                icon: <BadgeOutlinedIcon fontSize="small" />
              })}
            </Box>
          </Box>
        )}
      </Box>

      <Box sx={{ gridColumn: { xs: 'auto', md: '1 / -1' }, mt: 0.5 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#334155', mb: 0.5 }}>
          Prendas y tallas
        </Typography>
        <Typography sx={{ fontSize: 12, color: '#94a3b8', mb: 1.5 }}>
          Registra las referencias del uniforme para futuras dotaciones.
        </Typography>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' } }}>
          {renderInput({
            label: 'Talla franela',
            field: 'talla_franela',
            placeholder: 'S/M/L/XL'
          })}
          {renderInput({
            label: 'Talla short',
            field: 'talla_short',
            placeholder: 'S/M/L/XL'
          })}
          {renderInput({
            label: 'Talla mono',
            field: 'talla_mono',
            placeholder: 'S/M/L/XL'
          })}
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box
      component="form"
      onSubmit={handleSubmit}
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        bgcolor: '#ffffff',
        borderRadius: { xs: 4, md: 5 },
        overflow: 'hidden',
        minHeight: 0,
        maxHeight: { xs: 'none', md: 'calc(100vh - 200px)' },
        '@media (max-height: 860px)': {
          maxHeight: 'calc(100vh - 220px)'
        }
      }}
    >
      <Box
        sx={{
          px: { xs: 1.5, md: 2.5 },
          pt: { xs: 1.5, md: 2 },
          pb: 1.5,
          background: 'linear-gradient(180deg, #ffffff 0%, #fffaf5 100%)',
          borderBottom: '1px solid #eef2f7'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, mb: 1.5, pr: { xs: 3.5, md: 4.5 } }}>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Box
              sx={{
                width: 36,
                height: 36,
                borderRadius: 2.5,
                background: 'linear-gradient(135deg, #fb7185 0%, #f97316 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff'
              }}
            >
              <PersonOutlineRoundedIcon fontSize="small" />
            </Box>
            <Box>
              <Typography sx={{ fontSize: 11, fontWeight: 900, letterSpacing: 0.4, textTransform: 'uppercase', color: '#f97316', mb: 0.35 }}>
                Paso {tab + 1} de 3
              </Typography>
              <Typography sx={{ fontSize: { xs: 18, md: 24 }, fontWeight: 900, color: '#0f172a', lineHeight: 1.1 }}>
                {isEditMode ? 'Editar entrenador' : 'Nuevo entrenador'}
              </Typography>
              <Typography sx={{ fontSize: 13, color: '#64748b', mt: 0.45 }}>
                {isEditMode
                  ? 'Actualiza la informacion del entrenador usando el mismo flujo de registro.'
                  : 'Registra al entrenador y queda listo para asignarle alumnos y horarios.'}
              </Typography>
            </Box>
          </Box>
        </Box>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
            gap: 0.9
          }}
        >
          {steps.map((stepItem) => {
            const isActive = tab === stepItem.id;
            const isPast = tab > stepItem.id;

            return (
              <Paper
                key={stepItem.id}
                onClick={() => setTab(stepItem.id)}
                elevation={0}
                sx={{
                  p: 1,
                  borderRadius: 3,
                  border: '1px solid',
                  borderColor: isActive ? '#dbe4ff' : '#edf2f7',
                  backgroundColor: isActive ? '#f6f8ff' : '#ffffff',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    borderColor: '#dbe4ff',
                    backgroundColor: '#f8faff'
                  }
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                  <Box
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: 12,
                      color: isActive ? '#ffffff' : '#334155',
                      backgroundColor: isActive ? '#0f172a' : isPast ? '#fde68a' : '#e2e8f0'
                    }}
                  >
                    {stepItem.step}
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>{stepItem.title}</Typography>
                    <Typography sx={{ fontSize: 11, color: '#64748b', lineHeight: 1.15 }}>{stepItem.description}</Typography>
                  </Box>
                </Box>
              </Paper>
            );
          })}
        </Box>
      </Box>

      <Box sx={{ p: { xs: 1.5, md: 2 }, backgroundColor: '#fcfcfd', flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Paper
          elevation={0}
          sx={{
            ...panelSx,
            p: { xs: 1.5, md: 2 },
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            scrollbarWidth: 'thin',
            '&::-webkit-scrollbar': {
              width: 8
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: '#cbd5e1',
              borderRadius: 999
            },
            '&::-webkit-scrollbar-track': {
              backgroundColor: '#f8fafc',
              borderRadius: 999
            }
          }}
        >
          {tab === TAB_BASICO && basicStep}
          {tab === TAB_CERTIFICACIONES && certificationStep}
          {tab === TAB_ADMINISTRATIVO && administrativeStep}

          {!!error && <Alert severity="error" sx={{ mt: 2.5, borderRadius: 3 }}>{error}</Alert>}
          {!!success && <Alert severity="success" sx={{ mt: 2.5, borderRadius: 3 }}>{success}</Alert>}
        </Paper>

        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.5,
            mt: 1.5,
            flexWrap: 'wrap',
            position: 'sticky',
            bottom: 0,
            zIndex: 2,
            py: 0.9,
            px: 0.5,
            background: 'linear-gradient(180deg, rgba(252, 252, 253, 0.85) 0%, #fcfcfd 18px)',
            borderTop: '1px solid #eef2f7'
          }}
        >
          <Button
            type="button"
            variant="outlined"
            onClick={onCancel}
            sx={{
              borderRadius: 3,
              px: 2,
              minHeight: 42,
              borderColor: '#e5e7eb',
              color: '#475569',
              fontWeight: 700
            }}
          >
            Cancelar
          </Button>

          <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {tab > TAB_BASICO && (
              <Button
                type="button"
                variant="text"
                onClick={prevTab}
                startIcon={<ArrowBackRoundedIcon />}
                sx={{ color: '#64748b', fontWeight: 700, minHeight: 42, px: 1.25 }}
              >
                Anterior
              </Button>
            )}

            {tab < TAB_ADMINISTRATIVO ? (
              <Button
                type="button"
                variant="contained"
                onClick={nextTab}
                endIcon={<ArrowForwardRoundedIcon />}
                sx={{
                  borderRadius: 3,
                  px: 2.1,
                  minHeight: 42,
                  backgroundColor: '#0f172a',
                  boxShadow: '0 14px 26px rgba(15, 23, 42, 0.18)',
                  fontWeight: 800,
                  '&:hover': {
                    backgroundColor: '#1e293b'
                  }
                }}
              >
                Siguiente
              </Button>
            ) : (
              <Button
                type="submit"
                variant="contained"
                disabled={saving || !canSubmit}
                sx={{
                  borderRadius: 3,
                  px: 2.1,
                  minHeight: 42,
                  backgroundColor: '#0f172a',
                  boxShadow: '0 14px 26px rgba(15, 23, 42, 0.18)',
                  fontWeight: 800,
                  '&:hover': {
                    backgroundColor: '#1e293b'
                  }
                }}
              >
                {saving ? 'Guardando...' : (isEditMode ? 'Guardar cambios' : 'Crear entrenador')}
              </Button>
            )}
          </Box>
      </Box>
      </Box>
    </Box>
  );
}

export default EntrenadorForm;
