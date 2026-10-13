#!/usr/bin/env node
// Guard for the Jorge-LOCKED load_id-DIRECT rule (2026-06-27): a load-linked cash-advance recovery
// deduction must carry load_id DIRECTLY through the whole write path — never the old hardcoded NULL,
// never relying on the transitive (advance→liability→schedule) trace. Static guard: asserts every hop
// of the canonical writer still stamps/propagates load_id, so this can't silently regress.
//   1. driver_finance.driver_settlement_deductions INSERT (deductions.service.ts) includes load_id.
//   2. The pay-run reads each recovered advance's load_id (settlement-payrun-close.service.ts; LST-F426).
//   3. Each recovered advance is applied to its own load's bill (preferredLoadId), never one load-less line.
//   4. The cash-advance approve path passes the request's load into createSettlementDeduction on every
//      bill-payment branch, and none on the loan branch (443.101 R1 #26569; 2026-09-06: a loan never links to a load).
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

/** Hops 1-4 as a pure check over the three sources; returns every broken hop. */
export function checkHops({ deductions, payrun, approve }) {
  const p = [];
  // 1. canonical deduction writer persists load_id
  if (!/INSERT INTO driver_finance\.driver_settlement_deductions[\s\S]{0,400}\bload_id\b/i.test(deductions)) p.push("deductions.service.ts: INSERT INTO driver_settlement_deductions must include the load_id column");
  if (!/loadId\b/.test(deductions)) p.push("deductions.service.ts: createSettlementDeduction must accept a loadId input");
  // 2. the pay-run reads each recovered advance's load (its own load_id, else its linked driver bill's load).
  if (!/SELECT a\.id::text, COALESCE\(a\.load_id, db\.load_id\)::text AS load_id FROM driver_finance\.driver_advances a/.test(payrun)) p.push("settlement-payrun-close.service.ts: the advance recovery must read each advance's load (COALESCE(a.load_id, db.load_id))");
  // 3. each recovered advance is applied to ITS OWN load's bill — never one aggregated, load-less recovery.
  if (!/kind: "advance",[^\n]*advanceId: r\.id,[^\n]*preferredLoadId: loadOf\.get\(r\.id\)/.test(payrun)) p.push("settlement-payrun-close.service.ts: each advance recovery must be applied with preferredLoadId: loadOf.get(r.id)");
  // 4. the approve path forwards the request's load onto the advance AND its recovery deduction on every
  //    bill-payment branch (load_bill / open_bill). 443.101 R1 (#26569), 2026-09-06 law: a LOAN never links to a
  //    load — so the forwarded load is `loan ? null : row.load_id`, computed once and passed to the deduction.
  //    A non-loan branch that drops the load, or a loan that carries it, both fail.
  const m = approve.match(/const (\w+)\s*=\s*cascadeBranch\s*===\s*"loan"\s*\?\s*null\s*:\s*\(?\s*\(?\s*row\.load_id\b/);
  if (!m) p.push('cash-advance-requests.service.ts: approve path must derive the forwarded load as `cascadeBranch === "loan" ? null : row.load_id` (non-loan carries the load; a loan never does)');
  else if (!new RegExp(`createSettlementDeduction\\([\\s\\S]{0,1500}?loadId:\\s*${m[1]}\\b`).test(approve)) p.push(`cash-advance-requests.service.ts: approve path must pass loadId: ${m[1]} into createSettlementDeduction`);
  return p;
}

if (process.argv.includes("--selftest")) {
  let ok = true;
  const ex = (n, c) => { if (!c) { console.error(`SELFTEST FAIL: ${n}`); ok = false; } };
  const real = { deductions, payrun, approve };
  ex("real sources pass", checkHops(real).length === 0);
  ex("deduction INSERT without load_id is caught", checkHops({ ...real, deductions: deductions.replace(/INSERT INTO driver_finance\.driver_settlement_deductions/g, "INSERT INTO x") }).length > 0);
  ex("pay-run reading no advance load is caught", checkHops({ ...real, payrun: payrun.replace("COALESCE(a.load_id, db.load_id)", "NULL") }).length > 0);
  ex("aggregated load-less recovery is caught", checkHops({ ...real, payrun: payrun.replace("preferredLoadId: loadOf.get(r.id)", "preferredLoadId: null") }).length > 0);
  ex("non-loan branch dropping the load is caught", checkHops({ ...real, approve: approve.replace(/cascadeBranch\s*===\s*"loan"\s*\?\s*null\s*:\s*\(\(row\.load_id[^;]*;/, "null;") }).length > 0);
  ex("loan carrying the load (ternary removed) is caught", checkHops({ ...real, approve: approve.replace(/cascadeBranch\s*===\s*"loan"\s*\?\s*null\s*:\s*/, "") }).length > 0);
  ex("deduction not given the forwarded load is caught", checkHops({ ...real, approve: approve.replace(/loadId:\s*advanceLoadId/, "loadId: null") }).length > 0);
  console.log(ok ? "verify-advance-recovery-load-id --selftest PASS (7/7)" : "verify-advance-recovery-load-id --selftest FAIL");
  process.exit(ok ? 0 : 1);
}

const problems = checkHops({ deductions, payrun, approve });
if (problems.length) fail(problems.join("; "));

console.log("PASS verify-advance-recovery-load-id");
