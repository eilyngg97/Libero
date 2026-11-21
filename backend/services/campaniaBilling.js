const alumnosCargo = (cargo) => cargo.atletas_cubiertos?.length
  ? cargo.atletas_cubiertos.map((atleta) => String(atleta.alumno)) : [String(cargo.alumno)];
const cantidadCargos = (totales) => totales.cobros ?? totales.participantes;
const fotoAtleta = (fila) => ({
  alumno: fila.alumno, nombres: fila.nombres, apellidos: fila.apellidos || '', categoria: fila.categoria || '',
  sede: fila.sede?._id || null, nombre_sede: fila.sede?.nombre || ''
});

function datosCoberturaFamiliar(fila, fuente, representante) {
  return {
    tipo_cobro: 'cubierto_por_representante', modalidad: 'no_aplica', monto: 0,
    saldo_pendiente: 0, estado: 'no_aplica', atletas_cubiertos: [fotoAtleta(fila)],
    representante_cobro: String(representante._id),
    nombre_representante: [representante.nombres, representante.apellidos].filter(Boolean).join(' '),
    cobertura_familiar: { cargo: fuente._id, alumno: fuente.alumno,
      nombre_atleta: [fuente.nombres, fuente.apellidos].filter(Boolean).join(' ') }
  };
}

function agruparCargosPorRepresentante(filas) {
  const grupos = new Map();
  for (const fila of filas) {
    const representante = fila.representante?._id;
    const clave = representante ? `representante:${representante}` : `alumno:${fila.alumno}`;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(fila);
  }
  return [...grupos.values()].map((grupo) => {
    const primera = grupo[0];
    const { representante, ...fila } = primera;
    const conflicto = grupo.some((item) => item.modalidad !== primera.modalidad || item.monto !== primera.monto);
    const retirosDistintos = grupo.some((item) => Boolean(item.retirado) !== Boolean(primera.retirado));
    const nota = [...new Set(grupo.map((item) => item.nota_interna).filter(Boolean))].join('\n');
    return {
      ...fila,
      tipo_cobro: representante ? 'representante' : 'individual_sin_representante',
      ...(representante ? { representante_cobro: String(representante._id),
        nombre_representante: [representante.nombres, representante.apellidos].filter(Boolean).join(' ') } : {}),
      atletas_cubiertos: grupo.map(fotoAtleta),
      monto: conflicto || retirosDistintos ? null : primera.monto,
      nota_interna: nota,
      incidencias: [...new Set(grupo.flatMap((item) => item.incidencias)),
        ...(nota.length > 1000 ? ['Las notas del cobro compartido superan 1000 caracteres. Unifica las notas antes de publicar.'] : []),
        ...(retirosDistintos ? ['Hay atletas retirados y vigentes del mismo representante. Unifica su condicion de retiro antes de convertir.'] : []),
        ...(conflicto ? ['Los atletas de este representante tienen condiciones o importes distintos. Unifica sus condiciones antes de publicar.'] : [])]
    };
  });
}

function totalesCargos(cargos, porRepresentante = false) {
  return {
    participantes: porRepresentante ? cargos.reduce((total, cargo) => total + alumnosCargo(cargo).length, 0) : cargos.length,
    ...(porRepresentante ? { cobros: cargos.length,
      representantes: cargos.filter((cargo) => cargo.tipo_cobro === 'representante').length,
      individuales: cargos.filter((cargo) => cargo.tipo_cobro === 'individual_sin_representante').length } : {}),
    ...(porRepresentante && cargos.some((cargo) => cargo.preservado_conversion || !cargo.tipo_cobro || cargo.tipo_cobro === 'atleta')
      ? { conservados: cargos.filter((cargo) => cargo.preservado_conversion || !cargo.tipo_cobro || cargo.tipo_cobro === 'atleta').length } : {}),
    ...(porRepresentante && cargos.some((cargo) => cargo.tipo_cobro === 'cubierto_por_representante')
      ? { cubiertos: cargos.filter((cargo) => cargo.tipo_cobro === 'cubierto_por_representante').length } : {}),
    generales: cargos.filter((cargo) => cargo.modalidad === 'general').length,
    personalizados: cargos.filter((cargo) => cargo.modalidad === 'personalizado').length,
    no_aplica: cargos.filter((cargo) => cargo.modalidad === 'no_aplica' && cargo.tipo_cobro !== 'cubierto_por_representante').length,
    total_esperado: cargos.some((cargo) => cargo.monto === null) ? null
      : cargos.reduce((total, cargo) => total + Math.round(cargo.monto * 100), 0) / 100
  };
}

module.exports = { alumnosCargo, cantidadCargos, fotoAtleta, datosCoberturaFamiliar, agruparCargosPorRepresentante, totalesCargos };
