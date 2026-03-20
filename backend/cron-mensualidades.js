const mongoose = require('mongoose');
require('dotenv').config();
const Mensualidad = require('./models/Mensualidad');
const Alumno = require('./models/Alumno');

async function generarMensualidadesMes() {
  const hoy = new Date();
  const mes = hoy.getMonth() + 1;
  const anio = hoy.getFullYear();
  const fecha_vencimiento = new Date(anio, mes - 1, 5, 23, 59, 59);
  const alumnos = await Alumno.find({
    activo: { $ne: false },
    dado_de_baja: { $ne: true }
  });
  let creadas = 0;
  for (const alumno of alumnos) {
    const existe = await Mensualidad.findOne({ id_alumno: alumno._id, mes, anio });
    if (!existe) {
      await Mensualidad.create({
        id_alumno: alumno._id,
        mes,
        anio,
        monto_esperado: 25000,
        fecha_vencimiento,
        estatus: 'Pendiente'
      });
      creadas++;
    }
  }
  console.log(`Mensualidades generadas: ${creadas}`);
}

async function actualizarRetrasados() {
  const hoy = new Date();
  if (hoy.getDate() !== 6) return;
  const mes = hoy.getMonth() + 1;
  const anio = hoy.getFullYear();
  const result = await Mensualidad.updateMany(
    { mes, anio, estatus: 'Pendiente', fecha_vencimiento: { $lt: hoy } },
    { $set: { estatus: 'Retrasado' } }
  );
  console.log(`Mensualidades actualizadas a Retrasado: ${result.modifiedCount}`);
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  await generarMensualidadesMes();
  await actualizarRetrasados();
  await mongoose.disconnect();
}

main();
