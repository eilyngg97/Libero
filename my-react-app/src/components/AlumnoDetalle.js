import Chip from '@mui/material/Chip';
import React, { useEffect, useState } from "react";
import FitnessCenterIcon from "@mui/icons-material/FitnessCenter";
import HeightIcon from "@mui/icons-material/Height";
import TimelineIcon from "@mui/icons-material/Timeline";
import AccessibilityIcon from "@mui/icons-material/Accessibility";
import EmojiPeopleIcon from "@mui/icons-material/EmojiPeople";
import BloodtypeIcon from "@mui/icons-material/Bloodtype";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import HealingIcon from "@mui/icons-material/Healing";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import BadgeIcon from "@mui/icons-material/Badge";
import PhoneAndroidIcon from "@mui/icons-material/PhoneAndroid";
import HomeIcon from "@mui/icons-material/Home";
import SportsVolleyballIcon from "@mui/icons-material/SportsVolleyball";
import PersonIcon from "@mui/icons-material/Person";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import { useParams, useNavigate } from "react-router-dom";
import { Button, Typography, Paper, Avatar, Dialog, DialogTitle, DialogContent, Box, IconButton } from "@mui/material";
import CloseIcon from '@mui/icons-material/Close';
import Grid from "@mui/material/Grid";
import { mediaUrl } from '../utils/mediaUrl';

function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return "";
  const hoy = new Date();
  const nacimiento = new Date(fechaNacimiento);
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const m = hoy.getMonth() - nacimiento.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) {
    edad--;
  }
  return edad;
}

function formatFecha(fecha) {
  if (!fecha) return "-";
  const date = new Date(fecha);
  if (Number.isNaN(date.getTime())) return "-";
  const dia = String(date.getDate()).padStart(2, '0');
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const anio = date.getFullYear();
  return `${dia}/${mes}/${anio}`;
}

function formatTipoMensualidad(tipo) {
  const normalizado = String(tipo || '').trim().toLowerCase();
  if (!normalizado) return '-';
  if (normalizado === 'monto_sede') return 'Monto por sede';
  if (normalizado === 'monto_personalizado') return 'Monto personalizado';
  if (normalizado === 'beca_completa') return 'Beca completa';
  return tipo;
}

function formatTipoMovimiento(tipo) {
  const key = String(tipo || '').toUpperCase();
  if (key === 'BAJA') return 'Baja';
  if (key === 'REINGRESO' || key === 'REACTIVACION') return 'Reingreso';
  return tipo || '-';
}

// Calcula el IMC y su clasificación
function calcularIMC(peso, talla) {
  const pesoNum = parseFloat(peso);
  const tallaNum = parseFloat(talla);
  if (!pesoNum || !tallaNum) return { imc: '', clasificacion: '' };
  const imc = pesoNum / (tallaNum * tallaNum);
  let clasificacion = '';
  if (imc < 18.5) clasificacion = 'Bajo peso';
  else if (imc < 25) clasificacion = 'Peso normal (Saludable)';
  else if (imc < 30) clasificacion = 'Sobrepeso';
  else clasificacion = 'Obesidad';
  return { imc: imc.toFixed(2), clasificacion };
}

function AlumnoDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [alumno, setAlumno] = useState(null);
  const [representante, setRepresentante] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openFotoAlumno, setOpenFotoAlumno] = useState(false);
  const [openFotoCedula, setOpenFotoCedula] = useState(false);
  const [openHistorialEstados, setOpenHistorialEstados] = useState(false);
  const [historialEstados, setHistorialEstados] = useState([]);
  const [historialLoading, setHistorialLoading] = useState(false);
  const [historialError, setHistorialError] = useState(null);

  const fetchHistorialEstados = async () => {
    setHistorialLoading(true);
    setHistorialError(null);
    try {
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const res = await fetch(
        `${process.env.REACT_APP_API_URL}/api/alumnos/${id}/historial-estados`,
        { headers }
      );
      if (!res.ok) throw new Error('No se pudo cargar el historial de estados');
      const data = await res.json();
      setHistorialEstados(Array.isArray(data) ? data : []);
    } catch (err) {
      setHistorialError(err.message);
    } finally {
      setHistorialLoading(false);
    }
  };

  const handleOpenHistorialEstados = async () => {
    setOpenHistorialEstados(true);
    await fetchHistorialEstados();
  };

  useEffect(() => {
    const fetchAlumno = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `${process.env.REACT_APP_API_URL}/api/alumnos/${id}`
        );
        if (!res.ok) throw new Error("Error al obtener alumno");
        const data = await res.json();
        setAlumno(data);
        setError(null);
        console.log("Alumno obtenido:", data);
        // Si el representante es solo un id, consultarlo
        if (data.representante && typeof data.representante === "string") {
          console.log("Buscando representante con ID:", data.representante);
          const repRes = await fetch(
            `${process.env.REACT_APP_API_URL}/api/representantes/${data.representante}`
          );
          if (repRes.ok) {
            const repData = await repRes.json();
            setRepresentante(repData);
          }
        } else if (
          data.representante &&
          typeof data.representante === "object"
        ) {
          setRepresentante(data.representante);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchAlumno();
  }, [id]);

  if (loading) return <Typography>Cargando...</Typography>;
  if (error) return <Typography color="error">{error}</Typography>;
  if (!alumno) return null;

  // Solo calcular IMC si alumno está definido
  const { imc, clasificacion } = calcularIMC(alumno.peso, alumno.talla);
  const imcNumero = Number(imc) || 0;
  const imcPercent = imcNumero ? Math.min(100, (imcNumero / 40) * 100) : 0;
  const sedeNombre = alumno.sede && typeof alumno.sede === "object" ? alumno.sede.nombre : alumno.sede;
  const estaRetirado = alumno.dado_de_baja || alumno.activo === false;
  const observacionesTexto = alumno.observaciones?.trim() || 'Sin observaciones registradas';
  const etiquetas = Array.isArray(alumno.etiquetas) ? alumno.etiquetas : [];
  const getSiNoChipSx = (enabled) => ({
    width: 46,
    fontWeight: 700,
    bgcolor: enabled ? '#dcfce7' : '#fee2e2',
    color: enabled ? '#166534' : '#b91c1c',
    '& .MuiChip-label': {
      px: 0,
      textAlign: 'center'
    }
  });
  const infoItems = [
    { icon: <CalendarMonthIcon sx={{ fontSize: 16 }} />, label: "Fecha de nacimiento", value: formatFecha(alumno.fecha_nacimiento) },
    { icon: <CalendarMonthIcon sx={{ fontSize: 16 }} />, label: "Fecha de inscripcion", value: formatFecha(alumno.fecha_inscripcion) },
    { icon: <EmojiPeopleIcon sx={{ fontSize: 16 }} />, label: "Edad", value: `${calcularEdad(alumno.fecha_nacimiento)} Años` },
    { icon: <PersonIcon sx={{ fontSize: 16 }} />, label: "Sexo", value: alumno.sexo || "-" },
    { icon: <BadgeIcon sx={{ fontSize: 16 }} />, label: "Cedula", value: alumno.cedula || "-" },
    { icon: <SportsVolleyballIcon sx={{ fontSize: 16 }} />, label: "Nro de franela", value: alumno.numero_franela || "-" },
    { icon: <ShowChartIcon sx={{ fontSize: 16 }} />, label: "Tipo de mensualidad", value: formatTipoMensualidad(alumno.tipo_mensualidad) }
  ];
  const contactItems = [
    { icon: <HomeIcon sx={{ fontSize: 16 }} />, label: "Domicilio", value: alumno.domicilio || "-" },
    { icon: <PhoneAndroidIcon sx={{ fontSize: 16 }} />, label: "Telefono", value: alumno.telefono || "-" }
  ];

  return (
    <>
      <Box sx={{ minHeight: '100vh', bgcolor: '#fdfdfd', p: { xs: 2, md: 3 } }}>
      <Box
        sx={{
          maxWidth: { xs: '100%', sm: 720, md: 1000, lg: 1200, xl: 1500 },
          mx: 'auto',
          px: { xs: 1.5, sm: 2.5, md: 3 }
        }}
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '340px 1fr' }, gap: 3 }}>
          <Box sx={{ position: { md: 'sticky' }, top: 24, alignSelf: 'start', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Paper sx={{ p: 2.5, borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 1.5 }}>
                <Avatar
                  src={mediaUrl(alumno.foto) || ""}
                  alt="Foto"
                  onClick={() => alumno.foto && setOpenFotoAlumno(true)}
                  sx={{
                    width: 140,
                    height: 140,
                    boxShadow: '0 8px 20px rgba(15, 23, 42, 0.15)',
                    cursor: alumno.foto ? 'zoom-in' : 'default',
                    transition: 'transform 0.2s ease',
                    '&:hover': alumno.foto ? { transform: 'scale(1.03)' } : undefined
                  }}
                />
                <Typography variant="h6" sx={{ fontWeight: 700, color: '#0f172a' }}>
                  {alumno.nombres} {alumno.apellidos}
                </Typography>
                <Typography variant="caption" sx={{ color: '#f97316', fontWeight: 700, letterSpacing: '0.08em' }}>
                  {alumno.categoria} / {sedeNombre || '-'}
                </Typography>
                <Chip
                  label={estaRetirado ? 'Retirado' : (alumno.estado || 'Activo')}
                  size="small"
                  sx={{
                    bgcolor: estaRetirado ? '#fee2e2' : '#eef2ff',
                    color: estaRetirado ? '#b91c1c' : '#2563eb',
                    fontWeight: 700
                  }}
                />
                <Button
                  size="small"
                  variant="text"
                  onClick={handleOpenHistorialEstados}
                  sx={{
                    mt: -0.25,
                    minHeight: 26,
                    px: 1.2,
                    borderRadius: 999,
                    border: '1px solid #e2e8f0',
                    backgroundColor: '#f8fafc',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#475569',
                    textTransform: 'none',
                    letterSpacing: '0.02em',
                    '&:hover': {
                      backgroundColor: '#eef2ff',
                      borderColor: '#cbd5e1',
                      color: '#1e293b'
                    }
                  }}
                >
                  Ver historial de bajas
                </Button>
                {estaRetirado && (
                  <Box
                    sx={{
                      width: '100%',
                      bgcolor: '#fff7ed',
                      border: '1px solid #fed7aa',
                      borderRadius: 2,
                      p: 1.5,
                      textAlign: 'left'
                    }}
                  >
                    <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#c2410c', letterSpacing: '0.06em', mb: 0.75 }}>
                      INFORMACION DE RETIRO
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: '#7c2d12', mb: 0.5 }}>
                      Fecha de baja: {formatFecha(alumno.fecha_baja)}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: '#7c2d12' }}>
                      Motivo: {alumno.motivo_baja?.trim() || 'No especificado'}
                    </Typography>
                  </Box>
                )}
              </Box>
              <Box sx={{ mt: 2, display: 'grid', gap: 1 }}>
                {infoItems.map((item) => (
                  <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#f8fafc', borderRadius: 2, px: 1.5, py: 1 }}>
                    <Box sx={{ width: 28, height: 28, borderRadius: 1.5, bgcolor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
                      {item.icon}
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em' }}>{item.label}</Typography>
                      <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{item.value}</Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
              <Button
                variant="contained"
                size="small"
                sx={{ mt: 2, bgcolor: '#0f172a', '&:hover': { bgcolor: '#0b1220' }, fontWeight: 700 }}
                onClick={() => setOpenFotoCedula(true)}
                disabled={!alumno.foto_cedula}
              >
                Ver foto de cedula
              </Button>
              <Box sx={{ mt: 2, display: 'grid', gap: 1 }}>
                {contactItems.map((item) => (
                  <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#f8fafc', borderRadius: 2, px: 1.5, py: 1 }}>
                    <Box sx={{ width: 28, height: 28, borderRadius: 1.5, bgcolor: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
                      {item.icon}
                    </Box>
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em' }}>{item.label}</Typography>
                      <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{item.value}</Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
              <Box sx={{ mt: 2, display: 'grid', gap: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b' }}>
                  <Typography sx={{ fontSize: 12, color: '#64748b' }}>Pago en cuotas</Typography>
                  <Chip label={alumno.habilitar_pago_cuotas ? 'SI' : 'NO'} size="small" sx={getSiNoChipSx(Boolean(alumno.habilitar_pago_cuotas))} />
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b' }}>
                  <Typography sx={{ fontSize: 12, color: '#64748b' }}>Aplica recargo mensual</Typography>
                  <Chip
                    label={alumno.aplicar_recargo_mensualidad !== false ? 'SI' : 'NO'}
                    size="small"
                    sx={getSiNoChipSx(alumno.aplicar_recargo_mensualidad !== false)}
                  />
                </Box>
              </Box>
              <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <Typography sx={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em', mb: 0.75 }}>
                  OBSERVACIONES
                </Typography>
                <Typography sx={{ fontSize: 12, color: '#334155' }}>{observacionesTexto}</Typography>
                <Typography sx={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em', mt: 1.25, mb: 0.75 }}>
                  ETIQUETAS
                </Typography>
                {etiquetas.length > 0 ? (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                    {etiquetas.map((etiqueta, index) => (
                      <Chip key={`${etiqueta}-${index}`} label={etiqueta} size="small" sx={{ bgcolor: '#e2e8f0', color: '#475569', fontWeight: 600 }} />
                    ))}
                  </Box>
                ) : (
                  <Typography sx={{ fontSize: 12, color: '#64748b' }}>Sin etiquetas registradas</Typography>
                )}
              </Box>
            </Paper>
            <Paper sx={{ p: 2.5, borderRadius: 3, bgcolor: '#0f172a', color: '#e2e8f0' }}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: '#94a3b8', mb: 1 }}>
                INFORMACION DE CONTACTO
              </Typography>
              {contactItems.map((item) => (
                <Box key={item.label} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                  {item.icon}
                  <Typography sx={{ fontSize: 13, color: '#e2e8f0' }}>{item.value}</Typography>
                </Box>
              ))}
            </Paper>
          </Box>

          <Box sx={{ display: 'grid', gap: 2 }}>
            <Paper sx={{ p: 2.5, borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Box sx={{ width: 26, height: 26, borderRadius: 1.5, bgcolor: '#fff3e6', color: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ShowChartIcon sx={{ fontSize: 16 }} />
                </Box>
                <Typography sx={{ fontWeight: 700, color: '#0f172a' }}>Datos Tecnicos</Typography>
              </Box>
              <Grid container spacing={2}>
                {[
                  { label: 'Talla', value: `${alumno.talla || '-'} M`, icon: <HeightIcon sx={{ fontSize: 16 }} />, color: '#f97316' },
                  { label: 'Peso', value: `${alumno.peso || '-'} KG`, icon: <FitnessCenterIcon sx={{ fontSize: 16 }} />, color: '#22c55e' },
                  { label: 'Alcance', value: `${alumno.alcance || '-'} M`, icon: <EmojiPeopleIcon sx={{ fontSize: 16 }} />, color: '#facc15' },
                  { label: 'Envergadura', value: `${alumno.envergadura || '-'} M`, icon: <AccessibilityIcon sx={{ fontSize: 16 }} />, color: '#a855f7' }
                ].map((item) => (
                  <Grid item size={{ xs: 6, md: 3 }} key={item.label}>
                    <Paper sx={{ p: 2, borderRadius: 2.5, bgcolor: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Box sx={{ width: 28, height: 28, borderRadius: 1.5, bgcolor: '#fff', color: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(15, 23, 42, 0.08)' }}>
                        {item.icon}
                      </Box>
                      <Typography sx={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em' }}>{item.label}</Typography>
                      <Typography sx={{ fontWeight: 700, color: '#0f172a' }}>{item.value}</Typography>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
              <Paper sx={{ mt: 2, p: 2, borderRadius: 2.5, bgcolor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ width: 28, height: 28, borderRadius: 1.5, bgcolor: '#e0ecff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <TimelineIcon sx={{ fontSize: 16 }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em' }}>PROYECCION</Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{alumno.proyeccion || '-'}</Typography>
                  </Box>
                </Box>
                <Button size="small" variant="text" sx={{ color: '#f97316', fontWeight: 700 }}>
                  Ver grafico
                </Button>
              </Paper>
            </Paper>

            <Paper sx={{ p: 2.5, borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                <Box sx={{ width: 26, height: 26, borderRadius: 1.5, bgcolor: '#fff3e6', color: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <LocalHospitalIcon sx={{ fontSize: 16 }} />
                </Box>
                <Typography sx={{ fontWeight: 700, color: '#0f172a' }}>Datos Medicos</Typography>
              </Box>
              <Grid container spacing={2} alignItems="stretch">
                <Grid size={{ xs: 12, md: 3 }} sx={{ display: 'flex' }}>
                  <Paper sx={{ p: 2, borderRadius: 2.5, bgcolor: '#f8fafc', minHeight: 154, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Typography sx={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em' }}>IMC</Typography>
                      {clasificacion && (
                        <Chip label={clasificacion} size="small" sx={{ bgcolor: '#dcfce7', color: '#166534', fontWeight: 700 }} />
                      )}
                    </Box>
                    <Typography sx={{ fontSize: 20, fontWeight: 800, color: '#0f172a', mt: 0.5 }}>{imc || '0.00'}</Typography>
                    <Box sx={{ mt: 1, height: 6, borderRadius: 999, bgcolor: '#e2e8f0', overflow: 'hidden' }}>
                      <Box sx={{ height: '100%', width: `${imcPercent}%`, bgcolor: '#22c55e' }} />
                    </Box>
                  </Paper>
                </Grid>
                <Grid size={{ xs: 12, md: 3 }} sx={{ display: 'flex' }}>
                  <Paper sx={{ p: 2, borderRadius: 2.5, bgcolor: '#f8fafc', minHeight: 154, width: '100%', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ width: 34, height: 34, borderRadius: 1.5, bgcolor: '#ffe4e6', color: '#f43f5e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <BloodtypeIcon sx={{ fontSize: 18 }} />
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em' }}>TIPO DE SANGRE</Typography>
                      <Typography sx={{ fontWeight: 700, color: '#0f172a' }}>{alumno.tipo_sangre || '-'}</Typography>
                    </Box>
                  </Paper>
                </Grid>
                <Grid size={{ xs: 12, md: 3 }} sx={{ display: 'flex' }}>
                  <Paper sx={{ p: 2, borderRadius: 2.5, bgcolor: '#f8fafc', minHeight: 154, width: '100%', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ width: 34, height: 34, borderRadius: 1.5, bgcolor: '#e0f2fe', color: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <HealingIcon sx={{ fontSize: 18 }} />
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em' }}>ALERGIAS</Typography>
                      <Typography sx={{ fontWeight: 700, color: '#0f172a' }}>{alumno.alergias || 'Ninguna registrada'}</Typography>
                    </Box>
                  </Paper>
                </Grid>
                <Grid size={{ xs: 12, md: 3 }} sx={{ display: 'flex' }}>
                  <Paper sx={{ p: 2, borderRadius: 2.5, bgcolor: '#f8fafc', minHeight: 154, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <Typography sx={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em', mb: 0.5 }}>ANTECEDENTES PATOLOGICOS</Typography>
                    <Typography sx={{ fontWeight: 700, color: '#0f172a' }}>{alumno.antecedentes_patologicos || 'Ninguno'}</Typography>
                  </Paper>
                </Grid>
              </Grid>
            </Paper>

            {alumno.sinRepresentante !== true && (
              <Paper sx={{ p: 2.5, borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                  <Box sx={{ width: 26, height: 26, borderRadius: 1.5, bgcolor: '#fff3e6', color: '#f97316', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <PersonIcon sx={{ fontSize: 16 }} />
                  </Box>
                  <Typography sx={{ fontWeight: 700, color: '#0f172a' }}>Datos del Representante</Typography>
                </Box>
                <Paper sx={{ p: 2, borderRadius: 2.5, bgcolor: '#f8fafc', display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Avatar sx={{ width: 64, height: 64, bgcolor: '#e2e8f0', color: '#475569' }}>
                    {representante?.nombres ? representante.nombres[0] : 'R'}
                  </Avatar>
                  <Box>
                    <Typography sx={{ fontWeight: 700, color: '#0f172a' }}>
                      {representante?.nombres} {representante?.apellidos}
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: '#f97316', fontWeight: 700, letterSpacing: '0.04em' }}>
                      {alumno?.parentesco || '-'}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      ml: 'auto',
                      width: '100%',
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                      gap: 1.25,
                      alignSelf: 'stretch'
                    }}
                  >
                    <Box>
                      <Typography sx={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em' }}>DOCUMENTO DE IDENTIDAD</Typography>
                      <Typography sx={{ fontWeight: 700, color: '#0f172a' }}>{representante?.cedula || '-'}</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em' }}>FECHA DE NACIMIENTO</Typography>
                      <Typography sx={{ fontWeight: 700, color: '#0f172a' }}>{formatFecha(representante?.fecha_nacimiento)}</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em' }}>TELEFONO DE CONTACTO</Typography>
                      <Typography sx={{ fontWeight: 700, color: '#0f172a' }}>{representante?.telefono || '-'}</Typography>
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em' }}>CORREO</Typography>
                      <Typography sx={{ fontWeight: 700, color: '#0f172a' }}>{representante?.correo || '-'}</Typography>
                    </Box>
                    <Box sx={{ gridColumn: { xs: 'auto', sm: '1 / -1' } }}>
                      <Typography sx={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em' }}>DIRECCION</Typography>
                      <Typography sx={{ fontWeight: 700, color: '#0f172a' }}>{representante?.direccion || representante?.domicilio || '-'}</Typography>
                    </Box>
                  </Box>
                </Paper>
              </Paper>
            )}
          </Box>
        </Box>
      </Box>
      </Box>
      <Dialog
        open={openFotoAlumno}
        onClose={() => setOpenFotoAlumno(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Foto del alumno
          <IconButton aria-label="cerrar" onClick={() => setOpenFotoAlumno(false)} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {alumno.foto ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 280, backgroundColor: '#f8fafc', borderRadius: 2, p: 1 }}>
              <img
                src={mediaUrl(alumno.foto)}
                alt={`Foto de ${alumno.nombres} ${alumno.apellidos}`}
                style={{ maxWidth: '100%', maxHeight: '75vh', width: 'auto', height: 'auto', objectFit: 'contain', borderRadius: 8 }}
              />
            </Box>
          ) : (
            <Typography variant="body2">Foto del alumno no disponible.</Typography>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={openFotoCedula}
        onClose={() => setOpenFotoCedula(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Foto de la cédula
          <IconButton aria-label="cerrar" onClick={() => setOpenFotoCedula(false)} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {alumno.foto_cedula ? (
            <Box sx={{ display: 'flex', justifyContent: 'center' }}>
              <img
                src={mediaUrl(alumno.foto_cedula)}
                alt="Foto de cédula"
                style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8 }}
              />
            </Box>
          ) : (
            <Typography variant="body2">Foto de cédula no disponible.</Typography>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={openHistorialEstados}
        onClose={() => setOpenHistorialEstados(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          Historial de bajas y reingresos
          <IconButton aria-label="cerrar" onClick={() => setOpenHistorialEstados(false)} size="small">
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {historialLoading && <Typography variant="body2">Cargando historial...</Typography>}
          {!historialLoading && historialError && (
            <Typography color="error" variant="body2">{historialError}</Typography>
          )}
          {!historialLoading && !historialError && historialEstados.length === 0 && (
            <Typography variant="body2" sx={{ color: '#64748b' }}>
              No hay movimientos registrados.
            </Typography>
          )}
          {!historialLoading && !historialError && historialEstados.length > 0 && (
            <Box sx={{ display: 'grid', gap: 1.25 }}>
              {historialEstados.map((evento) => {
                const esBaja = String(evento?.tipo_movimiento || '').toUpperCase() === 'BAJA';
                return (
                  <Box
                    key={`${evento._id || evento.createdAt}-${evento.tipo_movimiento}`}
                    sx={{
                      border: '1px solid #e2e8f0',
                      borderRadius: 2,
                      p: 1.25,
                      backgroundColor: '#f8fafc'
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                      <Chip
                        size="small"
                        label={formatTipoMovimiento(evento?.tipo_movimiento)}
                        sx={{
                          bgcolor: esBaja ? '#fee2e2' : '#dcfce7',
                          color: esBaja ? '#b91c1c' : '#166534',
                          fontWeight: 700
                        }}
                      />
                      <Typography sx={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>
                        {formatFecha(evento?.fecha_evento || evento?.createdAt)}
                      </Typography>
                    </Box>
                    <Typography sx={{ mt: 0.75, fontSize: 12, color: '#334155' }}>
                      Motivo: {String(evento?.motivo || '').trim() || 'No especificado'}
                    </Typography>
                    {String(evento?.comentario || '').trim() && (
                      <Typography sx={{ mt: 0.5, fontSize: 12, color: '#64748b' }}>
                        Comentario: {String(evento?.comentario || '').trim()}
                      </Typography>
                    )}
                  </Box>
                );
              })}
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default AlumnoDetalle;
