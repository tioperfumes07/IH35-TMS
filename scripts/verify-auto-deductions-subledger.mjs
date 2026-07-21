#!/usr/bin/env node
// verify-auto-deductions-subledger.mjs
//
// Anti-regression guard for FOUNDATION-FIRST Priority 2 / P2a (owner DECISION 1, 2026-07-21 —
// docs/specs/SETTLEMENT-ENGINE-OWNER-DECISIONS-2026-07-21.md; blueprint §1 "deductions are NOT
// negative pay lines").
//
// Static (no DB — cannot silently SKIP). FAILS if any of these regresses:
//   1. settlements/auto-deductions/apply.ts writes settlement_lines again (INSERT INTO
//      driver_finance.settlement_lines), writes a negative dollar amount (the pre-fix
//      `-(cents / 100)` shape), or manually patches driver_finance.driver_settlements totals.
//   2. apply.ts no longer materializes into the canonical sub-ledger
//      driver_finance.driver_settlement_deductions with the policy linkage column
//      (source_auto_deduction_policy_id) and the ON CONFLICT one-open-tranche idempotency arbiter.
//   3. settlements-load-bookended.service.ts no longer calls the materializer
//      (applyAutoDeductionsToSettlement) BEFORE the net-floor cap applier
//      (applyPendingDeductionsToSettlementWithNetFloor) — ordering is what makes the cap SEE autos.
//   4. index.ts no longer mounts registerAutoDeductionPolicyRoutes (the
//      /api/v1/auto-deductions/policies live-404 regression).
//
// --selftest proves both directions on embedded fixtures (the pre-fix shapes must FAIL).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-auto-deductions-subledger";
const APPLY = "apps/backend/src/settlements/auto-deductions/apply.ts";
const SERVICE = "apps/backend/src/driver-finance/settlements-load-bookended.service.ts";
const INDEX = "apps/backend/src/index.ts";

export function checkApply(source) {
  const errors = [];

  if (/INSERT\s+INTO\s+driver_finance\.settlement_lines/i.test(source)) {
    errors.push(
      `${APPLY} inserts driver_finance.settlement_lines — auto-deductions must be sub-ledger rows (owner DECISION 1: NOT negative pay lines)`
    );
  }
  if (/-\s*\(\s*\w*[Cc]ents\s*\/\s*100\s*\)/.test(source)) {
    errors.push(`${APPLY} computes a NEGATIVE dollar amount (the pre-fix '-(cents / 100)' shape) — sub-ledger amounts are positive cents`);
  }
  if (/UPDATE\s+driver_finance\.driver_settlements/i.test(source)) {
    errors.push(
      `${APPLY} manually patches driver_finance.driver_settlements totals — settlement totals are owned by the cap applier + aggregateSettlementTotals, never the materializer`
    );
  }
  if (!/INSERT\s+INTO\s+driver_finance\.driver_settlement_deductions/i.test(source)) {
    errors.push(`${APPLY} no longer inserts into the canonical sub-ledger driver_finance.driver_settlement_deductions`);
  }
  if (!/source_auto_deduction_policy_id/.test(source)) {
    errors.push(`${APPLY} lost the policy linkage column source_auto_deduction_policy_id — tranches would be unprovenanced and non-idempotent`);
  }
  if (!/ON CONFLICT[\s\S]{0,200}?DO NOTHING/.test(source)) {
    errors.push(`${APPLY} lost the ON CONFLICT ... DO NOTHING one-open-tranche arbiter — a re-run could double-charge the driver`);
  }

  return errors;
}

export function checkService(source) {
  const errors = [];

  const materializerCall = source.indexOf("await applyAutoDeductionsToSettlement(");
  const capApplierCall = source.indexOf("await applyPendingDeductionsToSettlementWithNetFloor(");

  if (materializerCall === -1) {
    errors.push(`${SERVICE} no longer calls applyAutoDeductionsToSettlement — auto policies would never materialize (silent driver receivable loss)`);
  }
  if (capApplierCall === -1) {
    errors.push(`${SERVICE} no longer calls applyPendingDeductionsToSettlementWithNetFloor — the net-floor cap applier was unwired (REPAIR-A regression)`);
  }
  if (materializerCall !== -1 && capApplierCall !== -1 && materializerCall > capApplierCall) {
    errors.push(
      `${SERVICE} calls the materializer AFTER the cap applier — the cap would not see this close's auto tranches (they'd silently roll a settlement late)`
    );
  }

  return errors;
}

export function checkIndex(source) {
  const errors = [];

  if (!/import\s*\{\s*registerAutoDeductionPolicyRoutes\s*\}\s*from\s*"\.\/settlements\/auto-deductions\/policy\.routes\.js"/.test(source)) {
    errors.push(`${INDEX} no longer imports registerAutoDeductionPolicyRoutes from settlements/auto-deductions/policy.routes.js`);
  }
  if (!/await registerAutoDeductionPolicyRoutes\(app\);/.test(source)) {
    errors.push(`${INDEX} no longer mounts registerAutoDeductionPolicyRoutes(app) — /api/v1/auto-deductions/policies 404s live again`);
  }

  return errors;
}

function runAll() {
  return [
    ...checkApply(fs.readFileSync(path.join(ROOT, APPLY), "utf8")),
    ...checkService(fs.readFileSync(path.join(ROOT, SERVICE), "utf8")),
    ...checkIndex(fs.readFileSync(path.join(ROOT, INDEX), "utf8")),
  ];
}

function selftest() {
  const liveErrors = runAll();
  if (liveErrors.length > 0) {
    console.error(`[${LABEL}] SELFTEST FAILED — the live sources do not pass their own guard:`);
    for (const e of liveErrors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }

  // Planted violation 1: the pre-fix apply.ts shape (negative settlement_lines + manual totals patch).
  const badApply = `
    export async function applyAutoDeductionsToSettlement(client, input) {
      const amountDollars = -(deductCents / 100);
      await client.query(\`INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount) VALUES ($1, 'auto_deduction', $2, $3)\`);
      await client.query(\`UPDATE driver_finance.driver_settlements SET deductions_total = COALESCE(deductions_total, 0) + $2 WHERE id = $1\`);
    }
  `;
  const badApplyErrors = checkApply(badApply);
  if (badApplyErrors.length === 0) {
    console.error(`[${LABEL}] SELFTEST FAILED — planted pre-fix apply fixture passed (guard is blind)`);
    process.exit(1);
  }

  // Planted violation 2: cap applier runs BEFORE the materializer (ordering regression).
  const badService = `
    const applied = await applyPendingDeductionsToSettlementWithNetFloor(client, {});
    const autoMaterialized = await applyAutoDeductionsToSettlement(client, {});
  `;
  const badServiceErrors = checkService(badService);
  if (badServiceErrors.length === 0) {
    console.error(`[${LABEL}] SELFTEST FAILED — planted ordering-regression fixture passed (guard is blind)`);
    process.exit(1);
  }

  // Planted violation 3: route registration dropped (the live-404 regression).
  const badIndexErrors = checkIndex(`await registerSettlementsDisputesRoutes(app);`);
  if (badIndexErrors.length === 0) {
    console.error(`[${LABEL}] SELFTEST FAILED — planted unmounted-routes fixture passed (guard is blind)`);
    process.exit(1);
  }

  console.log(
    `[${LABEL}] selftest OK — live sources clean; planted violations caught (apply=${badApplyErrors.length}, ordering=${badServiceErrors.length}, mount=${badIndexErrors.length} findings)`
  );
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const errors = runAll();
  if (errors.length > 0) {
    console.error(`[${LABEL}] FAILED — ${errors.length} regression(s) of the P2a auto-deduction sub-ledger fix:`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log(
    `[${LABEL}] OK — materializer writes cents sub-ledger rows only (no negative lines, no totals patch), runs before the cap applier, and the policy routes are mounted.`
  );
}

main();
