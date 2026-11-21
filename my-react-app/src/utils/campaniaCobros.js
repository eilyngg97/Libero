export const alumnosDelCargo = (cargo) => cargo.atletas_cubiertos?.length
  ? cargo.atletas_cubiertos.map((atleta) => atleta.alumno) : [cargo.alumno];

export const titularCargo = (cargo) => cargo.tipo_cobro === 'representante'
  ? cargo.nombre_representante : `${cargo.nombres} ${cargo.apellidos || ''}`.trim();

export const detalleCobertura = (cargo) => (cargo.atletas_cubiertos || [cargo])
  .map((atleta) => `${atleta.nombres} ${atleta.apellidos || ''} · ${atleta.categoria || 'Sin categoria'} · ${atleta.nombre_sede || atleta.sede?.nombre || ''}`).join(' / ');

export const esCubierto = (cargo) => cargo.tipo_cobro === 'cubierto_por_representante';
export const etiquetaCobro = (cargo) => esCubierto(cargo) ? 'Cubierto por pago del representante'
  : cargo.preservado_conversion ? 'Cargo conservado sin cambios'
    : cargo.tipo_cobro === 'representante' ? cargo.atletas_cubiertos?.length > 1 ? 'Cobro compartido' : 'Cobro por representante'
      : 'Sin representante · Cobro individual';

export const totalesEspecialesValidos = (filas, totales) => ['conservados', 'cubiertos'].every((key) => (
  Number.isInteger(totales[key] ?? 0) && (totales[key] ?? 0) === filas.filter((fila) => (
    key === 'cubiertos' ? esCubierto(fila) : fila.preservado_conversion === true
  )).length
));

export function coberturaValida(filas, participantes, porRepresentante) {
  if (!Array.isArray(filas) || !Array.isArray(participantes)) return false;
  if (porRepresentante && filas.some((fila) => {
    if (fila && (fila.tipo_cobro || 'atleta') === 'atleta') {
      return fila.preservado_conversion !== true || typeof fila.alumno !== 'string'
        || typeof fila.motivo_conservacion !== 'string' || (fila.atletas_cubiertos?.length > 0);
    }
    return !fila || !['representante', 'individual_sin_representante', 'cubierto_por_representante'].includes(fila.tipo_cobro)
    || !Array.isArray(fila.atletas_cubiertos) || !fila.atletas_cubiertos.length
    || fila.atletas_cubiertos[0]?.alumno !== fila.alumno
    || fila.atletas_cubiertos.some((atleta) => !atleta || typeof atleta.alumno !== 'string'
      || typeof atleta.nombres !== 'string' || typeof atleta.apellidos !== 'string'
      || typeof atleta.nombre_sede !== 'string')
    || (esCubierto(fila) && (fila.atletas_cubiertos.length !== 1 || typeof fila.cobertura_familiar?.cargo !== 'string'
      || typeof fila.cobertura_familiar.nombre_atleta !== 'string' || fila.modalidad !== 'no_aplica' || fila.monto !== 0))
    || (fila.tipo_cobro === 'representante' || esCubierto(fila) ? typeof fila.representante_cobro !== 'string'
      || !fila.representante_cobro || typeof fila.nombre_representante !== 'string'
      : fila.atletas_cubiertos.length !== 1 || fila.representante_cobro);
  })) return false;
  const alumnos = filas.flatMap((fila) => fila ? alumnosDelCargo(fila) : []);
  const seleccionados = new Set(participantes);
  const representantes = filas.filter((fila) => fila?.tipo_cobro === 'representante').map((fila) => fila.representante_cobro);
  return alumnos.length === participantes.length && new Set(alumnos).size === alumnos.length
    && alumnos.every((id) => seleccionados.has(id)) && new Set(representantes).size === representantes.length;
}
