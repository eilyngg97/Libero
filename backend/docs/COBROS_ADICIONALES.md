# Cobros adicionales

## Vencimiento informativo en el portal (2026-11-16)

- Si se indica vencimiento en la campana, el portal del representante muestra los dias
    de atraso junto a la fecha para los cargos con saldo pendiente. Comienza en 1 el dia
    siguiente al vencimiento, por fecha calendario de America/Caracas, no por horas transcurridas.
- Es exclusivamente informativo: no genera recargos, intereses, pagos, bloqueos ni cambios
    de importe. Sin fecha o con vencimiento futuro/hoy no se muestra atraso.
- No se muestra para pagados, No aplica (incluidos retirados), campanas canceladas o un pago
    en revision que cubra todo el saldo. Abonos, reservas parciales y campanas cerradas con
    deuda conservan el indicador sobre el saldo pendiente.
- Verificacion: 22 pruebas del listado del representante aprobadas, incluidas 17 nuevas
    sobre calendario de Caracas, ano bisiesto, cambio de ano, fecha opcional, deuda parcial
    y exclusiones. ESLint limpio en componente y pruebas. Cambio de frontend, sin escrituras
    de negocio ni cambios a la API; no requiere reiniciar el backend.

## Ajustes individuales con campana abierta (2026-11-16)

- La tabla de cargos publicados permite agregar alumnos, editar la condicion de un cargo
    y retirar alumnos. Solo administradores y superadministradores de la misma academia.
    No permite cambiar los datos generales ni recalcular masivamente una campana publicada.
- Un cargo pendiente puede cambiar de importe si conserva todo su saldo y no tiene pagos
    activos confirmados ni en revision. Pendiente por si solo no basta: un pago en revision
    reserva saldo aunque la deuda no haya cambiado. Los pagos eliminados no bloquean un ajuste,
    pero permanecen en la auditoria. Abonos, pagados, cerradas y canceladas no admiten ajustes.
- Condiciones: monto de campana, personalizado positivo de hasta dos decimales y No aplica.
    Volver a monto general usa la sede congelada del cargo, no la sede actual del alumno.
    Las altas solo admiten alumnos activos y no dados de baja de las sedes incluidas;
    congelan sus datos actuales y generan un unico cargo, sin modificar los demas.
- Retirar requiere confirmacion y conserva el cargo con `retirado=true`, condicion y estado
    `no_aplica`, importe y saldo cero. No borra el alumno ni sus registros. La fila continua
    en los conteos historicos y aparece como Retirado; puede reincorporarse editando el mismo
    cargo y escogiendo la condicion correspondiente. No se crea un segundo cargo para el alumno.
- GET `/:id/candidatos-cargos` devuelve los alumnos disponibles para agregar. POST
    `/:id/ajustes-cargos` recibe `accion` (agregar/editar/retirar), `alumno`, version de campana,
    `version_cargo` para editar/retirar, `solicitud_id` UUIDv4, condicion y nota interna.
    Solo personalizado admite `monto`. Reintentar el mismo contenido conserva el UUID;
    reutilizarlo para otro contenido o actor se rechaza.
- Transaccion obligatoria en replica set: comprueba campana abierta, versiones y pagos,
    actualiza el cargo mediante el mismo control de version que los pagos y guarda auditoria
    privada con anterior/nuevo, actor y fecha. Un fallo revierte cargo y auditoria completos.
    Ajuste contra reporte y dos ajustes simultaneos no pueden aplicar cambios incompatibles.
- `publicacion` conserva los datos originales. `totales_cargos` guarda los totales vigentes,
    leidos por API e interfaz tras los ajustes; las campanas antiguas usan la publicacion
    como respaldo hasta su primer ajuste. No requiere migracion ni modifica mensualidades,
    billetera, comprobantes o avisos. `ajustes_cargos` no se expone en listados ni al representante.
- Verificacion: 225 pruebas backend de campanas aprobadas, incluidas las escrituras reales
    exclusivas de bases Mongo QA temporales eliminadas por la suite; 55 frontend enfocadas
    aprobadas (9 nuevas de ajustes y regresiones de pagos, resumen y publicacion).
    No se ejecuto la bateria global del repositorio.
- Navegador aislado con respuestas simuladas: personalizado 12.50, retiro, reincorporacion
    general 30 y alta personalizada 18; total final 48, publicacion original 30 intacta,
    cuatro escrituras simuladas y cero errores JavaScript. Tabla y formulario medidos a
    1365/768/320 px sin desbordamiento de pagina ni controles fuera de pantalla. La captura
    integrada aparece recortada y no constituye aprobacion visual integral.
- Activacion: reiniciar manualmente el backend actualizado y recargar el frontend.
    No se reinicio el servidor, no se desplego ni se modificaron alumnos o pagos reales.

## Validacion de cierre del portal (2026-11-16)

- El usuario reinicio el backend local tras las instrucciones para arrancar con
    `ENABLE_SCHEDULED_JOBS=false`. GET `/health` respondio 200 con estado `ok` y 53 segundos
    de actividad. Esta ruta no expone la variable de tareas; su valor no se verifico por API.
- Backend: 206 pruebas de campanas aprobadas con `RUN_MONGO_CAMPANIA_TESTS=1`.
    Las escrituras reales se limitaron a bases `libero_qa_campanias_*` temporales, eliminadas
    por la suite. Incluye correccion propia, aislamiento, auditoria, reservas, confirmacion
    administrativa y descarga autenticada de comprobantes.
- Frontend: 40 pruebas enfocadas aprobadas para panel, listado y pagos individuales;
    ESLint limpio en los cuatro archivos del recorrido. No se repitio la bateria global.
- Navegador: dos sesiones aisladas, usuario y admin, con respuestas simuladas compartidas.
    Se completo reporte de 30 USD, edicion a 20, eliminacion, nuevo reporte de 30 y confirmacion
    administrativa. Resultado: saldo cero y usuario sin acciones Editar/Eliminar/Confirmar.
    Cinco escrituras simuladas, ninguna enviada a la API de negocio; sin errores JavaScript
    durante este recorrido. Registrado por conserva la etiqueta Portal usuario al confirmar.
- El aviso de reporte exige cierre explicito, tiene fondo blanco y permanece abierto ante
    Escape o clic en el fondo. Aviso e historiales de ambos portales dentro de los limites
    de pantalla a 1365, 768 y 320 px, sin desbordamiento de pagina.
- Comprobantes: imagen PNG simulada cargada y verificada con ancho natural de 420 px.
    El usuario confirmo la visualizacion del PDF en Chrome externo y aporto una captura
    con el documento renderizado. La captura no verifica por si sola la accion de cierre.
    El navegador integrado cerro la pagina tanto con el primer archivo simulado como con
    un PDF de prueba valido; esa limitacion de automatizacion sigue documentada.
    Las capturas integradas pueden alterar coordenadas; no son aprobacion visual integral.
- Sin cambios a pagos reales ni despliegue durante la validacion. La validacion del navegador
    con respuestas simuladas no equivale a una prueba UI contra la API de negocio.

## Portal del representante: consulta y pagos individuales (2026-11-16)

- Acceso Cobros adicionales desde las opciones del atleta, ruta `/campanias-alumno/:alumnoId`.
    Lista exclusivamente sus cargos publicados, con busqueda, estado, paginacion, monto, saldo,
    vencimiento, abonos e historial. En revision tiene prioridad visual; cerradas/canceladas permiten
    consultar pero no pagar. No aplica, saldo agotado y reserva completa bloquean nuevos reportes.
- GET `/api/campanias-cobro/mis-cargos?alumnoId=...` requiere rol usuario e identidad autenticada.
    La propiedad se comprueba con los modelos de la academia: usuario directo del atleta o usuario
    del representante asociado. No usa datos de propiedad enviados por el cliente; excluye borradores,
    notas internas, condiciones de otros atletas y auditoria de publicacion.
- Historial y registro reutilizan GET/POST `/:id/cargos/:cargoId/pagos`. El servidor comprueba la
    propiedad del atleta del cargo, tambien dentro de la transaccion de registro. El representante
    solo puede enviar estado `en_revision`; intentar confirmar se rechaza, no se acepta silenciosamente.
    Confirmar sigue siendo una operacion administrativa. PATCH/DELETE
    `/:id/cargos/:cargoId/pagos/:pagoId` permiten corregir o eliminar exclusivamente el ultimo pago
    activo registrado por el mismo usuario, en estado `en_revision` y con campana abierta.
    Se comprueban propiedad del atleta, autor del pago, estado y version dentro de la transaccion;
    no basta con tener acceso al atleta. Pagos de otro usuario o de administracion no son editables.
    No se incorpora pago agrupado ni billetera en esta entrega.
- El formulario existente `ModalPago` mantiene metodos, cuentas, tasas historicas, referencia,
    comprobante y abonos segun el cargo. En modo representante no muestra Pago confirmado ni acciones
    de confirmacion. Muestra Editar/Eliminar solo para el ultimo reporte propio autorizado mediante
    `puede_corregir`, sin exponer IDs de actores. Mantiene bloqueo de cierre durante el envio y UUID para reintentos. Reportar
    reserva el importe sin reducir deuda; solo la confirmacion administrativa cambia saldo y estado.
    Corregir un reporte ajusta su reserva, no la deuda; eliminar es logico y libera la reserva.
    Ambas operaciones conservan auditoria interna e idempotencia. Confirmado el pago, el usuario
    ya no puede corregirlo, incluso si tenia el formulario abierto. Requiere activar el backend actualizado.
- `PagoCampania.registrado_por` admite rol usuario y conserva su identidad para auditoria interna.
    Las respuestas al portal omiten notas internas, huellas, modificaciones e identidades de actores;
    el historial conserva metodo, importes, fecha, referencia, titular, nota y estado de cada pago.
- Los comprobantes nuevos de campanas se guardan en `backend/private-uploads/campanias/<tenant>/`,
    fuera del directorio estatico e ignorados por Git. Incluir esta carpeta en los respaldos operativos.
    GET `/:id/cargos/:cargoId/pagos/:pagoId/comprobante` exige sesion, rol y propiedad, valida tenant,
    cargo y pago activo antes de leer el archivo, y responde sin cache. El dialogo usa esa ruta tanto
    para archivos nuevos como antiguos. No se migran los archivos anteriores de `uploads`: conservan
    su ubicacion y politica estatica previa; moverlos/restringir sus URLs antiguas requiere otra tarea.
- Verificacion: 199 pruebas backend de campanas pasan con Mongo QA temporal, incluido reporte,
    reserva, idempotencia, descarga propia/ajena, tenant, confirmacion administrativa y campana cerrada.
    Frontend: 22 pruebas enfocadas de pagos/listado y una adicional de campana cancelada; 54 pruebas
    de rutas, PagosAlumno y SolicitudUniforme pasan. Los filtros y el bloqueo por reserva se repitieron
    tras el ajuste final. ESLint limpio; compilacion aprobada con advertencias previas de otros modulos.
- Navegador aislado con API simulada: un reporte de 30 USD genera una sola solicitud en revision,
    mantiene la deuda y bloquea otro reporte al reservar todo el disponible. Historial sin controles
    administrativos; sin errores JavaScript. Geometria de listado y dialogo comprobada a 1365/768/320 px,
    sin desbordamiento de pagina. Capturas integradas recortadas: no son aprobacion visual integral.
    El contexto QA se cerro al terminar; la navegacion reutiliza el boton Volver global.
- Activacion requiere backend y frontend actualizados en conjunto; no se reiniciaron servicios,
    desplegaron cambios ni registraron pagos reales. La comprobacion real se hizo solo en bases QA
    temporales eliminadas al finalizar. Sin nuevo commit ni push en esta entrega.

## Validacion posterior al commit (2026-11-16)

- Bateria frontend completa: 20 suites aprobadas y una fallida; 376 pruebas aprobadas y tres
    timeouts de 20 segundos en CobrosAdicionales (379 pruebas, 947 segundos en total).
    Los casos afectados cubren guardar/reabrir montos por sede y dos recorridos de limpiar filtros
    de participantes. No reportaron diferencias en aserciones; agotaron el tiempo de ejecucion.
- Reejecucion aislada de esos tres casos, conservando el limite de 20 segundos: los tres pasan
    (25 segundos en total). Esto apunta a lentitud durante la bateria global; no se declara que la
    ejecucion completa haya pasado. No se modificaron pruebas ni codigo de produccion para ocultarlo.
- Informes JSON conservados fuera del repositorio, en el directorio temporal del usuario:
    `libero-frontend-validacion-20261116.json` y `libero-frontend-reintento-20261116.json`.
- Sin reinicio de servicios, despliegue ni pagos reales. La comprobacion funcional con backend
    actualizado sigue pendiente de activacion manual y debe realizarse con datos de prueba aislados.

## Validacion previa al commit (2026-11-16)

- Backend completo: 757 pruebas aprobadas, 63 omitidas y un fallo; las 194 de campanas pasan,
    incluidas las pruebas Mongo en bases QA temporales. El fallo de conciliacion de pagos agrupados
    espera 200 en previsualizacion y recibe 500; se reprodujo tambien con las fuentes del commit
    anterior `54460ec` cargadas solo en memoria. No se modifico ese comportamiento ajeno a esta entrega.
- Frontend: las suites observadas, incluida Mensualidades completa, pasan; no se conserva un resultado
    final verificable de la bateria global. Su repeticion se cancelo antes de completar la validacion.
    No se declara aprobada la bateria frontend completa.
- ESLint de los ocho archivos frontend de esta entrega y revision de espacios pasan.
    Compilacion de produccion aprobada con advertencias previas de EntrenadorDetalleView,
    GeneralConfig, Browserslist y tamano del bundle.
- Sin push, despliegue, reinicio del backend ni pagos reales. La activacion de rutas/modelos sigue
    requiriendo reinicio manual. Las verificaciones de las secciones siguientes son historicas.

## Ampliacion 4B: ficha de transaccion y correcciones administrativas

- El historial reutiliza `PagoTransaccionDetalle`, el marco visual extraido de Mensualidades,
    conservando el formulario y las acciones existentes de ese modulo. La ficha de campanas muestra
    metodo, importe/divisa, Bs y equivalente esperado, fecha, tasa historica, referencia, telefono,
    cedula, actor de registro, nota y comprobante. El icono de detalle permite consultar cada pago anterior.
- Encabezado, check circular, Editar/Cancelar y Guardar cambios mantienen los estilos de Mensualidades.
    El equivalente en la moneda del cargo aparece debajo de Monto pagado y Monto esperado.
    El historial usa filas blancas con borde azul, icono y contador, con monto, tasa, referencia/titular,
    nota, estado y acciones. No repite el nombre, campana o totales sobre la ficha; se cierra con la X.
    Confirmar aparece en el pie si el pago visible esta en revision y la campana abierta, bloqueado al
    editar; usa el dialogo de confirmacion con el mismo estilo de Mensualidades.
- Los cargos publicados admiten filtro por estado, junto con busqueda y condicion. En revision tiene
    prioridad sobre el estado financiero tanto en el chip como en el filtro; cambiar filtros vuelve a
    la primera pagina. Registrar pago usa el mismo icono `Paid` de la tabla de Mensualidades.
- Avance de cobros: barra de cargos completamente pagados, conteos excluyentes de pagados/pendientes/
    en revision/con abono y cantidad total que falta por completar. No aplica queda fuera del porcentaje;
    sin cargos exigibles muestra porcentaje cero. Se calcula sobre toda la campana, sin cambiar al filtrar.
- Editar y eliminar se habilitan exclusivamente para el ultimo pago activo de una campana abierta,
    solo admin/super_admin. Los anteriores son de solo lectura; el backend impone la misma restriccion.
    Editar se hace dentro de la ficha, reutilizando los metodos configurados de `ModalPago` y el
    servicio de tasa historica. No permite cambiar moneda o estado de confirmacion, ni ajustar manualmente
    la tasa oficial. Conserva el comprobante anterior salvo reemplazo validado; cerrar pide descartar cambios.
- PATCH `/:id/cargos/:cargoId/pagos/:pagoId` recibe los campos de registro, version actual y una UUID nueva
    por correccion; admite comprobante multipart con los mismos limites y validaciones del registro.
    DELETE en esa ruta recibe `{ version }`, requiere confirmacion de interfaz y marca `eliminado`:
    el documento, sus actores y sus correcciones se conservan para auditoria, pero sale del historial activo.
- Cada correccion guarda snapshot anterior, fecha y administrador, sin exponer huellas en las respuestas.
    Reintentar la misma UUID no modifica dos veces; otra carga con esa UUID o una correccion posterior
    produce conflicto. El registro original corregido/eliminado no puede recrearse al reintentar su UUID.
- Pago y saldo/version se actualizan juntos en transaccion obligatoria. Editar un confirmado repone
    su importe anterior y aplica el nuevo; eliminarlo repone su importe. En revision solo cambia/libera
    la reserva. Se verifican suma confirmada, reservas, centimos, abonos, version, tenant y campana abierta.
    El monto y los datos originales del cargo no cambian; no se mezclan con mensualidades ni uniformes.
- Verificacion backend: 194 pruebas completas pasan, incluidas siete nuevas de correcciones Mongo
    en bases QA temporales eliminadas al finalizar: auditoria, reservas, saldo, roles/tenant, version,
    ultimo pago, pago completo, cierre, concurrencia, comprobantes y rollback.
- Activacion de estas rutas/modelos requiere reinicio manual del backend; no se reinicio automaticamente
    por los trabajos de arranque. Sin pagos reales, despliegue, commit o push.

## Entrega 4B: pagos individuales administrativos reutilizados

- Desde los cargos publicados, Registrar pago abre el mismo `ModalPago` usado por alumnos y uniformes.
    Conserva seleccion de metodo, datos bancarios, fecha, referencia, comprobante y confirmacion.
    La opcion de abono depende de la campana, no de las cuotas de mensualidad ni del esquema 50/50 de uniformes.
    La etiqueta del pago completo se adapta al concepto sin cambiar los otros flujos.
- El administrador marca explicitamente Pago confirmado; sin marcarlo, el registro queda en revision.
    Solo los pagos confirmados reducen deuda. Los pagos en revision reservan su importe para impedir
    reportes que superen el saldo, sin mostrarlos como recaudo confirmado ni marcar el cargo pagado.
    Historial conserva el estado de cada pago y permite confirmar y ver comprobantes;
    la API devuelve por separado confirmado, en revision, saldo pendiente y disponible para validar la operacion.
    La consulta de cargos incluye `pago_en_revision`: Estado muestra En revision cuando existe un pago
    por verificar, aunque la deuda siga pendiente. Al confirmar, muestra Abono o Pagado segun el saldo.
- GET/POST `/api/campanias-cobro/:id/cargos/:cargoId/pagos` consulta historial o registra un pago.
    POST `/:id/cargos/:cargoId/pagos/:pagoId/confirmar` confirma el importe existente, sin editarlo.
    Todas las rutas requieren admin/super_admin y usan exclusivamente modelos de la academia solicitada.
- `PagoCampania` guarda moneda, importes, fecha, metodo, referencia, titular, nota, comprobante,
    estado y actores de registro/confirmacion. Indice unico cargo/solicitud_id y huella del formulario/archivo:
    el mismo reintento devuelve el registro existente; reutilizar la clave con otros datos devuelve 409.
    El frontend mantiene la clave en reintentos y verifica el resultado antes de actualizar la vista.
- Registro y confirmacion requieren transacciones Mongo; pago y saldo/version del cargo cambian juntos.
    Version compartida y reserva de importes serializan los registros concurrentes. Confirmar de nuevo
    no descuenta dos veces. No aplica, saldo agotado, sobrepago y abonos no autorizados quedan bloqueados.
    Nombre, sede, categoria, modalidad e importe del cargo publicado no se recalculan.
- Pago movil/Transferencia verifican el equivalente con la tasa oficial de la fecha (USD o EUR).
    Zelle, PayPal y Binance requieren una cuenta habilitada y moneda compatible, sin inventar bolivares.
    Se usan cuentas generales por defecto, con el concepto campanias; nunca cuentas por campana individual.
- Comprobante opcional JPG/PNG/WebP/PDF, maximo 5 MB, extension/MIME/firma verificados, ruta privada por
    academia y nombre UUID. Un fallo revierte la operacion y limpia el archivo nuevo; un reintento no lo duplica.
- Verificacion: 187 pruebas backend completas (16 nuevas de pagos, con Mongo temporal aislado),
    26 pruebas enfocadas de resumen/publicacion/pagos (6 nuevas UI) y 53 de alumnos/uniformes pasan.
    Lint y diagnosticos limpios, con avisos previos de Browserslist. Navegador aislado con APIs mock:
    abono 10 en revision -> confirmacion -> pago completo de 20, saldo final 0, tres solicitudes, sin errores;
    dialogo dentro de viewport 1365/768/320. Capturas integradas recortadas, no aprobacion visual integral.
- Esta etapa es administrativa. Portal del representante, pagos agrupados de campanas, billetera,
    avisos y cambios masivos quedan fuera. Edicion/eliminacion se incorporaron en la ampliacion anterior.
    No se registraron pagos reales,
    no se reinicio el backend, no se desplego ni se hizo commit. Reinicio manual pendiente para activar rutas/modelos.

## Entrega 4A: publicacion y cargos

- Publicar campana desde el resumen, tanto en el flujo guiado como en el acceso del listado.
    Confirmacion con total global, cantidad de cargos pendientes y participantes No aplica; Cancelar
    enfocado. Guardar borrador sigue disponible. El resumen requiere participantes y ninguna observacion pendiente.
- `GET /api/campanias-cobro/:id/resumen` agrega `revision`, una huella SHA-256 de version, filas y totales.
    `POST /api/campanias-cobro/:id/publicar` recibe solo `{ version, revision, solicitud_id }`, UUID v4.
    Recalcula en servidor y rechaza version, moneda, participantes, tarifas o huella que hayan cambiado.
- Solo admin/super_admin del mismo tenant, con identidad de administrador en el token. Publicacion
    obligatoriamente transaccional: si Mongo no soporta transacciones, devuelve 503 sin publicar.
    No hay fallback standalone ni escrituras parciales. CargoCampania inicializa su indice antes de operar.
- Una transaccion cambia borrador a abierta, incrementa la version, registra fecha/actor/huella/solicitud
    y totales, e inserta un CargoCampania por participante. Indice unico `(campania, alumno)` por tenant.
    La misma solicitud confirmada devuelve 200 sin repetir cargos; una primera publicacion devuelve 201.
    Otra solicitud sobre una campana publicada devuelve 409. Un error permite reintentar la misma clave.
- Cargo independiente de mensualidades/uniformes: alumno, sede y nombre congelados, modalidad, moneda,
    importe original, saldo pendiente, vencimiento y abonos. Personalizados conservan acuerdos; No aplica
    conserva una fila con importe/saldo cero y estado no_aplica, sin deuda. Los otros quedan pendientes.
    Las notas internas son privadas y solo aparecen en las consultas administrativas correspondientes.
- `GET /api/campanias-cobro/:id/cargos`: consulta administrativa de snapshots, con filas y totales
    compatibles con el detalle del resumen; verifica cantidad, suma y moneda antes de mostrar resultados.
    Ver cargos publicados en el listado. Tras publicar no se ofrece Editar, Eliminar ni Participantes.
    Cambiar de sede, dar de baja o editar al atleta no recalcula ni elimina sus cargos publicados.
- No registra ni confirma pagos, no consume credito, no toca billetera ni mensualidades/uniformes,
    no envia avisos. Cambios masivos, cierre/cancelacion/reapertura y auditoria de ediciones siguen pendientes.
- Validacion: 171 pruebas backend, incluidas 23 nuevas API y 4 Mongo reales temporales (commit, rollback
    tras insertar primer cargo, concurrencia con claves iguales/distintas, reintentos y aislamiento).
    Las 82 pruebas UI completas pasan; nueve regresiones nuevas cubren confirmacion, doble envio,
    reintentos, incoherencia y consulta de cargos. Lint limpio (aviso previo de Browserslist).
- Activacion: reiniciar manualmente backend actualizado; Mongo debe estar en replica set. No se reinicio
    el proceso activo, no se desplego y no se publicaron campanas ni cargos en bases de negocio reales.

## Creacion paso a paso

- Crear campana ofrece Datos -> Participantes -> Resumen en el mismo recorrido, con indicador gris
    de tres pasos y Guardar borrador como alternativa. La publicacion efectiva se incorpora en la entrega 4A.
- El recorrido mantiene una sola ventana y un solo fondo, con dimensiones estables, al continuar
    o volver. Solo cambia el contenido del paso: no repite la animacion de apertura ni parpadea el fondo.
    Escape y el clic fuera delegan al paso actual, conservando sus bloqueos y confirmaciones de descarte.
- Continuar en Datos guarda y verifica el borrador antes de abrir Participantes. Se crea una sola
    campana; al volver a Datos se edita con PATCH y la version actual, sin repetir el POST.
- Ver resumen guarda seleccion y condiciones individuales si cambiaron; solo una respuesta
    verificada permite avanzar. Sin cambios, consulta el resumen directamente sin otro PUT.
- Volver a datos guarda primero los cambios de participantes. Volver a participantes desde
    Resumen recupera la seleccion y los acuerdos persistidos. El resumen siempre hace un GET fresco.
- Guardar borrador en Datos o Participantes guarda y vuelve al listado. En Resumen finaliza
    el recorrido sin otra escritura, porque los pasos anteriores ya quedaron guardados.
- Errores de carga/guardado bloquean el avance y conservan los cambios locales; los cierres
    mantienen las confirmaciones de descarte existentes. Lo guardado no se elimina al salir del recorrido.
- Los accesos individuales Editar, Participantes y Resumen del listado conservan su comportamiento.
    El recorrido no publica automaticamente: requiere confirmar Publicar campana en el resumen.
- Nueve regresiones nuevas cubren recorrido sin cambios, personalizados/No aplica, salida como
    borrador, regreso/versiones, errores/reintentos, respuestas incoherentes, carga fallida y seleccion vacia.
    La correccion del parpadeo agrega la identidad de la ventana al volver/avanzar y una decima
    prueba de Escape/descarte sin borrar lo persistido. Los accesos independientes conservan sus dialogos.

## Eliminar borradores

- Papelera en Acciones solo para borradores con version disponible, con tooltip Eliminar campana.
- Confirmacion con los estilos del modulo: cabecera navy, acento magenta, nombre de campana,
    advertencia de borrado permanente y botones Cancelar/Eliminar campana. Cancelar recibe el foco inicial.
- `DELETE /api/campanias-cobro/:id`: solo admin/super_admin de la misma academia; recibe `{ version }`.
    Elimina atomicamente solo si `_id`, estado borrador y `__v` coinciden. Otra version o estado devuelve
    409; campana inexistente o de otra academia devuelve 404. No elimina atletas ni registros financieros.
- Durante la solicitud se bloquean el doble envio y los cierres. Un error conserva la fila y el dialogo;
    solo una respuesta verificada retira la fila y muestra la confirmacion flotante.
- Reinicio manual del backend necesario para activar la ruta. No se reinicio ni se eliminaron datos reales.

## Entrega 3C: resumen previo a publicar

- Icono Resumen previo a publicar en Acciones de borradores, con columnas fijas para conservar
    la alineacion de los iconos. Modal navy/magenta, detalle administrativo y acciones Cerrar/Revisar participantes.
- La fila superior muestra Participantes, Total a recaudar (importe monetario), Personalizados y No aplica.
    No muestra un contador Con tarifa de campana ni duplica el total en un bloque inferior.
- `GET /api/campanias-cobro/:id/resumen`, solo admin/super_admin del tenant y solo borradores;
    `Cache-Control: no-store`. Calcula desde la seleccion y condiciones persistidas, no desde cambios sin guardar.
- Respuesta con version y datos de campana, `filas` y `totales`: participantes, generales,
    personalizados, no_aplica, pendientes, con_observaciones, subtotal_calculado y total_esperado.
- General usa el monto unico o el de la sede actual; personalizado conserva su acuerdo; No aplica
    permanece en el detalle con importe cero. La suma se realiza en centimos, sobre todos los participantes.
- Un atleta inactivo, trasladado o eliminado conserva su fila y recibe observaciones. Una tarifa
    faltante tiene `monto: null`, nunca cero: el total esperado queda pendiente y se muestra el subtotal calculable.
    Las observaciones de actividad no eliminan automaticamente importes validos ni participantes.
- Detalle con atleta, sede, condicion, importe, notas internas e incidencias. Las notas solo son
    visibles en esta consulta administrativa; no se exponen datos de contacto, importes de mensualidad o salud.
- Busqueda y filtro por condicion/importe pendiente y paginacion afectan solo el detalle,
    nunca los totales globales. Recalcular vuelve a consultar el borrador y evita conservar un resumen obsoleto.
    Una respuesta con filas incompletas o total incoherente no se presenta como un resumen valido.
- Revisar participantes abre el selector para corregir condiciones; no guarda ni publica.
    No existe boton Publicar en esta entrega. No cambia versiones, acuerdos, atletas ni documentos financieros.
- Verificado en Mongo temporal: total 42.50 con general 30, personalizado 12.50 y No aplica;
    aislamiento de tenant, documentos antes/despues iguales y traslado sin tarifa con total pendiente.
- Navegador aislado con API simulada: total global invariable al filtrar/paginar, recarga con nuevos
    importes y regreso a Participantes sin escrituras. 1365/768/440/320, sin overflow del modal y pie visible;
    tabla con desplazamiento horizontal propio en movil. Capturas generadas, con la limitacion indicada mas abajo.
- Se requiere reiniciar manualmente el backend para activar la nueva ruta. No se reinicio,
    no se publicaron campanas, no se generaron cargos ni avisos y no hubo datos reales modificados.
    Publicacion efectiva, historial y flujo de cobros siguen pendientes.

## Entrega 3B: condiciones individuales en borradores

- Cada atleta seleccionado tiene un icono Condiciones individuales que despliega su editor;
    conserva el diseno compacto navy/magenta del modulo, con una sola seccion abierta a la vez.
- Monto de campana usa el importe general o el de la sede actual del atleta; no copia ese valor
    como una excepcion. Monto personalizado exige un importe positivo de hasta dos decimales
    en la moneda de la campana. El tipo de mensualidad del atleta no decide este acuerdo.
- No aplica conserva al atleta seleccionado y no guarda un importe personalizado. No es una baja
    ni elimina al participante. Volver a Monto de campana retira la excepcion economica.
- Nota interna opcional de hasta 1000 caracteres, solo para administracion. Una nota puede acompanar
    cualquiera de las tres modalidades; sin nota ni excepcion no se guarda una condicion por defecto.
- Persistencia en `condiciones_participantes: [{ alumno, modalidad, monto?, nota_interna }]`,
    oculta por defecto en el esquema. Solo GET/PUT administrativos de Participantes incluyen el campo;
    el resumen administrativo muestra las notas en sus filas.
    El listado y las respuestas de crear/editar datos generales no exponen notas ni condiciones.
- `PUT /api/campanias-cobro/:id/participantes` admite condiciones opcionales junto con IDs y version.
    Seleccion, acuerdos y version se guardan atomicamente. Si se omiten condiciones, conserva las de los
    participantes que siguen seleccionados; una lista explicita las reemplaza. Retirar un atleta elimina
    su condicion al guardar. IDs duplicados, ajenos a la seleccion o importes/notas invalidos se rechazan.
- Modificar el monto general del borrador no sobreescribe los acuerdos personalizados. Cambios de
    filtros o pagina tampoco los pierden. Cancelar con cambios pide confirmar su descarte; una respuesta
    de guardado que omite o altera los acuerdos conserva el formulario y muestra un error de verificacion.
- Comprobado guardar y reabrir personalizado con nota y No aplica en navegador aislado con API simulada.
    Editor abierto verificado a 1365/768/440/320: sin overflow, campos dentro del modal y guardar visible;
    capturas generadas, con la limitacion de encuadre del navegador integrado indicada mas abajo.
- Esta entrega no publica, no genera cargos, no modifica mensualidades, no registra pagos ni consume
    billetera; tampoco envia avisos. El resumen previo a publicar se incorpora en la entrega 3C.
- Backend no reiniciado automaticamente. Reinicio manual necesario para cargar el esquema y contrato
    actualizados; no hubo escrituras sobre datos reales, commit ni despliegue durante la verificacion.

## Entrega 3A: selector manual de participantes

- Acceso Participantes con contador por borrador desde el listado, solo admin/super_admin.
- Modal con los estilos del modulo: cabecera navy y acento magenta, fuentes heredadas,
    etiquetas superiores, campos compactos, selector de vistas gris/blanco y acciones fijas.
- Foto o iniciales, nombre, categoria, sede, representante y fecha de inscripcion solo informativa.
- Busqueda por atleta o representante sin depender de acentos; filtros de sede/categoria,
    vistas Todos/Seleccionados y paginacion. Seleccionar pagina solo afecta los atletas visibles.
- Filtro Tipo de mensualidad: monto sede, media beca (50%), monto personalizado y beca completa;
    solo consulta el tipo, nunca los importes individuales. Inscripcion desde/hasta usa dias UTC inclusivos,
    admite un unico limite y valida el orden del rango. Sin limites mantiene atletas sin fecha;
    con limites excluye fechas ausentes o invalidas. Los filtros se combinan sin cambiar la seleccion.
- Al crear una campana se incorporan los atletas activos actuales de sus sedes, sin limite por pagina.
    Al editar se incorporan solo los de las sedes nuevas; no se reponen exclusiones de sedes anteriores.
    La incorporacion y los datos del borrador se guardan juntos, con un maximo de 10000 participantes.
- Participantes permite retirar las excepciones y guardar la seleccion. Cambiar filtros o pagina
    no incorpora ni borra atletas. Editar nombre, monto u otros datos conserva las excepciones.
- No se incorporan altas posteriores en segundo plano ni al editar una sede ya incluida.
    No se alteran retroactivamente las selecciones de campanas existentes. Quitar una sede no elimina
    participantes ya guardados; su retirada sigue siendo explicita desde Participantes.
- `GET /api/campanias-cobro/:id/participantes`: borrador y catalogo de la misma base tenant,
    atletas activos de sus sedes mas seleccionados anteriores. Proyecta solo datos necesarios;
    del representante solo nombres/apellidos, no documentos, telefono ni direccion.
- `PUT /api/campanias-cobro/:id/participantes`: acepta `participantes: [id]`
    y `version`, mas las condiciones opcionales de la entrega 3B. Valida IDs unicos, academia,
    sedes y actividad de las incorporaciones nuevas.
- Seleccion anterior conservada si el atleta cambia de sede, pasa a inactivo o desaparece.
    Se marca No disponible; solo la retirada manual lo elimina de la seleccion. Es posible guardar
    una seleccion vacia para retirar a todos. Las fechas nunca deciden inclusiones.
- Persistencia en `CampaniaCobro.participantes`, compatible con borradores anteriores sin el campo.
    Guardado atomico con estado borrador y `__v` compartida con la edicion de datos generales;
    un conflicto no sobrescribe cambios. No modifica Alumnos ni modelos financieros.
- Cancelar con cambios pide confirmacion. Error de carga, vacio y error de guardado diferenciados;
    aborta consultas al salir y valida que la respuesta devuelva exactamente la seleccion guardada.
- Confirmacion flotante existente, blanca/magenta, con nombre de campana y cierre manual/automatico.
- La seleccion inicial se completa con las condiciones individuales de la entrega 3B.
    No publica, no genera deuda, no registra pagos, no consume billetera y no envia avisos.
- Reinicio manual de backend necesario para cargar las dos rutas y el esquema nuevo.
    No se reinicio automaticamente por los trabajos de arranque; no hubo commit ni despliegue.

### Verificacion de participantes

- 144 pruebas backend de campanas aprobadas, incluidas pruebas Mongo reales en bases temporales
    `libero_qa_campanias_*` eliminadas al finalizar: persistencia, aislamiento, privacidad,
    rechazos, concurrencia con edicion de metadata y conservacion/retiro de atletas no disponibles.
    Incluyen incorporacion de 75 atletas, aislamiento de academia, rechazo de inactivos/bajas,
    sedes nuevas, deduplicacion, limite y conservacion de excepciones al editar o reintentar crear.
    La eliminacion cubre permisos, validacion, aislamiento, versiones, estados, reintentos y errores.
    Las condiciones cubren importes/notas invalidos, privacidad, defaults y conservacion de acuerdos
    al editar el monto general, sin crear documentos financieros.
    El resumen agrega 13 pruebas unitarias/API y una de Mongo: centimos, tarifas faltantes, estados,
    excepciones, seleccion no disponible, aislamiento y consulta sin modificar documentos.
- Frontend: 25 pruebas de participantes aprobadas, incluidas 8 nuevas de condiciones; filtros,
    paginas, seleccion visible, recarga, descarte, doble envio, conflicto, abortado, vacio,
    retirada total y rechazo de respuesta de guardado obsoleta/incompleta.
    Incluyen tipos de mensualidad, fechas inclusivas/abiertas/invalidas, seleccion oculta conservada,
    defaults por sede, personalizado con nota, No aplica, recarga, retorno al monto de campana,
    validaciones, descarte, retirada de excepcion y respuesta de guardado que pierde el acuerdo.
    Suite frontend completa aprobada: 61 pruebas, incluyendo las 27 del listado/edicion/eliminacion
    y 9 del resumen (solo lectura, filtros, total global, paginacion, recarga, errores, coherencia y vacio).
- Regresiones backend de la entrega inicial de participantes: 253 pruebas aprobadas en campaniasCobro,
    monthlyCredit y pagoAgrupadoEdicion. Compilacion frontend aprobada en esa entrega;
    advertencias previas en otros componentes y bundle.
- Navegador aislado con respuestas simuladas: 1365/1024/768/600/440/320, sin desbordamiento
    horizontal ni controles fuera del modal; acciones visibles y cuerpo sin solapar el pie.
    Seleccion en dos paginas, conservar/retirar anterior, guardar y recargar comprobados.
- Capturas integradas con viewport/encuadre alterado: no constituyen aprobacion visual integral.
    Contexto de prueba cerrado, sin datos de negocio reales modificados.
- Comprobacion adicional de eliminacion en navegador aislado con API simulada: 1365/768/440/320,
    dialogo y botones dentro del viewport, sin overflow; cancelar no envia DELETE y confirmar envia uno.
    Filtros de mensualidad y dos fechas presentes sin overflow en movil. Contexto cerrado al finalizar.

## Entrega 2: crear y editar borradores

- Boton Crear campana y accion Editar borrador desde el listado, solo admin/super_admin.
- Formulario responsive con nombre, descripcion publica, modalidad de monto, moneda de la academia,
    seleccion multiple de sedes, fecha calendario opcional y abonos individuales por campana.
- Modalidades Monto unico y Monto por sede: esta ultima exige un importe explicito por cada sede
    seleccionada. No se copian ni convierten importes al cambiar de modalidad.
- El listado muestra cada sede y su importe, nunca una suma presentada como monto general.
- Contrato: `modalidad_monto: unico` guarda `monto_general` y `montos_por_sede: []`;
    `por_sede` guarda `monto_general: null` y `montos_por_sede: [{ sede, monto }]`.
    Sin modalidad se interpreta unico para compatibilidad con los borradores anteriores; no requiere migracion.
- Solo se envian importes de sedes seleccionadas y de la modalidad activa. Una sede nueva requiere su monto.
    El backend rechaza importes ausentes, repetidos o de sedes ajenas, incluso en reintentos con UUID.
- Guardar incorpora participantes segun las sedes, pero no publica, no genera cargos y no envia avisos.
- Actualizacion local del listado desde la respuesta persistida y consulta sin cache al volver a entrar.
    No hay boton Actualizar; Reintentar aparece solo ante un error de carga.
- Cancelar con cambios pide confirmacion; un error de guardado conserva el formulario.
- Formulario ajustado a la referencia visual proporcionada: cabecera navy APEX y acento rosa,
    tres bandas con numeracion y titulos laterales a la izquierda y campos a la derecha en escritorio;
    bloques apilados en movil. Etiquetas superiores, bordes neutros y campos compactos.
- Sedes antes de importes, moneda integrada en cada monto y en el lateral, seleccion multiple con
    casillas/chips, filas por sede y selector gris con opcion activa blanca. Abonos con interruptor.
- Pie fijo ligero con etiqueta Borrador y acciones; cierre accesible con confirmacion si hay cambios.
    Una validacion fallida enfoca y desplaza al primer campo invalido. Rediseño solo de interfaz.
- `GET /api/campanias-cobro/opciones`: sedes y moneda de la misma base tenant.
- `POST /api/campanias-cobro`: validacion estricta y estado borrador forzado en servidor.
- `PATCH /api/campanias-cobro/:id`: solo borradores, compara `version` contra `__v`
    y actualiza atomica y conjuntamente los campos y la version.
- Una UUID v4 `solicitud_id` por creacion permite reintentar sin duplicar; indice unico sparse
    por base tenant. Reutilizar la clave con otros datos produce conflicto, no una nueva campana.
- No se aceptan campos de estado, pagos, identidad o tenant enviados por el cliente.
- Monto positivo de hasta dos decimales; fechas reales, no instantes ni fechas normalizadas invalidas;
    sedes existentes sin duplicados. Moneda leida de TenantConfig, USD por defecto segun configuracion actual.
- Si cambia la moneda de la academia no se realiza conversion silenciosa de un borrador anterior.
- Se conserva el actor de la ultima modificacion; la auditoria de cambios publicados pertenece a la entrega 4.
- No se modifica la logica ni los componentes actuales de pagos; se reutilizaran al incorporar ese flujo.
- Reiniciar manualmente el backend para cargar el modelo y controlador actualizados antes de probar
    el guardado. No se reinicia automaticamente para evitar ejecutar trabajos de arranque.

## Entrega 1: listado administrativo

- Ruta del portal: `/cobros-adicionales`.
- API: `GET /api/campanias-cobro`, privada, solo admin y super_admin.
- Modelo independiente `CampaniaCobro`, registrado en la conexion de negocio de cada tenant.
- Listado ordenado por creacion, busqueda por nombre/descripcion, filtros por sede/estado y paginacion de interfaz.
- Carga, error con reintento y lista vacia diferenciados. Cancelacion de consultas al salir.
- Sin datos de demostracion, indicadores financieros ficticios ni botones de acciones pendientes.
- La primera entrega no incluia creacion de campanas, asignaciones, cargos, pagos, creditos ni notificaciones.
- No altera mensualidades, uniformes, conciliacion o billetera.
- El backend debe reiniciarse para cargar la ruta nueva; no se reinicio ni se desplego durante esta entrega.

## Reglas acordadas para las siguientes entregas

- Campanas para reinscripcion, viajes, torneos y otros cobros, separadas de mensualidades y uniformes.
- Nombre, descripcion publica, monto general unico o por sede, moneda vigente de academia, sedes, vencimiento opcional y abonos configurados por campana.
- Una o varias sedes del mismo tenant. Vencimiento sin recargo.
- Participantes manuales con foto, nombre, categoria, sede, representante y fecha de inscripcion solo informativa.
- Monto general, personalizado o No aplica; motivos y notas de acuerdos solo para administracion.
- El cambio de sede de un atleta no modifica automaticamente un cargo ya asignado (implementado en 4A).
- Altas nuevas no se incluyen automaticamente. Bajas conservan cargos anteriores.
- Edicion flexible con alcance explicito, vista previa e historial; preservar acuerdos personalizados salvo seleccion expresa.
- Cambios economicos no modifican transferencias originales ni duplican excedentes.
- Cierre impide nuevas asignaciones, permite cobros y revision; reapertura explicita.
- Cancelar no elimina dinero: resolver traslado a billetera o registro de devolucion.
- Reutilizar ModalPago y componentes existentes apropiados; no crear un flujo de pagos paralelo.
- Abonos individuales si la campana los permite; agrupados siempre cubren saldos completos seleccionados.
- Agrupados pueden incluir varias campanas y atletas del mismo representante; nunca mensualidades o uniformes en la misma operacion.
- Cada pago tiene estado propio, independiente de la deuda. Confirmado, en revision y pendiente sin cubrir se muestran separados.
- Reportes del representante quedan en revision. Registro administrativo explicita si confirma o deja en revision.
- Conciliacion incorpora Cobros adicionales y filtro por campana.
- Cuentas generales por defecto o especificas del modulo; nunca por campana.
- Saldo individual por atleta, sin transferir entre hermanos. En campanas solo usar saldo confirmado.
- Elegir destino del saldo entre mensualidades o campanas, sugiriendo deuda antigua; conservar origen y evitar doble consumo.
- Excedentes confirmados por reduccion o No aplica se acreditan una sola vez.
- Aumento posterior genera diferencia pendiente, sin retirar silenciosamente saldo ya gastado.
- Avisos dentro del portal: novedades marcables como leidas y pendientes visibles; sin correo o WhatsApp automatico en esta etapa.

## Secuencia de revision

1. Listado administrativo de lectura (completado).
2. Crear y editar borradores: validacion de monto, moneda, sedes y fecha calendario, sin publicar ni generar deuda (completado).
3. Participantes: seleccion (3A), condiciones individuales (3B) y resumen previo (3C) completados, sin publicar.
4. Publicacion, cargos y auditoria de publicacion completados (4A). Cambios masivos y auditoria de ediciones pendientes.
5. Portal del representante y pagos individuales/agrupados reutilizando componentes actuales.
6. Conciliacion, integracion financiera de billetera y avisos.

Antes de habilitar dinero real: verificar commit/rollback, concurrencia, idempotencia,
aislamiento entre tenants, reparto exacto y preservacion de pagos existentes.
La billetera actual depende de mensualidades y permite credito provisional; no se puede
extender a campanas simplemente incrementando su campo de saldo.

## Validacion de la entrega 2

- Backend: 230 pruebas aprobadas en campaniasCobro, monthlyCredit y pagoAgrupadoEdicion.
- Ajuste por sede: 60 pruebas de campanas aprobadas, incluidas 5 Mongo reales en bases
    `libero_qa_campanias_*`, eliminadas al finalizar. Cubren importes por sede, reintentos sin depender
    del orden, conversiones entre modalidades y actualizacion de documentos anteriores sin modalidad.
- Mongo real verifica guardar/recargar, indice unico ante creaciones concurrentes, edicion atomica,
  sedes ajenas, aislamiento entre academias y ausencia de colecciones financieras.
- Frontend: 20 pruebas aprobadas, incluyendo estructura por secciones y foco en el primer error,
  crear/editar en ambas modalidades, volver a entrar, doble envio,
  reintento con la misma clave, recuperacion de opciones, cancelacion con cambios, importe obligatorio
  por sede y exclusion de montos de sedes desmarcadas o modalidades inactivas.
- Lint de frontend modificado y compilacion aprobados; advertencias previas en otros componentes y bundle.
- Navegador aislado con respuestas simuladas: 1365/440/320 sin desbordamiento horizontal,
  botones visibles, creacion, recarga, edicion con version y descarte sin escribir.
- Ajuste por sede verificado en navegador aislado con importes Norte 30.50/Sur 25, recarga y edicion
    Sur 27.50; formulario y guardado dentro del viewport a 1365/440/320. Sin llamadas financieras reales.
- Rediseño de interfaz: ambos modos verificados en 1365/768/440/320, incluido viewport 320x640;
    controles y acciones dentro del modal, sin desbordamiento horizontal. Cierre con cambios,
    foco de errores y guardado por sede comprobados con respuestas simuladas, contexto cerrado al terminar.
- Adaptacion a la referencia: repetidas las mediciones de ambos modos en 1365x900, 1365x768,
    768x900, 440x800 y 320x640, con tres sedes y chips. Columnas en escritorio y apilado en movil,
    etiquetas superiores, selector sin recortes y acciones visibles. Guardar/recargar/editar conserva
    importes e interruptor de abonos. No se agrega un total ficticio ni se suman precios alternativos por sede.
- Capturas integradas con encuadre alterado: no constituyen aprobacion visual integral.
- Sin datos de negocio reales modificados, reinicio de backend, commit ni despliegue.

## Validacion de la entrega 1

- 10 pruebas backend nuevas y 8 frontend nuevas aprobadas, sin Mongo real.
- Lint frontend modificado y compilacion aprobados; advertencias previas en otros componentes y bundle.
- Compatibilidad backend: 321 aprobadas y 1 fallo en smoke de previsualizacion de conciliacion agrupada,
  ya documentado previamente en las notas del repositorio. No se modifico esa logica.
- Navegador aislado con respuestas simuladas: 1365/440/320, busqueda, error, reintento y lista vacia.
- Sin desbordamiento de pagina en medidas DOM; tabla con scroll horizontal propio en movil.
- Capturas integradas con encuadre alterado: no constituyen aprobacion visual integral.
- Sin cambios de datos reales, reinicio de backend, commit ni despliegue.