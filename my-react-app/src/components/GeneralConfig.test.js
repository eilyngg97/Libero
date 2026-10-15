import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import GeneralConfig from './GeneralConfig';

test('agrega, edita, guarda y recarga un desplegable propio sin cambiar los cinco actuales', async () => {
  let savedConfig = { constancias: {} };
  const originalFetch = global.fetch;
  global.fetch = jest.fn(async (url, options = {}) => {
    if (options.method === 'PATCH') savedConfig = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => url.endsWith('/api/tenant/context') ? {} : savedConfig
    };
  });
  localStorage.setItem('rol', 'admin');
  try {
    const { unmount } = render(<GeneralConfig />);
    const nombre = await screen.findByLabelText('Nombre del nuevo formato');
    expect(screen.getByText('Constancia simple')).toBeInTheDocument();
    expect(screen.getByText('Carta de retiro')).toBeInTheDocument();
    expect(screen.getByText('Constancia con horario')).toBeInTheDocument();
    expect(screen.getByText('Constancia con listado de alumnos')).toBeInTheDocument();
    expect(screen.getByText('Constancia de asistencia')).toBeInTheDocument();
    fireEvent.change(nombre, { target: { value: 'Constancias entrenadores' } });
    const agregar = screen.getByRole('button', { name: 'Agregar formato' });
    expect(within(agregar).getByTestId('AddRoundedIcon')).toBeInTheDocument();
    fireEvent.click(agregar);
    const heading = screen.getByRole('button', { name: /Constancias entrenadores/ });
    const accordion = heading.closest('.MuiAccordion-root');
    const fields = within(accordion);
    expect(fields.getByLabelText('Cierre')).toHaveValue(
      'Esta constancia no será válida ni tendrá efecto legal alguno si carece de la firma autógrafa y el sello húmedo de la institución/academia.'
    );
    fireEvent.change(fields.getByLabelText(/Nombre del desplegable/), { target: { value: 'Constancias del equipo' } });
    for (const [label, value] of [
      ['Titulo', 'Titulo nuevo'], ['Destinatario', 'Destinatario nuevo'],
      ['Cuerpo', 'Cuerpo nuevo'], ['Nota', 'Nota nueva'],
      ['Lugar de emision', 'Ciudad nueva'], ['Cierre', 'Cierre nuevo']
    ]) {
      fireEvent.change(fields.getByLabelText(label), { target: { value } });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Guardar configuracion de constancias' }));
    await waitFor(() => expect(savedConfig.constancias.personalizados).toHaveLength(1));
    expect(savedConfig.constancias.personalizados[0]).toMatchObject({
      nombre: 'Constancias del equipo',
      template: {
        titulo: 'Titulo nuevo', destinatario: 'Destinatario nuevo', cuerpo: 'Cuerpo nuevo',
        nota: 'Nota nueva', lugarEmision: 'Ciudad nueva', cierre: 'Cierre nuevo'
      }
    });
    await screen.findByText('Configuracion de constancias actualizada.');
    unmount();
    render(<GeneralConfig />);
    expect(await screen.findByText('Constancias del equipo')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Constancias del equipo/ }));
    expect(screen.getByDisplayValue('Cuerpo nuevo')).toBeInTheDocument();
  } finally {
    global.fetch = originalFetch;
    localStorage.clear();
  }
}, 30000);

test('confirma la eliminacion, permite cancelar y conserva el formato si falla el guardado', async () => {
  let savedConfig = {
    constancias: {
      personalizados: [
        { id: 'personalizado_equipo', nombre: 'Constancias del equipo', template: { cuerpo: 'Texto propio' } }
      ]
    }
  };
  let fallarGuardado = false;
  const originalFetch = global.fetch;
  global.fetch = jest.fn(async (url, options = {}) => {
    if (options.method === 'PATCH' && fallarGuardado) {
      return { ok: false, json: async () => ({ error: 'No se pudo eliminar el formato.' }) };
    }
    if (options.method === 'PATCH') savedConfig = JSON.parse(options.body);
    return { ok: true, json: async () => url.endsWith('/api/tenant/context') ? {} : savedConfig };
  });
  localStorage.setItem('rol', 'admin');
  try {
    const { unmount } = render(<GeneralConfig />);
    const heading = await screen.findByRole('button', { name: /Constancias del equipo/ });
    expect(heading).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByRole('button', { name: 'Eliminar formato' })).toHaveLength(1);
    const deleteButton = screen.getByRole('button', { name: 'Eliminar formato' });
    expect(deleteButton.closest('.MuiAccordion-root')).toBe(heading.closest('.MuiAccordion-root'));
    expect(deleteButton.closest('h3')).toBe(heading.closest('h3'));
    expect(heading).not.toContainElement(deleteButton);
    expect(deleteButton).toBeVisible();
    fireEvent.click(deleteButton);
    expect(heading).toHaveAttribute('aria-expanded', 'false');
    const dialog = screen.getByRole('dialog', { name: 'Eliminar formato personalizado' });
    expect(dialog).toHaveTextContent('Se eliminará "Constancias del equipo" y dejará de estar disponible para emitir constancias.');
    expect(within(dialog).getByText('"Constancias del equipo"').tagName).toBe('STRONG');
    expect(dialog).toHaveAttribute('aria-describedby', 'eliminar-formato-description');
    expect(within(dialog).getByText('Esta acción no se puede deshacer.')).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent('solo de esta academia');
    expect(dialog).not.toHaveTextContent('Los cinco formatos predeterminados');
    expect(dialog).not.toHaveTextContent('cambios pendientes');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(global.fetch.mock.calls.filter(([, options]) => options?.method === 'PATCH')).toHaveLength(0);
    expect(savedConfig.constancias.personalizados).toHaveLength(1);

    fallarGuardado = true;
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar formato' }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('No se pudo eliminar el formato.');
    expect(savedConfig.constancias.personalizados).toHaveLength(1);

    fallarGuardado = false;
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Eliminar' }));
    await waitFor(() => expect(savedConfig.constancias.personalizados).toEqual([]));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText('Constancias del equipo')).not.toBeInTheDocument();
    expect(screen.getByText('Constancia simple')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar formato' })).not.toBeInTheDocument();
    unmount();
    render(<GeneralConfig />);
    await screen.findByLabelText('Nombre del nuevo formato');
    expect(screen.queryByText('Constancias del equipo')).not.toBeInTheDocument();
  } finally {
    global.fetch = originalFetch;
    localStorage.clear();
  }
}, 30000);
