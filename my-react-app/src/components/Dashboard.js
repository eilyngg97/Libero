import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { useSede } from '../context/SedeContext';
import { useDolar } from '../context/DolarContext';
import CakeIcon from '@mui/icons-material/Cake';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import GroupIcon from '@mui/icons-material/Group';
import LocationCityIcon from '@mui/icons-material/LocationCity';
import Avatar from '@mui/material/Avatar';
import Pagination from '@mui/material/Pagination';
import { exportToCsv } from '../utils/exportCsv';

function Dashboard() {
  const { setSedeSeleccionada } = useSede();
  const { dolar, loading: dolarLoading, error: dolarError } = useDolar();
  const navigate = useNavigate();
  const [sedes, setSedes] = useState([]);
  const [alumnosPorSede, setAlumnosPorSede] = useState({});
  const [cumpleaneros, setCumpleaneros] = useState([]);
  const [resumenMensualidades, setResumenMensualidades] = useState({ mes: null, anio: null, sedes: [] });
  const [resumenLoading, setResumenLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  // Paginación para cumpleañeros
  const [cumplePage, setCumplePage] = useState(1);
  const cumplePorPagina = 10;
  const totalPaginasCumple = Math.ceil(cumpleaneros.length / cumplePorPagina);
  const cumpleanerosPagina = cumpleaneros.slice((cumplePage - 1) * cumplePorPagina, cumplePage * cumplePorPagina);
console.log('Cumpleañeros en página:', cumpleanerosPagina);
  useEffect(() => {
    const fetchCumpleaneros = async () => {
      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/cumpleaneros/mes`);
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
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/sedes`);
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
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/alumnos/count-by-sede`);
        const data = await res.json();
        console.log(data);
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
    const fetchResumenMensualidades = async () => {
      setResumenLoading(true);
      try {
        const res = await fetch(`${process.env.REACT_APP_API_URL}/api/mensualidades/resumen-por-sede`);
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
  }, []);
  const dataFinanzas = [
    { name: 'Ingresos', monto: 12500 },
    { name: 'Egresos', monto: 7200 },
    { name: 'Balance', monto: 5300 },
  ];

  const formatDolar = (value) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
    return Number(value).toFixed(2);
  };

  const formatFecha = (iso) => {
    if (!iso) return '-';
    const date = new Date(iso);
    return new Intl.DateTimeFormat('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'America/Caracas'
    }).format(date);
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
    return `${Number(value).toFixed(1)}%`;
  };

  const formatMoney = (value) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
    return Number(value).toFixed(2);
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
    const [anio, mes, dia] = fecha.substring(0, 10).split('-');
    const meses = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    const mesIdx = parseInt(mes, 10) - 1;
    return {
      dia: dia,
      mes: meses[mesIdx] || '--'
    };
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
        'Edad': calcularEdad(al.fecha_nacimiento),
        'Fecha de nacimiento': formatFechaNacimiento(al.fecha_nacimiento),
        'Sede': al.sede?.nombre || ''
      }));

      const headers = ['Nombre', 'Apellido', 'Cédula', 'Edad', 'Fecha de nacimiento', 'Sede'];
      const fecha = new Date().toISOString().slice(0, 10);
      exportToCsv(rows, `alumnos_${fecha}.csv`, headers);
    } catch (error) {
      console.error('Error al exportar CSV:', error);
      window.alert('No se pudo exportar el archivo CSV. Intenta nuevamente.');
    } finally {
      setExportLoading(false);
    }
  };

  const handleSedeClick = (sede) => {
    setSedeSeleccionada(sede);
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

  const resumenTotales = resumenMensualidades.sedes.reduce(
    (acc, sede) => {
      acc.total += Number(sede.total || 0);
      acc.pagado += Number(sede.pagado || 0);
      acc.abono += Number(sede.abono || 0);
      return acc;
    },
    { total: 0, pagado: 0, abono: 0 }
  );
  const porcentajePagado = resumenTotales.total > 0 ? (resumenTotales.pagado / resumenTotales.total) * 100 : 0;
  const porcentajeAbono = resumenTotales.total > 0 ? (resumenTotales.abono / resumenTotales.total) * 100 : 0;
  const porcentajeNoPagado = resumenTotales.total > 0 ? Math.max(0, 100 - porcentajePagado - porcentajeAbono) : 0;

  const getProgressStatus = (progress) => {
    if (progress >= 80) return 'Excelente';
    if (progress >= 50) return 'Estable';
    if (progress >= 20) return 'Bajo';
    return 'Crítico';
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-header-row">
          <h2>Bienvenido al Dashboard</h2>
        <div className="dashboard-card small-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 52, height: 52, borderRadius: 12, background: '#fff2e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <GroupIcon style={{ color: '#ff7a00', fontSize: 28 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h3 style={{ margin: 0 }}>Total de alumnos</h3>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#1e293b' }}>
                {Object.values(alumnosPorSede).reduce((acc, val) => acc + (Number(val) || 0), 0)}
              </div>
              <div style={{ fontSize: 12, color: '#555' }}>
                Total en la academia
              </div>
            </div>
          </div>
        </div>
        <div className="dashboard-card small-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 52, height: 52, borderRadius: 12, background: '#e9f8ef', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <AttachMoneyIcon style={{ color: '#16a34a', fontSize: 28 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h3 style={{ margin: 0 }}>Tasa del dólar BCV</h3>
              {dolarLoading && <div style={{ color: '#888', fontSize: 13 }}>Cargando...</div>}
              {dolarError && <div style={{ color: '#d32f2f', fontSize: 13 }}>No disponible</div>}
              {!dolarLoading && !dolarError && (
                <>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#1e293b' }}>
                    {formatDolar(dolar?.promedio)}
                  </div>
                  <div style={{ fontSize: 12, color: '#555' }}>
                    Actualizado: {formatFecha(dolar?.fechaActualizacion)}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <div>
        <button
            type="button"
            className="dashboard-export-btn"
            onClick={handleExportExcel}
            disabled={exportLoading}
          >
            {exportLoading ? 'Exportando...' : 'Exportar nomina completa'}
          </button>
      </div>
      <div className="dashboard-quick-access">
        <div className="dashboard-left">
          <div className="dashboard-card sedes-panel">
            <div className="sedes-header">
              <h3>Gestion de Sedes</h3>
              <button type="button" className="sedes-link" onClick={() => navigate('/sedes')}>
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
          <div className="finanzas-wrapper">
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
                      const noPagado = Number(sede.pendiente || 0) + Number(sede.retrasado || 0);
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
                    <Avatar src={al.foto || ''} alt={al.nombres} sx={{ width: 42, height: 42, fontSize: 18, bgcolor: '#f4c9b0' }}>
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
  );
}

export default Dashboard;
