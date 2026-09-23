import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Rnd } from 'react-rnd';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import { useNavigate, useParams } from 'react-router-dom';
import { mediaUrl } from '../utils/mediaUrl';
import { CATEGORIAS_DISPONIBLES } from '../utils/categoria';

const EMPTY_FIELDS = {
  titulo: '',
  subtitulo: '',
  texto_institucional: '',
  club: '',
  categoria: '',
  equipo: '',
  entrenador_principal: '',
  asistente: '',
  asistentes: []
};

function normalizeDocumentFields(fields = {}) {
  const asistentes = (Array.isArray(fields.asistentes) ? fields.asistentes : [fields.asistente])
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .slice(0, 4);
  return { ...EMPTY_FIELDS, ...fields, asistente: asistentes[0] || '', asistentes };
}

function calculateAge(birthDate) {
  if (!birthDate) return '';
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDifference = today.getMonth() - birth.getMonth();
  if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? `${age} años` : '';
}

function RosterDocumentEditor() {
  const { torneoId, rosterId } = useParams();
  const navigate = useNavigate();
  const paperRef = useRef(null);
  const previewRef = useRef(null);
  const token = localStorage.getItem('token');
  const [roster, setRoster] = useState(null);
  const [template, setTemplate] = useState(null);
  const [documento, setDocumento] = useState({ incluir_fotos_cedula: false, logos_inicializados: false, campos: EMPTY_FIELDS, logos: [] });
  const [selectedLogo, setSelectedLogo] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [paperScale, setPaperScale] = useState(1);
  const [notice, setNotice] = useState({ open: false, severity: 'success', message: '' });

  const authHeaders = useCallback((headers = {}) => ({
    ...headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }), [token]);

  const loadDocument = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/rosters/${rosterId}/documento`, {
        headers: authHeaders()
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'No se pudo cargar el documento');
      setRoster(data.roster);
      setTemplate(data.template);
      setDocumento({
        incluir_fotos_cedula: data.roster?.documento?.incluir_fotos_cedula === true,
        logos_inicializados: data.roster?.documento?.logos_inicializados === true,
        campos: normalizeDocumentFields(data.roster?.documento?.campos),
        logos: data.roster?.documento?.logos || []
      });
    } catch (error) {
      setNotice({ open: true, severity: 'error', message: error.message });
    } finally {
      setLoading(false);
    }
  }, [authHeaders, rosterId]);

  useEffect(() => {
    loadDocument();
  }, [loadDocument]);

  useEffect(() => {
    if (!previewRef.current) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      const availableWidth = Math.max(280, entry.contentRect.width - 4);
      setPaperScale(Math.min(1, availableWidth / 794));
    });
    observer.observe(previewRef.current);
    return () => observer.disconnect();
  }, [loading]);

  const updateField = (field, value) => {
    setDocumento((current) => ({
      ...current,
      campos: { ...current.campos, [field]: value }
    }));
  };

  const updateAssistant = (index, value) => {
    setDocumento((current) => {
      const asistentes = [...current.campos.asistentes];
      asistentes[index] = value;
      return { ...current, campos: { ...current.campos, asistente: asistentes[0] || '', asistentes } };
    });
  };

  const addAssistant = () => {
    setDocumento((current) => {
      if (current.campos.asistentes.length >= 4) return current;
      return { ...current, campos: { ...current.campos, asistentes: [...current.campos.asistentes, ''] } };
    });
  };

  const removeAssistant = (index) => {
    setDocumento((current) => {
      const asistentes = current.campos.asistentes.filter((_, assistantIndex) => assistantIndex !== index);
      return { ...current, campos: { ...current.campos, asistente: asistentes[0] || '', asistentes } };
    });
  };

  const updateLogo = (logoId, changes) => {
    setDocumento((current) => ({
      ...current,
      logos: current.logos.map((logo) => ((logo._id || logo.url) === logoId ? { ...logo, ...changes } : logo))
    }));
  };

  const saveDocument = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/rosters/${rosterId}/documento`, {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ documento })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'No se pudo guardar el documento');
      setDocumento({
        incluir_fotos_cedula: data.documento.incluir_fotos_cedula === true,
        logos_inicializados: data.documento.logos_inicializados === true,
        campos: normalizeDocumentFields(data.documento.campos),
        logos: data.documento.logos || []
      });
      setNotice({ open: true, severity: 'success', message: 'Documento guardado.' });
      return true;
    } catch (error) {
      setNotice({ open: true, severity: 'error', message: error.message });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (documento.logos.length >= 4) {
      setNotice({ open: true, severity: 'warning', message: 'El documento admite hasta cuatro logos.' });
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/rosters/${rosterId}/documento/logos`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'No se pudo subir el logo');
      setDocumento((current) => ({ ...current, logos: data.logos || [...current.logos, data.logo] }));
      setSelectedLogo(data.logo?._id || data.logo?.url || '');
    } catch (error) {
      setNotice({ open: true, severity: 'error', message: error.message });
    } finally {
      setUploading(false);
    }
  };

  const removeSelectedLogo = () => {
    if (!selectedLogo) return;
    setDocumento((current) => ({
      ...current,
      logos: current.logos.filter((logo) => (logo._id || logo.url) !== selectedLogo)
    }));
    setSelectedLogo('');
  };

  const download = async (format) => {
    try {
      const saved = await saveDocument();
      if (!saved) return;
      const response = await fetch(`${process.env.REACT_APP_API_URL}/api/rosters/${rosterId}/${format}`, {
        headers: authHeaders()
      });
      if (!response.ok) throw new Error(`No se pudo generar el ${format.toUpperCase()}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `roster-${rosterId}.${format}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setNotice({ open: true, severity: 'error', message: error.message });
    }
  };

  if (loading) {
    return <Box sx={{ display: 'grid', placeItems: 'center', minHeight: 360 }}><CircularProgress size={30} /></Box>;
  }

  const cedulasDisponibles = (roster?.jugadores || [])
    .map((player, index) => ({ player, rosterIndex: index }))
    .filter(({ player }) => Boolean(player.foto_cedula));
  const playerTableBottom = 190 + 28 + ((roster?.jugadores || []).length * 77);
  const idCardRowHeight = 181;
  const receiptHeight = 44;
  const firstPageIdRows = Math.max(0, Math.floor((1123 - 38 - receiptHeight - playerTableBottom) / idCardRowHeight));
  const firstPageIdCount = firstPageIdRows * 2;
  const firstPageCedulas = documento.incluir_fotos_cedula
    ? cedulasDisponibles.slice(0, firstPageIdCount)
    : [];
  const remainingCedulas = documento.incluir_fotos_cedula
    ? cedulasDisponibles.slice(firstPageIdCount)
    : [];
  const cedulaPages = [];
  for (let index = 0; index < remainingCedulas.length; index += 8) {
    cedulaPages.push(remainingCedulas.slice(index, index + 8));
  }
  const extraPageCount = cedulaPages.length;
  const categoriasDisponibles = Array.from(new Set([
    documento.campos.categoria,
    ...CATEGORIAS_DISPONIBLES
  ].filter(Boolean)));
  const receiptBlock = (
    <Box sx={{ mt: 1, fontFamily: 'Arial, sans-serif', fontSize: 10, fontWeight: 700, lineHeight: 1.6 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline' }}>
        <Box component="span" sx={{ whiteSpace: 'nowrap' }}>Recibido por:</Box>
        <Box sx={{ flex: 1, ml: 0.5, borderBottom: '1px solid #111' }} />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline' }}>
        <Box component="span" sx={{ whiteSpace: 'nowrap' }}>Fecha, lugar y hora:</Box>
        <Box sx={{ flex: 1, ml: 0.5, borderBottom: '1px solid #111' }} />
      </Box>
    </Box>
  );

  const sectionSx = {
    border: '1px solid #e5eaf1',
    borderRadius: '10px !important',
    bgcolor: '#fff',
    boxShadow: '0 4px 16px rgba(31, 42, 55, 0.04)',
    overflow: 'hidden',
    '&:before': { display: 'none' },
    '&.Mui-expanded': { margin: 0 }
  };
  const fieldSx = {
    '& .MuiInputLabel-root': { fontSize: 11, fontWeight: 800, color: '#667085', textTransform: 'uppercase' },
    '& .MuiOutlinedInput-root': {
      bgcolor: '#fbfcfe',
      borderRadius: 1.5,
      fontSize: 12,
      '& fieldset': { borderColor: '#e4e9f0' },
      '&:hover fieldset': { borderColor: '#b8c2d1' },
      '&.Mui-focused fieldset': { borderColor: '#d95f21' }
    }
  };

  return (
    <Box sx={{ minHeight: 'calc(100vh - 82px)', bgcolor: '#fff', mx: { xs: -2, md: -3 }, my: -2, p: { xs: 1.5, md: 2.25 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 1.5, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title="Volver a equipos">
            <IconButton onClick={() => navigate(`/torneos/${torneoId}/equipos`)} size="small" sx={{ bgcolor: '#fff', border: '1px solid #e2e8f0', borderRadius: 1.5 }}><ArrowBackIcon fontSize="small" /></IconButton>
          </Tooltip>
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: 19, color: '#172033', letterSpacing: 0 }}>Editor de roster</Typography>
            <Typography sx={{ fontSize: 11, color: '#7b8798' }}>{roster?.torneo?.nombre} · {roster?.grupo_competicion} · {roster?.categoria}</Typography>
          </Box>
        </Box>
        <Stack direction="row" spacing={0.8}>
          <Button size="small" variant="outlined" startIcon={<DownloadOutlinedIcon />} onClick={() => download('doc')} sx={{ bgcolor: '#fff', borderColor: '#dfe5ec', color: '#344054', textTransform: 'none', fontWeight: 700 }}>DOC</Button>
          <Button size="small" variant="outlined" startIcon={<PictureAsPdfOutlinedIcon />} onClick={() => download('pdf')} sx={{ bgcolor: '#fff', borderColor: '#dfe5ec', color: '#344054', textTransform: 'none', fontWeight: 700 }}>PDF</Button>
          <Button size="small" variant="contained" startIcon={saving ? <CircularProgress size={14} color="inherit" /> : <SaveOutlinedIcon />} disabled={saving} onClick={saveDocument} sx={{ px: 2, bgcolor: '#dc5f16', boxShadow: '0 5px 12px rgba(220, 95, 22, .24)', textTransform: 'none', fontWeight: 800, '&:hover': { bgcolor: '#bd4d0d' } }}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </Stack>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(600px, 1.25fr) minmax(430px, .95fr)' }, gap: 2, alignItems: 'start' }}>
        <Paper ref={previewRef} elevation={0} sx={{ overflow: 'hidden', p: { xs: 1.5, md: 2.5 }, bgcolor: '#e7ecf6', border: '1px solid #dde4ef', borderRadius: 2.5, minHeight: 600 }}>
          <Box sx={{ position: 'relative', width: 794 * paperScale, height: (1123 + (extraPageCount * 1147)) * paperScale, mx: 'auto' }}>
            <Box
              ref={paperRef}
              onClick={() => setSelectedLogo('')}
              sx={{
                position: 'absolute', inset: 0, width: 794, height: 1123, bgcolor: '#fff', color: '#111',
                transform: `scale(${paperScale})`, transformOrigin: 'top left',
                boxShadow: '0 16px 45px rgba(35, 45, 55, .18)', overflow: 'hidden', fontFamily: 'Georgia, serif', p: '38px', boxSizing: 'border-box'
              }}
            >
            {documento.logos.map((logo, index) => {
              const id = logo._id || logo.url;
              return (
                <Rnd
                  key={id}
                  bounds="parent"
                  size={{ width: logo.width * 794, height: logo.height * 1123 }}
                  position={{ x: logo.x * 794, y: logo.y * 1123 }}
                  minWidth={36}
                  minHeight={28}
                  style={{ zIndex: logo.zIndex || index + 1, border: selectedLogo === id ? '2px solid #d95f21' : '1px dashed transparent' }}
                  onClick={(event) => { event.stopPropagation(); setSelectedLogo(id); }}
                  onDragStop={(event, position) => updateLogo(id, { x: position.x / 794, y: position.y / 1123 })}
                  onResizeStop={(event, direction, ref, delta, position) => updateLogo(id, {
                    width: ref.offsetWidth / 794,
                    height: ref.offsetHeight / 1123,
                    x: position.x / 794,
                    y: position.y / 1123
                  })}
                >
                  <Box component="img" src={mediaUrl(logo.url)} alt={`Logo ${index + 1}`} sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', userSelect: 'none', pointerEvents: 'none' }} />
                </Rnd>
              );
            })}

            <Box sx={{ width: '46%', minHeight: 74, mx: 'auto', textAlign: 'center', pt: 1, position: 'relative', zIndex: 5 }}>
              <Typography sx={{ fontFamily: 'Arial, sans-serif', fontSize: 10, fontWeight: 400, lineHeight: 1.35, letterSpacing: 0, whiteSpace: 'pre-line' }}>{documento.campos.texto_institucional}</Typography>
              {documento.campos.titulo && <Typography sx={{ mt: 2.2, fontFamily: 'Arial, sans-serif', fontSize: 22, fontWeight: 700, letterSpacing: 0 }}>{documento.campos.titulo}</Typography>}
              {documento.campos.subtitulo && <Typography sx={{ fontFamily: 'Arial, sans-serif', fontSize: 13, fontWeight: 700, letterSpacing: 0 }}>{documento.campos.subtitulo}</Typography>}
            </Box>

            <Box sx={{ mt: 2.5, fontFamily: 'Arial, sans-serif', fontSize: 11, fontWeight: 700, lineHeight: 2 }}>
              <Box sx={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                {template?.club_label || 'CLUB'}: {documento.campos.club || '________________'} &nbsp;&nbsp;
                {template?.categoria_label || 'CATEGORIA'}: {documento.campos.categoria} ({roster?.sexo || ''}) &nbsp;&nbsp;
                {template?.equipo_label || 'EQUIPO'}: {documento.campos.equipo}
              </Box>
              <Box sx={{ mt: 0.75, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                {template?.entrenador_principal_label || 'ENTRENADOR'}: {documento.campos.entrenador_principal || '________________'} &nbsp;&nbsp;
                {template?.asistente_label || 'ASISTENTE'}: {documento.campos.asistentes.filter(Boolean).join(', ') || '________________'}
              </Box>
            </Box>

            <Box component="table" sx={{ width: '100%', mt: 1.5, borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: 'Arial, sans-serif', fontSize: 9, '& th, & td': { border: '1px solid #252525', p: '4px', verticalAlign: 'middle' }, '& th': { bgcolor: '#f1f1ed', fontWeight: 700, textAlign: 'center', lineHeight: 1.15 }, '& td': { height: 68 } }}>
              <thead><tr><th style={{ width: 28 }}>N°</th><th style={{ width: 76 }}>Foto</th><th style={{ width: 48 }}>Número<br />Franela</th><th>Nombre y Apellidos</th><th style={{ width: 82 }}>Nro. de<br />Cédula</th><th style={{ width: 88 }}>Edad<br />Fecha de Nacimiento</th><th style={{ width: 128 }}>Representante y teléfono</th></tr></thead>
              <tbody>
                {(roster?.jugadores || []).map((player, index) => (
                  <tr key={player._id}>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{index + 1}</td>
                    <td style={{ padding: 0, textAlign: 'center' }}>
                      {player.foto ? <Box component="img" src={mediaUrl(player.foto)} alt={`${player.nombres || ''} ${player.apellidos || ''}`} sx={{ width: 72, height: 68, mx: 'auto', objectFit: 'contain', objectPosition: 'center', display: 'block' }} /> : null}
                    </td>
                    <td style={{ textAlign: 'center' }}>{player.numero_franela || ''}</td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{`${player.nombres || ''} ${player.apellidos || ''}`.trim()}</td>
                    <td style={{ textAlign: 'center' }}>{player.cedula || ''}</td>
                    <td style={{ textAlign: 'center' }}>
                      {player.fecha_nacimiento ? new Date(player.fecha_nacimiento).toLocaleDateString('es-VE') : ''}
                      {player.fecha_nacimiento && <><br /><strong>{calculateAge(player.fecha_nacimiento)}</strong></>}
                    </td>
                    <td>{[
                      `${player.representante?.nombres || ''} ${player.representante?.apellidos || ''}`.trim(),
                      player.representante?.telefono || player.telefono || ''
                    ].filter(Boolean).join(' / ')}</td>
                  </tr>
                ))}
              </tbody>
            </Box>
            {firstPageCedulas.length > 0 && (
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridAutoRows: idCardRowHeight, borderLeft: '1px solid #444' }}>
                {firstPageCedulas.map(({ player, rosterIndex }) => (
                  <Box key={player._id} sx={{ borderRight: '1px solid #444', borderBottom: '1px solid #444', display: 'grid', gridTemplateRows: '25px 155px', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
                    <Typography sx={{ fontFamily: 'Arial, sans-serif', fontSize: 10, lineHeight: '24px', fontWeight: 700, textAlign: 'center', borderBottom: '1px solid #444' }}>
                      CÉDULA {rosterIndex + 1}
                    </Typography>
                    <Box component="img" src={mediaUrl(player.foto_cedula)} alt={`Cédula de ${player.nombres || 'atleta'}`} sx={{ width: '100%', height: 155, minHeight: 0, objectFit: 'contain', display: 'block' }} />
                  </Box>
                ))}
              </Box>
            )}
            {extraPageCount === 0 && receiptBlock}
            </Box>
            {cedulaPages.map((pageCedulas, pageIndex) => (
              <Box
                key={`cedulas-${pageIndex}`}
                sx={{
                  position: 'absolute', left: 0, top: (1147 * (pageIndex + 1)) * paperScale,
                  width: 794, height: 1123, bgcolor: '#fff', color: '#111',
                  transform: `scale(${paperScale})`, transformOrigin: 'top left',
                  boxShadow: '0 16px 45px rgba(35, 45, 55, .18)', p: '28px', boxSizing: 'border-box', overflow: 'hidden'
                }}
              >
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridAutoRows: idCardRowHeight, borderTop: '1px solid #444', borderLeft: '1px solid #444' }}>
                  {pageCedulas.map(({ player, rosterIndex }) => (
                    <Box key={player._id} sx={{ borderRight: '1px solid #444', borderBottom: '1px solid #444', display: 'grid', gridTemplateRows: '25px 155px', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
                      <Typography sx={{ fontFamily: 'Arial, sans-serif', fontSize: 10, lineHeight: '24px', fontWeight: 700, textAlign: 'center', borderBottom: '1px solid #444' }}>
                        CÉDULA {rosterIndex + 1}
                      </Typography>
                      <Box component="img" src={mediaUrl(player.foto_cedula)} alt={`Cédula de ${player.nombres || 'atleta'}`} sx={{ width: '100%', height: 155, minHeight: 0, objectFit: 'contain', display: 'block' }} />
                    </Box>
                  ))}
                </Box>
                {pageIndex === cedulaPages.length - 1 && receiptBlock}
              </Box>
            ))}
          </Box>
        </Paper>

        <Stack component="aside" spacing={1.25} sx={{ position: { lg: 'sticky' }, top: 16 }}>
          <Accordion defaultExpanded disableGutters sx={sectionSx}>
            <AccordionSummary expandIcon={<ExpandMoreRoundedIcon sx={{ color: '#7b8798' }} />} sx={{ minHeight: 58, px: 2, '& .MuiAccordionSummary-content': { my: 1.2 } }}>
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: 14, color: '#253047' }}>Contenido del documento</Typography>
                <Typography sx={{ fontSize: 10.5, color: '#8a96a8', mt: 0.2 }}>Club, categoría, equipo y entrenador</Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 2, pt: 0, pb: 2 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.2 }}>
                <TextField label="Título" placeholder="ROSTER" value={documento.campos.titulo} onChange={(event) => updateField('titulo', event.target.value)} size="small" sx={{ ...fieldSx, gridColumn: '1 / -1' }} />
                <TextField label="Subtítulo" placeholder="Nombre de la liga o torneo" value={documento.campos.subtitulo} onChange={(event) => updateField('subtitulo', event.target.value)} size="small" sx={{ ...fieldSx, gridColumn: '1 / -1' }} />
                <TextField label="Texto institucional" value={documento.campos.texto_institucional} onChange={(event) => updateField('texto_institucional', event.target.value)} size="small" multiline minRows={3} sx={{ ...fieldSx, gridColumn: '1 / -1', '& textarea': { fontFamily: 'Arial, sans-serif', letterSpacing: 0 } }} />
                <TextField label="Club" placeholder="Nombre del club" value={documento.campos.club} onChange={(event) => updateField('club', event.target.value)} size="small" sx={{ ...fieldSx, gridColumn: '1 / -1' }} />
                <TextField select label="Categoría" value={documento.campos.categoria} onChange={(event) => updateField('categoria', event.target.value)} size="small" sx={fieldSx}>
                  {categoriasDisponibles.map((categoria) => (
                    <MenuItem key={categoria} value={categoria}>{categoria}</MenuItem>
                  ))}
                </TextField>
                <TextField label="Equipo" value={documento.campos.equipo} onChange={(event) => updateField('equipo', event.target.value)} size="small" sx={fieldSx} />
                <TextField label="Entrenador principal" placeholder="Nombre y apellido" value={documento.campos.entrenador_principal} onChange={(event) => updateField('entrenador_principal', event.target.value)} size="small" sx={{ ...fieldSx, gridColumn: '1 / -1' }} />
              </Box>
            </AccordionDetails>
          </Accordion>

          <Accordion defaultExpanded disableGutters sx={sectionSx}>
            <AccordionSummary expandIcon={<ExpandMoreRoundedIcon sx={{ color: '#7b8798' }} />} sx={{ minHeight: 54, px: 2 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography sx={{ fontWeight: 800, fontSize: 14, color: '#253047' }}>Asistentes</Typography>
                <Chip label={`${documento.campos.asistentes.length} de 4`} size="small" sx={{ height: 20, bgcolor: '#eef2ff', color: '#667085', fontSize: 10, fontWeight: 700 }} />
              </Stack>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 2, pt: 0, pb: 2 }}>
              <Typography sx={{ fontSize: 10.5, color: '#98a2b3', mb: 1.2 }}>Puedes registrar hasta 4 asistentes técnicos. Aparecerán en este orden.</Typography>
              <Stack spacing={0.9}>
                {documento.campos.asistentes.map((asistente, index) => (
                  <Stack key={`assistant-${index}`} direction="row" spacing={0.8} alignItems="center">
                    <Box sx={{ width: 24, height: 24, flex: '0 0 auto', display: 'grid', placeItems: 'center', borderRadius: 1, bgcolor: '#172033', color: '#fff', fontSize: 11, fontWeight: 800 }}>{index + 1}</Box>
                    <TextField fullWidth placeholder="Nombre del asistente" value={asistente} onChange={(event) => updateAssistant(index, event.target.value)} size="small" sx={fieldSx} inputProps={{ 'aria-label': `Asistente ${index + 1}` }} />
                    <Tooltip title="Quitar asistente">
                      <IconButton size="small" onClick={() => removeAssistant(index)} aria-label={`Quitar asistente ${index + 1}`} sx={{ border: '1px solid #e4e9f0', borderRadius: 1.2, color: '#98a2b3' }}><CloseRoundedIcon fontSize="small" /></IconButton>
                    </Tooltip>
                  </Stack>
                ))}
                <Button fullWidth variant="outlined" startIcon={<AddRoundedIcon />} onClick={addAssistant} disabled={documento.campos.asistentes.length >= 4} sx={{ borderColor: '#e4e9f0', color: '#475467', textTransform: 'none', fontWeight: 700, borderStyle: 'dashed' }}>
                  Agregar asistente
                </Button>
                <Typography sx={{ fontSize: 10, color: '#98a2b3' }}>{4 - documento.campos.asistentes.length} espacios disponibles.</Typography>
              </Stack>
            </AccordionDetails>
          </Accordion>

          <Accordion defaultExpanded disableGutters sx={sectionSx}>
            <AccordionSummary expandIcon={<ExpandMoreRoundedIcon sx={{ color: '#7b8798' }} />} sx={{ minHeight: 54, px: 2 }}>
              <Box>
                <Typography sx={{ fontWeight: 800, fontSize: 14, color: '#253047' }}>Opciones de la hoja</Typography>
                <Typography sx={{ fontSize: 10.5, color: '#8a96a8', mt: 0.2 }}>Cédulas y logos del documento</Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 2, pt: 0, pb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                <Box>
                  <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#344054' }}>Incluir fotos de cédulas</Typography>
                  <Typography sx={{ fontSize: 10.5, color: '#98a2b3' }}>{cedulasDisponibles.length} de {(roster?.jugadores || []).length} atletas tienen cédula registrada.</Typography>
                </Box>
                <Switch checked={documento.incluir_fotos_cedula} onChange={(event) => setDocumento((current) => ({ ...current, incluir_fotos_cedula: event.target.checked }))} sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#dc5f16' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#dc5f16' } }} />
              </Box>
              <Divider sx={{ my: 1.5, borderColor: '#edf0f4' }} />
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#344054' }}>Logos</Typography>
                <Chip label={`${documento.logos.length} / 4`} size="small" sx={{ height: 20, fontSize: 10, fontWeight: 800 }} />
              </Box>
              <Typography sx={{ fontSize: 10.5, color: '#98a2b3', mb: 1.2 }}>Selecciona un logo para quitarlo o ajústalo directamente sobre la hoja.</Typography>
              {documento.logos.length > 0 && (
                <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 0.8, mb: 1.2 }}>
                  {documento.logos.map((logo, index) => {
                    const logoId = logo._id || logo.url;
                    const isSelected = selectedLogo === logoId;
                    return (
                      <Tooltip key={logoId} title={`Logo ${index + 1}`}>
                        <Box onClick={() => setSelectedLogo(logoId)} sx={{ height: 58, border: `2px solid ${isSelected ? '#dc5f16' : '#e5eaf1'}`, borderRadius: 1.5, bgcolor: '#fafbfc', p: 0.6, cursor: 'pointer', transition: 'border-color .15s ease', '&:hover': { borderColor: isSelected ? '#dc5f16' : '#b8c2d1' } }}>
                          <Box component="img" src={mediaUrl(logo.url)} alt={`Logo ${index + 1}`} sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                        </Box>
                      </Tooltip>
                    );
                  })}
                </Box>
              )}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0.8}>
                <Button component="label" fullWidth variant="outlined" startIcon={uploading ? <CircularProgress size={15} /> : <ImageOutlinedIcon />} disabled={uploading || documento.logos.length >= 4} sx={{ borderColor: '#dfe5ec', color: '#475467', textTransform: 'none', fontWeight: 700 }}>
                  Agregar logo
                  <input hidden type="file" accept="image/*" onChange={uploadLogo} />
                </Button>
                <Button fullWidth variant="outlined" startIcon={<DeleteOutlineIcon />} disabled={!selectedLogo} onClick={removeSelectedLogo} sx={{ borderColor: '#dfe5ec', color: '#667085', textTransform: 'none', fontWeight: 700 }}>
                  Quitar logo
                </Button>
              </Stack>
            </AccordionDetails>
          </Accordion>
        </Stack>
      </Box>

      <Snackbar open={notice.open} autoHideDuration={3500} onClose={() => setNotice((current) => ({ ...current, open: false }))} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity={notice.severity} variant="filled" onClose={() => setNotice((current) => ({ ...current, open: false }))}>{notice.message}</Alert>
      </Snackbar>
    </Box>
  );
}

export default RosterDocumentEditor;