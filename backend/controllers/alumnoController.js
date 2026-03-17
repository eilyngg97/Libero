// Obtener alumnos por representante
exports.getAlumnosPorRepresentante = async (req, res) => {
  try {
    const esUsuarioFinal = req.user?.rol === 'usuario';
    let alumnos = [];
    const incluirBajas = req.query.incluirBajas === '1';
    const filtroBajas = incluirBajas ? {} : { activo: { $ne: false } };

    if (esUsuarioFinal) {
      const representantes = await Representante.find({ usuario: req.user.id }).select('_id');
      const representanteIds = representantes.map((r) => r._id);
      const filtroPropio = [{ usuario: req.user.id }];
      if (representanteIds.length > 0) {
        filtroPropio.push({ representante: { $in: representanteIds } });
      }

      let queryUsuario = Alumno.find({ ...filtroBajas, $or: filtroPropio });
      if (req.query.populateSede === '1') {
        queryUsuario = queryUsuario.populate('sede');
      }
      const propios = await queryUsuario;
      return res.json(propios);
    }

    if (req.params.representanteId && req.params.representanteId !== 'null') {
      let query = Alumno.find({ representante: req.params.representanteId, ...filtroBajas });
      if (req.query.populateSede === '1') {
        query = query.populate('sede');
      }
      alumnos = await query;
    }
    // Si no hay alumnos asociados a representante, buscar por usuario
    if ((!alumnos || alumnos.length === 0) && req.query.usuarioId) {
      let query2 = Alumno.find({ usuario: req.query.usuarioId, ...filtroBajas });
      if (req.query.populateSede === '1') {
        query2 = query2.populate('sede');
      }
      alumnos = await query2;
    }
    res.json(alumnos);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener alumnos por representante/usuario' });
  }
};

const Alumno = require('../models/Alumno');
const Representante = require('../models/Representante');
const User = require('../models/User');
const Mensualidad = require('../models/Mensualidad');
const Sede = require('../models/Sede');
const Reposo = require('../models/Reposo');
const bcrypt = require('bcryptjs');

function buildUploadUrl(req, file, folder) {
  if (!file || !file.filename) return null;
  return `/uploads/${folder}/${file.filename}`;
}

function normalizarTipoReposo(tipo) {
  const valor = String(tipo || '').trim().toLowerCase();
  if (valor === 'indefinido') return 'Indefinido';
  if (valor === 'total') return 'Total';
  if (valor === 'parcial') return 'Parcial';
  return null;
}

async function upsertMensualidadExentaPorReposo(alumnoId, mes, anio) {
  const fechaVencimiento = new Date(anio, mes - 1, 5, 23, 59, 59);
  await Mensualidad.findOneAndUpdate(
    { id_alumno: alumnoId, mes, anio, estatus: { $ne: 'Pagado' } },
    {
      $set: {
        monto_esperado: 0,
        estatus: 'Exento por reposo',
        fecha_vencimiento: fechaVencimiento
      }
    },
    {
      upsert: true,
      setDefaultsOnInsert: true,
      new: true
    }
  );
}

// Obtener todos los alumnos
exports.getAlumnos = async (req, res) => {
  try {
    const incluirBajas = req.query.incluirBajas === '1';
    const filtro = incluirBajas ? {} : { activo: { $ne: false } };

    if (req.user?.rol === 'usuario') {
      const representantes = await Representante.find({ usuario: req.user.id }).select('_id');
      const representanteIds = representantes.map((r) => r._id);
      const filtroPropio = [{ usuario: req.user.id }];
      if (representanteIds.length > 0) {
        filtroPropio.push({ representante: { $in: representanteIds } });
      }
      filtro.$or = filtroPropio;
    }

    if (req.query.cedula) {
      filtro.cedula = req.query.cedula;
    }
    if (req.query.sede) {
      filtro.sede = req.query.sede;
    }
    const alumnos = await Alumno.find(filtro).populate('representante').populate('sede');
    console.log('Alumnos obtenidos:', alumnos);
    res.json(alumnos);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener alumnos' });
  }
};


// Crear un alumno con representante y usuario
exports.createAlumno = async (req, res) => {
    console.log('BODY recibido:', req.body);
    console.log('FILE recibido:', req.file);
  try {
    let sedeId = req.body.sede;
    if (typeof sedeId === 'string') {
      try {
        const parsed = JSON.parse(sedeId);
        sedeId = parsed._id || sedeId;
      } catch {
        // Si no es JSON, se asume que es el id directamente
      }
    }
    const cedula = (req.body.cedula || '').trim();
    if (cedula && sedeId) {
      const existente = await Alumno.findOne({ cedula, sede: sedeId });
      if (existente) {
        return res.status(409).json({ error: 'Ya existe un alumno con esa cedula en esta sede.' });
      }
    }
    // Permitir crear alumno sin representante si no se envían datos de representante
    let representante = null;
    let user = null;
    const tieneDatosRepresentante = req.body.rep_cedula && req.body.rep_nombres && req.body.rep_apellidos;
    if (tieneDatosRepresentante) {
      // Validar campos obligatorios de representante
      const requiredRepFields = [
        'rep_nombres', 'rep_apellidos', 'rep_cedula'
      ];
      const missingRepFields = requiredRepFields.filter(f => !req.body[f] || req.body[f].trim() === '');
      if (missingRepFields.length > 0) {
        return res.status(400).json({ error: 'Faltan campos obligatorios del representante', detalle: missingRepFields });
      }
      const repData = {
        nombres: req.body.rep_nombres,
        apellidos: req.body.rep_apellidos,
        cedula: req.body.rep_cedula,
        telefono: req.body.rep_telefono,
        domicilio: req.body.rep_domicilio || ''
      };
      representante = await Representante.findOne({ cedula: repData.cedula });
      user = await User.findOne({ email: repData.cedula });
      // Si no existe el usuario, crearlo
      if (!user) {
        const password = await bcrypt.hash(repData.cedula, 10);
        user = new User({
          nombre: repData.nombres + ' ' + repData.apellidos,
          email: repData.cedula, // ahora el email es la cédula
          password,
          rol: 'usuario'
        });
        await user.save();
      }
      // Si no existe el representante, crearlo y asociar el usuario
      if (!representante) {
        representante = new Representante({ ...repData, usuario: user._id });
        await representante.save();
      } else if (!representante.usuario) {
        // Si el representante existe pero no tiene usuario asociado, actualizarlo
        representante.usuario = user._id;
        await representante.save();
      }
    } else {
      // Si no hay datos de representante, crear usuario con la cédula del alumno y asociar al alumno
      if (req.body.cedula && req.body.nombres && req.body.apellidos) {
        user = await User.findOne({ email: req.body.cedula });
        if (!user) {
          const password = await bcrypt.hash(req.body.cedula, 10);
          user = new User({
            nombre: req.body.nombres + ' ' + req.body.apellidos,
            email: req.body.cedula,
            password,
            rol: 'usuario'
          });
          await user.save();
        }
      }
      

    }



    // 3. Crear alumno con referencia al representante
    const alumnoData = {
      ...req.body,
      sede: sedeId,
      representante: representante ? representante._id : undefined,
      usuario: user ? user._id : undefined,
      cedula
    };
    if (alumnoData.numero_franela !== undefined && alumnoData.numero_franela !== '') {
      const nro = Number(alumnoData.numero_franela);
      alumnoData.numero_franela = Number.isNaN(nro) ? undefined : nro;
    }
    if (alumnoData.habilitar_pago_cuotas !== undefined) {
      alumnoData.habilitar_pago_cuotas = alumnoData.habilitar_pago_cuotas === true || alumnoData.habilitar_pago_cuotas === 'true';
    }
    if (alumnoData.etiquetas) {
      if (typeof alumnoData.etiquetas === 'string') {
        try {
          alumnoData.etiquetas = JSON.parse(alumnoData.etiquetas);
        } catch {
          alumnoData.etiquetas = [alumnoData.etiquetas];
        }
      }
      if (!Array.isArray(alumnoData.etiquetas)) {
        alumnoData.etiquetas = [];
      }
    }
    // Eliminar los campos de representante del body para evitar duplicidad
    delete alumnoData.rep_nombres;
    delete alumnoData.rep_apellidos;
    delete alumnoData.rep_cedula;
    delete alumnoData.rep_parentesco;
    delete alumnoData.rep_telefono;
    delete alumnoData.rep_domicilio;

    // Si hay archivo de foto, guardar solo la URL pública
    if (req.files && req.files['foto'] && req.files['foto'][0]) {
      const fotoFile = req.files['foto'][0];
      alumnoData.foto = buildUploadUrl(req, fotoFile, 'alumnos');
    }
    // Si hay archivo de foto_cedula, guardar solo la URL pública
    if (req.files && req.files['foto_cedula'] && req.files['foto_cedula'][0]) {
      const cedulaFile = req.files['foto_cedula'][0];
      alumnoData.foto_cedula = buildUploadUrl(req, cedulaFile, 'alumnos');
    }

    const alumno = new Alumno(alumnoData);
    await alumno.save();
    res.status(201).json(alumno);
  } catch (err) {
    console.error('Error al crear alumno:', err);
    res.status(400).json({ error: 'Error al crear alumno', detalle: err.message });
  }
};

// Obtener un alumno por ID
exports.getAlumnoById = async (req, res) => {
  try {
    const alumno = await Alumno.findById(req.params.id).populate('representante').populate('sede');
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });
    res.json(alumno);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener alumno' });
  }
};

// Actualizar un alumno
exports.updateAlumno = async (req, res) => {
  try {
    let updateData = { ...req.body };
    let sedeId = updateData.sede;
    if (typeof sedeId === 'string') {
      try {
        const parsed = JSON.parse(sedeId);
        sedeId = parsed._id || sedeId;
      } catch {
        // Si no es JSON, se asume que es el id directamente
      }
    }
    updateData.sede = sedeId;
    if (req.body.cedula !== undefined) {
      updateData.cedula = req.body.cedula;
    }
    if (updateData.numero_franela !== undefined && updateData.numero_franela !== '') {
      const nro = Number(updateData.numero_franela);
      updateData.numero_franela = Number.isNaN(nro) ? undefined : nro;
    }
    if (updateData.habilitar_pago_cuotas !== undefined) {
      updateData.habilitar_pago_cuotas = updateData.habilitar_pago_cuotas === true || updateData.habilitar_pago_cuotas === 'true';
    }
    if (updateData.etiquetas) {
      if (typeof updateData.etiquetas === 'string') {
        try {
          updateData.etiquetas = JSON.parse(updateData.etiquetas);
        } catch {
          updateData.etiquetas = [updateData.etiquetas];
        }
      }
      if (!Array.isArray(updateData.etiquetas)) {
        updateData.etiquetas = [];
      }
    }
    // Si hay archivo de foto, guardar solo la URL pública
    if (req.files && req.files['foto'] && req.files['foto'][0]) {
      const fotoFile = req.files['foto'][0];
      updateData.foto = buildUploadUrl(req, fotoFile, 'alumnos');
    }
    // Si hay archivo de foto_cedula, guardar solo la URL pública
    if (req.files && req.files['foto_cedula'] && req.files['foto_cedula'][0]) {
      const cedulaFile = req.files['foto_cedula'][0];
      updateData.foto_cedula = buildUploadUrl(req, cedulaFile, 'alumnos');
    }
    const alumno = await Alumno.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });
    const debeRecalcularMonto =
      updateData.tipo_mensualidad !== undefined ||
      updateData.monto_personalizado_valor !== undefined ||
      updateData.sede !== undefined;
    if (debeRecalcularMonto) {
      const hoy = new Date();
      const mes = hoy.getMonth() + 1;
      const anio = hoy.getFullYear();
      let monto = 0;
      if (alumno.tipo_mensualidad === 'monto_sede' || !alumno.tipo_mensualidad) {
        const sede = await Sede.findById(alumno.sede);
        monto = sede && sede.costo ? sede.costo : 0;
      } else if (alumno.tipo_mensualidad === 'monto_personalizado') {
        monto = alumno.monto_personalizado_valor || 0;
      } else if (alumno.tipo_mensualidad === 'beca_completa') {
        monto = 0;
      }
      await Mensualidad.updateMany(
        {
          id_alumno: alumno._id,
          mes,
          anio,
          estatus: { $nin: ['Pagado', 'Exonerado'] }
        },
        { $set: { monto_esperado: monto } }
      );
    }
    res.json(alumno);
  } catch (err) {
    res.status(400).json({ error: 'Error al actualizar alumno' });
  }
};

// Eliminar un alumno
exports.deleteAlumno = async (req, res) => {
  try {
    const alumno = await Alumno.findByIdAndDelete(req.params.id);
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });
    res.json({ message: 'Alumno eliminado' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar alumno' });
  }
};

// Dar de baja un alumno (baja lógica)
exports.darDeBajaAlumno = async (req, res) => {
  try {
    const { motivo_baja } = req.body || {};
    const alumno = await Alumno.findByIdAndUpdate(
      req.params.id,
      {
        activo: false,
        dado_de_baja: true,
        estado: 'Baja',
        fecha_baja: new Date(),
        ...(motivo_baja ? { motivo_baja } : {})
      },
      { new: true }
    );
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });
    res.json({ message: 'Alumno dado de baja', alumno });
  } catch (err) {
    res.status(400).json({ error: 'Error al dar de baja al alumno' });
  }
};

// Reactivar un alumno (revertir baja)
exports.reactivarAlumno = async (req, res) => {
  try {
    const alumno = await Alumno.findByIdAndUpdate(
      req.params.id,
      {
        activo: true,
        dado_de_baja: false,
        estado: 'Activo',
        fecha_baja: null,
        motivo_baja: null
      },
      { new: true }
    );
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });
    res.json({ message: 'Alumno reactivado', alumno });
  } catch (err) {
    res.status(400).json({ error: 'Error al reactivar al alumno' });
  }
};

// Listar historial de reposos de un alumno
exports.getRepososAlumno = async (req, res) => {
  try {
    const alumno = await Alumno.findById(req.params.id);
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

    const reposos = await Reposo.find({ id_alumno: alumno._id }).sort({ fecha_inicio: -1, createdAt: -1 });
    res.json(reposos);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener reposos del alumno' });
  }
};

// Registrar reposo y aplicar lógica de mensualidad según tipo
exports.registrarReposoAlumno = async (req, res) => {
  try {
    const alumno = await Alumno.findById(req.params.id);
    if (!alumno) return res.status(404).json({ error: 'Alumno no encontrado' });

    const fecha_inicio_raw = req.body.fecha_inicio || req.body.fechaInicio;
    const tipo_raw = req.body.tipo;

    if (!fecha_inicio_raw || !tipo_raw) {
      return res.status(400).json({ error: 'Los campos obligatorios son fecha_inicio y tipo' });
    }

    const tipo = normalizarTipoReposo(tipo_raw);
    if (!tipo) {
      return res.status(400).json({ error: 'Tipo de reposo inválido. Valores permitidos: Indefinido, Total, Parcial' });
    }

    const fecha_inicio = new Date(fecha_inicio_raw);
    if (Number.isNaN(fecha_inicio.getTime())) {
      return res.status(400).json({ error: 'fecha_inicio inválida' });
    }

    let fecha_fin = null;
    if (req.body.fecha_fin || req.body.fechaFin) {
      fecha_fin = new Date(req.body.fecha_fin || req.body.fechaFin);
      if (Number.isNaN(fecha_fin.getTime())) {
        return res.status(400).json({ error: 'fecha_fin inválida' });
      }
    }

    let certificado = req.body.certificado || null;
    if (req.file) {
      certificado = buildUploadUrl(req, req.file, 'reposos');
    }

    const reposo = await Reposo.create({
      id_alumno: alumno._id,
      fecha_inicio,
      fecha_fin,
      tipo,
      motivo: req.body.motivo || '',
      certificado,
      estado: 'Activo'
    });

    const mesInicio = fecha_inicio.getMonth() + 1;
    const anioInicio = fecha_inicio.getFullYear();

    if (tipo === 'Total') {
      await upsertMensualidadExentaPorReposo(alumno._id, mesInicio, anioInicio);
    }

    if (tipo === 'Indefinido') {
      await Mensualidad.updateMany(
        {
          id_alumno: alumno._id,
          estatus: { $ne: 'Pagado' },
          $or: [
            { anio: { $gt: anioInicio } },
            { anio: anioInicio, mes: { $gte: mesInicio } }
          ]
        },
        {
          $set: {
            monto_esperado: 0,
            estatus: 'Exento por reposo'
          }
        }
      );

      await upsertMensualidadExentaPorReposo(alumno._id, mesInicio, anioInicio);
    }

    res.status(201).json({ message: 'Reposo registrado', reposo });
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar reposo', detalle: err.message });
  }
};
