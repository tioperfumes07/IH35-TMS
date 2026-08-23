#!/usr/bin/env node
/** @matrix-built {"modules":["fleet","accounting"],"cols":["unit","ap_bill","expense","gl_je","connectivity"],"leaves":["unit.detail.finance_linkage"],"task":"UNIT-FINANCE-LINKAGE-GL-JE","vertical":"column-wave"} */
/** @matrix-built {"modules":["fleet","accounting"],"cols":["reverse_link"],"leaves":["unit.detail.finance_linkage"],"task":"FLEET-F5917-FINANCE-LINKAGE-REVERSE-EXACT","vertical":"class-sweep"} */
import fs from "node:fs";
const LABEL = "verify-unit-finance-gl-je-reverse";
const files = {
  service: "apps/backend/src/accounting/bills.service.ts",
  api: "apps/frontend/src/api/accounting.ts",
  view: "apps/frontend/src/pages/units/UnitFinanceLinkageTab.tsx",
  required: "docs/specs/scoreboard/modules/fleet.required.json",
  // CLASS-F5973-TRUE-REMAINDER-ACCOUNTING-UNIT-FINANCE — accounting.required.json carries its OWN
  // registry copy of this same cross-module leaf (same real surface, same GET endpoint, same
  // UnitFinanceLinkageTab.tsx — see that leaf's own "note"). Only fleet's copy was ever checked
  // here, leaving accounting:unit.detail.finance_linkage:reverse_link genuinely unowned even though
  // the underlying implementation this guard already proves is the SAME implementation. Checking it
  // too (not a second, duplicate implementation — there is only one) is what lets the exact
  // PROTECTED key retire from verify-codex-vertical-nonmoney-zero-remainder.mjs.
  requiredAccounting: "docs/specs/scoreboard/modules/accounting.required.json",
  feed: "docs/specs/scoreboard/wire-sprint-built.json",
  self: "scripts/verify-unit-finance-gl-je-reverse.mjs",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
const EXACT_HEADER = '/** @matrix-built {"modules":["fleet","accounting"],"cols":["reverse_link"],"leaves":["unit.detail.finance_linkage"],"task":"FLEET-F5917-FINANCE-LINKAGE-REVERSE-EXACT","vertical":"class-sweep"} */';
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
  if (!/EntityLink kind="bill" id=\{b\.id\}/.test(s.view) || !/kind="expense"[\s\S]{0,80}id=\{e\.id\}/.test(s.view)) failures.push("canonical bill/expense source drills missing");
  const findLeaf = (json) => {
    let leaf;
    const visit = (value) => {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") {
        if (value.id === "unit.detail.finance_linkage" && Array.isArray(value.required)) leaf = value;
        Object.values(value).forEach(visit);
      }
    };
    visit(JSON.parse(json));
    return leaf;
  };
  const fleetLeaf = findLeaf(s.required);
  if (!fleetLeaf) failures.push("Fleet unit finance linkage Required leaf missing");
  else {
    if (!fleetLeaf.required.includes("reverse_link")) failures.push("Fleet unit finance linkage must require reverse_link");
    if (fleetLeaf.route_hint !== "/fleet/units/:id/detail?tab=finance") failures.push("Fleet unit finance linkage route must name the canonical finance tab");
  }
  // CLASS-F5973-TRUE-REMAINDER-ACCOUNTING-UNIT-FINANCE — same check, accounting's own registry copy
  // of this identical cross-module leaf.
  const acctLeaf = findLeaf(s.requiredAccounting);
  if (!acctLeaf) failures.push("Accounting unit finance linkage Required leaf missing");
  else {
    if (!acctLeaf.required.includes("reverse_link")) failures.push("Accounting unit finance linkage must require reverse_link");
    if (acctLeaf.route_hint !== "/fleet/units/:id/detail?tab=finance") failures.push("Accounting unit finance linkage route must name the canonical finance tab");
  }
  if (!s.self.split('import fs from "node:fs";')[0].includes(EXACT_HEADER)) failures.push("exact Fleet finance-linkage reverse header missing");
  if (/"guard"\s*:\s*"scripts\/verify-unit-finance-gl-je-reverse\.mjs"/.test(s.feed)) failures.push("manual feed duplicates unit finance-linkage ownership");
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
    ["source-drill", "view", /EntityLink kind="bill" id=\{b\.id\}/, 'EntityLink kind="unit" id={b.id}'],
    ["leaf", "required", /"unit\.detail\.finance_linkage"/, '"unit.detail.finance_linkage_MISSING"'],
    ["reverse", "required", /("id": "unit\.detail\.finance_linkage"[\s\S]{0,300})"reverse_link"/, '$1"reverse_link_MISSING"'],
    ["route", "required", /("id": "unit\.detail\.finance_linkage"[\s\S]{0,200})"\/fleet\/units\/:id\/detail\?tab=finance"/, '$1"/fleet/units/:id"'],
    ["acct-leaf", "requiredAccounting", /"unit\.detail\.finance_linkage"/, '"unit.detail.finance_linkage_MISSING"'],
    // accounting.required.json's leaf carries a much longer "note" field than fleet's between "id"
    // and "reverse_link"/route_hint (~960 chars) — a wider window than the fleet mutations above.
    ["acct-reverse", "requiredAccounting", /("id": "unit\.detail\.finance_linkage"[\s\S]{0,1200})"reverse_link"/, '$1"reverse_link_MISSING"'],
    ["acct-route", "requiredAccounting", /("id": "unit\.detail\.finance_linkage"[\s\S]{0,1100})"\/fleet\/units\/:id\/detail\?tab=finance"/, '$1"/fleet/units/:id"'],
    ["header", "self", EXACT_HEADER, EXACT_HEADER.replace("reverse_link", "connectivity")],
    ["feed", "feed", /\[\s*/, `[\n  {"guard":"scripts/verify-unit-finance-gl-je-reverse.mjs"},`],
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
