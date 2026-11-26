jest.mock('../config/tenantBusinessConnection', () => ({ getTenantBusinessConnection: jest.fn() }));
jest.mock('../services/operacionService', () => ({ registrarOperacion: jest.fn().mockResolvedValue(undefined) }));

const mongoose = require('mongoose');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');
const { ejecutarConTransaccion } = require('../services/financeTransaction');
const { guardarMensualidadConRecibo, construirDesglose, presentarImportesRecibo } = require('../services/paymentReceipt');

const suite = process.env.RUN_MONGO_RECEIPT_TESTS === '1' ? describe : describe.skip;

suite('recibos con transacciones reales en bases temporales', () => {
  const tenants = {};
  let app;
  const owner = new mongoose.Types.ObjectId();
  const intruso = new mongoose.Types.ObjectId();
  const token = (id = owner, rol = 'usuario') => jwt.sign({ id: String(id), rol, tenantId: 'qa-a' }, 'receipt-test-secret');
  jest.setTimeout(60000);

  beforeAll(async () => {
    process.env.JWT_SECRET_CURRENT = 'receipt-test-secret';
    process.env.REQUIRE_TENANT_IN_TOKEN = 'true';
    for (const id of ['qa-a', 'qa-b']) {
      const db = `libero_qa_receipts_${Date.now()}_${process.pid}_${id.replace('-', '_')}`;
      const connection = await mongoose.createConnection(`mongodb://127.0.0.1:27017/${db}?replicaSet=rs0`, {
        serverSelectionTimeoutMS: 5000
      }).asPromise();
      connection.receiptTenant = { tenantId: id, nombre: id, branding: { logoUrl: `/uploads/${id}/branding/logo.png` } };
      const models = Object.fromEntries(['Mensualidad', 'Alumno', 'Representante', 'Sede', 'PagoDetalle', 'PagoAgrupado', 'TenantConfig', 'ReciboCounter']
        .map((name) => [name, getTenantModel(connection, name)]));
      await Promise.all(Object.values(models).map((model) => model.init()));
      tenants[id] = { tenantId: id, connection, models, domains: [`${id}.apex.com.ve`] };
    }
    getTenantBusinessConnection.mockImplementation(async (tenant) => tenants[tenant.tenantId].connection);
    app = express();
    app.use(express.json(), (req, res, next) => {
      req.tenantId = req.hostname.startsWith('qa-b') ? 'qa-b' : 'qa-a';
      req.tenant = tenants[req.tenantId];
      next();
    });
    app.use('/api/recibos', require('../routes/recibos'));
  });

  afterAll(async () => {
    for (const { connection } of Object.values(tenants)) {
      try { await connection.dropDatabase(); } finally { await connection.close(); }
    }
  });

  beforeEach(async () => {
    for (const { models } of Object.values(tenants)) {
      await Promise.all(Object.values(models).map((model) => model.deleteMany({})));
      const sede = await models.Sede.create({ nombre: 'Sede QA', direccion: 'Direccion QA', costo: 30 });
      const rep = await models.Representante.create({ nombres: 'Representante', apellidos: 'QA', cedula: 'QA-123', usuario: owner });
      await models.Alumno.create({ nombres: 'Atleta', apellidos: 'QA', categoria: 'Sub-15', representante: rep._id,
        sede: sede._id, fecha_inicio_cobro: new Date('2026-01-01'), aplicar_recargo_mensualidad: false });
      await models.TenantConfig.create({ recibos: { nombre_oficial: 'Academia QA', rif: 'J-QA' } });
    }
  });

  async function cuota(index = 1, tenant = 'qa-a') {
    const { models } = tenants[tenant];
    const alumno = await models.Alumno.findOne();
    const mensualidad = await models.Mensualidad.create({ id_alumno: alumno._id, mes: index, anio: 2026,
      monto_esperado: 45, monto_base: 45, fecha_vencimiento: new Date('2026-01-05'), estatus: 'En revision' });
    await models.PagoDetalle.create({ id_mensualidad: mensualidad._id, monto_pagado: 45, monto_pagado_bs: 2150,
      fecha_pago: new Date('2026-01-02'), metodo_pago: 'Pago movil', referencia: '849281' });
    return mensualidad;
  }

  async function confirmar(id, tenant = 'qa-a', fallar = false) {
    const { Mensualidad } = tenants[tenant].models;
    return ejecutarConTransaccion(Mensualidad, async (session) => {
      const mensualidad = await Mensualidad.findById(id).session(session);
      mensualidad.estatus = 'Pagado';
      mensualidad.pago_en_revision = false;
      await guardarMensualidadConRecibo(mensualidad, { session });
      if (fallar) throw new Error('Abortar QA');
      return mensualidad;
    }, { obligatoria: true });
  }

  test('solo emite al pagar, captura identidad, referencia, sede y montos sin duplicar al repetir', async () => {
    const mensualidad = await cuota();
    expect(mensualidad.recibo).toBeUndefined();
    const pagada = await confirmar(mensualidad._id);
    expect(pagada.recibo.numero).toMatch(/^REC-\d{4}-0001$/);
    expect(pagada.recibo.datos).toMatchObject({
      academia: { nombre: 'Academia QA', rif: 'J-QA', sede: 'Sede QA', logo: '/uploads/qa-a/branding/logo.png' },
      representante: { nombre: 'Representante QA', cedula: 'QA-123' },
      atleta: { nombre: 'Atleta QA', categoria: 'Sub-15' },
      total: 45, total_bs: 2150, pagos: [{ referencia: '849281', metodo: 'Pago movil' }]
    });
    expect((await confirmar(mensualidad._id)).recibo.numero).toBe(pagada.recibo.numero);
    expect((await tenants['qa-a'].models.ReciboCounter.findOne()).secuencia).toBe(1);
  });

  test('emisiones concurrentes son secuenciales y cada academia inicia en uno', async () => {
    const cuotas = [];
    for (let index = 1; index <= 8; index += 1) cuotas.push(await cuota(index));
    const otra = await cuota(1, 'qa-b');
    const recibos = await Promise.all(cuotas.map((item) => confirmar(item._id)));
    const numeros = recibos.map((item) => Number(item.recibo.numero.split('-')[2])).sort((a, b) => a - b);
    expect(numeros).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect((await confirmar(otra._id, 'qa-b')).recibo.numero).toMatch(/-0001$/);
  });

  test('un aborto no consume correlativo ni deja un pago marcado como pagado', async () => {
    const primera = await cuota();
    await expect(confirmar(primera._id, 'qa-a', true)).rejects.toThrow('Abortar QA');
    expect((await tenants['qa-a'].models.Mensualidad.findById(primera._id)).estatus).toBe('En revision');
    expect(await tenants['qa-a'].models.ReciboCounter.countDocuments()).toBe(0);
    expect((await confirmar(primera._id)).recibo.numero).toMatch(/-0001$/);
  });

  test('dos aperturas concurrentes de la misma cuota sin sesion no consumen dos numeros', async () => {
    const original = await cuota();
    const { Mensualidad, ReciboCounter } = tenants['qa-a'].models;
    const copias = await Promise.all([Mensualidad.findById(original._id), Mensualidad.findById(original._id)]);
    await Promise.all(copias.map((mensualidad) => {
      mensualidad.estatus = 'Pagado';
      return guardarMensualidadConRecibo(mensualidad);
    }));
    expect(copias[0].recibo.numero).toBe(copias[1].recibo.numero);
    expect((await ReciboCounter.findOne()).secuencia).toBe(1);
  });

  test('conciliacion, confirmacion manual y registro admin emiten automaticamente', async () => {
    const conciliacion = require('../controllers/conciliacionController');
    const mensualidades = require('../controllers/mensualidadController');
    const pagos = require('../controllers/pagoDetalleController');
    const models = tenants['qa-a'].models;
    const req = { tenant: tenants['qa-a'], tenantId: 'qa-a',
      user: { id: String(owner), rol: 'admin', nombre: 'Admin QA' } };
    const respuesta = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
    const primera = await cuota(1);
    const detalle = await models.PagoDetalle.findOne({ id_mensualidad: primera._id });
    const conciliada = respuesta();
    await conciliacion.confirmarMatchTotal({ ...req, body: { tipo_conciliacion: 'mensualidades', pago_ids: [String(detalle._id)] } }, conciliada);
    expect(conciliada.status).not.toHaveBeenCalled();
    expect((await models.Mensualidad.findById(primera._id)).recibo.numero).toMatch(/-0001$/);
    const segunda = await cuota(2);
    const confirmada = respuesta();
    await mensualidades.confirmarMensualidad({ ...req, params: { id: String(segunda._id) } }, confirmada);
    expect(confirmada.status).not.toHaveBeenCalled();
    expect((await models.Mensualidad.findById(segunda._id)).recibo.numero).toMatch(/-0002$/);
    const tercera = await cuota(3);
    await models.PagoDetalle.deleteMany({ id_mensualidad: tercera._id });
    tercera.estatus = 'Pendiente';
    await tercera.save();
    const registrada = respuesta();
    await pagos.registrarPago({ ...req, body: { id_mensualidad: String(tercera._id), monto_pagado: 45,
      credito_a_aplicar: 0, fecha_pago: '2026-03-02', metodo_pago: 'Efectivo' } }, registrada);
    expect(registrada.status).not.toHaveBeenCalled();
    expect((await models.Mensualidad.findById(tercera._id)).recibo.numero).toMatch(/-0003$/);
  });

  test('consulta publica sin login no divulga identidades y rechaza codigos inexistentes o de otro tenant', async () => {
    const pagada = await confirmar((await cuota())._id);
    const url = `/api/recibos/verificar/${pagada.recibo.numero}`;
    const valida = await request(app).get(url);
    expect(valida.status).toBe(200);
    expect(valida.body).toMatchObject({ valido: true, totales: [{ moneda: 'VES', monto: 2150 }], academia: { rif: 'J-QA' } });
    expect(valida.body).not.toHaveProperty('total');
    expect(valida.body).not.toHaveProperty('moneda');
    expect(JSON.stringify(valida.body)).not.toMatch(/QA-123|Representante QA|Atleta QA|849281/);
    expect((await request(app).get(url).set('Host', 'qa-b.apex.com.ve')).status).toBe(404);
    expect((await request(app).get('/api/recibos/verificar/REC-2026-9999')).status).toBe(404);
    pagada.estatus = 'Pendiente';
    await pagada.save();
    expect((await request(app).get(url)).status).toBe(404);
  });

  test.each([
    ['test', 'http://qa-a.localhost:3000', 'http://qa-a.localhost:3000'],
    ['test', 'http://qa-a.localhost.example.com:3000', 'https://qa-a.apex.com.ve'],
    ['production', 'http://qa-a.localhost:3000', 'https://qa-a.apex.com.ve']
  ])('enlaces individuales y conjuntos conservan el origen local solo en desarrollo (%s, %s)', async (entorno, origin, esperado) => {
    const pagada = await confirmar((await cuota())._id);
    const anterior = process.env.NODE_ENV;
    process.env.NODE_ENV = entorno;
    try {
      const individual = await request(app).post(`/api/recibos/mensualidad/${pagada._id}`)
        .set('Authorization', `Bearer ${token()}`).set('Origin', origin);
      expect(individual.status).toBe(200);
      expect(individual.body.verificacion_url).toBe(`${esperado}/verificar/${pagada.recibo.numero}`);
      const listado = await request(app).post('/api/recibos/mios')
        .set('Authorization', `Bearer ${token()}`).set('Origin', origin);
      expect(listado.status).toBe(200);
      expect(listado.body).toHaveLength(1);
      expect(listado.body[0].verificacion_url).toBe(individual.body.verificacion_url);
    } finally {
      process.env.NODE_ENV = anterior;
    }
  });

  test('solo propietario y administracion pueden abrir; consolida todos los hijos y excluye pendientes', async () => {
    const pagada = await confirmar((await cuota())._id);
    await cuota(2);
    const models = tenants['qa-a'].models;
    const alumno = await models.Alumno.findOne().lean();
    const segundo = await models.Alumno.create({ ...alumno, _id: new mongoose.Types.ObjectId(), nombres: 'Segundo atleta' });
    const otra = await models.Mensualidad.create({ id_alumno: segundo._id, mes: 1, anio: 2026,
      monto_esperado: 45, monto_base: 45, fecha_vencimiento: new Date('2026-01-05'), estatus: 'Pendiente' });
    await models.PagoDetalle.create({ id_mensualidad: otra._id, monto_pagado: 45, fecha_pago: new Date('2026-01-02'), metodo_pago: 'Efectivo' });
    const otroRecibo = await confirmar(otra._id);
    const futura = await cuota(3);
    await models.PagoDetalle.updateOne({ id_mensualidad: futura._id }, { $set: { fecha_pago: new Date(Date.now() + 86400000) } });
    await confirmar(futura._id);
    const url = `/api/recibos/mensualidad/${pagada._id}`;
    expect((await request(app).post(url)).status).toBe(401);
    expect((await request(app).post(url).set('Authorization', `Bearer ${token(intruso)}`)).status).toBe(403);
    expect((await request(app).post(url).set('Authorization', `Bearer ${token(intruso, 'admin')}`)).status).toBe(200);
    const propia = await request(app).post(url).set('Authorization', `Bearer ${token()}`);
    expect(propia.status).toBe(200);
    expect(propia.body.verificacion_url).toBe(`https://qa-a.apex.com.ve/verificar/${pagada.recibo.numero}`);
    const listado = await request(app).post('/api/recibos/mios').set('Authorization', `Bearer ${token()}`);
    expect(listado.status).toBe(200);
    expect(listado.body.map((item) => item.numero)).toEqual([pagada.recibo.numero, otroRecibo.recibo.numero]);
    const ajeno = await request(app).post('/api/recibos/mios').set('Authorization', `Bearer ${token(intruso)}`);
    expect(ajeno.body).toEqual([]);
  });
});

test('desglose exacto de inscripcion, mensualidad, mora, descuento, credito y excedente', () => {
  const desglose = construirDesglose({ mes: 11, anio: 2026, monto_inscripcion: 15,
    monto_esperado: 43, recargo_aplicado_usd: 4, ajuste_extraordinario: 3, credito_aplicado: 3 },
  [{ monto_pagado: 45, monto_pagado_bs: 2150, metodo_pago: 'Transferencia' }]);
  expect(desglose.lineas.map((item) => item.monto)).toEqual([15, 30, 4, -3, -3, 2]);
  expect(desglose.lineas.reduce((sum, item) => sum + item.monto, 0)).toBe(desglose.total);
  expect(desglose.concepto).toContain('Inscripcion + Mensualidad noviembre de 2026');
});

test.each(['Pago movil', 'Pago Móvil', 'Transferencia'])('recibo de %s solo presenta Bs registrados sin conversion actual', (metodo) => {
  const datos = { moneda: 'USD', ...construirDesglose({ mes: 11, anio: 2026, monto_inscripcion: 5, monto_esperado: 15 },
    [{ metodo_pago: metodo, monto_pagado: 15, monto_pagado_bs: 13338.83 }]) };
  const vista = presentarImportesRecibo(datos);
  expect(vista.totales).toEqual([{ moneda: 'VES', monto: 13338.83 }]);
  expect(vista.pagos[0]).toMatchObject({ moneda: 'VES', monto: 13338.83 });
  expect(vista.lineas.map((linea) => linea.importes[0].monto)).toEqual([4446.28, 8892.55]);
  expect(JSON.stringify(vista)).not.toMatch(/USD|total_bs|monto_bs/);
  expect(datos.total).toBe(15);
});

test.each(['Efectivo', 'Zelle', 'PayPal', 'Binance'])('recibo de %s conserva divisa e ignora equivalentes en Bs', (metodo) => {
  const datos = { moneda: 'USD', ...construirDesglose({ mes: 11, anio: 2026, monto_esperado: 15 },
    [{ metodo_pago: metodo, monto_pagado: 15, monto_pagado_bs: 13338.83 }]) };
  expect(presentarImportesRecibo(datos)).toMatchObject({
    totales: [{ moneda: 'USD', monto: 15 }],
    pagos: [{ moneda: 'USD', monto: 15 }],
    lineas: [{ importes: [{ moneda: 'USD', monto: 15 }] }]
  });
});

test('recibo mixto conserva totales separados y reconcilia cada desglose al centavo', () => {
  const datos = { moneda: 'USD', ...construirDesglose({ mes: 11, anio: 2026, monto_inscripcion: 5,
    monto_esperado: 15.01, recargo_aplicado_usd: 0.01 },
  [{ metodo_pago: 'Pago movil', monto_pagado: 5.01, monto_pagado_bs: 1234.57 },
    { metodo_pago: 'Zelle', monto_pagado: 10, monto_pagado_bs: 99999 }]) };
  const vista = presentarImportesRecibo(datos);
  expect(vista.totales).toEqual([{ moneda: 'VES', monto: 1234.57 }, { moneda: 'USD', monto: 10 }]);
  expect(vista.pagos.map(({ moneda, monto }) => ({ moneda, monto }))).toEqual(vista.totales);
  for (const total of vista.totales) {
    const suma = vista.lineas.reduce((sum, linea) => sum + Math.round(linea.importes.find((item) => item.moneda === total.moneda).monto * 100), 0);
    expect(suma).toBe(Math.round(total.monto * 100));
  }
});

test.each([null, 0, NaN])('pago bancario sin importe Bs valido (%p) falla explicitamente', (monto_bs) => {
  expect(() => presentarImportesRecibo({ moneda: 'USD', total: 15,
    lineas: [{ concepto: 'Mensualidad', monto: 15 }], pagos: [{ metodo: 'Transferencia', monto: 15, monto_bs }] }))
    .toThrow('no tiene un importe valido en Bs');
});

test('cuota sin transferencia no inventa una conversion del credito', () => {
  const vista = presentarImportesRecibo({ moneda: 'USD', ...construirDesglose({
    mes: 11, anio: 2026, monto_esperado: 0, credito_aplicado: 15
  }, []) });
  expect(vista.totales).toEqual([{ moneda: 'VES', monto: 0 }]);
  expect(vista.lineas.every((linea) => linea.importes.length === 0)).toBe(true);
});
