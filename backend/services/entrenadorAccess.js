async function getOwnEntrenador(Entrenador, userId) {
  if (!userId) throw Object.assign(new Error('Sesion de entrenador invalida.'), { status: 401 });
  const entrenador = await Entrenador.findOne({ usuario: userId }).lean();
  if (!entrenador) throw Object.assign(new Error('No hay un entrenador vinculado a tu usuario.'), { status: 404 });
  if (entrenador.estado === 'inactivo') throw Object.assign(new Error('Tu perfil de entrenador esta inactivo.'), { status: 403 });
  return entrenador;
}

module.exports = { getOwnEntrenador };