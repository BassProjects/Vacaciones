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
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURITY` | `smtp.gmail.com` / `465` / `ssl`, o STARTTLS en 587. |
| `SMTP_USER` | Buzón SMTP completo. Alias compatible: `GMAIL_USER`. |
| `SMTP_PASSWORD` | Secreto SMTP por canal seguro. Alias compatible: `GMAIL_APP_PASSWORD`. |
| `MAIL_FROM` | Remitente autorizado opcional; por defecto el usuario SMTP. |

No se necesitan `SESSION_SECRET`, `VERCEL_URL`, los alias `POSTGRES_URL`/
`POSTGRES_PRISMA_URL`/`POSTGRES_URL_NON_POOLING`, `SCHEMA_MANAGEMENT`,
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` ni `GMAIL_REFRESH_TOKEN`.
No copiar indiscriminadamente las variables de Vercel.
Las sesiones nuevas son tokens opacos revocables; las sesiones antiguas no se transfieren.

## Capacidades

Configurar `database=true`, `persistent_data=false`. Los justificantes forman parte de
PostgreSQL, no de un volumen `/data`. Solo se requiere un servicio HTTP en 8080.
SMTP requiere una capacidad TCP autorizada de la plataforma. El conector actual
no habilita 465/587; no confundir egress HTTPS con SMTP. El envío se mantiene apagado.
No exponer la base de datos ni eludir el proxy. Consultar `smtp.md`.

## Alta inicial y transferencia

`BOOTSTRAP_ADMIN_EMAIL` es opcional. `BOOTSTRAP_ADMIN_USERNAME`, `BOOTSTRAP_ADMIN_NAME` y
`BOOTSTRAP_ADMIN_PASSWORD` solo son necesarios para un alta explícita cuando no existan
usuarios en la instalación. El responsable ha elegido partir de cero. La contraseña debe tener entre 8 y 256 caracteres;
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
