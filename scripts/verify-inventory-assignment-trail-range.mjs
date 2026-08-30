#!/usr/bin/env node
/** Inventory assignments connectivity: a server-paged company trail must disclose its true range. */
import fs from "node:fs";

const FILES = {
  route: "apps/backend/src/maintenance/parts-invoice-links.routes.ts",
  api: "apps/frontend/src/api/maintenance.ts",
  page: "apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx",
};
const live = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function failures(source = live) {
  const routeStart = source.route.indexOf('"/api/v1/maintenance/parts-invoice-links"');
  const routeEnd = source.route.indexOf('"/api/v1/maintenance/units/:unitId/parts-history"', routeStart + 1);
  const endpointSql = routeStart === -1 ? "" : source.route.slice(routeStart, routeEnd === -1 ? undefined : routeEnd);
  return [
    ["backend exact total", endpointSql.includes("SELECT COUNT(*)::text AS total_count") && endpointSql.includes("total_count: rows.totalCount")],
    ["backend server page", endpointSql.includes("LIMIT $${values.length + 1}") && endpointSql.includes("OFFSET $${values.length + 2}")],
    ["typed page response", source.api.includes("export type PartsAssignmentsResponse") && (() => {
      // Same file-wide-.includes() trap as the route check above: maintenance.ts's sibling
      // getUnitPartsHistoryPage also legitimately calls apiRequest<PartsAssignmentsResponse>
      // (guarded separately by verify-unit-parts-history-range.mjs), so scope to just this
      // function's body — from its declaration to the next export.
      const start = source.api.indexOf("export function getPartsAssignmentsPage");
      if (start === -1) return false;
      const nextExport = source.api.indexOf("export function", start + 1);
      const body = source.api.slice(start, nextExport === -1 ? undefined : nextExport);
      return body.includes("apiRequest<PartsAssignmentsResponse>");
    })()],
    ["legacy filtered consumers preserved", source.api.includes("return getPartsAssignmentsPage(operatingCompanyId, filters).then((result) => result.rows)")],
    ["inventory requests page", source.page.includes("getPartsAssignmentsPage(companyId, {") && source.page.includes("offset: page * PAGE_SIZE")],
    ["inventory consumes total", source.page.includes("assignmentsQuery.data?.total_count ?? allRows.length")],
    ["visible exact range", source.page.includes("page * PAGE_SIZE + 1") && source.page.includes("Math.min((page + 1) * PAGE_SIZE, totalCount)") && source.page.includes("of {totalCount} assignments")],
    ["server pager controls", source.page.includes("setPage((v) => Math.max(0, v - 1))") && source.page.includes("setPage((v) => v + 1)") && source.page.includes("(page + 1) * PAGE_SIZE >= totalCount")],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...live, route: live.route.replace("SELECT COUNT(*)::text AS total_count", "SELECT 500::text AS hidden_count") },
    { ...live, route: live.route.replace("OFFSET $${values.length + 2}", "OFFSET 0") },
    { ...live, api: live.api.replace("apiRequest<PartsAssignmentsResponse>", "apiRequest<{ rows: PartsAssignmentRow[] }>") },
    { ...live, api: live.api.replace("getPartsAssignmentsPage(operatingCompanyId, filters)", "getPartsAssignmentsPage(operatingCompanyId)") },
    { ...live, page: live.page.replace("offset: page * PAGE_SIZE", "offset: 0") },
    { ...live, page: live.page.replace("page * PAGE_SIZE + 1", "1") },
    { ...live, page: live.page.replace("setPage((v) => v + 1)", "setPage(0)") },
  ];
  const escaped = mutations.map((source, index) => failures(source).length ? null : index + 1).filter(Boolean);
  if (escaped.length) {
    console.error(`verify-inventory-assignment-trail-range SELFTEST FAIL — mutations ${escaped.join(", ")} stayed green`);
    process.exit(1);
  }
  console.log(`verify-inventory-assignment-trail-range SELFTEST PASS — ${mutations.length}/${mutations.length} mutations red`);
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-inventory-assignment-trail-range FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-inventory-assignment-trail-range PASS — server-paged inventory assignment trail exposes its exact total and range");
