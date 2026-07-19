#!/usr/bin/env node
/**
 * verify:local-ci — reproduce CI's `build-typecheck` EXACTLY before pushing, so a PR never lands red.
 *
 * WHY the rewrite: the first version ran a hand-picked subset (db:migrate + tsc + verify:arch-design +
 * schema-parity). But build-typecheck runs `npm run verify:pre-commit`, which loads and runs EVERY
 * scripts/verify-steps/*.mjs (db-reset → db-migrate → build → frontend-tsc → the full ~250-guard suite →
 * backend db.tests). Any guard that lives in a verify-step but NOT in verify:arch-design (schema-parity,
 * mdata-entity-scope, …) was invisible to the subset — so PRs kept going red on CI despite a "green" local
 * run. This version runs the SAME command CI runs, so it can never miss a guard.
 *
 * HOW (prod-safe by construction): verify:pre-commit's db-reset only accepts a local `ih35_verify`
 * target (CI port 54329, or a VLCI-owned dynamic port). This script spins up an EPHEMERAL, throwaway
 * local Postgres on a free port with a fresh `ih35_verify` db, runs `npm run verify:pre-commit` against
 * it, then tears the instance down. It never touches an existing database or prod — the cluster is
 * created in a tmp dir and destroyed on exit.
 *
 * SINGLE-OWNER / ACYCLIC GATE LAW:
 *   - Exclusive lock + IH35_VLCI_ACTIVE fail-closed nested invocation (C5 must not nest this).
 *   - Dynamic port allocation avoids fixed-port 54329 collisions with docker-compose.verify / siblings.
 *   - IH35_VLCI_INHERIT=1 reuses an explicit parent-provided local verify URL (no second lifecycle).
 *
 * Requires a local Postgres SERVER binary (Postgres.app, or `postgresql@16` via brew). Usage:
 *   node scripts/verify-local-ci.mjs            # full build-typecheck parity (the pre-push gate)
 *   node scripts/verify-local-ci.mjs --selftest # prove the ephemeral-cluster orchestration works (fast)
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  VLCI_ENV,
  VLCI_DB_NAME,
  acquireExclusiveLock,
  allocateEphemeralPortSync,
  defaultLockPath,
  releaseExclusiveLock,
  resolveVlciLifecycle,
} from "./vlci-lifecycle.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-local-ci";
const DBNAME = VLCI_DB_NAME;
const PGUSER = process.env.USER || "postgres";

/** Locate a local Postgres server toolchain (needs postgres + initdb + pg_ctl + createdb). */
export function findPgBin() {
  const cands = [];
  const appBase = "/Applications/Postgres.app/Contents/Versions";
  try {
    if (fs.existsSync(appBase)) {
      for (const v of fs.readdirSync(appBase).sort((a, b) => Number(b) - Number(a))) cands.push(path.join(appBase, v, "bin"));
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

/** Create → return { dataDir, port, stop() }. Throws on failure. */
export function startEphemeralPg(pgBin, port = allocateEphemeralPortSync()) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vlci-pgdata-"));
  const logFile = path.join(dataDir, "server.log");
  const init = run(pgBin, "initdb", ["-D", dataDir, "-U", PGUSER, "-A", "trust", "--no-sync", "-E", "UTF8"]);
  if (init.status !== 0) {
    fs.rmSync(dataDir, { recursive: true, force: true });
    throw new Error(`initdb failed:\n${init.stderr || init.stdout}`);
  }
  // listen on localhost only; socket in the data dir. Throwaway cluster → FAST/DURABILITY-OFF mode
  // (fsync/synchronous_commit/full_page_writes off). Safe: data dir destroyed on exit.
  const start = run(pgBin, "pg_ctl", [
    "-D", dataDir,
    "-o", `-p ${port} -c listen_addresses=localhost -k ${dataDir} -c fsync=off -c synchronous_commit=off -c full_page_writes=off -c shared_buffers=256MB -c work_mem=32MB -c max_connections=200`,
    "-l", logFile, "-w", "-t", "30", "start",
  ]);
  if (start.status !== 0) {
    const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").slice(-600) : "";
    fs.rmSync(dataDir, { recursive: true, force: true });
    throw new Error(`pg_ctl start failed (port ${port}):\n${start.stderr}\n${log}`);
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

function selftest(pgBin) {
  process.stdout.write(`──▶ selftest: lock → dynamic port → init → start → createdb → query → stop\n`);
  const lockPath = defaultLockPath(path.join(os.tmpdir(), `vlci-selftest-${process.pid}`));
  const lock = acquireExclusiveLock(lockPath);
  if (!lock.ok) {
    console.error(`FAIL  could not acquire selftest lock: ${lock.reason}`);
    process.exit(1);
  }
  let ok = false;
  let port = 0;
  try {
    const nested = resolveVlciLifecycle({ [VLCI_ENV.ACTIVE]: "1" });
    if (nested.mode !== "reject") {
      console.error("FAIL  nested ACTIVE must reject");
      process.exit(1);
    }
    console.log("ok    nested ACTIVE rejected");
    port = allocateEphemeralPortSync();
    const pg = startEphemeralPg(pgBin, port);
    try {
      const q = run(pgBin, "psql", ["-h", "localhost", "-p", String(port), "-U", PGUSER, "-d", DBNAME, "-tAc",
        "select current_database()||'@'||inet_server_port()"]);
      ok = q.status === 0 && q.stdout.trim() === `${DBNAME}@${port}`;
      console.log(`${ok ? "ok  " : "FAIL"}  ephemeral cluster reachable at localhost:${port}/${DBNAME}  (${(q.stdout || q.stderr).trim()})`);
    } finally {
      pg.stop();
    }
  } finally {
    releaseExclusiveLock(lockPath);
  }
  if (!ok) { console.error(`\n${LABEL} SELFTEST FAILED`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS — ephemeral-cluster orchestration + single-owner lock works.`);
}

function runPrecommit(url, port, pgBin) {
  console.log(`[${LABEL}] running the exact CI command — npm run verify:pre-commit`);
  console.log(`[${LABEL}] (full build-typecheck: db-reset → migrate → build → tsc → ~250 guards → db.tests; ~6-10 min)\n`);
  const res = spawnSync("npm", ["run", "verify:pre-commit"], {
    cwd: ROOT,
    stdio: "inherit",
    // Pin BOTH connection vars to the ephemeral/inherited local cluster, and set GITHUB_ACTIONS=true so the
    // backend `.db.test.ts` suite actually RUNS (it is gated `describe.skipIf(GITHUB_ACTIONS!=="true")`).
    //
    // PROD-SAFE by construction: DATABASE_DIRECT_URL is a truthy local url, so dotenv.config() can NEVER
    // reload the prod Neon DIRECT_URL over it. verify:pre-commit's db-reset anti-prod guard still pins
    // the same local ih35_verify target (CI port or VLCI-owned dynamic port).
    env: {
      ...process.env,
      PATH: pgBin ? `${pgBin}:${process.env.PATH}` : process.env.PATH,
      DATABASE_URL: url,
      DATABASE_DIRECT_URL: url,
      PGHOST: "localhost",
      PGPORT: String(port || new URL(url).port || ""),
      PGUSER,
      CI_MIGRATION_TEST: "1",
      GITHUB_ACTIONS: "true",
      VLCI_SERIAL: "1",
      [VLCI_ENV.ACTIVE]: "1",
      [VLCI_ENV.OWNED]: "1",
      [VLCI_ENV.DATABASE_URL]: url,
      [VLCI_ENV.PORT]: String(port || new URL(url).port || ""),
    },
  });
  return res.status ?? 1;
}

function main() {
  const lifecycle = resolveVlciLifecycle(process.env);
  if (lifecycle.mode === "reject") {
    console.error(`[${LABEL}] FAILED — ${lifecycle.reason}`);
    process.exit(1);
  }

  if (lifecycle.mode === "inherit") {
    console.log(`[${LABEL}] inherit mode — reusing single test DB context (no nested Postgres lifecycle)`);
    console.log(`[${LABEL}] url=${lifecycle.url.replace(/:[^:@/]+@/, ":****@")}`);
    const status = runPrecommit(lifecycle.url, Number(new URL(lifecycle.url).port || 0), findPgBin());
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
    console.error(`  verify:local-ci needs one to spin up an ephemeral CI-shaped DB and run the real build-typecheck.`);
    process.exit(1);
  }
  if (process.argv.includes("--selftest")) { selftest(pgBin); return; }

  const lockPath = process.env[VLCI_ENV.LOCK_PATH] || defaultLockPath(ROOT);
  const lock = acquireExclusiveLock(lockPath);
  if (!lock.ok) {
    console.error(`[${LABEL}] FAILED — another verify:local-ci owns the lifecycle (fail closed).`);
    console.error(`  reason=${lock.reason}${lock.holderPid ? ` holderPid=${lock.holderPid}` : ""}`);
    console.error(`  lock=${lockPath}`);
    process.exit(1);
  }

  console.log(`[${LABEL}] postgres toolchain: ${pgBin}`);
  console.log(`[${LABEL}] single-owner lock: ${lockPath}`);
  let status = 1;
  let pg = null;
  try {
    const port = allocateEphemeralPortSync();
    pg = startEphemeralPg(pgBin, port);
    const url = `postgresql://${PGUSER}@localhost:${port}/${DBNAME}?sslmode=disable`;
    console.log(`[${LABEL}] ephemeral CI-shaped DB up at postgresql://${PGUSER}@localhost:${port}/${DBNAME}`);
    status = runPrecommit(url, port, pgBin);
  } catch (err) {
    console.error(`[${LABEL}] FAILED — ${err instanceof Error ? err.message : String(err)}`);
    status = 1;
  } finally {
    try {
      pg?.stop();
    } catch (stopErr) {
      console.error(`[${LABEL}] cleanup warning: ${stopErr instanceof Error ? stopErr.message : String(stopErr)}`);
    }
    releaseExclusiveLock(lockPath);
  }
  if (status !== 0) {
    console.error(`\n[${LABEL}] FAILED — build-typecheck reproduced RED locally (exit ${status}). Fix it here; this is exactly what CI would report. Do NOT push.`);
    process.exit(status);
  }
  console.log(`\n[${LABEL}] OK — full build-typecheck reproduced GREEN locally (verify:pre-commit). Safe to push.`);
  process.exit(0);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
