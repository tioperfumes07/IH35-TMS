#!/usr/bin/env node
/**
 * C-36 — Maintenance 16 tabs → 9 (Round 300 #2). Ops lane; --selftest only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};
const ok = (m) => console.log(`PASS: ${m}`);
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

if (!process.argv.includes("--selftest")) {
  console.log("usage: node scripts/ops/verify-c36-maint-tabs-16-to-9.mjs --selftest");
  process.exit(0);
}

const home = read("apps/frontend/src/pages/maintenance/MaintenanceHome.tsx");
const strip = read("apps/frontend/src/pages/maintenance/components/RMStatStrip.tsx");
const nav = read("apps/frontend/src/components/maintenance/MAINTENANCE_NAV_CONFIG.ts");
const routes = read("apps/frontend/src/router/route-manifest.ts");
const integrity = read("apps/frontend/src/pages/maintenance/IntegrityReportPage.tsx");

const subnav = home.match(/const SUBNAV = \[([\s\S]*?)\] as const/);
if (!subnav) fail("SUBNAV missing");
const ids = [...subnav[1].matchAll(/id:\s*"([^"]+)"/g)].map((m) => m[1]);
// C-36 locked nine (never drop). R313 Cursor item 3 ADDS pm_due / faults / in_shop / cost_per_mile
// (owner: every tab live) without resurrecting retired peers (Rule 07).
const c36Nine = [
  "rm_status_board",
  "fleet_table",
  "active_wos",
  "service_location",
  "driver_reports",
  "road_service",
  "parts_inventory",
  "integrity_report",
  "settings",
];
const r313Add = ["pm_due", "faults", "in_shop", "cost_per_mile"];
for (const id of c36Nine) {
  if (!ids.includes(id)) fail(`C-36 tab missing from SUBNAV: ${id}`);
}
for (const id of r313Add) {
  if (!ids.includes(id)) fail(`R313 #3 tab missing from SUBNAV: ${id}`);
}
if (ids.length < 13) fail(`SUBNAV must keep C-36 nine + R313 four (13+); got ${ids.length} [${ids.join(", ")}]`);
ok("SUBNAV keeps C-36 nine and adds R313 PM Due / Faults / In Shop / Cost/mi");

if (!home.includes('label: "Home"')) fail('Home tab must label "Home"');
ok("Home tab states Home");

for (const banned of ["Brake Wear", "Tire Wear", "Arriving Soon", "At Risk", "Damage Reports", "In-Transit Issues", "Severe Repairs", "Pre-Flight DVIR"]) {
  if (subnav[1].includes(`label: "${banned}"`)) fail(`retired peer still in SUBNAV: ${banned}`);
}
ok("retired peers not in SUBNAV");

if (!home.includes("maintenance-home-folded-panels")) fail("Arriving Soon + At Risk must fold into Home");
ok("Arriving Soon + At Risk folded into Home");

if (!home.includes("driverReportKind") || !home.includes("Kind")) fail("Driver Reports Kind column/control missing");
ok("Driver Reports Kind control present");

if (!home.includes("isHomeTab ? <IntegrationsStrip")) fail("IntegrationsStrip must render once on Home only");
ok("IntegrationsStrip once on Home");

if (strip.includes('label="Open WOs"') || strip.includes('label="In Progress"') || strip.includes('label="Awaiting Parts"') || strip.includes('label="Severe / OOS"')) {
  fail("RMStatStrip still has kanban-duplicate KPI tiles");
}
if (!strip.includes('data-c36-kpi="non-kanban"')) fail("RMStatStrip missing C-36 non-kanban marker");
ok("RMStatStrip dropped 4 kanban-duplicate tiles");

if (!nav.includes('label: "Integrity Report"') || !nav.includes("/maintenance/integrity-report")) {
  fail("MAINTENANCE_DASHBOARD_TAB_LINKS missing Integrity Report");
}
if (!nav.includes('label: "PM Due"') || !nav.includes('label: "Faults"') || !nav.includes('label: "Cost/mi"')) {
  fail("MAINTENANCE_DASHBOARD_TAB_LINKS missing R313 #3 PM Due / Faults / Cost/mi");
}
const dashCount = (nav.match(/MAINTENANCE_DASHBOARD_TAB_LINKS[\s\S]*?\];/)?.[0].match(/path:/g) ?? []).length;
if (dashCount < 13) {
  fail(`MAINTENANCE_DASHBOARD_TAB_LINKS must have ≥13 entries (C-36 nine + R313 four); got ${dashCount}`);
}
ok("nav config has C-36 + R313 dashboard tabs including Integrity Report");

if (!routes.includes('integrity_report: "/maintenance/integrity-report"')) fail("MAINTENANCE_TAB_PATH missing integrity_report");
if (!routes.includes('return "driver_reports"')) fail("retired damage/in-transit/DVIR must remap to driver_reports");
ok("route remaps present");

if (!integrity.includes("driver-scorecard") || !integrity.includes("fuel-anomalies")) {
  fail("IntegrityReportPage must call scorecard + fuel-anomalies");
}
ok("Integrity Report page wired to integrity engine");

console.log("verify-c36-maint-tabs-16-to-9 --selftest OK");
