import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, IconButton } from '@mui/material';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import PlayCircleFilledRounded from '@mui/icons-material/PlayCircleFilledRounded';
import MenuRounded from '@mui/icons-material/MenuRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import TrendingUpRounded from '@mui/icons-material/TrendingUpRounded';
import logo from '../../assets/logos/logo_apex.png';
import './ApexLandingPage.css';

const topics = {
  Soluciones: 'Alumnos, representantes, mensualidades, asistencias y uniformes: la gestión de tu academia en un solo lugar.',
  Plataforma: 'Tu academia cuenta con su propio subdominio. El equipo accede según sus permisos y los representantes pueden consultar sus pagos desde su portal.',
  Beneficios: 'Menos tareas repetitivas, mayor control de la cobranza e información organizada para tomar decisiones.',
  Preguntas: '¿Cada academia tiene su propio acceso? Sí. ¿Puedo gestionar varias sedes? Sí. ¿Los representantes tienen un portal? Sí, con acceso a sus pagos.'
};

const trustedAcademies = [
  { name: 'Villasport', file: 'villasport.png' },
  { name: 'Academia Fénix', file: 'fenix.png' },
  { name: 'Olympykus', file: 'olympykus.jpeg' },
    { name: 'Club Villa Cantevista', file: 'cantevista.png' },
    { name: 'Esporta', file: 'esporta.png' },
  { name: 'Starvolley', file: 'starvolley.png' },
  { name: 'E.B.E.R.', file: 'eber.png' },
  { name: 'Zenith', file: 'zenith.png' },
    { name: 'Monarca', file: 'monarca.jpeg' },
    { name: 'Elite', file: 'elite.png' },
  { name: 'Bigstars', file: 'bigstars.jpeg' },
  { name: 'Starelite', file: 'starelite.jpg' },

];

function AcademyLogo({ name, file }) {
  const [unavailable, setUnavailable] = useState(false);
  return (
    <li className="apex-academy">
      {unavailable ? <span className="apex-academy-name">{name}</span> : (
        <img src={`${process.env.PUBLIC_URL || ''}/apex/academias/${file}`} alt={name} width="160" height="112" onError={() => setUnavailable(true)} />
      )}
    </li>
  );
}

export function PlatformPreview({ desktopImage = logo, mobileImage = logo }) {
  return (
    <section id="apex-plataforma" className="apex-platform-preview" aria-label="APEX en escritorio y móvil">
      <div className="apex-device-stage">
        <div className="apex-desktop-device">
          <div className="apex-browser-bar" aria-hidden="true">
            <span className="apex-browser-dots"><i /><i /><i /></span>
            <span className="apex-browser-address">APEX</span>
          </div>
          <div className="apex-desktop-screen">
            <img src={desktopImage} alt="Vista de escritorio de APEX, imagen provisional" />
          </div>
        </div>
        <div className="apex-mobile-device">
          <span className="apex-phone-speaker" aria-hidden="true" />
          <img src={mobileImage} alt="Vista móvil de APEX, imagen provisional" />
        </div>
        <div className="apex-focus-badge">
          <span className="apex-focus-icon"><TrendingUpRounded aria-hidden="true" /></span>
          <p><strong>100 %</strong><span>enfocados en tu academia</span></p>
        </div>
      </div>
    </section>
  );
}

export function getAcademyLoginUrl(value) {
  const slug = value.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)) return '';
  return `https://${slug}.apex.com.ve/login`;
}

export default function ApexLandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState('');
  const [academy, setAcademy] = useState('');
  const [error, setError] = useState('');
  const contactEmail = process.env.REACT_APP_APEX_CONTACT_EMAIL || '';

  function openPanel(name) {
    setMenuOpen(false);
    setError('');
    setPanel(name);
  }

  function accessAcademy(event) {
    event.preventDefault();
    const url = getAcademyLoginUrl(academy);
    if (!url) {
      setError('Introduce solo el nombre del subdominio, por ejemplo: villasport.');
      return;
    }
    window.location.assign(url);
  }

  return (
    <div className="apex-page">
      <header className="apex-header">
        <div className="apex-header-inner">
          <a className="apex-brand" href="#apex-inicio" aria-label="APEX, inicio">
            <span className="apex-brand-symbol"><img src={logo} alt="" /></span>
            <span>APEX</span>
          </a>
          <nav className={`apex-nav${menuOpen ? ' is-open' : ''}`} aria-label="Navegación principal" id="apex-navigation">
            {Object.keys(topics).map((name) => (
              <button type="button" key={name} onClick={() => openPanel(name)}>{name}</button>
            ))}
          </nav>
          <div className="apex-header-actions">
            <button type="button" className="apex-button apex-button-outline apex-login" onClick={() => openPanel('Iniciar sesión')}>Iniciar sesión</button>
            <button type="button" className="apex-button apex-button-primary apex-demo" onClick={() => openPanel('Solicitar demo')}>Solicitar demo</button>
            <button type="button" className="apex-menu-toggle" aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'} aria-expanded={menuOpen} aria-controls="apex-navigation" onClick={() => setMenuOpen(!menuOpen)}>
              {menuOpen ? <CloseRounded /> : <MenuRounded />}
            </button>
          </div>
        </div>
      </header>
      <main id="apex-inicio" className="apex-hero">
        <div className="apex-hero-inner">
          <p className="apex-eyebrow"><span aria-hidden="true" />La nueva forma de gestionar tu academia</p>
          <h1>Tu academia merece<span>llegar más lejos</span></h1>
          <p className="apex-description">Centraliza alumnos, pagos, sedes y estadísticas en una plataforma diseñada para que tu organización deportiva crezca sin límites.</p>
          <div className="apex-hero-actions">
            <button type="button" className="apex-button apex-button-primary" onClick={() => openPanel('Solicitar demo')}>Quiero una demostración<ArrowForwardRounded aria-hidden="true" /></button>
            <button type="button" className="apex-button apex-button-outline" onClick={() => openPanel('Plataforma')}><PlayCircleFilledRounded aria-hidden="true" />Ver cómo funciona</button>
          </div>
        </div>
      </main>
      <section className="apex-trust" aria-labelledby="apex-trust-title">
        <div className="apex-trust-inner">
          <div className="apex-trust-heading">
            <h2 id="apex-trust-title">La confianza se juega en equipo</h2>
            <p>Academias que confían en <strong>APEX</strong></p>
          </div>
          <div className="apex-marquee" tabIndex={0} role="region" aria-label="Logos de academias">
            <div className="apex-marquee-track" style={{ '--apex-strip-duration': `${trustedAcademies.length * 6}s` }}>
              <ul className="apex-academies" aria-label="Academias clientes">
                {trustedAcademies.map((item) => <AcademyLogo key={item.file} {...item} />)}
              </ul>
              <ul className="apex-academies apex-academies-copy" aria-hidden="true">
                {trustedAcademies.map((item) => <AcademyLogo key={item.file} {...item} />)}
              </ul>
            </div>
          </div>
        </div>
      </section>
      <PlatformPreview />
      <Dialog open={Boolean(panel)} onClose={() => setPanel('')} aria-labelledby="apex-dialog-title" maxWidth="sm" fullWidth PaperProps={{ className: 'apex-dialog' }}>
        <DialogTitle sx={{ pr: 7 }} id="apex-dialog-title">{panel}</DialogTitle>
        <IconButton aria-label="Cerrar" onClick={() => setPanel('')} sx={{ position: 'absolute', top: 12, right: 12, color: 'inherit' }}><CloseRounded /></IconButton>
        <DialogContent>
          {panel === 'Iniciar sesión' ? (
            <form className="apex-access-form" onSubmit={accessAcademy}>
              <label htmlFor="apex-academy">Subdominio de tu academia</label>
              <div className="apex-domain-field"><input id="apex-academy" value={academy} onChange={(event) => { setAcademy(event.target.value); setError(''); }} placeholder="villasport" autoComplete="off" required aria-describedby={error ? 'apex-access-error' : undefined} aria-invalid={Boolean(error)} /><span>.apex.com.ve</span></div>
              {error && <p id="apex-access-error" role="alert">{error}</p>}
              <button className="apex-button apex-button-primary" type="submit">Ir a mi academia<ArrowForwardRounded /></button>
            </form>
          ) : panel === 'Solicitar demo' ? (
            contactEmail ? <a className="apex-button apex-button-primary" href={`mailto:${contactEmail}?subject=Solicitud%20de%20demostraci%C3%B3n%20APEX`}>Contactar a APEX<ArrowForwardRounded /></a> : <p>El canal para solicitar demostraciones estará disponible próximamente.</p>
          ) : <p>{topics[panel]}</p>}
        </DialogContent>
      </Dialog>
    </div>
  );
}