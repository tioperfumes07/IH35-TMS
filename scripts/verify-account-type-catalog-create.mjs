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

function assertAccountTypeCatalogCreate() {
  const errors = [];
  const page = read("apps/frontend/src/pages/accounting/AccountTypeCatalogPage.tsx");
  const detailTypes = read("apps/frontend/src/pages/lists/accounting/DetailTypesListPage.tsx");

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

function selftest() {
  const good = `
    useCompanyContext();
    getAccountTypeCatalog(companyId || undefined);
    to="/lists/accounting/detail-types?create=1">+ Create</Link>
    data-testid="account-type-catalog-create-detail-type"
    useSearchParams(); searchParams.get("create")
  `;
  const bad = `getAccountTypeCatalog()`;
  if (!/getAccountTypeCatalog\(companyId/.test(good) || /getAccountTypeCatalog\(\)/.test(bad)) {
    console.error(`${LABEL} --selftest FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
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
