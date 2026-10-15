import React from 'react';
import { Box, Typography } from '@mui/material';

const GRUPOS_VARIABLES = [
  {
    nombre: 'Alumnos',
    variables: ['alumno_nombre', 'alumno_apellido', 'alumno_nombre_completo', 'alumno_cedula', 'alumno_categoria', 'alumno_colegio', 'alumno_fecha_nacimiento', 'alumno_fecha_ingreso_academia']
  },
  {
    nombre: 'Entrenadores',
    variables: ['entrenador_nombre', 'entrenador_apellido', 'entrenador_nombre_completo', 'entrenador_cedula', 'entrenador_telefono', 'entrenador_correo', 'entrenador_direccion', 'entrenador_especialidad', 'entrenador_fecha_nacimiento', 'entrenador_fecha_ingreso']
  },
  {
    nombre: 'Horario y listado',
    variables: ['horario_resumen', 'cantidad_alumnos']
  },
  {
    nombre: 'Asistencia',
    variables: ['asistencia_persona_label', 'asistencia_nombre', 'asistencia_cedula', 'asistencia_dia_evento', 'asistencia_hora_desde', 'asistencia_hora_hasta', 'asistencia_motivo_evento', 'asistencia_verbo_presencia', 'asistencia_tiempo']
  }
];

export default function ConstanciaVariables() {
  return (
    <Box component="section" aria-label="Variables disponibles" sx={{ border: '1px solid #e7ebf3', borderRadius: 2, bgcolor: '#f8fafc', p: 1.5 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#334155', mb: 0.5 }}>
        Variables disponibles
      </Typography>
      <Typography sx={{ fontSize: 11, color: '#64748b', mb: 1.5 }}>
        Usa estas variables en los textos del formato. Sus valores se completan al emitir la constancia con los datos seleccionados.
      </Typography>
      <Box sx={{ display: 'grid', gap: 1.5 }}>
        {GRUPOS_VARIABLES.map((grupo) => (
          <Box key={grupo.nombre} role="group" aria-label={grupo.nombre}>
            <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#475569', mb: 0.6 }}>{grupo.nombre}</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
              {grupo.variables.map((variable) => (
                <Box
                  component="code"
                  key={variable}
                  sx={{ fontSize: 11, color: '#475569', bgcolor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 1, px: 0.8, py: 0.4, overflowWrap: 'anywhere', maxWidth: '100%' }}
                >
                  {`{{${variable}}}`}
                </Box>
              ))}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
