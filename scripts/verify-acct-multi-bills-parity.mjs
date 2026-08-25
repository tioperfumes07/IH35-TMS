#!/usr/bin/env node
/**
 * Guard: Create Multiple Bills grid parity with VendorBillForm (Accounting full-audit 10/22).
 * Proves: due-date helper, Terms + auto due per row, A/P createKind=account + required,
 * separate expense line account (≠ A/P header), is_postable/deactivated_at filtering on both CoA
 * pickers, entity-scoped driver/unit pickers, unit_id on create.
 *
 * Self-test: node scripts/verify-acct-multi-bills-parity.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runExecutableGuard } from "./guard-executable-contract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-multi-bills-parity";

const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
};
const ok = (msg) => console.log(`OK: ${msg}`);

function read(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) fail(`missing ${rel}`);
  return fs.readFileSync(p, "utf8");
}

function checkMultiBillsParity(files) {
  const byRel = Object.fromEntries(files.map(({ rel, source }) => [rel, source]));
  const due = byRel["apps/frontend/src/components/accounting/vendorBillDueDate.ts"] ?? "";
  const page = byRel["apps/frontend/src/pages/accounting/CreateMultipleBillsPage.tsx"] ?? "";
  const violations = [];

  if (!due.includes("dueDateFromBillTerms") || !due.includes("netDaysFromTerms")) {
    violations.push("vendorBillDueDate helper missing exports");
  }

  if (!page.includes("dueDateFromBillTerms")) violations.push("CreateMultipleBillsPage must auto-calc due date");
  if (!page.includes("due_date_touched")) violations.push("CreateMultipleBillsPage must track manual due override per row");
  if (!page.includes('createKind="account"')) violations.push("A/P picker must use createKind=account (not category)");
  if (page.includes('createKind="category"')) violations.push("A/P picker must not use createKind=category");
  if (!page.includes("Missing A/P account") && !page.includes("A/P account is required")) {
    violations.push("CreateMultipleBillsPage must require coa_account_id");
  }
  if (!page.includes("expense_account_id")) {
    violations.push("CreateMultipleBillsPage must define expense_account_id separate from coa_account_id");
  }
  if (!page.includes("Expense account *")) {
    violations.push("CreateMultipleBillsPage must render expense account picker");
  }
  if (!page.includes("Missing expense account")) {
    violations.push("CreateMultipleBillsPage must require expense_account_id");
  }
  if (!page.includes("account_id: row.expense_account_id")) {
    violations.push("CreateMultipleBillsPage bill lines must use expense_account_id for account_id");
  }
  // Use word-boundary: naive includes("account_id: row.coa…") also matches coa_account_id: row.coa…
  if (/\baccount_id:\s*row\.coa_account_id\b/.test(page)) {
    violations.push("CreateMultipleBillsPage must not post bill line account_id from A/P header coa_account_id");
  }
  if (!page.includes("CostOfGoodsSold")) {
    violations.push("CreateMultipleBillsPage expense picker must include CostOfGoodsSold accounts");
  }
  // Non-postable Liability HEADER accounts (e.g. the "Driver Escrow" parent, is_postable=false) must
  // never reach either CoA picker. Requires the typed listCatalogAccounts row shape — getCoaAccounts
  // does not expose is_postable, so filtering on it there is a silent no-op.
  if (!page.includes("listCatalogAccounts")) {
    violations.push("CreateMultipleBillsPage must load the CoA via listCatalogAccounts (carries is_postable)");
  }
  const postableGuards = page.match(/if \(!acct\.is_postable\) return false;/g) ?? [];
  if (postableGuards.length < 2) {
    violations.push("CreateMultipleBillsPage A/P and expense pickers must both filter on is_postable");
  }
  const deactivatedGuards = page.match(/if \(acct\.deactivated_at\) return false;/g) ?? [];
  if (deactivatedGuards.length < 2) {
    violations.push("CreateMultipleBillsPage A/P and expense pickers must both filter out deactivated_at");
  }
  // Drivers may still be listDrivers or EntityPicker kind=driver (driver kind-sweep).
  if (!page.includes("listDrivers") && !/kind=["']driver["']/.test(page)) {
    violations.push("CreateMultipleBillsPage must load entity-scoped drivers (listDrivers or EntityPicker kind=driver)");
  }
  // EP-UNIT-KIND-SWEEP: units via EntityPicker kind=unit (no local listUnits roster).
  if (!page.includes("listUnits") && !/kind=["']unit["']/.test(page)) {
    violations.push("CreateMultipleBillsPage must load entity-scoped units (listUnits or EntityPicker kind=unit)");
  }
  if (!page.includes("unit_id")) violations.push("CreateMultipleBillsPage must pass unit_id to createVendorBill");
  if (!page.includes('data-testid="create-multiple-bills-page"')) {
    violations.push("CreateMultipleBillsPage missing data-testid");
  }
  if (!page.includes("getNextBillDocumentNumber")) {
    violations.push("CreateMultipleBillsPage must preview BILL-YYYY-##### via getNextBillDocumentNumber");
  }
  if (!page.includes('aria-label="Bill no."')) {
    violations.push("CreateMultipleBillsPage Bill no. must sit as a labeled right-side field (QBO chrome)");
  }
  if (!page.includes("allocateBillDocumentNumbers")) {
    violations.push("CreateMultipleBillsPage must allocate sequential Bill no. values per row");
  }

  return violations;
}

function loadRepositoryFixture() {
  return [
    {
      rel: "apps/frontend/src/components/accounting/vendorBillDueDate.ts",
      source: read("apps/frontend/src/components/accounting/vendorBillDueDate.ts"),
    },
    {
      rel: "apps/frontend/src/pages/accounting/CreateMultipleBillsPage.tsx",
      source: read("apps/frontend/src/pages/accounting/CreateMultipleBillsPage.tsx"),
    },
  ];
}

const goodFixture = [
  {
    rel: "apps/frontend/src/components/accounting/vendorBillDueDate.ts",
    source: [`export function dueDateFromBillTerms`, `export function netDaysFromTerms`].join("\n"),
  },
  {
    rel: "apps/frontend/src/pages/accounting/CreateMultipleBillsPage.tsx",
    source: [
      `dueDateFromBillTerms`,
      `due_date_touched`,
      `createKind="account"`,
      `Missing A/P account`,
      `expense_account_id`,
      `Expense account *`,
      `Missing expense account`,
      `CostOfGoodsSold`,
      `listCatalogAccounts`,
      `if (!acct.is_postable) return false;`,
      `if (acct.deactivated_at) return false;`,
      `if (!acct.is_postable) return false;`,
      `if (acct.deactivated_at) return false;`,
      `coa_account_id: row.coa_account_id`,
      `account_id: row.expense_account_id`,
      `listDrivers`,
      `listUnits`,
      `unit_id`,
      `data-testid="create-multiple-bills-page"`,
      `getNextBillDocumentNumber`,
      `aria-label="Bill no."`,
      `allocateBillDocumentNumbers`,
    ].join("\n"),
  },
];

const badFixture = [
  {
    rel: "apps/frontend/src/components/accounting/vendorBillDueDate.ts",
    source: ``,
  },
  {
    rel: "apps/frontend/src/pages/accounting/CreateMultipleBillsPage.tsx",
    source: [
      `createKind="category"`,
      `coa_account_id: row.coa_account_id`,
      `account_id: row.coa_account_id`,
    ].join("\n"),
  },
];

runExecutableGuard({
  label: LABEL,
  checker: checkMultiBillsParity,
  loadRepositoryFixture,
  goodFixture,
  badFixture,
  expectedBadViolationSubstrings: ["must not post bill line account_id from A/P header", "createKind=category"],
});

if (!process.argv.includes("--selftest")) {
  ok("due-date helper present");
  ok("CreateMultipleBillsPage VendorBillForm row parity");
  console.log("PASS: verify-acct-multi-bills-parity");
}
