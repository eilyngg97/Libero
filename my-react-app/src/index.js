import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Adjunta token automáticamente a llamadas del API para unificar autenticación.
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init = {}) => {
  const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:4000';
  const url = typeof input === 'string' ? input : input?.url || '';
  const isApiRequest = url.startsWith(`${apiBase}/api/`) || url.startsWith('/api/');

  if (!isApiRequest) {
    return originalFetch(input, init);
  }

  const token = localStorage.getItem('token');
  if (!token) {
    return originalFetch(input, init);
  }

  const headers = new Headers(init.headers || (input && input.headers) || undefined);
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return originalFetch(input, { ...init, headers });
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ThemeProvider theme={createTheme()}>
      <App />
    </ThemeProvider>
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
