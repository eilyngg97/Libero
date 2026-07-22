import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  Grid,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Tabs,
  TextField,
  Tooltip,
  Switch,
  Typography
} from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import CheckIcon from '@mui/icons-material/Check';

const GROUP_LABELS = {
  dashboard: 'Dashboard',
  constancias: 'Constancias',
  recaudos: 'Recaudos',
  reglamento: 'Reglamento',
  tienda: 'Tienda',
  solicitudes_constancias: 'Solicitudes de constancias',
  alumnos: 'Alumnos',
  entrenadores: 'Entrenadores',
  mensualidades: 'Mensualidades',
  solicitudes_uniformes: 'Solicitudes de uniformes',
  sedes: 'Sedes',
  usuarios: 'Usuarios',
  roles: 'Roles'
};

const PERMISSION_LABELS = {
  'dashboard.view': 'Ver dashboard',
  'dashboard.finance': 'Ver finanzas',
  'dashboard.stats': 'Ver estadisticas',
  'constancias.view': 'Ver constancias',
  'constancias.manage': 'Gestionar constancias',
  'recaudos.view': 'Ver recaudos',
  'recaudos.manage': 'Gestionar recaudos',
  'reglamento.view': 'Ver reglamento',
  'reglamento.manage': 'Gestionar reglamento',
  'tienda.view': 'Ver tienda',
  'tienda.manage': 'Gestionar tienda',
  'solicitudes_constancias.view': 'Ver solicitudes de constancias',
  'solicitudes_constancias.manage': 'Gestionar solicitudes de constancias',
  'alumnos.view': 'Ver alumnos',
  'alumnos.manage': 'Gestionar alumnos',
  'entrenadores.view': 'Ver entrenadores',
  'entrenadores.manage': 'Gestionar entrenadores',
  'mensualidades.view': 'Ver mensualidades',
  'mensualidades.insolventes.view': 'Ver mensualidades insolventes',
  'mensualidades.manage': 'Gestionar mensualidades',
  'solicitudes_uniformes.view': 'Ver solicitudes de uniformes',
  'solicitudes_uniformes.manage': 'Gestionar solicitudes de uniformes',
  'sedes.view': 'Ver sedes',
  'sedes.manage': 'Gestionar sedes',
  'usuarios.manage': 'Gestionar usuarios',
  'roles.manage': 'Gestionar roles'
};

function groupPermissions(permisos) {
  return permisos.reduce((acc, permiso) => {
    const group = String(permiso || '').split('.')[0] || 'otros';
    if (!acc[group]) acc[group] = [];
    acc[group].push(permiso);
    return acc;
  }, {});
}

function getUserInitials(nombre) {
  const parts = String(nombre || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function getAvatarColor(seed) {
  const palette = ['#0ea5e9', '#2563eb', '#16a34a', '#f97316', '#db2777', '#7c3aed', '#0891b2', '#b45309'];
  const text = String(seed || 'usuario');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = text.charCodeAt(index) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

function UsuariosAccesos() {
  const apiBase = process.env.REACT_APP_API_URL || window.location.origin;
  const token = localStorage.getItem('token');
  const authHeaders = useMemo(() => (
    token ? { Authorization: `Bearer ${token}` } : {}
  ), [token]);

  const [tab, setTab] = useState(0);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [catalogoPermisos, setCatalogoPermisos] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [editingRoleId, setEditingRoleId] = useState('');
  const [savingRole, setSavingRole] = useState(false);
  const [deletingRoleId, setDeletingRoleId] = useState('');
  const [roleToDelete, setRoleToDelete] = useState(null);

  const [roleForm, setRoleForm] = useState({
    nombre: '',
    descripcion: '',
    permisos: []
  });
  const [userForm, setUserForm] = useState({
    nombre: '',
    email: '',
    cedula: '',
    roleId: ''
  });
  const [userPage, setUserPage] = useState(0);
  const [userRowsPerPage, setUserRowsPerPage] = useState(10);
  const [showCreateUserCard, setShowCreateUserCard] = useState(false);
  const [showCreateRoleCard, setShowCreateRoleCard] = useState(false);

  const groupedPermissions = useMemo(
    () => groupPermissions(catalogoPermisos),
    [catalogoPermisos]
  );

  const sortedPermissions = useMemo(
    () => [...catalogoPermisos].sort((a, b) => a.localeCompare(b)),
    [catalogoPermisos]
  );

  const rolePermissionMatrix = useMemo(() => {
    return roles.map((role) => ({
      ...role,
      permisosSet: new Set(Array.isArray(role.permisos) ? role.permisos : [])
    }));
  }, [roles]);

  const paginatedUsuarios = useMemo(() => {
    const start = userPage * userRowsPerPage;
    return usuarios.slice(start, start + userRowsPerPage);
  }, [usuarios, userPage, userRowsPerPage]);

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(usuarios.length / userRowsPerPage) - 1);
    if (userPage > maxPage) {
      setUserPage(maxPage);
    }
  }, [usuarios.length, userPage, userRowsPerPage]);

  const resetRoleForm = () => {
    setRoleForm({ nombre: '', descripcion: '', permisos: [] });
    setEditingRoleId('');
  };

  const handleAbrirCrearRol = () => {
    resetRoleForm();
    setShowCreateRoleCard(true);
  };

  const handleCerrarRolCard = () => {
    setShowCreateRoleCard(false);
    resetRoleForm();
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rolesRes, usersRes, permsRes] = await Promise.all([
        fetch(`${apiBase}/api/roles`, { headers: authHeaders }),
        fetch(`${apiBase}/api/usuarios`, { headers: authHeaders }),
        fetch(`${apiBase}/api/roles/catalogo-permisos`, { headers: authHeaders })
      ]);

      const rolesData = await rolesRes.json().catch(() => []);
      const usersData = await usersRes.json().catch(() => []);
      const permsData = await permsRes.json().catch(() => ({ permisos: [] }));

      if (!rolesRes.ok) throw new Error(rolesData?.msg || 'No se pudieron cargar roles');
      if (!usersRes.ok) throw new Error(usersData?.msg || 'No se pudieron cargar usuarios');
      if (!permsRes.ok) throw new Error(permsData?.msg || 'No se pudo cargar el catalogo de permisos');

      setRoles(Array.isArray(rolesData) ? rolesData : []);
      setUsuarios(Array.isArray(usersData) ? usersData : []);
      setCatalogoPermisos(Array.isArray(permsData?.permisos) ? permsData.permisos : []);
    } catch (err) {
      setError(err.message || 'No se pudo cargar la informacion');
      setRoles([]);
      setUsuarios([]);
      setCatalogoPermisos([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase, authHeaders]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleTogglePermission = (permiso) => {
    setRoleForm((prev) => {
      const hasPermission = prev.permisos.includes(permiso);
      if (hasPermission) {
        return { ...prev, permisos: prev.permisos.filter((item) => item !== permiso) };
      }
      return { ...prev, permisos: [...prev.permisos, permiso] };
    });
  };

  const handleSelectAllPermissions = () => {
    setRoleForm((prev) => {
      const allSelected = catalogoPermisos.length > 0 && prev.permisos.length === catalogoPermisos.length;
      return { ...prev, permisos: allSelected ? [] : [...catalogoPermisos] };
    });
  };

  const handleGuardarRol = async () => {
    try {
      const nombre = String(roleForm.nombre || '').trim();
      if (!nombre) {
        setError('Debes indicar un nombre de rol');
        return;
      }

      setSavingRole(true);

      const endpoint = editingRoleId
        ? `${apiBase}/api/roles/${editingRoleId}`
        : `${apiBase}/api/roles`;
      const method = editingRoleId ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(roleForm)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.msg || 'No se pudo guardar el rol');

      resetRoleForm();
      setShowCreateRoleCard(false);
      setSuccess(editingRoleId ? 'Rol actualizado correctamente' : 'Rol creado correctamente');
      await fetchData();
    } catch (err) {
      setError(err.message || 'No se pudo guardar el rol');
    } finally {
      setSavingRole(false);
    }
  };

  const handleEditarRol = (role) => {
    setEditingRoleId(String(role?._id || ''));
    setRoleForm({
      nombre: String(role?.nombre || ''),
      descripcion: String(role?.descripcion || ''),
      permisos: Array.isArray(role?.permisos) ? role.permisos : []
    });
    setShowCreateRoleCard(true);
  };

  const handleSolicitarEliminarRol = (role) => {
    setRoleToDelete(role || null);
  };

  const handleCerrarDialogoEliminarRol = () => {
    if (deletingRoleId) return;
    setRoleToDelete(null);
  };

  const handleConfirmarEliminarRol = async () => {
    const roleId = String(roleToDelete?._id || '');
    if (!roleId) return;

    try {
      setDeletingRoleId(roleId);
      const res = await fetch(`${apiBase}/api/roles/${roleId}`, {
        method: 'DELETE',
        headers: authHeaders
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.msg || 'No se pudo eliminar el rol');
      setSuccess('Rol eliminado correctamente');

      if (editingRoleId === roleId) {
        resetRoleForm();
      }

      setRoleToDelete(null);
      await fetchData();
    } catch (err) {
      setError(err.message || 'No se pudo eliminar el rol');
    } finally {
      setDeletingRoleId('');
    }
  };

  const handleCrearUsuario = async () => {
    try {
      const payload = {
        nombre: String(userForm.nombre || '').trim(),
        email: String(userForm.email || '').trim(),
        cedula: String(userForm.cedula || '').trim(),
        roleId: userForm.roleId || undefined
      };

      if (!payload.nombre || !payload.email || !payload.cedula || !payload.roleId) {
        setError('Completa nombre, email, cedula y rol');
        return;
      }

      const res = await fetch(`${apiBase}/api/usuarios`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.msg || 'No se pudo crear el usuario');

      setUserForm({ nombre: '', email: '', cedula: '', roleId: '' });
      setShowCreateUserCard(false);
      setSuccess('Usuario creado correctamente');
      await fetchData();
    } catch (err) {
      setError(err.message || 'No se pudo crear el usuario');
    }
  };

  const handleCambiarRolUsuario = async (usuarioId, roleId) => {
    try {
      const res = await fetch(`${apiBase}/api/usuarios/${usuarioId}/rol`, {
        method: 'PATCH',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ roleId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.msg || 'No se pudo actualizar el rol del usuario');
      setSuccess('Rol de usuario actualizado');
      await fetchData();
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el rol del usuario');
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f8fafc', p: { xs: 2, md: 4 } }}>
      <Snackbar open={!!success} autoHideDuration={3000} onClose={() => setSuccess('')} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
        <Alert severity="success" onClose={() => setSuccess('')} sx={{ width: '100%' }}>
          {success}
        </Alert>
      </Snackbar>

      <Box sx={{ maxWidth: 1200, mx: 'auto', display: 'grid', gap: 2 }}>
        <Box>
          <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#7c3aed', mb: 0.35 }}>
            Control de acceso
          </Typography>
          <Typography variant="h4" sx={{ fontWeight: 900, color: '#0f172a', lineHeight: 1.1 }}>
            Usuarios y accesos
          </Typography>
          <Typography sx={{ color: '#64748b', mt: 0.45 }}>
            Gestiona quién accede al sistema y qué puede hacer.
          </Typography>
        </Box>

        {error ? <Alert severity="error">{error}</Alert> : null}

        <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 3 }}>
          <Box sx={{ p: 1.2, pb: 0.9 }}>
            <Tabs
              value={tab}
              onChange={(_, value) => setTab(value)}
              sx={{
                minHeight: 40,
                bgcolor: '#f1f5f9',
                borderRadius: 2.5,
                p: 0.35,
                '& .MuiTabs-indicator': {
                  display: 'none'
                }
              }}
            >
              <Tab
                disableRipple
                sx={{
                  minHeight: 34,
                  py: 0.6,
                  px: 1.35,
                  textTransform: 'none',
                  borderRadius: 1.8,
                  fontSize: 13,
                  fontWeight: 800,
                  color: '#475569',
                  minWidth: 0,
                  '&.Mui-selected': {
                    color: '#ffffff',
                    bgcolor: '#0f172a',
                    boxShadow: '0 2px 6px rgba(15, 23, 42, 0.24)'
                  }
                }}
                label={(
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                    <span>Usuarios</span>
                    <Box
                      sx={{
                        minWidth: 18,
                        height: 18,
                        borderRadius: '999px',
                        px: 0.55,
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 11,
                        fontWeight: 900,
                        bgcolor: 'rgba(148, 163, 184, 0.35)',
                        color: 'inherit'
                      }}
                    >
                      {usuarios.length}
                    </Box>
                  </Box>
                )}
              />
              <Tab
                disableRipple
                sx={{
                  minHeight: 34,
                  py: 0.6,
                  px: 1.35,
                  textTransform: 'none',
                  borderRadius: 1.8,
                  fontSize: 13,
                  fontWeight: 800,
                  color: '#475569',
                  minWidth: 0,
                  '&.Mui-selected': {
                    color: '#ffffff',
                    bgcolor: '#0f172a',
                    boxShadow: '0 2px 6px rgba(15, 23, 42, 0.24)'
                  }
                }}
                label={(
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                    <span>Roles y permisos</span>
                    <Box
                      sx={{
                        minWidth: 18,
                        height: 18,
                        borderRadius: '999px',
                        px: 0.55,
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 11,
                        fontWeight: 900,
                        bgcolor: 'rgba(148, 163, 184, 0.35)',
                        color: 'inherit'
                      }}
                    >
                      {roles.length}
                    </Box>
                  </Box>
                )}
              />
            </Tabs>
          </Box>
          <Divider />

          {loading ? (
            <Box sx={{ py: 8, display: 'grid', placeItems: 'center' }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <Box sx={{ p: 2.5 }}>
              {tab === 1 && (
                <Box sx={{ width: '100%' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 1.2, mb: 1.5, flexWrap: 'wrap' }}>
                    <Button
                      variant="contained"
                      startIcon={<AddIcon />}
                      sx={{
                        textTransform: 'none',
                        borderRadius: 2.2,
                        px: 1.6,
                        py: 0.85,
                        fontWeight: 800,
                        bgcolor: '#0f172a',
                        boxShadow: '0 4px 10px rgba(15, 23, 42, 0.25)',
                        '&:hover': {
                          bgcolor: '#1e293b'
                        }
                      }}
                      onClick={handleAbrirCrearRol}
                    >
                      Nuevo rol
                    </Button>
                  </Box>

                  <Grid container spacing={2.5}>
                    <Grid item xs={12} md={6}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                        Roles creados
                      </Typography>
                      <List sx={{ border: '1px solid #e2e8f0', borderRadius: 2, maxHeight: 520, overflow: 'auto' }}>
                        {roles.map((role) => (
                          <ListItem
                            key={role._id}
                            alignItems="flex-start"
                            divider
                            secondaryAction={(
                              <Stack direction="row" spacing={0.2}>
                                <Tooltip title="Editar rol">
                                  <span>
                                    <IconButton size="small" onClick={() => handleEditarRol(role)} disabled={deletingRoleId === role._id}>
                                      <EditOutlinedIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                                <Tooltip title={deletingRoleId === role._id ? 'Eliminando...' : 'Eliminar rol'}>
                                  <span>
                                    <IconButton size="small" onClick={() => handleSolicitarEliminarRol(role)} disabled={deletingRoleId === role._id}>
                                      {deletingRoleId === role._id
                                        ? <CircularProgress size={16} />
                                        : <DeleteOutlineIcon fontSize="small" />}
                                    </IconButton>
                                  </span>
                                </Tooltip>
                              </Stack>
                            )}
                          >
                            <ListItemText
                              primary={role.nombre}
                              secondary={
                                <Box sx={{ mt: 0.5 }}>
                                  <Typography sx={{ color: '#64748b', mb: 0.8, fontSize: 13 }}>
                                    {role.descripcion || 'Sin descripcion'}
                                  </Typography>
                                  <Box sx={{ display: 'flex', gap: 0.6, flexWrap: 'wrap' }}>
                                    {(role.permisos || []).map((permiso) => (
                                      <Chip key={permiso} size="small" label={PERMISSION_LABELS[permiso] || permiso} />
                                    ))}
                                  </Box>
                                </Box>
                              }
                            />
                          </ListItem>
                        ))}
                        {roles.length === 0 && (
                          <ListItem>
                            <ListItemText primary="No hay roles creados" />
                          </ListItem>
                        )}
                      </List>
                    </Grid>

                    <Grid item size={{ xs: 12, md: 12 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                        Matriz de permisos por rol
                      </Typography>
                      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 420 }}>
                        <Table stickyHeader size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell sx={{ minWidth: 240, fontWeight: 700 }}>Permiso</TableCell>
                              {rolePermissionMatrix.map((role) => (
                                <TableCell key={`head-${role._id}`} align="center" sx={{ minWidth: 130, fontWeight: 700 }}>
                                  {role.nombre}
                                </TableCell>
                              ))}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {sortedPermissions.map((permiso) => {
                              const group = String(permiso || '').split('.')[0] || 'otros';
                              return (
                                <TableRow key={permiso} hover>
                                  <TableCell>
                                    <Typography sx={{ fontWeight: 700, fontSize: 13 }}>
                                      {PERMISSION_LABELS[permiso] || permiso}
                                    </Typography>
                                    <Typography sx={{ fontSize: 11, color: '#64748b' }}>
                                      {GROUP_LABELS[group] || group}
                                    </Typography>
                                  </TableCell>
                                  {rolePermissionMatrix.map((role) => {
                                    const active = role.permisosSet.has(permiso);
                                    return (
                                      <TableCell key={`${role._id}-${permiso}`} align="center">
                                        <Box
                                          sx={{
                                            width: 18,
                                            height: 18,
                                            mx: 'auto',
                                            borderRadius: '999px',
                                            display: 'grid',
                                            placeItems: 'center',
                                            bgcolor: active ? '#dcfce7' : '#f1f5f9',
                                            border: active ? '1px solid #86efac' : '1px solid #e2e8f0',
                                            color: active ? '#16a34a' : '#cbd5e1'
                                          }}
                                        >
                                          {active ? <CheckIcon sx={{ fontSize: 12 }} /> : null}
                                        </Box>
                                      </TableCell>
                                    );
                                  })}
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Grid>

                  </Grid>
                </Box>
              )}

              {tab === 0 && (
                <Box sx={{ width: '100%' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 1.2, mb: 1.5, flexWrap: 'wrap' }}>
                      <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        sx={{
                          textTransform: 'none',
                          borderRadius: 2.2,
                          px: 1.6,
                          py: 0.85,
                          fontWeight: 800,
                          bgcolor: '#0f172a',
                          boxShadow: '0 4px 10px rgba(15, 23, 42, 0.25)',
                          '&:hover': {
                            bgcolor: '#1e293b'
                          }
                        }}
                        onClick={() => setShowCreateUserCard(true)}
                      >
                        Nuevo usuario
                      </Button>
                    </Box>

                    <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1.5 }}>
                      Listado
                    </Typography>
                    <Paper variant="outlined" sx={{ p: 1.25, width: '100%', minHeight: 520, display: 'flex', flexDirection: 'column' }}>
                      <Stack spacing={1} sx={{ flex: 1, overflow: 'auto' }}>
                        {paginatedUsuarios.map((usuario) => (
                          <Paper key={usuario.id} variant="outlined" sx={{ p: 1.1, borderRadius: 2 }}>
                            <Grid container spacing={1.1} alignItems="center">
                              <Grid item size={{ xs: 12, md: 5 }}>
                                <Stack direction="row" spacing={1.1} alignItems="center">
                                  <Avatar
                                    sx={{
                                      width: 36,
                                      height: 36,
                                      fontSize: 13,
                                      fontWeight: 800,
                                      bgcolor: getAvatarColor(usuario.nombre || usuario.email)
                                    }}
                                  >
                                    {getUserInitials(usuario.nombre)}
                                  </Avatar>
                                  <Box>
                                    <Typography sx={{ fontWeight: 700 }}>{usuario.nombre}</Typography>
                                    <Typography sx={{ fontSize: 13, color: '#64748b' }}>{usuario.email}</Typography>
                                  </Box>
                                </Stack>
                              </Grid>
                              <Grid item size={{ xs: 12, md: 4 }} sx={{ display: 'flex', justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
                                <FormControl size="small" sx={{ width: { xs: '100%', md: 240 } }}>
                                  <InputLabel id={`role-${usuario.id}`}>Rol</InputLabel>
                                  <Select
                                    labelId={`role-${usuario.id}`}
                                    label="Rol"
                                    value={usuario.roleId || ''}
                                    onChange={(event) => handleCambiarRolUsuario(usuario.id, event.target.value)}
                                  >
                                    {roles.map((role) => (
                                      <MenuItem key={role._id} value={role._id}>{role.nombre}</MenuItem>
                                    ))}
                                  </Select>
                                </FormControl>
                              </Grid>
                              <Grid item size={{ xs: 12, md: 3 }} sx={{ display: 'flex', justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
                                <Box sx={{ textAlign: { xs: 'left', md: 'right' } }}>
                                  <Typography sx={{ fontSize: 12, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>
                                    Permisos
                                  </Typography>
                                  <Typography sx={{ fontSize: 13, color: '#475569' }}>
                                    {(usuario.permisos || []).length} asignados
                                  </Typography>
                                </Box>
                              </Grid>
                            </Grid>
                          </Paper>
                        ))}
                        {usuarios.length === 0 && <Alert severity="info">No hay usuarios registrados.</Alert>}
                      </Stack>
                      <TablePagination
                        component="div"
                        count={usuarios.length}
                        page={userPage}
                        onPageChange={(_, nextPage) => setUserPage(nextPage)}
                        rowsPerPage={userRowsPerPage}
                        onRowsPerPageChange={(event) => {
                          setUserRowsPerPage(parseInt(event.target.value, 10));
                          setUserPage(0);
                        }}
                        rowsPerPageOptions={[5, 10, 20]}
                        labelRowsPerPage="Usuarios por pagina"
                      />
                    </Paper>
                </Box>
              )}
            </Box>
          )}
        </Paper>
      </Box>

      <Dialog
        open={showCreateUserCard}
        onClose={() => setShowCreateUserCard(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3, overflow: 'hidden' } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0f172a' }}>
          Nuevo usuario
        </DialogTitle>
        <DialogContent>
          <Paper variant="outlined" sx={{ p: 1.6, borderRadius: 2.2, mt: 0.5 }}>
            <Grid container spacing={1.2}>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Nombre"
                  value={userForm.nombre}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, nombre: event.target.value }))}
                  size="small"
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Email"
                  value={userForm.email}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, email: event.target.value }))}
                  size="small"
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  label="Cedula (clave inicial)"
                  value={userForm.cedula}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, cedula: event.target.value }))}
                  size="small"
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} md={6} sx={{ display: 'flex' }}>
                <TextField
                  select
                  label="Rol"
                  value={userForm.roleId}
                  onChange={(event) => setUserForm((prev) => ({ ...prev, roleId: event.target.value }))}
                  size="small"
                  fullWidth
                  sx={{
                    width: '100%',
                    '& .MuiInputBase-root': {
                      width: '100%'
                    }
                  }}
                >
                  {roles.map((role) => (
                    <MenuItem key={role._id} value={role._id}>{role.nombre}</MenuItem>
                  ))}
                </TextField>
              </Grid>
            </Grid>

            <Stack direction="row" spacing={1} sx={{ mt: 1.4, justifyContent: 'flex-end' }}>
              <Button
                variant="outlined"
                sx={{
                  textTransform: 'none',
                  color: '#64748b',
                  borderColor: '#cbd5e1',
                  bgcolor: '#f8fafc',
                  '&:hover': {
                    borderColor: '#94a3b8',
                    bgcolor: '#f1f5f9'
                  }
                }}
                onClick={() => {
                  setShowCreateUserCard(false);
                  setUserForm({ nombre: '', email: '', cedula: '', roleId: '' });
                }}
              >
                Cancelar
              </Button>
              <Button variant="contained" sx={{
                          textTransform: 'none',
                          px: 1.6,
                          py: 0.85,
                          fontWeight: 800,
                          bgcolor: '#0f172a',
                          boxShadow: '0 4px 10px rgba(15, 23, 42, 0.25)',
                          '&:hover': {
                            bgcolor: '#1e293b'
                          }
                        }} onClick={handleCrearUsuario}>
                Crear usuario
              </Button>
            </Stack>
          </Paper>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(roleToDelete)}
        onClose={handleCerrarDialogoEliminarRol}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0f172a' }}>
          Eliminar rol
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#475569', mt: 0.5 }}>
            Vas a eliminar el rol "{roleToDelete?.nombre || 'sin nombre'}". Esta accion no se puede deshacer.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            variant="outlined"
            onClick={handleCerrarDialogoEliminarRol}
            disabled={!!deletingRoleId}
            sx={{
              textTransform: 'none',
              color: '#64748b',
              borderColor: '#cbd5e1',
              bgcolor: '#f8fafc',
              '&:hover': {
                borderColor: '#94a3b8',
                bgcolor: '#f1f5f9'
              }
            }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleConfirmarEliminarRol}
            disabled={!!deletingRoleId}
            sx={{ textTransform: 'none', fontWeight: 800 }}
          >
            {deletingRoleId ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={showCreateRoleCard}
        onClose={handleCerrarRolCard}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 4, overflow: 'hidden', maxHeight: '90vh' } }}
      >
        <DialogTitle sx={{ pb: 0.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2 }}>
            <Box>
              <Typography sx={{ fontSize: 24, fontWeight: 800, color: '#0f172a', lineHeight: 1.1 }}>
                {editingRoleId ? 'Editar rol' : 'Crear rol'}
              </Typography>
              <Typography sx={{ mt: 0.4, color: '#94a3b8', fontSize: 13 }}>
                Define el nombre y elige exactamente qué puede hacer alguien con este rol.
              </Typography>
            </Box>
            <IconButton onClick={handleCerrarRolCard} sx={{ mt: -0.5 }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent sx={{ pt: 1 }}>
          <Box sx={{ borderRadius: 3, border: '1px solid #e2e8f0', p: 1.6, bgcolor: '#fff' }}>
            <Grid container spacing={1.2}>
              <Grid item size={{ xs: 12, sm: 6, md: 6 }}>
                <TextField
                  label="Nombre del rol"
                  value={roleForm.nombre}
                  onChange={(event) => setRoleForm((prev) => ({ ...prev, nombre: event.target.value }))}
                  size="small"
                  fullWidth
                />
              </Grid>
              <Grid item size={{ xs: 12, sm: 6, md: 6 }}>
                <TextField
                  label="Descripción"
                  value={roleForm.descripcion}
                  onChange={(event) => setRoleForm((prev) => ({ ...prev, descripcion: event.target.value }))}
                  size="small"
                  fullWidth
                  placeholder="Para qué tipo de persona"
                />
              </Grid>

              <Grid item size={{ xs: 12, sm: 12, md: 12 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1, mb: 1 }}>
                  <Typography sx={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#64748b' }}>
                    Permisos
                  </Typography>
                  <Button onClick={handleSelectAllPermissions} sx={{ textTransform: 'none', fontSize: 12, fontWeight: 700 }}>
                    {catalogoPermisos.length > 0 && roleForm.permisos.length === catalogoPermisos.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
                  </Button>
                </Box>

                <Paper variant="outlined" sx={{ p: 1.1, maxHeight: 500, overflow: 'auto', bgcolor: '#fff' }}>
                  {Object.entries(groupedPermissions).map(([group, permisos]) => {
                    const selectedCount = permisos.filter((permiso) => roleForm.permisos.includes(permiso)).length;
                    return (
                      <Box key={group} sx={{ mb: 1.5, '&:not(:last-child)': { pb: 1.2, borderBottom: '1px solid #f1f5f9' } }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.8 }}>
                          <Typography sx={{ fontWeight: 800, color: '#0f172a', fontSize: 14 }}>
                            {GROUP_LABELS[group] || group}
                          </Typography>
                          <Typography sx={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>
                            {selectedCount}/{permisos.length}
                          </Typography>
                        </Box>
                        {permisos.map((permiso) => (
                          <Box key={permiso} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 0.55 }}>
                            <Box>
                              <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>
                                {PERMISSION_LABELS[permiso] || permiso}
                              </Typography>
                            </Box>
                            <Switch
                              checked={roleForm.permisos.includes(permiso)}
                              onChange={() => handleTogglePermission(permiso)}
                              size="small"
                            />
                          </Box>
                        ))}
                      </Box>
                    );
                  })}
                </Paper>
              </Grid>
            </Grid>

            <Stack direction="row" spacing={1} sx={{ mt: 1.6, justifyContent: 'flex-end' }}>
              <Button
                variant="outlined"
                sx={{
                  textTransform: 'none',
                  color: '#64748b',
                  borderColor: '#cbd5e1',
                  bgcolor: '#f8fafc',
                  '&:hover': {
                    borderColor: '#94a3b8',
                    bgcolor: '#f1f5f9'
                  }
                }}
                onClick={handleCerrarRolCard}
              >
                Cancelar
              </Button>
              <Button
                variant="contained"
                sx={{
                  textTransform: 'none',
                  borderRadius: 2.2,
                  px: 1.6,
                  py: 0.85,
                  fontWeight: 800,
                  bgcolor: '#0f172a',
                  boxShadow: '0 4px 10px rgba(15, 23, 42, 0.25)',
                  '&:hover': {
                    bgcolor: '#1e293b'
                  }
                }}
                onClick={handleGuardarRol}
                disabled={savingRole}
              >
                {savingRole ? 'Guardando...' : (editingRoleId ? 'Guardar cambios' : 'Crear rol')}
              </Button>
            </Stack>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}

export default UsuariosAccesos;
