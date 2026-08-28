#!/usr/bin/env node
/** Unit parts-history reverse connectivity must disclose its server cap. */
import fs from "node:fs";

const live = {
  route: fs.readFileSync("apps/backend/src/maintenance/parts-invoice-links.routes.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/maintenance.ts", "utf8"),
  section: fs.readFileSync("apps/frontend/src/components/vehicle-profile/UnitPartsHistorySection.tsx", "utf8"),
};

function failures(source = live) {
  const unitRoute = source.route.slice(
    source.route.indexOf('"/api/v1/maintenance/units/:unitId/parts-history"'),
    source.route.indexOf('app.post("/api/v1/maintenance/work-orders/:id/parts-invoice-links"'),
  );
  return [
    ["unit query exact scoped total", unitRoute.includes("SELECT COUNT(*)::text AS total_count") && unitRoute.includes("wo.unit_id = $2::uuid") && unitRoute.includes("pil.voided_at IS NULL")],
    ["unit query exact page", unitRoute.includes("LIMIT $3 OFFSET $4") && unitRoute.includes("query.data.limit, query.data.offset")],
    ["unit route returns range", unitRoute.includes("return { rows: rows.rows, total_count: rows.total_count, limit: query.data.limit, offset: query.data.offset }")],
    ["typed unit page client", source.api.includes("export function getUnitPartsHistoryPage") && source.api.includes("apiRequest<PartsAssignmentsResponse>")],
    ["row-only compatibility", source.api.includes("getUnitPartsHistoryPage(unitId, operatingCompanyId).then((result) => result.rows)")],
    ["profile requests exact range", source.section.includes("getUnitPartsHistoryPage(unitId, companyId, { limit: PAGE_SIZE, offset: page * PAGE_SIZE })")],
    ["profile consumes page response", source.section.includes("partsQuery.data?.total_count ?? rows.length")],
    ["profile discloses exact range", source.section.includes("page * PAGE_SIZE + 1") && source.section.includes("Math.min((page + 1) * PAGE_SIZE, totalCount)")],
    ["profile pages exact range", source.section.includes("totalCount > PAGE_SIZE") && source.section.includes("setPage((v) => v + 1)")],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...live, route: live.route.replaceAll("SELECT COUNT(*)::text AS total_count", "SELECT 500::text AS hidden_count") },
    { ...live, route: live.route.replace("LIMIT $3 OFFSET $4", "LIMIT 20") },
    { ...live, route: live.route.replace("return { rows: rows.rows, total_count: rows.total_count, limit: query.data.limit, offset: query.data.offset }", "return { rows: rows.rows }") },
    { ...live, api: live.api.replace("export function getUnitPartsHistoryPage", "function hiddenUnitPartsHistoryPage") },
    { ...live, api: live.api.replace("getUnitPartsHistoryPage(unitId, operatingCompanyId).then((result) => result.rows)", "Promise.resolve([])") },
    { ...live, section: live.section.replace("getUnitPartsHistoryPage(unitId, companyId, { limit: PAGE_SIZE, offset: page * PAGE_SIZE })", "getUnitPartsHistoryPage(unitId, companyId)") },
    { ...live, section: live.section.replace("partsQuery.data?.total_count ?? rows.length", "rows.length") },
    { ...live, section: live.section.replace("Math.min((page + 1) * PAGE_SIZE, totalCount)", "rows.length") },
    { ...live, section: live.section.replace("totalCount > PAGE_SIZE", "false") },
  ];
  const escaped = mutations.map((source, index) => failures(source).length ? null : index + 1).filter(Boolean);
  if (escaped.length) {
    console.error(`verify-unit-parts-history-range SELFTEST FAIL — mutations ${escaped.join(", ")} stayed green`);
    process.exit(1);
  }
  console.log(`verify-unit-parts-history-range SELFTEST PASS — ${mutations.length}/${mutations.length} mutations red`);
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-unit-parts-history-range FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-unit-parts-history-range PASS — unit reverse history exposes its exact capped range");
