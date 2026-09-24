# Operación de Vacaciones Python

## Publicación

Confirmar cuenta, proyecto, repositorio, rama, SHA y cambios pendientes. Ejecutar
`sh scripts/check.sh` y las pruebas aisladas proporcionales al cambio. Guardar mediante
las herramientas Git del conector, comprobar commit y push, y publicar el SHA completo
con `deployment_start`, puerto 8080, ruta `/health`. Seguir `deployment_status` hasta
el resultado final y comprobar `/`, `/health`, `/ready` y activos con `deployment_probe`.
`deployment_probe` no ejecuta JavaScript: las pruebas de navegador son independientes.

El Dockerfile incluye los checks; no existe aquí un control universal independiente
del Dockerfile que se deba atribuir a la plataforma. En el build sin PostgreSQL aislado
se omiten los tests de integración/navegador; se ejecutan expresamente en desarrollo
antes de publicar y se registran en el informe de verificación.

## Preparación de esquema

No se ejecuta una migración en cada arranque web. Después de publicar el CLI, crear
una tarea nativa **pausada** `schema-migration`, zona `Europe/Madrid`, horario válido
`0 3 * * *` y comando:

```sh
/app/.venv/bin/python -m app.cli migrate
```

Usar `schedule_run` expresamente una sola vez para la revisión prevista y comprobar
`schedule_logs`/estado del run. El proceso comprueba PostgreSQL 16 y usa bloqueo asesor.
La migración es idempotente y no crea usuarios, contraseñas ni festivos inventados.
Mantener la tarea pausada: el cron no debe repetir cambios de esquema sin control.
Antes de futuras migraciones: copia verificada, compatibilidad, ensayo y autorización
correspondientes. El `downgrade` generado no es un procedimiento de recuperación de
producción: no ejecutarlo para eliminar datos o hacer funcionar una imagen anterior.

## Alta desde cero

El responsable ha elegido no importar Vercel. El alta inicial `electropolis` puede
realizarse sin email; necesita `BOOTSTRAP_ADMIN_PASSWORD` de 8 a 256 caracteres
por el canal seguro y obliga a cambiarlo antes del primer uso. Ejecutar el CLI
`bootstrap-admin` una sola vez mediante una tarea pausada `initial-administrator`,
sin contraseñas en su comando. Consultar `docs/smtp.md`. No borrar cuentas previas.

## Correo y mantenimiento

La ampliación operativa actual del conector ofrece tareas nativas `schedule_*`, aunque
la guía común 1.0.0 copiada describe cron como pendiente. No modifica la versión del
estándar ni concede recursos adicionales.

Conservar el nombre estable `gmail-outbox` (ahora transporte SMTP), zona `Europe/Madrid`,
`* * * * *` (cada minuto desde la corrección de invitaciones del 24-09-2026), con el comando:

```sh
/app/.venv/bin/python -m app.cli mail-drain --limit 10 --seconds 45
```

Activarla solo después de publicar el cliente CONNECT, confirmar `smtp_egress` y
`SMTP_PROXY_URL`, ejecutar `smtp-check` sin autenticación/envío y una prueba explícita
`mail-test --recipient DESTINATARIO --message-key CLAVE_UNICA --send`. Consultar `smtp.md`.
Aplicar después `MAIL_ENABLED=true` mediante publicación. Las tareas `smtp-connectivity`
y `smtp-test-mail` se usan manualmente y permanecen pausadas. No duplicar `gmail-outbox`.
El código limita el lote y las llamadas, pero no se presupone un timeout global de
Dokploy. El bloqueo asesor evita procesadores de correo simultáneos y excluye pruebas
simultáneas. Una entrega incierta requiere revisión; no se repite automáticamente.

La limpieza de sesiones y previsualizaciones caducadas se puede ejecutar explícitamente:

```sh
/app/.venv/bin/python -m app.cli maintenance
```

No elimina empleados, solicitudes, justificantes ni eventos de auditoría. Si se programa,
documentar un horario real acordado y revisar sus logs. No instalar un planificador
residente dentro del proceso web ni dejar procesos del workspace en background.

## Diagnóstico

`/health`: vida del servidor. `/ready`: conexión, revisión de esquema, configuración y
administrador activo. Un 503 de readiness durante la puesta en marcha es deliberado.
La portada muestra activación pendiente en ese estado, sin acceso de prueba predeterminado.

Consultar `deployment_logs` del componente concreto ante errores. Los logs HTTP incluyen
identificador de petición, ruta de contrato, estado y duración, no cuerpos, cookies o
parámetros de URL. No imprimir excepciones con credenciales para diagnosticar Gmail o
PostgreSQL. Un curl bloqueado desde el workspace no demuestra que producción esté caída.

OpenAPI para administradores: `/api/openapi.json`. Panel de operaciones: `/admin`.
El correo se comprueba en la bandeja de salida y los logs de su tarea, no mediante health.

## Recuperación

Las copias deben incluir toda la base de datos, especialmente `attachments.data`,
`request_days`, políticas y auditoría. Ensayar restauración en un destino separado;
comparar recuentos, saldos y SHA256 de adjuntos. El test de recuperación del repositorio
realiza `pg_dump` y `pg_restore` con datos ficticios en PostgreSQL 16.

Rollback recupera una imagen, no los datos, el esquema, las variables o las tareas.
No ejecutar una imagen Next.js antigua contra el esquema Python. La vuelta al origen
necesita un punto de corte y conciliación de las escrituras posteriores. No prometer
recuperación sin pérdida si no existe ese procedimiento. Las copias locales no cubren
la pérdida total del servidor; confirmar una copia externa acorde a la política de empresa.
