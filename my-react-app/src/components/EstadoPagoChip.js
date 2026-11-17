import React from 'react';
import { Chip } from '@mui/material';

const ESTADOS = {
  pagado: { label: 'Pagado', bgcolor: '#dff7ea', color: '#0f7a4a' },
  pendiente: { label: 'Pendiente', bgcolor: '#fff3dc', color: '#b45309' },
  retrasado: { label: 'Insolvente', bgcolor: '#ffe1e6', color: '#d32f2f' },
  insolvente: { label: 'Insolvente', bgcolor: '#ffe1e6', color: '#d32f2f' },
  exonerado: { label: 'Exonerado', bgcolor: '#e3f2fd', color: '#0288d1' },
  becado: { label: 'Becado', bgcolor: '#e0f2fe', color: '#0284c7' },
  abono: { label: 'Abono', bgcolor: '#efe9e7', color: '#6d4c41' },
  'en revision': { label: 'En revision', bgcolor: '#fff6cc', color: '#b45309' }
};

function EstadoPagoChip({ estado, label, ...props }) {
  const estilo = ESTADOS[String(estado || '').toLowerCase()];
  if (!estilo) return <Chip {...props} label={label || estado || '-'} variant="outlined" />;
  return <Chip {...props} label={label || estilo.label} sx={{
    borderRadius: 999, fontWeight: 700, minWidth: 112, justifyContent: 'center',
    bgcolor: estilo.bgcolor, color: estilo.color,
    '& .MuiChip-label': { px: 0.5, width: '100%', textAlign: 'center' }
  }} />;
}

export default EstadoPagoChip;