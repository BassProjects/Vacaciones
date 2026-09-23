# Verificación: mínimo de 8 caracteres en Vacaciones

Fecha: 23-09-2026. Petición expresa del responsable: reducir el mínimo de las
contraseñas de la aplicación de 12 a 8 caracteres.

## Alcance y revisión

Proyecto `vacaciones`, repositorio `ElectropolisDokploy/Vacaciones`, cuenta
`BassProjects`, rama local `main`. Revisión base:
`a0436c32a0b9f2df1f0bef56f553f3503f66900f`.

Se verificó el contenido modificado del workspace, todavía sin commit, detallado
por sus SHA-256 al final de este informe. No se ha publicado este cambio ni se han
modificado las credenciales, cuentas o datos de producción. La petición actual
no incluía guardar en GitHub ni desplegar. El estándar permanece en 1.0.0.

La política queda en 8 a 256 caracteres para creación, cambio, restablecimiento y
alta inicial de administradores. El alta inicial utilizaba un mínimo independiente
de 16; también se ha alineado con la política solicitada. Se actualizaron las
validaciones del servidor, los tres campos de nueva contraseña del navegador,
la actualización de hashes heredados y la documentación operativa. No se cambia
el algoritmo scrypt, la limitación de intentos, la protección CSRF, la revocación
de sesiones ni el cambio obligatorio de contraseñas iniciales. Las credenciales
SMTP y sus requisitos son independientes y no se han modificado.

## Comprobaciones ejecutadas

Comando final, en el entorno de desarrollo seleccionado:

```sh
export PATH="$PWD/.tools/bin:$PATH"
uv run --locked python scripts/with_test_postgres.py sh scripts/check.sh
```

Job final: `8203ac6d08beba726bef5b61e648ed65`, estado `completed`, salida **0**.
Manifiesto web/1.0.0 correcto; Ruff y formato correctos; **118 pruebas superadas,
0 fallidas y 0 omitidas**. La batería emitió 43 avisos de obsolescencia relacionados
con Starlette/TestClient, AnyIO y la configuración existente de Alembic; no se
cambiaron dependencias ni configuración ajena a este encargo.

Las comprobaciones cubren aceptación de 8 caracteres, rechazo de 7 y del exceso
sobre 256; todos los esquemas de nuevas contraseñas; alta y unicidad del administrador
inicial; creación de empleados; cambio y restablecimiento; posterior inicio de sesión;
invalidación de sesiones; uso único del token de recuperación de la API; compatibilidad
con hashes heredados y cambio obligatorio de los que aún no cumplen el nuevo mínimo.
La interfaz autónoma de recuperación por email no se ha añadido ni activado.

Chromium ejecutó los flujos de alta, restablecimiento y cambio de contraseña, seguido
de inicio de sesión con 8 caracteres, en escritorio (1365 x 900) y móvil (390 x 844).
También se ejecutó la batería existente de calendario, permisos, persistencia,
importaciones, informes, correo simulado y recuperación con datos ficticios.

Todas las operaciones de datos se realizaron en PostgreSQL 16 temporal supervisado
en loopback. PostgreSQL y los procesos web/de navegador fueron cerrados por sus
supervisores. No se utilizaron usuarios ni contraseñas reales y no se enviaron correos.

La primera ejecución (`40bf20eb1aa88d6bd9382a72e89b4f97`, salida 1) terminó con
117 pruebas correctas y una espera incorrecta en la nueva prueba de navegador de
escritorio: intentaba decidir el menú antes de que apareciera la pantalla principal.
Se corrigió la sincronización de esa prueba para esperar `.app-shell` y se volvió
a ejecutar la batería completa con el resultado final indicado anteriormente.

La búsqueda final de referencias antiguas en los archivos operativos modificados
no encontró validaciones o instrucciones que mantuvieran mínimos de 12 o 16.

## Huellas del contenido verificado

```text
2069aef3858a50f796459c251cae49df808ee3723e5f066a8f91869598f8e0bf app/security.py
5005135755c06c27e84bfc653d039c3ea708b20417daa77f270934e46e6c82c4 app/schemas.py
701aff70561656142b0c05a8bfb0154dcb2f14e560f1fbc2fdf0f1da7b8ecbf2 app/routes/auth.py
1bcfdaebd6fec8a92380c009514e7797c2669baeab07f83376b7d0111cf84626 app/cli.py
6025c139244e4c55fd46bd18d82a155489ea4f6ad1f7ee995557d13ae4b86a36 app/static/js/employee-dialogs.js
c3999c3525e42373705e2c0714875b0946c5000ca07a38fed0ffe5ea2d3e5e2a app/static/js/request-dialogs.js
4256356921ed383ee1ce83f8ca55370373069c8ff2d6740115770237bdcebbd2 tests/test_password_policy.py
c32bd6ab114ce2822551d3e1663084c0c1ee1e98e5b748b8f840fb9ed46b496a tests/test_initial_admin.py
4e2de4e691df14caf7e64799e1fde9bd27a65d3230c90bf97ce914fa64dc3d98 tests/test_browser.py
7ca709fdf130fab9c10d3a73304f7a576e6925a3008794a1df59d43701f0db05 README.md
c7268796f6f04ad55df30ab0928cf9d1d8cd99c1a5b6bbf6234888310a161d8c docs/configuration.md
6c2402b3cd4b36b332f3de8cb85cc9e38d02a65f3b00876d5130bb01473c8158 docs/operations.md
d061193d5a332c702274fb94ab6796f7aef703a78225d241e4340c0713167b85 docs/smtp.md
```

Este informe se añadió después de las pruebas y no modifica contenido ejecutable.
Antes de una futura publicación, revisar el estado compartido, conciliar cambios
concurrentes y guardar/subir las rutas correspondientes con las herramientas Git.
Si cambia contenido ejecutable respecto a estas huellas, repetir las comprobaciones
afectadas. No atribuir estas pruebas a la versión que sigue publicada en producción.
