const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const sharp = require('sharp');
const mongoose = require('mongoose');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');
const { registrarOperacion } = require('../services/operacionService');

const DEFAULT_ROSTER_TEMPLATE = {
  header_title: 'ROSTER',
  texto_institucional: [
    'FEDERACION VENEZOLANA DE VOLEIBOL',
    'ASOCIACION DE VOLEIBOL DEL ESTADO LARA LIGA NACIONAL DE',
    'INICIACION DE VOLEIBOL LIGA DE VOLEIBOL MENOR DEL ESTADO LARA'
  ].join('\n'),
  equipo_label: 'EQUIPO',
  club_label: 'CLUB',
  categoria_label: 'CATEGORIA',
  entrenador_principal_label: 'ENTRENADOR (A) PRINCIPAL',
  asistente_label: 'ASISTENTE',
  logos: []
};

const DOCUMENT_FOOTER = 'Documento generado por Apex - sistema deportivo 2026';

function cleanValue(value) {
  return String(value || '').trim();
}

function normalizeAssistants(fields = {}) {
  const source = Array.isArray(fields.asistentes) ? fields.asistentes : [fields.asistente];
  return source.map(cleanValue).filter(Boolean).slice(0, 4);
}

function normalizeSexo(value) {
  const raw = cleanValue(value).toLowerCase();
  if (raw === 'femenino') return 'Femenino';
  if (raw === 'masculino') return 'Masculino';
  if (raw === 'mixto') return 'Mixto';
  return '';
}

function normalizeRosterTemplate(template = {}) {
  const root = template && typeof template === 'object' ? template : {};
  const legacyInstitutionalText = [
    root.federacion_linea_1,
    root.federacion_linea_2,
    root.federacion_linea_3
  ].map(cleanValue).filter(Boolean).join('\n');
  const logos = Array.isArray(root.logos)
    ? applyTemplateLogoLayout(root.logos)
    : [];

  return {
    header_title: cleanValue(root.header_title || DEFAULT_ROSTER_TEMPLATE.header_title),
    texto_institucional: cleanValue(root.texto_institucional || legacyInstitutionalText || DEFAULT_ROSTER_TEMPLATE.texto_institucional),
    equipo_label: cleanValue(root.equipo_label || DEFAULT_ROSTER_TEMPLATE.equipo_label),
    club_label: cleanValue(root.club_label || DEFAULT_ROSTER_TEMPLATE.club_label),
    categoria_label: cleanValue(root.categoria_label || DEFAULT_ROSTER_TEMPLATE.categoria_label),
    entrenador_principal_label: cleanValue(root.entrenador_principal_label || DEFAULT_ROSTER_TEMPLATE.entrenador_principal_label),
    asistente_label: cleanValue(root.asistente_label || DEFAULT_ROSTER_TEMPLATE.asistente_label),
    logos
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

const TEMPLATE_LOGO_LAYOUT = [
  { x: 0.035, y: 0.018 },
  { x: 0.145, y: 0.018 },
  { x: 0.755, y: 0.018 },
  { x: 0.865, y: 0.018 }
];

function applyTemplateLogoLayout(logos = []) {
  return logos
    .map((logo, index) => {
      const normalized = normalizeDocumentLogo(logo, index);
      const position = TEMPLATE_LOGO_LAYOUT[index];
      if (!normalized || !position) return null;
      return {
        ...normalized,
        ...position,
        width: 0.1,
        height: 0.065,
        zIndex: index + 1
      };
    })
    .filter(Boolean)
    .slice(0, 4);
}

function hasLegacySequentialLogoLayout(logos = []) {
  if (!Array.isArray(logos) || logos.length < 2) return false;
  return logos.every((logo, index) => (
    Math.abs(Number(logo?.x) - (0.04 + (index * 0.15))) < 0.002 &&
    Math.abs(Number(logo?.y) - 0.025) < 0.002 &&
    Math.abs(Number(logo?.width) - 0.12) < 0.002
  ));
}

function normalizeDocumentLogo(logo = {}, index = 0) {
  const url = cleanValue(logo?.url || logo);
  if (!url.startsWith('/uploads/')) return null;

  return {
    url,
    x: clampNumber(logo?.x, 0, 1, 0.04 + ((index % 4) * 0.15)),
    y: clampNumber(logo?.y, 0, 1, 0.025),
    width: clampNumber(logo?.width, 0.03, 0.5, 0.12),
    height: clampNumber(logo?.height, 0.02, 0.3, 0.08),
    zIndex: Math.max(1, Math.round(Number(logo?.zIndex) || index + 1))
  };
}

function normalizeRosterDocument(documento = {}, roster = {}, template = {}) {
  const root = documento && typeof documento === 'object' ? documento : {};
  const fields = root.campos && typeof root.campos === 'object' ? root.campos : {};
  const hasTitulo = Object.prototype.hasOwnProperty.call(fields, 'titulo');
  const hasSubtitulo = Object.prototype.hasOwnProperty.call(fields, 'subtitulo');
  const hasTextoInstitucional = Object.prototype.hasOwnProperty.call(fields, 'texto_institucional');
  const textoInstitucionalAnterior = [
    fields.federacion_linea_1,
    fields.federacion_linea_2,
    fields.federacion_linea_3
  ].map(cleanValue).filter(Boolean).join('\n');
  const textoInstitucionalPredeterminado = [
    template.texto_institucional
  ].map(cleanValue).filter(Boolean).join('\n');
  const asistentes = normalizeAssistants(fields);
  const hasInitializedLogos = root.logos_inicializados === true || (Array.isArray(root.logos) && root.logos.length > 0);
  const sourceLogos = hasInitializedLogos
    ? root.logos
    : (Array.isArray(template.logos) ? template.logos : []);
  const normalizedLogos = sourceLogos.map(normalizeDocumentLogo).filter(Boolean).slice(0, 4);

  return {
    incluir_fotos_cedula: root.incluir_fotos_cedula === true,
    logos_inicializados: true,
    campos: {
      titulo: hasTitulo ? cleanValue(fields.titulo) : cleanValue(template.header_title || 'ROSTER'),
      subtitulo: hasSubtitulo ? cleanValue(fields.subtitulo) : cleanValue(roster.torneo?.nombre || roster.liga_name || ''),
      texto_institucional: hasTextoInstitucional
        ? cleanValue(fields.texto_institucional)
        : (textoInstitucionalAnterior || textoInstitucionalPredeterminado),
      club: cleanValue(fields.club),
      categoria: cleanValue(fields.categoria || roster.categoria),
      equipo: cleanValue(fields.equipo || roster.grupo_competicion),
      entrenador_principal: cleanValue(fields.entrenador_principal),
      asistente: asistentes[0] || '',
      asistentes
    },
    logos: !hasInitializedLogos || hasLegacySequentialLogoLayout(normalizedLogos)
      ? applyTemplateLogoLayout(normalizedLogos)
      : normalizedLogos
  };
}

async function getTenantRosterModels(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);
  return {
    Roster: getTenantModel(connection, 'Roster'),
    Alumno: getTenantModel(connection, 'Alumno'),
    Torneo: getTenantModel(connection, 'Torneo'),
    TenantConfig: getTenantModel(connection, 'TenantConfig')
  };
}

async function populateTenantTournaments(Torneo, rosters = []) {
  const source = Array.isArray(rosters) ? rosters : [];
  const torneoIds = Array.from(new Set(
    source
      .map((roster) => cleanValue(roster?.torneo?._id || roster?.torneo))
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
  ));
  if (torneoIds.length === 0) return source;

  const torneos = await Torneo.find({ _id: { $in: torneoIds } })
    .select('nombre fecha_limite')
    .lean();
  const torneoMap = new Map(torneos.map((torneo) => [String(torneo._id), torneo]));

  return source.map((roster) => {
    const torneoId = cleanValue(roster?.torneo?._id || roster?.torneo);
    return { ...roster, torneo: torneoMap.get(torneoId) || roster.torneo };
  });
}

function parseJugadorIds(jugadoresRaw) {
  const source = Array.isArray(jugadoresRaw) ? jugadoresRaw : [];
  const normalized = source
    .map((id) => cleanValue(id))
    .filter((id) => mongoose.Types.ObjectId.isValid(id));
  return Array.from(new Set(normalized));
}

function parseOptionalDate(value) {
  const raw = cleanValue(value);
  if (!raw) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function uploadedRosterFiles(req) {
  return Object.values(req.files || {}).flat().filter(Boolean);
}

function removeUploadedFiles(files = []) {
  files.forEach((file) => {
    if (!file?.path || !fs.existsSync(file.path)) return;
    try {
      fs.unlinkSync(file.path);
    } catch (_) {
      // La persistencia del roster no debe fallar si el sistema bloquea temporalmente el archivo.
    }
  });
}

exports.listarRosters = async (req, res) => {
  try {
    const { Roster, Torneo } = await getTenantRosterModels(req);
    const torneoId = cleanValue(req.query?.torneoId);
    const filter = {};

    if (torneoId) {
      if (!mongoose.Types.ObjectId.isValid(torneoId)) {
        return res.status(400).json({ error: 'torneoId invalido' });
      }
      filter.torneo = torneoId;
    }

    const rosterDocs = await Roster.find(filter)
      .sort({ createdAt: -1 })
      .lean();
    const rosters = await populateTenantTournaments(Torneo, rosterDocs);

    return res.json(rosters);
  } catch (err) {
    return res.status(500).json({ error: 'No se pudieron listar los rosters', detalle: err.message });
  }
};

exports.obtenerEstudiantesElegibles = async (req, res) => {
  try {
    const { Roster, Alumno, Torneo } = await getTenantRosterModels(req);

    const sexo = normalizeSexo(req.query?.sexo);
    const categoria = cleanValue(req.query?.categoria);
    const division = cleanValue(req.query?.division);
    const torneoId = cleanValue(req.query?.torneoId);
    const rosterId = cleanValue(req.query?.rosterId);
    const incluirTodos = cleanValue(req.query?.todos).toLowerCase() === 'true';

    const filtroAlumnos = {
      activo: { $ne: false },
      dado_de_baja: { $ne: true }
    };

    if (torneoId && !incluirTodos) {
      if (!mongoose.Types.ObjectId.isValid(torneoId)) {
        return res.status(400).json({ error: 'torneoId invalido' });
      }

      const torneo = await Torneo.findById(torneoId).select('convocados').lean();
      if (!torneo) {
        return res.status(404).json({ error: 'Torneo no encontrado' });
      }

      const convocadosIds = Array.from(new Set(
        (Array.isArray(torneo.convocados) ? torneo.convocados : [])
          .map((c) => String(c?.alumno || c || '').trim())
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
      ));

      if (convocadosIds.length === 0) {
        return res.json([]);
      }

      filtroAlumnos._id = { $in: convocadosIds };
    }

    if (sexo && sexo !== 'Mixto') {
      filtroAlumnos.sexo = { $regex: new RegExp(`^${sexo}$`, 'i') };
    }
    if (categoria) {
      filtroAlumnos.categoria = { $regex: new RegExp(`^${categoria}$`, 'i') };
    }
    if (division) {
      filtroAlumnos.division = { $regex: new RegExp(`^${division}$`, 'i') };
    }

    const alumnos = await Alumno.find(filtroAlumnos)
      .select('nombres apellidos foto cedula fecha_nacimiento numero_franela sexo categoria division telefono sede representante')
      .populate('sede', 'nombre')
      .populate('representante', 'nombres apellidos telefono')
      .sort({ apellidos: 1, nombres: 1 })
      .lean();

    const conflictoMap = new Map();
    if (torneoId && mongoose.Types.ObjectId.isValid(torneoId)) {
      const rosters = await Roster.find({
        ...(mongoose.Types.ObjectId.isValid(rosterId) ? { _id: { $ne: rosterId } } : {}),
        torneo: torneoId,
        status: { $in: ['borrador', 'oficial'] }
      }).select('grupo_competicion categoria division sexo jugadores').lean();

      rosters.forEach((roster) => {
        const label = [roster.categoria, roster.division, roster.grupo_competicion].filter(Boolean).join(' · ');
        const ids = Array.isArray(roster.jugadores) ? roster.jugadores : [];
        ids.forEach((jugadorId) => {
          const key = String(jugadorId);
          if (!conflictoMap.has(key)) conflictoMap.set(key, []);
          conflictoMap.get(key).push(label || 'Otro roster');
        });
      });
    }

    const data = alumnos.map((alumno) => {
      const id = String(alumno._id);
      const conflictos = conflictoMap.get(id) || [];
      return {
        _id: id,
        nombres: alumno.nombres || '',
        apellidos: alumno.apellidos || '',
        nombre_completo: `${alumno.nombres || ''} ${alumno.apellidos || ''}`.trim(),
        foto: alumno.foto || '',
        cedula: alumno.cedula || '',
        fecha_nacimiento: alumno.fecha_nacimiento || null,
        numero_franela: alumno.numero_franela || null,
        sexo: alumno.sexo || '',
        categoria: alumno.categoria || '',
        division: alumno.division || '',
        sede_nombre: alumno?.sede?.nombre || '',
        representante_nombre: `${alumno?.representante?.nombres || ''} ${alumno?.representante?.apellidos || ''}`.trim(),
        representante_telefono: alumno?.representante?.telefono || alumno?.telefono || '',
        ya_en_otro_roster: conflictos.length > 0,
        rosters_existentes: conflictos
      };
    });

    return res.json(data);
  } catch (err) {
    return res.status(500).json({ error: 'No se pudieron obtener estudiantes elegibles', detalle: err.message });
  }
};

exports.crearRoster = async (req, res) => {
  try {
    const { Roster, Torneo, TenantConfig } = await getTenantRosterModels(req);

    const torneoId = cleanValue(req.body?.torneoId);
    const categoria = cleanValue(req.body?.categoria);
    const sexo = normalizeSexo(req.body?.sexo);
    const division = cleanValue(req.body?.division);
    const grupoCompeticion = cleanValue(req.body?.grupoCompeticion);

    if (!torneoId || !mongoose.Types.ObjectId.isValid(torneoId)) {
      return res.status(400).json({ error: 'torneoId es obligatorio y debe ser valido' });
    }
    if (!categoria) return res.status(400).json({ error: 'categoria es obligatoria' });
    if (!sexo) return res.status(400).json({ error: 'sexo es obligatorio' });
    if (!division) return res.status(400).json({ error: 'division es obligatoria' });
    if (!grupoCompeticion) return res.status(400).json({ error: 'grupoCompeticion es obligatorio' });

    const torneo = await Torneo.findById(torneoId).select('_id nombre').lean();
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });

    const existeMismaClave = await Roster.findOne({
      torneo: torneoId,
      categoria,
      sexo,
      division,
      grupo_competicion: grupoCompeticion,
      status: { $in: ['borrador', 'oficial'] }
    }).select('_id').lean();

    if (existeMismaClave) {
      return res.status(409).json({ error: 'Ya existe un roster activo para esa combinacion de torneo/categoria/sexo/division/grupo.' });
    }

    const configDoc = await TenantConfig.findOne({ key: 'default' }).select('rosters').lean();
    const template = normalizeRosterTemplate(configDoc?.rosters?.template || {});
    const documento = normalizeRosterDocument({}, {
      torneo,
      liga_name: cleanValue(torneo.nombre),
      categoria,
      grupo_competicion: grupoCompeticion
    }, template);

    const roster = await Roster.create({
      torneo: torneoId,
      liga_name: cleanValue(torneo.nombre),
      categoria,
      sexo,
      division,
      grupo_competicion: grupoCompeticion,
      jugadores: [],
      documento,
      status: 'borrador',
      created_by: req.user?.id || req.user?._id || undefined,
      updated_by: req.user?.id || req.user?._id || undefined
    });

    return res.status(201).json({
      message: 'Roster creado correctamente',
      roster
    });
  } catch (err) {
    return res.status(500).json({ error: 'No se pudo crear el roster', detalle: err.message });
  }
};

exports.actualizarEstatusRoster = async (req, res) => {
  try {
    const { Roster } = await getTenantRosterModels(req);
    const rosterId = cleanValue(req.params?.id);
    const status = cleanValue(req.body?.status).toLowerCase();

    if (!mongoose.Types.ObjectId.isValid(rosterId)) {
      return res.status(400).json({ error: 'Id de roster invalido' });
    }

    if (!['borrador', 'oficial', 'finalizado'].includes(status)) {
      return res.status(400).json({ error: 'status invalido' });
    }

    const roster = await Roster.findById(rosterId);
    if (!roster) return res.status(404).json({ error: 'Roster no encontrado' });

    if (roster.status !== status && ['borrador', 'oficial'].includes(status)) {
      const conflicto = await Roster.findOne({
        _id: { $ne: roster._id },
        torneo: roster.torneo,
        categoria: roster.categoria,
        sexo: roster.sexo,
        division: roster.division,
        grupo_competicion: roster.grupo_competicion,
        status: { $in: ['borrador', 'oficial'] }
      }).select('_id').lean();

      if (conflicto) {
        return res.status(409).json({
          error: 'No se puede activar este roster porque ya existe otro roster activo con la misma combinacion.'
        });
      }
    }

    roster.status = status;
    roster.updated_by = req.user?.id || req.user?._id || roster.updated_by;
    await roster.save();

    return res.json({ message: 'Estatus de roster actualizado', roster });
  } catch (err) {
    return res.status(500).json({ error: 'No se pudo actualizar estatus del roster', detalle: err.message });
  }
};

exports.actualizarJugadoresRoster = async (req, res) => {
  try {
    const { Roster, Alumno, Torneo } = await getTenantRosterModels(req);
    const rosterId = cleanValue(req.params?.id);
    const jugadores = parseJugadorIds(req.body?.jugadores);

    if (!mongoose.Types.ObjectId.isValid(rosterId)) {
      return res.status(400).json({ error: 'Id de roster invalido' });
    }

    const roster = await Roster.findById(rosterId);
    if (!roster) return res.status(404).json({ error: 'Roster no encontrado' });

    const alumnos = await Alumno.find({
      _id: { $in: jugadores },
      activo: { $ne: false },
      dado_de_baja: { $ne: true }
    }).select('_id categoria').lean();

    if (alumnos.length !== jugadores.length) {
      return res.status(400).json({ error: 'Hay atletas no validos o inactivos en la seleccion.' });
    }

    const conflicto = await Roster.findOne({
      _id: { $ne: roster._id },
      torneo: roster.torneo,
      status: { $in: ['borrador', 'oficial'] },
      jugadores: { $in: jugadores }
    }).select('_id').lean();

    if (conflicto) {
      return res.status(409).json({ error: 'Uno o mas atletas ya pertenecen a otro roster activo de este torneo.' });
    }

    const torneo = await Torneo.findById(roster.torneo);
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });

    const seleccionados = new Set(jugadores);
    const convocadosActuales = new Map(
      (torneo.convocados || []).map((item) => [String(item.alumno), item])
    );
    const categorias = new Map(alumnos.map((item) => [String(item._id), item.categoria || '']));

    jugadores.forEach((jugadorId) => {
      if (!convocadosActuales.has(jugadorId)) {
        torneo.convocados.push({
          alumno: jugadorId,
          categoria_snapshot: categorias.get(jugadorId) || '',
          estado: 'pendiente'
        });
      }
    });

    const eliminados = (roster.jugadores || [])
      .map((jugadorId) => String(jugadorId))
      .filter((jugadorId) => !seleccionados.has(jugadorId));

    if (eliminados.length > 0) {
      const usadosEnOtroRoster = await Roster.find({
        _id: { $ne: roster._id },
        torneo: roster.torneo,
        jugadores: { $in: eliminados }
      }).select('jugadores').lean();
      const idsUsados = new Set(
        usadosEnOtroRoster.flatMap((item) => (item.jugadores || []).map((id) => String(id)))
      );
      torneo.convocados = torneo.convocados.filter((item) => {
        const alumnoId = String(item.alumno);
        return !eliminados.includes(alumnoId) || idsUsados.has(alumnoId);
      });
    }

    roster.jugadores = jugadores;
    roster.jugadores_datos = (roster.jugadores_datos || []).filter((item) => seleccionados.has(String(item.alumno)));
    roster.updated_by = req.user?.id || req.user?._id || roster.updated_by;
    await torneo.save();
    await roster.save();

    return res.json({ message: 'Atletas del roster actualizados', roster });
  } catch (err) {
    return res.status(500).json({ error: 'No se pudieron actualizar los atletas del roster', detalle: err.message });
  }
};

exports.actualizarProcedenciaJugadorRoster = async (req, res) => {
  try {
    const { Roster } = await getTenantRosterModels(req);
    const rosterId = cleanValue(req.params?.id);
    const alumnoId = cleanValue(req.params?.alumnoId);
    if (!mongoose.Types.ObjectId.isValid(rosterId) || !mongoose.Types.ObjectId.isValid(alumnoId)) {
      return res.status(400).json({ error: 'Id de roster o atleta invalido' });
    }

    const fechaCambioPrestamo = parseOptionalDate(req.body?.fecha_cambio_prestamo);
    if (fechaCambioPrestamo === undefined) {
      return res.status(400).json({ error: 'La fecha de cambio o prestamo no es valida' });
    }

    const roster = await Roster.findById(rosterId);
    if (!roster) return res.status(404).json({ error: 'Roster no encontrado' });
    if (!(roster.jugadores || []).some((id) => String(id) === alumnoId)) {
      return res.status(404).json({ error: 'El atleta no pertenece a este roster' });
    }

    const clubProcedencia = cleanValue(req.body?.club_procedencia);
    const existingIndex = (roster.jugadores_datos || []).findIndex((item) => String(item.alumno) === alumnoId);
    if (!clubProcedencia && !fechaCambioPrestamo) {
      if (existingIndex >= 0) roster.jugadores_datos.splice(existingIndex, 1);
    } else if (existingIndex >= 0) {
      roster.jugadores_datos[existingIndex].club_procedencia = clubProcedencia;
      roster.jugadores_datos[existingIndex].fecha_cambio_prestamo = fechaCambioPrestamo;
    } else {
      roster.jugadores_datos.push({
        alumno: alumnoId,
        club_procedencia: clubProcedencia,
        fecha_cambio_prestamo: fechaCambioPrestamo
      });
    }

    roster.updated_by = req.user?.id || req.user?._id || roster.updated_by;
    await roster.save();
    const jugadorDato = (roster.jugadores_datos || []).find((item) => String(item.alumno) === alumnoId) || null;
    return res.json({ message: 'Datos de procedencia actualizados', jugador_dato: jugadorDato });
  } catch (err) {
    return res.status(500).json({ error: 'No se pudieron actualizar los datos de procedencia', detalle: err.message });
  }
};

exports.agregarPrestamoRoster = async (req, res) => {
  const uploadedFiles = uploadedRosterFiles(req);
  try {
    const { Roster } = await getTenantRosterModels(req);
    const rosterId = cleanValue(req.params?.id);
    if (!mongoose.Types.ObjectId.isValid(rosterId)) {
      removeUploadedFiles(uploadedFiles);
      return res.status(400).json({ error: 'Id de roster invalido' });
    }

    const fechaNacimiento = parseOptionalDate(req.body?.fecha_nacimiento);
    const fechaPrestamo = parseOptionalDate(req.body?.fecha_prestamo);
    if (fechaNacimiento === undefined || fechaPrestamo === undefined) {
      removeUploadedFiles(uploadedFiles);
      return res.status(400).json({ error: 'Una de las fechas no es valida' });
    }

    const roster = await Roster.findById(rosterId);
    if (!roster) {
      removeUploadedFiles(uploadedFiles);
      return res.status(404).json({ error: 'Roster no encontrado' });
    }

    const tenantId = resolveRequestTenantId(req);
    const foto = req.files?.foto?.[0];
    const fotoCedula = req.files?.foto_cedula?.[0];
    roster.prestamos.push({
      nombres: cleanValue(req.body?.nombres),
      apellidos: cleanValue(req.body?.apellidos),
      cedula: cleanValue(req.body?.cedula),
      fecha_nacimiento: fechaNacimiento,
      numero_franela: cleanValue(req.body?.numero_franela),
      foto: foto ? `/uploads/${tenantId}/rosters/${foto.filename}` : '',
      representante: cleanValue(req.body?.representante),
      telefono: cleanValue(req.body?.telefono),
      club_procedencia: cleanValue(req.body?.club_procedencia),
      fecha_prestamo: fechaPrestamo,
      foto_cedula: fotoCedula ? `/uploads/${tenantId}/rosters/${fotoCedula.filename}` : ''
    });
    roster.updated_by = req.user?.id || req.user?._id || roster.updated_by;
    await roster.save();

    return res.status(201).json({
      message: 'Atleta prestado agregado al roster',
      prestamo: roster.prestamos[roster.prestamos.length - 1]
    });
  } catch (err) {
    removeUploadedFiles(uploadedFiles);
    return res.status(500).json({ error: 'No se pudo agregar el atleta prestado', detalle: err.message });
  }
};

exports.actualizarPrestamoRoster = async (req, res) => {
  const uploadedFiles = uploadedRosterFiles(req);
  try {
    const { Roster } = await getTenantRosterModels(req);
    const rosterId = cleanValue(req.params?.id);
    const prestamoId = cleanValue(req.params?.prestamoId);
    if (!mongoose.Types.ObjectId.isValid(rosterId) || !mongoose.Types.ObjectId.isValid(prestamoId)) {
      removeUploadedFiles(uploadedFiles);
      return res.status(400).json({ error: 'Id de roster o prestamo invalido' });
    }

    const fechaNacimiento = parseOptionalDate(req.body?.fecha_nacimiento);
    const fechaPrestamo = parseOptionalDate(req.body?.fecha_prestamo);
    if (fechaNacimiento === undefined || fechaPrestamo === undefined) {
      removeUploadedFiles(uploadedFiles);
      return res.status(400).json({ error: 'Una de las fechas no es valida' });
    }

    const roster = await Roster.findById(rosterId);
    if (!roster) {
      removeUploadedFiles(uploadedFiles);
      return res.status(404).json({ error: 'Roster no encontrado' });
    }
    const prestamo = roster.prestamos.id(prestamoId);
    if (!prestamo) {
      removeUploadedFiles(uploadedFiles);
      return res.status(404).json({ error: 'Atleta prestado no encontrado' });
    }

    const tenantId = resolveRequestTenantId(req);
    const foto = req.files?.foto?.[0];
    const fotoCedula = req.files?.foto_cedula?.[0];
    const replacedImagePaths = [
      foto ? uploadUrlToLocalPath(prestamo.foto) : '',
      fotoCedula ? uploadUrlToLocalPath(prestamo.foto_cedula) : ''
    ].filter(Boolean);

    prestamo.set({
      nombres: cleanValue(req.body?.nombres),
      apellidos: cleanValue(req.body?.apellidos),
      cedula: cleanValue(req.body?.cedula),
      fecha_nacimiento: fechaNacimiento,
      numero_franela: cleanValue(req.body?.numero_franela),
      representante: cleanValue(req.body?.representante),
      telefono: cleanValue(req.body?.telefono),
      club_procedencia: cleanValue(req.body?.club_procedencia),
      fecha_prestamo: fechaPrestamo,
      ...(foto ? { foto: `/uploads/${tenantId}/rosters/${foto.filename}` } : {}),
      ...(fotoCedula ? { foto_cedula: `/uploads/${tenantId}/rosters/${fotoCedula.filename}` } : {})
    });
    roster.updated_by = req.user?.id || req.user?._id || roster.updated_by;
    await roster.save();
    removeUploadedFiles(replacedImagePaths.map((filePath) => ({ path: filePath })));

    return res.json({ message: 'Atleta prestado actualizado', prestamo });
  } catch (err) {
    removeUploadedFiles(uploadedFiles);
    return res.status(500).json({ error: 'No se pudo actualizar el atleta prestado', detalle: err.message });
  }
};

exports.eliminarPrestamoRoster = async (req, res) => {
  try {
    const { Roster } = await getTenantRosterModels(req);
    const rosterId = cleanValue(req.params?.id);
    const prestamoId = cleanValue(req.params?.prestamoId);
    if (!mongoose.Types.ObjectId.isValid(rosterId) || !mongoose.Types.ObjectId.isValid(prestamoId)) {
      return res.status(400).json({ error: 'Id de roster o prestamo invalido' });
    }

    const roster = await Roster.findById(rosterId);
    if (!roster) return res.status(404).json({ error: 'Roster no encontrado' });
    const prestamo = roster.prestamos.id(prestamoId);
    if (!prestamo) return res.status(404).json({ error: 'Atleta prestado no encontrado' });

    const imagePaths = [prestamo.foto, prestamo.foto_cedula]
      .map((url) => uploadUrlToLocalPath(url))
      .filter(Boolean);
    prestamo.deleteOne();
    roster.updated_by = req.user?.id || req.user?._id || roster.updated_by;
    await roster.save();
    removeUploadedFiles(imagePaths.map((filePath) => ({ path: filePath })));

    return res.json({ message: 'Atleta prestado eliminado del roster' });
  } catch (err) {
    return res.status(500).json({ error: 'No se pudo eliminar el atleta prestado', detalle: err.message });
  }
};

exports.actualizarEstadoJugadorRoster = async (req, res) => {
  try {
    const { Roster, Torneo } = await getTenantRosterModels(req);
    const rosterId = cleanValue(req.params?.id);
    const alumnoId = cleanValue(req.params?.alumnoId);
    const estado = cleanValue(req.body?.estado).toLowerCase();

    if (!mongoose.Types.ObjectId.isValid(rosterId) || !mongoose.Types.ObjectId.isValid(alumnoId)) {
      return res.status(400).json({ error: 'Id de roster o atleta invalido' });
    }
    if (!['pendiente', 'aceptado', 'rechazado'].includes(estado)) {
      return res.status(400).json({ error: 'Estado de convocatoria invalido' });
    }

    const roster = await Roster.findById(rosterId).select('torneo jugadores').lean();
    if (!roster) return res.status(404).json({ error: 'Roster no encontrado' });
    if (!(roster.jugadores || []).some((id) => String(id) === alumnoId)) {
      return res.status(404).json({ error: 'El atleta no pertenece a este roster' });
    }

    const torneo = await Torneo.findById(roster.torneo);
    if (!torneo) return res.status(404).json({ error: 'Torneo no encontrado' });

    const convocado = (torneo.convocados || []).find((item) => String(item.alumno) === alumnoId);
    if (!convocado) return res.status(404).json({ error: 'El atleta no esta convocado al torneo' });

    convocado.estado = estado;
    convocado.respondido_en = estado === 'pendiente' ? null : new Date();
    await torneo.save();

    return res.json({ message: 'Estado de convocatoria actualizado', estado });
  } catch (err) {
    return res.status(500).json({ error: 'No se pudo actualizar el estado de convocatoria', detalle: err.message });
  }
};

exports.eliminarRoster = async (req, res) => {
  try {
    const { Roster, Torneo } = await getTenantRosterModels(req);
    const rosterId = cleanValue(req.params?.id);

    if (!mongoose.Types.ObjectId.isValid(rosterId)) {
      return res.status(400).json({ error: 'Id de roster invalido' });
    }

    const roster = await Roster.findById(rosterId).lean();
    if (!roster) return res.status(404).json({ error: 'Roster no encontrado' });

    const jugadores = (roster.jugadores || []).map((id) => String(id));
    if (jugadores.length > 0) {
      const usadosEnOtroRoster = await Roster.find({
        _id: { $ne: roster._id },
        torneo: roster.torneo,
        jugadores: { $in: jugadores }
      }).select('jugadores').lean();
      const idsUsados = new Set(
        usadosEnOtroRoster.flatMap((item) => (item.jugadores || []).map((id) => String(id)))
      );
      const torneo = await Torneo.findById(roster.torneo);
      if (torneo) {
        torneo.convocados = (torneo.convocados || []).filter((item) => {
          const alumnoId = String(item.alumno);
          return !jugadores.includes(alumnoId) || idsUsados.has(alumnoId);
        });
        await torneo.save();
      }
    }

    await Roster.deleteOne({ _id: roster._id });

    return res.json({ message: 'Roster eliminado correctamente' });
  } catch (err) {
    return res.status(500).json({ error: 'No se pudo eliminar el roster', detalle: err.message });
  }
};

exports.obtenerPlantillaRoster = async (req, res) => {
  try {
    const { TenantConfig } = await getTenantRosterModels(req);
    const doc = await TenantConfig.findOne({ key: 'default' }).select('rosters').lean();
    const template = normalizeRosterTemplate(doc?.rosters?.template || {});
    return res.json({ template });
  } catch (err) {
    return res.status(500).json({ error: 'No se pudo obtener la plantilla de roster', detalle: err.message });
  }
};

exports.actualizarPlantillaRoster = async (req, res) => {
  try {
    const { Roster, TenantConfig } = await getTenantRosterModels(req);
    const template = normalizeRosterTemplate(req.body?.template || {});
    const configActual = await TenantConfig.findOne({ key: 'default' }).select('rosters').lean();
    const templateActual = normalizeRosterTemplate(configActual?.rosters?.template || {});
    const rostersSinLogosInicializados = await Roster.find({
      'documento.logos_inicializados': { $ne: true }
    });

    await Promise.all(rostersSinLogosInicializados.map(async (roster) => {
      roster.documento = normalizeRosterDocument(roster.documento, roster, templateActual);
      await roster.save();
    }));

    await TenantConfig.findOneAndUpdate(
      { key: 'default' },
      {
        $set: {
          rosters: {
            template
          }
        }
      },
      { new: true, upsert: true, runValidators: true }
    );

    return res.json({ message: 'Plantilla de roster actualizada', template });
  } catch (err) {
    return res.status(500).json({ error: 'No se pudo actualizar la plantilla de roster', detalle: err.message });
  }
};

exports.subirLogoPlantillaRoster = async (req, res) => {
  const uploadedPath = req.file?.path;
  try {
    if (!req.file) return res.status(400).json({ error: 'Selecciona una imagen para el logo' });

    const tenantId = resolveRequestTenantId(req);
    const logo = normalizeDocumentLogo({
      url: `/uploads/${tenantId}/rosters/${req.file.filename}`,
      x: 0.04,
      y: 0.025,
      width: 0.12,
      height: 0.08,
      zIndex: 1
    });

    return res.status(201).json({ message: 'Logo cargado', logo });
  } catch (err) {
    if (uploadedPath && fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
    return res.status(500).json({ error: 'No se pudo subir el logo predeterminado', detalle: err.message });
  }
};

exports.obtenerDocumentoRoster = async (req, res) => {
  try {
    const { Roster, Torneo, TenantConfig } = await getTenantRosterModels(req);
    const rosterId = cleanValue(req.params?.id);
    if (!mongoose.Types.ObjectId.isValid(rosterId)) {
      return res.status(400).json({ error: 'Id de roster invalido' });
    }

    const rosterDoc = await Roster.findById(rosterId)
      .populate({
        path: 'jugadores',
        select: 'nombres apellidos cedula fecha_nacimiento numero_franela foto foto_cedula sede representante telefono',
        populate: [
          { path: 'sede', select: 'nombre' },
          { path: 'representante', select: 'nombres apellidos telefono' }
        ]
      })
      .lean();
    if (!rosterDoc) return res.status(404).json({ error: 'Roster no encontrado' });
    const [roster] = await populateTenantTournaments(Torneo, [rosterDoc]);

    const configDoc = await TenantConfig.findOne({ key: 'default' }).select('rosters').lean();
    const template = normalizeRosterTemplate(configDoc?.rosters?.template || {});
    const documento = normalizeRosterDocument(roster.documento, roster, template);
    return res.json({ roster: { ...roster, documento }, template });
  } catch (err) {
    return res.status(500).json({ error: 'No se pudo cargar el documento del roster', detalle: err.message });
  }
};

exports.actualizarDocumentoRoster = async (req, res) => {
  try {
    const { Roster, TenantConfig } = await getTenantRosterModels(req);
    const rosterId = cleanValue(req.params?.id);
    if (!mongoose.Types.ObjectId.isValid(rosterId)) {
      return res.status(400).json({ error: 'Id de roster invalido' });
    }

    const roster = await Roster.findById(rosterId);
    if (!roster) return res.status(404).json({ error: 'Roster no encontrado' });

    const configDoc = await TenantConfig.findOne({ key: 'default' }).select('rosters').lean();
    const template = normalizeRosterTemplate(configDoc?.rosters?.template || {});
    roster.documento = normalizeRosterDocument(req.body?.documento || req.body, roster, template);
    roster.updated_by = req.user?.id || req.user?._id || roster.updated_by;
    await roster.save();

    return res.json({ message: 'Documento del roster actualizado', documento: roster.documento });
  } catch (err) {
    return res.status(500).json({ error: 'No se pudo actualizar el documento del roster', detalle: err.message });
  }
};

exports.subirLogoDocumentoRoster = async (req, res) => {
  const uploadedPath = req.file?.path;
  try {
    const { Roster, TenantConfig } = await getTenantRosterModels(req);
    const rosterId = cleanValue(req.params?.id);
    if (!mongoose.Types.ObjectId.isValid(rosterId)) {
      if (uploadedPath && fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
      return res.status(400).json({ error: 'Id de roster invalido' });
    }
    if (!req.file) return res.status(400).json({ error: 'Selecciona una imagen para el logo' });

    const roster = await Roster.findById(rosterId);
    if (!roster) {
      if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
      return res.status(404).json({ error: 'Roster no encontrado' });
    }

    const configDoc = await TenantConfig.findOne({ key: 'default' }).select('rosters').lean();
    const template = normalizeRosterTemplate(configDoc?.rosters?.template || {});
    const documentoActual = normalizeRosterDocument(roster.documento, roster, template);
    const logosActuales = documentoActual.logos;
    if (logosActuales.length >= 4) {
      if (fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
      return res.status(400).json({ error: 'Solo se permiten hasta 4 logos por roster' });
    }

    const tenantId = resolveRequestTenantId(req);
    const logoPosition = TEMPLATE_LOGO_LAYOUT[logosActuales.length] || TEMPLATE_LOGO_LAYOUT[0];
    const logo = normalizeDocumentLogo({
      url: `/uploads/${tenantId}/rosters/${req.file.filename}`,
      x: logoPosition.x,
      y: logoPosition.y,
      width: 0.1,
      height: 0.065,
      zIndex: logosActuales.length + 1
    }, logosActuales.length);

    roster.documento = { ...documentoActual, logos: [...logosActuales, logo], logos_inicializados: true };
    roster.updated_by = req.user?.id || req.user?._id || roster.updated_by;
    await roster.save();

    return res.status(201).json({ message: 'Logo agregado al roster', logo, logos: roster.documento.logos });
  } catch (err) {
    if (uploadedPath && fs.existsSync(uploadedPath)) fs.unlinkSync(uploadedPath);
    return res.status(500).json({ error: 'No se pudo subir el logo del roster', detalle: err.message });
  }
};

function mapDocumentLogosToLocalPaths(logos = []) {
  return logos
    .map((logo, index) => {
      const normalized = normalizeDocumentLogo(logo, index);
      const cleanUrl = cleanValue(normalized?.url);
      if (!cleanUrl.startsWith('/uploads/')) return null;
      const relativePath = cleanUrl.replace(/^\/+/, '');
      return { ...normalized, path: path.join(__dirname, '..', relativePath) };
    })
    .filter(Boolean);
}

function uploadUrlToDataUri(uploadUrl) {
  const cleanUrl = cleanValue(uploadUrl);
  if (!cleanUrl.startsWith('/uploads/')) return '';

  const relativePath = cleanUrl.replace(/^\/+/, '');
  const absolutePath = path.join(__dirname, '..', relativePath);
  if (!fs.existsSync(absolutePath)) return '';

  const extension = path.extname(absolutePath).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };
  const mimeType = mimeTypes[extension];
  if (!mimeType) return '';

  return `data:${mimeType};base64,${fs.readFileSync(absolutePath).toString('base64')}`;
}

function uploadUrlToLocalPath(uploadUrl) {
  const cleanUrl = cleanValue(uploadUrl);
  if (!cleanUrl.startsWith('/uploads/')) return '';
  const absolutePath = path.join(__dirname, '..', cleanUrl.replace(/^\/+/, ''));
  return fs.existsSync(absolutePath) ? absolutePath : '';
}

async function buildRosterDocHeaderDataUri(logos, template, titulo, subtitulo, textoInstitucional = '') {
  const width = 718;
  const height = 170;
  const pixelRatio = 2;
  const lineasInstitucionales = cleanValue(textoInstitucional).split(/\r?\n/);
  const inicioY = 122 - ((lineasInstitucionales.length - 1) * 13);
  const textoInstitucionalSvg = lineasInstitucionales
    .map((linea, index) => `<text x="${width}" y="${inicioY + (index * 26)}" font-size="20">${escapeHtml(linea)}</text>`)
    .join('');
  const svg = Buffer.from(`
    <svg width="${width * pixelRatio}" height="${height * pixelRatio}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="white" />
      <g fill="#000" text-anchor="middle" font-family="Arial, sans-serif">
        ${textoInstitucionalSvg}
        <text x="${width}" y="248" font-family="Arial, sans-serif" font-size="44" font-weight="700">${escapeHtml(titulo)}</text>
        <text x="${width}" y="296" font-family="Arial, sans-serif" font-size="26" font-weight="700">${escapeHtml(subtitulo)}</text>
      </g>
    </svg>
  `);

  const logoLayers = await Promise.all(
    logos
      .map((logo, index) => normalizeDocumentLogo(logo, index))
      .filter(Boolean)
      .sort((left, right) => left.zIndex - right.zIndex)
      .map(async (logo) => {
        const logoPath = uploadUrlToLocalPath(logo.url);
        if (!logoPath) return null;
        const logoWidth = Math.max(24, Math.round(logo.width * width * pixelRatio));
        const logoHeight = Math.max(20, Math.round(logo.height * 1047 * pixelRatio));
        try {
          const input = await sharp(logoPath)
            .flatten({ background: '#ffffff' })
            .resize({
              width: logoWidth,
              height: logoHeight,
              fit: 'contain',
              background: { r: 255, g: 255, b: 255, alpha: 1 }
            })
            .png()
            .toBuffer();
          return {
            input,
            left: Math.max(0, Math.round(logo.x * width * pixelRatio)),
            top: Math.max(0, Math.round(logo.y * 1047 * pixelRatio))
          };
        } catch (_) {
          return null;
        }
      })
  );

  const header = await sharp({
    create: {
      width: width * pixelRatio,
      height: height * pixelRatio,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
    .composite([{ input: svg }, ...logoLayers.filter(Boolean)])
    .png()
    .toBuffer();

  return `data:image/png;base64,${header.toString('base64')}`;
}

async function buildContainedImageDataUri(uploadUrl, width, height) {
  const imagePath = uploadUrlToLocalPath(uploadUrl);
  if (!imagePath) return '';

  try {
    const image = await sharp(imagePath)
      .resize({
        width,
        height,
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .flatten({ background: '#ffffff' })
      .png()
      .toBuffer();
    return `data:image/png;base64,${image.toString('base64')}`;
  } catch (_) {
    return '';
  }
}

function formatRosterDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date);
}

function buildRosterPlayers(roster = {}) {
  const jugadoresDatos = new Map(
    (Array.isArray(roster.jugadores_datos) ? roster.jugadores_datos : [])
      .map((item) => [String(item?.alumno?._id || item?.alumno || ''), item])
  );
  const alumnos = (Array.isArray(roster.jugadores) ? roster.jugadores : []).map((item) => {
    const representante = `${item?.representante?.nombres || ''} ${item?.representante?.apellidos || ''}`.trim();
    const telefono = cleanValue(item?.representante?.telefono || item?.telefono);
    const jugadorDato = jugadoresDatos.get(String(item?._id)) || {};
    return {
      _id: item?._id,
      nombres: cleanValue(item?.nombres),
      apellidos: cleanValue(item?.apellidos),
      nombre: `${item?.nombres || ''} ${item?.apellidos || ''}`.trim(),
      cedula: cleanValue(item?.cedula),
      fecha_nacimiento: formatRosterDate(item?.fecha_nacimiento),
      numero_franela: item?.numero_franela || '',
      foto: cleanValue(item?.foto),
      foto_cedula: cleanValue(item?.foto_cedula),
      representante: [representante, telefono].filter(Boolean).join(' · '),
      procedencia: [cleanValue(jugadorDato.club_procedencia), formatRosterDate(jugadorDato.fecha_cambio_prestamo)].filter(Boolean).join(' · ')
    };
  });
  const prestamos = (Array.isArray(roster.prestamos) ? roster.prestamos : []).map((item) => ({
    _id: item?._id,
    nombres: cleanValue(item?.nombres),
    apellidos: cleanValue(item?.apellidos),
    nombre: `${item?.nombres || ''} ${item?.apellidos || ''}`.trim(),
    cedula: cleanValue(item?.cedula),
    fecha_nacimiento: formatRosterDate(item?.fecha_nacimiento),
    numero_franela: cleanValue(item?.numero_franela),
    foto: cleanValue(item?.foto),
    foto_cedula: cleanValue(item?.foto_cedula),
    representante: [cleanValue(item?.representante), cleanValue(item?.telefono)].filter(Boolean).join(' · '),
    procedencia: [cleanValue(item?.club_procedencia), formatRosterDate(item?.fecha_prestamo)].filter(Boolean).join(' · ')
  }));
  return [...alumnos, ...prestamos];
}

async function registrarDescargaRoster(req, roster, formato, cantidadAtletas) {
  const torneoNombre = cleanValue(roster?.torneo?.nombre || roster?.liga_name);
  const equipo = cleanValue(roster?.documento?.campos?.equipo || roster?.grupo_competicion);
  await registrarOperacion(req, {
    tipo: 'descarga_roster',
    nombre: `Roster descargado en ${formato}`,
    detalle: [torneoNombre, equipo, cleanValue(roster?.categoria)].filter(Boolean).join(' · '),
    entidad_tipo: 'Roster',
    entidad_id: roster?._id,
    metadata: {
      formato: formato.toLowerCase(),
      torneo_id: roster?.torneo?._id || roster?.torneo || null,
      torneo_nombre: torneoNombre,
      equipo,
      categoria: cleanValue(roster?.categoria),
      cantidad_atletas: cantidadAtletas
    }
  });
}

function writeRosterTable(doc, jugadores = [], startY = 172) {
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const columns = [
    { key: 'nro', label: 'N°', width: 24 },
    { key: 'nombres', label: 'Nombres y Apellidos de la Atleta', width: 112 },
    { key: 'cedula', label: 'Cédula', width: 56 },
    { key: 'fecha', label: 'Fecha de\nnacimiento', width: 62 },
    { key: 'franela', label: 'Número\nfranela', width: 38 },
    { key: 'foto', label: 'Foto', width: 64 },
    { key: 'representante', label: 'Representante y teléfono', width: 86 },
    { key: 'procedencia', label: 'Club de procedencia y fecha de cambio o préstamo', width: 82 }
  ];

  const headerHeight = 38;
  const rowHeight = 68;
  const pageBottom = () => doc.page.height - doc.page.margins.bottom;

  const drawHeader = (y) => {
    doc.font('Helvetica-Bold').fontSize(7);
    let cursorX = left;
    doc.rect(left, y, width, headerHeight).fillAndStroke('#5b9be6', '#000');
    columns.forEach((col, idx) => {
      if (idx > 0) doc.moveTo(cursorX, y).lineTo(cursorX, y + headerHeight).stroke('#000');
      doc.fillColor('#000').text(col.label, cursorX + 2, y + 3, { width: col.width - 4, height: headerHeight - 4, align: 'center' });
      cursorX += col.width;
    });
  };

  const drawRow = (rowIndex, jugador, y) => {
    let cursorX = left;
    doc.rect(left, y, width, rowHeight).stroke('#000');

    const values = {
      nro: String(rowIndex + 1),
      nombres: jugador.nombre || '',
      cedula: jugador.cedula || '',
      fecha: jugador.fecha_nacimiento || '',
      franela: jugador.numero_franela || '',
      foto: '',
      representante: jugador.representante || '',
      procedencia: jugador.procedencia || ''
    };

    doc.font('Helvetica').fontSize(7);
    columns.forEach((col, idx) => {
      if (idx > 0) doc.moveTo(cursorX, y).lineTo(cursorX, y + rowHeight).stroke('#000');
      if (col.key === 'foto') {
        const photoPath = uploadUrlToLocalPath(jugador.foto);
        if (photoPath) {
          try {
            doc.save();
            doc.rect(cursorX + 2, y + 2, col.width - 4, rowHeight - 4).clip();
            doc.image(photoPath, cursorX + 2, y + 2, {
              fit: [col.width - 4, rowHeight - 4],
              align: 'center',
              valign: 'center'
            });
            doc.restore();
          } catch (_) {
            doc.restore();
          }
        }
      } else {
        doc.text(values[col.key], cursorX + 2, y + 5, {
          width: col.width - 4,
          height: rowHeight - 8,
          ellipsis: true,
          align: ['nro', 'franela', 'nombres', 'cedula', 'fecha'].includes(col.key) ? 'center' : 'left'
        });
      }
      cursorX += col.width;
    });
  };

  let cursorY = startY;
  drawHeader(cursorY);
  cursorY += headerHeight;

  for (let i = 0; i < jugadores.length; i += 1) {
    if (cursorY + rowHeight > pageBottom()) {
      doc.addPage({ margin: 35, size: 'A4' });
      cursorY = doc.page.margins.top;
      drawHeader(cursorY);
      cursorY += headerHeight;
    }
    drawRow(i, jugadores[i], cursorY);
    cursorY += rowHeight;
  }

  return cursorY;
}

function writeRosterIdCards(doc, jugadores = [], startY) {
  const cards = jugadores
    .map((jugador, index) => ({
      index,
      nombre: `${jugador?.nombres || ''} ${jugador?.apellidos || ''}`.trim(),
      imagePath: uploadUrlToLocalPath(jugador?.foto_cedula)
    }))
    .filter((card) => card.imagePath);

  if (cards.length === 0) return startY;

  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const cardWidth = contentWidth / 2;
  const cardHeight = 160;
  const pageBottom = () => doc.page.height - doc.page.margins.bottom;
  let cursorY = startY;

  for (let offset = 0; offset < cards.length; offset += 2) {
    if (cursorY + cardHeight > pageBottom()) {
      doc.addPage({ margin: 35, size: 'A4' });
      cursorY = doc.page.margins.top;
    }

    cards.slice(offset, offset + 2).forEach((card, column) => {
      const x = doc.page.margins.left + (column * cardWidth);
      const y = cursorY;

      doc.rect(x, y, cardWidth, cardHeight).stroke('#333');
      doc.font('Helvetica-Bold').fontSize(8).text(
        `CEDULA ${card.index + 1}${card.nombre ? ` · ${card.nombre}` : ''}`,
        x + 4,
        y + 6,
        { width: cardWidth - 8, height: 14, align: 'center', ellipsis: true }
      );
      doc.moveTo(x, y + 24).lineTo(x + cardWidth, y + 24).stroke('#333');
      try {
        doc.image(card.imagePath, x + 5, y + 29, {
          fit: [cardWidth - 10, cardHeight - 34],
          align: 'center',
          valign: 'center'
        });
      } catch (_) {
        // Ignorar una cédula ilegible sin interrumpir el documento completo.
      }
    });

    cursorY += cardHeight;
  }

  return cursorY;
}

exports.exportarRosterPdf = async (req, res) => {
  try {
    const { Roster, Torneo, TenantConfig } = await getTenantRosterModels(req);
    const rosterId = cleanValue(req.params?.id);

    if (!mongoose.Types.ObjectId.isValid(rosterId)) {
      return res.status(400).json({ error: 'Id de roster invalido' });
    }

    const rosterDoc = await Roster.findById(rosterId)
      .populate({
        path: 'jugadores',
        select: 'nombres apellidos cedula fecha_nacimiento numero_franela foto foto_cedula sede representante telefono',
        populate: [
          { path: 'sede', select: 'nombre' },
          { path: 'representante', select: 'nombres apellidos telefono' }
        ]
      })
      .lean();

    if (!rosterDoc) return res.status(404).json({ error: 'Roster no encontrado' });
    const [roster] = await populateTenantTournaments(Torneo, [rosterDoc]);

    const configDoc = await TenantConfig.findOne({ key: 'default' }).select('rosters').lean();
    const template = normalizeRosterTemplate(configDoc?.rosters?.template || {});
    const documento = normalizeRosterDocument(roster.documento, roster, template);
    const logos = mapDocumentLogosToLocalPaths(documento.logos);

    const doc = new PDFDocument({ margin: 35, size: 'A4', bufferPages: true });
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', async () => {
      const pdfData = Buffer.concat(buffers);
      await registrarDescargaRoster(req, roster, 'PDF', jugadores.length);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=roster-${rosterId}.pdf`);
      res.send(pdfData);
    });

    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

    logos.forEach((logo) => {
      try {
        doc.image(logo.path, logo.x * doc.page.width, logo.y * doc.page.height, {
          fit: [logo.width * doc.page.width, logo.height * doc.page.height]
        });
      } catch (_) {
        // Ignorar logos inválidos.
      }
    });

    doc.font('Helvetica').fontSize(7.5).text(documento.campos.texto_institucional, doc.page.width * 0.22, 30, {
      width: doc.page.width * 0.56,
      align: 'center',
      lineGap: 1.5
    });

    doc.font('Helvetica-Bold').fontSize(14).text(documento.campos.titulo, left, 78, { width, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(10).text(documento.campos.subtitulo, left, 95, { width, align: 'center' });

    const categoriaText = `${template.categoria_label}: ${documento.campos.categoria}`;
    const sexoText = `(${cleanValue(roster.sexo)})`;
    const equipoText = `${template.equipo_label}: ${documento.campos.equipo}`;
    const clubText = `${template.club_label}: ${documento.campos.club || '__________________'}`;

    doc.font('Helvetica').fontSize(9);
    doc.text(`${clubText}     ${categoriaText} ${sexoText}     ${equipoText}`, left, 117, { width, align: 'left' });
    const asistentesTexto = documento.campos.asistentes.length > 0
      ? documento.campos.asistentes.join(', ')
      : '____________________';
    const personalTecnicoTexto = `${template.entrenador_principal_label}: ${documento.campos.entrenador_principal || '____________________'}   ${template.asistente_label}: ${asistentesTexto}`;
    const personalTecnicoHeight = doc.heightOfString(personalTecnicoTexto, { width });
    doc.text(personalTecnicoTexto, left, 136, { width, align: 'left' });

    const jugadores = buildRosterPlayers(roster);

    const tableBottomY = writeRosterTable(doc, jugadores, 142 + Math.max(12, personalTecnicoHeight));

    let contentBottomY = tableBottomY;
    if (documento.incluir_fotos_cedula) {
      contentBottomY = writeRosterIdCards(doc, jugadores, tableBottomY);
    }

    const footerHeight = 42;
    if (contentBottomY + footerHeight > doc.page.height - doc.page.margins.bottom) {
      doc.addPage({ margin: 35, size: 'A4' });
      contentBottomY = doc.page.margins.top;
    }
    doc.font('Helvetica').fontSize(9);
    const footerY = contentBottomY + 10;
    doc.text('Recibido por: ________________________________________________', doc.page.margins.left, footerY, { width, align: 'left' });
    doc.text('Fecha, lugar y hora: _________________________________________', doc.page.margins.left, footerY + 16, { width, align: 'left' });

    const pageRange = doc.bufferedPageRange();
    for (let pageIndex = pageRange.start; pageIndex < pageRange.start + pageRange.count; pageIndex += 1) {
      doc.switchToPage(pageIndex);
      const documentFooterY = doc.page.height - doc.page.margins.bottom - 9;
      doc.font('Helvetica').fontSize(7).fillColor('#555555').text(
        DOCUMENT_FOOTER,
        doc.page.margins.left,
        documentFooterY,
        { width, align: 'center', lineBreak: false }
      );
    }

    doc.end();
  } catch (err) {
    return res.status(500).json({ error: 'No se pudo exportar el roster', detalle: err.message });
  }
};

exports.exportarRosterDoc = async (req, res) => {
  try {
    const { Roster, Torneo, TenantConfig } = await getTenantRosterModels(req);
    const rosterId = cleanValue(req.params?.id);

    if (!mongoose.Types.ObjectId.isValid(rosterId)) {
      return res.status(400).json({ error: 'Id de roster invalido' });
    }

    const rosterDoc = await Roster.findById(rosterId)
      .populate({
        path: 'jugadores',
        select: 'nombres apellidos cedula fecha_nacimiento numero_franela foto foto_cedula sede representante telefono',
        populate: [
          { path: 'sede', select: 'nombre' },
          { path: 'representante', select: 'nombres apellidos telefono' }
        ]
      })
      .lean();

    if (!rosterDoc) return res.status(404).json({ error: 'Roster no encontrado' });
    const [roster] = await populateTenantTournaments(Torneo, [rosterDoc]);

    const configDoc = await TenantConfig.findOne({ key: 'default' }).select('rosters').lean();
    const template = normalizeRosterTemplate(configDoc?.rosters?.template || {});
    const documento = normalizeRosterDocument(roster.documento, roster, template);
    const headerDataUri = await buildRosterDocHeaderDataUri(
      documento.logos,
      template,
      documento.campos.titulo,
      documento.campos.subtitulo,
      documento.campos.texto_institucional
    );
    const rosterPlayers = buildRosterPlayers(roster);
    const jugadores = rosterPlayers.map((item, index) => {
      const foto = uploadUrlToDataUri(item?.foto);

      return `
        <tr>
          <td class="center">${index + 1}</td>
          <td class="name">${escapeHtml(item?.nombre)}</td>
          <td class="center">${escapeHtml(cleanValue(item?.cedula))}</td>
          <td class="center">${escapeHtml(item?.fecha_nacimiento)}</td>
          <td class="center">${escapeHtml(item?.numero_franela || '')}</td>
          <td class="photo-cell">${foto ? `<img class="player-photo" src="${foto}" width="72" height="68" />` : ''}</td>
          <td>${escapeHtml(item?.representante)}</td>
          <td>${escapeHtml(item?.procedencia)}</td>
        </tr>`;
    }).join('');

    const cedulas = documento.incluir_fotos_cedula
      ? await Promise.all(rosterPlayers
      .map(async (item, index) => {
        const fotoCedula = await buildContainedImageDataUri(item?.foto_cedula, 700, 310);
        if (!fotoCedula) return '';
        return `
          <td class="id-card">
            <div class="id-title">CEDULA ${index + 1}</div>
            <img class="id-image" src="${fotoCedula}" width="350" height="155" />
          </td>`;
      }))
      : [];
    const cedulasDisponibles = cedulas.filter(Boolean);
    const cedulaRows = [];
    for (let index = 0; index < cedulasDisponibles.length; index += 2) {
      cedulaRows.push(`<tr>${cedulasDisponibles[index]}${cedulasDisponibles[index + 1] || '<td class="id-card"></td>'}</tr>`);
    }

    const html = `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8" />
        <meta name="ProgId" content="Word.Document" />
        <title>${escapeHtml(documento.campos.titulo)} ${escapeHtml(documento.campos.subtitulo)}</title>
        <!--[if gte mso 9]><xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser />
          </w:WordDocument>
        </xml><![endif]-->
        <style>
          @page {
            size: 595.3pt 841.9pt;
            margin: 28.35pt;
            mso-page-orientation: portrait;
          }
          @page Section1 {
            size: 595.3pt 841.9pt;
            margin: 28.35pt;
            mso-page-orientation: portrait;
            mso-footer: f1;
          }
          div.Section1 { page: Section1; position: relative; width: 718px; }
          body {
            font-family: Arial, sans-serif;
            font-size: 8pt;
            color: #000;
            width: 718px;
            margin: 0;
          }
          table { border-collapse: collapse; width: 718px; }
          .players, .ids { width: 718px !important; }
          .document-header { display: block; width: 718px; height: 170px; mso-width-source: userset; mso-height-source: userset; }
          .meta { width: 718px; font-family: Arial, sans-serif; font-weight: bold; margin: 3px 0; white-space: normal; overflow-wrap: break-word; }
          .meta-spacer { width: 718px; height: 7px; line-height: 7px; font-size: 1px; }
          .meta-technical { margin: 0 0 4px; font-weight: bold; }
          .players { table-layout: fixed; font-family: Arial, sans-serif; }
          .players th, .players td { border: 1px solid #000; padding: 2px; vertical-align: middle; }
          .players th { background-color: #5b9be6; mso-shading: #5b9be6; color: #111; font-size: 7pt; text-align: center; line-height: 1; }
          .players td { height: 68px; font-size: 7.5pt; }
          .players th:nth-child(1) { width: 4%; }
          .players th:nth-child(2) { width: 21%; }
          .players th:nth-child(3) { width: 10%; }
          .players th:nth-child(4) { width: 13%; }
          .players th:nth-child(5) { width: 8%; }
          .players th:nth-child(6) { width: 11%; }
          .players th:nth-child(7) { width: 17%; }
          .players th:nth-child(8) { width: 16%; }
          .center { text-align: center; }
          .name { text-align: center; font-weight: bold; }
          .photo-cell { width: 8%; text-align: center; padding: 0 !important; }
          .player-photo { display: block; width: 72px; height: 68px; margin: 0 auto; object-fit: contain; mso-width-source: userset; mso-height-source: userset; }
          .ids { table-layout: fixed; }
          .ids td { border: 1px solid #000; width: 50%; padding: 0; vertical-align: top; }
          .id-title { font-family: Arial, sans-serif; text-align: center; font-weight: bold; border-bottom: 1px solid #000; padding: 2px; }
          .id-image { display: block; width: 350px; height: 155px; object-fit: contain; mso-width-source: userset; mso-height-source: userset; }
          .receipt { width: 718px; margin-top: 8px; font-family: Arial, sans-serif; font-weight: bold; line-height: 2; }
          .document-footer { mso-element: footer; font-family: Arial, sans-serif; font-size: 7pt; color: #555555; text-align: center; }
        </style>
      </head>
      <body>
        <div class="Section1">
        <img class="document-header" src="${headerDataUri}" width="718" height="170" />
        <div class="meta">
          ${escapeHtml(template.club_label)}: ${escapeHtml(documento.campos.club || '__________________')} &nbsp;&nbsp;
          ${escapeHtml(template.categoria_label)}: ${escapeHtml(documento.campos.categoria)} (${escapeHtml(cleanValue(roster.sexo))}) &nbsp;&nbsp;
          ${escapeHtml(template.equipo_label)}: ${escapeHtml(documento.campos.equipo)}
        </div>
        <div class="meta-spacer">&nbsp;</div>
        <div class="meta meta-technical" style="font-weight:bold">
          <strong>${escapeHtml(template.entrenador_principal_label)}: ${escapeHtml(documento.campos.entrenador_principal || '__________________')} &nbsp;&nbsp;
          ${escapeHtml(template.asistente_label)}: ${escapeHtml(documento.campos.asistentes.length > 0 ? documento.campos.asistentes.join(', ') : '__________________')}</strong>
        </div>
        <table class="players" width="718">
          <thead>
            <tr bgcolor="#5b9be6" style="background-color:#5b9be6">
              <th style="width:22px">N°</th>
              <th>Nombres y Apellidos de la Atleta</th>
              <th style="width:58px">Cédula</th>
              <th style="width:70px">Fecha de<br />nacimiento</th>
              <th style="width:38px">Número<br />franela</th>
              <th style="width:76px">Foto</th>
              <th>Representante y teléfono</th>
              <th>Club de procedencia y fecha de cambio o préstamo</th>
            </tr>
          </thead>
          <tbody>
            ${jugadores}
          </tbody>
        </table>
        ${cedulaRows.length ? `<table class="ids" width="718">${cedulaRows.join('')}</table>` : ''}

        <div class="receipt">
          Recibido por: ___________________________________________________________________<br />
          Fecha, lugar y hora: ____________________________________________________________
        </div>
        <div style="mso-element:footer" id="f1">
          <p class="document-footer">${escapeHtml(DOCUMENT_FOOTER)}</p>
        </div>
        </div>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'application/msword');
    res.setHeader('Content-Disposition', `attachment; filename=roster-${rosterId}.doc`);
    await registrarDescargaRoster(req, roster, 'DOC', rosterPlayers.length);
    return res.send(Buffer.from(`\ufeff${html}`, 'utf-8'));
  } catch (err) {
    return res.status(500).json({ error: 'No se pudo exportar el roster en DOC', detalle: err.message });
  }
};

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
