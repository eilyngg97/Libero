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
    <Box sx={{ maxWidth: 1200, mx: 'auto', px: { xs: 0, md: 0 }, pb: 2 }}>
      <Typography sx={{ fontSize: { xs: 24, md: 30 }, fontWeight: 900, color: '#0f172a', mb: 0.5 }}>
        Mi perfil
      </Typography>
      <Typography sx={{ color: '#475569', mb: 2.5 }}>
        Revisa los datos de tu cuenta y actualiza tu clave de acceso.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>
      )}
      {successMessage && (
        <Alert severity="success" sx={{ mb: 2 }}>{successMessage}</Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 8fr) minmax(0, 4fr)' }, gap: 2.2, mb: 2.2, alignItems: 'stretch' }}>
        <Paper sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: '0 10px 24px rgba(15, 23, 42, 0.06)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Avatar sx={{ width: 56, height: 56, bgcolor: '#0f172a', color: '#fff', fontWeight: 800 }}>
              {userInitials}
            </Avatar>
            <Box>
              <Typography sx={{ fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                {usuario?.nombre || 'Usuario'}
              </Typography>
              <Typography sx={{ color: '#64748b', fontSize: 14 }}>
                Rol: {usuario?.rol || '-'}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
            <TextField
              label="Nombre"
              size="small"
              value={usuario?.nombre || ''}
              disabled
            />
            <TextField
              label="Correo"
              size="small"
              value={usuario?.email || ''}
              disabled
            />
          </Box>
        </Paper>

        <Paper sx={{ p: 2.2, borderRadius: 3, border: '1px solid #dbe5f4', background: 'linear-gradient(145deg, #f8fbff 0%, #eef6ff 100%)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.1, mb: 1.3 }}>
            <Box sx={{ width: 34, height: 34, borderRadius: '10px', backgroundColor: '#dbeafe', color: '#1d4ed8', display: 'grid', placeItems: 'center' }}>
              <Groups2OutlinedIcon sx={{ fontSize: 20 }} />
            </Box>
            <Typography sx={{ fontWeight: 800, color: '#0f172a' }}>Total de alumnos</Typography>
          </Box>

          <Typography sx={{ fontSize: 34, lineHeight: 1.05, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>
            {cargandoTotalAlumnos ? '...' : totalAlumnos}
          </Typography>
          <Typography sx={{ mt: 0.7, color: '#475569', fontSize: 13 }}>
            Alumnos activos registrados en la academia.
          </Typography>
          {!!totalAlumnosError && (
            <Typography sx={{ mt: 0.7, color: '#b91c1c', fontSize: 12, fontWeight: 600 }}>
              {totalAlumnosError}
            </Typography>
          )}
        </Paper>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 8fr) minmax(0, 4fr)' }, gap: 2.2, alignItems: 'start', mb: 2.2 }}>
        <Paper sx={{ borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: '0 10px 24px rgba(15, 23, 42, 0.06)', overflow: 'hidden' }}>
          <Tabs
            value={seccionActiva}
            onChange={(_, value) => setSeccionActiva(value)}
            variant="fullWidth"
            TabIndicatorProps={{ style: { height: 3, backgroundColor: '#0f172a' } }}
            sx={{
              minHeight: 52,
              bgcolor: '#f8fafc',
              '& .MuiTab-root': {
                minHeight: 52,
                textTransform: 'none',
                fontWeight: 700,
                color: '#64748b'
              },
              '& .Mui-selected': {
                color: '#0f172a'
              }
            }}
          >
            <Tab
              value="facturacion"
              label="Facturacion"
              icon={<ReceiptLongOutlinedIcon fontSize="small" />}
              iconPosition="start"
            />
            <Tab
              value="seguridad"
              label="Seguridad"
              icon={<SecurityOutlinedIcon fontSize="small" />}
              iconPosition="start"
            />
          </Tabs>
        </Paper>

        <Box sx={{ display: { xs: 'none', md: 'block' } }} />
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 8fr) minmax(0, 4fr)' }, gap: 2.2, alignItems: 'start' }}>
        <Box>
          {seccionActiva === 'facturacion' && (
          <Paper sx={{ overflow: 'hidden', borderRadius: 3, border: '1px solid #d7c1b2', boxShadow: `0 14px 30px ${solvenciaAccent.ring}` }}>
            <Box sx={{ height: 7, background: solvenciaAccent.bar }} />
            <Box sx={{ px: 2.2, py: 1.8, backgroundColor: '#10163d', color: '#fff' }}>
              <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.85 }}>
                Suscripción actual
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, mt: 0.45 }}>
                <Box>
                  <Typography sx={{ fontSize: 24, fontWeight: 900, lineHeight: 1.1 }}>
                    {cargandoPerfilAcademia ? 'Cargando...' : resumenAcademia.plan || 'Plan no configurado'}
                  </Typography>
                  <Box sx={{ mt: 0.8, display: 'inline-flex' }}>
                    <Chip
                      label={solvenciaLabel.toUpperCase()}
                      size="small"
                      sx={{
                        height: 28,
                        fontWeight: 900,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        color: solvenciaAccent.chipText,
                        backgroundColor: solvenciaAccent.chipBg,
                        border: `1px solid ${solvenciaAccent.bar}`,
                        boxShadow: `0 8px 18px ${solvenciaAccent.ring}`,
                        '& .MuiChip-label': {
                          px: 1.1,
                          fontSize: 11,
                        }
                      }}
                    />
                  </Box>
                </Box>
                <Box sx={{ width: 34, height: 34, borderRadius: '999px', border: '1px solid rgba(255,255,255,0.35)', display: 'grid', placeItems: 'center', opacity: 0.95, flexShrink: 0 }}>
                  <ReceiptLongOutlinedIcon sx={{ fontSize: 18 }} />
                </Box>
              </Box>
            </Box>

            <Box sx={{ px: 2.2, py: 2, backgroundColor: '#fff' }}>
              {perfilAcademiaError && (
                <Alert severity="warning" sx={{ mb: 2 }}>{perfilAcademiaError}</Alert>
              )}

              <Box sx={{ display: 'grid', gap: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1.5 }}>
                  <Typography sx={{ color: '#64748b', fontSize: 13, fontWeight: 700 }}>Costo mensual</Typography>
                  <Typography sx={{ color: '#1f2937', fontSize: 18, fontWeight: 900 }}>
                    {cargandoPerfilAcademia ? '...' : formatUsd(resumenAcademia.costoPlan)}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1.5 }}>
                  <Typography sx={{ color: '#64748b', fontSize: 13, fontWeight: 700 }}>Siguiente cobro</Typography>
                  <Typography sx={{ color: '#1f2937', fontSize: 16, fontWeight: 800 }}>
                    {cargandoPerfilAcademia ? '...' : formatDateValue(resumenAcademia.proximoPago)}
                  </Typography>
                </Box>
              </Box>

              <Divider sx={{ my: 2, borderColor: '#edd7cb' }} />

              <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', color: '#8a5a45', textTransform: 'uppercase', mb: 1.4 }}>
                Datos del pago
              </Typography>

              <Box sx={{ display: 'grid', gap: 1.2 }}>
                <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
                  <Typography sx={{ color: '#64748b', fontSize: 13, fontWeight: 700 }}>BANCO</Typography>
                  <Typography sx={{ color: '#1f2937', fontSize: 14, fontWeight: 800, textAlign: 'right' }}>
                    BANCAMIGA
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
                  <Typography sx={{ color: '#64748b', fontSize: 13, fontWeight: 700 }}>CEDULA</Typography>
                  <Typography sx={{ color: '#1f2937', fontSize: 14, fontWeight: 700, textAlign: 'right' }}>
                    25894044
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
                  <Typography sx={{ color: '#64748b', fontSize: 13, fontWeight: 700 }}>TELEFONO</Typography>
                  <Typography sx={{ color: '#1f2937', fontSize: 14, fontWeight: 700, textAlign: 'right' }}>
                    0412-5163627
                  </Typography>
                </Box>

                <Box sx={{ mt: 0.4, borderTop: '1px solid #edd7cb', pt: 1.4 }}>
                  <Typography sx={{ color: '#64748b', fontSize: 13, fontWeight: 700, mb: 0.6 }}>Instrucciones</Typography>
                  <Typography sx={{ color: '#4a4f55', fontSize: 14, fontWeight: 600, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                    {resumenAcademia.pagos?.deposito_usd?.instrucciones || 'Una vez realizado el pago, por favor envíanos el comprobante a nuestro correo/whatsapp de soporte para validar tu pago y mantener tu academia activa.'}
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Paper>
          )}

          {seccionActiva === 'seguridad' && (
          <Paper sx={{ p: { xs: 2, md: 2.5 }, borderRadius: 3, border: '1px solid #e2e8f0', boxShadow: '0 10px 24px rgba(15, 23, 42, 0.06)' }}>
            <Typography sx={{ fontWeight: 800, color: '#1f2a3d', mb: 0.25 }}>
              Seguridad de usuario
            </Typography>
            <Typography sx={{ color: '#637086', fontSize: 13, mb: 2 }}>
              Cambia tu clave para proteger el acceso a la academia.
            </Typography>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5, mb: 2 }}>
              <TextField
                label="Clave actual"
                type={showPasswords.actual ? 'text' : 'password'}
                size="small"
                value={passwordForm.clave_actual}
                onChange={(e) => setPasswordForm((prev) => ({ ...prev, clave_actual: e.target.value }))}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => togglePasswordVisibility('actual')} edge="end" sx={{ color: '#64748b' }}>
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
                      <IconButton size="small" onClick={() => togglePasswordVisibility('nueva')} edge="end" sx={{ color: '#64748b' }}>
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
                      <IconButton size="small" onClick={() => togglePasswordVisibility('confirmar')} edge="end" sx={{ color: '#64748b' }}>
                        {showPasswords.confirmar ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="contained"
                onClick={cambiarClave}
                disabled={cambiandoClave}
                sx={{ textTransform: 'none', fontWeight: 800, bgcolor: '#0f172a', '&:hover': { bgcolor: '#111b31' } }}
              >
                {cambiandoClave ? 'Actualizando clave...' : 'Cambiar clave'}
              </Button>
            </Box>
          </Paper>
          )}
        </Box>

        <Box sx={{ display: 'grid', gap: 1.6 }}>
          <Paper sx={{ p: 2.2, borderRadius: 3, border: '1px solid #f0c8bb', background: '#f8f7f8' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.1, mb: 1.2 }}>
              <SupportAgentOutlinedIcon sx={{ fontSize: 20, color: '#10163d' }} />
              <Typography sx={{ fontWeight: 800, color: '#1f2937' }}>
                Necesitas ayuda?
              </Typography>
            </Box>
            <Typography sx={{ color: '#6b7280', fontSize: 15, lineHeight: 1.45, mb: 1.2 }}>
              Nuestro equipo de soporte especializado está disponible para resolver tus dudas técnicas o de facturación.
            </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Button
                  variant="text"
                  onClick={() => { window.location.href = 'mailto:apexsistema2026@gmail.com?subject=Soporte%20Apex%20-%20Facturacion'; }}
                  sx={{
                    p: 0,
                    minWidth: 0,
                    textTransform: 'none',
                    fontWeight: 800,
                    color: '#10163d',
                    '&:hover': { backgroundColor: 'transparent', color: '#10163d' }
                  }}
                  endIcon={<EastIcon />}
                >
                  Soporte
                </Button>
                <Typography sx={{ color: '#10163d', fontWeight: 700, fontSize: 14, userSelect: 'all', ml: 1 }}>
                  apexsistema2026@gmail.com
                </Typography>
              </Box>
          </Paper>
        </Box>
      </Box>
    </Box>
  );
}

export default MiPerfil;
