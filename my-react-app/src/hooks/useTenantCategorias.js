import { useEffect, useState } from 'react';
import { CATEGORIAS_DISPONIBLES } from '../utils/categoria';

function categoriasUnicas(categorias = []) {
  const valores = new Map();
  categorias.forEach((categoria) => {
    const etiqueta = String(categoria || '').trim();
    const clave = etiqueta.toLocaleLowerCase('es');
    if (etiqueta && !valores.has(clave)) valores.set(clave, etiqueta);
  });
  return Array.from(valores.values());
}

export function combinarCategoriasTenant(categoriasTenant = [], categoriasAdicionales = []) {
  return categoriasUnicas([...categoriasTenant, ...categoriasAdicionales]);
}

export default function useTenantCategorias() {
  const [categorias, setCategorias] = useState(CATEGORIAS_DISPONIBLES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    const cargarCategorias = async () => {
      try {
        const token = localStorage.getItem('token');
        const apiBase = (process.env.REACT_APP_API_URL || window.location.origin).replace(/\/$/, '');
        const res = await fetch(`${apiBase}/api/configuracion`, {
          signal: controller.signal,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        });
        const payload = await res.json().catch(() => ({}));
        if (!active || !res.ok) return;

        const configuradas = (Array.isArray(payload?.categorias?.reglas) ? payload.categorias.reglas : [])
          .slice()
          .sort((a, b) => (Number(a?.orden) || 0) - (Number(b?.orden) || 0))
          .map((regla) => regla?.etiqueta);
        const normalizadas = categoriasUnicas(configuradas);
        if (normalizadas.length > 0) setCategorias(normalizadas);
      } finally {
        if (active) setLoading(false);
      }
    };

    cargarCategorias().catch(() => {});
    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  return { categorias, loading };
}