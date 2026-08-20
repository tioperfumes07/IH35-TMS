#!/usr/bin/env node
/** @matrix-built {"modules":["fleet","accounting"],"cols":["unit","ap_bill","expense","gl_je","connectivity","reverse_link"],"leafRe":"^unit\\.detail\\.finance_linkage$","task":"UNIT-FINANCE-LINKAGE-GL-JE-REVERSE","vertical":"column-wave"} */
import fs from "node:fs";
const LABEL = "verify-unit-finance-gl-je-reverse";
const files = {
  service: "apps/backend/src/accounting/bills.service.ts",
  api: "apps/frontend/src/api/accounting.ts",
  view: "apps/frontend/src/pages/units/UnitFinanceLinkageTab.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function audit(s) {
  const failures = [];
  if (!/jep\.source_transaction_type = 'bill'/.test(s.service) || !/jep\.source_transaction_id = b\.id::text/.test(s.service)) failures.push("bill→JE posting resolution missing");
  if (!/jep\.operating_company_id = b\.operating_company_id/.test(s.service) || !/je\.operating_company_id = b\.operating_company_id/.test(s.service)) failures.push("bill→JE entity scope missing");
  if (!/e\.journal_entry_id::text AS journal_entry_id/.test(s.service) || !/je\.operating_company_id = e\.operating_company_id/.test(s.service)) failures.push("expense→JE scoped resolution missing");
  if ((s.service.match(/journal_entry_id: \(r\.journal_entry_id as string\) \?\? null/g) || []).length < 2) failures.push("JE ids not returned for bills and expenses");
  if ((s.api.match(/journal_entry_id\?: string \| null/g) || []).length < 2 || (s.api.match(/journal_entry_memo\?: string \| null/g) || []).length < 2) failures.push("typed JE linkage missing");
  if ((s.view.match(/kind="journal_entry"/g) || []).length < 2) failures.push("bill and expense JE drills missing");
  if (!/b\.journal_entry_id/.test(s.view) || !/e\.journal_entry_id/.test(s.view)) failures.push("conditional source JE rendering missing");
  if (!/linkedMoneyQuery\.isError/.test(s.view) || !/No bills or expenses stamp/.test(s.view)) failures.push("honest reverse states missing");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["bill-type", "service", /jep\.source_transaction_type = 'bill'/g, "TRUE"],
    ["bill-id", "service", /jep\.source_transaction_id = b\.id::text/g, "TRUE"],
    ["posting-scope", "service", /jep\.operating_company_id = b\.operating_company_id/g, "TRUE"],
    ["bill-je-scope", "service", /je\.operating_company_id = b\.operating_company_id/g, "TRUE"],
    ["expense-id", "service", /e\.journal_entry_id::text AS journal_entry_id/g, "NULL AS journal_entry_id"],
    ["expense-scope", "service", /je\.operating_company_id = e\.operating_company_id/g, "TRUE"],
    ["api-id", "api", /journal_entry_id\?: string \| null/g, "wrong_id?: string | null"],
    ["bill-drill", "view", /b\.journal_entry_id/g, "b.missing_je_id"],
    ["expense-drill", "view", /e\.journal_entry_id/g, "e.missing_je_id"],
    ["drill-kind", "view", /kind="journal_entry"/g, 'kind="expense"'],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const candidate = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (candidate[key] === source[key] || audit(candidate).length === 0) { console.error(`${LABEL} SELFTEST FAIL — ${name}`); process.exit(1); }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`); process.exit(0);
}
const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — unit→bill/expense→canonical JE reverse drills are entity-scoped and honest`);
