import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, CardActions, CardContent, Typography, Avatar, Box, Chip } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import { mediaUrl } from '../utils/mediaUrl';
import TerminosPendientesAlert from './TerminosPendientesAlert.js';

const normalizarDiaMes = (value) => {
  const numero = Number(value);
  if (!Number.isInteger(numero) || numero < 1 || numero > 31) return null;
  return numero;
};

const construirFechaPeriodoConDia = (mes, anio, dia) => {
  const ultimoDiaMes = new Date(anio, mes, 0).getDate();
  const diaAjustado = Math.min(Math.max(1, Number(dia) || 1), ultimoDiaMes);
  return new Date(anio, mes - 1, diaAjustado);
};

const parseFechaSinDesfase = (value) => {
  if (!value) return null;
  const raw = String(value).trim();
  const matchIso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (matchIso) {
    const year = Number(matchIso[1]);
    const month = Number(matchIso[2]);
    const day = Number(matchIso[3]);
    const fecha = new Date(year, month - 1, day);
    return Number.isNaN(fecha.getTime()) ? null : fecha;
  }

  const fecha = new Date(value);
  if (Number.isNaN(fecha.getTime())) return null;

  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  }).formatToParts(fecha);
  const obtenerParte = (tipo) => Number(partes.find((parte) => parte.type === tipo)?.value);
  return new Date(obtenerParte('year'), obtenerParte('month') - 1, obtenerParte('day'));
};

const buildSiguientePeriodoDesde = (mes, anio) => {
  const mesNum = Number(mes);
  const anioNum = Number(anio);
  if (!Number.isInteger(mesNum) || !Number.isInteger(anioNum)) {
    return { mes: null, anio: null };
  }

  if (mesNum >= 12) {
    return { mes: 1, anio: anioNum + 1 };
  }

  return { mes: mesNum + 1, anio: anioNum };
};

function DashboardUsuario() {
  const [alumnos, setAlumnos] = useState([]);
  const [resumenPagos, setResumenPagos] = useState({});
  const navigate = useNavigate();
  const apiBase = process.env.REACT_APP_API_URL || window.location.origin;

  const obtenerFechaVencimientoVisible = useCallback((mensualidad, alumno) => {
    const diaLimitePersonalizado = normalizarDiaMes(alumno?.dia_limite_personalizado);
    if (diaLimitePersonalizado) {
      return construirFechaPeriodoConDia(mensualidad?.mes, mensualidad?.anio, diaLimitePersonalizado);
    }

    return parseFechaSinDesfase(mensualidad?.fecha_vencimiento);
  }, []);

  const obtenerResumenPago = useCallback((mensualidades = [], alumno = null) => {
    if (!Array.isArray(mensualidades) || mensualidades.length === 0) {
      return { fechaTexto: '--', monto: null, estado: 'sin datos', pagable: false };
    }

    const normalizarEstado = (estado) => (estado || '').toLowerCase();
    const ordenadas = mensualidades
      .map((m) => {
        const fechaPeriodo = new Date(`${m.anio}-${String(m.mes).padStart(2, '0')}-01T00:00:00`);
        const fechaVencimientoVisible = obtenerFechaVencimientoVisible(m, alumno);
        return {
          mes: Number(m.mes),
          anio: Number(m.anio),
          fecha: fechaPeriodo,
          fechaVencimientoVisible,
          estado: normalizarEstado(m.estatus),
          monto: Number(m.saldo_pendiente ?? m.monto_con_recargo_usd ?? m.monto_esperado) || 0,
          montoBase: Number(m.monto_sin_recargo_usd) || Math.max(0, (Number(m.monto_esperado) || 0) - (Number(m.recargo_aplicado_usd) || 0)),
          recargoAplicado: Math.max(0, Number(m.recargo_aplicado_usd) || 0),
          creditoAUsar: Math.max(0, Number(m.credito_a_aplicar) || 0),
          saldoAFavorDisponible: m.saldo_a_favor_disponible,
          mensualidad: m
        };
      })
      .filter((m) => !Number.isNaN(m.fecha.getTime()))
      .sort((a, b) => a.fecha - b.fecha);

    if (!ordenadas.length) {
      return { fechaTexto: '--', monto: null, estado: 'sin datos', pagable: false };
    }

    const estadosPagables = ['pendiente', 'retrasado', 'insolvente', 'abono'];
    const pendientes = ordenadas.filter((m) => estadosPagables.includes(m.estado));

    let referencia = pendientes[0] || null;
    if (!referencia) {
      const ultimaMensualidad = ordenadas[ordenadas.length - 1];
      const siguientePeriodo = buildSiguientePeriodoDesde(ultimaMensualidad?.mes, ultimaMensualidad?.anio);
      const diaReferencia = normalizarDiaMes(alumno?.dia_limite_personalizado)
        || normalizarDiaMes(ultimaMensualidad?.fechaVencimientoVisible?.getDate())
        || 1;

      referencia = {
        fecha: (siguientePeriodo.mes && siguientePeriodo.anio)
          ? new Date(siguientePeriodo.anio, siguientePeriodo.mes - 1, 1)
          : ultimaMensualidad.fecha,
        fechaVencimientoVisible: (siguientePeriodo.mes && siguientePeriodo.anio)
          ? construirFechaPeriodoConDia(siguientePeriodo.mes, siguientePeriodo.anio, diaReferencia)
          : ultimaMensualidad.fechaVencimientoVisible,
        monto: ultimaMensualidad?.monto,
        montoBase: ultimaMensualidad?.montoBase,
        recargoAplicado: 0
      };
    }

    return {
      fechaTexto: referencia.fechaVencimientoVisible
        ? referencia.fechaVencimientoVisible.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
        : referencia.fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
      monto: referencia.monto,
      montoBase: referencia.montoBase || 0,
      recargoAplicado: referencia.recargoAplicado || 0,
      creditoAUsar: referencia.creditoAUsar || 0,
      saldoAFavorDisponible: referencia.saldoAFavorDisponible,
      mes: referencia.mes,
      anio: referencia.anio,
      fechaVencimiento: referencia.fechaVencimientoVisible,
      estado: pendientes.length ? referencia.estado : 'al dia',
      pagable: pendientes.length > 0
    };
  }, [obtenerFechaVencimientoVisible]);

  useEffect(() => {
    // 1. Obtener el usuario logueado
    const usuario = JSON.parse(localStorage.getItem('usuario'));
    if (!usuario || !usuario.id) {
      setAlumnos([]);
      return;
    }

    // 2. Buscar el representante asociado a este usuario o alumnos por usuario
    const fetchAlumnos = async () => {
      try {
        let alumnosFinal = [];
        // Buscar representante por usuario
        const repRes = await fetch(`${process.env.REACT_APP_API_URL}/api/representantes/por-usuario/${usuario.id}`);
        const repData = await repRes.json();
        if (repRes.ok && repData && repData._id) {
          // Buscar alumnos asociados a ese representante
          const alumRes = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/por-representante/${repData._id}?populateSede=1`);
          const alumData = await alumRes.json();
          if (alumRes.ok && Array.isArray(alumData)) {
            alumnosFinal = alumnosFinal.concat(alumData);
          }
        }
        // Buscar también alumnos por usuarioId (caso usuario sin representante o representante que es alumno)
        const alumRes2 = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/por-representante/null?usuarioId=${usuario.id}&populateSede=1`);
        const alumData2 = await alumRes2.json();
        if (alumRes2.ok && Array.isArray(alumData2)) {
          alumnosFinal = alumnosFinal.concat(alumData2);
        }
        // Eliminar duplicados por _id
        const alumnosUnicos = alumnosFinal.filter((al, idx, arr) => arr.findIndex(a2 => a2._id === al._id) === idx);
        setAlumnos(alumnosUnicos);

        const resumenEntries = await Promise.all(
          alumnosUnicos.map(async (alumno) => {
            try {
              const resMens = await fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades?id_alumno=${alumno._id}`);
              const dataMens = await resMens.json();
              return [alumno._id, obtenerResumenPago(Array.isArray(dataMens) ? dataMens : [], alumno)];
            } catch {
              return [alumno._id, { fechaTexto: '--', monto: null, estado: 'sin datos' }];
            }
          })
        );

        setResumenPagos(Object.fromEntries(resumenEntries));
      } catch {
        setAlumnos([]);
        setResumenPagos({});
      }
    };
    fetchAlumnos();
  }, [apiBase, obtenerResumenPago]);

  const resumenFamiliar = useMemo(() => {
    const pendientes = alumnos
      .map((alumno) => resumenPagos[alumno._id])
      .filter((resumen) => resumen?.pagable && Number(resumen.monto) > 0);
    const fechas = pendientes.map((resumen) => resumen.fechaVencimiento).filter(Boolean);
    const vencimiento = fechas.length
      ? new Date(Math.min(...fechas.map((fecha) => fecha.getTime())))
      : null;

    return {
      total: pendientes.reduce((suma, resumen) => suma + (Number(resumen.monto) || 0), 0),
      recargos: pendientes.reduce((suma, resumen) => suma + (Number(resumen.recargoAplicado) || 0), 0),
      atletas: pendientes.length,
      vencimiento: vencimiento
        ? vencimiento.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
        : '--'
    };
  }, [alumnos, resumenPagos]);

  const navegarDetalle = (alumno) => {
    navigate(`/panel-opciones-usuario/${alumno._id}`, {
      state: { alumno, sede: { nombre: alumno.sede } }
    });
  };


  return (
    <Box sx={{ width: '100%', maxWidth: 1040, mx: 'auto', pb: 5 }}>
      <TerminosPendientesAlert sx={{ mb: 2, mt: 1 }} />

      <Box sx={{ mb: 2.25, mt: 1 }}>
        <Typography variant="h5" sx={{ fontWeight: 850, color: '#11132f' }}>
          Mis atletas
        </Typography>
        <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.35 }}>
          Gestiona pagos y actividades de tus representados.
        </Typography>
      </Box>

      {resumenFamiliar.atletas > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(3, minmax(120px, auto)) 1fr' },
            alignItems: 'center',
            gap: { xs: 2, md: 3.5 },
            bgcolor: '#111342',
            borderRadius: 2,
            px: { xs: 2, sm: 2.75 },
            py: { xs: 2, sm: 2.1 },
            mb: 3,
            boxShadow: '0 12px 28px rgba(17, 19, 66, 0.16)'
          }}
        >
          {[
            ['Total pendiente', `$${resumenFamiliar.total.toFixed(2)}`, '#ffffff'],
            ['Recargos', `$${resumenFamiliar.recargos.toFixed(2)}`, '#ff718d'],
            ['Vencimiento', resumenFamiliar.vencimiento, '#ffffff']
          ].map(([etiqueta, valor, color]) => (
            <Box key={etiqueta}>
              <Typography sx={{ color: '#aeb5d8', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {etiqueta}
              </Typography>
              <Typography sx={{ color, fontSize: { xs: 20, sm: 24 }, fontWeight: 850, lineHeight: 1.15, textTransform: etiqueta === 'Vencimiento' ? 'lowercase' : 'none' }}>
                {valor}
              </Typography>
            </Box>
          ))}
          {resumenFamiliar.atletas > 1 && (
          <Button
            variant="contained"
            endIcon={<ArrowForwardRoundedIcon />}
            onClick={() => navigate('/pagos-agrupados')}
            sx={{
              gridColumn: { xs: '1 / -1', md: 'auto' },
              justifySelf: { xs: 'stretch', md: 'end' },
              minHeight: 46,
              px: 2.4,
              bgcolor: '#f04478',
              color: '#fff',
              borderRadius: 1.5,
              textTransform: 'none',
              fontWeight: 800,
              boxShadow: 'none',
              '&:hover': { bgcolor: '#dc3569', boxShadow: 'none' }
            }}
          >
            Pagar todo junto · {resumenFamiliar.atletas} atletas
          </Button>
          )}
        </Box>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 2.25 }}>
        {alumnos.length === 0 ? (
          <Box sx={{ textAlign: 'center', mt: 6, gridColumn: '1 / -1' }}>
            <Typography variant="h6" color="text.secondary">
              No tienes alumnos registrados.
            </Typography>
          </Box>
        ) : (
          <>
            {alumnos.map((alumno) => {
              const resumen = resumenPagos[alumno._id] || { fechaTexto: '--', monto: null, estado: 'sin datos' };
              return (
                <Box key={alumno._id} sx={{ display: 'flex', minWidth: 0 }}>
                  <Card
                    sx={{
                      width: '100%',
                      borderRadius: 2,
                      bgcolor: '#fff',
                      border: '1px solid #e7e9f2',
                      boxShadow: '0 8px 24px rgba(34, 39, 78, 0.07)',
                      display: 'flex',
                      flexDirection: 'column'
                    }}
                  >
                    <CardContent sx={{ flex: 1, p: 2, '&:last-child': { pb: 1.25 } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.1, mb: 1.7 }}>
                        <Avatar
                          src={mediaUrl(alumno.foto) || undefined}
                          alt={alumno.nombres}
                          sx={{ width: 46, height: 46, bgcolor: '#eceefe', color: '#111342', fontSize: 14, fontWeight: 850 }}
                        >
                          {`${String(alumno.nombres || '').charAt(0)}${String(alumno.apellidos || '').charAt(0)}`.toUpperCase()}
                        </Avatar>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography
                            variant="subtitle1"
                            sx={{
                              fontWeight: 800,
                              color: '#17182f',
                              lineHeight: 1.15,
                              fontSize: 15
                            }}
                          >
                            {alumno.nombres} {alumno.apellidos}
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 0.55, mt: 0.6, flexWrap: 'wrap' }}>
                            <Chip size="small" label={alumno.categoria || 'Sin categoría'} sx={{ height: 20, bgcolor: '#f1f2f7', color: '#555b74', fontSize: 10, borderRadius: 1 }} />
                            <Chip size="small" label={alumno.sede && typeof alumno.sede === 'object' ? alumno.sede.nombre : alumno.sede || 'Sin sede'} sx={{ height: 20, bgcolor: '#f1f2f7', color: '#555b74', fontSize: 10, borderRadius: 1 }} />
                          </Box>
                        </Box>
                      </Box>

                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 1, mb: 1.6 }}>
                        <Box>
                          <Typography sx={{ color: '#7a8098', fontSize: 11 }}>
                            {resumen.pagable && resumen.mes
                              ? `Por pagar · ${new Intl.DateTimeFormat('es-VE', { month: 'long' }).format(new Date(2026, resumen.mes - 1, 1))} ${resumen.anio}`
                              : 'Estado de cuenta'}
                          </Typography>
                          <Typography sx={{ color: '#11132f', fontWeight: 850, fontSize: 24, lineHeight: 1.15 }}>
                            {resumen.monto != null ? `$${Number(resumen.monto).toFixed(2)}` : '--'}
                          </Typography>
                        </Box>
                        <Chip
                          size="small"
                          label={resumen.pagable ? `Vence · ${resumen.fechaTexto}` : 'Al día'}
                          sx={{ height: 22, bgcolor: resumen.pagable ? '#fff0f3' : '#e9f8ef', color: resumen.pagable ? '#c52d55' : '#16794a', fontSize: 10, fontWeight: 750, borderRadius: 1 }}
                        />
                      </Box>

                      <Box sx={{ borderTop: '1px solid #eceef4', pt: 1.25, display: 'grid', gap: 0.55 }}>
                        {[
                          ['Mensualidad', resumen.montoBase],
                          ['Recargo por mora', resumen.recargoAplicado],
                          ['Credito para esta cuota', -resumen.creditoAUsar],
                          ['Saldo a favor', Number(resumen.saldoAFavorDisponible ?? alumno?.saldo_a_favor_mensualidades ?? 0)]
                        ].map(([etiqueta, valor]) => (
                          <Box key={etiqueta} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                            <Typography sx={{ color: etiqueta === 'Recargo por mora' && valor > 0 ? '#c52d55' : '#5f657c', fontSize: 11.5 }}>{etiqueta}</Typography>
                            <Typography sx={{ color: etiqueta === 'Recargo por mora' && valor > 0 ? '#c52d55' : '#33384f', fontSize: 11.5, fontWeight: 650 }}>
                              {valor < 0 ? '-' : etiqueta === 'Recargo por mora' && valor > 0 ? '+' : ''}${Math.abs(Number(valor || 0)).toFixed(2)}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </CardContent>
                    <CardActions sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.8, px: 2, pb: 2, pt: 1 }}>
                      <Button
                        variant="outlined"
                        onClick={() => navegarDetalle(alumno)}
                        sx={{
                          color: '#25283e',
                          borderColor: '#d9dce7',
                          fontWeight: 700,
                          borderRadius: 1.25,
                          textTransform: 'none',
                          fontSize: 12,
                          minHeight: 38
                        }}
                      >
                        Ver detalle
                      </Button>
                      <Button
                        variant="contained"
                        disabled={!resumen.pagable}
                        onClick={() => navigate(`/pagos-alumno/${alumno._id}`, { state: { alumno } })}
                        sx={{
                          bgcolor: '#11132f',
                          '&:hover': { bgcolor: '#25284f' },
                          fontWeight: 750,
                          borderRadius: 1.25,
                          textTransform: 'none',
                          fontSize: 12,
                          minHeight: 38,
                          boxShadow: 'none'
                        }}
                      >
                        {resumen.pagable ? (Number(resumen.monto) === 0 && resumen.creditoAUsar > 0 ? 'Usar saldo a favor' : `Pagar $${Number(resumen.monto || 0).toFixed(2)}`) : 'Sin deuda'}
                      </Button>
                    </CardActions>
                  </Card>
                </Box>
              );
            })}
          </>
        )}
      </Box>
    </Box>
  );
}

export default DashboardUsuario;
