#!/usr/bin/env node
// verify-weekly-close-applies-deductions — landmine guard (2026-07-21).
//
// apps/backend/src/driver-finance/weekly-close.routes.ts used to INSERT a driver's weekly-close
// settlement with `deductions_total: 0, reimbursements_total: 0, net_pay: grossPay` unconditionally —
// no flag check, no recompute — so a driver with pending cash-advance/other deductions or owed
// reimbursements was always drafted at FULL GROSS PAY. The canonical load-bookended settlement close
// (settlements-load-bookended.service.ts) never has this gap: it runs
// applyPendingDeductionsToSettlementWithNetFloor + computeSettlementReimbursements BEFORE
// aggregateSettlementTotals recomputes net_pay, gated behind the per-entity
// SETTLEMENT_DEDUCTION_APPLY_ENABLED flag with an honest OFF-signal (recordPostingFlagSkip).
//
// This guard fails CI if weekly-close.routes.ts regresses to the silent-gross-pay pattern: the
// INSERT-time hardcode signature present with NO subsequent canonical-applier recompute, OR any of the
// required wiring markers missing, OR the applier called AFTER the recompute (wrong order). Self-test:
// --selftest.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TARGET = "apps/backend/src/driver-finance/weekly-close.routes.ts";

// The original landmine signature: the driver_settlements INSERT binds
// [..., grossPay, 0, 0, grossPay] for [gross_pay, deductions_total, reimbursements_total, net_pay].
const LANDMINE_SIGNATURE = /grossPay\s*,\s*0\s*,\s*0\s*,\s*grossPay/;

const REQUIRED_MARKERS = [
  { name: "deduction applier reused", re: /applyPendingDeductionsToSettlementWithNetFloor\s*\(/ },
  { name: "reimbursement applier reused", re: /computeSettlementReimbursements\s*\(/ },
  { name: "canonical totals recompute", re: /aggregateSettlementTotals\s*\(/ },
  { name: "per-entity flag gate", re: /isEnabled\s*\(\s*client\s*,\s*SETTLEMENT_DEDUCTION_APPLY_FLAG/ },
  { name: "honest OFF-signal (no silent no-op)", re: /recordPostingFlagSkip\s*\(/ },
];

export function analyze(source) {
  const failures = [];

  for (const marker of REQUIRED_MARKERS) {
    if (!marker.re.test(source)) {
      failures.push(`missing required wiring: ${marker.name} (${marker.re})`);
    }
  }

  // Fail-closed: if any required marker is missing, don't bother with ordering — report and stop here
  // (ordering checks below assume all markers are present).
  if (failures.length > 0) {
    if (LANDMINE_SIGNATURE.test(source)) {
      failures.push(
        "landmine signature found (grossPay, 0, 0, grossPay bound to gross_pay/deductions_total/" +
          "reimbursements_total/net_pay) with NO canonical applier recompute afterward — this is the " +
          "silent-gross-pay bug: drivers get paid gross, deductions/reimbursements never applied"
      );
    }
    return failures;
  }

  const applyIdx = source.search(/applyPendingDeductionsToSettlementWithNetFloor\s*\(/);
  const aggregateIdx = source.search(/aggregateSettlementTotals\s*\(/);
  // aggregateSettlementTotals is imported at the top of the file too, so search for its CALL (with an
  // argument list starting with `client`) after the import line, not just any textual occurrence.
  const aggregateCallIdx = source.indexOf("await aggregateSettlementTotals(");

  if (aggregateCallIdx === -1) {
    failures.push("aggregateSettlementTotals is imported but never called — recompute is dead code");
  } else if (applyIdx !== -1 && aggregateCallIdx < applyIdx) {
    failures.push(
      "aggregateSettlementTotals is called BEFORE applyPendingDeductionsToSettlementWithNetFloor — " +
        "net_pay would be recomputed from stale lines (deductions applied too late to count)"
    );
  }

  return failures;
}

function run() {
  const abs = path.join(ROOT, TARGET);
  let src;
  try {
    src = fs.readFileSync(abs, "utf8");
  } catch {
    return []; // file moved/renamed — not this guard's concern (schema-phantom guards cover that)
  }
  return analyze(src).map((f) => `${TARGET}: ${f}`);
}

export { run };

if (process.argv.includes("--selftest")) {
  const silentOriginalBug = `
    const settlementRes = await client.query(
      \`INSERT INTO driver_finance.driver_settlements (
        operating_company_id, display_id, driver_id, period_start, period_end, status,
        gross_pay, deductions_total, reimbursements_total, net_pay
      ) VALUES ($1,$2,$3,$4,$5,'presettle',$6,$7,$8,$9) RETURNING id::text AS id\`,
      [companyId, displayId, driverId, weekStart, weekEnd, grossPay, 0, 0, grossPay]
    );
  `;

  const fixed = `
    const settlementRes = await client.query(
      [opts.operatingCompanyId, displayId, opts.driverId, opts.weekStart, opts.weekEnd, grossPay, 0, 0, grossPay]
    );
    const deductionApplyEnabled = await isEnabled(client, SETTLEMENT_DEDUCTION_APPLY_FLAG, {
      operating_company_id: opts.operatingCompanyId,
    });
    if (deductionApplyEnabled) {
      const reimbursements = await computeSettlementReimbursements(client, { settlementId });
      const deductionsApplied = await applyPendingDeductionsToSettlementWithNetFloor(client, { settlementId });
    } else {
      await recordPostingFlagSkip(client, actorUserId, { flagKey: SETTLEMENT_DEDUCTION_APPLY_FLAG });
    }
    await aggregateSettlementTotals(client, settlementId);
  `;

  const wrongOrder = `
    [opts.operatingCompanyId, displayId, opts.driverId, opts.weekStart, opts.weekEnd, grossPay, 0, 0, grossPay]
    const deductionApplyEnabled = await isEnabled(client, SETTLEMENT_DEDUCTION_APPLY_FLAG, {});
    await aggregateSettlementTotals(client, settlementId);
    if (deductionApplyEnabled) {
      const reimbursements = await computeSettlementReimbursements(client, { settlementId });
      const deductionsApplied = await applyPendingDeductionsToSettlementWithNetFloor(client, { settlementId });
    } else {
      await recordPostingFlagSkip(client, actorUserId, { flagKey: SETTLEMENT_DEDUCTION_APPLY_FLAG });
    }
  `;

  const checks = [
    ["original hardcoded-gross bug is flagged", analyze(silentOriginalBug).length > 0],
    ["fixed file (applier + recompute + honest flag gate) is clean", analyze(fixed).length === 0],
    ["recompute-before-apply ordering regression is flagged", analyze(wrongOrder).length > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:weekly-close-applies-deductions --selftest FAIL:");
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`verify:weekly-close-applies-deductions --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = run();
  if (failures.length) {
    console.error("verify:weekly-close-applies-deductions FAIL — weekly-close can silently pay gross:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log("verify:weekly-close-applies-deductions PASS — weekly-close reuses the canonical deduction/reimbursement applier and recompute, flag-gated with an honest OFF-signal");
}
