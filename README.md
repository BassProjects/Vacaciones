# Vacaciones Sepiamary

Aplicación web para gestionar las vacaciones y ausencias de los empleados de Sepiamary.

## Stack

- Next.js 14 (App Router, JavaScript)
- PostgreSQL (driver `pg`, sin ORM)
- Autenticación propia con cookies firmadas HMAC (scrypt para contraseñas)
- Gmail/Google Workspace por SMTP (opcional, vía `nodemailer`) para
  notificaciones por email

## Desarrollo local

```bash
npm install
```

Crea un fichero `.env.local` con la conexión a tu Postgres local:

```
POSTGRES_URL=postgres://usuario:password@localhost:5432/vacaciones
```

```bash
npm run dev
```

Al arrancar, la aplicación crea automáticamente las tablas necesarias y un
usuario superusuario (`admin` / `admin2026`) si no existen. **Cambia esa
contraseña en cuanto entres.**

## Despliegue en Vercel

1. Conecta este repositorio a un proyecto de Vercel.
2. Añade una base de datos Postgres desde **Storage** (por ejemplo, la
   integración de Neon del Marketplace) — Vercel inyecta automáticamente
   las variables `POSTGRES_URL`, `POSTGRES_PRISMA_URL`,
   `POSTGRES_URL_NON_POOLING`, etc.
3. (Opcional) Añade en **Settings → Environment Variables**:
   - `SESSION_SECRET`: cadena aleatoria larga para firmar las sesiones.
   - `GMAIL_USER` y `GMAIL_APP_PASSWORD`: para que la app envíe por SMTP
     las notificaciones de solicitudes, aprobaciones, rechazos y
     cancelaciones (al trabajador y a los jefes del departamento) usando
     una cuenta de tu Google Workspace (por ejemplo
     `notificaciones@electropolis.es`). Ver más abajo cómo obtener la
     contraseña de aplicación.
   - `MAIL_FROM` (opcional): remitente que verán los destinatarios, por
     ejemplo `Sepiamary Vacaciones <notificaciones@electropolis.es>`. Si
     no se indica, se usa `GMAIL_USER` tal cual. Sin `GMAIL_USER` /
     `GMAIL_APP_PASSWORD` la app funciona igual, simplemente no se envían
     emails.
4. Despliega. El esquema de base de datos y el usuario `admin` se crean
   automáticamente en la primera petición.

### Enviar los emails desde una cuenta de Google Workspace

La app envía el correo por SMTP (`smtp.gmail.com:465`) autenticándose con
una cuenta de tu Workspace y una **contraseña de aplicación** (no la
contraseña normal de esa cuenta). Pasos:

1. Decide qué cuenta enviará los correos, por ejemplo
   `notificaciones@electropolis.es` (puede ser un alias o un buzón
   dedicado; no hace falta que nadie la use para leer correo).
2. Como administrador del Workspace, entra en esa cuenta y activa la
   **verificación en 2 pasos** en myaccount.google.com/security — es
   obligatoria para poder generar contraseñas de aplicación.
3. En **myaccount.google.com/apppasswords**, crea una contraseña de
   aplicación (elige un nombre como "Vacaciones app") y copia el código
   de 16 caracteres que te da Google.
4. En Vercel, añade:
   - `GMAIL_USER` = `notificaciones@electropolis.es`
   - `GMAIL_APP_PASSWORD` = la contraseña de 16 caracteres (sin espacios)
5. Redeploy. A partir de ahí, cada solicitud/aprobación/rechazo/cancelación
   se enviará desde esa cuenta.

Si el Workspace tiene bloqueado el "acceso de apps menos seguras" o las
contraseñas de aplicación mediante política de administrador, un
administrador debe habilitarlas para esa cuenta en el **Admin Console**
(Seguridad → Autenticación → Verificación en 2 pasos).
