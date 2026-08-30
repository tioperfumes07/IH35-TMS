#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance"],"cols":["reverse_link"],"leafRe":"^arriving_soon\.convert_to_wo$","task":"VERTICAL-REVERSE-LINK-ARRIVING-SOON-WO"} */
import fs from "node:fs";

const route = fs.readFileSync("apps/backend/src/maintenance/arriving-soon.routes.ts", "utf8");
const api = fs.readFileSync("apps/frontend/src/api/maintenance.ts", "utf8");
const page = fs.readFileSync("apps/frontend/src/pages/maintenance/ArrivingSoonPage.tsx", "utf8");

function failures(routeSource = route, pageSource = page) {
  const companyScopedWoJoins = routeSource.match(/wo\.operating_company_id = \$1::uuid/g)?.length ?? 0;
  return [
    ["both data/count WO joins company-scoped", routeSource.includes("wo.id = ii.promoted_to_wo_id") && companyScopedWoJoins === 2],
    ["converted-only history", routeSource.includes("ii.promoted_to_wo_id IS NOT NULL")],
    ["human WO label", routeSource.includes("wo.display_id AS work_order_display_id")],
    ["durable source surface", pageSource.includes('data-testid="maint-arriving-soon-recent-conversions"')],
    ["canonical WO drill", pageSource.includes('kind="work_order"') && pageSource.includes("id={conversion.work_order_id}")],
    ["canonical load drill", pageSource.includes('kind="load" id={conversion.load_id}')],
    ["canonical unit drill", pageSource.includes('kind="unit" id={conversion.unit_id}')],
    ["typed read model", api.includes("recent_conversions: ArrivingSoonConversion[]")],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const badRoute = route.replace("wo.operating_company_id = $1::uuid", "TRUE");
  const badPage = page.replace('kind="work_order"', 'kind="unit"');
  const checks = [
    failures(badRoute, page).includes("both data/count WO joins company-scoped"),
    failures(route, badPage).includes("canonical WO drill"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-arriving-soon-work-order-reverse selftest PASS — 2/2 data/count scope and drill mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-arriving-soon-work-order-reverse FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-arriving-soon-work-order-reverse PASS — converted issue→WO remains visible and drillable");
