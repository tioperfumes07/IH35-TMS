#!/usr/bin/env node
/**
 * GUARD — ROUND 443.32 (CC-2 live finding on settlement 5769, deduction 68041143): a deduction the Settlement Creator
 * applies to its settlement gets the settlement LINE that applies it — line_type 'deduction', source_table +
 * source_reference_id -> the deduction, on its load — the same row the canonical writers write. Without it the close marks
 * the deduction applied (remaining 0) while v_settlement_deduction_balances still reads it open.
 * Run: node scripts/verify-settlement-creator-deduction-has-settlement-line.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-deduction-has-settlement-line";
const SVC = "apps/backend/src/driver-finance/settlement-creator.service.ts";

export function problems(src) {
  const p = [];
  const a = src.indexOf("async function applyDeduction(");
  const b = src.indexOf("for (const d of draft.deductions ?? [])", a);
  if (a < 0 || b < 0) return ["applyDeduction not found"];
  const body = src.slice(a, b);
  if (!/createSettlementDeduction\(/.test(body)) p.push("applyDeduction no longer creates the deduction");
  if (!/INSERT INTO driver_finance\.settlement_lines[\s\S]*'deduction'/.test(body)) p.push("applyDeduction writes no 'deduction' settlement line");
  if (!/source_table, source_reference_id/.test(body) || !/SETTLEMENT_DEDUCTION_SOURCE_TABLE, created\.id/.test(body)) p.push("the deduction line does not point at the deduction (source_table + source_reference_id)");
  if (!/amountCents \/ 100, loadId/.test(body)) p.push("the deduction line does not carry the amount and its load");
  if (!/resolveDeductionPostingAccount\(/.test(body)) p.push("the deduction line does not resolve its posting account like the materializer");
  return p;
}

function selftest() {
  const good = fs.readFileSync(path.join(ROOT, SVC), "utf8");
  const bad = [];
  if (problems(good).length) bad.push(`real tree flagged: ${problems(good).join("; ")}`);
  const plants = [
    (s) => s.replace("INSERT INTO driver_finance.settlement_lines\n          (settlement_id, operating_company_id, line_type", "INSERT INTO driver_finance.other_lines\n          (settlement_id, operating_company_id, line_type"),
    (s) => s.replace("SETTLEMENT_DEDUCTION_SOURCE_TABLE, created.id,", "SETTLEMENT_DEDUCTION_SOURCE_TABLE, null,"),
    (s) => s.replace("amountCents / 100, loadId,", "amountCents / 100, null,"),
    (s) => s.replace("(await resolveDeductionPostingAccount(", "(await Promise.resolve({ postingAccountId: null }) && resolveX("),
  ];
  for (const f of plants) {
    const planted = f(good);
    if (planted === good) bad.push(`plant did not apply: ${f.toString().slice(0, 80)}`);
    else if (!problems(planted).length) bad.push(`plant passed: ${f.toString().slice(0, 80)}`);
  }
  if (bad.length) { console.error(`${LABEL} selftest FAIL\n- ${bad.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} selftest PASS (${plants.length} plants caught)`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const p = problems(fs.readFileSync(path.join(ROOT, SVC), "utf8"));
  if (p.length) { console.error(`${LABEL} FAIL\n- ${p.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} PASS`);
}
