import React, { useEffect, useState } from 'react';
import { AppBar, Toolbar, Typography, Button, Container, Grid, Box, TextField, MenuItem } from '@mui/material';
import { motion } from 'framer-motion';
import { MdArrowForward, MdPeople, MdPlace, MdEmojiEvents, MdSchool, MdGpsFixed, MdAssignment, MdPhoneIphone, MdFavoriteBorder, MdWorkspacePremium, MdMenu, MdClose, MdChevronLeft, MdChevronRight } from 'react-icons/md';
import logoImage from '../assets/logo.png';
import directorImage from '../assets/director.jpeg';
import entrenador1Image from '../assets/entrenador_1.jpeg';
import entrenador2Image from '../assets/entrenador_2.jpeg';
import entrenador3Image from '../assets/entrenador_3.jpeg';
import entrenador4Image from '../assets/entrenador_4.jpeg';
import entrenador5Image from '../assets/entrenador_5.jpeg';
import { mediaUrl } from '../utils/mediaUrl';
import { atletasDefault, heroImagesDefault } from '../constants/landingAtletasDefault';

// IMPORTACIÓN DEL CSS MODULE Y BALONES
import './LandingPage.css';

const stats = [
  { value: '+500', label: 'Alumnos Formados', icon: <MdPeople /> },
  { value: '7', label: 'Entrenadores Certificados', icon: <MdWorkspacePremium /> },
  { value: '15', label: 'Torneos Ganados', icon: <MdEmojiEvents /> },
  { value: '100%', label: 'Gestión Digital', icon: <MdPhoneIphone /> }
];

const benefits = [
  {
    title: 'Metodología Pro',
    desc: 'Planes de entrenamiento personalizados según la posición para un progreso más claro y medible.',
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
    desc: 'Torneos internos, eventos sociales y formación enfocada en disciplina deportiva.',
    icon: <MdFavoriteBorder />
  }
];

const coaches = [
  {
    name: 'EDIXON NELO',
    role: 'Director de la Academia',
    sub: 'Formador táctico y estratégico',
    quote: 'Visión, disciplina y formación. La excelencia no es un acto, es un hábito que cultivamos en la cancha.',
    image: directorImage
  },
  {
    name: 'DEIVI PUERTA',
    role: 'Coach de Primera línea de defensa (BLOQUEO)',
    sub: 'Especialista en Muro Defensivo y Presión en Red.',
    quote: 'La defensa no espera al balón, lo intercepta con autoridad.',
    image: entrenador1Image
  },
  {
    name: 'DAVID VASQUEZ',
    role: 'Coach de Formación Base',
    sub: 'Desarrollo técnico inicial',
    quote: 'Los fundamentos bien trabajados sostienen el crecimiento deportivo.',
    image: entrenador2Image
  },
  {
    name: 'LORENA MOTA',
    role: 'Coach de Formación Base',
    sub: 'Desarrollo técnico inicial',
    quote: 'Dominar lo básico es el primer paso para ejecutar lo extraordinario.',
    image: entrenador3Image
  },
  {
    name: 'GABRIEL PALMERA',
    role: 'Coach táctico de levantadores',
    sub: 'Especialista en levantadores',
    quote: 'Diseñamos el cerebro de tu ofensiva. Perfeccionamos la visión de campo, la toma de decisiones bajo presión y la precisión táctica.',
    image: entrenador4Image
  },
  {
    name: 'MANUEL ALVAREZ',
    role: 'Coach de Ataque',
    sub: 'Especialista en Ofensiva',
    quote: 'Un ataque inteligente es aquel que sabe cuándo golpear fuerte y dónde golpear suave.',
    image: entrenador5Image
  },
 /* {
    name: 'LUIS MANZANILLA',
    role: 'Coach de 2da linea de defensa',
    sub: 'Especialista en Defensa de Campo y Control de Balón.',
    quote: 'El balón no toca el suelo mientras haya voluntad de lucha.',
    image: entrenador4Image
  }, */
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
    horario: 'Lunes, Miércoles y Sábados'
  }
];

const navigationItems = [
  { label: 'Inicio', href: '#inicio' },
  { label: 'Beneficios', href: '#beneficios' },
  { label: 'Entrenadores', href: '#entrenadores' },
  { label: 'Sedes', href: '#sedes' },
  { label: 'Atletas', href: '#atletas' },
  { label: 'Contacto', href: '#contacto' }
];

const nivelesExperiencia = [
  'Principiante',
  'Intermedio',
  'Avanzado'
];

const heroImages = heroImagesDefault;

const LandingPage = () => {
  const apiBase = process.env.REACT_APP_API_URL || '';
  const [heroImageIndex, setHeroImageIndex] = useState(0);
  const [atletasConfig, setAtletasConfig] = useState([]);
  const [atletaIndex, setAtletaIndex] = useState(0);
  const [thumbStartIndex, setThumbStartIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [aspiranteForm, setAspiranteForm] = useState({
    nombreCompleto: '',
    fechaNacimiento: '',
    nivelExperiencia: '',
    telefono: ''
  });
  const [aspiranteEnviado, setAspiranteEnviado] = useState(false);
  const [aspiranteError, setAspiranteError] = useState('');
  const [aspiranteLoading, setAspiranteLoading] = useState(false);
  const atletas = atletasConfig.length > 0 ? atletasConfig : atletasDefault;
  const atletaActual = atletas[atletaIndex] || atletas[0];

  useEffect(() => {
    let isActive = true;

    const cargarFotosLanding = async () => {
      try {
        const response = await fetch(`${apiBase}/api/landing/atletas-fotos`);
        if (!response.ok) return;

        const data = await response.json().catch(() => []);
        if (!isActive) return;

        const fotosNormalizadas = (Array.isArray(data) ? data : [])
          .filter((item) => typeof item?.image === 'string' && item.image.trim())
          .map((item, index) => {
            const fallback = atletasDefault[index % atletasDefault.length] || atletasDefault[0];
            return {
              id: item._id || `landing-${index}`,
              nombre: fallback?.nombre || 'Villa Sport',
              logro: fallback?.logro || 'Formacion deportiva',
              descripcion: fallback?.descripcion || 'Disciplina y trabajo en equipo para crecer cada temporada.',
              image: mediaUrl(item.image)
            };
          });

        if (fotosNormalizadas.length > 0) {
          setAtletasConfig(fotosNormalizadas);
        }
      } catch (_) {
        // Si falla, se mantiene el arreglo por defecto.
      }
    };

    cargarFotosLanding();

    return () => {
      isActive = false;
    };
  }, [apiBase]);

  useEffect(() => {
    if (heroImages.length <= 1) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setHeroImageIndex((prevIndex) => (prevIndex + 1) % heroImages.length);
    }, 4500);

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 900) {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (atletas.length <= 1) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setAtletaIndex((prevIndex) => (prevIndex + 1) % atletas.length);
    }, 4200);

    return () => clearInterval(intervalId);
  }, [atletas.length]);

  useEffect(() => {
    if (atletas.length <= 4) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setThumbStartIndex((prevIndex) => (prevIndex + 1) % atletas.length);
    }, 2800);

    return () => clearInterval(intervalId);
  }, [atletas.length]);

  useEffect(() => {
    if (!atletas.length) {
      setAtletaIndex(0);
      setThumbStartIndex(0);
      return;
    }

    setAtletaIndex((prevIndex) => prevIndex % atletas.length);
    setThumbStartIndex((prevIndex) => prevIndex % atletas.length);
  }, [atletas.length]);

  const thumbsToShow = Math.min(4, atletas.length);
  const visibleThumbs = atletas.length
    ? Array.from({ length: thumbsToShow }, (_, offset) => {
      const index = (thumbStartIndex + offset) % atletas.length;
      return {
        atleta: atletas[index],
        index
      };
    })
    : [];

  const handleThumbNext = () => {
    if (!atletas.length) return;
    setThumbStartIndex((prevIndex) => (prevIndex + 1) % atletas.length);
  };

  const handleThumbPrev = () => {
    if (!atletas.length) return;
    setThumbStartIndex((prevIndex) => (prevIndex - 1 + atletas.length) % atletas.length);
  };

  const selectAtleta = (nextIndex) => {
    setAtletaIndex(nextIndex);
    setThumbStartIndex(nextIndex);
  };

  const handleCarouselTouchStart = (event) => {
    setTouchStartX(event.touches[0].clientX);
  };

  const handleCarouselTouchEnd = (event) => {
    if (touchStartX === null) {
      return;
    }

    if (!atletas.length) {
      setTouchStartX(null);
      return;
    }

    const touchEndX = event.changedTouches[0].clientX;
    const swipeDistance = touchStartX - touchEndX;
    const minSwipeDistance = 40;

    if (swipeDistance > minSwipeDistance) {
      const nextIndex = (atletaIndex + 1) % atletas.length;
      selectAtleta(nextIndex);
    } else if (swipeDistance < -minSwipeDistance) {
      const prevIndex = (atletaIndex - 1 + atletas.length) % atletas.length;
      selectAtleta(prevIndex);
    }

    setTouchStartX(null);
  };

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

            <button
              type="button"
              className="mobileMenuToggle"
              aria-label={mobileMenuOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((prev) => !prev)}
            >
              {mobileMenuOpen ? <MdClose /> : <MdMenu />}
            </button>

            <Box className={`headerMenu ${mobileMenuOpen ? 'isOpen' : ''}`}>
              <Box className="navLinks">
                {navigationItems.map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    className="navLink"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {item.label}
                  </a>
                ))}
              </Box>

              <Button
                variant="contained"
                className="headerCta"
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
              >
                Iniciar sesión
              </Button>
            </Box>
          </Toolbar>
        </Container>
      </AppBar>

      <section className="hero" id="inicio">
        <motion.div
          key={heroImages[heroImageIndex]}
          className="heroBackground"
          style={{ backgroundImage: `url(${heroImages[heroImageIndex]})` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9 }}
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
                  Formación integral, técnica avanzada y pasión por el voleibol. Únete a la comunidad de
                  Villa Sport y desarrolla tu juego con un equipo que enseña y compite.
                </Typography>
                <div className="heroActions">
                  <Button className="ctaButton" variant="contained" endIcon={<MdArrowForward />} href="#contacto">
                    Inscríbete Ahora
                  </Button>
                  <Button className="ctaButton ctaButtonSecondary" variant="outlined" href="#beneficios">
                    Prueba una Clase Gratis
                  </Button>
                </div>
                <div className="heroHighlights">
                  <div className="heroHighlightItem">
                    <MdSchool />
                    <span>Entrenamiento técnico por categorías</span>
                  </div>
                  <div className="heroHighlightItem">
                    <MdEmojiEvents />
                    <span>Preparación competitiva y formativa</span>
                  </div>
                  <div className="heroHighlightItem">
                    <MdPlace />
                    <span>Sedes activas para práctica continua</span>
                  </div>
                </div>
              </motion.div>
            </Grid>
            <Grid item size={{ xs: 12, md: 4 }} sx={{ display: { xs: 'none', md: 'block' } }}>
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
                  Técnica, disciplina y equipo.
                </Typography>
                <Typography className="heroInfoCopy">
                  Programas para iniciación, desarrollo y competencia con entrenadores enfocados en progreso real.
                </Typography>
                <div className="heroInfoStats">
                  <div>
                    <strong>3+</strong>
                    <span>niveles de formación</span>
                  </div>
                  <div>
                    <strong>100%</strong>
                    <span>enfoque en desarrollo</span>
                  </div>
                </div>
                <Button className="heroInfoButton" variant="text" href="#contacto">
                  Solicitar información
                </Button>
              </motion.div>
            </Grid>
          </Grid>
        </Container>
      </section>

      <section className="statsBandSection" aria-label="Métricas destacadas">
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
              Ofrecemos una experiencia integral de formación deportiva con metodología profesional.
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
              Profesionales certificados con años de experiencia en formación deportiva.
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
              Contamos con tres sedes activas para que elijas la que mejor se adapte a ti.
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

      <section className="atletasSection" id="atletas">
        <Container maxWidth="lg">
          <div className="atletasGrid">
            <motion.div
              className="atletasCopy"
              initial={{ opacity: 0, x: -24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
            >
              <Typography variant="h3" className="atletasTitle">
                Nuestros Atletas
              </Typography>
              <Typography className="atletasSubtitle">
                Ellos son el corazón competitivo de Villa Sport. Cada entrenamiento combina técnica,
                disciplina y acompañamiento para construir rendimiento real en cancha.
              </Typography>

              <div className="atletasPills" aria-hidden="true">
                <span><MdEmojiEvents /> Mentalidad ganadora</span>
                <span><MdSchool /> Formación integral</span>
                <span><MdPeople /> Trabajo en equipo</span>
              </div>

              <div className="atletasMeta">
                <strong>{atletaActual?.logro}</strong>
                <p>{atletaActual?.descripcion}</p>
              </div>
            </motion.div>

            <motion.div
              className="atletasCarousel"
              initial={{ opacity: 0, x: 24 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55 }}
            >
              <div
                className="atletasImageFrame"
                onTouchStart={handleCarouselTouchStart}
                onTouchEnd={handleCarouselTouchEnd}
              >
                <motion.img
                  key={atletaActual?.id || atletaActual?.image}
                  src={atletaActual?.image}
                  alt={atletaActual?.nombre}
                  className="atletasMainImage"
                  initial={{ opacity: 0, scale: 1.04 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.6 }}
                />
                <div className="atletasImageOverlay">
                  <span>Team Villa Sport</span>
                  <h4>{atletaActual?.nombre}</h4>
                </div>
              </div>

              <div className="atletasThumbControls" aria-label="Galería de atletas">
                <button
                  type="button"
                  className="atletasNavButton"
                  onClick={handleThumbPrev}
                  aria-label="Ver miniaturas anteriores"
                >
                  <MdChevronLeft />
                </button>

                <div className="atletasThumbs" aria-label="Seleccionar atleta destacado">
                  {visibleThumbs.map(({ atleta, index }) => (
                  <button
                    key={`${atleta.id || atleta.image}-${index}`}
                    type="button"
                    className={`atletaThumb ${index === atletaIndex ? 'active' : ''}`}
                    onClick={() => selectAtleta(index)}
                    aria-label={`Ver ${atleta.nombre}`}
                    aria-pressed={index === atletaIndex}
                  >
                    <img src={atleta.image} alt={atleta.nombre} />
                  </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="atletasNavButton"
                  onClick={handleThumbNext}
                  aria-label="Ver siguientes miniaturas"
                >
                  <MdChevronRight />
                </button>
              </div>

              <div className="atletasDots" aria-hidden="true">
                {atletas.map((_, index) => (
                  <span key={index} className={index === atletaIndex ? 'active' : ''} />
                ))}
              </div>
            </motion.div>
          </div>
        </Container>
      </section>

      <section className="ctaBandSection">
          <div className="ctaBand">
            <div className="ctaBandInner">
              <Typography variant="h3" className="ctaBandTitle">
                DA EL SIGUIENTE PASO EN TU FORMACIÓN DEPORTIVA.
              </Typography>
              <Typography variant="h5" className="ctaBandSubtitle">
                Únete a Villa Sport y recibe información sobre horarios, categorías y proceso de inscripción.
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
              Formulario para aspirantes
            </Typography>
            <Typography className="aspirantesSubtitle">
              Completa tus datos y te contactaremos para iniciar tu proceso de ingreso a la academia.
            </Typography>

            <div className="aspirantesPills" aria-hidden="true">
              <span>
                <MdWorkspacePremium /> Seguimiento personalizado
              </span>
              <span>
                <MdSchool /> Evaluación inicial
              </span>
              <span>
                <MdEmojiEvents /> Plan según tu nivel
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
                  label="Número de teléfono"
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
                  ¡Solicitud enviada con éxito! Gracias por postularte a Villa Sport. Te contactaremos pronto para coordinar tu evaluación inicial.
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
                Academia de voleibol enfocada en técnica, disciplina y formación integral para cada etapa de desarrollo.
              </p>
            </div>

            <div className="footerColumn">
              <h5>Navegación</h5>
              <a href="#inicio">Inicio</a>
              <a href="#beneficios">Beneficios</a>
              <a href="#entrenadores">Entrenadores</a>
              <a href="#sedes">Sedes</a>
              <a href="#atletas">Atletas</a>
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