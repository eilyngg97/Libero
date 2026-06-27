const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const {
  PERMISSIONS,
  normalizePermissionList,
  getSafeRoleSlug,
  getDefaultPermissionsByLegacyRole
} = require('../config/permissions');

async function getTenantRoleModel(req) {
  const tenantConfig = req.tenant || { tenantId: req.tenantId };
  const connection = await getTenantBusinessConnection(tenantConfig);
  return getTenantModel(connection, 'Role');
}

exports.getPermissionCatalog = async (_req, res) => {
  return res.json({ permisos: PERMISSIONS });
};

exports.listarRoles = async (req, res) => {
  try {
    const TenantRole = await getTenantRoleModel(req);
    const roles = await TenantRole.find({}).sort({ createdAt: -1 });
    return res.json(roles);
  } catch (err) {
    return res.status(500).json({ msg: 'Error en el servidor' });
  }
};

exports.crearRol = async (req, res) => {
  const { nombre, descripcion, permisos } = req.body;

  try {
    const TenantRole = await getTenantRoleModel(req);
    const nombreLimpio = String(nombre || '').trim();

    if (!nombreLimpio) {
      return res.status(400).json({ msg: 'El nombre del rol es obligatorio' });
    }

    const slug = getSafeRoleSlug(nombreLimpio);
    const existente = await TenantRole.findOne({ slug });
    if (existente) {
      return res.status(400).json({ msg: 'Ya existe un rol con ese nombre' });
    }

    const permisosNormalizados = normalizePermissionList(permisos);
    const role = new TenantRole({
      nombre: nombreLimpio,
      slug,
      descripcion: String(descripcion || '').trim(),
      permisos: permisosNormalizados,
      activo: true
    });

    await role.save();
    return res.status(201).json({ msg: 'Rol creado', role });
  } catch (err) {
    return res.status(500).json({ msg: 'Error en el servidor' });
  }
};

exports.actualizarRol = async (req, res) => {
  const { id } = req.params;
  const { nombre, descripcion, permisos, activo } = req.body;

  try {
    const TenantRole = await getTenantRoleModel(req);
    const role = await TenantRole.findById(id);
    if (!role) {
      return res.status(404).json({ msg: 'Rol no encontrado' });
    }

    if (nombre !== undefined) {
      const nombreLimpio = String(nombre || '').trim();
      if (!nombreLimpio) {
        return res.status(400).json({ msg: 'El nombre del rol es obligatorio' });
      }

      const slug = getSafeRoleSlug(nombreLimpio);
      const duplicado = await TenantRole.findOne({ slug, _id: { $ne: role._id } });
      if (duplicado) {
        return res.status(400).json({ msg: 'Ya existe un rol con ese nombre' });
      }

      role.nombre = nombreLimpio;
      role.slug = slug;
    }

    if (descripcion !== undefined) {
      role.descripcion = String(descripcion || '').trim();
    }

    if (permisos !== undefined) {
      role.permisos = normalizePermissionList(permisos);
    }

    if (activo !== undefined) {
      role.activo = Boolean(activo);
    }

    await role.save();
    return res.json({ msg: 'Rol actualizado', role });
  } catch (err) {
    return res.status(500).json({ msg: 'Error en el servidor' });
  }
};

exports.eliminarRol = async (req, res) => {
  const { id } = req.params;

  try {
    const TenantRole = await getTenantRoleModel(req);
    const TenantUser = getTenantModel((await getTenantBusinessConnection(req.tenant || { tenantId: req.tenantId })), 'User');
    const role = await TenantRole.findById(id);

    if (!role) {
      return res.status(404).json({ msg: 'Rol no encontrado' });
    }

    const usuariosConRol = await TenantUser.countDocuments({ roleId: role._id });
    if (usuariosConRol > 0) {
      return res.status(400).json({ msg: 'No puedes eliminar un rol con usuarios asignados' });
    }

    await TenantRole.deleteOne({ _id: role._id });
    return res.json({ msg: 'Rol eliminado' });
  } catch (err) {
    return res.status(500).json({ msg: 'Error en el servidor' });
  }
};

exports.seedRolesBase = async (req, res) => {
  try {
    const TenantRole = await getTenantRoleModel(req);
    const baseRoles = [
      { nombre: 'Admin', slug: 'admin', permisos: getDefaultPermissionsByLegacyRole('admin') },
      { nombre: 'Usuario', slug: 'usuario', permisos: getDefaultPermissionsByLegacyRole('usuario') },
      { nombre: 'Asistente', slug: 'asistente', permisos: getDefaultPermissionsByLegacyRole('asistente') }
    ];

    const created = [];
    for (const base of baseRoles) {
      const existe = await TenantRole.findOne({ slug: base.slug });
      if (existe) continue;
      const role = new TenantRole({
        nombre: base.nombre,
        slug: base.slug,
        descripcion: 'Rol base del sistema',
        permisos: normalizePermissionList(base.permisos),
        activo: true
      });
      await role.save();
      created.push(role.slug);
    }

    return res.json({ msg: 'Semilla completada', created });
  } catch (err) {
    return res.status(500).json({ msg: 'Error en el servidor' });
  }
};