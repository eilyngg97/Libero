import React, { useEffect, useRef, useState } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import CropIcon from '@mui/icons-material/Crop';
import RotateRightIcon from '@mui/icons-material/RotateRight';

const CEDULA_ASPECT = 1.586;
const MAX_OUTPUT_WIDTH = 1600;

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.readAsDataURL(file);
  });
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

function canvasToBlob(canvas, quality = 0.9) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (
      blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen recortada'))
    ), 'image/jpeg', quality);
  });
}

async function rotateImage(source) {
  const image = await loadImage(source);
  const canvas = document.createElement('canvas');
  canvas.width = image.height;
  canvas.height = image.width;
  const context = canvas.getContext('2d');
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(Math.PI / 2);
  context.drawImage(image, -image.width / 2, -image.height / 2);
  return URL.createObjectURL(await canvasToBlob(canvas));
}

async function createCroppedFile(image, crop, fileName) {
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  const sourceWidth = crop.width * scaleX;
  const sourceHeight = crop.height * scaleY;
  const outputScale = Math.min(1, MAX_OUTPUT_WIDTH / sourceWidth);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * outputScale));
  canvas.height = Math.max(1, Math.round(sourceHeight * outputScale));
  const context = canvas.getContext('2d');
  context.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height
  );
  const blob = await canvasToBlob(canvas);
  return new File([blob], fileName || `cedula-${Date.now()}.jpg`, { type: 'image/jpeg' });
}

function ImageCropDialog({ open, imageSrc, fileName, onCancel, onConfirm }) {
  const imageRef = useRef(null);
  const generatedUrlRef = useRef('');
  const [workingImageSrc, setWorkingImageSrc] = useState(imageSrc);
  const [crop, setCrop] = useState();
  const [completedCrop, setCompletedCrop] = useState(null);
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    if (generatedUrlRef.current) URL.revokeObjectURL(generatedUrlRef.current);
    generatedUrlRef.current = '';
    setWorkingImageSrc(imageSrc);
    setCrop(undefined);
    setCompletedCrop(null);
    setError('');
  }, [imageSrc, open]);

  useEffect(() => () => {
    if (generatedUrlRef.current) URL.revokeObjectURL(generatedUrlRef.current);
  }, []);

  const handleImageLoad = (event) => {
    const { width, height } = event.currentTarget;
    setCrop(centerCrop(
      makeAspectCrop({ unit: '%', width: 90 }, CEDULA_ASPECT, width, height),
      width,
      height
    ));
  };

  const handleRotate = async () => {
    if (!workingImageSrc) return;
    setRotating(true);
    setError('');
    try {
      const rotatedUrl = await rotateImage(workingImageSrc);
      if (generatedUrlRef.current) URL.revokeObjectURL(generatedUrlRef.current);
      generatedUrlRef.current = rotatedUrl;
      setWorkingImageSrc(rotatedUrl);
      setCrop(undefined);
      setCompletedCrop(null);
    } catch (rotateError) {
      setError(rotateError.message || 'No se pudo girar la imagen');
    } finally {
      setRotating(false);
    }
  };

  const handleConfirm = async () => {
    if (!imageRef.current || !completedCrop?.width || !completedCrop?.height) return;
    setSaving(true);
    setError('');
    try {
      const croppedFile = await createCroppedFile(imageRef.current, completedCrop, fileName);
      await onConfirm(croppedFile);
    } catch (cropError) {
      setError(cropError.message || 'No se pudo recortar la imagen');
    } finally {
      setSaving(false);
    }
  };

  const busy = saving || rotating;

  return (
    <Dialog open={open} onClose={busy ? undefined : onCancel} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Recortar foto de la cédula
        <IconButton aria-label="cerrar" onClick={onCancel} disabled={busy} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0, bgcolor: '#111827' }}>
        <Box sx={{ minHeight: 360, maxHeight: '65vh', p: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'auto' }}>
          {workingImageSrc && (
            <ReactCrop
              crop={crop}
              onChange={(pixelCrop, percentCrop) => setCrop(percentCrop)}
              onComplete={(pixelCrop) => setCompletedCrop(pixelCrop)}
              minWidth={40}
              minHeight={25}
              ruleOfThirds
            >
              <img
                ref={imageRef}
                src={workingImageSrc}
                alt="Cédula para recortar"
                onLoad={handleImageLoad}
                style={{ display: 'block', maxWidth: '100%', maxHeight: '60vh', objectFit: 'contain' }}
              />
            </ReactCrop>
          )}
        </Box>
        <Box sx={{ px: 2.5, py: 1.25, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
          <Typography sx={{ fontSize: 12, color: '#64748b' }}>
            Arrastra las esquinas o bordes para ajustar el recorte.
          </Typography>
        </Box>
        {error && <Typography color="error" sx={{ px: 2.5, pb: 1.5, bgcolor: '#f8fafc', fontSize: 12 }}>{error}</Typography>}
      </DialogContent>
      <DialogActions sx={{ px: 2.5, py: 1.6, display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: 'stretch', justifyContent: 'space-between', gap: 1.5, bgcolor: '#fff' }}>
        <Button
          startIcon={<RotateRightIcon />}
          onClick={handleRotate}
          disabled={busy}
          sx={{
            minHeight: 38,
            px: 1.8,
            border: '1px solid #fed7aa',
            borderRadius: 1.5,
            bgcolor: '#fff7ed',
            color: '#c2410c',
            fontWeight: 800,
            textTransform: 'none',
            alignSelf: { xs: 'stretch', sm: 'center' },
            '&:hover': { bgcolor: '#ffedd5', borderColor: '#fb923c' }
          }}
        >
          {rotating ? 'Girando...' : 'Girar imagen'}
        </Button>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1, width: { xs: '100%', sm: 'auto' } }}>
          <Button
            onClick={onCancel}
            disabled={busy}
            sx={{
              minHeight: 38,
              px: 2,
              borderRadius: 1.5,
              color: '#475569',
              fontWeight: 700,
              flex: { xs: 1, sm: '0 0 auto' },
              textTransform: 'none',
              '&:hover': { bgcolor: '#f1f5f9', color: '#0f172a' }
            }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            startIcon={<CropIcon />}
            onClick={handleConfirm}
            disabled={busy || !completedCrop?.width}
            sx={{
              minHeight: 38,
              px: 2.2,
              borderRadius: 1.5,
              bgcolor: '#f97316',
              color: '#fff',
              fontWeight: 800,
              flex: { xs: 1.4, sm: '0 0 auto' },
              textTransform: 'none',
              boxShadow: '0 4px 10px rgba(249, 115, 22, 0.22)',
              '&:hover': { bgcolor: '#ea580c', boxShadow: '0 5px 12px rgba(234, 88, 12, 0.28)' },
              '&.Mui-disabled': { bgcolor: '#e2e8f0', color: '#94a3b8', boxShadow: 'none' }
            }}
          >
            {saving ? 'Procesando...' : 'Aplicar recorte'}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}

export default ImageCropDialog;