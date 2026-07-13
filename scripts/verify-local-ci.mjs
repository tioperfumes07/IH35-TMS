#!/usr/bin/env node
/**
 * verify:local-ci — reproduce CI's `build-typecheck` LOCALLY before pushing, so a PR never lands red.
 *
 * build-typecheck fails on four classes, none of which `verify:static` (no-DB) can catch:
 *   1. a migration that errors on a fresh DB (e.g. a CREATE-collision → `column "x" does not exist`),
 *   2. a backend/frontend TypeScript error,
 *   3. a static guard trip (verify:arch-design chain),
 *   4. a *.db.test.ts failure.
 * This runner does exactly what build-typecheck does — db-migrate → backend build → frontend tsc →
 * verify:arch-design (→ optional db tests) — against a FRESH LOCAL Postgres, and stops on the first failure
 * printing it. Run it before every push.
 *
 * ★ Prod safety: it REFUSES to run unless the resolved connection is a local host AND the db name marks it a
 * throwaway (`ci-migration-test`). It pins DATABASE_URL to that local db and blanks DATABASE_DIRECT_URL so the
 * db:migrate-hits-prod landmine (dotenv reloading a prod DATABASE_DIRECT_URL) cannot fire. It never touches prod.
 *
 * Usage:  node scripts/verify-local-ci.mjs [--tests] [--db postgresql://user@127.0.0.1:5432/ci-migration-test]
 *   --tests   also run the backend db test suite (slower; catches class 4).
 *   --selftest  self-check the safety gate (no DB needed).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-local-ci";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const SAFE_DB_MARKER = "ci-migration-test";

/** Assert a connection string is a safe, local, throwaway target. Returns {host, database} or throws. */
export function assertLocalSafe(url) {
  let u;
  try { u = new URL(url); } catch { throw new Error(`invalid DATABASE_URL: ${url}`); }
  const host = u.hostname;
  const database = decodeURIComponent(u.pathname.replace(/^\//, ""));
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`refusing to run: host '${host}' is not local (${[...LOCAL_HOSTS].join("/")}). This tool never touches a remote/prod DB.`);
  }
  if (!database.includes(SAFE_DB_MARKER)) {
    throw new Error(`refusing to run: db '${database}' must contain '${SAFE_DB_MARKER}' (a throwaway marker) so a real DB can never be reset.`);
  }
  return { host, database };
}

function step(name, cmd, args, extraEnv, cwd = ROOT) {
  process.stdout.write(`\n──▶ ${name}\n`);
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...extraEnv },
    shell: false,
  });
  if (res.status !== 0) {
    console.error(`\n[${LABEL}] FAILED at step: ${name} (exit ${res.status ?? "signal " + res.signal})`);
    console.error(`[${LABEL}] fix this locally, then re-run — this is exactly what CI build-typecheck would report.`);
    process.exit(1);
  }
}

async function resetDb(adminUrl, database) {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const who = await client.query("select current_database() as db, coalesce(host(inet_server_addr()),'local') as srv");
    process.stdout.write(`──▶ reset: dropping+creating ${database} on ${who.rows[0].srv}\n`);
    await client.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${database}"`);
  } finally {
    await client.end();
  }
}

function selftest() {
  const cases = [
    ["local + marker ok", "postgresql://u@127.0.0.1:5432/ci-migration-test", true],
    ["localhost ok", "postgresql://u@localhost:5432/ci-migration-test", true],
    ["remote host rejected", "postgresql://u@ep-cool.neon.tech:5432/ci-migration-test", false],
    ["local but no marker rejected", "postgresql://u@127.0.0.1:5432/neondb", false],
  ];
  let bad = 0;
  for (const [n, url, ok] of cases) {
    let got = true;
    try { assertLocalSafe(url); } catch { got = false; }
    const pass = got === ok;
    if (!pass) bad++;
    console.log(`${pass ? "ok  " : "FAIL"}  ${n}`);
  }
  if (bad) { console.error(`\n${LABEL} SELFTEST FAILED: ${bad}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

async function main() {
  if (process.argv.includes("--selftest")) { selftest(); return; }

  const dbArgIdx = process.argv.indexOf("--db");
  const user = process.env.USER || "postgres";
  const dbUrl = dbArgIdx >= 0
    ? process.argv[dbArgIdx + 1]
    : `postgresql://${user}@127.0.0.1:5432/${SAFE_DB_MARKER}?sslmode=disable`;
  const runTests = process.argv.includes("--tests");

  const { host, database } = assertLocalSafe(dbUrl);
  const adminUrl = dbUrl.replace(`/${database}`, "/postgres");
  console.log(`[${LABEL}] local target: host=${host} db=${database}  (prod is unreachable by design)`);

  await resetDb(adminUrl, database);

  // Pin the connection local for every child; blank DATABASE_DIRECT_URL so dotenv can't reload a prod URL.
  const pinned = { DATABASE_URL: dbUrl, DATABASE_DIRECT_URL: "", PGCONNECT_TIMEOUT: "5" };

  // The failure classes that actually redden build-typecheck: migration-on-fresh-DB, backend TS, frontend
  // TS, schema-parity drift (verify-steps/68 — a migration adding a column MUST rebaseline it), and the
  // static-guard suite. --tests adds the *.db.test.ts class. (build-typecheck runs these via verify:pre-commit;
  // we run them directly so no localhost:54329/ih35_verify db-reset convention is required.)
  step("db:migrate (fresh-DB migration chain)", "npm", ["run", "db:migrate"], pinned);
  step("build:backend (tsc + emit)", "npm", ["run", "build:backend"], pinned);
  step("frontend tsc", "npx", ["tsc", "-b", "--pretty", "false"], pinned, path.join(ROOT, "apps/frontend"));
  step("verify:schema-parity (baseline drift — rebaseline after any migration adds a column)", "npm", ["run", "verify:schema-parity"], pinned);
  step("verify:arch-design (static guard suite)", "npm", ["run", "verify:arch-design"], pinned);
  if (runTests) step("backend db tests", "npm", ["run", "test:coverage"], pinned);

  console.log(`\n[${LABEL}] OK — build-typecheck failure classes reproduced GREEN locally${runTests ? " (incl. tests)" : " (add --tests for db.test coverage)"}. Safe to push.`);
}

main().catch((err) => { console.error(`[${LABEL}] ERROR: ${err.message}`); process.exit(1); });
