export const CATEGORIAS_DISPONIBLES = [
  'U9/INICIACION',
  'U11/FORMACION',
  'U13/MINI',
  'U15/INFANTIL',
  'U17/JUVENIL',
  'U19/JUVENIL LIBRE',
  'U21',
  'MAYORES / LIBRE'
];

export function getCategoriaPorFechaNacimiento(fechaNacimiento) {
  if (!fechaNacimiento) return '';

  const nacimiento = new Date(fechaNacimiento);
  if (Number.isNaN(nacimiento.getTime())) return '';

  const anioNacimiento = nacimiento.getFullYear();

  if (anioNacimiento >= 2017) return CATEGORIAS_DISPONIBLES[0];
  if (anioNacimiento >= 2015 && anioNacimiento <= 2016) return CATEGORIAS_DISPONIBLES[1];
  if (anioNacimiento >= 2013 && anioNacimiento <= 2014) return CATEGORIAS_DISPONIBLES[2];
  if (anioNacimiento >= 2011 && anioNacimiento <= 2012) return CATEGORIAS_DISPONIBLES[3];
  if (anioNacimiento >= 2009 && anioNacimiento <= 2010) return CATEGORIAS_DISPONIBLES[4];
  if (anioNacimiento >= 2007 && anioNacimiento <= 2008) return CATEGORIAS_DISPONIBLES[5];
  if (anioNacimiento >= 2005 && anioNacimiento <= 2006) return CATEGORIAS_DISPONIBLES[6];
  return CATEGORIAS_DISPONIBLES[7];
}
