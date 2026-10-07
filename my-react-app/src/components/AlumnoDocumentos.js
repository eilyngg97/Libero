import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Paper, Typography } from '@mui/material';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import { mediaUrl } from '../utils/mediaUrl';

const DOCUMENTOS = [
  { campo: 'constancia_estudio', label: 'Constancia de estudio del colegio' },
  { campo: 'constancia_nino_sano', label: 'Constancia de niño sano' }
];
const EXTENSIONES_IMAGEN = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'bmp', 'tif', 'tiff', 'heic', 'heif'];
const ACCEPT = 'application/pdf,.pdf,.jpg,.jpeg,.png,.webp,.gif,.avif,.bmp,.tif,.tiff,.heic,.heif';

function DocumentoAdjunto({ campo, label, value, file, onChange, onView, disabled }) {
  const [previewUrl, setPreviewUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handleSelection = (event) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';
    if (!selectedFile) return;
    const extension = selectedFile.name.split('.').pop().toLowerCase();
    const esPdf = selectedFile.type === 'application/pdf' && extension === 'pdf';
    const esImagen = selectedFile.type.startsWith('image/') && EXTENSIONES_IMAGEN.includes(extension);
    if (!esPdf && !esImagen) {
      setError('Selecciona una imagen o un archivo PDF.');
      return;
    }
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('El archivo debe pesar como máximo 10 MB.');
      return;
    }
    setError('');
    onChange(campo, selectedFile);
  };

  const url = file ? previewUrl : mediaUrl(value);
  const esImagenVisible = file
    ? /^image\/(jpeg|png|webp|gif|avif|bmp)$/.test(file.type)
    : /\.(jpe?g|png|webp|gif|avif|bmp)(\?.*)?$/i.test(value || '');
  const esPdf = file ? file.type === 'application/pdf' : /\.pdf(\?.*)?$/i.test(value || '');

  if (!onChange) {
    const abrirImagen = Boolean(url && !esPdf && onView);
    return (
      <Button
        component={url && !abrirImagen ? 'a' : 'button'}
        href={url && !abrirImagen ? url : undefined}
        target={url && !abrirImagen ? '_blank' : undefined}
        rel={url && !abrirImagen ? 'noopener noreferrer' : undefined}
        onClick={abrirImagen ? () => onView(campo, label) : undefined}
        variant="contained"
        size="small"
        fullWidth
        disabled={!url}
        sx={{ mt: 2, bgcolor: '#0f172a', '&:hover': { bgcolor: '#0b1220' }, fontWeight: 700, whiteSpace: 'normal', overflowWrap: 'anywhere' }}
      >
        {campo === 'constancia_estudio' ? 'Ver constancia de estudio' : 'Ver constancia de niño sano'}
      </Button>
    );
  }

  return (
    <Box
      component={onChange ? Paper : 'div'}
      sx={onChange
        ? { p: 2.5, minWidth: 0, borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }
        : { py: 1.5, minWidth: 0, borderBottom: '1px solid #e2e8f0' }}
    >
      <Typography sx={onChange
        ? { fontSize: 12, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', mb: 1 }
        : { fontSize: 13, fontWeight: 700, mb: 1 }}
      >
        {label}
      </Typography>
      {onChange && (
        <Button
          component="label"
          disabled={disabled}
          fullWidth
          sx={{
            border: '1.5px dashed #cbd5f5', borderRadius: 2.5, bgcolor: '#f8fafc',
            px: 2, py: 2.5, minHeight: 92, minWidth: 0, textAlign: 'center',
            textTransform: 'none', display: 'flex', flexDirection: 'column', gap: 0.5,
            '&:hover': { bgcolor: '#f1f5f9', borderColor: '#94a3b8' }
          }}
        >
          <input hidden type="file" name={campo} aria-label={label} accept={ACCEPT} onChange={handleSelection} disabled={disabled} />
          {url ? (
            <>
              {esImagenVisible
                ? <Box component="img" src={url} alt={label} sx={{ width: '100%', height: 140, objectFit: 'contain', borderRadius: 1 }} />
                : esPdf
                  ? <PictureAsPdfIcon sx={{ fontSize: 36, color: '#64748b' }} />
                  : <InsertDriveFileIcon sx={{ fontSize: 36, color: '#64748b' }} />}
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#64748b', overflowWrap: 'anywhere', maxWidth: '100%' }}>
                {file?.name || 'Archivo adjunto'}
              </Typography>
              <Typography sx={{ fontSize: 11, color: '#94a3b8' }}>Reemplazar archivo</Typography>
            </>
          ) : (
            <>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Adjunta la constancia</Typography>
              <Typography sx={{ fontSize: 11, color: '#94a3b8' }}>Imagen o PDF, max 10MB</Typography>
            </>
          )}
        </Button>
      )}
      {!onChange && !value && <Typography sx={{ fontSize: 12, color: '#64748b', mt: 0.5 }}>Sin adjuntar</Typography>}
      {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
    </Box>
  );
}

export default function AlumnoDocumentos({ values = {}, files = {}, onChange, onView, disabled = false }) {
  return (
    <Box sx={{ minWidth: 0, display: 'grid', gap: onChange ? 2 : 0 }}>
      {DOCUMENTOS.map(({ campo, label }) => (
        <DocumentoAdjunto key={campo} campo={campo} label={label} value={values[campo]} file={files[campo]} onChange={onChange} onView={onView} disabled={disabled} />
      ))}
    </Box>
  );
}