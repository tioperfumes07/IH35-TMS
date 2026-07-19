/**
 * Shared lifecycle controls for verify:local-ci (VLCI).
 *
 * Single-owner law:
 *   - At most one owning local-ci Postgres lifecycle at a time (exclusive lock).
 *   - Nested `npm run verify:local-ci` while IH35_VLCI_ACTIVE=1 fails closed.
 *   - Ephemeral clusters bind a dynamically allocated free port (no fixed 54329 clash).
 *   - Explicit inherit mode reuses a parent-provided local ih35_verify URL without starting PG.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

export const VLCI_ENV = Object.freeze({
  ACTIVE: "IH35_VLCI_ACTIVE",
  OWNED: "IH35_VLCI_OWNED",
  INHERIT: "IH35_VLCI_INHERIT",
  DATABASE_URL: "IH35_VLCI_DATABASE_URL",
  PORT: "IH35_VLCI_PORT",
  LOCK_PATH: "IH35_VLCI_LOCK_PATH",
});

export const VLCI_DB_NAME = "ih35_verify";
/** CI / docker-compose.verify.yml published port — still accepted as a local-safe target. */
export const VLCI_CI_PORT = 54329;

export function defaultLockPath(repoRoot) {
  const digest = createHash("sha256").update(path.resolve(repoRoot)).digest("hex").slice(0, 16);
  return path.join(os.tmpdir(), `ih35-vlci-${digest}.lock`);
}

export function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Exclusive create-or-stale-reclaim lock. Fail closed if another live owner holds it.
 * Returns { ok:true, lockPath, created:true } or { ok:false, reason, holderPid? }.
 */
export function acquireExclusiveLock(
  lockPath,
  { pid = process.pid, now = Date.now(), isAlive = isPidAlive, retries = 1 } = {}
) {
  const payload = `${JSON.stringify({ pid, startedAt: now })}\n`;
  try {
    const fd = fs.openSync(lockPath, "wx");
    try {
      fs.writeFileSync(fd, payload, "utf8");
    } finally {
      fs.closeSync(fd);
    }
    return { ok: true, lockPath, created: true };
  } catch (err) {
    if (err?.code !== "EEXIST") {
      return { ok: false, reason: `lock-open-failed:${err?.code || err?.message || "unknown"}` };
    }
    let existing = null;
    try {
      existing = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    } catch {
      if (retries <= 0) return { ok: false, reason: "lock-held-unreadable" };
      try {
        fs.rmSync(lockPath, { force: true });
      } catch {
        return { ok: false, reason: "lock-held-unreadable" };
      }
      return acquireExclusiveLock(lockPath, { pid, now, isAlive, retries: retries - 1 });
    }
    const holderPid = Number(existing?.pid);
    if (isAlive(holderPid)) {
      return { ok: false, reason: "lock-held", holderPid };
    }
    if (retries <= 0) return { ok: false, reason: "lock-held-stale-race" };
    try {
      fs.rmSync(lockPath, { force: true });
    } catch {
      return { ok: false, reason: "lock-held-stale-race" };
    }
    return acquireExclusiveLock(lockPath, { pid, now, isAlive, retries: retries - 1 });
  }
}

export function releaseExclusiveLock(lockPath, { pid = process.pid } = {}) {
  if (!lockPath || !fs.existsSync(lockPath)) return { ok: true, released: false };
  try {
    const existing = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    if (Number(existing?.pid) !== pid) {
      return { ok: false, reason: "lock-owned-by-other", holderPid: Number(existing?.pid) };
    }
  } catch {
    // Unreadable lock we still attempt to remove if we created the path in this process.
  }
  fs.rmSync(lockPath, { force: true });
  return { ok: true, released: true };
}

/** Allocate an ephemeral free TCP port on 127.0.0.1. */
export function allocateEphemeralPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      server.close((closeErr) => {
        if (closeErr) reject(closeErr);
        else if (!port) reject(new Error("allocateEphemeralPort: no port"));
        else resolve(port);
      });
    });
  });
}

export function allocateEphemeralPortSync() {
  // listen(0) is async in Node; use a short-lived child so callers can stay spawnSync-shaped.
  const res = spawnSync(
    process.execPath,
    [
      "-e",
      `const net=require("net");const s=net.createServer();s.listen(0,"127.0.0.1",()=>{const p=s.address().port;s.close(()=>process.stdout.write(String(p)));});`,
    ],
    { encoding: "utf8" }
  );
  if (res.status !== 0) {
    throw new Error(`allocateEphemeralPortSync failed: ${(res.stderr || res.error || "").toString()}`);
  }
  const port = Number(String(res.stdout || "").trim());
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`allocateEphemeralPortSync: invalid port ${JSON.stringify(res.stdout)}`);
  }
  return port;
}

/**
 * Local-safe verify DB target (anti-prod).
 * Accepts:
 *   - localhost/127.0.0.1 + ih35_verify + port 54329 (CI / docker-compose.verify)
 *   - localhost/127.0.0.1 + ih35_verify + any port when IH35_VLCI_OWNED=1 (ephemeral VLCI)
 */
export function isLocalVerifyDatabaseUrl(verifyUrl, env = process.env) {
  if (typeof verifyUrl !== "string" || !verifyUrl.includes(VLCI_DB_NAME)) return false;
  let parsed;
  try {
    parsed = new URL(verifyUrl);
  } catch {
    return false;
  }
  const host = parsed.hostname;
  if (host !== "localhost" && host !== "127.0.0.1") return false;
  const port = parsed.port || "5432";
  if (port === String(VLCI_CI_PORT)) return true;
  return env[VLCI_ENV.OWNED] === "1";
}

/**
 * Resolve how this process should obtain a verify DB.
 * @returns {{ mode: "own" } | { mode: "inherit", url: string } | { mode: "reject", reason: string }}
 */
export function resolveVlciLifecycle(env = process.env) {
  if (env[VLCI_ENV.ACTIVE] === "1") {
    return {
      mode: "reject",
      reason:
        "nested verify:local-ci refused (IH35_VLCI_ACTIVE=1). Gate graph must stay acyclic — one local-ci owner per push.",
    };
  }
  if (env[VLCI_ENV.INHERIT] === "1") {
    const url = env[VLCI_ENV.DATABASE_URL] || env.DATABASE_URL || "";
    if (!isLocalVerifyDatabaseUrl(url, { ...env, [VLCI_ENV.OWNED]: "1" })) {
      return {
        mode: "reject",
        reason:
          "IH35_VLCI_INHERIT=1 requires IH35_VLCI_DATABASE_URL/DATABASE_URL pointing at local ih35_verify",
      };
    }
    return { mode: "inherit", url };
  }
  return { mode: "own" };
}

/** C5 must never execute these — they are orchestrators, not unit guards. */
export const C5_ORCHESTRATOR_SCRIPTS = Object.freeze(["verify:local-ci", "verify:static"]);
