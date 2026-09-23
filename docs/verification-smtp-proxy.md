# Verificación SMTP mediante proxy autorizado

Fecha: 23-09-2026. Petición expresa: adaptar el cliente al proxy SMTP autorizado,
publicar, activar el correo y enviar una prueba a `juanangel@electropolis.es`.
Proyecto `vacaciones`, cuenta `BassProjects`, repositorio `ElectropolisDokploy/Vacaciones`,
rama `main`, base `efda445dc02e608be82795227d6503e9b38a9f70` sin cambios previos.
Estándar 1.0.0 conservado. Sin migraciones de esquema ni cambios de contraseñas o empleados.

## Implementación

Se consultó `agent_guide(topic="smtp", version="1.0.0")`. El ejemplo de plataforma
`examples/smtp_client.py`, SHA-256
`10f13e60865c6388728928c40425a0316bf3f827948226e9f7b9515a65c76438`,
se adaptó a `app/smtp_client.py` y al transporte existente.
CONNECT solo al host/puerto configurado, cabecera acotada sin consumir el saludo SMTP,
TLS 1.2 mínimo con certificado y nombre originales, STARTTLS una sola vez y sin
fallback directo. Vacaciones exige `SMTP_PROXY_URL` en producción.
No se añadieron dependencias, servicios residentes, sockets globales ni destinos HTTPS.

Los comandos `smtp-check` y `mail-test` distinguen conexión/cifrado de autenticación/envío.
La prueba explícita exige destinatario, clave y `--send`, usa bloqueo y registro persistente
y no procesa el correo pendiente. Un reintento de la misma clave no duplica mensajes;
los errores de la prueba no se convierten en reintentos automáticos.
Los avisos ordinarios conservan su outbox, límites y manejo de entrega incierta.

## Pruebas de desarrollo

Comando final:

```sh
export PATH="$PWD/.tools/bin:$PATH"
uv run --locked python scripts/with_test_postgres.py sh scripts/check.sh
```

Trabajo `a599b3ef6ba064044aeb4a1a1b52a641`, `completed`, código de salida 0:
**152 pruebas superadas, 0 fallidas, 0 omitidas**; 49 avisos de obsolescencia de
Starlette/TestClient, AnyIO y configuración Alembic existente. Manifiesto, Ruff y
formato correctos. Se ejecutaron PostgreSQL 16 aislado y Chromium en escritorio/móvil;
todos sus procesos temporales se cerraron. Solo datos, credenciales y transportes
sintéticos. Ninguna conexión SMTP externa ni envío real durante esta batería.

Cobertura nueva: CONNECT aceptado/rechazado, límites de cabecera y conservación del
saludo; URL de proxy inválida, inyección de destino y puertos no permitidos;
selección de proxy, TLS/certificados/SNI original y ausencia de fallback;
cierre tras fallo TLS, autenticación posterior al cifrado, errores sin datos sensibles;
comprobación de conectividad sin AUTH/MAIL/RCPT/DATA; prueba única persistente,
exclusión del procesador, mensajes ajenos intactos y salida no cero ante rechazo.
La primera comprobación se detuvo por formato/longitud de líneas; se corrigió antes
de ejecutar esta batería completa. No se omitieron ni relajaron pruebas funcionales.

Huellas del contenido ejecutable y pruebas verificados:

```text
5dadaf41fe9f32f13afd24b2ae8ec7512d0f9a8c238f9ba9e2af5912e7052457 app/smtp_client.py
973fe7afef2a8b8776c183faf70ad91fd8f0aff89395c90893c718cbd19ae868 app/smtp_transport.py
8163ca5d8d3cc8295fec07516eeae4634ae2bf7c0f78a8073bb44e4b990a2379 app/mail_operations.py
b50484d0ef8b142612e24833001fb0aa0b7a6c0ea814cc404b1304161236d9ac app/cli.py
77a1632c665e0c72c739cf06535768ed0cb6b237b96540b7bd5f8b31f42e5e8d app/templates/email/smtp-test.html
b7e8b3d6fd918439b0091a7dde5fbbcce3eaddd2fc26ff7704f5b4e3ec97e574 tests/test_smtp.py
cc6f5869c5c7db76d6f82d52f7ad2096e4581a368db166f666017d0c0049328c tests/test_smtp_proxy.py
8f2f7adc10c35f8b219d6a17764cc59ef8f4eaa7f2f2c7ca3eb98c7fd20fb83b tests/test_mail_operations.py
```

## Puesta en marcha

Antes del cambio: configuración revisión 8 aplicada, con `smtp.gmail.com:587`
autorizado y credenciales registradas, pero cliente aún sin CONNECT y `gmail-outbox`
pausada. Primero se publica este código con envío automático pausado; después se
comprueba TLS sin autenticar, se envía únicamente la prueba solicitada y solo tras
su aceptación se publica `MAIL_ENABLED=true` y se activa `gmail-outbox` cada cinco
minutos, Europe/Madrid. Las tareas de diagnóstico/prueba quedan pausadas.
Los resultados de producción se incorporan a continuación cuando estén comprobados.
La aceptación SMTP nunca se describe como entrega confirmada en la bandeja de entrada.

## Primera publicación y conexión real

Commit `40fd6cd68174bbd8f7a1828d6f7a55454c3266a9`, despliegue
`e80ff779bb25f2689d994ed67a7a3686`, healthy y ready. Construcción:
106 pruebas correctas y 46 omitidas por requerir PostgreSQL/Chromium, ya cubiertas
por la batería aislada anterior. Configuración 8 aplicada, envío automático pausado.
La tarea `smtp-connectivity` (`3trOnYUs1PsyJM0hzri88`), ejecución
`lxZ1_eCPDBMpLRKT1Dn3_`, terminó `done` con `smtp_tls_ready` y `proxy_used=true`.
Esto verifica conexión/TLS, no autenticación ni envío.

El conector devolvió `tool_error` al guardar el comando de prueba con parámetros.
El historial confirmó que no existía esa tarea ni había ejecuciones de envío.
La tarea pudo guardarse pausada con el comando de consulta `app.cli status`;
no se ejecutó ese comando provisional. No se modificaron permisos o controles.
Se añadió soporte explícito de parámetros no secretos en `SMTP_TEST_RECIPIENT` y
`SMTP_TEST_MESSAGE_ID`, conservando el requisito `--send`, la validación de destino,
el registro persistente y el control de duplicados. El comando operativo pasa a ser
`/app/.venv/bin/python -m app.cli mail-test --send` después de publicar el ajuste.

La batería completa se repitió tras este cambio de CLI: trabajo
`356a1f1b7a14ac262ecc9175fd3f149f`, completed, código 0, **153 pruebas superadas,
0 fallidas y 0 omitidas**, 49 avisos existentes. PostgreSQL y navegador aislados.
Se sustituyen solo estas huellas respecto a la batería anterior:

```text
9fa5cdaa9737330c4fdac3518c1d1bff2f9a8b1e9f7648cfd20509046d113ad2 app/cli.py
ecab6179e0291e80673e6f9b02b2d82b81d368853410f25376711c574d091054 tests/test_mail_operations.py
```

## Autenticación y envío real comprobados

El ajuste se publicó en el commit `173ceedb222f74f7b127f465edb179028e2aacbf`,
despliegue `f4bcfc57a528c9fd63c4cfe2c7c5ad55`: healthy/ready; 107 pruebas de build
correctas y 46 omitidas por necesitar el entorno aislado, cubiertas por las 153 anteriores.
Configuración revisión 9 aplicada, todavía con `MAIL_ENABLED=false`.

La tarea pausada `smtp-test-mail`, ID `UI_9yDzlAVdwrieTFTl8J`, pudo guardarse con
`/app/.venv/bin/python -m app.cli mail-test --send`. Se ejecutó expresamente una vez,
run `qyE5PV-WTaUht7eSO6Dd2`, finalizado el 23-09-2026 a las 12:20:06.775 UTC.
El log confirmó `status=sent`, `accepted=true` y `error_code=null`.
Registro de outbox: `00a8fd05-4b86-48ee-9051-df1d3f323d09`.
Remitente configurado `noreply@electropolis.es`, destinatario autorizado
`juanangel@electropolis.es`, asunto `Vacaciones · Prueba de correo SMTP`.
Google aceptó el mensaje después de autenticar por el canal TLS del proxy; no se
consultó el buzón del destinatario ni se afirma entrega confirmada en bandeja de entrada.
No se reenvió la prueba y las tareas de diagnóstico/prueba siguen pausadas.

Tras esta aceptación se preparó la revisión 10 con `MAIL_ENABLED=true`. Su aplicación
requiere publicar esta revisión documental (sin modificar el contenido ejecutable
que pasó las 153 pruebas). Después corresponde activar la tarea existente
`gmail-outbox` (`eOL61Q7bm2RRcTMC3Gj8M`), `*/5 * * * *`, `Europe/Madrid`, y comprobar
una ejecución de `mail-drain --limit 10 --seconds 45`. La configuración y el estado
actual de las tareas se consultan en la plataforma: no retroceden con rollback.
