# Migración de Vacaciones a Dokploy

Fecha: 22 de septiembre de 2026. Estado: preparación técnica; NO publicada.
Repositorio: ElectropolisDokploy/Vacaciones. Rama: migration/dokploy-assessment.
Base inspeccionada: 654c2fd4d38b7a5107670428d3c6438b8d46077f.

## Arquitectura conservada

La aplicación existente es Next.js 14 (App Router) + React 18 + PostgreSQL mediante pg. Sus Route Handlers son un backend real. No se ha sustituido por una plantilla Python, no se ha añadido otro servicio y no se ha migrado a otro framework ni a otra versión mayor. No existían AGENTS.md, service.yaml, Dockerfile ni pruebas en el árbol importado. La ausencia de manifiesto no se interpreta como autorización para migrar el estándar del proyecto.

Dockerfile prepara un único servicio HTTP Node 22.23.2, puerto 8080, UID/GID 1000, salida standalone y caché temporal bajo /tmp. La plataforma operará una réplica con sus límites actuales de memoria y CPU. La compilación de Next limita sus workers a uno; no se han realizado pruebas de carga.

Los adjuntos se almacenan en request_attachments.data (BYTEA). No se necesita /data para el diseño actual. La migración debe incluir esos bytes, no solamente empleados y solicitudes. No se requiere Redis ni un servicio por pantalla. No hay vercel.json ni tareas cron declaradas en el repositorio inspeccionado.

## Configuración

| Variable | Uso | Tratamiento |
| --- | --- | --- |
| SESSION_SECRET | Firma de sesiones, al menos 32 caracteres aleatorios | Secreto; introducir mediante application_secret_link. No reutilizar el valor predeterminado antiguo. |
| DATABASE_URL | Conexión a PostgreSQL del destino | Configuración de PostgreSQL de la plataforma; no copiar valores a Git ni al chat. |
| POSTGRES_URL / POSTGRES_PRISMA_URL / POSTGRES_URL_NON_POOLING | Alias heredados de conexión | Se conservan por compatibilidad. POSTGRES_URL tiene prioridad; no dejar simultáneamente una conexión antigua y la del destino. |
| DATABASE_SSL_MODE | verify-full por defecto; disable sólo para la conexión interna autorizada | No se desactiva la comprobación de certificados de un servidor externo. require también verifica certificados. |
| SCHEMA_MANAGEMENT | external en Dokploy | Obligatorio en el entrypoint. Evita CREATE, ALTER y semillas desde las peticiones HTTP. |
| APP_URL | URL HTTPS final de esta aplicación | Obtener del despliegue real; necesaria para no enviar enlaces al Vercel antiguo. |
| NODE_ENV / HOSTNAME / PORT / TZ | production / 0.0.0.0 / 8080 / Europe/Madrid | Valores no secretos establecidos por Dockerfile. |
| GMAIL_USER / GMAIL_APP_PASSWORD / MAIL_FROM | Envío SMTP heredado | NO activar dando por supuesto que el puerto 465 es accesible. Ver apartado de correo. |

El modo heredado de inicialización permanece para compatibilidad en desarrollo, fuera del entrypoint de Dokploy. Si no existe administrador exige BOOTSTRAP_ADMIN_PASSWORD de al menos 16 caracteres, sin contraseña fija. No utilizar ese modo como procedimiento de migración de producción. Quitar una contraseña predeterminada del código no cambia las contraseñas de usuarios ya existentes.

## Qué está comprobado

- npm ci --ignore-scripts --no-audit --no-fund: dependencias bloqueadas instaladas en el workspace aislado.
- npm test: 27 pruebas aprobadas; configuración, sesiones, contraseñas, días laborables y permisos de adjuntos; control de flujo de db.js con pg simulado.
- NEXT_TELEMETRY_DISABLED=1 npm run build: compilación standalone finalizada con código 0.
- node scripts/smoke-standalone.cjs: rechaza arranque sin SESSION_SECRET; /health y / responden 200; sirve el JavaScript compilado; /ready responde 503, con cuerpo genérico, cuando la base no existe. El proceso temporal se termina al finalizar la prueba.
- Se comprobó que la etiqueta oficial node:22.23.2-bookworm-slim existe y figura activa. No se ha construido ni ejecutado la imagen Docker real.

Los tests de db.js usan un doble de prueba: NO acreditan compatibilidad real, restauración ni migraciones de PostgreSQL. La prueba HTTP no ejecuta JavaScript en navegador y no prueba login, aprobaciones ni adjuntos con datos reales. Las advertencias de Node sobre detección de módulos y VM experimental pertenecen al harness de pruebas; sigue pendiente normalizar esa configuración. El script lint heredado no constituye una configuración completa de ESLint/TypeScript.

La auditoría npm --omit=dev devuelve código 1: tres dependencias afectadas, una clasificada critical (Next), dos high (PostCSS y xlsx). El proceso que recogió el informe terminó correctamente, pero la auditoría NO fue satisfactoria. No se ejecutó npm audit fix --force ni se actualizó Next/React de manera implícita. check:release incluye tests, build y auditoría; no debe considerarse superado mientras persistan avisos altos/críticos aplicables.

## Procedimiento de datos y puesta en servicio — pendiente de ejecutar

1. Identificar el proveedor, versión mayor real, tamaño y extensiones de PostgreSQL de origen. El README menciona Neon como ejemplo de Vercel, no demuestra que sea el proveedor actual. No hay acceso a la base de origen ni sus credenciales en esta conversación.
2. Obtener una copia protegida y verificable mediante un procedimiento autorizado. Utilizar pg_dump compatible con la versión del origen. No guardar dumps, registros personales ni credenciales en Git, /public o las imágenes. Si el origen usa una versión posterior a PostgreSQL 16, comprobar compatibilidad antes de elegir una restauración directa al destino.
3. Preparar un PostgreSQL 16 AISLADO para el ensayo, con usuarios y datos sintéticos para pruebas funcionales. El conector no ofrece un entorno administrado de tests/migraciones de base. No sustituirlo por SQLite ni utilizar producción como banco de pruebas. La inspección de una copia real, cuando sea necesaria para la transferencia, requiere el procedimiento y permisos adecuados para datos de empleados.
4. Ensayar la restauración del esquema existente y documentar su resultado. Esta rama no introduce ALTER de producción: en modo external sólo valida tablas, columnas, configuración y existencia de administrador activo. Futuras modificaciones del esquema deben incorporarse como migraciones numeradas y transaccionales, separadas del arranque web.
5. Verificar recuentos y claves de users, requests, holidays, app_config y request_attachments; importes de días por persona/año/estado; referencias huérfanas; tamaños y hash de los adjuntos; usuarios desactivados; roles; administrador sin la contraseña inicial conocida. No publicar datos individuales en los logs del ensayo.
6. Resolver primero los bloqueantes del informe técnico: versiones con soporte, privacidad de notas, sesiones, validación de fechas y política de saldos; acordar e implementar el transporte de correo. Probar API y navegador con cada rol y datos sintéticos, incluidos permisos negativos y duplicados.
7. Preparar PostgreSQL propio y variables mediante application_configure. Esos cambios se aplican al publicar; una configuración preparada no acredita que la base esté creada, restaurada ni accesible. Inyectar SESSION_SECRET por enlace seguro. No solicitar secretos por el chat.
8. Acordar un corte de escrituras: mantener Vercel operativo durante el ensayo y congelar escrituras durante la copia definitiva. No dejar Vercel y Dokploy aceptando cambios en dos bases divergentes. Guardar copia final verificada, restaurar destino y repetir conciliación.
9. Publicar exclusivamente un commit real ya subido y comprobado. Usar 8080 y /health; seguir deployment_status hasta estado final y comprobar /, /health y /ready mediante deployment_probe. /ready debe responder 200 sobre el esquema restaurado. Completar las pruebas de negocio con navegador real; un probe no ejecuta JavaScript.
10. Cambiar el acceso de empleados/dominio solamente tras esas comprobaciones. Mantener el origen preservado para recuperación hasta aceptar el destino. No se ha modificado DNS ni eliminado el Vercel actual.

## Recuperación

Antes del corte, la recuperación consiste en continuar con el origen no modificado. Si ya hay nuevas escrituras en Dokploy, volver a apuntar a Vercel sin conciliarlas perdería esos cambios: se requiere congelación y reconciliación de datos. El rollback de imagen no revierte base, esquema, secretos, configuración ni horarios. Una restauración destructiva exige autorización específica, una copia previa y verificación de consistencia.

Consultar platform_status para comprobar el estado real de copias/avisos. Las capacidades locales de copia de la plataforma no equivalen a recuperación frente a pérdida completa del servidor. Definir retención, responsables, una copia fuera del servidor si se requiere y un ensayo periódico de restauración; aquí no se ha creado ni certificado ninguna copia.

## Correo

lib/mailer.js conecta a smtp.gmail.com:465. La conexión actual permite autorizar destinos HTTPS y servicios internos; no proporciona en sus herramientas una autorización de SMTP arbitrario. Añadir smtp.gmail.com a egress_hosts no demuestra que SMTP funcione. No se ha intentado desactivar restricciones ni se ha probado envío real.

Propuesta: adaptar el envío a Gmail API por HTTPS conservando el buzón de Workspace, o elegir otro transporte HTTPS aprobado. Requiere configurar autorización y secretos por el mecanismo seguro. Centralizar el escape de HTML en plantillas y registrar entregas/reintentos. Una outbox transaccional en PostgreSQL y un script idempotente activado mediante tareas nativas de Dokploy pueden evaluarse sin añadir Redis; todavía NO están implementados ni programados.

## Referencias oficiales consultadas

- Política de soporte Next.js: https://nextjs.org/support-policy
- Self-hosting: https://nextjs.org/docs/app/guides/self-hosting
- Salida standalone: https://nextjs.org/docs/app/api-reference/config/next-config-js/output
- TLS de pg: https://node-postgres.com/features/ssl
- Distribución actual de SheetJS: https://docs.sheetjs.com/docs/getting-started/installation/nodejs/
- Envío con Gmail API: https://developers.google.com/workspace/gmail/api/guides/sending
