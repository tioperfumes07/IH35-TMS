#!/usr/bin/env node
/**
 * Rule-17: Account Type Catalog nested +Create (Law §9 catalog chrome).
 * Accounting Account Type Catalog must scope to opco and offer + Create → Detail Type CRUD.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-account-type-catalog-create";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertAccountTypeCatalogCreate(sources) {
  const errors = [];
  const page = sources?.page ?? read("apps/frontend/src/pages/accounting/AccountTypeCatalogPage.tsx");
  const detailTypes = sources?.detailTypes ?? read("apps/frontend/src/pages/lists/accounting/DetailTypesListPage.tsx");

  if (!/useCompanyContext/.test(page)) {
    errors.push("AccountTypeCatalogPage: must use useCompanyContext for entity-scoped catalog");
  }
  if (!/getAccountTypeCatalog\(companyId/.test(page)) {
    errors.push("AccountTypeCatalogPage: must pass operating company to getAccountTypeCatalog");
  }
  if (!/\+ Create/.test(page) || !/\/lists\/accounting\/detail-types\?create=1/.test(page)) {
    errors.push("AccountTypeCatalogPage: must expose + Create linking to detail-types?create=1");
  }
  if (!/data-testid="account-type-catalog-create-detail-type"/.test(page)) {
    errors.push("AccountTypeCatalogPage: create affordance test id missing");
  }
  if (!/useSearchParams/.test(detailTypes) || !/searchParams\.get\("create"\)/.test(detailTypes)) {
    errors.push("DetailTypesListPage: must honor ?create=1 to open create modal");
  }
  return errors;
}

/**
 * Planted-regression selftest.
 *
 * The previous version compared two string literals defined inside this file and its condition was
 * INVERTED — `bad` matching the bad-pattern regex was treated as a FAILURE, so `--selftest` could
 * never pass and the step was permanently red. It also never touched the repo, so it could not have
 * proved anything even if the logic had been right.
 *
 * This version runs the REAL assertion against mutated copies of the REAL files: each case deletes
 * exactly the thing one assertion exists to require, and that assertion must fire.
 */
function selftest() {
  const problems = [];
  const live = {
    page: read("apps/frontend/src/pages/accounting/AccountTypeCatalogPage.tsx"),
    detailTypes: read("apps/frontend/src/pages/lists/accounting/DetailTypesListPage.tsx"),
  };

  const liveErrors = assertAccountTypeCatalogCreate(live);
  if (liveErrors.length) problems.push(`live sources rejected: ${liveErrors.join("; ")}`);

  const cases = [
    ["opco scope dropped", { ...live, page: live.page.replace(/getAccountTypeCatalog\(companyId/g, "getAccountTypeCatalog(") }, "must pass operating company"],
    ["create link dropped", { ...live, page: live.page.replace(/\/lists\/accounting\/detail-types\?create=1/g, "/lists/accounting/detail-types") }, "must expose + Create"],
    ["test id dropped", { ...live, page: live.page.replace(/data-testid="account-type-catalog-create-detail-type"/g, "") }, "test id missing"],
    ["?create=1 no longer honored", { ...live, detailTypes: live.detailTypes.replace(/searchParams\.get\("create"\)/g, 'searchParams.get("other")') }, "must honor ?create=1"],
  ];

  for (const [name, mutated, expectFragment] of cases) {
    if (mutated.page === live.page && mutated.detailTypes === live.detailTypes) {
      problems.push(`planted regression "${name}" did not mutate the source — the selftest is inert`);
      continue;
    }
    const found = assertAccountTypeCatalogCreate(mutated);
    if (!found.some((e) => e.includes(expectFragment))) {
      problems.push(`planted regression "${name}" was NOT caught — assertion is ineffective`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} --selftest FAIL`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — live sources clean; ${cases.length} planted regressions caught`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertAccountTypeCatalogCreate();
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
