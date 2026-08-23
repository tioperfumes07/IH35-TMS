#!/usr/bin/env node
/** @matrix-built {"modules":["fleet","accounting"],"cols":["unit","ap_bill","expense","gl_je","connectivity"],"leaves":["unit.detail.finance_linkage"],"task":"UNIT-FINANCE-LINKAGE-GL-JE","vertical":"column-wave"} */
/** @matrix-built {"modules":["fleet","accounting"],"cols":["reverse_link"],"leaves":["unit.detail.finance_linkage"],"task":"FLEET-F5917-FINANCE-LINKAGE-REVERSE-EXACT","vertical":"class-sweep"} */
// ACCT-F5984 — accounting.required.json carries its own copy of this exact leaf (same id, same
// route_hint, same required columns) but no guard had ever checked THAT module's registry entry —
// only fleet.required.json was verified, so a regression to the accounting-side matrix entry could
// ship silently. Extended to check both registries against the SAME underlying source files (the
// component/service checks below are module-agnostic — there is only one UnitFinanceLinkageTab.tsx).
import fs from "node:fs";
const LABEL = "verify-unit-finance-gl-je-reverse";
const files = {
  service: "apps/backend/src/accounting/bills.service.ts",
  api: "apps/frontend/src/api/accounting.ts",
  view: "apps/frontend/src/pages/units/UnitFinanceLinkageTab.tsx",
  required: "docs/specs/scoreboard/modules/fleet.required.json",
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
  let leaf;
  const visit = (value) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") {
      if (value.id === "unit.detail.finance_linkage" && Array.isArray(value.required)) leaf = value;
      Object.values(value).forEach(visit);
    }
  };
  visit(JSON.parse(s.required));
  if (!leaf) failures.push("Fleet unit finance linkage Required leaf missing");
  else {
    if (!leaf.required.includes("reverse_link")) failures.push("Fleet unit finance linkage must require reverse_link");
    if (leaf.route_hint !== "/fleet/units/:id/detail?tab=finance") failures.push("Fleet unit finance linkage route must name the canonical finance tab");
  }
  let leafAcct;
  const visitAcct = (value) => {
    if (Array.isArray(value)) value.forEach(visitAcct);
    else if (value && typeof value === "object") {
      if (value.id === "unit.detail.finance_linkage" && Array.isArray(value.required)) leafAcct = value;
      Object.values(value).forEach(visitAcct);
    }
  };
  visitAcct(JSON.parse(s.requiredAccounting));
  if (!leafAcct) failures.push("Accounting unit finance linkage Required leaf missing");
  else {
    // Object-level checks (not regex-window text scans) — accounting.required.json's copy of this
    // leaf carries a long descriptive `note` field between `id` and `required`/`route_hint`, so a
    // narrow text-proximity regex would silently pass a broken leaf (known landmine class, see
    // memory: "Regex guard windows too small"). Parsed-object field access has no window to miss.
    if (!leafAcct.required.includes("reverse_link")) failures.push("Accounting unit finance linkage must require reverse_link");
    if (leafAcct.route_hint !== "/fleet/units/:id/detail?tab=finance") failures.push("Accounting unit finance linkage route must name the canonical finance tab");
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
    ["leaf-acct", "requiredAccounting", /"unit\.detail\.finance_linkage"/, '"unit.detail.finance_linkage_MISSING"'],
    // accounting.required.json's copy of this leaf carries a long `note` field (~950 chars) between
    // `id` and `required`/`route_hint` — a {0,300}-style window (the shape that bit this exact
    // guard class before, see memory "Regex guard windows too small") would silently miss the real
    // text and report a false PASS. Widened well past the observed distance.
    // Non-greedy: a greedy {0,1600} window walks PAST this leaf's own required array and matches a
    // LATER, unrelated leaf's "reverse_link"/route_hint instead (dense JSON packs leaves close
    // together) -- the mutation then corrupts the wrong leaf while THIS leaf stays untouched, so
    // audit() finds no failure and the selftest false-fails. Non-greedy stops at the nearest match.
    ["reverse-acct", "requiredAccounting", /("id": "unit\.detail\.finance_linkage"[\s\S]{0,1600}?)"reverse_link"/, '$1"reverse_link_MISSING"'],
    ["route-acct", "requiredAccounting", /("id": "unit\.detail\.finance_linkage"[\s\S]{0,1600}?)"\/fleet\/units\/:id\/detail\?tab=finance"/, '$1"/fleet/units/:id"'],
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
