import React, { createContext, useContext, useLayoutEffect } from 'react';
import { Dialog } from '@mui/material';

export const CierrePasoCampania = createContext(null);

function CampaniaDialog({ children, ...props }) {
  const cierrePaso = useContext(CierrePasoCampania);
  useLayoutEffect(() => {
    if (!cierrePaso) return;
    cierrePaso.current = props.onClose;
    return () => { cierrePaso.current = null; };
  }, [cierrePaso, props.onClose]);

  return cierrePaso ? <>{children}</> : <Dialog {...props}>{children}</Dialog>;
}

export default CampaniaDialog;