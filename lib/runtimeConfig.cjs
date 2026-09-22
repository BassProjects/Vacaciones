// Configuration is read at runtime, never embedded into the browser bundle.
const DATABASE_KEYS = [
  "POSTGRES_URL", "POSTGRES_PRISMA_URL", "DATABASE_URL", "POSTGRES_URL_NON_POOLING",
];

function sessionSecret(env = process.env) {
  const value = env.SESSION_SECRET;
  if (typeof value !== "string" || value.length < 32 ||
      value === "electropolis-vacaciones-default-secret-2026") {
    throw new Error("SESSION_SECRET must contain at least 32 characters and must not use the legacy default");
  }
  return value;
}

function databaseOptions(env = process.env) {
  const connectionString = DATABASE_KEYS.map((key) => env[key]).find(Boolean);
  if (!connectionString) throw new Error("A PostgreSQL connection must be configured");
  let url;
  try { url = new URL(connectionString); } catch {
    throw new Error("Invalid PostgreSQL connection configuration");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("The database connection must use PostgreSQL");
  }
  // pg's connection-string SSL options override its ssl object. Normalize the
  // mode explicitly rather than accidentally disabling certificate checks.
  for (const key of ["sslcert", "sslkey", "sslrootcert"]) {
    if (url.searchParams.has(key)) {
      throw new Error("Custom PostgreSQL TLS certificates require an explicit deployment configuration");
    }
  }
  const mode = env.DATABASE_SSL_MODE || url.searchParams.get("sslmode") || "verify-full";
  if (!["disable", "require", "verify-full"].includes(mode)) {
    throw new Error("DATABASE_SSL_MODE must be disable or verify-full (require also verifies certificates)");
  }
  url.searchParams.delete("sslmode");
  url.searchParams.delete("ssl");
  return {
    connectionString: url.toString(),
    ssl: mode === "disable" ? false : { rejectUnauthorized: true },
    max: 5,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
    statement_timeout: 10000,
    query_timeout: 11000,
  };
}

function validateDeploymentEnvironment(env = process.env) {
  sessionSecret(env);
  databaseOptions(env);
  if (env.SCHEMA_MANAGEMENT !== "external") {
    throw new Error("Dokploy requires SCHEMA_MANAGEMENT=external; restore or migrate the database before starting the application");
  }
}

module.exports = { DATABASE_KEYS, sessionSecret, databaseOptions, validateDeploymentEnvironment };
