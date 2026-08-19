#!/usr/bin/env node
/** Unit parts-history reverse connectivity must disclose its server cap. */
import fs from "node:fs";

const live = {
  route: fs.readFileSync("apps/backend/src/maintenance/parts-invoice-links.routes.ts", "utf8"),
  api: fs.readFileSync("apps/frontend/src/api/maintenance.ts", "utf8"),
  section: fs.readFileSync("apps/frontend/src/components/vehicle-profile/UnitPartsHistorySection.tsx", "utf8"),
};

function failures(source = live) {
  return [
    ["unit query exact total", source.route.includes("COUNT(*) OVER()::int AS total_count") && source.route.includes("total_count: Number(res.rows[0]?.total_count ?? 0)")],
    ["unit route returns total", source.route.includes("return { rows: rows.rows, total_count: rows.total_count }")],
    ["typed unit page client", source.api.includes("export function getUnitPartsHistoryPage") && source.api.includes("apiRequest<PartsAssignmentsResponse>")],
    ["row-only compatibility", source.api.includes("getUnitPartsHistoryPage(unitId, operatingCompanyId).then((result) => result.rows)")],
    ["profile consumes page response", source.section.includes("getUnitPartsHistoryPage(unitId, companyId)") && source.section.includes("partsQuery.data?.total_count ?? rows.length")],
    ["profile cap disclosure", source.section.includes("totalCount > rows.length") && source.section.includes("Showing {rows.length} of {totalCount} parts assignments")],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...live, route: live.route.replaceAll("COUNT(*) OVER()::int AS total_count", "500 AS hidden_count") },
    { ...live, route: live.route.replace("return { rows: rows.rows, total_count: rows.total_count }", "return { rows: rows.rows }") },
    { ...live, api: live.api.replace("export function getUnitPartsHistoryPage", "function hiddenUnitPartsHistoryPage") },
    { ...live, api: live.api.replace("getUnitPartsHistoryPage(unitId, operatingCompanyId).then((result) => result.rows)", "Promise.resolve([])") },
    { ...live, section: live.section.replace("getUnitPartsHistoryPage(unitId, companyId)", "listUnitPartsHistory(unitId, companyId)") },
    { ...live, section: live.section.replace("totalCount > rows.length", "false") },
  ];
  const escaped = mutations.map((source, index) => failures(source).length ? null : index + 1).filter(Boolean);
  if (escaped.length) {
    console.error(`verify-unit-parts-history-range SELFTEST FAIL — mutations ${escaped.join(", ")} stayed green`);
    process.exit(1);
  }
  console.log("verify-unit-parts-history-range SELFTEST PASS — 6/6 mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-unit-parts-history-range FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-unit-parts-history-range PASS — unit reverse history exposes its exact capped range");
