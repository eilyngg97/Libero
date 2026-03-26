import React, { useState } from 'react';
import { Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, IconButton, Typography, Chip, Box, Snackbar, Alert, Avatar, Tooltip } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PaymentIcon from '@mui/icons-material/Payment';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import { useSede } from '../context/SedeContext';
import { useDolar } from '../context/DolarContext';
import TablePagination from '@mui/material/TablePagination';
import { exportToCsv } from '../utils/exportCsv';
import PaymentsIcon from '@mui/icons-material/Payments';
import PaidIcon from '@mui/icons-material/Paid';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { obtenerTasaOficialPorFecha } from '../utils/dolarHistorico';
import { normalizeMetodoPago, metodoRequiereReferencia } from '../utils/paymentMethod';
import './Mensualidades.css';

const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const metodosPago = ['Pago movil', 'Transferencia', 'Efectivo',];

const getLocalInputDate = (dateValue = new Date()) => {
	const date = new Date(dateValue);
	date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
	return date.toISOString().slice(0, 10);
};

const getInputDateFromApi = (value) => {
	if (!value) return getLocalInputDate();
	const raw = String(value).trim();
	const matchIso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (matchIso) return `${matchIso[1]}-${matchIso[2]}-${matchIso[3]}`;
	return getLocalInputDate(new Date(value));
};

function Mensualidades() {
	const { sedeSeleccionada } = useSede();
	const { dolar } = useDolar();
	const theme = useTheme();
	const isMobile = useMediaQuery(theme.breakpoints.down('md'));
	const esAdmin = localStorage.getItem('rol') === 'admin';
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
	const [fechaPago, setFechaPago] = useState(() => getLocalInputDate());
	const [modalDetalle, setModalDetalle] = useState(false);
	const [detallePago, setDetallePago] = useState(null);
	const [pagosDetalle, setPagosDetalle] = useState([]);
	const [mensualidadDetalle, setMensualidadDetalle] = useState(null);
	const [successMessage, setSuccessMessage] = useState('');
	const [comprobanteDialogOpen, setComprobanteDialogOpen] = useState(false);
	const [comprobanteUrl, setComprobanteUrl] = useState('');
	const [comprobanteTipo, setComprobanteTipo] = useState('');
	const [pagoEnEdicion, setPagoEnEdicion] = useState(null);
	const [guardandoPago, setGuardandoPago] = useState(false);
	const [eliminandoPagoId, setEliminandoPagoId] = useState('');
	const [confirmarEliminarOpen, setConfirmarEliminarOpen] = useState(false);
	const [pagoAEliminar, setPagoAEliminar] = useState(null);
	const [quitarComprobanteActual, setQuitarComprobanteActual] = useState(false);
	const [tasaPagoHistorica, setTasaPagoHistorica] = useState(null);
	const [modalAjusteSede, setModalAjusteSede] = useState(false);
	const [ajusteNuevoMonto, setAjusteNuevoMonto] = useState('');
	const [ajusteDescripcion, setAjusteDescripcion] = useState('');
	const [ajusteAnio, setAjusteAnio] = useState(() => String(new Date().getFullYear()));
	const [aplicandoAjuste, setAplicandoAjuste] = useState(false);
	const [previewAjuste, setPreviewAjuste] = useState(null);
	const [previewAjusteLoading, setPreviewAjusteLoading] = useState(false);
	const [previewAjusteError, setPreviewAjusteError] = useState('');
	const [adelantandoAlumnoId, setAdelantandoAlumnoId] = useState('');
	const [confirmarAdelantoOpen, setConfirmarAdelantoOpen] = useState(false);
	const [mensualidadAAdelantar, setMensualidadAAdelantar] = useState(null);

	const getAuthHeaders = () => {
		const token = localStorage.getItem('token');
		return token ? { Authorization: `Bearer ${token}` } : {};
	};

	const resetPagoForm = () => {
		setModalPago(false);
		setPagoEnEdicion(null);
		setPagoInfo({});
		setComprobante(null);
		setQuitarComprobanteActual(false);
		setMetodoPago(metodosPago[0]);
		setReferencia('');
		setErrorRef('');
		setMontoPago('');
		setPagosPreviosTotal(0);
		setMontoPendiente(0);
		setFechaPago(getLocalInputDate());
		setTasaPagoHistorica(null);
	};

	const resetAjusteSedeForm = () => {
		setModalAjusteSede(false);
		setAjusteNuevoMonto('');
		setAjusteDescripcion('');
		setAjusteAnio(String(new Date().getFullYear()));
		setPreviewAjuste(null);
		setPreviewAjusteError('');
	};

	const obtenerPreviewAjusteSede = React.useCallback(async () => {
		if (!sedeSeleccionada?._id || !filtroMes) {
			setPreviewAjuste(null);
			setPreviewAjusteError('');
			return;
		}

		const nuevoMonto = Number(ajusteNuevoMonto);
		const anio = Number(ajusteAnio);

		if (Number.isNaN(nuevoMonto) || nuevoMonto < 0 || Number.isNaN(anio) || anio < 2000) {
			setPreviewAjuste(null);
			setPreviewAjusteError('');
			return;
		}

		try {
			setPreviewAjusteLoading(true);
			setPreviewAjusteError('');
			const res = await fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades/ajuste-sede/preview`, {
				method: 'POST',
				headers: {
					...getAuthHeaders(),
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					id_sede: sedeSeleccionada._id,
					mes: Number(filtroMes),
					anio,
					nuevo_monto: nuevoMonto
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || 'No se pudo calcular la vista previa');
			setPreviewAjuste(data);
		} catch (err) {
			setPreviewAjuste(null);
			setPreviewAjusteError(err.message || 'No se pudo calcular la vista previa');
		} finally {
			setPreviewAjusteLoading(false);
		}
	}, [sedeSeleccionada?._id, filtroMes, ajusteNuevoMonto, ajusteAnio]);

	React.useEffect(() => {
		if (!modalAjusteSede) return;

		const timer = setTimeout(() => {
			obtenerPreviewAjusteSede();
		}, 300);

		return () => clearTimeout(timer);
	}, [modalAjusteSede, obtenerPreviewAjusteSede]);

	React.useEffect(() => {
		if (!modalPago || !fechaPago) return;

		let cancelled = false;

		const cargarTasaHistorica = async () => {
			try {
				const tasaHistorica = await obtenerTasaOficialPorFecha(fechaPago, Number(dolar?.promedio) || 0);
				if (!cancelled) {
					setTasaPagoHistorica(Number(tasaHistorica) || 0);
				}
			} catch {
				if (!cancelled) {
					setTasaPagoHistorica(Number(dolar?.promedio) || 0);
				}
			}
		};

		cargarTasaHistorica();

		return () => {
			cancelled = true;
		};
	}, [modalPago, fechaPago, dolar?.promedio]);

	const cargarMensualidades = React.useCallback(async () => {
		try {
			const token = localStorage.getItem('token');
			let url = `${process.env.REACT_APP_API_URL}/api/mensualidades`;
			const params = [];
			if (sedeSeleccionada && sedeSeleccionada._id) params.push(`id_sede=${sedeSeleccionada._id}`);
			if (filtroMes) params.push(`mes=${filtroMes}`);
			if (params.length) url += '?' + params.join('&');
			const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || 'Error al obtener mensualidades');
			setMensualidadesBD(data);
			setMensualidades(data);
		} catch {
			setMensualidadesBD([]);
			setMensualidades([]);
		}
	}, [sedeSeleccionada, filtroMes]);

	const cargarPagosMensualidad = async (mensualidadId) => {
		const res = await fetch(`${process.env.REACT_APP_API_URL}/api/pagos/${mensualidadId}`, {
			headers: getAuthHeaders()
		});
		const data = await res.json();
		if (!res.ok) throw new Error(data?.error || 'Error al obtener pagos');
		return Array.isArray(data) ? data : [];
	};

	const prepararModalPago = async (mensualidad, pagoEditar = null) => {
		const puedePagarCuotas = esAdmin || mensualidad?.id_alumno?.habilitar_pago_cuotas === true;
		setPagoInfo(mensualidad);
		setPagoEnEdicion(pagoEditar);
		setComprobante(null);
		setQuitarComprobanteActual(false);
		setErrorRef('');
		setMetodoPago(normalizeMetodoPago(pagoEditar?.metodo_pago));
		setReferencia(pagoEditar?.referencia ? String(pagoEditar.referencia) : '');
		setFechaPago(getInputDateFromApi(pagoEditar?.fecha_pago));
		setModalPago(true);
		setPagosLoading(true);
		setPagosPreviosTotal(0);
		setMontoPendiente(Number(mensualidad?.monto_esperado) || 0);
		setMontoPago(pagoEditar ? (Number(pagoEditar.monto_pagado) || '') : (Number(mensualidad?.monto_esperado) || 0));

		try {
			const pagos = await cargarPagosMensualidad(mensualidad._id);
			const totalPrevio = pagos
				.filter((pago) => String(pago._id) !== String(pagoEditar?._id || ''))
				.reduce((acc, pago) => acc + (Number(pago.monto_pagado) || 0), 0);
			const restante = Math.max(0, (Number(mensualidad?.monto_esperado) || 0) - totalPrevio);
			setPagosPreviosTotal(totalPrevio);
			setMontoPendiente(restante);
			if (!pagoEditar) {
				setMontoPago(puedePagarCuotas ? restante : (Number(mensualidad?.monto_esperado) || 0));
			}
		} finally {
			setPagosLoading(false);
		}
	};

	const actualizarDetalleMensualidad = async (mensualidad, abrirModal = true) => {
		setMensualidadDetalle(mensualidad);
		try {
			const data = await cargarPagosMensualidad(mensualidad._id);
			if (data.length > 0) {
				setDetallePago(data[data.length - 1]);
				setPagosDetalle(data);
			} else {
				setDetallePago(null);
				setPagosDetalle([]);
			}
		} catch {
			setDetallePago(null);
			setPagosDetalle([]);
		}
		if (abrirModal) setModalDetalle(true);
	};

	// Cargar mensualidades de la sede y mes actual o mes filtrado
		React.useEffect(() => {
			async function fetchMensualidades() {
				await cargarMensualidades();
			}
			fetchMensualidades();
		}, [cargarMensualidades]);

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
		prepararModalPago(m);
	};

	const adelantarSiguienteMensualidadAdmin = async (mensualidadBase) => {
		const alumnoId = mensualidadBase?.id_alumno?._id || mensualidadBase?.id_alumno;
		if (!alumnoId || adelantandoAlumnoId) return;

		try {
			setAdelantandoAlumnoId(String(alumnoId));
			const res = await fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades/adelantar`, {
				method: 'POST',
				headers: {
					...getAuthHeaders(),
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ id_alumno: alumnoId })
			});

			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || 'No se pudo adelantar la mensualidad');

			if (data?.mensualidad?._id) {
				await prepararModalPago(data.mensualidad);
			}

			await cargarMensualidades();
			setSuccessMessage(data?.message || 'Mensualidad adelantada correctamente');
		} catch (err) {
			alert(err.message || 'No se pudo adelantar la mensualidad');
		} finally {
			setAdelantandoAlumnoId('');
		}
	};

	const solicitarAdelantoMensualidad = (mensualidadBase) => {
		if (!mensualidadBase || adelantandoAlumnoId) return;
		setMensualidadAAdelantar(mensualidadBase);
		setConfirmarAdelantoOpen(true);
	};

	const handleEditarPago = (pago, mensualidad = mensualidadDetalle) => {
		prepararModalPago(mensualidad, pago);
	};

	// Ver detalle de pago
	const handleVerDetalle = async (m) => {
		await actualizarDetalleMensualidad(m, true);
	};

	const confirmarMensualidad = async () => {
		if (!mensualidadDetalle?._id) return;
		try {
			await fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades/${mensualidadDetalle._id}/confirmar`, {
				method: 'PATCH',
				headers: getAuthHeaders()
			});
			setModalDetalle(false);
			await cargarMensualidades();
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

	const solicitarEliminarPago = (pago) => {
		if (!pago?._id) return;
		setPagoAEliminar(pago);
		setConfirmarEliminarOpen(true);
	};

	const eliminarPago = async () => {
		if (!pagoAEliminar?._id || !mensualidadDetalle?._id) return;

		try {
			setEliminandoPagoId(pagoAEliminar._id);
			const res = await fetch(`${process.env.REACT_APP_API_URL}/api/pagos/${pagoAEliminar._id}`, {
				method: 'DELETE',
				headers: getAuthHeaders()
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || 'Error al eliminar pago');
			await cargarMensualidades();
			await actualizarDetalleMensualidad(mensualidadDetalle, true);
			setConfirmarEliminarOpen(false);
			setPagoAEliminar(null);
			setSuccessMessage('Pago eliminado correctamente');
		} catch (err) {
			alert(err.message || 'Error al eliminar pago');
		} finally {
			setEliminandoPagoId('');
		}
	};
	
	const registrarPago = async () => {
		if (guardandoPago) return;
		// Validar numero de digitos de referencia
		if (metodoRequiereReferencia(metodoPago) && referencia.length !== 6) {
			setErrorRef('Debes ingresar los 6 últimos dígitos de la referencia');
			return;
		}
		const habilitarCuotas = esAdmin || pagoInfo?.id_alumno?.habilitar_pago_cuotas === true;
		const permiteSobrepagoAdelantado = esAdmin;
		const montoEsperado = Number(pagoInfo?.monto_esperado) || 0;
		const montoToPay = habilitarCuotas ? Number(montoPago) : montoEsperado;
		const tasaParaTolerancia = Number(tasaPagoHistorica || tasaBCV) || 0;
		const toleranciaUsd = tasaParaTolerancia > 0 ? (5 / tasaParaTolerancia) : 0;
		if (!montoToPay || Number.isNaN(montoToPay) || montoToPay <= 0) {
			alert('Monto a pagar inválido');
			return;
		}
		if (!permiteSobrepagoAdelantado && (montoToPay - (Number(montoPendiente) || 0)) > toleranciaUsd) {
			alert('El monto excede el saldo pendiente');
			return;
		}
		setErrorRef('');
		try {
			setGuardandoPago(true);
			const formData = new FormData();
			if (!pagoEnEdicion) {
				formData.append('id_mensualidad', pagoInfo._id);
			}
			formData.append('monto_pagado', montoToPay);
			formData.append('monto_pagado_bs', ((Number(montoToPay) || 0) * (tasaPagoHistorica || tasaBCV)).toFixed(2));
			formData.append('fecha_pago', fechaPago);
			formData.append('metodo_pago', normalizeMetodoPago(metodoPago));
			if (metodoRequiereReferencia(metodoPago)) {
				formData.append('referencia', referencia);
			} else {
				formData.append('referencia', '');
			}
			if (comprobante) {
				formData.append('comprobante', comprobante);
			}
			if (pagoEnEdicion && quitarComprobanteActual && !comprobante) {
				formData.append('eliminar_comprobante', 'true');
			}
			const resPago = await fetch(`${process.env.REACT_APP_API_URL}/api/pagos${pagoEnEdicion ? `/${pagoEnEdicion._id}` : ''}`, {
				method: pagoEnEdicion ? 'PATCH' : 'POST',
				headers: getAuthHeaders(),
				body: formData
			});
			const dataPago = await resPago.json();
			if (!resPago.ok) throw new Error(dataPago?.error || `Error al ${pagoEnEdicion ? 'actualizar' : 'registrar'} pago`);
			resetPagoForm();
			await cargarMensualidades();
			if (mensualidadDetalle?._id === pagoInfo._id) {
				await actualizarDetalleMensualidad(mensualidadDetalle, true);
			}
			setSuccessMessage(pagoEnEdicion ? 'Pago actualizado correctamente' : 'Pago registrado correctamente');
		} catch (err) {
			alert(err.message || `Error al ${pagoEnEdicion ? 'actualizar' : 'registrar'} pago`);
		} finally {
			setGuardandoPago(false);
		}
	};

	const tasaBCV = dolar?.promedio || 0;
	const tasaPagoActiva = tasaPagoHistorica || tasaBCV;
	const formatMoney = (value) => {
		if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
		return Number(value).toFixed(2);
	};

	const formatFechaBonita = (value) => {
		if (!value) return '-';

		const raw = String(value).trim();
		const matchIso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);

		let fecha;
		if (matchIso) {
			const year = Number(matchIso[1]);
			const month = Number(matchIso[2]);
			const day = Number(matchIso[3]);
			fecha = new Date(year, month - 1, day);
		} else {
			fecha = new Date(value);
		}

		if (Number.isNaN(fecha.getTime())) return '-';
		return fecha.toLocaleDateString('es-ES', {
			day: '2-digit',
			month: 'short',
			year: 'numeric'
		});
	};

	const formatTasaAplicada = (pago) => {
		const montoUsd = Number(pago?.monto_pagado);
		const montoBs = Number(pago?.monto_pagado_bs);
		if (!montoUsd || Number.isNaN(montoUsd) || !montoBs || Number.isNaN(montoBs)) {
			return '-';
		}
		return `${formatMoney(montoBs / montoUsd)} Bs/USD`;
	};

	const formatMontoConBs = (pago) => {
		const montoUsd = formatMoney(pago?.monto_pagado);
		const montoBs = pago?.monto_pagado_bs;
		if (montoBs === null || montoBs === undefined || Number.isNaN(Number(montoBs))) {
			return `$${montoUsd}`;
		}
		return `$${montoUsd} / Bs ${formatMoney(montoBs)}`;
	};

	const renderEstatusChip = (estatusRaw) => {
		const estado = (estatusRaw || '').toLowerCase();
		const esInsolvente = estado === 'retrasado' || estado === 'insolvente';
		const chipSxBase = {
			borderRadius: 999,
			fontWeight: 700,
			minWidth: 112,
			justifyContent: 'center',
			'& .MuiChip-label': {
				px: 0.5,
				width: '100%',
				textAlign: 'center'
			}
		};
		if (estado === 'pagado') return (
			<Chip
				label="Pagado"
				sx={{ ...chipSxBase, bgcolor: '#dff7ea', color: '#0f7a4a' }}
			/>
		);
		if (estado === 'pendiente') return (
			<Chip
				label="Pendiente"
				sx={{ ...chipSxBase, bgcolor: '#fff3dc', color: '#b45309' }}
			/>
		);
		if (esInsolvente) return (
			<Chip
				label="Insolvente"
				sx={{ ...chipSxBase, bgcolor: '#ffe1e6', color: '#d32f2f' }}
			/>
		);
		if (estado === 'exonerado') return (
			<Chip
				label="Exonerado"
				sx={{ ...chipSxBase, bgcolor: '#e3f2fd', color: '#0288d1' }}
			/>
		);
		if (estado === 'abono') return (
			<Chip
				label="Abono"
				sx={{ ...chipSxBase, bgcolor: '#efe9e7', color: '#6d4c41' }}
			/>
		);
		if (estado === 'en revision') return (
			<Chip
				label="En revision"
				sx={{ ...chipSxBase, bgcolor: '#fff6cc', color: '#b45309' }}
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

	const hayInsolventes = mensualidades.some(
		(m) => ['retrasado', 'insolvente'].includes((m.estatus || '').toLowerCase())
	);

	const exportarExcel = () => {
		const alumnosRetrasados = mensualidades.filter(m => m.estatus && ['retrasado', 'insolvente'].includes(m.estatus.toLowerCase()));
		const datos = alumnosRetrasados.map(m => ({
			Representante: `${m.id_alumno?.representante?.nombres || ''} ${m.id_alumno?.representante?.apellidos || ''}`.trim() || 'Sin representante',
			Categoria: m.id_alumno?.categoria || '-',
			Mes: meses[(m.mes || 1) - 1],
			Monto: m.monto_esperado,
			Estado: 'Insolvente'
		}));

		const headers = ['Representante', 'Categoria', 'Mes', 'Monto', 'Estado'];
		const nombreSede = sedeSeleccionada?.nombre || 'sede';
		exportToCsv(datos, `alumnos_insolventes_${nombreSede}.csv`, headers);
	};

	const aplicarAjusteSede = async () => {
		if (!sedeSeleccionada?._id) {
			alert('Selecciona una sede antes de aplicar el ajuste.');
			return;
		}

		const nuevoMonto = Number(ajusteNuevoMonto);
		const anio = Number(ajusteAnio);

		if (!filtroMes) {
			alert('Selecciona el mes que vas a ajustar.');
			return;
		}

		if (Number.isNaN(nuevoMonto) || nuevoMonto < 0) {
			alert('Ingresa un monto válido para la sede.');
			return;
		}

		if (Number.isNaN(anio) || anio < 2000) {
			alert('Ingresa un año válido.');
			return;
		}

		if ((previewAjuste?.mensualidades_actualizables || 0) <= 0) {
			alert('No hay mensualidades aplicables para este ajuste con los datos indicados.');
			return;
		}

		try {
			setAplicandoAjuste(true);
			const res = await fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades/ajuste-sede`, {
				method: 'POST',
				headers: {
					...getAuthHeaders(),
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					id_sede: sedeSeleccionada._id,
					mes: Number(filtroMes),
					anio,
					nuevo_monto: nuevoMonto,
					descripcion: ajusteDescripcion.trim()
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || 'No se pudo aplicar el ajuste');
			resetAjusteSedeForm();
			await cargarMensualidades();
			setSuccessMessage(
				`Ajuste aplicado: ${data.mensualidades_actualizadas || 0} actualizadas, ${data.mensualidades_omitidas || 0} omitidas y ${data.alumnos_con_saldo_a_favor || 0} alumnos con saldo a favor.`
			);
		} catch (err) {
			alert(err.message || 'No se pudo aplicar el ajuste');
		} finally {
			setAplicandoAjuste(false);
		}
	};

	const mensualidadesPaginadas = mensualidades.slice(pagina * filasPorPagina, pagina * filasPorPagina + filasPorPagina);
	const formatMontoCorto = (value) => `$${formatMoney(value)}`;

	return (
		<div>
			<Typography variant="h5" sx={{ mb: 2, fontWeight: 'bold' }}>Mensualidades</Typography>
			<Box className="mensualidades-filters-row" sx={{ display: 'grid', gap: 1.5, mb: 1, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' } }}>
				<TextField select label="Mes" value={filtroMes} onChange={e => setFiltroMes(e.target.value)} sx={{ minWidth: 120, width: '100%' }}>
					<MenuItem value="">Todos</MenuItem>
					{[...Array(12)].map((_, i) => <MenuItem key={i+1} value={i+1}>{meses[i]}</MenuItem>)}
				</TextField>
				<TextField label="Alumno" value={filtroAlumno} onChange={e => setFiltroAlumno(e.target.value)} sx={{ minWidth: 180, width: '100%' }} />
				<TextField select label="Estado" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} sx={{ minWidth: 120, width: '100%' }}>
					<MenuItem value="">Todos</MenuItem>
					{['Pendiente','Pagado','Insolvente', 'Exonerado', 'En revision', 'Abono'].map(e => <MenuItem key={e} value={e}>{e}</MenuItem>)}
				</TextField>
			</Box>
			<Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end', mb: 2, mt: 2 }}>
				{esAdmin && (
					<Button
						variant="outlined"
						onClick={() => setModalAjusteSede(true)}
						disabled={!sedeSeleccionada?._id || !filtroMes}
						sx={{ width: { xs: '100%', sm: 'auto' }, fontWeight: 700 }}
					>
						Ajuste por sede
					</Button>
				)}
				{hayInsolventes && (
					<Button
						className="mensualidades-export-btn"
						variant="contained"
						onClick={exportarExcel}
						sx={{ width: { xs: '100%', sm: 'auto' } }}
					>
						Exportar CSV insolventes
					</Button>
				)}
			</Box>
			{esAdmin && !sedeSeleccionada?._id && (
				<Alert severity="info" sx={{ mb: 2 }}>
					Selecciona una sede para poder aplicar un ajuste extraordinario al monto del mes.
				</Alert>
			)}
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
								<Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Crédito aplicado:</b> {formatMontoCorto(m.credito_aplicado || 0)}</Typography>
								<Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Saldo generado:</b> {formatMontoCorto(m.saldo_a_favor_generado || 0)}</Typography>
							</Box>
							<Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 0.5 }}>
								{esAdmin && (
									<Tooltip title={adelantandoAlumnoId === String(m.id_alumno?._id || m.id_alumno) ? 'Creando mensualidad' : 'Adelantar proximo mes'}>
										<span>
											<IconButton
												onClick={() => solicitarAdelantoMensualidad(m)}
												disabled={adelantandoAlumnoId === String(m.id_alumno?._id || m.id_alumno)}
												sx={{
													border: '1px solid #99f6e4',
													bgcolor: '#ecfeff',
													color: '#0f766e',
													'&:hover': { bgcolor: '#cffafe' }
												}}
											>
												<PaymentsIcon fontSize="small" />
											</IconButton>
										</span>
									</Tooltip>
								)}
								{['pendiente', 'retrasado', 'insolvente', 'abono'].includes((m.estatus || '').toLowerCase()) && (
									<Tooltip title="Registrar pago">
										<IconButton onClick={() => handlePago(m)} sx={{ bgcolor: '#14532d', color: '#fff', '&:hover': { bgcolor: '#166534' } }}>
											<PaidIcon fontSize="small" />
										</IconButton>
									</Tooltip>
								)}
								{['pagado', 'en revision', 'exonerado', 'abono'].includes((m.estatus || '').toLowerCase()) && (
									<Tooltip title="Ver detalle">
										<IconButton onClick={() => handleVerDetalle(m)} sx={{ border: '1px solid #bfdbfe', bgcolor: '#eff6ff', color: '#1d4ed8', '&:hover': { bgcolor: '#dbeafe' } }}>
											<VisibilityIcon fontSize="small" />
										</IconButton>
									</Tooltip>
								)}
							</Box>
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
								<TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>CREDITO APLICADO</TableCell>
								<TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>SALDO GENERADO</TableCell>
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
									<TableCell sx={{ color: '#0f172a', fontWeight: 600 }}>{formatMontoCorto(m.credito_aplicado || 0)}</TableCell>
									<TableCell sx={{ color: '#0f172a', fontWeight: 600 }}>{formatMontoCorto(m.saldo_a_favor_generado || 0)}</TableCell>
									<TableCell>{renderEstatusChip(m.estatus)}</TableCell>
									<TableCell>
										<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 0.5 }}>
											{esAdmin && (
												<Tooltip title={adelantandoAlumnoId === String(m.id_alumno?._id || m.id_alumno) ? 'Creando mensualidad' : 'Adelantar proximo mes'}>
													<span>
														<IconButton
															size="small"
															onClick={() => solicitarAdelantoMensualidad(m)}
															disabled={adelantandoAlumnoId === String(m.id_alumno?._id || m.id_alumno)}
															sx={{
																color: '#0f766e',
																bgcolor: '#ecfeff',
																'&:hover': { bgcolor: '#cffafe' }
															}}
														>
															<PaymentsIcon fontSize="small" />
														</IconButton>
													</span>
												</Tooltip>
											)}
											{['pendiente', 'retrasado', 'insolvente', 'abono'].includes((m.estatus || '').toLowerCase()) && (
												<Tooltip title="Registrar pago">
													<IconButton size="small" onClick={() => handlePago(m)} sx={{ color: '#166534', bgcolor: '#dcfce7', '&:hover': { bgcolor: '#bbf7d0' } }}>
														<PaidIcon fontSize="small" />
													</IconButton>
												</Tooltip>
											)}
											{['pagado', 'en revision', 'exonerado', 'abono'].includes((m.estatus || '').toLowerCase()) && (
												<Tooltip title="Ver detalle">
													<IconButton size="small" onClick={() => handleVerDetalle(m)} sx={{ color: '#1d4ed8', bgcolor: '#eff6ff', '&:hover': { bgcolor: '#dbeafe' } }}>
														<VisibilityIcon fontSize="small" />
													</IconButton>
												</Tooltip>
											)}
										</Box>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
						<tfoot>
							<TableRow>
								<TableCell colSpan={8}>
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
			<Dialog
				open={modalDetalle}
				onClose={() => setModalDetalle(false)}
				maxWidth="md"
				fullWidth
				PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
			>
				<DialogTitle sx={{ bgcolor: '#f3f5fb', color: '#0b2a57', fontWeight: 800, fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
					Detalle del Pago
					<IconButton size="small" onClick={() => setModalDetalle(false)} sx={{ color: '#6b7280' }}>
						&times;
					</IconButton>
				</DialogTitle>
				<DialogContent sx={{ bgcolor: '#f3f5fb', pt: 2.5, pb: 2.5 }}>
					{detallePago ? (
						<>
							<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
								<Box sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: '#dbeafe', color: '#0b2a57', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>✓</Box>
								<Typography sx={{ fontSize: { xs: 16, sm: 19 }, fontWeight: 900, color: '#0b2a57', lineHeight: 1.1 }}>Último Pago Registrado</Typography>
							</Box>

							<Box
								sx={{
									position: 'relative',
									bgcolor: '#ffffff',
									borderRadius: 2.5,
									border: '1px solid #e7eaf2',
									p: { xs: 2, sm: 3 },
									'&::before': {
										content: '""',
										position: 'absolute',
										top: 0,
										left: 0,
										right: 0,
										height: 7,
										borderTopLeftRadius: 10,
										borderTopRightRadius: 10,
										background: 'linear-gradient(90deg, #ff8a00 0%, #8a4b00 100%)'
									}
								}}
							>
								<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, columnGap: 4.5, rowGap: 2.25, pt: 1.75 }}>
									<Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
										<Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Metodo de pago</Typography>
										<Typography sx={{ mt: 0.7, fontSize: { xs: 14, sm: 16 }, fontWeight: 800, color: '#0b2a57', lineHeight: 1.12 }}>{detallePago.metodo_pago || '-'}</Typography>
									</Box>

									<Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
										<Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Monto pagado</Typography>
										<Typography sx={{ mt: 0.7, fontSize: { xs: 17, sm: 20 }, fontWeight: 900, color: '#9a5a00', lineHeight: 1.1 }}>{formatMontoConBs(detallePago)}</Typography>
									</Box>

									<Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
										<Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Fecha de pago</Typography>
										<Typography sx={{ mt: 0.7, fontSize: { xs: 15, sm: 17 }, fontWeight: 800, color: '#0b2a57', lineHeight: 1.12 }}>{formatFechaBonita(detallePago.fecha_pago)}</Typography>
									</Box>

									<Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
										<Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Tasa aplicada</Typography>
										<Typography sx={{ mt: 0.7, fontSize: { xs: 15, sm: 17 }, fontWeight: 800, color: '#0b2a57', lineHeight: 1.12 }}>{formatTasaAplicada(detallePago)}</Typography>
									</Box>

									<Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
										<Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Referencia</Typography>
										<Box sx={{ mt: 0.7, display: 'flex', alignItems: 'center', gap: 0.4 }}>
											<Typography sx={{ fontSize: { xs: 15, sm: 17 }, fontWeight: 800, color: '#4c6690', lineHeight: 1.12 }}>{detallePago.referencia || '-'}</Typography>
											{detallePago.referencia && (
												<IconButton size="small" onClick={() => copiarReferencia(detallePago.referencia)} sx={{ color: '#95a2b6' }}>
													<ContentCopyIcon fontSize="inherit" />
												</IconButton>
											)}
										</Box>
									</Box>

									<Box>
										<Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Comprobante</Typography>
										{detallePago.comprobante_url ? (
											<Button
												variant="text"
												startIcon={<InsertDriveFileIcon fontSize="small" />}
												onClick={() => handleVerComprobante(detallePago.comprobante_url)}
												sx={{ mt: 0.35, px: 0, color: '#ff8a00', fontWeight: 900, textTransform: 'none', fontSize: { xs: 14, sm: 16 } }}
											>
												Ver Archivo Digital
											</Button>
										) : (
											<Typography sx={{ mt: 0.7, color: '#9ca3af', fontWeight: 700 }}>Sin comprobante</Typography>
										)}
									</Box>

									<Box sx={{ display: 'flex', justifyContent: { xs: 'flex-start', md: 'flex-end' }, alignItems: 'flex-end', gap: 1.2, gridColumn: { md: '2 / 3' }, justifySelf: { md: 'end' } }}>
										<Button
											variant="contained"
											startIcon={<EditIcon fontSize="small" />}
											onClick={() => handleEditarPago(detallePago)}
											sx={{ borderRadius: 999, px: 2.2, minWidth: 118, bgcolor: '#e5edf8', color: '#1165a4', boxShadow: 'none', fontWeight: 800, '&:hover': { bgcolor: '#d8e5f6', boxShadow: 'none' } }}
										>
											Editar
										</Button>
										<Button
											variant="contained"
											startIcon={<DeleteOutlineIcon fontSize="small" />}
											onClick={() => solicitarEliminarPago(detallePago)}
											disabled={eliminandoPagoId === detallePago._id}
											sx={{ borderRadius: 999, px: 2.2, minWidth: 118, bgcolor: '#f9e9e9', color: '#d32727', boxShadow: 'none', fontWeight: 800, '&:hover': { bgcolor: '#f6dddd', boxShadow: 'none' } }}
										>
											{eliminandoPagoId === detallePago._id ? 'Eliminando...' : 'Eliminar'}
										</Button>
									</Box>
								</Box>
							</Box>
						</>
					) : (
						<Typography sx={{ color: '#334155' }}>No hay información de pago registrada.</Typography>
					)}

					{pagosDetalle.length > 0 && (
						<Box sx={{ mt: 3.25 }}>
							<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.25 }}>
								<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
									<HistoryRoundedIcon sx={{ color: '#8ea0bc', fontSize: 19 }} />
									<Typography sx={{ fontSize: { xs: 16, sm: 19 }, fontWeight: 900, color: '#0b2a57', lineHeight: 1.15 }}>
										{mensualidadDetalle?.id_alumno?.habilitar_pago_cuotas === true ? 'Historial de abonos' : 'Historial de pagos'}
									</Typography>
								</Box>
								<Chip label={`${pagosDetalle.length} total`} size="small" sx={{ bgcolor: '#d9e4f7', color: '#4b6ca7', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }} />
							</Box>

							<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
								{pagosDetalle.map((pago, idx) => (
									<Box
										key={pago._id || idx}
										sx={{
											bgcolor: '#ffffff',
											border: '1px solid #e8ebf2',
											borderRadius: 2,
											borderLeft: '4px solid #c9daf6',
											px: 1.7,
											py: 1.2,
											display: 'grid',
											gridTemplateColumns: { xs: '1fr', md: '1.1fr 1fr 1fr 1fr 1fr auto' },
											alignItems: 'center',
											gap: 1.3
										}}
									>
										<Box>
											<Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Pago #{idx + 1}</Typography>
											<Typography sx={{ fontWeight: 800, color: '#0b2a57', mt: 0.25 }}>{pago.metodo_pago || '-'}</Typography>
										</Box>
										<Box>
											<Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Monto</Typography>
											<Typography sx={{ fontWeight: 900, color: '#0b2a57', mt: 0.25 }}>{formatMontoConBs(pago)}</Typography>
										</Box>
										<Box>
											<Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Fecha</Typography>
											<Typography sx={{ color: '#334155', mt: 0.25 }}>{formatFechaBonita(pago.fecha_pago)}</Typography>
										</Box>
										<Box>
											<Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Tasa</Typography>
											<Typography sx={{ color: '#334155', mt: 0.25, fontWeight: 700 }}>{formatTasaAplicada(pago)}</Typography>
										</Box>
										<Box>
											<Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Referencia</Typography>
											<Typography sx={{ color: '#4c6690', fontWeight: 700, mt: 0.25 }}>{pago.referencia || '-'}</Typography>
										</Box>
										<Box sx={{ display: 'flex', gap: 0.6, justifyContent: { xs: 'flex-start', md: 'flex-end' }, alignItems: 'center', height: '100%' }}>
											{pago.comprobante_url && (
												<IconButton size="small" onClick={() => handleVerComprobante(pago.comprobante_url)} sx={{ bgcolor: '#f3f4f6', '&:hover': { bgcolor: '#e9edf3' } }}>
													<InsertDriveFileIcon fontSize="small" sx={{ color: '#4b5563' }} />
												</IconButton>
											)}
											<IconButton size="small" onClick={() => handleEditarPago(pago)} sx={{ bgcolor: '#e0f1fb', '&:hover': { bgcolor: '#d1e9f8' } }}>
												<EditIcon fontSize="small" sx={{ color: '#0a78b8' }} />
											</IconButton>
											<IconButton size="small" onClick={() => solicitarEliminarPago(pago)} disabled={eliminandoPagoId === pago._id} sx={{ bgcolor: '#fdecec', '&:hover': { bgcolor: '#fbdede' } }}>
												<DeleteOutlineIcon fontSize="small" sx={{ color: '#d32727' }} />
											</IconButton>
										</Box>
									</Box>
								))}
							</Box>
						</Box>
					)}
				</DialogContent>
				<DialogActions sx={{ px: 3, pb: 2.25, bgcolor: '#f3f5fb', justifyContent: 'space-between' }}>
					{(mensualidadDetalle?.estatus || '').toLowerCase() === 'en revision' && (
						<Button
							onClick={confirmarMensualidad}
							variant="contained"
							sx={{ bgcolor: '#0f8a35', color: '#fff', boxShadow: 'none', '&:hover': { bgcolor: '#0d7a2f', boxShadow: 'none' }, borderRadius: 999, px: 2.2, fontWeight: 800 }}
						>
							Confirmar
						</Button>
					)}
					<Button onClick={() => setModalDetalle(false)} variant="text" sx={{ color: '#516b94', fontWeight: 800 }}>
						Volver
					</Button>
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
			<Dialog
				open={confirmarEliminarOpen}
				onClose={() => {
					if (eliminandoPagoId) return;
					setConfirmarEliminarOpen(false);
					setPagoAEliminar(null);
				}}
				maxWidth="xs"
				fullWidth
			>
				<DialogTitle sx={{ fontWeight: 800, color: '#b91c1c' }}>Eliminar pago</DialogTitle>
				<DialogContent>
					<Typography sx={{ color: '#334155' }}>
						¿Seguro que deseas eliminar este pago? Esta acción recalculará el estado de la mensualidad y no se puede deshacer.
					</Typography>
					{pagoAEliminar && (
						<Box sx={{ mt: 1.5, p: 1.25, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
							<Typography variant="body2"><b>Método:</b> {pagoAEliminar.metodo_pago || '-'}</Typography>
							<Typography variant="body2"><b>Monto:</b> {pagoAEliminar.monto_pagado || '-'} USD</Typography>
							<Typography variant="body2"><b>Fecha:</b> {formatFechaBonita(pagoAEliminar.fecha_pago)}</Typography>
						</Box>
					)}
				</DialogContent>
				<DialogActions>
					<Button
						onClick={() => {
							setConfirmarEliminarOpen(false);
							setPagoAEliminar(null);
						}}
						disabled={!!eliminandoPagoId}
					>
						Cancelar
					</Button>
					<Button
						variant="contained"
						color="error"
						onClick={eliminarPago}
						disabled={!!eliminandoPagoId}
					>
						{eliminandoPagoId ? 'Eliminando...' : 'Eliminar pago'}
					</Button>
				</DialogActions>
			</Dialog>
			<Dialog
				open={confirmarAdelantoOpen}
				onClose={() => {
					if (adelantandoAlumnoId) return;
					setConfirmarAdelantoOpen(false);
					setMensualidadAAdelantar(null);
				}}
				maxWidth="xs"
				fullWidth
			>
				<DialogTitle sx={{ fontWeight: 800, color: '#0f172a' }}>Adelantar mensualidad</DialogTitle>
				<DialogContent>
					<Typography sx={{ color: '#334155' }}>
						¿Estas seguro de adelantar la factura del proximo mes?
					</Typography>
				</DialogContent>
				<DialogActions>
					<Button
						onClick={() => {
							setConfirmarAdelantoOpen(false);
							setMensualidadAAdelantar(null);
						}}
						disabled={!!adelantandoAlumnoId}
					>
						Cancelar
					</Button>
					<Button
						variant="contained"
						onClick={async () => {
							const objetivo = mensualidadAAdelantar;
							setConfirmarAdelantoOpen(false);
							setMensualidadAAdelantar(null);
							if (objetivo) {
								await adelantarSiguienteMensualidadAdmin(objetivo);
							}
						}}
						disabled={!!adelantandoAlumnoId}
					>
						{adelantandoAlumnoId ? 'Procesando...' : 'Si, adelantar'}
					</Button>
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
			<Dialog open={modalAjusteSede} onClose={() => !aplicandoAjuste && resetAjusteSedeForm()} maxWidth="sm" fullWidth>
				<DialogTitle sx={{ fontWeight: 800, color: '#0f172a' }}>Ajuste extraordinario por sede</DialogTitle>
				<DialogContent sx={{ pt: 1.5 }}>
					<Alert severity="warning" sx={{ mb: 2 }}>
						Se rebajará el monto del mes seleccionado para los alumnos de esta sede con mensualidad basada en sede. Si alguno ya pagó el monto completo, la diferencia quedará como saldo a favor para el próximo mes.
					</Alert>
					<TextField
						label="Sede"
						fullWidth
						margin="normal"
						value={sedeSeleccionada?.nombre || ''}
						disabled
					/>
					<TextField
						label="Mes"
						fullWidth
						margin="normal"
						value={filtroMes ? meses[Number(filtroMes) - 1] : ''}
						disabled
					/>
					<TextField
						label="Año"
						type="number"
						fullWidth
						margin="normal"
						value={ajusteAnio}
						onChange={e => setAjusteAnio(e.target.value)}
						inputProps={{ min: 2000, step: 1 }}
					/>
					<TextField
						label="Nuevo monto de mensualidad"
						type="number"
						fullWidth
						margin="normal"
						value={ajusteNuevoMonto}
						onChange={e => setAjusteNuevoMonto(e.target.value)}
						inputProps={{ min: 0, step: '0.01' }}
						helperText="Ejemplo: si la sede cobra 35 y este mes se reconocerá una semana, coloca aquí el nuevo monto final del mes."
					/>
					<TextField
						label="Descripción"
						fullWidth
						margin="normal"
						value={ajusteDescripcion}
						onChange={e => setAjusteDescripcion(e.target.value)}
						placeholder="Semana reconocida por suspensión de clases"
					/>
					{previewAjusteLoading && <Alert severity="info" sx={{ mt: 1.5 }}>Calculando vista previa...</Alert>}
					{!!previewAjusteError && <Alert severity="error" sx={{ mt: 1.5 }}>{previewAjusteError}</Alert>}
					{previewAjuste && !previewAjusteLoading && (
						<Alert
							severity={previewAjuste.mensualidades_no_compatibles > 0 ? 'error' : 'success'}
							sx={{ mt: 1.5 }}
						>
							Impacto estimado: {previewAjuste.mensualidades_actualizables || 0} actualizables, {previewAjuste.mensualidades_omitidas || 0} omitidas.
							 {previewAjuste.mensualidades_no_compatibles > 0 && ` ${previewAjuste.mensualidades_no_compatibles} no compatibles con este monto.`}
						</Alert>
					)}
				</DialogContent>
				<DialogActions>
					<Button onClick={resetAjusteSedeForm} disabled={aplicandoAjuste}>Cancelar</Button>
					<Button variant="outlined" onClick={obtenerPreviewAjusteSede} disabled={aplicandoAjuste || previewAjusteLoading}>
						Recalcular impacto
					</Button>
					<Button
						variant="contained"
						onClick={aplicarAjusteSede}
						disabled={aplicandoAjuste || previewAjusteLoading || (previewAjuste?.mensualidades_actualizables || 0) <= 0 || (previewAjuste?.mensualidades_no_compatibles || 0) > 0}
					>
						{aplicandoAjuste ? 'Aplicando...' : 'Aplicar ajuste'}
					</Button>
				</DialogActions>
			</Dialog>
			{/* Modal pago rápido */}
			<Dialog
				open={modalPago}
				onClose={resetPagoForm}
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
								{pagoEnEdicion ? 'Editar Pago' : 'Registrar Pago'}
							</Typography>
							<Typography variant="body2" sx={{ color: '#94a3b8', mt: 0.25 }}>
								{pagoEnEdicion ? 'Corrige los datos del pago y guarda los cambios.' : 'Ingresa los detalles de tu transferencia para procesar la inscripcion.'}
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
						onChange={e => {
							const nuevoMetodo = normalizeMetodoPago(e.target.value);
							setMetodoPago(nuevoMetodo);
							if (!metodoRequiereReferencia(nuevoMetodo)) setReferencia('');
							setErrorRef('');
						}}
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
					{(esAdmin || pagoInfo?.id_alumno?.habilitar_pago_cuotas) ? (
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
								inputProps={{ min: 0, step: '0.01', max: esAdmin ? undefined : (montoPendiente || undefined) }}
								helperText={
									esAdmin
										? `Pagado: ${formatMoney(pagosPreviosTotal)} | Pendiente: ${formatMoney(montoPendiente)} | Si superas el pendiente, el excedente se guarda como saldo a favor.`
										: `Pagado: ${formatMoney(pagosPreviosTotal)} | Pendiente: ${formatMoney(montoPendiente)}`
								}
								disabled={pagosLoading}
							/>
							<Typography variant="body2" sx={{ mt: -0.5, mb: 1, color: '#64748b' }}>
								Monto en Bs: {formatMoney((Number(montoPago) || 0) * tasaPagoActiva)} Bs
							</Typography>
							<Typography variant="caption" sx={{ mt: -0.5, mb: 1, color: '#94a3b8', display: 'block' }}>
								Tasa aplicada: {formatMoney(tasaPagoActiva)} Bs/USD
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
								Monto en Bs: {formatMoney((pagoInfo.monto_esperado || 0) * tasaPagoActiva)} Bs
							</Typography>
							<Typography variant="caption" sx={{ mt: -0.5, mb: 1, color: '#94a3b8', display: 'block' }}>
								Tasa aplicada: {formatMoney(tasaPagoActiva)} Bs/USD
							</Typography>
						</>
					)}
					{metodoRequiereReferencia(metodoPago) && (
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
						<input type="file" hidden onChange={e => { setComprobante(e.target.files[0]); setQuitarComprobanteActual(false); }} />
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
					{pagoEnEdicion?.comprobante_url && !comprobante && (
						<Box sx={{ mt: 1.5, p: 1.25, borderRadius: 2, border: '1px solid #e2e8f0', bgcolor: '#ffffff' }}>
							<Typography variant="body2" sx={{ color: '#64748b', mb: 0.75 }}>
								Hay un comprobante asociado a este pago.
							</Typography>
							<Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
								<Button size="small" onClick={() => handleVerComprobante(pagoEnEdicion.comprobante_url)}>
									Ver actual
								</Button>
								<Button
									size="small"
									color={quitarComprobanteActual ? 'success' : 'error'}
									onClick={() => setQuitarComprobanteActual((prev) => !prev)}
								>
									{quitarComprobanteActual ? 'Deshacer quitar comprobante' : 'Quitar comprobante actual'}
								</Button>
							</Box>
							{quitarComprobanteActual && (
								<Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: '#b91c1c' }}>
									Al guardar, este pago quedará sin comprobante.
								</Typography>
							)}
						</Box>
					)}
				</DialogContent>
				<DialogActions sx={{ px: 3, pb: 3, pt: 1, justifyContent: 'flex-end', gap: 1.5 }}>
					<Button
						onClick={resetPagoForm}
						sx={{ color: '#64748b', fontWeight: 700 }}
						disabled={guardandoPago}
					>
						Cancelar
					</Button>
					<Button
						onClick={registrarPago}
						variant="contained"
						disabled={pagosLoading || guardandoPago}
						sx={{
							bgcolor: '#ff7a00',
							'&:hover': { bgcolor: '#f97316' },
							fontWeight: 800,
							borderRadius: 2,
							px: 3
						}}
					>
						{guardandoPago ? 'Guardando...' : (pagoEnEdicion ? 'Guardar cambios' : 'Registrar')}
					</Button>
				</DialogActions>
			</Dialog>
		</div>
	);
}

export default Mensualidades;

