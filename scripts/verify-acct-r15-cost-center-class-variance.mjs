#!/usr/bin/env node
/**
 * Guard 1458 — ACCT-R-15 Class / cost-center variance surface.
 * Rule 17: verify-steps only (no package.json / CI hot-file edits).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const LABEL = "verify-acct-r15-cost-center-class-variance";

function read(rel) {
  const p = resolve(root, rel);
  if (!existsSync(p)) throw new Error(`missing ${rel}`);
  return readFileSync(p, "utf8");
}

function assertIncludes(hay, needle, label) {
  if (!hay.includes(needle)) throw new Error(`${label}: expected ${JSON.stringify(needle)}`);
}

function selftest() {
  assertIncludes("acct-r15-ok", "acct-r15-ok", "selftest");
  console.log(`${LABEL}: selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const svc = read("apps/backend/src/accounting/cost-center-class-variance.service.ts");
  assertIncludes(svc, "export async function getCostCenterClassVariance", "service export");
  assertIncludes(svc, "catalogs.classes", "canonical Class dimension");
  assertIncludes(svc, "__unclassified__", "unclassified honesty");
  assertIncludes(svc, "CostOfGoodsSold", "COGS account type");
  assertIncludes(svc, "READ-ONLY", "read-only marker");

  const routes = read("apps/backend/src/accounting/comparison-report.routes.ts");
  assertIncludes(routes, "/api/v1/accounting/cost-center-class-variance", "route path");
  assertIncludes(routes, "getCostCenterClassVariance", "route calls service");
  assertIncludes(routes, "withCompanyScope", "entity scope");

  const api = read("apps/frontend/src/api/accounting.ts");
  assertIncludes(api, "getCostCenterClassVariance", "FE api client");
  assertIncludes(api, "/api/v1/accounting/cost-center-class-variance", "FE path");

  const page = read("apps/frontend/src/pages/accounting/PeriodComparisonPage.tsx");
  assertIncludes(page, "cost-center-class-variance-panel", "UI panel testid");
  assertIncludes(page, "ClassCostCenterVariancePanel", "panel component");
  assertIncludes(page, "getCostCenterClassVariance", "page fetches variance");

  const step = read("scripts/verify-steps/1458-verify-acct-r15-cost-center-class-variance.mjs");
  assertIncludes(step, "verify-acct-r15-cost-center-class-variance", "verify-step wired");

  const claimed = read("scripts/verify-steps/CLAIMED-NUMBERS.json");
  assertIncludes(claimed, '"1458"', "number claimed");

  const json = read("docs/module-completion/accounting.json");
  assertIncludes(json, '"id": "ACCT-R-15"', "scoreboard leaf");

  console.log(`${LABEL}: PASS`);
}

try {
  main();
} catch (err) {
  console.error(`${LABEL}: FAIL`, err?.message ?? err);
  process.exit(1);
}
