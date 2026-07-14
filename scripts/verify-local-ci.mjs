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
 * HOW (prod-safe by construction): verify:pre-commit's db-reset only accepts a `localhost:54329 + ih35_verify`
 * target (its anti-prod guard). This script spins up an EPHEMERAL, throwaway local Postgres on 54329 with a
 * fresh `ih35_verify` db, runs `npm run verify:pre-commit` against it, then tears the instance down. It never
 * touches an existing database or prod — the cluster is created in a tmp dir and destroyed on exit.
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-local-ci";
const PORT = 54329; // the exact port CI's postgres service uses (db-reset's local-safe target).
const DBNAME = "ih35_verify"; // the exact db name CI uses.
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
  cands.push("/opt/homebrew/bin", "/usr/local/bin");
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

/** Create → return { dataDir, stop() }. Throws on failure. */
function startEphemeralPg(pgBin) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vlci-pgdata-"));
  const logFile = path.join(dataDir, "server.log");
  const init = run(pgBin, "initdb", ["-D", dataDir, "-U", PGUSER, "-A", "trust", "--no-sync", "-E", "UTF8"]);
  if (init.status !== 0) {
    fs.rmSync(dataDir, { recursive: true, force: true });
    throw new Error(`initdb failed:\n${init.stderr || init.stdout}`);
  }
  // listen on localhost only, on the CI port; socket in the data dir.
  const start = run(pgBin, "pg_ctl", [
    "-D", dataDir,
    "-o", `-p ${PORT} -c listen_addresses=localhost -k ${dataDir}`,
    "-l", logFile, "-w", "-t", "30", "start",
  ]);
  if (start.status !== 0) {
    const log = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").slice(-600) : "";
    fs.rmSync(dataDir, { recursive: true, force: true });
    throw new Error(`pg_ctl start failed (is port ${PORT} already in use?):\n${start.stderr}\n${log}`);
  }
  const createdb = run(pgBin, "createdb", ["-h", "localhost", "-p", String(PORT), "-U", PGUSER, DBNAME]);
  if (createdb.status !== 0) {
    run(pgBin, "pg_ctl", ["-D", dataDir, "-w", "-m", "immediate", "stop"]);
    fs.rmSync(dataDir, { recursive: true, force: true });
    throw new Error(`createdb ${DBNAME} failed:\n${createdb.stderr}`);
  }
  return {
    dataDir,
    stop() {
      run(pgBin, "pg_ctl", ["-D", dataDir, "-w", "-m", "immediate", "stop"]);
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

function selftest(pgBin) {
  process.stdout.write(`──▶ selftest: init → start → createdb → query → stop an ephemeral ${PORT} cluster\n`);
  const pg = startEphemeralPg(pgBin);
  let ok = false;
  try {
    const q = run(pgBin, "psql", ["-h", "localhost", "-p", String(PORT), "-U", PGUSER, "-d", DBNAME, "-tAc",
      "select current_database()||'@'||inet_server_port()"]);
    ok = q.status === 0 && q.stdout.trim() === `${DBNAME}@${PORT}`;
    console.log(`${ok ? "ok  " : "FAIL"}  ephemeral cluster reachable at localhost:${PORT}/${DBNAME}  (${(q.stdout || q.stderr).trim()})`);
  } finally {
    pg.stop();
  }
  if (!ok) { console.error(`\n${LABEL} SELFTEST FAILED`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS — ephemeral-cluster orchestration works.`);
}

function main() {
  const pgBin = findPgBin();
  if (!pgBin) {
    console.error(`[${LABEL}] FAILED — no local Postgres server binary found.`);
    console.error(`  Install Postgres.app (https://postgresapp.com) or 'brew install postgresql@16'.`);
    console.error(`  verify:local-ci needs one to spin up an ephemeral CI-shaped DB and run the real build-typecheck.`);
    process.exit(1);
  }
  if (process.argv.includes("--selftest")) { selftest(pgBin); return; }

  console.log(`[${LABEL}] postgres toolchain: ${pgBin}`);
  const pg = startEphemeralPg(pgBin);
  const url = `postgresql://${PGUSER}@localhost:${PORT}/${DBNAME}?sslmode=disable`;
  console.log(`[${LABEL}] ephemeral CI-shaped DB up at ${url}`);
  console.log(`[${LABEL}] running the exact CI command — npm run verify:pre-commit`);
  console.log(`[${LABEL}] (full build-typecheck: db-reset → migrate → build → tsc → ~250 guards → db.tests; ~6-10 min)\n`);
  let status = 1;
  try {
    const res = spawnSync("npm", ["run", "verify:pre-commit"], {
      cwd: ROOT,
      stdio: "inherit",
      // Pin BOTH connection vars to the ephemeral local cluster, and set GITHUB_ACTIONS=true so the
      // backend `.db.test.ts` suite actually RUNS (it is gated `describe.skipIf(GITHUB_ACTIONS!=="true")`;
      // without this the db.tests silently skip locally and a broken one — e.g. a flag-gated projection —
      // only fails in CI *after* push. This is exactly the leak that kept PRs going red post-push).
      //
      // PROD-SAFE by construction, and safer than the old blank DIRECT_URL: DATABASE_DIRECT_URL is set to
      // the ephemeral LOCAL url (a truthy value), so dotenv.config() — which only fills vars it sees as
      // UNSET, and treats "" as unset — can NEVER reload the prod Neon DIRECT_URL over it. The db.tests
      // therefore connect to the throwaway localhost:PORT/ih35_verify cluster (created above, torn down on
      // exit), never prod. verify:pre-commit's db-reset anti-prod guard still pins the same target.
      env: {
        ...process.env,
        // pg toolchain on PATH so any psql/pg_dump inside the guard suite resolves.
        PATH: `${pgBin}:${process.env.PATH}`,
        DATABASE_URL: url, DATABASE_DIRECT_URL: url, PGHOST: "localhost", PGPORT: String(PORT), PGUSER,
        CI_MIGRATION_TEST: "1", GITHUB_ACTIONS: "true",
      },
    });
    status = res.status ?? 1;
  } finally {
    pg.stop();
  }
  if (status !== 0) {
    console.error(`\n[${LABEL}] FAILED — build-typecheck reproduced RED locally (exit ${status}). Fix it here; this is exactly what CI would report. Do NOT push.`);
    process.exit(status);
  }
  console.log(`\n[${LABEL}] OK — full build-typecheck reproduced GREEN locally (verify:pre-commit). Safe to push.`);
  process.exit(0);
}

main();
