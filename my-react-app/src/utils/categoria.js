export const CATEGORIAS_DISPONIBLES = [
  'U9',
  'U11',
  'U13',
  'U15',
  'U17',
  'U19',
  'U21',
  'U23',
  'MAYORES / LIBRE'
];

export function getCategoriaPorFechaNacimiento(fechaNacimiento) {
  if (!fechaNacimiento) return '';

  const nacimiento = new Date(fechaNacimiento);
  if (Number.isNaN(nacimiento.getTime())) return '';

  const hoy = new Date();
  let edadDeportiva = hoy.getFullYear() - nacimiento.getFullYear();
  const mesDiff = hoy.getMonth() - nacimiento.getMonth();
  if (mesDiff < 0 || (mesDiff === 0 && hoy.getDate() < nacimiento.getDate())) {
    edadDeportiva -= 1;
  }

  if (edadDeportiva <= 8) return CATEGORIAS_DISPONIBLES[0];
  if (edadDeportiva <= 10) return CATEGORIAS_DISPONIBLES[1];
  if (edadDeportiva <= 12) return CATEGORIAS_DISPONIBLES[2];
  if (edadDeportiva <= 14) return CATEGORIAS_DISPONIBLES[3];
  if (edadDeportiva <= 16) return CATEGORIAS_DISPONIBLES[4];
  if (edadDeportiva <= 18) return CATEGORIAS_DISPONIBLES[5];
  if (edadDeportiva <= 20) return CATEGORIAS_DISPONIBLES[6];
  if (edadDeportiva <= 22) return CATEGORIAS_DISPONIBLES[7];
  return CATEGORIAS_DISPONIBLES[8];
}
