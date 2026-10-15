import React from 'react';
import { render, screen, within } from '@testing-library/react';
import ConstanciaVariables from './ConstanciaVariables';

test('muestra siempre todas las variables separadas por grupos sin mezclarlas', () => {
  render(<ConstanciaVariables />);
  expect(screen.getByRole('region', { name: 'Variables disponibles' })).toBeVisible();
  const alumnos = screen.getByRole('group', { name: 'Alumnos' });
  const entrenadores = screen.getByRole('group', { name: 'Entrenadores' });
  expect(within(alumnos).getByText('{{alumno_nombre_completo}}')).toBeVisible();
  expect(within(alumnos).queryByText('{{entrenador_nombre_completo}}')).not.toBeInTheDocument();
  for (const variable of ['nombre', 'apellido', 'nombre_completo', 'cedula', 'telefono', 'correo', 'direccion', 'especialidad', 'fecha_nacimiento', 'fecha_ingreso']) {
    expect(within(entrenadores).getByText(`{{entrenador_${variable}}}`)).toBeVisible();
  }
  for (const nombre of ['Horario y listado', 'Asistencia']) {
    expect(screen.getByRole('group', { name: nombre })).toBeVisible();
  }
  expect(screen.queryByRole('group', { name: 'Generales' })).not.toBeInTheDocument();
  for (const variable of ['sede_nombre', 'fecha_emision_texto', 'firmante_cargo']) {
    expect(screen.queryByText(`{{${variable}}}`)).not.toBeInTheDocument();
  }
});
