import { render, screen } from '@testing-library/react';
import App from './App';

test('renders tenant validation state on boot', () => {
  render(<App />);
  const titleElement = screen.getByText(/validando tenant/i);
  expect(titleElement).toBeInTheDocument();
});
