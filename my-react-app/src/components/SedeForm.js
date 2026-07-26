
import React, { useState, useEffect } from 'react';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import { useDolar } from '../context/DolarContext';


function SedeForm({ onAgregarSede, modoEdicion, sedeEditar, onEditSede }) {
	const { dolar } = useDolar();
	const monedaActiva = String(dolar?.moneda || 'USD').toUpperCase() === 'EUR' ? 'EUR' : 'USD';
	const token = localStorage.getItem('token');
	const authHeaders = {
		...(token ? { Authorization: `Bearer ${token}` } : {})
	};
	const [nombre, setNombre] = useState('');
	const [direccion, setDireccion] = useState('');
	const [costo, setCosto] = useState('');
	const [montoInscripcion, setMontoInscripcion] = useState('');
	const [estado, setEstado] = useState('Activa');
	const [horarioConstancia, setHorarioConstancia] = useState('');
	const [loading, setLoading] = useState(false);
	const [alert, setAlert] = useState({ open: false, message: '', severity: 'success' });

	useEffect(() => {
		if (modoEdicion && sedeEditar) {
			setNombre(sedeEditar.nombre || '');
			setDireccion(sedeEditar.direccion || '');
			setCosto(sedeEditar.costo || '');
			setMontoInscripcion(sedeEditar.monto_inscripcion || '');
			setEstado(sedeEditar.estado || 'Activa');
			setHorarioConstancia(sedeEditar.horario_constancia || '');
		} else {
			setNombre('');
			setDireccion('');
			setCosto('');
			setMontoInscripcion('');
			setEstado('Activa');
			setHorarioConstancia('');
		}
	}, [modoEdicion, sedeEditar]);

	const handleSubmit = async (e) => {
		e.preventDefault();
		setLoading(true);
		setAlert({ open: false, message: '', severity: 'success' });
		try {
			if (modoEdicion && sedeEditar) {
				console.log('Editando sede:', sedeEditar);
				// Editar sede existente
				const res = await fetch(`${process.env.REACT_APP_API_URL}/api/sedes/${sedeEditar._id}`, {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
						...authHeaders
					},
					body: JSON.stringify({
						nombre,
						direccion,
						costo,
						monto_inscripcion: montoInscripcion,
						estado,
						horario_constancia: horarioConstancia
					})
				});
				const data = await res.json();
				if (!res.ok) throw new Error(data.detalle || data.error || 'Error al editar sede');

				// Reconsulta para asegurar estado fresco luego de editar.
				const fresca = await fetch(`${process.env.REACT_APP_API_URL}/api/sedes/${sedeEditar._id}?_t=${Date.now()}`, {
					cache: 'no-store',
					headers: authHeaders
				});
				const sedeFresca = await fresca.json().catch(() => data);
				setAlert({ open: true, message: '¡Sede editada con éxito!', severity: 'success' });
				if (typeof onEditSede === 'function') onEditSede(fresca.ok ? sedeFresca : data);
			} else {
				// Agregar nueva sede
				const res = await fetch(`${process.env.REACT_APP_API_URL}/api/sedes`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						...authHeaders
					},
					body: JSON.stringify({
						nombre,
						direccion,
						costo,
						monto_inscripcion: montoInscripcion,
						estado,
						horario_constancia: horarioConstancia
					})
				});
				const data = await res.json();
				if (!res.ok) throw new Error(data.detalle || data.error || 'Error al crear sede');

				let sedeCreada = data;
				if (data?._id) {
					const fresca = await fetch(`${process.env.REACT_APP_API_URL}/api/sedes/${data._id}?_t=${Date.now()}`, {
						cache: 'no-store',
						headers: authHeaders
					});
					sedeCreada = await fresca.json().catch(() => data);
				}
				setAlert({ open: true, message: '¡Sede agregada con éxito!', severity: 'success' });
				setNombre('');
				setDireccion('');
				setCosto('');
				setMontoInscripcion('');
				setEstado('Activa');
				setHorarioConstancia('');
				if (typeof onAgregarSede === 'function') onAgregarSede(sedeCreada);
			}
		} catch (err) {
			setAlert({ open: true, message: err.message, severity: 'error' });
		} finally {
			setLoading(false);
		}
	};

	return (
		<>
			<form onSubmit={handleSubmit} style={{ marginBottom: '1rem', minWidth: 320 }}>
				<TextField
					label="Nombre"
					value={nombre}
					onChange={e => setNombre(e.target.value)}
					required
					fullWidth
					margin="normal"
				/>
				<TextField
					label="Dirección"
					value={direccion}
					onChange={e => setDireccion(e.target.value)}
					required
					fullWidth
					margin="normal"
				/>
				<TextField
					label={`Monto Mensualidad (${monedaActiva})`}
					type="number"
					value={costo}
					onChange={e => setCosto(e.target.value)}
					required
					fullWidth
					margin="normal"
				/>
				<TextField
					label={`Monto Inscripción (${monedaActiva})`}
					type="number"
					value={montoInscripcion}
					onChange={e => setMontoInscripcion(e.target.value)}
					required
					fullWidth
					margin="normal"
				/>
				<TextField
					label="Horario para constancia"
					value={horarioConstancia}
					onChange={e => setHorarioConstancia(e.target.value)}
					fullWidth
					margin="normal"
					placeholder="Ej: los días lunes y miércoles de 6:00 pm a 8:00 pm y sábados de 10:00 am a 12:00 pm"
				/>
				<FormControl fullWidth margin="normal">
					<InputLabel id="estado-label">Estado</InputLabel>
					<Select
						labelId="estado-label"
						value={estado}
						label="Estado"
						onChange={e => setEstado(e.target.value)}
					>
						<MenuItem value="Activa">Activa</MenuItem>
						<MenuItem value="Inactiva">Inactiva</MenuItem>
					</Select>
				</FormControl>
				<Button type="submit" variant="contained" color="primary" fullWidth sx={{ mt: 2 }} disabled={loading}>
					{loading ? (modoEdicion ? 'Editando...' : 'Agregando...') : (modoEdicion ? 'Editar Sede' : 'Agregar Sede')}
				</Button>
			</form>
			<Snackbar
				open={alert.open}
				autoHideDuration={3500}
				onClose={() => setAlert({ ...alert, open: false })}
				anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
			>
				<Alert
					onClose={() => setAlert({ ...alert, open: false })}
					severity={alert.severity}
					variant="filled"
					sx={{ width: '100%', minWidth: 320, borderRadius: 2 }}
				>
					<AlertTitle sx={{ mb: 0.25, fontWeight: 800 }}>
						{alert.severity === 'success' ? 'Operacion completada' : 'Operacion fallida'}
					</AlertTitle>
					{alert.message}
				</Alert>
			</Snackbar>
		</>
	);
//
}

export default SedeForm;
