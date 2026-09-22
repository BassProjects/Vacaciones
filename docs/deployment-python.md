# Registro de publicación Python · 22-09-2026

> Decisión posterior, 22-09-2026: el responsable ha elegido empezar desde cero con
> un administrador `electropolis`, sin importar Vercel, y usar SMTP, no Gmail API.
> El alta requiere un secreto válido por el canal seguro. El correo permanece pausado
> mientras falte SMTP autorizado por la plataforma. Ver [SMTP](smtp.md).
> El contenido siguiente conserva el historial del trabajo anterior; no implica
> que ahora sean obligatorias la importación del origen o la configuración OAuth.


## Primera imagen publicada y comprobada

- URL: https://app-vacaciones.dokploy.electropolis.es
- Commit de aplicación: `2355acdf9a3cf5199d01a26ea748f7b333f7aed6`.
- Repositorio: `ElectropolisDokploy/Vacaciones`, rama `migration/dokploy-assessment`.
- Despliegue: `1e78a80b92c996da641b5cac97fb7fb1`, resultado final `healthy`.
- Imagen: `registry.dokploy.electropolis.es/electropolis/vacaciones@sha256:6a49e5246c5015fca73df33fb5e3be2304ab6d7307ac018bc0534f9cedbdd927`.

La construcción Docker completó manifiesto, Ruff y 30 pruebas sin base de datos;
24 pruebas de integración/navegador se omitieron allí por no existir su supervisor.
La batería completa de 54 pruebas sí se había ejecutado y aprobado contra PostgreSQL
16 aislado en el workspace, como consta en el informe de verificación.

`deployment_probe('/')` devolvió HTTP 200 y la portada «Destino preparado · activación
pendiente». Esa comprobación usa HTTPS a través del proxy de publicación; no verifica
DNS/acceso desde otra red ni ejecuta JavaScript. El flujo de navegador se probó por
separado con datos ficticios.

## Base de datos y tareas

La tarea nativa pausada `schema-migration` (`JGOWfTW3IifGu--hy8-BF`) se ejecutó
manualmente una vez. Run `FBsOAuGt9bPu-RpaSdVcJ`: resultado `done`, log de aplicación
`{"status":"migrated","revision":"0001_python"}` y comando finalizado correctamente.
El esquema de destino está preparado; no se transfirieron empleados, solicitudes,
festivos reales, adjuntos ni credenciales. No hay administrador predeterminado.

La tarea `gmail-outbox` (`eOL61Q7bm2RRcTMC3Gj8M`) está creada con cron `*/5 * * * *`,
zona `Europe/Madrid`, y permanece **pausada**, sin ejecuciones. `MAIL_ENABLED=false`.
Se han preparado únicamente los destinos HTTPS `oauth2.googleapis.com` y
`gmail.googleapis.com`. La variable `APP_URL` se ha configurado con la URL real
para aplicarla en la siguiente publicación. No se generaron enlaces de secretos.

La plataforma conserva el nombre de la antigua variable no secreta
`SCHEMA_MANAGEMENT`; la app Python no la lee. La herramienta de configuración expuesta
no ofrece borrado individual de variables. No se alteraron controles ni se solicitó
acceso administrativo para eliminar esa entrada inocua. El código y runtime Vercel/Next
sí se retiraron del repositorio de destino.

## Estado que no debe confundirse con una migración terminada

El destino está publicado, pero aún no sustituye al origen para trabajo real.
`/ready` requiere un administrador activo además del esquema. No deben activarse
empleados ni correo con datos ficticios para hacer que esa comprobación pase.

Faltan la transferencia autorizada y conciliación del PostgreSQL de origen,
la configuración OAuth de Gmail y su prueba real, y el corte de acceso/escritura.
El proyecto/base/recursos externos Vercel no se han eliminado y deben retirarse solo
tras verificar el destino y una copia recuperable. No hay acceso Vercel en este flujo.

Los commits posteriores que añadan únicamente documentación no cambian los archivos
runtime/test/build registrados en `verification-python-sha256.json`. Antes de atribuir
esta imagen a la versión actual, consultar de nuevo `deployment_status`; este registro
no sustituye el estado real del servidor.
