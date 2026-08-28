#!/usr/bin/env node
// Guard (GO-LIVE Block 1A regression lock): the units list returns a real server-side `total` on BOTH
// paths (truck-only AND the unified include=trailers path), and the Fleet page uses that total — so the
// pager shows the FULL fleet, never "of 50" (the page size). Regressing to a bare `return { units }`
// (no total) re-hides the rest of the fleet.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const r = (p) => readFileSync(join(root, p), "utf8");

const live = {
  routes: r("apps/backend/src/mdata/units.routes.ts"),
  svc: r("apps/backend/src/mdata/units-unified-list.service.ts"),
  api: r("apps/frontend/src/api/mdata.ts"),
  page: r("apps/frontend/src/pages/maintenance/FleetTablePage.tsx"),
};

function failures(source = live) {
  const misses = [];
  const need = (ok, message) => { if (!ok) misses.push(message); };
  need(!/return \{ units \};/.test(source.routes), "units list must never return a bare page");
  need((source.routes.match(/total: result\.total/g) || []).length >= 2, "truck and unified routes must return exact totals");
  need(/Promise<\{ rows: UnifiedFleetRow\[\]; total: number \}>/.test(source.svc) && /total: merged\.length/.test(source.svc), "unified service must count the full pre-page merge");
  need(/export async function listAllUnits/.test(source.api), "complete unit reader must exist");
  need(/if \(total !== expectedTotal\) throw new Error/.test(source.api), "complete unit reader must reject total drift");
  need(/if \(offset \+ page\.units\.length >= expectedTotal\) return \{ units, total: expectedTotal \}/.test(source.api), "complete unit reader must exhaust the server total");
  need((source.page.match(/await listAllUnits\(/g) || []).length >= 2, "fleet total and filtered rows must use the complete reader");
  need(/totalRowsQuery\.data\?\.total/.test(source.page) && /rowsQuery\.data\?\.total/.test(source.page), "fleet counts must consume complete-reader totals");
  return misses;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    { ...live, routes: live.routes.replaceAll("total: result.total", "total: result.rows.length") },
    { ...live, svc: live.svc.replace("total: merged.length", "total: rows.length") },
    { ...live, api: live.api.replace("export async function listAllUnits", "async function hiddenListAllUnits") },
    { ...live, api: live.api.replace("if (total !== expectedTotal) throw new Error", "if (false) throw new Error") },
    { ...live, api: live.api.replace("if (offset + page.units.length >= expectedTotal) return { units, total: expectedTotal }", "if (page.units.length < limit) return { units, total: units.length }") },
    { ...live, page: live.page.replaceAll("await listAllUnits(", "await listUnits(") },
    { ...live, page: live.page.replace("totalRowsQuery.data?.total", "allRows.length") },
    { ...live, page: live.page.replace("rowsQuery.data?.total", "allRows.length") },
  ];
  const escaped = mutations.map((source, index) => failures(source).length ? null : index + 1).filter(Boolean);
  if (escaped.length) {
    console.error(`verify-units-list-total SELFTEST FAIL — mutations ${escaped.join(", ")} stayed green`);
    process.exit(1);
  }
  console.log(`verify-units-list-total SELFTEST PASS — ${mutations.length}/${mutations.length} mutations red`);
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`FAIL verify-units-list-total: ${missing.join("; ")}`);
  process.exit(1);
}
console.log("PASS verify-units-list-total — fleet uses stable complete-reader totals");
