import React, { createContext, useContext, useState } from 'react';

const SedeContext = createContext();


export function SedeProvider({ children }) {
  const [sedeSeleccionada, setSedeSeleccionadaState] = useState(() => {
    const stored = localStorage.getItem('sedeSeleccionada');
    return stored ? JSON.parse(stored) : null;
  });

  const setSedeSeleccionada = (sede) => {
    setSedeSeleccionadaState(sede);
    if (sede) {
      localStorage.setItem('sedeSeleccionada', JSON.stringify(sede));
    } else {
      localStorage.removeItem('sedeSeleccionada');
    }
  };

  return (
    <SedeContext.Provider value={{ sedeSeleccionada, setSedeSeleccionada }}>
      {children}
    </SedeContext.Provider>
  );
}

export function useSede() {
  return useContext(SedeContext);
}
