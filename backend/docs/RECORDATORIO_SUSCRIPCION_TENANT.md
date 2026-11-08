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

La fecha del ejemplo debe sustituirse por la real.
Si no se especifican `datos_pago` o `contacto`, se conservan los datos de
pago y soporte que antes estaban definidos en Mi perfil.
El plan y el costo mensual se calculan automaticamente en cada consulta
privada con el total de alumnos activos de la base de esa academia,
incluyendo todas las sedes y alumnos sin sede. Se excluyen los registros
con `activo: false` o `dado_de_baja: true`, igual que en el conteo por sede.

| Alumnos activos | Plan | USD / mes |
| --- | --- | --- |
| 0 a 50 | Plan Inicial | 20 |
| 51 a 100 | Plan Crecimiento | 35 |
| 101 a 200 | Plan Profesional | 50 |
| 201 en adelante, ilimitado | Plan Elite | 70 |

Solo los tenants con `tenantId` igual a `cantevista`, `fenix` o `esporta`
conservan la matriz antigua. Se normaliza el identificador a minusculas
sin espacios exteriores; no se compara el nombre comercial ni coincidencias
parciales. Los rangos y nombres de plan son los mismos:

| Alumnos activos | Plan | USD / mes (matriz antigua) |
| --- | --- | --- |
| 0 a 50 | Plan Inicial | 15 |
| 51 a 100 | Plan Crecimiento | 25 |
| 101 a 200 | Plan Profesional | 40 |
| 201 en adelante, ilimitado | Plan Elite | 50 |

Al subir o bajar de rango, estas tres academias mantienen su matriz antigua.
Las demas academias usan siempre la matriz vigente. Ambas pantallas consumen
el precio calculado por la misma API, sin configuracion adicional en MongoDB.

Los valores antiguos `suscripcion.plan` y `suscripcion.costo_mensual_usd`
no determinan la tarifa de la API. No es necesario editarlos ni migrarlos.
La respuesta incluye `total_alumnos_activos`; Mi perfil usa ese mismo conteo.
Si el conteo falla, la API devuelve un error y no usa una tarifa antigua.
El calculo es de solo lectura: no modifica MongoDB, solvencia, vencimientos
ni el interruptor. Al consultar de nuevo tras altas o bajas cambia el plan;
no se congelan tarifas por periodo ni se generan cobros con esta funcionalidad.

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
Despues, configurar la fecha y solvencia y activar el booleano solo en los tenants
que correspondan. Verificar con un nuevo login. Si el backend no esta
actualizado, el recordatorio no bloquea el dashboard y Mi perfil avisa que
no pudo consultar la suscripcion.

No se modifica la solvencia ni se bloquea el acceso con este recordatorio.