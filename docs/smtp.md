# SMTP y comienzo desde cero

Decisión del responsable, 22-09-2026: empezar con una instalación vacía y un único
administrador `electropolis`, sin importar datos de Vercel. Usar SMTP con contraseña,
no Gmail API ni OAuth. Esta decisión sustituye la integración anterior; no modifica
el estándar Electropolis 1.0.0, Python 3.11, PostgreSQL 16 ni sus controles de acceso.

## Estado y límites de la plataforma

El transporte SMTP está implementado con la biblioteca estándar de Python y TLS
verificado. El conector actual solo permite configurar salida HTTPS y servicios HTTP
internos: **no ofrece una operación que autorice SMTP TCP 465/587**. Añadir el dominio
a `egress_hosts` no habilita esos puertos. No crear túneles, omitir el proxy ni modificar
las restricciones para eludir este límite. Hace falta una capacidad SMTP autorizada
por la plataforma antes de activar el envío. El correo y su tarea permanecen pausados.

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
