#!/usr/bin/env node
/**
 * GAP-76 — Deadhead mile optimizer routes + BookLoad panel seam.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  service: path.join(ROOT, "apps/backend/src/dispatch/deadhead/optimizer.service.ts"),
  routes: path.join(ROOT, "apps/backend/src/dispatch/deadhead/routes.ts"),
  tests: path.join(ROOT, "apps/backend/src/dispatch/deadhead/__tests__/optimizer.test.ts"),
  panel: path.join(ROOT, "apps/frontend/src/components/dispatch/DeadheadOptimizerPanel.tsx"),
  bookLoadModal: path.join(ROOT, "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx"),
  dispatchApi: path.join(ROOT, "apps/frontend/src/api/dispatch.ts"),
  index: path.join(ROOT, "apps/backend/src/index.ts"),
  spec: path.join(ROOT, "docs/specs/gap-76-deadhead-optimizer.md"),
  pkg: path.join(ROOT, "package.json"),
  ci: path.join(ROOT, ".github/workflows/ci.yml"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`verify:deadhead-optimizer FAIL: ${msg}`);
  process.exit(1);
}

function main() {
  const service = read(paths.service);
  const routes = read(paths.routes);
  const tests = read(paths.tests);
  const panel = read(paths.panel);
  const bookLoadModal = read(paths.bookLoadModal);
  const dispatchApi = read(paths.dispatchApi);
  const index = read(paths.index);
  const spec = read(paths.spec);
  const pkg = read(paths.pkg);
  const ci = read(paths.ci);
  const failures = [];

  if (!service.includes("findBestLoadForUnit")) failures.push("optimizer service must export findBestLoadForUnit");
  if (!service.includes("haversineMiles")) failures.push("optimizer service must use haversine distance");
  if (!service.includes("computeSuggestionScore")) failures.push("optimizer service must compute score formula");
  if (!routes.includes("/api/v1/dispatch/deadhead/next-load-suggestions")) failures.push("routes must expose next-load-suggestions");
  if (!routes.includes("operating_company_id")) failures.push("routes must require operating_company_id");
  if ((tests.match(/\bit\(/g) ?? []).length < 5) failures.push("optimizer tests must cover at least 5 cases");
  if (!index.includes("registerDeadheadOptimizerRoutes")) failures.push("backend index must register deadhead routes");
  if (!panel.includes('data-testid="deadhead-optimizer-panel"')) failures.push("DeadheadOptimizerPanel must expose test id");
  if (!bookLoadModal.includes("DeadheadOptimizerPanel")) failures.push("BookLoadModalV4 must embed DeadheadOptimizerPanel");
  if (!dispatchApi.includes("getDeadheadNextLoadSuggestions")) failures.push("dispatch API must export getDeadheadNextLoadSuggestions");
  if (!spec.includes("GAP-76")) failures.push("gap-76 spec doc must reference GAP-76");
  if (!pkg.includes("verify:deadhead-optimizer")) failures.push("package.json must define verify:deadhead-optimizer");
  if (!ci.includes("verify:deadhead-optimizer")) failures.push("ci.yml must run verify:deadhead-optimizer");

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  console.log("verify:deadhead-optimizer PASS");
}

main();
