# Verificación de inicio desde cero y SMTP

Repositorio ElectropolisDokploy/Vacaciones, rama migration/dokploy-assessment.
Base anterior: 7d25c36de2531d0a5724652ae7e7a40c84981f52.
Fecha de la comprobación: 22-09-2026. El SHA256 de los archivos comprobados se guarda
junto a este informe, sin datos reales ni credenciales.

La batería ejecutada con `uv run --locked python scripts/with_test_postgres.py sh scripts/check.sh`
ha terminado con código 0: manifiesto 1.0.0, Ruff y 78 pruebas aprobadas. Incluye
PostgreSQL 16 aislado y navegador de escritorio/móvil. El supervisor cerró los procesos
web y PostgreSQL y eliminó los datos de ensayo. Persisten advertencias heredadas de
deprecación de las bibliotecas de pruebas; no han impedido su ejecución.

Los nuevos casos comprueban el alta única sin email, el rechazo de contraseñas cortas,
el rechazo de instalaciones con usuarios, el acceso inicial limitado al cambio de
contraseña y la revocación posterior de sesión. Los nombres y contraseñas de los tests
son sintéticos; no se ha usado la contraseña indicada por el usuario en el chat.

SMTP se probó con dobles, sin conexiones ni correos reales: certificado TLS verificado,
STARTTLS antes de autenticación, MIME y escape HTML, errores temporales/permanentes,
resultado incierto tras desconexión durante envío, cierre de conexión y correo apagado.
Los alias GMAIL_USER/GMAIL_APP_PASSWORD funcionan sin OAuth. No se modificó uv.lock
ni se incorporó un paquete adicional para SMTP.

El primer pase detectó un dato sintético mal contado en la prueba de longitud.
Se corrigió ese dato y se repitió la batería completa, que terminó con 78/78.
El código mantiene la longitud mínima existente; no se ha rebajado para eludirla.

Pendiente de producción: contraseña inicial por formulario seguro, ejecución del alta,
verificación de /ready y acceso real. El envío SMTP requiere una capacidad de red no
expuesta por el conector y credenciales del buzón. No se ha enviado correo, importado
Vercel ni borrado una cuenta o recurso externo. No se ha creado todavía el administrador.
