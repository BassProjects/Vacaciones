> INFORME HISTÓRICO: corresponde a la preparación Next.js del commit 0d2913d, no a la versión Python. La verificación vigente está en [verification-python.md](verification-python.md).

# Evidencia de verificación — 22/09/2026

Proyecto: vacaciones. Repositorio: ElectropolisDokploy/Vacaciones.
Rama: migration/dokploy-assessment.
Base original: 654c2fd4d38b7a5107670428d3c6438b8d46077f.

Las pruebas se ejecutaron sobre el workspace de esa rama, antes de crear el commit de entrega. Los archivos de aplicación no cambiaron después de las pruebas. Posteriormente se añadieron documentación, exclusiones de archivos y el requisito de auditoría al Dockerfile. La imagen Docker completa no se ha construido ni publicado.

## Resultados observados

| Comprobación | Resultado |
| --- | --- |
| npm ci --ignore-scripts --no-audit --no-fund | Instalación finalizada correctamente, sin cambiar dependencias |
| npm test | 27 aprobadas, 0 fallidas, 0 omitidas |
| NEXT_TELEMETRY_DISABLED=1 npm run build | Compilación standalone correcta, código de salida 0 |
| node scripts/smoke-standalone.cjs | Cinco comprobaciones HTTP/arranque aprobadas, proceso temporal detenido al terminar |
| npm audit --omit=dev --json | Código de salida 1; Next critical, PostCSS high y xlsx high |
| Imagen base node:22.23.2-bookworm-slim | Etiqueta consultada en Docker Hub y registrada como activa; imagen no ejecutada |

Job de tests/build: a497a8eb274115876bf38cca1bdd40a7, completed, exit_code 0.
Job de smoke y comprobaciones adicionales: f14e11a1c160dcc8cf026a1e7ac10c00, completed, exit_code 0.
Job de recogida de auditoría: 8b09e8141d435b72e49b4447373be287, completed, exit_code 0. Este último 0 sólo acredita el proceso que recogió el informe: el subproceso npm audit devolvió 1 y no fue satisfactorio.

El Dockerfile final ejecuta npm run check:release, que exige tests, compilación y auditoría sin avisos altos/críticos. No se ha ejecutado la construcción Docker ni declarado superado ese requisito. No es una garantía universal de la plataforma: es un control incluido en este repositorio.

## Qué cubre y qué no cubre

Las 27 pruebas cubren configuración de sesiones y PostgreSQL, rechazo de secretos inseguros, firma/caducidad y entradas malformadas, contraseñas con sales distintas, casos básicos de calendario/medios días y permisos de adjuntos. Las pruebas de db.js usan un pg simulado y verifican consultas de sólo lectura, configuración, administrador activo y reintento tras error. No son pruebas de integración con PostgreSQL real.

La comprobación HTTP comprueba que el entrypoint rechaza la falta de SESSION_SECRET; que /health y / responden 200; que el JavaScript compilado se sirve; y que /ready devuelve 503 sin información sensible cuando no existe conexión a la base. No ejecuta el JavaScript en navegador ni valida login, aprobaciones, cargas de archivos, correos o datos reales.

Se reprodujeron, sin corregir todavía las reglas funcionales: normalización de 2026-02-30 a 2026-03-02 y descuento de medio día cuando el extremo marcado cae en fin de semana. Son hallazgos del informe, no casos corregidos cubiertos por las 27 pruebas.

## Contenido de aplicación comprobado (SHA-256)

```text
package-lock.json 9c42d8e44cc8cc4654e5c86fe3a92e814077f224a8db3061e57daba08735446b
package.json a0392ffb6b400fe0286cf534fe2292e60712558505f6f84a8b73f51b1c708167
next.config.js 0d4213e6e67f54a0a2d16798af9a9a7346bb1c172d0cfb7f89f2f40df27f4c14
lib/auth.js 92f0519315bcf9e2d678b36c9f47902f09918183d23a261e40da17be542362da
lib/db.js bf2da8fedc6dba456e1f978b89c184eaa9481eff2a38c2f7cce36cc3c27f4ac2
lib/runtimeConfig.cjs 04cb3d5ed681c6013ca7cd56e86b2710910efe0d06d2ae9a0ecf830c16822d08
app/health/route.js 5bf77aeb4eaa069b521708b7a0f76d3c397811350f02a75642bfefffb279a0c4
app/ready/route.js ee7d0dfad843e69ffcdefb771757cffc05b8cdfc3d3e1ffd9fb96578c8d34936
tests/core.test.mjs a0a73ea658feccf0193c8edfa803feac12888561c487c4ea4f203bb872cf36f6
scripts/start-dokploy.cjs 8388f518e1d4815a7da094fd9e4c0cc26a15ef64c3ccc7f986e9fd3bcd03e7f6
scripts/smoke-standalone.cjs 0c4b8de6ebc0779d730d4580cf91d48211f95185b26bb780fe34c1fb464c91a9
```

Dockerfile final, revisado pero no construido: 113d52d68a79f532f23e0c8a73d6a64c67d9fc8e4b276561699bd174c6c91126.

## Estado de plataforma al preparar la entrega

Configuración preparada mediante application_configure: PostgreSQL habilitado para la próxima publicación, SCHEMA_MANAGEMENT=external, DATABASE_SSL_MODE=disable para la conexión interna y TZ=Europe/Madrid. Revisión de configuración 1; applied_revision=null y needs_deployment=true. No se configuró almacenamiento /data ni acceso a proveedores externos. No hay secretos introducidos.

Esto no acredita una base creada/restaurada, una imagen publicada, correo operativo ni migración completada. deployment_status no registraba despliegue, imagen ni URL. El trabajo no cambió la configuración de Vercel, sus datos ni DNS.

Pendientes: versiones seguras y pruebas de regresión; permisos de privacidad; PostgreSQL 16 aislado y ensayo de restauración; decisiones funcionales; transporte de correo; credenciales por enlace seguro; construcción Docker; verificación de aplicación publicada y navegador antes del corte definitivo.
