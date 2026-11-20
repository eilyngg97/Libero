import React, { useEffect, useRef, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, MenuItem, TextField, Tooltip, Typography } from '@mui/material';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded';
import ModalPago, { buildMetodosFromConfig } from './ModalPago';
import EstadoPagoChip from './EstadoPagoChip';
import CampaniaPagoAgrupadoDialog from './CampaniaPagoAgrupadoDialog';
import PagoTransaccionDetalle, { PagoDetalleEncabezado, estiloEditarPago, estiloGuardarPago,
  HistorialTransacciones, FilaHistorialTransaccion, DatoHistorialTransaccion } from './PagoTransaccionDetalle';
import { obtenerTasaOficialPorFecha, obtenerTasaEuroOficialPorFecha } from '../utils/dolarHistorico';
import { normalizarImportePagoCampania } from '../utils/campaniaMontos';

const API = process.env.REACT_APP_API_URL || window.location.origin;
const centimos = (monto) => Math.round(monto * 100);
const dinero = (monto) => typeof monto === 'number' && Number.isFinite(monto) && monto >= 0;
const formato = (monto, moneda) => new Intl.NumberFormat('es-VE', { style: 'currency', currency: moneda }).format(monto);
const portalRegistro = (pago) => pago.registrado_por?.rol === 'usuario' ? 'Portal usuario'
  : ['admin', 'super_admin'].includes(pago.registrado_por?.rol) ? 'Portal admin' : 'No disponible';
const estadoCargo = (cargo) => cargo.modalidad === 'no_aplica' ? 'no_aplica'
  : cargo.saldo_pendiente === 0 ? 'pagado' : cargo.saldo_pendiente === cargo.monto ? 'pendiente' : 'abono';

function CampaniaPagoDialog({ campania, fila, modo = 'pago', representante = false, onClose, onSaved }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [intento, setIntento] = useState(0);
  const [confirmando, setConfirmando] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [comprobante, setComprobante] = useState(null);
  const [detalleId, setDetalleId] = useState('');
  const [editando, setEditando] = useState(false);
  const [draft, setDraft] = useState({});
  const [metodos, setMetodos] = useState([]);
  const [tasaEdicion, setTasaEdicion] = useState(null);
  const [cargandoEdicion, setCargandoEdicion] = useState(false);
  const [archivoEdicion, setArchivoEdicion] = useState(null);
  const [eliminando, setEliminando] = useState(false);
  const [descartar, setDescartar] = useState(false);
  const [grupoActivo, setGrupoActivo] = useState('');
  const solicitudEdicion = useRef('');
  const enviando = useRef(false);
  const solicitud = useRef('');
  const resultado = useRef(null);
  const controllerPago = useRef(null);
  const ruta = `${API}/api/campanias-cobro/${campania._id}/cargos/${fila._id}/pagos`;
  const cerrar = () => { if (!enviando.current) { if (editando) setDescartar(true); else onClose(); } };
  const detalle = datos?.pagos.find((pago) => pago._id === detalleId) || datos?.pagos[0];
  const ultimo = detalle && detalle._id === datos?.pagos[0]?._id;
  const puedeCorregir = (pago) => Boolean(pago && !pago.agrupacion && pago._id === datos?.pagos[0]?._id
    && (campania.estado === 'abierta' || (!representante && datos?.puede_corregir === true))
    && (!representante || (pago.estado === 'en_revision' && pago.puede_corregir === true)));
  const enBs = ['Pago movil', 'Transferencia'].includes(editando ? draft.metodo_pago : detalle?.metodo_pago);
  const headers = () => {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Tu sesion no esta disponible. Inicia sesion nuevamente.');
    return { Authorization: `Bearer ${token}` };
  };

  useEffect(() => () => controllerPago.current?.abort(), []);
  useEffect(() => {
    if (!editando) return;
    const controller = new AbortController();
    const cargar = async () => {
      setCargandoEdicion(true); setTasaEdicion(null);
      try {
        const response = await fetch(`${API}/api/configuracion/pagos`, { headers: headers(), signal: controller.signal });
        const config = await response.json();
        if (!response.ok) throw new Error(config.error || 'No se pudo cargar la configuracion de pagos.');
        const opciones = buildMetodosFromConfig(config, 'campanias').filter((metodo) => !metodo.adicional || metodo.monedas.includes(campania.moneda));
        const tasa = enBs ? await (campania.moneda === 'EUR' ? obtenerTasaEuroOficialPorFecha : obtenerTasaOficialPorFecha)(draft.fecha_pago) : null;
        if (enBs && (!Number.isFinite(Number(tasa)) || Number(tasa) <= 0)) throw new Error('No se pudo obtener la tasa oficial de la fecha.');
        if (!controller.signal.aborted) { setMetodos(opciones); setTasaEdicion(tasa == null ? null : Number(tasa)); }
      } catch (err) { if (!controller.signal.aborted) setError(err.message); }
      finally { if (!controller.signal.aborted) setCargandoEdicion(false); }
    };
    cargar();
    return () => controller.abort();
  }, [editando, draft.fecha_pago, enBs, campania.moneda]);
  useEffect(() => () => { if (comprobante?.url) URL.revokeObjectURL(comprobante.url); }, [comprobante]);
  useEffect(() => {
    const controller = new AbortController();
    setDatos(null); setError('');
    const cargar = async () => {
      try {
        const response = await fetch(ruta, { headers: headers(), cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo cargar el historial.');
        const { cargo, pagos, totales } = data;
        if (cargo?._id !== fila._id || cargo.campania !== campania._id || cargo.alumno !== fila.alumno
          || cargo.moneda !== campania.moneda || !Number.isInteger(cargo.__v) || cargo.__v < 0
          || !dinero(cargo.monto) || cargo.monto !== fila.monto || !dinero(cargo.saldo_pendiente)
          || cargo.saldo_pendiente > cargo.monto || cargo.estado !== estadoCargo(cargo) || typeof cargo.permitir_abonos !== 'boolean'
          || !Array.isArray(pagos) || new Set(pagos.map((pago) => pago?._id)).size !== pagos.length
          || pagos.some((pago) => !pago?._id || pago.cargo !== cargo._id || pago.campania !== campania._id
            || pago.moneda !== cargo.moneda || !dinero(pago.monto_pagado) || pago.monto_pagado <= 0
            || !['en_revision', 'confirmado'].includes(pago.estado))
          || !totales || ['confirmado', 'en_revision', 'saldo_pendiente', 'disponible'].some((campo) => !dinero(totales[campo]))
          || centimos(totales.confirmado) + centimos(cargo.saldo_pendiente) !== centimos(cargo.monto)
          || totales.saldo_pendiente !== cargo.saldo_pendiente
          || centimos(totales.disponible) + centimos(totales.en_revision) !== centimos(cargo.saldo_pendiente)
          || ['confirmado', 'en_revision'].some((estado) => centimos(totales[estado]) !== pagos.filter((pago) => pago.estado === estado)
            .reduce((suma, pago) => suma + centimos(pago.monto_pagado), 0))) throw new Error('No se pudo verificar el saldo y el historial.');
        if (!controller.signal.aborted) setDatos(data);
      } catch (err) { if (!controller.signal.aborted) setError(err.message || 'No se pudo cargar el historial.'); }
    };
    cargar();
    return () => controller.abort();
  }, [ruta, campania._id, campania.moneda, fila._id, fila.alumno, fila.monto, intento]);

  const validarRespuesta = (data, estado, importe, confirmarExistente = false) => {
    const { cargo, pago } = data;
    if (cargo?._id !== fila._id || cargo.campania !== campania._id || cargo.alumno !== fila.alumno
      || cargo.moneda !== campania.moneda || cargo.monto !== datos.cargo.monto || !dinero(cargo.saldo_pendiente)
      || cargo.saldo_pendiente > cargo.monto || cargo.estado !== estadoCargo(cargo)
      || !Number.isInteger(cargo.__v) || cargo.__v < datos.cargo.__v + (data.repetida ? 0 : 1)
      || typeof data.repetida !== 'boolean' || !pago?._id || pago.cargo !== fila._id || pago.campania !== campania._id
      || pago.moneda !== campania.moneda || pago.monto_pagado !== importe || pago.estado !== estado
      || (representante ? pago.registrado_por?.rol !== 'usuario' : !pago.registrado_por?.id)
      || (estado === 'confirmado' && (!pago.confirmado_por?.id || !pago.confirmado_en))
      || (confirmarExistente ? pago._id !== confirmando : pago.solicitud_id !== solicitud.current)
      || (!data.repetida && centimos(cargo.saldo_pendiente) !== centimos(datos.cargo.saldo_pendiente)
        - (estado === 'confirmado' ? centimos(importe) : 0))) throw new Error('No se pudo verificar el pago. Reintenta la misma solicitud o consulta el historial.');
  };

  const registrar = async ({ metodoPago, fechaPago, referencia, comprobante: archivo, montoPagadoMoneda,
    montoPagadoBs, tasaAplicada, moneda, telefonoPago, cedulaTitular, notaPago, confirmarPago }) => {
    if (enviando.current) throw new Error('El pago ya esta en proceso.');
    montoPagadoMoneda = normalizarImportePagoCampania({ monto: montoPagadoMoneda, montoBs: montoPagadoBs,
      tasa: tasaAplicada, esperado: datos.totales.disponible, metodo: metodoPago });
    if (!dinero(montoPagadoMoneda) || montoPagadoMoneda <= 0 || moneda !== datos.cargo.moneda
      || centimos(montoPagadoMoneda) > centimos(datos.totales.disponible)
      || (!datos.cargo.permitir_abonos && centimos(montoPagadoMoneda) !== centimos(datos.cargo.saldo_pendiente))) {
      throw new Error('El importe supera el saldo disponible o la campana no permite abonos.');
    }
    enviando.current = true;
    const controller = new AbortController();
    controllerPago.current = controller;
    try {
      if (!solicitud.current) solicitud.current = window.crypto.randomUUID();
      const body = new FormData();
      const campos = { solicitud_id: solicitud.current, version: datos.cargo.__v, moneda, monto_pagado: montoPagadoMoneda.toFixed(2),
        fecha_pago: fechaPago, metodo_pago: metodoPago, referencia, estado: !representante && confirmarPago ? 'confirmado' : 'en_revision',
        telefono_pago: telefonoPago || '', cedula_titular: cedulaTitular || '', nota: notaPago || '' };
      for (const [campo, valor] of Object.entries(campos)) body.append(campo, String(valor));
      if (montoPagadoBs != null) body.append('monto_pagado_bs', Number(montoPagadoBs).toFixed(2));
      if (archivo) body.append('comprobante', archivo);
      const response = await fetch(ruta, { method: 'POST', headers: headers(), body, signal: controller.signal, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo registrar el pago. Reintenta la misma solicitud.');
      validarRespuesta(data, campos.estado, montoPagadoMoneda);
      resultado.current = data;
    } finally { enviando.current = false; }
  };

  const confirmar = async () => {
    if (enviando.current || representante) return;
    enviando.current = true; setOcupado(true); setError('');
    try {
      const pago = datos.pagos.find((item) => item._id === confirmando);
      const response = await fetch(`${ruta}/${pago._id}/confirmar`, { method: 'POST', headers: headers(), cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo confirmar el pago.');
      validarRespuesta(data, 'confirmado', pago.monto_pagado, true);
      setConfirmando(''); setIntento((valor) => valor + 1);
      onSaved(data, false);
    } catch (err) { setError(err.message || 'No se pudo confirmar el pago.'); }
    finally { enviando.current = false; setOcupado(false); }
  };

  const verComprobante = async (pago) => {
    try {
      if (!pago.comprobante_url || !pago._id) throw new Error('El comprobante no es valido.');
      const response = await fetch(`${ruta}/${encodeURIComponent(pago._id)}/comprobante`, { headers: headers(), cache: 'no-store' });
      if (!response.ok) throw new Error('No se pudo abrir el comprobante.');
      setComprobante({ url: URL.createObjectURL(await response.blob()), pdf: pago.comprobante_url.endsWith('.pdf') });
    } catch (err) { setError(err.message); }
  };

  const empezarEdicion = (pago = detalle) => {
    if (!puedeCorregir(pago) || enviando.current) return;
    setDraft({ metodo_pago: pago.metodo_pago, monto_pagado: String(pago.monto_pagado),
      monto_pagado_bs: pago.monto_pagado_bs == null ? '' : String(pago.monto_pagado_bs), fecha_pago: pago.fecha_pago,
      referencia: pago.referencia, telefono_pago: pago.telefono_pago || '', cedula_titular: pago.cedula_titular || '', nota: pago.nota || '' });
    setArchivoEdicion(null); setError(''); solicitudEdicion.current = ''; setEditando(true);
  };
  const cambiar = (campo, valor) => { solicitudEdicion.current = ''; setError(''); setDraft((previo) => ({ ...previo, [campo]: valor })); };
  const importeEdicion = enBs ? Math.round(Number(draft.monto_pagado_bs) * 100 / tasaEdicion) / 100 : Number(draft.monto_pagado);
  const importeAplicadoEdicion = normalizarImportePagoCampania({ monto: importeEdicion,
    montoBs: Number(draft.monto_pagado_bs), tasa: tasaEdicion,
    esperado: datos && detalle ? (centimos(datos.totales.disponible) + centimos(detalle.monto_pagado)) / 100 : null,
    metodo: draft.metodo_pago });
  const corregir = async (borrar = false) => {
    if (enviando.current || !puedeCorregir(detalle)) return;
    const importe = borrar ? 0 : importeAplicadoEdicion;
    if (!borrar && (!dinero(importe) || importe <= 0 || (enBs && !tasaEdicion) || cargandoEdicion)) {
      setError('Revisa el importe y la tasa del pago.'); return;
    }
    const anterior = detalle;
    enviando.current = true; setOcupado(true); setError('');
    const controller = new AbortController(); controllerPago.current = controller;
    try {
      let body;
      let cabeceras = headers();
      if (borrar) { body = JSON.stringify({ version: datos.cargo.__v }); cabeceras = { ...cabeceras, 'Content-Type': 'application/json' }; }
      else {
        if (!solicitudEdicion.current) solicitudEdicion.current = window.crypto.randomUUID();
        body = new FormData();
        const campos = { ...draft, monto_pagado: importe.toFixed(2), estado: anterior.estado,
          moneda: datos.cargo.moneda, version: datos.cargo.__v, solicitud_id: solicitudEdicion.current };
        delete campos.monto_pagado_bs;
        if (enBs) campos.monto_pagado_bs = Number(draft.monto_pagado_bs).toFixed(2);
        for (const [campo, valor] of Object.entries(campos)) body.append(campo, String(valor));
        if (archivoEdicion) body.append('comprobante', archivoEdicion);
      }
      const response = await fetch(`${ruta}/${anterior._id}`, { method: borrar ? 'DELETE' : 'PATCH', headers: cabeceras,
        body, signal: controller.signal, cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo corregir el pago.');
      const saldoEsperado = centimos(datos.cargo.saldo_pendiente)
        + (anterior.estado === 'confirmado' ? centimos(anterior.monto_pagado) - centimos(importe) : 0);
      if (data.cargo?._id !== fila._id || data.cargo.campania !== campania._id || data.cargo.alumno !== fila.alumno
        || data.cargo.moneda !== datos.cargo.moneda || data.cargo.monto !== datos.cargo.monto
        || !dinero(data.cargo.saldo_pendiente) || data.cargo.saldo_pendiente > data.cargo.monto
        || data.cargo.estado !== estadoCargo(data.cargo) || !Number.isInteger(data.cargo.__v)
        || data.cargo.__v < datos.cargo.__v + (data.repetida ? 0 : 1) || typeof data.repetida !== 'boolean'
        || data.pago?._id !== anterior._id || data.pago.cargo !== fila._id || data.pago.campania !== campania._id
        || data.pago.moneda !== datos.cargo.moneda || data.pago.estado !== (borrar ? 'eliminado' : anterior.estado)
        || (!borrar && data.pago.monto_pagado !== importe)
        || (borrar && !representante && (!data.pago.eliminado_por?.id || !data.pago.eliminado_en))
        || (!data.repetida && centimos(data.cargo.saldo_pendiente) !== saldoEsperado)) {
        throw new Error('No se pudo verificar la correccion. Reintenta o consulta el historial.');
      }
      setEditando(false); setEliminando(false); setDetalleId(''); setArchivoEdicion(null);
      setIntento((valor) => valor + 1); onSaved(data, false);
    } catch (err) { if (!controller.signal.aborted) setError(err.message || 'No se pudo corregir el pago.'); }
    finally { enviando.current = false; setOcupado(false); }
  };
  const campo = (label, nombre, tipo = 'text', extra = {}) => editando
    ? <TextField fullWidth variant="standard" size="small" type={tipo} value={draft[nombre] || ''} disabled={ocupado}
      inputProps={{ 'aria-label': label, ...(tipo === 'number' ? { min: 0.01, step: 0.01 } : {}), ...extra }}
      onChange={(event) => cambiar(nombre, event.target.value)} /> : detalle?.[nombre] || '-';
  const importeDetalle = editando && dinero(importeEdicion) ? importeEdicion : detalle?.monto_pagado;
  const equivalente = (importe) => <Typography sx={{ mt: 0.55, fontSize: 12, color: '#64748b', fontWeight: 700 }}>
    {`Equivalente ${campania.moneda}: ${dinero(importe) ? `${campania.moneda === 'EUR' ? '\u20ac' : '$'}${importe.toFixed(2)} ${campania.moneda}` : '-'}`}
  </Typography>;

  if (grupoActivo) return <CampaniaPagoAgrupadoDialog grupoId={grupoActivo} representante={representante}
    onClose={() => setGrupoActivo('')} onSaved={(data) => { setGrupoActivo(''); setIntento((valor) => valor + 1); onSaved(data, false); }} />;

  if (modo === 'pago' && campania.estado === 'abierta' && datos && !error && datos.totales.disponible > 0) return <ModalPago open onClose={cerrar}
    pago={{ id: datos.cargo._id, monto: datos.totales.disponible }} currencyCode={datos.cargo.moneda} conceptoPago="campanias"
    disableCuotas allowPartialPayment={datos.cargo.permitir_abonos} allowPaymentConfirmation={!representante} preventCloseWhileSubmitting
    onSubmitPayment={registrar} onSuccess={() => onSaved(resultado.current)} />;

  return <><Dialog open onClose={cerrar} fullWidth maxWidth={false} aria-labelledby="historial-campania-titulo"
    PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden', width: { xs: 'calc(100% - 16px)', sm: 'calc(100% - 32px)', md: 'calc(100% - 48px)' },
      maxWidth: '1400px', m: { xs: 1, sm: 2, md: 3 } } }}>
    <PagoDetalleEncabezado id="historial-campania-titulo" nombre={`${fila.nombres} ${fila.apellidos}`} onClose={cerrar} disabled={ocupado} />
    <DialogContent sx={{ pt: '24px !important', bgcolor: '#f3f5fb' }}>
      {error && <Alert severity="error" action={!datos && <Button color="inherit" onClick={() => setIntento((valor) => valor + 1)}>Reintentar</Button>}>{error}</Alert>}
      {!datos && !error && <Box role="status" sx={{ display: 'flex', gap: 1, py: 3 }}><CircularProgress size={20} />Cargando historial...</Box>}
      {datos && <>
        {!datos.pagos.length && <Alert severity="info">No hay pagos registrados.</Alert>}
        {detalle?.agrupacion && <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 2 }}>
          <Typography sx={{ fontSize: 14, color: '#475569', overflowWrap: 'anywhere' }}>
            Transferencia agrupada: {formato(detalle.agrupacion.monto_total, detalle.moneda)}
            {detalle.agrupacion.monto_total_bs != null ? ` / Bs ${detalle.agrupacion.monto_total_bs.toFixed(2)}` : ''}
          </Typography>
          <Button startIcon={<VisibilityOutlinedIcon />} onClick={() => setGrupoActivo(detalle.agrupacion.id)} sx={{ color: '#626879' }}>Ver transferencia</Button>
        </Box>}
        {detalle && <PagoTransaccionDetalle titulo={ultimo ? '\u00daltimo Pago Registrado' : 'Detalle del pago'} acciones={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
            <EstadoPagoChip estado={detalle.estado === 'confirmado' ? 'pagado' : 'en revision'} label={detalle.estado === 'confirmado' ? 'Confirmado' : 'En revisi\u00f3n'} />
            {puedeCorregir(detalle) && <>
              <Button startIcon={<EditRoundedIcon />} variant={editando ? 'outlined' : 'contained'} disabled={ocupado}
                onClick={() => { if (editando) setEditando(false); else empezarEdicion(); }}
                sx={estiloEditarPago(editando)}>{editando ? 'Cancelar' : 'Editar'}</Button>
              <Tooltip title="Eliminar ultimo pago"><span><IconButton aria-label="Eliminar ultimo pago" disabled={ocupado || editando}
                onClick={() => { setError(''); setEliminando(true); }} sx={{ color: '#d32727', bgcolor: '#fdecec', borderRadius: 1 }}><DeleteOutlineRoundedIcon /></IconButton></span></Tooltip>
            </>}
          </Box>} campos={[
          ['Metodo de pago', editando ? <TextField select fullWidth variant="standard" value={draft.metodo_pago} disabled={ocupado || cargandoEdicion}
            SelectProps={{ inputProps: { 'aria-label': 'Metodo de pago' } }} onChange={(event) => cambiar('metodo_pago', event.target.value)}>
            {[...new Set([draft.metodo_pago, ...metodos.map((metodo) => metodo.nombre)])].map((nombre) => <MenuItem key={nombre} value={nombre}>{nombre}</MenuItem>)}</TextField> : detalle.metodo_pago],
          [enBs ? 'Monto pagado (Bs)' : `Monto pagado (${datos.cargo.moneda})`, <>{editando
            ? campo(enBs ? 'Monto pagado (Bs)' : `Monto pagado (${datos.cargo.moneda})`, enBs ? 'monto_pagado_bs' : 'monto_pagado', 'number')
            : formato(enBs ? detalle.monto_pagado_bs : detalle.monto_pagado, enBs ? 'VES' : datos.cargo.moneda)}{equivalente(importeDetalle)}</>],
          [enBs ? 'Monto esperado (Bs)' : `Monto esperado (${datos.cargo.moneda})`, <>{enBs
            ? (editando ? tasaEdicion : detalle.tasa) ? formato(datos.cargo.monto * (editando ? tasaEdicion : detalle.tasa), 'VES') : '-'
            : formato(datos.cargo.monto, datos.cargo.moneda)}{equivalente(datos.cargo.monto)}</>],
          ['Fecha de pago', campo('Fecha de pago', 'fecha_pago', 'date')],
          ['Tasa aplicada', enBs ? cargandoEdicion ? 'Actualizando...' : `${editando ? tasaEdicion ?? '-' : detalle.tasa ?? '-'} Bs/${datos.cargo.moneda}` : 'No aplica'],
          ['Referencia', campo('Referencia', 'referencia', 'text', { maxLength: 100 })],
          ['Telefono de pago', campo('Telefono de pago', 'telefono_pago', 'text', { maxLength: 15 })],
          ['Cedula de pago', campo('Cedula de pago', 'cedula_titular', 'text', { maxLength: 20 })],
          ['Registrado por', portalRegistro(detalle)],
          ['Nota', editando ? <TextField fullWidth multiline minRows={2} variant="standard" value={draft.nota} disabled={ocupado}
            inputProps={{ 'aria-label': 'Nota', maxLength: 500 }} onChange={(event) => cambiar('nota', event.target.value)} /> : detalle.nota || '-'],
          ['Comprobante', <>
            {detalle.comprobante_url ? <Button startIcon={<AttachFileRoundedIcon />} onClick={() => verComprobante(detalle)}>Ver comprobante</Button> : 'Sin comprobante'}
            {editando && <Box><Button component="label" startIcon={<CloudUploadRoundedIcon />} disabled={ocupado}>Subir nuevo comprobante
              <input hidden type="file" aria-label="Nuevo comprobante" accept=".jpg,.jpeg,.png,.webp,.pdf" disabled={ocupado}
                onChange={(event) => { solicitudEdicion.current = ''; setArchivoEdicion(event.target.files?.[0] || null); }} /></Button>
              {archivoEdicion && <Typography sx={{ fontSize: 12, overflowWrap: 'anywhere' }}>{archivoEdicion.name}</Typography>}</Box>}
          </>]
        ]}>
          {editando && dinero(importeEdicion) && importeAplicadoEdicion !== importeEdicion && <Alert severity="info" sx={{ mt: 2 }}>
            Se cubre el saldo con tolerancia de Bs 100. Se conserva el monto real recibido en Bs.
          </Alert>}
          {editando && <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}><Button variant="contained"
            sx={estiloGuardarPago} disabled={ocupado || cargandoEdicion || (enBs && !tasaEdicion)} onClick={() => corregir()}>{ocupado ? 'Guardando...' : 'Guardar cambios'}</Button></Box>}
        </PagoTransaccionDetalle>}
        {datos.pagos.length > 0 && <HistorialTransacciones total={datos.pagos.length}>
          {datos.pagos.map((pago, indice) => <FilaHistorialTransaccion key={pago._id}>
            <DatoHistorialTransaccion label={`Pago #${indice + 1}`} color="#0b2a57" fuerte>{pago.metodo_pago}</DatoHistorialTransaccion>
            <DatoHistorialTransaccion label="Monto" color="#0b2a57" fuerte>
              <Typography sx={{ fontWeight: 900 }}>{pago.monto_pagado_bs != null ? `Bs ${pago.monto_pagado_bs.toFixed(2)} / ` : ''}{`${pago.moneda === 'EUR' ? '\u20ac' : '$'}${pago.monto_pagado.toFixed(2)} ${pago.moneda}`}</Typography>
              {pago.tasa && <Typography sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, mt: 0.2 }}>Esperado: Bs {(datos.cargo.monto * pago.tasa).toFixed(2)}</Typography>}
            </DatoHistorialTransaccion>
            <DatoHistorialTransaccion label="Fecha">{new Date(`${pago.fecha_pago}T12:00:00Z`).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}</DatoHistorialTransaccion>
            <DatoHistorialTransaccion label="Tasa" fuerte>{pago.tasa ? `${pago.tasa.toFixed(2)} Bs/${pago.moneda}` : 'No aplica'}</DatoHistorialTransaccion>
            <DatoHistorialTransaccion label="Referencia" color="#4c6690" fuerte>{pago.referencia}
              <Typography sx={{ color: '#334155', fontWeight: 700, mt: 0.25, fontSize: 12 }}>Tel: {pago.telefono_pago || '-'}</Typography>
              <Typography sx={{ color: '#334155', fontWeight: 700, mt: 0.25, fontSize: 12 }}>Ced: {pago.cedula_titular || '-'}</Typography>
              <Typography sx={{ color: '#334155', fontWeight: 700, mt: 0.35, fontSize: 12 }}>Registrado por: {portalRegistro(pago)}</Typography>
            </DatoHistorialTransaccion>
            <DatoHistorialTransaccion label="Nota" fuerte>
              <Typography sx={{ color: '#334155', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: { xs: '100%', md: 180 } }} title={pago.nota || '-'}>{pago.nota || '-'}</Typography>
              <EstadoPagoChip data-testid={`estado-pago-${pago._id}`} estado={pago.estado === 'confirmado' ? 'pagado' : 'en revision'}
                label={pago.estado === 'confirmado' ? 'Confirmado' : 'En revisi\u00f3n'} />
            </DatoHistorialTransaccion>
            <Box sx={{ display: 'flex', gap: 0.6, flexWrap: 'nowrap', justifyContent: { xs: 'flex-start', md: 'flex-end' }, alignItems: 'center', height: '100%' }}>
              <Tooltip title="Ver detalle del pago"><IconButton size="small" aria-label={`Ver detalle del pago ${pago.referencia}`} disabled={ocupado || editando}
                onClick={() => setDetalleId(pago._id)} sx={{ bgcolor: '#e0f1fb', '&:hover': { bgcolor: '#d1e9f8' }, color: '#0a78b8' }}><VisibilityOutlinedIcon fontSize="small" /></IconButton></Tooltip>
              {pago.comprobante_url && <Tooltip title="Ver comprobante"><IconButton size="small" aria-label={`Ver comprobante de ${pago.referencia}`} onClick={() => verComprobante(pago)}
                sx={{ bgcolor: '#f3f4f6', '&:hover': { bgcolor: '#e9edf3' }, color: '#4b5563' }}><AttachFileRoundedIcon fontSize="small" /></IconButton></Tooltip>}
              {puedeCorregir(pago) && <>
                <Tooltip title="Editar pago"><IconButton size="small" aria-label={`Editar pago ${pago.referencia}`} disabled={ocupado || editando}
                  onClick={() => { setDetalleId(pago._id); empezarEdicion(pago); }} sx={{ bgcolor: '#e0f1fb', '&:hover': { bgcolor: '#d1e9f8' }, color: '#0a78b8' }}><EditRoundedIcon fontSize="small" /></IconButton></Tooltip>
                <Tooltip title="Eliminar pago"><IconButton size="small" aria-label={`Eliminar pago ${pago.referencia}`} disabled={ocupado || editando}
                  onClick={() => { setDetalleId(pago._id); setError(''); setEliminando(true); }} sx={{ bgcolor: '#fdecec', '&:hover': { bgcolor: '#fbdede' }, color: '#d32727' }}><DeleteOutlineRoundedIcon fontSize="small" /></IconButton></Tooltip>
              </>}
              {!representante && pago.estado === 'en_revision' && campania.estado === 'abierta' && <Tooltip title="Confirmar pago"><IconButton size="small" disabled={ocupado || editando}
                aria-label={`Confirmar pago ${pago.referencia}`} onClick={() => setConfirmando(pago._id)}><CheckCircleOutlineRoundedIcon fontSize="small" /></IconButton></Tooltip>}
            </Box>
          </FilaHistorialTransaccion>)}
        </HistorialTransacciones>}
      </>}
    </DialogContent><DialogActions sx={{ px: 3, pb: 2.25, bgcolor: '#f3f5fb', justifyContent: 'flex-end' }}>
      {!representante && detalle?.estado === 'en_revision' && campania.estado === 'abierta' && <Button variant="contained"
        disabled={ocupado || editando} onClick={() => setConfirmando(detalle._id)}
        sx={{ bgcolor: '#0e1334', color: '#fff', boxShadow: 'none', '&:hover': { bgcolor: '#0b102b', boxShadow: 'none' },
          borderRadius: 999, px: 2.2, fontWeight: 800 }}>Confirmar</Button>}
    </DialogActions>
  </Dialog>
  <Dialog open={eliminando} onClose={() => { if (!enviando.current) setEliminando(false); }} fullWidth maxWidth="xs"
    aria-labelledby="eliminar-pago-campania-titulo" PaperProps={{ role: 'alertdialog' }}>
    <DialogTitle id="eliminar-pago-campania-titulo">Eliminar ultimo pago</DialogTitle>
    <DialogContent>{error && <Alert severity="error">{error}</Alert>}<Typography>{detalle?.referencia}</Typography>
      <Typography>Se eliminara este pago del historial y se recalculara el saldo del cargo.</Typography></DialogContent>
    <DialogActions><Button autoFocus disabled={ocupado} onClick={() => setEliminando(false)}>Cancelar</Button>
      <Button color="error" disabled={ocupado} onClick={() => corregir(true)}>{ocupado ? 'Eliminando...' : 'Eliminar pago'}</Button></DialogActions>
  </Dialog>
  <Dialog open={descartar} onClose={() => setDescartar(false)} fullWidth maxWidth="xs" aria-labelledby="descartar-edicion-pago-titulo" PaperProps={{ role: 'alertdialog' }}>
    <DialogTitle id="descartar-edicion-pago-titulo">Descartar cambios</DialogTitle><DialogContent>Los cambios sin guardar se perderan.</DialogContent>
    <DialogActions><Button autoFocus onClick={() => setDescartar(false)}>Seguir editando</Button><Button onClick={onClose}>Descartar</Button></DialogActions>
  </Dialog>
  <Dialog open={Boolean(confirmando)} onClose={() => { if (!enviando.current) setConfirmando(''); }} fullWidth maxWidth="xs"
    aria-labelledby="confirmar-pago-campania-titulo" PaperProps={{ role: 'alertdialog' }}>
    <DialogTitle id="confirmar-pago-campania-titulo" sx={{ fontWeight: 800, color: '#0f172a' }}>Confirmar pago</DialogTitle>
    <DialogContent>{error && <Alert severity="error">{error}</Alert>}
      <Typography sx={{ color: '#334155' }}>{datos?.pagos.find((pago) => pago._id === confirmando)?.agrupacion
        ? 'Se confirmaran todos los repartos de esta transferencia agrupada.' : '\u00bfEstas seguro de confirmar este pago?'}</Typography>
    </DialogContent><DialogActions><Button autoFocus disabled={ocupado} onClick={() => setConfirmando('')}>Cancelar</Button>
      <Button variant="contained" disabled={ocupado} onClick={confirmar}
        sx={{ bgcolor: '#0e1334', color: '#fff', '&:hover': { bgcolor: '#0b102b' }, boxShadow: 'none' }}>{ocupado ? 'Confirmando...' : 'Si, confirmar'}</Button></DialogActions>
  </Dialog>
  <Dialog open={Boolean(comprobante)} onClose={() => setComprobante(null)} fullWidth maxWidth="md" aria-label="Comprobante de pago">
    <DialogContent>{comprobante?.pdf ? <Box component="iframe" title="Comprobante PDF" src={comprobante.url} sx={{ width: '100%', height: '65vh', border: 0 }} />
      : comprobante && <Box component="img" alt="Comprobante de pago" src={comprobante.url} sx={{ width: '100%', maxHeight: '65vh', objectFit: 'contain' }} />}</DialogContent>
    <DialogActions><Button onClick={() => setComprobante(null)}>Cerrar</Button></DialogActions>
  </Dialog></>;
}

export default CampaniaPagoDialog;