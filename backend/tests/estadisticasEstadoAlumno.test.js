jest.mock('../config/tenantBusinessConnection', () => ({
  getTenantBusinessConnection: jest.fn().mockResolvedValue({})
}));
jest.mock('../services/tenantModelService', () => ({ getTenantModel: jest.fn() }));

const { getTenantModel } = require('../services/tenantModelService');
const { getEstadisticasInscritosRetirados } = require('../controllers/alumnoController');

test.each([
  [{ activo: true }, true],
  [{ activo: false }, false],
  [{ activo: true, dado_de_baja: true }, false],
  [{ activo: true, estado: ' BAJA ' }, false],
  [{ estado: 'inactivo' }, false],
  [{}, true]
])('los tres detalles usan el estado actual %j', async (estado, activo) => {
  const alumno = { _id: '507f1f77bcf86cd799439011', nombres: 'Atleta', apellidos: 'QA',
    fecha_inscripcion: '2026-08-01', fecha_baja: '2026-08-20', ...estado };
  const selectAlumno = jest.fn().mockImplementation(() => ({
    populate: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([alumno]) })
  }));
  const Alumno = { find: jest.fn().mockReturnValue({ select: selectAlumno }) };
  const HistorialEstadoAlumno = { find: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue([
      { id_alumno: alumno._id, fecha_evento: '2026-08-10', tipo_movimiento: 'REINGRESO' }
    ]) })
  }) };
  getTenantModel.mockImplementation((connection, name) => ({ Alumno, HistorialEstadoAlumno }[name] || {}));
  const res = { json: jest.fn(), status: jest.fn().mockReturnThis() };
  await getEstadisticasInscritosRetirados({ tenantId: 'qa', query: { anio: '2026' } }, res);
  expect(res.status).not.toHaveBeenCalled();
  const detalle = res.json.mock.calls[0][0].meses[7].detalle;
  for (const tipo of ['inscritos', 'retirados', 'reingresos']) {
    expect(detalle[tipo][0]).toMatchObject({ _id: alumno._id, activo });
  }
  expect(selectAlumno).toHaveBeenCalledTimes(3);
  for (const [campos] of selectAlumno.mock.calls) {
    expect(campos).toContain('activo dado_de_baja estado');
  }
});