#!/usr/bin/env node
/** FLT-F6321 — Unit parts history must preserve exact unit context through the assignment reverse drill. */
import fs from "node:fs";

const files = {
  section: fs.readFileSync("apps/frontend/src/components/vehicle-profile/UnitPartsHistorySection.tsx", "utf8"),
  page: fs.readFileSync("apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/maintenance.ts", "utf8"),
  route: fs.readFileSync("apps/backend/src/maintenance/parts-invoice-links.routes.ts", "utf8"),
};

function audit(source) {
  const failures = [];
  const need = (condition, message) => { if (!condition) failures.push(message); };
  need(/inventory\/assignments\?unit_id=\$\{encodeURIComponent\(unitId\)\}/.test(source.section), "unit reverse link must carry encoded unit_id");
  need(/useSearchParams\(\)/.test(source.page) && /searchParams\.get\("unit_id"\)/.test(source.page), "assignment page must read exact unit_id");
  need(/parts-assignments", companyId, unitId/.test(source.page), "query cache must vary by unit_id");
  need(/unitId \? \{ unit_id: unitId \}/.test(source.page), "page must forward unit_id to API client");
  need(/filters\?: \{ vendor_id\?: string; work_order_id\?: string; unit_id\?: string \}/.test(source.api), "API client filter contract must include unit_id");
  need(/query\.set\("unit_id", filters\.unit_id\)/.test(source.api), "API client must serialize unit_id");
  need(/unit_id: z\.string\(\)\.uuid\(\)\.optional\(\)/.test(source.route), "backend must validate unit_id as UUID");
  need(/filters\.push\(`wo\.unit_id = \$\$\{values\.length\}::uuid`\)/.test(source.route), "backend query must scope by WO unit_id");
  return failures;
}

const failures = audit(files);
if (failures.length) {
  console.error(`verify-fleet-unit-assignments-filter FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...files, section: files.section.replace("?unit_id=${encodeURIComponent(unitId)}", "") },
    { ...files, page: files.page.replace('searchParams.get("unit_id")', 'searchParams.get("vendor_id")') },
    { ...files, page: files.page.replace('"parts-assignments", companyId, unitId', '"parts-assignments", companyId') },
    { ...files, api: files.api.replace('query.set("unit_id", filters.unit_id)', 'query.set("vendor_id", filters.unit_id)') },
    { ...files, route: files.route.replace('unit_id: z.string().uuid().optional(),', '') },
    { ...files, route: files.route.replace('filters.push(`wo.unit_id = $${values.length}::uuid`);', 'filters.push(`wo.id = $${values.length}::uuid`);') },
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (audit(mutation).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-fleet-unit-assignments-filter SELFTEST PASS — ${mutations.length} mutations detected`);
}

console.log("verify-fleet-unit-assignments-filter PASS — unit reverse drill is exact and backend-scoped");
