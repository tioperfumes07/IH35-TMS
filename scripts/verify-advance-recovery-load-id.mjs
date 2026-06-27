#!/usr/bin/env node
// Guard for the Jorge-LOCKED load_id-DIRECT rule (2026-06-27): a load-linked cash-advance recovery
// deduction must carry load_id DIRECTLY through the whole write path — never the old hardcoded NULL,
// never relying on the transitive (advance→liability→schedule) trace. Static guard: asserts every hop
// of the canonical writer still stamps/propagates load_id, so this can't silently regress.
//   1. driver_finance.driver_settlement_deductions INSERT (deductions.service.ts) includes load_id.
//   2. The cash_advance_repayment recovery query (driver-settlement.service.ts) SELECTs load_id.
//   3. The advance_recovery line is built with load_id from the per-deduction map, NOT `load_id: null`.
//   4. The cash-advance approve path passes loadId into createSettlementDeduction.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-advance-recovery-load-id: ${m}`); process.exit(1); };
const read = (p) => { try { return readFileSync(join(root, p), "utf8"); } catch { fail(`missing file: ${p}`); } };

const deductions = read("apps/backend/src/driver-finance/deductions.service.ts");
const settlement = read("apps/backend/src/payroll/driver-settlement.service.ts");
const approve = read("apps/backend/src/driver-finance/cash-advance-requests.service.ts");

// 1. canonical deduction writer persists load_id
if (!/INSERT INTO driver_finance\.driver_settlement_deductions[\s\S]{0,400}\bload_id\b/i.test(deductions)) {
  fail("deductions.service.ts: INSERT INTO driver_settlement_deductions must include the load_id column");
}
if (!/loadId\b/.test(deductions)) fail("deductions.service.ts: createSettlementDeduction must accept a loadId input");

// 2. recovery query selects load_id from the pending ledger
if (!/cash_advance_repayment[\s\S]{0,600}\bload_id\b/i.test(settlement) && !/\bload_id::text AS load_id[\s\S]{0,600}cash_advance_repayment/i.test(settlement)) {
  // accept either order (SELECT list before or after the WHERE clause within the same query block)
  if (!/load_id::text AS load_id/i.test(settlement)) {
    fail("driver-settlement.service.ts: the cash_advance_repayment recovery query must SELECT load_id");
  }
}

// 3. the CANONICAL (capped-ledger, per-deduction) recovery line must stamp load_id from the deduction map.
if (!/loadIdByDeduction/.test(settlement)) {
  fail("driver-settlement.service.ts: canonical advance_recovery load_id must come from the per-deduction map (loadIdByDeduction)");
}
if (!/load_id:\s*loadIdByDeduction\.get\(/.test(settlement)) {
  fail("driver-settlement.service.ts: the capped-ledger advance_recovery line must set load_id: loadIdByDeduction.get(...)");
}
// Any remaining `load_id: null` on a settlement line is allowed ONLY when explicitly justified as an
// unavoidable multi-advance aggregate (the legacy blunt path) — marked `load_id-aggregate-exempt`.
const lines = settlement.split("\n");
for (let i = 0; i < lines.length; i++) {
  if (/load_id:\s*null/.test(lines[i])) {
    const ctx = lines.slice(Math.max(0, i - 6), i + 1).join("\n");
    if (!/load_id-aggregate-exempt/.test(ctx)) {
      fail(`driver-settlement.service.ts:${i + 1}: load_id: null without the load_id-aggregate-exempt justification — stamp the load_id or document why it can't carry one`);
    }
  }
}

// 4. the approve path forwards the originating load onto the recovery deduction
if (!/sourceType:\s*"cash_advance_repayment"[\s\S]{0,200}loadId:/.test(approve) && !/loadId:\s*row\.load_id/.test(approve)) {
  fail("cash-advance-requests.service.ts: approve path must pass loadId (row.load_id) into createSettlementDeduction");
}

console.log("PASS verify-advance-recovery-load-id");
