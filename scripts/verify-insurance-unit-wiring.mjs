#!/usr/bin/env node
/** @matrix-built {"modules":["insurance"],"cols":["unit"],"leafRe":"^(policies\\.create|policies\\.detail|coverage_gaps|claims\\.(list|create)|insurance\\.modal\\.(claim_create|policy_create)|insurance\\.wizard\\.policy_create|insurance\\.parity\\.(claim_create|policy_create))$","task":"LINK-F5167-INSURANCE-UNIT-WIRING"} */
/**
 * OWNER-EXECUTION-PLAN vertical unit-column sweep (2026-08-14): 10 genuine insurance leaves —
 * PolicyDetail's real "Units Assigned" table, CoverageGapDashboard's real mismatch/gap rows,
 * ClaimsTab's tombstone-safe canonical unit column, and the real unit multi-select
 * checkbox/EntityPicker present in
 * both create surfaces (modal + wizard, for both policies and claims). policies.list was corrected
 * OUT of this column — see insurance.required.json honesty_audit["unit_column_2026_08_14_overclaim"].
 *
 * Self-test: node scripts/verify-insurance-unit-wiring.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-insurance-unit-wiring";

const CHECKS = [
  ["apps/frontend/src/pages/insurance/PolicyDetail.tsx", /kind="unit"[\s\S]{0,40}id=\{unitId\}/],
  ["apps/frontend/src/pages/insurance/CoverageGapDashboard.tsx", /kind="unit" id=\{row\.unit_id\}/],
  ["apps/frontend/src/pages/insurance/CoverageGapDashboard.tsx", /dataTestId="coverage-gap-filter-unit"/],
  ["apps/frontend/src/pages/insurance/CoverageGapDashboard.tsx", /<CollapsedListFilters[\s\S]{0,500}onApply=\{stagedFilters\.apply\}[\s\S]{0,500}onReset=\{stagedFilters\.reset\}[\s\S]{0,500}onCancel=\{stagedFilters\.cancel\}/],
  ["apps/frontend/src/pages/insurance/CoverageGapDashboard.tsx", /value=\{stagedFilters\.draft\.unitId \|\| null\}/],
  ["apps/frontend/src/pages/insurance/CoverageGapDashboard.tsx", /onApply:\s*\(next\)\s*=>\s*setUnitFilter\(next\.unitId\)/],
  ["apps/frontend/src/pages/insurance/ClaimsTab.tsx", /<EntityLinkOrTombstone kind="unit" id=\{claim\.unit_id\} name=\{claim\.unit_display_id\} noun="Unit" \/>/],
  ["apps/frontend/src/components/insurance/ClaimCreateModal.tsx", /kind="unit"/],
  ["apps/frontend/src/components/insurance/PolicyCreateModal.tsx", /<EntityPicker[\s\S]{0,180}kind="unit"/],
  ["apps/frontend/src/components/insurance/PolicyCreateModal.tsx", /unitIds:\s*selectedUnits\.map\(\(unit\) => unit\.value\)/],
  ["apps/frontend/src/components/insurance/PolicyCreateWizard.tsx", /<EntityPicker[\s\S]{0,180}kind="unit"/],
  ["apps/frontend/src/components/insurance/PolicyCreateWizard.tsx", /unit_ids:\s*selectedUnits\.map\(\(unit\) => unit\.value\)/],
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
console.log(`${LABEL} PASS — insurance's 10 unit-scoped policy/claim/coverage-gap leaves are real`);
