export function getCategoriaPorFechaNacimiento(fechaNacimiento) {
  if (!fechaNacimiento) return '';

  const fecha = String(fechaNacimiento).trim();
  const anioNacimiento = Number.parseInt(fecha.slice(0, 4), 10);
  if (!Number.isInteger(anioNacimiento)) return '';

  const anioActual = new Date().getFullYear();
  const edadDeportiva = anioActual - anioNacimiento;

  if (edadDeportiva <= 8) return 'U9';
  if (edadDeportiva <= 10) return 'U11';
  if (edadDeportiva <= 12) return 'U13';
  if (edadDeportiva <= 14) return 'U15';
  if (edadDeportiva <= 16) return 'U17';
  if (edadDeportiva <= 18) return 'U19';
  if (edadDeportiva <= 20) return 'U21';
  if (edadDeportiva <= 22) return 'U23';
  return 'MAYORES / LIBRE';
}
