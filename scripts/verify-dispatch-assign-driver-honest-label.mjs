#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["driver","connectivity"],"leafRe":"^dispatch\\.parity\\.assign_driver_dropdown$","task":"DISPATCH-ASSIGN-DRIVER-PICKER-RAW-UUID-FALLBACK","vertical":"class-sweep"} */

import fs from "node:fs";

const LABEL = "verify-dispatch-assign-driver-honest-label";
const FILE = "apps/frontend/src/pages/dispatch/AssignDriverDropdown.tsx";
const source = fs.readFileSync(FILE, "utf8");

function failures(candidate) {
  const found = [];
  if (!candidate.includes('import { entityLabel } from "../../lib/entity-label"')) found.push("shared entityLabel import is missing");
  if (!/listAllDrivers\(\{ operating_company_id: operatingCompanyId, status: "Active" \}\)/.test(candidate)) found.push("pre-create roster is not exhaustively company scoped");
  if (!/display_name:\s*entityLabel\(\[d\.first_name, d\.last_name\]\.filter\(Boolean\)\.join\(" "\)\.trim\(\), d\.id, "Driver"\)/.test(candidate)) found.push("pre-create roster does not use an honest human driver label");
  if (/display_name:[^\n]*\|\|\s*d\.id/.test(candidate)) found.push("raw driver UUID remains a visible fallback");
  if (!/value:\s*d\.driver_id/.test(candidate) || !/onChange\(pendingUnsafe\.driver_id\)/.test(candidate)) found.push("canonical driver FK no longer reaches picker selection");
  if (!/^\s*hos_safe:\s*false/m.test(candidate) || /^\s*hos_safe:\s*true/m.test(candidate)) found.push("pre-create or newly-created roster invents HOS clearance");
  if (!/<CreateDriverModal[\s\S]*?companyId=\{operatingCompanyId\}[\s\S]*?onCreated=\{\(createdId, displayName\) =>[\s\S]*?display_name: displayName[\s\S]*?onChange\(createdId\)/.test(candidate)) found.push("nested driver creator no longer returns and selects its canonical row with a human label");
  return found;
}

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  const mutations = [
    ['import { entityLabel } from "../../lib/entity-label";', "", "honest-label import"],
    ['listAllDrivers({ operating_company_id: operatingCompanyId, status: "Active" })', 'listAllDrivers({ status: "Active" })', "company scope"],
    ['entityLabel([d.first_name, d.last_name].filter(Boolean).join(" ").trim(), d.id, "Driver")', '[d.first_name, d.last_name].filter(Boolean).join(" ").trim() || d.id', "raw UUID fallback"],
    ["value: d.driver_id", "value: d.display_name", "canonical FK option value"],
    ["onChange(pendingUnsafe.driver_id)", "onChange(pendingUnsafe.display_name)", "canonical FK unsafe confirmation"],
    ["hos_safe: false", "hos_safe: true", "honest HOS unknown state"],
    ["display_name: displayName", "display_name: createdId", "created human label"],
    ["onChange(createdId)", "onChange(displayName)", "created canonical FK"],
  ];
  const escaped = [];
  for (const [needle, replacement, name] of mutations) {
    if (!source.includes(needle)) { escaped.push(`mutation anchor missing: ${name}`); continue; }
    const mutant = source.replace(needle, replacement);
    if (failures(mutant).length === 0) escaped.push(`planted defect escaped: ${name}`);
  }
  if (escaped.length) { console.error(`${LABEL} SELFTEST FAIL\n${escaped.join("\n")}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const missing = failures(source);
if (missing.length) { console.error(`${LABEL} FAIL\n${missing.join("\n")}`); process.exit(1); }
console.log(`${LABEL} PASS — Dispatch assign-driver picker preserves company scope, human labels, canonical FKs, and honest HOS state`);
