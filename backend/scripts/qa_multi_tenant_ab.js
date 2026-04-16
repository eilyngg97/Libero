require('dotenv').config();

const jwt = require('jsonwebtoken');
const request = require('supertest');
const { app } = require('../app');
const { getJwtSigningSecret } = require('../config/secrets');
const { getTenantBusinessConnection } = require('../config/tenantBusinessConnection');
const { getTenantModel } = require('../services/tenantModelService');

function parseFirstDomain(raw, fallback) {
  const value = String(raw || '').split(',').map((item) => item.trim()).filter(Boolean)[0];
  return value || fallback;
}

function assertOrThrow(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function authHeaders(token, host) {
  return {
    Authorization: `Bearer ${token}`,
    'x-forwarded-host': host
  };
}

async function getTenantModels(tenantConfig) {
  const connection = await getTenantBusinessConnection(tenantConfig);

  return {
    Sede: getTenantModel(connection, 'Sede'),
    Alumno: getTenantModel(connection, 'Alumno'),
    Mensualidad: getTenantModel(connection, 'Mensualidad'),
    PagoDetalle: getTenantModel(connection, 'PagoDetalle')
  };
}

async function seedTenantData(tenantConfig, suffix) {
  const models = await getTenantModels(tenantConfig);

  const sede = await models.Sede.create({
    nombre: `QA-Sede-${suffix}-${Date.now()}`,
    direccion: `Dir ${suffix}`,
    costo: 30
  });

  const alumno = await models.Alumno.create({
    nombres: `Alumno${suffix}`,
    apellidos: `QA${suffix}`,
    sede: sede._id,
    fecha_inscripcion: new Date(),
    categoria: 'QA'
  });

  const now = new Date();
  const mes = now.getMonth() + 1;
  const anio = now.getFullYear();

  const mensualidad = await models.Mensualidad.create({
    id_alumno: alumno._id,
    mes,
    anio,
    monto_esperado: 10,
    fecha_vencimiento: new Date(anio, mes - 1, 5, 23, 59, 59),
    estatus: 'En revision'
  });

  const pago = await models.PagoDetalle.create({
    id_mensualidad: mensualidad._id,
    monto_pagado: 10,
    monto_pagado_bs: 400,
    monto_esperado_usd: 10,
    monto_esperado_bs: 400,
    fecha_pago: new Date(),
    metodo_pago: 'Transferencia',
    referencia: `QA-${suffix}-${Date.now()}`
  });

  return {
    models,
    sede,
    alumno,
    mensualidad,
    pago,
    mes,
    anio
  };
}

async function cleanupTenantData(models, ids) {
  await models.PagoDetalle.deleteMany({ _id: { $in: ids.pagoIds } });
  await models.Mensualidad.deleteMany({ _id: { $in: ids.mensualidadIds } });
  await models.Alumno.deleteMany({ _id: { $in: ids.alumnoIds } });
  await models.Sede.deleteMany({ _id: { $in: ids.sedeIds } });
}

async function run() {
  const secret = getJwtSigningSecret();

  const tenantA = {
    tenantId: 'villasport',
    dbUri: process.env.DEFAULT_TENANT_DB_URI,
    host: parseFirstDomain(process.env.DEFAULT_TENANT_DOMAINS, 'villasport.localhost')
  };

  const tenantB = {
    tenantId: process.env.TENANT_B_ID || 'pruebas',
    dbUri: process.env.TENANT_B_DB_URI,
    host: parseFirstDomain(process.env.TENANT_B_DOMAINS, 'pruebas.localhost')
  };

  assertOrThrow(Boolean(tenantA.dbUri), 'Falta DEFAULT_TENANT_DB_URI en .env');
  assertOrThrow(Boolean(tenantB.dbUri), 'Falta TENANT_B_DB_URI en .env');

  const tokenA = jwt.sign({ id: 'qa-admin-a', rol: 'admin', nombre: 'QA A', tenantId: tenantA.tenantId }, secret, { expiresIn: '1h' });
  const tokenB = jwt.sign({ id: 'qa-admin-b', rol: 'admin', nombre: 'QA B', tenantId: tenantB.tenantId }, secret, { expiresIn: '1h' });

  let seedA = null;
  let seedB = null;
  let createdSedeAApiId = null;
  const checks = [];

  try {
    seedA = await seedTenantData(tenantA, 'A');
    seedB = await seedTenantData(tenantB, 'B');

    // CRUD isolation via /api/sedes
    const createA = await request(app)
      .post('/api/sedes')
      .set(authHeaders(tokenA, tenantA.host))
      .send({ nombre: `QA-CRUD-A-${Date.now()}`, direccion: 'CRUD A', costo: 50 });

    assertOrThrow(createA.status === 201, `POST /api/sedes A esperado 201, obtuvo ${createA.status}`);
    createdSedeAApiId = String(createA.body?._id);
    checks.push('CRUD create A ok');

    const listA = await request(app)
      .get('/api/sedes')
      .set(authHeaders(tokenA, tenantA.host));
    assertOrThrow(listA.status === 200, `GET /api/sedes A esperado 200, obtuvo ${listA.status}`);
    assertOrThrow(Array.isArray(listA.body) && listA.body.some((s) => String(s._id) === createdSedeAApiId), 'Sede creada en A no aparece en A');
    checks.push('CRUD read A ok');

    const listB = await request(app)
      .get('/api/sedes')
      .set(authHeaders(tokenB, tenantB.host));
    assertOrThrow(listB.status === 200, `GET /api/sedes B esperado 200, obtuvo ${listB.status}`);
    assertOrThrow(Array.isArray(listB.body) && !listB.body.some((s) => String(s._id) === createdSedeAApiId), 'Sede de A visible en B');
    checks.push('Aislamiento sedes A/B ok');

    const updateFromB = await request(app)
      .put(`/api/sedes/${createdSedeAApiId}`)
      .set(authHeaders(tokenB, tenantB.host))
      .send({ nombre: 'NO-DEBE', direccion: 'NO-DEBE', costo: 999 });
    assertOrThrow(updateFromB.status === 404, `PUT sede A desde B esperado 404, obtuvo ${updateFromB.status}`);
    checks.push('Cross-update bloqueado ok');

    const updateFromA = await request(app)
      .put(`/api/sedes/${createdSedeAApiId}`)
      .set(authHeaders(tokenA, tenantA.host))
      .send({ nombre: `QA-CRUD-A-UPD-${Date.now()}`, direccion: 'CRUD A UPD', costo: 55 });
    assertOrThrow(updateFromA.status === 200, `PUT sede A esperado 200, obtuvo ${updateFromA.status}`);
    checks.push('CRUD update A ok');

    const deleteFromA = await request(app)
      .delete(`/api/sedes/${createdSedeAApiId}`)
      .set(authHeaders(tokenA, tenantA.host));
    assertOrThrow(deleteFromA.status === 200, `DELETE sede A esperado 200, obtuvo ${deleteFromA.status}`);
    checks.push('CRUD delete A ok');
    createdSedeAApiId = null;

    // Endpoints críticos
    const alumnosA = await request(app)
      .get('/api/alumnos')
      .set(authHeaders(tokenA, tenantA.host));
    const alumnosB = await request(app)
      .get('/api/alumnos')
      .set(authHeaders(tokenB, tenantB.host));

    assertOrThrow(alumnosA.status === 200, `GET /api/alumnos A esperado 200, obtuvo ${alumnosA.status}`);
    assertOrThrow(alumnosB.status === 200, `GET /api/alumnos B esperado 200, obtuvo ${alumnosB.status}`);
    assertOrThrow(alumnosA.body.some((a) => String(a._id) === String(seedA.alumno._id)), 'Alumno A no aparece en A');
    assertOrThrow(!alumnosA.body.some((a) => String(a._id) === String(seedB.alumno._id)), 'Alumno B aparece en A');
    assertOrThrow(alumnosB.body.some((a) => String(a._id) === String(seedB.alumno._id)), 'Alumno B no aparece en B');
    assertOrThrow(!alumnosB.body.some((a) => String(a._id) === String(seedA.alumno._id)), 'Alumno A aparece en B');
    checks.push('Aislamiento endpoint alumnos ok');

    const mensA = await request(app)
      .get(`/api/mensualidades?id_alumno=${seedA.alumno._id}`)
      .set(authHeaders(tokenA, tenantA.host));
    const mensAFromB = await request(app)
      .get(`/api/mensualidades?id_alumno=${seedA.alumno._id}`)
      .set(authHeaders(tokenB, tenantB.host));

    assertOrThrow(mensA.status === 200, `GET mensualidades A esperado 200, obtuvo ${mensA.status}`);
    assertOrThrow(mensA.body.some((m) => String(m._id) === String(seedA.mensualidad._id)), 'Mensualidad A no aparece en A');
    assertOrThrow(Array.isArray(mensAFromB.body) && mensAFromB.body.length === 0, 'Mensualidad A visible desde B');
    checks.push('Aislamiento endpoint mensualidades ok');

    const pagosA = await request(app)
      .get(`/api/pagos/${seedA.mensualidad._id}`)
      .set(authHeaders(tokenA, tenantA.host));
    const pagosAFromB = await request(app)
      .get(`/api/pagos/${seedA.mensualidad._id}`)
      .set(authHeaders(tokenB, tenantB.host));

    assertOrThrow(pagosA.status === 200, `GET pagos A esperado 200, obtuvo ${pagosA.status}`);
    assertOrThrow(Array.isArray(pagosA.body) && pagosA.body.some((p) => String(p._id) === String(seedA.pago._id)), 'Pago A no aparece en A');
    assertOrThrow(
      pagosAFromB.status === 200 && Array.isArray(pagosAFromB.body) && pagosAFromB.body.length === 0,
      `GET pagos A desde B esperado 200 con lista vacia, obtuvo status ${pagosAFromB.status}`
    );
    checks.push('Aislamiento endpoint pagos ok');

    const conciliaA = await request(app)
      .post('/api/conciliacion/confirmar-match-total')
      .set(authHeaders(tokenA, tenantA.host))
      .send({ pago_ids: [String(seedA.pago._id)] });
    const conciliaAFromB = await request(app)
      .post('/api/conciliacion/confirmar-match-total')
      .set(authHeaders(tokenB, tenantB.host))
      .send({ pago_ids: [String(seedA.pago._id)] });

    assertOrThrow(conciliaA.status === 200, `Conciliacion A esperado 200, obtuvo ${conciliaA.status}`);
    assertOrThrow(conciliaAFromB.status === 404, `Conciliacion cruzada esperado 404, obtuvo ${conciliaAFromB.status}`);
    checks.push('Aislamiento endpoint conciliacion ok');

    // Reportes no mezclen data
    const resumenA = await request(app)
      .get(`/api/mensualidades/resumen-por-sede?mes=${seedA.mes}&anio=${seedA.anio}`)
      .set(authHeaders(tokenA, tenantA.host));
    const resumenB = await request(app)
      .get(`/api/mensualidades/resumen-por-sede?mes=${seedB.mes}&anio=${seedB.anio}`)
      .set(authHeaders(tokenB, tenantB.host));

    assertOrThrow(resumenA.status === 200, `Resumen A esperado 200, obtuvo ${resumenA.status}`);
    assertOrThrow(resumenB.status === 200, `Resumen B esperado 200, obtuvo ${resumenB.status}`);
    const sedesA = Array.isArray(resumenA.body?.sedes) ? resumenA.body.sedes : [];
    const sedesB = Array.isArray(resumenB.body?.sedes) ? resumenB.body.sedes : [];
    assertOrThrow(sedesA.some((s) => s.sedeNombre === seedA.sede.nombre), 'Reporte A no incluye sede A');
    assertOrThrow(!sedesA.some((s) => s.sedeNombre === seedB.sede.nombre), 'Reporte A incluye sede B');
    assertOrThrow(sedesB.some((s) => s.sedeNombre === seedB.sede.nombre), 'Reporte B no incluye sede B');
    assertOrThrow(!sedesB.some((s) => s.sedeNombre === seedA.sede.nombre), 'Reporte B incluye sede A');
    checks.push('Reportes sin mezcla A/B ok');

    // mismatch token/host
    const mismatch = await request(app)
      .get('/api/alumnos')
      .set(authHeaders(tokenA, tenantB.host));

    assertOrThrow(mismatch.status === 403, `Mismatch token/host esperado 403, obtuvo ${mismatch.status}`);
    checks.push('Mismatch token/host ok');

    console.log('\nQA Multi-tenant A/B: OK');
    checks.forEach((item, index) => {
      console.log(`${index + 1}. ${item}`);
    });
  } finally {
    if (createdSedeAApiId && seedA?.models?.Sede) {
      await seedA.models.Sede.deleteOne({ _id: createdSedeAApiId });
    }

    if (seedA?.models) {
      await cleanupTenantData(seedA.models, {
        pagoIds: [seedA.pago._id],
        mensualidadIds: [seedA.mensualidad._id],
        alumnoIds: [seedA.alumno._id],
        sedeIds: [seedA.sede._id]
      });
    }

    if (seedB?.models) {
      await cleanupTenantData(seedB.models, {
        pagoIds: [seedB.pago._id],
        mensualidadIds: [seedB.mensualidad._id],
        alumnoIds: [seedB.alumno._id],
        sedeIds: [seedB.sede._id]
      });
    }
  }
}

run().catch((err) => {
  console.error('QA Multi-tenant A/B: FAIL');
  console.error(err.message);
  process.exit(1);
});
