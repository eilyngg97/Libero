// Controlador para generación de constancias
const PDFDocument = require('pdfkit');
const Alumno = require('../models/Alumno');
const Mensualidad = require('../models/Mensualidad');
const path = require('path');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');

async function getTenantConstanciaModels(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);

  return {
    Alumno: getTenantModel(connection, 'Alumno'),
    Mensualidad: getTenantModel(connection, 'Mensualidad')
  };
}

// tipo: retiro | simple | horario
exports.generarConstancia = async (req, res) => {
  const { alumnoId, tipo, fechaEmision } = req.body;
  try {
    const {
      Alumno: TenantAlumno,
      Mensualidad: TenantMensualidad
    } = await getTenantConstanciaModels(req);

    if (tipo === 'retiro' && req.user?.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo un administrador puede generar constancia de retiro' });
    }

    const alumno = await TenantAlumno.findById(alumnoId).populate('representante').populate('sede');
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

    if (tipo === 'simple') {
      const mensualidades = await TenantMensualidad.find({ id_alumno: alumnoId }).select('estatus');
      const estatusConDeuda = new Set(['pendiente', 'abono', 'en revision', 'retrasado', 'insolvente']);
      const tieneDeuda = mensualidades.some((m) => estatusConDeuda.has(String(m.estatus || '').toLowerCase()));
      if (tieneDeuda) {
        return res.status(400).json({ error: 'La constancia simple solo está disponible para alumnos solventes' });
      }
    }

    // Crear PDF en memoria
    const doc = new PDFDocument();
    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=constancia.pdf');
      res.send(pdfData);
    });

    // Logo en la esquina superior izquierda
    const logoPath = path.join(__dirname, '../assets/logo.png');
    try {
      doc.image(logoPath, 40, 30, { width: 70 });
    } catch (e) {
      // Si hay error con el logo, continuar sin interrumpir
    }
    // Encabezado
    doc.fontSize(16).text('Escuela de voleibol', { align: 'center' });
    doc.fontSize(18).text('Villa Sport Volleyball Club', { align: 'center' });
    doc.fontSize(12).text('Urb. Villa Crepuscular sector “L”', { align: 'center' });
    doc.fontSize(12).text(`Sede “${alumno.sede.nombre}”`, { align: 'center' });
    doc.fontSize(12).text('Barquisimeto, Edo. Lara', { align: 'center' });
    doc.fontSize(12).text('Registro IMDERI: CL/MO/VO/0057', { align: 'center' });
    doc.moveDown();
    if (tipo === 'retiro') {
      doc.fontSize(14).text('CARTA DE RETIRO', { align: 'center' });
    } else {
      doc.fontSize(14).text('CONSTANCIA', { align: 'center' });
    }
    doc.moveDown();

    // Cuerpo según tipo
    // Procesar fecha de emisión
    let textoFecha = '';
    if (fechaEmision) {
      const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
      const partes = fechaEmision.split('-'); // yyyy-mm-dd
      if (partes.length === 3) {
        const dia = parseInt(partes[2], 10);
        const mes = meses[parseInt(partes[1], 10) - 1];
        const anio = partes[0];
        textoFecha = `a los ${dia} días del mes de ${mes} del año ${anio}`;
      }
    }
    // Siempre mostrar nombres y apellidos en mayúsculas
    const nombresMayus = alumno.nombres ? alumno.nombres.toUpperCase() : '';
    const apellidosMayus = alumno.apellidos ? alumno.apellidos.toUpperCase() : '';
    const cedulaTexto = alumno.cedula ? `, V-${alumno.cedula}` : '';
    if (tipo === 'retiro') {
      doc.fontSize(12).text('Ante todo, reciba un cordial saludo.');
      doc.moveDown();
      doc.fontSize(12).text(`La escuela VILLA SPORT VOLLEYBALL CLUB, hace constar que el/la atleta ${nombresMayus} ${apellidosMayus}${cedulaTexto}, anuncia su retiro de nuestra organización.`);
      doc.moveDown();
      doc.fontSize(12).text('Damos aval que tiene un estado solvente frente a las responsabilidades y obligaciones con la escuela.');
      doc.moveDown();
      doc.fontSize(12).text('De ante mano agradecidos por su tiempo y atención.');
      doc.moveDown();
    } else if (tipo === 'horario') {
      doc.fontSize(12).text('Ante todo, reciba un cordial saludo.');
      doc.moveDown();
      doc.fontSize(12).text(`La escuela VILLA SPORT VOLLEYBALL CLUB, hace constar que el/la atleta ${nombresMayus} ${apellidosMayus}${cedulaTexto}, es integrante de nuestra escuela, demostrando ser un/a alumno/a responsable de buenos valores.`);
      doc.moveDown();
      const horarioSede = alumno.sede?.horario_constancia;
      if (horarioSede) {
        doc.fontSize(12).text(`Así como también cabe mencionar que la atleta asiste a práctica ${horarioSede}.`);
      } else {
        doc.fontSize(12).text('Así como también cabe mencionar que la atleta asiste a práctica los días lunes y miércoles desde las 5:30 pm hasta las 8:00 pm y los días sábado desde las 11 am hasta la 1:30 pm.');
      }
      doc.moveDown();
      doc.fontSize(12).text('Sin más nada que decir, agradezco su tiempo y atención.');
      doc.moveDown();
    } else {
      doc.fontSize(12).text('Ante todo, reciba un cordial saludo.');
      doc.moveDown();
      doc.fontSize(12).text(`La escuela VILLA SPORT VOLLEYBALL CLUB, hace constar que el/la atleta ${nombresMayus} ${apellidosMayus}${cedulaTexto} es integrante de nuestra escuela, demostrando ser una alumna responsable de buenos valores.`);
      doc.moveDown();
      doc.fontSize(12).text('Sin más nada que mencionar, agradezco su tiempo y atención.');
      doc.moveDown();
    }
    if (textoFecha) {
      doc.fontSize(12).text(`Constancia que se emite ${textoFecha}, en la ciudad de Barquisimeto.`);
    }
    doc.moveDown(2);
    doc.moveDown(8);
    doc.text('_________________________', { align: 'center' });
    doc.moveDown();
    doc.text('EDIXON NELO', { align: 'center' });
    doc.text('V-19.433.844', { align: 'center' });
    doc.text('0412-5228727', { align: 'center' });
    doc.text('PRESIDENTE DEL CLUB', { align: 'center' });
    // Aquí se podrá agregar firma/sello en el futuro
    doc.end();
  } catch (err) {
    res.status(500).json({ error: 'Error generando constancia', detalle: err.message });
  }
};
