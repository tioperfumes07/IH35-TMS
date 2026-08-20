#!/usr/bin/env node
/**
 * ACCT-F5677 — extends LV-MONEY-TABLES-HAVE-NO-AUDIT-TRIGGER to the `factoring` schema. The prior
 * class measurements (commit 83cec4b45, migration 202612770000) scoped only
 * accounting/banking/driver_finance; `factoring` was never checked and carried zero audit
 * triggers (live-measured 2026-08-21: 6/6 base tables).
 *
 * STATIC, on purpose (mirrors verify-worm-coverage-ratchet.mjs's own stated trade): reads the
 * migration file, asserts it attaches `audit.tg_audit_row()` to all 6 named tables via the
 * idempotent NOT-EXISTS-guarded form (never an unconditional CREATE TRIGGER, which would fail on
 * replay). Live coverage was independently confirmed via Neon-branch rehearsal before this PR
 * (0 missing after apply, idempotent re-apply also 0 missing) — this guard is the repo-side
 * ratchet that keeps the migration's own coverage from silently regressing if the file is edited.
 *
 * Run:  node scripts/verify-factoring-audit-trigger-coverage-migration.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-audit-trigger-coverage-migration";
const FILE = "db/migrations/202612840000_acct_f5677_factoring_audit_trigger_coverage.sql";

const TABLES = [
  "bank_match_suggestion",
  "batch",
  "canonical_factor_agreements",
  "customer_factor_assignment",
  "factor",
  "letter_of_release",
];

export function analyze(src) {
  const failures = [];
  const code = src.replace(/--[^\n]*/g, "");

  if (!/tg_audit_row\(\)/.test(code)) {
    failures.push(`${FILE}: must attach audit.tg_audit_row() — no new audit logic, reuse only.`);
  }
  if (!/NOT EXISTS[\s\S]{0,300}?p\.proname = 'tg_audit_row'/.test(code)) {
    failures.push(`${FILE}: the attach must be idempotency-guarded (NOT EXISTS against pg_trigger/pg_proc) — an unconditional CREATE TRIGGER fails on replay.`);
  }
  for (const t of TABLES) {
    if (!new RegExp(`'factoring',\\s*'${t}'`).test(code)) {
      failures.push(`${FILE}: missing '${t}' in the VALUES list — all 6 live-measured factoring tables must be covered.`);
    }
  }
  if (!/BEGIN;[\s\S]*COMMIT;/.test(code)) {
    failures.push(`${FILE}: must be wrapped in an explicit transaction.`);
  }
  return failures;
}

export function run() {
  return analyze(fs.readFileSync(path.join(ROOT, FILE), "utf8"));
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(path.join(ROOT, FILE), "utf8");
  const good = analyze(real);
  if (good.length) throw new Error(`[${LABEL}] selftest: the REAL file should PASS but failed: ${good.join("; ")}`);

  const m1 = real.replace("('factoring', 'batch'),\n", "");
  if (!analyze(m1).some((f) => f.includes("missing 'batch'"))) {
    throw new Error(`[${LABEL}] selftest: dropped table should FAIL but passed`);
  }

  const m2 = real.replace(/AND NOT EXISTS \(\s*SELECT 1\s*FROM pg_trigger t[\s\S]*?AND p\.proname = 'tg_audit_row' AND NOT t\.tgisinternal\s*\)/, "");
  if (!analyze(m2).some((f) => f.includes("idempotency-guarded"))) {
    throw new Error(`[${LABEL}] selftest: removed idempotency guard should FAIL but passed`);
  }

  console.log(`[${LABEL}] selftest: PASS — real green; dropped-table and removed-idempotency mutations both red`);
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — factoring audit-trigger migration covers all 6 tables, idempotently, reusing tg_audit_row()`);
