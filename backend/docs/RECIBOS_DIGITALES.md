# Recibos digitales de mensualidades

## Preparacion

- MongoDB debe ser un replica set (tambien en desarrollo). Registrar pagos
  administrativos y conciliar mensualidades requiere transacciones; si no estan
  disponibles, se devuelve 503 sin guardar la operacion.
- Configurar nombre oficial y RIF en **Configuracion general > Datos fiscales de
  recibos**, el logo de la academia y las sedes de los atletas.
- Registrar los dominios publicos de cada academia en su tenant. El QR utiliza
  preferentemente `{tenantId}.apex.com.ve`, si figura entre esos dominios.
  El servidor web debe servir la SPA para `/verificar/:numero`.
- En desarrollo, los enlaces y QR conservan el protocolo y puerto del origen
  local del portal, incluidos subdominios como `http://academia.localhost:3000`.
  Estos enlaces solo sirven para pruebas locales; compartir con terceros requiere
  un dominio publico con HTTPS. Produccion utiliza los dominios del tenant.
- La numeracion usa el anio de emision en America/Caracas. Cada base de academia
  mantiene su contador por tenant y anio y un indice unico de numero de recibo.
  El indice se crea mediante el mecanismo habitual de indices Mongoose.

## Comportamiento

Al llegar a `Pagado`, los flujos de registro, conciliacion y aplicacion de credito
guardan la mensualidad y su recibo mediante `guardarMensualidadConRecibo`.
Contador, datos y estado se confirman juntos. Los reintentos no consumen numeros.
Las futuras escrituras de pagos deben utilizar ese mismo servicio, no actualizaciones
directas de estado mediante `updateMany` o `bulkWrite`.

Los pagos antiguos que ya estaban pagados reciben su numero al abrirlos por
primera vez o al exportar todos los recibos. La fecha de emision corresponde a
ese momento, no se retrodata. Las consultas y exportaciones nunca incluyen
mensualidades pendientes, abonos o pagos en revision.

El numero y la fecha de emision se conservan al volver a confirmar una cuota.
El desglose se actualiza al guardar el pago aprobado. Si el pago vuelve a
revision, se exonera o se elimina, su verificacion publica deja de ser valida.
Los documentos descargados previamente deben contrastarse con el QR.

El detalle incluye inscripcion o reingreso, mensualidad, mora, ajustes/descuentos,
credito aplicado, diferencias de conciliacion y excedentes cuando correspondan.
Los abonos aparecen con sus metodos, referencias, fechas y montos registrados.
La moneda mostrada depende del metodo: Pago movil y Transferencia muestran solo
los Bs realmente registrados, sin equivalentes en dolares ni conversion con la tasa
actual. Efectivo en divisas, Zelle, PayPal y Binance mantienen la divisa registrada.
Un recibo mixto muestra totales separados en Bs y divisas; nunca suma monedas distintas.
Cada metodo muestra solo el importe correspondiente a su moneda.
El desglose de conceptos se distribuye proporcionalmente entre los totales por moneda;
el residuo de redondeo se ajusta en la ultima linea para conciliar al centavo.
La misma presentacion se aplica al documento, PDF, PNG y verificacion publica del QR,
incluidos recibos ya emitidos, sin cambiar su numero ni fecha de emision.
Los datos originales se conservan internamente. Un pago bancario sin monto valido
en Bs impide descargar/verificar el recibo y devuelve un error explicito; debe corregirse
el pago, sin inventar un equivalente. Una cuota cubierta sin transferencia muestra
total Bs 0 y sus conceptos sin inventar una conversion del saldo a favor.
En cuotas historicas marcadas como pagadas sin abonos detallados se utiliza el
importe cancelado de la mensualidad y su metadata, identificando expresamente
el registro administrativo cuando no se conserva el metodo de pago.

## Acceso y exportacion

- `POST /api/recibos/mensualidad/:id`: recibo completo; requiere propiedad del
  atleta/representante o permiso `mensualidades.view`.
- `POST /api/recibos/mios`: todos los recibos propios de todos los atletas del
  usuario, sin filtros de pantalla y excluyendo pagos con fecha futura.
- `GET /api/recibos/verificar/:numero`: consulta publica limitada por IP y
  aislada por el tenant del host. Solo muestra academia, concepto, fecha,
  numero y `totales` separados por moneda; no publica identidades ni referencias bancarias.

El representante encuentra **Ver Recibo** en las mensualidades pagadas y
**Descargar todos mis recibos en PDF** en su historial. Administracion dispone de
**Compartir / Descargar Recibo** en el detalle. PDF y PNG se generan localmente,
con QR local, sin enviar los datos a servicios de conversion. WhatsApp comparte
el enlace publico de verificacion, no los datos privados del recibo.

## Validacion

Desde `backend`, con un replica set local `rs0` en el puerto 27017:

```powershell
$env:RUN_MONGO_RECEIPT_TESTS='1'
npm test -- --runTestsByPath tests\paymentReceipt.mongo.test.js
```

La suite crea bases temporales exclusivas y las elimina al finalizar. Cubre
concurrencia, aislamiento, rollback, autorizacion y emision desde los controladores.

Desde `my-react-app`:

```powershell
npm test -- --watchAll=false --runInBand --runTestsByPath src\components\ReciboPago.test.js
npm run build
```
