# ADR 0001 · Migración explícita a Python

Fecha: 22-09-2026. Estado: aceptada por petición expresa del responsable.

## Contexto y decisión

El repositorio provenía de Vercel con Next.js 14, React, PostgreSQL mediante `pg`,
SMTP Gmail y una interfaz de 3.551 líneas. Ya existía un backend; la ausencia de un
segundo lenguaje no era el problema. La primera evaluación aconsejaba conservar
Next.js y modularizar. El responsable solicitó después usar Python para homogeneizar
la operación y el diagnóstico con las otras aplicaciones Electropolis.

Se adopta un único servicio Python 3.11/FastAPI/Pydantic/SQLAlchemy/Alembic,
PostgreSQL 16, Jinja2 y módulos JavaScript nativos para la interacción de calendario.
Se conserva el diseño visual y los activos locales; no se añade una cadena de
compilación Node, Tailwind ni otro framework de interfaz sin necesidad.
Se conserva el estándar Electropolis 1.0.0 y su plantilla web/1.0.0. La versión de
la aplicación 2.0.0 es distinta de la versión del estándar.

## Separación de responsabilidades

- `app/routes/`: contratos HTTP, permisos de entrada y respuestas.
- `calendar_rules.py`, `balances.py`, `leave_service.py`, `reporting.py`: reglas y consultas de negocio.
- `models.py`, `db.py`, `migrations/`: persistencia, restricciones y evolución versionada.
- `security.py`: sesiones opacas revocables, CSRF, contraseñas y límites de intentos.
- `file_parsers.py`, `file_worker.py`, `uploads.py`: importación y archivos con recursos acotados.
- `mailer.py`, `cli.py`: bandeja de salida, Gmail API y operaciones explícitas.
- `app/static/js/`: módulos de interfaz por función, sin autorización exclusiva en el navegador.

Las funciones de interfaz comparten un estado de aplicación pequeño para conservar
el comportamiento existente. La extracción en módulos no equivale a reescribir
cada pantalla desde cero. Las reglas definitivas y los saldos están en el servidor.

## Persistencia y compatibilidad

El esquema Python usa tablas nuevas; no transforma silenciosamente las tablas de
origen. La transferencia inicial requiere destino vacío, archivo autorizado,
huella SHA256, conciliación y transacción única. Se conservan los identificadores,
el histórico disponible y los bytes de los justificantes. Las sesiones antiguas
no se transfieren. Se comprueban las contraseñas scrypt heredadas y se actualizan
cuando es posible al iniciar sesión; las débiles exigen cambio.

No es posible reconstruir decisiones que el sistema antiguo sobrescribió ni
conocer horas diarias que no almacenó. El importador conserva el total original,
registra cuándo tuvo que inferir el reparto y detiene datos inconsistentes.

## Operación y límites

Una réplica, 1 CPU y 512 MiB; no se promete escalado ni alta disponibilidad.
No hay Redis/Celery, trabajos residentes dentro del servidor web ni servicios
adicionales por pantalla. Los archivos adjuntos permanecen en PostgreSQL; `/data`
no es necesario. El transporte Gmail usa HTTPS y el proxy autorizado.

La guía común copiada conserva literalmente sus límites históricos. El conector
actual añade tareas nativas `schedule_*` para la aplicación publicada: se usan
como ampliación operativa sin cambiar el estándar. La exclusión mutua, reintentos
y límites los implementa esta aplicación; no se presuponen en Dokploy.

El control de acceso por enlace de recuperación autónoma no forma parte de esta
entrega: la herramienta de edición bloqueó el formulario correspondiente. No se
eludió ese bloqueo. El acceso inicial y los restablecimientos se administran
mediante la interfaz ya existente, sin enviar contraseñas por correo.
