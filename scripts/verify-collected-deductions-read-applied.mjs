#!/usr/bin/env node
// ROUND 297 driver-profile audit (CC-1) — a deduction the settlement close COLLECTED reads 'applied' with nothing
// remaining. Apply-time only stamped applied_to_settlement_id, so every collected deduction read 'pending' at its full
// amount (all 67 on prod, 45 already on closed settlements) and the driver Deductions tab never tied to Settlements.
// This guard fails if closeSettlementPayRun stops (1) collecting the ids of the deductions it sums
// (loadOtherDeductionsByRole collectedIds) or (2) stamping exactly those rows status 'applied', remaining 0, refusing
// on a partial transition; or if the settlement reverser stops returning them to 'pending' at the full amount.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-collected-deductions-read-applied";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLOSE = "apps/backend/src/driver-finance/settlement-payrun-close.service.ts";
const RESTORE = "apps/backend/src/accounting/settlement-posting/settlement-posting.service.ts";

export function problems(close, restore) {
  const p = [];
  if (!/collectedIds\.push\(r\.id\)/.test(close) || !/loadOtherDeductionsByRole\(client, opco, settlementId, collectedDeductionIds\)/.test(close)) p.push(`${CLOSE}: the close must collect the ids of the deductions it sums`);
  if (!/SET status = 'applied', remaining_balance_cents = 0[\s\S]{0,300}id = ANY\(\$3::uuid\[\]\)/.test(close)) p.push(`${CLOSE}: collected deductions must be stamped status 'applied', remaining 0`);
  if (!/"DEDUCTION_STATE_TRANSITION_FAILED"/.test(close)) p.push(`${CLOSE}: a partial applied-transition must refuse`);
  if (!/SET applied_to_settlement_id = NULL,\s*status = 'pending',\s*remaining_balance_cents = amount_cents/.test(restore)) p.push(`${RESTORE}: the settlement reverser must return deductions to 'pending' at the full amount`);
  return p;
}

export function run() {
  return problems(readFileSync(path.join(ROOT, CLOSE), "utf8"), readFileSync(path.join(ROOT, RESTORE), "utf8"));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const close = readFileSync(path.join(ROOT, CLOSE), "utf8");
  const restore = readFileSync(path.join(ROOT, RESTORE), "utf8");
  const own = problems(close, restore);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plants = [
      ["no stamp", close.replace("SET status = 'applied', remaining_balance_cents = 0", "SET updated_at = now()"), restore],
      ["ids not collected", close.replace("collectedIds.push(r.id)", "void 0"), restore],
      ["restore keeps applied", close, restore.replace("status = 'pending',", "status = 'applied',")],
    ];
    for (const [name, c, r] of plants) {
      if (!problems(c, r).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL —\n  ${own.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — the close stamps collected deductions 'applied' (remaining 0); the settlement reverser restores them to 'pending'.`);
}
