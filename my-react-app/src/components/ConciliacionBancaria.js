import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
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
  TablePagination,
  TableRow,
  Typography
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import AutorenewRoundedIcon from '@mui/icons-material/AutorenewRounded';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import './ConciliacionBancaria.css';

const MONTO_TOLERANCIA_BS = 100;
const ALLOWED_EXTENSIONS = ['xlsx', 'xls', 'txt'];

function isAllowedFile(file) {
  if (!file?.name) return false;
  const parts = String(file.name).toLowerCase().split('.');
  const extension = parts.length > 1 ? parts[parts.length - 1] : '';
  return ALLOWED_EXTENSIONS.includes(extension);
}

function formatMoney(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
  return Number(value).toFixed(2);
}

function formatDiferenciaMonto(montoSistema, montoExcel) {
  if (
    montoSistema === null || montoSistema === undefined || Number.isNaN(Number(montoSistema))
    || montoExcel === null || montoExcel === undefined || Number.isNaN(Number(montoExcel))
  ) {
    return '-';
  }

  const diferencia = Number(montoExcel) - Number(montoSistema);
  const signo = diferencia > 0 ? '+' : '';
  return `${signo}${formatMoney(diferencia)}`;
}

function formatMontoEsperado(montoBs, montoUsd) {
  const bsValido = montoBs !== null && montoBs !== undefined && !Number.isNaN(Number(montoBs));
  const usdValido = montoUsd !== null && montoUsd !== undefined && !Number.isNaN(Number(montoUsd));

  if (bsValido && usdValido) {
    return `Bs ${formatMoney(montoBs)} / $${formatMoney(montoUsd)} USD`;
  }

  if (bsValido) {
    return `Bs ${formatMoney(montoBs)}`;
  }

  if (usdValido) {
    return `$${formatMoney(montoUsd)} USD`;
  }

  return '-';
}

function estadoChip(tipo) {
  const sharedSx = {
    minWidth: 146,
    height: 32,
    justifyContent: 'flex-start',
    fontWeight: 700,
    '& .MuiChip-icon': {
      fontSize: 18
    },
    '& .MuiChip-label': {
      width: '100%',
      textAlign: 'left'
    }
  };

  if (tipo === 'match_total') {
    return <Chip icon={<CheckCircleIcon />} label="Match total" sx={{ ...sharedSx, bgcolor: '#dcfce7', color: '#166534' }} />;
  }
  if (tipo === 'match_parcial') {
    return <Chip icon={<WarningAmberIcon />} label="Match parcial" sx={{ ...sharedSx, bgcolor: '#fef3c7', color: '#92400e' }} />;
  }
  return <Chip icon={<ErrorOutlineIcon />} label="Sin coincidencia" sx={{ ...sharedSx, bgcolor: '#fee2e2', color: '#991b1b' }} />;
}

export default function ConciliacionBancaria() {
  const [archivo, setArchivo] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [resultado, setResultado] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const headers = useMemo(() => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const procesarArchivo = async (fileToProcess = archivo) => {
    if (!fileToProcess) {
      setError('Debes seleccionar un archivo para conciliar.');
      return;
    }

    if (!isAllowedFile(fileToProcess)) {
      setError('Formato no permitido. Usa .xlsx, .xls o .txt');
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
    if (!isAllowedFile(droppedFile)) {
      setError('Formato no permitido. Usa .xlsx, .xls o .txt');
      return;
    }
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
      telefonoSistema: row.sistema?.telefono_pago || '-',
      telefonoExcel: row.excel?.telefono || '-',
      montoSistema: row.sistema?.monto_bs,
      montoEsperadoSistemaBs: row.sistema?.monto_esperado_bs,
      montoEsperadoSistemaUsd: row.sistema?.monto_esperado_usd,
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
      telefonoSistema: row.sistema?.telefono_pago || '-',
      telefonoExcel: row.excel?.telefono || '-',
      montoSistema: row.sistema?.monto_bs,
      montoEsperadoSistemaBs: row.sistema?.monto_esperado_bs,
      montoEsperadoSistemaUsd: row.sistema?.monto_esperado_usd,
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
      telefonoSistema: row.sistema?.telefono_pago || '-',
      telefonoExcel: '-',
      montoSistema: row.sistema?.monto_bs,
      montoEsperadoSistemaBs: row.sistema?.monto_esperado_bs,
      montoEsperadoSistemaUsd: row.sistema?.monto_esperado_usd,
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
      telefonoSistema: '-',
      telefonoExcel: row.excel?.telefono || '-',
      montoSistema: null,
      montoEsperadoSistemaBs: null,
      montoEsperadoSistemaUsd: null,
      montoExcel: row.excel?.monto_bs,
      fechaSistema: '-',
      fechaExcel: row.excel?.fecha || '-',
      motivo: 'Existe en banco pero no fue reportado en sistema'
    }));

    return [...total, ...parcial, ...noSistema, ...noExcel];
  }, [resultado]);

  const filasPaginadas = useMemo(() => {
    const inicio = page * rowsPerPage;
    const fin = inicio + rowsPerPage;
    return filasComparativas.slice(inicio, fin);
  }, [filasComparativas, page, rowsPerPage]);

  useEffect(() => {
    setPage(0);
  }, [resultado]);

  const handleChangePage = (_, nuevaPagina) => {
    setPage(nuevaPagina);
  };

  const handleChangeRowsPerPage = (event) => {
    const nuevoValor = parseInt(event.target.value, 10);
    setRowsPerPage(nuevoValor);
    setPage(0);
  };

  const summary = resultado?.summary || {};
  const totalExcel = summary.total_excel || 0;
  const totalRevision = summary.total_sistema_en_revision || 0;
  const totalMatch = summary.match_total || 0;
  const totalParcial = summary.match_parcial || 0;
  const totalSinMatch = (summary.sin_coincidencia_excel || 0) + (summary.sin_coincidencia_sistema || 0);

  return (
    <div className="conciliacionPage">
      <Typography variant="h5" className="conciliacionTitle">
        Conciliacion Bancaria
      </Typography>
      <Typography variant="body2" className="conciliacionSubtitle" sx={{ mb: 2 }}>
        Sube el estado de cuenta en Excel o TXT para validar pagos en revision con tres niveles de coincidencia.
      </Typography>

      <div className="conciliacionInfoBar" role="status" aria-live="polite">
        <InfoOutlinedIcon sx={{ fontSize: 19 }} />
        <span>
          La conciliacion usa una tolerancia de monto de hasta <strong>Bs {MONTO_TOLERANCIA_BS.toFixed(2)}</strong> para los matches.
        </span>
      </div>

      <div className="conciliacionTopGrid">
        <Paper className="conciliacionUploadPanel" elevation={0}>
          <div className="conciliacionPanelHead">
            <Typography variant="h6" sx={{ fontWeight: 800, color: '#1f2937' }}>
              Procesamiento de Archivos
            </Typography>
            <Typography variant="caption" sx={{ color: '#94a3b8' }}>
              Formatos: .xlsx, .xls, .txt
            </Typography>
          </div>

          <div
            className={`conciliacionDropzone ${dragging ? 'isDragging' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <div className="conciliacionDropIcon">
              <CloudUploadIcon sx={{ fontSize: 28, color: '#f97316' }} />
            </div>
            <Typography sx={{ fontWeight: 700, color: '#4b5563' }}>
              Arrastra y suelta tu estado de cuenta aqui
            </Typography>
            <Typography variant="caption" sx={{ color: '#9ca3af' }}>
              o haz clic para explorar tus archivos
            </Typography>

            <Button variant="outlined" component="label" className="conciliacionSelectBtn">
              Seleccionar archivo
              <input
                type="file"
                hidden
                accept=".xlsx,.xls,.txt"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (!isAllowedFile(file)) {
                      setError('Formato no permitido. Usa .xlsx, .xls o .txt');
                      return;
                    }
                    setArchivo(file);
                    setResultado(null);
                  }
                }}
              />
            </Button>

            {archivo && (
              <div className="conciliacionSelectedFile">
                <InsertDriveFileOutlinedIcon sx={{ fontSize: 18 }} />
                <span>{archivo.name}</span>
              </div>
            )}
          </div>

          <div className="conciliacionActionRow">
            <Button
              variant="contained"
              onClick={() => procesarArchivo()}
              disabled={!archivo || loading}
              className="conciliacionProcessBtn"
              startIcon={!loading ? <AutorenewRoundedIcon /> : null}
            >
              {loading ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : 'Procesar conciliacion'}
            </Button>

            <Button
              variant="contained"
              onClick={confirmarTodo}
              disabled={!resultado?.pago_ids_confirmables?.length || confirmando}
              className="conciliacionConfirmBtn"
              startIcon={!confirmando ? <DoneAllRoundedIcon /> : null}
            >
              {confirmando ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : 'Confirmar Todo'}
            </Button>
          </div>
        </Paper>

        <Paper className="conciliacionStatusPanel" elevation={0}>
          <Typography variant="h6" sx={{ fontWeight: 800, color: '#1f2937', mb: 1 }}>
            Estado Actual
          </Typography>

          <div className="conciliacionMetricCard">
            <InsertDriveFileOutlinedIcon sx={{ fontSize: 18, color: '#111827' }} />
            <span>Total Excel</span>
            <strong>{totalExcel}</strong>
          </div>

          <div className="conciliacionMetricCard warn">
            <WarningAmberIcon sx={{ fontSize: 18, color: '#ea580c' }} />
            <span>En revision</span>
            <strong>{totalRevision}</strong>
          </div>

          <div className="conciliacionStatusChips">
            <Chip size="small" label={`TOTAL: ${totalMatch}`} className="chipTotal" />
            <Chip size="small" label={`PARCIAL: ${totalParcial}`} className="chipParcial" />
            <Chip size="small" label={`SIN MATCH: ${totalSinMatch}`} className="chipSin" />
          </div>
        </Paper>
      </div>

      {resultado && (
        <div className="conciliacionTableSection">
          <Typography variant="body2" sx={{ color: '#475569', mb: 1.5, fontWeight: 600 }}>
            Criterio actual: si la diferencia entre monto banco y monto sistema es menor o igual a Bs {MONTO_TOLERANCIA_BS.toFixed(2)}, el monto se considera coincidente.
          </Typography>

          {isMobile ? (
            <Paper className="conciliacionMobileResults" elevation={0}>
              {filasPaginadas.map((fila, idx) => (
                <article className="conciliacionMobileCard" key={`${fila.tipo}-${page * rowsPerPage + idx}`}>
                  <div className="conciliacionMobileCardHead">{estadoChip(fila.tipo)}</div>

                  <div className="conciliacionMobileRow">
                    <span className="label">Alumno</span>
                    <span className="value">{fila.alumno}</span>
                  </div>
                  <div className="conciliacionMobileRow">
                    <span className="label">Ref. Sistema</span>
                    <span className="value">{fila.referenciaSistema}</span>
                  </div>
                  <div className="conciliacionMobileRow">
                    <span className="label">Ref. Excel</span>
                    <span className="value">{fila.referenciaExcel}</span>
                  </div>
                  <div className="conciliacionMobileRow">
                    <span className="label">Tel. Sistema</span>
                    <span className="value">{fila.telefonoSistema || '-'}</span>
                  </div>
                  <div className="conciliacionMobileRow">
                    <span className="label">Tel. Banco</span>
                    <span className="value">{fila.telefonoExcel || '-'}</span>
                  </div>
                  <div className="conciliacionMobileRow">
                    <span className="label">Monto esperado</span>
                    <span className="value">{formatMontoEsperado(fila.montoEsperadoSistemaBs, fila.montoEsperadoSistemaUsd)}</span>
                  </div>
                  <div className="conciliacionMobileRow">
                    <span className="label">Monto Sistema</span>
                    <span className="value">Bs {formatMoney(fila.montoSistema)}</span>
                  </div>
                  <div className="conciliacionMobileRow">
                    <span className="label">Monto Excel</span>
                    <span className="value">Bs {formatMoney(fila.montoExcel)}</span>
                  </div>
                  <div className="conciliacionMobileRow">
                    <span className="label">Diferencia</span>
                    <span className="value">{formatDiferenciaMonto(fila.montoSistema, fila.montoExcel)}</span>
                  </div>
                  <div className="conciliacionMobileRow">
                    <span className="label">Fecha Sistema</span>
                    <span className="value">{fila.fechaSistema || '-'}</span>
                  </div>
                  <div className="conciliacionMobileRow">
                    <span className="label">Fecha Excel</span>
                    <span className="value">{fila.fechaExcel || '-'}</span>
                  </div>
                  <div className="conciliacionMobileRow">
                    <span className="label">Motivo</span>
                    <span className="value">{fila.motivo}</span>
                  </div>
                </article>
              ))}

              {filasComparativas.length === 0 && (
                <Typography variant="body2" sx={{ py: 1.5, color: '#64748b', textAlign: 'center' }}>
                  No hay filas para mostrar.
                </Typography>
              )}

              {filasComparativas.length > 0 && (
                <TablePagination
                  component="div"
                  count={filasComparativas.length}
                  page={page}
                  onPageChange={handleChangePage}
                  rowsPerPage={rowsPerPage}
                  onRowsPerPageChange={handleChangeRowsPerPage}
                  rowsPerPageOptions={[10, 25, 50]}
                  labelRowsPerPage="Filas por pagina"
                />
              )}
            </Paper>
          ) : (
            <TableContainer component={Paper} className="conciliacionTableContainer" sx={{ borderRadius: 2 }}>
              <Table size="small" stickyHeader className="conciliacionTable">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#fdfdfd' }}>
                    <TableCell>Estado</TableCell>
                    <TableCell>Alumno</TableCell>
                    <TableCell>Ref. Sistema</TableCell>
                    <TableCell>Ref. Excel</TableCell>
                    <TableCell>Tel. Sistema</TableCell>
                    <TableCell>Tel. Banco</TableCell>
                    <TableCell>Monto esperado</TableCell>
                    <TableCell>Monto Sistema (Bs)</TableCell>
                    <TableCell>Monto Excel (Bs)</TableCell>
                    <TableCell>Diferencia (Bs)</TableCell>
                    <TableCell>Fecha Sistema</TableCell>
                    <TableCell>Fecha Excel</TableCell>
                    <TableCell>Motivo</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filasPaginadas.map((fila, idx) => (
                    <TableRow key={`${fila.tipo}-${page * rowsPerPage + idx}`}>
                      <TableCell>{estadoChip(fila.tipo)}</TableCell>
                      <TableCell>{fila.alumno}</TableCell>
                      <TableCell>{fila.referenciaSistema}</TableCell>
                      <TableCell>{fila.referenciaExcel}</TableCell>
                      <TableCell>{fila.telefonoSistema || '-'}</TableCell>
                      <TableCell>{fila.telefonoExcel || '-'}</TableCell>
                      <TableCell>{formatMontoEsperado(fila.montoEsperadoSistemaBs, fila.montoEsperadoSistemaUsd)}</TableCell>
                      <TableCell>{formatMoney(fila.montoSistema)}</TableCell>
                      <TableCell>{formatMoney(fila.montoExcel)}</TableCell>
                      <TableCell>{formatDiferenciaMonto(fila.montoSistema, fila.montoExcel)}</TableCell>
                      <TableCell>{fila.fechaSistema || '-'}</TableCell>
                      <TableCell>{fila.fechaExcel || '-'}</TableCell>
                      <TableCell>{fila.motivo}</TableCell>
                    </TableRow>
                  ))}
                  {filasComparativas.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={13}>
                        <Typography variant="body2" sx={{ py: 1.5, color: '#64748b' }}>
                          No hay filas para mostrar.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              {filasComparativas.length > 0 && (
                <TablePagination
                  component="div"
                  count={filasComparativas.length}
                  page={page}
                  onPageChange={handleChangePage}
                  rowsPerPage={rowsPerPage}
                  onRowsPerPageChange={handleChangeRowsPerPage}
                  rowsPerPageOptions={[10, 25, 50]}
                  labelRowsPerPage="Filas por pagina"
                />
              )}
            </TableContainer>
          )}
        </div>
      )}

      <Snackbar open={!!error} autoHideDuration={3500} onClose={() => setError('')} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity="error" onClose={() => setError('')} sx={{ width: '100%' }}>{error}</Alert>
      </Snackbar>
      <Snackbar open={!!success} autoHideDuration={2800} onClose={() => setSuccess('')} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity="success" onClose={() => setSuccess('')} sx={{ width: '100%' }}>{success}</Alert>
      </Snackbar>
    </div>
  );
}
