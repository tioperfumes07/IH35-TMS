#!/usr/bin/env node
/**
 * D-H1 — Load History surface wired end-to-end:
 * service getLoadHistory, GET /dispatch/loads/:id/history, FE page + drawer tab + EntityLink docs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-history-surface";

const FILES = {
  service: "apps/backend/src/dispatch/load-history.service.ts",
  routes: "apps/backend/src/dispatch/loads.routes.ts",
  api: "apps/frontend/src/api/loads.ts",
  page: "apps/frontend/src/pages/dispatch/LoadHistoryPage.tsx",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  drawer: "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function assertLoadHistorySurface(srcs) {
  const fails = [];
  if (!/export async function getLoadHistory/.test(srcs.service)) {
    fails.push("load-history.service.ts must export getLoadHistory");
  }
  for (const needle of [
    "audit.audit_events",
    "load_assignment_history",
    "actual_arrival_at",
    "factoring_advances",
    "settlement_lines",
    "accounting.expenses",
    "work_orders",
    "not recorded",
  ]) {
    if (!srcs.service.includes(needle)) fails.push(`service must read ${needle}`);
  }
  if (!/\/api\/v1\/dispatch\/loads\/:id\/history/.test(srcs.routes)) {
    fails.push("loads.routes.ts must mount GET /history");
  }
  if (!/getLoadHistory/.test(srcs.routes)) {
    fails.push("loads.routes.ts must call getLoadHistory");
  }
  if (!/export function getDispatchLoadHistory/.test(srcs.api)) {
    fails.push("api/loads.ts must export getDispatchLoadHistory");
  }
  if (!/data-testid="load-history-page"/.test(srcs.page)) {
    fails.push("LoadHistoryPage must render load-history-page");
  }
  if (!/EntityLink/.test(srcs.page)) {
    fails.push("LoadHistoryPage must EntityLink linked records");
  }
  if (!/\/dispatch\/loads\/:id\/history/.test(srcs.manifest)) {
    fails.push("manifest must route /dispatch/loads/:id/history");
  }
  if (!/"History"/.test(srcs.drawer) || !/load-drawer-open-history/.test(srcs.drawer)) {
    fails.push("LoadDetailDrawer must expose History tab linking to /history");
  }
  return fails;
}

const srcs = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));

if (process.argv.includes("--selftest")) {
  if (assertLoadHistorySurface(srcs).length) {
    console.error(`${LABEL} SELFTEST FAIL — current sources should pass`);
    for (const f of assertLoadHistorySurface(srcs)) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  const bad = { ...srcs, routes: srcs.routes.replace("/history", "/nope") };
  if (!assertLoadHistorySurface(bad).length) {
    console.error(`${LABEL} SELFTEST FAIL — planted missing route should fail`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS`);
  process.exit(0);
}

const fails = assertLoadHistorySurface(srcs);
if (fails.length) {
  console.error(`${LABEL} FAIL`);
  for (const f of fails) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
