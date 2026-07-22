#!/usr/bin/env node
/**
 * Rule-17: Accounting Allocations tab is mounted (not ComingSoon), listed in SUBNAV,
 * and backed by GET /api/v1/accounting/allocations.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-allocations-page";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertAllocationsPage() {
  const errors = [];
  const page = read("apps/frontend/src/pages/accounting/AllocationsPage.tsx");
  const subnav = read("apps/frontend/src/pages/accounting/subnav-manifest.ts");
  const manifest = read("apps/frontend/src/routes/manifest.tsx");
  const api = read("apps/frontend/src/api/allocations.ts");
  const routes = read("apps/backend/src/accounting/allocations.routes.ts");
  const accountingIndex = read("apps/backend/src/accounting/index.ts");
  const index = read("apps/backend/src/index.ts");
  const locked = read("docs/locked-ui-surface.json");

  if (!/export function AllocationsPage/.test(page)) errors.push("AllocationsPage export missing");
  if (/ComingSoon/.test(page)) errors.push("AllocationsPage must not be ComingSoon");
  if (!/ParityTable/.test(page)) errors.push("AllocationsPage must use ParityTable");
  if (!/kind="bill"/.test(page)) errors.push("AllocationsPage must EntityLink bills");
  if (!/label:\s*"Allocations"/.test(subnav) || !/path:\s*"\/accounting\/allocations"/.test(subnav)) {
    errors.push("SUBNAV_ITEMS must include Allocations → /accounting/allocations");
  }
  if (!/path="\/accounting\/allocations"/.test(manifest) && !/path=\{\s*"\/accounting\/allocations"/.test(manifest)) {
    if (!/\/accounting\/allocations/.test(manifest)) errors.push("manifest must mount /accounting/allocations");
  }
  if (!/AllocationsPage/.test(manifest)) errors.push("manifest must wire AllocationsPage");
  if (!/export function getAllocations/.test(api)) errors.push("api/allocations.ts getAllocations missing");
  if (!/\/api\/v1\/accounting\/allocations/.test(routes)) errors.push("backend GET /api/v1/accounting/allocations missing");
  // allocations.routes.ts is mounted by the accounting AUTOLOAD (apps/backend/src/accounting/index.ts
  // registers @fastify/autoload over the whole directory with matchFilter /\.routes\.(ts|js)$/), so
  // it must NOT also be registered by hand in apps/backend/src/index.ts.
  //
  // This assertion used to read "index.ts must mount registerAllocationsRoutes", which REQUIRED the
  // manual mount — and the manual mount is precisely what made verify:no-duplicate-routes fail with
  // "GET /api/v1/accounting/allocations registered twice (autoload + manual)". A guard that mandates
  // the defect is worse than no guard. What actually needs proving is that the route is REACHABLE,
  // and exactly once.
  if (!/matchFilter:\s*\/\\\.routes\\\.\(ts\|js\)\$\//.test(accountingIndex)) {
    errors.push("accounting/index.ts must autoload *.routes.ts — allocations.routes.ts relies on it to be mounted");
  }
  if (/(^|\/)allocations\\?\.routes\\?\./.test(accountingIndex.match(/ignorePattern:[^\n]*/)?.[0] ?? "")) {
    errors.push("accounting/index.ts ignorePattern excludes allocations.routes.ts — the route would never mount");
  }
  if (/registerAllocationsRoutes/.test(index)) {
    errors.push(
      "apps/backend/src/index.ts must NOT manually mount registerAllocationsRoutes — the accounting autoload already mounts it, and a second registration trips verify:no-duplicate-routes"
    );
  }
  if (!/"\/accounting\/allocations"/.test(locked)) errors.push("locked-ui-surface.json must include /accounting/allocations");
  return errors;
}

// The previous --selftest just re-ran the real check against live sources. That can only ever
// confirm today's tree; it can never show that an assertion still bites, so a typo'd regex would
// report PASS forever. Planted-regression selftest instead (repo convention).
function selftest() {
  const problems = [];
  const errors = assertAllocationsPage();
  if (errors.length) problems.push(`live sources rejected: ${errors.join("; ")}`);

  const cases = [
    [
      "manual mount reintroduced",
      () => assertDuplicateMountCaught(),
      "must NOT manually mount registerAllocationsRoutes",
    ],
  ];
  for (const [name, run, expectFragment] of cases) {
    const found = run();
    if (!found.some((e) => e.includes(expectFragment))) {
      problems.push(`planted regression "${name}" was NOT caught — assertion is ineffective`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — live sources clean; ${cases.length} planted regression caught`);
}

/** Re-runs the duplicate-mount assertion against an index.ts that DOES manually register. */
function assertDuplicateMountCaught() {
  const errors = [];
  const fakeIndex = "await registerAllocationsRoutes(app);";
  if (/registerAllocationsRoutes/.test(fakeIndex)) {
    errors.push(
      "apps/backend/src/index.ts must NOT manually mount registerAllocationsRoutes — the accounting autoload already mounts it, and a second registration trips verify:no-duplicate-routes"
    );
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertAllocationsPage();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
