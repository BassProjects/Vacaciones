# Migración de Vercel a Dokploy · versión Python

> Decisión posterior, 22-09-2026: el responsable ha elegido empezar desde cero con
> un administrador `electropolis`, sin importar Vercel, y usar SMTP, no Gmail API.
> El alta requiere un secreto válido por el canal seguro. El correo permanece pausado
> mientras falte SMTP autorizado por la plataforma. Ver [SMTP](smtp.md).
> El contenido siguiente conserva el historial del trabajo anterior; no implica
> que ahora sean obligatorias la importación del origen o la configuración OAuth.


## Alcance y estados

Esta guía sustituye la preparación anterior de Next.js. El responsable solicitó
expresamente Python, mejoras de calidad y Gmail API. La rama de trabajo es
`migration/dokploy-assessment`; el repositorio vinculado es
`ElectropolisDokploy/Vacaciones`. La aplicación original no se sustituye por una
plantilla vacía: se conserva su funcionalidad y se traslada a módulos Python.

Código guardado, imagen publicada, base transferida y correo activo son estados
diferentes. Sin datos y administrador preparados, la imagen publica una portada
honesta de activación pendiente. No crear cuentas ficticias ni presentar esa portada
como un corte de producción completo. `/health` puede dar 200 mientras `/ready` da 503.

## Preparación y publicación del destino

Ejecutar los checks y el ensayo PostgreSQL 16 del README, revisar diff, guardar y subir
un commit real. Configurar base propia, sin `/data`, entorno de producción y correo
desactivado. Publicar el SHA probado mediante el conector. Verificar imagen y HTTPS.
Preparar el esquema ejecutando una vez el CLI `migrate` mediante una tarea pausada,
como se indica en [operación](operations.md). No ejecutar DDL desde el arranque web.

El nuevo esquema contiene tablas separadas del heredado, restricciones e historial.
La migración inicial crea configuración y departamentos de referencia, no empleados,
contraseñas o festivos. No se usa SQLite como sustituto de PostgreSQL.

## Transferencia autorizada del origen

Identificar el proveedor real de PostgreSQL vinculado a Vercel y los recursos dedicados
a esta app. Confirmar método de acceso de solo lectura, TLS y canal privado para el
archivo. No enviar conexiones, tokens, backups o contraseñas por el chat o Git.

El exportador `scripts/export_legacy.py` se ejecuta en un entorno autorizado para leer
el origen. Recibe `SOURCE_DATABASE_URL` del entorno y una ruta nueva de salida fuera
del repositorio. Utiliza una instantánea consistente de solo lectura. Exporta
`users`, `requests`, `holidays`, `app_config` y `request_attachments`, incluidos los
bytes de cada justificante. Genera un ZIP privado, un manifiesto de recuentos y SHA256.
El archivo contiene datos de empleados y hashes de contraseñas: debe protegerse y
eliminarse del canal temporal conforme a la política acordada tras completar la operación.

La importación de destino requiere una base sin empleados ni solicitudes. Se comprueba
la huella esperada, formato, referencias, fechas, estados, recuentos, saldos y cada
adjunto. La operación es transaccional y no sobrescribe un conjunto existente. Puede
usar un archivo privado local autorizado o `MIGRATION_ARCHIVE_URL` HTTPS con su huella,
mediante una operación explícita de CLI. Las credenciales se introducen solo cuando
la persona confirme que está preparada; no generar enlaces de secretos con antelación.

Los IDs, hashes scrypt compatibles, solicitudes, notas y archivos se conservan. Las
sesiones anteriores caducan: los empleados vuelven a entrar. Un administrador que siga
usando la contraseña pública heredada se desactiva durante la transferencia. Si no
queda un administrador activo, hace falta un alta explícita autorizada con credenciales
seguras; el sistema no habilita un acceso predeterminado para resolverlo.

No es posible recuperar un historial que el código anterior sobrescribió. Si el origen
solo guardaba el total de un período, se conserva ese total y se registra cualquier
reparto diario inferido. Revisar los IDs indicados en el informe antes del corte, en
especial fracciones, cambios de año y jornadas diferentes de ocho horas. Los festivos
reales se transfieren; no se generan por suposición. Compartir cumpleaños vuelve a ser
una elección expresa y no se publica el año.

## Ensayo, conciliación y corte

El repositorio incluye un ensayo sintético de exportación/importación y una restauración
real mediante `pg_dump`/`pg_restore` contra PostgreSQL 16 aislado. Ese ensayo no sustituye
la conciliación de los datos reales. Comparar los recuentos de las cinco tablas, suma de
días, saldos por trabajador/año, archivos y sus huellas; comprobar perfiles de trabajador,
responsable y administrador, solicitudes, aprobación, importación y exportación.

Para el corte, detener temporalmente las escrituras de la aplicación de origen mediante
un procedimiento autorizado, obtener el último snapshot y confirmar que no hay cambios
posteriores. No mantener Vercel y Dokploy escribiendo en bases divergentes. Activar el
acceso del destino y comprobarlo con usuarios autorizados. Configurar y probar Gmail API
con un destinatario acordado antes de activar sus tareas. Cambiar DNS/enlaces únicamente
cuando el destino esté preparado; conservar un punto de recuperación verificado.

## Limpieza

La versión Python retira del árbol de aplicación los paquetes y lockfile Node,
configuración Next.js, rutas de API JavaScript, helpers de servidor, scripts de arranque
Vercel/Next y tests antiguos. El diseño y las imágenes conservadas se trasladan a
`app/static`; no se borra ningún archivo nuevo de Python. El historial Git preserva el
código anterior. Esta limpieza del repositorio no elimina recursos externos.

La eliminación del proyecto Vercel, deployments antiguos, dominios, cron, variables,
integraciones Storage/Neon y sus posibles costes requiere inventario y acceso a sus
cuentas. No hay acceso a Vercel mediante las herramientas de este flujo. No afirmar que
esos recursos ya están borrados. Tras verificar el corte y la copia recuperable, retirar
solo recursos exclusivos de esta app; nunca borrar una base, dominio o integración
compartidos. Revocar secretos exclusivos retirados y borrar enlaces/copias temporales.
Documentar qué se eliminó, cuándo y qué se conserva para recuperación.

## Recuperación

No desplegar la imagen Next.js contra el esquema Python. Un rollback de imagen no
revierte datos, migraciones, configuración ni tareas. Si el destino ha recibido cambios,
volver al origen exige conciliarlos; no prometer recuperación sin pérdida por cambiar
solo el contenedor. No ejecutar `alembic downgrade base` como método de recuperación:
restaurar una copia comprobada en un destino separado y validar antes de sustituir nada.
Confirmar también una copia fuera del host conforme a la política de empresa.
