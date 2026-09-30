#!/usr/bin/env node
/**
 * C-21 / D24–D33 — maintenance shell contracts (ops lane, not CC-1 verify-*).
 * --selftest asserts source anchors; no live DB.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};
const ok = (m) => console.log(`PASS: ${m}`);

const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

function assertIncludes(rel, needles, label) {
  const src = read(rel);
  for (const n of needles) {
    if (!src.includes(n)) fail(`${label}: missing ${JSON.stringify(n)} in ${rel}`);
  }
  ok(label);
}

const selftest = process.argv.includes("--selftest");
if (!selftest) {
  console.log("usage: node scripts/ops/verify-c21-maintenance-shell.mjs --selftest");
  process.exit(0);
}

assertIncludes(
  "apps/frontend/src/pages/maintenance/WorkOrderNewPage.tsx",
  ["Navigate", "create_wo", "/maintenance?"],
  "D24 WorkOrderNewPage redirects to Maintenance modal deep-link",
);

assertIncludes(
  "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx",
  ["create_wo", "createWoDeepLink", "isListTab", "compact={isListTab}"],
  "D24/D32 MaintenanceHome opens modal + strips stacked cards on list tabs",
);

assertIncludes(
  "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx",
  ["bg-[#14314F]", "text-white"],
  "D27 SectionCard dark navy headers with light letters",
);

assertIncludes(
  "apps/frontend/src/pages/maintenance/components/CreateWOSectionRenderV5Header.tsx",
  ["SelectCombobox {...register(\"status\")}", "SelectCombobox {...register(\"wo_priority\")}", "SelectCombobox {...register(\"repaired_by\")}"],
  "D25 header fields are SelectCombobox not bare select",
);

assertIncludes(
  "apps/frontend/src/pages/maintenance/FleetTablePage.tsx",
  ["maint-fleet-status-kpis", "maint-fleet-class-boxes", "Equipment class"],
  "D29/D30 status KPIs + class chips in filter toolbar",
);

assertIncludes(
  "apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx",
  ["work-orders-source-type-multi", "Source type (multi)"],
  "D31 Active WOs source type multi-selector",
);

assertIncludes(
  "apps/frontend/src/components/vehicle-profile/ActionBar.tsx",
  ["create_wo=1&unit_id="],
  "Vehicle ActionBar deep-links to modal",
);

console.log("verify-c21-maintenance-shell --selftest OK");
