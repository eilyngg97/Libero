import React from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Avatar from '@mui/material/Avatar';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import SecurityOutlinedIcon from '@mui/icons-material/SecurityOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import EmailOutlinedIcon from '@mui/icons-material/EmailOutlined';
import WhatsAppIcon from '@mui/icons-material/WhatsApp';
import EastIcon from '@mui/icons-material/East';
import Groups2OutlinedIcon from '@mui/icons-material/Groups2Outlined';

function MiPerfil() {
  const apiBase = React.useMemo(() => (process.env.REACT_APP_API_URL || window.location.origin).replace(/\/$/, ''), []);
  const token = localStorage.getItem('token') || '';

  const [usuario, setUsuario] = React.useState(null);
  const [error, setError] = React.useState('');
  const [successMessage, setSuccessMessage] = React.useState('');
  // Facturacion abre por defecto cada vez que se monta la pantalla.
  const [seccionActiva, setSeccionActiva] = React.useState('facturacion');
  const [cambiandoClave, setCambiandoClave] = React.useState(false);
  const [cargandoPerfilAcademia, setCargandoPerfilAcademia] = React.useState(true);
  const [perfilAcademiaError, setPerfilAcademiaError] = React.useState('');
  const [cargandoTotalAlumnos, setCargandoTotalAlumnos] = React.useState(true);
  const [totalAlumnos, setTotalAlumnos] = React.useState(0);
  const [totalAlumnosError, setTotalAlumnosError] = React.useState('');
  const [resumenAcademia, setResumenAcademia] = React.useState({
    plan: 'No configurado',
    costoPlan: null,
    estadoSolvencia: 'pendiente',
    proximoPago: '',
    pagos: {
      pago_movil: {},
      transferencia: {},
      deposito_usd: {}
    }
  });
  const [showPasswords, setShowPasswords] = React.useState({
    actual: false,
    nueva: false,
    confirmar: false
  });
  const [passwordForm, setPasswordForm] = React.useState({
    clave_actual: '',
    clave_nueva: '',
    confirmar_clave_nueva: ''
  });

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem('usuario') || '';
      setUsuario(raw ? JSON.parse(raw) : null);
    } catch (_) {
      setUsuario(null);
    }
  }, []);

  React.useEffect(() => {
    let isMounted = true;

    const normalizeSolvencia = (value, tenantEstado) => {
      const raw = String(value || '').trim().toLowerCase();
      if (['solvente', 'al_dia', 'aldia', 'pagado', 'activo'].includes(raw)) return 'solvente';
      if (['insolvente', 'moroso', 'vencido', 'suspendido'].includes(raw)) return 'insolvente';
      if (String(tenantEstado || '').trim().toLowerCase() === 'active') return 'solvente';
      return 'pendiente';
    };

    const parseCosto = (value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
    };

    const extractTenantBilling = (tenantPayload = {}) => {
      const tenant = tenantPayload?.tenant || {};
      const suscripcion = tenant?.suscripcion || tenant?.subscription || tenant?.billing || {};

      const plan = String(
        suscripcion?.plan ||
        suscripcion?.nombre_plan ||
        suscripcion?.plan_nombre ||
        tenant?.plan ||
        ''
      ).trim();

      const costoPlan = parseCosto(
        suscripcion?.costo_mensual_usd ??
        suscripcion?.monto_mensual_usd ??
        suscripcion?.precio_mensual_usd ??
        suscripcion?.costo ??
        tenant?.costo_plan_usd
      );

      const estadoSolvencia = normalizeSolvencia(
        suscripcion?.estado_solvencia || suscripcion?.solvencia || suscripcion?.estado_pago,
        tenant?.estado
      );

      const proximoPago = String(
        suscripcion?.proximo_pago ||
        suscripcion?.fecha_proximo_pago ||
        ''
      ).trim();

      return {
        plan: plan || 'No configurado',
        costoPlan,
        estadoSolvencia,
        proximoPago
      };
    };

    const mergePagos = (pagosConfig = {}) => {
      return {
        pago_movil: pagosConfig?.pago_movil || {},
        transferencia: pagosConfig?.transferencia || {},
        deposito_usd: pagosConfig?.deposito_usd || {}
      };
    };

    async function cargarResumenAcademia() {
      try {
        setCargandoPerfilAcademia(true);
        setCargandoTotalAlumnos(true);
        setPerfilAcademiaError('');
        setTotalAlumnosError('');

        const [tenantRes, pagosRes, alumnosRes] = await Promise.all([
          fetch(`${apiBase}/api/tenant/context`),
          fetch(`${apiBase}/api/configuracion/pagos`),
          fetch(`${apiBase}/api/alumnos/count-by-sede`)
        ]);

        const tenantData = await tenantRes.json().catch(() => ({}));
        const pagosData = await pagosRes.json().catch(() => ({}));
        const alumnosData = await alumnosRes.json().catch(() => []);

        if (!isMounted) return;

        const tenantBilling = extractTenantBilling(tenantData);
        const pagos = mergePagos(pagosData?.pagos || {});

        setResumenAcademia({
          ...tenantBilling,
          pagos
        });

        if (!tenantRes.ok || !pagosRes.ok) {
          setPerfilAcademiaError('No se pudieron cargar todos los datos comerciales de la academia.');
        }

        if (alumnosRes.ok && Array.isArray(alumnosData)) {
          const total = alumnosData.reduce((acc, item) => acc + Number(item?.count || 0), 0);
          setTotalAlumnos(Number.isFinite(total) ? total : 0);
        } else {
          setTotalAlumnos(0);
          setTotalAlumnosError('No se pudo obtener el total de alumnos.');
        }
      } catch (_) {
        if (!isMounted) return;
        setPerfilAcademiaError('No se pudieron cargar los datos de plan y facturacion de la academia.');
        setTotalAlumnos(0);
        setTotalAlumnosError('No se pudo obtener el total de alumnos.');
      } finally {
        if (isMounted) {
          setCargandoPerfilAcademia(false);
          setCargandoTotalAlumnos(false);
        }
      }
    }

    cargarResumenAcademia();

    return () => {
      isMounted = false;
    };
  }, [apiBase]);

  const userInitials = React.useMemo(() => {
    return String(usuario?.nombre || 'Usuario')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase() || '')
      .join('') || 'U';
  }, [usuario]);

  const togglePasswordVisibility = (key) => {
    setShowPasswords((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const formatUsd = (value) => {
    if (!Number.isFinite(value)) return 'No configurado';
    return `$${value.toFixed(2)} USD`;
  };

  const formatDateValue = (value) => {
    if (!value) return 'No configurado';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString('es-VE');
  };

  const solvenciaLabel =
    resumenAcademia.estadoSolvencia === 'solvente'
      ? 'Solvente'
      : resumenAcademia.estadoSolvencia === 'insolvente'
        ? 'Insolvente'
        : 'Pendiente';

  const solvenciaColor =
    resumenAcademia.estadoSolvencia === 'solvente'
      ? 'success'
      : resumenAcademia.estadoSolvencia === 'insolvente'
        ? 'error'
        : 'default';

  const solvenciaAccent =
    resumenAcademia.estadoSolvencia === 'solvente'
      ? { bar: '#16a34a', chipBg: '#dcfce7', chipText: '#166534', ring: 'rgba(22, 163, 74, 0.22)' }
      : resumenAcademia.estadoSolvencia === 'insolvente'
        ? { bar: '#dc2626', chipBg: '#fee2e2', chipText: '#991b1b', ring: 'rgba(220, 38, 38, 0.22)' }
        : { bar: '#d97706', chipBg: '#fef3c7', chipText: '#92400e', ring: 'rgba(217, 119, 6, 0.22)' };

  const cambiarClave = async () => {
    const payload = {
      clave_actual: String(passwordForm.clave_actual || '').trim(),
      clave_nueva: String(passwordForm.clave_nueva || '').trim(),
      confirmar_clave_nueva: String(passwordForm.confirmar_clave_nueva || '').trim()
    };

    if (!payload.clave_actual || !payload.clave_nueva || !payload.confirmar_clave_nueva) {
      setError('Completa todos los campos para cambiar la clave.');
      return;
    }

    try {
      setCambiandoClave(true);
      setError('');
      setSuccessMessage('');

      const res = await fetch(`${apiBase}/api/configuracion/cambiar-clave`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || data?.detalle || 'No se pudo cambiar la clave.');
      }

      setPasswordForm({ clave_actual: '', clave_nueva: '', confirmar_clave_nueva: '' });
      setSuccessMessage(data?.message || 'Clave actualizada correctamente.');
    } catch (err) {
      setError(err.message || 'No se pudo cambiar la clave.');
    } finally {
      setCambiandoClave(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 2, md: 3 }, py: { xs: 2, md: 4 } }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '10fr 2fr' }, gap: 3, alignItems: 'start' }}>
        
        {/* LEFT COLUMN - BIG CARD */}
        <Paper sx={{ borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none', overflow: 'hidden' }}>
          
          {/* HEADER SECTION */}
          <Box sx={{ p: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0' }}>
             <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Avatar sx={{ width: 64, height: 64, bgcolor: '#0f172a', color: '#fff', fontSize: 24, fontWeight: 800 }}>
                  {userInitials}
                </Avatar>
                <Box>
                  <Typography sx={{ fontWeight: 800, color: '#0f172a', fontSize: 20, lineHeight: 1.2 }}>
                    {usuario?.nombre || 'Administrador'}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    <Chip label={(usuario?.rol || 'ADMIN').toUpperCase()} size="small" sx={{ height: 20, fontSize: 11, fontWeight: 800, bgcolor: '#f1f5f9', color: '#0f172a', borderRadius: 1 }} />
                    <Typography sx={{ color: '#64748b', fontSize: 13, ml: 1 }}>
                      {usuario?.email || 'admin@dux.com'}
                    </Typography>
                  </Box>
                </Box>
             </Box>
             <Button variant="outlined" sx={{ textTransform: 'none', fontWeight: 700, borderColor: '#e2e8f0', color: '#475569', borderRadius: 2 }}>
               Editar perfil
             </Button>
          </Box>

          {/* TABS SECTION */}
          <Box sx={{ px: 3, borderBottom: '1px solid #e2e8f0' }}>
             <Tabs
              value={seccionActiva}
              onChange={(_, value) => setSeccionActiva(value)}
              TabIndicatorProps={{ style: { height: 3, backgroundColor: '#0f172a' } }}
              sx={{
                minHeight: 48,
                '& .MuiTab-root': {
                  minHeight: 48,
                  textTransform: 'none',
                  fontWeight: 700,
                  color: '#64748b',
                  px: 1,
                  mr: 3
                },
                '& .Mui-selected': {
                  color: '#0f172a'
                }
              }}
            >
              <Tab
                value="facturacion"
                label="Facturación"
                icon={<ReceiptLongOutlinedIcon fontSize="small" sx={{ mr: 0.5, mb: '0 !important' }} />}
                iconPosition="start"
              />
              <Tab
                value="seguridad"
                label="Seguridad"
                icon={<SecurityOutlinedIcon fontSize="small" sx={{ mr: 0.5, mb: '0 !important' }} />}
                iconPosition="start"
              />
            </Tabs>
          </Box>

          {/* CONTENT SECTION */}
          <Box sx={{ p: 3 }}>
            {seccionActiva === 'facturacion' && (
              <Box>
                {/* DARK SUBSCRIPTION CARD */}
                <Box sx={{ bgcolor: '#0f172a', background: 'linear-gradient(to right, #0f172a, #1e1b4b)', color: '#fff', borderRadius: 3, p: 3, position: 'relative', overflow: 'hidden' }}>
                    <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.05em', color: '#94a3b8', textTransform: 'uppercase', mb: 1.5 }}>
                      Suscripción actual
                    </Typography>
                    
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                       <Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1.5 }}>
                            <Typography sx={{ fontSize: 32, fontWeight: 900 }}>
                              {cargandoPerfilAcademia ? '...' : (resumenAcademia.plan || 'Plan Pro')}
                            </Typography>
                            <Chip 
                              label={solvenciaLabel.toUpperCase()} 
                              size="small"
                              sx={{
                                height: 26, fontSize: 11, fontWeight: 800, bgcolor: solvenciaAccent.chipBg, color: solvenciaAccent.chipText, borderRadius: 2
                              }}
                            />
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, color: '#cbd5e1', fontSize: 14, fontWeight: 600 }}>
                             <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Typography sx={{ fontWeight: 600 }}>$</Typography>
                                <Typography>{cargandoPerfilAcademia ? '...' : `${resumenAcademia.costoPlan || '49.99'} USD / mes`}</Typography>
                             </Box>
                             <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <Typography component="span" sx={{ fontSize: 15, mr: 0.5 }}>🗓</Typography>
                                <Typography>Próximo cobro: {cargandoPerfilAcademia ? '...' : formatDateValue(resumenAcademia.proximoPago)}</Typography>
                             </Box>
                          </Box>
                       </Box>

                       <Button variant="outlined" sx={{ textTransform: 'none', fontWeight: 700, borderColor: 'rgba(255,255,255,0.2)', color: '#fff', borderRadius: 2, '&:hover': { borderColor: 'rgba(255,255,255,0.4)', bgcolor: 'rgba(255,255,255,0.05)' } }}>
                         Cambiar plan
                       </Button>
                    </Box>
                </Box>

                {/* DATOS DE PAGO SECTION */}
                <Box sx={{ mt: 4 }}>
                   <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <Typography component="span" sx={{ fontSize: 18 }}>🏦</Typography>
                      <Typography sx={{ fontWeight: 800, color: '#0f172a', fontSize: 16 }}>Datos para el pago</Typography>
                   </Box>
                   <Typography sx={{ color: '#64748b', fontSize: 14, mb: 3 }}>
                     Realiza el depósito o transferencia a esta cuenta.
                   </Typography>

                   <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2, mb: 3 }}>
                      {/* BANCAMIGA BOX */}
                      <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 2, p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                         <Box>
                            <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#64748b', mb: 0.5, letterSpacing: '0.05em' }}>BANCO</Typography>
                            <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: 15 }}>BANCAMIGA</Typography>
                         </Box>
                         <Button size="small" sx={{ textTransform: 'none', color: '#475569', minWidth: 0, p: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 1, fontWeight: 600 }}>
                           <Box component="span" sx={{mr: 0.5, display: 'flex'}}>📋</Box> Copiar
                         </Button>
                      </Box>
                      {/* CEDULA BOX */}
                      <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 2, p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                         <Box>
                            <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#64748b', mb: 0.5, letterSpacing: '0.05em' }}>CÉDULA</Typography>
                            <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: 15 }}>25894044</Typography>
                         </Box>
                         <Button size="small" sx={{ textTransform: 'none', color: '#475569', minWidth: 0, p: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 1, fontWeight: 600 }}>
                           <Box component="span" sx={{mr: 0.5, display: 'flex'}}>📋</Box> Copiar
                         </Button>
                      </Box>
                      {/* TELEFONO BOX */}
                      <Box sx={{ border: '1px solid #e2e8f0', borderRadius: 2, p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                         <Box>
                            <Typography sx={{ fontSize: 11, fontWeight: 800, color: '#64748b', mb: 0.5, letterSpacing: '0.05em' }}>TELÉFONO</Typography>
                            <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: 15 }}>0412-5163627</Typography>
                         </Box>
                         <Button size="small" sx={{ textTransform: 'none', color: '#475569', minWidth: 0, p: '4px 8px', border: '1px solid #e2e8f0', borderRadius: 1, fontWeight: 600 }}>
                           <Box component="span" sx={{mr: 0.5, display: 'flex'}}>📋</Box> Copiar
                         </Button>
                      </Box>
                   </Box>

                   {/* INSTRUCCIONES BOX */}
                   <Box sx={{ p: 2.5, borderRadius: 3, border: '1px dashed #cbd5e1', bgcolor: '#f8fafc' }}>
                      <Typography sx={{ fontWeight: 800, color: '#0f172a', fontSize: 14, mb: 0.5 }}>
                        Una vez realizado el pago...
                      </Typography>
                      <Typography sx={{ color: '#475569', fontSize: 14, mb: 2 }}>
                        Envíanos el comprobante por cualquiera de estos canales para validar tu pago y mantener tu academia activa.
                      </Typography>

                      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
                         <Button variant="contained" sx={{ bgcolor: '#22c55e', '&:hover': { bgcolor: '#16a34a' }, textTransform: 'none', fontWeight: 700, borderRadius: 2, boxShadow: 'none', px: 2, py: 1 }}>
                           <WhatsAppIcon sx={{ mr: 1, fontSize: 18 }} />
                           WhatsApp soporte: 0412-5163627
                         </Button>
                         <Button variant="outlined" sx={{ textTransform: 'none', fontWeight: 700, color: '#475569', borderColor: '#e2e8f0', bgcolor: '#fff', borderRadius: 2, px: 2, py: 1, '&:hover':{bgcolor:'#f8fafc'} }}>
                           <EmailOutlinedIcon sx={{ mr: 1, fontSize: 18, color: '#64748b' }} />
                           apexsistema2026@gmail.com
                         </Button>
                      </Box>
                   </Box>

                </Box>
              </Box>
            )}

            {seccionActiva === 'seguridad' && (
              <Box>
                <Typography sx={{ fontWeight: 800, color: '#1f2a3d', mb: 0.25 }}>Seguridad de usuario</Typography>
                <Typography sx={{ color: '#637086', fontSize: 14, mb: 3 }}>Cambia tu clave para proteger el acceso a la academia.</Typography>
                
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' }, gap: 2, mb: 3 }}>
                   <TextField
                    label="Clave actual"
                    type={showPasswords.actual ? 'text' : 'password'}
                    size="small"
                    value={passwordForm.clave_actual}
                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, clave_actual: e.target.value }))}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => togglePasswordVisibility('actual')} edge="end">
                            {showPasswords.actual ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
                          </IconButton>
                        </InputAdornment>
                      )
                    }}
                  />
                  <TextField
                    label="Nueva clave"
                    type={showPasswords.nueva ? 'text' : 'password'}
                    size="small"
                    value={passwordForm.clave_nueva}
                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, clave_nueva: e.target.value }))}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => togglePasswordVisibility('nueva')} edge="end">
                            {showPasswords.nueva ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
                          </IconButton>
                        </InputAdornment>
                      )
                    }}
                  />
                  <TextField
                    label="Confirmar nueva clave"
                    type={showPasswords.confirmar ? 'text' : 'password'}
                    size="small"
                    value={passwordForm.confirmar_clave_nueva}
                    onChange={(e) => setPasswordForm((prev) => ({ ...prev, confirmar_clave_nueva: e.target.value }))}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton size="small" onClick={() => togglePasswordVisibility('confirmar')} edge="end">
                            {showPasswords.confirmar ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
                          </IconButton>
                        </InputAdornment>
                      )
                    }}
                  />
                </Box>
                <Button variant="contained" onClick={cambiarClave} disabled={cambiandoClave} sx={{ textTransform: 'none', fontWeight: 800, bgcolor: '#0f172a', borderRadius: 2 }}>
                   {cambiandoClave ? 'Actualizando...' : 'Cambiar clave'}
                </Button>
              </Box>
            )}
          </Box>
        </Paper>

        {/* RIGHT COLUMN - TWO CARDS */}
        <Box sx={{ display: 'grid', gap: 3 }}>
          {/* TOTAL ALUMNOS CARD */}
          <Paper sx={{ borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none', p: 3, pb: 0, display: 'flex', flexDirection: 'column' }}>
             <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: 2, bgcolor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                   <Groups2OutlinedIcon sx={{ color: '#0f172a', fontSize: 20 }} />
                </Box>
                <Typography sx={{ fontWeight: 700, color: '#334155', fontSize: 13 }}>
                  Total de alumnos
                </Typography>
             </Box>
             
             <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                <Typography sx={{ fontSize: 44, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>
                  {cargandoTotalAlumnos ? '...' : totalAlumnos}
                </Typography>
             </Box>
             <Typography sx={{ color: '#64748b', fontSize: 12, mb: 2 }}>
                Alumnos activos registrados en la academia
             </Typography>
             
             {/* Fake chart placeholder matches mockup visual */}
             <Box sx={{ position: 'relative', height: 40, mt: 'auto', mx: -3 }}>
                <svg viewBox="0 0 100 20" preserveAspectRatio="none" style={{ width: '100%', height: '100%', display: 'block' }}>
                   <defs>
                     <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                       <stop offset="0%" stopColor="#cbd5e1" stopOpacity="0.4" />
                       <stop offset="100%" stopColor="#fff" stopOpacity="0" />
                     </linearGradient>
                   </defs>
                   <path d="M 0,20 L 0,16 Q 10,15 20,16 Q 30,13 40,14 Q 50,11 60,12 L 80,7 L 90,8 L 100,5 L 100,20 Z" fill="url(#grad)" />
                   <path d="M 0,16 Q 10,15 20,16 Q 30,13 40,14 Q 50,11 60,12 L 80,7 L 90,8 L 100,5" fill="none" stroke="#334155" strokeWidth="1" strokeLinejoin="round" />
                </svg>
             </Box>
          </Paper>

          {/* SOPORTE CARD */}
          <Paper sx={{ borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: 'none', p: 3 }}>
             <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                <Typography sx={{ fontSize: 18, color: '#d97706' }}>❓</Typography>
                <Typography sx={{ fontWeight: 700, color: '#334155', fontSize: 13 }}>
                  ¿Necesitas ayuda?
                </Typography>
             </Box>
             <Typography sx={{ color: '#475569', fontSize: 13, lineHeight: 1.5, mb: 3 }}>
               Nuestro equipo de soporte está disponible para resolver tus dudas técnicas o de facturación.
             </Typography>

             <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Button variant="outlined" sx={{ textTransform: 'none', justifyContent: 'flex-start', color: '#0f172a', borderColor: '#f1f5f9', borderRadius: 2, fontWeight: 700, py: 1, px: 2, bgcolor: '#fafafa', '&:hover': { bgcolor: '#f1f5f9', borderColor: '#e2e8f0' } }}>
                 <EmailOutlinedIcon sx={{ mr: 1.5, fontSize: 16, color: '#64748b' }} />
                   <Typography sx={{fontSize: 13, fontWeight: 700}}>apexsistema2026@gmail.com</Typography>
                </Button>
                <Button variant="outlined" sx={{ textTransform: 'none', justifyContent: 'flex-start', color: '#0f172a', borderColor: '#f1f5f9', borderRadius: 2, fontWeight: 700, py: 1, px: 2, bgcolor: '#fafafa', '&:hover': { bgcolor: '#f1f5f9', borderColor: '#e2e8f0' } }}>
                 <WhatsAppIcon sx={{ mr: 1.5, fontSize: 16, color: '#22c55e' }} />
                   <Typography sx={{fontSize: 13, fontWeight: 700}}>WhatsApp soporte: 0412-5163627</Typography>
                </Button>
             </Box>
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}

export default MiPerfil;
