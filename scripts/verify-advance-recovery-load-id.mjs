#!/usr/bin/env node
// Guard for the Jorge-LOCKED load_id-DIRECT rule (2026-06-27): a load-linked cash-advance recovery
// deduction must carry load_id DIRECTLY through the whole write path — never the old hardcoded NULL,
// never relying on the transitive (advance→liability→schedule) trace. Static guard: asserts every hop
// of the canonical writer still stamps/propagates load_id, so this can't silently regress.
//   1. driver_finance.driver_settlement_deductions INSERT (deductions.service.ts) includes load_id.
//   2. The pay-run reads each recovered advance's load_id (settlement-payrun-close.service.ts; LST-F426).
//   3. Each recovered advance is applied to its own load's bill (preferredLoadId), never one load-less line.
//   4. The cash-advance approve path passes loadId into createSettlementDeduction.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fail = (m) => { console.error(`FAIL verify-advance-recovery-load-id: ${m}`); process.exit(1); };
const read = (p) => { try { return readFileSync(join(root, p), "utf8"); } catch { fail(`missing file: ${p}`); } };

const deductions = read("apps/backend/src/driver-finance/deductions.service.ts");
// LST-F426: the payroll settlement writer (driver-settlement.service.deprecated.ts) is deleted — it was unreachable. The
// live recovery is the pay-run's per-load A/P chain (settlement-payrun-close.service.ts, ROUND 326), which applies EACH
// recovered advance to its own load's bill. Hops 2-3 now hold that writer to the rule.
const payrun = read("apps/backend/src/driver-finance/settlement-payrun-close.service.ts");
const approve = read("apps/backend/src/driver-finance/cash-advance-requests.service.ts");

// 1. canonical deduction writer persists load_id
if (!/INSERT INTO driver_finance\.driver_settlement_deductions[\s\S]{0,400}\bload_id\b/i.test(deductions)) {
  fail("deductions.service.ts: INSERT INTO driver_settlement_deductions must include the load_id column");
}
if (!/loadId\b/.test(deductions)) fail("deductions.service.ts: createSettlementDeduction must accept a loadId input");

// 2. the pay-run reads each recovered advance's load (its own load_id, else its linked driver bill's load).
if (!/SELECT a\.id::text, COALESCE\(a\.load_id, db\.load_id\)::text AS load_id FROM driver_finance\.driver_advances a/.test(payrun)) {
  fail("settlement-payrun-close.service.ts: the advance recovery must read each advance's load (COALESCE(a.load_id, db.load_id))");
}

// 3. each recovered advance is applied to ITS OWN load's bill — never one aggregated, load-less recovery.
if (!/kind: "advance",[^\n]*advanceId: r\.id,[^\n]*preferredLoadId: loadOf\.get\(r\.id\)/.test(payrun)) {
  fail("settlement-payrun-close.service.ts: each advance recovery must be applied with preferredLoadId: loadOf.get(r.id)");
}

// 4. the approve path forwards the originating load onto the recovery deduction. Accept both the plain
//    form `loadId: row.load_id` and the TS-cast form `loadId: (row.load_id as ...)` (the row type may not
//    carry load_id, requiring a cast) — the INTENT (pass the request's load_id) is what matters.
if (!/loadId:\s*\(?\s*row\.load_id\b/.test(approve)) {
  fail("cash-advance-requests.service.ts: approve path must pass loadId from row.load_id into createSettlementDeduction");
}

console.log("PASS verify-advance-recovery-load-id");
