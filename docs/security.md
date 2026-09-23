# Seguridad, privacidad y límites conocidos

## Controles implementados

Las sesiones nuevas son tokens aleatorios opacos, guardados como huellas en PostgreSQL,
revocables, con caducidad y cookies HttpOnly/Secure en producción. Cambiar o restablecer
una contraseña invalida sesiones. Las nuevas contraseñas tienen límites de longitud y
scrypt con sal aleatoria; se admiten hashes heredados para una transferencia controlada.
No hay contraseña de administrador predeterminada. Existe limitación persistente de
intentos de acceso por cuenta y por dirección observada por el servidor.

Las peticiones de escritura comprueban CSRF y origen. La política de contenido permite
scripts propios, no recursos JavaScript externos ni eval; se conserva CSS inline por
compatibilidad con el diseño existente. No se consulta Gravatar ni se cargan fuentes
externas. La autorización se aplica en cada operación del servidor, no solo en botones.

El calendario común devuelve ausencias genéricas sin notas, motivos clínicos o comentarios
de resolución. Los detalles y archivos se limitan a su titular y roles/delegaciones
permitidos. Los cumpleaños solo se comparten voluntariamente como día y mes. La política
organizativa debe revisar a quién delega esos permisos y durante qué fechas.

Los archivos tienen límites de tamaño, cantidad y consumo agregado por solicitud. Se
comprueba contenido real; el analizador se ejecuta en un proceso supervisado con CPU,
memoria, tiempo y entorno acotados. Esto no constituye un antivirus ni una garantía de
que todo documento permitido sea inocuo. Las descargas se sirven como adjuntos con
`nosniff`, autorización, no-cache y registro de consulta.

Los nuevos eventos de auditoría son de solo inserción: la base rechaza UPDATE/DELETE y
TRUNCATE ordinarios. No se afirma invulnerabilidad frente al administrador de base de
datos, quien puede cambiar el esquema. Conservar copias y controlar ese acceso.
Desactivar un empleado conserva solicitudes y justificantes; se retiró el borrado masivo.

## Operación de integraciones

Gmail se utiliza por SMTP con contraseña de aplicación y TLS verificado dentro del
proxy CONNECT autorizado (`smtp_egress`, `SMTP_PROXY_URL`); no se utiliza OAuth ni
Gmail API. Producción exige ese proxy y no intenta salida directa si falla. Los correos
no incluyen contraseñas ni justificantes. Los mensajes dudosos no se reintentan
automáticamente para evitar duplicados. La prueba operativa tiene clave persistente
y comparte el bloqueo del procesador de outbox; repetirla no reenvía un mensaje.
No se almacenan credenciales en Git, frontend o logs. La respuesta de salud y la
negociación TLS no certifican autenticación o entrega: se verifican por separado.
Revisar permisos y revocación de contraseñas SMTP mediante el canal seguro.

No hay un acceso autónomo por enlace de recuperación en esta entrega: su formulario
no pudo incorporarse mediante la herramienta disponible. No se publicitan ni envían
esos enlaces. El restablecimiento administrativo está disponible con cambio obligatorio
de contraseña. No afirmar que las invitaciones proporcionan inicio de sesión completo
sin ese paso administrativo.

## Limitaciones y decisiones pendientes

La app tiene una réplica y los límites de CPU/memoria de la plataforma; no se ha realizado
una prueba de carga de producción ni una auditoría de penetración externa. El limitador
por dirección puede agrupar usuarios detrás del mismo proxy; el contador por cuenta
sigue siendo independiente. Revisar el tamaño de plantilla y la carga real al activarla.

Las políticas de vacaciones (jornadas, prorrateo, caducidades, coberturas) necesitan una
decisión de negocio. Se ofrecen controles configurables, no una certificación laboral
ni de protección de datos. No se ha acordado todavía una política definitiva de retención
para documentos de baja, exportaciones, backups y auditoría. Debe documentarse antes de
usar datos reales con esos fines, junto con responsables y acceso autorizado.

La migración preserva el histórico disponible, pero no puede reconstruir decisiones
que el origen sobrescribió o un detalle horario que nunca guardó. Los repartos inferidos
quedan señalados para revisión. No se retira Vercel hasta la conciliación final.

`pip-audit` sin avisos conocidos y tests aprobados son evidencia limitada, no una garantía
de seguridad absoluta ni de que todas las combinaciones de negocio estén comprobadas.
Mantener pruebas de regresión, revisar dependencias y ensayar periódicamente recuperación.
