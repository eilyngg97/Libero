// Obtener alumnos que cumplen años en el mes actual
const Alumno = require('../models/Alumno');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');

async function getTenantAlumnoModel(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);
  return getTenantModel(connection, 'Alumno');
}

exports.getCumpleanerosMes = async (req, res) => {
  try {
    const TenantAlumno = await getTenantAlumnoModel(req);
    const now = new Date();
    const mesActual = now.getMonth() + 1; // Enero = 1
    // Buscar alumnos con fecha_nacimiento en el mes actual
    const alumnos = await TenantAlumno.find({
      activo: { $ne: false },
      dado_de_baja: { $ne: true }
    }).populate('sede');
    const cumpleaneros = alumnos.filter(a => {
      if (!a.fecha_nacimiento) return false;
      const fecha = new Date(a.fecha_nacimiento);
      return (fecha.getMonth() + 1) === mesActual;
    });
    res.json(cumpleaneros);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener cumpleaños del mes' });
  }
};
