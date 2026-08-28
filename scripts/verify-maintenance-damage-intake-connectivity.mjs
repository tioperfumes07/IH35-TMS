#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["connectivity"],"leafRe":"^damage_reports\.intake$","task":"VERTICAL-CONNECTIVITY-MAINTENANCE-DAMAGE-INTAKE"} */
import fs from "node:fs";

const required = fs.readFileSync("docs/specs/scoreboard/modules/maintenance.required.json", "utf8");
const home = fs.readFileSync("apps/frontend/src/pages/maintenance/MaintenanceHome.tsx", "utf8");
const modal = fs.readFileSync("apps/frontend/src/pages/maintenance/components/TriageModal.tsx", "utf8");
const api = fs.readFileSync("apps/frontend/src/api/maintenance.ts", "utf8");
const routes = fs.readFileSync("apps/backend/src/maintenance/triage.routes.ts", "utf8");

function failures(routeSource = routes) {
  const auditCarriesCompany = (event) => {
    const eventIndex = routeSource.indexOf(`\"${event}\"`);
    return eventIndex >= 0 && routeSource.slice(eventIndex, eventIndex + 420).includes("operating_company_id:");
  };
  return [
    ["embedded inventory", required.includes('"id": "damage_reports.intake"') && required.includes('"route_hint": "surface://pages/maintenance/components/TriageModal.tsx"')],
    ["mounted triage", home.includes("<TriageModal")],
    ["dual actions", modal.includes("onConvertToWo(issue)") && modal.includes("onConvertToDamage(issue)")],
    ["scoped damage client", api.includes("convertInTransitIssueToDamage") && api.includes("convert-to-damage?${query(companyId)}")],
    ["damage route", /app\.post\(\s*"\/api\/v1\/maintenance\/triage\/:issue_id\/convert-to-damage"/.test(routeSource)],
    ["company transaction", routeSource.includes("withCompany(user.uuid, query.data.operating_company_id")],
    ["canonical damage insert", routeSource.includes("INSERT INTO safety.incidents") && routeSource.includes("driver_id, unit_id, load_id, photo_keys")],
    ["source lineage", routeSource.includes("promoted_to_damage_report_id = $2")],
    ["audit/outbox", routeSource.includes('"maintenance.triage.converted_to_damage"') && routeSource.includes('"safety.incident.created"')],
    ["work-order audit company", auditCarriesCompany("maintenance.work_order.created")],
    ["damage audit company", auditCarriesCompany("safety.incident.created")],
    ["parent invalidation", home.includes('queryKey: ["maintenance", "dashboard", "triage", companyId]')],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    [routes.replace('"/api/v1/maintenance/triage/:issue_id/convert-to-damage"', '"/api/v1/maintenance/triage/:issue_id/missing-damage-route"'), "damage route"],
    [routes.replace("INSERT INTO safety.incidents", "INSERT INTO maintenance.fake_damage"), "canonical damage insert"],
    ...["maintenance.work_order.created", "safety.incident.created"].map((event) => {
      const eventIndex = routes.indexOf(`\"${event}\"`);
      const companyIndex = routes.indexOf("operating_company_id:", eventIndex);
      return [`${routes.slice(0, companyIndex)}PLANTED_SCOPE:${routes.slice(companyIndex + "operating_company_id:".length)}`, event === "maintenance.work_order.created" ? "work-order audit company" : "damage audit company"];
    }),
  ];
  for (const [planted, expected] of mutations) {
    if (!failures(planted).includes(expected)) process.exit(1);
  }
  console.log(`verify-maintenance-damage-intake-connectivity selftest PASS — ${mutations.length}/${mutations.length} mutations red`);
  process.exit(0);
}
const missing = failures();
if (missing.length) {
  console.error(`verify-maintenance-damage-intake-connectivity FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-maintenance-damage-intake-connectivity PASS — embedded triage→canonical creates→audit→reload");
