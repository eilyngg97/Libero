import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import IosShareOutlinedIcon from '@mui/icons-material/IosShareOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import { useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { mediaUrl } from '../utils/mediaUrl';
import './ReciboPago.css';

const api = (path) => `${process.env.REACT_APP_API_URL || ''}/api/recibos${path}`;
const monto = (value) => Number(value).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monedaVisible = (moneda) => moneda === 'VES' ? 'Bs' : moneda;
const fecha = (value) => new Date(value).toLocaleString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'medium', timeStyle: 'short' });
const fechaPago = (value) => {
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?Z)?$/.test(raw)) {
    return new Date(`${raw.slice(0, 10)}T12:00:00Z`).toLocaleDateString('es-VE', { timeZone: 'America/Caracas', dateStyle: 'medium' });
  }
  return fecha(value);
};

function validarTotales(recibo) {
  if (!Array.isArray(recibo?.totales) || !recibo.totales.length
    || recibo.totales.some((total) => !['VES', 'USD', 'EUR'].includes(total.moneda)
      || !Number.isFinite(total.monto) || total.monto < 0)) {
    throw new Error('Los importes del recibo estan incompletos. No se puede mostrar ni descargar.');
  }
}

async function solicitarRecibos(path) {
  const res = await fetch(api(path), {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || data.msg || 'No se pudo obtener el recibo.');
  return data;
}

async function prepararQR(recibo) {
  validarTotales(recibo.datos);
  if (!Array.isArray(recibo.datos.lineas) || !Array.isArray(recibo.datos.pagos)
    || recibo.datos.lineas.some((linea) => !Array.isArray(linea.importes))) {
    throw new Error('El desglose del recibo esta incompleto. No se puede descargar.');
  }
  return { ...recibo, qr: await QRCode.toDataURL(recibo.verificacion_url, { width: 240, margin: 2, errorCorrectionLevel: 'M' }) };
}

export function ReciboDocumento({ recibo }) {
  const { datos } = recibo;
  return (
    <article className="recibo-documento" aria-label={`Recibo ${recibo.numero}`}>
      <header className="recibo-cabecera">
        <div className="recibo-academia">
          {datos.academia.logo && <img className="recibo-logo" src={mediaUrl(datos.academia.logo)} alt="Logo de la academia" crossOrigin="anonymous" />}
          <div>
            <strong>{datos.academia.nombre}</strong>
            {datos.academia.rif?.trim() && <small>RIF / ID: {datos.academia.rif}</small>}
            <small>Sede: {datos.academia.sede || 'No registrada'}</small>
          </div>
        </div>
        <span className="recibo-pagado">PAGADO</span>
        <h1>Recibo de Pago</h1>
        <p className="recibo-numero">{recibo.numero}</p>
        <small>Emitido el {fecha(recibo.emitido_en)}</small>
        <div className="recibo-total">
          <small>Monto Total Pagado</small>
          {datos.totales.map((total) => <strong key={total.moneda}>{monto(total.monto)} <span>{monedaVisible(total.moneda)}</span></strong>)}
          {datos.totales.length > 1 && <small>Importes separados por moneda. No se suman entre si.</small>}
        </div>
      </header>
      <div className="recibo-detalles">
        <dl>
          <div><dt>Representante</dt><dd>{datos.representante.nombre}<small>{datos.representante.cedula}</small></dd></div>
          <div><dt>Atleta</dt><dd><strong>{datos.atleta.nombre}</strong><small>{datos.atleta.categoria}</small></dd></div>
          <div><dt>Concepto</dt><dd>{datos.concepto}</dd></div>
        </dl>
        <div className="recibo-desglose" aria-label="Desglose financiero">
          {datos.lineas.map((linea, index) => <div key={index}><span>{linea.concepto}</span><strong>
            {linea.importes.map((importe) => <span className="recibo-importe" key={importe.moneda}>{monto(importe.monto)} {monedaVisible(importe.moneda)}</span>)}
          </strong></div>)}
        </div>
        {datos.totales.length > 1 && <small>Desglose distribuido proporcionalmente entre las monedas de los pagos.</small>}
        <dl>
          {datos.pagos.map((pago, index) => (
            <div key={index}><dt>Metodo de pago {datos.pagos.length > 1 ? index + 1 : ''}</dt>
              <dd>{pago.metodo}<small>{monto(pago.monto)} {monedaVisible(pago.moneda)}</small>
                <small>Ref.: {pago.referencia || 'No aplica'}</small><small>{fechaPago(pago.fecha)}</small></dd>
            </div>
          ))}
          {!datos.pagos.length && <div><dt>Metodo de pago</dt><dd>Saldo a favor / Sin transferencia</dd></div>}
        </dl>
        <footer className="recibo-pie">
          <a href={recibo.verificacion_url} target="_blank" rel="noreferrer" aria-label="Verificar autenticidad del recibo">
            <img src={recibo.qr} alt="QR de validacion del recibo" />
          </a>
          <div><span>Escanea para verificar autenticidad</span><small>Este documento es un comprobante administrativo de control interno generado por el sistema de gestión deportiva Apex. No constituye una factura fiscal ni sustituye los documentos exigidos por la normativa tributaria vigente.</small></div>
        </footer>
      </div>
    </article>
  );
}

async function capturarRecibo(recibo) {
  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-12000px;top:0;width:900px;background:white;container-type:inline-size;';
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    flushSync(() => root.render(<ReciboDocumento recibo={recibo} />));
    await Promise.all(Array.from(container.querySelectorAll('img')).map((image) => image.decode()));
    return await toPng(container.firstElementChild, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
  } finally {
    root.unmount();
    container.remove();
  }
}

export async function descargarRecibosPdf(recibos) {
  if (!recibos.length) throw new Error('No tienes recibos pagados hasta la fecha actual.');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  for (let index = 0; index < recibos.length; index += 1) {
    const png = await capturarRecibo(recibos[index]);
    if (index) pdf.addPage();
    const { width, height } = pdf.getImageProperties(png);
    const scale = Math.min(277 / width, 190 / height);
    pdf.addImage(png, 'PNG', (297 - width * scale) / 2, 10, width * scale, height * scale);
  }
  pdf.save(recibos.length === 1 ? `${recibos[0].numero}.pdf` : 'Mis-recibos.pdf');
}

export default function ReciboPagoButton({ mensualidadId, todos = false, label = 'Ver Recibo', destacado = false, startIcon }) {
  const [recibo, setRecibo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ejecutar = async (action) => {
    setBusy(true);
    setError('');
    try { await action(); } catch (err) { setError(err.message || 'No se pudo procesar el recibo.'); }
    finally { setBusy(false); }
  };
  const abrir = () => ejecutar(async () => {
    if (todos) {
      const data = await solicitarRecibos('/mios');
      const preparados = [];
      for (const item of data) preparados.push(await prepararQR(item));
      await descargarRecibosPdf(preparados);
    } else {
      setRecibo(await prepararQR(await solicitarRecibos(`/mensualidad/${mensualidadId}`)));
    }
  });
  return (
    <>
      <Button onClick={abrir} disabled={busy} size={destacado ? 'medium' : 'small'}
        variant={destacado ? 'outlined' : 'text'}
        startIcon={busy ? <CircularProgress size={16} color="inherit" /> : startIcon || (destacado ? <IosShareOutlinedIcon /> : undefined)}
        sx={{
          textTransform: 'none', fontWeight: 700,
          ...(destacado && {
            bgcolor: '#f8fafc', color: '#475569', borderColor: '#cbd5e1', borderRadius: 999, px: 2.5, py: 1.1,
            minHeight: 44, fontSize: 13, fontWeight: 700, width: { xs: '100%', sm: 'auto' },
            boxShadow: 'none',
            '&:hover': { bgcolor: '#e8edf5', borderColor: '#94a3b8', boxShadow: 'none' }
          })
        }}>
        {label}
      </Button>
      {error && !recibo && <Alert severity="error">{error}</Alert>}
      <Dialog open={Boolean(recibo)} onClose={() => !busy && setRecibo(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          Recibo de pago digital
          <IconButton aria-label="Cerrar recibo" onClick={() => setRecibo(null)} disabled={busy} size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ bgcolor: '#f1f5f9', p: { xs: 1, sm: 3 }, containerType: 'inline-size', '&&': { pt: { xs: 2, sm: 3 } } }}>
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {recibo && <ReciboDocumento recibo={recibo} />}
        </DialogContent>
        <DialogActions sx={{
          display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' },
          gap: 1.25, p: { xs: 2, sm: 2.5 }, borderTop: '1px solid #e2e8f0', bgcolor: '#fff',
          '& > :not(style) ~ :not(style)': { ml: 0 },
          '& .MuiButton-root': { minHeight: 44, borderRadius: 999, px: 2, py: 1, fontSize: 12, fontWeight: 800, textTransform: 'none' }
        }}>
          {recibo && <>
            <Button component="a" target="_blank" rel="noreferrer" variant="outlined" startIcon={<WhatsAppIcon />}
              sx={{ color: '#047857', bgcolor: '#f0fdf4', borderColor: '#bbf7d0', '&:hover': { bgcolor: '#dcfce7', borderColor: '#86efac' } }}
              href={`https://wa.me/?text=${encodeURIComponent(`Recibo de pago ${recibo.numero}: ${recibo.verificacion_url}`)}`}>
              Compartir por WhatsApp
            </Button>
            <Button variant="contained" disableElevation startIcon={<PictureAsPdfOutlinedIcon />} disabled={busy}
              sx={{ bgcolor: '#0e1334', color: '#fff', '&:hover': { bgcolor: '#0b102b' } }}
              onClick={() => ejecutar(() => descargarRecibosPdf([recibo]))}>Descargar PDF</Button>
            <Button variant="outlined" startIcon={<ImageOutlinedIcon />} disabled={busy}
              sx={{ color: '#334155', borderColor: '#cbd5e1', '&:hover': { bgcolor: '#f1f5f9', borderColor: '#94a3b8' } }}
              onClick={() => ejecutar(async () => {
              const png = await capturarRecibo(recibo);
              const link = document.createElement('a');
              link.href = png;
              link.download = `${recibo.numero}.png`;
              link.click();
            })}>Descargar imagen PNG</Button>
          </>}
        </DialogActions>
      </Dialog>
    </>
  );
}

export function VerificarRecibo() {
  const { numero } = useParams();
  const [state, setState] = useState({ loading: true });
  React.useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true });
    fetch(api(`/verificar/${encodeURIComponent(numero)}`), { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'No se pudo verificar el comprobante.');
        validarTotales(data);
        return data;
      })
      .then((data) => setState({ data }))
      .catch((error) => { if (error.name !== 'AbortError') setState({ error: error.message }); });
    return () => controller.abort();
  }, [numero]);
  return (
    <Box sx={{ minHeight: '100vh', boxSizing: 'border-box', bgcolor: '#f1f5f9', display: 'grid', placeItems: 'center', p: { xs: 2, sm: 4 } }}>
      <Box component="main" sx={{ maxWidth: 900, width: '100%', minWidth: 0, containerType: 'inline-size' }}>
        <Typography component="p" sx={{ mb: 2, color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>
          Validacion de recibo
        </Typography>
        {state.loading && <CircularProgress aria-label="Verificando comprobante" />}
        {state.error && <Alert severity="error">{state.error}</Alert>}
        {state.data && (
          <article className="recibo-documento recibo-verificacion" aria-label={`Verificacion del recibo ${state.data.numero}`}>
            <header className="recibo-cabecera">
              <div className="recibo-academia">
                {state.data.academia.logo && <img className="recibo-logo" src={mediaUrl(state.data.academia.logo)} alt="Logo de la academia" />}
                <div>
                  <strong>{state.data.academia.nombre}</strong>
                  {state.data.academia.rif?.trim() && <small>RIF: {state.data.academia.rif}</small>}
                  <small>Sede: {state.data.academia.sede}</small>
                </div>
              </div>
              <span className="recibo-pagado">PAGADO</span>
              <h1>Recibo de Pago</h1>
              <p className="recibo-numero">{state.data.numero}</p>
              <div className="recibo-total">
                <small>Monto Total Pagado</small>
                {state.data.totales.map((total) => <strong key={total.moneda}>{monto(total.monto)} <span>{monedaVisible(total.moneda)}</span></strong>)}
                {state.data.totales.length > 1 && <small>Importes separados por moneda. No se suman entre si.</small>}
              </div>
            </header>
            <div className="recibo-detalles">
              <div className="recibo-sello" role="status">
                <VerifiedOutlinedIcon className="recibo-sello-icono" />
                <div>
                  <strong>Comprobante Válido</strong>
                  <span>Verificado en los registros de la academia</span>
                </div>
              </div>
              <dl>
                <div><dt>Concepto</dt><dd>{state.data.concepto}</dd></div>
                <div><dt>Emision</dt><dd>{fecha(state.data.emitido_en)}</dd></div>
              </dl>
              <footer className="recibo-verificacion-pie">
                <strong>Verificacion publica de autenticidad</strong>
                <small>Este documento es un comprobante administrativo de control interno generado por el sistema de gestión deportiva Apex. No constituye una factura fiscal ni sustituye los documentos exigidos por la normativa tributaria vigente.</small>
              </footer>
            </div>
          </article>
        )}
      </Box>
    </Box>
  );
}
