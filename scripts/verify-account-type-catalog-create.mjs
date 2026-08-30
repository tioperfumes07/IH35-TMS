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

function honorsCreateQueryParam(src) {
  const directSearchParam =
    /useSearchParams/.test(src) && /searchParams\.get\("create"\)/.test(src);
  const sharedCreateHook =
    /\buseCreateQueryParam\s*\(\s*\{[\s\S]*?\bonOpenCreate\s*:/.test(src);
  return directSearchParam || sharedCreateHook;
}

/** LST-F3354 — NewAccountDrawerForm may embed AccountDrawer (single create chrome). */
function newFormEmbedsAccountDrawer(newFormSrc) {
  return (
    /<AccountDrawer[\s>]/.test(newFormSrc) &&
    (/from ["'].*AccountDrawer["']|from ["'].*\/AccountDrawer["']/.test(newFormSrc) ||
      /import\s*\{\s*AccountDrawer\s*\}/.test(newFormSrc))
  );
}


// COA-DETAIL-TYPE-VOCAB-MISMATCH — the CoA create must post a catalogs.account_types CODE, not the UI enum.
// The backend resolves account_type against catalogs.account_types.code|name; the picker's value is the
// 8-value QBO-style enum, of which only "Equity"/"Income" match by name — so choosing any detail type on the
// other six 400'd, and clearing it "succeeded" while silently writing detail_type_id=NULL. A guard on the
// enum→code MAP alone would have passed throughout: the map was already correct and already used to filter
// the dropdown. The defect was on the WRITE path, so that is what this asserts.
export function assertCoaCreateTranslatesAccountType(drawerSrc, label = "AccountDrawer.tsx") {
  const problems = [];
  const src = drawerSrc.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  // Whole-file assertions, deliberately not a window around one payload. The two callers build their
  // payload differently (AccountDrawer uses `const body = {…}`; the quick-create drawer inlines the object
  // into chartOfAccountsCatalogClient.create()), and an earlier windowed version anchored on the FormState
  // type declaration instead of the payload — passing or failing for the wrong reason depending on file
  // layout. These two checks hold regardless of shape.
  if (!/account_type:/.test(src)) {
    problems.push(label + ": no account_type anywhere — refusing to pass vacuously.");
    return problems;
  }
  if (/account_type:\s*form\.(account_type|accountType)\s*,/.test(src)) {
    problems.push(
      label +
        ": posts the raw UI enum (account_type: form.accountType). The backend matches " +
        "catalogs.account_types.code|name, so any detail type on Asset/Liability/Expense/COGS/OtherIncome/" +
        "OtherExpense 400s with detail_type_account_type_mismatch, and clearing it silently saves " +
        "detail_type_id=NULL (ACCT-F189 / COA-DETAIL-TYPE-VOCAB-MISMATCH). Translate at the boundary via " +
        "the resolved catalog entry's .code.",
    );
  }
  if (!/previewEntry\??\.code/.test(src)) {
    problems.push(
      label +
        ": no longer derives account_type from the resolved catalog entry (previewEntry.code). Asset and " +
        "Liability map to MANY codes (BANK|AR|OCA|FA|OA and CC|AP|OCL|LTL), so a flat enum->code map cannot " +
        "disambiguate them — only the chosen detail type's owning row can.",
    );
  }
  return problems;
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
  if (!honorsCreateQueryParam(detailTypes)) {
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
    ["?create=1 no longer honored", {
      ...live,
      detailTypes: live.detailTypes
        .replace(/\buseCreateQueryParam\s*\(/, "useIgnoredCreateQueryParam(")
        .replace(/searchParams\.get\("create"\)/g, 'searchParams.get("other")'),
    }, "must honor ?create=1"],
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

const newFormSrc = read("apps/frontend/src/components/parity/drawers/NewAccountDrawerForm.tsx");
const coaCreateChecks = [
  ...assertCoaCreateTranslatesAccountType(
    read("apps/frontend/src/pages/lists/accounting/AccountDrawer.tsx"),
    "AccountDrawer.tsx",
  ),
];
if (!newFormEmbedsAccountDrawer(newFormSrc)) {
  coaCreateChecks.push(
    ...assertCoaCreateTranslatesAccountType(newFormSrc, "NewAccountDrawerForm.tsx"),
  );
} else if (/accountTypePickerGroupsFromCatalog/.test(newFormSrc) && /useState/.test(newFormSrc)) {
  coaCreateChecks.push(
    "NewAccountDrawerForm must not own a parallel account-type form when embedding AccountDrawer",
  );
}

const errors = [...assertAccountTypeCatalogCreate(), ...coaCreateChecks];
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
