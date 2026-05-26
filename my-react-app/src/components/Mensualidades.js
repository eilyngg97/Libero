import React, { useState } from 'react';
import { Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, MenuItem, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper, IconButton, Typography, Chip, Box, Snackbar, Alert, Avatar, Tooltip, Checkbox, FormGroup, FormControlLabel } from '@mui/material';
import PaymentIcon from '@mui/icons-material/Payment';
import InsertDriveFileIcon from '@mui/icons-material/InsertDriveFile';
import CloseIcon from '@mui/icons-material/Close';
import EditIcon from '@mui/icons-material/Edit';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import { useSede } from '../context/SedeContext';
import { useDolar } from '../context/DolarContext';
import TablePagination from '@mui/material/TablePagination';
import { exportToExcel } from '../utils/exportExcel';
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

const esAlumnoBecado = (alumno) => String(alumno?.tipo_mensualidad || '').toLowerCase() === 'beca_completa';

const esMensualidadDeBecado = (mensualidad) => {
	if (esAlumnoBecado(mensualidad?.id_alumno)) return true;
	return String(mensualidad?.estatus || '').toLowerCase() === 'becado';
};

const esMensualidadEditable = (mensualidad) => {
	const estatus = String(mensualidad?.estatus || '').toLowerCase();
	return ['pendiente', 'insolvente', 'exonerado', 'retrasado'].includes(estatus);
};

const obtenerDiaLimitePersonalizado = (mensualidad) => {
	const valor = Number(mensualidad?.id_alumno?.dia_limite_personalizado);
	if (!Number.isInteger(valor) || valor < 1 || valor > 31) return null;
	return valor;
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
	const [notaPago, setNotaPago] = useState('');
	const [solicitaRevisionRecargo, setSolicitaRevisionRecargo] = useState(false);
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
	const [errorMessage, setErrorMessage] = useState('');
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
	const [confirmarEliminarMensualidadOpen, setConfirmarEliminarMensualidadOpen] = useState(false);
	const [mensualidadAEliminar, setMensualidadAEliminar] = useState(null);
	const [eliminandoMensualidadId, setEliminandoMensualidadId] = useState('');
	const [confirmarPagoOpen, setConfirmarPagoOpen] = useState(false);
	const [confirmandoMensualidad, setConfirmandoMensualidad] = useState(false);
	const [corrigiendoRecargo, setCorrigiendoRecargo] = useState(false);
	const [ultimoPagoDraft, setUltimoPagoDraft] = useState({
		metodo_pago: metodosPago[0],
		fecha_pago: getLocalInputDate(),
		monto_pagado_bs: '',
		monto_esperado_bs: '',
		referencia: '',
		nota: '',
		solicita_revision_recargo: false
	});
	const [guardandoUltimoPagoInline, setGuardandoUltimoPagoInline] = useState(false);
	const [editandoUltimoPagoInline, setEditandoUltimoPagoInline] = useState(false);
	const [ultimoPagoComprobante, setUltimoPagoComprobante] = useState(null);
	const [modalEditarMensualidadOpen, setModalEditarMensualidadOpen] = useState(false);
	const [mensualidadAEditar, setMensualidadAEditar] = useState(null);
	const [editarMontoEsperado, setEditarMontoEsperado] = useState('');
	const [editarEstatus, setEditarEstatus] = useState('sin_cambio');
	const [editarNota, setEditarNota] = useState('');
	const [guardandoEdicionMensualidad, setGuardandoEdicionMensualidad] = useState(false);
	const [modalExportExcelOpen, setModalExportExcelOpen] = useState(false);
	const [opcionesExportExcel, setOpcionesExportExcel] = useState({
		mesCompleto: true,
		insolventesRepresentante: false,
		insolventesAlumnoRepresentante: false
	});

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
		setNotaPago('');
		setSolicitaRevisionRecargo(false);
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

	const parsePagoDate = (value) => {
		if (!value) return 0;
		const time = new Date(value).getTime();
		return Number.isFinite(time) ? time : 0;
	};

	const ordenarPagosCronologicamente = (pagos = []) => {
		return [...pagos]
			.map((pago, index) => ({ pago, index }))
			.sort((a, b) => {
				const creadoA = parsePagoDate(a.pago?.createdAt);
				const creadoB = parsePagoDate(b.pago?.createdAt);
				if (creadoA !== creadoB) return creadoA - creadoB;

				const fechaA = parsePagoDate(a.pago?.fecha_pago);
				const fechaB = parsePagoDate(b.pago?.fecha_pago);
				if (fechaA !== fechaB) return fechaA - fechaB;

				return a.index - b.index;
			})
			.map((item) => item.pago);
	};

	const prepararModalPago = async (mensualidad, pagoEditar = null) => {
		const esMensualidadAbono = String(mensualidad?.estatus || '').toLowerCase() === 'abono';
		const puedePagarCuotas = esAdmin || mensualidad?.id_alumno?.habilitar_pago_cuotas === true || esMensualidadAbono;
		setPagoInfo(mensualidad);
		setPagoEnEdicion(pagoEditar);
		setComprobante(null);
		setQuitarComprobanteActual(false);
		setErrorRef('');
		setMetodoPago(normalizeMetodoPago(pagoEditar?.metodo_pago));
		setReferencia(pagoEditar?.referencia ? String(pagoEditar.referencia) : '');
		setNotaPago(pagoEditar?.nota ? String(pagoEditar.nota) : '');
		setSolicitaRevisionRecargo(Boolean(pagoEditar?.solicita_revision_recargo));
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
				const pagosOrdenados = ordenarPagosCronologicamente(data);
				setDetallePago(pagosOrdenados[pagosOrdenados.length - 1]);
				setPagosDetalle(pagosOrdenados);
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
		if (filtroAlumno) {
			const filtroTexto = String(filtroAlumno || '').toLowerCase().trim();
			filtradas = filtradas.filter((m) => {
				const nombres = String(m?.id_alumno?.nombres || '').toLowerCase().trim();
				const apellidos = String(m?.id_alumno?.apellidos || '').toLowerCase().trim();
				const formatoApellidoNombre = `${apellidos} ${nombres}`.trim();
				const formatoNombreApellido = `${nombres} ${apellidos}`.trim();
				return formatoApellidoNombre.includes(filtroTexto) || formatoNombreApellido.includes(filtroTexto);
			});
		}
		if (filtroEstado) filtradas = filtradas.filter(m => m.estatus && m.estatus.toLowerCase() === filtroEstado.toLowerCase());

		const filtradasOrdenadas = [...filtradas].sort((a, b) => {
			const nombreA = String(a?.id_alumno?.nombres || '').trim();
			const nombreB = String(b?.id_alumno?.nombres || '').trim();
			const apellidoA = String(a?.id_alumno?.apellidos || '').trim();
			const apellidoB = String(b?.id_alumno?.apellidos || '').trim();

			const cmpNombre = nombreA.localeCompare(nombreB, 'es', { sensitivity: 'base' });
			if (cmpNombre !== 0) return cmpNombre;

			return apellidoA.localeCompare(apellidoB, 'es', { sensitivity: 'base' });
		});

		setMensualidades(filtradasOrdenadas);
	}, [filtroMes, filtroAlumno, filtroEstado, mensualidadesBD]);

	// Registro de pago rápido
	const handlePago = (m) => {
		prepararModalPago(m);
	};

	const adelantarSiguienteMensualidadAdmin = async (mensualidadBase) => {
		const alumnoId = mensualidadBase?.id_alumno?._id || mensualidadBase?.id_alumno;
		if (!alumnoId || adelantandoAlumnoId || esMensualidadDeBecado(mensualidadBase)) return;

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
		if (!mensualidadBase || adelantandoAlumnoId || esMensualidadDeBecado(mensualidadBase)) return;
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
			setConfirmandoMensualidad(true);
			const res = await fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades/${mensualidadDetalle._id}/confirmar`, {
				method: 'PATCH',
				headers: getAuthHeaders()
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || 'Error al confirmar mensualidad');
			setConfirmarPagoOpen(false);
			setModalDetalle(false);
			await cargarMensualidades();
			setSuccessMessage('Pago confirmado con exito');
		} catch (err) {
			setErrorMessage(err.message || 'Error al confirmar mensualidad');
		} finally {
			setConfirmandoMensualidad(false);
		}
	};

	const solicitarConfirmarMensualidad = () => {
		if (!mensualidadDetalle?._id || confirmandoMensualidad) return;
		setConfirmarPagoOpen(true);
	};

	const cargarUltimoPagoDraft = React.useCallback(() => {
		if (!detallePago?._id) return;

		const montoBsPago = Number(detallePago?.monto_pagado_bs);
		const montoUsdPago = Number(detallePago?.monto_pagado);
		const tasaDesdePago = (Number.isFinite(montoBsPago) && montoBsPago > 0 && Number.isFinite(montoUsdPago) && montoUsdPago > 0)
			? (montoBsPago / montoUsdPago)
			: 0;
		const tasaFallback = Number(tasaPagoHistorica || dolar?.promedio || 0);
		const tasaInicial = tasaDesdePago > 0 ? tasaDesdePago : (Number.isFinite(tasaFallback) && tasaFallback > 0 ? tasaFallback : 0);
		const montoEsperadoPagoBs = Number(detallePago?.monto_esperado_bs);
		const montoEsperadoPagoUsd = Number(detallePago?.monto_esperado_usd);
		const montoEsperadoVigenteUsd = Number(mensualidadDetalle?.monto_esperado);
		const montoEsperadoMensualidadCambio = Number.isFinite(montoEsperadoVigenteUsd)
			&& montoEsperadoVigenteUsd >= 0
			&& (!Number.isFinite(montoEsperadoPagoUsd) || Math.abs(montoEsperadoVigenteUsd - montoEsperadoPagoUsd) > 0.01);
		const esperadoBsInicial = montoEsperadoMensualidadCambio
			? ((tasaInicial > 0) ? Number((montoEsperadoVigenteUsd * tasaInicial).toFixed(2)) : '')
			: (Number.isFinite(montoEsperadoPagoBs)
				? montoEsperadoPagoBs
				: ((Number.isFinite(montoEsperadoVigenteUsd) && montoEsperadoVigenteUsd >= 0 && tasaInicial > 0)
					? Number((montoEsperadoVigenteUsd * tasaInicial).toFixed(2))
					: ''));

		setUltimoPagoDraft({
			metodo_pago: normalizeMetodoPago(detallePago?.metodo_pago),
			fecha_pago: getInputDateFromApi(detallePago?.fecha_pago),
			monto_pagado_bs: Number.isFinite(Number(detallePago?.monto_pagado_bs))
				? Number(detallePago?.monto_pagado_bs)
				: ((Number.isFinite(montoUsdPago) && montoUsdPago > 0 && tasaInicial > 0)
					? Number((montoUsdPago * tasaInicial).toFixed(2))
					: ''),
			monto_esperado_bs: esperadoBsInicial,
			referencia: detallePago?.referencia ? String(detallePago.referencia) : '',
			nota: detallePago?.nota ? String(detallePago.nota) : '',
			solicita_revision_recargo: Boolean(detallePago?.solicita_revision_recargo)
		});
		setUltimoPagoComprobante(null);
	}, [
		detallePago?._id,
		detallePago?.metodo_pago,
		detallePago?.fecha_pago,
		detallePago?.monto_pagado_bs,
		detallePago?.monto_pagado,
		detallePago?.monto_esperado_bs,
		detallePago?.referencia,
		detallePago?.nota,
		detallePago?.solicita_revision_recargo,
		mensualidadDetalle?.monto_esperado,
		tasaPagoHistorica,
		dolar?.promedio
	]);

	React.useEffect(() => {
		if (!detallePago?._id || guardandoUltimoPagoInline) return;
		cargarUltimoPagoDraft();
		setEditandoUltimoPagoInline(false);
	}, [
		detallePago?._id,
		detallePago?.updatedAt,
		detallePago?.fecha_pago,
		detallePago?.metodo_pago,
		detallePago?.monto_pagado,
		detallePago?.monto_pagado_bs,
		detallePago?.monto_esperado_bs,
		detallePago?.referencia,
		detallePago?.nota,
		detallePago?.solicita_revision_recargo,
		mensualidadDetalle?.monto_esperado,
		guardandoUltimoPagoInline,
		cargarUltimoPagoDraft,
		tasaPagoHistorica,
		dolar?.promedio
	]);

	const guardarUltimoPagoInline = async () => {
		if (!detallePago?._id || guardandoUltimoPagoInline || !editandoUltimoPagoInline) return;

		const montoPagadoBs = Number(ultimoPagoDraft?.monto_pagado_bs);
		if (!Number.isFinite(montoPagadoBs) || montoPagadoBs <= 0) {
			setErrorMessage('Ingresa un monto pagado en Bs valido.');
			return;
		}

		const montoEsperadoBs = Number(ultimoPagoDraft?.monto_esperado_bs);
		if (!Number.isFinite(montoEsperadoBs) || montoEsperadoBs < 0) {
			setErrorMessage('Ingresa un monto esperado en Bs valido.');
			return;
		}

		const metodoNormalizado = normalizeMetodoPago(ultimoPagoDraft?.metodo_pago);
		const referenciaNormalizada = String(ultimoPagoDraft?.referencia || '').trim();
		if (metodoRequiereReferencia(metodoNormalizado) && referenciaNormalizada.length < 6) {
			setErrorMessage('Debes ingresar al menos 6 digitos en la referencia.');
			return;
		}

		const montoBsPagoActual = Number(detallePago?.monto_pagado_bs);
		const montoUsdPagoActual = Number(detallePago?.monto_pagado);
		const tasaDesdePago = (Number.isFinite(montoBsPagoActual) && montoBsPagoActual > 0 && Number.isFinite(montoUsdPagoActual) && montoUsdPagoActual > 0)
			? (montoBsPagoActual / montoUsdPagoActual)
			: 0;
		const tasaFallbackActual = Number(tasaPagoHistorica || dolar?.promedio || 0);
		const tasaParaBs = tasaDesdePago > 0 ? tasaDesdePago : (Number.isFinite(tasaFallbackActual) ? tasaFallbackActual : 0);
		if (!Number.isFinite(tasaParaBs) || tasaParaBs <= 0) {
			setErrorMessage('No se pudo determinar una tasa valida para convertir a USD.');
			return;
		}

		const montoPagadoUsd = Number((montoPagadoBs / tasaParaBs).toFixed(2));
		const montoEsperadoUsd = Number((montoEsperadoBs / tasaParaBs).toFixed(2));

		try {
			setGuardandoUltimoPagoInline(true);
			const formData = new FormData();
			formData.append('monto_pagado', montoPagadoUsd);
			formData.append('monto_pagado_bs', Number(montoPagadoBs.toFixed(2)));
			formData.append('monto_esperado_usd', montoEsperadoUsd);
			formData.append('monto_esperado_bs', Number(montoEsperadoBs.toFixed(2)));
			formData.append('fecha_pago', ultimoPagoDraft?.fecha_pago || getLocalInputDate());
			formData.append('metodo_pago', metodoNormalizado);
			formData.append('referencia', metodoRequiereReferencia(metodoNormalizado) ? referenciaNormalizada : '');
			formData.append('nota', String(ultimoPagoDraft?.nota || '').trim());
			formData.append('solicita_revision_recargo', ultimoPagoDraft?.solicita_revision_recargo ? 'true' : 'false');
			if (ultimoPagoComprobante) {
				formData.append('comprobante', ultimoPagoComprobante);
			}

			const res = await fetch(`${process.env.REACT_APP_API_URL}/api/pagos/${detallePago._id}`, {
				method: 'PATCH',
				headers: getAuthHeaders(),
				body: formData
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || 'No se pudo actualizar el pago');

			let mensualidadActualizada = mensualidadDetalle;
			if (mensualidadDetalle?._id) {
				const resMens = await fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades/${mensualidadDetalle._id}`, {
					method: 'PATCH',
					headers: {
						...getAuthHeaders(),
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						monto_esperado: montoEsperadoUsd,
						nota: 'Ajuste de monto esperado desde detalle de ultimo pago (en Bs)'
					})
				});
				const dataMens = await resMens.json();
				if (!resMens.ok) throw new Error(dataMens?.error || 'No se pudo actualizar el monto esperado de la mensualidad');
				if (dataMens?.mensualidad) {
					mensualidadActualizada = { ...mensualidadDetalle, ...dataMens.mensualidad };
				}
			}

			await cargarMensualidades();
			await actualizarDetalleMensualidad(mensualidadActualizada, true);
			setEditandoUltimoPagoInline(false);
			setUltimoPagoComprobante(null);
			setSuccessMessage('Pago actualizado correctamente');
		} catch (err) {
			setErrorMessage(err.message || 'No se pudo actualizar el pago');
		} finally {
			setGuardandoUltimoPagoInline(false);
		}
	};

	const corregirRecargoDesdeDetalle = async () => {
		if (!mensualidadDetalle?._id || corrigiendoRecargo) return;

		const montoBaseSinRecargo = Number(mensualidadDetalle?.monto_sin_recargo_usd);
		if (!Number.isFinite(montoBaseSinRecargo) || montoBaseSinRecargo < 0) {
			setErrorMessage('No hay un monto base valido para retirar el recargo.');
			return;
		}

		try {
			setCorrigiendoRecargo(true);
			const res = await fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades/${mensualidadDetalle._id}`, {
				method: 'PATCH',
				headers: {
					...getAuthHeaders(),
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					monto_esperado: Number(montoBaseSinRecargo.toFixed(2)),
					nota: 'Correccion administrativa de recargo desde pago detalle'
				})
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || 'No se pudo retirar el recargo');

			await cargarMensualidades();
			await actualizarDetalleMensualidad({
				...mensualidadDetalle,
				...data?.mensualidad,
				monto_esperado: Number(montoBaseSinRecargo.toFixed(2))
			}, true);
			setSuccessMessage('Recargo retirado y mensualidad recalculada correctamente');
		} catch (err) {
			setErrorMessage(err.message || 'No se pudo retirar el recargo');
		} finally {
			setCorrigiendoRecargo(false);
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

	const solicitarEliminarMensualidad = (mensualidad) => {
		if (!mensualidad?._id) return;
		setMensualidadAEliminar(mensualidad);
		setConfirmarEliminarMensualidadOpen(true);
	};

	const abrirModalEditarMensualidad = (mensualidad) => {
		if (!mensualidad?._id) return;
		setMensualidadAEditar(mensualidad);
		setEditarMontoEsperado(Number(mensualidad?.monto_esperado || 0).toFixed(2));
		setEditarEstatus('sin_cambio');
		setEditarNota('');
		setModalEditarMensualidadOpen(true);
	};

	const cerrarModalEditarMensualidad = () => {
		if (guardandoEdicionMensualidad) return;
		setModalEditarMensualidadOpen(false);
		setMensualidadAEditar(null);
		setEditarMontoEsperado('');
		setEditarEstatus('sin_cambio');
		setEditarNota('');
	};

	const guardarEdicionMensualidad = async () => {
		if (!mensualidadAEditar?._id || guardandoEdicionMensualidad) return;

		const montoNumerico = Number(editarMontoEsperado);
		const notaNormalizada = String(editarNota || '').trim();
		if (!Number.isFinite(montoNumerico) || montoNumerico < 0) {
			setErrorMessage('Ingresa un monto esperado válido.');
			return;
		}

		if (!notaNormalizada) {
			setErrorMessage('Debes escribir una nota con el motivo del cambio.');
			return;
		}

		const payload = {
			monto_esperado: Number(montoNumerico.toFixed(2)),
			nota: notaNormalizada
		};
		if (editarEstatus === 'exonerado') {
			payload.estatus = 'Exonerado';
		}

		try {
			setGuardandoEdicionMensualidad(true);
			const res = await fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades/${mensualidadAEditar._id}`, {
				method: 'PATCH',
				headers: {
					...getAuthHeaders(),
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(payload)
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || 'No se pudo editar la mensualidad');

			setModalEditarMensualidadOpen(false);
			setMensualidadAEditar(null);
			setEditarMontoEsperado('');
			setEditarEstatus('sin_cambio');
			setEditarNota('');
			await cargarMensualidades();
			if (mensualidadDetalle?._id === mensualidadAEditar._id) {
				await actualizarDetalleMensualidad({ ...mensualidadDetalle, ...data?.mensualidad }, true);
			}
			setSuccessMessage(data?.message || 'Mensualidad actualizada correctamente');
		} catch (err) {
			setErrorMessage(err.message || 'No se pudo editar la mensualidad');
		} finally {
			setGuardandoEdicionMensualidad(false);
		}
	};

	const eliminarMensualidad = async () => {
		if (!mensualidadAEliminar?._id) return;

		try {
			setEliminandoMensualidadId(mensualidadAEliminar._id);
			const res = await fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades/${mensualidadAEliminar._id}`, {
				method: 'DELETE',
				headers: getAuthHeaders()
			});
			const data = await res.json();
			if (!res.ok) throw new Error(data?.error || 'Error al eliminar mensualidad');

			if (mensualidadDetalle?._id === mensualidadAEliminar._id) {
				setModalDetalle(false);
				setMensualidadDetalle(null);
				setDetallePago(null);
				setPagosDetalle([]);
			}

			setConfirmarEliminarMensualidadOpen(false);
			setMensualidadAEliminar(null);
			await cargarMensualidades();
			setSuccessMessage('Mensualidad eliminada correctamente');
		} catch (err) {
			alert(err.message || 'Error al eliminar mensualidad');
		} finally {
			setEliminandoMensualidadId('');
		}
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
		if (metodoRequiereReferencia(metodoPago) && referencia.length < 6) {
			setErrorRef('Debes ingresar al menos 6 dígitos de la referencia');
			return;
		}
		const esMensualidadAbono = String(pagoInfo?.estatus || '').toLowerCase() === 'abono';
		const habilitarCuotas = esAdmin || pagoInfo?.id_alumno?.habilitar_pago_cuotas === true || esMensualidadAbono;
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
			const montoEsperadoUsd = (() => {
				const esperadoDesdeEdicion = Number(pagoEnEdicion?.monto_esperado_usd);
				if (Number.isFinite(esperadoDesdeEdicion) && esperadoDesdeEdicion > 0) {
					return esperadoDesdeEdicion;
				}

				if (habilitarCuotas) {
					const pendienteActual = Number(montoPendiente) || 0;
					if (pendienteActual > 0) return pendienteActual;
				}

				return Number(pagoInfo?.monto_esperado) || 0;
			})();
			const montoEsperadoBs = montoEsperadoUsd * (tasaPagoHistorica || tasaBCV);
			if (!pagoEnEdicion) {
				formData.append('id_mensualidad', pagoInfo._id);
			}
			formData.append('monto_pagado', montoToPay);
			formData.append('monto_pagado_bs', ((Number(montoToPay) || 0) * (tasaPagoHistorica || tasaBCV)).toFixed(2));
			if (montoEsperadoUsd > 0) {
				formData.append('monto_esperado_usd', montoEsperadoUsd.toFixed(2));
			}
			if (Number.isFinite(montoEsperadoBs) && montoEsperadoBs > 0) {
				formData.append('monto_esperado_bs', montoEsperadoBs.toFixed(2));
			}
			formData.append('fecha_pago', fechaPago);
			formData.append('metodo_pago', normalizeMetodoPago(metodoPago));
			if (metodoRequiereReferencia(metodoPago)) {
				formData.append('referencia', referencia);
			} else {
				formData.append('referencia', '');
			}
			formData.append('nota', String(notaPago || '').trim());
			formData.append('solicita_revision_recargo', solicitaRevisionRecargo ? 'true' : 'false');
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

	const existeAjusteManualMontoEsperadoBs = (pago, fallbackMontoUsd = null) => {
		const montoEsperadoBs = Number(pago?.monto_esperado_bs);
		if (!Number.isFinite(montoEsperadoBs) || montoEsperadoBs <= 0) return false;

		const montoEsperadoUsdPago = Number(pago?.monto_esperado_usd);
		const montoEsperadoUsd = Number.isFinite(montoEsperadoUsdPago) && montoEsperadoUsdPago > 0
			? montoEsperadoUsdPago
			: Number(fallbackMontoUsd);

		const montoPagadoUsd = Number(pago?.monto_pagado);
		const montoPagadoBs = Number(pago?.monto_pagado_bs);
		const tasaAplicada = (Number.isFinite(montoPagadoUsd) && montoPagadoUsd > 0 && Number.isFinite(montoPagadoBs) && montoPagadoBs > 0)
			? (montoPagadoBs / montoPagadoUsd)
			: null;

		if (!Number.isFinite(montoEsperadoUsd) || montoEsperadoUsd <= 0 || !Number.isFinite(tasaAplicada) || tasaAplicada <= 0) {
			return false;
		}

		const montoEsperadoCalculadoBs = montoEsperadoUsd * tasaAplicada;
		return Math.abs(montoEsperadoCalculadoBs - montoEsperadoBs) > 0.1;
	};

	const formatMontoEsperadoPago = (pago, fallbackMontoUsd = null, preferirMontoActual = false) => {
		if (preferirMontoActual) {
			const montoEsperadoPagoBs = Number(pago?.monto_esperado_bs);
			const montoEsperadoPagoUsd = Number(pago?.monto_esperado_usd);
			const montoActualUsd = Number(fallbackMontoUsd);
			const montoEsperadoCambio = Number.isFinite(montoActualUsd)
				&& montoActualUsd >= 0
				&& Number.isFinite(montoEsperadoPagoUsd)
				&& Math.abs(montoActualUsd - montoEsperadoPagoUsd) > 0.01;

			if (montoEsperadoCambio) {
				const montoPagoUsd = Number(pago?.monto_pagado);
				const montoPagoBs = Number(pago?.monto_pagado_bs);
				const tasaAplicada = (Number.isFinite(montoPagoUsd) && montoPagoUsd > 0 && Number.isFinite(montoPagoBs) && montoPagoBs > 0)
					? (montoPagoBs / montoPagoUsd)
					: null;

				if (Number.isFinite(tasaAplicada) && tasaAplicada > 0) {
					const montoActualBs = montoActualUsd * tasaAplicada;
					return `Bs ${formatMoney(montoActualBs)} / $${formatMoney(montoActualUsd)} USD`;
				}

				return `$${formatMoney(montoActualUsd)} USD`;
			}

			if (Number.isFinite(montoEsperadoPagoBs) && montoEsperadoPagoBs > 0 && Number.isFinite(montoEsperadoPagoUsd) && montoEsperadoPagoUsd > 0) {
				return `Bs ${formatMoney(montoEsperadoPagoBs)} / $${formatMoney(montoEsperadoPagoUsd)} USD`;
			}

			if (Number.isFinite(montoEsperadoPagoBs) && montoEsperadoPagoBs > 0) {
				return `Bs ${formatMoney(montoEsperadoPagoBs)}`;
			}

			if (Number.isFinite(montoActualUsd) && montoActualUsd >= 0) {
				const montoPagoUsd = Number(pago?.monto_pagado);
				const montoPagoBs = Number(pago?.monto_pagado_bs);
				const tasaAplicada = (Number.isFinite(montoPagoUsd) && montoPagoUsd > 0 && Number.isFinite(montoPagoBs) && montoPagoBs > 0)
					? (montoPagoBs / montoPagoUsd)
					: null;

				if (Number.isFinite(tasaAplicada) && tasaAplicada > 0) {
					const montoActualBs = montoActualUsd * tasaAplicada;
					return `Bs ${formatMoney(montoActualBs)} / $${formatMoney(montoActualUsd)} USD`;
				}

				return `$${formatMoney(montoActualUsd)} USD`;
			}
		}

		const montoBs = Number(pago?.monto_esperado_bs);
		const montoUsd = Number.isFinite(Number(pago?.monto_esperado_usd))
			? Number(pago?.monto_esperado_usd)
			: Number(fallbackMontoUsd);

		if (Number.isFinite(montoBs) && montoBs > 0 && Number.isFinite(montoUsd) && montoUsd > 0) {
			return `Bs ${formatMoney(montoBs)} / $${formatMoney(montoUsd)} USD`;
		}

		if (Number.isFinite(montoBs) && montoBs > 0) {
			return `Bs ${formatMoney(montoBs)}`;
		}

		if (Number.isFinite(montoUsd) && montoUsd > 0) {
			return `$${formatMoney(montoUsd)} USD`;
		}

		return '-';
	};

	const formatMontoConBs = (pago) => {
		const montoUsd = formatMoney(pago?.monto_pagado);
		const montoBs = pago?.monto_pagado_bs;
		if (montoBs === null || montoBs === undefined || Number.isNaN(Number(montoBs))) {
			return `$${montoUsd} USD`;
		}
		return `Bs ${formatMoney(montoBs)} / $${montoUsd} USD`;
	};

	const formatRegistradoPorPago = (pago) => {
		const origenRaw = String(pago?.registrado_por?.origen || '').trim().toLowerCase();
		if (origenRaw === 'admin_portal') return 'Portal admin';
		if (origenRaw === 'usuario_portal') return 'Portal usuario';
		return 'No disponible';
	};

	const obtenerDesgloseRecargo = (mensualidad) => {
		if (!mensualidad) return null;

		const montoConRecargoRaw = Number(mensualidad?.monto_con_recargo_usd);
		const montoEsperadoRaw = Number(mensualidad?.monto_esperado);
		const montoSinRecargoRaw = Number(mensualidad?.monto_sin_recargo_usd);
		const recargoRaw = Number(mensualidad?.recargo_aplicado_usd);

		const recargoAplicado = Number.isFinite(recargoRaw) ? Math.max(0, recargoRaw) : 0;
		const montoEsperado = Number.isFinite(montoEsperadoRaw) ? montoEsperadoRaw : null;
		const totalConRecargo = (Number.isFinite(montoConRecargoRaw) && montoConRecargoRaw > 0)
			? montoConRecargoRaw
			: montoEsperado;

		const montoSinRecargo = (Number.isFinite(montoSinRecargoRaw) && montoSinRecargoRaw > 0)
			? montoSinRecargoRaw
			: (Number.isFinite(totalConRecargo) ? Math.max(0, totalConRecargo - recargoAplicado) : null);

		if (!Number.isFinite(totalConRecargo) && !Number.isFinite(montoSinRecargo)) {
			return null;
		}

		return {
			montoSinRecargo: Number.isFinite(montoSinRecargo) ? montoSinRecargo : 0,
			recargoAplicado,
			totalConRecargo: Number.isFinite(totalConRecargo)
				? totalConRecargo
				: ((Number.isFinite(montoSinRecargo) ? montoSinRecargo : 0) + recargoAplicado)
		};
	};

	const obtenerMontoTablaMensualidad = (mensualidad) => {
		const montoPrimeraMensualidad = mensualidad?.monto_primera_mensualidad;
		if (
			montoPrimeraMensualidad !== undefined &&
			montoPrimeraMensualidad !== null &&
			!Number.isNaN(Number(montoPrimeraMensualidad))
		) {
			return Number(montoPrimeraMensualidad);
		}

		const montoEsperado = mensualidad?.monto_esperado;
		if (montoEsperado !== undefined && montoEsperado !== null && !Number.isNaN(Number(montoEsperado))) {
			return Number(montoEsperado);
		}

		return 0;
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
		if (estado === 'becado') return (
			<Chip
				label="Becado"
				sx={{ ...chipSxBase, bgcolor: '#e0f2fe', color: '#0284c7' }}
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

	const obtenerEstadoAlumnoVisual = (alumno) => {
		const dadoDeBaja = alumno?.dado_de_baja === true;
		const activo = alumno?.activo !== false;
		const estadoRaw = String(alumno?.estado || '').toLowerCase();
		const esBaja = dadoDeBaja || !activo || estadoRaw === 'baja' || estadoRaw === 'inactivo';

		return {
			esBaja,
			label: esBaja ? 'Baja' : 'Activo',
			color: esBaja ? '#ef4444' : '#22c55e',
			borderColor: esBaja ? '#fecdd3' : '#bbf7d0'
		};
	};

	const renderEtiquetasAlumno = (alumno) => {
		const etiquetas = Array.isArray(alumno?.etiquetas)
			? alumno.etiquetas.filter((etiqueta) => String(etiqueta || '').trim().length > 0)
			: [];

		if (etiquetas.length === 0) {
			return <Typography sx={{ fontSize: 12, color: '#94a3b8' }}>-</Typography>;
		}

		const visibles = etiquetas.slice(0, 2);
		const restantes = etiquetas.length - visibles.length;

		return (
			<Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexWrap: 'wrap' }}>
				{visibles.map((etiqueta, index) => (
					<Chip
						key={`${etiqueta}-${index}`}
						label={etiqueta}
						size="small"
						sx={{ bgcolor: '#eef2ff', color: '#3730a3', fontWeight: 700, maxWidth: 130 }}
					/>
				))}
				{restantes > 0 && (
					<Chip
						label={`+${restantes}`}
						size="small"
						sx={{ bgcolor: '#fdfdfd', color: '#475569', fontWeight: 700 }}
					/>
				)}
			</Box>
		);
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

	const actionIconButtonSx = {
		color: '#6b7280',
		bgcolor: '#fdfdfd',
		'&:hover': { bgcolor: '#e2e8f0' }
	};

	const obtenerNombreRepresentanteMensualidad = (mensualidad) => {
		const representante = mensualidad?.id_alumno?.representante;
		if (!representante) return 'Sin representante';
		if (typeof representante === 'string') return representante;
		const nombre = `${representante?.nombres || ''} ${representante?.apellidos || ''}`.trim();
		return nombre || 'Sin representante';
	};

	const obtenerNombreAlumnoMensualidad = (mensualidad) => {
		const alumno = mensualidad?.id_alumno;
		if (!alumno) return '-';
		const nombre = `${alumno?.nombres || ''} ${alumno?.apellidos || ''}`.trim();
		return nombre || '-';
	};

	const normalizarNombreArchivo = (valor) => String(valor || '')
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/\s+/g, '_');

	const estilosEstadoExcel = {
		pagado: { bg: '#dff7ea', color: '#0f7a4a' },
		pendiente: { bg: '#fff3dc', color: '#b45309' },
		retrasado: { bg: '#ffe1e6', color: '#d32f2f' },
		insolvente: { bg: '#ffe1e6', color: '#d32f2f' },
		exonerado: { bg: '#e3f2fd', color: '#0288d1' },
		becado: { bg: '#e0f2fe', color: '#0284c7' },
		abono: { bg: '#efe9e7', color: '#6d4c41' },
		'en revision': { bg: '#fff6cc', color: '#b45309' }
	};

	const exportarExcelSeleccionado = async () => {
		const seleccionadas = Object.entries(opcionesExportExcel)
			.filter(([, activa]) => !!activa)
			.map(([clave]) => clave);

		if (seleccionadas.length === 0) {
			alert('Selecciona al menos una opcion para exportar.');
			return;
		}

		const fuente = Array.isArray(mensualidadesBD) ? mensualidadesBD : [];
		if (fuente.length === 0) {
			alert('No hay datos para exportar.');
			return;
		}

		const nombreSede = normalizarNombreArchivo(sedeSeleccionada?.nombre || 'sede');
		const nombreMes = filtroMes ? normalizarNombreArchivo(meses[Number(filtroMes) - 1] || 'mes') : 'todos_los_meses';

		if (opcionesExportExcel.mesCompleto) {
			const rowsMesCompleto = fuente.map((m) => ({
				Alumno: obtenerNombreAlumnoMensualidad(m),
				Representante: obtenerNombreRepresentanteMensualidad(m),
				Categoria: m.id_alumno?.categoria || '-',
				Mes: meses[(m.mes || 1) - 1],
				Anio: m.anio || '-',
				Monto: Number(obtenerMontoTablaMensualidad(m) || 0).toFixed(2),
				Recargo: Number(m.recargo_aplicado_usd || 0).toFixed(2),
				Estado: m.estatus || '-'
			}));

			await exportToExcel(
				rowsMesCompleto,
				`mes_completo_${nombreMes}_${nombreSede}.xlsx`,
				['Alumno', 'Representante', 'Categoria', 'Mes', 'Anio', 'Monto', 'Recargo', 'Estado'],
				{ statusColumnName: 'Estado', statusStyleMap: estilosEstadoExcel }
			);
		}

		const insolventes = fuente.filter((m) => ['retrasado', 'insolvente'].includes(String(m.estatus || '').toLowerCase()));

		if (opcionesExportExcel.insolventesRepresentante) {
			const rowsRepresentante = insolventes.map((m) => {
				const alumnoNombre = obtenerNombreAlumnoMensualidad(m);
				const representanteOriginal = obtenerNombreRepresentanteMensualidad(m);
				const representante = representanteOriginal === 'Sin representante'
					? alumnoNombre
					: representanteOriginal;

				return {
					Representante: representante,
					Categoria: m.id_alumno?.categoria || '-',
					Mes: meses[(m.mes || 1) - 1],
					Anio: m.anio || '-',
					Monto: Number(obtenerMontoTablaMensualidad(m) || 0).toFixed(2),
					Recargo: Number(m.recargo_aplicado_usd || 0).toFixed(2),
					Estado: 'Insolvente'
				};
			});

			await exportToExcel(
				rowsRepresentante,
				`insolventes_por_representante_${nombreMes}_${nombreSede}.xlsx`,
				['Representante', 'Categoria', 'Mes', 'Anio', 'Monto', 'Recargo', 'Estado'],
				{ statusColumnName: 'Estado', statusStyleMap: estilosEstadoExcel }
			);
		}

		if (opcionesExportExcel.insolventesAlumnoRepresentante) {
			const rowsAlumnoRepresentante = insolventes.map((m) => ({
				Alumno: obtenerNombreAlumnoMensualidad(m),
				Representante: obtenerNombreRepresentanteMensualidad(m),
				Categoria: m.id_alumno?.categoria || '-',
				Mes: meses[(m.mes || 1) - 1],
				Anio: m.anio || '-',
				Monto: Number(obtenerMontoTablaMensualidad(m) || 0).toFixed(2),
				Recargo: Number(m.recargo_aplicado_usd || 0).toFixed(2),
				Estado: 'Insolvente'
			}));

			await exportToExcel(
				rowsAlumnoRepresentante,
				`insolventes_alumno_representante_${nombreMes}_${nombreSede}.xlsx`,
				['Alumno', 'Representante', 'Categoria', 'Mes', 'Anio', 'Monto', 'Recargo', 'Estado'],
				{ statusColumnName: 'Estado', statusStyleMap: estilosEstadoExcel }
			);
		}

		setModalExportExcelOpen(false);
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
	const desgloseRecargoDetalle = obtenerDesgloseRecargo(mensualidadDetalle);
	const historialNotasDetalle = (Array.isArray(mensualidadDetalle?.historial_ediciones)
		? mensualidadDetalle.historial_ediciones
		: [])
		.filter((item) => String(item?.nota || '').trim().length > 0)
		.slice()
		.sort((a, b) => new Date(b?.fecha || 0).getTime() - new Date(a?.fecha || 0).getTime());
	const fechaRecargoAplicadoTexto = mensualidadDetalle?.fecha_aplicacion_recargo
		? formatFechaBonita(mensualidadDetalle.fecha_aplicacion_recargo)
		: 'No aplicado';
	const diaRecargoPersonalizadoDetalle = obtenerDiaLimitePersonalizado(mensualidadDetalle);
	const formatMontoCorto = (value) => `$${formatMoney(value)}`;
	const tasaDetallePago = (() => {
		const montoBsPago = Number(detallePago?.monto_pagado_bs);
		const montoUsdPago = Number(detallePago?.monto_pagado);
		if (Number.isFinite(montoBsPago) && montoBsPago > 0 && Number.isFinite(montoUsdPago) && montoUsdPago > 0) {
			return montoBsPago / montoUsdPago;
		}
		const tasaFallback = Number(tasaPagoActiva);
		return Number.isFinite(tasaFallback) && tasaFallback > 0 ? tasaFallback : null;
	})();
	const ultimoPagoMontoPagadoUsdDraft = (() => {
		const montoBs = Number(ultimoPagoDraft?.monto_pagado_bs);
		if (!Number.isFinite(montoBs) || montoBs <= 0 || !Number.isFinite(tasaDetallePago) || tasaDetallePago <= 0) return null;
		return montoBs / tasaDetallePago;
	})();
	const ultimoPagoMontoEsperadoUsdDraft = (() => {
		const montoBs = Number(ultimoPagoDraft?.monto_esperado_bs);
		if (!Number.isFinite(montoBs) || montoBs < 0 || !Number.isFinite(tasaDetallePago) || tasaDetallePago <= 0) return null;
		return montoBs / tasaDetallePago;
	})();
	const ultimoPagoTieneAjusteManualMontoEsperado = existeAjusteManualMontoEsperadoBs(detallePago, mensualidadDetalle?.monto_esperado);
	const inlineEditableFieldSx = {
		mt: 0.65,
		minWidth: 180,
		'& .MuiOutlinedInput-root': {
			bgcolor: 'transparent',
			borderRadius: 0,
			fontSize: 15,
			fontWeight: 700,
			color: '#0f172a',
			borderBottom: '1px solid #cbd5e1',
			transition: 'border-color 0.16s ease, border-bottom-width 0.16s ease',
			'& fieldset': {
				border: 'none'
			},
			'&:hover': {
				borderBottomColor: '#94a3b8'
			},
			'&.Mui-focused': {
				borderBottom: '2px solid #64748b'
			},
			'&.Mui-focused fieldset': {
				border: 'none'
			}
		},
		'& .MuiInputBase-input': {
			py: 0.85,
			px: 0
		}
	};
	const inlineEditableMultilineSx = {
		...inlineEditableFieldSx,
		minWidth: 220,
		'& .MuiInputBase-inputMultiline': {
			py: 0.7,
			px: 0
		}
	};

	return (
		<div>
			<Typography variant="h5" sx={{ mb: 2, fontWeight: 'bold' }}>Mensualidades</Typography>
			<Box className="mensualidades-filters-row" sx={{ display: 'grid', gap: 1.5, mb: 1, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' } }}>
				<TextField select label="Mes" value={filtroMes} onChange={e => setFiltroMes(e.target.value)} sx={{ minWidth: 120, width: '100%' }}>
					<MenuItem value="">Todos</MenuItem>
					{[...Array(12)].map((_, i) => <MenuItem key={i + 1} value={i + 1}>{meses[i]}</MenuItem>)}
				</TextField>
				<TextField label="Alumno" value={filtroAlumno} onChange={e => setFiltroAlumno(e.target.value)} sx={{ minWidth: 180, width: '100%' }} />
				<TextField select label="Estado" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} sx={{ minWidth: 120, width: '100%' }}>
					<MenuItem value="">Todos</MenuItem>
					{['Pendiente', 'Pagado', 'Insolvente', 'Exonerado', 'Becado', 'En revision', 'Abono'].map(e => <MenuItem key={e} value={e}>{e}</MenuItem>)}
				</TextField>
			</Box>
			<Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'flex-end', mb: 2, mt: 2 }}>
				{esAdmin && (
					<Button
						variant="outlined"
						onClick={() => setModalAjusteSede(true)}
						disabled={!sedeSeleccionada?._id || !filtroMes}
						sx={{
							width: { xs: '100%', sm: 'auto' },
							borderRadius: '10px',
							fontWeight: 700,
							color: '#475569',
							borderColor: '#94a3b8',
							'&:hover': {
								borderColor: '#64748b',
								backgroundColor: '#fdfdfd'
							}
						}}
					>
						Ajuste por sede
					</Button>
				)}
				<Button
					className="mensualidades-export-btn"
					variant="contained"
					onClick={() => setModalExportExcelOpen(true)}
					disabled={(mensualidadesBD || []).length === 0}
					sx={{ width: { xs: '100%', sm: 'auto' }, borderRadius: '10px' }}
				>
					Exportar Excel
				</Button>
			</Box>
			{esAdmin && !sedeSeleccionada?._id && (
				<Alert severity="info" sx={{ mb: 2 }}>
					Selecciona una sede para poder aplicar un ajuste extraordinario al monto del mes.
				</Alert>
			)}
			{isMobile ? (
				<Box sx={{ mt: 2, display: 'grid', gap: 1.5 }}>
					{mensualidadesPaginadas.map((m) => {
						const estadoAlumno = obtenerEstadoAlumnoVisual(m.id_alumno);

						return (
							<Paper key={m._id} sx={{ borderRadius: 3, border: '1px solid #eef0f3', p: 1.5, boxShadow: '0 4px 14px rgba(15, 23, 42, 0.06)', minWidth: 0, overflow: 'hidden' }}>
								<Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1, mb: 1, minWidth: 0 }}>
									<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: 1 }}>
										<Tooltip title={`Alumno ${estadoAlumno.label}`}>
											<Box
												sx={{
													width: 10,
													height: 10,
													borderRadius: '50%',
													bgcolor: estadoAlumno.color,
													border: `2px solid ${estadoAlumno.borderColor}`,
													flexShrink: 0
												}}
											/>
										</Tooltip>
										<Avatar sx={{ width: 30, height: 30, bgcolor: '#e0ecff', color: '#2563eb', fontSize: 12, fontWeight: 700 }}>
											{m.id_alumno?.nombres ? `${m.id_alumno.nombres[0] || ''}${m.id_alumno.apellidos ? m.id_alumno.apellidos[0] : ''}`.toUpperCase() : ''}
										</Avatar>
										<Typography
											sx={{
												fontWeight: 700,
												color: '#1f2937',
												fontSize: 14,
												minWidth: 0,
												flex: 1,
												display: '-webkit-box',
												WebkitLineClamp: 2,
												WebkitBoxOrient: 'vertical',
												whiteSpace: 'normal',
												overflow: 'hidden',
												textOverflow: 'ellipsis'
											}}
										>
											{obtenerNombreAlumnoMensualidad(m)}
										</Typography>
									</Box>
									<Box sx={{ flexShrink: 0, maxWidth: '42%' }}>
										{renderEstatusChip(m.estatus)}
									</Box>
								</Box>
								<Box sx={{ display: 'grid', gap: 0.4, mb: 1.1 }}>
									<Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Categoría:</b> {m.id_alumno?.categoria || '-'}</Typography>
									<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
										<Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Etiquetas:</b></Typography>
										{renderEtiquetasAlumno(m.id_alumno)}
									</Box>
									<Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Mes:</b> {meses[(m.mes || 1) - 1]}</Typography>
									<Typography sx={{ fontSize: 12.5, color: '#0f172a' }}><b>Monto:</b> ${formatMoney(obtenerMontoTablaMensualidad(m))}</Typography>
									<Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Crédito aplicado:</b> {formatMontoCorto(m.credito_aplicado || 0)}</Typography>
									<Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Recargo:</b> {formatMontoCorto(m.recargo_aplicado_usd || 0)}</Typography>
									<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
										<Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Fecha recargo:</b></Typography>
										{(() => {
											const diaLimitePersonalizado = obtenerDiaLimitePersonalizado(m);
											if (!diaLimitePersonalizado) {
												return (
													<Chip
														size="small"
														label="Global"
														sx={{ height: 22, bgcolor: '#e2e8f0', color: '#475569', fontWeight: 700, fontSize: 11 }}
													/>
												);
											}

											return (
												<Chip
													size="small"
													label={`Personalizado: dia ${diaLimitePersonalizado}`}
													sx={{ height: 22, bgcolor: '#fff7ed', color: '#9a3412', fontWeight: 800, fontSize: 11 }}
												/>
											);
										})()}
									</Box>
									<Typography sx={{ fontSize: 12.5, color: '#475569' }}><b>Saldo a favor:</b> {formatMontoCorto(m.saldo_a_favor_generado || 0)}</Typography>
								</Box>
								<Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 0.5 }}>
									<Tooltip title="Ver detalle">
										<IconButton onClick={() => handleVerDetalle(m)} sx={actionIconButtonSx}>
											<VisibilityIcon fontSize="small" />
										</IconButton>
									</Tooltip>
									{esAdmin && !esMensualidadDeBecado(m) && esMensualidadEditable(m) && (
										<Tooltip title="Editar mensualidad">
											<IconButton onClick={() => abrirModalEditarMensualidad(m)} sx={actionIconButtonSx}>
												<EditIcon fontSize="small" />
											</IconButton>
										</Tooltip>
									)}
									{['pendiente', 'retrasado', 'insolvente', 'abono'].includes((m.estatus || '').toLowerCase()) && (
										<Tooltip title="Registrar pago">
											<IconButton onClick={() => handlePago(m)} sx={actionIconButtonSx}>
												<PaidIcon fontSize="small" />
											</IconButton>
										</Tooltip>
									)}
									{esAdmin && !esMensualidadDeBecado(m) && (
										<Tooltip title={adelantandoAlumnoId === String(m.id_alumno?._id || m.id_alumno) ? 'Creando mensualidad' : 'Adelantar proximo mes'}>
											<span>
												<IconButton
													onClick={() => solicitarAdelantoMensualidad(m)}
													disabled={adelantandoAlumnoId === String(m.id_alumno?._id || m.id_alumno)}
													sx={actionIconButtonSx}
												>
													<PaymentsIcon fontSize="small" />
												</IconButton>
											</span>
										</Tooltip>
									)}
									{esAdmin && (
										<Tooltip title="Eliminar mensualidad">
											<IconButton
												onClick={() => solicitarEliminarMensualidad(m)}
												disabled={eliminandoMensualidadId === m._id}
												sx={actionIconButtonSx}
											>
												<DeleteOutlineIcon fontSize="small" />
											</IconButton>
										</Tooltip>
									)}
								</Box>
							</Paper>
						);
					})}
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
						overflowX: 'auto',
						overflowY: 'hidden',
						maxWidth: '100%',
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
								<TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>RECARGO USD</TableCell>
								<TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>FECHA RECARGO</TableCell>
								<TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>SALDO A FAVOR</TableCell>
								<TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>ESTADO</TableCell>
								<TableCell sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em' }}>ACCIONES</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{mensualidadesPaginadas.map((m) => {
								const estadoAlumno = obtenerEstadoAlumnoVisual(m.id_alumno);

								return (
									<TableRow
										key={m._id}
										sx={{ '& td': { borderBottom: '1px solid #eef0f3', py: 2 }, '&:hover': { backgroundColor: '#fafafa' } }}
									>
										<TableCell sx={{ fontWeight: 600, color: '#1f2937' }}>
											<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
												<Tooltip title={`Alumno ${estadoAlumno.label}`}>
													<Box
														sx={{
															width: 9,
															height: 9,
															borderRadius: '50%',
															bgcolor: estadoAlumno.color,
															border: `2px solid ${estadoAlumno.borderColor}`,
															flexShrink: 0
														}}
													/>
												</Tooltip>
												<Avatar sx={{ width: 28, height: 28, bgcolor: '#e0ecff', color: '#2563eb', fontSize: 12, fontWeight: 700 }}>
													{m.id_alumno?.nombres ? `${m.id_alumno.nombres[0] || ''}${m.id_alumno.apellidos ? m.id_alumno.apellidos[0] : ''}`.toUpperCase() : ''}
												</Avatar>
												{obtenerNombreAlumnoMensualidad(m)}
											</Box>
										</TableCell>
										<TableCell>
											<Chip label={m.id_alumno ? m.id_alumno.categoria : '-'} sx={{ backgroundColor: '#fdfdfd', color: '#64748b', fontWeight: 700, fontSize: 12 }} />
										</TableCell>
										<TableCell sx={{ color: '#64748b' }}>{meses[(m.mes || 1) - 1]}</TableCell>
										<TableCell sx={{ fontWeight: 700, color: '#0f172a' }}>${formatMoney(obtenerMontoTablaMensualidad(m))}</TableCell>
										<TableCell sx={{ color: '#0f172a', fontWeight: 600 }}>{formatMontoCorto(m.credito_aplicado || 0)}</TableCell>
										<TableCell sx={{ color: '#0f172a', fontWeight: 600 }}>{formatMontoCorto(m.recargo_aplicado_usd || 0)}</TableCell>
										<TableCell>
											{(() => {
												const diaLimitePersonalizado = obtenerDiaLimitePersonalizado(m);
												if (!diaLimitePersonalizado) {
													return <Chip size="small" label="Global" sx={{ bgcolor: '#e2e8f0', color: '#475569', fontWeight: 700, fontSize: 11 }} />;
												}
												return <Chip size="small" label={`Dia ${diaLimitePersonalizado}`} sx={{ bgcolor: '#fff7ed', color: '#9a3412', fontWeight: 800, fontSize: 11 }} />;
											})()}
										</TableCell>
										<TableCell sx={{ color: '#0f172a', fontWeight: 600 }}>{formatMontoCorto(m.saldo_a_favor_generado || 0)}</TableCell>
										<TableCell>{renderEstatusChip(m.estatus)}</TableCell>
										<TableCell>
											<Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 0.5 }}>
												<Tooltip title="Ver detalle">
													<IconButton size="small" onClick={() => handleVerDetalle(m)} sx={actionIconButtonSx}>
														<VisibilityIcon fontSize="small" />
													</IconButton>
												</Tooltip>
												{esAdmin && !esMensualidadDeBecado(m) && esMensualidadEditable(m) && (
													<Tooltip title="Editar mensualidad">
														<IconButton size="small" onClick={() => abrirModalEditarMensualidad(m)} sx={actionIconButtonSx}>
															<EditIcon fontSize="small" />
														</IconButton>
													</Tooltip>
												)}
												{['pendiente', 'retrasado', 'insolvente', 'abono'].includes((m.estatus || '').toLowerCase()) && (
													<Tooltip title="Registrar pago">
														<IconButton size="small" onClick={() => handlePago(m)} sx={actionIconButtonSx}>
															<PaidIcon fontSize="small" />
														</IconButton>
													</Tooltip>
												)}
												{esAdmin && !esMensualidadDeBecado(m) && (
													<Tooltip title={adelantandoAlumnoId === String(m.id_alumno?._id || m.id_alumno) ? 'Creando mensualidad' : 'Adelantar proximo mes'}>
														<span>
															<IconButton
																size="small"
																onClick={() => solicitarAdelantoMensualidad(m)}
																disabled={adelantandoAlumnoId === String(m.id_alumno?._id || m.id_alumno)}
																sx={actionIconButtonSx}
															>
																<PaymentsIcon fontSize="small" />
															</IconButton>
														</span>
													</Tooltip>
												)}
												{esAdmin && (
													<Tooltip title="Eliminar mensualidad">
														<IconButton
															size="small"
															onClick={() => solicitarEliminarMensualidad(m)}
															disabled={eliminandoMensualidadId === m._id}
															sx={actionIconButtonSx}
														>
															<DeleteOutlineIcon fontSize="small" />
														</IconButton>
													</Tooltip>
												)}
											</Box>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
						<tfoot>
							<TableRow>
								<TableCell colSpan={12}>
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
				maxWidth={false}
				fullWidth
				PaperProps={{
					sx: {
						borderRadius: 3,
						overflow: 'hidden',
						width: { xs: 'calc(100% - 16px)', sm: 'calc(100% - 32px)', md: 'calc(100% - 48px)' },
						maxWidth: '1400px',
						m: { xs: 1, sm: 2, md: 3 }
					}
				}}
			>
				<DialogTitle sx={{ bgcolor: '#f3f5fb', color: '#0b2a57', fontWeight: 800, fontSize: 17, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
					<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
						<Typography sx={{ fontWeight: 800, fontSize: 17, color: '#0b2a57' }}>
							Detalle del Pago -
						</Typography>
						{mensualidadDetalle?.id_alumno && (
							<Typography sx={{ color: '#516b94', fontWeight: 800, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: { xs: 160, sm: 260 } }}>
								{obtenerNombreAlumnoMensualidad(mensualidadDetalle)}
							</Typography>
						)}
					</Box>
					<IconButton size="small" onClick={() => setModalDetalle(false)} sx={{ color: '#6b7280' }}>
						&times;
					</IconButton>
				</DialogTitle>
				<DialogContent sx={{ bgcolor: '#f3f5fb', pt: 2.5, pb: 2.5 }}>
					<Box
						sx={{
							display: 'grid',
							gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1.55fr) minmax(300px, 1fr)' },
							gap: { xs: 2, md: 2.5 },
							alignItems: 'start'
						}}
					>
						<Box>
							{detallePago ? (
								<>
									<Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5, justifyContent: 'space-between', flexWrap: 'wrap' }}>
										<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
											<Box sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: '#dbeafe', color: '#0b2a57', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>✓</Box>
											<Typography sx={{ fontSize: { xs: 16, sm: 19 }, fontWeight: 900, color: '#0b2a57', lineHeight: 1.1 }}>Último Pago Registrado</Typography>
										</Box>
										<Button
											variant={editandoUltimoPagoInline ? 'outlined' : 'contained'}
											startIcon={<EditIcon fontSize="small" />}
											onClick={() => {
												if (editandoUltimoPagoInline) {
													cargarUltimoPagoDraft();
													setEditandoUltimoPagoInline(false);
													setUltimoPagoComprobante(null);
													return;
												}
												setEditandoUltimoPagoInline(true);
											}}
											disabled={guardandoUltimoPagoInline}
											sx={{
												borderRadius: 999,
												px: 2,
												minWidth: 108,
												textTransform: 'none',
												fontWeight: 800,
												bgcolor: editandoUltimoPagoInline ? 'transparent' : '#0b2a57',
												color: editandoUltimoPagoInline ? '#0b2a57' : '#ffffff',
												borderColor: '#93a7c7',
												'&:hover': {
													bgcolor: editandoUltimoPagoInline ? '#eff6ff' : '#103469'
												}
											}}
										>
											{editandoUltimoPagoInline ? 'Cancelar' : 'Editar'}
										</Button>
									</Box>

									<Box
										sx={{
											position: 'relative',
											bgcolor: '#ffffff',
											borderRadius: 2.5,
											border: '1px solid #e7eaf2',
											p: { xs: 2, sm: 3 },
											minHeight: { md: 560 },
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
										<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, columnGap: 4.5, rowGap: 2.25, pt: 1.75 }}>
									<Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
										<Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Metodo de pago</Typography>
										<TextField
											select
											size="small"
											sx={inlineEditableFieldSx}
											disabled={!editandoUltimoPagoInline || guardandoUltimoPagoInline}
											value={ultimoPagoDraft.metodo_pago}
											onChange={(e) => setUltimoPagoDraft((prev) => ({
												...prev,
												metodo_pago: normalizeMetodoPago(e.target.value),
												referencia: metodoRequiereReferencia(e.target.value) ? prev.referencia : ''
											}))}
										>
											{metodosPago.map((m) => (
												<MenuItem key={m} value={m}>{m}</MenuItem>
											))}
										</TextField>
									</Box>

									<Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
										<Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Monto pagado (Bs)</Typography>
										<TextField
											type="number"
											size="small"
											sx={inlineEditableFieldSx}
											disabled={!editandoUltimoPagoInline || guardandoUltimoPagoInline}
											inputProps={{ min: 0, step: '0.01' }}
											value={ultimoPagoDraft.monto_pagado_bs}
											onChange={(e) => setUltimoPagoDraft((prev) => ({ ...prev, monto_pagado_bs: e.target.value }))}
										/>
										<Typography sx={{ mt: 0.55, fontSize: 12, color: '#64748b', fontWeight: 700 }}>
											Equivalente USD: {ultimoPagoMontoPagadoUsdDraft !== null ? `$${formatMoney(ultimoPagoMontoPagadoUsdDraft)} USD` : '-'}
										</Typography>
									</Box>

									<Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
										<Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Monto esperado (Bs)</Typography>
										<TextField
											type="number"
											size="small"
											sx={inlineEditableFieldSx}
											disabled={!editandoUltimoPagoInline || guardandoUltimoPagoInline}
											inputProps={{ min: 0, step: '0.01' }}
											value={ultimoPagoDraft.monto_esperado_bs}
											onChange={(e) => setUltimoPagoDraft((prev) => ({ ...prev, monto_esperado_bs: e.target.value }))}
										/>
										<Typography sx={{ mt: 0.55, fontSize: 12, color: '#64748b', fontWeight: 700 }}>
											Equivalente USD: {ultimoPagoMontoEsperadoUsdDraft !== null ? `$${formatMoney(ultimoPagoMontoEsperadoUsdDraft)} USD` : '-'}
										</Typography>
										{ultimoPagoTieneAjusteManualMontoEsperado && (
											<Typography sx={{ mt: 0.45, fontSize: 12, color: '#b45309', fontWeight: 800 }}>
												Monto esperado Bs ajustado manualmente
											</Typography>
										)}
									</Box>

									<Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
										<Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Fecha de pago</Typography>
										<TextField
											type="date"
											size="small"
											sx={inlineEditableFieldSx}
											disabled={!editandoUltimoPagoInline || guardandoUltimoPagoInline}
											InputLabelProps={{ shrink: true }}
											value={ultimoPagoDraft.fecha_pago}
											onChange={(e) => setUltimoPagoDraft((prev) => ({ ...prev, fecha_pago: e.target.value }))}
										/>
									</Box>

									<Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
										<Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Tasa aplicada</Typography>
										<Typography sx={{ mt: 0.7, fontSize: { xs: 15, sm: 17 }, fontWeight: 800, color: '#0b2a57', lineHeight: 1.12 }}>{formatTasaAplicada(detallePago)}</Typography>
									</Box>

									<Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
										<Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Referencia</Typography>
										{metodoRequiereReferencia(ultimoPagoDraft.metodo_pago) ? (
											<TextField
												size="small"
												sx={inlineEditableFieldSx}
												disabled={!editandoUltimoPagoInline || guardandoUltimoPagoInline}
												value={ultimoPagoDraft.referencia}
												onChange={(e) => setUltimoPagoDraft((prev) => ({ ...prev, referencia: e.target.value.replace(/[^0-9]/g, '') }))}
												inputProps={{ minLength: 6 }}
											/>
										) : (
											<Typography sx={{ mt: 0.7, color: '#64748b', fontWeight: 700 }}>No aplica para este metodo</Typography>
										)}
									</Box>

									<Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
										<Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Registrado por</Typography>
										<Typography sx={{ mt: 0.7, fontSize: { xs: 14, sm: 16 }, fontWeight: 700, color: '#0b2a57', lineHeight: 1.2 }}>
											{formatRegistradoPorPago(detallePago)}
										</Typography>
									</Box>

									<Box sx={{ borderBottom: '1px solid #e5e7eb', pb: 1.6 }}>
										<Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800 }}>Nota</Typography>
										<TextField
											multiline
											minRows={2}
											size="small"
											sx={inlineEditableMultilineSx}
											disabled={!editandoUltimoPagoInline || guardandoUltimoPagoInline}
											value={ultimoPagoDraft.nota}
											onChange={(e) => setUltimoPagoDraft((prev) => ({ ...prev, nota: e.target.value.slice(0, 500) }))}
										/>
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
												Ver comprobante
											</Button>
										) : (
											<Typography sx={{ mt: 0.7, color: '#9ca3af', fontWeight: 700 }}>Sin comprobante</Typography>
										)}
										{editandoUltimoPagoInline && (
											<>
												<Box
													component="label"
													sx={{
														mt: 0.9,
														display: 'inline-flex',
														alignItems: 'center',
														gap: 0.8,
														cursor: guardandoUltimoPagoInline ? 'not-allowed' : 'pointer',
														color: '#0b2a57',
														fontWeight: 800,
														fontSize: 13
													}}
												>
													<InsertDriveFileIcon fontSize="small" />
													Subir nuevo comprobante
													<input
														type="file"
														hidden
														disabled={guardandoUltimoPagoInline}
														onChange={(e) => setUltimoPagoComprobante(e.target.files?.[0] || null)}
													/>
												</Box>
												{ultimoPagoComprobante && (
													<Box sx={{ mt: 0.55, display: 'flex', alignItems: 'center', gap: 0.7 }}>
														<Typography sx={{ color: '#475569', fontSize: 12, fontWeight: 700, maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
															{ultimoPagoComprobante.name}
														</Typography>
														<IconButton
															size="small"
															onClick={() => setUltimoPagoComprobante(null)}
															disabled={guardandoUltimoPagoInline}
															sx={{ p: 0.25 }}
														>
															<CloseIcon fontSize="small" sx={{ color: '#94a3b8', fontSize: 15 }} />
														</IconButton>
													</Box>
												)}
											</>
										)}
									</Box>

									<Box sx={{ display: 'flex', justifyContent: { xs: 'flex-start', lg: 'flex-end' }, alignItems: 'flex-end', gap: 1.2, gridColumn: { lg: '2 / 3' }, justifySelf: { lg: 'end' } }}>
										<Button
											variant="contained"
											onClick={guardarUltimoPagoInline}
											disabled={guardandoUltimoPagoInline || !editandoUltimoPagoInline}
											sx={{ borderRadius: 999, px: 2.2, minWidth: 118, bgcolor: '#dcfce7', color: '#166534', boxShadow: 'none', fontWeight: 800, '&:hover': { bgcolor: '#bbf7d0', boxShadow: 'none' } }}
										>
											{guardandoUltimoPagoInline ? 'Guardando...' : 'Guardar cambios'}
										</Button>
										<Button
											variant="contained"
											startIcon={<DeleteOutlineIcon fontSize="small" />}
											onClick={() => solicitarEliminarPago(detallePago)}
											disabled={eliminandoPagoId === detallePago._id || guardandoUltimoPagoInline}
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
						</Box>

						{(desgloseRecargoDetalle || historialNotasDetalle.length > 0) && (
							<Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: { xs: 0, md: '56px' } }}>
								{desgloseRecargoDetalle && (
									<Box
										sx={{
											bgcolor: '#ffffff',
											border: '1px solid #e8ebf2',
											borderRadius: 2,
											borderLeft: '4px solid #d6c7ff',
											p: { xs: 1.5, sm: 2 }
										}}
									>
										<Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800, mb: 1.2 }}>
											Desglose de recargo
										</Typography>
										<Box sx={{ mb: 1.2, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
											<Typography sx={{ fontSize: 12, color: '#475569', fontWeight: 700 }}>
												Regla usada:
											</Typography>
											{diaRecargoPersonalizadoDetalle ? (
												<Chip
													size="small"
													label={`Personalizado: dia ${diaRecargoPersonalizadoDetalle}`}
													sx={{ bgcolor: '#fff7ed', color: '#9a3412', fontWeight: 800 }}
												/>
											) : (
												<Chip
													size="small"
													label="Global"
													sx={{ bgcolor: '#e2e8f0', color: '#475569', fontWeight: 700 }}
												/>
											)}
										</Box>
										<Typography sx={{ fontSize: 12, color: '#475569', fontWeight: 700, mb: 1.2 }}>
											Fecha aplicada: {fechaRecargoAplicadoTexto}
										</Typography>
										<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr 1fr', md: '1fr' }, gap: 1.2 }}>
											<Box>
												<Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>
													Monto base (sin recargo)
												</Typography>
												<Typography sx={{ mt: 0.35, color: '#0b2a57', fontWeight: 900 }}>
													{`$${formatMoney(desgloseRecargoDetalle.montoSinRecargo)} USD`}
												</Typography>
											</Box>
											<Box>
												<Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>
													Recargo aplicado
												</Typography>
												<Typography sx={{ mt: 0.35, color: '#0b2a57', fontWeight: 900 }}>
													{`$${formatMoney(desgloseRecargoDetalle.recargoAplicado)} USD`}
												</Typography>
											</Box>
											<Box>
												<Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>
													Total con recargo
												</Typography>
												<Typography sx={{ mt: 0.35, color: '#0b2a57', fontWeight: 900 }}>
													{`$${formatMoney(desgloseRecargoDetalle.totalConRecargo)} USD`}
												</Typography>
											</Box>
										</Box>
										{esAdmin && Number(desgloseRecargoDetalle.recargoAplicado || 0) > 0 && (
											<Box sx={{ mt: 1.4, display: 'flex', justifyContent: 'flex-end' }}>
												<Button
													variant="outlined"
													onClick={corregirRecargoDesdeDetalle}
													disabled={corrigiendoRecargo}
													sx={{ borderRadius: 999, fontWeight: 800 }}
												>
													{corrigiendoRecargo ? 'Corrigiendo...' : 'Retirar recargo'}
												</Button>
											</Box>
										)}
									</Box>
								)}

								{historialNotasDetalle.length > 0 && (
									<Box>
										<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.25 }}>
											<Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
												<HistoryRoundedIcon sx={{ color: '#8ea0bc', fontSize: 19 }} />
												<Typography sx={{ fontSize: { xs: 16, sm: 19 }, fontWeight: 900, color: '#0b2a57', lineHeight: 1.15 }}>
													Historial de notas
												</Typography>
											</Box>
											<Chip label={`${historialNotasDetalle.length} total`} size="small" sx={{ bgcolor: '#d9e4f7', color: '#4b6ca7', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }} />
										</Box>

										<Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
											{historialNotasDetalle.map((item, idx) => {
												const actor = String(item?.actor_nombre || '').trim() || 'Usuario';
												const rol = String(item?.actor_rol || '').trim();
												const accion = String(item?.accion || '').trim() || 'edicion_manual';
												const fechaItem = item?.fecha ? formatFechaBonita(item.fecha) : '-';
												const anteriorMonto = Number(item?.anterior?.monto_esperado);
												const nuevoMonto = Number(item?.nuevo?.monto_esperado);
												const anteriorEstatus = item?.anterior?.estatus || '-';
												const nuevoEstatus = item?.nuevo?.estatus || '-';

												return (
													<Box
														key={item?._id || `${accion}-${idx}`}
														sx={{
															bgcolor: '#ffffff',
															border: '1px solid #e8ebf2',
															borderRadius: 2,
															borderLeft: '4px solid #d6c7ff',
															px: 1.7,
															py: 1.2
														}}
													>
														<Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
															<Typography sx={{ fontWeight: 800, color: '#0b2a57' }}>
																{actor}{rol ? ` (${rol})` : ''}
															</Typography>
															<Typography sx={{ color: '#64748b', fontSize: 12 }}>{fechaItem}</Typography>
														</Box>
														<Typography sx={{ mt: 0.5, color: '#334155', fontSize: 13 }}>
															{String(item?.nota || '').trim()}
														</Typography>
														<Box sx={{ mt: 0.75, display: 'flex', gap: 0.7, flexWrap: 'wrap', alignItems: 'center' }}>
															<Chip
																size="small"
																label={`Acción: ${accion}`}
																sx={{ bgcolor: '#eef2ff', color: '#3730a3', fontWeight: 700 }}
															/>
															{Number.isFinite(anteriorMonto) && Number.isFinite(nuevoMonto) && (
																<Chip
																	size="small"
																	label={`Monto: $${formatMoney(anteriorMonto)} - $${formatMoney(nuevoMonto)}`}
																	sx={{ bgcolor: '#ecfeff', color: '#0f766e', fontWeight: 700 }}
																/>
															)}
															{(anteriorEstatus || nuevoEstatus) && (
																<Chip
																	size="small"
																	label={`Estatus: ${anteriorEstatus} - ${nuevoEstatus}`}
																	sx={{ bgcolor: '#f1f5f9', color: '#334155', fontWeight: 700 }}
																/>
															)}
														</Box>
													</Box>
												);
											})}
										</Box>
									</Box>
								)}
							</Box>
						)}
					</Box>

					{((mensualidadDetalle?.monto_inscripcion !== undefined && mensualidadDetalle?.monto_inscripcion !== null)
						|| (mensualidadDetalle?.monto_primera_mensualidad !== undefined && mensualidadDetalle?.monto_primera_mensualidad !== null)
						|| (mensualidadDetalle?.monto_reingreso !== undefined && mensualidadDetalle?.monto_reingreso !== null)
						|| (mensualidadDetalle?.monto_mensualidad_reingreso !== undefined && mensualidadDetalle?.monto_mensualidad_reingreso !== null)
						|| (mensualidadDetalle?.monto_equivalente_bs !== undefined && mensualidadDetalle?.monto_equivalente_bs !== null)) && (
							<Box
								sx={{
									mt: 2,
									bgcolor: '#ffffff',
									border: '1px solid #e8ebf2',
									borderRadius: 2,
									p: { xs: 1.5, sm: 2 }
								}}
							>
								<Typography sx={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#4b5563', fontWeight: 800, mb: 1.2 }}>
									Resumen de pagos
								</Typography>
								<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.2 }}>
									{mensualidadDetalle?.monto_inscripcion !== undefined && mensualidadDetalle?.monto_inscripcion !== null && (
										<Box>
											<Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>
												Monto de inscripcion
											</Typography>
											<Typography sx={{ mt: 0.35, color: '#0b2a57', fontWeight: 900 }}>
												{`$${formatMoney(mensualidadDetalle?.monto_inscripcion)} USD`}
											</Typography>
										</Box>
									)}
									{mensualidadDetalle?.monto_primera_mensualidad !== undefined && mensualidadDetalle?.monto_primera_mensualidad !== null && (
										<Box>
											<Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>
												Monto de primera mensualidad
											</Typography>
											<Typography sx={{ mt: 0.35, color: '#0b2a57', fontWeight: 900 }}>
												{`$${formatMoney(mensualidadDetalle?.monto_primera_mensualidad)} USD`}
											</Typography>
										</Box>
									)}
									{mensualidadDetalle?.monto_reingreso !== undefined && mensualidadDetalle?.monto_reingreso !== null && (
										<Box>
											<Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>
												Monto de reingreso
											</Typography>
											<Typography sx={{ mt: 0.35, color: '#0b2a57', fontWeight: 900 }}>
												{`$${formatMoney(mensualidadDetalle?.monto_reingreso)} USD`}
											</Typography>
										</Box>
									)}
									{mensualidadDetalle?.monto_mensualidad_reingreso !== undefined && mensualidadDetalle?.monto_mensualidad_reingreso !== null && (
										<Box>
											<Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>
												Monto de mensualidad de reingreso
											</Typography>
											<Typography sx={{ mt: 0.35, color: '#0b2a57', fontWeight: 900 }}>
												{`$${formatMoney(mensualidadDetalle?.monto_mensualidad_reingreso)} USD`}
											</Typography>
										</Box>
									)}
									{mensualidadDetalle?.monto_equivalente_bs !== undefined && mensualidadDetalle?.monto_equivalente_bs !== null && (
										<Box>
											<Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>
												Equivalente total en Bs
											</Typography>
											<Typography sx={{ mt: 0.35, color: '#0b2a57', fontWeight: 900 }}>
												{`Bs ${formatMoney(mensualidadDetalle?.monto_equivalente_bs)}`}
											</Typography>
										</Box>
									)}
								</Box>
							</Box>
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
											gridTemplateColumns: { xs: '1fr', md: '1.05fr 1.15fr 0.85fr 0.85fr 1fr minmax(140px, 0.8fr) auto' },
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
											{formatMontoEsperadoPago(pago, mensualidadDetalle?.monto_esperado, true) !== '-' && (
												<Typography sx={{ color: '#64748b', fontSize: 12, fontWeight: 700, mt: 0.2 }}>
													Esperado: {formatMontoEsperadoPago(pago, mensualidadDetalle?.monto_esperado, true)}
												</Typography>
											)}
											{existeAjusteManualMontoEsperadoBs(pago, mensualidadDetalle?.monto_esperado) && (
												<Chip
													size="small"
													label="Monto esperado Bs ajustado"
													sx={{ mt: 0.45, bgcolor: '#fff7ed', color: '#9a3412', fontWeight: 800 }}
												/>
											)}
											{desgloseRecargoDetalle && (
												<Box sx={{ mt: 0.35, display: 'grid', gap: 0.15 }}>
													<Typography sx={{ color: '#64748b', fontSize: 11.5, fontWeight: 700 }}>
														Base: ${formatMoney(desgloseRecargoDetalle.montoSinRecargo)}
													</Typography>
													<Typography sx={{ color: '#64748b', fontSize: 11.5, fontWeight: 700 }}>
														Recargo: ${formatMoney(desgloseRecargoDetalle.recargoAplicado)}
													</Typography>
													<Typography sx={{ color: '#64748b', fontSize: 11.5, fontWeight: 700 }}>
														Total: ${formatMoney(desgloseRecargoDetalle.totalConRecargo)}
													</Typography>
												</Box>
											)}
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
											<Typography sx={{ color: '#334155', fontWeight: 700, mt: 0.35, fontSize: 12 }}>
												Registrado por: {formatRegistradoPorPago(pago)}
											</Typography>
										</Box>
										<Box>
											<Typography sx={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 800 }}>Nota</Typography>
											<Typography
												sx={{
													color: '#334155',
													fontWeight: 700,
													mt: 0.25,
													overflow: 'hidden',
													textOverflow: 'ellipsis',
													whiteSpace: 'nowrap',
													maxWidth: { xs: '100%', md: 180 }
												}}
												title={String(pago.nota || '').trim() || '-'}
											>
												{String(pago.nota || '').trim() || '-'}
											</Typography>
											{pago.solicita_revision_recargo && (
												<Chip
													size="small"
													label="Solicita revision"
													sx={{ mt: 0.6, bgcolor: '#fff7ed', color: '#9a3412', fontWeight: 800 }}
												/>
											)}
										</Box>
										<Box sx={{ display: 'flex', gap: 0.6, flexWrap: 'nowrap', justifyContent: { xs: 'flex-start', md: 'flex-end' }, alignItems: 'center', height: '100%' }}>
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
				<DialogActions sx={{ px: 3, pb: 2.25, bgcolor: '#f3f5fb', justifyContent: 'flex-end' }}>
					{(mensualidadDetalle?.estatus || '').toLowerCase() === 'en revision' && (
						<Button
							onClick={solicitarConfirmarMensualidad}
							variant="contained"
							sx={{ bgcolor: '#0e1334', color: '#fff', boxShadow: 'none', '&:hover': { bgcolor: '#0b102b', boxShadow: 'none' }, borderRadius: 999, px: 2.2, fontWeight: 800 }}
						>
							Confirmar
						</Button>
					)}
				</DialogActions>
			</Dialog>
			<Dialog
				open={confirmarPagoOpen}
				onClose={() => !confirmandoMensualidad && setConfirmarPagoOpen(false)}
				maxWidth="xs"
				fullWidth
			>
				<DialogTitle sx={{ fontWeight: 800, color: '#0f172a' }}>Confirmar pago</DialogTitle>
				<DialogContent>
					<Typography sx={{ color: '#334155' }}>
						¿Estas seguro de confirmar este pago?
					</Typography>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setConfirmarPagoOpen(false)} disabled={confirmandoMensualidad}>
						Cancelar
					</Button>
					<Button
						variant="contained"
						onClick={confirmarMensualidad}
						disabled={confirmandoMensualidad}
						sx={{ bgcolor: '#0e1334', color: '#fff', '&:hover': { bgcolor: '#0b102b' }, boxShadow: 'none' }}
					>
						{confirmandoMensualidad ? 'Confirmando...' : 'Si, confirmar'}
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
				open={modalExportExcelOpen}
				onClose={() => setModalExportExcelOpen(false)}
				maxWidth="sm"
				fullWidth
			>
				<DialogTitle sx={{ fontWeight: 800, color: '#0f172a' }}>Exportar Excel</DialogTitle>
				<DialogContent>
					<Typography sx={{ color: '#64748b', mb: 1.5 }}>
						Selecciona una o varias opciones y luego presiona Aplicar para descargar archivos XLSX.
					</Typography>
					<FormGroup>
						<FormControlLabel
							control={<Checkbox checked={opcionesExportExcel.mesCompleto} onChange={(e) => setOpcionesExportExcel((prev) => ({ ...prev, mesCompleto: e.target.checked }))} />}
							label="Mes completo"
						/>
						<FormControlLabel
							control={<Checkbox checked={opcionesExportExcel.insolventesRepresentante} onChange={(e) => setOpcionesExportExcel((prev) => ({ ...prev, insolventesRepresentante: e.target.checked }))} />}
							label="Insolventes nombre de representante"
						/>
						<FormControlLabel
							control={<Checkbox checked={opcionesExportExcel.insolventesAlumnoRepresentante} onChange={(e) => setOpcionesExportExcel((prev) => ({ ...prev, insolventesAlumnoRepresentante: e.target.checked }))} />}
							label="Insolventes alumno + representante"
						/>
					</FormGroup>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setModalExportExcelOpen(false)}>
						Cancelar
					</Button>
					<Button variant="contained" onClick={exportarExcelSeleccionado}>
						Aplicar
					</Button>
				</DialogActions>
			</Dialog>
			<Dialog
				open={modalEditarMensualidadOpen}
				onClose={cerrarModalEditarMensualidad}
				maxWidth="xs"
				fullWidth
			>
				<DialogTitle sx={{ fontWeight: 800, color: '#0f172a' }}>Editar mensualidad</DialogTitle>
				<DialogContent>
					{mensualidadAEditar && (
						<Box sx={{ mt: 0.5, p: 1.25, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
							<Typography variant="body2"><b>Alumno:</b> {mensualidadAEditar.id_alumno ? `${mensualidadAEditar.id_alumno.nombres || ''} ${mensualidadAEditar.id_alumno.apellidos || ''}`.trim() : '-'}</Typography>
							<Typography variant="body2"><b>Mes:</b> {meses[(mensualidadAEditar.mes || 1) - 1] || '-'}</Typography>
							<Typography variant="body2"><b>Estado actual:</b> {mensualidadAEditar.estatus || '-'}</Typography>
						</Box>
					)}
					<TextField
						label="Monto esperado (USD)"
						type="number"
						fullWidth
						margin="normal"
						value={editarMontoEsperado}
						onChange={(e) => setEditarMontoEsperado(e.target.value)}
						inputProps={{ min: 0, step: '0.01' }}
						helperText="Este ajuste solo modifica la mensualidad seleccionada."
					/>
					<TextField
						select
						label="Estatus"
						fullWidth
						margin="normal"
						value={editarEstatus}
						onChange={(e) => setEditarEstatus(e.target.value)}
					>
						<MenuItem value="sin_cambio">Sin cambio</MenuItem>
						<MenuItem value="exonerado">Exonerado</MenuItem>
					</TextField>
					<TextField
						label="Nota del cambio"
						fullWidth
						margin="normal"
						multiline
						minRows={3}
						value={editarNota}
						onChange={(e) => setEditarNota(e.target.value)}
						helperText="Especifica el motivo del ajuste. Esta nota quedará guardada en la traza de la mensualidad."
						required
					/>
					<Alert severity="info" sx={{ mt: 1 }}>
						Este cambio solo afecta la mensualidad seleccionada y quedará registrado en el historial con la nota indicada.
					</Alert>
				</DialogContent>
				<DialogActions>
					<Button onClick={cerrarModalEditarMensualidad} disabled={guardandoEdicionMensualidad}>
						Cancelar
					</Button>
					<Button variant="contained" onClick={guardarEdicionMensualidad} disabled={guardandoEdicionMensualidad}>
						{guardandoEdicionMensualidad ? 'Guardando...' : 'Guardar cambios'}
					</Button>
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
				open={confirmarEliminarMensualidadOpen}
				onClose={() => {
					if (eliminandoMensualidadId) return;
					setConfirmarEliminarMensualidadOpen(false);
					setMensualidadAEliminar(null);
				}}
				maxWidth="xs"
				fullWidth
			>
				<DialogTitle sx={{ fontWeight: 800, color: '#b91c1c' }}>Eliminar mensualidad</DialogTitle>
				<DialogContent>
					<Typography sx={{ color: '#334155' }}>
						¿Estás seguro de eliminar esta mensualidad? Esta acción también eliminará sus pagos asociados y no se puede deshacer.
					</Typography>
					{mensualidadAEliminar && (
						<Box sx={{ mt: 1.5, p: 1.25, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
							<Typography variant="body2"><b>Alumno:</b> {mensualidadAEliminar.id_alumno ? `${mensualidadAEliminar.id_alumno.nombres || ''} ${mensualidadAEliminar.id_alumno.apellidos || ''}`.trim() : '-'}</Typography>
							<Typography variant="body2"><b>Mes:</b> {meses[(mensualidadAEliminar.mes || 1) - 1] || '-'}</Typography>
							<Typography variant="body2"><b>Monto:</b> ${formatMoney(obtenerMontoTablaMensualidad(mensualidadAEliminar))} USD</Typography>
							<Typography variant="body2"><b>Estado:</b> {mensualidadAEliminar.estatus || '-'}</Typography>
						</Box>
					)}
				</DialogContent>
				<DialogActions>
					<Button
						onClick={() => {
							setConfirmarEliminarMensualidadOpen(false);
							setMensualidadAEliminar(null);
						}}
						disabled={!!eliminandoMensualidadId}
					>
						Cancelar
					</Button>
					<Button
						variant="contained"
						color="error"
						onClick={eliminarMensualidad}
						disabled={!!eliminandoMensualidadId}
					>
						{eliminandoMensualidadId ? 'Eliminando...' : 'Eliminar mensualidad'}
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
			<Snackbar
				open={!!errorMessage}
				autoHideDuration={3500}
				onClose={() => setErrorMessage('')}
				anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
			>
				<Alert onClose={() => setErrorMessage('')} severity="error" sx={{ width: '100%' }}>
					{errorMessage}
				</Alert>
			</Snackbar>
			<Dialog open={modalAjusteSede} onClose={() => !aplicandoAjuste && resetAjusteSedeForm()} maxWidth="sm" fullWidth>
				<DialogTitle sx={{ fontWeight: 800, color: '#0f172a', pr: 6 }}>
					Ajuste extraordinario por sede
					<IconButton
						aria-label="Cerrar"
						onClick={resetAjusteSedeForm}
						disabled={aplicandoAjuste}
						sx={{ position: 'absolute', right: 8, top: 8, color: '#64748b' }}
					>
						<CloseIcon fontSize="small" />
					</IconButton>
				</DialogTitle>
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
					{pagoInfo?.id_alumno && (
						<Box
							sx={{
								mb: 2,
								px: 1.75,
								py: 1.25,
								borderRadius: 2,
								border: '1px solid #e2e8f0',
								bgcolor: '#ffffff'
							}}
						>
							<Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: '#94a3b8' }}>
								ALUMNO SELECCIONADO
							</Typography>
							<Typography sx={{ mt: 0.45, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
								{`${pagoInfo.id_alumno.nombres || ''} ${pagoInfo.id_alumno.apellidos || ''}`.trim() || '-'}
							</Typography>
						</Box>
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
					{(esAdmin || pagoInfo?.id_alumno?.habilitar_pago_cuotas || (pagoInfo?.estatus || '').toLowerCase() === 'abono') ? (
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
							label="Referencia (mínimo 6 últimos dígitos)"
							fullWidth
							margin="normal"
							size="small"
							sx={inputSx}
							value={referencia}
							onChange={e => setReferencia(e.target.value.replace(/[^0-9]/g, ''))}
							inputProps={{ minLength: 6 }}
							error={!!errorRef}
							helperText={errorRef}
						/>
					)}
					<TextField
						label="Nota para administración (opcional)"
						fullWidth
						multiline
						minRows={2}
						margin="normal"
						size="small"
						sx={inputSx}
						value={notaPago}
						onChange={e => setNotaPago(e.target.value.slice(0, 500))}
						helperText="Usa este campo para justificar pagos cargados tarde en sistema."
					/>
					{Number(pagoInfo?.recargo_aplicado_usd || 0) > 0 && (
						<Box sx={{ mt: 0.4 }}>
							<label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#475569', fontSize: 14 }}>
								<input
									type="checkbox"
									checked={solicitaRevisionRecargo}
									onChange={(e) => setSolicitaRevisionRecargo(e.target.checked)}
								/>
								Solicitar revisión de recargo para este pago
							</label>
						</Box>
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

