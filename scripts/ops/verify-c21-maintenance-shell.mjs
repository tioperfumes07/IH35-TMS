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

// LEAD 443.99 class B (2026-10-12) — D24.
//   old rule: WorkOrderNewPage <Navigate>s to /maintenance?create_wo=… (redirect to the Home modal deep link).
//   new rule: WorkOrderNewPage MOUNTS the one CreateWorkOrderModal (open) with unit_id / equipment_id prefilled and
//             returns to /maintenance on close/create; it must not redirect.
//   why: ROUND 441.22 (#25952, 72b91d7b3e) — unit/trailer Create-WO links target this retained route, and the
//        redirect dropped the operator on Home before the modal opened. Same canonical modal, now prefilled.
//        A full-page form or a redirect still fails.
{
  const rel = "apps/frontend/src/pages/maintenance/WorkOrderNewPage.tsx";
  assertIncludes(
    rel,
    ["<CreateWorkOrderModal", "open\n", "initialValues={{ unit_id: unitId, equipment_id: equipmentId }}", 'navigate("/maintenance", { replace: true })'],
    "D24 WorkOrderNewPage mounts the canonical CreateWorkOrderModal with unit/equipment prefill",
  );
  if (/<Navigate\b/.test(read(rel))) fail(`D24 WorkOrderNewPage must mount the modal, not <Navigate> away: ${rel}`);
}

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

// 443.99 (same ROUND 441.22 / #25952 change): the vehicle ActionBar links the canonical creator route with the unit
// prefilled (old anchor: the /maintenance?create_wo=1&unit_id= redirect URL). Still fails if the link loses the unit.
assertIncludes(
  "apps/frontend/src/components/vehicle-profile/ActionBar.tsx",
  ["/maintenance/work-orders/new?unit_id=${encodeURIComponent(unitId)}"],
  "Vehicle ActionBar deep-links to the Create WO modal route with the unit prefilled",
);

console.log("verify-c21-maintenance-shell --selftest OK");
