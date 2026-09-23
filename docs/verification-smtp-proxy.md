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
