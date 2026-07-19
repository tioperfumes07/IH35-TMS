/**
 * Shared lifecycle controls for verify:local-ci (VLCI).
 *
 * Ownership law (fail closed — env flags alone NEVER authorize):
 *   - Canonical lock path only (tmpdir + repo digest). IH35_VLCI_LOCK_PATH overrides are rejected.
 *   - Per-run token minted at lock acquire; written into the lock; passed only to child env.
 *   - OWNED / INHERIT / ACTIVE env flags are signals at most — proof = token + live lock +
 *     matching pid/start identity + exact dataDir/port/database/url bindings.
 *   - Nested owners fail via exclusive lock (not via forgeable ACTIVE=1).
 *   - Dynamic ports require a validated ownership proof; CI docker :54329 remains the no-proof path.
 */
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

export const VLCI_ENV = Object.freeze({
  /** Soft nested/child signal only — never authorizes. */
  ACTIVE: "IH35_VLCI_ACTIVE",
  /** Soft signal only — never authorizes. */
  OWNED: "IH35_VLCI_OWNED",
  /** Soft signal only — never authorizes. */
  INHERIT: "IH35_VLCI_INHERIT",
  /** Per-run secret; authorizes only when it matches the live canonical lock. */
  TOKEN: "IH35_VLCI_TOKEN",
  DATABASE_URL: "IH35_VLCI_DATABASE_URL",
  PORT: "IH35_VLCI_PORT",
  DATADIR: "IH35_VLCI_DATADIR",
  STARTED_AT: "IH35_VLCI_STARTED_AT",
  OWNER_PID: "IH35_VLCI_OWNER_PID",
  /** Atomically-created private run root; must match the live lock record. */
  TEMP_ROOT: "IH35_VLCI_TEMP_ROOT",
  /** Rejected when set to anything other than the canonical path. */
  LOCK_PATH: "IH35_VLCI_LOCK_PATH",
});

export const VLCI_DB_NAME = "ih35_verify";
/** CI / docker-compose.verify.yml published port — accepted without VLCI proof. */
export const VLCI_CI_PORT = 54329;

export const C5_ORCHESTRATOR_SCRIPTS = Object.freeze(["verify:local-ci", "verify:static"]);

const PRIVATE_DIR_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;

function currentUid() {
  return typeof process.getuid === "function" ? process.getuid() : null;
}

function modeBits(stat) {
  return stat.mode & 0o777;
}

function assertPrivateDirectory(dirPath) {
  const stat = fs.lstatSync(dirPath);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`unsafe-private-directory:${dirPath}`);
  }
  const uid = currentUid();
  if (uid != null && stat.uid !== uid) {
    throw new Error(`private-directory-owner-mismatch:${dirPath}`);
  }
  if (process.platform !== "win32" && modeBits(stat) !== PRIVATE_DIR_MODE) {
    throw new Error(`private-directory-mode-mismatch:${dirPath}`);
  }
  return stat;
}

function ensurePrivateDirectory(dirPath) {
  try {
    fs.mkdirSync(dirPath, { mode: PRIVATE_DIR_MODE });
  } catch (err) {
    if (err?.code !== "EEXIST") throw err;
  }
  assertPrivateDirectory(dirPath);
  return dirPath;
}

export function vlciStateRoot() {
  return ensurePrivateDirectory(path.join(os.homedir(), ".ih35-vlci"));
}

function vlciLockRoot() {
  return ensurePrivateDirectory(path.join(vlciStateRoot(), "locks"));
}

export function createPrivateTempRoot() {
  const tempParent = ensurePrivateDirectory(path.join(vlciStateRoot(), "tmp"));
  const tempRoot = fs.mkdtempSync(path.join(tempParent, "run-"));
  fs.chmodSync(tempRoot, PRIVATE_DIR_MODE);
  assertPrivateDirectory(tempRoot);
  return tempRoot;
}

function assertPrivateFileStat(stat, filePath) {
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
    throw new Error(`unsafe-private-file:${filePath}`);
  }
  const uid = currentUid();
  if (uid != null && stat.uid !== uid) {
    throw new Error(`private-file-owner-mismatch:${filePath}`);
  }
  if (process.platform !== "win32" && modeBits(stat) !== PRIVATE_FILE_MODE) {
    throw new Error(`private-file-mode-mismatch:${filePath}`);
  }
}

function openPrivateFile(filePath, flags, mode = PRIVATE_FILE_MODE) {
  try {
    const pathStat = fs.lstatSync(filePath);
    if (pathStat.isSymbolicLink()) throw new Error(`unsafe-private-file:${filePath}`);
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
  }
  const noFollow = fs.constants.O_NOFOLLOW ?? 0;
  const fd = fs.openSync(filePath, flags | noFollow, mode);
  try {
    if (process.platform !== "win32") fs.fchmodSync(fd, PRIVATE_FILE_MODE);
    assertPrivateFileStat(fs.fstatSync(fd), filePath);
    return fd;
  } catch (err) {
    fs.closeSync(fd);
    throw err;
  }
}

function safeEqualStr(a, b) {
  const left = Buffer.from(String(a ?? ""), "utf8");
  const right = Buffer.from(String(b ?? ""), "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function canonicalLockPath(repoRoot) {
  const digest = createHash("sha256").update(path.resolve(repoRoot)).digest("hex").slice(0, 16);
  return path.join(vlciLockRoot(), `${digest}.lock`);
}

/** @deprecated use canonicalLockPath */
export function defaultLockPath(repoRoot) {
  return canonicalLockPath(repoRoot);
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

export function mintVlciToken() {
  return randomBytes(32).toString("hex");
}

export function readLockFile(lockPath) {
  if (!lockPath) return null;
  let fd;
  try {
    fd = openPrivateFile(lockPath, fs.constants.O_RDONLY);
    return JSON.parse(fs.readFileSync(fd, "utf8"));
  } catch {
    return null;
  } finally {
    if (fd != null) fs.closeSync(fd);
  }
}

function writeLockFile(lockPath, record) {
  const tempPath = path.join(
    path.dirname(lockPath),
    `.${path.basename(lockPath)}.${process.pid}.${randomBytes(12).toString("hex")}.tmp`
  );
  let fd;
  try {
    fd = openPrivateFile(
      tempPath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
      PRIVATE_FILE_MODE
    );
    fs.writeFileSync(fd, `${JSON.stringify(record, null, 0)}\n`, "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tempPath, lockPath);
  } finally {
    if (fd != null) fs.closeSync(fd);
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {
      // Best-effort cleanup of an owner-created private temporary file.
    }
  }
}

/**
 * Resolve lock path. Rejects arbitrary IH35_VLCI_LOCK_PATH (must be unset or == canonical).
 */
export function resolveCanonicalLockPath(repoRoot, env = process.env) {
  const canonical = canonicalLockPath(repoRoot);
  const override = env[VLCI_ENV.LOCK_PATH];
  if (override != null && String(override).trim() !== "" && path.resolve(String(override)) !== path.resolve(canonical)) {
    return {
      ok: false,
      reason: "IH35_VLCI_LOCK_PATH override rejected — only the canonical temp lock path is allowed",
      canonical,
      override: String(override),
    };
  }
  return { ok: true, lockPath: canonical };
}

/**
 * Exclusive create-or-stale-reclaim lock with full ownership record.
 * Returns { ok:true, lockPath, record } or { ok:false, reason, holderPid? }.
 */
export function acquireExclusiveLock(
  lockPath,
  {
    pid = process.pid,
    now = Date.now(),
    token = mintVlciToken(),
    repoRoot = null,
    tempRoot = null,
    isAlive = isPidAlive,
    retries = 1,
  } = {}
) {
  const record = {
    pid,
    startedAt: now,
    token,
    repoRoot: repoRoot ? path.resolve(repoRoot) : null,
    dataDir: null,
    port: null,
    database: VLCI_DB_NAME,
    url: null,
    tempRoot,
  };
  let fd;
  try {
    fd = openPrivateFile(
      lockPath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
      PRIVATE_FILE_MODE
    );
    try {
      fs.writeFileSync(fd, `${JSON.stringify(record)}\n`, "utf8");
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
      fd = null;
    }
    return { ok: true, lockPath, record, created: true };
  } catch (err) {
    if (err?.code !== "EEXIST") {
      return { ok: false, reason: `lock-open-failed:${err?.code || err?.message || "unknown"}` };
    }
    const existing = readLockFile(lockPath);
    if (!existing) {
      return { ok: false, reason: "lock-held-unreadable" };
    }
    const holderPid = Number(existing?.pid);
    if (isAlive(holderPid)) {
      return { ok: false, reason: "lock-held", holderPid };
    }
    if (retries <= 0) return { ok: false, reason: "lock-held-stale-race" };
    const stalePath = `${lockPath}.stale.${process.pid}.${randomBytes(12).toString("hex")}`;
    try {
      fs.renameSync(lockPath, stalePath);
      const moved = readLockFile(stalePath);
      if (
        !moved ||
        !safeEqualStr(moved.token, existing.token) ||
        Number(moved.pid) !== Number(existing.pid) ||
        Number(moved.startedAt) !== Number(existing.startedAt)
      ) {
        try {
          fs.renameSync(stalePath, lockPath);
        } catch {
          // Another owner won the race; fail closed and leave its record untouched.
        }
        return { ok: false, reason: "lock-held-stale-race" };
      }
      fs.rmSync(stalePath, { force: true });
    } catch {
      return { ok: false, reason: "lock-held-stale-race" };
    }
    return acquireExclusiveLock(lockPath, {
      pid,
      now,
      token,
      repoRoot,
      tempRoot,
      isAlive,
      retries: retries - 1,
    });
  } finally {
    if (fd != null) fs.closeSync(fd);
  }
}

export function updateLockBindings(lockPath, { token, pid, dataDir, port, database, url }) {
  const existing = readLockFile(lockPath);
  if (!existing) return { ok: false, reason: "lock-missing" };
  if (!safeEqualStr(existing.token, token)) return { ok: false, reason: "token-mismatch" };
  if (Number(existing.pid) !== Number(pid)) return { ok: false, reason: "pid-mismatch" };
  if (!existing.tempRoot) return { ok: false, reason: "temp-root-missing" };
  try {
    assertPrivateDirectory(existing.tempRoot);
    assertPrivateDirectory(dataDir);
    const relativeDataDir = path.relative(existing.tempRoot, dataDir);
    if (relativeDataDir.startsWith("..") || path.isAbsolute(relativeDataDir)) {
      return { ok: false, reason: "dataDir-outside-temp-root" };
    }
  } catch {
    return { ok: false, reason: "dataDir-not-private" };
  }
  const next = {
    ...existing,
    dataDir: dataDir ?? existing.dataDir,
    port: port != null ? Number(port) : existing.port,
    database: database ?? existing.database ?? VLCI_DB_NAME,
    url: url ?? existing.url,
  };
  writeLockFile(lockPath, next);
  return { ok: true, record: next };
}

export function releaseExclusiveLock(lockPath, { pid = process.pid, token = null } = {}) {
  if (!lockPath) return { ok: true, released: false };
  const existing = readLockFile(lockPath);
  if (!existing) {
    try {
      fs.lstatSync(lockPath);
      return { ok: false, reason: "lock-held-unreadable" };
    } catch (err) {
      if (err?.code === "ENOENT") return { ok: true, released: false };
      return { ok: false, reason: "lock-stat-failed" };
    }
  }
  if (Number(existing.pid) !== Number(pid)) {
    return { ok: false, reason: "lock-owned-by-other", holderPid: Number(existing.pid) };
  }
  if (token != null && !safeEqualStr(existing.token, token)) {
    return { ok: false, reason: "token-mismatch" };
  }
  const releasedPath = `${lockPath}.released.${process.pid}.${randomBytes(12).toString("hex")}`;
  fs.renameSync(lockPath, releasedPath);
  fs.rmSync(releasedPath, { force: true });
  return { ok: true, released: true };
}

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

export function isAddressInUseError(err) {
  const text = `${err?.message || err || ""} ${err?.stderr || ""}`.toLowerCase();
  return (
    err?.code === "EADDRINUSE" ||
    text.includes("eaddrinuse") ||
    text.includes("address already in use") ||
    text.includes("address-in-use")
  );
}

/**
 * Validate ownership proof against the live canonical lock.
 * Env OWNED/INHERIT/ACTIVE are ignored for authorization.
 */
export function validateOwnershipProof(
  env = process.env,
  {
    repoRoot,
    requireBindings = true,
    expectedUrl = null,
    isAlive = isPidAlive,
  } = {}
) {
  if (!repoRoot) return { ok: false, reason: "repoRoot-required" };
  const lockRes = resolveCanonicalLockPath(repoRoot, env);
  if (!lockRes.ok) return { ok: false, reason: lockRes.reason };

  const token = env[VLCI_ENV.TOKEN];
  if (!token || typeof token !== "string" || token.length < 32) {
    return { ok: false, reason: "missing-or-short-token" };
  }

  const record = readLockFile(lockRes.lockPath);
  if (!record) return { ok: false, reason: "lock-missing" };
  if (!safeEqualStr(record.token, token)) return { ok: false, reason: "token-mismatch" };

  const ownerPid = Number(record.pid);
  if (!isAlive(ownerPid)) return { ok: false, reason: "owner-pid-dead" };

  const envOwnerPid = env[VLCI_ENV.OWNER_PID];
  if (envOwnerPid != null && String(envOwnerPid).trim() !== "" && Number(envOwnerPid) !== ownerPid) {
    return { ok: false, reason: "owner-pid-env-mismatch" };
  }
  const envStarted = env[VLCI_ENV.STARTED_AT];
  if (envStarted != null && String(envStarted).trim() !== "" && Number(envStarted) !== Number(record.startedAt)) {
    return { ok: false, reason: "startedAt-mismatch" };
  }

  if (requireBindings) {
    if (!record.dataDir || record.port == null || !record.url || !record.database) {
      return { ok: false, reason: "lock-bindings-incomplete" };
    }
    const envTempRoot = env[VLCI_ENV.TEMP_ROOT];
    if (!record.tempRoot || !envTempRoot || path.resolve(envTempRoot) !== path.resolve(record.tempRoot)) {
      return { ok: false, reason: "temp-root-mismatch" };
    }
    try {
      assertPrivateDirectory(record.tempRoot);
      assertPrivateDirectory(record.dataDir);
      const relativeDataDir = path.relative(record.tempRoot, record.dataDir);
      if (relativeDataDir.startsWith("..") || path.isAbsolute(relativeDataDir)) {
        return { ok: false, reason: "dataDir-outside-temp-root" };
      }
    } catch {
      return { ok: false, reason: "private-path-validation-failed" };
    }
    const envDataDir = env[VLCI_ENV.DATADIR];
    if (envDataDir != null && String(envDataDir).trim() !== "" && path.resolve(String(envDataDir)) !== path.resolve(record.dataDir)) {
      return { ok: false, reason: "dataDir-mismatch" };
    }
    const envPort = env[VLCI_ENV.PORT];
    if (envPort != null && String(envPort).trim() !== "" && Number(envPort) !== Number(record.port)) {
      return { ok: false, reason: "port-mismatch" };
    }
    // Every provided URL source must match the lock (DATABASE_URL alone cannot diverge from VLCI URL).
    const urlCandidates = [expectedUrl, env[VLCI_ENV.DATABASE_URL], env.DATABASE_URL].filter(
      (u) => typeof u === "string" && u.trim() !== ""
    );
    if (urlCandidates.length === 0) {
      return { ok: false, reason: "url-mismatch" };
    }
    for (const claimedUrl of urlCandidates) {
      if (!urlsMatchOwned(claimedUrl, record)) {
        return { ok: false, reason: "url-mismatch" };
      }
    }
  }

  return { ok: true, lockPath: lockRes.lockPath, record };
}

function urlsMatchOwned(claimedUrl, record) {
  let parsed;
  try {
    parsed = new URL(claimedUrl);
  } catch {
    return false;
  }
  const hostOk = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (!hostOk) return false;
  const db = parsed.pathname.replace(/^\//, "").split("?")[0];
  if (db !== (record.database || VLCI_DB_NAME)) return false;
  if (Number(parsed.port || "5432") !== Number(record.port)) return false;
  if (record.url) {
    try {
      const owned = new URL(record.url);
      if (Number(owned.port) !== Number(parsed.port)) return false;
      if (owned.pathname.replace(/^\//, "").split("?")[0] !== db) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Local-safe verify DB target (anti-prod).
 * - CI/docker :54329 + ih35_verify → allowed without VLCI proof
 * - Any other localhost ih35_verify port → ONLY with validateOwnershipProof (token+lock+bindings)
 * - OWNED=1 / INHERIT=1 alone → NEVER enough
 */
export function isLocalVerifyDatabaseUrl(verifyUrl, env = process.env, opts = {}) {
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

  const repoRoot = opts.repoRoot;
  if (!repoRoot) return false;
  const proof = validateOwnershipProof(env, {
    repoRoot,
    requireBindings: true,
    expectedUrl: verifyUrl,
    isAlive: opts.isAlive ?? isPidAlive,
  });
  return proof.ok === true;
}

/**
 * Resolve how this process should obtain a verify DB.
 * Soft INHERIT/OWNED/ACTIVE flags never authorize — only a validated ownership proof does.
 */
export function resolveVlciLifecycle(env = process.env, { repoRoot, isAlive = isPidAlive } = {}) {
  if (!repoRoot) {
    return { mode: "reject", reason: "repoRoot-required" };
  }

  const lockRes = resolveCanonicalLockPath(repoRoot, env);
  if (!lockRes.ok) return { mode: "reject", reason: lockRes.reason };

  const token = env[VLCI_ENV.TOKEN];
  if (token) {
    const proof = validateOwnershipProof(env, { repoRoot, requireBindings: true, isAlive });
    if (!proof.ok) {
      return { mode: "reject", reason: `ownership-proof-failed:${proof.reason}` };
    }
    return { mode: "inherit", url: proof.record.url, record: proof.record, lockPath: proof.lockPath };
  }

  // Soft flags without token → reject (free-env ownership eliminated).
  if (env[VLCI_ENV.INHERIT] === "1" || env[VLCI_ENV.OWNED] === "1") {
    return {
      mode: "reject",
      reason:
        "IH35_VLCI_OWNED/INHERIT without IH35_VLCI_TOKEN cannot authorize — ownership is lock+token bound",
    };
  }

  return { mode: "own", lockPath: lockRes.lockPath };
}

export function buildChildEnv(baseEnv, session) {
  const { record, lockPath, token } = session;
  return {
    ...baseEnv,
    [VLCI_ENV.ACTIVE]: "1",
    [VLCI_ENV.OWNED]: "1",
    [VLCI_ENV.TOKEN]: token,
    [VLCI_ENV.OWNER_PID]: String(record.pid),
    [VLCI_ENV.STARTED_AT]: String(record.startedAt),
    [VLCI_ENV.PORT]: String(record.port),
    [VLCI_ENV.DATADIR]: record.dataDir,
    [VLCI_ENV.TEMP_ROOT]: record.tempRoot,
    [VLCI_ENV.DATABASE_URL]: record.url,
    [VLCI_ENV.LOCK_PATH]: lockPath,
  };
}

/**
 * Create an owning VLCI session (canonical lock + token). Caller binds PG then updateBindings.
 */
export function createOwnerSession(repoRoot, { pid = process.pid, now = Date.now(), isAlive = isPidAlive } = {}) {
  const lockRes = resolveCanonicalLockPath(repoRoot, {});
  if (!lockRes.ok) throw new Error(lockRes.reason);
  const token = mintVlciToken();
  const tempRoot = createPrivateTempRoot();
  const acquired = acquireExclusiveLock(lockRes.lockPath, {
    pid,
    now,
    token,
    repoRoot,
    tempRoot,
    isAlive,
  });
  if (!acquired.ok) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    const err = new Error(`vlci-lock-failed:${acquired.reason}`);
    err.detail = acquired;
    throw err;
  }
  const session = {
    repoRoot: path.resolve(repoRoot),
    lockPath: acquired.lockPath,
    tempRoot,
    token,
    record: acquired.record,
    updateBindings({ dataDir, port, database = VLCI_DB_NAME, url }) {
      const updated = updateLockBindings(session.lockPath, {
        token: session.token,
        pid: session.record.pid,
        dataDir,
        port,
        database,
        url,
      });
      if (!updated.ok) throw new Error(`vlci-bind-failed:${updated.reason}`);
      session.record = updated.record;
      return session.record;
    },
    childEnv(baseEnv = process.env) {
      return buildChildEnv(baseEnv, session);
    },
    release() {
      const released = releaseExclusiveLock(session.lockPath, {
        pid: session.record.pid,
        token: session.token,
      });
      if (released.ok) {
        fs.rmSync(session.tempRoot, { recursive: true, force: true });
      }
      return released;
    },
  };
  return session;
}

/**
 * Install SIGINT/SIGTERM/uncaught handlers that invoke cleanup once, then re-raise/exit.
 * Returns dispose() to remove handlers.
 */
export function installLifecycleCleanupHandlers(cleanup, { exit = true } = {}) {
  let ran = false;
  const runCleanup = (why) => {
    if (ran) return;
    ran = true;
    try {
      cleanup(why);
    } catch {
      /* swallow cleanup errors; exit path still proceeds */
    }
  };

  const onSignal = (signal) => {
    runCleanup(signal);
    if (exit) {
      const code = signal === "SIGINT" ? 130 : 143;
      process.exit(code);
    }
  };
  const onUncaught = (err) => {
    runCleanup("uncaughtException");
    console.error(err);
    if (exit) process.exit(1);
  };
  const onRejection = (reason) => {
    runCleanup("unhandledRejection");
    console.error(reason);
    if (exit) process.exit(1);
  };

  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);
  process.on("uncaughtException", onUncaught);
  process.on("unhandledRejection", onRejection);

  return {
    dispose() {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
      process.off("uncaughtException", onUncaught);
      process.off("unhandledRejection", onRejection);
    },
    runCleanup,
  };
}
