#!/usr/bin/env node
// verify-held-migrations-not-runnable.mjs
// Financial-safety guard (2026-07-12). Companion to verify-hold-migrations-registered.mjs.
//
// That guard proves marker↔registry PARITY (a held migration keeps its "DO NOT RUN ON PROD"
// marker and stays registered). It does NOT prove the registry actually BLOCKS execution — and
// for a long time it didn't: nothing in the migration runner consulted .held-migrations.json, so a
// held migration merged to main FIRED on the next prod deploy (this is how #2396's
// 202607280000_relay_deposit_classifier.sql created integrations.relay_deposits +
// relay_company_cards on prod).
//
// This guard proves the RUNTIME BLOCK is present and wired, so it cannot silently regress:
//   (1) db/migrations/.held-migrations.json exists, lists >=1 held migration, all present on disk.
//   (2) scripts/db-migrate.mjs LOADS the registry and, when running against prod, records the held
//       migration in the ledger WITHOUT executing its DDL (a hold-skip branch that does NOT call
//       applyMigration).
//   (3) render.yaml's preDeploy runs `npm run db:migrate`, so the guarded runner IS the deploy path.
//
// Run with --selftest to prove the guard actually catches a runner that lost the block.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-held-migrations-not-runnable";
const MIG_DIR = path.join(ROOT, "db/migrations");
const REG_PATH = path.join(MIG_DIR, ".held-migrations.json");
const RUNNER_PATH = path.join(ROOT, "scripts/db-migrate.mjs");
const RENDER_PATH = path.join(ROOT, "render.yaml");

/**
 * Static analysis of the migration runner source. Returns an array of error strings (empty = OK).
 * Kept pure so --selftest can exercise it against synthetic sources.
 * @param {string} src - contents of scripts/db-migrate.mjs
 * @returns {string[]}
 */
export function checkRunnerSource(src) {
  const errs = [];
  // (a) it must load the held registry.
  if (!/\.held-migrations\.json/.test(src)) {
    errs.push("db-migrate.mjs does not reference .held-migrations.json (the held registry is not loaded)");
  }
  const loadsRegistry = /loadHeldMigrations\s*\(/.test(src) || /held(Migrations|Set)\b/.test(src);
  if (!loadsRegistry) {
    errs.push("db-migrate.mjs does not build a held-migrations set (no loadHeldMigrations()/heldMigrations use)");
  }
  // (b) it must gate execution on a prod signal.
  if (!/RUNNING_AGAINST_PROD|TARGET_IS_PROD/.test(src)) {
    errs.push("db-migrate.mjs has no prod-target gate (RUNNING_AGAINST_PROD / TARGET_IS_PROD) for held migrations");
  }
  // (c) it must have a hold-skip branch that records WITHOUT executing DDL.
  const hasHoldSkipBranch =
    /heldMigrations\.has\([^)]*\)\s*&&\s*RUNNING_AGAINST_PROD/.test(src) ||
    /RUNNING_AGAINST_PROD\s*&&\s*heldMigrations\.has\(/.test(src);
  if (!hasHoldSkipBranch) {
    errs.push("db-migrate.mjs has no `heldMigrations.has(file) && RUNNING_AGAINST_PROD` skip branch");
  }
  if (!/recordHeldSkip\s*\(/.test(src)) {
    errs.push("db-migrate.mjs never calls recordHeldSkip() (a held migration on prod would not be ledger-recorded → app boot drift-guard crash)");
  }
  if (!/HOLD-SKIP/.test(src)) {
    errs.push("db-migrate.mjs emits no HOLD-SKIP log line (the skip is not observable in deploy logs)");
  }
  // (d) recordHeldSkip must NOT execute the migration SQL. Extract its body and ensure it does not
  // run the migration `sql` or call applyMigration.
  const fnIdx = src.indexOf("async function recordHeldSkip");
  if (fnIdx >= 0) {
    const body = src.slice(fnIdx, fnIdx + 900);
    if (/applyMigration\s*\(/.test(body) || /client\.query\(\s*sql\b/.test(body)) {
      errs.push("recordHeldSkip() appears to execute migration DDL — it must ONLY write ledger rows");
    }
  }
  return errs;
}

function checkRegistry() {
  const errs = [];
  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(REG_PATH, "utf8"));
  } catch {
    return [`missing/invalid ${path.relative(ROOT, REG_PATH)}`];
  }
  const held = (registry.held || []).map((h) => h.file).filter(Boolean);
  if (held.length < 1) errs.push(".held-migrations.json lists no held migrations (registry is empty)");
  for (const f of held) {
    if (!fs.existsSync(path.join(MIG_DIR, f))) errs.push(`registered held migration missing on disk: ${f}`);
  }
  return errs;
}

function checkRender() {
  const errs = [];
  if (!fs.existsSync(RENDER_PATH)) return ["render.yaml not found — cannot confirm the deploy uses the guarded runner"];
  const render = fs.readFileSync(RENDER_PATH, "utf8");
  if (!/preDeployCommand:[^\n]*npm run db:migrate/.test(render)) {
    errs.push("render.yaml preDeployCommand does not run `npm run db:migrate` (the guarded runner is not the deploy path)");
  }
  return errs;
}

function runSelftest() {
  const good = fs.readFileSync(RUNNER_PATH, "utf8");
  const goodErrs = checkRunnerSource(good);
  if (goodErrs.length) {
    console.error(`[${LABEL}] SELFTEST FAILED — the real runner is flagged: ${goodErrs.join("; ")}`);
    process.exit(1);
  }
  // A runner that lost the hold-skip block must be caught.
  const bad = good
    .replace(/if \(heldMigrations\.has\(file\) && RUNNING_AGAINST_PROD\)[\s\S]*?continue;\s*\}/, "")
    .replace(/async function recordHeldSkip[\s\S]*?\n\}/, "");
  const badErrs = checkRunnerSource(bad);
  if (badErrs.length === 0) {
    console.error(`[${LABEL}] SELFTEST FAILED — a runner with the hold-skip block removed was NOT flagged`);
    process.exit(1);
  }
  console.log(`[${LABEL}] SELFTEST OK — real runner passes; a runner missing the block is caught (${badErrs.length} error(s)).`);
}

if (process.argv.includes("--selftest")) {
  runSelftest();
  process.exit(0);
}

const errs = [
  ...checkRegistry(),
  ...(fs.existsSync(RUNNER_PATH)
    ? checkRunnerSource(fs.readFileSync(RUNNER_PATH, "utf8"))
    : [`missing ${path.relative(ROOT, RUNNER_PATH)}`]),
  ...checkRender(),
];

if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — held registry present, runner blocks held migrations on prod (ledger-record, no DDL), deploy uses the guarded runner.`);
