# Verificación: gestión de trabajadores y registro por invitación

Fecha: 24-09-2026. Proyecto `vacaciones`, cuenta `BassProjects`, repositorio
`ElectropolisDokploy/Vacaciones`, rama `main`. Base guardada/publicada:
`c206137dcf185f56a3418bcc96bf5f4e3a713ffb`.

## Alcance implementado

La lista permite desactivar, reactivar y eliminar individualmente. El borrado exige
confirmación exacta del usuario y ausencia de historial/datos asociados. No se borran
solicitudes ni auditoría en cascada. Se protegen la propia cuenta y el último
administrador registrado activo. La suspensión conserva datos y revoca accesos.

Las invitaciones nuevas incluyen registro con nombre, fecha de nacimiento obligatoria,
contraseña de 8 a 256 caracteres y confirmación. Correo y usuario están ligados a la
invitación. Compartir día/mes del cumpleaños sigue siendo opcional y no publica el año.
Hay reenvío explícito de enlaces para pendientes, limitado e idempotente. Los enlaces
son de un solo uso, duran 48 horas y solo se almacenan como huellas. No se envían
contraseñas ni se permite saltarse el registro mediante recuperación de contraseña.

Nueva migración `0002_onboarding`: distingue registro pendiente de suspensión y añade
la tabla de activaciones. Se ensayó upgrade idempotente desde 0001, conservación de
contraseñas/cuentas utilizadas y downgrade seguro con datos ficticios. Consulta el
procedimiento y sus límites en `onboarding-and-workers.md`; no basta un rollback de imagen.
El estándar de la aplicación permanece en 1.0.0 y no se han cambiado dependencias.

## Pruebas ejecutadas

Trabajo de formato/importaciones `53714954f1954999bf37fdb2d1fc14aa`: completed, salida 0.
Trabajo final `6b00b49b58f6a06fd69050297a61c38f`: completed, salida 0.
Se comprobó sintaxis de los seis módulos JavaScript nuevos/modificados con `node --check`.
La batería completa usó:

```sh
export PATH="$PWD/.tools/bin:$PATH"
uv run --locked python scripts/with_test_postgres.py sh scripts/check.sh
```

Resultado: manifiesto correcto, Ruff correcto, formato correcto y **191 pruebas superadas,
0 fallidas y 0 omitidas**. Se emitieron 92 avisos existentes de obsolescencia de
Starlette/TestClient, AnyIO y configuración de Alembic. No se han actualizado esas dependencias.

Cobertura nueva: registro completo y posterior inicio de sesión; campos obligatorios,
fecha inválida/futura, mínimo de ocho y repetición de contraseña; protección contra
cambio de rol/correo; CSRF/origen; caducidad y uso único; dos registros simultáneos;
no reutilizar enlaces tras suspensión, reactivación, cambio de correo o reenvío;
no eludir el registro con contraseña/restablecimiento; reenvío idempotente sin duplicar
cuentas; eliminación confirmada, permisos y conservación de historial/auditoría;
suspensión y reactivación conservando contraseña; protección frente a sustituir al último
administrador por otro aún no registrado; migración y downgrade sobre datos sintéticos.

Chromium ejecutó registro, validación del formulario e inicio de sesión real en escritorio
(1365 px) y móvil (390 px), además de los botones de suspensión/reactivación/eliminación
con confirmación. Se ejecutaron también las pruebas anteriores de sesiones, contraseñas,
calendario, permisos, adjuntos, correo simulado, informes, importaciones y recuperación.
PostgreSQL 16 fue temporal, supervisado y limitado a loopback; los procesos se cerraron
y se retiraron sus datos. SMTP fue simulado. No se utilizaron credenciales ni cuentas
reales para las pruebas ni se enviaron mensajes a trabajadores.

## Contenido comprobado

Trabajo de lectura de huellas `3949c3786b0e1d2ca2011d15ef821ee0`, completed, salida 0.
Los siguientes 26 archivos de aplicación/migración/pruebas corresponden al contenido
verificado. Después de la batería solo se han editado documentos.

```text
373ae1a71523fcde05d578af6536fa92e2350a862039f3a8b678ba65df5048d1 app/cli.py
97cdb581c25eb891c2b3e1d48bac056fae7a6c66388bc1f790722e2a270e3cf9 app/db.py
706533f39f09ad40e7fc6a5db376108d950d1b282137bcc477aaa761f01666a1 app/invitation_delivery.py
8268413de06a119a15274c346874b1551bc0224ef57792fc1d6433ae33e21709 app/mailer.py
9c1eef1e9453768468b9dcea0f0b607d8cf923f6207ca66731d69d56112f9c55 app/main.py
4d9da335b1483362388c0ef633702ddf5545793c216191fa015a8da2ce5c51fd app/models.py
0356dcd588a41e27df63067c1e55d0c79878ab598e6e882b7cbce1d9776b43fc app/permissions.py
d7b8c4f05c103ccda665ad7db544f8b127907ee4059872a563f58aaf71af47fa app/routes/auth.py
271f5735a507c15208ae12ea1f0defac356c4a25e0b7c0a71db3aeefa74e5dc7 app/routes/users.py
3ff09e4e7fea310913875ec70efc0814bfb94744b474d505f2359e98aecbb5c4 app/security.py
8f64805c472f3f5d6595672e8d0755efdae369ade7e94f0c47e64ed4d72c5be3 app/static/js/employee-dialogs.js
873c663649ac83bf798703b1110f3945bb66f2b4d3614c29965376ebced6d820 app/static/js/employees.js
6727eeb0570c373677b3ce8fcb29059322b4a12723c56294f7e25a92c6c91294 app/static/js/events.js
a878fa26f8fdff69538218e0d935905741194c2f55b2419b1ee31c7b97e3dcd6 app/static/js/request-dialogs.js
054f5c6fe3c741ce513c8a1ed044b1cfdfd55747d213fad6d384ec22a4ead4de app/onboarding.py
eab8752ae286fe85578e79013c7a340f6fc79012a9e36560dd98a8befc7249ba app/routes/employee_management.py
31b653d4be55ca8b9d0e544d73c0dcbdfc1b9002148a87abf1125f64551f934c app/routes/registration.py
9307f976a599277602f183f2aa4a28129772af8e651d5987fdbc3f6934dff5b3 app/static/js/activation.js
33bf659b49badfc1ef049f5279f9c42ae0503be2fdf7d2820396bdbd06043d77 app/static/js/worker-management.js
14a280654b9be934e51b21183bad64c341ccfb4c265782e8a86ac6a1c2510d6f app/templates/activate.html
feaa56a8ef61ee59f5b843311409b805dc28dc8e797ab64de025fcdcf35dfaf5 app/templates/email/registration.html
57a9af51a092cf48389c43a9cedbe62b674856482e63fcb6d6f4f0a10353605d migrations/versions/0002_employee_onboarding.py
0f02108da7509d9471339b355b6c744ed57a68aa26dcaaa383942b15d7511a4c tests/test_invitation_delivery.py
7673ce420216e5ce54c10830938990726b37ee538d61780c2014bdc7181f5327 tests/test_employee_onboarding.py
35acde995fbf1f1ec2b601d58131dc292a8298d5c9d8141493caa0b02f2ac024 tests/test_employee_onboarding_browser.py
ebca15ed8be9b34f038194b72324ea74f1db9c8182e12b53037c4e2088c3503f tests/test_onboarding_migration.py
```

## Estado de entrega

Cambios en el workspace de `main`, todavía sin commit/push ni despliegue. No se ha
migrado producción, eliminado/desactivado/reactivado trabajadores reales, cambiado
ninguna contraseña existente ni alterado la tarea/configuración SMTP. Publicar requiere
la autorización correspondiente y el procedimiento explícito de migración documentado.
Antes de guardar/publicar, volver a revisar el estado compartido y estas huellas.

README, AGENTS y `docs/security.md` remiten al nuevo comportamiento/procedimiento.
Un intento de añadir una referencia en `docs/operations.md` fue bloqueado por el control
de seguridad de la herramienta; el archivo permanece sin cambios, huella
`bbe3a794cc99bb159b9c461a6b3736d605e4994c678331afaab88cccecd23624`.
No se reintentó por otra vía. El procedimiento completo ya estaba en el documento
`docs/onboarding-and-workers.md`, creado antes de ese rechazo. No afecta al código probado.
