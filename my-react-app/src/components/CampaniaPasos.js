import React from 'react';
import { Step, StepLabel, Stepper } from '@mui/material';

function CampaniaPasos({ paso }) {
  return <Stepper activeStep={paso} alternativeLabel component="ol" aria-label={'Pasos de creaci\u00f3n'}
    sx={{ m: 0, px: 0, pt: 1.25, pb: 1.25, listStyle: 'none', borderBottom: '1px solid #f0f1f5',
      '& .MuiStepConnector-line': { borderColor: '#e5e6ed' },
      '& .MuiStepIcon-root': { color: '#c8ccd5', '&.Mui-active, &.Mui-completed': { color: '#64748b' } },
      '& .MuiStepLabel-label': { fontSize: 11, color: '#858999', mt: '4px !important',
        '&.Mui-active, &.Mui-completed': { color: '#475569', fontWeight: 650 } } }}>
    {['Datos', 'Participantes', 'Resumen'].map((titulo, indice) =>
      <Step key={titulo} component="li" aria-current={indice === paso ? 'step' : undefined}>
        <StepLabel>{titulo}</StepLabel>
      </Step>)}
  </Stepper>;
}

export default CampaniaPasos;