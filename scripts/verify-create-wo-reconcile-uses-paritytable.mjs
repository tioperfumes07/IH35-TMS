#!/usr/bin/env node
/**
 * Locks the Create WO vendor-invoice reconcile grid onto shared ParityTable
 * while preserving its two-sided tie gate and editable invoice totals.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-create-wo-reconcile-uses-paritytable";
const PAGE =
  "apps/frontend/src/pages/maintenance/components/CreateWOSectionReconcile.tsx";
const REQUIRED_LABELS = ["WO total", "Invoice total", "Variance"];
const REQUIRED_TEST_IDS = [
  "wo-vendor-invoice-reconcile",
  "wo-vendor-invoice-reconcile-table",
  "invoice-parts-input",
  "invoice-labor-input",
  "reconcile-status-ok",
  "reconcile-status-blocked",
];

function assertMigrated(source) {
  const errors = [];

  if (
    !source.includes('from "../../../components/parity/ParityTable"') &&
    !source.includes("from '../../../components/parity/ParityTable'")
  ) {
    errors.push(`${PAGE}: must import shared ParityTable`);
  }
  if ((source.match(/<ParityTable\b/g) ?? []).length !== 1) {
    errors.push(`${PAGE}: expected exactly one <ParityTable>`);
  }
  for (const tag of ["table", "thead", "tbody", "tr", "th", "td"]) {
    if (new RegExp(`<${tag}[\\s>]`).test(source)) {
      errors.push(`${PAGE}: must not contain hand-rolled <${tag}> markup`);
    }
  }
  for (const label of REQUIRED_LABELS) {
    if (!source.includes(`label: "${label}"`)) {
      errors.push(`${PAGE}: missing preserved column label "${label}"`);
    }
  }
  for (const testId of REQUIRED_TEST_IDS) {
    if (!source.includes(testId)) {
      errors.push(`${PAGE}: missing preserved test id "${testId}"`);
    }
  }
  if (
    !source.includes("woPartsC - invPartsC") ||
    !source.includes("woLaborC - invLaborC") ||
    !source.includes("const tied = partsOk && laborOk")
  ) {
    errors.push(`${PAGE}: must preserve two-sided variance and tie-gate math`);
  }
  if (
    !source.includes("onInvoicePartsChange") ||
    !source.includes("onInvoiceLaborChange") ||
    !source.includes("row.onInvoiceChange(event.target.value)")
  ) {
    errors.push(`${PAGE}: must preserve both editable invoice-total callbacks`);
  }
  if (
    !source.includes(
      'storageKey="maintenance-create-wo-vendor-invoice-reconcile"',
    )
  ) {
    errors.push(`${PAGE}: must keep stable ParityTable storageKey`);
  }

  return errors;
}

function selftest() {
  const good = `
import { ParityTable } from "../../../components/parity/ParityTable";
const partsVar = woPartsC - invPartsC;
const laborVar = woLaborC - invLaborC;
const tied = partsOk && laborOk;
const onInvoicePartsChange = () => {};
const onInvoiceLaborChange = () => {};
const columns = [
  { label: "WO total" },
  { label: "Invoice total" },
  { label: "Variance" },
];
<section data-testid="wo-vendor-invoice-reconcile">
  <ParityTable
    storageKey="maintenance-create-wo-vendor-invoice-reconcile"
    tableTestId="wo-vendor-invoice-reconcile-table"
  />
  <input data-testid="invoice-parts-input" onChange={(event) => row.onInvoiceChange(event.target.value)} />
  <input data-testid="invoice-labor-input" />
  <div data-testid="reconcile-status-ok" />
  <div data-testid="reconcile-status-blocked" />
</section>;
`;
  const bad = `
const tied = true;
<table><thead><tr><th>WO total</th></tr></thead></table>;
`;

  const goodErrors = assertMigrated(good);
  if (goodErrors.length) {
    console.error(`${LABEL} --selftest FAIL good fixture:`);
    for (const error of goodErrors) console.error(`  - ${error}`);
    process.exit(1);
  }
  if (assertMigrated(bad).length < 6) {
    console.error(`${LABEL} --selftest FAIL bad fixture should fail hard`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const source = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const errors = assertMigrated(source);
  if (errors.length) {
    console.error(`${LABEL} FAIL`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} PASS: Create WO reconcile uses ParityTable with preserved columns, inputs, and tie gate.`,
  );
}

main();
