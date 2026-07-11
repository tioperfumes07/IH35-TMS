#!/usr/bin/env node
/**
 * verify-filter-input-aria-labels.mjs  (TIER-3 batch — a11y, block 0243-g8-4)
 *
 * Primary list-page filter/search controls were placeholder-only: a placeholder
 * is NOT an accessible name, so screen-reader users hit an unlabeled edit box.
 * This batch added an `aria-label` to each. This guard FAILS CI if any of those
 * controls loses its accessible name again (regression), by asserting that each
 * known filter placeholder co-occurs with an `aria-label` within a small window
 * of the same input element.
 *
 * Usage:
 *   node scripts/verify-filter-input-aria-labels.mjs
 *   node scripts/verify-filter-input-aria-labels.mjs --selftest  # must FAIL
 */
import fs from "node:fs";
import process from "node:process";

const repoRoot = process.cwd();

// (relative file, placeholder substring that identifies the filter control)
const TARGETS = [
  ["apps/frontend/src/pages/accounting/ReceiptsPage.tsx", "Search filename, notes"],
  ["apps/frontend/src/pages/accounting/IntegrationTransactionsPage.tsx", "Search description, QBO ID"],
  ["apps/frontend/src/pages/reports/ReportsHub.tsx", "Search reports"],
  ["apps/frontend/src/pages/maintenance/vehicles/VehiclesMasterDataPage.tsx", "Search vehicles"],
  ["apps/frontend/src/pages/maintenance/vendors/VendorsPage.tsx", "Search vendors"],
  ["apps/frontend/src/pages/legal/templates/LegalTemplatesListPage.tsx", "Search code or display name"],
  ["apps/frontend/src/pages/legal/contracts/LegalContractInstancesPage.tsx", "Search signer or template code"],
  ["apps/frontend/src/pages/vendors/VendorListSidebar.tsx", "Search by name or details"],
];

const WINDOW = 6; // lines around the placeholder line that count as the same input

function hasAdjacentAriaLabel(lines, idx) {
  const start = Math.max(0, idx - WINDOW);
  const end = Math.min(lines.length, idx + WINDOW + 1);
  for (let i = start; i < end; i++) {
    if (lines[i].includes("aria-label")) return true;
  }
  return false;
}

const failures = [];
for (const [rel, placeholder] of TARGETS) {
  const abs = `${repoRoot}/${rel}`;
  let src;
  try {
    src = fs.readFileSync(abs, "utf8");
  } catch {
    failures.push(`${rel}: file missing (expected filter control "${placeholder}")`);
    continue;
  }
  const lines = src.split("\n");
  const idx = lines.findIndex((l) => l.includes(placeholder));
  if (idx === -1) {
    // Placeholder text changed — surface it rather than silently pass.
    failures.push(`${rel}: filter placeholder "${placeholder}" not found (update guard if intentionally renamed)`);
    continue;
  }
  if (!hasAdjacentAriaLabel(lines, idx)) {
    failures.push(`${rel}: filter control "${placeholder}" has no adjacent aria-label (accessible name lost)`);
  }
}

if (process.argv.includes("--selftest")) {
  if (failures.length > 0) {
    console.error("SELFTEST should have passed on current tree but found:", failures);
    process.exit(1);
  }
  console.log("verify-filter-input-aria-labels: selftest OK (current tree passes)");
  process.exit(0);
}

if (failures.length > 0) {
  console.error("verify-filter-input-aria-labels FAILED:");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log(`verify-filter-input-aria-labels OK — ${TARGETS.length} filter controls have accessible names.`);
process.exit(0);
