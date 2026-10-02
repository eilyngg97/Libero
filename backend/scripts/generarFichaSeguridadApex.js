const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const sharp = require('sharp');

const outputPath = path.join(__dirname, '..', 'docs', 'FICHA_SEGURIDAD_APEX.pdf');
const logoPath = path.join(__dirname, '..', '..', 'my-react-app', 'public', 'logo_apex.png');

const colors = {
  ink: '#17202a',
  muted: '#586474',
  line: '#dce2e8',
  navy: '#102f5e',
  blue: '#1769aa',
  orange: '#f26430',
  soft: '#f3f6f8',
  warm: '#fff6f1'
};

function addControl(doc, x, y, width, title, body) {
  const height = 72;
  doc.rect(x, y, width, height).fill(colors.soft);
  doc.rect(x, y, width, 2).fill(colors.blue);
  doc.fillColor(colors.navy).font('Helvetica-Bold').fontSize(10).text(title, x + 12, y + 13, {
    width: width - 24
  });
  doc.fillColor('#354251').font('Helvetica').fontSize(8.4).text(body, x + 12, y + 31, {
    width: width - 24,
    lineGap: 1.4
  });
}

async function buildLogo() {
  return sharp(logoPath)
    .trim({ background: '#ffffff', threshold: 12 })
    .resize(220, 220, { fit: 'contain', background: '#ffffff' })
    .png()
    .toBuffer();
}

async function generate() {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    info: {
      Title: 'Ficha de seguridad | APEX - Sistema Deportivo',
      Author: 'APEX - Sistema Deportivo',
      Subject: 'Controles generales de protección de la información'
    }
  });
  const output = fs.createWriteStream(outputPath);
  const finished = new Promise((resolve, reject) => {
    output.on('finish', resolve);
    output.on('error', reject);
  });
  doc.pipe(output);

  const pageWidth = doc.page.width;
  const margin = 48;
  const contentWidth = pageWidth - (margin * 2);
  const columnGap = 12;
  const columnWidth = (contentWidth - columnGap) / 2;
  const logo = await buildLogo();

  doc.rect(0, 0, pageWidth * 0.48, 16).fill(colors.navy);
  doc.rect(pageWidth * 0.48, 0, pageWidth * 0.28, 16).fill(colors.blue);
  doc.rect(pageWidth * 0.76, 0, pageWidth * 0.24, 16).fill(colors.orange);

  doc.image(logo, margin, 30, { width: 58, height: 58 });
  doc.fillColor(colors.navy).font('Helvetica-Bold').fontSize(17).text('APEX', 118, 35);
  doc.fillColor(colors.muted).font('Helvetica-Bold').fontSize(8.5).text('SISTEMA DEPORTIVO', 118, 60);
  doc.fillColor(colors.muted).font('Helvetica').fontSize(8).text(
    'Ficha general de seguridad\nVersión 1.0 | 1 de octubre de 2026',
    pageWidth - margin - 170,
    40,
    { width: 170, align: 'right', lineGap: 2 }
  );
  doc.moveTo(margin, 99).lineTo(pageWidth - margin, 99).strokeColor(colors.line).lineWidth(1).stroke();

  doc.fillColor(colors.navy).font('Times-Bold').fontSize(27).text('Protección de la información', margin, 120);
  doc.fillColor(colors.muted).font('Helvetica').fontSize(10.5).text(
    'APEX aplica controles técnicos y operativos para proteger la información administrativa, deportiva y financiera gestionada por cada academia, reducir accesos no autorizados y mantener la continuidad del servicio.',
    margin,
    158,
    { width: contentWidth - 18, lineGap: 2 }
  );

  const controls = [
    ['Conexión protegida', 'La comunicación utiliza HTTPS con TLS 1.2 y 1.3. Los certificados digitales cuentan con renovación automática.'],
    ['Acceso autenticado', 'Las áreas privadas requieren una sesión válida. Las contraseñas se almacenan mediante hash seguro y no como texto legible.'],
    ['Roles y permisos', 'Cada usuario accede solo a las funciones autorizadas para su rol. Las operaciones sensibles requieren permisos administrativos específicos.'],
    ['Aislamiento por academia', 'La plataforma valida la academia asociada a cada solicitud y sesión para impedir el acceso cruzado a información de otras organizaciones.'],
    ['Protección de la aplicación', 'Se aplican firewall, bloqueo de intentos abusivos, encabezados de seguridad, restricción de orígenes y límites de solicitudes.'],
    ['Supervisión operativa', 'El sistema registra y rota eventos operativos, y dispone de verificaciones de estado para facilitar la detección y atención de fallas.']
  ];
  controls.forEach(([title, body], index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    addControl(doc, margin + (column * (columnWidth + columnGap)), 222 + (row * 82), columnWidth, title, body);
  });

  doc.fillColor(colors.navy).font('Helvetica-Bold').fontSize(11.5).text('CONTINUIDAD Y RECUPERACIÓN', margin, 481);
  doc.fillColor('#354251').font('Helvetica').fontSize(8.8).text(
    'Respaldo: Se generan copias completas diarias de todas las academias, con retención de 14 días y acceso restringido.',
    margin,
    508,
    { width: columnWidth, lineGap: 1.5 }
  );
  doc.fillColor('#354251').font('Helvetica').fontSize(8.8).text(
    'Recuperación: El procedimiento de restauración fue probado con éxito en una base temporal, verificando la integridad de los datos recuperados.',
    margin + columnWidth + columnGap,
    508,
    { width: columnWidth, lineGap: 1.5 }
  );

  doc.rect(margin, 575, contentWidth, 108).fill(colors.warm);
  doc.rect(margin, 575, 3, 108).fill(colors.orange);
  doc.fillColor(colors.navy).font('Helvetica-Bold').fontSize(9.5).text(
    'Compromiso responsable.',
    margin + 16,
    591,
    { width: contentWidth - 32 }
  );
  doc.fillColor(colors.ink).font('Helvetica').fontSize(9).text(
    'Ningún servicio conectado a Internet puede garantizar riesgo cero. APEX aplica controles por capas para reducir significativamente la probabilidad de sustracción, alteración o pérdida de datos. La academia contribuye a esta protección mediante contraseñas robustas, cuentas individuales y retiro oportuno de accesos que ya no sean necesarios.',
    margin + 16,
    611,
    { width: contentWidth - 32, lineGap: 1.5 }
  );

  doc.moveTo(margin, 776).lineTo(pageWidth - margin, 776).strokeColor(colors.line).lineWidth(1).stroke();
  doc.fillColor(colors.navy).font('Helvetica-Bold').fontSize(8.5).text('APEX - SISTEMA DEPORTIVO', margin, 789);
  doc.fillColor(colors.muted).font('Helvetica').fontSize(8).text('Controles verificados el 1 de octubre de 2026', margin, 803);
  doc.fillColor(colors.navy).font('Helvetica-Bold').fontSize(8.5).text(
    'apexsistema2026@gmail.com',
    pageWidth - margin - 190,
    796,
    { width: 190, align: 'right' }
  );

  doc.end();
  await finished;
  console.log(`Ficha generada: ${outputPath}`);
}

generate().catch((error) => {
  console.error('No se pudo generar la ficha de seguridad:', error);
  process.exitCode = 1;
});