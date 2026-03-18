import React, { useState } from 'react';
import { AppBar, Toolbar, Typography, Button, Container, Grid, Box, TextField, MenuItem } from '@mui/material';
import { motion } from 'framer-motion';
import { MdArrowForward, MdPeople, MdPlace, MdEmojiEvents, MdSchool, MdGpsFixed, MdAssignment, MdPhoneIphone, MdFavoriteBorder, MdWorkspacePremium } from 'react-icons/md';
import logoImage from '../assets/logo.png';
import heroVoleyImage from '../assets/voley.jpg';
import directorImage from '../assets/director.jpeg';
import entrenador1Image from '../assets/entrenador_1.jpeg';
import entrenador2Image from '../assets/entrenador_2.jpeg';
import entrenador3Image from '../assets/entrenador_3.jpeg';
import entrenador4Image from '../assets/entrenador_4.jpeg';

// IMPORTACIÓN DEL CSS MODULE Y BALONES
import './LandingPage.css';

const stats = [
  { value: '+500', label: 'Alumnos Formados', icon: <MdPeople /> },
  { value: '7', label: 'Entrenadores Certificados', icon: <MdWorkspacePremium /> },
  { value: '15', label: 'Torneos Ganados', icon: <MdEmojiEvents /> },
  { value: '100%', label: 'Gestion Digital', icon: <MdPhoneIphone /> }
];

const benefits = [
  {
    title: 'Metodologia Pro',
    desc: 'Planes de entrenamiento personalizados segun la posicion para un progreso mas claro y medible.',
    icon: <MdGpsFixed />
  },
  {
    title: 'Instalaciones Top',
    desc: 'Canchas reglamentarias y material deportivo de primera calidad para entrenar mejor.',
    icon: <MdAssignment />
  },
  {
    title: 'Seguimiento Digital',
    desc: 'Acceso a nuestra plataforma para ver pagos, asistencias y progreso en tiempo real.',
    icon: <MdPhoneIphone />
  },
  {
    title: 'Comunidad y Valores',
    desc: 'Torneos internos, eventos sociales y formacion enfocada en disciplina deportiva.',
    icon: <MdFavoriteBorder />
  }
];

const coaches = [
  {
    name: 'EDIXON NELO',
    role: 'Director de la Academia',
    sub: 'Formador tactico y estrategico',
    quote: 'Vision, disciplina y formacion. La excelencia no es un acto, es un hábito que cultivamos en la cancha.',
    image: directorImage
  },
  {
    name: 'DEIVI PUERTA',
    role: 'Coach de Primera linea de defensa (BLOQUEO)',
    sub: 'Especialista en Muro Defensivo y Presión en Red.',
    quote: 'La defensa no espera al balón, lo intercepta con autoridad.',
    image: entrenador1Image
  },
  {
    name: 'DAVID VASQUEZ',
    role: 'Coach de Formacion Base',
    sub: 'Desarrollo tecnico inicial',
    quote: 'Los fundamentos bien trabajados sostienen el crecimiento deportivo.',
    image: entrenador2Image
  },
  {
    name: 'LORENA MOTA',
    role: 'Coach de Formacion Base',
    sub: 'Desarrollo tecnico inicial',
    quote: 'Dominar lo básico es el primer paso para ejecutar lo extraordinario.',
    image: entrenador3Image
  },
  {
    name: 'GABRIEL PALMERA',
    role: 'Coach tactico de levantadores',
    sub: 'Especialista en levantadores',
    quote: 'Diseñamos el cerebro de tu ofensiva. Perfeccionamos la visión de campo, la toma de decisiones bajo presión y la precisión táctica.',
    image: entrenador4Image
  },
  {
    name: 'MANUEL ALVAREZ',
    role: 'Coach de Ataque',
    sub: 'Especialista en Ofensiva',
    quote: 'Un ataque inteligente es aquel que sabe cuándo golpear fuerte y dónde golpear suave.',
    image: entrenador3Image
  },
  {
    name: 'LUIS MANZANILLA',
    role: 'Coach de 2da linea de defensa',
    sub: 'Especialista en Defensa de Campo y Control de Balón.',
    quote: 'El balón no toca el suelo mientras haya voluntad de lucha.',
    image: entrenador4Image
  },
];

const sedes = [
  {
    nombre: 'Sede Villa Crepuscular',
    direccion: 'Villa Crepuscular, cancha techada.',
    horario: 'Martes, Jueves y Viernes'
  },
  {
    nombre: 'Sede Caraqueña',
    direccion: 'José Félix Rivas, cancha techada.',
    horario: 'Martes, Jueves y Viernes'
  },
  {
    nombre: 'Sede Obelisco',
    direccion: 'Carrera 23 con 56 entre el bloque 9 y 10, cancha techada.',
    horario: 'Lunes, Miercoles y Sabados'
  }
];

const navigationItems = [
  { label: 'Inicio', href: '#inicio' },
  { label: 'Beneficios', href: '#beneficios' },
  { label: 'Entrenadores', href: '#entrenadores' },
  { label: 'Sedes', href: '#sedes' },
  { label: 'Contacto', href: '#contacto' }
];

const nivelesExperiencia = [
  'Principiante',
  'Intermedio',
  'Avanzado'
];

const LandingPage = () => {
  const apiBase = process.env.REACT_APP_API_URL || '';
  const [aspiranteForm, setAspiranteForm] = useState({
    nombreCompleto: '',
    fechaNacimiento: '',
    nivelExperiencia: '',
    telefono: ''
  });
  const [aspiranteEnviado, setAspiranteEnviado] = useState(false);
  const [aspiranteError, setAspiranteError] = useState('');
  const [aspiranteLoading, setAspiranteLoading] = useState(false);

  const handleAspiranteChange = (event) => {
    const { name, value } = event.target;
    setAspiranteForm((prev) => ({
      ...prev,
      [name]: value
    }));
    if (aspiranteError) {
      setAspiranteError('');
    }
    if (aspiranteEnviado) {
      setAspiranteEnviado(false);
    }
  };

  const handleAspiranteSubmit = async (event) => {
    event.preventDefault();

    try {
      setAspiranteLoading(true);
      setAspiranteError('');

      const response = await fetch(`${apiBase}/api/aspirantes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          nombreCompleto: aspiranteForm.nombreCompleto.trim(),
          fechaNacimiento: aspiranteForm.fechaNacimiento,
          nivelExperiencia: aspiranteForm.nivelExperiencia,
          telefono: aspiranteForm.telefono.trim()
        })
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'No se pudo enviar la solicitud. Intenta nuevamente.');
      }

      setAspiranteEnviado(true);
      setAspiranteForm({
        nombreCompleto: '',
        fechaNacimiento: '',
        nivelExperiencia: '',
        telefono: ''
      });
    } catch (error) {
      setAspiranteError(error.message || 'No se pudo enviar la solicitud.');
      setAspiranteEnviado(false);
    } finally {
      setAspiranteLoading(false);
    }
  };

  return (
    <div className="mainWrapper">
      <AppBar position="fixed" className="landingHeader" elevation={0}>
        <Container maxWidth="lg">
          <Toolbar className="landingToolbar" disableGutters>
            <Box className="brandGroup">
              <img src={logoImage} alt="Villa Sport" className="brandMark" />
              <div className="brandTexts">
                <Typography component="span" className="brandName">
                  VILLA SPORT
                </Typography>
                <Typography component="span" className="brandSubname">
                  volleyball club
                </Typography>
              </div>
            </Box>

            <Box className="navLinks">
              {navigationItems.map((item) => (
                <a
                  key={item.label}
                  href={item.href}
                  className="navLink"
                >
                  {item.label}
                </a>
              ))}
            </Box>

            <Button
              variant="contained"
              className="headerCta"
              href="/login"
            >
              Iniciar sesion
            </Button>
          </Toolbar>
        </Container>
      </AppBar>

      <section className="hero" id="inicio">
        <div
          className="heroBackground"
          style={{ backgroundImage: `url(${heroVoleyImage})` }}
          aria-hidden="true"
        />
        <Container maxWidth="lg">
          <Grid
            container
            spacing={4}
            alignItems="center"
            className="heroContent"
            sx={{ flexWrap: { xs: 'wrap', md: 'nowrap' } }}
          >
            <Grid item xs={12} md={8}>
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="heroTextBlock"
              >
                <Typography variant="h1" className="heroTitle">
                  Eleva tu nivel:
                  <span className="heroTitleAccent"> Entrena con los mejores</span>
                </Typography>
                <Typography variant="h5" className="heroSubtitle">
                  Formacion integral, tecnica avanzada y pasion por el voleibol. Unete a la comunidad de
                  Villa Sport y desarrolla tu juego con un equipo que compite y enseña en serio.
                </Typography>
                <div className="heroActions">
                  <Button className="ctaButton" variant="contained" endIcon={<MdArrowForward />} href="#contacto">
                    Inscribete Ahora
                  </Button>
                  <Button className="ctaButton ctaButtonSecondary" variant="outlined" href="#beneficios">
                    Prueba una Clase Gratis
                  </Button>
                </div>
                <div className="heroHighlights">
                  <div className="heroHighlightItem">
                    <MdSchool />
                    <span>Entrenamiento tecnico por categorias</span>
                  </div>
                  <div className="heroHighlightItem">
                    <MdEmojiEvents />
                    <span>Preparacion competitiva y formativa</span>
                  </div>
                  <div className="heroHighlightItem">
                    <MdPlace />
                    <span>Sedes activas para practica continua</span>
                  </div>
                </div>
              </motion.div>
            </Grid>
            <Grid item xs={12} md={4}>
              <motion.div
                className="heroInfoCard"
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.7, delay: 0.15 }}
              >
                <Typography className="heroInfoEyebrow">
                  Academia de voleibol
                </Typography>
                <Typography variant="h4" className="heroInfoTitle">
                  Tecnica, disciplina y equipo.
                </Typography>
                <Typography className="heroInfoCopy">
                  Programas para iniciacion, desarrollo y competencia con entrenadores enfocados en progreso real.
                </Typography>
                <div className="heroInfoStats">
                  <div>
                    <strong>3+</strong>
                    <span>niveles de formacion</span>
                  </div>
                  <div>
                    <strong>100%</strong>
                    <span>enfoque en desarrollo</span>
                  </div>
                </div>
                <Button className="heroInfoButton" variant="text" href="#contacto">
                  Solicitar informacion
                </Button>
              </motion.div>
            </Grid>
          </Grid>
        </Container>
      </section>

      <section className="statsBandSection" aria-label="Metricas destacadas">
        <div className="statsBand">
          {stats.map((item, index) => (
            <motion.div
              key={item.label}
              className="statItem"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: index * 0.08 }}
            >
              <div className="statIcon">{item.icon}</div>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="benefitsSection" id="beneficios">
        <Container maxWidth="lg">
          <div className="benefitsHeader">
            <Typography variant="h3" className="benefitsTitle">
              ¿Por qué entrenar con nosotros?
            </Typography>
            <Typography className="benefitsSubtitle">
              Ofrecemos una experiencia integral de formacion deportiva con metodologia profesional.
            </Typography>
          </div>

          <div className="benefitsGrid">
            {benefits.map((item, index) => (
              <div className="benefitsGridItem" key={index}>
                <div className="benefitCard">
                  <div className="iconWrapper">{item.icon}</div>
                  <Typography variant="h6" fontWeight={700}>{item.title}</Typography>
                  <Typography variant="body2" color="textSecondary">{item.desc}</Typography>
                </div>
              </div>
            ))}
          </div>
        </Container>
      </section>

      <section className="coachesSection" id="entrenadores">
        <Container maxWidth="lg">
          <div className="coachesHeader">
            <Typography variant="h3" className="coachesTitle">
              Staff de Entrenadores
            </Typography>
            <Typography className="coachesSubtitle">
              Profesionales certificados con anos de experiencia en formacion deportiva.
            </Typography>
          </div>

          <div className="coachesGrid">
            {coaches.map((coach, index) => (
              <motion.article
                key={coach.name}
                className="coachCard"
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                whileHover={{ y: -4 }}
              >
                <div className="coachImageWrap">
                  <img src={coach.image} alt={coach.name} className="coachImage" />
                  <div className="coachImageName">{coach.name}</div>
                </div>
                <div className="coachCardBody">
                  <Typography variant="h6" className="coachName">
                    {coach.role}
                  </Typography>
                  <Typography className="coachRole">
                    {coach.sub}
                  </Typography>
                  <Typography className="coachQuote">
                    "{coach.quote}"
                  </Typography>
                </div>
              </motion.article>
            ))}
          </div>
        </Container>
      </section>

      <section className="sedesSection" id="sedes">
        <Container maxWidth="lg">
          <div className="sedesHeader">
            <Typography variant="h3" className="sedesTitle">
              Nuestras Sedes
            </Typography>
            <Typography className="sedesSubtitle">
              Contamos con tres sedes activas para que elijas la que mejor te quede.
            </Typography>
          </div>

          <div className="sedesGrid">
            {sedes.map((sede) => (
              <motion.article
                key={sede.nombre}
                className="sedeCard"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45 }}
                whileHover={{ y: -4 }}
              >
                <Typography variant="h6" className="sedeNombre">
                  {sede.nombre}
                </Typography>
                <div className="sedeMeta">
                  <MdPlace />
                  <span>{sede.direccion}</span>
                </div>
                <div className="sedeMeta">
                  <MdAssignment />
                  <span>{sede.horario}</span>
                </div>
              </motion.article>
            ))}
          </div>
        </Container>
      </section>

      <section className="ctaBandSection">
          <div className="ctaBand">
            <div className="ctaBandInner">
              <Typography variant="h3" className="ctaBandTitle">
                DA EL SIGUIENTE PASO EN TU FORMACION DEPORTIVA.
              </Typography>
              <Typography variant="h5" className="ctaBandSubtitle">
                Unete a Villa Sport y recibe informacion sobre horarios, categorias y proceso de inscripcion.
              </Typography>
              <div className="ctaBandActions">
                <Button className="ctaBandPrimary" variant="contained" href="#contacto">
                  Contactar Ahora
                </Button>
                <Button className="ctaBandSecondary" variant="outlined" href="#beneficios">
                  Ver Beneficios
                </Button>
              </div>
            </div>
          </div>
      </section>

      <section className="aspirantesSection" id="contacto">
        <Container maxWidth="md">
          <motion.div
            className="aspirantesCard"
            initial={{ opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <Typography variant="h3" className="aspirantesTitle">
              Formulario para Aspirantes
            </Typography>
            <Typography className="aspirantesSubtitle">
              Completa tus datos y te contactaremos para iniciar tu proceso de ingreso a la academia.
            </Typography>

            <div className="aspirantesPills" aria-hidden="true">
              <span>
                <MdWorkspacePremium /> Seguimiento personalizado
              </span>
              <span>
                <MdSchool /> Evaluacion inicial
              </span>
              <span>
                <MdEmojiEvents /> Plan segun tu nivel
              </span>
            </div>

            <Box component="form" className="aspirantesForm" onSubmit={handleAspiranteSubmit}>
              <motion.div
                className="aspirantesField"
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.05 }}
              >
                <TextField
                  label="Nombre completo"
                  name="nombreCompleto"
                  value={aspiranteForm.nombreCompleto}
                  onChange={handleAspiranteChange}
                  required
                  fullWidth
                />
              </motion.div>

              <motion.div
                className="aspirantesField"
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.12 }}
              >
                <TextField
                  label="Fecha de nacimiento"
                  name="fechaNacimiento"
                  type="date"
                  value={aspiranteForm.fechaNacimiento}
                  onChange={handleAspiranteChange}
                  required
                  fullWidth
                  InputLabelProps={{ shrink: true }}
                />
              </motion.div>

              <motion.div
                className="aspirantesField"
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.19 }}
              >
                <TextField
                  label="Nivel de experiencia"
                  name="nivelExperiencia"
                  value={aspiranteForm.nivelExperiencia}
                  onChange={handleAspiranteChange}
                  required
                  select
                  fullWidth
                >
                  {nivelesExperiencia.map((nivel) => (
                    <MenuItem key={nivel} value={nivel}>
                      {nivel}
                    </MenuItem>
                  ))}
                </TextField>
              </motion.div>

              <motion.div
                className="aspirantesField"
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.26 }}
              >
                <TextField
                  label="Numero de telefono"
                  name="telefono"
                  value={aspiranteForm.telefono}
                  onChange={handleAspiranteChange}
                  required
                  fullWidth
                />
              </motion.div>

              <motion.div
                className="aspirantesSubmitWrap"
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.32 }}
                whileHover={{ y: -2 }}
                whileTap={{ y: 0 }}
              >
                <Button className="aspirantesSubmit" variant="contained" type="submit" disabled={aspiranteLoading}>
                  {aspiranteLoading ? 'Enviando...' : 'Enviar solicitud'}
                </Button>
              </motion.div>

              {aspiranteError && (
                <Typography className="aspirantesError">
                  {aspiranteError}
                </Typography>
              )}

              {aspiranteEnviado && (
                <Typography className="aspirantesSuccess">
                  ¡Solicitud enviada con exito! Gracias por postularte a Villa Sport. Te contactaremos pronto para coordinar tu evaluacion inicial.
                </Typography>
              )}
            </Box>
          </motion.div>
        </Container>
      </section>

      <footer className="landingFooter">
        <Container maxWidth="lg">
          <div className="footerGrid">
            <div className="footerBrand">
              <div className="footerBrandTop">
                <img src={logoImage} alt="Villa Sport" className="footerLogo" />
                <div className="footerBrandTitles">
                  <h4>VILLA SPORT</h4>
                  <h6>VOLLEYBALL CLUB</h6>
                </div>
              </div>
              <p>
                Academia de voleibol enfocada en tecnica, disciplina y formacion integral para cada etapa de desarrollo.
              </p>
            </div>

            <div className="footerColumn">
              <h5>Navegacion</h5>
              <a href="#inicio">Inicio</a>
              <a href="#beneficios">Beneficios</a>
              <a href="#entrenadores">Entrenadores</a>
              <a href="#sedes">Sedes</a>
              <a href="#contacto">Aspirantes</a>
            </div>

            <div className="footerColumn">
              <h5>Contacto</h5>
              <p>+58 412-5228727</p>
              <p>+58 414-5787845</p>
              <p>villasport2019@gmail.com</p>
              <p>Lara, Barquisimeto - Venezuela</p>
              <a className="footerLoginLink" href="/login">Acceso al sistema</a>
            </div>
          </div>

          <div className="footerBottom">
            <span>© {new Date().getFullYear()} Villa Sport. Todos los derechos reservados.</span>
          </div>
        </Container>
      </footer>

    </div>
  );
};

export default LandingPage;