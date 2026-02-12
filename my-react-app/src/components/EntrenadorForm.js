import React, { useState, useRef } from 'react';
import './EntrenadorForm.css';

function EntrenadorForm({ onSuccess }) {
  const [preview, setPreview] = useState(null);
  const inputRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleFotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result);
      };
      reader.readAsDataURL(file);
    } else {
      setPreview(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess(false);
    const form = e.target;
    const data = {
      nombre: form.nombre.value,
      apellido: form.apellido.value,
      fecha_nacimiento: form.fecha_nacimiento.value,
      genero: form.genero.value,
      correo: form.correo.value,
      telefono: form.telefono.value,
      direccion: form.direccion.value,
      documento: form.documento.value,
      fecha_contratacion: form.fecha_contratacion.value,
      salario: form.salario.value,
      especialidad: form.especialidad.value,
      certificacion: form.certificacion.value,
      notas: form.notas.value,
      usuario: form.usuario.value,
      password: form.password.value,
      foto: preview,
      estado: 'activo',
    };
    try {
      const res = await fetch('http://localhost:4000/entrenadores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Error al registrar entrenador');
      setSuccess(true);
      form.reset();
      setPreview(null);
      setTimeout(() => setSuccess(false), 2000);
      if (onSuccess) onSuccess();
    } catch (err) {
      setError('No se pudo registrar el entrenador');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="entrenador-form-container">
      <h2>Nuevo Entrenador</h2>
      <form className="entrenador-form" onSubmit={handleSubmit} autoComplete="off">
        <div className="form-row">
          <div className="form-group">
            <label>Foto de perfil:</label>
            <input type="file" accept="image/*" onChange={handleFotoChange} ref={inputRef} />
            {preview && <img src={preview} alt="Foto" className="entrenador-foto-preview" />}
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Nombre:</label>
            <input type="text" name="nombre" />
          </div>
          <div className="form-group">
            <label>Apellido:</label>
            <input type="text" name="apellido" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Fecha de Nacimiento:</label>
            <input type="date" name="fecha_nacimiento" />
          </div>
          <div className="form-group">
            <label>Género:</label>
            <select name="genero">
              <option value="">Selecciona</option>
              <option value="masculino">Masculino</option>
              <option value="femenino">Femenino</option>
              <option value="otro">Otro</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Correo Electrónico:</label>
            <input type="email" name="correo" />
          </div>
          <div className="form-group">
            <label>Teléfono:</label>
            <input type="tel" name="telefono" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Dirección:</label>
            <input type="text" name="direccion" />
          </div>
          <div className="form-group">
            <label>Documento de Identidad:</label>
            <input type="text" name="documento" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Fecha de Contratación:</label>
            <input type="date" name="fecha_contratacion" />
          </div>
          <div className="form-group">
            <label>Salario (opcional):</label>
            <input type="number" name="salario" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Especialidad:</label>
            <input type="text" name="especialidad" />
          </div>
          <div className="form-group">
            <label>Nivel de Certificación:</label>
            <input type="text" name="certificacion" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Notas internas:</label>
            <textarea name="notas" />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Usuario de acceso:</label>
            <input type="text" name="usuario" />
          </div>
          <div className="form-group">
            <label>Contraseña inicial:</label>
            <input type="password" name="password" />
          </div>
        </div>
        <button type="submit" disabled={loading}>{loading ? 'Registrando...' : 'Registrar Entrenador'}</button>
        {error && <div style={{color: 'red', marginTop: 8}}>{error}</div>}
        {success && <div style={{color: 'green', marginTop: 8}}>¡Entrenador registrado exitosamente!</div>}
      </form>
    </div>
  );
}

export default EntrenadorForm;
