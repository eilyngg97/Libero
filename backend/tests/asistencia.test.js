const { validarGrupo, fechaValida } = require('../controllers/asistenciaController');
const Asistencia = require('../models/Asistencia');
const GrupoEntrenamiento = require('../models/GrupoEntrenamiento');

const grupo = { nombre: 'Iniciacion', dias: [1, 3], hora_inicio: '16:00', hora_fin: '17:30', categorias: ['U13'] };
describe('Configuracion de asistencias', () => {
  test('normaliza dias y categorias sin duplicados', () => {
    expect(validarGrupo({ ...grupo, dias: [1, 1, 3], categorias: [' U13 ', 'U13'] })).toMatchObject({ dias: [1, 3], categorias: ['U13'], activo: true });
  });
  test('normaliza ajustes de atletas sin alterar categorias base', () => {
    const id = '507f1f77bcf86cd799439013';
    expect(validarGrupo({ ...grupo, alumnos_adicionales: [id, id.toUpperCase()] })).toMatchObject({ categorias: ['U13'], alumnos_adicionales: [id], alumnos_excluidos: [] });
    expect(() => validarGrupo({ ...grupo, alumnos_adicionales: [id], alumnos_excluidos: [id] })).toThrow();
  });
  test.each([null, 'invalido', ['invalido'], [null], Array(5001).fill('507f1f77bcf86cd799439013')])('rechaza ajustes de atletas invalidos %j', alumnos_adicionales => {
    expect(() => validarGrupo({ ...grupo, alumnos_adicionales })).toThrow();
  });
  test('normaliza varios entrenadores y conserva compatibilidad con entrenador unico', () => {
    expect(validarGrupo({ ...grupo, entrenadores: [' Ana Perez ', 'Maria Rojas', 'Ana Perez', 'Invitado'] })).toMatchObject({ entrenadores: ['Ana Perez', 'Maria Rojas', 'Invitado'], entrenador: 'Ana Perez' });
    expect(validarGrupo({ ...grupo, entrenador: ' Ana Perez ' })).toMatchObject({ entrenadores: ['Ana Perez'], entrenador: 'Ana Perez' });
    expect(validarGrupo({ ...grupo, entrenador: 'Anterior', entrenadores: [] })).toMatchObject({ entrenadores: [], entrenador: '' });
  });
  test('modelos conservan todos los entrenadores y distinguen datos antiguos de listas vacias', () => {
    const entrenadores = ['Ana Perez', 'Maria Rojas', 'Invitado'];
    const datos = { ...grupo, sede: '507f1f77bcf86cd799439011', entrenadores };
    expect(new GrupoEntrenamiento(datos).toObject().entrenadores).toEqual(entrenadores);
    expect(new Asistencia({ ...datos, grupo: '507f1f77bcf86cd799439012', fecha: '2020-10-30' }).toObject().entrenadores).toEqual(entrenadores);
    expect(new GrupoEntrenamiento({ ...grupo, entrenador: 'Anterior' }).entrenadores).toBeUndefined();
    expect(new GrupoEntrenamiento({ ...datos, entrenadores: [] }).entrenadores).toEqual([]);
  });
  test.each(['Ana', null, [null], [''], ['a'.repeat(101)], Array(31).fill('Ana')])('rechaza lista de entrenadores invalida %j', entrenadores => {
    expect(() => validarGrupo({ ...grupo, entrenadores })).toThrow();
  });
  test.each([{ dias: [] }, { dias: [7] }, { dias: ['1'] }, { hora_inicio: '25:00' }, { hora_fin: '15:00' }, { categorias: [] }, { activo: 'false' }, { nombre: '' }])('rechaza configuracion invalida %j', (fields) => {
    expect(() => validarGrupo({ ...grupo, ...fields })).toThrow();
  });
  test.each(['2026-02-29', '2026-13-01', '2026-10-32', '30/10/2026', undefined])('rechaza fecha %s', value => expect(fechaValida(value)).toBe(false));
  test('acepta fecha real y anio bisiesto', () => {
    expect(fechaValida('2026-10-30')).toBe(true);
    expect(fechaValida('2028-02-29')).toBe(true);
  });
  test('la unicidad incluye sede, grupo y fecha', () => {
    expect(Asistencia.schema.indexes()).toContainEqual([{ sede: 1, grupo: 1, fecha: 1 }, { unique: true }]);
  });
});

jest.mock('../config/tenantBusinessConnection', () => ({ getTenantBusinessConnection: jest.fn() }));
jest.mock('../services/tenantModelService', () => ({ getTenantModel: jest.fn() }));
jest.mock('../config/secrets', () => ({ getJwtVerificationSecrets: () => ['qa-asistencias-only'] }));
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const controller = require('../controllers/asistenciaController');
const sedeId = '507f1f77bcf86cd799439011';
const grupoId = '507f1f77bcf86cd799439012';
const alumnoId = '507f1f77bcf86cd799439013';
const fecha = '2020-10-30';
const chain = value => {
  const query = { lean: jest.fn(async () => value) };
  for (const method of ['select', 'sort', 'skip', 'limit']) query[method] = jest.fn(() => query);
  return query;
};
let models;
let req;
let res;
const listaGuardada = () => ({ _id: '507f1f77bcf86cd799439014', sede: sedeId, grupo: grupoId, fecha, __v: 2, ...grupo, registros: [{ alumno: alumnoId, nombre: 'Perez, Ana', categoria: 'U13', estado: 'presente', observacion: '' }] });

describe('Listas por sede y tenant', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    models = {
      Sede: { findById: jest.fn(() => chain({ _id: sedeId })) },
      Alumno: { find: jest.fn(() => chain([{ _id: alumnoId, nombres: 'Ana', apellidos: 'Perez', categoria: 'U13' }])), distinct: jest.fn(async () => ['U13']) },
      TenantConfig: { findOne: jest.fn(() => chain({ categorias: { reglas: [{ etiqueta: 'U15' }] } })) },
      Entrenador: { find: jest.fn(() => chain([])), findOne: jest.fn(() => chain({ _id: '507f1f77bcf86cd799439017', usuario: alumnoId, estado: 'activo' })) },
      GrupoEntrenamiento: { findOne: jest.fn(() => chain({ _id: grupoId, ...grupo, dias: [5], activo: true })), find: jest.fn(filter => chain(filter.entrenadores_ids ? [{ _id: grupoId }] : [])), create: jest.fn(async value => value), findOneAndUpdate: jest.fn(async () => null) },
      Asistencia: { findOne: jest.fn(() => chain(null)), find: jest.fn(() => chain([])), create: jest.fn(async value => value), findOneAndUpdate: jest.fn(async value => value), countDocuments: jest.fn(async () => 0) }
    };
    getTenantBusinessConnection.mockResolvedValue({ tenant: 'academia-a' });
    getTenantModel.mockImplementation((connection, name) => models[name]);
    req = { query: { sede: sedeId, fecha }, params: { grupo: grupoId }, tenant: { tenantId: 'academia-a', dbUri: 'mongodb://tenant-a' }, user: { id: alumnoId }, body: { fecha, version: null, registros: [{ alumno: alumnoId, estado: 'presente', observacion: '' }] } };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  });
  test('usa conexion tenant y exige que exista la sede', async () => {
    models.Sede.findById.mockReturnValue(chain(null));
    await controller.lista(req, res);
    expect(getTenantBusinessConnection).toHaveBeenCalledWith(req.tenant);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(models.Asistencia.findOne).not.toHaveBeenCalled();
  });
  test('lista solo las categorias configuradas del tenant en su orden sin mezclar categorias de alumnos', async () => {
    models.TenantConfig.findOne.mockReturnValue(chain({ categorias: { reglas: [{ etiqueta: 'MAYORES / LIBRE', orden: 3 }, { etiqueta: 'U7', orden: 1 }, { etiqueta: 'U15/INFANTIL', orden: 2 }] } }));
    await controller.grupos(req, res);
    expect(models.Alumno.distinct).not.toHaveBeenCalled();
    expect(getTenantModel).toHaveBeenCalledWith({ tenant: 'academia-a' }, 'TenantConfig');
    expect(res.json).toHaveBeenCalledWith({ grupos: [], categorias: ['U7', 'U15/INFANTIL', 'MAYORES / LIBRE'], entrenadores: [], entrenadores_registrados: [] });
  });
  test('sin categorias configuradas no ofrece categorias historicas de alumnos', async () => {
    models.TenantConfig.findOne.mockReturnValue(chain(null));
    await controller.grupos(req, res);
    expect(res.json).toHaveBeenCalledWith({ grupos: [], categorias: [], entrenadores: [], entrenadores_registrados: [] });
    expect(models.Alumno.distinct).not.toHaveBeenCalled();
  });
  test('conserva el orden guardado de categorias si no tienen campo orden', async () => {
    models.TenantConfig.findOne.mockReturnValue(chain({ categorias: { reglas: [{ etiqueta: 'U7' }, { etiqueta: 'U15' }, { etiqueta: 'LIBRE' }] } }));
    await controller.grupos(req, res);
    expect(res.json).toHaveBeenCalledWith({ grupos: [], categorias: ['U7', 'U15', 'LIBRE'], entrenadores: [], entrenadores_registrados: [] });
  });
  test('ofrece solo nombres de entrenadores de la conexion de la academia sin datos privados', async () => {
    const consulta = chain([{ nombre: 'Maria', apellido: 'Rojas', cedula: 'privada' }, { nombre: 'Ana', apellido: 'Perez' }, { nombre: 'Ana', apellido: 'Perez' }]);
    models.Entrenador.find.mockReturnValue(consulta);
    await controller.grupos(req, res);
    expect(getTenantBusinessConnection).toHaveBeenCalledWith(req.tenant);
    expect(getTenantModel).toHaveBeenCalledWith({ tenant: 'academia-a' }, 'Entrenador');
    expect(models.Entrenador.find).toHaveBeenCalledWith({});
    expect(consulta.select).toHaveBeenCalledWith('_id nombre apellido estado');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ grupos: [], categorias: ['U15'], entrenadores: ['Ana Perez', 'Maria Rojas'] }));
    expect(res.json.mock.calls[0][0].entrenadores_registrados).not.toEqual(expect.arrayContaining([expect.objectContaining({ cedula: 'privada' })]));
  });
  test('guarda el nombre de un entrenador externo sin exigir registro en el sistema', async () => {
    req.params = {};
    req.body = { ...grupo, entrenador: '  Entrenador invitado  ' };
    await controller.guardarGrupo(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(models.GrupoEntrenamiento.create).toHaveBeenCalledWith(expect.objectContaining({ entrenador: 'Entrenador invitado', sede: sedeId }));
    expect(models.Entrenador.find).not.toHaveBeenCalled();
  });
  test('no admite grupos de otra sede', async () => {
    models.GrupoEntrenamiento.findOne.mockReturnValue(chain(null));
    await controller.lista(req, res);
    expect(models.GrupoEntrenamiento.findOne).toHaveBeenCalledWith({ _id: grupoId, sede: sedeId, activo: true });
    expect(res.status).toHaveBeenCalledWith(404);
  });
  test('consulta integrantes por categoria o inclusion y aplica exclusiones sin quitar el filtro de activos y sede', async () => {
    const adicional = '507f1f77bcf86cd799439015';
    models.GrupoEntrenamiento.findOne.mockReturnValue(chain({ ...grupo, dias: [5], alumnos_adicionales: [adicional], alumnos_excluidos: [alumnoId] }));
    models.Alumno.find.mockReturnValue(chain([{ _id: adicional, nombres: 'Luis', apellidos: 'Diaz', categoria: 'U15' }]));
    await controller.lista(req, res);
    expect(models.Alumno.find).toHaveBeenCalledWith(expect.objectContaining({ sede: sedeId, activo: { $ne: false }, dado_de_baja: { $ne: true }, $or: [{ categoria: { $in: ['U13'] } }, { _id: { $in: [adicional] } }], _id: { $nin: [alumnoId] } }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ registros: [expect.objectContaining({ alumno: adicional, categoria: 'U15' })] }));
  });
  test('guarda ajustes solo en el grupo sin modificar el alumno', async () => {
    req.params = {};
    req.body = { ...grupo, alumnos_adicionales: [alumnoId] };
    await controller.guardarGrupo(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(models.Alumno.find).toHaveBeenCalledWith({ sede: sedeId, _id: { $in: [alumnoId] } });
    expect(models.GrupoEntrenamiento.create).toHaveBeenCalledWith(expect.objectContaining({ categorias: ['U13'], alumnos_adicionales: [alumnoId], alumnos_excluidos: [] }));
  });
  test('rechaza atletas de otra sede o tenant antes de modificar el grupo', async () => {
    req.params = {};
    req.body = { ...grupo, alumnos_adicionales: [alumnoId] };
    models.Alumno.find.mockReturnValue(chain([]));
    await controller.guardarGrupo(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(models.GrupoEntrenamiento.create).not.toHaveBeenCalled();
  });
  test('rechaza adicionales dados de baja pero permite excluirlos', async () => {
    req.params = {};
    req.body = { ...grupo, alumnos_adicionales: [alumnoId] };
    models.Alumno.find.mockReturnValue(chain([{ _id: alumnoId, activo: false }]));
    await controller.guardarGrupo(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(models.GrupoEntrenamiento.create).not.toHaveBeenCalled();
    req.body = { ...grupo, alumnos_excluidos: [alumnoId] };
    await controller.guardarGrupo(req, res);
    expect(res.status).toHaveBeenLastCalledWith(201);
  });
  test('catalogo de ajustes consulta solo nombres y categorias de atletas de la sede actual', async () => {
    await controller.atletas(req, res);
    expect(models.Alumno.find).toHaveBeenCalledWith({ sede: sedeId });
    expect(getTenantBusinessConnection).toHaveBeenCalledWith(req.tenant);
    expect(res.json).toHaveBeenCalledWith({ atletas: [{ _id: alumnoId, nombre: 'Perez, Ana', categoria: 'U13', activo: true }] });
  });
  test('solo incluye alumnos activos de la sede y categorias del grupo', async () => {
    await controller.lista(req, res);
    expect(models.Alumno.find).toHaveBeenCalledWith(expect.objectContaining({ sede: sedeId, categoria: { $in: ['U13'] }, activo: { $ne: false }, dado_de_baja: { $ne: true } }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ registros: [expect.objectContaining({ alumno: alumnoId, estado: '' })] }));
  });
  test('guarda nombres y categorias desde backend, no desde cliente', async () => {
    req.body.registros[0].nombre = 'Nombre falsificado';
    await controller.guardarLista(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(models.Asistencia.create).toHaveBeenCalledWith(expect.objectContaining({ sede: sedeId, grupo: grupoId, fecha, registros: [expect.objectContaining({ nombre: 'Perez, Ana', estado: 'presente' })] }));
  });
  test('guarda todos los entrenadores del grupo en el snapshot de la asistencia', async () => {
    models.GrupoEntrenamiento.findOne.mockReturnValue(chain({ _id: grupoId, ...grupo, dias: [5], activo: true, entrenador: 'Ana Perez', entrenadores: ['Ana Perez', 'Invitado'] }));
    await controller.guardarLista(req, res);
    expect(models.Asistencia.create).toHaveBeenCalledWith(expect.objectContaining({ entrenadores: ['Ana Perez', 'Invitado'] }));
  });
  test('guarda registros sin marcar sin convertirlos en ausencias', async () => {
    req.body.registros[0].estado = '';
    req.body.registros[0].observacion = 'Pendiente de llegar';
    await controller.guardarLista(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(models.Asistencia.create).toHaveBeenCalledWith(expect.objectContaining({ registros: [expect.objectContaining({ estado: '', observacion: 'Pendiente de llegar' })] }));
  });
  test('modelo admite sin marcar pero no estados desconocidos', () => {
    const data = { sede: sedeId, grupo: grupoId, fecha, registros: [{ alumno: alumnoId, nombre: 'Ana', estado: '' }] };
    expect(new Asistencia(data).validateSync()).toBeUndefined();
    data.registros[0].estado = 'desconocido';
    expect(new Asistencia(data).validateSync()).toBeDefined();
  });
  test('rechaza alumnos inyectados o lista incompleta', async () => {
    req.body.registros[0].alumno = '507f1f77bcf86cd799439099';
    await controller.guardarLista(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(models.Asistencia.create).not.toHaveBeenCalled();
  });
  test('rechaza alumnos repetidos', async () => {
    req.body.registros.push({ ...req.body.registros[0] });
    await controller.guardarLista(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  test('rechaza asistencia futura', async () => {
    req.body.fecha = '2099-01-01';
    await controller.guardarLista(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(models.Asistencia.create).not.toHaveBeenCalled();
  });
  test('no acepta una fecha fuera del horario semanal', async () => {
    req.body.fecha = '2020-10-29';
    await controller.guardarLista(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  test('consulta historica conserva alumnos aunque grupo o alumno cambien', async () => {
    models.Asistencia.findOne.mockReturnValue(chain(listaGuardada()));
    await controller.lista(req, res);
    expect(models.Alumno.find).toHaveBeenCalledWith({ _id: { $in: [alumnoId] } });
    expect(models.GrupoEntrenamiento.findOne).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ tomada: true, registros: [{ ...listaGuardada().registros[0], foto: '' }] }));
  });
  test('lista nueva incluye fotos del alumno sin guardarlas en el snapshot de asistencia', async () => {
    models.Alumno.find.mockReturnValue(chain([{ _id: alumnoId, nombres: 'Ana', apellidos: 'Perez', categoria: 'U13', foto: '/uploads/academia-a/alumnos/ana.webp' }]));
    await controller.lista(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ registros: [expect.objectContaining({ foto: '/uploads/academia-a/alumnos/ana.webp' })] }));
    await controller.guardarLista(req, res);
    expect(models.Asistencia.create.mock.calls[0][0].registros[0]).not.toHaveProperty('foto');
  });
  test('lista guardada carga fotos actuales sin reemplazar nombres ni categorias historicas', async () => {
    models.Asistencia.findOne.mockReturnValue(chain(listaGuardada()));
    models.Alumno.find.mockReturnValue(chain([{ _id: alumnoId, nombres: 'Nombre nuevo', categoria: 'U15', foto: '/uploads/academia-a/alumnos/actual.webp' }]));
    await controller.lista(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ registros: [{ ...listaGuardada().registros[0], foto: '/uploads/academia-a/alumnos/actual.webp' }] }));
  });
  test('edita una lista conservando su snapshot y sube la version atomicamente', async () => {
    models.Asistencia.findOne.mockReturnValue(chain(listaGuardada()));
    req.body.version = 2;
    req.body.registros[0].estado = 'justificado';
    await controller.guardarLista(req, res);
    expect(models.Asistencia.findOneAndUpdate).toHaveBeenCalledWith({ sede: sedeId, grupo: grupoId, fecha, __v: 2 }, expect.objectContaining({ $inc: { __v: 1 }, $set: expect.objectContaining({ registros: [expect.objectContaining({ estado: 'justificado', nombre: 'Perez, Ana' })] }) }), expect.any(Object));
    expect(models.Alumno.find).not.toHaveBeenCalled();
  });
  test('rechaza version obsoleta sin sobrescribir', async () => {
    models.Asistencia.findOne.mockReturnValue(chain(listaGuardada()));
    req.body.version = 1;
    await controller.guardarLista(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(models.Asistencia.findOneAndUpdate).not.toHaveBeenCalled();
  });
  test('detecta carrera entre lectura y escritura', async () => {
    models.Asistencia.findOne.mockReturnValue(chain(listaGuardada()));
    req.body.version = 2;
    models.Asistencia.findOneAndUpdate.mockResolvedValue(null);
    await controller.guardarLista(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
  test('devuelve conflicto si otra persona crea la misma lista', async () => {
    models.Asistencia.create.mockRejectedValue({ code: 11000 });
    await controller.guardarLista(req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });
  test('grupo inactivo mantiene su sesion guardada sin duplicarla', async () => {
    models.Asistencia.find.mockReturnValue(chain([listaGuardada()]));
    await controller.sesiones(req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ sesiones: [expect.objectContaining({ tomada: true, presentes: 1, total: 1 })] }));
  });
  test('la actualizacion del grupo se restringe a su sede', async () => {
    req.params.id = grupoId; req.body = grupo;
    await controller.guardarGrupo(req, res);
    expect(models.GrupoEntrenamiento.findOneAndUpdate).toHaveBeenCalledWith({ _id: grupoId, sede: sedeId }, expect.any(Object), expect.any(Object));
    expect(res.status).toHaveBeenCalledWith(404);
  });
  test('historial mensual calcula porcentajes sobre sesiones del alumno y mantiene pendientes separados', async () => {
    req.query.mes = '2020-10';
    const estados = ['presente', 'ausente', 'justificado', ''];
    models.Asistencia.find.mockReturnValue(chain(estados.map((estado, index) => ({ ...listaGuardada(), fecha: `2020-10-${String(index + 1).padStart(2, '0')}`, registros: [{ ...listaGuardada().registros[0], estado }] }))));
    await controller.historial(req, res);
    expect(models.Asistencia.find).toHaveBeenCalledWith({ sede: sedeId, fecha: { $gte: '2020-10-01', $lte: '2020-10-31' } });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ mes: '2020-10', grupos: [expect.objectContaining({ grupo: grupoId, sesiones: 4, alumnos: [expect.objectContaining({ alumno: alumnoId, presentes: 1, ausentes: 1, justificados: 1, sin_marcar: 1, total: 4, porcentaje: 25 })] })] }));
  });
  test('historial mensual no mezcla grupos ni agrega sesiones anteriores al ingreso del alumno', async () => {
    req.query.mes = '2020-10';
    const alumnoNuevo = { alumno: '507f1f77bcf86cd799439015', nombre: 'Rojas, Maria', categoria: 'U15', estado: 'presente' };
    models.Asistencia.find.mockReturnValue(chain([
      { ...listaGuardada(), fecha: '2020-10-01' },
      { ...listaGuardada(), fecha: '2020-10-02', registros: [...listaGuardada().registros, alumnoNuevo] },
      { ...listaGuardada(), grupo: '507f1f77bcf86cd799439016', nombre: 'Otro grupo', registros: [{ ...listaGuardada().registros[0], estado: 'ausente' }] }
    ]));
    await controller.historial(req, res);
    const reporte = res.json.mock.calls[0][0];
    expect(reporte.grupos).toHaveLength(2);
    expect(reporte.grupos[0].alumnos.find(item => item.alumno === alumnoNuevo.alumno)).toMatchObject({ total: 1, presentes: 1, porcentaje: 100, categoria: 'U15' });
    expect(reporte.grupos[1].alumnos[0]).toMatchObject({ total: 1, ausentes: 1, porcentaje: 0 });
    expect(models.GrupoEntrenamiento.find).not.toHaveBeenCalled();
  });
  test.each(['2020-13', '2020-00', '2020-1', 'invalido'])('historial mensual rechaza mes %s', async mes => {
    req.query.mes = mes;
    await controller.historial(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(models.Asistencia.find).not.toHaveBeenCalled();
  });
  test('historial mensual vacio no consulta fotos ni inventa sesiones programadas', async () => {
    req.query.mes = '2020-10';
    await controller.historial(req, res);
    expect(res.json).toHaveBeenCalledWith({ mes: '2020-10', grupos: [] });
    expect(models.Alumno.find).not.toHaveBeenCalled();
  });
  test('historial valida rango y pagina', async () => {
    req.query = { sede: sedeId, desde: '2020-01-01', hasta: '2022-01-01' };
    await controller.historial(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
  test.each([
    [null, [], 'get', '/grupos', 401],
    ['usuario', [], 'get', '/grupos', 403],
    ['entrenador', ['asistencias.view'], 'get', '/grupos', 200],
    ['entrenador', ['asistencias.view'], 'put', `/lista/${grupoId}`, 403],
    ['entrenador', ['asistencias.view', 'asistencias.manage'], 'put', `/lista/${grupoId}`, 201],
    ['admin', [], 'get', '/grupos', 200],
    ['entrenador', ['asistencias.view'], 'get', '/atletas', 403],
    ['entrenador', ['asistencias.view', 'asistencias.manage'], 'get', '/atletas', 403]
  ])('HTTP rol %s permisos %j %s %s => %s', async (rol, permisos, method, path, status) => {
    const express = require('express');
    const request = require('supertest');
    const jwt = require('jsonwebtoken');
    const app = express();
    app.use(express.json());
    app.use((request, response, next) => { request.tenant = req.tenant; next(); });
    app.use('/asistencias', require('../routes/asistencias'));
    const operation = request(app)[method](`/asistencias${path}?sede=${sedeId}`);
    if (rol) operation.set('Authorization', `Bearer ${jwt.sign({ id: alumnoId, rol, permisos }, 'qa-asistencias-only')}`);
    if (method === 'put') operation.send(req.body);
    const response = await operation;
    expect(response.status).toBe(status);
  });

  test('un entrenador no puede leer una lista ajena aunque ya este guardada', async () => {
    req.user.rol = 'entrenador';
    req.params.grupo = '507f1f77bcf86cd799439099';
    models.Asistencia.findOne.mockReturnValue(chain(listaGuardada()));
    await controller.lista(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(models.Asistencia.findOne).not.toHaveBeenCalled();
    expect(models.Entrenador.findOne).toHaveBeenCalledWith({ usuario: alumnoId });
  });
  test('un entrenador no puede escribir una asistencia de otro grupo', async () => {
    req.user.rol = 'entrenador';
    req.params.grupo = '507f1f77bcf86cd799439099';
    await controller.guardarLista(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(models.Asistencia.create).not.toHaveBeenCalled();
  });
  test('el historial del entrenador filtra grupos antes de consultar listas', async () => {
    req.user.rol = 'entrenador';
    req.query.mes = '2020-10';
    await controller.historial(req, res);
    expect(models.Asistencia.find).toHaveBeenCalledWith(expect.objectContaining({ grupo: { $in: [grupoId] }, sede: sedeId }));
  });
  test('un entrenador no vinculado o inactivo no puede consultar listas', async () => {
    req.user.rol = 'entrenador';
    models.Entrenador.findOne.mockReturnValue(chain(null));
    await controller.lista(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    models.Entrenador.findOne.mockReturnValue(chain({ _id: alumnoId, estado: 'inactivo' }));
    await controller.lista(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(models.Asistencia.findOne).not.toHaveBeenCalled();
  });
  test('el entrenador no puede configurar grupos', async () => {
    req.user.rol = 'entrenador';
    req.body = grupo;
    await controller.guardarGrupo(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(models.GrupoEntrenamiento.create).not.toHaveBeenCalled();
  });
  test('administracion rechaza IDs de entrenadores de otra academia', async () => {
    req.params = {};
    req.body = { ...grupo, entrenadores_ids: ['507f1f77bcf86cd799439017'] };
    await controller.guardarGrupo(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(models.GrupoEntrenamiento.create).not.toHaveBeenCalled();
  });
  test('administracion asigna entrenadores activos registrados mediante IDs', async () => {
    req.params = {};
    req.body = { ...grupo, entrenadores_ids: ['507f1f77bcf86cd799439017'] };
    models.Entrenador.find.mockReturnValue(chain([{ _id: '507f1f77bcf86cd799439017' }]));
    await controller.guardarGrupo(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(models.GrupoEntrenamiento.create).toHaveBeenCalledWith(expect.objectContaining({ entrenadores_ids: ['507f1f77bcf86cd799439017'], sede: sedeId }));
  });
  test('las sesiones del entrenador filtran grupos y listas antes de devolver alumnos', async () => {
    req.user.rol = 'entrenador';
    await controller.sesiones(req, res);
    expect(models.Asistencia.find).toHaveBeenCalledWith({ sede: sedeId, fecha, grupo: { $in: [grupoId] } });
    expect(models.GrupoEntrenamiento.find).toHaveBeenLastCalledWith(expect.objectContaining({ _id: { $in: [grupoId] }, sede: sedeId }));
  });
});

const describeMongo = process.env.RUN_MONGO_ASISTENCIA_TESTS === '1' ? describe : describe.skip;
describeMongo('Persistencia real en bases temporales de asistencias', () => {
  const mongoose = require('mongoose');
  let connections;
  let modelos;
  const invoke = async (action, tenantId = 'a', body = {}, extra = {}) => {
    const request = { tenant: { tenantId }, query: { sede: sedeId, fecha }, params: { grupo: grupoId }, user: { id: alumnoId }, body, ...extra };
    const response = { statusCode: 200, status(value) { this.statusCode = value; return this; }, json(value) { this.body = value; return this; } };
    await controller[action](request, response);
    return response;
  };
  beforeAll(async () => {
    connections = {};
    modelos = {};
    for (const tenantId of ['a', 'b']) {
      const dbName = `libero_qa_asistencias_${Date.now()}_${process.pid}_${tenantId}`;
      const connection = await mongoose.createConnection(`mongodb://127.0.0.1:27017/${dbName}`, { serverSelectionTimeoutMS: 5000 }).asPromise();
      connections[tenantId] = connection;
      const names = ['Sede', 'Alumno', 'TenantConfig', 'GrupoEntrenamiento', 'Asistencia', 'Entrenador'];
      modelos[tenantId] = Object.fromEntries(names.map(name => [name, connection.model(name, require(`../models/${name}`).schema)]));
      await Promise.all(Object.values(modelos[tenantId]).map(model => model.init()));
      await modelos[tenantId].Sede.create({ _id: sedeId, nombre: `Sede ${tenantId}`, direccion: 'QA', costo: 0 });
      await modelos[tenantId].GrupoEntrenamiento.create({ _id: grupoId, sede: sedeId, ...grupo, dias: [5] });
      await modelos[tenantId].Alumno.create({ _id: alumnoId, sede: sedeId, nombres: `Ana ${tenantId}`, apellidos: 'QA', categoria: 'U13', fecha_inicio_cobro: new Date() });
    }
  }, 30000);
  beforeEach(async () => {
    getTenantBusinessConnection.mockImplementation(async tenant => connections[tenant.tenantId]);
    getTenantModel.mockImplementation((connection, name) => connection.model(name));
    await Promise.all(Object.values(modelos).map(models => models.Asistencia.deleteMany({})));
  });
  afterAll(async () => {
    for (const connection of Object.values(connections || {})) {
      try {
        if (!connection.name.startsWith('libero_qa_asistencias_')) throw new Error('Base QA invalida');
        await connection.dropDatabase();
      } finally { await connection.close(); }
    }
  });
  const body = () => ({ fecha, version: null, registros: [{ alumno: alumnoId, estado: 'presente', observacion: 'Prueba QA' }] });
  test('dos altas concurrentes dejan exactamente una lista', async () => {
    const responses = await Promise.all([invoke('guardarLista', 'a', body()), invoke('guardarLista', 'a', body())]);
    expect(responses.map(response => response.statusCode).sort()).toEqual([201, 409]);
    expect(await modelos.a.Asistencia.countDocuments({})).toBe(1);
  });
  test('dos ediciones concurrentes guardan solo la primera version', async () => {
    await invoke('guardarLista', 'a', body());
    const record = await modelos.a.Asistencia.findOne().lean();
    const first = { ...body(), version: record.__v };
    const second = { ...body(), version: record.__v, registros: [{ alumno: alumnoId, estado: 'ausente', observacion: '' }] };
    const responses = await Promise.all([invoke('guardarLista', 'a', first), invoke('guardarLista', 'a', second)]);
    expect(responses.map(response => response.statusCode).sort()).toEqual([200, 409]);
    expect((await modelos.a.Asistencia.findOne().lean()).__v).toBe(1);
  });
  test('identificadores iguales en tenants distintos no comparten datos', async () => {
    await invoke('guardarLista', 'a', body());
    const other = await invoke('lista', 'b');
    expect(other.body.tomada).toBe(false);
    expect(other.body.registros[0].nombre).toBe('QA, Ana b');
    expect(await modelos.b.Asistencia.countDocuments({})).toBe(0);
  });
  test('guarda avance parcial real y luego completa el pendiente sin perder notas ni cambiar de lista', async () => {
    const segundoId = '507f1f77bcf86cd799439015';
    await modelos.a.Alumno.create({ _id: segundoId, sede: sedeId, nombres: 'Maria', apellidos: 'QA', categoria: 'U13', fecha_inicio_cobro: new Date() });
    const parcial = { ...body(), registros: [...body().registros, { alumno: segundoId, estado: '', observacion: 'Por llegar' }] };
    const creada = await invoke('guardarLista', 'a', parcial);
    expect(creada.statusCode).toBe(201);
    const primera = await modelos.a.Asistencia.findOne().lean();
    expect(primera.registros.find(item => String(item.alumno) === segundoId).estado).toBe('');
    const sesiones = await invoke('sesiones', 'a');
    expect(sesiones.body.sesiones[0]).toMatchObject({ presentes: 1, total: 2, sin_marcar: 1 });
    const consulta = await invoke('lista', 'a');
    const completada = await invoke('guardarLista', 'a', { ...parcial, version: consulta.body.__v, registros: parcial.registros.map(item => ({ ...item, estado: 'presente' })) });
    expect(completada.statusCode).toBe(200);
    const segunda = await modelos.a.Asistencia.findOne().lean();
    expect(String(segunda._id)).toBe(String(primera._id));
    expect(segunda.__v).toBe(primera.__v + 1);
    expect(segunda.registros.find(item => String(item.alumno) === alumnoId).observacion).toBe('Prueba QA');
    expect(segunda.registros.find(item => String(item.alumno) === segundoId)).toMatchObject({ estado: 'presente', observacion: 'Por llegar' });
    expect(await modelos.a.Asistencia.countDocuments({})).toBe(1);
    await modelos.a.Alumno.deleteOne({ _id: segundoId });
  });
  test('historial mensual real cuenta estados y fechas solo de la sede, mes y tenant consultados', async () => {
    const estados = ['presente', 'ausente', 'justificado', ''];
    for (const [index, estado] of estados.entries()) {
      const creada = await invoke('guardarLista', 'a', { ...body(), fecha: `2020-10-${String(2 + index * 7).padStart(2, '0')}`, registros: [{ alumno: alumnoId, estado, observacion: 'QA mensual' }] });
      expect(creada.statusCode).toBe(201);
    }
    await modelos.a.Asistencia.create({ ...listaGuardada(), _id: undefined, fecha: '2020-09-25' });
    await modelos.a.Asistencia.create({ ...listaGuardada(), _id: undefined, sede: '507f1f77bcf86cd799439099' });
    const reporte = await invoke('historial', 'a', {}, { query: { sede: sedeId, mes: '2020-10' } });
    expect(reporte.statusCode).toBe(200);
    expect(reporte.body.grupos).toHaveLength(1);
    expect(reporte.body.grupos[0]).toMatchObject({ sesiones: 4, fechas: ['2020-10-02', '2020-10-09', '2020-10-16', '2020-10-23'], alumnos: [expect.objectContaining({ presentes: 1, ausentes: 1, justificados: 1, sin_marcar: 1, total: 4, porcentaje: 25 })] });
    const otroTenant = await invoke('historial', 'b', {}, { query: { sede: sedeId, mes: '2020-10' } });
    expect(otroTenant.body.grupos).toEqual([]);
  });
  test('la lista historica conserva alumnos y categoria al editar el grupo', async () => {
    await invoke('guardarLista', 'a', body());
    await modelos.a.GrupoEntrenamiento.updateOne({ _id: grupoId }, { $set: { categorias: ['U15'], activo: false } });
    const response = await invoke('lista', 'a');
    expect(response.body.tomada).toBe(true);
    expect(response.body.categorias).toEqual(['U13']);
    expect(response.body.registros[0].categoria).toBe('U13');
  });
  test('ajustes reales incluyen otra categoria, excluyen integrantes base y no cambian perfiles ni asistencias anteriores', async () => {
    const adicional = '507f1f77bcf86cd799439021';
    try {
      await modelos.a.Alumno.create({ _id: adicional, sede: sedeId, nombres: 'Luis', apellidos: 'QA', categoria: 'U15', fecha_inicio_cobro: new Date() });
      const configurado = await invoke('guardarGrupo', 'a', { ...grupo, dias: [5], alumnos_adicionales: [adicional], alumnos_excluidos: [alumnoId] }, { params: { id: grupoId } });
      expect(configurado.statusCode).toBe(200);
      const consulta = await invoke('lista', 'a');
      expect(consulta.body.registros).toEqual([expect.objectContaining({ alumno: expect.anything(), categoria: 'U15', nombre: 'QA, Luis' })]);
      expect(String(consulta.body.registros[0].alumno)).toBe(adicional);
      const sesiones = await invoke('sesiones', 'a');
      expect(sesiones.body.sesiones[0].total).toBe(1);
      const guardada = await invoke('guardarLista', 'a', { ...body(), registros: [{ alumno: adicional, estado: 'presente', observacion: 'Grupo superior' }] });
      expect(guardada.statusCode).toBe(201);
      await invoke('guardarGrupo', 'a', { ...grupo, dias: [5], alumnos_adicionales: [], alumnos_excluidos: [] }, { params: { id: grupoId } });
      const historica = await invoke('lista', 'a');
      expect(historica.body.tomada).toBe(true);
      expect(historica.body.registros).toHaveLength(1);
      expect(String(historica.body.registros[0].alumno)).toBe(adicional);
      expect(historica.body.registros[0].categoria).toBe('U15');
      const nueva = await invoke('lista', 'a', {}, { query: { sede: sedeId, fecha: '2020-11-06' } });
      expect(nueva.body.registros).toHaveLength(1);
      expect(String(nueva.body.registros[0].alumno)).toBe(alumnoId);
      expect((await modelos.a.Alumno.findById(alumnoId).lean()).categoria).toBe('U13');
      expect((await modelos.a.Alumno.findById(adicional).lean()).categoria).toBe('U15');
      const otroTenant = await invoke('lista', 'b');
      expect(otroTenant.body.registros).toHaveLength(1);
      expect(otroTenant.body.registros[0].nombre).toBe('QA, Ana b');
    } finally {
      await modelos.a.Alumno.deleteOne({ _id: adicional });
      await modelos.a.GrupoEntrenamiento.updateOne({ _id: grupoId }, { $set: { categorias: ['U13'], dias: [5], activo: true, alumnos_adicionales: [], alumnos_excluidos: [] } });
    }
  });
  test('ajustes reales rechazan atletas de otra sede, otro tenant o dados de baja sin modificar el grupo', async () => {
    const otraSede = '507f1f77bcf86cd799439022';
    const otroTenant = '507f1f77bcf86cd799439023';
    const inactivo = '507f1f77bcf86cd799439024';
    try {
      await modelos.a.Alumno.create({ _id: otraSede, sede: '507f1f77bcf86cd799439099', nombres: 'Otra', apellidos: 'Sede', categoria: 'U15', fecha_inicio_cobro: new Date() });
      await modelos.b.Alumno.create({ _id: otroTenant, sede: sedeId, nombres: 'Otro', apellidos: 'Tenant', categoria: 'U15', fecha_inicio_cobro: new Date() });
      await modelos.a.Alumno.create({ _id: inactivo, sede: sedeId, nombres: 'Baja', apellidos: 'QA', categoria: 'U15', activo: false, fecha_inicio_cobro: new Date() });
      for (const id of [otraSede, otroTenant, inactivo]) {
        const respuesta = await invoke('guardarGrupo', 'a', { ...grupo, dias: [5], alumnos_adicionales: [id] }, { params: { id: grupoId } });
        expect(respuesta.statusCode).toBe(400);
      }
      const guardado = await modelos.a.GrupoEntrenamiento.findById(grupoId).lean();
      expect(guardado.alumnos_adicionales).toEqual([]);
      expect(guardado.categorias).toEqual(['U13']);
    } finally {
      await modelos.a.Alumno.deleteMany({ _id: { $in: [otraSede, inactivo] } });
      await modelos.b.Alumno.deleteOne({ _id: otroTenant });
    }
  });
});