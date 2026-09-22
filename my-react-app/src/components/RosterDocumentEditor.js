import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Rnd } from 'react-rnd';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  Snackbar,
  Switch,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import { useNavigate, useParams } from 'react-router-dom';
import { mediaUrl } from '../utils/mediaUrl';

const EMPTY_FIELDS = {
  club: '',
  categoria: '',
  equipo: '',
  entrenador_principal: '',
  asistente: ''
};

function RosterDocumentEditor() {
  const { torneoId, rosterId } = useParams();
  const navigate = useNavigate();
  const paperRef = useRef(null);
  const previewRef = useRef(null);
  const token = localStorage.getItem('token');
  const [roster, setRoster] = useState(null);
  const [template, setTemplate] = useState(null);
  const [documento, setDocumento] = useState({ incluir_fotos_cedula: false, campos: EMPTY_FIELDS, logos: [] });
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
        campos: { ...EMPTY_FIELDS, ...(data.roster?.documento?.campos || {}) },
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
        campos: { ...EMPTY_FIELDS, ...data.documento.campos },
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
  const playerTableBottom = 190 + 28 + ((roster?.jugadores || []).length * 73);
  const idCardRowHeight = 220;
  const firstPageIdRows = Math.max(0, Math.floor((1123 - 38 - playerTableBottom) / idCardRowHeight));
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

  return (
    <Box sx={{ minHeight: 'calc(100vh - 100px)', bgcolor: '#eef1f4', mx: { xs: -2, md: -3 }, my: -2, p: { xs: 1.5, md: 2.5 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5, gap: 1, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Tooltip title="Volver a equipos"><IconButton onClick={() => navigate(`/torneos/${torneoId}/equipos`)}><ArrowBackIcon /></IconButton></Tooltip>
          <Box>
            <Typography sx={{ fontFamily: 'Georgia, serif', fontWeight: 700, fontSize: 22, color: '#18212b' }}>Editor de roster</Typography>
            <Typography sx={{ fontSize: 12, color: '#64707d' }}>{roster?.torneo?.nombre} · {roster?.grupo_competicion}</Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" startIcon={<DownloadOutlinedIcon />} onClick={() => download('doc')} sx={{ textTransform: 'none' }}>DOC</Button>
          <Button variant="outlined" startIcon={<DownloadOutlinedIcon />} onClick={() => download('pdf')} sx={{ textTransform: 'none' }}>PDF</Button>
          <Button variant="contained" startIcon={<SaveOutlinedIcon />} disabled={saving} onClick={saveDocument} sx={{ bgcolor: '#d95f21', textTransform: 'none', '&:hover': { bgcolor: '#b94c17' } }}>
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'minmax(620px, 1fr) 320px' }, gap: 2, alignItems: 'start' }}>
        <Box ref={previewRef} sx={{ overflow: 'hidden', pb: 2 }}>
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

            <Box sx={{ textAlign: 'center', pt: 1 }}>
              <Typography sx={{ fontSize: 10, lineHeight: 1.35 }}>{template?.federacion_linea_1}</Typography>
              <Typography sx={{ fontSize: 10, lineHeight: 1.35 }}>{template?.federacion_linea_2}</Typography>
              <Typography sx={{ fontSize: 10, lineHeight: 1.35 }}>{template?.federacion_linea_3}</Typography>
              <Typography sx={{ mt: 2.2, fontSize: 22, fontWeight: 700 }}>{template?.header_title || 'ROSTER'}</Typography>
              <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{roster?.torneo?.nombre}</Typography>
            </Box>

            <Box sx={{ mt: 2.5, fontFamily: 'Arial, sans-serif', fontSize: 11, fontWeight: 700, lineHeight: 2 }}>
              <Box>{template?.club_label || 'CLUB'}: {documento.campos.club || '________________'} &nbsp;&nbsp; {template?.categoria_label || 'CATEGORIA'}: {documento.campos.categoria}</Box>
              <Box>{template?.equipo_label || 'EQUIPO'}: {documento.campos.equipo}</Box>
              <Box>{template?.entrenador_principal_label || 'ENTRENADOR'}: {documento.campos.entrenador_principal || '________________'} &nbsp;&nbsp; {template?.asistente_label || 'ASISTENTE'}: {documento.campos.asistente || '________________'}</Box>
            </Box>

            <Box component="table" sx={{ width: '100%', mt: 1.5, borderCollapse: 'collapse', tableLayout: 'fixed', fontFamily: 'Arial, sans-serif', fontSize: 9, '& th, & td': { border: '1px solid #252525', p: '4px' }, '& th': { bgcolor: '#f1f1ed', fontWeight: 700 }, '& td': { height: 64 } }}>
              <thead><tr><th style={{ width: 28 }}>N°</th><th style={{ width: 58 }}>Foto</th><th style={{ width: 48 }}>Franela</th><th>Nombre y apellidos</th><th style={{ width: 82 }}>Cédula</th><th style={{ width: 88 }}>Nacimiento</th><th style={{ width: 128 }}>Representante</th></tr></thead>
              <tbody>
                {(roster?.jugadores || []).map((player, index) => (
                  <tr key={player._id}>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{index + 1}</td>
                    <td style={{ padding: 0, textAlign: 'center' }}>
                      {player.foto ? <Box component="img" src={mediaUrl(player.foto)} alt={`${player.nombres || ''} ${player.apellidos || ''}`} sx={{ width: '100%', height: 64, objectFit: 'cover', objectPosition: 'center', display: 'block' }} /> : null}
                    </td>
                    <td style={{ textAlign: 'center' }}>{player.numero_franela || ''}</td>
                    <td>{`${player.nombres || ''} ${player.apellidos || ''}`.trim()}</td>
                    <td>{player.cedula || ''}</td>
                    <td>{player.fecha_nacimiento ? new Date(player.fecha_nacimiento).toLocaleDateString('es-VE') : ''}</td>
                    <td>{`${player.representante?.nombres || ''} ${player.representante?.apellidos || ''}`.trim()}</td>
                  </tr>
                ))}
              </tbody>
            </Box>
            {firstPageCedulas.length > 0 && (
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridAutoRows: idCardRowHeight, borderLeft: '1px solid #444' }}>
                {firstPageCedulas.map(({ player, rosterIndex }) => (
                  <Box key={player._id} sx={{ borderRight: '1px solid #444', borderBottom: '1px solid #444', display: 'grid', gridTemplateRows: '26px 1fr', minWidth: 0 }}>
                    <Typography sx={{ fontFamily: 'Arial, sans-serif', fontSize: 11, fontWeight: 700, textAlign: 'center', py: 0.65, borderBottom: '1px solid #444' }}>
                      CÉDULA {rosterIndex + 1} · {`${player.nombres || ''} ${player.apellidos || ''}`.trim()}
                    </Typography>
                    <Box component="img" src={mediaUrl(player.foto_cedula)} alt={`Cédula de ${player.nombres || 'atleta'}`} sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                  </Box>
                ))}
              </Box>
            )}
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
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gridAutoRows: 242, borderTop: '1px solid #444', borderLeft: '1px solid #444' }}>
                  {pageCedulas.map(({ player, rosterIndex }) => (
                    <Box key={player._id} sx={{ borderRight: '1px solid #444', borderBottom: '1px solid #444', display: 'grid', gridTemplateRows: '26px 1fr', minWidth: 0 }}>
                      <Typography sx={{ fontFamily: 'Arial, sans-serif', fontSize: 11, fontWeight: 700, textAlign: 'center', py: 0.65, borderBottom: '1px solid #444' }}>
                        CÉDULA {rosterIndex + 1} · {`${player.nombres || ''} ${player.apellidos || ''}`.trim()}
                      </Typography>
                      <Box component="img" src={mediaUrl(player.foto_cedula)} alt={`Cédula de ${player.nombres || 'atleta'}`} sx={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                    </Box>
                  ))}
                </Box>
              </Box>
            ))}
          </Box>
        </Box>

        <Box component="aside" sx={{ bgcolor: '#fff', border: '1px solid #dfe3e7', p: 2, position: { lg: 'sticky' }, top: 16 }}>
          <Typography sx={{ fontWeight: 800, fontSize: 14, color: '#26313b' }}>Contenido del documento</Typography>
          <Typography sx={{ fontSize: 11, color: '#77818b', mt: 0.3 }}>Los cambios se aplican únicamente a este roster.</Typography>
          <Divider sx={{ my: 1.5 }} />
          {[
            ['club', 'Club'],
            ['categoria', 'Categoría'],
            ['equipo', 'Equipo'],
            ['entrenador_principal', 'Entrenador principal'],
            ['asistente', 'Asistente']
          ].map(([field, label]) => (
            <TextField key={field} fullWidth size="small" label={label} value={documento.campos[field]} onChange={(event) => updateField(field, event.target.value)} sx={{ mb: 1.25 }} />
          ))}
          <Divider sx={{ my: 1.5 }} />
          <FormControlLabel
            control={<Switch checked={documento.incluir_fotos_cedula} onChange={(event) => setDocumento((current) => ({ ...current, incluir_fotos_cedula: event.target.checked }))} />}
            label="Incluir fotos de cédulas"
            sx={{ mx: 0, mb: 0.5, '& .MuiFormControlLabel-label': { fontSize: 13, fontWeight: 700, color: '#26313b' } }}
          />
          <Typography sx={{ fontSize: 11, color: '#77818b', mb: 1.5 }}>
            {cedulasDisponibles.length} de {(roster?.jugadores || []).length} atletas tienen cédula registrada.
          </Typography>
          <Divider sx={{ my: 1.5 }} />
          <Typography sx={{ fontWeight: 800, fontSize: 13, color: '#26313b' }}>Logos ({documento.logos.length}/4)</Typography>
          <Typography sx={{ fontSize: 11, color: '#77818b', mt: 0.3, mb: 1.2 }}>Arrastra y redimensiona cada imagen directamente sobre la hoja.</Typography>
          <Button component="label" fullWidth variant="outlined" startIcon={uploading ? <CircularProgress size={16} /> : <CloudUploadOutlinedIcon />} disabled={uploading || documento.logos.length >= 4} sx={{ textTransform: 'none', mb: 1 }}>
            Agregar logo
            <input hidden type="file" accept="image/*" onChange={uploadLogo} />
          </Button>
          <Button fullWidth color="error" variant="text" startIcon={<DeleteOutlineIcon />} disabled={!selectedLogo} onClick={removeSelectedLogo} sx={{ textTransform: 'none' }}>
            Quitar logo seleccionado
          </Button>
        </Box>
      </Box>

      <Snackbar open={notice.open} autoHideDuration={3500} onClose={() => setNotice((current) => ({ ...current, open: false }))} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity={notice.severity} variant="filled" onClose={() => setNotice((current) => ({ ...current, open: false }))}>{notice.message}</Alert>
      </Snackbar>
    </Box>
  );
}

export default RosterDocumentEditor;