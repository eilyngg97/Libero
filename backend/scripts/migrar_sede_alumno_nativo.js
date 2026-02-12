// Script usando el driver nativo de MongoDB para forzar la migración del campo sede (sin conflicto de update)
const { MongoClient, ObjectId } = require('mongodb');
require('dotenv').config();

async function migrarSedeNativo() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/gestion_deportiva';
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    const alumnos = db.collection('alumnos');
    const cursor = alumnos.find({ 'sede._id': { $exists: true } });
    let actualizados = 0;
    while (await cursor.hasNext()) {
      const alumno = await cursor.next();
      if (alumno.sede && alumno.sede._id) {
        await alumnos.updateOne(
          { _id: alumno._id },
          { $set: { sede: alumno.sede._id } }
        );
        actualizados++;
      }
    }
    console.log(`Alumnos actualizados: ${actualizados}`);
  } catch (err) {
    console.error('Error en la migración:', err);
  } finally {
    await client.close();
  }
}

migrarSedeNativo();
