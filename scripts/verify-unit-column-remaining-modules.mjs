#!/usr/bin/env node
/** @matrix-built {"modules":["fuel"],"cols":["unit"],"leafRe":"^(card_overage|history|fuel\\.modal\\.create_fuel_transaction)$","task":"LINK-F5167-FUEL-UNIT-WIRING"} */
/** @matrix-built {"modules":["driver-hub"],"cols":["unit"],"leafRe":"^(tab\\.scheduler|hop\\.safety_scheduler)$","task":"LINK-F5167-DRIVERHUB-UNIT-WIRING"} */
/** @matrix-built {"modules":["inventory"],"cols":["unit"],"leafRe":"^assignments\\.(trail|unit_link)$","task":"LINK-F5167-INVENTORY-UNIT-WIRING"} */
/** @matrix-built {"modules":["legal"],"cols":["unit"],"leafRe":"^matters\\.(create|detail)$","task":"LINK-F5167-LEGAL-UNIT-WIRING"} */
/** @matrix-built {"modules":["customers"],"cols":["unit"],"leafRe":"^detail\\.loads$","task":"LINK-F5167-CUSTOMERS-UNIT-WIRING"} */
/** @matrix-built {"modules":["drivers"],"cols":["unit"],"leafRe":"^profiles\\.detail$","task":"LINK-F5167-DRIVERS-UNIT-WIRING"} */
/** @matrix-built {"modules":["factoring"],"cols":["unit"],"leafRe":"^home\\.equipment_loans$","task":"LINK-F5167-FACTORING-UNIT-WIRING"} */
/** @matrix-built {"modules":["home"],"cols":["unit"],"leafRe":"^role\\.dispatcher$","task":"LINK-F5167-HOME-UNIT-WIRING"} */
/** @matrix-built {"modules":["system"],"cols":["unit"],"leafRe":"^audit\\.trail$","task":"LINK-F5167-SYSTEM-UNIT-WIRING"} */
/**
 * OWNER-EXECUTION-PLAN vertical unit-column sweep (2026-08-14): 14 genuine leaves across the 9
 * remaining small unit-column modules, each confirmed live — a real unit_id/EntityLink kind="unit"
 * or EntityPicker kind="unit", sourced from mdata.units.
 *
 * Self-test: node scripts/verify-unit-column-remaining-modules.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-unit-column-remaining-modules";

const CHECKS = [
  // fuel: card_overage, history, fuel.modal.create_fuel_transaction
  ["apps/frontend/src/pages/fuel/card-overage/CardOverageQueuePage.tsx", /kind="unit" id=\{row\.unit_id \?\? undefined\}/],
  ["apps/frontend/src/pages/fuel/FuelPlannerHome.tsx", /const deepLinkUnitId = searchParams\.get\("unit_id"\);/],
  ["apps/frontend/src/pages/fuel/FuelTransactionsTable.tsx", /kind="unit" id=\{row\.unit_id\}/],
  ["apps/frontend/src/pages/fuel/components/CreateFuelTransactionModal.tsx", /unit_id: unitId \|\| undefined/],
  // driver-hub: tab.scheduler, hop.safety_scheduler
  ["apps/frontend/src/pages/home/DriverHubPage.tsx", /\{tab === "scheduler" && <DriverSchedulerGridPage \/>\}/],
  ["apps/frontend/src/pages/home/DriverHubPage.tsx", /\{ label: "Safety Scheduler", to: "\/safety\/driver-scheduler" \}/],
  ["apps/frontend/src/pages/safety/driver-scheduler/DriverSchedulerGridPage.tsx", /const unitId = useSearchParams\(\)\[0\]\.get\("unit_id"\) \?\? undefined;/],
  // inventory: assignments.trail, assignments.unit_link
  ["apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx", /kind="unit" id=\{row\.unit_id\}/],
  ["apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx", /kind="work_order"/],
  // legal: matters.create, matters.detail
  ["apps/frontend/src/pages/legal/matters/LegalMatterFormFields.tsx", /kind="unit"/],
  ["apps/frontend/src/pages/legal/matters/LegalMatterDetailPage.tsx", /kind="unit"[\s\S]{0,40}id=\{String\(matter\.unit_id\)\}/],
  // customers: detail.loads
  ["apps/frontend/src/pages/CustomerDetail.tsx", /kind="unit"[\s\S]{0,40}id=\{load\.assigned_unit_id\}/],
  // drivers: profiles.detail
  ["apps/frontend/src/components/driver-profile/CurrentAssignmentSection.tsx", /kind="unit"[\s\S]{0,40}id=\{String\(cur\.unit_id\)\}/],
  // factoring: home.equipment_loans
  ["apps/frontend/src/pages/factoring/FactoringHome.tsx", /tab === "equipment_loans"[\s\S]{0,400}kind="unit"/],
  // home: role.dispatcher
  ["apps/frontend/src/components/home/DispatcherActiveLoadsPanel.tsx", /kind="unit" id=\{row\.unit_id\}/],
  // system: audit.trail
  ["apps/frontend/src/pages/audit/AuditTrailPage.tsx", /unit: "unit",/],
  // CC-2 GUARD 2026-08-19: re-anchored — the subject-kind resolver now prefers a real
  // row.subject_kind column over row.subject_type (more robust source resolution), rendered via
  // EntityLinkOrTombstone honesty wrapper instead of a bare EntityLink.
  ["apps/frontend/src/pages/audit/AuditTrailPage.tsx", /const subjectKind = row\.subject_kind \?\? row\.subject_type;\s*\n\s*const kind = subjectKind \? SUBJECT_ENTITY_KINDS\[subjectKind\] : undefined;/],
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
      console.error(`${LABEL} SELFTEST FAIL — ${file}: pattern did not match source, re-anchor (${pattern})`);
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
console.log(`${LABEL} PASS — 14 unit-scoped leaves across fuel/driver-hub/inventory/legal/customers/drivers/factoring/home/system are real`);
