import React, { useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import { Bar, BarChart, Cell, CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { mediaUrl } from '../utils/mediaUrl';
import './Estadisticas.css';

const LABELS_MESES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];
const CHART_FILL_COLORS = ['#0B0F2A', '#d92b73'];

function Estadisticas() {
  const currentYear = new Date().getFullYear();
  const [anio, setAnio] = useState(currentYear);
  const [sedes, setSedes] = useState([]);
  const [sedeSeleccionada, setSedeSeleccionada] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resumen, setResumen] = useState({ anio: currentYear, meses: [], totales: { inscritos: 0, retirados: 0 } });
  const [loadingIngresos, setLoadingIngresos] = useState(false);
  const [errorIngresos, setErrorIngresos] = useState('');
  const [resumenIngresos, setResumenIngresos] = useState({ anio: currentYear, meses: [], total_anual: 0 });
  const [loadingIngresosSede, setLoadingIngresosSede] = useState(false);
  const [errorIngresosSede, setErrorIngresosSede] = useState('');
  const [resumenIngresosSede, setResumenIngresosSede] = useState({ anio: currentYear, sedes: [], total_anual: 0 });
  const [dialogo, setDialogo] = useState({ open: false, titulo: '', items: [] });

  const anios = useMemo(() => {
    const base = [];
    for (let y = currentYear; y >= currentYear - 5; y -= 1) {
      base.push(y);
    }
    return base;
  }, [currentYear]);

  useEffect(() => {
    const fetchSedes = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/sedes`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          }
        });

        const data = await response.json();
        if (!response.ok || !Array.isArray(data)) {
          setSedes([]);
          return;
        }

        setSedes(data);
      } catch {
        setSedes([]);
      }
    };

    fetchSedes();
  }, []);

  useEffect(() => {
    const fetchEstadisticas = async () => {
      setLoading(true);
      setError('');

      try {
        const token = localStorage.getItem('token');
        const query = new URLSearchParams({ anio: String(anio) });
        if (sedeSeleccionada !== 'all') {
          query.set('id_sede', sedeSeleccionada);
        }

        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/estadisticas/inscritos-retirados?${query.toString()}`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          }
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || 'No se pudieron cargar las estadisticas.');
        }

        const meses = Array.isArray(data?.meses) ? data.meses : [];
        setResumen({
          anio: data?.anio || anio,
          meses,
          totales: {
            inscritos: Number(data?.totales?.inscritos || 0),
            retirados: Number(data?.totales?.retirados || 0)
          }
        });
      } catch (err) {
        setError(err?.message || 'No se pudieron cargar las estadisticas.');
        setResumen({ anio, meses: [], totales: { inscritos: 0, retirados: 0 } });
      } finally {
        setLoading(false);
      }
    };

    fetchEstadisticas();
  }, [anio, sedeSeleccionada]);

  useEffect(() => {
    const fetchIngresos = async () => {
      setLoadingIngresos(true);
      setErrorIngresos('');

      try {
        const token = localStorage.getItem('token');
        const query = new URLSearchParams({ anio: String(anio) });
        if (sedeSeleccionada !== 'all') {
          query.set('id_sede', sedeSeleccionada);
        }

        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades/ingresos-por-mes?${query.toString()}`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          }
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || 'No se pudieron cargar los ingresos.');
        }

        setResumenIngresos({
          anio: data?.anio || anio,
          meses: Array.isArray(data?.meses) ? data.meses : [],
          total_anual: Number(data?.total_anual || 0)
        });
      } catch (err) {
        setErrorIngresos(err?.message || 'No se pudieron cargar los ingresos.');
        setResumenIngresos({ anio, meses: [], total_anual: 0 });
      } finally {
        setLoadingIngresos(false);
      }
    };

    fetchIngresos();
  }, [anio, sedeSeleccionada]);

  useEffect(() => {
    const fetchIngresosPorSede = async () => {
      setLoadingIngresosSede(true);
      setErrorIngresosSede('');

      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades/ingresos-por-sede?anio=${anio}`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          }
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || 'No se pudieron cargar los ingresos por sede.');
        }

        setResumenIngresosSede({
          anio: data?.anio || anio,
          sedes: Array.isArray(data?.sedes) ? data.sedes : [],
          total_anual: Number(data?.total_anual || 0)
        });
      } catch (err) {
        setErrorIngresosSede(err?.message || 'No se pudieron cargar los ingresos por sede.');
        setResumenIngresosSede({ anio, sedes: [], total_anual: 0 });
      } finally {
        setLoadingIngresosSede(false);
      }
    };

    fetchIngresosPorSede();
  }, [anio]);

  const dataGrafica = useMemo(() => {
    return LABELS_MESES.map((label, index) => {
      const item = resumen.meses?.find((mes) => Number(mes?.mes) === index + 1) || {};
      return {
        mes: label,
        inscritos: Number(item?.inscritos || 0),
        retirados: Number(item?.retirados || 0)
      };
    });
  }, [resumen.meses]);

  const dataGraficaIngresos = useMemo(() => {
    return LABELS_MESES.map((label, index) => {
      const item = resumenIngresos.meses?.find((mes) => Number(mes?.mes) === index + 1) || {};
      return {
        mes: label,
        total_pagado: Number(item?.total_pagado || 0)
      };
    });
  }, [resumenIngresos.meses]);

  const dataComparativaSedes = useMemo(() => {
    const totalAnual = Number(resumenIngresosSede.total_anual || 0);
    return (resumenIngresosSede.sedes || []).map((sede, index) => {
      const totalPagado = Number(sede.total_pagado || 0);
      return {
        ...sede,
        total_pagado: totalPagado,
        porcentaje: totalAnual > 0 ? (totalPagado / totalAnual) * 100 : 0,
        color: CHART_FILL_COLORS[index % CHART_FILL_COLORS.length]
      };
    });
  }, [resumenIngresosSede.sedes, resumenIngresosSede.total_anual]);

  const formatMoney = (monto) => {
    const value = Number(monto || 0);
    return `$${value.toFixed(2)} USD`;
  };

  const tieneComparativaSedes = (resumenIngresosSede.sedes || []).length > 1;

  const abrirDialogoDetalle = (mesObj, tipo) => {
    const listado = tipo === 'inscritos' ? (mesObj?.detalle?.inscritos || []) : (mesObj?.detalle?.retirados || []);
    const nombreMes = LABELS_MESES[Math.max(0, Number(mesObj?.mes || 1) - 1)] || '-';

    setDialogo({
      open: true,
      titulo: `${tipo === 'inscritos' ? 'Inscritos' : 'Retirados'} - ${nombreMes} ${resumen.anio}`,
      items: listado
    });
  };

  return (
    <Box className="estadisticas-page">
      <Box className="estadisticas-header">
        <Typography variant="h5" sx={{ fontWeight: 800, color: '#0b0f2a' }}>
          Estadisticas de Alumnos
        </Typography>
        <Typography sx={{ color: '#475569', fontSize: 14 }}>
          Seguimiento mensual de inscritos y retirados.
        </Typography>
      </Box>

      <Paper className="estadisticas-card" elevation={0}>
        <Box className="estadisticas-toolbar">
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel id="anio-estadisticas-label">Ano</InputLabel>
            <Select
              labelId="anio-estadisticas-label"
              value={anio}
              label="Ano"
              onChange={(event) => setAnio(Number(event.target.value))}
            >
              {anios.map((item) => (
                <MenuItem key={item} value={item}>{item}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="sede-estadisticas-label">Sede</InputLabel>
            <Select
              labelId="sede-estadisticas-label"
              value={sedeSeleccionada}
              label="Sede"
              onChange={(event) => setSedeSeleccionada(event.target.value)}
            >
              <MenuItem value="all">Todas las sedes</MenuItem>
              {sedes.map((sede) => (
                <MenuItem key={sede._id} value={sede._id}>{sede.nombre}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box className="estadisticas-totales">
            <Typography><strong>Inscritos:</strong> {resumen.totales.inscritos}</Typography>
            <Typography><strong>Retirados:</strong> {resumen.totales.retirados}</Typography>
          </Box>
        </Box>

        {loading ? (
          <Typography sx={{ color: '#64748b', py: 4 }}>Cargando estadisticas...</Typography>
        ) : error ? (
          <Typography sx={{ color: '#dc2626', py: 4 }}>{error}</Typography>
        ) : (
          <>
            <Box sx={{ width: '100%', height: 320, mt: 1 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dataGrafica} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="mes" tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="inscritos" name="Inscritos" fill="#0B0F2A" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="retirados" name="Retirados" fill="#d92b73" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Box>

            <Table size="small" sx={{ mt: 1 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Mes</TableCell>
                  <TableCell align="center">Inscritos</TableCell>
                  <TableCell align="center">Retirados</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(resumen.meses || []).map((mesObj) => (
                  <TableRow key={`stats-mes-${mesObj.mes}`}>
                    <TableCell>{LABELS_MESES[mesObj.mes - 1]}</TableCell>
                    <TableCell align="center">
                      <Box className="stats-cell-actions">
                        <span>{mesObj.inscritos || 0}</span>
                        <Button
                          size="small"
                          onClick={() => abrirDialogoDetalle(mesObj, 'inscritos')}
                          disabled={!mesObj.inscritos}
                          sx={{ textTransform: 'none' }}
                        >
                          Ver
                        </Button>
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Box className="stats-cell-actions">
                        <span>{mesObj.retirados || 0}</span>
                        <Button
                          size="small"
                          color="secondary"
                          onClick={() => abrirDialogoDetalle(mesObj, 'retirados')}
                          disabled={!mesObj.retirados}
                          sx={{ textTransform: 'none' }}
                        >
                          Ver
                        </Button>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </Paper>

      <Paper className="estadisticas-card" elevation={0}>
        <Box className="estadisticas-header-inline">
          <Typography variant="h6" sx={{ fontWeight: 800, color: '#0b0f2a' }}>
            Comparativa de dinero entrante por sede
          </Typography>
          <Typography sx={{ color: '#334155', fontWeight: 700 }}>
            Total anual: {formatMoney(resumenIngresosSede.total_anual)}
          </Typography>
        </Box>

        {loadingIngresosSede ? (
          <Typography sx={{ color: '#64748b', py: 4 }}>Cargando comparativa por sede...</Typography>
        ) : errorIngresosSede ? (
          <Typography sx={{ color: '#dc2626', py: 4 }}>{errorIngresosSede}</Typography>
        ) : !tieneComparativaSedes ? (
          <Typography sx={{ color: '#64748b', py: 2 }}>
            No hay suficientes sedes para comparar. Se requieren al menos 2 sedes con ingresos en el año.
          </Typography>
        ) : (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(280px, 360px) 1fr' }, gap: 2.5, mt: 1 }}>
              <Box sx={{ width: '100%', height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={dataComparativaSedes}
                      dataKey="total_pagado"
                      nameKey="sedeNombre"
                      innerRadius={62}
                      outerRadius={110}
                      paddingAngle={2}
                      stroke="#ffffff"
                      strokeWidth={2}
                    >
                      {dataComparativaSedes.map((item, index) => (
                        <Cell key={`ingreso-sede-pie-${item.sedeId || index}`} fill={item.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, _, payload) => [formatMoney(value), payload?.payload?.sedeNombre || 'Sede']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </Box>

              <Box sx={{ display: 'grid', gap: 1.1, alignContent: 'start' }}>
                {dataComparativaSedes.map((sede, index) => (
                  <Box
                    key={`ingresos-sede-rank-${sede.sedeId || index}`}
                    sx={{
                      border: '1px solid #e2e8f0',
                      borderRadius: 1.5,
                      p: 1.1,
                      bgcolor: '#f8fafc'
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                        {sede.sedeNombre || 'Sin sede'}
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: '#334155', fontWeight: 700 }}>
                        {sede.porcentaje.toFixed(1)}%
                      </Typography>
                    </Box>
                    <Box sx={{ mt: 0.7, height: 8, borderRadius: 999, bgcolor: '#e2e8f0', overflow: 'hidden' }}>
                      <Box
                        sx={{
                          width: `${Math.min(100, sede.porcentaje)}%`,
                          height: '100%',
                          bgcolor: sede.color
                        }}
                      />
                    </Box>
                    <Typography sx={{ mt: 0.7, fontSize: 12, color: '#475569' }}>
                      {formatMoney(sede.total_pagado)}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </Box>

            <Table size="small" sx={{ mt: 1 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Sede</TableCell>
                  <TableCell align="right">Participacion</TableCell>
                  <TableCell align="right">Ingresos</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {dataComparativaSedes.map((sede) => (
                  <TableRow key={`ingresos-sede-${sede.sedeId || sede.sedeNombre}`}>
                    <TableCell>{sede.sedeNombre || 'Sin sede'}</TableCell>
                    <TableCell align="right">{sede.porcentaje.toFixed(1)}%</TableCell>
                    <TableCell align="right">{formatMoney(sede.total_pagado)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </Paper>

      <Dialog
        open={dialogo.open}
        onClose={() => setDialogo({ open: false, titulo: '', items: [] })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 800 }}>{dialogo.titulo}</DialogTitle>
        <DialogContent dividers>
          {dialogo.items.length === 0 ? (
            <Typography sx={{ color: '#64748b' }}>No hay alumnos para este filtro.</Typography>
          ) : (
            <Box className="stats-dialog-list">
              {dialogo.items.map((alumno) => (
                <Box key={alumno._id} className="stats-dialog-item">
                  <Avatar src={mediaUrl(alumno.foto) || ''} alt={alumno.nombres} sx={{ width: 44, height: 44 }}>
                    {!alumno.foto ? (alumno.nombres || '').charAt(0) : ''}
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography className="stats-name" title={`${alumno.nombres} ${alumno.apellidos}`}>
                      {alumno.nombres} {alumno.apellidos}
                    </Typography>
                    <Typography className="stats-meta">Sede: {alumno.sede || 'Sin sede'}</Typography>
                    <Typography className="stats-meta">Categoria: {alumno.categoria || '-'}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
}

export default Estadisticas;
