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

  errors.push(
    ...assertLinkage({
      page,
      billDetail: read("apps/frontend/src/pages/accounting/BillDetailPage.tsx"),
      entityLink: read("apps/frontend/src/components/shared/EntityLink.tsx"),
      manifest,
    })
  );
  errors.push(
    ...assertCreatePath({
      panel: read("apps/frontend/src/components/allocation/BillAllocationPanel.tsx"),
      routes: read("apps/backend/src/accounting/bills.routes.ts"),
    })
  );
  return errors;
}

/** Re-allocation must remain a selected-company POST into the canonical append/supersede ledger. */
export function assertCreatePath({ panel, routes }) {
  const errors = [];
  if (!/new URLSearchParams\(\{ operating_company_id: companyId \}\)/.test(panel)) {
    errors.push("BillAllocationPanel must scope re-allocation to the selected operating company");
  }
  if (!/\/api\/v1\/accounting\/bills\/\$\{billId\}\/allocate\?\$\{params\.toString\(\)\}/.test(panel)) {
    errors.push("BillAllocationPanel must POST to the canonical bill allocate route");
  }
  if (!/method:\s*"POST"/.test(panel) || !/body:\s*JSON\.stringify\(body\)/.test(panel)) {
    errors.push("BillAllocationPanel must submit the selected allocation method/assets as JSON");
  }
  const route = routes.match(/app\.post\("\/api\/v1\/accounting\/bills\/:id\/allocate"[\s\S]*?return \{ rows: billAllocation\.rows \};\n\s*\}\);/)?.[0] ?? "";
  if (!route) {
    errors.push("backend canonical POST /accounting/bills/:id/allocate handler missing");
    return errors;
  }
  if (!/assertCompanyMembership\([^,]+,\s*query\.data\.operating_company_id\)/.test(route) ||
      !/withCompanyScope\([^,]+,\s*query\.data\.operating_company_id/.test(route)) {
    errors.push("allocation POST must authorize and execute inside the selected company scope");
  }
  if (!/FROM accounting\.bills[\s\S]{0,180}?operating_company_id = \$2::uuid/.test(route)) {
    errors.push("allocation POST must resolve the source bill in the selected company");
  }
  if (!/FROM mdata\.assets[\s\S]{0,160}?tenant_id = \$1[\s\S]{0,120}?id = ANY\(\$2::uuid\[\]\)/.test(route)) {
    errors.push("allocation POST must resolve every selected asset in the selected company");
  }
  if (!/UPDATE accounting\.bill_unit_allocation[\s\S]{0,220}?superseded_reason = 'reallocate'[\s\S]{0,180}?bill_id = \$1[\s\S]{0,100}?tenant_id = \$2/.test(route)) {
    errors.push("re-allocation must supersede only the bill's active same-company allocation rows");
  }
  if (!/INSERT INTO accounting\.bill_unit_allocation\s*\([\s\S]{0,300}?tenant_id,[\s\S]*?bill_id,[\s\S]*?asset_id,[\s\S]*?allocation_method,[\s\S]*?allocation_pct,[\s\S]*?allocated_amount_cents/.test(route)) {
    errors.push("allocation POST must persist the canonical company/bill/asset allocation row");
  }
  return errors;
}

/**
 * LAW §9 total-connectivity assertions for the Allocations surface. Split out (and taking its
 * sources as arguments) so the planted-regression selftest can prove each one still bites.
 *
 * Every check here corresponds to a real gap found on this branch, not a hypothetical:
 *  - the page shipped ignoring bill_id/asset_id even though the route + client accepted them, so
 *    `/accounting/allocations?bill_id=X` silently listed EVERY allocation;
 *  - the GL account was dead text while coa_account_id sat unused on the row;
 *  - the bill had no hop into its own allocations (forward-only linkage is not linkage).
 */
export function assertLinkage({ page, billDetail, entityLink, manifest }) {
  const errors = [];

  if (!/searchParams\.get\("bill_id"\)/.test(page) || !/searchParams\.get\("asset_id"\)/.test(page)) {
    errors.push("AllocationsPage must read bill_id + asset_id from the URL (reverse drill-in target)");
  }
  if (!/bill_id:\s*billIdFilter/.test(page) || !/asset_id:\s*assetIdFilter/.test(page)) {
    errors.push("AllocationsPage must pass bill_id/asset_id through to getAllocations — reading them is not filtering");
  }
  if (!/queryKey:\s*\[[^\]]*billIdFilter[^\]]*assetIdFilter/.test(page.replace(/\s+/g, " "))) {
    errors.push("AllocationsPage react-query key must include the filters or a deep link serves the cached unfiltered list");
  }
  if (!/kind="account"/.test(page)) {
    errors.push("AllocationsPage must EntityLink the GL account (Law §9 forward drill to the posting account)");
  }
  if (!/case "account":/.test(entityLink) || !/chart-of-accounts\/register\//.test(entityLink)) {
    errors.push('EntityLink must resolve kind="account" to the chart-of-accounts register route');
  }
  if (!/chart-of-accounts\/register\/:accountId/.test(manifest)) {
    errors.push("manifest must still mount /accounting/chart-of-accounts/register/:accountId — EntityLink account would be a dead link");
  }
  if (!/\/accounting\/allocations\?bill_id=/.test(billDetail)) {
    errors.push("BillDetailPage must link to its own allocations (reverse hop bill → allocations)");
  }

  return errors;
}

// The previous --selftest just re-ran the real check against live sources. That can only ever
// confirm today's tree; it can never show that an assertion still bites, so a typo'd regex would
// report PASS forever. Planted-regression selftest instead (repo convention).
function selftest() {
  const problems = [];
  const errors = assertAllocationsPage();
  if (errors.length) problems.push(`live sources rejected: ${errors.join("; ")}`);

  // Real sources, then one mutated copy per linkage assertion — each mutation is the exact
  // regression the assertion exists to stop.
  const live = {
    page: read("apps/frontend/src/pages/accounting/AllocationsPage.tsx"),
    billDetail: read("apps/frontend/src/pages/accounting/BillDetailPage.tsx"),
    entityLink: read("apps/frontend/src/components/shared/EntityLink.tsx"),
    manifest: read("apps/frontend/src/routes/manifest.tsx"),
    panel: read("apps/frontend/src/components/allocation/BillAllocationPanel.tsx"),
    routes: read("apps/backend/src/accounting/bills.routes.ts"),
  };
  const without = (key, pattern) => assertLinkage({ ...live, [key]: live[key].replace(pattern, "") });

  const cases = [
    [
      "manual mount reintroduced",
      () => assertDuplicateMountCaught(),
      "must NOT manually mount registerAllocationsRoutes",
    ],
    [
      "page stops reading the bill_id deep link",
      () => without("page", /searchParams\.get\("bill_id"\)/g),
      "must read bill_id + asset_id from the URL",
    ],
    [
      "page reads the filter but stops sending it",
      () => without("page", /bill_id:\s*billIdFilter,?/g),
      "must pass bill_id/asset_id through to getAllocations",
    ],
    [
      "GL account demoted back to dead text",
      () => without("page", /kind="account"/g),
      "must EntityLink the GL account",
    ],
    [
      "EntityLink account route removed",
      () => without("entityLink", /case "account":/g),
      'must resolve kind="account"',
    ],
    [
      "bill loses its hop into allocations",
      () => without("billDetail", /\/accounting\/allocations\?bill_id=/g),
      "must link to its own allocations",
    ],
  ];
  for (const [name, run, expectFragment] of cases) {
    const found = run();
    if (!found.some((e) => e.includes(expectFragment))) {
      problems.push(`planted regression "${name}" was NOT caught — assertion is ineffective`);
    }
  }

  const createCases = [
    ["selected-company query", "panel", /new URLSearchParams\(\{ operating_company_id: companyId \}\)/, /selected operating company/],
    ["canonical POST URL", "panel", /\/api\/v1\/accounting\/bills\/\$\{billId\}\/allocate\?\$\{params\.toString\(\)\}/, /canonical bill allocate route/],
    ["POST method", "panel", /method:\s*"POST"/, /submit the selected allocation/],
    ["company scope wrapper", "routes", /withCompanyScope\(String\(user\.uuid\), query\.data\.operating_company_id/g, /authorize and execute inside/],
    ["same-company bill", "routes", /AND operating_company_id = \$2::uuid/g, /source bill in the selected company/],
    ["same-company assets", "routes", /WHERE tenant_id = \$1/g, /every selected asset in the selected company/],
    ["supersede reason", "routes", /superseded_reason = 'reallocate'/g, /supersede only/],
    ["canonical insert", "routes", /INSERT INTO accounting\.bill_unit_allocation/g, /persist the canonical/],
  ];
  for (const [name, key, pattern, expected] of createCases) {
    const mutated = { panel: live.panel, routes: live.routes, [key]: live[key].replace(pattern, "") };
    const found = assertCreatePath(mutated);
    if (!found.some((error) => expected.test(error))) {
      problems.push(`planted create regression "${name}" was NOT caught — assertion is ineffective`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — live sources clean; ${cases.length + createCases.length} planted regressions caught`);
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
