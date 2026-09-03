const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');

async function getTenantCumpleanerosModels(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);
  return {
    Alumno: getTenantModel(connection, 'Alumno'),
    Entrenador: getTenantModel(connection, 'Entrenador')
  };
}

exports.getCumpleanerosMes = async (req, res) => {
  try {
    const { Alumno, Entrenador } = await getTenantCumpleanerosModels(req);
    const now = new Date();
    const mesActual = now.getMonth() + 1; // Enero = 1
    const [alumnos, entrenadores] = await Promise.all([
      Alumno.find({
        activo: { $ne: false },
        dado_de_baja: { $ne: true }
      }).populate('sede'),
      Entrenador.find({ estado: { $ne: 'inactivo' } }).populate('sedes_staff')
    ]);

    const cumpleEsteMes = (persona) => {
      if (!persona.fecha_nacimiento) return false;
      const fecha = new Date(persona.fecha_nacimiento);
      return (fecha.getMonth() + 1) === mesActual;
    };

    const cumpleaneros = alumnos.filter(cumpleEsteMes).map((alumno) => ({
      ...alumno.toObject(),
      tipo: 'alumno'
    }));
    const cumpleanerosEntrenadores = entrenadores.filter(cumpleEsteMes).map((entrenador) => ({
      ...entrenador.toObject(),
      nombres: entrenador.nombre,
      apellidos: entrenador.apellido,
      sede: entrenador.sedes_staff?.[0] || null,
      tipo: 'entrenador'
    }));

    res.json([...cumpleaneros, ...cumpleanerosEntrenadores]);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener cumpleaños del mes' });
  }
};
