# Ajuste de inicio de cobro de Olympykus

Script exclusivo del tenant `olympykus` para iniciar el cobro el 1 de noviembre de 2026. No acepta otros tenants ni otros periodos.

## Alcance

- Actualiza `fecha_inicio_cobro` de todos los alumnos, sin cambiar sus tipos de mensualidad ni sus estados de actividad.
- Elimina todas las mensualidades de octubre de 2026, sus detalles de pago (incluidos los confirmados) y los grupos que pertenecen completamente a octubre.
- Retira todos los saldos anteriores. En las cuotas existentes de noviembre devuelve a la deuda el credito aplicado de octubre, incluso cuando no existe trazabilidad legacy.
- Conserva los detalles de pago directos de noviembre, sin modificar sus importes, identificadores ni comprobantes. Recalcula la cuota y el excedente usando solamente esos pagos. Un pago por la cuota de noviembre cuenta como noviembre aunque la transferencia se haya realizado en octubre.
- Genera las cuotas faltantes de noviembre con las reglas existentes: sede, media beca, beca completa, monto personalizado y reposos. No agrega cargos de inscripcion. No genera cuotas nuevas para alumnos inactivos o dados de baja.
- Mantiene los estados especiales de las cuotas de noviembre existentes: Becado, Exonerado y Exento por reposo. Un abono que solo provenia de octubre vuelve a quedar por cobrar; no se crea un pago ficticio.
- El saldo final de cada alumno solo puede provenir de un excedente de sus pagos directos de noviembre, conservando la revision cuando corresponda.

Se detiene sin aplicar si encuentra cuotas de otros periodos, cuotas sin alumno, grupos compartidos entre octubre y noviembre o comprobantes fuera de `/uploads/olympykus/comprobantes/`. Esos casos requieren revision especifica, no borrado automatico.

## Antes de ejecutar

1. Probar primero con una copia local de produccion, incluidos los archivos de comprobantes.
2. MongoDB debe soportar transacciones (replica set o mongos). El script no tiene fallback a escrituras parciales en standalone. La configuracion de produccion no se ha verificado.
3. Para aplicar, poner la academia en mantenimiento y detener API, cron y workers que escriban en su base o en uploads. Mantenerlos detenidos durante la limpieza de archivos. El script no detiene servicios automaticamente.
4. Realizar tambien el respaldo operativo habitual de la base y de uploads. Proteger los respaldos: contienen informacion personal y financiera.
5. Revisar la conexion core del entorno: se carga `backend/.env`, respetando variables ya presentes. El tenant debe tener una `dbUri` explicita; no se permite usar una base fallback.

## Simulacion

Desde la raiz del repositorio:

```powershell
node backend/scripts/ajustar_inicio_cobro_olympykus.js
```

Ejecuta las escrituras dentro de una transaccion y fuerza rollback al terminar. No elimina archivos ni crea respaldos. Muestra la base de datos seleccionada, cantidades afectadas, credito retirado, saldo final y estados de las nuevas cuotas.

## Aplicar

Con el entorno correcto y los servicios detenidos:

```powershell
node backend/scripts/ajustar_inicio_cobro_olympykus.js --apply
```

Antes de modificar datos, crea un respaldo EJSON de alumnos, cuotas de ambos meses, detalles de ambos meses y grupos de octubre en `backend/backups/olympykus-inicio-noviembre-<id>/respaldo.ejson`. Copia tambien los comprobantes que va a eliminar y registra su SHA-256. Si falla el respaldo, no confirma cambios.

El ajuste financiero se confirma en una sola transaccion. El registro de commit queda en la coleccion `ajustes_inicio_cobro`. Solo despues se eliminan los comprobantes originales no compartidos. Las copias se conservan en el respaldo, fuera de uploads. Los archivos ya ausentes se reportan y los modificados despues del respaldo no se eliminan.

Si la limpieza falla despues del commit, la base ya esta ajustada: no restaurar o repetir cobros por ese motivo. La salida informa los pendientes y devuelve codigo 1. Reintentar solo la limpieza con la ruta del respaldo que mostro el script:

```powershell
node backend/scripts/ajustar_inicio_cobro_olympykus.js --limpiar-comprobantes backend/backups/olympykus-inicio-noviembre-<id>/respaldo.ejson
```

El reintento verifica el commit y la copia de respaldo. Vuelve a buscar referencias antes de borrar, conserva archivos compartidos y no modifica mensualidades ni pagos. Un respaldo de una transaccion revertida no permite borrar archivos.

Repetir el ajuste no duplica cuotas ni pagos, pero es preferible usar el reintento especifico para archivos pendientes. La restauracion del respaldo es manual; no se incluye un restaurador automatico. Rehabilitar los servicios solamente despues de verificar el resultado y la limpieza.

## Resultado local de referencia

Simulacion del 24 de octubre de 2026 sobre `gestion_deportiva_olympykus`, con rollback:

- 171 alumnos y fechas de inicio por actualizar.
- 171 cuotas de octubre, 5 detalles de pago y 2 grupos por eliminar.
- 169 cuotas de noviembre por crear y 2 por recalcular: 171 en total.
- 25.60 USD de credito aplicado en noviembre por retirar; saldo final valido: 0 USD.
- 1 comprobante por eliminar; ninguno compartido.

Son datos locales, no una verificacion de produccion. En produccion se deben revisar nuevamente la simulacion, las reglas de cobro y los pagos reales de noviembre.