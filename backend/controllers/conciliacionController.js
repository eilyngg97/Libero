const XLSX = require('xlsx');
const path = require('path');
const Mensualidad = require('../models/Mensualidad');
const PagoDetalle = require('../models/PagoDetalle');

const MONTO_TOLERANCIA_BS = 100;

function normalizarTexto(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
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
  return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}`;
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

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return toIsoDate(parsed);
}

function areAmountsEqual(a, b) {
  if (a === null || b === null || a === undefined || b === undefined) return false;
  return Math.abs(Number(a) - Number(b)) <= MONTO_TOLERANCIA_BS;
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

function parseExcelRows(fileBuffer) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error('El archivo Excel no tiene hojas');

  const worksheet = workbook.Sheets[firstSheetName];
  // Leemos como AOA con raw:false para preservar el valor visual de la celda.
  const rows = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false
  });
  if (!rows.length) throw new Error('El archivo Excel esta vacio');

  const headerRow = Array.isArray(rows[0]) ? rows[0] : [];
  const headersMap = {};
  headerRow.forEach((header, index) => {
    const key = normalizarTexto(header);
    if (key) headersMap[key] = index;
  });

  const fechaIdx = findColumnKey(headersMap, ['fecha', 'date']);
  const referenciaIdx = findColumnKey(headersMap, ['referencia', 'ref', 'nro referencia', 'numero referencia']);
  const montoIdx = findColumnKey(headersMap, ['monto', 'amount', 'monto bs', 'monto_bs', 'importe']);
  const descripcionIdx = findColumnKey(headersMap, ['descripcion', 'description', 'detalle', 'concepto']);

  if (referenciaIdx === null || montoIdx === null) {
    throw new Error('No se encontraron columnas requeridas: Referencia y Monto');
  }

  const dataRows = rows.slice(1);
  const parsedRows = dataRows
    .map((row, idx) => {
      const referencia = normalizarReferencia(row[referenciaIdx]);
      const montoBs = parseMonto(row[montoIdx]);
      const fecha = fechaIdx !== null ? parseFecha(row[fechaIdx]) : null;
      const descripcion = descripcionIdx !== null ? String(row[descripcionIdx] || '').trim() : '';

      if (!referencia && (montoBs === null || montoBs === undefined)) return null;

      return {
        excelRow: idx + 2,
        referencia,
        monto_bs: montoBs,
        fecha,
        descripcion
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
    const montoIdx = findColumnKey(headersMap, ['monto', 'amount', 'monto bs', 'monto_bs', 'importe']);
    const descripcionIdx = findColumnKey(headersMap, ['descripcion', 'description', 'detalle', 'concepto']);

    if (referenciaIdx === null || montoIdx === null) {
      throw new Error('No se encontraron columnas requeridas en TXT: Referencia y Monto');
    }

    const dataRows = rows.slice(1);
    const parsedRows = dataRows
      .map((row, idx) => {
        const referencia = normalizarReferencia(row[referenciaIdx]);
        const montoBs = parseMonto(row[montoIdx]);
        const fecha = fechaIdx !== null ? parseFecha(row[fechaIdx]) : null;
        const descripcion = descripcionIdx !== null ? String(row[descripcionIdx] || '').trim() : '';

        if (!referencia && (montoBs === null || montoBs === undefined)) return null;

        return {
          excelRow: idx + 2,
          referencia,
          monto_bs: montoBs,
          fecha,
          descripcion
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
    return normalized.includes('referencia') && normalized.includes('monto');
  });

  if (headerIndex < 0) {
    throw new Error('No se encontro encabezado en TXT (se esperaba Referencia y Monto)');
  }

  const headerLine = nonEmptyRawLines[headerIndex];
  const headerNormalized = normalizarTexto(headerLine);

  const fechaStart = Math.max(0, headerNormalized.indexOf('fecha'));
  const referenciaStart = headerNormalized.indexOf('referencia');
  const descripcionStart = headerNormalized.indexOf('descripcion') >= 0
    ? headerNormalized.indexOf('descripcion')
    : (headerNormalized.indexOf('detalle') >= 0 ? headerNormalized.indexOf('detalle') : -1);
  const montoStart = headerNormalized.indexOf('monto');
  const saldoStart = headerNormalized.indexOf('saldo');

  if (referenciaStart < 0 || montoStart < 0) {
    throw new Error('No se encontraron columnas requeridas en TXT: Referencia y Monto');
  }

  const parsedRows = [];
  const transactionLineRegex = /^\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/;

  nonEmptyRawLines.slice(headerIndex + 1).forEach((line, idx) => {
    if (!transactionLineRegex.test(line)) return;

    const fechaRaw = line.slice(fechaStart, referenciaStart).trim();
    const referenciaRaw = line.slice(referenciaStart, descripcionStart > referenciaStart ? descripcionStart : montoStart).trim();
    const descripcionRaw = descripcionStart > referenciaStart
      ? line.slice(descripcionStart, montoStart).trim()
      : '';
    const montoRaw = saldoStart > montoStart
      ? line.slice(montoStart, saldoStart).trim()
      : line.slice(montoStart).trim();

    const referencia = normalizarReferencia(referenciaRaw);
    const montoBs = parseMonto(montoRaw);
    const fecha = parseFecha(fechaRaw);

    if (!referencia && (montoBs === null || montoBs === undefined)) return;

    parsedRows.push({
      excelRow: headerIndex + idx + 2,
      referencia,
      monto_bs: montoBs,
      fecha,
      descripcion: descripcionRaw
    });
  });

  if (!parsedRows.length) {
    throw new Error('No se encontraron filas validas en el TXT');
  }

  return parsedRows;
}

function buildMatchRecord({ banco, sistema, tipo, motivo = [] }) {
  return {
    tipo,
    motivo,
    excel: {
      fila: banco.excelRow,
      referencia: banco.referencia || '-',
      monto_bs: banco.monto_bs,
      fecha: banco.fecha,
      descripcion: banco.descripcion || ''
    },
    sistema: {
      pago_id: String(sistema._id),
      mensualidad_id: String(sistema.id_mensualidad),
      referencia: sistema.referencia || '-',
      monto_bs: sistema.monto_pagado_bs,
      fecha: sistema.fecha_pago,
      alumno: sistema.alumno
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

exports.previsualizarConciliacion = async (req, res) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ error: 'Debes subir un archivo de conciliacion' });
    }

    const extension = path.extname(String(req.file.originalname || '')).toLowerCase();

    const bancoRows = extension === '.txt'
      ? parseTxtRows(req.file.buffer)
      : parseExcelRows(req.file.buffer);

    const mensualidadesRevision = await Mensualidad.find({ estatus: 'En revision' })
      .populate('id_alumno', 'nombres apellidos')
      .select('_id monto_esperado estatus id_alumno');

    const mensualidadMap = new Map(
      mensualidadesRevision.map((m) => [String(m._id), m])
    );

    const pagosSistema = await PagoDetalle.find({
      id_mensualidad: { $in: mensualidadesRevision.map((m) => m._id) }
    }).select('_id id_mensualidad referencia monto_pagado_bs fecha_pago');

    const sistemaRows = pagosSistema.map((pago) => {
      const mensualidad = mensualidadMap.get(String(pago.id_mensualidad));
      const alumnoNombre = mensualidad?.id_alumno
        ? `${mensualidad.id_alumno.nombres || ''} ${mensualidad.id_alumno.apellidos || ''}`.trim()
        : '-';

      return {
        _id: pago._id,
        id_mensualidad: pago.id_mensualidad,
        referencia: normalizarReferencia(pago.referencia),
        monto_pagado_bs: parseMonto(pago.monto_pagado_bs),
        fecha_pago: parseFecha(pago.fecha_pago),
        alumno: alumnoNombre
      };
    });

    const bancoDisponibles = new Set(bancoRows.map((_, idx) => idx));
    const sistemaDisponibles = new Set(sistemaRows.map((_, idx) => idx));
    const matchTotal = [];
    const matchParcial = [];

    // Nivel 1: match total por referencia + monto dentro de tolerancia.
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
      matchTotal.push(buildMatchRecord({ banco: mejor, sistema, tipo: 'match_total', motivo: [`referencia (completa o ultimos 6) y monto dentro de tolerancia de Bs ${MONTO_TOLERANCIA_BS}`] }));
    }

    // Nivel 2: match parcial por monto dentro de tolerancia + (referencia casi igual o misma fecha).
    for (const sistemaIdx of [...sistemaDisponibles]) {
      const sistema = sistemaRows[sistemaIdx];
      let mejor = null;

      for (const bancoIdx of [...bancoDisponibles]) {
        const banco = bancoRows[bancoIdx];
        if (!areAmountsEqual(banco.monto_bs, sistema.monto_pagado_bs)) continue;

        const motivos = [];
        let score = 0;
        if (banco.referencia && sistema.referencia) {
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
        motivo: mejor.motivos
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
          descripcion: row.descripcion || ''
        }
      };
    });

    const sinCoincidenciaSistema = [...sistemaDisponibles].map((idx) => {
      const row = sistemaRows[idx];
      return {
        sistema: {
          pago_id: String(row._id),
          mensualidad_id: String(row.id_mensualidad),
          referencia: row.referencia || '-',
          monto_bs: row.monto_pagado_bs,
          fecha: row.fecha_pago,
          alumno: row.alumno
        }
      };
    });

    const pagoIdsConfirmables = matchTotal.map((m) => m.sistema.pago_id);

    return res.json({
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
    const pagoIds = Array.isArray(req.body?.pago_ids) ? req.body.pago_ids : [];
    if (!pagoIds.length) {
      return res.status(400).json({ error: 'Debes enviar al menos un pago para confirmar' });
    }

    const pagos = await PagoDetalle.find({ _id: { $in: pagoIds } }).select('_id id_mensualidad');
    if (!pagos.length) {
      return res.status(404).json({ error: 'No se encontraron pagos para confirmar' });
    }

    const mensualidadIds = [...new Set(pagos.map((p) => String(p.id_mensualidad)))];
    let actualizadas = 0;

    for (const mensualidadId of mensualidadIds) {
      const mensualidad = await Mensualidad.findById(mensualidadId);
      if (!mensualidad) continue;

      const pagosMensualidad = await PagoDetalle.find({ id_mensualidad: mensualidad._id }).select('monto_pagado');
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
      mensualidades_actualizadas: actualizadas,
      pagos_recibidos: pagoIds.length
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error al confirmar pagos' });
  }
};
