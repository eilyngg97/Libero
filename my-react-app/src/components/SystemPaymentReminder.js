import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, ButtonBase, Dialog, DialogContent, IconButton, Typography } from '@mui/material';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import WhatsApp from '@mui/icons-material/WhatsApp';
import ContentCopyOutlined from '@mui/icons-material/ContentCopyOutlined';
import CheckRounded from '@mui/icons-material/CheckRounded';
import CalendarTodayOutlined from '@mui/icons-material/CalendarTodayOutlined';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import { fetchSystemSubscription, formatMonthlyCost, formatSubscriptionDate, getSubscriptionDueStatus } from '../utils/systemSubscription';

export default function SystemPaymentReminder() {
  const navigate = useNavigate();
  const [subscription, setSubscription] = useState(null);
  const [copiedField, setCopiedField] = useState('');
  const [copyError, setCopyError] = useState('');
  const apiBase = (process.env.REACT_APP_API_URL || window.location.origin).replace(/\/$/, '');
  const token = localStorage.getItem('token') || '';
  const tenantId = String(localStorage.getItem('tenantId') || '').trim().toLowerCase();
  let role = '';
  try { role = String(JSON.parse(localStorage.getItem('usuario') || '{}').rol || '').trim().toLowerCase(); } catch (_) { role = ''; }

  useEffect(() => {
    if (!token || !tenantId || !['admin', 'super_admin'].includes(role)) return undefined;
    let session;
    try { session = JSON.parse(sessionStorage.getItem('apex-system-reminder-session') || 'null'); } catch (_) { return undefined; }
    if (!session?.id || session.tenantId !== tenantId) return undefined;
    const sessionKey = `${tenantId}:${session.id}`;
    if (sessionStorage.getItem('apex-system-reminder-seen') === sessionKey) return undefined;
    let active = true;
    const controller = new AbortController();
    fetchSystemSubscription(apiBase, token, controller.signal).then((payload) => {
      if (!active || payload.tenantId !== tenantId || payload.recordatorio_pago_activo !== true) return;
      sessionStorage.setItem('apex-system-reminder-seen', sessionKey);
      setSubscription(payload);
    }).catch(() => {});
    return () => { active = false; controller.abort(); };
  }, [apiBase, token, tenantId, role]);

  const close = () => { setSubscription(null); setCopiedField(''); setCopyError(''); };
  const payment = subscription?.datos_pago || {};
  const contact = subscription?.contacto || {};
  const dueStatus = getSubscriptionDueStatus(subscription?.proximo_pago);
  const monthlyCost = formatMonthlyCost(subscription?.costo_mensual_usd);
  const amount = monthlyCost === 'No configurado' ? null : monthlyCost.replace(' USD / mes', '');

  async function copyPaymentField(label, value) {
    setCopyError('');
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(String(value));
      setCopiedField(label);
    } catch (_) {
      setCopyError('No se pudo copiar el dato. Puedes seleccionarlo y copiarlo manualmente.');
    }
  }

  return (
    <Dialog open={Boolean(subscription)} onClose={close} maxWidth="sm" fullWidth aria-labelledby="system-payment-reminder-title" aria-describedby="system-payment-reminder-description" scroll="paper" slotProps={{ backdrop: { sx: { bgcolor: 'rgba(15, 23, 42, .55)', backdropFilter: 'blur(4px)' } } }} PaperProps={{ sx: { borderRadius: 3, bgcolor: '#fff', backgroundImage: 'none', border: '0 !important', boxShadow: '0 28px 80px rgba(15,23,42,.24)', maxHeight: 'calc(100dvh - 32px)', m: 2, width: 'calc(100% - 32px)', '&::before': { content: '""', display: 'block', flexShrink: 0, height: 4, background: 'linear-gradient(95deg, #ee287c, #ff8124)' } } }}>
      <DialogContent sx={{ p: { xs: 2.25, sm: 3.25 } }}>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', mb: 2.5 }}>
          <Box sx={{ width: 44, height: 44, mt: 0.25, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
            <Box component="img" src={`${process.env.PUBLIC_URL || ''}/logo_apex.png`} alt="APEX" sx={{ position: 'absolute', width: 88, maxWidth: 'none', height: 'auto', top: -22, left: -22 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.75 }}>
              <Typography sx={{ fontSize: 10, fontWeight: 800, color: '#c52c69', lineHeight: 1.6 }}>TU SUSCRIPCIÓN APEX</Typography>
              {dueStatus && <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.25, borderRadius: 3, bgcolor: dueStatus.background, color: dueStatus.color, fontSize: 10, fontWeight: 700, lineHeight: 1.5 }}><Box component="span" aria-hidden="true" sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: 'currentColor', flexShrink: 0 }} />{dueStatus.label}</Box>}
            </Box>
            <Typography component="h2" id="system-payment-reminder-title" sx={{ fontSize: { xs: 20, sm: 24 }, fontWeight: 800, lineHeight: 1.3, color: '#151b32', overflowWrap: 'anywhere' }}>Recordatorio de pago</Typography>
          </Box>
          <IconButton aria-label="Cerrar recordatorio" onClick={close} sx={{ color: '#7c8497', width: 32, height: 32, flexShrink: 0, mr: -0.75 }}><CloseRounded sx={{ fontSize: 20 }} /></IconButton>
        </Box>
        <Typography id="system-payment-reminder-description" sx={{ mb: 2.25, color: '#7b8397', fontSize: 14, lineHeight: 1.6 }}>Mantén activa tu suscripción para seguir gestionando tu academia sin interrupciones.</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'minmax(0, 1fr) auto' }, gap: 2, p: 2.5, borderRadius: 2, background: 'linear-gradient(110deg, #11172e 65%, #301b39)', color: '#fff' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ color: '#a3a5b7', fontSize: 10, fontWeight: 800, mb: 0.75 }}>PLAN ACTUAL</Typography>
            <Typography sx={{ fontSize: 17, fontWeight: 800, overflowWrap: 'anywhere' }}>{subscription?.plan || 'No configurado'}</Typography>
            {subscription?.proximo_pago && <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.75, mt: 1 }}><CalendarTodayOutlined sx={{ fontSize: 13, color: '#a3a5b7' }} /><Typography sx={{ fontSize: 11, color: '#a3a5b7' }}>Próximo pago:</Typography><Typography sx={{ fontSize: 11, fontWeight: 700 }}>{formatSubscriptionDate(subscription.proximo_pago)}</Typography></Box>}
          </Box>
          <Box sx={{ borderLeft: { xs: 0, sm: '1px solid rgba(255,255,255,.08)' }, borderTop: { xs: '1px solid rgba(255,255,255,.08)', sm: 0 }, pl: { xs: 0, sm: 2.5 }, pt: { xs: 1.5, sm: 0 }, textAlign: { xs: 'left', sm: 'right' } }}>
            <Typography sx={{ color: '#a3a5b7', fontSize: 10, fontWeight: 800, mb: 0.5 }}>TOTAL A PAGAR</Typography>
            <Typography aria-label={monthlyCost} sx={{ fontSize: 28, fontWeight: 800, lineHeight: 1.25 }}>{amount || 'No configurado'}{amount !== null && <Box component="span" sx={{ color: '#ff63a3', fontSize: 13, ml: 0.5 }}>USD</Box>}</Typography>
            <Typography sx={{ fontSize: 11, color: '#a3a5b7', mt: 0.5 }}>Facturación mensual</Typography>
          </Box>
        </Box>
        <Typography sx={{ mt: 2.5, mb: 1.5, color: '#252d43', fontSize: 14, fontWeight: 800 }}>Datos para realizar el pago</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, border: '1px solid #e2e5ee', borderRadius: 2, overflow: 'hidden' }}>
          {Object.entries({ Banco: payment.banco, Cédula: payment.cedula, Teléfono: payment.telefono }).map(([label, value], index) => (
            <ButtonBase key={label} disabled={!value} aria-label={`Copiar ${label.toLowerCase()}`} onClick={() => copyPaymentField(label, value)} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, textAlign: 'left', p: 1.75, minWidth: 0, minHeight: 60, borderLeft: { xs: 0, sm: index ? '1px solid #e2e5ee' : 0 }, borderTop: { xs: index ? '1px solid #e2e5ee' : 0, sm: 0 }, '&:hover': { bgcolor: '#f8fafc' }, '&.Mui-focusVisible': { outline: '2px solid #c52c69', outlineOffset: -2 } }}>
              <Box component="span" sx={{ minWidth: 0 }}><Box component="span" sx={{ display: 'block', fontSize: 10, color: '#7b8397', mb: 0.5 }}>{label}</Box><Box component="span" sx={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#30384f', overflowWrap: 'anywhere' }}>{value || 'No configurado'}</Box></Box>
              {copiedField === label ? <CheckRounded sx={{ fontSize: 16, color: '#169447', flexShrink: 0 }} /> : <ContentCopyOutlined sx={{ fontSize: 14, color: '#a4aabc', flexShrink: 0 }} />}
            </ButtonBase>
          ))}
        </Box>
        <Typography role="status" sx={{ fontSize: 11, minHeight: 18, mt: 0.75, mb: 1, color: copyError ? '#b42318' : '#15803d' }}>{copyError || (copiedField ? `${copiedField} ${copiedField === 'Cédula' ? 'copiada' : 'copiado'}` : '')}</Typography>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: contact.whatsapp ? 'minmax(0, 1.45fr) minmax(0, 1fr)' : '1fr' }, gap: 1.25 }}>
          {contact.whatsapp && <Button component="a" variant="contained" href={`https://wa.me/${contact.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" startIcon={<WhatsApp sx={{ fontSize: 18 }} />} sx={{ bgcolor: '#159b49', '&:hover': { bgcolor: '#12833e' }, color: '#fff', textTransform: 'none', fontSize: 12, fontWeight: 800, minHeight: 48, borderRadius: 1.5, whiteSpace: 'normal', boxShadow: '0 6px 16px rgba(21,155,73,.16)', px: 1.5 }}>Enviar comprobante por WhatsApp</Button>}
          <Button variant="outlined" endIcon={<ArrowForwardRounded sx={{ fontSize: 16 }} />} onClick={() => { close(); navigate('/mi-perfil'); }} sx={{ color: '#30384f', borderColor: '#e2e5ee', '&:hover': { bgcolor: '#f8fafc', borderColor: '#b8bece' }, textTransform: 'none', fontSize: 12, fontWeight: 700, minHeight: 48, borderRadius: 1.5, whiteSpace: 'normal', px: 1.5 }}>Ver perfil de facturación</Button>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75, mt: 2, color: '#929aad' }}><InfoOutlined sx={{ fontSize: 13, flexShrink: 0 }} /><Typography sx={{ fontSize: 11, lineHeight: 1.5 }}>Tu pago será validado por el equipo de APEX.</Typography></Box>
      </DialogContent>
    </Dialog>
  );
}