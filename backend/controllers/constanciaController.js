const PDFDocument = require('pdfkit');
const path = require('path');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantCoreConnection } = require('../config/tenantCoreConnection');
const { getTenantCoreModel } = require('../models/TenantCore');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');
const { getTenantModel } = require('../services/tenantModelService');

const DEFAULT_TEMPLATES = {
  simple: {
    titulo: 'CONSTANCIA',
    destinatario: 'A QUIEN PUEDA INTERESAR',
    cuerpo: 'Por medio de la presente se hace constar que el/la atleta {{alumno_nombre_completo}}, portador(a) de la cedula {{alumno_cedula}}, pertenece a nuestra academia en la categoria {{alumno_categoria}}.',
    nota: '',
    cierre: 'Constancia que se emite {{fecha_emision_texto}}.',
    lugarEmision: 'Barquisimeto'
  },
  retiro: {
    titulo: 'CARTA DE RETIRO',
    destinatario: 'A QUIEN PUEDA INTERESAR',
    cuerpo: 'Por medio de la presente se hace constar que el/la atleta {{alumno_nombre_completo}}, portador(a) de la cedula {{alumno_cedula}}, anuncia su retiro de nuestra academia.',
    nota: 'Se deja constancia de su estado solvente al momento de la emision.',
    cierre: 'Constancia que se emite {{fecha_emision_texto}}.',
    lugarEmision: 'Barquisimeto'
  },
  horario_entrenamiento: {
    titulo: 'CONSTANCIA',
    destinatario: 'A QUIEN PUEDA INTERESAR',
    cuerpo: 'Por medio de la presente se hace constar que el/la atleta {{alumno_nombre_completo}}, portador(a) de la cedula {{alumno_cedula}}, integra nuestra academia en la categoria {{alumno_categoria}} y asiste al horario de entrenamiento {{horario_resumen}}.',
    nota: '',
    cierre: 'Constancia que se emite {{fecha_emision_texto}}.',
    lugarEmision: 'Barquisimeto'
  },
  listado_alumnos: {
    titulo: 'CONSTANCIA',
    destinatario: 'A QUIEN PUEDA INTERESAR',
    cuerpo: 'Por medio de la presente se hace constar que los/las atletas descritos en la siguiente tabla representan a nuestra academia en la sede {{sede_nombre}}.',
    nota: '',
    cierre: 'Constancia que se emite {{fecha_emision_texto}}.',
    lugarEmision: 'Barquisimeto'
  },
  asistencia: {
    titulo: 'CONSTANCIA DE ASISTENCIA',
    destinatario: 'A QUIEN PUEDA INTERESAR',
    cuerpo: 'En mi caracter de {{firmante_cargo}} de dicha entidad, hago constar que {{asistencia_persona_label}} {{asistencia_nombre}}, portador(a) de la cedula de identidad N° {{asistencia_cedula}}, estuvo presente el dia {{asistencia_dia_evento}}, con el fin de {{asistencia_motivo_evento}}, el cual se llevo a cabo desde las {{asistencia_hora_desde}} hasta las {{asistencia_hora_hasta}}.',
    nota: '',
    cierre: 'Sin mas nada que hacer referencia y agradeciendo de antemano la mayor colaboracion que puedan prestar para con nuestro atleta.',
    lugarEmision: 'Barquisimeto'
  }
};

const DEFAULT_CONSTANCIAS_CONFIG = {
  institucion_nombre: 'ESCUELA DE VOLEIBOL',
  subtitulo: '',
  logos: [],
  firmante: {
    nombre: 'Direccion de la academia',
    cedula: '',
    telefono: '',
    cargo: 'Director'
  },
  pie_direccion: '',
  pie_lema: '',
  templates: DEFAULT_TEMPLATES
};

const ESTATUS_CON_DEUDA = new Set(['pendiente', 'abono', 'en revision', 'retrasado', 'insolvente']);

async function getTenantConstanciaModels(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);

  return {
    Alumno: getTenantModel(connection, 'Alumno'),
    Mensualidad: getTenantModel(connection, 'Mensualidad'),
    TenantConfig: getTenantModel(connection, 'TenantConfig')
  };
}

function normalizarTipoConstancia(tipo) {
  const normalizado = String(tipo || '').trim().toLowerCase();
  if (normalizado === 'horario') return 'horario_entrenamiento';
  if (['simple', 'retiro', 'horario_entrenamiento', 'listado_alumnos', 'asistencia'].includes(normalizado)) return normalizado;
  return 'simple';
}

function normalizeTemplate(template = {}, fallback = {}) {
  return {
    titulo: String(template?.titulo || fallback?.titulo || '').trim(),
    destinatario: String(template?.destinatario || fallback?.destinatario || '').trim(),
    cuerpo: String(template?.cuerpo || fallback?.cuerpo || '').trim(),
    nota: String(template?.nota || fallback?.nota || '').trim(),
    cierre: String(template?.cierre || fallback?.cierre || '').trim(),
    lugarEmision: String(template?.lugarEmision || fallback?.lugarEmision || '').trim()
  };
}

function normalizeConstanciasConfig(raw = {}) {
  const cfg = raw && typeof raw === 'object' ? raw : {};
  const logos = Array.isArray(cfg.logos)
    ? Array.from(new Set(cfg.logos.map((item) => String(item || '').trim()).filter(Boolean))).slice(0, 3)
    : [];

  return {
    institucion_nombre: String(cfg.institucion_nombre || DEFAULT_CONSTANCIAS_CONFIG.institucion_nombre).trim(),
    subtitulo: String(cfg.subtitulo || DEFAULT_CONSTANCIAS_CONFIG.subtitulo).trim(),
    logos,
    firmante: {
      nombre: String(cfg?.firmante?.nombre || DEFAULT_CONSTANCIAS_CONFIG.firmante.nombre).trim(),
      cedula: String(cfg?.firmante?.cedula || DEFAULT_CONSTANCIAS_CONFIG.firmante.cedula).trim(),
      telefono: String(cfg?.firmante?.telefono || DEFAULT_CONSTANCIAS_CONFIG.firmante.telefono).trim(),
      cargo: String(cfg?.firmante?.cargo || DEFAULT_CONSTANCIAS_CONFIG.firmante.cargo).trim()
    },
    pie_direccion: String(cfg.pie_direccion || DEFAULT_CONSTANCIAS_CONFIG.pie_direccion).trim(),
    pie_lema: String(cfg.pie_lema || DEFAULT_CONSTANCIAS_CONFIG.pie_lema).trim(),
    templates: {
      simple: normalizeTemplate(cfg?.templates?.simple, DEFAULT_TEMPLATES.simple),
      retiro: normalizeTemplate(cfg?.templates?.retiro, DEFAULT_TEMPLATES.retiro),
      horario_entrenamiento: normalizeTemplate(cfg?.templates?.horario_entrenamiento, DEFAULT_TEMPLATES.horario_entrenamiento),
      listado_alumnos: normalizeTemplate(cfg?.templates?.listado_alumnos, DEFAULT_TEMPLATES.listado_alumnos),
      asistencia: normalizeTemplate(cfg?.templates?.asistencia, DEFAULT_TEMPLATES.asistencia)
    }
  };
}

function formatFechaEvento(fechaRaw) {
  const value = String(fechaRaw || '').trim();
  const parts = value.split('-');
  if (parts.length !== 3) return value || '-';
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatHoraAmPm(horaRaw) {
  const value = String(horaRaw || '').trim();
  if (!value) return '';

  const match = value.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return value;

  const horas24 = Number.parseInt(match[1], 10);
  const minutos = match[2];
  if (!Number.isInteger(horas24) || horas24 < 0 || horas24 > 23) return value;

  const periodo = horas24 >= 12 ? 'PM' : 'AM';
  const horas12 = horas24 % 12 === 0 ? 12 : horas24 % 12;
  return `${horas12}:${minutos} ${periodo}`;
}

function normalizarAsistenciaDesdeRequest(reqBody = {}, alumno = {}, constanciasCfg = {}) {
  const asistenciaPara = String(reqBody?.asistenciaPara || 'atleta').trim().toLowerCase() === 'representante'
    ? 'representante'
    : 'atleta';
  const representante = alumno?.representante || {};

  if (asistenciaPara === 'representante' && !representante?._id) {
    return {
      ok: false,
      error: 'El alumno seleccionado no tiene representante asociado para generar esta constancia.'
    };
  }

  const nombrePersona = asistenciaPara === 'representante'
    ? `${String(representante?.nombres || '').toUpperCase()} ${String(representante?.apellidos || '').toUpperCase()}`.trim()
    : `${String(alumno?.nombres || '').toUpperCase()} ${String(alumno?.apellidos || '').toUpperCase()}`.trim();

  const fechaEvento = String(reqBody?.eventoFecha || '').trim();
  const horaDesde = String(reqBody?.eventoHoraDesde || '').trim();
  const horaHasta = String(reqBody?.eventoHoraHasta || '').trim();
  const horaDesdeFmt = formatHoraAmPm(horaDesde);
  const horaHastaFmt = formatHoraAmPm(horaHasta);
  if (!fechaEvento || !horaDesde || !horaHasta) {
    return {
      ok: false,
      error: 'Debes indicar fecha de evento y rango horario para la constancia de asistencia.'
    };
  }

  const cedulaRaw = asistenciaPara === 'representante' ? String(representante?.cedula || '').trim() : String(alumno?.cedula || '').trim();
  const cedulaPersona = cedulaRaw ? `V-${cedulaRaw}` : 'SIN CEDULA';

  return {
    ok: true,
    variables: {
      asistencia_persona_label: asistenciaPara === 'representante' ? 'el/la representante' : 'el/la atleta',
      asistencia_nombre: nombrePersona || '-',
      asistencia_cedula: cedulaPersona,
      asistencia_dia_evento: formatFechaEvento(fechaEvento),
      asistencia_hora_desde: horaDesdeFmt,
      asistencia_hora_hasta: horaHastaFmt,
      asistencia_motivo_evento: String(reqBody?.eventoMotivo || '').trim() || 'actividad deportiva',
      firmante_cargo: String(constanciasCfg?.firmante?.cargo || 'PRESIDENTE').trim() || 'PRESIDENTE'
    }
  };
}

function construirTextoFecha(fechaEmision) {
  if (!fechaEmision) return '';
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const partes = String(fechaEmision).split('-');
  if (partes.length !== 3) return '';

  const dia = Number.parseInt(partes[2], 10);
  const mesIndex = Number.parseInt(partes[1], 10) - 1;
  const anio = partes[0];
  if (!Number.isInteger(dia) || mesIndex < 0 || mesIndex > 11) return '';

  return `a los ${dia} dias del mes de ${meses[mesIndex]} del año ${anio}`;
}

function renderTemplate(text = '', variables = {}) {
  return String(text || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    const value = variables[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function normalizarHorarioDesdeRequest(reqBody = {}, alumno = {}) {
  const diasRaw = reqBody.diasEntrenamiento;
  const dias = Array.isArray(diasRaw)
    ? diasRaw.map((item) => String(item || '').trim()).filter(Boolean)
    : String(diasRaw || '').split(',').map((item) => item.trim()).filter(Boolean);

  const horaInicio = String(reqBody.horaInicio || '').trim();
  const horaFin = String(reqBody.horaFin || '').trim();
  const horaInicioFmt = formatHoraAmPm(horaInicio);
  const horaFinFmt = formatHoraAmPm(horaFin);

  if (dias.length > 0 || horaInicio || horaFin) {
    const diasTexto = dias.length > 0 ? dias.join(', ') : 'dias no especificados';
    if (horaInicioFmt && horaFinFmt) return `${diasTexto} de ${horaInicioFmt} a ${horaFinFmt}`;
    if (horaInicioFmt) return `${diasTexto} desde ${horaInicioFmt}`;
    return diasTexto;
  }

  return String(alumno?.sede?.horario_constancia || 'horario no especificado').trim();
}

function mapLogoUrlsToLocalPaths(logoUrls = []) {
  return logoUrls
    .map((logoUrl) => {
      const cleanUrl = String(logoUrl || '').trim();
      if (!cleanUrl.startsWith('/uploads/')) return null;
      const relativePath = cleanUrl.replace(/^\/+/, '');
      return path.join(__dirname, '..', relativePath);
    })
    .filter(Boolean);
}

async function getAcademiaBranding(req) {
  try {
    const tenantId = String(resolveRequestTenantId(req) || req?.tenant?.tenantId || '').trim().toLowerCase();
    if (!tenantId) {
      return {
        logoPath: null,
        academyName: ''
      };
    }

    const coreConnection = await getTenantCoreConnection();
    const TenantCore = getTenantCoreModel(coreConnection);
    const tenant = await TenantCore.findOne({ tenantId }).select('nombre branding.logoUrl branding.displayName').lean();
    const academyName = String(tenant?.branding?.displayName || tenant?.nombre || '').trim();
    const logoUrl = String(tenant?.branding?.logoUrl || '').trim();
    if (!logoUrl.startsWith('/uploads/')) {
      return {
        logoPath: null,
        academyName
      };
    }

    const relativePath = logoUrl.replace(/^\/+/, '');
    return {
      logoPath: path.join(__dirname, '..', relativePath),
      academyName
    };
  } catch (_) {
    return {
      logoPath: null,
      academyName: ''
    };
  }
}

function renderEncabezadoConstancia(doc, constanciasCfg, sedeNombre, academiaLogoPath, academyName = '') {
  const left = doc.page.margins.left;
  const logoY = 28;
  const logoBoxSize = 70;
  const textX = left;
  const textWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const fallbackLogoPath = path.join(__dirname, '../assets/logo.png');
  const logoPath = academiaLogoPath || fallbackLogoPath;

  let logoRenderTop = logoY;
  let logoRenderHeight = logoBoxSize;

  const drawLogoInBox = (filePath) => {
    const image = doc.openImage(filePath);
    const sourceWidth = Number(image?.width || 0);
    const sourceHeight = Number(image?.height || 0);
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      doc.image(filePath, left, logoY, { width: logoBoxSize, height: logoBoxSize });
      logoRenderTop = logoY;
      logoRenderHeight = logoBoxSize;
      return;
    }

    const scale = Math.min(logoBoxSize / sourceWidth, logoBoxSize / sourceHeight);
    const renderWidth = sourceWidth * scale;
    const renderHeight = sourceHeight * scale;
    const renderX = left + (logoBoxSize - renderWidth) / 2;
    const renderY = logoY + (logoBoxSize - renderHeight) / 2;

    doc.image(filePath, renderX, renderY, { width: renderWidth, height: renderHeight });
    logoRenderTop = renderY;
    logoRenderHeight = renderHeight;
  };

  try {
    drawLogoInBox(logoPath);
  } catch (_) {
    try {
      drawLogoInBox(fallbackLogoPath);
    } catch (_) {
      // Continuar sin logo.
    }
  }

  const tituloInstitucional = String(constanciasCfg.institucion_nombre || 'ESCUELA DE VOLEIBOL').trim();
  const tituloConAcademia = academyName ? `${tituloInstitucional} ${academyName}` : tituloInstitucional;
  const sedeTexto = String(sedeNombre || '-').trim().toUpperCase();
  const hasSubtitulo = !!constanciasCfg.subtitulo;

  const lineHeightTitle = 16;
  const lineHeightSubtitulo = 13;
  const lineHeightSede = 12;
  const gapBetweenLines = 2;
  const textBlockHeight = hasSubtitulo
    ? lineHeightTitle + gapBetweenLines + lineHeightSubtitulo + gapBetweenLines + lineHeightSede
    : lineHeightTitle + gapBetweenLines + lineHeightSede;
  const textStartY = logoRenderTop + Math.max(0, (logoRenderHeight - textBlockHeight) / 2);

  doc.font('Helvetica-Bold').fontSize(15).text(tituloConAcademia, textX, textStartY, { width: textWidth, align: 'center' });

  let nextTextY = doc.y + 1;
  if (constanciasCfg.subtitulo) {
    doc.font('Helvetica').fontSize(12).text(constanciasCfg.subtitulo, textX, nextTextY, { width: textWidth, align: 'center' });
    nextTextY = doc.y + 1;
  }

  doc.font('Helvetica').fontSize(11).text(`SEDE "${sedeTexto}"`, textX, nextTextY, { width: textWidth, align: 'center' });

  doc.x = left;
  doc.y = Math.max(doc.y, logoY + logoBoxSize) + 12;
}

function ensureSpace(doc, requiredHeight = 120) {
  const limitY = doc.page.height - doc.page.margins.bottom;
  if (doc.y + requiredHeight > limitY) {
    doc.addPage();
  }
}

function drawListadoAlumnosTable(doc, alumnos = []) {
  const left = doc.page.margins.left;
  const maxWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const rowHeight = 22;
  const colNro = 44;
  const colNombres = 190;
  const colApellidos = 190;
  const colCategoria = Math.max(70, maxWidth - colNro - colNombres - colApellidos);

  const drawHeader = () => {
    const y = doc.y;
    doc.save();
    doc.rect(left, y, maxWidth, rowHeight).fill('#f1f5f9').stroke('#cbd5e1');
    doc.fillColor('#0f172a').fontSize(10).font('Helvetica-Bold');
    doc.text('NRO', left + 6, y + 6, { width: colNro - 12, align: 'left' });
    doc.text('NOMBRES', left + colNro + 6, y + 6, { width: colNombres - 12, align: 'left' });
    doc.text('APELLIDOS', left + colNro + colNombres + 6, y + 6, { width: colApellidos - 12, align: 'left' });
    doc.text('CAT', left + colNro + colNombres + colApellidos + 6, y + 6, { width: colCategoria - 12, align: 'left' });
    doc.restore();
    doc.y = y + rowHeight;
  };

  drawHeader();

  alumnos.forEach((alumno, index) => {
    ensureSpace(doc, rowHeight + 18);
    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawHeader();
    }

    const y = doc.y;
    doc.rect(left, y, maxWidth, rowHeight).stroke('#cbd5e1');
    doc.font('Helvetica').fontSize(10).fillColor('#111827');
    doc.text(String(index + 1), left + 6, y + 6, { width: colNro - 12, align: 'left', ellipsis: true });
    doc.text(String(alumno.nombres || ''), left + colNro + 6, y + 6, { width: colNombres - 12, align: 'left', ellipsis: true });
    doc.text(String(alumno.apellidos || ''), left + colNro + colNombres + 6, y + 6, { width: colApellidos - 12, align: 'left', ellipsis: true });
    doc.text(String(alumno.categoria || '-'), left + colNro + colNombres + colApellidos + 6, y + 6, { width: colCategoria - 12, align: 'left', ellipsis: true });
    doc.y = y + rowHeight;
  });

  // Restablece el cursor al margen izquierdo para el texto posterior a la tabla.
  doc.x = left;
  doc.moveDown(0.7);
}

function renderLogosInferioresCentrados(doc, logoPaths = [], espacioInferior = 0) {
  const logos = (Array.isArray(logoPaths) ? logoPaths : []).slice(0, 3);
  if (!logos.length) return;

  const distribucion = {
    1: { width: 78, gap: 0 },
    2: { width: 68, gap: 22 },
    3: { width: 58, gap: 16 }
  };
  const preset = distribucion[logos.length] || distribucion[3];
  const availableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const maxWidthByLayout = (availableWidth - (logos.length - 1) * preset.gap) / logos.length;
  const logoWidth = Math.max(42, Math.min(preset.width, maxWidthByLayout));
  const logoHeight = logoWidth;
  const gap = preset.gap;
  const totalWidth = logos.length * logoWidth + Math.max(0, logos.length - 1) * gap;
  const startX = (doc.page.width - totalWidth) / 2;
  const y = doc.page.height - doc.page.margins.bottom - espacioInferior - logoHeight - 6;

  logos.forEach((logoPath, index) => {
    try {
      doc.image(logoPath, startX + index * (logoWidth + gap), y, { fit: [logoWidth, logoHeight] });
    } catch (_) {
      // Continuar si algun logo no esta disponible.
    }
  });
}

function getFooterLogosTopY(doc, logoPaths = [], espacioInferior = 0) {
  const logos = (Array.isArray(logoPaths) ? logoPaths : []).slice(0, 3);
  if (!logos.length) return null;

  const distribucion = {
    1: { width: 78, gap: 0 },
    2: { width: 68, gap: 22 },
    3: { width: 58, gap: 16 }
  };

  const preset = distribucion[logos.length] || distribucion[3];
  const availableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const maxWidthByLayout = (availableWidth - (logos.length - 1) * preset.gap) / logos.length;
  const logoWidth = Math.max(42, Math.min(preset.width, maxWidthByLayout));
  const logoHeight = logoWidth;

  return doc.page.height - doc.page.margins.bottom - espacioInferior - logoHeight - 6;
}

function renderFirmaYPie(doc, constanciasCfg, logosInstitucionales = [], opciones = {}) {
  const cierreTexto = String(opciones?.cierreTexto || '').trim();
  const tieneLogos = Array.isArray(logosInstitucionales) && logosInstitucionales.length > 0;
  const gapBloqueVsLogos = 20;
  const anchoTexto = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const firmante = constanciasCfg?.firmante || {};
  const lineasFirmante = 1
    + (firmante.nombre ? 1 : 0)
    + (firmante.cedula ? 1 : 0)
    + (firmante.telefono ? 1 : 0)
    + (firmante.cargo ? 1 : 0);
  const lineasPie = (constanciasCfg.pie_direccion ? 1 : 0) + (constanciasCfg.pie_lema ? 1 : 0);
  const alturaFirmaYPie = 14 + (lineasFirmante * 13) + (lineasPie > 0 ? 18 + lineasPie * 11 : 0);

  const alturaCierre = cierreTexto
    ? doc.font('Helvetica').fontSize(8.5).heightOfString(cierreTexto, {
      width: anchoTexto,
      align: 'justify',
      lineGap: 2
    }) + 8
    : 0;
  const espacioReservadoInferior = alturaCierre > 0 ? alturaCierre + 6 : 0;
  const alturaEstimadaBloque = alturaFirmaYPie;

  if (tieneLogos) {
    let logosTopY = getFooterLogosTopY(doc, logosInstitucionales, espacioReservadoInferior);
    let inicioObjetivoBloqueY = logosTopY - gapBloqueVsLogos - alturaEstimadaBloque;
    if (doc.y > inicioObjetivoBloqueY) {
      doc.addPage();
      logosTopY = getFooterLogosTopY(doc, logosInstitucionales, espacioReservadoInferior);
      inicioObjetivoBloqueY = logosTopY - gapBloqueVsLogos - alturaEstimadaBloque;
    }

    doc.y = Math.max(doc.y, inicioObjetivoBloqueY);
  } else {
    const bottomSafeY = doc.page.height - doc.page.margins.bottom - espacioReservadoInferior - 8;
    let inicioObjetivoBloqueY = bottomSafeY - alturaEstimadaBloque;
    if (doc.y > inicioObjetivoBloqueY) {
      doc.addPage();
      inicioObjetivoBloqueY = doc.page.height - doc.page.margins.bottom - espacioReservadoInferior - 8 - alturaEstimadaBloque;
    }
    doc.y = Math.max(doc.y, inicioObjetivoBloqueY);
  }

  doc.font('Helvetica').fontSize(10.5);
  doc.text('_________________________', { align: 'center' });
  doc.moveDown(0.5);
  doc.text(constanciasCfg.firmante.nombre || 'Direccion de la academia', { align: 'center' });
  if (constanciasCfg.firmante.cedula) doc.text(constanciasCfg.firmante.cedula, { align: 'center' });
  if (constanciasCfg.firmante.telefono) doc.text(constanciasCfg.firmante.telefono, { align: 'center' });
  if (constanciasCfg.firmante.cargo) doc.text(constanciasCfg.firmante.cargo, { align: 'center' });

  if (constanciasCfg.pie_direccion || constanciasCfg.pie_lema) {
    doc.moveDown(1.1);
    if (constanciasCfg.pie_direccion) {
      doc.fontSize(8.5).text(constanciasCfg.pie_direccion, { align: 'center' });
    }
    if (constanciasCfg.pie_lema) {
      doc.fontSize(8).text(constanciasCfg.pie_lema, { align: 'center' });
    }
  }

  renderLogosInferioresCentrados(doc, logosInstitucionales, espacioReservadoInferior);
}

function renderCierreFinal(doc, cierreTexto = '') {
  const texto = String(cierreTexto || '').trim();
  if (!texto) return;

  const anchoTexto = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const alturaCierre = doc.font('Helvetica').fontSize(8.5).heightOfString(texto, {
    width: anchoTexto,
    align: 'justify',
    lineGap: 2
  }) + 8;

  let inicioCierreY = doc.page.height - doc.page.margins.bottom - alturaCierre;
  if (doc.y > inicioCierreY) {
    doc.addPage();
    inicioCierreY = doc.page.height - doc.page.margins.bottom - alturaCierre;
  }

  doc.y = inicioCierreY;
  doc.font('Helvetica').fontSize(8.5).text(texto, {
    align: 'justify',
    lineGap: 2
  });
}

function createPdfResponseDocument(res) {
  const doc = new PDFDocument({ margin: 45 });
  const buffers = [];
  doc.on('data', buffers.push.bind(buffers));
  doc.on('end', () => {
    const pdfData = Buffer.concat(buffers);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=constancia.pdf');
    res.send(pdfData);
  });
  return doc;
}

exports.generarConstancia = async (req, res) => {
  const { alumnoId, alumnoIds, tipo, fechaEmision } = req.body;
  try {
    const tenantId = String(resolveRequestTenantId(req) || '').trim().toLowerCase();
    const rol = String(req.user?.rol || '').trim().toLowerCase();
    if (rol === 'usuario' && tenantId === 'esporta') {
      return res.status(403).json({ error: 'Este tenant no tiene habilitado el modulo de constancias para usuarios.' });
    }

    const {
      Alumno: TenantAlumno,
      Mensualidad: TenantMensualidad,
      TenantConfig: TenantConfigModel
    } = await getTenantConstanciaModels(req);

    const tipoConstancia = normalizarTipoConstancia(tipo);
    if (tipoConstancia === 'retiro' && req.user?.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo un administrador puede generar constancia de retiro' });
    }
    if (tipoConstancia === 'listado_alumnos' && req.user?.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo un administrador puede generar constancia con listado de alumnos' });
    }

    const configDoc = await TenantConfigModel.findOne({ key: 'default' }).select('constancias').lean();
    const constanciasCfg = normalizeConstanciasConfig(configDoc?.constancias || {});
    const academiaBranding = await getAcademiaBranding(req);
    const academiaLogoPath = academiaBranding.logoPath;
    const academyName = academiaBranding.academyName;
    const logosInstitucionales = mapLogoUrlsToLocalPaths(constanciasCfg.logos).filter((logoPath) => logoPath !== academiaLogoPath);
    const template = constanciasCfg.templates[tipoConstancia] || DEFAULT_TEMPLATES.simple;
    const fechaTexto = construirTextoFecha(fechaEmision);

    if (tipoConstancia === 'listado_alumnos') {
      const ids = Array.from(
        new Set((Array.isArray(alumnoIds) ? alumnoIds : [])
          .map((id) => String(id || '').trim())
          .filter(Boolean))
      );

      if (!ids.length) {
        return res.status(400).json({ error: 'Debes seleccionar al menos un alumno para la constancia de listado.' });
      }

      const alumnos = await TenantAlumno.find({ _id: { $in: ids } })
        .select('nombres apellidos categoria sede')
        .populate('sede', 'nombre')
        .lean();

      if (!alumnos.length) {
        return res.status(404).json({ error: 'No se encontraron alumnos para generar la constancia.' });
      }

      const byId = new Map(alumnos.map((al) => [String(al._id), al]));
      const alumnosOrdenados = ids.map((id) => byId.get(id)).filter(Boolean);
      const mensualidadesListado = await TenantMensualidad.find({ id_alumno: { $in: ids } }).select('id_alumno estatus').lean();
      const alumnosConDeudaIds = new Set(
        mensualidadesListado
          .filter((m) => ESTATUS_CON_DEUDA.has(String(m.estatus || '').toLowerCase()))
          .map((m) => String(m.id_alumno || ''))
          .filter(Boolean)
      );

      if (req.user?.rol !== 'admin' && alumnosConDeudaIds.size > 0) {
        const alumnosConDeudaNombres = alumnosOrdenados
          .filter((al) => alumnosConDeudaIds.has(String(al._id || '')))
          .map((al) => `${String(al.nombres || '').trim()} ${String(al.apellidos || '').trim()}`.trim())
          .filter(Boolean);

        return res.status(400).json({
          error: 'Todas las constancias requieren que los alumnos esten solventes en mensualidades.',
          detalle: alumnosConDeudaNombres.length
            ? `Alumnos no solventes: ${alumnosConDeudaNombres.join(', ')}`
            : 'Hay alumnos no solventes en la seleccion.'
        });
      }

      const sedes = new Set(alumnosOrdenados.map((al) => String(al?.sede?.nombre || '').trim()).filter(Boolean));
      const sedeNombre = sedes.size === 1 ? Array.from(sedes)[0] : 'Multiples sedes';

      const variables = {
        sede_nombre: sedeNombre,
        cantidad_alumnos: alumnosOrdenados.length,
        fecha_emision_texto: fechaTexto || 'en fecha actual'
      };

      const doc = createPdfResponseDocument(res);
    renderEncabezadoConstancia(doc, constanciasCfg, sedeNombre, academiaLogoPath, academyName);
      doc.fontSize(14).text(template.titulo || 'CONSTANCIA', { align: 'center' });
      doc.moveDown(0.8);
      if (template.destinatario) {
        doc.fontSize(11).text(template.destinatario, { align: 'center' });
        doc.moveDown(1.2);
      }

      doc.fontSize(11).text(renderTemplate(template.cuerpo, variables), {
        align: 'justify',
        lineGap: 3
      });

      doc.moveDown(0.8);
      drawListadoAlumnosTable(doc, alumnosOrdenados);

      if (template.nota) {
        doc.moveDown(0.8);
        doc.fontSize(10.5).text(`NOTA: ${renderTemplate(template.nota, variables)}`, {
          align: 'justify',
          lineGap: 3
        });
      }

      const lugar = template.lugarEmision || constanciasCfg.templates?.simple?.lugarEmision || 'Barquisimeto';
      const fechaLinea = fechaTexto ? `En ${lugar}, ${fechaTexto}.` : '';
      if (fechaLinea) {
        doc.moveDown(template.nota ? 1.0 : 0.9);
        doc.font('Helvetica-Oblique').fontSize(10).text(fechaLinea, { align: 'left' });
        doc.font('Helvetica');
      }

      const cierreTexto = renderTemplate(template.cierre, variables);

      renderFirmaYPie(doc, constanciasCfg, logosInstitucionales, { cierreTexto });
      renderCierreFinal(doc, cierreTexto);
      doc.end();
      return;
    }

    const alumno = await TenantAlumno.findById(alumnoId).populate('representante').populate('sede');
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

    const mensualidades = await TenantMensualidad.find({ id_alumno: alumnoId }).select('estatus').lean();
    const tieneDeuda = mensualidades.some((m) => ESTATUS_CON_DEUDA.has(String(m.estatus || '').toLowerCase()));
    if (req.user?.rol !== 'admin' && tieneDeuda) {
      return res.status(400).json({ error: 'Todas las constancias solo estan disponibles para alumnos solventes' });
    }

    const horarioResumen = normalizarHorarioDesdeRequest(req.body, alumno);
    const asistenciaData = normalizarAsistenciaDesdeRequest(req.body, alumno, constanciasCfg);
    if (tipoConstancia === 'asistencia' && !asistenciaData.ok) {
      return res.status(400).json({ error: asistenciaData.error || 'No se pudo construir la constancia de asistencia.' });
    }
    const variables = {
      alumno_nombre: String(alumno?.nombres || '').toUpperCase(),
      alumno_apellido: String(alumno?.apellidos || '').toUpperCase(),
      alumno_nombre_completo: `${String(alumno?.nombres || '').toUpperCase()} ${String(alumno?.apellidos || '').toUpperCase()}`.trim(),
      alumno_cedula: alumno?.cedula ? `V-${String(alumno.cedula).trim()}` : 'SIN CEDULA',
      alumno_categoria: String(alumno?.categoria || '-').trim(),
      sede_nombre: String(alumno?.sede?.nombre || '-').trim(),
      fecha_emision_texto: fechaTexto || 'en fecha actual',
      horario_resumen: horarioResumen,
      ...(asistenciaData?.variables || {})
    };

    const doc = createPdfResponseDocument(res);
    renderEncabezadoConstancia(doc, constanciasCfg, variables.sede_nombre, academiaLogoPath, academyName);

    doc.fontSize(14).text(template.titulo || 'CONSTANCIA', { align: 'center' });
    doc.moveDown(0.8);
    if (template.destinatario) {
      doc.fontSize(11).text(template.destinatario, { align: 'center' });
      doc.moveDown(1.2);
    }

    doc.fontSize(11).text(renderTemplate(template.cuerpo, variables), {
      align: 'justify',
      lineGap: 3
    });

    if (template.nota) {
      doc.moveDown(0.8);
      doc.fontSize(10.5).text(`NOTA: ${renderTemplate(template.nota, variables)}`, {
        align: 'justify',
        lineGap: 3
      });
    }

    const lugar = template.lugarEmision || constanciasCfg.templates?.simple?.lugarEmision || 'Barquisimeto';
    const fechaLinea = fechaTexto ? `En ${lugar}, ${fechaTexto}.` : '';
    if (fechaLinea) {
      doc.moveDown(template.nota ? 1.0 : 0.9);
      doc.font('Helvetica-Oblique').fontSize(10).text(fechaLinea, { align: 'left' });
      doc.font('Helvetica');
    }

    const cierreTexto = renderTemplate(template.cierre, variables);

    renderFirmaYPie(doc, constanciasCfg, logosInstitucionales, { cierreTexto });
    renderCierreFinal(doc, cierreTexto);

    doc.end();
  } catch (err) {
    res.status(500).json({ error: 'Error generando constancia', detalle: err.message });
  }
};
