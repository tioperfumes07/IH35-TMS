#!/usr/bin/env node
/**
 * verify-banking-categorize-pickers.mjs — Banking Full Audit FAIL 28 (PICKER layer)
 *
 * Locks the live categorize drawer (BankingTransactionsDesignView expanded row) §4 picker matrix:
 *   Category (CoA) · Payee/Vendor · Customer/project · Class · Item (Products & Services)
 *
 * Each must use ReferenceSelect with the canonical createKind, entity-scoped catalog queries
 * (operating_company_id / getCoaAccounts(companyId)), onOptionCreated → refetch, and Post must
 * send the FK ids to categorizeBankTransaction. No QboCombobox/datalist on these five fields.
 *
 * Live TRANSP/USMCA browser matrix is documented in banking.md — this guard proves in-repo wiring.
 *
 * --selftest exercises evaluate() against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-banking-categorize-pickers";
const VIEW_REL = "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx";

/** Extract the expanded categorize panel block (Payee through Customer/project pickers). */
function extractCategorizePickerBlock(src) {
  const start = src.indexOf("Payee (vendor)");
  if (start === -1) return "";
  const end = src.indexOf("Customer/project", start);
  if (end === -1) return src.slice(start);
  // Include Customer/project picker through its closing label
  const afterCustomer = src.indexOf("</label>", src.indexOf("createKind=\"customer\"", end));
  return afterCustomer === -1 ? src.slice(start) : src.slice(start, afterCustomer + "</label>".length);
}

/**
 * @param {{ viewSrc: string }} input
 * @returns {string[]}
 */
export function evaluate({ viewSrc }) {
  const failures = [];
  const block = extractCategorizePickerBlock(viewSrc);

  const pickers = [
    {
      name: "Payee (vendor)",
      label: "Payee (vendor)",
      createKind: "vendor",
      queryKey: "vendorsQuery",
      postField: "vendor_id:",
      testid: 'data-testid="banking-categorize-picker-vendor"',
    },
    {
      name: "Category (Chart of Accounts)",
      label: "Category (Chart of Accounts)",
      createKind: "category",
      queryKey: "coaQuery",
      postField: "gl_account_id:",
      testid: 'data-testid="banking-categorize-picker-category"',
    },
    {
      name: "Class",
      label: "Class",
      createKind: "class",
      queryKey: "classesQuery",
      postField: "class_id:",
      testid: 'data-testid="banking-categorize-picker-class"',
    },
    {
      name: "Item (Products & Services)",
      label: "Item (Products",
      createKind: "service",
      queryKey: "itemsQuery",
      postField: "item_id:",
      testid: 'data-testid="banking-categorize-picker-item"',
    },
    {
      name: "Customer/project",
      label: "Customer/project",
      createKind: "customer",
      queryKey: "customersQuery",
      postField: "customer_id:",
      testid: 'data-testid="banking-categorize-picker-customer"',
    },
  ];

  if (!block.includes("ReferenceSelect")) {
    failures.push(`${VIEW_REL} — categorize panel missing ReferenceSelect pickers`);
    return failures;
  }

  for (const p of pickers) {
    const testidIdx = viewSrc.indexOf(p.testid);
    if (testidIdx === -1) {
      failures.push(`${VIEW_REL} — missing ${p.testid} (live matrix hook)`);
      continue;
    }
    const slice = viewSrc.slice(testidIdx, testidIdx + 2200);
    if (!viewSrc.includes(p.label === "Item (Products" ? "Item (Products" : p.label)) {
      failures.push(`${VIEW_REL} — missing "${p.name}" picker label`);
    }
    if (!slice.includes("ReferenceSelect")) {
      failures.push(`${VIEW_REL} — "${p.name}" must use ReferenceSelect (not SelectCombobox/QboCombobox)`);
    }
    if (!slice.includes(`createKind="${p.createKind}"`)) {
      failures.push(`${VIEW_REL} — "${p.name}" must use ReferenceSelect createKind="${p.createKind}"`);
    }
    if (!slice.includes("operatingCompanyId={companyId}")) {
      failures.push(`${VIEW_REL} — "${p.name}" must pass operatingCompanyId={companyId} (entity scope)`);
    }
    if (!slice.includes("onOptionCreated")) {
      failures.push(`${VIEW_REL} — "${p.name}" must refetch catalog on inline create (onOptionCreated)`);
    }
    if (!slice.includes(`${p.queryKey}.refetch`)) {
      failures.push(`${VIEW_REL} — "${p.name}" onOptionCreated must call ${p.queryKey}.refetch()`);
    }
    if (!viewSrc.includes(p.postField)) {
      failures.push(`${VIEW_REL} — categorizeBankTransaction payload must include ${p.postField}`);
    }
  }

  // Entity-scoped catalog queries (TRANSP/USMCA switcher → companyId)
  if (!/getCoaAccounts\(companyId\)/.test(viewSrc)) {
    failures.push(`${VIEW_REL} — coaQuery must call getCoaAccounts(companyId) for entity-scoped CoA`);
  }
  if (!/operating_company_id:\s*companyId/.test(viewSrc)) {
    failures.push(`${VIEW_REL} — vendor/customer catalog queries must pass operating_company_id: companyId`);
  }
  if (!/classesCatalogClient[\s\S]{0,200}operating_company_id:\s*companyId/.test(viewSrc)) {
    failures.push(`${VIEW_REL} — classesQuery must pass operating_company_id: companyId`);
  }
  if (!/itemsCatalogClient[\s\S]{0,200}operating_company_id:\s*companyId/.test(viewSrc)) {
    failures.push(`${VIEW_REL} — itemsQuery must pass operating_company_id: companyId`);
  }

  // No fake automation toggle for "Add new vendors" — must be honestly disabled until wired
  if (!viewSrc.includes('data-testid="banking-add-new-vendors-automation-not-wired"')) {
    failures.push(
      `${VIEW_REL} — "Add new vendors" automation toggle must be honestly marked not-wired (data-testid banking-add-new-vendors-automation-not-wired)`,
    );
  }
  if (/addNewVendors:\s*checked/.test(viewSrc) || /checked=\{viewSettings\.addNewVendors\}/.test(viewSrc)) {
    failures.push(`${VIEW_REL} — "Add new vendors" must not pretend to be a working automation toggle`);
  }

  // Vocab lock on categorize surface
  if (/\+\s*New\b/.test(viewSrc)) {
    failures.push(`${VIEW_REL} — contains "+ New" literal; inline create must be "+ Add new ___"`);
  }

  // CoA picker must not use bare SelectCombobox in categorize panel block
  const categorizeSection = viewSrc.slice(
    viewSrc.indexOf('draft.mode === "categorize"'),
    viewSrc.indexOf("Match candidates"),
  );
  if (/Payee \(vendor\)[\s\S]{0,2500}SelectCombobox/.test(categorizeSection)) {
    failures.push(`${VIEW_REL} — Payee/Category/Class/Item/Customer must not use SelectCombobox in categorize panel`);
  }

  return failures;
}

function readRepo(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function runSelftest() {
  const goodPicker = (kind, query, testid) =>
    `<label>${kind === "vendor" ? "Payee (vendor)" : kind === "category" ? "Category (Chart of Accounts)" : kind === "class" ? "Class" : kind === "service" ? "Item (Products & Services)" : "Customer/project"}
    <div ${testid}><ReferenceSelect createKind="${kind}" operatingCompanyId={companyId} onOptionCreated={() => void ${query}.refetch()} /></div></label>`;

  const goodView = `
    getCoaAccounts(companyId)
    operating_company_id: companyId
    classesCatalogClient.list({ operating_company_id: companyId
    itemsCatalogClient.list({ operating_company_id: companyId
    ${goodPicker("vendor", "vendorsQuery", 'data-testid="banking-categorize-picker-vendor"')}
    ${goodPicker("category", "coaQuery", 'data-testid="banking-categorize-picker-category"')}
    ${goodPicker("class", "classesQuery", 'data-testid="banking-categorize-picker-class"')}
    ${goodPicker("service", "itemsQuery", 'data-testid="banking-categorize-picker-item"')}
    ${goodPicker("customer", "customersQuery", 'data-testid="banking-categorize-picker-customer"')}
    vendor_id: draft.vendorId
    gl_account_id: draft.accountId
    class_id: draft.classId
    item_id: draft.itemId
    customer_id: draft.customerId
    data-testid="banking-add-new-vendors-automation-not-wired"
    draft.mode === "categorize"
    Match candidates
  `;

  const cases = [
    { name: "healthy wiring", input: goodView, expectPass: true },
    {
      name: "regression: vendor uses SelectCombobox",
      input: goodView.replace('createKind="vendor"', "SelectCombobox").replace("ReferenceSelect", "X"),
      expectPass: false,
    },
    {
      name: "regression: missing entity scope on CoA",
      input: goodView.replace("getCoaAccounts(companyId)", "getCoaAccounts()"),
      expectPass: false,
    },
    {
      name: "regression: fake add-new-vendors toggle",
      input: goodView.replace('data-testid="banking-add-new-vendors-automation-not-wired"', 'checked={viewSettings.addNewVendors}'),
      expectPass: false,
    },
  ];

  let ok = true;
  for (const c of cases) {
    const failures = evaluate({ viewSrc: c.input });
    const passed = failures.length === 0;
    if (passed !== c.expectPass) {
      ok = false;
      console.error(`  SELFTEST FAIL — ${c.name}: expected ${c.expectPass ? "pass" : "fail"}, got ${passed ? "pass" : "fail"}`);
      console.error(`    ${failures.join("; ")}`);
    } else {
      console.log(`  selftest ok — ${c.name}`);
    }
  }
  if (!ok) process.exit(1);
  console.log(`[${LABEL}] --selftest OK`);
}

function runReal() {
  const viewSrc = readRepo(VIEW_REL);
  const failures = evaluate({ viewSrc });
  if (failures.length > 0) {
    console.error(`[${LABEL}] FAIL:`);
    for (const message of failures) console.error(`  - ${message}`);
    process.exit(1);
  }
  console.log(
    `[${LABEL}] OK — categorize drawer Category/Vendor/Customer/Class/Item pickers wired (ReferenceSelect + entity scope + inline create + Post FKs)`,
  );
}

if (process.argv.includes("--selftest")) {
  runSelftest();
} else {
  runReal();
}
