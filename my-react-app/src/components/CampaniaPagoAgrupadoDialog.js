import React, { useEffect, useRef, useState } from 'react';
import { Alert, Avatar, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  Divider, IconButton, MenuItem, Paper, TextField, Tooltip, Typography } from '@mui/material';
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import ModalPago from './ModalPago';
import { normalizarImportePagoCampania } from '../utils/campaniaMontos';
import { alumnosDelCargo, detalleCobertura, titularCargo, etiquetaCobro } from '../utils/campaniaCobros';

const API = process.env.REACT_APP_API_URL || window.location.origin;
const centimos = (importe) => Math.round(importe * 100);
const formato = (importe, moneda) => new Intl.NumberFormat('es-VE', { style: 'currency', currency: moneda }).format(importe);
const dinero = (importe) => typeof importe === 'number' && Number.isFinite(importe) && importe > 0;
const ESTADOS_TRANSFERENCIA = {
  en_revision: { texto: 'En revisión', fondo: '#fff2d6', color: '#895a13' },
  confirmado: { texto: 'Confirmado', fondo: '#e5f4ea', color: '#247244' },
  eliminado: { texto: 'Retirado', fondo: '#eceef3', color: '#626879' }
};
const headers = () => {
  const token = localStorage.getItem('token');
  if (!token) throw new Error('Inicia sesion nuevamente.');
  return { Authorization: `Bearer ${token}` };
};

function CampaniaPagoAgrupadoDialog({ alumnoId, grupoId = '', representante = false, pagina = false, onClose, onSaved }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);
  const [seleccion, setSeleccion] = useState([]);
  const [moneda, setMoneda] = useState('USD');
  const [formulario, setFormulario] = useState(false);
  const [retirando, setRetirando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const enviando = useRef(false);
  const solicitud = useRef('');
  const resultado = useRef(null);
  const ruta = `${API}/api/campanias-cobro/pagos-agrupados${grupoId ? `/${encodeURIComponent(grupoId)}` : ''}`;

  useEffect(() => {
    const controller = new AbortController();
    setDatos(null); setError(''); setSeleccion([]); solicitud.current = '';
    const cargar = async () => {
      try {
        const response = await fetch(grupoId ? ruta : `${API}/api/campanias-cobro/cargos-agrupables?alumnoId=${encodeURIComponent(alumnoId)}`,
          { headers: headers(), cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los cargos agrupables.');
        if (!Array.isArray(data.cargos) || new Set(data.cargos.map((cargo) => cargo?._id)).size !== data.cargos.length
          || data.cargos.some((cargo) => !cargo?._id || !cargo.alumno || !cargo.campania?._id || typeof cargo.campania.nombre !== 'string'
            || (cargo.campania.descripcion != null && typeof cargo.campania.descripcion !== 'string')
            || !['USD', 'EUR'].includes(cargo.moneda) || !Number.isInteger(cargo.__v) || cargo.__v < 0
            || (!grupoId && !dinero(cargo.saldo_pendiente)))) throw new Error('No se pudieron verificar los cargos agrupables.');
        if (grupoId && (!Array.isArray(data.pagos) || data.pagos.length < 2 || data.pagos.length !== data.cargos.length
          || new Set(data.pagos.map((pago) => pago.cargo)).size !== data.cargos.length
          || data.pagos.some((pago) => pago.agrupacion?.id !== grupoId || !dinero(pago.monto_pagado)
            || !data.cargos.some((cargo) => cargo._id === pago.cargo && cargo.moneda === pago.moneda))
          || data.pagos.some((pago) => pago.moneda !== data.pagos[0].moneda)
          || data.pagos.reduce((suma, pago) => suma + centimos(pago.monto_pagado), 0) !== centimos(data.pagos[0].agrupacion.monto_total))) {
          throw new Error('No se pudo verificar el reparto de la transferencia.');
        }
        if (!controller.signal.aborted) {
          const monedaInicial = data.cargos[0]?.moneda || 'USD';
          setDatos(data); setMoneda(monedaInicial);
          if (pagina && !grupoId) setSeleccion(data.cargos.filter((cargo) => cargo.moneda === monedaInicial).slice(0, 100).map((cargo) => cargo._id));
        }
      } catch (err) { if (!controller.signal.aborted) setError(err.message); }
    };
    cargar();
    return () => controller.abort();
  }, [alumnoId, grupoId, ruta, intento, pagina]);

  const filas = grupoId ? datos?.cargos || [] : (datos?.cargos || []).filter((cargo) => cargo.moneda === moneda);
  const elegidos = grupoId ? filas : filas.filter((cargo) => seleccion.includes(cargo._id));
  const total = grupoId ? datos?.pagos[0]?.agrupacion.monto_total || 0 : elegidos.reduce((suma, cargo) => suma + centimos(cargo.saldo_pendiente), 0) / 100;
  const estadoGrupo = grupoId && datos ? ESTADOS_TRANSFERENCIA[datos.pagos.every((pago) => pago.estado === 'confirmado') ? 'confirmado'
    : datos.pagos.every((pago) => pago.estado === 'eliminado') ? 'eliminado' : 'en_revision'] : null;
  const cerrar = () => { if (!enviando.current) onClose(); };
  const cambiar = (cargoId) => {
    solicitud.current = '';
    setSeleccion((previo) => previo.includes(cargoId) ? previo.filter((id) => id !== cargoId) : [...previo, cargoId]);
  };

  const registrar = async ({ metodoPago, fechaPago, referencia, comprobante, montoPagadoMoneda,
    montoPagadoBs, tasaAplicada, moneda: monedaPago, telefonoPago, cedulaTitular, notaPago, confirmarPago }) => {
    if (enviando.current) throw new Error('El pago ya esta en proceso.');
    montoPagadoMoneda = normalizarImportePagoCampania({ monto: montoPagadoMoneda, montoBs: montoPagadoBs,
      tasa: tasaAplicada, esperado: total, metodo: metodoPago });
    if (elegidos.length < 2 || !dinero(montoPagadoMoneda) || centimos(montoPagadoMoneda) !== centimos(total) || monedaPago !== moneda) {
      throw new Error('El pago debe cubrir los saldos completos seleccionados en la misma moneda.');
    }
    enviando.current = true;
    try {
      if (!solicitud.current) solicitud.current = window.crypto.randomUUID();
      const body = new FormData();
      const estado = !grupoId && !representante && confirmarPago ? 'confirmado' : 'en_revision';
      const campos = { solicitud_id: solicitud.current, moneda, monto_pagado: total.toFixed(2), fecha_pago: fechaPago,
        metodo_pago: metodoPago, referencia, estado, telefono_pago: telefonoPago || '', cedula_titular: cedulaTitular || '', nota: notaPago || '',
        cargos: JSON.stringify(elegidos.map((cargo) => ({ cargo: cargo._id, version: cargo.__v }))), ...(!grupoId ? { alumnoId } : {}) };
      for (const [campo, valor] of Object.entries(campos)) body.append(campo, String(valor));
      if (montoPagadoBs != null) body.append('monto_pagado_bs', Number(montoPagadoBs).toFixed(2));
      if (comprobante) body.append('comprobante', comprobante);
      const response = await fetch(ruta, { method: grupoId ? 'PATCH' : 'POST', headers: headers(), body, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar la transferencia. Reintenta la misma solicitud.');
      if (typeof data.repetida !== 'boolean' || (!grupoId && (!Array.isArray(data.pagos) || data.pagos.length !== elegidos.length
        || new Set(data.pagos.map((pago) => pago.cargo)).size !== elegidos.length
        || data.pagos.some((pago) => !pago._id || pago.agrupacion?.id !== solicitud.current || pago.moneda !== moneda || pago.estado !== estado
          || centimos(pago.agrupacion.monto_total) !== centimos(total)
          || !elegidos.some((cargo) => cargo._id === pago.cargo && cargo.campania._id === pago.campania
            && centimos(cargo.saldo_pendiente) === centimos(pago.monto_pagado)))
        || (montoPagadoBs == null ? data.pagos.some((pago) => pago.monto_pagado_bs != null)
          : data.pagos.some((pago) => !dinero(pago.monto_pagado_bs))
            || data.pagos.reduce((suma, pago) => suma + centimos(pago.monto_pagado_bs), 0) !== centimos(montoPagadoBs))))) {
        throw new Error('No se pudo verificar la transferencia. Reintenta o consulta el historial.');
      }
      resultado.current = { ...data, pago: data.pagos?.[0] || datos.pagos?.[0],
        mensaje: grupoId ? 'Transferencia actualizada' : estado === 'confirmado' ? 'Pago agrupado confirmado' : 'Pago agrupado reportado' };
    } finally { enviando.current = false; }
  };

  const retirar = async () => {
    if (enviando.current) return;
    enviando.current = true; setOcupado(true); setError('');
    try {
      const response = await fetch(ruta, { method: 'DELETE', headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ cargos: filas.map((cargo) => ({ cargo: cargo._id, version: cargo.__v })) }), cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo retirar la transferencia.');
      if (typeof data.repetida !== 'boolean') throw new Error('No se pudo verificar el retiro. Consulta el historial.');
      onSaved({ ...data, pago: { estado: 'eliminado' }, mensaje: 'Transferencia retirada' });
    } catch (err) { setError(err.message); }
    finally { enviando.current = false; setOcupado(false); }
  };

  if (formulario) return <ModalPago open onClose={() => { if (!enviando.current) setFormulario(false); }}
    pago={{ id: grupoId || 'campanias-agrupado', monto: total }} currencyCode={moneda} conceptoPago="campanias"
    disableCuotas allowPaymentConfirmation={!grupoId && !representante} preventCloseWhileSubmitting
    initialPayment={grupoId ? datos.pagos[0] : null}
    onSubmitPayment={registrar} onSuccess={() => onSaved(resultado.current)} />;

  if (pagina && !grupoId) return <Box sx={{ width: '100%', maxWidth: 1040, mx: 'auto', pb: 5 }}>
    <Button startIcon={<ArrowBackRoundedIcon />} onClick={cerrar} sx={{ mb: 2, px: 0, color: '#656b81', textTransform: 'none' }}>Volver</Button>
    <Typography component="h1" sx={{ color: '#11132f', fontSize: 26, fontWeight: 850, mb: 2.5 }}>Pagar varios atletas</Typography>
    {error && <Alert severity="error" sx={{ mb: 2 }} action={<Button color="inherit" onClick={() => setIntento((previo) => previo + 1)}>Reintentar</Button>}>{error}</Alert>}
    {!datos && !error && <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 3 }}><CircularProgress size={20} />Cargando cargos...</Box>}
    {datos && <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 2fr) minmax(270px, 0.9fr)' }, gap: { xs: 2.25, md: 2.75 }, alignItems: 'start' }}>
      <Box sx={{ minWidth: 0 }}>
        {new Set(datos.cargos.map((cargo) => cargo.moneda)).size > 1 && <TextField select label="Moneda del pago agrupado" size="small" value={moneda} sx={{ mb: 2, width: 180, maxWidth: '100%' }}
          onChange={(event) => { setMoneda(event.target.value); setSeleccion([]); solicitud.current = ''; }}>
          {[...new Set(datos.cargos.map((cargo) => cargo.moneda))].map((codigo) => <MenuItem key={codigo} value={codigo}>{codigo}</MenuItem>)}
        </TextField>}
        {!filas.length ? <Alert severity="info">No hay cargos disponibles para agrupar.</Alert> : <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 1.1 }}>
            <Typography sx={{ color: '#656b81', fontSize: 12.5, fontWeight: 650 }}>{elegidos.length} de {filas.length} seleccionados</Typography>
            <Button size="small" onClick={() => { solicitud.current = ''; setSeleccion(elegidos.length === filas.length ? [] : filas.slice(0, 100).map((cargo) => cargo._id)); }}
              sx={{ minWidth: 0, p: 0, color: '#111342', textTransform: 'none', fontSize: 12, fontWeight: 800 }}>
              {elegidos.length === filas.length ? 'Quitar todos' : 'Seleccionar todos'}
            </Button>
          </Box>
          <Box component="ul" aria-label="Cargos del pago agrupado" sx={{ display: 'grid', gap: 1.25, listStyle: 'none', p: 0, m: 0 }}>
            {filas.map((cargo) => <Paper component="li" key={cargo._id} variant="outlined"
              sx={{ px: { xs: 1.15, sm: 1.5 }, py: 1.2, borderRadius: 1.5, borderColor: seleccion.includes(cargo._id) ? '#111342' : '#d9dce7',
                boxShadow: seleccion.includes(cargo._id) ? '0 5px 14px rgba(17,19,66,0.06)' : 'none', bgcolor: '#fff', minWidth: 0 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: { xs: 0.7, sm: 1.1 }, alignItems: 'center' }}>
                <Checkbox checked={seleccion.includes(cargo._id)} onChange={() => cambiar(cargo._id)} disabled={!seleccion.includes(cargo._id) && seleccion.length >= 100}
                  inputProps={{ 'aria-label': `Seleccionar ${titularCargo(cargo)} - ${cargo.campania.nombre}` }}
                  sx={{ p: 0.4, color: '#c6cada', '&.Mui-checked': { color: '#ef3f78' } }} />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                  <Avatar variant="rounded" sx={{ width: 40, height: 40, flexShrink: 0, bgcolor: '#eceefe', color: '#111342', fontSize: 12, fontWeight: 850, borderRadius: 1.25 }}>
                    {`${String(cargo.nombres || '').charAt(0)}${String(cargo.apellidos || '').charAt(0)}`.toUpperCase()}
                  </Avatar>
                  <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                    <Typography sx={{ color: '#17182f', fontWeight: 800, fontSize: 13.5, lineHeight: 1.2 }}>{titularCargo(cargo)}</Typography>
                    {cargo.tipo_cobro === 'representante' && <Typography sx={{ fontSize: 12, color: '#656b81', mt: 0.5 }}>{etiquetaCobro(cargo)} · {detalleCobertura(cargo)}</Typography>}
                    <Typography sx={{ color: '#343950', fontSize: 12.5, fontWeight: 750, mt: 0.5 }}>{cargo.campania.nombre}</Typography>
                    {cargo.campania.descripcion && <Typography sx={{ color: '#656b81', fontSize: 12, lineHeight: 1.5, mt: 0.35, whiteSpace: 'pre-line' }}>{cargo.campania.descripcion}</Typography>}
                  </Box>
                </Box>
                <Typography sx={{ color: '#11132f', fontWeight: 850, fontSize: 16, textAlign: 'right', overflowWrap: 'anywhere', maxWidth: 140 }}>{formato(cargo.saldo_pendiente, moneda)}</Typography>
              </Box>
            </Paper>)}
          </Box>
        </>}
      </Box>
      <Paper component="aside" aria-label="Resumen del pago adicional" sx={{ position: { md: 'sticky' }, top: { md: 20 }, p: 2.25, borderRadius: 2,
        bgcolor: '#fff', border: '1px solid #e5e7ef', boxShadow: '0 10px 26px rgba(34,39,78,0.07)', minWidth: 0 }}>
        <Typography sx={{ color: '#777d92', fontSize: 10, fontWeight: 850, textTransform: 'uppercase', mb: 1.3 }}>Resumen</Typography>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
          <Typography sx={{ color: '#555b72', fontSize: 12 }}>Cobros adicionales ({elegidos.length})</Typography>
          <Typography sx={{ color: '#303449', fontSize: 12, fontWeight: 650, overflowWrap: 'anywhere' }}>{formato(total, moneda)}</Typography>
        </Box>
        <Divider sx={{ my: 1.6, borderColor: '#eceef3' }} />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 1.4 }}>
          <Typography sx={{ color: '#24273c', fontSize: 13, fontWeight: 750 }}>Total</Typography>
          <Typography sx={{ color: '#11132f', fontSize: 25, fontWeight: 900, overflowWrap: 'anywhere', minWidth: 0 }}>{formato(total, moneda)}</Typography>
        </Box>
        <Button fullWidth variant="contained" disabled={elegidos.length < 2} onClick={() => { solicitud.current = ''; setFormulario(true); }}
          sx={{ bgcolor: '#11132f', '&:hover': { bgcolor: '#25284f' }, textTransform: 'none', py: 1.05, borderRadius: 1.25, fontWeight: 800, fontSize: 12, boxShadow: 'none' }}>
          Continuar con el pago
        </Button>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0.55, mt: 1.25, color: '#8a90a3' }}>
          <LockOutlinedIcon sx={{ fontSize: 13 }} /><Typography sx={{ fontSize: 10.5 }}>Un solo comprobante</Typography>
        </Box>
      </Paper>
    </Box>}
  </Box>;

  return <><Dialog open onClose={cerrar} fullWidth maxWidth="md" aria-labelledby="pago-agrupado-campania-titulo"
    slotProps={{ paper: { sx: { borderRadius: 2, m: { xs: 1, sm: 3 }, width: { xs: 'calc(100% - 16px)', sm: 'calc(100% - 48px)' } } } }}>
    <DialogTitle component="div" id="pago-agrupado-campania-encabezado" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, fontSize: 20, fontWeight: 800, color: '#111342', px: 3, py: 2.5 }}>
      <Box component="span" sx={{ display: 'grid', placeItems: 'center', flexShrink: 0, width: 40, height: 40, bgcolor: '#eef0f7', borderRadius: 1.5 }}>
        <PaymentsOutlinedIcon sx={{ color: '#111342' }} />
      </Box><Box component="h2" id="pago-agrupado-campania-titulo" sx={{ flex: 1, minWidth: 0, m: 0, fontSize: 'inherit', fontWeight: 'inherit' }}>Pago agrupado</Box>
      <Tooltip title="Cerrar"><IconButton aria-label="Cerrar pago agrupado" onClick={cerrar} disabled={ocupado}><CloseRoundedIcon /></IconButton></Tooltip>
    </DialogTitle>
    <DialogContent sx={{ px: { xs: 2, sm: 3 }, pb: 3 }}>
      {error && <Alert severity="error" sx={{ mb: 2 }} action={!datos && <Button color="inherit" onClick={() => setIntento((previo) => previo + 1)}>Reintentar</Button>}>{error}</Alert>}
      {!datos && !error && <Box role="status" sx={{ display: 'flex', gap: 1, py: 3 }}><CircularProgress size={20} />Cargando cargos...</Box>}
      {datos && <>
        {!grupoId && <TextField select label="Moneda del pago agrupado" size="small" value={moneda} sx={{ my: 1, minWidth: 180 }}
          onChange={(event) => { setMoneda(event.target.value); setSeleccion([]); solicitud.current = ''; }}>
          {[...new Set(datos.cargos.map((cargo) => cargo.moneda))].concat(datos.cargos.length ? [] : ['USD']).map((codigo) => <MenuItem key={codigo} value={codigo}>{codigo}</MenuItem>)}
        </TextField>}
        {grupoId && <>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, flexWrap: 'wrap', gap: 2,
            bgcolor: '#f4f5fa', borderRadius: 2, p: { xs: 2, sm: 2.5 }, mb: 2.5 }}>
            <Box sx={{ minWidth: 0, overflowWrap: 'anywhere' }}>
              <Typography sx={{ color: '#70758a', fontSize: 12, mb: 0.5 }}>Total de la transferencia</Typography>
              <Typography sx={{ color: '#111342', fontSize: 28, lineHeight: 1.2, fontWeight: 850, fontVariantNumeric: 'tabular-nums' }}>{formato(total, moneda)}</Typography>
              {dinero(datos.pagos[0].agrupacion.monto_total_bs) && <Typography sx={{ color: '#656b81', fontSize: 13, mt: 0.75 }}>
                Importe en bolívares: {formato(datos.pagos[0].agrupacion.monto_total_bs, 'VES')}
              </Typography>}
            </Box>
            <Chip label={estadoGrupo.texto} sx={{ height: 28, bgcolor: estadoGrupo.fondo, color: estadoGrupo.color, fontSize: 12, fontWeight: 750, borderRadius: 1 }} />
          </Box>
          <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 2.25, m: 0, pb: 2.5, borderBottom: '1px solid #e8eaf1' }}>
            {[
              ['Método de pago', datos.pagos[0].metodo_pago],
              ['Referencia', datos.pagos[0].referencia],
              ['Fecha del pago', (datos.pagos[0].fecha_pago || '').split('-').reverse().join('/')]
            ].map(([etiqueta, valor]) => <Box key={etiqueta} sx={{ minWidth: 0 }}>
              <Typography component="dt" sx={{ color: '#7a8094', fontSize: 11, mb: 0.5 }}>{etiqueta}</Typography>
              <Typography component="dd" sx={{ m: 0, color: '#30364e', fontSize: 14, fontWeight: 700, overflowWrap: 'anywhere' }}>{valor || '--'}</Typography>
            </Box>)}
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1, mt: 2.5, mb: 0.5 }}>
            <Typography component="h3" sx={{ color: '#24283f', fontSize: 14, fontWeight: 800 }}>Reparto por atleta</Typography>
            <Typography sx={{ color: '#7a8094', fontSize: 12 }}>
              {new Set(filas.flatMap(alumnosDelCargo)).size} {new Set(filas.flatMap(alumnosDelCargo)).size === 1 ? 'atleta' : 'atletas'} · {filas.length} cargos
            </Typography>
          </Box>
        </>}
        {!filas.length && <Alert severity="info">No hay cargos disponibles para agrupar.</Alert>}
        <Box component="ul" aria-label="Cargos del pago agrupado" sx={{ p: 0, m: 0, listStyle: 'none' }}>
          {filas.map((cargo) => <Box component="li" key={cargo._id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid #e8eaf1', py: 1.75, minWidth: 0, '&:last-child': { borderBottom: grupoId ? 0 : undefined } }}>
            {grupoId && <Avatar variant="rounded" sx={{ width: 40, height: 40, flexShrink: 0, bgcolor: '#eceefe', color: '#111342', fontSize: 12, fontWeight: 850, borderRadius: 1.25 }}>
              {`${String(cargo.nombres || '').charAt(0)}${String(cargo.apellidos || '').charAt(0)}`.toUpperCase()}
            </Avatar>}
            {!grupoId && <Checkbox checked={seleccion.includes(cargo._id)} onChange={() => cambiar(cargo._id)}
              disabled={!seleccion.includes(cargo._id) && seleccion.length >= 100}
              inputProps={{ 'aria-label': `Seleccionar ${titularCargo(cargo)} - ${cargo.campania.nombre}` }} sx={{ color: '#737780', '&.Mui-checked': { color: '#626879' } }} />}
            <Box sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}><Typography sx={{ fontWeight: 700, fontSize: 14 }}>{titularCargo(cargo)}</Typography>
              {cargo.tipo_cobro === 'representante' && <Typography sx={{ fontSize: 12, color: '#656b81', mt: 0.5 }}>{etiquetaCobro(cargo)} · {detalleCobertura(cargo)}</Typography>}
              <Typography sx={{ color: '#343950', fontSize: 13, fontWeight: 750 }}>{cargo.campania.nombre}</Typography>
              {cargo.campania.descripcion && <Typography sx={{ color: '#656b81', fontSize: 12, lineHeight: 1.5, mt: 0.35, whiteSpace: 'pre-line' }}>{cargo.campania.descripcion}</Typography>}</Box>
            <Typography sx={{ color: '#111342', fontSize: 15, fontWeight: 800, maxWidth: '42%', overflowWrap: 'anywhere', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formato(grupoId
              ? datos.pagos.find((pago) => pago.cargo === cargo._id).monto_pagado : cargo.saldo_pendiente, moneda)}</Typography>
          </Box>)}
        </Box>
        {!grupoId && <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 1, mt: 2 }}>
          <Typography sx={{ color: '#626879', fontSize: 14 }}>{elegidos.length} cargos</Typography>
          <Typography sx={{ fontWeight: 800, fontSize: 18, overflowWrap: 'anywhere', maxWidth: '100%' }}>Total: {formato(total, moneda)}</Typography>
        </Box>}
      </>}
    </DialogContent>
    <DialogActions sx={{ flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: { xs: 'stretch', sm: 'center' }, gap: 1, p: { xs: 2, sm: 2.5 }, borderTop: '1px solid #e8eaf1', '& > :not(style) ~ :not(style)': { ml: 0 } }}>
      {!grupoId && <Button onClick={cerrar} disabled={ocupado} sx={{ color: '#626879', textTransform: 'none', minHeight: 40 }}>Cancelar</Button>}
      {grupoId && datos?.puede_corregir && <Button color="error" startIcon={<DeleteOutlineRoundedIcon />} disabled={ocupado} onClick={() => setRetirando(true)} sx={{ textTransform: 'none', minHeight: 40 }}>Retirar transferencia</Button>}
      {(!grupoId || datos?.puede_corregir) && <Button variant="contained" startIcon={grupoId ? <EditRoundedIcon /> : <PaymentsOutlinedIcon />}
        disabled={!datos || elegidos.length < 2 || ocupado} onClick={() => { solicitud.current = ''; setFormulario(true); }}
        sx={{ bgcolor: '#111342', '&:hover': { bgcolor: '#25284f' }, boxShadow: 'none', textTransform: 'none', minHeight: 40 }}>{grupoId ? 'Corregir transferencia' : 'Continuar al pago'}</Button>}
    </DialogActions>
  </Dialog>
  <Dialog open={retirando} onClose={() => { if (!ocupado) setRetirando(false); }} fullWidth maxWidth="xs" aria-labelledby="retirar-grupo-campania-titulo" slotProps={{ paper: { role: 'alertdialog' } }}>
    <DialogTitle id="retirar-grupo-campania-titulo">Retirar transferencia agrupada</DialogTitle>
    <DialogContent>{error && <Alert severity="error">{error}</Alert>}<Typography>Se retiraran los {filas.length} repartos pendientes. El historial se conservara.</Typography></DialogContent>
    <DialogActions><Button autoFocus disabled={ocupado} onClick={() => setRetirando(false)}>Cancelar</Button>
      <Button color="error" disabled={ocupado} onClick={retirar}>{ocupado ? 'Retirando...' : 'Retirar'}</Button></DialogActions>
  </Dialog></>;
}

export default CampaniaPagoAgrupadoDialog;