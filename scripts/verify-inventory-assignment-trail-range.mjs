#!/usr/bin/env node
/** Inventory assignments connectivity: a capped company trail must disclose its true range. */
import fs from "node:fs";

const FILES = {
  route: "apps/backend/src/maintenance/parts-invoice-links.routes.ts",
  api: "apps/frontend/src/api/maintenance.ts",
  page: "apps/frontend/src/pages/inventory/InventoryAssignmentsPage.tsx",
};
const live = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function failures(source = live) {
  // Scoped to THIS endpoint only: parts-invoice-links.routes.ts has a second, unrelated
  // capped endpoint (unit reverse drill-through) further down the same file that shares the
  // same `COUNT(*) OVER()::int AS total_count` SQL fragment (guarded separately by
  // verify-unit-parts-history-range.mjs). A whole-file `.includes()` for that fragment doesn't
  // distinguish the two, so a mutation removing only this endpoint's copy escapes detection —
  // the second endpoint's untouched copy keeps the file-wide check green. Scope the SQL-fragment
  // check to the text preceding this endpoint's own (unique) return statement.
  const returnIdx = source.route.indexOf("return { rows, total_count: Number(rows[0]?.total_count ?? 0) }");
  const endpointSql = returnIdx === -1 ? "" : source.route.slice(0, returnIdx);
  return [
    ["backend exact total", endpointSql.includes("COUNT(*) OVER()::int AS total_count") && returnIdx !== -1],
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
    ["inventory consumes total", source.page.includes("getPartsAssignmentsPage(companyId)") && source.page.includes("assignmentsQuery.data?.total_count ?? allRows.length")],
    ["visible cap disclosure", source.page.includes("totalCount > allRows.length") && source.page.includes("Showing {allRows.length} of {totalCount} assignments")],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...live, route: live.route.replace("COUNT(*) OVER()::int AS total_count", "500 AS hidden_count") },
    { ...live, api: live.api.replace("apiRequest<PartsAssignmentsResponse>", "apiRequest<{ rows: PartsAssignmentRow[] }>") },
    { ...live, api: live.api.replace("getPartsAssignmentsPage(operatingCompanyId, filters)", "getPartsAssignmentsPage(operatingCompanyId)") },
    { ...live, page: live.page.replace("getPartsAssignmentsPage(companyId)", "listPartsAssignments(companyId)") },
    { ...live, page: live.page.replace("totalCount > allRows.length", "false") },
  ];
  const escaped = mutations.map((source, index) => failures(source).length ? null : index + 1).filter(Boolean);
  if (escaped.length) {
    console.error(`verify-inventory-assignment-trail-range SELFTEST FAIL — mutations ${escaped.join(", ")} stayed green`);
    process.exit(1);
  }
  console.log("verify-inventory-assignment-trail-range SELFTEST PASS — 5/5 mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-inventory-assignment-trail-range FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-inventory-assignment-trail-range PASS — capped inventory assignment trail exposes its exact total");
