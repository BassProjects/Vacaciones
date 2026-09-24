# Invitaciones: envío programado y estado real

Fecha: 24-09-2026. Proyecto `vacaciones`, cuenta `BassProjects`, repositorio
`ElectropolisDokploy/Vacaciones`, rama `main`. Base publicada:
`b27365f552337df3b95ee6e0544647e3c37d9c43`.

## Diagnóstico

La tarea `gmail-outbox` estaba habilitada cada cinco minutos. Las peticiones a
`/api/users/invite` recibidas tras la pasada de las 07:45 UTC quedaron en cola para
la siguiente pasada. La ejecución `o6SDt67lzp7vpRZaXuRQH`, del 24-09-2026 a las
07:50 UTC, terminó correctamente y registró `sent=3`, `pending=0`, `failed=0`,
`uncertain=0`. Son los resultados del lote, no un recuento global de toda la cola
ni una confirmación de recepción en las bandejas de entrada.

El resultado del formulario conservaba `mailQueued=true` y `mailSent=false`
y nunca consultaba la evolución del correo. El refresco general de la aplicación
no actualizaba los resultados del modal. Volver a invitar una cuenta existente
solo mostraba que ya existía, sin el estado de su aviso anterior.

## Cambios

- Configuración operativa: misma tarea `gmail-outbox`, ID `eOL61Q7bm2RRcTMC3Gj8M`,
  mismo comando `/app/.venv/bin/python -m app.cli mail-drain --limit 10 --seconds 45`,
  activa con `* * * * *`, zona `Europe/Madrid`. El cambio a un minuto se ha aplicado
  mediante `schedule_save`; no necesita cambiar la imagen publicada.
- La API de invitaciones devuelve el identificador y el estado persistente del
  correo, también para cuentas existentes. No crea cuentas ni correos duplicados.
- Consulta GET `/api/users/invitation-status?ids=...`, restringida a administradores,
  limitada a 100 IDs y solo a mensajes de invitación. No envía ni cambia mensajes,
  no expone cuerpos de correo, destinatarios o credenciales en esa respuesta.
- El modal consulta estados cada 20 segundos mediante el temporizador ya existente,
  solo mientras esté abierto y haya mensajes pendientes o en envío. Ignora respuestas
  tardías tras cerrar el modal o salir de la sesión. Los fallos de consulta no se
  muestran como correo enviado ni provocan reenvíos.
- Texto diferenciado para pendiente, enviando, enviado, fallido e incierto. «Enviado»
  indica aceptación SMTP, no recepción en bandeja. Cerrar el modal no cancela la cola.

Se conserva el envío desacoplado de la petición HTTP, el proxy SMTP autorizado,
TLS, las credenciales, el bloqueo asesor del procesador, los límites del lote y los
controles existentes de reintentos. No se han modificado contraseñas, políticas de
acceso, esquema ni datos de empleados. No se ha reenviado la prueba SMTP anterior.

## Verificación

```sh
export PATH="$PWD/.tools/bin:$PATH"
uv run --locked python scripts/with_test_postgres.py sh scripts/check.sh
```

Trabajo `d9953f20e87aaf23a4a2e8b43a08772a`: completed, salida 0.
Manifiesto, Ruff y formato correctos; **166 pruebas superadas, sin fallos ni omisiones**.
62 avisos de obsolescencia existentes de dependencias/configuración.
PostgreSQL 16 temporal supervisado; SMTP simulado y datos ficticios, sin usar
credenciales ni cuentas de producción. Chromium comprueba actualizaciones a enviado
y a error en escritorio y móvil. La API verifica persistencia, plantilla de bienvenida,
destinatario sintético, ausencia de duplicados, permisos y consultas solo de lectura.
Los procesos supervisados de pruebas terminaron y se retiraron sus datos temporales.

Trabajo `2aeb41249457eaedabbba81fa65574c1`: completed, salida 0; sintaxis JavaScript
correcta mediante `node --check` y lectura de huellas del contenido probado:

```text
8e8b4b9172d94afe3ff86d6b90d1a480307acc407d54d320d39c6ed0f5be8b8b app/invitation_delivery.py
a798a1a225c3344407bd159949332873dd357f732464fdd2e1b86a1677cc7889 app/routes/users.py
3c6597b75a6cb6784a30fcf848d91dbe7905556b85d181bec182b7c5f09c90d3 app/static/js/invitation-delivery.js
e64eebcc2ad5e782a718eccf289caef6483eba21fb5e00072471b09a36788f53 app/static/js/core.js
cb485848c5a3fcdf5360d417bb09cbaa4c0f364fdf2427f19af9546713922dde app/static/js/employee-dialogs.js
894e3a16be295ab8cb47fff637f99a514a9531111d3182168599ce5e3846ecf0 tests/test_invitation_delivery.py
f0715b1c6fa6cca742439757e12c586f65678774d764ae13890ba507da6f1e4c tests/test_browser.py
```

## Comprobación operativa posterior

`schedule_list` confirmó `gmail-outbox` activa con `* * * * *` y las otras tareas
sin cambios. Su ejecución `7h70Ifm6xbdh5A12hO2Y1`, del 24-09-2026 a las 08:04 UTC,
terminó `done`. El log devolvió sent/pending/failed/uncertain a cero: esa pasada
no procesó mensajes ni registró fallos. No es un inventario global de toda la outbox.

## Preparación de la publicación autorizada

Al finalizar la verificación anterior, el intervalo de un minuto ya estaba aplicado
a producción, mientras los cambios de API, interfaz y documentación permanecían en
el workspace sin commit/push ni despliegue. El responsable autorizó después guardar
y publicar esta corrección el 24-09-2026.

Antes del guardado, el trabajo `167697f7714f11a1a6be7f445cff8f6e` terminó completed,
salida 0, y confirmó que las siete huellas anteriores coinciden exactamente con el
contenido ejecutable y las pruebas que superaron la batería de 166 casos. No se
repitió esa batería sin cambios. Se revisaron el manifiesto, Dockerfile, checks y diff;
no hay cambios de esquema, credenciales ni configuración SMTP pendientes de aplicar.

Este informe documenta la verificación previa y la autorización, no acredita por sí
solo la finalización del despliegue. El commit, push y publicación deben comprobarse
por sus resultados reales; después se revisan salud, disponibilidad, el módulo de
interfaz y la protección de la nueva ruta, además de la tarea de correo cada minuto.
Esta actualización documental no modifica el contenido ejecutable probado.
