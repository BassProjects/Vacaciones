# Instrucciones del proyecto Vacaciones

Lee `docs/electropolis/rules.md`, `docs/electropolis/architecture.md`, `service.yaml`,
README y los documentos relevantes antes de modificar código. Estándar Electropolis
**1.0.0**, plantilla **web/1.0.0**, Python **3.11**, PostgreSQL **16**.
Si falta una guía, consulta `agent_guide` con su tema y versión mediante el conector.
La migración a Python fue solicitada expresamente por el responsable el 22-09-2026;
consulta `docs/adr/0001-python.md`. No vuelvas a introducir Next.js o un segundo backend
sin una decisión de arquitectura acordada.

## Alcance y estados

Confirma cuenta, proyecto, repositorio, rama y cambios pendientes antes de editar.
Este workspace y su rama pueden compartirse entre chats. Conserva cambios ajenos.
Código escrito, commit subido y producción desplegada son estados diferentes.
No alteres el proyecto Vercel ni borres su base de datos antes de comprobar la transferencia,
la conciliación y el corte de escritura. Consulta `docs/migration-dokploy.md`.

## Comprobaciones obligatorias

`sh scripts/check.sh` ejecuta manifiesto, Ruff y pytest con dependencias bloqueadas.
Las pruebas PostgreSQL requieren `scripts/with_test_postgres.py`; nunca se ejecutan
contra producción ni se sustituyen por SQLite. Las pruebas de navegador usan Chromium
solo en el entorno de desarrollo, procesos supervisados y datos ficticios.
Ejecuta la batería de integración y navegador antes de publicar cambios de reglas,
persistencia, sesiones o interfaz. Registra resultados y revisión en el informe de verificación.
No afirmes que los checks universales independientes del Dockerfile ya existen en la plataforma.

## Diseño y datos

Una aplicación HTTP, sin microservicios por pantalla. Reglas de negocio en módulos Python;
rutas HTTP delgadas, interfaz Jinja2 y módulos JavaScript para el calendario interactivo.
Los saldos se obtienen de `request_days` en PostgreSQL, no de listas paginadas del navegador.
Conserva los cálculos con Decimal y fechas de calendario; instantes UTC, presentación Madrid.
Cambios de esquema únicamente mediante Alembic y operación explícita; nunca desde un arranque
web. No crear administradores ni contraseñas predeterminadas. No borrar historial de empleados:
la acción habitual es desactivar. Los eventos de auditoría son de solo inserción para la aplicación.

## Credenciales y operación

No pedir secretos en el chat ni incluirlos en código, logs, pruebas o Docker. Utiliza
`application_secret_link` solamente cuando el usuario esté preparado para introducirlos.
No generar enlaces con caducidad por adelantado. Los valores de entorno se consultan por nombre,
no se imprimen. El responsable ha elegido SMTP y comienzo desde cero; consulta `docs/smtp.md`.
`MAIL_ENABLED=false` hasta tener SMTP autorizado por la plataforma, credenciales y prueba real.
La plataforma admite SMTP acotado mediante `smtp_egress` y `SMTP_PROXY_URL` inyectado.
Consulta `agent_guide(topic="smtp")`: usa exclusivamente CONNECT autorizado, TLS verificado
contra el servidor SMTP original y ningún fallback directo en producción. No eludas el proxy.
No se necesita importar el origen para crear la primera cuenta; no se borra Vercel.

Las tareas nativas de Dokploy están disponibles en la plataforma actual, como ampliación operativa
del estándar 1.0.0: consulta los contratos reales de `schedule_*`. Publica el CLI antes de crear
una tarea, usa nombres estables, exclusión mutua y límites propios de la app. Nunca simules servicios
mediante procesos en background del workspace. El rollback de una imagen no deshace migraciones,
datos, secretos o programaciones. Publica solo commits reales subidos al repositorio vinculado.
