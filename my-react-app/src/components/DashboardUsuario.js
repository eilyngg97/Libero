import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardActions, Button, Typography, Avatar, Grid } from '@mui/material';
import { useNavigate } from 'react-router-dom';

function DashboardUsuario() {
  const [alumnos, setAlumnos] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    // 1. Obtener el usuario logueado
    const usuario = JSON.parse(localStorage.getItem('usuario'));
    if (!usuario || !usuario.id) {
      setAlumnos([]);
      return;
    }

    // 2. Buscar el representante asociado a este usuario o alumnos por usuario
    const fetchAlumnos = async () => {
      try {
        let alumnosFinal = [];
        // Buscar representante por usuario
        const repRes = await fetch(`${process.env.REACT_APP_API_URL}/api/representantes/por-usuario/${usuario.id}`);
        const repData = await repRes.json();
        if (repRes.ok && repData && repData._id) {
          // Buscar alumnos asociados a ese representante
          const alumRes = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/por-representante/${repData._id}?populateSede=1`);
          const alumData = await alumRes.json();
          if (alumRes.ok && Array.isArray(alumData)) {
            alumnosFinal = alumnosFinal.concat(alumData);
          }
        }
        // Buscar también alumnos por usuarioId (caso usuario sin representante o representante que es alumno)
        const alumRes2 = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/por-representante/null?usuarioId=${usuario.id}&populateSede=1`);
        const alumData2 = await alumRes2.json();
        console.log('Alumnos por usuarioId:', alumData2);
        if (alumRes2.ok && Array.isArray(alumData2)) {
          alumnosFinal = alumnosFinal.concat(alumData2);
        }
        // Eliminar duplicados por _id
        const alumnosUnicos = alumnosFinal.filter((al, idx, arr) => arr.findIndex(a2 => a2._id === al._id) === idx);
        setAlumnos(alumnosUnicos);
      } catch {
        setAlumnos([]);
      }
    };
    fetchAlumnos();
  }, []);
  
  return (
    <>
      <Grid container spacing={3} justifyContent="center" sx={{ mt: 2 }}>
        {alumnos.length === 0 ? (
          <Grid item xs={12} sx={{ textAlign: 'center', mt: 6 }}>
            <Typography variant="h6" color="text.secondary">
              No tienes alumnos registrados.
            </Typography>
          </Grid>
        ) : (
          alumnos.map((alumno) => (
            <Grid item xs={12} sm={6} md={4} key={alumno._id}>
              <Card sx={{ borderRadius: 3, boxShadow: 3, p: 2, minWidth: 260 }}>
                <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <Avatar
                    src={alumno.foto || undefined}
                    alt={alumno.nombres}
                    sx={{ width: 64, height: 64, mb: 1 }}
                  />
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
                    {alumno.nombres} {alumno.apellidos}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Categoría: <b>{alumno.categoria || '-'}</b>
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Sede: <b>{alumno.sede && typeof alumno.sede === 'object' ? alumno.sede.nombre : alumno.sede || '-'}</b>
                  </Typography>
                </CardContent>
                <CardActions sx={{ justifyContent: 'center', borderTop: '1px solid #eee', mt: 1 }}>
                  <Button 
                    variant="contained" 
                    size="small" 
                    color="primary"
                    onClick={() => {
                      navigate(`/panel-opciones-usuario/${alumno._id}`, {
                        state: {
                          alumno: alumno,
                          sede: { nombre: alumno.sede }
                        }
                      });
                    }}
                  >
                    Ver detalles
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))
        )}
      </Grid>
    </>
  );
}

export default DashboardUsuario;
