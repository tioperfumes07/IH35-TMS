#!/usr/bin/env node
/** @matrix-built {"modules":["compliance"],"cols":["unit"],"leafRe":"^(tab\\.(overview|hos_tracker)|overview\\.credentials_table|fleet\\.hos_board|property_tax\\.detail|form2290)$","task":"LINK-F5167-COMPLIANCE-UNIT-WIRING"} */
/**
 * OWNER-EXECUTION-PLAN vertical unit-column sweep (2026-08-14): 6 genuine compliance leaves.
 * tab.overview/overview.credentials_table share ComplianceTable.tsx's real ownerEntityKind()
 * dynamic-kind EntityLink (owner_type "unit"/"unit_plate" -> kind="unit"). tab.hos_tracker and
 * fleet.hos_board are real unit_id + EntityLink kind="unit" rows. property_tax.detail and form2290
 * are real unit_id-scoped filing rows.
 *
 * Self-test: node scripts/verify-compliance-unit-wiring.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-compliance-unit-wiring";

const CHECKS = [
  ["apps/frontend/src/components/compliance/ComplianceTable.tsx", /case "unit":\s*\n\s*case "unit_plate":\s*\n\s*return "unit"/],
  ["apps/frontend/src/components/compliance/ComplianceTable.tsx", /<EntityLink kind=\{kind\} id=\{row\.owner_id\} label=\{label\} \/>/],
  ["apps/frontend/src/pages/compliance/HosTrackerSection.tsx", /kind="unit" id=\{driver\.unit_id\}/],
  ["apps/frontend/src/pages/compliance/FleetHosBoardSection.tsx", /kind="unit" id=\{row\.unit_id\}/],
  ["apps/frontend/src/pages/compliance/PropertyTaxRenditionPage.tsx", /kind="unit" id=\{l\.unit_id\}/],
  ["apps/frontend/src/pages/compliance/Form2290Filings.tsx", /kind="unit" id=\{u\.unit_id\}/],
];

export function audit(files) {
  const failures = [];
  for (const [file, pattern] of CHECKS) {
    if (!pattern.test(files[file] || "")) failures.push(`${file}: missing real unit_id/EntityLink kind="unit" wiring`);
  }
  return failures;
}

function loadFiles(root) {
  const uniqueFiles = [...new Set(CHECKS.map(([f]) => f))];
  return Object.fromEntries(uniqueFiles.map((f) => [f, fs.readFileSync(path.join(root, f), "utf8")]));
}

if (process.argv.includes("--selftest")) {
  const good = loadFiles(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  let caught = 0;
  for (const [file, pattern] of CHECKS) {
    const mutated = { ...good, [file]: good[file].replace(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g"), "REMOVED") };
    if (mutated[file] === good[file]) {
      console.error(`${LABEL} SELFTEST FAIL — ${file}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${file}: mutation escaped`);
      process.exit(1);
    }
    caught++;
  }
  console.log(`${LABEL} SELFTEST PASS — ${caught} mutations detected`);
  process.exit(0);
}

const failures = audit(loadFiles(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — compliance's 6 unit-scoped overview/hos/property-tax/2290 leaves are real`);
