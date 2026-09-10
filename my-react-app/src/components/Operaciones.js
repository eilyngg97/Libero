import React, { useEffect, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';

const API_BASE = process.env.REACT_APP_API_URL || window.location.origin;
const PAGE_SIZE = 25;

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTime(value) {
  const date = toDate(value);
  if (!date) return '-';
  return new Intl.DateTimeFormat('es-VE', {
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function getDateGroup(value) {
  const date = toDate(value);
  if (!date) return 'Sin fecha';
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();
  const formatted = new Intl.DateTimeFormat('es-VE', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  return isToday ? `Hoy · ${formatted}` : formatted;
}

function getRelativeTime(value) {
  const date = toDate(value);
  if (!date) return '';
  const minutes = Math.max(Math.round((Date.now() - date.getTime()) / 60000), 0);
  if (minutes < 60) return `hace ${Math.max(minutes, 1)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}

function getOperationStyle(tipo) {
  if (tipo === 'conciliacion_bancaria') {
    return { icon: AccountBalanceOutlinedIcon, color: '#2684d9', background: '#edf6ff' };
  }
  if (tipo === 'pago_registrado') {
    return { icon: PaymentsOutlinedIcon, color: '#15966b', background: '#eaf8f1' };
  }
  return { icon: AddOutlinedIcon, color: '#805ad5', background: '#f3edff' };
}

function getInitials(name) {
  return String(name || 'Sistema').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export default function Operaciones() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [operaciones, setOperaciones] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [tipo, setTipo] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function cargarOperaciones() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ page: String(page + 1), limit: String(PAGE_SIZE) });
        if (tipo) params.set('tipo', tipo);
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/api/operaciones?${params}`, {
          signal: controller.signal,
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo cargar el historial');
        setOperaciones(data.operaciones || []);
        setTotal(Number(data.total) || 0);
      } catch (requestError) {
        if (requestError.name !== 'AbortError') setError(requestError.message || 'No se pudo cargar el historial');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    cargarOperaciones();
    return () => controller.abort();
  }, [page, tipo]);

  const handleTipoChange = (event) => {
    setTipo(event.target.value);
    setPage(0);
  };

  const groupedOperaciones = operaciones.reduce((groups, operacion) => {
    const label = getDateGroup(operacion.createdAt);
    if (!groups[label]) groups[label] = [];
    groups[label].push(operacion);
    return groups;
  }, {});

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', py: 1 }}>
      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', flexWrap: 'wrap', mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a' }}>Operaciones</Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>Historial de acciones realizadas en la academia.</Typography>
        </Box>
        <FormControl size="small" sx={{ minWidth: { xs: 0, sm: 220 }, width: { xs: '100%', sm: 'auto' } }}>
          <InputLabel id="tipo-operacion-label">Tipo de operacion</InputLabel>
          <Select labelId="tipo-operacion-label" label="Tipo de operacion" value={tipo} onChange={handleTipoChange}>
            <MenuItem value="">Todas las operaciones</MenuItem>
            <MenuItem value="conciliacion_bancaria">Conciliacion bancaria</MenuItem>
            <MenuItem value="nueva_inscripcion">Nueva inscripcion</MenuItem>
            <MenuItem value="generacion_constancia">Constancias</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper elevation={0} sx={{ overflow: 'hidden', border: '1px solid #edf0f5', borderRadius: 1.5, background: '#ffffff' }}>
        {isMobile ? (
          <Box sx={{ minHeight: 260, maxHeight: 'calc(100vh - 300px)', overflowY: 'auto', p: 1.2 }}>
            {loading ? (
              <Box sx={{ display: 'grid', placeItems: 'center', py: 6 }}>
                <CircularProgress size={28} />
              </Box>
            ) : operaciones.length === 0 ? (
              <Typography sx={{ py: 6, textAlign: 'center', color: '#64748b' }}>
                No hay operaciones registradas.
              </Typography>
            ) : (
              <Box sx={{ display: 'grid', gap: 1.2 }}>
                {Object.entries(groupedOperaciones).map(([dateGroup, items]) => (
                  <Box key={`group-mobile-${dateGroup}`}>
                    <Typography sx={{ color: '#63708a', fontSize: 12, fontWeight: 800, mb: 0.8 }}>
                      {dateGroup}
                      <Box component="span" sx={{ color: '#a4aec0', fontWeight: 600, ml: 1 }}>
                        {items.length} operaciones
                      </Box>
                    </Typography>

                    <Box sx={{ display: 'grid', gap: 0.8 }}>
                      {items.map((operacion) => {
                        const operationStyle = getOperationStyle(operacion.tipo);
                        const OperationIcon = operationStyle.icon;
                        const actorName = operacion.actor_nombre || 'Sistema';

                        return (
                          <Box
                            key={operacion._id}
                            sx={{
                              border: '1px solid #edf0f5',
                              borderRadius: 1.5,
                              p: 1,
                              background: '#fff'
                            }}
                          >
                            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Box sx={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 1, color: operationStyle.color, bgcolor: operationStyle.background }}>
                                  <OperationIcon sx={{ fontSize: 16 }} />
                                </Box>
                                <Typography sx={{ color: '#17213a', fontWeight: 800, fontSize: 13, lineHeight: 1.2 }}>
                                  {operacion.nombre}
                                </Typography>
                              </Box>
                              <Box sx={{ textAlign: 'right' }}>
                                <Typography sx={{ color: '#35415a', fontWeight: 700, fontSize: 12 }}>{formatTime(operacion.createdAt)}</Typography>
                                <Typography sx={{ color: '#98a2b5', fontSize: 10.5 }}>{getRelativeTime(operacion.createdAt)}</Typography>
                              </Box>
                            </Stack>

                            <Typography sx={{ color: '#4f5b70', fontSize: 12.5, mt: 0.7, lineHeight: 1.3 }}>
                              {operacion.detalle || '-'}
                            </Typography>

                            <Stack direction="row" spacing={0.8} alignItems="center" sx={{ mt: 0.9 }}>
                              <Avatar sx={{ width: 24, height: 24, bgcolor: '#f0f2f7', color: '#59657b', fontSize: 10, fontWeight: 800 }}>
                                {getInitials(actorName)}
                              </Avatar>
                              <Typography sx={{ color: '#263149', fontWeight: 700, fontSize: 12 }}>{actorName}</Typography>
                            </Stack>
                          </Box>
                        );
                      })}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: 'calc(100vh - 290px)', minHeight: 260 }}>
            <Table stickyHeader size="small" sx={{ minWidth: 720 }}>
              <TableHead>
                <TableRow sx={{ '& .MuiTableCell-root': { bgcolor: '#f8f9fc', borderBottom: '1px solid #edf0f5', color: '#8490a7', fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', py: 1.4 } }}>
                  <TableCell sx={{ width: '17%' }}>Operacion</TableCell>
                  <TableCell>Detalle</TableCell>
                  <TableCell sx={{ width: '21%' }}>Realizada por</TableCell>
                  <TableCell align="right" sx={{ width: '12%' }}>Hora</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={4} align="center" sx={{ py: 6 }}><CircularProgress size={28} /></TableCell></TableRow>
                ) : operaciones.length === 0 ? (
                  <TableRow><TableCell colSpan={4} align="center" sx={{ py: 6, color: '#64748b' }}>No hay operaciones registradas.</TableCell></TableRow>
                ) : Object.entries(groupedOperaciones).flatMap(([dateGroup, items]) => [
                  <TableRow key={`group-${dateGroup}`} sx={{ '& .MuiTableCell-root': { bgcolor: '#fbfcfe', borderBottom: '1px solid #edf0f5', color: '#63708a', fontSize: 12, fontWeight: 700, py: 1.1 } }}>
                    <TableCell colSpan={4}>{dateGroup} <Box component="span" sx={{ color: '#a4aec0', fontWeight: 500, ml: 1 }}>{items.length} operaciones</Box></TableCell>
                  </TableRow>,
                  ...items.map((operacion) => {
                    const operationStyle = getOperationStyle(operacion.tipo);
                    const OperationIcon = operationStyle.icon;
                    const actorName = operacion.actor_nombre || 'Sistema';
                    return (
                      <TableRow key={operacion._id} hover sx={{ '& .MuiTableCell-root': { borderBottom: '1px solid #f0f2f6', py: 1.35 }, '&:hover': { bgcolor: '#fbfdff' } }}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                            <Box sx={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 1, color: operationStyle.color, bgcolor: operationStyle.background }}><OperationIcon sx={{ fontSize: 17 }} /></Box>
                            <Typography variant="body2" sx={{ color: '#17213a', fontWeight: 800, lineHeight: 1.25 }}>{operacion.nombre}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell><Typography variant="body2" sx={{ color: '#4f5b70' }}>{operacion.detalle || '-'}</Typography></TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Avatar sx={{ width: 27, height: 27, bgcolor: '#f0f2f7', color: '#59657b', fontSize: 10, fontWeight: 800 }}>{getInitials(actorName)}</Avatar>
                            <Typography variant="body2" sx={{ color: '#263149', fontWeight: 700 }}>{actorName}</Typography>
                          </Box>
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ color: '#35415a', fontWeight: 700 }}>{formatTime(operacion.createdAt)}</Typography>
                          <Typography variant="caption" sx={{ display: 'block', color: '#98a2b5', mt: 0.15 }}>{getRelativeTime(operacion.createdAt)}</Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ])}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <TablePagination
          component="div"
          count={total}
          page={page}
          rowsPerPage={PAGE_SIZE}
          rowsPerPageOptions={[PAGE_SIZE]}
          onPageChange={(_, nextPage) => setPage(nextPage)}
          labelRowsPerPage={isMobile ? '' : 'Filas por pagina:'}
          labelDisplayedRows={({ from, to, count }) => (isMobile ? `${from}-${to}/${count}` : `${from}-${to} de ${count}`)}
          sx={{
            borderTop: '1px solid #edf0f5',
            '& .MuiTablePagination-toolbar': {
              minHeight: isMobile ? 44 : 52,
              px: isMobile ? 1 : 2,
              py: isMobile ? 0.25 : 0.75
            },
            '& .MuiTablePagination-selectLabel, & .MuiTablePagination-input': {
              display: isMobile ? 'none' : 'inline-flex'
            },
            '& .MuiTablePagination-displayedRows': {
              m: 0,
              fontSize: isMobile ? 12 : 14,
              color: '#475569'
            },
            '& .MuiTablePagination-actions': {
              ml: isMobile ? 0.5 : 2
            },
            '& .MuiIconButton-root': {
              p: isMobile ? 0.5 : 1
            }
          }}
        />
      </Paper>
    </Box>
  );
}