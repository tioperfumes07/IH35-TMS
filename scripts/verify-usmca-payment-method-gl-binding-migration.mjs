#!/usr/bin/env node
/**
 * ACCT-F5678 — root-cause fix for LV-ESCROW-CONFIGURED-NEVER-ACCRUED: closeSettlementPayRun
 * refuses to disburse via a payment method with no gl_account_id (a deliberate fail-closed gate,
 * migration 202607380000's own header). Live-verified: 100% of active payment methods on every
 * entity had gl_account_id NULL, so no settlement has EVER reached status='closed' anywhere.
 *
 * Locked here (the migration file):
 *   1. scoped to USMCA ONLY (never TRANSP/TRK — TRANSP has 5 ambiguous accounts incl. a loan and
 *      a credit card; binding those without an owner call would mislabel real driver disbursements);
 *   2. idempotent — only sets gl_account_id WHERE currently NULL, never overwrites a later choice;
 *   3. binds to the literal Bank of America Operating (USMCA) account id, never the Relay Fuel
 *      Wallet (a named special-purpose account this codebase already excludes elsewhere).
 *
 * Run:  node scripts/verify-usmca-payment-method-gl-binding-migration.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-usmca-payment-method-gl-binding-migration";
const FILE = "db/migrations/202612850000_acct_f5678_usmca_payment_method_gl_binding.sql";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OPERATING_ACCOUNT_ID = "c7af1219-f6a6-4169-a2d8-8f556fb0c2f3";

export function analyze(src) {
  const failures = [];
  const code = src.replace(/--[^\n]*/g, "");

  if (!code.includes(`'${USMCA}'::uuid`)) {
    failures.push(`${FILE}: must scope the UPDATE to USMCA's operating_company_id literal.`);
  }
  if (/91e0bf0a-133f-4ce8-a734-2586cfa66d96|b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e/.test(code)) {
    failures.push(`${FILE}: must NOT reference TRANSP or TRK's operating_company_id — that binding is a genuine owner decision (5 ambiguous accounts), not this migration's scope.`);
  }
  if (!code.includes(`'${OPERATING_ACCOUNT_ID}'::uuid`)) {
    failures.push(`${FILE}: must bind to the literal USMCA Operating account id, not a re-derived lookup that could resolve to a different account later.`);
  }
  if (!/AND gl_account_id IS NULL/.test(code)) {
    failures.push(`${FILE}: the UPDATE must be idempotency-guarded (WHERE gl_account_id IS NULL) — an unconditional UPDATE would silently overwrite a later owner-set binding.`);
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

  const m1 = real.replace(`'${USMCA}'::uuid`, "'91e0bf0a-133f-4ce8-a734-2586cfa66d96'::uuid");
  if (!analyze(m1).some((f) => f.includes("must NOT reference TRANSP"))) {
    throw new Error(`[${LABEL}] selftest: TRANSP-scope mutation should FAIL but passed`);
  }

  const m2 = real.replace("AND gl_account_id IS NULL", "");
  if (!analyze(m2).some((f) => f.includes("idempotency-guarded"))) {
    throw new Error(`[${LABEL}] selftest: removed idempotency guard should FAIL but passed`);
  }

  console.log(`[${LABEL}] selftest: PASS — real green; TRANSP-scope and removed-idempotency mutations both red`);
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error("  ✗", f);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — USMCA payment-method GL binding is scoped, idempotent, and points at the correct operating account`);
