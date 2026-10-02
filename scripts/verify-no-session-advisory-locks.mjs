#!/usr/bin/env node
/**
 * ROUND 330.7 (ROUND 332.1 §7/§8 — one generalized guard for the sweep). The backend runs behind pgbouncer TRANSACTION
 * pooling: a SESSION advisory lock (pg_advisory_lock / pg_try_advisory_lock, released by pg_advisory_unlock) stays on the
 * pooled server connection when the transaction that took it aborts — the finally-unlock cannot run on an aborted
 * transaction. Fork-proven (#24237): after a failed tick + ROLLBACK + disconnect the lock was still held. A try-lock then
 * skips every later tick; a blocking lock hangs the next caller. Fixed at three sites (geofence breach detector, layover
 * detector, vehicle-driver pairing). FAILS IF any non-test backend source calls a session advisory lock function.
 * Use pg_advisory_xact_lock / pg_try_advisory_xact_lock (lib/single-flight.ts) — Postgres releases them at commit/rollback.
 * Run: node scripts/verify-no-session-advisory-locks.mjs [--selftest]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const ROOT = "apps/backend/src";
const SESSION_LOCK = /\bpg_(?:try_)?advisory_lock(?:_shared)?\s*\(|\bpg_advisory_unlock(?:_shared|_all)?\s*\(/;

// Comments are stripped (line numbers kept) before matching — a comment that NAMES the forbidden call is not a call
// (ROUND 340: a guard reading raw text scores what is commented out).
export function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}
export function scan(files) {
  const hits = [];
  for (const [file, raw] of files) {
    stripComments(raw).split("\n").forEach((line, i) => { if (SESSION_LOCK.test(line)) hits.push(`${file}:${i + 1}: ${raw.split("\n")[i].trim().slice(0, 120)}`); });
  }
  return hits;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== "__tests__" && name !== "node_modules") walk(p, out); }
    else if (/\.(ts|mts|js|mjs)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const bad = [["a.ts", "await c.query(`SELECT pg_try_advisory_lock(hashtext($1))`)"], ["b.ts", "pg_advisory_unlock(1)"], ["c.ts", "pg_advisory_lock(42)"]];
  const good = [["d.ts", "SELECT pg_advisory_xact_lock(1); SELECT pg_try_advisory_xact_lock(2)"], ["e.ts", "// the old pg_advisory_lock(k) leaked\n/* pg_advisory_unlock(k) in a finally */ const x = 1;"]];
  if (scan(bad).length !== 3) { console.error("selftest FAIL: a session lock escaped"); process.exit(1); }
  if (scan(good).length !== 0) { console.error("selftest FAIL: a transaction lock was flagged"); process.exit(1); }
  console.log("verify-no-session-advisory-locks selftest 5/5");
}
const files = walk(ROOT).map((f) => [f, readFileSync(f, "utf8")]);
const hits = scan(files);
if (hits.length) { console.error(`verify-no-session-advisory-locks: FAIL — ${hits.length} session advisory lock call(s):\n  ${hits.join("\n  ")}`); process.exit(1); }
console.log(`verify-no-session-advisory-locks: OK — ${files.length} backend files, 0 session advisory locks`);
