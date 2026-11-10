const PDFDocument = require('pdfkit');
const { renderFichaTecnicaPdf } = require('../services/fichaTecnicaPdf');

const alumno = {
  nombres: 'Adele', apellidos: 'González', categoria: 'Sub 14', division: 'Segunda division',
  cedula: 'V-30123456', sexo: 'Femenino', fecha_nacimiento: '2013-04-15', fecha_inscripcion: '2026-09-07',
  lugar_nacimiento: 'Barquisimeto', colegio_institucion: 'Colegio Villa Crepuscular', telefono: '0414-1234567',
  domicilio: 'Urbanización Villa Crepuscular, calle 5', talla: '1.60 m', peso: '48 kg', alcance: '2.10 m',
  envergadura: '1.65 m', proyeccion: 'Iniciación competitiva', numero_franela: 12, tipo_sangre: 'O+',
  alergias: 'No reportadas', antecedentes_patologicos: 'No reportados', observaciones: 'Evaluación técnica al cierre del trimestre.',
  representante: { nombres: 'María', apellidos: 'González', cedula: 'V-12345678', telefono: '0414-7654321', correo: 'maria@example.com', direccion: 'Villa Crepuscular' },
  parentesco: 'Madre'
};

async function generate(overrides = {}) {
  const calls = [];
  const original = PDFDocument.prototype.text;
  const spy = jest.spyOn(PDFDocument.prototype, 'text').mockImplementation(function (value, x, y, options) {
    calls.push({ value: String(value), x, y, width: options.width });
    return original.call(this, value, x, y, options);
  });
  const doc = renderFichaTecnicaPdf({
    alumno: { ...alumno, ...overrides }, institucionNombre: 'VILLA SPORT VOLLEYBALL CLUB',
    subtitulo: 'Registro IMDERI: CL/MO/VO/0057', sedeNombre: 'Villa Crepuscular',
    branding: { academyName: 'Villa Sport' }, edad: overrides.fecha_nacimiento === null ? '-' : '13',
    formatFecha: (value) => value ? String(value).slice(0, 10).split('-').reverse().join('/') : '-',
    generadoEn: new Date('2026-11-10T12:00:00Z')
  });
  const pages = doc.bufferedPageRange().count;
  spy.mockRestore();
  const chunks = [];
  return new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), pages, calls }));
    doc.end();
  });
}

test('genera una ficha completa de una página con datos deportivos, salud y representante', async () => {
  const result = await generate();
  expect(result.buffer.subarray(0, 4).toString()).toBe('%PDF');
  expect(result.pages).toBe(1);
  const content = result.calls.map((call) => call.value).join('\n');
  for (const value of ['Adele González', 'PERFIL DEPORTIVO Y MEDIDAS', 'INFORMACIÓN DE SALUD', 'O+', 'María González', 'OBSERVACIONES', 'Página 1 de 1']) expect(content).toContain(value);
  if (process.env.FICHA_PDF_PREVIEW) require('fs').writeFileSync(process.env.FICHA_PDF_PREVIEW, result.buffer);
});

test('los campos ausentes no inventan edad, salud ni representante y toleran fotos no disponibles', async () => {
  const result = await generate({ representante: null, fecha_nacimiento: null, tipo_sangre: '', alergias: '', numero_franela: 0 });
  const content = result.calls.map((call) => call.value).join('\n');
  expect(content).toContain('Edad no registrada');
  expect(content).not.toContain('- años');
  expect(content).toContain('Sin representante asociado');
  expect(content).toContain('No registrado');
  expect(content).toContain('Sin fotografía');
  expect(content).toContain('\n0\n');
});

test('pagina los textos extensos sin sacar los campos del área imprimible', async () => {
  const result = await generate({ domicilio: 'Dirección extensa '.repeat(250), antecedentes_patologicos: 'Antecedente registrado. '.repeat(400), observaciones: 'Seguimiento técnico '.repeat(500), representante: { ...alumno.representante, correo: 'correo'.repeat(60) + '@example.com' } });
  expect(result.pages).toBeGreaterThan(1);
  expect(result.calls.some((call) => call.value.includes('(continuación)'))).toBe(true);
  for (const call of result.calls) {
    expect(call.x).toBeGreaterThanOrEqual(36);
    expect(call.x + call.width).toBeLessThanOrEqual(560);
    expect(call.y).toBeLessThan(815);
    expect(call.y).toBeGreaterThanOrEqual(30);
  }
  expect(result.calls.filter((call) => call.value.startsWith('Página '))).toHaveLength(result.pages);
  expect(result.calls.filter((call) => call.value === 'Documento generado por Apex - sistema deportivo 2026')).toHaveLength(result.pages);
});