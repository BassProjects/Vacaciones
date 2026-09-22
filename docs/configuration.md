# Configuración de Vacaciones Python

Consulta nombres y estado mediante `application_settings`, nunca imprimas sus valores.
La plataforma aplica cambios de configuración y secretos en la siguiente publicación.

| Variable | Uso |
|---|---|
| `DATABASE_URL` | PostgreSQL propio de la app, generado por la plataforma. |
| `DATABASE_SSL_MODE` | `verify-full` por defecto; `disable` solo en el PostgreSQL interno autorizado. |
| `APP_ENV` | `production` en Dokploy; `test` solo en pruebas aisladas. |
| `APP_URL` | Origen HTTPS real, sin ruta, parámetros ni credenciales. |
| `TZ` | `Europe/Madrid`; los instantes se guardan en UTC. |
| `MAIL_ENABLED` | `false` hasta comprobar el buzón y sus credenciales. |
| `GMAIL_FROM` | Buzón remitente autorizado. |
| `GOOGLE_CLIENT_ID` | Identificador del cliente OAuth autorizado. |
| `GOOGLE_CLIENT_SECRET` | Secreto OAuth, exclusivamente por el canal seguro. |
| `GMAIL_REFRESH_TOKEN` | Credencial de renovación OAuth, exclusivamente por el canal seguro. |

No se necesitan `SESSION_SECRET`, `VERCEL_URL`, los alias `POSTGRES_URL`/
`POSTGRES_PRISMA_URL`/`POSTGRES_URL_NON_POOLING`, `SCHEMA_MANAGEMENT`,
`GMAIL_USER` ni `GMAIL_APP_PASSWORD`. No copiar indiscriminadamente las variables de Vercel.
Las sesiones nuevas son tokens opacos revocables; las sesiones antiguas no se transfieren.

## Capacidades

Configurar `database=true`, `persistent_data=false`. Los justificantes forman parte de
PostgreSQL, no de un volumen `/data`. Solo se requiere un servicio HTTP en 8080.
Para Gmail, autorizar HTTPS a `oauth2.googleapis.com` y `gmail.googleapis.com`.
HTTPX respeta el proxy; no habilitar SMTP ni exponer la base de datos.

## Alta inicial y transferencia

`BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_NAME` y
`BOOTSTRAP_ADMIN_PASSWORD` solo son necesarios para un alta explícita cuando no exista
un administrador activo transferido. La contraseña debe tener al menos 16 caracteres;
se exige cambiarla al entrar. El CLI rechaza sobrescribir una cuenta o repetir el alta
si ya existe un administrador activo. Retirar estas variables tras comprobar el acceso.

`MIGRATION_ARCHIVE_URL` y `MIGRATION_ARCHIVE_SHA256` permiten transferir un archivo
privado HTTPS y comprobar su huella. El dominio debe autorizarse expresamente.
Retirar después tanto las variables como la autorización temporal de salida.

`SOURCE_DATABASE_URL` se utiliza únicamente en el entorno autorizado que ejecute la
exportación del origen, con permisos de lectura y TLS revisados. No se configura
rutinariamente en producción del destino ni se imprime en comandos o logs.

No solicitar secretos en el chat. Cuando la persona confirme que está preparada,
generar `application_secret_link`; nunca por adelantado porque caduca. No almacenar
archivos de transferencia, credenciales o datos de empleados en Git o imágenes.
