# Vacaciones Sepiamary

Aplicación web para gestionar vacaciones y ausencias de los empleados de Sepiamary.

## Estado de la migración

La rama `migration/dokploy-assessment` prepara la migración de Vercel a Dokploy y documenta la evaluación técnica. **No equivale a una aplicación publicada ni a una base de datos transferida.** Conserva Next.js, React y PostgreSQL; no incorpora un segundo backend ni sustituye la aplicación por otra plantilla.

La publicación está pendiente de corregir las dependencias afectadas por avisos de seguridad, resolver los hallazgos prioritarios y ensayar la restauración de datos y el transporte de correo. No retirar Vercel ni permitir escrituras en dos bases independientes durante la transición.

- [Evaluación técnica y propuesta de refactorización](docs/technical-assessment.md)
- [Configuración, transferencia de datos y recuperación en Dokploy](docs/migration-dokploy.md)

## Tecnología y funciones existentes

Next.js 14 (App Router, JavaScript), React 18 y PostgreSQL mediante `pg`. Las rutas de `app/api` constituyen el backend. La autenticación utiliza cookies firmadas HMAC y contraseñas derivadas con scrypt.

La aplicación contiene gestión de empleados y roles, calendario de equipo, solicitudes y aprobaciones, medios días, festivos, importación histórica de Calamari, exportaciones mensuales y adjuntos en PostgreSQL. El correo heredado usa Gmail/Workspace mediante SMTP; los enlaces de Google Calendar permiten añadir eventos, no realizan sincronización automática.

El informe técnico distingue las funciones identificadas en el código de las verificadas mediante pruebas.

## Desarrollo y comprobaciones

Entorno comprobado: Node.js 22.23.2 y npm, con las versiones exactas de `package-lock.json`.

```bash
npm ci --ignore-scripts --no-audit --no-fund
npm test
NEXT_TELEMETRY_DISABLED=1 npm run build
node scripts/smoke-standalone.cjs
```

La prueba HTTP usa un proceso temporal con configuración sintética, sin acceder a PostgreSQL ni a credenciales de producción, y lo detiene al terminar. No ejecuta JavaScript en navegador ni sustituye las pruebas de negocio.

```bash
npm run check:release
```

Este último comando incluye auditoría de dependencias. En la evaluación inicial hay avisos altos/críticos, por lo que **la comprobación de publicación no está superada**. No ejecutar `npm audit fix --force` sin evaluar y probar los cambios de versión mayor.

Para desarrollo funcional, configurar una base PostgreSQL de pruebas aislada y las variables de entorno indicadas en la guía de migración. `SESSION_SECRET` debe ser aleatorio y tener al menos 32 caracteres: ya no existe una clave predeterminada válida. No utilizar datos ni credenciales de producción para pruebas.

El código heredado puede inicializar una base de desarrollo cuando `SCHEMA_MANAGEMENT` no es `external`; si falta administrador exige `BOOTSTRAP_ADMIN_PASSWORD` de al menos 16 caracteres. Ese mecanismo conserva compatibilidad con el desarrollo previo, pero **no es el procedimiento de migración a Dokploy**. En Dokploy el entrypoint exige `SCHEMA_MANAGEMENT=external` y un esquema previamente restaurado y comprobado; no crea tablas, empleados ni festivos desde las peticiones.

```bash
npm run dev
```

## Despliegue preparado para Dokploy

El Dockerfile usa salida standalone, un único servidor HTTP en `0.0.0.0:8080`, usuario 1000 y caché temporal en `/tmp`. `/health` comprueba que el servidor responde; `/ready` comprueba configuración y base de datos con respuesta genérica ante errores. Son comprobaciones distintas.

Las conexiones PostgreSQL verifican certificados por defecto. `DATABASE_SSL_MODE=disable` se reserva a la conexión interna autorizada de la plataforma, no a proveedores externos. No dejar una variable `POSTGRES_URL` del origen junto con `DATABASE_URL` del destino: el alias heredado tiene prioridad.

Los adjuntos están en `request_attachments.data`, por lo que la copia de PostgreSQL debe incluirlos. No se requiere `/data` para el diseño actual. Las credenciales se introducen mediante enlaces seguros de la plataforma, nunca en el chat, Git o la imagen.

## Correo y configuración de origen

El transporte existente utiliza `smtp.gmail.com:465` con `GMAIL_USER`, `GMAIL_APP_PASSWORD` y, opcionalmente, `MAIL_FROM`. Las herramientas actuales de esta plataforma no autorizan SMTP arbitrario: añadir un dominio a la salida HTTPS no habilita el puerto 465. Antes de conservar los avisos e invitaciones en Dokploy debe acordarse y probarse un transporte HTTPS, por ejemplo Gmail API.

`APP_URL` debe apuntar a la dirección HTTPS real del destino. El código heredado también reconoce `VERCEL_URL`; sin configurar la URL del destino, algunos correos seguirían enlazando a Vercel. Esta rama no cambia las variables, el dominio, los datos ni la configuración del proyecto Vercel.
