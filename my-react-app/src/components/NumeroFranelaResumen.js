import React, { useEffect, useState } from 'react';
import { Alert, Box, Chip, CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material';

function fechaNacimiento(value) {
  const fecha = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return fecha ? `${fecha[3]}/${fecha[2]}/${fecha[1]}` : '-';
}

function TablaAtletas({ atletas, numero }) {
  return (
    <TableContainer sx={{ maxHeight: 230, overflow: 'auto' }}>
      <Table size="small" stickyHeader sx={{ minWidth: 630, '& th, & td': { px: 1, py: 0.75, fontSize: 11, borderColor: '#e2e8f0' }, '& th': { bgcolor: '#f8fafc', color: '#475569', fontWeight: 700 } }}>
        <TableHead>
          <TableRow>
            {['Atleta', 'Nro.', 'Nacimiento', 'Categoria', 'Sexo', 'Division', 'Sede'].map((titulo) => <TableCell key={titulo}>{titulo}</TableCell>)}
          </TableRow>
        </TableHead>
        <TableBody>
          {atletas.map((alumno) => (
            <TableRow key={alumno._id}>
              <TableCell sx={{ minWidth: 140, overflowWrap: 'anywhere' }}>
                <Box sx={{ fontWeight: 700 }}>{`${alumno.nombres || ''} ${alumno.apellidos || ''}`.trim() || '-'}</Box>
                {(alumno.activo === false || alumno.dado_de_baja || /^(baja|inactivo)$/i.test(alumno.estado || '')) && <Typography sx={{ fontSize: 10, color: '#b91c1c' }}>De baja</Typography>}
              </TableCell>
              <TableCell>{numero}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{fechaNacimiento(alumno.fecha_nacimiento)}</TableCell>
              <TableCell>{alumno.categoria || '-'}</TableCell>
              <TableCell>{alumno.sexo || '-'}</TableCell>
              <TableCell>{alumno.division || '-'}</TableCell>
              <TableCell>{alumno.sede?.nombre || '-'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

export default function NumeroFranelaResumen({ pedido }) {
  const [open, setOpen] = useState(false);
  const [resumen, setResumen] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const numero = Number(pedido.numero_franela);
  const numeroValido = Number.isInteger(numero) && numero >= 1 && numero <= 100;

  useEffect(() => {
    if (!open || !numeroValido) return undefined;
    const controller = new AbortController();
    const cargar = async () => {
      setLoading(true);
      setError('');
      setResumen(null);
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/uniformes/pedidos/${pedido._id}/resumen-numero`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
          cache: 'no-store'
        });
        if (!response.ok) throw new Error('No se pudo cargar el resumen del numero.');
        const data = await response.json();
        if (!controller.signal.aborted) setResumen(data);
      } catch (err) {
        if (!controller.signal.aborted) setError(err.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    cargar();
    return () => controller.abort();
  }, [open, numeroValido, numero, pedido._id]);

  if (!numeroValido) return <span>-</span>;

  const origen = pedido.numero_franela_primera_eleccion === true
    ? 'Primera eleccion del numero en esta solicitud'
    : pedido.numero_franela_primera_eleccion === false
      ? pedido.uniforme?.franela_representante
        ? 'Numero personalizado para representante'
        : 'Numero previamente asignado al atleta'
      : 'Origen del numero no registrado en esta solicitud';

  return (
    <Tooltip
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
      enterDelay={250}
      enterTouchDelay={0}
      leaveDelay={180}
      placement="auto"
      arrow
      slotProps={{ tooltip: { sx: { bgcolor: '#fff', color: '#0f172a', border: '1px solid #cbd5e1', borderRadius: 1, boxShadow: '0 8px 24px rgba(15,23,42,0.18)', width: 'min(780px, calc(100vw - 32px))', maxWidth: 'calc(100vw - 32px)', p: 1.5 } }, arrow: { sx: { color: '#fff' } } }}
      title={
        <Box>
          <Typography sx={{ fontSize: 13, fontWeight: 700 }}>Franela #{numero}</Typography>
          <Typography sx={{ fontSize: 11, color: '#64748b', mb: 1 }}>{origen}</Typography>
          {loading ? <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', py: 1 }}><CircularProgress size={16} /><Typography sx={{ fontSize: 12 }}>Cargando atletas...</Typography></Box> : error ? <Alert severity="error">{error}</Alert> : resumen ? (
            <>
              {resumen.alumno ? <TablaAtletas atletas={[resumen.alumno]} numero={numero} /> : <Typography sx={{ fontSize: 12 }}>Atleta no disponible</Typography>}
              <Typography sx={{ mt: 1.5, mb: 0.5, fontSize: 12, fontWeight: 700 }}>Otros atletas con el mismo numero en la academia ({resumen.coincidencias.length})</Typography>
              {resumen.coincidencias.length ? <TablaAtletas atletas={resumen.coincidencias} numero={numero} /> : <Typography sx={{ fontSize: 12, color: '#64748b' }}>No hay otros atletas con este numero.</Typography>}
            </>
          ) : null}
        </Box>
      }
    >
      <Box
        component="button"
        type="button"
        aria-label={`Ver resumen de franela ${numero}${pedido.numero_franela_primera_eleccion === true ? ', primera eleccion' : ''}`}
        onClick={(event) => { event.stopPropagation(); setOpen((prev) => !prev); }}
        sx={{ display: 'inline-flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5, p: 0.25, m: 0, minWidth: 24, border: 0, borderRadius: 0.5, bgcolor: 'transparent', color: '#1d4ed8', font: 'inherit', cursor: 'pointer', '&:hover': { bgcolor: '#eff6ff' }, '&:focus-visible': { outline: '2px solid #2563eb', outlineOffset: 2 } }}
      >
        <Box component="span" sx={{ textDecoration: 'underline', textDecorationStyle: 'dotted', textUnderlineOffset: '3px' }}>{pedido.numero_franela}</Box>
        {pedido.numero_franela_primera_eleccion === true && <Chip component="span" label="Nuevo" size="small" sx={{ height: 18, fontSize: 10, bgcolor: '#dcfce7', color: '#166534', '& .MuiChip-label': { px: 0.5 } }} />}
      </Box>
    </Tooltip>
  );
}