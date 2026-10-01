#!/usr/bin/env node
/**
 * ROUND 312 B-3 — Batch Settlements grid (§23) at /driver-finance/settlements/batch.
 * SET-01 auto-pull → Save all → postSettlementCreatorInClientTx only
 * (never payroll.* or retired settlement.* tables).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-batch-settlements-grid";

const FILES = {
  service: "apps/backend/src/driver-finance/batch-settlements.service.ts",
  routes: "apps/backend/src/driver-finance/batch-settlements.routes.ts",
  index: "apps/backend/src/index.ts",
  page: "apps/frontend/src/pages/driver-finance/BatchSettlementsPage.tsx",
  api: "apps/frontend/src/api/batchSettlements.ts",
  manifest: "apps/frontend/src/routes/manifest.tsx",
  settlementsPage: "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx",
  creator: "apps/backend/src/driver-finance/settlement-creator.service.ts",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function assertBatchSettlements(srcs) {
  const fails = [];
  if (!/postSettlementCreatorInClientTx/.test(srcs.service)) {
    fails.push("batch service must post via postSettlementCreatorInClientTx");
  }
  if (!/listSet01EligibleLoads|presettlement_link_id IS NOT NULL/.test(srcs.service)) {
    fails.push("batch service must auto-pull SET-01 linked loads (presettlement_link_id)");
  }
  if (/FROM\s+payroll\.|INTO\s+payroll\.|FROM\s+settlement\.|INTO\s+settlement\./i.test(srcs.service)) {
    fails.push("batch service must never touch payroll.* or settlement.* (retired)");
  }
  if (!/\/api\/v1\/driver-finance\/batch-settlements/.test(srcs.routes)) {
    fails.push("routes must expose /api/v1/driver-finance/batch-settlements");
  }
  if (!/eligible-loads/.test(srcs.routes)) {
    fails.push("routes must expose eligible-loads for SET-01 pull");
  }
  if (!/registerBatchSettlementsRoutes/.test(srcs.index)) {
    fails.push("index.ts must registerBatchSettlementsRoutes");
  }
  if (!/data-page=\"batch-settlements\"/.test(srcs.page)) {
    fails.push("BatchSettlementsPage must mark data-page=batch-settlements");
  }
  if (!/Save all/.test(srcs.page) || !/fill down|Fill down|onPaste|paste/i.test(srcs.page)) {
    fails.push("page must implement §23 Save all + paste/fill-down");
  }
  if (!/postBatchSettlements/.test(srcs.api) || !/listBatchSettlementEligibleLoads/.test(srcs.api)) {
    fails.push("FE api must expose postBatchSettlements + listBatchSettlementEligibleLoads");
  }
  if (!/path=\"\/driver-finance\/settlements\/batch\"/.test(srcs.manifest) || !/BatchSettlementsPage/.test(srcs.manifest)) {
    fails.push("manifest must mount BatchSettlementsPage at /driver-finance/settlements/batch");
  }
  if (!/settlements\/batch/.test(srcs.settlementsPage)) {
    fails.push("SettlementsPage subnav must link Batch Settlements");
  }
  if (!/export async function postSettlementCreatorInClientTx/.test(srcs.creator)) {
    fails.push("canonical settlement creator must remain the post path");
  }
  return fails;
}

function main() {
  const selftest = process.argv.includes("--selftest");
  const srcs = Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));
  const fails = assertBatchSettlements(srcs);
  if (fails.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of fails) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK${selftest ? " --selftest" : ""}`);
}

main();
