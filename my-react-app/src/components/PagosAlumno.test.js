import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PagosAlumno from './PagosAlumno';
import { obtenerTasaOficialPorFecha, obtenerTasaEuroOficialPorFecha } from '../utils/dolarHistorico';
import * as mediaUtils from '../utils/mediaUrl';

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
  obtenerTasaOficialPorFecha.mockResolvedValue(873.87);
  obtenerTasaEuroOficialPorFecha.mockResolvedValue(900);
  estadoGrupo = 'En revision';
  agrupado = true;
  consultaDenegada = false;
  conflicto = false;
  credito = 0;
  localStorage.setItem('rol', 'usuario');
  global.fetch = jest.fn(async (url, options = {}) => {
    let data;
    if (options.method === 'DELETE') {
      return { ok: !conflicto, status: conflicto ? 409 : 200,
        json: async () => conflicto ? { error: 'El grupo cambio. Actualiza el detalle antes de eliminarlo.' } : { mensualidades_actualizadas: 2 } };
    }
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
          { id_pago: 'p1', id_mensualidad: 'm1', version_mensualidad: 'm1-v1', alumno_nombre: 'Victor Raga', mes: 9, anio: 2026, monto_pagado: 19, monto_pagado_bs: 16603.53, monto_pendiente: 19 },
          { id_pago: 'p2', id_mensualidad: 'm2', version_mensualidad: 'm2-v1', alumno_nombre: 'Eva Raga', mes: 9, anio: 2026, monto_pagado: 19, monto_pagado_bs: 16603.53, monto_pendiente: 19 }
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

test.each([0, 5])('permite pagar el restante de una cuota con credito provisional y pago directo de %s', async (totalPagado) => {
  const restante = Number((19.96 - totalPagado).toFixed(2));
  const original = global.fetch.getMockImplementation();
  global.fetch.mockImplementation(async (url, options = {}) => {
    if (url.includes('/api/mensualidades')) return { ok: true, json: async () => [
      { _id: 'm1', id_alumno: { _id: 'a1' }, mes: 12, anio: 2026, monto_base: 20,
        monto_esperado: 19.96, saldo_pendiente: restante, total_pagado: totalPagado,
        credito_aplicado: 0.04, credito_en_revision: 0.04, credito_a_aplicar: 0,
        saldo_a_favor_disponible: 0, estatus: 'En revision' }
    ] };
    return original(url, options);
  });
  render(<MemoryRouter><PagosAlumno alumno={{ _id: 'a1', nombres: 'Victor', apellidos: 'Raga' }} /></MemoryRouter>);
  const pagar = await screen.findByRole('button', { name: 'Pagar restante' });
  expect(pagar).toBeEnabled();
  expect(screen.getByText('Pago Pendiente')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Balance pendiente' })).getByText(`$${restante.toFixed(2)}`)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Adelantar proximo mes/i })).toBeDisabled();
  expect(screen.getByRole('button', { name: /Ver detalle/i })).toBeInTheDocument();
  fireEvent.click(pagar);
  const modal = within(await screen.findByRole('dialog', { name: 'Pago neto' }));
  expect(modal.getByText(`Transferir ${restante.toFixed(2)}`)).toBeInTheDocument();
  expect(modal.getByText('Credito 0.00')).toBeInTheDocument();
  expect(global.fetch.mock.calls.every(([, options]) => !options?.method || options.method === 'GET')).toBe(true);
});

test('deuda anterior por credito provisional bloquea pagar un mes posterior', async () => {
  const original = global.fetch.getMockImplementation();
  global.fetch.mockImplementation(async (url, options = {}) => {
    if (url.includes('/api/mensualidades')) return { ok: true, json: async () => [
      { _id: 'm1', id_alumno: { _id: 'a1' }, mes: 11, anio: 2026, monto_esperado: 19.96,
        saldo_pendiente: 19.96, credito_aplicado: 0.04, credito_en_revision: 0.04, estatus: 'En revision' },
      { _id: 'm2', id_alumno: { _id: 'a1' }, mes: 12, anio: 2026, monto_esperado: 20,
        saldo_pendiente: 20, estatus: 'Pendiente' }
    ] };
    return original(url, options);
  });
  render(<MemoryRouter><PagosAlumno alumno={{ _id: 'a1', nombres: 'Victor', apellidos: 'Raga' }} /></MemoryRouter>);
  expect(await screen.findByRole('button', { name: 'Pagar restante' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Pagar Ahora' })).toBeDisabled();
  expect(within(screen.getByRole('region', { name: 'Balance pendiente' })).getByText('$39.96')).toBeInTheDocument();
});

test.each(['En revision', 'Pagado'])('detalle de cuota cubierta solo con credito muestra origen y remanente (%s)', async (estatus) => {
  const original = global.fetch.getMockImplementation();
  global.fetch.mockImplementation(async (url, options = {}) => {
    if (url.includes('/api/pagos/m1')) return { ok: true, json: async () => [] };
    if (url.includes('/api/pagos/origen')) return { ok: true, json: async () => [
      { _id: 'p-origen', monto_pagado: 60, metodo_pago: 'Efectivo', referencia: 'ORIGEN-QA' }
    ] };
    if (url.includes('/api/mensualidades')) return { ok: true, json: async () => [
      { _id: 'm1', id_alumno: { _id: 'a1' }, mes: 9, anio: 2026, monto_base: 20,
        monto_esperado: 0, monto_total: 0, monto_sin_recargo_usd: 0, saldo_pendiente: 0,
        credito_aplicado: 20, credito_en_revision: estatus === 'En revision' ? 20 : 0,
        credito_origenes: [{ id_mensualidad: 'origen', monto: 20, provisional: estatus === 'En revision' }],
        saldo_a_favor_restante: 16, estatus },
      { _id: 'origen', id_alumno: { _id: 'a1' }, mes: 8, anio: 2026, monto_esperado: 24,
        total_pagado: 60, saldo_a_favor_generado: 36, saldo_pendiente: 0, estatus }
    ] };
    return original(url, options);
  });
  render(<MemoryRouter><PagosAlumno alumno={{ _id: 'a1', nombres: 'Victor', apellidos: 'Raga' }} /></MemoryRouter>);
  const botones = await screen.findAllByRole('button', { name: /Ver detalle|Ver Recibo/i });
  expect(screen.queryByRole('button', { name: 'Pagar restante' })).not.toBeInTheDocument();
  expect(screen.getByText('Saldo a favor aplicado: $20.00 USD')).toBeInTheDocument();
  expect(screen.getByText('Pago directo: $0.00 USD')).toBeInTheDocument();
  fireEvent.click(botones[0]);
  const resumen = within(await screen.findByRole('region', { name: 'Resumen de la mensualidad' }));
  expect(resumen.getByText('Monto base original')).toBeInTheDocument();
  expect(resumen.getByText('- $20.00')).toBeInTheDocument();
  const creditoAplicado = within(screen.getByRole('region', { name: 'Aplicacion de saldo a favor' }));
  expect(creditoAplicado.getByText('Mensualidad agosto 2026')).toBeInTheDocument();
  expect(creditoAplicado.getByText('Sin transferencia adicional para esta mensualidad.')).toBeInTheDocument();
  expect(creditoAplicado.getByText('$16.00 USD')).toBeInTheDocument();
  expect(creditoAplicado.getByText(estatus === 'En revision' ? 'Crédito en revisión' : 'Crédito confirmado')).toBeInTheDocument();
  expect(screen.queryByText('No hay informacion de pago registrada.')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar', exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Eliminar', exact: true })).not.toBeInTheDocument();
  fireEvent.click(creditoAplicado.getByRole('button', { name: 'Ver pago de origen' }));
  await screen.findByText('ORIGEN-QA');
  expect(screen.getByRole('region', { name: 'Resumen de la mensualidad' })).toHaveTextContent('$60.00 USD');
  expect(global.fetch.mock.calls.every(([, options]) => !options?.method || options.method === 'GET')).toBe(true);
});

test('credito historico sin origen disponible conserva el detalle sin inventar datos de transferencia', async () => {
  const original = global.fetch.getMockImplementation();
  global.fetch.mockImplementation(async (url, options = {}) => {
    if (url.includes('/api/pagos/m1')) return { ok: true, json: async () => [] };
    if (url.includes('/api/mensualidades')) return { ok: true, json: async () => [
      { _id: 'm1', id_alumno: { _id: 'a1' }, mes: 9, anio: 2026, monto_base: 20,
        monto_esperado: 0, credito_aplicado: 20, estatus: 'En revision' }
    ] };
    return original(url, options);
  });
  await abrirDetalle();
  expect(await screen.findByRole('region', { name: 'Resumen de la mensualidad' })).toHaveTextContent('- $20.00');
  const aplicacion = within(screen.getByRole('region', { name: 'Aplicacion de saldo a favor' }));
  expect(aplicacion.getByText('Origen histórico del saldo no disponible.')).toBeInTheDocument();
  expect(aplicacion.getByText('Crédito aplicado')).toBeInTheDocument();
  expect(aplicacion.queryByText('Crédito confirmado')).not.toBeInTheDocument();
  expect(aplicacion.queryByRole('button', { name: 'Ver pago de origen' })).not.toBeInTheDocument();
  expect(screen.queryByText('No hay informacion de pago registrada.')).not.toBeInTheDocument();
  expect(screen.queryByText('Datos del pago')).not.toBeInTheDocument();
});

test.each([false, true])('el formulario real envia el excedente completo sin limitarlo al esperado (agrupado=%s)', async (esGrupo) => {
  const ModalPagoReal = jest.requireActual('./ModalPago').default;
  const enviarGrupo = jest.fn().mockResolvedValue(undefined);
  const cerrar = jest.fn();
  render(<ModalPagoReal open onClose={cerrar} pago={{ id: esGrupo ? 'grupo' : 'm1', monto: 80 }}
    disableCuotas={esGrupo} onSubmitPayment={esGrupo ? enviarGrupo : undefined} />);
  fireEvent.click(await screen.findByText('Pago Movil'));
  fireEvent.click(screen.getByRole('button', { name: 'Ya pague' }));
  fireEvent.change(screen.getByPlaceholderText('4125163627'), { target: { value: '4125163627' } });
  fireEvent.change(screen.getByPlaceholderText('22188421'), { target: { value: '22188421' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  const montoBs = await screen.findByLabelText('Monto pagado (Bs)');
  await waitFor(() => expect(montoBs).toHaveValue('69909.60'));
  fireEvent.change(montoBs, { target: { value: '80000' } });
  fireEvent.change(screen.getByLabelText('Referencia'), { target: { value: '292929' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar pago' }));
  await waitFor(() => expect(cerrar).toHaveBeenCalled());
  const equivalente = Number((80000 / 873.87).toFixed(2));
  if (esGrupo) {
    expect(enviarGrupo).toHaveBeenCalledWith(expect.objectContaining({ montoPagadoBs: 80000, montoPagadoMoneda: equivalente }));
  } else {
    const [url, options] = global.fetch.mock.calls.find(([, opciones]) => opciones?.method === 'POST');
    expect(url).toContain('/api/pagos');
    expect(options.body.get('monto_pagado_bs')).toBe('80000.00');
    expect(options.body.get('monto_pagado')).toBe(equivalente.toFixed(2));
    expect(options.body.get('monto_esperado_usd')).toBe('80.00');
  }
});

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

test.each([true, false])('muestra el monto pagado en Bs y USD en el resumen (agrupado=%s)', async (esGrupo) => {
  agrupado = esGrupo;
  await abrirDetalle();
  const resumen = within(await screen.findByRole('region', { name: 'Resumen de la mensualidad' }));
  const montoPagado = resumen.getByText(esGrupo ? 'Asignado a este alumno' : 'Monto pagado').parentElement;
  expect(within(montoPagado).getByText('Bs 16603.53 / $19.00 USD')).toBeInTheDocument();
});

test('el monto pagado sin importe en Bs conserva el valor en USD sin inventar una conversion', async () => {
  agrupado = false;
  const original = global.fetch.getMockImplementation();
  global.fetch.mockImplementation(async (url, options = {}) => url.includes('/api/pagos/m1') && !options.method
    ? { ok: true, json: async () => [{ _id: 'p1', monto_pagado: 19, metodo_pago: 'Efectivo' }] }
    : original(url, options));
  await abrirDetalle();
  const resumen = within(await screen.findByRole('region', { name: 'Resumen de la mensualidad' }));
  const montoPagado = resumen.getByText('Monto pagado').parentElement;
  expect(within(montoPagado).getByText('$19.00 USD')).toBeInTheDocument();
  expect(montoPagado).not.toHaveTextContent('Bs');
});

test('elimina solo mediante la ruta grupal tras confirmar ambas atletas', async () => {
  await abrirDetalle();
  fireEvent.click(await screen.findByRole('button', { name: 'Eliminar pago agrupado' }));
  const confirmacion = await screen.findByRole('dialog', { name: 'Eliminar pago agrupado' });
  expect(within(confirmacion).getByText(/Victor Raga/)).toBeInTheDocument();
  expect(within(confirmacion).getByText(/Eva Raga/)).toBeInTheDocument();
  expect(within(confirmacion).getByText(/Se eliminara la transferencia completa para todos los atletas indicados/)).toBeInTheDocument();
  expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false);
  fireEvent.click(within(confirmacion).getByRole('button', { name: 'Eliminar pago' }));
  expect(await screen.findByText('Pago agrupado eliminado para todos los atletas.')).toBeInTheDocument();
  const llamadas = global.fetch.mock.calls.filter(([, options]) => options?.method === 'DELETE');
  expect(llamadas).toHaveLength(1);
  expect(llamadas[0][0]).toContain('/api/pagos/agrupado/g1');
  expect(JSON.parse(llamadas[0][1].body)).toEqual({ version: 'grupo-v1', mensualidades: [
    { id_mensualidad: 'm1', version: 'm1-v1' }, { id_mensualidad: 'm2', version: 'm2-v1' }
  ] });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('cancelar la eliminacion agrupada no envia cambios', async () => {
  await abrirDetalle();
  fireEvent.click(await screen.findByRole('button', { name: 'Eliminar pago agrupado' }));
  const confirmacion = await screen.findByRole('dialog', { name: 'Eliminar pago agrupado' });
  fireEvent.click(within(confirmacion).getByRole('button', { name: 'Cancelar' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Eliminar pago agrupado' })).not.toBeInTheDocument());
  expect(global.fetch.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false);
});

test('un conflicto al eliminar se muestra en la confirmacion y no borra individualmente', async () => {
  conflicto = true;
  await abrirDetalle();
  fireEvent.click(await screen.findByRole('button', { name: 'Eliminar pago agrupado' }));
  const confirmacion = await screen.findByRole('dialog', { name: 'Eliminar pago agrupado' });
  fireEvent.click(within(confirmacion).getByRole('button', { name: 'Eliminar pago' }));
  expect(await within(confirmacion).findByRole('alert')).toHaveTextContent('El grupo cambio. Actualiza el detalle antes de eliminarlo.');
  expect(global.fetch.mock.calls.filter(([, options]) => options?.method === 'DELETE')).toHaveLength(1);
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
  expect(screen.queryByRole('button', { name: 'Eliminar pago agrupado' })).not.toBeInTheDocument();
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
}, 10000);

test('el pago individual conserva su editor y no consulta grupos', async () => {
  agrupado = false;
  await abrirDetalle();
  fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
  expect(await screen.findByText('Editar Pago')).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Transferencia agrupada' })).not.toBeInTheDocument();
  expect(global.fetch.mock.calls.some(([url]) => url.includes('/api/pagos/agrupado/'))).toBe(false);
});

test.each(['comprobante', 'nota'])('permite guardar %s sin exigir corregir el telefono historico del pago', async (cambio) => {
  agrupado = false;
  const original = global.fetch.getMockImplementation();
  global.fetch.mockImplementation(async (url, options = {}) => url.includes('/api/pagos/m1') && !options.method
    ? { ok: true, json: async () => [{ _id: 'p1', monto_pagado: 19, monto_pagado_bs: 16603.53,
      metodo_pago: 'Pago movil', fecha_pago: '2026-10-07', referencia: '313131',
      telefono_pago: '748596', cedula_titular: 'V-13843872' }] }
    : original(url, options));
  await abrirDetalle();
  fireEvent.click(await screen.findByRole('button', { name: 'Editar' }));
  const guardar = await screen.findByRole('button', { name: 'Guardar cambios' });
  expect(screen.getByLabelText('Teléfono de pago')).toHaveValue('748596');
  expect(screen.getByLabelText('Cédula del titular')).toHaveValue('13843872');
  const foto = new File(['imagen'], 'comprobante.png', { type: 'image/png' });
  if (cambio === 'comprobante') {
    fireEvent.change(screen.getByLabelText('Adjuntar comprobante del pago'), { target: { files: [foto] } });
  } else {
    fireEvent.change(screen.getByLabelText('Nota para administración (opcional)'), { target: { value: 'Foto del pago' } });
  }
  await waitFor(() => expect(guardar).toBeEnabled());
  const telefono = screen.getByLabelText('Teléfono de pago');
  fireEvent.change(telefono, { target: { value: '748597' } });
  expect(guardar).toBeDisabled();
  expect(screen.getByText('Ingresa 10 digitos, sin el 0 inicial.')).toBeInTheDocument();
  fireEvent.change(telefono, { target: { value: '4127485596' } });
  expect(guardar).toBeEnabled();
  fireEvent.change(telefono, { target: { value: '748596' } });
  expect(guardar).toBeEnabled();
  fireEvent.click(guardar);
  await waitFor(() => expect(global.fetch.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(1));
  const [url, options] = global.fetch.mock.calls.find(([, options]) => options?.method === 'PATCH');
  expect(url).toContain('/api/pagos/p1');
  expect(options.body.get('telefono_pago')).toBe('748596');
  expect(options.body.get('comprobante')).toEqual(cambio === 'comprobante' ? foto : null);
  expect(options.body.get('nota')).toBe(cambio === 'nota' ? 'Foto del pago' : '');
});

test.each(['png', 'pdf'])('abre comprobante %s dentro de un dialogo con URL del tenant y permite cerrarlo', async (extension) => {
  agrupado = false;
  const archivo = `/uploads/olympykus/comprobantes/pago.${extension}`;
  const urlTenant = `http://olympykus.localhost:4000${archivo}`;
  const resolver = jest.spyOn(mediaUtils, 'mediaUrl').mockReturnValue(urlTenant);
  const abrirPestana = jest.spyOn(window, 'open').mockImplementation(() => null);
  const original = global.fetch.getMockImplementation();
  global.fetch.mockImplementation(async (url, options = {}) => url.includes('/api/pagos/m1') && !options.method
    ? { ok: true, json: async () => [{ _id: 'p1', monto_pagado: 19, monto_pagado_bs: 16603.53,
      metodo_pago: 'Pago movil', fecha_pago: '2026-10-07', referencia: '313131', comprobante_url: archivo }] }
    : original(url, options));
  try {
    await abrirDetalle();
    fireEvent.click(await screen.findByRole('button', { name: 'Ver archivo' }));
    const visor = await screen.findByRole('dialog', { name: 'Comprobante del pago' });
    const contenido = extension === 'png'
      ? within(visor).getByRole('img', { name: 'Comprobante del pago' })
      : within(visor).getByTitle('Comprobante del pago PDF');
    expect(contenido).toHaveAttribute('src', urlTenant);
    expect(resolver).toHaveBeenCalledWith(archivo);
    expect(abrirPestana).not.toHaveBeenCalled();
    if (extension === 'png') {
      fireEvent.error(contenido);
    }
    expect(within(visor).queryByRole('alert') !== null).toBe(extension === 'png');
    fireEvent.click(within(visor).getByRole('button', { name: 'Cerrar comprobante' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Comprobante del pago' })).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: /Detalle del pago/i })).toBeInTheDocument();
    expect(global.fetch.mock.calls.every(([, options]) => !options?.method || options.method === 'GET')).toBe(true);
  } finally {
    resolver.mockRestore();
    abrirPestana.mockRestore();
  }
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