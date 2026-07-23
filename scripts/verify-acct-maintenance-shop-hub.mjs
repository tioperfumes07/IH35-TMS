#!/usr/bin/env node
/**
 * Rule-17 guard 1293: Accounting Maintenance & shop hub is a real leaf under Accounting sub-nav
 * (not a Navigate redirect to /maintenance). Lists WO↔bill/expense reverse drills with EntityLink.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-maintenance-shop-hub";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertMaintenanceShopHub() {
  const errors = [];
  const page = read("apps/frontend/src/pages/accounting/MaintenanceShopHubPage.tsx");
  const subnav = read("apps/frontend/src/pages/accounting/subnav-manifest.ts");
  const manifest = read("apps/frontend/src/routes/manifest.tsx");
  const api = read("apps/frontend/src/api/maintenance-shop.ts");
  const routes = read("apps/backend/src/accounting/maintenance-shop.routes.ts");
  const service = read("apps/backend/src/accounting/maintenance-shop.service.ts");
  const accountingIndex = read("apps/backend/src/accounting/index.ts");
  const locked = read("docs/locked-ui-surface.json");
  const routeMap = read("scripts/verify-accounting-route-map.mjs");

  if (!/export function MaintenanceShopHubPage/.test(page)) errors.push("MaintenanceShopHubPage export missing");
  if (/ComingSoon/.test(page)) errors.push("MaintenanceShopHubPage must not be ComingSoon");
  if (!/ParityTable/.test(page)) errors.push("MaintenanceShopHubPage must use ParityTable");
  if (!/kind="work_order"/.test(page)) errors.push("MaintenanceShopHubPage must EntityLink work orders");
  if (!/kind="bill"/.test(page) || !/kind="expense"/.test(page)) {
    errors.push("MaintenanceShopHubPage must EntityLink bills and expenses");
  }
  if (!/Open Maintenance module/.test(page) || !/to="\/maintenance"/.test(page)) {
    errors.push("MaintenanceShopHubPage must keep /maintenance reachable (Rule 07 — only add)");
  }
  if (!/Maintenance & shop/.test(subnav) || !/path:\s*"\/accounting\/maintenance-shop"/.test(subnav)) {
    errors.push("SUBNAV_ITEMS must include Maintenance & shop → /accounting/maintenance-shop");
  }
  if (!/MaintenanceShopHubPage/.test(manifest)) errors.push("manifest must wire MaintenanceShopHubPage");
  if (/Navigate to="\/maintenance"/.test(manifest.match(/path="\/accounting\/maintenance-shop"[\s\S]*?<\/Route>/)?.[0] ?? "")) {
    errors.push("/accounting/maintenance-shop must not Navigate-redirect to /maintenance");
  }
  if (!/export function getMaintenanceShopHub/.test(api)) errors.push("api/maintenance-shop.ts getMaintenanceShopHub missing");
  if (!/\/api\/v1\/accounting\/maintenance-shop\/hub/.test(routes)) {
    errors.push("backend GET /api/v1/accounting/maintenance-shop/hub missing");
  }
  if (!/export async function listMaintenanceShopHub/.test(service)) {
    errors.push("maintenance-shop.service.ts listMaintenanceShopHub missing");
  }
  if (!/linked_work_order_uuid/.test(service)) errors.push("hub query must use linked_work_order_uuid HARD link");
  if (!/matchFilter:\s*\/\\\.routes\\\.\(ts\|js\)\$\//.test(accountingIndex)) {
    errors.push("accounting/index.ts must autoload *.routes.ts — maintenance-shop.routes.ts relies on it");
  }
  if (!/"\/accounting\/maintenance-shop"/.test(locked)) {
    errors.push("locked-ui-surface.json must include /accounting/maintenance-shop");
  }
  if (/maintenance-shop.*\/maintenance/.test(routeMap) && /parityMap/.test(routeMap)) {
    errors.push("verify-accounting-route-map.mjs must not require maintenance-shop → /maintenance redirect");
  }

  return errors;
}

function runSelftest() {
  const errors = [];
  const good = `
export function MaintenanceShopHubPage() {
  return <ParityTable columns={[]} rows={[]} rowKey={(r)=>r.id}
    render={() => <>
      <EntityLink kind="work_order" id="wo" label="WO" />
      <EntityLink kind="bill" id="b" label="B" />
      <EntityLink kind="expense" id="e" label="E" />
      <Link to="/maintenance">Open Maintenance module</Link>
    </>} />;
}
`;
  if (!/kind="work_order"/.test(good)) errors.push("selftest fixture broken: work_order");
  return errors;
}

const selftest = process.argv.includes("--selftest");
const errors = selftest ? runSelftest() : assertMaintenanceShopHub();

if (errors.length > 0) {
  console.error(`✘ ${LABEL}:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`✅ ${LABEL} passed${selftest ? " (selftest)" : ""}`);
