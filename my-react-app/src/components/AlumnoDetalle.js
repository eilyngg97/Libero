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
  const [openFotoCedula, setOpenFotoCedula] = useState(false);

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
  const infoItems = [
    { icon: <CalendarMonthIcon sx={{ fontSize: 16 }} />, label: "Fecha de nacimiento", value: alumno.fecha_nacimiento?.substring(0, 10) || "-" },
    { icon: <EmojiPeopleIcon sx={{ fontSize: 16 }} />, label: "Edad", value: `${calcularEdad(alumno.fecha_nacimiento)} Años` },
    { icon: <BadgeIcon sx={{ fontSize: 16 }} />, label: "Cedula", value: alumno.cedula || "-" },
    { icon: <SportsVolleyballIcon sx={{ fontSize: 16 }} />, label: "Nro de franela", value: alumno.numero_franela || "-" }
  ];
  const contactItems = [
    { icon: <HomeIcon sx={{ fontSize: 16 }} />, label: "Domicilio", value: alumno.domicilio || "-" },
    { icon: <PhoneAndroidIcon sx={{ fontSize: 16 }} />, label: "Telefono", value: alumno.telefono || "-" }
  ];

  return (
    <>
      <Box sx={{ minHeight: '100vh', bgcolor: '#f1f5f9', p: { xs: 2, md: 3 } }}>
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
                  sx={{ width: 140, height: 140, boxShadow: '0 8px 20px rgba(15, 23, 42, 0.15)' }}
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
                  <Chip label={alumno.habilitar_pago_cuotas ? 'SI' : 'NO'} size="small" sx={{ bgcolor: alumno.habilitar_pago_cuotas ? '#dcfce7' : '#fee2e2', color: alumno.habilitar_pago_cuotas ? '#166534' : '#b91c1c', fontWeight: 700 }} />
                </Box>
                {alumno.observaciones && (
                  <Typography sx={{ fontSize: 12, color: '#64748b' }}>{alumno.observaciones}</Typography>
                )}
              </Box>
              {Array.isArray(alumno.etiquetas) && alumno.etiquetas.length > 0 && (
                <Box sx={{ mt: 1.5, display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                  {alumno.etiquetas.map((etiqueta, index) => (
                    <Chip key={`${etiqueta}-${index}`} label={etiqueta} size="small" sx={{ bgcolor: '#e2e8f0', color: '#475569', fontWeight: 600 }} />
                  ))}
                </Box>
              )}
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
              <Grid container spacing={2}>
                <Grid item xs={12} md={4}>
                  <Paper sx={{ p: 2, borderRadius: 2.5, bgcolor: '#f8fafc' }}>
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
                <Grid item xs={12} md={4}>
                  <Paper sx={{ p: 2, borderRadius: 2.5, bgcolor: '#f8fafc', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ width: 34, height: 34, borderRadius: 1.5, bgcolor: '#ffe4e6', color: '#f43f5e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <BloodtypeIcon sx={{ fontSize: 18 }} />
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em' }}>TIPO DE SANGRE</Typography>
                      <Typography sx={{ fontWeight: 700, color: '#0f172a' }}>{alumno.tipo_sangre || '-'}</Typography>
                    </Box>
                  </Paper>
                </Grid>
                <Grid item xs={12} md={4}>
                  <Paper sx={{ p: 2, borderRadius: 2.5, bgcolor: '#f8fafc', display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ width: 34, height: 34, borderRadius: 1.5, bgcolor: '#e0f2fe', color: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <HealingIcon sx={{ fontSize: 18 }} />
                    </Box>
                    <Box>
                      <Typography sx={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em' }}>ALERGIAS</Typography>
                      <Typography sx={{ fontWeight: 700, color: '#0f172a' }}>{alumno.alergias || 'Ninguna registrada'}</Typography>
                    </Box>
                  </Paper>
                </Grid>
                <Grid item xs={12}>
                  <Paper sx={{ p: 2, borderRadius: 2.5, bgcolor: '#f8fafc' }}>
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
                <Paper sx={{ p: 2, borderRadius: 2.5, bgcolor: '#f8fafc', display: 'flex', alignItems: 'center', gap: 2 }}>
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
                  <Box sx={{ ml: 'auto', textAlign: 'right' }}>
                    <Typography sx={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em' }}>DOCUMENTO DE IDENTIDAD</Typography>
                    <Typography sx={{ fontWeight: 700, color: '#0f172a' }}>{representante?.cedula || '-'}</Typography>
                    <Typography sx={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.04em', mt: 1 }}>TELEFONO DE CONTACTO</Typography>
                    <Typography sx={{ fontWeight: 700, color: '#0f172a' }}>{representante?.telefono || '-'}</Typography>
                  </Box>
                </Paper>
              </Paper>
            )}
          </Box>
        </Box>
      </Box>
      </Box>
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
    </>
  );
}

export default AlumnoDetalle;
