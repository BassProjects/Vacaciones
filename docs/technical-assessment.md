# Evaluación y respuesta a los hallazgos

> Decisión posterior, 22-09-2026: el responsable ha elegido empezar desde cero con
> un administrador `electropolis`, sin importar Vercel, y usar SMTP, no Gmail API.
> El alta requiere un secreto válido por el canal seguro. El correo permanece pausado
> mientras falte SMTP autorizado por la plataforma. Ver [SMTP](smtp.md).
> El contenido siguiente conserva el historial del trabajo anterior; no implica
> que ahora sean obligatorias la importación del origen o la configuración OAuth.


Fecha: 22-09-2026. La evaluación inicial se hizo sobre el repositorio Next.js, base
`654c2fd4d38b7a5107670428d3c6438b8d46077f`. La primera adaptación quedó en
`0d2913d50ca0b2a05311b51f41aa31a107d1094b`. El responsable solicitó después sustituir
el backend por Python; véase [ADR 0001](adr/0001-python.md).

## Cambios de esta versión

| Hallazgo inicial | Respuesta implementada |
|---|---|
| Next.js 14 y dependencias Node con avisos | Runtime Python, dependencias bloqueadas, retirada de Next/Node del destino y auditoría Python. |
| Página de 3.551 líneas | Módulos de interfaz por función, API Python y reglas fuera del navegador. |
| Sesión con clave y administrador predeterminados | Sesiones opacas revocables; sin cuenta predeterminada; alta explícita y cambio obligatorio cuando corresponde. |
| Notas privadas en el calendario común | Respuestas reducidas para compañeros; detalles y justificantes limitados por permisos. |
| Saldos calculados sobre máximo 1.000 registros | Libro diario en PostgreSQL, saldos e informes agregados en servidor y paginación independiente. |
| Atribución del período entero al año inicial | Distribución por fecha real y políticas por ejercicio. |
| Fechas imposibles y medios días mal aplicados | Validación de fechas reales, extremos laborables y jornadas individuales. |
| Solicitudes duplicadas/solapadas | Claves de reintento, comparación de contenido, control transaccional de concurrencia y solapamiento. |
| Política de superar saldo solo visual | Regla servidor configurable: bloquear o permitir confirmación registrada y aprobación. |
| Falta de trazabilidad; borrado de empleados e historial | Eventos nuevos de solo inserción y desactivación sin borrado de solicitudes/archivos. |
| Importaciones parciales o repetidas | Previsualización en servidor, propietario, huella, confirmación transaccional e idempotencia. |
| Correo SMTP no compatible con salida autorizada | Gmail API HTTPS con bandeja de salida transaccional, reintentos acotados y entrega incierta manual. |
| Evolución automática del esquema al consultar HTTP | Alembic versionado, operación explícita y ensayo de copia/restauración con PostgreSQL real. |

Se añaden jornadas, calendarios propios, concesiones/ajustes por ejercicio, arrastres
con caducidad, prorrateo explícito, sustitución de responsables y cobertura mínima
configurable. No se activan políticas de negocio por suposición ni se presentan como
una interpretación jurídica. Los detalles están en README, configuración y seguridad.

## Qué no demuestra esta revisión

El código y sus pruebas no acreditan que los datos reales estén migrados ni que Gmail
envíe desde vuestro buzón. Esos pasos requieren acceso autorizado y secretos todavía
no introducidos. La aplicación publicada puede permanecer en activación pendiente.
Tampoco se ha eliminado la cuenta/proyecto/base de Vercel: su retirada segura requiere
un corte validado y el inventario externo correspondiente.

La recuperación autónoma mediante enlace no se ha completado: la herramienta de edición
bloqueó su formulario. No se eludió ese bloqueo ni se activaron enlaces inutilizables.
La alternativa administrativa existente permite establecer/restablecer contraseñas,
exigir su cambio y revocar sesiones. Los avisos de bienvenida no contienen contraseñas.

El histórico anterior sobrescrito no puede reconstruirse fielmente. La transferencia
preserva lo disponible y marca repartos diarios inferidos. No se han realizado pruebas
de carga de producción, auditoría de penetración externa ni certificación de cumplimiento.
Consultar el alcance exacto de los tests en [verificación Python](verification-python.md).
