#!/usr/bin/env node
/**
 * LEAD 443.268-A item 7 + 443.278 (3) — PERMANENT: no parameter-free GET route may answer 5xx against prod data.
 * The Lead's 12:55 UTC sweep (696 routes, Owner, USMCA) found 13 live 500s the static guards could not see
 * (columns that do not exist, text = uuid, an alias inside ORDER BY, comma + JOIN, one bad polygon failing a list).
 *
 * 443.278 (3): the live arm runs the REAL backend IN-PROCESS through fastify.inject (apps/backend/src/lib/inject-get-sweep.ts,
 * booted by index.ts with IH35_INJECT_GET_SWEEP=1): every GET route the app actually registers is injected with
 * ?operating_company_id=USMCA as the System Automation service principal, against the prod READ-ONLY database URL
 * (DATABASE_URL / the gate's read-only credential). No HTTP session cookie, no network hop, nothing written; the process
 * exits before listen() and before any cron/worker starts.
 *
 * Classification (honest — what a read-only, local in-process run can and cannot judge):
 *   FAIL       any other 5xx: the SQL / code error class prod users hit (column does not exist, text = uuid, …);
 *   env        the local runtime lacks a prod secret / binary (OAuth, service token, Samsara token, PDF renderer, QBO auth,
 *              healthz of a dev build) — reported, cannot be judged here;
 *   write      "cannot execute INSERT/UPDATE/DELETE in a read-only transaction" — a GET that WRITES; it answers 200 on prod,
 *              so it is listed (GET should not write) but not failed by a no-5xx guard;
 *   slow       no answer in 20 s (or a stream) — listed;
 *   4xx        reported, not failed (validation is CC-2's 443.268-B).
 * Static arm (every push): index.ts installs the route collector before any route and runs the sweep before listen().
 * --selftest plants a route that throws a SQL error and requires a FAIL, plus each classification.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ALLOW_OFFLINE_SKIP =
  "static arm (index.ts sweep wiring) always runs; the live in-process sweep needs the gate's read-only DB credential and says LIVE NOT RUN without it";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-live-get-routes-no-5xx";
const INDEX = "apps/backend/src/index.ts";
const SWEEP = "apps/backend/src/lib/inject-get-sweep.ts";

const ENV_RE = /_not_configured|samsara_token_unavailable|statement_export_failed|QBO not authorized|"version":"dev"|provider_unavailable/;
const WRITE_RE = /cannot execute (INSERT|UPDATE|DELETE)[^"]* in a read-only transaction/;

/** Pure: split the sweep's 5xx rows into the FAIL class and the reported classes. */
export function classify(fivexx) {
  const out = { fail: [], env: [], write: [], slow: [] };
  for (const r of fivexx) {
    if (r.status === 0 || /\/stream$/.test(r.route)) out.slow.push(r);
    else if (WRITE_RE.test(r.error)) out.write.push(r);
    else if (ENV_RE.test(r.error) || r.route.startsWith("/api/v1/healthz")) out.env.push(r);
    else out.fail.push(r);
  }
  return out;
}

export function staticFailures(index, sweep) {
  const f = [];
  const collect = index.indexOf("if (injectGetSweepEnabled()) collectGetRoutes(app);");
  const firstRoute = index.indexOf("await registerHealthRoutes(app);");
  if (collect < 0 || (firstRoute >= 0 && collect > firstRoute)) f.push("index.ts must install the GET route collector before any route registers");
  const run = index.indexOf("if (injectGetSweepEnabled()) await runInjectGetSweepAndExit(app);");
  const listen = index.indexOf("await app.listen(");
  if (run < 0 || (listen >= 0 && run > listen)) f.push("index.ts must run the inject sweep (and exit) before listen() and any worker");
  if (!/app\.inject\(\{ method: "GET"/.test(sweep)) f.push("the sweep does not call routes through fastify.inject");
  if (!/"x-test-auth": auth/.test(sweep) || !/00000000-0000-4000-8000-000000000001/.test(sweep)) f.push("the sweep does not run as the System Automation service principal");
  return f;
}

function liveSweep() {
  const url = process.env.DATABASE_URL || process.env.IH35_GATE_READONLY_DB_URL;
  if (!url) return null;
  const out = path.join(os.tmpdir(), `ih35-inject-sweep-${process.pid}.json`);
  const tsx = path.join(ROOT, "node_modules/.bin/tsx");
  const r = spawnSync(tsx, [path.join(ROOT, INDEX)], {
    cwd: path.join(ROOT, "apps/backend"),
    env: {
      ...process.env,
      DATABASE_URL: url,
      PGOPTIONS: "-c default_transaction_read_only=on",
      NODE_ENV: "test",
      IH35_TEST_AUTH_BYPASS: "1",
      IH35_INJECT_GET_SWEEP: "1",
      IH35_INJECT_GET_SWEEP_OUT: out,
      IH35_BOOT_API_SMOKE: "true",
    },
    stdio: ["ignore", "ignore", "pipe"],
    timeout: 15 * 60_000,
  });
  if (!fs.existsSync(out)) {
    return { error: `in-process sweep produced no result (exit ${r.status}${r.error ? `, ${r.error.message}` : ""}): ${String(r.stderr ?? "").slice(-400)}` };
  }
  const res = JSON.parse(fs.readFileSync(out, "utf8"));
  fs.rmSync(out, { force: true });
  return res;
}

function selftest() {
  const rows = [
    { route: "/api/v1/throws", status: 500, error: 'column "x" does not exist' },
    { route: "/api/v1/uuid", status: 500, error: "operator does not exist: text = uuid" },
    { route: "/api/v1/writes", status: 500, error: "cannot execute INSERT in a read-only transaction" },
    { route: "/api/v1/auth/google/login", status: 503, error: "google_oauth_not_configured" },
    { route: "/api/v1/slow", status: 0, error: "timeout 20000ms" },
    { route: "/api/v1/notifications/stream", status: 0, error: "timeout 20000ms" },
  ];
  const c = classify(rows);
  const index = fs.readFileSync(path.join(ROOT, INDEX), "utf8");
  const sweep = fs.readFileSync(path.join(ROOT, SWEEP), "utf8");
  const checks = [
    ["a route that throws a SQL error (500) FAILS", c.fail.some((r) => r.route === "/api/v1/throws")],
    ["text = uuid (the Lead's sweep class) FAILS", c.fail.some((r) => r.route === "/api/v1/uuid")],
    ["a GET that writes is listed, not failed", c.write.length === 1 && !c.fail.some((r) => r.route === "/api/v1/writes")],
    ["a missing local secret is env, not failed", c.env.length === 1],
    ["timeouts / streams are slow, not failed", c.slow.length === 2],
    ["clean wiring passes", staticFailures(index, sweep).length === 0],
    ["sweep after listen() FAILS", staticFailures(index.replace("if (injectGetSweepEnabled()) await runInjectGetSweepAndExit(app);", "") + "\nif (injectGetSweepEnabled()) await runInjectGetSweepAndExit(app);", sweep).length > 0],
    ["sweep over HTTP instead of inject FAILS", staticFailures(index, sweep.replace('app.inject({ method: "GET"', 'fetch({ method: "GET"')).length > 0],
  ];
  let bad = 0;
  for (const [n, ok] of checks) {
    console.log(`  ${ok ? "✓" : "✗"} ${n}`);
    if (!ok) bad += 1;
  }
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${checks.length}/${checks.length})`);
  process.exit(bad ? 1 : 0);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const failures = staticFailures(fs.readFileSync(path.join(ROOT, INDEX), "utf8"), fs.readFileSync(path.join(ROOT, SWEEP), "utf8"));
  const res = liveSweep();
  if (res === null) {
    console.log(`${LABEL}: LIVE arm NOT RUN (no DATABASE_URL / gate read-only credential) — static wiring checks only`);
  } else if (res.error) {
    failures.push(res.error);
  } else {
    const c = classify(res.fivexx);
    for (const x of c.fail) failures.push(`${x.status} ${x.route} — ${x.error}`);
    const list = (name, rows) => rows.length && console.log(`  ${name} (${rows.length}, reported): ${rows.map((r) => r.route).join(", ")}`);
    console.log(`${LABEL}: ${res.routes} GET routes injected in-process (read-only prod): ${res.ok} 2xx/3xx, ${res.fourxx} 4xx, ${res.fivexx.length} 5xx/timeout`);
    list("write-on-read", c.write);
    list("env (local runtime lacks a prod secret)", c.env);
    list("slow/stream", c.slow);
  }
  if (failures.length) {
    console.error(`${LABEL}: FAIL — ${failures.length}`);
    for (const x of failures) console.error(`  ✗ ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — no GET route answers a 5xx of the code/SQL class`);
}

main();
