const PDFDocument = require('pdfkit');
const path = require('path');

const COLORS = { ink: '#18232f', muted: '#66717d', line: '#dce1e5', soft: '#f3f5f6', accent: '#a52f50' };

function display(value) {
  const text = String(value ?? '').trim();
  return text && text !== '-' ? text : 'No registrado';
}

function wrapText(doc, value, width) {
  const lines = [];
  String(value).split(/\r?\n/).forEach((paragraph) => {
    let line = '';
    for (const character of paragraph) {
      if (line && doc.widthOfString(line + character) > width) {
        const space = line.lastIndexOf(' ');
        if (space > 0) {
          lines.push(line.slice(0, space));
          line = line.slice(space + 1);
        } else {
          lines.push(line);
          line = '';
        }
      }
      line += character;
    }
    lines.push(line.trimEnd());
  });
  return lines;
}

function renderFichaTecnicaPdf({ alumno, institucionNombre, subtitulo, sedeNombre, branding = {}, atletaFotoPath, formatFecha, edad, generadoEn = new Date() }) {
  const doc = new PDFDocument({ size: 'A4', margin: 36, bufferPages: true, info: {
    Title: `Ficha tecnica - ${alumno.nombres || ''} ${alumno.apellidos || ''}`.trim(),
    Author: institucionNombre,
    Subject: 'Registro personal, deportivo y de salud del atleta'
  } });
  const left = 36;
  const width = doc.page.width - 72;
  const bottom = doc.page.height - 60;
  let cursor = 36;
  const text = (value, x, y, textWidth, size = 9, bold = false, color = COLORS.ink, lineBreak = true) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color)
      .text(String(value), x, y, { width: textWidth, lineGap: 1, baseline: 'top', lineBreak });
  };
  const rule = (y) => doc.save().strokeColor(COLORS.line).lineWidth(0.6).moveTo(left, y).lineTo(left + width, y).stroke().restore();
  const image = (source, x, y, imageWidth, imageHeight) => {
    if (!source) return false;
    try {
      doc.image(source, x, y, { fit: [imageWidth, imageHeight], align: 'center', valign: 'center' });
      return true;
    } catch (_) {
      return false;
    }
  };
  const institutionWidth = width - 78;
  if (!image(branding.logoPath, left, cursor, 58, 58)) {
    image(path.join(__dirname, '../assets/logo.png'), left, cursor, 58, 58);
  }
  text(institucionNombre, left + 74, cursor, institutionWidth, 14, true);
  cursor = Math.max(cursor + 20, doc.y + 3);
  if (subtitulo) {
    text(subtitulo, left + 74, cursor, institutionWidth, 8, false, COLORS.muted);
    cursor = doc.y + 3;
  }
  if (branding.academyName && branding.academyName.toLowerCase() !== institucionNombre.toLowerCase()) {
    text(branding.academyName, left + 74, cursor, institutionWidth, 8, false, COLORS.muted);
    cursor = doc.y + 3;
  }
  text(`Sede: ${display(sedeNombre)}`, left + 74, cursor, institutionWidth, 8, false, COLORS.muted);
  cursor = Math.max(104, doc.y + 12);
  rule(cursor);
  cursor += 13;
  text('FICHA TÉCNICA DEL ATLETA', left, cursor, width - 105, 8, true, COLORS.accent);
  text(`Emisión: ${generadoEn.toLocaleDateString('es-VE', { timeZone: 'America/Caracas' })}`, left + width - 125, cursor, 125, 7.5, false, COLORS.muted);
  cursor += 21;
  const heroTop = cursor;
  const nameWidth = width - 114;
  text(display(`${alumno.nombres || ''} ${alumno.apellidos || ''}`), left, cursor, nameWidth, 20, true);
  cursor = doc.y + 8;
  const inactive = alumno.activo === false || alumno.dado_de_baja === true || /^(baja|inactivo)$/i.test(alumno.estado || '');
  const summary = [display(alumno.categoria), edad === '-' ? 'Edad no registrada' : `${edad} años`, inactive ? 'De baja' : display(alumno.estado || 'Activo')].join('  |  ');
  text(summary, left, cursor, nameWidth, 9, false, COLORS.muted);
  cursor = doc.y + 8;
  text(`Ingreso: ${display(formatFecha(alumno.fecha_inscripcion))}`, left, cursor, nameWidth, 8, false, COLORS.muted);
  doc.save().rect(left + width - 88, heroTop, 88, 98).fill(COLORS.soft).restore();
  if (!image(atletaFotoPath, left + width - 84, heroTop + 4, 80, 90)) {
    text('Sin fotografía', left + width - 84, heroTop + 43, 80, 8, false, COLORS.muted);
  }
  cursor = Math.max(heroTop + 110, doc.y + 14);

  function section(title, rows, columns = 3) {
    const heading = (continued = false) => {
      doc.save().rect(left, cursor, 3, 12).fill(COLORS.accent).restore();
      text(`${title}${continued ? ' (continuación)' : ''}`, left + 10, cursor + 1, width - 10, 9, true);
      cursor += 20;
    };
    const nextPage = () => {
      doc.addPage();
      text('FICHA TÉCNICA DEL ATLETA', left, 30, width, 8, true, COLORS.muted);
      cursor = 49;
      rule(cursor);
      cursor += 14;
      heading(true);
    };
    if (cursor + 62 > bottom) nextPage();
    else heading();
    rows.forEach((row) => {
      let column = 0;
      const fields = row.map((field) => {
        const span = field.span || 1;
        const fieldWidth = width / columns * span - 14;
        doc.font('Helvetica').fontSize(9);
        const result = { ...field, x: left + column * width / columns, width: fieldWidth, lines: wrapText(doc, display(field.value), fieldWidth) };
        column += span;
        return result;
      });
      let offset = 0;
      const count = Math.max(...fields.map((field) => field.lines.length));
      while (offset < count) {
        if (cursor + 35 > bottom) nextPage();
        const capacity = Math.max(1, Math.floor((bottom - cursor - 19) / 11));
        const taken = Math.min(count - offset, capacity);
        fields.forEach((field) => {
          text(field.label, field.x, cursor, field.width, 7, true, COLORS.muted);
          const value = field.lines.slice(offset, offset + taken).join('\n');
          if (value) text(value, field.x, cursor + 12, field.width, 9, false, display(field.value) === 'No registrado' ? COLORS.muted : COLORS.ink);
        });
        cursor += 19 + taken * 11;
        rule(cursor - 4);
        offset += taken;
        if (offset < count) nextPage();
      }
    });
    cursor += 8;
  }

  section('IDENTIFICACIÓN Y CONTACTO', [
    [{ label: 'Cédula', value: alumno.cedula }, { label: 'Fecha de nacimiento', value: formatFecha(alumno.fecha_nacimiento) }, { label: 'Sexo', value: alumno.sexo }],
    [{ label: 'Lugar de nacimiento', value: alumno.lugar_nacimiento }, { label: 'Teléfono del atleta', value: alumno.telefono }, { label: 'Institución educativa', value: alumno.colegio_institucion }],
    [{ label: 'Domicilio', value: alumno.domicilio, span: 3 }]
  ]);
  section('PERFIL DEPORTIVO Y MEDIDAS', [
    [{ label: 'Categoría', value: alumno.categoria }, { label: 'División', value: alumno.division }, { label: 'Número de franela', value: alumno.numero_franela }],
    [{ label: 'Talla / estatura', value: alumno.talla }, { label: 'Peso', value: alumno.peso }, { label: 'Alcance', value: alumno.alcance }],
    [{ label: 'Envergadura', value: alumno.envergadura }, { label: 'Proyección', value: alumno.proyeccion, span: 2 }]
  ]);
  section('INFORMACIÓN DE SALUD', [
    [{ label: 'Tipo de sangre', value: alumno.tipo_sangre }, { label: 'Alergias', value: alumno.alergias, span: 2 }],
    [{ label: 'Antecedentes patológicos', value: alumno.antecedentes_patologicos, span: 3 }]
  ]);
  const representante = alumno.representante && typeof alumno.representante === 'object' ? alumno.representante : null;
  if (representante) {
    section('REPRESENTANTE Y CONTACTO', [
      [{ label: 'Nombre y apellido', value: `${representante.nombres || ''} ${representante.apellidos || ''}`.trim(), span: 2 }, { label: 'Parentesco', value: alumno.parentesco }],
      [{ label: 'Cédula', value: representante.cedula }, { label: 'Teléfono', value: representante.telefono }, { label: 'Correo electrónico', value: representante.correo }],
      [{ label: 'Dirección', value: representante.direccion || representante.domicilio, span: 2 }, { label: 'Fecha de nacimiento', value: formatFecha(representante.fecha_nacimiento) }]
    ]);
  } else {
    section('REPRESENTANTE Y CONTACTO', [[{ label: 'Vinculación', value: 'Sin representante asociado', span: 3 }]]);
  }
  if (String(alumno.observaciones || '').trim()) {
    section('OBSERVACIONES', [[{ label: 'Observaciones registradas', value: alumno.observaciones, span: 3 }]]);
  }
  const range = doc.bufferedPageRange();
  for (let pageIndex = range.start; pageIndex < range.start + range.count; pageIndex += 1) {
    doc.switchToPage(pageIndex);
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    rule(doc.page.height - 51);
    text('Documento confidencial · Datos personales y de salud', left, doc.page.height - 40, width - 90, 7, false, COLORS.muted, false);
    text(`Página ${pageIndex + 1} de ${range.count}`, left + width - 80, doc.page.height - 40, 80, 7, false, COLORS.muted, false);
    text('Documento generado por Apex - sistema deportivo 2026', left, doc.page.height - 28, width, 7, false, COLORS.muted, false);
    doc.page.margins.bottom = bottomMargin;
  }
  return doc;
}

module.exports = { renderFichaTecnicaPdf };