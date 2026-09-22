# Gmail API y notificaciones

## Diseño

La aplicación no usa SMTP ni contraseñas de aplicación de Gmail. Utiliza OAuth y
`users.messages.send` por HTTPS, con un buzón de envío expresamente autorizado.
El alcance mínimo solicitado es `https://www.googleapis.com/auth/gmail.send`.
No necesita leer ni administrar el correo de los trabajadores.

Cada cambio de solicitud guarda el evento y su notificación en la misma transacción
PostgreSQL. La tarea de envío procesa la bandeja de salida después; un fallo de
Gmail no revierte una solicitud ya registrada. Los mensajes llevan contenido HTML
escapado y no incluyen motivos privados ni justificantes.

Las invitaciones generan avisos de bienvenida, no contraseñas. El acceso inicial
se administra por el canal interno acordado y exige cambio de contraseña. La
recuperación autónoma por enlace no se ha activado: falta el formulario de cliente,
bloqueado por la herramienta de edición. No generar ni enviar enlaces de activación
que no puedan utilizarse.

## Información necesaria para la activación

Acordar un buzón real y autorizado para el remitente. Preparar en Google Cloud un
proyecto con Gmail API habilitada y un cliente OAuth adecuado al tipo de acceso
permitido por Google Workspace. Revisar la pantalla de consentimiento, los usuarios
permitidos, el estado de publicación de OAuth y las políticas de la organización.
No asumir que un alias sin buzón puede autenticarse por sí solo.

La autorización del propietario del buzón debe proporcionar un refresh token para
acceso offline con el alcance de envío. Se necesitan `GMAIL_FROM`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET` y `GMAIL_REFRESH_TOKEN`. Los valores se introducen mediante
el enlace seguro de la plataforma cuando la persona esté disponible; no se generan
enlaces por adelantado ni se solicitan los valores secretos en el chat.

No transferir `GMAIL_APP_PASSWORD` de Vercel: corresponde al transporte retirado.
No ampliar permisos a lectura total de Gmail ni a delegación global del dominio
solo para evitar una autorización fallida.

## Configuración en Dokploy

Permitir salida HTTPS a `oauth2.googleapis.com` y `gmail.googleapis.com`.
Configurar `APP_URL` con la URL HTTPS real. Conservar `MAIL_ENABLED=false` hasta
que estén todas las credenciales. El cliente HTTP respeta el proxy y verifica TLS;
no abrir el puerto SMTP ni desactivar esas restricciones.

Después de publicar el código, preparar una tarea nativa con nombre estable
`gmail-outbox`, zona `Europe/Madrid`, cron `*/5 * * * *` y comando:

```sh
/app/.venv/bin/python -m app.cli mail-drain --limit 10 --seconds 45
```

Mantenerla pausada hasta completar la configuración y la prueba real autorizada.
Configurar `MAIL_ENABLED=true`, publicar para aplicar los secretos y comprobar
un envío a un destinatario de prueba acordado antes de activar el horario.
La mera presencia de credenciales no demuestra que el envío funciona.

## Entregas, reintentos y diagnóstico

Los mensajes tienen clave de evento única. La tarea utiliza un bloqueo asesor
PostgreSQL para evitar dos procesadores simultáneos. Las llamadas de red tienen
límites de conexión/lectura y tamaño de respuesta; el lote tiene límites de
cantidad y tiempo entre mensajes. No se presupone un timeout universal de Dokploy.

Los fallos anteriores al envío y límites de cuota se reintentan de forma acotada,
con espera creciente y hasta ocho intentos. Si se pierde la respuesta después de
un posible envío, el mensaje pasa a `uncertain`: no se repite automáticamente.
Un Message-ID estable facilita la investigación, pero no se promete deduplicación
del proveedor. El panel `/admin` permite reintentar con confirmación explícita del
riesgo de duplicado cuando corresponda.

Consultar `schedule_logs` y el panel de bandeja de salida. Los logs y errores de
operación usan códigos genéricos; no imprimir tokens, cuerpos OAuth o documentos.
Un `/health` o `/ready` correcto no verifica Gmail. Los tests simulan el proveedor;
la entrega real permanece pendiente mientras no exista un buzón autorizado.

## Referencias oficiales

- Envío: https://developers.google.com/workspace/gmail/api/guides/sending
- OAuth de aplicaciones de servidor: https://developers.google.com/identity/protocols/oauth2/web-server
- Errores de Gmail: https://developers.google.com/workspace/gmail/api/guides/handle-errors
