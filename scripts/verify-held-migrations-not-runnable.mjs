#!/usr/bin/env node
// verify-held-migrations-not-runnable.mjs
// Financial-safety guard (2026-07-12). Companion to verify-hold-migrations-registered.mjs.
//
// That guard proves the held REGISTRY is internally consistent (every marked file is
// registered and still carries its marker). It does NOT prove the registry has any effect
// at RUNTIME. The 2026-07-12 incident showed exactly that gap: #2396's "DO NOT RUN ON
// PROD" migration executed on prod because the deploy runner (scripts/db-migrate.mjs)
// never consulted the registry — it applied every pending on-disk migration in order.
//
// This guard proves the fix is present and cannot silently regress:
//   (1) the pure runtime decision `shouldSkipHeldOnProd` behaves correctly (behavior fixtures);
//   (2) `.held-migrations.json` parses, is non-empty, and every registered file exists;
//   (3) the runner db-migrate.mjs actually IMPORTS and CALLS the control in its apply loop,
//       gated on the prod-target signal — so a held migration genuinely cannot run on prod.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadHeldSet, shouldSkipHeldOnProd } from "./lib/held-migrations.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-held-migrations-not-runnable";
const MIG_DIR = path.join(ROOT, "db/migrations");
const RUNNER = path.join(ROOT, "scripts/db-migrate.mjs");

// ---- (1) behavior fixtures for the pure decision ----
function selfTest() {
  const heldSet = new Set(["202607280000_held.sql"]);
  const cases = [
    { name: "held + prod + no ceremony -> SKIP", in: { file: "202607280000_held.sql", heldSet, isProd: true, allowHeldProdMigrate: false }, want: true },
    { name: "held + prod + ceremony flag -> apply", in: { file: "202607280000_held.sql", heldSet, isProd: true, allowHeldProdMigrate: true }, want: false },
    { name: "held + NOT prod (CI/local/branch) -> apply", in: { file: "202607280000_held.sql", heldSet, isProd: false, allowHeldProdMigrate: false }, want: false },
    { name: "NOT held + prod -> apply", in: { file: "0001_baseline.sql", heldSet, isProd: true, allowHeldProdMigrate: false }, want: false },
    { name: "NOT held + NOT prod -> apply", in: { file: "0001_baseline.sql", heldSet, isProd: false, allowHeldProdMigrate: false }, want: false },
  ];
  let failed = 0;
  for (const c of cases) {
    const got = shouldSkipHeldOnProd(c.in);
    const ok = got === c.want;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}  (got ${got}, want ${c.want})`);
  }
  if (failed) { console.error(`\nself-test FAILED: ${failed}/${cases.length}`); process.exit(1); }
  console.log(`self-test PASS: ${cases.length}/${cases.length}`);
}

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  selfTest();
  process.exit(0);
}

const errs = [];

// ---- (2) registry parses, non-empty, every file exists ----
let heldSet;
try {
  heldSet = loadHeldSet(MIG_DIR);
} catch (e) {
  console.error(`[${LABEL}] FAILED — cannot load .held-migrations.json: ${e.message}`);
  process.exit(1);
}
if (heldSet.size === 0) errs.push(".held-migrations.json has zero held entries (expected the held registry to be populated)");
for (const f of heldSet) {
  if (!fs.existsSync(path.join(MIG_DIR, f))) errs.push(`registered held migration missing on disk: ${f}`);
}

// ---- (3) the runner wires the control ----
let runnerSrc = "";
try {
  runnerSrc = fs.readFileSync(RUNNER, "utf8");
} catch (e) {
  console.error(`[${LABEL}] FAILED — cannot read runner ${path.relative(ROOT, RUNNER)}: ${e.message}`);
  process.exit(1);
}
// imports the control from the shared lib
if (!/import\s*\{[^}]*\bshouldSkipHeldOnProd\b[^}]*\}\s*from\s*["'][^"']*held-migrations\.mjs["']/.test(runnerSrc)) {
  errs.push("db-migrate.mjs does not import shouldSkipHeldOnProd from ./lib/held-migrations.mjs — the held control is not wired");
}
if (!/\bloadHeldSet\b/.test(runnerSrc)) {
  errs.push("db-migrate.mjs does not load the held registry (loadHeldSet) — the control has no data to act on");
}
// actually calls the control, gated on the prod-target signal, in the apply path
const callMatch = /shouldSkipHeldOnProd\s*\(\s*\{[\s\S]{0,240}?\}\s*\)/.exec(runnerSrc);
if (!callMatch) {
  errs.push("db-migrate.mjs never CALLS shouldSkipHeldOnProd(...) — a held migration would still execute on prod");
} else if (!/isProd\s*:\s*TARGET_IS_PROD/.test(callMatch[0])) {
  errs.push("shouldSkipHeldOnProd(...) call is not gated on TARGET_IS_PROD — the prod-target signal must drive the skip");
}
// the skip path must NOT ledger the migration (it stays honestly pending on prod)
if (callMatch && !/if\s*\(\s*shouldSkipHeldOnProd[\s\S]{0,900}?continue;/.test(runnerSrc)) {
  errs.push("the shouldSkipHeldOnProd branch does not `continue` (skip) — a held migration must be skipped, not applied/ledgered");
}

if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — ${heldSet.size} held migrations; runner enforces the hold on prod at execution time.`);
