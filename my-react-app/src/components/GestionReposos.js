import React, { useState, useEffect } from 'react';
import { Box, Typography, TextField, Button, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, IconButton } from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { useParams } from 'react-router-dom';
import { ToggleButton, ToggleButtonGroup } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import './GestionReposos.css';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import HistoryIcon from '@mui/icons-material/History';

const GestionReposos = () => {
  const [reposos, setReposos] = useState([]);
  const [nuevoReposo, setNuevoReposo] = useState({
    fechaInicio: '',
    fechaFin: '',
    tipo: '',
    motivo: '',
    certificado: null,
  });
  const [fotoCertificado, setFotoCertificado] = useState(null);
  const [previewCertificado, setPreviewCertificado] = useState(null);
  const inputCertificadoRef = React.useRef();
  const { id } = useParams();
  const [studentName, setStudentName] = useState('');

  useEffect(() => {
    // Fetch student data based on the ID from the URL
    const fetchStudentName = async () => {
      try {
        const response = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/${id}`);
        if (!response.ok) throw new Error('Error al obtener datos del estudiante');
        const data = await response.json();
        setStudentName(`${data.nombres} ${data.apellidos}`);
      } catch (error) {
        console.error(error);
      }
    };

    fetchStudentName();
  }, [id]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNuevoReposo({ ...nuevoReposo, [name]: value });
  };

  const handleFileChange = (e) => {
    setNuevoReposo({ ...nuevoReposo, certificado: e.target.files[0] });
  };

  const handleGuardarReposo = () => {
    // Aquí se manejaría la lógica para guardar el reposo
    console.log('Reposo guardado:', nuevoReposo);
  };

   const handleClickCertificado = () => {
    inputCertificadoRef.current.click();
  };
  
  const handleFotoCertificadoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFotoCertificado(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewCertificado(reader.result);
      };
      reader.readAsDataURL(file);
    } else {
      setFotoCertificado(null);
      setPreviewCertificado(null);
    }
  };

  const [tipoReposo, setTipoReposo] = useState('');

  const handleTipoReposoChange = (event, newTipo) => {
    if (newTipo !== null) {
      setTipoReposo(newTipo);
      setNuevoReposo({ ...nuevoReposo, tipo: newTipo });
    }
  };

  return (
    <Box sx={{ p: 3, borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>Gestión de Reposos Médicos</Typography>
      <span>Estudiante: <strong>{studentName}</strong></span>
      <Box sx={{ display: 'flex', gap: 4, mb: 4, mt: 2 }}>
        <Box sx={{ flex: 1, backgroundColor: '#ffffff', p: 3, borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <AddCircleOutlineIcon sx={{ color: '#0284c7', mr: 1 }} />
            <Typography variant="h6">Registrar Nuevo Reposo</Typography>
          </Box>
          <TextField
            label="Fecha Inicio"
            type="date"
            name="fechaInicio"
            value={nuevoReposo.fechaInicio}
            onChange={handleInputChange}
            fullWidth
            InputLabelProps={{ shrink: true }}
            sx={{ mb: 2 }}
          />
          <TextField
            label="Fecha Fin"
            type="date"
            name="fechaFin"
            value={nuevoReposo.fechaFin}
            onChange={handleInputChange}
            fullWidth
            InputLabelProps={{ shrink: true }}
            sx={{ mb: 2 }}
          />
          <Typography sx={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', mb: 0.5 }}>TIPO DE REPOSO</Typography>
          <ToggleButtonGroup
            value={tipoReposo}
            exclusive
            onChange={handleTipoReposoChange}
            sx={{ mb: 2, width: '100%' }}
          >
            <ToggleButton value="Parcial" sx={{ textTransform: 'none', fontWeight: 700, borderColor: '#e2e8f0', '&.Mui-selected': { bgcolor: '#e0f2fe', color: '#0284c7' }, flex: 1 }}>
              Parcial
            </ToggleButton>
            <ToggleButton value="Total" sx={{ textTransform: 'none', fontWeight: 700, borderColor: '#e2e8f0', '&.Mui-selected': { bgcolor: '#e0f2fe', color: '#0284c7' }, flex: 1 }}>
              Total
            </ToggleButton>
            <ToggleButton value="Indefinido" sx={{ textTransform: 'none', fontWeight: 700, borderColor: '#e2e8f0', '&.Mui-selected': { bgcolor: '#e0f2fe', color: '#0284c7' }, flex: 1 }}>
              Indefinido
            </ToggleButton>
          </ToggleButtonGroup>
          <TextField
            label="Motivo / Diagnóstico"
            name="motivo"
            value={nuevoReposo.motivo}
            onChange={handleInputChange}
            fullWidth
            multiline
            rows={3}
            sx={{ mb: 2 }}
          />
          <Paper sx={{ p: 2.5, borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 800, color: '#94a3b8', letterSpacing: '0.04em', mb: 1 }}>
                          REPOSO MEDICO
                        </Typography>
                        <Box
                          onClick={handleClickCertificado}
                          sx={{
                            border: '1.5px dashed #cbd5f5',
                            borderRadius: 2.5,
                            bgcolor: '#f8fafc',
                            px: 2,
                            py: 2.5,
                            textAlign: 'center',
                            cursor: 'pointer'
                          }}
                        >
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleFotoCertificadoChange}
                            ref={inputCertificadoRef}
                            style={{ display: 'none' }}
                          />
                          {previewCertificado ? (
                            <img src={previewCertificado} alt="Foto del reposo médico" style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 10 }} />
                          ) : (
                            <Box sx={{ display: 'grid', gap: 0.5 }}>
                              <Typography sx={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Adjunta foto del reposo médico</Typography>
                              <Typography sx={{ fontSize: 11, color: '#94a3b8' }}>JPG o PNG, max 5MB</Typography>
                            </Box>
                          )}
                        </Box>
                      </Paper>
          <Button
            type='button'
            className='save-reposo'
            onClick={handleGuardarReposo}
           sx={{ width: '100%', mt: 2, py: 1.5, fontWeight: 700 }}
          >
            Guardar Reposo
          </Button>
        </Box>
        <Box sx={{ flex: 2, backgroundColor: '#ffffff', p: 3, borderRadius: 3, boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <HistoryIcon sx={{ color: '#0284c7', mr: 1 }} />
            <Typography variant="h6">Historial de Reposos</Typography>
          </Box>
          <TableContainer component={Paper} sx={{ mt: 2 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Periodo</TableCell>
                  <TableCell>Diagnóstico</TableCell>
                  <TableCell>Estado</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reposos.map((reposo, index) => (
                  <TableRow key={index}>
                    <TableCell>{reposo.tipo}</TableCell>
                    <TableCell>{reposo.fechaInicio} - {reposo.fechaFin || 'Indefinido'}</TableCell>
                    <TableCell>{reposo.motivo}</TableCell>
                    <TableCell>{reposo.estado}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Box sx={{ mt: 3, p: 2, backgroundColor: '#f1f5f9', borderRadius: 2, border: '1px solid #cbd5e1', display: 'flex', alignItems: 'center', gap: 1 }}>
        <InfoOutlinedIcon sx={{ color: '#2563eb' }} />
        <Typography sx={{ fontSize: 14, color: '#1e293b', fontWeight: 500 }}>
          <strong>Información importante</strong>: Los reposos médicos deben ser validados por la coordinación deportiva antes de ser efectivos.
        </Typography>
      </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default GestionReposos;