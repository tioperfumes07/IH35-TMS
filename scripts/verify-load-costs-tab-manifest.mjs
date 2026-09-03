#!/usr/bin/env node
import fs from "node:fs";

const target = "apps/frontend/src/components/dispatch/LoadDetailCostsTab.tsx";
const source = fs.readFileSync(target, "utf8");
const REQUIRED_IDS = [
  "load-costs-tab-shell", "load-costs-save-all", "load-costs-add-top",
  "load-costs-add-bottom", "load-costs-receipt-photo", "load-costs-entry",
  "load-cost-toggle-expense", "load-cost-toggle-bill", "load-cost-field-date",
  "load-cost-field-vendor", "load-cost-field-category", "load-cost-field-paid-with",
  "load-cost-field-vendor-invoice", "load-cost-field-amount", "load-cost-status",
  "load-cost-hint", "load-costs-totals", "load-costs-bank-panel",
];

function verify(text) {
  const failures = [];
  for (const id of REQUIRED_IDS) {
    if (!text.includes(`data-testid="${id}"`) && !text.includes(`dataTestId="${id}"`)) failures.push(`missing manifest id: ${id}`);
  }
  for (const token of [
    "createExpense(", "createVendorBill(", "load_id: load.id",
    "Expense · paid now", "Bill · owed", "new — not saved", "saved · matched",
    "WHAT THE BANK WILL DO WITH THESE", "Vendor invoice no.",
    "You never type the number.", "Save all", "+ Add another cost",
  ]) if (!text.includes(token)) failures.push(`missing contract: ${token}`);
  if (text.includes('apiRequest("/api/v1/expenses"') || text.includes('apiRequest("/api/v1/accounting/bills"')) failures.push("forked write path");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ...REQUIRED_IDS.map((id) => source.replace(`data-testid="${id}"`, `data-testid="REMOVED-${id}"`).replace(`dataTestId="${id}"`, `dataTestId="REMOVED-${id}"`)),
    source.replace("createExpense(", "removedCreateExpense("),
    source.replace("createVendorBill(", "removedCreateVendorBill("),
    source.replaceAll("load_id: load.id", "load_id: undefined"),
  ];
  const escaped = mutations.filter((mutation) => verify(mutation).length === 0);
  if (escaped.length) {
    console.error(`FAIL verify-load-costs-tab-manifest --selftest: ${escaped.length} mutation(s) escaped`);
    process.exit(1);
  }
  console.log(`PASS verify-load-costs-tab-manifest --selftest: ${mutations.length}/${mutations.length} planted mutations caught`);
  process.exit(0);
}

const failures = verify(source);
if (failures.length) {
  console.error(`FAIL verify-load-costs-tab-manifest`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`PASS verify-load-costs-tab-manifest: ${REQUIRED_IDS.length}/${REQUIRED_IDS.length} ids + canonical writes`);
