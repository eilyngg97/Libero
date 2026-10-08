import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PagosAlumno from './PagosAlumno';

jest.mock('../context/DolarContext', () => ({ useDolar: () => ({ dolar: { promedio: 873.87, moneda: 'USD' } }) }));
jest.mock('../utils/dolarHistorico', () => ({ obtenerTasaOficialPorFecha: jest.fn().mockResolvedValue(873.87), obtenerTasaEuroOficialPorFecha: jest.fn().mockResolvedValue(900) }));
jest.mock('./ModalPago', () => (props) => props.open ? <div role="dialog" aria-label="Pago neto">
  <span>Transferir {props.pago.monto.toFixed(2)}</span>
  <span>Credito {Number(props.pago.credito_a_aplicar).toFixed(2)}</span>
</div> : null);

const fetchOriginal = global.fetch;
let estadoGrupo;
let agrupado;
let consultaDenegada;
let conflicto;
let credito;

beforeEach(() => {
  estadoGrupo = 'En revision';
  agrupado = true;
  consultaDenegada = false;
  conflicto = false;
  credito = 0;
  localStorage.setItem('rol', 'usuario');
  global.fetch = jest.fn(async (url, options = {}) => {
    let data;
    if (options.method === 'PATCH') {
      return { ok: !conflicto, status: conflicto ? 409 : 200,
        json: async () => conflicto ? { error: 'El grupo cambio. Actualiza el editor.' } : { mensualidades_actualizadas: 2 } };
    }
    if (url.includes('/api/pagos/agrupado/g1/tasa?')) {
      data = { tasa: 873.87, moneda: 'USD', fecha_pago: '2026-10-07', fecha_tasa: '2026-10-07' };
    } else if (url.includes('/api/pagos/agrupado/g1')) {
      if (consultaDenegada) return { ok: false, status: 403, json: async () => ({ error: 'No tienes permiso para este pago agrupado' }) };
      data = { pago: { _id: 'g1', codigo: 'PA-TEST', estado: estadoGrupo, monto_total: 38, monto_total_bs: 33207.06,
        tasa_aplicada: 873.867,
        fecha_pago: '2026-10-07', metodo_pago: 'Pago movil', referencia: '313131' }, version: 'grupo-v1', transacciones_disponibles: true,
        asignaciones: [
          { id_pago: 'p1', id_mensualidad: 'm1', alumno_nombre: 'Victor Raga', mes: 9, anio: 2026, monto_pagado: 19, monto_pagado_bs: 16603.53, monto_pendiente: 19 },
          { id_pago: 'p2', id_mensualidad: 'm2', alumno_nombre: 'Eva Raga', mes: 9, anio: 2026, monto_pagado: 19, monto_pagado_bs: 16603.53, monto_pendiente: 19 }
        ] };
    } else if (url.includes('/api/pagos/m1')) {
      data = [{ _id: 'p1', ...(agrupado ? { id_pago_agrupado: 'g1' } : {}), monto_pagado: 19, monto_pagado_bs: 16603.53,
        metodo_pago: 'Pago movil', fecha_pago: '2026-10-07', referencia: '313131' }];
    } else if (url.includes('/api/mensualidades')) {
      data = [{ _id: 'm1', id_alumno: { _id: 'a1' }, mes: 9, anio: 2026, monto_esperado: 19,
        estatus: credito > 0 ? 'Insolvente' : 'En revision', saldo_pendiente: Number((19 - credito).toFixed(2)),
        credito_a_aplicar: credito, saldo_a_favor_disponible: credito }];
    } else data = [];
    return { ok: true, json: async () => data };
  });
});

afterEach(() => { global.fetch = fetchOriginal; localStorage.clear(); });

async function abrirDetalle() {
  render(<MemoryRouter><PagosAlumno alumno={{ _id: 'a1', nombres: 'Victor', apellidos: 'Raga' }} /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: /Ver detalle/i }));
}

test('muestra el total transferido y ambas atletas, separados de la asignacion individual', async () => {
  await abrirDetalle();
  const resumen = await screen.findByRole('region', { name: 'Transferencia agrupada' });
  expect(await within(resumen).findByText('Bs 33207.06')).toBeInTheDocument();
  expect(within(resumen).getByText('$38.00 USD')).toBeInTheDocument();
  expect(within(resumen).getByText('Victor Raga')).toBeInTheDocument();
  expect(within(resumen).getByText('Eva Raga')).toBeInTheDocument();
  expect(within(resumen).getByText('Este alumno')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Copiar referencia' })).toBeInTheDocument();
  expect(screen.getByText('Asignado a este alumno')).toBeInTheDocument();
  expect(screen.getAllByText('873.867 Bs/USD')).toHaveLength(2);
  expect(screen.getByText('Bs 16603.47 / $19.00 USD')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Resumen de la mensualidad' })).queryByText('Saldo a favor aplicado')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
});

test.each([
  { tipo: 'agrupado', esGrupo: true, montoBase: 15, ajuste: 0 },
  { tipo: 'individual', esGrupo: false, montoBase: 15, ajuste: 0 },
  { tipo: 'historico sin base original', esGrupo: true, montoBase: undefined, ajuste: 0 },
  { tipo: 'con ajuste adicional', esGrupo: true, montoBase: 15, ajuste: 2 }
])('desglosa el credito aplicado en el detalle $tipo sin descontarlo otra vez', async ({ esGrupo, montoBase, ajuste }) => {
  agrupado = esGrupo;
  const original = global.fetch.getMockImplementation();
  global.fetch.mockImplementation(async (url, options) => url.includes('/api/mensualidades')
    ? { ok: true, json: async () => [{ _id: 'm1', id_alumno: { _id: 'a1' }, mes: 9, anio: 2026,
      monto_base: montoBase, monto_esperado: Number((17.97 - ajuste).toFixed(2)),
      monto_sin_recargo_usd: Number((13.97 - ajuste).toFixed(2)), recargo_aplicado_usd: 4,
      credito_aplicado: 1.03, credito_a_aplicar: 0, saldo_a_favor_disponible: 12.55,
      ajuste_extraordinario: ajuste, estatus: 'En revision', saldo_pendiente: 0 }] }
    : original(url, options));
  await abrirDetalle();
  const resumen = within(await screen.findByRole('region', { name: 'Resumen de la mensualidad' }));
  expect(resumen.getByText('Monto base original')).toBeInTheDocument();
  expect(resumen.getByText('$15.00')).toBeInTheDocument();
  expect(resumen.getByText('Saldo a favor aplicado')).toBeInTheDocument();
  expect(resumen.getByText('- $1.03')).toBeInTheDocument();
  expect(resumen.getByText(`Base neta: $${(13.97 - ajuste).toFixed(2)}`)).toBeInTheDocument();
  expect(resumen.getByText('+ $4.00')).toBeInTheDocument();
  expect(resumen.getByText(new RegExp(`\\$${(17.97 - ajuste).toFixed(2).replace('.', '\\.')} USD`))).toBeInTheDocument();
  expect(resumen.queryByText('- $2.00') !== null).toBe(ajuste > 0);
  expect(global.fetch.mock.calls.every(([, options]) => !options?.method || options.method === 'GET')).toBe(true);
});

test('edita la transferencia completa con todas las asignaciones y nunca usa PATCH individual', async () => {
  await abrirDetalle();
  fireEvent.click(await screen.findByRole('button', { name: 'Editar pago agrupado' }));
  const total = await screen.findByLabelText(/Total transferido \(Bs\)/);
  expect(total).toHaveValue(33207.06);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled());
  fireEvent.change(screen.getByLabelText(/^Referencia/), { target: { value: '262626' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  expect(await screen.findByText('Transferencia agrupada actualizada para todos los atletas.')).toBeInTheDocument();
  const cambios = global.fetch.mock.calls.filter(([, options]) => options?.method === 'PATCH');
  expect(cambios).toHaveLength(1);
  expect(cambios[0][0]).toContain('/api/pagos/agrupado/g1');
  const form = cambios[0][1].body;
  expect(form.get('monto_total')).toBe('38.00');
  expect(form.get('version')).toBe('grupo-v1');
  expect(JSON.parse(form.get('asignaciones'))).toEqual([{ id_pago: 'p1', monto_pagado: 19 }, { id_pago: 'p2', monto_pagado: 19 }]);
});

test('desde el historial abre el mismo editor agrupado', async () => {
  await abrirDetalle();
  fireEvent.click(await screen.findByRole('button', { name: 'Editar grupo desde historial' }));
  expect(await screen.findByLabelText(/Total transferido \(Bs\)/)).toHaveValue(33207.06);
});

test('el grupo conciliado muestra el total pero no ofrece edicion', async () => {
  estadoGrupo = 'Conciliado';
  await abrirDetalle();
  await screen.findByText('Bs 33207.06');
  expect(screen.queryByRole('button', { name: 'Editar pago agrupado' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar grupo desde historial' })).not.toBeInTheDocument();
});

test('un acceso denegado no habilita el editor individual como alternativa', async () => {
  consultaDenegada = true;
  await abrirDetalle();
  expect(await screen.findByText('No tienes permiso para este pago agrupado')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /^Editar/ })).not.toBeInTheDocument();
  expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false);
});

test('un conflicto del grupo conserva el editor y no reintenta individualmente', async () => {
  conflicto = true;
  await abrirDetalle();
  fireEvent.click(await screen.findByRole('button', { name: 'Editar pago agrupado' }));
  await screen.findByLabelText(/Total transferido \(Bs\)/);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  expect(await screen.findByText('El grupo cambio. Actualiza el editor.')).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled());
  const cambios = global.fetch.mock.calls.filter(([, options]) => options?.method === 'PATCH');
  expect(cambios).toHaveLength(1);
  expect(cambios[0][0]).toContain('/api/pagos/agrupado/g1');
});

test('el pago individual conserva su editor y no consulta grupos', async () => {
  agrupado = false;
  await abrirDetalle();
  fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
  expect(await screen.findByText('Editar Pago')).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Transferencia agrupada' })).not.toBeInTheDocument();
  expect(global.fetch.mock.calls.some(([url]) => url.includes('/api/pagos/agrupado/'))).toBe(false);
});

test('el detalle se cierra desde su control accesible sin alterar pagos', async () => {
  await abrirDetalle();
  await screen.findByRole('button', { name: 'Editar pago agrupado' });
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar detalle del pago' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(global.fetch.mock.calls.every(([, options]) => !options?.method || options.method === 'GET')).toBe(true);
});

test('la mensualidad existente abre pago por el neto y transmite el credito cotizado', async () => {
  credito = 1.03;
  render(<MemoryRouter><PagosAlumno alumno={{ _id: 'a1', nombres: 'Victor' }} /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Pagar Ahora' }));
  expect(screen.getByText('Transferir 17.97')).toBeInTheDocument();
  expect(screen.getByText('Credito 1.03')).toBeInTheDocument();
});

test('credito completo usa el endpoint de credito y no abre un formulario bancario', async () => {
  credito = 19;
  render(<MemoryRouter><PagosAlumno alumno={{ _id: 'a1', nombres: 'Victor' }} /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Usar saldo a favor' }));
  expect(await screen.findByText('Mensualidad cubierta con saldo a favor, sin transferencia adicional.')).toBeInTheDocument();
  const [url, options] = global.fetch.mock.calls.find(([, options]) => options?.method === 'POST');
  expect(url).toContain('/api/pagos/credito');
  expect(JSON.parse(options.body)).toEqual({ id_mensualidad: 'm1', credito_a_aplicar: 19 });
  expect(screen.queryByRole('dialog', { name: 'Pago neto' })).not.toBeInTheDocument();
});