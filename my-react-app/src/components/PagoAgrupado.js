import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Divider,
  Paper,
  Typography
} from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ModalPago from './ModalPago';
import { mediaUrl } from '../utils/mediaUrl';

const API_BASE = process.env.REACT_APP_API_URL || window.location.origin;
const ESTADOS_PENDIENTES = ['pendiente', 'retrasado', 'insolvente', 'abono'];

function obtenerMensualidadMasAntigua(mensualidades = []) {
  return mensualidades
    .filter((item) => ESTADOS_PENDIENTES.includes(String(item?.estatus || '').toLowerCase()))
    .sort((a, b) => ((Number(a.anio) * 12) + Number(a.mes)) - ((Number(b.anio) * 12) + Number(b.mes)))[0] || null;
}

function nombreMes(mes) {
  return new Intl.DateTimeFormat('es-VE', { month: 'long' })
    .format(new Date(2026, Number(mes) - 1, 1));
}

function PagoAgrupado() {
  const [deudas, setDeudas] = useState([]);
  const [seleccionadas, setSeleccionadas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [exito, setExito] = useState(null);
  const [modalAbierto, setModalAbierto] = useState(false);

  useEffect(() => {
    const cargar = async () => {
      const usuario = JSON.parse(localStorage.getItem('usuario') || 'null');
      const token = localStorage.getItem('token');
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

      if (!usuario?.id) {
        setError('No se pudo identificar al representante.');
        setCargando(false);
        return;
      }

      try {
        let atletas = [];
        let representanteId = '';
        const representanteRes = await fetch(`${API_BASE}/api/representantes/por-usuario/${usuario.id}`, { headers });
        const representante = await representanteRes.json();
        if (representanteRes.ok && representante?._id) {
          representanteId = String(representante._id);
          const atletasRes = await fetch(`${API_BASE}/api/alumnos/por-representante/${representante._id}?populateSede=1`, { headers });
          const atletasData = await atletasRes.json();
          if (atletasRes.ok && Array.isArray(atletasData)) atletas = atletasData;
        }

        const directosRes = await fetch(`${API_BASE}/api/alumnos/por-representante/null?usuarioId=${usuario.id}&populateSede=1`, { headers });
        const directos = await directosRes.json();
        if (directosRes.ok && Array.isArray(directos)) atletas = [...atletas, ...directos];
        atletas = atletas.filter((atleta, index, lista) => lista.findIndex((item) => item._id === atleta._id) === index);
        atletas = representanteId
          ? atletas.filter((atleta) => String(atleta.representante?._id || atleta.representante || '') === representanteId)
          : [];

        const resultados = await Promise.all(atletas.map(async (atleta) => {
          const mensualidadesRes = await fetch(`${API_BASE}/api/mensualidades?id_alumno=${atleta._id}`, { headers });
          const mensualidades = await mensualidadesRes.json();
          const mensualidad = mensualidadesRes.ok && Array.isArray(mensualidades)
            ? obtenerMensualidadMasAntigua(mensualidades)
            : null;
          if (!mensualidad) return null;
          return {
            atleta,
            mensualidad,
            saldo: Number(mensualidad.saldo_pendiente ?? mensualidad.monto_esperado) || 0,
            recargo: Number(mensualidad.recargo_aplicado_usd) || 0,
            montoBase: Number(mensualidad.monto_sin_recargo_usd)
              || Math.max(0, (Number(mensualidad.saldo_pendiente ?? mensualidad.monto_esperado) || 0) - (Number(mensualidad.recargo_aplicado_usd) || 0))
          };
        }));

        const elegibles = resultados.filter((item) => item && item.saldo > 0);
        setDeudas(elegibles);
        setSeleccionadas(elegibles.map((item) => item.mensualidad._id));
      } catch (err) {
        setError(err.message || 'No se pudieron cargar las mensualidades.');
      } finally {
        setCargando(false);
      }
    };

    cargar();
  }, []);

  const deudasSeleccionadas = useMemo(
    () => deudas.filter((item) => seleccionadas.includes(item.mensualidad._id)),
    [deudas, seleccionadas]
  );
  const total = deudasSeleccionadas.reduce((suma, item) => suma + item.saldo, 0);
  const totalMensualidades = deudasSeleccionadas.reduce((suma, item) => suma + item.montoBase, 0);
  const totalRecargos = deudasSeleccionadas.reduce((suma, item) => suma + item.recargo, 0);
  const totalCreditos = deudasSeleccionadas.reduce((suma, item) => suma + Number(item.mensualidad.credito_a_aplicar || 0), 0);
  const puedePagar = deudasSeleccionadas.length >= 2;
  const todasSeleccionadas = deudas.length > 0 && seleccionadas.length === deudas.length;
  const pagoModal = useMemo(() => ({
    id: 'pago-agrupado',
    monto: Number(total.toFixed(2)),
    recargo_aplicado_usd: deudasSeleccionadas.reduce((suma, item) => suma + item.recargo, 0)
  }), [deudasSeleccionadas, total]);

  const alternarSeleccion = (id) => {
    setSeleccionadas((actuales) => (
      actuales.includes(id) ? actuales.filter((item) => item !== id) : [...actuales, id]
    ));
    setExito(null);
  };

  const registrarPago = async (payload) => {
    const formData = new FormData();
    formData.append('asignaciones', JSON.stringify(deudasSeleccionadas.map((item) => ({
      id_mensualidad: item.mensualidad._id,
      credito_a_aplicar: Number(item.mensualidad.credito_a_aplicar || 0)
    }))));
    formData.append('monto_total', Number(payload.montoPagadoMoneda).toFixed(2));
    formData.append('monto_total_bs', Number(payload.montoPagadoBs).toFixed(2));
    formData.append('fecha_pago', payload.fechaPago);
    formData.append('metodo_pago', payload.metodoPago);
    if (payload.referencia) formData.append('referencia', payload.referencia);
    if (payload.telefonoPago) formData.append('telefono_pago', payload.telefonoPago);
    if (payload.cedulaTitular) formData.append('cedula_titular', payload.cedulaTitular);
    if (payload.notaPago) formData.append('nota', payload.notaPago);
    if (payload.comprobante) formData.append('comprobante', payload.comprobante);

    const token = localStorage.getItem('token');
    const response = await fetch(`${API_BASE}/api/pagos/agrupado`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data?.error || 'No se pudo registrar el pago agrupado.');

    setExito({ codigo: data.codigo, atletas: Number(data.atletas) || deudasSeleccionadas.length });
    setDeudas((actuales) => actuales.filter((item) => !seleccionadas.includes(item.mensualidad._id)));
    setSeleccionadas([]);
  };

  if (cargando) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>;
  }

  return (
    <Box sx={{ width: '100%', maxWidth: 1040, mx: 'auto', pb: 5 }}>
      <Box sx={{ mb: 2.75 }}>
        <Typography variant="h5" sx={{ fontWeight: 850, color: '#11132f' }}>Pagar varias atletas</Typography>
        <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.35 }}>
          Selecciona al menos dos. Se cubrirá la deuda más antigua de cada atleta.
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {exito && (
        <Paper
          role="status"
          aria-live="polite"
          sx={{
            mb: 2.5,
            p: { xs: 1.75, sm: 2 },
            display: 'flex',
            gap: 1.5,
            alignItems: 'flex-start',
            bgcolor: '#f3faf5',
            border: '1px solid #cce8d3',
            borderLeft: '4px solid #2e7d4f',
            borderRadius: 1.5,
            boxShadow: '0 6px 18px rgba(46, 125, 79, 0.08)'
          }}
        >
          <Box sx={{ width: 34, height: 34, flex: '0 0 34px', display: 'grid', placeItems: 'center', borderRadius: '50%', bgcolor: '#dcefe1', color: '#237242' }}>
            <CheckCircleRoundedIcon sx={{ fontSize: 21 }} />
          </Box>
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography sx={{ color: '#173d26', fontSize: 15, fontWeight: 850, lineHeight: 1.25 }}>
              Pago enviado correctamente
            </Typography>
            <Typography sx={{ mt: 0.45, color: '#456451', fontSize: 12.5, lineHeight: 1.55 }}>
              Registramos el pago de {exito.atletas} {exito.atletas === 1 ? 'atleta' : 'atletas'}. Ahora será verificado por el equipo administrativo.
            </Typography>
            <Box sx={{ mt: 1.15, display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
              <Typography sx={{ color: '#5f7767', fontSize: 10.5, fontWeight: 750, textTransform: 'uppercase' }}>
                Código de seguimiento
              </Typography>
              <Box component="span" sx={{ px: 1, py: 0.35, bgcolor: '#fff', border: '1px solid #c6dfcd', borderRadius: 0.75, color: '#245f3a', fontSize: 11.5, fontWeight: 850, overflowWrap: 'anywhere' }}>
                {exito.codigo}
              </Box>
            </Box>
          </Box>
        </Paper>
      )}
      {!deudas.length && !exito && <Alert severity="info">No hay atletas con mensualidades pendientes elegibles.</Alert>}

      {deudas.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 2fr) minmax(270px, 0.9fr)' }, gap: { xs: 2.25, md: 2.75 }, alignItems: 'start' }}>
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 1.1 }}>
              <Typography sx={{ color: '#656b81', fontSize: 12.5, fontWeight: 650 }}>
                {deudasSeleccionadas.length} de {deudas.length} seleccionadas
              </Typography>
              <Button
                variant="text"
                size="small"
                onClick={() => setSeleccionadas(todasSeleccionadas ? [] : deudas.map((item) => item.mensualidad._id))}
                sx={{ minWidth: 0, p: 0, color: '#111342', textTransform: 'none', fontSize: 12, fontWeight: 800 }}
              >
                {todasSeleccionadas ? 'Quitar todas' : 'Seleccionar todas'}
              </Button>
            </Box>

            <Box sx={{ display: 'grid', gap: 1.25 }}>
              {deudas.map(({ atleta, mensualidad, saldo, recargo }) => {
                const seleccionada = seleccionadas.includes(mensualidad._id);
                return (
                  <Paper
                    key={mensualidad._id}
                    variant="outlined"
                    sx={{
                      px: { xs: 1.15, sm: 1.5 },
                      py: 1.2,
                      borderRadius: 1.5,
                      borderColor: seleccionada ? '#111342' : '#d9dce7',
                      borderWidth: seleccionada ? 1.5 : 1,
                      boxShadow: seleccionada ? '0 5px 14px rgba(17, 19, 66, 0.06)' : 'none',
                      bgcolor: '#fff'
                    }}
                  >
                    <Box sx={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: { xs: 0.7, sm: 1.1 }, alignItems: 'center' }}>
                      <Checkbox
                        checked={seleccionada}
                        onChange={() => alternarSeleccion(mensualidad._id)}
                        inputProps={{ 'aria-label': `Seleccionar a ${atleta.nombres} ${atleta.apellidos}` }}
                        sx={{ p: 0.4, color: '#c6cada', '&.Mui-checked': { color: '#ef3f78' } }}
                      />
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                        <Avatar
                          src={mediaUrl(atleta.foto) || undefined}
                          alt={atleta.nombres}
                          sx={{ width: 40, height: 40, bgcolor: '#eceefe', color: '#111342', fontSize: 12, fontWeight: 850, borderRadius: 1.25 }}
                        >
                          {`${String(atleta.nombres || '').charAt(0)}${String(atleta.apellidos || '').charAt(0)}`.toUpperCase()}
                        </Avatar>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ color: '#17182f', fontWeight: 800, fontSize: 13.5, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {atleta.nombres} {atleta.apellidos}
                          </Typography>
                          <Typography sx={{ color: '#747a90', fontSize: 10.5, textTransform: 'capitalize', mt: 0.25 }}>
                            {nombreMes(mensualidad.mes)} {mensualidad.anio} · {atleta.categoria || 'Sin categoría'}
                          </Typography>
                        </Box>
                      </Box>
                      <Box sx={{ textAlign: 'right', pl: 0.5 }}>
                        <Typography sx={{ color: '#11132f', fontWeight: 850, fontSize: 16 }}>${saldo.toFixed(2)}</Typography>
                        {recargo > 0 && <Typography sx={{ color: '#c52d55', fontSize: 9.5 }}>incl. ${recargo.toFixed(2)} recargo</Typography>}
                        {Number(mensualidad.credito_a_aplicar) > 0 && <Typography sx={{ color: '#047857', fontSize: 10 }}>Credito: -${Number(mensualidad.credito_a_aplicar).toFixed(2)}</Typography>}
                      </Box>
                    </Box>
                  </Paper>
                );
              })}
            </Box>
          </Box>

          <Paper sx={{ position: { md: 'sticky' }, top: { md: 20 }, p: 2.25, borderRadius: 2, bgcolor: '#fff', border: '1px solid #e5e7ef', boxShadow: '0 10px 26px rgba(34, 39, 78, 0.07)' }}>
            <Typography sx={{ color: '#777d92', fontSize: 10, fontWeight: 850, textTransform: 'uppercase', letterSpacing: '0.1em', mb: 1.3 }}>
              Resumen
            </Typography>
            <Box sx={{ display: 'grid', gap: 0.65 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                <Typography sx={{ color: '#555b72', fontSize: 12 }}>Mensualidades ({deudasSeleccionadas.length})</Typography>
                <Typography sx={{ color: '#303449', fontSize: 12, fontWeight: 650 }}>${totalMensualidades.toFixed(2)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                <Typography sx={{ color: '#c52d55', fontSize: 12 }}>Recargos</Typography>
                <Typography sx={{ color: '#c52d55', fontSize: 12, fontWeight: 700 }}>+${totalRecargos.toFixed(2)}</Typography>
              </Box>
              {totalCreditos > 0 && <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                <Typography sx={{ color: '#047857', fontSize: 12 }}>Saldo a favor</Typography>
                <Typography sx={{ color: '#047857', fontSize: 12, fontWeight: 700 }}>-${totalCreditos.toFixed(2)}</Typography>
              </Box>}
            </Box>
            <Divider sx={{ my: 1.6, borderColor: '#eceef3' }} />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 1.4 }}>
              <Typography sx={{ color: '#24273c', fontSize: 13, fontWeight: 750 }}>Total</Typography>
              <Typography sx={{ color: '#11132f', fontSize: 25, fontWeight: 900 }}>${total.toFixed(2)}</Typography>
            </Box>
            {!puedePagar && <Typography sx={{ color: '#c52d55', fontSize: 11, mb: 1 }}>Selecciona al menos dos atletas.</Typography>}
            <Button
              fullWidth
              variant="contained"
              disabled={!puedePagar}
              onClick={() => setModalAbierto(true)}
              sx={{ bgcolor: '#11132f', '&:hover': { bgcolor: '#25284f' }, textTransform: 'none', py: 1.05, borderRadius: 1.25, fontWeight: 800, fontSize: 12, boxShadow: 'none' }}
            >
              Continuar con el pago
            </Button>
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 0.55, mt: 1.25, color: '#8a90a3' }}>
              <LockOutlinedIcon sx={{ fontSize: 13 }} />
              <Typography sx={{ fontSize: 10.5 }}>Pago seguro · un solo comprobante</Typography>
            </Box>
          </Paper>
        </Box>
      )}

      <ModalPago
        open={modalAbierto}
        onClose={() => setModalAbierto(false)}
        pago={pagoModal}
        conceptoPago="mensualidades"
        disableCuotas
        onSubmitPayment={registrarPago}
      />
    </Box>
  );
}

export default PagoAgrupado;