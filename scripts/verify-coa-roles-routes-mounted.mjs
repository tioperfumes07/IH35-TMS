#!/usr/bin/env node
// verify-coa-roles-routes-mounted (corrected 2026-07-21)
//
// ROOT CAUSE HISTORY: Block-35 SHELL originally assumed GET/PUT
// /api/v1/accounting/coa-roles + GET /api/v1/accounting/coa-roles/validate
// (apps/backend/src/accounting/coa-roles/routes.ts, registerCoaRolesRoutes) were "dark"
// (never mounted) and added a SECOND explicit `await registerCoaRolesRoutes(app);` call in
// apps/backend/src/index.ts. That premise was wrong: the routes were already live via
// apps/backend/src/accounting/coa-roles/coa-roles.routes.ts, an `export default fp(...)`
// wrapper that is autoloaded by `registerAccountingRoutes` (@fastify/autoload, matchFilter
// /\.routes\.(ts|js)$/, called from index.ts) — see the same pattern proven by
// apps/backend/src/accounting/__tests__/reconciliation-workspace-routes.test.ts. The added
// explicit mount duplicated the registration and crashed boot with
// FST_ERR_DUPLICATED_ROUTE ("Method 'GET' already declared for route
// '/api/v1/accounting/coa-roles'"), failing the build-typecheck / boot-smoke CI job.
//
// This guard now pins the ACTUAL wiring chain (autoload-only) and forbids the exact
// double-mount regression from returning:
//   1. coa-roles.routes.ts still exports `default fp(...)` calling registerCoaRolesRoutes
//      (the file @fastify/autoload picks up).
//   2. accounting/index.ts still autoloads *.routes.{ts,js} and does not add coa-roles to
//      its ignorePattern (which would silently drop the route again).
//   3. index.ts still calls `await registerAccountingRoutes(app);` (the mechanism that
//      loads the wrapper).
//   4. index.ts does NOT import/invoke registerCoaRolesRoutes directly — that would
//      re-create the duplicate-route boot crash this guard exists to prevent.
//
// Self-test: --selftest proves the guard FAILS when (a) the wrapper's default plugin export
// is dropped, or (b) index.ts re-adds the direct import/invocation.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INDEX_PATH = "apps/backend/src/index.ts";
const ACCOUNTING_INDEX_PATH = "apps/backend/src/accounting/index.ts";
const WRAPPER_PATH = "apps/backend/src/accounting/coa-roles/coa-roles.routes.ts";

function checkWrapper(src) {
  const problems = [];
  if (!/export\s+default\s+fp\(/.test(src)) {
    problems.push("coa-roles.routes.ts no longer exports `default fp(...)` — @fastify/autoload will not pick it up");
  }
  if (!/registerCoaRolesRoutes/.test(src)) {
    problems.push("coa-roles.routes.ts no longer calls registerCoaRolesRoutes");
  }
  return problems;
}

function checkAccountingIndex(src) {
  const problems = [];
  if (!src.includes("@fastify/autoload")) {
    problems.push("accounting/index.ts no longer uses @fastify/autoload");
  }
  if (!/matchFilter:\s*\/\\\.routes\\\.\(ts\|js\)\$\//.test(src)) {
    problems.push("accounting/index.ts matchFilter no longer matches *.routes.{ts,js}");
  }
  const ignoreMatch = src.match(/ignorePattern:\s*\/(.*)\/[a-z]*,/);
  if (ignoreMatch && new RegExp(ignoreMatch[1]).test("coa-roles.routes.ts")) {
    problems.push("accounting/index.ts ignorePattern now excludes coa-roles.routes.ts — route would go dark again");
  }
  return problems;
}

function checkIndex(src) {
  const problems = [];
  if (!/await\s+registerAccountingRoutes\s*\(\s*app\s*\)/.test(src)) {
    problems.push("index.ts no longer calls await registerAccountingRoutes(app) — accounting autoload (and coa-roles) would not run");
  }
  const importsDirect = new RegExp(`import\\s*\\{[^}]*\\bregisterCoaRolesRoutes\\b`).test(src);
  const invokesDirect = new RegExp(`registerCoaRolesRoutes\\s*\\(\\s*app\\s*\\)`).test(src);
  if (importsDirect || invokesDirect) {
    problems.push(
      "index.ts imports/invokes registerCoaRolesRoutes directly — this DUPLICATES the autoload registration " +
        "and crashes boot with FST_ERR_DUPLICATED_ROUTE (the exact regression this guard exists to prevent)"
    );
  }
  return problems;
}

function runChecks() {
  const wrapperSrc = fs.readFileSync(path.join(ROOT, WRAPPER_PATH), "utf8");
  const accountingIndexSrc = fs.readFileSync(path.join(ROOT, ACCOUNTING_INDEX_PATH), "utf8");
  const indexSrc = fs.readFileSync(path.join(ROOT, INDEX_PATH), "utf8");
  return [
    ...checkWrapper(wrapperSrc),
    ...checkAccountingIndex(accountingIndexSrc),
    ...checkIndex(indexSrc),
  ];
}

if (process.argv.includes("--selftest")) {
  const goodWrapper =
    'import fp from "fastify-plugin";\n' +
    'import { registerCoaRolesRoutes } from "./routes.js";\n' +
    'export default fp(async (app) => { await registerCoaRolesRoutes(app); }, { name: "x" });\n';
  const badWrapperNoDefault = goodWrapper.replace("export default fp(", "const plugin = fp(");
  if (checkWrapper(goodWrapper).length !== 0) {
    console.error("selftest FAIL: valid wrapper sample flagged");
    process.exit(1);
  }
  if (checkWrapper(badWrapperNoDefault).length === 0) {
    console.error("selftest FAIL: dropped `export default fp(...)` not caught");
    process.exit(1);
  }

  const goodIndex = 'await registerAccountingRoutes(app);\n';
  const badIndexDuplicateMount =
    'import { registerCoaRolesRoutes } from "./accounting/coa-roles/routes.js";\n' +
    "await registerAccountingRoutes(app);\n" +
    "await registerCoaRolesRoutes(app);\n";
  if (checkIndex(goodIndex).length !== 0) {
    console.error("selftest FAIL: valid index.ts sample flagged");
    process.exit(1);
  }
  if (checkIndex(badIndexDuplicateMount).length === 0) {
    console.error("selftest FAIL: planted duplicate-mount regression not caught");
    process.exit(1);
  }
  console.log("selftest OK");
  process.exit(0);
}

const problems = runChecks();
if (problems.length) {
  console.error("FAIL: coa-roles route wiring regression -> " + problems.join("; "));
  process.exit(1);
}
console.log("OK: coa-roles routes are wired exactly once, via accounting autoload (no duplicate mount)");
