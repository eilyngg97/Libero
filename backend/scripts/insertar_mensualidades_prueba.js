// Script para insertar mensualidades de prueba a un alumno específico
const mongoose = require('mongoose');
const Alumno = require('../models/Alumno');
const Mensualidad = require('../models/Mensualidad');

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/gestion_deportiva');

  const cedula = '25894044';
  const alumno = await Alumno.findOne({ cedula });
  if (!alumno) {
    console.error('Alumno no encontrado');
    process.exit(1);
  }

  const mensualidades = [
    { mes: 1, anio: 2026, monto_esperado: 25000, estatus: 'Pagado' },
    { mes: 2, anio: 2026, monto_esperado: 25000, estatus: 'Pendiente' },
    { mes: 3, anio: 2026, monto_esperado: 25000, estatus: 'Retrasado' },
    { mes: 4, anio: 2026, monto_esperado: 25000, estatus: 'Exonerado' },
  ];

  for (const m of mensualidades) {
    // Evitar duplicados
    const existe = await Mensualidad.findOne({ id_alumno: alumno._id, mes: m.mes, anio: m.anio });
    if (!existe) {
      // Calcular fecha de vencimiento: día 5 del mes correspondiente
      const fechaVencimiento = new Date(m.anio, m.mes - 1, 5);
      await Mensualidad.create({
        id_alumno: alumno._id,
        ...m,
        fecha_vencimiento: fechaVencimiento
      });
      console.log(`Mensualidad ${m.mes}/${m.anio} (${m.estatus}) creada.`);
    } else {
      console.log(`Mensualidad ${m.mes}/${m.anio} ya existe.`);
    }
  }

  await mongoose.disconnect();
  console.log('Listo.');
}

main().catch(e => { console.error(e); process.exit(1); });
