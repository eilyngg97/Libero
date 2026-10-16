const tieneId = (dato) => typeof dato?._id === 'string' && dato._id.trim().length > 0;
const esListaAtletas = (datos) => Array.isArray(datos) && datos.every(tieneId);
const esMonto = (valor) => (typeof valor === 'number' || typeof valor === 'string')
  && String(valor).trim() !== '' && Number.isFinite(Number(valor)) && Number(valor) >= 0;

async function consultarDatos(url, mensaje, validar, signal) {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const datos = await response.json();
    if (!validar(datos)) throw new Error('Respuesta no valida');
    return datos;
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error(mensaje, { cause: error });
  }
}

export async function cargarAtletasPortal(apiBase, usuarioId, signal) {
  const representante = await consultarDatos(
    `${apiBase}/api/representantes/por-usuario/${usuarioId}`,
    'No se pudo cargar el representante.',
    (dato) => dato === null || tieneId(dato),
    signal
  );
  const [representadas, directas] = await Promise.all([
    representante ? consultarDatos(
      `${apiBase}/api/alumnos/por-representante/${representante._id}?populateSede=1`,
      'No se pudieron cargar las atletas del representante.',
      esListaAtletas,
      signal
    ) : Promise.resolve([]),
    consultarDatos(
      `${apiBase}/api/alumnos/por-representante/null?usuarioId=${usuarioId}&populateSede=1`,
      'No se pudieron cargar las atletas asociadas a tu cuenta.',
      esListaAtletas,
      signal
    )
  ]);
  const todas = [...representadas, ...directas];
  return {
    representanteId: representante?._id || '',
    atletas: todas.filter((atleta, index) => todas.findIndex((item) => item._id === atleta._id) === index)
  };
}

export async function cargarMensualidadesPortal(apiBase, atleta, signal) {
  return consultarDatos(
    `${apiBase}/api/mensualidades?id_alumno=${atleta._id}`,
    `No se pudieron cargar las mensualidades de ${atleta.nombres || atleta._id}.`,
    (datos) => Array.isArray(datos) && datos.every((item) => tieneId(item)
      && typeof item.estatus === 'string' && item.estatus.trim().length > 0
      && Number.isInteger(Number(item.mes)) && Number(item.mes) >= 1 && Number(item.mes) <= 12
      && Number.isInteger(Number(item.anio)) && Number(item.anio) > 0
      && esMonto(item.monto_esperado)
      && ['saldo_pendiente', 'monto_con_recargo_usd', 'monto_sin_recargo_usd', 'recargo_aplicado_usd',
        'credito_a_aplicar', 'saldo_a_favor_disponible'].every((campo) => item[campo] == null || esMonto(item[campo]))),
    signal
  );
}
