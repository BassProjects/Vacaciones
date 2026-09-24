# Verificación: eliminación confirmada de trabajadores

Fecha: 24-09-2026. Proyecto `vacaciones`, cuenta `BassProjects`, rama `main`.
Base publicada durante la verificación: `291bf981ce9c64a40d58cbb374fa8365453de722`.

## Cambio

El botón **Eliminar** de Administración > Empleados continúa exigiendo escribir el
usuario exacto. La operación ya no se rechaza por existir historial de vacaciones,
políticas u otras referencias. En su lugar realiza una eliminación lógica segura:

- desaparece de la lista de Empleados;
- queda desactivado, sin sesiones, enlaces ni credenciales utilizables;
- se retiran el correo y el nombre de usuario de acceso, que quedan disponibles para
  una nueva cuenta;
- se retiran fecha de nacimiento y publicación de cumpleaños;
- solicitudes, políticas, delegaciones, importaciones, justificantes y auditoría
  permanecen referenciados al registro interno;
- no hay borrado en cascada.

Se mantienen la protección de la propia cuenta y del último administrador registrado
activo. Los registros eliminados no pueden editarse, reactivarse, recibir enlaces de
registro, iniciar sesión ni participar como empleados actuales.

Nueva revisión Alembic: `0003_employee_logical_delete`, que añade exclusivamente
`employees.deleted_at` y su índice. La migración no elimina ni modifica cuentas
existentes por sí sola.

## Pruebas

Comando ejecutado en el workspace seleccionado:

```sh
export PATH="$PWD/.tools/bin:$PATH"
uv run --locked ruff format app/models.py app/db.py app/routes/employee_management.py \
  app/routes/users.py app/routes/auth.py app/routes/requests.py app/routes/admin.py \
  app/routes/imports.py app/onboarding.py tests/test_employee_onboarding.py \
  tests/test_onboarding_migration.py migrations/versions/0003_employee_logical_delete.py
node --check app/static/js/worker-management.js
uv run --locked python scripts/with_test_postgres.py sh scripts/check.sh
```

Trabajo `59ec15b0047a7949ecb6c8b5e6257c1c`: completed, salida 0.
Manifiesto, Ruff, formato y JavaScript correctos. Resultado: **191 pruebas superadas,
0 fallidas y 0 omitidas**, con 92 avisos de obsolescencia ya existentes. PostgreSQL 16
fue temporal y supervisado; no se utilizaron cuentas ni datos reales.

La cobertura incluye confirmación incorrecta, permisos de administrador, protección
del superusuario, eliminación con solicitudes y políticas existentes, conservación
del historial, cierre de sesiones, exclusión de la lista de Empleados, eliminación
de invitaciones/tokens pendientes y migración/downgrade con datos sintéticos.

## Huellas del contenido probado

```text
f05c97b4b5f3645eb6da09139b89597510c29f86f953e90c49b858d0f6421a55 app/db.py
29641d4ff374a3580f27dc600f2897d3d6ac9f554445f0ee4a94682fbfc0da27 app/models.py
14530c9687470bbfc663b544f3aee67979d0341505a4e78e56a134a185ec9684 app/onboarding.py
32708d43520bde1d207f51681c74767ae49d038ca5de4e4fc37d2dd769dee7ef app/routes/admin.py
f5d7502f5b733289af1516747e6b6021cb446990c520bb161799920a84575117 app/routes/auth.py
a225c8bc7f8188f8558ecc82730479037d8d81ed00e614d1559a93cf29220e8b app/routes/employee_management.py
e698bf350ec45f41f396f611640f63f8660b22a99eb32f8a935148f16a1e7975 app/routes/imports.py
a9ec3c5219804cfb84318ba8be78a39df1b22c22f08feaaf3f31dd0b1b0653da app/routes/requests.py
88385599a4cfba92feca561c8d1e4aae6a639553bd1a23ad4d094d5fccca27ef app/routes/users.py
f726e04575cffad179d6e6963d5b348b1763e259c024452e12c57954ead7349d app/security.py
80849b95996217a8002c123e8d3c4512d40a8b9c639e8f314f1c95e02ec67dcd app/static/js/worker-management.js
7da858236a2a85efccdd39b2148ec1ace244deaa21fa357546f7b3e35373c872 migrations/versions/0003_employee_logical_delete.py
1b8abef8e7a71a697dd7bc9f31bfa7d373e184df0c385b7312c353beb8e62d72 tests/test_employee_onboarding.py
bd4cf90da48c73b589b485256ba6d2c9c034cc21977a61697f0094be9bd40a18 tests/test_onboarding_migration.py
```

La eliminación lógica se publicó primero en `65e5d5f321c7894a0e61f6059ac5dc9a89fbed76` y la migración `0003_employee_logical_delete` quedó aplicada.

## Visibilidad desde Editar trabajador

Tras comprobar que el botón solo aparecía en la fila de Empleados, se añadió también
**Eliminar trabajador** al pie del formulario **Editar trabajador** para cualquier cuenta
distinta de la del administrador actual. Abre exactamente la misma confirmación segura;
no crea una segunda ruta ni rebaja controles del servidor.

Trabajo `41f233857781265f1dd9ee151ae8dee9`: completed, salida 0. Se comprobó sintaxis
JavaScript y se ejecutó de nuevo la batería completa con PostgreSQL 16 y Chromium
ais­lados: **191 pruebas superadas, 0 fallidas y 0 omitidas**. La prueba de navegador
abre Editar trabajador en escritorio y móvil, pulsa Eliminar trabajador, valida una
confirmación incorrecta y después completa la eliminación confirmada.

Contenido ejecutable probado: `app/static/js/employee-dialogs.js`
`dc95e1acef06c92fa066fe39a5f11400335077dfd225aaf27a43117839890f34`; prueba de
navegador `tests/test_employee_onboarding_browser.py`
`f106ee230b10049fa6cbd0265d8e93bd3889d3517d53988926d4d88337719417`.
