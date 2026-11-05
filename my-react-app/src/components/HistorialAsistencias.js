import React, { useState } from 'react';
import { Alert, Avatar, Box, Button, ButtonBase, Chip, LinearProgress, MenuItem, Stack, TablePagination, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import TableViewOutlinedIcon from '@mui/icons-material/TableViewOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { mediaUrl } from '../utils/mediaUrl';

const ESTADOS = {
  presente: { texto: 'Presente', fondo: '#ddf7e9', color: '#17603b' },
  ausente: { texto: 'Ausente', fondo: '#ffe7e7', color: '#a32942' },
  justificado: { texto: 'Justificado', fondo: '#e4ecff', color: '#3156a4' },
  '': { texto: 'Sin marcar', fondo: '#fff0d9', color: '#855009' }
};
const colorPorcentaje = valor => valor < 75 ? '#c72d42' : valor < 90 ? '#b9790c' : '#187349';
const iniciales = nombre => nombre.split(/[\s,]+/).filter(Boolean).slice(0, 2).map(parte => parte[0]).join('');
const ESTILO_FILTRO = { '&&': { m: 0, border: '1px solid #d1d5db', borderRadius: '6px', minHeight: 36, textTransform: 'none', fontSize: 12, fontWeight: 600, px: 1.2, py: 0.5, color: '#4b5563', bgcolor: '#fff', '&:hover': { bgcolor: '#f3f4f6', borderColor: '#9ca3af' }, '&.Mui-selected': { bgcolor: '#4b5563', borderColor: '#4b5563', color: '#fff', '&:hover': { bgcolor: '#374151', borderColor: '#374151', color: '#fff' } }, '&.Mui-focusVisible': { outline: '2px solid #6b7280', outlineOffset: 2 } } };

export default function HistorialAsistencias({ reporte, mes, onMes, onAbrirLista, abriendo }) {
  const esMovil = useMediaQuery(useTheme().breakpoints.down('md'));
  const [grupoId, setGrupoId] = useState('');
  const [categoria, setCategoria] = useState('');
  const [filtro, setFiltro] = useState('todos');
  const [busqueda, setBusqueda] = useState('');
  const [alumnoId, setAlumnoId] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [exportando, setExportando] = useState('');
  const [errorExportar, setErrorExportar] = useState('');
  const grupos = reporte.grupos || [];
  const grupo = grupos.find(item => item.grupo === grupoId) || grupos[0];
  const categorias = [...new Set((grupo?.alumnos || []).map(item => item.categoria).filter(Boolean))].sort();
  const categoriaActiva = categorias.includes(categoria) ? categoria : '';
  const alumnos = (grupo?.alumnos || []).filter(item => (!categoriaActiva || item.categoria === categoriaActiva) && item.nombre.toLocaleLowerCase().includes(busqueda.toLocaleLowerCase()) && (filtro === 'todos' || (filtro === 'baja' ? item.porcentaje < 75 : item.ausentes >= 3)));
  const paginaActual = Math.min(page, Math.max(0, Math.ceil(alumnos.length / rowsPerPage) - 1));
  const alumnosVisibles = alumnos.slice(paginaActual * rowsPerPage, (paginaActual + 1) * rowsPerPage);
  const alumno = alumnosVisibles.find(item => item.alumno === alumnoId) || alumnosVisibles[0];
  const inicio = new Date(`${mes}-01T12:00:00Z`);
  const fin = new Date(inicio);
  fin.setUTCMonth(fin.getUTCMonth() + 1);
  fin.setUTCDate(0);
  const espacios = (inicio.getUTCDay() + 6) % 7;
  const mesTexto = new Intl.DateTimeFormat('es-VE', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(inicio);
  const porFecha = new Map((alumno?.registros || []).map(item => [item.fecha, item]));

  const exportar = async formato => {
    setExportando(formato); setErrorExportar('');
    const encabezados = ['Alumno', 'Categoria', 'Sesiones', 'Presente', 'Ausente', 'Justificado', 'Sin marcar', 'Asistencia %'];
    const filas = alumnos.map(item => [item.nombre, item.categoria, item.total, item.presentes, item.ausentes, item.justificados, item.sin_marcar, item.porcentaje]);
    try {
      if (formato === 'excel') {
        const { default: ExcelJS } = await import('exceljs');
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Asistencias');
        sheet.addRow([grupo.nombre, mesTexto]);
        sheet.addRow(encabezados);
        sheet.getRow(2).font = { bold: true };
        filas.forEach(fila => {
          const row = sheet.addRow(fila);
          row.eachCell(cell => { if (typeof cell.value === 'string') cell.value = { richText: [{ text: cell.value }] }; });
        });
        sheet.columns.forEach((column, index) => { column.width = index === 0 ? 32 : 18; });
        sheet.views = [{ state: 'frozen', ySplit: 2 }];
        const buffer = await workbook.xlsx.writeBuffer();
        const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        const link = document.createElement('a');
        link.href = url; link.download = `asistencias-${mes}.xlsx`; link.click();
        URL.revokeObjectURL(url);
      } else {
        const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
        const doc = new jsPDF({ orientation: 'landscape' });
        doc.setFontSize(14); doc.text(`Asistencias - ${mesTexto}`, 14, 16);
        doc.setFontSize(10); doc.text(grupo.nombre, 14, 24);
        autoTable(doc, { head: [encabezados], body: filas, startY: 30, styles: { fontSize: 9 }, headStyles: { fillColor: [32, 29, 88] } });
        doc.save(`asistencias-${mes}.pdf`);
      }
    } catch (error) { setErrorExportar('No se pudo exportar el historial. Intenta de nuevo.'); }
    finally { setExportando(''); }
  };

  return <Box sx={{ minWidth: 0 }}>
    <Stack direction={{ xs: 'column', sm: 'row' }} flexWrap="wrap" gap={1.5} mb={2}>
      <TextField type="month" label="Mes" size="small" value={mes} onChange={event => { if (/^\d{4}-\d{2}$/.test(event.target.value)) { setPage(0); onMes(event.target.value); } }} InputLabelProps={{ shrink: true }} sx={{ width: { xs: '100%', sm: 240 }, maxWidth: '100%', flexShrink: 0 }} />
      <TextField select label="Grupo" size="small" value={grupo?.grupo || ''} disabled={!grupos.length} onChange={event => { setGrupoId(event.target.value); setCategoria(''); setAlumnoId(''); setPage(0); }} sx={{ minWidth: 0, width: { xs: '100%', sm: 230 } }}>
        {!grupos.length && <MenuItem value="">Sin sesiones</MenuItem>}
        {grupos.map(item => <MenuItem key={item.grupo} value={item.grupo}>{item.nombre}</MenuItem>)}
      </TextField>
      <TextField select label="Categoria" size="small" value={categoriaActiva} onChange={event => { setCategoria(event.target.value); setPage(0); }} sx={{ width: { xs: '100%', sm: 180 } }}>
        <MenuItem value="">Todas</MenuItem>{categorias.map(item => <MenuItem key={item} value={item}>{item}</MenuItem>)}
      </TextField>
    </Stack>
    {!grupo ? <Alert severity="info">No hay asistencias guardadas en este mes.</Alert> : <>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} gap={1.5} mb={2}>
        <Box sx={{ minWidth: 0 }}><Typography component="h2" sx={{ fontSize: 20, fontWeight: 800 }}>Historial de asistencia</Typography><Typography sx={{ fontSize: 13, color: '#747984', overflowWrap: 'anywhere', textTransform: 'capitalize' }}>{mesTexto} - {grupo.nombre} - {grupo.sesiones} {grupo.sesiones === 1 ? 'sesion registrada' : 'sesiones registradas'}</Typography></Box>
        <Stack direction="row" gap={1}><Button variant="outlined" size="small" startIcon={<TableViewOutlinedIcon />} onClick={() => exportar('excel')} disabled={!alumnos.length || Boolean(exportando)} sx={{ color: '#187349', borderColor: '#dce4df' }}>{exportando === 'excel' ? 'Exportando...' : 'Excel'}</Button><Button variant="outlined" size="small" startIcon={<PictureAsPdfOutlinedIcon />} onClick={() => exportar('pdf')} disabled={!alumnos.length || Boolean(exportando)} sx={{ color: '#c72d42', borderColor: '#eadde0' }}>{exportando === 'pdf' ? 'Exportando...' : 'PDF'}</Button></Stack>
      </Stack>
      {errorExportar && <Alert severity="error" sx={{ mb: 2 }}>{errorExportar}</Alert>}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(0, 1fr) 270px' }, gap: 3, alignItems: 'start' }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack gap={1.5} mb={2}>
            <ToggleButtonGroup exclusive size="small" value={filtro} onChange={(_, value) => { if (value) { setFiltro(value); setPage(0); } }} aria-label="Filtrar asistencia" sx={{ alignSelf: 'flex-start', flexWrap: 'wrap', gap: 0.7 }}>
              <ToggleButton value="todos" sx={ESTILO_FILTRO}>Todos</ToggleButton><ToggleButton value="baja" sx={ESTILO_FILTRO}>Menos de 75%</ToggleButton><ToggleButton value="ausencias" sx={ESTILO_FILTRO}>3+ ausencias</ToggleButton>
            </ToggleButtonGroup>
            <TextField size="small" label="Buscar alumno" value={busqueda} onChange={event => { setBusqueda(event.target.value); setPage(0); }} fullWidth />
          </Stack>
          {!alumnos.length ? <Alert severity="info">No hay alumnos con estos filtros.</Alert> : esMovil ? <Box component="ul" aria-label="Resumen mensual de asistencia" sx={{ listStyle: 'none', p: 0, m: 0, minWidth: 0 }}>
            {alumnosVisibles.map(item => <Box component="li" key={item.alumno} sx={{ minWidth: 0, borderBottom: '1px solid #e5e7eb' }}>
              <ButtonBase onClick={() => setAlumnoId(item.alumno)} aria-label={`Ver calendario de ${item.nombre}`} aria-pressed={alumno?.alumno === item.alumno} sx={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 1, width: '100%', minWidth: 0, py: 1.5, pl: 1, pr: 1.25, textAlign: 'left', borderLeft: '3px solid', borderLeftColor: alumno?.alumno === item.alumno ? '#6b7280' : 'transparent', bgcolor: alumno?.alumno === item.alumno ? '#f3f4f6' : '#fff', '&:hover': { bgcolor: '#f9fafb' }, '&.Mui-focusVisible': { outline: '2px solid #6b7280', outlineOffset: -2 } }}>
                <Stack direction="row" alignItems="center" gap={1}>
                  <Avatar src={mediaUrl(item.foto)} alt="" sx={{ width: 36, height: 36, flexShrink: 0, bgcolor: '#e5e7eb', color: '#4b5563', fontSize: 12, fontWeight: 800 }}>{iniciales(item.nombre)}</Avatar>
                  <Box sx={{ minWidth: 0, flex: 1 }}><Typography sx={{ fontSize: 13, fontWeight: 700, color: '#374151', lineHeight: 1.4, overflowWrap: 'anywhere' }}>{item.nombre}</Typography><Typography sx={{ fontSize: 11, color: '#6b7280', overflowWrap: 'anywhere' }}>{item.categoria}</Typography></Box>
                  <Typography sx={{ minWidth: 44, flexShrink: 0, textAlign: 'right', fontSize: 16, fontWeight: 800, color: colorPorcentaje(item.porcentaje) }}>{item.porcentaje}%</Typography>
                </Stack>
                <Stack direction="row" alignItems="center" gap={1}><LinearProgress variant="determinate" value={item.porcentaje} aria-label={`Porcentaje de ${item.nombre}`} sx={{ flex: 1, minWidth: 0, height: 5, borderRadius: 1, bgcolor: '#e5e7eb', '& .MuiLinearProgress-bar': { bgcolor: colorPorcentaje(item.porcentaje), borderRadius: 1 } }} /><Typography sx={{ fontSize: 11, color: '#6b7280', flexShrink: 0 }}>{item.presentes}/{item.total} sesiones</Typography></Stack>
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 0.5 }}>
                  {[[item.presentes, 'Pres.', 'Presentes', '#187349'], [item.ausentes, 'Aus.', 'Ausentes', '#a32942'], [item.justificados, 'Justif.', 'Justificados', '#855009'], [item.sin_marcar, 'Sin marcar', 'Sin marcar', '#6b7280']].map(([cantidad, etiqueta, nombre, color]) => <Box key={nombre} component="span" aria-label={`${nombre}: ${cantidad}`} sx={{ minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 0.5 }}><Typography component="span" sx={{ fontSize: 12, fontWeight: 800, color }}>{cantidad}</Typography><Typography component="span" sx={{ fontSize: 10, color: '#6b7280', overflowWrap: 'anywhere' }}>{etiqueta}</Typography></Box>)}
                </Box>
              </ButtonBase>
            </Box>)}
          </Box> : <Box sx={{ overflowX: 'auto', maxWidth: '100%' }}>
            <Box component="table" aria-label="Resumen mensual de asistencia" sx={{ width: '100%', minWidth: 660, borderCollapse: 'collapse', '& th': { textAlign: 'center', fontSize: 11, fontWeight: 800, color: '#676977', py: 1.2, px: 0.8, borderBottom: '1px solid #e8e8ee', whiteSpace: 'nowrap' }, '& td': { py: 1.1, px: 0.8, borderBottom: '1px solid #eff0f4', textAlign: 'center', fontSize: 12 } }}>
              <thead><tr><th scope="col" style={{ textAlign: 'left', width: '32%' }}>Alumno</th><th scope="col" style={{ width: '23%' }}>Asistio</th><th scope="col">Pres.</th><th scope="col">Aus.</th><th scope="col">Just.</th><th scope="col">Sin marcar</th><th scope="col">%</th></tr></thead>
              <tbody>{alumnosVisibles.map(item => <Box component="tr" key={item.alumno} sx={{ bgcolor: alumno?.alumno === item.alumno ? '#f3f5ff' : '#fff', '&:hover': { bgcolor: '#f7f8fc' } }}>
                <td><ButtonBase onClick={() => setAlumnoId(item.alumno)} aria-label={`Ver calendario de ${item.nombre}`} aria-pressed={alumno?.alumno === item.alumno} sx={{ display: 'flex', justifyContent: 'flex-start', width: '100%', gap: 1, textAlign: 'left', borderRadius: 1, minHeight: 36 }}><Avatar src={mediaUrl(item.foto)} alt={item.nombre} sx={{ width: 32, height: 32, bgcolor: '#e9eaff', color: '#4946a2', fontSize: 11, fontWeight: 800 }}>{iniciales(item.nombre)}</Avatar><Box sx={{ minWidth: 0 }}><Typography sx={{ fontSize: 12, fontWeight: 700, overflowWrap: 'anywhere' }}>{item.nombre}</Typography><Typography sx={{ fontSize: 10, color: '#747984' }}>{item.categoria}</Typography></Box></ButtonBase></td>
                <td><Stack direction="row" alignItems="center" gap={1}><LinearProgress variant="determinate" value={item.porcentaje} aria-label={`Porcentaje de ${item.nombre}`} sx={{ flex: 1, minWidth: 55, height: 6, borderRadius: 1, bgcolor: '#eceef2', '& .MuiLinearProgress-bar': { bgcolor: colorPorcentaje(item.porcentaje), borderRadius: 1 } }} /><Typography sx={{ fontSize: 11, fontWeight: 700, minWidth: 32 }}>{item.presentes}/{item.total}</Typography></Stack></td>
                <td style={{ color: '#187349', fontWeight: 700 }}>{item.presentes}</td><td style={{ color: '#a32942', fontWeight: 700 }}>{item.ausentes}</td><td style={{ color: '#3156a4', fontWeight: 700 }}>{item.justificados}</td><td style={{ color: '#855009' }}>{item.sin_marcar}</td><td style={{ color: colorPorcentaje(item.porcentaje), fontWeight: 800 }}>{item.porcentaje}%</td>
              </Box>)}</tbody>
            </Box>
          </Box>}
          <TablePagination component="div" count={alumnos.length} page={paginaActual} rowsPerPage={rowsPerPage} rowsPerPageOptions={[10, 25, 50]} onPageChange={(_, value) => { setPage(value); setAlumnoId(''); }} onRowsPerPageChange={event => { setRowsPerPage(Number(event.target.value)); setPage(0); setAlumnoId(''); }} labelRowsPerPage="Filas:" labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count}`} getItemAriaLabel={tipo => tipo === 'next' ? 'Pagina siguiente' : 'Pagina anterior'} sx={{ '& .MuiTablePagination-toolbar': { px: 0, minHeight: 48, flexWrap: 'wrap', justifyContent: 'flex-end' }, '& .MuiTablePagination-spacer': { display: 'none' }, '& .MuiTablePagination-selectLabel, & .MuiTablePagination-displayedRows': { fontSize: 12 }, '& .MuiTablePagination-select': { fontSize: 12 }, '& .MuiTablePagination-input': { mx: 1 }, '& .MuiTablePagination-actions': { ml: 1 }, '& .MuiTablePagination-displayedRows': { ml: 'auto' } }} />
        </Box>
        {alumno && <Box component="aside" aria-label={`Calendario de ${alumno.nombre}`} sx={{ minWidth: 0, borderLeft: { lg: '1px solid #eceef2' }, borderTop: { xs: '1px solid #eceef2', lg: 0 }, pl: { lg: 2.5 }, pt: { xs: 2, lg: 0 } }}>
          <Stack direction="row" alignItems="center" gap={1.2} mb={2.5}><Avatar src={mediaUrl(alumno.foto)} alt={alumno.nombre} sx={{ width: 42, height: 42, bgcolor: '#e9eaff', color: '#4946a2', fontSize: 14, fontWeight: 800 }}>{iniciales(alumno.nombre)}</Avatar><Box sx={{ minWidth: 0 }}><Typography sx={{ fontSize: 14, fontWeight: 800, overflowWrap: 'anywhere' }}>{alumno.nombre}</Typography><Typography sx={{ fontSize: 11, color: '#747984' }}>{alumno.categoria} - {alumno.presentes}/{alumno.total} presentes</Typography></Box></Stack>
          <Typography sx={{ fontSize: 12, fontWeight: 800, textTransform: 'uppercase', mb: 1.5 }}>{mesTexto}</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 0.5, maxWidth: 350 }}>
            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((dia, index) => <Typography key={index} sx={{ textAlign: 'center', fontSize: 10, color: '#9298a5', pb: 0.5 }}>{dia}</Typography>)}
            {Array.from({ length: espacios }, (_, index) => <Box key={`espacio-${index}`} />)}
            {Array.from({ length: fin.getUTCDate() }, (_, index) => {
              const dia = index + 1;
              const fecha = `${mes}-${String(dia).padStart(2, '0')}`;
              const registro = porFecha.get(fecha);
              const estado = registro ? ESTADOS[registro.estado] : null;
              const label = `${fecha}: ${estado?.texto || 'Sin registro'}`;
              return registro ? <Tooltip key={fecha} title={`${label}${registro.observacion ? ` - ${registro.observacion}` : ''}`}><ButtonBase disabled={abriendo} aria-label={label} onClick={() => onAbrirLista({ grupo: grupo.grupo, fecha })} sx={{ aspectRatio: '1', minWidth: 0, borderRadius: 1, bgcolor: estado.fondo, color: estado.color, fontSize: 11, fontWeight: 700 }}>{dia}</ButtonBase></Tooltip> : <Box key={fecha} sx={{ aspectRatio: '1', display: 'grid', placeItems: 'center', color: '#a7abb4', fontSize: 11 }}>{dia}</Box>;
            })}
          </Box>
          <Stack direction="row" gap={1} flexWrap="wrap" mt={2}>{Object.values(ESTADOS).map(estado => <Stack key={estado.texto} direction="row" alignItems="center" gap={0.5}><Box sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: estado.fondo }} /><Typography sx={{ fontSize: 10, color: '#747984' }}>{estado.texto}</Typography></Stack>)}</Stack>
          <Stack gap={1} mt={2}>{alumno.porcentaje < 75 && <Alert severity="warning" icon={false} sx={{ bgcolor: '#fff0f1', color: '#a32942', fontSize: 12, borderRadius: 1 }}>Asistencia menor al 75% este mes.</Alert>}{alumno.sin_marcar > 0 && <Chip size="small" label={`${alumno.sin_marcar} sin marcar`} sx={{ alignSelf: 'flex-start', bgcolor: '#fff0d9', color: '#855009', borderRadius: 1 }} />}</Stack>
        </Box>}
      </Box>
    </>}
  </Box>;
}