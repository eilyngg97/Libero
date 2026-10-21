jest.mock('../config/tenantBusinessConnection', () => ({ getTenantBusinessConnection: jest.fn().mockResolvedValue({}) }));
jest.mock('../services/tenantModelService', () => ({ getTenantModel: jest.fn() }));
jest.mock('../middleware/auth', () => ({ hasRequestPermission: (req, permission) => req.user?.permisos?.includes(permission) === true }));

const { getTenantModel } = require('../services/tenantModelService');
const controller = require('../controllers/configuracionController');
const TenantConfig = require('../models/TenantConfig');

let saved;
let model;
const cuenta = (tipo = 'zelle') => ({ tipo, titular: ' Titular QA ', correo: ' pagos@example.com ', banco: 'Banco QA', identificador: '12345678', habilitado: true });
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
const request = (body = {}, permisos = []) => ({ tenantId: 'qa', user: { id: 'qa-user', rol: 'admin', permisos }, body });

beforeEach(() => {
  saved = { pagos: { adicionales: [], por_concepto: { mensualidades: { usar_generales: true }, uniformes: { usar_generales: true } } } };
  const query = () => ({ select: () => ({ lean: async () => saved }), lean: async () => saved });
  model = { findOne: jest.fn(query), findOneAndUpdate: jest.fn((filter, update) => {
    Object.entries(update.$set).forEach(([path, value]) => {
      const keys = path.split('.');
      const field = keys.pop();
      const target = keys.reduce((object, key) => { object[key] ||= {}; return object[key]; }, saved);
      target[field] = value;
    });
    return { lean: async () => saved };
  }) };
  getTenantModel.mockReturnValue(model);
});

test.each(['zelle', 'paypal', 'binance'])('PATCH guarda y GET devuelve la cuenta %s para administracion y portal', async (tipo) => {
  const res = response();
  await controller.patchConfiguracionAdmin(request({ pagos: { adicionales: [cuenta(tipo)] } }), res);
  expect(res.status).not.toHaveBeenCalled();
  expect(saved.pagos.adicionales).toEqual([expect.objectContaining({ tipo, titular: 'Titular QA', correo: 'pagos@example.com' })]);
  const portal = response();
  await controller.getConfiguracionPagos({ ...request(), user: { rol: 'usuario' } }, portal);
  expect(portal.json).toHaveBeenCalledWith(expect.objectContaining({ pagos: expect.objectContaining({ adicionales: saved.pagos.adicionales }) }));
  const admin = response();
  await controller.getConfiguracionAdmin(request(), admin);
  expect(admin.json).toHaveBeenCalledWith(expect.objectContaining({ pagos: expect.objectContaining({ adicionales: saved.pagos.adicionales }) }));
});

test.each([
  null, {}, [cuenta('desconocido')], [cuenta(), cuenta()],
  [{ ...cuenta(), correo: 'invalido' }], [{ ...cuenta(), titular: '' }],
  [{ ...cuenta(), habilitado: 'false' }], [{ ...cuenta(), correo: `${'a'.repeat(255)}@example.com` }]
])('PATCH rechaza metodos adicionales invalidos (%j) sin persistir', async (adicionales) => {
  const res = response();
  await controller.patchConfiguracionAdmin(request({ pagos: { adicionales } }), res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(model.findOneAndUpdate).not.toHaveBeenCalled();
});

test('PATCH por concepto conserva adicionales omitidos, permite desactivar y quitar sin borrar generales', async () => {
  saved.pagos.adicionales = [cuenta()];
  saved.pagos.por_concepto.mensualidades.adicionales = [cuenta('paypal')];
  const res = response();
  await controller.patchConfiguracionAdmin(request({ pagos: { por_concepto: { mensualidades: { usar_generales: false } } } }), res);
  expect(saved.pagos.por_concepto.mensualidades.adicionales[0].tipo).toBe('paypal');
  await controller.patchConfiguracionAdmin(request({ pagos: { por_concepto: { mensualidades: { adicionales: [{ ...cuenta('paypal'), habilitado: false }] } } } }), response());
  expect(saved.pagos.por_concepto.mensualidades.adicionales[0].habilitado).toBe(false);
  await controller.patchConfiguracionAdmin(request({ pagos: { por_concepto: { mensualidades: { adicionales: [] } } } }), response());
  expect(saved.pagos.por_concepto.mensualidades.adicionales).toEqual([]);
  expect(saved.pagos.adicionales[0].tipo).toBe('zelle');
  await controller.patchConfiguracionAdmin(request({ cobro: { recargo_usd: 4 } }), response());
  expect(saved.pagos.adicionales[0].tipo).toBe('zelle');
});

test('cuentas de uniformes respetan permisos de lectura y escritura', async () => {
  saved.pagos.por_concepto.uniformes.adicionales = [cuenta('binance')];
  const denied = response();
  await controller.patchConfiguracionAdmin(request({ pagos: { por_concepto: { uniformes: { adicionales: [] } } } }), denied);
  expect(denied.status).toHaveBeenCalledWith(403);
  expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  const hidden = response();
  await controller.getConfiguracionAdmin(request(), hidden);
  expect(hidden.json.mock.calls[0][0].pagos.por_concepto.uniformes).toBeUndefined();
  const allowed = response();
  await controller.patchConfiguracionAdmin(request({ pagos: { por_concepto: { uniformes: { adicionales: [] } } } }, ['solicitudes_uniformes.manage']), allowed);
  expect(allowed.status).not.toHaveBeenCalled();
  expect(saved.pagos.por_concepto.uniformes.adicionales).toEqual([]);
});

test('esquema conserva cuentas por concepto y rechaza correos, tipos y duplicados', () => {
  const valid = new TenantConfig({ pagos: { adicionales: [cuenta()], por_concepto: { mensualidades: { adicionales: [cuenta('paypal')] } } } });
  expect(valid.validateSync()).toBeUndefined();
  expect(valid.toObject().pagos.por_concepto.mensualidades.adicionales[0].tipo).toBe('paypal');
  expect(new TenantConfig({ pagos: { adicionales: [cuenta(), cuenta()] } }).validateSync()).toBeDefined();
  expect(new TenantConfig({ pagos: { adicionales: [{ ...cuenta(), correo: 'invalido' }] } }).validateSync()).toBeDefined();
  expect(new TenantConfig({ pagos: { adicionales: [cuenta('desconocido')] } }).validateSync()).toBeDefined();
});