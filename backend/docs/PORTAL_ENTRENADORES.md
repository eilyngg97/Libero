# Portal de entrenadores

## Perfiles

Una cuenta con los roles `entrenador` y `usuario` conserva ambos perfiles.
El login abre `/seleccionar-perfil` para cuentas con varios roles.
Cada seleccion llama a `POST /api/auth/select-role`, que valida los roles
del usuario y emite el token del perfil activo. No se suman sus permisos.
El menu de cuenta permite volver al selector sin cerrar la sesion.

Un entrenador con un solo rol entra directamente en `/dashboard-entrenador`.
La antigua ruta `/sin-acceso` redirige al portal. El perfil Representante
conserva el portal de sus atletas.

## Informacion y honorarios

`GET /api/entrenador` es privado y exclusivo del perfil activo `entrenador`.
Busca el documento `Entrenador` por `usuario: req.user.id` en la base del
tenant del host, sin aceptar un ID de entrenador desde el cliente.
Un entrenador no vinculado recibe 404; uno inactivo recibe 403.
Devuelve su informacion, contratos, certificaciones y pagos registrados.
El portal no permite modificar contratos, tarifas ni pagos de nomina.

## Grupos y horarios

La administracion crea o edita grupos desde Asistencias y asigna
`Entrenadores con acceso al grupo`. Esa seleccion guarda IDs de entrenadores
activos de la misma academia en `GrupoEntrenamiento.entrenadores_ids`.
Puede asignar varios entrenadores al mismo grupo.

Los nombres libres del campo `Entrenadores` se conservan para grupos e
historial, pero no conceden acceso por si solos. Los grupos antiguos sin
IDs deben asignarse desde administracion; no se migra por coincidencia de
nombres ni se modifica MongoDB automaticamente al desplegar.

## Asistencias

El portal reutiliza el modulo existente y consulta
`/api/entrenador/asistencias/*`. El servidor restringe grupos, sesiones,
listas e historial a los grupos asignados por ID y sede en el tenant.
Aplica la misma restriccion al entrenador que accede a la ruta general
de asistencias con permisos explicitos.

Puede tomar y editar asistencias propias sin permisos administrativos.
Conserva listas parciales, observaciones, historial y control de version
para evitar sobrescribir cambios concurrentes. No puede editar grupos,
integrantes ni consultar el catalogo completo de atletas.

## Constancias

La administracion marca `Constancia para entrenadores` dentro de cada
formato en Configuraciones y pulsa `Guardar configuracion de constancias`.
La marca `template.para_entrenadores` aplica a formatos predeterminados y
personalizados, y esta desactivada si no existe. No se habilitan formatos
antiguos automaticamente. Apagarla retira el formato del catalogo del
entrenador y bloquea su descarga directa en el servidor.

Los formatos marcados no pueden usar variables `alumno_*`,
`cantidad_alumnos` ni el tipo `listado_alumnos`. Configuraciones advierte
si el texto es incompatible; esos formatos no aparecen en el portal.
Las variables `entrenador_*` se completan con los datos propios de la sesion.
En retiro aislado, la marca de Carta de retiro controla el formato activo.
Sin formatos habilitados compatibles se muestra el estado vacio.

Si el formato usa variables de asistencia, el portal solicita fecha,
horas, motivo y tiempo del evento. Si usa `horario_resumen`, solicita
dias y horas de entrenamiento. La identidad no se elige en el formulario.

`POST /api/entrenador/constancias` genera el PDF con el entrenador de la
sesion, sin alumno. Rechaza IDs ajenos, formatos apagados o mixtos, perfiles inactivos
y solicitudes de constancias de atletas desde el perfil Entrenador.
Los formatos administrativos y el portal Representante conservan sus reglas.

## Despliegue

Reiniciar el backend actualizado y publicar el frontend juntos. Volver a
iniciar sesion para disponer del token correcto. Asignar los grupos y
configurar formatos de constancias segun corresponda a cada academia.
Esta implementacion no crea usuarios, asigna grupos ni registra pagos reales
durante la instalacion.