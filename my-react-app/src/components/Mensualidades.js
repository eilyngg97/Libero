import React, { useState } from 'react';
import { Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, IconButton, Typography, Chip, Box, Snackbar, Alert, Avatar } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PaymentIcon from '@mui/icons-material/Payment';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CloseIcon from '@mui/icons-material/Close';
import { useSede } from '../context/SedeContext';
import { useDolar } from '../context/DolarContext';
import TablePagination from '@mui/material/TablePagination';
import { exportToCsv } from '../utils/exportCsv';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import './Mensualidades.css';

const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const metodosPago = ['Pago movil', 'Transferencia', 'Efectivo',];

function Mensualidades() {
	const { sedeSeleccionada } = useSede();
	const { dolar } = useDolar();
	const theme = useTheme();
	const isMobile = useMediaQuery(theme.breakpoints.down('md'));
	const [mensualidades, setMensualidades] = useState([]);
	const [mensualidadesBD, setMensualidadesBD] = useState([]);
	const [filtroMes, setFiltroMes] = useState(() => (new Date().getMonth() + 1).toString());
	const [filtroAlumno, setFiltroAlumno] = useState('');
	const [filtroEstado, setFiltroEstado] = useState('');
	const [modalPago, setModalPago] = useState(false);
	const [pagoInfo, setPagoInfo] = useState({});
	const [comprobante, setComprobante] = useState(null);
	const [metodoPago, setMetodoPago] = useState(metodosPago[0]);
	const [referencia, setReferencia] = useState('');
	const [errorRef, setErrorRef] = useState('');
	const [montoPago, setMontoPago] = useState('');
	const [pagosPreviosTotal, setPagosPreviosTotal] = useState(0);
	const [montoPendiente, setMontoPendiente] = useState(0);
	const [pagosLoading, setPagosLoading] = useState(false);
	const [fechaPago, setFechaPago] = useState(() => {
		const hoy = new Date();
		return hoy.toISOString().slice(0, 10);
	});
	const [modalDetalle, setModalDetalle] = useState(false);
	const [detallePago, setDetallePago] = useState(null);
	const [pagosDetalle, setPagosDetalle] = useState([]);
	const [mensualidadDetalle, setMensualidadDetalle] = useState(null);
	const [successMessage, setSuccessMessage] = useState('');
	const [comprobanteDialogOpen, setComprobanteDialogOpen] = useState(false);
	const [comprobanteUrl, setComprobanteUrl] = useState('');
	const [comprobanteTipo, setComprobanteTipo] = useState('');

	// Cargar mensualidades de la sede y mes actual o mes filtrado
		React.useEffect(() => {
			async function fetchMensualidades() {
				try {
					let url = `${process.env.REACT_APP_API_URL}/api/mensualidades`;
					const params = [];
					if (sedeSeleccionada && sedeSeleccionada._id) params.push(`id_sede=${sedeSeleccionada._id}`);
					// Si hay filtro de mes, usarlo; si no, no enviar parámetro mes
					if (filtroMes) {
					  params.push(`mes=${filtroMes}`);
					}
					if (params.length) url += '?' + params.join('&');
					const res = await fetch(url);
					const data = await res.json();
					if (!res.ok) throw new Error('Error al obtener mensualidades');
					setMensualidadesBD(data);
					setMensualidades(data);
				} catch {
					setMensualidadesBD([]);
					setMensualidades([]);
				}
			}
			fetchMensualidades();
		}, [sedeSeleccionada, filtroMes]);

	// Filtros
	React.useEffect(() => {
		let filtradas = mensualidadesBD;
		if (filtroMes) filtradas = filtradas.filter(m => m.mes === Number(filtroMes) || m.mes === filtroMes);
		if (filtroAlumno) filtradas = filtradas.filter(m => (m.id_alumno && m.id_alumno.nombres && m.id_alumno.apellidos ? (m.id_alumno.nombres + ' ' + m.id_alumno.apellidos).toLowerCase() : '').includes(filtroAlumno.toLowerCase()));
		if (filtroEstado) filtradas = filtradas.filter(m => m.estatus && m.estatus.toLowerCase() === filtroEstado.toLowerCase());
		setMensualidades(filtradas);
	}, [filtroMes, filtroAlumno, filtroEstado, mensualidadesBD]);

	// Registro de pago rápido
	const handlePago = (m) => {
		setPagoInfo(m);
		setModalPago(true);
		setPagosLoading(true);
		setPagosPreviosTotal(0);
		setMontoPendiente(Number(m?.monto_esperado) || 0);
		setMontoPago(m?.id_alumno?.habilitar_pago_cuotas ? (Number(m?.monto_esperado) || 0) : (Number(m?.monto_esperado) || 0));
		fetch(`${process.env.REACT_APP_API_URL}/api/pagos/${m._id}`)
			.then(res => res.json())
			.then(data => {
				if (!Array.isArray(data)) return;
				const totalPrevio = data.reduce((acc, p) => acc + (Number(p.monto_pagado) || 0), 0);
				const restante = Math.max(0, (Number(m?.monto_esperado) || 0) - totalPrevio);
				setPagosPreviosTotal(totalPrevio);
				setMontoPendiente(restante);
				setMontoPago(m?.id_alumno?.habilitar_pago_cuotas ? restante : (Number(m?.monto_esperado) || 0));
			})
			.finally(() => setPagosLoading(false));
	};

	// Ver detalle de pago
	const handleVerDetalle = async (m) => {
		setMensualidadDetalle(m);
		// Buscar el pago más reciente asociado a la mensualidad
		try {
			const res = await fetch(`${process.env.REACT_APP_API_URL}/api/pagos/${m._id}`);
			const data = await res.json();
			console.log('Detalle pago:', data);	
			if (Array.isArray(data) && data.length > 0) {
				// Suponemos que el pago más reciente es el último
				setDetallePago(data[data.length - 1]);
				setPagosDetalle(data);
			} else {
				setDetallePago(null);
				setPagosDetalle([]);
			}
			setModalDetalle(true);
		} catch {
			setDetallePago(null);
			setPagosDetalle([]);
			setModalDetalle(true);
		}
	};

	const confirmarMensualidad = async () => {
		if (!mensualidadDetalle?._id) return;
		try {
			await fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades/${mensualidadDetalle._id}/confirmar`, {
				method: 'PATCH'
			});
			setModalDetalle(false);
			// Refrescar mensualidades
			let url = `${process.env.REACT_APP_API_URL}/api/mensualidades`;
			const params = [];
			if (sedeSeleccionada && sedeSeleccionada._id) params.push(`id_sede=${sedeSeleccionada._id}`);
			if (filtroMes) params.push(`mes=${filtroMes}`);
			if (params.length) url += '?' + params.join('&');
			const res = await fetch(url);
			const data = await res.json();
			setMensualidadesBD(data);
			setMensualidades(data);
		} catch (err) {
			alert('Error al confirmar mensualidad');
		}
	};

	const copiarReferencia = async (texto) => {
		if (!texto) return;
		try {
			await navigator.clipboard.writeText(texto);
		} catch {
			// no-op
		}
	};

	const handleVerComprobante = (url) => {
		if (!url) return;
		let finalUrl = url;
		if (!/^https?:\/\//i.test(url)) {
			finalUrl = `${process.env.REACT_APP_API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
		}
		const extension = finalUrl.split('.').pop()?.toLowerCase() || '';
		setComprobanteTipo(extension);
		setComprobanteUrl(finalUrl);
		setComprobanteDialogOpen(true);
	};
		// Paginación
	const [pagina, setPagina] = useState(0);
	const [filasPorPagina, setFilasPorPagina] = useState(10);

	const handleChangePagina = (event, nuevaPagina) => {
		setPagina(nuevaPagina);
	};

	const handleChangeFilasPorPagina = (event) => {
		setFilasPorPagina(parseInt(event.target.value, 10));
		setPagina(0);
	};
	
	const registrarPago = async () => {
		// Validar numero de digitos de referencia
		if ((metodoPago === 'Transferencia' || metodoPago === 'Pago movil') && referencia.length !== 6) {
			setErrorRef('Debes ingresar los 6 últimos dígitos de la referencia');
			return;
		}
		const habilitarCuotas = pagoInfo?.id_alumno?.habilitar_pago_cuotas === true;
		const montoEsperado = Number(pagoInfo?.monto_esperado) || 0;
		const montoToPay = habilitarCuotas ? Number(montoPago) : montoEsperado;
		if (!montoToPay || Number.isNaN(montoToPay) || montoToPay <= 0) {
			alert('Monto a pagar inválido');
			return;
		}
		if (habilitarCuotas && montoToPay > (Number(montoPendiente) || 0)) {
			alert('El monto excede el saldo pendiente');
			return;
		}
		setErrorRef('');
		try {
			const token = localStorage.getItem('token');
			const formData = new FormData();
			formData.append('id_mensualidad', pagoInfo._id);
			formData.append('monto_pagado', montoToPay);
			formData.append('fecha_pago', fechaPago);
			formData.append('metodo_pago', metodoPago);
			if (metodoPago === 'Transferencia' || metodoPago === 'Pago movil') {
				formData.append('referencia', referencia);
			}
			if (comprobante) {
				formData.append('comprobante', comprobante);
			}
			const resPago = await fetch(`${process.env.REACT_APP_API_URL}/api/pagos`, {
				method: 'POST',
				headers: token ? { Authorization: `Bearer ${token}` } : undefined,
				body: formData
			});
			const dataPago = await resPago.json();
			if (!resPago.ok) throw new Error(dataPago?.error || 'Error al registrar pago');
			setModalPago(false);
			setComprobante(null);
			setMetodoPago(metodosPago[0]);
			setReferencia('');
			setMontoPago('');
			setPagosPreviosTotal(0);
			setMontoPendiente(0);
			setFechaPago(new Date().toISOString().slice(0, 10));
			setSuccessMessage('Pago registrado correctamente');
			// Refrescar mensualidades
			let url = `${process.env.REACT_APP_API_URL}/api/mensualidades`;
			const params = [];
			if (sedeSeleccionada && sedeSeleccionada._id) params.push(`id_sede=${sedeSeleccionada._id}`);
			if (params.length) url += '?' + params.join('&');
			const res = await fetch(url);
			const data = await res.json();
			setMensualidadesBD(data);
			setMensualidades(data);
		} catch (err) {
			alert(err.message || 'Error al registrar pago');
		}
	};

	const tasaBCV = dolar?.promedio || 0;
	const formatMoney = (value) => {
		if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
		return Number(value).toFixed(2);
	};

	const renderEstatusChip = (estatusRaw) => {
		const estado = (estatusRaw || '').toLowerCase();
		if (estado === 'pagado') return (
			<Chip
				label="Pagado"
				sx={{ borderRadius: 999, bgcolor: '#dff7ea', color: '#0f7a4a', fontWeight: 700, px: 1, '& .MuiChip-label': { px: 0.5 } }}
			/>
		);
		if (estado === 'pendiente') return (
			<Chip
				label="Pendiente"
				sx={{ borderRadius: 999, bgcolor: '#fff3dc', color: '#b45309', fontWeight: 700, px: 1, '& .MuiChip-label': { px: 0.5 } }}
			/>
		);
		if (estado === 'retrasado') return (
			<Chip
				label="Retrasado"
				sx={{ borderRadius: 999, bgcolor: '#ffe1e6', color: '#d32f2f', fontWeight: 700, px: 1, '& .MuiChip-label': { px: 0.5 } }}
			/>
		);
		if (estado === 'exonerado') return (
			<Chip
				label="Exonerado"
				sx={{ borderRadius: 999, bgcolor: '#e3f2fd', color: '#0288d1', fontWeight: 700, px: 1, '& .MuiChip-label': { px: 0.5 } }}
			/>
		);
		if (estado === 'abono') return (
			<Chip
				label="Abono"
				sx={{ borderRadius: 999, bgcolor: '#efe9e7', color: '#6d4c41', fontWeight: 700, px: 1, '& .MuiChip-label': { px: 0.5 } }}
			/>
		);
		if (estado === 'en revision') return (
			<Chip
				label="En revision"
				sx={{ borderRadius: 999, bgcolor: '#fff6cc', color: '#b45309', fontWeight: 700, px: 1, '& .MuiChip-label': { px: 0.5 } }}
			/>
		);
		return <Chip label={estatusRaw || '-'} variant="outlined" />;
	};

	const inputSx = {
		'& .MuiOutlinedInput-root': {
			borderRadius: 2,
			backgroundColor: '#ffffff'
		},
		'& .MuiOutlinedInput-notchedOutline': {
			borderColor: '#e2e8f0'
		},
		'& .MuiInputLabel-root': {
			color: '#64748b'
		}
	};

	const exportarExcel = () => {
		const alumnosRetrasados = mensualidades.filter(m => m.estatus && m.estatus.toLowerCase() === 'retrasado');
		const datos = alumnosRetrasados.map(m => ({
			Alumno: `${m.id_alumno?.nombres || ''} ${m.id_alumno?.apellidos || ''}`,
			Categoria: m.id_alumno?.categoria || '-',
			Mes: meses[(m.mes || 1) - 1],
			Monto: m.monto_esperado,
			Estado: m.estatus
		}));

		const headers = ['Alumno', 'Categoria', 'Mes', 'Monto', 'Estado'];
		const nombreSede = sedeSeleccionada?.nombre || 'sede';
		exportToCsv(datos, `alumnos_retrasados_${nombreSede}.csv`, headers);
	};

	const mensualidadesPaginadas = mensualidades.slice(pagina * filasPorPagina, pagina * filasPorPagina + filasPorPagina);

	return (
		<div>
			<Typography variant="h5" sx={{ mb: 2, fontWeight: 'bold' }}>Mensualidades</Typography>
			<Box className="mensualidades-filters-row" sx={{ display: 'grid', gap: 1.5, mb: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' } }}>
				<TextField select label="Mes" value={filtroMes} onChange={e => setFiltroMes(e.target.value)} sx={{ minWidth: 120, width: '100%' }}>
					<MenuItem value="">Todos</MenuItem>
					{[...Array(12)].map((_, i) => <MenuItem key={i+1} value={i+1}>{meses[i]}</MenuItem>)}
				</TextField>
				<TextField label="Alumno" value={filtroAlumno} onChange={e => setFiltroAlumno(e.target.value)} sx={{ minWidth: 180, width: '100%' }} />
				<TextField select label="Estado" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} sx={{ minWidth: 120, width: '100%' }}>
					<MenuItem value="">Todos</MenuItem>
					{['Pendiente','Pagado','Retrasado', 'Exonerado', 'En revision', 'Abono'].map(e => <MenuItem key={e} value={e}>{e}</MenuItem>)}
				</TextField>
				<Button
				className="mensualidades-export-btn"
				variant="contained"
				onClick={exportarExcel}
				sx={{ width: { xs: '100%', md: 'auto' }, justifySelf: { xs: 'stretch', md: 'end' } }}
			>
				Exportar CSV
			</Button>
			</Box>
			{isMobile ? (
				<Box sx={{ mt: 2, display: 'grid', gap: 1.5 }}>
					{mensualidadesPaginadas.map((m) => (
						<Paper key={m._id} sx={{ borderRadius: 3, border: '1px solid #eef0f3', p: 1.5, boxShadow: '0 4px 14px rgba(15, 23, 42, 0.06)' }}>
							<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
								<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
									<Avatar sx={{ width: 30, height: 30, bgcolor: '#e0ecff', color: '#2563eb', fontSize: 12, fontWeight: 700 }}>
										{m.id_alumno?.nombres ? `${m.id_alumno.nombres[0] || ''}${m.id_alumno.apellidos ? m.id_alumno.apellidos[0] : ''}`.toUpperCase() : ''}
									</Avatar>
									<Typography sx={{ fontWeight: 700, color: '#1f2937', fontSize: 14 }} noWrap>
										{m.id_alumno ? `${m.id_alumno.nombres} ${m.id_alumno.apellidos}` : '-'}
									</Typography>
								</Box>
								{renderEstatusChip(m.estatus)}
							</Box>
							<Box sx={{ display: 'grid', gap: 0.4, mb: 1.1 }}>
								<Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Categoría:</b> {m.id_alumno?.categoria || '-'}</Typography>
								<Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Mes:</b> {meses[(m.mes || 1) - 1]}</Typography>
								<Typography sx={{ fontSize: 12.5, color: '#0f172a' }}><b>Monto:</b> ${m.monto_esperado}</Typography>
							</Box>
							{['pendiente', 'retrasado', 'abono'].includes((m.estatus || '').toLowerCase()) && (
								<Button variant="contained" fullWidth onClick={() => handlePago(m)} endIcon={<ArrowForwardIcon fontSize="small" />} sx={{ bgcolor: '#0f172a', '&:hover': { bgcolor: '#1e293b' }, fontWeight: 700 }}>
									Registrar pago
								</Button>
							)}
							{['pagado', 'en revision', 'exonerado'].includes((m.estatus || '').toLowerCase()) && (
								<Button variant="outlined" fullWidth onClick={() => handleVerDetalle(m)} endIcon={<ArrowForwardIcon fontSize="small" />} sx={{ borderColor: '#cbd5e1', color: '#0f172a', fontWeight: 700 }}>
									Ver detalle
								</Button>
							)}
						</Paper>
					))}
					<Paper sx={{ borderRadius: 3, border: '1px solid #eef0f3' }}>
						<TablePagination
							component="div"
							count={mensualidades.length}
							page={pagina}
							onPageChange={handleChangePagina}
							rowsPerPage={filasPorPagina}
							onRowsPerPageChange={handleChangeFilasPorPagina}
							rowsPerPageOptions={[5, 10, 25, 50]}
							labelRowsPerPage="Filas por página"
						/>
					</Paper>
				</Box>
			) : (
				<TableContainer
					component={Paper}
					sx={{
						mt: 3,
						borderRadius: 3,
						overflow: 'hidden',
						boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)'
					}}
				>
					<Table sx={{ minWidth: 720 }}>
						<TableHead>
							<TableRow sx={{ backgroundColor: '#f8fafc' }}>
								<TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>ALUMNO</TableCell>
								<TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>CATEGORIA</TableCell>
								<TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>MES</TableCell>
								<TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>MONTO</TableCell>
								<TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>ESTADO</TableCell>
								<TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>ACCIONES</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{mensualidadesPaginadas.map((m) => (
								<TableRow
									key={m._id}
									sx={{ '& td': { borderBottom: '1px solid #eef0f3', py: 2 }, '&:hover': { backgroundColor: '#fafafa' } }}
								>
									<TableCell sx={{ fontWeight: 600, color: '#1f2937' }}>
										<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
											<Avatar sx={{ width: 28, height: 28, bgcolor: '#e0ecff', color: '#2563eb', fontSize: 12, fontWeight: 700 }}>
												{m.id_alumno?.nombres ? `${m.id_alumno.nombres[0] || ''}${m.id_alumno.apellidos ? m.id_alumno.apellidos[0] : ''}`.toUpperCase() : ''}
											</Avatar>
											{m.id_alumno ? m.id_alumno.nombres + ' ' + m.id_alumno.apellidos : ''}
										</Box>
									</TableCell>
									<TableCell>
										<Chip label={m.id_alumno ? m.id_alumno.categoria : '-'} sx={{ backgroundColor: '#f1f5f9', color: '#64748b', fontWeight: 700, fontSize: 12 }} />
									</TableCell>
									<TableCell sx={{ color: '#64748b' }}>{meses[(m.mes || 1) - 1]}</TableCell>
									<TableCell sx={{ fontWeight: 700, color: '#0f172a' }}>${m.monto_esperado}</TableCell>
									<TableCell>{renderEstatusChip(m.estatus)}</TableCell>
									<TableCell>
										{['pendiente', 'retrasado', 'abono'].includes((m.estatus || '').toLowerCase()) && (
											<Button variant="text" size="small" onClick={() => handlePago(m)} endIcon={<ArrowForwardIcon fontSize="small" />} sx={{ color: '#0f172a', fontWeight: 700 }}>
												Registrar pago
											</Button>
										)}
										{['pagado', 'en revision', 'exonerado'].includes((m.estatus || '').toLowerCase()) && (
											<Button variant="text" size="small" onClick={() => handleVerDetalle(m)} endIcon={<ArrowForwardIcon fontSize="small" />} sx={{ color: '#0f172a', fontWeight: 700 }}>
												Ver detalle
											</Button>
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
						<tfoot>
							<TableRow>
								<TableCell colSpan={6}>
									<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
										<TablePagination
											component="div"
											count={mensualidades.length}
											page={pagina}
											onPageChange={handleChangePagina}
											rowsPerPage={filasPorPagina}
											onRowsPerPageChange={handleChangeFilasPorPagina}
											rowsPerPageOptions={[5, 10, 25, 50]}
											labelRowsPerPage="Filas por página"
										/>
									</div>
								</TableCell>
							</TableRow>
						</tfoot>
					</Table>
				</TableContainer>
			)}
			<Dialog open={modalDetalle} onClose={() => setModalDetalle(false)} maxWidth="xs" fullWidth>
								<DialogTitle sx={{
									bgcolor: '#0f2544',
									color: '#fff',
									fontWeight: 700,
									fontSize: 16,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'space-between'
								}}>
									Detalle del Pago
									<IconButton size="small" onClick={() => setModalDetalle(false)} sx={{ color: '#e2e8f0' }}>
										&times;
									</IconButton>
								</DialogTitle>
								<DialogContent sx={{ bgcolor: '#f8fafc', pt: 3 }}>
									{detallePago ? (
										<Box sx={{
											borderRadius: 3,
											p: 2,
											bgcolor: '#f1f5f9',
											border: '1px solid #e2e8f0'
										}}>
											<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
												<Box sx={{
													width: 28,
													height: 28,
													borderRadius: 1.5,
													bgcolor: '#ffe8d6',
													color: '#ff7a00',
													display: 'flex',
													alignItems: 'center',
													justifyContent: 'center',
													fontWeight: 700
												}}>
													✓
												</Box>
												<Typography sx={{ fontWeight: 800, fontSize: 12, color: '#64748b', letterSpacing: '0.06em' }}>
													ULTIMO PAGO REGISTRADO
												</Typography>
											</Box>
											<Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', rowGap: 1.5, columnGap: 2, fontSize: 13 }}>
												<Typography sx={{ color: '#64748b' }}>Metodo de pago</Typography>
												<Typography sx={{ fontWeight: 700, color: '#0f172a', textAlign: 'right' }}>{detallePago.metodo_pago}</Typography>
												<Typography sx={{ color: '#64748b' }}>Monto pagado</Typography>
												<Typography sx={{ fontWeight: 700, color: '#ff7a00', textAlign: 'right' }}>{detallePago.monto_pagado} USD</Typography>
												<Typography sx={{ color: '#64748b' }}>Monto pagado (Bs)</Typography>
												<Typography sx={{ fontWeight: 700, color: '#0f172a', textAlign: 'right' }}>
													{detallePago.monto_pagado_bs ? `${detallePago.monto_pagado_bs} Bs` : '-'}
												</Typography>
												<Typography sx={{ color: '#64748b' }}>Fecha de pago</Typography>
												<Typography sx={{ fontWeight: 700, color: '#0f172a', textAlign: 'right' }}>{detallePago.fecha_pago ? new Date(detallePago.fecha_pago).toISOString().slice(0,10) : ''}</Typography>
												<Typography sx={{ color: '#64748b' }}>Referencia</Typography>
												<Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 0.5 }}>
													<Typography sx={{ fontWeight: 700, color: '#0f172a' }}>{detallePago.referencia || '-'}</Typography>
													{detallePago.referencia && (
														<IconButton size="small" onClick={() => copiarReferencia(detallePago.referencia)} aria-label="Copiar referencia" sx={{ color: '#94a3b8' }}>
															<ContentCopyIcon fontSize="inherit" />
														</IconButton>
													)}
												</Box>
												<Typography sx={{ color: '#64748b' }}>Comprobante</Typography>
												<Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
													{detallePago.comprobante_url ? (
														<Button
															variant="text"
															size="small"
															onClick={() => handleVerComprobante(detallePago.comprobante_url)}
															sx={{ color: '#ff7a00', fontWeight: 800 }}
														>
															Ver archivo
														</Button>
													) : (
														<Typography sx={{ color: '#94a3b8' }}>-</Typography>
													)}
												</Box>
											</Box>
										</Box>
									) : (
										<Typography>No hay información de pago registrada.</Typography>
									)}
									{mensualidadDetalle?.id_alumno?.habilitar_pago_cuotas === true && pagosDetalle.length > 0 && (
										<Box sx={{ mt: 2 }}>
											<Typography variant="subtitle2" sx={{ mb: 1 }}>Historial de abonos</Typography>
											<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
												{pagosDetalle.map((pago, idx) => (
													<Box key={pago._id || idx} sx={{ border: '1px solid #e2e8f0', borderRadius: 2, p: 1.5, background: '#fafafa' }}>
														<Typography variant="body2"><b>Método:</b> {pago.metodo_pago}</Typography>
														<Typography variant="body2"><b>Monto:</b> {pago.monto_pagado} USD</Typography>
														<Typography variant="body2"><b>Monto (Bs):</b> {pago.monto_pagado_bs ? `${pago.monto_pagado_bs} Bs` : '-'}</Typography>
														<Typography variant="body2"><b>Fecha:</b> {pago.fecha_pago ? new Date(pago.fecha_pago).toISOString().slice(0,10) : ''}</Typography>
														{pago.referencia && (
															<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
																<Typography variant="body2"><b>Referencia:</b> {pago.referencia}</Typography>
																<IconButton size="small" onClick={() => copiarReferencia(pago.referencia)} aria-label="Copiar referencia">
																	<ContentCopyIcon fontSize="inherit" />
																</IconButton>
															</Box>
														)}
														{pago.comprobante_url && (
															<Typography variant="body2">
																<b>Comprobante:</b>{' '}
																<Button
																	variant="text"
																	size="small"
																	onClick={() => handleVerComprobante(pago.comprobante_url)}
																>
																	Ver archivo
																</Button>
															</Typography>
														)}
													</Box>
												))}
											</Box>
										</Box>
									)}
								</DialogContent>
								<DialogActions sx={{ flexDirection: 'column', alignItems: 'stretch', gap: 1 }}>
									{(mensualidadDetalle?.estatus || '').toLowerCase() === 'en revision' && (
										<Button
											onClick={confirmarMensualidad}
											variant="contained"
											color="success"
											fullWidth
											sx={{
												backgroundColor: 'rgba(1, 130, 5, 0.83)',
												color: '#ffffff',
												boxShadow: 'none',
												'&:hover': {
													backgroundColor: 'rgba(1, 130, 5, 0.83)'
												}
											}}
										>
											Confirmar
										</Button>
									)}
									<Button onClick={() => setModalDetalle(false)} fullWidth variant="text">Volver</Button>
								</DialogActions>
							</Dialog>
			<Dialog open={comprobanteDialogOpen} onClose={() => setComprobanteDialogOpen(false)} maxWidth="md" fullWidth>
								<DialogTitle>Comprobante</DialogTitle>
								<DialogContent>
									{comprobanteUrl ? (
										<Box sx={{ display: 'flex', justifyContent: 'center' }}>
											{comprobanteTipo === 'pdf' ? (
												<iframe
													src={comprobanteUrl}
													title="Comprobante"
													style={{ width: '100%', height: '70vh', border: 'none' }}
												/>
											) : (
												<img src={comprobanteUrl} alt="Comprobante" style={{ maxWidth: '100%', maxHeight: '70vh', borderRadius: 8 }} />
											)}
										</Box>
									) : (
										<Typography>No hay comprobante disponible.</Typography>
									)}
								</DialogContent>
								<DialogActions>
									<Button onClick={() => setComprobanteDialogOpen(false)}>Cerrar</Button>
								</DialogActions>
			</Dialog>
			<Snackbar
				open={!!successMessage}
				autoHideDuration={3000}
				onClose={() => setSuccessMessage('')}
				anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
			>
				<Alert onClose={() => setSuccessMessage('')} severity="success" sx={{ width: '100%' }}>
					{successMessage}
				</Alert>
			</Snackbar>
			{/* Modal pago rápido */}
			<Dialog
				open={modalPago}
				onClose={() => { setModalPago(false); setMetodoPago(metodosPago[0]); setReferencia(''); setErrorRef(''); setMontoPago(''); setPagosPreviosTotal(0); setMontoPendiente(0); setFechaPago(new Date().toISOString().slice(0, 10)); }}
				maxWidth="sm"
				fullWidth
				PaperProps={{
					sx: {
						borderRadius: 3,
						boxShadow: '0 18px 40px rgba(15, 23, 42, 0.18)',
						overflow: 'hidden'
					}
				}}
			>
				<DialogTitle
					disableTypography
					sx={{
						p: 3,
						pb: 1.5,
						backgroundColor: '#ffffff'
					}}
				>
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
						<Box
							sx={{
								width: 36,
								height: 36,
								borderRadius: 2,
								backgroundColor: '#fff2e7',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center'
							}}
						>
							<PaymentIcon sx={{ color: '#ff7a00' }} />
						</Box>
						<Box>
							<Typography variant="h6" sx={{ fontWeight: 800, color: '#0f172a' }}>
								Registrar Pago
							</Typography>
							<Typography variant="body2" sx={{ color: '#94a3b8', mt: 0.25 }}>
								Ingresa los detalles de tu transferencia para procesar la inscripcion.
							</Typography>
						</Box>
					</Box>
				</DialogTitle>
				<DialogContent sx={{ p: 3, pt: 1.5, bgcolor: '#f8fafc' }}>
					{(pagoInfo?.estatus || '').toLowerCase() === 'abono' && (
						<Button
							variant="text"
							size="small"
							onClick={() => { setModalPago(false); handleVerDetalle(pagoInfo); }}
							sx={{ mt: 1, color: '#f97316', fontWeight: 700 }}
						>
							Ver historial de abonos
						</Button>
					)}
					<TextField
						select
						label="Método de pago"
						fullWidth
						margin="normal"
						size="small"
						sx={inputSx}
						value={metodoPago}
						onChange={e => { setMetodoPago(e.target.value); setReferencia(''); setErrorRef(''); }}
					>
						{metodosPago.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
					</TextField>
					<TextField
						label="Fecha de pago"
						type="date"
						fullWidth
						margin="normal"
						size="small"
						sx={inputSx}
						value={fechaPago}
						onChange={e => setFechaPago(e.target.value)}
						InputLabelProps={{ shrink: true }}
					/>
					{pagoInfo?.id_alumno?.habilitar_pago_cuotas ? (
						<>
							<TextField
								label="Monto a pagar"
								type="number"
								fullWidth
								margin="normal"
								size="small"
								sx={inputSx}
								value={montoPago}
								onChange={e => setMontoPago(e.target.value)}
								inputProps={{ min: 0, step: '0.01', max: montoPendiente || undefined }}
								helperText={`Pagado: ${formatMoney(pagosPreviosTotal)} | Pendiente: ${formatMoney(montoPendiente)}`}
								disabled={pagosLoading}
							/>
							<Typography variant="body2" sx={{ mt: -0.5, mb: 1, color: '#64748b' }}>
								Monto en Bs: {formatMoney((Number(montoPago) || 0) * tasaBCV)} Bs
							</Typography>
						</>
					) : (
						<>
							<TextField
								label="Monto a pagar"
								fullWidth
								margin="normal"
								size="small"
								sx={inputSx}
								value={pagoInfo.monto_esperado || ''}
								disabled
							/>
							<Typography variant="body2" sx={{ mt: -0.5, mb: 1, color: '#64748b' }}>
								Monto en Bs: {formatMoney((pagoInfo.monto_esperado || 0) * tasaBCV)} Bs
							</Typography>
						</>
					)}
					{(metodoPago === 'Transferencia' || metodoPago === 'Pago movil') && (
						<TextField
							label="6 últimos dígitos de referencia"
							fullWidth
							margin="normal"
							size="small"
							sx={inputSx}
							value={referencia}
							onChange={e => setReferencia(e.target.value.replace(/[^0-9]/g, ''))}
							inputProps={{ maxLength: 6 }}
							error={!!errorRef}
							helperText={errorRef}
						/>
					)}
					<Box
						component="label"
						sx={{
							mt: 2,
							border: '1px dashed #cbd5f0',
							borderRadius: 2,
							p: 2,
							textAlign: 'center',
							backgroundColor: '#f8fafc',
							display: 'block',
							cursor: 'pointer'
						}}
					>
						<Box
							sx={{
								width: 36,
								height: 36,
								borderRadius: '50%',
								backgroundColor: '#fff2e7',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								mx: 'auto',
								mb: 1
							}}
						>
							<PaymentIcon sx={{ color: '#ff7a00', fontSize: 18 }} />
						</Box>
						<Typography variant="body2" sx={{ fontWeight: 700, color: '#0f172a' }}>
							Haz clic para adjuntar comprobante
						</Typography>
						<Typography variant="caption" sx={{ color: '#94a3b8' }}>
							PNG, JPG hasta 5MB
						</Typography>
						<input type="file" hidden onChange={e => setComprobante(e.target.files[0])} />
					</Box>
					{comprobante && (
						<Box
							sx={{
								mt: 1.5,
								px: 1.5,
								py: 1,
								borderRadius: 2,
								border: '1px solid #e2e8f0',
								backgroundColor: '#ffffff',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'space-between',
								gap: 1
							}}
						>
							<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
								<InsertDriveFileIcon sx={{ color: '#fb923c', fontSize: 18 }} />
								<Typography
									variant="body2"
									sx={{
										color: '#475569',
										fontSize: 12,
										whiteSpace: 'nowrap',
										overflow: 'hidden',
										textOverflow: 'ellipsis'
									}}
								>
									{comprobante.name}
								</Typography>
							</Box>
							<IconButton size="small" onClick={() => setComprobante(null)}>
								<CloseIcon sx={{ fontSize: 16, color: '#94a3b8' }} />
							</IconButton>
						</Box>
					)}
				</DialogContent>
				<DialogActions sx={{ px: 3, pb: 3, pt: 1, justifyContent: 'flex-end', gap: 1.5 }}>
					<Button
						onClick={() => { setModalPago(false); setMetodoPago(metodosPago[0]); setReferencia(''); setErrorRef(''); setMontoPago(''); setPagosPreviosTotal(0); setMontoPendiente(0); setFechaPago(new Date().toISOString().slice(0, 10)); }}
						sx={{ color: '#64748b', fontWeight: 700 }}
					>
						Cancelar
					</Button>
					<Button
						onClick={registrarPago}
						variant="contained"
						disabled={pagosLoading}
						sx={{
							bgcolor: '#ff7a00',
							'&:hover': { bgcolor: '#f97316' },
							fontWeight: 800,
							borderRadius: 2,
							px: 3
						}}
					>
						Registrar
					</Button>
				</DialogActions>
			</Dialog>
		</div>
	);
}

export default Mensualidades;

