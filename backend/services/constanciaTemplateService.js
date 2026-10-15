const TIPOS_CONSTANCIA = ['simple', 'retiro', 'horario_entrenamiento', 'listado_alumnos', 'asistencia'];
const CAMPOS_TEMPLATE = ['titulo', 'destinatario', 'cuerpo', 'nota', 'lugarEmision', 'cierre'];

function esTipoPersonalizado(tipo) {
  return /^personalizado_[a-z0-9_-]+$/.test(tipo);
}

function normalizarTipoConstancia(tipo) {
  const value = String(tipo || 'simple').trim().toLowerCase();
  if (value === 'horario') return 'horario_entrenamiento';
  return TIPOS_CONSTANCIA.includes(value) || esTipoPersonalizado(value) ? value : '';
}

function getTemplateRequirements(template = {}) {
  const texto = CAMPOS_TEMPLATE.map((campo) => template[campo] || '').join('\n');
  return {
    alumno: /{{\s*alumno_[a-zA-Z0-9_]+\s*}}/.test(texto),
    entrenador: /{{\s*entrenador_[a-zA-Z0-9_]+\s*}}/.test(texto),
    asistencia: /{{\s*asistencia_[a-zA-Z0-9_]+\s*}}/.test(texto),
    horario: /{{\s*horario_resumen\s*}}/.test(texto)
  };
}

function normalizePersonalizados(items = []) {
  if (!Array.isArray(items)) throw new Error('Los formatos personalizados deben ser una lista.');
  const ids = new Set();
  return items.map((item) => {
    if (!item || typeof item.id !== 'string' || !esTipoPersonalizado(item.id) || ids.has(item.id)) {
      throw new Error('Identificador de formato personalizado invalido o duplicado.');
    }
    if (typeof item.nombre !== 'string' || !item.nombre.trim()) {
      throw new Error('Cada formato personalizado debe tener un nombre.');
    }
    if (!item.template || typeof item.template !== 'object' || Array.isArray(item.template)) {
      throw new Error('El formato personalizado debe incluir sus campos de texto.');
    }
    ids.add(item.id);
    const template = {};
    for (const campo of CAMPOS_TEMPLATE) {
      const value = item.template[campo] ?? '';
      if (typeof value !== 'string') throw new Error(`El campo ${campo} debe ser texto.`);
      template[campo] = value.trim();
    }
    return { id: item.id, nombre: item.nombre.trim(), template };
  });
}

module.exports = { TIPOS_CONSTANCIA, esTipoPersonalizado, normalizarTipoConstancia, normalizePersonalizados, getTemplateRequirements };
