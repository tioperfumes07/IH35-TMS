#!/usr/bin/env node
/**
 * ACCT-F5679 — USMCA's settlement net-pay floor must be corrected to the owner-LOCKED 5% (
 * 00_LOCKED_DECISIONS.md Section 9.2), not the stale DB-column DEFAULT of 50 (migration
 * 202606071910) that settlement-deduction-cap.service.ts's own comment already flags as a known,
 * un-fixed gap.
 *
 * Locked here (the migration file):
 *   1. scoped to USMCA ONLY (TRANSP/TRK are parked per standing directive);
 *   2. idempotent — only updates the row currently at 50, never a later explicit value;
 *   3. sets the value to exactly 5, the locked default.
 *
 * Run:  node scripts/verify-usmca-net-pay-floor-locked-5pct-migration.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-usmca-net-pay-floor-locked-5pct-migration";
const FILE = "db/migrations/202612860000_acct_f5679_usmca_net_pay_floor_locked_5pct.sql";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

export function analyze(src) {
  const failures = [];
  const code = src.replace(/--[^\n]*/g, "");

  if (!code.includes(`'${USMCA}'::uuid`)) {
    failures.push(`${FILE}: must scope the UPDATE to USMCA's operating_company_id literal.`);
  }
  if (/91e0bf0a-133f-4ce8-a734-2586cfa66d96|b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e/.test(code)) {
    failures.push(`${FILE}: must NOT reference TRANSP or TRK's operating_company_id — those entities are parked.`);
  }
  if (!/min_net_settlement_pct\s*=\s*5\b/.test(code)) {
    failures.push(`${FILE}: must set min_net_settlement_pct to exactly 5 (the locked value, 00_LOCKED_DECISIONS §9.2).`);
  }
  if (!/AND min_net_settlement_pct = 50/.test(code)) {
    failures.push(`${FILE}: the UPDATE must be idempotency-guarded (WHERE min_net_settlement_pct = 50) — an unconditional UPDATE could overwrite a later deliberate override.`);
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

  const m2 = real.replace("AND min_net_settlement_pct = 50", "");
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
console.log(`[${LABEL}] PASS — USMCA net-pay floor is scoped, idempotent, and set to the locked 5%`);
