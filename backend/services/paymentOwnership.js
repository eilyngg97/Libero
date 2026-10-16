const { aplicarSession } = require('./financeTransaction');

async function userRepresentsAlumno(userId, alumno, RepresentanteModel, session) {
  const representanteId = alumno?.representante?._id || alumno?.representante;
  if (!userId || !representanteId) return false;
  const representante = await aplicarSession(RepresentanteModel.findById(representanteId).select('usuario'), session);
  return Boolean(representante?.usuario && String(representante.usuario) === String(userId));
}

module.exports = { userRepresentsAlumno };
