#!/usr/bin/env node
/**
 * verify:local-ci — reproduce CI's `build-typecheck` EXACTLY before pushing.
 *
 * SINGLE-OWNER / ACYCLIC / UNFORGEABLE OWNERSHIP:
 *   - Canonical lock + per-run token bound to pid/start/dataDir/port/database/url.
 *   - IH35_VLCI_OWNED/INHERIT/ACTIVE never authorize alone.
 *   - Dynamic port with bounded EADDRINUSE retry while holding the lock.
 *   - SIGINT/SIGTERM/uncaught → stop only owned PG, release lock, rm dataDir, preserve exit.
 *
 *   node scripts/verify-local-ci.mjs
 *   node scripts/verify-local-ci.mjs --selftest
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  VLCI_DB_NAME,
  allocateEphemeralPortSync,
  createOwnerSession,
  installLifecycleCleanupHandlers,
  isAddressInUseError,
  resolveVlciLifecycle,
} from "./vlci-lifecycle.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-local-ci";
const DBNAME = VLCI_DB_NAME;
const PGUSER = process.env.USER || "postgres";
const MAX_PORT_ATTEMPTS = 5;

/** Locate a local Postgres server toolchain (needs postgres + initdb + pg_ctl + createdb). */
export function findPgBin() {
  const cands = [];
  const appBase = "/Applications/Postgres.app/Contents/Versions";
  try {
    if (fs.existsSync(appBase)) {
      for (const v of fs.readdirSync(appBase).sort((a, b) => Number(b) - Number(a))) {
        cands.push(path.join(appBase, v, "bin"));
      }
    }
  } catch { /* ignore */ }
  for (const v of ["17", "16", "15"]) {
    cands.push(`/opt/homebrew/opt/postgresql@${v}/bin`, `/usr/local/opt/postgresql@${v}/bin`);
  }
  cands.push("/opt/homebrew/bin", "/usr/local/bin", "/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/15/bin");
  const needed = ["postgres", "initdb", "pg_ctl", "createdb"];
  for (const dir of cands) {
    if (needed.every((b) => fs.existsSync(path.join(dir, b)))) return dir;
  }
  const w = spawnSync("bash", ["-lc", "command -v postgres"], { encoding: "utf8" });
  if (w.status === 0 && w.stdout.trim()) {
    const dir = path.dirname(w.stdout.trim());
    if (needed.every((b) => fs.existsSync(path.join(dir, b)))) return dir;
  }
  return null;
}

function run(bin, cmd, args, opts = {}) {
  return spawnSync(path.join(bin, cmd), args, { encoding: "utf8", ...opts });
}

/** Start ephemeral PG on an exact port. Throws (with address-in-use detectable) on failure. */
export function startEphemeralPgOnPort(pgBin, port, { tempRoot } = {}) {
  if (!tempRoot) throw new Error("startEphemeralPgOnPort: private tempRoot required");
  const dataDir = fs.mkdtempSync(path.join(tempRoot, "pgdata-"));
  fs.chmodSync(dataDir, 0o700);
  const logFile = path.join(dataDir, "server.log");
  const init = run(pgBin, "initdb", ["-D", dataDir, "-U", PGUSER, "-A", "trust", "--no-sync", "-E", "UTF8"]);
  if (init.status !== 0) {
    fs.rmSync(dataDir, { recursive: true, force: true });
    throw new Error(`initdb failed:\n${init.stderr || init.stdout}`);
  }
  const start = run(pgBin, "pg_ctl", [
    "-D", dataDir,
    "-o", `-p ${port} -c listen_addresses=localhost -k ${dataDir} -c fsync=off -c synchronous_commit=off -c full_page_writes=off -c shared_buffers=256MB -c work_mem=32MB -c max_connections=200`,
    "-l", logFile, "-w", "-t", "30", "start",
  ]);
  if (start.status !== 0) {
    const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").slice(-600) : "";
    fs.rmSync(dataDir, { recursive: true, force: true });
    const err = new Error(`pg_ctl start failed (port ${port}):\n${start.stderr}\n${log}`);
    if (isAddressInUseError(err)) err.code = "EADDRINUSE";
    throw err;
  }
  const createdb = run(pgBin, "createdb", ["-h", "localhost", "-p", String(port), "-U", PGUSER, DBNAME]);
  if (createdb.status !== 0) {
    run(pgBin, "pg_ctl", ["-D", dataDir, "-w", "-m", "immediate", "stop"]);
    fs.rmSync(dataDir, { recursive: true, force: true });
    throw new Error(`createdb ${DBNAME} failed:\n${createdb.stderr}`);
  }
  return {
    dataDir,
    port,
    stop() {
      run(pgBin, "pg_ctl", ["-D", dataDir, "-w", "-m", "immediate", "stop"]);
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

/**
 * Allocate+start with bounded retry on EADDRINUSE (port TOCTOU) while caller holds the VLCI lock.
 * `allocatePort` / `startOnPort` are injectable for planted stolen-port tests.
 */
export function startEphemeralPgWithRetry(
  pgBin,
  {
    maxAttempts = MAX_PORT_ATTEMPTS,
    allocatePort = allocateEphemeralPortSync,
    tempRoot = null,
    startOnPort = (port) => startEphemeralPgOnPort(pgBin, port, { tempRoot }),
  } = {}
) {
  let lastErr = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const port = allocatePort(attempt);
    try {
      return startOnPort(port);
    } catch (err) {
      lastErr = err;
      if (isAddressInUseError(err) && attempt < maxAttempts) {
        console.error(`[${LABEL}] port ${port} in use (attempt ${attempt}/${maxAttempts}) — reallocating`);
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error("startEphemeralPgWithRetry: exhausted attempts");
}

/** @deprecated — prefer startEphemeralPgWithRetry */
export function startEphemeralPg(pgBin, port = allocateEphemeralPortSync(), { tempRoot } = {}) {
  return startEphemeralPgOnPort(pgBin, port, { tempRoot });
}

function stopOwnedPg(pg) {
  if (!pg) return;
  try {
    pg.stop();
  } catch (err) {
    console.error(`[${LABEL}] PG stop warning: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function runFrontendBuildParitySteps() {
  // L.0 (OWNER-ISSUE-INVENTORY-2026-09-05.md #3): this function existed as a comment only — the
  // CI job's "Frontend tsc -b" and "Frontend vite build" steps run BEFORE verify:pre-commit and
  // are NOT part of it, so this script's own claim of "full build-typecheck reproduced" was
  // incomplete: a pure Vite/Rollup failure (or a tsc error masked by a stale local .tsbuildinfo,
  // the exact #20486 class) could pass here and still fail Render. Runs both steps in CI's own
  // order, first, so a failure here is reported before the long guard chain even starts.
  console.log(`[${LABEL}] Frontend tsc -b (match CI + Render)`);
  const tscRes = spawnSync(
    "bash",
    ["-lc", "node scripts/generate-module-completion-data.mjs && cd apps/frontend && npx tsc -b --pretty false"],
    { cwd: ROOT, stdio: "inherit" }
  );
  if ((tscRes.status ?? 1) !== 0) return tscRes.status ?? 1;

  console.log(`[${LABEL}] Frontend vite build (Render build-command parity)`);
  const viteRes = spawnSync("bash", ["-lc", "cd apps/frontend && npx vite build"], { cwd: ROOT, stdio: "inherit" });
  return viteRes.status ?? 1;
}

function runPrecommit(session, pgBin) {
  const url = session.record.url;
  const port = session.record.port;
  const buildParityStatus = runFrontendBuildParitySteps();
  if (buildParityStatus !== 0) {
    console.error(`[${LABEL}] frontend build-parity step FAILED (exit ${buildParityStatus}) — not running verify:pre-commit`);
    return buildParityStatus;
  }
  console.log(`[${LABEL}] running the exact CI command — npm run verify:pre-commit`);
  console.log(`[${LABEL}] (full build-typecheck: db-reset → migrate → build → tsc → ~250 guards → db.tests)\n`);
  const childEnv = session.childEnv({
    ...process.env,
    PATH: pgBin ? `${pgBin}:${process.env.PATH}` : process.env.PATH,
    DATABASE_URL: url,
    DATABASE_DIRECT_URL: url,
    PGHOST: "localhost",
    PGPORT: String(port),
    PGUSER,
    CI_MIGRATION_TEST: "1",
    GITHUB_ACTIONS: "true",
    VLCI_SERIAL: "1",
  });
  const res = spawnSync("npm", ["run", "verify:pre-commit"], {
    cwd: ROOT,
    stdio: "inherit",
    env: childEnv,
  });
  return res.status ?? 1;
}

function selftest(pgBin) {
  process.stdout.write(`──▶ selftest: owner session → port-retry → query → signal-safe cleanup\n`);
  const session = createOwnerSession(path.join(ROOT, `.vlci-selftest-${process.pid}`));
  let ok = false;
  let pg = null;
  const handlers = installLifecycleCleanupHandlers(() => {
    stopOwnedPg(pg);
    pg = null;
    session.release();
  }, { exit: false });
  try {
    // Free-env OWNED without token must reject
    const forged = resolveVlciLifecycle(
      { IH35_VLCI_OWNED: "1", DATABASE_URL: "postgresql://v@127.0.0.1:55432/ih35_verify" },
      { repoRoot: ROOT }
    );
    if (forged.mode !== "reject") throw new Error("OWNED=1 without token must reject");
    console.log("ok    free-env OWNED rejected");

    pg = startEphemeralPgWithRetry(pgBin, { tempRoot: session.tempRoot });
    const url = `postgresql://${PGUSER}@localhost:${pg.port}/${DBNAME}?sslmode=disable`;
    session.updateBindings({ dataDir: pg.dataDir, port: pg.port, database: DBNAME, url });
    const q = run(pgBin, "psql", [
      "-h", "localhost", "-p", String(pg.port), "-U", PGUSER, "-d", DBNAME, "-tAc",
      "select current_database()||'@'||inet_server_port()",
    ]);
    ok = q.status === 0 && q.stdout.trim() === `${DBNAME}@${pg.port}`;
    console.log(`${ok ? "ok  " : "FAIL"}  ephemeral cluster @ localhost:${pg.port}/${DBNAME}`);
  } finally {
    handlers.runCleanup("selftest-finally");
    handlers.dispose();
  }
  if (!ok) {
    console.error(`\n${LABEL} SELFTEST FAILED`);
    process.exit(1);
  }
  console.log(`\n${LABEL} SELFTEST PASS — ownership + port-retry + cleanup path works.`);
}

function main() {
  const lifecycle = resolveVlciLifecycle(process.env, { repoRoot: ROOT });
  if (lifecycle.mode === "reject") {
    console.error(`[${LABEL}] FAILED — ${lifecycle.reason}`);
    process.exit(1);
  }

  if (lifecycle.mode === "inherit") {
    console.log(`[${LABEL}] inherit mode — validated ownership proof (no nested Postgres lifecycle)`);
    console.log(`[${LABEL}] url=postgresql://****@localhost:${lifecycle.record.port}/${DBNAME}`);
    // Inherit does not start/stop PG; parent owns cleanup.
    const status = spawnSync("npm", ["run", "verify:pre-commit"], {
      cwd: ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        DATABASE_URL: lifecycle.url,
        DATABASE_DIRECT_URL: lifecycle.url,
        PGHOST: "localhost",
        PGPORT: String(lifecycle.record.port),
        PGUSER,
        CI_MIGRATION_TEST: "1",
        GITHUB_ACTIONS: "true",
        VLCI_SERIAL: "1",
      },
    }).status ?? 1;
    if (status !== 0) {
      console.error(`\n[${LABEL}] FAILED — inherited-context verify:pre-commit RED (exit ${status}).`);
      process.exit(status);
    }
    console.log(`\n[${LABEL}] OK — inherited-context verify:pre-commit GREEN.`);
    process.exit(0);
  }

  const pgBin = findPgBin();
  if (!pgBin) {
    console.error(`[${LABEL}] FAILED — no local Postgres server binary found.`);
    console.error(`  Install Postgres.app (https://postgresapp.com) or 'brew install postgresql@16'.`);
    process.exit(1);
  }
  if (process.argv.includes("--selftest")) {
    selftest(pgBin);
    return;
  }

  let session;
  try {
    session = createOwnerSession(ROOT);
  } catch (err) {
    console.error(`[${LABEL}] FAILED — ${err instanceof Error ? err.message : String(err)}`);
    if (err?.detail?.reason === "lock-held") {
      console.error(`  another verify:local-ci owns the lifecycle (holderPid=${err.detail.holderPid})`);
    }
    process.exit(1);
  }

  console.log(`[${LABEL}] postgres toolchain: ${pgBin}`);
  console.log(`[${LABEL}] single-owner lock: ${session.lockPath}`);

  let pg = null;
  let status = 1;
  let exitAfterCleanup = null;

  const handlers = installLifecycleCleanupHandlers((why) => {
    console.error(`[${LABEL}] cleanup (${why}) — stopping owned PG + releasing lock`);
    stopOwnedPg(pg);
    pg = null;
    try {
      if (session?.record?.dataDir && fs.existsSync(session.record.dataDir)) {
        fs.rmSync(session.record.dataDir, { recursive: true, force: true });
      }
    } catch { /* ignore */ }
    session?.release();
  }, { exit: true });

  try {
    pg = startEphemeralPgWithRetry(pgBin, { tempRoot: session.tempRoot });
    const url = `postgresql://${PGUSER}@localhost:${pg.port}/${DBNAME}?sslmode=disable`;
    session.updateBindings({ dataDir: pg.dataDir, port: pg.port, database: DBNAME, url });
    console.log(`[${LABEL}] ephemeral CI-shaped DB up at postgresql://${PGUSER}@localhost:${pg.port}/${DBNAME}`);
    status = runPrecommit(session, pgBin);
    exitAfterCleanup = status;
  } catch (err) {
    console.error(`[${LABEL}] FAILED — ${err instanceof Error ? err.message : String(err)}`);
    exitAfterCleanup = 1;
  } finally {
    handlers.dispose();
    stopOwnedPg(pg);
    pg = null;
    session.release();
  }

  if (exitAfterCleanup !== 0) {
    console.error(`\n[${LABEL}] FAILED — build-typecheck reproduced RED locally (exit ${exitAfterCleanup}). Do NOT push.`);
    process.exit(exitAfterCleanup ?? 1);
  }
  console.log(`\n[${LABEL}] OK — full build-typecheck reproduced GREEN locally (verify:pre-commit). Safe to push.`);
  process.exit(0);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
