# SMTP y comienzo desde cero

Decisión del responsable, 22-09-2026: empezar con una instalación vacía y un único
administrador `electropolis`, sin importar datos de Vercel. Usar SMTP con contraseña,
no Gmail API ni OAuth. Esta decisión sustituye la integración anterior; no modifica
el estándar Electropolis 1.0.0, Python 3.11, PostgreSQL 16 ni sus controles de acceso.

## Estado y límites de la plataforma

Desde el 23-09-2026 la plataforma ofrece SMTP acotado mediante `smtp_egress`.
Vacaciones tiene autorizado exclusivamente `smtp.gmail.com:587`; no confundirlo con
`egress_hosts`, que solo permite HTTPS/443. La publicación inyecta `SMTP_PROXY_URL`
(`http://egress:3128`, sin credenciales). No configurarla manualmente ni cambiar
`SMTP_HOST` a `egress`: el servidor TLS original sigue siendo `smtp.gmail.com`.

`app/smtp_client.py` adapta el ejemplo entregado por `agent_guide(topic="smtp")`.
Abre HTTP CONNECT al par autorizado, conserva el saludo SMTP al leer el encabezado,
negocia STARTTLS una sola vez y verifica certificado y nombre con TLS 1.2 como mínimo.
También soporta TLS implícito/465 si la plataforma autoriza ese par en otro entorno.
No instala dependencias ni modifica sockets globales. Un proxy inválido o rechazado
no produce fallback directo; Vacaciones exige proxy incluso si falta la variable en
producción. Las contraseñas viajan dentro de TLS, nunca en el encabezado CONNECT.
El proxy limita conexiones, duración y volumen según la guía de la plataforma.

## Puesta en marcha autorizada

Publicar primero el cliente con `MAIL_ENABLED=false` y la tarea `gmail-outbox` pausada.
Ejecutar desde una tarea nativa pausada `smtp-connectivity`:

```sh
/app/.venv/bin/python -m app.cli smtp-check
```

Solo realiza CONNECT, saludo, EHLO, TLS, EHLO y QUIT. No abre la base de datos,
no autentica y no envía mensajes; devuelve `smtp_tls_ready` o salida de error.

Después, con petición expresa del destinatario y del envío, ejecutar una vez la tarea
pausada `smtp-test-mail` con el comando publicado, por ejemplo:

```sh
/app/.venv/bin/python -m app.cli mail-test --recipient DESTINATARIO --message-key CLAVE_UNICA --send
```

El comando exige `--send`, valida el correo y una clave de 8 a 80 caracteres alfanuméricos,
guiones o guiones bajos. Registra antes del envío el evento `smtp-test:CLAVE_UNICA` y usa
el mismo bloqueo asesor PostgreSQL que `mail-drain`. Solo envía ese mensaje; no procesa
notificaciones pendientes. Permite esta prueba explícita con el envío automático pausado.
Repetir la misma clave nunca vuelve a enviar: devuelve el estado persistente. Los errores
no pasan a la cola automática de reintentos; una entrega dudosa o interrumpida requiere
revisión. No cambiar de clave para repetir a ciegas un envío incierto.

Una aceptación devuelve `accepted=true`, el ID de outbox y Message-ID, sin contraseña
ni respuestas privadas del servidor. Una prueba fallida devuelve código de proceso 1.
La aceptación SMTP no confirma la recepción en la bandeja de entrada.

Solo después de esa aceptación, aplicar `MAIL_ENABLED=true` mediante publicación y
activar la tarea existente `gmail-outbox`, con `*/5 * * * *`, zona `Europe/Madrid` y:

```sh
/app/.venv/bin/python -m app.cli mail-drain --limit 10 --seconds 45
```

Las tareas de diagnóstico y prueba se conservan pausadas (horario inactivo `0 3 * * *`).
El usuario solicitó esta activación y una prueba a `juanangel@electropolis.es` el 23-09-2026.
Consulta el resultado real y revisión en `verification-smtp-proxy.md`. No activar SMTP
solo porque `/ready` responda 200. Ante fallos de CONNECT, revisar logs `internet`;
ante rechazo de autenticación, revisar las credenciales de Google por el canal seguro.

Se han retirado del código activo las llamadas a Gmail API y las variables OAuth.
Se retiran de la configuración autorizada los destinos `gmail.googleapis.com` y
`oauth2.googleapis.com`. El nombre histórico de la tarea `gmail-outbox` se conserva
para no duplicarla: su comando `mail-drain` utiliza ahora exclusivamente SMTP.

## Variables

| Variable | Uso |
|---|---|
| `MAIL_ENABLED` | `false` mientras falten red autorizada, credenciales y prueba real. |
| `SMTP_HOST` | `smtp.gmail.com` por defecto. |
| `SMTP_PORT` | `465` con SSL o `587` con STARTTLS obligatorio. |
| `SMTP_SECURITY` | `ssl` o `starttls`; no se permite autenticación sin cifrado. |
| `SMTP_USER` | Dirección completa del buzón que se autentica. Alias: `GMAIL_USER`. |
| `SMTP_PASSWORD` | Contraseña SMTP por enlace seguro. Alias: `GMAIL_APP_PASSWORD`. |
| `MAIL_FROM` | Remitente autorizado opcional; por defecto el usuario SMTP. |
| `APP_URL` | Origen HTTPS real de la aplicación. |

La misma contraseña de aplicación que ya funcionaba en Gmail SMTP puede reutilizarse
si continúa válida y corresponde al buzón indicado. No es la contraseña del usuario
administrador de Vacaciones. Gmail API utilizaba otro mecanismo: ya no se necesita
cliente OAuth, secreto OAuth ni refresh token. No enviar credenciales por el chat.

## Seguridad y resultados

`SMTPTransport` exige TLS y verificación de certificado/nombre de servidor, autentica
antes de enviar, limita cada operación de socket a diez segundos y cierra la conexión.
No activa logs de protocolo ni registra las respuestas que puedan contener datos privados.
El análisis de errores conserva códigos genéricos. Los errores temporales conocidos
pueden reintentarse; una respuesta perdida durante el envío queda `uncertain`, sin
reintento automático. Un error al cerrar no convierte en fallido un mensaje aceptado.
Una aceptación SMTP no acredita entrega en la bandeja de entrada.

Se conserva la outbox transaccional, el bloqueo asesor PostgreSQL, el máximo de ocho
intentos y el procesamiento limitado por lote. No hay un servidor de correo ni un
planificador residente adicional. La columna heredada `gmail_message_id` conserva
por compatibilidad el Message-ID SMTP; no representa una llamada a Gmail API.

## Administrador inicial

`BOOTSTRAP_ADMIN_USERNAME=electropolis` y `BOOTSTRAP_ADMIN_NAME=Electropolis`.
`BOOTSTRAP_ADMIN_EMAIL` es opcional para esta primera cuenta y puede completarse
más tarde; no se inventa un buzón. `BOOTSTRAP_ADMIN_PASSWORD` debe introducirse por
`application_secret_link` cuando el responsable esté preparado, con 8 a 256 caracteres.
No hay contraseña predeterminada ni se guarda la indicada en el chat en el repositorio.

Después de aplicar el secreto mediante publicación, ejecutar una sola vez la tarea
pausada `initial-administrator` con:

```sh
/app/.venv/bin/python -m app.cli bootstrap-admin
```

El CLI rechaza una instalación con usuarios, no elimina datos y crea exactamente un
administrador con cambio obligatorio de contraseña. Ninguna petición web ejecuta esa
operación automáticamente. Comprobar logs genéricos y `/ready`; después el responsable
inicia sesión y cambia la contraseña. No reactivar la tarea ni sobrescribir una cuenta
ante reintentos o errores. No tocar Vercel como parte de este comienzo desde cero.

## Referencias oficiales

- Google Workspace, configuración SMTP y contraseña de aplicación:
  https://knowledge.workspace.google.com/admin/gmail/send-email-from-a-printer-scanner-or-app
- Python 3.11, SMTP, SSL y STARTTLS:
  https://docs.python.org/3.11/library/smtplib.html
