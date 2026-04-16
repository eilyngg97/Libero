import React, { createContext, useContext, useState } from 'react';

const SedeContext = createContext();

function getCurrentTenantId() {
  return String(localStorage.getItem('tenantId') || '').trim().toLowerCase();
}

function readStoredSedeForCurrentTenant() {
  const storedRaw = localStorage.getItem('sedeSeleccionada');
  if (!storedRaw) return null;

  try {
    const parsed = JSON.parse(storedRaw);
    const currentTenantId = getCurrentTenantId();

    // Formato nuevo: { tenantId, sede }
    if (parsed && typeof parsed === 'object' && parsed.sede) {
      const storedTenantId = String(parsed.tenantId || '').trim().toLowerCase();
      if (!currentTenantId || !storedTenantId || storedTenantId === currentTenantId) {
        return parsed.sede;
      }
      localStorage.removeItem('sedeSeleccionada');
      return null;
    }

    // Formato legacy: sede plana. Si ya hay tenant activo, limpiamos para evitar cruces.
    if (currentTenantId) {
      localStorage.removeItem('sedeSeleccionada');
      return null;
    }

    return parsed;
  } catch (_) {
    localStorage.removeItem('sedeSeleccionada');
    return null;
  }
}


export function SedeProvider({ children }) {
  const [sedeSeleccionada, setSedeSeleccionadaState] = useState(() => {
    return readStoredSedeForCurrentTenant();
  });

  const setSedeSeleccionada = (sede) => {
    setSedeSeleccionadaState(sede);
    if (sede) {
      const tenantId = getCurrentTenantId();
      localStorage.setItem('sedeSeleccionada', JSON.stringify({ tenantId, sede }));
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
