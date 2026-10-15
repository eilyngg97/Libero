import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import Mensualidades from './Mensualidades';
import { hasPermission } from '../utils/permissions';

jest.mock('../context/SedeContext', () => ({ useSede: () => ({ sedeSeleccionada: null }) }));
jest.mock('../context/DolarContext', () => ({ useDolar: () => ({ dolar: { promedio: 872.39, moneda: 'USD' } }) }));
jest.mock('../utils/permissions', () => ({ hasPermission: jest.fn(() => true) }));
jest.mock('../utils/exportExcel', () => ({ exportToExcel: jest.fn() }));
jest.mock('../utils/dolarHistorico', () => ({ obtenerTasaOficialPorFecha: jest.fn().mockResolvedValue(872.39), obtenerTasaEuroOficialPorFecha: jest.fn().mockResolvedValue(900) }));

const fetchOriginal = global.fetch;
let transacciones;
let agrupado;
let errorRetiro;
let segundoRecargo;
let segundaVersion;
let estadoGrupo;

beforeEach(() => {
  hasPermission.mockImplementation(() => true);
  transacciones = true;
  agrupado = true;
  errorRetiro = false;
  segundoRecargo = 4;
  segundaVersion = 'mensualidad-v2';
  estadoGrupo = 'En revision';
  localStorage.setItem('rol', 'admin');
  global.fetch = jest.fn(async (url, options = {}) => {
    const mensualidad = { _id: 'm1', id_alumno: { _id: 'a1', nombres: 'Ana', apellidos: 'Raga' },
      mes: new Date().getMonth() + 1, anio: new Date().getFullYear(), monto_esperado: 14, monto_base: 10,
      monto_sin_recargo_usd: 10, recargo_aplicado_usd: 4, monto_con_recargo_usd: 14, aplica_recargo: true,
      fecha_aplicacion_recargo: '2026-10-01', estatus: 'En revision',
      ...(agrupado ? { pago_agrupado: { id: 'g1', codigo: 'PA-TEST', monto_total: 28, cantidad_atletas: 2, estado: estadoGrupo } } : {}) };
    let data;
    if (options.method === 'DELETE') return { ok: !errorRetiro, status: errorRetiro ? 409 : 200,
      json: async () => errorRetiro ? { error: 'El grupo cambio. Actualiza el detalle.' } : { mensualidades_actualizadas: 2 } };
    if (options.method === 'PATCH') {
      return { ok: !errorRetiro, status: errorRetiro ? 409 : 200, json: async () => errorRetiro
        ? { error: 'La mensualidad cambio. Actualiza la vista.' }
        : { mensualidad: { ...mensualidad, recargo_aplicado_usd: 0, monto_esperado: 10 },
          mensualidades: [{ ...mensualidad, recargo_aplicado_usd: 0, monto_esperado: 10 }],
          atletas_actualizadas: 2, saldo_a_favor_incrementado: 8 } };
    }
    if (url.includes('/api/pagos/agrupado/g1')) {
      data = { pago: { _id: 'g1', codigo: 'PA-TEST', estado: estadoGrupo, monto_total: 28, monto_total_bs: 24426.92 }, version: 'grupo-v1',
        transacciones_disponibles: transacciones,
        asignaciones: [
          { id_mensualidad: 'm1', alumno_nombre: 'Ana Raga', version_mensualidad: 'mensualidad-v1', monto_sin_recargo_usd: 10, recargo_aplicado_usd: 4 },
          { id_mensualidad: 'm2', alumno_nombre: 'Eva Raga', version_mensualidad: segundaVersion, monto_sin_recargo_usd: 10, recargo_aplicado_usd: segundoRecargo }
        ] };
    } else if (url.includes('/api/pagos/m1')) {
      data = [{ _id: 'p1', ...(agrupado ? { id_pago_agrupado: 'g1' } : {}), monto_pagado: 14, monto_pagado_bs: 12213.46,
        metodo_pago: 'Pago movil', fecha_pago: '2026-10-06', referencia: '262626' }];
    } else if (url.includes('/api/mensualidades')) data = [mensualidad];
    else data = [];
    return { ok: true, json: async () => data };
  });
});

afterEach(() => { global.fetch = fetchOriginal; localStorage.clear(); });

test('filtra por codigo agrupado completo o parcial y conserva la busqueda por alumno', async () => {
  const fetchPrevio = global.fetch;
  global.fetch = jest.fn(async (url, options) => {
    const respuesta = await fetchPrevio(url, options);
    if (!url.includes('/api/mensualidades')) return respuesta;
    const [original] = await respuesta.json();
    return { ok: true, json: async () => [
      original,
      { ...original, _id: 'm2', id_alumno: { _id: 'a2', nombres: 'Eva', apellidos: 'Raga' } },
      { ...original, _id: 'm3', id_alumno: { _id: 'a3', nombres: 'Luis', apellidos: 'Perez' },
        pago_agrupado: { ...original.pago_agrupado, id: 'g2', codigo: 'PA-OTRO' } },
      { ...original, _id: 'm4', id_alumno: { _id: 'a4', nombres: 'Maria', apellidos: 'Lopez' }, pago_agrupado: null }
    ] };
  });
  render(<Mensualidades />);
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Ver detalle' })).toHaveLength(4));
  const buscador = screen.getByRole('textbox', { name: 'Alumno o código de pago' });
  for (const codigo of [' PA-test ', 'test']) {
    fireEvent.change(buscador, { target: { value: codigo } });
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Ver detalle' })).toHaveLength(2));
    expect(screen.getByText('Ana Raga')).toBeInTheDocument();
    expect(screen.getByText('Eva Raga')).toBeInTheDocument();
    expect(screen.queryByText('Luis Perez')).not.toBeInTheDocument();
    expect(screen.queryByText('Maria Lopez')).not.toBeInTheDocument();
  }
  fireEvent.change(buscador, { target: { value: 'Raga Ana' } });
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Ver detalle' })).toHaveLength(1));
  expect(screen.getByText('Ana Raga')).toBeInTheDocument();
  fireEvent.change(buscador, { target: { value: 'PA-INEXISTENTE' } });
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Ver detalle' })).not.toBeInTheDocument());
  fireEvent.change(buscador, { target: { value: '' } });
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Ver detalle' })).toHaveLength(4));
});

test('filtra alumnos activos y de baja con criterios historicos y combina los demas filtros', async () => {
  const fetchPrevio = global.fetch;
  global.fetch = jest.fn(async (url, options) => {
    const respuesta = await fetchPrevio(url, options);
    if (!url.includes('/api/mensualidades')) return respuesta;
    const [original] = await respuesta.json();
    const alumnos = [
      { nombres: 'Activa', activo: true },
      { nombres: 'Historica' },
      { nombres: 'Retirada', dado_de_baja: true, activo: true },
      { nombres: 'Inactiva', activo: false },
      { nombres: 'Estado baja', estado: 'baja' },
      { nombres: 'Estado inactivo', estado: ' Inactivo ' }
    ];
    return { ok: true, json: async () => alumnos.map((alumno, index) => ({ ...original,
      _id: `m${index}`, id_alumno: { ...alumno, _id: `a${index}`, apellidos: 'Raga' },
      estatus: alumno.dado_de_baja ? 'Pagado' : 'En revision'
    })) };
  });
  render(<Mensualidades />);
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Ver detalle' })).toHaveLength(6));
  const filtro = screen.getByRole('combobox', { name: 'Estado del alumno' });
  fireEvent.mouseDown(filtro);
  fireEvent.click(await screen.findByRole('option', { name: 'Activos' }));
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Ver detalle' })).toHaveLength(2));
  expect(screen.getByText('Activa Raga')).toBeInTheDocument();
  expect(screen.getByText('Historica Raga')).toBeInTheDocument();
  fireEvent.mouseDown(filtro);
  fireEvent.click(await screen.findByRole('option', { name: 'De baja' }));
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Ver detalle' })).toHaveLength(4));
  expect(screen.queryByText('Activa Raga')).not.toBeInTheDocument();
  expect(screen.queryByText('Historica Raga')).not.toBeInTheDocument();
  const buscador = screen.getByRole('textbox', { name: 'Alumno o código de pago' });
  fireEvent.change(buscador, { target: { value: 'Retirada' } });
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Ver detalle' })).toHaveLength(1));
  expect(screen.getByText('Retirada Raga')).toBeInTheDocument();
  fireEvent.change(buscador, { target: { value: '' } });
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Estado', exact: true }));
  fireEvent.click(await screen.findByRole('option', { name: 'Pagado' }));
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Ver detalle' })).toHaveLength(1));
  expect(screen.getByText('Retirada Raga')).toBeInTheDocument();
  fireEvent.mouseDown(filtro);
  fireEvent.click(await screen.findByRole('option', { name: 'Todos' }));
  fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Estado', exact: true }));
  fireEvent.click(await screen.findByRole('option', { name: 'Todos' }));
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Ver detalle' })).toHaveLength(6));
});

async function abrirRetiro() {
  render(<Mensualidades />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle' }));
  fireEvent.click(await screen.findByRole('button', { name: /^Retirar recargo/ }));
}

test.each(['Eliminar pago agrupado', 'Eliminar grupo desde historial'])('admin elimina todo el grupo desde %s', async (boton) => {
  render(<Mensualidades />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle' }));
  fireEvent.click(await screen.findByRole('button', { name: boton }));
  const confirmacion = await screen.findByRole('dialog', { name: 'Eliminar pago agrupado' });
  expect(await within(confirmacion).findByText(/Ana Raga/)).toBeInTheDocument();
  expect(within(confirmacion).getByText(/Eva Raga/)).toBeInTheDocument();
  expect(within(confirmacion).getByText('Bs 24426.92 / $28.00 USD')).toBeInTheDocument();
  expect(global.fetch.mock.calls.some(([, opciones]) => opciones?.method === 'DELETE')).toBe(false);
  fireEvent.click(within(confirmacion).getByRole('button', { name: 'Eliminar pago agrupado' }));
  expect(await screen.findByText('Pago agrupado eliminado para todos los atletas.')).toBeInTheDocument();
  const solicitudes = global.fetch.mock.calls.filter(([, opciones]) => opciones?.method === 'DELETE');
  expect(solicitudes).toHaveLength(1);
  expect(solicitudes[0][0]).toContain('/api/pagos/agrupado/g1');
  expect(JSON.parse(solicitudes[0][1].body)).toEqual({ version: 'grupo-v1', mensualidades: [
    { id_mensualidad: 'm1', version: 'mensualidad-v1' }, { id_mensualidad: 'm2', version: 'mensualidad-v2' }
  ] });
});

test('cancelar eliminacion del grupo no elimina ninguna asignacion', async () => {
  render(<Mensualidades />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Eliminar grupo desde historial' }));
  const confirmacion = await screen.findByRole('dialog', { name: 'Eliminar pago agrupado' });
  await within(confirmacion).findByText(/Eva Raga/);
  fireEvent.click(within(confirmacion).getByRole('button', { name: 'Cancelar' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Eliminar pago agrupado' })).not.toBeInTheDocument());
  expect(global.fetch.mock.calls.some(([, opciones]) => opciones?.method === 'DELETE')).toBe(false);
});

test('el conflicto de eliminacion queda en el dialogo y no reintenta individualmente', async () => {
  errorRetiro = true;
  render(<Mensualidades />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Eliminar pago agrupado' }));
  const confirmacion = await screen.findByRole('dialog', { name: 'Eliminar pago agrupado' });
  await within(confirmacion).findByText(/Eva Raga/);
  fireEvent.click(within(confirmacion).getByRole('button', { name: 'Eliminar pago agrupado' }));
  expect(await within(confirmacion).findByRole('alert')).toHaveTextContent('El grupo cambio. Actualiza el detalle.');
  expect(global.fetch.mock.calls.filter(([, opciones]) => opciones?.method === 'DELETE')).toHaveLength(1);
});

test.each(['sin transacciones', 'sin version'])('no elimina grupo %s ni ofrece ruta individual', async (caso) => {
  if (caso === 'sin transacciones') transacciones = false;
  else segundaVersion = undefined;
  render(<Mensualidades />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Eliminar pago agrupado' }));
  const confirmacion = await screen.findByRole('dialog', { name: 'Eliminar pago agrupado' });
  await within(confirmacion).findByRole('alert');
  expect(within(confirmacion).getByRole('button', { name: 'Eliminar pago agrupado' })).toBeDisabled();
  expect(global.fetch.mock.calls.some(([, opciones]) => opciones?.method === 'DELETE')).toBe(false);
});

test('grupo conciliado no ofrece eliminacion ni arriba ni en historial', async () => {
  estadoGrupo = 'Conciliado';
  render(<Mensualidades />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle' }));
  await screen.findByText('Último Pago Registrado');
  expect(screen.queryByRole('button', { name: 'Eliminar pago agrupado' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Eliminar grupo desde historial' })).not.toBeInTheDocument();
});

test('sin permiso de gestion no ofrece eliminacion del grupo en ninguna ubicacion', async () => {
  hasPermission.mockImplementation((permiso) => permiso !== 'mensualidades.manage');
  render(<Mensualidades />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle' }));
  await screen.findByText('Último Pago Registrado');
  expect(screen.queryByRole('button', { name: 'Eliminar pago agrupado' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Eliminar grupo desde historial' })).not.toBeInTheDocument();
});

test('el pago individual ofrece eliminacion superior y conserva la ruta individual', async () => {
  agrupado = false;
  render(<Mensualidades />);
  fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Eliminar pago' }));
  const confirmacion = await screen.findByRole('dialog', { name: 'Eliminar pago' });
  fireEvent.click(within(confirmacion).getByRole('button', { name: 'Eliminar pago' }));
  expect(await screen.findByText('Pago eliminado correctamente')).toBeInTheDocument();
  const [url] = global.fetch.mock.calls.find(([, opciones]) => opciones?.method === 'DELETE');
  expect(url).toContain('/api/pagos/p1');
  expect(global.fetch.mock.calls.some(([ruta]) => ruta.includes('/api/pagos/agrupado/'))).toBe(false);
});

test('retiro agrupado consulta versiones y envia una sola operacion segura', async () => {
  await abrirRetiro();
  expect(await screen.findByText(/La transferencia PA-TEST se conserva/)).toBeInTheDocument();
  expect(screen.getByText(/retirara los recargos de 2 mensualidades/)).toBeInTheDocument();
  expect(screen.getByText('Eva Raga')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retirar todos los recargos' }));
  await waitFor(() => expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(true));
  const solicitudes = global.fetch.mock.calls.filter(([, options]) => options?.method === 'PATCH');
  expect(solicitudes).toHaveLength(1);
  expect(solicitudes[0][0]).toContain('/api/pagos/agrupado/g1/retirar-recargos');
  expect(JSON.parse(solicitudes[0][1].body)).toMatchObject({ version: 'grupo-v1', mensualidades: [
    { id_mensualidad: 'm1', version: 'mensualidad-v1' }, { id_mensualidad: 'm2', version: 'mensualidad-v2' }
  ] });
  expect(JSON.parse(solicitudes[0][1].body)).not.toHaveProperty('monto_esperado');
  expect(await screen.findByText(/Recargos retirados de 2 atletas/)).toHaveTextContent('Saldo a favor adicional total: $8.00 USD');
});

test('retiro agrupado no envia cambios cuando no hay transacciones', async () => {
  transacciones = false;
  await abrirRetiro();
  expect(await screen.findByText('El retiro seguro requiere MongoDB con transacciones.')).toBeInTheDocument();
  expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false);
});

test('grupo mixto muestra solo las atletas con recargo pero confirma las versiones de todas', async () => {
  segundoRecargo = 0;
  await abrirRetiro();
  expect(await screen.findByText(/retirara los recargos de 1 mensualidad de/)).toBeInTheDocument();
  expect(screen.queryByText('Eva Raga')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retirar todos los recargos' }));
  await waitFor(() => expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(true));
  const [, options] = global.fetch.mock.calls.find(([, options]) => options?.method === 'PATCH');
  expect(JSON.parse(options.body).mensualidades).toHaveLength(2);
});

test('no abre confirmacion ni retira recargos si falta la version de otra atleta', async () => {
  segundaVersion = undefined;
  await abrirRetiro();
  expect(await screen.findByText('Debes actualizar las versiones de todas las mensualidades del grupo.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Retirar todos los recargos' })).not.toBeInTheDocument();
  expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false);
});

test('conflicto de version muestra error sin reintentar por la ruta individual', async () => {
  errorRetiro = true;
  await abrirRetiro();
  await screen.findByText(/La transferencia PA-TEST se conserva/);
  fireEvent.click(screen.getByRole('button', { name: 'Retirar todos los recargos' }));
  expect(await screen.findByText('La mensualidad cambio. Actualiza la vista.')).toBeInTheDocument();
  const solicitudes = global.fetch.mock.calls.filter(([, options]) => options?.method === 'PATCH');
  expect(solicitudes).toHaveLength(1);
  expect(solicitudes[0][0]).toContain('/api/pagos/agrupado/g1/');
});

test('pago individual conserva su ruta de retiro actual', async () => {
  agrupado = false;
  await abrirRetiro();
  fireEvent.click(await screen.findByRole('button', { name: /^S.*retirar recargo$/ }));
  await waitFor(() => expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(true));
  const [url, options] = global.fetch.mock.calls.find(([, options]) => options?.method === 'PATCH');
  expect(url).toContain('/api/mensualidades/m1');
  expect(JSON.parse(options.body)).toMatchObject({ monto_esperado: 10, bloquear_recargo_automatico: true });
});