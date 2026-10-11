#!/usr/bin/env node
/**
 * GUARD — Lead order 2026-10-11 (prod audit of 5769-5779 found 0 of the posted fuel / company expenses by settlement
 * number): every Settlement Creator post stamps accounting.expenses.settlement_no on its expenses through
 * stampCreatorExpenseSettlementNo (only this company's, only empty ones, audited).
 * Run: node scripts/verify-settlement-creator-expense-settlement-no.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-expense-settlement-no";
const F = { svc: "apps/backend/src/driver-finance/settlement-creator.service.ts", fn: "apps/backend/src/driver-finance/settlement-creator-expense-settlement-no.ts" };
export function problems(s) {
  const p = [];
  if (!/await stampCreatorExpenseSettlementNo\(client as never, \{\s*operatingCompanyId: draft\.operating_company_id, settlementId, settlementNo: sourceDocumentRef \?\? displayId, expenseIds, actorUserId,/.test(s.svc)) p.push("the Creator post does not stamp settlement_no on its expenses");
  if (!/SET settlement_no = \$3/.test(s.fn) || !/settlement_no IS NULL AND voided_at IS NULL/.test(s.fn) || !/operating_company_id = \$1::uuid AND id = ANY\(\$2::uuid\[\]\)/.test(s.fn)) p.push("the stamp is not scoped to this company's named, empty, live expenses");
  if (!/appendCrudAudit\(/.test(s.fn)) p.push("the stamp is not audited");
  return p;
}
const read = () => Object.fromEntries(Object.entries(F).map(([k, r]) => [k, fs.readFileSync(path.join(ROOT, r), "utf8")]));
function selftest() {
  const g = read(); const bad = [];
  if (problems(g).length) bad.push(`real tree flagged: ${problems(g).join("; ")}`);
  const plants = [["svc", (x) => x.replace("await stampCreatorExpenseSettlementNo(client as never, {", "await Promise.resolve({")], ["fn", (x) => x.replace("settlement_no IS NULL AND ", "")], ["fn", (x) => x.replace("appendCrudAudit(", "noAudit(")]];
  for (const [k, f] of plants) { const pl = f(g[k]); if (pl === g[k]) bad.push(`plant on ${k} did not apply`); else if (!problems({ ...g, [k]: pl }).length) bad.push(`plant on ${k} passed`); }
  if (bad.length) { console.error(`${LABEL} selftest FAIL\n- ${bad.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} selftest PASS (${plants.length} plants caught)`);
}
if (process.argv.includes("--selftest")) selftest();
else { const p = problems(read()); if (p.length) { console.error(`${LABEL} FAIL\n- ${p.join("\n- ")}`); process.exit(1); } console.log(`${LABEL} PASS`); }
