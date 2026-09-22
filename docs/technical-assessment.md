# Evaluación técnica y funcional de Vacaciones

Revisión: 22 de septiembre de 2026.
Repositorio: ElectropolisDokploy/Vacaciones.
Código original inspeccionado: 654c2fd4d38b7a5107670428d3c6438b8d46077f.
Rama de preparación: migration/dokploy-assessment.

## Dictamen

La aplicación no es exclusivamente un conjunto de scripts de navegador: ya contiene un backend Next.js con 21 archivos de rutas API y PostgreSQL. No recomiendo añadir de entrada un segundo backend FastAPI/Express ni reescribirla completa. Recomiendo conservar Next.js, React y PostgreSQL, actualizar las versiones con soporte y convertir la aplicación en un monolito modular, con lógica de negocio centralizada y pruebas.

La base funcional es aprovechable. Sin embargo, su estado original no reúne todavía las garantías que esperaría para crecer como sistema de gestión de ausencias y datos de trabajadores. Los riesgos no se resuelven cambiando Vercel por Dokploy: hay deuda de seguridad, cálculo de saldos, trazabilidad y mantenibilidad. La preparación de infraestructura está separada de esas mejoras funcionales.

Esta es una revisión estática del backend, bibliotecas y estructura de la interfaz, con pruebas unitarias/control de flujo y comprobación HTTP limitada. No es una auditoría exhaustiva de producción: no se han leído datos reales, comprobado las variables de Vercel, examinado todo el historial Git, ejecutado el navegador ni restaurado una base de datos.

## Funciones que se han identificado en el código

- Usuarios con roles trabajador, responsable de departamento y administrador; perfiles, altas/invitaciones, cambio y restablecimiento de contraseña, activación y eliminación.
- Calendario de equipo, filtros por departamentos, cumpleaños y directorio básico de compañeros.
- Solicitudes de vacaciones, ausencias temporales, bajas y permisos; medios días, aprobación, rechazo y cancelación. El responsable no puede aprobar sus propias solicitudes; el administrador sí puede según la condición actual.
- Festivos e importación desde Excel, CSV y PDF con previsualización.
- Importación histórica de Calamari y exportación mensual tipo timesheet.
- Adjuntos de justificantes guardados en PostgreSQL, notificaciones por correo y enlaces para añadir fechas a Google Calendar. Estos enlaces no equivalen a sincronización bidireccional con Calendar.

Son funciones encontradas en el código; no se afirma que todas hayan sido verificadas end-to-end.

## Qué merece conservarse

Las consultas SQL revisadas utilizan parámetros para los datos recibidos; existe una separación inicial entre rutas y bibliotecas. Las contraseñas se derivan mediante scrypt con sales individuales. Las cookies de login son HttpOnly, SameSite=Lax y Secure en producción. La resolución de solicitudes realiza un UPDATE condicionado por el estado anterior y detecta carreras. Los adjuntos comprueban permisos en el servidor. Algunas operaciones de eliminación utilizan transacciones. El lockfile permite instalar las versiones exactas. El frontend libera eventos y temporizadores al desmontarse.

SQL directo con pg no es, por sí mismo, un problema de calidad. Un ORM tampoco corregiría por sí solo las reglas de permisos, saldos o auditoría. Su incorporación sería una decisión de mantenimiento, no un requisito para llamar backend a esta aplicación.

## Hallazgos y prioridad

### 1. Seguridad de sesiones y dependencias — antes de producción

En el original, lib/auth.js aceptaba una clave de firma fija conocida si faltaba SESSION_SECRET, y lib/db.js creaba un administrador con contraseña fija. El repositorio figura público. Esto es un riesgo del código/configuración, no una prueba de que la instalación actual de Vercel haya sido comprometida o esté utilizando esos valores.

La rama de migración elimina la clave de firma predeterminada, exige al menos 32 caracteres, valida tokens malformados/caducados y exige una contraseña explícita para la inicialización heredada. En Dokploy no se ejecuta esa inicialización: se valida el esquema restaurado en modo external. No se han cambiado contraseñas existentes ni invalidado sesiones de Vercel.

Persisten mejoras: límites de intentos de acceso, validación/tamaño de contraseñas de entrada, caducidad y revocación por sesión/usuario, invalidación tras restablecer contraseña, recuperación con enlaces de un uso y revisión explícita de protección CSRF. Las sesiones actuales duran 30 días y una modificación de contraseña no revoca automáticamente las otras sesiones firmadas. No se ha acreditado la protección ofrecida por el proxy de Vercel o por otro sistema externo.

npm audit --omit=dev identificó tres paquetes afectados: Next critical; PostCSS y xlsx high. Existen múltiples avisos por paquete; este recuento no significa tres únicas vulnerabilidades ni demuestra que todos los avisos sean explotables en esta app. La política oficial lista Next 14 como no soportado; a la fecha consultada Next 16 está en soporte activo y 15 en mantenimiento. La propuesta de npm de actualizar Next a 16.3.5 es un salto mayor y no se ha aplicado con force. Debe actualizarse con pruebas de cookies, parámetros de rutas, React, importaciones y despliegue.

xlsx 0.18.5 corresponde a la distribución npm antigua. SheetJS publica su distribución actual por su CDN oficial; valorar actualización con artefacto fijado e integridad verificada o sustitución compatible, no suprimir avisos a ciegas ni instalar un fork desconocido. Las importaciones deben probarse con ficheros representativos.

Evidencia: lib/auth.js, lib/db.js, app/api/auth/*, app/api/users/[id]/reset-password/route.js, package.json, package-lock.json y resultado de auditoría. Referencias oficiales al final.

### 2. Privacidad y permisos — antes de datos reales

app/api/bootstrap/route.js devuelve a trabajadores las solicitudes propias y todas las aprobadas. rowToRequest también incluye note, decisionNote, tipo de ausencia y datos de resolución. Por tanto, el endpoint puede entregar comentarios internos o notas de bajas a compañeros aunque la pantalla no los muestre. La descarga de adjuntos utiliza permisos más restringidos; no se debe confundir esa protección con la de los datos del calendario.

Propuesta: separar un calendario corporativo mínimo de los detalles privados; devolver sólo campos necesarios según el rol y relación con la solicitud, con pruebas negativas para trabajador ajeno y responsable de otro departamento. Acordar quién puede conocer el motivo de una ausencia y acceder a justificantes. Revisar además el uso de avatares externos y si es necesario recopilar la fecha de nacimiento completa. No se ha modificado todavía esa política de negocio.

También debe unificarse la protección del último administrador: DELETE tiene una comprobación, pero PATCH puede cambiar rol/activación sin una protección equivalente. Probar esas transiciones sin usar cuentas reales.

### 3. Cómputos y saldos — prioridad funcional alta

El backend calcula días laborables, pero el saldo mostrado se calcula en app/page.js con el subconjunto de solicitudes descargado. bootstrap impone LIMIT 1000 sin paginación ni contrato por año. Cuando el historial crezca, solicitudes relevantes pueden quedar fuera y alterar los saldos mostrados.

El saldo asigna una solicitud entera al año de dateFrom, tanto en frontend como en el correo. Una solicitud que cruza diciembre/enero necesita reparto por día y ejercicio. El formulario también compara determinadas solicitudes con el año actual, no necesariamente el año solicitado. El backend consulta festivos de los años extremos, no todos los años intermedios de un rango largo.

Se reprodujeron dos casos sin datos reales:

- parseISODate('2026-02-30') se convierte en 2026-03-02 en lugar de rechazarse.
- Un rango de sábado 19/09/2026 a lunes 21/09/2026 con halfStart=true descuenta medio día del único día laborable. El exportador aplica la mitad al extremo literal, lo que puede producir una discrepancia entre saldo y horas exportadas.

No se observan comprobaciones de solapamientos en creación ni un control transaccional del cupo. Permitir superar el saldo no es automáticamente un fallo: la interfaz contiene expresamente «Enviar de todos modos». Debe acordarse y aplicar en servidor la política de advertir, bloquear o requerir aprobación excepcional, sin eliminar esa función por iniciativa técnica.

Propuesta: módulo único de cálculo en servidor, saldo por persona/ejercicio y desglose por días; fechas reales validadas, límites de rango, medios días consistentes, control de concurrencia y solapamiento. La interfaz puede anticipar el cálculo, pero no ser su única autoridad.

### 4. Estructura y pruebas — prioridad de mantenimiento alta

app/page.js concentra 3.551 líneas. React actúa esencialmente como contenedor de initApp; el estado APP, las plantillas HTML, innerHTML, los eventos, formularios y llamadas API viven en una estructura imperativa extensa. El uso de innerHTML no prueba por sí solo una vulnerabilidad: hay un helper de escape, pero aumenta la superficie que revisar y dificulta pruebas y cambios aislados.

Propuesta gradual: componentes React reales para calendario, solicitud, aprobaciones, empleados, informes y adjuntos; cliente API común; validación compartida de contratos; módulos de dominio y acceso a datos en servidor. Incorporar TypeScript de forma incremental puede detectar errores de contratos, pero no requiere reescribir todo en una única entrega. No añadir microservicios ni una segunda cadena Python sólo para separar archivos.

La rama incorpora 27 pruebas iniciales y comprobaciones HTTP. Siguen pendientes pruebas de rutas con usuarios/roles reales de ensayo, PostgreSQL 16, migración/restauración, importadores y navegador. No se declara cobertura completa. Tampoco hay una configuración completa de lint/TypeScript en el original.

### 5. Datos e historial — prioridad alta

El esquema usa TEXT para fechas, roles, tipos y estados, y no incorpora en el código restricciones suficientes ni migraciones versionadas. No existen índices de búsqueda declarados en el repositorio para los principales filtros por trabajador/departamento/fechas; la base real no se ha inspeccionado y podría contener cambios manuales.

El esquema original se crea/altera durante solicitudes HTTP, con una promesa en memoria, sin historial de migraciones. En la rama, Dokploy utiliza validación de sólo lectura y exige restauración previa; permanece pendiente introducir un mecanismo versionado para futuras evoluciones.

La cancelación sobrescribe los últimos datos de resolución. No hay una tabla de eventos de auditoría que conserve toda la secuencia. La eliminación de un empleado borra explícitamente sus solicitudes y, por cascada, sus adjuntos. Para un uso duradero recomiendo desactivación como operación habitual y una política explícita de conservación/eliminación, no borrado de historial por defecto. No se han borrado datos.

### 6. Importaciones y adjuntos — prioridad alta

Las confirmaciones de importación insertan filas en bucles sin una transacción de lote ni identificador que evite reimportar el mismo contenido. Un fallo intermedio puede dejar parte importada y un reintento puede duplicar registros. La previsualización es positiva, pero no sustituye validación, trazabilidad e idempotencia en la confirmación.

Las rutas de importación no limitan el tamaño del archivo antes de convertirlo en Buffer. Los adjuntos tienen un límite de 8 MB y lista de MIME, pero no se observa validación de la firma real del archivo ni cuota total. Las bibliotecas de parsing y los límites de memoria merecen ensayos específicos. No se ha configurado antivirus ni almacenamiento externo; no se afirma que existan.

Propuesta: tamaño máximo, validación estructural, restricciones de filas/rangos, transacción por lote, huella de importación, previsualización vinculada a la confirmación, informe de errores y pruebas de duplicados/reintentos. Mantener PostgreSQL para adjuntos mientras tamaño y volumen lo justifiquen; separar almacenamiento sólo si la necesidad es real.

### 7. Notificaciones — bloqueante de compatibilidad para conservar todas las funciones

El SMTP Gmail actual usa puerto 465; las herramientas disponibles de la plataforma autorizan HTTPS/servicios internos, no SMTP arbitrario. No basta con copiar GMAIL_APP_PASSWORD ni añadir un dominio a una lista HTTPS. Propuesta: adaptador Gmail API u otro transporte HTTPS autorizado, con secretos fuera de Git y cliente compatible con el proxy.

Los envíos se realizan dentro de la petición y sus resultados no se persisten para reintento. Una operación puede quedar guardada aunque una consulta posterior para notificación falle. Las plantillas interpolan nombres y notas sin escape HTML centralizado. Recomiendo notificaciones transaccionales mediante outbox, reintentos idempotentes y registro de estado de entrega. No se ha añadido un scheduler, una cola ni un proceso permanente.

APP_URL debe cambiar a la URL real de Dokploy: el fallback actual sigue apuntando a Vercel. No se ha inventado una nueva URL ni cambiado enlaces productivos.

## Modelo funcional a acordar para crecer

El modelo actual asume lunes a viernes y equivalencias de 8 horas; los departamentos y tipos de ausencia están definidos en código, y el calendario inicial contiene festivos de 2026. Valorar, según necesidad real: jornadas parciales y horarios individuales, calendarios por centro/año, incorporaciones y bajas, prorrateo, arrastres y caducidad de saldo, permisos con reglas propias, sustituciones/delegaciones y niveles de aprobación, cupos de presencia por departamento, historial de cambios, correcciones retroactivas y exportaciones para gestión laboral.

Son requisitos candidatos, no obligaciones legales determinadas ni funciones ya implantadas. No cambiar automáticamente convenios, festivos o políticas de la empresa.

## Secuencia recomendada

1. Estabilizar seguridad y datos: versiones soportadas, privacidad, sesiones, validación, pruebas de PostgreSQL/restauración y transporte de correo compatible. Mantener Vercel durante el ensayo.
2. Completar migración con conciliación y corte de escrituras, publicando sólo una revisión comprobada. No perder adjuntos ni dejar dos bases aceptando cambios divergentes.
3. Modularizar la aplicación existente: lógica de dominio/servicios/repositorios, contratos API y componentes de interfaz. Llevar los saldos al servidor y añadir auditoría e importaciones idempotentes.
4. Añadir únicamente las funciones de gestión acordadas. Evaluar un backend separado sólo si hay varios clientes independientes, integraciones con requisitos propios o una necesidad operativa real de despliegue/escalado separado. Nada de lo inspeccionado exige por sí solo esa separación.

## Referencias oficiales consultadas

- Next.js, framework full-stack: https://nextjs.org/docs
- Política de soporte: https://nextjs.org/support-policy
- Self-hosting: https://nextjs.org/docs/app/guides/self-hosting
- SSL y precedencia de configuración de pg: https://node-postgres.com/features/ssl
- SheetJS, distribución npm heredada y canal oficial: https://docs.sheetjs.com/docs/getting-started/installation/nodejs/
- Gmail API, envío: https://developers.google.com/workspace/gmail/api/guides/sending

Para configuración, comprobaciones y recuperación, ver migration-dokploy.md.
