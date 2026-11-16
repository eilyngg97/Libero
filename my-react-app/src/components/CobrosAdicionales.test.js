import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import CobrosAdicionales from './CobrosAdicionales';
import ProtectedRoute from './ProtectedRoute';
import CampaniaParticipantesDialog from './CampaniaParticipantesDialog';
import CampaniaResumenDialog from './CampaniaResumenDialog';
import CampaniaPagoDialog from './CampaniaPagoDialog';
import * as CampaniaPagoDialogModule from './CampaniaPagoDialog';
import EstadoPagoChip from './EstadoPagoChip';
import CampaniasAlumno from './CampaniasAlumno';
import PanelOpcionesUsuario from './PanelOpcionesUsuario';
import { obtenerTasaOficialPorFecha } from '../utils/dolarHistorico';

jest.mock('../context/DolarContext', () => ({ useDolar: () => ({ dolar: { promedio: 100, moneda: 'USD' } }) }));
jest.mock('../utils/dolarHistorico', () => ({ obtenerTasaOficialPorFecha: jest.fn(async () => 100), obtenerTasaEuroOficialPorFecha: jest.fn(async () => 100) }));

const originalFetch = window.fetch;
const originalCrypto = Object.getOwnPropertyDescriptor(window, 'crypto');
const campania = (indice) => ({ _id: String(indice), nombre: `Viaje ${indice}`, descripcion: '',
  monto_general: 30, moneda: 'USD', estado: 'borrador', sedes: [{ _id: 'norte', nombre: 'Norte' }], vencimiento: '2026-12-15', __v: 0 });
const responder = (campanias) => ({ ok: true, status: 200, json: async () => ({ campanias }) });

describe('aviso de cobros adicionales en el panel', () => {
  const cargo = { alumno: 'ana', estado: 'pendiente', saldo_pendiente: 30, disponible: 30,
    pago_en_revision: false, campania: { estado: 'abierta' } };
  const abrir = (cargos, ok = true) => {
    localStorage.setItem('aviso-expediente-leido::ana', 'true');
    window.fetch.mockImplementation(async (url) => ({ ok: url.includes('/mis-cargos') ? ok : true,
      json: async () => url.includes('/mis-cargos') ? { cargos } : [] }));
    render(<MemoryRouter initialEntries={[{ pathname: '/panel-opciones-usuario/ana',
      state: { alumno: { _id: 'ana', nombres: 'Ana' } } }]}><PanelOpcionesUsuario /></MemoryRouter>);
    return screen.getByRole('button', { name: /Cobros adicionales/ });
  };
  test('avisa de cargos pendientes y abonos con saldo propio', async () => {
    const tarjeta = within(abrir([cargo, { ...cargo, estado: 'abono', saldo_pendiente: 10, disponible: 10 }]));
    expect(await tarjeta.findByText('Pago pendiente')).toBeInTheDocument();
    expect(tarjeta.getByText('Tienes 2 cobros adicionales con saldo pendiente')).toBeInTheDocument();
    expect(window.fetch).toHaveBeenCalledWith(expect.stringContaining('/mis-cargos?alumnoId=ana'),
      expect.objectContaining({ headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }, cache: 'no-store' }));
  });
  test('distingue un pago en revision que cubre todo el saldo', async () => {
    const tarjeta = within(abrir([{ ...cargo, disponible: 0, pago_en_revision: true }]));
    expect(await tarjeta.findByText('Pago en revision')).toBeInTheDocument();
    expect(tarjeta.queryByText('Pago pendiente')).not.toBeInTheDocument();
  });
  test('no cuenta cargos pagados, no aplicables o cancelados', async () => {
    const tarjeta = within(abrir([{ ...cargo, estado: 'pagado', saldo_pendiente: 0, disponible: 0 },
      { ...cargo, estado: 'no_aplica' }, { ...cargo, campania: { estado: 'cancelada' } }]));
    expect(await tarjeta.findByText('Sin pendientes')).toBeInTheDocument();
  });
  test('sin cargos muestra que no hay pendientes', async () => {
    const tarjeta = within(abrir([]));
    expect(await tarjeta.findByText('No tienes cobros adicionales por pagar')).toBeInTheDocument();
  });
  test.each([false, true])('no anuncia sin pendientes ante un error o datos ajenos: %s', async (ok) => {
    const tarjeta = within(abrir([{ ...cargo, alumno: 'otro' }], ok));
    expect(await tarjeta.findByText('Sin datos')).toBeInTheDocument();
    expect(tarjeta.queryByText('Sin pendientes')).not.toBeInTheDocument();
  });
});

describe('listado representante de campanas', () => {
  const filas = [{ _id: 'cargo1', alumno: 'ana', nombres: 'Ana', apellidos: 'QA', monto: 30, saldo_pendiente: 30,
    moneda: 'USD', estado: 'pendiente', modalidad: 'general', permitir_abonos: true, pago_en_revision: true, disponible: 0,
    campania: { _id: 'camp1', nombre: 'Viaje QA', moneda: 'USD', estado: 'abierta' } },
  { _id: 'cargo2', alumno: 'ana', nombres: 'Ana', monto: 20, saldo_pendiente: 0, moneda: 'USD', estado: 'pagado',
    permitir_abonos: false, pago_en_revision: false, disponible: 0, campania: { _id: 'camp2', nombre: 'Torneo QA', moneda: 'USD', estado: 'cerrada' } }];
  const abrir = () => render(<MemoryRouter initialEntries={['/campanias-alumno/ana']}><Routes>
    <Route path="/campanias-alumno/:alumnoId" element={<CampaniasAlumno />} /></Routes></MemoryRouter>);
  test('lista cargos propios, distingue revision y bloquea pagos cubiertos o cerrados', async () => {
    window.fetch.mockResolvedValue({ ok: true, json: async () => ({ cargos: filas }) });
    abrir();
    expect(await screen.findByText('Viaje QA')).toBeInTheDocument();
    expect(screen.getByText('En revision')).toBeInTheDocument();
    const tarjetas = within(screen.getByRole('list', { name: 'Cobros adicionales del atleta' })).getAllByRole('listitem');
    expect(tarjetas[0]).toHaveStyle({ backgroundColor: '#fffdf8', border: '1px solid #efe7dc', borderRadius: '16px' });
    expect(tarjetas[1]).toHaveStyle({ backgroundColor: '#f6f8ff', border: '1px solid #e5e9f5', borderRadius: '16px' });
    expect(screen.getByRole('button', { name: 'Reportar pago de Viaje QA' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reportar pago de Torneo QA' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Buscar campaña'), { target: { value: 'Torneo' } });
    expect(screen.queryByText('Viaje QA')).not.toBeInTheDocument();
    expect(window.fetch.mock.calls[0][0]).toContain('/mis-cargos?alumnoId=ana');
  });
  test('rechaza respuestas de otro atleta y permite reintentar un error', async () => {
    window.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ cargos: [{ ...filas[0], alumno: 'ajeno' }] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cargos: [] }) });
    abrir();
    expect(await screen.findByText('No se pudieron verificar los cobros del atleta.')).toBeInTheDocument();
    expect(screen.queryByText('Viaje QA')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('No tienes cobros adicionales registrados.')).toBeInTheDocument();
  });

  test.each(['Cerrar aviso', 'Entendido'])('exige cerrar el aviso de reporte explicitamente con %s', async (cierre) => {
    jest.spyOn(CampaniaPagoDialogModule, 'default').mockImplementation(({ onSaved }) =>
      <button onClick={() => onSaved({})}>Enviar reporte QA</button>);
    window.fetch.mockResolvedValue({ ok: true, json: async () => ({ cargos: [{ ...filas[0],
      pago_en_revision: false, disponible: 30 }] }) });
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Reportar pago de Viaje QA' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar reporte QA' }));
    const aviso = await screen.findByRole('alertdialog', { name: 'Pago reportado' });
    expect(aviso).toHaveAccessibleDescription('Tu pago está pendiente de revisión. El importe se aplicará al saldo cuando sea confirmado.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Entendido' })).toHaveFocus());
    fireEvent.keyDown(aviso, { key: 'Escape', code: 'Escape' });
    screen.getAllByRole('presentation', { hidden: true }).forEach((fondo) => {
      fireEvent.mouseDown(fondo);
      fireEvent.click(fondo);
    });
    expect(screen.getByRole('alertdialog', { name: 'Pago reportado' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: cierre }));
    await waitFor(() => expect(screen.queryByRole('alertdialog', { name: 'Pago reportado' })).not.toBeInTheDocument());
  });

  test('campana cancelada conserva consulta sin permitir nuevos pagos', async () => {
    window.fetch.mockResolvedValue({ ok: true, json: async () => ({ cargos: [{ ...filas[0],
      disponible: 30, pago_en_revision: false, campania: { ...filas[0].campania, estado: 'cancelada' } }] }) });
    abrir();
    expect(await screen.findByText('Campana cancelada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reportar pago de Viaje QA' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Historial de Viaje QA' })).toBeEnabled();
  });
});

test.each([
  ['pendiente', 'Pendiente', '#fff3dc', '#b45309'], ['pagado', 'Pagado', '#dff7ea', '#0f7a4a'],
  ['abono', 'Abono', '#efe9e7', '#6d4c41'], ['en revision', 'En revision', '#fff6cc', '#b45309'],
  ['exonerado', 'Exonerado', '#e3f2fd', '#0288d1'], ['becado', 'Becado', '#e0f2fe', '#0284c7'],
  ['retrasado', 'Insolvente', '#ffe1e6', '#d32f2f'], ['insolvente', 'Insolvente', '#ffe1e6', '#d32f2f']
])('chip compartido conserva estilo de mensualidades: %s', (estado, label, fondo, color) => {
  render(<EstadoPagoChip estado={estado} data-testid="estado-chip" />);
  const chip = screen.getByTestId('estado-chip');
  expect(chip).toHaveTextContent(label);
  expect(chip).toHaveStyle({ backgroundColor: fondo, color, minWidth: '112px', fontWeight: 700 });
});

describe('pagos individuales campania', () => {
  const cargo = { _id: 'cargo1', campania: 'camp1', alumno: 'ana', monto: 30, saldo_pendiente: 30,
    moneda: 'USD', estado: 'pendiente', modalidad: 'general', permitir_abonos: false, __v: 0 };
  const actual = { _id: 'camp1', nombre: 'Viaje QA', moneda: 'USD', estado: 'abierta' };
  const fila = { _id: 'cargo1', alumno: 'ana', nombres: 'Ana', apellidos: 'QA', monto: 30 };
  const historial = (pagos = [], cambio = {}) => ({ cargo: { ...cargo, ...cambio }, pagos,
    totales: { confirmado: 0, en_revision: 0, saldo_pendiente: 30, disponible: 30 } });
  const pago = { _id: 'pago1', cargo: 'cargo1', campania: 'camp1', alumno: 'ana', moneda: 'USD', monto_pagado: 30,
    estado: 'en_revision', fecha_pago: '2026-11-10', referencia: 'TX-CAMPANIA', metodo_pago: 'Zelle',
    solicitud_id: '11000000-0000-4000-8000-000000000001', registrado_por: { id: 'admin-qa', rol: 'admin' } };
  const json = (data, ok = true) => ({ ok, json: async () => data });
  const preparar = (registrar, inicial = historial()) => {
    window.fetch.mockImplementation(async (url, options = {}) => options.method === 'POST' ? registrar(url, options)
      : url.includes('/api/configuracion/pagos') ? json({ pagos: { adicionales: [{ tipo: 'zelle', titular: 'QA', correo: 'qa@example.com' }] } })
        : json(inicial));
  };
  const abrir = async (props = {}) => {
    render(<CampaniaPagoDialog campania={actual} fila={fila} onClose={jest.fn()} onSaved={jest.fn()} {...props} />);
    fireEvent.click(await screen.findByText('Zelle', { exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Ya pague' }));
    await waitFor(() => expect(screen.getByLabelText('Monto pagado (USD)')).toHaveValue('30.00'));
    fireEvent.change(screen.getByLabelText('Referencia'), { target: { value: 'TX-CAMPANIA' } });
  };

  test.each([['admin', 'Portal admin'], ['super_admin', 'Portal admin'], ['usuario', 'Portal usuario'], [undefined, 'No disponible']])(
    'registrado por muestra el portal sin identificador para %s', async (rol, etiqueta) => {
      preparar(jest.fn(), { ...historial([{ ...pago, registrado_por: { id: 'actor-privado-qa', rol } }]),
        totales: { confirmado: 0, en_revision: 30, saldo_pendiente: 30, disponible: 0 } });
      render(<CampaniaPagoDialog campania={actual} fila={fila} modo="historial" onClose={jest.fn()} onSaved={jest.fn()} />);
      const lista = await screen.findByRole('list', { name: 'Historial de pagos del cargo' });
      expect(within(screen.getByRole('group', { name: 'Registrado por' })).getByText(etiqueta)).toBeInTheDocument();
      expect(within(lista).getByText(`Registrado por: ${etiqueta}`)).toBeInTheDocument();
      expect(screen.queryByText(/actor-privado-qa/)).not.toBeInTheDocument();
    });

  test('reutiliza ModalPago y registra en revision sin endpoint mensualidad', async () => {
    const onSaved = jest.fn();
    preparar(async () => json({ pago, cargo: { ...cargo, __v: 1 }, repetida: false }));
    await abrir({ onSaved });
    expect(screen.getByRole('checkbox', { name: 'Pago confirmado' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pago' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ pago })));
    const [url, options] = window.fetch.mock.calls.find(([, params]) => params?.method === 'POST');
    expect(url).toContain('/api/campanias-cobro/camp1/cargos/cargo1/pagos');
    expect(options.body.get('estado')).toBe('en_revision');
    expect(options.body.get('monto_pagado')).toBe('30.00');
    expect(options.body.get('monto_pagado_bs')).toBeNull();
    expect(options.body.get('id_mensualidad')).toBeNull();
  });

  test('representante reporta en revision sin opcion de confirmar ni datos de administrador', async () => {
    const onSaved = jest.fn();
    preparar(async () => json({ pago: { ...pago, registrado_por: { rol: 'usuario' } }, cargo: { ...cargo, __v: 1 }, repetida: false }));
    await abrir({ representante: true, onSaved });
    expect(screen.queryByRole('checkbox', { name: 'Pago confirmado' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pago' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [, options] = window.fetch.mock.calls.find(([, params]) => params?.method === 'POST');
    expect(options.body.get('estado')).toBe('en_revision');
  });

  test.each(['editar', 'eliminar'])('representante puede %s su ultimo reporte sin confirmar pagos ni exponer auditoria', async (accion) => {
    const propio = { ...pago, registrado_por: { rol: 'usuario' }, puede_corregir: true };
    const onSaved = jest.fn();
    window.fetch.mockImplementation(async (url, options = {}) => {
      if (options.method === 'PATCH' || options.method === 'DELETE') return json({ repetida: false,
        cargo: { ...cargo, __v: 1 }, pago: { ...propio, monto_pagado: accion === 'editar' ? 20 : 30,
          estado: accion === 'eliminar' ? 'eliminado' : 'en_revision', referencia: 'CORREGIDO' } });
      if (url.includes('/api/configuracion/pagos')) return json({ pagos: { adicionales: [{ tipo: 'zelle', titular: 'QA', correo: 'qa@example.com' }] } });
      return json({ ...historial([propio]), totales: { confirmado: 0, en_revision: 30, saldo_pendiente: 30, disponible: 0 } });
    });
    render(<CampaniaPagoDialog representante campania={actual} fila={fila} modo="historial" onClose={jest.fn()} onSaved={onSaved} />);
    await screen.findByRole('button', { name: 'Editar', exact: true });
    expect(screen.queryByRole('button', { name: /^Confirmar/ })).not.toBeInTheDocument();
    const formularioListo = () => expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled();
    if (accion === 'editar') {
      fireEvent.click(screen.getByRole('button', { name: 'Editar', exact: true }));
      await waitFor(formularioListo);
      fireEvent.change(screen.getByRole('spinbutton', { name: 'Monto pagado (USD)' }), { target: { value: '20' } });
      fireEvent.change(screen.getByRole('textbox', { name: 'Referencia' }), { target: { value: 'CORREGIDO' } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'Eliminar ultimo pago' }));
      fireEvent.click(within(screen.getByRole('alertdialog', { name: 'Eliminar ultimo pago' })).getByRole('button', { name: 'Eliminar pago' }));
    }
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ pago: expect.objectContaining({
      estado: accion === 'eliminar' ? 'eliminado' : 'en_revision' }) }), false));
    const [, options] = window.fetch.mock.calls.find(([, params]) => params?.method === (accion === 'editar' ? 'PATCH' : 'DELETE'));
    const enviado = accion === 'editar' ? { estado: options.body.get('estado'), monto: options.body.get('monto_pagado') }
      : JSON.parse(options.body);
    expect(enviado).toEqual(accion === 'editar' ? { estado: 'en_revision', monto: '20.00' } : { version: 0 });
  });

  test.each(['confirmado', 'anterior', 'cerrada'])('representante no modifica un reporte %s aunque incluya permiso de autor', async (caso) => {
    const propio = { ...pago, registrado_por: { rol: 'usuario' }, puede_corregir: true };
    let inicial = { ...historial([propio]), totales: { confirmado: 0, en_revision: 30, saldo_pendiente: 30, disponible: 0 } };
    if (caso === 'confirmado') inicial = { ...historial([{ ...propio, estado: 'confirmado' }], { saldo_pendiente: 0, estado: 'pagado' }),
      totales: { confirmado: 30, en_revision: 0, saldo_pendiente: 0, disponible: 0 } };
    if (caso === 'anterior') inicial.pagos = [{ ...propio, _id: 'pago2', monto_pagado: 15, puede_corregir: false }, { ...propio, monto_pagado: 15 }];
    preparar(jest.fn(), inicial);
    render(<CampaniaPagoDialog representante campania={{ ...actual, estado: caso === 'cerrada' ? 'cerrada' : 'abierta' }} fila={fila}
      modo="historial" onClose={jest.fn()} onSaved={jest.fn()} />);
    await screen.findByRole('list', { name: 'Historial de pagos del cargo' });
    expect(screen.queryByRole('button', { name: /Confirmar|Editar|Eliminar/ })).not.toBeInTheDocument();
  });

  test('representante consulta historial sin permiso de correccion ni confirmacion', async () => {
    preparar(jest.fn(), { ...historial([{ ...pago, registrado_por: { rol: 'usuario' } }], { __v: 1 }),
      totales: { confirmado: 0, en_revision: 30, saldo_pendiente: 30, disponible: 0 } });
    render(<CampaniaPagoDialog representante campania={actual} fila={fila} modo="historial" onClose={jest.fn()} onSaved={jest.fn()} />);
    await screen.findByRole('list', { name: 'Historial de pagos del cargo' });
    expect(screen.queryByRole('button', { name: /Confirmar|Editar|Eliminar/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver detalle del pago TX-CAMPANIA' })).toBeInTheDocument();
  });

  test('confirmacion explicita paga saldo y bloqueo de doble envio reutiliza UUID al reintentar', async () => {
    let resolver;
    const onSaved = jest.fn();
    preparar(() => new Promise((resolve) => { resolver = resolve; }));
    await abrir({ onSaved });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pago confirmado' }));
    const boton = screen.getByRole('button', { name: 'Confirmar pago' });
    fireEvent.click(boton); fireEvent.click(boton);
    expect(window.fetch.mock.calls.filter(([, params]) => params?.method === 'POST')).toHaveLength(1);
    await act(async () => resolver(json({ error: 'Error temporal' }, false)));
    expect(await screen.findByText('Error temporal')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pago' }));
    const solicitudes = window.fetch.mock.calls.filter(([, params]) => params?.method === 'POST');
    expect(solicitudes[1][1].body.get('solicitud_id')).toBe(solicitudes[0][1].body.get('solicitud_id'));
    await act(async () => resolver(json({ pago: { ...pago, estado: 'confirmado', confirmado_por: { id: 'admin-qa' }, confirmado_en: '2026-11-10' },
      cargo: { ...cargo, saldo_pendiente: 0, estado: 'pagado', __v: 1 }, repetida: false })));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  test('rechaza respuesta incoherente y conserva formulario', async () => {
    const onSaved = jest.fn();
    preparar(async () => json({ pago, cargo: { ...cargo, saldo_pendiente: 0, estado: 'pagado', __v: 1 }, repetida: false }));
    await abrir({ onSaved });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pago' }));
    expect(await screen.findByText(/No se pudo verificar el pago/)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
  });

  test('registra abono con la opcion conocida sin etiquetas de mensualidad', async () => {
    const onSaved = jest.fn();
    preparar(async () => json({ pago: { ...pago, monto_pagado: 10, estado: 'confirmado', confirmado_por: { id: 'admin-qa' }, confirmado_en: '2026-11-10' },
      cargo: { ...cargo, permitir_abonos: true, saldo_pendiente: 20, estado: 'abono', __v: 1 }, repetida: false }), historial([], { permitir_abonos: true }));
    render(<CampaniaPagoDialog campania={actual} fila={fila} onClose={jest.fn()} onSaved={onSaved} />);
    fireEvent.click(await screen.findByText('Zelle', { exact: true }));
    expect(screen.getByText('Pagar completo')).toBeInTheDocument();
    expect(screen.queryByText('Pagar Mensualidad Completa')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Realizar Abono Parcial'));
    fireEvent.change(screen.getByRole('textbox', { name: /Monto/ }), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ya pague' }));
    fireEvent.change(await screen.findByLabelText('Referencia'), { target: { value: 'TX-CAMPANIA' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pago confirmado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pago' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const [, options] = window.fetch.mock.calls.find(([, params]) => params?.method === 'POST');
    expect(options.body.get('monto_pagado')).toBe('10.00');
    expect(options.body.get('metodo_cobranza')).toBeNull();
  });

  test('historial separa revision de deuda y confirma con cancelar seguro', async () => {
    const onSaved = jest.fn();
    const inicial = { ...historial([pago], { __v: 1 }), totales: { confirmado: 0, en_revision: 30, saldo_pendiente: 30, disponible: 0 } };
    preparar(async () => json({ pago: { ...pago, estado: 'confirmado', confirmado_por: { id: 'admin-qa' }, confirmado_en: '2026-11-10' },
      cargo: { ...cargo, saldo_pendiente: 0, estado: 'pagado', __v: 2 }, repetida: false }), inicial);
    render(<CampaniaPagoDialog campania={actual} fila={fila} modo="historial" onClose={jest.fn()} onSaved={onSaved} />);
    await screen.findByRole('list', { name: 'Historial de pagos del cargo' });
    expect(screen.queryByRole('group', { name: 'En revision' })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Saldo pendiente' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pago TX-CAMPANIA' }));
    const dialogo = screen.getByRole('alertdialog', { name: 'Confirmar pago' });
    expect(within(dialogo).getByRole('heading', { name: 'Confirmar pago' })).toHaveStyle({ color: '#0f172a', fontWeight: '800' });
    expect(within(dialogo).getByText('¿Estas seguro de confirmar este pago?')).toHaveStyle({ color: '#334155' });
    expect(within(dialogo).getByRole('button', { name: 'Si, confirmar' })).toHaveStyle({ backgroundColor: '#0e1334', color: '#fff', boxShadow: 'none' });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(window.fetch.mock.calls.some(([, params]) => params?.method === 'POST')).toBe(false);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    const confirmarDetalle = screen.getByRole('button', { name: 'Confirmar', exact: true });
    expect(confirmarDetalle).toHaveStyle({ backgroundColor: '#0e1334', color: '#fff', borderRadius: '3996px', fontWeight: '800' });
    fireEvent.click(confirmarDetalle);
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Si, confirmar' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ repetida: false }), false));
  });

  test.each([
    ['en_revision', 'En revisión', '#fff6cc', '#b45309'],
    ['confirmado', 'Confirmado', '#dff7ea', '#0f7a4a']
  ])('historial comparte colores de mensualidades: %s', async (estado, label, fondo, color) => {
    const confirmado = estado === 'confirmado';
    const inicial = { ...historial([{ ...pago, estado }], { __v: 1, saldo_pendiente: confirmado ? 0 : 30,
      estado: confirmado ? 'pagado' : 'pendiente' }),
    totales: { confirmado: confirmado ? 30 : 0, en_revision: confirmado ? 0 : 30,
      saldo_pendiente: confirmado ? 0 : 30, disponible: 0 } };
    preparar(jest.fn(), inicial);
    render(<CampaniaPagoDialog campania={actual} fila={fila} modo="historial" onClose={jest.fn()} onSaved={jest.fn()} />);
    const historialPagos = await screen.findByRole('list', { name: 'Historial de pagos del cargo' });
    const chip = within(historialPagos).getByTestId('estado-pago-pago1');
    expect(chip).toHaveTextContent(label);
    expect(chip).toHaveStyle({ backgroundColor: fondo, color, minWidth: '112px', fontWeight: 700 });
    expect(Boolean(screen.queryByRole('button', { name: 'Confirmar', exact: true }))).toBe(!confirmado);
  });

  test('ficha campania comparte detalle completo y edita ultimo pago inline sin tocar mensualidades', async () => {
    obtenerTasaOficialPorFecha.mockResolvedValue(100);
    const onSaved = jest.fn();
    const anterior = { ...pago, metodo_pago: 'Transferencia', referencia: '123456', monto_pagado_bs: 3000,
      tasa: 100, telefono_pago: '4121234567', cedula_titular: 'V-12345678', nota: 'Nota original', estado: 'confirmado' };
    const inicial = { ...historial([anterior], { saldo_pendiente: 0, estado: 'pagado', permitir_abonos: true, __v: 1 }),
      totales: { confirmado: 30, en_revision: 0, saldo_pendiente: 0, disponible: 0 } };
    window.fetch.mockImplementation(async (url, options = {}) => options.method === 'PATCH'
      ? json({ pago: { ...anterior, monto_pagado: 20, monto_pagado_bs: 2000, nota: 'Nota corregida' },
        cargo: { ...inicial.cargo, saldo_pendiente: 10, estado: 'abono', __v: 2 }, repetida: false })
      : url.includes('/api/configuracion/pagos') ? json({ pagos: {} }) : json(inicial));
    render(<CampaniaPagoDialog campania={actual} fila={fila} modo="historial" onClose={jest.fn()} onSaved={onSaved} />);
    expect(await screen.findByText('Último Pago Registrado')).toBeInTheDocument();
    expect(screen.queryByText('Viaje QA', { exact: true })).not.toBeInTheDocument();
    expect(screen.getAllByText('Ana QA', { exact: true })).toHaveLength(1);
    expect(screen.queryByRole('group', { name: 'Confirmado' })).not.toBeInTheDocument();
    const historialPagos = screen.getByRole('list', { name: 'Historial de pagos del cargo' });
    const registro = within(historialPagos).getByRole('listitem');
    expect(registro).toHaveStyle({ backgroundColor: '#ffffff', borderLeft: '4px solid #c9daf6', borderRadius: '8px' });
    expect(registro).toHaveTextContent('Pago #1');
    expect(registro).toHaveTextContent('Bs 3000.00 / $30.00 USD');
    expect(registro).toHaveTextContent('Tel: 4121234567');
    expect(registro).toHaveTextContent('Ced: V-12345678');
    expect(screen.getByRole('heading', { name: /^Detalle del pago - Ana QA/ })).toHaveStyle({ backgroundColor: '#f3f5fb', color: '#0b2a57', fontSize: '17px' });
    expect(screen.getByTestId('icono-ultimo-pago')).toHaveStyle({ width: '24px', height: '24px', backgroundColor: '#dbeafe' });
    expect(within(screen.getByRole('group', { name: 'Monto pagado (Bs)' })).getByText('Equivalente USD: $30.00 USD')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Monto esperado (Bs)' })).getByText('Equivalente USD: $30.00 USD')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Tasa aplicada' })).toHaveTextContent('100 Bs/USD');
    expect(screen.getByRole('group', { name: 'Telefono de pago' })).toHaveTextContent('4121234567');
    expect(screen.getByRole('group', { name: 'Cedula de pago' })).toHaveTextContent('V-12345678');
    fireEvent.click(screen.getByRole('button', { name: 'Editar', exact: true }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Cancelar', exact: true })).toHaveStyle({ borderRadius: '3996px', color: '#0b2a57', fontWeight: '800' });
    expect(getComputedStyle(screen.getByRole('button', { name: 'Cancelar', exact: true })).borderColor).toBe('#93a7c7');
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toHaveStyle({ borderRadius: '3996px', backgroundColor: '#dcfce7', color: '#166534', fontWeight: '800' });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Monto pagado (Bs)' }), { target: { value: '2000' } });
    expect(within(screen.getByRole('group', { name: 'Monto pagado (Bs)' })).getByText('Equivalente USD: $20.00 USD')).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Monto esperado (Bs)' })).getByText('Equivalente USD: $20.00 USD')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Nota' }), { target: { value: 'Nota corregida' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ cargo: expect.objectContaining({ saldo_pendiente: 10 }) }), false));
    const [url, options] = window.fetch.mock.calls.find(([, params]) => params?.method === 'PATCH');
    expect(url).toContain('/campanias-cobro/camp1/cargos/cargo1/pagos/pago1');
    expect(options.body.get('monto_pagado')).toBe('20.00');
    expect(options.body.get('estado')).toBe('confirmado');
    expect(options.body.get('nota')).toBe('Nota corregida');
  });

  test('ficha campania elimina ultimo pago con cancelar seguro y conserva reintento ante error', async () => {
    const onSaved = jest.fn();
    const inicial = { ...historial([pago], { __v: 1 }), totales: { confirmado: 0, en_revision: 30, saldo_pendiente: 30, disponible: 0 } };
    let fallar = true;
    window.fetch.mockImplementation(async (url, options = {}) => options.method === 'DELETE'
      ? fallar ? json({ error: 'Error temporal' }, false) : json({ cargo: { ...cargo, __v: 2 },
        pago: { ...pago, estado: 'eliminado', eliminado_por: { id: 'admin-qa' }, eliminado_en: '2026-11-15' }, repetida: false }) : json(inicial));
    render(<CampaniaPagoDialog campania={actual} fila={fila} modo="historial" onClose={jest.fn()} onSaved={onSaved} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar ultimo pago' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }));
    expect(window.fetch.mock.calls.some(([, options]) => options?.method === 'DELETE')).toBe(false);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar ultimo pago' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar pago' }));
    expect(await within(screen.getByRole('alertdialog')).findByText('Error temporal')).toBeInTheDocument();
    fallar = false;
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Eliminar pago' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ pago: expect.objectContaining({ estado: 'eliminado' }) }), false));
  });

  test('ficha campania consulta pagos anteriores sin permitir corregirlos y protege cambios sin guardar', async () => {
    const previo = { ...pago, _id: 'pago0', monto_pagado: 10, referencia: 'ANTERIOR', telefono_pago: '4241234567' };
    const inicial = { ...historial([{ ...pago, monto_pagado: 20 }, previo], { __v: 2, permitir_abonos: true }),
      totales: { confirmado: 0, en_revision: 30, saldo_pendiente: 30, disponible: 0 } };
    preparar(jest.fn(), inicial);
    const onClose = jest.fn();
    render(<CampaniaPagoDialog campania={actual} fila={fila} modo="historial" onClose={onClose} onSaved={jest.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver detalle del pago ANTERIOR' }));
    expect(screen.getByRole('group', { name: 'Telefono de pago' })).toHaveTextContent('4241234567');
    expect(screen.queryByRole('button', { name: 'Editar', exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar ultimo pago' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle del pago TX-CAMPANIA' }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar', exact: true }));
    expect(screen.queryByRole('button', { name: 'Cerrar', exact: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar detalle del pago', exact: true }));
    expect(screen.getByRole('button', { name: 'Confirmar', exact: true, hidden: true })).toBeDisabled();
    expect(screen.getByRole('alertdialog', { name: 'Descartar cambios' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  test.each(['USD', 'EUR'])('ficha campania edita divisa %s y rechaza respuesta con saldo incoherente', async (moneda) => {
    const onSaved = jest.fn();
    const anterior = { ...pago, moneda, metodo_pago: 'PayPal', estado: 'confirmado' };
    const inicial = { ...historial([anterior], { moneda, saldo_pendiente: 0, estado: 'pagado', permitir_abonos: true, __v: 1 }),
      totales: { confirmado: 30, en_revision: 0, saldo_pendiente: 0, disponible: 0 } };
    window.fetch.mockImplementation(async (url, options = {}) => options.method === 'PATCH'
      ? json({ pago: { ...anterior, monto_pagado: 20 }, cargo: { ...inicial.cargo, saldo_pendiente: 30, estado: 'pendiente', __v: 2 }, repetida: false })
      : url.includes('/api/configuracion/pagos') ? json({ pagos: { adicionales: [{ tipo: 'paypal', titular: 'QA', correo: 'qa@example.com' }] } }) : json(inicial));
    render(<CampaniaPagoDialog campania={{ ...actual, moneda }} fila={fila} modo="historial" onClose={jest.fn()} onSaved={onSaved} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar', exact: true }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled());
    fireEvent.change(screen.getByRole('spinbutton', { name: `Monto pagado (${moneda})` }), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText(/No se pudo verificar la correccion/)).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    const [, options] = window.fetch.mock.calls.find(([, params]) => params?.method === 'PATCH');
    expect(options.body.get('moneda')).toBe(moneda);
    expect(options.body.get('monto_pagado_bs')).toBeNull();
    expect(screen.getByRole('spinbutton', { name: `Monto pagado (${moneda})` })).toHaveValue(20);
  });

  test('tabla de cargos abre modal conocido y refresca saldo tras pago confirmado', async () => {
    let pagado = false;
    const publicada = { ...campania(1), ...actual, estado: 'abierta', participantes: ['ana'],
      publicacion: { participantes: 1, generales: 1, personalizados: 0, no_aplica: 0, total_esperado: 30 } };
    const resumen = () => ({ campania: publicada, filas: [{ ...fila, nombres: 'Ana', apellidos: 'QA', modalidad: 'general',
      sede: { _id: 'norte', nombre: 'Norte' }, nota_interna: '', incidencias: [], permitir_abonos: false, version: pagado ? 1 : 0,
      saldo_pendiente: pagado ? 0 : 30, estado: pagado ? 'pagado' : 'pendiente' }],
    totales: { participantes: 1, generales: 1, personalizados: 0, no_aplica: 0, pendientes: 0,
      con_observaciones: 0, subtotal_calculado: 30, total_esperado: 30 } });
    window.fetch.mockImplementation(async (url, options = {}) => {
      if (options.method === 'POST') {
        pagado = true;
        return json({ cargo: { ...cargo, __v: 1, saldo_pendiente: 0, estado: 'pagado' }, pago: { ...pago,
          estado: 'confirmado', confirmado_por: { id: 'admin-qa' }, confirmado_en: '2026-11-10' }, repetida: false });
      }
      if (url.includes('/api/configuracion/pagos')) return json({ pagos: { adicionales: [{ tipo: 'zelle', titular: 'QA', correo: 'qa@example.com' }] } });
      return json(url.endsWith('/cargos') ? resumen() : historial());
    });
    render(<CampaniaResumenDialog campania={publicada} onClose={jest.fn()} />);
    const registrarPago = await screen.findByRole('button', { name: 'Pagar cargo de Ana QA' });
    expect(within(registrarPago).getByTestId('PaidIcon')).toBeInTheDocument();
    fireEvent.click(registrarPago);
    fireEvent.click(await screen.findByText('Zelle', { exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Ya pague' }));
    await waitFor(() => expect(screen.getByLabelText('Monto pagado (USD)')).toHaveValue('30.00'));
    fireEvent.change(screen.getByLabelText('Referencia'), { target: { value: 'TX-CAMPANIA' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Pago confirmado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar pago' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Pago confirmado'));
    await waitFor(() => expect(screen.getByRole('table', { name: 'Participantes del resumen' })).toHaveTextContent('Pagado'));
    expect(screen.queryByRole('button', { name: 'Pagar cargo de Ana QA' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Total a recaudar' })).toHaveTextContent(/30,00/);
  });

  test('tabla de cargos muestra en revision sin descontar saldo y luego abono confirmado', async () => {
    let enRevision = true;
    const publicada = { ...campania(1), ...actual, estado: 'abierta', participantes: ['ana'],
      publicacion: { participantes: 1, generales: 1, personalizados: 0, no_aplica: 0, total_esperado: 30 } };
    window.fetch.mockImplementation(async () => json({ campania: publicada, filas: [{ ...fila, modalidad: 'general',
      sede: { _id: 'norte', nombre: 'Norte' }, nota_interna: '', incidencias: [], pago_en_revision: enRevision,
      saldo_pendiente: enRevision ? 30 : 20, estado: enRevision ? 'pendiente' : 'abono' }],
    totales: { participantes: 1, generales: 1, personalizados: 0, no_aplica: 0, pendientes: 0,
      con_observaciones: 0, subtotal_calculado: 30, total_esperado: 30 } }));
    render(<CampaniaResumenDialog campania={publicada} onClose={jest.fn()} />);
    const tabla = await screen.findByRole('table', { name: 'Participantes del resumen' });
    let filaAtleta = within(tabla).getByRole('row', { name: /Ana QA/ });
    expect(within(filaAtleta).getByRole('cell', { name: 'En revisión', exact: true })).toBeInTheDocument();
    expect(within(filaAtleta).getByTestId('estado-cargo-ana')).toHaveStyle({ backgroundColor: '#fff6cc', color: '#b45309' });
    expect(tabla).toHaveStyle({ minWidth: '1160px' });
    expect(within(filaAtleta).getAllByRole('cell')[1]).toHaveStyle({ minWidth: '140px', overflowWrap: 'break-word' });
    expect(screen.getByRole('dialog', { name: 'Cargos de la campaña' })).toHaveStyle({ maxWidth: '1280px' });
    expect(within(filaAtleta).queryByRole('cell', { name: 'Pendiente', exact: true })).not.toBeInTheDocument();
    expect(within(filaAtleta).getAllByRole('cell')[5]).toHaveTextContent(/30,00/);
    enRevision = false;
    fireEvent.click(screen.getByRole('button', { name: 'Recalcular resumen' }));
    expect(await screen.findByRole('cell', { name: 'Abono', exact: true })).toBeInTheDocument();
    filaAtleta = screen.getByRole('row', { name: /Ana QA/ });
    expect(within(filaAtleta).getAllByRole('cell')[5]).toHaveTextContent(/20,00/);
    expect(within(filaAtleta).queryByRole('cell', { name: 'En revisión', exact: true })).not.toBeInTheDocument();
  });

  test('estado cargos filtra estado visible, combina condiciones y busqueda sin cambiar totales', async () => {
    const filas = [
      ['pendiente', false, 30, 'general'], ['abono', true, 20, 'personalizado'],
      ['abono', false, 20, 'general'], ['pagado', false, 0, 'general'], ['no_aplica', false, 0, 'no_aplica']
    ].map(([estado, pago_en_revision, saldo_pendiente, modalidad], indice) => ({ alumno: `atleta${indice}`, nombres: `Atleta ${indice}`, apellidos: 'QA',
      sede: { _id: 'norte', nombre: 'Norte' }, estado, pago_en_revision, saldo_pendiente, modalidad,
      monto: modalidad === 'no_aplica' ? 0 : 30, nota_interna: '', incidencias: [] }));
    const totales = { participantes: 5, generales: 3, personalizados: 1, no_aplica: 1, pendientes: 0,
      con_observaciones: 0, subtotal_calculado: 120, total_esperado: 120 };
    const publicada = { ...campania(1), estado: 'abierta', participantes: filas.map((item) => item.alumno), publicacion: totales };
    window.fetch.mockResolvedValue(json({ campania: publicada, filas, totales }));
    render(<CampaniaResumenDialog campania={publicada} onClose={jest.fn()} />);
    const tabla = await screen.findByRole('table', { name: 'Participantes del resumen' });
    for (const [indice, label] of ['Pendiente', 'En revisión', 'Abono', 'Pagado', 'No aplica'].entries()) {
      fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Estado' }));
      fireEvent.click(await screen.findByRole('option', { name: label, exact: true }));
      expect(within(tabla).getAllByRole('row')).toHaveLength(2);
      expect(within(tabla).getByRole('row', { name: new RegExp(`Atleta ${indice} QA`) })).toBeInTheDocument();
    }
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Estado' }));
    fireEvent.click(await screen.findByRole('option', { name: 'En revisión', exact: true }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Condición' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Personalizado', exact: true }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar atleta o sede' }), { target: { value: 'Norte' } });
    expect(within(tabla).getByRole('row', { name: /Atleta 1 QA/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Total a recaudar' })).toHaveTextContent(/120,00/);
    const progreso = screen.getByRole('region', { name: 'Avance de cobros' });
    expect(within(progreso).getByText('1 de 4 pagados (25%)')).toBeInTheDocument();
    expect(within(progreso).getByText('Faltan por pagar: 3')).toBeInTheDocument();
    expect(within(progreso).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '25');
    for (const label of ['Pagados', 'Pendientes', 'En revisión', 'Con abono']) {
      expect(within(progreso).getByRole('group', { name: label })).toHaveTextContent('1');
    }
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar atleta o sede' }), { target: { value: 'Sin coincidencia' } });
    expect(within(tabla).queryByRole('row', { name: /Atleta 1 QA/ })).not.toBeInTheDocument();
    expect(window.fetch).toHaveBeenCalledTimes(1);
  });

  test.each([0, 1])('avance cobros sin cargos exigibles (%s No aplica) conserva porcentaje cero', async (cantidad) => {
    const filas = cantidad ? [{ alumno: 'atleta0', nombres: 'Ana', apellidos: 'QA', sede: { _id: 'norte', nombre: 'Norte' },
      estado: 'no_aplica', saldo_pendiente: 0, modalidad: 'no_aplica', monto: 0, nota_interna: '', incidencias: [] }] : [];
    const totales = { participantes: cantidad, generales: 0, personalizados: 0, no_aplica: cantidad, pendientes: 0,
      con_observaciones: 0, subtotal_calculado: 0, total_esperado: 0 };
    const publicada = { ...campania(1), estado: 'abierta', participantes: filas.map((item) => item.alumno), publicacion: totales };
    window.fetch.mockResolvedValue(json({ campania: publicada, filas, totales }));
    render(<CampaniaResumenDialog campania={publicada} onClose={jest.fn()} />);
    const progreso = await screen.findByRole('region', { name: 'Avance de cobros' });
    expect(within(progreso).getByText('Sin cargos por cobrar')).toBeInTheDocument();
    expect(within(progreso).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(within(progreso).getByText('Faltan por pagar: 0')).toBeInTheDocument();
  });

  test('estado cargos vuelve a primera pagina al cambiar el filtro y permite volver a todos', async () => {
    const filas = Array.from({ length: 25 }, (_, indice) => ({ alumno: `atleta${indice}`, nombres: `Atleta ${indice}`, apellidos: 'QA',
      sede: { _id: 'norte', nombre: 'Norte' }, estado: indice < 20 ? 'pendiente' : 'pagado', saldo_pendiente: indice < 20 ? 30 : 0,
      modalidad: 'general', monto: 30, nota_interna: '', incidencias: [] }));
    const totales = { participantes: 25, generales: 25, personalizados: 0, no_aplica: 0, pendientes: 0,
      con_observaciones: 0, subtotal_calculado: 750, total_esperado: 750 };
    const publicada = { ...campania(1), estado: 'abierta', participantes: filas.map((item) => item.alumno), publicacion: totales };
    window.fetch.mockResolvedValue(json({ campania: publicada, filas, totales }));
    render(<CampaniaResumenDialog campania={publicada} onClose={jest.fn()} />);
    const tabla = await screen.findByRole('table', { name: 'Participantes del resumen' });
    fireEvent.click(screen.getByRole('button', { name: /next page|siguiente/i }));
    expect(within(tabla).getByRole('row', { name: /Atleta 10 QA/ })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Estado' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Pendiente', exact: true }));
    expect(within(tabla).getByRole('row', { name: /Atleta 0 QA/ })).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Estado' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Todos los estados', exact: true }));
    expect(screen.getByText('1-10 de 25')).toBeInTheDocument();
  });
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('token', 'qa');
  window.fetch = jest.fn().mockResolvedValue(responder([]));
  Object.defineProperty(window, 'crypto', { configurable: true,
    value: { randomUUID: jest.fn(() => '11000000-0000-4000-8000-000000000001') } });
});

afterEach(() => {
  window.fetch = originalFetch;
  if (originalCrypto) Object.defineProperty(window, 'crypto', originalCrypto);
  else delete window.crypto;
  localStorage.clear();
  jest.restoreAllMocks();
});

test('muestra estado vacio real, autentica y no solicita ni genera pagos', async () => {
  render(<CobrosAdicionales />);
  expect(await screen.findByText('Todavía no hay campañas')).toBeInTheDocument();
  expect(window.fetch).toHaveBeenCalledTimes(1);
  expect(window.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/campanias-cobro'), expect.objectContaining({
    headers: { Authorization: 'Bearer qa' }, signal: expect.any(AbortSignal), cache: 'no-store'
  }));
  expect(screen.queryByRole('button', { name: 'Actualizar' })).not.toBeInTheDocument();
  expect(screen.queryByText('Total confirmado')).not.toBeInTheDocument();
});

test.each([[true, 'Permite abonos'], [false, 'No permite abonos'], [undefined, 'Abonos: sin dato']])(
  'listado muestra abonos segun configuracion guardada: %s', async (permitirAbonos, etiqueta) => {
    window.fetch.mockResolvedValue(responder([{ ...campania(1), permitir_abonos: permitirAbonos }]));
    render(<CobrosAdicionales />);
    const tabla = await screen.findByRole('table', { name: 'Campañas de cobros adicionales' });
    expect(within(tabla).queryByRole('columnheader', { name: 'Abonos' })).not.toBeInTheDocument();
    const encabezados = within(tabla).getAllByRole('columnheader');
    const indiceMonto = encabezados.findIndex((encabezado) => encabezado.textContent === 'Monto general');
    const fila = within(tabla).getByRole('row', { name: /Viaje 1/ });
    expect(within(fila).getAllByRole('cell')[indiceMonto]).toHaveTextContent(etiqueta);
    expect(window.fetch).toHaveBeenCalledTimes(1);
  }
);

test('eliminar campana pide confirmacion con cancelar enfocado y cancelar no envia solicitudes', async () => {
  window.fetch.mockResolvedValue(responder([campania(1)]));
  render(<CobrosAdicionales />);
  fireEvent.click(await screen.findByRole('button', { name: 'Eliminar Viaje 1' }));
  const dialogo = screen.getByRole('alertdialog', { name: 'Eliminar campaña' });
  expect(within(dialogo).getByText('Viaje 1')).toBeInTheDocument();
  expect(dialogo).toHaveAccessibleDescription(/Esta acción es permanente/);
  await waitFor(() => expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toHaveFocus());
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  expect(window.fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Viaje 1')).toBeInTheDocument();
});

test('eliminar campana confirma una vez, bloquea cierre y actualiza solo la fila eliminada', async () => {
  let resolver;
  window.fetch.mockImplementation((url, options = {}) => options.method === 'DELETE'
    ? new Promise((resolve) => { resolver = resolve; }) : Promise.resolve(responder([campania(1), campania(2)])));
  render(<CobrosAdicionales />);
  fireEvent.click(await screen.findByRole('button', { name: 'Eliminar Viaje 1' }));
  const dialogo = screen.getByRole('alertdialog', { name: 'Eliminar campaña' });
  const confirmar = within(dialogo).getByRole('button', { name: 'Eliminar campaña' });
  fireEvent.click(confirmar);
  fireEvent.click(confirmar);
  expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  expect(within(dialogo).getByRole('button', { name: 'Cerrar confirmación de eliminación' })).toBeDisabled();
  fireEvent.keyDown(dialogo, { key: 'Escape', code: 'Escape' });
  expect(dialogo).toBeInTheDocument();
  const eliminaciones = window.fetch.mock.calls.filter(([, options]) => options?.method === 'DELETE');
  expect(eliminaciones).toHaveLength(1);
  expect(eliminaciones[0]).toEqual([expect.stringContaining('/api/campanias-cobro/1'), expect.objectContaining({
    method: 'DELETE', headers: { Authorization: 'Bearer qa', 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: 0 }), cache: 'no-store', signal: expect.any(AbortSignal)
  })]);
  await act(async () => resolver({ ok: true, json: async () => ({ eliminada: '1' }) }));
  expect(await screen.findByText('Campaña eliminada')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
  const tabla = screen.getByRole('table', { name: 'Campañas de cobros adicionales' });
  expect(within(tabla).queryByText('Viaje 1')).not.toBeInTheDocument();
  expect(within(tabla).getByText('Viaje 2')).toBeInTheDocument();
});

test.each([
  [false, { error: 'Otro administrador cambió la campaña.' }, 'Otro administrador cambió la campaña.'],
  [true, { eliminada: 'otra' }, 'No se pudo verificar la eliminación.']
])('eliminar campana conserva la fila ante error o respuesta inconsistente: %s', async (ok, respuesta, mensaje) => {
  window.fetch.mockImplementation(async (url, options = {}) => options.method === 'DELETE'
    ? { ok, json: async () => respuesta } : responder([campania(1)]));
  render(<CobrosAdicionales />);
  fireEvent.click(await screen.findByRole('button', { name: 'Eliminar Viaje 1' }));
  const dialogo = screen.getByRole('alertdialog', { name: 'Eliminar campaña' });
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar campaña' }));
  expect(await within(dialogo).findByRole('alert')).toHaveTextContent(mensaje);
  expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toBeEnabled();
  expect(within(screen.getByRole('table', { hidden: true })).getByText('Viaje 1')).toBeInTheDocument();
  expect(screen.queryByText('Campaña eliminada')).not.toBeInTheDocument();
});

test('eliminar campana solo se ofrece para borradores con version disponible', async () => {
  window.fetch.mockResolvedValue(responder([campania(1), { ...campania(2), estado: 'abierta' },
    { ...campania(3), estado: 'cerrada' }, { ...campania(4), estado: 'cancelada' }, { ...campania(5), __v: undefined }]));
  render(<CobrosAdicionales />);
  expect(await screen.findByRole('button', { name: 'Eliminar Viaje 1' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Eliminar Viaje 2' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Eliminar Viaje 3' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Eliminar Viaje 4' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Eliminar Viaje 5' })).toBeDisabled();
});

test('resumen consulta el borrador guardado y no permite publicar ni generar cargos', async () => {
  const borrador = { ...campania(1), participantes: ['atleta-1'] };
  window.fetch.mockImplementation(async (url) => url.endsWith('/resumen') ? { ok: true, json: async () => ({ campania: borrador,
    totales: { participantes: 1, generales: 1, personalizados: 0, no_aplica: 0, pendientes: 0, con_observaciones: 0, subtotal_calculado: 30, total_esperado: 30 },
    filas: [{ alumno: 'atleta-1', nombres: 'Ana', apellidos: 'QA', sede: borrador.sedes[0], modalidad: 'general', monto: 30, nota_interna: '', incidencias: [] }] }) }
    : responder([borrador]));
  render(<CobrosAdicionales />);
  fireEvent.click(await screen.findByRole('button', { name: 'Resumen de Viaje 1' }));
  const dialogo = await screen.findByRole('dialog', { name: 'Resumen previo a publicar' });
  expect(await within(dialogo).findByText('Ana QA')).toBeInTheDocument();
  expect(within(dialogo).getByRole('group', { name: 'Total a recaudar' })).toHaveTextContent(/USD.*30,00/);
  expect(within(dialogo).queryByRole('button', { name: /^Publicar/ })).not.toBeInTheDocument();
  expect(window.fetch).toHaveBeenCalledWith(expect.stringContaining('/1/resumen'), expect.objectContaining({
    headers: { Authorization: 'Bearer qa' }, cache: 'no-store', signal: expect.any(AbortSignal)
  }));
  expect(window.fetch.mock.calls.every(([, options]) => !options?.method || options.method === 'GET')).toBe(true);
});

test('volver a entrar consulta de nuevo y muestra los datos recientes', async () => {
  window.fetch.mockResolvedValueOnce(responder([campania(1)]))
    .mockResolvedValueOnce(responder([campania(2)]));
  const { unmount } = render(<CobrosAdicionales />);
  expect(await screen.findByText('Viaje 1')).toBeInTheDocument();
  unmount();
  render(<CobrosAdicionales />);
  expect(await screen.findByText('Viaje 2')).toBeInTheDocument();
  expect(screen.queryByText('Viaje 1')).not.toBeInTheDocument();
  expect(window.fetch).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole('button', { name: 'Actualizar' })).not.toBeInTheDocument();
});

test('error de servidor permite reintentar sin confundirlo con una lista vacia', async () => {
  window.fetch.mockResolvedValueOnce({ ok: false, status: 500 });
  render(<CobrosAdicionales />);
  expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar');
  expect(screen.queryByText('Todavía no hay campañas')).not.toBeInTheDocument();
  userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByText('Todavía no hay campañas')).toBeInTheDocument();
});

test('busqueda sin acentos y paginacion filtran antes de mostrar filas', async () => {
  const campanias = Array.from({ length: 12 }, (_, indice) => campania(indice + 1));
  campanias[0].nombre = 'Reinscripcion especial';
  window.fetch.mockResolvedValue(responder(campanias));
  render(<CobrosAdicionales />);
  expect(await screen.findByText('Reinscripcion especial')).toBeInTheDocument();
  expect(screen.queryByText('Viaje 11')).not.toBeInTheDocument();
  userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
  expect(screen.getByText('Viaje 11')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Buscar campaña'), { target: { value: 'REINSCRIPCIÓN' } });
  expect(screen.getByText('Reinscripcion especial')).toBeInTheDocument();
  expect(screen.getByText('1 campaña')).toBeInTheDocument();
  expect(screen.queryByText('Viaje 11')).not.toBeInTheDocument();
});

test('estado y sede no se mezclan entre resultados', async () => {
  const abierta = { ...campania(2), estado: 'abierta', sedes: [{ _id: 'sur', nombre: 'Sur' }] };
  window.fetch.mockResolvedValue(responder([campania(1), abierta]));
  render(<CobrosAdicionales />);
  await screen.findByText('Viaje 1');
  userEvent.click(screen.getByRole('combobox', { name: 'Estado' }));
  userEvent.click(screen.getByRole('option', { name: 'Abierta' }));
  expect(screen.queryByText('Viaje 1')).not.toBeInTheDocument();
  expect(screen.getByText('Viaje 2')).toBeInTheDocument();
  userEvent.click(screen.getByRole('combobox', { name: 'Sede' }));
  userEvent.click(screen.getByRole('option', { name: 'Norte' }));
  expect(screen.getByText('No hay campañas que coincidan con los filtros.')).toBeInTheDocument();
});

test('rechaza respuestas financieras invalidas y cancela la consulta al salir', async () => {
  window.fetch.mockResolvedValue(responder([{ ...campania(1), monto_general: 'invalido' }]));
  const { unmount } = render(<CobrosAdicionales />);
  expect(await screen.findByRole('alert')).toHaveTextContent('no es válida');
  const signal = window.fetch.mock.calls[0][1].signal;
  unmount();
  expect(signal.aborted).toBe(true);
});

test.each(['usuario', 'asistente', 'entrenador'])('la ruta no concede acceso a %s mediante otros permisos', async (rol) => {
  localStorage.setItem('rolActivo', rol);
  localStorage.setItem('permisos', JSON.stringify(['conciliacion.manage']));
  render(<MemoryRouter><ProtectedRoute allowedRoles={['admin', 'super_admin']}><CobrosAdicionales /></ProtectedRoute></MemoryRouter>);
  await waitFor(() => expect(window.fetch).not.toHaveBeenCalled());
  expect(screen.queryByRole('heading', { name: 'Cobros adicionales' })).not.toBeInTheDocument();
});

describe('formulario de borrador', () => {
  const opciones = { moneda: 'USD', sedes: [{ _id: 'norte', nombre: 'Norte' }, { _id: 'sur', nombre: 'Sur' }] };
  let guardadas;
  let peticiones;
  beforeEach(() => {
    guardadas = [];
    peticiones = [];
    window.fetch.mockImplementation(async (url, options = {}) => {
      if (url.endsWith('/opciones')) return { ok: true, json: async () => opciones };
      if (options.method) {
        const body = JSON.parse(options.body);
        peticiones.push({ method: options.method, body });
        const registro = { ...campania(1), ...body, monto_general: body.modalidad_monto === 'por_sede' ? null : Number(body.monto_general),
          montos_por_sede: (body.montos_por_sede || []).map((item) => ({ ...item, monto: Number(item.monto) })),
          sedes: opciones.sedes.filter((sede) => body.sedes.includes(sede._id)), __v: options.method === 'PATCH' ? 1 : 0 };
        guardadas = [registro];
        return { ok: true, json: async () => ({ campania: registro }) };
      }
      return responder(guardadas);
    });
  });
  const abrir = async () => {
    render(<CobrosAdicionales />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Crear campaña' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Crear campaña' }));
    await waitFor(() => expect(screen.getByLabelText('Moneda de la academia')).toHaveTextContent('USD'));
  };
  const completar = async () => {
    fireEvent.change(screen.getByRole('textbox', { name: /^Nombre/ }), { target: { value: 'Viaje nuevo' } });
    fireEvent.change(screen.getByRole('textbox', { name: /^Monto general/ }), { target: { value: '30,50' } });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /^Sedes participantes/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Norte' }));
    fireEvent.keyDown(screen.getByRole('combobox', { name: /^Sedes participantes/ }), { key: 'Escape' });
  };
  const alternarSur = async () => {
    fireEvent.mouseDown(screen.getByRole('combobox', { name: /^Sedes participantes/ }));
    fireEvent.click(await screen.findByRole('option', { name: 'Sur' }));
    fireEvent.keyDown(screen.getByRole('combobox', { name: /^Sedes participantes/ }), { key: 'Escape' });
  };

  const prepararFlujo = () => {
    let actual = null;
    let fallo = null;
    const atletas = ['Ana', 'Bruno'].map((nombre) => ({ _id: nombre.toLowerCase(), nombres: nombre, apellidos: 'QA',
      disponible: true, sede: opciones.sedes[0], categoria: 'Infantil' }));
    window.fetch.mockImplementation(async (url, options = {}) => {
      if (url.endsWith('/opciones')) return { ok: true, json: async () => opciones };
      const body = options.body ? JSON.parse(options.body) : null;
      if (body) peticiones.push({ method: options.method, body });
      if (fallo?.metodo === (options.method || 'GET')) {
        const respuesta = fallo;
        fallo = null;
        return { ok: respuesta.ok, status: 409, json: async () => respuesta.data };
      }
      if (options.method === 'POST' || options.method === 'PATCH') {
        actual = { ...campania(1), ...actual, ...body, monto_general: Number(body.monto_general),
          sedes: opciones.sedes.filter((item) => body.sedes.includes(item._id)),
          participantes: actual?.participantes || ['ana', 'bruno'], condiciones_participantes: actual?.condiciones_participantes || [],
          __v: options.method === 'POST' ? 0 : actual.__v + 1 };
      } else if (options.method === 'PUT') {
        actual = { ...actual, participantes: body.participantes, __v: actual.__v + 1,
          condiciones_participantes: body.condiciones_participantes
            || actual.condiciones_participantes.filter((item) => body.participantes.includes(item.alumno)) };
      }
      if (options.method) return { ok: true, json: async () => ({ campania: actual }) };
      if (url.endsWith('/participantes')) return { ok: true, json: async () => ({ campania: actual, atletas }) };
      if (url.endsWith('/resumen')) {
        const filas = actual.participantes.map((alumno) => {
          const atleta = atletas.find((item) => item._id === alumno);
          const condicion = actual.condiciones_participantes.find((item) => item.alumno === alumno);
          return { alumno, nombres: atleta.nombres, apellidos: atleta.apellidos, sede: atleta.sede,
            modalidad: condicion?.modalidad || 'general', nota_interna: condicion?.nota_interna || '', incidencias: [],
            monto: condicion?.modalidad === 'no_aplica' ? 0 : condicion?.monto ?? actual.monto_general };
        });
        const total = filas.reduce((suma, fila) => suma + Math.round(fila.monto * 100), 0) / 100;
        return { ok: true, json: async () => ({ campania: actual, filas, totales: { participantes: filas.length,
          generales: filas.filter((fila) => fila.modalidad === 'general').length,
          personalizados: filas.filter((fila) => fila.modalidad === 'personalizado').length,
          no_aplica: filas.filter((fila) => fila.modalidad === 'no_aplica').length, pendientes: 0, con_observaciones: 0,
          subtotal_calculado: total, total_esperado: total } }) };
      }
      return responder(actual ? [actual] : []);
    });
    return { actual: () => actual, fallar: (metodo, data = { error: 'Conflicto QA. Intenta nuevamente.' }, ok = false) => { fallo = { metodo, data, ok }; } };
  };
  const avanzarAParticipantes = async () => {
    await abrir();
    await completar();
    const dialogo = screen.getByRole('dialog', { name: 'Crear campaña', exact: true });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('checkbox', { name: 'Seleccionar Ana QA' })).toBeChecked();
    return dialogo;
  };

  test('creacion guiada avanza con seleccion automatica sin escribir otra vez y termina como borrador', async () => {
    const flujo = prepararFlujo();
    await avanzarAParticipantes();
    expect(within(screen.getByRole('list', { name: 'Pasos de creación' })).getAllByRole('listitem')[1]).toHaveAttribute('aria-current', 'step');
    fireEvent.click(screen.getByRole('button', { name: 'Ver resumen' }));
    expect(await screen.findByRole('group', { name: 'Total a recaudar' })).toHaveTextContent(/USD.*61,00/);
    expect(screen.queryByRole('button', { name: /^Publicar/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('status', { name: 'Confirmación de guardado' })).toHaveTextContent('Borrador guardado');
    expect(peticiones.map((item) => item.method)).toEqual(['POST']);
    expect(flujo.actual().estado).toBe('borrador');
  });

  test('creacion guiada guarda personalizados y No aplica antes de consultar el resumen', async () => {
    const flujo = prepararFlujo();
    await avanzarAParticipantes();
    fireEvent.click(screen.getByRole('button', { name: 'Condiciones de Ana QA' }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Condición de Ana QA' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Monto personalizado' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Monto de Ana QA' }), { target: { value: '12,50' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Nota interna de Ana QA' }), { target: { value: ' Acuerdo QA ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Condiciones de Bruno QA' }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Condición de Bruno QA' }));
    fireEvent.click(await screen.findByRole('option', { name: 'No aplica', exact: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver resumen' }));
    expect(await screen.findByRole('group', { name: 'Total a recaudar' })).toHaveTextContent(/USD.*12,50/);
    expect(screen.getByText('Acuerdo QA')).toBeInTheDocument();
    expect(flujo.actual().__v).toBe(1);
    expect(peticiones[1]).toEqual({ method: 'PUT', body: { participantes: ['ana', 'bruno'], version: 0,
      condiciones_participantes: [{ alumno: 'ana', modalidad: 'personalizado', monto: 12.5, nota_interna: 'Acuerdo QA' },
        { alumno: 'bruno', modalidad: 'no_aplica', nota_interna: '' }] } });
    expect(window.fetch.mock.calls.map(([url, options]) => options?.method || url.split('/').pop()).slice(-2)).toEqual(['PUT', 'resumen']);
  });

  test('creacion guiada permite guardar borrador en participantes y reabrir fuera del flujo', async () => {
    prepararFlujo();
    await avanzarAParticipantes();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar Bruno QA' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect(await screen.findByText('Borrador guardado')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(window.fetch.mock.calls.some(([url]) => url.endsWith('/resumen'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar participantes de Viaje nuevo' }));
    expect(await screen.findByRole('checkbox', { name: 'Seleccionar Bruno QA' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Guardar selección' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Ver resumen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Pasos de creación' })).not.toBeInTheDocument();
  });

  test('creacion guiada vuelve a datos conservando seleccion y usa versiones actuales sin otro POST', async () => {
    const flujo = prepararFlujo();
    const dialogo = await avanzarAParticipantes();
    expect(screen.getByRole('dialog', { name: 'Participantes', exact: true })).toBe(dialogo);
    fireEvent.click(screen.getByRole('button', { name: 'Ver resumen' }));
    await screen.findByRole('group', { name: 'Total a recaudar' });
    expect(screen.getByRole('dialog', { name: 'Resumen previo a publicar' })).toBe(dialogo);
    fireEvent.click(screen.getByRole('button', { name: 'Volver a participantes' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Seleccionar Ana QA' }));
    expect(screen.getByRole('dialog', { name: 'Participantes', exact: true })).toBe(dialogo);
    fireEvent.click(screen.getByRole('button', { name: 'Volver a datos' }));
    expect(await screen.findByRole('textbox', { name: /^Nombre/ })).toHaveValue('Viaje nuevo');
    expect(screen.getByRole('dialog', { name: 'Crear campaña', exact: true })).toBe(dialogo);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continuar' })).toBeEnabled());
    fireEvent.change(screen.getByRole('textbox', { name: /^Monto general/ }), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('checkbox', { name: 'Seleccionar Ana QA' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Ver resumen' }));
    expect(await screen.findByRole('group', { name: 'Total a recaudar' })).toHaveTextContent(/USD.*40,00/);
    expect(peticiones.map((item) => item.method)).toEqual(['POST', 'PUT', 'PATCH']);
    expect(peticiones[2].body.version).toBe(1);
    expect(flujo.actual().__v).toBe(2);
    expect(flujo.actual().participantes).toEqual(['bruno']);
  });

  test('creacion guiada Escape delega al paso actual y confirma descartar cambios sin borrar el borrador', async () => {
    const flujo = prepararFlujo();
    const dialogo = await avanzarAParticipantes();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar Bruno QA' }));
    fireEvent.keyDown(dialogo, { key: 'Escape', code: 'Escape' });
    const confirmacion = await screen.findByRole('dialog', { name: 'Descartar selección sin guardar' });
    fireEvent.click(within(confirmacion).getByRole('button', { name: 'Seguir seleccionando' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Descartar selección sin guardar' })).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Participantes', exact: true })).toBe(dialogo);
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Bruno QA' })).not.toBeChecked();
    fireEvent.keyDown(dialogo, { key: 'Escape', code: 'Escape' });
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Descartar selección sin guardar' })).getByRole('button', { name: 'Descartar cambios' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(flujo.actual().participantes).toEqual(['ana', 'bruno']);
    expect(peticiones.map((item) => item.method)).toEqual(['POST']);
  });

  test('creacion guiada error de creacion mantiene datos y reintenta con la misma solicitud', async () => {
    const flujo = prepararFlujo();
    await abrir();
    await completar();
    flujo.fallar('POST');
    const continuar = screen.getByRole('button', { name: 'Continuar' });
    fireEvent.click(continuar);
    fireEvent.click(continuar);
    expect(await screen.findByRole('alert')).toHaveTextContent('Conflicto QA');
    expect(screen.getByRole('textbox', { name: /^Nombre/ })).toHaveValue('Viaje nuevo');
    expect(peticiones).toHaveLength(1);
    expect(window.fetch.mock.calls.some(([url]) => url.endsWith('/participantes'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await screen.findByRole('checkbox', { name: 'Seleccionar Ana QA' });
    expect(peticiones[0].body.solicitud_id).toBe(peticiones[1].body.solicitud_id);
  });

  test('creacion guiada error de seleccion no abre resumen ni pierde cambios y permite reintentar', async () => {
    const flujo = prepararFlujo();
    await avanzarAParticipantes();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar Bruno QA' }));
    flujo.fallar('PUT');
    fireEvent.click(screen.getByRole('button', { name: 'Ver resumen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Conflicto QA');
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Bruno QA' })).not.toBeChecked();
    expect(window.fetch.mock.calls.some(([url]) => url.endsWith('/resumen'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Ver resumen' }));
    expect(await screen.findByRole('group', { name: 'Total a recaudar' })).toHaveTextContent(/USD.*30,50/);
    expect(peticiones.filter((item) => item.method === 'PUT').map((item) => item.body.version)).toEqual([0, 0]);
  });

  test('creacion guiada respuesta de guardado no verificable impide avanzar', async () => {
    const flujo = prepararFlujo();
    await avanzarAParticipantes();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar Bruno QA' }));
    flujo.fallar('PUT', { campania: flujo.actual() }, true);
    fireEvent.click(screen.getByRole('button', { name: 'Ver resumen' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo verificar el guardado');
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Bruno QA' })).not.toBeChecked();
    expect(window.fetch.mock.calls.some(([url]) => url.endsWith('/resumen'))).toBe(false);
  });

  test('creacion guiada error al cargar participantes bloquea avance y reintenta sin crear otra campana', async () => {
    const flujo = prepararFlujo();
    await abrir();
    await completar();
    flujo.fallar('GET');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Conflicto QA');
    expect(screen.getByRole('button', { name: 'Ver resumen' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Guardar borrador' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByRole('checkbox', { name: 'Seleccionar Ana QA' });
    expect(peticiones.map((item) => item.method)).toEqual(['POST']);
  });

  test('creacion guiada permite revisar una seleccion vacia sin generar importes ni publicar', async () => {
    prepararFlujo();
    await avanzarAParticipantes();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar página actual' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver resumen' }));
    expect(await screen.findByRole('group', { name: 'Total a recaudar' })).toHaveTextContent(/USD.*0,00/);
    expect(screen.getByRole('group', { name: 'Participantes' })).toHaveTextContent('0');
    expect(peticiones[1].body.participantes).toEqual([]);
    expect(peticiones.map((item) => item.method)).toEqual(['POST', 'PUT']);
  });

  test('crea borrador sin publicar, usa moneda configurada y lo muestra en el listado', async () => {
    await abrir();
    await completar();
    const abonos = screen.getByRole('switch', { name: 'Permitir abonos individuales' });
    expect(abonos).not.toBeChecked();
    fireEvent.click(abonos);
    expect(abonos).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect(await screen.findByText('Campaña creada')).toBeInTheDocument();
    expect(screen.getAllByText('Viaje nuevo')).toHaveLength(2);
    expect(peticiones).toEqual([{ method: 'POST', body: expect.objectContaining({ nombre: 'Viaje nuevo', monto_general: '30.50',
      moneda: 'USD', sedes: ['norte'], permitir_abonos: true, solicitud_id: '11000000-0000-4000-8000-000000000001' }) }]);
    expect(peticiones[0].body.estado).toBeUndefined();
  });

  test('la notificacion puede cerrarse sin quitar la campana del listado', async () => {
    await abrir();
    await completar();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect(await screen.findByRole('status', { name: 'Confirmación de guardado' })).toHaveTextContent('Viaje nuevo');
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar notificación' }));
    expect(screen.queryByRole('status', { name: 'Confirmación de guardado' })).not.toBeInTheDocument();
    expect(screen.getByText('Viaje nuevo')).toBeInTheDocument();
    expect(peticiones).toHaveLength(1);
  });

  test('la notificacion se cierra automaticamente a los seis segundos', async () => {
    await abrir();
    await completar();
    jest.useFakeTimers();
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
      expect(await screen.findByRole('status', { name: 'Confirmación de guardado' })).toHaveTextContent('Campaña creada');
      act(() => jest.advanceTimersByTime(6000));
      expect(screen.queryByRole('status', { name: 'Confirmación de guardado' })).not.toBeInTheDocument();
      expect(peticiones).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test('organiza el formulario por decisiones y permite cerrar sin cambios', async () => {
    await abrir();
    expect(screen.getAllByRole('heading', { level: 3 }).map((titulo) => titulo.textContent))
      .toEqual(['Datos de la campaña', 'Sedes e importes', 'Condiciones de pago']);
    expect(screen.getByRole('region', { name: 'Sedes e importes' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^Nombre/ })).toHaveAttribute('type', 'text');
    expect(screen.getByRole('textbox', { name: 'Descripción pública' })).toHaveAttribute('type', 'text');
    expect(screen.queryByRole('textbox', { name: 'Moneda de la academia' })).not.toBeInTheDocument();
    expect(screen.getByText('Borrador', { exact: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar formulario' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Crear campaña' })).not.toBeInTheDocument());
    expect(peticiones).toHaveLength(0);
  });

  test('valida campos requeridos antes de enviar y enfoca el primer error', async () => {
    await abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect(await screen.findByText('Indica un nombre de hasta 150 caracteres.')).toBeInTheDocument();
    expect(screen.getByText('Selecciona al menos una sede disponible.')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('textbox', { name: /^Nombre/ })).toHaveFocus());
    expect(peticiones).toHaveLength(0);
  });

  test('cancelar con cambios pide confirmacion y conserva el formulario al seguir editando', async () => {
    await abrir();
    await completar();
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByRole('dialog', { name: 'Descartar cambios' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Descartar cambios' })).not.toBeInTheDocument());
    expect(screen.getByRole('textbox', { name: /^Nombre/ })).toHaveValue('Viaje nuevo');
    expect(peticiones).toHaveLength(0);
  });

  test('edita el borrador y envia su version sin crear otra campana', async () => {
    guardadas = [campania(1)];
    render(<CobrosAdicionales />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Viaje 1' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar borrador' })).toBeEnabled());
    fireEvent.change(screen.getByRole('textbox', { name: /^Nombre/ }), { target: { value: 'Viaje editado' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument();
    expect(peticiones[0]).toMatchObject({ method: 'PATCH', body: { nombre: 'Viaje editado', version: 0 } });
    expect(peticiones[0].body.solicitud_id).toBeUndefined();
  });

  test('bloquea doble envio y conserva datos y clave al reintentar tras un error', async () => {
    const original = window.fetch.getMockImplementation();
    let primera = true;
    let finalizar;
    const pendiente = new Promise((resolve) => { finalizar = resolve; });
    window.fetch.mockImplementation((url, options = {}) => {
      if (options.method && primera) {
        primera = false;
        return pendiente;
      }
      return original(url, options);
    });
    await abrir();
    await completar();
    fireEvent.submit(screen.getByRole('form', { name: 'Datos del borrador' }));
    fireEvent.submit(screen.getByRole('form', { name: 'Datos del borrador' }));
    expect(window.fetch.mock.calls.filter((call) => call[1]?.method)).toHaveLength(1);
    await act(async () => finalizar({ ok: false, json: async () => ({ error: 'Error temporal de guardado' }) }));
    expect(await screen.findByText('Error temporal de guardado')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /^Nombre/ })).toHaveValue('Viaje nuevo');
    expect(screen.getByRole('textbox', { name: /^Monto general/ })).toHaveValue('30,50');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect(await screen.findByText('Campaña creada')).toBeInTheDocument();
    const escrituras = window.fetch.mock.calls.filter((call) => call[1]?.method).map((call) => JSON.parse(call[1].body));
    expect(escrituras).toHaveLength(2);
    expect(escrituras[0].solicitud_id).toBe(escrituras[1].solicitud_id);
  });

  test('un fallo al cargar opciones impide guardar y permite recuperarlas', async () => {
    const original = window.fetch.getMockImplementation();
    let fallar = true;
    window.fetch.mockImplementation((url, options) => url.endsWith('/opciones') && fallar
      ? Promise.resolve({ ok: false }) : original(url, options));
    render(<CobrosAdicionales />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Crear campaña' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Crear campaña' }));
    expect(await screen.findByText('No se pudieron cargar las sedes y la moneda de la academia.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar borrador' })).toBeDisabled();
    fallar = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar borrador' })).toBeEnabled());
    expect(peticiones).toHaveLength(0);
  });

  test('guarda dos montos por sede, los muestra y permite reabrirlos para editar', async () => {
    await abrir();
    await completar();
    fireEvent.click(screen.getByRole('button', { name: 'Monto por sede', exact: true }));
    await alternarSur();
    fireEvent.change(screen.getByRole('textbox', { name: /^Monto de Norte/ }), { target: { value: '30,50' } });
    fireEvent.change(screen.getByRole('textbox', { name: /^Monto de Sur/ }), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect(await screen.findByText('Campaña creada')).toBeInTheDocument();
    expect(screen.getByText(/Norte:.*30,50/)).toBeInTheDocument();
    expect(screen.getByText(/Sur:.*25,00/)).toBeInTheDocument();
    expect(peticiones[0].body).toMatchObject({ modalidad_monto: 'por_sede', monto_general: null,
      montos_por_sede: [{ sede: 'norte', monto: '30.50' }, { sede: 'sur', monto: '25' }] });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Crear campaña' })).not.toBeInTheDocument());
    fireEvent.click(await screen.findByRole('button', { name: 'Editar Viaje nuevo' }));
    expect(await screen.findByRole('textbox', { name: /^Monto de Norte/ })).toHaveValue('30.5');
    expect(screen.getByRole('textbox', { name: /^Monto de Sur/ })).toHaveValue('25');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Guardar borrador' })).toBeEnabled());
    fireEvent.change(screen.getByRole('textbox', { name: /^Monto de Norte/ }), { target: { value: '32' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument();
    expect(peticiones[1]).toMatchObject({ method: 'PATCH', body: { version: 0, modalidad_monto: 'por_sede',
      monto_general: null, montos_por_sede: [{ sede: 'norte', monto: '32' }, { sede: 'sur', monto: '25' }] } });
  });

  test('no copia el monto unico ni guarda si falta el importe de una sede', async () => {
    await abrir();
    await completar();
    fireEvent.click(screen.getByRole('button', { name: 'Monto por sede', exact: true }));
    expect(screen.getByRole('textbox', { name: /^Monto de Norte/ })).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect(await screen.findByText('Indica un monto mayor que cero, con hasta dos decimales.')).toBeInTheDocument();
    expect(peticiones).toHaveLength(0);
  });

  test('volver a monto unico conserva el valor y no envia importes por sede ocultos', async () => {
    await abrir();
    await completar();
    fireEvent.click(screen.getByRole('button', { name: 'Monto por sede', exact: true }));
    fireEvent.change(screen.getByRole('textbox', { name: /^Monto de Norte/ }), { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Monto único', exact: true }));
    expect(screen.getByRole('textbox', { name: /^Monto general/ })).toHaveValue('30,50');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect(await screen.findByText('Campaña creada')).toBeInTheDocument();
    expect(peticiones[0].body).toMatchObject({ modalidad_monto: 'unico', monto_general: '30.50', montos_por_sede: [] });
  });

  test('quitar una sede excluye su importe del guardado', async () => {
    await abrir();
    await completar();
    fireEvent.click(screen.getByRole('button', { name: 'Monto por sede', exact: true }));
    await alternarSur();
    fireEvent.change(screen.getByRole('textbox', { name: /^Monto de Norte/ }), { target: { value: '30' } });
    fireEvent.change(screen.getByRole('textbox', { name: /^Monto de Sur/ }), { target: { value: '25' } });
    await alternarSur();
    expect(screen.queryByRole('textbox', { name: /^Monto de Sur/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }));
    expect(await screen.findByText('Campaña creada')).toBeInTheDocument();
    expect(peticiones[0].body).toMatchObject({ sedes: ['norte'], montos_por_sede: [{ sede: 'norte', monto: '30' }] });
  });
});

describe('resumen previo', () => {
  let data;
  beforeEach(() => {
    data = { campania: { ...campania(1), participantes: ['atleta-1', 'atleta-2', 'atleta-3'], __v: 6 },
      totales: { participantes: 3, generales: 1, personalizados: 1, no_aplica: 1, pendientes: 0, con_observaciones: 0,
        subtotal_calculado: 42.5, total_esperado: 42.5 },
      filas: [
        { alumno: 'atleta-1', nombres: 'Ana', apellidos: 'QA', sede: { _id: 'norte', nombre: 'Norte' }, modalidad: 'general', monto: 30, nota_interna: '', incidencias: [] },
        { alumno: 'atleta-2', nombres: 'Maria', apellidos: 'QA', sede: { _id: 'norte', nombre: 'Norte' }, modalidad: 'personalizado', monto: 12.5, nota_interna: 'Acuerdo privado', incidencias: [] },
        { alumno: 'atleta-3', nombres: 'Sofia', apellidos: 'QA', sede: { _id: 'norte', nombre: 'Norte' }, modalidad: 'no_aplica', monto: 0, nota_interna: 'Exonerada', incidencias: [] }
      ] };
    window.fetch.mockImplementation(async () => ({ ok: true, json: async () => data }));
  });
  const abrir = async () => {
    const onClose = jest.fn();
    const onRevisar = jest.fn();
    const view = render(<CampaniaResumenDialog campania={campania(1)} onClose={onClose} onRevisar={onRevisar} />);
    await screen.findByRole('group', { name: 'Total a recaudar' });
    return { ...view, onClose, onRevisar };
  };
  test('resumen previo muestra excepciones y notas y filtra sin alterar el total global', async () => {
    await abrir();
    expect(screen.getByRole('group', { name: 'Participantes' })).toHaveTextContent('3');
    expect(screen.queryByRole('group', { name: 'Con tarifa de campaña' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: 'Total a recaudar' })).toHaveLength(1);
    expect(screen.getByRole('group', { name: 'Total a recaudar' })).toHaveTextContent(/USD.*42,50/);
    expect(screen.getByRole('group', { name: 'Total a recaudar' })).not.toHaveTextContent('atleta');
    expect(screen.queryByRole('group', { name: 'Monto de campaña' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'No aplica' })).toHaveTextContent('1');
    expect(screen.getByText('Acuerdo privado')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Condición' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Personalizado', exact: true }));
    const tabla = screen.getByRole('table', { name: 'Participantes del resumen' });
    expect(within(tabla).getByText('Maria QA')).toBeInTheDocument();
    expect(within(tabla).queryByText('Ana QA')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Total a recaudar' })).toHaveTextContent(/USD.*42,50/);
    expect(window.fetch).toHaveBeenCalledTimes(1);
  });
  test('resumen previo muestra importe faltante y subtotal sin presentar cero como total esperado', async () => {
    data.filas[0].monto = null;
    data.filas[0].incidencias = ['Sede sin tarifa.'];
    data.totales = { ...data.totales, pendientes: 1, con_observaciones: 1, subtotal_calculado: 12.5, total_esperado: null };
    await abrir();
    expect(screen.getByRole('group', { name: 'Total a recaudar' })).toHaveTextContent('Pendiente de revisar');
    expect(screen.getByRole('group', { name: 'Total a recaudar' })).toHaveTextContent(/Subtotal calculable: USD.*12,50/);
    expect(screen.getByRole('alert')).toHaveTextContent('1 con importe pendiente');
    expect(screen.getByText('Sede sin tarifa.')).toBeInTheDocument();
    expect(screen.getByText('Por revisar')).toBeInTheDocument();
  });
  test('resumen previo usa todos los participantes para total aunque pagine o busque', async () => {
    data.filas = Array.from({ length: 12 }, (_, indice) => ({ ...data.filas[0], alumno: `atleta-${indice + 1}`, nombres: `Ana ${indice + 1}` }));
    data.campania.participantes = data.filas.map((fila) => fila.alumno);
    data.totales = { participantes: 12, generales: 12, personalizados: 0, no_aplica: 0, pendientes: 0, con_observaciones: 0, subtotal_calculado: 360, total_esperado: 360 };
    await abrir();
    expect(screen.queryByText('Ana 11 QA')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText('Ana 11 QA')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar atleta o sede' }), { target: { value: 'Ana 1 QA' } });
    expect(screen.getByText('Ana 1 QA')).toBeInTheDocument();
    expect(screen.queryByText('Ana 11 QA')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Total a recaudar' })).toHaveTextContent(/USD.*360,00/);
    expect(screen.getByRole('group', { name: 'Participantes' })).toHaveTextContent('12');
  });
  test('resumen previo recalcula con nuevos datos y permite volver a participantes sin guardar', async () => {
    const { onRevisar } = await abrir();
    data = { ...data, campania: { ...data.campania, __v: 7 }, filas: data.filas.map((fila, indice) => indice === 0 ? { ...fila, monto: 40 } : fila),
      totales: { ...data.totales, subtotal_calculado: 52.5, total_esperado: 52.5 } };
    fireEvent.click(screen.getByRole('button', { name: 'Recalcular resumen' }));
    await waitFor(() => expect(screen.getByRole('group', { name: 'Total a recaudar' })).toHaveTextContent(/USD.*52,50/));
    fireEvent.click(screen.getByRole('button', { name: 'Revisar participantes' }));
    expect(onRevisar).toHaveBeenCalledWith(expect.objectContaining({ __v: 7 }));
    expect(window.fetch).toHaveBeenCalledTimes(2);
    expect(window.fetch.mock.calls.every(([, options]) => !options?.method || options.method === 'GET')).toBe(true);
  });
  test('resumen previo error permite reintentar y cancelar aborta la consulta', async () => {
    window.fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Campaña modificada.' }) })
      .mockImplementation(async () => ({ ok: true, json: async () => data }));
    const { unmount } = render(<CampaniaResumenDialog campania={campania(1)} onClose={jest.fn()} onRevisar={jest.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Campaña modificada.');
    expect(screen.getByRole('button', { name: 'Revisar participantes' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('group', { name: 'Total a recaudar' })).toHaveTextContent(/USD.*42,50/);
    const signal = window.fetch.mock.calls[1][1].signal;
    unmount();
    expect(signal.aborted).toBe(true);
  });
  test.each(['total', 'participante'])('resumen previo rechaza respuesta inconsistente: %s', async (defecto) => {
    if (defecto === 'total') data.totales = { ...data.totales, total_esperado: 999, subtotal_calculado: 999 };
    else data.filas.pop();
    render(<CampaniaResumenDialog campania={campania(1)} onClose={jest.fn()} onRevisar={jest.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo verificar el resumen.');
    expect(screen.queryByRole('group', { name: 'Total a recaudar' })).not.toBeInTheDocument();
  });
  test('resumen previo vacio conserva cero real y cerrar no modifica datos', async () => {
    data.campania.participantes = [];
    data.filas = [];
    data.totales = { participantes: 0, generales: 0, personalizados: 0, no_aplica: 0, pendientes: 0, con_observaciones: 0, subtotal_calculado: 0, total_esperado: 0 };
    const { onClose } = await abrir();
    expect(screen.getByText('No hay participantes seleccionados.')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Total a recaudar' })).toHaveTextContent(/USD.*0,00/);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar', exact: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(window.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('publicacion de campana en interfaz', () => {
  let data;
  const revision = 'b'.repeat(64);
  const uuid = '11000000-0000-4000-8000-000000000001';
  const publicada = () => {
    const publicacion = { solicitud_id: uuid, revision, version_borrador: 6, fecha: '2026-11-12T15:00:00.000Z',
      actor: { id: 'admin-qa', rol: 'admin' }, participantes: 2, generales: 1, personalizados: 0, no_aplica: 1, total_esperado: 30 };
    return { campania: { ...data.campania, estado: 'abierta', __v: 7, publicacion }, publicacion };
  };
  beforeEach(() => {
    data = { revision, campania: { ...campania(1), __v: 6, participantes: ['ana', 'bruno'] },
      filas: [{ alumno: 'ana', nombres: 'Ana', apellidos: 'QA', sede: { _id: 'norte', nombre: 'Norte' }, modalidad: 'general', monto: 30, nota_interna: '', incidencias: [] },
        { alumno: 'bruno', nombres: 'Bruno', apellidos: 'QA', sede: { _id: 'norte', nombre: 'Norte' }, modalidad: 'no_aplica', monto: 0, nota_interna: 'Exento QA', incidencias: [] }],
      totales: { participantes: 2, generales: 1, personalizados: 0, no_aplica: 1, pendientes: 0, con_observaciones: 0, subtotal_calculado: 30, total_esperado: 30 } };
    window.fetch.mockImplementation(async (url, options = {}) => ({ ok: true, json: async () => options.method === 'POST' ? publicada() : data }));
  });
  const abrir = async () => {
    const onPublished = jest.fn();
    const onClose = jest.fn();
    const view = render(<CampaniaResumenDialog campania={data.campania} onClose={onClose} onRevisar={jest.fn()} onPublished={onPublished} />);
    await screen.findByRole('button', { name: 'Publicar campaña' });
    fireEvent.click(screen.getByRole('button', { name: 'Publicar campaña' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Publicar campaña' });
    return { ...view, onPublished, onClose, dialogo };
  };
  test('publicacion interfaz pide confirmacion del total global y cancelar no publica', async () => {
    const { dialogo, onPublished } = await abrir();
    expect(dialogo).toHaveTextContent(/USD.*30,00/);
    expect(dialogo).toHaveTextContent('1 cargos pendientes · 1 No aplica');
    await waitFor(() => expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toHaveFocus());
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(window.fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
    expect(onPublished).not.toHaveBeenCalled();
  });
  test('publicacion interfaz bloquea doble envio y cierre y verifica la respuesta antes de salir', async () => {
    let resolver;
    window.fetch.mockImplementation((url, options = {}) => options.method === 'POST'
      ? new Promise((resolve) => { resolver = resolve; }) : Promise.resolve({ ok: true, json: async () => data }));
    const { dialogo, onPublished, onClose } = await abrir();
    const confirmar = within(dialogo).getByRole('button', { name: 'Confirmar publicación' });
    fireEvent.click(confirmar); fireEvent.click(confirmar);
    expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    fireEvent.keyDown(dialogo, { key: 'Escape', code: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    const posts = window.fetch.mock.calls.filter(([, options]) => options?.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0]).toEqual([expect.stringContaining('/1/publicar'), expect.objectContaining({ method: 'POST', cache: 'no-store',
      body: JSON.stringify({ version: 6, revision, solicitud_id: uuid }), headers: { Authorization: 'Bearer qa', 'Content-Type': 'application/json' } })]);
    await act(async () => resolver({ ok: true, json: async () => publicada() }));
    expect(onPublished).toHaveBeenCalledTimes(1);
    expect(onPublished).toHaveBeenCalledWith(expect.objectContaining({ estado: 'abierta', __v: 7 }));
  });
  test('publicacion interfaz reintenta con la misma clave tras error sin perder resumen', async () => {
    let intentos = 0;
    window.fetch.mockImplementation(async (url, options = {}) => {
      if (options.method !== 'POST') return { ok: true, json: async () => data };
      intentos += 1;
      return intentos === 1 ? { ok: false, json: async () => ({ error: 'Conflicto QA' }) } : { ok: true, json: async () => publicada() };
    });
    const { dialogo, onPublished } = await abrir();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar publicación' }));
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('Conflicto QA');
    expect(onPublished).not.toHaveBeenCalled();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar publicación' }));
    await waitFor(() => expect(onPublished).toHaveBeenCalledTimes(1));
    const bodies = window.fetch.mock.calls.filter(([, options]) => options?.method === 'POST').map(([, options]) => JSON.parse(options.body));
    expect(bodies).toHaveLength(2); expect(bodies[0]).toEqual(bodies[1]);
  });
  test.each(['total', 'version', 'auditoria'])('publicacion interfaz no confirma una respuesta inconsistente: %s', async (defecto) => {
    window.fetch.mockImplementation(async (url, options = {}) => {
      const respuesta = publicada();
      if (defecto === 'total') respuesta.publicacion.total_esperado = 999;
      if (defecto === 'version') respuesta.campania.__v = 8;
      if (defecto === 'auditoria') delete respuesta.publicacion.actor;
      return { ok: true, json: async () => options.method === 'POST' ? respuesta : data };
    });
    const { dialogo, onPublished } = await abrir();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar publicación' }));
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent('No se pudo verificar la publicación');
    expect(onPublished).not.toHaveBeenCalled();
    expect(within(dialogo).getByRole('button', { name: 'Confirmar publicación' })).toBeEnabled();
  });
  test.each(['observacion', 'vacio'])('publicacion interfaz bloquea resumen no publicable: %s', async (caso) => {
    if (caso === 'observacion') { data.filas[0].incidencias = ['Atleta inactivo']; data.totales.con_observaciones = 1; }
    else { data.campania.participantes = []; data.filas = []; data.totales = { participantes: 0, generales: 0, personalizados: 0,
      no_aplica: 0, pendientes: 0, con_observaciones: 0, subtotal_calculado: 0, total_esperado: 0 }; }
    render(<CampaniaResumenDialog campania={data.campania} onClose={jest.fn()} onRevisar={jest.fn()} onPublished={jest.fn()} />);
    expect(await screen.findByRole('button', { name: 'Publicar campaña' })).toBeDisabled();
    expect(window.fetch.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false);
  });
  test('publicacion interfaz actualiza listado y permite leer cargos sin editar ni volver a publicar', async () => {
    let registro = null;
    window.fetch.mockImplementation(async (url, options = {}) => {
      if (options.method === 'POST') { registro = publicada(); return { ok: true, json: async () => registro }; }
      if (url.endsWith('/resumen')) return { ok: true, json: async () => data };
      if (url.endsWith('/cargos')) return { ok: true, json: async () => ({ ...data, campania: registro.campania,
        filas: data.filas.map((fila) => ({ ...fila, saldo_pendiente: fila.monto, estado: fila.modalidad === 'no_aplica' ? 'no_aplica' : 'pendiente' })) }) };
      return responder([registro?.campania || data.campania]);
    });
    render(<CobrosAdicionales />);
    fireEvent.click(await screen.findByRole('button', { name: 'Resumen de Viaje 1' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Publicar campaña' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirmar publicación' }));
    await screen.findByText('Campaña publicada');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Abierta')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar Viaje 1' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ver cargos de Viaje 1' }));
    const cargos = await screen.findByRole('dialog', { name: 'Cargos de la campaña' });
    expect(await within(cargos).findByRole('group', { name: 'Total a recaudar' })).toHaveTextContent(/USD.*30,00/);
    expect(within(cargos).queryByRole('button', { name: 'Publicar campaña' })).not.toBeInTheDocument();
    expect(within(cargos).queryByRole('button', { name: 'Revisar participantes' })).not.toBeInTheDocument();
    expect(window.fetch.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1);
  });
});

describe('participantes de campana', () => {
  let actual;
  let atletas;
  let escrituras;
  beforeEach(() => {
    actual = { ...campania(1), participantes: ['atleta-13'], __v: 4,
      sedes: [{ _id: 'norte', nombre: 'Norte' }, { _id: 'sur', nombre: 'Sur' }] };
    atletas = Array.from({ length: 13 }, (_, indice) => ({
      _id: `atleta-${indice + 1}`, nombres: `Ana ${indice + 1}`, apellidos: 'QA', foto: '',
      categoria: indice % 2 ? 'Sub 12' : 'Sub 14',
      tipo_mensualidad: indice % 2 ? 'media_beca' : 'monto_sede',
      sede: { _id: indice >= 10 && indice < 12 ? 'sur' : 'norte', nombre: indice >= 10 && indice < 12 ? 'Sur' : 'Norte' },
      representante: { nombres: `María ${indice + 1}`, apellidos: 'QA' }, fecha_inscripcion: '2026-01-02T00:00:00.000Z',
      disponible: indice !== 12
    }));
    escrituras = [];
    window.fetch.mockImplementation(async (url, options = {}) => {
      if (url.endsWith('/participantes')) {
        if (options.method === 'PUT') {
          const body = JSON.parse(options.body);
          escrituras.push(body);
          actual = { ...actual, participantes: body.participantes,
            condiciones_participantes: body.condiciones_participantes ?? (actual.condiciones_participantes || [])
              .filter((condicion) => body.participantes.includes(condicion.alumno)), __v: actual.__v + 1 };
          return { ok: true, json: async () => ({ campania: actual }) };
        }
        return { ok: true, json: async () => ({ campania: actual, atletas }) };
      }
      return responder([actual]);
    });
  });
  const abrirParticipantes = async () => {
    render(<CobrosAdicionales />);
    fireEvent.click(await screen.findByRole('button', { name: 'Seleccionar participantes de Viaje 1' }));
    await screen.findByRole('checkbox', { name: 'Seleccionar Ana 1 QA' });
  };

  const elegirCondicion = async (nombre, opcion) => {
    fireEvent.click(screen.getByRole('button', { name: `Condiciones de ${nombre}`, exact: true }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: `Condición de ${nombre}`, exact: true }));
    fireEvent.click(await screen.findByRole('option', { name: opcion, exact: true }));
  };
  const reabrirParticipantes = async () => {
    await screen.findByText('Participantes guardados');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Participantes', exact: true })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar participantes de Viaje 1' }));
    await screen.findByRole('checkbox', { name: 'Seleccionar Ana 1 QA' });
  };

  test('participantes condiciones muestra monto de cada sede y habilita solo atletas seleccionados', async () => {
    actual = { ...actual, participantes: ['atleta-1', 'atleta-11'], modalidad_monto: 'por_sede', monto_general: null,
      montos_por_sede: [{ sede: 'norte', monto: 30 }, { sede: 'sur', monto: 45 }] };
    await abrirParticipantes();
    expect(screen.getByRole('button', { name: 'Condiciones de Ana 2 QA' })).toBeDisabled();
    expect(screen.getByText(/Campaña.*30/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Condiciones de Ana 1 QA' }));
    expect(screen.getByRole('combobox', { name: 'Condición de Ana 1 QA' })).toHaveTextContent('Monto de campaña');
    expect(screen.getByRole('button', { name: 'Guardar selección' })).toBeDisabled();
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Participantes', exact: true })).getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByText(/Campaña.*45/)).toBeInTheDocument();
    expect(escrituras).toHaveLength(0);
  });

  test('participantes condiciones guarda monto personalizado y nota interna y los recarga', async () => {
    actual.participantes = ['atleta-1'];
    await abrirParticipantes();
    await elegirCondicion('Ana 1 QA', 'Monto personalizado');
    fireEvent.change(screen.getByRole('textbox', { name: /^Monto de Ana 1 QA/ }), { target: { value: '12,50' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Nota interna de Ana 1 QA' }), { target: { value: ' Acuerdo privado QA ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar selección' }));
    await reabrirParticipantes();
    expect(escrituras).toEqual([{ participantes: ['atleta-1'], version: 4,
      condiciones_participantes: [{ alumno: 'atleta-1', modalidad: 'personalizado', monto: 12.5, nota_interna: 'Acuerdo privado QA' }] }]);
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Ana 1 QA' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Condiciones de Ana 1 QA' }));
    expect(screen.getByRole('textbox', { name: /^Monto de Ana 1 QA/ })).toHaveValue('12.5');
    expect(screen.getByRole('textbox', { name: 'Nota interna de Ana 1 QA' })).toHaveValue('Acuerdo privado QA');
    expect(screen.getByRole('button', { name: 'Guardar selección' })).toBeDisabled();
  });

  test('participantes condiciones No aplica conserva al atleta y no envia importe', async () => {
    actual.participantes = ['atleta-1'];
    await abrirParticipantes();
    await elegirCondicion('Ana 1 QA', 'No aplica');
    expect(screen.queryByRole('textbox', { name: /^Monto de Ana 1 QA/ })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Ana 1 QA' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar selección' }));
    await reabrirParticipantes();
    expect(escrituras).toEqual([{ participantes: ['atleta-1'], version: 4,
      condiciones_participantes: [{ alumno: 'atleta-1', modalidad: 'no_aplica', nota_interna: '' }] }]);
    fireEvent.click(screen.getByRole('button', { name: 'Condiciones de Ana 1 QA' }));
    expect(screen.getByRole('combobox', { name: 'Condición de Ana 1 QA' })).toHaveTextContent('No aplica');
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Ana 1 QA' })).toBeChecked();
  });

  test('participantes condiciones vuelve al monto de campana sin copiar el importe personalizado', async () => {
    actual.participantes = ['atleta-1'];
    actual.condiciones_participantes = [{ alumno: 'atleta-1', modalidad: 'personalizado', monto: 12.5, nota_interna: '' }];
    await abrirParticipantes();
    await elegirCondicion('Ana 1 QA', 'Monto de campaña');
    expect(screen.getByText(/Campaña.*30/)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /^Monto de Ana 1 QA/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar selección' }));
    await reabrirParticipantes();
    expect(escrituras).toEqual([{ participantes: ['atleta-1'], version: 4, condiciones_participantes: [] }]);
  });

  test('participantes condiciones rechaza montos invalidos y notas demasiado largas sin guardar', async () => {
    actual.participantes = ['atleta-1'];
    await abrirParticipantes();
    await elegirCondicion('Ana 1 QA', 'Monto personalizado');
    const monto = screen.getByRole('textbox', { name: /^Monto de Ana 1 QA/ });
    for (const valor of ['', '0', '-1', '1.234', '1e2', '1000000000']) {
      fireEvent.change(monto, { target: { value: valor } });
      expect(screen.getByRole('button', { name: 'Guardar selección' })).toBeDisabled();
      expect(screen.getByText('Mayor que cero, hasta dos decimales.')).toBeInTheDocument();
    }
    fireEvent.change(monto, { target: { value: '15' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Nota interna de Ana 1 QA' }), { target: { value: 'x'.repeat(1001) } });
    expect(screen.getByRole('button', { name: 'Guardar selección' })).toBeDisabled();
    expect(escrituras).toHaveLength(0);
  });

  test('participantes condiciones conserva acuerdos entre paginas y filtros y confirma descarte', async () => {
    actual.participantes = ['atleta-1'];
    await abrirParticipantes();
    await elegirCondicion('Ana 1 QA', 'No aplica');
    fireEvent.change(screen.getByRole('textbox', { name: 'Nota interna de Ana 1 QA' }), { target: { value: 'Motivo privado' } });
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Participantes', exact: true })).getByRole('button', { name: 'Página siguiente' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar atleta o representante' }), { target: { value: 'Ana 1 QA' } });
    expect(screen.getByRole('combobox', { name: 'Condición de Ana 1 QA' })).toHaveTextContent('No aplica');
    expect(screen.getByRole('textbox', { name: 'Nota interna de Ana 1 QA' })).toHaveValue('Motivo privado');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar', exact: true }));
    expect(await screen.findByRole('dialog', { name: 'Descartar selección sin guardar' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Descartar cambios', exact: true }));
    expect(escrituras).toHaveLength(0);
  });

  test('participantes condiciones retirar atleta elimina su excepcion al guardar', async () => {
    actual.participantes = ['atleta-1', 'atleta-13'];
    actual.condiciones_participantes = [{ alumno: 'atleta-1', modalidad: 'no_aplica', nota_interna: 'Motivo privado' }];
    await abrirParticipantes();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar Ana 1 QA' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar selección' }));
    await reabrirParticipantes();
    expect(escrituras).toEqual([{ participantes: ['atleta-13'], version: 4, condiciones_participantes: [] }]);
  });

  test('participantes condiciones rechaza respuesta que pierde el acuerdo y conserva el formulario', async () => {
    actual.participantes = ['atleta-1'];
    const original = window.fetch.getMockImplementation();
    window.fetch.mockImplementation(async (url, options = {}) => options.method === 'PUT'
      ? { ok: true, json: async () => ({ campania: { ...actual, __v: 5, condiciones_participantes: [] } }) }
      : original(url, options));
    await abrirParticipantes();
    await elegirCondicion('Ana 1 QA', 'No aplica');
    fireEvent.click(screen.getByRole('button', { name: 'Guardar selección' }));
    expect(await screen.findByText(/No se pudo verificar el guardado/)).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Condición de Ana 1 QA' })).toHaveTextContent('No aplica');
    expect(screen.queryByText('Participantes guardados')).not.toBeInTheDocument();
  });

  test('participantes carga datos minimos sin incluir atletas automaticamente', async () => {
    await abrirParticipantes();
    expect(screen.getByText('1 atleta seleccionado')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Ana 1 QA' })).not.toBeChecked();
    expect(screen.getByText('María 1 QA')).toBeInTheDocument();
    expect(screen.getAllByText('2/1/2026')).toHaveLength(10);
    expect(screen.getByRole('button', { name: 'Guardar selección' })).toBeDisabled();
    expect(window.fetch).toHaveBeenCalledWith(expect.stringContaining('/1/participantes'), expect.objectContaining({
      headers: { Authorization: 'Bearer qa' }, cache: 'no-store', signal: expect.any(AbortSignal)
    }));
    expect(escrituras).toHaveLength(0);
  });

  test('participantes conserva seleccion entre paginas y guarda solo ids y version', async () => {
    await abrirParticipantes();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar Ana 1 QA' }));
    const dialogo = screen.getByRole('dialog', { name: 'Participantes', exact: true });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Página siguiente' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar Ana 11 QA' }));
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Ana 13 QA' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionados (3)' }));
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Ana 1 QA' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Ana 11 QA' })).toBeChecked();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar Ana 13 QA' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar selección' }));
    expect(await screen.findByText('Participantes guardados')).toBeInTheDocument();
    expect(escrituras).toEqual([{ participantes: ['atleta-1', 'atleta-11'], version: 4 }]);
    expect(screen.getByRole('button', { name: 'Seleccionar participantes de Viaje 1' })).toHaveTextContent('Participantes (2)');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Participantes', exact: true })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionar participantes de Viaje 1' }));
    expect(await screen.findByRole('checkbox', { name: 'Seleccionar Ana 1 QA' })).toBeChecked();
    expect(screen.getByText('2 atletas seleccionados')).toBeInTheDocument();
  });

  test('participantes selecciona solo la pagina visible sin alterar paginas ocultas', async () => {
    await abrirParticipantes();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar página actual' }));
    expect(screen.getByText('11 atletas seleccionados')).toBeInTheDocument();
    const dialogo = screen.getByRole('dialog', { name: 'Participantes', exact: true });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Ana 11 QA' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Ana 13 QA' })).toBeChecked();
    expect(escrituras).toHaveLength(0);
  });

  test('participantes filtra por categoria, sede y representante sin perder cambios', async () => {
    await abrirParticipantes();
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar atleta o representante' }), { target: { value: 'MARIA 2' } });
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Ana 2 QA' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Seleccionar Ana 1 QA' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar Ana 2 QA' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar atleta o representante' }), { target: { value: '' } });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Categoría' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Sub 12', exact: true }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Sede', exact: true }));
    fireEvent.click(await screen.findByRole('option', { name: 'Sur', exact: true }));
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Ana 12 QA' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Seleccionar Ana 2 QA' })).not.toBeInTheDocument();
    expect(screen.getByText('2 atletas seleccionados')).toBeInTheDocument();
    expect(escrituras).toHaveLength(0);
  });

  test.each([
    ['monto_sede', 'Monto sede'], ['media_beca', 'Media beca (50%)'],
    ['monto_personalizado', 'Monto personalizado'], ['beca_completa', 'Beca completa']
  ])('participantes filtra tipo de mensualidad %s sin cambiar la seleccion', async (tipo, etiqueta) => {
    atletas.forEach((atleta) => { atleta.tipo_mensualidad = tipo === 'monto_sede' ? 'media_beca' : 'monto_sede'; });
    atletas[0].tipo_mensualidad = tipo;
    await abrirParticipantes();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Tipo de mensualidad' }));
    fireEvent.click(await screen.findByRole('option', { name: etiqueta, exact: true }));
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Ana 1 QA' })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Atletas de la campaña' })).getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByText('1 atleta seleccionado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar selección' })).toBeDisabled();
    expect(escrituras).toHaveLength(0);
  });

  test('participantes filtra inscripcion con extremos inclusivos y conserva seleccion oculta al guardar', async () => {
    atletas.forEach((atleta) => { atleta.fecha_inscripcion = null; });
    atletas[0].fecha_inscripcion = '2026-01-01T23:59:59.999Z';
    atletas[1].fecha_inscripcion = '2026-01-02T00:00:00.000Z';
    atletas[2].fecha_inscripcion = '2026-01-31T23:59:59.999Z';
    atletas[3].fecha_inscripcion = '2026-02-01T00:00:00.000Z';
    atletas[4].fecha_inscripcion = 'invalida';
    await abrirParticipantes();
    fireEvent.change(screen.getByLabelText('Inscripción desde'), { target: { value: '2026-01-02' } });
    fireEvent.change(screen.getByLabelText('Inscripción hasta'), { target: { value: '2026-01-31' } });
    expect(within(screen.getByRole('list', { name: 'Atletas de la campaña' })).getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Ana 2 QA' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Ana 3 QA' })).toBeInTheDocument();
    expect(screen.getByText('1 atleta seleccionado')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar página actual' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar selección' }));
    expect(await screen.findByText('Participantes guardados')).toBeInTheDocument();
    expect(escrituras).toEqual([{ participantes: ['atleta-13', 'atleta-2', 'atleta-3'], version: 4 }]);
  });

  test('participantes combina mensualidad y fechas abiertas, valida rango y permite limpiar filtros', async () => {
    atletas.forEach((atleta) => { atleta.fecha_inscripcion = null; });
    atletas[0].fecha_inscripcion = '2026-01-01T00:00:00.000Z';
    atletas[1].fecha_inscripcion = '2026-01-02T00:00:00.000Z';
    await abrirParticipantes();
    const dialogo = screen.getByRole('dialog', { name: 'Participantes', exact: true });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Página siguiente' }));
    fireEvent.change(screen.getByLabelText('Inscripción desde'), { target: { value: '2026-01-02' } });
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Ana 2 QA' })).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Tipo de mensualidad' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Monto sede', exact: true }));
    expect(screen.getByText('No hay atletas que coincidan con los filtros.')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Tipo de mensualidad' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Todos los tipos', exact: true }));
    fireEvent.change(screen.getByLabelText('Inscripción hasta'), { target: { value: '2026-01-01' } });
    expect(screen.getByText('La fecha final debe ser igual o posterior a la inicial.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Inscripción desde'), { target: { value: '' } });
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Ana 1 QA' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Seleccionar Ana 2 QA' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Inscripción hasta'), { target: { value: '' } });
    expect(within(screen.getByRole('list', { name: 'Atletas de la campaña' })).getAllByRole('checkbox')).toHaveLength(10);
    expect(screen.getByText('1 atleta seleccionado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar selección' })).toBeDisabled();
    expect(escrituras).toHaveLength(0);
  });

  test('participantes limpiar filtros restablece todos los campos y conserva seleccion y acuerdos', async () => {
    await abrirParticipantes();
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar Ana 1 QA' }));
    await elegirCondicion('Ana 1 QA', 'Monto personalizado');
    fireEvent.change(screen.getByRole('textbox', { name: 'Monto de Ana 1 QA' }), { target: { value: '12,50' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Nota interna de Ana 1 QA' }), { target: { value: 'Acuerdo QA' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar atleta o representante' }), { target: { value: 'Ana' } });
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Sede', exact: true }));
    fireEvent.click(await screen.findByRole('option', { name: 'Sur', exact: true }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Categoría' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Sub 12', exact: true }));
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Tipo de mensualidad' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Media beca (50%)', exact: true }));
    fireEvent.change(screen.getByLabelText('Inscripción desde'), { target: { value: '2026-02-01' } });
    fireEvent.change(screen.getByLabelText('Inscripción hasta'), { target: { value: '2026-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionados (2)' }));
    expect(screen.getByText('La fecha final debe ser igual o posterior a la inicial.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(screen.getByRole('textbox', { name: 'Buscar atleta o representante' })).toHaveValue('');
    for (const [campo, opcion] of [['Sede', 'Todas las sedes'], ['Categoría', 'Todas las categorías'], ['Tipo de mensualidad', 'Todos los tipos']]) {
      fireEvent.mouseDown(screen.getByRole('combobox', { name: campo, exact: true }));
      const restablecida = await screen.findByRole('option', { name: opcion, exact: true });
      expect(restablecida).toHaveAttribute('aria-selected', 'true');
      fireEvent.click(restablecida);
      await waitFor(() => expect(screen.queryByRole('listbox', { name: campo, exact: true })).not.toBeInTheDocument());
    }
    expect(screen.getByLabelText('Inscripción desde')).toHaveValue('');
    expect(screen.getByLabelText('Inscripción hasta')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Todos', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByText('La fecha final debe ser igual o posterior a la inicial.')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Ana 1 QA' })).toBeChecked();
    expect(screen.getByRole('textbox', { name: 'Monto de Ana 1 QA' })).toHaveValue('12,50');
    expect(screen.getByRole('textbox', { name: 'Nota interna de Ana 1 QA' })).toHaveValue('Acuerdo QA');
    expect(screen.getByText('2 atletas seleccionados')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeDisabled();
    expect(escrituras).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Guardar selección' }));
    await screen.findByText('Participantes guardados');
    expect(escrituras).toEqual([{ participantes: ['atleta-13', 'atleta-1'], version: 4,
      condiciones_participantes: [{ alumno: 'atleta-1', modalidad: 'personalizado', monto: 12.5, nota_interna: 'Acuerdo QA' }] }]);
  });

  test('participantes limpiar filtros vuelve a primera pagina sin marcar el formulario como modificado', async () => {
    await abrirParticipantes();
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar atleta o representante' }), { target: { value: 'QA' } });
    const dialogo = screen.getByRole('dialog', { name: 'Participantes', exact: true });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Página siguiente' }));
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Ana 13 QA' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Ana 1 QA' })).not.toBeChecked();
    expect(within(dialogo).getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Guardar selección' })).toBeDisabled();
    expect(screen.getByText('1 atleta seleccionado')).toBeInTheDocument();
    expect(escrituras).toHaveLength(0);
  });

  test('participantes pide confirmar descarte y nunca escribe al cancelar', async () => {
    await abrirParticipantes();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar Ana 1 QA' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar', exact: true }));
    expect(await screen.findByRole('dialog', { name: 'Descartar selección sin guardar' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Seguir seleccionando' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Descartar selección sin guardar' })).not.toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Ana 1 QA' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar participantes' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Descartar cambios' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Participantes', exact: true })).not.toBeInTheDocument());
    expect(escrituras).toHaveLength(0);
  });

  test('participantes conserva cambios ante conflicto y bloquea doble envio', async () => {
    const original = window.fetch.getMockImplementation();
    let resolver;
    let primera = true;
    window.fetch.mockImplementation((url, options = {}) => {
      if (options.method === 'PUT' && primera) {
        primera = false;
        return new Promise((resolve) => { resolver = resolve; });
      }
      return original(url, options);
    });
    await abrirParticipantes();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar Ana 1 QA' }));
    const boton = screen.getByRole('button', { name: 'Guardar selección' });
    fireEvent.click(boton);
    fireEvent.click(boton);
    expect(window.fetch.mock.calls.filter((call) => call[1]?.method === 'PUT')).toHaveLength(1);
    await act(async () => resolver({ ok: false, json: async () => ({ error: 'Otro administrador modificó el borrador.' }) }));
    expect(await screen.findByText('Otro administrador modificó el borrador.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Ana 1 QA' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Guardar selección' })).toBeEnabled();
    expect(escrituras).toHaveLength(0);
  });

  test('participantes diferencia error de lista vacia, permite reintentar y aborta al salir', async () => {
    const original = window.fetch.getMockImplementation();
    let fallar = true;
    window.fetch.mockImplementation((url, options) => url.endsWith('/participantes') && fallar
      ? Promise.resolve({ ok: false, json: async () => ({ error: 'No se pudieron cargar los participantes.' }) }) : original(url, options));
    const { unmount } = render(<CampaniaParticipantesDialog campania={actual} onClose={jest.fn()} onSaved={jest.fn()} />);
    expect(await screen.findByText('No se pudieron cargar los participantes.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar selección' })).toBeDisabled();
    expect(screen.queryByText('No hay atletas disponibles en las sedes de esta campaña.')).not.toBeInTheDocument();
    fallar = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByRole('checkbox', { name: 'Seleccionar Ana 1 QA' });
    const signal = window.fetch.mock.calls[1][1].signal;
    unmount();
    expect(signal.aborted).toBe(true);
  });

  test('participantes no acepta un catalogo que pierde atletas seleccionados', async () => {
    atletas = [];
    render(<CampaniaParticipantesDialog campania={actual} onClose={jest.fn()} onSaved={jest.fn()} />);
    expect(await screen.findByText('No se pudo verificar la lista de participantes. Intenta nuevamente.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar selección' })).toBeDisabled();
  });

  test('participantes muestra vacio real sin habilitar un guardado sin cambios', async () => {
    atletas = [];
    actual.participantes = [];
    render(<CampaniaParticipantesDialog campania={actual} onClose={jest.fn()} onSaved={jest.fn()} />);
    expect(await screen.findByText('No hay atletas disponibles en las sedes de esta campaña.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Guardar selección' })).toBeDisabled();
  });

  test('participantes permite retirar toda la seleccion de forma explicita', async () => {
    await abrirParticipantes();
    fireEvent.click(screen.getByRole('button', { name: 'Seleccionados (1)' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Seleccionar Ana 13 QA' }));
    expect(screen.getByText('Todavía no has seleccionado atletas.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar selección' }));
    expect(await screen.findByText('Participantes guardados')).toBeInTheDocument();
    expect(escrituras).toEqual([{ participantes: [], version: 4 }]);
  });

  test('participantes no confirma si el servidor devuelve una seleccion o version distinta', async () => {
    const original = window.fetch.getMockImplementation();
    const onSaved = jest.fn();
    window.fetch.mockImplementation((url, options = {}) => options.method === 'PUT'
      ? Promise.resolve({ ok: true, json: async () => ({ campania: actual }) }) : original(url, options));
    render(<CampaniaParticipantesDialog campania={actual} onClose={jest.fn()} onSaved={onSaved} />);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Seleccionar Ana 1 QA' }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar selección' }));
    expect(await screen.findByText('No se pudo verificar el guardado. Cierra y vuelve a abrir los participantes antes de reintentar.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Seleccionar Ana 1 QA' })).toBeChecked();
    expect(onSaved).not.toHaveBeenCalled();
  });
});