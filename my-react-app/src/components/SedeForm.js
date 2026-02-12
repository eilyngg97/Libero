
import React, { useState, useEffect } from 'react';
import Snackbar from '@mui/material/Snackbar';
import MuiAlert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';


function SedeForm({ onAgregarSede, modoEdicion, sedeEditar, onEditSede }) {
	const [nombre, setNombre] = useState('');
	const [direccion, setDireccion] = useState('');
	const [costo, setCosto] = useState('');
	const [estado, setEstado] = useState('Activa');
	const [horarioConstancia, setHorarioConstancia] = useState('');
	const [loading, setLoading] = useState(false);
	const [alert, setAlert] = useState({ open: false, message: '', severity: 'success' });

	useEffect(() => {
		if (modoEdicion && sedeEditar) {
			setNombre(sedeEditar.nombre || '');
			setDireccion(sedeEditar.direccion || '');
			setCosto(sedeEditar.costo || '');
			setEstado(sedeEditar.estado || 'Activa');
			setHorarioConstancia(sedeEditar.horario_constancia || '');
		} else {
			setNombre('');
			setDireccion('');
			setCosto('');
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
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ nombre, direccion, costo, estado, horario_constancia: horarioConstancia })
				});
				const data = await res.json();
				if (!res.ok) throw new Error(data.detalle || data.error || 'Error al editar sede');
				setAlert({ open: true, message: '¡Sede editada con éxito!', severity: 'success' });
				if (typeof onEditSede === 'function') onEditSede(data);
			} else {
				// Agregar nueva sede
				const res = await fetch(`${process.env.REACT_APP_API_URL}/api/sedes`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ nombre, direccion, costo, estado, horario_constancia: horarioConstancia })
				});
				const data = await res.json();
				if (!res.ok) throw new Error(data.detalle || data.error || 'Error al crear sede');
				setAlert({ open: true, message: '¡Sede agregada con éxito!', severity: 'success' });
				setNombre('');
				setDireccion('');
				setCosto('');
				setEstado('Activa');
				setHorarioConstancia('');
				if (typeof onAgregarSede === 'function') onAgregarSede(data);
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
					label="Monto Mensualidad"
					type="number"
					value={costo}
					onChange={e => setCosto(e.target.value)}
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
			<Snackbar open={alert.open} autoHideDuration={2500} onClose={() => setAlert({ ...alert, open: false })} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
				<MuiAlert onClose={() => setAlert({ ...alert, open: false })} severity={alert.severity} sx={{ width: '100%' }}>
					{alert.message}
				</MuiAlert>
			</Snackbar>
		</>
	);
//
}

export default SedeForm;
