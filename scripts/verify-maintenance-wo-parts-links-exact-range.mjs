#!/usr/bin/env node
import fs from "node:fs";

let source = fs.readFileSync("apps/frontend/src/components/maintenance/WorkOrderDetailModal.tsx", "utf8");
const api = fs.readFileSync("apps/frontend/src/api/maintenance.ts", "utf8");
const route = fs.readFileSync("apps/backend/src/maintenance/parts-invoice-links.routes.ts", "utf8");

if (process.argv.includes("--selftest")) {
  source = source.replace("total_count ?? 0", "rows.length").replace("work_order_id: workOrderId", "");
}

const checks = [
  ["modal uses canonical ranged API", /getPartsAssignmentsPage/.test(source)],
  ["query is exact work-order scoped", /work_order_id: workOrderId/.test(source)],
  ["query owns limit and offset", /limit: partsPageSize/.test(source) && /offset: partsPage \* partsPageSize/.test(source)],
  ["query key binds company, work order and page", /operatingCompanyId, workOrderId, partsPage/.test(source)],
  ["modal reads canonical exact total", /total_count \?\? 0/.test(source)],
  ["modal renders one exact server pager", /wo-parts-links-server-pager/.test(source) && /of \{partsTotal\}/.test(source)],
  ["pager resets on parent scope", /setPartsPage\(0\).*\[operatingCompanyId, workOrderId\]/s.test(source)],
  ["API forwards work-order filter", /filters\?\.work_order_id.*query\.set\("work_order_id"/s.test(api)],
  ["backend count and page share filters", /COUNT\(\*\)::text AS total_count[\s\S]*WHERE \$\{filters\.join/.test(route) && /WHERE \$\{filters\.join\(" AND "\)\}/.test(route)],
  ["backend excludes voided links", (route.match(/pil\.voided_at IS NULL/g) ?? []).length >= 2],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [label, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
if (process.argv.includes("--selftest")) {
  if (failed.length === 2) {
    console.log("PASS: selftest planted scope and exact-total regressions");
    process.exit(0);
  }
  console.error(`FAIL: selftest expected 2 failures, got ${failed.length}`);
  process.exit(1);
}
if (failed.length) process.exit(1);
console.log(`PASS: ${checks.length}/${checks.length} WO parts-link exact-range checks`);
