import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';
import { useSede } from '../context/SedeContext';
import { useDolar } from '../context/DolarContext';
import CakeIcon from '@mui/icons-material/Cake';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import GroupIcon from '@mui/icons-material/Group';
import LocationCityIcon from '@mui/icons-material/LocationCity';
import Avatar from '@mui/material/Avatar';
import Pagination from '@mui/material/Pagination';
import { mediaUrl } from '../utils/mediaUrl';

function DashboardOperativo() {
  const apiBase = process.env.REACT_APP_API_URL || '';
  const navigate = useNavigate();
  const { setSedeSeleccionada } = useSede();
  const { dolar, loading: dolarLoading, error: dolarError } = useDolar();
  const [sedes, setSedes] = useState([]);
  const [alumnosPorSede, setAlumnosPorSede] = useState({});
  const [nuevosAlumnosMes, setNuevosAlumnosMes] = useState(0);
  const [cumpleaneros, setCumpleaneros] = useState([]);
  const [cumplePage, setCumplePage] = useState(1);

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

  useEffect(() => {
    const fetchSedes = async () => {
      try {
        const res = await fetchConSesion(`${apiBase}/api/sedes`);
        const data = await res.json();
        if (res.ok && Array.isArray(data)) {
          setSedes(data);
        } else {
          setSedes([]);
        }
      } catch {
        setSedes([]);
      }
    };

    fetchSedes();
  }, [apiBase]);

  useEffect(() => {
    const fetchAlumnosCount = async () => {
      try {
        const res = await fetchConSesion(`${apiBase}/api/alumnos/count-by-sede`);
        const data = await res.json();
        if (res.ok && Array.isArray(data)) {
          const map = {};
          data.forEach((item) => {
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
  }, [apiBase]);

  useEffect(() => {
    const fetchNuevosAlumnosMes = async () => {
      try {
        const res = await fetchConSesion(`${apiBase}/api/alumnos`);
        const data = await res.json();
        if (!res.ok || !Array.isArray(data)) {
          setNuevosAlumnosMes(0);
          return;
        }

        const ahora = new Date();
        const mesActual = ahora.getMonth();
        const anioActual = ahora.getFullYear();

        const total = data.reduce((acc, alumno) => {
          if (alumno?.activo === false) return acc;
          const fechaCreacion = alumno?.createdAt ? new Date(alumno.createdAt) : null;
          if (!fechaCreacion || Number.isNaN(fechaCreacion.getTime())) return acc;
          if (fechaCreacion.getMonth() === mesActual && fechaCreacion.getFullYear() === anioActual) {
            return acc + 1;
          }
          return acc;
        }, 0);

        setNuevosAlumnosMes(total);
      } catch {
        setNuevosAlumnosMes(0);
      }
    };

    fetchNuevosAlumnosMes();
  }, [apiBase]);

  useEffect(() => {
    const fetchCumpleaneros = async () => {
      try {
        const res = await fetchConSesion(`${apiBase}/api/cumpleaneros/mes`);
        const data = await res.json();
        if (res.ok && Array.isArray(data)) {
          const cumpleOrdenados = data.slice().sort((a, b) => {
            if (!a.fecha_nacimiento || !b.fecha_nacimiento) return 0;
            const getDiaMes = (fecha) => {
              const d = new Date(fecha);
              const parts = new Intl.DateTimeFormat('es-VE', {
                day: '2-digit',
                month: '2-digit',
                timeZone: 'America/Caracas'
              }).formatToParts(d);
              const dia = parseInt(parts.find((p) => p.type === 'day').value, 10);
              const mes = parseInt(parts.find((p) => p.type === 'month').value, 10);
              return { dia, mes };
            };
            const aDM = getDiaMes(a.fecha_nacimiento);
            const bDM = getDiaMes(b.fecha_nacimiento);
            if (aDM.mes !== bDM.mes) return aDM.mes - bDM.mes;
            return aDM.dia - bDM.dia;
          });
          setCumpleaneros(cumpleOrdenados);
        } else {
          setCumpleaneros([]);
        }
      } catch {
        setCumpleaneros([]);
      }
    };

    fetchCumpleaneros();
  }, [apiBase]);

  const formatDolar = (value) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '-';
    return Number(value).toFixed(2);
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
      dia,
      mes: meses[mesIdx] || '--'
    };
  };

  const handleSedeClick = (sede) => {
    setSedeSeleccionada(sede);
    navigate('/panelOpciones');
  };

  const handleVerTodasSedes = () => {
    setSedeSeleccionada(null);
    navigate('/panelOpciones');
  };

  const handleVerInsolventes = () => {
    navigate('/mensualidades/insolventes');
  };

  const totalAlumnos = Object.values(alumnosPorSede).reduce((acc, val) => acc + (Number(val) || 0), 0);
  const variacionAlumnosReal = `+${nuevosAlumnosMes} este mes`;
  const monedaActiva = String(dolar?.moneda || 'USD').toUpperCase() === 'EUR' ? 'EUR' : 'USD';
  const nombreMonedaActiva = monedaActiva === 'EUR' ? 'euro' : 'dolar';
  const cumplePorPagina = 8;
  const totalPaginasCumple = Math.ceil(cumpleaneros.length / cumplePorPagina);
  const cumpleanerosPagina = cumpleaneros.slice((cumplePage - 1) * cumplePorPagina, cumplePage * cumplePorPagina);

  return (
    <div className="dashboard-container">
      <div className="dashboard-quick-access">
        <div className="dashboard-left">
          <div className="dashboard-kpis-inline-row" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
            <div className="dashboard-kpi-inline-card">
              <div className="dashboard-kpi-inline-top">
                <div className="dashboard-kpi-inline-icon dashboard-kpi-inline-icon-blue">
                  <GroupIcon sx={{ fontSize: 16 }} />
                </div>
                <span className="dashboard-kpi-inline-change">{variacionAlumnosReal}</span>
              </div>
              <div className="dashboard-kpi-inline-label">Total de alumnos</div>
              <div className="dashboard-kpi-inline-value">{totalAlumnos}</div>
              <div className="dashboard-kpi-inline-sub">Activos en la academia</div>
            </div>

            <div className="dashboard-kpi-inline-card">
              <div className="dashboard-kpi-inline-top">
                <div className="dashboard-kpi-inline-icon dashboard-kpi-inline-icon-green">
                  <AttachMoneyIcon sx={{ fontSize: 16 }} />
                </div>
              </div>
              <div className="dashboard-kpi-inline-label">Tasa del {nombreMonedaActiva} BCV</div>
              {dolarLoading && <div className="dashboard-kpi-inline-loading">Cargando...</div>}
              {dolarError && <div className="dashboard-kpi-inline-loading">No disponible</div>}
              {!dolarLoading && !dolarError && (
                <>
                  <div className="dashboard-kpi-inline-value">Bs. {formatDolar(dolar?.promedio)}</div>
                  <div className="dashboard-kpi-inline-sub">Actualizado hoy, 00:00</div>
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
                {sedes.map((sede) => (
                  <div key={sede._id} className="sede-item" onClick={() => handleSedeClick(sede)}>
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

            <div
              className="dashboard-card"
              style={{
                padding: 16,
                border: '1px solid #e2e8f0',
                borderRadius: 16,
                cursor: 'pointer',
                width: '100%',
                maxWidth: '100%',
                minWidth: 0,
                boxSizing: 'border-box'
              }}
              onClick={handleVerInsolventes}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleVerInsolventes();
                }
              }}
              role="button"
              tabIndex={0}
            >
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 12, width: '100%' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontSize: 16, color: '#0f172a' }}>Mensualidades insolventes</h3>
                  <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 13 }}>
                    Abre una vista dedicada con las mensualidades en estado insolvente.
                  </p>
                </div>
                <button
                  type="button"
                  className="sedes-link"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleVerInsolventes();
                  }}
                  style={{ justifySelf: 'end', marginLeft: 0, flexShrink: 0, alignSelf: 'center' }}
                >
                  Ver insolventes
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="dashboard-right">
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
                        {al.tipo === 'entrenador' && (
                          <span style={{ alignSelf: 'flex-start', padding: '2px 6px', borderRadius: 8, background: '#e8f3ff', color: '#1976d2', fontSize: 10, fontWeight: 700 }}>
                            Entrenador
                          </span>
                        )}
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

export default DashboardOperativo;
