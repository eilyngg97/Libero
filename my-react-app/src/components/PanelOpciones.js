import React, { useEffect, useState } from 'react';
import { useSede } from '../context/SedeContext';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, Grid, IconButton, Select, MenuItem } from '@mui/material';
import SchoolIcon from '@mui/icons-material/School';
import SportsVolleyballIcon from '@mui/icons-material/SportsVolleyball';
import PaymentsIcon from '@mui/icons-material/Payments';
import AddShoppingCartIcon from '@mui/icons-material/AddShoppingCart';
import LocationOnIcon from '@mui/icons-material/LocationOn';
import { hasPermission } from '../utils/permissions';

function PanelOpciones() {
    const navigate = useNavigate();
    const { sedeSeleccionada, setSedeSeleccionada } = useSede();
    const [sedes, setSedes] = useState([]);
    const TODAS_SEDES_VALUE = '__all_sedes__';
    const canViewAlumnos = hasPermission('alumnos.view');
    const canViewEntrenadores = hasPermission('entrenadores.view');
    const canViewMensualidades = hasPermission('mensualidades.view');
    const canViewSolicitudesUniformes = hasPermission('solicitudes_uniformes.view');

    useEffect(() => {
        const fetchSedes = async () => {
            try {
                const res = await fetch(`${process.env.REACT_APP_API_URL}/api/sedes`);
                const data = await res.json();
                if (res.ok && Array.isArray(data)) setSedes(data);
                else setSedes([]);
            } catch {
                setSedes([]);
            }
        };
        fetchSedes();
    }, []);

    const handleSedeChange = (event) => {
        const { value } = event.target;
        if (value === TODAS_SEDES_VALUE) {
            setSedeSeleccionada(null);
            return;
        }
        const selected = sedes.find((sede) => sede._id === value);
        if (selected) setSedeSeleccionada(selected);
    };

    const handleEntrenadoresClick = () => {
        if (sedeSeleccionada?._id) {
            navigate('/entrenadores-sede');
            return;
        }

        navigate('/entrenadores');
    };
        return (
            <Box maxWidth={1200} mx="auto" mt={2}>
                {(sedeSeleccionada || sedes.length > 0) && (
                    <Box
                        sx={{
                            mb: 2,
                            border: '1px solid #cfcfcf',
                            bgcolor: '#ffffff',
                            borderRadius: 3,
                            px: 2,
                            py: 1.5,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 1.5
                        }}
                    >
                        <LocationOnIcon sx={{ color: '#ff7a00' }} />
                        <Typography sx={{ color: '#4a4a4a', fontWeight: 700 }}>
                            Sede actual:
                        </Typography>
                        <Select
                            size="small"
                            value={sedeSeleccionada?._id || TODAS_SEDES_VALUE}
                            onChange={handleSedeChange}
                            displayEmpty
                            sx={{
                                minWidth: 180,
                                fontWeight: 800,
                                color: '#ff7a00',
                                '& .MuiOutlinedInput-notchedOutline': { borderColor: '#e2e8f0' },
                                '& .MuiSelect-select': { py: 0.5 }
                            }}
                        >
                            <MenuItem value={TODAS_SEDES_VALUE}>Todas las sedes</MenuItem>
                            {sedes.map((sede) => (
                                <MenuItem key={sede._id} value={sede._id}>
                                    {sede.nombre}
                                </MenuItem>
                            ))}
                        </Select>
                    </Box>
                )}
                <Grid container spacing={2.5} mt={1} justifyContent="center">
                    {canViewAlumnos && (
                    <Grid item size={{ xs: 12, sm: 6, md: 3 }}>
                        <Box sx={{
                            borderRadius: 3,
                            minWidth: 160,
                            minHeight: 200,
                            boxShadow: 4,
                            background: 'linear-gradient(135deg, #16c1de 0%, #0f8aa7 100%)',
                            color: 'white',
                            p: 2,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            position: 'relative',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            transition: 'transform 0.2s',
                            '& > *:not(.bg-icon)': { position: 'relative', zIndex: 1 },
                            '&:hover': { transform: 'scale(1.04)' }
                        }} onClick={() => navigate('/tabla-alumnos')}>
                            <IconButton sx={{ bgcolor: 'rgba(255,255,255,0.2)', mb: 1 }}>
                                <SchoolIcon sx={{ fontSize: 32, color: 'white' }} />
                            </IconButton>
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>Alumnos</Typography>
                            <Typography variant="body2">Gestión de alumnos</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                Ver listado →
                            </Typography>
                            <SchoolIcon
                                className="bg-icon"
                                sx={{
                                    position: 'absolute',
                                    top: 12,
                                    right: 12,
                                    fontSize: 96,
                                    opacity: 0.16,
                                    color: 'white'
                                }}
                            />
                        </Box>
                    </Grid>
                    )}
                    {canViewEntrenadores && (
                    <Grid item size={{ xs: 12, sm: 6, md: 3 }}>
                        <Box sx={{
                            borderRadius: 3,
                            minWidth: 160,
                            minHeight: 200,
                            boxShadow: 4,
                            background: 'linear-gradient(135deg, #27c86b 0%, #0ea577 100%)',
                            color: 'white',
                            p: 2,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            position: 'relative',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            transition: 'transform 0.2s',
                            '& > *:not(.bg-icon)': { position: 'relative', zIndex: 1 },
                            '&:hover': { transform: 'scale(1.04)' }
                        }} onClick={handleEntrenadoresClick}>
                            <IconButton sx={{ bgcolor: 'rgba(255,255,255,0.2)', mb: 1 }}>
                                <SportsVolleyballIcon sx={{ fontSize: 32, color: 'white' }} />
                            </IconButton>
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>Entrenadores</Typography>
                            <Typography variant="body2">Gestión de entrenadores</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                Gestionar equipo →
                            </Typography>
                            <SportsVolleyballIcon
                                className="bg-icon"
                                sx={{
                                    position: 'absolute',
                                    top: 12,
                                    right: 12,
                                    fontSize: 96,
                                    opacity: 0.16,
                                    color: 'white'
                                }}
                            />
                        </Box>
                    </Grid>
                    )}
                    {canViewMensualidades && (
                    <Grid item size={{ xs: 12, sm: 6, md: 3 }}>
                        <Box sx={{
                            borderRadius: 3,
                            minWidth: 160,
                            minHeight: 200,
                            boxShadow: 4,
                            background: 'linear-gradient(135deg, #ff8a00 0%, #ff6a00 100%)',
                            color: 'white',
                            p: 2,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            position: 'relative',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            transition: 'transform 0.2s',
                            '& > *:not(.bg-icon)': { position: 'relative', zIndex: 1 },
                            '&:hover': { transform: 'scale(1.04)' }
                        }} onClick={() => navigate('/mensualidades')}>
                            <IconButton sx={{ bgcolor: 'rgba(255,255,255,0.2)', mb: 1 }}>
                                <PaymentsIcon sx={{ fontSize: 32, color: 'white' }} />
                            </IconButton>
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>Mensualidades</Typography>
                            <Typography variant="body2">Gestión de pagos</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                Ver finanzas →
                            </Typography>
                            <PaymentsIcon
                                className="bg-icon"
                                sx={{
                                    position: 'absolute',
                                    top: 12,
                                    right: 12,
                                    fontSize: 96,
                                    opacity: 0.16,
                                    color: 'white'
                                }}
                            />
                        </Box>
                    </Grid>
                    )}
                    {canViewSolicitudesUniformes && (
                    <Grid item size={{ xs: 12, sm: 6, md: 3 }}>
                        <Box sx={{
                            borderRadius: 3,
                            minWidth: 160,
                            minHeight: 200,
                            boxShadow: 4,
                            background: 'linear-gradient(135deg, #7b5cff 0%, #5a34d6 100%)',
                            color: 'white',
                            p: 2,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            position: 'relative',
                            overflow: 'hidden',
                            cursor: 'pointer',
                            transition: 'transform 0.2s',
                            '& > *:not(.bg-icon)': { position: 'relative', zIndex: 1 },
                            '&:hover': { transform: 'scale(1.04)' }
                        }} onClick={() => navigate('/listado-solicitudes-uniformes')}>
                            <IconButton sx={{ bgcolor: 'rgba(255,255,255,0.2)', mb: 1 }}>
                                <AddShoppingCartIcon sx={{ fontSize: 32, color: 'white' }} />
                            </IconButton>
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>Solicitudes Uniforme</Typography>
                            <Typography variant="body2">Pedidos y pedidos</Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                Revisar solicitudes →
                            </Typography>
                            <AddShoppingCartIcon
                                className="bg-icon"
                                sx={{
                                    position: 'absolute',
                                    top: 12,
                                    right: 12,
                                    fontSize: 96,
                                    opacity: 0.16,
                                    color: 'white'
                                }}
                            />
                        </Box>
                    </Grid>
                    )}
                    {!canViewAlumnos && !canViewEntrenadores && !canViewMensualidades && !canViewSolicitudesUniformes && (
                    <Grid item xs={12}>
                        <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 3, p: 2, bgcolor: '#fff' }}>
                            <Typography sx={{ fontWeight: 800, color: '#0f172a', mb: 0.6 }}>
                                Sin modulos operativos habilitados
                            </Typography>
                            <Typography sx={{ color: '#64748b' }}>
                                Este rol no tiene acceso a alumnos, entrenadores, mensualidades ni solicitudes de uniformes.
                            </Typography>
                        </Box>
                    </Grid>
                    )}
                </Grid>
            </Box>
        );
}

export default PanelOpciones;