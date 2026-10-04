const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const sharp = require('sharp');

const logoPath = path.join(__dirname, '..', '..', 'my-react-app', 'public', 'logo_apex.png');

const planPresets = {
  profesional: {
    nombre: 'Profesional',
    academia: 'OLYMPYKUS VOLEIBOL CLUB',
    costo: 50,
    atletas: 200,
    archivo: 'PLAN_PROFESIONAL_TERMINOS_APEX.pdf'
  },
  inicial: {
    nombre: 'Inicial',
    academia: 'CODIGO MONARCA',
    costo: 20,
    atletas: 50,
    archivo: 'PLAN_INICIAL_CODIGO_MONARCA_TERMINOS_APEX.pdf'
  }
};

const planKey = process.argv.includes('--inicial') ? 'inicial' : 'profesional';
const plan = planPresets[planKey];
const outputPath = path.join(__dirname, '..', 'docs', plan.archivo);

const colors = {
  ink: '#17202a',
  muted: '#586474',
  line: '#dce2e8',
  navy: '#102f5e',
  blue: '#1769aa',
  orange: '#f26430',
  soft: '#f3f6f8',
  warm: '#fff6f1',
  white: '#ffffff'
};

const sections = [
  {
    number: '1',
    title: 'Objeto del Servicio',
    paragraphs: [
      'Apex es una plataforma de gestión integral para academias deportivas que facilita la administración de inscripciones, pagos, sedes y personal. Al utilizar el sistema, el cliente (la academia) acepta los términos aquí descritos.'
    ]
  },
  {
    number: '2',
    title: 'Gestión de Mensualidades y Cobros',
    bullets: [
      ['Periodo de Pago', 'El pago de las mensualidades por el uso de la plataforma deberá realizarse dentro de los primeros quince (15) días calendario de cada mes.'],
      ['Suspensión por Mora', 'El incumplimiento en el pago tras vencerse el plazo del día 15 faculta a Apex para suspender temporalmente el acceso a la plataforma hasta que la deuda sea solventada.']
    ]
  },
  {
    number: '3',
    title: 'Registro e Inscripciones',
    bullets: [
      ['Veracidad de Datos', 'La academia es responsable de la veracidad de los datos ingresados (alumnos, representantes y entrenadores).'],
      ['Activación', 'El servicio se considerará activo una vez se haya completado el proceso de configuración inicial y el pago correspondiente al primer periodo de uso.']
    ]
  },
  {
    number: '4',
    title: 'Políticas de Retiro del Sistema',
    bullets: [
      ['Notificación Previa', 'Si la academia desea dejar de utilizar los servicios de Apex, deberá notificarlo con al menos 15 días de antelación al cierre del mes en curso.'],
      ['Respaldo de Información', 'Al solicitar el retiro, la academia tendrá un periodo de 30 días para exportar su información (reportes, base de datos de alumnos e históricos). Tras este periodo, por políticas de seguridad y optimización de servidores, los datos podrán ser eliminados permanentemente.']
    ]
  },
  {
    number: '5',
    title: 'Responsabilidad sobre los Datos',
    paragraphs: [
      'Apex funciona como un procesador de datos. La responsabilidad sobre el manejo de la información personal de los menores de edad y representantes recae exclusivamente sobre la academia, quien debe cumplir con las normativas locales de protección de datos.'
    ]
  },
  {
    number: '6',
    title: 'Disponibilidad del Servicio',
    paragraphs: [
      'Nos comprometemos a mantener una disponibilidad del sistema del 99.9%. En caso de mantenimientos programados que requieran interrumpir el servicio, se notificará a los usuarios con 24 horas de antelación.'
    ]
  }
];

async function buildLogo() {
  return sharp(logoPath)
    .trim({ background: '#ffffff', threshold: 12 })
    .resize(220, 220, { fit: 'contain', background: '#ffffff' })
    .png()
    .toBuffer();
}

function drawTopBar(doc) {
  const pageWidth = doc.page.width;
  doc.rect(0, 0, pageWidth * 0.48, 16).fill(colors.navy);
  doc.rect(pageWidth * 0.48, 0, pageWidth * 0.28, 16).fill(colors.blue);
  doc.rect(pageWidth * 0.76, 0, pageWidth * 0.24, 16).fill(colors.orange);
}

function drawHeader(doc, logo, pageNumber) {
  const pageWidth = doc.page.width;
  const margin = 48;
  drawTopBar(doc);
  doc.image(logo, margin, 30, { width: 58, height: 58 });
  doc.fillColor(colors.navy).font('Helvetica-Bold').fontSize(17).text('APEX', 118, 35);
  doc.fillColor(colors.muted).font('Helvetica-Bold').fontSize(8.5).text('SISTEMA DEPORTIVO', 118, 60);
  doc.fillColor(colors.muted).font('Helvetica').fontSize(8).text(
    `Plan ${plan.nombre} y condiciones de uso\nVersión 1.0 | 2 de octubre de 2026 | Página ${pageNumber}`,
    pageWidth - margin - 205,
    39,
    { width: 205, align: 'right', lineGap: 2 }
  );
  doc.moveTo(margin, 99).lineTo(pageWidth - margin, 99).strokeColor(colors.line).lineWidth(1).stroke();
}

function drawFooter(doc) {
  const pageWidth = doc.page.width;
  const margin = 48;
  doc.moveTo(margin, 776).lineTo(pageWidth - margin, 776).strokeColor(colors.line).lineWidth(1).stroke();
  doc.fillColor(colors.navy).font('Helvetica-Bold').fontSize(8.5).text('APEX - SISTEMA DEPORTIVO', margin, 789);
  doc.fillColor(colors.muted).font('Helvetica').fontSize(8).text(`Plan ${plan.nombre} | ${plan.academia}`, margin, 803);
  doc.fillColor(colors.navy).font('Helvetica-Bold').fontSize(8.5).text(
    'apexsistema2026@gmail.com',
    pageWidth - margin - 190,
    796,
    { width: 190, align: 'right' }
  );
}

function getSectionHeight(doc, section, width) {
  let height = 36;
  doc.font('Helvetica').fontSize(9.2);
  (section.paragraphs || []).forEach((paragraph) => {
    height += doc.heightOfString(paragraph, { width, lineGap: 2 }) + 8;
  });
  (section.bullets || []).forEach(([label, body]) => {
    height += doc.heightOfString(`${label}: ${body}`, { width: width - 16, lineGap: 2 }) + 10;
  });
  return height;
}

function drawSection(doc, section, x, y, width) {
  const bodyX = x + 40;
  const bodyWidth = width - 40;
  const sectionHeight = getSectionHeight(doc, section, bodyWidth);

  doc.roundedRect(x, y, 28, 28, 4).fill(colors.navy);
  doc.fillColor(colors.white).font('Helvetica-Bold').fontSize(12).text(section.number, x, y + 7, {
    width: 28,
    align: 'center'
  });
  doc.fillColor(colors.navy).font('Helvetica-Bold').fontSize(12).text(section.title, bodyX, y + 2, {
    width: bodyWidth
  });

  let cursorY = y + 26;
  (section.paragraphs || []).forEach((paragraph) => {
    doc.fillColor(colors.ink).font('Helvetica').fontSize(9.2).text(paragraph, bodyX, cursorY, {
      width: bodyWidth,
      lineGap: 2,
      align: 'justify'
    });
    cursorY = doc.y + 8;
  });

  (section.bullets || []).forEach(([label, body]) => {
    doc.rect(bodyX, cursorY + 4, 5, 5).fill(colors.orange);
    const textX = bodyX + 14;
    const textWidth = bodyWidth - 14;
    doc.fillColor(colors.navy).font('Helvetica-Bold').fontSize(9.1).text(`${label}: `, textX, cursorY, {
      continued: true,
      width: textWidth
    });
    doc.fillColor(colors.ink).font('Helvetica').text(body, { lineGap: 2, align: 'justify' });
    cursorY = doc.y + 9;
  });

  doc.moveTo(bodyX, y + sectionHeight - 2).lineTo(x + width, y + sectionHeight - 2).strokeColor(colors.line).lineWidth(0.8).stroke();
  return y + sectionHeight;
}

async function generate() {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    info: {
      Title: `Plan ${plan.nombre} y Términos de Uso | APEX`,
      Author: 'APEX - Sistema Deportivo',
      Subject: `Plan ${plan.nombre} para ${plan.academia} y condiciones de uso del sistema`
    }
  });
  const output = fs.createWriteStream(outputPath);
  const finished = new Promise((resolve, reject) => {
    output.on('finish', resolve);
    output.on('error', reject);
  });
  doc.pipe(output);

  const logo = await buildLogo();
  const pageWidth = doc.page.width;
  const margin = 48;
  const contentWidth = pageWidth - (margin * 2);

  drawHeader(doc, logo, 1);
  doc.fillColor(colors.navy).font('Times-Bold').fontSize(27).text(`Plan ${plan.nombre}`, margin, 120);
  doc.fillColor(colors.muted).font('Helvetica').fontSize(10.5).text(
    'Condiciones del servicio adquirido para la gestión integral de una academia deportiva.',
    margin,
    158,
    { width: contentWidth - 18, lineGap: 2 }
  );

  doc.roundedRect(margin, 196, contentWidth, 88, 5).fill(colors.soft);
  doc.rect(margin, 196, 4, 88).fill(colors.orange);
  doc.fillColor(colors.muted).font('Helvetica-Bold').fontSize(8.5).text('PLAN ADQUIRIDO', margin + 20, 213);
  doc.fillColor(colors.navy).font('Helvetica-Bold').fontSize(17).text(plan.nombre.toUpperCase(), margin + 20, 230);
  doc.fillColor(colors.navy).font('Helvetica-Bold').fontSize(8.8).text(`Academia: ${plan.academia}`, margin + 20, 252);
  doc.fillColor(colors.muted).font('Helvetica').fontSize(8.5).text(`Hasta ${plan.atletas} atletas registrados`, margin + 20, 266);
  doc.fillColor(colors.orange).font('Helvetica-Bold').fontSize(25).text(`$${plan.costo} USD`, pageWidth - margin - 150, 218, {
    width: 130,
    align: 'right'
  });
  doc.fillColor(colors.muted).font('Helvetica').fontSize(8.5).text('Costo del plan', pageWidth - margin - 150, 250, {
    width: 130,
    align: 'right'
  });

  doc.fillColor(colors.navy).font('Helvetica-Bold').fontSize(11.5).text('TÉRMINOS Y CONDICIONES DE USO', margin, 301);
  doc.fillColor(colors.muted).font('Helvetica').fontSize(8.8).text(
    'Estas condiciones establecen las responsabilidades operativas entre APEX y la academia usuaria del servicio.',
    margin,
    321,
    { width: contentWidth }
  );

  let cursorY = 354;
  sections.slice(0, 3).forEach((section) => {
    cursorY = drawSection(doc, section, margin, cursorY, contentWidth) + 9;
  });
  drawFooter(doc);

  doc.addPage({ size: 'A4', margin: 0 });
  drawHeader(doc, logo, 2);
  doc.fillColor(colors.navy).font('Times-Bold').fontSize(22).text('Condiciones del servicio', margin, 122);
  doc.fillColor(colors.muted).font('Helvetica').fontSize(9.5).text(
    'Continuación de los Términos y Condiciones de Uso del Sistema Apex.',
    margin,
    153,
    { width: contentWidth }
  );

  cursorY = 190;
  sections.slice(3).forEach((section) => {
    cursorY = drawSection(doc, section, margin, cursorY, contentWidth) + 10;
  });

  const acceptanceY = Math.max(cursorY + 6, 515);
  doc.roundedRect(margin, acceptanceY, contentWidth, 75, 4).fill(colors.warm);
  doc.rect(margin, acceptanceY, 3, 75).fill(colors.orange);
  doc.fillColor(colors.navy).font('Helvetica-Bold').fontSize(10).text('ACEPTACIÓN DE LAS CONDICIONES', margin + 16, acceptanceY + 14);
  doc.fillColor(colors.ink).font('Helvetica').fontSize(8.8).text(
    `La contratación, activación o uso continuado del Plan ${plan.nombre} implica la lectura y aceptación de estos términos por parte de la academia.`,
    margin + 16,
    acceptanceY + 34,
    { width: contentWidth - 32, lineGap: 2 }
  );

  const signatureY = acceptanceY + 105;
  doc.fillColor(colors.muted).font('Helvetica').fontSize(8.5);
  doc.text(`Academia: ${plan.academia}`, margin, signatureY);
  doc.text('Fecha: ___________________________', pageWidth - margin - 190, signatureY);
  doc.text('Nombre y cargo: _____________________________________', margin, signatureY + 34);
  doc.text('Firma: ___________________________', pageWidth - margin - 190, signatureY + 34);

  drawFooter(doc);
  doc.end();
  await finished;
  console.log(`Documento generado: ${outputPath}`);
}

generate().catch((error) => {
  console.error(`No se pudo generar el documento del Plan ${plan.nombre}:`, error);
  process.exitCode = 1;
});