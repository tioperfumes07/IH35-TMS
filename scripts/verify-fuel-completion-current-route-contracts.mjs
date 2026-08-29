#!/usr/bin/env node
/** Prevents stale completion prose URLs from reopening mounted Fuel routes as 404 defects. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fuel-completion-current-route-contracts";
const FILES = {
  manifest: "docs/module-completion/fuel.json",
  fuelApi: "apps/frontend/src/api/fuelPlanner.ts",
  accountingApi: "apps/frontend/src/api/accounting.ts",
  relayApi: "apps/frontend/src/api/relayDeposits.ts",
  index: "apps/backend/src/index.ts",
  plannerRoutes: "apps/backend/src/fuel/planner.routes.ts",
  lovesRoutes: "apps/backend/src/sync/loves-status.routes.ts",
  expenseRoutes: "apps/backend/src/accounting/expense-category-map/routes.ts",
  expensePlugin: "apps/backend/src/accounting/expense-category-map/expense-category-map.routes.ts",
  relayRoutes: "apps/backend/src/integrations/relay-payments/relay-deposit-review.routes.ts",
  httpRecheck: "scripts/ops/recheck-prod-verified-http.mjs",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function inspect(sources) {
  const errors = [];
  const manifest = JSON.parse(sources.manifest);
  const items = new Map(manifest.items.map((item) => [item.id, item]));
  const contracts = [
    ["FUEL-S01", "/api/v1/sync/loves/status", sources.fuelApi, sources.lovesRoutes, "registerLovesSyncStatusRoutes(app)"],
    ["FUEL-S02", "/api/v1/fuel/planner/compliance/summary", sources.fuelApi, sources.plannerRoutes, "registerFuelPlannerRoutes(app)"],
    ["FUEL-S03", "/api/v1/accounting/expense-category-map", sources.accountingApi, sources.expenseRoutes, null],
    ["FUEL-S06", "/api/integrations/relay/deposits", sources.relayApi, sources.relayRoutes, "registerRelayDepositReviewRoutes(app)"],
    ["FUEL-S07", "/api/v1/sync/loves/status", sources.fuelApi, sources.lovesRoutes, "registerLovesSyncStatusRoutes(app)"],
  ];
  for (const [id, endpoint, client, routes, mount] of contracts) {
    const item = items.get(id);
    if (!item) {
      errors.push(`${id}: manifest item missing`);
      continue;
    }
    if (!String(item.evidence).includes(`CURRENT-HTTP ${endpoint}`) && !String(item.evidence).includes(`and ${endpoint}`)) {
      errors.push(`${id}: evidence must name canonical CURRENT-HTTP ${endpoint}`);
    }
    if (item.prod_verified !== false || item.status !== "UNVERIFIED") {
      errors.push(`${id}: correction must remain UNVERIFIED/prod_verified=false until authenticated GUARD proof`);
    }
    if (!client.includes(endpoint)) errors.push(`${id}: frontend caller does not use ${endpoint}`);
    if (!routes.includes(endpoint)) errors.push(`${id}: backend does not declare ${endpoint}`);
    if (mount && !sources.index.includes(mount)) errors.push(`${id}: backend index does not mount ${mount}`);
  }
  const s06 = String(items.get("FUEL-S06")?.evidence ?? "");
  if (!s06.includes("/api/integrations/relay/company-cards")) errors.push("FUEL-S06: company-cards route missing from corrected evidence");
  if (!sources.relayApi.includes("/api/integrations/relay/company-cards") || !sources.relayRoutes.includes("/api/integrations/relay/company-cards")) {
    errors.push("FUEL-S06: company-cards caller/route contract missing");
  }
  if (!sources.expensePlugin.includes("registerExpenseCategoryMapRoutes(app)")) {
    errors.push("FUEL-S03: autoload plugin does not mount registerExpenseCategoryMapRoutes(app)");
  }
  if (!sources.accountingApi.includes('`/api/v1/accounting/expense-category-map?${query.toString()}`')) {
    errors.push("FUEL-S03: listExpenseCategoryMappings does not call the canonical query endpoint");
  }
  const stale = [
    "/api/v1/fuel/loves-sync/status",
    "/api/v1/fuel/compliance-summary",
    "/api/v1/accounting/expense-category-mappings",
    "/api/v1/relay/deposits",
    "/api/v1/relay/company-cards",
  ];
  for (const endpoint of stale) {
    for (const id of ["FUEL-S01", "FUEL-S02", "FUEL-S03", "FUEL-S06", "FUEL-S07"]) {
      if (String(items.get(id)?.evidence ?? "").includes(endpoint)) errors.push(`${id}: obsolete endpoint remains authoritative: ${endpoint}`);
    }
  }
  if (!sources.httpRecheck.includes('process.argv.includes("--write")') || !sources.httpRecheck.includes("writeFileSync(OUT, text)")) {
    errors.push("HTTP recheck must support refreshing its canonical artifact after evidence corrections");
  }
  return errors;
}

function sourceSet() {
  return Object.fromEntries(Object.entries(FILES).map(([key, rel]) => [key, read(rel)]));
}

function selftest() {
  const good = sourceSet();
  if (inspect(good).length) throw new Error("good fixture rejected");
  const mutations = [
    ["loves caller", { fuelApi: good.fuelApi.replace("/api/v1/sync/loves/status", "/api/v1/fuel/loves-sync/status") }],
    ["compliance route", { plannerRoutes: good.plannerRoutes.replace("/api/v1/fuel/planner/compliance/summary", "/api/v1/fuel/compliance-summary") }],
    ["expense caller", { accountingApi: good.accountingApi.replace("/api/v1/accounting/expense-category-map?", "/api/v1/accounting/expense-category-mappings?") }],
    ["expense autoload mount", { expensePlugin: good.expensePlugin.replace("registerExpenseCategoryMapRoutes(app)", "registerExpenseCategoryMapRoutesMissing(app)") }],
    ["relay mount", { index: good.index.replace("registerRelayDepositReviewRoutes(app)", "registerRelayDepositReviewRoutesMissing(app)") }],
    ["honesty state", { manifest: good.manifest.replace('"id": "FUEL-S02"', '"id": "FUEL-S02"').replace('"status": "UNVERIFIED"', '"status": "PASS"') }],
    ["artifact refresh", { httpRecheck: good.httpRecheck.replace("writeFileSync(OUT, text)", "") }],
  ];
  for (const [name, mutation] of mutations) {
    if (inspect({ ...good, ...mutation }).length === 0) throw new Error(`mutation escaped: ${name}`);
  }
  console.log(`${LABEL}: selftest PASS (${mutations.length}/${mutations.length})`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}
const errors = inspect(sourceSet());
if (errors.length) {
  console.error(`${LABEL}: FAIL`);
  errors.forEach((error) => console.error(`  - ${error}`));
  process.exit(1);
}
console.log(`${LABEL}: PASS — five Fuel items bind current callers to mounted canonical routes`);
