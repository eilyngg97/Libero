
import React, { useState, useRef, useEffect } from 'react';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import { useSede } from '../context/SedeContext';
import { useNavigate } from 'react-router-dom';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import { MenuItem, FormControl, InputLabel, Select, TextField, Autocomplete, CircularProgress, Checkbox, FormControlLabel, InputAdornment, Box, Paper, Typography, Switch } from '@mui/material';
import './Alumnos.css';
import { useDolar } from '../context/DolarContext';
import { metodoRequiereReferencia, normalizeMetodoPago } from '../utils/paymentMethod';
import { getCategoriaPorFechaNacimiento, CATEGORIAS_DISPONIBLES } from '../utils/categoria';
import PaymentIcon from '@mui/icons-material/Payment';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CloseIcon from '@mui/icons-material/Close';
import IconButton from '@mui/material/IconButton';

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

const TIPOS_SANGRE = ['O+', 'A+', 'B+', 'O-', 'A-', 'AB+', 'B-', 'AB-', 'Por determinar / Desconocido'];
const SEXOS = ['Femenino', 'Masculino'];
const DIVISIONES = ['Primera división', 'Segunda división', 'Tercera división'];


// Opciones de tipo de mensualidad
export const OPCIONES_MENSUALIDAD = [
  { id: 'monto_sede', label: 'Monto sede' },
  { id: 'monto_personalizado', label: 'Monto personalizado' },
  { id: 'beca_completa', label: 'Beca completa' }
];

// Estados permitidos para mensualidad
const ESTADOS_MENSUALIDAD = ['Pendiente', 'Pagado', 'Insolvente', 'Exonerado'];
const METODOS_PAGO = ['Pago movil', 'Transferencia', 'Efectivo'];

const getLocalInputDate = (dateValue = new Date()) => {
  const date = new Date(dateValue);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};

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


function Alumnos() {
  // Estado para el formulario
  const [form, setForm] = useState({
    fecha_inscripcion: new Date().toISOString().split('T')[0],
    fecha_inicio_cobro: new Date().toISOString().split('T')[0],
    division: '',
    sexo: '',
    tipo_mensualidad: 'monto_sede',
    numero_franela: '',
    habilitar_pago_cuotas: false,
    aplicar_recargo_mensualidad: true,
    dia_limite_personalizado: '',
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
  const [numeroFranelaDuplicado, setNumeroFranelaDuplicado] = useState(false);
  const [numeroFranelaCheckLoading, setNumeroFranelaCheckLoading] = useState(false);
  const [numeroFranelaCheckMsg, setNumeroFranelaCheckMsg] = useState('');
  const [numerosFranelaDisponibles, setNumerosFranelaDisponibles] = useState([]);
  const [numerosFranelaOcupados, setNumerosFranelaOcupados] = useState([]);
  // Estados para la primera mensualidad
  const [showMensualidadModal, setShowMensualidadModal] = useState(false);
  const [nuevoAlumnoId, setNuevoAlumnoId] = useState(null);
  const [montoMensualidad, setMontoMensualidad] = useState('');
  const [loadingMensualidad, setLoadingMensualidad] = useState(false);
  const [errorMensualidad, setErrorMensualidad] = useState(null);
  const [estadoMensualidad, setEstadoMensualidad] = useState('Pendiente');
  const [montoInscripcion, setMontoInscripcion] = useState('');
  const [montoPagadoInscripcion, setMontoPagadoInscripcion] = useState('');
  const [metodoPagoInscripcion, setMetodoPagoInscripcion] = useState(METODOS_PAGO[0]);
  const [fechaPagoInscripcion, setFechaPagoInscripcion] = useState(() => getLocalInputDate());
  const [referenciaPagoInscripcion, setReferenciaPagoInscripcion] = useState('');
  const [comprobantePagoInscripcion, setComprobantePagoInscripcion] = useState(null);
  // const [sedes, setSedes] = useState([]); // Eliminado porque no se usa
  const [categoria, setCategoria] = useState('');
  const navigate = useNavigate();
  const { dolar } = useDolar();
  const rolActual = String(localStorage.getItem('rol') || '').trim().toLowerCase();
  const esAdmin = rolActual === 'admin' || rolActual === 'administrador';

  const montoInscripcionNum = Number(montoInscripcion) || 0;
  const montoPrimeraMensualidadNum = Number(montoMensualidad) || 0;
  const montoPagadoInscripcionNum = Number(montoPagadoInscripcion) || 0;
  const totalInscripcionUsd = Number((montoInscripcionNum + montoPrimeraMensualidadNum).toFixed(2));
  const tasaBCV = Number(dolar?.promedio) || 0;
  const totalInscripcionBs = tasaBCV > 0
    ? Number((totalInscripcionUsd * tasaBCV).toFixed(2))
    : null;
  const montoPagadoInscripcionBs = tasaBCV > 0
    ? Number((montoPagadoInscripcionNum * tasaBCV).toFixed(2))
    : null;
  const estatusPrimeraMensualidad = form.habilitar_pago_cuotas ? 'Abono' : estadoMensualidad;
  const requiereDatosPagoInscripcion =
    !['Pendiente', 'Insolvente', 'Exonerado'].includes(estatusPrimeraMensualidad);
  const requiereReferenciaInscripcion =
    requiereDatosPagoInscripcion && metodoRequiereReferencia(metodoPagoInscripcion);

  useEffect(() => {
    if (!requiereDatosPagoInscripcion) {
      if (metodoPagoInscripcion !== METODOS_PAGO[0]) setMetodoPagoInscripcion(METODOS_PAGO[0]);
      if (fechaPagoInscripcion !== getLocalInputDate()) setFechaPagoInscripcion(getLocalInputDate());
    }
  }, [requiereDatosPagoInscripcion, metodoPagoInscripcion, fechaPagoInscripcion]);

  useEffect(() => {
    if (!requiereReferenciaInscripcion) {
      if (referenciaPagoInscripcion) setReferenciaPagoInscripcion('');
      if (comprobantePagoInscripcion) setComprobantePagoInscripcion(null);
    }
  }, [requiereReferenciaInscripcion, referenciaPagoInscripcion, comprobantePagoInscripcion]);

  const modalInputSx = {
    '& .MuiOutlinedInput-root': {
      borderRadius: 2,
      backgroundColor: '#ffffff'
    },
    '& .MuiOutlinedInput-notchedOutline': {
      borderColor: '#e2e8f0'
    },
    '& .MuiInputLabel-root': {
      color: '#64748b'
    }
  };
    // Calcular categoria automaticamente
    useEffect(() => {
      const cat = getCategoriaPorFechaNacimiento(form.fecha_nacimiento);
      setCategoria(cat);
      setForm(prev => ({ ...prev, categoria: cat }));
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
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/numeros-franela/disponibilidad?categoria=${encodeURIComponent(categoriaNormalizada)}`);
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
  }, [form.categoria]);

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
  // Al montar, establecer la sede desde el contexto o localStorage
  useEffect(() => {
    let sede = sedeSeleccionada;
    if (!sede) {
      const stored = localStorage.getItem('sedeSeleccionada');
      sede = stored ? JSON.parse(stored) : '';
    }
    if (sede && sede._id && sede.nombre) {
      setForm(prev => ({
        ...prev,
        sede: {
          _id: sede._id,
          nombre: sede.nombre,
          costo: sede.costo
        }
      }));
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
    } else if (name === 'aplicar_recargo_mensualidad') {
      setForm((prev) => ({ ...prev, aplicar_recargo_mensualidad: checked }));
    } else if (name === 'dia_limite_personalizado') {
      setForm((prev) => ({ ...prev, dia_limite_personalizado: value }));
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

    const metodoPagoNormalizado = normalizeMetodoPago(metodoPagoInscripcion);
    if (form.habilitar_pago_cuotas) {
      const montoPagado = Number(montoPagadoInscripcion);
      if (!Number.isFinite(montoPagado) || montoPagado <= 0) {
        setErrorMensualidad('Debes ingresar un monto pagado en USD mayor a 0 para registrar el abono.');
        setLoadingMensualidad(false);
        return;
      }
    }
    const requiereReferenciaPorEstado =
      metodoRequiereReferencia(metodoPagoNormalizado) &&
      !['Pendiente', 'Insolvente', 'Exonerado'].includes(estatusPrimeraMensualidad);

    if (requiereReferenciaPorEstado) {
      if (!/^[0-9]{6,}$/.test(String(referenciaPagoInscripcion || '').trim())) {
        setErrorMensualidad('Debes ingresar minimo 6 ultimos digitos de la referencia de pago.');
        setLoadingMensualidad(false);
        return;
      }
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
      const formDataMensualidad = new FormData();
      formDataMensualidad.append('es_registro_alumno', 'true');
      formDataMensualidad.append('id_alumno', dataAlumno._id);
      formDataMensualidad.append('monto_esperado', String(totalInscripcionUsd));
      formDataMensualidad.append('monto_primera_mensualidad', String(montoMensualidad));
      formDataMensualidad.append('monto_inscripcion', String(montoInscripcion));
      formDataMensualidad.append('monto_equivalente_bs', totalInscripcionBs !== null ? String(totalInscripcionBs) : '');
      formDataMensualidad.append('monto_esperado_bs', totalInscripcionBs !== null ? String(totalInscripcionBs) : '');
      formDataMensualidad.append('estatus', estatusPrimeraMensualidad);
      if (form.habilitar_pago_cuotas) {
        formDataMensualidad.append('monto_pagado', String(montoPagadoInscripcion));
        formDataMensualidad.append('monto_pagado_bs', montoPagadoInscripcionBs !== null ? String(montoPagadoInscripcionBs) : '');
      }
      formDataMensualidad.append('metodo_pago', metodoPagoNormalizado);
      formDataMensualidad.append(
        'referencia',
        requiereReferenciaPorEstado
          ? String(referenciaPagoInscripcion || '').trim()
          : ''
      );
      formDataMensualidad.append('fecha_pago', fechaPagoInscripcion);
      if (comprobantePagoInscripcion) {
        formDataMensualidad.append('comprobante', comprobantePagoInscripcion);
      }

      const resMens = await fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades/primera`, {
        method: 'POST',
        body: formDataMensualidad
      });
      if (!resMens.ok) {
        const errData = await resMens.json();
        throw new Error(errData.error || 'Error al registrar mensualidad');
      }
      setShowMensualidadModal(false);
      setMontoMensualidad('');
      setMontoInscripcion('');
      setMontoPagadoInscripcion('');
      setEstadoMensualidad('Pendiente');
      setMetodoPagoInscripcion(METODOS_PAGO[0]);
      setFechaPagoInscripcion(getLocalInputDate());
      setReferenciaPagoInscripcion('');
      setComprobantePagoInscripcion(null);
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
        if (!String(cleanForm.dia_limite_personalizado || '').trim()) {
          delete cleanForm.dia_limite_personalizado;
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
        fecha_inicio_cobro: new Date().toISOString().split('T')[0],
        division: '',
        sexo: '',
        tipo_mensualidad: 'monto_sede',
        numero_franela: '',
        habilitar_pago_cuotas: false,
        aplicar_recargo_mensualidad: true,
        dia_limite_personalizado: '',
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
      {key: 'fecha_inicio_cobro', label: 'Fecha de inicio de cobro' },
      { key: 'nombres', label: 'Nombres del alumno' },
      { key: 'apellidos', label: 'Apellidos del alumno' },
      { key: 'sexo', label: 'Sexo' },
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

    if (!esFechaInicioCobroDelAnioActual(form.fecha_inicio_cobro)) {
      setError(`La fecha de inicio de cobro debe pertenecer al año actual (${ANIO_ACTUAL}).`);
      return;
    }

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
      const montoSede = Number(form.sede?.costo);
      const montoSugerido = Number.isFinite(montoSede) && montoSede > 0 ? String(montoSede) : '';
      setMontoMensualidad(montoSugerido);
      setMontoInscripcion(montoSugerido);
      setMontoPagadoInscripcion('');
      setEstadoMensualidad(form.habilitar_pago_cuotas ? 'Abono' : 'Pendiente');
      setMetodoPagoInscripcion(METODOS_PAGO[0]);
      setFechaPagoInscripcion(getLocalInputDate());
      setReferenciaPagoInscripcion('');
      setComprobantePagoInscripcion(null);
      setShowMensualidadModal(true);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#fdfdfd', py: { xs: 2, md: 3 } }}>
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

            <Paper sx={{ p: 2.5, borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box>
                  <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                    Aplicar recargo mensual
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: '#64748b' }}>
                    Si esta activo, al vencerse la tolerancia se sumara recargo en USD.
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
                    />
                  }
                  label=""
                />
              </Box>
            </Paper>

            <Paper sx={{ p: 2.5, borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
              <TextField
                id="input-dia-limite-personalizado"
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
            />
          </div>
          <div className="form-row">
            <TextField id="outlined-basic-fecha-nacimiento" label="Fecha de nacimiento" name="fecha_nacimiento" type="date" variant="outlined" value={form.fecha_nacimiento || ''} onChange={handleChange} fullWidth size="small" InputLabelProps={{ shrink: true }} sx={{ my: 1 }} />
            <FormControl fullWidth size="small" sx={{ my: 1 }}>
              <InputLabel id="sexo-label">Sexo *</InputLabel>
              <Select
                labelId="sexo-label"
                id="select-sexo"
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
              <InputLabel id="categoria-label">{esAdmin ? 'Categoría' : 'Categoría asignada'}</InputLabel>
              <Select
                labelId="categoria-label"
                id="select-categoria"
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
              <InputLabel id="division-label">División</InputLabel>
              <Select
                labelId="division-label"
                id="select-division"
                name="division"
                value={form.division || ''}
                label="División"
                onChange={handleChange}
              >
                <MenuItem value=""><em>Seleccionar</em></MenuItem>
                {DIVISIONES.map((division) => (
                  <MenuItem key={division} value={division}>{division}</MenuItem>
                ))}
              </Select>
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
          </div>
          <div className="form-row">
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
            <FormControl fullWidth required sx={{ my: 1 }}>
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
                sx={{ my: 1 }}
              />
              <Box sx={{ my: 1 }} />
            </div>
          )}
          <div className="form-row">
            <TextField id="outlined-basic-telefono" label="Teléfono" name="telefono" type="tel" variant="outlined" value={form.telefono || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
            <TextField id="outlined-basic-domicilio" label="Dirección" name="domicilio" variant="outlined" value={form.domicilio || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }}/>
          </div>
          <div className="form-row">
            <TextField id="outlined-basic-peso" InputProps={{ endAdornment: <InputAdornment position="end">kg</InputAdornment> }} label="Peso" name="peso" variant="outlined" value={form.peso || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
            <TextField id="outlined-basic-talla" InputProps={{ endAdornment: <InputAdornment position="end">m</InputAdornment> }} label="Talla" name="talla" variant="outlined" value={form.talla || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
          </div>
          <div className="form-row">
            <TextField id="outlined-basic-proyeccion" label="Proyección" name="proyeccion" variant="outlined" value={form.proyeccion || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
            <TextField id="outlined-basic-alcance" InputProps={{ endAdornment: <InputAdornment position="end">m</InputAdornment> }} label="Alcance" name="alcance" variant="outlined" value={form.alcance || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
          </div>
          <div className="form-row">
            <TextField id="outlined-basic-envergadura" label="Envergadura" name="envergadura" variant="outlined" value={form.envergadura || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
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
              </Select>
            </FormControl>
          </div>
          <div className="form-row">
           <TextField id="outlined-basic-antecedentes" label="Antecedentes patológicos" name="antecedentes_patologicos" variant="outlined" value={form.antecedentes_patologicos || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
            <TextField id="outlined-basic-alergias" label="Alergias" name="alergias" variant="outlined" value={form.alergias || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }} />
          </div>
          <div className="form-row">
            <TextField id="outlined-basic-observaciones" label="Observaciones" name="observaciones" variant="outlined" value={form.observaciones || ''} onChange={handleChange} fullWidth size="small" multiline minRows={2} sx={{ my: 1 }} />
            <Autocomplete
              multiple
              freeSolo
              options={[]}
              value={form.etiquetas || []}
              onChange={(event, newValue) => {
                setForm(prev => ({ ...prev, etiquetas: newValue }));
              }}
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
            <TextField id="outlined-basic-rep-nombres" label="Nombres del representante *" name="rep_nombres" variant="outlined" value={form.rep_nombres || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }}/>
            <TextField id="outlined-basic-rep-apellidos" label="Apellidos del representante *" name="rep_apellidos" variant="outlined" value={form.rep_apellidos || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }}/>
          </div>
          <div className="form-row">
            <Autocomplete
              freeSolo
              id="autocomplete-rep-cedula"
              options={opcionesRepresentantes}
              getOptionLabel={option => option.cedula ? `${option.cedula} - ${option.nombres} ${option.apellidos}` : ''}
              inputValue={form.rep_cedula || ''}
              onInputChange={(event, newInputValue, reason) => {
                if (reason === 'input') {
                  setForm(prev => ({ ...prev, rep_cedula: newInputValue }));
                  buscarOpcionesRepresentantes(newInputValue);
                }
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
                    rep_fecha_nacimiento: value.fecha_nacimiento ? String(value.fecha_nacimiento).slice(0, 10) : '',
                    rep_correo: value.correo || '',
                    rep_direccion: value.direccion || value.domicilio || '',
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
                  size="small"
                  sx={{ my: 1 }}
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
          <div className="form-row">
            <TextField id="outlined-basic-rep-correo" label="Correo del representante" name="rep_correo" type="email" variant="outlined" value={form.rep_correo || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }}/>
            <TextField id="outlined-basic-rep-direccion" label="Dirección del representante" name="rep_direccion" variant="outlined" value={form.rep_direccion || ''} onChange={handleChange} fullWidth size="small" sx={{ my: 1 }}/>
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
      <Dialog
        open={!!showMensualidadModal}
        onClose={() => setShowMensualidadModal(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)',
            px: { xs: 0.5, sm: 1.5 },
            py: 0.5
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0f172a', pb: 0.5 }}>
          Registrar inscripcion
        </DialogTitle>
        <DialogContent sx={{ pt: 1.25, pb: 1.5 }}>
          <DialogContentText sx={{ color: '#64748b', mb: 1.25 }}>
            Se sugiere el monto base de la sede para ambos conceptos, pero puedes ajustarlo si aplica.
          </DialogContentText>
          <Box
            sx={{
              p: 2,
              borderRadius: 2.5,
              border: '1px solid #dbe3ef',
              borderLeft: '4px solid #f97316',
              background: 'linear-gradient(135deg, #f8fbff 0%, #fdfdfd 100%)',
              mb: 2
            }}
          >
            <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#64748b', mb: 0.5 }}>
              Datos base
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr auto' }, gap: 0.75, alignItems: 'center' }}>
              <Typography variant="body2" sx={{ color: '#334155' }}>
                Sede seleccionada
              </Typography>
              <Typography variant="body2" sx={{ color: '#0f172a', fontWeight: 800 }}>
                {form.sede?.nombre || '-'}
              </Typography>
              <Typography variant="body2" sx={{ color: '#334155' }}>
                Monto base sede
              </Typography>
              <Typography variant="body2" sx={{ color: '#0f172a', fontWeight: 800 }}>
                {form.sede?.costo !== undefined && form.sede?.costo !== null && form.sede?.costo !== ''
                  ? `$${Number(form.sede.costo).toFixed(2)}`
                  : 'No disponible'}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5, my: 1.5 }}>
            <TextField
              label="Monto de inscripcion"
              type="number"
              value={montoInscripcion}
              onChange={e => setMontoInscripcion(e.target.value)}
              fullWidth
              size="small"
              sx={modalInputSx}
              inputProps={{ min: 0, step: '0.01' }}
              InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
            />
            <TextField
              label="Monto de primera mensualidad"
              type="number"
              value={montoMensualidad}
              onChange={e => setMontoMensualidad(e.target.value)}
              fullWidth
              size="small"
              sx={modalInputSx}
              inputProps={{ min: 0, step: '0.01' }}
              InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
            />
          </Box>

          <Box
            sx={{
              p: 2,
              borderRadius: 2.5,
              border: '1px solid #1e2a57',
              background: '#0B0F2A',
              mb: 4
            }}
          >
            <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#cbd5e1', mb: 0.75 }}>
              Resumen de inscripcion
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr auto' }, gap: 0.75, alignItems: 'center' }}>
              <Typography variant="body2" sx={{ color: '#e2e8f0', fontWeight: 700 }}>
                Total USD
              </Typography>
              <Typography sx={{ color: '#ffffff', fontWeight: 900, fontSize: 20, lineHeight: 1.1 }}>
                ${totalInscripcionUsd.toFixed(2)}
              </Typography>
              <Typography variant="body2" sx={{ color: '#e2e8f0', fontWeight: 700 }}>
                Equivalente Bs
              </Typography>
              <Typography variant="body2" sx={{ color: '#ffffff', fontWeight: 800 }}>
                {totalInscripcionBs !== null ? `Bs ${totalInscripcionBs.toFixed(2)}` : 'No disponible (sin tasa BCV)'}
              </Typography>
            </Box>
          </Box>

          <Paper
            sx={{
              p: 1.5,
              borderRadius: 2,
              border: '1px solid #e2e8f0',
              bgcolor: '#ffffff',
              mb: 2
            }}
          >
            <FormControlLabel
              sx={{ m: 0 }}
              control={
                <Checkbox
                  checked={!!form.habilitar_pago_cuotas}
                  onChange={(e) => {
                    const habilitar = e.target.checked;
                    setForm((prev) => ({ ...prev, habilitar_pago_cuotas: habilitar }));
                    setEstadoMensualidad(habilitar ? 'Abono' : 'Pendiente');
                  }}
                  color="primary"
                />
              }
              label="Habilitar pago en cuotas"
            />
          </Paper>

          {form.habilitar_pago_cuotas && (
            <TextField
              label="Monto pagado (USD)"
              type="number"
              value={montoPagadoInscripcion}
              onChange={e => setMontoPagadoInscripcion(e.target.value)}
              fullWidth
              size="small"
              sx={{ ...modalInputSx, mb: 1.5 }}
              inputProps={{ min: 0, step: '0.01' }}
              InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }}
              helperText="Monto abonado en este primer pago."
            />
          )}

          {!form.habilitar_pago_cuotas && (
            <FormControl fullWidth sx={{ ...modalInputSx, my: 1.25 }} size="small">
              <InputLabel id="estado-label">Estado de pago</InputLabel>
              <Select
                labelId="estado-label"
                value={estadoMensualidad}
                label="Estado de pago"
                onChange={e => setEstadoMensualidad(e.target.value)}
              >
                {ESTADOS_MENSUALIDAD.map(e => (
                  <MenuItem key={e} value={e}>{e}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {requiereDatosPagoInscripcion && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              <TextField
                label="Fecha de pago"
                type="date"
                value={fechaPagoInscripcion}
                onChange={e => setFechaPagoInscripcion(e.target.value)}
                fullWidth
                size="small"
                sx={modalInputSx}
                InputLabelProps={{ shrink: true }}
              />
              <FormControl fullWidth size="small" sx={modalInputSx}>
                <InputLabel id="metodo-pago-inscripcion-label">Metodo de pago</InputLabel>
                <Select
                  labelId="metodo-pago-inscripcion-label"
                  value={metodoPagoInscripcion}
                  label="Metodo de pago"
                  onChange={e => setMetodoPagoInscripcion(normalizeMetodoPago(e.target.value))}
                >
                  {METODOS_PAGO.map((metodo) => (
                    <MenuItem key={metodo} value={metodo}>{metodo}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          )}

          {requiereReferenciaInscripcion && (
            <TextField
              label="Referencia de pago (minimo 6 ultimos digitos)"
              value={referenciaPagoInscripcion}
              onChange={(e) => setReferenciaPagoInscripcion(e.target.value.replace(/\D/g, ''))}
              fullWidth
              size="small"
              sx={{ ...modalInputSx, mt: 1.5, mb: 0.5 }}
              inputProps={{ minLength: 6 }}
            />
          )}

          {requiereReferenciaInscripcion && (
            <>
              <Box
                component="label"
                sx={{
                  mt: 2,
                  border: '1px dashed #cbd5f0',
                  borderRadius: 2,
                  p: 2,
                  textAlign: 'center',
                  backgroundColor: '#f8fafc',
                  display: 'block',
                  cursor: 'pointer'
                }}
              >
                <Box
                  sx={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    backgroundColor: '#fff2e7',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mx: 'auto',
                    mb: 1
                  }}
                >
                  <PaymentIcon sx={{ color: '#ff7a00', fontSize: 18 }} />
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
                  Haz clic para adjuntar comprobante
                </Typography>
                <Typography variant="caption" sx={{ color: '#94a3b8' }}>PNG, JPG hasta 5MB</Typography>
                <input
                  type="file"
                  hidden
                  accept="image/*"
                  onChange={(e) => setComprobantePagoInscripcion(e.target.files?.[0] || null)}
                />
              </Box>
              {comprobantePagoInscripcion && (
                <Box
                  sx={{
                    mt: 1.5,
                    px: 1.5,
                    py: 1,
                    border: '1px solid #e2e8f0',
                    borderRadius: 2,
                    bgcolor: '#ffffff',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 1
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                    <InsertDriveFileIcon sx={{ color: '#fb923c', fontSize: 18 }} />
                    <Typography
                      variant="body2"
                      sx={{ color: '#475569', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {comprobantePagoInscripcion.name}
                    </Typography>
                  </Box>
                  <IconButton size="small" onClick={() => setComprobantePagoInscripcion(null)}>
                    <CloseIcon sx={{ fontSize: 16, color: '#94a3b8' }} />
                  </IconButton>
                </Box>
              )}
            </>
          )}

          {errorMensualidad && <div style={{ color: 'red', marginBottom: 8 }}>{errorMensualidad}</div>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.25 }}>
          <Button
            onClick={() => setShowMensualidadModal(false)}
            disabled={loadingMensualidad}
            sx={{ color: '#64748b', fontWeight: 700 }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={registrarPrimeraMensualidad}
            disabled={!montoMensualidad || !montoInscripcion || (form.habilitar_pago_cuotas && !montoPagadoInscripcion) || loadingMensualidad}
            sx={{ bgcolor: '#ff7a00', '&:hover': { bgcolor: '#f97316' }, fontWeight: 800, borderRadius: 2, px: 3 }}
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
