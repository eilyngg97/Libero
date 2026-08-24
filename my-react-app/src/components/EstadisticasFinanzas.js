import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  FormControl,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
  useMediaQuery
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import PaymentsIcon from '@mui/icons-material/Payments';
import BalanceIcon from '@mui/icons-material/Balance';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTH_LONG = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const CATEGORY_COLORS = ['#5865f2', '#f97316', '#10b981', '#3b82f6', '#a855f7', '#ef4444', '#14b8a6'];

function getCategoryColor(categoryName = '', index = 0) {
  const normalized = String(categoryName || '').toLowerCase();
  if (normalized.includes('personal')) return '#5865f2';
  if (normalized.includes('competenc')) return '#f97316';
  if (normalized.includes('deportivo')) return '#10b981';
  if (normalized.includes('instal')) return '#3b82f6';
  if (normalized.includes('servicio')) return '#a855f7';
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

function toMoney(value) {
  const amount = Number(value || 0);
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toMonthKey(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function parseMonthKey(monthKey) {
  const [year, month] = String(monthKey || '').split('-');
  return {
    year: Number(year),
    month: Number(month)
  };
}

function formatMonthLabel(monthKey) {
  const { year, month } = parseMonthKey(monthKey);
  if (!year || !month) return monthKey;
  return `${MONTH_LONG[month - 1]} ${year}`;
}

function formatMonthShortUpper(monthKey) {
  const { year, month } = parseMonthKey(monthKey);
  if (!year || !month) return monthKey;
  return `${MONTH_LABELS[month - 1].toUpperCase()} ${year}`;
}

function getPreviousMonthLabel(monthKey) {
  const { month } = parseMonthKey(monthKey);
  const prev = Number(month) - 1;
  if (!Number.isFinite(prev) || prev < 1) return 'mes anterior';
  return MONTH_LONG[prev - 1].toLowerCase();
}

function formatKpiChange(change, fallbackText = 'Sin referencia mensual') {
  if (change === null || !Number.isFinite(change)) return fallbackText;
  const sign = change > 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}%`;
}

function formatChangePercent(current, previous) {
  const curr = Number(current || 0);
  const prev = Number(previous || 0);
  if (prev <= 0) return null;
  return ((curr - prev) / prev) * 100;
}

function getMonthFromDate(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return null;
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1
  };
}

function normalizeMesesPayload(payload) {
  if (Array.isArray(payload?.meses)) return payload.meses;
  if (Array.isArray(payload)) return payload;
  return [];
}

function extractMesValue(item) {
  const raw = item?.mes ?? item?.month ?? item?._id?.mes ?? item?._id;
  const mes = Number(raw);
  return Number.isInteger(mes) ? mes : null;
}

function extractMontoValue(item) {
  const raw = item?.total_pagado
    ?? item?.total
    ?? item?.monto_pagado
    ?? item?.monto
    ?? 0;

  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : 0;
  }

  if (typeof raw === 'string') {
    let normalized = raw.trim();
    if (!normalized) return 0;

    // Limpia símbolos de moneda y texto, conservando dígitos y separadores.
    normalized = normalized.replace(/[^\d,.-]/g, '');

    const commaCount = (normalized.match(/,/g) || []).length;
    const dotCount = (normalized.match(/\./g) || []).length;

    if (commaCount > 0 && dotCount > 0) {
      // Si tiene ambos, se toma el último separador como decimal.
      const lastComma = normalized.lastIndexOf(',');
      const lastDot = normalized.lastIndexOf('.');
      if (lastComma > lastDot) {
        normalized = normalized.replace(/\./g, '').replace(',', '.');
      } else {
        normalized = normalized.replace(/,/g, '');
      }
    } else if (commaCount > 0 && dotCount === 0) {
      // Caso común es-VE: 41,25 -> 41.25
      normalized = normalized.replace(',', '.');
    } else {
      // 1,234.56 o 1234.56
      normalized = normalized.replace(/,/g, '');
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  const fallback = Number(raw);
  return Number.isFinite(fallback) ? fallback : 0;
}

function extractMesFromAnyDate(item) {
  const rawDate = item?.fecha_pago ?? item?.fecha ?? item?.createdAt;
  if (!rawDate) return null;
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return null;
  const mes = date.getUTCMonth() + 1;
  return mes >= 1 && mes <= 12 ? mes : null;
}

function EstadisticasFinanzas() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;

  const [anio] = useState(currentYear);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sedes, setSedes] = useState([]);
  const [sedeSeleccionada, setSedeSeleccionada] = useState('all');
  const [ingresosMeses, setIngresosMeses] = useState([]);
  const [egresosItems, setEgresosItems] = useState([]);
  const [mesSeleccionado, setMesSeleccionado] = useState(toMonthKey(currentYear, currentMonth));

  useEffect(() => {
    async function fetchFinanceData() {
      setLoading(true);
      setError('');

      try {
        const apiBase = process.env.REACT_APP_API_URL || '';
        const queryBase = new URLSearchParams({ anio: String(anio) });
        const sedeFiltro = String(sedeSeleccionada || 'all');
        if (sedeFiltro !== 'all') {
          queryBase.set('id_sede', sedeFiltro);
        }

        const fetchConSesion = async (url, options = {}, retryOn401 = true) => {
          const token = localStorage.getItem('token');
          const headers = {
            ...(options.headers || {}),
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          };

          let response = await fetch(url, { ...options, headers });

          if (retryOn401 && response.status === 401) {
            await new Promise((resolve) => setTimeout(resolve, 300));
            const tokenRetry = localStorage.getItem('token');
            const headersRetry = {
              ...(options.headers || {}),
              ...(tokenRetry ? { Authorization: `Bearer ${tokenRetry}` } : {})
            };
            response = await fetch(url, { ...options, headers: headersRetry });
          }

          return response;
        };

        const egresosQuery = new URLSearchParams({ limit: '500' });
        if (sedeFiltro !== 'all') {
          egresosQuery.set('sede', sedeFiltro);
        }

        const [respMensualidades, respInscripciones, respEgresos, respEntrenadores, respSedes] = await Promise.all([
          fetchConSesion(`${apiBase}/api/mensualidades/ingresos-por-mes?${queryBase.toString()}&tipo=mensualidades`),
          fetchConSesion(`${apiBase}/api/mensualidades/ingresos-por-mes?${queryBase.toString()}&tipo=inscripciones`),
          fetchConSesion(`${apiBase}/api/egresos?${egresosQuery.toString()}`),
          fetchConSesion(`${apiBase}/api/entrenadores`),
          fetchConSesion(`${apiBase}/api/sedes`)
        ]);

        const dataMensualidades = await respMensualidades.json().catch(() => ({}));
        const dataInscripciones = await respInscripciones.json().catch(() => ({}));
        const dataEgresos = await respEgresos.json().catch(() => ({}));
        const dataEntrenadores = await respEntrenadores.json().catch(() => ([]));
        const dataSedes = await respSedes.json().catch(() => ([]));

        if (!respMensualidades.ok) {
          throw new Error(dataMensualidades?.error || 'No se pudieron cargar los ingresos.');
        }
        if (!respInscripciones.ok) {
          throw new Error(dataInscripciones?.error || 'No se pudieron cargar las inscripciones.');
        }
        if (!respEgresos.ok) {
          throw new Error(dataEgresos?.error || 'No se pudieron cargar los egresos.');
        }

        // Si esta fuente falla por permisos o red, el reporte sigue con egresos manuales.
        const entrenadores = respEntrenadores.ok && Array.isArray(dataEntrenadores)
          ? dataEntrenadores
          : [];

        if (respSedes.ok && Array.isArray(dataSedes)) {
          setSedes(dataSedes);
        } else {
          setSedes([]);
        }

        const mensualidadesMap = new Map();
        normalizeMesesPayload(dataMensualidades).forEach((item) => {
          const mes = extractMesValue(item) || extractMesFromAnyDate(item);
          if (!mes || mes < 1 || mes > 12) return;
          const previo = Number(mensualidadesMap.get(mes) || 0);
          mensualidadesMap.set(mes, previo + extractMontoValue(item));
        });

        const inscripcionesMap = new Map();
        normalizeMesesPayload(dataInscripciones).forEach((item) => {
          const mes = extractMesValue(item) || extractMesFromAnyDate(item);
          if (!mes || mes < 1 || mes > 12) return;
          const previo = Number(inscripcionesMap.get(mes) || 0);
          inscripcionesMap.set(mes, previo + extractMontoValue(item));
        });
        const ingresos = MONTH_LABELS.map((_, index) => {
          const mes = index + 1;
          const mensualidades = Number(mensualidadesMap.get(mes) || 0);
          const inscripciones = Number(inscripcionesMap.get(mes) || 0);
          const total = mensualidades + inscripciones;
          return {
            mes,
            month: mes,
            monthKey: toMonthKey(anio, mes),
            mensualidades,
            inscripciones,
            total
          };
        });

        const rawEgresos = Array.isArray(dataEgresos?.items) ? dataEgresos.items : [];
        const egresosManuales = rawEgresos
          .map((item) => {
            const monthData = getMonthFromDate(item?.fecha_emision || item?.createdAt);
            if (!monthData || monthData.year !== anio) return null;
            return {
              monthKey: toMonthKey(monthData.year, monthData.month),
              month: monthData.month,
              monto: Number(item?.monto || 0),
              categoria: String(item?.categoria_id?.nombre || 'Sin categoria').trim() || 'Sin categoria'
            };
          })
          .filter(Boolean);

        const egresosNominaEntrenadores = entrenadores
          .filter((entrenador) => {
            if (sedeFiltro === 'all') return true;
            const sedesStaff = Array.isArray(entrenador?.sedes_staff) ? entrenador.sedes_staff : [];
            return sedesStaff.some((sedeId) => String(sedeId || '') === sedeFiltro);
          })
          .flatMap((entrenador) => (Array.isArray(entrenador?.pagos_nomina) ? entrenador.pagos_nomina : []))
          .map((pago) => {
            const monthData = getMonthFromDate(pago?.fecha_pago || pago?.createdAt);
            if (!monthData || monthData.year !== anio) return null;

            const montoNomina = extractMontoValue({
              total_pagado: pago?.monto_total_usd,
              total: pago?.monto_total_ves,
              monto: pago?.monto_total_usd
            });

            return {
              monthKey: toMonthKey(monthData.year, monthData.month),
              month: monthData.month,
              monto: montoNomina,
              categoria: 'Nomina entrenadores'
            };
          })
          .filter((item) => item && Number(item.monto || 0) > 0);

        const egresosNormalizados = [...egresosManuales, ...egresosNominaEntrenadores];

        setIngresosMeses(ingresos);
        setEgresosItems(egresosNormalizados);
      } catch (err) {
        setError(err?.message || 'No se pudo cargar el reporte financiero.');
      } finally {
        setLoading(false);
      }
    }

    fetchFinanceData();
  }, [anio, sedeSeleccionada]);

  const monthOptions = useMemo(() => {
    const keys = new Set();
    ingresosMeses.forEach((item) => {
      if (Number(item?.total || 0) > 0) keys.add(item.monthKey);
    });
    egresosItems.forEach((item) => {
      if (item?.monthKey) keys.add(item.monthKey);
    });
    const fromSet = Array.from(keys).sort((a, b) => String(b).localeCompare(String(a)));
    if (fromSet.length > 0) return fromSet;
    return [toMonthKey(anio, currentMonth)];
  }, [ingresosMeses, egresosItems, anio, currentMonth]);

  useEffect(() => {
    if (!monthOptions.includes(mesSeleccionado)) {
      setMesSeleccionado(monthOptions[0]);
    }
  }, [monthOptions, mesSeleccionado]);

  const monthMetrics = useMemo(() => {
    const { month } = parseMonthKey(mesSeleccionado);
    const selectedIncomeItem = ingresosMeses.find((item) => Number(item?.month) === Number(month));
    const monthIncome = Number(selectedIncomeItem?.total || 0);
    const monthIncomeMensualidades = Number(selectedIncomeItem?.mensualidades || 0);
    const monthIncomeInscripciones = Number(selectedIncomeItem?.inscripciones || 0);
    const monthExpenses = egresosItems
      .filter((item) => Number(item?.month) === Number(month))
      .reduce((acc, item) => acc + Number(item.monto || 0), 0);

    const prevMonth = month > 1 ? month - 1 : null;
    const prevIncome = prevMonth
      ? Number(ingresosMeses.find((item) => Number(item?.month) === Number(prevMonth))?.total || 0)
      : 0;
    const prevExpenses = prevMonth
      ? egresosItems
        .filter((item) => Number(item?.month) === Number(prevMonth))
        .reduce((acc, item) => acc + Number(item.monto || 0), 0)
      : 0;
    const prevNet = prevIncome - prevExpenses;

    return {
      income: monthIncome,
      incomeMensualidades: monthIncomeMensualidades,
      incomeInscripciones: monthIncomeInscripciones,
      expenses: monthExpenses,
      net: monthIncome - monthExpenses,
      prevIncome,
      prevExpenses,
      prevNet
    };
  }, [mesSeleccionado, ingresosMeses, egresosItems]);

  const flowChartData = useMemo(() => {
    const { month } = parseMonthKey(mesSeleccionado);
    const safeMonth = Number.isFinite(month) && month > 0 ? month : currentMonth;
    const startMonth = Math.max(1, safeMonth - 5);
    const list = [];

    for (let m = startMonth; m <= safeMonth; m += 1) {
      const income = Number(ingresosMeses.find((item) => Number(item?.month) === Number(m))?.total || 0);
      const expenses = egresosItems
        .filter((item) => Number(item?.month) === Number(m))
        .reduce((acc, item) => acc + Number(item.monto || 0), 0);
      list.push({
        mes: MONTH_LABELS[m - 1],
        ingresos: Math.round(income),
        egresos: Math.round(expenses)
      });
    }

    return list;
  }, [mesSeleccionado, ingresosMeses, egresosItems, currentMonth]);

  const categoryBreakdown = useMemo(() => {
    const grouped = new Map();
    egresosItems
      .filter((item) => item.monthKey === mesSeleccionado)
      .forEach((item) => {
        const prev = Number(grouped.get(item.categoria) || 0);
        grouped.set(item.categoria, prev + Number(item.monto || 0));
      });

    const total = Array.from(grouped.values()).reduce((acc, value) => acc + Number(value || 0), 0);
    const sorted = Array.from(grouped.entries())
      .map(([name, value], index) => ({
        name,
        value,
        color: getCategoryColor(name, index),
        percentage: total > 0 ? (value / total) * 100 : 0
      }))
      .sort((a, b) => b.value - a.value);

    return {
      total,
      items: sorted
    };
  }, [egresosItems, mesSeleccionado]);

  const chartMonthTitle = useMemo(() => formatMonthLabel(mesSeleccionado), [mesSeleccionado]);
  const chartMonthShortUpper = useMemo(() => formatMonthShortUpper(mesSeleccionado), [mesSeleccionado]);
  const previousMonthLabel = useMemo(() => getPreviousMonthLabel(mesSeleccionado), [mesSeleccionado]);

  const onExport = () => {
    const separator = ';';
    const toCsvNumber = (value) => Number(value || 0).toFixed(2).replace('.', ',');
    const escapeCsvValue = (value) => {
      const text = String(value ?? '');
      if (/["]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
      }
      if (text.includes(separator) || /[\n\r]/.test(text)) {
        return `"${text}"`;
      }
      return text;
    };

    const rows = [
      ['Categoria', 'Monto', 'Porcentaje'],
      ...categoryBreakdown.items.map((item) => [item.name, toCsvNumber(item.value), `${item.percentage.toFixed(2).replace('.', ',')}%`]),
      ['Total Egresos', toCsvNumber(categoryBreakdown.total), '100%'],
      ['Total Ingresos (Mensualidades + Inscripciones)', toCsvNumber(monthMetrics.income), ''],
      ['Flujo Neto', toCsvNumber(monthMetrics.net), '']
    ];

    const csvBody = rows
      .map((row) => row.map((value) => escapeCsvValue(value)).join(separator))
      .join('\r\n');

    const csvContent = `sep=${separator}\r\n${csvBody}`;
    const blob = new Blob(['\uFEFF', csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `reporte-financiero-${mesSeleccionado}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const incomeChange = formatChangePercent(monthMetrics.income, monthMetrics.prevIncome);
  const expenseChange = formatChangePercent(monthMetrics.expenses, monthMetrics.prevExpenses);
  const expenseIsGood = expenseChange === null ? true : expenseChange <= 0;
  const netIsGood = monthMetrics.net >= 0;

  const kpiCardSx = {
    borderRadius: 2.5,
    border: '1px solid #e5e7eb',
    boxShadow: 'none',
    minHeight: isMobile ? 112 : 134
  };

  return (
    <Box sx={{ width: '100%', maxWidth: '100%', display: 'grid', gap: 2 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', md: 'center' }} spacing={1.5}>
        <Box>
          <Typography sx={{ color: '#0f172a', fontSize: { xs: 24, md: 34 }, lineHeight: 1.05, fontWeight: 900 }}>
            Reportes Financieros
          </Typography>
          <Typography sx={{ color: '#94a3b8', fontSize: 13, mt: 0.35 }}>
            Ingresos = mensualidades + inscripciones. Analisis de flujo de caja y egresos por categoria.
          </Typography>
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: { xs: '100%', md: 'auto' } }}>
          <FormControl size="small" sx={{ minWidth: { xs: 0, sm: 190 }, width: { xs: '100%', sm: 'auto' } }}>
            <Select
              value={sedeSeleccionada}
              onChange={(event) => setSedeSeleccionada(String(event.target.value || 'all'))}
              sx={{ borderRadius: 2, background: '#fff', fontWeight: 700, height: 40, fontSize: 14 }}
            >
              <MenuItem value="all">Todas las sedes</MenuItem>
              {sedes.map((sede) => (
                <MenuItem key={String(sede?._id || '')} value={String(sede?._id || '')}>
                  {String(sede?.nombre || 'Sede')}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: { xs: 0, sm: 192 }, width: { xs: '100%', sm: 'auto' } }}>
            <Select
              value={mesSeleccionado}
              onChange={(event) => setMesSeleccionado(String(event.target.value || ''))}
              sx={{ borderRadius: 2, background: '#fff', fontWeight: 700, height: 40, fontSize: 14 }}
            >
              {monthOptions.map((monthKey) => (
                <MenuItem key={monthKey} value={monthKey}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <CalendarMonthOutlinedIcon sx={{ fontSize: 16, color: '#64748b' }} />
                    <span>{formatMonthLabel(monthKey)}</span>
                  </Stack>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button
            variant="outlined"
            startIcon={<FileDownloadOutlinedIcon />}
            onClick={onExport}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 700, borderColor: '#e2e8f0', color: '#334155', px: 2, height: 40, width: { xs: '100%', sm: 'auto' } }}
          >
            Exportar
          </Button>
        </Stack>
      </Stack>

      {loading ? (
        <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid #e5e7eb', boxShadow: 'none' }}>
          <Typography sx={{ color: '#64748b' }}>Cargando reporte financiero...</Typography>
        </Paper>
      ) : error ? (
        <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid #fecaca', boxShadow: 'none', background: '#fff1f2' }}>
          <Typography sx={{ color: '#b91c1c' }}>{error}</Typography>
        </Paper>
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
            <Paper sx={{ ...kpiCardSx, p: 2.2, background: '#111827', borderColor: '#111827' }}>
              <Typography sx={{ color: '#94a3b8', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', mb: 0.5 }}>
                Flujo neto - {chartMonthShortUpper}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <BalanceIcon sx={{ color: netIsGood ? '#4ade80' : '#f87171', fontSize: 24 }} />
                <Typography sx={{ color: netIsGood ? '#4ade80' : '#f87171', fontSize: { xs: 28, md: 34 }, lineHeight: 1, fontWeight: 900 }}>
                  {toMoney(monthMetrics.net)}
                </Typography>
              </Stack>
              <Typography sx={{ color: '#86efac', fontSize: 12, fontWeight: 700, mt: 0.8 }}>
                {`^ vs ${toMoney(monthMetrics.prevNet)} ${previousMonthLabel}`}
              </Typography>
            </Paper>

            <Paper sx={{ ...kpiCardSx, p: 2.2 }}>
              <Typography sx={{ color: '#9ca3af', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', mb: 0.5 }}>
                Total ingresos - {chartMonthShortUpper}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <AttachMoneyIcon sx={{ color: '#4f46e5', fontSize: 24 }} />
                <Typography sx={{ color: '#0f172a', fontSize: { xs: 28, md: 34 }, lineHeight: 1, fontWeight: 900 }}>
                  {toMoney(monthMetrics.income)}
                </Typography>
              </Stack>
              <Typography sx={{ color: '#16a34a', fontSize: 12, fontWeight: 700, mt: 0.8 }}>
                {`^ ${formatKpiChange(incomeChange)} vs ${previousMonthLabel}`}
              </Typography>
              <Typography sx={{ color: '#64748b', fontSize: 11.5, mt: 0.7 }}>
                Mensualidades: {toMoney(monthMetrics.incomeMensualidades)} | Inscripciones: {toMoney(monthMetrics.incomeInscripciones)}
              </Typography>
            </Paper>

            <Paper sx={{ ...kpiCardSx, p: 2.2 }}>
              <Typography sx={{ color: '#9ca3af', fontSize: 13, fontWeight: 800, textTransform: 'uppercase', mb: 0.5 }}>
                Total egresos - {chartMonthShortUpper}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center">
                <PaymentsIcon sx={{ color: '#f97316', fontSize: 24 }} />
                <Typography sx={{ color: '#0f172a', fontSize: { xs: 28, md: 34 }, lineHeight: 1, fontWeight: 900 }}>
                  {toMoney(monthMetrics.expenses)}
                </Typography>
              </Stack>
              <Typography sx={{ color: expenseIsGood ? '#16a34a' : '#dc2626', fontSize: 12, fontWeight: 700, mt: 0.8 }}>
                {`^ ${formatKpiChange(expenseChange)} vs ${previousMonthLabel}`}
              </Typography>
            </Paper>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: '2fr 1fr' }, gap: 1.5 }}>
            <Paper sx={{ borderRadius: 2.5, border: '1px solid #e5e7eb', boxShadow: 'none', p: 2.2 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1} sx={{ mb: 1.5 }}>
                <Box>
                  <Typography sx={{ color: '#0f172a', fontSize: { xs: 20, md: 24 }, fontWeight: 900, lineHeight: 1.1 }}>Flujo de Caja</Typography>
                  <Typography sx={{ color: '#94a3b8', fontSize: { xs: 13, md: 14 } }}>Ingresos (mensualidades + inscripciones) vs egresos - ultimos 6 meses</Typography>
                </Box>
                <Stack direction="row" spacing={1.4}>
                  <Chip size="small" label="Ingresos" sx={{ background: '#eef2ff', color: '#4338ca', fontWeight: 700 }} />
                  <Chip size="small" label="Egresos" sx={{ background: '#fff7ed', color: '#ea580c', fontWeight: 700 }} />
                </Stack>
              </Stack>

              <Box sx={{ width: '100%', height: { xs: 240, md: 320 } }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={flowChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="mes" interval={isMobile ? 1 : 0} tick={{ fill: '#64748b', fontSize: isMobile ? 11 : 13 }} />
                    <YAxis tick={{ fill: '#64748b', fontSize: isMobile ? 11 : 12 }} />
                    <Tooltip formatter={(value) => toMoney(value)} />
                    <Bar dataKey="ingresos" fill="#4f46e5" radius={[6, 6, 0, 0]} maxBarSize={36} />
                    <Bar dataKey="egresos" fill="#fb923c" radius={[6, 6, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </Box>
            </Paper>

            <Paper sx={{ borderRadius: 2.5, border: '1px solid #e5e7eb', boxShadow: 'none', p: 2.2 }}>
              <Typography sx={{ color: '#0f172a', fontSize: { xs: 20, md: 24 }, fontWeight: 900, lineHeight: 1.1 }}>Egresos por Categoria</Typography>
              <Typography sx={{ color: '#94a3b8', fontSize: { xs: 13, md: 14 }, mb: 1.5 }}>{chartMonthTitle} - Total {toMoney(categoryBreakdown.total)}</Typography>

              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 210px) 1fr' }, gap: 1.2, alignItems: 'center' }}>
                <Box sx={{ width: '100%', maxWidth: { xs: 220, md: '100%' }, mx: { xs: 'auto', md: 0 }, height: 220, position: 'relative' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryBreakdown.items}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={52}
                        outerRadius={90}
                        paddingAngle={2}
                        stroke="none"
                      >
                        {categoryBreakdown.items.map((item) => (
                          <Cell key={`category-slice-${item.name}`} fill={item.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => toMoney(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography sx={{ color: '#94a3b8', fontSize: 13 }}>Total</Typography>
                      <Typography sx={{ color: '#0f172a', fontSize: 18, fontWeight: 900 }}>{toMoney(categoryBreakdown.total)}</Typography>
                    </Box>
                  </Box>
                </Box>

                <Box sx={{ display: 'grid', gap: 0.75 }}>
                  {categoryBreakdown.items.map((item) => (
                    <Stack key={item.name} direction="row" justifyContent="space-between" alignItems="center" spacing={1}>
                      <Stack direction="row" spacing={0.8} alignItems="center" sx={{ minWidth: 0 }}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', background: item.color }} />
                        <Typography sx={{ color: '#475569', fontSize: { xs: 12, md: 13 }, fontWeight: 600 }} noWrap>{item.name}</Typography>
                      </Stack>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography sx={{ color: '#0f172a', fontSize: { xs: 14, md: 16 }, fontWeight: 900, lineHeight: 1 }}>{toMoney(item.value)}</Typography>
                        <Typography sx={{ color: '#94a3b8', fontSize: 11 }}>{item.percentage.toFixed(1)}%</Typography>
                      </Box>
                    </Stack>
                  ))}
                </Box>
              </Box>

              <Box sx={{ mt: 0.8, display: 'grid', gap: 0.8 }}>
                {categoryBreakdown.items.map((item) => (
                  <Box key={`${item.name}-bar`}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 0.25 }}>
                      <Typography sx={{ color: '#475569', fontSize: 12 }}>{item.name}</Typography>
                      <Typography sx={{ color: '#334155', fontSize: 12, fontWeight: 700 }}>{toMoney(item.value)}</Typography>
                    </Stack>
                    <Box sx={{ width: '100%', height: 6, borderRadius: 999, background: '#e5e7eb', overflow: 'hidden' }}>
                      <Box sx={{ width: `${Math.max(4, Math.min(100, item.percentage))}%`, height: '100%', borderRadius: 999, background: item.color }} />
                    </Box>
                  </Box>
                ))}
                {categoryBreakdown.items.length === 0 && (
                  <Typography sx={{ color: '#94a3b8', fontSize: 13 }}>No hay egresos en el mes seleccionado.</Typography>
                )}
              </Box>
            </Paper>
          </Box>
        </>
      )}
    </Box>
  );
}

export default EstadisticasFinanzas;
