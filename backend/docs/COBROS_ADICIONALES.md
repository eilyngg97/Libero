# Cobros adicionales

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