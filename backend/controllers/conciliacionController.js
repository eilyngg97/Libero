const XLSX = require('xlsx');
const path = require('path');
const Mensualidad = require('../models/Mensualidad');
const PagoDetalle = require('../models/PagoDetalle');
const UniformePedido = require('../models/UniformePedido');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');

const MONTO_TOLERANCIA_BS = 100;
const TIPO_CONCILIACION = {
  MENSUALIDADES: 'mensualidades',
  UNIFORMES: 'uniformes'
};

const BANCO_CONCILIACION = {
  PROVINCIAL: 'provincial'
};

async function getTenantConciliacionModels(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);

  return {
    connection,
    Mensualidad: getTenantModel(connection, 'Mensualidad'),
    PagoDetalle: getTenantModel(connection, 'PagoDetalle'),
    UniformePedido: getTenantModel(connection, 'UniformePedido')
  };
}

function resolveConciliacionModels(models = {}) {
  return {
    Mensualidad: models.Mensualidad || Mensualidad,
    PagoDetalle: models.PagoDetalle || PagoDetalle,
    UniformePedido: models.UniformePedido || UniformePedido
  };
}

function resolveTipoConciliacion(rawTipo) {
  const tipo = String(rawTipo || TIPO_CONCILIACION.MENSUALIDADES).trim().toLowerCase();
  if (tipo === TIPO_CONCILIACION.MENSUALIDADES || tipo === TIPO_CONCILIACION.UNIFORMES) {
    return tipo;
  }
  return null;
}

function resolveBancoConciliacion(rawBanco) {
  const raw = String(rawBanco || '').trim();
  if (!raw) return '';

  const normalized = normalizarTexto(raw);
  const soloDigitos = raw.replace(/\D/g, '');

  if (
    soloDigitos === '0108'
    || normalized.includes('provincial')
    || normalized.includes('bbva provincial')
  ) {
    return BANCO_CONCILIACION.PROVINCIAL;
  }

  return normalized;
}

function normalizarTexto(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizarReferencia(value) {
  return String(value || '').replace(/\D/g, '');
}

function ultimosDigitosReferencia(value, cantidad = 6) {
  const ref = normalizarReferencia(value);
  if (!ref) return '';
  return ref.slice(-cantidad);
}

function telefonoComparable(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length >= 10 ? digits.slice(-10) : '';
}

function cedulaComparable(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';

  // Algunos bancos reportan cedulas con cero a la izquierda (ej: V025894044).
  // Para comparar contra el sistema, normalizamos removiendo ceros iniciales.
  return digits.replace(/^0+/, '');
}

function extraerIdentificadoresDesdeDescripcion(descripcion) {
  const raw = String(descripcion || '');
  if (!raw.trim()) return [];

  const matches = raw.match(/\d{7,12}/g) || [];
  return [...new Set(matches.map((match) => String(match || '').replace(/\D/g, '')).filter(Boolean))];
}

function extraerTelefonoDesdeDescripcion(descripcion) {
  const raw = String(descripcion || '');
  if (!raw.trim()) return '';

  const tokens = raw.match(/\d+/g) || [];

  for (const token of tokens) {
    const matches = token.match(/(?:58)?0?4\d{9}/g) || [];
    if (matches.length) return matches[0];
  }

  return '';
}

function extraerCedulasCandidatasDesdeDescripcion(descripcion) {
  const raw = String(descripcion || '');
  if (!raw.trim()) return [];

  const tokens = raw.match(/\d+/g) || [];
  const candidatos = new Set();
  const longitudesPreferidas = [8, 7, 9, 6];

  for (const token of tokens) {
    const sinCeros = String(token || '').replace(/^0+/, '');
    if (!sinCeros) continue;

    if (sinCeros.length >= 6 && sinCeros.length <= 9) {
      candidatos.add(sinCeros);
      continue;
    }

    if (sinCeros.length > 9) {
      for (const len of longitudesPreferidas) {
        if (sinCeros.length < len) continue;

        // En bloques largos con ruido, tomamos un candidato determinista
        // (prefijo numerico plausible) para evitar falsos positivos por ventanas.
        const candidato = sinCeros.slice(0, len);
        if (/^\d+$/.test(candidato)) {
          candidatos.add(candidato);
          break;
        }
      }
    }
  }

  return [...candidatos];
}

function extraerCedulaDesdeDescripcion(descripcion) {
  const candidatos = extraerCedulasCandidatasDesdeDescripcion(descripcion);
  return candidatos[0] || '';
}

function referenciasCoinciden(valueBanco, valueSistema) {
  const refBanco = normalizarReferencia(valueBanco);
  const refSistema = normalizarReferencia(valueSistema);
  if (!refBanco || !refSistema) return false;
  if (refBanco === refSistema) return true;

  // Soporta el caso comun: banco con referencia larga y sistema con ultimos 6 digitos.
  return ultimosDigitosReferencia(refBanco) === ultimosDigitosReferencia(refSistema);
}

function parseMonto(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number(value.toFixed(2));
  }

  if (value === null || value === undefined) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  const limpio = raw.replace(/[^0-9,.-]/g, '');
  if (!limpio) return null;

  const comas = (limpio.match(/,/g) || []).length;
  const puntos = (limpio.match(/\./g) || []).length;

  // Caso ambiguo con un solo separador y 3 digitos a la derecha:
  // 10.000 o 10,000 suele representar miles, no decimales.
  if ((comas + puntos) === 1) {
    const separator = comas === 1 ? ',' : '.';
    const [left = '', right = ''] = limpio.split(separator);
    if (/^\d+$/.test(left) && /^\d+$/.test(right) && right.length === 3) {
      const miles = Number(`${left}${right}`);
      if (!Number.isNaN(miles)) return Number(miles.toFixed(2));
    }
  }

  const ultimaComa = limpio.lastIndexOf(',');
  const ultimoPunto = limpio.lastIndexOf('.');
  const separadorDecimal = ultimaComa > ultimoPunto ? ',' : '.';

  let normalizado = limpio;
  if (separadorDecimal === ',') {
    normalizado = normalizado.replace(/\./g, '');
    normalizado = normalizado.replace(',', '.');
  } else {
    normalizado = normalizado.replace(/,/g, '');
  }

  const numero = Number(normalizado);
  if (Number.isNaN(numero)) return null;
  return Number(numero.toFixed(2));
}

function pad(num) {
  return String(num).padStart(2, '0');
}

function toIsoDate(dateObj) {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return null;
  return `${dateObj.getUTCFullYear()}-${pad(dateObj.getUTCMonth() + 1)}-${pad(dateObj.getUTCDate())}`;
}

function parseFecha(value) {
  if (!value) return null;

  if (value instanceof Date) return toIsoDate(value);

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return `${parsed.y}-${pad(parsed.m)}-${pad(parsed.d)}`;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const dmY = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmY) {
    const d = Number(dmY[1]);
    const m = Number(dmY[2]);
    const y = Number(dmY[3].length === 2 ? `20${dmY[3]}` : dmY[3]);
    return `${y}-${pad(m)}-${pad(d)}`;
  }

  const ymd = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) {
    const y = Number(ymd[1]);
    const m = Number(ymd[2]);
    const d = Number(ymd[3]);
    return `${y}-${pad(m)}-${pad(d)}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return toIsoDate(parsed);
}

function areAmountsEqual(a, b) {
  if (a === null || b === null || a === undefined || b === undefined) return false;
  return Math.abs(Number(a) - Number(b)) <= MONTO_TOLERANCIA_BS;
}

function areDatesWithinDays(dateA, dateB, maxDays = 1) {
  if (!dateA || !dateB) return true;
  const a = new Date(`${dateA}T00:00:00Z`);
  const b = new Date(`${dateB}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return true;
  const diffDays = Math.abs(a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= maxDays;
}

function levenshteinDistance(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  if (!left && !right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  const dp = Array.from({ length: left.length + 1 }, () => new Array(right.length + 1).fill(0));
  for (let i = 0; i <= left.length; i++) dp[i][0] = i;
  for (let j = 0; j <= right.length; j++) dp[0][j] = j;

  for (let i = 1; i <= left.length; i++) {
    for (let j = 1; j <= right.length; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[left.length][right.length];
}

function findColumnKey(headersMap, candidates) {
  for (const candidate of candidates) {
    if (headersMap[candidate] !== undefined) return headersMap[candidate];
  }
  return null;
}

function parseExcelRows(fileBuffer, extension = '') {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error('El archivo Excel no tiene hojas');

  const worksheet = workbook.Sheets[firstSheetName];
  // Leemos como AOA con raw:true para priorizar el valor real de la celda.
  // Esto evita que el parseo de monto dependa del formato visual (ej: separadores locales).
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: true,
    blankrows: false
  });
  if (!rows.length) throw new Error('El archivo Excel esta vacio');

  let headerRowIndex = -1;
  let fechaIdx = null;
  let referenciaIdx = null;
  let montoIdx = null;
  let descripcionIdx = null;
  const encabezadosDetectados = new Set();

  // Algunos bancos agregan filas de resumen antes de los encabezados.
  for (let i = 0; i < rows.length; i += 1) {
    const headerRow = Array.isArray(rows[i]) ? rows[i] : [];
    const headersMap = {};

    headerRow.forEach((header, index) => {
      const key = normalizarTexto(header);
      if (key) {
        headersMap[key] = index;
        encabezadosDetectados.add(key);
      }
    });

    const currentReferenciaIdx = findColumnKey(headersMap, ['referencia', 'ref', 'nro referencia', 'numero referencia']);
    const currentMontoIdx = findColumnKey(headersMap, ['monto', 'amount', 'monto bs', 'monto_bs', 'importe', 'credito', 'crédito']);
    const currentDescripcionIdx = findColumnKey(headersMap, ['descripcion', 'description', 'detalle', 'concepto']);

    if (currentMontoIdx === null || (currentReferenciaIdx === null && currentDescripcionIdx === null)) continue;

    headerRowIndex = i;
    referenciaIdx = currentReferenciaIdx;
    montoIdx = currentMontoIdx;
    fechaIdx = findColumnKey(headersMap, ['fecha', 'date']);
    descripcionIdx = currentDescripcionIdx;
    break;
  }

  const esFormatoProvincial = referenciaIdx === null && descripcionIdx !== null && montoIdx !== null;

  if (montoIdx === null || (referenciaIdx === null && !esFormatoProvincial)) {
    const encabezados = [...encabezadosDetectados].slice(0, 12).join(', ');
    if (extension === '.xls') {
      throw new Error(
        `No se pudieron identificar los encabezados del archivo, Exportalo como .xlsx e intentalo nuevamente.`
      );
    }
    throw new Error('No se encontraron columnas requeridas: Referencia y/o Monto');
  }

  const dataRows = rows.slice(headerRowIndex + 1);
  const parsedRows = dataRows
    .map((row, idx) => {
      const descripcion = descripcionIdx !== null ? String(row[descripcionIdx] || '').trim() : '';
      const referencia = referenciaIdx !== null ? normalizarReferencia(row[referenciaIdx]) : null;
      const montoBs = parseMonto(row[montoIdx]);
      const fecha = fechaIdx !== null ? parseFecha(row[fechaIdx]) : null;
      const telefonoDescripcion = extraerTelefonoDesdeDescripcion(descripcion);

      if (!referencia && !telefonoDescripcion && (montoBs === null || montoBs === undefined)) return null;

      return {
        excelRow: headerRowIndex + idx + 2,
        referencia,
        monto_bs: montoBs,
        fecha,
        descripcion,
        telefono_movimiento: telefonoDescripcion,
        cedula_movimiento: extraerCedulaDesdeDescripcion(descripcion),
        es_formato_provincial: esFormatoProvincial
      };
    })
    .filter(Boolean);

  if (!parsedRows.length) {
    throw new Error('No se encontraron filas validas en el Excel');
  }

  return parsedRows;
}

function parseTxtRows(fileBuffer) {
  const text = Buffer.from(fileBuffer || Buffer.alloc(0)).toString('utf8');
  const rawLines = text
    .split(/\r?\n/)
    .map((line) => String(line || '').replace(/\r/g, ''));

  const nonEmptyRawLines = rawLines.filter((line) => line.trim());

  if (!nonEmptyRawLines.length) {
    throw new Error('El archivo TXT esta vacio');
  }

  const firstLine = nonEmptyRawLines[0];
  const detectedSeparator = firstLine.includes('\t')
    ? '\t'
    : (firstLine.includes(';') ? ';' : null);

  // 1) TXT delimitado (tab o punto y coma)
  if (detectedSeparator) {
    const lines = nonEmptyRawLines.map((line) => line.trim());
    const rows = lines.map((line) => line.split(detectedSeparator).map((cell) => String(cell || '').trim()));
    const headerRow = Array.isArray(rows[0]) ? rows[0] : [];
    const headersMap = {};

    headerRow.forEach((header, index) => {
      const key = normalizarTexto(header);
      if (key) headersMap[key] = index;
    });

    const fechaIdx = findColumnKey(headersMap, ['fecha', 'date']);
    const referenciaIdx = findColumnKey(headersMap, ['referencia', 'ref', 'nro referencia', 'numero referencia']);
    const montoIdx = findColumnKey(headersMap, ['monto', 'amount', 'monto bs', 'monto_bs', 'importe', 'credito', 'crédito']);
    const descripcionIdx = findColumnKey(headersMap, ['descripcion', 'description', 'detalle', 'concepto']);

    const esFormatoProvincial = referenciaIdx === null && descripcionIdx !== null && montoIdx !== null;

    if (montoIdx === null || (referenciaIdx === null && !esFormatoProvincial)) {
      throw new Error('No se encontraron columnas requeridas en TXT: Referencia y/o Monto');
    }

    const dataRows = rows.slice(1);
    const parsedRows = dataRows
      .map((row, idx) => {
        const descripcion = descripcionIdx !== null ? String(row[descripcionIdx] || '').trim() : '';
        const referencia = referenciaIdx !== null ? normalizarReferencia(row[referenciaIdx]) : '';
        const montoBs = parseMonto(row[montoIdx]);
        const fecha = fechaIdx !== null ? parseFecha(row[fechaIdx]) : null;
        const telefonoDescripcion = extraerTelefonoDesdeDescripcion(descripcion);

        if (!referencia && !telefonoDescripcion && (montoBs === null || montoBs === undefined)) return null;

        return {
          excelRow: idx + 2,
          referencia,
          monto_bs: montoBs,
          fecha,
          descripcion,
          telefono_movimiento: telefonoDescripcion,
          cedula_movimiento: extraerCedulaDesdeDescripcion(descripcion),
          es_formato_provincial: esFormatoProvincial
        };
      })
      .filter(Boolean);

    if (!parsedRows.length) {
      throw new Error('No se encontraron filas validas en el TXT');
    }

    return parsedRows;
  }

  // 2) TXT de ancho fijo (ej. bancos que alinean columnas por espacios)
  const headerIndex = nonEmptyRawLines.findIndex((line) => {
    const normalized = normalizarTexto(line);
    return normalized.includes('referencia') && (normalized.includes('monto') || normalized.includes('credito') || normalized.includes('crédito'));
  });

  if (headerIndex < 0) {
    throw new Error('No se encontro encabezado en TXT (se esperaba Referencia y Monto/Credito)');
  }

  const parsedRows = [];
  const transactionLineRegex = /^\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/;
  const fullTxRegex = /^\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+(\d{4,})\s+(.+?)\s+([+-]?\d[\d.,]*)\s+([+-]?\d[\d.,]*)\s*$/;
  const txWithoutSaldoRegex = /^\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+(\d{4,})\s+(.+?)\s+([+-]?\d[\d.,]*)\s*$/;

  nonEmptyRawLines.slice(headerIndex + 1).forEach((line, idx) => {
    if (!transactionLineRegex.test(line)) return;

    // Parseo robusto para estados de cuenta con columnas separadas por espacios variables.
    const match = line.match(fullTxRegex) || line.match(txWithoutSaldoRegex);
    if (!match) return;

    const [, fechaRaw, referenciaRaw, descripcionRaw, montoRaw] = match;

    const referencia = normalizarReferencia(referenciaRaw);
    const montoBs = parseMonto(montoRaw);
    const fecha = parseFecha(fechaRaw);

    if (!referencia && (montoBs === null || montoBs === undefined)) return;

    parsedRows.push({
      excelRow: headerIndex + idx + 2,
      referencia,
      monto_bs: montoBs,
      fecha,
      descripcion: descripcionRaw,
      telefono_movimiento: extraerTelefonoDesdeDescripcion(descripcionRaw),
      cedula_movimiento: extraerCedulaDesdeDescripcion(descripcionRaw),
      es_formato_provincial: /\bdr\s+ob\b/i.test(String(descripcionRaw || ''))
    });
  });

  if (!parsedRows.length) {
    throw new Error('No se encontraron filas validas en el TXT');
  }

  return parsedRows;
}

function buildMatchRecord({ banco, sistema, tipo, motivo = [], matchPor = '', identificadorBanco = '', identificadorSistema = '' }) {
  return {
    tipo,
    motivo,
    match_por: matchPor,
    identificador_banco: identificadorBanco,
    identificador_sistema: identificadorSistema,
    excel: {
      fila: banco.excelRow,
      referencia: banco.referencia || '-',
      monto_bs: banco.monto_bs,
      fecha: banco.fecha,
      descripcion: banco.descripcion || '',
      telefono: banco.telefono_movimiento || '',
      cedula: banco.cedula_movimiento || ''
    },
    sistema: {
      pago_id: String(sistema._id),
      registro_id: String(sistema._id),
      registro_tipo: sistema.registro_tipo || TIPO_CONCILIACION.MENSUALIDADES,
      mensualidad_id: sistema.id_mensualidad ? String(sistema.id_mensualidad) : null,
      pedido_id: sistema.id_pedido ? String(sistema.id_pedido) : null,
      referencia: sistema.referencia || '-',
      telefono_pago: sistema.telefono_pago || '',
      cedula_pago: sistema.cedula_titular || '',
      monto_bs: sistema.monto_pagado_bs,
      monto_esperado_bs: sistema.monto_esperado_bs,
      monto_esperado_usd: sistema.monto_esperado_usd,
      fecha: sistema.fecha_pago,
      alumno: sistema.alumno,
      contexto: sistema.contexto || ''
    }
  };
}

function rankByDateSimilarity(candidates, targetDate) {
  return candidates.sort((a, b) => {
    const aSame = targetDate && a.fecha && a.fecha === targetDate ? 1 : 0;
    const bSame = targetDate && b.fecha && b.fecha === targetDate ? 1 : 0;
    return bSame - aSame;
  });
}

async function generarReporteConciliacionCore({ models = {} } = {}) {
  const {
    Mensualidad: MensualidadModel,
    PagoDetalle: PagoDetalleModel
  } = resolveConciliacionModels(models);

  const mensualidadesEnRevision = await MensualidadModel.countDocuments({ estatus: 'En revision' });

  const mensualidadesConPago = await MensualidadModel.find({ estatus: 'En revision' })
    .select('_id')
    .lean();

  const mensualidadIds = mensualidadesConPago.map((item) => item._id);
  const pagosAsociadosEnRevision = mensualidadIds.length > 0
    ? await PagoDetalleModel.countDocuments({ id_mensualidad: { $in: mensualidadIds } })
    : 0;

  return {
    mensualidadesEnRevision,
    pagosAsociadosEnRevision
  };
}

exports.previsualizarConciliacion = async (req, res) => {
  try {
    const tenantModels = await getTenantConciliacionModels(req);
    const {
      Mensualidad: TenantMensualidad,
      PagoDetalle: TenantPagoDetalle,
      UniformePedido: TenantUniformePedido
    } = resolveConciliacionModels(tenantModels);

    const tipoConciliacion = resolveTipoConciliacion(req.query?.tipo_conciliacion);
    const bancoConciliacion = resolveBancoConciliacion(req.query?.banco);
    const priorizarDescripcionProvincial = bancoConciliacion === BANCO_CONCILIACION.PROVINCIAL;
    if (!tipoConciliacion) {
      return res.status(400).json({
        error: `tipo_conciliacion invalido. Usa ${TIPO_CONCILIACION.MENSUALIDADES} o ${TIPO_CONCILIACION.UNIFORMES}`
      });
    }

    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'Debes subir un archivo de conciliacion' });
    }

    const extension = path.extname(String(req.file.originalname || '')).toLowerCase();

    const bancoRows = extension === '.txt'
      ? parseTxtRows(req.file.buffer)
      : parseExcelRows(req.file.buffer, extension);

    let sistemaRows = [];

    if (tipoConciliacion === TIPO_CONCILIACION.MENSUALIDADES) {
      const mensualidadesRevision = await TenantMensualidad.find({ estatus: 'En revision' })
        .populate('id_alumno', 'nombres apellidos')
        .select('_id monto_esperado estatus id_alumno');

      const mensualidadMap = new Map(
        mensualidadesRevision.map((m) => [String(m._id), m])
      );

      const pagosSistema = await TenantPagoDetalle.find({
        id_mensualidad: { $in: mensualidadesRevision.map((m) => m._id) }
      }).select('_id id_mensualidad referencia telefono_pago cedula_titular monto_pagado_bs monto_esperado_bs monto_esperado_usd fecha_pago');

      sistemaRows = pagosSistema.map((pago) => {
        const mensualidad = mensualidadMap.get(String(pago.id_mensualidad));
        const alumnoNombre = mensualidad?.id_alumno
          ? `${mensualidad.id_alumno.nombres || ''} ${mensualidad.id_alumno.apellidos || ''}`.trim()
          : '-';

        return {
          _id: pago._id,
          registro_tipo: TIPO_CONCILIACION.MENSUALIDADES,
          id_mensualidad: pago.id_mensualidad,
          referencia: normalizarReferencia(pago.referencia),
          telefono_pago: String(pago.telefono_pago || '').trim(),
          telefono_pago_cmp: telefonoComparable(pago.telefono_pago),
          cedula_titular: String(pago.cedula_titular || '').trim(),
          cedula_titular_cmp: cedulaComparable(pago.cedula_titular),
          monto_pagado_bs: parseMonto(pago.monto_pagado_bs),
          monto_esperado_bs: parseMonto(pago.monto_esperado_bs),
          monto_esperado_usd: pago.monto_esperado_usd === null || pago.monto_esperado_usd === undefined
            ? null
            : Number(pago.monto_esperado_usd),
          fecha_pago: parseFecha(pago.fecha_pago),
          alumno: alumnoNombre,
          contexto: ''
        };
      });
    } else {
      const pedidosEnRevision = await TenantUniformePedido.find({ estado: 'pago_en_revision' })
        .populate('alumno', 'nombres apellidos')
        .select('_id alumno prenda referencia telefono_pago cedula_titular monto_ultimo_pago monto_ultimo_pago_bs fecha_pago');

      sistemaRows = pedidosEnRevision.map((pedido) => {
        const alumnoNombre = pedido?.alumno
          ? `${pedido.alumno.nombres || ''} ${pedido.alumno.apellidos || ''}`.trim()
          : '-';

        return {
          _id: pedido._id,
          registro_tipo: TIPO_CONCILIACION.UNIFORMES,
          id_pedido: pedido._id,
          referencia: normalizarReferencia(pedido.referencia),
          telefono_pago: String(pedido.telefono_pago || '').trim(),
          telefono_pago_cmp: telefonoComparable(pedido.telefono_pago),
          cedula_titular: String(pedido.cedula_titular || '').trim(),
          cedula_titular_cmp: cedulaComparable(pedido.cedula_titular),
          monto_pagado_bs: parseMonto(pedido.monto_ultimo_pago_bs),
          monto_esperado_bs: parseMonto(pedido.monto_ultimo_pago_bs),
          monto_esperado_usd: pedido.monto_ultimo_pago === null || pedido.monto_ultimo_pago === undefined
            ? null
            : Number(pedido.monto_ultimo_pago),
          fecha_pago: parseFecha(pedido.fecha_pago),
          alumno: alumnoNombre,
          contexto: pedido.prenda ? `Prenda: ${pedido.prenda}` : ''
        };
      });
    }

    const bancoDisponibles = new Set(bancoRows.map((_, idx) => idx));
    const sistemaDisponibles = new Set(sistemaRows.map((_, idx) => idx));
    const matchTotal = [];
    const matchParcial = [];

    // Nivel 1: match total por referencia + monto dentro de tolerancia.
    // Para banco Provincial se omite este nivel y se prioriza descripcion.
    if (!priorizarDescripcionProvincial) {
      for (const sistemaIdx of [...sistemaDisponibles]) {
        const sistema = sistemaRows[sistemaIdx];
        const candidatos = [...bancoDisponibles]
          .map((idx) => ({ idx, row: bancoRows[idx] }))
          .filter(({ row }) => (
            areAmountsEqual(row.monto_bs, sistema.monto_pagado_bs)
            && row.referencia
            && sistema.referencia
            && referenciasCoinciden(row.referencia, sistema.referencia)
          ))
          .map(({ idx, row }) => row);

        if (!candidatos.length) continue;

        const mejor = rankByDateSimilarity(candidatos, sistema.fecha_pago)[0];
        const bancoIdx = bancoRows.findIndex((row) => row.excelRow === mejor.excelRow);

        bancoDisponibles.delete(bancoIdx);
        sistemaDisponibles.delete(sistemaIdx);
        matchTotal.push(buildMatchRecord({
          banco: mejor,
          sistema,
          tipo: 'match_total',
          motivo: [`referencia (completa o ultimos 6) y monto dentro de tolerancia de Bs ${MONTO_TOLERANCIA_BS}`],
          matchPor: 'referencia',
          identificadorBanco: mejor.referencia || '',
          identificadorSistema: sistema.referencia || ''
        }));
      }
    }

    // Nivel 1.5 (formato Provincial o banco Provincial): match total por telefono o cedula en descripcion + monto.
    for (const sistemaIdx of [...sistemaDisponibles]) {
      const sistema = sistemaRows[sistemaIdx];
      if (!sistema.telefono_pago_cmp && !sistema.cedula_titular_cmp) continue;

      const candidatos = [...bancoDisponibles]
        .map((idx) => ({ idx, row: bancoRows[idx] }))
        .map(({ idx, row }) => {
          const telefonosCandidatos = [row.telefono_movimiento, ...((String(row.descripcion || '').match(/\d+/g) || [])
            .flatMap((token) => token.match(/(?:58)?0?4\d{9}/g) || []))]
            .filter(Boolean);
          const cedulasCandidatas = extraerCedulasCandidatasDesdeDescripcion(row.descripcion || '');

          const telefonoMatchRaw = telefonosCandidatos.find((telefono) => (
            telefonoComparable(telefono)
            && sistema.telefono_pago_cmp
            && telefonoComparable(telefono) === sistema.telefono_pago_cmp
          ));

          const cedulaMatchRaw = cedulasCandidatas.find((cedula) => (
            cedulaComparable(cedula)
            && sistema.cedula_titular_cmp
            && cedulaComparable(cedula) === sistema.cedula_titular_cmp
          ));

          const matchTelefono = Boolean(
            telefonoMatchRaw
          );
          const matchCedula = Boolean(
            cedulaMatchRaw
          );

          return {
            idx,
            row,
            fecha: row.fecha,
            matchPor: matchTelefono ? 'telefono' : (matchCedula ? 'cedula' : ''),
            identificadorBanco: matchTelefono ? telefonoMatchRaw : (matchCedula ? cedulaMatchRaw : ''),
            identificadorSistema: matchTelefono ? (sistema.telefono_pago || '') : (matchCedula ? (sistema.cedula_titular || '') : '')
          };
        })
        .filter(({ row, matchPor }) => (
          (row.es_formato_provincial === true || priorizarDescripcionProvincial)
          && areAmountsEqual(row.monto_bs, sistema.monto_pagado_bs)
          && Boolean(matchPor)
          && areDatesWithinDays(row.fecha, sistema.fecha_pago, 1)
        ));

      if (!candidatos.length) continue;

      const mejor = rankByDateSimilarity(candidatos, sistema.fecha_pago)[0];
      const bancoIdx = bancoRows.findIndex((row) => row.excelRow === mejor.row.excelRow);

      bancoDisponibles.delete(bancoIdx);
      sistemaDisponibles.delete(sistemaIdx);
      matchTotal.push(buildMatchRecord({
        banco: mejor.row,
        sistema,
        tipo: 'match_total',
        motivo: [`telefono o cedula en descripcion (${priorizarDescripcionProvincial ? 'banco Provincial' : 'formato Provincial'}), monto dentro de tolerancia de Bs ${MONTO_TOLERANCIA_BS} y fecha dentro de ±1 dia`],
        matchPor: mejor.matchPor,
        identificadorBanco: mejor.identificadorBanco,
        identificadorSistema: mejor.identificadorSistema
      }));
    }

    // Nivel 2: match parcial por monto dentro de tolerancia + (referencia casi igual o misma fecha).
    for (const sistemaIdx of [...sistemaDisponibles]) {
      const sistema = sistemaRows[sistemaIdx];
      let mejor = null;

      for (const bancoIdx of [...bancoDisponibles]) {
        const banco = bancoRows[bancoIdx];
        const montoDentroDeTolerancia = areAmountsEqual(banco.monto_bs, sistema.monto_pagado_bs);
        const coincideReferenciaExacta = Boolean(
          !priorizarDescripcionProvincial
          && banco.referencia
          && sistema.referencia
          && referenciasCoinciden(banco.referencia, sistema.referencia)
        );

        // Si no hay monto cercano ni referencia igual, no califica para parcial.
        if (!montoDentroDeTolerancia && !coincideReferenciaExacta) continue;

        const telefonosCandidatos = [banco.telefono_movimiento, ...((String(banco.descripcion || '').match(/\d+/g) || [])
          .flatMap((token) => token.match(/(?:58)?0?4\d{9}/g) || []))]
          .filter(Boolean);
        const cedulasCandidatas = extraerCedulasCandidatasDesdeDescripcion(banco.descripcion || '');
        const coincideTelefono = telefonosCandidatos.some((telefono) => (
          telefonoComparable(telefono)
          && sistema.telefono_pago_cmp
          && telefonoComparable(telefono) === sistema.telefono_pago_cmp
        ));
        const coincideCedula = cedulasCandidatas.some((cedula) => (
          cedulaComparable(cedula)
          && sistema.cedula_titular_cmp
          && cedulaComparable(cedula) === sistema.cedula_titular_cmp
        ));
        const coincideIdentificador = Boolean(
          coincideTelefono || coincideCedula
        );
        const bancoTraeIdentificador = Boolean(telefonosCandidatos.length || cedulasCandidatas.length);
        const sistemaTieneDatoComparable = Boolean(
          (telefonosCandidatos.length && sistema.telefono_pago_cmp)
          || (cedulasCandidatas.length && sistema.cedula_titular_cmp)
        );

        // Evita falsos parciales por fecha+monto cuando el banco trae identificador
        // (telefono/cedula) y este contradice al pago del sistema.
        if (!coincideReferenciaExacta && bancoTraeIdentificador && sistemaTieneDatoComparable && !coincideIdentificador) continue;

        const motivos = [];
        let score = 0;
        if (coincideReferenciaExacta && !montoDentroDeTolerancia) {
          motivos.push('misma referencia con diferencia de monto');
          score += 3;
        }

        if (!priorizarDescripcionProvincial && banco.referencia && sistema.referencia) {
          const refBancoComparable = ultimosDigitosReferencia(banco.referencia);
          const refSistemaComparable = ultimosDigitosReferencia(sistema.referencia);
          const dist = levenshteinDistance(refBancoComparable, refSistemaComparable);
          if (dist === 1) {
            motivos.push('referencia con diferencia minima');
            score += 2;
          }
        }

        if (banco.fecha && sistema.fecha_pago && banco.fecha === sistema.fecha_pago) {
          motivos.push('misma fecha');
          score += 1;
        }

        if (!motivos.length) continue;

        if (!mejor || score > mejor.score) {
          mejor = { bancoIdx, banco, score, motivos };
        }
      }

      if (!mejor) continue;

      bancoDisponibles.delete(mejor.bancoIdx);
      sistemaDisponibles.delete(sistemaIdx);
      matchParcial.push(buildMatchRecord({
        banco: mejor.banco,
        sistema,
        tipo: 'match_parcial',
        motivo: mejor.motivos,
        matchPor: mejor.motivos.includes('misma referencia con diferencia de monto')
          ? 'referencia'
          : (mejor.motivos.includes('referencia con diferencia minima') ? 'referencia_aproximada' : 'fecha')
      }));
    }

    const sinCoincidenciaExcel = [...bancoDisponibles].map((idx) => {
      const row = bancoRows[idx];
      return {
        excel: {
          fila: row.excelRow,
          referencia: row.referencia || '-',
          monto_bs: row.monto_bs,
          fecha: row.fecha,
          descripcion: row.descripcion || '',
          telefono: row.telefono_movimiento || '',
          cedula: row.cedula_movimiento || ''
        }
      };
    });

    const sinCoincidenciaSistema = [...sistemaDisponibles].map((idx) => {
      const row = sistemaRows[idx];
      return {
        sistema: {
          pago_id: String(row._id),
          registro_id: String(row._id),
          registro_tipo: row.registro_tipo || TIPO_CONCILIACION.MENSUALIDADES,
          mensualidad_id: row.id_mensualidad ? String(row.id_mensualidad) : null,
          pedido_id: row.id_pedido ? String(row.id_pedido) : null,
          referencia: row.referencia || '-',
          telefono_pago: row.telefono_pago || '',
          cedula_pago: row.cedula_titular || '',
          monto_bs: row.monto_pagado_bs,
          monto_esperado_bs: row.monto_esperado_bs,
          monto_esperado_usd: row.monto_esperado_usd,
          fecha: row.fecha_pago,
          alumno: row.alumno,
          contexto: row.contexto || ''
        }
      };
    });

    const pagoIdsConfirmables = matchTotal.map((m) => m.sistema.pago_id);

    return res.json({
      tipo_conciliacion: tipoConciliacion,
      banco_conciliacion: bancoConciliacion || '',
      summary: {
        total_excel: bancoRows.length,
        total_sistema_en_revision: sistemaRows.length,
        match_total: matchTotal.length,
        match_parcial: matchParcial.length,
        sin_coincidencia_excel: sinCoincidenciaExcel.length,
        sin_coincidencia_sistema: sinCoincidenciaSistema.length
      },
      match_total: matchTotal,
      match_parcial: matchParcial,
      sin_coincidencia_excel: sinCoincidenciaExcel,
      sin_coincidencia_sistema: sinCoincidenciaSistema,
      pago_ids_confirmables: pagoIdsConfirmables
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error al conciliar pagos' });
  }
};

exports.confirmarMatchTotal = async (req, res) => {
  try {
    const tenantModels = await getTenantConciliacionModels(req);
    const {
      Mensualidad: TenantMensualidad,
      PagoDetalle: TenantPagoDetalle,
      UniformePedido: TenantUniformePedido
    } = resolveConciliacionModels(tenantModels);

    const tipoConciliacion = resolveTipoConciliacion(req.body?.tipo_conciliacion);
    if (!tipoConciliacion) {
      return res.status(400).json({
        error: `tipo_conciliacion invalido. Usa ${TIPO_CONCILIACION.MENSUALIDADES} o ${TIPO_CONCILIACION.UNIFORMES}`
      });
    }

    const pagoIds = Array.isArray(req.body?.pago_ids) ? req.body.pago_ids : [];
    if (!pagoIds.length) {
      return res.status(400).json({ error: 'Debes enviar al menos un pago para confirmar' });
    }

    if (tipoConciliacion === TIPO_CONCILIACION.UNIFORMES) {
      const pedidos = await TenantUniformePedido.find({
        _id: { $in: pagoIds },
        estado: 'pago_en_revision'
      });

      if (!pedidos.length) {
        return res.status(404).json({ error: 'No se encontraron pedidos en pago_en_revision para confirmar' });
      }

      let actualizadas = 0;

      for (const pedido of pedidos) {
        const totalPedido = Number(pedido.precio) || 0;
        const montoPrevioPagado = Number(pedido.monto_pagado) || 0;
        const montoPrevioPagadoBs = Number(pedido.monto_pagado_bs) || 0;
        const montoUltimoPagoRaw = Number(pedido.monto_ultimo_pago);
        const montoUltimoPagoBsRaw = Number(pedido.monto_ultimo_pago_bs);
        const saldoActual = Number(pedido.saldo_pendiente);
        const saldoPendienteActual = Number.isFinite(saldoActual) && saldoActual > 0
          ? saldoActual
          : Math.max(totalPedido - montoPrevioPagado, 0);
        const montoUltimoPago = Number.isFinite(montoUltimoPagoRaw) && montoUltimoPagoRaw > 0
          ? Math.min(montoUltimoPagoRaw, saldoPendienteActual)
          : saldoPendienteActual;
        const factorAjusteUltimoPago = Number.isFinite(montoUltimoPagoRaw) && montoUltimoPagoRaw > 0
          ? (montoUltimoPago / montoUltimoPagoRaw)
          : 1;
        const montoUltimoPagoBs = Number.isFinite(montoUltimoPagoBsRaw) && montoUltimoPagoBsRaw > 0
          ? (montoUltimoPagoBsRaw * factorAjusteUltimoPago)
          : 0;

        const totalPagado = Math.min(totalPedido, montoPrevioPagado + montoUltimoPago);
        const totalPagadoBs = montoPrevioPagadoBs + montoUltimoPagoBs;
        const saldoPendiente = Math.max(totalPedido - totalPagado, 0);

        pedido.pagos_historial = Array.isArray(pedido.pagos_historial) ? pedido.pagos_historial : [];
        pedido.pagos_historial.push({
          monto_pagado: montoUltimoPago,
          monto_pagado_bs: montoUltimoPagoBs,
          metodo_pago: pedido.metodo_pago,
          referencia: pedido.referencia,
          telefono_pago: pedido.telefono_pago,
          cedula_titular: pedido.cedula_titular,
          comprobante_url: pedido.comprobante_url,
          fecha_pago: pedido.fecha_pago
        });

        pedido.monto_pagado = totalPagado;
        pedido.monto_pagado_bs = totalPagadoBs;
        pedido.saldo_pendiente = saldoPendiente;
        pedido.estado = saldoPendiente > 0 ? 'abono' : 'verificado';
        await pedido.save();
        actualizadas += 1;
      }

      return res.json({
        message: 'Conciliacion aplicada correctamente',
        tipo_conciliacion: tipoConciliacion,
        pedidos_actualizados: actualizadas,
        registros_actualizados: actualizadas,
        pagos_recibidos: pagoIds.length
      });
    }

    const pagos = await TenantPagoDetalle.find({ _id: { $in: pagoIds } }).select('_id id_mensualidad');
    if (!pagos.length) {
      return res.status(404).json({ error: 'No se encontraron pagos para confirmar' });
    }

    const mensualidadIds = [...new Set(pagos.map((p) => String(p.id_mensualidad)))];
    let actualizadas = 0;

    for (const mensualidadId of mensualidadIds) {
      const mensualidad = await TenantMensualidad.findById(mensualidadId);
      if (!mensualidad) continue;

      const pagosMensualidad = await TenantPagoDetalle.find({ id_mensualidad: mensualidad._id }).select('monto_pagado');
      const totalPagado = pagosMensualidad.reduce((acc, pago) => acc + (Number(pago.monto_pagado) || 0), 0);
      const montoEsperado = Number(mensualidad.monto_esperado) || 0;

      if (totalPagado <= 0) {
        mensualidad.estatus = 'Pendiente';
      } else if (totalPagado >= montoEsperado) {
        mensualidad.estatus = 'Pagado';
      } else {
        mensualidad.estatus = 'Abono';
      }

      await mensualidad.save();
      actualizadas += 1;
    }

    return res.json({
      message: 'Conciliacion aplicada correctamente',
      tipo_conciliacion: tipoConciliacion,
      mensualidades_actualizadas: actualizadas,
      registros_actualizados: actualizadas,
      pagos_recibidos: pagoIds.length
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error al confirmar pagos' });
  }
};

exports.generarReporteConciliacionCore = generarReporteConciliacionCore;
