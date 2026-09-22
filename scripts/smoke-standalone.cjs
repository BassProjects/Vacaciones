// Foreground, disposable HTTP smoke test. No production data or credentials.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");

async function main() {
  const root = path.resolve(__dirname, "..");
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "vacaciones-smoke-"));
  let child;
  try {
    fs.cpSync(path.join(root, ".next/standalone"), temporary, { recursive: true });
    fs.cpSync(path.join(root, ".next/static"), path.join(temporary, ".next/static"), { recursive: true });
    fs.cpSync(path.join(root, "public"), path.join(temporary, "public"), { recursive: true });
    fs.mkdirSync(path.join(temporary, "scripts"), { recursive: true });
    fs.mkdirSync(path.join(temporary, "lib"), { recursive: true });
    fs.copyFileSync(path.join(root, "scripts/start-dokploy.cjs"), path.join(temporary, "scripts/start-dokploy.cjs"));
    fs.copyFileSync(path.join(root, "lib/runtimeConfig.cjs"), path.join(temporary, "lib/runtimeConfig.cjs"));

    const absent = spawnSync(process.execPath, ["scripts/start-dokploy.cjs"], {
      cwd: temporary, env: { NODE_ENV: "production" }, encoding: "utf8", timeout: 5000,
    });
    assert.equal(absent.status, 1, "startup must reject missing secrets");
    assert.match(absent.stderr, /SESSION_SECRET/);
    console.log("PASS startup refuses missing SESSION_SECRET");

    const reservation = net.createServer();
    await new Promise((resolve, reject) => {
      reservation.once("error", reject);
      reservation.listen(0, "127.0.0.1", resolve);
    });
    const port = reservation.address().port;
    await new Promise((resolve) => reservation.close(resolve));
    child = spawn(process.execPath, ["scripts/start-dokploy.cjs"], {
      cwd: temporary,
      env: {
        NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
        HOSTNAME: "127.0.0.1", PORT: String(port), TZ: "Europe/Madrid",
        SESSION_SECRET: crypto.randomBytes(32).toString("hex"),
        DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1:1/vacaciones_test",
        DATABASE_SSL_MODE: "disable", SCHEMA_MANAGEMENT: "external",
      },
      stdio: ["ignore", "ignore", "ignore"],
    });
    let spawnError;
    child.on("error", (error) => { spawnError = error; });
    const base = `http://127.0.0.1:${port}`;
    let started = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error("Standalone server terminated before readiness");
      try {
        const response = await fetch(`${base}/health`, { signal: AbortSignal.timeout(1000) });
        if (response.status === 200) { started = true; break; }
      } catch { /* wait for the disposable child to bind its local socket */ }
      await delay(100);
    }
    assert.equal(started, true, "standalone server starts");
    const health = await fetch(`${base}/health`);
    assert.deepEqual(await health.json(), { status: "ok" });
    assert.equal(health.headers.get("cache-control"), "no-store");
    console.log("PASS /health returns 200 without a database");

    const page = await fetch(base);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /app-container/);
    console.log("PASS / returns the application HTML (JavaScript is not executed)");
    const asset = html.match(/\/_next\/static\/[^"\s]+\.js/);
    assert.ok(asset, "HTML references a JavaScript bundle");
    assert.equal((await fetch(base + asset[0])).status, 200);
    console.log("PASS standalone JavaScript asset is served");

    const readiness = await fetch(`${base}/ready`, { signal: AbortSignal.timeout(6000) });
    assert.equal(readiness.status, 503);
    assert.deepEqual(await readiness.json(), { status: "not_ready" });
    console.log("PASS /ready returns 503 without exposing database details");
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const stopped = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGTERM");
      await Promise.race([stopped, delay(3000)]);
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await stopped;
      }
    }
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(`HTTP smoke test failed: ${error.message}`);
  process.exitCode = 1;
});
