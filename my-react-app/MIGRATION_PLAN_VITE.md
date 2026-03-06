# Plan de Migracion: CRA (`react-scripts`) -> Vite

Fecha: 2026-03-06
Objetivo: reducir superficie de vulnerabilidades del toolchain legacy y mejorar tiempos de build/dev.

## Alcance
- Migrar frontend `my-react-app` de `react-scripts` a `vite`.
- Mantener comportamiento funcional existente.
- No tocar APIs backend en esta fase.

## Estrategia por fases

### Fase 1 - Preparacion
1. Congelar cambios funcionales grandes en frontend.
2. Registrar baseline actual:
   - `npm test`
   - `npm run build`
   - capturas de pantallas criticas.
3. Crear rama de migracion: `chore/migrate-cra-to-vite`.

### Fase 2 - Tooling base
1. Instalar dependencias:
   - `vite`
   - `@vitejs/plugin-react`
2. Crear `vite.config.js`.
3. Reemplazar scripts en `package.json`:
   - `start` -> `vite`
   - `build` -> `vite build`
   - `preview` -> `vite preview`
4. Mover `index.html` a raiz de `my-react-app` si aplica.
5. Asegurar `VITE_API_URL` y variables equivalentes.

### Fase 3 - Compatibilidad de codigo
1. Revisar imports de assets y rutas absolutas.
2. Sustituir `process.env.REACT_APP_*` por `import.meta.env.VITE_*`.
3. Validar polyfills requeridos en navegador (si hay).

### Fase 4 - Pruebas
1. Ejecutar pruebas unitarias (definir Vitest o mantener Jest transitorio).
2. Ejecutar smoke manual:
   - login
   - dashboard
   - alumnos
   - mensualidades
   - pagos
3. Ejecutar build de produccion y revisar tamaño de bundle.

### Fase 5 - Despliegue
1. Desplegar a staging.
2. Monitorear errores JS y tiempos de carga.
3. Si todo es estable, promover a produccion.

## Criterio de exito
- `npm run build` exitoso en Vite.
- Funcionalidad critica sin regresiones.
- Reduccion de alertas de vulnerabilidades asociadas a CRA legacy.

## Rollback de migracion frontend
- Mantener rama/tag previo a migracion.
- Revertir despliegue a build anterior de CRA en caso de incidente.

## Riesgos
- Cambios en manejo de variables de entorno.
- Diferencias en resolución de rutas.
- Ajustes menores en test runner.
