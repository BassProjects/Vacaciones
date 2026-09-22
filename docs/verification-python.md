# Verificación de la versión Python

Fecha de revisión: 22-09-2026. Repositorio `ElectropolisDokploy/Vacaciones`, rama
`migration/dokploy-assessment`. Base anterior: `0d2913d50ca0b2a05311b51f41aa31a107d1094b`.
Este informe describe el contenido Python probado antes del commit de publicación;
las huellas de los archivos comprobados están en `verification-python-sha256.json`.
No atribuir los resultados al informe histórico Next.js.

## Resultado final del workspace

Después de retirar 48 archivos obsoletos de Next/Node, se ejecutó:

```sh
for f in app/static/js/*.js; do node --check "$f"; done
export PATH="$PWD/.tools/bin:$PATH"
.venv/bin/python scripts/with_test_postgres.py sh scripts/check.sh
```

Resultado: **54 tests aprobados, 0 fallos**, manifiesto correcto, Ruff sin errores y
formato correcto. Job del conector `1a72338b67e503f204f77de6729806c8`, salida final
`completed`, código 0. PostgreSQL 16.15 y los procesos de navegador/web temporales se
detuvieron al finalizar. Todos los usuarios, archivos y datos de estas pruebas eran
sintéticos; no se usaron credenciales ni registros de producción.

La auditoría `pip-audit --progress-spinner off` de las dependencias Python instaladas
informó «No known vulnerabilities found». Eso significa ausencia de avisos conocidos
en esa consulta, no certificación de seguridad del código. Las versiones quedan
bloqueadas en `uv.lock`. Node se empleó solo para comprobar sintaxis de módulos de
navegador en desarrollo; no se incluye en la imagen de producción.

## Cobertura

Fechas reales e imposibles, bisiestos, medios días, reparto entre ejercicios,
jornadas individuales, prorrateo, saldos/arrastres y compatibilidad scrypt heredada.
Sesiones revocables, CSRF, permisos entre trabajador/responsable/administrador,
limitación de intentos, cambio de contraseña, protección del último administrador y
privacidad del calendario/cumpleaños. Creación y aprobación/cancelación, motivos,
solapamientos, reintentos idempotentes y concurrencia con una sola solicitud ganadora.

Persistencia con PostgreSQL 16 real, migración idempotente sin administrador por defecto,
auditoría que rechaza modificación/borrado/truncate ordinarios, saldos correctos con
más de 1.000 solicitudes y reportes que distribuyen por día y año. Desactivación sin
pérdida de historial. Justificantes con contenido real, permisos y descarga segura.

Importaciones de festivos/Calamari con previsualización y confirmación idempotente,
rollback ante errores, horas fraccionarias preservadas, exportación/reimportación y
texto de empleados que no se convierte en fórmulas de Excel. Ensayo de exportación
heredada, conservación de IDs/hashes/adjuntos/totales, rechazo de archivos inconsistentes
y restauración real de una copia con `pg_dump`/`pg_restore` en otra base aislada.

Gmail API se probó mediante respuestas simuladas: OAuth, mensaje MIME, escapado HTML,
clasificación de fallos, límites de cuota y no repetición automática de entrega incierta.
No se envió correo real. Chromium ejecutó flujos completos en escritorio y móvil:
acceso, solicitud, aprobación con otra cuenta y guardado de configuración; sin errores
JavaScript ni solicitudes de recursos externos en esos casos.

## Avisos y límites

La ejecución produjo avisos de deprecación del entorno de TestClient/HTTPX/AnyIO y de
la configuración de rutas de Alembic. No causaron fallos; deben revisarse al actualizar
esas herramientas. No se añadió una actualización forzada de dependencias para silenciarlos.

La construcción Docker vuelve a ejecutar los tests disponibles sin datos de producción.
Los tests de integración/navegador se omiten allí si no existe el supervisor PostgreSQL;
la ejecución completa descrita arriba se realizó en el workspace aislado. No existe aquí
una garantía universal independiente del Dockerfile impuesta por el publicador.

Pendientes externos: datos reales de Vercel/PostgreSQL, credenciales Gmail, entrega real,
conciliación final, acceso de usuarios reales, DNS y retirada de recursos Vercel.
La recuperación autónoma por enlace no se ha entregado por un bloqueo de la herramienta
sobre su formulario; sigue disponible el restablecimiento administrativo.
No se han hecho pruebas de carga de producción ni auditoría externa de penetración.

La disponibilidad publicada debe comprobarse aparte con `deployment_status` y
`deployment_probe`. `/health` 200 no significa que haya empleados transferidos o correo
activo; `/ready` requiere esquema, configuración y administrador activo. Hasta completar
la transferencia, el destino puede mostrar activación pendiente.
