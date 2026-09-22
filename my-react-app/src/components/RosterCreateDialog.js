import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';

const STATUS_OPTIONS = [
  { value: 'borrador', label: 'Borrador' },
  { value: 'oficial', label: 'Oficial' },
  { value: 'finalizado', label: 'Finalizado' }
];

function cleanValue(value) {
  return String(value || '').trim();
}

function getCategoriasByConvocadas(torneo) {
  const convocados = Array.isArray(torneo?.convocados) ? torneo.convocados : [];
  const countByKey = new Map();
  const labelByKey = new Map();

  convocados.forEach((item) => {
    const categoria = cleanValue(item?.categoria_snapshot || item?.alumno?.categoria || item?.categoria);
    if (!categoria) return;

    const key = categoria.toLowerCase();
    countByKey.set(key, (countByKey.get(key) || 0) + 1);
    if (!labelByKey.has(key)) labelByKey.set(key, categoria);
  });

  return Array.from(countByKey.entries())
    .map(([key, count]) => ({
      key,
      categoria: labelByKey.get(key) || key,
      count
    }))
    .sort((a, b) => b.count - a.count || a.categoria.localeCompare(b.categoria));
}

function getCategoriaSugeridaByConvocadas(torneo) {
  const categorias = getCategoriasByConvocadas(torneo);
  return categorias[0]?.categoria || '';
}

function RosterCreateDialog({ open, onClose, token, prefillTorneoId = '', onCreated }) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [torneos, setTorneos] = useState([]);
  const [eligibleRows, setEligibleRows] = useState([]);
  const [eligibleLoading, setEligibleLoading] = useState(false);
  const [categoriaSugerida, setCategoriaSugerida] = useState('');
  const [categoriasTorneo, setCategoriasTorneo] = useState([]);

  const [form, setForm] = useState({
    torneoId: '',
    ligaName: '',
    categoria: '',
    sexo: 'Femenino',
    division: '',
    grupoCompeticion: 'Grupo A',
    status: 'borrador'
  });
  const [selectedPlayers, setSelectedPlayers] = useState([]);

  useEffect(() => {
    if (!open) return;

    setStep(0);
    setError('');
    setEligibleRows([]);
    setSelectedPlayers([]);
    setCategoriaSugerida('');
    setCategoriasTorneo([]);
    setForm((prev) => ({ ...prev, torneoId: prefillTorneoId || prev.torneoId }));

    const fetchTorneos = async () => {
      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/torneos`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        const data = await res.json();
        if (!res.ok || !Array.isArray(data)) throw new Error('No se pudieron cargar torneos');
        setTorneos(data);

        const torneoIdSugerido = prefillTorneoId || data[0]?._id || '';
        const torneoSeleccionado = data.find((t) => String(t._id || t.id) === String(torneoIdSugerido));
        const sugerida = getCategoriaSugeridaByConvocadas(torneoSeleccionado);
        const categorias = getCategoriasByConvocadas(torneoSeleccionado);

        setCategoriaSugerida(sugerida);
        setCategoriasTorneo(categorias);
        setForm((prev) => ({
          ...prev,
          torneoId: torneoIdSugerido || prev.torneoId,
          categoria: sugerida || prev.categoria || ''
        }));
      } catch (err) {
        setError(err.message || 'No se pudieron cargar torneos');
      }
    };

    fetchTorneos();
  }, [open, token, prefillTorneoId]);

  const canGoStep2 = Boolean(form.torneoId && form.categoria && form.sexo && form.grupoCompeticion);

  const handleTorneoChange = (torneoId) => {
    const torneoSeleccionado = torneos.find((t) => String(t._id || t.id) === String(torneoId));
    const sugerida = getCategoriaSugeridaByConvocadas(torneoSeleccionado);
    const categorias = getCategoriasByConvocadas(torneoSeleccionado);

    setCategoriaSugerida(sugerida);
    setCategoriasTorneo(categorias);
    setForm((prev) => ({
      ...prev,
      torneoId,
      categoria: sugerida || prev.categoria || ''
    }));
  };

  const fetchEligible = async () => {
    setEligibleLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('torneoId', form.torneoId);
      params.set('sexo', form.sexo);
      params.set('categoria', form.categoria);
      if (form.division) params.set('division', form.division);

      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/rosters/eligible-students?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error(data?.error || 'No se pudieron cargar elegibles');

      setEligibleRows(data.map((row) => ({
        id: row._id,
        ...row
      })));
      setSelectedPlayers([]);
      setStep(1);
    } catch (err) {
      setError(err.message || 'No se pudieron cargar elegibles');
    } finally {
      setEligibleLoading(false);
    }
  };

  const handleCreate = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/rosters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          torneoId: form.torneoId,
          ligaName: form.ligaName,
          categoria: form.categoria,
          sexo: form.sexo,
          division: form.division,
          grupoCompeticion: form.grupoCompeticion,
          status: form.status,
          jugadores: selectedPlayers
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'No se pudo crear roster');

      if (typeof onCreated === 'function') onCreated(data?.roster);
      if (typeof onClose === 'function') onClose();
    } catch (err) {
      setError(err.message || 'No se pudo crear roster');
    } finally {
      setLoading(false);
    }
  };

  const columns = useMemo(() => [
    { field: 'nombre_completo', headerName: 'Nombre completo', flex: 1.4, minWidth: 220 },
    { field: 'cedula', headerName: 'Cedula', flex: 0.8, minWidth: 110 },
    { field: 'sexo', headerName: 'Sexo', flex: 0.8, minWidth: 100 },
    { field: 'categoria', headerName: 'Categoria', flex: 0.8, minWidth: 120 },
    { field: 'division', headerName: 'Division', flex: 0.8, minWidth: 120 },
    { field: 'numero_franela', headerName: 'Nro franela', flex: 0.7, minWidth: 100 },
    {
      field: 'estado_roster',
      headerName: 'Estado roster',
      flex: 1,
      minWidth: 180,
      renderCell: (params) => {
        const enOtro = params.row?.ya_en_otro_roster === true;
        return enOtro
          ? <Chip size="small" color="warning" label="Ya en otro roster" />
          : <Chip size="small" color="success" label="Disponible" />;
      }
    }
  ], []);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>Crear roster</DialogTitle>
      <DialogContent>
        <Stepper activeStep={step} sx={{ mb: 2 }}>
          <Step><StepLabel>Definicion</StepLabel></Step>
          <Step><StepLabel>Jugadoras</StepLabel></Step>
        </Stepper>

        {!!error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {step === 0 && (
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                select
                label="Torneo"
                fullWidth
                value={form.torneoId}
                onChange={(e) => handleTorneoChange(e.target.value)}
              >
                {torneos.map((torneo) => (
                  <MenuItem key={torneo._id || torneo.id} value={torneo._id || torneo.id}>
                    {torneo.nombre}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Liga/Torneo (texto libre)"
                fullWidth
                value={form.ligaName}
                onChange={(e) => setForm((prev) => ({ ...prev, ligaName: e.target.value }))}
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="Categoria"
                fullWidth
                value={form.categoria}
                onChange={(e) => setForm((prev) => ({ ...prev, categoria: e.target.value }))}
                placeholder="Ej: U15"
                helperText={categoriaSugerida ? `Sugerida por convocadas: ${categoriaSugerida}` : ' '} 
              />
              {categoriasTorneo.length > 0 && (
                <Box sx={{ mt: 0.5, display: 'flex', gap: 0.8, flexWrap: 'wrap' }}>
                  {categoriasTorneo.map((item) => {
                    const activa = cleanValue(form.categoria).toLowerCase() === cleanValue(item.categoria).toLowerCase();
                    return (
                      <Chip
                        key={item.key}
                        size="small"
                        label={`${item.categoria} (${item.count})`}
                        color={activa ? 'primary' : 'default'}
                        variant={activa ? 'filled' : 'outlined'}
                        onClick={() => setForm((prev) => ({ ...prev, categoria: item.categoria }))}
                      />
                    );
                  })}
                </Box>
              )}
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                select
                label="Sexo"
                fullWidth
                value={form.sexo}
                onChange={(e) => setForm((prev) => ({ ...prev, sexo: e.target.value }))}
              >
                <MenuItem value="Femenino">Femenino</MenuItem>
                <MenuItem value="Masculino">Masculino</MenuItem>
                <MenuItem value="Mixto">Mixto</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} md={4}>
              <TextField
                label="Division"
                fullWidth
                value={form.division}
                onChange={(e) => setForm((prev) => ({ ...prev, division: e.target.value }))}
                placeholder="Ej: Primera division"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                label="Grupo de competicion"
                fullWidth
                value={form.grupoCompeticion}
                onChange={(e) => setForm((prev) => ({ ...prev, grupoCompeticion: e.target.value }))}
                placeholder="Ej: Grupo A"
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                select
                label="Estatus"
                fullWidth
                value={form.status}
                onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value }))}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
        )}

        {step === 1 && (
          <Box>
            <Typography variant="body2" sx={{ mb: 1.2, color: '#64748b' }}>
              Selecciona jugadoras elegibles. Las que ya estan en otro roster del mismo torneo se bloquean.
            </Typography>
            <Box sx={{ height: 460 }}>
              <DataGrid
                rows={eligibleRows}
                columns={columns}
                loading={eligibleLoading}
                checkboxSelection
                disableRowSelectionOnClick
                rowSelectionModel={selectedPlayers}
                onRowSelectionModelChange={(newSelection) => setSelectedPlayers(newSelection)}
                isRowSelectable={(params) => !params.row?.ya_en_otro_roster}
                pageSizeOptions={[10, 25, 50]}
                localeText={{
                  noRowsLabel: 'No hay convocadas del torneo que coincidan con sexo/categoria/division.'
                }}
              />
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Cancelar</Button>
        {step === 1 && <Button onClick={() => setStep(0)}>Atras</Button>}
        {step === 0 && (
          <Button onClick={fetchEligible} variant="contained" disabled={!canGoStep2 || eligibleLoading}>
            {eligibleLoading ? 'Cargando...' : 'Continuar'}
          </Button>
        )}
        {step === 1 && (
          <Button onClick={handleCreate} variant="contained" disabled={loading || selectedPlayers.length === 0}>
            {loading ? 'Guardando...' : `Crear roster (${selectedPlayers.length})`}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default RosterCreateDialog;
