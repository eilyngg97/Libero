import { fireEvent, render, screen, within } from '@testing-library/react';
import ApexLandingPage, { getAcademyLoginUrl, PlatformPreview } from './ApexLandingPage';

test('muestra las pantallas provisionales y permite reemplazar sus imagenes', () => {
  render(<PlatformPreview desktopImage="/desktop-demo.png" mobileImage="/mobile-demo.png" />);
  expect(screen.getByRole('region', { name: 'APEX en escritorio y móvil' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /Vista de escritorio de APEX/ })).toHaveAttribute('src', '/desktop-demo.png');
  expect(screen.getByRole('img', { name: /Vista móvil de APEX/ })).toHaveAttribute('src', '/mobile-demo.png');
  expect(screen.getByText('100 %')).toBeInTheDocument();
  expect(screen.getByText('enfocados en tu academia')).toBeInTheDocument();
});

test('muestra todas las academias y conserva sus nombres si falta el logo', () => {
  render(<ApexLandingPage />);
  expect(screen.getByRole('heading', { name: 'La confianza se juega en equipo' })).toBeInTheDocument();
  expect(screen.getByText('Academias que confían en', { exact: false })).toHaveTextContent('Academias que confían en APEX');
  const list = within(screen.getByRole('list', { name: 'Academias clientes' }));
  const names = ['Villasport', 'Esporta', 'Academia Fénix', 'Club Villa Cantevista', 'Olympykus', 'Starvolley', 'E.B.E.R.', 'Zenith', 'Monarca', 'Elite', 'Bigstars', 'Starelite'];
  expect(list.getAllByRole('listitem')).toHaveLength(names.length);
  names.forEach((name) => {
    const image = list.getByRole('img', { name });
    expect(image).toHaveAttribute('src', expect.stringContaining('/apex/academias/'));
    fireEvent.error(image);
    expect(list.getByText(name)).toBeInTheDocument();
  });
});

test('la cinta oculta su copia accesible y no muestra controles de pausa', () => {
  render(<ApexLandingPage />);
  expect(screen.getAllByRole('list')).toHaveLength(1);
  expect(screen.getAllByRole('list', { hidden: true })).toHaveLength(2);
  expect(screen.getByRole('region', { name: 'Logos de academias' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /pausar cinta|reanudar cinta/i })).not.toBeInTheDocument();
});

test('muestra el titular y abre la informacion de la plataforma', () => {
  render(<ApexLandingPage />);
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Tu academia merecellegar más lejos');
  fireEvent.click(screen.getByRole('button', { name: 'Ver cómo funciona' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('Tu academia cuenta con su propio subdominio');
});

test('permite abrir el acceso y rechaza dominios completos', () => {
  render(<ApexLandingPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
  fireEvent.change(screen.getByLabelText('Subdominio de tu academia'), { target: { value: 'https://otro.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ir a mi academia' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Introduce solo el nombre del subdominio');
});

test('construye el login solo dentro de apex.com.ve', () => {
  expect(getAcademyLoginUrl(' Villasport ')).toBe('https://villasport.apex.com.ve/login');
  expect(getAcademyLoginUrl('team-gonzalez')).toBe('https://team-gonzalez.apex.com.ve/login');
  expect(getAcademyLoginUrl('evil.com/path')).toBe('');
  expect(getAcademyLoginUrl('-club')).toBe('');
});