# Vacaciones · Sepiamary

Aplicación de calendario de equipo, vacaciones, ausencias y aprobaciones.
La versión 2 migra explícitamente el backend a **Python 3.11 y FastAPI**, conservando
PostgreSQL y la interfaz de calendario. Estándar Electropolis **1.0.0**, plantilla
**web/1.0.0**. La decisión del responsable y sus consecuencias están en
[ADR 0001](docs/adr/0001-python.md).

## Estado y activación

Destino publicado: **https://app-vacaciones.dokploy.electropolis.es**.
El responsable ha decidido empezar desde cero, sin importar datos de Vercel, con
un único administrador cuyo usuario será `electropolis`. No se borra el origen.
El esquema se gestiona mediante Alembic; la ampliación de registro usa la revisión
`0002_onboarding`. En una instalación vacía, el alta del administrador requiere una
contraseña inicial introducida por el canal seguro; no hay acceso predeterminado.
El email no es obligatorio para esa primera cuenta. Se exige cambiar la contraseña
al entrar antes de acceder al resto de funciones.

Por decisión del responsable (23-09-2026), las contraseñas de Vacaciones tienen un
mínimo de **8 caracteres** y un máximo de **256**, tanto para empleados como para
administradores. Se aplica al alta, cambio, restablecimiento y secreto de alta inicial;
los formularios y el servidor comprueban el mismo mínimo. No se cambian las contraseñas
existentes ni los requisitos de credenciales externas, como la contraseña SMTP de Google.
Se conservan el hash scrypt con sal aleatoria, los límites de intentos y la invalidación de sesiones al
cambiar la contraseña y el cambio obligatorio del acceso inicial.
El CLI solo permite el alta en una instalación sin usuarios y nunca elimina cuentas.
Sin administrador activo, la portada muestra «activación pendiente» y `/ready`
responde 503; `/health` comprueba únicamente que el servidor responde.

El correo utiliza **SMTP con contraseña**, sin Gmail API ni OAuth, con remitente
`noreply@electropolis.es`. La plataforma ya permite `smtp.gmail.com:587` mediante
su proxy CONNECT autorizado y la variable inyectada `SMTP_PROXY_URL`. El cliente
verifica TLS contra el servidor original y no permite acceso directo en producción.
La puesta en marcha comprueba primero conexión/cifrado sin autenticar, después un
único mensaje autorizado y finalmente activa `MAIL_ENABLED` y `gmail-outbox` cada
minuto. Ver [SMTP y operación](docs/smtp.md) y el
[informe del cliente proxy](docs/verification-smtp-proxy.md).

Las invitaciones se guardan en la bandeja de salida y se envían en la siguiente
pasada del procesador; no se promete entrega instantánea ni recepción en bandeja.
La ventana consulta cada 20 segundos el estado real mientras haya correos pendientes,
sin bloquear el envío al cerrarla. Distingue enviado, pendiente, error y resultado
incierto. Volver a introducir un empleado existente muestra el estado de su invitación
original sin crear otra cuenta ni reenviarla. La consulta de estados solo está permitida
para administradores y no devuelve contenido de correos o credenciales.
Consultar [verificación de invitaciones](docs/verification-invitation-delivery.md).

Las nuevas invitaciones permiten registrarse mediante un enlace personal de un solo
uso, válido durante 48 horas desde el intento de envío. El trabajador confirma su
nombre y fecha de nacimiento, crea una contraseña de 8 a 256 caracteres y la repite.
El correo y el usuario están vinculados a la invitación; no se pueden sustituir para
activar otra cuenta. Compartir el día y mes del cumpleaños es opcional y no se publica
el año. El enlace no inicia sesión automáticamente ni envía contraseñas por correo.

La lista de trabajadores separa desactivar, reactivar y eliminar. Solo administradores
pueden hacerlo; no se permite eliminar/desactivar la propia cuenta ni dejar la app
sin un administrador registrado y activo. Eliminar exige escribir el usuario exacto
y se rechaza si existen solicitudes, políticas, delegaciones, importaciones o
justificantes asociados. Se conserva la auditoría y no se borra historial en cascada.
Los pendientes de registro tienen un botón para enviar un nuevo enlace. La suspensión,
el cambio de correo o la sustitución del enlace invalidan los anteriores.

La recuperación autónoma de una contraseña olvidada sigue siendo una función distinta
y no se ha activado. Para usuarios ya registrados se conserva el restablecimiento
administrativo con cambio obligatorio e invalidación de sesiones. Para invitados
pendientes se utiliza el enlace de registro, sin saltarse los campos obligatorios.
Consultar [registro y gestión de trabajadores](docs/onboarding-and-workers.md).

## Funciones

El calendario distingue la vista común de los detalles privados. Las notas,
resoluciones y justificantes solo se devuelven a las personas autorizadas.
Hay empleados, departamentos, responsables y sustituciones temporales; solicitudes,
aprobación, rechazo, cancelación y retirada de pendientes mediante API; festivos,
medios días y jornadas individuales; saldos por ejercicio, ajustes, arrastres con
caducidad y prorrateo explícito; importación de festivos e histórico Calamari,
exportación mensual y justificantes privados.

Los saldos y los informes se calculan en PostgreSQL, sin depender del límite de
paginación del navegador. Los días se distribuyen por fecha real entre ejercicios.
El servidor controla solapamientos, reintentos duplicados, cobertura mínima y la
política de superar saldo. La desactivación de empleados conserva el historial.
Las acciones nuevas quedan registradas en auditoría.

Las reglas configurables no constituyen una interpretación de convenios o normas
laborales. La empresa debe acordar su política: por defecto se conserva la petición
con confirmación cuando falta saldo, no se activa el prorrateo y la cobertura mínima
no bloquea hasta configurarla. Compartir el día y mes de cumpleaños es voluntario;
no se publica el año de nacimiento.

## Tecnología y estructura

| Componente | Implementación |
|---|---|
| Servicio HTTP | FastAPI, Pydantic, Uvicorn; `0.0.0.0:8080` |
| Datos | PostgreSQL 16, SQLAlchemy y migraciones Alembic |
| Interfaz | Jinja2, HTML/CSS local y módulos JavaScript nativos |
| Correo | SMTP con TLS, bandeja de salida transaccional |
| Calidad | uv, lockfile, Ruff, pytest, Chromium/Playwright en pruebas |
| Publicación | Docker por digest, usuario 1000, raíz de solo lectura y `/tmp` |

`app/routes/` define la API; `calendar_rules.py`, `balances.py`, `reporting.py` y
`leave_service.py` contienen las reglas de negocio; `models.py` y `migrations/`
definen el esquema. `mailer.py` y `cli.py` implementan el correo y la operación.
`file_worker.py` analiza documentos en procesos supervisados con límites.
`app/templates/` y `app/static/js/` contienen la interfaz. No hay runtime Node,
Next.js, OAuth, GitHub Actions ni procesos residentes adicionales.

OpenAPI está disponible para administradores autenticados en `/api/openapi.json`.
El panel `/admin` permite configurar políticas, jornadas, calendarios,
departamentos, delegaciones, bandeja de salida y consultar auditoría.

## Desarrollo reproducible

Utiliza Python 3.11. Instala uv **0.12.17** en un entorno privado cuando no esté
proporcionado por el workspace:

```sh
python3 -m venv .tools
.tools/bin/pip install uv==0.12.17
export PATH="$PWD/.tools/bin:$PATH"
uv sync --locked
sh scripts/check.sh
```

El check ejecuta el manifiesto, Ruff y pytest. Las pruebas de persistencia no usan
SQLite ni una base de producción: sin el supervisor se omiten expresamente. Para
comprobar persistencia, migración, restauración y navegador:

```sh
uv run python scripts/with_test_postgres.py sh scripts/check.sh
```

El supervisor crea un PostgreSQL **16** aislado en loopback, con datos sintéticos,
ejecuta el comando en primer plano, detiene el proceso y elimina su directorio
al terminar. Rechaza una base no creada por él. No deja un servicio en background.
Las pruebas de navegador también crean y cierran su propio proceso web temporal.

Si el contenedor de desarrollo no incluye PostgreSQL 16, el procedimiento
`scripts/build-test-postgres.sh` descarga la versión fijada 16.15 del servidor
oficial, comprueba SHA256 y la instala bajo `.tools/pg16`. Requiere los paquetes
del contenedor `build-essential libreadline-dev zlib1g-dev libssl-dev bison flex
pkg-config`. Instálalos mediante `install_system_packages`, no en el host.
Para navegador se utiliza el paquete `chromium` del contenedor; no forma parte de
la imagen de producción. El modo sin sandbox del navegador se reserva a estas
pruebas aisladas de datos ficticios y tráfico limitado a loopback.

```sh
uv run pip-audit --progress-spinner off
```

La auditoría comprueba avisos conocidos de dependencias; no sustituye una revisión
de seguridad ni demuestra ausencia de vulnerabilidades en el código propio.

## Configuración y publicación

La configuración se lee del entorno y se documenta en
[configuración](docs/configuration.md). PostgreSQL interno utiliza
`DATABASE_URL` generado por la plataforma y `DATABASE_SSL_MODE=disable` únicamente
en esa red autorizada. Conexiones externas verifican certificados por defecto.
`APP_URL` debe ser el origen HTTPS real de esta instalación y `TZ=Europe/Madrid`.
No se usan los alias `POSTGRES_URL`, `VERCEL_URL` ni `SESSION_SECRET` heredados.

No introduzcas secretos en el chat, Git, pruebas o imágenes. Utiliza el enlace
seguro de la plataforma cuando la persona esté preparada; no lo generes con
antelación. `MAIL_ENABLED=false` hasta terminar la configuración y las pruebas
reales de [SMTP](docs/smtp.md).

La secuencia es: checks → commit/push → construcción Docker → despliegue del SHA
subido → operación explícita de migración → comprobaciones HTTPS y funcionales.
La aplicación no ejecuta Alembic ni crea administradores desde una petición o un
arranque web. El Dockerfile ejecuta los checks durante su construcción; esto no
es una validación universal independiente del repositorio impuesta por Dokploy.

## Operación y recuperación

Consulta [operación y tareas](docs/operations.md),
[seguridad y límites](docs/security.md) y
[transferencia, recuperación y retirada de Vercel](docs/migration-dokploy.md).
Los adjuntos se guardan en PostgreSQL; no se necesita `/data` para esta versión.
El rollback de imagen no revierte el esquema, los datos, los secretos ni las tareas.
Una copia local del servidor no protege frente a la pérdida completa de ese host.
No se afirma alta disponibilidad ni despliegue sin interrupción.

Las guías comunes están en `docs/electropolis/`. `AGENTS.md` indica cómo mantener
esta aplicación y conservar la separación entre cambios locales, GitHub y producción.
