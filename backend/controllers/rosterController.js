const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const sharp = require('sharp');
const mongoose = require('mongoose');
const CoreTorneo = require('../models/Torneo');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const { resolveRequestTenantId } = require('../services/tenantFallbackService');

const DEFAULT_ROSTER_TEMPLATE = {
  header_title: 'ROSTER',
  texto_institucional: [
    'FEDERACION VENEZOLANA DE VOLEIBOL',
    'ASOCIACION DE VOLEIBOL DEL ESTADO LARA',
    'LIGA DE INICIACION DE VOLEIBOL'
  ].join('\n'),
  equipo_label: 'EQUIPO',
  club_label: 'CLUB',
  categoria_label: 'CATEGORIA',
  entrenador_principal_label: 'ENTRENADOR (A) PRINCIPAL',
  asistente_label: 'ASISTENTE',
  logos: []
};

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
    TenantConfig: getTenantModel(connection, 'TenantConfig')
  };
}

async function populateCoreTournaments(rosters = []) {
  const source = Array.isArray(rosters) ? rosters : [];
  const torneoIds = Array.from(new Set(
    source
      .map((roster) => cleanValue(roster?.torneo?._id || roster?.torneo))
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
  ));
  if (torneoIds.length === 0) return source;

  const torneos = await CoreTorneo.find({ _id: { $in: torneoIds } })
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

exports.listarRosters = async (req, res) => {
  try {
    const { Roster } = await getTenantRosterModels(req);
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
    const rosters = await populateCoreTournaments(rosterDocs);

    return res.json(rosters);
  } catch (err) {
    return res.status(500).json({ error: 'No se pudieron listar los rosters', detalle: err.message });
  }
};

exports.obtenerEstudiantesElegibles = async (req, res) => {
  try {
    const { Roster, Alumno } = await getTenantRosterModels(req);

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

      const torneo = await CoreTorneo.findById(torneoId).select('convocados').lean();
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
      .select('nombres apellidos cedula fecha_nacimiento numero_franela sexo categoria division telefono sede representante')
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
    const { Roster, TenantConfig } = await getTenantRosterModels(req);

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

    const torneo = await CoreTorneo.findById(torneoId).select('_id nombre').lean();
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
    const { Roster, Alumno } = await getTenantRosterModels(req);
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

    const torneo = await CoreTorneo.findById(roster.torneo);
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
    roster.updated_by = req.user?.id || req.user?._id || roster.updated_by;
    await torneo.save();
    await roster.save();

    return res.json({ message: 'Atletas del roster actualizados', roster });
  } catch (err) {
    return res.status(500).json({ error: 'No se pudieron actualizar los atletas del roster', detalle: err.message });
  }
};

exports.actualizarEstadoJugadorRoster = async (req, res) => {
  try {
    const { Roster } = await getTenantRosterModels(req);
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

    const torneo = await CoreTorneo.findById(roster.torneo);
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
    const { Roster } = await getTenantRosterModels(req);
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
      const torneo = await CoreTorneo.findById(roster.torneo);
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
    const { Roster, TenantConfig } = await getTenantRosterModels(req);
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
    const [roster] = await populateCoreTournaments([rosterDoc]);

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

function calcularEdad(fechaNacimiento) {
  if (!fechaNacimiento) return '';
  const nacimiento = new Date(fechaNacimiento);
  if (Number.isNaN(nacimiento.getTime())) return '';
  const hoy = new Date();
  let edad = hoy.getFullYear() - nacimiento.getFullYear();
  const diferenciaMes = hoy.getMonth() - nacimiento.getMonth();
  if (diferenciaMes < 0 || (diferenciaMes === 0 && hoy.getDate() < nacimiento.getDate())) edad -= 1;
  return edad >= 0 ? `${edad} años` : '';
}

function writeRosterTable(doc, jugadores = [], startY = 172) {
  const left = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const columns = [
    { key: 'nro', label: 'N°', width: 24 },
    { key: 'foto', label: 'Foto', width: 72 },
    { key: 'franela', label: 'Número\nFranela', width: 42 },
    { key: 'nombres', label: 'Nombre y Apellidos', width: 136 },
    { key: 'cedula', label: 'Nro. de\nCédula', width: 62 },
    { key: 'fecha', label: 'Edad\nFecha de Nacimiento', width: 70 },
    { key: 'representante', label: 'Representante y teléfono', width: 118 }
  ];

  const headerHeight = 22;
  const rowHeight = 68;
  const pageBottom = () => doc.page.height - doc.page.margins.bottom;

  const drawHeader = (y) => {
    doc.font('Helvetica-Bold').fontSize(7);
    let cursorX = left;
    doc.rect(left, y, width, headerHeight).fillAndStroke('#f1f1ed', '#000');
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
      club: jugador.club_procedencia || ''
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
  const cardHeight = 190;
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
    const { Roster, TenantConfig } = await getTenantRosterModels(req);
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
    const [roster] = await populateCoreTournaments([rosterDoc]);

    const configDoc = await TenantConfig.findOne({ key: 'default' }).select('rosters').lean();
    const template = normalizeRosterTemplate(configDoc?.rosters?.template || {});
    const documento = normalizeRosterDocument(roster.documento, roster, template);
    const logos = mapDocumentLogosToLocalPaths(documento.logos);

    const doc = new PDFDocument({ margin: 35, size: 'A4' });
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
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

    doc.font('Helvetica').fontSize(8).text(documento.campos.texto_institucional, doc.page.width * 0.26, 30, {
      width: doc.page.width * 0.48,
      align: 'center',
      lineGap: 2
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

    const jugadores = (Array.isArray(roster.jugadores) ? roster.jugadores : []).map((item) => {
      const representante = `${item?.representante?.nombres || ''} ${item?.representante?.apellidos || ''}`.trim();
      const telefono = cleanValue(item?.representante?.telefono || item?.telefono);
      const fecha = item?.fecha_nacimiento
        ? new Intl.DateTimeFormat('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(item.fecha_nacimiento))
        : '';

      return {
        nombre: `${item?.nombres || ''} ${item?.apellidos || ''}`.trim(),
        cedula: cleanValue(item?.cedula),
        fecha_nacimiento: [fecha, calcularEdad(item?.fecha_nacimiento)].filter(Boolean).join('\n'),
        numero_franela: item?.numero_franela || '',
        foto: cleanValue(item?.foto),
        representante: [representante, telefono].filter(Boolean).join(' · '),
        club_procedencia: cleanValue(item?.sede?.nombre)
      };
    });

    const tableBottomY = writeRosterTable(doc, jugadores, 142 + Math.max(12, personalTecnicoHeight));

    let contentBottomY = tableBottomY;
    if (documento.incluir_fotos_cedula) {
      contentBottomY = writeRosterIdCards(doc, roster.jugadores || [], tableBottomY);
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

    doc.end();
  } catch (err) {
    return res.status(500).json({ error: 'No se pudo exportar el roster', detalle: err.message });
  }
};

exports.exportarRosterDoc = async (req, res) => {
  try {
    const { Roster, TenantConfig } = await getTenantRosterModels(req);
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
    const [roster] = await populateCoreTournaments([rosterDoc]);

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
    const jugadores = (Array.isArray(roster.jugadores) ? roster.jugadores : []).map((item, index) => {
      const representante = `${item?.representante?.nombres || ''} ${item?.representante?.apellidos || ''}`.trim();
      const telefono = cleanValue(item?.representante?.telefono || item?.telefono);
      const fecha = item?.fecha_nacimiento
        ? new Intl.DateTimeFormat('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(item.fecha_nacimiento))
        : '';
      const foto = uploadUrlToDataUri(item?.foto);

      return `
        <tr>
          <td class="center">${index + 1}</td>
          <td class="photo-cell">${foto ? `<img class="player-photo" src="${foto}" width="72" height="68" />` : ''}</td>
          <td class="center">${escapeHtml(item?.numero_franela || '')}</td>
          <td class="name">${escapeHtml(`${item?.nombres || ''} ${item?.apellidos || ''}`.trim())}</td>
          <td class="center">${escapeHtml(cleanValue(item?.cedula))}</td>
          <td class="center">${escapeHtml(fecha)}<br /><strong>${escapeHtml(calcularEdad(item?.fecha_nacimiento))}</strong></td>
          <td>${escapeHtml([representante, telefono].filter(Boolean).join(' / '))}</td>
        </tr>`;
    }).join('');

    const cedulas = documento.incluir_fotos_cedula
      ? await Promise.all((Array.isArray(roster.jugadores) ? roster.jugadores : [])
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
          .players th { background-color: #f1f1ed; mso-shading: #f1f1ed; font-size: 7pt; text-align: center; line-height: 1; }
          .players td { height: 68px; font-size: 7.5pt; }
          .players th:nth-child(1) { width: 4%; }
          .players th:nth-child(2) { width: 11%; }
          .players th:nth-child(3) { width: 9%; }
          .players th:nth-child(4) { width: 21%; }
          .players th:nth-child(5) { width: 12%; }
          .players th:nth-child(6) { width: 16%; }
          .players th:nth-child(7) { width: 27%; }
          .center { text-align: center; }
          .name { text-align: center; font-weight: bold; }
          .photo-cell { width: 8%; text-align: center; padding: 0 !important; }
          .player-photo { display: block; width: 72px; height: 68px; margin: 0 auto; object-fit: contain; mso-width-source: userset; mso-height-source: userset; }
          .ids { table-layout: fixed; }
          .ids td { border: 1px solid #000; width: 50%; padding: 0; vertical-align: top; }
          .id-title { font-family: Arial, sans-serif; text-align: center; font-weight: bold; border-bottom: 1px solid #000; padding: 2px; }
          .id-image { display: block; width: 350px; height: 155px; object-fit: contain; mso-width-source: userset; mso-height-source: userset; }
          .receipt { width: 718px; margin-top: 8px; font-family: Arial, sans-serif; font-weight: bold; line-height: 2; }
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
            <tr bgcolor="#f1f1ed" style="background-color:#f1f1ed">
              <th style="width:22px">N°</th>
              <th style="width:76px">Foto</th>
              <th style="width:38px">Número<br />Franela</th>
              <th>Nombre y Apellidos</th>
              <th style="width:58px">Nro. de<br />Cédula</th>
              <th style="width:70px">Edad<br />Fecha de Nacimiento</th>
              <th>Representante y teléfono</th>
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
        </div>
      </body>
      </html>
    `;

    res.setHeader('Content-Type', 'application/msword');
    res.setHeader('Content-Disposition', `attachment; filename=roster-${rosterId}.doc`);
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
