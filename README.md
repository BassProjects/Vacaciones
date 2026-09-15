# Vacaciones Electropolis

Aplicación web para gestionar las vacaciones y ausencias de los empleados de Electropolis.

## Stack

- Next.js 14 (App Router, JavaScript)
- PostgreSQL (driver `pg`, sin ORM)
- Autenticación propia con cookies firmadas HMAC (scrypt para contraseñas)
- Resend (opcional) para notificaciones por email

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
   - `RESEND_API_KEY` y `MAIL_FROM`: si quieres notificaciones por email.
4. Despliega. El esquema de base de datos y el usuario `admin` se crean
   automáticamente en la primera petición.
