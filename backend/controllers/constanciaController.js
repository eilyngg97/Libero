const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantCoreConnection } = require('../config/tenantCoreConnection');
const { getTenantCoreModel } = require('../models/TenantCore');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');
const { getTenantModel } = require('../services/tenantModelService');
const { registrarOperacion } = require('../services/operacionService');

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
    cuerpo: 'En mi caracter de {{firmante_cargo}} de dicha entidad, hago constar que {{asistencia_persona_label}} {{asistencia_nombre}}, portador(a) de la cedula de identidad N° {{asistencia_cedula}}, {{asistencia_verbo_presencia}} presente el dia {{asistencia_dia_evento}}, con el fin de {{asistencia_motivo_evento}}, el cual se llevo a cabo desde las {{asistencia_hora_desde}} hasta las {{asistencia_hora_hasta}}.',
    nota: '',
    cierre: 'Sin mas nada que hacer referencia y agradeciendo de antemano la mayor colaboracion que puedan prestar para con nuestro atleta.',
    lugarEmision: 'Barquisimeto'
  }
};

const DEFAULT_CONSTANCIAS_CONFIG = {
  institucion_nombre: 'ESCUELA DE VOLEIBOL',
  subtitulo: '',
  membrete: {
    habilitado: false,
    imagen_url: ''
  },
  tipografia: {
    familia: 'arial',
    tamano: 11,
    cursiva: false
  },
  logos: [],
  firmante: {
    nombre: '',
    cedula: '',
    telefono: '',
    cargo: ''
  },
  pie_direccion: '',
  pie_lema: '',
  templates: DEFAULT_TEMPLATES,
  retiro_personalizado: {
    habilitado: false,
    incluir_logo_academia: false,
    institucion_nombre: 'ESCUELA DE VOLEIBOL',
    subtitulo: '',
    logos: [],
    firmante: {
      nombre: '',
      cedula: '',
      telefono: '',
      cargo: ''
    },
    pie_direccion: '',
    pie_lema: '',
    template: { ...DEFAULT_TEMPLATES.retiro }
  }
};

const ESTATUS_BLOQUEO_DIRECTO = new Set(['retrasado', 'insolvente']);
const ESTATUS_BLOQUEO_SI_VENCIO = new Set(['pendiente', 'abono', 'en revision']);
const CUERPO_PRIMERA_LINEA_SANGRIA = 24;

function normalizarDiaMes(valor, fallback = null) {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < 1 || numero > 31) return fallback;
  return numero;
}

function construirFechaPeriodoConDia(mes, anio, dia, { finDelDia = false } = {}) {
  const ultimoDiaMes = new Date(anio, mes, 0).getDate();
  const diaAjustado = Math.min(Math.max(1, Number(dia) || 1), ultimoDiaMes);
  const hora = finDelDia ? 23 : 0;
  const minutos = finDelDia ? 59 : 0;
  const segundos = finDelDia ? 59 : 0;
  const milisegundos = finDelDia ? 999 : 0;
  return new Date(anio, mes - 1, diaAjustado, hora, minutos, segundos, milisegundos);
}

function parseFechaSinDesfase(fechaRaw) {
  if (!fechaRaw) return null;
  const raw = String(fechaRaw).trim();
  const fechaBase = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (fechaBase) {
    const year = Number(fechaBase[1]);
    const month = Number(fechaBase[2]) - 1;
    const day = Number(fechaBase[3]);
    const localDate = new Date(year, month, day, 23, 59, 59, 999);
    return Number.isNaN(localDate.getTime()) ? null : localDate;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function obtenerFechaCortePagoMensualidad(mensualidad = {}, alumno = null) {
  const diaPersonalizado = normalizarDiaMes(
    mensualidad?.id_alumno?.dia_limite_personalizado ?? alumno?.dia_limite_personalizado,
    null
  );
  const mesPeriodo = Number(mensualidad?.mes);
  const anioPeriodo = Number(mensualidad?.anio);

  if (
    diaPersonalizado &&
    Number.isInteger(mesPeriodo) &&
    mesPeriodo >= 1 &&
    mesPeriodo <= 12 &&
    Number.isInteger(anioPeriodo) &&
    anioPeriodo > 1900
  ) {
    return construirFechaPeriodoConDia(mesPeriodo, anioPeriodo, diaPersonalizado, { finDelDia: true });
  }

  return parseFechaSinDesfase(mensualidad?.fecha_vencimiento);
}

function mensualidadCuentaComoDeuda(mensualidad = {}, ahora = new Date(), alumno = null) {
  const estatus = String(mensualidad?.estatus || '').trim().toLowerCase();
  const esEstatusBloqueable = ESTATUS_BLOQUEO_DIRECTO.has(estatus) || ESTATUS_BLOQUEO_SI_VENCIO.has(estatus);
  if (!esEstatusBloqueable) return false;

  const fechaCorte = obtenerFechaCortePagoMensualidad(mensualidad, alumno);
  if (fechaCorte) {
    return fechaCorte.getTime() <= ahora.getTime();
  }

  return ESTATUS_BLOQUEO_DIRECTO.has(estatus);
}

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

function getNombreOperacionConstancia(tipo) {
  const nombres = {
    simple: 'Constancia simple',
    retiro: 'Constancia de retiro',
    horario_entrenamiento: 'Constancia con horario',
    listado_alumnos: 'Constancia con listado',
    asistencia: 'Constancia de asistencia'
  };
  return nombres[tipo] || 'Generacion de constancia';
}

function normalizeTemplate(template = {}, fallback = {}) {
  return {
    titulo: String(template?.titulo ?? fallback?.titulo ?? '').trim(),
    destinatario: String(template?.destinatario ?? fallback?.destinatario ?? '').trim(),
    cuerpo: String(template?.cuerpo ?? fallback?.cuerpo ?? '').trim(),
    nota: String(template?.nota ?? fallback?.nota ?? '').trim(),
    cierre: String(template?.cierre ?? fallback?.cierre ?? '').trim(),
    lugarEmision: String(template?.lugarEmision ?? fallback?.lugarEmision ?? '').trim()
  };
}

function normalizeConstanciasConfig(raw = {}) {
  const cfg = raw && typeof raw === 'object' ? raw : {};
  const logos = Array.isArray(cfg.logos)
    ? Array.from(new Set(cfg.logos.map((item) => String(item || '').trim()).filter(Boolean))).slice(0, 3)
    : [];
  const retiroCfg = cfg?.retiro_personalizado && typeof cfg.retiro_personalizado === 'object'
    ? cfg.retiro_personalizado
    : {};
  const retiroLogos = Array.isArray(retiroCfg.logos)
    ? Array.from(new Set(retiroCfg.logos.map((item) => String(item || '').trim()).filter(Boolean))).slice(0, 3)
    : [];

  return {
    institucion_nombre: String(cfg.institucion_nombre || DEFAULT_CONSTANCIAS_CONFIG.institucion_nombre).trim(),
    subtitulo: String(cfg.subtitulo || DEFAULT_CONSTANCIAS_CONFIG.subtitulo).trim(),
    membrete: {
      habilitado: Boolean(cfg?.membrete?.habilitado),
      imagen_url: String(cfg?.membrete?.imagen_url || '').trim()
    },
    tipografia: {
      familia: ['arial', 'times_new_roman', 'courier'].includes(cfg?.tipografia?.familia)
        ? cfg.tipografia.familia
        : DEFAULT_CONSTANCIAS_CONFIG.tipografia.familia,
      tamano: Math.min(16, Math.max(8, Number(cfg?.tipografia?.tamano) || DEFAULT_CONSTANCIAS_CONFIG.tipografia.tamano)),
      cursiva: Boolean(cfg?.tipografia?.cursiva)
    },
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
    },
    retiro_personalizado: {
      habilitado: Boolean(retiroCfg?.habilitado),
      incluir_logo_academia: Boolean(retiroCfg?.incluir_logo_academia),
      institucion_nombre: String(retiroCfg?.institucion_nombre || DEFAULT_CONSTANCIAS_CONFIG.retiro_personalizado.institucion_nombre).trim(),
      subtitulo: String(retiroCfg?.subtitulo || DEFAULT_CONSTANCIAS_CONFIG.retiro_personalizado.subtitulo).trim(),
      logos: retiroLogos,
      firmante: {
        nombre: String(retiroCfg?.firmante?.nombre || DEFAULT_CONSTANCIAS_CONFIG.retiro_personalizado.firmante.nombre).trim(),
        cedula: String(retiroCfg?.firmante?.cedula || DEFAULT_CONSTANCIAS_CONFIG.retiro_personalizado.firmante.cedula).trim(),
        telefono: String(retiroCfg?.firmante?.telefono || DEFAULT_CONSTANCIAS_CONFIG.retiro_personalizado.firmante.telefono).trim(),
        cargo: String(retiroCfg?.firmante?.cargo || DEFAULT_CONSTANCIAS_CONFIG.retiro_personalizado.firmante.cargo).trim()
      },
      pie_direccion: String(retiroCfg?.pie_direccion || DEFAULT_CONSTANCIAS_CONFIG.retiro_personalizado.pie_direccion).trim(),
      pie_lema: String(retiroCfg?.pie_lema || DEFAULT_CONSTANCIAS_CONFIG.retiro_personalizado.pie_lema).trim(),
      template: normalizeTemplate(retiroCfg?.template, DEFAULT_CONSTANCIAS_CONFIG.retiro_personalizado.template)
    }
  };
}

function getConstanciaTypography(constanciasCfg = {}) {
  const typography = constanciasCfg?.tipografia || DEFAULT_CONSTANCIAS_CONFIG.tipografia;
  const families = {
    arial: { regular: 'Helvetica', bold: 'Helvetica-Bold', italic: 'Helvetica-Oblique', boldItalic: 'Helvetica-BoldOblique' },
    times_new_roman: { regular: 'Times-Roman', bold: 'Times-Bold', italic: 'Times-Italic', boldItalic: 'Times-BoldItalic' },
    courier: { regular: 'Courier', bold: 'Courier-Bold', italic: 'Courier-Oblique', boldItalic: 'Courier-BoldOblique' }
  };
  const family = families[typography.familia] || families.arial;
  const italic = Boolean(typography.cursiva);

  return {
    regular: italic ? family.italic : family.regular,
    bold: italic ? family.boldItalic : family.bold,
    italic: family.italic,
    size: Math.min(16, Math.max(8, Number(typography.tamano) || 11))
  };
}

function formatFechaEvento(fechaRaw) {
  const value = String(fechaRaw || '').trim();
  const parts = value.split('-');
  if (parts.length !== 3) return value || '-';
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatFechaAlumno(fechaRaw) {
  if (!fechaRaw) return '-';
  const date = new Date(fechaRaw);
  if (Number.isNaN(date.getTime())) return '-';

  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Caracas'
  }).format(date);
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
  const tiempoVerbal = String(reqBody?.asistenciaTiempo || 'pasado').trim().toLowerCase() === 'futuro'
    ? 'futuro'
    : 'pasado';

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
      asistencia_tiempo: tiempoVerbal,
      asistencia_verbo_presencia: tiempoVerbal === 'futuro' ? 'estara' : 'estuvo',
      firmante_cargo: String(constanciasCfg?.firmante?.cargo || 'PRESIDENTE').trim() || 'PRESIDENTE'
    }
  };
}

function ajustarTiempoAsistenciaEnCuerpo(cuerpo = '', variables = {}) {
  const texto = String(cuerpo || '');
  const tiempo = String(variables?.asistencia_tiempo || '').trim().toLowerCase();
  if (tiempo !== 'pasado' && tiempo !== 'futuro') return texto;

  if (tiempo === 'futuro') {
    return texto.replace(/estuvo\s+presente/gi, 'estara presente');
  }

  return texto.replace(/estara\s+presente/gi, 'estuvo presente');
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

function buildConstanciaBodyRuns(text = '', variables = {}, emphasizedKeys = []) {
  const emphasizedValues = Array.from(new Set(
    emphasizedKeys
      .map((key) => String(variables[key] || '').trim())
      .filter((value) => value.length >= 3)
  )).sort((left, right) => right.length - left.length);

  if (!emphasizedValues.length) return [{ text: String(text || ''), bold: false }];

  const matcher = new RegExp(emphasizedValues.map((value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
  const runs = [];
  let cursor = 0;
  let match;

  while ((match = matcher.exec(String(text || ''))) !== null) {
    if (match.index > cursor) runs.push({ text: String(text).slice(cursor, match.index), bold: false });
    runs.push({ text: match[0], bold: true });
    cursor = matcher.lastIndex;
  }

  if (cursor < String(text || '').length) runs.push({ text: String(text).slice(cursor), bold: false });
  return runs.length ? runs : [{ text: String(text || ''), bold: false }];
}

function renderConstanciaBody(doc, runs, typography, options) {
  if (typeof doc.widthOfString !== 'function' || typeof doc.currentLineHeight !== 'function') {
    doc.font(typography.regular).fillColor('#000000').fontSize(typography.size).text(
      runs.map((run) => run.text).join(''),
      options
    );
    return;
  }

  const tokens = [];
  let pendingSpace = false;

  runs.forEach((run) => {
    const parts = String(run.text || '').replace(/\r\n?/g, '\n').match(/\n|[^\S\n]+|[^\s\n]+/g) || [];
    parts.forEach((part) => {
      if (part === '\n') {
        tokens.push({ lineBreak: true });
        pendingSpace = false;
      } else if (/^[^\S\n]+$/.test(part)) {
        pendingSpace = true;
      } else {
        if (pendingSpace && tokens.length && !tokens[tokens.length - 1].lineBreak) {
          tokens.push({ space: true });
        }
        tokens.push({
          text: part,
          bold: Boolean(run.bold),
          glueLeft: /^[,.;:!?%)\]}]/.test(part)
        });
        pendingSpace = false;
      }
    });
  });

  doc.font(typography.regular).fontSize(typography.size);
  const availableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const indent = Math.max(0, Number(options?.indent) || 0);
  const lineGap = Math.max(0, Number(options?.lineGap) || 0);
  const lineHeight = doc.currentLineHeight(true) + lineGap;
  const spaceWidth = doc.widthOfString(' ');
  const margins = doc.page.margins;
  let y = doc.y;
  let paragraph = [];

  const drawParagraph = () => {
    if (!paragraph.length) {
      y += lineHeight;
      return;
    }

    const measuredWords = paragraph.map((word) => {
      doc.font(word.bold ? typography.bold : typography.regular).fontSize(typography.size);
      return { ...word, width: doc.widthOfString(word.text) };
    });
    const lines = [];
    let line = [];
    let lineWidth = 0;

    measuredWords.forEach((word) => {
      const firstLineIndent = lines.length === 0 ? indent : 0;
      const maxWidth = availableWidth - firstLineIndent;
      const gapBeforeWord = line.length && !word.glueLeft ? spaceWidth : 0;
      const nextWidth = lineWidth + gapBeforeWord + word.width;
      if (line.length && nextWidth > maxWidth) {
        lines.push(line);
        line = [word];
        lineWidth = word.width;
      } else {
        line.push(word);
        lineWidth = nextWidth;
      }
    });
    if (line.length) lines.push(line);

    lines.forEach((lineWords, lineIndex) => {
      if (y + lineHeight > doc.page.height - margins.bottom) {
        doc.addPage();
        y = doc.y;
      }

      const lineIndent = lineIndex === 0 ? indent : 0;
      const lineMaxWidth = availableWidth - lineIndent;
      const wordsWidth = lineWords.reduce((total, word) => total + word.width, 0);
      const gapCount = lineWords.filter((word, wordIndex) => wordIndex > 0 && !word.glueLeft).length;
      const justify = options?.align === 'justify' && lineIndex < lines.length - 1 && gapCount > 0;
      const gapWidth = justify ? (lineMaxWidth - wordsWidth) / gapCount : spaceWidth;
      let x = margins.left + lineIndent;

      lineWords.forEach((word, wordIndex) => {
        doc.font(word.bold ? typography.bold : typography.regular).fillColor('#000000').fontSize(typography.size);
        doc.text(word.text, x, y, { lineBreak: false });
        const nextWord = lineWords[wordIndex + 1];
        x += word.width + (nextWord && !nextWord.glueLeft ? gapWidth : 0);
      });

      y += lineHeight;
    });

    paragraph = [];
  };

  tokens.forEach((token) => {
    if (token.lineBreak) {
      drawParagraph();
    } else if (!token.space) {
      paragraph.push(token);
    }
  });
  if (paragraph.length) drawParagraph();

  doc.x = margins.left;
  doc.y = y;
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

  return 'horario no especificado';
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

function configurarMembrete(doc, constanciasCfg = {}) {
  const membrete = constanciasCfg?.membrete || {};
  const imagenUrl = String(membrete.imagen_url || '').trim();
  if (!membrete.habilitado || !imagenUrl.startsWith('/uploads/')) return false;

  const relativePath = imagenUrl.replace(/^\/+/, '');
  const imagePath = path.join(__dirname, '..', relativePath);
  if (!fs.existsSync(imagePath)) return false;

  const drawBackground = () => {
    doc.save();
    doc.image(imagePath, 0, 0, {
      fit: [doc.page.width, doc.page.height],
      align: 'center',
      valign: 'center'
    });
    doc.restore();
    doc.x = doc.page.margins.left;
    doc.y = Math.max(doc.page.margins.top, 145);
  };

  try {
    drawBackground();
    doc.on('pageAdded', drawBackground);
    return true;
  } catch (_) {
    return false;
  }
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

function renderEncabezadoConstancia(doc, constanciasCfg, sedeNombre, academiaLogoPath, academyName = '', options = {}) {
  const typography = getConstanciaTypography(constanciasCfg);
  const left = doc.page.margins.left;
  const logoY = 28;
  const logoBoxSize = 70;
  const topSideLogos = Array.isArray(options?.topSideLogos)
    ? options.topSideLogos.filter(Boolean).slice(0, 2)
    : [];
  const sideGap = 12;
  const hasTopSideLogos = topSideLogos.length === 2;
  const textX = hasTopSideLogos ? left + logoBoxSize + sideGap : left;
  const textWidth = hasTopSideLogos
    ? doc.page.width - doc.page.margins.left - doc.page.margins.right - ((logoBoxSize + sideGap) * 2)
    : doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const fallbackLogoPath = path.join(__dirname, '../assets/logo.png');
  const shouldUseFallbackLogo = options?.useFallbackLogo !== false;
  const logoPath = academiaLogoPath || (shouldUseFallbackLogo ? fallbackLogoPath : null);
  const showSedeLine = options?.showSedeLine !== false;
  const titleFontSize = Number(options?.titleFontSize) > 0 ? Number(options.titleFontSize) : 15;
  const subtitleFontSize = Number(options?.subtitleFontSize) > 0 ? Number(options.subtitleFontSize) : 12;
  const sedeFontSize = Number(options?.sedeFontSize) > 0 ? Number(options.sedeFontSize) : 11;

  let logoRenderTop = logoY;
  let logoRenderHeight = logoBoxSize;
  const topSideLogoBottoms = [];

  const drawLogoInTargetBox = (filePath, boxX, boxY, boxSize) => {
    const image = doc.openImage(filePath);
    const sourceWidth = Number(image?.width || 0);
    const sourceHeight = Number(image?.height || 0);
    if (sourceWidth <= 0 || sourceHeight <= 0) {
      doc.image(filePath, boxX, boxY, { width: boxSize, height: boxSize });
      return { top: boxY, height: boxSize };
    }

    const scale = Math.min(boxSize / sourceWidth, boxSize / sourceHeight);
    const renderWidth = sourceWidth * scale;
    const renderHeight = sourceHeight * scale;
    const renderX = boxX + (boxSize - renderWidth) / 2;
    const renderY = boxY + (boxSize - renderHeight) / 2;

    doc.image(filePath, renderX, renderY, { width: renderWidth, height: renderHeight });
    return { top: renderY, height: renderHeight };
  };

  if (hasTopSideLogos) {
    const rightX = doc.page.width - doc.page.margins.right - logoBoxSize;
    topSideLogos.forEach((logoFilePath, index) => {
      const x = index === 0 ? left : rightX;
      try {
        const rendered = drawLogoInTargetBox(logoFilePath, x, logoY, logoBoxSize);
        topSideLogoBottoms.push(rendered.top + rendered.height);
      } catch (_) {
        // Continuar si algun logo superior no se puede dibujar.
      }
    });
  }

  const drawLogoInBox = (filePath) => {
    const rendered = drawLogoInTargetBox(filePath, left, logoY, logoBoxSize);
    logoRenderTop = rendered.top;
    logoRenderHeight = rendered.height;
  };

  if (logoPath) {
    try {
      drawLogoInBox(logoPath);
    } catch (_) {
      if (shouldUseFallbackLogo) {
        try {
          drawLogoInBox(fallbackLogoPath);
        } catch (_) {
          // Continuar sin logo.
        }
      }
    }
  }

  const tituloInstitucional = String(constanciasCfg.institucion_nombre || 'ESCUELA DE VOLEIBOL').trim();
  const sedeTexto = showSedeLine ? String(sedeNombre || '-').trim().toUpperCase() : '';
  const hasSubtitulo = !!constanciasCfg.subtitulo;

  const gapBetweenLines = 2;
  const titleHeight = doc.font(typography.bold).fontSize(titleFontSize).heightOfString(tituloInstitucional, {
    width: textWidth,
    align: 'center'
  });
  const subtitleHeight = hasSubtitulo
    ? doc.font(typography.regular).fontSize(subtitleFontSize).heightOfString(String(constanciasCfg.subtitulo || ''), {
      width: textWidth,
      align: 'center'
    })
    : 0;
  const sedeHeight = showSedeLine
    ? doc.font(typography.regular).fontSize(sedeFontSize).heightOfString(`SEDE "${sedeTexto}"`, {
      width: textWidth,
      align: 'center'
    })
    : 0;
  const textBlockHeight = showSedeLine
    ? (hasSubtitulo
      ? titleHeight + gapBetweenLines + subtitleHeight + gapBetweenLines + sedeHeight
      : titleHeight + gapBetweenLines + sedeHeight)
    : (hasSubtitulo
      ? titleHeight + gapBetweenLines + subtitleHeight
      : titleHeight);
  const textStartY = hasTopSideLogos
    ? logoY + Math.max(0, (logoBoxSize - textBlockHeight) / 2)
    : logoRenderTop + Math.max(0, (logoRenderHeight - textBlockHeight) / 2);

  doc.font(typography.bold).fontSize(titleFontSize).text(tituloInstitucional, textX, textStartY, { width: textWidth, align: 'center' });

  let nextTextY = doc.y + 1;
  if (constanciasCfg.subtitulo) {
    doc.font(typography.regular).fontSize(subtitleFontSize).text(constanciasCfg.subtitulo, textX, nextTextY, { width: textWidth, align: 'center' });
    nextTextY = doc.y + 1;
  }

  if (showSedeLine) {
    doc.font(typography.regular).fontSize(sedeFontSize).text(`SEDE "${sedeTexto}"`, textX, nextTextY, { width: textWidth, align: 'center' });
  }

  const topSideLogosBottom = topSideLogoBottoms.length ? Math.max(...topSideLogoBottoms) : 0;
  doc.x = left;
  doc.y = Math.max(doc.y, logoY + logoBoxSize, topSideLogosBottom) + 12;
}

function ensureSpace(doc, requiredHeight = 120) {
  const limitY = doc.page.height - doc.page.margins.bottom;
  if (doc.y + requiredHeight > limitY) {
    doc.addPage();
  }
}

function drawListadoAlumnosTable(doc, alumnos = [], constanciasCfg = {}) {
  const typography = getConstanciaTypography(constanciasCfg);
  const left = doc.page.margins.left;
  const maxWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const headerHeight = 22;
  const colNro = 40;
  const colCategoria = Math.min(maxWidth - colNro - 120, Math.max(130, Math.round(maxWidth * 0.32)));
  const colNombres = Math.floor((maxWidth - colNro - colCategoria) / 2);
  const colApellidos = maxWidth - colNro - colCategoria - colNombres;
  const cellTextWidths = [colNro - 12, colNombres - 12, colApellidos - 12, colCategoria - 12];

  const drawHeader = () => {
    const y = doc.y;
    doc.save();
    doc.rect(left, y, maxWidth, headerHeight).fill('#f1f5f9').stroke('#cbd5e1');
    doc.fillColor('#0f172a').fontSize(10).font(typography.bold);
    doc.text('NRO', left + 6, y + 6, { width: colNro - 12, align: 'left' });
    doc.text('NOMBRES', left + colNro + 6, y + 6, { width: colNombres - 12, align: 'left' });
    doc.text('APELLIDOS', left + colNro + colNombres + 6, y + 6, { width: colApellidos - 12, align: 'left' });
    doc.text('CAT', left + colNro + colNombres + colApellidos + 6, y + 6, { width: colCategoria - 12, align: 'left' });
    doc.restore();
    doc.y = y + headerHeight;
  };

  drawHeader();

  alumnos.forEach((alumno, index) => {
    const values = [
      String(index + 1),
      String(alumno.nombres || ''),
      String(alumno.apellidos || ''),
      String(alumno.categoria || '-')
    ];
    doc.font(typography.regular).fontSize(10);
    const rowHeight = Math.max(22, ...values.map((value, cellIndex) => (
      doc.heightOfString(value, { width: cellTextWidths[cellIndex] }) + 12
    )));

    if (doc.y + rowHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage();
      drawHeader();
    }

    const y = doc.y;
    doc.rect(left, y, maxWidth, rowHeight).stroke('#cbd5e1');
    doc.font(typography.regular).fontSize(10).fillColor('#111827');
    doc.text(values[0], left + 6, y + 6, { width: cellTextWidths[0], align: 'left' });
    doc.text(values[1], left + colNro + 6, y + 6, { width: cellTextWidths[1], align: 'left' });
    doc.text(values[2], left + colNro + colNombres + 6, y + 6, { width: cellTextWidths[2], align: 'left' });
    doc.text(values[3], left + colNro + colNombres + colApellidos + 6, y + 6, { width: cellTextWidths[3], align: 'left' });
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
  const typography = getConstanciaTypography(constanciasCfg);
  const cierreTexto = String(opciones?.cierreTexto || '').trim();
  const mostrarBloqueLiga = Boolean(opciones?.mostrarBloqueLiga);
  const layoutRetiroAislado = mostrarBloqueLiga;
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
  const alturaBloqueLiga = mostrarBloqueLiga ? 54 : 0;
  const alturaFirmaYPie = 14 + (lineasFirmante * 13) + (lineasPie > 0 ? 18 + lineasPie * 11 : 0) + alturaBloqueLiga;

  const cierreFontSize = Math.max(8, typography.size - 2.5);
  const alturaCierre = cierreTexto
    ? doc.font(typography.regular).fontSize(cierreFontSize).heightOfString(cierreTexto, {
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
  } else if (layoutRetiroAislado) {
    // En retiro aislado se aproxima el bloque hacia abajo para reducir vacio visual,
    // manteniendo separacion minima respecto al cuerpo y evitando salto de pagina.
    const limiteY = doc.page.height - doc.page.margins.bottom;
    const espacioNecesario = alturaEstimadaBloque + espacioReservadoInferior + 8;
    if (doc.y + espacioNecesario > limiteY) {
      doc.addPage();
    }

    const separacionMinimaDesdeCuerpo = 12;
    const retiroBottomSafeY = doc.page.height - doc.page.margins.bottom - espacioReservadoInferior - 42;
    const inicioAncladoAbajo = retiroBottomSafeY - alturaEstimadaBloque;
    const inicioObjetivoBloqueY = Math.max(doc.y + separacionMinimaDesdeCuerpo, inicioAncladoAbajo);

    doc.y = inicioObjetivoBloqueY;
  } else {
    const bottomSafeY = doc.page.height - doc.page.margins.bottom - espacioReservadoInferior - 8;
    const separacionFirmaDesdeCuerpo = 86;
    let inicioObjetivoBloqueY = doc.y + separacionFirmaDesdeCuerpo;
    if (inicioObjetivoBloqueY + alturaEstimadaBloque > bottomSafeY) {
      doc.addPage();
      inicioObjetivoBloqueY = doc.y + separacionFirmaDesdeCuerpo;
    }
    doc.y = inicioObjetivoBloqueY;
  }

  doc.font(typography.regular).fontSize(10.5);
  doc.text('_________________________', { align: 'center' });
  doc.moveDown(layoutRetiroAislado ? 0.12 : 0.5);
  doc.text(constanciasCfg.firmante.nombre || 'Direccion de la academia', { align: 'center' });
  if (constanciasCfg.firmante.cedula) doc.text(constanciasCfg.firmante.cedula, { align: 'center' });
  if (constanciasCfg.firmante.telefono) doc.text(constanciasCfg.firmante.telefono, { align: 'center' });
  if (constanciasCfg.firmante.cargo) doc.text(constanciasCfg.firmante.cargo, { align: 'center' });

  if (mostrarBloqueLiga) {
    doc.moveDown(1.72);
    doc.font(typography.regular).fontSize(10.5).text('Recibido por el personal de la liga: ______________________', {
      align: 'center'
    });
    doc.moveDown(0.35);
    doc.font(typography.regular).fontSize(10.5).text('Fecha: ____________________________________________', {
      align: 'center'
    });
  }

  if (constanciasCfg.pie_direccion || constanciasCfg.pie_lema) {
    doc.moveDown(layoutRetiroAislado ? 2.5 : 1.1);
    if (constanciasCfg.pie_direccion) {
      doc.fontSize(8.5).text(constanciasCfg.pie_direccion, { align: 'center' });
    }
    if (constanciasCfg.pie_lema) {
      doc.fontSize(8).text(constanciasCfg.pie_lema, { align: 'center' });
    }
  }

  renderLogosInferioresCentrados(doc, logosInstitucionales, espacioReservadoInferior);
}

function renderCierreFinal(doc, cierreTexto = '', constanciasCfg = {}) {
  const texto = String(cierreTexto || '').trim();
  if (!texto) return;

  const typography = getConstanciaTypography(constanciasCfg);
  const cierreFontSize = Math.max(8, typography.size - 2.5);
  const anchoTexto = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const alturaCierre = doc.font(typography.regular).fontSize(cierreFontSize).heightOfString(texto, {
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
  doc.font(typography.regular).fontSize(cierreFontSize).text(texto, {
    align: 'justify',
    lineGap: 2
  });
}

function createPdfResponseDocument(res) {
  const doc = new PDFDocument({ margin: 60 });

  const chainableNoopMethods = [
    'font',
    'fillColor',
    'fill',
    'stroke',
    'save',
    'restore',
    'rect',
    'addPage',
    'openImage'
  ];

  for (const method of chainableNoopMethods) {
    if (typeof doc[method] !== 'function') {
      doc[method] = () => doc;
    }
  }

  if (!doc.page || typeof doc.page !== 'object') {
    doc.page = { width: 612, height: 792 };
  }
  if (!doc.page.margins || typeof doc.page.margins !== 'object') {
    doc.page.margins = { top: 45, right: 45, bottom: 45, left: 45 };
  }
  if (typeof doc.heightOfString !== 'function') {
    doc.heightOfString = () => 0;
  }
  if (typeof doc.x !== 'number') doc.x = 45;
  if (typeof doc.y !== 'number') doc.y = 45;

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
    const rolUsuario = String(req.user?.rol || '').trim().toLowerCase();
    const esAdmin = rolUsuario === 'admin' || rolUsuario === 'super_admin';

    if (tipoConstancia === 'retiro' && !esAdmin) {
      return res.status(403).json({ error: 'Solo un administrador puede generar constancia de retiro' });
    }
    if (tipoConstancia === 'listado_alumnos' && !esAdmin) {
      return res.status(403).json({ error: 'Solo un administrador puede generar constancia con listado de alumnos' });
    }

    const configDoc = await TenantConfigModel.findOne({ key: 'default' }).select('constancias').lean();
    const constanciasCfg = normalizeConstanciasConfig(configDoc?.constancias || {});
    const academiaBranding = await getAcademiaBranding(req);
    const academiaLogoPath = academiaBranding.logoPath;
    const academyName = academiaBranding.academyName;
    let constanciaLayoutCfg = constanciasCfg;
    let logoAcademiaActivo = academiaLogoPath;
    let logosInstitucionales = mapLogoUrlsToLocalPaths(constanciasCfg.logos).filter((logoPath) => logoPath !== logoAcademiaActivo);
    let template = constanciasCfg.templates[tipoConstancia] || DEFAULT_TEMPLATES.simple;

    if (tipoConstancia === 'retiro' && constanciasCfg?.retiro_personalizado?.habilitado) {
      const retiroCfg = constanciasCfg.retiro_personalizado || DEFAULT_CONSTANCIAS_CONFIG.retiro_personalizado;
      constanciaLayoutCfg = {
        institucion_nombre: retiroCfg.institucion_nombre,
        subtitulo: retiroCfg.subtitulo,
        tipografia: constanciasCfg.tipografia,
        firmante: retiroCfg.firmante,
        pie_direccion: retiroCfg.pie_direccion,
        pie_lema: retiroCfg.pie_lema
      };
      logoAcademiaActivo = retiroCfg.incluir_logo_academia ? academiaLogoPath : null;
      logosInstitucionales = mapLogoUrlsToLocalPaths(retiroCfg.logos).filter((logoPath) => logoPath !== logoAcademiaActivo);
      template = retiroCfg.template || DEFAULT_TEMPLATES.retiro;
    }

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
      const mensualidadesListadoBase = TenantMensualidad.find({ id_alumno: { $in: ids } })
        .select('id_alumno estatus fecha_vencimiento mes anio');
      const mensualidadesListadoConAlumno = typeof mensualidadesListadoBase?.populate === 'function'
        ? mensualidadesListadoBase.populate('id_alumno', 'dia_limite_personalizado')
        : mensualidadesListadoBase;
      const mensualidadesListado = typeof mensualidadesListadoConAlumno?.lean === 'function'
        ? await mensualidadesListadoConAlumno.lean()
        : await mensualidadesListadoConAlumno;
      const ahora = new Date();
      const alumnosConDeudaIds = new Set(
        mensualidadesListado
          .filter((m) => mensualidadCuentaComoDeuda(m, ahora))
          .map((m) => String(m.id_alumno?._id || m.id_alumno || ''))
          .filter(Boolean)
      );

      if (!esAdmin && alumnosConDeudaIds.size > 0) {
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
      const usaMembrete = configurarMembrete(doc, constanciasCfg);
      const typography = getConstanciaTypography(constanciasCfg);
      if (!usaMembrete) {
        renderEncabezadoConstancia(doc, constanciasCfg, sedeNombre, academiaLogoPath, academyName);
      }
      doc.font(typography.bold).fontSize(typography.size + 3).text(template.titulo || 'CONSTANCIA', { align: 'center' });
      doc.moveDown(0.8);
      if (template.destinatario) {
        doc.font(typography.bold).fontSize(typography.size).text(template.destinatario, { align: 'center' });
        doc.moveDown(1.2);
      }

      doc.font(typography.regular).fontSize(typography.size).text(renderTemplate(template.cuerpo, variables), {
        align: 'justify',
        lineGap: 3,
        indent: CUERPO_PRIMERA_LINEA_SANGRIA
      });

      doc.moveDown(0.8);
      drawListadoAlumnosTable(doc, alumnosOrdenados, constanciasCfg);

      if (template.nota) {
        doc.moveDown(0.8);
        doc.font(typography.regular).fontSize(Math.max(8, typography.size - 0.5)).text(`NOTA: ${renderTemplate(template.nota, variables)}`, {
          align: 'justify',
          lineGap: 3
        });
      }

      const lugar = template.lugarEmision || constanciasCfg.templates?.simple?.lugarEmision || 'Barquisimeto';
      const fechaLinea = fechaTexto ? `En ${lugar}, ${fechaTexto}.` : '';
      if (fechaLinea) {
        doc.moveDown(template.nota ? 1.0 : 0.9);
        doc.font(typography.italic).fontSize(Math.max(8, typography.size - 1)).text(fechaLinea, { align: 'left' });
        doc.font(typography.regular);
      }

      const cierreTexto = renderTemplate(template.cierre, variables);

      renderFirmaYPie(doc, constanciasCfg, usaMembrete ? [] : logosInstitucionales, { cierreTexto });
      renderCierreFinal(doc, cierreTexto, constanciasCfg);
      await registrarOperacion(req, {
        tipo: 'generacion_constancia',
        nombre: getNombreOperacionConstancia(tipoConstancia),
        detalle: `Constancia de listado para ${alumnosOrdenados.length} alumno(s).`,
        entidad_tipo: 'Alumno',
        metadata: {
          tipo_constancia: tipoConstancia,
          cantidad_alumnos: alumnosOrdenados.length,
          alumno_ids: alumnosOrdenados.map((alumnoListado) => String(alumnoListado._id))
        }
      });
      doc.end();
      return;
    }

    const alumno = await TenantAlumno.findById(alumnoId).populate('representante').populate('sede');
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

    const mensualidadesBase = TenantMensualidad.find({ id_alumno: alumnoId }).select('estatus fecha_vencimiento mes anio');
    const mensualidades = typeof mensualidadesBase?.lean === 'function'
      ? await mensualidadesBase.lean()
      : await mensualidadesBase;
    const ahora = new Date();
    const tieneDeuda = mensualidades.some((m) => mensualidadCuentaComoDeuda(m, ahora, alumno));
    if (!esAdmin && tieneDeuda) {
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
      alumno_fecha_nacimiento: formatFechaAlumno(alumno?.fecha_nacimiento),
      alumno_fecha_ingreso_academia: formatFechaAlumno(alumno?.fecha_inscripcion),
      alumno_categoria: String(alumno?.categoria || '-').trim(),
      sede_nombre: String(alumno?.sede?.nombre || '-').trim(),
      fecha_emision_texto: fechaTexto || 'en fecha actual',
      horario_resumen: horarioResumen,
      ...(asistenciaData?.variables || {})
    };

    const doc = createPdfResponseDocument(res);
    const usaMembrete = configurarMembrete(doc, constanciasCfg);
    const typography = getConstanciaTypography(constanciasCfg);
    const retiroAisladoSinLogoPrincipal = tipoConstancia === 'retiro'
      && constanciasCfg?.retiro_personalizado?.habilitado
      && !constanciasCfg?.retiro_personalizado?.incluir_logo_academia;
    const esRetiroAislado = tipoConstancia === 'retiro' && constanciasCfg?.retiro_personalizado?.habilitado;
    const aplicaNotaYCierre = !esRetiroAislado;
    const logosRetiroEncabezado = esRetiroAislado ? logosInstitucionales.slice(0, 2) : [];
    const logosPie = esRetiroAislado || usaMembrete ? [] : logosInstitucionales;

    if (!usaMembrete) {
      renderEncabezadoConstancia(
        doc,
        constanciaLayoutCfg,
        variables.sede_nombre,
        logoAcademiaActivo,
        academyName,
        {
          useFallbackLogo: !retiroAisladoSinLogoPrincipal,
          topSideLogos: logosRetiroEncabezado,
          showSedeLine: !esRetiroAislado,
          titleFontSize: esRetiroAislado ? 12.5 : 15,
          subtitleFontSize: esRetiroAislado ? 10.5 : 12,
          sedeFontSize: esRetiroAislado ? 10 : 11
        }
      );
    }

    if (esRetiroAislado) {
      doc.moveDown(0.80);
    }

    doc.font(typography.bold).fontSize(typography.size + 3).text(template.titulo || 'CONSTANCIA', { align: 'center' });
    doc.moveDown(0.8);
    if (template.destinatario) {
      doc.font(typography.bold).fontSize(typography.size).text(template.destinatario, { align: 'center' });
      doc.moveDown(1.2);
    }

    let cuerpoTexto = renderTemplate(template.cuerpo, variables);
    if (tipoConstancia === 'asistencia') {
      cuerpoTexto = ajustarTiempoAsistenciaEnCuerpo(cuerpoTexto, variables);
    }

    const datosDestacados = tipoConstancia === 'asistencia'
      ? ['asistencia_nombre', 'asistencia_cedula', 'asistencia_dia_evento', 'asistencia_hora_desde', 'asistencia_hora_hasta', 'asistencia_motivo_evento']
      : ['alumno_nombre_completo', 'alumno_cedula', 'alumno_categoria', 'sede_nombre', 'horario_resumen'];
    const cuerpoRuns = buildConstanciaBodyRuns(cuerpoTexto, variables, datosDestacados);

    renderConstanciaBody(doc, cuerpoRuns, typography, {
      align: 'justify',
      lineGap: 3,
      indent: CUERPO_PRIMERA_LINEA_SANGRIA
    });

    if (aplicaNotaYCierre && template.nota) {
      doc.moveDown(0.8);
      doc.font(typography.regular).fontSize(Math.max(8, typography.size - 0.5)).text(`NOTA: ${renderTemplate(template.nota, variables)}`, {
        align: 'justify',
        lineGap: 3
      });
    }

    const lugar = template.lugarEmision || DEFAULT_TEMPLATES.simple.lugarEmision || 'Barquisimeto';
    const fechaLinea = fechaTexto ? `En ${lugar}, ${fechaTexto}.` : '';
    if (fechaLinea) {
      doc.moveDown(aplicaNotaYCierre && template.nota ? 1.0 : 0.9);
      doc.font(typography.italic).fontSize(Math.max(8, typography.size - 1)).text(fechaLinea, { align: 'left' });
      doc.font(typography.regular);
    }

    const cierreTexto = aplicaNotaYCierre ? renderTemplate(template.cierre, variables) : '';

    renderFirmaYPie(doc, constanciaLayoutCfg, logosPie, {
      cierreTexto,
      mostrarBloqueLiga: esRetiroAislado
    });
    renderCierreFinal(doc, cierreTexto, constanciaLayoutCfg);

    await registrarOperacion(req, {
      tipo: 'generacion_constancia',
      nombre: getNombreOperacionConstancia(tipoConstancia),
      detalle: `${template.titulo || 'Constancia'} de ${`${alumno?.nombres || ''} ${alumno?.apellidos || ''}`.trim()}.`,
      entidad_tipo: 'Alumno',
      entidad_id: alumno._id,
      metadata: {
        tipo_constancia: tipoConstancia,
        alumno_id: String(alumno._id),
        sede_id: alumno?.sede?._id ? String(alumno.sede._id) : null
      }
    });

    doc.end();
  } catch (err) {
    res.status(500).json({ error: 'Error generando constancia', detalle: err.message });
  }
};
