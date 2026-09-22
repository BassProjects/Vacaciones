import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import config from "../lib/runtimeConfig.cjs";
import { computeDays, enumerateWorkDays, daysInMonth } from "../lib/dateUtils.js";
import { canAccessRequest } from "../lib/permissions.js";

// Generated, disposable test material. Never read production credentials.
process.env.SESSION_SECRET = crypto.randomBytes(32).toString("hex");
const auth = await import("../lib/auth.js");
const testEnv = () => ({
  SESSION_SECRET: crypto.randomBytes(32).toString("hex"),
  DATABASE_URL: "postgresql://test:test@localhost:5432/vacaciones_test",
  SCHEMA_MANAGEMENT: "external",
});

for (const [label, value] of [["missing", undefined], ["short", "short"], ["legacy", "electropolis-vacaciones-default-secret-2026"]]) {
  test(`session configuration rejects ${label} secret`, () => {
    assert.throws(() => config.sessionSecret({ SESSION_SECRET: value }), /SESSION_SECRET/);
  });
}
test("deployment requires externally managed schema", () => {
  assert.throws(() => config.validateDeploymentEnvironment({ ...testEnv(), SCHEMA_MANAGEMENT: "automatic" }), /external/);
  assert.doesNotThrow(() => config.validateDeploymentEnvironment(testEnv()));
});
test("database configuration rejects missing or non-PostgreSQL URLs", () => {
  assert.throws(() => config.databaseOptions({}), /PostgreSQL/);
  assert.throws(() => config.databaseOptions({ DATABASE_URL: "https://example.test" }), /PostgreSQL/);
});
test("database certificates are verified by default, including localhost", () => {
  const options = config.databaseOptions(testEnv());
  assert.deepEqual(options.ssl, { rejectUnauthorized: true });
  assert.equal(options.max, 5);
  assert.equal(options.connectionTimeoutMillis, 5000);
});
test("internal plaintext PostgreSQL requires explicit configuration", () => {
  assert.equal(config.databaseOptions({ ...testEnv(), DATABASE_SSL_MODE: "disable" }).ssl, false);
});
test("connection-string SSL mode cannot override certificate verification", () => {
  const options = config.databaseOptions({ DATABASE_URL: testEnv().DATABASE_URL + "?sslmode=require" });
  assert.deepEqual(options.ssl, { rejectUnauthorized: true });
  assert.equal(new URL(options.connectionString).searchParams.has("sslmode"), false);
});
test("insecure no-verify mode is rejected", () => {
  assert.throws(() => config.databaseOptions({ ...testEnv(), DATABASE_SSL_MODE: "no-verify" }), /DATABASE_SSL_MODE/);
});
test("custom TLS file configuration fails explicitly instead of weakening verification", () => {
  assert.throws(() => config.databaseOptions({ DATABASE_URL: testEnv().DATABASE_URL + "?sslrootcert=ca.pem" }), /TLS/);
});
test("password hashes use independent salts and verify the correct password", () => {
  const one = auth.hashPassword("synthetic-test-password");
  const two = auth.hashPassword("synthetic-test-password");
  assert.notEqual(one.salt, two.salt);
  assert.equal(auth.verifyPassword("synthetic-test-password", one.salt, one.hash), true);
  assert.equal(auth.verifyPassword("incorrect", one.salt, one.hash), false);
});
test("sessions accept valid signatures and reject modified user IDs", () => {
  const token = auth.createSessionToken("test-user");
  assert.equal(auth.verifySessionToken(token), "test-user");
  assert.equal(auth.verifySessionToken(token.replace("test-user", "other-user")), null);
});
test("sessions reject malformed, oversized and expired tokens", () => {
  for (const value of [null, {}, "", "x".repeat(513), "user.NaN.signature", "user.1.signature"]) {
    assert.equal(auth.verifySessionToken(value), null);
  }
  const payload = `test-user.${Date.now() - 1000}`;
  const signature = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("hex");
  assert.equal(auth.verifySessionToken(`${payload}.${signature}`), null);
});
test("sessions reject signed non-numeric expiry", () => {
  const payload = "test-user.NaN";
  const signature = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(payload).digest("hex");
  assert.equal(auth.verifySessionToken(`${payload}.${signature}`), null);
});
test("workdays exclude weekends and holidays", () => {
  const holidays = new Set(["2026-09-23"]);
  assert.deepEqual(enumerateWorkDays("2026-09-21", "2026-09-27", holidays), ["2026-09-21", "2026-09-22", "2026-09-24", "2026-09-25"]);
});
test("one working day with either half-day flag consumes half a day", () => {
  assert.equal(computeDays("2026-09-21", "2026-09-21", true, true, new Set()), 0.5);
});
test("two working endpoints can each consume half a day", () => {
  assert.equal(computeDays("2026-09-21", "2026-09-22", true, true, new Set()), 1);
});
test("reversed ranges and weekends contain no working days", () => {
  assert.equal(computeDays("2026-09-22", "2026-09-21", false, false, new Set()), 0);
  assert.equal(computeDays("2026-09-26", "2026-09-27", false, false, new Set()), 0);
});
test("calendar month lengths handle leap years", () => {
  assert.equal(daysInMonth(2024, 1), 29);
  assert.equal(daysInMonth(2026, 1), 28);
});
const request = { user_id: "worker-a", department: "logistica" };
for (const [label, user, expected] of [
  ["owner", { id: "worker-a", role: "worker" }, true],
  ["another worker", { id: "worker-b", role: "worker" }, false],
  ["department manager", { id: "manager", role: "manager", department: "logistica" }, true],
  ["other department manager", { id: "manager", role: "manager", department: "marketing" }, false],
  ["administrator", { id: "admin", role: "admin" }, true],
]) {
  test(`attachment permission: ${label}`, () => assert.equal(canAccessRequest(user, request), expected));
}

// These tests execute the actual db.js module with a fake pg driver. They
// validate control flow and SQL intent, NOT PostgreSQL integration/restoration.
async function loadDatabaseModule({ configured = true, hasAdmin = true, failOnce = false } = {}) {
  const queries = [];
  let poolOptions;
  let shouldFail = failOnce;
  class FakePool {
    constructor(options) { poolOptions = options; }
    async query(sql) {
      queries.push(sql);
      if (shouldFail) { shouldFail = false; throw new Error("synthetic unavailable database"); }
      return { rows: [{ configured, has_admin: hasAdmin }] };
    }
  }
  const context = vm.createContext({ process: { env: testEnv() }, console });
  const modules = {
    pg: { Pool: FakePool },
    crypto: { default: crypto },
    "./auth": { hashPassword: () => { throw new Error("Unexpected password creation"); } },
    "./constants": { DEFAULT_HOLIDAYS_2026: [] },
    "./runtimeConfig.cjs": { default: { databaseOptions: () => config.databaseOptions(testEnv()) } },
  };
  const source = await readFile(new URL("../lib/db.js", import.meta.url), "utf8");
  const module = new vm.SourceTextModule(source, { context });
  await module.link(async (specifier) => {
    assert.ok(modules[specifier], `Unexpected import: ${specifier}`);
    const exports = modules[specifier];
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  return { api: module.namespace, queries, options: () => poolOptions };
}
test("external schema validation executes SELECT only, without seeds or DDL", async () => {
  const db = await loadDatabaseModule();
  await db.api.ensureSchema();
  assert.equal(db.queries.length, 6);
  assert.ok(db.queries.every((sql) => sql.startsWith("SELECT ")));
  assert.equal(db.options().max, 5);
  await db.api.ensureSchema();
  assert.equal(db.queries.length, 6, "successful schema checks are cached");
});
test("external schema requires an administrator and app configuration", async () => {
  for (const options of [{ configured: false }, { hasAdmin: false }]) {
    const db = await loadDatabaseModule(options);
    await assert.rejects(db.api.ensureSchema(), /active administrator/);
  }
});
test("a failed schema check can retry without initialization", async () => {
  const db = await loadDatabaseModule({ failOnce: true });
  await assert.rejects(db.api.ensureSchema(), /synthetic unavailable/);
  await db.api.ensureSchema();
  assert.ok(db.queries.every((sql) => sql.startsWith("SELECT ")));
});
