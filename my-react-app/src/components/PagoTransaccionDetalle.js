import React from 'react';
import { Box, Chip, DialogTitle, IconButton, Typography } from '@mui/material';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';

export function HistorialTransacciones({ children, total, titulo = 'Historial de pagos' }) {
  return <Box sx={{ mt: 3.25 }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.25, gap: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
        <HistoryRoundedIcon sx={{ color: '#8ea0bc', fontSize: 19 }} />
        <Typography sx={{ fontSize: { xs: 16, sm: 19 }, fontWeight: 900, color: '#0b2a57', lineHeight: 1.15 }}>{titulo}</Typography>
      </Box>
      <Chip label={`${total} total`} size="small" sx={{ bgcolor: '#d9e4f7', color: '#4b6ca7', fontWeight: 800, textTransform: 'uppercase', flexShrink: 0 }} />
    </Box>
    <Box role="list" aria-label="Historial de pagos del cargo" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>{children}</Box>
  </Box>;
}

export function FilaHistorialTransaccion({ children }) {
  return <Box role="listitem" sx={{ bgcolor: '#ffffff', border: '1px solid #e8ebf2', borderRadius: 2,
    borderLeft: '4px solid #c9daf6', px: 1.7, py: 1.2, display: 'grid',
    gridTemplateColumns: { xs: '1fr', md: '1.05fr 1.15fr 0.85fr 0.85fr 1fr minmax(140px, 0.8fr) auto' },
    alignItems: 'center', gap: 1.3, '& > *': { minWidth: 0 } }}>{children}</Box>;
}

export function DatoHistorialTransaccion({ label, children, color = '#334155', fuerte = false }) {
  return <Box>
    <Typography sx={{ fontSize: 11, textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>{label}</Typography>
    <Box sx={{ color, mt: 0.25, fontWeight: fuerte ? 800 : undefined, overflowWrap: 'anywhere' }}>{children}</Box>
  </Box>;
}

export const estiloEditarPago = (editando) => ({ borderRadius: 999, px: 2, minWidth: 108,
  textTransform: 'none', fontWeight: 800, bgcolor: editando ? 'transparent' : '#0b2a57',
  color: editando ? '#0b2a57' : '#ffffff', borderColor: '#93a7c7',
  '&:hover': { bgcolor: editando ? '#eff6ff' : '#103469' } });

export const estiloGuardarPago = { borderRadius: 999, px: 2.2, minWidth: 118, bgcolor: '#dcfce7',
  color: '#166534', boxShadow: 'none', fontWeight: 800,
  '&:hover': { bgcolor: '#bbf7d0', boxShadow: 'none' } };

export function PagoDetalleEncabezado({ nombre, onClose, disabled, id, titulo = 'Detalle del pago -' }) {
  return <DialogTitle id={id} sx={{ bgcolor: '#f3f5fb', color: '#0b2a57', fontWeight: 800, fontSize: 17,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
      <Typography sx={{ fontWeight: 800, fontSize: 17, color: '#0b2a57' }}>{titulo}</Typography>
      {nombre && <Typography sx={{ color: '#516b94', fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap',
        overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: { xs: 160, sm: 260 } }}>{nombre}</Typography>}
    </Box>
    <IconButton size="small" aria-label="Cerrar detalle del pago" disabled={disabled} onClick={onClose} sx={{ color: '#6b7280' }}>&times;</IconButton>
  </DialogTitle>;
}

export default function PagoTransaccionDetalle({ children, titulo, acciones, campos, sx }) {
  return <Box sx={{ position: 'relative', bgcolor: '#fff', borderRadius: 2.5, border: '1px solid #e7eaf2',
    p: { xs: 2, sm: 3 }, '&::before': { content: '""', position: 'absolute', top: 0, left: 0, right: 0,
      height: 7, borderTopLeftRadius: 10, borderTopRightRadius: 10,
      background: 'linear-gradient(90deg, #ff8a00 0%, #8a4b00 100%)' }, ...sx }}>
    {titulo && <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
        <Box data-testid="icono-ultimo-pago" aria-hidden="true" sx={{ width: 24, height: 24, flexShrink: 0,
          borderRadius: '50%', bgcolor: '#dbeafe', color: '#0b2a57', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CheckRoundedIcon sx={{ fontSize: 14 }} />
        </Box>
        <Typography sx={{ fontSize: { xs: 16, sm: 19 }, fontWeight: 900, color: '#0b2a57', lineHeight: 1.1 }}>{titulo}</Typography>
      </Box>
      {acciones}
    </Box>}
    {campos && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.25, columnGap: 4.5 }}>
      {campos.map(([label, valor]) => <Box key={label} role="group" aria-label={label}
        sx={{ minWidth: 0, borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
        <Typography sx={{ fontSize: 11, textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>{label}</Typography>
        <Box sx={{ mt: 0.7, color: '#0b2a57', fontWeight: 700, overflowWrap: 'anywhere' }}>{valor ?? '-'}</Box>
      </Box>)}
    </Box>}
    {children}
  </Box>;
}