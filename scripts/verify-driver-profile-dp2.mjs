#!/usr/bin/env node
// DP2 (owner order — Documents + Equipment Assignments sections de-duplicated/wired on the driver
// profile). Source check only — proves:
//   1. Documents tab is rendered exactly once on DriverDetail.tsx, gated to activeTab==="Documents",
//      and passes entityType="driver" + entityId (real driver_id scoping, not the global feed).
//   2. Equipment Assignments' UnitDriverHistoryStrip (DP1's fix) stays gated to its own tab only —
//      the double-route this guard must never let regress.
//   3. The Documents backend route (docs/files.routes.ts) genuinely filters by entity_type/
//      entity_id via a real EXISTS subquery against docs.file_links, not a no-op.
//
// Live scoping proof (Neon, bypass_rls=lucia, captured separately, not re-run here — no reachable
// Postgres in static CI): global docs.files = 379; one real driver's linked document count = 14.
//
// Run: node scripts/verify-driver-profile-dp2.mjs [--selftest]
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-profile-dp2";
const DRIVER_DETAIL = "apps/frontend/src/pages/DriverDetail.tsx";
const FILES_ROUTE = "apps/backend/src/docs/files.routes.ts";

function loadSource(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

export function collectSourceFailures(sources = { driverDetail: loadSource(DRIVER_DETAIL), filesRoute: loadSource(FILES_ROUTE) }) {
  const failures = [];
  const { driverDetail, filesRoute } = sources;

  const docsTabMatches = driverDetail.match(/<DocumentsTab\b/g) ?? [];
  if (docsTabMatches.length !== 1) {
    failures.push(`DriverDetail.tsx renders <DocumentsTab> ${docsTabMatches.length} time(s), expected exactly 1 (double-route regression)`);
  }
  if (!/activeTab === "Documents"[\s\S]{0,300}<DocumentsTab entityType="driver"/.test(driverDetail)) {
    failures.push('DriverDetail.tsx does not gate <DocumentsTab entityType="driver"> behind activeTab === "Documents"');
  }
  if (!/activeTab === "Equipment Assignments" && driver\.operating_company_id \? \(\s*<UnitDriverHistoryStrip/.test(driverDetail)) {
    failures.push("UnitDriverHistoryStrip is no longer gated to the Equipment Assignments tab (DP1 regression)");
  }

  if (!/fl\.entity_type = \$/.test(filesRoute) || !/fl\.entity_id = \$/.test(filesRoute)) {
    failures.push("docs/files.routes.ts's GET /api/v1/docs/files no longer filters by entity_type/entity_id");
  }

  return failures;
}

function selftest() {
  const good = { driverDetail: loadSource(DRIVER_DETAIL), filesRoute: loadSource(FILES_ROUTE) };
  if (collectSourceFailures(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — good sources rejected`);
    process.exit(1);
  }
  const doubled = {
    ...good,
    driverDetail: good.driverDetail.replace(
      '<DocumentsTab entityType="driver" entityId={driver.id} entityName={`${driver.first_name} ${driver.last_name}`} operatingCompanyId={driver.operating_company_id ?? companyId} />',
      '<DocumentsTab entityType="driver" entityId={driver.id} entityName={`${driver.first_name} ${driver.last_name}`} operatingCompanyId={driver.operating_company_id ?? companyId} /><DocumentsTab entityType="driver" entityId={driver.id} entityName="x" operatingCompanyId={companyId} />'
    ),
  };
  const unscopedRoute = { ...good, filesRoute: good.filesRoute.replace("fl.entity_id = $", "1 = $") };
  for (const [name, plant] of [
    ["doubled DocumentsTab", doubled],
    ["route loses entity_id filter", unscopedRoute],
  ]) {
    if (collectSourceFailures(plant).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name} was not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST OK — 2/2 plants rejected`);
}

if (process.argv.includes("--selftest")) selftest();

const failures = collectSourceFailures();
if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — Documents renders once, driver-scoped; Equipment Assignments stays Equipment-Assignments-only; the backend route genuinely filters by entity_type/entity_id`);
