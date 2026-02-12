import React, { useState } from 'react';
import EntrenadoresList from './EntrenadoresList';
import EntrenadorForm from './EntrenadorForm';

function Entrenadores() {
  const [mostrarForm, setMostrarForm] = useState(false);

  return (
    <div>
      {mostrarForm ? (
        <EntrenadorForm />
      ) : (
        <>
          <EntrenadoresList />
        </>
      )}
      {mostrarForm && (
        <button
          style={{ marginTop: '18px' }}
          onClick={() => setMostrarForm(false)}
        >
          Volver a la lista
        </button>
      )}
    </div>
  );
}

export default Entrenadores;
