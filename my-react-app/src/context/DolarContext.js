import React, { createContext, useContext, useEffect, useState } from 'react';

const DolarContext = createContext();

export function DolarProvider({ children }) {
  const [dolar, setDolar] = useState({ promedio: null, fechaActualizacion: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDolar = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Error al obtener tasa');
      setDolar({
        promedio: data?.promedio ?? null,
        fechaActualizacion: data?.fechaActualizacion ?? null
      });
    } catch (err) {
      setError(err.message || 'Error al obtener tasa');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDolar();
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
