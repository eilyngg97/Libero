import React, { createContext, useContext, useEffect, useState } from 'react';

const DolarContext = createContext();
const API_BASE = process.env.REACT_APP_API_URL || window.location.origin;

function normalizeMoneda(value) {
  return String(value || '').trim().toUpperCase() === 'EUR' ? 'EUR' : 'USD';
}

function buildRateEndpoint(moneda) {
  return moneda === 'EUR'
    ? 'https://ve.dolarapi.com/v1/euros/oficial'
    : 'https://ve.dolarapi.com/v1/dolares/oficial';
}

function buildDivisaState(moneda, payload = {}) {
  const monedaNormalizada = normalizeMoneda(moneda);
  return {
    promedio: payload?.promedio ?? null,
    fechaActualizacion: payload?.fechaActualizacion ?? null,
    moneda: monedaNormalizada,
    simbolo: monedaNormalizada === 'EUR' ? '€' : '$',
    nombre: monedaNormalizada === 'EUR' ? 'Euro' : 'Dolar'
  };
}

export function DolarProvider({ children }) {
  const [dolar, setDolar] = useState(buildDivisaState('USD'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDolar = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      let moneda = 'USD';

      try {
        const configRes = await fetch(`${API_BASE}/api/configuracion/pagos`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        const configData = await configRes.json().catch(() => ({}));
        if (configRes.ok) {
          moneda = normalizeMoneda(configData?.cobro?.moneda);
        }
      } catch (_) {
        moneda = 'USD';
      }

      const res = await fetch(buildRateEndpoint(moneda));
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al obtener tasa');
      setDolar(buildDivisaState(moneda, data));
    } catch (err) {
      setError(err.message || 'Error al obtener tasa');
      setDolar((prev) => buildDivisaState(prev?.moneda || 'USD'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDolar();
  }, []);

  useEffect(() => {
    const handleAuthChanged = () => {
      fetchDolar();
    };

    window.addEventListener('auth-changed', handleAuthChanged);
    window.addEventListener('storage', handleAuthChanged);

    return () => {
      window.removeEventListener('auth-changed', handleAuthChanged);
      window.removeEventListener('storage', handleAuthChanged);
    };
  }, []);

  return (
    <DolarContext.Provider value={{ dolar, loading, error, refreshDolar: fetchDolar }}>
      {children}
    </DolarContext.Provider>
  );
}

export function useDolar() {
  return useContext(DolarContext);
}
