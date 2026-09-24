# Registro por invitación y gestión de trabajadores

Petición del responsable: 24-09-2026. Aplicación `vacaciones`, cuenta `BassProjects`.
Se conserva Python/FastAPI, PostgreSQL 16 y el estándar web/1.0.0.

## Acciones desde la lista

El rol administrador existente representa al superusuario de la aplicación; no se
han modificado cuentas GitHub, permisos de plataforma ni roles globales.

- **Desactivar** cierra sesiones e invalida los enlaces de registro/recuperación. Conserva
  solicitudes, saldos, justificantes y auditoría. **Reactivar** vuelve a habilitar el
  acceso de una cuenta ya registrada, conservando su contraseña. Si aún está pendiente
  de registro, deberá recibir un enlace nuevo; no se rehabilita un enlace revocado.
- **Eliminar** requiere escribir el usuario exacto. No se pueden eliminar ni desactivar
  la propia cuenta, ni dejar el servicio sin un administrador registrado activo.
  El borrado individual solo permite cuentas sin solicitudes (también sin resoluciones
  atribuidas), políticas anuales, delegaciones, importaciones o adjuntos atribuidos.
  Si hay datos asociados, se rechaza íntegramente y se ofrece desactivar. No se eliminan
  solicitudes ni auditoría en cascada. Se cancelan avisos pendientes al correo eliminado,
  se retiran sesiones/tokens de acceso y se registra el evento `employee.deleted`.
- **Enviar enlace de registro** aparece en cuentas habilitadas pendientes de registro.
  Requiere confirmación; envía a su correo actual un enlace nuevo e invalida los anteriores.
  Cada petición tiene una clave idempotente y se limita a cinco peticiones por cuenta/hora.
  Los mensajes antiguos se conservan y las consultas muestran la invitación más reciente.

Las acciones que alteran destinatarios se coordinan con el procesador de correo.
Si hay un envío activo, pueden devolver «repite la acción» sin realizarla parcialmente.
La ruta DELETE anterior sigue desactivando por compatibilidad; la eliminación real usa
POST `/api/users/{id}/remove`, con confirmación, autorización y CSRF.

## Registro del trabajador

Las invitaciones nuevas quedan `onboarding_pending=true`, sin acceso mediante contraseña
ni sesión hasta completar el registro. El envío automático sigue cada minuto mediante
la tarea existente y el SMTP verificado del proxy. El correo incluye un botón personal
**Registrarme y activar mi cuenta** y no incluye contraseñas.

En `/activate` se solicitan nombre y apellidos, fecha de nacimiento (real, desde 1900 y
anterior a hoy), contraseña de 8 a 256 caracteres y su repetición. El correo invitado y
el usuario se muestran, pero no pueden sustituirse. Compartir exclusivamente día y mes
del cumpleaños es opcional, desmarcado por defecto. El servidor valida esos campos y
rechaza campos extra, incluido cualquier cambio de rol o correo. La fecha ya completada
no se puede vaciar después desde el perfil.

El enlace contiene un token aleatorio de 32 bytes. Solo se guarda su huella SHA-256,
en `employee_activations`, separado de `password_resets`. Caduca a las 48 horas desde
su preparación inmediatamente anterior al envío. El token viaja en el fragmento,
se elimina de la dirección al cargar la página y se remite en el cuerpo POST de la API,
con verificación de origen/CSRF, sin almacenamiento del navegador ni logs del contenido.
Abrir la página o inspeccionar el enlace no lo consume; la confirmación de registro
lo consume de forma atómica, incluso con dos envíos simultáneos del formulario.

Al completar se fija la contraseña, se guardan los datos, se revocan tokens/sesiones
anteriores y se invita a iniciar sesión. No hay inicio de sesión automático. La suspensión,
el cambio de correo, la eliminación o el reenvío invalidan los enlaces correspondientes.
El restablecimiento administrativo no puede saltarse el registro de un invitado pendiente.
La recuperación autónoma de contraseñas olvidadas sigue fuera de este cambio.

Los correos de bienvenida enviados antes de esta versión no cambian. Tras publicar y
migrar, el administrador podrá usar **Enviar enlace de registro** para los invitados que
no llegaron a acceder. No se crean cuentas repetidas ni se reenvían correos automáticamente
como consecuencia de la migración o de consultar estados.

## Migración y publicación controladas

Nueva revisión Alembic **0002_onboarding**, posterior a **0001_python**:
columna booleana `employees.onboarding_pending`, por defecto false, y tabla de tokens.
Solo marca como pendientes las cuentas con evento de invitación, cambio inicial requerido
y sin registro de inicio de sesión o cambio/restablecimiento completado de contraseña.
No modifica contraseñas, nombres, cumpleaños, estado activo/desactivado, solicitudes,
saldos ni eventos de auditoría. No envía correos. Las cuentas que ya se utilizaron se
conservan operativas. La migración es una acción explícita; no ocurre al arrancar la web.

Antes de publicar: revisar cambios compartidos, comprobar la copia aplicable y guardar/subir
un commit real. Publicar ese commit con puerto 8080, `/health` y `/ready`. La nueva web
puede responder a `/health` antes de que esté preparado el esquema; `/ready` seguirá
sin estar disponible hasta aplicar la migración. No dar la app por lista en ese intervalo.
No se promete un despliegue sin interrupción.

Una vez disponible la imagen nueva, ejecutar **una sola vez** la tarea nativa ya existente
`schema-migration`, cuyo comando es `/app/.venv/bin/python -m app.cli migrate`. Mantenerla
pausada. Consultar estado y log hasta resultado final, comprobar la revisión devuelta
`0002_onboarding`, `/ready`, la página de activación y las rutas protegidas. La tarea
`initial-administrator` no debe ejecutarse; no se recrean administradores.

La petición de desarrollo no autoriza por sí sola publicar ni alterar datos reales.
La verificación de este cambio utiliza únicamente el PostgreSQL 16 temporal del supervisor.

## Recuperación

Un rollback de imagen no revierte el esquema, las cuentas registradas, los datos, las
contraseñas ni la configuración SMTP. La imagen previa espera exactamente `0001_python`:
no recuperarla sobre `0002_onboarding` sin un procedimiento compatible y autorizado.
El downgrade de esta revisión solo se ensaya sobre datos ficticios; elimina la tabla de
tokens y la marca de registro, dejando desactivadas las cuentas aún pendientes para no
concederles acceso. No activa ni borra una cuenta de trabajo. Una reversión posterior
puede necesitar reactivar expresamente esas cuentas y emitir nuevas invitaciones.
No ejecutar downgrade, borrar tablas o restaurar producción automáticamente ante un fallo.
