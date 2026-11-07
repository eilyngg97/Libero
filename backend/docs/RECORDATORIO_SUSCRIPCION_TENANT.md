# Recordatorio de pago del sistema por tenant

La configuracion vive en la coleccion `tenants` de la base central, definida
por `CORE_MONGO_URI_CURRENT`, `CORE_MONGO_URI` o la URI Mongo habitual.
No corresponde a las mensualidades de alumnos ni a los datos bancarios
de la academia.

## Configuracion

Campos bajo `suscripcion` del documento del tenant:

```json
{
  "suscripcion": {
    "plan": "Nombre del plan contratado",
    "costo_mensual_usd": 25,
    "proximo_pago": "2026-11-10",
    "estado_solvencia": "pendiente",
    "recordatorio_pago_activo": false,
    "datos_pago": {
      "banco": "Banco para pagar el sistema",
      "cedula": "Identificacion del beneficiario",
      "telefono": "Telefono de pago movil"
    },
    "contacto": {
      "whatsapp": "Numero internacional sin signo mas",
      "email": "correo-de-soporte@example.com"
    }
  }
}
```

El importe y la fecha del ejemplo deben sustituirse por los reales.
Si no se especifican `datos_pago` o `contacto`, se conservan los datos de
pago y soporte que antes estaban definidos en Mi perfil.
No se inventa un precio cuando falta el monto; un costo cero es valido.

## Activar o apagar

En MongoDB Compass, localizar el documento por `tenantId` y modificar
solo `suscripcion.recordatorio_pago_activo` como booleano BSON:

- `true`: mostrar el recordatorio en el dashboard en cada nuevo login
  de `admin` o `super_admin`.
- `false`: no mostrarlo. Es el valor por defecto.

Cerrar el dialogo no modifica MongoDB. Solo evita repetirlo durante ese
login en la misma pestana, incluso al volver al dashboard o recargar.
Un nuevo login crea una nueva marca, aunque el JWT coincida con el anterior.
La marca tambien funciona si primero se selecciona un perfil administrador
despues de un login con varios roles.

No hay un interruptor editable para los administradores de academias en
esta version. El control lo realiza el operador de la base central.

## Consulta y despliegue

`GET /api/tenant/suscripcion` exige autenticacion y rol administrador;
usa el tenant resuelto del host y rechaza tokens de otro tenant.
La respuesta es privada, sin cache. El contexto publico omite estos campos.
Mi perfil y el recordatorio consultan este mismo endpoint.

Desplegar y reiniciar el backend actualizado y publicar el frontend.
Despues, configurar el plan real y activar el booleano solo en los tenants
que correspondan. Verificar con un nuevo login. Si el backend no esta
actualizado, el recordatorio no bloquea el dashboard y Mi perfil avisa que
no pudo consultar la suscripcion.

No se modifica la solvencia ni se bloquea el acceso con este recordatorio.