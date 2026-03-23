import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

function formatMoney(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  return Number(value).toFixed(2);
}

function estadoChip(tipo) {
  if (tipo === 'match_total') {
    return <Chip icon={<CheckCircleIcon />} label="Match total" sx={{ bgcolor: '#dcfce7', color: '#166534', fontWeight: 700 }} />;
  }
  if (tipo === 'match_parcial') {
    return <Chip icon={<WarningAmberIcon />} label="Match parcial" sx={{ bgcolor: '#fef3c7', color: '#92400e', fontWeight: 700 }} />;
  }
  return <Chip icon={<ErrorOutlineIcon />} label="Sin coincidencia" sx={{ bgcolor: '#fee2e2', color: '#991b1b', fontWeight: 700 }} />;
}

export default function ConciliacionBancaria() {
  const [archivo, setArchivo] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resultado, setResultado] = useState(null);

  const headers = useMemo(() => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const procesarArchivo = async (fileToProcess = archivo) => {
    if (!fileToProcess) {
      setError('Debes seleccionar un archivo Excel para conciliar.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('archivo', fileToProcess);

      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/conciliacion/previsualizar`, {
        method: 'POST',
        headers,
        body: formData
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al previsualizar conciliacion');

      setResultado(data);
      setSuccess('Conciliacion generada correctamente.');
    } catch (err) {
      setResultado(null);
      setError(err.message || 'Error al procesar archivo');
    } finally {
      setLoading(false);
    }
  };

  const confirmarTodo = async () => {
    const ids = resultado?.pago_ids_confirmables || [];
    if (!ids.length) {
      setError('No hay pagos con match total para confirmar.');
      return;
    }

    setConfirmando(true);
    setError('');
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/conciliacion/confirmar-match-total`, {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ pago_ids: ids })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al confirmar pagos');

      setSuccess(`Se actualizaron ${data.mensualidades_actualizadas || 0} mensualidades.`);
      if (archivo) {
        await procesarArchivo(archivo);
      }
    } catch (err) {
      setError(err.message || 'Error al confirmar conciliacion');
    } finally {
      setConfirmando(false);
    }
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    const droppedFile = event.dataTransfer?.files?.[0];
    if (!droppedFile) return;
    setArchivo(droppedFile);
    setResultado(null);
  };

  const filasComparativas = useMemo(() => {
    if (!resultado) return [];

    const total = (resultado.match_total || []).map((row) => ({
      tipo: 'match_total',
      alumno: row.sistema?.alumno || '-',
      referenciaSistema: row.sistema?.referencia || '-',
      referenciaExcel: row.excel?.referencia || '-',
      montoSistema: row.sistema?.monto_bs,
      montoExcel: row.excel?.monto_bs,
      fechaSistema: row.sistema?.fecha || '-',
      fechaExcel: row.excel?.fecha || '-',
      motivo: (row.motivo || []).join(', ') || '-'
    }));

    const parcial = (resultado.match_parcial || []).map((row) => ({
      tipo: 'match_parcial',
      alumno: row.sistema?.alumno || '-',
      referenciaSistema: row.sistema?.referencia || '-',
      referenciaExcel: row.excel?.referencia || '-',
      montoSistema: row.sistema?.monto_bs,
      montoExcel: row.excel?.monto_bs,
      fechaSistema: row.sistema?.fecha || '-',
      fechaExcel: row.excel?.fecha || '-',
      motivo: (row.motivo || []).join(', ') || '-'
    }));

    const noSistema = (resultado.sin_coincidencia_sistema || []).map((row) => ({
      tipo: 'sin_coincidencia',
      alumno: row.sistema?.alumno || '-',
      referenciaSistema: row.sistema?.referencia || '-',
      referenciaExcel: '-',
      montoSistema: row.sistema?.monto_bs,
      montoExcel: null,
      fechaSistema: row.sistema?.fecha || '-',
      fechaExcel: '-',
      motivo: 'Existe en sistema pero no aparece en banco'
    }));

    const noExcel = (resultado.sin_coincidencia_excel || []).map((row) => ({
      tipo: 'sin_coincidencia',
      alumno: '-',
      referenciaSistema: '-',
      referenciaExcel: row.excel?.referencia || '-',
      montoSistema: null,
      montoExcel: row.excel?.monto_bs,
      fechaSistema: '-',
      fechaExcel: row.excel?.fecha || '-',
      motivo: 'Existe en banco pero no fue reportado en sistema'
    }));

    return [...total, ...parcial, ...noSistema, ...noExcel];
  }, [resultado]);

  return (
    <Box sx={{ p: { xs: 1, md: 2 } }}>
      <Typography variant="h5" sx={{ fontWeight: 800, color: '#0f172a', mb: 1 }}>
        Conciliacion Bancaria
      </Typography>
      <Typography variant="body2" sx={{ color: '#64748b', mb: 2 }}>
        Sube el estado de cuenta en Excel para validar pagos en revision con tres niveles de coincidencia.
      </Typography>

      <Paper
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        sx={{
          border: `2px dashed ${dragging ? '#fb923c' : '#cbd5e1'}`,
          borderRadius: 3,
          p: 3,
          textAlign: 'center',
          bgcolor: dragging ? '#fff7ed' : '#f8fafc'
        }}
      >
        <CloudUploadIcon sx={{ fontSize: 38, color: '#fb923c', mb: 1 }} />
        <Typography sx={{ fontWeight: 700, color: '#1e293b' }}>
          Arrastra y suelta tu Excel aqui
        </Typography>
        <Typography variant="body2" sx={{ color: '#64748b', mt: 0.5 }}>
          Formatos permitidos: .xlsx y .xls
        </Typography>

        <Box sx={{ mt: 1.5, display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button variant="outlined" component="label">
            Seleccionar archivo
            <input
              type="file"
              hidden
              accept=".xlsx,.xls"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setArchivo(file);
                  setResultado(null);
                }
              }}
            />
          </Button>
          <Button
            variant="contained"
            onClick={() => procesarArchivo()}
            disabled={!archivo || loading}
            sx={{ bgcolor: '#f97316', '&:hover': { bgcolor: '#ea580c' } }}
          >
            {loading ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : 'Procesar conciliacion'}
          </Button>
          <Button
            variant="contained"
            color="success"
            onClick={confirmarTodo}
            disabled={!resultado?.pago_ids_confirmables?.length || confirmando}
          >
            {confirmando ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : `Confirmar Todo (${resultado?.pago_ids_confirmables?.length || 0})`}
          </Button>
        </Box>

        {archivo && (
          <Typography variant="caption" sx={{ display: 'block', mt: 1, color: '#475569' }}>
            Archivo seleccionado: {archivo.name}
          </Typography>
        )}
      </Paper>

      {resultado && (
        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
            <Chip label={`Excel: ${resultado.summary?.total_excel || 0}`} sx={{ bgcolor: '#e2e8f0', fontWeight: 700 }} />
            <Chip label={`En revision: ${resultado.summary?.total_sistema_en_revision || 0}`} sx={{ bgcolor: '#dbeafe', color: '#1d4ed8', fontWeight: 700 }} />
            <Chip label={`Total: ${resultado.summary?.match_total || 0}`} sx={{ bgcolor: '#dcfce7', color: '#166534', fontWeight: 700 }} />
            <Chip label={`Parcial: ${resultado.summary?.match_parcial || 0}`} sx={{ bgcolor: '#fef3c7', color: '#92400e', fontWeight: 700 }} />
            <Chip label={`Sin match: ${(resultado.summary?.sin_coincidencia_excel || 0) + (resultado.summary?.sin_coincidencia_sistema || 0)}`} sx={{ bgcolor: '#fee2e2', color: '#991b1b', fontWeight: 700 }} />
          </Box>

          <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: '#f1f5f9' }}>
                  <TableCell>Estado</TableCell>
                  <TableCell>Alumno</TableCell>
                  <TableCell>Ref. Sistema</TableCell>
                  <TableCell>Ref. Excel</TableCell>
                  <TableCell>Monto Sistema (Bs)</TableCell>
                  <TableCell>Monto Excel (Bs)</TableCell>
                  <TableCell>Fecha Sistema</TableCell>
                  <TableCell>Fecha Excel</TableCell>
                  <TableCell>Motivo</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filasComparativas.map((fila, idx) => (
                  <TableRow key={`${fila.tipo}-${idx}`}>
                    <TableCell>{estadoChip(fila.tipo)}</TableCell>
                    <TableCell>{fila.alumno}</TableCell>
                    <TableCell>{fila.referenciaSistema}</TableCell>
                    <TableCell>{fila.referenciaExcel}</TableCell>
                    <TableCell>{formatMoney(fila.montoSistema)}</TableCell>
                    <TableCell>{formatMoney(fila.montoExcel)}</TableCell>
                    <TableCell>{fila.fechaSistema || '-'}</TableCell>
                    <TableCell>{fila.fechaExcel || '-'}</TableCell>
                    <TableCell>{fila.motivo}</TableCell>
                  </TableRow>
                ))}
                {filasComparativas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <Typography variant="body2" sx={{ py: 1.5, color: '#64748b' }}>
                        No hay filas para mostrar.
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      <Snackbar open={!!error} autoHideDuration={3500} onClose={() => setError('')} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity="error" onClose={() => setError('')} sx={{ width: '100%' }}>{error}</Alert>
      </Snackbar>
      <Snackbar open={!!success} autoHideDuration={2800} onClose={() => setSuccess('')} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity="success" onClose={() => setSuccess('')} sx={{ width: '100%' }}>{success}</Alert>
      </Snackbar>
    </Box>
  );
}
