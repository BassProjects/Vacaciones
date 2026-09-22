# Arquitectura común 1.0.0

## Perfil del piloto

La base para nuevas aplicaciones HTTP es Python 3.11, FastAPI, Pydantic, Uvicorn y HTTPX cuando haya integraciones. Para interfaz: HTML semántico, Jinja2 si se renderiza en servidor, Tailwind compilado cuando se necesite ese sistema de estilos, Alpine/JavaScript sólo para interacción que lo justifique. La plantilla HTTP mínima no incorpora una cadena Node ni un framework de interfaz innecesario. Python usa `uv`, `pyproject.toml`, `uv.lock`, pytest y Ruff. Las versiones exactas están en la plantilla, no se resuelven de nuevo al crear cada app.

PostgreSQL 16 es el motor ya operado por la plataforma. Para persistencia relacional, SQLAlchemy y Alembic son el perfil previsto; añadirlos cuando exista una necesidad real y se hayan preparado pruebas/migraciones. MySQL no se instala por la sugerencia de una propuesta anterior. PHP, otros motores o frameworks requieren una decisión documentada del responsable; las apps existentes conservan su tecnología.

## Contratos

- Un servicio agrupa una capacidad de negocio y publica su API documentada; HTTP/OpenAPI cuando corresponda. Evitar dependencias circulares y tablas compartidas entre apps. Integraciones Magento mediante interfaces autorizadas; consultar otros repos externos sigue pendiente.
- HTTP en `0.0.0.0:8080`; `/health` comprueba vida y `/ready` disponibilidad. Cuando haya dependencias críticas, readiness debe comprobarlas con límites sin revelar secretos; liveness no debe depender de un proveedor externo.
- Configuración por entorno, secretos fuera del código y validación al arrancar. Logs estructurados a stdout con identificador de correlación, sin tokens ni cuerpos completos por defecto. Timeouts de red, límites de respuesta y reintentos sólo seguros/idempotentes.
- Importe decimal con moneda explícita. Instantes en UTC, presentación según la necesidad de negocio; programaciones con zona horaria explícita.
- Código sin estado local duradero; sólo `/tmp` es temporal. `/data` opcional para archivos persistentes, con límites actuales del host. Una base y credenciales propias por app; nunca usar producción para tests.
- Migraciones versionadas y ejecutadas una vez mediante procedimiento controlado; no en cada arranque/réplica. Integración contra PostgreSQL 16 aislado y pruebas de migración antes de publicar persistencia. No sustituirlo silenciosamente por SQLite. Recuperación de datos separada de rollback de imagen.

## Capacidad implementada y límites

El publicador actual opera un servicio HTTP por app, una réplica, UID 1000, raíz de sólo lectura, `/tmp`, 512 MiB y 1 CPU. Admite `/data`, PostgreSQL, variables/secretos y destinos HTTPS/servicios internos explícitos mediante `application_configure`. Cambios de configuración se aplican en la siguiente publicación. El proxy exige clientes que respeten las variables de proxy. No publicar bases de datos ni puertos auxiliares.

No hay perfil operativo de jobs/cron, Redis/Celery, escalado horizontal automático, despliegue sin interrupción, PRs desde MCP ni entorno administrado de migraciones/tests de DB. No simularlos con procesos en background ni programadores dentro de cada réplica. Una necesidad de esas capacidades exige ampliar la plataforma antes de prometer su funcionamiento.

Diseñar servicios sin estado facilita futuras réplicas, pero `/data` local y una base local no proporcionan alta disponibilidad. Las copias cifradas y avisos son locales por decisión del propietario; no resisten la pérdida completa del servidor.

## Entrega sin GitHub Actions

Workspace aislado → checks de la app → commit/push → construcción en servidor → publicación por digest → comprobación HTTPS y del flujo relevante. El Dockerfile de la plantilla ejecuta los checks durante su construcción para volver a comprobar el código del commit. Un fallo impide generar esa imagen.

Esto no es todavía un control universal e inalterable del publicador: un Dockerfile ajeno o modificado podría omitir los tests. Los permisos y el aislamiento sí están aplicados por el servidor. Quedan pendientes la validación obligatoria independiente del repositorio y las pruebas de negocio de la imagen antes de promoverla; no afirmar que ya existen.

`service.yaml` fija versión de estándar/plantilla, runtime, puerto y salud. Es un manifiesto de desarrollo comprobado por la plantilla; no concede permisos ni reconfigura Dokploy automáticamente. El estado autorizado del servidor prevalece sobre lo que declare el archivo.
