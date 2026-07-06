#!/usr/bin/env node
/**
 * verify-spine-emit-placeholder-casts.mjs
 *
 * Regression guard for the "placeholder-cast collision" bug (2026-07,
 * audit-spine-emit-silent-failures): dispatch-spine-emit.ts, banking-spine-emit.ts, and
 * maintenance-spine-emit.ts each reused ONE SQL placeholder number (e.g. `$4`) across two
 * incompatible contexts in the same `events.log_event(...)` call — once bare (bound to a `text`
 * function argument) and once with an explicit `::uuid` cast (bound to a `uuid` function argument).
 * Postgres's extended query protocol requires a single parameter number to resolve to ONE consistent
 * type across all of its appearances in a statement — mixing a bare and a cast use of the same `$N`
 * fails EVERY call with "inconsistent types deduced for parameter $N", unconditionally.
 *
 * accounting-spine-emit.ts and driver-request-spine-emit.ts already avoid this (each duplicates the
 * value at a second, distinct placeholder number instead of reusing one) — this script asserts ALL
 * FIVE spine-emit files follow that pattern, so the collision can't be silently reintroduced by a
 * future edit to any of them.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { console.error(`FAIL: missing file: ${rel}`); process.exit(1); }
  return fs.readFileSync(abs, "utf8");
}

let failed = false;
function fail(msg) { console.error(`[verify-spine-emit-placeholder-casts] FAIL: ${msg}`); failed = true; }
function pass(msg) { console.log(`[verify-spine-emit-placeholder-casts] PASS: ${msg}`); }

const FILES = [
  "apps/backend/src/accounting/accounting-spine-emit.ts",
  "apps/backend/src/banking/banking-spine-emit.ts",
  "apps/backend/src/maintenance/maintenance-spine-emit.ts",
  "apps/backend/src/dispatch/dispatch-spine-emit.ts",
  "apps/backend/src/driver-finance/driver-request-spine-emit.ts",
];

// Matches `$N` optionally followed by an explicit Postgres cast, e.g. `$5` or `$5::uuid`.
const PLACEHOLDER_RE = /\$(\d+)(::[a-zA-Z_]+)?/g;

function checkFile(rel) {
  const src = read(rel);
  const shortName = path.basename(rel);

  // Isolate the SQL template literal that invokes events.log_event(...) — the backtick string
  // starting at "SELECT events.log_event(" up to the closing backtick.
  const templateMatch = src.match(/`\s*SELECT\s+events\.log_event\([\s\S]*?\)\s*`/);
  if (!templateMatch) {
    fail(`${shortName}: could not locate a "SELECT events.log_event(...)" template literal`);
    return;
  }
  const sql = templateMatch[0];

  // Group every $N occurrence by its cast suffix ("" for bare, "::uuid" etc. for cast).
  const castsByNumber = new Map();
  for (const m of sql.matchAll(PLACEHOLDER_RE)) {
    const num = m[1];
    const cast = m[2] ?? "";
    if (!castsByNumber.has(num)) castsByNumber.set(num, new Set());
    castsByNumber.get(num).add(cast);
  }

  if (castsByNumber.size === 0) {
    fail(`${shortName}: found no $N placeholders inside the events.log_event(...) call`);
    return;
  }

  let fileOk = true;
  for (const [num, casts] of castsByNumber) {
    if (casts.size > 1) {
      fail(`${shortName}: placeholder $${num} is reused across incompatible cast contexts (${[...casts].map((c) => c || "<bare>").join(", ")}) — Postgres will reject every call with "inconsistent types deduced for parameter $${num}"`);
      fileOk = false;
    }
  }
  if (fileOk) pass(`${shortName}: every $N placeholder has a single, consistent cast context`);
}

for (const rel of FILES) checkFile(rel);

if (failed) { console.error("\n[verify-spine-emit-placeholder-casts] FAILED"); process.exit(1); }
console.log("\n[verify-spine-emit-placeholder-casts] ALL CHECKS PASSED");
