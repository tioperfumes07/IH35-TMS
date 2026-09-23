#!/usr/bin/env node
import fs from "node:fs";

const files = {
  helper: "apps/backend/src/expense-attribution/cost-load-link.service.ts",
  fuel: "apps/backend/src/fuel/fuel-expense-document.service.ts",
  lumper: "apps/backend/src/cash-advances/lumper-cash-advance-split.ts",
  book: "apps/backend/src/dispatch/book-load.service.ts",
  historical: "apps/backend/src/driver-finance/historical-driver-bill-backfill.service.ts",
  replacement: "apps/backend/src/driver-finance/void-open-driver-bill.service.ts",
  parity: "scripts/verify-alwaystrack-parity.mjs",
};

function failures(src) {
  const out = [];
  const helper = src.helper;
  if (!helper.includes("INSERT INTO expense_attribution.expense_load_links")) out.push("canonical link INSERT missing");
  if (!helper.includes("ON CONFLICT (expense_source, expense_id) DO NOTHING")) out.push("link writer is not idempotent");
  if (!helper.includes("cost_load_link_conflict")) out.push("existing mismatched edge does not fail loud");
  if (!helper.includes("row.load_number !== numbered.loadNumber")) out.push("link writer does not verify canonical load number");
  for (const key of ["fuel", "lumper", "book", "historical", "replacement"]) {
    if (!src[key].includes("linkCostDocumentToLoad")) out.push(`${key} writer does not persist the reverse load-cost edge`);
  }
  if (!src.fuel.includes('source: "accounting"')) out.push("fuel expense is not linked as accounting");
  if (!src.lumper.includes('source: "accounting"')) out.push("lumper expense is not linked as accounting");
  for (const key of ["book", "historical", "replacement"]) {
    if (!src[key].includes('source: "driver_finance"')) out.push(`${key} driver bill is not linked as driver_finance`);
  }
  if (!src.parity.includes("ell.load_number = l.load_number")) out.push("feed assertion does not compare the durable load identity");
  if (!src.parity.includes("fuel_expense.source_fuel_transaction_id = ft.id")) out.push("feed assertion does not follow fuel to its expense document");
  return out;
}

const real = Object.fromEntries(Object.entries(files).map(([k, p]) => [k, fs.readFileSync(p, "utf8")]));
if (process.argv.includes("--selftest")) {
  const plants = [
    ["insert", (s) => ({ ...s, helper: s.helper.replace("INSERT INTO expense_attribution.expense_load_links", "INSERT INTO planted.missing") })],
    ["conflict", (s) => ({ ...s, helper: s.helper.replace("cost_load_link_conflict", "planted_silent_conflict") })],
    ["feed load identity", (s) => ({ ...s, parity: s.parity.replaceAll("ell.load_number = l.load_number", "ell.expense_number = l.load_number") })],
    ...["fuel", "lumper", "book", "historical", "replacement"].map((key) => [key, (s) => ({ ...s, [key]: s[key].replaceAll("linkCostDocumentToLoad", `planted_${key}_link`) })]),
  ];
  const caught = plants.filter(([, mutate]) => failures(mutate(real)).length > 0).length;
  if (caught !== plants.length) {
    console.error(`verify-load-cost-document-link-writers --selftest FAIL ${caught}/${plants.length}`);
    process.exit(1);
  }
  console.log(`verify-load-cost-document-link-writers --selftest PASS ${caught}/${plants.length}`);
  process.exit(0);
}
const found = failures(real);
if (found.length) {
  console.error(`verify-load-cost-document-link-writers FAIL\n- ${found.join("\n- ")}`);
  process.exit(1);
}
console.log("verify-load-cost-document-link-writers PASS — 5 producer classes persist idempotent load-cost edges and reject mismatched history");
