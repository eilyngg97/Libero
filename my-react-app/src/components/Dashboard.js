import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList, PieChart, Pie } from 'recharts';
import { useSede } from '../context/SedeContext';
import { useDolar } from '../context/DolarContext';
import CakeIcon from '@mui/icons-material/Cake';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import GroupIcon from '@mui/icons-material/Group';
import LocationCityIcon from '@mui/icons-material/LocationCity';
import Avatar from '@mui/material/Avatar';
import Pagination from '@mui/material/Pagination';
import { exportToExcel } from '../utils/exportExcel';
import { mediaUrl } from '../utils/mediaUrl';

function Dashboard() {
  const apiBase = process.env.REACT_APP_API_URL || '';
  const mesActual = new Date().getMonth() + 1;
  const chartFillColors = ['#d92b73', '#f59e0b', '#2563eb', '#10b981'];
  const ingresosDonutColors = ['#2563eb', '#f28a3f'];
  const { setSedeSeleccionada } = useSede();
  const { dolar, loading: dolarLoading, error: dolarError } = useDolar();
  const navigate = useNavigate();
  const [sedes, setSedes] = useState([]);
  const [alumnosPorSede, setAlumnosPorSede] = useState({});
  const [cumpleaneros, setCumpleaneros] = useState([]);
  const [resumenMensualidades, setResumenMensualidades] = useState({ mes: null, anio: null, sedes: [] });
  const [dolaresPagadosPorSede, setDolaresPagadosPorSede] = useState({ mes: null, anio: null, sedes: [] });
  const [dolaresMesActual, setDolaresMesActual] = useState({ mes: null, anio: null, sedes: [] });
  const [ingresosUniformesMes, setIngresosUniformesMes] = useState(0);
  const [revisionPorSede, setRevisionPorSede] = useState({ mes: null, anio: null, sedes: [] });
  const [resumenLoading, setResumenLoading] = useState(false);
  const [dolaresLoading, setDolaresLoading] = useState(false);
  const [uniformesLoading, setUniformesLoading] = useState(false);
  const [revisionLoading, setRevisionLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [nuevosAlumnosMes, setNuevosAlumnosMes] = useState(0);
  const [resumenAlumnos, setResumenAlumnos] = useState({ total: 0, activos: 0, bajas: 0, becados: 0 });
  const [mesSeleccionado, setMesSeleccionado] = useState(mesActual);
  const [mesGraficaSeleccionado, setMesGraficaSeleccionado] = useState(mesActual);
  const [mesRevisionSeleccionado, setMesRevisionSeleccionado] = useState(mesActual);

  const fetchConSesion = async (url, options = {}, retryOn401 = true) => {
    const token = localStorage.getItem('token');
    const headers = {
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    };

    let res = await fetch(url, { ...options, headers });

    if (retryOn401 && res.status === 401) {
      await new Promise((resolve) => setTimeout(resolve, 300));
      const tokenRetry = localStorage.getItem('token');
      const headersRetry = {
        ...(options.headers || {}),
        ...(tokenRetry ? { Authorization: `Bearer ${tokenRetry}` } : {})
      };
      res = await fetch(url, { ...options, headers: headersRetry });
    }

    return res;
  };

  const esAlumnoDeBaja = (alumno) => Boolean(
    alumno?.dado_de_baja === true ||
    alumno?.activo === false ||
    String(alumno?.estado || '').trim().toLowerCase() === 'baja' ||
    String(alumno?.estado || '').trim().toLowerCase() === 'inactivo'
  );

  const esAlumnoBecado = (alumno) => String(alumno?.tipo_mensualidad || '').trim().toLowerCase() === 'beca_completa';

  const mesesAnio = [
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' }
  ];
  const mesActualLabel = mesesAnio.find((mes) => mes.value === mesActual)?.label || 'Mes actual';
  // Paginación para cumpleañeros
  const [cumplePage, setCumplePage] = useState(1);
  const cumplePorPagina = 10;
  const totalPaginasCumple = Math.ceil(cumpleaneros.length / cumplePorPagina);
  const cumpleanerosPagina = cumpleaneros.slice((cumplePage - 1) * cumplePorPagina, cumplePage * cumplePorPagina);
console.log('Cumpleañeros en página:', cumpleanerosPagina);

  useEffect(() => {
    const fetchCumpleaneros = async () => {
      try {
        const res = await fetchConSesion(`${apiBase}/api/cumpleaneros/mes`);
        let data = await res.json();
        if (res.ok && Array.isArray(data)) {
          // Ordenar de mayor a menor día del mes (descendente)
          const cumpleOrdenados = data.slice().sort((a, b) => {
            if (!a.fecha_nacimiento || !b.fecha_nacimiento) return 0;
            const getDiaMes = fecha => {
              const d = new Date(fecha);
              const parts = new Intl.DateTimeFormat('es-VE', {
                day: '2-digit',
                month: '2-digit',
                timeZone: 'America/Caracas'
              }).formatToParts(d);
              const dia = parseInt(parts.find(p => p.type === 'day').value, 10);
              const mes = parseInt(parts.find(p => p.type === 'month').value, 10);
              return { dia, mes };
            };
            const aDM = getDiaMes(a.fecha_nacimiento);
            const bDM = getDiaMes(b.fecha_nacimiento);
            if (aDM.mes !== bDM.mes) return  aDM.mes - bDM.mes;
            return aDM.dia - bDM.dia;
          });
          setCumpleaneros(cumpleOrdenados);
        } else setCumpleaneros([]);
      } catch {
        setCumpleaneros([]);
      }
    };
    fetchCumpleaneros();
  }, []);

  useEffect(() => {
    const fetchSedes = async () => {
      try {
        const res = await fetchConSesion(`${apiBase}/api/sedes`);
        const data = await res.json();
        if (res.ok) setSedes(data);
        else setSedes([]);
      } catch {
        setSedes([]);
      }
    };
    fetchSedes();
  }, []);

  useEffect(() => {
    const fetchAlumnosCount = async () => {
      try {
        const res = await fetchConSesion(`${apiBase}/api/alumnos/count-by-sede`);
        const data = await res.json();
        if (res.ok && Array.isArray(data)) {
          // data: [{ _id: 'Sede Principal', count: 10 }, ...]
          const map = {};
          data.forEach(item => {
            map[item._id] = item.count;
          });
          setAlumnosPorSede(map);
        } else {
          setAlumnosPorSede({});
        }
      } catch {
        setAlumnosPorSede({});
      }
    };
    fetchAlumnosCount();
  }, []);

  useEffect(() => {
    const fetchNuevosAlumnosMes = async () => {
      try {
        const res = await fetchConSesion(`${apiBase}/api/alumnos?incluirBajas=1`);
        const data = await res.json();
        if (!res.ok || !Array.isArray(data)) {
          setNuevosAlumnosMes(0);
          setResumenAlumnos({ total: 0, activos: 0, bajas: 0, becados: 0 });
          return;
        }

        const total = data.length;
        const activos = data.filter((alumno) => !esAlumnoDeBaja(alumno)).length;
        const bajas = data.filter((alumno) => esAlumnoDeBaja(alumno)).length;
        const becados = data.filter((alumno) => esAlumnoBecado(alumno)).length;
        setResumenAlumnos({ total, activos, bajas, becados });

        const ahora = new Date();
        const mesActualLocal = ahora.getMonth();
        const anioActualLocal = ahora.getFullYear();

        const nuevosEsteMes = data.reduce((acc, alumno) => {
          if (alumno?.activo === false) return acc;
          const fechaCreacion = alumno?.createdAt ? new Date(alumno.createdAt) : null;
          if (!fechaCreacion || Number.isNaN(fechaCreacion.getTime())) return acc;
          if (fechaCreacion.getMonth() === mesActualLocal && fechaCreacion.getFullYear() === anioActualLocal) {
            return acc + 1;
          }
          return acc;
        }, 0);

        setNuevosAlumnosMes(nuevosEsteMes);
      } catch {
        setNuevosAlumnosMes(0);
        setResumenAlumnos({ total: 0, activos: 0, bajas: 0, becados: 0 });
      }
    };

    fetchNuevosAlumnosMes();
  }, [apiBase]);

  useEffect(() => {
    const fetchResumenMensualidades = async () => {
      setResumenLoading(true);
      try {
        const anioActual = new Date().getFullYear();
        const res = await fetchConSesion(
          `${apiBase}/api/mensualidades/resumen-por-sede?mes=${mesSeleccionado}&anio=${anioActual}`
        );
        const data = await res.json();
        if (res.ok && data && Array.isArray(data.sedes)) {
          setResumenMensualidades(data);
        } else {
          setResumenMensualidades({ mes: null, anio: null, sedes: [] });
        }
      } catch {
        setResumenMensualidades({ mes: null, anio: null, sedes: [] });
      } finally {
        setResumenLoading(false);
      }
    };
    fetchResumenMensualidades();
  }, [mesSeleccionado]);

  useEffect(() => {
    const fetchDolaresPagadosPorSede = async () => {
      setDolaresLoading(true);
      try {
        const anioActual = new Date().getFullYear();
        const res = await fetchConSesion(
          `${apiBase}/api/mensualidades/dolares-pagados-por-sede?mes=${mesGraficaSeleccionado}&anio=${anioActual}`
        );
        const data = await res.json();
        if (res.ok && data && Array.isArray(data.sedes)) {
          setDolaresPagadosPorSede(data);
        } else {
          setDolaresPagadosPorSede({ mes: mesGraficaSeleccionado, anio: anioActual, sedes: [] });
        }
      } catch {
        setDolaresPagadosPorSede({ mes: mesGraficaSeleccionado, anio: new Date().getFullYear(), sedes: [] });
      } finally {
        setDolaresLoading(false);
      }
    };

    fetchDolaresPagadosPorSede();
  }, [mesGraficaSeleccionado]);

  useEffect(() => {
    const fetchDolaresMesActual = async () => {
      try {
        const anioActual = new Date().getFullYear();
        const res = await fetchConSesion(
          `${apiBase}/api/mensualidades/dolares-pagados-por-sede?mes=${mesActual}&anio=${anioActual}`
        );
        const data = await res.json();
        if (res.ok && data && Array.isArray(data.sedes)) {
          setDolaresMesActual(data);
        } else {
          setDolaresMesActual({ mes: mesActual, anio: anioActual, sedes: [] });
        }
      } catch {
        setDolaresMesActual({ mes: mesActual, anio: new Date().getFullYear(), sedes: [] });
      }
    };

    fetchDolaresMesActual();
  }, [apiBase, mesActual]);

  useEffect(() => {
    const fetchIngresosUniformesMes = async () => {
      setUniformesLoading(true);
      try {
        const anioActual = new Date().getFullYear();
        const res = await fetchConSesion(`${apiBase}/api/uniformes/pedidos`);
        const data = await res.json();

        if (!res.ok || !Array.isArray(data)) {
          setIngresosUniformesMes(0);
          return;
        }

        const totalUniformes = data.reduce((accPedidos, pedido) => {
          const pagosHistorial = Array.isArray(pedido?.pagos_historial) ? pedido.pagos_historial : [];

          const montoHistorialMes = pagosHistorial.reduce((accPagos, pago) => {
            if (!fechaPerteneceMesAnio(pago?.fecha_pago, mesGraficaSeleccionado, anioActual)) return accPagos;
            return accPagos + (Number(pago?.monto_pagado) || 0);
          }, 0);

          const esPagoEnRevision = String(pedido?.estado || '').toLowerCase() === 'pago_en_revision';
          const montoEnRevisionMes = esPagoEnRevision && fechaPerteneceMesAnio(pedido?.fecha_pago, mesGraficaSeleccionado, anioActual)
            ? (Number(pedido?.monto_ultimo_pago) || 0)
            : 0;

          return accPedidos + montoHistorialMes + montoEnRevisionMes;
        }, 0);

        setIngresosUniformesMes(totalUniformes);
      } catch {
        setIngresosUniformesMes(0);
      } finally {
        setUniformesLoading(false);
      }
    };

    fetchIngresosUniformesMes();
  }, [apiBase, mesGraficaSeleccionado]);

  useEffect(() => {
    const fetchRevisionPorSede = async () => {
      setRevisionLoading(true);
      try {
        const anioActual = new Date().getFullYear();
        const res = await fetchConSesion(
          `${process.env.REACT_APP_API_URL}/api/mensualidades/resumen-por-sede?mes=${mesRevisionSeleccionado}&anio=${anioActual}`
        );
        const data = await res.json();
        if (res.ok && data && Array.isArray(data.sedes)) {
          setRevisionPorSede(data);
        } else {
          setRevisionPorSede({ mes: mesRevisionSeleccionado, anio: anioActual, sedes: [] });
        }
      } catch {
        setRevisionPorSede({ mes: mesRevisionSeleccionado, anio: new Date().getFullYear(), sedes: [] });
      } finally {
        setRevisionLoading(false);
      }
    };

    fetchRevisionPorSede();
  }, [mesRevisionSeleccionado]);
  const formatDolar = (value) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
    return Number(value).toFixed(2);
  };

  const formatMoney = (value) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
    return Number(value).toFixed(2);
  };

  const formatMontoBarra = (value) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '$0';
    return `$${Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  };

  const formatFechaNacimiento = (iso) => {
    if (!iso) return '';
    const base = iso.substring(0, 10);
    const parts = base.split('-');
    if (parts.length !== 3) return '';
    const [anio, mes, dia] = parts;
    return `${dia}/${mes}/${anio}`;
  };

  const calcularEdad = (fecha) => {
    if (!fecha) return '';
    const base = fecha.substring(0, 10);
    const parts = base.split('-');
    if (parts.length !== 3) return '';
    const [anio, mes, dia] = parts.map(Number);
    const nacimiento = new Date(anio, mes - 1, dia);
    if (Number.isNaN(nacimiento.getTime())) return '';
    const hoy = new Date();
    let edad = hoy.getFullYear() - nacimiento.getFullYear();
    const m = hoy.getMonth() - nacimiento.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) {
      edad -= 1;
    }
    return edad;
  };

  const formatDiaMes = (fecha) => {
    if (!fecha) return { dia: '--', mes: '--' };
    const [, mes, dia] = fecha.substring(0, 10).split('-');
    const meses = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    const mesIdx = parseInt(mes, 10) - 1;
    return {
      dia: dia,
      mes: meses[mesIdx] || '--'
    };
  };

  const parseFechaSinDesfase = (fecha) => {
    if (!fecha) return null;
    if (fecha instanceof Date) {
      return Number.isNaN(fecha.getTime()) ? null : fecha;
    }

    const raw = String(fecha).trim();
    const fechaBase = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
    if (fechaBase) {
      const year = Number(fechaBase[1]);
      const month = Number(fechaBase[2]) - 1;
      const day = Number(fechaBase[3]);
      const localDate = new Date(year, month, day);
      return Number.isNaN(localDate.getTime()) ? null : localDate;
    }

    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  };

  const fechaPerteneceMesAnio = (fecha, mes, anio) => {
    const parsed = parseFechaSinDesfase(fecha);
    if (!parsed) return false;
    return parsed.getMonth() + 1 === Number(mes) && parsed.getFullYear() === Number(anio);
  };

  const handleExportExcel = async () => {
    setExportLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos`);
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) {
        throw new Error('Respuesta inválida');
      }
      const alumnosFiltrados = data.filter((al) => {
        const sedeNombre = (al.sede?.nombre || '').toLowerCase().trim();
        return sedeNombre !== 'sede desarrollo' && al.activo !== false;
      });

      const toDateBase = (fecha) => {
        if (!fecha) return null;
        const base = fecha.substring(0, 10);
        const parts = base.split('-');
        if (parts.length !== 3) return null;
        const [anio, mes, dia] = parts.map(Number);
        const d = new Date(anio, mes - 1, dia);
        return Number.isNaN(d.getTime()) ? null : d;
      };

      const alumnosOrdenados = alumnosFiltrados.slice().sort((a, b) => {
        const aDate = toDateBase(a.fecha_nacimiento);
        const bDate = toDateBase(b.fecha_nacimiento);
        if (!aDate && !bDate) return 0;
        if (!aDate) return 1;
        if (!bDate) return -1;
        return bDate - aDate;
      });

      const calcularEdad = (fecha) => {
        if (!fecha) return '';
        const base = fecha.substring(0, 10);
        const parts = base.split('-');
        if (parts.length !== 3) return '';
        const [anio, mes, dia] = parts.map(Number);
        const nacimiento = new Date(anio, mes - 1, dia);
        if (Number.isNaN(nacimiento.getTime())) return '';
        const hoy = new Date();
        let edad = hoy.getFullYear() - nacimiento.getFullYear();
        const m = hoy.getMonth() - nacimiento.getMonth();
        if (m < 0 || (m === 0 && hoy.getDate() < nacimiento.getDate())) {
          edad -= 1;
        }
        return edad;
      };

      const rows = alumnosOrdenados.map((al) => ({
        'Nombre': al.nombres || '',
        'Apellido': al.apellidos || '',
        'Cédula': al.cedula || '',
        'Categoría': al.categoria || '',
        'División': al.division || '-',
        'Nro de franela': (al.numero_franela ?? '-') || '-',
        'Edad': calcularEdad(al.fecha_nacimiento),
        'Fecha de nacimiento': formatFechaNacimiento(al.fecha_nacimiento),
        'Sede': al.sede?.nombre || ''
      }));

      const headers = ['Nombre', 'Apellido', 'Cédula', 'Categoría', 'División', 'Nro de franela', 'Edad', 'Fecha de nacimiento', 'Sede'];
      const fecha = new Date().toISOString().slice(0, 10);
      await exportToExcel(rows, `alumnos_${fecha}.xlsx`, headers);
    } catch (error) {
      console.error('Error al exportar Excel:', error);
      window.alert('No se pudo exportar el archivo Excel. Intenta nuevamente.');
    } finally {
      setExportLoading(false);
    }
  };

  const handleSedeClick = (sede) => {
    setSedeSeleccionada(sede);
    navigate('/panelOpciones');
  };

  const handleVerTodasSedes = () => {
    setSedeSeleccionada(null);
    navigate('/panelOpciones');
  };

  const handleVerDetallesCobro = (sedeResumen) => {
    const sedeMatch = sedes.find((sede) => sede._id === sedeResumen.sedeId);
    const sedeSeleccion = sedeMatch || {
      _id: sedeResumen.sedeId,
      nombre: sedeResumen.sedeNombre
    };
    setSedeSeleccionada(sedeSeleccion);
    navigate('/mensualidades');
  };
  const getProgressStatus = (progress) => {
    if (progress >= 80) return 'Excelente';
    if (progress >= 50) return 'Estable';
    if (progress >= 20) return 'Bajo';
    return 'Crítico';
  };

  const normalizarClaveRevision = (valor) => String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '_');

  const sedesRevisionOrdenadas = (revisionPorSede.sedes || [])
    .map((sede) => {
      const totalDesdeEstatuses = Array.isArray(sede.estatuses)
        ? sede.estatuses.reduce((acc, item) => {
            const clave = normalizarClaveRevision(item?.estatus);
            if (clave === 'en_revision') {
              return acc + (Number(item?.count) || 0);
            }
            return acc;
          }, 0)
        : 0;

      return {
        sedeId: sede.sedeId,
        sedeNombre: sede.sedeNombre,
        enRevision: Number(
          sede.enRevision ||
          sede.en_revision ||
          sede.en_revision_count ||
          sede['en revision'] ||
          sede['en_revision'] ||
          sede['en revisión'] ||
          totalDesdeEstatuses
        )
      };
    })
    .sort((a, b) => b.enRevision - a.enRevision);

  const totalEnRevision = sedesRevisionOrdenadas.reduce((acc, sede) => acc + sede.enRevision, 0);
  const totalIngresosMensualidadesMes = (dolaresPagadosPorSede.sedes || []).reduce(
    (acc, sede) => acc + Number(sede.monto_pagado || 0),
    0
  );
  const totalIngresosMes = totalIngresosMensualidadesMes + ingresosUniformesMes;
  const mesIngresosLabel = mesesAnio.find((mes) => mes.value === mesGraficaSeleccionado)?.label || 'mes';
  const ingresosDonutData = [
    { name: 'Mensualidades', value: totalIngresosMensualidadesMes },
    { name: 'Uniformes', value: ingresosUniformesMes }
  ];
  const variacionAlumnosReal = `+${nuevosAlumnosMes} este mes`;

  return (
    <div className="dashboard-container">
      <div className="dashboard-header-row">
        <div className="dashboard-header-copy">
          <h2>Bienvenido, Admin</h2>
          <p>Resumen de la actividad en tu academia · {mesActualLabel} {new Date().getFullYear()}</p>
        </div>
        <button
          type="button"
          className="dashboard-export-btn"
          onClick={handleExportExcel}
          disabled={exportLoading}
        >
          {exportLoading ? 'Exportando...' : 'Exportar nómina completa'}
        </button>
      </div>
      <div className="dashboard-quick-access">
        <div className="dashboard-left">
          <div className="dashboard-kpis-inline-row">
            <div className="dashboard-kpi-inline-card">
              <div className="dashboard-kpi-inline-top">
                <div className="dashboard-kpi-inline-icon dashboard-kpi-inline-icon-blue">
                  <GroupIcon sx={{ fontSize: 16 }} />
                </div>
                <span className="dashboard-kpi-inline-change">{variacionAlumnosReal}</span>
              </div>
              <div className="dashboard-kpi-inline-label">Total de alumnos</div>
              <div className="dashboard-kpi-inline-value">{resumenAlumnos.total}</div>
              <div className="dashboard-kpi-inline-sub">Activos, bajas y becados</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                <div style={{ padding: '6px 10px', borderRadius: 999, background: '#ecfdf5', color: '#166534', fontSize: 14, fontWeight: 800 }}>
                  Activos: {resumenAlumnos.activos}
                </div>
                <div style={{ padding: '6px 10px', borderRadius: 999, background: '#fef2f2', color: '#991b1b', fontSize: 14, fontWeight: 800 }}>
                  Baja: {resumenAlumnos.bajas}
                </div>
                <div style={{ padding: '6px 10px', borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', fontSize: 14, fontWeight: 800 }}>
                  Becados: {resumenAlumnos.becados}
                </div>
              </div>
            </div>

            <div className="dashboard-kpi-inline-card">
              <div className="dashboard-kpi-inline-top">
                <div className="dashboard-kpi-inline-icon dashboard-kpi-inline-icon-green">
                  <AttachMoneyIcon sx={{ fontSize: 16 }} />
                </div>
              </div>
              <div className="dashboard-kpi-inline-label">Tasa del dólar BCV</div>
              {dolarLoading && <div className="dashboard-kpi-inline-loading">Cargando...</div>}
              {dolarError && <div className="dashboard-kpi-inline-loading">No disponible</div>}
              {!dolarLoading && !dolarError && (
                <>
                  <div className="dashboard-kpi-inline-value">Bs. {formatDolar(dolar?.promedio)}</div>
                  <div className="dashboard-kpi-inline-sub">Actualizado hoy, 00:00</div>
                </>
              )}
            </div>

            <div className="dashboard-kpi-inline-card">
              <div className="dashboard-kpi-inline-top">
                <div className="dashboard-kpi-inline-icon dashboard-kpi-inline-icon-orange">
                  <AttachMoneyIcon sx={{ fontSize: 16 }} />
                </div>
              </div>
              <div className="dashboard-kpi-inline-label">Ingresos del mes</div>
              {dolaresLoading || uniformesLoading ? (
                <div className="dashboard-kpi-inline-loading">Cargando...</div>
              ) : (
                <>
                  <div className="dashboard-kpi-inline-income-row">
                    <div className="dashboard-kpi-inline-value dashboard-kpi-inline-value-income">${formatMontoBarra(totalIngresosMes).replace('$', '')}</div>
                    <div className="dashboard-kpi-inline-donut">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={ingresosDonutData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={19}
                            outerRadius={29}
                            paddingAngle={2}
                            stroke="none"
                          >
                            {ingresosDonutData.map((_, index) => (
                              <Cell key={`ingresos-donut-${index}`} fill={ingresosDonutColors[index % ingresosDonutColors.length]} />
                            ))}
                          </Pie>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="dashboard-kpi-inline-breakdown-list">
                    <div className="dashboard-kpi-inline-sub dashboard-kpi-inline-sub-legend">
                      <span className="dashboard-kpi-inline-dot dashboard-kpi-inline-dot-mensualidades" />
                      Mensualidades: ${formatMoney(totalIngresosMensualidadesMes)}
                    </div>
                    <div className="dashboard-kpi-inline-sub dashboard-kpi-inline-sub-legend">
                      <span className="dashboard-kpi-inline-dot dashboard-kpi-inline-dot-uniformes" />
                      Uniformes: ${formatMoney(ingresosUniformesMes)}
                    </div>
                  </div>
                  <div className="dashboard-kpi-inline-sub">USD recaudados en {mesIngresosLabel.toLowerCase()}</div>
                </>
              )}
            </div>
          </div>

          <div className="dashboard-top-grid">
            <div className="dashboard-card sedes-panel sedes-panel-card sedes-panel-compact">
              <div className="sedes-header">
                <h3>Gestión de Sedes</h3>
                <button type="button" className="sedes-link" onClick={handleVerTodasSedes}>
                  Ver todas
                </button>
              </div>
              <div className="sedes-list">
                {sedes.map((sede, idx) => (
                  <div key={idx} className="sede-item" onClick={() => handleSedeClick(sede)}>
                    <div className="sede-left">
                      <div className="sede-icon">
                        <LocationCityIcon />
                      </div>
                      <div className="sede-info">
                        <strong>{sede.nombre}</strong>
                        <span className="sede-direccion">{sede.direccion}</span>
                      </div>
                    </div>
                    <div className="sede-alumnos">
                      <span className="alumnos-count">{alumnosPorSede[sede._id] || 0}</span>
                      <span className="alumnos-label">ALUMNOS</span>
                    </div>
                  </div>
                ))}
              </div>
              <span className="sedes-tip">Haz clic en una sede para ver sus alumnos</span>
            </div>

            <div className="dashboard-card pagos-sede-panel">
              <div className="pagos-sede-header">
                <div className="pagos-sede-title-wrap">
                  <div className="pagos-sede-title-icon">$</div>
                  <div className="pagos-sede-title-block">
                    <h3>Dólares pagados por sede</h3>
                    <span className="pagos-sede-subtitle">Comparativa de ingresos por ubicación</span>
                  </div>
                </div>
                <select
                  className="pagos-sede-anio-select"
                  value={mesGraficaSeleccionado}
                  onChange={(event) => setMesGraficaSeleccionado(Number(event.target.value))}
                  aria-label="Filtrar dólares pagados por mes"
                >
                  {mesesAnio.map((mes) => (
                    <option key={mes.value} value={mes.value}>
                      {mes.label}
                    </option>
                  ))}
                </select>
              </div>

              {dolaresLoading ? (
                <div className="pagos-sede-empty">Cargando gráficas...</div>
              ) : dolaresPagadosPorSede.sedes.length === 0 ? (
                <div className="pagos-sede-empty">Sin pagos registrados para el mes seleccionado</div>
              ) : (
                <div className="pagos-sede-chart-wrap">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={dolaresPagadosPorSede.sedes.map((sede) => ({
                        sedeNombre: sede.sedeNombre,
                        monto_pagado: Number(sede.monto_pagado || 0)
                      }))}
                      margin={{ top: 26, right: 12, left: 8, bottom: 32 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                      <XAxis dataKey="sedeNombre" tick={{ fontSize: 11, fill: '#64748b' }} angle={-15} textAnchor="end" interval={0} height={60} />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#64748b' }}
                        domain={[0, (dataMax) => Math.max(10, Math.ceil(Number(dataMax || 0) * 1.15))]}
                      />
                      <Tooltip
                        formatter={(value) => [`$${formatMoney(value)}`, 'Pagado']}
                        labelFormatter={(label) => `Sede: ${label}`}
                      />
                      <Bar dataKey="monto_pagado" radius={[6, 6, 0, 0]}>
                        <LabelList
                          dataKey="monto_pagado"
                          position="top"
                          formatter={formatMontoBarra}
                          fill="#374151"
                          fontSize={12}
                          fontWeight={700}
                        />
                        {dolaresPagadosPorSede.sedes.map((_, index) => (
                          <Cell key={`bar-fill-${index}`} fill={chartFillColors[index % chartFillColors.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          <div className="finanzas-wrapper">
            <div className="finanzas-header">
              <h3>Resumen financiero del mes</h3>
              <select
                className="finanzas-mes-select"
                value={mesSeleccionado}
                onChange={(event) => setMesSeleccionado(Number(event.target.value))}
              >
                {mesesAnio.map((mes) => (
                  <option key={mes.value} value={mes.value}>
                    {mes.label}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ marginTop: 4 }}>
              {resumenLoading ? (
                <div style={{ color: '#888', fontSize: 13 }}>Cargando resumen...</div>
              ) : resumenMensualidades.sedes.length === 0 ? (
                <div style={{ color: '#888', fontSize: 13 }}>Sin datos para el mes en curso</div>
              ) : (
                <>
                  <div className="finanzas-cards">
                    {resumenMensualidades.sedes.map((sede) => {
                      const sedeMatch = sedes.find((item) => item._id === sede.sedeId);
                      const total = Number(sede.total || 0);
                      const pagado = Number(sede.pagado || 0);
                      const abono = Number(sede.abono || 0);
                      const recaudado = pagado + abono;
                      const noPagado = Number(sede.pendiente || 0) + Number(sede.insolvente || 0);
                      const progreso = total > 0 ? Math.round((recaudado / total) * 100) : 0;

                      return (
                        <div key={sede.sedeId || sede.sedeNombre} className="finanzas-card">
                          <div className="finanzas-card-top">
                            <div>
                              <div className="finanzas-sede-nombre">{sede.sedeNombre}</div>
                              {sedeMatch?.direccion && (
                                <div className="finanzas-sede-sub">{sedeMatch.direccion.toUpperCase()}</div>
                              )}
                            </div>
                            <div className="finanzas-icon">$
                            </div>
                          </div>
                          <div className="finanzas-progress-row">
                            <div className="progress-ring" style={{ '--progress': progreso }}>
                              <div className="progress-ring-inner">{progreso}%</div>
                            </div>
                            <div className="finanzas-progress-text">
                              <div className="finanzas-progress-label">PROGRESO DE COBRO</div>
                              <div className="finanzas-progress-status">
                                → {getProgressStatus(progreso)}
                              </div>
                            </div>
                          </div>
                          <div className="finanzas-montos">
                            <div className="finanzas-monto-row">
                              <span>Pagado</span>
                              <b>{pagado}</b>
                            </div>
                            <div className="finanzas-monto-row">
                              <span>No pagado</span>
                              <b className="finanzas-no-pagado">{noPagado}</b>
                            </div>
                            <div className="finanzas-monto-row">
                              <span>Abono</span>
                              <b className="finanzas-abono">{abono}</b>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="finanzas-btn"
                            onClick={() => handleVerDetallesCobro(sede)}
                          >
                            Ver Detalles de Cobranza
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="dashboard-right">
          <div className="dashboard-card revision-sede-panel">
            <div className="pagos-sede-header">
              <h3>Pagos en revisión</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select
                  className="pagos-sede-anio-select"
                  value={mesRevisionSeleccionado}
                  onChange={(event) => setMesRevisionSeleccionado(Number(event.target.value))}
                  aria-label="Filtrar pagos en revisión por mes"
                >
                  {mesesAnio.map((mes) => (
                    <option key={mes.value} value={mes.value}>
                      {mes.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {revisionLoading ? (
              <div className="pagos-sede-empty">Cargando estatus...</div>
            ) : sedesRevisionOrdenadas.length === 0 ? (
              <div className="pagos-sede-empty">Sin datos para el mes seleccionado</div>
            ) : (
              <div className="revision-list">
                {sedesRevisionOrdenadas.map((sede) => (
                  <div key={sede.sedeId || sede.sedeNombre} className="revision-item">
                    <span>{sede.sedeNombre}</span>
                    <b>{sede.enRevision}</b>
                  </div>
                ))}
              </div>
            )}
            <div className="revision-total-row">
              <span className="revision-total-label">Total en revisión:</span>
              <span className="revision-total-badge">{totalEnRevision}</span>
            </div>
            <button
              type="button"
              className="revision-cta-btn"
              onClick={() => navigate('/conciliacion-bancaria')}
            >
              Ir a conciliación bancaria
            </button>
          </div>

          <div className="dashboard-card cumple-card">
            <div style={{ marginTop: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
                <CakeIcon style={{ color: '#ff9800', fontSize: 28 }} />
                <span style={{ fontWeight: 600, fontSize: 18 }}>Cumpleaños del mes</span>
              </div>
              {cumpleaneros.length === 0 && <div style={{ color: '#888', fontSize: 15 }}>No hay cumpleaños este mes</div>}
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {cumpleanerosPagina.map((al, idx) => (
                  <li
                    key={al._id || idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      marginBottom: 10,
                      background: '#ffffff',
                      borderRadius: 16,
                      padding: '10px 12px',
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.04)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar src={mediaUrl(al.foto) || ''} alt={al.nombres} sx={{ width: 42, height: 42, fontSize: 18, bgcolor: '#f4c9b0' }}>
                        {(!al.foto && al.nombres) ? al.nombres[0] : ''}
                      </Avatar>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ fontWeight: 700, color: '#1f2937' }}>
                          {al.nombres} {al.apellidos}
                        </div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>
                          {al.sede?.nombre || 'Sin sede'}
                          {calcularEdad(al.fecha_nacimiento) !== '' ? ` · ${calcularEdad(al.fecha_nacimiento)} años` : ''}
                        </div>
                      </div>
                    </div>
                    <div
                      style={{
                        minWidth: 44,
                        padding: '6px 8px',
                        borderRadius: 12,
                        background: '#fff3e6',
                        color: '#ff7a00',
                        fontWeight: 800,
                        textAlign: 'center',
                        lineHeight: 1.1
                      }}
                    >
                      <div style={{ fontSize: 14 }}>{formatDiaMes(al.fecha_nacimiento).dia}</div>
                      <div style={{ fontSize: 10 }}>{formatDiaMes(al.fecha_nacimiento).mes}</div>
                    </div>
                  </li>
                ))}
              </ul>
              {totalPaginasCumple > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12 }}>
                  <Pagination
                    count={totalPaginasCumple}
                    page={cumplePage}
                    onChange={(_, value) => setCumplePage(value)}
                    color="primary"
                    shape="rounded"
                    size="small"
                    showFirstButton
                    showLastButton
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

}

export default Dashboard;
